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
import android.content.SharedPreferences;
import android.view.MotionEvent;
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
import android.widget.FrameLayout;
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
public class MainActivity extends Activity implements Browser.Host {

    //  정식 판 = https://intionma.github.io/promt-lab/ · 디버그 판 = 로컬 검사 서버 (app/build.gradle 의 SCOPE)
    static final String SCOPE = BuildConfig.SCOPE;
    static final String HOME = SCOPE + "index.html";
    static final int REQ_FILE = 41;
    static final long MAX_BYTES = 40L * 1024 * 1024;   // 이보다 큰 건 사진이 아니라고 본다(메모리 보호)

    WebView web;
    ValueCallback<Uri[]> fileCb;

    //  화면 = [overlay [split [랩 자리 | 경계선 | 🌐 둘러보기]]] (v1.2)
    //  ⚠ 랩 WebView 는 늘 labSlot 안에 넣는다 — 예전처럼 setContentView(web) 하면 나누기가 통째로 사라진다.
    FrameLayout overlay, labSlot;
    SplitLayout split;
    Browser browser;
    SharedPreferences bsp;

    /** 받은 공유 한 장. err 가 있으면 못 읽은 것 — 웹앱이 이유를 말한다(조용히 버리지 않는다). */
    static final class Shared {
        String name = "shared", mime = "", err = null, via = null;
        byte[] data;
    }
    final ArrayDeque<Shared> queue = new ArrayDeque<>();
    final AtomicInteger reading = new AtomicInteger();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);
        web = makeWeb();
        labSlot = new FrameLayout(this);
        labSlot.addView(web);
        browser = new Browser(this, this);
        split = new SplitLayout(this, labSlot, browser.root);
        bsp = getSharedPreferences("browser", MODE_PRIVATE);
        split.ratio = SplitLayout.clamp(bsp.getFloat("ratio", 0.5f));
        split.browserFirst = bsp.getBoolean("first", true);
        split.dir = bsp.getInt("dir", 0);
        split.listener = new SplitLayout.Listener() {
            @Override public void onRatio(float r, boolean done) { if (done) bsp.edit().putFloat("ratio", r).apply(); }
            //  ⚠ 경계선 자체를 기준으로 열면 안 된다 — 좌우 나누기에선 막대가 화면 높이만큼 길어서 메뉴가 화면 맨 아래로
            //    밀려 한 줄만 보였다(가상 기기 실측). 누른 자리에 작은 점을 두고 거기서 연다.
            @Override public void onDividerTap(View anchor, float rawX, float rawY) {
                final View dot = new View(MainActivity.this);
                int[] o = new int[2]; overlay.getLocationOnScreen(o);
                FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(1, 1);
                lp.leftMargin = Math.round(rawX - o[0]); lp.topMargin = Math.round(rawY - o[1]);
                overlay.addView(dot, lp);
                dot.post(() -> showSplitMenu(dot));
            }
        };
        overlay = new FrameLayout(this);
        overlay.addView(split);
        setContentView(overlay);
        //  둘러보기를 연 채로 나갔으면 다시 연다(크롬처럼). 처음엔 닫혀 있다.
        int m0 = bsp.getInt("mode", 0);
        if (m0 != 0) setBrowserMode(m0);
        //  ⚠ 최근 앱 목록에서 다시 열거나(안드로이드가 '처음 받은 인텐트'를 그대로 다시 준다) 시스템이 화면을 다시 만든 경우엔
        //    예전 공유를 또 넣으면 안 된다 — 같은 사진이 또 들어가고, 읽기 허락이 끝나 '못 읽었어요'가 뜬다.
        Intent in0 = getIntent();
        boolean replay = savedInstanceState != null || (in0 != null && (in0.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0);
        boolean share = !replay && takeShare(in0);
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
        w.setDownloadListener((url, ua, cd, mime, len) -> download(url, cd, mime));
        return w;
    }

    void download(String url, String cd, String mime) {
        {
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
        }
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
                if (s.via != null) o.put("via", s.via);
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
                if (browser != null) browser.applyTheme(light);
                if (split != null) split.divider.setTheme(light);
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

        /** 🌐 둘러보기 — "open"(반반) · "close" · "toggle". 웹앱의 🌐 단추가 부른다. */
        @JavascriptInterface public void browser(final String cmd) {
            runOnUiThread(() -> {
                int m = split.mode;
                if ("open".equals(cmd)) setBrowserMode(m == 0 ? 1 : m);
                else if ("close".equals(cmd)) setBrowserMode(0);
                else setBrowserMode(m == 0 ? 1 : 0);
            });
        }

        /** 0 닫힘 · 1 반반 · 2 브라우저 크게 */
        @JavascriptInterface public int browserMode() { return split == null ? 0 : split.mode; }
    }

    void setLab(View v) {
        if (labSlot == null) { setContentView(v); return; }
        labSlot.removeAllViews();
        labSlot.addView(v);
    }

    View labView() { return labSlot; }

    // ── Browser.Host ─────────────────────────────────────────
    @Override public void setBrowserMode(int m) {
        if (m < 0 || m > 2) m = 0;
        split.setMode(m);
        bsp.edit().putInt("mode", m).apply();
        browser.syncMode(m);
        if (m == 0) browser.hidden(); else browser.show();
        if (web != null) web.evaluateJavascript("window._plBrowserState&&window._plBrowserState(" + m + ")", null);
    }
    @Override public int browserMode() { return split.mode; }
    @Override public void swapSides() {
        split.browserFirst = !split.browserFirst;
        bsp.edit().putBoolean("first", split.browserFirst).apply();
        split.requestLayout();
    }
    /**
     * 나누기 방식 고르기 — 경계선을 한 번 탭하거나 ⋮ 메뉴에서 연다(사용자 요청).
     *  방향: 자동(폭 600dp 이상이면 좌우) · 늘 좌우 · 늘 위아래 / 자리: 브라우저를 왼쪽·오른쪽(위·아래)으로 / 반반.
     *  ⚠ 화면 크기로 의도를 맞히지 않는다(CLAUDE.md) — 자동은 처음 값일 뿐, 고르면 그대로 기억한다.
     */
    @Override public void showSplitMenu(View anchor) {
        android.widget.PopupMenu pm = new android.widget.PopupMenu(this, anchor);
        android.view.Menu m = pm.getMenu();
        boolean side = split.sideBySide(split.getWidth());
        m.add(1, 1, 0, "◫ 좌우로 나누기").setCheckable(true).setChecked(split.dir == 1);
        m.add(1, 2, 1, "⬒ 위아래로 나누기").setCheckable(true).setChecked(split.dir == 2);
        m.add(1, 3, 2, "자동 (넓으면 좌우, 좁으면 위아래)").setCheckable(true).setChecked(split.dir == 0);
        m.setGroupCheckable(1, true, true);
        String swap = side ? (split.browserFirst ? "⇆ 브라우저를 오른쪽으로" : "⇆ 브라우저를 왼쪽으로")
                           : (split.browserFirst ? "⇅ 브라우저를 아래로" : "⇅ 브라우저를 위로");
        m.add(2, 4, 3, swap);
        m.add(2, 5, 4, "반반으로");
        //  경계선을 눌러 열 때 둔 점은 닫히면 치운다
        pm.setOnDismissListener(x -> { if (anchor.getParent() == overlay && anchor.getWidth() <= 1) overlay.removeView(anchor); });
        pm.setOnMenuItemClickListener(it -> {
            switch (it.getItemId()) {
                case 1: setSplitDir(1); break;
                case 2: setSplitDir(2); break;
                case 3: setSplitDir(0); break;
                case 4: swapSides(); break;
                case 5: resetRatio(); break;
            }
            return true;
        });
        pm.show();
    }

    void setSplitDir(int d) {
        split.dir = d;
        bsp.edit().putInt("dir", d).apply();
        if (split.mode == 0) setBrowserMode(1);   // 닫혀 있었으면 연다(방식을 골랐다는 건 나눠 보겠다는 뜻)
        split.requestLayout();
    }

    @Override public void resetRatio() { split.setRatio(0.5f); bsp.edit().putFloat("ratio", 0.5f).apply(); }
    @Override public boolean sideBySide() { return split.sideBySide(split.getWidth()); }
    @Override public ViewGroup overlay() { return overlay; }
    @Override public void showFileChooser(ValueCallback<Uri[]> cb, WebChromeClient.FileChooserParams p) {
        if (fileCb != null) fileCb.onReceiveValue(null);
        fileCb = cb;
        try {
            Intent it = p.createIntent();
            if (p.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) it.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            startActivityForResult(Intent.createChooser(it, "파일 고르기"), REQ_FILE);
        } catch (Exception e) {
            fileCb = null;
            cb.onReceiveValue(null);
        }
    }
    @Override public void downloadOther(String url, String ua, String cd, String mime) { download(url, cd, mime); }

    /**
     * 둘러보기에서 집은 그림 → 공유와 **같은 줄**(queue → 웹앱 _plNativeShareArrived)로 넣는다.
     * via=browse 를 붙이면 웹앱이 Anima **편집**으로 맞추고, 대기열이 있어도 줄을 세워 바로 생성한다(사용자 결정).
     */
    @Override public void deliverPicked(String name, String mime, byte[] data, boolean fromScreen) {
        Shared s = new Shared();
        s.name = name == null || name.isEmpty() ? "web" : name;
        s.mime = mime == null ? "" : mime;
        s.data = data;
        s.via = fromScreen ? "browse-screen" : "browse";
        if (data == null || data.length == 0) s.err = "empty";
        synchronized (queue) { queue.add(s); }
        notifyWeb();
    }

    boolean inScope(Uri u) {
        String s = u.toString();
        return s.startsWith(SCOPE) || (s + "/").equals(SCOPE);
    }

    @Override public void openOutside(Uri u) {
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
            //  WebView 그리는 쪽이 죽으면(메모리 부족 등) 그 WebView 는 다시 못 쓴다 → 새로 만들어 다시 연다.
            //  ⚠ 횟수 제한 — 계속 죽는 상황이면 '다시 만들기 → 또 죽음'을 끝없이 돈다(에뮬레이터에서 실제로 봤다).
            //    1분 안에 3번째면 멈추고 사람에게 묻는다.
            ViewGroup p = (ViewGroup) view.getParent();
            if (p != null) p.removeView(view);
            view.destroy();
            if (view == web) web = null;
            long now = System.currentTimeMillis();
            if (now - crashWindowStart > 60_000) { crashWindowStart = now; crashCount = 0; }
            crashCount++;
            if (crashCount >= 3) { showCrashPanel(); return true; }
            web = makeWeb();
            setLab(web);
            web.loadUrl(HOME);
            return true;
        }
    }

    long crashWindowStart = 0;
    int crashCount = 0;

    /** 화면을 그리는 부분이 계속 죽을 때 — 웹이 아니라 앱이 직접 그린다(웹은 지금 못 그린다). */
    void showCrashPanel() {
        android.widget.LinearLayout box = new android.widget.LinearLayout(this);
        box.setOrientation(android.widget.LinearLayout.VERTICAL);
        box.setGravity(android.view.Gravity.CENTER);
        box.setBackgroundColor(Color.parseColor("#0d1017"));
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad, pad, pad);
        android.widget.TextView t = new android.widget.TextView(this);
        t.setText("화면을 그리는 부분(WebView)이 계속 멈춰요.\n\n휴대폰 메모리가 부족하거나, 'Android System WebView' 앱이 오래됐을 수 있어요. 다른 앱을 몇 개 닫거나 플레이스토어에서 'Android System WebView'를 업데이트한 뒤 다시 열어 보세요.");
        t.setTextColor(Color.parseColor("#e5e7eb"));
        t.setTextSize(16);
        t.setLineSpacing(0, 1.3f);
        android.widget.Button b = new android.widget.Button(this);
        b.setText("다시 열기");
        b.setOnClickListener(v -> {
            crashCount = 0; crashWindowStart = System.currentTimeMillis();
            web = makeWeb();
            setLab(web);
            web.loadUrl(HOME);
        });
        box.addView(t);
        box.addView(b);
        setLab(box);
        //  패널은 늘 어두운 바탕이다 — 웹앱이 라이트였으면 상태 표시줄이 밝은 채로 남으니 함께 맞춘다
        new Bridge().setTheme("dark");
    }

    final class Chrome extends WebChromeClient {
        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            showFileChooser(cb, params);
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
        //  둘러보기를 마지막으로 만졌으면 거기 먼저(주소창 → 페이지 뒤로 → '크게'면 반반으로)
        if (split != null && split.mode != 0 && lastTouchBrowser && browser.handleBack()) return;
        //  웹앱의 뒤로가기(크게 보기 닫기·창 닫기·'한 번 더 누르면 나갑니다')를 그대로 쓴다.
        //  더 돌아갈 곳이 없으면 앱을 끄지 않고 뒤로 보낸다 — 대기열·보던 화면이 살아 있게.
        if (web != null && web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); if (browser != null) browser.onResume(); }
    @Override protected void onPause() { if (web != null) web.onPause(); if (browser != null) browser.onPause(); super.onPause(); }

    //  뒤로가기를 어느 쪽에 줄지 — 마지막으로 손댄 쪽. '크게'일 땐 둘러보기뿐이다.
    boolean lastTouchBrowser = false;
    @Override public boolean dispatchTouchEvent(MotionEvent e) {
        if (e.getActionMasked() == MotionEvent.ACTION_DOWN && split != null) {
            if (split.mode == 2) lastTouchBrowser = true;
            else if (split.mode == 1) {
                int[] l = new int[2]; browser.root.getLocationOnScreen(l);
                float x = e.getRawX(), y = e.getRawY();
                lastTouchBrowser = x >= l[0] && x < l[0] + browser.root.getWidth() && y >= l[1] && y < l[1] + browser.root.getHeight();
            } else lastTouchBrowser = false;
        }
        return super.dispatchTouchEvent(e);
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        if (browser != null) browser.destroy();
        super.onDestroy();
    }
}
