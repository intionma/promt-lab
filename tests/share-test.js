// 공유 자동 생성 = 내 설정 그대로 / '여러 개 켜기'가 새로고침 뒤에도 살아 있는가 (v9.153.0)
const { chromium } = require('playwright-core');
const PASS = [], FAIL = [], NOTE = [];
const ck = (n, ok, d) => (ok ? PASS : FAIL).push(n + (ok || !d ? '' : ' :: ' + d));

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errs = [], sent = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/prompt', r => { try { sent.push(JSON.parse(r.request().postData() || '{}')); } catch (e) {}
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ prompt_id: 'x' + sent.length }) }); });
    await page.route('**/upload/image', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"name":"x.png"}' }));
    for (const u of ['**/object_info*', '**/history*', '**/system_stats*', '**/queue*'])
        await page.route(u, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.addInitScript(() => {
        if (!sessionStorage.getItem('_seed')) {
            sessionStorage.setItem('_seed', '1');
            localStorage.setItem('pl_layout', 'anima');
            localStorage.setItem('adult_optin_v1', '1');
        }
    });
    await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.evaluate(() => { window.showToast = () => {}; });

    // ══ ① '여러 개 켜기' — 저장·복구를 거쳐도 살아 있는가 ══════════════════
    //  ⚠ 켜자마자 확인하면 통과한다. 문제는 저장했다 되불러올 때 multi 가 떨어지는 것이었다.
    const IDS = ['tat_fil_arm', 'tat_fil_chest', 'tat_fil_thigh'];
    const on3 = await page.evaluate((ids) => {
        _anima.snippets.forEach(s => { if (s.kind !== 'base') s.on = false; });
        ids.forEach(id => _animaToggleSnip(id));
        return _anima.snippets.filter(s => s.on && s.group === 'tatfil').map(s => s.id);
    }, IDS);
    ck('새로고침 전에는 셋 다 켜진다', on3.length === 3, JSON.stringify(on3));

    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(3500);
    await page.evaluate(() => { window.showToast = () => {}; });
    const kept = await page.evaluate(() => ({
        on: _anima.snippets.filter(s => s.on && s.group === 'tatfil').map(s => s.id),
        multi: _anima.snippets.filter(s => s.group === 'tatfil').map(s => !!s.multi),
    }));
    ck('★ 새로고침해도 셋 다 켜져 있다', kept.on.length === 3, JSON.stringify(kept.on));
    ck('★ 복구된 항목에 multi 표시가 살아 있다', kept.multi.every(Boolean), JSON.stringify(kept.multi));

    // 새로고침 뒤에 '추가로 하나 더' 켜도 앞의 것들이 안 꺼지는가 — 사용자가 겪은 그 상황
    const more = await page.evaluate(() => {
        _animaToggleSnip('tat_fil_hip');
        return _anima.snippets.filter(s => s.on && s.group === 'tatfil').map(s => s.id);
    });
    ck('★ 새로고침 뒤에 하나 더 켜도 앞의 것이 안 꺼진다', more.length === 4, JSON.stringify(more));

    // 배타 축은 여전히 하나만 (밀도·낙인)
    const excl = await page.evaluate(() => {
        _animaToggleSnip('tat_den_light'); _animaToggleSnip('tat_den_heavy');
        const den = _anima.snippets.filter(s => s.on && s.group === 'tatden').map(s => s.id);
        _animaToggleSnip('tat_barcode'); _animaToggleSnip('tat_pubic');
        const tat = _anima.snippets.filter(s => s.on && s.group === 'tat').map(s => s.id);
        return { den, tat };
    });
    ck('밀도는 여전히 하나만 켜진다', excl.den.length === 1, JSON.stringify(excl.den));
    ck('낙인도 여전히 하나만 켜진다', excl.tat.length === 1, JSON.stringify(excl.tat));
    NOTE.push('  장식 4개 동시 ON + 밀도 1 + 낙인 1');

    // ══ ② 공유 자동 생성 = 내가 설정한 그대로 ═══════════════════════════
    const setup = await page.evaluate(async ({ png }) => {
        try { localStorage.setItem('comfy_settings_v1', JSON.stringify({ url: location.origin })); } catch (e) {}
        _anima.snippets.forEach(s => { if (s.kind !== 'base') s.on = false; });
        //  이 사람은 '하의만 벗기기 + 특정 표정 + 특정 포즈 + 가슴 + 문신'을 맞춰 뒀다
        const base = _anima.snippets.find(s => s.id === 'base_bottom');
        if (base) { _anima.snippets.forEach(s => { if (s.kind === 'base') s.on = false; }); base.on = true; _anima.prompt = base.text; }
        ['pose_fu', 'tat_barcode'].forEach(id => _animaToggleSnip(id));
        const expr = _anima.snippets.find(s => s.group === 'expr');
        const bust = _anima.snippets.find(s => s.group === 'bust');
        if (expr) _animaToggleSnip(expr.id);
        if (bust) _animaToggleSnip(bust.id);
        _anima.img = { dataURL: 'data:image/png;base64,' + png, name: 'shared.png' };
        _anima.uploadedName = null;
        _animaJobs.length = 0;
        return {
            켠것: _anima.snippets.filter(s => s.on).map(s => s.name),
            표정: expr && expr.name, 가슴: bust && bust.name,
            프롬프트: (_anima.prompt || '').slice(0, 60),
        };
    }, { png: PNG });
    NOTE.push('  공유 전 내 설정: ' + setup.켠것.join(' / '));

    sent.length = 0;
    await page.evaluate(async () => { await _animaShareAutoGen(); });
    await page.waitForTimeout(2500);
    const pos = (sent[0] && sent[0].prompt && sent[0].prompt['67'] && sent[0].prompt['67'].inputs.text) || '';
    ck('공유로 들어오면 자동으로 한 장 뽑는다', !!pos, '(전송 안 됨)');
    ck('★ 내가 고른 포즈가 반영된다', /middle finger/.test(pos), pos.slice(0, 240));
    ck('★ 내가 고른 문신이 반영된다', /barcode tattoo/.test(pos), pos.slice(0, 240));
    ck('★ 내가 고른 노출(하의만)이 반영된다', /bottomless/.test(pos), pos.slice(0, 120));
    ck('★ 전신 노출로 갈아치우지 않는다', !/completely nude/.test(pos), pos.slice(0, 120));
    NOTE.push('  공유 전송 프롬프트: ' + pos.slice(0, 200));

    // 표정·가슴도 살아 있는가 (예전엔 이 셋을 강제로 껐다)
    const both = await page.evaluate(() => {
        const e = _anima.snippets.find(s => s.group === 'expr' && s.on);
        const b = _anima.snippets.find(s => s.group === 'bust' && s.on);
        return { e: e && e.text, b: b && b.text };
    });
    const inPos = (t) => !t ? true : t.split(',')[0].trim().length > 0 && pos.indexOf(t.split(',')[0].trim()) >= 0;
    ck('★ 표정도 반영된다', inPos(both.e), String(both.e).slice(0, 80));
    ck('★ 가슴도 반영된다', inPos(both.b), String(both.b).slice(0, 80));

    // 설정을 건드리지 않고 그대로 두는가 (공유 후에도 내 화면은 그대로여야 한다)
    const after = await page.evaluate(() => _anima.snippets.filter(s => s.on).map(s => s.name));
    ck('공유 생성 뒤에도 내 설정이 그대로다', JSON.stringify(after) === JSON.stringify(setup.켠것),
        JSON.stringify(after) + ' vs ' + JSON.stringify(setup.켠것));

    // 대기열이 차 있으면 밀어내지 않는가
    const busy = await page.evaluate(async () => {
        _animaJobs.push({ id: 999, status: 'queued', snap: {}, settings: {}, prompt: 'x' });
        const r = await _animaShareAutoGen();
        _animaJobs.length = 0;
        return r;
    });
    ck('대기열이 있으면 밀어내지 않는다', busy === false, String(busy));

    const real = errs.filter(e => !/Failed to load|net::ERR|favicon/.test(e));
    ck('오류 없음', real.length === 0, real.slice(0, 3).join(' | '));

    await browser.close();
    PASS.forEach(n => console.log('PASS - ' + n));
    NOTE.forEach(n => console.log(n));
    FAIL.forEach(n => console.log('FAIL - ' + n));
    console.log(FAIL.length ? `\n${FAIL.length} FAILED` : '\nALL PASS');
    process.exit(FAIL.length ? 1 : 0);
})();
