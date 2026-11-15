const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  platform: process.platform,
  arch: process.arch,
  isElectron: true,
});
