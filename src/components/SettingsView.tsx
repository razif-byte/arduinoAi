import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Cpu, ExternalLink, FolderOpen, Link2, ShieldCheck } from 'lucide-react';
import { DRIVER_BOARD_LINKS, SUPPORTED_BOARDS } from '../data/boardsAndComponents';
import { parseBrowserLibraryFolder } from '../logic/libraryFolderScanner';
import { getCrossOsSetupGuide } from '../logic/platformioService';
import type {
  BoardPackageSource,
  LanguageCode,
  MountedLibraryFolder,
  PlatformIoExtensionConfig,
  TargetOsProfile,
  ToolchainMode,
} from '../types/studio';

interface SettingsViewProps {
  theme: 'dark' | 'light';
  language: LanguageCode;
  envInfo: {
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
  } | null;
  boardManagerUrls: BoardPackageSource[];
  mountedLibraries: MountedLibraryFolder[];
  pioConfig: PlatformIoExtensionConfig;
  onUpdatePioConfig: (patch: Partial<PlatformIoExtensionConfig>) => void;
  onAddBoardUrl: (entry: Omit<BoardPackageSource, 'id' | 'addedAt'>) => void;
  onRemoveBoardUrl: (id: string) => void;
  onAddMountedLibrary: (lib: Omit<MountedLibraryFolder, 'id' | 'addedAt'>) => void;
  onRemoveMountedLibrary: (id: string) => void;
  onToggleTheme: (next: 'dark' | 'light') => void;
  onChangeLanguage: (next: LanguageCode) => void;
}

export function SettingsView({
  theme,
  language,
  envInfo,
  boardManagerUrls,
  mountedLibraries,
  pioConfig,
  onUpdatePioConfig,
  onAddBoardUrl,
  onRemoveBoardUrl,
  onAddMountedLibrary,
  onRemoveMountedLibrary,
  onToggleTheme,
  onChangeLanguage,
}: SettingsViewProps) {
  const [urlInput, setUrlInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (folderRef.current) {
      folderRef.current.setAttribute('webkitdirectory', '');
      folderRef.current.setAttribute('directory', '');
    }
  }, []);

  const handleAddUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = urlInput.trim();
    if (!raw) return;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setUrlError('URL must use http:// or https://');
        return;
      }
      setUrlError(null);
      onAddBoardUrl({
        name: labelInput.trim() || parsed.hostname,
        url: parsed.toString(),
      });
      setUrlInput('');
      setLabelInput('');
    } catch {
      setUrlError('Enter a valid URL starting with https:// or http://');
    }
  };

  const handlePickFolder = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const scanned = await parseBrowserLibraryFolder(files);
    if (scanned) onAddMountedLibrary(scanned);
  };

  const defaultBoard = SUPPORTED_BOARDS[0];
  const osGuide = getCrossOsSetupGuide(pioConfig.targetOs, defaultBoard);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Workstation Settings & Security Policy
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Configure appearance, bilingual engineering mode, Board Manager URLs, local library folders, and driver board links.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Appearance & Language */}
        <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Interface & Localization
          </h2>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Workstation Theme</span>
              <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
                <button
                  type="button"
                  onClick={() => onToggleTheme('dark')}
                  className={`px-3 py-1 rounded-md font-medium ${theme === 'dark' ? 'bg-slate-800 text-white' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  Dark Mode
                </button>
                <button
                  type="button"
                  onClick={() => onToggleTheme('light')}
                  className={`px-3 py-1 rounded-md font-medium ${theme === 'light' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  Light Mode
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Engineering Language</span>
              <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
                <button
                  type="button"
                  onClick={() => onChangeLanguage('en')}
                  className={`px-3 py-1 rounded-md font-medium ${language === 'en' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => onChangeLanguage('ms')}
                  className={`px-3 py-1 rounded-md font-medium ${language === 'ms' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  Bahasa Melayu
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Security & Key Isolation */}
        <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Hardware & AI Security Posture
            </h2>
          </div>
          <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
              <span>Gemini API credentials are strictly isolated server-side via environment configuration and never exposed to browser bundles.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
              <span>All AI-proposed GPIO/Relay/Servo commands require explicit user authorization before serial transmission.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
              <span>Firmware flashing requires explicit target-board confirmation modal and port verification.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Board Manager URLs & Browser Library Folder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-sky-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Additional Boards Manager & Library URLs
            </h2>
          </div>
          <form onSubmit={handleAddUrl} className="space-y-2 text-xs">
            <input
              type="url"
              aria-label="Additional boards manager URL"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://raw.githubusercontent.com/.../package_index.json"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
            />
            <div className="flex gap-2">
              <input
                type="text"
                aria-label="Package source label"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                placeholder="Source label (e.g. Custom STC8 Pack)"
                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-500 whitespace-nowrap"
              >
                Add URL
              </button>
            </div>
            {urlError && <div className="text-rose-500">{urlError}</div>}
          </form>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg max-h-56 overflow-y-auto text-xs">
            {boardManagerUrls.map((entry) => (
              <div key={entry.id} className="p-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{entry.name}</div>
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] text-sky-600 dark:text-sky-400 hover:underline block truncate"
                  >
                    {entry.url}
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveBoardUrl(entry.id)}
                  className="text-rose-500 text-[11px] shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen className="w-4 h-4 text-sky-500 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                Browser Library Folders
              </h2>
            </div>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-500 cursor-pointer whitespace-nowrap">
              <FolderOpen className="w-3.5 h-3.5" />
              Browse Library Folder
              <input
                ref={folderRef}
                type="file"
                multiple
                aria-label="Browse local library folder in settings"
                className="hidden"
                onChange={(e) => handlePickFolder(e.target.files)}
              />
            </label>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Select a local Arduino or C51 library folder from your filesystem to index <code className="font-mono">.h</code> headers and <code className="font-mono">library.properties</code>.
          </p>

          {mountedLibraries.length === 0 ? (
            <div className="p-4 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500">
              No local library folders mounted yet. Click Browse Library Folder to attach one.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
              {mountedLibraries.map((folder) => (
                <div key={folder.id} className="p-2.5 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{folder.name}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      /{folder.folderName} · {folder.fileCount} files · {folder.headers.join(', ') || 'No .h headers'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveMountedLibrary(folder.id)}
                    className="text-rose-500 text-[11px] shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Driver Board Links Directory */}
      <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Driver Board Links & USB-UART Package Directory
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {DRIVER_BOARD_LINKS.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-sky-500 transition-colors flex items-start justify-between gap-3"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="font-semibold text-sky-600 dark:text-sky-400 truncate">{link.boardOrChip}</div>
                <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{link.title}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{link.notes}</div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            </a>
          ))}
        </div>
      </div>

      {/* PlatformIO Extension & Cross-OS Targets */}
      <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-sky-500" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                PlatformIO Extension & Cross-OS Targets (Windows 11 & Ubuntu Studio)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure PlatformIO Core, upload protocols, and serial permissions for Windows 11 and Ubuntu Studio Linux.
              </p>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={pioConfig.enabled}
              onChange={(e) => onUpdatePioConfig({ enabled: e.target.checked })}
              className="rounded border-slate-300 dark:border-slate-700"
            />
            Enable PlatformIO Extension
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <label className="space-y-1">
            <span className="text-slate-500 font-medium block">Default Toolchain</span>
            <select
              aria-label="Default toolchain"
              value={pioConfig.toolchainMode}
              onChange={(e) => onUpdatePioConfig({ toolchainMode: e.target.value as ToolchainMode })}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="platformio">PlatformIO Core (platformio.ini)</option>
              <option value="arduino-cli">Arduino CLI (.ino)</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-slate-500 font-medium block">Target OS Profile</span>
            <select
              aria-label="Target OS profile"
              value={pioConfig.targetOs}
              onChange={(e) => onUpdatePioConfig({ targetOs: e.target.value as TargetOsProfile })}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="windows11">Windows 11 (COMx / NSIS)</option>
              <option value="ubuntu-studio">Ubuntu Studio (/dev/ttyUSB0 / AppImage & .deb)</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-slate-500 font-medium block">Upload Protocol</span>
            <select
              aria-label="Default upload protocol"
              value={pioConfig.uploadProtocol}
              onChange={(e) =>
                onUpdatePioConfig({ uploadProtocol: e.target.value as PlatformIoExtensionConfig['uploadProtocol'] })
              }
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="auto">Auto-detect per board</option>
              <option value="esptool">esptool (ESP32 / ESP8266)</option>
              <option value="stcgal">stcgal (STC8G1K08A C51)</option>
              <option value="arduino">arduino (AVR Uno / Nano)</option>
              <option value="picotool">picotool (RP2040)</option>
              <option value="stlink">stlink (STM32)</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-slate-500 font-medium block">PlatformIO CLI Binary</span>
            <input
              type="text"
              aria-label="PlatformIO CLI binary path"
              value={pioConfig.pioCorePath}
              onChange={(e) => onUpdatePioConfig({ pioCorePath: e.target.value })}
              placeholder="pio"
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={pioConfig.includeUdevSetup}
                onChange={(e) => onUpdatePioConfig({ includeUdevSetup: e.target.checked })}
                className="rounded border-slate-300 dark:border-slate-700"
              />
              Include Ubuntu Studio udev & dialout notes in generated platformio.ini
            </label>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-[11px]">
            <span className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800">
              pio: {envInfo?.platformioCli?.installed ? envInfo.platformioCli.version : 'Not installed'}
            </span>
            <span className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800">
              sdcc: {envInfo?.sdcc?.installed ? envInfo.sdcc.version : 'Not installed'}
            </span>
            <span className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800">
              stcgal: {envInfo?.stcgal?.installed ? envInfo.stcgal.version : 'Not installed'}
            </span>
          </div>
        </div>
      </div>

      {/* Host Toolchain, USB Serial & Cross-OS Packaging */}
      <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Host Environment, USB Drivers & Windows 11 / Ubuntu Studio Build Pipeline
          </h2>
          <span className="text-xs font-mono text-sky-600 dark:text-sky-400">
            Active Guide: {osGuide.osLabel}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-2">
            <div className="font-medium text-slate-700 dark:text-slate-300">
              Detected USB Serial Interfaces (Windows COM & Ubuntu /dev/tty*)
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg max-h-56 overflow-y-auto">
              {(envInfo?.serialPorts ?? []).map((p) => (
                <div key={p.path} className="p-2.5 flex justify-between gap-2">
                  <span className="font-mono font-medium">{p.path}</span>
                  <span className="text-slate-500 text-right">{p.manufacturer} ({p.vidPid})</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="font-medium text-slate-700 dark:text-slate-300">
              {pioConfig.targetOs === 'ubuntu-studio'
                ? 'Ubuntu Studio Setup (dialout, brltty, 99-platformio-udev.rules) & Linux Build'
                : 'Windows 11 Setup & Desktop Installer Build'}
            </div>
            <pre className="p-3 rounded-lg bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto leading-relaxed">
{`${osGuide.commands.join('\n')}

# Build desktop installer (${osGuide.artifacts.join(' / ')}):
${osGuide.packagingCommand}

# Also available:
# Windows 11: npm run electron:win
# Ubuntu Studio: npm run electron:linux`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

