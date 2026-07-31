// ⑨ 은채 — 원격 접속자 (집 PC ComfyUI를 Tailscale로. 지하철에서 신호가 끊기고, PC가 꺼진 채로 생성을 누른다)
const L = require('./lib');

module.exports = async function (browser, port) {
    const R = L.reporter('⑨ 은채 — 원격 접속 · 오프라인');
    const { ctx, page, errs } = await L.boot(browser, {
        port, device: L.PHONE, pre: { pl_layout: 'anima', adult_optin_v1: '1' },
    });
    // 서비스워커가 캐시를 채울 때까지
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const sw = await page.evaluate(async () => {
        const ks = await caches.keys();
        const c = await caches.open('pl-app-v1');
        const all = await c.keys();
        return { 캐시: ks, 담긴것: all.map(r => r.url.replace(/^https?:\/\/[^/]+/, '')) };
    });
    R.ck('앱 본체가 캐시에 담겼다', sw.담긴것.some(u => /index\.html|\/$/.test(u)), JSON.stringify(sw).slice(0, 160));

    // ── 지하철: 신호가 끊긴 채로 앱을 다시 연다
    await ctx.setOffline(true);
    let offlineOk = true, offErr = '';
    try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (e) { offlineOk = false; offErr = e.message.slice(0, 80); }
    await page.waitForTimeout(4000);
    const off = await page.evaluate(() => ({
        떴나: !!document.getElementById('anima-root'),
        가림막: (() => { const b = document.getElementById('pl-boot'); return !b || b.classList.contains('gone'); })(),
        글자: document.body.innerText.length,
    }));
    R.ck('신호가 끊겨도 앱이 뜬다', offlineOk && off.떴나 && off.가림막, offErr || JSON.stringify(off));
    R.ck('오프라인에서도 화면 내용이 보인다', off.글자 > 200, off.글자 + '자');

    // ── PC가 꺼진 채로 ComfyUI를 부른다 (연결 실패가 앱을 죽이면 안 된다)
    await ctx.setOffline(false);
    await page.waitForTimeout(500);
    const dead = await page.evaluate(async () => {
        const before = document.body.innerText.length;
        let threw = null;
        try {
            const c = new AbortController();
            setTimeout(() => c.abort(), 2500);
            await fetch('http://127.0.0.1:9/prompt', { method: 'POST', body: '{}', signal: c.signal });
        } catch (e) { threw = e.name; }
        await new Promise(r => setTimeout(r, 600));
        return { threw, 살아있나: !!document.getElementById('anima-root'), 글자변화: document.body.innerText.length - before };
    });
    R.ck('꺼진 PC에 요청해도 앱이 죽지 않는다', dead.살아있나 === true, JSON.stringify(dead));
    R.note('연결 실패 종류: ' + dead.threw);

    // ── 서비스워커가 외부 출처(ComfyUI 서버)를 건드리지 않는가
    const foreign = await page.evaluate(async () => {
        const c = await caches.open('pl-app-v1');
        const all = await c.keys();
        return all.map(r => new URL(r.url).origin).filter((v, i, a) => a.indexOf(v) === i);
    });
    R.ck('캐시에 외부 서버 응답이 섞이지 않는다', foreign.length === 1, foreign.join(' | '));

    // ── 다시 온라인: 새 버전이 나오면 알려 주는가 (stale-while-revalidate)
    const upd = await page.evaluate(async () => {
        let got = false;
        navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'pl-update') got = true; });
        // 캐시를 비우라고 시키고 다시 받게 한다 = 손으로 새로고침 눌렀을 때의 경로
        navigator.serviceWorker.controller.postMessage({ type: 'pl-drop-cache' });
        await new Promise(r => setTimeout(r, 800));
        const ks = await caches.keys();
        return { 앱캐시남음: ks.includes('pl-app-v1'), got };
    });
    R.ck('새로고침 요청이 앱 캐시를 비운다', upd.앱캐시남음 === false, JSON.stringify(upd));

    // ── 캐시를 비운 뒤 다시 들어가도 정상인가
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(4000);
    const again = await page.evaluate(() => ({
        떴나: !!document.getElementById('anima-root'),
        버전: (document.querySelector('.app-version-tooltip') || {}).textContent || '',
    }));
    R.ck('캐시를 비운 뒤에도 정상적으로 뜬다', again.떴나 === true, JSON.stringify(again).slice(0, 100));
    R.note('버전 표시: ' + again.버전.split('·')[0].trim());

    const re = L.realErrs(errs);
    R.ck('오류 없음', re.length === 0, re.slice(0, 3).join(' | '));
    await ctx.close();
    return R;
};
