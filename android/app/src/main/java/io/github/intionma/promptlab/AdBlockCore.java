package io.github.intionma.promptlab;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Reader;
import java.io.StringReader;
import java.io.Writer;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/**
 * 광고 차단(앱 1.5)의 '안드로이드와 무관한' 알맹이 — 도메인 맞추기 · 목록 읽기 · 목록 받기.
 * 안드로이드 API 를 안 쓰므로 컴퓨터의 자바로 그대로 돌려 검사할 수 있다(android/tools/AdBlockCheck.java).
 * 앱에 싣는 목록(assets/adblock-hosts.txt)도 이 파일의 main 으로 만든다 — 앱 안 자동 갱신과 **같은 코드**로 만들어야
 * '번들 목록'과 '받은 목록'이 같은 규칙을 따른다.
 *
 * 목록 출처(전부 재배포 가능한 것만 골랐다 — StevenBlack 통합본에는 비상업 조건(MVPS·someonewhocares)과
 * 라이선스 표기가 없는 것(Peter Lowe)이 섞여 있어서 통합본을 통째로 쓰지 않는다):
 *  · StevenBlack 자체 목록 (MIT)      · AdAway 기본 목록 (CC BY 3.0)
 *  · FadeMind add.2o7Net (MIT)        · FadeMind UncheckyAds (MIT)      · tiuxo ads (CC BY 4.0)
 */
final class AdBlockCore {

    static final String RAW = "https://raw.githubusercontent.com/";
    static final String[][] SOURCES = {
            {RAW + "StevenBlack/hosts/master/data/StevenBlack/hosts", "StevenBlack 자체 목록 — MIT"},
            {RAW + "AdAway/adaway.github.io/master/hosts.txt", "AdAway 기본 목록 — CC BY 3.0 (https://adaway.org/)"},
            {RAW + "FadeMind/hosts.extras/master/add.2o7Net/hosts", "FadeMind add.2o7Net — MIT"},
            {RAW + "FadeMind/hosts.extras/master/UncheckyAds/hosts", "FadeMind UncheckyAds — MIT"},
            {RAW + "tiuxo/hosts/master/ads", "tiuxo hostlist ads — CC BY 4.0"},
    };

    /**
     * 절대 막지 않는 곳 — 이 주소와 그 아래(하위 도메인)는 목록에 무엇이 들어오든 통과시킨다.
     * 사용자가 그림을 받아 오는 곳(이미지 CDN)과 프롬프트 랩 자신 · 목록을 받아 오는 곳.
     */
    static final String[] ALLOW = {
            "intionma.github.io", "cdn.donmai.us", "danbooru.donmai.us", "i.pximg.net", "static.wikia.nocookie.net",
            "raw.githubusercontent.com", "schaledb.com", "blue-utils.me", "sr.yatta.moe", "gi.yatta.moe", "cdn.dak.gg", "sdvxindex.com",
    };

    /** 받은 목록이 이보다 작으면 망가진 것으로 보고 버린다(번들 목록은 약 7천 개). */
    static final int MIN_DOMAINS = 3000;
    /** 출처 하나당 받는 최대 크기 — 이상한 응답에 메모리를 다 쓰지 않게. */
    static final int MAX_BYTES = 8 << 20;

    private AdBlockCore() { }

    /** 소문자로, 끝의 점을 떼고, 도메인 모양이 아니면 null. */
    static String norm(String h) {
        if (h == null) return null;
        h = h.trim().toLowerCase(Locale.ROOT);
        while (h.endsWith(".")) h = h.substring(0, h.length() - 1);
        if (h.isEmpty() || h.indexOf('.') < 0 || h.length() > 253) return null;
        for (int i = 0; i < h.length(); i++) {
            char c = h.charAt(i);
            if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.')) return null;
        }
        if (h.startsWith(".") || h.contains("..")) return null;
        if (h.equals("localhost.localdomain") || h.equals("0.0.0.0")) return null;
        return h;
    }

    /** hosts 형식("0.0.0.0 a.com b.com")과 한 줄 한 도메인 형식을 둘 다 읽는다. '#' 뒤는 주석. */
    static int parse(Reader r, Set<String> into) throws IOException {
        BufferedReader br = new BufferedReader(r);
        String line;
        int n = 0;
        while ((line = br.readLine()) != null) {
            int hash = line.indexOf('#');
            if (hash >= 0) line = line.substring(0, hash);
            line = line.trim();
            if (line.isEmpty()) continue;
            String[] p = line.split("\\s+");
            int from = 0;
            if (p[0].equals("0.0.0.0") || p[0].equals("127.0.0.1") || p[0].equals("::") || p[0].equals("::1")) from = 1;
            else if (p.length > 1) continue;                 // 다른 IP 로 돌리는 줄 등 — 모르는 형식은 건너뛴다
            for (int i = from; i < p.length; i++) {
                String h = norm(p[i]);
                if (h == null) continue;
                if (into.add(h)) n++;
            }
        }
        return n;
    }

    /** host 가 entry 이거나 그 하위 도메인인가. */
    static boolean under(String host, String entry) {
        return host.equals(entry) || (host.length() > entry.length() && host.endsWith(entry) && host.charAt(host.length() - entry.length() - 1) == '.');
    }

    static boolean allowed(String host) {
        if (host == null) return false;
        for (String a : ALLOW) if (under(host, a)) return true;
        return false;
    }

    /**
     * 목록에서 host 를 덮는 항목을 찾는다 — host 자신, 그다음 윗단계 도메인을 차례로(a.b.ads.com → b.ads.com → ads.com).
     * 맨 끝(com) 한 단은 안 본다. HashSet 조회 몇 번이라 요청마다 불러도 된다.
     */
    static String match(Set<String> set, String host) {
        if (host == null || set.isEmpty()) return null;
        String h = host.toLowerCase(Locale.ROOT);
        while (h.endsWith(".")) h = h.substring(0, h.length() - 1);
        int i = 0;
        while (true) {
            String s = i == 0 ? h : h.substring(i);
            if (s.indexOf('.') < 0) return null;
            if (set.contains(s)) return s;
            int d = h.indexOf('.', i);
            if (d < 0) return null;
            i = d + 1;
        }
    }

    /**
     * 이 요청을 막을까. ① 허용 목록이 이긴다 ② 목록에 있어야 한다
     * ③ 지금 보는 페이지 자체가 그 항목 아래면 막지 않는다 — 사용자가 일부러 그 사이트에 간 것이다(막으면 그 사이트가 통째로 깨진다).
     */
    static boolean shouldBlock(Set<String> set, String host, String pageHost) {
        if (host == null) return false;
        String h = host.toLowerCase(Locale.ROOT);
        if (allowed(h)) return false;
        String e = match(set, h);
        if (e == null) return false;
        if (pageHost != null && under(pageHost.toLowerCase(Locale.ROOT), e)) return false;
        return true;
    }

    /** 윗단계가 이미 있는 항목은 빼고(윗단계로 다 걸린다), 허용 목록과 부딪히는 항목도 빼서 정렬한다. */
    static ArrayList<String> reduce(Set<String> all) {
        ArrayList<String> out = new ArrayList<>();
        for (String h : all) {
            boolean covered = false;
            int d = h.indexOf('.');
            while (d >= 0) {
                String p = h.substring(d + 1);
                if (p.indexOf('.') < 0) break;
                if (all.contains(p)) { covered = true; break; }
                d = h.indexOf('.', d + 1);
            }
            if (covered) continue;
            boolean clash = false;
            for (String a : ALLOW) if (under(h, a) || under(a, h)) { clash = true; break; }
            if (clash) continue;
            out.add(h);
        }
        Collections.sort(out);
        return out;
    }

    static byte[] get(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "PromptLab-Android");
        c.setInstanceFollowRedirects(true);
        try {
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode() + " " + url);
            InputStream in = c.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[16384];
            int r;
            while ((r = in.read(b)) > 0) {
                bo.write(b, 0, r);
                if (bo.size() > MAX_BYTES) throw new IOException("too big " + url);
            }
            return bo.toByteArray();
        } finally {
            c.disconnect();
        }
    }

    /** 출처를 전부 받아 합친다. 하나라도 실패하면 던진다(반쪽 목록으로 바꾸지 않게). */
    static ArrayList<String> download() throws IOException {
        HashSet<String> all = new HashSet<>();
        for (String[] s : SOURCES) {
            int n = parse(new StringReader(new String(get(s[0]), StandardCharsets.UTF_8)), all);
            if (n == 0) throw new IOException("empty " + s[0]);
        }
        ArrayList<String> out = reduce(all);
        if (out.size() < MIN_DOMAINS) throw new IOException("too few: " + out.size());
        return out;
    }

    static void write(File f, ArrayList<String> list) throws IOException {
        File tmp = new File(f.getPath() + ".tmp");
        try (Writer w = new OutputStreamWriter(new FileOutputStream(tmp), StandardCharsets.UTF_8)) {
            SimpleDateFormat df = new SimpleDateFormat("yyyy-MM-dd HH:mm 'UTC'", Locale.ROOT);
            df.setTimeZone(TimeZone.getTimeZone("UTC"));
            w.write("# 프롬프트 랩 둘러보기 광고 차단 목록 — " + list.size() + "개 도메인 (하위 도메인까지 막는다)\n");
            w.write("# 만든 때: " + df.format(new Date()) + "\n");
            w.write("# 아래 공개 목록을 합치고, 윗단계 도메인이 있는 항목과 허용 목록에 걸리는 항목을 뺐다.\n");
            for (String[] s : SOURCES) w.write("#  · " + s[1] + "  " + s[0] + "\n");
            w.write("# AdAway(CC BY 3.0)·tiuxo(CC BY 4.0) 는 출처 표기 조건, 나머지는 MIT(Copyright Steven Black / FadeMind).\n");
            for (String h : list) { w.write(h); w.write('\n'); }
        }
        if (!tmp.renameTo(f)) { f.delete(); if (!tmp.renameTo(f)) throw new IOException("rename " + f); }
    }

    /** 앱에 싣는 목록 만들기: java -cp <클래스> io.github.intionma.promptlab.AdBlockCore build app/src/main/assets/adblock-hosts.txt */
    public static void main(String[] a) throws Exception {
        if (a.length == 2 && a[0].equals("build")) {
            ArrayList<String> list = download();
            write(new File(a[1]), list);
            System.out.println("wrote " + list.size() + " domains → " + a[1] + " (" + new File(a[1]).length() + " bytes)");
            return;
        }
        System.out.println("usage: build <out.txt>");
    }

    static Set<String> readFile(InputStream in) throws IOException {
        HashSet<String> s = new HashSet<>(16384);
        parse(new InputStreamReader(in, StandardCharsets.UTF_8), s);
        return s;
    }
}
