import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStc8Timer1Reload,
  prepareSerialCommand,
  resolveSerialDriver,
} from './serialService';

test('resolveSerialDriver routes Arduino/ESP boards to arduino-uart and STC8 to stc8-c51', () => {
  const esp32Driver = resolveSerialDriver('esp32');
  assert.equal(esp32Driver.id, 'arduino-uart');
  assert.equal(esp32Driver.profile.lineEnding, '\n');
  assert.equal(esp32Driver.profile.dtrAutoReset, true);
  assert.equal(esp32Driver.profile.requiresColdBoot, false);

  const stc8Driver = resolveSerialDriver('stc8g1k08a');
  assert.equal(stc8Driver.id, 'stc8-c51');
  assert.equal(stc8Driver.profile.lineEnding, '\r\n');
  assert.equal(stc8Driver.profile.dtrAutoReset, false);
  assert.equal(stc8Driver.profile.requiresColdBoot, true);
});

test('Stc8SerialDriver translates P5.4 / P3.2 aliases, frames CRLF, and rejects unbonded SOP-8 pins', () => {
  const validAlias = prepareSerialCommand('PIN:WRITE:P5.4:1', 'stc8g1k08a', 115200);
  assert.equal(validAlias.valid, true);
  assert.equal(validAlias.frame?.canonicalCommand, 'PIN:WRITE:54:1');
  assert.equal(validAlias.frame?.wirePayload, 'PIN:WRITE:54:1\r\n');
  assert.equal(validAlias.frame?.stcTiming?.th1Hex, '0xCC');

  const unbondedPin = prepareSerialCommand('PIN:WRITE:13:1', 'stc8g1k08a', 115200);
  assert.equal(unbondedPin.valid, false);
  assert.match(unbondedPin.reason ?? '', /SOP-8/);
});

test('ArduinoUartDriver translates GPIO/D pin aliases and frames LF with DTR auto-reset', () => {
  const espCmd = prepareSerialCommand('PIN:WRITE:GPIO2:1', 'esp32', 115200);
  assert.equal(espCmd.valid, true);
  assert.equal(espCmd.frame?.canonicalCommand, 'PIN:WRITE:2:1');
  assert.equal(espCmd.frame?.wirePayload, 'PIN:WRITE:2:1\n');

  const unoCmd = prepareSerialCommand('PIN:WRITE:D13:1', 'uno', 115200);
  assert.equal(unoCmd.valid, true);
  assert.equal(unoCmd.frame?.canonicalCommand, 'PIN:WRITE:13:1');
});

test('calculateStc8Timer1Reload matches 0xCC for 115200 baud @ 24MHz and flags excessive baud rates', () => {
  const timing = calculateStc8Timer1Reload(115200, 24_000_000);
  assert.equal(timing.th1Hex, '0xCC');
  assert.equal(timing.tl1Hex, '0xCC');

  const fastStc = prepareSerialCommand('SYS:PING', 'stc8g1k08a', 921600);
  assert.equal(fastStc.valid, true);
  assert.ok((fastStc.frame?.warnings.length ?? 0) > 0);
  assert.equal(fastStc.driver.getWebSerialOpenOptions(115200, true).parity, 'even');
  assert.equal(fastStc.driver.getWebSerialOpenOptions(115200, false).dtrPulseOnConnect, false);
});
