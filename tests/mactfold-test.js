// 하단바 옵션 줄 접기 (v9.178.0 — 사용자 요청)
//  ★ 접기는 '위치(data-rail)'와 **독립된 축(data-mact)** 이다. 조합으로 CSS 를 나열하기 시작하면
//    축이 늘 때마다 규칙이 배로 늘고, 이 프로젝트에서 반복된 '축이 늘면 조용히 샌다'를 밟는다.
//    → 그래서 이 검사는 **위치 3 × 접힘 2 = 6조합 전부**를 본다.
//  ★ 기본은 펼침이어야 한다 — 접힘이 기본이면 하단바를 만지는 검사 4개가 한꺼번에 깨진다.
//  ★ 팝업은 바의 자식이다. 열어 둔 채 접으면 같이 사라져 '눌렀는데 아무 일도 안 남'이 된다 → 접기 전에 닫아야 한다.
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
  const m = document.querySelector('#anima-mact');
  const vis = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; };
  const r = m ? m.getBoundingClientRect() : null;
  return {
    mact: root ? root.dataset.mact : null, rail: root ? root.dataset.rail : null,
    바: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
    mactH: root ? parseFloat(getComputedStyle(root).getPropertyValue('--anima-mact-h')) : null,
    아이콘줄: vis('.anima-mact-icos'), 표정줄: vis('.anima-mact-expr'), 그룹줄: vis('.anima-mact-grp'),
    실행: vis('#anima-mact-run'), 손잡이: vis('#anima-mact-fold'), 위치버튼: vis('#anima-rail-side'),
    손잡이글자: (document.querySelector('#anima-mact-fold') || {}).textContent,
    팝업: !!document.querySelector('.anima-futapop'),
  };
});
const fold = async (p) => { await p.evaluate(() => { window.showToast = () => {}; document.querySelector('#anima-mact-fold').click(); }); await p.waitForTimeout(400); };
const move = async (p) => { await p.evaluate(() => { window.showToast = () => {}; document.querySelector('#anima-rail-side').click(); }); await p.waitForTimeout(400); };

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 900, height: 390 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.addInitScript(() => { try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); } catch (e) {} });
  await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
  await p.waitForTimeout(1500);

  // ── ① 기본은 펼침 ─────────────────────────────────────────────────
  const a = await look(p);
  ck('★ 기본은 펼침 (검사 4개가 하단바를 직접 만진다 — 기본이 접힘이면 다 깨진다)',
     a.mact === 'open' && a.아이콘줄 && a.그룹줄, JSON.stringify(a));
  ck('손잡이가 보이고 지금 상태를 알려 준다', a.손잡이 && a.손잡이글자 === '▾');

  // ── ② 접으면 옵션 줄만 사라지고 실행은 남는다 ──────────────────────
  const hOpen = a.바.h;
  await fold(p);
  const f = await look(p);
  ck('★ 접으면 옵션 줄 3개가 사라진다', f.mact === 'fold' && !f.아이콘줄 && !f.표정줄 && !f.그룹줄, JSON.stringify(f));
  ck('★ 실행 버튼은 남는다 (접어도 바로 뽑을 수 있어야 한다)', f.실행 === true);
  ck('★ 손잡이가 남아 되돌릴 수 있다', f.손잡이 === true && f.손잡이글자 === '▴', f.손잡이글자);
  ck('위치 버튼도 남는다', f.위치버튼 === true);
  ck(`★ 바가 실제로 낮아진다 (${hOpen} → ${f.바.h}px)`, f.바.h < hOpen * 0.6, `${hOpen} → ${f.바.h}`);
  ck('★ 내용에 주는 여백(--anima-mact-h)도 같이 줄어든다', f.mactH > 0 && f.mactH < a.mactH, `${a.mactH} → ${f.mactH}`);

  // ── ③ 다시 펼치면 되돌아온다 ──────────────────────────────────────
  await fold(p);
  const o = await look(p);
  ck('★ 다시 펼치면 옵션 줄이 전부 돌아온다', o.mact === 'open' && o.아이콘줄 && o.그룹줄 && Math.abs(o.바.h - hOpen) <= 2, JSON.stringify(o.바));

  // ── ④ 팝업을 열어 둔 채 접으면? (팝업은 바의 자식이다) ─────────────
  await p.evaluate(() => { const b = document.querySelector('.anima-gbtn[data-grp="face"]'); if (b) b.click(); });
  await p.waitForTimeout(500);
  const hasPop = await p.evaluate(() => !!document.querySelector('.anima-futapop'));
  ck('팝업이 열렸다 (사전 조건)', hasPop === true);
  await fold(p);
  const fp = await look(p);
  ck('★ 팝업을 열어 둔 채 접어도 깨지지 않는다 (접기 전에 팝업을 닫는다)',
     fp.mact === 'fold' && fp.팝업 === false && fp.실행 === true, JSON.stringify(fp));
  //   ★ 진짜 볼 것: --anima-mact-h 에 '닫힌 팝업 높이'가 섞여 부풀지 않았는가.
  //     (_animaSyncMactHeight 는 팝업이 있으면 그 높이를 빼는 계산을 한다 — 여기가 어긋나기 쉽다)
  ck('★ 그 상태의 여백이 접힌 바 높이와 정확히 맞는다 (팝업 높이가 안 섞인다)',
     Math.abs(fp.mactH - fp.바.h) <= 2, `여백 ${fp.mactH} vs 바 ${fp.바.h}`);
  await fold(p);   // 원위치

  // ── ⑤ 위치 3 × 접힘 2 = 6조합 전부 ────────────────────────────────
  //   조합으로 규칙을 나열하지 않았으므로, 어느 위치에서도 접힘이 똑같이 동작해야 한다.
  for (const side of ['bottom', 'right', 'left']) {
    await p.evaluate((s) => { try { localStorage.setItem('anima_rail_side_v1', s); } catch (e) {} ; _animaApplyRailSide(); }, side);
    await p.waitForTimeout(350);
    const op = await look(p);
    ck(`[${side}·펼침] 옵션 줄이 보인다`, op.rail === side && op.mact === 'open' && op.그룹줄 === true, JSON.stringify(op));
    await fold(p);
    const fo = await look(p);
    ck(`[${side}·접힘] ★ 옵션 줄만 사라지고 실행·손잡이는 남는다`,
       fo.mact === 'fold' && !fo.그룹줄 && !fo.아이콘줄 && fo.실행 && fo.손잡이, JSON.stringify(fo));
    ck(`[${side}·접힘] 가로 스크롤 없음`, await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await fold(p);   // 되돌림
  }

  // ── ⑥ 새로고침해도 접힘이 남는다 ──────────────────────────────────
  await p.evaluate(() => { try { localStorage.setItem('anima_rail_side_v1', 'bottom'); } catch (e) {} });
  await fold(p);
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
  await p.waitForTimeout(1400);
  const rl = await look(p);
  ck('★ 새로고침해도 접힘이 남는다', rl.mact === 'fold' && !rl.그룹줄 && rl.손잡이글자 === '▴', JSON.stringify(rl));

  ck('오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));

  // ── ⑦ 백업 목록에 들어 있나 (빠뜨리면 기기 옮길 때 사라진다) ────────
  const html = fs.readFileSync('/home/user/promt-lab/index.html', 'utf8');
  ck('★ 백업(_IO_ETC_KEYS)에 접힘 설정이 들어 있다', /_IO_ETC_KEYS = \[[\s\S]{0,500}anima_mact_fold_v1/.test(html));

  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
