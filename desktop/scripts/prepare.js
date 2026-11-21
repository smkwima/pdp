// scripts/prepare.js
// Menyiapkan isi aplikasi Windows dari file web di root repo (tanpa mengubah file aslinya):
//  1. salin file web -> desktop/app
//  2. unduh library CDN (unpkg / jsDelivr / cdnjs) dan Google Fonts -> app/vendor, lalu ganti alamatnya
//     (agar halaman tetap tampil normal saat tidak ada internet)
//  3. sisipkan offline-layer.js paling awal di setiap halaman HTML
//  (ikon aplikasi: desktop/build/icon.ico & icon.png, dari gambar logo Portal Data dan Penilaian)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const DESK = path.resolve(__dirname, '..');
const OUT = path.join(DESK, 'app');
const VENDOR = path.join(OUT, 'vendor');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const SKIP_DIR = new Set(['desktop', 'android', '.github', '.git', 'node_modules', 'supabase', 'presensi-backend', 'presensi-siswa-backend']);
const SKIP_FILE = /\.(sql|md|zip|ts|ini)$/i;

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

function salinRekursif(dari, ke) {
  fs.mkdirSync(ke, { recursive: true });
  for (const n of fs.readdirSync(dari)) {
    const src = path.join(dari, n), dst = path.join(ke, n);
    const st = fs.statSync(src);
    if (st.isDirectory()) {
      if (dari === ROOT && SKIP_DIR.has(n)) continue;   // desktop (termasuk app) tidak ikut disalin
      salinRekursif(src, dst);
    } else if (!SKIP_FILE.test(n)) {
      fs.copyFileSync(src, dst);
    }
  }
}

function salin() {
  fs.rmSync(OUT, { recursive: true, force: true });
  salinRekursif(ROOT, OUT);
}

function semuaFile(dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    if (fs.statSync(f).isDirectory()) { if (n !== 'vendor') semuaFile(f, out); }
    else if (/\.(html|js|css)$/i.test(n)) out.push(f);
  }
  return out;
}

async function unduh(url, opts = {}) {
  const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('Gagal mengunduh ' + url + ' (HTTP ' + r.status + ')');
  return opts.teks ? r.text() : Buffer.from(await r.arrayBuffer());
}

async function vendor() {
  fs.mkdirSync(path.join(VENDOR, 'fonts'), { recursive: true });
  const files = semuaFile(OUT);
  const reLib = /https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\/[^"'`\s)<>]+/g;
  const reFont = /https:\/\/fonts\.googleapis\.com\/css2?\?[^"'`\s)<>]+/g;

  const urls = new Set();
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    (t.match(reLib) || []).forEach((u) => urls.add(u));
    (t.match(reFont) || []).forEach((u) => urls.add(u));
  }

  const peta = {};
  for (const u of urls) {
    const bersih = u.replace(/&amp;/g, '&');
    if (/fonts\.googleapis\.com/.test(u)) {
      let css = await unduh(bersih, { teks: true });
      const fonts = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)\s'"]+/g) || [])];
      for (const fu of fonts) {
        const ext = (fu.split('?')[0].match(/\.(woff2?|ttf|otf)$/) || ['', 'woff2'])[1] || 'woff2';
        const nama = sha(fu) + '.' + ext;
        fs.writeFileSync(path.join(VENDOR, 'fonts', nama), await unduh(fu));
        css = css.split(fu).join('fonts/' + nama);
      }
      const nama = sha(u) + '.css';
      fs.writeFileSync(path.join(VENDOR, nama), css);
      peta[u] = 'vendor/' + nama;
    } else {
      const ext = /\.css(\?|$)/.test(u) ? 'css' : 'js';
      const nama = sha(u) + '.' + ext;
      fs.writeFileSync(path.join(VENDOR, nama), await unduh(bersih));
      peta[u] = 'vendor/' + nama;
    }
    console.log('vendor:', u, '->', peta[u]);
  }

  // Ganti alamat. Urutkan dari URL terpanjang agar tidak saling menimpa.
  const urut = Object.keys(peta).sort((a, b) => b.length - a.length);
  for (const f of files) {
    let t = fs.readFileSync(f, 'utf8'), ubah = false;
    for (const u of urut) { if (t.includes(u)) { t = t.split(u).join(peta[u]); ubah = true; } }
    if (ubah) fs.writeFileSync(f, t);
  }
}

// Alamat "kembali" yang dikirim ke RPP Maker harus alamat hosting PDP (https), bukan app://pdp/.
// Aplikasi mengalihkan alamat itu kembali ke versi lokal (lihat main.js).
function perbaikiRpp() {
  const f = path.join(OUT, 'rpp-launcher.js');
  if (!fs.existsSync(f)) return;
  const t = fs.readFileSync(f, 'utf8');
  const lama = /var dari = [^;]*portal\.html';/;
  if (!lama.test(t)) { console.warn('PERINGATAN: baris "var dari" di rpp-launcher.js tidak ditemukan'); return; }
  fs.writeFileSync(f, t.replace(lama, "var dari = 'https://smkwima.github.io/pdp/portal.html';"));
  console.log('rpp-launcher.js: tautan kembali -> https://smkwima.github.io/pdp/portal.html');
}

function sisipkan() {
  fs.copyFileSync(path.join(DESK, 'offline-layer.js'), path.join(OUT, 'offline-layer.js'));
  let n = 0;
  for (const f of fs.readdirSync(OUT).filter((x) => /\.html$/i.test(x))) {
    const p = path.join(OUT, f);
    let t = fs.readFileSync(p, 'utf8');
    if (t.includes('offline-layer.js')) continue;
    const baru = t.replace(/<head[^>]*>/i, (m) => m + '\n<script src="offline-layer.js"></script>');
    if (baru === t) { console.warn('PERINGATAN: <head> tidak ditemukan di', f); continue; }
    fs.writeFileSync(p, baru); n++;
  }
  console.log('offline-layer disisipkan ke', n, 'halaman HTML');
}

(async () => {
  salin();
  if (process.env.SKIP_VENDOR === '1') console.log('SKIP_VENDOR=1: library CDN tidak diunduh (hanya untuk uji)');
  else await vendor();
  perbaikiRpp();
  sisipkan();
  const sisa = new Set();
  for (const f of semuaFile(OUT)) {
    (fs.readFileSync(f, 'utf8').match(/<(?:script|link)[^>]+(?:src|href)=["']https?:\/\/[^"']+/g) || [])
      .filter((x) => !/preconnect|preload|dns-prefetch/.test(x)).forEach((x) => sisa.add(x.slice(0, 140)));
  }
  if (sisa.size) console.log('Catatan: masih ada sumber eksternal (butuh internet):\n  ' + [...sisa].join('\n  '));
  console.log('Selesai. Isi aplikasi ada di', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
