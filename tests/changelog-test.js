// 업데이트 내역: 최근 것만 앱에 싣고 예전 것은 눌렀을 때 받아온다 (v9.172.0)
//  ★ 배경: 내역 JSON 만 276KB(문서의 11%)였다. 앱에 최근 60개만 남기고 나머지는
//    data/changelog-archive.json 으로 뺐다 → 내려받는 크기 637KB → 575KB(gzip).
//  ★ 반드시 확인할 것: ① 최신 버전이 맨 위 ② [예전 내역 더 보기]로 옛 것까지 다 볼 수 있다
//    ③ 인터넷이 없거나 'HTML 저장'으로 파일 하나만 쓰는 경우에도 앱이 멀쩡하고 안내가 뜬다
//    ④ 앱 안 버전 세 곳(title·툴팁·내역 맨 위)이 서로 어긋나지 않는다
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/promt-lab';
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': /\.json$/.test(p) ? 'application/json' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});
let F = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ' :: ' + d)); if (!c) F++; };

(async () => {
  // ── 파일 차원 검사 (브라우저 없이) ────────────────────────────────
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const inline = JSON.parse(/<script type="application\/json" id="pl-changelog-data">(.*?)<\/script>/s.exec(html)[1]);
  ck('앱에 실린 내역이 60개 이하', inline.length <= 60, String(inline.length));
  ck('★ 아카이브 파일이 있다', fs.existsSync(path.join(ROOT, 'data/changelog-archive.json')));
  const arch = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/changelog-archive.json'), 'utf8'));
  ck('아카이브가 비어 있지 않다', arch.length > 0, String(arch.length));
  const dup = inline.map(e => e.version).filter(v => arch.some(a => a.version === v));
  ck('★ 앱과 아카이브에 겹치는 버전이 없다', dup.length === 0, dup.join(','));
  //  버전 세 곳이 맞는가 (CLAUDE.md 규칙)
  const tv = /<title>PRO PROMPT ARCHITECT (v[\d.]+)/.exec(html)[1];
  const pv = /app-version-tooltip">(v[\d.]+)/.exec(html)[1];
  ck('★ title · 툴팁 · 내역 맨 위의 버전이 모두 같다',
     tv === pv && pv === inline[0].version, `${tv} / ${pv} / ${inline[0].version}`);
  ck('맨 위 항목만 "최신" 표시', inline[0].time === '최신' && inline.slice(1).every(e => e.time === ''), JSON.stringify(inline.slice(0, 2).map(e => e.time)));
  //  기록이 통째로 사라지진 않았는가
  ck('★ 앱 + 아카이브 = 예전 전체 개수 이상', inline.length + arch.length >= 370, String(inline.length + arch.length));

  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });

  const openAndCount = async (p) => p.evaluate(async () => {
    openChangelogModal();
    const body = document.getElementById('changelog-body');
    const vers = () => [...body.querySelectorAll('span')].map(s => s.textContent).filter(t => /^v\d/.test(t));
    return { n: vers().length, first: vers()[0], last: vers().slice(-1)[0], btn: !!body.querySelector('button') };
  });

  // ── ① 평소(인터넷 있음) ────────────────────────────────────────
  const p1 = await ctx.newPage(); const e1 = []; p1.on('pageerror', e => e1.push(e.message));
  await p1.addInitScript(() => { try { localStorage.setItem('pl_layout', 'anima'); } catch (e) {} });
  await p1.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await p1.waitForTimeout(2000);
  const a = await openAndCount(p1);
  ck('내역 창이 최근 것부터 열린다', a.n === inline.length && a.first === inline[0].version, JSON.stringify(a));
  ck('[예전 내역 더 보기] 버튼이 있다', a.btn);
  const c = await p1.evaluate(async () => {
    document.getElementById('changelog-body').querySelector('button').click();
    await new Promise(r => setTimeout(r, 1500));
    const body = document.getElementById('changelog-body');
    const vers = [...body.querySelectorAll('span')].map(s => s.textContent).filter(t => /^v\d/.test(t));
    return { n: vers.length, first: vers[0], last: vers[vers.length - 1], btn: !!body.querySelector('button') };
  });
  ck('★ 더 보기를 누르면 예전 내역이 전부 이어 붙는다', c.n === inline.length + arch.length, `${c.n} vs ${inline.length + arch.length}`);
  ck('맨 위는 여전히 최신', c.first === inline[0].version, c.first);
  ck('맨 아래는 가장 오래된 것', c.last === arch[arch.length - 1].version, `${c.last} vs ${arch[arch.length - 1].version}`);
  ck('다 불러오면 버튼이 사라진다', !c.btn);
  ck('오류 없음', e1.length === 0, e1.slice(0, 2).join(' | '));

  // ── ② 인터넷 없음 / 파일 하나로 저장해 쓰는 경우 ──────────────────
  const p2 = await ctx.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message));
  await p2.route('**/changelog-archive.json', r => r.abort());
  await p2.addInitScript(() => { try { localStorage.setItem('pl_layout', 'anima'); } catch (e) {} });
  await p2.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await p2.waitForTimeout(2000);
  const d = await openAndCount(p2);
  ck('★ 아카이브를 못 받아도 최근 내역은 그대로 보인다', d.n === inline.length && d.first === inline[0].version, JSON.stringify(d));
  const e = await p2.evaluate(async () => {
    const body = document.getElementById('changelog-body');
    body.querySelector('button').click();
    await new Promise(r => setTimeout(r, 1500));
    const btn = body.querySelector('button');
    const vers = [...body.querySelectorAll('span')].map(s => s.textContent).filter(t => /^v\d/.test(t));
    return { msg: btn ? btn.textContent : null, disabled: btn ? btn.disabled : null, n: vers.length };
  });
  ck('★ 못 받으면 이유를 알려주고 다시 눌러볼 수 있다', /인터넷/.test(e.msg || '') && e.disabled === false, JSON.stringify(e));
  ck('실패해도 이미 보이던 내역은 안 사라진다', e.n === inline.length, String(e.n));
  ck('오류 없음(오프라인)', e2.length === 0, e2.slice(0, 2).join(' | '));

  await b.close(); srv.close();
  console.log(F ? `\n${F} FAILED` : '\nALL PASS');
  process.exit(F ? 1 : 0);
})();
