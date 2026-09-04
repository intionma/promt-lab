// 뒤로가기로 앱이 곧장 꺼지던 것 (v9.180.0 — 사용자 신고)
//  ★ 신고: "뒤로가기하면 바로 웹이 나가져서 크롬창이 꺼짐."
//    아무것도 안 열린 상태에서는 히스토리에 돌아갈 곳이 없어 창이 그대로 닫혔다.
//  ★ 처방: 부팅 때 '문지기' 항목을 하나 쌓아 그 한 번을 대신 먹고 안내만 띄운다.
//    브라우저는 스크립트로 창을 못 닫으므로, '두 번째'는 문지기를 다시 세우지 않는 것으로 통과시킨다.
//  ★ 제일 중요한 것: **라이트박스·모달이 열려 있을 때의 뒤로가기는 예전 그대로여야 한다.**
//    문지기가 그걸 가로채면 "뒤로가기로 창이 안 닫힌다"는 더 나쁜 문제가 된다.
//  ★ v9.192.0 — 안내를 **전용 스낵바**(#pl-back-snack)로 바꿨다. 일반 토스트는 생성 알림에 묻힌다.
//    그리고 예전엔 토스트 1.8초 / 재무장 2.2초로 **0.4초 어긋나** 안내가 사라졌는데도 나가지는
//    구간이 있었다. 이제 '보이는 동안 = 나갈 수 있는 동안' 이어야 한다 — 그걸 실측으로 본다.
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

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.addInitScript(() => { try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); } catch (e) {} });
  await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
  await p.waitForTimeout(1600);
  await p.evaluate(() => { window.__toasts = []; const r = window.showToast; window.showToast = (m) => { window.__toasts.push(String(m)); }; });

  const alive = () => p.evaluate(() => typeof _anima !== 'undefined').catch(() => false);
  const url = () => p.url();

  // ── ① 아무것도 안 열린 상태에서 뒤로가기 ───────────────────────────
  ck('문지기가 쌓여 있다 (히스토리에 돌아갈 곳이 생김)',
     await p.evaluate(() => history.length > 1), String(await p.evaluate(() => history.length)));
  const u0 = url();
  await p.goBack({ waitUntil: 'commit' }).catch(() => {});
  await p.waitForTimeout(500);
  ck('★ 한 번 눌러도 앱이 안 꺼진다 (문서가 그대로 살아 있다)', await alive(), '문서가 날아갔다');
  ck('★ 같은 주소에 그대로 있다', url() === u0, `${u0} → ${url()}`);
  const snack = await p.evaluate(() => {
    const el = document.getElementById('pl-back-snack');
    if (!el) return null;
    const st = getComputedStyle(el), r = el.getBoundingClientRect();
    return { 보임: el.classList.contains('on') && st.opacity !== '0', 글: el.textContent,
             폭: Math.round(r.width), 삐짐: r.right > innerWidth + 1 || r.left < -1,
             막대: !!el.querySelector('.pl-bs-bar'), 안막음: st.pointerEvents === 'none' };
  });
  ck('★★ 전용 스낵바로 안내가 뜬다 (일반 토스트가 아니다)', !!snack && snack.보임 === true, JSON.stringify(snack));
  ck('★ "한 번 더 누르면 나갑니다" 라고 알려 준다', !!snack && /한 번 더/.test(snack.글), snack && snack.글);
  ck('★ 폰 390px 에서 안 삐진다', !!snack && !snack.삐짐 && snack.폭 <= 380, JSON.stringify(snack));
  ck('★ 남은 시간 막대가 있다 (보이는 동안이 곧 나갈 수 있는 동안)', !!snack && snack.막대 === true);
  ck('★ 밑에 있는 것을 가로막지 않는다', !!snack && snack.안막음 === true, JSON.stringify(snack));
  //  일반 토스트로는 안 띄운다 — 생성 알림에 묻히면 안 된다
  ck('★ 일반 토스트로는 안 띄운다', !/한 번 더/.test(await p.evaluate(() => (window.__toasts || []).join(' | '))),
     await p.evaluate(() => (window.__toasts || []).join(' | ')));

  // ── ② '보이는 동안 = 나갈 수 있는 동안' 이 정확히 맞는가 ─────────────
  //   ⚠ 예전엔 안내 1.8초 / 재무장 2.2초로 0.4초 어긋나, 안내가 사라졌는데도 나가지는 구간이 있었다.
  await p.waitForTimeout(1200);
  const mid = await p.evaluate(() => ({
    보임: (document.getElementById('pl-back-snack') || {}).classList?.contains('on'),
    문지기: !!(history.state && history.state._plGuard === 1),
  }));
  ck('★★ 안내가 보이는 동안에는 문지기가 없다 (그래서 나갈 수 있다)',
     mid.보임 === true && mid.문지기 === false, JSON.stringify(mid));
  await p.waitForTimeout(2000);
  const after = await p.evaluate(() => ({
    보임: (document.getElementById('pl-back-snack') || {}).classList?.contains('on'),
    문지기: !!(history.state && history.state._plGuard === 1),
  }));
  ck('★★ 안내가 사라지면 그 순간 문지기가 다시 선다 (어긋나는 구간이 없다)',
     after.보임 === false && after.문지기 === true, JSON.stringify(after));

  // ── ③ 크게 보기가 열려 있으면 뒤로가기는 '그것만' 닫는다 (예전 그대로) ─
  await p.evaluate(async () => {
    //  ★ 안내를 계속 받아 적어야 한다 — 여기서 no-op 으로 덮으면 아래에서 '옛 안내'를 읽고 오진한다
    //    (실제로 그렇게 잘못 실패했다). 기록기는 유지하고 목록만 비운다.
    window.__toasts = [];
    const recs = [{ k: 1, url: 'http://x/a.png', seed: 1, src: null, opt: '' }];
    await _animaIdbAddMany(recs); _anima.results = recs; _animaRenderResult();
    await new Promise(r => setTimeout(r, 300));
    _animaOpenLbAt(0, false);
  });
  await p.waitForTimeout(600);
  ck('크게 보기가 열렸다 (사전 조건)', await p.evaluate(() => !!window._lbActive));
  await p.goBack({ waitUntil: 'commit' }).catch(() => {});
  await p.waitForTimeout(500);
  ck('★ 뒤로가기로 크게 보기가 닫힌다 (문지기가 가로채지 않는다)',
     await p.evaluate(() => !window._lbActive), '안 닫혔다');
  ck('★ 그때 앱은 살아 있다', await alive());
  ck('★★ 크게 보기를 닫는 뒤로가기에는 종료 안내가 안 뜬다 (문지기가 안 끼어든다)',
     await p.evaluate(() => !(document.getElementById('pl-back-snack') || {}).classList?.contains('on')),
     '크게 보기를 닫았는데 종료 안내가 떴다');
  ck('★ 크게 보기 뒤로가기는 한 번에 닫힌다 (두 번 눌러야 하면 더 나쁜 문제다)',
     await p.evaluate(() => !window._lbActive));

  // ── ④ 모달이 열려 있으면 그것만 닫힌다 ─────────────────────────────
  await p.evaluate(() => { window.__toasts = []; try { openChangelogModal(); } catch (e) {} });
  await p.waitForTimeout(600);
  const modalOpen = await p.evaluate(() => { const m = document.getElementById('changelog-modal'); return !!m && getComputedStyle(m).display !== 'none'; });
  if (modalOpen) {
    await p.goBack({ waitUntil: 'commit' }).catch(() => {});
    await p.waitForTimeout(500);
    ck('★ 뒤로가기로 모달만 닫힌다', await p.evaluate(() => { const m = document.getElementById('changelog-modal'); return !m || getComputedStyle(m).display === 'none'; }));
    ck('★ 모달을 닫는 뒤로가기에도 앱은 살아 있다', await alive());
    ck('★ 모달을 닫는 뒤로가기에도 종료 안내가 안 뜬다',
       await p.evaluate(() => !(document.getElementById('pl-back-snack') || {}).classList?.contains('on')));
  } else {
    console.log('  (내역 모달을 못 열어 이 항목은 건너뜀)');
  }

  ck('오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
