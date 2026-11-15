import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_BOARDS } from '../data/boardsAndComponents';
import {
  buildPlatformIoProjectFiles,
  DEFAULT_PLATFORMIO_CONFIG,
  generatePlatformIoIni,
  getCrossOsSetupGuide,
  getDefaultSerialPortForOs,
  resolvePlatformIoProfile,
  validatePlatformIoIni,
} from './platformioService';

test('resolvePlatformIoProfile maps Arduino, ESP32, RP2040, STM32, and STC8G1K08A C51', () => {
  const esp32 = resolvePlatformIoProfile('esp32');
  assert.equal(esp32.platform, 'espressif32');
  assert.equal(esp32.framework, 'arduino');

  const stc8 = resolvePlatformIoProfile('stc8g1k08a');
  assert.equal(stc8.platform, 'intel_mcs51');
  assert.equal(stc8.framework, 'sdcc');
  assert.equal(stc8.defaultUploadProtocol, 'stcgal');
});

test('generatePlatformIoIni adapts serial ports for Windows 11 and Ubuntu Studio', () => {
  const winIni = generatePlatformIoIni(
    { name: 'SmartHome', boardId: 'esp32', libraries: ['DHT sensor library', 'ArduinoJson'] },
    { ...DEFAULT_PLATFORMIO_CONFIG, targetOs: 'windows11' },
    115200,
    '/dev/ttyUSB0'
  );
  assert.match(winIni, /\[env:esp32doit-devkit-v1\]/);
  assert.match(winIni, /upload_port = COM3/);
  assert.match(winIni, /adafruit\/DHT sensor library@\^1\.4\.6/);

  const ubuntuIni = generatePlatformIoIni(
    { name: 'STC8 Controller', boardId: 'stc8g1k08a', libraries: ['STC8G.h (SDCC / Keil C51)'] },
    { ...DEFAULT_PLATFORMIO_CONFIG, targetOs: 'ubuntu-studio', includeUdevSetup: true },
    115200,
    'COM5'
  );
  assert.match(ubuntuIni, /platform = intel_mcs51/);
  assert.match(ubuntuIni, /upload_protocol = stcgal/);
  assert.match(ubuntuIni, /upload_port = \/dev\/ttyUSB0/);
  assert.match(ubuntuIni, /99-platformio-udev\.rules/);
  assert.match(ubuntuIni, /sudo apt remove brltty/);
});

test('validatePlatformIoIni detects missing sections and accepts generated platformio.ini', () => {
  const bad = validatePlatformIoIni('monitor_speed = 115200\n');
  assert.equal(bad.length, 3);

  const validIni = generatePlatformIoIni(
    { name: 'UnoTest', boardId: 'uno', libraries: [] },
    DEFAULT_PLATFORMIO_CONFIG,
    115200,
    'COM4'
  );
  assert.equal(validatePlatformIoIni(validIni).length, 0);
});

test('buildPlatformIoProjectFiles converts .ino sketches into src/*.cpp with Arduino.h and include/*.h', () => {
  const pioFiles = buildPlatformIoProjectFiles(
    {
      id: 'p1',
      name: 'UnoTest',
      boardId: 'uno',
      description: 'Test',
      libraries: [],
      files: [
        { name: 'Blink.ino', language: 'cpp', content: 'void setup() {}\nvoid loop() {}\n' },
        { name: 'config.h', language: 'h', content: '#define PIN_LED 13\n' },
      ],
      circuit: { boardId: 'uno', nodes: [], wires: [] },
      createdAt: '',
      updatedAt: '',
    },
    DEFAULT_PLATFORMIO_CONFIG,
    115200,
    'COM4'
  );

  assert.ok(pioFiles.some((f) => f.name === 'platformio.ini'));
  const mainCpp = pioFiles.find((f) => f.name === 'src/Blink.cpp');
  assert.ok(mainCpp);
  assert.match(mainCpp.content, /#include <Arduino\.h>/);
  assert.ok(pioFiles.some((f) => f.name === 'include/config.h'));
});

test('getDefaultSerialPortForOs and getCrossOsSetupGuide return Windows 11 & Ubuntu Studio configs', () => {
  assert.equal(getDefaultSerialPortForOs('uno', 'ubuntu-studio'), '/dev/ttyACM0');
  assert.equal(getDefaultSerialPortForOs('stc8g1k08a', 'ubuntu-studio'), '/dev/ttyUSB0');
  assert.equal(getDefaultSerialPortForOs('stc8g1k08a', 'windows11'), 'COM5');

  const stcBoard = SUPPORTED_BOARDS.find((b) => b.id === 'stc8g1k08a')!;
  const linuxGuide = getCrossOsSetupGuide('ubuntu-studio', stcBoard);
  assert.ok(linuxGuide.commands.some((c) => c.includes('dialout')));
  assert.ok(linuxGuide.packagingCommand.includes('--linux'));

  const winGuide = getCrossOsSetupGuide('windows11', stcBoard);
  assert.ok(winGuide.packagingCommand.includes('--win'));
});
