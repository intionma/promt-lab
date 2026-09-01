// 화면 나누기(2단)를 사용자가 고른다 — 자동 / 항상 2단 / 항상 1단 (v9.184.0 — 사용자 요청)
//  ★ 신고: "태블릿에서 2단으로 보이는데 풀 수가 없다."
//  ★ 이 프로젝트에서 화면 크기로 의도를 맞히려다 세 번째 걸린 건이다(2단 문턱·레일 조건·이번).
//  ★ 구조도 함께 바꿨다: CSS 가 미디어 쿼리가 아니라 **#anima-root[data-two] 하나만** 본다.
//    예전엔 JS 판정과 CSS 미디어 쿼리를 '글자까지 똑같이' 적어야 했고 어긋나면 조용히 샜다.
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

const look = (p) => p.evaluate(() => {
  const root = document.querySelector('#anima-root');
  const wrap = document.querySelector('.anima-wrap');
  const cols = wrap ? getComputedStyle(wrap).gridTemplateColumns : 'none';
  const it = document.getElementById('gt-two-item');
  return {
    two: root ? root.dataset.two : null,
    단: cols === 'none' ? 1 : cols.trim().split(/\s+/).length,
    모드: (() => { try { return localStorage.getItem('anima_twocol_v1') || 'auto'; } catch (e) { return null; } })(),
    메뉴항목: !!it, 메뉴글자: it ? (it.querySelector('.gt-two-state') || {}).textContent : null,
    가로스크롤: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
});
const cycle = (p) => p.evaluate(() => { window.showToast = () => {}; _animaCycleTwoMode(); _animaSyncTwoMenu(); });

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const open = async (w, hh) => {
    const ctx = await b.newContext({ viewport: { width: w, height: hh }, hasTouch: w <= 1024, isMobile: w <= 1024 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await ctx.addInitScript(() => { try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); } catch (e) {} });
    await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
    await p.waitForTimeout(1400);
    return { ctx, p, errs };
  };

  // ── ① 태블릿 폭 — 기본은 예전 그대로 2단, 그리고 끌 수 있어야 한다 ──
  {
    const { ctx, p, errs } = await open(1024, 900);
    const a = await look(p);
    ck('★ 기본(자동)은 예전 그대로 2단', a.단 === 2 && a.two === '1' && a.모드 === 'auto', JSON.stringify(a));
    await cycle(p); await p.waitForTimeout(400);          // auto → on
    const on = await look(p);
    ck('한 번 누르면 "항상 2단"', on.모드 === 'on' && on.단 === 2, JSON.stringify(on));
    await cycle(p); await p.waitForTimeout(400);          // on → off
    const off = await look(p);
    ck('★ 또 누르면 "항상 1단" — 태블릿에서 2단을 풀 수 있다', off.모드 === 'off' && off.단 === 1 && off.two === '0', JSON.stringify(off));
    ck('1단으로 풀어도 가로 스크롤 없음', !off.가로스크롤);
    await cycle(p); await p.waitForTimeout(400);          // off → auto
    const back = await look(p);
    ck('한 바퀴 돌면 자동으로 돌아온다', back.모드 === 'auto' && back.단 === 2, JSON.stringify(back));
    ck('오류 없음(태블릿)', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ── ② 폰 폭 — "항상 2단"을 고르면 폰에서도 2단이 된다 ────────────────
  {
    const { ctx, p, errs } = await open(390, 844);
    const a = await look(p);
    ck('폰은 기본이 1단', a.단 === 1 && a.two === '0', JSON.stringify(a));
    await cycle(p); await p.waitForTimeout(500);          // auto → on
    const on = await look(p);
    ck('★ "항상 2단"을 고르면 폰에서도 2단이 된다 (고른 대로 한다)', on.단 === 2 && on.two === '1', JSON.stringify(on));
    ck('그래도 가로 스크롤은 없다', !on.가로스크롤);
    ck('오류 없음(폰)', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ── ③ 새로고침해도 남고, 메뉴가 현재 상태를 보여 준다 ────────────────
  {
    const ctx = await b.newContext({ viewport: { width: 1024, height: 900 } });
    const p = await ctx.newPage();
    await ctx.addInitScript(() => { try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); localStorage.setItem('anima_twocol_v1', 'off'); } catch (e) {} });
    await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
    await p.waitForTimeout(1400);
    const r = await look(p);
    ck('★ 새로고침해도 고른 설정이 남는다', r.모드 === 'off' && r.단 === 1, JSON.stringify(r));
    await p.evaluate(() => { try { toggleGtMenu(); } catch (e) {} });
    await p.waitForTimeout(400);
    const m = await look(p);
    ck('★ 메뉴에 항목이 있고 지금 상태를 보여 준다', m.메뉴항목 && /1단/.test(m.메뉴글자 || ''), m.메뉴글자);
    await ctx.close();
  }

  // ── ④ 근거가 한 곳뿐인가 — CSS 가 data-two 만 본다 ───────────────────
  const src = fs.readFileSync('/home/user/promt-lab/index.html', 'utf8');
  ck('★ 2단 CSS 가 미디어 쿼리가 아니라 data-two 를 본다 (근거 한 곳)',
     /#anima-root\[data-two="1"\] \.anima-wrap \{ display:grid/.test(src), 'CSS 가 아직 폭으로 정한다');
  ck('★ 백업(_IO_ETC_KEYS)에 설정이 들어 있다', /_IO_ETC_KEYS = \[[\s\S]{0,600}anima_twocol_v1/.test(src));

  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
