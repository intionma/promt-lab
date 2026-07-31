// 설정창 하단 [긍정만/둘다/부정만] 과 결과창 [부정 포함] 체크박스가 같은 값을 가리키는가
const { chromium } = require('playwright-core');
const http=require('http'),fs=require('fs'),path=require('path');
const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');
 let p=path.join('/home/user/promt-lab',u.pathname==='/'?'index.html':u.pathname);
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('nf');}
 r.writeHead(200,{'content-type':/\.json$/.test(p)?'application/json':'text/html'});fs.createReadStream(p).pipe(r);});
(async()=>{await new Promise(r=>srv.listen(9098,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const ctx=await b.newContext({viewport:{width:1600,height:1000}});
 await ctx.addInitScript(()=>{try{if(sessionStorage.getItem('__s'))return;sessionStorage.setItem('__s','1');
   localStorage.setItem('pl_layout','classic');localStorage.setItem('adult_optin_v1','1');}catch(e){}});
 const p=await ctx.newPage(); p.on('pageerror',e=>console.log('❌',e.message));
 const sent=[];
 await p.route('**/prompt', route=>{ try{sent.push(JSON.parse(route.request().postData()||'{}'));}catch(e){}
   route.fulfill({status:200,contentType:'application/json',body:'{"prompt_id":"x"}'}); });
 ['**/object_info*','**/history*','**/system_stats*','**/queue*'].forEach(u=>p.route(u,r=>r.fulfill({status:200,contentType:'application/json',body:'{}'})));
 await p.goto('http://127.0.0.1:9098/index.html',{waitUntil:'load'});
 await p.waitForFunction(()=>!!document.getElementById('chip-container-1'),null,{timeout:25000});
 await p.waitForTimeout(1800);

 const 상태=()=>p.evaluate(()=>({
   설정창_선택: ['pos','both','neg'].filter(t=>{const e=document.getElementById('comfy-target-'+t); return e&&e.classList.contains('active');}),
   _comfyTarget: _comfyTarget,
   결과창_체크: (document.getElementById('comfy-send-neg-toggle')||{}).checked,
   저장값: localStorage.getItem('comfy_send_neg_v1'),
 }));

 await p.evaluate(()=>{ window.showToast=()=>{}; _comfyRestoreSettings();
   document.getElementById('comfy-url').value='http://127.0.0.1:'+location.port;
   document.getElementById('comfy-ckpt').value='pony.safetensors';
   _comfyConnectedOnce=true; _comfySaveSettings();
   document.getElementById('layer-3').value='1girl'; syncFromManualInput(3); });
 await p.waitForTimeout(400);
let f=0; const ck=(n,c,d)=>{console.log((c?'PASS':'FAIL')+' - '+n+(c?'':' :: '+d));if(!c)f++;};
 const 일치=(x)=>x.설정창_선택[0]==='both' ? x.결과창_체크===true : (x.설정창_선택[0]==='pos' ? x.결과창_체크===false : true);
 const s1=await 상태();
 ck('① 처음부터 두 UI가 같은 값을 가리킨다', 일치(s1)&&s1.설정창_선택[0]==='pos', JSON.stringify(s1));

 // 설정창 하단에서 '둘 다'를 고른다
 await p.evaluate(()=>comfySetTarget('both'));
 const s2=await 상태();
 ck('② 설정창 [둘 다] → 결과창 체크박스도 켜진다', 일치(s2)&&s2.결과창_체크===true, JSON.stringify(s2));

 // 결과창 [전송] 을 누른다 — 체크박스는 꺼져 있다
 sent.length=0;
 await p.evaluate(()=>{ const b=document.getElementById('btn-comfy-send-pos'); if(b) b.click(); });
 await p.waitForTimeout(1500);
 const st3=await 상태();
 const neg3=sent.length?((((sent[0].prompt||{})['7']||{}).inputs||{}).text||''):'(전송없음)';
 ck('③ 결과창 [전송]이 설정창 선택을 덮어쓰지 않는다', st3.설정창_선택[0]==='both', JSON.stringify(st3));
 ck('③ [둘 다]이므로 부정이 함께 나간다', neg3.length>10, JSON.stringify(neg3.slice(0,40)));

 // 반대 방향: 결과창 체크박스를 켜고 설정창을 본다
 await p.evaluate(()=>{ const cb=document.getElementById('comfy-send-neg-toggle'); cb.checked=true; _comfySendNegSave(); });
 const s4=await 상태();
 ck('④ 체크박스를 켜면 설정창도 [둘 다]가 된다', 일치(s4)&&s4.설정창_선택[0]==='both', JSON.stringify(s4));

 // 설정창에서 '긍정만'으로 되돌린 뒤 결과창 체크박스를 본다
 await p.evaluate(()=>comfySetTarget('pos'));
 const s5=await 상태();
 ck('⑤ 설정창 [긍정만] → 체크박스도 꺼진다', 일치(s5)&&s5.결과창_체크===false, JSON.stringify(s5));
 sent.length=0;
 await p.evaluate(()=>{ const b=document.getElementById('btn-comfy-send-pos'); if(b) b.click(); });
 await p.waitForTimeout(1500);
 const st6=await 상태();
 const neg6=sent.length?((((sent[0].prompt||{})['7']||{}).inputs||{}).text||''):'(전송없음)';
 ck('⑥ [긍정만] 상태에서 결과창 전송해도 긍정만 나간다', neg6==='', JSON.stringify(neg6.slice(0,40)));
 ck('⑥ 전송 뒤에도 설정창이 [긍정만] 그대로', st6.설정창_선택[0]==='pos', JSON.stringify(st6));
 console.log(f?`\n${f} FAILED`:'\nALL PASS');
 await b.close();srv.close();process.exit(f?1:0);})();
