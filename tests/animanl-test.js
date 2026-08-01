// Anima 문신·임신 프리셋: 자연어 우선 문구 + 기존 사용자 마이그레이션 + ✏️ 수정본 보존
const { chromium } = require('playwright-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const srv = http.createServer((req, res) => {
    const p = path.join('/home/user/promt-lab', req.url === '/' ? 'index.html' : req.url);
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(p).pipe(res);
});
(async () => {
    await new Promise(r => srv.listen(8969, r));
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    let fails = 0;
    const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) fails++; };

    // ── A) 기본값 자체 검사
    {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errs = []; page.on('pageerror', e => errs.push(e.message));
        await page.goto('http://127.0.0.1:8969/', { waitUntil: 'load' });
        await page.waitForTimeout(900);
        const r = await page.evaluate(() => {
            const D = ANIMA_DEFAULT_SNIPPETS;
            const ink = D.filter(s => s.group === 'tat' || s.group === 'preg');
            const nlFirst = t => /^[a-z]/.test(t) && t.split(',')[0].trim().split(/\s+/).length >= 5;
            return {
                total: ink.length,
                fil: D.filter(s => s.group === 'tatfil').length,
                den: D.filter(s => s.group === 'tatden').length,
                // tat_spade 는 손대지 않았다(의도) — 나머지는 전부 자연어가 앞
                notNL: ink.filter(s => s.id !== 'tat_spade' && !nlFirst(s.text || '')).map(s => s.id),
                // 부루 태그도 함께 남아 있어야 한다(병행)
                noTag: ink.filter(s => !/\(|tattoo|pregnant|body writing|body markings|bodypaint/.test(s.text || '')).map(s => s.id),
                pregTexts: ['preg_slight', 'preg_on', 'preg_big', 'preg_mark'].map(id => (D.find(s => s.id === id) || {}).text || ''),
                maxNL: (D.find(s => s.id === 'tat_max') || {}).text || '',
            };
        });
        const pregDistinct = new Set(r.pregTexts.map(t => t.split(',')[0].trim())).size === 4;
        //  v9.150.0 에서 문신을 사용자 요청으로 갈아엎었다 — 낙인 3 + 임신 4
        //  (장식 tatfil·밀도 tatden 은 따로 센다. 밀도는 부루 태그가 없는 서술 전용이라
        //   아래 '부루 태그도 함께' 검사에 넣으면 안 된다)
        check('A 낙인·임신 프리셋 7종 (v9.150.0 교체 후)', r.total === 7, String(r.total));
        check('A 장식 문신 5종', r.fil === 5, String(r.fil));
        check('A 문양 밀도 2종', r.den === 2, String(r.den));
        check('A 자연어가 문구 맨 앞 (tat_spade 제외)', r.notNL.length === 0, r.notNL.join(', '));
        check('A 부루 태그도 함께 남아 있음', r.noTag.length === 0, r.noTag.join(', '));
        check('A 임신 4종의 첫 서술이 서로 다름', pregDistinct, JSON.stringify(r.pregTexts.map(t => t.split(',')[0])));
        check('A 극한은 이마~발끝 서술로 시작', /^every inch of her skin from forehead to toes/.test(r.maxNL), r.maxNL.slice(0, 60));
        check('A 페이지 오류 없음', errs.length === 0, errs.join('; '));
        await page.close();
    }

    // ── B) 기존 사용자(v9.128 이전 문구) → 새 문구로 올라오는가 / ✏️ 수정본은 보존되는가
    {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await page.goto('http://127.0.0.1:8969/', { waitUntil: 'load' });
        await page.evaluate(() => {
            const rows = [
                ['tat_writing', '(body writing:1.5)'],                      // 옛 기본값 → 올라와야 함
                ['tat_pubic', '(pubic tattoo:1.3), tattoo'],                // 옛 기본값 → 올라와야 함
                ['preg_big', '(pregnant, big belly:1.6)'],                  // 옛 기본값 → 올라와야 함
                ['tat_tribal', '내가 직접 쓴 문구'],                          // ✏️ 수정본 → 보존
            ].map(([id, text]) => ({ id, name: id, text, on: false, kind: 'append', group: id.startsWith('tat') ? 'tat' : 'preg', nsfw: true }));
            localStorage.setItem('anima_settings_v1', JSON.stringify({ snippets: rows }));
            localStorage.setItem('adult_optin_v1', '1');
        });
        await page.reload({ waitUntil: 'load' });
        await page.evaluate(() => window.mountAnima());
        await page.waitForTimeout(1200);
        const r = await page.evaluate(() => {
            const g = id => ((_anima.snippets || []).find(s => s.id === id) || {}).text || '';
            return { writing: g('tat_writing'), pubic: g('tat_pubic'), big: g('preg_big'), tribal: g('tat_tribal'),
                     n: (_anima.snippets || []).filter(s => s.group === 'tat').length };
        });
        //  ★ 낙서는 v9.150.0 에서 지워졌다 — 올라오는 게 아니라 목록에서 사라져야 한다.
        //    옛 태그판 문구를 쓰던 사람도 함께 지워져야 한다(전체 검사에서 이게 안 되던 걸 잡았다).
        check('B 지운 문신은 옛 태그판 문구를 쓰던 사람에게서도 사라진다', r.writing === '', r.writing.slice(0, 60));
        check('B 옛 문구 → 자연어판으로 올라옴 (자궁)', /^a bold dark tattoo branded/.test(r.pubic), r.pubic.slice(0, 60));
        check('B 옛 문구 → 자연어판으로 올라옴 (만삭)', /^a huge heavily swollen full-term/.test(r.big), r.big.slice(0, 60));
        check('B ✏️ 수정본은 그대로 보존', r.tribal === '내가 직접 쓴 문구', r.tribal);
        //  남는 것 = 살린 3개(바코드·자궁·극한) + ✏️로 고쳐 쓴 tat_tribal
        check('B 살린 3개 + ✏️ 수정본만 남는다', r.n === 4, String(r.n));
        await page.close();
    }

    console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
    await browser.close(); srv.close();
    process.exit(fails ? 1 : 0);
})();
