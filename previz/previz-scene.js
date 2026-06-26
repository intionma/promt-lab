/**
 * previz-scene.js — 스켈레톤 기반 애니 인체 포인트클라우드
 * 모든 파라미터(키, 가슴, 다리 길이, 머리카락)는 단일 스켈레톤에서 파생되어
 * 따로 놀지 않고 하나의 인체로 통합 변형됩니다.
 */

import { ENV_PRESETS, ENV_TAG_MAP, WeatherSystem } from './previz-env.js';

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const LS_KEY    = 'previz_state_v2';

// ── 포즈 프리셋 ───────────────────────────────────────────────────
const POSE_PRESETS = {
    stand:          { label: '서기',     armSpread: 0.06, armAngle: 0,               legSpread: 0,    legBend: 0,   torsoTilt: 0 },
    arms_up:        { label: '팔 들기', armSpread: 0.04, armAngle: -Math.PI/2.1,    legSpread: 0,    legBend: 0,   torsoTilt: 0 },
    hands_on_hips:  { label: '손 허리', armSpread: 0.18, armAngle: Math.PI/4.5,     legSpread: 0.04, legBend: 0,   torsoTilt: 0 },
    crossed_arms:   { label: '팔짱',   armSpread: 0.10, armAngle: Math.PI/5,        legSpread: 0,    legBend: 0,   torsoTilt: 0 },
    peace_sign:     { label: '브이',   armSpread: 0.08, armAngle: -Math.PI/2.8,     legSpread: 0.03, legBend: 0,   torsoTilt: 0 },
    sit:            { label: '앉기',   armSpread: 0.12, armAngle: Math.PI/8,        legSpread: 0.12, legBend: 0.9, torsoTilt: 0 },
    lean:           { label: '기대기', armSpread: 0.10, armAngle: Math.PI/7,        legSpread: 0.05, legBend: 0,   torsoTilt: 0.07 },
};

// ── 의상 색상 프리셋 ──────────────────────────────────────────────
const OUTFIT_PRESETS = {
    none:           { label: '없음',       color: null },
    school_uniform: { label: '교복',       color: '#1133aa' },
    dress:          { label: '드레스',     color: '#cc3366' },
    casual:         { label: '캐주얼',     color: '#226688' },
    sportswear:     { label: '스포츠웨어', color: '#228844' },
    gothic:         { label: '고딕',       color: '#220033' },
    kimono:         { label: '기모노',     color: '#aa2244' },
    white_dress:    { label: '흰 드레스',  color: '#ccddee' },
    maid:           { label: '메이드',     color: '#334488' },
};

// ── 태그 → sceneState 매핑 ────────────────────────────────────────
const TAG_MAP = {
    long_hair:        { ch: 'hair.length',   v: 1.0 },
    medium_hair:      { ch: 'hair.length',   v: 0.55 },
    short_hair:       { ch: 'hair.length',   v: 0.18 },
    very_long_hair:   { ch: 'hair.length',   v: 1.35 },
    blonde_hair:      { ch: 'hair.color',    v: '#f5d060' },
    black_hair:       { ch: 'hair.color',    v: '#1a1a2e' },
    brown_hair:       { ch: 'hair.color',    v: '#7a4a1e' },
    white_hair:       { ch: 'hair.color',    v: '#e8eaf0' },
    pink_hair:        { ch: 'hair.color',    v: '#ff80b0' },
    silver_hair:      { ch: 'hair.color',    v: '#c0c8d8' },
    red_hair:         { ch: 'hair.color',    v: '#cc2200' },
    purple_hair:      { ch: 'hair.color',    v: '#9933cc' },
    blue_hair:        { ch: 'hair.color',    v: '#3366ff' },
    green_hair:       { ch: 'hair.color',    v: '#22aa44' },
    orange_hair:      { ch: 'hair.color',    v: '#ee6622' },
    blue_eyes:        { ch: 'eye.color',     v: '#2288ff' },
    red_eyes:         { ch: 'eye.color',     v: '#ff2222' },
    green_eyes:       { ch: 'eye.color',     v: '#22cc44' },
    purple_eyes:      { ch: 'eye.color',     v: '#9933ff' },
    brown_eyes:       { ch: 'eye.color',     v: '#885522' },
    golden_eyes:      { ch: 'eye.color',     v: '#ddaa00' },
    petite:           { ch: 'body.height',   v: 0.88 },
    small:            { ch: 'body.height',   v: 0.88 },
    tall:             { ch: 'body.height',   v: 1.10 },
    large_breasts:    { ch: 'body.chest',    v: 1.38 },
    small_breasts:    { ch: 'body.chest',    v: 0.72 },
    ponytail:         { ch: 'hair.style',    v: 'ponytail' },
    twintails:        { ch: 'hair.style',    v: 'twintails' },
    braid:            { ch: 'hair.style',    v: 'braid' },
    hands_on_hips:    { ch: 'pose',          v: 'hands_on_hips' },
    peace_sign:       { ch: 'pose',          v: 'peace_sign' },
    crossed_arms:     { ch: 'pose',          v: 'crossed_arms' },
    arms_up:          { ch: 'pose',          v: 'arms_up' },
    close_up:         { ch: 'camera.zoom',   v: 0.55 },
    from_behind:      { ch: 'camera.angle',  v: 'back' },
    from_above:       { ch: 'camera.angle',  v: 'high' },
    from_below:       { ch: 'camera.angle',  v: 'low' },
    looking_at_viewer:{ ch: 'camera.angle',  v: 'front' },
    school_uniform:   { ch: 'outfit.preset', v: 'school_uniform' },
    dress:            { ch: 'outfit.preset', v: 'dress' },
    kimono:           { ch: 'outfit.preset', v: 'kimono' },
    maid:             { ch: 'outfit.preset', v: 'maid' },
};

// ── 바디파트 ID ───────────────────────────────────────────────────
export const PART = { HEAD: 0, TORSO: 1, L_ARM: 2, R_ARM: 3, L_LEG: 4, R_LEG: 5, HAIR: 6, OUTFIT: 7 };
export const PART_NAME = ['머리', '몸통', '왼팔', '오른팔', '왼다리', '오른다리', '머리카락', '의상'];

// ── 스켈레톤 계산 ─────────────────────────────────────────────────
// 모든 신체 치수는 이 함수에서 파생됩니다.
// 기준 신장: UNIT_H = 2.0 (씬 유닛), 발이 y=0
function buildSkeleton(state) {
    const H   = 2.0 * state.body.height;  // 전체 키
    const CS  = state.body.chest;         // 가슴 스케일

    // 애니 비율: 다리 길이 ≈ 53%, 상체 ≈ 30%, 머리 ≈ 17%
    const footY      = 0;
    const ankleY     = H * 0.040;
    const kneeY      = H * 0.270;
    const hipY       = H * 0.530;         // 골반
    const waistY     = H * 0.620;         // 허리
    const bellyY     = H * 0.650;
    const bustY      = H * 0.720;         // 가슴
    const shoulderY  = H * 0.790;         // 어깨
    const neckBotY   = H * 0.830;
    const neckTopY   = H * 0.860;
    const chinY      = H * 0.880;
    const noseY      = H * 0.912;
    const eyeY       = H * 0.930;
    const browY      = H * 0.948;
    const headTopY   = H * 1.000;
    const headCenterY = (chinY + headTopY) * 0.5;

    // 너비 (반지름)
    const shoulderW = 0.165;
    const bustW     = 0.095 * Math.sqrt(CS);   // 가슴 너비는 sqrt 스케일
    const bustDepth = 0.065 * CS;               // 앞뒤 깊이
    const waistW    = 0.055;
    const hipW      = 0.115;
    const thighW    = 0.058;
    const kneeW     = 0.038;
    const calfW     = 0.045;
    const ankleW    = 0.028;
    const upperArmW = 0.038;
    const elbowW    = 0.028;
    const foreArmW  = 0.030;
    const wristW    = 0.022;
    const headW     = 0.180;
    const headD     = 0.165;
    const neckW     = 0.042;
    const neckD     = 0.038;

    return {
        H, CS,
        // Y 좌표
        footY, ankleY, kneeY, hipY, waistY, bellyY, bustY,
        shoulderY, neckBotY, neckTopY, chinY, noseY, eyeY, browY, headTopY, headCenterY,
        // 너비 (반지름)
        shoulderW, bustW, bustDepth, waistW, hipW,
        thighW, kneeW, calfW, ankleW,
        upperArmW, elbowW, foreArmW, wristW,
        headW, headD, neckW, neckD,
    };
}

// ── Catmull-Rom 보간 ──────────────────────────────────────────────
function catmullRom(cp, steps) {
    const result = [], n = cp.length;
    for (let i = 0; i < n - 1; i++) {
        const p0 = cp[Math.max(0, i-1)], p1 = cp[i],
              p2 = cp[i+1], p3 = cp[Math.min(n-1, i+2)];
        const seg = Math.max(2, Math.round(steps / (n-1)));
        for (let s = 0; s < seg; s++) {
            const t = s/seg, t2 = t*t, t3 = t2*t;
            const f = (a,b,c,d) => 0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);
            result.push([
                f(p0[0],p1[0],p2[0],p3[0]),
                f(p0[1],p1[1],p2[1],p3[1]),
                f(p0[2],p1[2],p2[2],p3[2]),
            ]);
        }
    }
    result.push(cp[n-1]);
    return result;
}

// ── 타원 단면에서 포인트 샘플링 ──────────────────────────────────
// sections: [{y, rx, rz, ox?, oz?}]  ox/oz = 중심 오프셋
function sampleTube(sections, count, partId, colorFn) {
    const pts = [], cols = [];
    for (let si = 0; si < sections.length; si++) {
        const { y, rx, rz, ox = 0, oz = 0 } = sections[si];
        const n = Math.max(1, Math.round(count / sections.length));
        for (let i = 0; i < n; i++) {
            const angle = (i/n)*Math.PI*2 + (Math.random()-0.5)*0.22;
            const surf  = 0.88 + Math.random()*0.24;
            pts.push(
                Math.cos(angle)*rx*surf + ox,
                y,
                Math.sin(angle)*rz*surf + oz,
            );
            colorFn(cols, y, partId);
        }
    }
    return { pts: new Float32Array(pts), cols: new Float32Array(cols) };
}

export class PrevizScene {
    constructor(container) {
        this.container = container;
        this.THREE = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.animId = null;
        this._orbit = { theta: 0, phi: Math.PI/6, radius: 4.2, _panX: 0, _panY: 0 };
        this._parts = {};
        this._envPoints = null;
        this._weather = null;
        this._raycaster = null;
        this.state = this._defaultState();
        this.onFrameTick = null;
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

    async init() {
        this.THREE = await this._loadThree();
        const THREE = this.THREE;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this._setSize();
        this.container.appendChild(this.renderer.domElement);
        this.renderer.domElement.style.filter = 'brightness(1.10) saturate(1.5)';

        this.scene = new THREE.Scene();
        const [w, h] = [this.container.clientWidth, this.container.clientHeight];
        this.camera = new THREE.PerspectiveCamera(42, w / h, 0.01, 100);
        this._updateCameraPos();

        this._raycaster = new THREE.Raycaster();
        this._raycaster.params.Points = { threshold: 0.08 };

        this._weather = new WeatherSystem(THREE, this.scene);

        try {
            const saved = JSON.parse(localStorage.getItem(LS_KEY));
            if (saved) this.state = { ...this._defaultState(), ...saved };
        } catch(_) {}

        this._applyEnv(this.state.env);
        this._buildAllParts(this.state);
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

    // ── 환경 ──────────────────────────────────────────────────────
    _applyEnv(envState) {
        const THREE = this.THREE;
        const preset = ENV_PRESETS[envState.preset] || ENV_PRESETS.park;
        this.renderer.setClearColor(preset.fogColor, 1);
        this.scene.fog = new THREE.FogExp2(preset.fogColor, preset.fogDensity);
        if (this._envPoints) { this.scene.remove(this._envPoints); this._envPoints = null; }
        const { points } = preset.buildPoints(THREE);
        this._envPoints = points;
        this.scene.add(points);
        this._weather?.setWeather(envState.weather);
        this._applyTimeOfDay(envState.timeOfDay ?? 0.5);
    }

    _applyTimeOfDay(t) {
        let fogR, fogG, fogB;
        if (t < 0.25) {
            const s = t/0.25;
            fogR=0.01; fogG=0.03+s*0.04; fogB=0.08+s*0.05;
        } else if (t < 0.6) {
            const s=(t-0.25)/0.35;
            fogR=0.01+s*0.01; fogG=0.07+s*0.05; fogB=0.13+s*0.05;
        } else if (t < 0.8) {
            const s=(t-0.6)/0.2;
            fogR=0.02+s*0.10; fogG=0.12-s*0.05; fogB=0.18-s*0.10;
        } else {
            const s=(t-0.8)/0.2;
            fogR=0.12-s*0.11; fogG=0.07-s*0.06; fogB=0.08-s*0.07;
        }
        const col = (fogR*255|0)<<16|(fogG*255|0)<<8|(fogB*255|0);
        this.renderer.setClearColor(col, 1);
        if (this.scene.fog) this.scene.fog.color.setHex(col);
    }

    // ── 색상 헬퍼 ─────────────────────────────────────────────────
    _bodyColor(cols, y, partId) {
        const t = Math.max(0, Math.min(1, y / 2.2));
        cols.push(0.0+t*0.04, 0.42+t*0.55, 0.68+t*0.30);
    }

    _hexColor(cols, hex, bright = 1.0) {
        if (!hex || hex.length < 7) { cols.push(0, bright*0.9, bright); return; }
        const r = parseInt(hex.slice(1,3),16)/255;
        const g = parseInt(hex.slice(3,5),16)/255;
        const b = parseInt(hex.slice(5,7),16)/255;
        cols.push(r*bright, g*bright, b*bright);
    }

    // ── 전체 인체 빌드 (스켈레톤 기반) ───────────────────────────
    _buildAllParts(state) {
        // 기존 파트 제거
        Object.values(this._parts).forEach(p => {
            this.scene.remove(p); p.geometry.dispose(); p.material.dispose();
        });
        this._parts = {};

        const sk   = buildSkeleton(state);
        const pose = POSE_PRESETS[state.pose] || POSE_PRESETS.stand;

        this._buildTorso(state, sk, pose);
        this._buildLegs(state, sk, pose);
        this._buildArms(state, sk, pose);
        this._buildHead(state, sk);
        this._buildFace(state, sk);
        this._buildHair(state, sk);
        if ((OUTFIT_PRESETS[state.outfit?.preset]?.color)) this._buildOutfit(state, sk, pose);

        this._saveState(state);
    }

    // ── 몸통 ──────────────────────────────────────────────────────
    _buildTorso(state, sk, pose) {
        // 몸통 단면: 각 높이별 [y, rx, rz]
        // 모든 좌표는 스켈레톤에서 파생
        const sections = [
            { y: sk.hipY,      rx: sk.hipW,      rz: sk.hipW*0.88 },
            { y: sk.hipY*1.02, rx: sk.hipW*1.04, rz: sk.hipW*0.90 },
            { y: sk.bellyY,    rx: sk.waistW*1.1, rz: sk.waistW*0.95 },
            { y: sk.waistY,    rx: sk.waistW,    rz: sk.waistW*0.88 },
            { y: (sk.waistY+sk.bustY)*0.5, rx: (sk.waistW+sk.bustW)*0.5, rz: (sk.waistW*0.88+sk.bustDepth)*0.5 },
            { y: sk.bustY,     rx: sk.bustW,     rz: sk.bustDepth, oz: sk.bustDepth*0.12 },
            { y: sk.bustY + (sk.shoulderY-sk.bustY)*0.35, rx: sk.bustW*0.88, rz: sk.bustDepth*0.80 },
            { y: sk.bustY + (sk.shoulderY-sk.bustY)*0.70, rx: sk.shoulderW*0.92, rz: sk.bustDepth*0.65 },
            { y: sk.shoulderY, rx: sk.shoulderW, rz: sk.bustDepth*0.55 },
            { y: sk.neckBotY,  rx: sk.shoulderW*0.55, rz: sk.bustDepth*0.42 },
        ];

        // 앉기: 상체를 약간 압축하지 않음 — 단순히 넥 기준으로 기울기 적용
        const colorFn = (cols, y) => this._bodyColor(cols, y, PART.TORSO);
        const { pts, cols } = sampleTube(sections, 5000, PART.TORSO, colorFn);
        this._makePart(PART.TORSO, pts, cols, 0.009, pose.torsoTilt);

        // 목
        const neckSecs = [
            { y: sk.neckBotY, rx: sk.neckW, rz: sk.neckD },
            { y: (sk.neckBotY+sk.neckTopY)*0.5, rx: sk.neckW*0.95, rz: sk.neckD*0.95 },
            { y: sk.neckTopY, rx: sk.neckW*0.90, rz: sk.neckD*0.88 },
            { y: sk.chinY,    rx: sk.neckW*0.88, rz: sk.neckD*0.85 },
        ];
        const { pts: nPts, cols: nCols } = sampleTube(neckSecs, 400, PART.TORSO, colorFn);
        // 목은 TORSO 파트에 병합하지 않고 별도 Points로 추가 (userData.partId = TORSO)
        this._appendPoints(nPts, nCols, PART.TORSO, 0.009, pose.torsoTilt);
    }

    // ── 다리 ──────────────────────────────────────────────────────
    _buildLegs(state, sk, pose) {
        const spread = sk.hipW * 0.85 + pose.legSpread * 0.5;
        const bend   = pose.legBend || 0;

        [-1, 1].forEach(side => {
            const pId = side < 0 ? PART.L_LEG : PART.R_LEG;
            const ox  = side * spread;

            let kneeX = ox, kneeZ = 0, footX = ox, footZ = 0;
            if (bend > 0) {
                // 앉기: 무릎 앞으로
                kneeZ = -bend * 0.35;
                footZ = -bend * 0.25;
            }

            // 허벅지: 골반 → 무릎
            const thighSecs = catmullRom([
                [ox,    sk.hipY,   0],
                [ox,    (sk.hipY+sk.kneeY)*0.55, 0],
                [kneeX, sk.kneeY,  kneeZ],
            ], 20).map(([x,y,z], i, arr) => {
                const t = i/(arr.length-1);
                return {
                    y, rx: sk.thighW*(1-t*0.35) + sk.kneeW*t*0.35,
                    rz: (sk.thighW*0.90)*(1-t*0.35) + (sk.kneeW*0.90)*t*0.35,
                    ox: x, oz: z,
                };
            });
            const colorFn = (cols, y) => this._bodyColor(cols, y, pId);
            const { pts: tPts, cols: tCols } = sampleTube(thighSecs, 1400, pId, colorFn);

            // 종아리: 무릎 → 발목
            const calfSecs = catmullRom([
                [kneeX, sk.kneeY, kneeZ],
                [(kneeX+footX)*0.5, (sk.kneeY+sk.ankleY)*0.5, (kneeZ+footZ)*0.5],
                [footX, sk.ankleY, footZ],
            ], 18).map(([x,y,z], i, arr) => {
                const t = i/(arr.length-1);
                return {
                    y, rx: sk.calfW*(1-t*0.5) + sk.ankleW*t*0.5,
                    rz: (sk.calfW*0.88)*(1-t*0.5) + (sk.ankleW*0.88)*t*0.5,
                    ox: x, oz: z,
                };
            });
            const { pts: cPts, cols: cCols } = sampleTube(calfSecs, 900, pId, colorFn);

            // 발
            const footSecs = [
                { y: sk.footY, rx: sk.ankleW*1.1, rz: sk.ankleW*1.6, ox: footX, oz: footZ - sk.ankleW*0.5 },
                { y: sk.ankleY*0.3, rx: sk.ankleW, rz: sk.ankleW*1.4, ox: footX, oz: footZ - sk.ankleW*0.3 },
            ];
            const { pts: fPts, cols: fCols } = sampleTube(footSecs, 200, pId, colorFn);

            // 병합
            const allPts = new Float32Array(tPts.length + cPts.length + fPts.length);
            const allCols = new Float32Array(tCols.length + cCols.length + fCols.length);
            allPts.set(tPts, 0); allPts.set(cPts, tPts.length); allPts.set(fPts, tPts.length+cPts.length);
            allCols.set(tCols, 0); allCols.set(cCols, tCols.length); allCols.set(fCols, tCols.length+cCols.length);
            this._makePart(pId, allPts, allCols, 0.009);
        });
    }

    // ── 팔 ────────────────────────────────────────────────────────
    _buildArms(state, sk, pose) {
        const shoulderX = sk.shoulderW * 1.05;

        [-1, 1].forEach(side => {
            const pId = side < 0 ? PART.L_ARM : PART.R_ARM;
            const ang = pose.armAngle * (side < 0 ? 1 : 1);  // 좌우 동일 각도
            const sp  = pose.armSpread;

            // 어깨점: 몸통 어깨 위치
            const sx = side * shoulderX, sy = sk.shoulderY, sz = 0;

            // 팔꿈치: 포즈에 따라 위치 결정
            const elbowLen = sk.H * 0.155;
            const ex = sx + side * Math.cos(ang) * sp * 0.5;
            const ey = sy + Math.sin(ang) * elbowLen;
            const ez = sz;

            // 손목: 팔꿈치에서 더 뻗음
            const wristLen = sk.H * 0.140;
            const wx = ex + side * sp * 0.3;
            const wy = ey + Math.sin(ang) * wristLen * 0.85;
            const wz = ez;

            // 팔 단면 (상완 → 팔꿈치 → 전완 → 손목)
            const colorFn = (cols, y) => this._bodyColor(cols, y, pId);
            const armPoints = catmullRom([
                [sx, sy, sz],
                [sx*0.9+ex*0.1, sy*0.9+ey*0.1, sz],
                [(sx+ex)*0.5, (sy+ey)*0.5, sz],
                [ex, ey, ez],
                [(ex+wx)*0.5, (ey+wy)*0.5, ez],
                [wx, wy, wz],
            ], 24);

            const armSecs = armPoints.map(([x, y, z], i, arr) => {
                const t = i / (arr.length - 1);
                const r = sk.upperArmW * (1-t) * (1 - t*0.35) + sk.wristW * t;
                return { y, rx: r, rz: r*0.9, ox: x, oz: z };
            });

            const { pts, cols } = sampleTube(armSecs, 1200, pId, colorFn);

            // 손 (단순 구형)
            const handPts = [], handCols = [];
            for (let i = 0; i < 120; i++) {
                const a = Math.random()*Math.PI*2, e = Math.random()*Math.PI;
                const r = sk.wristW * (0.9 + Math.random()*0.3);
                handPts.push(wx + Math.cos(a)*Math.sin(e)*r*1.3, wy + Math.cos(e)*r, wz + Math.sin(a)*Math.sin(e)*r);
                colorFn(handCols, wy, pId);
            }

            const allPts = new Float32Array(pts.length + handPts.length);
            const allCols = new Float32Array(cols.length + handCols.length);
            allPts.set(pts); allPts.set(handPts, pts.length);
            allCols.set(cols); allCols.set(handCols, cols.length);
            this._makePart(pId, allPts, allCols, 0.009);
        });
    }

    // ── 머리 (구형, 스켈레톤 기반) ───────────────────────────────
    _buildHead(state, sk) {
        const pts = [], cols = [];
        const cx = 0, cy = sk.headCenterY, cz = 0;
        const rx = sk.headW, ry = (sk.headTopY - sk.chinY) * 0.56, rz = sk.headD;

        // 두상 타원체 표면
        for (let i = 0; i < 2200; i++) {
            const a = Math.random()*Math.PI*2, e = Math.acos(2*Math.random()-1);
            const surf = 0.88 + Math.random()*0.20;
            const x = Math.cos(a)*Math.sin(e)*rx*surf;
            const y = cy + Math.cos(e)*ry*surf;
            const z = Math.sin(a)*Math.sin(e)*rz*surf;
            // 턱은 약간 뾰족하게 (아래로 갈수록 좁아짐)
            if (y < sk.chinY && Math.abs(x) > sk.headW*0.45*(1-(sk.chinY-y)/(ry*0.6))) continue;
            pts.push(x, y, z);
            this._bodyColor(cols, y, PART.TORSO);
        }
        this._makePart(PART.HEAD, new Float32Array(pts), new Float32Array(cols), 0.009);
    }

    // ── 얼굴 (눈, 코, 입, 눈썹) — 애니 스타일 ──────────────────
    _buildFace(state, sk) {
        const pts = [], cols = [];
        const eyeColor = state.eye.color || '#00eaff';
        const faceZ = sk.headD * 0.88;  // 얼굴 앞면 Z

        const addFacePoint = (x, y, z, hex, bright) => {
            pts.push(x, y, z);
            this._hexColor(cols, hex, bright);
        };

        // ── 눈 (크고 아몬드 형, 애니 특유) ──
        const eyeXOff = sk.headW * 0.38;
        const eyeYPos = sk.eyeY;
        const eyeRx   = sk.headW * 0.22;   // 가로
        const eyeRy   = sk.headW * 0.14;   // 세로 (찌그러진 타원)

        [-1, 1].forEach(side => {
            const ecx = side * eyeXOff;

            // 홍채 채움
            for (let i = 0; i < 280; i++) {
                const a = Math.random()*Math.PI*2;
                const dist = Math.sqrt(Math.random());  // 원형 균등
                const ex = ecx + Math.cos(a)*eyeRx*dist*0.80;
                const ey = eyeYPos + Math.sin(a)*eyeRy*dist*0.72;
                // 아래 절반 더 채움 (아몬드 형태)
                if (ey > eyeYPos + eyeRy*0.70) continue;
                addFacePoint(ex, ey, faceZ*0.98, eyeColor, 0.85+Math.random()*0.15);
            }

            // 눈 윤곽선 (상단 곡선 — 두껍게)
            for (let i = 0; i < 120; i++) {
                const t = i/120;
                const a = Math.PI + t*Math.PI;  // 위쪽 반원
                const ex = ecx + Math.cos(a)*eyeRx;
                const ey = eyeYPos + Math.sin(a)*eyeRy * 0.55 + eyeRy*0.15;
                addFacePoint(ex + (Math.random()-0.5)*0.006, ey + (Math.random()-0.5)*0.005, faceZ, '#000022', 0.6+Math.random()*0.3);
            }

            // 눈 하이라이트 (흰 점)
            addFacePoint(ecx - eyeRx*0.35, eyeYPos + eyeRy*0.2, faceZ*1.02, '#ffffff', 0.95);
            addFacePoint(ecx - eyeRx*0.35 + 0.005, eyeYPos + eyeRy*0.22, faceZ*1.02, '#ffffff', 0.85);
            addFacePoint(ecx + eyeRx*0.22, eyeYPos - eyeRy*0.1, faceZ*1.02, '#ccffff', 0.70);

            // 속눈썹 위 (조금 짙게)
            for (let i = 0; i < 30; i++) {
                const t = (i/30 - 0.5)*2;
                addFacePoint(
                    ecx + t*eyeRx*1.1 + side*(t>0?0.005:0),
                    eyeYPos + eyeRy*0.55 + (Math.abs(t) > 0.7 ? -Math.abs(t)*0.015 : 0.010),
                    faceZ,
                    '#000033', 0.75
                );
            }

            // 눈썹 (위에 아치형)
            for (let i = 0; i < 40; i++) {
                const t = (i/40 - 0.5)*2;
                const bx = ecx + t*eyeRx*1.05;
                const by = sk.browY + Math.abs(t)*0.003 - 0.006;
                addFacePoint(bx + (Math.random()-0.5)*0.005, by + (Math.random()-0.5)*0.003, faceZ*0.97, '#001a33', 0.60+Math.random()*0.25);
            }
        });

        // ── 코 (작고 미니멀) ──
        const noseY = sk.noseY;
        const noseCx = 0, noseCz = faceZ * 0.99;
        // 콧날 라인
        for (let i = 0; i < 18; i++) {
            addFacePoint(noseCx + (Math.random()-0.5)*0.012, noseY + (Math.random()-0.5)*0.012, noseCz, '#00c8e8', 0.25+Math.random()*0.15);
        }
        // 콧구멍 힌트 (좌우)
        [-1, 1].forEach(side => {
            for (let i = 0; i < 8; i++) {
                addFacePoint(
                    noseCx + side*0.022 + (Math.random()-0.5)*0.008,
                    noseY - 0.010 + (Math.random()-0.5)*0.006,
                    noseCz, '#003a55', 0.35
                );
            }
        });

        // ── 입 ──
        const mouthY  = (sk.noseY + sk.chinY) * 0.48;
        const mouthW  = sk.headW * 0.26;
        // 윗입술
        for (let i = 0; i < 50; i++) {
            const t = (i/50 - 0.5)*2;
            const mx = t * mouthW;
            // 큐피드 보우 곡선
            const my = mouthY + (1-Math.abs(t))*0.006 + Math.abs(t)*t*0.008;
            addFacePoint(mx+(Math.random()-0.5)*0.006, my+(Math.random()-0.5)*0.003, faceZ*0.98, '#00c0d8', 0.50+Math.random()*0.20);
        }
        // 아랫입술 (볼록)
        for (let i = 0; i < 40; i++) {
            const t = (i/40 - 0.5)*2;
            const mx = t * mouthW * 0.88;
            const my = mouthY - 0.014 - (1-t*t)*0.008;
            addFacePoint(mx+(Math.random()-0.5)*0.006, my+(Math.random()-0.5)*0.003, faceZ*0.98, '#00b8cc', 0.40+Math.random()*0.20);
        }
        // 입꼬리
        [-1, 1].forEach(side => {
            addFacePoint(side*mouthW+(Math.random()-0.5)*0.004, mouthY+(Math.random()-0.5)*0.004, faceZ, '#00a0c0', 0.45);
        });

        // 볼 홍조 (아주 희미하게)
        [-1, 1].forEach(side => {
            for (let i = 0; i < 30; i++) {
                addFacePoint(
                    side*sk.headW*0.48+(Math.random()-0.5)*0.03,
                    sk.eyeY - sk.headW*0.18 + (Math.random()-0.5)*0.025,
                    faceZ*0.90,
                    '#ff6680', 0.08+Math.random()*0.06
                );
            }
        });

        // PART.HEAD에 병합 (얼굴 파트를 별도로 저장)
        const existing = this._parts[PART.HEAD];
        if (existing) {
            const geo = existing.geometry;
            const oldPos = geo.attributes.position.array;
            const oldCol = geo.attributes.color.array;
            const newPos = new Float32Array(oldPos.length + pts.length);
            const newCol = new Float32Array(oldCol.length + cols.length);
            newPos.set(oldPos); newPos.set(pts, oldPos.length);
            newCol.set(oldCol); newCol.set(cols, oldCol.length);
            this.scene.remove(existing); existing.geometry.dispose(); existing.material.dispose();
            this._makePart(PART.HEAD, newPos, newCol, 0.009);
        } else {
            this._makePart(PART.HEAD, new Float32Array(pts), new Float32Array(cols), 0.009);
        }
    }

    // ── 머리카락 (스켈레톤 기반) ─────────────────────────────────
    _buildHair(state, sk) {
        const { length, color, style } = state.hair;
        const pts = [], cols = [];
        const hcx = 0, hcy = sk.headCenterY, hcz = 0;
        const hrx = sk.headW * 1.08, hry = (sk.headTopY - sk.chinY) * 0.56 * 1.06, hrz = sk.headD * 1.06;
        const bright = () => 0.72 + Math.random()*0.28;

        // 두상 볼륨 (머리 위쪽 3/4만)
        for (let i = 0; i < 900 + (length*500|0); i++) {
            const a = Math.random()*Math.PI*2, e = Math.acos(2*Math.random()-1);
            const bx = Math.cos(a)*Math.sin(e)*hrx;
            const by = hcy + Math.cos(e)*hry;
            const bz = Math.sin(a)*Math.sin(e)*hrz;
            if (by < sk.eyeY) continue;  // 눈 아래는 머리카락 없음
            pts.push(bx, by, bz);
            this._hexColor(cols, color, bright());
        }

        // 흘러내리는 머리카락
        if (length > 0.1) {
            const strandCount = 900 + (length*1800|0);
            const isTwin  = style === 'twintails';
            const isPony  = style === 'ponytail';
            const isBraid = style === 'braid';

            for (let i = 0; i < strandCount; i++) {
                let baseX;
                if (isTwin)  baseX = (Math.random()>0.5?1:-1) * (0.14 + Math.random()*0.10);
                else if (isPony) baseX = (Math.random()-0.5)*0.06;
                else         baseX = (Math.random()-0.5)*hrx*1.8;

                const baseY = sk.neckTopY + (Math.random()-0.5)*0.04;
                const dropLen = length * 1.1 * sk.H * 0.45;
                const dropY   = baseY - Math.random()*dropLen;
                const waveX   = isBraid ? Math.sin((baseY-dropY)*8)*0.025 : (Math.random()-0.5)*0.035;
                const frontZ  = isPony ? hrz*0.5 + Math.random()*0.04 : -(Math.random()*hrz*0.55 + 0.04);
                pts.push(baseX + waveX, dropY, frontZ);
                this._hexColor(cols, color, bright());
            }
        }

        this._makePart(PART.HAIR, new Float32Array(pts), new Float32Array(cols), 0.0095);
    }

    // ── 의상 오버레이 ─────────────────────────────────────────────
    _buildOutfit(state, sk, pose) {
        const presetKey = state.outfit?.preset;
        const preset = OUTFIT_PRESETS[presetKey];
        if (!preset?.color) return;

        const pts = [], cols = [];
        const color = preset.color;

        // 상체 의상: 허리 ~ 어깨
        const torsoSecs = [
            { y: sk.hipY,      rx: sk.hipW*1.04,     rz: sk.hipW*0.92 },
            { y: sk.waistY,    rx: sk.waistW*1.08,   rz: sk.waistW*0.96 },
            { y: sk.bustY,     rx: sk.bustW*1.06,    rz: sk.bustDepth*1.06 },
            { y: sk.shoulderY, rx: sk.shoulderW*1.04, rz: sk.bustDepth*0.88 },
        ];
        torsoSecs.forEach(({ y, rx, rz }) => {
            for (let i = 0; i < 16; i++) {
                const a = (i/16)*Math.PI*2, surf = 1.04+Math.random()*0.06;
                pts.push(Math.cos(a)*rx*surf, y, Math.sin(a)*rz*surf);
                this._hexColor(cols, color, 0.55+Math.random()*0.35);
            }
        });

        // 스커트 / 하의 (hipY 아래)
        const skirtLen = presetKey === 'dress' || presetKey === 'white_dress' || presetKey === 'kimono' ? 0.95 : 0.5;
        for (let i = 0; i < 1200; i++) {
            const ty = sk.hipY - Math.random()*sk.H*skirtLen*0.38;
            if (ty < sk.footY) continue;
            const spreadAtY = sk.hipW + (sk.hipY - ty)/(sk.H*0.4) * sk.H*0.09;
            const a = Math.random()*Math.PI*2;
            const surf = 1.0 + Math.random()*0.12;
            pts.push(Math.cos(a)*spreadAtY*surf, ty, Math.sin(a)*spreadAtY*surf*0.7);
            this._hexColor(cols, color, 0.45+Math.random()*0.40);
        }

        this._makePart(PART.OUTFIT, new Float32Array(pts), new Float32Array(cols), 0.011);
    }

    // ── Points 객체 생성 ──────────────────────────────────────────
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
        const points = new THREE.Points(geo, mat);
        points.userData.partId = partId;
        if (tiltAngle && partId !== PART.HAIR && partId !== PART.HEAD)
            points.rotation.z = tiltAngle;
        this.scene.add(points);
        this._parts[partId] = points;
        return points;
    }

    // 기존 파트에 포인트 추가 (목처럼 몸통과 같은 파트로 관리)
    _appendPoints(newPts, newCols, partId, size, tiltAngle = 0) {
        const THREE = this.THREE;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(newPts, 3));
        geo.setAttribute('color',    new THREE.Float32BufferAttribute(newCols, 3));
        const mat = new THREE.PointsMaterial({
            size, vertexColors: true, blending: THREE.AdditiveBlending,
            transparent: true, opacity: 0.90, sizeAttenuation: true, depthWrite: false,
        });
        const points = new THREE.Points(geo, mat);
        points.userData.partId = partId;
        if (tiltAngle) points.rotation.z = tiltAngle;
        this.scene.add(points);
        // 별도 키로 저장 (덮어쓰지 않음)
        this._parts[`${partId}_neck`] = points;
    }

    // ── 배경 ──────────────────────────────────────────────────────
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

    // ── 태그 변경 ─────────────────────────────────────────────────
    onTagsChanged(tags) {
        const ns = this._defaultState();
        ns.unmapped = [];

        tags.forEach(({ token }) => {
            const envMap = ENV_TAG_MAP[token];
            if (envMap) {
                if (envMap.env)     ns.env.preset   = envMap.env;
                if (envMap.weather) ns.env.weather  = envMap.weather;
                if (envMap.timeOfDay !== undefined) ns.env.timeOfDay = envMap.timeOfDay;
            }
        });

        tags.forEach(({ token }) => {
            const m = TAG_MAP[token];
            if (m) {
                const [domain, prop] = m.ch.split('.');
                if (prop) { if (!ns[domain]) ns[domain]={}; ns[domain][prop]=m.v; }
                else ns[domain] = m.v;
            } else if (!ENV_TAG_MAP[token]) {
                const t = token.toLowerCase();
                if      (t.includes('long') && t.includes('hair'))  ns.hair.length = 1.0;
                else if (t.includes('short') && t.includes('hair')) ns.hair.length = 0.18;
                else if (t.includes('tall'))  ns.body.height = 1.10;
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
    }

    _updateCameraForState(state) {
        const angle = state.camera?.angle || 'front';
        if (angle === 'back')       this._orbit.theta = Math.PI;
        else if (angle === 'high')  { this._orbit.theta = 0; this._orbit.phi = Math.PI/10; }
        else if (angle === 'low')   { this._orbit.theta = 0; this._orbit.phi = Math.PI/2.2; }
        else                        this._orbit.theta = 0;

        const zoom = state.camera?.zoom ?? 1.0;
        this._orbit.radius = 4.2 * zoom;
        this.camera.fov = state.camera?.fov ?? 42;
        this.camera.updateProjectionMatrix();
        this._updateCameraPos();
    }

    _saveState(state) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(_) {}
    }

    // ── 이벤트 (마우스 중심: 좌클릭=선택, 우클릭=회전, 휠=줌) ───
    _bindEvents() {
        const el = this.renderer.domElement;
        const o  = this._orbit;

        el.addEventListener('contextmenu', e => e.preventDefault());

        el.addEventListener('mousedown', e => {
            if (e.button === 0) {
                o._sx = e.clientX; o._sy = e.clientY; o._lbDown = true;
            } else if (e.button === 2) {
                o.dragging = true; o._mode = 'rotate';
                o.lastX = e.clientX; o.lastY = e.clientY;
            } else if (e.button === 1) {
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
            } else if (o._mode === 'pan') {
                const scale = o.radius * 0.0012;
                const sinT = Math.sin(o.theta), cosT = Math.cos(o.theta);
                o._panX = (o._panX||0) - dx*scale*cosT;
                o._panY = (o._panY||0) + dy*scale;
            }
            this._updateCameraPos();
        });

        window.addEventListener('mouseup', e => {
            if (e.button === 0 && o._lbDown) {
                o._lbDown = false;
                if (Math.abs(e.clientX-o._sx)+Math.abs(e.clientY-o._sy) < 5)
                    this._handleClick(e);
            } else {
                o.dragging = false; o._mode = null;
            }
        });

        el.addEventListener('wheel', e => {
            o.radius = Math.max(1.2, Math.min(10, o.radius+e.deltaY*0.005));
            this._updateCameraPos();
            e.preventDefault();
        }, { passive: false });

        // 터치
        let lastDist = 0;
        el.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                o.dragging = true; o._mode = 'rotate';
                o.lastX = e.touches[0].clientX; o.lastY = e.touches[0].clientY;
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
                lastDist = d; this._updateCameraPos();
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

    // PART ID → callout id
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
        // userData.partId가 있는 모든 Points 대상
        const targets = Object.values(this._parts);
        const hits = this._raycaster.intersectObjects(targets);
        if (hits.length > 0) {
            const partId = hits[0].object.userData.partId;
            if (typeof window.__previzOnPartClick === 'function')
                window.__previzOnPartClick(partId, PART_NAME[partId], this.state, this);
            const calloutId = PrevizScene._PART_TO_CALLOUT[partId];
            if (calloutId && typeof window.__previzOpenCallout === 'function')
                window.__previzOpenCallout(calloutId);
        }
    }

    _updateCameraPos() {
        const o = this._orbit;
        const baseY = 0.95;  // 캐릭터 중심 (키의 약 절반)
        const px = o._panX || 0;
        const py = o._panY || 0;
        const sinT = Math.sin(o.theta), cosT = Math.cos(o.theta);
        const tx = px * cosT, tz = px * -sinT;
        const ty = baseY + py;

        this.camera.position.set(
            o.radius*Math.sin(o.phi)*sinT + tx,
            o.radius*Math.cos(o.phi) + ty,
            o.radius*Math.sin(o.phi)*cosT + tz,
        );
        this.camera.lookAt(tx, ty, tz);
    }

    _loop() {
        this.animId = requestAnimationFrame(() => this._loop());
        const t = performance.now()*0.0004;
        Object.values(this._parts).forEach((p, i) => {
            if (p.material) p.material.opacity = 0.82+Math.sin(t+i*0.5)*0.06;
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
