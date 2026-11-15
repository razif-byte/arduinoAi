import { SUPPORTED_BOARDS } from '../data/boardsAndComponents';
import type { BoardSpec, SerialDriverId, SerialDriverProfile } from '../types/studio';
import { validateHardwareCommand, type CommandValidationResult } from './serialProtocol';

export interface Stc8Timer1Timing {
  foscHz: number;
  baudRate: number;
  reloadValue: number;
  th1Hex: string;
  tl1Hex: string;
  actualBaud: number;
  errorPct: number;
}

export interface EncodedSerialFrame {
  driverId: SerialDriverId;
  driverName: string;
  canonicalCommand: string;
  wirePayload: string;
  bytes: Uint8Array;
  terminator: '\n' | '\r\n';
  framing: '8N1' | '8E1';
  warnings: string[];
  stcTiming?: Stc8Timer1Timing;
}

export interface PreparedSerialCommand {
  valid: boolean;
  reason?: string;
  validation: CommandValidationResult;
  frame?: EncodedSerialFrame;
  driver: SerialProtocolDriver;
}

export interface DecodedSerialMessage {
  kind: 'ack' | 'data' | 'err' | 'isp' | 'raw';
  raw: string;
  normalized: string;
  metrics?: Record<string, number>;
}

export interface WebSerialOpenOptions {
  baudRate: number;
  dataBits: 8;
  stopBits: 1;
  parity: 'none' | 'even';
  flowControl: 'none';
  dtrPulseOnConnect: boolean;
  requiresColdBoot: boolean;
}

export interface SerialProtocolDriver {
  readonly id: SerialDriverId;
  readonly profile: SerialDriverProfile;
  normalizeCommandInput(rawCommand: string, board: BoardSpec): {
    command: string;
    pinError?: string;
  };
  encodeFrame(canonicalCommand: string, baudRate: number, board: BoardSpec): EncodedSerialFrame;
  decodeLine(rawChunk: string): DecodedSerialMessage;
  getWebSerialOpenOptions(baudRate: number, ispMode?: boolean): WebSerialOpenOptions;
}

const STC8G1K08A_VALID_PINS = new Set([30, 31, 32, 33, 54, 55]);

const STC8_PIN_ALIAS_MAP: Record<string, number> = {
  'P3.0': 30,
  P30: 30,
  RXD: 30,
  'P3.1': 31,
  P31: 31,
  TXD: 31,
  'P3.2': 32,
  P32: 32,
  CCP0: 32,
  'P3.3': 33,
  P33: 33,
  CCP1: 33,
  'P5.4': 54,
  P54: 54,
  LED: 54,
  'P5.5': 55,
  P55: 55,
  ADC5: 55,
};

/**
 * Computes 1T 8051 Timer1 auto-reload register (TH1 / TL1) for STC8 series:
 *   Baud = Fosc / (4 * (256 - TH1))  =>  reload = 256 - round(Fosc / (4 * baud))
 */
export function calculateStc8Timer1Reload(baudRate: number, foscHz = 24_000_000): Stc8Timer1Timing {
  const safeBaud = Math.max(300, baudRate);
  const rawSteps = foscHz / (4 * safeBaud);
  const clampedSteps = Math.max(1, Math.min(255, Math.round(rawSteps)));
  const reloadValue = 256 - clampedSteps;
  const hex = `0x${reloadValue.toString(16).toUpperCase().padStart(2, '0')}`;
  const actualBaud = Math.round(foscHz / (4 * clampedSteps));
  const errorPct = Number((((actualBaud - safeBaud) / safeBaud) * 100).toFixed(2));
  return {
    foscHz,
    baudRate: safeBaud,
    reloadValue,
    th1Hex: hex,
    tl1Hex: hex,
    actualBaud,
    errorPct,
  };
}

function parseGenericMetrics(text: string): Record<string, number> | undefined {
  const metrics: Record<string, number> = {};
  const matches = text.matchAll(/\b(TEMP|HUM|V|ADC|ANGLE|DIST_CM|MOTOR_DUTY)\s*:\s*(-?\d+(?:\.\d+)?)/gi);
  for (const m of matches) {
    const num = Number(m[2]);
    if (Number.isFinite(num)) {
      metrics[m[1].toUpperCase()] = num;
    }
  }
  return Object.keys(metrics).length > 0 ? metrics : undefined;
}

export const ARDUINO_UART_DRIVER_PROFILE: SerialDriverProfile = {
  id: 'arduino-uart',
  name: 'Arduino Standard UART Driver',
  architectures: ['AVR', 'ESP32', 'ESP8266', 'RP2040', 'STM32'],
  uartFraming: '8N1',
  lineEnding: '\n',
  lineEndingLabel: 'LF (\\n)',
  dtrAutoReset: true,
  requiresColdBoot: false,
  bootloaderProtocol: 'STK500 / esptool / UF2 DTR-RTS Auto-Reset',
  defaultBaudRate: 115200,
  recommendedBaudRates: [9600, 57600, 115200, 230400, 460800, 921600],
  maxSafeBaudRate: 921600,
  electricalNotes:
    'Standard USB-UART bridge (CP210x / FT232 / native USB CDC) pulses DTR/RTS LOW on connect to enter bootloader or reset MCU cleanly.',
  driverDownloadUrl: 'https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers',
  boardDocsUrl: 'https://docs.arduino.cc/software/ide-v2/',
};

export const STC8_SERIAL_DRIVER_PROFILE: SerialDriverProfile = {
  id: 'stc8-c51',
  name: 'STC8 Series C51 Serial Driver',
  architectures: ['C51'],
  uartFraming: '8N1',
  lineEnding: '\r\n',
  lineEndingLabel: 'CRLF (\\r\\n)',
  dtrAutoReset: false,
  requiresColdBoot: true,
  bootloaderProtocol: 'STC-ISP v6.9x (0x7F Sync + Cold VCC Power-Cycle)',
  defaultBaudRate: 115200,
  recommendedBaudRates: [9600, 19200, 38400, 57600, 115200],
  maxSafeBaudRate: 230400,
  electricalNotes:
    'Requires CH340G/CP2102 TXD->P3.0 & RXD->P3.1 with 1N5819 Schottky diode on TXD. Do not assert DTR reset; cold-cycle VCC during STC-ISP handshake (8E1 ISP / 8N1 runtime).',
  driverDownloadUrl: 'https://www.wch-ic.com/downloads/CH341SER_EXE.html',
  boardDocsUrl: 'https://www.stcmcudata.com/',
};

class ArduinoUartDriver implements SerialProtocolDriver {
  readonly id = 'arduino-uart' as const;
  readonly profile = ARDUINO_UART_DRIVER_PROFILE;

  normalizeCommandInput(rawCommand: string): { command: string; pinError?: string } {
    const trimmed = rawCommand.trim().toUpperCase();
    const parts = trimmed.split(':');

    // Normalize aliases such as GPIO2 / D2 -> 2 for PIN:* and SERVO:SET:*
    if (
      (parts[0] === 'PIN' && (parts[1] === 'WRITE' || parts[1] === 'PWM' || parts[1] === 'MODE') && parts.length === 4) ||
      (parts[0] === 'SERVO' && parts[1] === 'SET' && parts.length === 4)
    ) {
      const pinMatch = parts[2].match(/^(?:GPIO|D|GP)?(\d+)$/);
      if (pinMatch) {
        parts[2] = pinMatch[1];
        return { command: parts.join(':') };
      }
    }
    return { command: trimmed };
  }

  encodeFrame(canonicalCommand: string, baudRate: number): EncodedSerialFrame {
    const wirePayload = `${canonicalCommand}\n`;
    const warnings: string[] = [];
    if (baudRate > this.profile.maxSafeBaudRate) {
      warnings.push(`Baud rate ${baudRate} exceeds standard UART maximum (${this.profile.maxSafeBaudRate}).`);
    }
    return {
      driverId: this.id,
      driverName: this.profile.name,
      canonicalCommand,
      wirePayload,
      bytes: new TextEncoder().encode(wirePayload),
      terminator: '\n',
      framing: '8N1',
      warnings,
    };
  }

  decodeLine(rawChunk: string): DecodedSerialMessage {
    const normalized = rawChunk.replace(/\r?\n$/, '').trim();
    const upper = normalized.toUpperCase();
    const kind = upper.startsWith('ACK:')
      ? 'ack'
      : upper.startsWith('DATA:')
      ? 'data'
      : upper.startsWith('ERR:')
      ? 'err'
      : 'raw';
    return {
      kind,
      raw: rawChunk,
      normalized,
      metrics: parseGenericMetrics(normalized),
    };
  }

  getWebSerialOpenOptions(baudRate: number): WebSerialOpenOptions {
    return {
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
      dtrPulseOnConnect: true,
      requiresColdBoot: false,
    };
  }
}

class Stc8SerialDriver implements SerialProtocolDriver {
  readonly id = 'stc8-c51' as const;
  readonly profile = STC8_SERIAL_DRIVER_PROFILE;

  normalizeCommandInput(rawCommand: string, board: BoardSpec): { command: string; pinError?: string } {
    const trimmed = rawCommand.trim().toUpperCase();
    const parts = trimmed.split(':');

    if (
      (parts[0] === 'PIN' && (parts[1] === 'WRITE' || parts[1] === 'PWM' || parts[1] === 'MODE') && parts.length === 4) ||
      (parts[0] === 'SERVO' && parts[1] === 'SET' && parts.length === 4)
    ) {
      const token = parts[2];
      const mapped = STC8_PIN_ALIAS_MAP[token] ?? (/^\d+$/.test(token) ? Number(token) : null);
      if (mapped === null) {
        return {
          command: trimmed,
          pinError: `Invalid ${board.name} pin '${token}'. Use P3.0–P3.3 (30–33) or P5.4–P5.5 (54–55).`,
        };
      }
      if (board.id === 'stc8g1k08a' && !STC8G1K08A_VALID_PINS.has(mapped)) {
        return {
          command: trimmed,
          pinError: `Pin ${mapped} is not bonded on ${board.name} SOP-8. Available pins: P3.0(30), P3.1(31), P3.2(32), P3.3(33), P5.4(54), P5.5(55).`,
        };
      }
      parts[2] = String(mapped);
      return { command: parts.join(':') };
    }

    return { command: trimmed };
  }

  encodeFrame(canonicalCommand: string, baudRate: number, board: BoardSpec): EncodedSerialFrame {
    const wirePayload = `${canonicalCommand}\r\n`;
    const foscHz = (board.clockMHz || 24) * 1_000_000;
    const stcTiming = calculateStc8Timer1Reload(baudRate, foscHz);
    const warnings: string[] = [];

    if (baudRate > this.profile.maxSafeBaudRate) {
      warnings.push(
        `STC8 internal IRC (${board.clockMHz} MHz) may drift at ${baudRate} baud; recommended max is ${this.profile.maxSafeBaudRate} baud.`
      );
    }
    if (Math.abs(stcTiming.errorPct) > 2.5) {
      warnings.push(
        `Timer1 1T baud error at ${baudRate} bps is ${stcTiming.errorPct}% (TH1=${stcTiming.th1Hex}); consider 115200 or 9600 baud.`
      );
    }

    return {
      driverId: this.id,
      driverName: this.profile.name,
      canonicalCommand,
      wirePayload,
      bytes: new TextEncoder().encode(wirePayload),
      terminator: '\r\n',
      framing: '8N1',
      warnings,
      stcTiming,
    };
  }

  decodeLine(rawChunk: string): DecodedSerialMessage {
    const normalized = rawChunk.replace(/\r?\n$/, '').trim();
    const upper = normalized.toUpperCase();
    const kind =
      upper.includes('STC-ISP') || upper.includes('0X7F') || upper.includes('STC8G')
        ? upper.startsWith('ACK:')
          ? 'ack'
          : 'isp'
        : upper.startsWith('ACK:')
        ? 'ack'
        : upper.startsWith('DATA:')
        ? 'data'
        : upper.startsWith('ERR:')
        ? 'err'
        : 'raw';
    return {
      kind,
      raw: rawChunk,
      normalized,
      metrics: parseGenericMetrics(normalized),
    };
  }

  getWebSerialOpenOptions(baudRate: number, ispMode = false): WebSerialOpenOptions {
    return {
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: ispMode ? 'even' : 'none',
      flowControl: 'none',
      dtrPulseOnConnect: false,
      requiresColdBoot: true,
    };
  }
}

const ARDUINO_DRIVER = new ArduinoUartDriver();
const STC8_DRIVER = new Stc8SerialDriver();

export function resolveBoardSpec(boardOrId: BoardSpec | string): BoardSpec {
  if (typeof boardOrId !== 'string') return boardOrId;
  return SUPPORTED_BOARDS.find((b) => b.id === boardOrId) ?? SUPPORTED_BOARDS[0];
}

export function resolveSerialDriver(boardOrId: BoardSpec | string): SerialProtocolDriver {
  const board = resolveBoardSpec(boardOrId);
  return board.architecture === 'C51' ? STC8_DRIVER : ARDUINO_DRIVER;
}

export function prepareSerialCommand(
  rawCommand: string,
  boardOrId: BoardSpec | string,
  baudRate = 115200
): PreparedSerialCommand {
  const board = resolveBoardSpec(boardOrId);
  const driver = resolveSerialDriver(board);
  const normalizedInput = driver.normalizeCommandInput(rawCommand, board);

  if (normalizedInput.pinError) {
    return {
      valid: false,
      reason: normalizedInput.pinError,
      validation: {
        valid: false,
        normalizedCommand: normalizedInput.command,
        reason: normalizedInput.pinError,
      },
      driver,
    };
  }

  const validation = validateHardwareCommand(normalizedInput.command);
  if (!validation.valid) {
    return {
      valid: false,
      reason: validation.reason,
      validation,
      driver,
    };
  }

  const frame = driver.encodeFrame(validation.normalizedCommand, baudRate, board);
  return {
    valid: true,
    validation,
    frame,
    driver,
  };
}

export function getDriverSummary(boardOrId: BoardSpec | string) {
  const driver = resolveSerialDriver(boardOrId);
  const p = driver.profile;
  return {
    id: p.id,
    name: p.name,
    uartFraming: p.uartFraming,
    lineEndingLabel: p.lineEndingLabel,
    bootloaderProtocol: p.bootloaderProtocol,
    dtrAutoReset: p.dtrAutoReset,
    requiresColdBoot: p.requiresColdBoot,
  };
}

export interface SerialTransportAdapter {
  mode: 'websocket-bridge' | 'webserial';
  sendRawBytes?: (bytes: Uint8Array) => Promise<void>;
  sendBridgeCommand?: (canonicalCommand: string) => Promise<{ ok: boolean; ack: string }>;
}

/**
 * Unified Serial Communication Service
 * Abstracts transport (WebSocket USB Bridge vs browser WebSerial) and delegates
 * protocol framing, pin normalization, and UART rules to the active board's driver.
 */
export class SerialCommunicationService {
  private activeWebSerialWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;

  bindWebSerialWriter(writer: WritableStreamDefaultWriter<Uint8Array> | null) {
    this.activeWebSerialWriter = writer;
  }

  getDriver(boardOrId: BoardSpec | string): SerialProtocolDriver {
    return resolveSerialDriver(boardOrId);
  }

  prepare(rawCommand: string, boardOrId: BoardSpec | string, baudRate: number): PreparedSerialCommand {
    return prepareSerialCommand(rawCommand, boardOrId, baudRate);
  }

  async sendCommand(
    rawCommand: string,
    opts: {
      boardOrId: BoardSpec | string;
      baudRate: number;
      mode: 'websocket-bridge' | 'webserial';
      bridgeDispatch: (canonicalCommand: string) => Promise<{ ok: boolean; ack: string }>;
    }
  ): Promise<{ ok: boolean; ack: string; frame?: EncodedSerialFrame; warnings: string[] }> {
    const prepared = this.prepare(rawCommand, opts.boardOrId, opts.baudRate);
    if (!prepared.valid || !prepared.frame) {
      return {
        ok: false,
        ack: `ERR:DRIVER:${prepared.reason ?? 'Command rejected'}`,
        warnings: [],
      };
    }

    if (opts.mode === 'webserial' && this.activeWebSerialWriter) {
      await this.activeWebSerialWriter.write(prepared.frame.bytes);
    }

    const res = await opts.bridgeDispatch(prepared.frame.canonicalCommand);
    return {
      ok: res.ok,
      ack: res.ack,
      frame: prepared.frame,
      warnings: prepared.frame.warnings,
    };
  }
}

export const serialCommunicationService = new SerialCommunicationService();
