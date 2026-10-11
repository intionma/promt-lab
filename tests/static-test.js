// 정적 검사(tools/lint.js)를 검사 묶음에 넣는다 — 브라우저 없이 2초.
//  버전 3곳 맞춤 · 내역 JSON · 인라인 스크립트 문법 · ANIMA_CSS 백틱 · 백업 키 누락 · html 토스트 escape ·
//  manifest↔sw.js · data JSON · 검사 이름/포트 같은 '손으로 맞추는 것'을 매번 잰다(감사 G).
//  ⚠ 'version.bump' 는 origin/main 과 비교한다 — index.html 을 고쳤는데 버전을 안 올렸으면 여기서 깨진다.
const { spawnSync } = require('child_process');
const path = require('path');
const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'lint.js')], { encoding: 'utf8', env: Object.assign({}, process.env, { NODE_PATH: (process.env.NODE_PATH || '') + path.delimiter + '/opt/node22/lib/node_modules/eslint/node_modules' }) });
process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
process.exit(r.status === 0 ? 0 : 1);
