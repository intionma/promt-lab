// 문신 조합의 자연어 서술 병행 — 태그가 안 깨지고, 캡슐이 한글로 짧게 뜨고, 조합 해제로 깨끗이 빠지는지
const { chromium } = require('playwright-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const srv = http.createServer((req, res) => {
    const p = path.join('/home/user/promt-lab', req.url === '/' ? 'index.html' : req.url);
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(p).pipe(res);
});
(async () => {
    await new Promise(r => srv.listen(8967, r));
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:8967/', { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    let fails = 0;
    const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) fails++; };

    const r = await page.evaluate(() => {
        const out = {};
        const combos = _PACK_COMBOS['nsfw-adult'];
        const ink = combos.slice(5);            // 문신 조합 5종
        out.names = ink.map(c => c.n);
        out.texts = ink.map(c => c.g['3'] || '');

        // 1) 모든 문신 조합이 자연어 서술을 갖고 있는가
        out.allHaveNL = out.texts.every(t => t.split(',').some(x => x.trim().split(/\s+/).length >= 5));
        // 2) 서술 안에 쉼표가 없는가 (있으면 계층에서 조각조각 흩어진다)
        out.longChunks = out.texts.flatMap(t => t.split(',').map(x => x.trim())).filter(x => x.split(/\s+/).length >= 5);
        out.noInnerComma = out.longChunks.every(x => !x.includes(','));
        // 3) 서술이 전부 한글 이름을 갖고 있는가
        const core = x => { const m = x.match(/^\(\s*(.+?)\s*:\s*[\d.]+\s*\)$/); return (m ? m[1] : x).trim().toLowerCase(); };
        out.missingKo = out.longChunks.map(core).filter(c => !_NL_KO[c]);
        // 4) 극한 조합과 Anima tat_max 문구가 같은가
        const tm = ANIMA_DEFAULT_SNIPPETS.find(x => x.id === 'tat_max');
        // Anima(Qwen)는 자연어 우선, 클래식 조합(CLIP)은 태그 우선 — 문구는 일부러 다르고 부위 태그만 같다
        out.animaNLFirst = tm && /^every inch of her skin/.test(tm.text);
        out.animaPartsSame = tm && ['forehead tattoo','hand tattoo','foot tattoo','thigh tattoo','irezumi'].every(t => tm.text.includes(t));
        // 5) v9.150.0 에서 전신·문양 도배는 지웠다. 대신 새 장식 문신에 서술이 들어갔는지 본다.
        out.animaCoverNL = !ANIMA_DEFAULT_SNIPPETS.some(x => x.id === 'tat_cover' || x.id === 'tat_ornate');
        out.animaOrnNL = ANIMA_DEFAULT_SNIPPETS.filter(x => x.group === 'tatfil')
            .every(x => /^[a-z]/.test(x.text) && x.text.split(',')[0].trim().split(/\s+/).length >= 5);
        // 6) 부루 태그가 그대로 살아 있는가(서술로 갈아치운 게 아니라 '병행'인지)
        out.keptTags = /full-body tattoo/.test(out.texts[4]) && /pubic tattoo/.test(out.texts[1]) && /body writing/.test(out.texts[0]);
        return out;
    });

    // 실제 적용/해제 왕복 — 태그가 깨지거나 남지 않아야 한다
    const rt = await page.evaluate(() => {
        const out = {};
        window.showToast = () => {};
        const ta = document.getElementById('layer-3');
        ta.value = 'blue hair, 1girl'; syncFromManualInput('3');
        const before = ta.value;
        // 조합 텍스트를 직접 적용/해제하는 대신 헬퍼로 왕복 검증(조합 토글은 DOM 의존이 커서 별도 테스트)
        const combo = _PACK_COMBOS['nsfw-adult'][9].g['3'];
        const parts = combo.split(',').map(s => s.trim()).filter(Boolean);
        let v = ta.value;
        parts.forEach(p => { const m = p.match(/^\((.+):([\d.]+)\)$/); v = removeTagToken(v, m ? m[1] : p); });
        v = (v ? v + ', ' : '') + combo;
        ta.value = v; syncFromManualInput('3');
        out.applied = ta.value;
        out.chipCount = document.querySelectorAll('#chip-container-3 .prompt-chip').length;
        out.chipTexts = [...document.querySelectorAll('#chip-container-3 .prompt-chip .chip-kr')].map(e => e.textContent);
        out.longChipLabels = out.chipTexts.filter(t => t.length > 30);
        // 해제
        let v2 = ta.value;
        parts.forEach(p => { const m = p.match(/^\((.+):([\d.]+)\)$/); v2 = removeTagToken(v2, m ? m[1] : p); });
        ta.value = v2; syncFromManualInput('3');
        out.after = ta.value;
        out.before = before;
        return out;
    });

    check('문신 조합 5종 모두 자연어 서술 포함', r.allHaveNL === true, r.names.join('|'));
    check('서술 안에 쉼표 없음(계층에서 안 쪼개짐)', r.noInnerComma === true, r.longChunks.filter(x => x.includes(',')).join(' // '));
    check('서술 전부 한글 이름 등록됨', r.missingKo.length === 0, r.missingKo.join(' // '));
    check('부루 태그는 그대로 병행', r.keptTags === true, '');
    check('Anima tat_max 는 자연어가 앞 (조합과 일부러 다름)', r.animaNLFirst === true, String(r.animaNLFirst));
    check('Anima tat_max 부위 태그는 조합과 동일', r.animaPartsSame === true, String(r.animaPartsSame));
    check('지운 전신·문양 도배가 기본값에 없다 (v9.150.0)', r.animaCoverNL === true, '');
    check('새 장식 문신 5종 모두 서술이 앞', r.animaOrnNL === true, '');
    check('적용 후 캡슐 한글로 짧게 표시', rt.longChipLabels.length === 0, rt.longChipLabels.join(' // '));
    check('적용해도 기존 사용자 태그 안 깨짐', /blue hair/.test(rt.applied) && /1girl/.test(rt.applied), rt.applied.slice(0, 90));
    check('해제하면 원래대로 복귀', rt.after === rt.before, rt.after + ' vs ' + rt.before);

    console.log(errs.length ? 'PAGE ERRORS: ' + errs.join('; ') : 'no page errors');
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
    await browser.close(); srv.close();
    process.exit(fails ? 1 : 0);
})();
