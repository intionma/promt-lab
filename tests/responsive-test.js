// 전 해상도 · 전 화면 — 가로 넘침 없음 + 손가락으로 누를 수 있는 크기 (v9.171.0)
//  ★ 실측 결과 레이아웃 자체는 멀쩡했다(어느 폭에서도 가로 스크롤 0건). 진짜 문제는 터치 타깃이었다.
//  ★ 특히: 아이콘 폰트(Font Awesome)는 CDN 에서 렌더 비차단으로 싣는다. 오프라인·느린 망에서
//    그게 안 오면 <i> 가 0px 이 돼 상단바 버튼이 22x18 로 쪼그라들어 폰에서 못 누른다.
//    이 검사는 **아이콘 폰트를 일부러 막고** 돌아서 그 상황을 그대로 재현한다.
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

const WIDTHS = [320, 360, 390, 412, 480, 768, 850, 884, 1024, 1280, 1920];   // 850·884 = 폴더블 펼친 폭(v9.174.0에서 비어 있던 구간)
const LAYOUTS = ['anima', 'classic', 'studio', 'img2img', 'inpaint'];

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  for (const layout of LAYOUTS) {
    for (const w of WIDTHS) {
      const touch = w <= 1024;
      const ctx = await b.newContext({ viewport: { width: w, height: 844 }, hasTouch: touch, isMobile: touch });
      const p = await ctx.newPage();
      //  ★ 아이콘 폰트가 안 오는 상황(오프라인·느린 망)을 그대로 만든다
      await p.route('**/font-awesome/**', r => r.abort());
      await p.route('**/fonts.googleapis.com/**', r => r.abort());
      await ctx.addInitScript((l) => {
        try { localStorage.setItem('pl_layout', l); localStorage.setItem('adult_optin_v1', '1'); } catch (e) {}
      }, layout);
      await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
      await p.waitForTimeout(2400);
      const r = await p.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        //  잘려 나가는 조상(스와이프 트랙 등)이 있으면 화면 밖이어도 정상이다
        const clipped = (e) => {
          let q = e.parentElement;
          while (q && q !== document.documentElement) {
            const s = getComputedStyle(q);
            if (s.overflow !== 'visible' || s.overflowX !== 'visible') return true;
            if (q.id === 'mobile-panel-track') return true;
            q = q.parentElement;
          }
          return false;
        };
        const over = [];
        document.querySelectorAll('body *').forEach(e => {
          const s = getComputedStyle(e);
          if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return;
          const rr = e.getBoundingClientRect();
          if (!rr.width || !rr.height) return;
          if ((rr.right > vw + 1.5 || rr.left < -1.5) && !clipped(e)) {
            over.push((e.id ? '#' + e.id : (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : e.tagName)) + `[${Math.round(rr.left)}~${Math.round(rr.right)}]`);
          }
        });
        //  상단바는 어느 화면에서도 보이고, 그 버튼은 언제나 누를 수 있어야 한다
        const btn = (sel) => { const e = document.querySelector(sel); if (!e) return null; const rr = e.getBoundingClientRect(); return { w: Math.round(rr.width), h: Math.round(rr.height) }; };
        return {
          hs: document.documentElement.scrollWidth > vw + 1,
          over: [...new Set(over)].slice(0, 5),
          theme: btn('#btn-theme-toggle'), menu: btn('#gt-menu-btn'),
          topbarH: Math.round((document.querySelector('#global-topbar') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height),
        };
      });
      const tag = `${layout} ${w}px`;
      ck(`[${tag}] 가로 스크롤이 없다`, !r.hs, 'scrollWidth 초과');
      ck(`[${tag}] 화면 밖으로 삐져나온 요소가 없다`, r.over.length === 0, r.over.join(' | '));
      //  ★ 아이콘 폰트가 없는 상태에서도 최소 크기가 남아 있어야 한다
      const min = touch ? 38 : 28;
      ck(`[${tag}] ★ 테마 버튼이 아이콘 없이도 누를 수 있다 (≥${min}px)`,
         !!r.theme && r.theme.w >= min && r.theme.h >= min, JSON.stringify(r.theme));
      ck(`[${tag}] ★ 메뉴 버튼이 아이콘 없이도 누를 수 있다 (≥${min}px)`,
         !!r.menu && r.menu.w >= min && r.menu.h >= min, JSON.stringify(r.menu));
      ck(`[${tag}] 상단바 높이가 50px 그대로`, r.topbarH === 50, String(r.topbarH));
      await ctx.close();
    }
  }

  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
