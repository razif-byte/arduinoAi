import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendSerialLog } from './db';
import { analyzeArduinoFirmware } from '../src/logic/serialProtocol';
import { resolvePlatformIoProfile, validatePlatformIoIni } from '../src/logic/platformioService';
import { getDriverSummary, prepareSerialCommand } from '../src/logic/serialService';
import { SUPPORTED_BOARDS } from '../src/data/boardsAndComponents';
import type { HardwareTelemetryState, ProjectFile, SerialLogEntry, ToolchainMode } from '../src/types/studio';

const execFileAsync = promisify(execFile);

export class HardwareBridge {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private state: HardwareTelemetryState = {
    connected: true,
    port: 'COM3 (USB-UART Bridge)',
    baudRate: 115200,
    boardId: 'esp32',
    connectionMode: 'websocket-bridge',
    driver: getDriverSummary('esp32'),
    gpioStates: {
      2: { mode: 'OUTPUT', value: 0 },
      4: { mode: 'INPUT', value: 1 },
      5: { mode: 'OUTPUT', value: 0 },
      13: { mode: 'OUTPUT', value: 0 },
      32: { mode: 'OUTPUT', value: 0 },
      54: { mode: 'OUTPUT', value: 0 },
    },
    relays: { 1: false, 2: false },
    servos: { 9: 90 },
    motors: { 1: 0 },
    sensors: {
      temperatureC: 26.4,
      humidityPct: 58.2,
      voltageV: 3.31,
      currentMa: 142,
      adcRaw: 2048,
      lastUpdated: new Date().toISOString(),
    },
    uptimeSec: 0,
  };
  private timer: NodeJS.Timeout | null = null;

  attach(server: Server) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      try {
        const reqUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        if (reqUrl.pathname !== '/ws/hardware') {
          return;
        }
      } catch {
        return;
      }

      this.wss?.handleUpgrade(req, socket, head, (ws) => {
        this.wss?.emit('connection', ws, req);
      });
    });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.send(JSON.stringify({ type: 'hardware:state', payload: this.state }));

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'hardware:command' && msg.authorized === true) {
            this.executeCommand(String(msg.command ?? ''), true);
          } else if (msg.type === 'hardware:config') {
            this.updateConnectionConfig(msg.payload ?? {});
          }
        } catch {
          // Ignore malformed frame
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });

    // Authoritative server telemetry heartbeat (2s interval when connected)
    this.timer = setInterval(() => {
      if (!this.state.connected) return;
      this.state.uptimeSec += 2;
      const driftTemp = Number((26.2 + Math.sin(this.state.uptimeSec * 0.12) * 0.8).toFixed(1));
      const driftHum = Number((58.0 + Math.cos(this.state.uptimeSec * 0.08) * 1.4).toFixed(1));
      const activeRelays = Object.values(this.state.relays).filter(Boolean).length;
      const activeMotor = this.state.motors[1] ?? 0;
      const currentMa = Math.round(125 + activeRelays * 70 + activeMotor * 1.4);
      const board = SUPPORTED_BOARDS.find((b) => b.id === this.state.boardId);
      const vNominal = board?.logicVoltage ?? 3.3;

      this.state.sensors = {
        temperatureC: driftTemp,
        humidityPct: driftHum,
        voltageV: Number((vNominal - (currentMa > 300 ? 0.04 : 0)).toFixed(2)),
        currentMa,
        adcRaw: Math.round(1950 + Math.sin(this.state.uptimeSec * 0.25) * 280),
        lastUpdated: new Date().toISOString(),
      };
      this.broadcast({ type: 'hardware:telemetry', payload: this.state });
    }, 2000);
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.wss?.close();
  }

  getState(): HardwareTelemetryState {
    return this.state;
  }

  updateConnectionConfig(cfg: Partial<Pick<HardwareTelemetryState, 'connected' | 'port' | 'baudRate' | 'boardId' | 'connectionMode'>>) {
    if (typeof cfg.connected === 'boolean') this.state.connected = cfg.connected;
    if (typeof cfg.port === 'string' && cfg.port.trim()) this.state.port = cfg.port.trim();
    if (typeof cfg.baudRate === 'number' && cfg.baudRate > 0) this.state.baudRate = cfg.baudRate;
    if (typeof cfg.boardId === 'string' && cfg.boardId.trim()) {
      this.state.boardId = cfg.boardId.trim();
      this.state.driver = getDriverSummary(this.state.boardId);
    }
    if (cfg.connectionMode === 'websocket-bridge' || cfg.connectionMode === 'webserial') {
      this.state.connectionMode = cfg.connectionMode;
    }

    const driverTag = this.state.driver ? ` [${this.state.driver.id} · ${this.state.driver.lineEndingLabel}]` : '';
    this.logEvent(
      'SYS',
      `Connection state: ${this.state.connected ? 'CONNECTED' : 'DISCONNECTED'} @ ${this.state.port} (${this.state.baudRate} baud)${driverTag}`,
      true
    );
    this.broadcast({ type: 'hardware:state', payload: this.state });
    return this.state;
  }

  executeCommand(rawCommand: string, authorized: boolean): { ok: boolean; ack: string; state: HardwareTelemetryState } {
    if (!authorized) {
      const msg = 'ERR:AUTHORIZATION_REQUIRED';
      this.logEvent('ERR', `Blocked unauthorized command: ${rawCommand}`, false);
      return { ok: false, ack: msg, state: this.state };
    }

    const prepared = prepareSerialCommand(rawCommand, this.state.boardId, this.state.baudRate);
    if (!prepared.valid || !prepared.frame) {
      const msg = `ERR:VALIDATION_FAILED:${prepared.reason ?? 'Command rejected'}`;
      this.logEvent('ERR', `${rawCommand} -> ${msg}`, false);
      return { ok: false, ack: msg, state: this.state };
    }

    if (!this.state.connected) {
      const msg = 'ERR:DEVICE_DISCONNECTED';
      this.logEvent('ERR', `${prepared.frame.canonicalCommand} -> ${msg}`, true);
      return { ok: false, ack: msg, state: this.state };
    }

    const cmd = prepared.frame.canonicalCommand;
    const timingHint = prepared.frame.stcTiming
      ? ` [STC8-UART1 CRLF TH1=${prepared.frame.stcTiming.th1Hex}]`
      : ' [UART LF]';
    this.logEvent('TX', `${cmd}${timingHint}`, true);

    if (prepared.frame.warnings.length > 0) {
      this.logEvent('SYS', `Driver Notice: ${prepared.frame.warnings.join(' ')}`, true);
    }

    const parts = cmd.split(':');
    let ack = `ACK:${cmd}`;

    if (parts[0] === 'PIN' && parts[1] === 'WRITE') {
      const pin = Number(parts[2]);
      const val = Number(parts[3]);
      this.state.gpioStates[pin] = { mode: 'OUTPUT', value: val };
    } else if (parts[0] === 'PIN' && parts[1] === 'PWM') {
      const pin = Number(parts[2]);
      const duty = Number(parts[3]);
      this.state.gpioStates[pin] = { mode: 'PWM', value: duty };
    } else if (parts[0] === 'PIN' && parts[1] === 'MODE') {
      const pin = Number(parts[2]);
      const mode = parts[3] === 'PWM' ? 'PWM' : parts[3] === 'OUTPUT' ? 'OUTPUT' : 'INPUT';
      this.state.gpioStates[pin] = { mode, value: this.state.gpioStates[pin]?.value ?? 0 };
    } else if (parts[0] === 'RELAY' && parts[1] === 'SET') {
      const ch = Number(parts[2]);
      this.state.relays[ch] = parts[3] === 'ON';
    } else if (parts[0] === 'SERVO' && parts[1] === 'SET') {
      const pin = Number(parts[2]);
      const angle = Number(parts[3]);
      this.state.servos[pin] = angle;
    } else if (parts[0] === 'MOTOR' && parts[1] === 'SPEED') {
      const ch = Number(parts[2]);
      const speed = Number(parts[3]);
      this.state.motors[ch] = speed;
    } else if (parts[0] === 'SENSOR' && parts[1] === 'READ') {
      ack = `DATA:TEMP:${this.state.sensors.temperatureC}:HUM:${this.state.sensors.humidityPct}:V:${this.state.sensors.voltageV}`;
    } else if (parts[0] === 'SYS' && parts[1] === 'PING') {
      ack = `ACK:SYS:PONG:${this.state.boardId.toUpperCase()}`;
    } else if (parts[0] === 'SYS' && parts[1] === 'RESET') {
      this.state.uptimeSec = 0;
      ack = `ACK:SYS:RESET_COMPLETE`;
    }

    this.logEvent('RX', ack, true);
    this.broadcast({ type: 'hardware:state', payload: this.state });
    return { ok: true, ack, state: this.state };
  }

  private logEvent(direction: SerialLogEntry['direction'], payload: string, authorized: boolean) {
    const entry: SerialLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      direction,
      port: this.state.port,
      baud: this.state.baudRate,
      payload,
      authorized,
    };
    appendSerialLog(entry);
    this.broadcast({ type: 'serial:log', payload: entry });
  }

  private broadcast(message: { type: string; payload: unknown }) {
    const serialized = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  }
}

export async function inspectHostEnvironment() {
  const checkCmd = async (cmd: string, args: string[]) => {
    try {
      const { stdout } = await execFileAsync(cmd, args, { timeout: 2500 });
      return { installed: true, version: stdout.trim().split('\n')[0] };
    } catch {
      return { installed: false, version: 'Not installed on host container' };
    }
  };

  const [python, arduinoCli, platformioCli, sdcc, stcgal] = await Promise.all([
    checkCmd('python3', ['--version']),
    checkCmd('arduino-cli', ['version']),
    checkCmd('pio', ['--version']),
    checkCmd('sdcc', ['--version']),
    checkCmd('stcgal', ['--version']),
  ]);

  const detectedLinuxPorts: Array<{ path: string; manufacturer: string; vidPid: string }> = [];
  if (process.platform === 'linux') {
    try {
      const devEntries = fs.readdirSync('/dev');
      for (const dev of devEntries) {
        if (/^tty(USB|ACM)\d+$/.test(dev)) {
          detectedLinuxPorts.push({
            path: `/dev/${dev} (Host Linux UART)`,
            manufacturer: dev.startsWith('ttyACM') ? 'USB CDC ACM Device' : 'USB-UART Bridge (CH340/CP210x)',
            vidPid: 'Linux /dev',
          });
        }
      }
    } catch {
      // /dev unreadable in restricted sandbox
    }
  }

  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    hostOs: process.platform === 'win32' ? ('windows11' as const) : ('ubuntu-studio' as const),
    python,
    arduinoCli,
    platformioCli,
    sdcc,
    stcgal,
    geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    serialPorts: [
      ...detectedLinuxPorts,
      { path: 'COM3 (USB-UART Bridge)', manufacturer: 'Silicon Labs CP210x', vidPid: '10C4:EA60' },
      { path: 'COM4 (Arduino Uno R3)', manufacturer: 'Arduino LLC', vidPid: '2341:0043' },
      { path: 'COM5 (CH340G STC-ISP C51)', manufacturer: 'WCH.CN CH340G USB-UART', vidPid: '1A86:7523' },
      { path: 'COM7 (ESP32-S3 USB JTAG)', manufacturer: 'Espressif Systems', vidPid: '303A:1001' },
      { path: '/dev/ttyUSB0 (Ubuntu CH340G/CP210x)', manufacturer: 'Linux USB-UART (dialout)', vidPid: '1A86:7523' },
      { path: '/dev/ttyACM0 (Ubuntu Arduino/Pico CDC)', manufacturer: 'Linux USB CDC ACM (dialout)', vidPid: '2341:0043' },
    ],
  };
}

export async function compileProjectFirmware(
  files: ProjectFile[],
  boardId: string,
  toolchainMode: ToolchainMode = 'arduino-cli'
) {
  const board = SUPPORTED_BOARDS.find((b) => b.id === boardId) ?? SUPPORTED_BOARDS[0];
  const isC51 = board.architecture === 'C51';
  const isPlatformIo = toolchainMode === 'platformio';
  const analysis = analyzeArduinoFirmware(files, board, { toolchainMode });
  const pioFile = files.find((f) => f.name === 'platformio.ini');
  const pioDiags = isPlatformIo && pioFile ? validatePlatformIoIni(pioFile.content) : [];
  const allDiagnostics = [...pioDiags, ...analysis.diagnostics];
  const success = allDiagnostics.every((d) => d.severity !== 'error');
  const pioProfile = resolvePlatformIoProfile(board.id);

  return {
    boardName: board.name,
    fqbn: isPlatformIo ? `pio:${pioProfile.platform}:${pioProfile.board}` : board.fqbn,
    toolchainMode,
    compilerBackend: isPlatformIo
      ? `PlatformIO Core (${pioProfile.platform} / ${pioProfile.framework})`
      : isC51
      ? 'Static SDCC / Keil C51 AST + 8051 Memory Profiler'
      : 'Static C++/Arduino AST + Memory Profiler',
    ...analysis,
    diagnostics: allDiagnostics,
    success,
    buildLog: isPlatformIo
      ? [
          `Processing ${pioProfile.envName} (platform: ${pioProfile.platform}; board: ${pioProfile.board}; framework: ${pioProfile.framework})`,
          `Verbose mode disabled. Inspecting ${files.length} project file(s)...`,
          `Library Dependency Finder (LDF): ${analysis.detectedLibraries.length ? analysis.detectedLibraries.join(', ') : isC51 ? 'STC8G.h' : 'Arduino.h'}`,
          ...allDiagnostics.map((d) => `[${d.severity.toUpperCase()}] ${d.file}:${d.line} — ${d.message}`),
          success
            ? `RAM:   [${'='.repeat(Math.max(1, Math.min(10, Math.round(analysis.sramPct / 10))))}${' '.repeat(Math.max(0, 10 - Math.max(1, Math.min(10, Math.round(analysis.sramPct / 10)))))}] ${analysis.sramPct}% (used ${analysis.estimatedSramBytes} bytes from ${Math.round(board.sramKB * 1024)} bytes)`
            : '',
          success
            ? `Flash: [${'='.repeat(Math.max(1, Math.min(10, Math.round(analysis.flashPct / 10))))}${' '.repeat(Math.max(0, 10 - Math.max(1, Math.min(10, Math.round(analysis.flashPct / 10)))))}] ${analysis.flashPct}% (used ${analysis.estimatedFlashBytes} bytes from ${board.flashKB * 1024} bytes)`
            : '',
          success
            ? `========================= [SUCCESS] PlatformIO build ready (${pioProfile.defaultUploadProtocol}) =========================`
            : '========================= [FAILED] PlatformIO build halted =========================',
        ].filter(Boolean)
      : [
          `Target: ${board.name} (${board.fqbn})`,
          `MCU: ${board.mcu} @ ${board.clockMHz} MHz (${isC51 ? '1T 8051 C51' : board.architecture})`,
          `Detected headers: ${analysis.detectedLibraries.length ? analysis.detectedLibraries.join(', ') : isC51 ? 'STC8G.h (C51 core)' : 'Arduino.h (core)'}`,
          ...allDiagnostics.map((d) => `[${d.severity.toUpperCase()}] ${d.file}:${d.line} — ${d.message}`),
          success
            ? `${isC51 ? 'ROM/Code' : 'Sketch'} uses ${analysis.estimatedFlashBytes} bytes (${analysis.flashPct}%) of program storage space (max ${board.flashKB * 1024} bytes).`
            : 'Compilation halted due to syntax or target compatibility errors.',
          success
            ? `${isC51 ? 'IRAM/XRAM' : 'Global variables'} use ${analysis.estimatedSramBytes} bytes (${analysis.sramPct}%) of dynamic memory (max ${Math.round(board.sramKB * 1024)} bytes).`
            : '',
        ].filter(Boolean),
  };
}
