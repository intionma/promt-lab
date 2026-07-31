// v9.145.0: '아무것도 안 켜면 원본 옷 그대로' 가 실제로 프롬프트에 나가는가
const { chromium } = require('playwright-core');
const http=require('http'),fs=require('fs'),path=require('path');
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHUlEQVR42mP8z8Dwn4EIwDiqkL4KGUdDhr4KAeoRB/3s7QeVAAAAAElFTkSuQmCC';
const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');
 let p=path.join('/home/user/promt-lab',u.pathname==='/'?'index.html':u.pathname);
 if(!fs.existsSync(p)){r.writeHead(404);return r.end('nf');}
 r.writeHead(200,{'content-type':'text/html'});fs.createReadStream(p).pipe(r);});
let f=0; const ck=(n,c,d)=>{console.log((c?'PASS':'FAIL')+' - '+n+(c?'':' :: '+d));if(!c)f++;};
const boot=async(b,port,seed)=>{
  const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await ctx.addInitScript((sd)=>{try{if(sessionStorage.getItem('__s'))return;sessionStorage.setItem('__s','1');
    localStorage.setItem('pl_layout','anima');localStorage.setItem('adult_optin_v1','1');
    if(sd) localStorage.setItem('anima_settings_v1', sd);}catch(e){}}, seed||'');
  const p=await ctx.newPage(); const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://127.0.0.1:'+port+'/index.html',{waitUntil:'load'});
  await p.waitForFunction(()=>!!document.getElementById('anima-root'),null,{timeout:20000});
  await p.waitForTimeout(1200);
  await p.evaluate(()=>{window.showToast=()=>{};});
  return {ctx,p,errs};
};
(async()=>{await new Promise(r=>srv.listen(9065,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const {ctx,p,errs}=await boot(b,9065);

 const build=async()=>await p.evaluate(()=>{
   const base0=(_anima.prompt||'').trim();
   let ons=(_anima.snippets||[]).filter(s=>s.kind!=='base'&&s.on&&s.text&&s.text.trim());
   const futaActive=ons.some(s=>s.group==='futa'); if(!futaActive) ons=ons.filter(s=>s.detail!=='futa');
   const extras=ons.map(s=>s.text.trim()).join(', ');
   return (base0+(extras?(base0.endsWith(',')?' ':', ')+extras:'')).replace(/[\s,]+$/,'');
 });
 const KEEP=/wearing exactly the same clothes/;

 // ① 노출 끔 = 옷 유지 지시가 나간다
 await p.evaluate(()=>{ const on=(_anima.snippets||[]).find(s=>s.kind==='base'&&(_anima.prompt||'').trim()===(s.text||'').trim());
   if(on) _animaApplyBaseSnip(on.id); });
 const off=await build();
 ck('노출을 끄면 옷 유지 지시가 나간다', KEEP.test(off), off);
 ck('벗기라는 지시는 안 나간다', !/nude|topless|bottomless/.test(off), off);

 // ② 가슴만 켠 상태 (사용자가 겪은 그 상황)
 await p.evaluate(()=>{ const bs=(_anima.snippets||[]).find(s=>s.group==='bust'&&/거유/.test(s.name)); if(bs) bs.on=true; });
 const bust=await build();
 ck('가슴만 켜도 옷 유지 지시가 함께 나간다', KEEP.test(bust)&&/large breasts/.test(bust), bust);

 // ③ ★ 노출을 켜면 옷 유지 지시가 절대 안 나간다 (정면 충돌 방지)
 const each=await p.evaluate(async()=>{
   const out={};
   for (const b of (_anima.snippets||[]).filter(s=>s.kind==='base')) {
     _animaApplyBaseSnip(b.id);
     out[b.name]=(_anima.prompt||'').trim();
     _animaApplyBaseSnip(b.id);   // 다시 꺼서 원상복구
   }
   return out;
 });
 const bad=Object.entries(each).filter(([k,v])=>KEEP.test(v)).map(([k])=>k);
 ck('★ 노출 4종 어디에도 옷 유지 지시가 섞이지 않는다', bad.length===0, '섞임: '+bad.join(', '));
 ck('노출 4종은 벗기라는 지시를 담는다',
    Object.values(each).every(v=>/nude|topless|bottomless/.test(v)), JSON.stringify(each).slice(0,120));

 // ④ 접었을 때 '옷 그대로'가 보인다
 const sum=await p.evaluate(()=>{ _anima.prompt=_ANIMA_NEUTRAL_BASE; return _animaPromptSummary(); });
 ck('접으면 요약에 "옷 그대로"가 뜬다', /옷 그대로/.test(sum), sum);
 const sum2=await p.evaluate(()=>{ const b=(_anima.snippets||[]).find(s=>s.id==='base_full');
   _anima.prompt=b.text; return _animaPromptSummary(); });
 ck('노출을 고르면 그 이름이 뜬다(옷 그대로 아님)', /전신 노출/.test(sum2)&&!/옷 그대로/.test(sum2), sum2);

 // ⑤ 직접 고친 프롬프트는 건드리지 않는다
 const mine=await p.evaluate(()=>{ _anima.prompt='my own prompt, whatever'; _animaSave();
   return localStorage.getItem('anima_settings_v1'); });
 await ctx.close();
 const s2=await boot(b,9065,mine);
 const kept=await s2.p.evaluate(()=>(_anima.prompt||'').trim());
 ck('직접 쓴 프롬프트는 그대로 남는다', kept==='my own prompt, whatever', kept);
 await s2.ctx.close();

 // ⑥ 옛 사용자(옛 중립 문구) 마이그레이션
 const oldSeed=JSON.stringify({prompt:'masterpiece, best quality, score_7, ', _wf:'v8ft', steps:3});
 const s3=await boot(b,9065,oldSeed);
 const mig=await s3.p.evaluate(()=>({prompt:(_anima.prompt||'').trim(),
   칸에도반영: ((document.getElementById('anima-prompt')||{}).value||'').trim()}));
 ck('옛 중립 문구를 쓰던 사람에게도 지시가 들어간다', KEEP.test(mig.prompt), mig.prompt);
 ck('프롬프트 칸에도 반영된다', KEEP.test(mig.칸에도반영), mig.칸에도반영.slice(0,60));
 await s3.ctx.close();

 const re=errs.filter(e=>!/Failed to load|net::ERR/.test(e));
 console.log(re.length?('PAGE ERRORS: '+re.slice(0,3).join(' | ')):'no page errors'); if(re.length)f++;
 console.log(f?`\n${f} FAILED`:'\nALL PASS');
 await b.close();srv.close();process.exit(f?1:0);})();
