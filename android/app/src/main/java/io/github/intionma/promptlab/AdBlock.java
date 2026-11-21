package io.github.intionma.promptlab;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 🌐 둘러보기 광고 차단 (앱 1.5 — 사용자 요청). 늘 켜져 있고 설정 화면이 없다. 끄는 건 ⋮ 메뉴의 「이 사이트에서 광고 차단 끄기」뿐.
 *
 *  · 막는 곳: 둘러보기 WebView 의 shouldInterceptRequest — 요청 주소의 도메인(또는 그 윗단계)이 목록에 있으면 빈 응답.
 *    ⚠ **주 문서(내가 연 페이지 자체)는 막지 않는다.** 목록에 있는 사이트라도 사용자가 직접 가면 열린다.
 *  · 목록: APK 에 실린 assets/adblock-hosts.txt → 며칠마다 백그라운드로 새로 받아 앱 전용 저장소(files/)에 둔다.
 *    받기에 실패하면 지난번 받은 것, 그것도 없으면 실린 것을 그대로 쓴다.
 *  · 랩(프롬프트 랩 본체) WebView 에는 걸지 않는다 — 둘러보기 탭에만.
 *
 * ⚠ shouldInterceptRequest 는 **백그라운드 스레드**에서 요청마다 불린다 → 목록·꺼 둔 사이트는 volatile 로 통째로 바꿔 끼우는
 *   불변 집합이다(잠금 없음). 판정은 HashSet 조회 몇 번(AdBlockCore.match).
 */
final class AdBlock {
    static final String ASSET = "adblock-hosts.txt";
    static final String FILE = "adblock-hosts.txt";
    static final long UPDATE_EVERY = 4L * 24 * 3600 * 1000;   // 성공하면 4일 뒤에 다시
    static final long RETRY_AFTER = 12L * 3600 * 1000;        // 실패하면 12시간 뒤에 다시

    /**
     * 빈 자리로 남는 광고 칸을 숨기는 CSS — **확실히 광고 칸인 것만** 적는다(넓게 잡으면 사이트 모양이 깨진다).
     * 일반 단어(.ad · .banner · [class*=ad])는 일부러 안 넣었다 — 'head'·'shadow'·'download' 같은 이름까지 걸린다.
     */
    static final String CSS =
            "ins.adsbygoogle,.adsbygoogle,div[id^=\"div-gpt-ad\"],div[id^=\"google_ads_iframe\"],iframe[id^=\"google_ads_iframe\"],"
            + "div[data-google-query-id],iframe[src*=\"googlesyndication.com\"],iframe[src*=\"doubleclick.net\"],iframe[src*=\"amazon-adsystem.com\"],"
            + "iframe[src*=\"adnxs.com\"],iframe[src*=\"criteo.\"],iframe[src*=\"taboola.com\"],iframe[src*=\"outbrain.com\"],"
            + "amp-ad,amp-sticky-ad,amp-embed[type=\"taboola\"],amp-embed[type=\"outbrain\"],div[id^=\"taboola-\"],.trc_related_container,.OUTBRAIN"
            + "{display:none!important}";

    static final String CSS_JS = "(function(){try{if(document.getElementById('__plAdCss'))return;var s=document.createElement('style');"
            + "s.id='__plAdCss';s.textContent=" + org.json.JSONObject.quote(CSS) + ";(document.head||document.documentElement).appendChild(s);}catch(e){}})()";

    static volatile Set<String> list = Collections.emptySet();
    static volatile Set<String> off = Collections.emptySet();   // 광고 차단을 꺼 둔 사이트(www. 뗀 도메인)
    static volatile String source = "";                          // "bundled" | "updated" — 쪽 정보에 보여 준다
    static SharedPreferences sp;
    static Context app;
    static final AtomicBoolean updating = new AtomicBoolean(false);
    static boolean inited;

    private AdBlock() { }

    /** 둘러보기를 만들 때 한 번. 목록 읽기는 백그라운드(읽기 전에는 아무것도 안 막는다 — 잠깐이다). */
    static synchronized void init(Context c) {
        if (inited) return;
        inited = true;
        app = c.getApplicationContext();
        sp = app.getSharedPreferences("adblock", Context.MODE_PRIVATE);
        off = Collections.unmodifiableSet(new HashSet<>(sp.getStringSet("off", Collections.emptySet())));
        new Thread(() -> { load(); maybeUpdate(); }, "adblock-load").start();
    }

    static void load() {
        File f = new File(app.getFilesDir(), FILE);
        if (f.exists()) {
            try (InputStream in = new FileInputStream(f)) {
                Set<String> s = AdBlockCore.readFile(in);
                if (s.size() >= AdBlockCore.MIN_DOMAINS) { list = Collections.unmodifiableSet(s); source = "updated"; return; }
            } catch (Exception ignored) { }
        }
        try (InputStream in = app.getAssets().open(ASSET)) {
            list = Collections.unmodifiableSet(AdBlockCore.readFile(in));
            source = "bundled";
        } catch (Exception ignored) { }
    }

    /** 며칠에 한 번만 받는다. 둘러보기를 열 때마다 불러도 시간만 보고 바로 끝난다. */
    static void maybeUpdate() {
        if (sp == null) return;
        long now = System.currentTimeMillis();
        long ok = sp.getLong("okAt", 0), tried = sp.getLong("triedAt", 0);
        if (now - ok < UPDATE_EVERY || now - tried < RETRY_AFTER) return;
        if (!updating.compareAndSet(false, true)) return;
        sp.edit().putLong("triedAt", now).apply();
        new Thread(() -> {
            try {
                ArrayList<String> got = AdBlockCore.download();
                AdBlockCore.write(new File(app.getFilesDir(), FILE), got);
                list = Collections.unmodifiableSet(new HashSet<>(got));
                source = "updated";
                sp.edit().putLong("okAt", System.currentTimeMillis()).putInt("count", got.size()).apply();
            } catch (Throwable ignored) {
                //  실패하면 지금 쓰는 목록 그대로 — 다음 기회(12시간 뒤)에 다시
            } finally {
                updating.set(false);
            }
        }, "adblock-update").start();
    }

    static String siteKey(String host) {
        if (host == null) return null;
        String h = host.toLowerCase(Locale.ROOT);
        return h.startsWith("www.") ? h.substring(4) : h;
    }

    /** 이 사이트에서 광고 차단이 켜져 있나. 꺼 둔 것이 'example.com' 이면 'm.example.com' 도 꺼진 것으로 본다. */
    static boolean siteOn(String pageHost) {
        String k = siteKey(pageHost);
        if (k == null) return true;
        Set<String> o = off;
        if (o.isEmpty()) return true;
        for (String e : o) if (AdBlockCore.under(k, e)) return false;
        return true;
    }

    static void setSiteOn(String pageHost, boolean on) {
        String k = siteKey(pageHost);
        if (k == null || sp == null) return;
        HashSet<String> o = new HashSet<>(off);
        if (on) { o.removeIf(e -> AdBlockCore.under(k, e)); }
        else o.add(k);
        off = Collections.unmodifiableSet(o);
        sp.edit().putStringSet("off", new HashSet<>(o)).apply();
    }

    /** 요청 하나를 막을까 — 사이트에서 꺼 뒀으면 안 막고, 나머지는 AdBlockCore 규칙(허용 목록 · 그 사이트 자체는 안 막기). */
    static boolean shouldBlock(String host, String pageHost) {
        if (host == null) return false;
        if (pageHost != null && !siteOn(pageHost)) return false;
        return AdBlockCore.shouldBlock(list, host, pageHost);
    }

    static int count() { return list.size(); }

    static WebResourceResponse empty() {
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-store");
        return new WebResourceResponse("text/plain", "utf-8", 200, "OK", h, new ByteArrayInputStream(new byte[0]));
    }
}
