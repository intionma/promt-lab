const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const srv = http.createServer((req, res) => {
    const p = path.join('/home/user/promt-lab', req.url === '/' ? 'index.html' : req.url);
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html' });
    fs.createReadStream(p).pipe(res);
});

(async () => {
    await new Promise(r => srv.listen(8941, r));
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:8941/', { waitUntil: 'load' });
    await page.waitForTimeout(800);

    let fails = 0;
    const check = (name, cond, detail) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (cond ? '' : ' :: ' + detail)); if (!cond) fails++; };

    const r = await page.evaluate(() => {
        window.showToast = () => {};
        const $ = id => document.getElementById(id);
        const out = {};
        const setCkpt = v => { $('comfy-ckpt').value = v; };
        // v9.117.0부터 LoRA는 칩 프리셋이다(입력칸 없음) — 칩 배열을 직접 세팅
        const setLora = (a, b) => {
            _comfyLoraPresets = [];
            if (a) _comfyLoraPresets.push({ name: a, label: a, trigger: '', strength: 0.8, on: true });
            if (b) _comfyLoraPresets.push({ name: b, label: b, trigger: '', strength: 0.8, on: true });
            _comfyLoraPresetsSave();
        };

        //  ★ v9.149.0 부터 전송 기본값이 '긍정만' 이다 — 그러면 부정 칸을 아예 비워 보내므로
        //    체크포인트 계열 자동 부정 보정도 (의도적으로) 건너뛴다. 이 검사는 '부정을 보낼 때'의
        //    보정 규칙을 보는 것이므로 '둘 다'로 맞춰 놓고 확인한다. 긍정만일 때의 동작은 아래에서 따로 본다.
        try { comfySetTarget('both'); } catch (e) {}

        // ── 1) Pony + LoRA 없음 + 자동보정 ON → 기존과 100% 동일한 워크플로우
        setCkpt('ponyRealism_V22.safetensors'); setLora('', '');
        $('comfy-family-auto').checked = true;
        const POS = 'score_9, score_8_up, 1girl, nude', NEG = 'bad hands';
        let wf = _comfyBuildWorkflow(POS, NEG);
        out.ponyNodes = Object.keys(wf).sort().join(',');
        out.ponyModelRef = JSON.stringify(wf['3'].inputs.model);
        out.ponyClipRef = JSON.stringify(wf['6'].inputs.clip);
        out.ponyPos = wf['6'].inputs.text;
        out.ponyNeg = wf['7'].inputs.text;

        // ── 2) Illustrious → score 제거 + masterpiece 접두 + 빈 부정 채움
        setCkpt('waiNSFWIllustrious_v110.safetensors');
        wf = _comfyBuildWorkflow('score_9, score_8_up, 1girl, nude', '');
        out.illPos = wf['6'].inputs.text;
        out.illNeg = wf['7'].inputs.text;
        // 부정을 직접 쓴 경우엔 존중
        wf = _comfyBuildWorkflow('1girl', 'my custom neg');
        out.illNegKeep = wf['7'].inputs.text;

        // ── 2-b) 긍정만 보내기면 부정은 비고 자동 보정도 안 걸린다 (v9.149.0 의도된 동작)
        try { comfySetTarget('pos'); } catch (e) {}
        wf = _comfyBuildWorkflow('score_9, 1girl', '');
        out.posOnlyNeg = wf['7'].inputs.text;
        wf = _comfyBuildWorkflow('1girl', 'my custom neg');
        out.posOnlyNegKeep = wf['7'].inputs.text;
        try { comfySetTarget('both'); } catch (e) {}

        // ── 3) 자동 보정 OFF → 아무것도 안 바뀜
        $('comfy-family-auto').checked = false;
        wf = _comfyBuildWorkflow('score_9, 1girl', '');
        out.offPos = wf['6'].inputs.text;
        $('comfy-family-auto').checked = true;

        // ── 4) LoRA 1개 → 노드 10 체인
        setCkpt('ponyRealism_V22.safetensors'); setLora('wombTattoos_xl.safetensors', '');
        wf = _comfyBuildWorkflow('1girl', '');
        out.loraNode = JSON.stringify((wf['10'] || {}).inputs && { name: wf['10'].inputs.lora_name, m: wf['10'].inputs.model, c: wf['10'].inputs.clip });
        out.loraModelRef = JSON.stringify(wf['3'].inputs.model);
        out.loraClipRef = JSON.stringify(wf['6'].inputs.clip);

        // ── 5) LoRA 2개 → 10→11 체인
        setLora('a.safetensors', 'b.safetensors');
        wf = _comfyBuildWorkflow('1girl', '');
        out.lora2Model = JSON.stringify(wf['3'].inputs.model);
        out.lora2Chain = JSON.stringify(wf['11'].inputs.model);
        setLora('', '');

        // ── 6) 계열 감지
        out.famPony = _ckptFamilyOf('ponyRealism_V22.safetensors');
        out.famIll = _ckptFamilyOf('noobaiXLNAIXL_vPred10.safetensors');
        out.famWai = _ckptFamilyOf('waiNSFWIllustrious_v110.safetensors');
        out.famSdxl = _ckptFamilyOf('juggernautXL_ragnarokBy.safetensors');
        out.famNone = _ckptFamilyOf('someSD15model.safetensors');

        // ── 7) 계열 전환 시 권장 세팅 자동 적용
        localStorage.setItem('comfy_family_last::' + _comfyActiveSettingsKey(), 'pony');
        setCkpt('waiNSFWIllustrious_v110.safetensors');
        comfyCkptChanged();
        out.autoCfg = $('comfy-cfg').value; out.autoSampler = $('comfy-sampler').value;
        // 같은 계열 안에서는 안 바뀜
        $('comfy-cfg').value = '9';
        setCkpt('illustriousXL_v01.safetensors');
        comfyCkptChanged();
        out.sameFamCfg = $('comfy-cfg').value;

        // ── 8) 커스텀 워크플로우 경로 불변 확인 — _comfyBuildCustomWorkflow 소스에 새 함수 참조가 없어야 함
        out.customClean = !/FamilyWrap|comfy-lora1|_CKPT_FAMILIES/.test(String(_comfyBuildCustomWorkflow));
        return out;
    });

    check('1) Pony+LoRA없음: 노드 구성 기존 그대로(3~9)', r.ponyNodes === '3,4,5,6,7,8,9', r.ponyNodes);
    check('1) Pony: model ["4",0] 그대로', r.ponyModelRef === '["4",0]', r.ponyModelRef);
    check('1) Pony: clip ["4",1] 그대로', r.ponyClipRef === '["4",1]', r.ponyClipRef);
    check('1) Pony: 프롬프트 무변경', r.ponyPos === 'score_9, score_8_up, 1girl, nude' && r.ponyNeg === 'bad hands', r.ponyPos + ' | ' + r.ponyNeg);
    check('2) Illustrious: score 제거+접두', r.illPos === 'masterpiece, best quality, very aesthetic, 1girl, nude', r.illPos);
    check('2) Illustrious: 빈 부정 기본값 채움', /worst quality/.test(r.illNeg), r.illNeg);
    check('2) Illustrious: 쓴 부정은 존중', r.illNegKeep === 'my custom neg', r.illNegKeep);
    check('2-b) 긍정만이면 자동 부정을 안 채운다 (v9.149.0)', r.posOnlyNeg === '', JSON.stringify(r.posOnlyNeg));
    check('2-b) 긍정만이면 직접 쓴 부정도 안 나간다', r.posOnlyNegKeep === '', JSON.stringify(r.posOnlyNegKeep));
    check('3) 자동 보정 OFF: 원문 그대로', r.offPos === 'score_9, 1girl', r.offPos);
    check('4) LoRA1 체인: 노드10 생성', /wombTattoos/.test(r.loraNode || ''), r.loraNode);
    check('4) LoRA1: KSampler model ["10",0]', r.loraModelRef === '["10",0]', r.loraModelRef);
    check('4) LoRA1: clip ["10",1]', r.loraClipRef === '["10",1]', r.loraClipRef);
    check('5) LoRA2: 10→11 체인, model ["11",0]', r.lora2Model === '["11",0]' && r.lora2Chain === '["10",0]', r.lora2Model + '/' + r.lora2Chain);
    check('6) 계열 감지 정확', r.famPony === 'pony' && r.famIll === 'illustrious' && r.famWai === 'illustrious' && r.famSdxl === 'sdxl' && r.famNone === null,
        [r.famPony, r.famIll, r.famWai, r.famSdxl, r.famNone].join('/'));
    check('7) 계열 전환 → 권장 세팅 적용 (CFG 5.5·euler_a)', r.autoCfg === '5.5' && r.autoSampler === 'euler_ancestral', r.autoCfg + '/' + r.autoSampler);
    check('7) 같은 계열 내 변경 → 세팅 유지', r.sameFamCfg === '9', r.sameFamCfg);
    check('8) 커스텀 워크플로우 경로에 새 코드 참조 없음', r.customClean === true, 'custom path touched!');

    console.log(errs.length ? 'PAGE ERRORS: ' + errs.join('; ') : 'no page errors');
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
    await browser.close();
    srv.close();
    process.exit(fails ? 1 : 0);
})();
