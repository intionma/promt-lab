// LoRA 트리거가 어떤 설정에서도 프롬프트 앞에 붙어 나가는가 (v9.170.0)
//  ★ 사용자 신고: "가끔 내 loras 적용이 되지 않는 거 같다 · 얼굴이 달라진다".
//    원인: 트리거는 앞 75토큰 안에 있어야 확실히 걸리는데, 그 일을 sortLayerByDB 가 겸했다.
//    '메모장 모드(editor_keeporder_v1)'를 켜면 정렬을 건너뛰면서 트리거 핀까지 함께 건너뛴다.
//    → 이제 보낼 때(_comfyPinTriggers) 한 번 더 앞으로 올린다. 화면의 계층 글은 안 건드린다.
//  ★ 동시에 확인: 기본 설정(정렬 켜짐)에서 전송 payload 가 '최적화 직전' 버전과 같은가.
//    사용자가 "최적화 뒤로 원래 나오던 그림이 안 나온다"고 한 건에 대한 회귀 고정이다.
//    비교본은 /tmp/v112app/index.html 에 있을 때만 돈다(없으면 그 항목만 건너뜀).
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const mk = (root, port) => new Promise(r => {
  const s = http.createServer((q, res) => {
    const u = new URL(q.url, 'http://x');
    const p = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname);
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : 'text/html' });
    fs.createReadStream(p).pipe(res);
  });
  s.listen(port, () => r(s));
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };

//  사용자의 커스텀 워크플로우 흉내 — LoraLoader 가 체크포인트와 CLIPTextEncode 사이에 물려 있다
const USER_WF = {
  "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "ponyRealism_v23.safetensors" } },
  "10": { class_type: "LoraLoader", inputs: { model: ["4", 0], clip: ["4", 1], lora_name: "myFaceLora.safetensors", strength_model: 0.9, strength_clip: 0.9 } },
  "6": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["10", 1] } },
  "7": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["10", 1] } },
  "3": { class_type: "KSampler", inputs: { seed: 12345, steps: 30, cfg: 7, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 1, model: ["10", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0] } },
  "5": { class_type: "EmptyLatentImage", inputs: { width: 832, height: 1216, batch_size: 1 } },
  "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
  "9": { class_type: "SaveImage", inputs: { images: ["8", 0] } },
};
//  트리거(myface)를 뒤쪽에 친 흔한 습관 + 계층을 넉넉히 채워 75토큰 앞머리 경쟁을 만든다
const TYPED = {
  1: 'score_9, masterpiece, best quality, absurdres, highres, ultra detailed, sharp focus, professional lighting',
  3: '1girl, solo, blue eyes, long hair, silver hair, detailed skin, detailed face, beautiful eyes, slim waist, myface',
  4: 'school uniform, thighhighs, pleated skirt, ribbon, blazer, loafers',
  5: 'standing, looking at viewer, hands behind back, head tilt',
  6: 'classroom, indoors, window light, desks',
  7: 'soft lighting, depth of field, bokeh',
};

//  트리거가 '앞 75토큰 밖'으로 확실히 밀리도록 태그를 잔뜩 채운 케이스
const TYPED_LONG = {
  1: 'score_9, score_8, score_7, masterpiece, best quality, absurdres, highres, ultra detailed, sharp focus, professional lighting, cinematic, film grain, high contrast, vivid colors, intricate details',
  2: 'perfect anatomy, detailed hands, five fingers, natural proportions, dynamic composition, rule of thirds',
  3: '1girl, solo, blue eyes, long hair, silver hair, detailed skin, detailed face, beautiful eyes, slim waist, wide hips, long legs, small mole, freckles, glossy lips, myface',
  4: 'school uniform, thighhighs, pleated skirt, ribbon, blazer, loafers, hair ribbon, wristband',
  5: 'standing, looking at viewer, hands behind back, head tilt, one leg forward',
  6: 'classroom, indoors, window light, desks, blackboard, afternoon sun',
  7: 'soft lighting, depth of field, bokeh, rim light, volumetric light',
};

async function run(port, keepOrder, typed) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((ko) => {
    try {
      if (sessionStorage.getItem('__s')) return;
      sessionStorage.setItem('__s', '1');
      localStorage.setItem('pl_layout', 'classic');
      localStorage.setItem('adult_optin_v1', '1');
      if (ko) localStorage.setItem('editor_keeporder_v1', '1');
    } catch (e) {}
  }, keepOrder);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const sent = [];
  await p.route('**/prompt', route => {
    try { sent.push(JSON.parse(route.request().postData() || '{}')); } catch (e) { sent.push({ err: 'parse' }); }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ prompt_id: 'x' + sent.length }) });
  });
  ['**/object_info*', '**/history*', '**/system_stats*'].forEach(g => p.route(g, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })));
  await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => !!document.getElementById('chip-container-1'), null, { timeout: 25000 });
  await p.waitForTimeout(1800);
  await p.evaluate(async (WF) => {
    window.showToast = () => {}; window.confirm = () => true; window.alert = () => {};
    const e = document.getElementById('comfy-url'); if (e) { e.value = 'http://127.0.0.1:' + location.port; e.dispatchEvent(new Event('change', { bubbles: true })); }
    const ta = document.getElementById('comfy-wf-json');
    if (ta) { ta.value = JSON.stringify(WF); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    try { comfySetWfMode('custom'); } catch (er) {}
    try { comfyAnalyzeWorkflow(true); } catch (er) {}
    await new Promise(r => setTimeout(r, 500));
    try { _comfyLoraPresets = [{ name: 'myFaceLora.safetensors', label: '얼굴', trigger: 'myface', strength: 0.9, on: false }]; _comfyLoraPresetsSave(); } catch (er) {}
    try { _comfySaveSettings(); } catch (er) {}
  }, USER_WF);
  const layers = await p.evaluate(async (T) => {
    if (typeof switchViewMode === 'function') switchViewMode('text');
    await new Promise(r => setTimeout(r, 200));
    for (const [n, v] of Object.entries(T)) {
      const ta = document.getElementById('layer-' + n); if (!ta) continue;
      ta.focus(); ta.value = v; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.blur();
      await new Promise(r => setTimeout(r, 60));
    }
    await new Promise(r => setTimeout(r, 400));
    return [1, 2, 3, 4, 5, 6, 7].map(n => (document.getElementById('layer-' + n) || {}).value || '');
  }, typed || TYPED);
  await p.evaluate(() => { try { comfyGenerate(); } catch (e) { window.__genErr = e.message; } });
  await p.waitForTimeout(1500);
  await b.close();
  const wf = sent[0] && sent[0].prompt;
  return { layers, pos: wf ? ((wf['6'] || {}).inputs || {}).text || '' : '', lora: wf ? (wf['10'] || {}).inputs : null, errs };
}

const idxOf = (pos, tag) => pos.split(',').map(s => s.trim()).indexOf(tag);
//  앞 75토큰 ≈ 260자 (앱의 _COMFY_HEAD_CHARS 와 같은 기준)
const offOf = (pos, tag) => { let off = 0; for (const p of pos.split(',').map(s => s.trim())) { if (p === tag) return off; off += p.length + 2; } return -1; };

(async () => {
  const cur = await mk('/home/user/promt-lab', 9192);
  const hasOld = fs.existsSync('/tmp/v112app/index.html');
  const old = hasOld ? await mk('/tmp/v112app', 9191) : null;

  // ── ① 기본(정렬 켜짐) — 트리거가 앞머리에
  const a = await run(9192, false);
  ck('기본 설정: 전송이 이뤄진다', !!a.pos, JSON.stringify(a.errs.slice(0, 1)));
  const ia = offOf(a.pos, 'myface');
  ck('★ 기본 설정: 트리거가 앞 75토큰 안', ia >= 0 && ia < 260, `myface 글자위치=${ia}`);
  ck('기본 설정: LoRA 노드는 손대지 않는다', a.lora && a.lora.lora_name === 'myFaceLora.safetensors' && a.lora.strength_model === 0.9, JSON.stringify(a.lora));

  // ── ② 메모장 모드 — 계층 글은 그대로 두되 '보낼 때'는 트리거가 앞으로
  const c = await run(9192, true);
  ck('메모장 모드: 전송이 이뤄진다', !!c.pos, JSON.stringify(c.errs.slice(0, 1)));
  ck('★ 메모장 모드: 화면의 계층 글은 친 그대로 남는다',
     /^1girl, solo/.test(c.layers[2]) && /myface$/.test(c.layers[2].trim()), c.layers[2]);
  const ic = offOf(c.pos, 'myface');
  ck('★ 메모장 모드에서도 트리거가 앞 75토큰 안', ic >= 0 && ic < 260, `myface 글자위치=${ic} · ${c.pos.slice(0, 140)}`);
  ck('메모장 모드: 태그가 사라지지 않는다',
     c.pos.split(',').length === a.pos.split(',').length, `${c.pos.split(',').length} vs ${a.pos.split(',').length}`);

  // ── ②-b 트리거가 진짜로 앞머리 밖까지 밀린 경우 — 이때만 끌어올려야 한다
  const d = await run(9192, true, TYPED_LONG);
  const id = offOf(d.pos, 'myface');
  ck('★ 메모장 + 긴 프롬프트: 밀려난 트리거를 앞으로 구조한다', id >= 0 && id < 260, `myface 글자위치=${id} · ${d.pos.slice(0, 160)}`);
  ck('구조해도 태그 개수는 그대로', d.pos.split(',').length === Object.values(TYPED_LONG).join(',').split(',').length + 3,
     `${d.pos.split(',').length}개`);
  //  정렬을 켠 같은 프롬프트와 비교 — 둘 다 앞머리 안이어야 한다
  const e = await run(9192, false, TYPED_LONG);
  const ie = offOf(e.pos, 'myface');
  ck('정렬 켠 긴 프롬프트도 앞머리 안', ie >= 0 && ie < 260, `myface 글자위치=${ie}`);

  // ── ③ '최적화 직전' 버전과 payload 가 같은가 (기본 설정)
  if (hasOld) {
    const o = await run(9191, false);
    ck('★ 기본 설정 전송 프롬프트가 최적화 직전 버전과 같다', o.pos === a.pos,
       `\n    옛: ${o.pos}\n    현: ${a.pos}`);
    ck('★ 커스텀 워크플로우의 LoRA 노드가 그대로다', JSON.stringify(o.lora) === JSON.stringify(a.lora),
       `${JSON.stringify(o.lora)} vs ${JSON.stringify(a.lora)}`);
    old.close();
  } else {
    console.log('SKIP - 최적화 직전 버전 비교 (/tmp/v112app/index.html 없음)');
  }
  ck('콘솔 오류 없음', a.errs.length === 0 && c.errs.length === 0 && d.errs.length === 0, [...a.errs, ...c.errs, ...d.errs].slice(0, 2).join(' | '));

  cur.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
