// 1단 「결과만 보기」 토글 (v9.187.0 — 사용자 요청)
//  ★ 1단(폰)은 비교 칸에 [원본 | 결과]를 나란히 둔다 — 390px 실측으로 각각 158px 뿐이라 결과가 작다.
//    원본 프레임을 접으면 결과가 158 → 328px(2.1배). 그 토글이 실제로 되는지 본다.
//  ★ 시드를 고정해도 똑같이 접는다(사용자 결정) — 잠글 때만 다르게 굴면 잠글 때마다 화면이 튄다.
//  ★ 2단에서는 뜻이 없다(기준은 왼쪽 칸이 맡는다) → 버튼 자체가 안 보여야 한다.
//  ★ 원본을 크게 볼 길이 사라지면 안 된다(v9.179.0 교훈) — 크게 보기 목록에 원본이 남아 있고
//    「이미지 넣기」 미리보기로도 열려야 한다.
//  ★ 제목 줄 안에 넣었으므로 **줄 높이가 안 늘어나야** 한다(하단바에서 28px 두꺼워진 그 사고).
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join('/home/user/promt-lab', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };

const SVG = (t, c) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="${c}"/><text x="50%" y="50%" font-size="90" fill="#fff" text-anchor="middle">${t}</text></svg>`);

const look = (p) => p.evaluate(() => {
  const rect = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  const cmp = document.querySelector('#anima-result .anima-cmp');
  const figs = cmp ? [...cmp.querySelectorAll('figure')].map(f => ((f.querySelector('.anima-lbl') || {}).textContent || '').trim().slice(0, 8)) : [];
  const b = document.getElementById('anima-after-toggle');
  const step = document.querySelector('#anima-result') && document.querySelector('#anima-result').parentElement.querySelector('.anima-step');
  return {
    비교칸: figs,
    결과폭: (rect('#anima-result .anima-frame[data-lb="1"]') || {}).w || 0,
    버튼있음: !!b,
    버튼보임: !!b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0,
    버튼켜짐: !!b && b.classList.contains('on'),
    버튼눌림: !!b && b.getAttribute('aria-pressed') === 'true',
    제목줄높이: step ? Math.round(step.getBoundingClientRect().height) : 0,
    //  ★ 버튼이 제목 줄 밖으로 삐져나오거나 두 줄로 밀리지 않았는가 (칩 폭 항목과 같은 함정)
    버튼삐짐: (() => {
      if (!b || !step) return false;
      const s = step.getBoundingClientRect(), r = b.getBoundingClientRect();
      return r.right > s.right + 1 || r.left < s.left - 1;
    })(),
    저장값: (() => { try { return localStorage.getItem('anima_afteronly_v1'); } catch (e) { return null; } })(),
  };
});
const setSrc = (p) => p.evaluate(async (u) => {
  window.showToast = () => {};
  await _animaSetImage(u, 'src');
}, SVG('원본', '#c0392b'));
const addResult = (p) => p.evaluate(async (u) => {
  const recs = [{ k: 1, url: u, seed: 7, src: _anima.srcKey || null, opt: '결과' }];
  await _animaIdbAddMany(recs);
  _anima.results = recs; _animaResSel = 0;
  _animaRenderResult();
}, SVG('결과', '#27ae60'));
const lockSeed = (p) => p.evaluate(async (u) => {
  const rec = { k: 9, url: u, seed: 4242, src: null, opt: '잠근것' };
  await _animaIdbAddMany([rec]);
  _anima.results = [_anima.results[0], rec].filter(Boolean);
  _animaSeedLockSet(rec);
  _animaRenderResult();
}, SVG('잠금', '#2e86c1'));
const tap = (p) => p.evaluate(() => { document.getElementById('anima-after-toggle').click(); });

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const open = async (w, hgt, seed) => {
    const ctx = await b.newContext({ viewport: { width: w, height: hgt }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    //  ⚠ addInitScript 는 새로고침마다 다시 심긴다 → 첫 진입에만 심어야 '새로고침 유지' 검사가 진짜가 된다.
    await ctx.addInitScript((sd) => {
      try {
        if (!sessionStorage.getItem('_seeded')) {
          sessionStorage.setItem('_seeded', '1');
          localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1');
          if (sd) localStorage.setItem('anima_afteronly_v1', sd);
        }
      } catch (e) {}
    }, seed || '');
    await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
    await p.waitForTimeout(1200);
    return { ctx, p };
  };

  // ══ 1단(폰) — 접었다 폈다 ═══════════════════════════════════════════
  {
    const { ctx, p } = await open(390, 844); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await setSrc(p); await addResult(p); await p.waitForTimeout(800);
    const a = await look(p);
    ck('기본은 예전 그대로 — 원본과 결과가 나란히', a.비교칸.length === 2 && /원본/.test(a.비교칸[0]), JSON.stringify(a.비교칸));
    ck('버튼이 제목 줄에 보인다', a.버튼보임 === true, JSON.stringify(a));
    ck('버튼이 제목 줄 밖으로 안 삐진다', a.버튼삐짐 === false);
    ck('처음엔 꺼져 있다', !a.버튼켜짐 && !a.버튼눌림, JSON.stringify(a));

    await tap(p); await p.waitForTimeout(500);
    const c = await look(p);
    ck('★ 누르면 원본 프레임이 접힌다', c.비교칸.length === 1 && /결과/.test(c.비교칸[0]), JSON.stringify(c.비교칸));
    ck('★ 결과가 칸을 통째로 쓴다 (실측 158 → 328px)', c.결과폭 >= a.결과폭 * 1.7, `${a.결과폭} → ${c.결과폭}px`);
    ck('★ 제목 줄 높이가 안 늘어난다 (버튼을 자기 줄로 만들지 않았다)',
       Math.abs(c.제목줄높이 - a.제목줄높이) <= 1 && a.제목줄높이 > 0, `${a.제목줄높이} → ${c.제목줄높이}px`);
    ck('버튼 상태 표시가 따라온다', c.버튼켜짐 === true && c.버튼눌림 === true, JSON.stringify(c));
    ck('설정이 저장된다', c.저장값 === '1', String(c.저장값));

    await tap(p); await p.waitForTimeout(500);
    const d = await look(p);
    ck('★ 다시 누르면 원본이 돌아온다 (되돌릴 길이 남는다)', d.비교칸.length === 2 && /원본/.test(d.비교칸[0]), JSON.stringify(d.비교칸));
    ck('되돌리면 결과 폭도 원래대로', Math.abs(d.결과폭 - a.결과폭) <= 3, `${a.결과폭} → ${d.결과폭}`);
    ck('1단 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 시드를 고정해도 똑같이 접힌다 (조건 분기로 만들지 않았다) ══════
  {
    const { ctx, p } = await open(390, 844); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await setSrc(p); await addResult(p); await p.waitForTimeout(600);
    await tap(p); await p.waitForTimeout(400);
    const before = await look(p);
    await lockSeed(p); await p.waitForTimeout(600);
    const after = await look(p);
    ck('★ 시드를 고정해도 접힌 채로 있다', after.비교칸.length === 1 && /결과/.test(after.비교칸[0]), JSON.stringify(after.비교칸));
    ck('★ 잠가도 결과 크기가 그대로다 (화면이 안 튄다)', Math.abs(after.결과폭 - before.결과폭) <= 2, `${before.결과폭} → ${after.결과폭}`);
    ck('잠금 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 원본을 크게 볼 길이 남아 있는가 (v9.179.0 교훈) ═══════════════
  {
    const { ctx, p } = await open(390, 844); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await setSrc(p); await addResult(p); await p.waitForTimeout(600);
    await tap(p); await p.waitForTimeout(500);
    //  ① 크게 보기 목록은 안 건드린다 — 원본이 여전히 왼쪽 끝에 있어야 한다.
    await p.evaluate(() => { document.querySelector('#anima-result .anima-frame[data-lb="1"]').click(); });
    await p.waitForTimeout(700);
    const lb = await p.evaluate(() => ({
      열림: !!window._lbActive,
      장수: (typeof _lbUrls !== 'undefined' ? _lbUrls : []).length,
      맨앞이원본: !!(typeof _lbUrls !== 'undefined' && _lbUrls[0] && _lbUrls[0] === (_anima.img && _anima.img.dataURL)),
    }));
    ck('★ 결과를 크게 볼 수 있다', lb.열림 === true, JSON.stringify(lb));
    ck('★ 크게 보기 목록 맨 왼쪽에 원본이 그대로 있다 (좌우로 밀면 나온다)', lb.맨앞이원본 === true && lb.장수 >= 2, JSON.stringify(lb));
    //  ⚠ 열렸을 때만 되돌린다 — 안 열렸는데 back() 하면 문서가 통째로 날아간다(실제로 겪음).
    if (lb.열림) { await p.goBack(); await p.waitForTimeout(500); }
    //  ② 「이미지 넣기」 미리보기로도 열려야 한다 (2단에서 만든 그 길)
    const zoom = await p.evaluate(() => {
      const box = document.getElementById('anima-input');
      return { 커서: box ? getComputedStyle(box).cursor : null };
    });
    ck('★ 「이미지 넣기」 미리보기가 눌러서 열리는 상태다', zoom.커서 === 'zoom-in', JSON.stringify(zoom));
    ck('크게 보기 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 새로고침 뒤에도 유지 · 백업 키 ═══════════════════════════════
  {
    const { ctx, p } = await open(390, 844, '1'); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await setSrc(p); await addResult(p); await p.waitForTimeout(800);
    const a = await look(p);
    ck('★ 새로고침 뒤에도 접힌 채로 뜬다', a.비교칸.length === 1 && a.버튼켜짐 === true, JSON.stringify(a));
    //  ⚠ _IO_ETC_KEYS 는 지연 실행되는 클래식 엔진 블록 안에 있어 Anima 로 부팅하면 정의되지 않는다
    //    → 브라우저에서 읽지 말고 문서 원문에서 확인한다(정적인 사실이다).
    const bk = (() => {
      const src = fs.readFileSync('/home/user/promt-lab/index.html', 'utf8');
      const i = src.indexOf('const _IO_ETC_KEYS = [');
      if (i < 0) return false;
      return src.slice(i, src.indexOf('];', i)).indexOf("'anima_afteronly_v1'") >= 0;
    })();
    ck('★ 백업(_IO_ETC_KEYS)에 키가 들어 있다', bk === true, '기기를 옮기면 설정이 사라진다');
    ck('유지 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 2단에서는 버튼이 안 보인다 (눌러도 아무 일 없는 버튼을 안 남긴다) ══
  {
    const { ctx, p } = await open(884, 1104, '1'); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await setSrc(p); await addResult(p); await p.waitForTimeout(800);
    const a = await look(p);
    ck('★ 2단 — 버튼이 숨는다', a.버튼있음 === true && a.버튼보임 === false, JSON.stringify(a));
    ck('★ 2단 — 켜져 있어도 결과 칸은 예전 그대로 하나', a.비교칸.length === 1 && a.결과폭 >= 330, JSON.stringify(a));
    //  접었다 폈다 — 폭이 바뀌면 버튼 표시도 따라와야 한다
    await p.setViewportSize({ width: 390, height: 900 }); await p.waitForTimeout(900);
    const f = await look(p);
    ck('★ [접음] 1단이 되면 버튼이 다시 보이고 접힘 상태가 살아난다',
       f.버튼보임 === true && f.버튼켜짐 === true && f.비교칸.length === 1, JSON.stringify(f));
    await p.setViewportSize({ width: 884, height: 1104 }); await p.waitForTimeout(900);
    const u = await look(p);
    ck('★ [폄] 다시 2단이면 버튼이 숨는다', u.버튼보임 === false, JSON.stringify(u));
    ck('2단 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
