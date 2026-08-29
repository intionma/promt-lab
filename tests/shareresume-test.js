// 공유로 돌아왔을 때 '크게 보기'가 되살아나는가 (v9.176.0 — 사용자 신고)
//  ★ 사용자 작업 흐름: 결과를 크게 본 채로 → 다른 앱에서 이미지 공유 → 프롬프트 랩으로 돌아옴.
//    안드로이드 공유는 POST 내비게이션이라 서비스워커가 303 으로 돌려보낸다 = **진짜 새 문서**다.
//    그래서 크게 보기가 사라지고 목록 맨 위로 돌아왔다("보고 있는 화면이 바뀐다").
//  ★ 새로고침 자체는 못 없앤다 → '보이는 것'을 되돌려 티가 안 나게 하는 게 이 검사의 대상.
//  ★ 그리고 덤 하나: 보던 게 '제일 최신'이었으면 머리 자리에 앉아, 공유 뒤 자동 생성으로 나온
//    새 결과가 **보고 있는 그 자리에 갈아끼워져야** 한다. 여기가 틀리면 "새 결과가 안 나온다"가 된다.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/promt-lab';
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };

const seed = (p, n, port) => p.evaluate(async ({ n, port }) => {
  window.showToast = () => {};
  const recs = [];
  //  k 가 클수록 최신. 목록은 최신이 맨 앞으로 온다.
  for (let i = 0; i < n; i++) recs.push({ k: i + 1, url: `http://127.0.0.1:${port}/pwa/icon-192.png?r=${i}`, seed: i, src: null, opt: 'r' + i });
  await _animaIdbAddMany(recs);
}, { n, port });

const lbState = (p) => p.evaluate(() => {
  const box = document.getElementById('img-lightbox');
  const open = !!box && box.style.display !== 'none';
  const cnt = document.getElementById('img-lightbox-counter');
  const cur = cnt ? cnt.querySelector('.odo-strip, .lb-odo-strip') : null;
  return { open, 보는주소: open ? (window._lbUrlsDbg || null) : null,
           번호: cur ? cur.children[1].textContent : null,
           총: cnt ? (cnt.querySelector('.lb-total') || {}).textContent : null };
});

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.addInitScript(() => { try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); } catch (e) {} });
  await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
  await seed(p, 8, port);
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && (_anima.results || []).length === 8, null, { timeout: 25000 });
  await p.waitForTimeout(700);

  // ── ① 결과 하나를 크게 본다 (제일 최신 = 맨 앞) ─────────────────────
  const opened = await p.evaluate(() => { _animaOpenLbAt(0, false); return !!window._lbActive; });
  ck('크게 보기가 열린다', opened);
  const seen0 = await p.evaluate(() => _anima.results[0].k);

  // ── ② 다른 앱으로 넘어간다 (visibilitychange: hidden) ────────────────
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
                           document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(200);
  const saved = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('anima_lb_resume_v1') || 'null'); } catch (e) { return null; } });
  ck('★ 앱을 벗어날 때 보던 자리를 적어 둔다', !!saved && saved.k === seen0 && saved.head === true, JSON.stringify(saved));

  // ── ③ 공유로 돌아온다 (= 새 문서. sw 가 ?shared=1 로 돌려보내는 그것) ─
  await p.goto('http://127.0.0.1:' + port + '/index.html?shared=1', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && (_anima.results || []).length === 8, null, { timeout: 25000 });
  await p.waitForTimeout(1600);
  const back = await p.evaluate(() => {
    const box = document.getElementById('img-lightbox');
    return { open: !!box && box.style.display !== 'none', 보던것: window._lbActive ? _anima.results[_animaResSel].k : null };
  });
  ck('★ 공유로 돌아오면 크게 보기가 되살아난다', back.open === true, JSON.stringify(back));
  ck('★ 보던 바로 그 결과가 열린다', back.보던것 === seen0, `${back.보던것} vs ${seen0}`);

  // ── ④ 이어서 나온 새 결과가 '보고 있는 그 자리'에 들어온다 ───────────
  //   (공유 뒤 자동 생성으로 결과가 하나 늘어나는 상황을 그대로 만든다)
  //   ★ 창이 열려 있는지만 보면 안 된다 — '지금 화면에 그려진 그림'이 새것으로 바뀌었는지 봐야 한다.
  //     (가운데 슬롯 = 지금 보는 칸. 여기가 안 바뀌면 "새 결과가 안 나온다"는 그 증상이다)
  const midSrc = () => p.evaluate(() => {
    const t = document.getElementById('img-lightbox-track');
    const im = t ? t.querySelectorAll('img') : [];
    return im.length > 1 ? (im[1].getAttribute('src') || '') : '';
  });
  const srcBefore = await midSrc();
  const swap = await p.evaluate(async () => {
    const newUrl = _anima.results[0].url.replace(/r=\d+/, 'r=999');
    _anima.results.unshift({ k: 999, url: newUrl, seed: 99, src: null, opt: '새것' });
    if (typeof _lbRefresh === 'function') _lbRefresh(); else window._lbRefresh && window._lbRefresh();
    await new Promise(r => setTimeout(r, 600));
    const cnt = document.getElementById('img-lightbox-counter');
    return { newUrl, 총: cnt ? (cnt.querySelector('.lb-total') || {}).textContent.trim() : null,
             열림: document.getElementById('img-lightbox').style.display !== 'none' };
  });
  const srcAfter = await midSrc();
  ck('새 결과가 와도 크게 보기가 닫히지 않는다', swap.열림 === true, JSON.stringify(swap));
  ck('총 장수가 9로 갱신된다', /9/.test(swap.총 || ''), String(swap.총));
  ck('★ 새 결과가 보고 있던 그 자리에 갈아끼워진다 (그림이 실제로 바뀐다)',
     srcAfter !== srcBefore && /r=999/.test(srcAfter), `전 ${srcBefore.slice(-24)} / 후 ${srcAfter.slice(-24)}`);

  // ── ④-2 화면 반반(멀티윈도우) — '앱을 벗어남' 신호가 안 와도 되살아나야 한다 ──
  //   ★ 사용자 실사용: 폴드8을 반반으로 나눠 오른쪽에 프롬프트 랩(크게 보기), 왼쪽에 갤러리를 띄우고
  //     거기서 공유한다. 이때 프롬프트 랩은 계속 '보이는' 상태라 visibilitychange(hidden) 가 안 온다.
  //     예전엔 그 신호에서만 자리를 적어서, 이 경우 되살릴 게 아무것도 없었다.
  {
    await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof _anima !== 'undefined' && (_anima.results || []).length > 0, null, { timeout: 25000 });
    await p.waitForTimeout(900);
    await p.evaluate(() => { try { localStorage.removeItem('anima_lb_resume_v1'); } catch (e) {} });
    const k = await p.evaluate(() => { _animaOpenLbAt(0, false); return _anima.results[0].k; });
    await p.waitForTimeout(600);
    const saved2 = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('anima_lb_resume_v1') || 'null'); } catch (e) { return null; } });
    ck('★ 앱을 벗어나지 않아도 크게 보기를 열면 바로 적어 둔다 (멀티윈도우 대비)',
       !!saved2 && saved2.k === k, JSON.stringify(saved2));
    //  '벗어남' 신호를 일부러 안 보내고 곧장 공유로 들어온다
    await p.goto('http://127.0.0.1:' + port + '/index.html?shared=1', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof _anima !== 'undefined' && (_anima.results || []).length > 0, null, { timeout: 25000 });
    await p.waitForTimeout(1600);
    const back2 = await p.evaluate(() => {
      const box = document.getElementById('img-lightbox');
      return { open: !!box && box.style.display !== 'none', k: window._lbActive ? _anima.results[_animaResSel].k : null };
    });
    ck('★ 멀티윈도우에서 공유해도 크게 보기가 되살아난다', back2.open === true && back2.k === k, JSON.stringify(back2));
    await p.evaluate(() => { if (window.closeLightbox) closeLightbox(); });
    await p.waitForTimeout(400);
  }

  // ── ⑤ 크게 보기를 안 켜고 나가면 되살리지 않는다 (엉뚱하게 안 열려야) ─
  await p.evaluate(() => { if (window.closeLightbox) closeLightbox(); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
                           document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(200);
  const cleared = await p.evaluate(() => localStorage.getItem('anima_lb_resume_v1'));
  ck('★ 크게 보기를 닫고 나가면 적어 둔 것을 지운다', cleared === null, String(cleared));
  await p.goto('http://127.0.0.1:' + port + '/index.html?shared=1', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && (_anima.results || []).length > 0, null, { timeout: 25000 });
  await p.waitForTimeout(1500);
  const noOpen = await p.evaluate(() => { const b = document.getElementById('img-lightbox'); return !!b && b.style.display !== 'none'; });
  ck('★ 그 경우엔 공유로 들어와도 크게 보기가 안 열린다', noOpen === false, String(noOpen));

  // ── ⑥ 평소(공유 아님) 진입에는 되살리지 않는다 ───────────────────────
  await p.evaluate(() => { _animaOpenLbAt(0, false); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
                           document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(200);
  await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _anima !== 'undefined' && (_anima.results || []).length > 0, null, { timeout: 25000 });
  await p.waitForTimeout(1400);
  const plain = await p.evaluate(() => { const b = document.getElementById('img-lightbox'); return !!b && b.style.display !== 'none'; });
  ck('★ 그냥 앱을 열면 크게 보기가 저절로 열리지 않는다', plain === false, String(plain));

  ck('오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
