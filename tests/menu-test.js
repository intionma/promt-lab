// Anima 로 부팅했을 때 상단 메뉴 항목이 전부 실제로 동작하는가 (v9.169.0 전수 조사)
//  ★ 재현 대상 사고: v9.135.0에서 클래식 엔진을 지연 실행으로 바꾸자, 상단바(=Anima에서도 보이는 UI)에서
//    부르는 클래식 함수가 없어서 '내보내기/불러오기'가 눌러도 아무 일이 안 일어났다(v9.139.0에서 수정).
//    지금은 toggleGtMenu() 가 먼저 _plEnsureClassic() 을 부르는 구조인데, 그게 진짜 되는지
//    '눌러서' 확인한다. 메뉴가 늘어날 때 같은 사고가 조용히 재발하는 걸 막는 검사다.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join('/home/user/promt-lab', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };

//  누르면 '뭔가 화면에 떠야' 하는 항목들. 되돌리기 어려운 것(완전 초기화·개발자 모드·HTML 저장)은 뺀다.
const ITEMS = [
  ['classify', '자동 분류'], ['audit', 'DB 검사'], ['translate', '번역 세션'],
  ['dbmanager', 'DB 관리'], ['catalog', '태그 카탈로그'], ['dedup', '중복 감지'],
  ['comfy', 'ComfyUI 전송'], ['memo', '생성 세팅 메모'],
  ['export', '내보내기'], ['import', '불러오기 / 복구'], ['preset', '프리셋 관리'],
  ['shutdown', 'PC 종료'],
];
//  누르면 모달이 아니라 '동작'을 하는 항목 — 오류만 안 나면 된다
const ACTIONS = [['reorganize', '레이어 재배치']];

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.addInitScript(() => {
    try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); } catch (e) {}
  });
  await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => !!document.getElementById('anima-root'), null, { timeout: 20000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.showToast = () => {}; });

  //  Anima 로 들어왔으면 클래식 엔진은 아직 안 실려 있어야 한다(그게 지연 실행의 목적)
  const lazy = await p.evaluate(() => typeof openDBManager !== 'function');
  ck('Anima 부팅 시 클래식 엔진은 아직 안 실린다 (지연 실행이 살아 있다)', lazy, '이미 실려 있음');

  //  메뉴를 열면 그때 실린다
  await p.evaluate(() => { try { toggleGtMenu(); } catch (e) {} });
  await p.waitForTimeout(1500);
  const loaded = await p.evaluate(() => ({
    fn: typeof openDBManager === 'function',
    open: !!document.querySelector('#gt-menu.open, #gt-menu[style*="display: block"], #gt-menu[style*="display:block"]')
       || (() => { const m = document.getElementById('gt-menu'); return !!m && getComputedStyle(m).display !== 'none'; })(),
    initApp: !!document.querySelector('#app-container'),
  }));
  ck('★ 상단 메뉴를 열면 클래식 엔진이 실린다', loaded.fn, JSON.stringify(loaded));
  ck('메뉴가 실제로 열린다', loaded.open, JSON.stringify(loaded));

  //  '창이 떴다'는 선택자로 판정하지 않는다 — 항목마다 클래스·id 가 제각각이라 놓친다.
  //  화면 위쪽(fixed/absolute)에 실제로 보이는 큰 요소가 있는지로만 본다.
  const shown = async () => p.evaluate(() => {
    const out = [];
    document.querySelectorAll('body > *').forEach(e => {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity || '1') < 0.05) return;
      if (s.position !== 'fixed' && s.position !== 'absolute') return;
      const r = e.getBoundingClientRect();
      if (r.height < 60 || r.width < 60) return;
      if (e.id === 'gt-menu' || e.id === 'app-container' || e.id === 'anima-root') return;
      out.push(e.id || e.className || e.tagName);
    });
    return out;
  });
  const openCount = async () => (await shown()).length;

  for (const [tool, label] of ITEMS) {
    const before = errs.length;
    const ok = await p.evaluate(async (t) => {
      const btn = document.querySelector(`.gt-menu-item[data-tool="${t}"]`);
      if (!btn) return { found: false };
      btn.click();
      await new Promise(r => setTimeout(r, 700));
      return { found: true };
    }, tool);
    ck(`  [${label}] 메뉴 항목이 있다`, ok.found, tool);
    if (!ok.found) continue;
    const w = await shown();
    ck(`★ [${label}] 눌렀을 때 창이 뜬다 (먹통 아님)`, w.length > 0, '떠 있는 것: ' + (w.join(' / ') || '없음'));
    ck(`  [${label}] 오류 없음`, errs.length === before, errs.slice(before).slice(0, 2).join(' | '));
    // 닫고 다음으로 — Esc + 남은 오버레이 강제 정리
    await p.keyboard.press('Escape');
    await p.evaluate(() => {
      document.querySelectorAll('.modal-overlay').forEach(e => { e.style.display = 'none'; });
      [...document.body.children].forEach(e => { if (e.id && /^__/.test(e.id)) e.remove(); });
      try { closeGtMenu(); } catch (e) {}
    });
    await p.evaluate(() => { try { toggleGtMenu(); } catch (e) {} });
    await p.waitForTimeout(250);
  }

  for (const [tool, label] of ACTIONS) {
    const before = errs.length;
    const found = await p.evaluate(async (t) => {
      const btn = document.querySelector(`.gt-menu-item[data-tool="${t}"]`);
      if (!btn) return false;
      btn.click(); await new Promise(r => setTimeout(r, 900)); return true;
    }, tool);
    ck(`  [${label}] 메뉴 항목이 있다`, found, tool);
    ck(`★ [${label}] 눌러도 터지지 않는다`, errs.length === before, errs.slice(before).slice(0, 2).join(' | '));
    await p.evaluate(() => { document.querySelectorAll('.modal-overlay').forEach(e => { e.style.display = 'none'; }); try { toggleGtMenu(); } catch (e) {} });
    await p.waitForTimeout(250);
  }

  ck('전체 콘솔 오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close(); await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
