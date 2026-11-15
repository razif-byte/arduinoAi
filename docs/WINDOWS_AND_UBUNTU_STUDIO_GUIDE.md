# Gemini Arduino AI Studio — Windows 11 & Ubuntu Studio Setup Guide

## 1. PlatformIO Extension & CLI Prerequisites

### Windows 11 (x64)
1. Install Python 3.11+ (`winget install Python.Python.3.12`) and Node.js 22+.
2. Install PlatformIO Core CLI:
   ```powershell
   pip install -U platformio
   pio --version
   ```
3. Install USB-UART Drivers:
   - **CH340G / CH341** (STC8G1K08A & Arduino clones): https://www.wch-ic.com/downloads/CH341SER_EXE.html
   - **CP210x** (ESP32 DevKit / NodeMCU): https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
4. Build Windows 11 Desktop Installer:
   ```powershell
   npm run electron:win
   # Produces NSIS .exe and Portable .exe in /release
   ```

### Ubuntu Studio (Linux x64 / 22.04–24.04 LTS)
1. Install system dependencies and PlatformIO Core:
   ```bash
   sudo apt update && sudo apt install -y python3-venv python3-pip sdcc
   pip3 install -U platformio stcgal
   ```
2. Configure USB Serial Permissions (no root needed for `/dev/ttyUSB0` & `/dev/ttyACM0`):
   ```bash
   sudo usermod -aG dialout,plugdev $USER
   # Remove brltty if installed (prevents CH340G serial hijacking on Ubuntu)
   sudo apt remove -y brltty
   # Install official PlatformIO udev rules
   curl -fsSL https://raw.githubusercontent.com/platformio/platformio-core/develop/platformio/assets/system/99-platformio-udev.rules | sudo tee /etc/udev/rules.d/99-platformio-udev.rules
   sudo udevadm control --reload-rules && sudo udevadm trigger
   ```
   Log out and back in for `dialout` group membership to take effect.
3. Build Ubuntu Studio Desktop Package (`.AppImage`, `.deb`, `.tar.gz`):
   ```bash
   npm run electron:linux
   # Produces AppImage, Debian .deb, and tar.gz in /release
   ```

## 2. Exporting & Building with PlatformIO Extension
1. Open **Arduino IDE** in Gemini Arduino AI Studio and switch the toolchain toggle to **PlatformIO** (or enable it under **Libraries & Drivers** / **Settings**).
2. Select your target OS profile (**Windows 11** for `COMx` ports or **Ubuntu Studio** for `/dev/ttyUSB0` / `/dev/ttyACM0`).
3. Click **Generate platformio.ini** to scaffold board environments (`espressif32`, `atmelavr`, `raspberrypi`, `ststm32`, or `intel_mcs51` for `STC8G1K08A`).
4. Click **ZIP** to export a ready-to-build PlatformIO project directory (`platformio.ini`, `src/`, `include/`).
