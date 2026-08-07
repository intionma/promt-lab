const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = '/home/user/promt-lab';

const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, req.url === '/' ? 'index.html' : req.url);
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html' });
    fs.createReadStream(p).pipe(res);
});

const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

(async () => {
    await new Promise(r => srv.listen(8938, r));
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    let fails = 0;
    const check = (name, cond, detail) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (cond ? '' : ' :: ' + detail)); if (!cond) fails++; };

    // ── 시나리오 1: v9.113을 거친 사용자 (문신 2종·임신 1종만 저장됨) → 13종 복원되는가
    {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await page.goto('http://127.0.0.1:8938/', { waitUntil: 'load' });
        await page.evaluate(() => {
            const s = [
                { id: 'tat_barcode', name: '바코드 낙인', text: '(barcode tattoo:1.2), stomach tattoo, tattoo', on: false, kind: 'append', group: 'tat', nsfw: true },
                { id: 'tat_pubic', name: '자궁 문신', text: '(pubic tattoo:1.3), tattoo', on: false, kind: 'append', group: 'tat', nsfw: true },
                { id: 'preg_on', name: '임신', text: '(pregnant, big belly:1.3)', on: false, kind: 'append', group: 'preg', nsfw: true },
            ];
            localStorage.setItem('anima_settings_v1', JSON.stringify({ snippets: s }));
            localStorage.setItem('adult_optin_v1', '1');
        });
        await page.reload({ waitUntil: 'load' });
        await page.evaluate(() => window.mountAnima());
        await page.waitForTimeout(1200);
        const r = await page.evaluate(() => ({
            tatN: (_anima.snippets || []).filter(s => s.group === 'tat').length,
            pregN: (_anima.snippets || []).filter(s => s.group === 'preg').length,
            pregOnText: ((_anima.snippets || []).find(s => s.id === 'preg_on') || {}).text,
            tribalText: ((_anima.snippets || []).find(s => s.id === 'tat_tribal') || {}).text,
            barcodeText: ((_anima.snippets || []).find(s => s.id === 'tat_barcode') || {}).text,
        }));
        //  v9.150.0 교체 후 = 낙인 3 (지운 12개는 옛 기본 문구면 사라진다)
        check('v9.113 사용자: 낙인 3종만 남는다', r.tatN === 3, JSON.stringify(r));
        check('v9.113 사용자: 임신 4종 복원', r.pregN === 4, JSON.stringify(r));
        check('v9.113 사용자: preg_on 자연어판으로 업그레이드', /^a clearly rounded pregnant belly/.test(r.pregOnText||'') && /\(pregnant:1\.5\)/.test(r.pregOnText||''), r.pregOnText);
        check('v9.113 사용자: 지운 트라이벌은 되살아나지 않는다', !r.tribalText, String(r.tribalText));
        check('v9.113 사용자: 바코드도 자연어판으로 업그레이드', /^a crisp black barcode/.test(r.barcodeText||'') && /barcode tattoo:1\.2/.test(r.barcodeText||''), r.barcodeText);
        await page.close();
    }

    // ── 시나리오 2: v9.108~112 사용자 (옛 12종+4종, 트라이벌은 ✏️ 수정) → 문구 업그레이드 + 수정본 보존
    {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await page.goto('http://127.0.0.1:8938/', { waitUntil: 'load' });
        await page.evaluate(() => {
            const rows = [
                ['tat_writing', '(body writing:1.3)'], ['tat_markings', '(body markings:1.2)'],
                ['tat_full', '(full-body tattoo:1.2), tattoo'], ['tat_slut', '(pubic tattoo, number tattoo:1.2), tattoo'],
                ['tat_barcode', '(barcode tattoo:1.2), stomach tattoo, tattoo'], ['tat_spade', '(queen of spades symbol:1.3), pubic tattoo, tattoo'],
                ['tat_tribal', 'my custom text'],
                ['tat_sleeve', 'tattoo sleeve, arm tattoo, tattoo'], ['tat_pubic', '(pubic tattoo:1.3), tattoo'],
                ['tat_ass', '(ass tattoo:1.3), tattoo'], ['tat_brand', '(slave brand:1.3), tattoo'], ['tat_paint', '(bodypaint:1.2)'],
                ['preg_on', 'pregnant'], ['preg_big', '(pregnant, big belly:1.3)'],
                ['preg_slight', '(pregnant:0.9), implied pregnancy'], ['preg_mark', '(pregnant, big belly:1.3), pregnancy mark'],
            ].map(([id, text]) => ({ id, name: id, text, on: false, kind: 'append', group: id.startsWith('tat') ? 'tat' : 'preg', nsfw: true }));
            localStorage.setItem('anima_settings_v1', JSON.stringify({ snippets: rows }));
            localStorage.setItem('adult_optin_v1', '1');
        });
        await page.reload({ waitUntil: 'load' });
        await page.evaluate(() => window.mountAnima());
        await page.waitForTimeout(1200);
        const r = await page.evaluate(() => {
            const g = id => ((_anima.snippets || []).find(s => s.id === id) || {});
            return {
                tatN: (_anima.snippets || []).filter(s => s.group === 'tat').length,
                tribal: g('tat_tribal').text, brand: g('tat_brand').text,
                pregOn: g('preg_on').text, slight: g('preg_slight').text,
            };
        });
        //  살린 3개 + ✏️로 고쳐 쓴 tat_tribal = 4
        check('구버전 사용자: 살린 3개 + ✏️ 수정본', r.tatN === 4, JSON.stringify(r));
        check('구버전 사용자: ✏️ 수정본 보존', r.tribal === 'my custom text', r.tribal);
        check('구버전 사용자: 지운 노예 낙인은 사라진다', !r.brand, String(r.brand));
        check('구버전 사용자: preg_on 자연어판', /^a clearly rounded pregnant belly/.test(r.pregOn||''), r.pregOn);
        check('구버전 사용자: 초기(살짝)도 자연어판', /^a slight gentle swell/.test(r.slight||'') && /\(pregnant:0\.9\), implied pregnancy/.test(r.slight||''), r.slight);
        await page.close();
    }

    // ── 시나리오 3: [A] 자동 참조 하향 + [C] 검증 축
    {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await page.goto('http://127.0.0.1:8938/', { waitUntil: 'load' });
        await page.evaluate(() => { localStorage.setItem('adult_optin_v1', '1'); });
        await page.reload({ waitUntil: 'load' });
        await page.evaluate(() => window.mountAnima());
        await page.waitForTimeout(1200);
        const r = await page.evaluate(async (PX) => {
            window.showToast = () => {};
            _anima.img = { dataURL: PX, name: 't.png' };
            _anima.prompt = 'masterpiece, test';
            const on = id => { const s = _anima.snippets.find(x => x.id === id); if (s) s.on = true; };
            const offAll = () => _anima.snippets.forEach(s => s.on = false);
            const out = {};
            // 3-1 극한 도배(refW 0.5) 켜면 스냅샷 refWeight 0.5
            offAll(); on('tat_max');
            await _animaGenerate(true);
            out.fullRef = _animaJobs[_animaJobs.length - 1].settings.refWeight;
            // 3-1b ★ 장식 문신(group 'tatfil', refW 0.7) 도 반영돼야 한다.
            //   v9.150.0 에서 그룹을 따로 뺐더니 refW 가 통째로 무시되고 있었다(전체 검사에서 잡음).
            offAll(); on('tat_fil_arm');
            await _animaGenerate(true);
            out.filRef = _animaJobs[_animaJobs.length - 1].settings.refWeight;
            offAll(); on('tat_sperm');
            await _animaGenerate(true);
            out.spermRef = _animaJobs[_animaJobs.length - 1].settings.refWeight;
            // 3-2 바코드(refW 없음)만 켜면 1.0 유지
            offAll(); on('tat_barcode');
            await _animaGenerate(true);
            out.barcodeRef = _animaJobs[_animaJobs.length - 1].settings.refWeight;
            // 3-3 자궁+만삭 동시 → 더 낮은 0.6
            offAll(); on('tat_pubic'); on('preg_big');
            await _animaGenerate(true);
            out.comboRef = _animaJobs[_animaJobs.length - 1].settings.refWeight;
            // 3-4 사용자가 이미 0.4로 내려놨으면 존중
            offAll(); on('tat_full'); _anima.refWeight = 0.4;
            await _animaGenerate(true);
            out.userLowRef = _animaJobs[_animaJobs.length - 1].settings.refWeight;
            _anima.refWeight = 1;
            // 3-5 _refExact(검증 축)면 자동 하향 건너뜀
            offAll(); on('tat_full'); _anima._refExact = true; _anima.refWeight = 0.85;
            await _animaGenerate(true);
            out.exactRef = _animaJobs[_animaJobs.length - 1].settings.refWeight;
            out.exactCaption = _animaJobs[_animaJobs.length - 1].opt;
            _anima._refExact = false; _anima.refWeight = 1;
            // 3-6 검증 축 노출 조건
            const ax = _ANIMA_SWEEP_AXES.find(a => a.key === 'inkref');
            offAll();
            out.axHiddenWhenOff = !ax.only();
            on('preg_on');
            out.axShownWhenOn = ax.only();
            out.axPicks = ax.pick().map(p => p.id).join(',');
            //  ★ v9.167.0: 피부색·음모처럼 refW 를 선언한 축이면 무엇이든 떠야 한다.
            //    예전엔 tat·preg 만 봐서, 정작 "흑갈이 들쭉날쭉하다"는 피부색에서 이 도구가 안 나왔다.
            offAll(); on('skin_dark');
            out.axSkin = ax.only();
            offAll(); on('pubic_bush');
            out.axHair = ax.only();
            offAll(); on('expr_smile');          // refW 없는 축만 켜면 안 떠야
            out.axExpr = ax.only();
            // 3-6c ★ 붙는 순서 — 몸 전체를 바꾸는 피부색이 부위 묘사보다 앞이어야 한다
            //   (뒤에 깔리면 원본 피부에 밀려 '몇 장만 흑갈'이 된다 — 사용자 실사용 신고)
            offAll();
            ['nip_lightpink', 'areola_huge', 'pubic_bush', 'armpit_thick', 'futa_large', 'skin_dark', 'tan_bikini'].forEach(on);
            await _animaGenerate(true);
            {
                const p = _animaJobs[_animaJobs.length - 1].prompt;
                out.order = ['very dark skin', 'untanned bands', 'soft pale pink', 'large areolae', 'excessive pubic hair', 'armpit hair', 'large penis']
                    .map(k => p.indexOf(k));
                out.orderRef = _animaJobs[_animaJobs.length - 1].settings.refWeight;
            }
            // 3-7 캡션에 문신 이름
            offAll(); on('tat_barcode');
            await _animaGenerate(true);
            out.tatCaption = _animaJobs[_animaJobs.length - 1].opt;
            offAll(); on('tat_fil_hip');
            await _animaGenerate(true);
            out.filCaption = _animaJobs[_animaJobs.length - 1].opt;
            return out;
        }, PX);
        check('[A] 극한 도배 → 참조 0.5', r.fullRef === 0.5, String(r.fullRef));
        check('[A] ★ 장식 문신(tatfil) → 참조 0.7', r.filRef === 0.7, String(r.filRef));
        check('[A] ★ 유륜 정자 → 참조 0.7', r.spermRef === 0.7, String(r.spermRef));
        check('[A] 바코드만 → 참조 그대로(1)', r.barcodeRef === 1, String(r.barcodeRef));
        check('[A] 자궁+만삭 → 만삭의 값', r.comboRef === 0.6, String(r.comboRef));
        check('[A] 사용자 0.4 → 존중', r.userLowRef === 0.4, String(r.userLowRef));
        check('[C] _refExact → 0.85 그대로', r.exactRef === 0.85, String(r.exactRef));
        check('[C] 검증 캡션에 참조 값', /참조 0\.85/.test(r.exactCaption || ''), r.exactCaption);
        check('[C] 축: 문신·임신 꺼짐 → 숨김', r.axHiddenWhenOff === true, String(r.axHiddenWhenOff));
        check('[C] 축: 켜면 표시 + 6단', r.axShownWhenOn === true && r.axPicks === '1,0.85,0.7,0.55,0.4,0.25', r.axPicks);
        check('[C] ★ 축: 피부색만 켜도 나온다 (v9.167.0 — 옛날엔 안 나왔다)', r.axSkin === true, String(r.axSkin));
        check('[C] ★ 축: 음모만 켜도 나온다', r.axHair === true, String(r.axHair));
        check('[C] 축: refW 없는 축(표정)만 켜면 안 나온다', r.axExpr === false, String(r.axExpr));
        {
            const [skin, tan, nip, areola, pubic, armpit, futa] = r.order;
            check('[C] ★ 피부색이 프롬프트 맨 앞(부위 묘사보다 먼저)',
                skin >= 0 && skin < nip && skin < areola && skin < pubic && skin < armpit && skin < futa, JSON.stringify(r.order));
            check('[C] ★ 수영복 자국은 피부색 바로 뒤',
                tan > skin && tan < nip, JSON.stringify(r.order));
            check('[C] 나머지 축은 원래 순서 그대로(유두→유륜→음모→겨털→후타)',
                nip < areola && areola < pubic && pubic < armpit && armpit < futa, JSON.stringify(r.order));
            check('[C] 여러 축이 켜지면 참조는 가장 낮은 값(흑갈 0.6)', r.orderRef === 0.6, String(r.orderRef));
        }
        check('캡션에 문신 이름 표시', /바코드/.test(r.tatCaption || ''), r.tatCaption);
        check('★ 캡션에 장식 문신 이름도 표시', /옆구리|골반/.test(r.filCaption || ''), r.filCaption);
        await page.close();
    }

    console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
    await browser.close();
    srv.close();
    process.exit(fails ? 1 : 0);
})();
