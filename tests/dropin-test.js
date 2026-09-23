// 끌어다 놓기로 원본 넣기 (v9.201.0 — 사용자 신고)
//  ★ "끌어다 놓으면 파랗게 강조는 되는데, 놓아도 이미지가 안 바뀐다."
//  ★ 원인: 종류(MIME)가 image/… 로 적힌 파일만 받고, 아니면 **아무 말 없이** 버렸다.
//    안드로이드에서 다른 앱이 끌어다 준 것은 종류가 비거나, 다른 칸(items)으로 오거나, 링크로 온다.
//  ⚠ 진짜 drop 이벤트를 **입력 칸에 dispatch** 한다 — 함수를 직접 부르면 '이벤트 동안에만 읽힌다'는
//    DataTransfer 제약을 못 재현한다(그 제약 때문에 꺼내는 순서가 중요하다).
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = 9189;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAJklEQVR42u3OMQEAAAgDoC251a3gL2SgeVsXAAAAAAAAAAAAAOBvA0d9AAGvXCJ9AAAAAElFTkSuQmCC', 'base64');
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/pic/cat.png') { r.writeHead(200, { 'content-type': 'image/png' }); return r.end(PNG); }
  const p = path.join('/home/user/promt-lab', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); } catch (e) {} });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets && !!window._animaMounted, null, { timeout: 30000 });
  await p.waitForTimeout(800);

  //  입력 칸에 진짜 drop 을 던진다. mode: 'file'(종류 지정) · 'uri'(링크만) · 'html'(<img> 조각만) · 'none'(글자만)
  const drop = (spec) => p.evaluate(async (o) => {
    _anima.img = null; try { _animaRenderInput(); } catch (e) {}
    document.querySelectorAll('#toast-container .toast').forEach(t => t.remove());
    const s = atob(o.b64); const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    const dt = new DataTransfer();
    if (o.mode === 'file') dt.items.add(new File([o.junk ? new Uint8Array([37, 80, 68, 70, 45, 49]) : a], o.name, o.type !== null ? { type: o.type } : undefined));
    if (o.mode === 'uri') dt.setData('text/uri-list', o.url);
    if (o.mode === 'html') dt.setData('text/html', '<p>x</p><img alt="" src="' + o.url + '">');
    if (o.mode === 'none') dt.setData('text/plain', '그냥 글자');
    const box = document.getElementById('anima-input');
    box.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    box.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 1800));
    return {
      img: !!(_anima.img && _anima.img.dataURL),
      head: _anima.img ? String(_anima.img.dataURL).slice(0, 22) : null,
      toasts: [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent),
    };
  }, { ...spec, b64: PNG.toString('base64') });

  const U = `http://127.0.0.1:${PORT}/pic/cat.png`;
  let r;
  r = await drop({ mode: 'file', name: 'pic.png', type: 'image/png' });
  ck('정상 image/png 파일이 들어간다', r.img, JSON.stringify(r));
  r = await drop({ mode: 'file', name: 'pic.jpg', type: '' });
  ck('★★ 종류가 빈 파일도 들어간다 (예전엔 조용히 버렸다)', r.img, JSON.stringify(r));
  ck('★ 그때 형식을 알아내 제대로 적는다 (data:image/png)', /^data:image\/png/.test(r.head || ''), String(r.head));
  r = await drop({ mode: 'file', name: 'blob', type: 'application/octet-stream' });
  ck('★★ octet-stream 파일도 들어간다', r.img, JSON.stringify(r));
  r = await drop({ mode: 'file', name: 'image', type: null });
  ck('★ 이름·종류 둘 다 없어도 들어간다', r.img, JSON.stringify(r));
  r = await drop({ mode: 'uri', url: U });
  ck('★★ 파일 대신 링크로 와도 들어간다', r.img, JSON.stringify(r));
  r = await drop({ mode: 'html', url: U });
  ck('★ <img> 조각으로 와도 들어간다', r.img, JSON.stringify(r));

  // ══ 못 받으면 **말해야 한다** ══════════════════════════════════
  r = await drop({ mode: 'file', name: 'doc', type: '', junk: true });
  ck('★ 그림이 아닌 파일은 넣지 않는다', r.img === false, JSON.stringify(r));
  ck('★★ 그리고 조용히 끝나지 않는다 (안내)', r.toasts.some(t => /그림을 못 찾았어요/.test(t)), JSON.stringify(r.toasts));
  r = await drop({ mode: 'none' });
  ck('★★ 글자만 오면 무엇이 왔는지 알려 준다', r.toasts.some(t => /받은 것:/.test(t) && /text\/plain/.test(t)), JSON.stringify(r.toasts));

  // ══ 파일 고르기(기존 경로)는 예전 그대로 ══════════════════════════
  const pick = await p.evaluate(async (b64) => {
    _anima.img = null;
    const s = atob(b64); const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([a], 'mine.png', { type: 'image/png' }));
    const inp = document.getElementById('anima-file'); inp.files = dt.files;
    inp.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 1500));
    return { img: !!(_anima.img && _anima.img.dataURL), name: _anima.img && _anima.img.name, 비웠나: inp.value === '' };
  }, PNG.toString('base64'));
  ck('파일 고르기는 예전처럼 들어간다', pick.img && pick.name === 'mine', JSON.stringify(pick));
  ck('파일 고르기 칸은 비워진다 (같은 파일 다시 고르기)', pick.비웠나, JSON.stringify(pick));

  // ══ 공유 실패 안내가 사실을 말한다 ══════════════════════════════
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p2 = await ctx2.newPage();
  await p2.goto(`http://127.0.0.1:${PORT}/index.html?shared=0&why=empty`, { waitUntil: 'load' });
  await p2.waitForFunction(() => typeof _anima !== 'undefined', null, { timeout: 30000 });
  await p2.waitForTimeout(2500);
  const t2 = await p2.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent));
  ck('★ 빈 공유 안내가 "다시 공유해 보세요" 라고 하지 않는다', !t2.some(t => /다시 공유해 보세요/.test(t)), JSON.stringify(t2));
  ck('★ 크롬 쪽 오류라는 사실과 지금 되는 길을 말한다', t2.some(t => /크롬/.test(t) && /클립보드/.test(t) && /끌어다/.test(t)), JSON.stringify(t2));
  await ctx2.close();

  ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
