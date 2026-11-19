// main.js — proses utama aplikasi PDP Wima (Windows)
// - Membuka portal dari file lokal (app://pdp/) sehingga tetap terbuka tanpa internet
// - Otomatis terbuka setelah instalasi, selalu tampil full screen
// - Menyimpan antrean data (saat offline) + salinan data terakhir ke penyimpanan komputer
// - Mengirim antrean ke Supabase otomatis begitu koneksi kembali

const { app, BrowserWindow, ipcMain, protocol, net, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const APP_DIR = path.join(__dirname, 'app');
const HOST_DALAM_APP = ['wima15.github.io'];   // tautan ini dibuka di dalam aplikasi (RPP Maker)
const CACHE_MAKS_BYTE = 300 * 1024 * 1024;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

// ---------- hanya satu jendela aplikasi ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
}

// ---------- penyimpanan (terenkripsi dengan Windows DPAPI bila tersedia) ----------
let DIR, CACHE_DIR, QUEUE_FILE;
function tulis(file, str) {
  const data = safeStorage.isEncryptionAvailable()
    ? Buffer.concat([Buffer.from('E1'), safeStorage.encryptString(str)])
    : Buffer.concat([Buffer.from('P1'), Buffer.from(str, 'utf8')]);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
function baca(file) {
  try {
    const b = fs.readFileSync(file);
    const tag = b.subarray(0, 2).toString();
    const isi = b.subarray(2);
    return tag === 'E1' ? safeStorage.decryptString(isi) : isi.toString('utf8');
  } catch (e) { return null; }
}

// ---------- antrean ----------
let queue = { items: [], failed: [] };
function muatQueue() {
  const t = baca(QUEUE_FILE);
  if (t) { try { queue = JSON.parse(t); } catch (e) {} }
  queue.items = queue.items || []; queue.failed = queue.failed || [];
}
function simpanQueue() { tulis(QUEUE_FILE, JSON.stringify(queue)); }

// ---------- status koneksi ----------
let win = null;
let supabaseUrl = null;
let online = true;
let syncing = false;
let lastSync = null;
const auth = {};     // sub -> { authorization, apikey } token terbaru dari halaman

function status() {
  return { online, syncing, pending: queue.items.length, failed: queue.failed.length, lastSync };
}
function siarkan() {
  if (win && !win.isDestroyed()) win.webContents.send('pdp:status', status());
}

async function cekKoneksi() {
  let ok;
  if (!supabaseUrl) {
    ok = net.isOnline();
  } else {
    try {
      await net.fetch(supabaseUrl + '/auth/v1/health', { method: 'GET', signal: AbortSignal.timeout(6000) });
      ok = true;                       // respons HTTP apa pun = server terjangkau
    } catch (e) { ok = false; }
  }
  if (ok !== online) {
    online = ok;
    siarkan();
    if (online) flush();
  }
}

// ---------- kirim antrean ke Supabase ----------
let flushJalan = null;
function flush() {
  if (flushJalan) return flushJalan;
  flushJalan = (async () => {
    if (!queue.items.length) return;
    syncing = true; siarkan();
    try {
      while (queue.items.length) {
        const it = queue.items[0];
        const headers = Object.assign({}, it.headers);
        const a = auth[it.sub];
        if (a && a.authorization) headers['authorization'] = a.authorization;   // pakai token terbaru
        if (a && a.apikey) headers['apikey'] = a.apikey;
        let res;
        try {
          res = await net.fetch(it.url, { method: it.method, headers, body: it.body == null ? undefined : it.body });
        } catch (e) {
          online = false; break;                 // koneksi putus lagi — coba nanti
        }
        if (res.ok) {
          queue.items.shift();
          lastSync = Date.now();
        } else if (res.status === 401 || res.status >= 500 || res.status === 429) {
          break;                                 // token kedaluwarsa / server sibuk — coba lagi nanti
        } else {
          const teks = (await res.text().catch(() => '')).slice(0, 300);
          queue.items.shift();
          queue.failed.push({ id: it.id, ts: it.ts, method: it.method, url: it.url, headers: it.headers,
                              body: it.body, sub: it.sub, status: res.status, error: teks });
        }
        simpanQueue();
      }
    } finally {
      simpanQueue();
      syncing = false; flushJalan = null; siarkan();
    }
  })();
  return flushJalan;
}

// ---------- IPC ----------
const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');

ipcMain.handle('pdp:hello', (_e, cfg) => {
  if (cfg && cfg.supabaseUrl && cfg.supabaseUrl !== supabaseUrl) { supabaseUrl = cfg.supabaseUrl; cekKoneksi(); }
  return status();
});
ipcMain.handle('pdp:status', () => status());
ipcMain.on('pdp:auth', (_e, a) => {
  if (a && a.sub && a.authorization) auth[a.sub] = { authorization: a.authorization, apikey: a.apikey };
  if (queue.items.length && online && !syncing) flush();
});
ipcMain.handle('pdp:cache-set', (_e, o) => {
  try {
    const f = path.join(CACHE_DIR, hash(o.key) + '.bin');
    if (!o.text) { fs.rmSync(f, { force: true }); return true; }     // teks kosong = hapus
    tulis(f, JSON.stringify({ text: o.text, status: o.status, headers: o.headers }));
    return true;
  } catch (e) { return false; }
});
ipcMain.handle('pdp:cache-get', (_e, key) => {
  const t = baca(path.join(CACHE_DIR, hash(key) + '.bin'));
  if (!t) return null;
  try { return JSON.parse(t); } catch (e) { return null; }
});
ipcMain.handle('pdp:enqueue', (_e, it) => {
  it.id = Date.now() + '-' + crypto.randomBytes(3).toString('hex');
  it.ts = Date.now();
  queue.items.push(it);
  simpanQueue(); siarkan();
  return it.id;
});
ipcMain.handle('pdp:info', () => {
  const ringkas = (x) => ({ id: x.id, ts: x.ts, method: x.method, tabel: x.url.split('?')[0].split('/').pop(),
                            status: x.status, error: x.error });
  return { pending: queue.items.map(ringkas), failed: queue.failed.map(ringkas) };
});
ipcMain.handle('pdp:flush', async () => { await cekKoneksi(); await flush(); return status(); });
ipcMain.handle('pdp:retry-failed', (_e, id) => {
  const i = queue.failed.findIndex((x) => x.id === id);
  if (i >= 0) { const [x] = queue.failed.splice(i, 1); delete x.status; delete x.error; queue.items.push(x); simpanQueue(); siarkan(); flush(); }
  return status();
});
ipcMain.handle('pdp:discard-failed', (_e, id) => {
  queue.failed = queue.failed.filter((x) => x.id !== id);
  simpanQueue(); siarkan();
  return status();
});

// ---------- jendela ----------
function buatJendela() {
  win = new BrowserWindow({
    width: 1280, height: 800, show: false, autoHideMenuBar: true, fullscreen: true,
    title: 'PDP Wima',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.removeMenu();
  win.once('ready-to-show', () => { win.setFullScreen(true); win.show(); });
  // WAJIB full screen: bila keluar dari full screen / dipulihkan dari minimize, masuk lagi otomatis
  const paksaFull = () => { if (win && !win.isDestroyed() && !win.isFullScreen()) setTimeout(() => win && win.setFullScreen(true), 50); };
  win.on('leave-full-screen', paksaFull);
  win.on('restore', paksaFull);
  win.on('show', paksaFull);
  win.loadURL('app://pdp/index.html');

  // Jendela cetak / pratinjau (window.open('')) tetap dibuka; tautan luar dibuka di browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank' || url.startsWith('app://') || url.startsWith('blob:')) return { action: 'allow' };
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('app://')) return;
    let host = '';
    try { host = new URL(url).hostname; } catch (err) {}
    if (HOST_DALAM_APP.includes(host)) return;
    e.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });
  win.webContents.on('did-finish-load', siarkan);
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  DIR = path.join(app.getPath('userData'), 'offline');
  CACHE_DIR = path.join(DIR, 'cache');
  QUEUE_FILE = path.join(DIR, 'antrean.bin');
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  muatQueue();
  pangkasCache();

  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const full = path.normalize(path.join(APP_DIR, p));
    if (!full.startsWith(APP_DIR)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(full).toString());
  });

  buatJendela();
  setInterval(cekKoneksi, 8000);
  cekKoneksi();
  setInterval(() => { if (online && queue.items.length) flush(); }, 30000);
});

app.on('window-all-closed', () => app.quit());

function pangkasCache() {
  try {
    const files = fs.readdirSync(CACHE_DIR).map((n) => {
      const f = path.join(CACHE_DIR, n); const s = fs.statSync(f); return { f, size: s.size, t: s.mtimeMs };
    }).sort((a, b) => a.t - b.t);
    let total = files.reduce((n, x) => n + x.size, 0);
    for (const x of files) { if (total <= CACHE_MAKS_BYTE) break; fs.rmSync(x.f, { force: true }); total -= x.size; }
  } catch (e) {}
}
