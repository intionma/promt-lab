// 📱 안드로이드 앱(껍데기) ↔ 웹앱 연결 (v9.207.0)
//  앱(android/)은 window.PLNative 를 넣어 준다. 여기서는 그 PLNative 를 흉내 내서 웹앱 쪽이 제대로 받는지 본다.
//  (앱 자체는 이 컴퓨터에서 못 돌린다 — 가상 안드로이드에 필요한 하드웨어 가속이 없다. 앱은 빌드·서명·매니페스트까지만 확인)
//  ★ 지키는 것:
//   · 공유로 앱이 열리면(?shared=1) 사진이 기존 공유와 **같은 문**(_animaTakeBlob)으로 들어간다 — 클래식에 있었어도 Anima 로
//   · 이미 떠 있을 때 공유가 또 오면 **새로고침 없이** 들어간다(_plNativeShareArrived)
//   · 사진이 아닌 것(글자·링크)·못 읽은 것은 조용히 버리지 않고 이유를 말한다
//   · 앱이 아직 읽는 중이면(pending) 기다렸다 꺼낸다
//   · 내려받기(<a download>, blob 주소)는 앱의 saveFile 로 — a.click() 직후 주소를 지워도 받는다
//   · 화면 켜 두기·상태 표시줄 색이 앱에 전해진다
//   · 앱 밖(보통 브라우저)에서는 아무것도 바뀌지 않는다(a.click 원본 그대로)
//   · 서비스워커가 .apk 내려받기를 캐시에 담지 않는다(새 판을 받아도 옛 판이 나오면 안 된다)
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join(ROOT, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : /\.js$/.test(p) ? 'text/javascript' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };
//  1x1 빨강 · 초록 PNG
const RED = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const GRN = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

//  PLNative 흉내 — 앱의 Bridge 와 같은 모양(next/pending/saveFile/keepScreenOn/setTheme/version)
const MOCK = (init) => {
  const st = window.__pln = { q: (init && init.q) || [], reading: (init && init.reading) || 0, saved: [], screen: [], theme: [] };
  window.PLNative = {
    pending: () => st.q.length + st.reading,
    next: () => { const o = st.q.shift(); return o ? JSON.stringify(o) : ''; },
    version: () => '1.0',
    keepScreenOn: (on) => { st.screen.push(!!on); },
    setTheme: (m) => { st.theme.push(String(m)); },
    saveFile: (name, mime, b64) => { st.saved.push({ name, mime, b64 }); return 'ok:Download/PromptLab/' + name; },
    openExternal: () => {},
  };
};

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port, BASE = `http://127.0.0.1:${port}/index.html`;
  const b = await chromium.launch({ executablePath: process.env.PL_CHROMIUM || '/opt/pw-browsers/chromium' });
  const errs = [];
  const mk = async (opts) => {
    const ctx = await b.newContext(Object.assign({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, opts.ctx || {}));
    await ctx.addInitScript((layout) => {
      try { if (!sessionStorage.getItem('__s')) { sessionStorage.setItem('__s', '1'); localStorage.setItem('pl_layout', layout); localStorage.setItem('adult_optin_v1', '1'); } } catch (e) {}
    }, opts.layout || 'anima');
    if (opts.native) await ctx.addInitScript(MOCK, opts.native);
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    return { ctx, p };
  };
  const waitMount = (p) => p.waitForFunction(() => typeof _anima !== 'undefined' && !!window._animaMounted, null, { timeout: 30000 });

  // ── ① 공유로 앱이 열림(?shared=1) — 저장된 화면이 클래식이어도 Anima 로, 사진은 같은 문으로 ──
  {
    const { ctx, p } = await mk({ layout: 'classic', native: { q: [{ name: 'IMG_0001.png', mime: 'image/png', size: 70, b64: RED }] } });
    await p.goto(BASE + '?shared=1', { waitUntil: 'load' });
    await waitMount(p);
    await p.waitForFunction(() => !!(_anima.img && _anima.img.dataURL), null, { timeout: 10000 }).catch(() => {});
    const r = await p.evaluate(() => ({ lay: document.body.getAttribute('data-layout'), img: !!(_anima.img && _anima.img.dataURL), name: _anima.img && _anima.img.name, left: window.__pln.q.length, cls: document.documentElement.classList.contains('pl-native'), theme: window.__pln.theme.slice() }));
    ck('★★ 공유로 열리면 Anima 화면에 사진이 들어간다(저장된 화면이 클래식이어도)', r.lay === 'anima' && r.img && /IMG_0001/.test(r.name || '') && r.left === 0, JSON.stringify(r));
    ck('앱 안이면 html.pl-native · 시작할 때 테마 색을 앱에 알린다', r.cls && r.theme.length >= 1, JSON.stringify(r));

    // ── ② 이미 떠 있을 때 또 공유 — 새로고침 없이 갈아끼운다 ─────────────────
    const w = await p.evaluate(async (g) => {
      window.__stay = 'same-doc';
      const before = _anima.srcKey;
      window.__pln.q.push({ name: 'IMG_0002.png', mime: 'image/png', size: 70, b64: g });
      window._plNativeShareArrived();
      for (let i = 0; i < 50 && _anima.srcKey === before; i++) await new Promise(r => setTimeout(r, 100));
      return { stay: window.__stay, changed: _anima.srcKey !== before, name: _anima.img && _anima.img.name };
    }, GRN);
    ck('★★ 이미 떠 있을 때 공유가 오면 새로고침 없이 새 사진으로 바뀐다', w.stay === 'same-doc' && w.changed && /IMG_0002/.test(w.name || ''), JSON.stringify(w));

    // ── ③ 앱이 아직 읽는 중 → 기다렸다 꺼낸다 ─────────────────────────
    const rd = await p.evaluate(async (g) => {
      const before = _anima.srcKey;
      window.__pln.reading = 1;
      window._plNativeShareArrived();
      await new Promise(r => setTimeout(r, 400));
      window.__pln.q.push({ name: 'IMG_0003.png', mime: 'image/png', size: 70, b64: g }); window.__pln.reading = 0;
      for (let i = 0; i < 50 && _anima.srcKey === before; i++) await new Promise(r => setTimeout(r, 100));
      return { changed: _anima.srcKey !== before, name: _anima.img && _anima.img.name };
    }, RED);
    ck('앱이 큰 사진을 읽는 중이면 기다렸다가 꺼낸다', rd.changed && /IMG_0003/.test(rd.name || ''), JSON.stringify(rd));

    // ── ④ 사진이 아닌 것 · 못 읽은 것 → 이유를 말한다 ──────────────────────
    const bad = await p.evaluate(async () => {
      document.querySelectorAll('#toast-container .toast').forEach(t => t.remove());
      window.__pln.q.push({ name: 'https://example.com/a', mime: '', err: 'nofile' }, { name: 'huge.png', mime: 'image/png', err: 'big' });
      window._plNativeShareArrived();
      await new Promise(r => setTimeout(r, 500));
      return [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent).join(' | ');
    });
    ck('★ 사진이 아닌 것·너무 큰 것은 조용히 버리지 않고 이유를 말한다', /2개를 못 넣었어요/.test(bad) && /글자·링크/.test(bad) && /40MB/.test(bad), bad);

    // ── ⑤ 내려받기 → 앱의 saveFile (a.click 직후 주소를 지워도) ─────────────────
    const dl = await p.evaluate(async () => {
      const blob = new Blob([JSON.stringify({ hello: '프롬프트' })], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = '프롬프트랩_백업.json';
      a.click(); URL.revokeObjectURL(url);   // 앱 코드에 실제로 있는 순서
      for (let i = 0; i < 30 && !window.__pln.saved.length; i++) await new Promise(r => setTimeout(r, 100));
      const s = window.__pln.saved[0];
      const txt = s ? new TextDecoder().decode(Uint8Array.from(atob(s.b64), c => c.charCodeAt(0))) : '';
      return { n: window.__pln.saved.length, name: s && s.name, mime: s && s.mime, txt, toast: [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent).join('|') };
    });
    ck('★★ 내려받기(blob 주소)는 앱이 저장한다 — 이름·종류·내용 그대로', dl.n === 1 && dl.name === '프롬프트랩_백업.json' && dl.mime === 'application/json' && /프롬프트/.test(dl.txt), JSON.stringify(dl));
    ck('★ a.click() 직후 주소를 지워도 받는다 · 저장했다고 알린다', dl.n === 1 && /저장했어요/.test(dl.toast), dl.toast);
    const dl2 = await p.evaluate(async () => {
      const url = URL.createObjectURL(new Blob(['x'], { type: 'image/png' }));
      const a = document.createElement('a'); a.href = url; a.download = 'pic.png'; a.textContent = 'dl'; document.body.appendChild(a);
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      a.remove();
      for (let i = 0; i < 30 && window.__pln.saved.length < 2; i++) await new Promise(r => setTimeout(r, 100));
      return { n: window.__pln.saved.length, name: (window.__pln.saved[1] || {}).name };
    });
    ck('화면에 있는 <a download> 를 눌러도 앱이 저장한다', dl2.n === 2 && dl2.name === 'pic.png', JSON.stringify(dl2));

    // ── ⑥ 화면 켜 두기 · 테마 ────────────────────────────────────────
    const ws = await p.evaluate(async () => {
      window.__pln.screen.length = 0;
      _plWakeSet('t', true); await new Promise(r => setTimeout(r, 50));
      _plWakeSet('t', false); await new Promise(r => setTimeout(r, 50));
      const th0 = window.__pln.theme.length; toggleTheme(); const t1 = window.__pln.theme[th0]; toggleTheme();
      return { screen: window.__pln.screen.slice(), t1 };
    });
    ck('일하는 동안 화면 켜 두기가 앱에 전해진다(켬 → 끔)', ws.screen[0] === true && ws.screen[ws.screen.length - 1] === false, JSON.stringify(ws));
    ck('테마를 바꾸면 상태 표시줄 색도 따라간다', ws.t1 === 'light' || ws.t1 === 'dark', JSON.stringify(ws));
    await ctx.close();
  }

  // ── ⑦ 클래식 화면에 있을 때 공유 → Anima 로 옮겨 넣는다 ─────────────────────
  {
    const { ctx, p } = await mk({ layout: 'classic', native: { q: [] } });
    await p.goto(BASE, { waitUntil: 'load' });
    await p.waitForFunction(() => typeof window.applyLayout === 'function' && document.body.getAttribute('data-layout') === 'classic', null, { timeout: 30000 });
    await p.waitForTimeout(500);
    const r = await p.evaluate(async (g) => {
      window.__pln.q.push({ name: 'IMG_9.png', mime: 'image/png', size: 70, b64: g });
      window._plNativeShareArrived();
      for (let i = 0; i < 80 && !(typeof _anima !== 'undefined' && _anima.img && /IMG_9/.test(_anima.img.name || '')); i++) await new Promise(r => setTimeout(r, 100));
      return { lay: document.body.getAttribute('data-layout'), name: _anima.img && _anima.img.name };
    }, RED);
    ck('★ 클래식 화면에 있을 때 공유가 오면 Anima 로 옮겨 넣는다', r.lay === 'anima' && /IMG_9/.test(r.name || ''), JSON.stringify(r));
    await ctx.close();
  }

  // ── ⑧ 앱 밖 — 안드로이드 브라우저 ───────────────────────────────
  {
    const UA = 'Mozilla/5.0 (Linux; Android 16; SM-F966N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36';
    const { ctx, p } = await mk({ ctx: { userAgent: UA } });
    await p.goto(BASE + '?shared=0&why=empty&info=' + encodeURIComponent('len=153'), { waitUntil: 'load' });
    await waitMount(p);
    await p.waitForTimeout(1800);
    const r = await p.evaluate(() => ({
      cls: document.documentElement.classList.contains('pl-native'),
      clickNative: /\[native code\]/.test(HTMLAnchorElement.prototype.click.toString()),
      toast: [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent).join(' | '),
    }));
    ck('★ 앱 밖(보통 브라우저)에서는 아무것도 바꾸지 않는다(a.click 원본 그대로)', !r.cls && r.clickNative, JSON.stringify(r));
    ck('빈 공유 안내는 예전 그대로 뜬다(len 줄 포함)', /이미지가 넘어오지 않았어요/.test(r.toast) && /len=153/.test(r.toast), r.toast);
    await ctx.close();
  }

  // ── ⑨ 서비스워커가 .apk 내려받기를 캐시에 담지 않는다 ─────────────────────
  {
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const m = /function _cacheable\(req, url\) \{[\s\S]*?\n\}/.exec(sw);
    let ok = false, d = 'no _cacheable';
    if (m) {
      const fn = new Function('self', m[0] + '; return _cacheable;')({ location: { origin: 'https://x.io' } });
      const nav = (p) => fn({ method: 'GET', mode: 'navigate' }, new URL('https://x.io' + p));
      const res = { apk: nav('/promt-lab/app/PromptLab.apk'), root: nav('/promt-lab/'), html: nav('/promt-lab/index.html') };
      ok = !res.apk && res.root && res.html; d = JSON.stringify(res);
    }
    ck('★ 서비스워커는 앱 파일(.apk) 내려받기를 담지 않는다 · 문서는 그대로 담는다', ok, d);
  }

  ck('오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})().catch(e => { console.log('FAIL - 검사가 죽었다 :: ' + (e && e.stack || e)); process.exit(1); });
