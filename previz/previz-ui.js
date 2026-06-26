/**
 * previz-ui.js — 바디파트 클릭 패널 + 환경/날씨/포즈 HUD + 미매핑 배지
 * P2~P4
 */

const POSE_LIST = [
    { key: 'stand',         label: '서기' },
    { key: 'arms_up',       label: '팔 들기' },
    { key: 'hands_on_hips', label: '손 허리' },
    { key: 'crossed_arms',  label: '팔짱' },
    { key: 'peace_sign',    label: '브이' },
    { key: 'sit',           label: '앉기' },
    { key: 'lean',          label: '기대기' },
];

const ENV_LIST = [
    { key: 'park',   label: '🌳 공원' },
    { key: 'indoor', label: '🛋 실내' },
    { key: 'street', label: '🏙 거리' },
    { key: 'sky',    label: '☁️ 하늘' },
];

const WEATHER_LIST = [
    { key: 'clear', label: '☀️ 맑음' },
    { key: 'rain',  label: '🌧 비' },
    { key: 'snow',  label: '❄️ 눈' },
];

// ── 바디파트별 컨트롤 정의 ────────────────────────────────────────
const PART_CONTROLS = {
    0: {  // 눈
        label: '👁 눈 색상',
        controls: [{
            type: 'color-pick', channel: 'eye.color',
            presets: [
                { label: '파랑',  value: '#2288ff' }, { label: '빨강',  value: '#ff2222' },
                { label: '초록',  value: '#22cc44' }, { label: '보라',  value: '#9933ff' },
                { label: '갈색',  value: '#885522' }, { label: '시안',  value: '#00eaff' },
                { label: '금색',  value: '#ddaa22' }, { label: '은색',  value: '#aabbcc' },
            ],
        }],
    },
    1: {  // 몸통
        label: '👤 체형',
        controls: [
            { type: 'slider', label: '키',   channel: 'body.height', min: 0.78, max: 1.20, step: 0.01 },
            { type: 'slider', label: '가슴', channel: 'body.chest',  min: 0.50, max: 1.80, step: 0.05 },
        ],
    },
    2: { label: '💪 왼팔', controls: [{ type: 'pose-link' }] },
    3: { label: '💪 오른팔', controls: [{ type: 'pose-link' }] },
    4: { label: '🦵 다리', controls: [{ type: 'pose-link' }] },
    5: { label: '🦵 다리', controls: [{ type: 'pose-link' }] },
    6: {  // 머리카락
        label: '💇 머리카락',
        controls: [
            { type: 'slider', label: '길이', channel: 'hair.length', min: 0.05, max: 1.40, step: 0.05 },
            {
                type: 'color-pick', channel: 'hair.color',
                presets: [
                    { label: '시안',   value: '#00eaff' }, { label: '금발',   value: '#f5d060' },
                    { label: '흑발',   value: '#1a1a2e' }, { label: '갈색',   value: '#7a4a1e' },
                    { label: '핑크',   value: '#ff80b0' }, { label: '은발',   value: '#c0c8d8' },
                    { label: '빨강',   value: '#cc2200' }, { label: '하양',   value: '#e8eaf0' },
                    { label: '보라',   value: '#9933ff' }, { label: '초록',   value: '#22cc44' },
                ],
            },
            {
                type: 'enum', label: '스타일', channel: 'hair.style',
                options: [
                    { value: 'straight', label: '생머리' },
                    { value: 'ponytail', label: '포니테일' },
                    { value: 'twintails', label: '트윈테일' },
                    { value: 'braid',    label: '브레이드' },
                ],
            },
        ],
    },
    7: {  // 의상
        label: '👗 의상',
        controls: [{
            type: 'outfit-pick',
            presets: [
                { key: 'none',           label: '없음' },
                { key: 'school_uniform', label: '교복',   color: '#1133aa' },
                { key: 'dress',          label: '드레스', color: '#cc3366' },
                { key: 'casual',         label: '캐주얼', color: '#226688' },
                { key: 'sportswear',     label: '스포츠', color: '#228844' },
                { key: 'gothic',         label: '고딕',   color: '#220033' },
                { key: 'kimono',         label: '기모노', color: '#aa2244' },
                { key: 'white_dress',    label: '흰 드레스', color: '#ccddee' },
                { key: 'maid',           label: '메이드', color: '#334488' },
            ],
        }],
    },
};

let _panel = null;

export function initPartClickHandler(scene) {
    window.__previzOnPartClick = (partId, partName, state, sceneRef) => {
        showPartPanel(partId, state, sceneRef);
    };
    window.__previzUpdateUnmapped = (unmapped) => {
        updateUnmappedBadge(unmapped);
    };
}

// ── HUD 초기화 (씬 열릴 때 호출) ─────────────────────────────────
export function initHUD(sceneRef) {
    // HUD가 이미 있으면 재사용
    if (document.getElementById('previz-hud')) return;

    const wrap = document.getElementById('previz-canvas-wrap');
    if (!wrap) return;
    wrap.style.position = 'relative';

    const hud = document.createElement('div');
    hud.id = 'previz-hud';
    hud.style.cssText = [
        'position:absolute', 'bottom:10px', 'left:50%',
        'transform:translateX(-50%)',
        'display:flex', 'gap:8px', 'z-index:50',
        'flex-wrap:wrap', 'justify-content:center',
    ].join(';');

    // 포즈 버튼 그룹
    const poseGroup = hudGroup('🕺 포즈');
    POSE_LIST.forEach(p => {
        const btn = hudBtn(p.label, () => {
            sceneRef.state.pose = p.key;
            sceneRef._buildAllParts(sceneRef.state);
            poseGroup.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
        if (p.key === (sceneRef.state.pose || 'stand')) btn.classList.add('active');
        poseGroup.appendChild(btn);
    });

    // 환경 버튼 그룹
    const envGroup = hudGroup('🌍 배경');
    ENV_LIST.forEach(e => {
        const btn = hudBtn(e.label, () => {
            sceneRef.state.env.preset = e.key;
            sceneRef._applyEnv(sceneRef.state.env);
            envGroup.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
        if (e.key === (sceneRef.state.env?.preset || 'park')) btn.classList.add('active');
        envGroup.appendChild(btn);
    });

    // 날씨 버튼 그룹
    const weatherGroup = hudGroup('🌦 날씨');
    WEATHER_LIST.forEach(w => {
        const btn = hudBtn(w.label, () => {
            sceneRef.state.env.weather = w.key;
            sceneRef._weather?.setWeather(w.key);
            weatherGroup.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
        if (w.key === (sceneRef.state.env?.weather || 'clear')) btn.classList.add('active');
        weatherGroup.appendChild(btn);
    });

    // 시간대 슬라이더
    const timeGroup = hudGroup('⏰ 시간대');
    const timeSlider = document.createElement('input');
    timeSlider.type = 'range'; timeSlider.min = 0; timeSlider.max = 1; timeSlider.step = 0.01;
    timeSlider.value = sceneRef.state.env?.timeOfDay ?? 0.5;
    timeSlider.style.cssText = 'width:90px;accent-color:#00eaff;cursor:pointer;';
    timeSlider.oninput = () => {
        sceneRef.state.env.timeOfDay = parseFloat(timeSlider.value);
        sceneRef._applyTimeOfDay(sceneRef.state.env.timeOfDay);
    };
    timeGroup.appendChild(timeSlider);

    // 의상 버튼 (바로가기)
    const outfitBtn = actionBtn('👗 의상', () => {
        showPartPanel(7, sceneRef.state, sceneRef);
    });

    hud.appendChild(poseGroup);
    hud.appendChild(envGroup);
    hud.appendChild(weatherGroup);
    hud.appendChild(timeGroup);
    hud.appendChild(outfitBtn);
    wrap.appendChild(hud);
}

function hudGroup(title) {
    const wrap = document.createElement('div');
    wrap.style.cssText = [
        'display:flex', 'align-items:center', 'gap:4px',
        'background:rgba(2,10,22,0.82)',
        'border:1px solid rgba(0,234,255,0.18)',
        'border-radius:8px', 'padding:4px 8px',
        'font-family:monospace',
    ].join(';');
    const label = document.createElement('span');
    label.style.cssText = 'font-size:9px;color:rgba(0,234,255,0.4);margin-right:3px;white-space:nowrap;';
    label.textContent = title;
    wrap.appendChild(label);
    return wrap;
}

function hudBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = [
        'background:transparent', 'border:1px solid rgba(0,234,255,0.2)',
        'color:rgba(0,234,255,0.65)', 'border-radius:5px',
        'padding:3px 7px', 'font-size:10px', 'cursor:pointer',
        'font-family:monospace', 'white-space:nowrap',
        'transition:background 0.15s,color 0.15s',
    ].join(';');
    btn.onmouseover = () => { btn.style.background = 'rgba(0,234,255,0.12)'; btn.style.color = '#00eaff'; };
    btn.onmouseout  = () => {
        if (!btn.classList.contains('active')) {
            btn.style.background = 'transparent';
            btn.style.color = 'rgba(0,234,255,0.65)';
        }
    };
    btn.classList.toggle = new Proxy(btn.classList.toggle.bind(btn.classList), {
        apply(target, thisArg, args) {
            const result = target(...args);
            if (btn.classList.contains('active')) {
                btn.style.background = 'rgba(0,234,255,0.22)';
                btn.style.color = '#00eaff';
                btn.style.borderColor = 'rgba(0,234,255,0.5)';
            } else {
                btn.style.background = 'transparent';
                btn.style.color = 'rgba(0,234,255,0.65)';
                btn.style.borderColor = 'rgba(0,234,255,0.2)';
            }
            return result;
        }
    });
    btn.onclick = onClick;
    return btn;
}

function actionBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = [
        'background:rgba(0,234,255,0.08)', 'border:1px solid rgba(0,234,255,0.25)',
        'color:#00eaff', 'border-radius:8px', 'padding:5px 12px',
        'font-size:10px', 'cursor:pointer', 'font-family:monospace',
    ].join(';');
    btn.onclick = onClick;
    return btn;
}

// ── 바디파트 클릭 패널 ────────────────────────────────────────────
function showPartPanel(partId, state, sceneRef) {
    removePanel();
    const def = PART_CONTROLS[partId];
    if (!def) return;

    _panel = document.createElement('div');
    _panel.id = 'previz-part-panel';
    _panel.style.cssText = [
        'position:absolute', 'top:60px', 'right:16px', 'width:230px',
        'background:rgba(2,12,26,0.94)',
        'border:1px solid rgba(0,234,255,0.28)',
        'border-radius:12px', 'padding:14px 16px',
        'font-family:monospace', 'color:#00eaff', 'z-index:200',
        'backdrop-filter:blur(8px)',
        'box-shadow:0 0 24px rgba(0,234,255,0.08)',
    ].join(';');

    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
    hdr.innerHTML = `<span style="font-size:13px;letter-spacing:1px;">${def.label}</span>
        <button onclick="document.getElementById('previz-part-panel')?.remove()" style="
            background:transparent;border:none;color:rgba(0,234,255,0.5);font-size:16px;cursor:pointer;">✕</button>`;
    _panel.appendChild(hdr);

    def.controls.forEach(ctrl => {
        if (ctrl.type === 'pose-link') {
            const note = document.createElement('div');
            note.style.cssText = 'font-size:10px;color:rgba(0,234,255,0.45);';
            note.textContent = '하단 HUD → 포즈 버튼으로 변경하세요';
            _panel.appendChild(note);
            return;
        }

        const wrap = document.createElement('div');
        wrap.style.marginBottom = '12px';

        if (ctrl.label) {
            const lbl = document.createElement('div');
            lbl.style.cssText = 'font-size:10px;color:rgba(0,234,255,0.50);margin-bottom:6px;letter-spacing:1px;';
            lbl.textContent = ctrl.label.toUpperCase();
            wrap.appendChild(lbl);
        }

        if (ctrl.type === 'slider') {
            const [domain, prop] = ctrl.channel.split('.');
            const cur = state[domain]?.[prop] ?? ((ctrl.min+ctrl.max)/2);
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;';
            const inp = document.createElement('input');
            inp.type='range'; inp.min=ctrl.min; inp.max=ctrl.max; inp.step=ctrl.step; inp.value=cur;
            inp.style.cssText = 'flex:1;accent-color:#00eaff;cursor:pointer;';
            const disp = document.createElement('span');
            disp.style.cssText = 'font-size:11px;min-width:32px;text-align:right;color:rgba(0,234,255,0.7);';
            disp.textContent = parseFloat(cur).toFixed(2);
            inp.oninput = () => {
                disp.textContent = parseFloat(inp.value).toFixed(2);
                const ns = JSON.parse(JSON.stringify(sceneRef.state));
                if (!ns[domain]) ns[domain] = {};
                ns[domain][prop] = parseFloat(inp.value);
                sceneRef.state = ns;
                sceneRef._buildAllParts(ns);
            };
            row.appendChild(inp); row.appendChild(disp);
            wrap.appendChild(row);
        }

        if (ctrl.type === 'color-pick') {
            const grid = document.createElement('div');
            grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:7px;';
            ctrl.presets.forEach(preset => {
                const btn = document.createElement('button');
                btn.title = preset.label;
                btn.style.cssText = [
                    `background:${preset.value}`,
                    'width:28px','height:28px','border-radius:50%',
                    'border:2px solid rgba(0,234,255,0.18)',
                    'cursor:pointer','transition:transform 0.15s,border-color 0.15s',
                ].join(';');
                btn.onmouseover = () => { btn.style.transform='scale(1.2)'; btn.style.borderColor='#00eaff'; };
                btn.onmouseout  = () => { btn.style.transform=''; btn.style.borderColor='rgba(0,234,255,0.18)'; };
                btn.onclick = () => {
                    const [domain, prop] = ctrl.channel.split('.');
                    const ns = JSON.parse(JSON.stringify(sceneRef.state));
                    if (!ns[domain]) ns[domain] = {};
                    ns[domain][prop] = preset.value;
                    sceneRef.state = ns;
                    if (domain === 'eye') sceneRef._buildEyes(ns);
                    else sceneRef._buildAllParts(ns);
                };
                grid.appendChild(btn);
            });
            wrap.appendChild(grid);
        }

        if (ctrl.type === 'enum') {
            const [domain, prop] = ctrl.channel.split('.');
            const curVal = state[domain]?.[prop] || ctrl.options[0].value;
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
            ctrl.options.forEach(opt => {
                const btn = document.createElement('button');
                btn.textContent = opt.label;
                btn.style.cssText = [
                    'background:' + (curVal===opt.value ? 'rgba(0,234,255,0.18)' : 'transparent'),
                    'border:1px solid rgba(0,234,255,' + (curVal===opt.value ? '0.5' : '0.18') + ')',
                    'color:#00eaff', 'border-radius:5px', 'padding:3px 8px',
                    'font-size:10px', 'cursor:pointer', 'font-family:monospace',
                ].join(';');
                btn.onclick = () => {
                    const ns = JSON.parse(JSON.stringify(sceneRef.state));
                    if (!ns[domain]) ns[domain] = {};
                    ns[domain][prop] = opt.value;
                    sceneRef.state = ns;
                    sceneRef._buildAllParts(ns);
                    row.querySelectorAll('button').forEach(b => {
                        b.style.background = 'transparent';
                        b.style.borderColor = 'rgba(0,234,255,0.18)';
                    });
                    btn.style.background = 'rgba(0,234,255,0.18)';
                    btn.style.borderColor = 'rgba(0,234,255,0.5)';
                };
                row.appendChild(btn);
            });
            wrap.appendChild(row);
        }

        if (ctrl.type === 'outfit-pick') {
            const curKey = state.outfit?.preset || 'none';
            const grid = document.createElement('div');
            grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
            ctrl.presets.forEach(p => {
                const btn = document.createElement('button');
                btn.textContent = p.label;
                const isActive = curKey === p.key;
                btn.style.cssText = [
                    'background:' + (isActive ? 'rgba(0,234,255,0.18)' : 'transparent'),
                    'border:1px solid rgba(0,234,255,' + (isActive ? '0.5' : '0.18') + ')',
                    'color:#00eaff', 'border-radius:5px', 'padding:3px 9px',
                    'font-size:10px', 'cursor:pointer', 'font-family:monospace',
                ].join(';');
                if (p.color) {
                    btn.style.borderLeft = `3px solid ${p.color}`;
                }
                btn.onclick = () => {
                    const ns = JSON.parse(JSON.stringify(sceneRef.state));
                    ns.outfit = { preset: p.key };
                    sceneRef.state = ns;
                    sceneRef._buildAllParts(ns);
                    grid.querySelectorAll('button').forEach(b => {
                        b.style.background = 'transparent';
                        b.style.borderTopColor = b.style.borderRightColor = b.style.borderBottomColor = 'rgba(0,234,255,0.18)';
                    });
                    btn.style.background = 'rgba(0,234,255,0.18)';
                };
                grid.appendChild(btn);
            });
            wrap.appendChild(grid);
        }

        _panel.appendChild(wrap);
    });

    const wrap = document.getElementById('previz-canvas-wrap');
    if (wrap) wrap.appendChild(_panel);
}

function removePanel() {
    _panel?.remove(); _panel = null;
    document.getElementById('previz-part-panel')?.remove();
}

// ── 미매핑 배지 ───────────────────────────────────────────────────
function updateUnmappedBadge(unmapped) {
    let badge = document.getElementById('previz-unmapped-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'previz-unmapped-badge';
        badge.style.cssText = [
            'position:absolute', 'top:60px', 'left:16px',
            'background:rgba(2,10,22,0.85)',
            'border:1px solid rgba(0,234,255,0.15)',
            'border-radius:8px', 'padding:7px 11px',
            'font-family:monospace', 'font-size:10px',
            'color:rgba(0,234,255,0.45)', 'max-width:180px', 'line-height:1.6',
        ].join(';');
        document.getElementById('previz-canvas-wrap')?.appendChild(badge);
    }
    if (!unmapped || unmapped.length === 0) { badge.style.display='none'; return; }
    badge.style.display = 'block';
    badge.innerHTML = `<div style="color:rgba(0,234,255,0.6);margin-bottom:3px;font-size:10px;">⚠ 3D 미반영 (${unmapped.length}개)</div>`
        + unmapped.slice(0,8).map(t=>`<span style="opacity:0.5;font-size:9px;">${t}</span>`).join('<br>');
}
