// 클래식·스튜디오 갤러리도 썸네일 캐시를 쓴다 (v9.197.0 — 사용자 요청)
//  ★ 배경: v9.173.0 의 캐시는 Anima 에만 걸려 있었다. 클래식/스튜디오는 갤러리 탭을 열 때마다
//    최대 200장을 PC 에 다시 물어봤고(preview=webp 라 PC 가 매번 새로 굽는다),
//    ComfyUI 가 꺼지면 목록이 통째로 깨졌다.
//  ⚠ 요청 수로 판정하므로 **가짜 ComfyUI 의 /view 히트를 직접 센다.** 그게 유일한 근거다.
//  ⚠ 캐시는 화면에 들어온 칸만 채워진다(IntersectionObserver) → 갤러리 탭을 실제로 열어야 한다.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const APP = 9271, CMF = 9272;
const appSrv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join('/home/user/promt-lab', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
// 64x64 PNG (검사에서 비율 3/4 기본값과 다르게 정사각 — '비율을 기억하는가'도 같이 본다)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAJklEQVR42u3OMQEAAAgDoC251a3gL2SgeVsXAAAAAAAAAAAAAOBvA0d9AAGvXCJ9AAAAAElFTkSuQmCC', 'base64');
let hits = [];
const cmfSrv = http.createServer((q, r) => {
  hits.push(q.url);
  r.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' });
  r.end(PNG);
});
//  ⚠ 위 서버는 '연결 끊김' 검사에서 죽인다 → 「빠르게 생성」 검사용으로 하나 더 띄운다.
const CMF2 = 9273;
let hits2 = [];
const cmf2 = http.createServer((q, r) => {
  hits2.push(q.url);
  r.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' });
  r.end(PNG);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };

const N = 12;
const VIEW = (i) => `http://127.0.0.1:${CMF}/view?filename=g${i}.png&subfolder=&type=output`;
const URLS = Array.from({ length: N }, (_, i) => VIEW(i));
const MG = Array.from({ length: 6 }, (_, i) => `http://127.0.0.1:${CMF2}/view?filename=m${i}.png&subfolder=&type=temp`);

async function boot(ctx) {
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${APP}/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof renderImageGallery === 'function' && typeof _plLazyObserve === 'function', null, { timeout: 30000 });
  await p.evaluate(() => { window.showToast = () => {}; });
  return { p, errs };
}
//  갤러리 탭을 실제로 열고 격자를 화면 안으로 끌어온다(관찰자가 도는 전제).
async function openGallery(p) {
  await p.evaluate(() => { switchResultTab('gallery'); renderImageGallery(); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { const g = document.getElementById('result-gallery-grid'); if (g) g.scrollIntoView({ block: 'center' }); });
}
//  '다 받았는가' 는 시간이 아니라 상태로 기다린다.
async function waitLoaded(p, want) {
  return p.waitForFunction((w) => {
    const g = document.getElementById('result-gallery-grid'); if (!g) return false;
    return [...g.querySelectorAll('img')].filter(i => i.naturalWidth > 0).length >= w;
  }, want, { timeout: 25000 }).then(() => true).catch(() => false);
}

(async () => {
  await new Promise(r => appSrv.listen(APP, r));
  await new Promise(r => cmfSrv.listen(CMF, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  //  ⚠ addInitScript 는 새로고침마다 다시 심긴다 → 앱이 저장한 값을 되돌려 가짜 실패가 난다.
  //    sessionStorage 플래그로 **첫 진입에만** 심는다(persona 검사에서 겪은 그 함정).
  await ctx.addInitScript((seed) => {
    try {
      if (sessionStorage.getItem('_seeded')) return;
      sessionStorage.setItem('_seeded', '1');
      localStorage.setItem('pl_layout', 'studio');
      localStorage.setItem('adult_optin_v1', '1');
      localStorage.setItem('comfy_gallery_urls_v1', JSON.stringify(seed));
      const meta = {}; seed.forEach((u, i) => meta[u] = { sec: 1.5, pos: 'a', neg: 'b', seed: i });
      localStorage.setItem('comfy_gallery_meta_v1', JSON.stringify(meta));
    } catch (e) {}
  }, URLS);

  // ══ 1회차 — 장당 1건이어야 한다 ═══════════════════════════════════
  let { p, errs } = await boot(ctx);
  hits = [];
  await openGallery(p);
  const ok1 = await waitLoaded(p, N);
  const h1 = hits.filter(u => /\/view\?/.test(u));
  ck('첫 방문에 12장이 다 그려진다', ok1 === true, `${h1.length}건 요청`);
  ck('★★ 장당 딱 1건만 나간다', h1.length === N, `${h1.length}건 (기대 ${N})`);
  const dup = h1.length - new Set(h1).size;
  ck('★ 같은 그림을 두 번 받지 않는다', dup === 0, `${dup}건 중복`);
  ck('★ 축소판 주소로 받는다 (preview=webp)', h1.every(u => /preview=webp/.test(u)), h1[0] || '');

  //  주소가 blob 이어야 한다 = 네트워크를 안 타고 캐시에서 나온다
  const srcKind = await p.evaluate(() => {
    const g = document.getElementById('result-gallery-grid');
    const im = [...g.querySelectorAll('img')];
    return { blob: im.filter(i => /^blob:/.test(i.src)).length, all: im.length };
  });
  ck('★ 받은 그림은 blob(캐시)으로 걸린다', srcKind.blob === N, JSON.stringify(srcKind));

  // ── 기능이 아직 되는가 (성능 고치다 조용히 빠뜨린 전례가 있다) ──
  const feat = await p.evaluate(() => {
    const g = document.getElementById('result-gallery-grid');
    const cells = [...g.children];
    return {
      칸수: cells.length,
      삭제버튼: g.querySelectorAll('.gallery-del-btn').length,
      풀주소: [...g.querySelectorAll('img')].filter(i => i.dataset.full && /\/view\?/.test(i.dataset.full)).length,
      프롬프트: [...g.querySelectorAll('img')].filter(i => i.dataset.pos).length,
      시간배지: g.querySelectorAll('span').length,
    };
  });
  ck('칸 수가 맞다', feat.칸수 === N, JSON.stringify(feat));
  ck('★ ✕(삭제) 버튼이 그대로 있다', feat.삭제버튼 === N, JSON.stringify(feat));
  ck('★ 크게 보기용 원본 주소(data-full)가 있다', feat.풀주소 === N, JSON.stringify(feat));
  ck('★ 「태그 불러오기」용 프롬프트가 그대로 붙어 있다', feat.프롬프트 === N, JSON.stringify(feat));

  // ── 목록이 안 밀린다 — 그리는 동안 격자 높이가 자라면 안 된다 ──
  //   (칸이 aspect-ratio 로 자리를 먼저 잡는지 본다)
  const { p: p2, errs: e2 } = await boot(ctx);
  await p2.evaluate(() => { switchResultTab('gallery'); renderImageGallery(); });
  await p2.waitForTimeout(120);
  const hBefore = await p2.evaluate(() => document.getElementById('result-gallery-grid').getBoundingClientRect().height);
  await p2.evaluate(() => { const g = document.getElementById('result-gallery-grid'); if (g) g.scrollIntoView({ block: 'center' }); });
  await waitLoaded(p2, N);
  const hAfter = await p2.evaluate(() => document.getElementById('result-gallery-grid').getBoundingClientRect().height);
  ck('★★ 그리는 동안 목록이 안 밀린다 (높이 불변)', hBefore > 0 && Math.abs(hAfter - hBefore) < 4, `${hBefore} → ${hAfter}`);
  await p2.close();

  // ══ 2회차 — 새로고침해도 요청 0건 ═══════════════════════════════
  hits = [];
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof renderImageGallery === 'function', null, { timeout: 30000 });
  await p.evaluate(() => { window.showToast = () => {}; });
  await openGallery(p);
  const ok2 = await waitLoaded(p, N);
  const h2 = hits.filter(u => /\/view\?/.test(u));
  ck('두 번째 방문에도 12장이 다 보인다', ok2 === true, `${h2.length}건`);
  ck('★★ 두 번째 방문 요청 0건', h2.length === 0, `${h2.length}건 나감`);

  // ── 크게 보기 — 아직 안 받은 칸도 목록에 들어가야 한다 ──
  const lb = await p.evaluate(() => {
    const g = document.getElementById('result-gallery-grid');
    const first = g.querySelector('img');
    openLightboxFromEl(first);
    return { total: _lbUrls.length, idx: _lbIdx, 첫주소: _lbUrls[0] };
  });
  ck('★ 크게 보기 목록에 12장이 전부 들어간다', lb.total === N, JSON.stringify(lb));
  ck('★ 크게 보기는 원본 주소를 쓴다 (blob 아님)', /\/view\?/.test(lb.첫주소 || '') && !/^blob:/.test(lb.첫주소 || ''), String(lb.첫주소).slice(0, 50));
  await p.evaluate(() => { if (window._lbActive) closeLightbox(); });
  await p.waitForTimeout(300);

  // ══ ComfyUI 를 죽이고 새로고침 — 그래도 보여야 한다 ═══════════════
  await new Promise(r => cmfSrv.close(r));
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof renderImageGallery === 'function', null, { timeout: 30000 });
  await p.evaluate(() => { window.showToast = () => {}; });
  await openGallery(p);
  const okOff = await waitLoaded(p, N);
  ck('★★ ComfyUI 가 꺼져 있어도 갤러리가 보인다', okOff === true, '한 장도 안 뜸');
  const lbOff = await p.evaluate(async () => {
    const g = document.getElementById('result-gallery-grid');
    openLightboxFromEl(g.querySelector('img'));
    await new Promise(r => setTimeout(r, 1600));
    const box = document.getElementById('img-lightbox');
    let cur = null;
    [...box.querySelectorAll('img')].forEach(im => { const r = im.getBoundingClientRect(); if (r.width > 0 && r.left < innerWidth / 2 && r.right > innerWidth / 2) cur = im; });
    return { 그려짐: !!(cur && cur.naturalWidth > 0), blob: !!(cur && /^blob:/.test(cur.src)) };
  });
  ck('★★ 연결이 끊겨도 크게 보기가 그려진다', lbOff.그려짐 === true, JSON.stringify(lbOff));
  ck('★ 크게 보기도 캐시(blob)를 쓴다', lbOff.blob === true, JSON.stringify(lbOff));

  // ══ 「빠르게 생성」 격자 — 새 그림이 올 때마다 통째로 다시 그린다 ═════
  //   예전엔 다시 그릴 때마다 이미 받은 것까지 전부 다시 받았다(50장이면 1275건).
  //   ⚠ 여기 그림은 temp 라 저장소에 넣으면 안 된다 → 메모리에만 두는지도 함께 본다.
  await new Promise(r => cmf2.listen(CMF2, r));
  const { p: p3, errs: e3 } = await boot(ctx);
  hits2 = [];
  const mgBefore = await p3.evaluate(async (u2) => {
    const before = await _animaTTx('readonly', st => st.getAllKeys()).then(k => (k || []).length).catch(() => -1);
    _mgImages = u2.map((u, i) => ({ url: u, seed: i }));
    const mo = document.getElementById('multigen-modal'); if (mo) mo.style.display = 'flex';
    return before;
  }, MG);
  //  세 번 다시 그린다(그림 3장이 차례로 도착한 셈)
  for (let i = 0; i < 3; i++) {
    await p3.evaluate(() => { _mgRenderGrid(); const g = document.getElementById('mg-grid'); if (g) g.scrollIntoView({ block: 'center' }); });
    await p3.waitForTimeout(900);
  }
  await p3.waitForFunction((w) => {
    const g = document.getElementById('mg-grid'); if (!g) return false;
    return [...g.querySelectorAll('img')].filter(i => i.naturalWidth > 0).length >= w;
  }, MG.length, { timeout: 20000 }).catch(() => {});
  const hm = hits2.filter(u => /\/view\?/.test(u));
  ck('★★ 세 번 다시 그려도 장당 1건 (예전엔 그릴 때마다 전부 다시 받았다)', hm.length === MG.length, `${hm.length}건 (기대 ${MG.length})`);
  const mgAfter = await p3.evaluate(() => _animaTTx('readonly', st => st.getAllKeys()).then(k => (k || []).length).catch(() => -1));
  ck('★ temp 미리보기는 저장소에 안 쌓인다 (메모리에만)', mgAfter === mgBefore, `${mgBefore} → ${mgAfter}`);
  const mgBlob = await p3.evaluate(() => {
    const g = document.getElementById('mg-grid');
    const im = [...g.querySelectorAll('img')];
    return { blob: im.filter(i => /^blob:/.test(i.src)).length, all: im.length };
  });
  ck('★ 두 번째부터는 메모리 blob 을 쓴다', mgBlob.blob === MG.length, JSON.stringify(mgBlob));
  //  ⚠⚠ temp blob 은 저장소를 안 타므로 _animaTTrim 이 못 거둔다 — 아무도 안 놓아 주면 영영 남는다.
  //    「빠르게 생성」은 돌릴 때마다 새 temp 주소라 실측에서 12장 × 5회 = 60개가 쌓였고
  //    창을 닫아도 안 줄었다(v9.199.0에서 잡음). 목록에 없는 것만 거둔다.
  const grow = [];
  for (let run = 0; run < 3; run++) {
    await p3.evaluate(async (o) => {
      _mgImages = Array.from({ length: 6 }, (_, i) => ({ url: `http://127.0.0.1:${o.port}/view?filename=run${o.run}_x${i}.png&subfolder=&type=temp`, seed: i }));
      _mgRenderGrid();
      document.getElementById('mg-grid').scrollIntoView({ block: 'center' });
      await new Promise(r => setTimeout(r, 1400));
    }, { run, port: CMF2 });
    //  ⚠ _animaTMem 전체를 세면 안 된다 — 거기엔 **갤러리의 영구 캐시**도 함께 들어 있어
    //    (부팅 때 _animaTWarmMany 가 풀어 둔다) 0 이 될 수가 없다. 실제로 그렇게 헛실패했다.
    //    거둬야 하는 대상은 _plMemOnly 뿐이므로 그것만 센다.
    grow.push(await p3.evaluate(() => ({ temp: _plMemOnly.size, 전체: _animaTMem.size })));
  }
  ck('★★ 여러 번 돌려도 메모리 blob 이 안 쌓인다', grow[0].temp === grow[2].temp && grow[2].temp === 6, JSON.stringify(grow));
  await p3.evaluate(async () => { _mgImages = []; _mgSelected.clear(); _mgRenderGrid(); await new Promise(r => setTimeout(r, 400)); });
  const emptied = await p3.evaluate(() => ({ temp: _plMemOnly.size, 전체: _animaTMem.size }));
  ck('★★ 결과를 비우면 전부 놓아 준다', emptied.temp === 0, `${JSON.stringify(grow[2])} → ${JSON.stringify(emptied)}`);
  ck('★ 그러면서 갤러리의 영구 캐시는 안 건드린다', emptied.전체 === grow[2].전체 - grow[2].temp, `${grow[2].전체} → ${emptied.전체}`);
  await p3.close();

  // ══ 갤러리 ✕ 는 되돌릴 수 있어야 한다 (v9.199.0) ═════════════════
  //   Anima 는 「🗑 정리」 모드에 들어가야 ✕ 가 보이는데, 여기 ✕ 는 손가락 기기에서 늘 떠 있다
  //   → 크게 보려다 잘못 눌러 한 번에 사라진다(v9.181.0 에서 사용자가 당했던 그 부류).
  const ctxP = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctxP.addInitScript((seed) => {
    try {
      if (sessionStorage.getItem('_seeded')) return;
      sessionStorage.setItem('_seeded', '1');
      localStorage.setItem('pl_layout', 'studio');
      localStorage.setItem('adult_optin_v1', '1');
      localStorage.setItem('comfy_gallery_urls_v1', JSON.stringify(seed));
      const m = {}; seed.forEach((u, i) => m[u] = { sec: 1 + i, pos: 'pos' + i, neg: 'neg' + i, seed: 9000 + i });
      localStorage.setItem('comfy_gallery_meta_v1', JSON.stringify(m));
    } catch (e) {}
  }, URLS.slice(0, 5));
  const p4 = await ctxP.newPage();
  const e4 = []; p4.on('pageerror', x => e4.push(x.message));
  await p4.goto(`http://127.0.0.1:${APP}/index.html`, { waitUntil: 'load' });
  await p4.waitForFunction(() => typeof renderImageGallery === 'function', null, { timeout: 30000 });
  await p4.evaluate(() => { switchResultTab('gallery'); renderImageGallery(); });
  await p4.waitForTimeout(600);
  const was = await p4.evaluate(() => ({ urls: _galleryUrls.slice(), meta: _galMeta(_galleryUrls[2]) }));
  await p4.evaluate(() => { document.querySelectorAll('#result-gallery-grid .gallery-del-btn')[2].click(); });
  await p4.waitForTimeout(600);
  const gone = await p4.evaluate(() => {
    const t = document.querySelector('#toast-container .toast');
    const a = t && t.querySelector('.toast-act');
    return { 남은수: _galleryUrls.length, 되돌리기: !!a, 삐짐: a ? a.getBoundingClientRect().right > innerWidth + 1 : null };
  });
  ck('★★ 지우면 「되돌리기」가 뜬다', gone.되돌리기 === true && gone.남은수 === 4, JSON.stringify(gone));
  ck('★ 되돌리기 버튼이 화면 밖으로 안 나간다', gone.삐짐 === false, JSON.stringify(gone));
  await p4.evaluate(() => { const a = document.querySelector('#toast-container .toast .toast-act'); if (a) { a.click(); a.click(); } });
  await p4.waitForTimeout(700);
  const back = await p4.evaluate(() => ({ urls: _galleryUrls.slice(), meta: _galMeta(_galleryUrls[2]), 중복: _galleryUrls.length - new Set(_galleryUrls).size }));
  ck('★★ 되돌리면 그 자리에 그대로 돌아온다', JSON.stringify(back.urls) === JSON.stringify(was.urls), JSON.stringify(back.urls.length) + ' vs ' + was.urls.length);
  ck('★★ 프롬프트·시드도 함께 살아난다', JSON.stringify(back.meta) === JSON.stringify(was.meta), JSON.stringify(back.meta));
  ck('★ 연타해도 두 번 들어가지 않는다', back.중복 === 0, `${back.중복}건 중복`);
  await p4.reload({ waitUntil: 'load' });
  await p4.waitForFunction(() => typeof renderImageGallery === 'function', null, { timeout: 30000 });
  await p4.waitForTimeout(600);
  const kept = await p4.evaluate(() => _galleryUrls.length);
  ck('★ 되돌린 것이 새로고침해도 남는다', kept === was.urls.length, `${kept} / ${was.urls.length}`);
  await ctxP.close();
  await new Promise(r => cmf2.close(r));

  ck('오류 없음', errs.length === 0 && e2.length === 0 && e3.length === 0 && e4.length === 0, [...errs, ...e2, ...e3, ...e4].slice(0, 3).join(' | '));
  await b.close(); appSrv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
