/**
 * previz-scene.js — 실시간 3D 캐릭터 프리뷰 (Blender/VRoid Studio 스타일)
 * MeshPhong 재질 + 스튜디오 조명 + 스켈레톤 기반 캐릭터
 * 포인트 클라우드/홀로그램 없음 — 실제 메시 지오메트리
 */

import { ENV_PRESETS, ENV_TAG_MAP, WeatherSystem } from './previz-env.js';

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const LS_KEY    = 'previz_state_v3';

// ── 포즈 프리셋 ───────────────────────────────────────────────────
const POSE_PRESETS = {
    stand:         { label:'서기',     lArmRot:[0,0,0.12],      rArmRot:[0,0,-0.12],     lLegRot:[0,0,0],    rLegRot:[0,0,0] },
    arms_up:       { label:'팔 들기',  lArmRot:[-1.4,0,0.25],   rArmRot:[-1.4,0,-0.25],  lLegRot:[0,0,0],    rLegRot:[0,0,0] },
    hands_on_hips: { label:'손 허리',  lArmRot:[0,0,0.55],      rArmRot:[0,0,-0.55],     lLegRot:[0,0,0.04], rLegRot:[0,0,-0.04] },
    crossed_arms:  { label:'팔짱',     lArmRot:[0.45,0,0.30],   rArmRot:[0.45,0,-0.30],  lLegRot:[0,0,0],    rLegRot:[0,0,0] },
    peace_sign:    { label:'브이',     lArmRot:[-1.2,0,0.20],   rArmRot:[0.15,0,-0.18],  lLegRot:[0,0,0.03], rLegRot:[0,0,-0.03] },
    sit:           { label:'앉기',     lArmRot:[0,0,0.20],      rArmRot:[0,0,-0.20],     lLegRot:[1.45,0,0], rLegRot:[1.45,0,0] },
    lean:          { label:'기대기',   lArmRot:[0,0,0.60],      rArmRot:[0.25,0,-0.18],  lLegRot:[0,0,0.06], rLegRot:[0,0,-0.06] },
};

// ── 의상 프리셋 ───────────────────────────────────────────────────
const OUTFIT_PRESETS = {
    none:           { label:'없음',       color: null,      skirtLen: 0 },
    school_uniform: { label:'교복',       color: 0x1133aa,  skirtLen: 0.28 },
    dress:          { label:'드레스',     color: 0xcc3366,  skirtLen: 0.55 },
    casual:         { label:'캐주얼',     color: 0x2d6a8f,  skirtLen: 0.20 },
    sportswear:     { label:'스포츠웨어', color: 0x228844,  skirtLen: 0.15 },
    gothic:         { label:'고딕',       color: 0x1a0022,  skirtLen: 0.50 },
    kimono:         { label:'기모노',     color: 0xaa2244,  skirtLen: 0.65 },
    white_dress:    { label:'흰 드레스',  color: 0xe8eef5,  skirtLen: 0.60 },
    maid:           { label:'메이드',     color: 0x1a1a3a,  skirtLen: 0.35 },
};

// ── 태그 → 씬 상태 매핑 ──────────────────────────────────────────
const TAG_MAP = {
    long_hair:          { ch:'hair.length',   v:1.0 },
    medium_hair:        { ch:'hair.length',   v:0.55 },
    short_hair:         { ch:'hair.length',   v:0.18 },
    very_long_hair:     { ch:'hair.length',   v:1.35 },
    blonde_hair:        { ch:'hair.color',    v:0xf5d060 },
    black_hair:         { ch:'hair.color',    v:0x181820 },
    brown_hair:         { ch:'hair.color',    v:0x7a4a1e },
    white_hair:         { ch:'hair.color',    v:0xe8eaf5 },
    pink_hair:          { ch:'hair.color',    v:0xff80b0 },
    silver_hair:        { ch:'hair.color',    v:0xc0c8d8 },
    red_hair:           { ch:'hair.color',    v:0xcc2200 },
    purple_hair:        { ch:'hair.color',    v:0x7722cc },
    blue_hair:          { ch:'hair.color',    v:0x2244dd },
    green_hair:         { ch:'hair.color',    v:0x22aa44 },
    orange_hair:        { ch:'hair.color',    v:0xee6622 },
    blue_eyes:          { ch:'eye.color',     v:0x2288ff },
    red_eyes:           { ch:'eye.color',     v:0xff2222 },
    green_eyes:         { ch:'eye.color',     v:0x22cc44 },
    purple_eyes:        { ch:'eye.color',     v:0x9933ff },
    brown_eyes:         { ch:'eye.color',     v:0x885522 },
    golden_eyes:        { ch:'eye.color',     v:0xddaa00 },
    petite:             { ch:'body.height',   v:0.88 },
    small:              { ch:'body.height',   v:0.88 },
    tall:               { ch:'body.height',   v:1.10 },
    large_breasts:      { ch:'body.chest',    v:1.38 },
    small_breasts:      { ch:'body.chest',    v:0.72 },
    ponytail:           { ch:'hair.style',    v:'ponytail' },
    twintails:          { ch:'hair.style',    v:'twintails' },
    braid:              { ch:'hair.style',    v:'braid' },
    hands_on_hips:      { ch:'pose',          v:'hands_on_hips' },
    peace_sign:         { ch:'pose',          v:'peace_sign' },
    crossed_arms:       { ch:'pose',          v:'crossed_arms' },
    arms_up:            { ch:'pose',          v:'arms_up' },
    close_up:           { ch:'camera.zoom',   v:0.55 },
    from_behind:        { ch:'camera.angle',  v:'back' },
    from_above:         { ch:'camera.angle',  v:'high' },
    from_below:         { ch:'camera.angle',  v:'low' },
    looking_at_viewer:  { ch:'camera.angle',  v:'front' },
    school_uniform:     { ch:'outfit.preset', v:'school_uniform' },
    dress:              { ch:'outfit.preset', v:'dress' },
    kimono:             { ch:'outfit.preset', v:'kimono' },
    maid:               { ch:'outfit.preset', v:'maid' },
};

// ── 바디파트 ID ───────────────────────────────────────────────────
export const PART = { HEAD:0, TORSO:1, L_ARM:2, R_ARM:3, L_LEG:4, R_LEG:5, HAIR:6, OUTFIT:7 };
export const PART_NAME = ['머리','몸통','왼팔','오른팔','왼다리','오른다리','머리카락','의상'];

// ── 스켈레톤 계산 ─────────────────────────────────────────────────
function buildSkeleton(state) {
    const H  = 2.0 * state.body.height;
    const CS = state.body.chest;

    // 애니 비율: 다리 53%, 상체 30%, 머리 17%
    const footY      = 0;
    const ankleY     = H * 0.042;
    const kneeY      = H * 0.272;
    const hipY       = H * 0.530;
    const waistY     = H * 0.618;
    const bustY      = H * 0.718;
    const shoulderY  = H * 0.790;
    const neckBotY   = H * 0.828;
    const neckTopY   = H * 0.860;
    const chinY      = H * 0.878;
    const noseY      = H * 0.912;
    const eyeY       = H * 0.932;
    const browY      = H * 0.952;
    const headTopY   = H * 1.000;
    const headCenterY= (chinY + headTopY) * 0.5;

    // 너비 (반경)
    const shoulderW = 0.162;
    const bustW     = 0.092 * Math.sqrt(CS);
    const bustDepth = 0.058 * CS;
    const waistW    = 0.052;
    const waistD    = 0.046;
    const hipW      = 0.112;
    const hipD      = 0.098;
    const thighW    = 0.054;
    const kneeW     = 0.036;
    const calfW     = 0.042;
    const ankleW    = 0.026;
    const upperArmW = 0.035;
    const foreArmW  = 0.028;
    const wristW    = 0.020;
    const headW     = 0.178;
    const headH     = (headTopY - chinY) * 0.56;
    const headD     = 0.158;
    const neckW     = 0.040;
    const neckD     = 0.036;

    return {
        H, CS,
        footY, ankleY, kneeY, hipY, waistY, bustY,
        shoulderY, neckBotY, neckTopY, chinY, noseY, eyeY, browY, headTopY, headCenterY,
        shoulderW, bustW, bustDepth, waistW, waistD, hipW, hipD,
        thighW, kneeW, calfW, ankleW,
        upperArmW, foreArmW, wristW,
        headW, headH, headD, neckW, neckD,
    };
}

// ── 튜브 메시 생성 (단면 배열 → 삼각형 메시) ─────────────────────
function buildTubeMesh(sections, THREE, radSegs = 14) {
    // sections: [{y, rx, rz, ox?, oz?}]
    const verts = [], uvs = [], idx = [];
    const n = sections.length;
    const R = radSegs;

    for (let si = 0; si < n; si++) {
        const { y, rx, rz, ox = 0, oz = 0 } = sections[si];
        for (let i = 0; i <= R; i++) {
            const a = (i / R) * Math.PI * 2;
            verts.push(ox + Math.cos(a)*rx, y, oz + Math.sin(a)*rz);
            uvs.push(i / R, si / (n - 1));
        }
    }

    for (let si = 0; si < n - 1; si++) {
        for (let i = 0; i < R; i++) {
            const a = si*(R+1)+i, b = a+1, c = a+R+1, d = c+1;
            idx.push(a, c, b,  b, c, d);
        }
    }

    // 상단/하단 캡
    const addCap = (si, flip) => {
        const { y, rx, rz, ox = 0, oz = 0 } = sections[si];
        const ci = verts.length / 3;
        verts.push(ox, y, oz); uvs.push(0.5, flip ? 0 : 1);
        for (let i = 0; i <= R; i++) {
            const a = (i/R)*Math.PI*2;
            verts.push(ox + Math.cos(a)*rx, y, oz + Math.sin(a)*rz);
            uvs.push(0.5+Math.cos(a)*0.5, 0.5+Math.sin(a)*0.5);
        }
        for (let i = 0; i < R; i++) {
            flip ? idx.push(ci, ci+1+i, ci+2+i) : idx.push(ci, ci+2+i, ci+1+i);
        }
    };
    addCap(0, true);
    addCap(n-1, false);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(verts), 3));
    geo.setAttribute('uv',       new THREE.Float32BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
}

export class PrevizScene {
    constructor(container) {
        this.container  = container;
        this.THREE      = null;
        this.renderer   = null;
        this.scene      = null;
        this.camera     = null;
        this.animId     = null;
        this._orbit     = { theta:0, phi:Math.PI/7, radius:4.0, _panX:0, _panY:0 };
        this._charGroup = null;   // 캐릭터 루트 그룹
        this._meshMap   = {};     // partId → [Mesh, ...]
        this._mats      = {};     // 공유 재질
        this._lights    = {};
        this._envMeshes = [];
        this._weather   = null;
        this._raycaster = null;
        this.state      = this._defaultState();
        this.onFrameTick= null;
    }

    _defaultState() {
        return {
            hair:   { length:0.85, color:0x1a1a20, style:'straight' },
            eye:    { color:0x4488ff },
            body:   { height:1.0, chest:1.0 },
            pose:   'stand',
            outfit: { preset:'none' },
            env:    { preset:'studio', weather:'clear', timeOfDay:0.5 },
            camera: { zoom:1.0, angle:'front', fov:40 },
            unmapped:[],
        };
    }

    // ── 초기화 ───────────────────────────────────────────────────
    async init() {
        this.THREE = await this._loadThree();
        const THREE = this.THREE;

        // 렌더러
        this.renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding || 3001;
        this._setSize();
        this.container.appendChild(this.renderer.domElement);

        // 씬
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1e26);

        // 카메라
        const [w, h] = [this.container.clientWidth, this.container.clientHeight];
        this.camera = new THREE.PerspectiveCamera(40, w/h, 0.01, 100);
        this._updateCameraPos();

        // 조명 (스튜디오)
        this._setupLights();

        // 스튜디오 환경
        this._buildStudio();

        // 날씨
        this._weather = new WeatherSystem(THREE, this.scene);

        // 저장 상태 복원
        try {
            const saved = JSON.parse(localStorage.getItem(LS_KEY));
            if (saved) this.state = { ...this._defaultState(), ...saved };
        } catch(_) {}

        // Raycaster
        this._raycaster = new THREE.Raycaster();

        // 캐릭터 빌드
        this._buildCharacter(this.state);
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

    // ── 스튜디오 조명 ─────────────────────────────────────────────
    _setupLights() {
        const THREE = this.THREE;

        // 앰비언트 (전체적인 기본 밝기)
        const ambient = new THREE.AmbientLight(0x334466, 0.65);
        this.scene.add(ambient);
        this._lights.ambient = ambient;

        // 키 라이트 (주조명 — 왼쪽 위 앞)
        const key = new THREE.DirectionalLight(0xfff4e8, 2.2);
        key.position.set(-3, 5, 4);
        key.castShadow = true;
        key.shadow.mapSize.width  = 1024;
        key.shadow.mapSize.height = 1024;
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far  = 20;
        key.shadow.camera.left = key.shadow.camera.bottom = -4;
        key.shadow.camera.right = key.shadow.camera.top = 4;
        key.shadow.bias = -0.001;
        this.scene.add(key);
        this._lights.key = key;

        // 필 라이트 (보조 — 오른쪽, 쿨톤)
        const fill = new THREE.DirectionalLight(0xd0e8ff, 0.85);
        fill.position.set(4, 3, 2);
        this.scene.add(fill);
        this._lights.fill = fill;

        // 림 라이트 (뒤에서 — 실루엣 강조)
        const rim = new THREE.DirectionalLight(0x8899cc, 0.55);
        rim.position.set(0, 3, -5);
        this.scene.add(rim);
        this._lights.rim = rim;

        // 하단 반사광
        const bounce = new THREE.HemisphereLight(0x667799, 0x443322, 0.40);
        this.scene.add(bounce);
        this._lights.bounce = bounce;
    }

    // ── 스튜디오 환경 (바닥 + 배경) ──────────────────────────────
    _buildStudio() {
        const THREE = this.THREE;

        // 스튜디오 바닥
        const floorGeo = new THREE.PlaneGeometry(16, 16);
        const floorMat = new THREE.MeshLambertMaterial({ color:0x15191f });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI/2;
        floor.receiveShadow = true;
        this.scene.add(floor);

        // 배경 사이클로라마 (곡면 배경)
        const cycGeo = new THREE.CylinderGeometry(8, 8, 10, 32, 1, true, -Math.PI*0.35, Math.PI*0.7);
        const cycMat = new THREE.MeshLambertMaterial({ color:0x1a1e26, side:THREE.BackSide });
        const cyc = new THREE.Mesh(cycGeo, cycMat);
        cyc.position.y = 3;
        this.scene.add(cyc);

        // 격자 (Blender 스타일 — 희미하게)
        const grid = new THREE.GridHelper(12, 24, 0x2a3040, 0x1e2530);
        this.scene.add(grid);
    }

    // ── 공유 재질 ─────────────────────────────────────────────────
    _getSkinMat() {
        const THREE = this.THREE;
        if (!this._mats.skin)
            this._mats.skin = new THREE.MeshPhongMaterial({
                color: 0xf0c8a8, shininess: 22, specular: 0x441100,
            });
        return this._mats.skin;
    }

    _getHairMat(color) {
        const THREE = this.THREE;
        if (!this._mats.hair || this._mats.hair._col !== color) {
            this._mats.hair?.dispose();
            this._mats.hair = new THREE.MeshPhongMaterial({ color, shininess:55, specular:0x888888 });
            this._mats.hair._col = color;
        }
        return this._mats.hair;
    }

    _getEyeMat(color) {
        const THREE = this.THREE;
        if (!this._mats.eye || this._mats.eye._col !== color) {
            this._mats.eye?.dispose();
            this._mats.eye = new THREE.MeshPhongMaterial({ color, shininess:120, specular:0xffffff, emissive:color, emissiveIntensity:0.15 });
            this._mats.eye._col = color;
        }
        return this._mats.eye;
    }

    // ── 캐릭터 전체 빌드 ──────────────────────────────────────────
    _buildCharacter(state) {
        // 기존 캐릭터 제거
        if (this._charGroup) {
            this.scene.remove(this._charGroup);
            this._disposeGroup(this._charGroup);
        }
        this._meshMap = {};

        const THREE = this.THREE;
        const sk    = buildSkeleton(state);
        const pose  = POSE_PRESETS[state.pose] || POSE_PRESETS.stand;

        this._charGroup = new THREE.Group();
        this.scene.add(this._charGroup);

        this._buildTorso(sk, state);
        this._buildLegs(sk, pose, state);
        this._buildArms(sk, pose, state);
        this._buildHead(sk, state);
        this._buildHair(sk, state);

        const outfitDef = OUTFIT_PRESETS[state.outfit?.preset];
        if (outfitDef?.color) this._buildOutfit(sk, state, outfitDef);

        this._saveState(state);
    }

    // ── 몸통 ──────────────────────────────────────────────────────
    _buildTorso(sk, state) {
        const THREE = this.THREE;
        const mat   = this._getSkinMat();

        // 몸통: 골반 → 어깨 (앞뒤 납작하게 scale.z)
        const torsoSecs = [
            { y: sk.hipY,      rx: sk.hipW,      rz: sk.hipD },
            { y: sk.hipY*1.02, rx: sk.hipW*1.05, rz: sk.hipD*1.02 },
            { y: sk.waistY*0.92, rx: sk.waistW*1.08, rz: sk.waistD*1.04 },
            { y: sk.waistY,    rx: sk.waistW,    rz: sk.waistD },
            { y: (sk.waistY+sk.bustY)*0.5, rx: (sk.waistW+sk.bustW)*0.5, rz: (sk.waistD+sk.bustDepth)*0.5 },
            { y: sk.bustY,     rx: sk.bustW,     rz: sk.bustDepth },
            { y: sk.bustY+(sk.shoulderY-sk.bustY)*0.4, rx: sk.bustW*0.95, rz: sk.bustDepth*0.78 },
            { y: sk.bustY+(sk.shoulderY-sk.bustY)*0.75, rx: sk.shoulderW*0.88, rz: sk.bustDepth*0.62 },
            { y: sk.shoulderY, rx: sk.shoulderW, rz: sk.bustDepth*0.52 },
            { y: sk.neckBotY,  rx: sk.neckW*1.4, rz: sk.neckD*1.3 },
        ];
        const torsoGeo = buildTubeMesh(torsoSecs, THREE, 16);
        const torsoMesh = new THREE.Mesh(torsoGeo, mat);
        torsoMesh.castShadow = true; torsoMesh.receiveShadow = true;
        torsoMesh.userData.partId = PART.TORSO;
        this._charGroup.add(torsoMesh);
        this._track(PART.TORSO, torsoMesh);

        // 목
        const neckSecs = [
            { y: sk.neckBotY, rx: sk.neckW*1.1, rz: sk.neckD*1.0 },
            { y: (sk.neckBotY+sk.neckTopY)*0.5, rx: sk.neckW, rz: sk.neckD*0.92 },
            { y: sk.neckTopY, rx: sk.neckW*0.92, rz: sk.neckD*0.88 },
            { y: sk.chinY,    rx: sk.neckW*0.88, rz: sk.neckD*0.85 },
        ];
        const neckGeo  = buildTubeMesh(neckSecs, THREE, 12);
        const neckMesh = new THREE.Mesh(neckGeo, mat);
        neckMesh.castShadow = true;
        neckMesh.userData.partId = PART.TORSO;
        this._charGroup.add(neckMesh);
        this._track(PART.TORSO, neckMesh);
    }

    // ── 다리 ──────────────────────────────────────────────────────
    _buildLegs(sk, pose, state) {
        const THREE = this.THREE;
        const mat   = this._getSkinMat();
        const isSit = state.pose === 'sit';

        [-1, 1].forEach(side => {
            const pId  = side < 0 ? PART.L_LEG : PART.R_LEG;
            const poseRot = side < 0 ? pose.lLegRot : pose.rLegRot;
            const ox   = side * (sk.hipW * 0.82);

            // 다리 그룹 (골반 위치 피봇)
            const legGroup = new THREE.Group();
            legGroup.position.set(ox, sk.hipY, 0);
            legGroup.rotation.set(...poseRot);
            legGroup.userData.partId = pId;
            this._charGroup.add(legGroup);
            this._track(pId, legGroup);

            // 허벅지: 그룹 로컬 좌표 (0,0,0)에서 아래로
            const thighLen = sk.kneeY - sk.hipY;
            const thighSecs = [
                { y: 0,           rx: sk.thighW*1.05, rz: sk.thighW*0.92 },
                { y: thighLen*0.3, rx: sk.thighW,     rz: sk.thighW*0.88 },
                { y: thighLen*0.7, rx: sk.thighW*0.85, rz: sk.thighW*0.78 },
                { y: thighLen,    rx: sk.kneeW*1.1,   rz: sk.kneeW*1.0 },
            ];
            const thighGeo  = buildTubeMesh(thighSecs, THREE, 12);
            const thighMesh = new THREE.Mesh(thighGeo, mat);
            thighMesh.castShadow = true;
            thighMesh.userData.partId = pId;
            legGroup.add(thighMesh);

            // 무릎 구
            const kneeGeo  = new THREE.SphereGeometry(sk.kneeW*1.05, 10, 8);
            const kneeMesh = new THREE.Mesh(kneeGeo, mat);
            kneeMesh.position.set(0, thighLen, 0);
            kneeMesh.userData.partId = pId;
            legGroup.add(kneeMesh);

            // 종아리 서브 그룹 (무릎 피봇)
            const calfGroup = new THREE.Group();
            calfGroup.position.set(0, thighLen, 0);
            calfGroup.userData.partId = pId;
            legGroup.add(calfGroup);

            // 앉기: 종아리 90도 꺾기
            if (isSit) calfGroup.rotation.x = -Math.PI * 0.55;

            const calfLen = sk.ankleY - sk.kneeY;
            const calfSecs = [
                { y: 0,          rx: sk.calfW,     rz: sk.calfW*0.90 },
                { y: calfLen*0.4, rx: sk.calfW*0.95, rz: sk.calfW*0.85 },
                { y: calfLen*0.75, rx: sk.calfW*0.78, rz: sk.calfW*0.72 },
                { y: calfLen,    rx: sk.ankleW*1.1, rz: sk.ankleW*1.0 },
            ];
            const calfGeo  = buildTubeMesh(calfSecs, THREE, 12);
            const calfMesh = new THREE.Mesh(calfGeo, mat);
            calfMesh.castShadow = true;
            calfMesh.userData.partId = pId;
            calfGroup.add(calfMesh);

            // 발
            const footGeo  = new THREE.BoxGeometry(sk.ankleW*1.6, sk.ankleW*0.7, sk.ankleW*2.8);
            const footMesh = new THREE.Mesh(footGeo, mat);
            footMesh.position.set(0, calfLen + sk.ankleW*0.25, -sk.ankleW*0.5);
            footMesh.userData.partId = pId;
            calfGroup.add(footMesh);
        });
    }

    // ── 팔 ────────────────────────────────────────────────────────
    _buildArms(sk, pose, state) {
        const THREE = this.THREE;
        const mat   = this._getSkinMat();

        [-1, 1].forEach(side => {
            const pId     = side < 0 ? PART.L_ARM : PART.R_ARM;
            const poseRot = side < 0 ? pose.lArmRot : pose.rArmRot;
            // 포즈 Z 회전을 side에 맞게 반전
            const rot = [...poseRot];
            rot[2] *= side;

            // 어깨 그룹
            const armGroup = new THREE.Group();
            armGroup.position.set(side * (sk.shoulderW + 0.02), sk.shoulderY, 0);
            armGroup.rotation.set(...rot);
            armGroup.userData.partId = pId;
            this._charGroup.add(armGroup);
            this._track(pId, armGroup);

            const upperLen = sk.H * 0.155;
            // 상완
            const upperSecs = [
                { y: 0,            rx: sk.upperArmW,       rz: sk.upperArmW*0.90 },
                { y: upperLen*0.5, rx: sk.upperArmW*0.95,  rz: sk.upperArmW*0.88 },
                { y: upperLen,     rx: sk.foreArmW*1.05,   rz: sk.foreArmW*1.0 },
            ];
            const upperGeo  = buildTubeMesh(upperSecs, THREE, 10);
            const upperMesh = new THREE.Mesh(upperGeo, mat);
            upperMesh.castShadow = true;
            upperMesh.userData.partId = pId;
            armGroup.add(upperMesh);

            // 팔꿈치 구
            const elbowGeo  = new THREE.SphereGeometry(sk.foreArmW*1.02, 8, 6);
            const elbowMesh = new THREE.Mesh(elbowGeo, mat);
            elbowMesh.position.set(0, upperLen, 0);
            armGroup.add(elbowMesh);

            // 전완 서브 그룹
            const foreGroup = new THREE.Group();
            foreGroup.position.set(0, upperLen, 0);
            foreGroup.userData.partId = pId;
            // 팔짱/peace_sign: 전완 꺾기
            if (state.pose === 'crossed_arms') foreGroup.rotation.x = -1.1;
            if (state.pose === 'peace_sign' && side < 0) foreGroup.rotation.x = -0.5;
            armGroup.add(foreGroup);

            const foreLen = sk.H * 0.138;
            const foreSecs = [
                { y: 0,          rx: sk.foreArmW,     rz: sk.foreArmW*0.88 },
                { y: foreLen*0.5, rx: sk.foreArmW*0.92, rz: sk.foreArmW*0.85 },
                { y: foreLen,    rx: sk.wristW*1.1,   rz: sk.wristW },
            ];
            const foreGeo  = buildTubeMesh(foreSecs, THREE, 10);
            const foreMesh = new THREE.Mesh(foreGeo, mat);
            foreMesh.castShadow = true;
            foreMesh.userData.partId = pId;
            foreGroup.add(foreMesh);

            // 손 (납작한 구)
            const handGeo  = new THREE.SphereGeometry(sk.wristW*1.3, 10, 8);
            const handMesh = new THREE.Mesh(handGeo, mat);
            handMesh.scale.set(1.4, 0.9, 0.7);
            handMesh.position.set(0, foreLen + sk.wristW*0.6, 0);
            foreGroup.add(handMesh);
        });
    }

    // ── 머리 ──────────────────────────────────────────────────────
    _buildHead(sk, state) {
        const THREE = this.THREE;
        const mat   = this._getSkinMat();

        // 두상 타원체
        const headGeo  = new THREE.SphereGeometry(sk.headW, 28, 22);
        const headMesh = new THREE.Mesh(headGeo, mat);
        headMesh.scale.set(1, sk.headH / sk.headW, sk.headD / sk.headW);
        headMesh.position.set(0, sk.headCenterY, 0);
        headMesh.castShadow = true;
        headMesh.userData.partId = PART.HEAD;
        this._charGroup.add(headMesh);
        this._track(PART.HEAD, headMesh);

        // 얼굴 피처
        this._buildFace(sk, state);
    }

    // ── 얼굴 (눈, 눈썹, 코, 입) — 애니 스타일 ────────────────────
    _buildFace(sk, state) {
        const THREE   = this.THREE;
        const faceZ   = sk.headD * 0.94;   // 얼굴 앞면 Z

        // 눈 (좌우)
        const eyeW  = sk.headW * 0.20;
        const eyeH  = sk.headW * 0.13;

        [-1, 1].forEach(side => {
            const ex = side * sk.headW * 0.38;
            const ey = sk.eyeY;
            const ez = faceZ;

            // 홍채 (타원 디스크)
            const irisGeo  = new THREE.CircleGeometry(eyeW*0.88, 20);
            const irisMat  = this._getEyeMat(state.eye.color);
            const irisMesh = new THREE.Mesh(irisGeo, irisMat);
            irisMesh.scale.set(1, eyeH/eyeW, 1);
            irisMesh.position.set(ex, ey, ez + 0.002);
            irisMesh.userData.partId = PART.HEAD;
            this._charGroup.add(irisMesh);
            this._track(PART.HEAD, irisMesh);

            // 동공 (검정 작은 원)
            const pupilGeo  = new THREE.CircleGeometry(eyeW*0.42, 16);
            const pupilMat  = new THREE.MeshBasicMaterial({ color:0x040408 });
            const pupilMesh = new THREE.Mesh(pupilGeo, pupilMat);
            pupilMesh.scale.set(1, eyeH/eyeW, 1);
            pupilMesh.position.set(ex, ey, ez + 0.004);
            this._charGroup.add(pupilMesh);
            this._track(PART.HEAD, pupilMesh);

            // 눈 하이라이트
            const hlGeo  = new THREE.CircleGeometry(eyeW*0.22, 8);
            const hlMat  = new THREE.MeshBasicMaterial({ color:0xffffff });
            const hlMesh = new THREE.Mesh(hlGeo, hlMat);
            hlMesh.position.set(ex - eyeW*0.28, ey + eyeH*0.25, ez + 0.006);
            this._charGroup.add(hlMesh);
            this._track(PART.HEAD, hlMesh);

            // 속눈썹 위 (두꺼운 호)
            const lashMat = new THREE.MeshBasicMaterial({ color:0x080818 });
            const lashGeo = new THREE.PlaneGeometry(eyeW*2.1, eyeH*0.28);
            const lashMesh = new THREE.Mesh(lashGeo, lashMat);
            lashMesh.position.set(ex, ey + eyeH*0.60, ez + 0.004);
            this._charGroup.add(lashMesh);
            this._track(PART.HEAD, lashMesh);

            // 눈썹
            const browMat  = new THREE.MeshBasicMaterial({ color:0x0a0a18 });
            const browGeo  = new THREE.PlaneGeometry(eyeW*1.9, eyeH*0.17);
            const browMesh = new THREE.Mesh(browGeo, browMat);
            browMesh.rotation.z = side * (-0.12);
            browMesh.position.set(ex, sk.browY, ez + 0.002);
            this._charGroup.add(browMesh);
            this._track(PART.HEAD, browMesh);
        });

        // 코 (미니멀)
        const noseMat = new THREE.MeshPhongMaterial({ color:0xe0b898, shininess:5 });
        const noseGeo = new THREE.SphereGeometry(sk.headW*0.048, 6, 5);
        const noseMesh = new THREE.Mesh(noseGeo, noseMat);
        noseMesh.scale.set(1, 0.5, 0.8);
        noseMesh.position.set(0, sk.noseY, faceZ * 1.02);
        this._charGroup.add(noseMesh);
        this._track(PART.HEAD, noseMesh);

        // 입
        const mouthW   = sk.headW * 0.24;
        const mouthY   = (sk.noseY + sk.chinY) * 0.47;
        const mouthMat = new THREE.MeshPhongMaterial({ color:0xd8788a, shininess:40, specular:0x553333 });

        // 윗입술 (작은 원뿔형 볼록)
        const upLipGeo  = new THREE.CapsuleGeometry ?
            new THREE.PlaneGeometry(mouthW*2, sk.headW*0.055) :
            new THREE.PlaneGeometry(mouthW*2, sk.headW*0.055);
        const upLipMesh = new THREE.Mesh(upLipGeo, mouthMat);
        upLipMesh.position.set(0, mouthY + sk.headW*0.025, faceZ + 0.003);
        this._charGroup.add(upLipMesh);
        this._track(PART.HEAD, upLipMesh);

        // 아랫입술
        const lowLipMat = new THREE.MeshPhongMaterial({ color:0xcc6878, shininess:55 });
        const lowLipGeo = new THREE.PlaneGeometry(mouthW*1.6, sk.headW*0.050);
        const lowLipMesh = new THREE.Mesh(lowLipGeo, lowLipMat);
        lowLipMesh.position.set(0, mouthY - sk.headW*0.028, faceZ + 0.003);
        this._charGroup.add(lowLipMesh);
        this._track(PART.HEAD, lowLipMesh);
    }

    // ── 머리카락 ──────────────────────────────────────────────────
    _buildHair(sk, state) {
        const THREE  = this.THREE;
        const { length, color, style } = state.hair;
        const mat    = this._getHairMat(color);

        const isTwin  = style === 'twintails';
        const isPony  = style === 'ponytail';
        const isBraid = style === 'braid';

        // 두상 캡 (머리 위쪽 볼륨)
        const capGeo  = new THREE.SphereGeometry(sk.headW * 1.06, 24, 16, 0, Math.PI*2, 0, Math.PI*0.58);
        const capMesh = new THREE.Mesh(capGeo, mat);
        capMesh.scale.set(1, (sk.headH/sk.headW)*1.05, sk.headD/sk.headW*1.04);
        capMesh.position.set(0, sk.headCenterY - sk.headH * 0.04, 0);
        capMesh.castShadow = true;
        capMesh.userData.partId = PART.HAIR;
        this._charGroup.add(capMesh);
        this._track(PART.HAIR, capMesh);

        // 앞머리 뱅 (앞에 드리우는 머리)
        const bangMat = mat;
        for (let i = -2; i <= 2; i++) {
            const bangGeo  = new THREE.PlaneGeometry(sk.headW*0.28, sk.headH*0.35 + length*0.04);
            const bangMesh = new THREE.Mesh(bangGeo, bangMat);
            bangMesh.position.set(
                i * sk.headW*0.32,
                sk.eyeY + sk.headH*0.12,
                sk.headD * 1.00,
            );
            bangMesh.rotation.x = 0.12;
            bangMesh.castShadow = true;
            bangMesh.userData.partId = PART.HAIR;
            this._charGroup.add(bangMesh);
            this._track(PART.HAIR, bangMesh);
        }

        if (length < 0.15) return;

        // 흘러내리는 머리카락
        const dropTop  = sk.neckTopY + 0.02;
        const dropLen  = length * sk.H * 0.46;
        const dropBot  = Math.max(sk.footY + 0.02, dropTop - dropLen);
        const height   = dropTop - dropBot;

        if (isTwin) {
            // 트윈테일: 좌우 각각 다발
            [-1, 1].forEach(side => {
                const tailGeo  = new THREE.CylinderGeometry(sk.headW*0.12, sk.headW*0.06, height, 10);
                const tailMesh = new THREE.Mesh(tailGeo, mat);
                tailMesh.position.set(
                    side * sk.headW*0.72,
                    dropTop - height*0.5,
                    -(sk.headD*0.3),
                );
                tailMesh.rotation.z = side * 0.15;
                tailMesh.castShadow = true;
                tailMesh.userData.partId = PART.HAIR;
                this._charGroup.add(tailMesh);
                this._track(PART.HAIR, tailMesh);
            });
        } else if (isPony) {
            // 포니테일: 뒤로 모임
            const tailGeo  = new THREE.CylinderGeometry(sk.headW*0.12, sk.headW*0.05, height, 10);
            const tailMesh = new THREE.Mesh(tailGeo, mat);
            tailMesh.position.set(0, dropTop - height*0.5, sk.headD*0.85);
            tailMesh.rotation.x = 0.30;
            tailMesh.castShadow = true;
            tailMesh.userData.partId = PART.HAIR;
            this._charGroup.add(tailMesh);
            this._track(PART.HAIR, tailMesh);
        } else {
            // 스트레이트 / 브레이드: 뒤로 흘러내림
            const strips = isBraid ? 3 : 4;
            for (let i = 0; i < strips; i++) {
                const ox  = (i/(strips-1) - 0.5) * sk.headW * 1.4;
                const geo = new THREE.PlaneGeometry(sk.headW * (0.38/strips*1.6), height);
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(ox, dropTop - height*0.5, -(sk.headD*0.78));
                mesh.rotation.y = Math.PI;
                if (isBraid) mesh.rotation.z = Math.sin(i*1.2)*0.12;
                mesh.castShadow = true;
                mesh.userData.partId = PART.HAIR;
                this._charGroup.add(mesh);
                this._track(PART.HAIR, mesh);
            }
        }
    }

    // ── 의상 오버레이 ─────────────────────────────────────────────
    _buildOutfit(sk, state, outfitDef) {
        const THREE = this.THREE;
        const mat   = new THREE.MeshPhongMaterial({
            color: outfitDef.color, shininess: 18, specular: 0x222222,
            transparent: true, opacity: 0.97,
        });

        // 상의 (몸통 살짝 크게)
        const topSecs = [
            { y: sk.waistY,    rx: sk.waistW*1.12,  rz: sk.waistD*1.10 },
            { y: sk.bustY,     rx: sk.bustW*1.10,   rz: sk.bustDepth*1.08 },
            { y: sk.shoulderY, rx: sk.shoulderW*1.06, rz: sk.bustDepth*0.75 },
            { y: sk.neckBotY,  rx: sk.neckW*1.5,    rz: sk.neckD*1.4 },
        ];
        const topGeo  = buildTubeMesh(topSecs, THREE, 16);
        const topMesh = new THREE.Mesh(topGeo, mat);
        topMesh.castShadow = true;
        topMesh.userData.partId = PART.OUTFIT;
        this._charGroup.add(topMesh);
        this._track(PART.OUTFIT, topMesh);

        // 스커트 / 하의 (플레어 원뿔)
        const skirtLen = outfitDef.skirtLen * sk.H * 0.45;
        if (skirtLen > 0.01) {
            const skirtBot = Math.max(sk.footY + 0.02, sk.hipY - skirtLen);
            const flare = sk.hipW * 1.0 + (sk.hipY - skirtBot) * 0.28;
            const skirtSecs = [
                { y: sk.hipY,       rx: sk.hipW*1.08,  rz: sk.hipD*1.04 },
                { y: (sk.hipY+skirtBot)*0.6, rx: sk.hipW*1.18+flare*0.3, rz: sk.hipD*1.15+flare*0.25 },
                { y: skirtBot,      rx: sk.hipW*1.18+flare, rz: sk.hipD*1.10+flare*0.85 },
            ];
            const skirtGeo  = buildTubeMesh(skirtSecs, THREE, 20);
            const skirtMesh = new THREE.Mesh(skirtGeo, mat);
            skirtMesh.castShadow = true;
            skirtMesh.userData.partId = PART.OUTFIT;
            this._charGroup.add(skirtMesh);
            this._track(PART.OUTFIT, skirtMesh);
        }
    }

    // ── 파트 추적 ─────────────────────────────────────────────────
    _track(partId, obj) {
        if (!this._meshMap[partId]) this._meshMap[partId] = [];
        this._meshMap[partId].push(obj);
    }

    _disposeGroup(group) {
        group.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
    }

    // ── 환경 (조명 색온도 + 환경 변경) ───────────────────────────
    _applyEnv(envState) {
        const THREE = this.THREE;
        const preset = ENV_PRESETS[envState.preset] || ENV_PRESETS.park;

        // 배경색 변경
        if (this.scene.background) this.scene.background.setHex(preset.fogColor);

        // 조명 색온도를 환경에 맞게 조정
        const tod = envState.timeOfDay ?? 0.5;
        this._applyTimeOfDay(tod);

        this._weather?.setWeather(envState.weather);
    }

    _applyTimeOfDay(t) {
        const THREE = this.THREE;
        const L = this._lights;
        if (!L.key) return;

        // t: 0=새벽, 0.25=아침, 0.5=낮, 0.75=저녁, 1=밤
        if (t < 0.25) {
            // 새벽 — 차갑고 어두움
            L.key.color.setHex(0x8899cc); L.key.intensity = 0.8;
            L.fill.color.setHex(0x334466); L.fill.intensity = 0.4;
            if (this.scene.background) this.scene.background.setHex(0x0a0f1a);
        } else if (t < 0.5) {
            // 아침 — 따뜻한 골든아워
            const s = (t-0.25)/0.25;
            L.key.color.setHex(0xffddaa); L.key.intensity = 1.5 + s*0.7;
            L.fill.color.setHex(0xaabbdd); L.fill.intensity = 0.6 + s*0.25;
            if (this.scene.background) this.scene.background.setHex(0x1a2030);
        } else if (t < 0.75) {
            // 낮 — 밝고 중립
            L.key.color.setHex(0xfff5e8); L.key.intensity = 2.2;
            L.fill.color.setHex(0xd0e8ff); L.fill.intensity = 0.85;
            if (this.scene.background) this.scene.background.setHex(0x1a1e26);
        } else {
            // 저녁/밤 — 오렌지/딥블루
            const s = (t-0.75)/0.25;
            L.key.color.setHex(0xff9944); L.key.intensity = 1.2 - s*0.8;
            L.fill.color.setHex(0x2244aa); L.fill.intensity = 0.5 - s*0.2;
            if (this.scene.background) this.scene.background.setHex(0x080c14);
        }
    }

    // ── 태그 변경 → 씬 업데이트 ──────────────────────────────────
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
                if      (t.includes('long')  && t.includes('hair')) ns.hair.length = 1.0;
                else if (t.includes('short') && t.includes('hair')) ns.hair.length = 0.18;
                else if (t.includes('tall'))  ns.body.height = 1.10;
                else if (t.includes('petite')) ns.body.height = 0.88;
                else ns.unmapped.push(token);
            }
        });

        this.state = ns;
        this._applyEnv(ns.env);
        this._buildCharacter(ns);
        this._updateCameraForState(ns);

        if (typeof window.__previzUpdateUnmapped === 'function')
            window.__previzUpdateUnmapped(ns.unmapped);
    }

    _updateCameraForState(state) {
        const angle = state.camera?.angle || 'front';
        if (angle === 'back')      this._orbit.theta = Math.PI;
        else if (angle === 'high') { this._orbit.theta = 0; this._orbit.phi = Math.PI/12; }
        else if (angle === 'low')  { this._orbit.theta = 0; this._orbit.phi = Math.PI/2.1; }
        else                       this._orbit.theta = 0;

        this._orbit.radius = 4.0 * (state.camera?.zoom ?? 1.0);
        this.camera.fov    = state.camera?.fov ?? 40;
        this.camera.updateProjectionMatrix();
        this._updateCameraPos();
    }

    _saveState(state) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(_) {}
    }

    // ── 마우스 이벤트 ─────────────────────────────────────────────
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
                o.phi = Math.max(0.04, Math.min(Math.PI*0.62, o.phi+dy*0.006));
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
            o.radius = Math.max(1.2, Math.min(12, o.radius+e.deltaY*0.005));
            this._updateCameraPos();
            e.preventDefault();
        }, { passive:false });

        // 터치
        let lastDist = 0;
        el.addEventListener('touchstart', e => {
            if (e.touches.length===1) {
                o.dragging=true; o._mode='rotate';
                o.lastX=e.touches[0].clientX; o.lastY=e.touches[0].clientY;
                o._sx=o.lastX; o._sy=o.lastY;
            } else if (e.touches.length===2) {
                o.dragging=false;
                lastDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
            }
        }, { passive:true });
        el.addEventListener('touchmove', e => {
            if (e.touches.length===1 && o.dragging) {
                const dx=e.touches[0].clientX-o.lastX, dy=e.touches[0].clientY-o.lastY;
                o.lastX=e.touches[0].clientX; o.lastY=e.touches[0].clientY;
                o.theta -= dx*0.008;
                o.phi = Math.max(0.04, Math.min(Math.PI*0.62, o.phi+dy*0.006));
                this._updateCameraPos();
            } else if (e.touches.length===2) {
                const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
                o.radius=Math.max(1.2, Math.min(12, o.radius-(d-lastDist)*0.01));
                lastDist=d; this._updateCameraPos();
            }
            e.preventDefault();
        }, { passive:false });
        el.addEventListener('touchend', e => {
            if (o.dragging && e.changedTouches.length>0) {
                const t=e.changedTouches[0];
                if (Math.abs(t.clientX-o._sx)+Math.abs(t.clientY-o._sy)<10) this._handleClick(t);
            }
            o.dragging=false;
        });
    }

    static _PART_TO_CALLOUT = {
        [0]:'face', [1]:'upper', [2]:'pose', [3]:'pose',
        [4]:'lower', [5]:'lower', [6]:'hair', [7]:'upper',
    };

    _handleClick(e) {
        if (!this._raycaster) return;
        const THREE = this.THREE;
        const rect  = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX-rect.left)/rect.width)*2-1,
            -((e.clientY-rect.top)/rect.height)*2+1,
        );
        this._raycaster.setFromCamera(mouse, this.camera);

        // 캐릭터 그룹 내 모든 Mesh 대상
        const targets = [];
        if (this._charGroup) this._charGroup.traverse(o => { if (o.isMesh) targets.push(o); });
        const hits = this._raycaster.intersectObjects(targets, false);

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
        const baseY = 1.0;  // 캐릭터 중심 높이
        const px = o._panX || 0;
        const py = o._panY || 0;
        const sinT = Math.sin(o.theta), cosT = Math.cos(o.theta);
        const tx = px*cosT, tz = px*(-sinT);
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
        this.renderer.render(this.scene, this.camera);
        this.onFrameTick?.();
    }

    resize() {
        if (!this.renderer || !this.camera) return;
        this._setSize();
        const w=this.container.clientWidth, h=this.container.clientHeight;
        this.camera.aspect = w/h;
        this.camera.updateProjectionMatrix();
    }
    _setSize() {
        const w=this.container.clientWidth||window.innerWidth;
        const h=this.container.clientHeight||window.innerHeight;
        this.renderer.setSize(w, h);
    }

    dispose() {
        if (this.animId) cancelAnimationFrame(this.animId);
        this._weather?.dispose();
        if (this._charGroup) { this.scene.remove(this._charGroup); this._disposeGroup(this._charGroup); }
        if (this.renderer)   { this.renderer.dispose(); this.renderer.domElement.remove(); }
    }
}
