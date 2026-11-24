// 🔎 Anima 편집 검토 반영 (v9.212.0 — 사용자 요청 "3번(메스가키) 빼고 전부")
//  ★ 지키는 것:
//   · ★★ 바꾸지 않은 칩 조합은 보내는 프롬프트가 **옛 코드(7d09ef6)와 글자까지 같다**
//   · 실행 버튼을 직접 누르면 '직접 누름'(연속 생성 중이면 막고 안내) · ComfyUI 실패는 바로 오류로
//   · 후타 + 손으로 벌려 보이기 → 보지 태그 빠짐(후타 섹스 2인의 vaginal 은 남음)
//   · 살색 = 몸과 같은 피부색 · 진한 자국은 모양 자국과 함께 · 포장지에 used condom 없음 · 극한 도배면 은은하게 빠짐 · 겹친 태그 1번
//   · 「워크플로우 복사」 = 실제로 보내는 것 · 깨진 커스텀 JSON 은 알림 · 시드 0 유지
//   · 새로고침해도 원본이 전체 크기 · ✕ 하면 비워짐 · 옛 문구 저장분은 새 문구로(✏️ 고친 건 그대로)
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const OLD_REV = process.env.PL_OLD_REV || '7d09ef6';
let OLD_HTML = null;
try { OLD_HTML = execSync(`git -C "${ROOT}" show ${OLD_REV}:index.html`, { maxBuffer: 64 << 20 }).toString(); } catch (e) {}
const mk = (old) => http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (old && (u.pathname === '/' || u.pathname === '/index.html')) { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(OLD_HTML); }
  const p = path.join(ROOT, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : /\.js$/.test(p) ? 'text/javascript' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHUlEQVR42mP8z8Dwn4EIwDiqkL4KGUdDhr4KAeoRB/3s7QeVAAAAAElFTkSuQmCC';
//  바꾸지 않은 칩만 쓴 조합(옛 코드와 글자 대조)
const PLAIN = [[], ['futa_small'], ['futa_normal'], ['futa_large', 'futa_erect_flaccid'], ['futa_huge', 'dcol_black', 'futa_cum_excessive'],
  ['futa_small', 'dsh_horse'], ['bust_flat'], ['expr_ahegao', 'pose_mlegs'], ['tat_max'], ['tat_barcode', 'tat_den_heavy'],
  ['futa_normal', 'futa_skin_foreskin', 'dcol_glans'], ['pubic_none', 'tat_pubic'], ['tan_bikini'], ['fcon_on'], ['expr_seductive', 'pose_mlegs']];
const OLD_SKIN_TAN = "her face and neck and shoulders and chest and stomach and arms and hands and thighs and legs all carry the same warm sun-kissed golden brown tone, her whole body from head to toe is evenly tanned, (tan:1.4)", OLD_FCON = "torn condom wrappers and empty foil packets are scattered around her, (condom wrapper:1.2), used condom";

async function open(b, port, seed) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript((sd) => {
    try { if (sessionStorage.getItem('__s')) return; sessionStorage.setItem('__s', '1');
      localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1');
      if (sd) localStorage.setItem('anima_settings_v1', sd); } catch (e) {}
  }, seed || '');
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await boot(p);
  return { ctx, p, errs };
}
async function boot(p) {
  await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets && !!window._animaMounted, null, { timeout: 30000 });
  await p.waitForTimeout(600);
  await p.evaluate(() => { window.__toasts = []; window.showToast = (m) => { window.__toasts.push(String(m)); }; window._animaPump = () => {}; });
}
const gen = (p, sets, base) => p.evaluate(async ({ sets, PX, base }) => {
  const out = [];
  _anima.img = { dataURL: PX, name: 't.png' }; _anima.prompt = base || 'masterpiece, 1girl, nude';
  for (const ids of sets) {
    _anima.snippets.forEach(s => { s.on = ids.includes(s.id); });
    _animaJobs = [];
    await _animaGenerate(true);
    const j = _animaJobs[_animaJobs.length - 1];
    out.push(j ? j.prompt : null);
  }
  _animaJobs = []; try { _animaSyncBusy(); } catch (e) {}
  return out;
}, { sets, PX, base });

(async () => {
  const sNew = mk(false), sOld = mk(true);
  await new Promise(r => sNew.listen(0, '127.0.0.1', r)); await new Promise(r => sOld.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PL_CHROMIUM || '/opt/pw-browsers/chromium' });
  const N = await open(b, sNew.address().port);
  const p = N.p;

  // ── ★★ 바꾸지 않은 조합은 옛 코드와 글자까지 같다 (노출 프리셋 2종 base 로도)
  if (!OLD_HTML) ck('비교본(옛 index.html)을 꺼냈다', false, OLD_REV);
  else {
    const O = await open(b, sOld.address().port);
    for (const base of [null, 'masterpiece, best quality, score_7, (bottomless, no panties, pussy, uncensored, :2), ']) {
      const a = await gen(p, PLAIN, base), o = await gen(O.p, PLAIN, base);
      const diff = PLAIN.map((ids, i) => a[i] === o[i] ? null : { ids, now: a[i], old: o[i] }).filter(Boolean);
      ck(`★★ 바꾸지 않은 조합은 옛 코드와 프롬프트가 같다(${PLAIN.length}조합 · ${base ? '하의 노출' : '기본'})`, diff.length === 0, JSON.stringify(diff[0]));
    }
    ck('옛 판 콘솔 오류 없음', O.errs.length === 0, O.errs.join(' | '));
    await O.ctx.close();
  }

  // ── #4 후타 + 손으로 벌려 보이기
  const [sp1, sp2, fs2] = await gen(p, [['futa_normal', 'pose_spread_pussy'], ['pose_spread_pussy'], ['futa_normal', 'pose_2g_futasex']]);
  ck('후타 + 손으로 벌려 보이기 → 보지 태그가 안 나간다(괄호 찌꺼기 없음)', sp1 && !/pussy/i.test(sp1) && /spread legs/.test(sp1) && !/\(\s*:|\(\s*\)/.test(sp1), sp1);
  ck('후타 없이 손으로 벌려 보이기 → 그대로', sp2 && /\(spread pussy:1\.3\)/.test(sp2), sp2);
  ck('후타 섹스(2인) 의 vaginal 은 남는다', fs2 && /\bvaginal\b/.test(fs2), fs2);

  // ── #5~#8 문구·조합
  const t = await p.evaluate(() => {
    const g = id => (_anima.snippets.find(s => s.id === id) || {});
    _anima.snippets.forEach(s => { s.on = false; });
    _animaToggleSnip('tan_bikini'); _animaToggleSnip('tan_strong');
    const both = g('tan_bikini').on && g('tan_strong').on;
    _animaToggleSnip('tan_onepiece');
    const swap = !g('tan_bikini').on && g('tan_onepiece').on && g('tan_strong').on;
    _anima.snippets.forEach(s => { s.on = false; }); _animaSave();
    return { fair: g('dcol_fair').text, wrap: g('fcon_wrap').text, both, swap, multi: !!g('tan_strong').multi, none: g('fball_none').text };
  });
  ck('살색 = 몸과 같은 피부색(fair 아님)', /same skin tone as the rest of her body/.test(t.fair) && !/fair/.test(t.fair), t.fair);
  ck('진한 자국을 비키니 자국과 함께 켤 수 있다', t.both && t.multi, JSON.stringify(t));
  ck('모양 자국끼리는 여전히 하나만(비키니 → 원피스) · 진한 자국은 유지', t.swap, JSON.stringify(t));
  ck('포장지에 used condom 이 없다', !/used condom/.test(t.wrap) && /condom wrapper/.test(t.wrap), t.wrap);
  ck('불알 없음 문구에 rises 가 없다', !/rises/.test(t.none), t.none);
  const [tm, dd, tl] = await gen(p, [['tat_max', 'tat_den_light'], ['expr_seductive', 'pose_double_v'], ['tat_den_light']]);
  ck('극한 도배 + 은은하게 → 은은하게가 빠진다', tm && !/fine and sparse/.test(tm) && /every inch of her skin/.test(tm), tm);
  ck('은은하게만 켜면 그대로 나간다', tl && /fine and sparse/.test(tl), tl);
  ck('같은 태그(looking at viewer)는 한 번만', dd && (dd.match(/looking at viewer/g) || []).length === 1, dd);

  // ── 서술 안 쉼표: 바꾼 칩 12개의 첫 조각(서술)에 쉼표가 없다
  const cm = await p.evaluate(() => ['skin_pale', 'skin_tan', 'skin_brown', 'skin_dark', 'tat_fil_arm', 'tat_fil_chest', 'tat_fil_hip', 'tat_fil_thigh', 'preg_on', 'preg_big', 'preg_slight', 'preg_mark']
    .map(id => { const d = ANIMA_DEFAULT_SNIPPETS.find(x => x.id === id); return { id, head: d ? d.text.split(', (')[0] : '?' }; }).filter(x => /,/.test(x.head) || x.head === '?'));
  ck('피부색·장식 문신·임신 서술 안에 쉼표가 없다(12개)', cm.length === 0, JSON.stringify(cm));

  // ── #1 실행 버튼 = 직접 누름
  const rb = await p.evaluate(async (PX) => {
    _anima.img = { dataURL: PX, name: 't.png' }; _anima.prompt = 'masterpiece, 1girl';
    _anima.snippets.forEach(s => { s.on = false; });
    _animaJobs = []; window.__toasts = [];
    _animaSweeping = true;
    document.getElementById('anima-run-btn').click();
    await new Promise(r => setTimeout(r, 400));
    const blocked = _animaJobs.length === 0 && window.__toasts.some(m => /연속 생성을 넣는 중/.test(m));
    _animaSweeping = false; window.__toasts = [];
    document.getElementById('anima-run-btn').click();
    await new Promise(r => setTimeout(r, 600));
    const ok = _animaJobs.length === 1 && window.__toasts.some(m => /생성 시작|대기열에 추가됨/.test(m));
    _animaJobs = []; try { _animaSyncBusy(); } catch (e) {}
    return { blocked, ok, toasts: window.__toasts };
  }, PX);
  ck('연속 생성을 넣는 중 실행 버튼을 누르면 막고 알린다', rb.blocked, JSON.stringify(rb));
  ck('실행 버튼을 누르면 「생성 시작」 알림이 뜬다', rb.ok, JSON.stringify(rb));

  // ── #2 ComfyUI 실패 → 바로 오류
  const pe = await p.evaluate(async () => {
    const f0 = window.fetch;
    window.fetch = async (u) => (/\/history\//.test(String(u)))
      ? new Response(JSON.stringify({ p1: { outputs: {}, status: { status_str: 'error', completed: false, messages: [['execution_start', {}], ['execution_error', { node_type: 'KSampler', exception_message: 'CUDA out of memory. Tried to allocate' }]] } } }), { status: 200 })
      : f0(u);
    const job = { id: 9, status: 'running', pid: 'p1', settings: {}, snap: {} };
    _animaJobs = [job]; window.__toasts = [];
    const t0 = Date.now(); await _animaPollJob(job, 'http://127.0.0.1:1', 0, 0);
    window.fetch = f0; const r = { st: job.status, err: job.err, ms: Date.now() - t0, toast: window.__toasts.join(' | ') };
    _animaJobs = []; return r;
  });
  ck('ComfyUI 가 실패라고 하면 바로 오류로 끝낸다(기다리지 않음)', pe.st === 'error' && pe.ms < 3000, JSON.stringify(pe));
  ck('실패 이유(메모리 부족 · 노드 이름)를 알려 준다', /메모리/.test(pe.err) && /KSampler/.test(pe.err) && /생성 실패/.test(pe.toast), JSON.stringify(pe));

  // ── #9 워크플로우 복사 = 실제로 보내는 것
  const cw = await p.evaluate(async (PX) => {
    _anima.img = { dataURL: PX, name: 't.png' }; _anima.prompt = 'masterpiece, 1girl, nude';
    _anima.seed = 4242; _anima.customWf = '';
    _anima.snippets.forEach(s => { s.on = ['futa_normal', 'pose_spread_pussy', 'tat_max', 'expr_seductive', 'pose_double_v'].includes(s.id); });
    let copied = null;
    try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (s) => { copied = s; } }, configurable: true }); } catch (e) {}
    try { _animaRenderAdv(); } catch (e) {}
    const btn = document.getElementById('anima-copywf');
    if (!btn) return { err: 'no button' };
    btn.click(); await new Promise(r => setTimeout(r, 800));
    _animaJobs = []; await _animaGenerate(true);
    const j = _animaJobs[_animaJobs.length - 1];
    const sent = await _animaBuildWorkflow(j.prompt, 't.png', j.seed, j.settings, null, false, j.snap.srcWH);
    _animaJobs = []; _anima.seed = -1; _anima.snippets.forEach(s => { s.on = false; });
    return { same: copied === JSON.stringify(sent, null, 2), ref: j.settings.refWeight, hasPrompt: !!copied && copied.includes(JSON.stringify(j.prompt).slice(1, -1)), len: copied && copied.length };
  }, PX);
  ck('★ 워크플로우 복사 = 실제로 보내는 워크플로우(켠 칩·참조 하향·원본 크기)', cw.same && cw.hasPrompt && cw.ref === 0.5, JSON.stringify(cw));

  // ── 깨진 커스텀 JSON → 알림(같은 글엔 한 번)
  const bj = await p.evaluate(async (PX) => {
    window.__toasts = [];
    window._animaPostPrompt = async () => ({ prompt_id: 'zz' });
    window._animaPollJob = async () => {};
    const mkJob = () => ({ id: 77, status: 'queued', prompt: 'x', seed: 1, snap: { dataURL: PX, uploadedName: 'x.png', srcWH: [8, 8] }, settings: Object.assign(_animaSnapshotSettings(), { customWf: '{ bad json' }) });
    const j1 = mkJob(); _animaJobs = [j1]; await _animaRunJob(j1);
    const j2 = mkJob(); _animaJobs = [j2]; await _animaRunJob(j2);
    _animaJobs = [];
    return { n: window.__toasts.filter(m => /읽을 수 없어/.test(m)).length, st: j1.status, toasts: window.__toasts };
  }, PX);
  ck('깨진 커스텀 워크플로우 JSON 이면 알린다(같은 글엔 한 번만)', bj.n === 1, JSON.stringify(bj));

  // ── 시드 0
  const s0 = await p.evaluate(() => { const sd = document.getElementById('anima-seed'); if (!sd) return 'no input'; sd.value = '0'; sd.dispatchEvent(new Event('change')); const v = _anima.seed; sd.value = '-1'; sd.dispatchEvent(new Event('change')); return v; });
  ck('시드에 0 을 넣으면 0 으로 쓴다', s0 === 0, String(s0));

  // ── #10 새로고침해도 원본이 전체 크기
  await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 1536;
    const g = c.getContext('2d'); g.fillStyle = '#c96'; g.fillRect(0, 0, 1024, 1536); g.fillStyle = '#123'; g.fillRect(100, 100, 300, 900);
    await _animaSetImage(c.toDataURL('image/png'), 'big.png', true);
    _animaSave(); await new Promise(r => setTimeout(r, 600));
  });
  await p.reload({ waitUntil: 'load' }); await boot(p);
  const rl = await p.evaluate(async () => {
    await _animaSrcReady();
    const wh = await _animaImgWH(_anima.img.dataURL), th = await _animaImgWH(_anima.imgThumb);
    _animaJobs = []; _anima.snippets.forEach(s => { s.on = false; });
    await _animaGenerate(true); const j = _animaJobs[_animaJobs.length - 1]; _animaJobs = [];
    return { wh, th, job: j && j.snap.srcWH };
  });
  ck('★ 새로고침해도 원본이 전체 크기(1024×1536) · 화면용 축소본은 그대로', JSON.stringify(rl.wh) === '[1024,1536]' && rl.th && rl.th[1] <= 768, JSON.stringify(rl));
  ck('새로고침 뒤 첫 실행도 전체 크기로 나간다', JSON.stringify(rl.job) === '[1024,1536]', JSON.stringify(rl));
  await p.evaluate(async () => { const x = document.querySelector('.anima-thumb-x'); if (x) x.click(); await new Promise(r => setTimeout(r, 500)); });
  await p.reload({ waitUntil: 'load' }); await boot(p);
  const cl = await p.evaluate(async () => { await _animaSrcReady(); return { img: !!_anima.img, th: !!_anima.imgThumb }; });
  ck('✕ 로 원본을 비우면 새로고침해도 안 되살아난다', !cl.img && !cl.th, JSON.stringify(cl));

  // ── 옛 문구 저장분 → 새 문구 / ✏️ 고친 건 그대로
  const seed = await p.evaluate(({ OLD_SKIN_TAN, OLD_FCON }) => {
    _animaSave();
    const o = JSON.parse(localStorage.getItem('anima_settings_v1'));
    o.snippets.forEach(s => {
      if (s.id === 'skin_tan') s.text = OLD_SKIN_TAN;
      if (s.id === 'fcon_wrap') s.text = OLD_FCON;
      if (s.id === 'dcol_fair') s.text = 'my own shaft text';
      if (s.id === 'tan_strong') { delete s.multi; s.group = 'tanline'; }
    });
    return JSON.stringify(o);
  }, { OLD_SKIN_TAN, OLD_FCON });
  const M = await open(b, sNew.address().port, seed);
  const mg = await M.p.evaluate(() => { const g = id => (_anima.snippets.find(s => s.id === id) || {}); return { tan: g('skin_tan').text, wrap: g('fcon_wrap').text, fair: g('dcol_fair').text, multi: !!g('tan_strong').multi }; });
  ck('옛 기본 문구 그대로인 저장분은 새 문구로 올라온다(피부색·포장지)', /tone so her whole body/.test(mg.tan) && !/used condom/.test(mg.wrap), JSON.stringify(mg));
  ck('✏️ 로 고친 문구는 그대로 둔다', mg.fair === 'my own shaft text', JSON.stringify(mg));
  ck('기존 저장분의 진한 자국도 함께 켜기(multi)가 된다', mg.multi, JSON.stringify(mg));
  ck('콘솔 오류 없음(이전 저장분)', M.errs.length === 0, M.errs.join(' | '));
  await M.ctx.close();

  ck('콘솔 오류 없음', N.errs.length === 0, N.errs.join(' | '));
  await b.close(); sNew.close(); sOld.close();
  console.log(F ? `FAILED ${F}` : 'ALL PASS');
  process.exit(F ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
