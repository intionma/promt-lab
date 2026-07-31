// v9.144.0 레이아웃 3건 검사: 품질 설명 위치 · 이전 원본 위치 · 결과 버튼 위치
const { chromium } = require('playwright-core');
const http=require('http'),fs=require('fs'),path=require('path');
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHUlEQVR42mP8z8Dwn4EIwDiqkL4KGUdDhr4KAeoRB/3s7QeVAAAAAElFTkSuQmCC';
const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');
 let p=path.join('/home/user/promt-lab',u.pathname==='/'?'index.html':u.pathname);
 if(!fs.existsSync(p)){r.writeHead(404);return r.end('nf');}
 r.writeHead(200,{'content-type':'text/html'});fs.createReadStream(p).pipe(r);});
let f=0; const ck=(n,c,d)=>{console.log((c?'PASS':'FAIL')+' - '+n+(c?'':' :: '+d));if(!c)f++;};
(async()=>{await new Promise(r=>srv.listen(9061,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await ctx.addInitScript(()=>{try{if(sessionStorage.getItem('__s'))return;sessionStorage.setItem('__s','1');
   localStorage.setItem('pl_layout','anima');localStorage.setItem('adult_optin_v1','1');}catch(e){}});
 const p=await ctx.newPage(); const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://127.0.0.1:9061/index.html',{waitUntil:'load'});
 await p.waitForFunction(()=>!!document.getElementById('anima-root'),null,{timeout:20000});
 await p.waitForTimeout(1200);
 await p.evaluate(()=>{window.showToast=()=>{};});

 // ── 4-1. 품질 설명이 접힌 상태에선 안 보이고, 고급 설정 펼치면 보인다
 const q=await p.evaluate(async()=>{
   const bar=document.getElementById('anima-preset-bar');
   const before={ 프리셋줄에설명: !!bar.querySelector('.anima-preset-note'),
                  버튼수: bar.querySelectorAll('.anima-pbtn').length,
                  카드높이: bar.closest('.anima-card').getBoundingClientRect().height };
   document.getElementById('anima-adv-toggle').click();
   await new Promise(r=>setTimeout(r,500));
   const adv=document.getElementById('anima-adv');
   return { ...before, 펼침뒤설명: !!adv.querySelector('.anima-preset-note'),
            adv보임: adv.style.display!=='none',
            설명글: (adv.querySelector('.anima-preset-note')||{}).textContent||'' };
 });
 ck('품질 줄에서 설명이 빠졌다', q.프리셋줄에설명===false, String(q.프리셋줄에설명));
 ck('품질 버튼은 그대로 항상 보인다', q.버튼수===6, q.버튼수+'개');
 ck('고급 설정을 펼치면 설명이 나온다', q.펼침뒤설명===true && q.adv보임, JSON.stringify(q).slice(0,140));
 ck('설명 내용이 유지됐다', /스텝/.test(q.설명글)&&/품질 전부 돌리기/.test(q.설명글), q.설명글.slice(0,60));
 console.log('  · 접힌 상태 품질 카드 높이 '+Math.round(q.카드높이)+'px');
 await p.evaluate(()=>document.getElementById('anima-adv-toggle').click());

 // ── 4-2. 이전 원본이 품질 아래로 갔다
 const sh=await p.evaluate(async(PNG)=>{
   _anima.srcHistory=[{thumb:'data:image/png;base64,'+PNG,name:'a.png',ts:1},{thumb:'data:image/png;base64,'+PNG.replace('A','B'),name:'b.png',ts:2}];
   _animaRenderSrcHistory();
   await new Promise(r=>setTimeout(r,200));
   const box=document.getElementById('anima-srchist');
   const card=box.closest('.anima-card');
   const bar=document.getElementById('anima-preset-bar');
   const inputCard=document.getElementById('anima-input').closest('.anima-card');
   return { 보임: box.style.display!=='none', 항목수: box.querySelectorAll('.anima-srchist-item').length,
            품질과같은카드: card===bar.closest('.anima-card'),
            이미지카드에없음: !inputCard.contains(box),
            품질보다아래: bar.getBoundingClientRect().top < box.getBoundingClientRect().top };
 },PNG);
 ck('이전 원본이 이미지 넣기 카드에서 빠졌다', sh.이미지카드에없음===true, String(sh.이미지카드에없음));
 ck('이전 원본이 품질과 같은 카드에 있다', sh.품질과같은카드===true, String(sh.품질과같은카드));
 ck('이전 원본이 품질 줄보다 아래에 있다', sh.품질보다아래===true, String(sh.품질보다아래));
 ck('목록이 정상 동작한다', sh.보임===true && sh.항목수===2, JSON.stringify(sh));

 // 비었을 때 빈 자리가 안 남는지
 const empty=await p.evaluate(()=>{ _anima.srcHistory=[]; _animaRenderSrcHistory();
   const box=document.getElementById('anima-srchist');
   return { 숨김: box.style.display==='none', 높이: box.getBoundingClientRect().height }; });
 ck('비었으면 자리를 차지하지 않는다', empty.숨김===true && empty.높이===0, JSON.stringify(empty));

 // ── 5. 결과 버튼이 제목 줄로
 const u0=await p.evaluate(()=>{
   const btn=document.getElementById('anima-use-result');
   return { 있음:!!btn, 보임: btn && btn.style.display!=='none',
            제목줄안: !!(btn && btn.closest('.anima-step')),
            결과영역밖: !!(btn && !document.getElementById('anima-result').contains(btn)) };
 });
 ck('버튼이 제목 줄 안에 있다', u0.있음 && u0.제목줄안 && u0.결과영역밖, JSON.stringify(u0));
 ck('결과가 없으면 숨어 있다', u0.보임===false, String(u0.보임));

 const u1=await p.evaluate(async(PNG)=>{
   const du='data:image/png;base64,'+PNG;
   await _animaSetImage(du,'원본',true);
   _anima.results=[{url:du,opt:'t',seed:1}]; _animaResSel=0; _animaRenderResult();
   await new Promise(r=>setTimeout(r,300));
   const btn=document.getElementById('anima-use-result');
   const step=btn.closest('.anima-step');
   return { 보임: btn.style.display!=='none',
            이미지아래에없음: !document.querySelector('.anima-nextrow'),
            제목오른쪽: btn.getBoundingClientRect().left > step.querySelector('.n').getBoundingClientRect().left };
 },PNG);
 ck('결과가 생기면 버튼이 나타난다', u1.보임===true, String(u1.보임));
 ck('이미지 아래 옛 버튼 줄이 없다', u1.이미지아래에없음===true, String(u1.이미지아래에없음));
 ck('제목 오른쪽에 붙는다', u1.제목오른쪽===true, String(u1.제목오른쪽));

 // ★ 여러 번 다시 그려도 핸들러가 쌓이지 않는가 (누적 사고 방지)
 const acc=await p.evaluate(async()=>{
   let calls=0; const orig=window._animaUseResultAsSource;
   window._animaUseResultAsSource=function(){calls++;};
   for(let i=0;i<20;i++) _animaRenderResult();
   await new Promise(r=>setTimeout(r,200));
   document.getElementById('anima-use-result').click();
   await new Promise(r=>setTimeout(r,200));
   window._animaUseResultAsSource=orig;
   return calls;
 });
 ck('★ 20번 다시 그려도 클릭이 한 번만 먹는다', acc===1, acc+'번 실행됨');

 // 결과를 비우면 다시 숨는가
 const u2=await p.evaluate(()=>{ _anima.results=[]; _animaResSel=0; _animaRenderResult();
   return document.getElementById('anima-use-result').style.display; });
 ck('결과를 비우면 다시 숨는다', u2==='none', u2);

 const re=errs.filter(e=>!/Failed to load|net::ERR/.test(e));
 console.log(re.length?('PAGE ERRORS: '+re.slice(0,3).join(' | ')):'no page errors'); if(re.length)f++;
 console.log(f?`\n${f} FAILED`:'\nALL PASS');
 await b.close();srv.close();process.exit(f?1:0);})();
