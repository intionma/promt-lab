/**
 * previz-ui.js — 바디파트 클릭 컨트롤 패널 + 미매핑 라벨
 */

const PART_CONTROLS = {
    0: {  // 머리 (HEAD = 눈)
        label: '👁 눈',
        controls: [
            { type: 'color-pick', label: '눈 색상', channel: 'eye.color',
              presets: [
                { label: '파란눈',   value: '#2288ff' },
                { label: '빨간눈',   value: '#ff2222' },
                { label: '초록눈',   value: '#22cc44' },
                { label: '보라눈',   value: '#9933ff' },
                { label: '갈색눈',   value: '#885522' },
                { label: '시안',     value: '#00eaff' },
              ]},
        ],
    },
    1: {  // 몸통
        label: '👤 몸통',
        controls: [
            { type: 'slider', label: '키', channel: 'body.height', min: 0.8, max: 1.2, step: 0.01 },
            { type: 'slider', label: '가슴', channel: 'body.chest', min: 0.5, max: 1.8, step: 0.05 },
        ],
    },
    2: { label: '💪 왼팔', controls: [] },
    3: { label: '💪 오른팔', controls: [] },
    4: {  // 왼다리
        label: '🦵 다리',
        controls: [
            { type: 'slider', label: '키 (다리 길이)', channel: 'body.height', min: 0.8, max: 1.2, step: 0.01 },
        ],
    },
    5: { label: '🦵 오른다리', controls: [] },
    6: {  // 머리카락
        label: '💇 머리카락',
        controls: [
            { type: 'slider', label: '길이', channel: 'hair.length', min: 0.05, max: 1.4, step: 0.05 },
            { type: 'color-pick', label: '색상', channel: 'hair.color',
              presets: [
                { label: '시안',   value: '#00eaff' },
                { label: '금발',   value: '#f5d060' },
                { label: '흑발',   value: '#1a1a2e' },
                { label: '갈색',   value: '#7a4a1e' },
                { label: '핑크',   value: '#ff80b0' },
                { label: '은발',   value: '#c0c8d8' },
                { label: '빨강',   value: '#cc2200' },
                { label: '하양',   value: '#e8eaf0' },
              ]},
        ],
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

// ── 파트 컨트롤 패널 ──────────────────────────────────────────────
function showPartPanel(partId, state, sceneRef) {
    removePanel();

    const def = PART_CONTROLS[partId];
    if (!def || def.controls.length === 0) return;

    _panel = document.createElement('div');
    _panel.id = 'previz-part-panel';
    _panel.style.cssText = [
        'position:absolute', 'top:60px', 'right:16px',
        'width:220px',
        'background:rgba(2,15,28,0.92)',
        'border:1px solid rgba(0,234,255,0.25)',
        'border-radius:10px',
        'padding:14px 16px',
        'font-family:monospace',
        'color:#00eaff',
        'z-index:100',
        'backdrop-filter:blur(6px)',
        'box-shadow:0 0 20px rgba(0,234,255,0.08)',
    ].join(';');

    // 헤더
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
    header.innerHTML = `
        <span style="font-size:13px;letter-spacing:1px;">${def.label}</span>
        <button onclick="document.getElementById('previz-part-panel')?.remove()" style="
            background:transparent;border:none;color:rgba(0,234,255,0.5);
            font-size:16px;cursor:pointer;line-height:1;padding:0 2px;
        ">✕</button>
    `;
    _panel.appendChild(header);

    // 컨트롤
    def.controls.forEach(ctrl => {
        const wrap = document.createElement('div');
        wrap.style.marginBottom = '12px';

        const lbl = document.createElement('div');
        lbl.style.cssText = 'font-size:10px;color:rgba(0,234,255,0.55);margin-bottom:6px;letter-spacing:1px;';
        lbl.textContent = ctrl.label.toUpperCase();
        wrap.appendChild(lbl);

        if (ctrl.type === 'slider') {
            const [domain, prop] = ctrl.channel.split('.');
            const curVal = (state[domain]?.[prop]) ?? ((ctrl.min + ctrl.max) / 2);

            const sliderRow = document.createElement('div');
            sliderRow.style.cssText = 'display:flex;align-items:center;gap:8px;';

            const input = document.createElement('input');
            input.type = 'range';
            input.min = ctrl.min; input.max = ctrl.max; input.step = ctrl.step;
            input.value = curVal;
            input.style.cssText = 'flex:1;accent-color:#00eaff;cursor:pointer;height:3px;';

            const valDisplay = document.createElement('span');
            valDisplay.style.cssText = 'font-size:11px;min-width:30px;text-align:right;color:rgba(0,234,255,0.7);';
            valDisplay.textContent = parseFloat(curVal).toFixed(2);

            input.oninput = () => {
                valDisplay.textContent = parseFloat(input.value).toFixed(2);
                const ns = JSON.parse(JSON.stringify(sceneRef.state));
                if (!ns[domain]) ns[domain] = {};
                ns[domain][prop] = parseFloat(input.value);
                sceneRef.state = ns;
                sceneRef._buildAllParts(ns);
            };

            sliderRow.appendChild(input);
            sliderRow.appendChild(valDisplay);
            wrap.appendChild(sliderRow);
        }

        if (ctrl.type === 'color-pick') {
            const grid = document.createElement('div');
            grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';

            ctrl.presets.forEach(preset => {
                const btn = document.createElement('button');
                btn.title = preset.label;
                btn.style.cssText = [
                    `background:${preset.value}`,
                    'width:26px', 'height:26px', 'border-radius:50%',
                    'border:2px solid rgba(0,234,255,0.2)',
                    'cursor:pointer', 'transition:transform 0.15s,border-color 0.15s',
                ].join(';');
                btn.onmouseover = () => { btn.style.transform = 'scale(1.2)'; btn.style.borderColor = '#00eaff'; };
                btn.onmouseout  = () => { btn.style.transform = ''; btn.style.borderColor = 'rgba(0,234,255,0.2)'; };
                btn.onclick = () => {
                    const [domain, prop] = ctrl.channel.split('.');
                    const ns = JSON.parse(JSON.stringify(sceneRef.state));
                    if (!ns[domain]) ns[domain] = {};
                    ns[domain][prop] = preset.value;
                    sceneRef.state = ns;
                    sceneRef._buildAllParts(ns);
                    if (partId === 6 || partId === 0) sceneRef._buildEyes?.(ns);
                };
                grid.appendChild(btn);
            });
            wrap.appendChild(grid);
        }

        _panel.appendChild(wrap);
    });

    // 패널을 previz-container 안에 배치
    const container = document.getElementById('previz-canvas-wrap');
    if (container) {
        container.style.position = 'relative';
        container.appendChild(_panel);
    }
}

function removePanel() {
    if (_panel) { _panel.remove(); _panel = null; }
    const existing = document.getElementById('previz-part-panel');
    if (existing) existing.remove();
}

// ── 미매핑 태그 배지 ──────────────────────────────────────────────
function updateUnmappedBadge(unmapped) {
    let badge = document.getElementById('previz-unmapped-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'previz-unmapped-badge';
        badge.style.cssText = [
            'position:absolute', 'bottom:70px', 'left:16px',
            'background:rgba(2,15,28,0.85)',
            'border:1px solid rgba(0,234,255,0.15)',
            'border-radius:6px', 'padding:6px 10px',
            'font-family:monospace', 'font-size:10px',
            'color:rgba(0,234,255,0.45)', 'max-width:200px',
            'line-height:1.5',
        ].join(';');
        const wrap = document.getElementById('previz-canvas-wrap');
        if (wrap) wrap.appendChild(badge);
    }

    if (unmapped.length === 0) {
        badge.style.display = 'none';
        return;
    }
    badge.style.display = 'block';
    badge.innerHTML = `<div style="color:rgba(0,234,255,0.6);margin-bottom:3px;">⚠ 시각화 안 됨 (${unmapped.length})</div>`
        + unmapped.slice(0, 6).map(t => `<span style="opacity:0.5;">${t}</span>`).join('<br>');
}
