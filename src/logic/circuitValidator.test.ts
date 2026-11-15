import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCircuitDiagram } from './circuitValidator';
import { SUPPORTED_BOARDS } from '../data/boardsAndComponents';
import { CircuitDiagram } from '../types/studio';

test('validateCircuitDiagram catches VCC-GND short circuits and missing LED resistors', () => {
  const esp32 = SUPPORTED_BOARDS.find((b) => b.id === 'esp32')!;
  const badDiagram: CircuitDiagram = {
    boardId: 'esp32',
    nodes: [
      { id: 'b1', type: 'board', label: 'ESP32', x: 100, y: 100, props: {} },
      { id: 'l1', type: 'led', label: 'Status LED', x: 300, y: 100, props: { color: '#ef4444' } },
    ],
    wires: [
      { id: 'w1', fromNodeId: 'b1', fromPin: 'GPIO2', toNodeId: 'l1', toPin: 'ANODE', color: '#ef4444', signalType: 'digital' },
      { id: 'w2', fromNodeId: 'b1', fromPin: '3V3', toNodeId: 'b1', toPin: 'GND', color: '#111827', signalType: 'power' },
    ],
  };
  const report = validateCircuitDiagram(badDiagram, esp32);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((i) => i.severity === 'error' && i.title.includes('Short')));
  assert.ok(report.issues.some((i) => i.severity === 'warning' && i.title.includes('Resistor')));
});

test('validateCircuitDiagram passes properly wired resistor + LED circuit', () => {
  const uno = SUPPORTED_BOARDS.find((b) => b.id === 'uno')!;
  const goodDiagram: CircuitDiagram = {
    boardId: 'uno',
    nodes: [
      { id: 'b1', type: 'board', label: 'Arduino Uno', x: 100, y: 100, props: {} },
      { id: 'r1', type: 'resistor', label: '220Ω', x: 250, y: 100, props: { ohms: 220 } },
      { id: 'l1', type: 'led', label: 'LED1', x: 400, y: 100, props: { color: '#22c55e' } },
    ],
    wires: [
      { id: 'w1', fromNodeId: 'b1', fromPin: 'D13', toNodeId: 'r1', toPin: 'P1', color: '#0ea5e9', signalType: 'digital' },
      { id: 'w2', fromNodeId: 'r1', fromPin: 'P2', toNodeId: 'l1', toPin: 'ANODE', color: '#22c55e', signalType: 'digital' },
      { id: 'w3', fromNodeId: 'l1', fromPin: 'CATHODE', toNodeId: 'b1', toPin: 'GND', color: '#334155', signalType: 'ground' },
    ],
  };
  const report = validateCircuitDiagram(goodDiagram, uno);
  assert.equal(report.valid, true);
  assert.equal(report.issues[0].severity, 'ok');
});
