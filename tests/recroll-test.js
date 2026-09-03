// 추천 축 🎲 — 생성할 때마다 담긴 것을 새로 뽑는다 (v9.188.0 — 사용자 요청)
//  ★ 예전 🔄(다른 제안)은 '보여 주는 후보 12개'만 새로 뽑았다 — 담긴 것은 그대로였다.
//    🎲 는 '담긴 것 자체'를 갈아끼운다. 그래서 검사도 후보 목록이 아니라 **에디터 태그**를 본다.
//  ★ 제일 무서운 회귀는 '갈아끼우기'가 아니라 '덧붙이기'가 되는 것 — 굴릴수록 의상이 쌓인다.
//    추천 패널을 한 번도 안 연 상태(_recPickedSet 이 빔)에서 특히 그렇다 → 부트스트랩 가드를 본다.
//  ★ 이미지변환·인페인팅의 '자동 생성'도 comfyGenerate 를 탄다 → 거기선 굴리면 안 된다.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = 9107;
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join('/home/user/promt-lab', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };

const boot = async (b, opt) => {
  opt = opt || {};
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  //  ⚠ addInitScript 는 새로고침마다 다시 심긴다 → 첫 진입에만 심어야 '유지' 검사가 진짜가 된다.
  await ctx.addInitScript((o) => {
    try {
      if (sessionStorage.getItem('__s')) return;
      sessionStorage.setItem('__s', '1');
      localStorage.setItem('pl_layout', o.layout || 'studio');
      localStorage.setItem('adult_optin_v1', '1');
      if (o.roll) localStorage.setItem('rec_roll_axes_v1', o.roll);
    } catch (e) {}
  }, opt);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _DATA_LOOKS !== 'undefined' && !!document.getElementById('final-positive'), null, { timeout: 25000 });
  await p.waitForTimeout(1600);
  //  토스트를 삼키되 무엇이 떴는지는 기록해 둔다
  await p.evaluate(() => { window.__toasts = []; window.showToast = (m) => { window.__toasts.push(String(m)); }; });
  return { ctx, p, errs };
};

//  에디터 계층 텍스트를 그대로 읽는다 (4=의상, 6=배경, 3=외형)
const layers = (p) => p.evaluate(() => {
  const g = (n) => ((document.getElementById('layer-' + n) || {}).value || '').split(',').map(s => s.trim()).filter(Boolean);
  return { l3: g(3), l4: g(4), l6: g(6), fin: (document.getElementById('final-positive') || {}).value || '' };
});
const roll = (p) => p.evaluate(() => { window.__toasts = []; return !!_recRollPickedAxes(); });

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ══ 추천 패널의 🎲 버튼 ══════════════════════════════════════════
  {
    const { ctx, p, errs } = await boot(b);
    await p.evaluate(() => openRecommendModal());
    await p.waitForTimeout(700);
    const ui = await p.evaluate(() => {
      const cols = [...document.querySelectorAll('#rec-modal-overlay .recm-col')];
      return cols.map(c => ({
        name: (c.querySelector('.recm-col-name') || {}).textContent,
        roll: !!c.querySelector('.recm-roll'),
        reroll: !!c.querySelector('.recm-reroll'),
      }));
    });
    const looks = ui.find(x => x.name === '의상'), expo = ui.find(x => x.name === '노출');
    ck('추천 패널이 열리고 축이 그려진다', ui.length >= 3, JSON.stringify(ui));
    ck('★ 의상 축에 🎲 버튼이 있다', !!looks && looks.roll === true, JSON.stringify(looks));
    ck('🔄(다른 제안)은 그대로 남아 있다 (뜻이 다른 버튼이다)', !!looks && looks.reroll === true, JSON.stringify(looks));
    ck('★ 노출 축에는 🎲 가 없다 (부위별 패널이라 굴릴 수 없다)', !expo || expo.roll === false, JSON.stringify(expo));

    // 🎲 켜기 — 재렌더 없이 표시만 바뀌어야 한다(스크롤이 안 튀게)
    const t = await p.evaluate(() => {
      const btn = [...document.querySelectorAll('#rec-modal-overlay .recm-col')]
        .find(c => (c.querySelector('.recm-col-name') || {}).textContent === '의상').querySelector('.recm-roll');
      const before = document.querySelectorAll('#rec-modal-overlay .recm-chip').length;
      window.__toasts = []; btn.click();
      return { on: btn.classList.contains('on'), saved: localStorage.getItem('rec_roll_axes_v1'),
               chipsSame: document.querySelectorAll('#rec-modal-overlay .recm-chip').length === before,
               hint: (document.querySelector('#rec-modal-overlay .recm-rollnow') || {}).textContent || '' };
    });
    ck('★ 🎲 를 누르면 켜지고 저장된다', t.on === true && /looks/.test(t.saved || ''), JSON.stringify(t));
    ck('★ 누를 때 목록을 다시 그리지 않는다 (스크롤이 안 튄다)', t.chipsSame === true);
    ck('안내 줄에 지금 켜진 축이 표시된다', /의상/.test(t.hint), t.hint);
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 굴리면 '갈아끼워진다' — 쌓이지 않는다 ════════════════════════
  {
    const { ctx, p, errs } = await boot(b, { roll: '["looks"]' });
    //  실사용처럼: 추천 패널을 열고 의상을 하나 담는다
    await p.evaluate(() => { openRecommendModal(); });
    await p.waitForTimeout(700);
    await p.evaluate(() => {
      const col = [...document.querySelectorAll('#rec-modal-overlay .recm-col')].find(c => (c.querySelector('.recm-col-name') || {}).textContent === '의상');
      col.querySelector('.recm-chip').click();
    });
    await p.waitForTimeout(500);
    const a = await layers(p);
    ck('의상을 하나 담으면 4계층에 태그가 들어간다', a.l4.length > 0, JSON.stringify(a.l4));

    const ok = await roll(p);
    await p.waitForTimeout(300);
    const c = await layers(p);
    ck('★ 굴리면 의상이 바뀐다', ok === true && c.l4.join(',') !== a.l4.join(','), `${a.l4} → ${c.l4}`);
    ck('★ 최종 프롬프트가 그 자리에서 같이 바뀐다 (전송 전에 동기로)',
       c.fin !== a.fin && c.l4.every(t => c.fin.toLowerCase().includes(t.toLowerCase())), c.fin.slice(0, 120));

    //  ★★ 핵심 회귀 — 20번 굴려도 쌓이면 안 된다
    let maxN = c.l4.length, seen = new Set([c.l4.join(',')]);
    for (let i = 0; i < 20; i++) {
      await roll(p);
      const x = await layers(p);
      maxN = Math.max(maxN, x.l4.length);
      seen.add(x.l4.join(','));
    }
    ck('★★ 20번 굴려도 의상이 쌓이지 않는다', maxN <= a.l4.length + 2, `최대 ${maxN}개 (처음 ${a.l4.length}개)`);
    ck('★ 20번 굴리면 서로 다른 의상이 여러 벌 나온다', seen.size >= 5, `${seen.size}종`);

    const last = await layers(p);
    ck('🎲 안 켠 배경 축은 안 건드린다', last.l6.length === 0, JSON.stringify(last.l6));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 추천 패널을 한 번도 안 열고 굴려도 쌓이지 않는다 (부트스트랩 가드) ══
  //   ⚠ 여기가 제일 잘 새는 자리다 — _recPickedSet 이 비어 있으면 '뺄 것'을 못 찾아 계속 덧붙인다.
  {
    const { ctx, p, errs } = await boot(b, { roll: '["looks","bg"]' });
    //  ★ 태그 개수만 보면 헷갈린다 — 프리셋 하나가 태그 3~5개짜리다.
    //    '몇 벌이 담겨 있는가'(프리셋 개수)를 직접 세는 게 정확하다.
    const cnt = () => p.evaluate(() => {
      const n = (arr) => (arr || []).filter(x => _recPickedSet.has(x)).length;
      return { looks: n(_DATA_LOOKS), bg: n(_DATA_BG) };
    });
    let maxL4 = 0, maxL6 = 0, maxLooks = 0, maxBg = 0;
    for (let i = 0; i < 12; i++) {
      await roll(p);
      const x = await layers(p), c = await cnt();
      maxL4 = Math.max(maxL4, x.l4.length); maxL6 = Math.max(maxL6, x.l6.length);
      maxLooks = Math.max(maxLooks, c.looks); maxBg = Math.max(maxBg, c.bg);
    }
    const x = await layers(p), c = await cnt();
    ck('★★ 패널을 안 열고 12번 굴려도 의상이 한 벌만 담긴다', maxLooks === 1 && c.looks === 1, `최대 ${maxLooks}벌 · 지금 ${c.looks}벌`);
    ck('★★ 배경도 한 곳만 담긴다', maxBg === 1 && c.bg === 1, `최대 ${maxBg}곳 · 지금 ${c.bg}곳`);
    //  ⚠ 태그 상한을 눈대중으로 잡지 말 것 — 프리셋 하나가 7태그짜리도 있다(배경 「아늑한 침실 밤」).
    //    임의 숫자(6)로 뒀다가 정상인데 실패했다. 그 축의 **실제 최대 태그 수**를 재서 상한으로 쓴다.
    const cap = await p.evaluate(() => ({
      looks: Math.max(..._DATA_LOOKS.map(x => (x.tags || []).length)),
      bg: Math.max(..._DATA_BG.map(x => (x.tags || []).length)),
    }));
    ck('★★ 태그도 안 쌓인다 (의상)', maxL4 <= cap.looks, `최대 ${maxL4}개 (한 벌 최대 ${cap.looks}개) · 지금 ${JSON.stringify(x.l4)}`);
    ck('★★ 태그도 안 쌓인다 (배경)', maxL6 <= cap.bg, `최대 ${maxL6}개 (한 곳 최대 ${cap.bg}개) · 지금 ${JSON.stringify(x.l6)}`);
    ck('두 축 모두 실제로 채워져 있다', x.l4.length > 0 && x.l6.length > 0, JSON.stringify(x));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 「생성 전송」 버튼이 실제로 굴린다 (연결 실패는 무시) ═══════════
  {
    const { ctx, p, errs } = await boot(b, { roll: '["looks"]' });
    await p.evaluate(() => { const t = document.getElementById('layer-3'); if (t) { t.value = '1girl, solo'; t.dispatchEvent(new Event('input', { bubbles: true })); t.blur(); } });
    await p.waitForTimeout(400);
    const before = await layers(p);
    await p.evaluate(() => { window.__toasts = []; try { comfyGenerate(); } catch (e) {} });
    await p.waitForTimeout(900);
    const after = await layers(p);
    const toasts = await p.evaluate(() => window.__toasts.slice());
    ck('★ 「생성 전송」을 누르면 굴러간다', after.l4.length > 0 && after.l4.join(',') !== before.l4.join(','), `${before.l4} → ${after.l4}`);
    ck('★ 무엇이 굴렀는지 알려 준다', toasts.some(t => /🎲/.test(t)), JSON.stringify(toasts.slice(0, 3)));
    //  ⚠ 중복 클릭으로 두 번 굴리면 안 된다 (한 번 전송에 한 번)
    const mid = await layers(p);
    await p.evaluate(() => { try { comfyGenerate(); } catch (e) {} try { comfyGenerate(); } catch (e) {} });
    await p.waitForTimeout(900);
    const dbl = await layers(p);
    ck('★ 전송 중 중복 클릭은 다시 굴리지 않는다', dbl.l4.length <= mid.l4.length + 1, `${mid.l4.length} → ${dbl.l4.length}`);
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 안 켜면 아무 일도 안 한다 ════════════════════════════════════
  {
    const { ctx, p, errs } = await boot(b);
    await p.evaluate(() => { const t = document.getElementById('layer-4'); if (t) { t.value = 'school uniform'; t.dispatchEvent(new Event('input', { bubbles: true })); t.blur(); } });
    await p.waitForTimeout(400);
    const a = await layers(p);
    const got = await roll(p);
    await p.waitForTimeout(300);
    const c = await layers(p);
    ck('★ 켠 축이 없으면 굴리지 않는다', got === false && c.l4.join(',') === a.l4.join(','), `${a.l4} → ${c.l4}`);
    //  생성 버튼을 눌러도 프롬프트가 안 바뀌어야 한다(기본 동작 무손상)
    await p.evaluate(() => { try { comfyGenerate(); } catch (e) {} });
    await p.waitForTimeout(800);
    const d = await layers(p);
    ck('★ 기본 동작 무손상 — 생성해도 프롬프트가 그대로다', d.fin === a.fin, `${a.fin.slice(0,60)} → ${d.fin.slice(0,60)}`);
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 완성 모드가 꺼져 있으면 인물 축은 안 굴린다 (화면에 없는 축) ══
  {
    const { ctx, p, errs } = await boot(b, { roll: '["char","looks"]' });
    await p.evaluate(() => { try { localStorage.setItem('rec_full_mode', '0'); } catch (e) {} });
    const a = await layers(p);
    await roll(p); await p.waitForTimeout(300);
    const c = await layers(p);
    const full = await p.evaluate(() => !!_recFullMode);
    ck('완성 모드는 꺼져 있다', full === false);
    ck('★ 화면에 없는 축(인물)은 안 굴린다', c.l3.join(',') === a.l3.join(','), `${a.l3} → ${c.l3}`);
    ck('보이는 축(의상)은 굴린다', c.l4.length > 0, JSON.stringify(c.l4));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 이미지변환에서는 굴리지 않는다 ═══════════════════════════════
  //   그쪽 '자동 생성'도 comfyGenerate 를 탄다 — 원본 분석으로 채운 태그를 무작위로 갈면 안 된다.
  {
    const { ctx, p, errs } = await boot(b, { layout: 'img2img', roll: '["looks","bg"]' });
    await p.evaluate(() => { const t = document.getElementById('layer-4'); if (t) { t.value = 'school uniform'; t.dispatchEvent(new Event('input', { bubbles: true })); t.blur(); } });
    await p.waitForTimeout(400);
    const a = await layers(p);
    const got = await roll(p);
    await p.waitForTimeout(300);
    const c = await layers(p);
    ck('★ 이미지변환에서는 굴리지 않는다', got === false && c.l4.join(',') === a.l4.join(','), `${a.l4} → ${c.l4}`);
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 새로고침 유지 · 백업 키 ══════════════════════════════════════
  {
    const { ctx, p, errs } = await boot(b, { roll: '["looks","bg"]' });
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof _recRollOn === 'function', null, { timeout: 25000 });
    await p.waitForTimeout(1200);
    const keep = await p.evaluate(() => ({ looks: _recRollOn('looks'), bg: _recRollOn('bg'), pose: _recRollOn('pose') }));
    ck('★ 새로고침 뒤에도 켠 축이 남는다', keep.looks && keep.bg && !keep.pose, JSON.stringify(keep));
    //  ⚠ _IO_ETC_KEYS 는 지연 실행 블록 안에 있어 Anima 부팅에선 정의되지 않는다 → 원문에서 본다.
    const src = fs.readFileSync('/home/user/promt-lab/index.html', 'utf8');
    const i = src.indexOf('const _IO_ETC_KEYS = [');
    ck('★ 백업(_IO_ETC_KEYS)에 키가 들어 있다',
       i >= 0 && src.slice(i, src.indexOf('];', i)).indexOf("'rec_roll_axes_v1'") >= 0, '기기를 옮기면 설정이 사라진다');
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
