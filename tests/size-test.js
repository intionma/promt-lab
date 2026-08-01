// 결과 크기 — 원본 비율이 안 틀어지고 크기가 원본과 같은지. (v9.151.0)
const { chromium } = require('playwright-core');

const PASS = [], FAIL = [], NOTE = [];
const ck = (n, ok, d) => (ok ? PASS : FAIL).push(n + (ok || !d ? '' : ' :: ' + d));

// 원본을 만들어 주는 헬퍼 — 페이지 안에서 W×H 짜리 PNG dataURL 을 만든다.
const MAKE = `(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;
  const g=c.getContext('2d');g.fillStyle='#888';g.fillRect(0,0,w,h);
  g.fillStyle='#333';g.fillRect(w*0.25,h*0.25,w*0.5,h*0.5);return c.toDataURL('image/png');}`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
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

    // ── 실제 사용자들이 넣는 원본 크기들. 예전 파이프라인이 틀어졌던 것들을 일부러 포함한다.
    const SIZES = [[832, 1216], [896, 1152], [720, 1280], [1024, 1536], [1200, 1600], [1024, 1024], [1536, 1024], [3024, 4032]];

    const out = await page.evaluate(async ({ sizes, make }) => {
        const mk = eval(make);
        const rows = [];
        for (const [W, H] of sizes) {
            _anima.img = { dataURL: mk(W, H), name: 'x.png' };
            _anima.uploadedName = 'x.png';
            const wf = await _animaBuildWorkflow('test', 'x.png', 1, null, null, false);
            const gen = wf['82'] && wf['82'].inputs;
            const outn = wf['64'] && wf['64'].inputs;
            const save = wf['9'] && wf['9'].inputs.images;
            rows.push({
                W, H,
                genCls: wf['82'] && wf['82'].class_type,
                gw: gen && gen.width, gh: gen && gen.height, crop: gen && gen.crop,
                ow: outn ? outn.width : (gen && gen.width), oh: outn ? outn.height : (gen && gen.height),
                saveFrom: save && save[0],
                hasITP: Object.values(wf).some(n => n.class_type === 'ImageScaleToTotalPixels'),
            });
        }
        return rows;
    }, { sizes: SIZES, make: MAKE });

    let ratioBad = [], gridBad = [], sizeBad = [], genBad = [], mpBad = [];
    for (const r of out) {
        const o = r.W / r.H, n = r.ow / r.oh, d = (n - o) / o * 100;
        if (Math.abs(d) > 0.02) ratioBad.push(`${r.W}x${r.H} → ${r.ow}x${r.oh} (${d.toFixed(3)}%)`);
        if (r.gw % 16 || r.gh % 16) gridBad.push(`${r.W}x${r.H} → 생성 ${r.gw}x${r.gh}`);
        const gd = Math.abs((r.gw / r.gh - o) / o * 100);
        if (gd > 0.5) genBad.push(`${r.W}x${r.H} → 생성 ${r.gw}x${r.gh} (${gd.toFixed(2)}%)`);
        const mp = r.gw * r.gh / 1048576;
        if (mp < 0.55 || mp > 1.6) mpBad.push(`${r.W}x${r.H} → ${r.gw}x${r.gh} = ${mp.toFixed(2)}MP`);
        const cap = Math.max(2048, r.gw, r.gh);
        if (Math.max(r.W, r.H) <= cap && (r.ow !== r.W || r.oh !== r.H)) sizeBad.push(`${r.W}x${r.H} → ${r.ow}x${r.oh}`);
        NOTE.push(`  ${String(r.W + 'x' + r.H).padEnd(11)} 생성 ${String(r.gw + 'x' + r.gh).padEnd(11)} 결과 ${String(r.ow + 'x' + r.oh).padEnd(11)} ${d >= 0 ? '+' : ''}${d.toFixed(3)}%`);
    }

    ck('★ 결과 비율이 원본과 정확히 같다', ratioBad.length === 0, ratioBad.join(' | '));
    ck('★ 상한 안쪽 원본은 결과 크기가 원본과 똑같다', sizeBad.length === 0, sizeBad.join(' | '));
    ck('생성 크기가 모두 16의 배수다', gridBad.length === 0, gridBad.join(' | '));
    ck('생성 단계에서도 비율이 거의 안 틀어진다', genBad.length === 0, genBad.join(' | '));
    ck('생성 화소수가 목표(1MP) 근처를 지킨다', mpBad.length === 0, mpBad.join(' | '));
    ck('크기를 정하는 노드가 ImageScale 이다', out.every(r => r.genCls === 'ImageScale'), out.map(r => r.genCls).join(','));
    ck('ImageScaleToTotalPixels 는 더 이상 안 쓴다', out.every(r => !r.hasITP), '');
    ck('늘려 맞추기(crop)는 꺼져 있다', out.every(r => r.crop === 'disabled'), out.map(r => r.crop).join(','));
    ck('저장은 크기를 되돌린 노드에서 받는다', out.filter(r => r.ow !== r.gw || r.oh !== r.gh).every(r => r.saveFrom === '64'), '');

    // ── 큰 원본은 상한에서 멈추되 비율은 지키는가
    const big = out.find(r => r.W === 3024);
    ck('아주 큰 원본은 상한까지만 키운다', Math.max(big.ow, big.oh) <= 2048 && Math.max(big.ow,big.oh) < Math.max(big.W,big.H), `${big.ow}x${big.oh}`);
    ck('상한에서 멈춰도 비율은 원본 그대로', Math.abs((big.ow / big.oh) / (big.W / big.H) - 1) * 100 < 0.05, `${big.ow}x${big.oh}`);

    // ── 스위치를 끄면 생성 크기 그대로, 비율은 여전히 원본
    const off = await page.evaluate(async ({ make }) => {
        const mk = eval(make);
        _anima.matchSrcSize = false;
        _anima.img = { dataURL: mk(1024, 1536), name: 'x.png' };
        const wf = await _animaBuildWorkflow('t', 'x.png', 1, null, null, false);
        const g = wf['82'].inputs, o = wf['64'] ? wf['64'].inputs : g;
        _anima.matchSrcSize = true;
        return { gw: g.width, gh: g.height, ow: o.width, oh: o.height };
    }, { make: MAKE });
    ck('끄면 결과가 생성 크기 그대로다', off.ow === off.gw && off.oh === off.gh && off.ow < 1024, `생성 ${off.gw}x${off.gh} 결과 ${off.ow}x${off.oh}`);
    ck('꺼도 비율은 원본 그대로', Math.abs((off.ow / off.oh) / (1024 / 1536) - 1) * 100 < 0.02, `${off.ow}x${off.oh}`);
    NOTE.push(`  [끔] 1024x1536 → 생성 ${off.gw}x${off.gh} 결과 ${off.ow}x${off.oh}`);

    // ── 포즈 골격도 같은 크기로 맞춰지는가 (크기가 어긋나면 latent가 안 맞는다)
    const pose = await page.evaluate(async ({ make }) => {
        const mk = eval(make);
        _anima.img = { dataURL: mk(832, 1216), name: 'x.png' };
        _anima.cnPose = true; _anima.cnLoraName = 'union.safetensors';
        const wf = await _animaBuildWorkflow('t', 'x.png', 1, null, 'pose.png', true);
        _anima.cnPose = false; _anima.cnLoraName = '';
        return { s82: wf['82'] && [wf['82'].inputs.width, wf['82'].inputs.height], s95: wf['95'] && [wf['95'].inputs.width, wf['95'].inputs.height], cls: wf['95'] && wf['95'].class_type };
    }, { make: MAKE });
    ck('포즈 골격도 원본과 같은 크기로 맞춘다',
        pose.s95 && pose.s82 && pose.s95[0] === pose.s82[0] && pose.s95[1] === pose.s82[1],
        JSON.stringify(pose));

    // ── 붙여넣은 커스텀 워크플로우는 건드리지 않는다
    const custom = await page.evaluate(() => {
        const c = { '73': { class_type: 'LoadImage', inputs: { image: 'old.png' } },
                    '82': { class_type: 'ImageScaleToTotalPixels', inputs: { upscale_method: 'lanczos', megapixels: 2 } },
                    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'x', images: ['63', 0] } } };
        const r = _animaInjectInto(JSON.parse(JSON.stringify(c)), 'p', 'new.png', 7);
        return { itp: r['82'].class_type, mp: r['82'].inputs.megapixels, save: r['9'].inputs.images[0], img: r['73'].inputs.image, added64: !!r['64'] };
    });
    ck('★ 붙여넣은 워크플로우는 크기를 안 건드린다',
        custom.itp === 'ImageScaleToTotalPixels' && custom.mp === 2 && custom.save === '63' && !custom.added64,
        JSON.stringify(custom));
    ck('붙여넣은 워크플로우에도 이미지는 주입된다', custom.img === 'new.png', custom.img);

    // ── 고급 설정에 실제로 나올 숫자가 보이는가
    const ui = await page.evaluate(async ({ make }) => {
        const mk = eval(make);
        _anima.img = { dataURL: mk(896, 1152), name: 'x.png' };
        _animaRenderAdv();
        await new Promise(r => setTimeout(r, 500));
        const el = document.getElementById('anima-sizenote');
        const cb = document.getElementById('anima-matchsrc');
        return { txt: el ? el.innerText.replace(/\s+/g, ' ').trim() : null, checked: cb ? cb.checked : null };
    }, { make: MAKE });
    ck('고급 설정에 결과 크기가 숫자로 보인다', !!ui.txt && /896×1152/.test(ui.txt), String(ui.txt));
    ck('원본과 같음 표시가 뜬다', /원본과 같음/.test(ui.txt || ''), String(ui.txt));
    ck('스위치는 기본으로 켜져 있다', ui.checked === true, String(ui.checked));
    NOTE.push('  고급설정: ' + ui.txt);

    // ── 설정이 저장·복구되는가
    const persist = await page.evaluate(async () => {
        _anima.matchSrcSize = false; _animaSave();
        return JSON.parse(localStorage.getItem('anima_settings_v1')).matchSrcSize;
    });
    ck('스위치가 저장된다', persist === false, String(persist));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(3500);
    const after = await page.evaluate(() => _anima.matchSrcSize);
    ck('새로고침해도 남는다', after === false, String(after));
    await page.evaluate(() => { _anima.matchSrcSize = true; _animaSave(); });

    const real = errs.filter(e => !/Failed to load|net::ERR|favicon/.test(e));
    ck('오류 없음', real.length === 0, real.slice(0, 3).join(' | '));

    await browser.close();
    PASS.forEach(n => console.log('PASS - ' + n));
    NOTE.forEach(n => console.log(n));
    FAIL.forEach(n => console.log('FAIL - ' + n));
    console.log(FAIL.length ? `\n${FAIL.length} FAILED` : '\nALL PASS');
    process.exit(FAIL.length ? 1 : 0);
})();
