// v9.146.0 색·음모·겨털·형태 축 전수 검사
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
    if(sd) localStorage.setItem('anima_settings_v1',sd);}catch(e){}}, seed||'');
  const p=await ctx.newPage(); const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://127.0.0.1:'+port+'/index.html',{waitUntil:'load'});
  await p.waitForFunction(()=>!!document.getElementById('anima-root'),null,{timeout:20000});
  await p.waitForTimeout(1200); await p.evaluate(()=>{window.showToast=()=>{};});
  return {ctx,p,errs};
};
(async()=>{await new Promise(r=>srv.listen(9066,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const {ctx,p,errs}=await boot(b,9066);

 // ── 축이 전부 생겼는가
 const groups=await p.evaluate(()=>{
   const g={}; (_anima.snippets||[]).forEach(s=>{ if(s.group) (g[s.group]=g[s.group]||[]).push(s.name); });
   g['_대비'] = (_anima.snippets||[]).filter(s=>s.detail==='futa'&&!s.group).map(s=>s.name);
   return g;
 });
 const want={skin:4,tanline:3,pubic:4,armpit:3,nip:5,areola:2,futaColor:4,futaShape:4,_대비:1};
 Object.entries(want).forEach(([k,v])=>ck(`축 ${k} ${v}개`, (groups[k]||[]).length===v, JSON.stringify(groups[k])));
 console.log('  · 피부색: '+(groups.skin||[]).join(' / '));
 console.log('  · 음모: '+(groups.pubic||[]).join(' / ')+'  · 겨털: '+(groups.armpit||[]).join(' / '));
 console.log('  · 자지 형태: '+(groups.futaShape||[]).join(' / '));

 // ── 문구 규칙: 서술 조각 안에 쉼표 없음 / 상대 표현(피부 대비) 없음
 const rules=await p.evaluate(()=>{
   const NEW=['skin','tanline','pubic','armpit','nip','areola','futaColor','futaShape'];
   const list=(_anima.snippets||[]).filter(s=>NEW.includes(s.group)||(s.detail==='futa'&&!s.group));
   const bad상대=list.filter(s=>/than her skin|than the rest of her body|darker than her body/i.test(s.text)&&s.group!=='futaColor');
   const bad공백=list.filter(s=>/,\s*,|^\s*,|,\s*$/.test(s.text));
   const bad대문자=list.filter(s=>!s.text.trim());
   return { 총:list.length, 상대표현:bad상대.map(s=>s.name), 쉼표이상:bad공백.map(s=>s.name), 빈문구:bad대문자.map(s=>s.name),
            nsfw아님:list.filter(s=>!s.nsfw&&s.detail!=='futa').map(s=>s.name) };
 });
 ck('새 축 문구에 상대 표현(피부 대비)이 없다', rules.상대표현.length===0, rules.상대표현.join(', '));
 ck('쉼표가 겹치거나 앞뒤에 남지 않는다', rules.쉼표이상.length===0, rules.쉼표이상.join(', '));
 ck('빈 문구가 없다', rules.빈문구.length===0, rules.빈문구.join(', '));
 ck('성인 표시 대상으로 표시돼 있다', rules.nsfw아님.length===0, rules.nsfw아님.join(', '));

 const build=async()=>await p.evaluate(()=>{
   const base0=(_anima.prompt||'').trim();
   let ons=(_anima.snippets||[]).filter(s=>s.kind!=='base'&&s.on&&s.text&&s.text.trim());
   const futaActive=ons.some(s=>s.group==='futa'); if(!futaActive) ons=ons.filter(s=>s.detail!=='futa');
   const erectOverride=ons.some(s=>s.group==='futaErect');
   let extras=ons.map(s=>s.text.trim()).join(', ');
   if(erectOverride) extras=extras.replace(/\berection\b\s*,\s*/gi,'').replace(/,?\s*\berection\b\s*$/gi,'');
   if(ons.some(s=>s.id==='futa_erect_flaccid')) extras=extras.replace(/\bveiny penis\b\s*,\s*/gi,'').replace(/,?\s*\bveiny penis\b/gi,'');
   if(ons.some(s=>s.id==='dcol_glans')&&ons.some(s=>s.id==='futa_skin_foreskin')){
     const gl=ANIMA_DEFAULT_SNIPPETS.find(d=>d.id==='dcol_glans');
     const cur=(ons.find(s=>s.id==='dcol_glans')||{}).text||(gl&&gl.text)||'';
     if(cur) extras=extras.replace(cur+', ','').replace(', '+cur,'').replace(cur,'');
   }
   if(ons.some(s=>s.id==='dsh_horse'||s.id==='dsh_dog')&&ons.some(s=>s.id==='futa_small')){
     extras=extras.replace(/\(small penis, small testicles:[\d.]+\)\s*,?\s*/gi,'')
                  .replace(/\bsmall penis\b\s*,?\s*/gi,'').replace(/\bsmall testicles\b\s*,?\s*/gi,'');
   }
   return (base0+(extras?(base0.endsWith(',')?' ':', ')+extras:'')).replace(/[\s,]+$/,'');
 });
 const set=async(ids)=>await p.evaluate((ids)=>{
   (_anima.snippets||[]).forEach(s=>{ if(s.kind!=='base') s.on=false; });
   ids.forEach(id=>{ const s=(_anima.snippets||[]).find(x=>x.id===id); if(s) s.on=true; });
 }, ids);

 // ── 후타가 꺼져 있으면 자지 색·형태가 안 나간다
 await set(['dcol_black','dsh_horse']);
 const noFuta=await build();
 ck('후타를 안 켜면 자지 색·형태가 안 나간다', !/dark penis|horse penis/.test(noFuta), noFuta.slice(-90));

 // ── 후타 켜면 나간다
 await set(['futa_normal','dcol_black','dsh_horse']);
 const withFuta=await build();
 ck('후타를 켜면 자지 색·형태가 나간다', /dark penis/.test(withFuta)&&/horse penis/.test(withFuta), withFuta.slice(-140));

 // ── ★ 모순 ①: 귀두 대비 + 귀두 가림
 await set(['futa_normal','dcol_glans','futa_skin_foreskin']);
 const clash1=await build();
 ck('★ 귀두 가림이 켜지면 귀두 대비 문구가 빠진다', !/the glans is a much darker/.test(clash1), clash1.slice(-140));
 await set(['futa_normal','dcol_glans']);
 const ok1=await build();
 ck('귀두 가림이 없으면 귀두 대비는 그대로 나간다', /the glans is a much darker/.test(ok1), ok1.slice(-100));

 // ── ★ 모순 ②: 말자지 + 소추
 await set(['futa_small','dsh_horse']);
 const clash2=await build();
 ck('★ 말자지를 고르면 소추 태그가 빠진다', !/small penis|small testicles/.test(clash2), clash2.slice(-160));
 ck('말자지 문구는 남는다', /horse penis/.test(clash2), clash2.slice(-100));
 await set(['futa_small']);
 const ok2=await build();
 ck('형태를 안 고르면 소추는 그대로', /small penis/.test(ok2), ok2.slice(-90));

 // ── 그룹 상호배타
 const excl=await p.evaluate(()=>{
   const pick=(id)=>{ const s=_anima.snippets.find(x=>x.id===id); s.on=true;
     if(s.group) _anima.snippets.forEach(x=>{ if(x!==s&&x.group===s.group) x.on=false; }); };
   (_anima.snippets||[]).forEach(s=>{ if(s.kind!=='base') s.on=false; });
   pick('skin_pale'); pick('skin_dark');
   return (_anima.snippets||[]).filter(s=>s.group==='skin'&&s.on).map(s=>s.name);
 });
 ck('피부색은 하나만 켜진다', excl.length===1&&excl[0]==='흑갈', JSON.stringify(excl));

 // ── 피부색 + 수영복 자국은 함께 켜진다(직교)
 const both=await p.evaluate(()=>{
   (_anima.snippets||[]).forEach(s=>{ if(s.kind!=='base') s.on=false; });
   ['skin_tan','tan_bikini','pubic_bush','armpit_normal'].forEach(id=>{ const s=_anima.snippets.find(x=>x.id===id); if(s) s.on=true; });
   return (_anima.snippets||[]).filter(s=>s.on&&s.kind!=='base').map(s=>s.name);
 });
 ck('피부색·자국·음모·겨털이 함께 켜진다', both.length===4, JSON.stringify(both));
 const all4=await build();
 ck('넷 다 프롬프트에 실린다', /tanlines/.test(all4)&&/tan:1.3/.test(all4)&&/pubic hair/.test(all4)&&/armpit hair/.test(all4), all4.slice(-260));

 // ── 모순 ③: 면도 + 다른 곳의 pubic hair
 await set(['pubic_none','tan_bikini']);
 await p.evaluate(()=>{ const s=_anima.snippets.find(x=>x.id==='pubic_bush'); if(s) s.on=true; });
 const shave=await p.evaluate(()=>{
   let ons=(_anima.snippets||[]).filter(s=>s.kind!=='base'&&s.on&&s.text);
   let extras=ons.map(s=>s.text.trim()).join(', ');
   if(ons.some(s=>s.id==='pubic_none')) extras=extras.replace(/\(?\b(?:excessive |sparse |female )?pubic hair\b:?[\d.]*\)?\s*,?\s*/gi,(m)=>/completely smooth|no hair at all/.test(m)?m:'');
   return extras;
 });
 ck('면도를 골랐으면 pubic hair 태그가 남지 않는다', !/pubic hair/.test(shave), shave.slice(0,160));

 // ── 하단 바: 버튼 줄이 늘어나지 않았는가 + [세부] 칩
 const bar=await p.evaluate(async()=>{
   (_anima.snippets||[]).forEach(s=>{ if(s.kind!=='base') s.on=false; });
   _animaRenderSnippets(); await new Promise(r=>setTimeout(r,300));
   const mact=document.getElementById('anima-mact');
   const h=(sel)=>{const e=mact.querySelector(sel);return e?Math.round(e.getBoundingClientRect().height):0;};
   const 줄수=(sel)=>{const e=mact.querySelector(sel);return e?[...new Set([...e.children].map(c=>Math.round(c.getBoundingClientRect().top)))].length:0;};
   return { 그룹버튼: [...mact.querySelectorAll('.anima-gbtn[data-grp]')].map(b=>b.dataset.grp),
            하단바: Math.round(mact.getBoundingClientRect().height),
            아이콘줄: h('.anima-mact-icos'), 표정줄: h('.anima-mact-expr'), 버튼줄: h('.anima-mact-grp'),
            아이콘줄수: 줄수('.anima-mact-icos') };
 });
 //  ★ 개수가 아니라 '실제 높이'로 본다. v9.146.0에서 개수만 보고 통과시켰다가
 //    아이콘 줄이 한 줄 접혀 하단 바가 43px 두꺼워진 걸 놓쳤다.
 const BASE={하단바:225, 아이콘줄:38, 표정줄:27, 버튼줄:68, 아이콘줄수:2};   // v9.145.0 실측(폰 390px)
 ck('★ 하단 바 높이가 전과 같다', bar.하단바===BASE.하단바, `${BASE.하단바} → ${bar.하단바}px`);
 ['아이콘줄','표정줄','버튼줄','아이콘줄수'].forEach(k=>
   ck(`  ${k}이(가) 그대로`, bar[k]===BASE[k], `${BASE[k]} → ${bar[k]}`));
 ck('노출 세부가 버튼 줄에 있다', bar.그룹버튼.includes('body'), bar.그룹버튼.join(','));
 const lbl=await p.evaluate(async()=>{
   (_anima.snippets||[]).forEach(s=>{ if(s.kind!=='base') s.on=false; });
   const set=(ids)=>{ids.forEach(id=>{const s=_anima.snippets.find(x=>x.id===id); if(s) s.on=true;});};
   set(['skin_dark']); _animaRenderSnippets(); await new Promise(r=>setTimeout(r,250));
   const t1=document.querySelector('.anima-gbtn[data-grp="body"] .anima-gbtn-v').textContent;
   set(['tan_bikini','pubic_bush']); _animaSyncGrpBtns();
   const b=document.querySelector('.anima-gbtn[data-grp="body"]');
   return { 하나:t1, 여럿:b.querySelector('.anima-gbtn-v').textContent, X툴팁:b.querySelector('.anima-gbtn-x').title };
 });
 ck('하나 고르면 이름이 보인다', lbl.하나==='흑갈', lbl.하나);
 ck('여럿 고르면 "이름 +N"으로 줄여 보인다', lbl.여럿==='흑갈 +2', lbl.여럿);
 ck('✕ 툴팁이 모두 해제임을 알린다', /모두 해제/.test(lbl.X툴팁), lbl.X툴팁);
 // ✕ 를 실제로 눌러 본다 — 그 팝오버가 담은 축이 전부 꺼지고, 하단 바는 다시 그려지지 않아야 한다
 const xclick=await p.evaluate(async()=>{
   const mact=document.getElementById('anima-mact');
   const btn=mact.querySelector('.anima-gbtn[data-grp="body"]');
   const before=[...document.querySelectorAll('#anima-snips .anima-chip')].length;
   const mark=Symbol('keep'); btn.__keep=mark;                 // 다시 그려지면 이 표시가 사라진다
   btn.querySelector('.anima-gbtn-x').click();
   await new Promise(r=>setTimeout(r,250));
   const b2=document.querySelector('.anima-gbtn[data-grp="body"]');
   return { 남은선택:(_anima.snippets||[]).filter(s=>['skin','tanline','pubic','armpit'].includes(s.group)&&s.on).map(s=>s.name),
            버튼그대로: b2 && b2.__keep===mark, 값사라짐: !b2.querySelector('.anima-gbtn-v'),
            다른축유지:(_anima.snippets||[]).filter(s=>s.group==='bust'&&s.on).length,
            패널칩수변화: [...document.querySelectorAll('#anima-snips .anima-chip')].length-before };
 });
 ck('✕ 를 누르면 그 팝오버의 축이 전부 꺼진다', xclick.남은선택.length===0, xclick.남은선택.join(','));
 ck('✕ 를 눌러도 하단 바를 다시 그리지 않는다(눌림 모션 유지)', xclick.버튼그대로===true, JSON.stringify(xclick));
 ck('버튼에서 값 표시가 사라진다', xclick.값사라짐===true, JSON.stringify(xclick));
 console.log('  · 하단 바 '+bar.하단바+'px (아이콘 '+bar.아이콘줄+' / 표정 '+bar.표정줄+' / 버튼 '+bar.버튼줄+') · 버튼 '+bar.그룹버튼.join(','));

 // ── 팝오버가 섹션으로 열리는가
 const pop=await p.evaluate(async(kind)=>{
   _animaGrpPop=kind; _animaSyncPops(); await new Promise(r=>setTimeout(r,200));
   const el=document.getElementById('anima-grppop'); if(!el) return {err:'안 열림'};
   return { 소제목: [...el.querySelectorAll('.anima-fp-lab')].map(e=>e.textContent),
            칩수: el.querySelectorAll('.anima-chip[data-gd]').length };
 },'body');
 ck('노출 세부 팝오버가 4개 소제목으로 열린다',
    JSON.stringify(pop.소제목)===JSON.stringify(['피부색','수영복 자국','음모','겨털']), JSON.stringify(pop));
 ck('노출 세부 팝오버에 14개 칩', pop.칩수===14, String(pop.칩수));
 const pop2=await p.evaluate(async()=>{ _animaGrpPop='bust'; _animaSyncPops(); await new Promise(r=>setTimeout(r,200));
   const el=document.getElementById('anima-grppop');
   return { 소제목:[...el.querySelectorAll('.anima-fp-lab')].map(e=>e.textContent), 칩수: el.querySelectorAll('.anima-chip[data-gd]').length }; });
 ck('가슴 팝오버가 3개 소제목으로 열린다',
    JSON.stringify(pop2.소제목)===JSON.stringify(['크기','유두 색','유륜 크기']), JSON.stringify(pop2));
 ck('가슴 팝오버에 13개 칩', pop2.칩수===13, String(pop2.칩수));

 // 후타 팝오버 섹션
 const pop3=await p.evaluate(async()=>{
   const s=_anima.snippets.find(x=>x.id==='futa_normal'); s.on=true;
   _animaFutaPop='futa_normal'; _animaSyncPops(); await new Promise(r=>setTimeout(r,200));
   const el=document.getElementById('anima-futapop'); if(!el) return {err:'안 열림'};
   return { 소제목:[...el.querySelectorAll('.anima-fp-lab')].map(e=>e.textContent), 칩수: el.querySelectorAll('.anima-chip[data-fd]').length };
 });
 ck('후타 팝오버에 형태·색·대비 섹션이 추가됐다',
    JSON.stringify(pop3.소제목)===JSON.stringify(['발기','포피','사정','형태','색','대비']), JSON.stringify(pop3));
 ck('후타 팝오버에 15개 칩', pop3.칩수===15, String(pop3.칩수));

 // ── 옵션 패널에 '기타'로 새어 나오지 않는가
 const panel=await p.evaluate(async()=>{
   _animaGrpPop=null; _animaFutaPop=null; _animaRenderSnippets(); await new Promise(r=>setTimeout(r,400));
   const box=document.getElementById('anima-snips');
   const rows=[...box.querySelectorAll('.anima-orow')].map(r=>({lab:(r.querySelector('.anima-olab')||{}).textContent||'',
     n:r.querySelectorAll('.anima-chip').length}));
   const etc=rows.find(r=>r.lab==='기타');
   return { 줄: rows.map(r=>r.lab).filter(Boolean), 기타개수: etc?etc.n:0 };
 });
 ck('★ 새 축이 기타 줄로 새지 않는다', panel.기타개수===0, '기타 '+panel.기타개수+'개');
 ck('후타가 켜져 있으면 형태·색·대비 줄이 나온다',
    ['형태','색','대비'].every(l=>panel.줄.includes(l)), panel.줄.join('/'));
 const panelOff=await p.evaluate(async()=>{
   (_anima.snippets||[]).forEach(s=>{ if(s.group==='futa') s.on=false; });
   _animaRenderSnippets(); await new Promise(r=>setTimeout(r,400));
   return [...document.querySelectorAll('#anima-snips .anima-olab')].map(e=>e.textContent.trim()).filter(Boolean);
 });
 ck('후타를 끄면 형태·색·대비 줄이 사라진다',
    !['형태','색','대비'].some(l=>panelOff.includes(l)), panelOff.join('/'));
 console.log('  · 옵션 패널 줄: '+panel.줄.join(' / '));

 // ── 성인 표시를 끄면 숨는가
 const adultOff=await p.evaluate(async()=>{
   localStorage.setItem('adult_optin_v1','0');
   _animaRenderSnippets(); await new Promise(r=>setTimeout(r,300));
   const box=document.getElementById('anima-snips');
   //  칩 이름으로만 판정한다(설명·도움말 글에 같은 낱말이 있을 수 있어 textContent 전체는 못 믿는다)
   const chips=[...box.querySelectorAll('.anima-chip')].map(e=>e.textContent.trim());
   const rows=[...box.querySelectorAll('.anima-olab')].map(e=>e.textContent.trim());
   return { 칩에남음: chips.filter(t=>['창백','태닝','갈색','흑갈','없음 (면도)','살짝','큰 유륜','말자지'].includes(t)),
            줄에남음: rows.filter(t=>['피부색','수영복 자국','음모','겨털','유두 색','유륜 크기','자지 형태','자지 색'].includes(t)),
            세부버튼:!!document.querySelector('.anima-gbtn[data-grp="body"]') };
 });
 ck('성인 표시를 끄면 새 축이 숨는다',
    adultOff.칩에남음.length===0 && adultOff.줄에남음.length===0 && !adultOff.세부버튼, JSON.stringify(adultOff));
 await p.evaluate(()=>{localStorage.setItem('adult_optin_v1','1');});

 // ── 기존 사용자 마이그레이션
 const oldSeed=JSON.stringify({prompt:'masterpiece, best quality, score_7, ', _wf:'v8ft',
   snippets:[{id:'base_full',name:'전신 노출',kind:'base',text:'x'},{id:'bust_large',name:'거유',kind:'append',on:false,group:'bust',text:'large breasts'}]});
 await ctx.close();
 const s2=await boot(b,9066,oldSeed);
 const mig=await s2.p.evaluate(()=>{
   const g={}; (_anima.snippets||[]).forEach(s=>{ if(s.group)(g[s.group]=g[s.group]||[]).push(s.id); });
   return { skin:(g.skin||[]).length, pubic:(g.pubic||[]).length, armpit:(g.armpit||[]).length,
            nip:(g.nip||[]).length, areola:(g.areola||[]).length, futaColor:(g.futaColor||[]).length,
            futaShape:(g.futaShape||[]).length, tanline:(g.tanline||[]).length,
            glans: (_anima.snippets||[]).some(s=>s.id==='dcol_glans'),
            원래것: (_anima.snippets||[]).some(s=>s.id==='bust_large') };
 });
 const migOk = mig.skin===4&&mig.pubic===4&&mig.armpit===3&&mig.nip===5&&mig.areola===2&&mig.futaColor===4&&mig.futaShape===4&&mig.tanline===3&&mig.glans;
 ck('★ 기존 사용자에게도 새 축이 전부 들어간다', migOk, JSON.stringify(mig));
 ck('기존 사용자의 원래 항목은 그대로', mig.원래것===true, String(mig.원래것));
 const e2=s2.errs.filter(e=>!/Failed to load|net::ERR/.test(e));
 await s2.ctx.close();

 const re=errs.concat(e2).filter(e=>!/Failed to load|net::ERR/.test(e));
 console.log(re.length?('PAGE ERRORS: '+re.slice(0,3).join(' | ')):'no page errors'); if(re.length)f++;
 console.log(f?`\n${f} FAILED`:'\nALL PASS');
 await b.close();srv.close();process.exit(f?1:0);})();
