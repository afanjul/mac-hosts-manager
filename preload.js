const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hostsAPI', {
  loadHosts: () => ipcRenderer.invoke('load-hosts'),
  saveHosts: (content) => ipcRenderer.invoke('save-hosts', content),
});
