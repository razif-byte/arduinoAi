import { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  Activity,
  Bot,
  Calculator,
  Code2,
  Cpu,
  LayoutDashboard,
  Layers,
  Library,
  Menu,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  Sun,
  Terminal,
  Wand2,
  X,
} from 'lucide-react';
import {
  ALLOWED_BAUD_RATES,
  DEFAULT_BOARD_MANAGER_URLS,
  SUPPORTED_BOARDS,
} from './data/boardsAndComponents';
import { getDriverSummary, serialCommunicationService } from './logic/serialService';
import {
  buildPlatformIoProjectFiles,
  DEFAULT_PLATFORMIO_CONFIG,
  getDefaultSerialPortForOs,
} from './logic/platformioService';
import type {
  ArduinoProject,
  BoardPackageSource,
  HardwareTelemetryState,
  LanguageCode,
  MountedLibraryFolder,
  NavSection,
  PlatformIoExtensionConfig,
  SerialLogEntry,
} from './types/studio';
import { DashboardView } from './components/DashboardView';
import { GeminiChatPanel } from './components/GeminiChatPanel';
import { ArduinoIdeView } from './components/ArduinoIdeView';
import { ProjectGeneratorView } from './components/ProjectGeneratorView';
import { CircuitDesignerView } from './components/CircuitDesignerView';
import { ElectronicsLabView } from './components/ElectronicsLabView';
import { HardwareMonitorView } from './components/HardwareMonitorView';
import { SerialMonitorView } from './components/SerialMonitorView';
import { ComponentLibraryView } from './components/ComponentLibraryView';
import { SettingsView } from './components/SettingsView';

const DEFAULT_FALLBACK_PROJECT: ArduinoProject = {
  id: 'proj-fallback',
  name: 'ESP32 Smart Home Controller',
  boardId: 'esp32',
  description: 'Wi-Fi relay and telemetry sketch.',
  files: [
    {
      name: 'SmartHome.ino',
      language: 'cpp',
      content: 'void setup() {\n  Serial.begin(115200);\n  pinMode(2, OUTPUT);\n}\nvoid loop() {\n  digitalWrite(2, HIGH);\n  delay(500);\n  digitalWrite(2, LOW);\n  delay(500);\n}\n',
    },
  ],
  libraries: ['DHT sensor library'],
  circuit: {
    boardId: 'esp32',
    nodes: [{ id: 'n-board', type: 'board', label: 'ESP32 DevKit V1', x: 110, y: 120, props: {} }],
    wires: [],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export default function App() {
  const [nav, setNav] = useState<NavSection>('dashboard');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showRightChat, setShowRightChat] = useState(true);

  const [projects, setProjects] = useState<ArduinoProject[]>([DEFAULT_FALLBACK_PROJECT]);
  const [activeProjectId, setActiveProjectId] = useState<string>(DEFAULT_FALLBACK_PROJECT.id);
  const [serialLogs, setSerialLogs] = useState<SerialLogEntry[]>([]);
  const [telemetry, setTelemetry] = useState<HardwareTelemetryState>({
    connected: true,
    port: 'COM3 (USB-UART Bridge)',
    baudRate: 115200,
    boardId: 'esp32',
    connectionMode: 'websocket-bridge',
    driver: getDriverSummary('esp32'),
    gpioStates: { 2: { mode: 'OUTPUT', value: 0 } },
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
  });
  const [telemetryHistory, setTelemetryHistory] = useState<
    Array<{ t: string; temp: number; current: number; adc: number }>
  >([]);
  const [boardManagerUrls, setBoardManagerUrls] = useState<BoardPackageSource[]>(DEFAULT_BOARD_MANAGER_URLS);
  const [mountedLibraries, setMountedLibraries] = useState<MountedLibraryFolder[]>([]);
  const [pioConfig, setPioConfig] = useState<PlatformIoExtensionConfig>(DEFAULT_PLATFORMIO_CONFIG);
  const [envInfo, setEnvInfo] = useState<{
    nodeVersion: string;
    platform: string;
    arch: string;
    hostOs?: 'windows11' | 'ubuntu-studio';
    python: { installed: boolean; version: string };
    arduinoCli: { installed: boolean; version: string };
    platformioCli?: { installed: boolean; version: string };
    sdcc?: { installed: boolean; version: string };
    stcgal?: { installed: boolean; version: string };
    geminiKeyConfigured: boolean;
    serialPorts: Array<{ path: string; manufacturer: string; vidPid: string }>;
  } | null>(null);

  const saveTimerRef = useRef<number | null>(null);

  // Sync Tailwind dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  // Initial data hydration
  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((list: ArduinoProject[]) => {
        if (Array.isArray(list) && list.length > 0) {
          setProjects(list);
          setActiveProjectId(list[0].id);
        }
      })
      .catch(() => {});

    fetch('/api/hardware/state')
      .then((r) => r.json())
      .then((st) => {
        if (st && st.sensors) setTelemetry(st);
      })
      .catch(() => {});

    fetch('/api/hardware/logs')
      .then((r) => r.json())
      .then((logs) => {
        if (Array.isArray(logs)) setSerialLogs(logs);
      })
      .catch(() => {});

    fetch('/api/system/environment')
      .then((r) => r.json())
      .then((info) => setEnvInfo(info))
      .catch(() => {});

    fetch('/api/settings')
      .then((r) => r.json())
      .then((settings: Record<string, string>) => {
        if (settings?.boardManagerUrls) {
          try {
            const parsed = JSON.parse(settings.boardManagerUrls);
            if (Array.isArray(parsed) && parsed.length > 0) setBoardManagerUrls(parsed);
          } catch {
            // keep defaults
          }
        }
        if (settings?.mountedLibraries) {
          try {
            const parsed = JSON.parse(settings.mountedLibraries);
            if (Array.isArray(parsed)) setMountedLibraries(parsed);
          } catch {
            // ignore
          }
        }
        if (settings?.pioConfig) {
          try {
            const parsed = JSON.parse(settings.pioConfig);
            if (parsed && typeof parsed === 'object') {
              setPioConfig({ ...DEFAULT_PLATFORMIO_CONFIG, ...parsed });
            }
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {});
  }, []);

  // Live WebSocket hardware bridge
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/hardware`;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'hardware:state' || msg.type === 'hardware:telemetry') {
            const st = msg.payload as HardwareTelemetryState;
            setTelemetry(st);
            setTelemetryHistory((prev) => [
              ...prev.slice(-39),
              {
                t: st.sensors.lastUpdated,
                temp: st.sensors.temperatureC,
                current: st.sensors.currentMa,
                adc: st.sensors.adcRaw,
              },
            ]);
          } else if (msg.type === 'serial:log') {
            setSerialLogs((prev) => [...prev.slice(-149), msg.payload as SerialLogEntry]);
          }
        } catch {
          // Ignore invalid JSON frames
        }
      };
      ws.onclose = () => {
        if (!unmounted) {
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      };
    };

    connect();
    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? projects[0];

  const handleUpdateProject = async (updated: ArduinoProject) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).catch(() => {});
    }, 250);
  };

  const handleCreateProject = async () => {
    const now = new Date().toISOString();
    const isC51 = telemetry.boardId === 'stc8g1k08a';
    const created: ArduinoProject = {
      id: `proj-${Date.now()}`,
      name: isC51 ? `STC8G1K08A C51 Project ${projects.length + 1}` : `Arduino Project ${projects.length + 1}`,
      boardId: telemetry.boardId,
      description: isC51
        ? 'STC8G1K08A 1T 8051 (C51) firmware project.'
        : 'Custom microcontroller project.',
      files: isC51
        ? [
            {
              name: 'main.c',
              language: 'c',
              content: `#include <STC8G.h>\n\n#define MAIN_Fosc 24000000L\nsbit LED_P54 = P5^4;\n\nvoid delay_ms(unsigned int ms) {\n  unsigned int i, j;\n  for (i = 0; i < ms; i++)\n    for (j = 0; j < 2400; j++);\n}\n\nvoid main(void) {\n  P5M0 |= 0x10; // P5.4 push-pull\n  P5M1 &= ~0x10;\n  while (1) {\n    LED_P54 = 1;\n    delay_ms(500);\n    LED_P54 = 0;\n    delay_ms(500);\n  }\n}\n`,
            },
          ]
        : [
            {
              name: 'sketch.ino',
              language: 'cpp',
              content: `void setup() {\n  Serial.begin(${telemetry.baudRate});\n  pinMode(2, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(2, HIGH);\n  delay(500);\n  digitalWrite(2, LOW);\n  delay(500);\n}\n`,
            },
          ],
      libraries: isC51 ? ['STC8G.h (SDCC / Keil C51)'] : [],
      circuit: {
        boardId: telemetry.boardId,
        nodes: [
          {
            id: 'n-board',
            type: 'board',
            label: SUPPORTED_BOARDS.find((b) => b.id === telemetry.boardId)?.name ?? telemetry.boardId,
            x: 110,
            y: 120,
            props: {},
          },
        ],
        wires: [],
      },
      createdAt: now,
      updatedAt: now,
    };
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(created),
    });
    const saved = await res.json();
    setProjects((prev) => [saved, ...prev]);
    setActiveProjectId(saved.id);
    setNav('ide');
  };

  const handleExportProjectZip = async (proj: ArduinoProject) => {
    const zip = new JSZip();
    const folder = zip.folder(proj.name.replace(/[^a-zA-Z0-9_-]/g, '_'))!;
    const exportFiles =
      pioConfig.enabled && pioConfig.toolchainMode === 'platformio'
        ? buildPlatformIoProjectFiles(proj, pioConfig, telemetry.baudRate, telemetry.port)
        : proj.files;
    for (const f of exportFiles) {
      folder.file(f.name, f.content);
    }
    folder.file(
      'project.json',
      JSON.stringify(
        {
          name: proj.name,
          boardId: proj.boardId,
          toolchainMode: pioConfig.enabled ? pioConfig.toolchainMode : 'arduino-cli',
          targetOs: pioConfig.targetOs,
          libraries: proj.libraries,
          circuit: proj.circuit,
        },
        null,
        2
      )
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proj.name.replace(/\s+/g, '_')}${pioConfig.enabled && pioConfig.toolchainMode === 'platformio' ? '_pio' : ''}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const persistSetting = (key: string, value: unknown) => {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: JSON.stringify(value) }),
    }).catch(() => {});
  };

  const handleAddBoardUrl = (entry: Omit<BoardPackageSource, 'id' | 'addedAt'>) => {
    const cleanUrl = entry.url.trim();
    if (!cleanUrl) return;
    setBoardManagerUrls((prev) => {
      if (prev.some((item) => item.url.toLowerCase() === cleanUrl.toLowerCase())) return prev;
      const next: BoardPackageSource[] = [
        {
          id: `pkg-${Date.now()}`,
          name: entry.name.trim() || new URL(cleanUrl).hostname,
          url: cleanUrl,
          boardId: entry.boardId,
          addedAt: new Date().toISOString(),
        },
        ...prev,
      ];
      persistSetting('boardManagerUrls', next);
      return next;
    });
  };

  const handleRemoveBoardUrl = (id: string) => {
    setBoardManagerUrls((prev) => {
      const next = prev.filter((u) => u.id !== id);
      persistSetting('boardManagerUrls', next);
      return next;
    });
  };

  const handleAddMountedLibrary = (lib: Omit<MountedLibraryFolder, 'id' | 'addedAt'>) => {
    setMountedLibraries((prev) => {
      const filtered = prev.filter((item) => item.folderName !== lib.folderName);
      const next: MountedLibraryFolder[] = [
        {
          ...lib,
          id: `lib-${Date.now()}`,
          addedAt: new Date().toISOString(),
        },
        ...filtered,
      ];
      persistSetting('mountedLibraries', next);
      return next;
    });
  };

  const handleRemoveMountedLibrary = (id: string) => {
    setMountedLibraries((prev) => {
      const next = prev.filter((item) => item.id !== id);
      persistSetting('mountedLibraries', next);
      return next;
    });
  };

  const handleSendHardwareCommand = async (command: string): Promise<{ ok: boolean; ack: string }> => {
    const res = await serialCommunicationService.sendCommand(command, {
      boardOrId: telemetry.boardId,
      baudRate: telemetry.baudRate,
      mode: telemetry.connectionMode,
      bridgeDispatch: async (canonicalCommand) => {
        const response = await fetch('/api/hardware/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: canonicalCommand, authorized: true }),
        });
        const data = await response.json();
        return { ok: Boolean(data.ok), ack: String(data.ack ?? 'ERR') };
      },
    });
    return { ok: res.ok, ack: res.ack };
  };

  const handleUpdateConnection = async (cfg: Partial<HardwareTelemetryState>) => {
    const res = await fetch('/api/hardware/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    const data = await res.json();
    setTelemetry(data);
  };

  const handleUpdatePioConfig = (patch: Partial<PlatformIoExtensionConfig>) => {
    setPioConfig((prev) => {
      const next: PlatformIoExtensionConfig = { ...prev, ...patch };
      persistSetting('pioConfig', next);
      return next;
    });

    if (patch.targetOs) {
      const currentPort = telemetry.port;
      const needsPortSwitch =
        (patch.targetOs === 'ubuntu-studio' && /^COM\d+/i.test(currentPort)) ||
        (patch.targetOs === 'windows11' && currentPort.startsWith('/dev/'));
      if (needsPortSwitch) {
        const defaultPortPrefix = getDefaultSerialPortForOs(activeProject.boardId, patch.targetOs);
        const matchingOption = envInfo?.serialPorts.find((p) => p.path.startsWith(defaultPortPrefix))?.path;
        handleUpdateConnection({ port: matchingOption ?? defaultPortPrefix });
      }
    }
  };

  const handleInsertFirmware = (code: string, filename = 'GeneratedSketch.ino') => {
    const lang = filename.endsWith('.c') ? 'c' : filename.endsWith('.h') ? 'h' : 'cpp';
    const exists = activeProject.files.some((f) => f.name === filename);
    const nextFiles = exists
      ? activeProject.files.map((f) => (f.name === filename ? { ...f, content: code } : f))
      : [...activeProject.files, { name: filename, language: lang as 'cpp' | 'c' | 'h', content: code }];
    handleUpdateProject({ ...activeProject, files: nextFiles });
    setNav('ide');
  };

  const navItems: Array<{ id: NavSection; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'chat', label: 'Gemini AI Chat', icon: Bot },
    { id: 'ide', label: 'Arduino IDE', icon: Code2 },
    { id: 'generator', label: 'Project Generator', icon: Wand2 },
    { id: 'circuit', label: 'Circuit Designer', icon: Layers },
    { id: 'lab', label: 'Electronics Lab', icon: Calculator },
    { id: 'monitor', label: 'Hardware Monitor', icon: Activity },
    { id: 'serial', label: 'Serial Monitor', icon: Terminal },
    { id: 'library', label: 'Component Library', icon: Library },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const activeIno =
    activeProject.files.find((f) => f.name.endsWith('.ino') || f.name.endsWith('.c'))?.content ??
    activeProject.files[0]?.content;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100">
      {/* Top Hardware Connection Toolbar */}
      <header className="h-14 px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="lg:hidden p-1.5 rounded-md border border-slate-300 dark:border-slate-700"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
            <Cpu className="w-5 h-5 text-sky-500" />
            <span className="text-sm font-bold tracking-tight">Gemini Arduino AI Studio</span>
          </div>
        </div>

        {/* Hardware Connection Controls */}
        <div className="hidden md:flex items-center gap-2 text-xs">
          <select
            aria-label="Target microcontroller board"
            value={activeProject.boardId}
            onChange={(e) => {
              const bId = e.target.value;
              handleUpdateProject({ ...activeProject, boardId: bId });
              handleUpdateConnection({ boardId: bId });
            }}
            className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
          >
            {SUPPORTED_BOARDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Serial COM port"
            value={telemetry.port}
            onChange={(e) => handleUpdateConnection({ port: e.target.value })}
            className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
          >
            {(envInfo?.serialPorts ?? [{ path: 'COM3 (USB-UART Bridge)' }]).map((p) => (
              <option key={p.path} value={p.path}>
                {p.path}
              </option>
            ))}
          </select>

          <select
            aria-label="Baud rate"
            value={telemetry.baudRate}
            onChange={(e) => handleUpdateConnection({ baudRate: Number(e.target.value) })}
            className="px-2 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
          >
            {ALLOWED_BAUD_RATES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => handleUpdateConnection({ connected: !telemetry.connected })}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              telemetry.connected
                ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {telemetry.connected ? 'Port Connected' : 'Connect Port'}
          </button>
        </div>

        {/* Right Controls: Language, Theme, AI Assistant Drawer */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setLanguage((l) => (l === 'en' ? 'ms' : 'en'))}
            aria-label="Switch language between English and Bahasa Melayu"
            className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-mono font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {language === 'en' ? 'EN' : 'BM'}
          </button>

          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="p-1.5 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {nav !== 'chat' && (
            <button
              type="button"
              onClick={() => setShowRightChat((v) => !v)}
              aria-label="Toggle Gemini AI Assistant panel"
              className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-600 text-white text-xs font-medium hover:bg-sky-500 whitespace-nowrap"
            >
              {showRightChat ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
              AI Assistant
            </button>
          )}
        </div>
      </header>

      {/* Main Workstation Body */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left Navigation Sidebar */}
        <nav
          aria-label="Primary navigation"
          className={`${
            mobileMenuOpen ? 'fixed inset-y-14 left-0 z-40 block' : 'hidden'
          } lg:block w-56 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3 overflow-y-auto shrink-0`}
        >
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = nav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setNav(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Central Content Viewport */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {nav === 'dashboard' && (
            <DashboardView
              projects={projects}
              activeProject={activeProject}
              telemetry={telemetry}
              language={language}
              envInfo={envInfo}
              onSelectProject={(id) => setActiveProjectId(id)}
              onCreateProject={handleCreateProject}
              onExportProjectZip={handleExportProjectZip}
              onNavigate={setNav}
            />
          )}

          {nav === 'chat' && (
            <div className="h-full">
              <GeminiChatPanel
                boardId={activeProject.boardId}
                language={language}
                activeCode={activeIno}
                onAuthorizeCommand={handleSendHardwareCommand}
                onInsertFirmware={handleInsertFirmware}
              />
            </div>
          )}

          {nav === 'ide' && (
            <ArduinoIdeView
              project={activeProject}
              theme={theme}
              telemetry={telemetry}
              serialLogs={serialLogs}
              boardManagerUrls={boardManagerUrls}
              mountedLibraries={mountedLibraries}
              pioConfig={pioConfig}
              onUpdatePioConfig={handleUpdatePioConfig}
              onAddBoardUrl={handleAddBoardUrl}
              onRemoveBoardUrl={handleRemoveBoardUrl}
              onAddMountedLibrary={handleAddMountedLibrary}
              onRemoveMountedLibrary={handleRemoveMountedLibrary}
              onUpdateProject={handleUpdateProject}
              onExportZip={handleExportProjectZip}
              onSendSerial={handleSendHardwareCommand}
            />
          )}

          {nav === 'generator' && (
            <ProjectGeneratorView
              boardId={activeProject.boardId}
              language={language}
              onSaveAndOpenProject={async (newProj) => {
                const res = await fetch('/api/projects', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(newProj),
                });
                const saved = await res.json();
                setProjects((prev) => [saved, ...prev]);
                setActiveProjectId(saved.id);
                setNav('ide');
              }}
            />
          )}

          {nav === 'circuit' && (
            <CircuitDesignerView
              project={activeProject}
              telemetry={telemetry}
              language={language}
              onUpdateProject={handleUpdateProject}
            />
          )}

          {nav === 'lab' && <ElectronicsLabView boardId={activeProject.boardId} />}

          {nav === 'monitor' && (
            <HardwareMonitorView
              telemetry={telemetry}
              onSendCommand={handleSendHardwareCommand}
            />
          )}

          {nav === 'serial' && (
            <SerialMonitorView
              telemetry={telemetry}
              logs={serialLogs}
              telemetryHistory={telemetryHistory}
              onSendCommand={handleSendHardwareCommand}
              onUpdateConnection={handleUpdateConnection}
            />
          )}

          {nav === 'library' && (
            <ComponentLibraryView
              onLoadSampleCode={(code, filename) => handleInsertFirmware(code, filename)}
            />
          )}

          {nav === 'settings' && (
            <SettingsView
              theme={theme}
              language={language}
              envInfo={envInfo}
              boardManagerUrls={boardManagerUrls}
              mountedLibraries={mountedLibraries}
              pioConfig={pioConfig}
              onUpdatePioConfig={handleUpdatePioConfig}
              onAddBoardUrl={handleAddBoardUrl}
              onRemoveBoardUrl={handleRemoveBoardUrl}
              onAddMountedLibrary={handleAddMountedLibrary}
              onRemoveMountedLibrary={handleRemoveMountedLibrary}
              onToggleTheme={setTheme}
              onChangeLanguage={setLanguage}
            />
          )}
        </main>

        {/* Collapsible Right Gemini AI Chatbot Drawer */}
        {showRightChat && nav !== 'chat' && (
          <aside className="hidden xl:flex w-96 border-l border-slate-200 dark:border-slate-800 flex-col shrink-0">
            <GeminiChatPanel
              boardId={activeProject.boardId}
              language={language}
              activeCode={activeIno}
              compactDrawer
              onAuthorizeCommand={handleSendHardwareCommand}
              onInsertFirmware={handleInsertFirmware}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
