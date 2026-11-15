import { useState } from 'react';
import { Cpu, ExternalLink, Send, Terminal, Usb } from 'lucide-react';
import {
  ALLOWED_BAUD_RATES,
  DRIVER_BOARD_LINKS,
  SUPPORTED_BOARDS,
} from '../data/boardsAndComponents';
import {
  calculateStc8Timer1Reload,
  resolveSerialDriver,
  serialCommunicationService,
} from '../logic/serialService';
import type { HardwareTelemetryState, SerialLogEntry } from '../types/studio';

interface SerialMonitorViewProps {
  telemetry: HardwareTelemetryState;
  logs: SerialLogEntry[];
  telemetryHistory: Array<{ t: string; temp: number; current: number; adc: number }>;
  onSendCommand: (cmd: string) => Promise<{ ok: boolean; ack: string }>;
  onUpdateConnection: (cfg: Partial<HardwareTelemetryState>) => Promise<void>;
}

export function SerialMonitorView({
  telemetry,
  logs,
  telemetryHistory,
  onSendCommand,
  onUpdateConnection,
}: SerialMonitorViewProps) {
  const [cmdInput, setCmdInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [webSerialStatus, setWebSerialStatus] = useState<string | null>(null);
  const [stcIspHandshake, setStcIspHandshake] = useState(false);

  const activeBoard = SUPPORTED_BOARDS.find((b) => b.id === telemetry.boardId) ?? SUPPORTED_BOARDS[0];
  const driver = resolveSerialDriver(activeBoard);
  const driverProfile = driver.profile;
  const isStc8 = driver.id === 'stc8-c51';
  const stcTiming = isStc8
    ? calculateStc8Timer1Reload(telemetry.baudRate, activeBoard.clockMHz * 1_000_000)
    : null;
  const boardLinks = DRIVER_BOARD_LINKS.filter(
    (link) => !link.boardIds || link.boardIds.includes(activeBoard.id)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmdInput.trim()) return;
    setErrorMsg(null);
    const res = await onSendCommand(cmdInput.trim());
    if (!res.ok) {
      setErrorMsg(res.ack);
    } else {
      setCmdInput('');
    }
  };

  const handleRequestWebSerial = async () => {
    const openOpts = driver.getWebSerialOpenOptions(telemetry.baudRate, isStc8 && stcIspHandshake);
    const nav = navigator as Navigator & {
      serial?: {
        requestPort: () => Promise<{
          open: (opts: {
            baudRate: number;
            dataBits?: 8;
            stopBits?: 1;
            parity?: 'none' | 'even';
            flowControl?: 'none';
          }) => Promise<void>;
          writable?: WritableStream<Uint8Array> | null;
          setSignals?: (signals: { dataTerminalReady?: boolean; requestToSend?: boolean }) => Promise<void>;
        }>;
      };
    };
    if (!nav.serial) {
      setWebSerialStatus(
        `WebSerial API is unavailable in this browser context; active ${driverProfile.name} (${openOpts.baudRate} ${isStc8 && stcIspHandshake ? '8E1' : '8N1'}) is routed through WebSocket USB bridge.`
      );
      return;
    }
    try {
      const port = await nav.serial.requestPort();
      await port.open({
        baudRate: openOpts.baudRate,
        dataBits: openOpts.dataBits,
        stopBits: openOpts.stopBits,
        parity: openOpts.parity,
        flowControl: openOpts.flowControl,
      });
      if (port.setSignals) {
        if (openOpts.dtrPulseOnConnect) {
          await port.setSignals({ dataTerminalReady: false, requestToSend: false });
          await new Promise((r) => setTimeout(r, 80));
          await port.setSignals({ dataTerminalReady: true, requestToSend: true });
        } else {
          await port.setSignals({ dataTerminalReady: false, requestToSend: false });
        }
      }
      if (port.writable) {
        serialCommunicationService.bindWebSerialWriter(port.writable.getWriter());
      }
      await onUpdateConnection({
        connectionMode: 'webserial',
        port: `WebSerial (${driverProfile.id})`,
        connected: true,
      });
      setWebSerialStatus(
        openOpts.requiresColdBoot
          ? `WebSerial port opened via ${driverProfile.name} (${openOpts.parity === 'even' ? '8E1 STC-ISP' : '8N1'}). Cold-cycle MCU VCC to trigger bootloader.`
          : `WebSerial port opened via ${driverProfile.name} (DTR auto-reset asserted).`
      );
    } catch (err) {
      setWebSerialStatus(err instanceof Error ? err.message : 'WebSerial port selection cancelled.');
    }
  };

  // Build SVG polyline points for Serial Plotter
  const makePolyline = (values: number[], min: number, max: number) => {
    if (values.length < 2) return '';
    return values
      .map((v, idx) => {
        const x = (idx / Math.max(1, values.length - 1)) * 600;
        const norm = (v - min) / Math.max(1, max - min);
        const y = 130 - Math.min(1, Math.max(0, norm)) * 110;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const presetCommands = isStc8
    ? ['SYS:PING', 'PIN:WRITE:P5.4:1', 'PIN:WRITE:P5.4:0', 'PIN:WRITE:P3.2:1']
    : ['SYS:PING', 'PIN:WRITE:2:1', 'PIN:WRITE:2:0', 'SENSOR:READ:ALL'];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Serial Monitor & Live Waveform Plotter
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Unified Serial Communication Service with dedicated Arduino UART and STC8 C51 driver layers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {isStc8 && (
            <button
              type="button"
              onClick={() => setStcIspHandshake((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border font-medium whitespace-nowrap transition-colors ${
                stcIspHandshake
                  ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              {stcIspHandshake ? 'STC-ISP Mode (8E1)' : 'Runtime UART1 (8N1)'}
            </button>
          )}

          <select
            aria-label="Serial baud rate"
            value={telemetry.baudRate}
            onChange={(e) => onUpdateConnection({ baudRate: Number(e.target.value) })}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
          >
            {ALLOWED_BAUD_RATES.map((b) => (
              <option key={b} value={b}>{b} baud</option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleRequestWebSerial}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Usb className="w-3.5 h-3.5" />
            Connect WebSerial
          </button>
        </div>
      </div>

      {/* Unified Serial Driver Layer Overview */}
      <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-sky-500 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Active Serial Driver: {driverProfile.name}
            </h2>
          </div>
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {activeBoard.name} · {driverProfile.id}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
            <div className="text-slate-500 dark:text-slate-400">UART Framing / Line End</div>
            <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
              {isStc8 && stcIspHandshake ? '8E1 (ISP)' : driverProfile.uartFraming} · {driverProfile.lineEndingLabel}
            </div>
          </div>

          <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
            <div className="text-slate-500 dark:text-slate-400">Reset / Bootloader</div>
            <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
              {driverProfile.dtrAutoReset ? 'DTR/RTS Auto-Reset' : 'Cold VCC Cycle (No DTR)'}
            </div>
          </div>

          <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
            <div className="text-slate-500 dark:text-slate-400">
              {isStc8 ? 'STC8 Timer1 1T Reload' : 'Physical UART Pins'}
            </div>
            <div className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {stcTiming
                ? `TH1/TL1=${stcTiming.th1Hex} (${stcTiming.errorPct}% err)`
                : `TX ${activeBoard.uartPins.tx} · RX ${activeBoard.uartPins.rx}`}
            </div>
          </div>

          <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
            <div className="text-slate-500 dark:text-slate-400">Driver & Board Links</div>
            <div className="mt-0.5 flex flex-wrap gap-2">
              {boardLinks.slice(0, 2).map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline font-medium truncate"
                >
                  <span>{link.boardOrChip.split('/')[0].trim()}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400">
          {driverProfile.electricalNotes}
          {stcTiming && telemetry.baudRate > driverProfile.maxSafeBaudRate
            ? ` Warning: ${telemetry.baudRate} baud exceeds ${driverProfile.maxSafeBaudRate} bps safe limit on ${activeBoard.clockMHz} MHz internal IRC.`
            : ''}
        </p>
      </div>

      {webSerialStatus && (
        <div className="p-3 rounded-lg border border-sky-500/30 bg-sky-500/10 text-xs text-sky-700 dark:text-sky-300">
          {webSerialStatus}
        </div>
      )}

      {/* Serial Plotter */}
      <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-900 dark:text-slate-100">Live Serial Plotter</span>
          <div className="flex items-center gap-4 font-mono tabular-nums">
            <span className="text-sky-500">Current ({telemetry.sensors.currentMa} mA)</span>
            <span className="text-emerald-500">Temp ({telemetry.sensors.temperatureC} °C)</span>
          </div>
        </div>
        <svg viewBox="0 0 600 140" className="w-full h-36 bg-slate-950 rounded-lg border border-slate-800">
          <line x1="0" y1="35" x2="600" y2="35" stroke="#1E293B" strokeDasharray="3 3" />
          <line x1="0" y1="70" x2="600" y2="70" stroke="#1E293B" strokeDasharray="3 3" />
          <line x1="0" y1="105" x2="600" y2="105" stroke="#1E293B" strokeDasharray="3 3" />
          <polyline
            fill="none"
            stroke="#0EA5E9"
            strokeWidth="2"
            points={makePolyline(telemetryHistory.map((h) => h.current), 50, 500)}
          />
          <polyline
            fill="none"
            stroke="#10B981"
            strokeWidth="2"
            points={makePolyline(telemetryHistory.map((h) => h.temp), 20, 35)}
          />
        </svg>
      </div>

      {/* Serial Console */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden flex flex-col h-[420px]">
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="inline-flex items-center gap-2 font-medium">
            <Terminal className="w-3.5 h-3.5 text-sky-500" />
            <span>{telemetry.port}</span>
            <span className="text-slate-400">·</span>
            <span className="font-mono text-slate-500 dark:text-slate-400">{driverProfile.lineEndingLabel}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presetCommands.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onSendCommand(preset)}
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 font-mono text-[11px] hover:border-sky-500"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-slate-950 font-mono text-xs space-y-1">
          {logs.length === 0 ? (
            <div className="text-slate-500">Waiting for serial frames...</div>
          ) : (
            logs.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2">
                <span className="text-slate-500 shrink-0 tabular-nums">{entry.timestamp.slice(11, 19)}</span>
                <span
                  className={`w-8 shrink-0 font-semibold ${
                    entry.direction === 'ERR'
                      ? 'text-rose-400'
                      : entry.direction === 'TX'
                      ? 'text-sky-400'
                      : entry.direction === 'RX'
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  {entry.direction}
                </span>
                <span className="text-slate-200 break-all">{entry.payload}</span>
              </div>
            ))
          )}
        </div>

        {errorMsg && (
          <div className="px-4 py-2 bg-rose-500/15 border-t border-rose-500/30 text-xs text-rose-400 font-mono">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-3 border-t border-slate-200 dark:border-slate-800 flex gap-2">
          <input
            type="text"
            aria-label="Serial command input"
            value={cmdInput}
            onChange={(e) => setCmdInput(e.target.value)}
            placeholder={
              isStc8
                ? 'Enter STC8 command (e.g. PIN:WRITE:P5.4:1, PIN:WRITE:32:0, SYS:PING)'
                : 'Enter allowlisted serial command (e.g. PIN:WRITE:2:1, RELAY:SET:1:ON, SYS:PING)'
            }
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-500 whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            Send Command
          </button>
        </form>
      </div>
    </div>
  );
}

