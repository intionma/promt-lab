/**
 * previz-ui.js — Callout 패널 (DB 태그 캡슐 + 파라미터) + HUD
 * 태그선택창과 동일한 캡슐 스타일, 양방향 연동
 */

import { applyTokenToEditor, removeTokenFromEditor, getEditorActiveTags } from './previz-sync.js';

// ── 포즈 / 환경 / 날씨 목록 ──────────────────────────────────────
const POSE_LIST = [
    { key: 'stand',         label: '서기' },
    { key: 'arms_up',       label: '팔 들기' },
    { key: 'hands_on_hips', label: '손 허리' },
    { key: 'crossed_arms',  label: '팔짱' },
    { key: 'peace_sign',    label: '브이' },
    { key: 'sit',           label: '앉기' },
    { key: 'lean',          label: '기대기' },
];
const ENV_LIST     = [{ key:'park',label:'🌳 공원'},{key:'indoor',label:'🛋 실내'},{key:'street',label:'🏙 거리'},{key:'sky',label:'☁️ 하늘'}];
const WEATHER_LIST = [{ key:'clear',label:'☀️ 맑음'},{key:'rain',label:'🌧 비'},{key:'snow',label:'❄️ 눈'}];

let _panel     = null;
let _sceneRef  = null;

export function setSceneRef(scene) { _sceneRef = scene; }

// ── 파트 클릭 핸들러 (레이캐스팅 결과) ──────────────────────────
export function initPartClickHandler(scene) {
    _sceneRef = scene;
    window.__previzOnPartClick   = (partId, partName, state, sceneRef) => {
        // Callout 시스템이 처리하므로 여기서는 직접 패널 열지 않음
    };
    window.__previzUpdateUnmapped = (unmapped) => updateUnmappedBadge(unmapped);
}

// ── Callout 클릭 → 패널 열기 ─────────────────────────────────────
export function showCalloutPanel(def, anchorEl) {
    removePanel();

    const wrap = document.getElementById('previz-canvas-wrap');
    if (!wrap) return;

    _panel = document.createElement('div');
    _panel.id = 'previz-part-panel';

    // 글라스 디자인 패널
    _panel.style.cssText = [
        'position:absolute', 'top:60px', 'right:16px', 'width:268px',
        'background:rgba(18,22,32,0.82)',
        'border:1px solid rgba(255,255,255,0.12)',
        'border-radius:14px', 'padding:0',
        'font-family:system-ui,sans-serif', 'color:#d8dde8', 'z-index:300',
        'backdrop-filter:blur(18px) saturate(1.4)',
        '-webkit-backdrop-filter:blur(18px) saturate(1.4)',
        'box-shadow:0 8px 32px rgba(0,0,0,0.55),0 1px 0 rgba(255,255,255,0.08) inset',
        'overflow:hidden',
        'opacity:0', 'transform:translateX(18px)',
        'transition:opacity 0.20s ease,transform 0.20s ease',
    ].join(';');

    // ── 헤더 (탭 전환) ──
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);';

    const tabTag   = makeTab(`${def.icon} 태그`, true);
    const tabParam = makeTab('⚙ 파라미터', false);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'margin-left:auto;background:transparent;border:none;color:rgba(200,210,230,0.4);font-size:13px;cursor:pointer;padding:8px 12px;transition:color 0.15s;';
    closeBtn.onmouseover = () => closeBtn.style.color = 'rgba(255,255,255,0.8)';
    closeBtn.onmouseout  = () => closeBtn.style.color = 'rgba(200,210,230,0.4)';
    closeBtn.onclick = removePanel;

    header.appendChild(tabTag);
    header.appendChild(tabParam);
    header.appendChild(closeBtn);
    _panel.appendChild(header);

    // ── 탭 컨텐츠 영역 ──
    const body = document.createElement('div');
    body.style.cssText = 'max-height:420px;overflow-y:auto;padding:12px 14px;color:#d0d8ea;';
    _panel.appendChild(body);

    // 태그 탭
    const tagPane   = buildTagPane(def);
    // 파라미터 탭
    const paramPane = buildParamPane(def);

    body.appendChild(tagPane);

    function switchTab(toTag) {
        body.innerHTML = '';
        body.appendChild(toTag ? tagPane : paramPane);
        tabTag.style.background   = toTag ? 'rgba(120,180,255,0.12)' : 'transparent';
        tabTag.style.color        = toTag ? '#a8c8ff' : 'rgba(180,190,210,0.45)';
        tabParam.style.background = !toTag ? 'rgba(120,180,255,0.12)' : 'transparent';
        tabParam.style.color      = !toTag ? '#a8c8ff' : 'rgba(180,190,210,0.45)';
    }
    tabTag.onclick   = () => switchTab(true);
    tabParam.onclick = () => switchTab(false);

    wrap.appendChild(_panel);

    // 애니메이션 트리거
    requestAnimationFrame(() => {
        _panel.style.opacity   = '1';
        _panel.style.transform = 'translateX(0)';
    });
}

function makeTab(label, active) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = [
        'flex:1', 'padding:10px 8px', 'border:none',
        'background:' + (active ? 'rgba(120,180,255,0.12)' : 'transparent'),
        'color:' + (active ? '#a8c8ff' : 'rgba(180,190,210,0.45)'),
        'font-family:system-ui,sans-serif', 'font-size:11px', 'cursor:pointer',
        'letter-spacing:0.3px', 'transition:background 0.15s,color 0.15s',
    ].join(';');
    return btn;
}

// ── 태그 패널: DB에서 해당 폴더 태그를 캡슐로 렌더 ─────────────
function buildTagPane(def) {
    const pane = document.createElement('div');

    const promptDB = window.__getPromptDB?.() || {};
    const map      = window.__getActiveTagsMap?.() || {};
    const active   = new Set(getEditorActiveTags().map(t => t.token));

    // def.dbLayers에 있는 레이어들에서 def.tagGroups 폴더 찾기
    let rendered = 0;
    def.dbLayers.forEach(layerIdx => {
        const layer = promptDB[layerIdx];
        if (!layer) return;

        Object.entries(layer).forEach(([folderKey, tags]) => {
            // 이 def와 관련된 폴더만
            const isRelevant = def.tagGroups.includes(folderKey)
                || tags.some(tag => def.tokenFilter(tag.t));
            if (!isRelevant) return;

            // 폴더 레이블
            const folderName = folderKey.split('|')[0];
            const folderDiv  = document.createElement('div');
            folderDiv.style.cssText = 'margin-bottom:10px;';

            const folderLabel = document.createElement('div');
            folderLabel.style.cssText = 'font-size:9px;color:rgba(160,180,220,0.50);margin-bottom:6px;letter-spacing:1.5px;';
            folderLabel.textContent = folderName.toUpperCase();
            folderDiv.appendChild(folderLabel);

            const chipRow = document.createElement('div');
            chipRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';

            tags.forEach(tagData => {
                const isOn = active.has(tagData.t) ||
                    tagData.t.split(',').map(s=>s.trim()).some(p => active.has(p));

                const chip = document.createElement('button');
                chip.style.cssText = buildChipStyle(isOn, map[tagData.t]?.color);
                chip.innerHTML = `
                    <span style="font-size:10px;opacity:0.65;">${tagData.t.length > 16 ? tagData.t.slice(0,15)+'…' : tagData.t}</span>
                    ${tagData.k ? `<span style="font-size:11px;">${tagData.k}</span>` : ''}
                `;
                chip.title = `${tagData.t}\n${tagData.k}`;

                chip.onclick = () => {
                    const nowOn = chip.dataset.active === '1';
                    if (nowOn) {
                        removeTokenFromEditor(tagData.t, layerIdx);
                        chip.dataset.active = '0';
                        chip.style.cssText = buildChipStyle(false, map[tagData.t]?.color);
                    } else {
                        applyTokenToEditor(tagData.t, { layerHint: layerIdx });
                        chip.dataset.active = '1';
                        chip.style.cssText = buildChipStyle(true, map[tagData.t]?.color);
                    }
                };
                chip.dataset.active = isOn ? '1' : '0';
                chipRow.appendChild(chip);
                rendered++;
            });

            folderDiv.appendChild(chipRow);
            pane.appendChild(folderDiv);
        });
    });

    if (rendered === 0) {
        const note = document.createElement('div');
        note.style.cssText = 'font-size:11px;color:rgba(180,190,210,0.40);padding:8px 0;';
        note.textContent = '관련 태그가 없습니다.';
        pane.appendChild(note);
    }

    return pane;
}

function buildChipStyle(active, color) {
    const c = color || '#7ab4ff';
    return [
        'display:flex', 'flex-direction:column', 'align-items:center',
        'padding:4px 8px', 'border-radius:7px', 'cursor:pointer',
        'border:1px solid ' + (active ? c : 'rgba(255,255,255,0.12)'),
        'background:' + (active ? `rgba(100,160,255,0.18)` : 'rgba(255,255,255,0.05)'),
        'color:' + (active ? '#c0d8ff' : 'rgba(180,195,220,0.65)'),
        'font-family:system-ui,sans-serif',
        'transition:border-color 0.15s,background 0.15s,color 0.15s',
        'min-width:52px', 'text-align:center',
    ].join(';');
}

// ── 파라미터 패널 ─────────────────────────────────────────────────
function buildParamPane(def) {
    const pane = document.createElement('div');
    if (!_sceneRef) {
        pane.textContent = '씬이 아직 초기화되지 않았습니다.';
        return pane;
    }

    const state = _sceneRef.state;

    // Callout id에 따라 다른 파라미터
    const paramDefs = getParamDefs(def.id, state);

    paramDefs.forEach(ctrl => {
        const wrap = document.createElement('div');
        wrap.style.marginBottom = '12px';

        if (ctrl.label) {
            const lbl = document.createElement('div');
            lbl.style.cssText = 'font-size:9px;color:rgba(160,180,220,0.55);margin-bottom:6px;letter-spacing:1.5px;';
            lbl.textContent = ctrl.label.toUpperCase();
            wrap.appendChild(lbl);
        }

        if (ctrl.type === 'slider') {
            appendSlider(wrap, ctrl, state);
        } else if (ctrl.type === 'color-pick') {
            appendColorPick(wrap, ctrl, state);
        } else if (ctrl.type === 'enum') {
            appendEnum(wrap, ctrl, state);
        } else if (ctrl.type === 'pose') {
            appendPosePicker(wrap, state);
        } else if (ctrl.type === 'env') {
            appendEnvPicker(wrap, state);
        }

        pane.appendChild(wrap);
    });

    return pane;
}

function getParamDefs(calloutId, state) {
    switch (calloutId) {
        case 'hair': return [
            { type:'slider',     label:'길이',   channel:'hair.length', min:0.05, max:1.40, step:0.05 },
            { type:'color-pick', label:'색상',   channel:'hair.color',
              presets: [
                { label:'시안',  value:'#00eaff'}, { label:'금발',  value:'#f5d060'},
                { label:'흑발',  value:'#1a1a2e'}, { label:'갈색',  value:'#7a4a1e'},
                { label:'핑크',  value:'#ff80b0'}, { label:'은발',  value:'#c0c8d8'},
                { label:'빨강',  value:'#cc2200'}, { label:'하양',  value:'#e8eaf0'},
                { label:'보라',  value:'#9933ff'}, { label:'파랑',  value:'#2244cc'},
              ]},
            { type:'enum', label:'스타일', channel:'hair.style',
              options:[
                {value:'straight',label:'생머리'},{value:'ponytail',label:'포니테일'},
                {value:'twintails',label:'트윈테일'},{value:'braid',label:'브레이드'},
              ]},
        ];
        case 'face': return [
            { type:'color-pick', label:'눈 색상', channel:'eye.color',
              presets:[
                {label:'파랑',value:'#2288ff'},{label:'빨강',value:'#ff2222'},
                {label:'초록',value:'#22cc44'},{label:'보라',value:'#9933ff'},
                {label:'갈색',value:'#885522'},{label:'금색',value:'#ddaa22'},
                {label:'시안',value:'#00eaff'},{label:'은색',value:'#aabbcc'},
              ]},
        ];
        case 'upper': return [
            { type:'slider', label:'키',   channel:'body.height', min:0.78, max:1.20, step:0.01 },
            { type:'slider', label:'가슴', channel:'body.chest',  min:0.50, max:1.80, step:0.05 },
        ];
        case 'pose': return [
            { type:'pose' },
        ];
        case 'lower': return [
            { type:'enum', label:'의상', channel:'outfit.preset',
              options:[
                {value:'none',label:'없음'},
                {value:'school_uniform',label:'교복'},{value:'dress',label:'드레스'},
                {value:'casual',label:'캐주얼'},{value:'sportswear',label:'스포츠'},
                {value:'gothic_lolita',label:'고딕'},{value:'kimono',label:'기모노'},
                {value:'maid_uniform',label:'메이드'},{value:'white_dress',label:'흰 드레스'},
              ]},
        ];
        case 'env': return [
            { type:'env' },
        ];
        default: return [];
    }
}

function appendSlider(wrap, ctrl, state) {
    const [domain, prop] = ctrl.channel.split('.');
    const cur = state[domain]?.[prop] ?? ((ctrl.min+ctrl.max)/2);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const inp = document.createElement('input');
    inp.type='range'; inp.min=ctrl.min; inp.max=ctrl.max; inp.step=ctrl.step; inp.value=cur;
    inp.style.cssText='flex:1;accent-color:#7ab4ff;cursor:pointer;';
    const disp = document.createElement('span');
    disp.style.cssText='font-size:11px;min-width:32px;text-align:right;color:rgba(180,200,240,0.75);';
    disp.textContent=parseFloat(cur).toFixed(2);
    inp.oninput=()=>{
        disp.textContent=parseFloat(inp.value).toFixed(2);
        const ns=JSON.parse(JSON.stringify(_sceneRef.state));
        if(!ns[domain])ns[domain]={};
        ns[domain][prop]=parseFloat(inp.value);
        _sceneRef.state=ns;
        _sceneRef._buildAllParts(ns);
    };
    row.appendChild(inp); row.appendChild(disp);
    wrap.appendChild(row);
}

function appendColorPick(wrap, ctrl, state) {
    const grid=document.createElement('div');
    grid.style.cssText='display:flex;flex-wrap:wrap;gap:7px;';
    ctrl.presets.forEach(preset=>{
        const btn=document.createElement('button');
        btn.title=preset.label;
        btn.style.cssText=[
            `background:${preset.value}`,
            'width:26px','height:26px','border-radius:50%',
            'border:2px solid rgba(255,255,255,0.15)',
            'cursor:pointer','transition:transform 0.15s,border-color 0.15s,box-shadow 0.15s',
        ].join(';');
        btn.onmouseover=()=>{btn.style.transform='scale(1.2)';btn.style.borderColor='rgba(255,255,255,0.6)';btn.style.boxShadow=`0 0 8px ${preset.value}88`;};
        btn.onmouseout=()=>{btn.style.transform='';btn.style.borderColor='rgba(255,255,255,0.15)';btn.style.boxShadow='';};
        btn.onclick=()=>{
            const [domain,prop]=ctrl.channel.split('.');
            const ns=JSON.parse(JSON.stringify(_sceneRef.state));
            if(!ns[domain])ns[domain]={};
            ns[domain][prop]=preset.value;
            _sceneRef.state=ns;
            if(domain==='eye') _sceneRef._buildEyes(ns);
            else _sceneRef._buildAllParts(ns);

            // 색상 파라미터 → 해당 토큰 에디터에도 적용
            syncColorToEditor(ctrl.channel, preset.value);
        };
        grid.appendChild(btn);
    });
    wrap.appendChild(grid);
}

function appendEnum(wrap, ctrl, state) {
    const [domain, prop] = ctrl.channel.split('.');
    const curVal = state[domain]?.[prop] || ctrl.options[0].value;
    const row=document.createElement('div');
    row.style.cssText='display:flex;flex-wrap:wrap;gap:5px;';
    ctrl.options.forEach(opt=>{
        const btn=document.createElement('button');
        btn.textContent=opt.label;
        const isActive=curVal===opt.value;
        btn.style.cssText=[
            'background:'+(isActive?'rgba(100,160,255,0.18)':'rgba(255,255,255,0.04)'),
            'border:1px solid rgba(160,200,255,'+(isActive?'0.55':'0.15')+')',
            'color:'+(isActive?'#c0d8ff':'rgba(180,195,220,0.65)'),'border-radius:6px','padding:3px 9px',
            'font-size:10px','cursor:pointer','font-family:system-ui,sans-serif',
        ].join(';');
        btn.onclick=()=>{
            const ns=JSON.parse(JSON.stringify(_sceneRef.state));
            if(!ns[domain])ns[domain]={};
            ns[domain][prop]=opt.value;
            _sceneRef.state=ns;
            _sceneRef._buildAllParts(ns);
            row.querySelectorAll('button').forEach(b=>{
                b.style.background='rgba(255,255,255,0.04)';
                b.style.borderColor='rgba(160,200,255,0.15)';
            });
            btn.style.background='rgba(100,160,255,0.18)';
            btn.style.borderColor='rgba(160,200,255,0.55)';
            // enum → 에디터 토큰 적용
            syncEnumToEditor(ctrl.channel, opt.value);
        };
        row.appendChild(btn);
    });
    wrap.appendChild(row);
}

function appendPosePicker(wrap, state) {
    const row=document.createElement('div');
    row.style.cssText='display:flex;flex-wrap:wrap;gap:5px;';
    POSE_LIST.forEach(p=>{
        const btn=document.createElement('button');
        btn.textContent=p.label;
        const isActive=(state.pose||'stand')===p.key;
        btn.style.cssText=[
            'background:'+(isActive?'rgba(0,234,255,0.18)':'transparent'),
            'border:1px solid rgba(0,234,255,'+(isActive?'0.5':'0.18')+')',
            'color:#00eaff','border-radius:5px','padding:4px 10px',
            'font-size:10px','cursor:pointer','font-family:monospace',
        ].join(';');
        btn.onclick=()=>{
            _sceneRef.state.pose=p.key;
            _sceneRef._buildAllParts(_sceneRef.state);
            // 포즈 토큰 에디터 적용
            applyTokenToEditor(p.key, { layerHint: 5 });
            row.querySelectorAll('button').forEach(b=>{
                b.style.background='transparent';b.style.borderColor='rgba(0,234,255,0.18)';
            });
            btn.style.background='rgba(0,234,255,0.18)';btn.style.borderColor='rgba(0,234,255,0.5)';
        };
        row.appendChild(btn);
    });
    wrap.appendChild(row);
}

function appendEnvPicker(wrap, state) {
    // 환경
    const envLabel=document.createElement('div');
    envLabel.style.cssText='font-size:9px;color:rgba(160,180,220,0.55);margin-bottom:6px;letter-spacing:1.5px;';
    envLabel.textContent='배경';
    wrap.appendChild(envLabel);
    const envRow=document.createElement('div');
    envRow.style.cssText='display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;';
    ENV_LIST.forEach(e=>{
        const btn=document.createElement('button');
        btn.textContent=e.label;
        const isActive=(state.env?.preset||'park')===e.key;
        btn.style.cssText=['background:'+(isActive?'rgba(100,160,255,0.18)':'rgba(255,255,255,0.04)'),'border:1px solid rgba(160,200,255,'+(isActive?'0.55':'0.15')+')','color:'+(isActive?'#c0d8ff':'rgba(180,195,220,0.65)'),'border-radius:6px','padding:3px 9px','font-size:10px','cursor:pointer','font-family:system-ui,sans-serif'].join(';');
        btn.onclick=()=>{
            _sceneRef.state.env.preset=e.key;
            _sceneRef._applyEnv(_sceneRef.state.env);
            envRow.querySelectorAll('button').forEach(b=>{b.style.background='rgba(255,255,255,0.04)';b.style.borderColor='rgba(160,200,255,0.15)';b.style.color='rgba(180,195,220,0.65)';});
            btn.style.background='rgba(0,234,255,0.18)';btn.style.borderColor='rgba(0,234,255,0.5)';
            // 에디터에도 반영
            const envTokenMap={park:'outdoors',indoor:'indoors',street:'street',sky:'sky'};
            if(envTokenMap[e.key]) applyTokenToEditor(envTokenMap[e.key],{layerHint:6});
        };
        envRow.appendChild(btn);
    });
    wrap.appendChild(envRow);

    // 날씨
    const wLabel=document.createElement('div');
    wLabel.style.cssText='font-size:9px;color:rgba(160,180,220,0.55);margin-bottom:6px;letter-spacing:1.5px;';
    wLabel.textContent='날씨';
    wrap.appendChild(wLabel);
    const wRow=document.createElement('div');
    wRow.style.cssText='display:flex;gap:5px;';
    WEATHER_LIST.forEach(w=>{
        const btn=document.createElement('button');
        btn.textContent=w.label;
        const isActive=(state.env?.weather||'clear')===w.key;
        btn.style.cssText=['background:'+(isActive?'rgba(100,160,255,0.18)':'rgba(255,255,255,0.04)'),'border:1px solid rgba(160,200,255,'+(isActive?'0.55':'0.15')+')','color:'+(isActive?'#c0d8ff':'rgba(180,195,220,0.65)'),'border-radius:6px','padding:3px 9px','font-size:10px','cursor:pointer','font-family:system-ui,sans-serif'].join(';');
        btn.onclick=()=>{
            _sceneRef.state.env.weather=w.key;
            _sceneRef._weather?.setWeather(w.key);
            wRow.querySelectorAll('button').forEach(b=>{b.style.background='rgba(255,255,255,0.04)';b.style.borderColor='rgba(160,200,255,0.15)';b.style.color='rgba(180,195,220,0.65)';});
            btn.style.background='rgba(0,234,255,0.18)';btn.style.borderColor='rgba(0,234,255,0.5)';
            if(w.key!=='clear') applyTokenToEditor(w.key,{layerHint:6});
        };
        wRow.appendChild(btn);
    });
    wrap.appendChild(wRow);

    // 시간대
    const tLabel=document.createElement('div');
    tLabel.style.cssText='font-size:9px;color:rgba(160,180,220,0.55);margin:10px 0 6px;letter-spacing:1.5px;';
    tLabel.textContent='시간대';
    wrap.appendChild(tLabel);
    const tRow=document.createElement('div');
    tRow.style.cssText='display:flex;align-items:center;gap:8px;';
    const tSlider=document.createElement('input');
    tSlider.type='range';tSlider.min=0;tSlider.max=1;tSlider.step=0.01;
    tSlider.value=state.env?.timeOfDay??0.5;
    tSlider.style.cssText='flex:1;accent-color:#00eaff;cursor:pointer;';
    const tLabels=['새벽','낮','저녁','밤'];
    const tDisp=document.createElement('span');
    tDisp.style.cssText='font-size:10px;color:rgba(180,200,240,0.70);min-width:28px;text-align:right;';
    tDisp.textContent=tLabels[Math.round(parseFloat(tSlider.value)*3)];
    tSlider.oninput=()=>{
        const v=parseFloat(tSlider.value);
        _sceneRef.state.env.timeOfDay=v;
        _sceneRef._applyTimeOfDay(v);
        tDisp.textContent=tLabels[Math.round(v*3)];
    };
    tRow.appendChild(tSlider);tRow.appendChild(tDisp);
    wrap.appendChild(tRow);
}

// ── 색상/enum 파라미터 → 에디터 연동 ─────────────────────────────
function syncColorToEditor(channel, hexValue) {
    // 색상 hex → 대응 태그 토큰 찾기
    const colorMap = {
        'hair.color': {
            '#f5d060':'blonde_hair','#1a1a2e':'black_hair','#7a4a1e':'brown_hair',
            '#e8eaf0':'white_hair','#ff80b0':'pink_hair','#c0c8d8':'silver_hair',
            '#cc2200':'red_hair','#9933ff':'purple_hair','#2244cc':'blue_hair',
        },
        'eye.color': {
            '#2288ff':'blue_eyes','#ff2222':'red_eyes','#22cc44':'green_eyes',
            '#9933ff':'purple_eyes','#885522':'brown_eyes','#ddaa22':'golden_eyes',
        },
    };
    const tokenMap = colorMap[channel];
    if (!tokenMap) return;
    const token = tokenMap[hexValue];
    if (token) applyTokenToEditor(token, { layerHint: 3 });
}

function syncEnumToEditor(channel, value) {
    if (channel === 'hair.style') {
        const styleMap = {
            ponytail:'ponytail', twintails:'twintails', braid:'braid',
        };
        const token = styleMap[value];
        if (token) applyTokenToEditor(token, { layerHint: 3 });
    }
    if (channel === 'outfit.preset') {
        const outfitMap = {
            school_uniform:'school_uniform', dress:'dress', casual:'casual',
            sportswear:'sportswear', gothic_lolita:'gothic_lolita', kimono:'kimono',
            maid_uniform:'maid_uniform', white_dress:'white_dress',
        };
        const token = outfitMap[value];
        if (token) applyTokenToEditor(token, { layerHint: 4 });
    }
}

function removePanel() {
    if (_panel) {
        _panel.style.opacity   = '0';
        _panel.style.transform = 'translateX(16px)';
        setTimeout(() => { _panel?.remove(); _panel = null; }, 220);
    }
    document.getElementById('previz-part-panel')?.remove();
}

// ── HUD ──────────────────────────────────────────────────────────
export function initHUD(sceneRef) {
    _sceneRef = sceneRef;
    if (document.getElementById('previz-hud')) return;
    const wrap = document.getElementById('previz-canvas-wrap');
    if (!wrap) return;

    const hud = document.createElement('div');
    hud.id = 'previz-hud';
    hud.style.cssText = [
        'position:absolute','bottom:10px','left:50%',
        'transform:translateX(-50%)',
        'display:flex','gap:6px','z-index:50',
        'flex-wrap:wrap','justify-content:center',
        'pointer-events:auto',
    ].join(';');

    const poseGroup   = hudGroup('🕺 포즈');
    POSE_LIST.forEach(p => {
        const btn = hudChip(p.label, (state.pose||'stand')===p.key, () => {
            sceneRef.state.pose=p.key;
            sceneRef._buildAllParts(sceneRef.state);
            applyTokenToEditor(p.key,{layerHint:5});
            poseGroup.querySelectorAll('button').forEach(b=>b.classList.remove('hud-active'));
            btn.classList.add('hud-active');
        });
        poseGroup.appendChild(btn);
    });

    const envGroup = hudGroup('🌍 배경');
    ENV_LIST.forEach(e => {
        const btn = hudChip(e.label, (sceneRef.state.env?.preset||'park')===e.key, () => {
            sceneRef.state.env.preset=e.key;
            sceneRef._applyEnv(sceneRef.state.env);
            const envMap={park:'outdoors',indoor:'indoors',street:'street',sky:'sky'};
            if(envMap[e.key]) applyTokenToEditor(envMap[e.key],{layerHint:6});
            envGroup.querySelectorAll('button').forEach(b=>b.classList.remove('hud-active'));
            btn.classList.add('hud-active');
        });
        envGroup.appendChild(btn);
    });

    const wGroup = hudGroup('🌦 날씨');
    WEATHER_LIST.forEach(w => {
        const btn = hudChip(w.label, (sceneRef.state.env?.weather||'clear')===w.key, () => {
            sceneRef.state.env.weather=w.key;
            sceneRef._weather?.setWeather(w.key);
            if(w.key!=='clear') applyTokenToEditor(w.key,{layerHint:6});
            wGroup.querySelectorAll('button').forEach(b=>b.classList.remove('hud-active'));
            btn.classList.add('hud-active');
        });
        wGroup.appendChild(btn);
    });

    hud.appendChild(poseGroup);
    hud.appendChild(envGroup);
    hud.appendChild(wGroup);
    wrap.appendChild(hud);

    // HUD 활성 스타일 (CSS 인라인)
    if (!document.getElementById('previz-hud-style')) {
        const style=document.createElement('style');
        style.id='previz-hud-style';
        style.textContent=`.hud-active{background:rgba(100,160,255,0.22)!important;color:#c0d8ff!important;border-color:rgba(160,200,255,0.55)!important;}`;
        document.head.appendChild(style);
    }
}

// ── HUD 그룹/칩 생성 헬퍼 ─────────────────────────────────────────
function hudGroup(title) {
    const wrap=document.createElement('div');
    wrap.style.cssText=['display:flex','align-items:center','gap:3px',
        'background:rgba(15,20,32,0.78)','border:1px solid rgba(255,255,255,0.10)',
        'border-radius:8px','padding:3px 7px','font-family:system-ui,sans-serif',
        'backdrop-filter:blur(10px)','-webkit-backdrop-filter:blur(10px)',
    ].join(';');
    const lbl=document.createElement('span');
    lbl.style.cssText='font-size:9px;color:rgba(160,180,220,0.45);margin-right:3px;white-space:nowrap;';
    lbl.textContent=title;
    wrap.appendChild(lbl);
    return wrap;
}

function hudChip(label, active, onClick) {
    const btn=document.createElement('button');
    btn.textContent=label;
    if(active) btn.classList.add('hud-active');
    btn.style.cssText=['background:rgba(255,255,255,0.04)','border:1px solid rgba(255,255,255,0.12)',
        'color:rgba(180,195,220,0.65)','border-radius:5px','padding:3px 8px',
        'font-size:10px','cursor:pointer','font-family:system-ui,sans-serif','white-space:nowrap',
    ].join(';');
    btn.onclick=onClick;
    return btn;
}

// ── 미매핑 배지 ───────────────────────────────────────────────────
function updateUnmappedBadge(unmapped) {
    let badge=document.getElementById('previz-unmapped-badge');
    if(!badge){
        badge=document.createElement('div');
        badge.id='previz-unmapped-badge';
        badge.style.cssText=['position:absolute','bottom:70px','left:16px','background:rgba(15,20,32,0.80)','border:1px solid rgba(255,255,255,0.10)','border-radius:7px','padding:6px 10px','font-family:system-ui,sans-serif','font-size:9px','color:rgba(180,190,210,0.55)','max-width:180px','line-height:1.6','backdrop-filter:blur(8px)'].join(';');
        document.getElementById('previz-canvas-wrap')?.appendChild(badge);
    }
    if(!unmapped||unmapped.length===0){badge.style.display='none';return;}
    badge.style.display='block';
    badge.innerHTML=`<div style="color:rgba(220,200,120,0.70);margin-bottom:3px;">⚠ 3D 미반영 (${unmapped.length})</div>`
        +unmapped.slice(0,6).map(t=>`<span style="opacity:0.5;">${t}</span>`).join('<br>');
}

// state getter 헬퍼 (HUD 초기화 시 사용)
const state = new Proxy({}, { get: (_, key) => _sceneRef?.state?.[key] });
