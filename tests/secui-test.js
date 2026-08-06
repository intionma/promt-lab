// v9.165.0 옵션 UI 재편 검사 — 요약 줄 · 6덩어리 · 접힘 기억 · 하단 바 통일 · 이름 마이그레이션
//  ★ 검사는 반드시 '새로고침을 끼워서' 한다(CLAUDE.md) — 접힘·이름은 저장 왕복에서 새기 쉽다.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join('/home/user/promt-lab', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(p).pipe(r);
});
let f = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) f++; };

const boot = async (b, port, seed, adult) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript((a) => {
    try {
      if (sessionStorage.getItem('__s')) return;
      sessionStorage.setItem('__s', '1');
      localStorage.setItem('pl_layout', 'anima');
      if (a.adult) localStorage.setItem('adult_optin_v1', '1'); else localStorage.removeItem('adult_optin_v1');
      if (a.seed) localStorage.setItem('anima_settings_v1', a.seed);
    } catch (e) {}
  }, { seed: seed || '', adult: adult !== false });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => !!document.getElementById('anima-root'), null, { timeout: 20000 });
  await p.waitForTimeout(1200); await p.evaluate(() => { window.showToast = () => {}; });
  return { ctx, p, errs };
};

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ══ ① 이름 통일 · 순서 ══════════════════════════════════════════════
  const s1 = await boot(b, port);
  const nm = await s1.p.evaluate(() => {
    const g = id => (ANIMA_DEFAULT_SNIPPETS.find(v => v.id === id) || {}).name;
    const ord = grp => ANIMA_DEFAULT_SNIPPETS.filter(v => v.group === grp).map(v => v.id);
    return {
      바뀐것: [g('pubic_bush'), g('armpit_thick'), g('fcon_on'), g('futa_large'), g('tat_fil_arm'), g('dcol_glans'), g('futa_erect_flaccid')],
      그대로: [g('tat_max'), g('preg_on'), g('areola_huge'), g('tan_bikini'), g('dsh_horse'), g('fcon_mouth'), g('futa_cum_normal')],
      후타순서: ord('futa'), 발기순서: ord('futaErect'),
    };
  });
  ck('★ 칩 이름이 통일됐다 (라벨 중복 제거 · 정도 통일)',
     JSON.stringify(nm.바뀐것) === JSON.stringify(['진하게', '진하게', '콘돔', '거근', '팔·어깨', '자주빛', '무발기']), JSON.stringify(nm.바뀐것));
  ck('★ 손대지 말라고 한 이름은 그대로 (문신 3종·임신·유륜·수영복·형태·사정·콘돔 물기)',
     JSON.stringify(nm.그대로) === JSON.stringify(['★ 극한 도배(얼굴~발끝)', '임신', '엄청 큰 유륜', '비키니 자국', '말자지', '콘돔 물기', '사정']), JSON.stringify(nm.그대로));
  ck('★ 후타 크기가 작은 순 (소추·노멀·거근·초거근)',
     JSON.stringify(nm.후타순서) === JSON.stringify(['futa_small', 'futa_normal', 'futa_large', 'futa_huge']), nm.후타순서.join(','));
  ck('★ 발기가 약한 순 (무발기·반발기)',
     JSON.stringify(nm.발기순서) === JSON.stringify(['futa_erect_flaccid', 'futa_erect_half']), nm.발기순서.join(','));
  //  이름만 바꿨지 문구는 안 바뀌었는지 — 그림이 달라지면 안 된다
  const txt = await s1.p.evaluate(() => ({
    bush: (ANIMA_DEFAULT_SNIPPETS.find(v => v.id === 'pubic_bush') || {}).text,
    con: (ANIMA_DEFAULT_SNIPPETS.find(v => v.id === 'fcon_on') || {}).text,
    large: (ANIMA_DEFAULT_SNIPPETS.find(v => v.id === 'futa_large') || {}).text,
  }));
  ck('★ 문구(그림)는 하나도 안 바뀌었다',
     /excessive pubic hair/.test(txt.bush) && /condom on penis/.test(txt.con) && /large penis/.test(txt.large), JSON.stringify(txt).slice(0, 120));

  // ══ ② 패널 구조 ════════════════════════════════════════════════════
  const st = await s1.p.evaluate(() => {
    const box = document.querySelector('#anima-snips');
    return {
      요약: !!box.querySelector('.anima-sum'),
      덩어리: [...box.querySelectorAll('.anima-sec')].map(e => e.dataset.sec),
      머리글: [...box.querySelectorAll('.anima-sec-t')].map(e => e.textContent.trim()),
      펼침: [...box.querySelectorAll('.anima-sec.open')].map(e => e.dataset.sec),
      옛줄: box.querySelectorAll('.anima-orow').length,
    };
  });
  ck('★ 맨 위에 요약 줄이 있다', st.요약);
  ck('★ 6덩어리가 순서대로', JSON.stringify(st.덩어리) === JSON.stringify(['body', 'bust', 'hair', 'futa', 'face', 'ink']), st.덩어리.join(','));
  ck('★ 머리글이 이름만 (v9.165.1에서 이모지 제거)',
     st.머리글.join('|') === '몸|가슴|털|후타|표정·포즈|문신·임신', st.머리글.join('|'));
  ck('처음엔 몸·가슴·털만 펼쳐져 있다', JSON.stringify(st.펼침) === JSON.stringify(['body', 'bust', 'hair']), st.펼침.join(','));
  ck('옛 가로 줄(.anima-orow)은 남아 있지 않다', st.옛줄 === 0, String(st.옛줄));

  // ══ ③ 줄밀림 해결 (사용자가 지적한 그 문제) ═════════════════════════
  const wrap = await s1.p.evaluate(() => {
    const out = {};
    document.querySelectorAll('#anima-snips .anima-sec .anima-fld').forEach(fl => {
      const lab = (fl.querySelector('.anima-fld-l') || {}).textContent;
      const chips = [...fl.querySelectorAll('.anima-chip')];
      if (!lab || !chips.length) return;
      out[lab.trim()] = new Set(chips.map(c => Math.round(c.getBoundingClientRect().top))).size;
    });
    return out;
  });
  ck('★ 가슴 6단계가 한 줄에 (예전엔 딱 하나 때문에 두 줄)', wrap['크기'] === 1, JSON.stringify(wrap));
  ck('★ 유두 색 5개가 한 줄에', wrap['유두 색'] === 1, JSON.stringify(wrap));

  // ══ ④ 요약 줄이 '다시 그리지 않는 경로'에서도 따라온다 ══════════════
  await s1.p.evaluate(() => { ['skin_dark', 'nip_lightpink', 'areola_huge'].forEach(id => _animaToggleSnip(id)); });
  await s1.p.waitForTimeout(300);
  const sum = await s1.p.evaluate(() => {
    const box = document.querySelector('#anima-snips');
    return {
      토큰: [...box.querySelectorAll('.anima-sum-t')].map(e => e.textContent.trim()),
      가슴배지: ((box.querySelector('.anima-sec[data-sec="bust"] .anima-sec-n') || {}).textContent) || '',
      몸배지: ((box.querySelector('.anima-sec[data-sec="body"] .anima-sec-n') || {}).textContent) || '',
      끄기버튼: !!box.querySelector('.anima-sum-clr'),
    };
  });
  ck('★ 칩을 켜면 요약 줄이 그 자리에서 따라온다',
     sum.토큰.some(t => /흑갈/.test(t)) && sum.토큰.some(t => /연분홍/.test(t)), sum.토큰.join(' / '));
  ck('★ 덩어리 머리글의 개수 배지도 따라온다', sum.가슴배지 === '2개 켜짐' && sum.몸배지 === '1개 켜짐', sum.몸배지 + ' / ' + sum.가슴배지);
  ck('켠 게 있으면 [옵션 전부 끄기]가 나온다', sum.끄기버튼);

  // ══ ⑤ 후타 상세는 후타를 켰을 때만 ═════════════════════════════════
  const f0 = await s1.p.evaluate(() => {
    document.querySelector('.anima-sec[data-sec="futa"] .anima-sec-h').click();
    return [...document.querySelectorAll('.anima-sec[data-sec="futa"] .anima-fld-l')].map(e => e.textContent.trim());
  });
  ck('후타를 끄면 [크기]만 보인다', JSON.stringify(f0) === JSON.stringify(['크기']), f0.join(','));
  await s1.p.evaluate(() => { _animaToggleSnip('futa_large'); _animaRenderSnippets(); });
  await s1.p.waitForTimeout(300);
  const f1 = await s1.p.evaluate(() => [...document.querySelectorAll('.anima-sec[data-sec="futa"] .anima-fld-l')].map(e => e.textContent.trim()));
  ck('★ 후타를 켜면 상세 칸이 전부 나온다',
     JSON.stringify(f1) === JSON.stringify(['크기', '색', '귀두', '발기', '포피', '사정', '콘돔', '형태']), f1.join(','));

  // ══ ⑥ 하단 바가 패널과 같아졌다 ════════════════════════════════════
  const bar = await s1.p.evaluate(() => {
    const m = document.querySelector('#anima-mact');
    return {
      키: [...m.querySelectorAll('.anima-gbtn[data-grp]')].map(x => x.dataset.grp),
      이름: [...m.querySelectorAll('.anima-gbtn-k')].map(x => x.textContent.trim()),
      줄수: new Set([...m.querySelectorAll('.anima-mact-grp .anima-gbtn')].map(x => Math.round(x.getBoundingClientRect().top))).size,
      높이: Math.round(m.getBoundingClientRect().height),
      값: [...m.querySelectorAll('.anima-gbtn')].map(x => ((x.querySelector('.anima-gbtn-k') || {}).textContent || '') + '=' + (((x.querySelector('.anima-gbtn-v') || {}).textContent) || '')),
    };
  });
  ck('★ 하단 바도 같은 6덩어리·같은 순서', JSON.stringify(bar.키) === JSON.stringify(['body', 'bust', 'hair', 'futa', 'face', 'ink']), bar.키.join(','));
  ck('★ 하단 바 이름이 패널 이름과 같다',
     bar.이름.join('|') === '몸|가슴|털|후타|표정·포즈|문신·임신', bar.이름.join('|'));
  ck('★ 버튼 줄이 두 줄을 넘지 않는다 (하단 바가 두꺼워지지 않음)', bar.줄수 <= 2, String(bar.줄수));
  ck('★ 후타 버튼이 생겼고 고른 값이 보인다', bar.값.some(v => /^후타=거근/.test(v)), bar.값.join(' / '));
  console.log('  · 하단 바 ' + bar.높이 + 'px · ' + bar.값.join(' / '));

  const pop = await s1.p.evaluate(() => {
    document.querySelector('.anima-gbtn[data-grp="futa"]').click();
    const el = document.getElementById('anima-grppop');
    return el ? { 제목: el.querySelector('.anima-fp-head span').textContent.trim(),
                  소제목: [...el.querySelectorAll('.anima-fp-lab')].map(e => e.textContent.trim()) } : null;
  });
  ck('★ 후타 팝오버 소제목이 패널 칸과 같다',
     pop && pop.제목 === '후타' && JSON.stringify(pop.소제목) === JSON.stringify(['크기', '색', '귀두', '발기', '포피', '사정', '콘돔', '형태']),
     JSON.stringify(pop));

  // ══ ⑦ 접힘이 새로고침 뒤에도 남는다 (★ 새로고침 필수) ═══════════════
  await s1.p.evaluate(() => { document.body.click(); document.querySelector('.anima-sec[data-sec="bust"] .anima-sec-h').click(); });
  await s1.p.waitForTimeout(250);
  await s1.p.reload({ waitUntil: 'load' });
  await s1.p.waitForFunction(() => !!document.getElementById('anima-root'), null, { timeout: 20000 });
  await s1.p.waitForTimeout(1200);
  const after = await s1.p.evaluate(() => ({
    펼침: [...document.querySelectorAll('#anima-snips .anima-sec.open')].map(e => e.dataset.sec),
    켜짐: (_anima.snippets || []).filter(s => s.on).map(s => s.id).sort(),
  }));
  ck('★ 새로고침해도 접어 둔 [가슴]이 접혀 있다', after.펼침.indexOf('bust') < 0 && after.펼침.indexOf('body') >= 0, after.펼침.join(','));
  ck('★ 새로고침 뒤에도 켠 것이 그대로', ['areola_huge', 'futa_large', 'nip_lightpink', 'skin_dark'].every(id => after.켜짐.includes(id)), after.켜짐.join(','));

  // ══ ⑧ 옵션 전부 끄기 — 두 번 눌러야 실행 ════════════════════════════
  const clr1 = await s1.p.evaluate(() => {
    const x = document.querySelector('.anima-sum-clr'); x.click();
    return { 무장: x.classList.contains('arm'), 남음: (_anima.snippets || []).filter(s => s.on).length };
  });
  ck('★ 한 번 누르면 확인 상태만 (안 꺼짐)', clr1.무장 && clr1.남음 > 0, JSON.stringify(clr1));
  const clr2 = await s1.p.evaluate(() => {
    document.querySelector('.anima-sum-clr').click();
    return { 남음: (_anima.snippets || []).filter(s => s.on).length, 프롬프트: (_anima.prompt || '').length };
  });
  ck('★ 두 번째에 전부 꺼진다 (노출 프롬프트는 그대로)', clr2.남음 === 0 && clr2.프롬프트 > 0, JSON.stringify(clr2));
  ck('콘솔 오류 없음', s1.errs.length === 0, s1.errs.slice(0, 3).join(' | '));
  await s1.ctx.close();

  // ══ ⑨ 이름 마이그레이션 — 옛 기본 이름만 교체, ✏️ 수정본은 보존 ══════
  const seed = JSON.stringify({ snippets: [
    { id: 'pubic_bush', name: '무성하게', text: 'x', on: false, kind: 'append', group: 'pubic', nsfw: true },
    { id: 'fcon_on', name: '콘돔 착용', text: 'y', on: false, kind: 'append', group: 'futaCondom', detail: 'futa', nsfw: true },
    { id: 'tat_fil_arm', name: '장식 · 팔/어깨', text: 'w', on: false, kind: 'append', group: 'tatfil', nsfw: true, multi: true },
    { id: 'futa_large', name: '내가 붙인 이름', text: 'z', on: false, kind: 'append', group: 'futa' },
  ] });
  const s2 = await boot(b, port, seed);
  const mig = await s2.p.evaluate(() => {
    const g = id => (_anima.snippets.find(x => x.id === id) || {}).name;
    return { bush: g('pubic_bush'), con: g('fcon_on'), arm: g('tat_fil_arm'), large: g('futa_large') };
  });
  ck('★ 기존 사용자의 옛 기본 이름이 새 이름으로 올라간다',
     mig.bush === '진하게' && mig.con === '콘돔' && mig.arm === '팔·어깨', JSON.stringify(mig));
  ck('★ ✏️로 직접 고친 이름은 보존된다', mig.large === '내가 붙인 이름', mig.large);
  ck('콘솔 오류 없음(기존 사용자)', s2.errs.length === 0, s2.errs.slice(0, 3).join(' | '));
  await s2.ctx.close();

  // ══ ⑩ 성인 표시를 끄면 후타 덩어리가 통째로 사라진다 ════════════════
  const s3 = await boot(b, port, '', false);
  const na = await s3.p.evaluate(() => ({
    덩어리: [...document.querySelectorAll('#anima-snips .anima-sec')].map(e => e.dataset.sec),
    버튼: [...document.querySelectorAll('#anima-mact .anima-gbtn[data-grp]')].map(x => x.dataset.grp),
    기타: [...document.querySelectorAll('#anima-snips .anima-fld-l')].map(e => e.textContent.trim()).filter(t => t === '기타').length,
  }));
  ck('★ 성인 표시를 끄면 패널에서 후타 덩어리가 빠진다', na.덩어리.indexOf('futa') < 0, na.덩어리.join(','));
  ck('★ 하단 바에서도 후타 버튼이 빠진다', na.버튼.indexOf('futa') < 0, na.버튼.join(','));
  ck('★ 후타가 "기타" 줄로 새지 않는다', na.기타 === 0, String(na.기타));
  ck('콘솔 오류 없음(성인 끔)', s3.errs.length === 0, s3.errs.slice(0, 3).join(' | '));
  await s3.ctx.close();

  await b.close(); srv.close();
  console.log(f ? `\n${f} FAILED` : '\nALL PASS');
  process.exit(f ? 1 : 0);
})();
