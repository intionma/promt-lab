package io.github.intionma.promptlab;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.text.TextUtils;
import android.util.Base64;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.KeyEvent;
import android.view.Menu;
import android.view.MotionEvent;
import android.view.PixelCopy;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.LinkedHashSet;

/**
 * 🌐 둘러보기 — 앱 안의 브라우저 (v1.2, 사용자 요청).
 *
 * 왜: 크롬에서 그림을 꾹 누르면 「이미지 공유」가 메뉴 맨 아래라 누르기 어렵고, 공유 → 앱 고르기까지 단계가 많았다.
 *     앱 안에서 둘러보면 **그림을 꾹 누르는 것 하나로** 바로 Anima 편집 원본이 되고 생성까지 간다.
 *
 * 그림 넣기
 *  · 꾹 누르기 = 메뉴 없이 바로 넣기. 그림이 아닌 곳을 꾹 누르면 원래대로(글자 고르기).
 *  · 🎯 집기 모드 = 톡 탭만 해도 넣는다(그동안 링크는 안 열린다).
 *  · 화면에 보이는 미리보기 말고 **제일 큰 원본**을 찾는다: 그림을 감싼 링크가 그림 파일이면 그것 → srcset 의 제일 큰 것 → 지금 보이는 것.
 *    받을 때는 그 페이지의 쿠키·주소(Referer)를 함께 보낸다(그래야 주는 사이트가 있다).
 *  · 원본을 못 받으면 **화면에 보이는 그대로** 잘라 넣고 그 사실을 말한다(조용히 실패하지 않는다).
 *
 * ⚠ 이 WebView 에는 PLNative 를 **절대 달지 않는다** — 아무 사이트나 여는 곳이다. 그림 찾기는 evaluateJavascript 의
 *   돌려받는 값으로만 하고, 받는 것도 앱(자바)이 직접 한다. 사이트가 앱에 무언가를 시킬 길이 없다.
 * ⚠ 구글 계정 로그인은 구글이 앱 안 브라우저를 막아 둬서 안 된다. 사용자 에이전트를 속여 뚫지 않는다(구글 정책 위반).
 */
final class Browser {

    static final String HOME = "https://www.google.com/";
    static final int MAX_TABS = 8;

    interface Host {
        void deliverPicked(String name, String mime, byte[] data, boolean fromScreen);
        void setBrowserMode(int m);
        int browserMode();
        void swapSides();
        void resetRatio();
        void showSplitMenu(View anchor);
        boolean sideBySide();
        void showFileChooser(ValueCallback<Uri[]> cb, WebChromeClient.FileChooserParams p);
        void openOutside(Uri u);
        void downloadOther(String url, String ua, String cd, String mime);
        ViewGroup overlay();
    }

    static final class Tab {
        String url = HOME, title = "";
        WebView w;
        Tab opener;   // 새 창(target=_blank)으로 열렸으면 연 탭 — 뒤로 갈 데가 없으면 닫고 거기로 돌아간다(크롬처럼)
        int lastX, lastY;
    }

    final MainActivity act;
    final Host host;
    final float dp;
    final SharedPreferences sp;
    final Handler ui = new Handler(Looper.getMainLooper());

    final LinearLayout root;
    final LinearLayout bar;
    final EditText addr;
    final TextView bBack, bReload, bPick, bTabs, bMode, bMenu, banner;
    final ProgressBar prog;
    final FrameLayout content;

    final ArrayList<Tab> tabs = new ArrayList<>();
    int cur = 0;
    boolean pick, desktop, light;
    String lastPickKey = "";
    long lastPickAt = 0;

    Browser(MainActivity a, Host h) {
        act = a; host = h;
        dp = a.getResources().getDisplayMetrics().density;
        sp = a.getSharedPreferences("browser", Context.MODE_PRIVATE);
        pick = sp.getBoolean("pick", false);
        desktop = sp.getBoolean("desktop", false);

        root = new LinearLayout(a);
        root.setOrientation(LinearLayout.VERTICAL);
        //  ⚠ '크게'일 땐 랩이 바로 뒤에 깔려 있다 — 단추 사이 빈 곳을 눌러도 뒤의 랩이 눌리지 않게 여기서 먹는다
        root.setClickable(true);

        bar = new LinearLayout(a);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(px(4), px(4), px(4), px(4));
        bBack = btn("←", "뒤로");
        bReload = btn("↻", "새로고침");
        addr = new EditText(a);
        addr.setSingleLine(true);
        addr.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        addr.setImeOptions(EditorInfo.IME_ACTION_GO);
        addr.setSelectAllOnFocus(true);
        addr.setTextSize(14);
        addr.setHint("주소 또는 검색어");
        addr.setPadding(px(12), 0, px(12), 0);
        addr.setEllipsize(TextUtils.TruncateAt.END);
        addr.setMinWidth(px(96));
        LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(0, px(38), 1f);
        alp.setMargins(px(4), 0, px(4), 0);
        addr.setLayoutParams(alp);
        bPick = btn("🎯", "집기 모드 — 켜면 그림을 톡 탭만 해도 넣어요");
        bTabs = btn("1", "탭");
        bMode = btn("크게", "브라우저 크게 / 반반");
        bMode.setTextSize(12);
        bMenu = btn("⋮", "메뉴");
        bar.addView(bBack); bar.addView(addr); bar.addView(bReload); bar.addView(bPick); bar.addView(bTabs); bar.addView(bMode); bar.addView(bMenu);

        prog = new ProgressBar(a, null, android.R.attr.progressBarStyleHorizontal);
        prog.setMax(100);
        prog.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(3)));

        content = new FrameLayout(a);
        content.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        banner = new TextView(a);
        banner.setTextSize(14);
        banner.setTextColor(Color.WHITE);
        banner.setPadding(px(14), px(9), px(14), px(9));
        banner.setVisibility(View.GONE);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#e6151a24"));
        bg.setCornerRadius(px(18));
        banner.setBackground(bg);
        FrameLayout.LayoutParams blp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        blp.bottomMargin = px(16);
        content.addView(banner, blp);

        root.addView(bar);
        root.addView(prog);
        root.addView(content);

        bBack.setOnClickListener(v -> { WebView w = curWeb(); if (w != null && w.canGoBack()) w.goBack(); });
        bReload.setOnClickListener(v -> {
            WebView w = curWeb(); if (w == null) return;
            if (prog.getVisibility() == View.VISIBLE) w.stopLoading(); else w.reload();
        });
        bPick.setOnClickListener(v -> setPick(!pick));
        bTabs.setOnClickListener(v -> showTabs());
        bMode.setOnClickListener(v -> host.setBrowserMode(host.browserMode() == 2 ? 1 : 2));
        bMenu.setOnClickListener(v -> showMenu());
        addr.setOnEditorActionListener((v, id, ev) -> {
            if (id == EditorInfo.IME_ACTION_GO || (ev != null && ev.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
                go(addr.getText().toString());
                return true;
            }
            return false;
        });
        addr.setOnFocusChangeListener((v, f) -> { if (!f) syncBar(); });

        //  칸이 좁아지면(경계선을 끌어 줄이면) 덜 쓰는 단추부터 ⋮ 메뉴로 — 안 그러면 주소창이 한 글자로 눌렸다(가상 기기에서 실측)
        root.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
            if (r - l != or - ol) ui.post(() -> fitBar(r - l));
        });

        restoreTabs();
        applyTheme(false);
    }

    void fitBar(int w) {
        float d = w / dp;
        bReload.setVisibility(d < 400 ? View.GONE : View.VISIBLE);
        bMode.setVisibility(d < 340 ? View.GONE : View.VISIBLE);
        bBack.setVisibility(d < 290 ? View.GONE : View.VISIBLE);
    }

    int px(float v) { return Math.round(v * dp); }

    TextView btn(String t, String desc) {
        TextView b = new TextView(act);
        b.setText(t);
        b.setContentDescription(desc);
        b.setTextSize(18);
        b.setGravity(Gravity.CENTER);
        b.setMinWidth(px(40));
        b.setMinHeight(px(40));
        b.setPadding(px(6), 0, px(6), 0);
        b.setClickable(true);
        b.setFocusable(true);
        b.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, px(40)));
        return b;
    }

    // ── 테마 — 웹앱 테마를 따른다 ────────────────────────────────
    void applyTheme(boolean lt) {
        light = lt;
        int barBg = Color.parseColor(lt ? "#f4f5f8" : "#151a24");
        int fg = Color.parseColor(lt ? "#1f2430" : "#e5e7eb");
        int field = Color.parseColor(lt ? "#ffffff" : "#0d1017");
        bar.setBackgroundColor(barBg);
        root.setBackgroundColor(barBg);
        content.setBackgroundColor(Color.parseColor(lt ? "#ffffff" : "#0d1017"));
        for (TextView b : new TextView[]{bBack, bReload, bTabs, bMode, bMenu}) b.setTextColor(fg);
        GradientDrawable f = new GradientDrawable();
        f.setColor(field);
        f.setCornerRadius(px(19));
        f.setStroke(px(1), Color.parseColor(lt ? "#d5d9e1" : "#262d3b"));
        addr.setBackground(f);
        addr.setTextColor(fg);
        addr.setHintTextColor(Color.parseColor(lt ? "#8a90a0" : "#6b7280"));
        GradientDrawable tb = new GradientDrawable();
        tb.setStroke(px(1.5f), fg);
        tb.setCornerRadius(px(5));
        bTabs.setBackground(null);
        bTabs.setForeground(null);
        bTabs.setTextSize(13);
        bTabs.setBackground(insetBox(tb));
        syncPick();
    }

    android.graphics.drawable.Drawable insetBox(GradientDrawable g) {
        return new android.graphics.drawable.InsetDrawable(g, px(9), px(9), px(9), px(9));
    }

    void syncPick() {
        GradientDrawable on = new GradientDrawable();
        on.setColor(Color.parseColor("#55d946ef"));
        on.setCornerRadius(px(20));
        bPick.setBackground(pick ? on : null);
        bPick.setAlpha(pick ? 1f : 0.75f);
    }

    void setPick(boolean on) {
        pick = on;
        sp.edit().putBoolean("pick", on).apply();
        syncPick();
        for (Tab t : tabs) if (t.w != null) injectFlags(t.w);
        flash(on ? "🎯 집기 모드 — 그림을 톡 탭하면 바로 넣어요 (링크는 안 열려요)" : "집기 모드 끔 — 그림은 꾹 눌러서 넣어요", 2600);
    }

    void syncMode(int m) {
        bMode.setText(m == 2 ? "반반" : "크게");
        bMode.setContentDescription(m == 2 ? "반반으로 보기" : "브라우저 크게 보기");
    }

    // ── 탭 ─────────────────────────────────────────────────
    void restoreTabs() {
        try {
            JSONArray arr = new JSONArray(sp.getString("tabs", "[]"));
            for (int i = 0; i < arr.length() && tabs.size() < MAX_TABS; i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                String u = o.optString("u", "");
                if (!isWeb(u)) continue;
                Tab t = new Tab(); t.url = u; t.title = o.optString("t", ""); tabs.add(t);
            }
            cur = Math.max(0, Math.min(tabs.size() - 1, sp.getInt("cur", 0)));
        } catch (Exception ignored) { }
        if (tabs.isEmpty()) { tabs.add(new Tab()); cur = 0; }
        updateTabCount();
    }

    void saveTabs() {
        try {
            JSONArray arr = new JSONArray();
            for (Tab t : tabs) {
                if (t.w != null && t.w.getUrl() != null && isWeb(t.w.getUrl())) t.url = t.w.getUrl();
                JSONObject o = new JSONObject(); o.put("u", t.url); o.put("t", t.title); arr.put(o);
            }
            sp.edit().putString("tabs", arr.toString()).putInt("cur", cur).apply();
        } catch (Exception ignored) { }
    }

    static boolean isWeb(String u) { return u != null && (u.startsWith("https://") || u.startsWith("http://")); }

    Tab curTab() { return tabs.isEmpty() ? null : tabs.get(cur); }
    WebView curWeb() { Tab t = curTab(); return t == null ? null : t.w; }

    /** 브라우저가 처음 보일 때·탭을 바꿀 때 — WebView 는 그때 만든다(안 쓰는 탭은 메모리를 안 먹게). */
    void show() {
        Tab t = curTab();
        if (t == null) return;
        if (t.w == null) {
            t.w = makeWeb(t);
            t.w.loadUrl(t.url);
        }
        for (int i = content.getChildCount() - 1; i >= 0; i--) {
            View c = content.getChildAt(i);
            if (c instanceof WebView && c != t.w) content.removeView(c);
        }
        if (t.w.getParent() == null) content.addView(t.w, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        t.w.onResume();
        syncBar();
        updateTabCount();
    }

    void switchTo(int i) {
        if (i < 0 || i >= tabs.size()) return;
        Tab old = curTab();
        if (old != null && old.w != null && i != cur) old.w.onPause();
        cur = i;
        show();
        saveTabs();
    }

    Tab newTab(String url, boolean focus) {
        if (tabs.size() >= MAX_TABS) {
            flash("탭은 " + MAX_TABS + "개까지예요 — 안 쓰는 탭을 닫아 주세요", 2600);
            return null;
        }
        Tab t = new Tab();
        if (url != null) t.url = url;
        tabs.add(cur + 1, t);
        if (focus) switchTo(cur + 1); else updateTabCount();
        saveTabs();
        return t;
    }

    void closeTab(int i) {
        if (i < 0 || i >= tabs.size()) return;
        Tab t = tabs.remove(i);
        if (t.w != null) { content.removeView(t.w); t.w.destroy(); t.w = null; }
        if (tabs.isEmpty()) tabs.add(new Tab());
        if (cur >= tabs.size()) cur = tabs.size() - 1;
        else if (i < cur) cur--;
        show();
        saveTabs();
    }

    void updateTabCount() { bTabs.setText(String.valueOf(tabs.size())); }

    void syncBar() {
        Tab t = curTab();
        WebView w = curWeb();
        if (!addr.hasFocus()) {
            String u = w != null && w.getUrl() != null ? w.getUrl() : (t != null ? t.url : "");
            addr.setText(u);
        }
        bBack.setAlpha(w != null && w.canGoBack() ? 1f : 0.35f);
    }

    void go(String q) {
        String u = toUrl(q);
        if (u == null) return;
        hideKeyboard();
        addr.clearFocus();
        if (!isWeb(u)) { host.openOutside(Uri.parse(u)); return; }
        WebView w = curWeb();
        if (w == null) { show(); w = curWeb(); }
        if (w != null) w.loadUrl(u);
    }

    static String toUrl(String q) {
        if (q == null) return null;
        q = q.trim();
        if (q.isEmpty()) return null;
        if (q.matches("(?i)^[a-z][a-z0-9+.-]*://.*")) return q;
        if (!q.contains(" ") && (q.matches("(?i)^localhost(:\\d+)?(/.*)?$") || q.matches("^\\d{1,3}(\\.\\d{1,3}){3}(:\\d+)?(/.*)?$")))
            return "http://" + q;
        if (!q.contains(" ") && q.matches("(?i)^[^/\\s]+\\.[a-z]{2,}(:\\d+)?(/.*)?$")) return "https://" + q;
        try { return "https://www.google.com/search?q=" + URLEncoder.encode(q, "UTF-8"); } catch (Exception e) { return null; }
    }

    void hideKeyboard() {
        try { ((InputMethodManager) act.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(addr.getWindowToken(), 0); } catch (Exception ignored) { }
    }

    /** 뒤로가기: 주소창 → 페이지 뒤로 → '크게'면 반반으로. 처리했으면 true. */
    boolean handleBack() {
        if (addr.hasFocus()) { addr.clearFocus(); hideKeyboard(); return true; }
        WebView w = curWeb();
        if (w != null && w.canGoBack()) { w.goBack(); return true; }
        Tab t = curTab();
        if (t != null && t.opener != null && tabs.contains(t.opener)) {
            Tab op = t.opener;
            closeTab(cur);
            switchTo(tabs.indexOf(op));
            return true;
        }
        if (host.browserMode() == 2) { host.setBrowserMode(1); return true; }
        return false;
    }

    void onPause() { saveTabs(); for (Tab t : tabs) if (t.w != null) t.w.onPause(); }
    void onResume() { WebView w = curWeb(); if (w != null && host.browserMode() != 0) w.onResume(); }
    void hidden() { for (Tab t : tabs) if (t.w != null) t.w.onPause(); saveTabs(); }

    void destroy() { for (Tab t : tabs) if (t.w != null) { t.w.destroy(); t.w = null; } }

    // ── WebView 하나(탭 하나) ──────────────────────────────────
    WebView makeWeb(final Tab t) {
        final WebView w = new WebView(act);
        w.setBackgroundColor(Color.WHITE);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(true);              // target=_blank → 새 탭(onCreateWindow)
        s.setJavaScriptCanOpenWindowsAutomatically(false);   // 팝업은 사람이 눌렀을 때만
        applyUa(w);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, true);
        //  ⚠ PLNative 를 달지 않는다(클래스 주석)

        w.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String sc = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
                if (sc.equals("http") || sc.equals("https")) return false;
                if (sc.equals("about") || sc.equals("data") || sc.equals("blob") || sc.equals("javascript")) return false;
                //  intent: · market: · tel: … — 사람이 누른 것만 밖으로(페이지가 몰래 앱을 열지 못하게)
                if (r.hasGesture()) host.openOutside(u);
                return true;
            }
            @Override public void onPageStarted(WebView v, String url, Bitmap fav) {
                if (v == curWeb()) { prog.setVisibility(View.VISIBLE); bReload.setText("✕"); syncBar(); }
                injectFlags(v);
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (v == curWeb()) { prog.setVisibility(View.INVISIBLE); bReload.setText("↻"); syncBar(); }
                injectFlags(v);
                if (isWeb(url)) { t.url = url; addHistory(url, v.getTitle()); saveTabs(); }
            }
            @Override public void doUpdateVisitedHistory(WebView v, String url, boolean reload) {
                if (isWeb(url)) t.url = url;
                if (v == curWeb()) syncBar();
            }
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
                //  ⚠ 처리 안 하면 앱이 통째로 죽는다. 그 탭만 버리고, 보고 있던 탭이면 다시 연다.
                ViewGroup p = (ViewGroup) v.getParent();
                if (p != null) p.removeView(v);
                v.destroy();
                if (t.w == v) t.w = null;
                if (t == curTab() && host.browserMode() != 0) ui.post(Browser.this::show);
                return true;
            }
        });

        w.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView v, int p) { if (v == curWeb()) prog.setProgress(p); }
            @Override public void onReceivedTitle(WebView v, String title) { t.title = title == null ? "" : title; }
            @Override public boolean onCreateWindow(WebView v, boolean dialog, boolean gesture, android.os.Message msg) {
                if (!gesture) return false;   // 사람이 안 누른 팝업은 막는다
                Tab nt = newTab(null, false);
                if (nt == null) return false;
                nt.url = "about:blank";
                nt.opener = t;
                nt.w = makeWeb(nt);           // 먼저 만들어 둬야 show() 가 HOME 을 열지 않는다
                ((WebView.WebViewTransport) msg.obj).setWebView(nt.w);
                msg.sendToTarget();
                switchTo(tabs.indexOf(nt));
                return true;
            }
            @Override public void onCloseWindow(WebView v) {
                for (int i = 0; i < tabs.size(); i++) if (tabs.get(i).w == v) { closeTab(i); break; }
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                host.showFileChooser(cb, p);
                return true;
            }
            View custom; CustomViewCallback customCb;
            @Override public void onShowCustomView(View view, CustomViewCallback cb) {   // 동영상 전체 화면
                if (custom != null) { cb.onCustomViewHidden(); return; }
                custom = view; customCb = cb;
                view.setBackgroundColor(Color.BLACK);
                host.overlay().addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            }
            @Override public void onHideCustomView() {
                if (custom == null) return;
                host.overlay().removeView(custom);
                custom = null;
                if (customCb != null) customCb.onCustomViewHidden();
                customCb = null;
            }
        });

        w.setDownloadListener((url, ua, cd, mime, len) -> {
            //  그림을 내려받으려 하면 → 그 그림을 넣는다(사이트의 '원본 받기' 단추가 이걸로 온다)
            if (mime != null && mime.startsWith("image/") && isWeb(url)) {
                ArrayList<String> c = new ArrayList<>(); c.add(url);
                fetchAndDeliver(c, w.getUrl(), w.getSettings().getUserAgentString(), null, nameOf(url));
                return;
            }
            host.downloadOther(url, ua, cd, mime);
        });

        final GestureDetector gd = new GestureDetector(act, new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onSingleTapUp(MotionEvent e) {
                if (pick) { w.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); findAndPick(t, w, Math.round(e.getX()), Math.round(e.getY()), false, null); }
                return false;
            }
        });
        w.setOnTouchListener((v, e) -> {
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) { t.lastX = Math.round(e.getX()); t.lastY = Math.round(e.getY()); }
            gd.onTouchEvent(e);
            return false;   // 스크롤·확대는 WebView 가 그대로 한다
        });
        w.setOnLongClickListener(v -> {
            WebView.HitTestResult h = w.getHitTestResult();
            int ty = h == null ? 0 : h.getType();
            boolean img = ty == WebView.HitTestResult.IMAGE_TYPE || ty == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE;
            //  그림이 확실하면 여기서 먹는다(메뉴·글자 고르기 안 뜸). 아니면 원래대로 두되, 그림이 덮여 있는 경우
            //  (X 처럼 그림 위에 투명한 칸이 덮인 사이트)를 위해 찾아는 본다 — 못 찾으면 아무 말도 안 한다.
            findAndPick(t, w, t.lastX, t.lastY, !img, img ? h.getExtra() : null);
            return img;
        });
        return w;
    }

    void applyUa(WebView w) {
        WebSettings s = w.getSettings();
        if (desktop) {
            String ua = WebSettings.getDefaultUserAgent(act);
            String ver = "120.0.0.0";
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("Chrome/([\\d.]+)").matcher(ua);
            if (m.find()) ver = m.group(1);
            s.setUserAgentString("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + ver + " Safari/537.36");
        } else {
            s.setUserAgentString(null);
        }
    }

    /** 집기 모드면 링크 열기(click)를 막는 표식 — 페이지가 바뀔 때마다 다시 건다. */
    void injectFlags(WebView w) {
        w.evaluateJavascript("(function(){try{if(!window.__plH){window.__plH=1;var f=function(e){if(window.__plPick){e.preventDefault();e.stopImmediatePropagation();}};"
                + "window.addEventListener('click',f,true);window.addEventListener('auxclick',f,true);}window.__plPick=" + (pick ? "true" : "false") + ";}catch(e){}})()", null);
    }

    // ── 그림 찾기 ───────────────────────────────────────────────
    //  (화면 px x, y, WebView 폭 px) → JSON 문자열 {c:[후보 주소…], r:[l,t,w,h 화면 px], ref, alt} 또는 ""
    //  ⚠ 확대(핀치)·데스크톱 사이트(배율)에 상관없이 맞도록 '보이는 폭 ÷ WebView 폭' 으로 환산한다.
    static final String FIND_JS =
        "(function(px,py,vw){try{" +
        "var vv=window.visualViewport,k=(vv?vv.width:innerWidth)/vw,ox=vv?vv.offsetLeft:0,oy=vv?vv.offsetTop:0;" +
        "var x=ox+px*k,y=oy+py*k;" +
        "var IMG=/\\.(jpe?g|png|webp|gif|avif|bmp|jfif)(\\?|#|$)/i;" +
        "function abs(u){try{return new URL(u,document.baseURI).href}catch(e){return ''}}" +
        "function big(im){var ss=im.getAttribute('srcset')||'';var p=im.parentElement;" +
        " if(p&&p.tagName==='PICTURE'){var so=p.querySelectorAll('source');for(var i=0;i<so.length;i++){var v=so[i].getAttribute('srcset');if(v)ss+=(ss?', ':'')+v;}}" +
        " var best='',bs=0;ss.split(/,\\s+/).forEach(function(part){var m=part.trim().split(/\\s+/);if(!m[0])return;var d=m[1]||'1x',n=parseFloat(d)||1;var sc=/w$/i.test(d)?n:n*1000;if(sc>bs){bs=sc;best=abs(m[0]);}});return best;}" +
        "function bgOf(el){try{var b=getComputedStyle(el).backgroundImage;var m=b&&b.match(/url\\([\"']?([^\"')]+)[\"']?\\)/);return m?abs(m[1]):''}catch(e){return ''}}" +
        "function up(u){try{var q=new URL(u);if(/(^|\\.)twimg\\.com$/.test(q.hostname)&&q.searchParams.has('name')){q.searchParams.set('name','orig');return q.href;}}catch(e){}return '';}" +
        "var els=document.elementsFromPoint(x,y).slice(0,20),pickEl=null,c=[];" +
        "for(var i=0;i<els.length&&!pickEl;i++){var e=els[i];if(e.tagName==='IMG'){var r=e.getBoundingClientRect();if(r.width>=24&&r.height>=24)pickEl=e;}}" +
        "if(pickEl){var a=pickEl.closest('a');if(a&&IMG.test(a.href))c.push(a.href);var b=big(pickEl);if(b)c.push(b);if(pickEl.currentSrc)c.push(pickEl.currentSrc);if(pickEl.src)c.push(pickEl.src);}" +
        "else{for(var j=0;j<els.length&&!pickEl;j++){var e2=els[j];if(e2===document.body||e2===document.documentElement)continue;" +
        "  if(e2.tagName==='VIDEO'&&e2.poster){pickEl=e2;c.push(abs(e2.poster));break;}" +
        "  var g=bgOf(e2);if(g){var r2=e2.getBoundingClientRect();if(r2.width>=48&&r2.height>=48){pickEl=e2;c.push(g);}}}}" +
        "if(!pickEl)return '';" +
        "var o=[];c.forEach(function(u){var v=up(u);if(v)o.push(v);o.push(u);});" +
        "var seen={},out=[];o.forEach(function(u){if(u&&!seen[u]&&/^(https?:|data:image\\/|blob:)/i.test(u)){seen[u]=1;out.push(u);}});" +
        "if(!out.length)return '';" +
        "var rc=pickEl.getBoundingClientRect();" +
        "try{var s=getSelection();if(s)s.removeAllRanges();}catch(e){}" +
        "return JSON.stringify({c:out,r:[(rc.left-ox)/k,(rc.top-oy)/k,rc.width/k,rc.height/k],ref:location.href,alt:(pickEl.alt||pickEl.title||'').slice(0,40)});" +
        "}catch(err){return ''}})";

    /**
     * @param soft  그림인지 확실하지 않은 꾹 누르기 — 못 찾으면 아무 말도 안 한다(글자 고르기를 방해하지 않게).
     * @param hint  WebView 가 알려 준 그림 주소(있으면) — 페이지 쪽에서 못 찾았을 때 쓴다.
     */
    void findAndPick(final Tab t, final WebView w, int x, int y, final boolean soft, final String hint) {
        String js = FIND_JS + "(" + x + "," + y + "," + Math.max(1, w.getWidth()) + ")";
        w.evaluateJavascript(js, res -> {
            String json = unquote(res);
            ArrayList<String> c = new ArrayList<>();
            Rect r = null;
            String ref = w.getUrl(), alt = "";
            if (json != null && !json.isEmpty()) {
                try {
                    JSONObject o = new JSONObject(json);
                    JSONArray ca = o.getJSONArray("c");
                    for (int i = 0; i < ca.length(); i++) c.add(ca.getString(i));
                    JSONArray ra = o.optJSONArray("r");
                    if (ra != null && ra.length() == 4) {
                        int l = (int) ra.getDouble(0), tp = (int) ra.getDouble(1), ww = (int) ra.getDouble(2), hh = (int) ra.getDouble(3);
                        r = new Rect(l, tp, l + ww, tp + hh);
                    }
                    ref = o.optString("ref", ref);
                    alt = o.optString("alt", "");
                } catch (Exception ignored) { }
            }
            if (c.isEmpty() && hint != null && !hint.isEmpty()) c.add(hint);
            if (c.isEmpty()) {
                if (!soft) flash("여기엔 넣을 그림이 없어요", 1600);
                return;
            }
            String key = c.get(0);
            long now = System.currentTimeMillis();
            if (key.equals(lastPickKey) && now - lastPickAt < 1500) return;   // 같은 그림 두 번(꾹+탭 겹침)
            lastPickKey = key; lastPickAt = now;
            if (soft) w.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
            final String name = !alt.isEmpty() ? alt : nameOf(key);
            //  화면에 보이는 그대로도 미리 떠 둔다 — 원본을 못 받을 때 쓰고, 날아가는 미리보기로도 쓴다
            final Rect fr = r; final String fref = ref;
            capture(w, fr, bmp -> {
                if (bmp != null) fly(w, fr, bmp);
                fetchAndDeliver(c, fref, w.getSettings().getUserAgentString(), bmp, name);
            });
        });
    }

    static String unquote(String res) {
        if (res == null || res.equals("null") || res.length() < 2) return "";
        try { return new JSONArray("[" + res + "]").getString(0); } catch (Exception e) { return ""; }
    }

    static String nameOf(String u) {
        try {
            if (u.startsWith("data:") || u.startsWith("blob:")) return "web";
            String seg = Uri.parse(u).getLastPathSegment();
            if (seg == null || seg.isEmpty()) return Uri.parse(u).getHost();
            seg = URLDecoder.decode(seg, "UTF-8").replaceAll("\\.[A-Za-z0-9]{2,5}$", "");
            return seg.isEmpty() ? "web" : seg;
        } catch (Exception e) { return "web"; }
    }

    interface BmpCb { void done(Bitmap b); }

    /** 그 그림이 화면에 그려진 자리를 그대로 떠 온다(PixelCopy — 이 앱 창 안이라 권한이 필요 없다). */
    void capture(WebView w, Rect r, BmpCb cb) {
        try {
            if (r == null) { cb.done(null); return; }
            Rect vr = new Rect(r);
            if (!vr.intersect(0, 0, w.getWidth(), w.getHeight()) || vr.width() < 8 || vr.height() < 8) { cb.done(null); return; }
            int[] loc = new int[2];
            w.getLocationInWindow(loc);
            Rect wr = new Rect(vr.left + loc[0], vr.top + loc[1], vr.right + loc[0], vr.bottom + loc[1]);
            Bitmap b = Bitmap.createBitmap(wr.width(), wr.height(), Bitmap.Config.ARGB_8888);
            PixelCopy.request(act.getWindow(), wr, b, res -> cb.done(res == PixelCopy.SUCCESS ? b : null), ui);
        } catch (Exception e) { cb.done(null); }
    }

    /** 집은 그림이 랩 쪽으로 날아가는 짧은 표시 — '들어갔다'가 눈에 보이게. */
    void fly(WebView w, Rect r, Bitmap b) {
        try {
            ViewGroup ov = host.overlay();
            final ImageView iv = new ImageView(act);
            iv.setImageBitmap(b);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            int[] wl = new int[2], ol = new int[2];
            w.getLocationOnScreen(wl);
            ov.getLocationOnScreen(ol);
            Rect vr = new Rect(r);
            vr.intersect(0, 0, w.getWidth(), w.getHeight());
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(vr.width(), vr.height());
            lp.leftMargin = wl[0] - ol[0] + vr.left;
            lp.topMargin = wl[1] - ol[1] + vr.top;
            ov.addView(iv, lp);
            float tx, ty;
            //  랩이 있는 쪽으로(크게 보기면 아래로)
            View lab = act.labView();
            int[] ll = new int[2]; lab.getLocationOnScreen(ll);
            float cx = ll[0] - ol[0] + lab.getWidth() / 2f, cy = ll[1] - ol[1] + lab.getHeight() / 2f;
            if (host.browserMode() == 2) { cx = lp.leftMargin + vr.width() / 2f; cy = ov.getHeight(); }
            tx = cx - (lp.leftMargin + vr.width() / 2f);
            ty = cy - (lp.topMargin + vr.height() / 2f);
            iv.animate().translationX(tx).translationY(ty).scaleX(0.25f).scaleY(0.25f).alpha(0.2f)
                    .setDuration(420).setListener(new AnimatorListenerAdapter() {
                        @Override public void onAnimationEnd(Animator a) { ov.removeView(iv); }
                    }).start();
        } catch (Exception ignored) { }
    }

    // ── 받아서 넘기기 ─────────────────────────────────────────────
    void fetchAndDeliver(final ArrayList<String> cands, final String ref, final String ua, final Bitmap screen, final String name) {
        flash("🖼 가져오는 중…", 0);
        new Thread(() -> {
            byte[] data = null; String mime = null, why = "";
            LinkedHashSet<String> uniq = new LinkedHashSet<>(cands);
            for (String u : uniq) {
                try {
                    String[] m = new String[1];
                    byte[] d = fetch(u, ref, ua, m);
                    if (d != null) { data = d; mime = m[0]; break; }
                } catch (Exception e) { why = e.getClass().getSimpleName() + (e.getMessage() != null ? " " + e.getMessage() : ""); }
            }
            boolean fromScreen = false;
            if (data == null && screen != null) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                screen.compress(Bitmap.CompressFormat.PNG, 100, bo);
                data = bo.toByteArray(); mime = "image/png"; fromScreen = true;
            }
            final byte[] fd = data; final String fm = mime; final boolean fs = fromScreen; final String fw = why;
            ui.post(() -> {
                if (fd == null) {
                    flash("❌ 그림을 못 가져왔어요" + (fw.isEmpty() ? "" : " — " + fw), 3500);
                    return;
                }
                host.deliverPicked(name, fm, fd, fs);
                String where = host.browserMode() == 2 ? " (랩은 「반반」에서 보여요)" : "";
                flash(fs ? "✅ 넣었어요 — 원본을 못 받아 화면 크기로 넣었어요" + where : "✅ 넣었어요 — 생성 시작" + where, fs ? 3600 : 2200);
            });
        }, "pl-pick").start();
    }

    /** 이미지 하나 받기. 그림이 아니면(페이지·오류) null. */
    static byte[] fetch(String u, String ref, String ua, String[] mimeOut) throws Exception {
        if (u.startsWith("data:")) {
            int comma = u.indexOf(',');
            if (comma < 0) return null;
            String head = u.substring(5, comma);
            byte[] d = head.endsWith(";base64") ? Base64.decode(u.substring(comma + 1), Base64.DEFAULT)
                                                : URLDecoder.decode(u.substring(comma + 1), "UTF-8").getBytes("UTF-8");
            String mt = head.split(";")[0];
            String sn = sniff(d);
            if (sn == null && !mt.startsWith("image/")) return null;
            mimeOut[0] = sn != null ? sn : mt;
            return d;
        }
        if (!isWeb(u)) return null;   // blob: 은 앱이 못 받는다 → 화면 그대로로
        String url = u;
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(12000);
            c.setReadTimeout(20000);
            if (ua != null) c.setRequestProperty("User-Agent", ua);
            if (ref != null && isWeb(ref)) c.setRequestProperty("Referer", ref);
            c.setRequestProperty("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8");
            String ck = CookieManager.getInstance().getCookie(url);
            if (ck != null) c.setRequestProperty("Cookie", ck);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) return null;
                url = new URL(new URL(url), loc).toString();
                continue;
            }
            if (code != 200) { c.disconnect(); throw new Exception("HTTP " + code); }
            String ct = c.getContentType() == null ? "" : c.getContentType().toLowerCase();
            if (ct.startsWith("text/") || ct.contains("json")) { c.disconnect(); return null; }
            try (InputStream is = c.getInputStream()) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[64 * 1024];
                long total = 0; int n;
                while ((n = is.read(buf)) > 0) {
                    total += n;
                    if (total > MainActivity.MAX_BYTES) throw new Exception("40MB 초과");
                    bo.write(buf, 0, n);
                }
                byte[] d = bo.toByteArray();
                String sn = sniff(d);
                if (sn == null && !ct.startsWith("image/")) return null;
                if (d.length == 0) return null;
                mimeOut[0] = sn != null ? sn : ct.split(";")[0].trim();
                return d;
            } finally { c.disconnect(); }
        }
        return null;
    }

    /** 앞머리로 실제 형식 — 사이트가 종류를 틀리게 주는 일이 흔하다(웹앱 _animaSniffImage 와 같은 생각). */
    static String sniff(byte[] d) {
        if (d == null || d.length < 12) return null;
        if ((d[0] & 0xff) == 0xFF && (d[1] & 0xff) == 0xD8) return "image/jpeg";
        if ((d[0] & 0xff) == 0x89 && d[1] == 'P' && d[2] == 'N' && d[3] == 'G') return "image/png";
        if (d[0] == 'G' && d[1] == 'I' && d[2] == 'F') return "image/gif";
        if (d[0] == 'R' && d[1] == 'I' && d[2] == 'F' && d[3] == 'F' && d[8] == 'W' && d[9] == 'E' && d[10] == 'B' && d[11] == 'P') return "image/webp";
        if (d[4] == 'f' && d[5] == 't' && d[6] == 'y' && d[7] == 'p') {
            String brand = new String(d, 8, 4);
            if (brand.startsWith("avi")) return "image/avif";
            if (brand.startsWith("hei") || brand.startsWith("mif") || brand.startsWith("hev")) return "image/heic";
        }
        if (d[0] == 'B' && d[1] == 'M') return "image/bmp";
        return null;
    }

    // ── 알림 띠 ─────────────────────────────────────────────────
    final Runnable hideBanner = () -> { if (Browser.this.banner != null) Browser.this.banner.setVisibility(View.GONE); };
    void flash(String msg, int ms) {
        banner.setText(msg);
        banner.setVisibility(View.VISIBLE);
        banner.bringToFront();
        ui.removeCallbacks(hideBanner);
        if (ms > 0) ui.postDelayed(hideBanner, ms);
    }

    // ── 메뉴 · 탭 · 즐겨찾기 · 기록 ─────────────────────────────────
    void showMenu() {
        PopupMenu pm = new PopupMenu(act, bMenu);
        Menu m = pm.getMenu();
        WebView w = curWeb();
        String u = w != null ? w.getUrl() : null;
        boolean marked = u != null && bookmarkIndex(u) >= 0;
        if (bReload.getVisibility() != View.VISIBLE) m.add(0, 12, 0, "↻ 새로고침");
        if (bMode.getVisibility() != View.VISIBLE) m.add(0, 13, 0, host.browserMode() == 2 ? "반반으로 보기" : "브라우저 크게");
        if (bBack.getVisibility() != View.VISIBLE && w != null && w.canGoBack()) m.add(0, 14, 0, "← 뒤로");
        m.add(0, 1, 0, "새 탭");
        if (w != null && w.canGoForward()) m.add(0, 2, 0, "앞으로 →");
        m.add(0, 3, 0, marked ? "★ 즐겨찾기에서 빼기" : "☆ 즐겨찾기에 추가");
        m.add(0, 4, 0, "즐겨찾기");
        m.add(0, 5, 0, "방문 기록");
        m.add(0, 6, 0, "🎯 집기 모드 (톡 탭 = 넣기)").setCheckable(true).setChecked(pick);
        m.add(0, 7, 0, "데스크톱 사이트").setCheckable(true).setChecked(desktop);
        m.add(0, 8, 0, "화면 나누기 방식 (좌우·위아래·자리)…");
        m.add(0, 10, 0, "방문 기록 지우기");
        m.add(0, 11, 0, "둘러보기 닫기");
        pm.setOnMenuItemClickListener(it -> {
            switch (it.getItemId()) {
                case 1: newTab(null, true); break;
                case 2: if (curWeb() != null) curWeb().goForward(); break;
                case 3: toggleBookmark(); break;
                case 4: showBookmarks(); break;
                case 5: showHistory(); break;
                case 6: setPick(!pick); break;
                case 7: setDesktop(!desktop); break;
                case 8: host.showSplitMenu(bMenu); break;
                case 10: clearHistory(); break;
                case 11: host.setBrowserMode(0); break;
                case 12: if (curWeb() != null) curWeb().reload(); break;
                case 13: host.setBrowserMode(host.browserMode() == 2 ? 1 : 2); break;
                case 14: if (curWeb() != null) curWeb().goBack(); break;
            }
            return true;
        });
        pm.show();
    }

    void setDesktop(boolean on) {
        desktop = on;
        sp.edit().putBoolean("desktop", on).apply();
        for (Tab t : tabs) if (t.w != null) applyUa(t.w);
        WebView w = curWeb();
        if (w != null) w.reload();
    }

    AlertDialog.Builder dlg(String title) {
        return new AlertDialog.Builder(act, light ? android.R.style.Theme_DeviceDefault_Light_Dialog_Alert : android.R.style.Theme_DeviceDefault_Dialog_Alert).setTitle(title);
    }

    void showTabs() {
        String[] items = new String[tabs.size()];
        for (int i = 0; i < tabs.size(); i++) {
            Tab t = tabs.get(i);
            String title = t.w != null && t.w.getTitle() != null && !t.w.getTitle().isEmpty() ? t.w.getTitle() : (t.title.isEmpty() ? hostOf(t.url) : t.title);
            items[i] = (i == cur ? "● " : "    ") + title;
        }
        AlertDialog d = dlg("탭 " + tabs.size() + "개  (꾹 누르면 닫기)")
                .setItems(items, (di, i) -> switchTo(i))
                .setPositiveButton("새 탭", (di, i) -> newTab(null, true))
                .setNegativeButton("이 탭 닫기", (di, i) -> closeTab(cur))
                .setNeutralButton("취소", null)
                .create();
        d.show();
        d.getListView().setOnItemLongClickListener((p, v, i, id) -> { d.dismiss(); closeTab(i); return true; });
    }

    static String hostOf(String u) { try { String h = Uri.parse(u).getHost(); return h == null ? u : h; } catch (Exception e) { return u; } }

    JSONArray loadArr(String k) { try { return new JSONArray(sp.getString(k, "[]")); } catch (Exception e) { return new JSONArray(); } }

    int bookmarkIndex(String u) {
        JSONArray a = loadArr("marks");
        for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && u.equals(o.optString("u"))) return i; }
        return -1;
    }

    void toggleBookmark() {
        WebView w = curWeb();
        if (w == null || w.getUrl() == null || !isWeb(w.getUrl())) return;
        String u = w.getUrl();
        JSONArray a = loadArr("marks");
        int i = bookmarkIndex(u);
        try {
            if (i >= 0) { a.remove(i); flash("즐겨찾기에서 뺐어요", 1600); }
            else {
                JSONObject o = new JSONObject(); o.put("u", u); o.put("t", w.getTitle() == null ? hostOf(u) : w.getTitle());
                JSONArray n = new JSONArray(); n.put(o); for (int k = 0; k < a.length() && k < 199; k++) n.put(a.get(k)); a = n;
                flash("☆ 즐겨찾기에 넣었어요", 1600);
            }
        } catch (Exception ignored) { }
        sp.edit().putString("marks", a.toString()).apply();
    }

    void showBookmarks() {
        final JSONArray a = loadArr("marks");
        if (a.length() == 0) { flash("즐겨찾기가 비어 있어요 — 메뉴 → ☆ 즐겨찾기에 추가", 2600); return; }
        String[] items = new String[a.length()];
        for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); items[i] = o == null ? "?" : o.optString("t", o.optString("u")); }
        AlertDialog d = dlg("즐겨찾기  (꾹 누르면 빼기)")
                .setItems(items, (di, i) -> { JSONObject o = a.optJSONObject(i); if (o != null) go(o.optString("u")); })
                .setNegativeButton("닫기", null).create();
        d.show();
        d.getListView().setOnItemLongClickListener((p, v, i, id) -> {
            a.remove(i); sp.edit().putString("marks", a.toString()).apply(); d.dismiss(); flash("즐겨찾기에서 뺐어요", 1600); return true;
        });
    }

    void addHistory(String u, String title) {
        try {
            JSONArray a = loadArr("hist");
            JSONObject top = a.optJSONObject(0);
            if (top != null && u.equals(top.optString("u"))) return;
            JSONArray n = new JSONArray();
            JSONObject o = new JSONObject(); o.put("u", u); o.put("t", title == null || title.isEmpty() ? hostOf(u) : title); o.put("at", System.currentTimeMillis());
            n.put(o);
            for (int i = 0; i < a.length() && n.length() < 300; i++) { JSONObject x = a.optJSONObject(i); if (x != null && !u.equals(x.optString("u"))) n.put(x); }
            sp.edit().putString("hist", n.toString()).apply();
        } catch (Exception ignored) { }
    }

    void showHistory() {
        final JSONArray a = loadArr("hist");
        if (a.length() == 0) { flash("방문 기록이 없어요", 1600); return; }
        int n = Math.min(a.length(), 120);
        String[] items = new String[n];
        for (int i = 0; i < n; i++) { JSONObject o = a.optJSONObject(i); items[i] = o == null ? "?" : o.optString("t") + "\n" + hostOf(o.optString("u")); }
        dlg("방문 기록").setItems(items, (di, i) -> { JSONObject o = a.optJSONObject(i); if (o != null) go(o.optString("u")); })
                .setNegativeButton("닫기", null).show();
    }

    void clearHistory() {
        dlg("방문 기록 지우기").setMessage("둘러보기의 방문 기록을 모두 지울까요? 즐겨찾기·로그인은 그대로예요.")
                .setPositiveButton("지우기", (di, i) -> {
                    sp.edit().remove("hist").apply();
                    for (Tab t : tabs) if (t.w != null) t.w.clearHistory();
                    flash("방문 기록을 지웠어요", 1600);
                })
                .setNegativeButton("취소", null).show();
    }
}
