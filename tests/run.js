#!/usr/bin/env node
// 검사 실행기 — 병렬로 돌리되, 흔들리면 안 되는 것은 혼자 돌린다.
//
//  왜: 검사 33개를 하나씩 돌리면 4코어 컨테이너에서 약 20분이 걸린다.
//      검사마다 크로미움을 새로 띄우고 2.2MB 짜리 앱을 통째로 로드하는데,
//      responsive 는 폭 11 × 화면 5 = 55회, glass 는 12회 + 스크린샷 디코딩을 한다.
//
//  ★ 그냥 전부 병렬로 돌리면 안 된다. 여러 검사가 `waitForTimeout` 으로 '이만큼 기다리면
//    그려져 있겠지' 를 전제하는데, CPU 를 나눠 쓰면 그 시간 안에 못 끝나 **가짜 실패**가 난다.
//    가짜 실패는 그냥 느린 것보다 나쁘다 — "진짜인가 경합인가" 를 사람이 판별해야 하기 때문.
//    그래서 픽셀·요청 수·크기를 재는 것들은 SOLO 로 빼서 혼자 돌린다.
//
//  쓰는 법:
//    node tests/run.js                 전체 (병렬 + SOLO 는 순차)
//    node tests/run.js --jobs 3        동시 실행 수 지정 (기본 2)
//    node tests/run.js bar             무리 이름으로 관련 검사만
//    node tests/run.js color secui     파일 이름으로 골라서
//    node tests/run.js --list          무리 목록 보기
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net');
const DIR = __dirname;

//  ★ 혼자 돌려야 하는 것 — '무엇을 재는가' 로 정한다(느려서가 아니다).
const SOLO = new Set([
  'glass-test.js',      // 스크린샷 픽셀 실측 — 렌더가 늦으면 색이 안 맞는다
  'gallery-test.js',    // 요청 수·동시 4건 제한 — 경합하면 타이밍이 뭉개진다
  'size-test.js',       // 생성 크기 계산 + 외부 서버(8899)
  'responsive-test.js', // 55회 로드. 혼자 돌아야 옆을 굶기지 않는다
  'sendpos-test.js',    // 진단용(합격/불합격을 안 낸다)
]);
//  외부 서버(8899)를 쓰는 것들 — 같은 서버를 공유하므로 병렬 자체는 괜찮다
const NEEDS_SRV = ['lbgrp-test.js', 'pose-test.js', 'share-test.js', 'size-test.js'];

//  자주 쓰는 무리. 고친 자리와 맞닿은 것만 먼저 돌려 보라고 두는 것이다.
//  ★ 전체를 대신하지 않는다 — 배포 직전에는 반드시 전체를 돌린다.
const GROUPS = {
  bar:     ['color', 'secui', 'railpos', 'mactfold', 'lbgrp'],          // 하단 바 · 위치 · 접기
  layout:  ['fold', 'responsive', 'twoui', 'layout', 'glass', 'menu'],  // 화면 폭 · 테마 · 레이아웃
  gallery: ['gallery', 'useresult', 'shareresume'],                     // 결과 목록 · 크게 보기 · 공유
  prompt:  ['nl', 'animanl', 'ink', 'inkmax', 'outfit', 'pose', 'posonly', 'family', 'combo2', 'color'],
  editor:  ['editor', 'keeporder', 'lorapin', 'sendpos'],               // 클래식 에디터 · LoRA
  io:      ['backup', 'robust', 'changelog', 'shutdown'],               // 백업 · 복구 · 내역 · PC 종료
};

const argv = process.argv.slice(2);
if (argv.includes('--list')) {
  console.log('무리:');
  for (const [k, v] of Object.entries(GROUPS)) console.log(`  ${k.padEnd(8)} ${v.join(' ')}`);
  process.exit(0);
}
let jobs = 2;
const ji = argv.indexOf('--jobs');
if (ji >= 0) { jobs = Math.max(1, parseInt(argv[ji + 1], 10) || 2); argv.splice(ji, 2); }

const all = fs.readdirSync(DIR).filter(f => /-test\.js$/.test(f)).sort();
let picked = all;
const names = argv.filter(a => !a.startsWith('--'));
if (names.length) {
  const want = new Set();
  names.forEach(n => (GROUPS[n] || [n]).forEach(x => want.add(x.replace(/(-test)?(\.js)?$/, ''))));
  picked = all.filter(f => want.has(f.replace('-test.js', '')));
  const missing = [...want].filter(w => !picked.some(f => f === w + '-test.js'));
  if (missing.length) console.log(`(없는 검사: ${missing.join(', ')})`);
}
if (!picked.length) { console.log('돌릴 검사가 없습니다. --list 로 무리를 보세요.'); process.exit(1); }

const env = Object.assign({}, process.env, {
  NODE_PATH: '/opt/node22/lib/node_modules:/opt/node22/lib/node_modules/playwright/node_modules',
});

//  8899 서버는 한 번만 띄운다(여러 검사가 공유한다)
//  ★ 띄우고 '뜰 때까지 기다려야' 한다. 안 기다렸더니 먼저 시작된 lbgrp-test 가
//    ERR_CONNECTION_REFUSED 로 7초 만에 죽었다 — 검사 실패로 보이지만 실은 실행기 버그였다.
let srv = null;
const needSrv = picked.some(f => NEEDS_SRV.includes(f));
const waitPort = (port, ms) => new Promise((res) => {
  const t0 = Date.now();
  const tryOnce = () => {
    const s = net.connect(port, '127.0.0.1');
    s.on('connect', () => { s.destroy(); res(true); });
    s.on('error', () => { s.destroy(); (Date.now() - t0 > ms) ? res(false) : setTimeout(tryOnce, 120); });
  };
  tryOnce();
});

const t0 = Date.now();
const results = [];
const run = (file) => new Promise((res) => {
  const s = Date.now();
  const p = spawn('node', [path.join(DIR, file)], { env, cwd: path.dirname(DIR) });
  let out = '';
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  const kill = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, 900000);
  p.on('close', (code) => {
    clearTimeout(kill);
    const secs = ((Date.now() - s) / 1000).toFixed(0);
    const fails = (out.match(/^FAIL/gm) || []);
    const ok = code === 0 && !fails.length;
    results.push({ file, ok, code, secs, fails, out });
    console.log(`${ok ? '  통과' : '✗ 실패'}  ${file.padEnd(22)} ${String(secs).padStart(4)}s` +
                (fails.length ? `  (${fails.length}건)` : ''));
    if (!ok) fails.slice(0, 4).forEach(f => console.log('        ' + f.trim()));
    res();
  });
});

(async () => {
  if (needSrv) {
    srv = spawn('python3', ['-m', 'http.server', '8899', '--directory', path.dirname(DIR)],
                { stdio: 'ignore', detached: true });
    const up = await waitPort(8899, 8000);
    if (!up) { console.log('✗ 8899 서버가 안 떴습니다 — 이 서버가 필요한 검사는 실패합니다'); }
  }
  const par = picked.filter(f => !SOLO.has(f));
  const solo = picked.filter(f => SOLO.has(f));
  console.log(`검사 ${picked.length}개 — 병렬 ${par.length}개(동시 ${jobs}) + 혼자 ${solo.length}개\n`);

  //  병렬: 빈자리가 나면 다음 것을 넣는다
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, par.length) }, async () => {
    while (i < par.length) await run(par[i++]);
  }));
  //  혼자 돌아야 하는 것 — 재는 검사라 옆에 아무도 없어야 한다
  for (const f of solo) await run(f);

  if (srv) { try { process.kill(-srv.pid); } catch (e) {} }
  const bad = results.filter(r => !r.ok);
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n${'─'.repeat(48)}`);
  console.log(`${results.length - bad.length}/${results.length} 통과 · ${mins}분`);
  if (bad.length) { console.log('실패: ' + bad.map(r => r.file).join(', ')); process.exit(1); }
  console.log('ALL PASS');
})();
