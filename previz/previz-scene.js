/**
 * previz-scene.js — Three.js 씬 + 애니 인체 포인트클라우드
 * P1~P4 완성: 인체/머리/눈/의상/포즈/환경/날씨/카메라/글로우/localStorage
 */

import { ENV_PRESETS, ENV_TAG_MAP, WeatherSystem } from './previz-env.js';

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const LS_KEY    = 'previz_state_v1';

// ── 신체 단면 제어점 ──────────────────────────────────────────────
const TORSO_CP = [
    [ 1.535, 0.005, 0.005 ],
    [ 1.470, 0.110, 0.100 ],
    [ 1.385, 0.205, 0.185 ],
    [ 1.290, 0.215, 0.190 ],
    [ 1.200, 0.195, 0.175 ],
    [ 1.115, 0.155, 0.150 ],
    [ 1.025, 0.058, 0.052 ],
    [ 0.940, 0.055, 0.050 ],
    [ 0.870, 0.210, 0.105 ],
    [ 0.800, 0.195, 0.108 ],
    [ 0.720, 0.172, 0.115 ],
    [ 0.640, 0.168, 0.125 ],
    [ 0.540, 0.128, 0.090 ],
    [ 0.440, 0.122, 0.085 ],
    [ 0.340, 0.165, 0.100 ],
    [ 0.230, 0.185, 0.108 ],
    [ 0.120, 0.180, 0.105 ],
    [ 0.040, 0.165, 0.098 ],
];
const LEG_CP = [
    [ 0.020, 0.088, 0.082 ],
    [-0.110, 0.085, 0.078 ],
    [-0.240, 0.078, 0.072 ],
    [-0.360, 0.060, 0.057 ],
    [-0.460, 0.052, 0.050 ],
    [-0.580, 0.048, 0.044 ],
    [-0.700, 0.040, 0.037 ],
    [-0.810, 0.033, 0.031 ],
    [-0.880, 0.032, 0.060 ],
    [-0.940, 0.030, 0.055 ],
];
const ARM_CP = [
    [ 0.860, 0.052, 0.048 ],
    [ 0.760, 0.050, 0.045 ],
    [ 0.650, 0.046, 0.041 ],
    [ 0.540, 0.040, 0.036 ],
    [ 0.430, 0.035, 0.031 ],
    [ 0.340, 0.032, 0.029 ],
    [ 0.240, 0.038, 0.022 ],
];
const EYE_POS = [
    { x: -0.085, y: 1.287, z: 0.180 },
    { x:  0.085, y: 1.287, z: 0.180 },
];

// ── 포즈 프리셋 (팔/다리 오프셋 변환) ────────────────────────────
const POSE_PRESETS = {
    stand: {
        label: '서기',
        armAngle: 0,         // 팔 벌림 각도(라디안)
        armYOffset: 0,
        legSpread: 0,
        legYCompress: 1.0,   // 다리 길이 비율
        tilt: 0,             // 몸통 기울기
    },
    arms_up: {
        label: '팔 들기',
        armAngle: -Math.PI / 2.2,
        armYOffset: 0.32,
        legSpread: 0,
        legYCompress: 1.0,
        tilt: 0,
    },
    hands_on_hips: {
        label: '손 허리',
        armAngle: Math.PI / 5,
        armYOffset: -0.12,
        legSpread: 0.04,
        legYCompress: 1.0,
        tilt: 0,
    },
    crossed_arms: {
        label: '팔짱',
        armAngle: Math.PI / 6,
        armYOffset: 0.10,
        legSpread: 0,
        legYCompress: 1.0,
        tilt: 0,
    },
    peace_sign: {
        label: '브이',
        armAngle: -Math.PI / 3,
        armYOffset: 0.20,
        legSpread: 0.02,
        legYCompress: 1.0,
        tilt: 0,
    },
    sit: {
        label: '앉기',
        armAngle: 0,
        armYOffset: -0.30,
        legSpread: 0.08,
        legYCompress: 0.55,
        tilt: 0,
    },
    lean: {
        label: '기대기',
        armAngle: Math.PI / 8,
        armYOffset: 0,
        legSpread: 0.05,
        legYCompress: 1.0,
        tilt: 0.08,
    },
};

// ── 의상 색상 프리셋 ──────────────────────────────────────────────
const OUTFIT_PRESETS = {
    none:            { label: '없음',          color: null },
    school_uniform:  { label: '교복',          color: '#1133aa' },
    dress:           { label: '드레스',        color: '#cc3366' },
    casual:          { label: '캐주얼',        color: '#226688' },
    sportswear:      { label: '스포츠웨어',    color: '#228844' },
    gothic:          { label: '고딕',          color: '#220033' },
    kimono:          { label: '기모노',        color: '#aa2244' },
    white_dress:     { label: '흰 드레스',     color: '#ccddee' },
    maid:            { label: '메이드',        color: '#334488' },
};

// ── 태그 → sceneState 매핑 ────────────────────────────────────────
const TAG_MAP = {
    long_hair:       { ch: 'hair.length',  v: 1.0 },
    medium_hair:     { ch: 'hair.length',  v: 0.55 },
    short_hair:      { ch: 'hair.length',  v: 0.18 },
    very_long_hair:  { ch: 'hair.length',  v: 1.35 },
    blonde_hair:     { ch: 'hair.color',   v: '#f5d060' },
    black_hair:      { ch: 'hair.color',   v: '#1a1a2e' },
    brown_hair:      { ch: 'hair.color',   v: '#7a4a1e' },
    white_hair:      { ch: 'hair.color',   v: '#e8eaf0' },
    pink_hair:       { ch: 'hair.color',   v: '#ff80b0' },
    silver_hair:     { ch: 'hair.color',   v: '#c0c8d8' },
    red_hair:        { ch: 'hair.color',   v: '#cc2200' },
    blue_eyes:       { ch: 'eye.color',    v: '#2288ff' },
    red_eyes:        { ch: 'eye.color',    v: '#ff2222' },
    green_eyes:      { ch: 'eye.color',    v: '#22cc44' },
    purple_eyes:     { ch: 'eye.color',    v: '#9933ff' },
    brown_eyes:      { ch: 'eye.color',    v: '#885522' },
    petite:          { ch: 'body.height',  v: 0.88 },
    small:           { ch: 'body.height',  v: 0.88 },
    tall:            { ch: 'body.height',  v: 1.10 },
    large_breasts:   { ch: 'body.chest',   v: 1.38 },
    small_breasts:   { ch: 'body.chest',   v: 0.72 },
    ponytail:        { ch: 'hair.style',   v: 'ponytail' },
    twintails:       { ch: 'hair.style',   v: 'twintails' },
    braid:           { ch: 'hair.style',   v: 'braid' },
    // 포즈
    hands_on_hips:   { ch: 'pose',         v: 'hands_on_hips' },
    peace_sign:      { ch: 'pose',         v: 'peace_sign' },
    crossed_arms:    { ch: 'pose',         v: 'crossed_arms' },
    // 카메라
    close_up:        { ch: 'camera.zoom',  v: 0.55 },
    from_behind:     { ch: 'camera.angle', v: 'back' },
    from_above:      { ch: 'camera.angle', v: 'high' },
    from_below:      { ch: 'camera.angle', v: 'low' },
    looking_at_viewer: { ch: 'camera.angle', v: 'front' },
    // 의상
    school_uniform:  { ch: 'outfit.preset', v: 'school_uniform' },
    dress:           { ch: 'outfit.preset', v: 'dress' },
    kimono:          { ch: 'outfit.preset', v: 'kimono' },
    maid:            { ch: 'outfit.preset', v: 'maid' },
};

// ── 바디파트 ID ───────────────────────────────────────────────────
export const PART = { HEAD: 0, TORSO: 1, L_ARM: 2, R_ARM: 3, L_LEG: 4, R_LEG: 5, HAIR: 6, OUTFIT: 7 };
export const PART_NAME = ['머리', '몸통', '왼팔', '오른팔', '왼다리', '오른다리', '머리카락', '의상'];

export class PrevizScene {
    constructor(container) {
        this.container = container;
        this.THREE = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.animId = null;
        this._orbit = { dragging: false, lastX: 0, lastY: 0, theta: 0, phi: Math.PI / 6, radius: 3.6 };
        this._parts = {};
        this._envPoints = null;
        this._weather = null;
        this._raycaster = null;
        this.state = this._defaultState();
    }

    _defaultState() {
        return {
            hair:   { length: 0.85, color: '#00eaff', style: 'straight' },
            eye:    { color: '#00eaff' },
            body:   { height: 1.0, chest: 1.0 },
            pose:   'stand',
            outfit: { preset: 'none' },
            env:    { preset: 'park', weather: 'clear', timeOfDay: 0.5 },
            camera: { zoom: 1.0, angle: 'front', fov: 42 },
            unmapped: [],
        };
    }

    // ── 초기화 ───────────────────────────────────────────────────
    async init() {
        this.THREE = await this._loadThree();
        const THREE = this.THREE;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this._setSize();
        this.container.appendChild(this.renderer.domElement);

        // 글로우 효과 (CSS filter로 구현 — EffectComposer 없이)
        this.renderer.domElement.style.filter = 'brightness(1.08) saturate(1.4)';

        this.scene = new THREE.Scene();
        const [w, h] = [this.container.clientWidth, this.container.clientHeight];
        this.camera = new THREE.PerspectiveCamera(42, w / h, 0.01, 100);
        this._updateCameraPos();

        this._raycaster = new THREE.Raycaster();
        this._raycaster.params.Points = { threshold: 0.07 };

        this._weather = new WeatherSystem(THREE, this.scene);

        // 저장된 상태 복원
        try {
            const saved = JSON.parse(localStorage.getItem(LS_KEY));
            if (saved) this.state = { ...this._defaultState(), ...saved };
        } catch(_) {}

        this._applyEnv(this.state.env);
        this._buildAllParts();
        this._addNebula();
        this._addGrid();
        this._bindEvents();
        window.addEventListener('resize', () => this.resize());
        this._loop();
    }

    _loadThree() {
        return new Promise((resolve, reject) => {
            if (window.__previzTHREE) { resolve(window.__previzTHREE); return; }
            const s = document.createElement('script');
            s.src = THREE_CDN;
            s.onload = () => { window.__previzTHREE = window.THREE; resolve(window.THREE); };
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    // ── 환경 적용 ─────────────────────────────────────────────────
    _applyEnv(envState) {
        const THREE = this.THREE;
        const preset = ENV_PRESETS[envState.preset] || ENV_PRESETS.park;

        // 배경색 + 안개
        this.renderer.setClearColor(preset.fogColor, 1);
        this.scene.fog = new THREE.FogExp2(preset.fogColor, preset.fogDensity);

        // 기존 환경 포인트 제거
        if (this._envPoints) { this.scene.remove(this._envPoints); this._envPoints = null; }

        // 새 환경 포인트
        const { points } = preset.buildPoints(THREE);
        this._envPoints = points;
        this.scene.add(this._envPoints);

        // 날씨
        this._weather.setWeather(envState.weather || 'clear');

        // 시간대 → 안개 색 블렌딩
        this._applyTimeOfDay(envState.timeOfDay ?? 0.5);
    }

    _applyTimeOfDay(t) {
        // t: 0=새벽(딥네이비), 0.5=낮(청록), 0.75=저녁(주황빛), 1=밤(검정)
        const THREE = this.THREE;
        let fogR, fogG, fogB;
        if (t < 0.25) {
            const s = t / 0.25;
            fogR = 0.01; fogG = 0.03 + s * 0.04; fogB = 0.08 + s * 0.05;
        } else if (t < 0.6) {
            const s = (t - 0.25) / 0.35;
            fogR = 0.01 + s * 0.01; fogG = 0.07 + s * 0.05; fogB = 0.13 + s * 0.05;
        } else if (t < 0.8) {
            const s = (t - 0.6) / 0.2;
            fogR = 0.02 + s * 0.10; fogG = 0.12 - s * 0.05; fogB = 0.18 - s * 0.10;
        } else {
            const s = (t - 0.8) / 0.2;
            fogR = 0.12 - s * 0.11; fogG = 0.07 - s * 0.06; fogB = 0.08 - s * 0.07;
        }
        const col = (fogR * 255 | 0) << 16 | (fogG * 255 | 0) << 8 | (fogB * 255 | 0);
        this.renderer.setClearColor(col, 1);
        if (this.scene.fog) this.scene.fog.color.setHex(col);
    }

    // ── Catmull-Rom 단면 보간 ─────────────────────────────────────
    _interpSections(cp, steps) {
        const result = [], n = cp.length;
        for (let i = 0; i < n - 1; i++) {
            const p0 = cp[Math.max(0, i-1)], p1 = cp[i],
                  p2 = cp[i+1], p3 = cp[Math.min(n-1, i+2)];
            const seg = Math.max(2, Math.round(steps / (n-1)));
            for (let s = 0; s < seg; s++) {
                const t = s/seg, t2 = t*t, t3 = t2*t;
                const f = (a,b,c,d) => 0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);
                result.push([f(p0[0],p1[0],p2[0],p3[0]), f(p0[1],p1[1],p2[1],p3[1]), f(p0[2],p1[2],p2[2],p3[2])]);
            }
        }
        result.push(cp[n-1]);
        return result;
    }

    // ── 단면에서 포인트 샘플링 ────────────────────────────────────
    _sampleSections(sections, offsetX, offsetZ, count, partId) {
        const pts = [], cols = [];
        for (let si = 0; si < sections.length; si++) {
            const [y, rx, rz] = sections[si];
            const n = Math.max(1, Math.round(count / sections.length));
            for (let i = 0; i < n; i++) {
                const angle = (i/n)*Math.PI*2 + (Math.random()-0.5)*0.22;
                const surf  = 0.90 + Math.random()*0.20;
                pts.push(Math.cos(angle)*rx*surf+offsetX, y, Math.sin(angle)*rz*surf+offsetZ);
                this._pushBodyColor(cols, y, partId);
            }
        }
        return { pts: new Float32Array(pts), cols: new Float32Array(cols) };
    }

    // ── 팔 샘플링 (포즈 적용) ─────────────────────────────────────
    _sampleArm(side, sections, count, pose) {
        const pts = [], cols = [];
        const pDef = POSE_PRESETS[pose] || POSE_PRESETS.stand;
        const xBase = side * 0.225, xEnd = side * (0.285 + pDef.legSpread);

        for (let si = 0; si < sections.length; si++) {
            const [baseY, rx, rz] = sections[si];
            const progress = si / (sections.length - 1);
            const xOff = xBase + (xEnd - xBase) * progress;

            // 포즈: 팔 회전 (Y축 기준 X 평행이동 + Y 오프셋)
            const rotAngle = pDef.armAngle * progress;
            const y = baseY + pDef.armYOffset * progress + Math.sin(rotAngle) * 0.15 * progress;
            const xExtra = side * Math.cos(rotAngle) * 0.12 * progress;

            const n = Math.max(1, Math.round(count / sections.length));
            for (let i = 0; i < n; i++) {
                const angle = (i/n)*Math.PI*2 + (Math.random()-0.5)*0.25;
                const surf  = 0.90 + Math.random()*0.20;
                pts.push(Math.cos(angle)*rx*surf + xOff + xExtra, y, Math.sin(angle)*rz*surf);
                this._pushBodyColor(cols, y, side < 0 ? PART.L_ARM : PART.R_ARM);
            }
        }
        return { pts: new Float32Array(pts), cols: new Float32Array(cols) };
    }

    // ── 머리카락 ──────────────────────────────────────────────────
    _buildHair(state) {
        const { length, color, style } = state.hair;
        const pts = [], cols = [];
        const hx = 0, hy = 1.34, hz = -0.02;

        // 두상 볼륨
        for (let i = 0; i < 900 + (length*600|0); i++) {
            const angle = Math.random()*Math.PI*2, elev = Math.random()*Math.PI;
            const r = 0.20 + Math.random()*0.04;
            pts.push(hx + Math.cos(angle)*Math.sin(elev)*r*1.05,
                     hy + Math.cos(elev)*r*1.15 + 0.05,
                     hz + Math.sin(angle)*Math.sin(elev)*r*0.95 - 0.02);
            this._pushHexColor(cols, color, 0.85+Math.random()*0.15);
        }

        if (length > 0.25) {
            const strandCount = length*1200|0;
            // 스타일별 분포 조정
            const isTwin = style === 'twintails';
            const isPony = style === 'ponytail';

            for (let i = 0; i < strandCount; i++) {
                let side = (Math.random()-0.5)*0.38;
                if (isTwin)  side = (Math.random() > 0.5 ? 1 : -1) * (0.16 + Math.random()*0.12);
                if (isPony) { side *= 0.15; }  // 뒤로 모임

                const dropY = hy - 0.12 - Math.random()*(length*0.95);
                const front = isPony ? -0.18 - Math.random()*0.12 : -0.06 - Math.random()*0.14;
                pts.push(hx + side + (Math.random()-0.5)*0.05, dropY,
                         hz + front + (Math.random()-0.5)*0.05);
                this._pushHexColor(cols, color, 0.68+Math.random()*0.28);
            }
        }
        return { pts: new Float32Array(pts), cols: new Float32Array(cols) };
    }

    // ── 의상 오버레이 ─────────────────────────────────────────────
    _buildOutfit(state, torsoBaked) {
        const presetKey = state.outfit.preset;
        const preset = OUTFIT_PRESETS[presetKey];
        if (!preset || !preset.color) return null;

        const pts = [], cols = [];
        const color = preset.color;

        // 가슴~골반 영역만 의상 포인트 오버레이
        torsoBaked.forEach(([y, rx, rz]) => {
            if (y > 0.88 || y < 0.04) return;
            const n = 8;
            for (let i = 0; i < n; i++) {
                const angle = (i/n)*Math.PI*2 + (Math.random()-0.5)*0.3;
                const surf = 1.05 + Math.random()*0.08;  // 몸 바깥에 살짝
                pts.push(Math.cos(angle)*rx*surf, y, Math.sin(angle)*rz*surf);
                this._pushHexColor(cols, color, 0.55+Math.random()*0.35);
            }
        });
        return { pts: new Float32Array(pts), cols: new Float32Array(cols) };
    }

    // ── 전체 파트 빌드 ────────────────────────────────────────────
    _buildAllParts(state) {
        state = state || this.state;

        Object.values(this._parts).forEach(p => {
            this.scene.remove(p);
            p.geometry.dispose();
            p.material.dispose();
        });
        this._parts = {};

        const hs = state.body.height, cs = state.body.chest;
        const pose = state.pose || 'stand';
        const pDef = POSE_PRESETS[pose] || POSE_PRESETS.stand;

        // 단면 스케일 적용
        const torsoCp = TORSO_CP.map(([y, rx, rz]) => {
            let nrx = rx, nrz = rz;
            if (y >= 0.62 && y <= 0.76) { nrx *= (0.65+cs*0.35); nrz *= (0.65+cs*0.35); }
            return [y*hs, nrx, nrz];
        });

        // 앉기 포즈: 다리 압축
        const legCp = LEG_CP.map(([y, rx, rz]) => {
            let ny = y;
            if (y < 0) ny = y * pDef.legYCompress;
            return [ny*hs, rx, rz];
        });
        const armCp = ARM_CP.map(([y, rx, rz]) => [y*hs, rx, rz]);

        const torsoBaked = this._interpSections(torsoCp, 60);
        const legBaked   = this._interpSections(legCp, 40);
        const armBaked   = this._interpSections(armCp, 30);

        // 몸통 기울기 (lean 포즈)
        const tiltAngle = pDef.tilt || 0;

        const partsData = [
            { id: PART.TORSO, data: this._sampleSections(torsoBaked, 0, 0, 5500, PART.TORSO) },
            { id: PART.L_LEG, data: this._sampleSections(legBaked, -(0.105+pDef.legSpread), 0, 2200, PART.L_LEG) },
            { id: PART.R_LEG, data: this._sampleSections(legBaked,  (0.105+pDef.legSpread), 0, 2200, PART.R_LEG) },
            { id: PART.L_ARM, data: this._sampleArm(-1, armBaked, 1800, pose) },
            { id: PART.R_ARM, data: this._sampleArm( 1, armBaked, 1800, pose) },
        ];

        partsData.forEach(({ id, data }) => this._makePart(id, data.pts, data.cols, 0.0085, tiltAngle));

        // 눈
        this._buildEyes(state);

        // 머리카락
        const hairData = this._buildHair(state);
        this._makePart(PART.HAIR, hairData.pts, hairData.cols, 0.0095);

        // 의상 오버레이
        const outfitData = this._buildOutfit(state, torsoBaked);
        if (outfitData) this._makePart(PART.OUTFIT, outfitData.pts, outfitData.cols, 0.011);

        // 상태 저장
        this._saveState(state);
    }

    _buildEyes(state) {
        if (this._parts[PART.HEAD]) {
            this.scene.remove(this._parts[PART.HEAD]);
            this._parts[PART.HEAD]?.geometry.dispose();
        }
        const pts = [], cols = [];
        EYE_POS.forEach(e => {
            for (let i = 0; i < 140; i++) {
                pts.push(e.x+(Math.random()-0.5)*0.060, e.y+(Math.random()-0.5)*0.038, e.z+(Math.random()-0.5)*0.008);
                this._pushHexColor(cols, state.eye.color, 0.9+Math.random()*0.1);
            }
        });
        this._makePart(PART.HEAD, new Float32Array(pts), new Float32Array(cols), 0.012);
    }

    _makePart(partId, positions, colors, size, tiltAngle = 0) {
        const THREE = this.THREE;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
        const mat = new THREE.PointsMaterial({
            size, vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true, opacity: 0.90, sizeAttenuation: true, depthWrite: false,
        });
        const pts = new THREE.Points(geo, mat);
        pts.userData.partId = partId;
        if (tiltAngle && partId !== PART.HAIR && partId !== PART.HEAD)
            pts.rotation.z = tiltAngle;
        this.scene.add(pts);
        this._parts[partId] = pts;
    }

    // ── 색상 헬퍼 ─────────────────────────────────────────────────
    _pushBodyColor(cols, y, partId) {
        const t = Math.max(0, Math.min(1, (y+1.0)/2.6));
        cols.push(0.0+t*0.04, 0.42+t*0.58, 0.68+t*0.32);
    }
    _pushHexColor(cols, hex, brightness = 1.0) {
        if (!hex || hex.length < 7) { cols.push(0, brightness*0.9, brightness); return; }
        const r = parseInt(hex.slice(1,3),16)/255;
        const g = parseInt(hex.slice(3,5),16)/255;
        const b = parseInt(hex.slice(5,7),16)/255;
        cols.push(r*brightness, g*brightness, b*brightness);
    }

    // ── 배경 성운 / 그리드 ────────────────────────────────────────
    _addNebula() {
        const THREE = this.THREE;
        const count = 2200, pos = new Float32Array(count*3);
        for (let i = 0; i < count; i++) {
            pos[i*3]=(Math.random()-0.5)*22; pos[i*3+1]=(Math.random()-0.5)*14; pos[i*3+2]=(Math.random()-0.5)*22-5;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
            size:0.028, color:0x003d5c, blending:THREE.AdditiveBlending,
            transparent:true, opacity:0.30, depthWrite:false,
        })));
    }
    _addGrid() {
        this.scene.add(new this.THREE.GridHelper(12, 24, 0x003344, 0x001622));
    }

    // ── 태그 변경 → sceneState ────────────────────────────────────
    onTagsChanged(tags) {
        const ns = this._defaultState();
        ns.unmapped = [];

        // 1) 환경 태그
        tags.forEach(({ token }) => {
            const envMapping = ENV_TAG_MAP[token];
            if (envMapping) {
                if (envMapping.env)       ns.env.preset   = envMapping.env;
                if (envMapping.weather)   ns.env.weather  = envMapping.weather;
                if (envMapping.timeOfDay !== undefined) ns.env.timeOfDay = envMapping.timeOfDay;
            }
        });

        // 2) 캐릭터 태그
        tags.forEach(({ token }) => {
            const m = TAG_MAP[token];
            if (m) {
                const [domain, prop] = m.ch.split('.');
                if (prop) {
                    if (!ns[domain]) ns[domain] = {};
                    ns[domain][prop] = m.v;
                } else {
                    ns[domain] = m.v;
                }
            } else if (!ENV_TAG_MAP[token]) {
                // 키워드 자동추정
                const t = token.toLowerCase();
                if      (t.includes('long') && t.includes('hair')) ns.hair.length = 1.0;
                else if (t.includes('short') && t.includes('hair')) ns.hair.length = 0.18;
                else if (t.includes('blue') && t.includes('eye')) ns.eye.color = '#2288ff';
                else if (t.includes('red') && t.includes('eye')) ns.eye.color = '#ff2222';
                else if (t.includes('tall')) ns.body.height = 1.10;
                else if (t.includes('petite') || (t.includes('small') && t.includes('body'))) ns.body.height = 0.88;
                else ns.unmapped.push(token);
            }
        });

        this.state = ns;
        this._applyEnv(ns.env);
        this._buildAllParts(ns);
        this._updateCameraForState(ns);

        if (typeof window.__previzUpdateUnmapped === 'function')
            window.__previzUpdateUnmapped(ns.unmapped);

        console.log('[previz] 씬 업데이트. 환경:', ns.env.preset,
            '| 날씨:', ns.env.weather, '| 포즈:', ns.pose,
            '| 미매핑:', ns.unmapped.length);
    }

    _updateCameraForState(state) {
        const angle = state.camera?.angle || 'front';
        if (angle === 'back')  this._orbit.theta = Math.PI;
        else if (angle === 'high') { this._orbit.theta = 0; this._orbit.phi = Math.PI/10; }
        else if (angle === 'low')  { this._orbit.theta = 0; this._orbit.phi = Math.PI/2.2; }
        else                   this._orbit.theta = 0;

        const zoom = state.camera?.zoom ?? 1.0;
        this._orbit.radius = 3.6 * zoom * 2;

        const fov = state.camera?.fov ?? 42;
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();

        this._updateCameraPos();
    }

    // ── localStorage 저장/복원 ────────────────────────────────────
    _saveState(state) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(_) {}
    }

    // ── 레이캐스팅 + 클릭 ────────────────────────────────────────
    _bindEvents() {
        const el = this.renderer.domElement;
        const o  = this._orbit;

        // 우클릭 컨텍스트 메뉴 억제
        el.addEventListener('contextmenu', e => e.preventDefault());

        el.addEventListener('mousedown', e => {
            if (e.button === 0) {
                // 좌클릭: 좌표만 기록 (드래그 없음 — 클릭 판정용)
                o._sx = e.clientX; o._sy = e.clientY;
                o._lbDown = true;
            } else if (e.button === 2) {
                // 우클릭: 회전
                o.dragging = true; o._mode = 'rotate';
                o.lastX = e.clientX; o.lastY = e.clientY;
            } else if (e.button === 1) {
                // 가운데 버튼: 팬
                o.dragging = true; o._mode = 'pan';
                o.lastX = e.clientX; o.lastY = e.clientY;
                e.preventDefault();
            }
        });
        el.addEventListener('mousemove', e => {
            if (!o.dragging) return;
            const dx = e.clientX-o.lastX, dy = e.clientY-o.lastY;
            o.lastX = e.clientX; o.lastY = e.clientY;
            if (o._mode === 'rotate') {
                o.theta -= dx*0.008;
                o.phi = Math.max(0.06, Math.min(Math.PI*0.62, o.phi+dy*0.006));
                this._updateCameraPos();
            } else if (o._mode === 'pan') {
                // 팬: 카메라 right/up 벡터 기준으로 lookAt 오프셋 이동
                const scale = o.radius * 0.0012;
                const right = new this.THREE.Vector3();
                const up    = new this.THREE.Vector3(0, 1, 0);
                right.crossVectors(
                    new this.THREE.Vector3().subVectors(this.camera.position, new this.THREE.Vector3(0, 0.58, 0)).normalize(),
                    up
                ).normalize();
                o._panX = (o._panX||0) - dx*scale;
                o._panY = (o._panY||0) + dy*scale;
                this._updateCameraPos();
            }
        });
        window.addEventListener('mouseup', e => {
            if (e.button === 0 && o._lbDown) {
                o._lbDown = false;
                if (Math.abs(e.clientX-o._sx)+Math.abs(e.clientY-o._sy) < 5)
                    this._handleClick(e);
            } else {
                o.dragging = false;
                o._mode = null;
            }
        });
        el.addEventListener('wheel', e => {
            o.radius = Math.max(1.2, Math.min(10, o.radius+e.deltaY*0.005));
            this._updateCameraPos();
            e.preventDefault();
        }, { passive: false });

        let lastDist = 0;
        el.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                o.dragging = true; o.lastX = e.touches[0].clientX; o.lastY = e.touches[0].clientY;
                o._sx = o.lastX; o._sy = o.lastY;
            } else if (e.touches.length === 2) {
                o.dragging = false;
                lastDist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
            }
        }, { passive: true });
        el.addEventListener('touchmove', e => {
            if (e.touches.length === 1 && o.dragging) {
                const dx = e.touches[0].clientX-o.lastX, dy = e.touches[0].clientY-o.lastY;
                o.lastX = e.touches[0].clientX; o.lastY = e.touches[0].clientY;
                o.theta -= dx*0.008;
                o.phi = Math.max(0.06, Math.min(Math.PI*0.62, o.phi+dy*0.006));
                this._updateCameraPos();
            } else if (e.touches.length === 2) {
                const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
                o.radius = Math.max(1.2, Math.min(10, o.radius-(d-lastDist)*0.01));
                lastDist = d;
                this._updateCameraPos();
            }
            e.preventDefault();
        }, { passive: false });
        el.addEventListener('touchend', e => {
            if (o.dragging && e.changedTouches.length > 0) {
                const t = e.changedTouches[0];
                if (Math.abs(t.clientX-o._sx)+Math.abs(t.clientY-o._sy) < 10) this._handleClick(t);
            }
            o.dragging = false;
        });
    }

    // PART ID → callout id 매핑
    static _PART_TO_CALLOUT = {
        [0]: 'face',   // HEAD
        [1]: 'upper',  // TORSO
        [2]: 'pose',   // L_ARM
        [3]: 'pose',   // R_ARM
        [4]: 'lower',  // L_LEG
        [5]: 'lower',  // R_LEG
        [6]: 'hair',   // HAIR
        [7]: 'upper',  // OUTFIT
    };

    _handleClick(e) {
        if (!this._raycaster) return;
        const THREE = this.THREE;
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX-rect.left)/rect.width)*2-1,
            -((e.clientY-rect.top)/rect.height)*2+1,
        );
        this._raycaster.setFromCamera(mouse, this.camera);
        const hits = this._raycaster.intersectObjects(Object.values(this._parts));
        if (hits.length > 0) {
            const partId = hits[0].object.userData.partId;
            // 기존 핸들러 (파트 클릭 패널)
            if (typeof window.__previzOnPartClick === 'function')
                window.__previzOnPartClick(partId, PART_NAME[partId], this.state, this);
            // Callout 패널 자동 오픈
            const calloutId = PrevizScene._PART_TO_CALLOUT[partId];
            if (calloutId && typeof window.__previzOpenCallout === 'function')
                window.__previzOpenCallout(calloutId);
        }
    }

    _updateCameraPos() {
        const o = this._orbit;
        const baseY = 0.58;
        const px = o._panX || 0;
        const py = o._panY || 0;

        // 카메라 로컬 right 벡터 (팬 방향 계산)
        const sinT = Math.sin(o.theta), cosT = Math.cos(o.theta);
        const rightX = cosT, rightZ = -sinT;

        const targetX = px * rightX;
        const targetY = baseY + py;
        const targetZ = px * rightZ;

        this.camera.position.set(
            o.radius*Math.sin(o.phi)*Math.sin(o.theta) + targetX,
            o.radius*Math.cos(o.phi) + targetY,
            o.radius*Math.sin(o.phi)*Math.cos(o.theta) + targetZ,
        );
        this.camera.lookAt(targetX, targetY, targetZ);
    }

    _loop() {
        this.animId = requestAnimationFrame(() => this._loop());
        const t = performance.now()*0.0004;
        Object.values(this._parts).forEach((p, i) => {
            p.material.opacity = 0.82+Math.sin(t+i*0.5)*0.06;
        });
        this._weather?.update();
        this.renderer.render(this.scene, this.camera);
        this.onFrameTick?.();
    }

    resize() {
        if (!this.renderer || !this.camera) return;
        this._setSize();
        const w = this.container.clientWidth, h = this.container.clientHeight;
        this.camera.aspect = w/h;
        this.camera.updateProjectionMatrix();
    }
    _setSize() {
        const w = this.container.clientWidth||window.innerWidth;
        const h = this.container.clientHeight||window.innerHeight;
        this.renderer.setSize(w, h);
    }

    dispose() {
        if (this.animId) cancelAnimationFrame(this.animId);
        this._weather?.dispose();
        if (this.renderer) { this.renderer.dispose(); this.renderer.domElement.remove(); }
    }
}
