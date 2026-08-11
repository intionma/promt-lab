// 테마 변수가 <html>·<body> 에서 어긋나지 않는지 (v9.168.1)
//  ★ 재현하려는 사고: v9.165.2에서 다크 팔레트 선택자를 ':root' → ':root, [data-theme="dark"]'
//    로 넓혔더니, 모바일 전용 덮어쓰기(`:root { --glass-bg: 불투명 }`)를 <body> 선언이 이겨서
//    폰 다크 모드에서 메뉴·모달이 통째로 비쳐 보였다("창 뒷편이 그대로 보임").
//  ★ 불변식: data-theme 은 <html>·<body> 두 곳에 걸리므로, 어떤 폭·어떤 테마에서도
//    두 곳이 '같은 값'이어야 한다. 하나라도 어긋나면 어딘가의 미디어 쿼리가 :root 에만 적혀 있다.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join('/home/user/promt-lab', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(p).pipe(r);
});
let f = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) f++; };
// 'rgba(r,g,b,a)' 의 a
const alpha = (v) => { const m = /rgba?\(([^)]+)\)/.exec(v || ''); if (!m) return 1; const p = m[1].split(',').map(s => s.trim()); return p.length > 3 ? parseFloat(p[3]) : 1; };

//  테마를 타는 변수 전부 — 하나라도 :root 에만 덮어쓰이면 여기서 잡힌다
const VARS = ['--glass-bg', '--glass-border', '--glass-highlight', '--glass-shadow', '--glass-tint',
  '--bg-base', '--bg-panel', '--bg-surface', '--border-dim', '--text-main', '--text-dim',
  '--header-bg', '--chip-bg', '--input-bg', '--folder-bg', '--folder-hover', '--overlay-bg', '--shadow-color'];

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  const read = async (w, theme, layout) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await ctx.addInitScript((a) => {
      try { localStorage.setItem('pl_layout', a.l); localStorage.setItem('pro_prompt_theme', a.t); } catch (e) {}
    }, { t: theme, l: layout || 'classic' });
    await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
    await p.waitForTimeout(1800);
    const r = await p.evaluate((vars) => {
      const h = getComputedStyle(document.documentElement), b2 = getComputedStyle(document.body);
      const out = { html: {}, body: {}, themeH: document.documentElement.getAttribute('data-theme'), themeB: document.body.getAttribute('data-theme') };
      vars.forEach(v => { out.html[v] = h.getPropertyValue(v).trim(); out.body[v] = b2.getPropertyValue(v).trim(); });
      return out;
    }, VARS);
    await ctx.close();
    return { ...r, errs };
  };

  for (const w of [390, 768, 1024, 1025, 1280]) {
    for (const theme of ['dark', 'light']) {
      const r = await read(w, theme);
      const bad = VARS.filter(v => r.html[v] !== r.body[v]);
      ck(`★ ${w}px ${theme} — <html>·<body> 테마 변수가 일치한다`, bad.length === 0,
         bad.map(v => `${v}: html=${r.html[v]} / body=${r.body[v]}`).join(' | '));
      ck(`   ${w}px ${theme} — data-theme 이 양쪽 다 ${theme}`, r.themeH === theme && r.themeB === theme, r.themeH + '/' + r.themeB);
      // 모바일(≤1024px)은 backdrop-filter 를 끄므로 유리 배경이 '거의 불투명'이어야 읽힌다
      if (w <= 1024) {
        const a = alpha(r.body['--glass-bg']);
        ck(`★ ${w}px ${theme} — 메뉴·모달 배경이 불투명 (뒤가 안 비침)`, a >= 0.9, `alpha=${a} (${r.body['--glass-bg']})`);
      }
      ck(`   ${w}px ${theme} — 콘솔 오류 없음`, r.errs.length === 0, r.errs.slice(0, 2).join(' | '));
    }
  }

  // Anima 레이아웃에서도 같은지 (상단바·전역 모달을 공유한다)
  for (const theme of ['dark', 'light']) {
    const r = await read(390, theme, 'anima');
    const bad = VARS.filter(v => r.html[v] !== r.body[v]);
    ck(`★ Anima 390px ${theme} — 테마 변수 일치`, bad.length === 0, bad.join(','));
    ck(`★ Anima 390px ${theme} — 메뉴 배경 불투명`, alpha(r.body['--glass-bg']) >= 0.9, r.body['--glass-bg']);
  }

  await b.close(); srv.close();
  console.log(f ? `\n${f} FAILED` : '\nALL PASS');
  process.exit(f ? 1 : 0);
})();
