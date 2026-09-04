// 연속 자동 생성 (v9.191.0) — 생성 버튼 꾹 누르기 → 창 → 대기열을 계속 채운다
//  ★ 설계·충돌 감사: docs/AUTOGEN-연속생성.md (C1~C12). 여기 검사는 그 12개를 하나씩 본다.
//  ⚠ 진짜 ComfyUI 가 없으므로 comfyGenerate / comfyQuickSend 를 가짜로 갈아끼우고
//    _comfyQueueCount 를 직접 움직여 '한 장 끝남'을 흉내 낸다. 성공 판정이 큐 증감이라 이게 맞다.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = 9131;
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join('/home/user/promt-lab', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };

const boot = async (b, layout, w, h) => {
  const ctx = await b.newContext({ viewport: { width: w || 1440, height: h || 900 }, hasTouch: !!(w && w < 800), isMobile: !!(w && w < 800) });
  await ctx.addInitScript((l) => {
    try {
      if (sessionStorage.getItem('__s')) return;
      sessionStorage.setItem('__s', '1');
      localStorage.setItem('pl_layout', l); localStorage.setItem('adult_optin_v1', '1');
    } catch (e) {}
  }, layout || 'studio');
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof _plAutoPump === 'function', null, { timeout: 25000 });
  await p.waitForTimeout(1400);
  //  가짜 전송 — comfyGenerate 가 하는 일(성공하면 큐 +1)만 흉내 낸다
  await p.evaluate(() => {
    window.__t = []; window.showToast = (m, k) => window.__t.push(String(m));
    window.__sent = []; window.__failMode = false;
    window.comfyGenerate = async () => {
      window.__sent.push('modal');
      await new Promise(r => setTimeout(r, 30));
      if (window.__failMode) return;                 // 실패 = 큐가 안 늘어난다
      _comfyQueueCount++;
    };
    window.comfyQuickSend = async (t) => {
      window.__sent.push(t);
      await new Promise(r => setTimeout(r, 30));
      if (window.__failMode) return;
      _comfyQueueCount++;
    };
    //  한 장 끝남 — 실제로는 _comfyFinalize 가 하는 일
    window.__done = () => { _comfyQueueCount = Math.max(0, _comfyQueueCount - 1); _plAutoPump(); };
  });
  return { ctx, p, errs };
};
const S = (p) => p.evaluate(() => ({
  on: _plAuto.on, made: _plAuto.made, keep: _plAuto.keep, cap: _plAuto.cap,
  fails: _plAuto.fails, route: _plAuto.route, q: _comfyQueueCount, sent: window.__sent.length,
}));

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ══ 진입 — 꾹 누르기 · 우클릭 (C8) ═══════════════════════════════
  {
    const { ctx, p, errs } = await boot(b);
    const tagged = await p.evaluate(() => [...document.querySelectorAll('[data-pl-gen]')].map(x => x.dataset.plGen));
    ck('생성 버튼에 data-pl-gen 표식이 붙어 있다', tagged.length >= 4 && tagged.indexOf('multi') >= 0, JSON.stringify(tagged));
    //  우클릭으로 열기
    await p.evaluate(() => { document.getElementById('comfy-send-btn').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
    await p.waitForTimeout(400);
    ck('★ 우클릭하면 창이 뜬다', await p.evaluate(() => !!document.getElementById('pl-auto-ov')));
    ck('꾹 누른 버튼의 경로를 기억한다', (await S(p)).route === 'modal');
    await p.evaluate(() => _plAutoClose()); await p.waitForTimeout(200);
    //  꾹 누르기(480ms) — 그리고 뒤따르는 클릭이 생성으로 새면 안 된다
    //  ⚠ #comfy-send-btn 은 ComfyUI 창 안이라 닫혀 있으면 좌표가 없다(bounding box null).
    //    실제 손가락 조작을 재현하려면 창을 먼저 열어야 한다.
    await p.evaluate(() => openComfyModal());
    await p.waitForTimeout(700);
    await p.evaluate(() => document.getElementById('comfy-send-btn').scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(300);
    const btn = await p.$('#comfy-send-btn');
    const box = await btn.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
    await p.waitForTimeout(700);
    await p.mouse.up();
    await p.waitForTimeout(400);
    const st = await S(p);
    ck('★ 480ms 꾹 누르면 창이 뜬다', await p.evaluate(() => !!document.getElementById('pl-auto-ov')));
    ck('★★ 꾹 누른 뒤의 클릭이 생성으로 새지 않는다 (C8)', st.sent === 0, `${st.sent}건 전송됨`);
    //  짧게 누르면(=평소 클릭) 창이 안 뜬다
    await p.evaluate(() => _plAutoClose()); await p.waitForTimeout(200);
    await p.click('#comfy-send-btn'); await p.waitForTimeout(400);
    ck('짧게 누르면 창이 안 뜨고 평소대로 생성된다',
       !(await p.evaluate(() => !!document.getElementById('pl-auto-ov'))) && (await S(p)).sent === 1, JSON.stringify(await S(p)));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 대기열을 keep+1 로 유지한다 ═══════════════════════════════════
  {
    const { ctx, p, errs } = await boot(b);
    await p.evaluate(() => { _plAuto.keep = 1; _plAutoStart('modal'); });
    await p.waitForTimeout(900);
    const a = await S(p);
    ck('★★ 켜면 큐를 keep+1(=2)까지 채운다', a.q === 2 && a.made === 2, JSON.stringify(a));
    ck('그 이상은 안 넣는다', a.sent === 2, `${a.sent}건`);
    //  한 장 끝나면 즉시 한 장 보충
    await p.evaluate(() => window.__done()); await p.waitForTimeout(700);
    const c = await S(p);
    ck('★★ 한 장 끝나면 즉시 한 장 보충한다', c.q === 2 && c.made === 3, JSON.stringify(c));
    //  유지 개수를 3으로 올리면 그만큼 더 채운다
    await p.evaluate(() => { _plAuto.keep = 3; _plAutoPump(); }); await p.waitForTimeout(900);
    const d = await S(p);
    ck('★ 유지 개수를 올리면 그만큼 더 채운다', d.q === 4, JSON.stringify(d));
    await p.evaluate(() => _plAutoStop()); await p.waitForTimeout(300);
    const e2 = await S(p);
    ck('★ 멈추면 새로 안 넣는다 (A안)', e2.on === false);
    await p.evaluate(() => window.__done()); await p.waitForTimeout(700);
    ck('★ 멈춘 뒤에는 한 장 끝나도 보충 안 한다', (await S(p)).q === 3, JSON.stringify(await S(p)));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ C1 — 전송 잠금에 걸려도 포기하지 않고 재시도한다 ══════════════
  {
    const { ctx, p, errs } = await boot(b);
    await p.evaluate(() => { _comfySendingFor.add('modal'); _plAuto.keep = 1; _plAutoStart('modal'); });
    await p.waitForTimeout(500);
    const a = await S(p);
    ck('잠겨 있는 동안은 안 보낸다', a.sent === 0 && a.on === true, JSON.stringify(a));
    await p.evaluate(() => { _comfySendingFor.delete('modal'); });
    await p.waitForTimeout(1600);
    const c = await S(p);
    ck('★★ 잠금이 풀리면 스스로 다시 보낸다 (C1 — 여기서 포기하면 영영 멈춘다)', c.sent >= 1 && c.q >= 1, JSON.stringify(c));
    await p.evaluate(() => _plAutoStop());
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ C7 — 연속 실패 3회면 멈춘다 ══════════════════════════════════
  {
    const { ctx, p, errs } = await boot(b);
    await p.evaluate(() => { window.__failMode = true; _plAutoStart('modal'); });
    await p.waitForTimeout(9000);
    const a = await S(p);
    const t = await p.evaluate(() => window.__t.slice());
    ck('★★ 연속 실패 3회면 스스로 멈춘다 (C7 — 토스트 폭탄 방지)', a.on === false && a.q === 0, JSON.stringify(a));
    ck('멈춘 이유를 알려 준다', t.some(x => /3번|연달아/.test(x)), JSON.stringify(t.slice(-2)));
    ck('무한 재시도하지 않는다', a.sent <= 5, `${a.sent}회 시도`);
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 상한 · 설정 저장 ═════════════════════════════════════════════
  {
    const { ctx, p, errs } = await boot(b);
    //  ⚠ 상한 3 은 **고를 수 있는 값이 아니다**(0·20·50·100). 저장분 검증이 걸러내는 게 맞다.
    //    그래서 '멈춤'은 3 으로(런타임만) 보고, '저장'은 실제 사용자 경로(세그먼트 클릭)로 따로 본다.
    await p.evaluate(() => { _plAuto.keep = 1; _plAuto.cap = 3; _plAutoStart('modal'); });
    for (let i = 0; i < 6; i++) { await p.evaluate(() => window.__done()); await p.waitForTimeout(350); }
    const a = await S(p);
    ck('★ 상한에 닿으면 멈춘다', a.on === false && a.made === 3, JSON.stringify(a));
    //  실제 사용자 경로 — 창을 열어 세그먼트를 눌러 고른다
    await p.evaluate(() => _plAutoOpen('modal')); await p.waitForTimeout(400);
    await p.evaluate(() => { document.querySelector('[data-cap="50"]').click(); document.querySelector('[data-keep="2"]').click(); });
    await p.waitForTimeout(300);
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof _plAuto !== 'undefined', null, { timeout: 25000 });
    await p.waitForTimeout(1200);
    const r = await p.evaluate(() => ({ on: _plAuto.on, cap: _plAuto.cap, keep: _plAuto.keep, saved: localStorage.getItem('autogen_opts_v1') }));
    ck('★★ 새로고침하면 반드시 꺼져 있다 (C6 — 저장하면 몰래 생성이 시작된다)', r.on === false, JSON.stringify(r));
    ck('★ 고른 설정(유지 개수·상한)은 남는다', r.cap === 50 && r.keep === 2, JSON.stringify(r));
    ck('★ 고를 수 없는 값은 저장분에서 걸러진다', /"cap":50/.test(r.saved || ''), JSON.stringify(r.saved));
    const bk = (() => {
      const src = fs.readFileSync('/home/user/promt-lab/index.html', 'utf8');
      const i = src.indexOf('const _IO_ETC_KEYS = [');
      return i >= 0 && src.slice(i, src.indexOf('];', i)).indexOf("'autogen_opts_v1'") >= 0;
    })();
    ck('★ 백업(_IO_ETC_KEYS)에 설정 키가 들어 있다', bk === true);
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ C9 — 모든 생성 버튼이 바뀐다 · 눌러서 멈춘다 ═════════════════
  {
    const { ctx, p, errs } = await boot(b);
    //  숨어 있는 버튼도 표식은 있어야 한다 → 전부 보이게 해서 실제 모습까지 본다
    await p.evaluate(() => { document.querySelectorAll('[data-pl-gen]').forEach(x => x.style.display = 'inline-flex'); });
    const before = await p.evaluate(() => [...document.querySelectorAll('[data-pl-gen]')].map(x => x.textContent.trim().slice(0, 12)));
    await p.evaluate(() => _plAutoStart('modal')); await p.waitForTimeout(700);
    const on = await p.evaluate(() => [...document.querySelectorAll('[data-pl-gen]')].map(x => ({
      k: x.dataset.plGen, t: x.textContent.trim(), on: x.classList.contains('pl-gen-on'), lock: x.classList.contains('pl-gen-lock'),
      sp: !!x.querySelector('.pl-sp'),
    })));
    const sends = on.filter(x => x.k === 'send'), multi = on.filter(x => x.k === 'multi');
    ck('★★ 생성 버튼이 전부 「연속 생성 중」으로 바뀐다 (C9)',
       sends.length >= 3 && sends.every(x => x.on && x.sp && /연속 생성 중/.test(x.t)), JSON.stringify(sends.map(x => x.t)));
    ck('★ 「빠르게 생성」은 교체가 아니라 잠금 (C4)',
       multi.length >= 1 && multi.every(x => x.lock && !x.on), JSON.stringify(multi));
    //  아무 생성 버튼이나 누르면 멈춘다
    const q0 = (await S(p)).sent;
    await p.evaluate(() => document.getElementById('btn-comfy-send-pos').click());
    await p.waitForTimeout(500);
    const a = await S(p);
    ck('★★ 도는 중에 생성 버튼을 누르면 멈춘다 (새 전송이 아니다)', a.on === false && a.sent === q0, JSON.stringify(a));
    const after = await p.evaluate(() => [...document.querySelectorAll('[data-pl-gen]')].map(x => x.textContent.trim().slice(0, 12)));
    ck('★★ 멈추면 버튼이 원래 글자로 돌아온다', JSON.stringify(after) === JSON.stringify(before), JSON.stringify({ before, after }));
    //  「빠르게 생성」은 도는 중에 눌러도 안 돈다
    await p.evaluate(() => { window.__t = []; _plAutoStart('modal'); });
    await p.waitForTimeout(600);
    await p.evaluate(() => { window.multiGenStart = () => { window.__mg = true; }; document.querySelector('[data-pl-gen="multi"]').click(); });
    await p.waitForTimeout(400);
    ck('★ 잠긴 「빠르게 생성」은 눌러도 안 돈다', !(await p.evaluate(() => !!window.__mg)));
    ck('그 이유를 알려 준다', (await p.evaluate(() => window.__t.slice())).some(x => /빠르게 생성/.test(x)));
    await p.evaluate(() => _plAutoStop());
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ C3/C10 — 레이아웃 게이트 ═════════════════════════════════════
  {
    const { ctx, p, errs } = await boot(b);
    await p.evaluate(() => _plAutoStart('modal')); await p.waitForTimeout(600);
    ck('스튜디오에서는 돈다', (await S(p)).on === true);
    await p.evaluate(() => applyLayout('anima')); await p.waitForTimeout(2200);
    const a = await S(p);
    ck('★★ Anima 로 옮기면 자동으로 꺼진다 (끌 버튼이 사라지므로 · C3)', a.on === false, JSON.stringify(a));
    const t = await p.evaluate(() => window.__t.slice(-3));
    ck('그 사실을 알려 준다', t.some(x => /레이아웃/.test(x)), JSON.stringify(t));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  {
    const { ctx, p, errs } = await boot(b, 'inpaint');
    await p.evaluate(() => _plAutoStart('modal')); await p.waitForTimeout(600);
    const a = await S(p);
    ck('★ 인페인팅에서는 아예 안 켜진다', a.on === false && a.sent === 0, JSON.stringify(a));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 창 — 기본 HTML 컨트롤을 안 쓴다 · 🎲 안내 ════════════════════
  {
    const { ctx, p, errs } = await boot(b, 'studio', 390, 844);
    await p.evaluate(() => _plAutoOpen('modal')); await p.waitForTimeout(500);
    const ui = await p.evaluate(() => {
      const pop = document.querySelector('#pl-auto-ov .pl-auto-pop');
      const r = pop.getBoundingClientRect();
      return {
        폭: Math.round(r.width), 삐짐: r.right > innerWidth + 1 || r.left < -1,
        기본컨트롤: pop.querySelectorAll('select,input,textarea').length,
        세그: pop.querySelectorAll('.pl-auto-seg').length,
        경고: !!pop.querySelector('.pl-auto-dice.warn'),
        시작버튼: (pop.querySelector('.pl-auto-run') || {}).textContent,
      };
    });
    ck('★★ 기본 HTML 컨트롤(select·input)을 하나도 안 쓴다', ui.기본컨트롤 === 0, String(ui.기본컨트롤));
    ck('★ 알약 세그먼트로 고른다', ui.세그 === 7, `${ui.세그}개 (유지3 + 상한4)`);
    ck('★ 폰 390px 에서 안 삐진다', !ui.삐짐 && ui.폭 <= 360, JSON.stringify(ui));
    ck('★★ 🎲 를 안 켰으면 경고로 알려 준다 (C2 — 안 그러면 같은 그림만 나온다)', ui.경고 === true);
    //  세그먼트를 눌러 값이 바뀌는가 (핸들러가 붙어 있는가가 아니라 실제로)
    await p.evaluate(() => document.querySelector('[data-keep="3"]').click());
    await p.waitForTimeout(300);
    ck('★ 세그먼트를 누르면 값이 바뀐다', (await S(p)).keep === 3, JSON.stringify(await S(p)));
    //  🎲 를 켜면 축 이름이 뜬다
    await p.evaluate(() => { _recRollToggle('looks'); _plAutoRenderPop(); });
    await p.waitForTimeout(300);
    const dz = await p.evaluate(() => {
      const d = document.querySelector('#pl-auto-ov .pl-auto-dice');
      return { warn: d.classList.contains('warn'), txt: d.textContent };
    });
    ck('★ 🎲 를 켜면 그 칸 이름이 뜬다', !dz.warn && /의상/.test(dz.txt), JSON.stringify(dz.txt.slice(0, 40)));
    //  뒤로가기로 닫힌다
    await p.goBack(); await p.waitForTimeout(500);
    ck('★ 뒤로가기로 창이 닫힌다', !(await p.evaluate(() => !!document.getElementById('pl-auto-ov'))));
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 경로 유지 — 꾹 누른 버튼의 경로로 계속 보낸다 ═══════════════
  {
    const { ctx, p, errs } = await boot(b);
    await p.evaluate(() => { _plAuto.keep = 1; _plAutoStart('pos'); });
    await p.waitForTimeout(900);
    const sent = await p.evaluate(() => window.__sent.slice());
    ck('★ 꾹 누른 버튼의 경로(pos)로 계속 보낸다', sent.length >= 2 && sent.every(x => x === 'pos'), JSON.stringify(sent));
    await p.evaluate(() => _plAutoStop());
    ck('오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
