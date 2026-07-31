// '↻ 이 결과를 원본으로' — 앱 새로고침 없이 결과가 원본 자리로 들어가는가
const { chromium } = require('playwright-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = '/home/user/promt-lab';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHUlEQVR42mP8z8Dwn4EIwDiqkL4KGUdDhr4KAeoRB/3s7QeVAAAAAElFTkSuQmCC';
const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/fakeresult.png') {   // ComfyUI 결과인 척하는 원격 이미지
        res.writeHead(200, { 'content-type': 'image/png' }); return res.end(Buffer.from(PNG, 'base64'));
    }
    let p = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname);
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': 'text/html' });
    fs.createReadStream(p).pipe(res);
});

(async () => {
    await new Promise(r => srv.listen(8979, r));
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => { try { const n = (+sessionStorage.getItem('__dl') || 0) + 1; sessionStorage.setItem('__dl', String(n)); } catch (e) {} });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:8979/index.html', { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.setItem('adult_optin_v1', '1'); localStorage.setItem('pl_layout', 'anima'); } catch (e) {} });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1500);

    let fails = 0;
    const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) fails++; };

    // 결과가 하나 있는 상태를 만든다
    const setup = await page.evaluate(async (PNG) => {
        window.showToast = () => {};
        if (!window._animaMounted) { try { await window.mountAnima(); } catch (e) {} }
        const du = 'data:image/png;base64,' + PNG;
        await _animaSetImage(du, '원본사진', true);
        _anima.results = [{ url: 'http://127.0.0.1:8979/fakeresult.png', opt: '테스트', seed: 1 }];
        _animaResSel = 0;
        _animaSave(); _animaRenderResult();
        //  v9.144.0부터 버튼은 제목 줄에 고정으로 있고 display 로만 보이고 숨는다
        const b = document.getElementById('anima-use-result');
        return { srcName: _anima.img.name, btn: !!(b && b.style.display !== 'none') };
    }, PNG);

    check('결과가 있으면 버튼이 보인다', setup.btn === true, String(setup.btn));
    check('원본은 아직 처음 사진', setup.srcName === '원본사진', setup.srcName);

    const dlBefore = await page.evaluate(() => sessionStorage.getItem('__dl'));

    await page.click('#anima-use-result');
    await page.waitForTimeout(2500);

    const after = await page.evaluate(() => ({
        srcName: _anima.img ? _anima.img.name : null,
        isDataURL: !!(_anima.img && /^data:image\//.test(_anima.img.dataURL || '')),
        notRemote: !!(_anima.img && !/^https?:/.test(_anima.img.dataURL || '')),
        thumb: !!_anima.imgThumb,
        resultsKept: _anima.results.length,
        dl: sessionStorage.getItem('__dl'),
        url: location.href,
        btnBack: (document.getElementById('anima-use-result') || {}).textContent,
        // 새로고침 뒤에도 남는지 확인용으로 저장됐는가
        saved: (() => { try { return /"img"/.test(localStorage.getItem('anima_settings_v1') || ''); } catch (e) { return false; } })(),
    }));

    check('결과가 원본 자리로 들어감', after.srcName === '결과 1', String(after.srcName));
    check('원격 주소가 아니라 dataURL로 저장', after.isDataURL && after.notRemote, (after.srcName || '') + ' / ' + after.isDataURL);
    check('썸네일도 생성됨', after.thumb === true, String(after.thumb));
    check('생성 목록은 그대로 유지', after.resultsKept === 1, String(after.resultsKept));
    check('★ 앱이 새로고침되지 않음', after.dl === dlBefore, dlBefore + ' → ' + after.dl);
    check('★ 주소도 그대로', /index\.html$/.test(after.url), after.url);
    check('버튼 글자 원복', /이 결과를 원본으로/.test(after.btnBack || ''), after.btnBack);

    // 결과가 없으면 버튼도 없다
    const none = await page.evaluate(() => { _anima.results = []; _animaSave(); _animaRenderResult();
        const b = document.getElementById('anima-use-result');
        return { 있음: !!b, 보임: !!(b && b.style.display !== 'none'), 제목줄: !!(b && b.closest('.anima-step')) };
    });
    check('결과가 없으면 버튼이 숨는다', none.보임 === false, JSON.stringify(none));
    check('버튼은 제목 줄에 고정으로 남아 있다', none.있음 && none.제목줄, JSON.stringify(none));

    console.log(errs.length ? 'PAGE ERRORS: ' + errs.join('; ') : 'no page errors');
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
    await browser.close(); srv.close();
    process.exit(fails ? 1 : 0);
})();
