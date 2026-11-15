import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import type { ArduinoProject, ChatMessage, ProjectVersion, SerialLogEntry } from '../src/types/studio';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'studio.sqlite');
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    boardId TEXT NOT NULL,
    description TEXT NOT NULL,
    filesJson TEXT NOT NULL,
    circuitJson TEXT NOT NULL,
    librariesJson TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_versions (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    label TEXT NOT NULL,
    filesJson TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    sessionId TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model TEXT,
    proposalsJson TEXT,
    imageAttachment TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS serial_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    direction TEXT NOT NULL,
    port TEXT NOT NULL,
    baud INTEGER NOT NULL,
    payload TEXT NOT NULL,
    authorized INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const SEED_PROJECTS: ArduinoProject[] = [
  {
    id: 'proj-esp32-smarthome',
    name: 'ESP32 Smart Home Controller',
    boardId: 'esp32',
    description: 'Wi-Fi relay & DHT22 environmental telemetry controller with structured Serial Command Protocol.',
    libraries: ['DHT sensor library', 'ArduinoJson'],
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: '2026-11-14T16:30:00.000Z',
    files: [
      {
        name: 'SmartHomeNode.ino',
        language: 'cpp',
        content: `#include <WiFi.h>
#include <DHT.h>
#include "protocol.h"

#define LED_BUILTIN_PIN 2
#define DHT_PIN 4
#define RELAY_1_PIN 5
#define DHT_TYPE DHT22

DHT dht(DHT_PIN, DHT_TYPE);
unsigned long lastTelemetryMs = 0;

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN_PIN, OUTPUT);
  pinMode(RELAY_1_PIN, OUTPUT);
  digitalWrite(LED_BUILTIN_PIN, LOW);
  digitalWrite(RELAY_1_PIN, HIGH); // Active-LOW relay default OFF
  dht.begin();
  Serial.println("ACK:SYS:BOOT:ESP32_SMARTHOME_READY");
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\\n');
    cmd.trim();
    handleSerialCommand(cmd, LED_BUILTIN_PIN, RELAY_1_PIN);
  }

  if (millis() - lastTelemetryMs >= 2500) {
    lastTelemetryMs = millis();
    float temp = dht.readTemperature();
    float hum = dht.readHumidity();
    if (!isnan(temp) && !isnan(hum)) {
      Serial.printf("DATA:TEMP:%.1f:HUM:%.1f\\n", temp, hum);
    }
  }
}
`,
      },
      {
        name: 'protocol.h',
        language: 'h',
        content: `#ifndef PROTOCOL_H
#define PROTOCOL_H

#include <Arduino.h>

inline void handleSerialCommand(const String& cmd, int ledPin, int relayPin) {
  if (cmd == "PIN:WRITE:2:1") {
    digitalWrite(ledPin, HIGH);
    Serial.println("ACK:PIN:WRITE:2:1");
  } else if (cmd == "PIN:WRITE:2:0") {
    digitalWrite(ledPin, LOW);
    Serial.println("ACK:PIN:WRITE:2:0");
  } else if (cmd == "RELAY:SET:1:ON") {
    digitalWrite(relayPin, LOW);
    Serial.println("ACK:RELAY:SET:1:ON");
  } else if (cmd == "RELAY:SET:1:OFF") {
    digitalWrite(relayPin, HIGH);
    Serial.println("ACK:RELAY:SET:1:OFF");
  } else if (cmd == "SYS:PING") {
    Serial.println("ACK:SYS:PONG");
  } else {
    Serial.println("ERR:UNALLOWLISTED_CMD");
  }
}

#endif
`,
      },
    ],
    circuit: {
      boardId: 'esp32',
      nodes: [
        { id: 'n-board', type: 'board', label: 'ESP32 DevKit V1', x: 120, y: 120, props: { boardId: 'esp32' } },
        { id: 'n-res1', type: 'resistor', label: '220Ω', x: 380, y: 90, props: { ohms: 220 } },
        { id: 'n-led1', type: 'led', label: 'Status LED', x: 520, y: 90, props: { color: '#0ea5e9' } },
        { id: 'n-dht', type: 'dht22', label: 'DHT22 Sensor', x: 400, y: 210, props: {} },
        { id: 'n-relay', type: 'relay', label: '5V Relay Ch1', x: 400, y: 320, props: {} },
      ],
      wires: [
        { id: 'w1', fromNodeId: 'n-board', fromPin: 'GPIO2', toNodeId: 'n-res1', toPin: 'P1', color: '#0ea5e9', signalType: 'digital' },
        { id: 'w2', fromNodeId: 'n-res1', fromPin: 'P2', toNodeId: 'n-led1', toPin: 'ANODE', color: '#38bdf8', signalType: 'digital' },
        { id: 'w3', fromNodeId: 'n-led1', fromPin: 'CATHODE', toNodeId: 'n-board', toPin: 'GND', color: '#475569', signalType: 'ground' },
        { id: 'w4', fromNodeId: 'n-board', fromPin: 'GPIO4', toNodeId: 'n-dht', toPin: 'DATA', color: '#22c55e', signalType: 'digital' },
        { id: 'w5', fromNodeId: 'n-board', fromPin: '3V3', toNodeId: 'n-dht', toPin: 'VCC', color: '#ef4444', signalType: 'power' },
        { id: 'w6', fromNodeId: 'n-board', fromPin: 'GPIO5', toNodeId: 'n-relay', toPin: 'IN', color: '#f59e0b', signalType: 'digital' },
      ],
    },
  },
  {
    id: 'proj-uno-servo-radar',
    name: 'Arduino Uno Ultrasonic Servo Radar',
    boardId: 'uno',
    description: 'Sweeps an SG90 servo 0-180 degrees while measuring distance via HC-SR04.',
    libraries: ['Servo'],
    createdAt: '2026-11-11T10:15:00.000Z',
    updatedAt: '2026-11-13T14:10:00.000Z',
    files: [
      {
        name: 'UltrasonicRadar.ino',
        language: 'cpp',
        content: `#include <Servo.h>

const int TRIG_PIN = 7;
const int ECHO_PIN = 8;
const int SERVO_PIN = 9;
const int LED_PIN = 13;

Servo scannerServo;

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  scannerServo.attach(SERVO_PIN);
  scannerServo.write(90);
}

float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 25000);
  return duration * 0.0343f / 2.0f;
}

void loop() {
  for (int angle = 15; angle <= 165; angle += 15) {
    scannerServo.write(angle);
    delay(120);
    float cm = readDistanceCm();
    digitalWrite(LED_PIN, cm > 0 && cm < 25 ? HIGH : LOW);
    Serial.print("ANGLE:");
    Serial.print(angle);
    Serial.print(",DIST_CM:");
    Serial.println(cm);
  }
}
`,
      },
    ],
    circuit: {
      boardId: 'uno',
      nodes: [
        { id: 'n-board', type: 'board', label: 'Arduino Uno R3', x: 120, y: 120, props: { boardId: 'uno' } },
        { id: 'n-servo', type: 'servo', label: 'SG90 Servo', x: 410, y: 100, props: {} },
        { id: 'n-us', type: 'ultrasonic', label: 'HC-SR04', x: 410, y: 240, props: {} },
      ],
      wires: [
        { id: 'w1', fromNodeId: 'n-board', fromPin: 'D9', toNodeId: 'n-servo', toPin: 'PWM', color: '#f59e0b', signalType: 'pwm' },
        { id: 'w2', fromNodeId: 'n-board', fromPin: 'D7', toNodeId: 'n-us', toPin: 'TRIG', color: '#0ea5e9', signalType: 'digital' },
        { id: 'w3', fromNodeId: 'n-board', fromPin: 'D8', toNodeId: 'n-us', toPin: 'ECHO', color: '#22c55e', signalType: 'digital' },
      ],
    },
  },
  {
    id: 'proj-pico-pwm-motor',
    name: 'RP2040 Pico PWM Motor Driver',
    boardId: 'pico',
    description: 'High-frequency 20kHz MOSFET PWM DC motor speed controller with current sensing.',
    libraries: ['Wire'],
    createdAt: '2026-11-12T11:30:00.000Z',
    updatedAt: '2026-11-14T12:00:00.000Z',
    files: [
      {
        name: 'PicoMotorPWM.ino',
        language: 'cpp',
        content: `const int MOTOR_PWM_PIN = 15;
const int POT_ADC_PIN = 26;

void setup() {
  Serial.begin(115200);
  analogWriteFreq(20000);
  analogWriteRange(255);
  pinMode(MOTOR_PWM_PIN, OUTPUT);
}

void loop() {
  int raw = analogRead(POT_ADC_PIN);
  int duty = map(raw, 0, 1023, 0, 255);
  analogWrite(MOTOR_PWM_PIN, duty);
  Serial.print("MOTOR_DUTY:");
  Serial.println(duty);
  delay(200);
}
`,
      },
    ],
    circuit: {
      boardId: 'pico',
      nodes: [
        { id: 'n-board', type: 'board', label: 'Raspberry Pi Pico', x: 120, y: 120, props: { boardId: 'pico' } },
        { id: 'n-mosfet', type: 'mosfet', label: 'IRLZ44N MOSFET', x: 400, y: 130, props: {} },
        { id: 'n-pot', type: 'potentiometer', label: '10kΩ Speed Pot', x: 400, y: 260, props: {} },
      ],
      wires: [
        { id: 'w1', fromNodeId: 'n-board', fromPin: 'GP15', toNodeId: 'n-mosfet', toPin: 'GATE', color: '#f59e0b', signalType: 'pwm' },
        { id: 'w2', fromNodeId: 'n-board', fromPin: 'GP26', toNodeId: 'n-pot', toPin: 'WIPER', color: '#8b5cf6', signalType: 'analog' },
      ],
    },
  },
  {
    id: 'proj-stc8g1k08a-c51',
    name: 'STC8G1K08A C51 UART & PCA Driver',
    boardId: 'stc8g1k08a',
    description: '1T 8051 C51 firmware with P5.4 LED, P3.2 PCA PWM output, and 115200 baud UART1 protocol parser.',
    libraries: ['STC8G.h (SDCC / Keil C51)'],
    createdAt: '2026-11-14T18:45:00.000Z',
    updatedAt: '2026-11-14T18:45:00.000Z',
    files: [
      {
        name: 'main.c',
        language: 'c',
        content: `#include <STC8G.h>
#include "stc8g_uart.h"

#define MAIN_Fosc 24000000L

sbit LED_P54 = P5^4;
sbit OUT_P32 = P3^2;

void gpio_init_c51(void) {
  // P5.4 & P5.5 push-pull output (P5M1=0, P5M0=1)
  P5M0 |= 0x30;
  P5M1 &= ~0x30;

  // P3.2 & P3.3 push-pull output, P3.0/P3.1 quasi-bidirectional UART1
  P3M0 |= 0x0C;
  P3M1 &= ~0x0C;

  LED_P54 = 0;
  OUT_P32 = 0;
}

void pca_pwm_init_p32(unsigned char duty) {
  CCON = 0x00;
  CMOD = 0x08;      // SYSCLK / 1
  CL = 0x00;
  CH = 0x00;
  CCAPM0 = 0x42;    // PCA0 8-bit PWM mode on P3.2
  PCA_PWM0 = 0x00;
  CCAP0H = 255 - duty;
  CCAP0L = 255 - duty;
  CR = 1;           // Start PCA timer
}

void main(void) {
  gpio_init_c51();
  uart1_init_115200();
  pca_pwm_init_p32(128);
  EA = 1;

  uart1_send_str("ACK:SYS:BOOT:STC8G1K08A_C51_READY\\r\\n");

  while (1) {
    if (uart1_cmd_ready) {
      uart1_cmd_ready = 0;
      if (uart1_match("PIN:WRITE:54:1")) {
        LED_P54 = 1;
        uart1_send_str("ACK:PIN:WRITE:54:1\\r\\n");
      } else if (uart1_match("PIN:WRITE:54:0")) {
        LED_P54 = 0;
        uart1_send_str("ACK:PIN:WRITE:54:0\\r\\n");
      } else if (uart1_match("PIN:WRITE:32:1")) {
        OUT_P32 = 1;
        uart1_send_str("ACK:PIN:WRITE:32:1\\r\\n");
      } else if (uart1_match("SYS:PING")) {
        uart1_send_str("ACK:SYS:PONG:STC8G1K08A\\r\\n");
      }
    }
  }
}
`,
      },
      {
        name: 'stc8g_uart.h',
        language: 'h',
        content: `#ifndef STC8G_UART_H
#define STC8G_UART_H

#include <STC8G.h>

extern volatile bit uart1_cmd_ready;

static char uart_rx_buf[32];
static unsigned char uart_rx_idx = 0;
volatile bit uart1_cmd_ready = 0;

void uart1_init_115200(void) {
  SCON = 0x50;   // 8-bit UART, variable baud
  AUXR |= 0x40;  // Timer1 1T mode
  AUXR &= 0xFE;  // Timer1 as UART1 baud generator
  TMOD &= 0x0F;
  TL1 = 0xCC;    // 115200 baud @ 24.000 MHz
  TH1 = 0xCC;
  ET1 = 0;
  TR1 = 1;
  ES = 1;
}

void uart1_send_byte(char c) {
  SBUF = c;
  while (!TI);
  TI = 0;
}

void uart1_send_str(const char *s) {
  while (*s) uart1_send_byte(*s++);
}

unsigned char uart1_match(const char *cmd) {
  unsigned char i = 0;
  while (cmd[i] && uart_rx_buf[i] == cmd[i]) i++;
  return (cmd[i] == '\\0' && uart_rx_buf[i] == '\\0');
}

#endif
`,
      },
    ],
    circuit: {
      boardId: 'stc8g1k08a',
      nodes: [
        { id: 'n-board', type: 'board', label: 'STC8G1K08A (8051 C51)', x: 110, y: 120, props: { boardId: 'stc8g1k08a' } },
        { id: 'n-res1', type: 'resistor', label: '220Ω', x: 380, y: 90, props: { ohms: 220 } },
        { id: 'n-led1', type: 'led', label: 'P5.4 Status LED', x: 530, y: 90, props: { color: '#14b8a6' } },
        { id: 'n-relay', type: 'relay', label: '5V Driver Relay', x: 400, y: 230, props: {} },
      ],
      wires: [
        { id: 'w1', fromNodeId: 'n-board', fromPin: 'P5.4', toNodeId: 'n-res1', toPin: 'P1', color: '#14b8a6', signalType: 'digital' },
        { id: 'w2', fromNodeId: 'n-res1', fromPin: 'P2', toNodeId: 'n-led1', toPin: 'ANODE', color: '#38bdf8', signalType: 'digital' },
        { id: 'w3', fromNodeId: 'n-led1', fromPin: 'CATHODE', toNodeId: 'n-board', toPin: 'GND', color: '#475569', signalType: 'ground' },
        { id: 'w4', fromNodeId: 'n-board', fromPin: 'P3.2', toNodeId: 'n-relay', toPin: 'IN', color: '#f59e0b', signalType: 'digital' },
      ],
    },
  },
];

function ensureSeeded() {
  const checkProj = db.prepare('SELECT id FROM projects WHERE id = ?');
  const insertProj = db.prepare(
    `INSERT INTO projects (id, name, boardId, description, filesJson, circuitJson, librariesJson, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertVer = db.prepare(
    `INSERT OR IGNORE INTO project_versions (id, projectId, label, filesJson, createdAt)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const p of SEED_PROJECTS) {
    const exists = checkProj.get(p.id) as { id: string } | undefined;
    if (!exists) {
      insertProj.run(
        p.id,
        p.name,
        p.boardId,
        p.description,
        JSON.stringify(p.files),
        JSON.stringify(p.circuit),
        JSON.stringify(p.libraries),
        p.createdAt,
        p.updatedAt
      );
      insertVer.run(
        `ver-${p.id}-init`,
        p.id,
        'Initial Baseline v1.0',
        JSON.stringify(p.files),
        p.createdAt
      );
    }
  }
}

ensureSeeded();

export function listProjects(): ArduinoProject[] {
  const rows = db.prepare('SELECT * FROM projects ORDER BY updatedAt DESC').all() as Array<{
    id: string;
    name: string;
    boardId: string;
    description: string;
    filesJson: string;
    circuitJson: string;
    librariesJson: string;
    createdAt: string;
    updatedAt: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    boardId: r.boardId,
    description: r.description,
    files: JSON.parse(r.filesJson),
    circuit: JSON.parse(r.circuitJson),
    libraries: JSON.parse(r.librariesJson),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export function getProject(id: string): ArduinoProject | null {
  const r = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    | {
        id: string;
        name: string;
        boardId: string;
        description: string;
        filesJson: string;
        circuitJson: string;
        librariesJson: string;
        createdAt: string;
        updatedAt: string;
      }
    | undefined;
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    boardId: r.boardId,
    description: r.description,
    files: JSON.parse(r.filesJson),
    circuit: JSON.parse(r.circuitJson),
    libraries: JSON.parse(r.librariesJson),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function upsertProject(project: ArduinoProject): ArduinoProject {
  const now = new Date().toISOString();
  const existing = getProject(project.id);
  const createdAt = existing?.createdAt ?? project.createdAt ?? now;
  const updated = { ...project, createdAt, updatedAt: now };
  db.prepare(
    `INSERT INTO projects (id, name, boardId, description, filesJson, circuitJson, librariesJson, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       boardId = excluded.boardId,
       description = excluded.description,
       filesJson = excluded.filesJson,
       circuitJson = excluded.circuitJson,
       librariesJson = excluded.librariesJson,
       updatedAt = excluded.updatedAt`
  ).run(
    updated.id,
    updated.name,
    updated.boardId,
    updated.description,
    JSON.stringify(updated.files),
    JSON.stringify(updated.circuit),
    JSON.stringify(updated.libraries),
    updated.createdAt,
    updated.updatedAt
  );
  return updated;
}

export function deleteProject(id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  db.prepare('DELETE FROM project_versions WHERE projectId = ?').run(id);
}

export function listProjectVersions(projectId: string): ProjectVersion[] {
  const rows = db
    .prepare('SELECT * FROM project_versions WHERE projectId = ? ORDER BY createdAt DESC')
    .all(projectId) as Array<{
    id: string;
    projectId: string;
    label: string;
    filesJson: string;
    createdAt: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    label: r.label,
    files: JSON.parse(r.filesJson),
    createdAt: r.createdAt,
  }));
}

export function createProjectVersion(projectId: string, label: string, files: ArduinoProject['files']): ProjectVersion {
  const version: ProjectVersion = {
    id: `ver-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    projectId,
    label,
    files,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    'INSERT INTO project_versions (id, projectId, label, filesJson, createdAt) VALUES (?, ?, ?, ?, ?)'
  ).run(version.id, version.projectId, version.label, JSON.stringify(version.files), version.createdAt);
  return version;
}

export function listChatMessages(sessionId = 'default'): ChatMessage[] {
  const rows = db
    .prepare('SELECT * FROM chat_messages WHERE sessionId = ? ORDER BY createdAt ASC LIMIT 100')
    .all(sessionId) as Array<{
    id: string;
    sessionId: string;
    role: 'user' | 'assistant';
    content: string;
    model: string | null;
    proposalsJson: string | null;
    imageAttachment: string | null;
    createdAt: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.sessionId,
    role: r.role,
    content: r.content,
    model: r.model ?? undefined,
    commandProposals: r.proposalsJson ? JSON.parse(r.proposalsJson) : undefined,
    imageAttachment: r.imageAttachment ?? undefined,
    createdAt: r.createdAt,
  }));
}

export function saveChatMessage(msg: ChatMessage): void {
  db.prepare(
    `INSERT OR REPLACE INTO chat_messages (id, sessionId, role, content, model, proposalsJson, imageAttachment, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    msg.id,
    msg.sessionId,
    msg.role,
    msg.content,
    msg.model ?? null,
    msg.commandProposals ? JSON.stringify(msg.commandProposals) : null,
    msg.imageAttachment ?? null,
    msg.createdAt
  );
}

export function clearChatMessages(sessionId = 'default'): void {
  db.prepare('DELETE FROM chat_messages WHERE sessionId = ?').run(sessionId);
}

export function appendSerialLog(entry: SerialLogEntry): void {
  db.prepare(
    `INSERT INTO serial_logs (id, timestamp, direction, port, baud, payload, authorized)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(entry.id, entry.timestamp, entry.direction, entry.port, entry.baud, entry.payload, entry.authorized ? 1 : 0);
}

export function listSerialLogs(limit = 120): SerialLogEntry[] {
  const rows = db
    .prepare('SELECT * FROM serial_logs ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as Array<{
    id: string;
    timestamp: string;
    direction: SerialLogEntry['direction'];
    port: string;
    baud: number;
    payload: string;
    authorized: number;
  }>;
  return rows.reverse().map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    direction: r.direction,
    port: r.port,
    baud: r.baud,
    payload: r.payload,
    authorized: Boolean(r.authorized),
  }));
}

export function getSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}
