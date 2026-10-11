// 👗 의상 입히기 (v9.205.0 — 사용자 요청)
//  참고 이미지의 '옷만' 가져와 칩으로 고른 몸(성인)에 입힌다. 화면은 Anima 와 같고 방식만 다르다.
//  ★ 지키는 것:
//   · 옷 태그만 남긴다 — 머리·눈·몸·동작·배경 태그와 아동 연상 태그는 빠진다(data/attire-lexicon.json)
//   · 생성은 참고 패치 없이 글로만 그린다(참고 캐릭터가 새지 않게). 「옷 그림 참고」를 켰을 때만 Cosmos 참조
//   · 편집 모드 워크플로우는 예전 그대로다(회귀 금지)
//   · 'adult' 를 늘 넣는다(cfg 1 이라 부정 프롬프트가 안 먹는다) · 서술 안에 쉼표 없음
//   · 새로고침해도 방식·고른 값·읽은 옷이 남는다 · 레이아웃 선택기 카드
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join(ROOT, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : /\.js$/.test(p) ? 'text/javascript' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };
const RAW = '1girl, solo, long hair, blue eyes, white dress, frilled sleeves, thighhighs, red ribbon, smile, animal ears, cat tail, school swimsuit, kindergarten uniform, black gloves, looking at viewer, simple background, large breasts, hair ribbon';

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.PL_CHROMIUM || '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    try { if (!sessionStorage.getItem('__s')) { sessionStorage.setItem('__s', '1'); localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1'); } } catch (e) {}
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const boot = async () => {
    await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets && !!window._animaMounted, null, { timeout: 30000 });
    await p.waitForTimeout(500);
    //  ComfyUI 없이 — 업로드·태거만 가짜로 바꿔 끼운다(나머지는 진짜 코드)
    await p.evaluate((raw) => {
      window.__tagCalls = 0;
      window._animaEnsureUploaded = async () => 'x.png';
      window._comfyWD14Tag = async (n, o) => { window.__tagCalls++; window.__tagOpts = o; return raw; };
      window._animaPump = () => {};
    }, RAW);
  };
  await p.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await boot();

  // ── 처음엔 편집 방식 그대로 ─────────────────────────────────
  const e0 = await p.evaluate(() => ({ mode: document.getElementById('anima-root').dataset.mode, ta: getComputedStyle(document.getElementById('anima-prompt')).display, tags: document.getElementById('anima-of-tags').innerHTML.length }));
  ck('처음엔 편집 방식 — 프롬프트 칸이 보이고 옷 칸은 비어 있다', e0.mode === 'edit' && e0.ta !== 'none' && e0.tags === 0, JSON.stringify(e0));

  // ── 전환 단추 ─────────────────────────────────────────────
  await p.evaluate(() => document.querySelector('.anima-mode-b[data-mode="outfit"]').click());
  await p.waitForTimeout(300);
  const m1 = await p.evaluate(() => ({
    mode: document.getElementById('anima-root').dataset.mode,
    head: document.getElementById('anima-head-t').textContent,
    s1: document.getElementById('anima-s1-t').textContent,
    ta: getComputedStyle(document.getElementById('anima-prompt')).display,
    axes: document.querySelectorAll('#anima-of-axes [data-ofa]').length,
    base: document.querySelectorAll('#anima-root [data-base]').length,
    over: document.getElementById('anima-root').scrollWidth - document.getElementById('anima-root').clientWidth,
    head2: (() => { const h = document.querySelector('.anima-head').getBoundingClientRect(); return Math.round(h.height); })(),
  }));
  ck('★ 「👗 의상 입히기」 단추로 방식이 바뀐다', m1.mode === 'outfit' && /의상 입히기/.test(m1.head) && /의상 참고/.test(m1.s1), JSON.stringify(m1));
  ck('프롬프트 칸 대신 인물 칩이 보인다', m1.ta === 'none' && m1.axes > 20, JSON.stringify(m1));
  ck('★ 노출 교체 칩·아이콘은 안 보인다(옷은 참고 이미지에서 온다)', m1.base === 0, JSON.stringify(m1));
  ck('390px 에서 가로로 안 넘친다 · 머리 줄이 한 줄', m1.over <= 0 && m1.head2 <= 48, JSON.stringify(m1));

  // ── 옷 읽기 ──────────────────────────────────────────────
  await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 96; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 64, 96);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await _animaTakeBlob(blob, 'ref');
  });
  await p.waitForTimeout(500);
  const r0 = await p.evaluate(() => ({ btn: !!document.getElementById('anima-of-read'), calls: window.__tagCalls }));
  ck('참고 이미지를 넣으면 「옷 읽기」 단추가 나온다(아직 안 읽었다)', r0.btn && r0.calls === 0, JSON.stringify(r0));
  await p.evaluate(() => document.getElementById('anima-of-read').click());
  await p.waitForFunction(() => !_ofReading && !!_ofTagsNow(), null, { timeout: 10000 });
  const r1 = await p.evaluate(() => ({ list: _ofTagsNow(), chips: [...document.querySelectorAll('#anima-of-tags [data-oft]')].map(x => x.textContent), th: window.__tagOpts && window.__tagOpts.threshold }));
  const L = r1.list || [];
  ck('★★ 옷 태그만 남는다', ['white dress', 'frilled sleeves', 'thighhighs', 'red ribbon', 'black gloves'].every(t => L.includes(t)), JSON.stringify(r1));
  ck('★★ 머리·눈·몸·표정·배경·인원 태그는 빠진다', !L.some(t => /long hair|blue eyes|1girl|solo|smile|animal ears|cat tail|large breasts|simple background|looking at/.test(t)), JSON.stringify(L));
  ck('★★ 아동 연상 옷 태그는 빠진다', !L.some(t => /school swimsuit|kindergarten/.test(t)), JSON.stringify(L));
  ck('머리 장식(hair ribbon)은 옷(소품)으로 남는다', L.includes('hair ribbon'), JSON.stringify(L));
  ck('옷은 작은 소품까지 잡도록 임계값을 낮춰 읽는다', r1.th === 0.3, String(r1.th));
  ck('읽은 옷이 칩으로 보인다', r1.chips.length === L.length, JSON.stringify(r1.chips));

  // 칩 빼기 · 직접 더하기
  await p.evaluate(() => { const c = [...document.querySelectorAll('#anima-of-tags [data-oft]')].find(x => /thighhighs/.test(x.textContent)); c.click(); });
  await p.waitForTimeout(150);
  await p.evaluate(() => { const i = document.getElementById('anima-of-add'); i.value = 'blue cape, Black Gloves'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  await p.waitForTimeout(150);
  const r2 = await p.evaluate(() => _ofTagsNow());
  ck('칩을 누르면 그 옷이 빠진다', !r2.includes('thighhighs'), JSON.stringify(r2));
  ck('칸에 적고 Enter 면 더해진다(같은 것은 한 번만)', r2.includes('blue cape') && r2.filter(t => t.toLowerCase() === 'black gloves').length === 1, JSON.stringify(r2));

  // ── 인물 고르기 → 조립 ─────────────────────────────────────
  await p.evaluate(() => {
    const pick = (a, v) => document.querySelector(`#anima-of-axes [data-ofa="${a}"][data-ofv="${v}"]`).click();
    pick('gender', 'm'); pick('age', '30'); pick('hc', 'blonde'); pick('eye', 'blue'); pick('build', 'musc'); pick('hl', 'l');
  });
  await p.waitForTimeout(150);
  const c1 = await p.evaluate(() => { const s = _ofCompose(_ofTagsNow()); return { s, sent: (s.match(/score_7, ([^.]*)\./) || [])[1] || '' }; });
  ck('★★ 조립한 프롬프트에 \'adult\' 가 서술·태그 양쪽에 들어간다', /A solo adult man/.test(c1.s) && /, adult,/.test(c1.s), c1.s);
  ck('고른 몸이 들어간다(1boy · blonde hair · blue eyes · 근육 · 긴 머리)', /1boy/.test(c1.s) && /blonde hair/.test(c1.s) && /blue eyes/.test(c1.s) && /muscular male/.test(c1.s) && /long hair/.test(c1.s), c1.s);
  ck('읽은 옷이 서술과 태그 양쪽에 들어간다', /wearing white dress/.test(c1.s) && /, red ribbon/.test(c1.s), c1.s);
  ck('★ 서술 안에는 쉼표가 없다(태그를 쪼개지 않게)', c1.sent.length > 20 && !/,/.test(c1.sent), c1.sent);
  ck('안 고른 축은 넣지 않는다(키·머리 모양)', !/tall|ponytail|twintails/.test(c1.s), c1.s);
  await p.evaluate(() => document.querySelector('#anima-of-axes [data-ofa="hl"][data-ofv="l"]').click());
  const c2 = await p.evaluate(() => _ofCompose(_ofTagsNow()));
  ck('고른 칩을 다시 누르면 해제된다', !/long hair/.test(c2), c2);

  // ── 워크플로우 ─────────────────────────────────────────────
  const wf = await p.evaluate(async () => {
    const cls = (w) => Object.values(w).map(n => n.class_type);
    const base = _animaSnapshotSettings();
    const o0 = await _animaBuildWorkflow('x', 'x.png', 1, Object.assign({}, base, { mode: 'outfit', ofRefW: 0, denoise: 1 }), null, false, [832, 1216]);
    const o3 = await _animaBuildWorkflow('x', 'x.png', 1, Object.assign({}, base, { mode: 'outfit', ofRefW: 0.3, denoise: 1 }), null, false, [832, 1216]);
    const ed = await _animaBuildWorkflow('x', 'x.png', 1, Object.assign({}, base, { mode: 'edit' }), null, false, [832, 1216]);
    const ks = (w) => Object.values(w).find(n => n.class_type === 'KSampler');
    const cref = (w) => Object.values(w).find(n => n.class_type === 'CosmosReferenceConditioning');
    const loras = (w) => Object.values(w).filter(n => n.class_type === 'LoraLoaderModelOnly').map(n => n.inputs.lora_name);
    const save = (w) => Object.values(w).find(n => n.class_type === 'SaveImage').inputs.filename_prefix;
    return {
      o0: { cls: cls(o0), model: ks(o0).inputs.model, pos: ks(o0).inputs.positive, loras: loras(o0), save: save(o0), crop: o0['82'].inputs.crop },
      o3: { cref: cref(o3) && Object.values(cref(o3).inputs).filter(v => typeof v === 'number'), model: ks(o3).inputs.model, loras: loras(o3) },
      ed: { cls: cls(ed), model: ks(ed).inputs.model, loras: loras(ed), save: save(ed), crop: ed['82'].inputs.crop },
      lora1: base.lora1Name,
    };
  });
  ck('★★ 의상 입히기는 참고 패치 없이 글로만 그린다', !wf.o0.cls.includes('ApplyCosmosReferenceModelPatch') && !wf.o0.cls.includes('CosmosReferenceConditioning') && wf.o0.pos[0] === '67', JSON.stringify(wf.o0));
  ck('편집용 LoRA(이름에 edit)는 이때 빼고 보낸다', !/edit/i.test(wf.lora1 || '') || !wf.o0.loras.includes(wf.lora1), JSON.stringify(wf));
  ck('결과 파일 이름이 따로 묶인다 · 비율이 달라도 가운데를 쓴다', wf.o0.save === 'PromptLab_outfit' && wf.o0.crop === 'center', JSON.stringify(wf.o0));
  ck('「옷 그림 참고」를 켜면 그 세기로만 Cosmos 참조를 건다', Array.isArray(wf.o3.cref) && wf.o3.cref.includes(0.3) && wf.o3.model[0] === '69', JSON.stringify(wf.o3));
  ck('★★ 편집 모드 워크플로우는 예전 그대로(참조 패치·원본 크기·편집 LoRA)', wf.ed.cls.includes('ApplyCosmosReferenceModelPatch') && wf.ed.cls.includes('CosmosReferenceConditioning') && wf.ed.model[0] === '69' && wf.ed.save === 'PromptLab_anima' && wf.ed.crop === 'disabled', JSON.stringify(wf.ed));

  // ── 실행하면 작업이 '의상 입히기' 설정으로 쌓인다 ────────────────────────
  const job = await p.evaluate(async () => {
    _animaJobs = [];
    await _animaGenerate(true);
    const j = _animaJobs[_animaJobs.length - 1];
    const out = j ? { mode: j.settings.mode, ref: j.settings.ofRefW, den: j.settings.denoise, wh: j.snap.srcWH, adult: /adult/.test(j.prompt), dress: /white dress/.test(j.prompt), opt: j.opt, cw: j.settings.customWf } : null;
    _animaJobs = []; try { _animaSyncBusy(); } catch (e) {}
    return out;
  });
  ck('★ 실행하면 의상 입히기 설정으로 대기열에 들어간다', job && job.mode === 'outfit' && job.den === 1 && job.adult && job.dress && job.cw === '', JSON.stringify(job));
  ck('그림 크기는 고른 비율(기본 세로 2:3)', job && JSON.stringify(job.wh) === '[832,1216]', JSON.stringify(job));
  ck('결과 이름표에 👗 가 붙는다', job && /^👗/.test(job.opt), JSON.stringify(job));

  // ── 새 참고 이미지는 안 읽은 상태에서 실행 → 먼저 읽고 간다 ─────────────────────
  const auto = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 96; const g = c.getContext('2d'); g.fillStyle = '#3c3'; g.fillRect(0, 0, 64, 96);
    await _animaTakeBlob(await new Promise(r => c.toBlob(r, 'image/png')), 'ref2');
    await new Promise(r => setTimeout(r, 400));
    const before = window.__tagCalls; _animaJobs = [];
    await _animaGenerate(true);
    const n = _animaJobs.length; _animaJobs = []; try { _animaSyncBusy(); } catch (e) {}
    return { read: window.__tagCalls - before, jobs: n };
  });
  ck('★ 옷을 안 읽은 채로 실행하면 먼저 읽고 생성한다(공유 자동 생성 길)', auto.read === 1 && auto.jobs === 1, JSON.stringify(auto));

  // ── 새로고침해도 남는다 ────────────────────────────────────────
  await p.reload({ waitUntil: 'load' }); await boot();
  const rl = await p.evaluate(() => ({ mode: document.getElementById('anima-root').dataset.mode, g: _ofState().pick.gender, hc: _ofState().pick.hc, tags: (_ofTagsNow() || []).length }));
  ck('★ 새로고침해도 방식·고른 값·읽은 옷이 남는다', rl.mode === 'outfit' && rl.g === 'm' && rl.hc === 'blonde' && rl.tags > 0, JSON.stringify(rl));

  // ── 레이아웃 선택기 ─────────────────────────────────────────
  const pk = await p.evaluate(async () => {
    openLayoutPicker(); await new Promise(r => setTimeout(r, 300));
    const cards = [...document.querySelectorAll('#pl-picker .pl-card')];
    const of = cards.find(c => /의상 입히기/.test(c.textContent)), an = cards.find(c => /Anima 편집/.test(c.textContent));
    const ofAct = of && of.classList.contains('active'), anAct = an && an.classList.contains('active');
    an.click(); await new Promise(r => setTimeout(r, 900));
    const m1 = document.getElementById('anima-root') && document.getElementById('anima-root').dataset.mode;
    openLayoutPicker(); await new Promise(r => setTimeout(r, 300));
    [...document.querySelectorAll('#pl-picker .pl-card')].find(c => /의상 입히기/.test(c.textContent)).click(); await new Promise(r => setTimeout(r, 900));
    return { has: !!of, ofAct, anAct, m1, m2: document.getElementById('anima-root').dataset.mode, saved: localStorage.getItem('pl_layout'), cur: (document.getElementById('pl-current-name') || {}).textContent };
  });
  ck('★ 레이아웃 선택기에 「의상 입히기」 카드가 있고 지금 켜진 쪽이 표시된다', pk.has && pk.ofAct && !pk.anAct, JSON.stringify(pk));
  ck('「Anima 편집」 카드는 편집 방식으로, 「의상 입히기」 카드는 의상 방식으로 연다', pk.m1 === 'edit' && pk.m2 === 'outfit', JSON.stringify(pk));
  ck('저장되는 레이아웃은 그대로 anima (부팅 지름길·공유 진입을 안 건드린다)', pk.saved === 'anima' && /의상 입히기/.test(pk.cur || ''), JSON.stringify(pk));

  ck('오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})().catch(e => { console.log('FAIL - 검사가 죽었다 :: ' + (e && e.stack || e)); process.exit(1); });
