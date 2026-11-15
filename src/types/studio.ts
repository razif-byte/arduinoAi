export type NavSection =
  | 'dashboard'
  | 'chat'
  | 'ide'
  | 'generator'
  | 'circuit'
  | 'lab'
  | 'monitor'
  | 'serial'
  | 'library'
  | 'settings';

export type LanguageCode = 'en' | 'ms';

export type GeminiModelId =
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'gemini-4-argon'
  | 'gemini-4-carbon';

export type ChatRolePreset =
  | 'architect'
  | 'debugger'
  | 'commander'
  | 'tutor';

export interface BoardSpec {
  id: string;
  name: string;
  fqbn: string;
  mcu: string;
  architecture: 'AVR' | 'C51' | 'ESP32' | 'ESP8266' | 'RP2040' | 'STM32';
  logicVoltage: 3.3 | 5.0;
  clockMHz: number;
  flashKB: number;
  sramKB: number;
  digitalPins: string[];
  analogPins: string[];
  pwmPins: string[];
  i2cPins: { sda: string; scl: string };
  spiPins: { mosi: string; miso: string; sck: string; ss: string };
  uartPins: { tx: string; rx: string };
  builtInLedPin: number;
  wifi: boolean;
  ble: boolean;
  pcbColor: string;
  description: string;
}

export interface ProjectFile {
  name: string;
  language: 'cpp' | 'c' | 'h' | 'ini' | 'json' | 'md';
  content: string;
}

export interface CircuitNode {
  id: string;
  type:
    | 'board'
    | 'led'
    | 'resistor'
    | 'dht22'
    | 'servo'
    | 'relay'
    | 'ultrasonic'
    | 'button'
    | 'potentiometer'
    | 'mosfet'
    | 'oled';
  label: string;
  x: number;
  y: number;
  props: Record<string, string | number | boolean>;
}

export interface CircuitWire {
  id: string;
  fromNodeId: string;
  fromPin: string;
  toNodeId: string;
  toPin: string;
  color: string;
  signalType: 'power' | 'ground' | 'digital' | 'analog' | 'pwm' | 'i2c' | 'uart';
}

export interface CircuitDiagram {
  boardId: string;
  nodes: CircuitNode[];
  wires: CircuitWire[];
}

export interface ArduinoProject {
  id: string;
  name: string;
  boardId: string;
  description: string;
  files: ProjectFile[];
  circuit: CircuitDiagram;
  libraries: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  label: string;
  files: ProjectFile[];
  createdAt: string;
}

export interface HardwareCommandProposal {
  id: string;
  command: string;
  targetBoardId: string;
  description: string;
  pin?: number;
  actionType: 'pin_write' | 'pin_pwm' | 'servo' | 'relay' | 'motor' | 'sensor' | 'system';
  requiresConfirmation: boolean;
  status: 'pending' | 'authorized' | 'rejected' | 'executed' | 'error';
  ackMessage?: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  commandProposals?: HardwareCommandProposal[];
  imageAttachment?: string;
  createdAt: string;
}

export interface SerialLogEntry {
  id: string;
  timestamp: string;
  direction: 'TX' | 'RX' | 'SYS' | 'ERR';
  port: string;
  baud: number;
  payload: string;
  authorized: boolean;
}

export type SerialDriverId = 'arduino-uart' | 'stc8-c51';

export interface SerialDriverProfile {
  id: SerialDriverId;
  name: string;
  architectures: BoardSpec['architecture'][];
  uartFraming: '8N1' | '8E1';
  lineEnding: '\n' | '\r\n';
  lineEndingLabel: 'LF (\\n)' | 'CRLF (\\r\\n)';
  dtrAutoReset: boolean;
  requiresColdBoot: boolean;
  bootloaderProtocol: string;
  defaultBaudRate: number;
  recommendedBaudRates: number[];
  maxSafeBaudRate: number;
  electricalNotes: string;
  driverDownloadUrl: string;
  boardDocsUrl: string;
}

export interface BoardPackageSource {
  id: string;
  name: string;
  url: string;
  boardId?: string;
  addedAt: string;
}

export interface MountedLibraryFolder {
  id: string;
  name: string;
  folderName: string;
  fileCount: number;
  headers: string[];
  addedAt: string;
}

export interface DriverBoardLink {
  id: string;
  boardOrChip: string;
  title: string;
  category: 'usb-driver' | 'board-core' | 'toolchain' | 'datasheet';
  url: string;
  notes: string;
  boardIds?: string[];
}

export type ToolchainMode = 'arduino-cli' | 'platformio';

export type TargetOsProfile = 'windows11' | 'ubuntu-studio';

export interface PlatformIoExtensionConfig {
  enabled: boolean;
  toolchainMode: ToolchainMode;
  targetOs: TargetOsProfile;
  uploadProtocol: 'auto' | 'esptool' | 'stcgal' | 'arduino' | 'picotool' | 'stlink';
  libLdfMode: 'chain' | 'deep' | 'chain+' | 'deep+';
  autoGenerateIni: boolean;
  pioCorePath: string;
  includeUdevSetup: boolean;
}

export interface HardwareTelemetryState {
  connected: boolean;
  port: string;
  baudRate: number;
  boardId: string;
  connectionMode: 'websocket-bridge' | 'webserial';
  driver?: {
    id: SerialDriverId;
    name: string;
    uartFraming: string;
    lineEndingLabel: string;
    bootloaderProtocol: string;
    dtrAutoReset: boolean;
    requiresColdBoot: boolean;
  };
  gpioStates: Record<number, { mode: 'INPUT' | 'OUTPUT' | 'PWM'; value: number }>;
  relays: Record<number, boolean>;
  servos: Record<number, number>;
  motors: Record<number, number>;
  sensors: {
    temperatureC: number;
    humidityPct: number;
    voltageV: number;
    currentMa: number;
    adcRaw: number;
    lastUpdated: string;
  };
  uptimeSec: number;
}

export interface ElectronicComponentSpec {
  id: string;
  name: string;
  category:
    | 'Microcontrollers'
    | 'Sensors'
    | 'Actuators'
    | 'Passive'
    | 'Semiconductors'
    | 'Displays'
    | 'Power';
  voltageRange: string;
  interfaceType: string;
  pins: { name: string; function: string }[];
  libraryName?: string;
  datasheetSummary: string;
  wiringNotes: string;
  sampleCode: string;
}

export interface GeneratedBlueprint {
  title: string;
  boardId: string;
  architecture: string;
  components: { name: string; quantity: number; specs: string; purpose: string }[];
  gpioAssignments: { pin: string; signal: string; component: string; notes: string }[];
  wiringSteps: string[];
  libraries: string[];
  files: ProjectFile[];
  installInstructions: string[];
  compileInstructions: string[];
  testingProcedures: string[];
  troubleshootingGuide: string[];
}
