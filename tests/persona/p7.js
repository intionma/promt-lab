// ⑦ 다인 — 부루 모델(Illustrious/WAI) 유저 (태그만 씀, 앞 75토큰이 생명, LoRA 3~4개 물림)
const L = require('./lib');

module.exports = async function (browser, port) {
    const R = L.reporter('⑦ 다인 — 부루 모델 유저 (LoRA 4개 · 75토큰)');
    const { ctx, page, errs } = await L.boot(browser, {
        port, device: L.PC, pre: { pl_layout: 'classic', adult_optin_v1: '1' },
    });
    await page.waitForFunction(() => !!document.getElementById('chip-container-1'), null, { timeout: 20000 });
    await page.waitForTimeout(1800);

    // ── 1계층에 이미 화질 태그가 잔뜩 있는 평소 상태
    await page.evaluate(() => {
        window.showToast = () => {};
        document.getElementById('layer-1').value = 'masterpiece, best quality, ultra detailed, absurdres, very aesthetic';
        document.getElementById('layer-3').value = '1girl, blue eyes, long hair';
        syncFromManualInput(1, true); syncFromManualInput(3, true);
    });

    // ── LoRA 4개를 등록하고 순서대로 켠다
    const on = await page.evaluate(async () => {
        _comfyLoraPresets = [
            { name: 'styleA.safetensors', label: 'A', trigger: 'trigA', strength: 0.8, on: false },
            { name: 'styleB.safetensors', label: 'B', trigger: 'trigB1, trigB2', strength: 0.7, on: false },
            { name: 'charC.safetensors', label: 'C', trigger: 'trigC', strength: 1.0, on: false },
            { name: 'dupD.safetensors', label: 'D', trigger: 'trigA', strength: 0.6, on: false },   // 일부러 A와 같은 트리거
        ];
        _comfyLoraPresetsSave();
        _comfyLoraPresets.forEach(p => _comfyTriggerChips(p.trigger, true));
        const toks = document.getElementById('layer-1').value.split(',').map(s => s.trim()).filter(Boolean);
        return { toks, 앞6: toks.slice(0, 6) };
    });
    R.ck('트리거가 1계층 맨 앞에 꽂힌다', ['trigA', 'trigB1', 'trigB2', 'trigC'].every(t => on.toks.indexOf(t) < 5),
        on.앞6.join(' | '));
    R.ck('같은 트리거를 쓰는 LoRA 2개여도 중복되지 않는다',
        on.toks.filter(t => t === 'trigA').length === 1, on.toks.filter(t => t === 'trigA').length + '개');
    R.ck('원래 화질 태그는 뒤로 밀릴 뿐 사라지지 않는다',
        ['masterpiece', 'best quality', 'ultra detailed', 'absurdres', 'very aesthetic'].every(t => on.toks.includes(t)),
        on.toks.join(', ').slice(0, 90));
    R.note('1계층 앞머리: ' + on.앞6.join(', '));

    // ── 레이어 재배치(정렬)를 눌러도 트리거가 맨 앞을 지키는가
    const sorted = await page.evaluate(() => {
        try { sortLayerByDB(1); } catch (e) { return { err: e.message }; }
        const toks = document.getElementById('layer-1').value.split(',').map(s => s.trim()).filter(Boolean);
        return { 앞4: toks.slice(0, 4), 트리거위치: ['trigA', 'trigB1', 'trigB2', 'trigC'].map(t => toks.indexOf(t)) };
    });
    R.ck('정렬해도 트리거가 맨 앞을 지킨다',
        !sorted.err && sorted.트리거위치.every(i => i >= 0 && i < 4), JSON.stringify(sorted));
    R.note('정렬 후 앞머리: ' + (sorted.앞4 || []).join(', '));

    // ── 트리거를 끄면 트리거만 빠지고 나머지는 그대로
    const off = await page.evaluate(() => {
        _comfyTriggerChips('trigC', false);
        const toks = document.getElementById('layer-1').value.split(',').map(s => s.trim()).filter(Boolean);
        return { 남음: toks.includes('trigC'), 개수: toks.length, 다른트리거: toks.includes('trigA') && toks.includes('trigB1') };
    });
    R.ck('LoRA를 끄면 그 트리거만 빠진다', off.남음 === false && off.다른트리거 === true, JSON.stringify(off));

    // ── 조합이 쓰는 태그와 트리거가 겹칠 때 조합 태그를 지우지 않는가
    const clash = await page.evaluate(() => {
        [1, 2, 3, 4, 5, 6, 7].forEach(n => { document.getElementById('layer-' + n).value = ''; syncFromManualInput(n, true); });
        _activeComboIds.clear();
        const combo = Object.values(comboFS.items).find(i => i.type === 'combo' && i.tags && Object.values(i.tags).join(',').indexOf('tattoo') >= 0);
        if (!combo) return { skip: true };
        applyCombo(combo);
        const before = [1, 2, 3, 4, 5, 6, 7].map(n => document.getElementById('layer-' + n).value).join(', ');
        _comfyTriggerChips('tattoo', true);
        _comfyTriggerChips('tattoo', false);      // 껐다 — 조합 태그를 잡아먹으면 안 된다
        const after = [1, 2, 3, 4, 5, 6, 7].map(n => document.getElementById('layer-' + n).value).join(', ');
        const lost = before.split(',').map(s => s.trim()).filter(t => t && after.indexOf(t) < 0);
        return { 조합: combo.title, 잃은태그: lost };
    });
    if (clash.skip) R.note('겹치는 조합 없음 — 건너뜀');
    else R.ck('LoRA를 끌 때 조합 태그를 잡아먹지 않는다', clash.잃은태그.length === 0,
        clash.조합 + ' 에서 잃음: ' + clash.잃은태그.join(' | '));

    // ── 앞 75토큰 안에 뭐가 들어가는지 실측
    const budget = await page.evaluate(() => {
        [1, 2, 3, 4, 5, 6, 7].forEach(n => { document.getElementById('layer-' + n).value = ''; syncFromManualInput(n, true); });
        document.getElementById('layer-1').value = 'masterpiece, best quality';
        document.getElementById('layer-3').value = Array.from({ length: 40 }, (_, i) => 'tagX' + i).join(', ');
        syncFromManualInput(1, true); syncFromManualInput(3, true);
        _comfyTriggerChips('trigA, trigB1', true);
        const v = (document.getElementById('final-positive') || {}).value || '';
        //  아주 거친 추정 — 쉼표 단위 토큰 하나를 대략 2토큰으로 본다
        const toks = v.split(',').map(s => s.trim()).filter(Boolean);
        return { 첫토큰: toks[0], 총토큰수: toks.length, 트리거인덱스: [toks.indexOf('trigA'), toks.indexOf('trigB1')],
                 고정프리픽스: /^score_|^source_/.test(toks[0] || '') };
    });
    R.ck('LoRA 트리거가 앞 10토큰(=75토큰 예산 앞머리) 안에 있다',
        budget.트리거인덱스.every(i => i >= 0 && i < 10),
        `첫 토큰="${budget.첫토큰}" 위치=${budget.트리거인덱스.join(',')}`);
    R.note('맨 앞은 고정 프리픽스(' + budget.첫토큰 + ') — 설정한 대로다');
    R.note(`최종 ${budget.총토큰수}개 토큰 · 트리거 위치 ${budget.트리거인덱스.join(', ')}`);

    const re = L.realErrs(errs);
    R.ck('오류 없음', re.length === 0, re.slice(0, 3).join(' | '));
    await ctx.close();
    return R;
};
