const { chromium } = require('playwright-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const srv = http.createServer((req, res) => {
    const p = path.join('/home/user/promt-lab', req.url === '/' ? 'index.html' : req.url);
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(p).pipe(res);
});
(async () => {
    await new Promise(r => srv.listen(8963, r));
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:8963/', { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    let fails = 0;
    const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) fails++; };

    const r = await page.evaluate(() => {
        const out = {};
        const combos = _PACK_COMBOS['nsfw-adult'];
        out.count = combos.length;
        const c = combos[combos.length - 1];
        out.name = c.n;
        out.txt = c.g['3'] || '';
        out.tags = out.txt.split(',').map(s => s.trim()).filter(Boolean);
        // 기존 조합의 인덱스가 밀리지 않았는지(삭제 기억이 엉뚱한 조합에 붙는 사고 방지)
        out.idx5 = combos[5].n; out.idx8 = combos[8].n;
        // 유령 태그가 안 섞였는지
        const GHOST = ['covered in tattoos', 'blackwork', 'thigh tattoo', 'face tattoo', 'nape tattoo', 'spine tattoo', 'ornamental tattoo', 'dotwork', 'geometric tattoo'];
        out.ghosts = out.tags.map(t => (t.match(/^\(?(.+?)(?::[\d.]+\))?$/) || [, t])[1])
            .flatMap(t => t.split(',').map(x => x.trim()))
            .filter(t => GHOST.includes(t.toLowerCase()));
        // Anima 프리셋 동일 존재
        const p = ANIMA_DEFAULT_SNIPPETS.find(x => x.id === 'tat_max');
        out.animaHas = !!p; out.animaRefW = p && p.refW;
        // Anima는 자연어 우선(문장이 앞), 클래식 조합은 태그 우선 — 문구는 다르되 부위 태그는 같아야 한다
        out.animaNLFirst = p && /^every inch of her skin/.test(p.text);
        out.animaPartsSame = p && ['forehead tattoo','hand tattoo','foot tattoo','thigh tattoo','irezumi'].every(t => p.text.includes(t));
        out.tatN = ANIMA_DEFAULT_SNIPPETS.filter(x => x.group === 'tat').length;
        // 사이드바 태그 보강
        const side = _PACK_SIDEBAR_TAGS['nsfw-adult'][3].map(x => x.t);
        out.sideHas = ['shoulder tattoo', 'hand tattoo', 'finger tattoo', 'forehead tattoo', 'foot tattoo', 'irezumi', 'multiple tattoos'].every(t => side.includes(t));
        out.sideDup = side.length !== new Set(side).size;
        return out;
    });

    const need = ['forehead tattoo', 'cheek tattoo', 'head tattoo', 'neck tattoo', 'shoulder tattoo', 'arm tattoo',
        'hand tattoo', 'finger tattoo', 'chest tattoo', 'breast tattoo', 'stomach tattoo', 'back tattoo',
        'pubic tattoo', 'ass tattoo', 'leg tattoo', 'ankle tattoo', 'foot tattoo'];
    const missing = need.filter(t => !r.txt.includes(t));

    check('조합 개수 10개(기존 9 + 신규 1)', r.count === 10, String(r.count));
    check('신규 조합이 맨 뒤(인덱스 안 밀림)', r.idx5 === '문신 낙서 도배' && r.idx8 === '문신 도배 (전신)', r.idx5 + ' / ' + r.idx8);
    check('이름에 극한 표시', /극한/.test(r.name), r.name);
    check('머리→발끝 부위 전부 포함', missing.length === 0, '빠짐: ' + missing.join(', '));
    check('태그 30개 내외', r.tags.length >= 28 && r.tags.length <= 36, String(r.tags.length));
    check('되살린 태그 포함(covered in tattoos·thigh tattoo)', /covered in tattoos/.test(r.txt) && /thigh tattoo/.test(r.txt), r.txt.slice(0,120));
    check('Anima tat_max 존재 · 자연어가 맨 앞', r.animaHas && r.animaNLFirst, String(r.animaHas) + '/' + String(r.animaNLFirst));
    check('Anima tat_max 부위 태그는 조합과 동일', r.animaPartsSame === true, '');
    check('Anima refW 0.5 (면적 최대 → 참조 최저)', r.animaRefW === 0.5, String(r.animaRefW));
    //  v9.150.0 에서 사용자 요청으로 낙인은 3개(바코드·자궁·극한)만 남겼다
    check('Anima 낙인 3종 (v9.150.0 교체 후)', r.tatN === 3, String(r.tatN));
    check('사이드바 문신 태그 보강', r.sideHas, '');
    check('사이드바 태그 중복 없음', !r.sideDup, 'dup!');

    console.log(errs.length ? 'PAGE ERRORS: ' + errs.join('; ') : 'no page errors');
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
    await browser.close(); srv.close();
    process.exit(fails ? 1 : 0);
})();
