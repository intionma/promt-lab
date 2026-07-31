// ④ 하늘 — 프리셋 수집가 (40개 저장해 두고 상황마다 갈아 끼움. 175개짜리 대형 프리셋 포함)
const L = require('./lib');

module.exports = async function (browser, port) {
    const R = L.reporter('④ 하늘 — 프리셋 40개 수집가');
    const { ctx, page, errs } = await L.boot(browser, {
        port, device: L.PC, pre: { pl_layout: 'classic', adult_optin_v1: '1' },
    });
    await page.waitForFunction(() => !!document.getElementById('chip-container-1'), null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });   // 폰에서도 쓴다

    // ── 프리셋 40개를 만든다 (마지막 하나는 태그 175개짜리)
    const made = await page.evaluate(() => {
        window.showToast = () => {};
        const mk = (n) => {
            const s = ['', '', '', '', '', '', ''];
            for (let i = 0; i < n; i++) s[i % 7] += (s[i % 7] ? ', ' : '') + 'P' + n + '_tag' + i;
            return s;
        };
        for (let i = 0; i < 39; i++) userPresets['프리셋' + i] = { states: { [currentContext]: mk(12) }, memo: '' };
        userPresets['대형175'] = { states: { [currentContext]: mk(175) }, memo: '대형' };
        presets = { ...userPresets };
        safeSetStorage('pro_prompt_presets_v7_0', userPresets);
        return Object.keys(userPresets).length;
    });
    R.ck('프리셋 40개가 저장된다', made === 40, String(made));

    // ── 관리창을 연다 (40줄 렌더)
    const openMs = await page.evaluate(() => {
        const t0 = performance.now(); openPresetManager();
        return { ms: Math.round(performance.now() - t0), 줄수: document.querySelectorAll('#preset-table-body tr').length };
    });
    R.ck('프리셋 관리창이 0.5초 안에 열린다', openMs.ms < 500, openMs.ms + 'ms');
    R.note(`관리창 ${openMs.ms}ms · ${openMs.줄수}줄`);

    // ── 175개짜리 적용 — 예전에 여기서 60초 넘게 멈췄다
    const apply = await page.evaluate(async () => {
        const paints = [];
        let last = performance.now();
        const tick = () => { const n = performance.now(); paints.push(Math.round(n - last)); last = n; requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
        await new Promise(r => setTimeout(r, 150));
        paints.length = 0;
        const t0 = performance.now();
        loadPresetFromManager('대형175');
        const ms = Math.round(performance.now() - t0);
        await new Promise(r => setTimeout(r, 900));
        const 최악 = Math.max(...paints);
        const l1 = document.getElementById('layer-1').value;
        return { ms, 최악멈춤: 최악, 적용됨: l1.slice(0, 40), 태그수: [1, 2, 3, 4, 5, 6, 7].reduce((a, n) => a + document.getElementById('layer-' + n).value.split(',').filter(s => s.trim()).length, 0) };
    });
    R.ck('175개 프리셋 적용이 1초 안에 끝난다', apply.ms < 1000, apply.ms + 'ms');
    R.ck('적용 중 화면이 1초 넘게 멈추지 않는다', apply.최악멈춤 < 1000, apply.최악멈춤 + 'ms');
    R.ck('175개가 실제로 다 들어온다', apply.태그수 === 175, String(apply.태그수));
    R.note(`적용 ${apply.ms}ms · 최악 프레임 ${apply.최악멈춤}ms · 첫 태그 "${apply.적용됨}"`);

    // ── 다른 프리셋으로 갈아 끼우기 5연속 (평소 쓰는 방식)
    const swaps = await page.evaluate(async () => {
        const out = [];
        for (let i = 0; i < 5; i++) {
            const t0 = performance.now();
            loadPresetFromManager('프리셋' + i);
            out.push(Math.round(performance.now() - t0));
            await new Promise(r => setTimeout(r, 60));
        }
        return { out, 마지막: document.getElementById('layer-1').value.slice(0, 20) };
    });
    R.ck('연속으로 갈아 끼워도 매번 0.5초 안', Math.max(...swaps.out) < 500, swaps.out.join('/') + 'ms');
    R.ck('갈아 끼운 내용이 실제로 바뀐다', /P12_tag/.test(swaps.마지막), swaps.마지막);

    // ── 프리셋 저장 → 새로고침 → 그대로 남아 있나
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const keep = await page.evaluate(() => ({
        개수: Object.keys(typeof userPresets !== 'undefined' ? userPresets : {}).length,
        대형: !!(typeof userPresets !== 'undefined' && userPresets['대형175']),
    }));
    R.ck('새로고침 뒤에도 40개가 그대로', keep.개수 === 40 && keep.대형, JSON.stringify(keep));

    const re = L.realErrs(errs);
    R.ck('오류 없음', re.length === 0, re.slice(0, 3).join(' | '));
    await ctx.close();
    return R;
};
