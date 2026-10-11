#!/usr/bin/env node
// 정적 검사 — 브라우저 없이 2초 안에 끝난다. 커밋 전·CI·검사 묶음(tests/static-test.js)에서 돈다. (v9.205.1, 감사 G 초안)
// 쓰는 법: node tools/lint.js [저장소 경로] [--base origin/main]
//   FAIL 이 하나라도 있으면 종료 코드 1. WARN 은 실패로 치지 않는다.
// Exit code 1 if any FAIL. WARN lines never fail the run.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const t0 = Date.now();
const args = process.argv.slice(2);
const ROOT = path.resolve(args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--base') || path.resolve(__dirname, '..'));
const bi = args.indexOf('--base'); const BASE = bi >= 0 ? args[bi + 1] : 'origin/main';
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let FAILS = 0, WARNS = 0;
const out = (lvl, id, msg) => { console.log(`${lvl.padEnd(4)} [${id}] ${msg}`); if (lvl === 'FAIL') FAILS++; if (lvl === 'WARN') WARNS++; };
const ok = (id, cond, msg, detail) => out(cond ? 'PASS' : 'FAIL', id, msg + (cond || detail === undefined ? '' : ' :: ' + detail));
const lineOf = (s, idx) => s.slice(0, idx).split('\n').length;

const html = rd('index.html');
const sw = rd('sw.js');
const claude = fs.existsSync(path.join(ROOT, 'CLAUDE.md')) ? rd('CLAUDE.md') : '';

// ─── 1. version sync (title · tooltip · changelog[0] · CLAUDE.md) ─────────────
const clRe = /<script type="application\/json" id="pl-changelog-data">([\s\S]*?)<\/script>/;
let inline = null;
try { inline = JSON.parse(clRe.exec(html)[1]); ok('changelog.json', true, 'inline changelog JSON parses'); }
catch (e) { ok('changelog.json', false, 'inline changelog JSON parses', e.message); }
const tv = (/<title>[^<]*?(v\d+\.\d+\.\d+)/.exec(html) || [])[1];
const tt = /app-version-tooltip">(v\d+\.\d+\.\d+)\s*(?:&nbsp;)?\s*·\s*(?:&nbsp;)?\s*(\d{4}-\d{2}-\d{2})/.exec(html) || [];
const cv = inline && inline[0] && inline[0].version, cd = inline && inline[0] && inline[0].date;
const mdv = (/현재 최신 버전:\s*\*\*(v\d+\.\d+\.\d+)\*\*/.exec(claude) || [])[1];
ok('version.sync', tv && tv === tt[1] && tt[1] === cv, 'title == tooltip == changelog[0].version', `${tv} / ${tt[1]} / ${cv}`);
ok('version.date', tt[2] && tt[2] === cd, 'tooltip date == changelog[0].date', `${tt[2]} / ${cd}`);
if (mdv) ok('version.claude', mdv === cv, 'CLAUDE.md "현재 최신 버전" matches', `${mdv} vs ${cv}`);
const vnum = (v) => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
const vcmp = (a, b) => { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
if (inline && inline.length > 1) ok('version.monotonic', vcmp(inline[0].version, inline[1].version) > 0, 'changelog[0] is newer than changelog[1]', `${inline[0].version} <= ${inline[1].version}`);

// ─── 2. version bumped vs base when index.html changed ───────────────────────
try {
  const changed = cp.spawnSync('git', ['-C', ROOT, 'diff', '--quiet', BASE, '--', 'index.html']).status === 1;
  if (changed) {
    const baseHtml = cp.execFileSync('git', ['-C', ROOT, 'show', `${BASE}:index.html`], { maxBuffer: 64 << 20 }).toString();
    const bv = (/<title>[^<]*?(v\d+\.\d+\.\d+)/.exec(baseHtml) || [])[1];
    ok('version.bump', vcmp(tv, bv) > 0, `index.html differs from ${BASE} → version must be bumped`, `${bv} → ${tv}`);
  } else out('PASS', 'version.bump', `index.html identical to ${BASE} (no bump needed)`);
} catch (e) { out('WARN', 'version.bump', `could not compare with ${BASE}: ${e.message.split('\n')[0]}`); }

// ─── 3. changelog shape & archive ────────────────────────────────────────────
if (inline) {
  ok('changelog.cap', inline.length <= 60, `inline changelog ≤ 60 entries (${inline.length})`, inline.length);
  ok('changelog.latest', inline[0].time === '최신' && inline.slice(1).every(e => e.time === ''), 'only top entry has time "최신", others ""',
     JSON.stringify(inline.slice(0, 3).map(e => e.time)));
  const bad = inline.filter(e => !e.version || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || '') || !['feat', 'fix', 'refactor'].includes(e.tag)
    || !Array.isArray(e.items) || !e.items.length || e.items.some(s => typeof s !== 'string' || !s.trim()));
  ok('changelog.shape', !bad.length, 'every entry has version/date/tag/items', bad.map(e => e.version).join(','));
  const vs = inline.map(e => e.version); const dupV = vs.filter((v, i) => vs.indexOf(v) !== i);
  ok('changelog.unique', !dupV.length, 'no duplicate versions inline', dupV.join(','));
  try {
    const arch = JSON.parse(rd('data/changelog-archive.json'));
    const ov = inline.filter(e => arch.some(a => a.version === e.version)).map(e => e.version);
    ok('changelog.archive', ov.length === 0, `archive parses (${arch.length}); no overlap with inline`, ov.join(','));
    ok('changelog.order', vcmp(inline[inline.length - 1].version, arch[0].version) > 0, 'archive starts where inline ends (moved oldest-first)',
       `${inline[inline.length - 1].version} vs ${arch[0].version}`);
  } catch (e) { ok('changelog.archive', false, 'data/changelog-archive.json parses', e.message); }
}

// ─── 4. every executable inline <script> compiles; classic engine compiles ───
const scripts = [];
{
  // tokenizer-lite: skip HTML comments that sit *outside* scripts (they may mention "<script>")
  const re = /<!--[\s\S]*?-->|<script\b([^>]*)>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    const attrs = m[1];
    if (/\bsrc=/.test(attrs)) continue;
    const type = (/type="([^"]+)"/.exec(attrs) || [])[1] || 'text/javascript';
    const id = (/id="([^"]+)"/.exec(attrs) || [])[1] || '';
    const start = m.index + m[0].indexOf('>') + 1;
    scripts.push({ type, id, code: m[2], line: lineOf(html, start), start });
  }
}
let compiled = 0;
for (const s of scripts) {
  const exec = s.type === 'text/javascript' || s.type === 'module' || s.id === 'pl-classic-engine';
  if (s.type === 'application/json' || s.type === 'importmap') {
    try { JSON.parse(s.code); } catch (e) { ok('script.json', false, `<script type=${s.type}> at line ${s.line} parses as JSON`, e.message); }
    continue;
  }
  if (!exec) continue;
  try {
    if (s.type === 'module') new vm.SourceTextModule ? 0 : 0; // modules: skip strict check (rare here)
    else new vm.Script(s.code, { filename: `index.html#L${s.line}` });
    compiled++;
  } catch (e) {
    const ln = (/index\.html#L\d+:(\d+)/.exec(e.stack || '') || [])[1];
    ok('script.syntax', false, `<script ${s.id || s.type}> starting at line ${s.line} compiles`,
       `${e.message}${ln ? ' (about line ' + (s.line + +ln - 1) + ')' : ''}`);
  }
}
out('PASS', 'script.syntax', `${compiled} inline scripts compiled (incl. classic engine)`);
try { new vm.Script(sw, { filename: 'sw.js' }); out('PASS', 'sw.syntax', 'sw.js compiles'); }
catch (e) { ok('sw.syntax', false, 'sw.js compiles', e.message); }

// classic engine must appear before the script that defines _plEnsureClassic
{
  const ce = html.indexOf('id="pl-classic-engine"');
  const def = html.search(/function\s+_plEnsureClassic\s*\(/);
  ok('classic.order', ce > 0 && def > ce, 'pl-classic-engine block precedes _plEnsureClassic definition', `engine@${lineOf(html, ce)} def@${lineOf(html, def)}`);
  const eng = scripts.find(s => s.id === 'pl-classic-engine');
  // truncation guard: the engine must still end with its own tail (a stray "</script>" would cut it short).
  ok('classic.size', eng && eng.code.length > 400000, `classic engine block is intact (${eng ? (eng.code.length / 1024).toFixed(0) : 0} KB)`, 'block shrank — stray </script>?');
}

// ─── 5. ANIMA_CSS template literal: no backtick / ${ inside ─────────────────
{
  const a = html.indexOf('const ANIMA_CSS = `');
  if (a < 0) out('WARN', 'anima.css', 'const ANIMA_CSS not found');
  else {
    const b = html.indexOf('`', a + 19);
    const body = html.slice(a + 19, b);
    const after = html.slice(b + 1, b + 3);
    const nl = body.split('\n').length;
    ok('anima.css', after.startsWith(';') && !body.includes('${') && nl > 400,
       `ANIMA_CSS ends at its own "\`;" with no \${ inside (${nl} lines)`,
       `closing backtick at line ${lineOf(html, b)} followed by ${JSON.stringify(after)}; \${ present=${body.includes('${')}`);
  }
}

// ─── 6. global lexical collisions across classic scripts (needs acorn) ───────
let acorn = null;
for (const p of ['acorn', path.join(ROOT, 'node_modules/acorn'), '/opt/node22/lib/node_modules/eslint/node_modules/acorn']) { try { acorn = require(p); break; } catch (e) {} }
if (!acorn) out('WARN', 'globals', 'acorn not available — skipped cross-script redeclaration check (npm i --no-save acorn)');
else {
  const lex = new Map(), fns = new Map();
  for (const s of scripts) {
    if (!(s.type === 'text/javascript' || s.id === 'pl-classic-engine')) continue;
    let ast; try { ast = acorn.parse(s.code, { ecmaVersion: 'latest', sourceType: 'script' }); } catch (e) { continue; }
    const tag = s.id || ('L' + s.line);
    for (const n of ast.body) {
      if (n.type === 'VariableDeclaration' && n.kind !== 'var') n.declarations.forEach(d => d.id.type === 'Identifier' && (lex.get(d.id.name) || lex.set(d.id.name, []).get(d.id.name)).push(tag + ':' + (s.line + d.loc?.start?.line || 0)));
      if (n.type === 'ClassDeclaration') (lex.get(n.id.name) || lex.set(n.id.name, []).get(n.id.name)).push(tag);
      if (n.type === 'FunctionDeclaration') (fns.get(n.id.name) || fns.set(n.id.name, []).get(n.id.name)).push(tag + '@' + (s.line + lineOf(s.code, n.start) - 1));
    }
  }
  const lexDup = [...lex].filter(([, v]) => v.length > 1);
  const lexVsFn = [...lex.keys()].filter(k => fns.has(k));
  ok('globals.let', !lexDup.length && !lexVsFn.length, 'no top-level let/const/class declared twice across <script>s (2nd script would throw at load)',
     JSON.stringify(lexDup.concat(lexVsFn.map(k => [k, 'let+function']))).slice(0, 400));
  const fnDup = [...fns].filter(([, v]) => v.length > 1);
  if (fnDup.length) out('WARN', 'globals.fn', `${fnDup.length} top-level function names declared more than once (later silently wins): ` +
    fnDup.slice(0, 8).map(([k, v]) => `${k}[${v.join(' ')}]`).join(', '));
  else out('PASS', 'globals.fn', 'no duplicate top-level function declarations');
}

// ─── 7. showToast with HTML must pass { html: true }; html:true must escape ──
{
  const calls = [];
  const re = /\bshowToast\s*\(/g; let m;
  while ((m = re.exec(html))) {
    // scan to matching paren, skipping strings/templates (good enough for this codebase)
    let i = m.index + m[0].length, depth = 1, q = null;
    for (; i < html.length && depth; i++) {
      const c = html[i];
      if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') q = c;
      else if (c === '(') depth++; else if (c === ')') depth--;
    }
    calls.push({ at: m.index, src: html.slice(m.index, i) });
  }
  const isDef = (s) => /function\s+showToast|showToast\s*=\s*\(/.test(html.slice(s.at - 12, s.at + 40));
  const real = calls.filter(c => !/^showToast\s*\(\s*(msg|m|message|text)\s*[,)]/.test(c.src) || /html\s*:\s*true/.test(c.src));
  const tagRe = /<(b|i|br|span|a|code|em|strong|small|u)\b[^>]*>/i;
  const missing = real.filter(c => tagRe.test(c.src.split(/,\s*['"](?:info|error|success|warn|warning)['"]/)[0]) && !/html\s*:\s*true/.test(c.src) && !isDef(c));
  ok('toast.html', !missing.length, `showToast calls with HTML tags pass {html:true} (${calls.length} calls scanned)`,
     missing.slice(0, 5).map(c => 'L' + lineOf(html, c.at) + ' ' + c.src.slice(0, 90).replace(/\s+/g, ' ')).join(' | '));
  const unesc = calls.filter(c => /html\s*:\s*true/.test(c.src)).filter(c => {
    const msg = c.src;
    const interps = [...msg.matchAll(/\$\{([^}]+)\}/g)].map(x => x[1]).concat([...msg.matchAll(/['"`]\s*\+\s*([A-Za-z_$][\w$.()[\]'"]*)\s*\+/g)].map(x => x[1]));
    return interps.some(x => !/_esc\(|_animaEsc\(|^\s*(n|i|cnt|count|len|ms|sec|secs|pct|\d+)\s*$|\.length\s*$|toFixed|Math\./.test(x));
  });
  if (unesc.length) out('WARN', 'toast.esc', `${unesc.length} html:true toasts interpolate values not wrapped in _esc(): ` +
    unesc.slice(0, 6).map(c => 'L' + lineOf(html, c.at)).join(' '));
  else out('PASS', 'toast.esc', 'html:true toasts interpolate only _esc()/numeric values');
}

// ─── 8. every localStorage key is backed up or explicitly excluded ───────────
{
  const keys = new Map(); // key -> first line
  const add = (k, idx) => { if (!keys.has(k)) keys.set(k, lineOf(html, idx)); };
  // literal keys; a literal followed by '+' is a dynamic prefix (e.g. 'kor_preview_' + side) → skipped
  for (const m of html.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*(['"])([^'"]+)\1(?!\s*\+)/g)) add(m[2], m.index);
  for (const m of html.matchAll(/(?:const|let|var)\s+(LS|LS_KEY|KEY)\s*=\s*(['"])([^'"]+)\2/g)) add(m[3], m.index);
  for (const m of html.matchAll(/\b(?:_lsSet|safeSetStorage)\(\s*(['"])([^'"]+)\1(?!\s*\+)/g)) add(m[2], m.index);
  for (const m of html.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*([A-Z_$][A-Za-z0-9_$]*)\s*[,)]/g)) {
    const d = new RegExp(`(?:const|let|var)\\s+${m[1].replace(/\$/g, '\\$')}\\s*=\\s*(['"])([^'"]+)\\1`).exec(html);
    if (d) add(d[2], m.index);
  }
  const i0 = html.indexOf('const _IO_ETC_KEYS = [');
  const etcSrc = html.slice(i0, html.indexOf('];', i0)).replace(/\/\/.*$/gm, '');
  const etc = new Set([...etcSrc.matchAll(/'([^']+)'/g)].map(m => m[1]));
  // Dedicated export fields (promptDB, comboFS, contextTabs…) + documented exclusions.
  // ⚠ Every entry here needs a reason. Adding a key here is the explicit "I decided not to back this up" step.
  const EXCLUDE = {
    // dedicated fields in buildExportData()
    'pro_generation_memo': 'generationMemo field', 'gt_pins': 'gtPins field',
    // documented in the _IO_ETC_KEYS comment: image data / transient state / test-only / legacy
    'comfy_img2img_src_v1': 'image data', 'mg_previews_v1': 'image data', 'pl_compare_v1': 'image data (비교 도구 항목 — 768px JPEG 들)',
    'comfy_jobs_meta_v1': 'transient', 'shutdown_deadline_v1': 'transient', 'mobile_panel_idx': 'transient',
    'comfy_mock_mode': 'test only', 'context_states_v0': 'legacy',
    // CLAUDE.md: share-resume state is intentionally not backed up (TTL 15 min)
    'anima_lb_resume_v1': 'transient (CLAUDE.md v9.176.0)',
    // dedicated fields: promptDB / favorites / userPresets / tagDefaultWeights
    'pro_prompt_db_v7_0': 'promptDB field', 'pro_prompt_favs_v7_0': 'favorites field',
    'pro_prompt_presets_v7_0': 'userPresets field', 'tag_default_weights_v1': 'tagDefaultWeights field',
  };
  const DEDICATED_CONST = ['STORAGE_KEY', 'FS_KEY', 'TABS_KEY', 'STATES_KEY', 'KOR_MAP_KEY', 'COMFY_KEY', 'GALLERY_KEY'];
  for (const c of DEDICATED_CONST) {
    const d = new RegExp(`(?:const|let|var)\\s+${c}\\s*=\\s*(['"])([^'"]+)\\1`).exec(html);
    if (d) EXCLUDE[d[2]] = 'dedicated export field (' + c + ')';
  }
  const missing = [...keys].filter(([k]) => !etc.has(k) && !EXCLUDE[k] && !/^__|test|mock/i.test(k));
  ok('backup.keys', !missing.length, `${keys.size} localStorage keys found; all in _IO_ETC_KEYS or excluded with a reason`,
     missing.map(([k, l]) => `${k}@L${l}`).join(', '));
  // dynamic keys built as 'prefix' + x + 'suffix' (e.g. 'kor_preview_' + which + '_collapsed')
  const dyn = [...html.matchAll(/(?:getItem|setItem|_lsSet)\(\s*'([a-z_]+)'\s*\+\s*[\w.]+\s*(?:\+\s*'([a-z0-9_]*)')?/g)].map(m => [m[1], m[2] || '']);
  const stale = [...etc].filter(k => html.split("'" + k + "'").length - 1 + html.split('"' + k + '"').length - 1 <= 1
    && !dyn.some(([a, b]) => k.startsWith(a) && k.endsWith(b)));
  if (stale.length) out('WARN', 'backup.stale', `_IO_ETC_KEYS entries never read/written by literal: ${stale.join(', ')}`);
  const dupE = [...etcSrc.matchAll(/'([^']+)'/g)].map(m => m[1]).filter((k, i, a) => a.indexOf(k) !== i);
  ok('backup.dupes', !dupE.length, '_IO_ETC_KEYS has no duplicates', dupE.join(','));
  ok('backup.transient', !etc.has('anima_lb_resume_v1'), 'transient anima_lb_resume_v1 is NOT in backup (CLAUDE.md)');
}

// ─── 9. manifest / service worker wiring ────────────────────────────────────
try {
  const man = JSON.parse(rd('manifest.json'));
  const st = man.share_target || {};
  const act = String(st.action || '');
  ok('manifest.share', /share-target\/?$/.test(act) && /\/share-target\\\/\?\$/.test(sw) && (st.method || '').toUpperCase() === 'POST',
     `share_target.action (${act}) is POST and matches sw.js route`);
  const files = ((st.params || {}).files || []).map(f => f.name);
  ok('manifest.files', files.some(n => ['image', 'file', 'files', 'photo', 'media', 'images'].includes(n)), `share_target file field names (${files}) are among sw.js candidates`);
  const icons = (man.icons || []).map(i => String(i.src).replace(/^\.\//, ''));
  const miss = icons.filter(p => !fs.existsSync(path.join(ROOT, p)));
  ok('manifest.icons', !miss.length, `manifest icons exist (${icons.length})`, miss.join(','));
} catch (e) { ok('manifest', false, 'manifest.json parses', e.message); }
ok('sw.keep', /const KEEP = \[[^\]]*APP_CACHE[^\]]*SHARE_CACHE|const KEEP = \[[^\]]*SHARE_CACHE[^\]]*APP_CACHE/.test(sw), 'sw.js KEEP retains both caches (activate would wipe pending shares otherwise)');
ok('sw.share-qs', /shared=[\[(]?0?1?/.test(html) && /shared=\[01\]|shared=1/.test(html), 'app reads ?shared= param');

// ─── 10. data/*.json all parse ──────────────────────────────────────────────
{
  const bad = [];
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/\.json$/.test(e.name)) { try { JSON.parse(rd(p)); } catch (err) { bad.push(p); } }
  });
  walk('data');
  ok('data.json', !bad.length, 'all data/**/*.json parse', bad.join(','));
}

// ─── 11. test-suite hygiene ─────────────────────────────────────────────────
{
  const tdir = path.join(ROOT, 'tests');
  const tests = fs.readdirSync(tdir).filter(f => /-test\.js$/.test(f));
  const named = [...new Set([...claude.matchAll(/`([a-z0-9]+)-test`/g)].map(m => m[1]))];
  const ghost = named.filter(n => !tests.includes(n + '-test.js'));
  ok('tests.claude', !ghost.length, `every \`xxx-test\` named in CLAUDE.md exists (${named.length} named)`, ghost.join(', '));
  const runSrc = fs.readFileSync(path.join(tdir, 'run.js'), 'utf8');
  const grpNames = [...runSrc.matchAll(/\[\s*('[a-z0-9]+'(?:\s*,\s*'[a-z0-9]+')*)\s*\]/g)].flatMap(m => [...m[1].matchAll(/'([a-z0-9]+)'/g)].map(x => x[1]));
  const ghostG = [...new Set(grpNames)].filter(n => !tests.includes(n + '-test.js') && !tests.includes(n));
  ok('tests.groups', !ghostG.length, 'run.js GROUPS reference existing tests', ghostG.join(','));
  const ports = new Map();
  tests.forEach(f => {
    const s = fs.readFileSync(path.join(tdir, f), 'utf8');
    const ps = new Set([...s.matchAll(/(?:\b[A-Z_]*(?:PORT|APP|CMF|SLOW|DEAD)\s*=\s*|listen\(\s*|127\.0\.0\.1:|\bmk\([^,()]+,\s*|\brun\(\s*)(\d{4,5})\b/g)].map(m => +m[1]).filter(p => p !== 8899 && p !== 8188));
    ps.forEach(p => (ports.get(p) || ports.set(p, []).get(p)).push(f));
  });
  const clash = [...ports].filter(([, v]) => v.length > 1);
  ok('tests.ports', !clash.length, `fixed ports unique across tests (${ports.size} fixed)`, JSON.stringify(clash));
  const personaClash = [...ports.keys()].filter(p => p >= 9101 && p <= 9110);
  if (personaClash.length) out('WARN', 'tests.ports', `fixed ports ${personaClash} overlap persona/run.js range 9101-9110 (9100+N)`);
}

console.log(`\n${FAILS ? FAILS + ' FAILED' : 'ALL PASS'} · ${WARNS} warn · ${((Date.now() - t0) / 1000).toFixed(2)}s`);
process.exit(FAILS ? 1 : 0);
