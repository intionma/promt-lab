// 크게 보기 '머리 자리' — 스튜디오 결과 갤러리 (v9.189.0 — 사용자 요청)
//  ★ 사용자 신고: "1/5 를 보고 있는데 새 이미지가 생성되면 2/6 으로 밀린다.
//    Anima 편집처럼 1번 자리에 새 이미지가 뜨게 하고 싶다."
//  ★ 새 이미지는 실제로 맨 앞에 들어온다(#result-gallery-grid 는 grid.prepend, #comfy-gallery 는 prepend).
//    그래서 보던 그림을 따라가면 자리가 밀린다. 머리 자리에 앉아 있으면 자리를 지켜 갈아끼운다.
//  ⚠ 옛 이미지를 열어 놨으면 그 그림을 계속 봐야 한다 — 그게 안 되면 '보던 게 사라진다'가 된다.
//  ⚠ 뒤에 붙는 컨테이너(단계 미리보기·인라인 줄)는 예전 그대로여야 한다.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = 9111;
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join('/home/user/promt-lab', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };

const SVG = (t) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="100%" height="100%" fill="#333"/><text x="50%" y="50%" font-size="70" fill="#fff" text-anchor="middle">${t}</text></svg>`);

const boot = async (b) => {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('pl_layout', 'studio'); localStorage.setItem('adult_optin_v1', '1'); } catch (e) {} });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof galleryAddImage === 'function' && !!document.getElementById('result-gallery-grid'), null, { timeout: 25000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.showToast = () => {}; });
  return { ctx, p, errs };
};

//  갤러리에 그림 n장 — 오래된 것부터 넣으면 prepend 라 최신이 맨 앞에 온다
const seed = (p, names) => p.evaluate((ns) => {
  ns.forEach(n => galleryAddImage(n.u, 1, 'pos ' + n.t, 'neg', 100 + n.i));
  return document.querySelectorAll('#result-gallery-grid img').length;
}, names);

//  크게 보기 상태 — 목록 위치·총장수와 **실제로 그려진 가운데 슬롯의 src** 를 함께 본다
//  ⚠ _lbUrls[_lbIdx] 만 보면 '목록은 맞는데 화면은 옛 그림' 을 놓친다(공유 복원에서 겪은 그 함정).
const lbState = (p) => p.evaluate(() => {
  const box = document.getElementById('img-lightbox');
  const imgs = [...box.querySelectorAll('img')];
  //  가운데 슬롯 = 화면 가운데에 실제로 보이는 것
  let cur = '';
  imgs.forEach(im => {
    const r = im.getBoundingClientRect();
    if (r.width > 0 && r.left < innerWidth / 2 && r.right > innerWidth / 2) cur = im.dataset.full || im.src;
  });
  return {
    열림: !!window._lbActive,
    idx: _lbIdx, n: _lbUrls.length, head: _lbHead,
    목록현재: _lbUrls[_lbIdx] || '',
    그려진현재: cur,
    //  ⚠ 카운터는 '숫자가 굴러가는' 오도미터라 textContent 가 자릿수 전체로 나온다("112 / 6").
    //    현재 위치는 _lbIdx 로 보고, 여기서는 사용자에게 보이는 **총장수**만 읽는다.
    총장수: ((document.querySelector('#img-lightbox-counter .lb-total') || {}).textContent || '').replace(/\D/g, ''),
  };
});
const openAt = (p, i) => p.evaluate((k) => {
  const els = [...document.querySelectorAll('#result-gallery-grid img')];
  els[k].click();
}, i);
//  새 결과가 도착한 것과 같은 상황 — 갤러리 맨 앞에 넣고 크게 보기를 갱신
const arrive = (p, u, t) => p.evaluate((a) => {
  galleryAddImage(a.u, 1, 'pos ' + a.t, 'neg', 999);
  if (window._lbRefresh) window._lbRefresh();
}, { u, t });
const swipeTo = (p, i) => p.evaluate((k) => { for (let n = _lbIdx; n < k; n++) window.__lbNext ? window.__lbNext() : document.getElementById('lb-btn-next').click(); }, i);

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ══ 맨 앞을 보는 중 새 이미지가 오면 그 자리에 갈아끼워진다 ═══════
  {
    const { ctx, p, errs } = await boot(b);
    const n = await seed(p, [1, 2, 3, 4, 5].map(i => ({ u: SVG('구' + i), t: '구' + i, i })));
    ck('갤러리에 5장이 들어간다', n === 5, String(n));
    await openAt(p, 0); await p.waitForTimeout(800);
    const a = await lbState(p);
    ck('맨 앞을 열면 1/5 다', a.열림 && a.idx === 0 && a.n === 5, JSON.stringify(a));
    ck('★ 머리 자리가 잡힌다', a.head === 0, `head=${a.head}`);
    ck('그려진 그림이 목록의 현재와 같다', a.그려진현재 === a.목록현재, a.그려진현재.slice(0, 60));

    await arrive(p, SVG('새것'), '새것'); await p.waitForTimeout(800);
    const c = await lbState(p);
    ck('★★ 자리가 밀리지 않는다 (예전엔 2/6 이 됐다)', c.idx === 0 && c.n === 6, JSON.stringify(c));
    ck('★★ 그 자리에 **새 이미지가 실제로 그려진다**',
       decodeURIComponent(c.그려진현재).indexOf('새것') >= 0, decodeURIComponent(c.그려진현재).slice(0, 80));
    ck('총장수 표시도 6으로 늘어난다', c.총장수 === '6', JSON.stringify(c.총장수));

    //  연달아 와도 계속 그 자리
    await arrive(p, SVG('새것2'), '새것2'); await p.waitForTimeout(700);
    const d = await lbState(p);
    ck('★ 연달아 와도 계속 그 자리에 갈아끼워진다',
       d.idx === 0 && d.n === 7 && decodeURIComponent(d.그려진현재).indexOf('새것2') >= 0, JSON.stringify({ i: d.idx, n: d.n }));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 옛 이미지를 보고 있으면 그 그림을 계속 본다 ═══════════════════
  {
    const { ctx, p, errs } = await boot(b);
    await seed(p, [1, 2, 3, 4, 5].map(i => ({ u: SVG('구' + i), t: '구' + i, i })));
    await openAt(p, 2); await p.waitForTimeout(800);
    const a = await lbState(p);
    ck('세 번째를 열면 3/5 다', a.idx === 2 && a.n === 5, JSON.stringify(a));
    ck('★ 옛것을 열면 머리 자리 규칙을 안 쓴다', a.head === -1, `head=${a.head}`);
    const was = a.그려진현재;
    await arrive(p, SVG('새것'), '새것'); await p.waitForTimeout(800);
    const c = await lbState(p);
    ck('★★ 보던 그림이 그대로다 (자리만 밀린다)', c.그려진현재 === was && c.idx === 3 && c.n === 6, JSON.stringify({ i: c.idx, n: c.n }));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 맨 앞에서 옆으로 넘겨 놓으면 그 그림을 계속 본다 ══════════════
  //   머리 자리를 '떠났으면' 규칙이 꺼져야 한다 — 안 그러면 넘겨 본 그림이 남의 것으로 바뀐다.
  {
    const { ctx, p, errs } = await boot(b);
    await seed(p, [1, 2, 3, 4, 5].map(i => ({ u: SVG('구' + i), t: '구' + i, i })));
    await openAt(p, 0); await p.waitForTimeout(800);
    await p.evaluate(() => { document.getElementById('lb-btn-next').click(); });
    await p.waitForTimeout(700);
    const a = await lbState(p);
    ck('옆으로 한 칸 넘어갔다', a.idx === 1, JSON.stringify(a));
    const was = a.그려진현재;
    await arrive(p, SVG('새것'), '새것'); await p.waitForTimeout(800);
    const c = await lbState(p);
    ck('★★ 머리 자리를 떠났으면 보던 그림을 계속 본다', c.그려진현재 === was && c.n === 6, JSON.stringify({ i: c.idx, n: c.n }));
    //  다시 맨 앞으로 돌아오면 규칙이 되살아난다
    await p.evaluate(() => { while (_lbIdx > 0) document.getElementById('lb-btn-prev').click(); });
    await p.waitForTimeout(900);
    await arrive(p, SVG('새것3'), '새것3'); await p.waitForTimeout(800);
    const d = await lbState(p);
    ck('★ 맨 앞으로 돌아오면 다시 갈아끼워진다',
       d.idx === 0 && decodeURIComponent(d.그려진현재).indexOf('새것3') >= 0, JSON.stringify({ i: d.idx, cur: decodeURIComponent(d.그려진현재).slice(0, 40) }));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 뒤에 붙는 컨테이너는 예전 그대로 ══════════════════════════════
  {
    const { ctx, p, errs } = await boot(b);
    const st = await p.evaluate((u) => {
      const box = document.getElementById('comfy-live-thumbs');
      box.style.display = 'block';
      [1, 2, 3].forEach(i => box.appendChild(_comfyThumb(u.replace('%EA%B5%AC', '%EB%8B%A8' + i), 160, '단계' + i)));
      return box.querySelectorAll('img').length;
    }, SVG('구'));
    ck('단계 미리보기에 3장이 들어간다', st === 3, String(st));
    await p.evaluate(() => { document.querySelectorAll('#comfy-live-thumbs img')[0].click(); });
    await p.waitForTimeout(800);
    const a = await lbState(p);
    ck('★ 뒤에 붙는 컨테이너는 머리 자리를 안 쓴다 (예전 그대로)', a.head === -1, `head=${a.head}`);
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 생성 완료 경로가 크게 보기를 갱신하는가 (코드에 실제로 있는지) ══
  //   단계 이벤트를 받았으면(sawStage) _comfyStageImages 를 안 타서 그 안의 _lbRefresh 도 안 불렸다.
  {
    const src = fs.readFileSync('/home/user/promt-lab/index.html', 'utf8');
    const i = src.indexOf('galleryAddImage(url, perSec, job.pos, job.neg, job.seed)');
    const after = i >= 0 ? src.slice(i, i + 600) : '';
    ck('★ 생성 완료 경로가 _lbRefresh 를 부른다', i >= 0 && /window\._lbRefresh/.test(after),
       '최종 이미지가 크게 보기에 즉시 안 들어온다');
  }

  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
