// 2단에서 '기준'은 왼쪽 칸이 맡는다 — 오른쪽은 결과가 통째로 (v9.179.0 — 사용자 신고)
//  ★ 사용자 신고: "왼쪽에 큰 원본, 오른쪽에 작은 원본 + 작은 출력" — 같은 원본이 한 화면에 두 번.
//    게다가 그 중복이 결과 칸을 반으로 갈라 **결과가 186px 밖에 안 나왔다**(재보고 확인).
//  ★ 2단에서는 비교가 이미 칸끼리 일어난다(왼쪽 원본 크게 ↔ 오른쪽 결과 크게).
//    오른쪽 안의 미니 비교는 1단(폰)용 장치다 — 폰은 스크롤해야 원본이 보이니까 필요하다.
//  ★ 조건 분기로 만들지 않았다. 잠갔든 안 잠갔든 결과 크기가 같아야 한다(잠글 때 화면이 튀면 안 된다).
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
  const w = (s) => { const e = document.querySelector(s); if (!e) return 0; const r = e.getBoundingClientRect(); return Math.round(r.width); };
  const cmp = document.querySelector('#anima-result .anima-cmp');
  const figs = cmp ? [...cmp.querySelectorAll('figure')].map(f => (f.querySelector('.anima-lbl') || {}).textContent.trim().slice(0, 8)) : [];
  const ls = document.querySelector('#anima-lockslot');
  return {
    비교칸: figs,
    결과폭: w('#anima-result .anima-frame[data-lb="1"]'),
    왼쪽잠금: !!(ls && ls.querySelector('.anima-frame')),
    잠금자리보임: !!ls && getComputedStyle(ls).display !== 'none',
    //  ★ '같은 그림이 두 번 그려지는가' 를 직접 센다.
    //    넣기 카드의 미리보기는 잘라내기 등으로 가공된 주소라 _anima.img.dataURL 과 안 맞고,
    //    형식(data:image/svg)으로 세면 잠근 그림까지 섞인다 — 둘 다 헛수를 잡았다(실제로 겪음).
    //    그래서 '보이는 이미지 중 주소가 겹치는 것이 있는가' 로 본다.
    겹친그림: (() => {
      const c = {};
      //  갤러리는 뺀다 — 결과가 '비교 칸'과 '목록'에 함께 나오는 건 정상이다(중복이 아니다).
      [...document.querySelectorAll('#anima-root img')]
        .filter(i => !i.closest('.anima-gal') && i.getBoundingClientRect().width > 4)
        .forEach(i => { c[i.src] = (c[i.src] || 0) + 1; });
      return Math.max(0, ...Object.values(c).map(v => v - 1));
    })(),
  };
});
const setSrc = (p) => p.evaluate(async (u) => { window.showToast = () => {}; await _animaSetImage(u, 'src'); }, SVG('원본', '#c0392b'));
//  ★ 잠근 그림과 '지금 보는 결과'를 서로 다른 그림으로 둔다 — 실사용이 그렇다
//    (예전 결과의 시드를 잠가 두고, 새로 뽑은 결과를 본다). 같은 주소로 두면 겹침 검사가 헛돈다.
const lockSeed = (p) => p.evaluate(async (a) => {
  const recs = [{ k: 2, url: a.newer, seed: 7, src: null, opt: '새것' },
                { k: 1, url: a.locked, seed: 4242, src: null, opt: '잠근것' }];
  await _animaIdbAddMany(recs);
  _anima.results = recs;            // 최신이 맨 앞
  _animaResSel = 0;                 // 새 결과를 보는 중
  _animaSeedLockSet(recs[1]);       // 옛 결과의 시드를 잠갔다
  _animaRenderResult();
}, { locked: SVG('잠금', '#2e86c1'), newer: SVG('결과', '#27ae60') });

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const open = async (w, hgt) => {
    const ctx = await b.newContext({ viewport: { width: w, height: hgt }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await ctx.addInitScript(() => { try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); } catch (e) {} });
    await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
    await p.waitForTimeout(1200);
    return { ctx, p };
  };

  // ══ 2단 (폴드 펼침) ═══════════════════════════════════════════════
  {
    const { ctx, p } = await open(884, 1104); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await setSrc(p); await p.waitForTimeout(1000);
    const a = await look(p);
    ck('★ 2단 — 같은 그림이 두 번 그려지지 않는다', a.겹친그림 === 0, `겹침 ${a.겹친그림}건`);
    ck('★ 2단 — 비교 칸에 결과만 남는다', a.비교칸.length === 1 && /결과/.test(a.비교칸[0]), JSON.stringify(a.비교칸));
    ck('★ 2단 — 결과가 칸을 통째로 쓴다 (예전 186px)', a.결과폭 >= 330, `${a.결과폭}px`);
    ck('잠금이 없으면 왼쪽 잠금 자리는 비어 숨겨진다', !a.왼쪽잠금 && !a.잠금자리보임, JSON.stringify(a));

    // 시드를 잠가도 결과 크기가 그대로여야 한다 (조건 분기로 만들지 않은 이유)
    await lockSeed(p); await p.waitForTimeout(900);
    const l = await look(p);
    ck('★ 2단 — 시드를 잠그면 잠근 그림이 왼쪽 칸으로 간다', l.왼쪽잠금 === true && l.잠금자리보임 === true, JSON.stringify(l));
    ck('★ 2단 — 잠가도 결과 크기가 그대로다 (화면이 안 튄다)', Math.abs(l.결과폭 - a.결과폭) <= 2, `${a.결과폭} → ${l.결과폭}`);
    ck('2단 — 잠근 뒤에도 비교 칸은 결과 하나뿐', l.비교칸.length === 1, JSON.stringify(l.비교칸));
    ck('2단 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 1단 (폰) — 예전 그대로여야 한다 ══════════════════════════════
  {
    const { ctx, p } = await open(390, 844); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await setSrc(p); await p.waitForTimeout(1000);
    const a = await look(p);
    ck('★ 1단 — 예전처럼 비교 칸에 원본과 결과가 나란히', a.비교칸.length === 2 && /원본/.test(a.비교칸[0]), JSON.stringify(a.비교칸));
    ck('1단 — 왼쪽 잠금 자리는 안 쓴다', !a.왼쪽잠금 && !a.잠금자리보임);
    await lockSeed(p); await p.waitForTimeout(900);
    const l = await look(p);
    ck('★ 1단 — 잠그면 예전처럼 비교 칸 안에서 원본 자리가 잠금으로 바뀐다',
       l.비교칸.length === 2 && /시드|🔒/.test(l.비교칸[0]) && !l.왼쪽잠금, JSON.stringify(l.비교칸));
    ck('1단 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 접었다 폈다 — 폭이 바뀌면 자리를 다시 정해야 한다 ═════════════
  //   ★ CLAUDE.md: '리사이즈 때 다시 계산해야 하는 것을 새로 만들면 여기에 한 줄 더할 것'
  {
    const { ctx, p } = await open(390, 900); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await setSrc(p); await lockSeed(p); await p.waitForTimeout(900);
    const f1 = await look(p);
    ck('[접힘] 비교 칸 안에 잠금 (1단)', f1.비교칸.length === 2 && !f1.왼쪽잠금, JSON.stringify(f1.비교칸));
    await p.setViewportSize({ width: 884, height: 1104 }); await p.waitForTimeout(900);
    const u1 = await look(p);
    ck('★ [펼침] 새로고침 없이 잠금이 왼쪽 칸으로 옮겨간다', u1.왼쪽잠금 === true && u1.비교칸.length === 1, JSON.stringify(u1));
    ck('★ [펼침] 결과가 통째로 커진다', u1.결과폭 >= 330, `${f1.결과폭} → ${u1.결과폭}`);
    await p.setViewportSize({ width: 390, height: 900 }); await p.waitForTimeout(900);
    const f2 = await look(p);
    ck('★ [다시 접음] 예전 자리로 돌아온다', f2.비교칸.length === 2 && !f2.왼쪽잠금, JSON.stringify(f2));
    ck('★ 어느 폭에서도 같은 그림이 두 번 그려지지 않는다', f2.겹친그림 === 0 && u1.겹친그림 === 0, `접힘 ${f2.겹친그림} / 펼침 ${u1.겹친그림}`);
    ck('접었다 폈다 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
