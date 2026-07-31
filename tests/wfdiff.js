// 커스텀 워크플로우 전송 payload — v9.112 vs 현재 글자 단위 비교
// 사용자 조건 재현: 클래식 · 커스텀 JSON(LoraLoader 포함) · Pony · 텍스트 칸에 직접 타이핑
const { chromium } = require('playwright-core');
const http=require('http'),fs=require('fs'),path=require('path');
const mk=(root,port)=>new Promise(r=>{const s=http.createServer((q,res)=>{const u=new URL(q.url,'http://x');
 let p=path.join(root,u.pathname==='/'?'index.html':u.pathname);
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end('nf');}
 res.writeHead(200,{'content-type':/\.json$/.test(p)?'application/json':'text/html'});
 fs.createReadStream(p).pipe(res);});s.listen(port,()=>r(s));});

// 사용자의 커스텀 워크플로우 흉내 — LoraLoader 가 체크포인트와 CLIPTextEncode 사이에 물려 있다
const USER_WF = {
  "4": { class_type:"CheckpointLoaderSimple", inputs:{ ckpt_name:"ponyRealism_v23.safetensors" } },
  "10":{ class_type:"LoraLoader", inputs:{ model:["4",0], clip:["4",1], lora_name:"myFaceLora.safetensors", strength_model:0.9, strength_clip:0.9 } },
  "6": { class_type:"CLIPTextEncode", inputs:{ text:"", clip:["10",1] } },
  "7": { class_type:"CLIPTextEncode", inputs:{ text:"", clip:["10",1] } },
  "3": { class_type:"KSampler", inputs:{ seed:12345, steps:30, cfg:7, sampler_name:"dpmpp_2m", scheduler:"karras", denoise:1, model:["10",0], positive:["6",0], negative:["7",0], latent_image:["5",0] } },
  "5": { class_type:"EmptyLatentImage", inputs:{ width:832, height:1216, batch_size:1 } },
  "8": { class_type:"VAEDecode", inputs:{ samples:["3",0], vae:["4",2] } },
  "9": { class_type:"SaveImage", inputs:{ images:["8",0] } },
};
// 사용자가 텍스트 칸에 '치는 대로' 넣은 태그 — 트리거(myface)를 뒤쪽에 쳤다(흔한 습관)
const TYPED = {
  1: 'score_9, masterpiece, best quality',
  3: '1girl, blue eyes, long hair, detailed skin, myface',
  4: 'school uniform, thighhighs',
  5: 'standing, looking at viewer',
  6: 'classroom, indoors',
  7: 'soft lighting',
};

async function run(port, tag){
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:1440,height:900}});
  await ctx.addInitScript(()=>{try{if(sessionStorage.getItem('__s'))return;sessionStorage.setItem('__s','1');
    localStorage.setItem('pl_layout','classic');localStorage.setItem('adult_optin_v1','1');}catch(e){}});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  const sent=[];
  await p.route('**/prompt', route=>{ try{ sent.push(JSON.parse(route.request().postData()||'{}')); }catch(e){ sent.push({err:'parse'}); }
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({prompt_id:'x'+sent.length})}); });
  await p.route('**/object_info*', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await p.route('**/history*', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await p.route('**/system_stats*', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await p.goto('http://127.0.0.1:'+port+'/index.html',{waitUntil:'load'});
  await p.waitForFunction(()=>!!document.getElementById('chip-container-1'),null,{timeout:25000});
  await p.waitForTimeout(1800);

  const info = await p.evaluate(async ({WF, TYPED})=>{
    window.showToast=()=>{}; window.confirm=()=>true; window.alert=()=>{};
    // ── ComfyUI 설정: 커스텀 워크플로우 모드 + LoRA 칩 하나 등록(트리거 myface)
    const set=(id,v,prop)=>{const e=document.getElementById(id); if(!e)return false; e[prop||'value']=v;
      e.dispatchEvent(new Event('change',{bubbles:true})); return true;};
    const out={};
    out.주소칸 = set('comfy-url','http://127.0.0.1:'+location.port);
    // 워크플로우 JSON 붙여넣고 → 커스텀 모드 → 분석
    const ta=document.getElementById('comfy-wf-json');
    if (ta){ ta.value=JSON.stringify(WF); ta.dispatchEvent(new Event('input',{bubbles:true})); }
    try{ comfySetWfMode('custom'); out.모드='custom'; }catch(e){ out.모드오류=e.message; }
    try{ comfyAnalyzeWorkflow(true); }catch(e){ out.분석오류=e.message; }
    await new Promise(r=>setTimeout(r,500));
    //  사용자가 등록해 둔 LoRA 칩 — 트리거 워드가 'myface'. (칩은 꺼 둔 상태여도 트리거 핀은 칩 목록을 본다)
    try {
      _comfyLoraPresets = [{ name:'myFaceLora.safetensors', label:'얼굴', trigger:'myface', strength:0.9, on:false }];
      _comfyLoraPresetsSave();
    } catch(e){ out.로라오류=e.message; }
    try{ _comfySaveSettings(); }catch(e){}
    out.pos노드 = (document.getElementById('comfy-wf-pos')||{}).value;
    out.neg노드 = (document.getElementById('comfy-wf-neg')||{}).value;
    out.wfLora켜짐 = !!(document.getElementById('comfy-wf-lora')||{}).checked;
    out.트리거핀 = (typeof _comfyTrigPins==='function') ? [..._comfyTrigPins()] : null;
    return out;
  }, {WF: USER_WF, TYPED});

  // ── 사용자가 '텍스트 칸에 직접 치고 칸을 벗어나는' 동작을 그대로
  const typed = await p.evaluate(async (TYPED)=>{
    if (typeof switchViewMode==='function') switchViewMode('text');
    await new Promise(r=>setTimeout(r,200));
    for (const [n,v] of Object.entries(TYPED)) {
      const ta=document.getElementById('layer-'+n); if(!ta) continue;
      ta.focus(); ta.value=v;
      ta.dispatchEvent(new Event('input',{bubbles:true}));
      ta.blur();                                  // ← 여기서 syncFromManualInput 이 불린다
      await new Promise(r=>setTimeout(r,60));
    }
    await new Promise(r=>setTimeout(r,400));
    return { 계층: [1,2,3,4,5,6,7].map(n=>(document.getElementById('layer-'+n)||{}).value||''),
             최종: (document.getElementById('final-positive')||{}).value||'' };
  }, TYPED);

  await p.waitForTimeout(300);
  await p.evaluate(()=>{ try{ comfyGenerate(); }catch(e){ window.__genErr=e.message; } });
  await p.waitForTimeout(1500);
  const genErr = await p.evaluate(()=>window.__genErr||null);
  await b.close();
  return { tag, info, typed, sent, genErr, errs: errs.filter(e=>!/Failed to load|net::ERR/.test(e)) };
}

(async()=>{
  const s1=await mk('/tmp/v112app',9091), s2=await mk('/home/user/promt-lab',9092);
  const a=await run(9091,'v9.112'), c=await run(9092,'현재');
  for (const r of [a,c]) {
    console.log('\n════════ '+r.tag+' ════════');
    console.log(' 설정:', JSON.stringify(r.info));
    if (r.genErr) console.log(' ⚠ comfyGenerate 오류:', r.genErr);
    if (r.errs.length) console.log(' ⚠ 페이지 오류:', r.errs.slice(0,2).join(' | '));
    console.log(' 계층(blur 뒤):');
    r.typed.계층.forEach((v,i)=>{ if(v) console.log('   '+(i+1)+': '+v); });
    console.log(' 전송 횟수:', r.sent.length);
    if (r.sent[0] && r.sent[0].prompt) {
      const wf=r.sent[0].prompt;
      const pos=(wf['6']||{}).inputs||{}, lora=(wf['10']||{}).inputs||{};
      console.log(' ▶ 보낸 pos: "'+(pos.text||'')+'"');
      console.log(' ▶ LoraLoader:', JSON.stringify(lora));
    }
  }
  if (a.sent[0] && c.sent[0]) {
    const A=(a.sent[0].prompt['6']||{}).inputs.text||'', C=(c.sent[0].prompt['6']||{}).inputs.text||'';
    console.log('\n════════ 비교 ════════');
    console.log(' 같은가:', A===C);
    if (A!==C) {
      const ta=A.split(',').map(s=>s.trim()), tc=C.split(',').map(s=>s.trim());
      console.log('  v9.112 순서: '+ta.join(' | '));
      console.log('  현재   순서: '+tc.join(' | '));
      console.log('  토큰 집합 동일:', JSON.stringify([...ta].sort())===JSON.stringify([...tc].sort()));
      console.log('  myface 위치:  v9.112='+ta.indexOf('myface')+'  현재='+tc.indexOf('myface'));
    }
  }
  await s1.close(); await s2.close();
})();
