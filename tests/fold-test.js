// 폴더블(갤럭시 Z 폴드) — 펼치면 레이아웃이 실제로 바뀌는가 (v9.174.0)
//  ★ 사고: Anima 2단 전환 기준이 min-width:1000px 이었는데, 폴드는 **펼쳐도 884px** 라
//    1000을 못 넘겨 펼쳐도 1단 그대로였다("폴드 8인데 레이아웃이 안 바뀜").
//  ★ 검사가 왜 못 잡았나: responsive-test 의 폭 목록이 320·360·390·412·480·768·1024·1280·1920 이라
//    **850~960 구간이 통째로 비어 있었다.** 폴드 펼친 폭이 정확히 거기다.
//  ★ 그리고 더 중요한 것: 예전 검사는 폭마다 **새 창을 열어서** 쟀다. 폴드는 **열려 있는 창의
//    폭이 바뀌는** 것이라 성격이 다르다 — 여기서는 setViewportSize 로 실제로 접었다 폈다 한다.
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

//  갤럭시 Z 폴드 계열 실측 폭(CSS px). 겉화면 ~390, 속화면 ~884.
//  세대마다 조금씩 다르므로 **구간 전체**를 본다 — 하나만 찍으면 다음 기종에서 또 샌다.
const FOLDED   = { width: 390, height: 900 };
const UNFOLDED = { width: 884, height: 1104 };
const RANGE    = [820, 850, 884, 900, 960];   // 폴더블이 떨어질 수 있는 폭 구간

const look = (p) => p.evaluate(() => {
  const wrap = document.querySelector('.anima-wrap');
  const cols = wrap ? getComputedStyle(wrap).gridTemplateColumns : 'none';
  //  가슴 6단계가 한 줄인가 — 칸이 좁아지면 여기부터 두 줄로 밀린다(사용자가 지적했던 그 문제)
  const bust = [...document.querySelectorAll('.anima-fld')]
    .find(f => { const l = f.querySelector('.anima-fld-l'); return l && /크기/.test(l.textContent); });
  const rows = bust ? new Set([...bust.querySelectorAll('.anima-chip')]
    .map(c => Math.round(c.getBoundingClientRect().top))).size : null;
  const L = document.querySelector('.anima-col-l');
  return {
    cols: cols === 'none' ? 1 : cols.trim().split(/\s+/).length,
    bustRows: rows,
    colW: L ? Math.round(L.getBoundingClientRect().width) : 0,
    hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    w: window.innerWidth,
  };
});

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: FOLDED, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.addInitScript(() => {
    try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); } catch (e) {}
  });
  await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2200);

  // ── ① 접은 상태 = 폰과 똑같이 1단 ────────────────────────────────
  const a = await look(p);
  ck('접은 상태는 1단 (폰과 동일)', a.cols === 1, JSON.stringify(a));
  ck('접은 상태 가슴 6단계 한 줄', a.bustRows === 1, String(a.bustRows));

  // ── ② 펼치면 새로고침 없이 2단 ───────────────────────────────────
  //   ★ 이게 핵심. 앱을 다시 열어야 바뀌면 고쳐진 게 아니다.
  await p.setViewportSize(UNFOLDED); await p.waitForTimeout(900);
  const c = await look(p);
  ck('★ 펼치면 (새로고침 없이) 2단으로 바뀐다', c.cols === 2, JSON.stringify(c));
  ck('★ 펼쳐도 가슴 6단계가 한 줄 (칸이 좁아져 밀리지 않는다)', c.bustRows === 1, `${c.bustRows}줄 · 왼칸 ${c.colW}px`);
  ck('펼친 상태 가로 스크롤 없음', !c.hscroll);

  // ── ③ 다시 접으면 되돌아온다 ─────────────────────────────────────
  await p.setViewportSize(FOLDED); await p.waitForTimeout(900);
  const d = await look(p);
  ck('★ 다시 접으면 1단으로 되돌아온다', d.cols === 1, JSON.stringify(d));
  ck('접은 뒤에도 가슴 6단계 한 줄', d.bustRows === 1, String(d.bustRows));

  // ── ④ 자주 접었다 폈다 해도 안 깨진다 ────────────────────────────
  for (let i = 0; i < 3; i++) {
    await p.setViewportSize(UNFOLDED); await p.waitForTimeout(350);
    await p.setViewportSize(FOLDED);   await p.waitForTimeout(350);
  }
  await p.setViewportSize(UNFOLDED); await p.waitForTimeout(900);
  const e = await look(p);
  ck('★ 3번 접었다 펴도 그대로', e.cols === 2 && e.bustRows === 1 && !e.hscroll, JSON.stringify(e));

  // ── ⑤ 폴더블이 떨어질 만한 폭 구간 전체 ──────────────────────────
  //   기종마다 폭이 달라 하나만 찍으면 다음 기종에서 또 샌다.
  for (const w of RANGE) {
    await p.setViewportSize({ width: w, height: 1100 }); await p.waitForTimeout(500);
    const r = await look(p);
    ck(`${w}px — 2단 · 가슴 한 줄 · 가로 스크롤 없음`,
       r.cols === 2 && r.bustRows === 1 && !r.hscroll, JSON.stringify(r));
  }


  // ── 레일(바 위치 아래/왼쪽/오른쪽)은 v9.177.0 부터 '사용자가 버튼으로 고르는 것'이 됐다.
  //    화면 크기로 자동 판정하지 않으므로 여기서 볼 것이 없다 → `railpos-test` 가 전담한다.

  ck('오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
