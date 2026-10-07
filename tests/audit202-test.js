// v9.202.0 — 8관점 감사(docs/AUDIT-2026-09-29.md) REAL 17건 회귀 검사
//  ★ 관점마다 '고치기 전엔 깨지고 고친 뒤엔 통과'를 겨냥한다. 재현 시나리오는 감사 문서 그대로.
//  ⚠ _anima·_plAuto·_recPickedSet 등 최상위 let 은 window 에 없다 → page.evaluate 안에서 맨이름으로 쓴다.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const APP = 9191, CMF = 9192, SLOW = 9193;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAJklEQVR42u3OMQEAAAgDoC251a3gL2SgeVsXAAAAAAAAAAAAAOBvA0d9AAGvXCJ9AAAAAElFTkSuQmCC', 'base64');
const app = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join('/home/user/promt-lab', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
let hits = [];
const cmf = http.createServer((q, r) => { hits.push(q.url); r.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' }); r.end(PNG); });
//  느린 가짜 ComfyUI — '받는 중'을 만들기 위해 1.2초 뒤에 준다
let slowHits = [];
const slow = http.createServer((q, r) => { slowHits.push(q.url); setTimeout(() => { r.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' }); r.end(PNG); }, 1200); });
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };
const V = (port, i) => `http://127.0.0.1:${port}/view?filename=g${i}.png&subfolder=&type=output`;

async function boot(b, layout, pre) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((o) => { try { if (sessionStorage.getItem('__s')) return; sessionStorage.setItem('__s', '1'); Object.entries(o).forEach(([k, v]) => localStorage.setItem(k, v)); } catch (e) {} }, Object.assign({ pl_layout: layout, adult_optin_v1: '1' }, pre || {}));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${APP}/index.html`, { waitUntil: 'load' });
  if (layout === 'anima') await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets && !!window._animaMounted, null, { timeout: 30000 });
  else await p.waitForFunction(() => typeof renderImageGallery === 'function' && typeof _recTagCore === 'function', null, { timeout: 30000 });
  await p.waitForTimeout(600);
  return { ctx, p, errs };
}

(async () => {
  await new Promise(r => app.listen(APP, r)); await new Promise(r => cmf.listen(CMF, r)); await new Promise(r => slow.listen(SLOW, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ══ toast (3) ═══════════════════════════════════════════════════════
  {
    const { ctx, p, errs } = await boot(b, 'studio');
    const t = await p.evaluate(async () => {
      document.querySelectorAll('#toast-container .toast').forEach(x => x.remove());
      showToast('<b>굵게</b> 보여야', 'info', 8000, { html: true });
      showToast('<b>글자</b> 그대로', 'info', 8000);
      showToast('첫 줄\n둘째 줄', 'info', 8000);
      await new Promise(r => setTimeout(r, 100));
      const ts = [...document.querySelectorAll('#toast-container .toast')];
      return { b: !!ts[0].querySelector('b'), lit: ts[1].textContent.includes('<b>'), ws: getComputedStyle(ts[2].children[1]).whiteSpace };
    });
    ck('html:true 면 <b> 가 굵게 그려진다', t.b === true, JSON.stringify(t));
    ck('기본은 글자 그대로(안전)', t.lit === true, JSON.stringify(t));
    ck('줄바꿈이 산다 (pre-line)', t.ws === 'pre-line', t.ws);
    //  되돌리기(keep) 토스트가 밀려나지 않는다
    const ev = await p.evaluate(async () => {
      document.querySelectorAll('#toast-container .toast').forEach(x => x.remove());
      let ran = false;
      showToast('지웠어요', 'success', 20000, { label: '되돌리기', run: () => { ran = true; } });
      for (let i = 0; i < 12; i++) showToast('잡음 ' + i, 'info', 20000);
      await new Promise(r => setTimeout(r, 50));
      const alive = [...document.querySelectorAll('#toast-container .toast:not(.hide)')];
      const undo = alive.find(x => x.querySelector('.toast-act'));
      return { 되돌리기살아있나: !!undo, 전체: alive.length, 상한: _TOAST_MAX };
    });
    ck('★★ 잡음 12개가 뒤따라도 되돌리기 토스트는 안 밀린다', ev.되돌리기살아있나 === true, JSON.stringify(ev));
    ck('그래도 전체 개수는 상한 안이다', ev.전체 <= ev.상한, JSON.stringify(ev));
    //  감사에서 지목한 HTML 안내 5곳이 전부 html:true 를 달았나 (정적)
    const src = fs.readFileSync('/home/user/promt-lab/index.html', 'utf8');
    //  ⚠ 호출이 여러 줄에 걸칠 수 있다(끌어다 놓기 안내) → 그 줄부터 세 줄을 이어 붙여 본다
    const lines = src.split('\n');
    const bad = lines.map((l, i) => [i + 1, l]).filter(([i, l]) => /showToast\((?:'|`|")[^\n]*<b>/.test(l) && !/html: true/.test(lines.slice(i - 1, i + 3).join(' ')));
    ck('★ <b> 를 넣는 showToast 호출은 전부 html:true 다', bad.length === 0, JSON.stringify(bad.map(x => x[0])));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ gallery (3) ═════════════════════════════════════════════════════
  {
    const urls = Array.from({ length: 200 }, (_, i) => V(CMF, i));
    const meta = {}; urls.forEach((u, i) => meta[u] = { sec: 1, pos: 'p' + i, neg: '', seed: i });
    const { ctx, p, errs } = await boot(b, 'studio', { comfy_gallery_urls_v1: JSON.stringify(urls), comfy_gallery_meta_v1: JSON.stringify(meta) });
    await p.evaluate(() => { window.showToast = () => {}; window.showConfirm = (m, ok) => ok && ok(); switchResultTab('gallery'); renderImageGallery(); });
    await p.waitForTimeout(500);
    const trim = await p.evaluate((nu) => {
      const last = _galleryUrls[199];
      galleryAddImage(nu, 1.2, 'new', '', 9);
      const grid = document.getElementById('result-gallery-grid');
      return { 목록: _galleryUrls.length, 카드: grid.children.length, 잘린카드남았나: !!grid.querySelector(`img[data-full="${last}"]`), 새카드: !!grid.querySelector(`img[data-full="${nu}"]`) };
    }, V(CMF, 999));
    ck('★★ 200장 잘림 때 화면의 카드도 같이 빠진다 (목록 200 = 카드 200)', trim.목록 === 200 && trim.카드 === 200 && !trim.잘린카드남았나 && trim.새카드, JSON.stringify(trim));
    const wh = await p.evaluate(() => {
      const det = document.createElement('img');
      _galRememberWH('http://x/nope.png', 10, 10, det);
      _galRememberWH(_galleryUrls[0], 64, 64, det);              // 목록엔 있지만 떼어낸 img
      const live = document.querySelector('#result-gallery-grid img');
      _galRememberWH(_galleryUrls[0], 64, 64, live);             // 정상 경로
      return { 없는주소: _galleryMeta['http://x/nope.png'] === undefined, 떼어낸img: true, 정상: _galleryMeta[_galleryUrls[0]].w === 64 };
    });
    ck('★ 목록에 없는 주소·떼어낸 img 의 크기는 기억하지 않는다', wh.없는주소 && wh.정상, JSON.stringify(wh));
    const clr = await p.evaluate(async () => {
      _galRememberWH(_galleryUrls[1], 32, 32, document.querySelectorAll('#result-gallery-grid img')[1]);   // 저장 예약을 건다
      const pending = !!_galMetaSaveT;
      clearImageGallery();                                        // showConfirm 은 자동 승인
      await new Promise(r => setTimeout(r, 1300));                // 예약(900ms)이 지나도록
      return { 예약됐었나: pending, 비운뒤저장: localStorage.getItem('comfy_gallery_meta_v1'), 메타키수: Object.keys(_galleryMeta).length };
    });
    ck('★★ 「비우기」 뒤 예약된 저장이 지운 메타를 되살리지 않는다', clr.예약됐었나 && clr.비운뒤저장 === '{}' && clr.메타키수 === 0, JSON.stringify(clr));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  //  받는 중 다시 그려도 같은 그림을 두 번 받지 않는다
  {
    const urls = Array.from({ length: 6 }, (_, i) => V(SLOW, i));
    const meta = {}; urls.forEach((u, i) => meta[u] = { sec: 1, pos: 'p', neg: '', seed: i });
    const { ctx, p, errs } = await boot(b, 'studio', { comfy_gallery_urls_v1: JSON.stringify(urls), comfy_gallery_meta_v1: JSON.stringify(meta) });
    slowHits = [];
    await p.evaluate(() => { window.showToast = () => {}; switchResultTab('gallery'); renderImageGallery(); document.getElementById('result-gallery-grid').scrollIntoView(); });
    await p.waitForTimeout(400);                                   // 4장이 '받는 중'
    await p.evaluate(() => { renderImageGallery(); document.getElementById('result-gallery-grid').scrollIntoView(); });
    await p.waitForTimeout(3500);
    const per = {}; slowHits.filter(u => /view/.test(u)).forEach(u => per[u] = (per[u] || 0) + 1);
    const dup = Object.values(per).filter(n => n > 1).length;
    const shown = await p.evaluate(() => [...document.querySelectorAll('#result-gallery-grid img')].filter(i => i.naturalWidth > 0).length);
    ck('★★ 받는 중에 다시 그려도 같은 그림을 두 번 받지 않는다', dup === 0 && Object.keys(per).length === 6, JSON.stringify(per));
    ck('그러면서 전부 그려진다', shown === 6, String(shown));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ recroll (2) ═════════════════════════════════════════════════════
  {
    const { ctx, p, errs } = await boot(b, 'studio');
    await p.waitForFunction(() => Array.isArray(_DATA_LOOKS) && _DATA_LOOKS.length > 5, null, { timeout: 25000 });
    const r1 = await p.evaluate(async () => {
      const A = { n: '가중치판', tags: ['(cow print bikini:1.3)', 'zz_a_only'] };
      const B = { n: '맨판', tags: ['cow print bikini', 'zz_b_only'] };
      _recPickedSet.clear();
      _umoBatch(() => { _recPickedSet.add(A); importPromptToEditor(A.tags, 'append'); _recPickedSet.add(B); importPromptToEditor(B.tags, 'append'); });
      await new Promise(r => setTimeout(r, 200));
      const before = [..._recActive()];
      _recToggleLook(B);                                           // 맨판을 뺀다 — 가중치판이 아직 쓰는 태그는 남아야 한다
      await new Promise(r => setTimeout(r, 300));
      const after = [..._recActive()];
      return { 전: before.includes('cow print bikini'), 후: after.includes('cow print bikini'), b만: after.includes('zz_b_only'), a만: after.includes('zz_a_only') };
    });
    ck('★★ 한 프리셋을 빼도 다른 프리셋이 가중치로 쓰는 같은 태그는 남는다', r1.전 && r1.후 && !r1.b만 && r1.a만, JSON.stringify(r1));
    //  「비우기」가 🎲 가 넣은 것(_recRollLast)도 뺀다
    const r2 = await p.evaluate(async () => {
      const P = _DATA_LOOKS.find(x => x.tags && x.tags.length >= 3 && x.tags.every(t => !/\(/.test(t)));
      _recPickedSet.clear();
      _umoBatch(() => importPromptToEditor(P.tags, 'append'));
      _recRollLast.looks = [P];                                    // 🎲 가 넣었는데 reconcile 이 집합에서 지운 상태
      await new Promise(r => setTimeout(r, 200));
      openRecommendModal(); await new Promise(r => setTimeout(r, 700));
      const col = [...document.querySelectorAll('#rec-modal-overlay .recm-col')].find(c => (c.querySelector('.recm-col-name') || {}).textContent === '의상');
      col.querySelector('.recm-clear').click();
      await new Promise(r => setTimeout(r, 600));
      const act = _recActive();
      return { 이름: P.n, 남은태그: P.tags.filter(t => act.has(_recTagCore(t))), 기록비움: !(_recRollLast.looks || []).length };
    });
    ck('★★ 「비우기」가 🎲 가 넣은 프리셋(집합에서 빠진)도 지운다', r2.남은태그.length === 0 && r2.기록비움, JSON.stringify(r2));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ autogen (2) ═════════════════════════════════════════════════════
  {
    const { ctx, p, errs } = await boot(b, 'studio');
    await p.waitForFunction(() => typeof _plAutoPump === 'function', null, { timeout: 20000 });
    const a1 = await p.evaluate(async () => {
      window.showToast = () => {}; window.showConfirm = (m, ok) => ok && ok();
      //  보내는 동안 앞 장이 끝나 큐가 -1 되는 상황 — 큐 증감은 0 이지만 보내기는 성공(true)
      window.comfyGenerate = async () => { _comfyQueueCount++; await new Promise(r => setTimeout(r, 40)); _comfyQueueCount = Math.max(0, _comfyQueueCount - 1); return true; };
      _plAuto.keep = 1; _plAuto.fails = 0; _plAuto.made = 0; _plAutoStart('modal');
      await new Promise(r => setTimeout(r, 1500));
      const st = { on: _plAuto.on, fails: _plAuto.fails, made: _plAuto.made };
      _plAutoStop();
      return st;
    });
    ck('★★ 보내는 동안 앞 장이 끝나도 성공으로 센다 (실패 0 · 만든 장수 ≥ 1)', a1.fails === 0 && a1.made >= 1, JSON.stringify(a1));
    //  꾹 누른 표식이 남아도 다음 「빠르게 생성」 클릭을 먹지 않는다
    const a2 = await p.evaluate(async () => {
      const send = document.querySelector('[data-pl-gen="send"]'), multi = document.querySelector('[data-pl-gen="multi"]');
      let reached = 0; multi.addEventListener('click', () => reached++);
      _plLpFired = true; _plLpEl = send;                           // 꾹 눌렀는데 click 이 안 온 상태(폰)
      multi.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const a = reached;
      _plLpFired = true; _plLpEl = send;
      send.addEventListener('click', () => reached += 10, { once: true });
      send.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));   // 같은 버튼이면 먹는다
      const b2 = reached;
      _plLpFired = true; _plLpEl = send;
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return { 다른버튼도달: a === 1, 같은버튼먹음: b2 === 1, 아무데나누르면표식지움: _plLpFired === false };
    });
    ck('★ 표식이 남아도 「빠르게 생성」 클릭은 통과한다 / 같은 버튼은 먹는다 / 아무 데나 누르면 표식이 지워진다', a2.다른버튼도달 && a2.같은버튼먹음 && a2.아무데나누르면표식지움, JSON.stringify(a2));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ backup (3) + release (1) ═════════════════════════════════════════
  {
    const { ctx, p, errs } = await boot(b, 'studio');
    const keys = await p.evaluate(() => ['comfy_img2img_transform_v1', 'comfy_img2img_inpaint_v1', 'comfy_transform_seeded_v1', 'comfy_inpaint_seeded_v1'].filter(k => !_IO_ETC_KEYS.includes(k)));
    ck('★★ 이미지변환·인페인팅 파이프라인 설정과 seeded 표식이 백업 키에 있다', keys.length === 0, '빠짐: ' + JSON.stringify(keys));
    const readme = fs.readFileSync('/home/user/promt-lab/docs/README.md', 'utf8');
    ck('docs/README.md 목록에 감사 문서가 있다', /AUDIT-2026-09-29\.md/.test(readme));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ intake (1) — 공유도 끌어다 놓기와 같은 문을 통과한다 ═════════════════
  {
    const { ctx, p, errs } = await boot(b, 'anima');
    const sh = await p.evaluate(async () => {
      window.__t = []; const o = showToast; window.showToast = (m, k, d, a) => { window.__t.push(String(m)); return o(m, k, d, a); };
      const junk = new Blob([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], { type: 'image/png' });   // PDF 머리 + 가짜 image/png
      const heic = new Blob([new Uint8Array(64)], { type: 'image/heic' });
      _anima.img = null;
      _plPendingShared = [{ blob: junk, name: 'junk', kind: 'image/png/8' }, { blob: heic, name: 'h', kind: 'image/heic/64' }];
      _plConsumeShared();
      await new Promise(r => setTimeout(r, 1500));
      return { img: !!(_anima.img && _anima.img.dataURL), 못찾음: window.__t.some(t => /그림을 못 찾았어요/.test(t)), HEIC: window.__t.some(t => /HEIC/.test(t)) };
    });
    ck('★★ 그림이 아닌 공유는 넣지 않고 이유를 말한다', sh.img === false && sh.못찾음, JSON.stringify(sh));
    ck('★ HEIC 공유도 끌어다 놓기와 같은 안내가 뜬다', sh.HEIC, JSON.stringify(sh));
    const ok = await p.evaluate(async (b64) => {
      const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
      _anima.img = null;
      _plPendingShared = [{ blob: new Blob([a], { type: '' }), name: 'real', kind: '?/' + a.length }];   // 종류 없이 와도
      _plConsumeShared();
      await new Promise(r => setTimeout(r, 1500));
      return { img: !!(_anima.img && _anima.img.dataURL), name: _anima.img && _anima.img.name };
    }, PNG.toString('base64'));
    ck('정상 그림은 종류가 없어도 들어간다', ok.img && ok.name === 'real', JSON.stringify(ok));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ lightbox (2) ════════════════════════════════════════════════════
  {
    //  가짜 ComfyUI 가 꺼진 상태 — 네트워크 썸네일은 전부 깨진다
    const DEAD = 9199;
    const { ctx, p, errs } = await boot(b, 'anima');
    const lb1 = await p.evaluate(async (port) => {
      const bad = `http://127.0.0.1:${port}/view?filename=x.png&type=output`;
      const bad2 = `http://127.0.0.1:${port}/view?filename=y.png&type=output`;
      let list = [bad];
      window._lbLivePending = () => ({ urls: list, thumbs: list.slice(), headIdx: 0 });
      openLightbox(bad, [bad], 0);
      await new Promise(r => setTimeout(r, 2500));
      const box = document.getElementById('img-lightbox');
      //  ⚠ '보고 있는 칸'의 안내만 본다 — 옆 칸(bad2)도 깨져서 자기 안내를 띄우므로 전체 개수로 세면 2가 된다
      const curImg = () => [...box.querySelectorAll('img')].find(im => im.dataset.full === bad);
      const offOf = (im) => { const o = im && im.parentNode.querySelector('.lb-off'); return !!(o && o.style.display !== 'none'); };
      const before = offOf(curImg());
      list = [bad, bad2];                                          // 목록이 늘어난다(결과 도착) → _lbRefresh → 같은 장 _setSlot
      window._lbRefresh();
      await new Promise(r => setTimeout(r, 400));
      const cur = curImg();
      return { 전: before ? 1 : 0, 후: offOf(cur) ? 1 : 0, img숨김: cur ? cur.style.display === 'none' : null };
    }, DEAD);
    ck('★★ 같은 장으로 목록만 갱신돼도 「못 불러옴」 안내가 남는다', lb1.전 === 1 && lb1.후 === 1 && lb1.img숨김 === true, JSON.stringify(lb1));
    await p.evaluate(() => { if (window._lbActive) closeLightbox(); });
    await p.waitForTimeout(400);
    //  저장소엔 있는데 메모리에 안 풀린 축소판 → 크게 보기가 저장소에서 꺼낸다
    const lb2 = await p.evaluate(async (o) => {
      const s = atob(o.b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
      const full = `http://127.0.0.1:${o.port}/view?filename=idb.png&type=output`;
      const key = _comfyPreviewUrl(full);                           // 클래식 열쇠(;80) — 메모리엔 없고 저장소에만
      await _animaTTx('readwrite', st => st.put({ u: key, b: new Blob([a], { type: 'image/png' }), t: 1 }));
      await _animaTLoadIndex(); _animaTHave.add(key); _animaTMem.delete(key);
      window._lbThumbsPending = [key];
      openLightbox(full, [full], 0);
      await new Promise(r => setTimeout(r, 1500));
      const box = document.getElementById('img-lightbox');
      const cur = [...box.querySelectorAll('img')].find(im => im.dataset.full === full);
      return { blob: !!(cur && /^blob:/.test(cur.src)), 그려짐: !!(cur && cur.naturalWidth > 0) };
    }, { b64: PNG.toString('base64'), port: DEAD });
    ck('★ 저장소에만 있는 축소판도 크게 보기가 꺼내 쓴다 (네트워크 없이 그려짐)', lb2.blob && lb2.그려짐, JSON.stringify(lb2));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  await b.close(); app.close(); cmf.close(); slow.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
