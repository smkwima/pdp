const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Semua frame (utama, popup, iframe): jembatan cetak + patch window.print dipasang sebelum skrip halaman jalan.
contextBridge.exposeInMainWorld('__pdpCetak', (snap) => ipcRenderer.invoke('pdp:cetak', snap));
try {
  const src = ipcRenderer.sendSync('pdp:patch-src');
  if (src) webFrame.executeJavaScript(src);
} catch (e) {}

// Lapisan offline hanya untuk frame teratas (sama seperti sebelumnya; iframe tidak mendapat indikator ganda).
if (window.top === window) contextBridge.exposeInMainWorld('pdpDesktop', {
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
