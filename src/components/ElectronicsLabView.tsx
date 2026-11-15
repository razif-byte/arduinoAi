import { useMemo, useState } from 'react';
import { SUPPORTED_BOARDS } from '../data/boardsAndComponents';
import {
  calculateBatteryLife,
  calculateBjtSwitch,
  calculateLedResistor,
  calculateMosfetConduction,
  calculatePwmParameters,
  calculateRcNetwork,
  calculateVoltageDivider,
  decodeResistor4Band,
  evaluateLogicGate,
  LogicGateType,
  RESISTOR_COLOR_DIGITS,
  solveOhmsLaw,
} from '../logic/electronicsCalculators';

type LabTool =
  | 'ohms'
  | 'led'
  | 'divider'
  | 'color'
  | 'capacitor'
  | 'transistor'
  | 'battery'
  | 'pwm'
  | 'logic'
  | 'pinout'
  | 'pcb';

export function ElectronicsLabView({ boardId }: { boardId: string }) {
  const [tool, setTool] = useState<LabTool>('ohms');

  // Ohm's Law
  const [ohmV, setOhmV] = useState('5');
  const [ohmR, setOhmR] = useState('220');
  const ohmResult = useMemo(() => {
    try {
      return solveOhmsLaw({ voltageV: Number(ohmV), resistanceOhm: Number(ohmR) });
    } catch {
      return null;
    }
  }, [ohmV, ohmR]);

  // LED Resistor
  const [ledVs, setLedVs] = useState('5');
  const [ledVf, setLedVf] = useState('2.0');
  const [ledMa, setLedMa] = useState('15');
  const ledResult = useMemo(() => {
    try {
      return calculateLedResistor(Number(ledVs), Number(ledVf), Number(ledMa));
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Invalid input' };
    }
  }, [ledVs, ledVf, ledMa]);

  // Voltage Divider
  const [divVin, setDivVin] = useState('5');
  const [divR1, setDivR1] = useState('1000');
  const [divR2, setDivR2] = useState('2000');
  const [divLoad, setDivLoad] = useState('100000');
  const divResult = useMemo(() => {
    try {
      return calculateVoltageDivider(Number(divVin), Number(divR1), Number(divR2), Number(divLoad) || undefined);
    } catch {
      return null;
    }
  }, [divVin, divR1, divR2, divLoad]);

  // Resistor Color Code
  const [b1, setB1] = useState('brown');
  const [b2, setB2] = useState('black');
  const [b3, setB3] = useState('orange');
  const [b4, setB4] = useState('gold');
  const colorResult = useMemo(() => {
    try {
      return decodeResistor4Band(b1, b2, b3, b4);
    } catch {
      return null;
    }
  }, [b1, b2, b3, b4]);

  // RC Capacitor
  const [rcR, setRcR] = useState('10000');
  const [rcC, setRcC] = useState('10');
  const rcResult = useMemo(() => {
    try {
      return calculateRcNetwork(Number(rcR), Number(rcC));
    } catch {
      return null;
    }
  }, [rcR, rcC]);

  // Transistor & MOSFET
  const [bjtVg, setBjtVg] = useState('3.3');
  const [bjtIc, setBjtIc] = useState('150');
  const [bjtHfe, setBjtHfe] = useState('100');
  const [mosId, setMosId] = useState('5');
  const [mosRds, setMosRds] = useState('22');
  const bjtRes = useMemo(() => {
    try {
      return calculateBjtSwitch(Number(bjtVg), Number(bjtIc), Number(bjtHfe));
    } catch {
      return null;
    }
  }, [bjtVg, bjtIc, bjtHfe]);
  const mosRes = useMemo(() => {
    try {
      return calculateMosfetConduction(Number(mosId), Number(mosRds));
    } catch {
      return null;
    }
  }, [mosId, mosRds]);

  // Battery & DC Power
  const [batMah, setBatMah] = useState('2500');
  const [batActive, setBatActive] = useState('85');
  const [batSleep, setBatSleep] = useState('0.2');
  const [batDuty, setBatDuty] = useState('15');
  const batRes = useMemo(() => {
    try {
      return calculateBatteryLife(Number(batMah), Number(batActive), Number(batSleep), Number(batDuty));
    } catch {
      return null;
    }
  }, [batMah, batActive, batSleep, batDuty]);

  // PWM
  const [pwmClk, setPwmClk] = useState('80');
  const [pwmPre, setPwmPre] = useState('8');
  const [pwmBits, setPwmBits] = useState('8');
  const [pwmDuty, setPwmDuty] = useState('128');
  const pwmRes = useMemo(() => {
    try {
      return calculatePwmParameters(Number(pwmClk), Number(pwmPre), Number(pwmBits), Number(pwmDuty), 3.3);
    } catch {
      return null;
    }
  }, [pwmClk, pwmPre, pwmBits, pwmDuty]);

  // Logic Gate Simulator
  const [gateType, setGateType] = useState<LogicGateType>('XOR');
  const [inA, setInA] = useState(true);
  const [inB, setInB] = useState(false);
  const gateOut = evaluateLogicGate(gateType, inA, inB);

  // Pinout Board
  const [pinoutBoardId, setPinoutBoardId] = useState(boardId);
  const pinoutBoard = SUPPORTED_BOARDS.find((b) => b.id === pinoutBoardId) ?? SUPPORTED_BOARDS[0];

  const tabs: Array<{ id: LabTool; label: string }> = [
    { id: 'ohms', label: "Ohm's Law & Power" },
    { id: 'led', label: 'LED Resistor' },
    { id: 'divider', label: 'Voltage Divider' },
    { id: 'color', label: 'Resistor Color Code' },
    { id: 'capacitor', label: 'RC / Capacitor' },
    { id: 'transistor', label: 'BJT & MOSFET' },
    { id: 'battery', label: 'Battery & DC Power' },
    { id: 'pwm', label: 'PWM Timer' },
    { id: 'logic', label: 'Logic Gate Sim' },
    { id: 'pinout', label: 'Pinout Visualizer' },
    { id: 'pcb', label: 'PCB Design Guide' },
  ];

  const digitColors = Object.entries(RESISTOR_COLOR_DIGITS).filter(([, v]) => v.digit !== undefined);
  const multColors = Object.entries(RESISTOR_COLOR_DIGITS).filter(([, v]) => v.multiplier !== undefined);
  const tolColors = Object.entries(RESISTOR_COLOR_DIGITS).filter(([, v]) => v.tolerance !== undefined);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Electronics Engineering Laboratory
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Precision calculators, E24 component sizing, logic gate simulator, board pinouts, and PCB layout rules.
        </p>
      </div>

      {/* Tool Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTool(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tool === t.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
        {tool === 'ohms' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h2 className="text-base font-semibold">Ohm's Law & DC Power Solver</h2>
              <label className="block text-xs space-y-1">
                <span className="text-slate-500">Voltage (V)</span>
                <input type="number" step="any" value={ohmV} onChange={(e) => setOhmV(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
              </label>
              <label className="block text-xs space-y-1">
                <span className="text-slate-500">Resistance (Ω)</span>
                <input type="number" step="any" value={ohmR} onChange={(e) => setOhmR(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
              </label>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-sm font-mono tabular-nums">
              {ohmResult ? (
                <>
                  <div>Current (I): {(ohmResult.currentA * 1000).toFixed(2)} mA ({ohmResult.currentA.toFixed(4)} A)</div>
                  <div>Power (P): {(ohmResult.powerW * 1000).toFixed(2)} mW ({ohmResult.powerW.toFixed(4)} W)</div>
                  <div>Voltage (V): {ohmResult.voltageV} V</div>
                  <div>Resistance (R): {ohmResult.resistanceOhm} Ω</div>
                </>
              ) : (
                <div className="text-rose-500 text-xs">Enter positive Voltage and Resistance values.</div>
              )}
            </div>
          </div>
        )}

        {tool === 'led' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h2 className="text-base font-semibold">LED Current-Limiting Resistor (E24 Match)</h2>
              <label className="block text-xs space-y-1">
                <span className="text-slate-500">Supply Voltage Vs (V)</span>
                <input type="number" step="0.1" value={ledVs} onChange={(e) => setLedVs(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
              </label>
              <label className="block text-xs space-y-1">
                <span className="text-slate-500">LED Forward Voltage Vf (Red ~2.0V, Blue/White ~3.1V)</span>
                <input type="number" step="0.1" value={ledVf} onChange={(e) => setLedVf(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
              </label>
              <label className="block text-xs space-y-1">
                <span className="text-slate-500">Target Forward Current (mA)</span>
                <input type="number" step="1" value={ledMa} onChange={(e) => setLedMa(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
              </label>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-sm font-mono tabular-nums">
              {'error' in ledResult ? (
                <div className="text-rose-500 text-xs">{ledResult.error}</div>
              ) : (
                <>
                  <div>Exact Resistor: {ledResult.exactOhms} Ω</div>
                  <div className="text-sky-600 dark:text-sky-400 font-semibold">Nearest E24 Standard: {ledResult.standardOhms} Ω</div>
                  <div>Actual LED Current: {ledResult.actualCurrentMa} mA</div>
                  <div>Power Dissipation: {ledResult.resistorPowerMw} mW</div>
                  <div>Recommended Rating: {ledResult.recommendedRatingW} W</div>
                </>
              )}
            </div>
          </div>
        )}

        {tool === 'divider' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Voltage Divider Calculator</h2>
                <button
                  type="button"
                  onClick={() => { setDivVin('5'); setDivR1('1000'); setDivR2('2000'); }}
                  className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
                >
                  Load 5V → 3.3V Level Shift Preset
                </button>
              </div>
              <label className="block text-xs space-y-1">
                <span className="text-slate-500">Input Voltage Vin (V)</span>
                <input type="number" step="any" value={divVin} onChange={(e) => setDivVin(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs space-y-1">
                  <span className="text-slate-500">Top R1 (Ω)</span>
                  <input type="number" step="any" value={divR1} onChange={(e) => setDivR1(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
                </label>
                <label className="block text-xs space-y-1">
                  <span className="text-slate-500">Bottom R2 (Ω)</span>
                  <input type="number" step="any" value={divR2} onChange={(e) => setDivR2(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
                </label>
              </div>
              <label className="block text-xs space-y-1">
                <span className="text-slate-500">ADC / Load Impedance (Ω, optional)</span>
                <input type="number" step="any" value={divLoad} onChange={(e) => setDivLoad(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
              </label>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-sm font-mono tabular-nums">
              {divResult ? (
                <>
                  <div className="text-sky-600 dark:text-sky-400 font-semibold">Unloaded Vout: {divResult.vOut} V</div>
                  {divResult.loadedVOut !== undefined && <div>Loaded Vout: {divResult.loadedVOut} V</div>}
                  <div>Quiescent Current: {divResult.currentMa} mA</div>
                  <div>Static Loss: {divResult.powerMw} mW</div>
                </>
              ) : (
                <div className="text-rose-500 text-xs">Invalid divider parameters.</div>
              )}
            </div>
          </div>
        )}

        {tool === 'color' && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold">4-Band Resistor Color Code Decoder</h2>
            <svg viewBox="0 0 420 90" className="w-full max-w-md h-24">
              <line x1="10" y1="45" x2="410" y2="45" stroke="#94A3B8" strokeWidth="6" />
              <rect x="85" y="20" width="250" height="50" rx="14" fill="#E2C799" stroke="#B4935E" strokeWidth="2" />
              <rect x="120" y="20" width="18" height="50" fill={RESISTOR_COLOR_DIGITS[b1]?.hex} />
              <rect x="160" y="20" width="18" height="50" fill={RESISTOR_COLOR_DIGITS[b2]?.hex} />
              <rect x="200" y="20" width="18" height="50" fill={RESISTOR_COLOR_DIGITS[b3]?.hex} />
              <rect x="285" y="20" width="18" height="50" fill={RESISTOR_COLOR_DIGITS[b4]?.hex} />
            </svg>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-slate-500">Band 1 (1st Digit)</span>
                <select value={b1} onChange={(e) => setB1(e.target.value)} className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 capitalize">
                  {digitColors.map(([k]) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-slate-500">Band 2 (2nd Digit)</span>
                <select value={b2} onChange={(e) => setB2(e.target.value)} className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 capitalize">
                  {digitColors.map(([k]) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-slate-500">Multiplier</span>
                <select value={b3} onChange={(e) => setB3(e.target.value)} className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 capitalize">
                  {multColors.map(([k]) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-slate-500">Tolerance</span>
                <select value={b4} onChange={(e) => setB4(e.target.value)} className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 capitalize">
                  {tolColors.map(([k]) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
            </div>
            {colorResult && (
              <div className="text-lg font-mono font-bold text-sky-600 dark:text-sky-400">
                Value: {colorResult.formatted} {colorResult.tolerance} ({colorResult.ohms.toLocaleString()} Ω)
              </div>
            )}
          </div>
        )}

        {tool === 'capacitor' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h2 className="text-base font-semibold">RC Time Constant & Low-Pass Cutoff</h2>
              <label className="block text-xs space-y-1">
                <span className="text-slate-500">Resistance R (Ω)</span>
                <input type="number" value={rcR} onChange={(e) => setRcR(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
              </label>
              <label className="block text-xs space-y-1">
                <span className="text-slate-500">Capacitance C (µF)</span>
                <input type="number" step="0.1" value={rcC} onChange={(e) => setRcC(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
              </label>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-sm font-mono tabular-nums">
              {rcResult && (
                <>
                  <div>Time Constant (τ = R·C): {rcResult.timeConstantMs} ms</div>
                  <div>Full Charge (5τ, 99.3%): {rcResult.fiveTauMs} ms</div>
                  <div className="text-sky-600 dark:text-sky-400 font-semibold">-3dB Cutoff Frequency: {rcResult.cutoffFreqHz} Hz</div>
                </>
              )}
            </div>
          </div>
        )}

        {tool === 'transistor' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h2 className="text-base font-semibold">BJT Low-Side Saturation Switch</h2>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <label className="space-y-1">
                  <span className="text-slate-500">GPIO (V)</span>
                  <input type="number" step="0.1" value={bjtVg} onChange={(e) => setBjtVg(e.target.value)} className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-500">Load (mA)</span>
                  <input type="number" value={bjtIc} onChange={(e) => setBjtIc(e.target.value)} className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-500">hFE Gain</span>
                  <input type="number" value={bjtHfe} onChange={(e) => setBjtHfe(e.target.value)} className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
                </label>
              </div>
              {bjtRes && (
                <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 font-mono text-xs space-y-1">
                  <div>Recommended Base Resistor: {bjtRes.standardBaseResistorOhm} Ω</div>
                  <div>Base Drive Current: {bjtRes.baseCurrentMa} mA ({bjtRes.saturated ? 'Saturated' : 'Linear'})</div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="text-base font-semibold">MOSFET Conduction Loss</h2>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="space-y-1">
                  <span className="text-slate-500">Load Current Id (A)</span>
                  <input type="number" step="0.5" value={mosId} onChange={(e) => setMosId(e.target.value)} className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-500">Rds(on) (mΩ)</span>
                  <input type="number" value={mosRds} onChange={(e) => setMosRds(e.target.value)} className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
                </label>
              </div>
              {mosRes && (
                <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 font-mono text-xs space-y-1">
                  <div>Conduction Power Loss: {mosRes.conductionLossMw} mW</div>
                  <div>Drain-Source Drop: {mosRes.voltageDropMv} mV</div>
                  <div>Thermal Note: {mosRes.recommendedHeatsink ? 'Heatsink Recommended' : 'Bare TO-220 Safe'}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {tool === 'battery' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h2 className="text-base font-semibold">Battery Capacity & Sleep Duty Runtime</h2>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-slate-500">Capacity (mAh)</span>
                  <input type="number" value={batMah} onChange={(e) => setBatMah(e.target.value)} className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-500">Active Current (mA)</span>
                  <input type="number" value={batActive} onChange={(e) => setBatActive(e.target.value)} className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-500">Deep Sleep (mA)</span>
                  <input type="number" step="0.05" value={batSleep} onChange={(e) => setBatSleep(e.target.value)} className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-500">Active Duty Cycle (%)</span>
                  <input type="number" min={0} max={100} value={batDuty} onChange={(e) => setBatDuty(e.target.value)} className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
                </label>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-sm font-mono tabular-nums">
              {batRes && (
                <>
                  <div className="text-sky-600 dark:text-sky-400 font-semibold">Estimated Runtime: {batRes.runtimeHours} hours ({batRes.runtimeDays} days)</div>
                  <div>Average System Draw: {batRes.averageCurrentMa} mA</div>
                  <div className="text-xs text-slate-500">Includes 85% usable capacity derating factor.</div>
                </>
              )}
            </div>
          </div>
        )}

        {tool === 'pwm' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h2 className="text-base font-semibold">Hardware Timer PWM Calculator</h2>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-slate-500">Timer Clock (MHz)</span>
                  <input type="number" value={pwmClk} onChange={(e) => setPwmClk(e.target.value)} className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-500">Prescaler</span>
                  <input type="number" value={pwmPre} onChange={(e) => setPwmPre(e.target.value)} className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-500">Resolution (Bits)</span>
                  <input type="number" min={1} max={16} value={pwmBits} onChange={(e) => setPwmBits(e.target.value)} className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-500">Duty Count</span>
                  <input type="number" value={pwmDuty} onChange={(e) => setPwmDuty(e.target.value)} className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono" />
                </label>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-sm font-mono tabular-nums">
              {pwmRes && (
                <>
                  <div className="text-sky-600 dark:text-sky-400 font-semibold">PWM Frequency: {pwmRes.frequencyHz.toLocaleString()} Hz</div>
                  <div>Period: {pwmRes.periodUs} µs</div>
                  <div>Duty Cycle: {pwmRes.dutyPct}%</div>
                  <div>Average DC Output (3.3V): {pwmRes.averageVoltageV} V</div>
                </>
              )}
            </div>
          </div>
        )}

        {tool === 'logic' && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold">Digital Logic Gate Simulator</h2>
            <div className="flex flex-wrap items-center gap-4">
              <select
                value={gateType}
                onChange={(e) => setGateType(e.target.value as LogicGateType)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
              >
                {(['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR', 'NOT'] as const).map((g) => (
                  <option key={g} value={g}>{g} Gate</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setInA((v) => !v)}
                className={`px-4 py-2 rounded-lg text-xs font-mono font-semibold ${inA ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
              >
                Input A = {inA ? 'HIGH (1)' : 'LOW (0)'}
              </button>
              {gateType !== 'NOT' && (
                <button
                  type="button"
                  onClick={() => setInB((v) => !v)}
                  className={`px-4 py-2 rounded-lg text-xs font-mono font-semibold ${inB ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
                >
                  Input B = {inB ? 'HIGH (1)' : 'LOW (0)'}
                </button>
              )}
              <div className={`px-4 py-2 rounded-lg text-xs font-mono font-bold ${gateOut ? 'bg-sky-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
                OUTPUT Q = {gateOut ? 'HIGH (1)' : 'LOW (0)'}
              </div>
            </div>
          </div>
        )}

        {tool === 'pinout' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold">Microcontroller Pinout Visualizer</h2>
              <select
                value={pinoutBoardId}
                onChange={(e) => setPinoutBoardId(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              >
                {SUPPORTED_BOARDS.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="font-semibold text-sky-600 dark:text-sky-400">Digital & PWM Pins</div>
                <div className="font-mono text-slate-600 dark:text-slate-300 leading-relaxed">
                  {pinoutBoard.digitalPins.join(', ')}
                </div>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="font-semibold text-emerald-600 dark:text-emerald-400">Analog ADC Inputs</div>
                <div className="font-mono text-slate-600 dark:text-slate-300 leading-relaxed">
                  {pinoutBoard.analogPins.join(', ')}
                </div>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="font-semibold text-amber-600 dark:text-amber-400">Communication Buses</div>
                <div className="font-mono text-slate-600 dark:text-slate-300 space-y-1">
                  <div>I2C: SDA {pinoutBoard.i2cPins.sda} / SCL {pinoutBoard.i2cPins.scl}</div>
                  <div>SPI: MOSI {pinoutBoard.spiPins.mosi} / MISO {pinoutBoard.spiPins.miso} / SCK {pinoutBoard.spiPins.sck}</div>
                  <div>UART: TX {pinoutBoard.uartPins.tx} / RX {pinoutBoard.uartPins.rx}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tool === 'pcb' && (
          <div className="space-y-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Embedded PCB Design & DFM Assistant
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Place 100nF ceramic decoupling capacitors within 3mm of every microcontroller VDD/GND pin pair.</li>
              <li>Use a continuous solid ground plane on the bottom layer for 2-layer ESP32/STM32 boards; keep antenna keep-out zone copper-free.</li>
              <li>Trace width rule: minimum 0.25mm (10 mil) for signals, 0.5mm–1.0mm (20–40 mil) for 1A–2A power rails (1 oz copper).</li>
              <li>Add 4.7kΩ I2C pull-up resistors to 3.3V on SDA/SCL and TVS ESD diodes on exposed USB/UART connectors.</li>
              <li>Separate high-voltage AC relay traces by at least 3.0mm clearance + milled air-gap slots from low-voltage MCU logic.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
