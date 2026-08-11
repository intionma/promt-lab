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


  // ══ 픽셀로 직접 확인 — '메뉴 뒤가 비치는가' ════════════════════════════
  //  ★ 변수(--glass-bg)만 보면 '그 변수를 안 쓰는 요소'를 놓친다. 사용자가 신고한 건
  //    "메뉴 배경이 투명해서 창 뒷편이 보인다" 였으므로, 실제로 그려진 픽셀로 잰다.
  //    방법: 메뉴 뒤 화면을 통째로 새빨갛게 칠하고, 메뉴 여백 픽셀에 붉은 기가 도는지 본다.
  const zlib = require('zlib');
  const decodePng = (buf) => {   // 8비트 RGBA/RGB PNG 최소 디코더
    let i = 8, idat = [], w = 0, h = 0, ct = 6;
    while (i < buf.length) {
      const len = buf.readUInt32BE(i), typ = buf.toString('ascii', i + 4, i + 8);
      if (typ === 'IHDR') { w = buf.readUInt32BE(i + 8); h = buf.readUInt32BE(i + 12); ct = buf[i + 17]; }
      else if (typ === 'IDAT') idat.push(buf.subarray(i + 8, i + 8 + len));
      i += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = ct === 6 ? 4 : 3;
    const rows = []; let prev = Buffer.alloc(w * bpp), k = 0;
    for (let y = 0; y < h; y++) {
      const f = raw[k++]; const line = Buffer.from(raw.subarray(k, k + w * bpp)); k += w * bpp;
      for (let x = 0; x < line.length; x++) {
        const a = x >= bpp ? line[x - bpp] : 0, b2 = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
        if (f === 1) line[x] = (line[x] + a) & 255;
        else if (f === 2) line[x] = (line[x] + b2) & 255;
        else if (f === 3) line[x] = (line[x] + ((a + b2) >> 1)) & 255;
        else if (f === 4) { const p2 = a + b2 - c, pa = Math.abs(p2 - a), pb = Math.abs(p2 - b2), pc = Math.abs(p2 - c);
          line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b2 : c)) & 255; }
      }
      rows.push(line); prev = line;
    }
    return { w, h, bpp, rows };
  };
  const avgOf = (buf) => { const { w, h, bpp, rows } = decodePng(buf); let r = 0, g = 0, b2 = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { r += rows[y][x*bpp]; g += rows[y][x*bpp+1]; b2 += rows[y][x*bpp+2]; n++; }
    return [Math.round(r/n), Math.round(g/n), Math.round(b2/n)]; };

  const menuShot = async (w, theme, paintRed) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, hasTouch: w <= 1024, isMobile: w <= 1024 });
    const p = await ctx.newPage();
    await ctx.addInitScript((t) => { try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); localStorage.setItem('pro_prompt_theme', t); } catch (e) {} }, theme);
    await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
    await p.waitForTimeout(2200);
    const box = await p.evaluate((red) => {
      if (red) { const st = document.createElement('style');
        st.textContent = '#anima-root, #app-container, body { background:#ff0000 !important; } #anima-root *, #app-container * { background-image:none !important; }';
        document.head.appendChild(st); }
      toggleGtMenu();
      const r = document.getElementById('gt-menu').getBoundingClientRect();
      return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width) };
    }, paintRed);
    await p.waitForTimeout(500);
    const shot = await p.screenshot({ clip: { x: box.l + 6, y: box.t + 4, width: box.w - 12, height: 8 } });
    await ctx.close();
    return avgOf(shot);
  };

  for (const theme of ['dark', 'light']) {
    const n = await menuShot(390, theme, false), r = await menuShot(390, theme, true);
    const diff = Math.abs(n[0]-r[0]) + Math.abs(n[1]-r[1]) + Math.abs(n[2]-r[2]);
    ck(`★ 폰 ${theme} — 메뉴 뒤가 안 비친다 (픽셀 실측)`, diff <= 25,
       `평소 ${n} / 뒤가빨강 ${r} / 차이 ${diff} (${Math.round(diff/765*100)}% 비침)`);
  }

  await b.close(); srv.close();
  console.log(f ? `\n${f} FAILED` : '\nALL PASS');
  process.exit(f ? 1 : 0);
})();
