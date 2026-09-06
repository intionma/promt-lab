// 의상 프리셋 라이브러리 건강 검사 (v9.194.0)
//  ★ 🎲(v9.188.0)가 **전체 풀에서** 뽑기 시작하면서, 쓸모없는 프리셋이 그대로 낭비가 된다.
//    중복이면 굴려도 같은 그림이 나오고, 태그가 2개뿐이면 굴려도 아무것도 안 바뀐다.
//  ★ 제일 중요한 것: **새로 넣은 태그가 4계층(의상)으로 분류되는가.**
//    사전에 없는 태그는 _classifyTokenLayer 가 null 을 돌려주고 5계층(액션)으로 떨어진다 —
//    의상이 액션 칸에 들어가도 오류가 안 나서 **조용히 망가진다.**
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = 9151;
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join('/home/user/promt-lab', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };

const R = (f) => JSON.parse(fs.readFileSync('/home/user/promt-lab/data/' + f, 'utf8'));
const S = (x) => new Set(x.tags.map(t => String(t).toLowerCase().trim()));
//  가중치 구문을 벗긴 '핵심' — _classifyTokenLayer 가 하는 것과 같은 규칙
const core = (t) => String(t).trim().replace(/^[\(\[]+/, '').replace(/[\)\]]+$/, '').replace(/:\s*[\d.]+\s*$/, '').trim();

//  v9.194.0 에서 지운 것 — 되살아나면 안 된다(다시 넣으면 중복이 돌아온다)
const GONE = ['웻룩 경기 수영복', '화이트 경기 수영복', '섹시 차이나 미니', '슬링샷 원피스',
  '오버부스트 코르셋 세트', '가터벨트 레이스 세트', '음란 데몬걸', '피시넷 보디스타킹룩',
  '터틀넥 니트 원피스', '사이파이 바이저 보디슈트', '실크 슈미즈', '오픈셔츠룩',
  '가슴골 오픈셔츠룩', '심플 앞치마룩', '리본 액세서리룩', '바디페인트룩', '발렌타인 스트랩 란제리'];
//  강화한 것 — 몸을 바꾸는 태그를 '착용물'로 번역했다. 되돌아가면 실사에서 다시 뭉개진다.
const BUFFED = {
  '드래곤 걸': { 없어야: ['dragon horns', 'dragon wings', 'dragon tail'], 있어야: ['scale armor', 'horned headpiece'] },
  '슬라임 걸': { 없어야: ['slime girl', 'monster girl', 'slime'], 있어야: ['translucent bodysuit'] },
  '젖소 비키니': { 없어야: ['cow ears', 'cow horns', 'cow tail'], 있어야: ['cow print bikini'] },
  '카우 프린트 비키니룩': { 없어야: ['cow horns', 'cow tail'], 있어야: ['cow print'] },
  '메카 무스메': { 없어야: ['mecha musume'], 있어야: ['armored bodysuit'] },
  '할로윈 섹시 악마': { 없어야: ['halloween costume'], 있어야: ['demon costume', 'latex'] },
  '할로윈 섹시 마녀': { 없어야: ['halloween costume'], 있어야: ['witch costume', 'velvet'] },
  '할로윈 섹시 뱀파이어': { 없어야: ['halloween costume'], 있어야: ['vampire costume', 'satin'] },
};

(async () => {
  const a = R('looks-danbooru.json'), b = R('looks-nsfw.json');
  const all = a.outfits.concat(b.outfits);

  ck('의상 프리셋 수', all.length === 189, `${all.length}개 (42 + 147 이어야 한다)`);
  ck('_meta.count 가 실제 개수와 맞는다',
     a._meta.count === a.outfits.length && b._meta.count === b.outfits.length,
     `${a._meta.count}/${a.outfits.length} · ${b._meta.count}/${b.outfits.length}`);

  const names = all.map(x => x.n);
  ck('★ 이름이 겹치지 않는다', new Set(names).size === names.length,
     names.filter((n, i) => names.indexOf(n) !== i).join(', '));
  const back = GONE.filter(n => names.indexOf(n) >= 0);
  ck('★ 지운 프리셋이 되살아나지 않았다', back.length === 0, back.join(', '));

  // ── 중복 ──────────────────────────────────────────────────────
  const dup = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const s1 = S(all[i]), s2 = S(all[j]);
    if (!s1.size || !s2.size) continue;
    const inter = [...s1].filter(t => s2.has(t)).length;
    const jac = inter / (s1.size + s2.size - inter);
    if (jac >= 0.6) dup.push(`${all[i].n} ≈ ${all[j].n} (${jac.toFixed(2)})`);
  }
  ck('★★ 태그가 사실상 같은 짝이 없다 (굴려도 구분이 되어야 한다)', dup.length === 0, dup.join(' | '));

  // ── 얕은 프리셋 ───────────────────────────────────────────────
  const thin = all.filter(x => S(x).size <= 2).map(x => `${x.n}(${x.tags.length})`);
  ck('★ 태그가 2개 이하인 프리셋이 없다 (굴려도 안 바뀐다)', thin.length === 0, thin.join(', '));

  // ── 강화가 실제로 들어갔는가 ──────────────────────────────────
  const badBuff = [];
  for (const n in BUFFED) {
    const x = all.find(y => y.n === n);
    if (!x) { badBuff.push(`${n}: 없음`); continue; }
    const s = S(x);
    BUFFED[n].없어야.forEach(t => { if (s.has(t)) badBuff.push(`${n}: '${t}' 가 남아 있다`); });
    BUFFED[n].있어야.forEach(t => { if (![...s].some(v => core(v) === t)) badBuff.push(`${n}: '${t}' 가 없다`); });
  }
  ck('★★ 몸을 바꾸는 태그가 착용물로 바뀌었다 (실사에서 뭉개지지 않게)', badBuff.length === 0, badBuff.join(' | '));

  // ── 할로윈 셋이 서로 벌어졌는가 ───────────────────────────────
  const hw = ['할로윈 섹시 악마', '할로윈 섹시 마녀', '할로윈 섹시 뱀파이어'].map(n => all.find(x => x.n === n));
  let worst = 0;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    if (!hw[i] || !hw[j]) continue;
    const s1 = S(hw[i]), s2 = S(hw[j]);
    const inter = [...s1].filter(t => s2.has(t)).length;
    worst = Math.max(worst, inter / (s1.size + s2.size - inter));
  }
  ck('★ 할로윈 세 벌이 서로 확실히 다르다 (예전 0.5+ → 0.3 이하)', worst <= 0.3, `제일 비슷한 짝 ${worst.toFixed(2)}`);

  // ══ 여기부터는 브라우저가 필요하다 — 태그가 몇 계층으로 가는가 ══
  await new Promise(r => srv.listen(PORT, r));
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  //  ⚠ adult_optin_v1 만으로는 looks-nsfw.json 이 안 실린다 — adult_pack_v1(팩 스위치)이 있어야 한다.
  //    이걸 빠뜨려서 강화한 프리셋 8개가 통째로 '없음' 으로 나왔다(CLAUDE.md 에 적힌 그 함정).
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('pl_layout', 'classic');
      localStorage.setItem('adult_optin_v1', '1');
      localStorage.setItem('adult_pack_v1', '1');
    } catch (e) {}
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _classifyTokenLayer === 'function' && typeof promptDB !== 'undefined', null, { timeout: 25000 });
  //  성인 프리셋은 비동기로 받아온다 — 실릴 때까지 기다린다(안 기다리면 '없음'으로 헛수를 잡는다)
  await p.waitForFunction(() => Array.isArray(_DATA_LOOKS) && _DATA_LOOKS.some(x => x.nsfw), null, { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(1500);

  //  강화하며 새로 넣은 태그만 골라 본다 — 이게 5계층으로 새면 의상이 액션 칸에 들어간다.
  const NEW = [...new Set(Object.keys(BUFFED).flatMap(n => {
    const x = all.find(y => y.n === n); return x ? x.tags.map(core) : [];
  }).concat(['red and black', 'purple and black', 'crimson and black', 'red and white', 'white and black',
             'velvet', 'satin', 'sheer', 'glossy', 'iridescent', 'metallic', 'latex',
             'wide brim hat', 'off-shoulder dress', 'underbust corset', 'red lining', 'lace gloves',
             'red dress', 'wide belt', 'naked ribbon', 'red ribbon', 'gift wrapping', 'ribbon bondage',
             'heart cutout', 'red lingerie', 'strappy lingerie', 'winged cloak', 'see-through']))];
  const cls = await p.evaluate((tags) => {
    const out = {};
    tags.forEach(t => { try { out[t] = _classifyTokenLayer(t); } catch (e) { out[t] = 'ERR'; } });
    return out;
  }, NEW);
  const unknown = Object.keys(cls).filter(t => cls[t] == null || cls[t] === 'ERR');
  ck('★★ 새로 넣은 태그가 전부 어느 계층인지 앱이 안다 (모르면 5계층으로 새서 조용히 망가진다)',
     unknown.length === 0, '모르는 태그: ' + unknown.join(', '));

  //  가중치 구문이 붙어도 같은 계층으로 분류되는가 — (tag:1.3) 을 처음 쓰는 프리셋들이다
  const wtags = all.flatMap(x => x.tags).filter(t => /^\(/.test(t));
  const wcls = await p.evaluate((ts) => {
    const o = {}; ts.forEach(t => { o[t] = [_classifyTokenLayer(t), _classifyTokenLayer(String(t).replace(/^\(|\)$/g, '').replace(/:[\d.]+$/, ''))]; }); return o;
  }, wtags);
  const wbad = Object.keys(wcls).filter(t => wcls[t][0] !== wcls[t][1]);
  ck('★ 가중치 (tag:1.3) 이 붙어도 같은 계층으로 간다', wbad.length === 0 && wtags.length > 0,
     wtags.length ? wbad.map(t => `${t} → ${JSON.stringify(wcls[t])}`).join(' | ') : '가중치 태그가 하나도 없다');

  //  실제로 담아 보고 의상(4계층)에 들어가는지 — 분류만 보지 말고 담아서 확인한다
  const put = await p.evaluate((names) => {
    const res = {};
    names.forEach(n => {
      const pr = (_DATA_LOOKS || []).find(x => x.n === n); if (!pr) { res[n] = null; return; }
      try {
        contextStates[currentContext] = ['', '', '', '', '', '', ''];
        importPromptToEditor(pr.tags, 'replace');
        const st = contextStates[currentContext];
        res[n] = { l4: (st[3] || '').split(',').filter(x => x.trim()).length, l5: (st[4] || '').split(',').filter(x => x.trim()).length, 전체: pr.tags.length };
      } catch (e) { res[n] = 'ERR:' + e.message; }
    });
    return res;
  }, Object.keys(BUFFED));
  const notFound = Object.keys(put).filter(n => put[n] === null);
  ck('강화한 프리셋이 앱에도 실려 있다', notFound.length === 0, notFound.join(', '));
  //  ⚠ null(못 찾음)을 걸러내면 **아무것도 안 담고도 통과**한다 — 실제로 그렇게 헛수를 놓쳤다.
  //    못 찾은 것도 실패로 센다.
  const mostly5 = Object.keys(put).filter(n => !put[n] || typeof put[n] !== 'object' || put[n].l5 > put[n].l4);
  ck('★★ 담으면 의상(4계층)이 액션(5계층)보다 많다 (의상이 엉뚱한 칸으로 안 샌다)',
     mostly5.length === 0, mostly5.map(n => `${n}: 의상 ${put[n].l4} vs 액션 ${put[n].l5}`).join(' | '));

  ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
  await br.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
