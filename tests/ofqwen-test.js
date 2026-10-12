// 👗 의상 입히기 2단계 — ✨ 정밀 입히기 (Qwen-Image-Edit, v9.206.0)
//  1단계(태그)로 몸을 그린 뒤, 같은 ComfyUI 요청 안에서 그 그림 + 참고 이미지를 Qwen-Image-Edit 에 넘겨 옷을 그대로 입힌다.
//  ★ 지키는 것:
//   · 준비물은 /object_info 로 '있는 것'을 찾는다 — 2511 > 2509, bf16(38GB)보다 가벼운 판, 판이 맞는 Lightning 만
//   · 옛 형식([목록])·새 형식('COMBO'+options) 둘 다 읽는다 · GGUF 로더도 받는다
//   · 없으면 무엇이 빠졌는지 + 받을 곳을 보여 주고, 실행하면 태그 방식으로 뽑되 **말하고** 뽑는다(세션당 한 번)
//   · 태그 방식을 고른 동안은 PC 에 아무것도 묻지 않는다
//   · ★★ 편집 모드·태그 방식 워크플로우는 v9.205.1 과 한 글자도 같다(옛 코드로 직접 만들어 대조한다)
//   · 2단계는 노드를 '뒤에 덧붙이기'만 한다 — 1단계 노드는 그대로, 저장만 2단계 결과로
//   · 크기는 노드에 맡기지 않는다(FluxKontextImageScale 없음 — 1단계 그림 크기 그대로)
//   · 'adult' · 그림 2에서는 옷만 · 큰 모델이라 결과 대기 한도가 길다 · 새로고침 유지 · 390px 안 넘침
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const OLD_REV = '1a7fa62';   // v9.205.1 — 2단계 직전
let OLD = null;
try { OLD = execSync(`git show ${OLD_REV}:index.html`, { cwd: ROOT, maxBuffer: 64 << 20 }).toString('utf8'); } catch (e) { OLD = null; }

const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/__old.html' && OLD) { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(OLD); }
  const p = path.join(ROOT, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : /\.js$/.test(p) ? 'text/javascript' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});

// ── 가짜 ComfyUI — /object_info/<노드> 만 답한다(모드를 바꿔 가며) ──
const L = (a) => [a];
const C = (a) => ['COMBO', { options: a }];
const ANIMA_UNET = 'anima-preview.safetensors';
const SETS = {
  full: {
    UNETLoader: { unet_name: L([ANIMA_UNET, 'qwen_image_edit_2511_bf16.safetensors', 'qwen_image_edit_2511_fp8mixed.safetensors', 'qwen_image_edit_2509_fp8_e4m3fn.safetensors', 'svdq-int4_r32-qwen-image-edit-2511.safetensors']), weight_dtype: L(['default', 'fp8_e4m3fn']) },
    CLIPLoader: { clip_name: L(['qwen_3_06b_base.safetensors', 'qwen_2.5_vl_7b_fp8_scaled.safetensors']), type: L(['stable_diffusion', 'qwen_image']), device: L(['default', 'cpu']) },
    VAELoader: { vae_name: L(['sdxl_vae.safetensors', 'qwen_image_vae.safetensors']) },
    LoraLoaderModelOnly: { lora_name: L(['anima_edit_v1.safetensors', 'Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors', 'Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors', 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors']), strength_model: ['FLOAT', { default: 1 }] },
    TextEncodeQwenImageEditPlus: { prompt: ['STRING', {}] }, ModelSamplingAuraFlow: { shift: ['FLOAT', { default: 1.73 }] },
    CFGNorm: { strength: ['FLOAT', { default: 1 }] }, FluxKontextMultiReferenceLatentMethod: { reference_latents_method: C(['offset', 'index', 'uxo/uno', 'index_timestep_zero']) },
  },
};
//  새 형식(COMBO) · GGUF 만 있는 PC · 빠진 PC · Lightning 없는 PC · 판이 안 맞는 Lightning 만 있는 PC
SETS.combo = JSON.parse(JSON.stringify(SETS.full));
for (const k of ['UNETLoader', 'CLIPLoader', 'VAELoader', 'LoraLoaderModelOnly']) for (const f in SETS.combo[k]) { const v = SETS.combo[k][f]; if (Array.isArray(v[0])) SETS.combo[k][f] = C(v[0]); }
SETS.gguf = JSON.parse(JSON.stringify(SETS.full));
SETS.gguf.UNETLoader.unet_name = L([ANIMA_UNET]);
SETS.gguf.CLIPLoader.clip_name = L(['qwen_3_06b_base.safetensors']);
SETS.gguf.UnetLoaderGGUF = { unet_name: L(['Qwen-Image-Edit-2511-Q4_K_M.gguf', 'flux1-dev-Q4_0.gguf']) };
SETS.gguf.CLIPLoaderGGUF = { clip_name: L(['mmproj-Qwen2.5-VL-7B-Instruct-F16.gguf', 'Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf']), type: L(['qwen_image']) };
SETS.miss = JSON.parse(JSON.stringify(SETS.full));
SETS.miss.UNETLoader.unet_name = L([ANIMA_UNET]); delete SETS.miss.TextEncodeQwenImageEditPlus;
SETS.nolora = JSON.parse(JSON.stringify(SETS.full)); SETS.nolora.LoraLoaderModelOnly.lora_name = L(['anima_edit_v1.safetensors']);
delete SETS.nolora.CFGNorm; delete SETS.nolora.FluxKontextMultiReferenceLatentMethod;
SETS.mism = JSON.parse(JSON.stringify(SETS.full)); SETS.mism.LoraLoaderModelOnly.lora_name = L(['Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors']);
let MODE = 'full', HITS = 0, HIST = 0;
const comfy = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
  const m = /^\/object_info\/(.+)$/.exec(u.pathname);
  if (m) {
    HITS++;
    const cls = decodeURIComponent(m[1]), d = SETS[MODE][cls];
    r.writeHead(200, H);
    return r.end(JSON.stringify(d ? { [cls]: { input: { required: d } } } : {}));
  }
  if (u.pathname.startsWith('/history/')) { HIST++; r.writeHead(200, H); return r.end('{}'); }
  r.writeHead(404, H); r.end('{}');
});

let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };
const RAW = '1girl, solo, long hair, blue eyes, white dress, frilled sleeves, red ribbon, black gloves, smile, looking at viewer';

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  await new Promise(r => comfy.listen(0, '127.0.0.1', r));
  const port = srv.address().port, CB = 'http://127.0.0.1:' + comfy.address().port;
  const b = await chromium.launch({ executablePath: process.env.PL_CHROMIUM || '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  //  주소는 저장소에 심는다(실사용처럼 부팅 때 이미 주소가 있다 — 그래야 '열자마자 다시 본다'를 잴 수 있다)
  await ctx.addInitScript((cb) => {
    try { if (!sessionStorage.getItem('__s')) { sessionStorage.setItem('__s', '1'); localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); localStorage.setItem('comfy_settings_v1', JSON.stringify({ url: cb })); } } catch (e) {}
  }, CB);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const boot = async (pg) => {
    await pg.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets && !!window._animaMounted, null, { timeout: 30000 });
    await pg.waitForTimeout(400);
    await pg.evaluate(({ raw, cb }) => {
      window.__baseAtMount = _comfyBase();
      document.getElementById('comfy-url').value = cb;
      window.__toasts = [];
      const _st = window.showToast; window.showToast = function (m, t, ms, o) { window.__toasts.push({ m: String(m), t, keep: !!(o && o.keep) }); return _st.apply(this, arguments); };
      window._animaEnsureUploaded = async () => 'x.png';
      window._comfyWD14Tag = async () => raw;
      window._animaPump = () => {};
    }, { raw: RAW, cb: CB });
  };
  await p.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await boot(p);
  await p.evaluate(async () => {
    window._animaSetModePre('outfit');
    const c = document.createElement('canvas'); c.width = 64; c.height = 96; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 64, 96);
    await _animaTakeBlob(await new Promise(r => c.toBlob(r, 'image/png')), 'ref');
  });
  await p.waitForTimeout(500);
  await p.evaluate(async () => { await _ofRead(true); });

  const bm = await p.evaluate(() => window.__baseAtMount);
  ck('★ 앱을 막 열어도 저장된 PC 주소로 묻는다(옷 읽기가 기본 주소 8188 로 가던 것)', bm === CB, bm + ' ≠ ' + CB);

  // ── 태그 방식(기본) — PC 에 아무것도 안 묻는다 ───────────────────────
  HITS = 0;
  const t0 = await p.evaluate(async () => {
    _ofRenderAxes(); await new Promise(r => setTimeout(r, 300));
    const q = document.getElementById('anima-of-q');
    return { how: _ofState().how, st: q && q.dataset.st, txt: q && q.textContent, chips: [...document.querySelectorAll('#anima-of-axes [data-ofh]')].map(x => x.textContent + (x.classList.contains('on') ? '*' : '')) };
  });
  ck('기본은 태그 방식 · 「입히는 방식」 줄에 두 가지가 있다', t0.how === 'tag' && t0.chips.length === 2 && /\*$/.test(t0.chips[0]) && /정밀/.test(t0.chips[1]), JSON.stringify(t0));
  ck('태그 방식이면 설명 한 줄만(상자 없음)', t0.st === 'tag' && /정밀 입히기/.test(t0.txt), JSON.stringify(t0));
  ck('★ 태그 방식을 고른 동안은 PC 에 Qwen 모델을 묻지 않는다', HITS === 0, 'object_info 요청 ' + HITS + '건');

  // ── 정밀 입히기 고르기 → 준비물 찾기 ──────────────────────────────
  await p.evaluate(() => document.querySelector('#anima-of-axes [data-ofh="qwen"]').click());
  await p.waitForFunction(() => { const q = document.getElementById('anima-of-q'); return q && q.dataset.st === 'ok'; }, null, { timeout: 10000 }).catch(() => {});
  const q1 = await p.evaluate(() => ({ st: document.getElementById('anima-of-q').dataset.st, txt: document.getElementById('anima-of-q').textContent, info: _ofQInfo, how: _ofState().how, sum: _ofSummary() }));
  ck('★ 「✨ 정밀 입히기」를 누르면 PC 에서 준비물을 찾아 「준비됐어요」', q1.how === 'qwen' && q1.st === 'ok' && /준비됐어요/.test(q1.txt), JSON.stringify(q1));
  ck('★★ 모델은 2511 · bf16(38GB)보다 가벼운 fp8 · nunchaku 판 제외', q1.info.unet === 'qwen_image_edit_2511_fp8mixed.safetensors' && !q1.info.unetGguf, q1.info.unet);
  ck('★★ Lightning 은 모델과 판이 맞는 것 중 4스텝 · cfg 1', q1.info.lora === 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors' && q1.info.steps === 4 && q1.info.cfg === 1, JSON.stringify(q1.info));
  ck('텍스트 인코더·VAE 는 Anima 것(qwen_3_06b·sdxl)이 아니라 Qwen 것', q1.info.clip === 'qwen_2.5_vl_7b_fp8_scaled.safetensors' && q1.info.vae === 'qwen_image_vae.safetensors', JSON.stringify(q1.info));
  ck('상태 줄에 쓰는 모델 이름과 스텝이 보인다 · 요약에 「정밀 입히기」', /qwen_image_edit_2511_fp8mixed/.test(q1.txt) && /4스텝/.test(q1.txt) && /정밀 입히기/.test(q1.sum), q1.txt + ' / ' + q1.sum);

  // ── 실행 → 작업에 2단계 설정이 실린다 ─────────────────────────────
  const j1 = await p.evaluate(async () => {
    _animaJobs = []; window.__toasts = [];
    await _animaGenerate(true);
    const j = _animaJobs[_animaJobs.length - 1];
    const o = j ? { mode: j.settings.mode, q: j.settings.ofQ, opt: j.opt, wh: j.snap.srcWH, prompt: j.prompt } : null;
    _animaJobs = []; try { _animaSyncBusy(); } catch (e) {}
    return o;
  });
  ck('★ 실행하면 작업에 2단계(Qwen) 설정이 실린다', j1 && j1.mode === 'outfit' && j1.q && j1.q.unet === 'qwen_image_edit_2511_fp8mixed.safetensors' && j1.q.steps === 4, JSON.stringify(j1 && j1.q));
  ck('2단계 지시문 — 성인 · 그림 2에서는 옷만 · 읽은 옷 이름', j1 && /adult/.test(j1.q.prompt) && /only the clothes from Picture 2/.test(j1.q.prompt) && /white dress/.test(j1.q.prompt) && /Picture 1/.test(j1.q.prompt), j1 && j1.q.prompt);
  ck('결과 이름표가 👗✨ 로 구분된다 · 1단계 프롬프트는 그대로(adult)', j1 && /^👗✨/.test(j1.opt) && /adult/.test(j1.prompt), JSON.stringify({ opt: j1 && j1.opt }));

  // ── 워크플로우 ─────────────────────────────────────────────
  const W = await p.evaluate(async (q) => {
    const base = _animaSnapshotSettings();
    const S0 = Object.assign({}, base, { mode: 'outfit', ofRefW: 0, denoise: 1, matchSrcSize: true });
    const tag = await _animaBuildWorkflow('x', 'x.png', 7, S0, null, false, [832, 1216]);
    const qw = await _animaBuildWorkflow('x', 'x.png', 7, Object.assign({}, S0, { ofQ: q }), null, false, [832, 1216]);
    const ed = await _animaBuildWorkflow('x', 'x.png', 7, Object.assign({}, base, { mode: 'edit' }), null, false, [832, 1216]);
    const o3 = await _animaBuildWorkflow('x', 'x.png', 7, Object.assign({}, S0, { ofRefW: 0.3 }), null, false, [832, 1216]);
    return { base, tag, qw, ed, o3 };
  }, j1.q);
  const qw = W.qw, tag = W.tag;
  const stage1Same = Object.keys(tag).filter(k => k !== '9').every(k => JSON.stringify(tag[k]) === JSON.stringify(qw[k]));
  ck('★★ 2단계는 덧붙이기만 — 1단계 노드는 태그 방식과 한 글자도 같다', stage1Same, JSON.stringify(Object.keys(tag).filter(k => JSON.stringify(tag[k]) !== JSON.stringify(qw[k]))));
  const out1 = tag['9'].inputs.images;
  const te = qw['206'] && qw['206'].inputs;
  ck('★★ 그림 1 = 방금 그린 몸(1단계 출력) · 그림 2 = 참고 이미지(73)', te && JSON.stringify(te.image1) === JSON.stringify(out1) && JSON.stringify(te.image2) === '["73",0]' && JSON.stringify(qw['210'].inputs.pixels) === JSON.stringify(out1), JSON.stringify(te));
  ck('★ 저장은 2단계 결과(212) 한 장뿐', JSON.stringify(qw['9'].inputs.images) === '["212",0]' && Object.values(qw).filter(n => n.class_type === 'SaveImage').length === 1 && qw['9'].inputs.filename_prefix === 'PromptLab_outfit', JSON.stringify(qw['9']));
  const ks = qw['211'] && qw['211'].inputs;
  ck('공식 배선 — AuraFlow 3.1 · CFGNorm · euler/simple · denoise 1 · 4스텝 cfg 1 · 같은 시드', qw['202'] && qw['202'].inputs.shift === 3.1 && qw['203'] && qw['203'].class_type === 'CFGNorm' && ks && ks.sampler_name === 'euler' && ks.scheduler === 'simple' && ks.denoise === 1 && ks.steps === 4 && ks.cfg === 1 && ks.seed === 7 && JSON.stringify(ks.model) === '["203",0]', JSON.stringify(ks));
  ck('Lightning LoRA 는 Qwen 모델에만(1단계 LoRA 와 섞이지 않음)', qw['201'] && JSON.stringify(qw['201'].inputs.model) === '["200",0]' && qw['201'].inputs.lora_name === j1.q.lora, JSON.stringify(qw['201']));
  ck('텍스트 인코더는 type qwen_image · 부정은 빈 지시문', qw['204'] && qw['204'].inputs.type === 'qwen_image' && qw['207'].inputs.prompt === '' && qw['206'].inputs.prompt === j1.q.prompt, JSON.stringify(qw['204']));
  ck('참조 방식 index_timestep_zero 를 양쪽에 건다', qw['208'] && qw['209'] && qw['208'].inputs.reference_latents_method === 'index_timestep_zero' && JSON.stringify(ks.positive) === '["208",0]' && JSON.stringify(ks.negative) === '["209",0]', JSON.stringify([qw['208'], qw['209']]));
  ck('★ 크기를 노드에 맡기지 않는다(FluxKontextImageScale 없음 — 1단계 그림 크기 그대로)', !Object.values(qw).some(n => /KontextImageScale|ImageScaleToTotalPixels/.test(n.class_type)), Object.values(qw).map(n => n.class_type).join(','));
  ck('모든 연결이 실제 있는 노드를 가리킨다', Object.values(qw).every(n => Object.values(n.inputs).every(v => !Array.isArray(v) || typeof v[0] !== 'string' || !!qw[v[0]])), 'dangling');

  // ── ★★ 옛 코드(v9.205.1)와 대조 — 편집·태그·옷 그림 참고 워크플로우 ─────────────
  if (OLD) {
    const op = await ctx.newPage(); op.on('pageerror', e => errs.push('[old] ' + e.message));
    await op.goto(`http://127.0.0.1:${port}/__old.html`, { waitUntil: 'load' });
    await boot(op);
    const OW = await op.evaluate(async (base) => {
      const S0 = Object.assign({}, base, { mode: 'outfit', ofRefW: 0, denoise: 1, matchSrcSize: true });
      return {
        tag: await _animaBuildWorkflow('x', 'x.png', 7, S0, null, false, [832, 1216]),
        ed: await _animaBuildWorkflow('x', 'x.png', 7, Object.assign({}, base, { mode: 'edit' }), null, false, [832, 1216]),
        o3: await _animaBuildWorkflow('x', 'x.png', 7, Object.assign({}, S0, { ofRefW: 0.3 }), null, false, [832, 1216]),
      };
    }, W.base);
    ck('★★ 편집 모드 워크플로우가 v9.205.1 과 한 글자도 같다', JSON.stringify(OW.ed) === JSON.stringify(W.ed), 'diff');
    ck('★★ 태그 방식 워크플로우가 v9.205.1 과 한 글자도 같다', JSON.stringify(OW.tag) === JSON.stringify(W.tag), 'diff');
    ck('「옷 그림 참고」 워크플로우도 v9.205.1 과 같다', JSON.stringify(OW.o3) === JSON.stringify(W.o3), 'diff');
    await op.close();
  } else console.log('SKIP - 옛 코드(' + OLD_REV + ')를 못 꺼냈다 — 대조 생략');

  // ── 새 형식(COMBO) · GGUF · Lightning 없음 · 판 안 맞음 ────────────────────
  const det = async (mode) => { MODE = mode; return p.evaluate(async () => { const q = await _ofQDetect(true); _ofRenderQ(); return { q, st: document.getElementById('anima-of-q').dataset.st, txt: document.getElementById('anima-of-q').textContent, html: document.getElementById('anima-of-q').innerHTML }; }); };
  const dc = await det('combo');
  ck('새 형식(COMBO + options) 목록도 읽는다', dc.q.ready && dc.q.unet === 'qwen_image_edit_2511_fp8mixed.safetensors' && dc.q.clip === 'qwen_2.5_vl_7b_fp8_scaled.safetensors', JSON.stringify(dc.q));
  const dg = await det('gguf');
  ck('★ GGUF 만 있는 PC 도 된다(모델·텍스트 인코더 · mmproj 제외)', dg.q.ready && dg.q.unet === 'Qwen-Image-Edit-2511-Q4_K_M.gguf' && dg.q.unetGguf && dg.q.clip === 'Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf' && dg.q.clipGguf, JSON.stringify(dg.q));
  const wg = await p.evaluate(async (q) => { const S = Object.assign({}, _animaSnapshotSettings(), { mode: 'outfit', ofRefW: 0, denoise: 1, ofQ: Object.assign({ prompt: 'p' }, q) }); const w = await _animaBuildWorkflow('x', 'x.png', 1, S, null, false, [832, 1216]); return { u: w['200'], c: w['204'] }; }, dg.q);
  ck('GGUF 면 GGUF 로더로 보낸다(weight_dtype 없음)', wg.u.class_type === 'UnetLoaderGGUF' && !('weight_dtype' in wg.u.inputs) && wg.c.class_type === 'CLIPLoaderGGUF' && wg.c.inputs.type === 'qwen_image', JSON.stringify(wg));
  const dn = await det('nolora');
  ck('Lightning 이 없으면 20스텝 cfg 4 · 받을 곳을 알려 준다 · 없는 선택 노드는 안 건다', dn.q.ready && !dn.q.lora && dn.q.steps === 20 && dn.q.cfg === 4 && !dn.q.cfgNorm && !dn.q.refm && /Lightning LoRA/.test(dn.txt) && /href="https:\/\/huggingface\.co\/lightx2v/.test(dn.html), JSON.stringify(dn.q));
  const wn = await p.evaluate(async (q) => { const S = Object.assign({}, _animaSnapshotSettings(), { mode: 'outfit', ofRefW: 0, denoise: 1, ofQ: Object.assign({ prompt: 'p' }, q) }); const w = await _animaBuildWorkflow('x', 'x.png', 1, S, null, false, [832, 1216]); return { has: Object.keys(w), ks: w['211'].inputs }; }, dn.q);
  ck('그때 워크플로우 — LoRA·CFGNorm·참조 방식 노드 없이 AuraFlow 에서 바로', !wn.has.includes('201') && !wn.has.includes('203') && !wn.has.includes('208') && JSON.stringify(wn.ks.model) === '["202",0]' && JSON.stringify(wn.ks.positive) === '["206",0]' && wn.ks.steps === 20 && wn.ks.cfg === 4, JSON.stringify(wn));
  const dm = await det('mism');
  ck('★ 판이 안 맞는 Lightning(2509용)은 2511 모델에 안 건다', dm.q.ready && !dm.q.lora && dm.q.steps === 20, JSON.stringify(dm.q));

  // ── 빠진 PC — 무엇이·어디에 + 태그 방식으로 뽑되 말하고 뽑는다 ────────────────
  const dx = await det('miss');
  ck('★ 빠진 것과 받을 곳을 보여 준다(모델 · ComfyUI 업데이트)', !dx.q.ready && dx.st === 'miss' && /Qwen-Image-Edit-2511 모델/.test(dx.txt) && /ComfyUI 를 최신으로/.test(dx.txt) && /href="https:\/\/huggingface\.co\/Comfy-Org\/Qwen-Image-Edit_ComfyUI/.test(dx.html) && /다시 확인/.test(dx.txt), dx.txt);
  const j2 = await p.evaluate(async () => {
    _animaJobs = []; window.__toasts = []; _ofQWarned = false;
    await _animaGenerate(true); await _animaGenerate(true);
    const js = _animaJobs.map(j => ({ q: !!j.settings.ofQ, opt: j.opt }));
    _animaJobs = []; try { _animaSyncBusy(); } catch (e) {}
    return { js, toasts: window.__toasts.filter(t => /정밀 입히기/.test(t.m)) };
  });
  ck('★★ 준비물이 없으면 태그 방식으로 뽑는다(작업이 막히지 않는다)', j2.js.length === 2 && j2.js.every(j => !j.q && /^👗 /.test(j.opt)), JSON.stringify(j2.js));
  ck('★★ 그 사실을 말한다 — 읽을 시간이 있게(keep) · 세션당 한 번', j2.toasts.length === 1 && j2.toasts[0].keep && /태그 방식/.test(j2.toasts[0].m) && /Qwen-Image-Edit-2511/.test(j2.toasts[0].m), JSON.stringify(j2.toasts));

  // ── 다시 확인 단추 → 고쳐졌으면 준비됨 ─────────────────────────────
  MODE = 'full';
  await p.evaluate(() => document.getElementById('anima-of-qre').click());
  await p.waitForFunction(() => document.getElementById('anima-of-q').dataset.st === 'ok', null, { timeout: 10000 }).catch(() => {});
  const r1 = await p.evaluate(() => ({ st: document.getElementById('anima-of-q').dataset.st, warned: _ofQWarned }));
  ck('「다시 확인」 — 모델을 넣고 누르면 준비됨으로 바뀐다(다음에 또 빠지면 다시 알린다)', r1.st === 'ok' && r1.warned === false, JSON.stringify(r1));

  // ── 서버가 꺼져 있으면 ─────────────────────────────────────
  const off = await p.evaluate(async () => {
    document.getElementById('comfy-url').value = 'http://127.0.0.1:9';
    const q = await _ofQDetect(true); _ofRenderQ();
    const box = document.getElementById('anima-of-q');
    return { conn: q.conn, st: box.dataset.st, txt: box.textContent };
  });
  ck('ComfyUI 에 못 붙으면 「확인을 못 했어요」(빠졌다고 하지 않는다)', !off.conn && off.st === 'off' && /연결이 안 돼/.test(off.txt), JSON.stringify(off));
  await p.evaluate((cb) => { document.getElementById('comfy-url').value = cb; }, CB);
  const stale = await p.evaluate(() => _ofQStale());
  ck('주소가 바뀌면 다시 확인한다(옛 결과를 안 믿는다)', stale === true, String(stale));

  // ── 결과 대기 한도 — 큰 모델이라 길게 ──────────────────────────────
  const poll = await p.evaluate(async (cb) => {
    const a = { status: 'running', pid: 'p1', settings: { ofQ: { unet: 'x' } } }, z = { status: 'running', pid: 'p2', settings: {} };
    await _animaPollJob(a, cb, 401, 0); await _animaPollJob(z, cb, 401, 0);
    const out = { q: a.status, t: z.status };
    a.status = 'done';
    return out;
  }, CB);
  ck('정밀 입히기 작업은 400번(약 10분)을 넘겨도 계속 기다린다 · 태그 방식은 예전 그대로', poll.q === 'running' && poll.t === 'error', JSON.stringify(poll));

  // ── 화면 — 390px 안 넘침 · 버튼 크기 ──────────────────────────────
  MODE = 'miss';
  const lay = await p.evaluate(async () => {
    await _ofQDetect(true); _ofRenderAxes(); await new Promise(r => setTimeout(r, 200));
    const root = document.getElementById('anima-root'), box = document.getElementById('anima-of-q'), re = document.getElementById('anima-of-qre');
    const rb = box.getBoundingClientRect(), rr = re.getBoundingClientRect();
    return { over: root.scrollWidth - root.clientWidth, boxR: Math.round(rb.right), vw: innerWidth, reH: Math.round(rr.height), reR: Math.round(rr.right) };
  });
  ck('390px 에서 상태 상자가 화면 안에 있다(가로 넘침 0)', lay.over <= 0 && lay.boxR <= lay.vw && lay.reR <= lay.vw, JSON.stringify(lay));

  // ── 연결 확인을 누르면 준비물도 다시 본다 ──────────────────────────────
  MODE = 'full';
  const pg = await p.evaluate(async () => {
    window._comfyPing = async () => true;   // 연결 확인만 가짜로
    _ofQInfo = { base: _comfyBase(), t: Date.now(), conn: false, ready: false, need: [] }; _ofRenderQ();
    const before = document.getElementById('anima-of-q').dataset.st;
    document.getElementById('anima-ping').click();
    for (let i = 0; i < 50 && document.getElementById('anima-of-q').dataset.st !== 'ok'; i++) await new Promise(r => setTimeout(r, 100));
    return { before, after: document.getElementById('anima-of-q').dataset.st };
  });
  ck('「연결 확인」에 성공하면 준비물도 그 자리에서 다시 본다', pg.before === 'off' && pg.after === 'ok', JSON.stringify(pg));

  // ── 새로고침 유지 ──────────────────────────────────────────
  MODE = 'full';
  await p.reload({ waitUntil: 'load' }); await boot(p);
  await p.waitForFunction(() => { const q = document.getElementById('anima-of-q'); return q && q.dataset.st === 'ok'; }, null, { timeout: 10000 }).catch(() => {});
  const rl = await p.evaluate(() => ({ how: _ofState().how, st: (document.getElementById('anima-of-q') || {}).dataset.st, on: (document.querySelector('#anima-of-axes [data-ofh="qwen"]') || {}).className }));
  ck('★ 새로고침해도 「정밀 입히기」가 남고, 열자마자 준비물을 다시 본다', rl.how === 'qwen' && rl.st === 'ok' && / on/.test(rl.on || ''), JSON.stringify(rl));

  // ── 망가진 저장분 ─────────────────────────────────────────
  const bad = await p.evaluate(() => { _anima.of.how = 'banana'; return _ofState().how; });
  ck('저장분의 방식 값이 이상하면 태그 방식으로', bad === 'tag', bad);
  await p.evaluate(() => { _anima.of.how = 'tag'; _animaSave(); });

  ck('오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close(); comfy.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})().catch(e => { console.log('FAIL - 검사가 죽었다 :: ' + (e && e.stack || e)); process.exit(1); });
