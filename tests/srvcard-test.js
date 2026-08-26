// ComfyUI 연결 카드는 '한 번 넣으면 끝'인데 맨 위 자리를 차지했다 (v9.179.0 — 사용자 지적)
//  ★ 주소가 저장돼 있으면 카드를 통째로 「고급 설정」 안으로 옮겨 상단에서 없앤다(130 → 0px).
//  ★ 주소가 없으면(첫 설치) 맨 위에 그대로 남긴다 — 안 그러면 주소 넣을 곳을 못 찾아 앱을 못 쓴다.
//  ★ #anima-adv 는 _animaRenderAdv() 가 innerHTML 로 다시 그린다 → 카드를 그 '안'에 넣으면
//    다시 그릴 때 사라진다. 그래서 토글의 '형제'로 둔다. 이 검사가 그걸 지킨다.
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
  const c = document.querySelector('.anima-srv-card');
  const r = c ? c.getBoundingClientRect() : null;
  const adv = document.getElementById('anima-adv');
  const first = document.querySelector('.anima-col-l > .anima-card');
  return {
    있음: !!c, 고급안: !!(c && c.classList.contains('in-adv')),
    높이: r ? Math.round(r.height) : 0,
    보임: !!(r && r.height > 0),
    주소칸: !!document.getElementById('anima-url'),
    주소값: (document.getElementById('anima-url') || {}).value || '',
    연결확인: !!document.getElementById('anima-ping'),
    고급열림: !!(adv && adv.style.display !== 'none'),
    //  왼쪽 칸의 첫 카드가 무엇인가 — 연결 카드가 치워졌으면 '이미지 넣기'가 와야 한다
    첫카드: first ? (first.textContent || '').trim().slice(0, 12) : null,
  };
});
const openAdv = (p) => p.evaluate(() => { document.getElementById('anima-adv-toggle').click(); });

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const open = async (url) => {
    const ctx = await b.newContext({ viewport: { width: 884, height: 1104 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await ctx.addInitScript((u) => {
      try {
        localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1');
        if (u) { const s = JSON.parse(localStorage.getItem('comfy_settings_v1') || '{}'); s.url = u; localStorage.setItem('comfy_settings_v1', JSON.stringify(s)); }
      } catch (e) {}
    }, url);
    await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
    await p.waitForTimeout(1500);
    return { ctx, p };
  };

  // ── ① 첫 설치 (주소 없음) — 맨 위에 그대로 있어야 한다 ─────────────
  {
    const { ctx, p } = await open(''); const errs = []; p.on('pageerror', e => errs.push(e.message));
    const a = await look(p);
    ck('★ 첫 설치 — 연결 카드가 맨 위에 보인다 (없으면 주소를 못 넣는다)', a.보임 && !a.고급안, JSON.stringify(a));
    ck('첫 설치 — 주소칸과 [연결 확인]이 바로 있다', a.주소칸 && a.연결확인);
    ck('첫 설치 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ── ② 실사용 (주소 있음) — 상단에서 사라지고 고급 설정으로 ─────────
  {
    const { ctx, p } = await open('https://example.ts.net'); const errs = []; p.on('pageerror', e => errs.push(e.message));
    const a = await look(p);
    ck('★ 주소가 있으면 상단에서 사라진다 (자리를 안 차지한다)', a.높이 === 0 && !a.보임, `높이 ${a.높이}px`);
    ck('★ 카드 자체는 남아 있고 「고급 설정」 안으로 옮겨져 있다', a.있음 && a.고급안, JSON.stringify(a));
    ck('★ 왼쪽 칸 첫 카드가 「이미지 넣기」가 된다', /이미지 넣기/.test(a.첫카드 || ''), a.첫카드);
    ck('주소는 그대로 들어 있다', a.주소값 === 'https://example.ts.net', a.주소값);

    // 고급 설정을 펼치면 나와야 한다
    await openAdv(p); await p.waitForTimeout(500);
    const o = await look(p);
    ck('★ 「고급 설정」을 펼치면 연결 카드가 나온다', o.보임 && o.높이 > 0 && o.고급열림, JSON.stringify(o));
    ck('펼친 상태에서 주소칸·[연결 확인]이 쓸 수 있다', o.주소칸 && o.연결확인);

    // ★ 고급 설정을 다시 그려도 카드가 사라지면 안 된다 (innerHTML 로 갈아끼우는 영역이다)
    await p.evaluate(() => { _animaRenderAdv(); });
    await p.waitForTimeout(400);
    const r = await look(p);
    ck('★ 고급 설정을 다시 그려도 연결 카드가 살아남는다 (안이 아니라 형제로 뒀다)',
       r.있음 && r.보임 && r.주소칸, JSON.stringify(r));

    // 접었다 폈다
    await openAdv(p); await p.waitForTimeout(400);
    const c = await look(p);
    ck('「고급 설정」을 접으면 연결 카드도 같이 접힌다', !c.보임 && !c.고급열림, JSON.stringify(c));
    ck('실사용 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
