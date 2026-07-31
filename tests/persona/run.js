// 사용법: node run.js 1 2 3   (없으면 전부)
const L = require('./lib');
const which = process.argv.slice(2).map(Number).filter(Boolean);
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const list = which.length ? which : ALL;

(async () => {
    const port = 9100 + (list[0] || 0);
    const srv = await L.serve(port);
    const browser = await L.launch();
    const results = [];
    for (const n of list) {
        const fn = require('./p' + n + '.js');
        let R;
        try {
            R = await fn(browser, port);
        } catch (e) {
            R = L.reporter('⑨?' + n);
            R.name = '페르소나 ' + n;
            R.ck('시나리오가 끝까지 돈다', false, e.message.slice(0, 200));
        }
        R.print();
        results.push(R);
    }
    console.log('\n════════ 요약 ════════');
    let total = 0;
    results.forEach(r => { total += r.fails; console.log((r.fails ? '  ✗ ' : '  ✓ ') + r.name + (r.fails ? ` — ${r.fails}건 실패` : ' — 이상 없음')); });
    console.log(total ? `\n총 ${total}건 실패` : '\n전원 이상 없음');
    await browser.close(); srv.close();
    process.exit(0);
})();
