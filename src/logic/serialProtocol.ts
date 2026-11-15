import { BoardSpec, ProjectFile } from '../types/studio';

export interface CommandValidationResult {
  valid: boolean;
  normalizedCommand: string;
  actionType?: 'pin_write' | 'pin_pwm' | 'servo' | 'relay' | 'motor' | 'sensor' | 'system';
  pin?: number;
  value?: number | string;
  reason?: string;
}

const ALLOWED_SENSORS = new Set(['DHT22', 'BMP280', 'BME280', 'ADC', 'ALL']);

export function validateHardwareCommand(rawCommand: string): CommandValidationResult {
  const cmd = rawCommand.trim().toUpperCase();
  if (!cmd || cmd.length > 64) {
    return { valid: false, normalizedCommand: cmd, reason: 'Command is empty or exceeds 64 characters.' };
  }

  // Reject shell metacharacters or control sequences
  if (/[;&|`$<>\\\r\n]/.test(cmd)) {
    return { valid: false, normalizedCommand: cmd, reason: 'Unsafe characters rejected by serial allowlist.' };
  }

  const parts = cmd.split(':');

  // SYS:PING | SYS:INFO | SYS:RESET
  if (parts[0] === 'SYS' && parts.length === 2) {
    if (parts[1] === 'PING' || parts[1] === 'INFO' || parts[1] === 'RESET') {
      return { valid: true, normalizedCommand: cmd, actionType: 'system', value: parts[1] };
    }
    return { valid: false, normalizedCommand: cmd, reason: `Unsupported system command '${parts[1]}'.` };
  }

  // PIN:MODE:<pin>:<INPUT|OUTPUT|INPUT_PULLUP>
  if (parts[0] === 'PIN' && parts[1] === 'MODE' && parts.length === 4) {
    const pin = Number(parts[2]);
    if (!Number.isInteger(pin) || pin < 0 || pin > 63) {
      return { valid: false, normalizedCommand: cmd, reason: 'Pin index out of valid range (0-63).' };
    }
    if (!['INPUT', 'OUTPUT', 'INPUT_PULLUP'].includes(parts[3])) {
      return { valid: false, normalizedCommand: cmd, reason: 'Invalid pinMode value.' };
    }
    return { valid: true, normalizedCommand: cmd, actionType: 'pin_write', pin, value: parts[3] };
  }

  // PIN:WRITE:<pin>:<0|1>
  if (parts[0] === 'PIN' && parts[1] === 'WRITE' && parts.length === 4) {
    const pin = Number(parts[2]);
    const val = Number(parts[3]);
    if (!Number.isInteger(pin) || pin < 0 || pin > 63) {
      return { valid: false, normalizedCommand: cmd, reason: 'Pin index out of valid range (0-63).' };
    }
    if (val !== 0 && val !== 1) {
      return { valid: false, normalizedCommand: cmd, reason: 'Digital write value must be 0 or 1.' };
    }
    return { valid: true, normalizedCommand: cmd, actionType: 'pin_write', pin, value: val };
  }

  // PIN:PWM:<pin>:<0-255>
  if (parts[0] === 'PIN' && parts[1] === 'PWM' && parts.length === 4) {
    const pin = Number(parts[2]);
    const duty = Number(parts[3]);
    if (!Number.isInteger(pin) || pin < 0 || pin > 63) {
      return { valid: false, normalizedCommand: cmd, reason: 'Pin index out of valid range (0-63).' };
    }
    if (!Number.isInteger(duty) || duty < 0 || duty > 255) {
      return { valid: false, normalizedCommand: cmd, reason: 'PWM duty cycle must be an integer 0-255.' };
    }
    return { valid: true, normalizedCommand: cmd, actionType: 'pin_pwm', pin, value: duty };
  }

  // SERVO:SET:<pin>:<0-180>
  if (parts[0] === 'SERVO' && parts[1] === 'SET' && parts.length === 4) {
    const pin = Number(parts[2]);
    const angle = Number(parts[3]);
    if (!Number.isInteger(pin) || pin < 0 || pin > 63) {
      return { valid: false, normalizedCommand: cmd, reason: 'Servo pin index out of valid range (0-63).' };
    }
    if (!Number.isInteger(angle) || angle < 0 || angle > 180) {
      return { valid: false, normalizedCommand: cmd, reason: 'Servo angle must be an integer 0-180.' };
    }
    return { valid: true, normalizedCommand: cmd, actionType: 'servo', pin, value: angle };
  }

  // RELAY:SET:<channel>:<ON|OFF>
  if (parts[0] === 'RELAY' && parts[1] === 'SET' && parts.length === 4) {
    const channel = Number(parts[2]);
    if (!Number.isInteger(channel) || channel < 1 || channel > 8) {
      return { valid: false, normalizedCommand: cmd, reason: 'Relay channel must be 1-8.' };
    }
    if (parts[3] !== 'ON' && parts[3] !== 'OFF') {
      return { valid: false, normalizedCommand: cmd, reason: 'Relay state must be ON or OFF.' };
    }
    return { valid: true, normalizedCommand: cmd, actionType: 'relay', pin: channel, value: parts[3] };
  }

  // MOTOR:SPEED:<channel>:<0-255>
  if (parts[0] === 'MOTOR' && parts[1] === 'SPEED' && parts.length === 4) {
    const channel = Number(parts[2]);
    const speed = Number(parts[3]);
    if (!Number.isInteger(channel) || channel < 1 || channel > 4) {
      return { valid: false, normalizedCommand: cmd, reason: 'Motor channel must be 1-4.' };
    }
    if (!Number.isInteger(speed) || speed < 0 || speed > 255) {
      return { valid: false, normalizedCommand: cmd, reason: 'Motor speed must be 0-255.' };
    }
    return { valid: true, normalizedCommand: cmd, actionType: 'motor', pin: channel, value: speed };
  }

  // SENSOR:READ:<type>
  if (parts[0] === 'SENSOR' && parts[1] === 'READ' && parts.length === 3) {
    if (!ALLOWED_SENSORS.has(parts[2])) {
      return { valid: false, normalizedCommand: cmd, reason: `Unsupported sensor '${parts[2]}'.` };
    }
    return { valid: true, normalizedCommand: cmd, actionType: 'sensor', value: parts[2] };
  }

  // SENSOR:CALIBRATE:<type>:<offset>
  if (parts[0] === 'SENSOR' && parts[1] === 'CALIBRATE' && parts.length === 4) {
    const offset = Number(parts[3]);
    if (!ALLOWED_SENSORS.has(parts[2]) || !Number.isFinite(offset) || Math.abs(offset) > 50) {
      return { valid: false, normalizedCommand: cmd, reason: 'Invalid sensor calibration command or offset.' };
    }
    return { valid: true, normalizedCommand: cmd, actionType: 'sensor', value: `${parts[2]}:${offset}` };
  }

  return {
    valid: false,
    normalizedCommand: cmd,
    reason: 'Command does not match documented firmware protocol allowlist.',
  };
}

export interface CompilerDiagnostic {
  file: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface FirmwareAnalysisResult {
  success: boolean;
  diagnostics: CompilerDiagnostic[];
  detectedLibraries: string[];
  estimatedFlashBytes: number;
  estimatedSramBytes: number;
  flashPct: number;
  sramPct: number;
}

export function analyzeArduinoFirmware(
  files: ProjectFile[],
  board: BoardSpec,
  options?: { toolchainMode?: 'arduino-cli' | 'platformio' }
): FirmwareAnalysisResult {
  const diagnostics: CompilerDiagnostic[] = [];
  const libraries = new Set<string>();
  const isC51 = board.architecture === 'C51';
  const isPlatformIo = options?.toolchainMode === 'platformio' || files.some((f) => f.name === 'platformio.ini');
  const codeFiles = files.filter((f) => f.language !== 'ini' && f.language !== 'json' && f.language !== 'md');
  const entryFiles = isC51
    ? codeFiles.filter((f) => f.name.endsWith('.c') || f.name.endsWith('.ino'))
    : isPlatformIo
    ? codeFiles.filter((f) => f.name.endsWith('.ino') || f.name.endsWith('.cpp'))
    : codeFiles.filter((f) => f.name.endsWith('.ino'));

  if (entryFiles.length === 0) {
    diagnostics.push({
      file: codeFiles[0]?.name ?? (isC51 ? 'main.c' : isPlatformIo ? 'src/main.cpp' : 'sketch.ino'),
      line: 1,
      severity: 'error',
      message: isC51
        ? 'No .c C51 entry file found in project (expected main.c).'
        : isPlatformIo
        ? 'No .cpp or .ino entry file found in PlatformIO project.'
        : 'No .ino sketch entry file found in project.',
    });
  }

  let hasSetup = false;
  let hasLoop = false;
  let hasC51Main = false;
  let totalLines = 0;

  for (const file of codeFiles) {
    const lines = file.content.split('\n');
    totalLines += lines.length;

    // Brace balance check (ignoring strings and line comments)
    let braceDepth = 0;
    let parenDepth = 0;

    lines.forEach((rawLine, idx) => {
      const lineNum = idx + 1;
      const line = rawLine.replace(/\/\/.*$/, '');

      // Extract #include libraries
      const incMatch = line.match(/^\s*#include\s*[<"]([^>"]+)[>"]/);
      if (incMatch) {
        libraries.add(incMatch[1]);
      }

      if (/\bvoid\s+setup\s*\(/.test(line)) hasSetup = true;
      if (/\bvoid\s+loop\s*\(/.test(line)) hasLoop = true;
      if (/\b(void|int)\s+main\s*\(/.test(line)) hasC51Main = true;

      for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
        if (ch === '(') parenDepth++;
        if (ch === ')') parenDepth--;
        if (braceDepth < 0) {
          diagnostics.push({
            file: file.name,
            line: lineNum,
            severity: 'error',
            message: "Unexpected closing brace '}' without matching '{'.",
          });
          braceDepth = 0;
        }
      }

      // Check architecture-specific API mismatches
      if ((board.architecture === 'AVR' || isC51) && /WiFi\.h|ledcSetup|ledcAttach/.test(line)) {
        diagnostics.push({
          file: file.name,
          line: lineNum,
          severity: 'error',
          message: `ESP32 API used on ${board.architecture} target (${board.name}).`,
        });
      }
      if (isC51 && /\bSerial\.(begin|print|println)\b/.test(line)) {
        diagnostics.push({
          file: file.name,
          line: lineNum,
          severity: 'error',
          message: 'Arduino C++ Serial object is unsupported on C51 (8051). Use SBUF / UART1 SFR registers or uart_send_str().',
        });
      }
      if (board.architecture === 'ESP32' && /\banalogWrite\s*\(/.test(line)) {
        diagnostics.push({
          file: file.name,
          line: lineNum,
          severity: 'info',
          message: 'ESP32 Core v3 supports analogWrite(), or use ledcAttach() for explicit frequency/resolution control.',
        });
      }

      // Check missing semicolon on obvious statement lines
      const trimmed = line.trim();
      if (
        trimmed.length > 0 &&
        !trimmed.startsWith('#') &&
        !trimmed.startsWith('/*') &&
        !trimmed.startsWith('*') &&
        !trimmed.endsWith('{') &&
        !trimmed.endsWith('}') &&
        !trimmed.endsWith(';') &&
        !trimmed.endsWith(':') &&
        !trimmed.endsWith(',') &&
        !/^(if|else|for|while|switch|void|int|float|double|bool|char|String|const|struct|class)\b.*(\)|else)$/.test(trimmed) &&
        /\b(digitalWrite|pinMode|Serial\.|delay|analogWrite|myServo)\b/.test(trimmed)
      ) {
        diagnostics.push({
          file: file.name,
          line: lineNum,
          severity: 'error',
          message: "Expected ';' at end of statement.",
        });
      }
    });

    if (braceDepth > 0) {
      diagnostics.push({
        file: file.name,
        line: lines.length,
        severity: 'error',
        message: `Unclosed '{' — missing ${braceDepth} closing brace(s).`,
      });
    }
    if (parenDepth !== 0) {
      diagnostics.push({
        file: file.name,
        line: lines.length,
        severity: 'error',
        message: 'Unbalanced parentheses in file.',
      });
    }
  }

  if (isC51) {
    if (entryFiles.length > 0 && !hasC51Main) {
      diagnostics.push({
        file: entryFiles[0].name,
        line: 1,
        severity: 'error',
        message: "Missing required C51 entry point 'void main(void)'.",
      });
    }
  } else {
    if (entryFiles.length > 0 && !hasSetup) {
      diagnostics.push({
        file: entryFiles[0].name,
        line: 1,
        severity: 'error',
        message: "Missing required 'void setup()' entry point.",
      });
    }
    if (entryFiles.length > 0 && !hasLoop) {
      diagnostics.push({
        file: entryFiles[0].name,
        line: 1,
        severity: 'error',
        message: "Missing required 'void loop()' entry point.",
      });
    }
  }

  const baseFlash =
    board.architecture === 'ESP32'
      ? 238_400
      : board.architecture === 'RP2040'
      ? 48_200
      : isC51
      ? 320
      : 1_840;
  const libFlash = libraries.size * (board.architecture === 'ESP32' ? 68_000 : isC51 ? 380 : 2_400);
  const estimatedFlashBytes = Math.min(board.flashKB * 1024, baseFlash + libFlash + totalLines * (isC51 ? 14 : 42));

  const baseSram =
    board.architecture === 'ESP32'
      ? 38_400
      : board.architecture === 'RP2040'
      ? 12_800
      : isC51
      ? 48
      : 240;
  const estimatedSramBytes = Math.min(board.sramKB * 1024, baseSram + libraries.size * (isC51 ? 42 : 512) + totalLines * (isC51 ? 2 : 6));

  const hasErrors = diagnostics.some((d) => d.severity === 'error');

  return {
    success: !hasErrors,
    diagnostics,
    detectedLibraries: Array.from(libraries),
    estimatedFlashBytes,
    estimatedSramBytes,
    flashPct: Number(((estimatedFlashBytes / (board.flashKB * 1024)) * 100).toFixed(1)),
    sramPct: Number(((estimatedSramBytes / (board.sramKB * 1024)) * 100).toFixed(1)),
  };
}
