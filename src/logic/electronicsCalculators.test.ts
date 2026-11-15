import test from 'node:test';
import assert from 'node:assert/strict';
import {
  solveOhmsLaw,
  calculateLedResistor,
  calculateVoltageDivider,
  calculateRcNetwork,
  calculateBatteryLife,
  calculatePwmParameters,
  calculateBjtSwitch,
  calculateMosfetConduction,
  evaluateLogicGate,
  decodeResistor4Band,
} from './electronicsCalculators';

test('solveOhmsLaw calculates V, I, R, P accurately', () => {
  const res = solveOhmsLaw({ voltageV: 5, resistanceOhm: 250 });
  assert.equal(res.currentA, 0.02);
  assert.equal(res.powerW, 0.1);
});

test('calculateLedResistor selects nearest E24 resistor and safe rating', () => {
  const res = calculateLedResistor(5, 2.0, 15);
  assert.equal(res.exactOhms, 200);
  assert.equal(res.standardOhms, 200);
  assert.equal(res.recommendedRatingW, 0.25);
});

test('calculateVoltageDivider handles 5V-to-3.3V HC-SR04 divider', () => {
  const res = calculateVoltageDivider(5, 1000, 2000);
  assert.ok(Math.abs(res.vOut - 3.333) < 0.01);
});

test('calculateRcNetwork computes tau and cutoff frequency', () => {
  const res = calculateRcNetwork(1000, 10);
  assert.equal(res.timeConstantMs, 10);
  assert.equal(res.fiveTauMs, 50);
  assert.ok(Math.abs(res.cutoffFreqHz - 15.915) < 0.01);
});

test('calculateBatteryLife computes runtime with sleep duty cycle', () => {
  const res = calculateBatteryLife(2000, 80, 0.5, 10, 0.85);
  assert.ok(res.averageCurrentMa < 10);
  assert.ok(res.runtimeHours > 180);
});

test('calculatePwmParameters computes frequency and average voltage', () => {
  const res = calculatePwmParameters(16, 64, 8, 128, 5);
  assert.ok(Math.abs(res.frequencyHz - 976.56) < 0.1);
  assert.ok(Math.abs(res.averageVoltageV - 2.51) < 0.05);
});

test('calculateBjtSwitch guarantees saturation', () => {
  const res = calculateBjtSwitch(3.3, 100, 100);
  assert.equal(res.saturated, true);
  assert.ok(res.standardBaseResistorOhm > 500);
});

test('calculateMosfetConduction flags heatsink when dissipation > 0.75W', () => {
  const cool = calculateMosfetConduction(2, 22);
  assert.equal(cool.recommendedHeatsink, false);
  const hot = calculateMosfetConduction(10, 22);
  assert.equal(hot.recommendedHeatsink, true);
});

test('evaluateLogicGate evaluates standard boolean gates', () => {
  assert.equal(evaluateLogicGate('XOR', true, false), true);
  assert.equal(evaluateLogicGate('XOR', true, true), false);
  assert.equal(evaluateLogicGate('NAND', true, true), false);
  assert.equal(evaluateLogicGate('NOT', false), true);
});

test('decodeResistor4Band decodes 10k ohm brown-black-orange-gold', () => {
  const res = decodeResistor4Band('brown', 'black', 'orange', 'gold');
  assert.equal(res.ohms, 10000);
  assert.equal(res.formatted, '10 kΩ');
  assert.equal(res.tolerance, '±5%');
});
