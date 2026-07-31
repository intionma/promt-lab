// 페르소나 테스트 공통 장치
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/promt-lab';

function serve(port) {
    const srv = http.createServer((q, r) => {
        const u = new URL(q.url, 'http://x');
        let p = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname);
        if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
        const ct = /\.js$/.test(p) ? 'application/javascript'
            : /\.json|webmanifest$/.test(p) ? 'application/json'
            : /\.png$/.test(p) ? 'image/png' : 'text/html';
        r.writeHead(200, { 'content-type': ct });
        fs.createReadStream(p).pipe(r);
    });
    return new Promise(res => srv.listen(port, () => res(srv)));
}

function reporter(name) {
    const r = { name, fails: 0, lines: [], notes: [] };
    r.ck = (label, cond, detail) => {
        r.lines.push((cond ? '  PASS ' : '  FAIL ') + label + (cond ? '' : ' :: ' + detail));
        if (!cond) r.fails++;
        return cond;
    };
    r.note = (s) => r.notes.push('  · ' + s);
    r.print = () => {
        console.log('\n══════ ' + name + ' ══════');
        r.lines.forEach(l => console.log(l));
        r.notes.forEach(l => console.log(l));
    };
    return r;
}

// 1x1 투명 PNG / 불투명 PNG
const PNG_OPAQUE = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHUlEQVR42mP8z8Dwn4EIwDiqkL4KGUdDhr4KAeoRB/3s7QeVAAAAAElFTkSuQmCC';
const PNG_ALPHA = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mNkYPhfz0AEYBxVSF+FAP5FA/1Xn1nUAAAAAElFTkSuQmCC';

async function launch() {
    return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
}

// 폰 환경(터치 + 좁은 화면) / PC 환경
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const PC = { viewport: { width: 1440, height: 900 } };
// 폰이지만 클래식 화면을 봐야 할 때(캡슐이 가로로 밀려나 좌표가 화면 밖으로 나가므로 넓게)
const PHONE_WIDE = { viewport: { width: 1280, height: 1000 }, hasTouch: true };

async function boot(browser, opt) {
    opt = opt || {};
    const ctx = await browser.newContext(opt.device || PC);
    const pre = opt.pre || {};
    //  ★ addInitScript 는 새로고침마다 다시 돈다 — 여기서 매번 심으면 앱이 저장한 값을
    //    되돌려 놓아서 "새로고침하면 설정이 안 남는다"는 가짜 실패가 난다. 첫 진입에만 심는다.
    await ctx.addInitScript((s) => {
        try {
            if (sessionStorage.getItem('__pl_seeded')) return;
            sessionStorage.setItem('__pl_seeded', '1');
            Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v));
        } catch (e) {}
    }, pre);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load|net::ERR|favicon/.test(m.text())) errs.push('[console] ' + m.text()); });
    await page.goto('http://127.0.0.1:' + opt.port + '/index.html', { waitUntil: 'load' });
    await page.evaluate(() => { window.showToast = () => {}; });
    return { ctx, page, errs };
}

const realErrs = (errs) => errs.filter(e => !/Failed to load|net::ERR|ERR_|favicon|Load failed/i.test(e));

module.exports = { serve, reporter, launch, boot, PHONE, PC, PHONE_WIDE, PNG_OPAQUE, PNG_ALPHA, realErrs };
