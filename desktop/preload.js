const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pdpDesktop', {
  hello: (cfg) => ipcRenderer.invoke('pdp:hello', cfg),
  status: () => ipcRenderer.invoke('pdp:status'),
  auth: (a) => ipcRenderer.send('pdp:auth', a),
  cacheSet: (o) => ipcRenderer.invoke('pdp:cache-set', o),
  cacheGet: (key) => ipcRenderer.invoke('pdp:cache-get', key),
  enqueue: (it) => ipcRenderer.invoke('pdp:enqueue', it),
  info: () => ipcRenderer.invoke('pdp:info'),
  flush: () => ipcRenderer.invoke('pdp:flush'),
  retry: (id) => ipcRenderer.invoke('pdp:retry-failed', id),
  discard: (id) => ipcRenderer.invoke('pdp:discard-failed', id),
  onStatus: (cb) => ipcRenderer.on('pdp:status', (_e, s) => cb(s))
});
