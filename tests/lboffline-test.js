// ComfyUI 가 꺼져 있어도 크게 보기가 보인다 (v9.196.0 — 사용자 신고)
//  ★ 신고: "ComfyUI 랑 연결 안 되어 있으면 클릭했을 때 깨진 이미지 표시만 뜬다."
//  ★ 원인: 갤러리 격자는 _animaThumbSrc(캐시 우선)를 쓰는데 **크게 보기만** _animaPreviewUrl
//    (네트워크 전용)을 넘기고 있었다. 그래서 "목록은 보이는데 누르면 깨진다"가 됐다.
//  ⚠ 이 검사는 **가짜 ComfyUI 를 실제로 죽인다.** 연결이 살아 있는 채로는 절대 재현되지 않는다.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const APP = 9171, CMF = 9172;
const appSrv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join('/home/user/promt-lab', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
//  가짜 ComfyUI — /view 로 그림을 준다. 나중에 통째로 죽여 '연결 끊김'을 만든다.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAJklEQVR42u3OMQEAAAgDoC251a3gL2SgeVsXAAAAAAAAAAAAAOBvA0d9AAGvXCJ9AAAAAElFTkSuQmCC', 'base64');
let cmfHits = 0;
const cmfSrv = http.createServer((q, r) => {
  cmfHits++;
  r.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' });
  r.end(PNG);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };

const VIEW = (name) => `http://127.0.0.1:${CMF}/view?filename=${name}.png&type=output`;

(async () => {
  await new Promise(r => appSrv.listen(APP, r));
  await new Promise(r => cmfSrv.listen(CMF, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${APP}/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.showToast = () => {}; });

  // ── 결과 3장을 넣고 캐시가 채워지길 기다린다 (연결이 살아 있는 동안) ──
  await p.evaluate(async (urls) => {
    const recs = urls.map((u, i) => ({ k: i + 1, url: u, seed: 100 + i, src: null, opt: 'r' + i }));
    await _animaIdbAddMany(recs);
    _anima.results = recs; _animaResSel = 0; _animaRenderResult();
  }, [VIEW('a'), VIEW('b'), VIEW('c')]);
  //  ⚠ 캐시는 **갤러리에서 실제로 화면에 들어온 그림만** 채워진다(IntersectionObserver).
  //    검사에서 갤러리가 화면 아래 있으면 한 장도 안 받아 전제가 통째로 안 만들어진다
  //    (처음에 그렇게 0장으로 헛실패했다). 격자를 화면 안으로 끌어와야 한다.
  await p.evaluate(() => {
    const g = document.querySelector('#anima-result .anima-gal');
    if (g) g.scrollIntoView({ block: 'center' });
  });
  await p.waitForTimeout(500);
  //  캐시 채우기는 뒤에서 한 장씩 돈다 → '몇 장 들어왔는지'를 보고 기다린다(고정 시간 금지).
  //  ⚠⚠ `window._animaTHave` 로 보면 안 된다 — 최상위 `let` 이라 **window 에 없다.**
  //     그러면 조건이 영원히 거짓이라 '캐시 0장'으로 헛실패하고, 멀쩡한 코드를 의심하게 된다
  //     (실제로 그렇게 두 번 헛짚었다 — recroll-test 의 '정의됐는가 vs 채워졌는가'와 같은 부류).
  //     **IndexedDB 를 직접 센다.** 그게 유일한 근거다.
  const cached = await p.waitForFunction(async () => {
    try { const ks = await _animaTTx('readonly', st => st.getAllKeys()); return (ks && ks.length >= 3) ? ks.length : false; }
    catch (e) { return false; }
  }, null, { timeout: 25000 }).then(h => h.jsonValue()).catch(() => 0);
  ck('연결이 살아 있는 동안 썸네일이 캐시에 들어간다', cached >= 3, `${cached}장`);

  // ── ★ 여기서 ComfyUI 를 죽인다 ──────────────────────────────
  await new Promise(r => cmfSrv.close(r));
  await p.waitForTimeout(400);
  const before = cmfHits;

  //  크게 보기를 연다
  await p.evaluate(() => _animaOpenLbAt(0, true));
  await p.waitForTimeout(1800);
  const st = await p.evaluate(() => {
    const box = document.getElementById('img-lightbox');
    const imgs = [...box.querySelectorAll('img')];
    let cur = null;
    imgs.forEach(im => { const r = im.getBoundingClientRect(); if (r.width > 0 && r.left < innerWidth / 2 && r.right > innerWidth / 2) cur = im; });
    const off = cur && cur.parentNode.querySelector('.lb-off');
    return {
      열림: !!window._lbActive,
      보임: !!cur,
      그려짐: !!(cur && cur.naturalWidth > 0),
      주소종류: cur ? (/^blob:/.test(cur.src) ? 'blob(캐시)' : (/127\.0\.0\.1/.test(cur.src) ? '네트워크' : cur.src.slice(0, 20))) : null,
      안내떴나: !!(off && off.style.display !== 'none'),
    };
  });
  ck('연결이 끊겨도 크게 보기는 열린다', st.열림 === true, JSON.stringify(st));
  ck('★★ 깨진 이미지가 아니라 그림이 실제로 그려진다', st.그려짐 === true, JSON.stringify(st));
  ck('★★ 캐시(blob) 주소를 쓴다 — 네트워크를 안 탄다', st.주소종류 === 'blob(캐시)', String(st.주소종류));
  ck('★ 캐시로 보이니 "못 불러옴" 안내는 안 뜬다', st.안내떴나 === false, JSON.stringify(st));
  ck('★ 서버가 죽었는데 요청을 더 보내지 않는다', cmfHits === before, `${cmfHits - before}건 더 나감`);

  //  좌우로 넘겨도 계속 보인다
  await p.evaluate(() => { const n = document.getElementById('lb-btn-next'); if (n) n.click(); });
  await p.waitForTimeout(1200);
  const st2 = await p.evaluate(() => {
    const box = document.getElementById('img-lightbox');
    let cur = null;
    [...box.querySelectorAll('img')].forEach(im => { const r = im.getBoundingClientRect(); if (r.width > 0 && r.left < innerWidth / 2 && r.right > innerWidth / 2) cur = im; });
    return { idx: _lbIdx, 그려짐: !!(cur && cur.naturalWidth > 0) };
  });
  ck('★ 넘겨도 계속 보인다', st2.그려짐 === true, JSON.stringify(st2));

  // ── 캐시에 아예 없는 그림 → 깨진 아이콘 대신 안내가 떠야 한다 ──
  await p.evaluate(async (u) => {
    const rec = { k: 99, url: u, seed: 999, src: null, opt: '없던것' };
    await _animaIdbAddMany([rec]);
    _anima.results = [rec]; _animaResSel = 0; _animaRenderResult();
  }, VIEW('never-cached'));
  await p.waitForTimeout(700);
  await p.evaluate(() => _animaOpenLbAt(0, true));
  await p.waitForTimeout(2500);
  const st3 = await p.evaluate(() => {
    const box = document.getElementById('img-lightbox');
    let cur = null;
    [...box.querySelectorAll('img')].forEach(im => { const r = im.getBoundingClientRect(); if (r.width > 0 && r.left < innerWidth / 2 && r.right > innerWidth / 2) cur = im; });
    const offs = [...box.querySelectorAll('.lb-off')].filter(o => o.style.display !== 'none');
    return { 안내떴나: offs.length > 0, 안내글: offs[0] ? offs[0].textContent : '', 깨진채남았나: !!(cur && cur.naturalWidth === 0 && cur.style.display !== 'none') };
  });
  ck('★★ 캐시에 없으면 깨진 아이콘 대신 안내가 뜬다', st3.안내떴나 === true, JSON.stringify(st3));
  ck('★ 안내가 이유를 말한다 (ComfyUI 가 꺼져 있다)', /ComfyUI/.test(st3.안내글), st3.안내글.slice(0, 60));
  ck('★ 깨진 이미지가 그대로 남지 않는다', st3.깨진채남았나 === false, JSON.stringify(st3));

  ck('오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); appSrv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
