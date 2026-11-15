import { useEffect, useRef, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCode2,
  FilePlus,
  FolderOpen,
  History,
  Link2,
  Package,
  Play,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { DRIVER_BOARD_LINKS, SUPPORTED_BOARDS } from '../data/boardsAndComponents';
import { parseBrowserLibraryFolder } from '../logic/libraryFolderScanner';
import { generatePlatformIoIni, resolvePlatformIoProfile } from '../logic/platformioService';
import { resolveSerialDriver } from '../logic/serialService';
import type {
  ArduinoProject,
  BoardPackageSource,
  HardwareTelemetryState,
  MountedLibraryFolder,
  PlatformIoExtensionConfig,
  ProjectFile,
  ProjectVersion,
  SerialLogEntry,
  TargetOsProfile,
} from '../types/studio';

// Bind local monaco-editor instance so Monaco works offline without CDN dependencies
loader.config({ monaco });

interface ArduinoIdeViewProps {
  project: ArduinoProject;
  theme: 'dark' | 'light';
  telemetry: HardwareTelemetryState;
  serialLogs: SerialLogEntry[];
  boardManagerUrls: BoardPackageSource[];
  mountedLibraries: MountedLibraryFolder[];
  pioConfig: PlatformIoExtensionConfig;
  onUpdatePioConfig: (patch: Partial<PlatformIoExtensionConfig>) => void;
  onAddBoardUrl: (entry: Omit<BoardPackageSource, 'id' | 'addedAt'>) => void;
  onRemoveBoardUrl: (id: string) => void;
  onAddMountedLibrary: (lib: Omit<MountedLibraryFolder, 'id' | 'addedAt'>) => void;
  onRemoveMountedLibrary: (id: string) => void;
  onUpdateProject: (updated: ArduinoProject) => Promise<void>;
  onExportZip: (project: ArduinoProject) => void;
  onSendSerial: (cmd: string) => Promise<{ ok: boolean; ack: string }>;
}

interface CompileResultState {
  success: boolean;
  boardName: string;
  fqbn: string;
  diagnostics: Array<{ file: string; line: number; severity: string; message: string }>;
  estimatedFlashBytes: number;
  estimatedSramBytes: number;
  flashPct: number;
  sramPct: number;
  buildLog: string[];
}

export function ArduinoIdeView({
  project,
  theme,
  telemetry,
  serialLogs,
  boardManagerUrls,
  mountedLibraries,
  pioConfig,
  onUpdatePioConfig,
  onAddBoardUrl,
  onRemoveBoardUrl,
  onAddMountedLibrary,
  onRemoveMountedLibrary,
  onUpdateProject,
  onExportZip,
  onSendSerial,
}: ArduinoIdeViewProps) {
  const [activeFileName, setActiveFileName] = useState(project.files[0]?.name ?? '');
  const [newFileName, setNewFileName] = useState('');
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [bottomTab, setBottomTab] = useState<'output' | 'problems' | 'serial'>('output');
  const [compiling, setCompiling] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResultState | null>(null);
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string | null>(null);
  const [showPackages, setShowPackages] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [quickSerialInput, setQuickSerialInput] = useState('');
  const [newLibInput, setNewLibInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [urlNameInput, setUrlNameInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [showAllDriverLinks, setShowAllDriverLinks] = useState(false);

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
    }
  }, [showPackages]);

  useEffect(() => {
    if (!project.files.some((f) => f.name === activeFileName)) {
      setActiveFileName(project.files[0]?.name ?? '');
    }
  }, [project.id, project.files, activeFileName]);

  const activeFile: ProjectFile | undefined =
    project.files.find((f) => f.name === activeFileName) ?? project.files[0];

  const handleCodeChange = (val: string | undefined) => {
    if (!activeFile || val === undefined) return;
    const updatedFiles = project.files.map((f) =>
      f.name === activeFile.name ? { ...f, content: val } : f
    );
    onUpdateProject({ ...project, files: updatedFiles });
  };

  const handleAddFile = () => {
    const clean = newFileName.trim();
    if (!clean) return;
    const finalName = /\.(ino|cpp|c|h|ini)$/.test(clean) ? clean : `${clean}.h`;
    if (project.files.some((f) => f.name === finalName)) return;
    const lang: ProjectFile['language'] = finalName.endsWith('.ini')
      ? 'ini'
      : finalName.endsWith('.h')
      ? 'h'
      : finalName.endsWith('.c')
      ? 'c'
      : 'cpp';
    const nextFile: ProjectFile = {
      name: finalName,
      language: lang,
      content:
        lang === 'ini'
          ? generatePlatformIoIni(project, pioConfig, telemetry.baudRate, telemetry.port)
          : lang === 'h'
          ? `#ifndef ${finalName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}\n#define ${finalName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}\n\n// Declarations\n\n#endif\n`
          : lang === 'c'
          ? `// ${finalName}\n#include <STC8G.h>\n`
          : `// ${finalName}\n#include <Arduino.h>\n`,
    };
    onUpdateProject({ ...project, files: [...project.files, nextFile] });
    setActiveFileName(finalName);
    setNewFileName('');
    setShowNewFileInput(false);
  };

  const handleDeleteFile = (name: string) => {
    if (project.files.length <= 1) return;
    const nextFiles = project.files.filter((f) => f.name !== name);
    onUpdateProject({ ...project, files: nextFiles });
    if (activeFileName === name) setActiveFileName(nextFiles[0].name);
  };

  const activeToolchainMode = pioConfig.enabled ? pioConfig.toolchainMode : 'arduino-cli';

  const handleGeneratePlatformIoIni = () => {
    const content = generatePlatformIoIni(project, pioConfig, telemetry.baudRate, telemetry.port);
    const exists = project.files.some((f) => f.name === 'platformio.ini');
    const nextFiles = exists
      ? project.files.map((f) => (f.name === 'platformio.ini' ? { ...f, language: 'ini' as const, content } : f))
      : [...project.files, { name: 'platformio.ini', language: 'ini' as const, content }];
    onUpdateProject({ ...project, files: nextFiles });
    setActiveFileName('platformio.ini');
  };

  const handleCompile = async () => {
    setCompiling(true);
    setUploadStatusMsg(null);
    setBottomTab('output');
    try {
      const res = await fetch('/api/arduino/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: project.files,
          boardId: project.boardId,
          toolchainMode: activeToolchainMode,
        }),
      });
      const data = await res.json();
      setCompileResult(data);
    } finally {
      setCompiling(false);
    }
  };

  const handleConfirmUpload = async () => {
    setUploading(true);
    try {
      const res = await fetch('/api/arduino/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: project.files,
          boardId: project.boardId,
          port: telemetry.port,
          toolchainMode: activeToolchainMode,
          confirmed: true,
        }),
      });
      const data = await res.json();
      setCompileResult(data);
      setUploadStatusMsg(data.uploadMessage || data.error || 'Upload completed');
      setShowUploadConfirm(false);
      setBottomTab('output');
    } finally {
      setUploading(false);
    }
  };

  const handleLoadVersions = async () => {
    setShowVersions((v) => !v);
    const res = await fetch(`/api/projects/${project.id}/versions`);
    const data = await res.json();
    if (Array.isArray(data)) setVersions(data);
  };

  const handleCreateSnapshot = async () => {
    const res = await fetch(`/api/projects/${project.id}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: `Checkpoint ${new Date().toLocaleTimeString()}`,
        files: project.files,
      }),
    });
    const created = await res.json();
    setVersions((prev) => [created, ...prev]);
  };

  const handleImportIno = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const existing = project.files.some((f) => f.name === file.name);
      const nextFiles = existing
        ? project.files.map((f) => (f.name === file.name ? { ...f, content: text } : f))
        : [...project.files, { name: file.name, language: 'cpp' as const, content: text }];
      onUpdateProject({ ...project, files: nextFiles });
      setActiveFileName(file.name);
    };
    reader.readAsText(file);
  };

  const activeBoard = SUPPORTED_BOARDS.find((b) => b.id === project.boardId) ?? SUPPORTED_BOARDS[0];
  const activeDriver = resolveSerialDriver(activeBoard);
  const pioProfile = resolvePlatformIoProfile(activeBoard.id);
  const filteredDriverLinks = showAllDriverLinks
    ? DRIVER_BOARD_LINKS
    : DRIVER_BOARD_LINKS.filter((l) => !l.boardIds || l.boardIds.includes(activeBoard.id));

  const handleBrowseLibraryFolder = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const scanned = await parseBrowserLibraryFolder(files);
    if (!scanned) return;
    onAddMountedLibrary(scanned);
    if (!project.libraries.includes(scanned.name)) {
      onUpdateProject({
        ...project,
        libraries: [...project.libraries, scanned.name],
      });
    }
  };

  const handleAddCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = urlInput.trim();
    if (!raw) return;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setUrlError('URL must start with http:// or https://');
        return;
      }
      setUrlError(null);
      onAddBoardUrl({
        name: urlNameInput.trim() || parsed.hostname,
        url: parsed.toString(),
        boardId: activeBoard.id,
      });
      setUrlInput('');
      setUrlNameInput('');
    } catch {
      setUrlError('Enter a valid package or library URL (https://...)');
    }
  };

  const handleInsertInclude = (headerName: string) => {
    if (!activeFile) return;
    const includeLine = `#include <${headerName}>\n`;
    if (activeFile.content.includes(includeLine.trim())) return;
    handleCodeChange(`${includeLine}${activeFile.content}`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* IDE Action Bar */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCompile}
            disabled={compiling}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-600 text-white text-xs font-medium hover:bg-sky-500 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            {compiling ? 'Compiling...' : 'Verify / Compile'}
          </button>

          <button
            type="button"
            onClick={() => setShowUploadConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Firmware
          </button>

          <button
            type="button"
            onClick={() => editorRef.current?.getAction('editor.action.formatDocument')?.run()}
            className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            Format
          </button>

          {/* Toolchain Extension Switcher */}
          <div
            role="group"
            aria-label="Compiler toolchain mode"
            className="inline-flex items-center p-0.5 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900"
          >
            <button
              type="button"
              onClick={() => onUpdatePioConfig({ toolchainMode: 'arduino-cli' })}
              className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                activeToolchainMode === 'arduino-cli'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Arduino CLI
            </button>
            <button
              type="button"
              onClick={() => onUpdatePioConfig({ enabled: true, toolchainMode: 'platformio' })}
              className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                activeToolchainMode === 'platformio'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              PlatformIO
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPackages((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Package className="w-3.5 h-3.5" />
            Libraries & Drivers ({project.libraries.length})
          </button>

          <button
            type="button"
            onClick={handleLoadVersions}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <History className="w-3.5 h-3.5" />
            Versions
          </button>

          <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors whitespace-nowrap">
            Import .ino
            <input
              type="file"
              accept=".ino,.cpp,.c,.h"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportIno(f);
              }}
            />
          </label>

          <button
            type="button"
            onClick={() => onExportZip(project)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            ZIP
          </button>
        </div>
      </div>

      {/* Main Editor Split */}
      <div className="flex-1 flex min-h-0">
        {/* Project File Explorer */}
        <aside className="w-48 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0E131D] flex flex-col shrink-0">
          <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
              Project Explorer
            </span>
            <button
              type="button"
              onClick={() => setShowNewFileInput((v) => !v)}
              aria-label="Add source file"
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              <FilePlus className="w-3.5 h-3.5" />
            </button>
          </div>

          {showNewFileInput && (
            <div className="p-2 border-b border-slate-200 dark:border-slate-800 flex gap-1">
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddFile()}
                placeholder="sensor.h"
                className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={handleAddFile}
                className="px-2 py-1 text-xs rounded bg-sky-600 text-white"
              >
                Add
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {project.files.map((f) => {
              const active = f.name === activeFile?.name;
              return (
                <div
                  key={f.name}
                  className={`group flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs ${
                    active
                      ? 'bg-sky-600/15 text-sky-700 dark:text-sky-300 font-medium'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveFileName(f.name)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  >
                    <FileCode2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate font-mono">{f.name}</span>
                  </button>
                  {project.files.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteFile(f.name)}
                      aria-label={`Delete ${f.name}`}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
            <div className="font-medium text-slate-700 dark:text-slate-300">{activeBoard.name}</div>
            <div className="font-mono truncate">{activeBoard.fqbn}</div>
            <div className="font-mono truncate text-sky-600 dark:text-sky-400">
              {activeDriver.profile.id} · {activeDriver.profile.lineEndingLabel}
            </div>
          </div>
        </aside>

        {/* Monaco Code Editor + Optional Side Drawers */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-[260px]">
            {activeFile && (
              <Editor
                height="100%"
                language={
                  activeFile.language === 'ini'
                    ? 'ini'
                    : activeFile.language === 'json'
                    ? 'json'
                    : activeFile.language === 'c'
                    ? 'c'
                    : 'cpp'
                }
                theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                value={activeFile.content}
                onChange={handleCodeChange}
                onMount={(editor) => {
                  editorRef.current = editor;
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', monospace",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                }}
              />
            )}
          </div>

          {/* Bottom Compiler / Problems / Serial Output Drawer */}
          <div className="h-52 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E131D] flex flex-col">
            <div className="px-4 py-1.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs min-w-0">
                <button
                  type="button"
                  onClick={() => setBottomTab('output')}
                  className={`py-1 font-medium border-b-2 transition-colors whitespace-nowrap ${
                    bottomTab === 'output'
                      ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Build Output
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab('problems')}
                  className={`py-1 font-medium border-b-2 transition-colors whitespace-nowrap ${
                    bottomTab === 'problems'
                      ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Problems ({compileResult?.diagnostics.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab('serial')}
                  className={`py-1 font-medium border-b-2 transition-colors truncate ${
                    bottomTab === 'serial'
                      ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Quick Serial ({telemetry.port.split(' ')[0]})
                </button>
              </div>
              {compileResult && (
                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                  Flash {compileResult.flashPct}% · RAM {compileResult.sramPct}%
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
              {bottomTab === 'output' && (
                <div className="space-y-1">
                  {uploadStatusMsg && (
                    <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      {uploadStatusMsg}
                    </div>
                  )}
                  {!compileResult ? (
                    <div className="text-slate-500 dark:text-slate-400">
                      Click "Verify / Compile" to analyze firmware syntax, target compatibility, and Flash/SRAM allocation.
                    </div>
                  ) : (
                    compileResult.buildLog.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.includes('[ERROR]')
                            ? 'text-rose-500'
                            : line.includes('Sketch uses') || line.includes('[SUCCESS]')
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-700 dark:text-slate-300'
                        }
                      >
                        {line}
                      </div>
                    ))
                  )}
                </div>
              )}

              {bottomTab === 'problems' && (
                <div className="space-y-1.5">
                  {!compileResult || compileResult.diagnostics.length === 0 ? (
                    <div className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      Zero compiler errors or warnings detected.
                    </div>
                  ) : (
                    compileResult.diagnostics.map((d, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <AlertTriangle
                          className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                            d.severity === 'error' ? 'text-rose-500' : 'text-amber-500'
                          }`}
                        />
                        <span>
                          <span className="font-semibold">
                            {d.file}:{d.line}
                          </span>{' '}
                          — {d.message}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {bottomTab === 'serial' && (
                <div className="flex flex-col h-full gap-2">
                  <div className="flex-1 overflow-y-auto space-y-0.5">
                    {serialLogs.slice(-15).map((entry) => (
                      <div key={entry.id} className="text-[11px]">
                        <span className="text-slate-400">[{entry.timestamp.slice(11, 19)}]</span>{' '}
                        <span className={entry.direction === 'ERR' ? 'text-rose-500' : entry.direction === 'TX' ? 'text-sky-500' : 'text-emerald-500'}>
                          {entry.direction}
                        </span>{' '}
                        <span className="text-slate-700 dark:text-slate-200">{entry.payload}</span>
                      </div>
                    ))}
                  </div>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!quickSerialInput.trim()) return;
                      await onSendSerial(quickSerialInput);
                      setQuickSerialInput('');
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={quickSerialInput}
                      onChange={(e) => setQuickSerialInput(e.target.value)}
                      placeholder="Send protocol cmd (e.g. PIN:WRITE:2:1 or SYS:PING)"
                      className="flex-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                    <button type="submit" className="px-3 py-1 rounded bg-sky-600 text-white text-xs">
                      Send
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Library, URL & Driver Board Manager Side Panel */}
        {showPackages && (
          <div className="w-72 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5 space-y-4 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Library, URL & Driver Manager
              </h3>
              <button type="button" onClick={() => setShowPackages(false)} className="text-xs text-slate-400 hover:text-slate-200">
                Close
              </button>
            </div>

            {/* PlatformIO Extension Options */}
            <div className="p-2.5 rounded-lg border border-sky-500/30 bg-sky-500/5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900 dark:text-slate-100">PlatformIO Extension</span>
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pioConfig.enabled}
                    onChange={(e) => onUpdatePioConfig({ enabled: e.target.checked })}
                    className="rounded border-slate-300 dark:border-slate-700"
                  />
                  Enabled
                </label>
              </div>

              <div className="font-mono text-[11px] text-sky-600 dark:text-sky-400 truncate">
                env:{pioProfile.envName} · {pioProfile.platform}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <label className="space-y-0.5">
                  <span className="text-[10px] text-slate-500 block">Target OS</span>
                  <select
                    aria-label="PlatformIO target OS"
                    value={pioConfig.targetOs}
                    onChange={(e) => onUpdatePioConfig({ targetOs: e.target.value as TargetOsProfile })}
                    className="w-full px-1.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                  >
                    <option value="windows11">Windows 11</option>
                    <option value="ubuntu-studio">Ubuntu Studio</option>
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-slate-500 block">Upload Protocol</span>
                  <select
                    aria-label="PlatformIO upload protocol"
                    value={pioConfig.uploadProtocol}
                    onChange={(e) =>
                      onUpdatePioConfig({
                        uploadProtocol: e.target.value as PlatformIoExtensionConfig['uploadProtocol'],
                      })
                    }
                    className="w-full px-1.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                  >
                    <option value="auto">Auto ({pioProfile.defaultUploadProtocol})</option>
                    <option value="esptool">esptool</option>
                    <option value="stcgal">stcgal (STC8 C51)</option>
                    <option value="arduino">arduino (AVR)</option>
                    <option value="picotool">picotool</option>
                    <option value="stlink">stlink</option>
                  </select>
                </label>
              </div>

              <label className="space-y-0.5 block">
                <span className="text-[10px] text-slate-500 block">Library Finder (lib_ldf_mode)</span>
                <select
                  aria-label="PlatformIO lib_ldf_mode"
                  value={pioConfig.libLdfMode}
                  onChange={(e) =>
                    onUpdatePioConfig({
                      libLdfMode: e.target.value as PlatformIoExtensionConfig['libLdfMode'],
                    })
                  }
                  className="w-full px-1.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                >
                  <option value="chain+">chain+ (Recommended)</option>
                  <option value="chain">chain</option>
                  <option value="deep+">deep+</option>
                  <option value="deep">deep</option>
                </select>
              </label>

              <button
                type="button"
                onClick={handleGeneratePlatformIoIni}
                className="w-full py-1.5 px-2.5 rounded bg-sky-600 text-white text-[11px] font-medium hover:bg-sky-500 transition-colors"
              >
                Generate platformio.ini
              </button>
            </div>

            {/* Project Libraries + Browser Folder Picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">Project Libraries</span>
                <label className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap">
                  <FolderOpen className="w-3 h-3" />
                  Browse Library Folder
                  <input
                    ref={folderInputRef}
                    type="file"
                    multiple
                    aria-label="Browse local library folder"
                    className="hidden"
                    onChange={(e) => handleBrowseLibraryFolder(e.target.files)}
                  />
                </label>
              </div>

              {project.libraries.map((lib) => (
                <div
                  key={lib}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-xs"
                >
                  <span className="truncate">{lib}</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateProject({
                        ...project,
                        libraries: project.libraries.filter((l) => l !== lib),
                      })
                    }
                    className="text-rose-500 text-[11px] shrink-0 ml-2"
                  >
                    Remove
                  </button>
                </div>
              ))}

              <div className="flex gap-1.5 pt-1">
                <input
                  type="text"
                  aria-label="Add library by name"
                  value={newLibInput}
                  onChange={(e) => setNewLibInput(e.target.value)}
                  placeholder="Add library (e.g. PubSubClient)"
                  className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newLibInput.trim()) return;
                    onUpdateProject({
                      ...project,
                      libraries: Array.from(new Set([...project.libraries, newLibInput.trim()])),
                    });
                    setNewLibInput('');
                  }}
                  className="px-2.5 py-1 rounded bg-sky-600 text-white text-xs shrink-0"
                >
                  Install
                </button>
              </div>

              {mountedLibraries.length > 0 && (
                <div className="pt-2 space-y-1.5">
                  <div className="text-[11px] font-medium text-slate-500">Mounted Library Folders</div>
                  {mountedLibraries.map((folder) => (
                    <div
                      key={folder.id}
                      className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-[11px] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold truncate">{folder.name}</span>
                        <button
                          type="button"
                          onClick={() => onRemoveMountedLibrary(folder.id)}
                          className="text-rose-500 shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="text-slate-500 font-mono truncate">
                        /{folder.folderName} · {folder.fileCount} files
                      </div>
                      {folder.headers.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {folder.headers.slice(0, 4).map((hdr) => (
                            <button
                              key={hdr}
                              type="button"
                              onClick={() => handleInsertInclude(hdr)}
                              className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 font-mono text-[10px] hover:border-sky-500"
                              title={`Insert #include <${hdr}>`}
                            >
                              + {hdr}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Board / Library Package URL Input Box */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <Link2 className="w-3.5 h-3.5 text-sky-500" />
                <span>Board & Library URL Manager</span>
              </div>
              <form onSubmit={handleAddCustomUrl} className="space-y-1.5">
                <input
                  type="url"
                  aria-label="Board manager or library URL"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://.../package_index.json or GitHub URL"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                />
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    aria-label="Package label"
                    value={urlNameInput}
                    onChange={(e) => setUrlNameInput(e.target.value)}
                    placeholder="Label (optional)"
                    className="flex-1 min-w-0 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded bg-sky-600 text-white text-xs font-medium hover:bg-sky-500 shrink-0"
                  >
                    Add URL
                  </button>
                </div>
                {urlError && <div className="text-[11px] text-rose-500">{urlError}</div>}
              </form>

              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {boardManagerUrls.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="p-2 rounded border border-slate-200 dark:border-slate-800 text-[11px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{pkg.name}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveBoardUrl(pkg.id)}
                        className="text-rose-500 shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                    <a
                      href={pkg.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-mono text-[10px] text-sky-600 dark:text-sky-400 hover:underline truncate"
                    >
                      {pkg.url}
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Official Driver Board Links */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">Driver Board Links</span>
                <button
                  type="button"
                  onClick={() => setShowAllDriverLinks((v) => !v)}
                  className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline"
                >
                  {showAllDriverLinks ? 'Active Board' : 'All Boards'}
                </button>
              </div>
              <div className="space-y-1.5">
                {filteredDriverLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-2 rounded border border-slate-200 dark:border-slate-800 hover:border-sky-500 transition-colors space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400">
                      <span className="truncate">{link.boardOrChip}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </div>
                    <div className="text-[11px] text-slate-700 dark:text-slate-300 truncate">{link.title}</div>
                  </a>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="text-[11px] font-medium text-slate-500">Installed Board Cores</div>
              {[
                'arduino:avr (1.8.6)',
                'stc:8051 (STC8G C51 / SDCC 4.4)',
                'esp32:esp32 (3.0.4)',
                'esp8266:esp8266 (3.1.2)',
                'rp2040:rp2040 (4.1.1)',
                'STMicroelectronics:stm32 (2.8.1)',
              ].map((core) => (
                <div key={core} className="text-xs font-mono text-slate-600 dark:text-slate-300">
                  {core}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Code Version History Panel */}
        {showVersions && (
          <div className="w-72 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Version Snapshots</h3>
              <button type="button" onClick={() => setShowVersions(false)} className="text-xs text-slate-400">
                Close
              </button>
            </div>
            <button
              type="button"
              onClick={handleCreateSnapshot}
              className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded bg-sky-600 text-white text-xs font-medium hover:bg-sky-500"
            >
              <Save className="w-3.5 h-3.5" />
              Save Firmware Checkpoint
            </button>
            <div className="space-y-2">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="p-2.5 rounded border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                >
                  <div className="font-medium text-slate-900 dark:text-slate-100">{v.label}</div>
                  <div className="text-[11px] text-slate-500">{new Date(v.createdAt).toLocaleString()}</div>
                  <button
                    type="button"
                    onClick={() => onUpdateProject({ ...project, files: v.files })}
                    className="text-sky-600 dark:text-sky-400 text-[11px] font-medium hover:underline"
                  >
                    Restore This Version
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Explicit Firmware Upload Confirmation Modal */}
      {showUploadConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Confirm Firmware Upload
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Verify target hardware parameters before flashing firmware over serial bootloader:
            </p>
            <dl className="text-xs space-y-1.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex justify-between">
                <dt className="text-slate-500">Board</dt>
                <dd className="font-medium">{activeBoard.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Toolchain / OS</dt>
                <dd className="font-mono">
                  {activeToolchainMode === 'platformio' ? `PlatformIO (${pioProfile.envName})` : 'Arduino CLI'} ·{' '}
                  {pioConfig.targetOs === 'ubuntu-studio' ? 'Ubuntu Studio' : 'Windows 11'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">FQBN</dt>
                <dd className="font-mono">{activeBoard.fqbn}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Port / Baud</dt>
                <dd className="font-mono">
                  {telemetry.port} @ {telemetry.baudRate}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Serial Driver</dt>
                <dd className="font-mono">
                  {activeDriver.profile.name} ({activeDriver.profile.lineEndingLabel})
                </dd>
              </div>
              {activeBoard.architecture === 'C51' && (
                <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 text-[11px] text-amber-600 dark:text-amber-300">
                  STC-ISP Bootloader: Connect CH340G TXD→P3.0, RXD→P3.1 and cold-cycle VCC to flash 8KB C51 Flash.
                </div>
              )}
            </dl>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUploadConfirm(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={handleConfirmUpload}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {uploading ? 'Flashing...' : 'Authorize & Flash Firmware'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
