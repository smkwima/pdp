package id.sch.smkwima.pdp

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.print.PrintAttributes
import android.print.PrintJob
import android.print.PrintManager
import android.provider.MediaStore
import android.util.Base64
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.MimeTypeMap
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject

/**
 * PDP Wima untuk Android: membungkus portal web (https://smkwima.github.io/pdp/) dalam WebView.
 *
 *  - TIDAK fullscreen: bar status (jam, sinyal, baterai) dan bar navigasi HP tetap terlihat.
 *  - Tanpa indikator online/offline (versi ini selalu memuat portal dari internet).
 *  - Tombol Cetak -> dialog cetak Android (pilih "Simpan sebagai PDF"); nama PDF mengikuti judul
 *    dokumen, mis. "Biodata Buku Induk - Nama - Kelas".
 *  - Unduh PDF / Excel / gambar dari halaman -> tersimpan di folder Download.
 *  - Upload foto / berkas lewat pemilih berkas Android.
 *  - Sesi login tetap tersimpan (index.html masuk otomatis).
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val HOST = "smkwima.github.io"
        private const val URL_AWAL = "https://smkwima.github.io/pdp/index.html"

        // Margin kertas saat cetak, dalam mil (1/1000 inci). 500 = 12,7 mm (Narrow), sama dengan versi desktop.
        private const val MARGIN_CETAK_MIL = 500

        // Ditanam ke setiap halaman portal setelah selesai dimuat (idempoten):
        //  - window.print()  -> dialog cetak Android (isi halaman disalin dulu, jadi aman
        //                       walau halaman langsung membersihkan isinya setelah print()).
        //  - window.open()   -> jendela cetak; w.print() mencetak jendela itu.
        //  - unduhan blob/data lewat <a download> -> nama berkas dicatat agar tersimpan dengan nama benar.
        private const val JS_TAMBAL = """
(function () {
  if (window.__pdpAndroid) return;
  window.__pdpAndroid = true;

  function judul(d) {
    try {
      var m = d.querySelector('meta[name="pdf-filename"]');
      if (m && m.getAttribute('content')) return m.getAttribute('content');
      return d.title || '';
    } catch (e) { return ''; }
  }

  function salinan() {
    var doc = document;
    try { window.dispatchEvent(new Event('beforeprint')); } catch (e) {}
    var d = doc.documentElement.cloneNode(true);
    Array.prototype.forEach.call(d.querySelectorAll('script,base,noscript'), function (n) { n.remove(); });
    var ai = doc.querySelectorAll('input,textarea,select'), ci = d.querySelectorAll('input,textarea,select');
    for (var i = 0; i < ai.length && i < ci.length; i++) {
      var a = ai[i], c = ci[i], t = (a.type || '').toLowerCase();
      if (a.tagName === 'TEXTAREA') c.textContent = a.value;
      else if (a.tagName === 'SELECT') Array.prototype.forEach.call(c.options, function (o, k) { if (a.options[k] && a.options[k].selected) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
      else if (t === 'checkbox' || t === 'radio') { if (a.checked) c.setAttribute('checked', ''); else c.removeAttribute('checked'); }
      else c.setAttribute('value', a.value);
    }
    var av = doc.querySelectorAll('canvas'), cv = d.querySelectorAll('canvas');
    for (var j = 0; j < av.length && j < cv.length; j++) {
      try {
        var im = doc.createElement('img');
        im.src = av[j].toDataURL('image/png');
        im.style.cssText = av[j].style.cssText;
        im.width = av[j].width; im.height = av[j].height;
        cv[j].replaceWith(im);
      } catch (e) {}
    }
    var head = d.querySelector('head');
    if (head) {
      var b = doc.createElement('base');
      b.href = doc.baseURI;
      head.insertBefore(b, head.firstChild);
    }
    return '<!DOCTYPE html>' + d.outerHTML;
  }

  window.print = function () {
    try { AndroidApp.cetakHtml(judul(document), salinan()); } catch (e) {}
    try { window.dispatchEvent(new Event('afterprint')); } catch (e) {}
  };

  var asliOpen = window.open;
  window.open = function () {
    var w = asliOpen.apply(window, arguments);
    try {
      if (w) w.print = function () { try { AndroidApp.cetakJendela(judul(w.document)); } catch (e) {} };
    } catch (e) {}
    return w;
  };

  function catatNama(a) {
    try {
      if (a && a.hasAttribute && a.hasAttribute('download')) window.__pdpNamaUnduh = a.getAttribute('download') || '';
    } catch (e) {}
  }
  var asliClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { catatNama(this); return asliClick.apply(this, arguments); };
  var asliDispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (ev) {
    try { if (ev && ev.type === 'click' && this instanceof HTMLAnchorElement) catatNama(this); } catch (e) {}
    return asliDispatch.apply(this, arguments);
  };
  document.addEventListener('click', function (e) {
    try {
      var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
      if (a) catatNama(a);
    } catch (e2) {}
  }, true);
})();
"""
    }

    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private var popup: WebView? = null
    private var pilihFileCallback: ValueCallback<Array<Uri>>? = null
    private val handler = Handler(Looper.getMainLooper())

    // true bila halaman yang sedang tampil berasal dari portal sendiri; dibaca juga oleh thread jembatan JS.
    @Volatile
    private var halamanAman = false

    private val pemilihFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { hasil ->
        val cb = pilihFileCallback
        pilihFileCallback = null
        cb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(hasil.resultCode, hasil.data))
    }

    @Suppress("DEPRECATION")
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Tidak fullscreen: konten berada DI BAWAH bar status dan DI ATAS bar navigasi HP.
        WindowCompat.setDecorFitsSystemWindows(window, true)
        val latar = Color.parseColor("#F8FAFC")
        window.statusBarColor = latar
        window.navigationBarColor = latar
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }

        root = FrameLayout(this)
        root.setBackgroundColor(latar)
        // Android 15+ memaksa tampilan edge-to-edge; padding ini menjaga konten tetap di luar bar sistem
        // (juga di luar notch dan keyboard). Di Android lama padding ini otomatis 0.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bar = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(bar.left, bar.top, bar.right, maxOf(bar.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }

        web = WebView(this)
        siapkanWebView(web)
        root.addView(
            web,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        setContentView(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    popup != null -> tutupPopup()
                    web.canGoBack() -> web.goBack()
                    else -> {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        })

        web.loadUrl(URL_AWAL)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        tutupPopup()
        root.removeAllViews()
        web.destroy()
        super.onDestroy()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun siapkanWebView(w: WebView) {
        val s = w.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true            // localStorage: sesi login Supabase tersimpan di sini
        s.setSupportMultipleWindows(true)     // window.open() (jendela cetak)
        s.javaScriptCanOpenWindowsAutomatically = true
        s.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        s.allowFileAccess = false
        s.userAgentString = s.userAgentString + " PDPAndroid/1.0"

        CookieManager.getInstance().setAcceptCookie(true)

        w.addJavascriptInterface(Jembatan(), "AndroidApp")
        w.webViewClient = KlienWeb()
        w.webChromeClient = KlienChrome()
        w.setDownloadListener { url, _, disposisi, mime, _ -> tanganiUnduhan(url, disposisi, mime) }
    }

    // ---------------------------------------------------------------- util

    private fun sehost(url: String?): Boolean =
        url != null && Uri.parse(url).host == HOST

    private fun toast(teks: String) {
        Toast.makeText(this, teks, Toast.LENGTH_LONG).show()
    }

    private fun bukaLuar(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (e: ActivityNotFoundException) {
            toast("Tidak ada aplikasi untuk membuka tautan ini.")
        }
    }

    // Nama berkas aman untuk Android/Windows; kosong bila tidak ada isi.
    private fun bersihNama(x: String): String =
        x.replace(Regex("\\s*[—–|-]\\s*PORTAL DATA DAN PENILAIAN.*\$", RegexOption.IGNORE_CASE), "")
            .replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
            .trimEnd('.', ' ')
            .take(120)

    private fun tampilkanGalat(view: WebView) {
        val html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>" +
            "<body style='font-family:sans-serif;text-align:center;padding:48px 24px;color:#0f172a;background:#f8fafc'>" +
            "<h2>Tidak dapat terhubung</h2><p>Periksa koneksi internet, lalu coba lagi.</p>" +
            "<button style='padding:12px 22px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:16px' " +
            "onclick=\"location.href='$URL_AWAL'\">Coba lagi</button></body></html>"
        view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
    }

    // ---------------------------------------------------------------- jendela cetak (popup)

    private fun tutupPopup() {
        val p = popup ?: return
        popup = null
        root.removeView(p)
        p.stopLoading()
        p.destroy()
    }

    // ---------------------------------------------------------------- cetak

    private fun cetak(sumber: WebView, judul: String) {
        var nama = bersihNama(judul)
        if (nama.isEmpty()) nama = "Dokumen PDP"
        val pm = getSystemService(Context.PRINT_SERVICE) as PrintManager
        val atribut = PrintAttributes.Builder()
            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
            .setMinMargins(
                PrintAttributes.Margins(MARGIN_CETAK_MIL, MARGIN_CETAK_MIL, MARGIN_CETAK_MIL, MARGIN_CETAK_MIL)
            )
            .build()
        // Nama pekerjaan cetak = nama berkas bawaan saat memilih "Simpan sebagai PDF".
        val job = pm.print(nama, sumber.createPrintDocumentAdapter(nama), atribut)
        pantauCetak(job, sumber)
    }

    // Jendela cetak disimpan sampai pekerjaan cetak selesai / dibatalkan.
    private fun pantauCetak(job: PrintJob, sumber: WebView) {
        val cek = object : Runnable {
            override fun run() {
                if (job.isCompleted || job.isCancelled || job.isFailed) {
                    if (sumber === popup) tutupPopup()
                    return
                }
                handler.postDelayed(this, 2000)
            }
        }
        handler.postDelayed(cek, 2000)
    }

    // Cetak dari salinan HTML halaman (window.print() di halaman utama).
    private fun cetakDariHtml(judul: String, html: String) {
        tutupPopup()
        val p = WebView(this)
        p.settings.javaScriptEnabled = false
        p.settings.allowFileAccess = false
        p.visibility = View.INVISIBLE
        root.addView(
            p,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        popup = p
        p.webViewClient = object : WebViewClient() {
            private var sudah = false
            override fun onPageFinished(view: WebView, url: String?) {
                if (sudah) return
                sudah = true
                // beri waktu sebentar agar gambar/foto selesai digambar
                handler.postDelayed({ if (popup === view) cetak(view, judul) }, 600)
            }
        }
        p.loadDataWithBaseURL(URL_AWAL, html, "text/html", "utf-8", null)
    }

    // ---------------------------------------------------------------- unduhan

    private fun tanganiUnduhan(url: String, disposisi: String?, mime: String?) {
        when {
            url.startsWith("blob:") -> if (halamanAman) ambilDariHalaman(url, mime ?: "", false)
            url.startsWith("data:") -> if (halamanAman) ambilDariHalaman(url, mime ?: "", true)
            else -> unduhBiasa(url, disposisi, mime)
        }
    }

    // blob:/data: tidak bisa diunduh DownloadManager; isinya dibaca di dalam halaman lalu diserahkan ke aplikasi.
    private fun ambilDariHalaman(url: String, mime: String, langsung: Boolean) {
        val u = JSONObject.quote(url)
        val m = JSONObject.quote(mime)
        val js = if (langsung) {
            "(function(){var n=window.__pdpNamaUnduh||'';window.__pdpNamaUnduh='';AndroidApp.simpanBerkas($u,n,$m);})();"
        } else {
            "(function(){var n=window.__pdpNamaUnduh||'';window.__pdpNamaUnduh='';" +
                "var x=new XMLHttpRequest();x.open('GET',$u,true);x.responseType='blob';" +
                "x.onload=function(){var r=new FileReader();" +
                "r.onloadend=function(){AndroidApp.simpanBerkas(String(r.result),n,x.response.type||$m);};" +
                "r.readAsDataURL(x.response);};" +
                "x.onerror=function(){AndroidApp.pesan('Gagal membaca berkas untuk disimpan.');};" +
                "x.send();})();"
        }
        web.evaluateJavascript(js, null)
    }

    private fun unduhBiasa(url: String, disposisi: String?, mime: String?) {
        try {
            val nama = URLUtil.guessFileName(url, disposisi, mime)
            val req = DownloadManager.Request(Uri.parse(url))
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, nama)
            if (!mime.isNullOrEmpty()) req.setMimeType(mime)
            CookieManager.getInstance().getCookie(url)?.let { req.addRequestHeader("Cookie", it) }
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
            toast("Mengunduh: $nama")
        } catch (e: Exception) {
            toast("Gagal mengunduh berkas.")
        }
    }

    // Menyimpan isi data: URL ke folder Download (dipanggil dari thread latar).
    private fun simpanKeDownload(dataUrl: String, namaAsli: String, mimeAsli: String) {
        try {
            val koma = dataUrl.indexOf(',')
            if (!dataUrl.startsWith("data:") || koma < 0) throw IllegalArgumentException("format tidak dikenal")
            val kepala = dataUrl.substring(5, koma)
            val isi = dataUrl.substring(koma + 1)
            val bytes = if (kepala.endsWith(";base64")) {
                Base64.decode(isi, Base64.DEFAULT)
            } else {
                Uri.decode(isi).toByteArray(Charsets.UTF_8)
            }

            var mime = kepala.substringBefore(';')
            if (mime.isEmpty()) mime = mimeAsli
            if (mime.isEmpty()) mime = "application/octet-stream"

            var nama = bersihNama(namaAsli)
            if (nama.isEmpty()) nama = "Dokumen PDP"
            if (!nama.contains('.')) {
                MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)?.let { nama = "$nama.$it" }
            }

            val nilai = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, nama)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, nilai)
                ?: throw IllegalStateException("tidak bisa membuat berkas")
            val stream = contentResolver.openOutputStream(uri)
                ?: throw IllegalStateException("tidak bisa menulis berkas")
            stream.use { it.write(bytes) }
            nilai.clear()
            nilai.put(MediaStore.Downloads.IS_PENDING, 0)
            contentResolver.update(uri, nilai, null, null)

            runOnUiThread { toast("Tersimpan di folder Download: $nama") }
        } catch (e: Exception) {
            runOnUiThread { toast("Gagal menyimpan berkas.") }
        }
    }

    // ---------------------------------------------------------------- jembatan JS <-> aplikasi
    // Hanya halaman portal sendiri (halamanAman) yang boleh memakainya. Kelas HARUS public agar
    // bisa dipanggil lewat refleksi oleh WebView.

    inner class Jembatan {
        @JavascriptInterface
        fun cetakHtml(judul: String?, html: String?) {
            if (!halamanAman) return
            val h = html ?: return
            if (h.isEmpty()) return
            runOnUiThread { cetakDariHtml(judul ?: "", h) }
        }

        @JavascriptInterface
        fun cetakJendela(judul: String?) {
            if (!halamanAman) return
            runOnUiThread {
                val p = popup
                if (p != null) cetak(p, judul ?: "") else cetak(web, judul ?: "")
            }
        }

        @JavascriptInterface
        fun simpanBerkas(dataUrl: String?, nama: String?, mime: String?) {
            if (!halamanAman) return
            val d = dataUrl ?: return
            Thread { simpanKeDownload(d, nama ?: "", mime ?: "") }.start()
        }

        @JavascriptInterface
        fun pesan(teks: String?) {
            if (!halamanAman) return
            val t = teks ?: return
            runOnUiThread { toast(t) }
        }
    }

    // ---------------------------------------------------------------- klien WebView

    private inner class KlienWeb : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            val skema = uri.scheme ?: return false
            if (skema == "http" || skema == "https") {
                if (uri.host == HOST) return false
                bukaLuar(uri)           // tautan ke situs lain dibuka di browser HP
                return true
            }
            if (skema == "blob" || skema == "data" || skema == "about" || skema == "javascript") return false
            bukaLuar(uri)               // mailto:, tel:, whatsapp:, dst.
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            halamanAman = sehost(url)
        }

        override fun onPageFinished(view: WebView, url: String?) {
            halamanAman = sehost(url)
            if (halamanAman) view.evaluateJavascript(JS_TAMBAL, null)
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) tampilkanGalat(view)
        }
    }

    // Jendela hasil window.open(): jendela cetak (isi ditulis halaman) atau tautan target=_blank.
    private inner class KlienPopup : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            val skema = uri.scheme
            if (skema == "http" || skema == "https") {
                if (uri.host == HOST) web.loadUrl(uri.toString()) else bukaLuar(uri)
                handler.post { if (view === popup) tutupPopup() }
                return true
            }
            return false
        }
    }

    private inner class KlienChrome : WebChromeClient() {
        override fun onShowFileChooser(
            webView: WebView,
            callback: ValueCallback<Array<Uri>>,
            params: WebChromeClient.FileChooserParams
        ): Boolean {
            pilihFileCallback?.onReceiveValue(null)
            pilihFileCallback = callback
            return try {
                pemilihFile.launch(params.createIntent())
                true
            } catch (e: Exception) {
                pilihFileCallback = null
                callback.onReceiveValue(null)
                true
            }
        }

        @SuppressLint("SetJavaScriptEnabled")
        override fun onCreateWindow(
            view: WebView,
            isDialog: Boolean,
            isUserGesture: Boolean,
            resultMsg: Message
        ): Boolean {
            tutupPopup()
            val p = WebView(this@MainActivity)
            p.settings.javaScriptEnabled = true
            p.settings.domStorageEnabled = true
            p.webViewClient = KlienPopup()
            p.visibility = View.INVISIBLE   // tidak ditampilkan; hanya dipakai untuk dicetak
            root.addView(
                p,
                FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            )
            popup = p
            val transport = resultMsg.obj as WebView.WebViewTransport
            transport.webView = p
            resultMsg.sendToTarget()
            return true
        }

        override fun onCloseWindow(window: WebView) {
            if (window === popup) tutupPopup()
        }
    }
}
