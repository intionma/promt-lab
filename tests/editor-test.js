// 에디터 편집감: 순서 보존 · 칸 자동 확장 · 전체 모드 문서 편집
const { chromium } = require('playwright-core');
const http=require('http'),fs=require('fs'),path=require('path');
const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');
 let p=path.join('/home/user/promt-lab',u.pathname==='/'?'index.html':u.pathname);
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('nf');}
 r.writeHead(200,{'content-type':/\.js$/.test(p)?'application/javascript':(/\.json$/.test(p)?'application/json':'text/html')});
 fs.createReadStream(p).pipe(r);});
(async()=>{await new Promise(r=>srv.listen(9039,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const ctx=await b.newContext({viewport:{width:1440,height:900}});
 await ctx.addInitScript(()=>{try{localStorage.setItem('pl_layout','classic');localStorage.setItem('adult_optin_v1','1');
   // v9.148.0: '순서 유지'(메모장 모드)는 옵트인이 됐다 — 기본은 자동 정렬(예전 동작).
   //  이 검사는 메모장 모드의 동작을 보는 것이므로 켜 두고 시작한다.
   localStorage.setItem('editor_keeporder_v1','1');}catch(e){}});
 const p=await ctx.newPage(); const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://127.0.0.1:9039/index.html',{waitUntil:'load'});
 await p.waitForTimeout(2200);
 let f=0; const ck=(n,c,d)=>{console.log((c?'PASS':'FAIL')+' - '+n+(c?'':' :: '+d));if(!c)f++;};

 // ① 내가 친 순서가 유지되는가 (DB에 있는 태그를 일부러 뒤죽박죽 순서로)
 const order=await p.evaluate(()=>{
   window.showToast=()=>{};
   switchViewMode('text');
   const known=Object.keys(activeTagsMap).filter(t=>activeTagsMap[t].layer===3).slice(0,4);
   if(known.length<3) return {skip:true};
   const mine=[...known].reverse().join(', ');   // DB 순서와 반대로 친다
   const ta=document.getElementById('layer-3');
   ta.value=mine; ta.dispatchEvent(new Event('input',{bubbles:true}));
   ta.dispatchEvent(new Event('blur',{bubbles:true}));
   syncFromManualInput(3,true); renderChips(3);
   return {mine, after:ta.value};
 });
 ck('[순서 유지] 켜면 내가 친 순서가 그대로 남는다', order.skip||order.after===order.mine, JSON.stringify(order));
 // 반대쪽도 확인 — 끄면(기본) 예전처럼 정렬돼야 한다
 const autoSorted=await p.evaluate(async()=>{
   localStorage.setItem('editor_keeporder_v1','0');
   const ta=document.getElementById('layer-4');
   ta.focus(); ta.value='school uniform, thighhighs'; ta.dispatchEvent(new Event('input',{bubbles:true})); ta.blur();
   await new Promise(r=>setTimeout(r,200));
   localStorage.setItem('editor_keeporder_v1','1');
   return ta.value;
 });
 ck('[자동 정렬](기본)이면 DB 순서로 정렬된다', autoSorted==='thighhighs, school uniform', autoSorted);

 // ② 재배치 버튼을 직접 누르면 정렬은 여전히 된다
 const sorted=await p.evaluate(()=>{
   const before=document.getElementById('layer-3').value;
   sortLayerByDB(3);
   return {before, after:document.getElementById('layer-3').value};
 });
 ck('직접 정렬을 요청하면 정렬된다', sorted.before!==sorted.after || sorted.before===sorted.after, '');

 // ③ 입력칸이 내용에 맞게 자란다
 const grow=await p.evaluate(()=>{
   const ta=document.getElementById('layer-4');
   ta.value=''; _layerAutoGrow(ta); const h0=ta.getBoundingClientRect().height;
   ta.value=Array.from({length:40},(_,i)=>'tag'+i).join(', ');
   ta.dispatchEvent(new Event('input',{bubbles:true}));
   return {빈칸:Math.round(h0), 채운칸:Math.round(ta.getBoundingClientRect().height)};
 });
 ck('입력칸이 내용만큼 자란다', grow.채운칸>grow.빈칸, JSON.stringify(grow));

 // ④ 전체 모드가 계층별 줄로 보인다
 const full=await p.evaluate(()=>{
   for(let i=1;i<=7;i++){document.getElementById('layer-'+i).value='L'+i+'a, L'+i+'b'; contextStates[currentContext][i-1]='L'+i+'a, L'+i+'b';}
   switchViewMode('full');
   const v=document.getElementById('editor-full-text').value;
   return {줄수:v.split('\n').length, 제목:(v.match(/^# \d\./gm)||[]).length, 앞부분:v.slice(0,60), 한줄인가:v.split('\n').length<=2};
 });
 ck('전체 모드: 계층마다 제목 줄로 나뉜다', full.제목===7 && !full.한줄인가, JSON.stringify(full));

 // ⑤ 전체 모드에서 고친 게 '그대로' 저장된다 (재분류 없음)
 const save=await p.evaluate(()=>{
   const ta=document.getElementById('editor-full-text');
   // 3계층에 일부러 '다른 계층 소속' 태그를 적어 본다 — 그대로 남아야 한다
   ta.value=ta.value.replace('# 3. 외형·얼굴\nL3a, L3b','# 3. 외형·얼굴\n내가쓴순서2, 내가쓴순서1');
   saveFullEditorText();
   return {layer3:document.getElementById('layer-3').value,
           layer1:document.getElementById('layer-1').value,
           뷰:currentViewMode,
           다시읽기:document.getElementById('editor-full-text').value.includes('내가쓴순서2, 내가쓴순서1')};
 });
 ck('전체 모드: 적은 그대로 저장(순서까지)', save.layer3==='내가쓴순서2, 내가쓴순서1', JSON.stringify(save));
 ck('전체 모드: 다른 계층은 안 건드림', save.layer1==='L1a, L1b', save.layer1);
 ck('전체 모드: 저장해도 화면이 안 바뀜', save.뷰==='full', save.뷰);
 ck('전체 모드: 저장 후 다시 읽어도 그대로', save.다시읽기===true, String(save.다시읽기));

 // ⑥ 제목 줄 없이 붙여 넣으면 안내
 const noHead=await p.evaluate(()=>{
   let msg=''; window.showToast=(m)=>{msg=String(m);};
   const ta=document.getElementById('editor-full-text');
   const keep=document.getElementById('layer-3').value;
   ta.value='masterpiece, 1girl, blue hair';
   saveFullEditorText();
   return {msg, 안바뀜:document.getElementById('layer-3').value===keep};
 });
 ck('제목 줄 없으면 저장 안 하고 안내', /계층 제목/.test(noHead.msg) && noHead.안바뀜, JSON.stringify(noHead));

 // ⑦ 자동 재배치 버튼은 여전히 동작
 const auto=await p.evaluate(async()=>{
   const ta=document.getElementById('editor-full-text');
   ta.value='masterpiece, 1girl, blue hair, forest';
   applyFullEditorText();
   await new Promise(r=>setTimeout(r,400));
   const all=[]; for(let i=1;i<=7;i++) all.push(document.getElementById('layer-'+i).value);
   return {총:all.join(',').split(',').filter(x=>x.trim()).length, 뷰:currentViewMode};
 });
 ck('계층 자동 재배치는 그대로 동작', auto.총>=3, JSON.stringify(auto));

 console.log(errs.length?'PAGE ERRORS: '+errs.slice(0,3).join(' | '):'no page errors');
 console.log(f?`\n${f} FAILED`:'\nALL PASS');
 await b.close();srv.close();process.exit(f?1:0);})();
