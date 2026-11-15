import { SUPPORTED_BOARDS } from '../data/boardsAndComponents';
import type {
  ArduinoProject,
  BoardSpec,
  PlatformIoExtensionConfig,
  ProjectFile,
  TargetOsProfile,
} from '../types/studio';

export interface PlatformIoBoardProfile {
  boardId: string;
  envName: string;
  platform: string;
  board: string;
  framework: string;
  defaultUploadProtocol: string;
  buildFlags: string[];
  extraLines?: string[];
}

export const DEFAULT_PLATFORMIO_CONFIG: PlatformIoExtensionConfig = {
  enabled: true,
  toolchainMode: 'platformio',
  targetOs: 'windows11',
  uploadProtocol: 'auto',
  libLdfMode: 'chain+',
  autoGenerateIni: true,
  pioCorePath: 'pio',
  includeUdevSetup: true,
};

const PIO_BOARD_MAP: Record<string, PlatformIoBoardProfile> = {
  esp32: {
    boardId: 'esp32',
    envName: 'esp32doit-devkit-v1',
    platform: 'espressif32',
    board: 'esp32doit-devkit-v1',
    framework: 'arduino',
    defaultUploadProtocol: 'esptool',
    buildFlags: ['-DCORE_DEBUG_LEVEL=3'],
  },
  esp32s3: {
    boardId: 'esp32s3',
    envName: 'esp32-s3-devkitc-1',
    platform: 'espressif32',
    board: 'esp32-s3-devkitc-1',
    framework: 'arduino',
    defaultUploadProtocol: 'esptool',
    buildFlags: ['-DARDUINO_USB_CDC_ON_BOOT=1'],
  },
  uno: {
    boardId: 'uno',
    envName: 'uno',
    platform: 'atmelavr',
    board: 'uno',
    framework: 'arduino',
    defaultUploadProtocol: 'arduino',
    buildFlags: [],
  },
  mega: {
    boardId: 'mega',
    envName: 'megaatmega2560',
    platform: 'atmelavr',
    board: 'megaatmega2560',
    framework: 'arduino',
    defaultUploadProtocol: 'wiring',
    buildFlags: [],
  },
  nano: {
    boardId: 'nano',
    envName: 'nanoatmega328',
    platform: 'atmelavr',
    board: 'nanoatmega328',
    framework: 'arduino',
    defaultUploadProtocol: 'arduino',
    buildFlags: [],
  },
  leonardo: {
    boardId: 'leonardo',
    envName: 'leonardo',
    platform: 'atmelavr',
    board: 'leonardo',
    framework: 'arduino',
    defaultUploadProtocol: 'avr109',
    buildFlags: [],
  },
  due: {
    boardId: 'due',
    envName: 'due',
    platform: 'atmelsam',
    board: 'due',
    framework: 'arduino',
    defaultUploadProtocol: 'sam-ba',
    buildFlags: [],
  },
  esp8266: {
    boardId: 'esp8266',
    envName: 'nodemcuv2',
    platform: 'espressif8266',
    board: 'nodemcuv2',
    framework: 'arduino',
    defaultUploadProtocol: 'esptool',
    buildFlags: [],
  },
  pico: {
    boardId: 'pico',
    envName: 'rpipico',
    platform: 'https://github.com/maxgerhardt/platform-raspberrypi.git',
    board: 'rpipico',
    framework: 'arduino',
    defaultUploadProtocol: 'picotool',
    buildFlags: [],
    extraLines: ['board_build.core = earlephilhower'],
  },
  stm32: {
    boardId: 'stm32',
    envName: 'bluepill_f103c8',
    platform: 'ststm32',
    board: 'bluepill_f103c8',
    framework: 'arduino',
    defaultUploadProtocol: 'stlink',
    buildFlags: ['-DPIO_FRAMEWORK_ARDUINO_ENABLE_CDC'],
  },
  stc8g1k08a: {
    boardId: 'stc8g1k08a',
    envName: 'stc8g1k08a_c51',
    platform: 'intel_mcs51',
    board: 'stc89c52rc',
    framework: 'sdcc',
    defaultUploadProtocol: 'stcgal',
    buildFlags: ['-D__STC8G__', '-DMAIN_Fosc=24000000L'],
    extraLines: ['board_build.mcu = stc8g1k08a', 'board_build.f_cpu = 24000000L'],
  },
};

export function resolvePlatformIoProfile(boardId: string): PlatformIoBoardProfile {
  return PIO_BOARD_MAP[boardId] ?? PIO_BOARD_MAP.esp32;
}

export function getDefaultSerialPortForOs(boardId: string, targetOs: TargetOsProfile): string {
  if (targetOs === 'ubuntu-studio') {
    if (boardId === 'uno' || boardId === 'mega' || boardId === 'leonardo' || boardId === 'pico' || boardId === 'esp32s3') {
      return '/dev/ttyACM0';
    }
    return '/dev/ttyUSB0';
  }
  if (boardId === 'stc8g1k08a') return 'COM5';
  if (boardId === 'uno' || boardId === 'mega' || boardId === 'nano') return 'COM4';
  if (boardId === 'esp32s3') return 'COM7';
  return 'COM3';
}

export function normalizePortForOs(rawPort: string, boardId: string, targetOs: TargetOsProfile): string {
  const clean = rawPort.split(' ')[0].trim();
  if (!clean) return getDefaultSerialPortForOs(boardId, targetOs);
  if (targetOs === 'ubuntu-studio' && /^COM\d+$/i.test(clean)) {
    return getDefaultSerialPortForOs(boardId, 'ubuntu-studio');
  }
  if (targetOs === 'windows11' && clean.startsWith('/dev/')) {
    return getDefaultSerialPortForOs(boardId, 'windows11');
  }
  return clean;
}

function mapLibrariesToPlatformIoDeps(libraries: string[]): string[] {
  const libMap: Record<string, string> = {
    'DHT sensor library': 'adafruit/DHT sensor library@^1.4.6',
    ArduinoJson: 'bblanchon/ArduinoJson@^7.1.0',
    'Adafruit SSD1306': 'adafruit/Adafruit SSD1306@^2.5.11',
    'Adafruit BME280 Library': 'adafruit/Adafruit BME280 Library@^2.2.4',
    PubSubClient: 'knolleary/PubSubClient@^2.8',
    ESP32Servo: 'madhephaestus/ESP32Servo@^3.0.5',
    Servo: 'arduino-libraries/Servo@^1.2.2',
  };

  return libraries
    .filter((lib) => !/STC8G\.h|Wire|WiFi/i.test(lib))
    .map((lib) => libMap[lib] ?? lib);
}

export function generatePlatformIoIni(
  project: Pick<ArduinoProject, 'name' | 'boardId' | 'libraries'>,
  config: PlatformIoExtensionConfig,
  baudRate = 115200,
  port = ''
): string {
  const profile = resolvePlatformIoProfile(project.boardId);
  const uploadProtocol =
    config.uploadProtocol === 'auto' ? profile.defaultUploadProtocol : config.uploadProtocol;
  const resolvedPort = normalizePortForOs(port, project.boardId, config.targetOs);
  const deps = mapLibrariesToPlatformIoDeps(project.libraries);

  const lines: string[] = [
    `; PlatformIO Project Configuration File — ${project.name}`,
    `; Target OS Profile: ${config.targetOs === 'ubuntu-studio' ? 'Ubuntu Studio (Linux x64)' : 'Windows 11 (x64)'}`,
    `; Generated by Gemini Arduino AI Studio (PlatformIO Extension)`,
    '',
    '[platformio]',
    `default_envs = ${profile.envName}`,
    '',
    `[env:${profile.envName}]`,
    `platform = ${profile.platform}`,
    `board = ${profile.board}`,
    ...(profile.framework ? [`framework = ${profile.framework}`] : []),
    `monitor_speed = ${baudRate}`,
    `upload_protocol = ${uploadProtocol}`,
    `upload_port = ${resolvedPort}`,
    `monitor_port = ${resolvedPort}`,
    `lib_ldf_mode = ${config.libLdfMode}`,
  ];

  if (profile.extraLines?.length) {
    lines.push(...profile.extraLines);
  }

  if (profile.buildFlags.length > 0) {
    lines.push('build_flags =');
    for (const flag of profile.buildFlags) {
      lines.push(`    ${flag}`);
    }
  }

  if (deps.length > 0) {
    lines.push('lib_deps =');
    for (const dep of deps) {
      lines.push(`    ${dep}`);
    }
  }

  if (config.targetOs === 'ubuntu-studio' && config.includeUdevSetup) {
    lines.push(
      '',
      '; Ubuntu Studio USB Serial Permissions:',
      ';   sudo usermod -aG dialout,plugdev $USER',
      ';   sudo apt remove brltty   ; prevents CH340G /dev/ttyUSB0 hijack',
      ';   curl -fsSL https://raw.githubusercontent.com/platformio/platformio-core/develop/platformio/assets/system/99-platformio-udev.rules | sudo tee /etc/udev/rules.d/99-platformio-udev.rules'
    );
  }

  return `${lines.join('\n')}\n`;
}

export function validatePlatformIoIni(content: string): Array<{ file: string; line: number; severity: 'error' | 'warning'; message: string }> {
  const diags: Array<{ file: string; line: number; severity: 'error' | 'warning'; message: string }> = [];
  if (!/^\s*\[env:[^\]]+\]/m.test(content)) {
    diags.push({
      file: 'platformio.ini',
      line: 1,
      severity: 'error',
      message: 'Missing [env:<name>] environment section in platformio.ini.',
    });
  }
  if (!/^\s*platform\s*=\s*\S+/m.test(content)) {
    diags.push({
      file: 'platformio.ini',
      line: 1,
      severity: 'error',
      message: "Missing required 'platform =' key in platformio.ini.",
    });
  }
  if (!/^\s*board\s*=\s*\S+/m.test(content)) {
    diags.push({
      file: 'platformio.ini',
      line: 1,
      severity: 'error',
      message: "Missing required 'board =' key in platformio.ini.",
    });
  }
  return diags;
}

export function buildPlatformIoProjectFiles(
  project: ArduinoProject,
  config: PlatformIoExtensionConfig,
  baudRate = 115200,
  port = ''
): ProjectFile[] {
  const iniContent = generatePlatformIoIni(project, config, baudRate, port);
  const out: ProjectFile[] = [
    {
      name: 'platformio.ini',
      language: 'ini',
      content: iniContent,
    },
  ];

  for (const file of project.files) {
    if (file.name === 'platformio.ini') continue;
    if (file.name.endsWith('.h')) {
      out.push({
        ...file,
        name: file.name.startsWith('include/') ? file.name : `include/${file.name}`,
      });
    } else if (file.name.endsWith('.ino')) {
      const content = file.content.includes('#include <Arduino.h>')
        ? file.content
        : `#include <Arduino.h>\n\n${file.content}`;
      out.push({
        name: `src/${file.name.replace(/\.ino$/, '.cpp')}`,
        language: 'cpp',
        content,
      });
    } else {
      out.push({
        ...file,
        name: file.name.startsWith('src/') ? file.name : `src/${file.name}`,
      });
    }
  }

  return out;
}

export function getCrossOsSetupGuide(targetOs: TargetOsProfile, board: BoardSpec) {
  const profile = resolvePlatformIoProfile(board.id);
  const port = getDefaultSerialPortForOs(board.id, targetOs);

  if (targetOs === 'ubuntu-studio') {
    return {
      osLabel: 'Ubuntu Studio (Linux x64 / 22.04–24.04 LTS)',
      cliBinary: '~/.platformio/penv/bin/pio',
      defaultPort: port,
      commands: [
        'sudo apt update && sudo apt install -y python3-venv python3-pip',
        'sudo usermod -aG dialout,plugdev $USER',
        'sudo apt remove -y brltty   # Prevent CH340G /dev/ttyUSB0 conflict',
        'curl -fsSL https://raw.githubusercontent.com/platformio/platformio-core/develop/platformio/assets/system/99-platformio-udev.rules | sudo tee /etc/udev/rules.d/99-platformio-udev.rules',
        'sudo udevadm control --reload-rules && sudo udevadm trigger',
        `pio run -e ${profile.envName} --target upload --upload-port ${port}`,
      ],
      packagingCommand: 'npm run build && npx electron-builder --config electron-builder.json --linux',
      artifacts: ['AppImage (x64)', 'Debian .deb (x64)', 'Portable .tar.gz'],
    };
  }

  return {
    osLabel: 'Windows 11 (x64 Desktop)',
    cliBinary: '%USERPROFILE%\\.platformio\\penv\\Scripts\\pio.exe',
    defaultPort: port,
    commands: [
      'winget install Python.Python.3.12',
      'pip install -U platformio',
      `pio device list   # Verify ${port} (CH340G / CP210x / USB-CDC)`,
      `pio run -e ${profile.envName} --target upload --upload-port ${port}`,
    ],
    packagingCommand: 'npm run build && npx electron-builder --config electron-builder.json --win',
    artifacts: ['NSIS Installer (.exe)', 'Portable (.exe / .zip)'],
  };
}
