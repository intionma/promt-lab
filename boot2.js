const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const T = [[8821,'지금'],[8831,'내역 40개'],[8832,'내역40+엔진제거(상한)']];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const [port, tag] of T) {
    for (const layout of ['anima','classic']) {
      const runs = [];
      for (let i=0;i<3;i++) {
        const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
        const pg = await ctx.newPage();
        const cdp = await ctx.newCDPSession(pg); await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
        await pg.route('**/font-awesome/**', r=>r.abort()); await pg.route('**/fonts.googleapis.com/**', r=>r.abort());
        await pg.addInitScript((l)=>{localStorage.setItem('pl_layout',l);localStorage.setItem('adult_optin_v1','1');}, layout);
        await pg.goto('http://localhost:'+port+'/index.html', { waitUntil: 'domcontentloaded' });
        const ready = await pg.evaluate(async (l) => {
          const t0 = performance.now();
          const sel = l==='anima' ? '#anima-root' : '#chip-container-1';
          while (!document.querySelector(sel) && performance.now()-t0 < 20000) await new Promise(r=>setTimeout(r,20));
          const nav = performance.getEntriesByType('navigation')[0]||{};
          return { dcl: Math.round(nav.domContentLoadedEventEnd - nav.responseEnd),
                   fcp: Math.round((performance.getEntriesByType('paint').find(p=>p.name==='first-contentful-paint')||{}).startTime||0),
                   ready: Math.round(performance.now()) };
        }, layout);
        runs.push(ready); await ctx.close();
      }
      const med = k => runs.map(r=>r[k]).sort((a,b)=>a-b)[1];
      console.log(`  ${tag.padEnd(22)} ${layout.padEnd(8)} DOM파싱 ${String(med('dcl')).padStart(5)}ms · 첫글자 ${String(med('fcp')).padStart(5)}ms · 화면준비 ${String(med('ready')).padStart(5)}ms`);
    }
  }
  await b.close();
})();
