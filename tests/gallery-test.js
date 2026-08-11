// 갤러리 썸네일 — 서버를 몇 번 두드리는가 · 목록이 밀리지 않는가 · 기능이 그대로인가 (v9.173.0)
//  ★ 배경: 썸네일 주소엔 preview=webp 가 붙어 있어 ComfyUI 가 **요청받을 때마다 다시 굽는다.**
//    그림 만드는 그 PC 의 CPU 이고, 폰 원격(Tailscale)이면 회선까지 같이 먹는다.
//    v9.172.0 까지는 ① 같은 사진을 <img> 와 캐시용 fetch 가 **각각** 받아 두 번씩 나갔고
//    ② 캐시에 있어도 <img src=주소> 라 두 번째 방문에도 네트워크를 다시 탔다.
//  ★ 그래서 이 검사는 '빠른가'가 아니라 **서버를 몇 번 두드렸는가**를 센다(가짜 ComfyUI 로 실측).
//  ★ 그리고 성능 고치다 기능을 잃지 않았는지 함께 본다 —
//    실제로 이 판에서 **칸의 ✕(삭제) 버튼이 통째로 사라진 채** 검사에 안 걸린 적이 있다.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = '/home/user/promt-lab';
const N = 120;   // 결과 장수

let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };

// ── 가짜 사진 (96x128 PNG) ────────────────────────────────────────────
function mkPng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 3) & 255; raw[o + 1] = (y * 5) & 255; raw[o + 2] = 128;
  }
  const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = (b) => { let c = 0xFFFFFFFF; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (t, d) => { const b = Buffer.alloc(8 + d.length + 4); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8);
    b.writeUInt32BE(crc(Buffer.concat([Buffer.from(t), d])), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const IMG = mkPng(96, 128);

// ── 가짜 ComfyUI: /view 를 세고, webp 재인코딩 비용(30ms)을 흉내낸다 ──
const stat = { view: 0, byUrl: new Map(), peak: 0, cur: 0 };
let CORS = true;   // false 로 두면 CORS 차단 상황(= fetch 실패)을 재현한다
const comfy = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const H = CORS ? { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } : { 'Cache-Control': 'no-store' };
  if (u.pathname === '/view') {
    stat.view++; stat.cur++; stat.peak = Math.max(stat.peak, stat.cur);
    stat.byUrl.set(q.url, (stat.byUrl.get(q.url) || 0) + 1);
    setTimeout(() => { stat.cur--; r.writeHead(200, Object.assign({ 'content-type': 'image/png' }, H)); r.end(IMG); },
      u.searchParams.has('preview') ? 30 : 3);
    return;
  }
  r.writeHead(200, Object.assign({ 'content-type': 'application/json' }, H)); r.end('{}');
});
const app = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
const reset = () => { stat.view = 0; stat.byUrl.clear(); stat.peak = 0; stat.cur = 0; };

//  갤러리를 한 화면씩 천천히 내린다.
//  ★ 바닥으로 '점프'하면 중간 칸은 화면에 온 적이 없어 정상적으로 안 받는다 → 가짜 수치가 나온다.
const SCROLL = async (pg) => pg.evaluate(async () => {
  const root = document.querySelector('#anima-root') || document.scrollingElement;
  let last = -1;
  for (let i = 0; i < 60; i++) {
    root.scrollTop = Math.min(root.scrollTop + root.clientHeight * 0.9, root.scrollHeight);
    await new Promise(r => setTimeout(r, 260));
    if (root.scrollTop === last && root.scrollTop + root.clientHeight >= root.scrollHeight - 4) break;
    last = root.scrollTop;
  }
  await new Promise(r => setTimeout(r, 1200));
});

(async () => {
  const cport = await new Promise(r => comfy.listen(0, () => r(comfy.address().port)));
  const aport = await new Promise(r => app.listen(0, () => r(app.address().port)));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await ctx.addInitScript(() => { try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); } catch (e) {} });
  await pg.goto('http://127.0.0.1:' + aport + '/index.html', { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
  await pg.waitForTimeout(700);
  await pg.evaluate(async ({ n, c }) => {
    window.showToast = () => {};
    const recs = [];
    for (let i = 0; i < n; i++) recs.push({ k: i + 1, url: `http://127.0.0.1:${c}/view?filename=r${i}.png&type=output&subfolder=`, seed: i, src: null, opt: 'test' });
    await _animaIdbAddMany(recs);
  }, { n: N, c: cport });

  // ══ ① 첫 방문 — 캐시가 비어 있다 ═══════════════════════════════════
  reset();
  await pg.reload({ waitUntil: 'load' });
  await pg.waitForFunction(() => typeof _anima !== 'undefined' && (_anima.results || []).length > 0, null, { timeout: 25000 });
  //  ★ 목록이 밀리는지 본다: 스크롤 전에 보이는 칸의 자리를 적어 두고, 사진이 다 뜬 뒤 다시 잰다.
  const before = await pg.evaluate(() => [...document.querySelectorAll('.anima-gitem')].slice(0, 12)
    .map(e => Math.round(e.getBoundingClientRect().top)));
  //  ★ 아직 안 훑었을 때 몇 건이나 나갔는지 — '보이는 것만 받는가'는 여기서만 잴 수 있다.
  //    끝까지 훑고 나면 120칸이 전부 화면에 온 적이 있으므로 120건이 나가는 게 정상이다.
  await pg.waitForTimeout(2000);
  const idle = stat.view;
  await SCROLL(pg);
  const r1 = await pg.evaluate(() => {
    const im = [...document.querySelectorAll('.anima-gitem img')];
    return { 칸: im.length, 그려짐: im.filter(i => i.naturalWidth > 0).length,
             삭제버튼: document.querySelectorAll('.anima-gitem .anima-gx').length };
  });
  const dup1 = [...stat.byUrl.values()].filter(v => v > 1).length;
  console.log(`   [실측] 첫 방문: 열자마자 ${idle}건 → 끝까지 훑어 /view ${stat.view}건 · 그려진 칸 ${r1.그려짐}/${r1.칸} · 중복 ${dup1}건 · 동시 최대 ${stat.peak}건`);

  ck('★ 첫 방문 — 사진 한 장당 서버 요청은 한 번뿐 (예전엔 두 번)',
     stat.view <= r1.그려짐 + 6, `요청 ${stat.view}건 vs 그려진 칸 ${r1.그려짐}장`);
  ck('★ 같은 사진을 두 번 받지 않는다', dup1 <= 4, `${dup1}건 중복`);
  ck('★ 한꺼번에 몰아치지 않는다 (생성 요청을 굶기지 않게 동시 4건 제한)', stat.peak <= 5, `동시 최대 ${stat.peak}건`);
  //  ★ 열자마자 500장을 통째로 받아 오면 폰 원격에서 회선이 막힌다 — 화면 근처만 받아야 한다.
  ck('★ 열자마자 전부 받지 않는다 (화면 근처만)', idle < N / 2, `안 훑었는데 ${idle}건 / 전체 ${N}장`);
  ck('훑고 나면 사진이 실제로 떠 있다', r1.그려짐 >= 20, `${r1.그려짐}장`);

  // ★ 성능 고치다 기능을 잃지 않았는가 — 여기서 ✕ 버튼이 통째로 사라진 적이 있다
  ck('★ 칸마다 삭제(✕) 버튼이 그대로 있다', r1.삭제버튼 === r1.칸, `${r1.삭제버튼} / ${r1.칸}`);

  // ══ ② 목록이 밀리지 않는가 ═════════════════════════════════════════
  await pg.evaluate(() => { const r = document.querySelector('#anima-root') || document.scrollingElement; r.scrollTop = 0; });
  await pg.waitForTimeout(600);
  const after = await pg.evaluate(() => [...document.querySelectorAll('.anima-gitem')].slice(0, 12)
    .map(e => Math.round(e.getBoundingClientRect().top)));
  const moved = before.filter((v, i) => Math.abs(v - after[i]) > 2).length;
  ck('★ 사진이 늦게 떠도 칸이 안 밀린다 (누르려던 게 딴 게 되지 않음)', moved === 0,
     `${moved}칸 이동 · 전 ${before.slice(0,5)} / 후 ${after.slice(0,5)}`);

  // ══ ③ 두 번째 방문 — 캐시가 차 있다 ════════════════════════════════
  reset();
  await pg.reload({ waitUntil: 'load' });
  await pg.waitForFunction(() => typeof _anima !== 'undefined' && (_anima.results || []).length > 0, null, { timeout: 25000 });
  await SCROLL(pg);
  const r2 = await pg.evaluate(() => {
    const im = [...document.querySelectorAll('.anima-gitem img')].filter(i => i.getAttribute('src'));
    return { 그려짐: im.filter(i => i.naturalWidth > 0).length,
             캐시: im.filter(i => i.src.startsWith('blob:')).length,
             네트워크: im.filter(i => i.src.startsWith('http')).length };
  });
  console.log(`   [실측] 두 번째 방문: /view ${stat.view}건 · 캐시에서 ${r2.캐시}장 · 네트워크 ${r2.네트워크}장`);
  ck('★ 두 번째 방문엔 서버를 아예 안 두드린다', stat.view === 0, `${stat.view}건`);
  ck('★ 이미 받아 둔 사진은 전부 캐시에서 꺼낸다', r2.네트워크 === 0 && r2.캐시 > 0, `캐시 ${r2.캐시} / 네트워크 ${r2.네트워크}`);
  ck('두 번째 방문에도 사진이 제대로 뜬다', r2.그려짐 >= 20, `${r2.그려짐}장`);

  // ══ ④ 삭제가 실제로 되는가 (기능 무손상) ═══════════════════════════
  const del = await pg.evaluate(async () => {
    const n0 = _anima.results.length;
    _animaGalManage = true; _animaRenderResult();
    await new Promise(r => setTimeout(r, 400));
    const gx = document.querySelector('.anima-gitem .anima-gx');
    if (!gx) return { ok: false, why: '✕ 버튼이 없다' };
    gx.click();
    await new Promise(r => setTimeout(r, 500));
    return { ok: _anima.results.length === n0 - 1, n0, n1: _anima.results.length };
  });
  ck('★ 정리 모드에서 ✕ 로 한 장 지우기가 된다', del.ok, JSON.stringify(del));

  // ══ ⑤ CORS 가 막힌 환경 — 예전 방식으로 되돌아가야 한다 ════════════
  //   ★ fetch 는 CORS 를 타지만 <img src=…> 는 안 탄다. 그래서 캐시를 못 쓰는 환경에서도
  //     '사진이 아예 안 보이는' 일이 있으면 안 된다.
  CORS = false;
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const pg2 = await ctx2.newPage(); const e2 = []; pg2.on('pageerror', e => e2.push(e.message));
  await ctx2.addInitScript(() => { try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); } catch (e) {} });
  await pg2.goto('http://127.0.0.1:' + aport + '/index.html', { waitUntil: 'load' });
  await pg2.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 25000 });
  await pg2.evaluate(async ({ n, c }) => {
    window.showToast = () => {};
    const recs = [];
    for (let i = 0; i < n; i++) recs.push({ k: i + 1, url: `http://127.0.0.1:${c}/view?filename=x${i}.png&type=output&subfolder=`, seed: i, src: null, opt: 't' });
    await _animaIdbAddMany(recs);
  }, { n: 24, c: cport });
  await pg2.reload({ waitUntil: 'load' });
  await pg2.waitForFunction(() => typeof _anima !== 'undefined' && (_anima.results || []).length > 0, null, { timeout: 25000 });
  await SCROLL(pg2);
  const r3 = await pg2.evaluate(() => {
    const im = [...document.querySelectorAll('.anima-gitem img')].filter(i => i.getAttribute('src'));
    return { 그려짐: im.filter(i => i.naturalWidth > 0).length, 주소로: im.filter(i => i.src.startsWith('http')).length };
  });
  ck('★ CORS 가 막혀도 사진은 그대로 보인다 (예전 방식으로 되돌아감)', r3.그려짐 >= 8 && r3.주소로 >= 8, JSON.stringify(r3));
  ck('오류 없음(CORS 차단)', e2.length === 0, e2.slice(0, 2).join(' | '));

  ck('오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));

  await b.close(); comfy.close(); app.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
