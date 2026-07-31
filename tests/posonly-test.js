// '긍정만' 전송이 정말 긍정만 보내는가 — 커스텀 워크플로우의 부정 노드가 원문 그대로 남아야 한다
const { chromium } = require('playwright-core');
const http=require('http'),fs=require('fs'),path=require('path');
const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');
 let p=path.join('/home/user/promt-lab',u.pathname==='/'?'index.html':u.pathname);
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('nf');}
 r.writeHead(200,{'content-type':/\.json$/.test(p)?'application/json':'text/html'});fs.createReadStream(p).pipe(r);});
const MYNEG = 'MY_OWN_NEGATIVE, worst quality, bad hands';   // 사용자가 워크플로우에 넣어 둔 부정
const WF = {
  "4":{class_type:"CheckpointLoaderSimple",inputs:{ckpt_name:"ponyRealism_v23.safetensors"}},
  "6":{class_type:"CLIPTextEncode",inputs:{text:"ORIGINAL_POS",clip:["4",1]}},
  "7":{class_type:"CLIPTextEncode",inputs:{text:MYNEG,clip:["4",1]}},
  "5":{class_type:"EmptyLatentImage",inputs:{width:832,height:1216,batch_size:1}},
  "3":{class_type:"KSampler",inputs:{seed:1,steps:30,cfg:7,sampler_name:"dpmpp_2m",scheduler:"karras",denoise:1,model:["4",0],positive:["6",0],negative:["7",0],latent_image:["5",0]}},
  "8":{class_type:"VAEDecode",inputs:{samples:["3",0],vae:["4",2]}},
  "9":{class_type:"SaveImage",inputs:{images:["8",0]}},
};
let f=0; const ck=(n,c,d)=>{console.log((c?'PASS':'FAIL')+' - '+n+(c?'':' :: '+d));if(!c)f++;};
(async()=>{await new Promise(r=>srv.listen(9096,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const ctx=await b.newContext({viewport:{width:1440,height:900}});
 await ctx.addInitScript(()=>{try{if(sessionStorage.getItem('__s'))return;sessionStorage.setItem('__s','1');
   localStorage.setItem('pl_layout','classic');localStorage.setItem('adult_optin_v1','1');}catch(e){}});
 const p=await ctx.newPage(); const errs=[];p.on('pageerror',e=>errs.push(e.message));
 const sent=[];
 await p.route('**/prompt', route=>{ try{sent.push(JSON.parse(route.request().postData()||'{}'));}catch(e){sent.push({err:1});}
   route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({prompt_id:'x'+sent.length})}); });
 ['**/object_info*','**/history*','**/system_stats*','**/queue*'].forEach(u=>p.route(u,r=>r.fulfill({status:200,contentType:'application/json',body:'{}'})));
 await p.goto('http://127.0.0.1:9096/index.html',{waitUntil:'load'});
 await p.waitForFunction(()=>!!document.getElementById('chip-container-1'),null,{timeout:25000});
 await p.waitForTimeout(1800);

 const setup=await p.evaluate(async(WF)=>{
   window.showToast=()=>{}; window.confirm=()=>true; window.alert=()=>{};
   //  ★ _comfySaveSettings 는 '메인 설정이 폼에 실제로 로드된 적 있을 때'만 저장한다
   //    (부팅 직후 빈 폼이 사용자 설정을 덮는 사고 방지). 먼저 복원을 한 번 태워야 한다.
   _comfyRestoreSettings();
   const u=document.getElementById('comfy-url'); if(u){u.value='http://127.0.0.1:'+location.port; u.dispatchEvent(new Event('change',{bubbles:true}));}
   const ta=document.getElementById('comfy-wf-json'); ta.value=JSON.stringify(WF); ta.dispatchEvent(new Event('input',{bubbles:true}));
   comfySetWfMode('custom'); comfyAnalyzeWorkflow(true);
   await new Promise(r=>setTimeout(r,500));
   //  comfyQuickSend 는 맨 먼저 _comfyRestoreSettings() 로 저장분을 폼에 되돌린다 —
   //  지금 세팅을 저장해 두지 않으면 커스텀 모드·JSON 이 통째로 날아간다.
   let 저장오류=null; try{ _comfySaveSettings(); }catch(e){ 저장오류=e.message; }
   const 저장본 = (()=>{ try{ const j=JSON.parse(localStorage.getItem('comfy_settings_v1')||'{}');
     return {wfMode:j.wfMode, wfJson길이:(j.wfJson||'').length}; }catch(e){ return {err:e.message}; } })();
   // 에디터에 긍정 태그 + 부정 칸에도 뭔가 넣어 둔다
   document.getElementById('layer-3').value='1girl, blue eyes'; syncFromManualInput(3);
   const neg=document.getElementById('final-negative');
   return { pos노드:(document.getElementById('comfy-wf-pos')||{}).value,
            neg노드:(document.getElementById('comfy-wf-neg')||{}).value,
            앱부정: (neg||{}).value||'',
            부정포함기본: _comfySendNegOn(), 저장오류, 저장본, 지금모드:_comfyWfMode,
            체크박스: !!document.getElementById('comfy-send-neg-toggle') };
 }, WF);
 console.log(' 설정:', JSON.stringify({pos:setup.pos노드,neg:setup.neg노드,저장오류:setup.저장오류,저장본:setup.저장본,지금모드:setup.지금모드})); console.log('');
 ck('"부정 포함" 기본값이 꺼짐(=긍정만)', setup.부정포함기본===false, String(setup.부정포함기본));

 const send=async(mode)=>{
   sent.length=0;
   await p.evaluate(async(mode)=>{
     const cb=document.getElementById('comfy-send-neg-toggle');
     if (cb){ cb.checked = (mode==='both'); try{_comfySendNegSave();}catch(e){} }
     await comfyQuickSend('pos');
   }, mode);
   await p.waitForTimeout(1200);
   const wf=(sent[0]||{}).prompt||{};
   return { 건수:sent.length, pos:((wf['6']||{}).inputs||{}).text, neg:((wf['7']||{}).inputs||{}).text,
            모드: await p.evaluate(()=>_comfyWfMode), 대상: await p.evaluate(()=>_comfyTarget) };
 };

 const only=await send('pos');
 console.log('\n── [긍정만] 전송 ──');
 console.log('   전송 건수:', only.건수, '· 모드:', only.모드, '· 대상:', only.대상);
 console.log('   보낸 pos:', JSON.stringify(only.pos));
 console.log('   보낸 neg:', JSON.stringify(only.neg));
 ck('긍정은 앱이 만든 것으로 바뀐다', /1girl/.test(only.pos||''), String(only.pos));
 ck('★ 부정은 내 워크플로우 원문 그대로 남는다', only.neg===MYNEG, JSON.stringify(only.neg));
 ck('부정을 빈 문자열로 덮어쓰지 않는다', (only.neg||'')!=='' , JSON.stringify(only.neg));

 const both=await send('both');
 console.log('\n── ["부정 포함" 켬] 전송 ──');
 console.log('   보낸 neg:', JSON.stringify(both.neg));
 ck('부정 포함을 켜면 앱 부정으로 바뀐다', both.neg!==MYNEG, JSON.stringify(both.neg));

 // 되돌린 뒤 다시 긍정만
 const again=await send('pos');
 ck('다시 끄면 원문 부정으로 돌아온다', again.neg===MYNEG, JSON.stringify(again.neg));

 // ── 기본 모드(커스텀 아님)에서도 '긍정만'이 부정을 안 보내는가
 sent.length=0;                       // ★ 앞 전송이 남아 있으면 그걸 읽어 가짜 결과가 나온다
 const basic=await p.evaluate(async()=>{
   //  기본 모드는 체크포인트가 있어야 전송된다 — 없으면 조용히 안 나간다(가짜 실패의 원인)
   document.getElementById('comfy-ckpt').value='ponyRealism_v23.safetensors';
   _comfyConnectedOnce=true;
   comfySetWfMode('basic'); _comfySaveSettings();
   const cb=document.getElementById('comfy-send-neg-toggle'); if(cb){cb.checked=false; _comfySendNegSave();}
   await comfyQuickSend('pos');
   await new Promise(r=>setTimeout(r,900));
   return true;
 });
 await p.waitForTimeout(600);
 {
   const wf=(sent[0]||{}).prompt||{};
   console.log('\n── 기본 모드 [긍정만] ── (전송 건수 '+sent.length+')');
   //  기본 모드 워크플로우에서 부정 노드는 '7'
   const negNode=Object.entries(wf).find(([k,v])=>v&&v.class_type==='CLIPTextEncode'&&k==='7');
   const negText=negNode?negNode[1].inputs.text:'(못 찾음)';
   const posNode=Object.entries(wf).find(([k,v])=>v&&v.class_type==='CLIPTextEncode'&&k==='6');
   console.log('   보낸 pos:', JSON.stringify((posNode?posNode[1].inputs.text:'').slice(0,70)));
   console.log('   보낸 neg:', JSON.stringify(negText));
   ck('기본 모드에서도 부정이 비어서 나간다', negText==='' , JSON.stringify(negText));
 }

 // ── 결과창에 "부정 포함" 체크박스가 실제로 보이는가
 const ui=await p.evaluate(()=>{
   const w=document.getElementById('comfy-send-neg-wrap');
   const cb=document.getElementById('comfy-send-neg-toggle');
   return { 있음:!!w, 표시:w?getComputedStyle(w).display:'(없음)', 체크박스:!!cb,
            설명:(w&&w.title)||'' , 글자:(w&&w.textContent.trim())||'' };
 });
 console.log('\n── 결과창 UI ──');
 console.log('   ', JSON.stringify(ui));
 ck('"부정 포함" 스위치가 결과창에 있다', ui.있음&&ui.체크박스, JSON.stringify(ui));

 const re=errs.filter(e=>!/Failed to load|net::ERR/.test(e));
 console.log('\n'+(re.length?('PAGE ERRORS: '+re.slice(0,3).join(' | ')):'no page errors')); if(re.length)f++;
 console.log(f?`\n${f} FAILED`:'\nALL PASS');
 await b.close();srv.close();process.exit(f?1:0);})();
