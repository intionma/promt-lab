package io.github.intionma.promptlab;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.text.Editable;
import android.text.InputType;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.text.style.ForegroundColorSpan;
import android.util.Base64;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.PixelCopy;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.animation.LinearInterpolator;
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
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupWindow;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;

/**
 * 🌐 둘러보기 — 앱 안의 브라우저. 앱 1.4 에서 **크롬(안드로이드)과 같은 모양·같은 제스처**로 다시 만들었다(사용자 요청).
 *
 * 크롬과 같게 맞춘 것
 *  · 툴바: [주소창][🎯(크롬의 '맞춤 단추' 자리)][탭 수][⋮] — 넓은 칸(600dp~)에선 크롬 태블릿처럼 [←][→][↻][주소창][🎯][⋮] + 위에 탭 줄.
 *  · 주소창: 안 누르면 도메인(경로는 흐리게) + 자물쇠 대신 사이트 설정 아이콘, 누르면 전체 주소 + 추천(기록·북마크) + ✕.
 *    꾹 누르면 「주소 표시줄을 아래로」·「링크 복사」.
 *  · ⋮ 메뉴: 맨 위 아이콘 줄(→ ☆ ⓘ ↻ ⤢) + 새 탭·기록·북마크·최근에 닫은 탭·공유·페이지에서 찾기·데스크톱 사이트….
 *  · 제스처: 주소창을 **옆으로 밀면 옆 탭**(손가락 따라 옆 탭이 밀려 들어온다) · **아래로 밀면 탭 목록**(주소창이 아래면 위로) ·
 *    맨 위에서 **당기면 새로고침** · 내리면 툴바가 숨고 올리면 나온다 · 탭 목록 카드를 **옆으로 밀면 닫기**(+ 실행취소) ·
 *    링크를 꾹 누르면 크롬 링크 메뉴 · 탭 단추를 꾹 누르면 탭 닫기/새 탭 · 시스템 뒤로 = 페이지 뒤로 → 새 창 탭은 닫고 연 탭으로.
 *  · 새 탭 = 크롬 새 탭 화면(검색 상자 + 자주 간 사이트). 검색 상자를 누르면 주소창으로 간다(크롬처럼).
 *
 * 그림 넣기(이 앱만의 것 — 크롬과 다른 단 하나)
 *  · **그림을 꾹 누르면** 메뉴 없이 바로 Anima 편집 원본이 되고 생성까지 간다. 🎯 를 켜면 톡 탭만 해도.
 *  · 화면 미리보기 말고 **제일 큰 원본**을 찾는다. 못 받으면 화면에 보이는 그대로 넣고 그 사실을 말한다.
 *
 * ⚠ 이 WebView 에는 PLNative 를 **절대 달지 않는다** — 아무 사이트나 여는 곳이다. 그림 찾기는 evaluateJavascript 의
 *   돌려받는 값으로만 하고, 받는 것도 앱(자바)이 직접 한다. 사이트가 앱에 무언가를 시킬 길이 없다.
 * ⚠ 구글 계정 로그인은 구글이 앱 안 브라우저를 막아 둬서 안 된다. 사용자 에이전트를 속여 뚫지 않는다(구글 정책 위반).
 */
final class Browser {

    static final String HOME = "https://www.google.com/";
    static final String NTP = "pl://newtab";                       // 저장용 표식 — 새 탭 화면
    static final String NTP_BASE = "https://newtab.promptlab.invalid/";  // 새 탭 화면 문서의 주소(인터넷에 가지 않는다)
    static final int MAX_TABS = 20;
    static final int MAX_LIVE = 4;                                  // 동시에 살려 두는 WebView 수 — 나머지는 상태만 저장(메모리)

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
        String url = NTP, title = "";
        WebView w;
        Tab opener;      // 새 창(target=_blank)으로 열렸으면 연 탭 — 뒤로 갈 데가 없으면 닫고 거기로(크롬처럼)
        int lastX, lastY;
        Bitmap thumb;    // 탭 목록 카드·옆 탭 미리보기
        Bundle state;    // WebView 를 치울 때 뒤로가기 기록을 남겨 둔다
        long usedAt;
    }

    final MainActivity act;
    final Host host;
    final float dp;
    final int slop;
    final SharedPreferences sp;
    final Handler ui = new Handler(Looper.getMainLooper());

    // ── 색 (크롬 기본 테마) ──
    int cBar, cOmni, cFg, cDim, cAccent, cCard, cMenu, cDivider, cStrip, cPage;
    boolean light;

    // ── 화면 ──
    final FrameLayout root;
    final LinearLayout column, chrome, findBar, stripRow, strip;
    final HorizontalScrollView stripScroll;
    final SwipeBar bar;
    final FrameLayout omni, content;
    final TextView display, findCount, snack;
    final EditText addr, findEdit;
    final ImageView siteIcon, omniClear, bBack, bFwd, bReload, bPick, bMenu, peek, ptr, stripNew, stripGrid;
    final TabsButton bTabs;
    final ProgressBar prog;
    final ScrollView suggestScroll;
    final LinearLayout suggest;
    final LinearLayout switcher, swGrid;
    final TextView swTitle;
    final ScrollView swScroll;

    final ArrayList<Tab> tabs = new ArrayList<>();
    final ArrayDeque<String[]> closed = new ArrayDeque<>();   // 최근에 닫은 탭 {url,title,index}
    int cur = 0, mode = 0;
    boolean pick, desktop, barBottom, tablet, narrow, chromeShown = true, switcherOpen, findOpen;
    String lastPickKey = "";
    long lastPickAt = 0;
    ValueAnimator chromeAnim;
    PopupWindow openPopup;

    Browser(MainActivity a, Host h) {
        act = a; host = h;
        dp = a.getResources().getDisplayMetrics().density;
        slop = ViewConfiguration.get(a).getScaledTouchSlop();
        sp = a.getSharedPreferences("browser", Context.MODE_PRIVATE);
        pick = sp.getBoolean("pick", false);
        desktop = sp.getBoolean("desktop", false);
        barBottom = sp.getBoolean("barBottom", false);
        palette(false);

        root = new FrameLayout(a) {
            @Override protected void onSizeChanged(int w, int hh, int ow, int oh) {
                super.onSizeChanged(w, hh, ow, oh);
                if (w != ow) ui.post(Browser.this::relayoutMode);
            }
        };
        //  ⚠ '크게'일 땐 랩이 바로 뒤에 깔려 있다 — 빈 곳을 눌러도 뒤의 랩이 눌리지 않게 여기서 먹는다
        root.setClickable(true);

        column = new LinearLayout(a);
        column.setOrientation(LinearLayout.VERTICAL);
        root.addView(column, new FrameLayout.LayoutParams(-1, -1));

        // 태블릿 탭 줄
        stripRow = new LinearLayout(a);
        stripRow.setOrientation(LinearLayout.HORIZONTAL);
        stripRow.setGravity(Gravity.CENTER_VERTICAL);
        stripScroll = new HorizontalScrollView(a);
        stripScroll.setHorizontalScrollBarEnabled(false);
        strip = new LinearLayout(a);
        strip.setOrientation(LinearLayout.HORIZONTAL);
        strip.setPadding(px(6), px(4), 0, 0);
        stripScroll.addView(strip);
        stripRow.addView(stripScroll, new LinearLayout.LayoutParams(0, -1, 1f));
        stripNew = iconBtn(Ico.PLUS, "새 탭", 40);
        stripGrid = iconBtn(Ico.GRID, "탭 목록", 40);
        stripRow.addView(stripNew); stripRow.addView(stripGrid);

        // 툴바
        chrome = new LinearLayout(a);
        chrome.setOrientation(LinearLayout.VERTICAL);
        bar = new SwipeBar(a);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(px(8), 0, px(2), 0);
        bBack = iconBtn(Ico.BACK, "뒤로", 44);
        bFwd = iconBtn(Ico.FWD, "앞으로", 44);
        bReload = iconBtn(Ico.REFRESH, "새로고침", 44);
        omni = new FrameLayout(a);
        LinearLayout omniRow = new LinearLayout(a);
        omniRow.setOrientation(LinearLayout.HORIZONTAL);
        omniRow.setGravity(Gravity.CENTER_VERTICAL);
        omniRow.setPadding(px(12), 0, px(4), 0);
        siteIcon = new ImageView(a);
        omniRow.addView(siteIcon, new LinearLayout.LayoutParams(px(20), px(20)));
        display = new TextView(a);
        display.setSingleLine(true);
        display.setEllipsize(TextUtils.TruncateAt.END);
        display.setTextSize(16);
        display.setGravity(Gravity.CENTER_VERTICAL);
        display.setPadding(px(10), 0, px(6), 0);
        omniRow.addView(display, new LinearLayout.LayoutParams(0, -1, 1f));
        addr = new EditText(a);
        addr.setSingleLine(true);
        addr.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        addr.setImeOptions(EditorInfo.IME_ACTION_GO | EditorInfo.IME_FLAG_NO_EXTRACT_UI);
        addr.setTextSize(16);
        addr.setBackground(null);
        addr.setPadding(px(10), 0, px(6), 0);
        addr.setHint("검색어 또는 URL 입력");
        addr.setVisibility(View.GONE);
        omniRow.addView(addr, new LinearLayout.LayoutParams(0, -1, 1f));
        omniClear = iconBtn(Ico.CLOSE, "지우기", 36);
        omniClear.setVisibility(View.GONE);
        omniRow.addView(omniClear);
        omni.addView(omniRow, new FrameLayout.LayoutParams(-1, -1));
        LinearLayout.LayoutParams olp = new LinearLayout.LayoutParams(0, px(44), 1f);
        olp.setMargins(px(2), 0, px(4), 0);
        bPick = iconBtn(Ico.TARGET, "집기 모드 — 켜면 그림을 톡 탭만 해도 넣어요", 44);
        bTabs = new TabsButton(a);
        bTabs.setContentDescription("탭 목록");
        bMenu = iconBtn(Ico.MORE, "메뉴", 44);
        bar.addView(bBack); bar.addView(bFwd); bar.addView(bReload);
        bar.addView(omni, olp);
        bar.addView(bPick);
        bar.addView(bTabs, new LinearLayout.LayoutParams(px(44), px(44)));
        bar.addView(bMenu);
        prog = new ProgressBar(a, null, android.R.attr.progressBarStyleHorizontal);
        prog.setMax(100);
        prog.setVisibility(View.INVISIBLE);

        // 페이지에서 찾기 (크롬처럼 툴바 자리를 대신한다)
        findBar = new LinearLayout(a);
        findBar.setOrientation(LinearLayout.HORIZONTAL);
        findBar.setGravity(Gravity.CENTER_VERTICAL);
        findBar.setPadding(px(12), 0, px(2), 0);
        findEdit = new EditText(a);
        findEdit.setSingleLine(true);
        findEdit.setBackground(null);
        findEdit.setHint("페이지에서 찾기");
        findEdit.setTextSize(16);
        findEdit.setImeOptions(EditorInfo.IME_ACTION_SEARCH | EditorInfo.IME_FLAG_NO_EXTRACT_UI);
        findBar.addView(findEdit, new LinearLayout.LayoutParams(0, -1, 1f));
        findCount = new TextView(a);
        findCount.setTextSize(13);
        findCount.setPadding(px(6), 0, px(6), 0);
        findBar.addView(findCount);
        ImageView fUp = iconBtn(Ico.UP, "이전", 44), fDown = iconBtn(Ico.DOWN, "다음", 44), fClose = iconBtn(Ico.CLOSE, "찾기 닫기", 44);
        findBar.addView(fUp); findBar.addView(fDown); findBar.addView(fClose);
        findBar.setVisibility(View.GONE);

        content = new FrameLayout(a);
        peek = new ImageView(a);
        peek.setScaleType(ImageView.ScaleType.MATRIX);
        peek.setVisibility(View.GONE);
        content.addView(peek, new FrameLayout.LayoutParams(-1, -1));
        ptr = new ImageView(a);
        ptr.setElevation(px(6));
        ptr.setPadding(px(9), px(9), px(9), px(9));
        FrameLayout.LayoutParams plp = new FrameLayout.LayoutParams(px(42), px(42), Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        content.addView(ptr, plp);
        ptr.setVisibility(View.GONE);

        suggestScroll = new ScrollView(a);
        suggest = new LinearLayout(a);
        suggest.setOrientation(LinearLayout.VERTICAL);
        suggestScroll.addView(suggest);
        suggestScroll.setVisibility(View.GONE);
        content.addView(suggestScroll, new FrameLayout.LayoutParams(-1, -1));

        // 탭 목록(그리드)
        switcher = new LinearLayout(a);
        switcher.setOrientation(LinearLayout.VERTICAL);
        switcher.setClickable(true);
        LinearLayout swTop = new LinearLayout(a);
        swTop.setOrientation(LinearLayout.HORIZONTAL);
        swTop.setGravity(Gravity.CENTER_VERTICAL);
        swTop.setPadding(px(4), 0, px(4), 0);
        ImageView swNew = iconBtn(Ico.PLUS, "새 탭", 48);
        swTitle = new TextView(a);
        swTitle.setTextSize(16);
        swTitle.setTypeface(Typeface.DEFAULT_BOLD);
        swTitle.setGravity(Gravity.CENTER);
        ImageView swMore = iconBtn(Ico.MORE, "탭 메뉴", 48);
        swTop.addView(swNew);
        swTop.addView(swTitle, new LinearLayout.LayoutParams(0, -2, 1f));
        swTop.addView(swMore);
        switcher.addView(swTop, new LinearLayout.LayoutParams(-1, px(56)));
        swScroll = new ScrollView(a);
        swGrid = new LinearLayout(a);
        swGrid.setOrientation(LinearLayout.VERTICAL);
        swGrid.setPadding(px(12), px(4), px(12), px(24));
        swScroll.addView(swGrid);
        switcher.addView(swScroll, new LinearLayout.LayoutParams(-1, 0, 1f));
        switcher.setVisibility(View.GONE);
        root.addView(switcher, new FrameLayout.LayoutParams(-1, -1));

        snack = new TextView(a);
        snack.setTextSize(14);
        snack.setPadding(px(16), px(12), px(16), px(12));
        snack.setVisibility(View.GONE);
        snack.setElevation(px(6));
        FrameLayout.LayoutParams slp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        slp.setMargins(px(8), 0, px(8), px(8));
        root.addView(snack, slp);

        // ── 동작 ──
        bBack.setOnClickListener(v -> { WebView w = curWeb(); if (w != null && w.canGoBack()) w.goBack(); });
        bFwd.setOnClickListener(v -> { WebView w = curWeb(); if (w != null && w.canGoForward()) w.goForward(); });
        bReload.setOnClickListener(v -> reloadOrStop());
        bPick.setOnClickListener(v -> setPick(!pick));
        bTabs.setOnClickListener(v -> openSwitcher());
        bTabs.setOnLongClickListener(v -> { tabsLongMenu(v); return true; });
        bMenu.setOnClickListener(v -> showMenu());
        stripNew.setOnClickListener(v -> newTab(null, true));
        stripGrid.setOnClickListener(v -> openSwitcher());
        display.setOnClickListener(v -> focusOmni());
        siteIcon.setOnClickListener(v -> pageInfo());
        display.setOnLongClickListener(v -> { omniLongMenu(v); return true; });
        omniClear.setOnClickListener(v -> addr.setText(""));
        addr.setOnEditorActionListener((v, id, ev) -> {
            if (id == EditorInfo.IME_ACTION_GO || (ev != null && ev.getKeyCode() == KeyEvent.KEYCODE_ENTER)) { go(addr.getText().toString()); return true; }
            return false;
        });
        addr.setOnFocusChangeListener((v, f) -> { if (!f) unfocusOmni(); });
        addr.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a1, int b, int c) { }
            public void onTextChanged(CharSequence s, int a1, int b, int c) { }
            public void afterTextChanged(Editable s) { if (addr.hasFocus()) buildSuggest(s.toString(), false); }
        });
        findEdit.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a1, int b, int c) { }
            public void onTextChanged(CharSequence s, int a1, int b, int c) { }
            public void afterTextChanged(Editable s) { WebView w = curWeb(); if (w != null) { if (s.length() == 0) { w.clearMatches(); findCount.setText(""); } else w.findAllAsync(s.toString()); } }
        });
        findEdit.setOnEditorActionListener((v, id, ev) -> { WebView w = curWeb(); if (w != null) w.findNext(true); return true; });
        fUp.setOnClickListener(v -> { WebView w = curWeb(); if (w != null) w.findNext(false); });
        fDown.setOnClickListener(v -> { WebView w = curWeb(); if (w != null) w.findNext(true); });
        fClose.setOnClickListener(v -> closeFind());
        swNew.setOnClickListener(v -> { closeSwitcherTo(-1); newTab(null, true); });
        swMore.setOnClickListener(v -> popupList(v, new String[]{"새 탭", "모든 탭 닫기"}, i -> {
            if (i == 0) { closeSwitcherTo(-1); newTab(null, true); }
            else closeAllTabs();
        }));

        restoreTabs();
        applyOrder();
        applyTheme(false);
    }

    // ═══════════════════════════════════════════════════════════════
    // 모양
    // ═══════════════════════════════════════════════════════════════
    int px(float v) { return Math.round(v * dp); }

    ImageView iconBtn(int type, String desc, int sizeDp) {
        ImageView b = new ImageView(act);
        b.setImageDrawable(new Ico(type, cFg, px(24)));
        b.setScaleType(ImageView.ScaleType.CENTER);
        b.setContentDescription(desc);
        b.setClickable(true);
        b.setFocusable(true);
        b.setBackground(ripple());
        b.setLayoutParams(new LinearLayout.LayoutParams(px(sizeDp), px(sizeDp)));
        return b;
    }

    android.graphics.drawable.Drawable ripple() {
        GradientDrawable mask = new GradientDrawable();
        mask.setShape(GradientDrawable.OVAL);
        mask.setColor(Color.WHITE);
        return new android.graphics.drawable.RippleDrawable(ColorStateList.valueOf(light ? 0x22000000 : 0x33ffffff), null, mask);
    }

    void setIco(ImageView v, int type, int color) {
        if (v.getDrawable() instanceof Ico && ((Ico) v.getDrawable()).type == type) ((Ico) v.getDrawable()).setColor(color);
        else v.setImageDrawable(new Ico(type, color, px(24)));
    }

    void palette(boolean lt) {
        light = lt;
        if (lt) {
            cBar = 0xffffffff; cOmni = 0xfff1f3f4; cFg = 0xff1f1f1f; cDim = 0xff5f6368; cAccent = 0xff0b57d0;
            cCard = 0xfff1f3f4; cMenu = 0xffffffff; cDivider = 0xffdadce0; cStrip = 0xffdee1e6; cPage = 0xffffffff;
        } else {
            cBar = 0xff1f1f1f; cOmni = 0xff303134; cFg = 0xffe3e3e3; cDim = 0xff9aa0a6; cAccent = 0xffa8c7fa;
            cCard = 0xff303134; cMenu = 0xff2b2b2e; cDivider = 0xff3c4043; cStrip = 0xff121212; cPage = 0xff1f1f1f;
        }
    }

    /** 웹앱 테마(밝게/어둡게)를 따른다 — 크롬도 시스템 테마를 따른다. */
    void applyTheme(boolean lt) {
        palette(lt);
        root.setBackgroundColor(cBar);
        chrome.setBackgroundColor(cBar);
        bar.setBackgroundColor(cBar);
        findBar.setBackgroundColor(cBar);
        stripRow.setBackgroundColor(cStrip);
        content.setBackgroundColor(cPage);
        switcher.setBackgroundColor(cBar);
        suggestScroll.setBackgroundColor(cBar);
        GradientDrawable ob = new GradientDrawable();
        ob.setColor(cOmni);
        ob.setCornerRadius(px(22));
        omni.setBackground(ob);
        display.setTextColor(cFg);
        addr.setTextColor(cFg);
        addr.setHintTextColor(cDim);
        findEdit.setTextColor(cFg);
        findEdit.setHintTextColor(cDim);
        findCount.setTextColor(cDim);
        swTitle.setTextColor(cFg);
        for (ImageView v : new ImageView[]{bBack, bFwd, bReload, bMenu, omniClear, stripNew, stripGrid}) {
            if (v.getDrawable() instanceof Ico) ((Ico) v.getDrawable()).setColor(cFg);
            v.setBackground(ripple());
        }
        for (int i = 0; i < findBar.getChildCount(); i++) { View c = findBar.getChildAt(i); if (c instanceof ImageView && ((ImageView) c).getDrawable() instanceof Ico) ((Ico) ((ImageView) c).getDrawable()).setColor(cFg); }
        for (int i = 0; i < switcher.getChildCount(); i++) {
            View c = switcher.getChildAt(i);
            if (c instanceof LinearLayout) for (int j = 0; j < ((LinearLayout) c).getChildCount(); j++) {
                View d = ((LinearLayout) c).getChildAt(j);
                if (d instanceof ImageView && ((ImageView) d).getDrawable() instanceof Ico) ((Ico) ((ImageView) d).getDrawable()).setColor(cFg);
            }
        }
        prog.setProgressTintList(ColorStateList.valueOf(cAccent));
        prog.setProgressBackgroundTintList(ColorStateList.valueOf(cBar));
        GradientDrawable pb = new GradientDrawable();
        pb.setShape(GradientDrawable.OVAL);
        pb.setColor(light ? 0xffffffff : 0xff3c4043);
        ptr.setBackground(pb);
        ptr.setImageDrawable(new Ico(Ico.REFRESH, cAccent, px(24)));
        GradientDrawable sb = new GradientDrawable();
        sb.setColor(light ? 0xff303030 : 0xffe3e3e3);
        sb.setCornerRadius(px(8));
        snack.setBackground(sb);
        snack.setTextColor(light ? 0xfff2f2f2 : 0xff1f1f1f);
        bTabs.invalidate();
        syncPick();
        syncBar();
        if (switcherOpen) buildSwitcher();
        updateStrip();
    }

    void syncPick() {
        setIco(bPick, pick ? Ico.TARGET_ON : Ico.TARGET, pick ? cAccent : cFg);
        if (pick) {
            GradientDrawable on = new GradientDrawable();
            on.setShape(GradientDrawable.OVAL);
            on.setColor((cAccent & 0x00ffffff) | 0x33000000);
            bPick.setBackground(on);
        } else bPick.setBackground(ripple());
    }

    /** 탭 수 단추 — 크롬처럼 둥근 네모 안에 숫자(99 넘으면 :D 대신 ∞). */
    final class TabsButton extends View {
        final Paint st = new Paint(Paint.ANTI_ALIAS_FLAG), tx = new Paint(Paint.ANTI_ALIAS_FLAG);
        TabsButton(Context c) {
            super(c);
            setClickable(true); setFocusable(true);
            st.setStyle(Paint.Style.STROKE);
            tx.setTextAlign(Paint.Align.CENTER);
            tx.setTypeface(Typeface.DEFAULT_BOLD);
            setBackground(ripple());
        }
        @Override protected void onDraw(Canvas c) {
            float s = px(19), cx = getWidth() / 2f, cy = getHeight() / 2f;
            st.setColor(cFg); st.setStrokeWidth(px(2));
            c.drawRoundRect(new RectF(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2), px(4), px(4), st);
            int n = tabs.size();
            tx.setColor(cFg); tx.setTextSize(px(n > 9 ? 10 : 12));
            c.drawText(n > 99 ? "∞" : String.valueOf(n), cx, cy - (tx.descent() + tx.ascent()) / 2, tx);
        }
    }

    /** 넓이에 따라 크롬 휴대폰 / 태블릿 툴바. ⚠ '들어가느냐'만 본다(무엇을 보일지는 바꾸지 않는다). */
    void relayoutMode() {
        int w = root.getWidth();
        if (w == 0) return;
        tablet = w >= px(600);
        narrow = w < px(300);
        syncBar();
        updateStrip();
    }

    /** 주소창이 위/아래 — 크롬 「주소 표시줄을 아래로」. 순서만 바꾼다. */
    void applyOrder() {
        column.removeAllViews();
        chrome.removeAllViews();
        if (!barBottom) {
            chrome.addView(bar, new LinearLayout.LayoutParams(-1, px(56)));
            chrome.addView(prog, new LinearLayout.LayoutParams(-1, px(2)));
            column.addView(stripRow, new LinearLayout.LayoutParams(-1, px(40)));
            column.addView(chrome, new LinearLayout.LayoutParams(-1, chromeShown ? px(58) : 0));
            column.addView(findBar, new LinearLayout.LayoutParams(-1, px(56)));
            column.addView(content, new LinearLayout.LayoutParams(-1, 0, 1f));
        } else {
            chrome.addView(prog, new LinearLayout.LayoutParams(-1, px(2)));
            chrome.addView(bar, new LinearLayout.LayoutParams(-1, px(56)));
            column.addView(stripRow, new LinearLayout.LayoutParams(-1, px(40)));
            column.addView(content, new LinearLayout.LayoutParams(-1, 0, 1f));
            column.addView(findBar, new LinearLayout.LayoutParams(-1, px(56)));
            column.addView(chrome, new LinearLayout.LayoutParams(-1, chromeShown ? px(58) : 0));
        }
        FrameLayout.LayoutParams sl = (FrameLayout.LayoutParams) suggestScroll.getLayoutParams();
        sl.gravity = barBottom ? Gravity.BOTTOM : Gravity.TOP;
        suggestScroll.setLayoutParams(sl);
    }

    /** 툴바 단추 보이기 — 휴대폰 [주소창][🎯][탭][⋮] · 태블릿 [←][→][↻][주소창][🎯][⋮] · 주소 입력 중엔 주소창만. */
    void syncBar() {
        boolean editing = addr.getVisibility() == View.VISIBLE;
        WebView w = curWeb();
        bBack.setVisibility(tablet && !editing ? View.VISIBLE : View.GONE);
        bFwd.setVisibility(tablet && !editing ? View.VISIBLE : View.GONE);
        bReload.setVisibility(tablet && !editing ? View.VISIBLE : View.GONE);
        bBack.setAlpha(w != null && w.canGoBack() ? 1f : 0.38f);
        bFwd.setAlpha(w != null && w.canGoForward() ? 1f : 0.38f);
        setIco(bReload, prog.getVisibility() == View.VISIBLE ? Ico.CLOSE : Ico.REFRESH, cFg);
        bPick.setVisibility(!editing && !narrow ? View.VISIBLE : View.GONE);
        bTabs.setVisibility(!editing && !tablet ? View.VISIBLE : View.GONE);
        bMenu.setVisibility(editing ? View.GONE : View.VISIBLE);
        omniClear.setVisibility(editing ? View.VISIBLE : View.GONE);
        stripRow.setVisibility(tablet && !findOpen ? View.VISIBLE : View.GONE);
        bTabs.invalidate();
        if (!editing) setDisplay();
    }

    /** 주소창(안 누른 상태) — 크롬처럼 'www.'·'https://' 를 빼고 도메인을 진하게, 경로는 흐리게. */
    void setDisplay() {
        Tab t = curTab();
        WebView w = curWeb();
        String u = w != null && w.getUrl() != null ? w.getUrl() : (t != null ? t.url : "");
        if (isNtpUrl(u)) {
            display.setText("검색어 또는 URL 입력");
            display.setTextColor(cDim);
            setIco(siteIcon, Ico.SEARCH, cDim);
            return;
        }
        display.setTextColor(cFg);
        try {
            Uri p = Uri.parse(u);
            String host = p.getHost() == null ? u : p.getHost();
            if (host.startsWith("www.")) host = host.substring(4);
            String rest = (p.getEncodedPath() == null || "/".equals(p.getEncodedPath()) ? "" : p.getEncodedPath()) + (p.getEncodedQuery() != null ? "?" + p.getEncodedQuery() : "");
            try { rest = URLDecoder.decode(rest, "UTF-8"); } catch (Exception ignored) { }
            SpannableStringBuilder sb = new SpannableStringBuilder(host);
            int a = sb.length();
            sb.append(rest);
            sb.setSpan(new ForegroundColorSpan(cDim), a, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            display.setText(sb);
            setIco(siteIcon, "https".equals(p.getScheme()) ? Ico.TUNE : Ico.WARN, cDim);
        } catch (Exception e) {
            display.setText(u);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 주소창 · 추천
    // ═══════════════════════════════════════════════════════════════
    void focusOmni() {
        if (switcherOpen) return;
        Tab t = curTab();
        WebView w = curWeb();
        String u = w != null && w.getUrl() != null ? w.getUrl() : (t != null ? t.url : "");
        display.setVisibility(View.GONE);
        addr.setVisibility(View.VISIBLE);
        addr.setText(isNtpUrl(u) ? "" : u);
        addr.requestFocus();
        addr.selectAll();
        setChromeShown(true);
        syncBar();
        try { ((InputMethodManager) act.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(addr, InputMethodManager.SHOW_IMPLICIT); } catch (Exception ignored) { }
        buildSuggest(addr.getText().toString(), true);
    }

    void unfocusOmni() {
        if (addr.getVisibility() != View.VISIBLE) return;
        hideKeyboard();
        addr.setVisibility(View.GONE);
        display.setVisibility(View.VISIBLE);
        suggestScroll.setVisibility(View.GONE);
        syncBar();
    }

    void hideKeyboard() {
        try { ((InputMethodManager) act.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(root.getWindowToken(), 0); } catch (Exception ignored) { }
    }

    interface IntCb { void run(int i); }

    /** 크롬 주소창 추천 — 지금 페이지(복사·공유) · 입력한 것(검색/이동) · 북마크 · 기록. */
    void buildSuggest(String q, boolean untouched) {
        suggest.removeAllViews();
        Tab t = curTab();
        WebView w = curWeb();
        String curUrl = w != null && w.getUrl() != null ? w.getUrl() : (t != null ? t.url : "");
        q = q == null ? "" : q.trim();
        if (untouched && !isNtpUrl(curUrl)) {
            final String cu = curUrl;
            View row = sugRow(Ico.GLOBE, w != null && w.getTitle() != null ? w.getTitle() : hostOf(cu), cu, v -> { copy(cu); flash("링크를 복사했어요", 1600, null, null); });
            ImageView c1 = iconBtn(Ico.COPY, "링크 복사", 44), c2 = iconBtn(Ico.SHARE, "공유", 44);
            c1.setOnClickListener(v -> { copy(cu); flash("링크를 복사했어요", 1600, null, null); });
            c2.setOnClickListener(v -> share(cu));
            ((LinearLayout) row).addView(c1); ((LinearLayout) row).addView(c2);
            suggest.addView(row);
            q = "";
        }
        if (!q.isEmpty()) {
            final String fq = q;
            String u = toUrl(q);
            boolean isSearch = u != null && u.startsWith("https://www.google.com/search?q=");
            suggest.addView(sugRow(isSearch ? Ico.SEARCH : Ico.GLOBE, q, isSearch ? "Google 검색" : u, v -> go(fq)));
        }
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        String lq = q.toLowerCase();
        int n = 0;
        for (String key : new String[]{"marks", "hist"}) {
            JSONArray a = loadArr(key);
            for (int i = 0; i < a.length() && n < (q.isEmpty() ? 8 : 6); i++) {
                JSONObject o = a.optJSONObject(i);
                if (o == null) continue;
                String u = o.optString("u"), ti = o.optString("t");
                if (u.isEmpty() || seen.contains(u) || u.equals(curUrl)) continue;
                if (!lq.isEmpty() && !u.toLowerCase().contains(lq) && !ti.toLowerCase().contains(lq)) continue;
                if (q.isEmpty() && key.equals("marks")) continue;   // 빈 입력이면 최근 기록만(크롬처럼)
                seen.add(u); n++;
                final String fu = u;
                suggest.addView(sugRow(key.equals("marks") ? Ico.STAR_ON : Ico.CLOCK, ti.isEmpty() ? hostOf(u) : ti, u, v -> go(fu)));
            }
        }
        suggestScroll.setVisibility(suggest.getChildCount() > 0 ? View.VISIBLE : View.GONE);
        suggestScroll.bringToFront();
        FrameLayout.LayoutParams sl = (FrameLayout.LayoutParams) suggestScroll.getLayoutParams();
        sl.height = -2;
        suggestScroll.setLayoutParams(sl);
    }

    View sugRow(int icon, String title, String sub, View.OnClickListener click) {
        LinearLayout r = new LinearLayout(act);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(px(16), 0, px(4), 0);
        r.setMinimumHeight(px(58));
        r.setClickable(true);
        r.setBackground(new android.graphics.drawable.RippleDrawable(ColorStateList.valueOf(light ? 0x14000000 : 0x22ffffff), null, new android.graphics.drawable.ColorDrawable(Color.WHITE)));
        ImageView ic = new ImageView(act);
        ic.setImageDrawable(new Ico(icon, cDim, px(22)));
        r.addView(ic, new LinearLayout.LayoutParams(px(24), px(24)));
        LinearLayout tx = new LinearLayout(act);
        tx.setOrientation(LinearLayout.VERTICAL);
        tx.setPadding(px(16), px(8), px(8), px(8));
        TextView t1 = new TextView(act); t1.setText(title); t1.setTextColor(cFg); t1.setTextSize(16); t1.setSingleLine(true); t1.setEllipsize(TextUtils.TruncateAt.END);
        tx.addView(t1);
        if (sub != null && !sub.isEmpty()) {
            TextView t2 = new TextView(act); t2.setText(sub); t2.setTextColor(cAccent); t2.setTextSize(13); t2.setSingleLine(true); t2.setEllipsize(TextUtils.TruncateAt.END);
            tx.addView(t2);
        }
        r.addView(tx, new LinearLayout.LayoutParams(0, -2, 1f));
        r.setOnClickListener(click);
        return r;
    }

    void omniLongMenu(View anchor) {
        popupList(anchor, new String[]{barBottom ? "주소 표시줄을 위로 이동" : "주소 표시줄을 아래로 이동", "링크 복사"}, i -> {
            if (i == 0) setBarBottom(!barBottom);
            else { WebView w = curWeb(); if (w != null && w.getUrl() != null && !isNtpUrl(w.getUrl())) { copy(w.getUrl()); flash("링크를 복사했어요", 1600, null, null); } }
        });
    }

    void setBarBottom(boolean b) {
        barBottom = b;
        sp.edit().putBoolean("barBottom", b).apply();
        applyOrder();
        syncBar();
    }

    // ═══════════════════════════════════════════════════════════════
    // 툴바 제스처 — 옆으로 밀면 옆 탭, 아래로(주소창이 아래면 위로) 밀면 탭 목록
    // ═══════════════════════════════════════════════════════════════
    final class SwipeBar extends LinearLayout {
        float x0, y0;
        int gesture;          // 0 아직 · 1 옆으로 · 2 탭 목록 쪽
        VelocityTracker vt;
        SwipeBar(Context c) { super(c); }

        boolean blocked() { return addr.getVisibility() == View.VISIBLE || switcherOpen; }

        int decide(float dx, float dy) {
            if (Math.abs(dx) > slop && Math.abs(dx) > Math.abs(dy)) return 1;
            if ((barBottom ? -dy : dy) > slop && Math.abs(dy) > Math.abs(dx)) return 2;
            return 0;
        }

        @Override public boolean onInterceptTouchEvent(MotionEvent e) {
            if (blocked()) return false;
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    x0 = e.getRawX(); y0 = e.getRawY(); gesture = 0;
                    if (vt != null) vt.recycle();
                    vt = VelocityTracker.obtain(); vt.addMovement(e);
                    return false;
                case MotionEvent.ACTION_MOVE:
                    if (vt != null) vt.addMovement(e);
                    gesture = decide(e.getRawX() - x0, e.getRawY() - y0);
                    if (gesture == 1) captureThumb(curTab(), null);
                    return gesture != 0;
                case MotionEvent.ACTION_UP: {
                    //  ⚠ 폰이 바쁘면 움직임이 손을 뗄 때 한꺼번에 온다 — 그러면 MOVE 로는 못 잡고 주소창 '탭'이 돼 버렸다(가상 기기 실측).
                    //    손 뗀 자리로 한 번 더 판정해서, 밀었으면 여기서 처리하고 아래(주소창)에는 안 넘긴다.
                    float dx = e.getRawX() - x0, dy = e.getRawY() - y0;
                    int g = decide(dx, dy);
                    if (g == 0) return false;
                    float vx = 0, vy = 0;
                    if (vt != null) { vt.addMovement(e); vt.computeCurrentVelocity(1000); vx = vt.getXVelocity(); vy = vt.getYVelocity(); vt.recycle(); vt = null; }
                    if (g == 1) { swipeMove(dx); swipeEnd(dx, vx); }
                    else if ((barBottom ? -dy : dy) > px(36) || (barBottom ? -vy : vy) > px(500)) openSwitcher();
                    return true;
                }
            }
            return false;
        }

        @Override public boolean onTouchEvent(MotionEvent e) {
            if (blocked()) return false;
            float dx = e.getRawX() - x0, dy = e.getRawY() - y0;
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    x0 = e.getRawX(); y0 = e.getRawY(); gesture = 0;
                    if (vt != null) vt.recycle();
                    vt = VelocityTracker.obtain(); vt.addMovement(e);
                    return true;
                case MotionEvent.ACTION_MOVE:
                    if (vt != null) vt.addMovement(e);
                    if (gesture == 0) { gesture = decide(dx, dy); if (gesture == 1) captureThumb(curTab(), null); }
                    if (gesture == 1) swipeMove(dx);
                    return true;
                case MotionEvent.ACTION_UP: {
                    float vx = 0, vy = 0;
                    if (vt != null) { vt.addMovement(e); vt.computeCurrentVelocity(1000); vx = vt.getXVelocity(); vy = vt.getYVelocity(); vt.recycle(); vt = null; }
                    if (gesture == 1) swipeEnd(dx, vx);
                    else if (gesture == 2 && ((barBottom ? -dy : dy) > px(36) || (barBottom ? -vy : vy) > px(500))) openSwitcher();
                    gesture = 0;
                    return true;
                }
                case MotionEvent.ACTION_CANCEL:
                    if (vt != null) { vt.recycle(); vt = null; }
                    if (gesture == 1) swipeEnd(0, 0);
                    gesture = 0;
                    return true;
            }
            return true;
        }
    }

    Tab swipeNb;

    void swipeMove(float dx) {
        WebView w = curWeb();
        if (w == null) return;
        int W = content.getWidth();
        int ni = dx < 0 ? cur + 1 : cur - 1;          // 왼쪽으로 밀면 다음(오른쪽) 탭 — 크롬과 같은 방향
        Tab nb = (ni >= 0 && ni < tabs.size()) ? tabs.get(ni) : null;
        if (nb == null) dx *= 0.25f;                 // 끝이면 살짝만 끌려온다(고무줄)
        w.setTranslationX(dx);
        if (nb != null) {
            if (swipeNb != nb) { swipeNb = nb; setPeek(nb); }
            peek.setVisibility(View.VISIBLE);
            peek.setTranslationX(dx + (dx < 0 ? W : -W));
        } else { swipeNb = null; peek.setVisibility(View.GONE); }
    }

    void swipeEnd(float dx, float vx) {
        final WebView w = curWeb();
        if (w == null) return;
        int W = content.getWidth();
        final Tab nb = swipeNb;
        boolean go = nb != null && (Math.abs(dx) > W * 0.3f || (Math.abs(vx) > px(700) && Math.signum(vx) == Math.signum(dx)));
        if (go) {
            w.animate().translationX(dx < 0 ? -W : W).setDuration(170).start();
            peek.animate().translationX(0).setDuration(170).withEndAction(() -> {
                w.setTranslationX(0);
                switchTo(tabs.indexOf(nb), false);
                ui.postDelayed(() -> peek.setVisibility(View.GONE), 60);
            }).start();
        } else {
            w.animate().translationX(0).setDuration(160).start();
            peek.animate().translationX(dx < 0 ? W : -W).setDuration(160).withEndAction(() -> peek.setVisibility(View.GONE)).start();
        }
        swipeNb = null;
    }

    void setPeek(Tab t) {
        Bitmap b = t.thumb != null ? t.thumb : placeholder(t);
        peek.setImageBitmap(b);
        android.graphics.Matrix m = new android.graphics.Matrix();
        float s = content.getWidth() / (float) Math.max(1, b.getWidth());
        m.setScale(s, s);
        peek.setImageMatrix(m);
        peek.setBackgroundColor(cPage);
        peek.bringToFront();
    }

    Bitmap placeholder(Tab t) {
        int W = Math.max(1, content.getWidth() / 2), H = Math.max(1, content.getHeight() / 2);
        Bitmap b = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        c.drawColor(cPage);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(cDim); p.setTextSize(px(9)); p.setTextAlign(Paint.Align.CENTER);
        String title = isNtpUrl(t.url) ? "새 탭" : (t.title.isEmpty() ? hostOf(t.url) : t.title);
        if (title.length() > 28) title = title.substring(0, 27) + "…";
        c.drawText(title, W / 2f, H / 2f, p);
        return b;
    }

    /** 지금 보이는 탭을 절반 크기로 떠 둔다 — 탭 목록 카드·옆 탭 미리보기용(PixelCopy, 이 앱 창 안이라 권한 불필요). */
    void captureThumb(Tab t, Runnable after) {
        try {
            if (t == null || t.w == null || !t.w.isShown() || t.w.getWidth() == 0 || t.w.getHeight() == 0) { if (after != null) after.run(); return; }
            int[] loc = new int[2];
            t.w.getLocationInWindow(loc);
            Rect r = new Rect(loc[0], loc[1], loc[0] + t.w.getWidth(), loc[1] + t.w.getHeight());
            final Bitmap b = Bitmap.createBitmap(Math.max(1, r.width() / 2), Math.max(1, r.height() / 2), Bitmap.Config.ARGB_8888);
            PixelCopy.request(act.getWindow(), r, b, res -> { if (res == PixelCopy.SUCCESS) t.thumb = b; if (after != null) after.run(); }, ui);
        } catch (Exception e) { if (after != null) after.run(); }
    }

    // ═══════════════════════════════════════════════════════════════
    // 툴바 숨기기(내리면 숨고 올리면 나온다) · 당겨서 새로고침
    // ═══════════════════════════════════════════════════════════════
    void setChromeShown(boolean show) {
        if (findOpen) show = false;
        if (addr.getVisibility() == View.VISIBLE || switcherOpen) show = true;
        if (show == chromeShown) return;
        chromeShown = show;
        final LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) chrome.getLayoutParams();
        if (chromeAnim != null) chromeAnim.cancel();
        chromeAnim = ValueAnimator.ofInt(lp.height < 0 ? px(58) : lp.height, show ? px(58) : 0);
        chromeAnim.setDuration(170);
        chromeAnim.addUpdateListener(an -> { lp.height = (int) an.getAnimatedValue(); chrome.setLayoutParams(lp); });
        chromeAnim.start();
    }

    //  당겨서 새로고침 — 페이지 맨 위에서 아래로 끌었을 때만. 페이지 안의 다른 스크롤 칸이 내려가 있거나
    //  overscroll-behavior 로 막아 둔 사이트면 하지 않는다(크롬도 그 설정을 따른다).
    static final String PULL_JS = "(function(px,py,vw){try{var vv=window.visualViewport;if(vv&&vv.scale>1.02)return false;" +
            "var k=(vv?vv.width:innerWidth)/vw;if(scrollY>0)return false;" +
            "var ob=getComputedStyle(document.documentElement).overscrollBehaviorY,obb=document.body?getComputedStyle(document.body).overscrollBehaviorY:'auto';" +
            "if((ob&&ob!=='auto')||(obb&&obb!=='auto'))return false;" +
            "var e=document.elementFromPoint(px*k,py*k);while(e&&e!==document.body&&e!==document.documentElement){if(e.scrollTop>0)return false;e=e.parentElement;}" +
            "return true;}catch(err){return true}})";

    boolean ptrCand, ptrOk, ptrActive, refreshing;
    float ptrY0, ptrX0;

    void ptrTouch(Tab t, WebView w, MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                ptrActive = false; ptrOk = false;
                ptrY0 = e.getRawY(); ptrX0 = e.getRawX();
                ptrCand = !refreshing && !w.canScrollVertically(-1);
                if (ptrCand) w.evaluateJavascript(PULL_JS + "(" + Math.round(e.getX()) + "," + Math.round(e.getY()) + "," + Math.max(1, w.getWidth()) + ")", r -> ptrOk = "true".equals(r));
                break;
            case MotionEvent.ACTION_MOVE: {
                if (!ptrCand || !ptrOk) break;
                float dy = e.getRawY() - ptrY0, dx = e.getRawX() - ptrX0;
                if (!ptrActive && dy > slop && dy > Math.abs(dx) * 1.5f && !w.canScrollVertically(-1)) ptrActive = true;
                if (ptrActive) {
                    float pull = Math.min(dy * 0.5f, px(110));
                    ptr.setVisibility(View.VISIBLE);
                    ptr.bringToFront();
                    ptr.setTranslationY(pull - px(42));
                    ptr.setRotation(dy * 0.8f);
                    float k = Math.min(1f, pull / px(72));
                    ptr.setAlpha(0.3f + 0.7f * k);
                    ptr.setScaleX(0.6f + 0.4f * k); ptr.setScaleY(0.6f + 0.4f * k);
                    if (dy < 0) ptrActive = false;
                }
                break;
            }
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL: {
                if (!ptrActive) { ptrCand = false; break; }
                ptrActive = false; ptrCand = false;
                float pull = Math.min((e.getRawY() - ptrY0) * 0.5f, px(110));
                if (e.getActionMasked() == MotionEvent.ACTION_UP && pull >= px(72)) {
                    refreshing = true;
                    w.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
                    ptr.animate().translationY(px(20)).setDuration(150).start();
                    spinPtr();
                    w.reload();
                    ui.postDelayed(this::endRefresh, 8000);
                } else hidePtr();
                break;
            }
        }
    }

    void spinPtr() {
        if (!refreshing) return;
        ptr.animate().rotationBy(360).setDuration(800).setInterpolator(new LinearInterpolator()).withEndAction(this::spinPtr).start();
    }

    void endRefresh() {
        if (!refreshing) return;
        refreshing = false;
        hidePtr();
    }

    void hidePtr() {
        ptr.animate().cancel();
        ptr.animate().scaleX(0.2f).scaleY(0.2f).alpha(0f).setDuration(180).withEndAction(() -> { ptr.setVisibility(View.GONE); ptr.setTranslationY(-px(42)); }).start();
    }

    // ═══════════════════════════════════════════════════════════════
    // 탭
    // ═══════════════════════════════════════════════════════════════
    void restoreTabs() {
        try {
            JSONArray arr = new JSONArray(sp.getString("tabs", "[]"));
            for (int i = 0; i < arr.length() && tabs.size() < MAX_TABS; i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                String u = o.optString("u", "");
                if (!isWeb(u) && !NTP.equals(u)) continue;
                Tab t = new Tab(); t.url = u; t.title = o.optString("t", ""); tabs.add(t);
            }
            cur = Math.max(0, Math.min(tabs.size() - 1, sp.getInt("cur", 0)));
        } catch (Exception ignored) { }
        if (tabs.isEmpty()) { tabs.add(new Tab()); cur = 0; }
    }

    void saveTabs() {
        try {
            JSONArray arr = new JSONArray();
            for (Tab t : tabs) {
                if (t.w != null && t.w.getUrl() != null) t.url = isNtpUrl(t.w.getUrl()) ? NTP : (isWeb(t.w.getUrl()) ? t.w.getUrl() : t.url);
                JSONObject o = new JSONObject(); o.put("u", t.url); o.put("t", t.title); arr.put(o);
            }
            sp.edit().putString("tabs", arr.toString()).putInt("cur", cur).apply();
        } catch (Exception ignored) { }
    }

    static boolean isWeb(String u) { return u != null && (u.startsWith("https://") || u.startsWith("http://")) && !u.startsWith(NTP_BASE); }
    static boolean isNtpUrl(String u) { return u == null || u.isEmpty() || NTP.equals(u) || "about:blank".equals(u) || u.startsWith(NTP_BASE) || u.startsWith("data:"); }

    Tab curTab() { return tabs.isEmpty() ? null : tabs.get(Math.max(0, Math.min(cur, tabs.size() - 1))); }
    WebView curWeb() { Tab t = curTab(); return t == null ? null : t.w; }

    /** 브라우저가 보일 때·탭을 바꿀 때. WebView 는 그때 만든다(안 쓰는 탭은 메모리를 안 먹게, 최대 MAX_LIVE 개만 살린다). */
    void show() {
        Tab t = curTab();
        if (t == null) return;
        t.usedAt = System.currentTimeMillis();
        if (t.w == null) {
            t.w = makeWeb(t);
            if (t.state != null && t.w.restoreState(t.state) != null) { t.state = null; }
            else if (NTP.equals(t.url)) loadNtp(t.w);
            else t.w.loadUrl(t.url);
        }
        for (int i = content.getChildCount() - 1; i >= 0; i--) {
            View c = content.getChildAt(i);
            if (c instanceof WebView && c != t.w) content.removeView(c);
        }
        if (t.w.getParent() == null) content.addView(t.w, 0, new FrameLayout.LayoutParams(-1, -1));
        t.w.setTranslationX(0);
        t.w.onResume();
        trimLive();
        setChromeShown(true);
        syncBar();
        updateStrip();
        if (findOpen) closeFind();
    }

    void trimLive() {
        ArrayList<Tab> live = new ArrayList<>();
        for (Tab x : tabs) if (x.w != null && x != curTab()) live.add(x);
        while (live.size() > MAX_LIVE - 1) {
            Tab old = live.get(0);
            for (Tab x : live) if (x.usedAt < old.usedAt) old = x;
            live.remove(old);
            try { Bundle b = new Bundle(); old.w.saveState(b); old.state = b; } catch (Exception ignored) { }
            if (old.w.getUrl() != null && isWeb(old.w.getUrl())) old.url = old.w.getUrl();
            old.w.destroy();
            old.w = null;
        }
    }

    void switchTo(int i) { switchTo(i, true); }

    /** @param snap 떠나는 탭을 미리보기로 떠 둘지 — 옆으로 밀어 넘길 땐 화면이 움직이는 중이라 반쯤 밀린 그림이 찍혔다(가상 기기 실측). 미는 순간 이미 떠 둔다. */
    void switchTo(int i, boolean snap) {
        if (i < 0 || i >= tabs.size()) return;
        Tab old = curTab();
        if (old != null && old.w != null && i != cur) { if (snap) captureThumb(old, null); old.w.onPause(); }
        cur = i;
        unfocusOmni();
        show();
        saveTabs();
    }

    Tab newTab(String url, boolean focus) {
        if (tabs.size() >= MAX_TABS) { flash("탭은 " + MAX_TABS + "개까지예요 — 안 쓰는 탭을 닫아 주세요", 2600, null, null); return null; }
        Tab t = new Tab();
        if (url != null) t.url = url;
        tabs.add(Math.min(cur + 1, tabs.size()), t);
        if (focus) switchTo(tabs.indexOf(t));
        else { bTabs.invalidate(); updateStrip(); }
        saveTabs();
        return t;
    }

    void closeTab(int i, boolean undo) {
        if (i < 0 || i >= tabs.size()) return;
        Tab t = tabs.remove(i);
        String u = t.w != null && t.w.getUrl() != null ? (isNtpUrl(t.w.getUrl()) ? NTP : t.w.getUrl()) : t.url;
        closed.push(new String[]{u, t.title, String.valueOf(i)});
        while (closed.size() > 10) closed.removeLast();
        if (t.w != null) { content.removeView(t.w); t.w.destroy(); t.w = null; }
        for (Tab x : tabs) if (x.opener == t) x.opener = null;
        if (tabs.isEmpty()) tabs.add(new Tab());
        if (i < cur) cur--;
        if (cur >= tabs.size()) cur = tabs.size() - 1;
        if (!switcherOpen) show(); else { bTabs.invalidate(); buildSwitcher(); }
        saveTabs();
        bTabs.invalidate();
        updateStrip();
        if (undo) flash("탭을 닫았어요", 5000, "실행취소", this::reopenClosed);
    }

    void reopenClosed() {
        String[] c = closed.poll();
        if (c == null) { flash("최근에 닫은 탭이 없어요", 1600, null, null); return; }
        Tab t = new Tab(); t.url = c[0]; t.title = c[1];
        int at = Math.max(0, Math.min(tabs.size(), Integer.parseInt(c[2])));
        //  닫자마자 새 탭 하나만 남았던 경우(마지막 탭을 닫음) 그 빈 탭은 치운다
        if (tabs.size() == 1 && NTP.equals(tabs.get(0).url) && tabs.get(0).w != null && isNtpUrl(tabs.get(0).w.getUrl())) { Tab e = tabs.remove(0); if (e.w != null) { content.removeView(e.w); e.w.destroy(); } at = 0; }
        tabs.add(at, t);
        cur = at;
        if (switcherOpen) { buildSwitcher(); show(); } else show();
        saveTabs();
    }

    void closeAllTabs() {
        new AlertDialog.Builder(act, dlgTheme()).setTitle("모든 탭 닫기").setMessage("열린 탭 " + tabs.size() + "개를 모두 닫을까요?")
                .setPositiveButton("모두 닫기", (d, i) -> {
                    for (Tab t : tabs) if (t.w != null) { content.removeView(t.w); t.w.destroy(); }
                    tabs.clear(); tabs.add(new Tab()); cur = 0;
                    closeSwitcherTo(0);
                    saveTabs();
                }).setNegativeButton("취소", null).show();
    }

    void tabsLongMenu(View anchor) {
        anchor.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
        popupList(anchor, new String[]{"탭 닫기", "새 탭"}, i -> { if (i == 0) closeTab(cur, true); else newTab(null, true); });
    }

    /** 태블릿 탭 줄 — 넓은 칸(600dp~)에서만. 크롬 태블릿처럼 위에 탭이 나란히. */
    void updateStrip() {
        if (strip == null) return;
        strip.removeAllViews();
        if (!tablet) return;
        int w = Math.max(px(120), Math.min(px(220), (root.getWidth() - px(100)) / Math.max(1, tabs.size())));
        for (int i = 0; i < tabs.size(); i++) {
            final int idx = i;
            Tab t = tabs.get(i);
            LinearLayout chip = new LinearLayout(act);
            chip.setOrientation(LinearLayout.HORIZONTAL);
            chip.setGravity(Gravity.CENTER_VERTICAL);
            chip.setPadding(px(12), 0, px(2), 0);
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(i == cur ? cBar : cStrip);
            float r = px(10);
            bg.setCornerRadii(new float[]{r, r, r, r, 0, 0, 0, 0});
            chip.setBackground(bg);
            TextView tt = new TextView(act);
            String title = (t.w != null && t.w.getTitle() != null && !t.w.getTitle().isEmpty() && !isNtpUrl(t.w.getUrl())) ? t.w.getTitle() : (isNtpUrl(t.url) ? "새 탭" : (t.title.isEmpty() ? hostOf(t.url) : t.title));
            tt.setText(title); tt.setTextColor(i == cur ? cFg : cDim); tt.setTextSize(13); tt.setSingleLine(true); tt.setEllipsize(TextUtils.TruncateAt.END);
            chip.addView(tt, new LinearLayout.LayoutParams(0, -2, 1f));
            ImageView x = iconBtn(Ico.CLOSE, "탭 닫기", 28);
            ((Ico) x.getDrawable()).setColor(cDim);
            x.setOnClickListener(v -> closeTab(idx, true));
            chip.addView(x);
            chip.setOnClickListener(v -> switchTo(idx));
            strip.addView(chip, new LinearLayout.LayoutParams(w, -1));
        }
        ((Ico) stripNew.getDrawable()).setColor(cFg);
        ((Ico) stripGrid.getDrawable()).setColor(cFg);
        stripScroll.post(() -> { View sel = strip.getChildAt(cur); if (sel != null) stripScroll.smoothScrollTo(Math.max(0, sel.getLeft() - px(40)), 0); });
    }

    // ═══════════════════════════════════════════════════════════════
    // 탭 목록(그리드) — 카드를 옆으로 밀면 닫기, 누르면 열기
    // ═══════════════════════════════════════════════════════════════
    void openSwitcher() {
        if (switcherOpen) return;
        unfocusOmni();
        if (findOpen) closeFind();
        captureThumb(curTab(), () -> {
            switcherOpen = true;
            buildSwitcher();
            switcher.setVisibility(View.VISIBLE);
            switcher.bringToFront();
            snack.bringToFront();
            switcher.setAlpha(0f); switcher.setScaleX(1.04f); switcher.setScaleY(1.04f);
            switcher.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(180).start();
            //  보던 탭이 보이게
            swScroll.post(() -> { View sel = swGrid.findViewWithTag("sel"); if (sel != null) swScroll.scrollTo(0, Math.max(0, ((View) sel.getParent()).getTop() - px(40))); });
        });
    }

    /** @param idx 열 탭(-1 이면 지금 탭 그대로) */
    void closeSwitcherTo(int idx) {
        if (!switcherOpen) { if (idx >= 0) switchTo(idx); return; }
        switcherOpen = false;
        if (idx >= 0 && idx != cur) switchTo(idx); else show();
        switcher.animate().alpha(0f).scaleX(1.04f).scaleY(1.04f).setDuration(150).withEndAction(() -> switcher.setVisibility(View.GONE)).start();
    }

    void buildSwitcher() {
        swGrid.removeAllViews();
        swTitle.setText("탭 " + tabs.size() + "개");
        int W = root.getWidth() > 0 ? root.getWidth() : px(360);
        int cols = W < px(300) ? 1 : (W >= px(600) ? 3 : 2);
        int gap = px(12);
        int cw = (W - px(24) - gap * (cols - 1)) / cols;
        float ratio = content.getHeight() > 0 && content.getWidth() > 0 ? content.getHeight() / (float) content.getWidth() : 1.6f;
        int th = (int) (cw * Math.max(0.9f, Math.min(1.5f, ratio * 0.8f)));
        LinearLayout row = null;
        for (int i = 0; i < tabs.size(); i++) {
            if (i % cols == 0) {
                row = new LinearLayout(act);
                row.setOrientation(LinearLayout.HORIZONTAL);
                LinearLayout.LayoutParams rl = new LinearLayout.LayoutParams(-1, -2);
                rl.topMargin = gap;
                swGrid.addView(row, rl);
            }
            View card = makeCard(i, cw, th);
            LinearLayout.LayoutParams cl = new LinearLayout.LayoutParams(cw, -2);
            if (i % cols != 0) cl.leftMargin = gap;
            row.addView(card, cl);
        }
    }

    View makeCard(final int i, int cw, int th) {
        final Tab t = tabs.get(i);
        LinearLayout card = new LinearLayout(act);
        card.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(cCard);
        bg.setCornerRadius(px(16));
        if (i == cur) bg.setStroke(px(3), cAccent);
        card.setBackground(bg);
        card.setPadding(px(4), 0, px(4), px(4));
        card.setClipToOutline(true);
        if (i == cur) card.setTag("sel");
        LinearLayout head = new LinearLayout(act);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.setPadding(px(8), 0, 0, 0);
        TextView tt = new TextView(act);
        String title = (t.w != null && t.w.getTitle() != null && !t.w.getTitle().isEmpty() && !isNtpUrl(t.w.getUrl())) ? t.w.getTitle() : (isNtpUrl(t.url) ? "새 탭" : (t.title.isEmpty() ? hostOf(t.url) : t.title));
        tt.setText(title); tt.setTextColor(cFg); tt.setTextSize(13); tt.setSingleLine(true); tt.setEllipsize(TextUtils.TruncateAt.END);
        head.addView(tt, new LinearLayout.LayoutParams(0, -2, 1f));
        ImageView x = iconBtn(Ico.CLOSE, "탭 닫기", 36);
        x.setOnClickListener(v -> closeTab(tabs.indexOf(t), true));
        head.addView(x);
        card.addView(head, new LinearLayout.LayoutParams(-1, px(36)));
        ImageView im = new ImageView(act);
        im.setScaleType(ImageView.ScaleType.CENTER_CROP);
        im.setImageBitmap(t.thumb != null ? t.thumb : placeholder(t));
        GradientDrawable ib = new GradientDrawable();
        ib.setColor(cPage);
        ib.setCornerRadius(px(12));
        im.setBackground(ib);
        im.setClipToOutline(true);
        card.addView(im, new LinearLayout.LayoutParams(-1, th));
        card.setOnTouchListener(new View.OnTouchListener() {
            float x0, y0; boolean drag; VelocityTracker vt;
            @Override public boolean onTouch(View v, MotionEvent e) {
                float dx = e.getRawX() - x0, dy = e.getRawY() - y0;
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        x0 = e.getRawX(); y0 = e.getRawY(); drag = false;
                        vt = VelocityTracker.obtain(); vt.addMovement(e);
                        v.animate().scaleX(0.97f).scaleY(0.97f).setDuration(90).start();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        if (vt != null) vt.addMovement(e);
                        if (!drag && Math.abs(dx) > slop && Math.abs(dx) > Math.abs(dy)) { drag = true; v.getParent().requestDisallowInterceptTouchEvent(true); }
                        if (drag) { v.setTranslationX(dx); v.setAlpha(Math.max(0.15f, 1 - Math.abs(dx) / v.getWidth())); }
                        return true;
                    case MotionEvent.ACTION_UP: {
                        float vx = 0;
                        if (vt != null) { vt.addMovement(e); vt.computeCurrentVelocity(1000); vx = vt.getXVelocity(); vt.recycle(); vt = null; }
                        v.animate().scaleX(1f).scaleY(1f).setDuration(90).start();
                        if (drag) {
                            if (Math.abs(dx) > v.getWidth() * 0.4f || (Math.abs(vx) > px(800) && Math.signum(vx) == Math.signum(dx))) {
                                v.animate().translationX(Math.signum(dx == 0 ? vx : dx) * v.getWidth() * 1.3f).alpha(0f).setDuration(160)
                                        .withEndAction(() -> closeTab(tabs.indexOf(t), true)).start();
                            } else v.animate().translationX(0).alpha(1f).setDuration(160).start();
                        } else if (Math.abs(dx) < slop && Math.abs(dy) < slop) closeSwitcherTo(tabs.indexOf(t));
                        return true;
                    }
                    case MotionEvent.ACTION_CANCEL:
                        if (vt != null) { vt.recycle(); vt = null; }
                        v.animate().translationX(0).alpha(1f).scaleX(1f).scaleY(1f).setDuration(160).start();
                        return true;
                }
                return true;
            }
        });
        return card;
    }

    // ═══════════════════════════════════════════════════════════════
    // 이동 · 뒤로 · 수명
    // ═══════════════════════════════════════════════════════════════
    void go(String q) {
        String u = toUrl(q);
        if (u == null) return;
        unfocusOmni();
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

    void reloadOrStop() {
        WebView w = curWeb();
        if (w == null) return;
        if (prog.getVisibility() == View.VISIBLE) w.stopLoading();
        else if (isNtpUrl(w.getUrl())) loadNtp(w);
        else w.reload();
    }

    /** 뒤로가기: 탭 목록 → 주소 입력 → 찾기 → 페이지 뒤로 → (새 창 탭이면) 닫고 연 탭으로 → '크게'면 반반. 처리했으면 true. */
    boolean handleBack() {
        if (openPopup != null && openPopup.isShowing()) { openPopup.dismiss(); return true; }
        if (switcherOpen) { closeSwitcherTo(-1); return true; }
        if (addr.getVisibility() == View.VISIBLE) { unfocusOmni(); return true; }
        if (findOpen) { closeFind(); return true; }
        WebView w = curWeb();
        if (w != null && w.canGoBack()) { w.goBack(); return true; }
        Tab t = curTab();
        if (t != null && t.opener != null && tabs.contains(t.opener)) {
            Tab op = t.opener;
            closeTab(cur, false);
            switchTo(tabs.indexOf(op));
            return true;
        }
        if (host.browserMode() == 2) { host.setBrowserMode(1); return true; }
        return false;
    }

    void syncMode(int m) { mode = m; }

    void onPause() { saveTabs(); for (Tab t : tabs) if (t.w != null) t.w.onPause(); }
    void onResume() { WebView w = curWeb(); if (w != null && host.browserMode() != 0) w.onResume(); }
    void hidden() { unfocusOmni(); for (Tab t : tabs) if (t.w != null) t.w.onPause(); saveTabs(); }
    void destroy() { for (Tab t : tabs) if (t.w != null) { t.w.destroy(); t.w = null; } }

    // ═══════════════════════════════════════════════════════════════
    // WebView 하나(탭 하나)
    // ═══════════════════════════════════════════════════════════════
    WebView makeWeb(final Tab t) {
        final WebView w = new WebView(act);
        //  ⚠ 배경을 안 정한 사이트는 흰 바탕이어야 한다(크롬도 그렇다) — 어두운 테마 색을 깔면 검은 글자가 안 보였다(가상 기기 실측).
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
        s.setSupportMultipleWindows(true);                   // target=_blank → 새 탭(onCreateWindow)
        s.setJavaScriptCanOpenWindowsAutomatically(false);   // 팝업은 사람이 눌렀을 때만
        applyUa(w);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, true);
        w.setOverScrollMode(View.OVER_SCROLL_NEVER);          // 맨 위 당기기는 새로고침 동그라미가 맡는다
        //  ⚠ PLNative 를 달지 않는다(클래스 주석)

        w.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String sc = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
                if (sc.equals("plfocus")) { if (v == curWeb()) focusOmni(); return true; }   // 새 탭 화면의 검색 상자
                if (sc.equals("http") || sc.equals("https")) return false;
                if (sc.equals("about") || sc.equals("data") || sc.equals("blob") || sc.equals("javascript")) return false;
                //  intent: · market: · tel: … — 사람이 누른 것만 밖으로(페이지가 몰래 앱을 열지 못하게)
                if (r.hasGesture()) host.openOutside(u);
                return true;
            }
            @Override public void onPageStarted(WebView v, String url, Bitmap fav) {
                v.setBackgroundColor(isNtpUrl(url) ? cPage : Color.WHITE);   // 새 탭 화면은 테마색, 사이트는 흰 바탕
                if (v == curWeb()) { prog.setProgress(5); prog.setVisibility(isNtpUrl(url) ? View.INVISIBLE : View.VISIBLE); setChromeShown(true); syncBar(); }
                injectFlags(v);
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (v == curWeb()) { prog.setVisibility(View.INVISIBLE); endRefresh(); syncBar(); updateStrip(); }
                injectFlags(v);
                if (isWeb(url)) { t.url = url; t.title = v.getTitle() == null ? "" : v.getTitle(); addHistory(url, v.getTitle()); saveTabs(); }
                else if (isNtpUrl(url)) { t.url = NTP; t.title = ""; }
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
            @Override public void onProgressChanged(WebView v, int p) { if (v == curWeb()) prog.setProgress(Math.max(5, p)); }
            @Override public void onReceivedTitle(WebView v, String title) { if (!isNtpUrl(v.getUrl())) t.title = title == null ? "" : title; if (tablet) updateStrip(); }
            @Override public boolean onCreateWindow(WebView v, boolean dialog, boolean gesture, Message msg) {
                if (!gesture) return false;   // 사람이 안 누른 팝업은 막는다
                Tab nt = newTab(null, false);
                if (nt == null) return false;
                nt.url = "about:blank";
                nt.opener = t;
                nt.w = makeWeb(nt);           // 먼저 만들어 둬야 show() 가 새 탭 화면을 열지 않는다
                ((WebView.WebViewTransport) msg.obj).setWebView(nt.w);
                msg.sendToTarget();
                switchTo(tabs.indexOf(nt));
                return true;
            }
            @Override public void onCloseWindow(WebView v) {
                for (int i = 0; i < tabs.size(); i++) if (tabs.get(i).w == v) { closeTab(i, false); break; }
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
                host.overlay().addView(view, new FrameLayout.LayoutParams(-1, -1));
            }
            @Override public void onHideCustomView() {
                if (custom == null) return;
                host.overlay().removeView(custom);
                custom = null;
                if (customCb != null) customCb.onCustomViewHidden();
                customCb = null;
            }
        });

        w.setFindListener((active, count, done) -> {
            if (w != curWeb() || !findOpen) return;
            findCount.setText(count == 0 ? (findEdit.length() > 0 ? "0/0" : "") : (active + 1) + "/" + count);
        });

        w.setOnScrollChangeListener((v, x, y, ox, oy) -> {
            if (v != curWeb() || ptrActive) return;
            int d = y - oy;
            if (y <= px(4)) setChromeShown(true);
            else if (d > px(3) && y > px(58)) setChromeShown(false);
            else if (d < -px(3)) setChromeShown(true);
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
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) {
                t.lastX = Math.round(e.getX()); t.lastY = Math.round(e.getY());
                if (addr.getVisibility() == View.VISIBLE) unfocusOmni();   // 페이지를 누르면 주소 입력을 닫는다(크롬처럼)
            }
            gd.onTouchEvent(e);
            ptrTouch(t, w, e);
            return false;   // 스크롤·확대는 WebView 가 그대로 한다
        });
        w.setOnLongClickListener(v -> {
            WebView.HitTestResult h = w.getHitTestResult();
            int ty = h == null ? 0 : h.getType();
            boolean img = ty == WebView.HitTestResult.IMAGE_TYPE || ty == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE;
            if (!img && ty == WebView.HitTestResult.SRC_ANCHOR_TYPE && h.getExtra() != null) {
                linkMenu(t, w, h.getExtra());   // 크롬 링크 메뉴
                return true;
            }
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

    void setPick(boolean on) {
        pick = on;
        sp.edit().putBoolean("pick", on).apply();
        syncPick();
        for (Tab t : tabs) if (t.w != null) injectFlags(t.w);
        flash(on ? "🎯 집기 모드 — 그림을 톡 탭하면 바로 넣어요 (링크는 안 열려요)" : "집기 모드 끔 — 그림은 꾹 눌러서 넣어요", 2600, null, null);
    }

    void setDesktop(boolean on) {
        desktop = on;
        sp.edit().putBoolean("desktop", on).apply();
        for (Tab t : tabs) if (t.w != null) applyUa(t.w);
        WebView w = curWeb();
        if (w != null) w.reload();
    }

    // ═══════════════════════════════════════════════════════════════
    // 새 탭 화면 — 크롬처럼 검색 상자 + 자주 간 사이트
    // ═══════════════════════════════════════════════════════════════
    void loadNtp(WebView w) {
        String bg = hex(cPage), fg = hex(cFg), box = hex(cOmni), dim = hex(cDim);
        StringBuilder tiles = new StringBuilder();
        for (String[] s : topSites(8)) {
            String h = s[0];
            tiles.append("<a href=\"").append(esc(s[1])).append("\"><span class=ic><img src=\"https://www.google.com/s2/favicons?sz=64&domain=")
                 .append(esc(h)).append("\" onerror=\"this.remove()\"><b>").append(esc(h.substring(0, 1).toUpperCase())).append("</b></span><span class=t>")
                 .append(esc(s[2])).append("</span></a>");
        }
        String html = "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>새 탭</title><style>"
            + "body{margin:0;font-family:sans-serif;background:" + bg + ";color:" + fg + ";display:flex;flex-direction:column;align-items:center;padding:14vh 16px 40px}"
            + ".logo{font:500 56px/1 'Product Sans',sans-serif;letter-spacing:-2px}.logo span:nth-child(1){color:#4285f4}.logo span:nth-child(2){color:#ea4335}"
            + ".logo span:nth-child(3){color:#fbbc05}.logo span:nth-child(4){color:#4285f4}.logo span:nth-child(5){color:#34a853}.logo span:nth-child(6){color:#ea4335}"
            + ".box{display:flex;align-items:center;gap:12px;width:min(560px,100%);box-sizing:border-box;margin:28px 0 30px;padding:0 20px;height:52px;border-radius:26px;background:" + box + ";color:" + dim + ";text-decoration:none;font-size:16px}"
            + ".box svg{width:20px;height:20px;flex:none}"
            + ".tiles{display:grid;grid-template-columns:repeat(4,76px);gap:18px 8px;justify-content:center}"
            + "a{color:" + fg + ";text-decoration:none;text-align:center;font-size:12px}"
            + ".ic{position:relative;width:52px;height:52px;border-radius:50%;background:" + box + ";margin:0 auto 8px;display:flex;align-items:center;justify-content:center;overflow:hidden}"
            + ".ic img{position:absolute;width:26px;height:26px}.ic b{font-size:18px;color:" + dim + "}.ic img+b{visibility:hidden}"
            + ".t{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style>"
            + "<div class=logo><span>G</span><span>o</span><span>o</span><span>g</span><span>l</span><span>e</span></div>"
            + "<a class=box href=\"plfocus:\"><svg viewBox=\"0 0 24 24\" fill=none stroke=\"" + dim + "\" stroke-width=2 stroke-linecap=round><circle cx=10.5 cy=10.5 r=6 /><path d=\"M15 15l5 5\"/></svg>검색어 또는 URL 입력</a>"
            + "<div class=tiles>" + tiles + "</div>";
        w.setBackgroundColor(cPage);
        w.loadDataWithBaseURL(NTP_BASE, html, "text/html", "utf-8", null);
    }

    static String hex(int c) { return String.format("#%06x", c & 0xffffff); }
    static String esc(String s) { return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;"); }

    /** 자주 간 사이트 — 방문 기록에서 도메인별로 센다. {도메인, 주소, 이름} */
    ArrayList<String[]> topSites(int n) {
        JSONArray a = loadArr("hist");
        Map<String, Integer> cnt = new HashMap<>();
        Map<String, String[]> first = new HashMap<>();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o == null) continue;
            String u = o.optString("u");
            String h = hostOf(u);
            if (h == null || h.isEmpty() || !isWeb(u)) continue;
            String hh = h.startsWith("www.") ? h.substring(4) : h;
            cnt.put(hh, (cnt.containsKey(hh) ? cnt.get(hh) : 0) + 1);
            if (!first.containsKey(hh)) {
                Uri p = Uri.parse(u);
                String name = o.optString("t");
                if (name.isEmpty() || name.length() > 14) name = hh;
                first.put(hh, new String[]{hh, p.getScheme() + "://" + h + "/", name});
            }
        }
        ArrayList<String> keys = new ArrayList<>(cnt.keySet());
        keys.sort((x, y) -> cnt.get(y) - cnt.get(x));
        ArrayList<String[]> out = new ArrayList<>();
        for (int i = 0; i < keys.size() && out.size() < n; i++) out.add(first.get(keys.get(i)));
        return out;
    }

    // ═══════════════════════════════════════════════════════════════
    // ⋮ 메뉴 — 크롬처럼 맨 위 아이콘 줄 + 목록
    // ═══════════════════════════════════════════════════════════════
    void showMenu() {
        WebView w = curWeb();
        final String u = w != null ? w.getUrl() : null;
        final boolean web = u != null && isWeb(u);
        boolean marked = web && bookmarkIndex(u) >= 0;
        LinearLayout box = new LinearLayout(act);
        box.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(cMenu);
        bg.setCornerRadius(px(12));
        box.setBackground(bg);
        box.setPadding(0, px(4), 0, px(8));
        final PopupWindow pw = new PopupWindow(box, px(280), -2, true);
        LinearLayout top = new LinearLayout(act);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setPadding(px(6), 0, px(6), 0);
        Object[][] icons = {
                {Ico.FWD, "앞으로", w != null && w.canGoForward()},
                {marked ? Ico.STAR_ON : Ico.STAR, marked ? "북마크 수정" : "북마크에 추가", web},
                {Ico.INFO, "페이지 정보", true},
                {prog.getVisibility() == View.VISIBLE ? Ico.CLOSE : Ico.REFRESH, "새로고침", true},
                {host.browserMode() == 2 ? Ico.COLLAPSE : Ico.EXPAND, host.browserMode() == 2 ? "반반으로" : "브라우저 크게", true},
        };
        for (int i = 0; i < icons.length; i++) {
            final int idx = i;
            ImageView b = iconBtn((Integer) icons[i][0], (String) icons[i][1], 48);
            ((Ico) b.getDrawable()).setColor(i == 1 && marked ? cAccent : cFg);
            boolean en = (Boolean) icons[i][2];
            b.setEnabled(en); b.setAlpha(en ? 1f : 0.38f);
            b.setOnClickListener(v -> {
                pw.dismiss();
                WebView cw = curWeb();
                switch (idx) {
                    case 0: if (cw != null) cw.goForward(); break;
                    case 1: toggleBookmark(); break;
                    case 2: pageInfo(); break;
                    case 3: reloadOrStop(); break;
                    case 4: host.setBrowserMode(host.browserMode() == 2 ? 1 : 2); break;
                }
            });
            top.addView(b, new LinearLayout.LayoutParams(0, px(52), 1f));
        }
        ScrollView sv = new ScrollView(act);
        LinearLayout inner = new LinearLayout(act);
        inner.setOrientation(LinearLayout.VERTICAL);
        // (위에서 만든 줄들을 스크롤 안으로 옮긴다 — 화면이 낮으면 메뉴가 잘리지 않게)
        rebuildInto(inner, top, box, pw, web, marked, u);
        sv.addView(inner);
        box.addView(sv);
        showPopup(pw, bMenu, box);
    }

    //  메뉴 줄을 다시 만든다(스크롤 칸 안에) — showMenu 의 내용과 같다
    void rebuildInto(LinearLayout inner, LinearLayout top, LinearLayout box, PopupWindow pw, boolean web, boolean marked, String u) {
        inner.addView(top);
        divider(inner);
        menuRow(inner, pw, Ico.NEWTAB, "새 탭", null, () -> newTab(null, true));
        menuRow(inner, pw, Ico.CLOCK, "기록", null, this::showHistory);
        menuRow(inner, pw, Ico.BOOKMARKS, "북마크", null, this::showBookmarks);
        menuRow(inner, pw, Ico.GRID, "최근에 닫은 탭", null, this::showClosed);
        divider(inner);
        if (web) menuRow(inner, pw, Ico.SHARE, "공유…", null, () -> share(u));
        menuRow(inner, pw, Ico.SEARCH, "페이지에서 찾기", null, this::openFind);
        menuRow(inner, pw, Ico.DESKTOP, "데스크톱 사이트", desktop, () -> setDesktop(!desktop));
        menuRow(inner, pw, Ico.BAR_BOTTOM, barBottom ? "주소 표시줄을 위로" : "주소 표시줄을 아래로", null, () -> setBarBottom(!barBottom));
        divider(inner);
        menuRow(inner, pw, Ico.TARGET, "집기 모드 (톡 탭 = 넣기)", pick, () -> setPick(!pick));
        menuRow(inner, pw, Ico.SPLIT, "화면 나누기 방식…", null, () -> host.showSplitMenu(bMenu));
        if (web) menuRow(inner, pw, Ico.OPEN_OUT, "다른 브라우저로 열기", null, () -> host.openOutside(Uri.parse(u)));
        menuRow(inner, pw, Ico.TRASH, "방문 기록 삭제", null, this::clearHistory);
        menuRow(inner, pw, Ico.CLOSE, "둘러보기 닫기", null, () -> host.setBrowserMode(0));
    }

    void divider(LinearLayout box) {
        View d = new View(act);
        d.setBackgroundColor(cDivider);
        LinearLayout.LayoutParams l = new LinearLayout.LayoutParams(-1, Math.max(1, px(1)));
        l.setMargins(0, px(4), 0, px(4));
        box.addView(d, l);
    }

    void menuRow(LinearLayout box, PopupWindow pw, int icon, String label, Boolean checked, Runnable run) {
        LinearLayout r = new LinearLayout(act);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(px(18), 0, px(14), 0);
        r.setClickable(true);
        r.setBackground(new android.graphics.drawable.RippleDrawable(ColorStateList.valueOf(light ? 0x14000000 : 0x22ffffff), null, new android.graphics.drawable.ColorDrawable(Color.WHITE)));
        ImageView ic = new ImageView(act);
        ic.setImageDrawable(new Ico(icon, cFg, px(22)));
        r.addView(ic, new LinearLayout.LayoutParams(px(22), px(22)));
        TextView t = new TextView(act);
        t.setText(label); t.setTextColor(cFg); t.setTextSize(15);
        t.setPadding(px(18), 0, px(8), 0);
        r.addView(t, new LinearLayout.LayoutParams(0, -2, 1f));
        if (checked != null) {
            ImageView cb = new ImageView(act);
            GradientDrawable sq = new GradientDrawable();
            sq.setCornerRadius(px(3));
            if (checked) { sq.setColor(cAccent); cb.setImageDrawable(new Ico(Ico.CHECK, light ? Color.WHITE : 0xff1f1f1f, px(18))); }
            else sq.setStroke(px(2), cDim);
            cb.setBackground(sq);
            cb.setScaleType(ImageView.ScaleType.CENTER);
            r.addView(cb, new LinearLayout.LayoutParams(px(20), px(20)));
        }
        r.setOnClickListener(v -> { pw.dismiss(); run.run(); });
        box.addView(r, new LinearLayout.LayoutParams(-1, px(48)));
    }

    /** 크롬처럼 단추 자리에 겹쳐 연다(주소창이 아래면 위로 펼친다). 화면 밖으로 안 나가게. */
    void showPopup(PopupWindow pw, View anchor, View box) {
        pw.setElevation(px(8));
        pw.setOutsideTouchable(true);
        pw.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));
        int[] a = new int[2]; anchor.getLocationOnScreen(a);
        View rootView = act.getWindow().getDecorView();
        int sw = rootView.getWidth(), sh = rootView.getHeight();
        box.measure(View.MeasureSpec.makeMeasureSpec(pw.getWidth() > 0 ? pw.getWidth() : px(280), View.MeasureSpec.AT_MOST), View.MeasureSpec.makeMeasureSpec(sh, View.MeasureSpec.AT_MOST));
        int mw = pw.getWidth() > 0 ? pw.getWidth() : box.getMeasuredWidth();
        int mh = Math.min(box.getMeasuredHeight(), sh - px(48));
        pw.setHeight(mh);
        int x = Math.max(px(4), Math.min(sw - mw - px(4), a[0] + anchor.getWidth() - mw));
        int y = barBottom ? a[1] + anchor.getHeight() - mh : a[1];
        y = Math.max(px(24), Math.min(sh - mh - px(8), y));
        openPopup = pw;
        pw.showAtLocation(root, Gravity.TOP | Gravity.START, x, y);
    }

    /** 짧은 목록 팝업(탭 단추 꾹·주소창 꾹·탭 목록 ⋮). */
    void popupList(View anchor, String[] items, IntCb cb) {
        LinearLayout box = new LinearLayout(act);
        box.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(cMenu);
        bg.setCornerRadius(px(10));
        box.setBackground(bg);
        box.setPadding(0, px(6), 0, px(6));
        final PopupWindow pw = new PopupWindow(box, px(240), -2, true);
        for (int i = 0; i < items.length; i++) {
            final int idx = i;
            TextView t = new TextView(act);
            t.setText(items[i]); t.setTextColor(cFg); t.setTextSize(15);
            t.setGravity(Gravity.CENTER_VERTICAL);
            t.setPadding(px(18), 0, px(18), 0);
            t.setClickable(true);
            t.setBackground(new android.graphics.drawable.RippleDrawable(ColorStateList.valueOf(light ? 0x14000000 : 0x22ffffff), null, new android.graphics.drawable.ColorDrawable(Color.WHITE)));
            t.setOnClickListener(v -> { pw.dismiss(); cb.run(idx); });
            box.addView(t, new LinearLayout.LayoutParams(-1, px(48)));
        }
        showPopup(pw, anchor, box);
    }

    int dlgTheme() { return light ? android.R.style.Theme_DeviceDefault_Light_Dialog_Alert : android.R.style.Theme_DeviceDefault_Dialog_Alert; }
    AlertDialog.Builder dlg(String title) { return new AlertDialog.Builder(act, dlgTheme()).setTitle(title); }

    void pageInfo() {
        WebView w = curWeb();
        final String u = w != null ? w.getUrl() : null;
        if (u == null || isNtpUrl(u)) return;
        boolean https = u.startsWith("https://");
        dlg(hostOf(u)).setMessage((https ? "🔒 연결이 안전합니다\n\n" : "⚠ 주의 요함 — 암호화되지 않은 연결이에요\n\n") + u)
                .setPositiveButton("링크 복사", (d, i) -> { copy(u); flash("링크를 복사했어요", 1600, null, null); })
                .setNegativeButton("닫기", null).show();
    }

    void copy(String s) {
        try { ((ClipboardManager) act.getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("링크", s)); } catch (Exception ignored) { }
    }

    void share(String u) {
        try {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_TEXT, u);
            act.startActivity(Intent.createChooser(i, "공유"));
        } catch (Exception ignored) { }
    }

    /** 링크 꾹 — 크롬 링크 메뉴(맨 위에 주소, 그 아래 항목). */
    void linkMenu(Tab t, WebView w, final String url) {
        w.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
        String[] items = {"새 탭에서 열기", "링크 주소 복사", "링크 공유", "다른 브라우저로 열기"};
        TextView head = new TextView(act);
        head.setText(url);
        head.setTextColor(cDim);
        head.setTextSize(13);
        head.setMaxLines(2);
        head.setEllipsize(TextUtils.TruncateAt.END);
        head.setPadding(px(24), px(20), px(24), px(8));
        new AlertDialog.Builder(act, dlgTheme()).setCustomTitle(head).setItems(items, (d, i) -> {
            switch (i) {
                case 0: {
                    Tab nt = newTab(url, false);
                    if (nt != null) { nt.opener = t; final Tab fnt = nt; flash("새 탭에서 열렸어요", 4000, "보기", () -> switchTo(tabs.indexOf(fnt))); }
                    break;
                }
                case 1: copy(url); flash("링크를 복사했어요", 1600, null, null); break;
                case 2: share(url); break;
                case 3: host.openOutside(Uri.parse(url)); break;
            }
        }).show();
    }

    void showClosed() {
        if (closed.isEmpty()) { flash("최근에 닫은 탭이 없어요", 1600, null, null); return; }
        final ArrayList<String[]> list = new ArrayList<>(closed);
        String[] items = new String[list.size()];
        for (int i = 0; i < list.size(); i++) { String[] c = list.get(i); items[i] = NTP.equals(c[0]) ? "새 탭" : (c[1].isEmpty() ? hostOf(c[0]) : c[1]); }
        dlg("최근에 닫은 탭").setItems(items, (d, i) -> {
            String[] c = list.get(i);
            closed.remove(c);
            closed.push(c);
            reopenClosed();
        }).setNegativeButton("닫기", null).show();
    }

    // ── 페이지에서 찾기 ──
    void openFind() {
        WebView w = curWeb();
        if (w == null) return;
        findOpen = true;
        unfocusOmni();
        setChromeShown(false);
        findBar.setVisibility(View.VISIBLE);
        stripRow.setVisibility(View.GONE);
        findEdit.setText("");
        findCount.setText("");
        findEdit.requestFocus();
        try { ((InputMethodManager) act.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(findEdit, InputMethodManager.SHOW_IMPLICIT); } catch (Exception ignored) { }
    }

    void closeFind() {
        if (!findOpen) return;
        findOpen = false;
        WebView w = curWeb();
        if (w != null) w.clearMatches();
        findBar.setVisibility(View.GONE);
        hideKeyboard();
        setChromeShown(true);
        syncBar();
    }

    // ── 알림(크롬 스낵바) ──
    final Runnable hideSnack = () -> { if (Browser.this.snack != null) Browser.this.snack.setVisibility(View.GONE); };

    void flash(String msg, int ms) { flash(msg, ms, null, null); }

    /** 크롬 스낵바 — 아래쪽 띠 + 오른쪽 실행 글자(실행취소·보기). */
    void flash(String msg, int ms, String action, Runnable run) {
        SpannableStringBuilder sb = new SpannableStringBuilder(msg);
        if (action != null) {
            sb.append("      ");
            int a = sb.length();
            sb.append(action);
            sb.setSpan(new ForegroundColorSpan(light ? 0xffa8c7fa : 0xff0b57d0), a, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            sb.setSpan(new android.text.style.StyleSpan(Typeface.BOLD), a, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        snack.setText(sb);
        snack.setOnClickListener(action == null ? null : v -> { snack.setVisibility(View.GONE); run.run(); });
        snack.setClickable(action != null);
        FrameLayout.LayoutParams l = (FrameLayout.LayoutParams) snack.getLayoutParams();
        l.bottomMargin = (barBottom && !switcherOpen && chromeShown) ? px(64) : px(8);
        snack.setLayoutParams(l);
        snack.setVisibility(View.VISIBLE);
        snack.bringToFront();
        ui.removeCallbacks(hideSnack);
        if (ms > 0) ui.postDelayed(hideSnack, ms);
    }

    // ═══════════════════════════════════════════════════════════════
    // 그림 찾기 · 받기 (앱 1.2 그대로)
    // ═══════════════════════════════════════════════════════════════
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



    // ═══════════════════════════════════════════════════════════════
    // 북마크 · 기록
    // ═══════════════════════════════════════════════════════════════
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
            if (i >= 0) { a.remove(i); flash("북마크에서 삭제했어요", 1600, null, null); }
            else {
                JSONObject o = new JSONObject(); o.put("u", u); o.put("t", w.getTitle() == null ? hostOf(u) : w.getTitle());
                JSONArray n = new JSONArray(); n.put(o); for (int k = 0; k < a.length() && k < 199; k++) n.put(a.get(k)); a = n;
                flash("북마크에 추가했어요", 1600, null, null);
            }
        } catch (Exception ignored) { }
        sp.edit().putString("marks", a.toString()).apply();
    }

    void showBookmarks() {
        final JSONArray a = loadArr("marks");
        if (a.length() == 0) { flash("북마크가 없어요 — ⋮ 메뉴 맨 위의 ☆ 로 추가해요", 2600, null, null); return; }
        String[] items = new String[a.length()];
        for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); items[i] = o == null ? "?" : o.optString("t", o.optString("u")) + "\n" + hostOf(o.optString("u")); }
        AlertDialog d = dlg("북마크  (꾹 누르면 삭제)")
                .setItems(items, (di, i) -> { JSONObject o = a.optJSONObject(i); if (o != null) go(o.optString("u")); })
                .setNegativeButton("닫기", null).create();
        d.show();
        d.getListView().setOnItemLongClickListener((p, v, i, id) -> {
            a.remove(i); sp.edit().putString("marks", a.toString()).apply(); d.dismiss(); flash("북마크에서 삭제했어요", 1600, null, null); return true;
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
        if (a.length() == 0) { flash("방문 기록이 없어요", 1600, null, null); return; }
        int n = Math.min(a.length(), 150);
        String[] items = new String[n];
        for (int i = 0; i < n; i++) { JSONObject o = a.optJSONObject(i); items[i] = o == null ? "?" : o.optString("t") + "\n" + hostOf(o.optString("u")); }
        dlg("기록").setItems(items, (di, i) -> { JSONObject o = a.optJSONObject(i); if (o != null) go(o.optString("u")); })
                .setNegativeButton("닫기", null).show();
    }

    void clearHistory() {
        dlg("방문 기록 삭제").setMessage("둘러보기의 방문 기록을 모두 지울까요? 북마크·로그인은 그대로예요.")
                .setPositiveButton("삭제", (di, i) -> {
                    sp.edit().remove("hist").apply();
                    for (Tab t : tabs) if (t.w != null) t.w.clearHistory();
                    flash("방문 기록을 지웠어요", 1600, null, null);
                })
                .setNegativeButton("취소", null).show();
    }
}
