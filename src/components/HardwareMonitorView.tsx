import { useState } from 'react';
import { Activity, Gauge, Power, Sliders } from 'lucide-react';
import { SUPPORTED_BOARDS } from '../data/boardsAndComponents';
import type { HardwareTelemetryState } from '../types/studio';

interface HardwareMonitorViewProps {
  telemetry: HardwareTelemetryState;
  onSendCommand: (command: string) => Promise<{ ok: boolean; ack: string }>;
}

export function HardwareMonitorView({ telemetry, onSendCommand }: HardwareMonitorViewProps) {
  const [calOffset, setCalOffset] = useState('0.0');
  const [lastAck, setLastAck] = useState<string | null>(null);
  const board = SUPPORTED_BOARDS.find((b) => b.id === telemetry.boardId) ?? SUPPORTED_BOARDS[0];

  const dispatch = async (cmd: string) => {
    const res = await onSendCommand(cmd);
    setLastAck(res.ack);
  };

  const gpioEntries =
    board.architecture === 'C51'
      ? [
          { pin: 30, label: 'P3.0 RXD' },
          { pin: 31, label: 'P3.1 TXD' },
          { pin: 32, label: 'P3.2 PWM' },
          { pin: 33, label: 'P3.3 SDA' },
          { pin: 54, label: 'P5.4 LED' },
          { pin: 55, label: 'P5.5 ADC' },
        ]
      : [2, 4, 5, 12, 13, 14, 15, 18].map((pin) => ({ pin, label: `GPIO ${pin}` }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Real-Time Hardware Monitor & Control
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Live sensor telemetry and protocol-validated GPIO, relay, servo, and motor actuators for {board.name}.
          </p>
        </div>
        {lastAck && (
          <div className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 font-mono text-xs text-sky-600 dark:text-sky-400">
            Last ACK: {lastAck}
          </div>
        )}
      </div>

      {/* Live Telemetry Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Bus Voltage</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {telemetry.sensors.voltageV.toFixed(2)} V
          </div>
        </div>
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Current Draw</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {telemetry.sensors.currentMa} mA
          </div>
        </div>
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Temperature</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {telemetry.sensors.temperatureC.toFixed(1)} °C
          </div>
        </div>
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Humidity</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {telemetry.sensors.humidityPct.toFixed(1)} %
          </div>
        </div>
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <div className="text-xs text-slate-500 dark:text-slate-400">ADC Raw (12-bit)</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {telemetry.sensors.adcRaw}
          </div>
        </div>
      </div>

      {/* Interactive Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GPIO & Relay Controls */}
        <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-4">
          <div className="flex items-center gap-2">
            <Power className="w-4 h-4 text-sky-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Digital GPIO & Relay Matrix
            </h2>
          </div>

          <div className={`grid grid-cols-2 ${board.architecture === 'C51' ? 'sm:grid-cols-3' : 'sm:grid-cols-4'} gap-2.5`}>
            {gpioEntries.map(({ pin, label }) => {
              const state = telemetry.gpioStates[pin];
              const isHigh = (state?.value ?? 0) > 0;
              return (
                <button
                  key={pin}
                  type="button"
                  onClick={() => dispatch(`PIN:WRITE:${pin}:${isHigh ? 0 : 1}`)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    isHigh
                      ? 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                  }`}
                >
                  <div className="font-mono text-xs font-semibold truncate">{label}</div>
                  <div className="mt-1 text-[11px] font-mono">
                    {isHigh ? 'HIGH (1)' : 'LOW (0)'}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3">
            {[1, 2].map((ch) => {
              const on = Boolean(telemetry.relays[ch]);
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => dispatch(`RELAY:SET:${ch}:${on ? 'OFF' : 'ON'}`)}
                  className={`p-3 rounded-lg border text-xs font-medium flex items-center justify-between transition-colors ${
                    on
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span>Relay Channel {ch}</span>
                  <span className="font-mono font-bold">{on ? 'ON' : 'OFF'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Servo, Motor & Sensor Calibration */}
        <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-5">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Servo, Motor PWM & Calibration
            </h2>
          </div>

          <label className="block space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">Servo Position (Pin 9)</span>
              <span className="font-mono tabular-nums font-semibold">{telemetry.servos[9] ?? 90}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={180}
              value={telemetry.servos[9] ?? 90}
              onChange={(e) => dispatch(`SERVO:SET:9:${e.target.value}`)}
              className="w-full accent-sky-500"
            />
          </label>

          <label className="block space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">DC Motor PWM Speed (Channel 1)</span>
              <span className="font-mono tabular-nums font-semibold">{telemetry.motors[1] ?? 0} / 255</span>
            </div>
            <input
              type="range"
              min={0}
              max={255}
              value={telemetry.motors[1] ?? 0}
              onChange={(e) => dispatch(`MOTOR:SPEED:1:${e.target.value}`)}
              className="w-full accent-sky-500"
            />
          </label>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-end gap-2">
            <label className="flex-1 text-xs space-y-1">
              <span className="text-slate-500 dark:text-slate-400">DHT22 Calibration Offset (°C)</span>
              <input
                type="number"
                step="0.1"
                value={calOffset}
                onChange={(e) => setCalOffset(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
              />
            </label>
            <button
              type="button"
              onClick={() => dispatch(`SENSOR:CALIBRATE:DHT22:${calOffset}`)}
              className="px-3 py-1.5 rounded bg-sky-600 text-white text-xs font-medium hover:bg-sky-500"
            >
              Calibrate
            </button>
            <button
              type="button"
              onClick={() => dispatch('SENSOR:READ:ALL')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-xs font-medium"
            >
              <Activity className="w-3.5 h-3.5" />
              Poll Sensors
            </button>
          </div>
        </div>
      </div>

      {/* Explicit Firmware Protocol Reference */}
      <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <Gauge className="w-4 h-4 text-sky-500 shrink-0" />
          <span>
            Protocol Allowlist: <code className="font-mono">PIN:WRITE:&lt;pin&gt;:&lt;0|1&gt;</code>,{' '}
            <code className="font-mono">PIN:PWM:&lt;pin&gt;:&lt;0-255&gt;</code>,{' '}
            <code className="font-mono">RELAY:SET:&lt;ch&gt;:&lt;ON|OFF&gt;</code>,{' '}
            <code className="font-mono">SERVO:SET:&lt;pin&gt;:&lt;0-180&gt;</code>
          </span>
        </div>
        <span className="font-mono text-slate-500 shrink-0 tabular-nums">Uptime {telemetry.uptimeSec}s</span>
      </div>
    </div>
  );
}
