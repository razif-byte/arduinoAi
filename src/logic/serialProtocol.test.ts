import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHardwareCommand, analyzeArduinoFirmware } from './serialProtocol';
import { SUPPORTED_BOARDS } from '../data/boardsAndComponents';

test('validateHardwareCommand accepts allowlisted GPIO and relay commands', () => {
  const ledOn = validateHardwareCommand('PIN:WRITE:2:1');
  assert.equal(ledOn.valid, true);
  assert.equal(ledOn.actionType, 'pin_write');
  assert.equal(ledOn.pin, 2);

  const relay = validateHardwareCommand('relay:set:1:on');
  assert.equal(relay.valid, true);
  assert.equal(relay.normalizedCommand, 'RELAY:SET:1:ON');

  const servo = validateHardwareCommand('SERVO:SET:9:135');
  assert.equal(servo.valid, true);
  assert.equal(servo.value, 135);
});

test('validateHardwareCommand rejects arbitrary injection or out-of-range commands', () => {
  const injection = validateHardwareCommand('PIN:WRITE:2:1; rm -rf /');
  assert.equal(injection.valid, false);

  const badCmd = validateHardwareCommand('EXEC:SHELL:whoami');
  assert.equal(badCmd.valid, false);

  const badAngle = validateHardwareCommand('SERVO:SET:9:240');
  assert.equal(badAngle.valid, false);
});

test('analyzeArduinoFirmware detects missing setup/semicolon and passes valid code', () => {
  const esp32 = SUPPORTED_BOARDS.find((b) => b.id === 'esp32')!;
  const validResult = analyzeArduinoFirmware(
    [
      {
        name: 'main.ino',
        language: 'cpp',
        content: '#include <WiFi.h>\nvoid setup() {\n  pinMode(2, OUTPUT);\n}\nvoid loop() {\n  digitalWrite(2, HIGH);\n}',
      },
    ],
    esp32
  );
  assert.equal(validResult.success, true);
  assert.ok(validResult.detectedLibraries.includes('WiFi.h'));

  const uno = SUPPORTED_BOARDS.find((b) => b.id === 'uno')!;
  const badResult = analyzeArduinoFirmware(
    [
      {
        name: 'main.ino',
        language: 'cpp',
        content: '#include <WiFi.h>\nvoid setup() {\n  pinMode(2, OUTPUT)\n}',
      },
    ],
    uno
  );
  assert.equal(badResult.success, false);
  assert.ok(badResult.diagnostics.some((d) => d.severity === 'error'));
});

test('analyzeArduinoFirmware validates STC8G1K08A C51 firmware and P5.4 serial commands', () => {
  const stc8g = SUPPORTED_BOARDS.find((b) => b.id === 'stc8g1k08a')!;
  assert.equal(stc8g.architecture, 'C51');

  const validC51 = analyzeArduinoFirmware(
    [
      {
        name: 'main.c',
        language: 'c',
        content: '#include <STC8G.h>\nvoid main(void) {\n  P5M0 |= 0x10;\n  P5M1 &= ~0x10;\n  while (1) {\n    P5 ^= 0x10;\n  }\n}\n',
      },
    ],
    stc8g
  );
  assert.equal(validC51.success, true);
  assert.ok(validC51.detectedLibraries.includes('STC8G.h'));

  const invalidC51 = analyzeArduinoFirmware(
    [
      {
        name: 'main.c',
        language: 'c',
        content: '#include <WiFi.h>\nvoid main(void) { Serial.begin(115200); }\n',
      },
    ],
    stc8g
  );
  assert.equal(invalidC51.success, false);
  assert.ok(invalidC51.diagnostics.some((d) => d.message.includes('C51')));

  const p54Write = validateHardwareCommand('PIN:WRITE:54:1');
  assert.equal(p54Write.valid, true);
  assert.equal(p54Write.pin, 54);
});

