// 포즈 — 뻐큐 추가 (v9.152.0)
const { chromium } = require('playwright-core');
const PASS = [], FAIL = [], NOTE = [];
const ck = (n, ok, d) => (ok ? PASS : FAIL).push(n + (ok || !d ? '' : ' :: ' + d));

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errs = [], sent = [];
    page.on('pageerror', e => errs.push(e.message));
    // 실제로 ComfyUI 로 나가는 payload 를 붙잡는다 — 문구 조합을 검사에서 다시 구현하면
    // 앱이 바뀌어도 검사만 통과하는 가짜 초록불이 된다.
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

    const base = await page.evaluate(() => {
        const p = _anima.snippets.filter(s => s.group === 'pose');
        const f1 = p.find(s => s.id === 'pose_fu'), f2 = p.find(s => s.id === 'pose_fu2');
        return {
            names: p.map(s => s.name),
            f1: f1 && { name: f1.name, text: f1.text, nsfw: f1.nsfw, repose: !!f1.repose },
            f2: f2 && { name: f2.name, text: f2.text, nsfw: f2.nsfw, repose: !!f2.repose },
            dv: p.find(s => s.id === 'pose_double_v') && p.findIndex(s => s.id === 'pose_double_v'),
            i1: p.findIndex(s => s.id === 'pose_fu'),
        };
    });
    ck('뻐큐 한 손이 있다', !!base.f1, JSON.stringify(base.names));
    ck('뻐큐 양손이 있다', !!base.f2, JSON.stringify(base.names));
    ck('더블피스 바로 뒤에 놓인다', base.i1 === base.dv + 1, `${base.dv} → ${base.i1}`);
    ck('손동작이라 자세 경고(repose)를 안 붙인다', base.f1 && !base.f1.repose && !base.f2.repose, '');
    ck('다른 포즈들처럼 성인 표시 대상이다', base.f1 && base.f1.nsfw === true && base.f2.nsfw === true, '');
    NOTE.push('  포즈: ' + base.names.join(' / '));

    // ── 문구 규칙 (Anima = Qwen → 서술이 앞, 태그가 뒤 / 서술 안에는 쉼표를 쓰지 않는다)
    for (const [k, s] of [['한 손', base.f1], ['양손', base.f2]]) {
        const t = s.text;
        const firstComma = t.indexOf(',');
        const head = firstComma < 0 ? t : t.slice(0, firstComma);
        ck(`${k}: 서술이 앞에 온다`, head.split(' ').length >= 8, head);
        ck(`${k}: middle finger 태그가 들어 있다`, /\bmiddle finger\b/.test(t), t);
        ck(`${k}: 쉼표가 겹치거나 앞뒤에 남지 않는다`, !/,\s*,/.test(t) && !/^\s*,|,\s*$/.test(t), t);
    }
    ck('양손은 전용 태그를 쓰되 한 손 태그도 함께 건다',
        /double middle finger/.test(base.f2.text) && /\(middle finger:/.test(base.f2.text), base.f2.text);

    // ── 켜면 실제로 프롬프트에 실리는가 / 하나만 켜지는가
    const gen = await page.evaluate(() => {
        _anima.snippets.forEach(s => { s.on = false; });
        _animaToggleSnip('pose_fu');
        const on1 = _anima.snippets.filter(s => s.on).map(s => s.id);
        _animaToggleSnip('pose_fu2');
        const on2 = _anima.snippets.filter(s => s.on).map(s => s.id);
        return { on1, on2 };
    });
    ck('켜진다', gen.on1.indexOf('pose_fu') >= 0, JSON.stringify(gen.on1));
    ck('포즈는 하나만 켜진다(양손을 켜면 한 손이 꺼진다)',
        gen.on2.indexOf('pose_fu2') >= 0 && gen.on2.indexOf('pose_fu') < 0, JSON.stringify(gen.on2));

    // ── 실제로 ComfyUI 로 나가는 프롬프트에 실리는가 (payload 를 붙잡아 확인)
    const shoot = async (id) => {
        sent.length = 0;
        await page.evaluate(async (id) => {
            const c = document.createElement('canvas'); c.width = 832; c.height = 1216;
            c.getContext('2d').fillRect(0, 0, 832, 1216);
            _anima.img = { dataURL: c.toDataURL('image/png'), name: 'x.png' };
            _anima.uploadedName = 'x.png';
            try { localStorage.setItem('comfy_settings_v1', JSON.stringify({ url: location.origin })); } catch (e) {}
            _anima.snippets.forEach(s => { if (s.kind !== 'base') s.on = false; });
            _animaToggleSnip(id);
            await _animaGenerate(true);
        }, id);
        await page.waitForTimeout(2500);
        const wf = sent[0];
        return (wf && wf.prompt && wf.prompt['67'] && wf.prompt['67'].inputs.text) || '';
    };
    const p1 = await shoot('pose_fu');
    ck('★ 실제 전송 프롬프트에 실린다', /middle finger/.test(p1), p1.slice(-200) || '(전송 안 됨)');
    ck('서술도 함께 나간다', /middle finger extended straight up/.test(p1), p1.slice(-200));
    const p2 = await shoot('pose_fu2');
    ck('★ 양손도 실제 전송에 실린다', /double middle finger/.test(p2), p2.slice(-200) || '(전송 안 됨)');
    NOTE.push('  전송 꼬리(한 손): …' + p1.slice(-150));
    NOTE.push('  전송 꼬리(양손): …' + p2.slice(-150));

    // ── 성인 표시를 끄면 숨는가
    const off = await page.evaluate(() => {
        localStorage.setItem('adult_optin_v1', '0');
        const vis = _animaGroupList('pose').map(s => s.id);
        localStorage.setItem('adult_optin_v1', '1');
        return vis;
    });
    ck('성인 표시를 끄면 숨는다', off.indexOf('pose_fu') < 0, JSON.stringify(off));

    // ── 하단 바 포즈 줄에 실제로 칩이 뜨는가
    const chip = await page.evaluate(async () => {
        _animaRenderSnippets();
        await new Promise(r => setTimeout(r, 300));
        const all = [...document.querySelectorAll('.anima-chip')].map(b => b.dataset.id);
        //  '더보기'를 펴야 전부 보인다
        const tg = [...document.querySelectorAll('.anima-chip.tg')].find(b => b.dataset.act === 'poseOpen');
        if (tg) tg.click();
        await new Promise(r => setTimeout(r, 300));
        const after = [...document.querySelectorAll('.anima-chip')].map(b => b.dataset.id);
        const el = [...document.querySelectorAll('.anima-chip')].find(b => b.dataset.id === 'pose_fu');
        return { before: all.indexOf('pose_fu') >= 0, after: after.indexOf('pose_fu') >= 0, label: el ? el.textContent : null };
    });
    ck('포즈 목록에 칩이 뜬다', chip.after === true, JSON.stringify(chip));
    ck('칩 이름이 한글로 보인다', chip.label === '뻐큐 (한 손)', String(chip.label));

    // ── ★ 기존 사용자에게도 들어가는가 (pose 는 주입 목록에 없었다)
    const old = await page.evaluate(async () => {
        const cur = JSON.parse(localStorage.getItem('anima_settings_v1'));
        cur.snippets = (cur.snippets || []).filter(s => s.id !== 'pose_fu' && s.id !== 'pose_fu2');
        //  이 사람은 더블피스 문구를 ✏️로 고쳐 뒀다 — 그건 그대로 남아야 한다
        const dv = cur.snippets.find(s => s.id === 'pose_double_v');
        if (dv) dv.text = 'MY OWN EDIT double v';
        localStorage.setItem('anima_settings_v1', JSON.stringify(cur));
        return cur.snippets.length;
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(3500);
    const after = await page.evaluate(() => {
        const p = _anima.snippets.filter(s => s.group === 'pose');
        return {
            has1: p.some(s => s.id === 'pose_fu'), has2: p.some(s => s.id === 'pose_fu2'),
            dv: (p.find(s => s.id === 'pose_double_v') || {}).text,
        };
    });
    ck('★ 기존 사용자에게도 뻐큐가 들어간다', after.has1 && after.has2, JSON.stringify(after));
    ck('★ ✏️로 고쳐 쓴 다른 포즈는 그대로 남는다', after.dv === 'MY OWN EDIT double v', String(after.dv));
    NOTE.push(`  기존 사용자: 포즈 ${old}개 → 주입 후 ${after.has1 && after.has2 ? '뻐큐 2개 추가됨' : '실패'}`);

    const real = errs.filter(e => !/Failed to load|net::ERR|favicon/.test(e));
    ck('오류 없음', real.length === 0, real.slice(0, 3).join(' | '));

    await browser.close();
    PASS.forEach(n => console.log('PASS - ' + n));
    NOTE.forEach(n => console.log(n));
    FAIL.forEach(n => console.log('FAIL - ' + n));
    console.log(FAIL.length ? `\n${FAIL.length} FAILED` : '\nALL PASS');
    process.exit(FAIL.length ? 1 : 0);
})();
