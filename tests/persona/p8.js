// ⑧ 규호 — 이미지 변환 / 인페인팅 전용 (원본 갈아끼우고 마스크 칠하고 돌리는 게 전부)
const L = require('./lib');

module.exports = async function (browser, port) {
    const R = L.reporter('⑧ 규호 — 이미지 변환 · 인페인팅 전용');
    const { ctx, page, errs } = await L.boot(browser, {
        port, device: L.PHONE, pre: { pl_layout: 'img2img', adult_optin_v1: '1' },
    });
    await page.waitForTimeout(2500);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    const boot = await page.evaluate(() => ({
        화면: document.body.getAttribute('data-layout'),
        가림막: (() => { const b = document.getElementById('pl-boot'); return !b || b.classList.contains('gone'); })(),
        엔진: typeof renderChips === 'function',
    }));
    R.ck('이미지 변환 화면으로 바로 뜬다', boot.화면 === 'img2img' && boot.가림막, JSON.stringify(boot));
    R.ck('클래식 엔진이 함께 실린다 (변환은 계층을 쓴다)', boot.엔진 === true, String(boot.엔진));

    // ── 인페인팅으로 갈아타기
    const toInpaint = await page.evaluate(async () => {
        const t0 = performance.now();
        applyLayout('inpaint');
        await new Promise(r => setTimeout(r, 800));
        return { ms: Math.round(performance.now() - t0), 화면: document.body.getAttribute('data-layout') };
    });
    R.ck('인페인팅으로 전환된다', toInpaint.화면 === 'inpaint', JSON.stringify(toInpaint));
    R.ck('전환이 2초 안에 끝난다', toInpaint.ms < 2000, toInpaint.ms + 'ms');

    // ── 각자 자기 설정을 따로 쓰는가 (변환 ↔ 인페인팅이 섞이면 안 된다)
    const sep = await page.evaluate(async () => {
        const snap = () => ({ 화면: document.body.getAttribute('data-layout'), 종류: _comfyImgKind, 저장키: _comfyActiveSettingsKey() });
        const out = {};
        applyLayout('img2img'); await new Promise(r => setTimeout(r, 800)); out.변환 = snap();
        applyLayout('inpaint'); await new Promise(r => setTimeout(r, 800)); out.인페인팅 = snap();
        //  이제 각자 자기 키에 표식을 남기고, 화면을 오가며 서로를 덮지 않는지 본다
        localStorage.setItem('comfy_settings_inpaint_v1', JSON.stringify({ url: 'http://INPAINT_ONLY:8188' }));
        applyLayout('img2img'); await new Promise(r => setTimeout(r, 800));
        localStorage.setItem('comfy_settings_transform_v1', JSON.stringify({ url: 'http://TRANSFORM_ONLY:8188' }));
        applyLayout('inpaint'); await new Promise(r => setTimeout(r, 800));
        out.인페인팅값 = localStorage.getItem('comfy_settings_inpaint_v1') || '';
        out.변환값 = localStorage.getItem('comfy_settings_transform_v1') || '';
        return out;
    });
    R.ck('화면마다 쓰는 저장소가 다르다',
        sep.변환.저장키 === 'comfy_settings_transform_v1' && sep.인페인팅.저장키 === 'comfy_settings_inpaint_v1',
        JSON.stringify(sep.변환) + ' / ' + JSON.stringify(sep.인페인팅));
    R.ck('한쪽 설정이 다른 쪽을 덮지 않는다',
        !/TRANSFORM_ONLY/.test(sep.인페인팅값) && !/INPAINT_ONLY/.test(sep.변환값),
        (sep.인페인팅값 + ' || ' + sep.변환값).slice(0, 140));
    R.note('변환 → ' + sep.변환.저장키 + ' · 인페인팅 → ' + sep.인페인팅.저장키);

    // ── 이 두 설정이 백업에 담기는가 (예전에 통째로 빠져 있었다)
    const bk = await page.evaluate(() => {
        try { _plEnsureClassic && _plEnsureClassic(); } catch (e) {}
        //  이 사람도 LoRA 하나쯤은 등록해 둔다 — 등록한 적 없으면 백업에 안 담기는 게 정상이다
        localStorage.setItem('comfy_lora_presets_v1', JSON.stringify([{ name: 'x.safetensors', trigger: 't' }]));
        openIOModal('export');
        const v = document.getElementById('io-textarea').value;
        try { document.getElementById('db-io-modal').style.display = 'none'; } catch (e) {}
        return { 변환: /comfy_settings_transform_v1/.test(v), 인페인팅: /comfy_settings_inpaint_v1/.test(v),
                 Anima: /anima_settings_v1/.test(v), LoRA: /comfy_lora_presets_v1/.test(v) };
    });
    R.ck('변환·인페인팅 설정이 백업에 담긴다', bk.변환 && bk.인페인팅, JSON.stringify(bk));
    R.ck('Anima·LoRA 설정도 함께 담긴다', bk.Anima && bk.LoRA, JSON.stringify(bk));

    // ── 원본 갈아끼우기 (투명 PNG → 평탄화). 예전에 여기서 1초 넘게 얼었다
    for (const [label, png] of [['불투명 PNG', L.PNG_OPAQUE], ['투명 PNG', L.PNG_ALPHA]]) {
        const r = await page.evaluate(async ({ png }) => {
            await applyLayout('anima');
            await new Promise(r => setTimeout(r, 700));
            if (!window._animaMounted) { try { await mountAnima(); } catch (e) {} }
            const paints = []; let last = performance.now();
            const tick = () => { const n = performance.now(); paints.push(Math.round(n - last)); last = n; requestAnimationFrame(tick); };
            requestAnimationFrame(tick);
            await new Promise(r => setTimeout(r, 120)); paints.length = 0;
            const t0 = performance.now();
            await _animaSetImage('data:image/png;base64,' + png, '원본', true);
            const ms = Math.round(performance.now() - t0);
            await new Promise(r => setTimeout(r, 500));
            return { ms, 최악프레임: Math.max(...paints), 들어감: !!(_anima.img && _anima.img.dataURL), 썸네일: !!_anima.imgThumb };
        }, { png });
        R.ck(`${label} 원본 넣기 성공`, r.들어감 && r.썸네일, JSON.stringify(r));
        R.ck(`${label} 넣을 때 1초 이상 얼지 않는다`, r.최악프레임 < 1000, r.최악프레임 + 'ms');
        R.note(`${label}: ${r.ms}ms · 최악 프레임 ${r.최악프레임}ms`);
    }

    // ── 새로고침해도 마지막 화면(인페인팅)으로 돌아오는가
    await page.evaluate(async () => { await applyLayout('inpaint'); });
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(3000);
    const back = await page.evaluate(() => ({
        화면: document.body.getAttribute('data-layout'),
        설정: localStorage.getItem('comfy_settings_inpaint_v1') || '',
    }));
    R.ck('새로고침하면 인페인팅으로 돌아온다', back.화면 === 'inpaint', String(back.화면));
    R.ck('인페인팅 설정이 살아 있다', back.설정.length > 10, back.설정.slice(0, 60));

    const re = L.realErrs(errs);
    R.ck('오류 없음', re.length === 0, re.slice(0, 3).join(' | '));
    await ctx.close();
    return R;
};
