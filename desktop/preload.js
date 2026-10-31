'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// API dostępne tylko dla strony apki (GitHub Pages albo lokalna kopia).
const ok = location.origin === 'https://karycha.github.io' || location.protocol === 'file:';
if (ok) {
  contextBridge.exposeInMainWorld('gwentDesktop', {
    getState: () => ipcRenderer.invoke('state'),
    on: (channel, cb) => { if (['state', 'collection', 'show'].includes(channel)) ipcRenderer.on(channel, (e, d) => cb(d)); },
    syncNow: () => ipcRenderer.send('sync', { show: false }),
    login: () => ipcRenderer.send('sync', { show: true }),
    logout: () => ipcRenderer.send('logout'),
    tagOpp: (id, f) => ipcRenderer.invoke('tagOpp', id, f),
    openLogDir: () => ipcRenderer.send('openLogDir'),
    overlayHide: () => ipcRenderer.send('overlayHide'),
    overlayShow: () => ipcRenderer.send('overlayShow'),
    setSetting: (k, v) => ipcRenderer.send('setSetting', k, v),
  });
}
