// 🥚 불알 크기 축 futaBalls (v9.211.0 — 사용자 요청)
//  ★ 지키는 것:
//   · 축 4개(없음·작게·크게·초대형)가 있고, 기존 사용자 저장분에도 주입된다
//   · 옵션 패널(후타 → 불알)과 하단바 후타 팝업에 나온다
//   · ★★ 불알을 안 고르면 보내는 프롬프트가 **옛 코드와 글자까지 같다**(git HEAD~ 의 index.html 로 직접 만들어 대조)
//   · 불알을 고르면 크기 칩의 testicles 가 빠지고 고른 것 하나만 남는다(크기 4 × 불알 4)
//   · 말자지 + 소추 + 작게 → 작게의 small testicles 는 남는다 · 피부색 + 없음 → 못 박기 문구가 testicles 를 안 부른다
//   · 후타를 끄면 안 나간다 · 캡션에 '불알 크게' · 새로고침해도 남는다
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
//  비교본: 이 축이 생기기 직전 판. 환경변수로 바꿀 수 있다(PL_OLD_REV).
const OLD_REV = process.env.PL_OLD_REV || '61813d3';
let OLD_HTML = null;
try { OLD_HTML = execSync(`git -C "${ROOT}" show ${OLD_REV}:index.html`, { maxBuffer: 64 << 20 }).toString(); } catch (e) {}
const mk = (old) => http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (old && (u.pathname === '/' || u.pathname === '/index.html')) { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(OLD_HTML); }
  const p = path.join(ROOT, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : /\.js$/.test(p) ? 'text/javascript' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHUlEQVR42mP8z8Dwn4EIwDiqkL4KGUdDhr4KAeoRB/3s7QeVAAAAAElFTkSuQmCC';
//  안 고른 조합 — 옛 코드와 글자 대조용
const PLAIN = [[], ['futa_small'], ['futa_normal'], ['futa_large'], ['futa_huge'], ['futa_large', 'futa_erect_flaccid'],
  ['futa_small', 'dsh_horse'], ['futa_normal', 'skin_tan'], ['futa_huge', 'dcol_black', 'futa_cum_excessive'], ['skin_pale']];
const SIZES = ['futa_small', 'futa_normal', 'futa_large', 'futa_huge'];
const BALLS = { fball_none: 'no testicles', fball_small: 'small testicles', fball_large: 'large testicles', fball_huge: 'huge testicles' };

async function open(b, port, seed) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript((sd) => {
    try { if (sessionStorage.getItem('__s')) return; sessionStorage.setItem('__s', '1');
      localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1');
      if (sd) localStorage.setItem('anima_settings_v1', sd); } catch (e) {}
  }, seed || '');
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets && !!window._animaMounted, null, { timeout: 30000 });
  await p.waitForTimeout(600);
  await p.evaluate(() => { window.showToast = () => {}; window._animaEnsureUploaded = async () => 'x.png'; window._animaPump = () => {}; });
  return { ctx, p, errs };
}
const gen = (p, sets) => p.evaluate(async ({ sets, PX }) => {
  const out = [];
  _anima.img = { dataURL: PX, name: 't.png' }; _anima.prompt = 'masterpiece, 1girl, nude';
  for (const ids of sets) {
    _anima.snippets.forEach(s => { s.on = ids.includes(s.id); });
    _animaJobs = [];
    await _animaGenerate(true);
    const j = _animaJobs[_animaJobs.length - 1];
    out.push(j ? { prompt: j.prompt, opt: j.opt } : null);
  }
  _animaJobs = []; try { _animaSyncBusy(); } catch (e) {}
  return out;
}, { sets, PX });

(async () => {
  const sNew = mk(false), sOld = mk(true);
  await new Promise(r => sNew.listen(0, '127.0.0.1', r)); await new Promise(r => sOld.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PL_CHROMIUM || '/opt/pw-browsers/chromium' });
  const N = await open(b, sNew.address().port);
  const p = N.p;

  // ── 축이 있는가 · 순서 · 성질
  const ax = await p.evaluate(() => (_anima.snippets || []).filter(s => s.group === 'futaBalls').map(s => ({ id: s.id, name: s.name, detail: s.detail, text: s.text })));
  ck('불알 축 4개 · 작은 것 → 큰 것', JSON.stringify(ax.map(s => s.name)) === JSON.stringify(['없음', '작게', '크게', '초대형']), JSON.stringify(ax.map(s => s.name)));
  ck('후타 상세로 묶여 있다(detail futa)', ax.every(s => s.detail === 'futa'), JSON.stringify(ax));
  ck('서술 조각 안에 쉼표가 없다(첫 조각 = 문장)', ax.every(s => !/,/.test(s.text.split(', (')[0])), JSON.stringify(ax.map(s => s.text)));

  // ── 패널 · 팝업
  const ui = await p.evaluate(() => {
    _anima.snippets.forEach(s => { s.on = s.id === 'futa_large'; });
    const sec = _ANIMA_SECS.find(x => x.key === 'futa');
    const flds = sec.flds.map(f => f.lab);
    let pop = ''; try { _animaFutaPop = 'futa_large'; pop = _animaFutaPopHtml(); _animaFutaPop = null; } catch (e) { pop = 'ERR ' + e.message; }
    let panel = ''; try { panel = _animaPanelHtml(); } catch (e) { panel = 'ERR ' + e.message; }
    return { flds, popHas: /fball_none/.test(pop) && /불알/.test(pop), pop: pop.slice(0, 80), panelHas: /fball_huge/.test(panel), etc: (typeof _animaEtcList === 'function' ? _animaEtcList().map(s => s.id) : []) };
  });
  ck('옵션 패널 후타 칸: 크기 바로 뒤가 불알', ui.flds[0] === '크기' && ui.flds[1] === '불알', JSON.stringify(ui.flds));
  ck('옵션 패널에 불알 칩이 그려진다', ui.panelHas, '');
  ck('불알 칩이 \'기타\' 줄로 새지 않는다', !ui.etc.some(id => /^fball_/.test(id)), JSON.stringify(ui.etc));
  ck('하단바 후타 팝업에 불알 줄이 있다', ui.popHas, ui.pop);

  // ── 후타 팝업이 상단바 밑으로 안 들어간다(줄이 늘어 키가 커졌다 — 폰 세로 844 · 낮은 화면 640)
  for (const h of [844, 640]) {
    await p.setViewportSize({ width: 390, height: h }); await p.waitForTimeout(300);
    const g = await p.evaluate(() => { _anima.snippets.forEach(s => { s.on = s.id === 'futa_small'; }); _animaFutaPop = 'futa_small'; _animaSyncPops();
      const e = document.querySelector('#anima-futapop'); if (!e) return null; const R = e.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pl-topbar-h')) || 50;
      const out = { top: Math.round(R.top), bar: top, scroll: e.scrollHeight > e.clientHeight, sh: e.scrollHeight };
      e.scrollTop = e.scrollHeight; out.lastVisible = (() => { const c = e.querySelector('.anima-fp-body button:last-child'); if (!c) return false; const r = c.getBoundingClientRect(); return r.bottom <= e.getBoundingClientRect().bottom + 1; })();
      _animaFutaPop = null; _animaSyncPops(); return out; });
    ck(`후타 팝업 머리가 상단바 아래에 있다(${h})`, g && g.top >= g.bar, JSON.stringify(g));
    ck(`넘치면 팝업 안에서 끝까지 스크롤된다(${h})`, g && g.lastVisible, JSON.stringify(g));
  }
  await p.setViewportSize({ width: 390, height: 844 });

  // ── ★★ 안 고르면 옛 코드와 글자까지 같다
  if (!OLD_HTML) ck('비교본(옛 index.html)을 꺼냈다', false, OLD_REV);
  else {
    const O = await open(b, sOld.address().port);
    const a = await gen(p, PLAIN), o = await gen(O.p, PLAIN);
    const diff = PLAIN.map((ids, i) => (a[i] && o[i] && a[i].prompt === o[i].prompt) ? null : { ids, now: a[i] && a[i].prompt, old: o[i] && o[i].prompt }).filter(Boolean);
    ck(`★★ 불알을 안 고르면 프롬프트가 옛 코드와 같다(${PLAIN.length}조합)`, diff.length === 0, JSON.stringify(diff[0]));
    ck('옛 판 콘솔 오류 없음', O.errs.length === 0, O.errs.join(' | '));
    await O.ctx.close();
  }

  // ── 크기 4 × 불알 4: testicles 크기 지시가 고른 것 하나뿐
  const sets = []; SIZES.forEach(sz => Object.keys(BALLS).forEach(bl => sets.push([sz, bl])));
  const r = await gen(p, sets);
  const bad = [];
  sets.forEach(([sz, bl], i) => {
    const pr = (r[i] && r[i].prompt) || '';
    const kinds = ['no testicles', 'small testicles', 'large testicles', 'huge testicles'].filter(k => new RegExp('\\b' + k + '\\b').test(pr));
    const want = BALLS[bl];
    const sizeOk = /futanari/.test(pr) && /penis/.test(pr);
    const noneOk = bl !== 'fball_none' || !/(^|, )testicles(,|$)/.test(pr);
    if (!(kinds.length === 1 && kinds[0] === want && sizeOk && noneOk)) bad.push({ sz, bl, kinds, pr });
  });
  ck('★ 크기 4 × 불알 4 — 불알 크기 지시가 고른 것 하나만 남는다', bad.length === 0, JSON.stringify(bad[0]));
  const small = r[sets.findIndex(s => s[0] === 'futa_small' && s[1] === 'fball_huge')];
  ck('소추 + 초대형: 자지는 작게 그대로 · 가중치 유지', small && /\(small penis:1\.3\)/.test(small.prompt) && /huge testicles:1\.4/.test(small.prompt), small && small.prompt);
  ck('캡션에 \'불알 초대형\'이 붙는다', small && /불알 초대형/.test(small.opt), small && small.opt);

  // ── 모순 제거 규칙과의 관계
  const [hs, sk, off] = await gen(p, [['futa_small', 'dsh_horse', 'fball_small'], ['futa_normal', 'skin_tan', 'fball_none'], ['fball_large']]);
  ck('말자지 + 소추 + 작게: small penis 는 빠지고 고른 small testicles 는 남는다', hs && !/small penis/.test(hs.prompt) && /small testicles/.test(hs.prompt), hs && hs.prompt);
  ck('피부색 + 없음: 못 박기 문구가 testicles 를 부르지 않는다', sk && /her shaft is exactly the same skin tone/.test(sk.prompt) && !/shaft and testicles/.test(sk.prompt), sk && sk.prompt);
  ck('후타를 끄면 불알 칩은 안 나간다', off && !/testicles/.test(off.prompt), off && off.prompt);

  // ── 새로고침해도 남는다 + 기존 사용자에게 주입
  await p.evaluate(() => { _anima.snippets.forEach(s => { s.on = (s.id === 'futa_large' || s.id === 'fball_huge'); }); _animaSave(); });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets && !!window._animaMounted, null, { timeout: 30000 });
  const kept = await p.evaluate(() => (_anima.snippets.find(s => s.id === 'fball_huge') || {}).on === true);
  ck('새로고침해도 고른 불알이 남는다', kept, '');
  const seed = await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('anima_settings_v1')); o.snippets = o.snippets.filter(s => s.group !== 'futaBalls'); return JSON.stringify(o); });
  const M = await open(b, sNew.address().port, seed);
  const mig = await M.p.evaluate(() => (_anima.snippets || []).filter(s => s.group === 'futaBalls').length);
  ck('불알 축이 없던 기존 저장분에도 4개가 주입된다', mig === 4, String(mig));
  await M.ctx.close();

  ck('콘솔 오류 없음', N.errs.length === 0, N.errs.join(' | '));
  await b.close(); sNew.close(); sOld.close();
  console.log(F ? `FAILED ${F}` : 'ALL PASS');
  process.exit(F ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
