// 하단바 위치 — 아래 / 왼쪽 / 오른쪽 을 사용자가 고른다 (v9.177.0 — 사용자 요청)
//  ★ 왜 자동 감지를 뺐나: 화면 크기로 의도를 맞히려다 이 프로젝트에서 두 번 틀렸다.
//      v9.174.0 — 2단 문턱 1000px 에 폴드 펼친 폭 884px 가 안 걸림
//      v9.175.0 — 레일 조건 '높이 560px 이하' 에 펼친 가로 884px 가 안 걸림
//    사용자가 옆으로 옮기려는 진짜 이유는 '2단에서 왼쪽 칸과 중복이라서' 였다 — 크기로 알 수 없다.
//  ★ 그래서 이 검사의 핵심은 **어느 화면에서도 고른 대로 되는가** 이다(폰 세로 포함).
//    좁다고 임의로 되돌리면 안 된다 — '왜 맘대로 바뀌지'가 되기 때문.
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
  const btn = document.querySelector('#anima-rail-side');
  const wrap = document.querySelector('.anima-wrap');
  const cs = wrap ? getComputedStyle(wrap) : null;
  const r = m ? m.getBoundingClientRect() : null;
  const grp = [...document.querySelectorAll('.anima-mact-grp .anima-gbtn')];
  return {
    side: root ? root.dataset.rail : null,
    바: r ? { w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), t: Math.round(r.top) } : null,
    mactH: root ? getComputedStyle(root).getPropertyValue('--anima-mact-h').trim() : null,
    여백: cs ? { L: cs.paddingLeft, R: cs.paddingRight, B: cs.paddingBottom } : null,
    버튼보임: !!btn && getComputedStyle(btn).display !== 'none',
    버튼글자: btn ? btn.textContent.trim() : null,
    버튼툴팁: btn ? btn.title : null,
    그룹버튼수: grp.length,
    // 글자가 세로로 눌리지 않았는가 (레일에서 실제로 났던 사고)
    그룹최소높이: grp.length ? Math.min(...grp.map(b => Math.round(b.getBoundingClientRect().height))) : null,
    표정줄보임: (() => { const e = document.querySelector('.anima-mact-expr'); return !!e && getComputedStyle(e).display !== 'none'; })(),
    가로스크롤: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
});
const press = async (p) => { await p.evaluate(() => { window.showToast = () => {}; document.querySelector('#anima-rail-side').click(); }); await p.waitForTimeout(400); };

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  //  ★ 폰 세로(390) · 폴드 펼침(884) · 폴드 겉화면 가로(900x390) 셋 다에서 똑같이 되어야 한다
  for (const [nm, vw, vh] of [['폰 세로', 390, 844], ['폴드 펼침', 884, 1104], ['겉화면 가로', 900, 390]]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await ctx.addInitScript(() => { try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); } catch (e) {} });
    await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
    await p.waitForTimeout(1500);

    // ── 기본은 아래 ─────────────────────────────────────────────────
    const a = await look(p);
    ck(`[${nm}] 기본 위치는 아래 (예전 그대로)`, a.side === 'bottom' && a.바.l === 0 && a.바.w === vw, JSON.stringify(a.바) + ' side=' + a.side);
    ck(`[${nm}] ★ 위치 버튼이 하단바에서도 보인다 (숨기면 되돌릴 수가 없다)`, a.버튼보임 === true && a.버튼글자 === '⬓', `${a.버튼보임} / ${a.버튼글자}`);
    ck(`[${nm}] 버튼이 지금 위치와 다음 위치를 알려 준다`, /아래/.test(a.버튼툴팁 || '') && /오른쪽/.test(a.버튼툴팁 || ''), a.버튼툴팁);
    ck(`[${nm}] 아래일 때 표정 줄이 보인다`, a.표정줄보임 === true);

    // ── 한 번 누르면 오른쪽 ──────────────────────────────────────────
    await press(p);
    const r = await look(p);
    ck(`[${nm}] ★ 한 번 누르면 오른쪽 레일`, r.side === 'right' && r.바.w <= 110 && Math.abs(r.바.l + r.바.w - vw) <= 2, JSON.stringify(r.바));
    ck(`[${nm}] 오른쪽이면 내용 여백이 오른쪽에 생긴다`, parseFloat(r.여백.R) > 90 && parseFloat(r.여백.B) < 40, JSON.stringify(r.여백));
    ck(`[${nm}] ★ 레일은 세로를 안 먹는다 (--anima-mact-h = 0)`, r.mactH === '0px', String(r.mactH));
    ck(`[${nm}] ★ 그룹 버튼 6개가 다 있고 글자가 안 눌린다`, r.그룹버튼수 === 6 && r.그룹최소높이 >= 28, `${r.그룹버튼수}개 / 최소 ${r.그룹최소높이}px`);
    ck(`[${nm}] 레일에서는 표정 줄을 숨긴다 (폭을 재는 구조라 96px 에선 뜻이 없다)`, r.표정줄보임 === false);
    ck(`[${nm}] 가로 스크롤 없음(오른쪽)`, !r.가로스크롤);

    // ── 두 번째는 왼쪽 ──────────────────────────────────────────────
    await press(p);
    const l = await look(p);
    ck(`[${nm}] ★ 또 누르면 왼쪽 레일`, l.side === 'left' && l.바.l === 0 && l.바.w <= 110, JSON.stringify(l.바));
    ck(`[${nm}] 왼쪽이면 내용 여백이 왼쪽에 생긴다`, parseFloat(l.여백.L) > 90 && parseFloat(l.여백.R) < 40, JSON.stringify(l.여백));
    ck(`[${nm}] 가로 스크롤 없음(왼쪽)`, !l.가로스크롤);

    // ── 세 번째는 다시 아래 ─────────────────────────────────────────
    await press(p);
    const back = await look(p);
    ck(`[${nm}] ★ 한 바퀴 돌면 아래로 돌아온다`, back.side === 'bottom' && back.바.w === vw, JSON.stringify(back.바));
    ck(`[${nm}] 아래로 돌아오면 세로 여백이 되살아난다`, parseFloat(back.여백.B) > 60, JSON.stringify(back.여백));

    // ── 새로고침해도 고른 위치가 남는다 ──────────────────────────────
    await press(p);   // → 오른쪽
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
    await p.waitForTimeout(1400);
    const after = await look(p);
    ck(`[${nm}] ★ 새로고침해도 고른 위치가 남는다`, after.side === 'right' && after.버튼글자 === '◨', `${after.side} / ${after.버튼글자}`);
    ck(`[${nm}] 오류 없음`, errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ── 백업에 설정 키가 들어간다 (빠뜨리면 기기 옮길 때 사라진다) ──────
  const html = fs.readFileSync('/home/user/promt-lab/index.html', 'utf8');
  ck('★ 백업 목록(_IO_ETC_KEYS)에 위치 설정이 들어 있다', /_IO_ETC_KEYS = \[[\s\S]{0,400}anima_rail_side_v1/.test(html));

  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
