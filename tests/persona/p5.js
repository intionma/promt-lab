// ⑤ 준영 — 태그 DB 관리자 (커스텀 태그 수백 개, 중복감지·자동분류·DB검사를 주기적으로 돌림)
const L = require('./lib');

module.exports = async function (browser, port) {
    const R = L.reporter('⑤ 준영 — 태그 DB 관리자');
    const { ctx, page, errs } = await L.boot(browser, {
        port, device: L.PC, pre: { pl_layout: 'classic', adult_optin_v1: '1' },
    });
    await page.waitForFunction(() => !!document.getElementById('chip-container-1'), null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    page.on('dialog', d => d.dismiss().catch(() => {}));

    // ── 커스텀 태그 300개 + 일부러 만든 중복 6개 + 일부러 틀린 계층 3개
    const seeded = await page.evaluate(() => {
        window.showToast = () => {}; window.confirm = () => false; window.alert = () => {};
        const FK = '__내폴더__';
        for (let lid = 1; lid <= 7; lid++) { if (!promptDB[lid]) promptDB[lid] = {}; promptDB[lid][FK] = promptDB[lid][FK] || []; }
        for (let i = 0; i < 300; i++) {
            const lid = (i % 7) + 1;
            promptDB[lid][FK].push({ t: 'mytag_' + i, k: '내태그' + i });
        }
        // 같은 태그를 다른 계층에도 넣는다 = 중복 6건
        for (let i = 0; i < 6; i++) promptDB[((i % 7) + 2) > 7 ? 1 : ((i % 7) + 2)][FK].push({ t: 'mytag_' + i, k: '중복' + i });
        // 사전상 1계층인 화질 태그를 6계층에 잘못 넣는다 = 계층 불일치
        ['masterpiece', 'best quality', 'ultra detailed'].forEach(t => promptDB[6][FK].push({ t, k: '잘못놓음' }));
        try { safeSetStorage('pro_prompt_db_v7_0', promptDB); } catch (e) {}
        try { _acInvalidate && _acInvalidate(); } catch (e) {}
        let total = 0;
        for (let lid = 1; lid <= 7; lid++) Object.values(promptDB[lid] || {}).forEach(a => total += a.length);
        return { total, 내것: 309 };
    });
    R.ck('커스텀 태그 309개가 DB에 들어간다', seeded.total > 300, String(seeded.total));

    // ── 중복 감지 (이 도구는 DB가 아니라 '지금 에디터에 적힌 프롬프트'의 중복을 본다)
    const dedup = await page.evaluate(() => {
        document.getElementById('layer-3').value = 'mytag_1, blue eyes, mytag_1, mytag_2';
        document.getElementById('layer-5').value = 'mytag_2, running';
        syncFromManualInput(3, true); syncFromManualInput(5, true);
        const t0 = performance.now();
        openDedupHelper();
        const ms = Math.round(performance.now() - t0);
        const box = document.getElementById('__dedup-dialog');
        const txt = box ? box.textContent : '';
        const 건수 = (txt.match(/mytag_/g) || []).length;
        return { ms, 열림: !!box, 없다고함: /중복 프롬프트가 없습니다/.test(txt), 건수, 미리보기: txt.slice(0, 120).replace(/\s+/g, ' ') };
    });
    R.ck('중복 감지 창이 열린다', dedup.열림 === true, JSON.stringify(dedup));
    R.ck('에디터에 넣은 중복 2건(계층 안·계층 간)을 찾아낸다', !dedup.없다고함 && dedup.건수 >= 2, `찾은 언급 ${dedup.건수}건 / 없다고함=${dedup.없다고함}`);
    R.ck('중복 감지가 2초 안에 끝난다', dedup.ms < 2000, dedup.ms + 'ms');
    R.note('중복 감지 ' + dedup.ms + 'ms — ' + dedup.미리보기);

    await page.evaluate(() => { const b = document.getElementById('__dedup-dialog'); if (b) b.remove(); });

    // ── DB 검사 (계층 검증)
    const audit = await page.evaluate(() => {
        const t0 = performance.now();
        openDBAuditModal();
        const ms = Math.round(performance.now() - t0);
        const vis = [...document.querySelectorAll('body > div')].filter(e => {
            const s = getComputedStyle(e); return s.position === 'fixed' && s.display !== 'none' && e.getBoundingClientRect().height > 100;
        });
        const txt = vis.map(e => e.textContent).join(' ');
        return {
            ms, 열림: vis.length > 0,
            잘못놓음찾음: /masterpiece|best quality|ultra detailed/.test(txt),
            미리보기: txt.slice(0, 160).replace(/\s+/g, ' '),
        };
    });
    R.ck('DB 검사 창이 열린다', audit.열림 === true, JSON.stringify(audit).slice(0, 140));
    R.ck('6계층에 잘못 넣은 화질 태그를 지적한다', audit.잘못놓음찾음 === true, audit.미리보기);
    R.ck('DB 검사가 3초 안에 끝난다', audit.ms < 3000, audit.ms + 'ms');
    R.note('DB 검사 ' + audit.ms + 'ms — ' + audit.미리보기);

    await page.evaluate(() => {
        [...document.querySelectorAll('body > div')].forEach(e => {
            if (['pl-boot', 'toast-container', 'app-container', 'gt-menu'].includes(e.id)) return;
            const s = getComputedStyle(e); if (s.position === 'fixed' && e.getBoundingClientRect().height > 100) e.style.display = 'none';
        });
    });

    // ── 자동 분류 (붙여넣기 → 계층 추정)
    const cls = await page.evaluate(async () => {
        openPromptClassifyModal();
        await new Promise(r => setTimeout(r, 200));
        const ta = [...document.querySelectorAll('textarea')].filter(t => t.offsetParent !== null).pop();
        if (!ta) return { err: '입력칸 없음' };
        ta.value = 'masterpiece, 1girl, blue eyes, school uniform, running, forest background, rim lighting';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        const t0 = performance.now();
        // 추정 버튼을 찾아 누른다
        const btn = [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && /분류|추정|분석|적용/.test(b.textContent))[0];
        if (btn) btn.click();
        await new Promise(r => setTimeout(r, 700));
        const ms = Math.round(performance.now() - t0);
        const box = ta.closest('div[style*="fixed"]') || document.body;
        const txt = box.textContent;
        return { ms, 열림: true, 버튼: btn ? btn.textContent.trim().slice(0, 20) : null, 결과보임: /1girl|blue eyes|school uniform/.test(txt) };
    });
    R.ck('자동 분류 창이 열리고 입력을 받는다', !cls.err, JSON.stringify(cls).slice(0, 120));
    R.ck('붙여넣은 태그를 실제로 처리한다', cls.결과보임 === true, JSON.stringify(cls).slice(0, 160));
    R.note('자동 분류 ' + cls.ms + 'ms · 버튼="' + cls.버튼 + '"');

    // ── 새로 넣은 태그가 자동완성에 바로 잡히는가
    const ac = await page.evaluate(async () => {
        const FK = '__내폴더__';
        promptDB[2][FK].push({ t: 'freshtag_zzz', k: '새태그' });
        try { safeSetStorage('pro_prompt_db_v7_0', promptDB); } catch (e) {}
        try { _acInvalidate && _acInvalidate(); } catch (e) {}
        await new Promise(r => setTimeout(r, 150));
        renderChips(2);
        const inp = document.querySelector('#chip-container-2 .chip-add-input');
        inp.focus(); inp.value = 'freshtag';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 500));
        const box = document.getElementById('tag-ac');
        return {
            떴나: !!(box && box.style.display !== 'none'), 내용: box ? box.textContent.slice(0, 60) : '(없음)',
            직접검색: (typeof _acSuggest === 'function' ? _acSuggest('freshtag', 10) : []).map(x => x.en),
            내장검색: (typeof _acSuggest === 'function' ? _acSuggest('blue ey', 3) : []).map(x => x.en),
        };
    });
    R.ck('내장 사전 태그는 자동완성에 나온다', (ac.내장검색 || []).length > 0, JSON.stringify(ac.내장검색));
    R.ck('직접 만든 태그도 자동완성에 나온다', (ac.직접검색 || []).indexOf('freshtag_zzz') >= 0, '검색 결과: ' + JSON.stringify(ac.직접검색));

    // ── DB가 실제로 저장됐는가 (새로고침 후)
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const persist = await page.evaluate(() => {
        let n = 0;
        for (let lid = 1; lid <= 7; lid++) (promptDB[lid] && promptDB[lid]['__내폴더__'] || []).forEach(() => n++);
        return n;
    });
    R.ck('새로고침 뒤에도 커스텀 태그가 남아 있다', persist >= 300, String(persist));

    const re = L.realErrs(errs);
    R.ck('오류 없음', re.length === 0, re.slice(0, 3).join(' | '));
    await ctx.close();
    return R;
};
