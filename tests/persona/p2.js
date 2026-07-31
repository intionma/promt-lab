// ② 태오 — PC 클래식 장인 (계층당 태그 60개, 캡슐 드래그·다중선택·되돌리기를 하루 종일)
const L = require('./lib');

module.exports = async function (browser, port) {
    const R = L.reporter('② 태오 — PC 클래식 장인 (계층당 60개)');
    const { ctx, page, errs } = await L.boot(browser, {
        port, device: L.PC, pre: { pl_layout: 'classic', adult_optin_v1: '1' },
    });
    await page.waitForFunction(() => !!document.getElementById('chip-container-1'), null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    // ── 계층마다 60개씩 채운다
    const fill = await page.evaluate(() => {
        window.showToast = () => {};
        switchViewMode('visual');
        const t0 = performance.now();
        for (let n = 1; n <= 7; n++) {
            const ta = document.getElementById('layer-' + n);
            ta.value = Array.from({ length: 60 }, (_, i) => 'L' + n + 'tag' + i).join(', ');
            syncFromManualInput(n, true);
        }
        const t1 = performance.now();
        for (let n = 1; n <= 7; n++) renderChips(n);
        return {
            동기화ms: Math.round(t1 - t0), 그리기ms: Math.round(performance.now() - t1),
            캡슐수: document.querySelectorAll('.chip-container .prompt-chip:not(.chip-add-input)').length,
        };
    });
    R.ck('420개 태그가 전부 캡슐로 나온다', fill.캡슐수 === 420, String(fill.캡슐수));
    R.ck('7계층 채우기가 1초 안에 끝난다', fill.동기화ms + fill.그리기ms < 1000, fill.동기화ms + '+' + fill.그리기ms + 'ms');
    R.note(`동기화 ${fill.동기화ms}ms · 캡슐 그리기 ${fill.그리기ms}ms`);

    // ── 하루 종일 쓴 상태를 만든다: 캡슐을 200번 다시 그린다(핸들러 누적 재현)
    await page.evaluate(() => { for (let i = 0; i < 200; i++) renderChips(3); });

    // ── 캡슐 하나를 3계층 → 5계층으로 끌어 옮긴다
    const move = await page.evaluate(() => {
        const src = [...document.querySelectorAll('#chip-container-3 .prompt-chip:not(.chip-add-input)')][10];
        const dst = [...document.querySelectorAll('#chip-container-5 .prompt-chip:not(.chip-add-input)')][0];
        const before5 = document.getElementById('layer-5').value.split(',').length;
        const dt = new DataTransfer();
        src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        dst.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
        const l3 = document.getElementById('layer-3').value.split(',').map(s => s.trim());
        const l5 = document.getElementById('layer-5').value.split(',').map(s => s.trim());
        return { l3수: l3.length, l5수: l5.length, before5, 맨앞: l5[0], 남아있나: l3.indexOf('L3tag10') };
    });
    R.ck('200번 다시 그린 뒤에도 딱 1개만 옮겨진다', move.l3수 === 59 && move.l5수 === move.before5 + 1,
        `3계층 ${move.l3수}개 / 5계층 ${move.before5}→${move.l5수}개`);
    R.ck('놓은 자리(맨 앞)에 정확히 들어간다', move.맨앞 === 'L3tag10', move.맨앞);
    R.ck('원래 계층에서는 빠진다', move.남아있나 === -1, String(move.남아있나));

    // ── 여러 개 골라 한꺼번에 옮기기
    const multi = await page.evaluate(() => {
        _multiSel.layer = 3; _multiSel.groupIdxSet = new Set([0, 1, 2, 3, 4]);
        const chips = [...document.querySelectorAll('#chip-container-3 .prompt-chip:not(.chip-add-input)')];
        const dt = new DataTransfer();
        chips[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        const cont = document.getElementById('chip-container-6');
        const ev = new DragEvent('drop', { bubbles: true, dataTransfer: dt });
        Object.defineProperty(ev, 'target', { value: cont });
        cont.dispatchEvent(ev);
        const l6 = document.getElementById('layer-6').value.split(',').map(s => s.trim());
        return { l3수: document.getElementById('layer-3').value.split(',').length, l6수: l6.length, 끝5개: l6.slice(-5) };
    });
    R.ck('고른 5개가 함께 옮겨진다', multi.l3수 === 54 && multi.l6수 === 65, `3계층 ${multi.l3수} / 6계층 ${multi.l6수}`);
    R.ck('5개 순서가 유지된다', multi.끝5개.join(',') === 'L3tag0,L3tag1,L3tag2,L3tag3,L3tag4', multi.끝5개.join(','));

    // ── Delete 로 지우기 (한 번만 먹어야 한다)
    const del = await page.evaluate(() => {
        const before = document.getElementById('layer-4').value.split(',').length;
        _multiSel.layer = 4; _multiSel.groupIdxSet = new Set([0, 1, 2]);
        document.getElementById('chip-container-4').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
        return { before, after: document.getElementById('layer-4').value.split(',').length };
    });
    R.ck('Delete 는 고른 3개만 지운다', del.after === del.before - 3, `${del.before} → ${del.after}`);

    // ── 되돌리기 연타 (undo 스택 30칸)
    const undo = await page.evaluate(() => {
        const snap = [1, 2, 3, 4, 5, 6, 7].map(n => document.getElementById('layer-' + n).value);
        for (let i = 0; i < 8; i++) performUndo();
        const after = [1, 2, 3, 4, 5, 6, 7].map(n => document.getElementById('layer-' + n).value);
        return { 바뀜: snap.some((v, i) => v !== after[i]), l3수: after[2].split(',').filter(Boolean).length };
    });
    R.ck('되돌리기 8번 연타가 먹는다', undo.바뀜 === true, JSON.stringify(undo));
    R.ck('되돌리면 3계층이 원래 60개로 복구된다', undo.l3수 === 60, String(undo.l3수));

    // ── 최종 프롬프트가 계층 순서대로 조립되는가
    const fin = await page.evaluate(() => {
        const v = (document.getElementById('final-positive') || {}).value || '';
        return { 길이: v.length, 앞: v.slice(0, 40), L1먼저: v.indexOf('L1tag0') >= 0 && v.indexOf('L1tag0') < (v.indexOf('L7tag0') < 0 ? 1e9 : v.indexOf('L7tag0')) };
    });
    R.ck('최종 프롬프트가 1계층부터 순서대로 나온다', fin.L1먼저 && fin.길이 > 100, JSON.stringify(fin));

    const re = L.realErrs(errs);
    R.ck('오류 없음', re.length === 0, re.slice(0, 3).join(' | '));
    await ctx.close();
    return R;
};
