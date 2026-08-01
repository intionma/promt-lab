const { chromium } = require('playwright-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const srv = http.createServer((q,s)=>{const p=path.join('/home/user/promt-lab',q.url==='/'?'index.html':q.url);
 if(!fs.existsSync(p)){s.writeHead(404);return s.end();} s.writeHead(200,{'content-type':'text/html'}); fs.createReadStream(p).pipe(s);});
(async()=>{
 await new Promise(r=>srv.listen(8962,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 let fails=0; const ck=(n,c,d)=>{console.log((c?'PASS':'FAIL')+' - '+n+(c?'':' :: '+d)); if(!c)fails++;};

 // A) 카탈로그/조합 데이터
 {
  const page=await b.newPage({viewport:{width:1440,height:900}});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('http://127.0.0.1:8962/',{waitUntil:'load'}); await page.waitForTimeout(600);
  const r=await page.evaluate(()=>{
   const c=_PACK_COMBOS['nsfw-adult'], t=_PACK_SIDEBAR_TAGS['nsfw-adult']['3'];
   return { names:c.map(x=>x.n), full:(c.find(x=>/전신/.test(x.n))||{}).g,
     orn:(c.find(x=>/문양 도배/.test(x.n))||{}).g,
     tagCount:t.filter(x=>/tattoo|tally|spermatozoon|writing|markings|filigree|bodypaint/.test(x.t)).length,
     hasMandala:t.some(x=>x.t==='mandala'), hasCovered:t.some(x=>x.t==='covered in tattoos'),
     comboCount:c.length };
  });
  ck('조합 5종(전신·음문·문양·낙서·극한) 존재', /전신/.test(r.names.join()) && /문양 도배/.test(r.names.join()) && /낙서 도배/.test(r.names.join()) && r.comboCount===10, r.names.join('|'));
  ck('전신 조합에 부위 다중 지정 + 가중치', /full-body tattoo, covered in tattoos:1\.5/.test(r.full['3']) && /arm tattoo/.test(r.full['3']) && /leg tattoo/.test(r.full['3']), JSON.stringify(r.full));
  ck('문양 조합에 만다라·트라이벌·슬리브(실존 태그만)', /mandala/.test(r.orn['3']) && /tribal tattoo/.test(r.orn['3']) && /tattoo sleeve/.test(r.orn['3']), JSON.stringify(r.orn));
  ck('사이드바 문신계 태그 확장(지웠던 태그 복구 포함)', r.tagCount >= 18 && r.hasMandala && r.hasCovered, String(r.tagCount) + '/' + r.hasCovered);
  console.log(errs.length?'PAGE ERRORS: '+errs.join('; '):'no page errors');
  await page.close();
 }
 // B) Anima 프리셋 + 마이그레이션
 {
  const page=await b.newPage({viewport:{width:390,height:844}});
  await page.goto('http://127.0.0.1:8962/',{waitUntil:'load'});
  await page.evaluate(()=>{ // 구버전 tat_cover 문구를 가진 사용자 재현
   localStorage.setItem('anima_settings_v1',JSON.stringify({snippets:[
     {id:'tat_cover',name:'전신 도배(낙서·정자)',text:'(body writing, spermatozoon, tally:1.4), facial mark, heart tattoo, tattoo',on:false,kind:'append',group:'tat',nsfw:true}]}));
   localStorage.setItem('adult_optin_v1','1');
  });
  await page.reload({waitUntil:'load'});
  await page.evaluate(()=>window.mountAnima()); await page.waitForTimeout(1200);
  const r=await page.evaluate(()=>{
   const g=id=>((_anima.snippets||[]).find(s=>s.id===id)||{});
   return { cover:g('tat_cover').text, ornate:g('tat_ornate').text,
     tatN:(_anima.snippets||[]).filter(s=>s.group==='tat').length,
     filN:(_anima.snippets||[]).filter(s=>s.group==='tatfil').length,
     denN:(_anima.snippets||[]).filter(s=>s.group==='tatden').length };
  });
  //  v9.150.0 — 사용자 요청으로 문신을 갈아엎었다. 전신/문양 도배는 지운 12개에 들어간다.
  ck('Anima: 지운 전신 도배가 되살아나지 않는다', !r.cover, String(r.cover));
  ck('Anima: 지운 문양 도배가 되살아나지 않는다', !r.ornate, String(r.ornate));
  ck('Anima: 낙인 3 · 장식 5 · 밀도 2', r.tatN===3 && r.filN===5 && r.denN===2, `${r.tatN}/${r.filN}/${r.denN}`);
  await page.close();
 }
 console.log(fails?`\n${fails} FAILED`:'\nALL PASS');
 await b.close(); srv.close(); process.exit(fails?1:0);
})();
