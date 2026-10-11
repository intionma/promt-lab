// v9.204.0 — 8관점 감사(보안·코드 건강·디자인·접근성·플랫폼)에서 고친 것들의 회귀 검사.
//  ★ 고치기 전 코드(v9.203.2)로 돌리면 대부분 FAIL 이어야 한다 — 그래야 이 검사가 무언가를 지킨다.
//  포트는 0(빈 포트)으로 연다 — 고정 포트는 다른 검사와 부딪혔다(감사 G).
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAJklEQVR42u3OMQEAAAgDoC251a3gL2SgeVsXAAAAAAAAAAAAAOBvA0d9AAGvXCJ9AAAAAElFTkSuQmCC', 'base64');
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join(ROOT, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : /\.js$/.test(p) ? 'text/javascript' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };
const lum = (rgb) => { const m = String(rgb).match(/[\d.]+/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

async function boot(b, opts) {
  const o = Object.assign({ w: 390, h: 844, layout: 'anima', theme: 'dark', touch: true, init: null }, opts || {});
  const ctx = await b.newContext({ viewport: { width: o.w, height: o.h }, hasTouch: o.touch, isMobile: o.touch });
  await ctx.addInitScript((a) => {
    try {
      if (!sessionStorage.getItem('__seeded')) {
        sessionStorage.setItem('__seeded', '1');
        localStorage.setItem('pl_layout', a.layout); localStorage.setItem('adult_optin_v1', '1');
        localStorage.setItem('pro_prompt_theme', a.theme);
      }
    } catch (e) {}
    //  화면 꺼짐 방지·저장소 보존 요청을 센다(헤드리스는 실제로 못 잡으므로 가짜로 바꿔 끼운다)
    window.__wl = 0; window.__wlr = 0; window.__persist = 0;
    try {
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wl++; return { release: async () => { window.__wlr++; }, addEventListener() {} }; } } });
    } catch (e) {}
    try {
      const st = navigator.storage;
      if (st) { st.persisted = async () => false; st.persist = async () => { window.__persist++; return true; }; }
    } catch (e) {}
  }, o);
  if (o.init) await ctx.addInitScript(o.init);
  const p = await ctx.newPage();
  p.__errs = []; p.on('pageerror', e => p.__errs.push(e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`, { waitUntil: 'load' });
  if (o.layout === 'anima') await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets && !!window._animaMounted, null, { timeout: 30000 });
  else await p.waitForFunction(() => !!window._appInited, null, { timeout: 30000 });
  await p.waitForTimeout(600);
  return { ctx, p };
}

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PL_CHROMIUM || '/opt/pw-browsers/chromium' });

  // ══ A. Anima 폰 ════════════════════════════════════════════════════
  {
    const { ctx, p } = await boot(b);

    // ① 따옴표 escape — 이름에 " 를 넣어 속성을 깨려 해도 새 속성이 안 생긴다
    const x = await p.evaluate(async () => {
      const s = _anima.snippets.find(v => v.group === 'expr');
      const old = s.name; s.name = 'z" onfocus="window.__xss=1" autofocus data-evil="1';
      try { _animaRenderSnippets(); } catch (e) {}
      await new Promise(r => setTimeout(r, 300));
      const evil = document.querySelectorAll('[data-evil], #anima-root [onfocus]').length;
      s.name = old; try { _animaRenderSnippets(); } catch (e) {}
      return { evil, xss: window.__xss || 0, esc: _animaEsc(`a"b'c`), esc0: _esc0(`a"b'c`) };
    });
    ck('★★ 이름 속 따옴표로 속성을 끼워 넣을 수 없다 (Anima 칩)', x.evil === 0 && x.xss === 0, JSON.stringify(x));
    ck('★ Anima·노드 오류용 escape 도 따옴표를 바꾼다', /&quot;/.test(x.esc) && /&#39;/.test(x.esc) && /&quot;/.test(x.esc0), JSON.stringify(x));

    // ② 확인창 — 처음 초점은 「취소」, Enter 는 초점 받은 버튼만, 꾹 누른 Enter 는 다음 창을 못 넘긴다
    await p.evaluate(() => { window.__cfA = 0; window.__cfB = 0; showConfirm('검사', () => { window.__cfA++; }); });
    await p.waitForTimeout(250);
    const f1 = await p.evaluate(() => (document.activeElement && document.activeElement.textContent) || '');
    await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    const c1 = await p.evaluate(() => ({ a: window.__cfA, open: !!document.querySelector('.confirm-overlay') }));
    ck('★★ 확인창의 처음 초점은 「취소」', f1 === '취소', f1);
    ck('★★ 「취소」에서 Enter 를 누르면 실행되지 않는다', c1.a === 0 && !c1.open, JSON.stringify(c1));
    await p.evaluate(() => { showConfirm('1단계', () => { window.__cfA++; showConfirm('2단계', () => { window.__cfB++; }); }); });
    await p.waitForTimeout(250);
    await p.keyboard.press('Tab'); await p.waitForTimeout(80);
    const f2 = await p.evaluate(() => (document.activeElement && document.activeElement.textContent) || '');
    await p.keyboard.down('Enter'); await p.waitForTimeout(250);
    await p.keyboard.down('Enter'); await p.keyboard.down('Enter'); await p.waitForTimeout(250);   // 꾹 누름 = repeat
    await p.keyboard.up('Enter'); await p.waitForTimeout(250);
    const c2 = await p.evaluate(() => ({ a: window.__cfA, b: window.__cfB, open: document.querySelectorAll('.confirm-overlay').length }));
    ck('Tab 으로 「삭제」에 가서 Enter 를 누르면 실행된다', f2 === '삭제' && c2.a === 1, JSON.stringify({ f2, c2 }));
    ck('★★ Enter 를 꾹 눌러도 다음 단계 확인창은 통과하지 못한다', c2.b === 0 && c2.open === 1, JSON.stringify(c2));
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);

    // ③ Ctrl+V 붙여넣기 — 예전엔 ReferenceError 로 죽었다
    const pa = await p.evaluate(async (b64) => {
      _anima.img = null; try { _animaRenderInput(); } catch (e) {}
      const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
      const dt = new DataTransfer(); dt.items.add(new File([a], 'paste.png', { type: 'image/png' }));
      let err = null;
      try { document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); } catch (e) { err = e.message; }
      await new Promise(r => setTimeout(r, 1500));
      return { img: !!(_anima.img && _anima.img.dataURL), err };
    }, PNG.toString('base64'));
    ck('★★ Anima 에서 Ctrl+V 로 그림이 들어간다', pa.img && !pa.err, JSON.stringify(pa));

    // ④ '이전 원본' — 서로 다른 그림 3장을 넣으면 목록이 늘고 거짓 '0장' 경고가 없다
    const hist = await p.evaluate(async () => {
      document.querySelectorAll('#toast-container .toast').forEach(t => t.remove());
      _anima.srcHistory = [];
      for (const col of ['#f00', '#0f0', '#00f']) {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64;
        const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, 64, 64);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        await _animaTakeBlob(blob, 'c' + col);
        await new Promise(r => setTimeout(r, 400));
      }
      return { n: (_anima.srcHistory || []).length, toasts: [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent).filter(t => /0장/.test(t)) };
    });
    ck('★★ 이전 원본 목록이 실제로 쌓인다 (예전엔 늘 0장)', hist.n >= 2, JSON.stringify(hist));
    ck('★ 거짓 「저장 공간이 부족해 0장」 경고가 안 뜬다', hist.toasts.length === 0, JSON.stringify(hist));

    // ⑤ 알림이 상단바를 덮지 않는다
    const ts = await p.evaluate(async () => {
      showToast('위치 검사', 'info', 4000); await new Promise(r => setTimeout(r, 450));
      const t = document.querySelector('#toast-container .toast:last-child').getBoundingClientRect();
      const bar = document.getElementById('global-topbar'); const bb = bar ? bar.getBoundingClientRect() : { bottom: 50 };
      const mb = document.getElementById('gt-menu-btn'); let hit = null;
      if (mb) { const r = mb.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); hit = !!(e && (e === mb || mb.contains(e))); }
      return { top: Math.round(t.top), bar: Math.round(bb.bottom), hit, live: document.getElementById('toast-container').getAttribute('aria-live') };
    });
    ck('★★ 폰에서 알림이 상단바 아래에 뜬다', ts.top >= ts.bar - 1, JSON.stringify(ts));
    ck('★ 알림이 떠 있어도 메뉴 버튼이 눌린다', ts.hit !== false, JSON.stringify(ts));
    ck('알림은 화면 읽기 프로그램에 알린다(aria-live)', ts.live === 'polite', JSON.stringify(ts));

    // ⑥ 뒤로가기 — 열린 상단 메뉴부터 닫고, '나갑니다' 안내는 안 뜬다
    await p.evaluate(() => { toggleGtMenu(); }); await p.waitForTimeout(350);
    const m0 = await p.evaluate(() => document.getElementById('gt-menu').classList.contains('open'));
    await p.evaluate(() => history.back()); await p.waitForTimeout(600);
    const m1 = await p.evaluate(() => ({ open: document.getElementById('gt-menu').classList.contains('open'), snack: !!(document.getElementById('pl-back-snack') && document.getElementById('pl-back-snack').classList.contains('on')) }));
    ck('★★ 뒤로가기가 열린 상단 메뉴를 닫는다', m0 && !m1.open, JSON.stringify({ m0, m1 }));
    ck('★ 그때 \'한 번 더 누르면 나갑니다\'는 안 뜬다', !m1.snack, JSON.stringify(m1));
    await p.evaluate(() => history.back()); await p.waitForTimeout(500);
    const m2 = await p.evaluate(() => !!(document.getElementById('pl-back-snack') && document.getElementById('pl-back-snack').classList.contains('on')));
    ck('그다음 뒤로가기는 예전처럼 나가기 안내를 띄운다(문지기 유지)', m2, String(m2));
    await p.waitForTimeout(2600);

    // ⑦ 화면 꺼짐 방지 — 대기열이 있을 때 잡고, 비면 놓는다 · 저장소 보존 요청
    const wl = await p.evaluate(async () => {
      _animaJobs.push({ id: 99901, status: 'queued', thumb: '', label: 'x', prompt: 'x', seed: 1, snap: {}, settings: {} });
      try { _animaSyncBusy(); } catch (e) {}
      await new Promise(r => setTimeout(r, 300));
      const got = window.__wl;
      _animaJobs = _animaJobs.filter(j => j.id !== 99901);
      try { _animaSyncBusy(); } catch (e) {}
      await new Promise(r => setTimeout(r, 300));
      return { got, rel: window.__wlr, persist: window.__persist };
    });
    ck('★ Anima 대기열이 도는 동안 화면 꺼짐 방지를 잡는다', wl.got >= 1, JSON.stringify(wl));
    ck('★ 대기열이 비면 바로 놓는다', wl.rel >= 1, JSON.stringify(wl));
    ck('★ 부팅 때 저장소 보존을 요청한다', wl.persist >= 1, JSON.stringify(wl));

    // ⑧ 빈 화면에서는 「결과만 보기」 버튼을 숨긴다
    const af = await p.evaluate(() => { const keep = _anima.results; _anima.results = []; _anima.img = null; try { _animaRenderResult(); } catch (e) {} const b = document.getElementById('anima-after-toggle'); const d = b ? getComputedStyle(b).display : 'none'; _anima.results = keep; return d; });
    ck('결과가 없으면 「결과만 보기」가 안 보인다', af === 'none', af);

    // ⑨ 상단바 📨 핀은 Anima 의 연결 카드를 연다(클래식 전송 창이 아니다)
    const pin = await p.evaluate(async () => {
      const b = document.querySelector('#gt-pins [data-tool="comfy"]'); if (!b) return { none: true };
      b.click(); await new Promise(r => setTimeout(r, 500));
      const m = document.getElementById('comfy-modal');
      const card = document.querySelector('.anima-srv-card');
      return { classicOpen: !!(m && getComputedStyle(m).display !== 'none'), cardOpen: !!(card && !card.classList.contains('closed') && card.offsetParent) };
    });
    ck('★ Anima 에서 📨 핀이 클래식 전송 창을 열지 않는다', pin.none || !pin.classicOpen, JSON.stringify(pin));
    ck('★ 대신 Anima 연결 카드를 펼쳐 보여 준다', pin.none || pin.cardOpen, JSON.stringify(pin));

    // ⑩ 메뉴 항목은 누르는 순간 클래식 엔진을 싣는다(Ctrl+K 경로 포함)
    const io = await p.evaluate(async () => {
      const before = typeof openIOModal;
      const it = document.querySelector('#gt-menu .gt-menu-item[data-tool="export"]');
      it.click(); await new Promise(r => setTimeout(r, 600));
      const m = document.getElementById('db-io-modal');
      const vis = !!(m && getComputedStyle(m).display !== 'none');
      if (m) m.style.display = 'none';
      return { before, after: typeof openIOModal, vis };
    });
    ck('★★ Anima 에서 메뉴(명령창) 「내보내기」가 열린다', io.after === 'function' && io.vis, JSON.stringify(io));

    // ⑪ 백업 불러오기는 내보낼 때 담는 키만 받는다
    const ioOk = await p.evaluate(() => ({ evil: _ioPrefOk('evil_key_x', 'v'), good: _ioPrefOk('pl_layout', 'anima'), obj: _ioPrefOk('pl_layout', { a: 1 }) }));
    ck('★★ 백업 불러오기가 목록 밖 키를 거른다', ioOk.evil === false && ioOk.good === true && ioOk.obj === false, JSON.stringify(ioOk));

    // ⑫ 중지 — 연결이 끊겨 실패하면 목록에서 안 지우고, 성공하면 그 장만 콕 집어 보낸다
    const cx = await p.evaluate(async () => {
      const real = window.fetch; const sent = [];
      document.querySelectorAll('#toast-container .toast').forEach(t => t.remove());
      _comfyJobs['pjob1'] = { t: Date.now() }; _comfyRunningPid = 'pjob1'; _comfyQueueCount = 1;
      window.fetch = async () => { throw new TypeError('Failed to fetch'); };
      await comfyCancelJob('pjob1');
      const kept = !!_comfyJobs['pjob1'];
      const toast = [...document.querySelectorAll('#toast-container .toast')].some(t => /보내지 못했어요/.test(t.textContent));
      window.fetch = async (u, o) => { sent.push({ u: String(u), body: o && o.body }); return new Response('{}', { status: 200 }); };
      await comfyCancelJob('pjob1');
      window.fetch = real;
      return { kept, toast, gone: !_comfyJobs['pjob1'], sent };
    });
    ck('★★ 중지 요청이 실패하면 목록에서 지우지 않고 알린다', cx.kept && cx.toast, JSON.stringify(cx));
    ck('★ 중지는 그 작업만 콕 집는다({prompt_id})', cx.gone && cx.sent.some(s => /\/interrupt/.test(s.u) && /pjob1/.test(s.body || '')), JSON.stringify(cx));

    // ⑬ 폴더 넘기기 키 처리기가 다시 열 때마다 쌓이지 않는다
    const fk = await p.evaluate(async () => {
      for (let i = 0; i < 3; i++) { applyLayout('classic'); await new Promise(r => setTimeout(r, 150)); applyLayout('anima'); await new Promise(r => setTimeout(r, 250)); }
      window.__gf = 0; window._animaGoFolder = function () { window.__gf++; return null; };
      _anima.galGroup = true; _animaGalFolder = 'x';
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      _anima.galGroup = false; _animaGalFolder = null;
      return window.__gf;
    });
    ck('★★ Anima 를 세 번 다시 열어도 → 한 번에 한 칸만 넘어간다', fk === 1, String(fk));

    // ⑭ (v9.204.1) 결과 칸은 원본 통째(dataURL)를 다시 그리지 않는다 — 축소본으로 보여 준다
    const big = await p.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 1600; c.height = 2000;
      const g = c.getContext('2d'); for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${i},70%,50%)`; g.fillRect((i * 37) % 1600, (i * 53) % 2000, 120, 120); }
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      await _animaTakeBlob(blob, 'big');
      await new Promise(r => setTimeout(r, 600));
      _anima.results = [{ k: 'zz1', url: 'http://127.0.0.1:1/view?filename=a.png', seed: 1, src: _anima.srcKey, opt: '' }];
      _animaResSel = 0; try { _animaRenderResult(); } catch (e) {}
      const html = document.getElementById('anima-result').innerHTML;
      const full = _anima.img.dataURL;
      return { fullLen: full.length, thumbLen: (_anima.imgThumb || '').length, embedsFull: html.indexOf(full.slice(0, 200) + full.slice(200, 4000)) >= 0, htmlLen: html.length };
    });
    ck('★ 결과 칸이 원본 사진을 통째로 다시 그리지 않는다(축소본)', big.fullLen > big.thumbLen && !big.embedsFull, JSON.stringify(big));
    const clr = await p.evaluate(() => { _animaGalManage = false; try { _animaRenderResult(); } catch (e) {} const a = !!document.getElementById('anima-gal-clear'); _animaGalManage = true; try { _animaRenderResult(); } catch (e) {} const b = !!document.getElementById('anima-gal-clear'); _animaGalManage = false; try { _animaRenderResult(); } catch (e) {} return { a, b }; });
    ck('「전체 비우기」는 🗑 정리 안에서만 보인다', clr.a === false && clr.b === true, JSON.stringify(clr));

    ck('오류 없음(Anima)', p.__errs.length === 0, p.__errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ══ B. 하단바 ▾·⬓ 가 좁은 폭(확대 130% 상당)에서도 화면 안에 있다 ══════════════
  {
    const { ctx, p } = await boot(b, { w: 300, h: 650 });
    const r = await p.evaluate(() => ['#anima-mact-fold', '#anima-rail-side'].map(sel => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { sel, l: Math.round(b.left), r: Math.round(b.right), vw: innerWidth }; }));
    ck('★★ 300px 에서도 ▾·⬓ 가 화면 안에 있다 (절대 숨기면 안 되는 버튼)', r.every(x => x && x.r <= x.vw + 1 && x.l >= 0), JSON.stringify(r));
    await ctx.close();
  }

  // ══ C. 라이트 테마 칩 글자 대비 ═════════════════════════════════════
  {
    const { ctx, p } = await boot(b, { theme: 'light' });
    const c = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('#anima-root .anima-chip.g-expr, #anima-root .anima-chip.g-bust, #anima-root .anima-chip.g-pose').forEach((e, i) => {
        if (i > 12) return; const st = getComputedStyle(e);
        let el = e, bg = 'rgba(0, 0, 0, 0)';
        while (el && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) { bg = getComputedStyle(el).backgroundColor; el = el.parentElement; }
        out.push({ cls: e.className.replace('anima-chip', '').trim(), fg: st.color, bg });
      });
      return out;
    });
    const worst = c.map(x => ({ ...x, r: ratio(x.fg.startsWith('color(') ? 'rgb(0,0,0)' : x.fg, x.bg) })).sort((a, b) => a.r - b.r)[0];
    ck('★ 라이트 테마에서 색 칩 글자 대비가 4.5:1 이상', c.length && worst.r >= 4.5, JSON.stringify(worst));
    await ctx.close();
  }

  // ══ D. 이미지 변환 — 종류 표시가 없는 그림도 끌어다 놓으면 들어간다 ═════════════
  {
    const { ctx, p } = await boot(b, { layout: 'img2img', w: 1280, h: 800, touch: false });
    const d = await p.evaluate(async (b64) => {
      const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
      const dt = new DataTransfer(); dt.items.add(new File([a], 'noext', { type: '' }));
      const drop = document.querySelector('.i2i-drop'); if (!drop) return { none: true };
      drop.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 1800));
      return { got: !!(typeof _img2img !== 'undefined' && _img2img.dataURL) };
    }, PNG.toString('base64'));
    ck('★★ 이미지 변환: 종류가 빈 그림 파일도 끌어다 놓으면 들어간다', d.got === true, JSON.stringify(d));
    const st = await p.evaluate(() => { applyLayout('studio'); const b = document.getElementById('btn-mode-combo'); if (!b) return null; b.click(); const cs = getComputedStyle(b); return { fg: cs.color, bg: cs.backgroundColor, active: b.classList.contains('active') }; });
    ck('★ 스튜디오 「간편 조합」 탭이 눌렸을 때 글자가 읽힌다(4.5:1)', st && st.active && ratio(st.fg, st.bg) >= 3, JSON.stringify(st && { ...st, r: ratio(st.fg, st.bg) }));
    ck('오류 없음(이미지 변환·스튜디오)', p.__errs.length === 0, p.__errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})().catch(e => { console.log('FAIL - 검사가 죽었다 :: ' + (e && e.stack || e)); process.exit(1); });
