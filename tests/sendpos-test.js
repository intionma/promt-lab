// 결과창 [긍정] 탭의 [ComfyUI 전송] 버튼을 실제로 눌러서 부정이 같이 나가는지 본다
const { chromium } = require('playwright-core');
const http=require('http'),fs=require('fs'),path=require('path');
const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');
 let p=path.join('/home/user/promt-lab',u.pathname==='/'?'index.html':u.pathname);
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('nf');}
 r.writeHead(200,{'content-type':/\.json$/.test(p)?'application/json':'text/html'});fs.createReadStream(p).pipe(r);});
(async()=>{await new Promise(r=>srv.listen(9097,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const ctx=await b.newContext({viewport:{width:1600,height:1000}});
 const SENDNEG=process.argv[2]||null;
 if (SENDNEG) await ctx.addInitScript((v)=>{ window.__SENDNEG=v; }, SENDNEG);
 await ctx.addInitScript(()=>{try{if(sessionStorage.getItem('__s'))return;sessionStorage.setItem('__s','1');
   localStorage.setItem('pl_layout','classic');localStorage.setItem('adult_optin_v1','1');
   if (window.__SENDNEG) localStorage.setItem('comfy_send_neg_v1', window.__SENDNEG);}catch(e){}});
 const p=await ctx.newPage(); p.on('pageerror',e=>console.log('❌',e.message));
 const sent=[];
 await p.route('**/prompt', route=>{ try{sent.push(JSON.parse(route.request().postData()||'{}'));}catch(e){sent.push({err:1});}
   route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({prompt_id:'x'})}); });
 ['**/object_info*','**/history*','**/system_stats*','**/queue*','**/view*'].forEach(u=>p.route(u,r=>r.fulfill({status:200,contentType:'application/json',body:'{}'})));
 await p.goto('http://127.0.0.1:9097/index.html',{waitUntil:'load'});
 await p.waitForFunction(()=>!!document.getElementById('chip-container-1'),null,{timeout:25000});
 await p.waitForTimeout(1800);

 const st=await p.evaluate(async()=>{
   window.showToast=()=>{}; window.confirm=()=>true; window.alert=()=>{};
   _comfyRestoreSettings();
   document.getElementById('comfy-url').value='http://127.0.0.1:'+location.port;
   document.getElementById('comfy-ckpt').value='ponyRealism_v23.safetensors';
   _comfyConnectedOnce=true;                       // '연결된 적 있음' = 전송 버튼이 보이는 조건
   _comfySaveSettings();
   try{ _comfySyncSendButtons && _comfySyncSendButtons(); }catch(e){}
   // 화면 갱신 — 전송 버튼/체크박스 표시
   ['comfyUpdateSendButtons','_comfyUpdateSendBtns','comfySyncSendBtns'].forEach(f=>{ try{ window[f] && window[f](); }catch(e){} });
   document.getElementById('layer-3').value='1girl, blue eyes'; syncFromManualInput(3);
   await new Promise(r=>setTimeout(r,400));
   const btn=document.getElementById('btn-comfy-send-pos');
   const wrap=document.getElementById('comfy-send-neg-wrap');
   const cb=document.getElementById('comfy-send-neg-toggle');
   return { 전송버튼보임: btn? getComputedStyle(btn).display!=='none':false,
            체크박스보임: wrap? getComputedStyle(wrap).display!=='none':false,
            체크됨: cb?cb.checked:null, 저장값: localStorage.getItem('comfy_send_neg_v1'),
            모드:_comfyWfMode, 최종부정:(document.getElementById('final-negative')||{}).value||'' };
 });
 console.log('── 화면 상태 ──');
 console.log('   전송 버튼 보임:', st.전송버튼보임, '· "부정 포함" 보임:', st.체크박스보임,
             '· 체크됨:', st.체크됨, '· 저장값:', st.저장값, '· 모드:', st.모드);
 console.log('   결과창 최종 부정 (앞 60자):', JSON.stringify(st.최종부정.slice(0,60)));

 // ★ 실제 버튼 클릭
 sent.length=0;
 await p.evaluate(()=>{ const b=document.getElementById('btn-comfy-send-pos'); if(b) b.click(); });
 await p.waitForTimeout(1800);
 const after=await p.evaluate(()=>({대상:_comfyTarget}));
 console.log('\n── [긍정] 탭에서 [ComfyUI 전송] 클릭 ──');
 console.log('   전송 건수:', sent.length, '· _comfyTarget:', after.대상);
 if (sent.length) {
   const wf=sent[0].prompt||{};
   const texts=Object.entries(wf).filter(([k,v])=>v&&v.class_type==='CLIPTextEncode')
     .map(([k,v])=>({노드:k, 글자:(v.inputs&&v.inputs.text)||''}));
   texts.forEach(t=>console.log('   노드 '+t.노드+': '+JSON.stringify(t.글자.slice(0,90))));
   const neg=texts.find(t=>t.노드==='7');
   console.log('\n   ▶ 부정 노드가 비어 있나:', neg? (neg.글자===''?'예 (긍정만 나감) ✅':'아니오 — 부정도 나감 ❌') : '(못 찾음)');
 }
 await b.close();srv.close();})();
