// ⑥ 서린 — 실사 머지(Pony Realism) 유저 (문장 + 태그 병행 조합을 즐겨 씀)
const L = require('./lib');

module.exports = async function (browser, port) {
    const R = L.reporter('⑥ 서린 — 실사 머지 유저 (문장형 조합)');
    const { ctx, page, errs } = await L.boot(browser, {
        port, device: L.PC, pre: { pl_layout: 'classic', adult_optin_v1: '1', adult_pack_v1: '1', hardcore_pack_v1: '1' },
    });
    await page.waitForFunction(() => !!document.getElementById('chip-container-1'), null, { timeout: 20000 });
    await page.waitForTimeout(2000);

    // ── 성인 팩을 켜서 조합이 나오게 한다
    const combos = await page.evaluate(() => {
        window.showToast = () => {};
        //  성인 태그팩(카탈로그)이 설치된 상태를 만든다 — 조합은 여기서 나온다
        try { _catalogInstalledIds.add('nsfw-adult'); _packReconcileAll(true); } catch (e) {}
        const ids = Object.keys(comboFS.items).filter(id => id.indexOf('pack_nsfw-adult_c') === 0);
        return ids.map(id => ({ id, title: comboFS.items[id].title, layers: Object.keys(comboFS.items[id].tags) }));
    });
    if (combos.length < 10) { R.ck('성인 조합이 설치돼 있다', false, combos.length + '개 — 팩이 안 켜졌다'); await ctx.close(); return R; }
    R.ck('성인 조합이 설치돼 있다', combos.length >= 10, combos.length + '개');
    const 문신 = combos.filter(c => /문신|낙서|음문|문양/.test(c.title));
    R.ck('문신 계열 조합 5개가 있다', 문신.length === 5, 문신.map(c => c.title).join(' / '));
    R.note(문신.map(c => c.title).join(' · '));

    // ── 문신 조합을 하나씩 켜 보고: 문장이 살아 있는가 / 태그도 같이 있는가
    for (const c of 문신) {
        const r = await page.evaluate((id) => {
            const combo = comboFS.items[id];
            [1, 2, 3, 4, 5, 6, 7].forEach(n => { document.getElementById('layer-' + n).value = ''; syncFromManualInput(n, true); });
            _activeComboIds.clear();
            applyCombo(combo);
            const all = [1, 2, 3, 4, 5, 6, 7].map(n => document.getElementById('layer-' + n).value).join(', ');
            const toks = all.split(',').map(s => s.trim()).filter(Boolean);
            //  '문장' = 공백이 3개 이상인 토큰(자연어 서술) / '태그' = 그 외
            const 문장 = toks.filter(t => (t.match(/ /g) || []).length >= 3);
            const 태그 = toks.filter(t => (t.match(/ /g) || []).length < 3);
            return {
                켜짐: _activeComboIds.has(id), 문장수: 문장.length, 태그수: 태그.length,
                가장긴문장: (문장.sort((a, b) => b.length - a.length)[0] || '').slice(0, 70),
            };
        }, c.id);
        R.ck(`「${c.title}」 문장 + 태그가 함께 들어간다`, r.문장수 >= 1 && r.태그수 >= 3,
            `문장 ${r.문장수} / 태그 ${r.태그수}`);
        R.note(`  ${c.title}: 문장 ${r.문장수}개 · 태그 ${r.태그수}개 — "${r.가장긴문장}…"`);
    }

    // ── 자연어 서술 안에 쉼표가 섞이면 문장이 조각난다 (규칙 위반 검사)
    const commaCheck = await page.evaluate(() => {
        const bad = [];
        Object.entries(comboFS.items).forEach(([id, it]) => {
            if (it.type !== 'combo' || !it.tags) return;
            Object.values(it.tags).forEach(v => {
                v.split(',').map(s => s.trim()).forEach(t => {
                    //  괄호 가중치를 뺀 순수 토큰이 5단어 이상인데 끝이 접속사로 끝나면 잘린 문장일 가능성
                    if ((t.match(/ /g) || []).length >= 4 && /\b(and|with|her|his|the|of|in|on)$/i.test(t)) bad.push(it.title + ' :: ' + t.slice(-40));
                });
            });
        });
        return bad;
    });
    R.ck('자연어 서술이 쉼표로 잘리지 않았다', commaCheck.length === 0, commaCheck.slice(0, 3).join(' | '));

    // ── 긴 서술이 캡슐로 들어갈 때 한글 이름이 붙는가 (_NL_KO)
    const ko = await page.evaluate(() => {
        const combo = Object.values(comboFS.items).find(i => i.type === 'combo' && /★ 문신 도배 극한/.test(i.title || ''));
        [1, 2, 3, 4, 5, 6, 7].forEach(n => { document.getElementById('layer-' + n).value = ''; syncFromManualInput(n, true); });
        _activeComboIds.clear(); applyCombo(combo);
        switchViewMode('visual'); renderChips(3);
        const chips = [...document.querySelectorAll('#chip-container-3 .prompt-chip:not(.chip-add-input)')];
        //  캡슐은 [한글 이름][영문 원문] 두 줄로 그려진다 — 긴 서술에 한글 이름이 붙었는지만 본다
        const raw = document.getElementById('layer-3').value.split(',').map(s => s.trim()).filter(Boolean);
        const 긴서술 = raw.filter(t => t.replace(/^\(|:[\d.]+\)$/g, '').length > 40);
        const 이름없음 = [];
        긴서술.forEach(t => {
            const chip = chips.find(c => c.textContent.indexOf(t.replace(/^\(|:[\d.]+\)$/g, '').slice(0, 30)) >= 0);
            const 이름 = chip ? (chip.textContent.trim().split(/[a-z(]/i)[0] || '').trim() : '';
            if (!이름 || 이름.length < 2) 이름없음.push(t.slice(0, 40));
        });
        return { 캡슐수: chips.length, 긴서술수: 긴서술.length, 이름없음, 예시: chips.map(c => c.textContent.trim().slice(0, 24)).slice(0, 5) };
    });
    R.ck('모든 긴 서술에 짧은 한글 이름이 붙어 있다', ko.이름없음.length === 0, ko.이름없음.join(' | '));
    R.note('긴 서술 ' + ko.긴서술수 + '개 — 전부 한글 이름 있음');
    R.note('캡슐 ' + ko.캡슐수 + '개 — ' + ko.예시.join(' | '));

    // ── 조합 켜기 → 끄기 왕복이 깨끗한가 (다른 태그를 잡아먹지 않는가)
    const round = await page.evaluate(() => {
        [1, 2, 3, 4, 5, 6, 7].forEach(n => { document.getElementById('layer-' + n).value = ''; syncFromManualInput(n, true); });
        _activeComboIds.clear();
        document.getElementById('layer-3').value = 'my own tag, tattoo lover, keepme';
        syncFromManualInput(3, true);
        const before = document.getElementById('layer-3').value;
        const combo = Object.values(comboFS.items).find(i => i.type === 'combo' && /★ 문신 도배 극한/.test(i.title || ''));
        applyCombo(combo);
        const 켠뒤 = document.getElementById('layer-3').value;
        applyCombo(combo);
        const after = document.getElementById('layer-3').value;
        const norm = s => s.split(',').map(x => x.trim()).filter(Boolean).sort().join('|');
        return { 원복: norm(before) === norm(after), before, after, 늘어남: 켠뒤.length > before.length };
    });
    R.ck('조합을 켰다 끄면 원래 태그가 그대로 남는다', round.원복 === true, `"${round.before}" → "${round.after}"`);
    R.ck('조합을 켜면 실제로 태그가 늘어난다', round.늘어남 === true, String(round.늘어남));

    // ── 최종 프롬프트에 문장이 온전히 실려 나가는가
    const fin = await page.evaluate(() => {
        const combo = Object.values(comboFS.items).find(i => i.type === 'combo' && /★ 문신 도배 극한/.test(i.title || ''));
        _activeComboIds.clear();
        [1, 2, 3, 4, 5, 6, 7].forEach(n => { document.getElementById('layer-' + n).value = ''; syncFromManualInput(n, true); });
        applyCombo(combo);
        const v = (document.getElementById('final-positive') || {}).value || '';
        return { 길이: v.length, 문장있음: /every inch of her skin/.test(v), 태그있음: /facial tattoo/.test(v) };
    });
    R.ck('최종 프롬프트에 서술 문장이 온전히 실린다', fin.문장있음 === true, '길이 ' + fin.길이);
    R.ck('최종 프롬프트에 태그도 함께 실린다', fin.태그있음 === true, '길이 ' + fin.길이);

    const re = L.realErrs(errs);
    R.ck('오류 없음', re.length === 0, re.slice(0, 3).join(' | '));
    await ctx.close();
    return R;
};
