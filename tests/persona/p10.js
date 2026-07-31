// ⑩ 유나 — 오늘 처음 연 사람 (저장된 게 아무것도 없음. 성인 설정 미동의. 여기저기 눌러 본다)
const L = require('./lib');

module.exports = async function (browser, port) {
    const R = L.reporter('⑩ 유나 — 오늘 처음 연 사람');
    const ctx = await browser.newContext(L.PHONE);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load|net::ERR|favicon/.test(m.text())) errs.push('[console] ' + m.text()); });
    page.on('dialog', d => d.dismiss().catch(() => {}));

    const t0 = Date.now();
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const first = await page.evaluate(() => {
        window.showToast = () => {};
        return {
            저장된것: localStorage.length,
            화면: document.body.getAttribute('data-layout'),
            가림막: (() => { const b = document.getElementById('pl-boot'); return !b || b.classList.contains('gone'); })(),
            글자: document.body.innerText.length,
            성인: localStorage.getItem('adult_optin_v1'),
        };
    });
    R.ck('처음 열면 기본 화면이 뜬다', !!first.화면 && first.가림막, JSON.stringify(first));
    R.ck('빈 저장소에서도 화면 내용이 채워진다', first.글자 > 200, first.글자 + '자');
    R.ck('성인 설정은 꺼진 채로 시작한다', !first.성인 || first.성인 !== '1', String(first.성인));
    R.note('첫 진입 ' + (Date.now() - t0) + 'ms · 기본 화면 = ' + first.화면);

    // ── 성인 설정에 동의 안 한 상태에서 잠긴 게 안 보이는가
    const locked = await page.evaluate(() => {
        const txt = document.body.innerText;
        const 성인조합 = Object.values(typeof comboFS !== 'undefined' ? comboFS.items : {})
            .filter(i => i && i.type === 'combo' && /문신 도배|완전 노출|정사|후타나리/.test(i.title || '')).length;
        return { 성인조합, 화면에노출: /완전 노출|후타나리|문신 도배/.test(txt) };
    });
    R.ck('동의 전에는 성인 조합이 설치되지 않는다', locked.성인조합 === 0, locked.성인조합 + '개');
    R.ck('동의 전에는 화면에도 안 보인다', locked.화면에노출 === false, String(locked.화면에노출));

    // ── 레이아웃 선택기를 열어 본다 (여기서 클래식 엔진이 실린다)
    const picker = await page.evaluate(async () => {
        const 전 = typeof renderChips === 'function';
        const t0 = performance.now();
        openLayoutPicker();
        await new Promise(r => setTimeout(r, 900));
        return {
            엔진전: 전, 엔진후: typeof renderChips === 'function',
            ms: Math.round(performance.now() - t0),
            카드수: document.querySelectorAll('.pl-picker-card, [class*="picker"] [class*="card"]').length,
        };
    });
    R.ck('레이아웃 선택기가 열린다', picker.카드수 > 0 || picker.엔진후, JSON.stringify(picker));
    R.ck('선택기를 열면 클래식 엔진이 준비된다', picker.엔진후 === true, JSON.stringify(picker));
    R.note(`선택기 ${picker.ms}ms · 엔진 ${picker.엔진전 ? '이미 실림' : '여기서 실림'}`);

    // ── 초보 모드
    const newbie = await page.evaluate(async () => {
        try { openNewbieMode(); } catch (e) { return { err: e.message }; }
        await new Promise(r => setTimeout(r, 600));
        const vis = [...document.querySelectorAll('body > div')].filter(e => {
            const s = getComputedStyle(e); return s.position === 'fixed' && s.display !== 'none' && e.getBoundingClientRect().height > 150;
        });
        return { 열림: vis.length > 0, 글자: vis.map(e => e.innerText).join(' ').slice(0, 60).replace(/\s+/g, ' ') };
    });
    R.ck('초보 모드가 열린다', !newbie.err && newbie.열림, JSON.stringify(newbie).slice(0, 140));
    R.note('초보 모드: ' + (newbie.글자 || ''));

    await page.evaluate(() => {
        [...document.querySelectorAll('body > div')].forEach(e => {
            if (['pl-boot', 'toast-container', 'app-container', 'anima-root', 'gt-menu'].includes(e.id)) return;
            const s = getComputedStyle(e); if (s.position === 'fixed' && e.getBoundingClientRect().height > 100) e.style.display = 'none';
        });
    });

    // ── 화면을 하나씩 다 가 본다
    for (const id of ['classic', 'studio', 'img2img', 'inpaint', 'anima']) {
        const r = await page.evaluate(async (id) => {
            const t0 = performance.now();
            try { applyLayout(id); } catch (e) { return { err: e.message }; }
            await new Promise(r => setTimeout(r, 900));
            return {
                ms: Math.round(performance.now() - t0),
                화면: document.body.getAttribute('data-layout'),
                글자: document.body.innerText.length,
            };
        }, id);
        R.ck(`${id} 화면으로 갈 수 있다`, !r.err && r.화면 === id && r.글자 > 150, JSON.stringify(r));
        R.note(`  ${id}: ${r.ms}ms · ${r.글자}자`);
    }

    // ── 성인 설정에 동의하고 성인 팩을 켜면 조합이 나타나는가
    await page.evaluate(async () => {
        localStorage.setItem('adult_optin_v1', '1');
        try { _adultPackToggle(); } catch (e) {}       // 사용자가 '성인 팩' 스위치를 켠 것
        await new Promise(r => setTimeout(r, 1500));
    });
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => ({
        성인팩: localStorage.getItem('adult_pack_v1'),
        조합: Object.values(typeof comboFS !== 'undefined' ? comboFS.items : {})
            .filter(i => i && i.type === 'combo' && /가터 란제리|하이레그|침실 유혹/.test(i.title || '')).map(i => i.title),
    }));
    R.ck('성인 팩을 켜면 성인 조합이 나타난다', after.조합.length > 0, JSON.stringify(after));
    R.note('나타난 조합: ' + after.조합.join(' · '));

    // ── 아무것도 저장 안 한 채 새로고침해도 깨지지 않는가
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(3500);
    const fresh = await page.evaluate(() => ({
        화면: document.body.getAttribute('data-layout'),
        글자: document.body.innerText.length,
    }));
    R.ck('저장소를 통째로 비워도 정상적으로 뜬다', !!fresh.화면 && fresh.글자 > 200, JSON.stringify(fresh));

    const re = L.realErrs(errs);
    R.ck('오류 없음', re.length === 0, re.slice(0, 3).join(' | '));
    await ctx.close();
    return R;
};
