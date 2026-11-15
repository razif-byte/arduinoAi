export const E24_RESISTORS = [
  1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
  3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1,
];

export function findNearestStandardResistor(ohms: number): number {
  if (!Number.isFinite(ohms) || ohms <= 0) return 0;
  const decade = Math.pow(10, Math.floor(Math.log10(ohms)));
  const normalized = ohms / decade;
  let best = E24_RESISTORS[0] * decade;
  let minDiff = Infinity;

  for (const val of E24_RESISTORS) {
    const candidate = val * decade;
    const diff = Math.abs(candidate - ohms);
    if (diff < minDiff) {
      minDiff = diff;
      best = candidate;
    }
  }
  const nextDecadeCandidate = E24_RESISTORS[0] * decade * 10;
  if (Math.abs(nextDecadeCandidate - ohms) < minDiff) {
    best = nextDecadeCandidate;
  }
  return Number(best.toPrecision(4));
}

export interface OhmsLawResult {
  voltageV: number;
  currentA: number;
  resistanceOhm: number;
  powerW: number;
}

export function solveOhmsLaw(inputs: {
  voltageV?: number;
  currentA?: number;
  resistanceOhm?: number;
  powerW?: number;
}): OhmsLawResult {
  const { voltageV: V, currentA: I, resistanceOhm: R, powerW: P } = inputs;
  const valid = (n?: number): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n > 0;

  if (valid(V) && valid(R)) {
    const curr = V / R;
    return { voltageV: V, currentA: curr, resistanceOhm: R, powerW: V * curr };
  }
  if (valid(V) && valid(I)) {
    return { voltageV: V, currentA: I, resistanceOhm: V / I, powerW: V * I };
  }
  if (valid(I) && valid(R)) {
    const volt = I * R;
    return { voltageV: volt, currentA: I, resistanceOhm: R, powerW: volt * I };
  }
  if (valid(V) && valid(P)) {
    const curr = P / V;
    return { voltageV: V, currentA: curr, resistanceOhm: (V * V) / P, powerW: P };
  }
  if (valid(I) && valid(P)) {
    const volt = P / I;
    return { voltageV: volt, currentA: I, resistanceOhm: P / (I * I), powerW: P };
  }
  if (valid(R) && valid(P)) {
    const curr = Math.sqrt(P / R);
    return { voltageV: curr * R, currentA: curr, resistanceOhm: R, powerW: P };
  }

  throw new Error('Provide any two positive electrical quantities.');
}

export interface LedResistorResult {
  exactOhms: number;
  standardOhms: number;
  actualCurrentMa: number;
  resistorPowerMw: number;
  recommendedRatingW: number;
}

export function calculateLedResistor(
  supplyV: number,
  forwardV: number,
  targetCurrentMa: number
): LedResistorResult {
  if (supplyV <= forwardV) {
    throw new Error('Supply voltage must exceed LED forward voltage.');
  }
  if (targetCurrentMa <= 0) {
    throw new Error('Target LED current must be greater than 0 mA.');
  }
  const currentA = targetCurrentMa / 1000;
  const dropV = supplyV - forwardV;
  const exactOhms = dropV / currentA;
  const standardOhms = findNearestStandardResistor(exactOhms);
  const actualCurrentA = dropV / standardOhms;
  const resistorPowerW = dropV * actualCurrentA;

  let recommendedRatingW = 0.25;
  if (resistorPowerW > 0.125) recommendedRatingW = 0.5;
  if (resistorPowerW > 0.25) recommendedRatingW = 1.0;
  if (resistorPowerW > 0.5) recommendedRatingW = 2.0;

  return {
    exactOhms: Number(exactOhms.toFixed(2)),
    standardOhms,
    actualCurrentMa: Number((actualCurrentA * 1000).toFixed(2)),
    resistorPowerMw: Number((resistorPowerW * 1000).toFixed(2)),
    recommendedRatingW,
  };
}

export interface VoltageDividerResult {
  vOut: number;
  currentMa: number;
  powerMw: number;
  loadedVOut?: number;
}

export function calculateVoltageDivider(
  vIn: number,
  r1Ohm: number,
  r2Ohm: number,
  loadResistanceOhm?: number
): VoltageDividerResult {
  if (vIn < 0 || r1Ohm <= 0 || r2Ohm <= 0) {
    throw new Error('Input voltage must be non-negative and resistors positive.');
  }
  const totalR = r1Ohm + r2Ohm;
  const vOut = (vIn * r2Ohm) / totalR;
  const currentA = vIn / totalR;
  const powerMw = vIn * currentA * 1000;

  let loadedVOut: number | undefined;
  if (loadResistanceOhm && loadResistanceOhm > 0) {
    const rParallel = (r2Ohm * loadResistanceOhm) / (r2Ohm + loadResistanceOhm);
    loadedVOut = Number(((vIn * rParallel) / (r1Ohm + rParallel)).toFixed(3));
  }

  return {
    vOut: Number(vOut.toFixed(3)),
    currentMa: Number((currentA * 1000).toFixed(3)),
    powerMw: Number(powerMw.toFixed(2)),
    loadedVOut,
  };
}

export interface RcFilterResult {
  timeConstantMs: number;
  fiveTauMs: number;
  cutoffFreqHz: number;
}

export function calculateRcNetwork(resistanceOhm: number, capacitanceUf: number): RcFilterResult {
  if (resistanceOhm <= 0 || capacitanceUf <= 0) {
    throw new Error('Resistance and capacitance must be positive.');
  }
  const cFarads = capacitanceUf * 1e-6;
  const tauSec = resistanceOhm * cFarads;
  const cutoffFreqHz = 1 / (2 * Math.PI * resistanceOhm * cFarads);
  return {
    timeConstantMs: Number((tauSec * 1000).toFixed(4)),
    fiveTauMs: Number((tauSec * 5000).toFixed(4)),
    cutoffFreqHz: Number(cutoffFreqHz.toFixed(3)),
  };
}

export interface BatteryLifeResult {
  runtimeHours: number;
  runtimeDays: number;
  averageCurrentMa: number;
}

export function calculateBatteryLife(
  capacityMah: number,
  activeCurrentMa: number,
  sleepCurrentMa = 0,
  dutyCyclePct = 100,
  efficiencyFactor = 0.85
): BatteryLifeResult {
  if (capacityMah <= 0 || activeCurrentMa <= 0) {
    throw new Error('Capacity and active current must be positive.');
  }
  const duty = Math.min(100, Math.max(0, dutyCyclePct)) / 100;
  const averageCurrentMa = activeCurrentMa * duty + sleepCurrentMa * (1 - duty);
  const effectiveCapacity = capacityMah * efficiencyFactor;
  const runtimeHours = effectiveCapacity / averageCurrentMa;

  return {
    runtimeHours: Number(runtimeHours.toFixed(2)),
    runtimeDays: Number((runtimeHours / 24).toFixed(2)),
    averageCurrentMa: Number(averageCurrentMa.toFixed(3)),
  };
}

export interface PwmTimerResult {
  frequencyHz: number;
  periodUs: number;
  dutyPct: number;
  averageVoltageV: number;
}

export function calculatePwmParameters(
  clockMHz: number,
  prescaler: number,
  resolutionBits: number,
  dutyValue: number,
  logicVoltageV = 3.3
): PwmTimerResult {
  if (clockMHz <= 0 || prescaler <= 0 || resolutionBits < 1 || resolutionBits > 16) {
    throw new Error('Invalid PWM timer configuration.');
  }
  const maxCounts = Math.pow(2, resolutionBits);
  const clampedDuty = Math.min(maxCounts - 1, Math.max(0, dutyValue));
  const frequencyHz = (clockMHz * 1_000_000) / (prescaler * maxCounts);
  const periodUs = 1_000_000 / frequencyHz;
  const dutyPct = (clampedDuty / (maxCounts - 1)) * 100;
  const averageVoltageV = (dutyPct / 100) * logicVoltageV;

  return {
    frequencyHz: Number(frequencyHz.toFixed(2)),
    periodUs: Number(periodUs.toFixed(2)),
    dutyPct: Number(dutyPct.toFixed(2)),
    averageVoltageV: Number(averageVoltageV.toFixed(3)),
  };
}

export interface TransistorSwitchResult {
  baseResistorOhm: number;
  standardBaseResistorOhm: number;
  baseCurrentMa: number;
  saturated: boolean;
}

export function calculateBjtSwitch(
  vGpio: number,
  loadCurrentMa: number,
  hfe: number,
  vBe = 0.7,
  overdriveFactor = 2.5
): TransistorSwitchResult {
  if (vGpio <= vBe || loadCurrentMa <= 0 || hfe <= 0) {
    throw new Error('GPIO voltage must exceed Vbe and load/gain must be positive.');
  }
  const minIbMa = loadCurrentMa / hfe;
  const targetIbMa = minIbMa * overdriveFactor;
  const exactRb = (vGpio - vBe) / (targetIbMa / 1000);
  const standardRb = findNearestStandardResistor(exactRb);
  const actualIbMa = ((vGpio - vBe) / standardRb) * 1000;

  return {
    baseResistorOhm: Number(exactRb.toFixed(1)),
    standardBaseResistorOhm: standardRb,
    baseCurrentMa: Number(actualIbMa.toFixed(2)),
    saturated: actualIbMa >= minIbMa,
  };
}

export interface MosfetPowerResult {
  conductionLossMw: number;
  voltageDropMv: number;
  recommendedHeatsink: boolean;
}

export function calculateMosfetConduction(
  loadCurrentA: number,
  rdsOnMilliOhm: number
): MosfetPowerResult {
  if (loadCurrentA < 0 || rdsOnMilliOhm <= 0) {
    throw new Error('Load current and Rds(on) must be valid.');
  }
  const rdsOhm = rdsOnMilliOhm / 1000;
  const powerW = loadCurrentA * loadCurrentA * rdsOhm;
  const dropMv = loadCurrentA * rdsOnMilliOhm;
  return {
    conductionLossMw: Number((powerW * 1000).toFixed(2)),
    voltageDropMv: Number(dropMv.toFixed(2)),
    recommendedHeatsink: powerW > 0.75,
  };
}

export type LogicGateType = 'AND' | 'OR' | 'NAND' | 'NOR' | 'XOR' | 'XNOR' | 'NOT';

export function evaluateLogicGate(gate: LogicGateType, a: boolean, b = false): boolean {
  switch (gate) {
    case 'AND':
      return a && b;
    case 'OR':
      return a || b;
    case 'NAND':
      return !(a && b);
    case 'NOR':
      return !(a || b);
    case 'XOR':
      return a !== b;
    case 'XNOR':
      return a === b;
    case 'NOT':
      return !a;
  }
}

export const RESISTOR_COLOR_DIGITS: Record<string, { digit?: number; multiplier?: number; tolerance?: string; hex: string }> = {
  black: { digit: 0, multiplier: 1, hex: '#111827' },
  brown: { digit: 1, multiplier: 10, tolerance: '±1%', hex: '#78350F' },
  red: { digit: 2, multiplier: 100, tolerance: '±2%', hex: '#DC2626' },
  orange: { digit: 3, multiplier: 1000, hex: '#EA580C' },
  yellow: { digit: 4, multiplier: 10000, hex: '#EAB308' },
  green: { digit: 5, multiplier: 100000, tolerance: '±0.5%', hex: '#16A34A' },
  blue: { digit: 6, multiplier: 1000000, tolerance: '±0.25%', hex: '#2563EB' },
  violet: { digit: 7, multiplier: 10000000, tolerance: '±0.1%', hex: '#7C3AED' },
  gray: { digit: 8, hex: '#64748B' },
  white: { digit: 9, hex: '#F8FAFC' },
  gold: { multiplier: 0.1, tolerance: '±5%', hex: '#CA8A04' },
  silver: { multiplier: 0.01, tolerance: '±10%', hex: '#94A3B8' },
};

export function decodeResistor4Band(
  band1: string,
  band2: string,
  multiplierBand: string,
  toleranceBand: string
): { ohms: number; formatted: string; tolerance: string } {
  const d1 = RESISTOR_COLOR_DIGITS[band1]?.digit;
  const d2 = RESISTOR_COLOR_DIGITS[band2]?.digit;
  const mult = RESISTOR_COLOR_DIGITS[multiplierBand]?.multiplier;
  const tol = RESISTOR_COLOR_DIGITS[toleranceBand]?.tolerance ?? '±5%';

  if (d1 === undefined || d2 === undefined || mult === undefined) {
    throw new Error('Invalid resistor color band selection.');
  }
  const ohms = (d1 * 10 + d2) * mult;
  let formatted = `${ohms} Ω`;
  if (ohms >= 1_000_000) formatted = `${Number((ohms / 1_000_000).toFixed(2))} MΩ`;
  else if (ohms >= 1000) formatted = `${Number((ohms / 1000).toFixed(2))} kΩ`;
  return { ohms, formatted, tolerance: tol };
}
