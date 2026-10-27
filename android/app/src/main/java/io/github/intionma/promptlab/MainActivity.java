package io.github.intionma.promptlab;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 프롬프트 랩 안드로이드 껍데기.
 *
 * 화면은 웹앱(https://intionma.github.io/promt-lab/)을 그대로 띄운다 — 앱 내용 업데이트는 지금처럼 자동이다.
 * 이 앱이 따로 하는 일은 웹앱이 브라우저 안에서 못 하던 것뿐이다:
 *  1) 공유 받기 — 갤러리가 카톡처럼 이 앱에 사진을 '직접' 준다. 홈 화면 웹앱(WebAPK)은 크롬을 거치다
 *     사진이 빠졌다(크롬 153~ 오류, len=153). 받은 사진은 PLNative.next() 로 웹앱이 꺼내 간다.
 *  2) 이미 떠 있으면 새로고침 없이 넣는다(onNewIntent) — 웹앱 공유는 매번 '새 문서'라 보던 화면이 날아갔다.
 *  3) 파일 고르기 · 내려받기(백업·그림 저장) · 화면 켜 두기 · 상태 표시줄 색.
 *
 * ⚠ 웹앱 쪽 짝은 index.html 의 _plNativeInit (window.PLNative 가 있을 때만 켜진다).
 * ⚠ PLNative 는 이 앱이 띄운 페이지면 누구나 부를 수 있다 → 다른 사이트로는 이동시키지 않는다(외부 브라우저로 연다).
 */
public class MainActivity extends Activity {

    static final String ORIGIN = "https://intionma.github.io";
    static final String SCOPE = ORIGIN + "/promt-lab/";
    static final String HOME = SCOPE + "index.html";
    static final int REQ_FILE = 41;
    static final long MAX_BYTES = 40L * 1024 * 1024;   // 이보다 큰 건 사진이 아니라고 본다(메모리 보호)

    WebView web;
    ValueCallback<Uri[]> fileCb;

    /** 받은 공유 한 장. err 가 있으면 못 읽은 것 — 웹앱이 이유를 말한다(조용히 버리지 않는다). */
    static final class Shared {
        String name = "shared", mime = "", err = null;
        byte[] data;
    }
    final ArrayDeque<Shared> queue = new ArrayDeque<>();
    final AtomicInteger reading = new AtomicInteger();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);
        web = makeWeb();
        setContentView(web);
        boolean share = takeShare(getIntent());
        //  공유로 열렸으면 ?shared=1 — 웹앱이 '공유 진입'으로 알아듣고 Anima 화면으로 연다(레이아웃 강제는 웹앱 몫).
        web.loadUrl(share ? HOME + "?shared=1" : HOME);
    }

    WebView makeWeb() {
        WebView w = new WebView(this);
        w.setBackgroundColor(Color.parseColor("#0d1017"));
        w.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        //  https 앱에서 http ComfyUI(집 PC) 를 부를 수 있게 — 브라우저에선 막히던 것
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setSupportMultipleWindows(true);            // 새 창 요청은 onCreateWindow 에서 받아 밖으로 돌린다
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setUserAgentString(s.getUserAgentString() + " PromptLabApp/" + versionName());
        w.addJavascriptInterface(new Bridge(), "PLNative");
        w.setWebViewClient(new Client());
        w.setWebChromeClient(new Chrome());
        //  웹앱이 못 가로챈 http(s) 내려받기(Content-Disposition 등)는 안드로이드 다운로드 관리자로
        w.setDownloadListener((url, ua, cd, mime, len) -> {
            if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) return;
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                String name = URLUtil.guessFileName(url, cd, mime);
                r.setMimeType(mime);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "PromptLab/" + name);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
                Toast.makeText(this, "내려받는 중: " + name, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "내려받기 실패: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });
        return w;
    }

    String versionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        //  이미 떠 있는데 또 공유가 왔다 — 새로고침하지 않고 웹앱에 '꺼내 가라'고만 알린다(보던 화면 그대로).
        takeShare(intent);
    }

    // ── 공유 받기 ────────────────────────────────────────────
    /** 공유 인텐트면 사진을 읽기 시작하고 true. 읽기는 권한이 살아 있는 지금 바로 한다(나중엔 못 읽을 수 있다). */
    boolean takeShare(Intent in) {
        if (in == null) return false;
        String act = in.getAction();
        if (!Intent.ACTION_SEND.equals(act) && !Intent.ACTION_SEND_MULTIPLE.equals(act)) return false;
        final ArrayList<Uri> uris = new ArrayList<>();
        try {
            if (Intent.ACTION_SEND.equals(act)) {
                Uri u = in.getParcelableExtra(Intent.EXTRA_STREAM);
                if (u != null) uris.add(u);
            } else {
                ArrayList<Uri> list = in.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (list != null) for (Uri u : list) if (u != null) uris.add(u);
            }
        } catch (Exception ignored) { }
        ClipData clip = in.getClipData();
        if (uris.isEmpty() && clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) { Uri u = clip.getItemAt(i).getUri(); if (u != null) uris.add(u); }
        }
        final String type = in.getType();
        if (uris.isEmpty()) {
            //  사진 없이 글자·링크만 온 공유 — 웹앱이 '무엇이 왔는지' 말하게 한 장으로 넣는다
            Shared s = new Shared();
            s.err = "nofile";
            CharSequence t = in.getCharSequenceExtra(Intent.EXTRA_TEXT);
            s.name = t != null ? t.toString() : (type != null ? type : "?");
            synchronized (queue) { queue.add(s); }
            notifyWeb();
            return true;
        }
        reading.incrementAndGet();
        new Thread(() -> {
            try {
                for (Uri u : uris) {
                    Shared s = readUri(u, type);
                    synchronized (queue) { queue.add(s); }
                }
            } finally {
                reading.decrementAndGet();
                runOnUiThread(this::notifyWeb);
            }
        }, "pl-share").start();
        return true;
    }

    Shared readUri(Uri u, String fallbackType) {
        Shared s = new Shared();
        ContentResolver cr = getContentResolver();
        try {
            String m = cr.getType(u);
            s.mime = m != null ? m : (fallbackType != null ? fallbackType : "");
        } catch (Exception ignored) { }
        try (Cursor c = cr.query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) s.name = c.getString(0);
        } catch (Exception ignored) { }
        try (InputStream is = cr.openInputStream(u)) {
            if (is == null) { s.err = "open"; return s; }
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[64 * 1024];
            long total = 0;
            int n;
            while ((n = is.read(buf)) > 0) {
                total += n;
                if (total > MAX_BYTES) { s.err = "big"; return s; }
                bo.write(buf, 0, n);
            }
            s.data = bo.toByteArray();
            if (s.data.length == 0) s.err = "empty";
        } catch (SecurityException e) {
            s.err = "perm";
        } catch (Exception e) {
            s.err = "read:" + e.getClass().getSimpleName();
        }
        return s;
    }

    void notifyWeb() {
        if (web == null) return;
        //  웹앱이 아직 안 떴으면 함수가 없다 — 그러면 웹앱이 뜨면서 스스로 꺼내 간다(_plNativeInit).
        web.evaluateJavascript("window._plNativeShareArrived&&window._plNativeShareArrived()", null);
    }

    // ── 웹앱이 부르는 것 (PLNative) ─────────────────────────────
    final class Bridge {
        /** 꺼낼 공유가 남았나(읽는 중 포함). */
        @JavascriptInterface public int pending() {
            synchronized (queue) { return queue.size() + reading.get(); }
        }

        /** 한 장 꺼낸다. 없으면 "". {"name","mime","b64"} 또는 {"name","err"} */
        @JavascriptInterface public String next() {
            Shared s;
            synchronized (queue) { s = queue.poll(); }
            if (s == null) return "";
            try {
                JSONObject o = new JSONObject();
                o.put("name", s.name);
                o.put("mime", s.mime);
                if (s.err != null) o.put("err", s.err);
                if (s.data != null && s.err == null) {
                    o.put("size", s.data.length);
                    o.put("b64", Base64.encodeToString(s.data, Base64.NO_WRAP));
                }
                return o.toString();
            } catch (Exception e) {
                return "{\"err\":\"json\"}";
            }
        }

        @JavascriptInterface public String version() { return versionName(); }

        /** 일하는 동안 화면을 켜 둔다(연속 생성·대기열). 웹 Wake Lock 이 WebView 에서 안 될 때를 대비한 짝. */
        @JavascriptInterface public void keepScreenOn(final boolean on) {
            runOnUiThread(() -> {
                Window w = getWindow();
                if (on) w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else w.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        /** 웹앱 테마에 맞춰 상태 표시줄·내비게이션 바 색을 바꾼다. */
        @JavascriptInterface public void setTheme(final String mode) {
            runOnUiThread(() -> {
                boolean light = "light".equals(mode);
                Window w = getWindow();
                int bg = Color.parseColor(light ? "#f4f5f8" : "#0d1017");
                w.setStatusBarColor(bg);
                w.setNavigationBarColor(bg);
                View d = w.getDecorView();
                int f = d.getSystemUiVisibility();
                if (light) f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                else f &= ~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
                d.setSystemUiVisibility(f);
                if (web != null) web.setBackgroundColor(bg);
            });
        }

        /**
         * 파일 저장 — 웹앱의 '내려받기'(백업 JSON·그림)는 blob: 주소라 WebView 가 스스로 못 받는다.
         * 그림은 사진첩(Pictures/PromptLab), 나머지는 다운로드(Download/PromptLab)에 넣는다.
         * 돌려주는 값: "ok:<폴더/이름>" 또는 "err:<이유>"
         */
        @JavascriptInterface public String saveFile(String name, String mime, String b64) {
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                if (name == null || name.trim().isEmpty()) name = "PromptLab";
                name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
                if (mime == null || mime.isEmpty()) mime = "application/octet-stream";
                boolean img = mime.startsWith("image/");
                String dir = (img ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS) + "/PromptLab";
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, dir);
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri col = img ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                              : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                ContentResolver cr = getContentResolver();
                Uri out = cr.insert(col, v);
                if (out == null) return "err:insert";
                try (OutputStream os = cr.openOutputStream(out)) {
                    if (os == null) return "err:open";
                    os.write(data);
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(out, done, null, null);
                return "ok:" + dir + "/" + name;
            } catch (Exception e) {
                return "err:" + e.getClass().getSimpleName() + (e.getMessage() != null ? " " + e.getMessage() : "");
            }
        }

        /** 다른 사이트 링크는 휴대폰 기본 브라우저로 연다(앱 화면이 다른 사이트로 바뀌지 않게). */
        @JavascriptInterface public void openExternal(final String url) {
            runOnUiThread(() -> openOutside(Uri.parse(url)));
        }
    }

    boolean inScope(Uri u) {
        String s = u.toString();
        return s.startsWith(SCOPE) || s.equals(ORIGIN + "/promt-lab");
    }

    void openOutside(Uri u) {
        if (u == null) return;
        String sc = u.getScheme();
        if (sc == null || "javascript".equalsIgnoreCase(sc) || "file".equalsIgnoreCase(sc)
                || "blob".equalsIgnoreCase(sc) || "data".equalsIgnoreCase(sc)) return;
        try {
            Intent i = "intent".equalsIgnoreCase(sc) ? Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, u);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            i.setComponent(null);
            i.setSelector(null);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "열 수 있는 앱이 없어요", Toast.LENGTH_SHORT).show();
        } catch (Exception ignored) { }
    }

    final class Client extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            if (!req.isForMainFrame()) return false;
            Uri u = req.getUrl();
            if (inScope(u)) return false;
            //  ⚠ 이 앱 화면이 다른 사이트로 바뀌면 그 사이트도 PLNative 를 부를 수 있다 → 밖으로 보낸다
            openOutside(u);
            return true;
        }

        @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            //  WebView 그리는 쪽이 죽으면(메모리 부족 등) 그 WebView 는 다시 못 쓴다 → 새로 만들어 다시 연다
            ViewGroup p = (ViewGroup) view.getParent();
            if (p != null) p.removeView(view);
            view.destroy();
            web = makeWeb();
            setContentView(web);
            web.loadUrl(HOME);
            return true;
        }
    }

    final class Chrome extends WebChromeClient {
        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = cb;
            try {
                Intent it = params.createIntent();
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) it.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                startActivityForResult(Intent.createChooser(it, "파일 고르기"), REQ_FILE);
            } catch (Exception e) {
                fileCb = null;
                cb.onReceiveValue(null);
                return false;
            }
            return true;
        }

        //  target=_blank · window.open — 같은 앱 주소면 이 화면에서, 다른 사이트면 밖의 브라우저로
        @Override public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            WebView tmp = new WebView(MainActivity.this);
            tmp.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                    Uri u = req.getUrl();
                    if (inScope(u)) web.loadUrl(u.toString()); else openOutside(u);
                    v.destroy();
                    return true;
                }
            });
            WebView.WebViewTransport t = (WebView.WebViewTransport) resultMsg.obj;
            t.setWebView(tmp);
            resultMsg.sendToTarget();
            return true;
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE) {
            Uri[] out = null;
            if (res == RESULT_OK && data != null) {
                ClipData c = data.getClipData();
                if (c != null && c.getItemCount() > 0) {
                    out = new Uri[c.getItemCount()];
                    for (int i = 0; i < c.getItemCount(); i++) out[i] = c.getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    out = new Uri[]{data.getData()};
                }
            }
            if (fileCb != null) fileCb.onReceiveValue(out);
            fileCb = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    public void onBackPressed() {
        //  웹앱의 뒤로가기(크게 보기 닫기·창 닫기·'한 번 더 누르면 나갑니다')를 그대로 쓴다.
        //  더 돌아갈 곳이 없으면 앱을 끄지 않고 뒤로 보낸다 — 대기열·보던 화면이 살아 있게.
        if (web != null && web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onPause() { if (web != null) web.onPause(); super.onPause(); }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
