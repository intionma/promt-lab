package io.github.intionma.promptlab;

import java.io.File;
import java.io.FileInputStream;
import java.io.StringReader;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 광고 차단 도메인 맞추기 검사 — 안드로이드 없이 컴퓨터 자바로 돈다(의존성 0, JUnit 안 씀).
 *
 *   cd android
 *   javac -d /tmp/abc app/src/main/java/io/github/intionma/promptlab/AdBlockCore.java tools/AdBlockCheck.java
 *   java -cp /tmp/abc io.github.intionma.promptlab.AdBlockCheck app/src/main/assets/adblock-hosts.txt
 *
 * 끝에 ALL PASS / N FAILED 를 찍는다.
 */
public final class AdBlockCheck {
    static int fail = 0, pass = 0;

    static void ok(boolean c, String what) {
        if (c) { pass++; System.out.println("PASS " + what); }
        else { fail++; System.out.println("FAIL " + what); }
    }

    public static void main(String[] a) throws Exception {
        // ① 맞추기 규칙 — 작은 가짜 목록으로
        Set<String> s = new HashSet<>();
        AdBlockCore.parse(new StringReader(
                "# 주석\n0.0.0.0 ads.example.com\n127.0.0.1 tracker.net  # 끝 주석\n0.0.0.0 a.com b.org\nplain.io\n"
                + "1.2.3.4 redirect.com\n0.0.0.0 localhost\n0.0.0.0 BAD_CASE.Example.NET.\n0.0.0.0 donmai.us\n"), s);
        ok(s.contains("ads.example.com") && s.contains("tracker.net") && s.contains("a.com") && s.contains("b.org") && s.contains("plain.io"), "hosts 형식·한 줄 한 도메인 둘 다 읽는다");
        ok(!s.contains("redirect.com"), "다른 IP 로 돌리는 줄은 건너뛴다");
        ok(!s.contains("localhost"), "localhost 는 안 읽는다");
        ok(s.contains("bad_case.example.net"), "대문자·끝 점을 정리한다");
        ok(AdBlockCore.shouldBlock(s, "ads.example.com", "news.site"), "정확히 같은 도메인을 막는다");
        ok(AdBlockCore.shouldBlock(s, "x.y.ads.example.com", "news.site"), "하위 도메인도 막는다(윗단계 맞추기)");
        ok(AdBlockCore.shouldBlock(s, "TRACKER.NET", "news.site"), "대소문자 무관");
        ok(!AdBlockCore.shouldBlock(s, "example.com", "news.site"), "윗단계(example.com) 자체는 안 막는다");
        ok(!AdBlockCore.shouldBlock(s, "notads.example.com", "news.site"), "이름이 비슷하기만 한 곳은 안 막는다(notads ≠ ads)");
        ok(!AdBlockCore.shouldBlock(s, "badtracker.net", "news.site"), "끝 글자만 같은 도메인(badtracker.net)은 안 막는다");
        ok(!AdBlockCore.shouldBlock(s, "com", "news.site") && !AdBlockCore.shouldBlock(s, null, "news.site"), "맨 끝 한 단·null 은 안 막는다");
        ok(!AdBlockCore.shouldBlock(s, "cdn.ads.example.com", "www.ads.example.com"), "그 사이트에 직접 가 있으면 그 사이트 것은 안 막는다");
        ok(AdBlockCore.shouldBlock(s, "tracker.net", "www.ads.example.com"), "…그래도 다른 광고 도메인은 막는다");
        ok(!AdBlockCore.shouldBlock(s, "cdn.donmai.us", "news.site") && !AdBlockCore.shouldBlock(s, "danbooru.donmai.us", "x"), "허용 목록이 이긴다(목록에 윗단계 donmai.us 가 있어도)");
        ok(AdBlockCore.shouldBlock(s, "ads.donmai.us", "news.site"), "허용 목록 밖의 하위 도메인은 목록대로");
        ok(!AdBlockCore.shouldBlock(s, "a.cdn.donmai.us", "news.site"), "허용 항목의 하위 도메인도 통과");
        List<String> red = AdBlockCore.reduce(new HashSet<>(Arrays.asList("ads.com", "x.ads.com", "y.z.ads.com", "other.net", "donmai.us", "evil.i.pximg.net")));
        ok(red.equals(Arrays.asList("ads.com", "other.net")), "줄이기: 윗단계가 있으면 빼고, 허용 목록과 부딪히면 뺀다 → " + red);

        // ② 앱에 실린 진짜 목록
        if (a.length > 0) {
            File f = new File(a[0]);
            Set<String> real;
            try (FileInputStream in = new FileInputStream(f)) { real = AdBlockCore.readFile(in); }
            ok(real.size() >= AdBlockCore.MIN_DOMAINS, "실린 목록 " + real.size() + "개 (≥ " + AdBlockCore.MIN_DOMAINS + ")");
            String[] mustPass = {"intionma.github.io", "cdn.donmai.us", "danbooru.donmai.us", "i.pximg.net", "static.wikia.nocookie.net",
                    "raw.githubusercontent.com", "schaledb.com", "blue-utils.me", "sr.yatta.moe", "gi.yatta.moe", "cdn.dak.gg", "sdvxindex.com",
                    // 자주 쓰는 사이트·그림 CDN — 허용 목록에는 없지만 목록에 걸리면 안 된다
                    "www.google.com", "www.gstatic.com", "fonts.googleapis.com", "lh3.googleusercontent.com", "pbs.twimg.com", "x.com",
                    "www.pixiv.net", "i.redd.it", "i.imgur.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "unpkg.com",
                    "s3.amazonaws.com", "d1.cloudfront.net", "media.discordapp.net", "cdn.discordapp.com", "github.com", "avatars.githubusercontent.com",
                    "www.naver.com", "phinf.pstatic.net", "search.daum.net", "t1.daumcdn.net", "namu.wiki", "arca.live", "gall.dcinside.com",
                    "static.fandom.com", "vignette.wikia.nocookie.net", "civitai.com", "image.civitai.com", "www.youtube.com", "i.ytimg.com",
                    "yt3.ggpht.com", "blog.fc2.com", "a.blogspot.com", "foo.appspot.com", "foo.netlify.app", "foo.vercel.app", "wp.com", "i0.wp.com"};
            for (String h : mustPass) ok(!AdBlockCore.shouldBlock(real, h, "news.example"), "안 막음: " + h);
            String[] mustBlock = {"doubleclick.net", "securepubads.g.doubleclick.net", "pagead2.googlesyndication.com", "www.google-analytics.com",
                    "c.amazon-adsystem.com", "ib.adnxs.com", "cdn.taboola.com", "widgets.outbrain.com", "sb.scorecardresearch.com", "static.criteo.net"};
            for (String h : mustBlock) ok(AdBlockCore.shouldBlock(real, h, "news.example"), "막음: " + h);

            long t0 = System.nanoTime();
            int n = 0;
            for (int i = 0; i < 200000; i++) if (AdBlockCore.shouldBlock(real, "img" + (i % 97) + ".cdn.some-site-" + (i % 13) + ".co.kr", "news.example")) n++;
            double us = (System.nanoTime() - t0) / 1000.0 / 200000;
            ok(us < 20, String.format("요청 하나 판정 %.2f µs (20µs 미만)", us));
        }

        System.out.println(fail == 0 ? "ALL PASS (" + pass + ")" : fail + " FAILED (" + pass + " passed)");
        if (fail > 0) System.exit(1);
    }
}
