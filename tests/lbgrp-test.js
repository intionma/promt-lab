// ① Anima 크게보기 = 원본 + '그 원본으로 뽑은 것들'만  ② 후타 콘돔 축 (v9.154.0)
const { chromium } = require('playwright-core');
const PASS = [], FAIL = [], NOTE = [];
const ck = (n, ok, d) => (ok ? PASS : FAIL).push(n + (ok || !d ? '' : ' :: ' + d));
const px = (c) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="60"><rect width="40" height="60" fill="${c}"/></svg>`);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
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
    await page.waitForTimeout(4500);
    await page.evaluate(() => { window.showToast = () => {}; });

    // ══ ① 크게보기 묶음 ══════════════════════════════════════════════════
    //  원본 A 로 3장, 원본 B 로 2장 뽑아 둔 상태. 지금 원본은 A.
    await page.evaluate(({ a }) => {
        _anima.img = { dataURL: a, name: 'A.png' };
        _anima.srcKey = 'KEY_A';
        _anima.results = [
            { k: 1, url: 'http://x/a3.png', seed: 3, src: 'KEY_A', opt: '문신' },
            { k: 2, url: 'http://x/b2.png', seed: 9, src: 'KEY_B', opt: '다른원본' },
            { k: 3, url: 'http://x/a2.png', seed: 2, src: 'KEY_A', opt: '임신' },
            { k: 4, url: 'http://x/b1.png', seed: 8, src: 'KEY_B', opt: '다른원본' },
            { k: 5, url: 'http://x/a1.png', seed: 1, src: 'KEY_A', opt: '' },
        ];
        _animaResSel = 0;
        //  ★ 「이미지 넣기」 카드도 그려야 미리보기 <img> 가 생긴다. v9.179.0부터 2단에서는
        //    원본을 그 미리보기로 크게 보므로, 안 그리면 '원본 열기' 검사가 헛돈다.
        try { _animaRenderInput(); } catch (e) {}
        _animaRenderResult();
    }, { a: px('#111') });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
        window.__lb = null;
        const real = window.openLightbox;
        window.openLightbox = function (url, urls, idx) {
            window.__lb = { url, urls: (urls || []).slice(), idx, caps: (window._lbCapPending || []).slice(), live: window._lbLivePending };
            return real.apply(this, arguments);
        };
    });
    //  ★ 이 검사는 1400px(2단)에서 돈다. v9.179.0부터 2단에서는 비교 칸에 원본 프레임이 없고
    //    (왼쪽 칸이 기준을 맡는다) 원본은 「이미지 넣기」의 큰 미리보기를 눌러 크게 본다.
    //    → lb=0(원본)은 프레임이 없으면 미리보기를 누르는 것으로 대신한다. '원본을 크게 볼 수 있는가'
    //      라는 검사의 뜻은 그대로 지킨다.
    //  ★ 열리지도 않았는데 history.back() 을 하면 문서가 통째로 날아가 다음 evaluate 가 죽는다
    //    (실제로 그렇게 죽어서 원인을 한참 찾았다) → 열렸을 때만 되돌린다.
    const zoom = async (lb) => {
        await page.evaluate((lb) => {
            window.__lb = null;
            const fr = [...document.querySelectorAll('.anima-frame')].find(f => f.dataset.lb === String(lb));
            if (fr) { fr.click(); return; }
            if (lb === 0) { const im = document.querySelector('#anima-input img'); if (im) im.click(); }
        }, lb);
        await page.waitForTimeout(350);
        const r = await page.evaluate(() => window.__lb && { url: __lb.url, urls: __lb.urls, idx: __lb.idx, caps: __lb.caps, live: typeof __lb.live === 'function' });
        const opened = await page.evaluate(() => !!window._lbActive);
        if (opened) { await page.evaluate(() => { try { history.back(); } catch (e) {} }); await page.waitForTimeout(300); }
        return r;
    };

    const g = await zoom(1);
    //  ★ v9.182.0에서 **의도적으로 뒤집었다**(사용자 요청). 예전엔 '그 원본 것만' 담아서
    //    1장이면 2/2 로 오른쪽 끝이 막혔다 → 그 원본 묶음이 끝나면 최근 결과 전체로 이어붙인다.
    //    바뀐 건 '뒤에 더 붙는다'는 것뿐이고, **앞쪽 차례는 그대로**여야 한다(원본 → 그 원본 결과들).
    ck('★ 앞쪽은 그대로 — 원본 1 + A 3장이 먼저 온다',
       g && g.urls.length >= 4 && /svg/.test(g.urls[0]) && !g.urls.slice(1, 4).some(u => /b[12]\.png/.test(u)),
       g ? JSON.stringify(g.urls.slice(0, 4)) : '(못 잡음)');
    ck('★ 그 뒤로 다른 원본 결과까지 이어져 더 넘길 수 있다 (원본 1 + A 3 + B 2 = 6장)',
       g && g.urls.length === 6 && g.urls.some(u => /b1\.png/.test(u)) && g.urls.some(u => /b2\.png/.test(u)),
       g ? g.urls.length + '장 ' + JSON.stringify(g.urls) : '(못 잡음)');
    ck('★ 같은 그림이 두 번 들어가지 않는다', g && new Set(g.urls).size === g.urls.length,
       g && JSON.stringify(g.urls));
    ck('이어붙은 구간은 「다른 원본」으로 표시된다',
       g && g.caps.slice(4).every(c => /다른 원본/.test(c)), g && JSON.stringify(g.caps));
    ck('첫 자리는 원본이다', g && /svg/.test(g.urls[0]), g && String(g.urls[0]).slice(0, 30));
    ck('시작 위치가 지금 고른 결과다', g && g.urls[g.idx] === 'http://x/a3.png', g && `idx ${g.idx} → ${g.urls[g.idx]}`);
    ck('캡션이 목록과 같은 길이다', g && g.caps.length === g.urls.length, g && `${g.caps.length}/${g.urls.length}`);
    ck('캡션에 몇 번째인지·옵션이 보인다', g && g.caps[0] === '원본' && /1\/3/.test(g.caps[1]), g && JSON.stringify(g.caps));
    ck('크게 본 채로 결과가 늘면 반영되게 넘긴다', g && g.live === true, g && String(g.live));
    NOTE.push('  A 묶음 캡션: ' + (g ? g.caps.join(' | ') : ''));

    const g0 = await zoom(0);
    ck('원본을 눌러 열면 원본에서 시작한다', g0 && g0.idx === 0, g0 && String(g0.idx));
    ck('원본으로 열어도 목록은 같다', g0 && g0.urls.length === 6, g0 && g0.urls.length + '장');

    // 갤러리에서 '다른 원본의 결과'를 고르면 그 결과의 묶음을 따라간다
    const gb = await page.evaluate(async () => {
        _animaResSel = 1;               // b2.png (KEY_B)
        _animaRenderResult();
        await new Promise(r => setTimeout(r, 300));
        window.__lb = null;
        const fr = [...document.querySelectorAll('.anima-frame')].find(f => f.dataset.lb === '1');
        if (fr) fr.click();
        await new Promise(r => setTimeout(r, 250));
        try { if (window._lbActive) history.back(); } catch (e) {}   // ★ 열렸을 때만 — 아니면 문서가 날아간다
        return window.__lb && { urls: window.__lb.urls, idx: window.__lb.idx };
    });
    await page.waitForTimeout(300);
    //  ★ v9.182.0: 고른 결과의 묶음이 **앞으로** 오고, 나머지 최근 결과가 뒤에 이어붙는다.
    //    '다른 원본 것이 안 섞인다'가 아니라 '앞쪽이 그 묶음이다'를 본다.
    ck('★ 다른 원본의 결과를 고르면 그 묶음(B 2장)이 앞으로 온다',
       gb && /b2\.png/.test(gb.urls[1] || '') && /b1\.png/.test(gb.urls[2] || ''),
       gb && JSON.stringify(gb.urls));
    ck('★ 그 뒤로 A 것들이 이어진다 (오른쪽 끝에서 안 막힌다)',
       gb && gb.urls.filter(u => /a[123]\.png/.test(u)).length === 3 && new Set(gb.urls).size === gb.urls.length,
       gb && JSON.stringify(gb.urls));

    // 결과가 하나도 없으면 원본만 (예전과 동일)
    const g1 = await page.evaluate(async () => {
        _anima.results = []; _animaResSel = 0; _animaRenderResult();
        await new Promise(r => setTimeout(r, 300));
        window.__lb = null;
        const fr = [...document.querySelectorAll('.anima-frame')].find(f => f.dataset.lb === '0');
        //  ★ v9.179.0부터 2단에서는 비교 칸에 원본 프레임이 없다(왼쪽 칸이 기준을 맡는다).
        //    원본은 「이미지 넣기」 큰 미리보기를 눌러 크게 본다 — 검사의 뜻은 그대로다.
        if (fr) fr.click(); else { const im = document.querySelector('#anima-input img'); if (im) im.click(); }
        await new Promise(r => setTimeout(r, 250));
        try { if (window._lbActive) history.back(); } catch (e) {}   // ★ 열렸을 때만 — 아니면 문서가 날아간다
        return window.__lb && window.__lb.urls.length;
    });
    await page.waitForTimeout(300);
    ck('결과가 없으면 원본 한 장만', g1 === 1, String(g1));

    // ── 시드를 잠그면 그 그림이 두 번 들어가지 않는가 (검토에서 잡힌 것)
    const lk = await page.evaluate(async () => {
        _anima.results = [
            { k: 1, url: 'http://x/a1.png', seed: 11, src: 'KEY_A', opt: '하나' },
            { k: 2, url: 'http://x/a2.png', seed: 22, src: 'KEY_A', opt: '둘' },
            { k: 3, url: 'http://x/a3.png', seed: 33, src: 'KEY_A', opt: '셋' },
        ];
        _animaResSel = 1;
        _anima.seedLock = { seed: 11, url: 'http://x/a1.png' };   // 왼쪽에 a1 이 뜬다
        _animaRenderResult();
        await new Promise(r => setTimeout(r, 300));
        window.__lb = null;
        const fr = [...document.querySelectorAll('.anima-frame')].find(f => f.dataset.lb === '1');
        if (fr) fr.click();
        await new Promise(r => setTimeout(r, 250));
        try { if (window._lbActive) history.back(); } catch (e) {}   // ★ 열렸을 때만 — 아니면 문서가 날아간다
        const L = window.__lb;
        return L && { urls: L.urls, idx: L.idx, caps: L.caps };
    });
    await page.waitForTimeout(300);
    ck('★ 시드를 잠가도 같은 그림이 두 번 안 들어간다',
        lk && lk.urls.length === new Set(lk.urls).size, lk && JSON.stringify(lk.urls));
    ck('잠근 그림은 제자리에서 잠금 표시를 단다',
        lk && /🔒/.test(lk.caps[0]) && /1\/3/.test(lk.caps[0]), lk && JSON.stringify(lk.caps));
    ck('잠금 중에도 시작 위치는 지금 고른 결과다',
        lk && lk.urls[lk.idx] === 'http://x/a2.png', lk && `idx ${lk.idx}`);
    await page.evaluate(() => { _anima.seedLock = null; _animaRenderResult(); });
    await page.waitForTimeout(250);

    // ── 대기열 작업이 '결과 크기' 스위치를 물고 가는가 (검토에서 잡힌 것)
    const snap = await page.evaluate(() => ({
        있음: _ANIMA_SNAP_KEYS.indexOf('matchSrcSize') >= 0,
        스냅: _animaSnapshotSettings().matchSrcSize,
    }));
    ck('★ 대기열 스냅샷에 결과 크기 스위치가 담긴다', snap.있음 === true, JSON.stringify(snap));

    // ── 캡션에 축이 빠지지 않는가 (검토에서 잡힌 것)
    const lab = await page.evaluate(() => {
        const set = (ids) => { _anima.snippets.forEach(s => { if (s.kind !== 'base') s.on = false; }); ids.forEach(i => _animaToggleSnip(i)); return _animaOptLabel(); };
        return {
            장식: set(['tat_fil_arm', 'tat_fil_chest']),
            색: set(['skin_tan', 'tan_bikini', 'nip_black']),
            후타끔: set(['fcon_used']),
            후타켬: set(['futa_normal', 'fcon_used']),
        };
    });
    ck('★ 장식 문신이 캡션에 나온다', /팔·어깨/.test(lab.장식) && /흉골/.test(lab.장식), lab.장식);   // v9.165.0 이름 통일
    ck('★ 피부색·자국·유두 색이 캡션에 나온다', /태닝/.test(lab.색) && /비키니/.test(lab.색) && /흑갈/.test(lab.색), lab.색);
    ck('후타를 안 켰으면 후타 상세는 캡션에 안 나온다', !/콘돔/.test(lab.후타끔), lab.후타끔);
    //  v9.165.0: 칩 이름이 '콘돔 (정액 참)' → '정액 참' 으로 짧아졌다(라벨에 이미 '콘돔'이 있어서)
    ck('후타를 켜면 콘돔이 캡션에 나온다', /정액 참/.test(lab.후타켬), lab.후타켬);
    NOTE.push('  캡션 예: ' + lab.색 + '  |  ' + lab.후타켬);

    // ── 크게 본 채로 새 결과가 도착했을 때 어디에 있어야 하는가 ────────────
    //  ① 최신을 보고 있었으면 → 자리를 지키고 그림이 새것으로 갈아끼워진다(결과창이 교체되는 느낌)
    //  ② 뒤로 넘겨 옛것을 보고 있었으면 → 그 그림을 계속 본다(번호만 밀린다)
    const arrive = async (startBack) => await page.evaluate(async (startBack) => {
        _anima.seedLock = null;
        _anima.srcKey = 'KEY_A';
        _anima.results = [
            { k: 20, url: 'http://x/new2.png', seed: 2, src: 'KEY_A', opt: '둘' },
            { k: 10, url: 'http://x/new1.png', seed: 1, src: 'KEY_A', opt: '하나' },
        ];
        _animaResSel = 0;
        _animaRenderResult();
        await new Promise(r => setTimeout(r, 250));
        const fr = [...document.querySelectorAll('.anima-frame')].find(f => f.dataset.lb === '1');
        fr.click();                                   // 크게 보기 열기 (최신 = 머리 자리)
        await new Promise(r => setTimeout(r, 300));
        const cur = () => {
            const im = document.querySelector('#lightbox img, .lb-img, #lightbox-img');
            return { idx: window.__lbIdxProbe ? window.__lbIdxProbe() : null };
        };
        for (let i = 0; i < startBack; i++) { window.lightboxNav(1); await new Promise(r => setTimeout(r, 200)); }
        const before = window.__lbState();
        // 새 결과 도착 — 앱이 하는 그대로 맨 앞에 넣고 라이트박스에 알린다
        _anima.results.unshift({ k: 30, url: 'http://x/new3.png', seed: 3, src: 'KEY_A', opt: '셋' });
        _animaResSel = 0;
        try { window._lbRefresh(); } catch (e) {}
        await new Promise(r => setTimeout(r, 300));
        const after = window.__lbState();
        try { if (window._lbActive) history.back(); } catch (e) {}   // ★ 열렸을 때만 — 아니면 문서가 날아간다
        return { before, after };
    }, startBack);

    //  라이트박스 내부 상태를 읽을 창구 (idx·현재 url)
    await page.evaluate(() => {
        window.__lbState = () => {
            const cap = document.getElementById('img-lightbox-cap');
            const cnt = document.getElementById('img-lightbox-counter');
            return {
                cap: cap ? cap.textContent.trim() : null,
                counter: cnt ? cnt.textContent.replace(/\s+/g, ' ').trim() : null,
                열림: (document.getElementById('img-lightbox') || {}).style ? document.getElementById('img-lightbox').style.display : null,
            };
        };
    });

    const head = await arrive(0);
    ck('★ 최신을 보다가 새 결과가 오면 그 새것으로 갈아끼워진다',
        head.after.cap && /1\/3/.test(head.after.cap) && /셋/.test(head.after.cap),
        `전 ${head.before.cap} → 후 ${head.after.cap}`);
    NOTE.push(`  최신 자리: ${head.before.cap} → ${head.after.cap}`);

    const older = await arrive(1);
    ck('★ 옛것을 보고 있으면 그 그림을 계속 본다',
        older.after.cap && /하나/.test(older.after.cap) && /3\/3/.test(older.after.cap),
        `전 ${older.before.cap} → 후 ${older.after.cap}`);
    NOTE.push(`  옛것 자리: ${older.before.cap} → ${older.after.cap}`);

    // ══ ② 후타 콘돔 축 ═══════════════════════════════════════════════════
    const con = await page.evaluate(() => {
        const c = _anima.snippets.filter(s => s.group === 'futaCondom');
        return { n: c.length, names: c.map(s => s.name), detail: c.every(s => s.detail === 'futa'),
                 nsfw: c.every(s => s.nsfw), multi: c.filter(s => s.multi).map(s => s.name),
                 texts: c.map(s => s.text) };
    });
    ck('콘돔 축이 5개 들어갔다', con.n === 5, JSON.stringify(con.names));
    ck('전부 후타 상세로 묶여 있다', con.detail === true, '');
    ck('전부 성인 표시 대상이다', con.nsfw === true, '');
    ck('포장지만 여러 개 켜기다', con.multi.length === 1 && con.multi[0] === '포장지', JSON.stringify(con.multi));   // v9.165.0 이름 통일
    ck('서술 안에 쉼표를 쓰지 않았다', con.texts.every(t => {
        const head = t.split(',')[0]; return head.split(' ').length >= 8;
    }), JSON.stringify(con.texts.map(t => t.split(',')[0])));
    NOTE.push('  콘돔: ' + con.names.join(' / '));

    // 착용 상태는 하나만 · 포장지는 같이 켜진다
    const excl = await page.evaluate(() => {
        _anima.snippets.forEach(s => { if (s.kind !== 'base') s.on = false; });
        _animaToggleSnip('fcon_on'); _animaToggleSnip('fcon_used');
        const a = _anima.snippets.filter(s => s.on && s.group === 'futaCondom').map(s => s.id);
        _animaToggleSnip('fcon_wrap');
        const b = _anima.snippets.filter(s => s.on && s.group === 'futaCondom').map(s => s.id);
        return { a, b };
    });
    ck('착용 상태는 하나만 켜진다', excl.a.length === 1 && excl.a[0] === 'fcon_used', JSON.stringify(excl.a));
    ck('포장지는 착용 상태와 같이 켜진다', excl.b.length === 2, JSON.stringify(excl.b));

    // 후타를 안 켜면 프롬프트에 안 나가고, 켜면 나간다
    const shoot = async () => {
        sent.length = 0;
        await page.evaluate(async () => {
            try { localStorage.setItem('comfy_settings_v1', JSON.stringify({ url: location.origin })); } catch (e) {}
            const c = document.createElement('canvas'); c.width = 832; c.height = 1216; c.getContext('2d').fillRect(0, 0, 832, 1216);
            _anima.img = { dataURL: c.toDataURL('image/png'), name: 'x.png' }; _anima.uploadedName = 'x.png';
            _animaJobs.length = 0;
            await _animaGenerate(true);
        });
        await page.waitForTimeout(2200);
        return (sent[0] && sent[0].prompt && sent[0].prompt['67'] && sent[0].prompt['67'].inputs.text) || '';
    };
    const noFuta = await shoot();
    ck('★ 후타를 안 켜면 콘돔이 안 나간다', !/condom/.test(noFuta), noFuta.slice(-160));
    await page.evaluate(() => _animaToggleSnip('futa_normal'));
    const withFuta = await shoot();
    ck('★ 후타를 켜면 콘돔이 나간다', /used condom on penis/.test(withFuta), withFuta.slice(-220));
    ck('포장지도 함께 나간다', /condom wrapper/.test(withFuta), withFuta.slice(-220));
    NOTE.push('  전송 꼬리: …' + withFuta.slice(-180));

    // 하단 바·팝오버에 '콘돔' 줄이 뜨는가
    const ui = await page.evaluate(async () => {
        _animaRenderSnippets();
        await new Promise(r => setTimeout(r, 300));
        const rows = [...document.querySelectorAll('.anima-mact .anima-mrow, .anima-mrow')].map(r => (r.querySelector('.anima-mlab') || {}).textContent || '');
        const chips = [...document.querySelectorAll('.anima-chip[data-id^="fcon_"]')].map(c => c.textContent);
        return { rows: rows.filter(Boolean), chips };
    });
    ck('하단 바에 콘돔 칩이 뜬다', ui.chips.length === 5, JSON.stringify(ui.chips));

    //  후타 크기 아이콘을 실제로 눌러 상세 팝오버를 연다 (사용자가 하는 그대로).
    //  ⚠ 아이콘은 하단 바와 옵션 패널 양쪽에 있는데 팝오버를 여는 건 '하단 바' 것뿐이다.
    const pop = await page.evaluate(async () => {
        const ico = document.querySelector('.anima-mact .anima-ico[data-futa]');
        if (!ico) return { err: '하단 바 후타 아이콘 없음' };
        ico.click(); await new Promise(r => setTimeout(r, 420));
        const body = document.querySelector('#anima-futapop .anima-fp-body');
        return {
            열림: !!body,
            콘돔칩: body ? [...body.querySelectorAll('.anima-chip[data-fd^="fcon_"]')].map(c => c.textContent) : [],
            소제목: body ? [...body.querySelectorAll('*')].filter(e => e.textContent.trim() === '콘돔').length : 0,
        };
    });
    ck('후타 팝오버가 열린다', pop.열림 === true, JSON.stringify(pop));
    ck('후타 팝오버에 콘돔 칩 5개가 있다', pop.콘돔칩 && pop.콘돔칩.length === 5, JSON.stringify(pop.콘돔칩));
    ck("팝오버에 '콘돔' 소제목이 있다", pop.소제목 > 0, JSON.stringify(pop));
    NOTE.push('  팝오버 콘돔 칩: ' + (pop.콘돔칩 || []).join(' / '));

    //  팝오버에서 눌러도 실제로 켜지는가 (data-fd 경로)
    const fd = await page.evaluate(async () => {
        const c = document.querySelector('#anima-futapop .anima-chip[data-fd="fcon_multi"]');
        if (!c) return null;
        c.click(); await new Promise(r => setTimeout(r, 250));
        return _anima.snippets.filter(s => s.on && s.group === 'futaCondom').map(s => s.id);
    });
    ck('팝오버에서 콘돔을 누르면 켜진다', fd && fd.indexOf('fcon_multi') >= 0, JSON.stringify(fd));
    await page.evaluate(() => { const x = document.querySelector('#anima-fp-x'); if (x) x.click(); });
    await page.waitForTimeout(250);

    // ★ 기존 사용자에게도 들어가는가
    await page.evaluate(() => {
        const cur = JSON.parse(localStorage.getItem('anima_settings_v1'));
        cur.snippets = (cur.snippets || []).filter(s => !/^fcon_/.test(s.id));
        localStorage.setItem('anima_settings_v1', JSON.stringify(cur));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(3800);
    const back = await page.evaluate(() => {
        const c = _anima.snippets.filter(s => s.group === 'futaCondom');
        return { n: c.length, multi: c.filter(s => s.multi).length, etc: null };
    });
    ck('★ 기존 사용자에게도 콘돔 축이 들어간다', back.n === 5, JSON.stringify(back));
    ck('★ 새로고침 뒤에도 포장지의 여러 개 켜기가 살아 있다', back.multi === 1, JSON.stringify(back));

    // '기타' 줄로 새지 않는가
    const etc = await page.evaluate(async () => {
        _animaRenderSnippets();
        await new Promise(r => setTimeout(r, 300));
        const rows = [...document.querySelectorAll('.anima-mrow')];
        const e = rows.find(r => /기타/.test((r.querySelector('.anima-mlab') || {}).textContent || ''));
        return e ? [...e.querySelectorAll('.anima-chip')].map(c => c.dataset.id) : [];
    });
    ck('★ 콘돔이 기타 줄로 새지 않는다', !etc.some(id => /^fcon_/.test(id)), JSON.stringify(etc));

    const real = errs.filter(x => !/Failed to load|net::ERR|favicon/.test(x));
    ck('오류 없음', real.length === 0, real.slice(0, 3).join(' | '));

    await browser.close();
    PASS.forEach(n => console.log('PASS - ' + n));
    NOTE.forEach(n => console.log(n));
    FAIL.forEach(n => console.log('FAIL - ' + n));
    console.log(FAIL.length ? `\n${FAIL.length} FAILED` : '\nALL PASS');
    process.exit(FAIL.length ? 1 : 0);
})();
