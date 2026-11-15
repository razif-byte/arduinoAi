import { Cpu, Download, FolderPlus, Layers, Play, Terminal, Zap } from 'lucide-react';
import { SUPPORTED_BOARDS } from '../data/boardsAndComponents';
import type { ArduinoProject, HardwareTelemetryState, LanguageCode, NavSection } from '../types/studio';

interface DashboardViewProps {
  projects: ArduinoProject[];
  activeProject: ArduinoProject;
  telemetry: HardwareTelemetryState;
  language: LanguageCode;
  envInfo: {
    nodeVersion: string;
    python: { installed: boolean; version: string };
    arduinoCli: { installed: boolean; version: string };
    geminiKeyConfigured: boolean;
  } | null;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onExportProjectZip: (project: ArduinoProject) => void;
  onNavigate: (section: NavSection) => void;
}

export function DashboardView({
  projects,
  activeProject,
  telemetry,
  language,
  envInfo,
  onSelectProject,
  onCreateProject,
  onExportProjectZip,
  onNavigate,
}: DashboardViewProps) {
  const activeBoard = SUPPORTED_BOARDS.find((b) => b.id === activeProject.boardId) ?? SUPPORTED_BOARDS[0];
  const activeGpioCount = Object.values(telemetry.gpioStates).filter((g) => g.value > 0).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {language === 'ms' ? 'Stesen Kerja Kejuruteraan Terbenam' : 'Embedded Engineering Workstation'}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {language === 'ms'
              ? 'Reka bentuk, jana perisian tegar, susun atur litar dan kawal perkakasan Arduino & ESP32 bersama Gemini.'
              : 'Design circuits, generate C/C++ firmware, validate electrical safety, and monitor microcontroller telemetry.'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onCreateProject}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <FolderPlus className="w-4 h-4" />
            {language === 'ms' ? 'Projek Baharu' : 'New Project'}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('ide')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-500 transition-colors whitespace-nowrap"
          >
            <Play className="w-4 h-4" />
            {language === 'ms' ? 'Buka Arduino IDE' : 'Open Arduino IDE'}
          </button>
        </div>
      </div>

      {/* 4-Column Hardware KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Target Controller</div>
          <div className="mt-1.5 text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
            {activeBoard.name}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
            {activeBoard.mcu} · {activeBoard.logicVoltage.toFixed(1)}V Logic
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Serial Bridge Status</div>
          <div className="mt-1.5 text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
            {telemetry.connected ? 'Connected' : 'Disconnected'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
            {telemetry.port} · {telemetry.baudRate} baud
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Power & Thermal</div>
          <div className="mt-1.5 text-base font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums whitespace-nowrap truncate">
            {telemetry.sensors.voltageV.toFixed(2)}V · {telemetry.sensors.currentMa} mA
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums whitespace-nowrap truncate">
            Temp {telemetry.sensors.temperatureC.toFixed(1)}°C · RH {telemetry.sensors.humidityPct.toFixed(1)}%
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Active I/O Channels</div>
          <div className="mt-1.5 text-base font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums whitespace-nowrap truncate">
            {activeGpioCount} Active GPIOs
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums whitespace-nowrap truncate">
            {activeProject.files.length} source files · {activeProject.circuit.wires.length} wires
          </div>
        </div>
      </div>

      {/* Main Split: Active Project & Quick Launch + Toolchain Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-sky-600 dark:text-sky-400">Active Workspace Project</div>
              <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                {activeProject.name}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {activeProject.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onExportProjectZip(activeProject)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export ZIP
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('generator')}
              className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 text-left hover:border-sky-500/60 transition-colors"
            >
              <Zap className="w-4 h-4 text-sky-500" />
              <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                AI Project Generator
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Generate full BOM, wiring & firmware from prompt.
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('circuit')}
              className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 text-left hover:border-sky-500/60 transition-colors"
            >
              <Layers className="w-4 h-4 text-sky-500" />
              <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                2D & 3D Circuit Designer
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Inspect electrical rules and 3D hardware assembly.
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('serial')}
              className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 text-left hover:border-sky-500/60 transition-colors"
            >
              <Terminal className="w-4 h-4 text-sky-500" />
              <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Serial Monitor & Plotter
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Stream WebSocket/WebSerial TX/RX telemetry.
              </div>
            </button>
          </div>

          {/* Saved Projects Table */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Saved Firmware Projects ({projects.length})
            </h3>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {projects.map((p) => {
                const isSelected = p.id === activeProject.id;
                const boardName = SUPPORTED_BOARDS.find((b) => b.id === p.boardId)?.name ?? p.boardId;
                return (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {p.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {boardName} · {p.files.length} files · Updated {new Date(p.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectProject(p.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0 whitespace-nowrap ${
                        isSelected
                          ? 'bg-sky-600 text-white'
                          : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {isSelected ? 'Active' : 'Load Project'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Host Toolchain & Runtime Environment */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-sky-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Runtime & Toolchain Status
            </h3>
          </div>

          <dl className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">Gemini AI</dt>
              <dd className={`font-medium text-right whitespace-nowrap ${envInfo?.geminiKeyConfigured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {envInfo?.geminiKeyConfigured ? 'Configured' : 'Key Missing'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">Node.js</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200 text-right whitespace-nowrap">{envInfo?.nodeVersion ?? 'v22.x'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">Python</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200 text-right whitespace-nowrap truncate">
                {envInfo?.python.installed ? envInfo.python.version : 'Not detected'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">Compiler</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200 text-right whitespace-nowrap truncate">
                {envInfo?.arduinoCli.installed ? envInfo.arduinoCli.version : 'AST Compiler'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-2">
              <dt className="text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">Serial Policy</dt>
              <dd className="font-medium text-emerald-600 dark:text-emerald-400 text-right whitespace-nowrap">Allowlist Active</dd>
            </div>
          </dl>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => onNavigate('lab')}
              className="w-full py-2 px-3 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Open Electronics Engineering Lab
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
