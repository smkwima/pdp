// main.js — proses utama aplikasi PDP Wima (Windows)
// - Membuka portal dari file lokal (app://pdp/) sehingga tetap terbuka tanpa internet
// - Otomatis terbuka setelah instalasi, jendela menyesuaikan layar (maksimal)
// - Menyimpan antrean data (saat offline) + salinan data terakhir ke penyimpanan komputer
// - Mengirim antrean ke Supabase otomatis begitu koneksi kembali

const { app, BrowserWindow, ipcMain, protocol, net, shell, safeStorage, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const APP_DIR = path.join(__dirname, 'app');
const HOST_DALAM_APP = ['wima15.github.io'];   // RPP Maker & Rekap Absen: dibuka DI DALAM aplikasi (jendela yang sama)
const PORTAL_HOSTED = 'https://smkwima.github.io/pdp/';   // alamat PDP di hosting -> dialihkan ke versi lokal app://pdp/
const PORTAL_MENU = PORTAL_HOSTED + 'portal.html';        // menu utama
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

// ---------- CETAK -> SIMPAN PDF LANGSUNG ----------
// Semua jalur cetak (window.print, jendela cetak window.open, iframe cetak, Ctrl+P) dialihkan oleh
// print-patch.js: isi dokumen diambil (snapshot), dicetak ke PDF secara senyap memakai aturan
// @page / @media print yang sudah ada di style.css, lalu langsung "Simpan sebagai".
// Nama file otomatis menyesuaikan isi dokumen (lihat judul() di print-patch.js dan namaPdf()).
const printPages = new Map();
let lastDir = null;
const PATCH_SRC = fs.readFileSync(path.join(__dirname, 'print-patch.js'), 'utf8');
const PREFS_JENDELA = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true,
                        nodeIntegration: false, nodeIntegrationInSubFrames: true };

// preload memintanya sinkron supaya patch terpasang SEBELUM skrip halaman berjalan (semua frame).
ipcMain.on('pdp:patch-src', (e) => { e.returnValue = PATCH_SRC; });

function stempel() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + '.' + p(d.getMinutes());
}

const NAMA_GENERIK = /^(|untitled|tanpa judul|dokumen|document|cetak|print|preview|pratinjau|menyiapkan cetak.*|memuat.*|loading.*|portal data dan penilaian)$/i;

function namaPdf(judul) {
  let n = String(judul || '')
    .replace(/\s*[—–|-]\s*PORTAL DATA DAN PENILAIAN.*$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (NAMA_GENERIK.test(n)) n = 'Dokumen PDP ' + stempel();
  if (n.length > 120) n = n.slice(0, 120).trim();
  return n + '.pdf';
}

// Target jendela untuk dialog/toast; jendela cetak bisa saja sudah ditutup halaman.
function sasaran(wc) {
  if (wc && !wc.isDestroyed()) return wc;
  return win && !win.isDestroyed() ? win.webContents : null;
}

function toast(wc, teks, galat) {
  wc = sasaran(wc);
  if (!wc) return;
  wc.executeJavaScript(`(function(){
    var el = document.getElementById('pdpToast');
    if (!el) { el = document.createElement('div'); el.id = 'pdpToast';
      el.setAttribute('data-pdp-noprint', '');
      el.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:2147483647;padding:10px 16px;border-radius:12px;color:#fff;font:600 13px Segoe UI,Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:80vw;word-break:break-all';
      (document.body || document.documentElement).appendChild(el); }
    el.style.background = ${galat ? "'#dc2626'" : "'#0f172a'"};
    el.textContent = ${JSON.stringify(teks)}; el.style.display = 'block';
    clearTimeout(window.__pdpToastT); window.__pdpToastT = setTimeout(function(){ el.style.display = 'none'; }, ${galat ? 7000 : 4500});
  })();`).catch(() => {});
}

async function cetakPdf(wc, snap) {
  if (!snap || typeof snap.html !== 'string' || !snap.html) return;
  const induk0 = BrowserWindow.fromWebContents(wc);
  toast(wc, 'Membuat PDF…');
  const id = crypto.randomBytes(6).toString('hex');
  printPages.set(id, snap.html);
  const tersembunyi = new BrowserWindow({ show: false, width: 1100, height: 1400,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true } });
  try {
    await tersembunyi.loadURL('app://pdp/__print/' + id + '.html');
    await new Promise((r) => setTimeout(r, 400));
    const pdf = await tersembunyi.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true, pageSize: 'A4' });
    const nama = namaPdf(snap.title);
    const induk = (induk0 && !induk0.isDestroyed()) ? induk0 : (win && !win.isDestroyed() ? win : undefined);
    const hasil = await dialog.showSaveDialog(induk, {
      title: 'Simpan sebagai PDF',
      defaultPath: path.join(lastDir || app.getPath('downloads'), nama),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (hasil.canceled || !hasil.filePath) { toast(wc, 'Penyimpanan PDF dibatalkan'); return; }
    fs.writeFileSync(hasil.filePath, pdf);
    lastDir = path.dirname(hasil.filePath);
    toast(wc, '✓ PDF tersimpan: ' + hasil.filePath);
  } catch (e) {
    toast(wc, 'Gagal membuat PDF: ' + (e && e.message ? e.message : e), true);
  } finally {
    printPages.delete(id);
    if (!tersembunyi.isDestroyed()) tersembunyi.destroy();
  }
}

ipcMain.handle('pdp:cetak', (e, snap) => cetakPdf(e.sender, snap));

// PDF yang dibuat halaman lewat "Unduh PDF" (jsPDF / html2pdf / blob): nama generik (mis. "download.pdf",
// kode acak) diganti judul halaman; nama yang sudah bermakna dipertahankan. Folder terakhir diingat.
const UNDUH_GENERIK = /^(|download|downloads|document|dokumen|file|unnamed|untitled|blob|output|result|export|[0-9a-f]{8}-[0-9a-f-]{20,}|\d+)$/i;
function pasangUnduhan() {
  session.defaultSession.on('will-download', (_e, item, wc) => {
    const asli = item.getFilename() || '';
    if (!/\.pdf$/i.test(asli) && item.getMimeType() !== 'application/pdf') return;
    const dasar = asli.replace(/\.pdf$/i, '').trim();
    let judul = dasar;
    if (UNDUH_GENERIK.test(dasar)) {
      try { judul = (wc && !wc.isDestroyed()) ? wc.getTitle() : ''; } catch (e) { judul = ''; }
    }
    item.setSaveDialogOptions({
      title: 'Simpan sebagai PDF',
      defaultPath: path.join(lastDir || app.getPath('downloads'), namaPdf(judul)),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    item.once('done', (_ev, state) => {
      if (state !== 'completed') return;
      const p = item.getSavePath();
      if (p) { lastDir = path.dirname(p); toast(wc, '✓ PDF tersimpan: ' + p); }
    });
  });
}

// Cadangan: pasang patch di semua frame setelah DOM siap + Ctrl+P (jendela utama maupun popup).
function lampirkanCetak(wc) {
  const pasang = () => {
    if (wc.isDestroyed()) return;
    let frames = [];
    try { frames = wc.mainFrame.framesInSubtree; } catch (e) {}
    if (!frames.length) { wc.executeJavaScript(PATCH_SRC).catch(() => {}); return; }
    frames.forEach((f) => { try { f.executeJavaScript(PATCH_SRC).catch(() => {}); } catch (e) {} });
  };
  wc.on('dom-ready', pasang);
  wc.on('did-frame-finish-load', pasang);
  wc.on('did-finish-load', pasang);
  wc.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.control && !input.alt && input.key.toLowerCase() === 'p') {
      e.preventDefault();
      wc.executeJavaScript('window.print()').catch(() => {});
    }
  });
  pasang();
}

// ---------- jendela ----------
function buatJendela() {
  win = new BrowserWindow({
    width: 1280, height: 800, show: false, autoHideMenuBar: true,
    title: 'PDP Wima',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: PREFS_JENDELA
  });
  win.removeMenu();
  // Menyesuaikan layar: jendela terbuka maksimal (mengisi layar, taskbar tetap terlihat),
  // tombol minimize / maximize / tutup tetap ada.
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  lampirkanCetak(win.webContents);
  win.webContents.on('did-create-window', (child) => lampirkanCetak(child.webContents));
  win.loadURL('app://pdp/index.html');

  // Alamat PDP di hosting (mis. tombol "kembali" dari RPP Maker) dialihkan ke file lokal.
  const keLokal = (url) => {
    if (!url.startsWith(PORTAL_HOSTED)) return null;
    let rest = url.slice(PORTAL_HOSTED.length);
    if (!rest || rest[0] === '?' || rest[0] === '#') rest = 'index.html' + rest;
    return 'app://pdp/' + rest;
  };
  const dalamApp = (url) => { try { return HOST_DALAM_APP.includes(new URL(url).hostname); } catch (e) { return false; } };

  // Jendela cetak / pratinjau (window.open('')) tetap dibuka; Rekap Absen dibuka di jendela ini; tautan luar lain di browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    const lokal = keLokal(url);
    if (lokal) { win.loadURL(lokal); return { action: 'deny' }; }
    if (dalamApp(url)) { win.loadURL(url); return { action: 'deny' }; }
    if (!url || url === 'about:blank' || url.startsWith('app://') || url.startsWith('blob:'))
      return { action: 'allow', overrideBrowserWindowOptions: { webPreferences: PREFS_JENDELA } };   // popup tetap memakai preload (patch cetak sejak awal)
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  const arahkan = (e, url) => {
    if (url.startsWith('app://')) return;
    const lokal = keLokal(url);
    if (lokal) { e.preventDefault(); win.loadURL(lokal); return; }
    if (dalamApp(url)) return;
    e.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  };
  win.webContents.on('will-navigate', arahkan);
  win.webContents.on('will-redirect', arahkan);

  // Tombol "Menu Utama" melayang di halaman eksternal (RPP Maker / Rekap Absen) supaya selalu bisa kembali.
  const pasangTombol = () => {
    const u = win && !win.isDestroyed() ? win.webContents.getURL() : '';
    if (!dalamApp(u)) return;
    win.webContents.executeJavaScript(`(function(){
      if (document.getElementById('pdpKembali')) return;
      var b = document.createElement('button');
      b.id = 'pdpKembali'; b.setAttribute('data-pdp-noprint', ''); b.type = 'button'; b.textContent = '\u2190 Menu Utama PDP';
      b.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:2147483647;border:0;border-radius:999px;padding:9px 15px;background:#1673e0;color:#fff;font:600 13px Segoe UI,Arial,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3)';
      b.onclick = function(){ location.href = ${JSON.stringify(PORTAL_MENU)}; };
      (document.body || document.documentElement).appendChild(b);
    })();`).catch(() => {});
  };
  win.webContents.on('did-finish-load', pasangTombol);
  win.webContents.on('did-navigate-in-page', pasangTombol);

  // Mundur: tombol Back pada mouse / Alt+Panah Kiri
  const mundur = () => { const h = win.webContents.navigationHistory; if (h.canGoBack()) h.goBack(); };
  win.on('app-command', (_e, cmd) => { if (cmd === 'browser-backward') mundur(); });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.alt && input.key === 'ArrowLeft') { e.preventDefault(); mundur(); }
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
    if (p.startsWith('/__print/')) {   // halaman snapshot untuk cetak PDF (hanya di memori)
      const h = printPages.get(p.slice(9).replace(/\.html$/, ''));
      return h ? new Response(h, { headers: { 'content-type': 'text/html; charset=utf-8' } })
               : new Response('Not found', { status: 404 });
    }
    if (p === '/' || p === '') p = '/index.html';
    const full = path.normalize(path.join(APP_DIR, p));
    if (!full.startsWith(APP_DIR)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(full).toString());
  });

  pasangUnduhan();
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
