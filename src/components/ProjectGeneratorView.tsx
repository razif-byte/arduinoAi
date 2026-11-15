import { useState } from 'react';
import { ArrowRight, CheckCircle2, Cpu, FileCode2, Wrench } from 'lucide-react';
import { SUPPORTED_BOARDS } from '../data/boardsAndComponents';
import type { ArduinoProject, GeneratedBlueprint, LanguageCode } from '../types/studio';

interface ProjectGeneratorViewProps {
  boardId: string;
  language: LanguageCode;
  onSaveAndOpenProject: (project: ArduinoProject) => Promise<void>;
}

export function ProjectGeneratorView({
  boardId,
  language,
  onSaveAndOpenProject,
}: ProjectGeneratorViewProps) {
  const [prompt, setPrompt] = useState(
    'Build an ESP32 smart home system with Wi-Fi, DHT22 temperature sensor, opto-isolated relay, and serial status reporting.'
  );
  const [targetBoard, setTargetBoard] = useState(boardId);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<GeneratedBlueprint | null>(null);

  const presets = [
    'Build an ESP32 smart home system with Wi-Fi, temperature sensor, relay and mobile dashboard.',
    'Create an Arduino Uno automatic plant watering controller with soil moisture sensor, relay pump, and OLED status display.',
    'Design a Raspberry Pi Pico 20kHz PWM DC motor speed controller with potentiometer and emergency stop button.',
    'Build an STC8G1K08A C51 8051 PCA PWM fan controller with 115200 baud UART telemetry on P3.0/P3.1 and status LED on P5.4.',
  ];

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/ai/generate-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, boardId: targetBoard, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Project generation failed.');
      setBlueprint(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate project blueprint.');
    } finally {
      setGenerating(false);
    }
  };

  const handleLoadIntoIde = async () => {
    if (!blueprint) return;
    const now = new Date().toISOString();
    const newProject: ArduinoProject = {
      id: `proj-${Date.now()}`,
      name: blueprint.title,
      boardId: blueprint.boardId || targetBoard,
      description: blueprint.architecture.slice(0, 180),
      files: blueprint.files.map((f) => ({
        name: f.name,
        language: f.name.endsWith('.h') ? 'h' : f.name.endsWith('.c') ? 'c' : 'cpp',
        content: f.content,
      })),
      libraries: blueprint.libraries,
      circuit: {
        boardId: blueprint.boardId || targetBoard,
        nodes: [
          {
            id: 'n-board',
            type: 'board',
            label: SUPPORTED_BOARDS.find((b) => b.id === (blueprint.boardId || targetBoard))?.name ?? targetBoard,
            x: 110,
            y: 120,
            props: { boardId: blueprint.boardId || targetBoard },
          },
        ],
        wires: [],
      },
      createdAt: now,
      updatedAt: now,
    };
    await onSaveAndOpenProject(newProject);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          AI Embedded Project Generator
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Describe an embedded system in natural language to synthesize architecture, BOM, GPIO pinout, wiring guide, complete firmware, and test plan.
        </p>
      </div>

      {/* Input Form */}
      <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-3 space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              System Specification
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Target Microcontroller
            </label>
            <select
              value={targetBoard}
              onChange={(e) => setTargetBoard(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
            >
              {SUPPORTED_BOARDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={generating || !prompt.trim()}
              onClick={handleGenerate}
              className="w-full mt-2 py-2.5 px-4 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-500 disabled:opacity-50 transition-colors"
            >
              {generating ? 'Synthesizing Blueprint...' : 'Generate Complete Project'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPrompt(p)}
              className="text-left px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:border-sky-500/60 transition-colors"
            >
              {p.slice(0, 72)}...
            </button>
          ))}
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs text-rose-600 dark:text-rose-300">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Generated 10-Section Blueprint */}
      {blueprint && (
        <div className="space-y-6">
          <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Blueprint Ready · {blueprint.boardId}
              </div>
              <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">
                {blueprint.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleLoadIntoIde}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-500 transition-colors shrink-0"
            >
              Save & Open in Arduino IDE
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. Architecture */}
            <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-sky-500" />
                01. System Architecture
              </h3>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                {blueprint.architecture}
              </p>
            </div>

            {/* 2. Required Libraries & 3. Wiring */}
            <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-sky-500" />
                02. Wiring Steps & Libraries
              </h3>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Libraries: <span className="font-mono text-slate-800 dark:text-slate-200">{blueprint.libraries.join(', ') || 'Arduino Core'}</span>
              </div>
              <ol className="list-decimal pl-4 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {blueprint.wiringSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </div>

          {/* 3. Hardware BOM Table */}
          <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              03. Hardware Component List (BOM)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-4">Component</th>
                    <th className="py-2 pr-4">Qty</th>
                    <th className="py-2 pr-4">Electrical Specs</th>
                    <th className="py-2">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {blueprint.components.map((c, idx) => (
                    <tr key={idx}>
                      <td className="py-2 pr-4 font-medium text-slate-900 dark:text-slate-100">{c.name}</td>
                      <td className="py-2 pr-4 font-mono tabular-nums">{c.quantity}</td>
                      <td className="py-2 pr-4 font-mono text-slate-600 dark:text-slate-300">{c.specs}</td>
                      <td className="py-2 text-slate-600 dark:text-slate-300">{c.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. GPIO Assignments */}
          <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              04. GPIO Pin Assignments
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-4">Pin</th>
                    <th className="py-2 pr-4">Signal</th>
                    <th className="py-2 pr-4">Component</th>
                    <th className="py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {blueprint.gpioAssignments.map((g, idx) => (
                    <tr key={idx}>
                      <td className="py-2 pr-4 font-mono font-semibold text-sky-600 dark:text-sky-400">{g.pin}</td>
                      <td className="py-2 pr-4 font-mono">{g.signal}</td>
                      <td className="py-2 pr-4 font-medium">{g.component}</td>
                      <td className="py-2 text-slate-600 dark:text-slate-300">{g.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. Firmware Files */}
          <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-sky-500" />
              05. Generated Firmware Source ({blueprint.files.length} files)
            </h3>
            {blueprint.files.map((f) => (
              <div key={f.name} className="space-y-1">
                <div className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
                  {f.name}
                </div>
                <pre className="p-3 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto max-h-72">
                  {f.content}
                </pre>
              </div>
            ))}
          </div>

          {/* 6-10. Procedures */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                06. Installation & Compilation
              </h3>
              <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {[...blueprint.installInstructions, ...blueprint.compileInstructions].map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>

            <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                07. Testing & Troubleshooting
              </h3>
              <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {[...blueprint.testingProcedures, ...blueprint.troubleshootingGuide].map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
