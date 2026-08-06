// PC 종료 도우미 진단 검사 (v9.166.0)
//  ★ 재현하려는 사고: 도우미가 아예 없는데 ComfyUI 주소를 넣어 두면
//    "✅ 연결됨 (구버전 도우미)" 라고 떴다 — OPTIONS 에 200 주는 서버면 뭐든 그렇게 판정했다.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');

// 앱을 내려 주는 서버
const app = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join('/home/user/promt-lab', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(p).pipe(r);
});
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': '*' };
// 진짜 종료 도우미 v2 흉내
const helper = http.createServer((q, r) => {
  const p = q.url.split('?')[0];
  if (q.method === 'OPTIONS') { r.writeHead(204, CORS); return r.end(); }
  if (q.method === 'GET' && p === '/ping') { r.writeHead(200, CORS); return r.end('promptlab-shutdown v2'); }
  r.writeHead(404, CORS); r.end('not found');
});
// ComfyUI 흉내 — /ping 은 404, OPTIONS 에는 200. 예전 코드가 이걸 '구버전 도우미'로 오진했다.
let comfyHits = 0;
const comfy = http.createServer((q, r) => {
  comfyHits++;
  if (q.method === 'OPTIONS') { r.writeHead(200, CORS); return r.end(); }
  r.writeHead(404, CORS); r.end('404: Not Found');
});
// /ping 에 200 을 주지만 도우미는 아닌 서버(웹 UI 등)
const stranger = http.createServer((q, r) => {
  if (q.method === 'OPTIONS') { r.writeHead(200, CORS); return r.end(); }
  r.writeHead(200, CORS); r.end('<html>ComfyUI</html>');
});

let f = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) f++; };
const listen = (s) => new Promise(r => s.listen(0, () => r(s.address().port)));

(async () => {
  const [appP, helperP, comfyP, strangerP] = await Promise.all([listen(app), listen(helper), listen(comfy), listen(stranger)]);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.addInitScript(() => { try { localStorage.setItem('pl_layout', 'classic'); } catch (e) {} });
  await p.goto('http://127.0.0.1:' + appP + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { window.showToast = () => {}; openShutdownModal(); });

  const check = async (url) => p.evaluate(async (u) => {
    document.getElementById('shutdown-url').value = u;
    document.getElementById('shutdown-token').value = 'tok123';
    await shutdownCheckConnection();
    await new Promise(r => setTimeout(r, 300));
    return { txt: document.getElementById('shutdown-status').textContent,
             url: document.getElementById('shutdown-url').value };
  }, url);

  // ① 진짜 도우미
  let r = await check('http://127.0.0.1:' + helperP);
  ck('진짜 도우미는 확인된다', /연결됨 — 종료 도우미 확인/.test(r.txt), r.txt);

  // ② ★ 회귀: ComfyUI 주소 → 예전엔 "구버전 도우미"라고 떴다
  comfyHits = 0;
  r = await check('http://127.0.0.1:' + comfyP);
  ck('★ ComfyUI 주소를 "구버전 도우미"로 오진하지 않는다', !/구버전/.test(r.txt), r.txt);
  ck('★ 도우미를 못 찾았다고 분명히 말한다', /못 찾았어요|다른 서버/.test(r.txt), r.txt);
  ck('★ 실패 이유(HTTP 상태 등)를 화면에 보여준다', /404|연결 안 됨|시간 초과/.test(r.txt), r.txt);
  ck('★ "실행" 해야 한다고 안내한다 (파일만 받으면 안 됨)', /실행/.test(r.txt), r.txt);

  // ③ /ping 에 200 을 주지만 도우미가 아닌 서버 → '다른 서버'라고 말해야
  r = await check('http://127.0.0.1:' + strangerP);
  ck('★ 도우미가 아닌 서버는 "다른 서버"라고 알려준다', /다른 서버/.test(r.txt) && !/구버전/.test(r.txt), r.txt);
  ck('무엇이 응답했는지 본문을 보여준다', /ComfyUI/.test(r.txt), r.txt);

  // ④ 주소가 틀렸을 때 같은 호스트의 다른 포트를 대신 찾아 준다
  //    (후보는 8443·8189 고정이라 임의 포트로는 못 찾는다 → '찾기를 시도했는지'만 본다)
  const cand = await p.evaluate(() => ({
    tunnel: _shutdownCandidates('https://uver48-pc.tailda88a6.ts.net'),
    local: _shutdownCandidates('http://192.168.0.5:9999'),
  }));
  ck('★ 터널 주소의 후보는 :8443 이 먼저다', cand.tunnel[0] === 'https://uver48-pc.tailda88a6.ts.net:8443', JSON.stringify(cand.tunnel));
  ck('사설망 주소의 후보는 :8189', cand.local.join(',') === 'http://192.168.0.5:8189', JSON.stringify(cand.local));

  // ④-2 실제로 대신 찾아 주는지 — 도우미를 8189 에 띄우고 '엉뚱한 포트'를 넣어 본다
  //     (8189 가 이미 쓰이는 환경이면 건너뛴다)
  const helper8189 = http.createServer((q, r) => {
    const pp = q.url.split('?')[0];
    if (q.method === 'OPTIONS') { r.writeHead(204, CORS); return r.end(); }
    if (q.method === 'GET' && pp === '/ping') { r.writeHead(200, CORS); return r.end('promptlab-shutdown v2'); }
    r.writeHead(404, CORS); r.end('nf');
  });
  const bound8189 = await new Promise(res => {
    helper8189.once('error', () => res(false));
    helper8189.listen(8189, '127.0.0.1', () => res(true));
  });
  if (bound8189) {
    const rr = await check('http://127.0.0.1:' + comfyP);   // 도우미가 아닌 포트를 넣는다
    ck('★ 주소가 틀리면 같은 PC의 8189 를 찾아 자동으로 고쳐 준다',
       /찾았어요/.test(rr.txt) && rr.url === 'http://127.0.0.1:8189', rr.txt + ' | ' + rr.url);
    helper8189.close();
  } else {
    console.log('SKIP - 자동 찾기 (8189 포트가 이미 사용 중)');
  }

  // ⑤ 기본 주소 추정 — 터널이면 8443, 로컬이면 8189
  const def = await p.evaluate(() => {
    const set = (u) => localStorage.setItem('comfy_settings_v1', JSON.stringify({ url: u }));
    set('https://uver48-pc.tailda88a6.ts.net'); const a = _comfyShutdownDefault();
    set('http://127.0.0.1:8188'); const b2 = _comfyShutdownDefault();
    set('http://192.168.0.5:8188'); const c = _comfyShutdownDefault();
    return { tunnel: a, local: b2, lan: c };
  });
  ck('★ 터널 ComfyUI 주소면 기본값이 :8443', def.tunnel === 'https://uver48-pc.tailda88a6.ts.net:8443', JSON.stringify(def));
  ck('로컬이면 :8189', def.local === 'http://127.0.0.1:8189', JSON.stringify(def));
  ck('사설망이면 :8189', def.lan === 'http://192.168.0.5:8189', JSON.stringify(def));

  // ⑥ 혼합 콘텐츠 판정 (https 앱 + http 주소는 브라우저가 막는다)
  const mix = await p.evaluate(() => {
    const orig = location.protocol;
    const test = (loc, url) => {
      // location.protocol 을 못 바꾸므로 함수를 직접 검증 — 지금 페이지는 http 라 항상 '' 이어야 한다
      return _shutdownMixedWhy(url);
    };
    return { httpPage: test(orig, 'http://100.64.0.1:8189') };
  });
  ck('http 로 연 페이지에서는 혼합 콘텐츠 경고를 내지 않는다', mix.httpPage === '', mix.httpPage);

  // ⑦ 도우미 스크립트에는 /ping 서명이 들어 있어야 한다(진단이 이걸 본다)
  const sc = await p.evaluate(() => _shutdownScriptText());
  ck('★ 받는 스크립트가 /ping 에 서명을 돌려준다', /promptlab-shutdown v2/.test(sc) && /'\/ping'/.test(sc), sc.slice(0, 80));
  ck('토큰이 스크립트에 박혀 나간다', /TOKEN = "tok123"/.test(sc), (sc.match(/TOKEN = .*/) || [''])[0]);

  ck('콘솔 오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));

  await ctx.close(); await b.close();
  [app, helper, comfy, stranger].forEach(s => s.close());
  console.log(f ? `\n${f} FAILED` : '\nALL PASS');
  process.exit(f ? 1 : 0);
})();
