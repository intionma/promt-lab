// ① 지혜 — 폰 전용 Anima 헤비유저 (결과 500장 누적, 하루 30번 껐다 켬, 공유로 이미지 투입)
const L = require('./lib');

module.exports = async function (browser, port) {
    const R = L.reporter('① 지혜 — 폰 Anima 헤비유저 (500장 누적)');
    const { ctx, page, errs } = await L.boot(browser, {
        port, device: L.PHONE, pre: { pl_layout: 'anima', adult_optin_v1: '1' },
    });
    await page.waitForTimeout(1500);

    // ── 1년치 결과를 심는다
    const seeded = await page.evaluate(async () => {
        const recs = [];
        for (let i = 0; i < 500; i++) recs.push({
            k: 1700000000000 * 1000 + i,
            url: 'http://127.0.0.1:9/view?filename=r' + i + '.png&type=output',
            seed: 1000 + i, src: (i % 7 === 0) ? null : ('srckey' + (i % 7)), opt: '옵션 ' + i,
        });
        await _animaIdbAddMany(recs);
        return (await _animaIdbAll()).length;
    });
    R.ck('결과 500장이 저장돼 있다', seeded === 500, String(seeded));

    // ── 폰 성능으로 낮추고 '앱 껐다 다시 켜기'
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
        window.__m = [];
        const M = (n) => window.__m.push([n, Math.round(performance.now())]);
        window.__longest = 0;
        try {
            new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.duration > window.__longest) window.__longest = Math.round(e.duration); }))
                .observe({ entryTypes: ['longtask'] });
        } catch (e) {}
        let sawBoot = false;
        const iv = setInterval(() => {
            const b = document.getElementById('pl-boot');
            if (b) sawBoot = true;
            if (sawBoot && (!b || b.classList.contains('gone'))) { M('가림막 걷힘'); clearInterval(iv); }
        }, 8);
        const iv2 = setInterval(() => { if (document.getElementById('anima-root')) { M('편집 화면'); clearInterval(iv2); } }, 8);
        const iv3 = setInterval(() => { if (document.querySelector('#anima-result .anima-gitem, #anima-result .anima-fold')) { M('갤러리 첫 표시'); clearInterval(iv3); } }, 16);
        setTimeout(() => { clearInterval(iv); clearInterval(iv2); clearInterval(iv3); }, 20000);
    });

    const times = [];
    for (let i = 0; i < 3; i++) {                       // 하루 30번 중 3번을 재현
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(6000);
        times.push(await page.evaluate(() => ({
            marks: Object.fromEntries(window.__m), longest: window.__longest,
            결과수: (typeof _anima !== 'undefined' && _anima.results) ? _anima.results.length : -1,
            전송량: Math.round(((performance.getEntriesByType('navigation')[0] || {}).transferSize || 0) / 1024),
        })));
    }
    const last = times[times.length - 1];
    const 화면 = Math.max(...times.map(t => t.marks['가림막 걷힘'] || 9999));
    const 갤러리 = Math.max(...times.map(t => t.marks['갤러리 첫 표시'] || 9999));
    const 최악멈춤 = Math.max(...times.map(t => t.longest));

    R.ck('앱이 3초 안에 뜬다 (폰 4배 느리게)', 화면 < 3000, 화면 + 'ms');
    R.ck('500장 갤러리도 4초 안에 나온다', 갤러리 < 4000, 갤러리 + 'ms');
    R.ck('500장이 그대로 다 살아 있다', last.결과수 === 500, String(last.결과수));
    R.ck('재접속 때 2MB를 다시 안 받는다 (캐시)', last.전송량 < 200, last.전송량 + 'KB');
    R.ck('1초 넘게 멈추는 구간이 없다', 최악멈춤 < 1000, 최악멈춤 + 'ms');
    R.note(`3회 재접속 화면표시 ${times.map(t => t.marks['가림막 걷힘']).join('/')}ms · 갤러리 ${times.map(t => t.marks['갤러리 첫 표시']).join('/')}ms · 최악 멈춤 ${최악멈춤}ms`);

    // ── 공유로 들어오는 경로 (?shared=1)
    await page.goto('http://127.0.0.1:' + port + '/index.html?shared=1', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const sh = await page.evaluate(() => ({
        떴나: !!document.getElementById('anima-root'),
        가림막: (() => { const b = document.getElementById('pl-boot'); return !b || b.classList.contains('gone'); })(),
        결과수: (typeof _anima !== 'undefined' && _anima.results) ? _anima.results.length : -1,
    }));
    R.ck('공유로 들어와도 편집 화면이 뜬다', sh.떴나 && sh.가림막, JSON.stringify(sh));
    R.ck('공유 진입에서도 500장이 유지된다', sh.결과수 === 500, String(sh.결과수));

    // ── 결과를 원본으로 갈아끼우기 (앱이 새로고침되면 안 된다)
    const swap = await page.evaluate(async (PNG) => {
        if (!window._animaMounted) { try { await mountAnima(); } catch (e) {} }
        await _animaSetImage('data:image/png;base64,' + PNG, '내사진', true);
        _anima.results = [{ url: 'data:image/png;base64,' + PNG, opt: 't', seed: 1 }];
        _animaResSel = 0; _animaRenderResult();
        const t0 = performance.now();
        const btn = document.getElementById('anima-use-result');
        if (!btn) return { err: '버튼 없음' };
        btn.click();
        await new Promise(r => setTimeout(r, 2500));
        return { ms: Math.round(performance.now() - t0), name: _anima.img && _anima.img.name, thumb: !!_anima.imgThumb };
    }, L.PNG_OPAQUE);
    R.ck('결과를 원본으로 바꾸기가 동작한다', swap.name === '결과 1', JSON.stringify(swap));
    R.ck('바꾸는 동안 앱이 멈추지 않는다', (swap.ms || 9999) < 3000, (swap.ms || '?') + 'ms');

    const re = L.realErrs(errs);
    R.ck('오류 없음', re.length === 0, re.slice(0, 3).join(' | '));
    await ctx.close();
    return R;
};
