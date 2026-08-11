// 망가진 저장분으로 부팅해도 마이그레이션이 끝까지 도는가 (v9.169.0 전수 조사)
//  ★ 재현한 사고: 저장분의 text 가 문자열이 아니면 (x.text || '').trim() 에서 던지고,
//    마이그레이션이 전부 try 하나로 묶여 있어 그 뒤 단계(이름 통일·피부색 교체)가
//    통째로 조용히 건너뛰어졌다. 콘솔에도 아무것도 안 뜬다.
//  → 고침 ① 복구 때 타입 강제(_sstr) ② 단계마다 _mig() 로 감싸 한 단계 실패가 전체를 안 죽인다.
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

const OLD_SKIN = 'her skin is deep rich brown across her entire body, (very dark skin, dark-skinned female:1.5)';
const SANE = [
  { id: 'fcon_on', name: '콘돔 착용', text: 'x', on: false, kind: 'append', group: 'futaCondom', detail: 'futa' },
  { id: 'skin_dark', name: '흑갈', text: OLD_SKIN, on: false, kind: 'append', group: 'skin' },
];

//  '마이그레이션이 끝까지 돌았다'의 증거 — 서로 다른 단계에서 만들어진다.
//  이름 통일(NAME_OLD)이 사실상 마지막 단계라 여기까지 오면 중간이 안 죽은 것이다.
const PROBES = [
  ['새 축 주입(장식 문신)', s => s.some(x => x.id === 'tat_fil_arm')],
  ['새 축 주입(털 색)', s => s.some(x => x.id === 'pcol_black')],
  ['후타 상세 주입(콘돔 포장지)', s => s.some(x => x.id === 'fcon_wrap')],
  ['포즈 주입', s => s.some(x => x.group === 'pose')],
  ['★ 피부색 문구 교체(SKIN_OLD)', s => /her face and neck/.test((s.find(x => x.id === 'skin_dark') || {}).text || '')],
  ['★ 이름 통일(NAME_OLD · 마지막 단계)', s => (s.find(x => x.id === 'fcon_on') || {}).name === '콘돔'],
];

const CASES = [
  ['정상 저장분(대조군)', { snippets: SANE }, null],
  ['null 이 섞인 목록', { snippets: [null, SANE[0], null, SANE[1]] }, null],
  ['id 가 없는 항목', { snippets: [{ name: '이름만', text: 'x' }, ...SANE] }, null],
  //  ★ 이게 실제로 뒷단계를 죽이던 케이스
  ['★ text 가 숫자·객체', { snippets: [
    { id: 'tat_barcode', name: '바코드', text: 12345, on: false, kind: 'append', group: 'tat' },
    { id: 'tat_pubic', name: '자궁', text: { a: 1 }, on: false, kind: 'append', group: 'tat' },
    ...SANE] }, null],
  //  name 이 숫자면 '옛 기본 이름'과 안 맞으니 그 항목 이름은 보존한다(✏️ 원칙) —
  //  대신 나머지 단계는 반드시 다 돌아야 한다.
  ['★ name 이 숫자', { snippets: [{ id: 'fcon_on', name: 12, text: 'x', on: false, kind: 'append', group: 'futaCondom', detail: 'futa' }, SANE[1]] },
    { skip: '★ 이름 통일(NAME_OLD · 마지막 단계)', extra: (s) => ((s.find(x => x.id === 'fcon_on') || {}).name === '12') }],
  ['snippets 가 배열이 아님', { snippets: { a: 1 } }, { onlyBoot: true }],
  ['snippets 가 문자열', { snippets: 'oops' }, { onlyBoot: true }],
  ['통째로 이상한 값', { snippets: [1, 'two', true] }, { onlyBoot: true }],
  ['설정 자체가 배열', [1, 2, 3], { onlyBoot: true }],
  ['저장분이 빈 객체', {}, { onlyBoot: true }],
  ['저장분이 깨진 JSON', '__RAW__{not json', { onlyBoot: true }],
];

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const [label, payload, opt] of CASES) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    const raw = (typeof payload === 'string' && payload.startsWith('__RAW__')) ? payload.slice(7) : JSON.stringify(payload);
    await ctx.addInitScript((d) => {
      try { localStorage.setItem('pl_layout', 'anima'); localStorage.setItem('adult_optin_v1', '1');
            localStorage.setItem('anima_settings_v1', d); } catch (e) {}
    }, raw);
    await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
    let booted = true;
    try { await p.waitForFunction(() => typeof _anima !== 'undefined' && !!_anima.snippets, null, { timeout: 12000 }); }
    catch (e) { booted = false; }
    await p.waitForTimeout(700);
    const snips = booted ? await p.evaluate(() =>
      (_anima.snippets || []).map(s => ({ id: s && s.id, name: s && s.name, text: s && s.text, group: s && s.group,
        tName: typeof (s && s.name), tText: typeof (s && s.text) }))) : [];
    ck(`[${label}] 앱이 뜬다`, booted, errs.slice(0, 1).join(''));
    if (!booted) { await ctx.close(); continue; }
    //  ★ 어떤 저장분이 들어와도 name·text 는 반드시 문자열이어야 한다(뒷단계가 .trim() 을 쓴다)
    const badType = snips.filter(s => s.tName !== 'string' || s.tText !== 'string');
    ck(`[${label}] ★ 모든 항목의 name·text 가 문자열로 정규화된다`, badType.length === 0,
       badType.slice(0, 3).map(s => `${s.id}:${s.tName}/${s.tText}`).join(','));
    if (!(opt && opt.onlyBoot)) {
      PROBES.forEach(([n, fn]) => {
        if (opt && opt.skip === n) return;
        let ok = false; try { ok = !!fn(snips); } catch (e) { ok = false; }
        ck(`[${label}] ${n}`, ok, '항목수=' + snips.length);
      });
      if (opt && opt.extra) ck(`[${label}] 옛 기본 이름과 안 맞는 이름은 보존된다`, !!opt.extra(snips), JSON.stringify((snips.find(x => x.id === 'fcon_on') || {}).name));
    } else {
      //  이상한 값이면 기본값 전체를 깔아야 한다(빈 화면이 되면 안 됨)
      ck(`[${label}] 기본 프리셋 전체가 깔린다`, snips.length > 90, '항목수=' + snips.length);
    }
    ck(`[${label}] 콘솔 오류 없음`, errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
