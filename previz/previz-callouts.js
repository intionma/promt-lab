/**
 * previz-callouts.js — 인체 Callout 오버레이 (SVG 선 + HTML 박스)
 * 마우스 근접 시 밝아짐, 클릭 시 패널 열림
 */

import { showCalloutPanel } from './previz-ui.js';

// ── Callout 정의 ─────────────────────────────────────────────────
// worldPos: Three.js 씬 좌표 (인체 위 anchor)
// boxDir: 박스가 놓이는 방향 [-1=왼쪽, 1=오른쪽]
// tagFilter: 이 callout에 표시할 태그 필터 함수
export const CALLOUT_DEFS = [
    {
        id: 'hair',
        label: '머리카락',
        icon: '💇',
        worldPos: [0, 2.58, 0],         // 머리 위
        boxDir: 1,
        boxVOffset: -0.12,              // 수직 오프셋 (화면 비율)
        tagGroups: ['헤어 컬러|1개', '헤어 스타일|1~2개'],
        dbLayers: [3],
        tokenFilter: t => /hair|braid|twin|ponytail/i.test(t),
        paramPartId: 6,                 // PART.HAIR
    },
    {
        id: 'face',
        label: '눈·얼굴',
        icon: '👁',
        worldPos: [0.28, 2.23, 0.18],
        boxDir: 1,
        boxVOffset: -0.06,
        tagGroups: ['눈동자 (Eyes)|1개', '표정 (Expression)|1~2개', '얼굴 디테일|자유'],
        dbLayers: [3],
        tokenFilter: t => /eye|face|smile|crying|expression|look/i.test(t),
        paramPartId: 0,
    },
    {
        id: 'upper',
        label: '상체',
        icon: '👕',
        worldPos: [-0.30, 1.62, 0.12],
        boxDir: -1,
        boxVOffset: 0,
        tagGroups: ['의상 (Clothes)|1~2개', '가슴 사이즈|1개', '체형|자유'],
        dbLayers: [3, 4],
        tokenFilter: t => /breast|chest|shirt|uniform|dress|top|hoodie|suit|body|height|petite|tall/i.test(t),
        paramPartId: 1,
    },
    {
        id: 'pose',
        label: '포즈',
        icon: '🤸',
        worldPos: [0.35, 1.45, 0.08],
        boxDir: 1,
        boxVOffset: 0.04,
        tagGroups: ['구도 및 자세 (Pose)|자유', '손 & 팔 제스처|자유'],
        dbLayers: [5],
        tokenFilter: t => /hand|arm|pose|stand|sit|cross|peace|hip/i.test(t),
        paramPartId: 2,
    },
    {
        id: 'lower',
        label: '하체·의상',
        icon: '👗',
        worldPos: [0.25, 0.90, 0.10],
        boxDir: 1,
        boxVOffset: 0.08,
        tagGroups: ['하의 및 핏|자유', '레그웨어 & 양말|1~2개', '신발 (Footwear)|1개', '악세서리|자유'],
        dbLayers: [4],
        tokenFilter: t => /skirt|pants|leg|stocking|sock|shoes|boot|sneak|heel|access|glass|earring|ring|neck/i.test(t),
        paramPartId: 4,
    },
    {
        id: 'env',
        label: '배경',
        icon: '🌍',
        worldPos: [-0.55, 0.50, -0.4],
        boxDir: -1,
        boxVOffset: 0.10,
        tagGroups: ['스튜디오 & 배경|1개', '날씨 & 분위기|자유', '장소 & 공간|1개'],
        dbLayers: [6, 7],
        tokenFilter: t => /background|outdoor|indoor|park|street|sky|rain|snow|light|window|sofa|bed/i.test(t),
        paramPartId: null,
    },
];

// ── Callout 매니저 ────────────────────────────────────────────────
export class CalloutManager {
    constructor(container, camera, THREE) {
        this.container = container;
        this.camera    = camera;
        this.THREE     = THREE;

        this._svg      = null;
        this._boxes    = {};   // id → { el, lineEl }
        this._hovered  = null;
        this._vec3     = new THREE.Vector3();

        this._build();
    }

    _build() {
        // SVG 오버레이 (선 그리기용)
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
        this.container.appendChild(svg);
        this._svg = svg;

        CALLOUT_DEFS.forEach(def => {
            // SVG 선
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('stroke', 'rgba(0,234,255,0.18)');
            line.setAttribute('stroke-width', '1');
            line.style.transition = 'stroke 0.25s';
            svg.appendChild(line);

            // HTML 박스
            const box = document.createElement('div');
            box.className = 'previz-callout';
            box.dataset.id = def.id;
            box.style.cssText = [
                'position:absolute',
                'display:flex', 'align-items:center', 'gap:6px',
                'padding:5px 10px',
                'background:rgba(2,10,22,0.55)',
                'border:1px solid rgba(0,234,255,0.18)',
                'border-radius:8px',
                'cursor:pointer',
                'pointer-events:auto',
                'white-space:nowrap',
                'font-family:monospace', 'font-size:11px',
                'color:rgba(0,234,255,0.20)',
                'transition:color 0.25s,border-color 0.25s,background 0.25s,opacity 0.25s',
                'user-select:none',
                'opacity:0.25',
            ].join(';');
            box.innerHTML = `<span style="font-size:13px;">${def.icon}</span><span>${def.label}</span>`;

            box.addEventListener('mouseenter', () => this._onHover(def.id, true, box, line));
            box.addEventListener('mouseleave', () => this._onHover(def.id, false, box, line));
            box.addEventListener('click', (e) => {
                e.stopPropagation();
                showCalloutPanel(def, box);
            });

            this.container.appendChild(box);
            this._boxes[def.id] = { el: box, lineEl: line };
        });
    }

    _onHover(id, enter, box, line) {
        if (enter) {
            box.style.color            = '#00eaff';
            box.style.borderColor      = 'rgba(0,234,255,0.7)';
            box.style.background       = 'rgba(0,30,55,0.85)';
            box.style.opacity          = '1';
            box.style.boxShadow        = '0 0 14px rgba(0,234,255,0.18)';
            line.setAttribute('stroke', 'rgba(0,234,255,0.65)');
        } else {
            box.style.color            = 'rgba(0,234,255,0.20)';
            box.style.borderColor      = 'rgba(0,234,255,0.18)';
            box.style.background       = 'rgba(2,10,22,0.55)';
            box.style.opacity          = '0.25';
            box.style.boxShadow        = '';
            line.setAttribute('stroke', 'rgba(0,234,255,0.18)');
        }
    }

    // 매 프레임: 3D worldPos → 화면 좌표 투영 후 박스/선 위치 갱신
    update() {
        const W = this.container.clientWidth;
        const H = this.container.clientHeight;
        if (!W || !H) return;

        CALLOUT_DEFS.forEach(def => {
            const { el: box, lineEl: line } = this._boxes[def.id];

            // worldPos → 화면 좌표
            this._vec3.set(...def.worldPos);
            this._vec3.project(this.camera);

            const sx = (this._vec3.x *  0.5 + 0.5) * W;
            const sy = (this._vec3.y * -0.5 + 0.5) * H;

            // 뒤에 있으면 숨김
            if (this._vec3.z > 1) { box.style.display = 'none'; return; }
            box.style.display = '';

            // 박스 위치 (anchor 기준 옆으로)
            const boxW   = 110;
            const boxH   = 30;
            const gap    = 18;
            const bx = def.boxDir > 0 ? sx + gap : sx - gap - boxW;
            const by = sy + def.boxVOffset * H - boxH / 2;

            box.style.left = `${Math.max(4, Math.min(W - boxW - 4, bx))}px`;
            box.style.top  = `${Math.max(4, Math.min(H - boxH - 4, by))}px`;

            // 선: anchor → 박스 중앙
            const lx2 = def.boxDir > 0
                ? Math.max(4, Math.min(W - boxW - 4, bx))
                : Math.max(4, Math.min(W - boxW - 4, bx)) + boxW;
            const ly2 = Math.max(4, Math.min(H - boxH - 4, by)) + boxH / 2;

            line.setAttribute('x1', sx); line.setAttribute('y1', sy);
            line.setAttribute('x2', lx2); line.setAttribute('y2', ly2);
        });
    }

    dispose() {
        this._svg?.remove();
        Object.values(this._boxes).forEach(({ el }) => el.remove());
    }
}
