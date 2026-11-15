import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Cpu,
  Download,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { SUPPORTED_BOARDS } from '../data/boardsAndComponents';
import { validateCircuitDiagram } from '../logic/circuitValidator';
import { Board3DViewer } from './Board3DViewer';
import type {
  ArduinoProject,
  CircuitNode,
  CircuitWire,
  HardwareTelemetryState,
  LanguageCode,
} from '../types/studio';

interface CircuitDesignerViewProps {
  project: ArduinoProject;
  telemetry: HardwareTelemetryState;
  language: LanguageCode;
  onUpdateProject: (updated: ArduinoProject) => Promise<void>;
}

const NODE_PIN_DEFS: Record<CircuitNode['type'], string[]> = {
  board: ['3V3', '5V', 'GND', 'GPIO2', 'GPIO4', 'GPIO5', 'GPIO12', 'GPIO14', 'GPIO21', 'GPIO22', 'D7', 'D8', 'D9', 'D13', 'A0', 'GP15', 'GP26', 'P3.0', 'P3.1', 'P3.2', 'P3.3', 'P5.4', 'P5.5'],
  led: ['ANODE', 'CATHODE'],
  resistor: ['P1', 'P2'],
  dht22: ['VCC', 'DATA', 'GND'],
  servo: ['5V', 'PWM', 'GND'],
  relay: ['VCC', 'IN', 'GND', 'COM', 'NO'],
  ultrasonic: ['VCC', 'TRIG', 'ECHO', 'GND'],
  button: ['P1', 'P2'],
  potentiometer: ['VCC', 'WIPER', 'GND'],
  mosfet: ['GATE', 'DRAIN', 'SOURCE'],
  oled: ['VCC', 'SDA', 'SCL', 'GND'],
};

const PALETTE_ITEMS: Array<{ type: CircuitNode['type']; label: string; defaultProps: Record<string, string | number> }> = [
  { type: 'led', label: 'LED', defaultProps: { color: '#0ea5e9' } },
  { type: 'resistor', label: '220Ω Resistor', defaultProps: { ohms: 220 } },
  { type: 'dht22', label: 'DHT22 Sensor', defaultProps: {} },
  { type: 'servo', label: 'SG90 Servo', defaultProps: {} },
  { type: 'relay', label: '5V Relay', defaultProps: {} },
  { type: 'ultrasonic', label: 'HC-SR04', defaultProps: {} },
  { type: 'button', label: 'Push Button', defaultProps: {} },
  { type: 'potentiometer', label: '10kΩ Pot', defaultProps: {} },
  { type: 'mosfet', label: 'IRLZ44N MOSFET', defaultProps: {} },
  { type: 'oled', label: 'SSD1306 OLED', defaultProps: {} },
];

export function CircuitDesignerView({
  project,
  telemetry,
  language,
  onUpdateProject,
}: CircuitDesignerViewProps) {
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [fromNodeId, setFromNodeId] = useState(project.circuit.nodes[0]?.id ?? '');
  const [fromPin, setFromPin] = useState('GPIO2');
  const [toNodeId, setToNodeId] = useState(project.circuit.nodes[1]?.id ?? project.circuit.nodes[0]?.id ?? '');
  const [toPin, setToPin] = useState('ANODE');
  const [wireSignal, setWireSignal] = useState<CircuitWire['signalType']>('digital');
  const [wireColor, setWireColor] = useState('#0ea5e9');
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const board = SUPPORTED_BOARDS.find((b) => b.id === project.boardId) ?? SUPPORTED_BOARDS[0];
  const validation = useMemo(
    () => validateCircuitDiagram(project.circuit, board),
    [project.circuit, board]
  );

  const updateCircuit = (nodes: CircuitNode[], wires: CircuitWire[]) => {
    onUpdateProject({
      ...project,
      circuit: { ...project.circuit, boardId: project.boardId, nodes, wires },
    });
  };

  const handleAddNode = (item: (typeof PALETTE_ITEMS)[number]) => {
    const count = project.circuit.nodes.filter((n) => n.type === item.type).length + 1;
    const newNode: CircuitNode = {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: item.type,
      label: `${item.label} ${count}`,
      x: 340 + ((count * 35) % 220),
      y: 80 + ((count * 55) % 260),
      props: { ...item.defaultProps },
    };
    updateCircuit([...project.circuit.nodes, newNode], project.circuit.wires);
    setToNodeId(newNode.id);
    setToPin(NODE_PIN_DEFS[newNode.type][0]);
  };

  const handleRemoveNode = (nodeId: string) => {
    const node = project.circuit.nodes.find((n) => n.id === nodeId);
    if (!node || node.type === 'board') return;
    updateCircuit(
      project.circuit.nodes.filter((n) => n.id !== nodeId),
      project.circuit.wires.filter((w) => w.fromNodeId !== nodeId && w.toNodeId !== nodeId)
    );
  };

  const handleAddWire = () => {
    if (!fromNodeId || !toNodeId) return;
    const newWire: CircuitWire = {
      id: `w-${Date.now()}`,
      fromNodeId,
      fromPin,
      toNodeId,
      toPin,
      color: wireColor,
      signalType: wireSignal,
    };
    updateCircuit(project.circuit.nodes, [...project.circuit.wires, newWire]);
  };

  const handleRemoveWire = (wireId: string) => {
    updateCircuit(
      project.circuit.nodes,
      project.circuit.wires.filter((w) => w.id !== wireId)
    );
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingNodeId || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.max(20, Math.min(640, e.clientX - rect.left - 55));
    const y = Math.max(20, Math.min(360, e.clientY - rect.top - 25));
    const nextNodes = project.circuit.nodes.map((n) =>
      n.id === draggingNodeId ? { ...n, x: Math.round(x), y: Math.round(y) } : n
    );
    updateCircuit(nextNodes, project.circuit.wires);
  };

  const handleExportSvg = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}_circuit.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPng = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1440;
      canvas.height = 840;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0B0F17';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `${project.name.replace(/\s+/g, '_')}_circuit.png`;
        a.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleAiAnalyze = async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/analyze-circuit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagram: project.circuit, boardId: project.boardId, language }),
      });
      const data = await res.json();
      setAiReport(data.report || data.error);
    } finally {
      setAiLoading(false);
    }
  };

  const getNodeCenter = (node: CircuitNode) => {
    const w = node.type === 'board' ? 160 : 120;
    const h = node.type === 'board' ? 130 : 54;
    return { cx: node.x + w / 2, cy: node.y + h / 2 };
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Visual Circuit & 3D Hardware Designer
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Drag components on the breadboard canvas, route GPIO wires, run electrical safety rules, or inspect the 3D PCB assembly.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('2d')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === '2d'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              2D Schematic
            </button>
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === '3d'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              3D Assembly
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportSvg}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" />
            Export SVG
          </button>
          <button
            type="button"
            onClick={handleExportPng}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" />
            Export PNG
          </button>
          <button
            type="button"
            onClick={handleAiAnalyze}
            disabled={aiLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-500 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {aiLoading ? 'Analyzing...' : 'AI Circuit Check'}
          </button>
        </div>
      </div>

      {viewMode === '3d' ? (
        <Board3DViewer board={board} circuit={project.circuit} telemetry={telemetry} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* Component Palette */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
            <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Component Palette
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
              {PALETTE_ITEMS.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => handleAddNode(item)}
                  className="flex items-center justify-between px-3 py-2 rounded-md border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-sky-500/60 transition-colors"
                >
                  <span>{item.label}</span>
                  <Plus className="w-3.5 h-3.5 text-sky-500" />
                </button>
              ))}
            </div>
          </div>

          {/* 2D Interactive SVG Breadboard Workspace */}
          <div className="lg:col-span-3 space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-[#0B0F17] overflow-hidden">
              <svg
                ref={svgRef}
                viewBox="0 0 740 420"
                className="w-full h-[420px] select-none"
                onPointerMove={handleSvgPointerMove}
                onPointerUp={() => setDraggingNodeId(null)}
                onPointerLeave={() => setDraggingNodeId(null)}
              >
                <defs>
                  <pattern id="breadboard-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <circle cx="10" cy="10" r="1" fill="#1E293B" />
                  </pattern>
                </defs>
                <rect width="740" height="420" fill="#0B0F17" />
                <rect width="740" height="420" fill="url(#breadboard-grid)" />

                {/* Wires */}
                {project.circuit.wires.map((wire) => {
                  const n1 = project.circuit.nodes.find((n) => n.id === wire.fromNodeId);
                  const n2 = project.circuit.nodes.find((n) => n.id === wire.toNodeId);
                  if (!n1 || !n2) return null;
                  const p1 = getNodeCenter(n1);
                  const p2 = getNodeCenter(n2);
                  const midX = (p1.cx + p2.cx) / 2;
                  const pathD = `M ${p1.cx} ${p1.cy} C ${midX} ${p1.cy}, ${midX} ${p2.cy}, ${p2.cx} ${p2.cy}`;
                  return (
                    <g key={wire.id}>
                      <path d={pathD} stroke={wire.color} strokeWidth={2.5} fill="none" opacity={0.9} />
                      <text
                        x={midX}
                        y={(p1.cy + p2.cy) / 2 - 5}
                        fill="#94A3B8"
                        fontSize="9"
                        textAnchor="middle"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {wire.fromPin} → {wire.toPin}
                      </text>
                    </g>
                  );
                })}

                {/* Component Nodes */}
                {project.circuit.nodes.map((node) => {
                  const isBoard = node.type === 'board';
                  const w = isBoard ? 160 : 120;
                  const h = isBoard ? 130 : 54;
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      onPointerDown={() => setDraggingNodeId(node.id)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <rect
                        width={w}
                        height={h}
                        rx={8}
                        fill={isBoard ? '#111827' : '#162032'}
                        stroke={isBoard ? '#0EA5E9' : '#334155'}
                        strokeWidth={isBoard ? 1.8 : 1.2}
                      />
                      <text
                        x={w / 2}
                        y={22}
                        fill="#F8FAFC"
                        fontSize="11"
                        fontWeight="600"
                        textAnchor="middle"
                        fontFamily="Plus Jakarta Sans, sans-serif"
                      >
                        {node.label}
                      </text>
                      <text
                        x={w / 2}
                        y={39}
                        fill="#94A3B8"
                        fontSize="9"
                        textAnchor="middle"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {isBoard ? `${board.mcu} (${board.logicVoltage}V)` : node.type.toUpperCase()}
                      </text>
                      {isBoard && (
                        <text
                          x={w / 2}
                          y={76}
                          fill="#38BDF8"
                          fontSize="9"
                          textAnchor="middle"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          I2C: {board.i2cPins.sda}/{board.i2cPins.scl}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Wire Routing Controls */}
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Route New Virtual Wire
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={fromNodeId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setFromNodeId(id);
                    const n = project.circuit.nodes.find((x) => x.id === id);
                    if (n) setFromPin(NODE_PIN_DEFS[n.type][0]);
                  }}
                  className="min-w-[125px] flex-1 px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  {project.circuit.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
                <select
                  value={fromPin}
                  onChange={(e) => setFromPin(e.target.value)}
                  className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                >
                  {(NODE_PIN_DEFS[project.circuit.nodes.find((n) => n.id === fromNodeId)?.type ?? 'board'] ?? ['GPIO2']).map(
                    (p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    )
                  )}
                </select>

                <select
                  value={toNodeId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setToNodeId(id);
                    const n = project.circuit.nodes.find((x) => x.id === id);
                    if (n) setToPin(NODE_PIN_DEFS[n.type][0]);
                  }}
                  className="min-w-[125px] flex-1 px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  {project.circuit.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
                <select
                  value={toPin}
                  onChange={(e) => setToPin(e.target.value)}
                  className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                >
                  {(NODE_PIN_DEFS[project.circuit.nodes.find((n) => n.id === toNodeId)?.type ?? 'led'] ?? ['ANODE']).map(
                    (p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    )
                  )}
                </select>

                <select
                  value={wireSignal}
                  onChange={(e) => {
                    const sig = e.target.value as CircuitWire['signalType'];
                    setWireSignal(sig);
                    setWireColor(
                      sig === 'power' ? '#ef4444' : sig === 'ground' ? '#475569' : sig === 'pwm' ? '#f59e0b' : '#0ea5e9'
                    );
                  }}
                  className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="digital">Digital</option>
                  <option value="power">Power (VCC)</option>
                  <option value="ground">Ground</option>
                  <option value="pwm">PWM</option>
                  <option value="analog">Analog</option>
                  <option value="i2c">I2C</option>
                </select>

                <button
                  type="button"
                  onClick={handleAddWire}
                  className="px-3.5 py-1.5 rounded bg-sky-600 text-white font-medium hover:bg-sky-500 whitespace-nowrap shrink-0"
                >
                  Connect Wire
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Electrical Validation, Pin Usage & Placed Components */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Electrical Connection Validation
          </h3>
          <div className="space-y-2">
            {validation.issues.map((issue) => (
              <div
                key={issue.id}
                className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                  issue.severity === 'error'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                    : issue.severity === 'warning'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {issue.severity === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold">{issue.title}</div>
                  <div className="mt-0.5 opacity-90">{issue.detail}</div>
                </div>
              </div>
            ))}
          </div>
          {aiReport && (
            <div className="p-3 rounded-lg border border-sky-500/40 bg-sky-500/5 text-xs whitespace-pre-wrap text-slate-700 dark:text-slate-200">
              {aiReport}
            </div>
          )}
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Active Wires & Nodes ({project.circuit.wires.length})
          </h3>
          <div className="space-y-1.5 max-h-56 overflow-y-auto text-xs">
            {project.circuit.wires.map((w) => (
              <div key={w.id} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="font-mono truncate">
                  {w.fromPin} → {w.toPin}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveWire(w.id)}
                  aria-label={`Remove wire ${w.fromPin} to ${w.toPin}`}
                  className="text-slate-400 hover:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {project.circuit.nodes
              .filter((n) => n.type !== 'board')
              .map((n) => (
                <div key={n.id} className="flex items-center justify-between py-1 text-slate-500 dark:text-slate-400">
                  <span>{n.label}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveNode(n.id)}
                    aria-label={`Remove ${n.label}`}
                    className="text-xs text-rose-500 hover:underline"
                  >
                    Remove Node
                  </button>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
