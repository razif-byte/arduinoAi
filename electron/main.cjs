const { app, BrowserWindow, session } = require('electron');
const path = require('path');

// Ensure compatibility on Ubuntu Studio (Linux AppImage/deb) where kernel user namespaces may restrict Chrome sandbox
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('enable-features', 'WebSerial');
}

function createMainWindow() {
  const ses = session.defaultSession;

  ses.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'serial' || permission === 'clipboard-read' || permission === 'clipboard-sanitized-write') {
      return true;
    }
    return false;
  });

  ses.setDevicePermissionHandler((details) => {
    return details.deviceType === 'serial';
  });

  ses.on('select-serial-port', (event, portList, _webContents, callback) => {
    event.preventDefault();
    if (portList && portList.length > 0) {
      callback(portList[0].portId);
    } else {
      callback('');
    }
  });

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    title: 'Gemini Arduino AI Studio',
    backgroundColor: '#0B0F17',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const targetUrl = process.env.STUDIO_URL || 'http://localhost:3000';
  win.loadURL(targetUrl);
}

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
