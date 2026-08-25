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


  // ══ 가로로 들었을 때 = 레일 (v9.175.0) ═════════════════════════════
  //  ★ 사고: 폴드 겉화면 가로(900x390)에서 상단 50 + 하단바 190 = 화면의 62% 를 컨트롤이 먹어
  //    내용에 남는 세로가 150px 뿐이었다("하단바가 너무 높아서 미디어가 잘 안 보임").
  //  ★ 조건은 폭이 아니라 **높이**로 건다 — 문제는 넓은 게 아니라 낮은 것이다.
  const LAND = { width: 900, height: 390 };   // 폴드 겉화면 가로
  const railLook = (p) => p.evaluate(() => {
    const root = document.querySelector('#anima-root');
    const mact = document.querySelector('#anima-mact');
    const vis = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; };
    const mr = mact.getBoundingClientRect();
    const grp = document.querySelector('.anima-mact-grp');
    const run = document.querySelector('.anima-mact-run');
    const gb = [...document.querySelectorAll('.anima-mact-grp .anima-gbtn')];
    //  ★ 레일은 세로로 길어 스크롤이 생긴다. '제일 자주 쓰는 것이 스크롤 없이 보이는가'가 전부다.
    const inView = (e) => { const r = e.getBoundingClientRect(); return r.top >= mr.top - 1 && r.bottom <= mr.bottom + 1; };
    return {
      side: root.dataset.rail,
      바: { w: Math.round(mr.width), h: Math.round(mr.height), l: Math.round(mr.left), t: Math.round(mr.top) },
      mactH: getComputedStyle(root).getPropertyValue('--anima-mact-h').trim(),
      표정줄: vis('.anima-mact-expr'), 좌우버튼: vis('#anima-rail-side'),
      실행보임: !!run && inView(run),
      그룹수: gb.length, 그룹다보임: gb.length > 0 && gb.every(inView),
      //  글자가 눌려 잘리지 않았는가 (세로 flex 에서 쭈그러들면 이렇게 된다 — 실제로 그랬다)
      그룹최소높이: gb.length ? Math.round(Math.min(...gb.map(e => e.getBoundingClientRect().height))) : 0,
      내용세로: window.innerHeight - 50,
    };
  });

  await p.setViewportSize(LAND); await p.waitForTimeout(900);
  const L = await railLook(p);
  ck('★ 가로로 들면 하단바가 옆으로 선다 (레일)', L.바.h > 300 && L.바.w <= 110, JSON.stringify(L.바));
  ck('★ 레일은 세로를 안 먹는다 (--anima-mact-h = 0)', L.mactH === '0px', L.mactH);
  ck('★ 내용에 남는 세로가 늘었다 (예전 150px → 340px)', L.내용세로 >= 330, String(L.내용세로));
  ck('★ 실행 버튼이 스크롤 없이 보인다', L.실행보임, JSON.stringify(L));
  ck('★ 그룹 버튼 6개가 전부 스크롤 없이 보인다', L.그룹다보임 && L.그룹수 >= 6, `${L.그룹수}개 · 다보임=${L.그룹다보임}`);
  ck('★ 그룹 버튼이 눌려 글자가 잘리지 않는다', L.그룹최소높이 >= 28, `최소 ${L.그룹최소높이}px`);
  ck('표정 칩 줄은 레일에서 숨긴다 (표정·포즈 버튼의 팝업으로 간다)', !L.표정줄);
  ck('좌우 바꾸기 버튼이 보인다', L.좌우버튼);
  ck('기본은 오른쪽 (오른손 엄지)', L.side === 'right', L.side);

  //  팝업이 레일 안에서 96px 로 찌그러지지 않고 옆으로 열리는가
  await p.evaluate(() => { const b = document.querySelector('.anima-gbtn[data-grp="face"]'); if (b) b.click(); });
  await p.waitForTimeout(500);
  const pop = await p.evaluate(() => {
    const e = document.querySelector('.anima-futapop'); if (!e) return null;
    const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), 화면밖: r.left < -1 || r.right > window.innerWidth + 1 || r.bottom > window.innerHeight + 1 };
  });
  ck('★ 팝업이 옆으로 넉넉히 열린다 (레일 폭에 안 찌그러짐)', !!pop && pop.w >= 300 && !pop.화면밖, JSON.stringify(pop));
  await p.evaluate(() => { const x = document.querySelector('#anima-gp-x'); if (x) x.click(); });
  await p.waitForTimeout(300);

  // ── 좌우 바꾸기 — ★ 반드시 새로고침을 끼워서 본다 ────────────────
  //   저장 목록에서 빠진 설정은 '켠 직후엔 멀쩡하다가 새로고침하면 사라진다'(v9.153.0 사고).
  await p.evaluate(() => { window.showToast = () => {}; document.querySelector('#anima-rail-side').click(); });
  await p.waitForTimeout(500);
  const Lf = await railLook(p);
  ck('★ ⇄ 를 누르면 레일이 왼쪽으로 간다', Lf.side === 'left' && Lf.바.l <= 2, JSON.stringify(Lf.바));
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
  await p.waitForTimeout(1200);
  const Lr = await railLook(p);
  ck('★ 새로고침해도 왼쪽 그대로 (저장됨)', Lr.side === 'left' && Lr.바.l <= 2, JSON.stringify(Lr.바));
  ck('새로고침 뒤에도 그룹 버튼이 다 보인다', Lr.그룹다보임, `${Lr.그룹수}개`);
  await p.evaluate(() => { try { localStorage.removeItem('anima_rail_side_v1'); } catch (e) {} });

  // ── 세로로 되돌리면 예전 하단바 그대로 ───────────────────────────
  await p.setViewportSize(FOLDED); await p.waitForTimeout(900);
  const back = await p.evaluate(() => {
    const mact = document.querySelector('#anima-mact'); const r = mact.getBoundingClientRect();
    const vis = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; };
    return { w: Math.round(r.width), 바닥: Math.round(window.innerHeight - r.bottom),
             표정줄: vis('.anima-mact-expr'), 좌우버튼: vis('#anima-rail-side'),
             mactH: getComputedStyle(document.querySelector('#anima-root')).getPropertyValue('--anima-mact-h').trim() };
  });
  ck('★ 세로로 되돌리면 예전 하단바로 복귀', back.w >= 380 && back.바닥 <= 2, JSON.stringify(back));
  ck('세로에서는 표정 칩 줄이 다시 보인다', back.표정줄);
  ck('세로에서는 좌우 바꾸기 버튼을 숨긴다 (하단바에선 자리만 먹는다)', !back.좌우버튼);
  ck('세로에서 --anima-mact-h 가 다시 실제 높이', back.mactH !== '0px' && parseFloat(back.mactH) > 100, back.mactH);

  // ── 백업에 들어가는가 (빠지면 기기 옮길 때 통째로 사라진다) ──────
  const inBackup = require('fs').readFileSync('/home/user/promt-lab/index.html', 'utf8')
    .includes("'anima_rail_side_v1'");
  ck('★ 레일 좌우 설정이 백업(_IO_ETC_KEYS)에 들어 있다', inBackup);

  ck('오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
