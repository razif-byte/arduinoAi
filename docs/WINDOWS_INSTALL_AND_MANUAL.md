# Gemini Arduino AI Studio — Windows 11 Installation & User Manual

## 1. System Requirements (Windows 11 64-bit)
- Windows 11 (x64)
- Node.js 22+
- Python 3.10+ (for ESP32 esptool / serial utilities)
- Arduino CLI (`arduino-cli`) installed on PATH for native hardware flashing
- USB Drivers: CP210x / CH340 / FTDI / Arduino CDC ACM

## 2. Building Windows EXE Installer & Portable ZIP
1. Install dependencies: `npm install`
2. Build production frontend: `npm run build`
3. Package NSIS Installer (`.exe`) and Portable ZIP via Electron Builder:
   `npx electron-builder --config electron-builder.json --win`

## 3. Documented Serial Firmware Protocol
All AI-assisted and manual hardware commands are validated against the strict allowlist:
- `PIN:MODE:<pin>:<INPUT|OUTPUT|INPUT_PULLUP>`
- `PIN:WRITE:<pin>:<0|1>`
- `PIN:PWM:<pin>:<0-255>`
- `SERVO:SET:<pin>:<0-180>`
- `RELAY:SET:<channel>:<ON|OFF>`
- `MOTOR:SPEED:<channel>:<0-255>`
- `SENSOR:READ:<DHT22|BMP280|BME280|ADC|ALL>`
- `SENSOR:CALIBRATE:<sensor>:<offset>`
- `SYS:PING` | `SYS:INFO` | `SYS:RESET`

No hardware command executes without validation and explicit user confirmation.
