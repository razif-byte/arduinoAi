import { BoardSpec, CircuitDiagram } from '../types/studio';

export interface CircuitValidationIssue {
  id: string;
  severity: 'error' | 'warning' | 'ok';
  title: string;
  detail: string;
  nodeIds: string[];
}

export interface CircuitValidationReport {
  valid: boolean;
  issues: CircuitValidationIssue[];
  pinUsage: { pin: string; connectedTo: string; signalType: string }[];
}

export function validateCircuitDiagram(diagram: CircuitDiagram, board: BoardSpec): CircuitValidationReport {
  const issues: CircuitValidationIssue[] = [];
  const pinUsage: { pin: string; connectedTo: string; signalType: string }[] = [];

  const boardNode = diagram.nodes.find((n) => n.type === 'board');
  if (!boardNode) {
    return {
      valid: false,
      issues: [
        {
          id: 'no-board',
          severity: 'error',
          title: 'Missing Controller Board',
          detail: 'Add a microcontroller board to validate GPIO and power connections.',
          nodeIds: [],
        },
      ],
      pinUsage: [],
    };
  }

  // Check for direct power-to-ground shorts on any wire
  for (const wire of diagram.wires) {
    const fromPin = wire.fromPin.toUpperCase();
    const toPin = wire.toPin.toUpperCase();
    const isPower = (p: string) => p.includes('5V') || p.includes('3V3') || p.includes('VCC') || p.includes('VIN');
    const isGnd = (p: string) => p.includes('GND');

    if ((isPower(fromPin) && isGnd(toPin)) || (isGnd(fromPin) && isPower(toPin))) {
      issues.push({
        id: `short-${wire.id}`,
        severity: 'error',
        title: 'Direct Power-to-Ground Short Detected',
        detail: `Wire ${wire.fromPin} → ${wire.toPin} shorts supply directly to GND.`,
        nodeIds: [wire.fromNodeId, wire.toNodeId],
      });
    }

    if (wire.fromNodeId === boardNode.id) {
      const targetNode = diagram.nodes.find((n) => n.id === wire.toNodeId);
      pinUsage.push({
        pin: wire.fromPin,
        connectedTo: targetNode ? `${targetNode.label} (${wire.toPin})` : wire.toPin,
        signalType: wire.signalType,
      });
    } else if (wire.toNodeId === boardNode.id) {
      const sourceNode = diagram.nodes.find((n) => n.id === wire.fromNodeId);
      pinUsage.push({
        pin: wire.toPin,
        connectedTo: sourceNode ? `${sourceNode.label} (${wire.fromPin})` : wire.fromPin,
        signalType: wire.signalType,
      });
    }
  }

  // Check each component for required resistor / logic level safety
  for (const node of diagram.nodes) {
    if (node.id === boardNode.id) continue;
    const connectedWires = diagram.wires.filter(
      (w) => w.fromNodeId === node.id || w.toNodeId === node.id
    );

    if (connectedWires.length === 0) {
      issues.push({
        id: `floating-${node.id}`,
        severity: 'warning',
        title: `Unwired Component: ${node.label}`,
        detail: `${node.label} has no wires attached. Connect signal, power, and ground pins.`,
        nodeIds: [node.id],
      });
      continue;
    }

    if (node.type === 'led') {
      const connectedToResistor = connectedWires.some((w) => {
        const otherId = w.fromNodeId === node.id ? w.toNodeId : w.fromNodeId;
        return diagram.nodes.find((n) => n.id === otherId)?.type === 'resistor';
      });
      if (!connectedToResistor) {
        issues.push({
          id: `led-res-${node.id}`,
          severity: 'warning',
          title: `Missing Current-Limiting Resistor on ${node.label}`,
          detail: `Place a 220Ω–330Ω series resistor on the LED anode/cathode to protect the ${board.name} GPIO pin.`,
          nodeIds: [node.id],
        });
      }
    }

    if (node.type === 'ultrasonic' && board.logicVoltage === 3.3) {
      issues.push({
        id: `level-${node.id}`,
        severity: 'warning',
        title: `5V Logic Level Warning on ${node.label}`,
        detail: `HC-SR04 ECHO outputs 5V while ${board.name} is 3.3V logic. Add a 1kΩ/2kΩ voltage divider on ECHO.`,
        nodeIds: [node.id],
      });
    }
  }

  // Check duplicate GPIO pin assignment on non-shared buses
  const pinCounts = new Map<string, number>();
  for (const usage of pinUsage) {
    const p = usage.pin.toUpperCase();
    if (p === 'GND' || p === '5V' || p === '3V3' || p === 'VIN' || usage.signalType === 'i2c') continue;
    pinCounts.set(p, (pinCounts.get(p) ?? 0) + 1);
  }
  for (const [pin, count] of pinCounts.entries()) {
    if (count > 1) {
      issues.push({
        id: `conflict-${pin}`,
        severity: 'error',
        title: `GPIO Conflict on ${pin}`,
        detail: `${pin} is assigned to ${count} separate signals.`,
        nodeIds: [boardNode.id],
      });
    }
  }

  if (issues.length === 0) {
    issues.push({
      id: 'all-clear',
      severity: 'ok',
      title: 'Electrical Rules Passed',
      detail: `Verified ${diagram.wires.length} connections across ${diagram.nodes.length} components with zero conflicts.`,
      nodeIds: [],
    });
  }

  return {
    valid: !issues.some((i) => i.severity === 'error'),
    issues,
    pinUsage,
  };
}
