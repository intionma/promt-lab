// 공유 이미지가 안 들어가던 것 (v9.200.0 — 사용자 신고 "앱은 열리는데 이미지만 없음")
//  ★ 원인: sw.js 가 **type 이 image/ 로 시작하는 파일만** 받았다. 삼성 갤러리 등은
//    MIME 을 비우거나 application/octet-stream 으로 보내는 일이 있는데, 그러면 파일을
//    통째로 버리고 `?shared=1` 도 없이 앱만 열었다 — 사용자에게는 "그냥 안 들어감" 이다.
//  ⚠ 이 검사는 **진짜 서비스워커에 진짜 multipart POST** 를 던진다. 캐시에 미리 심어 두는
//    sharequeue-test 로는 이 구간이 통째로 안 지나간다(그래서 45개 검사 전부가 통과했다).
//  ⚠ 서비스워커는 https 또는 localhost 에서만 돈다 → 127.0.0.1 로 띄운다.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = 9188;
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join('/home/user/promt-lab', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  const ct = /\.js$/.test(p) ? 'application/javascript'
    : /\.(json|webmanifest)$/.test(p) ? 'application/json'
    : /\.png$/.test(p) ? 'image/png' : 'text/html';
  r.writeHead(200, { 'content-type': ct, 'service-worker-allowed': '/' });
  fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };
const B64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAJklEQVR42u3OMQEAAAgDoC251a3gL2SgeVsXAAAAAAAAAAAAAOBvA0d9AAGvXCJ9AAAAAElFTkSuQmCC';

//  실제 공유 한 번 = POST → 리다이렉트 따라가기 → 그 주소로 진입
async function shareOnce(b, spec) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 30000 });
  await p.evaluate(() => navigator.serviceWorker.ready);
  const red = await p.evaluate(async (o) => {
    const s = atob(o.b64); const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    const fd = new FormData();
    if (o.field) fd.append(o.field, new File([a], o.name || '', o.type !== null ? { type: o.type } : undefined));
    else { fd.append('title', '사진'); fd.append('text', '보세요'); }
    const r = await fetch(`http://127.0.0.1:${o.port}/share-target`, { method: 'POST', body: fd, redirect: 'follow' });
    return r.url;
  }, { ...spec, port: PORT, b64: B64 });
  await p.goto(red, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined', null, { timeout: 30000 });
  await p.waitForTimeout(3500);
  //  ⚠ _anima 는 최상위 let 이라 **window 에 없다** — 맨이름으로 읽어야 한다.
  //    window._anima 로 쓰면 영원히 false 라 '멀쩡한데 깨졌다'로 오진한다(실제로 그랬다).
  const st = await p.evaluate(() => ({
    img: !!(_anima && _anima.img && _anima.img.dataURL),
    name: (_anima && _anima.img && _anima.img.name) || null,
    layout: document.body.getAttribute('data-layout'),
    toasts: [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent),
    addr: location.search,
  }));
  await ctx.close();
  return { red, ...st, errs };
}

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ══ 파일이 어떤 모습으로 와도 들어가야 한다 ══════════════════════
  const CASES = [
    ['정상 image/png',            { field: 'image', name: 'pic.png', type: 'image/png' }],
    ['★ MIME 이 비어 있음',        { field: 'image', name: 'pic.jpg', type: '' }],
    ['★ application/octet-stream', { field: 'image', name: 'pic.jpg', type: 'application/octet-stream' }],
    ['★ 타입·파일명 둘 다 없음',    { field: 'image', name: '', type: '' }],
    ['필드 이름이 files',          { field: 'files', name: 'pic.png', type: 'image/png' }],
    ['모르는 필드 이름',            { field: 'attachment', name: 'p.png', type: 'image/png' }],
  ];
  for (const [label, spec] of CASES) {
    const r = await shareOnce(b, spec);
    ck(`공유가 들어간다 — ${label}`, r.img === true, `주소=${r.red.replace(/^[^?]*/, '')} 오류=${r.errs.slice(0, 1)}`);
    if (label === '정상 image/png') {
      ck('공유는 Anima 로 연다', r.layout === 'anima', String(r.layout));
      ck('주소에서 표식을 지운다', !/shared=/.test(r.addr), r.addr);
    }
  }

  // ══ 파일이 없으면 **왜 안 됐는지 말해야 한다** ════════════════════
  //   예전엔 아무 말 없이 그냥 앱만 열려서 원인을 영영 알 수 없었다.
  {
    const r = await shareOnce(b, { field: null });
    ck('★ 파일이 없으면 이미지는 안 들어간다', r.img === false, String(r.name));
    ck('★★ 왜 안 됐는지 주소에 실어 보낸다', /shared=0/.test(r.red) && /why=nofile/.test(r.red), r.red.replace(/^[^?]*/, ''));
    ck('★★ 무엇이 왔는지도 함께 싣는다 (다음에 원인을 찾으려면 이게 있어야 한다)', /info=/.test(r.red), r.red.replace(/^[^?]*/, ''));
    ck('★★ 사용자에게 안내가 뜬다 (조용히 실패하지 않는다)', r.toasts.some(t => /공유|이미지/.test(t)), JSON.stringify(r.toasts).slice(0, 160));
    ck('★ 실패해도 Anima 로 연다 (안내를 볼 자리가 같아야 한다)', r.layout === 'anima', String(r.layout));
    ck('★ 실패 표식도 주소에서 지운다', !/shared=|why=|info=/.test(r.addr), r.addr);
    ck('오류 없음', r.errs.length === 0, r.errs.slice(0, 2).join(' | '));
  }

  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
