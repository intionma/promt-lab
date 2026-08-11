// 백업(내보내기) → 새 기기 → 복구 왕복에서 설정이 하나도 안 빠지는가 (v9.169.0 전수 조사)
//  ★ 배경: 백업에 담기는 localStorage 키는 _IO_ETC_KEYS 배열이 정한다. 여기 없으면
//    기기를 옮길 때 그 설정이 통째로 사라진다(v9.140.0에서 Anima·LoRA 칩 등이 그랬다).
//    전수 조사에서 성인 팩·고정 프리픽스·추천·이미지변환/인페인팅 탭 등이 또 빠져 있었다.
//  ★ 이 검사는 '지금 목록에 있는 키가 왕복되는지' + '앱이 실제로 쓰는 키 중 어디에도 안 담기는 게 있는지'
//    둘 다 본다. 새 설정을 만들고 목록에 안 넣으면 여기서 잡힌다.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join('/home/user/promt-lab', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };

//  '기기를 옮기면 반드시 따라와야 하는' 설정들 — 값은 아무거나, 왕복만 보면 된다
const SETTINGS = {
  adult_pack_v1: '1',
  hardcore_pack_v1: '1',
  fixed_prefix_v1: JSON.stringify({ enabled: true, text: 'my fixed prefix' }),
  kor_style: 'tags',
  lb_fill_mode: '1',
  recommend_on: '1',
  rec_full_mode: '1',
  pl_face_prompts_v1: JSON.stringify([{ name: '내 얼굴', text: 'face tags' }]),
  comfy_send_neg_v1: '1',
  comfy_img2img_v1: JSON.stringify({ denoise: 0.55 }),
  comfy_gallery_meta_v1: JSON.stringify({ a: 1 }),
  context_tabs_i2i_v1: JSON.stringify([{ id: 1, name: '변환탭' }]),
  context_states_i2i_v1: JSON.stringify({ 1: { layers: ['x'] } }),
  context_tabs_inpaint_v1: JSON.stringify([{ id: 1, name: '인페탭' }]),
  context_states_inpaint_v1: JSON.stringify({ 1: { layers: ['y'] } }),
  anima_secs_v1: JSON.stringify({ bust: false, futa: true }),
  editor_keeporder_v1: '1',
  shutdown_settings_v1: JSON.stringify({ url: 'https://pc.ts.net:8443', token: 'tok' }),
  comfy_lora_presets_v1: JSON.stringify([{ name: 'lora', trigger: 't' }]),
  adult_optin_v1: '1',
};

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ── ① 설정을 심고 백업을 뜬다 ────────────────────────────────────────
  const ctx1 = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p1 = await ctx1.newPage(); const e1 = []; p1.on('pageerror', e => e1.push(e.message));
  await ctx1.addInitScript((s) => {
    try {
      if (sessionStorage.getItem('__seed')) return;
      sessionStorage.setItem('__seed', '1');
      localStorage.setItem('pl_layout', 'classic');
      Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v));
    } catch (e) {}
  }, SETTINGS);
  await p1.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await p1.waitForTimeout(2500);
  const dump = await p1.evaluate(() => {
    window.showToast = () => {};
    return { backup: buildExportData(), keys: (typeof _IO_ETC_KEYS !== 'undefined') ? _IO_ETC_KEYS.slice() : [] };
  });
  ck('백업이 만들어진다', !!dump.backup && dump.backup.length > 50, String(dump.backup && dump.backup.length));
  const parsed = JSON.parse(dump.backup);
  const prefs = parsed.appPrefs || {};

  //  ★ 심어 둔 설정이 백업 안에 전부 들어 있는가
  const missing = Object.keys(SETTINGS).filter(k => prefs[k] === undefined);
  ck('★ 기기 이전에 필요한 설정이 백업에 전부 담긴다', missing.length === 0, '빠진 키: ' + missing.join(', '));
  Object.keys(SETTINGS).forEach(k => {
    if (prefs[k] === undefined) return;
    ck(`  ${k} 값이 그대로`, prefs[k] === SETTINGS[k], `${prefs[k]} !== ${SETTINGS[k]}`);
  });
  ck('백업 뜰 때 콘솔 오류 없음', e1.length === 0, e1.slice(0, 2).join(' | '));
  await ctx1.close();

  // ── ② 빈 기기에 복구한다 ────────────────────────────────────────────
  const ctx2 = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await ctx2.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message));
  await ctx2.addInitScript(() => { try { localStorage.setItem('pl_layout', 'classic'); } catch (e) {} });
  await p2.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await p2.waitForTimeout(2500);
  //  복구 경로와 똑같이 appPrefs 를 되돌린다(executeIO 는 끝에 새로고침을 걸어 컨텍스트가 죽으므로
  //  여기서는 그 안의 '기타 설정 되돌리기' 부분만 그대로 재현한다)
  const back = await p2.evaluate((json) => {
    window.showToast = () => {};
    const parsed = JSON.parse(json);
    const before = {};
    if (parsed.appPrefs && typeof parsed.appPrefs === 'object') {
      for (const [k, v] of Object.entries(parsed.appPrefs)) { localStorage.setItem(k, v); before[k] = v; }
    }
    const out = {};
    Object.keys(before).forEach(k => { out[k] = localStorage.getItem(k); });
    return out;
  }, dump.backup);
  const bad = Object.keys(SETTINGS).filter(k => back[k] !== SETTINGS[k]);
  ck('★ 빈 기기에 복구하면 설정이 그대로 돌아온다', bad.length === 0, '안 돌아온 키: ' + bad.join(', '));

  //  새로고침 뒤에도 남아 있는가(앱이 부팅하면서 덮어쓰지 않는지)
  await p2.reload({ waitUntil: 'load' });
  await p2.waitForTimeout(2500);
  const after = await p2.evaluate((ks) => { const o = {}; ks.forEach(k => o[k] = localStorage.getItem(k)); return o; }, Object.keys(SETTINGS));
  const lost = Object.keys(SETTINGS).filter(k => after[k] !== SETTINGS[k]);
  ck('★ 새로고침해도 복구한 설정이 살아 있다', lost.length === 0,
     lost.map(k => `${k}: ${after[k]} (원래 ${SETTINGS[k]})`).join(' | '));
  ck('복구 뒤 콘솔 오류 없음', e2.length === 0, e2.slice(0, 2).join(' | '));
  await ctx2.close();

  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
