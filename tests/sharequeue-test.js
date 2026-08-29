// 짧은 시간에 여러 장을 공유하면 한 장이 씹히던 것 (v9.183.0 — 사용자 신고)
//  ★ 원인 ①: 서비스워커가 공유를 **항상 같은 칸**(./__shared_image__)에 덮어썼다.
//    A 저장 → 문서 A 뜨는 중 → B 저장(A를 덮어씀) → 문서 A 가 뒤늦게 읽고 지움
//    → 문서 B 는 빈 손. **한 장이 통째로 사라진다.**
//  ★ 원인 ②: 대기열이 차 있으면 자동 생성을 건너뛰는 가드가 있어, 두 번째부터는 넣기만 하고 안 뽑혔다.
//  → 공유마다 자기 칸을 쓰고, 앱이 뜰 때 밀린 것을 **전부** 오래된 순서대로 처리한다.
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

//  sw.js 가 실제로 쓰는 칸 이름 규칙을 그대로 검사한다 (파일에서 읽어 확인)
const SW = fs.readFileSync('/home/user/promt-lab/sw.js', 'utf8');

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.addInitScript(() => { try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); } catch (e) {} });

  // ── ① 서비스워커가 '한 칸 덮어쓰기'를 안 한다 ────────────────────────
  ck('★ 공유마다 고유한 칸에 저장한다 (덮어쓰기 없음)',
     /SHARE_PREFIX/.test(SW) && /_shareSlot\(\)/.test(SW) && !/c\.put\(new Request\(SHARE_KEY/.test(SW),
     'sw.js 가 아직 SHARE_KEY 한 칸에 덮어쓴다');

  await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
  await p.waitForTimeout(1200);

  // ── ② 밀린 공유 3장을 캐시에 심고 공유 진입 ─────────────────────────
  //   (서비스워커가 세 번 저장해 둔 상태를 그대로 만든다)
  await p.evaluate(async () => {
    const svg = (t, c) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="80"><rect width="100%" height="100%" fill="${c}"/><text x="6" y="44" font-size="20" fill="#fff">${t}</text></svg>`);
    const c = await caches.open('pl-share-v1');
    const put = async (slot, t, col, name) => {
      const blob = await (await fetch(svg(t, col))).blob();
      await c.put(new Request(slot, { method: 'GET' }),
                  new Response(blob, { headers: { 'Content-Type': 'image/svg+xml', 'X-Share-Name': encodeURIComponent(name) } }));
    };
    await put('./__shared_image__/1000-aaa', '1', '#c00', 'first.png');
    await put('./__shared_image__/2000-bbb', '2', '#0c0', 'second.png');
    await put('./__shared_image__/3000-ccc', '3', '#00c', 'third.png');
  });
  const before = await p.evaluate(async () => (await (await caches.open('pl-share-v1')).keys()).length);
  ck('밀린 공유 3장을 심었다 (사전 조건)', before === 3, String(before));

  //  넣는 것만 확인한다 — 실제 생성은 ComfyUI 가 필요하므로 호출 횟수로 센다
  await p.addInitScript(() => {
    window.__set = []; window.__gen = 0;
    const iv = setInterval(() => {
      if (typeof _animaSetImage !== 'function') return;
      clearInterval(iv);
      const rs = _animaSetImage;
      window._animaSetImage = _animaSetImage = function (u, n) { window.__set.push(String(n || '')); return rs.apply(this, arguments); };
      const rg = window._animaShareAutoGen;
      if (typeof rg === 'function') window._animaShareAutoGen = function () { window.__gen++; return Promise.resolve(true); };
    }, 30);
  });
  await p.goto('http://127.0.0.1:' + port + '/index.html?shared=1', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
  await p.waitForTimeout(3500);

  const got = await p.evaluate(() => ({ set: window.__set || [], gen: window.__gen || 0 }));
  ck('★ 밀린 3장을 하나도 안 빠뜨리고 넣는다 (예전엔 1장만 살아남았다)',
     got.set.length === 3, `${got.set.length}장 · ${JSON.stringify(got.set)}`);
  ck('★ 오래된 순서대로 처리한다', JSON.stringify(got.set) === JSON.stringify(['first', 'second', 'third']), JSON.stringify(got.set));

  const left = await p.evaluate(async () => (await (await caches.open('pl-share-v1')).keys()).length);
  ck('★ 처리한 칸은 비운다 (다음 공유와 안 섞이게)', left === 0, `${left}칸 남음`);

  // ── ③ 대기열 가드 — 두 번째부터는 건너뛰지 않는다 ────────────────────
  const guard = fs.readFileSync('/home/user/promt-lab/index.html', 'utf8');
  ck('★ 연속 공유는 대기열이 있어도 줄을 세운다 (가드에 예외가 있다)',
     /_animaShareAutoGen\(queueOk\)/.test(guard) && /_animaJobs\.length && !queueOk/.test(guard),
     '가드가 아직 무조건 건너뛴다');
  ck('★ 두 번째부터 그 예외로 부른다', /_animaShareAutoGen\(i > 0\)/.test(guard), '순차 처리에서 예외를 안 넘긴다');

  ck('오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
