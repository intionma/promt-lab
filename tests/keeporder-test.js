// v9.148.0 자동 정렬 복원 + 메모장 모드 스위치
const { chromium } = require('playwright-core');
const http=require('http'),fs=require('fs'),path=require('path');
const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');
 let p=path.join('/home/user/promt-lab',u.pathname==='/'?'index.html':u.pathname);
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('nf');}
 r.writeHead(200,{'content-type':/\.json$/.test(p)?'application/json':'text/html'});fs.createReadStream(p).pipe(r);});
let f=0; const ck=(n,c,d)=>{console.log((c?'PASS':'FAIL')+' - '+n+(c?'':' :: '+d));if(!c)f++;};
const boot=async(b,port,seed)=>{
  const ctx=await b.newContext({viewport:{width:1440,height:900}});
  await ctx.addInitScript((sd)=>{try{if(sessionStorage.getItem('__s'))return;sessionStorage.setItem('__s','1');
    localStorage.setItem('pl_layout','classic');localStorage.setItem('adult_optin_v1','1');
    if(sd) localStorage.setItem('editor_keeporder_v1',sd);}catch(e){}}, seed||'');
  const p=await ctx.newPage(); const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://127.0.0.1:9094/index.html',{waitUntil:'load'});
  await p.waitForFunction(()=>!!document.getElementById('chip-container-1'),null,{timeout:25000});
  await p.waitForTimeout(1600); await p.evaluate(()=>{window.showToast=()=>{};});
  return {ctx,p,errs};
};
const type=async(p,n,v)=>await p.evaluate(async({n,v})=>{
  if (currentViewMode!=='text') switchViewMode('text');
  await new Promise(r=>setTimeout(r,120));
  const ta=document.getElementById('layer-'+n);
  ta.focus(); ta.value=v; ta.dispatchEvent(new Event('input',{bubbles:true})); ta.blur();
  await new Promise(r=>setTimeout(r,200));
  return ta.value;
},{n,v});

(async()=>{await new Promise(r=>srv.listen(9094,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

 // ── 기본값 = 자동 정렬(예전 동작)
 let {ctx,p,errs}=await boot(b,9094);
 const def=await p.evaluate(()=>({설정:localStorage.getItem('editor_keeporder_v1'), 켜짐:_editorKeepOrderOn(),
   버튼:(document.getElementById('btn-keeporder')||{}).textContent}));
 ck('기본은 자동 정렬(메모장 모드 꺼짐)', def.켜짐===false, JSON.stringify(def));
 ck('버튼이 "자동 정렬"로 보인다', /자동 정렬/.test(def.버튼||''), def.버튼);

 const a1=await type(p,4,'school uniform, thighhighs');
 ck('★ 치고 나오면 DB 순서로 정렬된다(v9.112 동작)', a1==='thighhighs, school uniform', a1);

 // LoRA 트리거가 맨 앞으로
 await p.evaluate(()=>{ _comfyLoraPresets=[{name:'x.safetensors',trigger:'myface',strength:0.9,on:false}]; _comfyLoraPresetsSave(); });
 const a2=await type(p,3,'1girl, blue eyes, long hair, myface');
 ck('★ LoRA 트리거가 맨 앞으로 올라온다', a2.split(',')[0].trim()==='myface', a2);

 // ── 스위치를 켜면 메모장 모드
 const t=await p.evaluate(()=>{ toggleEditorKeepOrder();
   return {설정:localStorage.getItem('editor_keeporder_v1'), 버튼:document.getElementById('btn-keeporder').textContent,
           활성:document.getElementById('btn-keeporder').classList.contains('active')}; });
 ck('스위치를 켜면 저장된다', t.설정==='1', JSON.stringify(t));
 ck('버튼이 "순서 유지"로 바뀐다', /순서 유지/.test(t.버튼)&&t.활성, JSON.stringify(t));

 const b1=await type(p,4,'school uniform, thighhighs');
 ck('메모장 모드에선 친 순서 그대로', b1==='school uniform, thighhighs', b1);
 const b2=await type(p,3,'1girl, blue eyes, long hair, myface');
 ck('메모장 모드에선 트리거도 안 움직임', b2.split(',')[0].trim()==='1girl', b2);

 // 뷰를 오가도 버튼 상태가 유지되는가 (switchViewMode 가 .view-btn active 를 전부 지운다)
 const keep=await p.evaluate(async()=>{ switchViewMode('visual'); await new Promise(r=>setTimeout(r,150));
   switchViewMode('text'); await new Promise(r=>setTimeout(r,150));
   const el=document.getElementById('btn-keeporder');
   return {글자:el.textContent, 활성:el.classList.contains('active')}; });
 ck('뷰를 오가도 스위치 표시가 유지된다', /순서 유지/.test(keep.글자)&&keep.활성, JSON.stringify(keep));

 // [레이어 재배치]는 메모장 모드에서도 눌리면 정렬해야 한다
 const manual=await p.evaluate(()=>{ const ta=document.getElementById('layer-4');
   ta.value='school uniform, thighhighs'; sortLayerByDB(4); return ta.value; });
 ck('메모장 모드여도 [레이어 재배치]는 정렬한다', manual==='thighhighs, school uniform', manual);

 // 캡슐 경로는 설정과 무관하게 늘 정렬 (기존 동작 유지)
 const chip=await p.evaluate(()=>{ const ta=document.getElementById('layer-4');
   ta.value='school uniform, thighhighs'; syncFromManualInput(4); return ta.value; });
 ck('캡슐 경로는 설정과 무관하게 정렬', chip==='thighhighs, school uniform', chip);

 // ★ 자체 검토에서 잡은 것 — 스위치를 '텍스트 칸 blur'가 아닌 곳까지 물리면
 //   사용자가 일부러 배치한 것(드래그·전체저장)이 즉시 되돌려진다. 실제 DB 태그로 확인한다.
 const manualPaths = await p.evaluate(async ()=>{
   const db=[]; Object.values(promptDB[4]||{}).forEach(a=>a.forEach(d=>
     (d.t||'').split(',').map(s=>s.trim()).filter(Boolean).forEach(t=>{ if(db.length<4&&!db.includes(t)) db.push(t); })));
   if (db.length<3) return {skip:true};
   const rev=[...db].reverse(), L4=()=>document.getElementById('layer-4').value;
   const out={rev};
   localStorage.setItem('editor_keeporder_v1','0');       // 기본(자동 정렬) 상태에서 확인
   switchViewMode('visual'); await new Promise(r=>setTimeout(r,150));
   // ① 다른 계층으로 끌어 옮기기
   document.getElementById('layer-5').value=''; syncFromManualInput(5, true);
   document.getElementById('layer-4').value=rev.join(', ');
   _chipMoveAcross(4, 0, 1, 5, null);
   out.끌어옮김 = L4();
   // ② 같은 계층 순서 바꾸기
   document.getElementById('layer-4').value=rev.join(', '); syncFromManualInput(4, true);
   out.순서바꾸기 = L4();
   // ③ 전체 모드 [저장(적은 그대로)]
   switchViewMode('full'); await new Promise(r=>setTimeout(r,250));
   const fta=document.querySelector('#editor-full-wrap textarea');
   if (fta){ fta.value='# 4. 의상\n'+rev.join(', ')+'\n'; saveFullEditorText(); await new Promise(r=>setTimeout(r,200)); }
   out.전체저장 = L4();
   switchViewMode('text');
   return out;
 });
 if (!manualPaths.skip) {
   const rev=manualPaths.rev;
   const keeps=(v)=>{const t=v.split(',').map(s=>s.trim()).filter(Boolean);
     return t.join(',')===rev.filter(x=>t.includes(x)).join(',');};
   ck('★ 끌어 옮긴 뒤 남은 순서가 유지된다', keeps(manualPaths.끌어옮김), manualPaths.끌어옮김);
   ck('★ 같은 계층 순서 바꾸기가 되돌려지지 않는다', keeps(manualPaths.순서바꾸기), manualPaths.순서바꾸기);
   ck('★ 전체 모드 [저장(적은 그대로)]가 정말 그대로 저장한다', keeps(manualPaths.전체저장), manualPaths.전체저장);
 }

 // 백업에 담기는가
 const bk=await p.evaluate(()=>{ openIOModal('export');
   const v=document.getElementById('io-textarea').value;
   try{document.getElementById('db-io-modal').style.display='none';}catch(e){}
   return /editor_keeporder_v1/.test(v); });
 ck('설정이 백업에 담긴다', bk===true, String(bk));
 await ctx.close();

 // ── 새로고침해도 유지
 const s2=await boot(b,9094,'1');
 const keep2=await s2.p.evaluate(()=>({켜짐:_editorKeepOrderOn(), 버튼:document.getElementById('btn-keeporder').textContent}));
 ck('새로고침해도 스위치가 유지된다', keep2.켜짐===true&&/순서 유지/.test(keep2.버튼), JSON.stringify(keep2));
 const e2=s2.errs; await s2.ctx.close();

 const re=errs.concat(e2).filter(e=>!/Failed to load|net::ERR/.test(e));
 console.log(re.length?('PAGE ERRORS: '+re.slice(0,3).join(' | ')):'no page errors'); if(re.length)f++;
 console.log(f?`\n${f} FAILED`:'\nALL PASS');
 await b.close();srv.close();process.exit(f?1:0);})();
