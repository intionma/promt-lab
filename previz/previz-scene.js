/**
 * previz-scene.js — 실시간 VRM 아니메 캐릭터 프리뷰 (VRoid 품질)
 * three + @pixiv/three-vrm 기반. MToon 토온 셰이딩 유지 + 홀로그램 오버레이.
 * 태그 → 머티리얼 색 / 표정 블렌드셰이프 / 휴머노이드 본 포즈 / 체형 / 배경.
 *
 * 기본 아바타는 pixiv three-vrm 샘플을 핫링크로 사용(재배포 아님).
 * 운영 시에는 소유/라이선스된 VRM으로 교체하세요. (BASE_VRM_URLS 참고)
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

import { WeatherSystem } from './previz-env.js';

const LS_KEY = 'previz_state_v4';

// 기본 아바타 후보 (순서대로 폴백). 런타임에 평가 (window.__PREVIZ_VRM_URL 오버라이드 지원)
// window.__PREVIZ_VRM_URL 로 자기 소유 VRM 모델을 지정하면 최우선 사용됩니다.
const DEFAULT_VRM_URLS = [
    'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
    'https://raw.githubusercontent.com/pixiv/three-vrm/dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
];
function getVrmUrls() {
    const override = (typeof window !== 'undefined' && window.__PREVIZ_VRM_URL) || null;
    return [override, ...DEFAULT_VRM_URLS].filter(Boolean);
}

// ── 바디파트 ─────────────────────────────────────────────────────
export const PART = { HEAD:0, TORSO:1, L_ARM:2, R_ARM:3, L_LEG:4, R_LEG:5, HAIR:6, OUTFIT:7 };
export const PART_NAME = ['머리','몸통','왼팔','오른팔','왼다리','오른다리','머리카락','의상'];

// ── 색상 프리셋 (머티리얼 틴트) ──────────────────────────────────
const HAIR_COLORS = {
    blonde_hair:0xf3d27a, brown_hair:0x8a5a32, black_hair:0x6b6b78,
    white_hair:0xeef0f6, pink_hair:0xff9ec4, silver_hair:0xcfd6e4,
    red_hair:0xe06a4a, purple_hair:0xb583e6, blue_hair:0x7da4ee,
    green_hair:0x86d29a, orange_hair:0xffa257,
};
const EYE_COLORS = {
    blue_eyes:0x6fa8ff, red_eyes:0xff6a6a, green_eyes:0x66cf80,
    purple_eyes:0xb07bff, brown_eyes:0xb98a5a, golden_eyes:0xe6c25a,
    heterochromia:0x8fb0ff,   // 오드아이(근사 단색)
};
const SKIN_TONES = {
    pale_skin:0xfff2ee, fair_skin:0xffe7da, normal:0xffffff,
    tanned:0xd9a878, tanned_skin:0xd9a878, dark_skin:0xb07d52,
};
const OUTFIT_COLORS = {
    school_uniform:0x4a5b8f, business_suit:0x3a3f4a, office_lady:0x3a3f4a,
    oversized_hoodie:0x9aa4b2, sweater:0xb98a5a, 't-shirt':0xe8eef3,
    casual:0x6aa0c0, casual_clothes:0x8fb6d9, dress:0xd06a8e, sundress:0xffe0ec,
    sportswear:0x4caa6a, gothic:0x4a3550, kimono:0xc05068, maid:0x3a3f6a,
    white_dress:0xeef2f7, 'one-piece_swimsuit':0x223a6a, bikini:0xff7aa8,
};

// ── 표정 → 블렌드셰이프 ──────────────────────────────────────────
const EXPRESSION_MAP = {
    smile:'happy', happy:'happy', grin:'happy',
    gentle_smile:'happy', laughing:'happy', smirk:'relaxed',
    tears:'sad', crying:'sad', sad:'sad', pout:'angry',
    open_mouth:'aa', parted_lips:'aa', serious:'neutral', closed_mouth:'neutral',
    angry:'angry', surprised:'surprised', relaxed:'relaxed',
};

// ── 포즈 → 휴머노이드 본 회전 (정규화 본 로컬, [x,y,z] rad) ───────
// VRM 기본은 T포즈. stand에서 팔을 내려 A포즈로.
const POSE_PRESETS = {
    stand:        { lUpperArm:[0,0,-1.18], rUpperArm:[0,0,1.18] },
    standing:     { lUpperArm:[0,0,-1.18], rUpperArm:[0,0,1.18] },
    arms_up:      { lUpperArm:[0,0,1.4],   rUpperArm:[0,0,-1.4] },
    hands_on_hips:{ lUpperArm:[0.25,0,-0.78], rUpperArm:[0.25,0,0.78], lLowerArm:[0,-2.15,0], rLowerArm:[0,2.15,0] },
    crossed_arms: { lUpperArm:[-0.28,0,-1.12], rUpperArm:[-0.28,0,1.12], lLowerArm:[0,-2.45,0], rLowerArm:[0,2.45,0] },
    peace_sign:   { lUpperArm:[0,0,-1.15], rUpperArm:[0,0,-1.35], rLowerArm:[0,-0.3,0] },
    sit:          { lUpperArm:[0,0,-1.0],  rUpperArm:[0,0,1.0], lUpperLeg:[-1.5,0,0.05], rUpperLeg:[-1.5,0,-0.05], lLowerLeg:[1.6,0,0], rLowerLeg:[1.6,0,0] },
    sitting:      { lUpperArm:[0,0,-1.0],  rUpperArm:[0,0,1.0], lUpperLeg:[-1.5,0,0.05], rUpperLeg:[-1.5,0,-0.05], lLowerLeg:[1.6,0,0], rLowerLeg:[1.6,0,0] },
    lying_on_back:{ lUpperArm:[0,0,-1.25], rUpperArm:[0,0,1.25], _rootRotX:-1.05, _rootY:0.55 },
    lean:         { lUpperArm:[0,0,-1.15], rUpperArm:[0,0,1.15], _rootRotZ:0.08 },
    leaning_forward:{ lUpperArm:[0,0,-1.1], rUpperArm:[0,0,1.1], _rootRotX:0.32 },
    squatting:    { lUpperArm:[0,0,-1.05], rUpperArm:[0,0,1.05], lUpperLeg:[-1.7,0,0.12], rUpperLeg:[-1.7,0,-0.12], lLowerLeg:[2.2,0,0], rLowerLeg:[2.2,0,0], _rootY:-0.5 },
    kneeling:     { lUpperArm:[0,0,-1.05], rUpperArm:[0,0,1.05], lUpperLeg:[-1.35,0,0.06], rUpperLeg:[-1.35,0,-0.06], lLowerLeg:[2.7,0,0], rLowerLeg:[2.7,0,0], _rootY:-0.42 },
    walking:      { lUpperArm:[0.55,0,-1.05], rUpperArm:[-0.55,0,1.05], lUpperLeg:[-0.5,0,0], rUpperLeg:[0.5,0,0], lLowerLeg:[0.55,0,0] },
    arms_behind_head:{ lUpperArm:[-0.15,0,1.05], rUpperArm:[-0.15,0,-1.05], lLowerArm:[0,2.7,0], rLowerArm:[0,-2.7,0] },
    hand_on_own_cheek:{ lUpperArm:[0,0,-1.18], rUpperArm:[0,0,0.45], rLowerArm:[0,2.2,0] },
    waving:       { lUpperArm:[0,0,-1.18], rUpperArm:[0,0,-2.2], rLowerArm:[0,-0.5,0] },
};

// ── 태그 → 채널 매핑 (DB 기본 태그 전부 포함) ────────────────────
const TAG_MAP = {
    // 헤어 컬러
    blonde_hair:['hair.color'], brown_hair:['hair.color'], black_hair:['hair.color'],
    white_hair:['hair.color'], pink_hair:['hair.color'], silver_hair:['hair.color'],
    red_hair:['hair.color'], purple_hair:['hair.color'], blue_hair:['hair.color'],
    green_hair:['hair.color'], orange_hair:['hair.color'],
    // 눈동자
    blue_eyes:['eye.color'], red_eyes:['eye.color'], green_eyes:['eye.color'],
    purple_eyes:['eye.color'], brown_eyes:['eye.color'], golden_eyes:['eye.color'],
    heterochromia:['eye.color'],
    // 피부
    pale_skin:['skin.tone'], fair_skin:['skin.tone'], tanned:['skin.tone'],
    tanned_skin:['skin.tone'], dark_skin:['skin.tone'],
    // 표정
    smile:['expression'], gentle_smile:['expression'], laughing:['expression'],
    smirk:['expression'], pout:['expression'], parted_lips:['expression'],
    tears:['expression'], crying:['expression'], open_mouth:['expression'],
    serious:['expression'], angry:['expression'], surprised:['expression'],
    // 체형
    petite:['body.size'], small:['body.size'], tall:['body.size'], skinny:['body.size'],
    slim:['body.size'], slender:['body.size'], curvy:['body.size'], athletic:['body.size'],
    // 포즈 / 제스처
    standing:['pose'], sitting:['pose'], lying_on_back:['pose'], sit:['pose'], stand:['pose'],
    squatting:['pose'], kneeling:['pose'], walking:['pose'], leaning_forward:['pose'], lean:['pose'],
    hands_on_hips:['pose'], peace_sign:['pose'], crossed_arms:['pose'], arms_up:['pose'],
    arms_behind_head:['pose'], hand_on_own_cheek:['pose'], waving:['pose'],
    // 카메라
    close_up:['camera'], portrait:['camera'], upper_body:['camera'], cowboy_shot:['camera'],
    full_body:['camera'], from_behind:['camera'], from_above:['camera'], from_below:['camera'],
    from_side:['camera'], dutch_angle:['camera'], pov:['camera'], looking_at_viewer:['camera'],
    // 의상 (색 틴트)
    school_uniform:['outfit'], business_suit:['outfit'], office_lady:['outfit'],
    oversized_hoodie:['outfit'], sweater:['outfit'], 't-shirt':['outfit'],
    casual:['outfit'], casual_clothes:['outfit'], dress:['outfit'], sundress:['outfit'],
    sportswear:['outfit'], gothic:['outfit'], kimono:['outfit'], maid:['outfit'],
    white_dress:['outfit'], 'one-piece_swimsuit':['outfit'], bikini:['outfit'],
    // 배경/환경
    indoors:['env'], outdoors:['env'], bedroom:['env'], classroom:['env'], cafe:['env'],
    office:['env'], library:['env'], stage:['env'], nature:['env'], forest:['env'],
    beach:['env'], mountains:['env'], city:['env'], street:['env'], garden:['env'],
    cyberpunk_city:['env'],
    simple_background:['bg'], detailed_background:['bg'], white_background:['bg'],
    black_background:['bg'], grey_background:['bg'], gradient_background:['bg'],
    studio_backdrop:['bg'], solid_color:['bg'],
    // 시간/날씨
    daytime:['time'], day:['time'], night:['time'], sunset:['time'], golden_hour:['time'],
    starry_sky:['time'], raining:['weather'], rain:['weather'], clear_sky:['weather'], snow:['weather'],
    // 조명
    cinematic_lighting:['light'], soft_lighting:['light'], natural_lighting:['light'],
    rim_lighting:['light'], backlighting:['light'], studio_lighting:['light'],
    neon_lighting:['light'], neon_lights:['light'], god_rays:['light'], sunbeam:['light'],
    // 파티클
    falling_petals:['particle'], wind:['particle'], water_drops:['particle'],
    floating_hair:['particle'], glowing_lights:['particle'], sparks:['particle'],
};

// ── 프로시저럴 소품 (VRM에 없는 헤어/의상/액세서리를 도형으로 생성) ──
// 외부 에셋 없이 Three.js 프리미티브로 만들어 휴머노이드 본에 부착.
// def: { bone, build, pos:[x,y,z](본 로컬), rot?, tint?('hair'|'outfit'), dark? }
const PROP_DEFS = {
    glasses:       { bone:'head', build:'glasses',    pos:[0,0.03,0.085] },
    sunglasses:    { bone:'head', build:'glasses',    pos:[0,0.03,0.085], dark:true },
    cat_ears:      { bone:'head', build:'catEars',    pos:[0,0.19,0.0],  tint:'hair' },
    dog_ears:      { bone:'head', build:'dogEars',    pos:[0,0.15,0.03], tint:'hair' },
    hat:           { bone:'head', build:'hat',        pos:[0,0.18,0] },
    hair_ribbon:   { bone:'head', build:'ribbon',     pos:[0.09,0.14,0.02], tint:'hair' },
    headphones:    { bone:'head', build:'headphones', pos:[0,0.08,0] },
    choker:        { bone:'neck', build:'choker',     pos:[0,0.02,0.01] },
    collar:        { bone:'neck', build:'choker',     pos:[0,0.02,0.01] },
    ponytail:      { bone:'head', build:'ponytail',   pos:[0,0.0,-0.085], tint:'hair' },
    twintails:     { bone:'head', build:'twintails',  pos:[0,0.02,0],     tint:'hair' },
    skirt:         { bone:'hips', build:'skirt',      pos:[0,-0.05,0],  tint:'outfit' },
    pleated_skirt: { bone:'hips', build:'skirt',      pos:[0,-0.05,0],  tint:'outfit', pleated:true },
};

const PROP_BUILDERS = {
    glasses(THREE, def) {
        const g = new THREE.Group();
        const frame = new THREE.MeshStandardMaterial({ color: def.dark ? 0x101014 : 0x2a2a33, metalness:0.4, roughness:0.4 });
        const lens = new THREE.TorusGeometry(0.026, 0.005, 8, 20);
        const l1 = new THREE.Mesh(lens, frame); l1.position.x = -0.03;
        const l2 = new THREE.Mesh(lens, frame); l2.position.x =  0.03;
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.016,0.004,0.004), frame);
        g.add(l1, l2, bridge);
        if (def.dark) {
            const dm = new THREE.MeshStandardMaterial({ color:0x05060a, metalness:0.6, roughness:0.15 });
            const d = new THREE.CircleGeometry(0.024, 18);
            const d1 = new THREE.Mesh(d, dm); d1.position.set(-0.03,0,0.002);
            const d2 = new THREE.Mesh(d, dm); d2.position.set( 0.03,0,0.002);
            g.add(d1, d2);
        }
        return g;
    },
    catEars(THREE) {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color:0xffffff, roughness:0.7 });
        const geo = new THREE.ConeGeometry(0.035, 0.075, 4);
        const e1 = new THREE.Mesh(geo, mat); e1.position.set(-0.058,0,0); e1.rotation.z = 0.28;
        const e2 = new THREE.Mesh(geo, mat); e2.position.set( 0.058,0,0); e2.rotation.z = -0.28;
        g.add(e1, e2); return g;
    },
    dogEars(THREE) {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color:0xffffff, roughness:0.8 });
        const geo = new THREE.CapsuleGeometry(0.022, 0.06, 4, 8);
        const e1 = new THREE.Mesh(geo, mat); e1.position.set(-0.075,-0.02,0); e1.rotation.z = 0.9;  e1.scale.z = 0.5;
        const e2 = new THREE.Mesh(geo, mat); e2.position.set( 0.075,-0.02,0); e2.rotation.z = -0.9; e2.scale.z = 0.5;
        g.add(e1, e2); return g;
    },
    hat(THREE) {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color:0x33384a, roughness:0.7 });
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.085,0.09,0.05,20), mat);
        const brim  = new THREE.Mesh(new THREE.CylinderGeometry(0.125,0.125,0.008,20), mat); brim.position.y = -0.025;
        g.add(crown, brim); return g;
    },
    ribbon(THREE) {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color:0xff7aa8, roughness:0.6 });
        const box = new THREE.BoxGeometry(0.05,0.03,0.012);
        const a = new THREE.Mesh(box, mat); a.position.x = -0.026; a.rotation.z = 0.4;
        const b = new THREE.Mesh(box, mat); b.position.x =  0.026; b.rotation.z = -0.4;
        const knot = new THREE.Mesh(new THREE.BoxGeometry(0.014,0.018,0.016), mat);
        g.add(a, b, knot); return g;
    },
    headphones(THREE) {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color:0x1c1e26, roughness:0.5, metalness:0.3 });
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.009, 8, 24, Math.PI), mat);
        const cupGeo = new THREE.CylinderGeometry(0.028,0.028,0.02,16);
        const c1 = new THREE.Mesh(cupGeo, mat); c1.position.set(-0.092,0,0); c1.rotation.z = Math.PI/2;
        const c2 = new THREE.Mesh(cupGeo, mat); c2.position.set( 0.092,0,0); c2.rotation.z = Math.PI/2;
        g.add(band, c1, c2); return g;
    },
    choker(THREE) {
        const mat = new THREE.MeshStandardMaterial({ color:0x15151a, roughness:0.5 });
        const m = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.008, 8, 22), mat);
        m.rotation.x = Math.PI/2; return m;
    },
    ponytail(THREE) {
        const mat = new THREE.MeshStandardMaterial({ color:0x6b5a48, roughness:0.75 });
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.012,0.24,10), mat);
        m.position.y = -0.10; m.rotation.x = -0.35; return m;
    },
    twintails(THREE) {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color:0x6b5a48, roughness:0.75 });
        const geo = new THREE.CylinderGeometry(0.024,0.01,0.2,10);
        const t1 = new THREE.Mesh(geo, mat); t1.position.set(-0.088,-0.06,0); t1.rotation.z = 0.2;
        const t2 = new THREE.Mesh(geo, mat); t2.position.set( 0.088,-0.06,0); t2.rotation.z = -0.2;
        g.add(t1, t2); return g;
    },
    skirt(THREE, def) {
        const mat = new THREE.MeshStandardMaterial({ color:0x6a7a9a, roughness:0.7, side:THREE.DoubleSide });
        const seg = def.pleated ? 24 : 18;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.17, 0.20, seg, 1, true), mat);
        m.position.y = -0.04; return m;
    },
};

export class PrevizScene {
    constructor(container) {
        this.container  = container;
        this.THREE      = THREE;
        this.renderer   = null;
        this.composer   = null;
        this.bloomPass  = null;
        this.scene      = null;
        this.camera     = null;
        this.animId     = null;
        this.clock      = new THREE.Clock();
        this._orbit     = { theta:0, phi:Math.PI/2 - 0.12, radius:2.7, _panX:0, _panY:0, target:1.0 };
        this.vrm        = null;
        this._charWrap  = null;   // VRM 스케일/위치 래퍼
        this._lights    = {};
        this._stage     = {};
        this._weather   = null;
        this._raycaster = null;
        this._scanline  = null;
        this.state      = this._defaultState();
        this.onFrameTick= null;
        this._ready     = false;
        this._props     = {};   // 프로시저럴 소품 (헤어/의상/액세서리)
    }

    _defaultState() {
        return {
            hair:   { color:0xffffff, length:1.0, style:'straight' },  // 0xffffff = 원본 텍스처 유지
            eye:    { color:0xffffff },
            skin:   { tone:'normal' },
            body:   { size:'normal', height:1.0, chest:1.0 },
            pose:   'stand',
            expression: 'neutral',
            outfit: { preset:'none', color:null },
            env:    { preset:'studio', weather:'clear', timeOfDay:0.5, bg:'studio' },
            camera: { zoom:1.0, angle:'front', fov:30 },
            holo:   { intensity:0.45 },
            unmapped: [],
            promptOnly: [],
        };
    }

    // ── 초기화 ───────────────────────────────────────────────────
    async init() {
        const w = this.container.clientWidth  || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;

        this.renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(w, h);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0e16);

        this.camera = new THREE.PerspectiveCamera(30, w/h, 0.05, 100);

        this._setupLights();
        this._buildStage();
        this._weather = new WeatherSystem(THREE, this.scene);
        this._raycaster = new THREE.Raycaster();

        // 포스트프로세싱 (블룸 = 홀로그램 글로우)
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        // 블룸은 절반 해상도로 계산 (성능 절감, 체감 품질 차이 미미)
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w>>1, h>>1), 0.35, 0.4, 0.8);
        this.composer.addPass(this.bloomPass);

        // CSS 스캔라인/비네트 오버레이
        this._buildScanlineOverlay();

        // 저장 상태 복원 (깊은 병합)
        try {
            const saved = JSON.parse(localStorage.getItem(LS_KEY));
            if (saved) this.state = this._mergeState(this._defaultState(), saved);
        } catch(_) {}

        this._charWrap = new THREE.Group();
        this.scene.add(this._charWrap);

        await this._loadVRM();

        this._applyAll(this.state);
        this._applyEnv(this.state.env);
        this._applyHolo(this.state.holo.intensity);
        this._updateCameraForState(this.state);

        this._bindEvents();
        this._onResize = () => this.resize();
        window.addEventListener('resize', this._onResize);
        this._loop();
        this._ready = true;
    }

    async _loadVRM() {
        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));
        for (const url of getVrmUrls()) {
            try {
                const gltf = await loader.loadAsync(url);
                const vrm = gltf.userData.vrm;
                if (!vrm) throw new Error('VRM 데이터 없음 (non-VRM GLTF)');
                VRMUtils.removeUnnecessaryVertices(gltf.scene);
                vrm.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
                this.vrm = vrm;
                this._charWrap.add(vrm.scene);
                this._catalogMaterials();
                return;
            } catch (e) {
                console.warn('[previz] VRM 로드 실패, 다음 후보 시도:', url, e?.message || e);
            }
        }
        console.error('[previz] 모든 VRM 후보 로드 실패 — 폴백 프리미티브 표시');
        this._buildFallbackFigure();
    }

    // 머티리얼을 부위별로 분류 (이름 규칙 기반)
    _catalogMaterials() {
        this._mat = { hair:[], eye:[], skin:[], top:[], bottom:[], shoes:[], all:[] };
        if (!this.vrm) return;
        this.vrm.scene.traverse(o => {
            if (!o.isMesh) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(m => {
                const n = (m.name || '');
                const isOutline = /Outline/i.test(n);
                this._mat.all.push(m);
                if (isOutline) return;                       // 아웃라인은 틴트 제외
                if (/_HAIR/i.test(n))            this._mat.hair.push(m);
                else if (/EyeIris/i.test(n))     this._mat.eye.push(m);
                else if (/_SKIN/i.test(n))       this._mat.skin.push(m);
                else if (/Tops/i.test(n))        this._mat.top.push(m);
                else if (/Bottoms/i.test(n))     this._mat.bottom.push(m);
                else if (/Shoes/i.test(n))       this._mat.shoes.push(m);
            });
        });
    }

    _tint(mat, hex) {
        if (!mat) return;
        const c = new THREE.Color(hex);
        if (mat.color && mat.color.set) mat.color.set(c);
        // MToon uniforms 폴백
        if (mat.uniforms && mat.uniforms.litFactor && mat.uniforms.litFactor.value && mat.uniforms.litFactor.value.set)
            mat.uniforms.litFactor.value.set(c.r, c.g, c.b);
        mat.needsUpdate = true;
    }
    _tintGroup(list, hex) { (list||[]).forEach(m => this._tint(m, hex)); }

    // ── 조명 ──────────────────────────────────────────────────────
    _setupLights() {
        const amb = new THREE.AmbientLight(0x6b7c99, 1.5); this.scene.add(amb); this._lights.amb = amb;
        const key = new THREE.DirectionalLight(0xfff3e6, 1.7); key.position.set(-2.5, 4, 3.5);
        key.castShadow = true; key.shadow.mapSize.set(1024,1024);
        key.shadow.camera.near=0.5; key.shadow.camera.far=20;
        key.shadow.camera.left=key.shadow.camera.bottom=-3; key.shadow.camera.right=key.shadow.camera.top=3;
        key.shadow.bias=-0.0015; this.scene.add(key); this._lights.key = key;
        const fill = new THREE.DirectionalLight(0xbfe0ff, 0.8); fill.position.set(3, 2, 2); this.scene.add(fill); this._lights.fill = fill;
        const rim = new THREE.DirectionalLight(0x55b0ff, 1.2); rim.position.set(0, 2.5, -4); this.scene.add(rim); this._lights.rim = rim;
        const hemi = new THREE.HemisphereLight(0x88aaff, 0x223044, 0.5); this.scene.add(hemi); this._lights.hemi = hemi;
    }

    // ── 홀로그램 스테이지 (바닥 파티클 웨이브 + 링) ──────────────
    _buildStage() {
        // 파티클 웨이브 그리드 (48×48=2304 pts, 80×80 대비 64% 감소)
        const N=48, M=48, pos=[];
        for (let i=0;i<N;i++) for (let j=0;j<M;j++){ pos.push((i/N-0.5)*7, 0, (j/M-0.5)*7); }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pos),3));
        const mat = new THREE.PointsMaterial({ color:0x2ea8ff, size:0.02, transparent:true, opacity:0.6, blending:THREE.AdditiveBlending, depthWrite:false });
        const grid = new THREE.Points(geo, mat); this.scene.add(grid);
        this._stage.grid = grid; this._stage.gridBase = geo.attributes.position.array.slice();

        // 발광 링 플랫폼
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.32, 0.52, 56),
            new THREE.MeshBasicMaterial({ color:0x33ccff, transparent:true, opacity:0.45, side:THREE.DoubleSide, blending:THREE.AdditiveBlending, depthWrite:false }));
        ring.rotation.x = -Math.PI/2; ring.position.y = 0.005; this.scene.add(ring); this._stage.ring = ring;

        // 그림자 받는 바닥(보이지 않게, 그림자만)
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(14,14), new THREE.ShadowMaterial({ opacity:0.35 }));
        floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; this.scene.add(floor); this._stage.floor = floor;
    }

    _buildScanlineOverlay() {
        const ov = document.createElement('div');
        ov.id = 'previz-holo-overlay';
        ov.style.cssText = [
            'position:absolute','inset:0','pointer-events:none','z-index:5',
            'background:repeating-linear-gradient(0deg,rgba(80,180,255,0.05) 0px,rgba(80,180,255,0.05) 1px,transparent 2px,transparent 4px)',
            'mix-blend-mode:screen','opacity:0.5','transition:opacity 0.3s',
        ].join(';');
        const vig = document.createElement('div');
        vig.style.cssText = 'position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 160px rgba(0,20,40,0.85);';
        ov.appendChild(vig);
        this.container.appendChild(ov);
        this._scanline = ov;
    }

    _buildFallbackFigure() {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color:0x88aaff, emissive:0x224466, emissiveIntensity:0.5, transparent:true, opacity:0.85 });
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.7, 6, 16), mat); body.position.y = 0.9;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 16), mat); head.position.y = 1.5;
        g.add(body); g.add(head); this._charWrap.add(g);
        this._fallback = g;
    }

    // ── 전체 적용 ─────────────────────────────────────────────────
    _applyAll(state, skipSave = false) {
        this._tintGroup(this._mat?.hair, state.hair.color);
        this._tintGroup(this._mat?.eye,  state.eye.color);
        this._tintGroup(this._mat?.skin, SKIN_TONES[state.skin.tone] ?? 0xffffff);
        // 의상: 색 지정 없으면 0xffffff(원본 텍스처)로 리셋 — 누적 방지
        const oc = state.outfit.color != null ? state.outfit.color : 0xffffff;
        this._tintGroup(this._mat?.top, oc);
        this._tintGroup(this._mat?.bottom, oc);
        this._applyPose(state.pose);
        this._applyExpression(state.expression);
        this._applyBody(state.body);
        if (!skipSave) this._saveState(state);
    }

    _applyPose(poseName) {
        if (!this.vrm?.humanoid) return;
        const H = this.vrm.humanoid;
        // 리셋: 주요 본 0
        ['leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm',
         'leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg'].forEach(b=>{
            const node = H.getNormalizedBoneNode(b); if (node) node.rotation.set(0,0,0);
        });
        if (this._charWrap) { this._charWrap.rotation.set(0,0,0); this._charWrap.position.y = 0; }

        const p = POSE_PRESETS[poseName] || POSE_PRESETS.stand;
        const set = (bone, rot) => { const n = H.getNormalizedBoneNode(bone); if (n && rot) n.rotation.set(rot[0],rot[1],rot[2]); };
        set('leftUpperArm', p.lUpperArm); set('rightUpperArm', p.rUpperArm);
        set('leftLowerArm', p.lLowerArm); set('rightLowerArm', p.rLowerArm);
        set('leftUpperLeg', p.lUpperLeg); set('rightUpperLeg', p.rUpperLeg);
        set('leftLowerLeg', p.lLowerLeg); set('rightLowerLeg', p.rLowerLeg);
        if (p._rootRotX != null) this._charWrap.rotation.x = p._rootRotX;
        if (p._rootRotZ != null) this._charWrap.rotation.z = p._rootRotZ;
        if (p._rootY != null) this._charWrap.position.y = p._rootY;
        if (poseName === 'sit' || poseName === 'sitting') this._charWrap.position.y = -0.28;
        this.vrm.update(0);
    }

    _applyExpression(exp) {
        const em = this.vrm?.expressionManager; if (!em) return;
        ['happy','sad','angry','surprised','relaxed','aa','oh','neutral'].forEach(n => { try { em.setValue(n, 0); } catch(_){} });
        const target = EXPRESSION_MAP[exp] || (exp && em.expressionMap?.[exp] ? exp : null);
        if (target) { try { em.setValue(target, 1.0); } catch(_){} }
        this.vrm.update(0);
    }

    _applyBody(body) {
        if (!this._charWrap) return;
        // body는 객체({size,height,...}) 또는 구버전 문자열(size) 모두 허용
        const size = (typeof body === 'string') ? body : (body?.size || 'normal');
        const height = (typeof body === 'object' && body?.height) ? body.height : 1.0;
        let s = 1.0;
        if (size === 'petite' || size === 'small') s = 0.92;
        else if (size === 'tall') s = 1.06;
        s *= height;   // 연속 키 슬라이더 배율
        const baseY = this._charWrap.position.y;
        this._charWrap.scale.setScalar(s);
        this._charWrap.position.y = baseY; // 스케일 후 바닥 유지
        // 폭(좌우) 보정: 슬렌더 계열은 슬림하게, 글래머는 약간 풍성하게
        if (size === 'skinny' || size === 'slim' || size === 'slender')
            this._charWrap.scale.x = this._charWrap.scale.z = s * 0.95;
        else if (size === 'curvy')
            this._charWrap.scale.x = this._charWrap.scale.z = s * 1.05;
        // athletic은 기본 비율 유지
    }

    // UI 호환 메서드
    _buildAllParts(state) { this.state = state; this._applyAll(state); }
    _buildEyes(state)     { this.state = state; this._tintGroup(this._mat?.eye, state.eye.color); this._saveState(state); }

    // ── 홀로그램 강도 (0~1) ──────────────────────────────────────
    _applyHolo(intensity) {
        const t = Math.max(0, Math.min(1, intensity ?? 0.45));
        this.state.holo.intensity = t;
        if (this.bloomPass) { this.bloomPass.strength = 0.08 + t * 0.55; this.bloomPass.radius = 0.3 + t*0.3; this.bloomPass.threshold = 0.85 - t*0.25; }
        if (this._lights.rim)  this._lights.rim.intensity  = 0.3 + t * 1.8;
        if (this._lights.fill) this._lights.fill.color.setHex(t > 0.5 ? 0x9fd0ff : 0xbfe0ff);
        if (this._stage.grid)  this._stage.grid.material.opacity = 0.15 + t * 0.6;
        if (this._stage.ring)  this._stage.ring.material.opacity = 0.1 + t * 0.5;
        if (this._scanline)    this._scanline.style.opacity = String(0.1 + t * 0.7);
        this._saveState(this.state);
    }

    // ── 프로시저럴 소품 (헤어/의상/액세서리) ────────────────────────
    // 활성 토큰 집합에 맞춰 VRM 본에 소품을 붙이거나 제거하고, 색을 갱신한다.
    _applyProps(tokens) {
        if (!this.vrm?.humanoid) return;
        const active = new Set();
        (tokens || []).forEach(t => { if (PROP_DEFS[t]) active.add(t); });

        // 비활성 소품 제거
        Object.keys(this._props).forEach(k => {
            if (!active.has(k)) {
                const o = this._props[k];
                o.parent && o.parent.remove(o);
                this._disposeObj(o);
                delete this._props[k];
            }
        });

        // 활성 소품 생성/갱신
        active.forEach(k => {
            if (!this._props[k]) {
                const def = PROP_DEFS[k];
                const bone = this.vrm.humanoid.getRawBoneNode?.(def.bone)
                          || this.vrm.humanoid.getNormalizedBoneNode?.(def.bone);
                if (!bone) return;
                // VRM 본은 로컬축이 회전돼 있음(예: head 로컬+Y=월드+Z).
                // 본 월드회전을 상쇄한 '월드정렬 마운트'에 소품을 달아 직관적 좌표(y=위, z=앞) 사용.
                bone.updateWorldMatrix(true, false);
                const wq = new THREE.Quaternion(); bone.getWorldQuaternion(wq);
                const inv = wq.clone().invert();
                const mount = new THREE.Group();
                mount.quaternion.copy(inv);
                mount.position.copy(new THREE.Vector3(...(def.pos || [0,0,0])).applyQuaternion(inv));
                const obj = PROP_BUILDERS[def.build](THREE, def);
                if (def.rot) obj.rotation.set(...def.rot);
                mount.add(obj);
                mount.userData.tint = def.tint || null;
                mount.traverse(m => { if (m.isMesh) m.frustumCulled = false; });
                bone.add(mount);
                this._props[k] = mount;
            }
            this._tintProp(k);
        });
    }

    _tintProp(k) {
        const o = this._props[k]; if (!o) return;
        const tint = o.userData.tint;
        let hex = null;
        if (tint === 'hair')   hex = (this.state.hair.color && this.state.hair.color !== 0xffffff) ? this.state.hair.color : 0x6b5a48;
        else if (tint === 'outfit') hex = (this.state.outfit.color != null) ? this.state.outfit.color : 0x6a7a9a;
        if (hex == null) return;
        o.traverse(m => { if (m.isMesh && m.material && m.material.color) m.material.color.setHex(hex); });
    }

    _disposeObj(o) {
        o.traverse(m => {
            if (m.geometry) m.geometry.dispose();
            if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose());
        });
    }

    // ── 환경 ──────────────────────────────────────────────────────
    _applyEnv(envState) {
        const bgMap = {
            studio:0x0a0e16, indoor:0x14121c, bedroom:0x1a141e, classroom:0x141a22,
            cafe:0x1c1812, office:0x14181f, library:0x18140f, stage:0x1a0a1e,
            outdoor:0x10202c, nature:0x0e2018, forest:0x0c1c12, beach:0x16283a,
            mountains:0x14202a, city:0x0a0e1a, street:0x0c1016, garden:0x102014,
            cyber:0x140a22, sky:0x081420,
            white:0xe8eef5, black:0x050608, grey:0x2a2e36, gradient:0x101826,
            studio_backdrop:0x12141a, detailed:0x12161e, simple:0x10141c,
        };
        const key = envState.bg || envState.preset || 'studio';
        const hex = bgMap[key] ?? 0x0a0e16;
        if (this.scene.background) this.scene.background.setHex(hex);
        this._applyTimeOfDay(envState.timeOfDay ?? 0.5);
        this._weather?.setWeather(envState.weather || 'clear');
    }

    _applyTimeOfDay(t) {
        const L = this._lights; if (!L.key) return;
        if (t < 0.25)      { L.key.color.setHex(0x8aa0d0); L.key.intensity = 1.0; }
        else if (t < 0.5)  { L.key.color.setHex(0xffdcb0); L.key.intensity = 1.6; }
        else if (t < 0.75) { L.key.color.setHex(0xfff3e6); L.key.intensity = 1.7; }
        else               { L.key.color.setHex(0xff9a55); L.key.intensity = 1.1; }
    }

    // ── 태그 변경 → 상태 재구성 후 적용 ──────────────────────────
    onTagsChanged(tags) {
        const ns = this._defaultState();
        ns.holo.intensity = this.state?.holo?.intensity ?? 0.45;   // 강도 유지
        ns.unmapped = []; ns.promptOnly = [];
        let hasCamera = false;

        tags.forEach(({ token }) => {
            const t = (token || '').toLowerCase().trim();
            const chans = TAG_MAP[t];
            if (!chans) { ns.promptOnly.push(token); return; }
            chans.forEach(ch => {
                switch (ch) {
                    case 'hair.color': ns.hair.color = HAIR_COLORS[t] ?? 0xffffff; break;
                    case 'eye.color':  ns.eye.color  = EYE_COLORS[t]  ?? 0xffffff; break;
                    case 'skin.tone':  ns.skin.tone  = t; break;
                    case 'expression': ns.expression = t; break;
                    case 'body.size':  ns.body.size  = t; break;
                    case 'pose':       ns.pose = t; break;
                    case 'outfit':     ns.outfit.preset = t; ns.outfit.color = OUTFIT_COLORS[t] ?? null; break;
                    case 'camera':     this._tagToCamera(t, ns); hasCamera = true; break;
                    case 'env':        this._tagToEnv(t, ns); break;
                    case 'bg': {
                        const bgKey = {
                            white_background:'white', black_background:'black', grey_background:'grey',
                            gradient_background:'gradient', studio_backdrop:'studio_backdrop',
                            detailed_background:'detailed', simple_background:'simple', solid_color:'simple',
                        };
                        ns.env.bg = bgKey[t] || 'simple';
                        break;
                    }
                    case 'time':
                        ns.env.timeOfDay = (t === 'night' || t === 'starry_sky') ? 0.92
                            : (t === 'sunset' || t === 'golden_hour') ? 0.78
                            : (t === 'day' || t === 'daytime') ? 0.5 : ns.env.timeOfDay;
                        break;
                    case 'weather':    ns.env.weather = (t === 'raining' || t === 'rain') ? 'rain' : t === 'snow' ? 'snow' : 'clear'; break;
                    case 'light':      ns._light = t; break;
                    case 'particle':
                        ns.env.weather = t === 'falling_petals' ? 'petals'
                            : t === 'water_drops' ? 'rain'
                            : t === 'sparks' ? 'sparks'
                            : (t === 'wind' || t === 'floating_hair' || t === 'glowing_lights') ? (ns.env.weather === 'clear' ? 'petals' : ns.env.weather)
                            : ns.env.weather;
                        break;
                }
            });
        });

        this.state = ns;
        this._applyAll(ns, true); // skipSave=true — 아래에서 한 번만 저장
        this._applyEnv(ns.env);
        this._applyLight(ns._light);
        this._applyProps(tags.map(x => (x.token || '').toLowerCase().trim()));
        if (hasCamera) this._updateCameraForState(ns);

        // 소품으로 반영되는 토큰은 '미반영' 목록에서 제외
        ns.promptOnly = ns.promptOnly.filter(tk => !PROP_DEFS[(tk || '').toLowerCase().trim()]);
        if (typeof window.__previzUpdateUnmapped === 'function')
            window.__previzUpdateUnmapped(ns.promptOnly);
        this._saveState(ns); // 모든 상태 적용 후 한 번만 저장
    }

    _tagToCamera(t, ns) {
        if (t === 'close_up' || t === 'portrait')   ns.camera.zoom = 0.5;
        else if (t === 'upper_body')   ns.camera.zoom = 0.72;
        else if (t === 'cowboy_shot')  ns.camera.zoom = 0.95;
        else if (t === 'full_body')    ns.camera.zoom = 1.25;
        else if (t === 'from_behind')  ns.camera.angle = 'back';
        else if (t === 'from_side')    ns.camera.angle = 'side';
        else if (t === 'from_above')   ns.camera.angle = 'high';
        else if (t === 'from_below')   ns.camera.angle = 'low';
        else if (t === 'dutch_angle')  ns.camera.angle = 'dutch';
        else if (t === 'pov')          ns.camera.zoom = 0.62;
        else if (t === 'looking_at_viewer') ns.camera.angle = 'front';
    }
    _tagToEnv(t, ns) {
        // 토큰 → (배경 프리셋 키). bgMap/_applyTimeOfDay에서 색으로 사용.
        const m = {
            indoors:'indoor', bedroom:'bedroom', classroom:'classroom', cafe:'cafe',
            office:'office', library:'library', stage:'stage',
            outdoors:'outdoor', nature:'nature', forest:'forest', beach:'beach',
            mountains:'mountains', city:'city', street:'street', garden:'garden',
            cyberpunk_city:'cyber',
        };
        ns.env.preset = m[t] || ns.env.preset; ns.env.bg = m[t] || ns.env.bg;
    }
    _applyLight(l) {
        const L = this._lights; if (!L.key) return;
        // 조명 태그 적용 전 항상 기본값으로 리셋 — 이전 태그 색상 잔존 방지
        L.key.color.setHex(0xfff8f0); L.key.intensity = 1.6;
        L.amb.intensity = 1.4;
        if (L.rim)  { L.rim.color.setHex(0xffffff);  L.rim.intensity  = 0.8; }
        if (L.fill) { L.fill.intensity = 0.6; }
        switch (l) {
            case 'cinematic_lighting': L.key.intensity = 2.1; L.amb.intensity = 0.9; break;
            case 'soft_lighting':      L.key.intensity = 1.2; L.amb.intensity = 1.9; break;
            case 'natural_lighting':   L.key.intensity = 1.6; L.key.color.setHex(0xfff3e6); L.amb.intensity = 1.5; break;
            case 'studio_lighting':    L.key.intensity = 1.9; L.amb.intensity = 1.3; L.fill && (L.fill.intensity = 1.2); break;
            case 'rim_lighting':
            case 'backlighting':       L.rim && (L.rim.intensity = 2.6); L.key.intensity = 1.2; L.amb.intensity = 0.7; break;
            case 'neon_lighting':
            case 'neon_lights':        L.key.color.setHex(0xff5ad0); L.key.intensity = 1.4; L.rim && (L.rim.color.setHex(0x4ad0ff), L.rim.intensity = 2.2); break;
            case 'god_rays':
            case 'sunbeam':            L.key.color.setHex(0xfff0c0); L.key.intensity = 2.3; L.amb.intensity = 1.0; break;
        }
    }

    _updateCameraForState(state) {
        const angle = state.camera?.angle || 'front';
        const o = this._orbit;
        o.phi = Math.PI/2 - 0.12;   // 기본 시선 높이로 리셋
        if (angle === 'back')      o.theta = Math.PI;
        else if (angle === 'side') { o.theta = Math.PI/2; }
        else if (angle === 'high') { o.theta = 0; o.phi = Math.PI/6; }
        else if (angle === 'low')  { o.theta = 0; o.phi = Math.PI/2 + 0.3; }
        else if (angle === 'dutch'){ o.theta = 0.18; }
        else                       o.theta = 0;
        o.radius = 2.7 * (state.camera?.zoom ?? 1.0);
        this.camera.fov = state.camera?.fov ?? 30;
        this.camera.updateProjectionMatrix();
        this._updateCameraPos();
    }

    // ── 상태 저장/병합 ────────────────────────────────────────────
    _saveState(state) { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(_){} }
    _mergeState(def, saved) {
        const out = { ...def, ...saved };
        ['hair','eye','skin','body','outfit','env','camera','holo'].forEach(k => {
            out[k] = { ...def[k], ...(saved[k] || {}) };
        });
        // 구버전 문자열 색상 → 숫자
        ['hair','eye'].forEach(k => { if (typeof out[k].color === 'string') out[k].color = parseInt(out[k].color.replace('#',''),16) || 0xffffff; });
        return out;
    }

    // ── 뷰 모드: 'free'(자유 회전) / 'camera'(출력 구도 고정) ──────
    setViewMode(mode) {
        this._viewMode = mode;
        this._orbit.locked = (mode === 'camera');
        if (mode === 'camera') { this._orbit._panX = 0; this._orbit._panY = 0; this._updateCameraForState(this.state); }
    }
    getViewMode() { return this._viewMode || 'free'; }

    // 홀로그램 ON/OFF 비교 토글
    toggleHolo(on) {
        if (on) { this._applyHolo(this._holoSaved ?? 0.45); }
        else { this._holoSaved = this.state.holo.intensity || 0.45; this._applyHolo(0); }
    }

    // ── 마우스/터치 ───────────────────────────────────────────────
    _bindEvents() {
        const el = this.renderer.domElement; const o = this._orbit;
        el.addEventListener('contextmenu', e => e.preventDefault());
        el.addEventListener('mousedown', e => {
            if (e.button === 0) { o._sx=e.clientX; o._sy=e.clientY; o._lb=true; }
            else if (o.locked) { return; }
            else if (e.button === 2) { o.drag=true; o.mode='rotate'; o.lx=e.clientX; o.ly=e.clientY; }
            else if (e.button === 1) { o.drag=true; o.mode='pan'; o.lx=e.clientX; o.ly=e.clientY; e.preventDefault(); }
        });
        el.addEventListener('mousemove', e => {
            if (!o.drag) return;
            const dx=e.clientX-o.lx, dy=e.clientY-o.ly; o.lx=e.clientX; o.ly=e.clientY;
            if (o.mode==='rotate') { o.theta -= dx*0.008; o.phi = Math.max(0.1, Math.min(Math.PI-0.1, o.phi+dy*0.006)); }
            else if (o.mode==='pan') { const s=o.radius*0.0014; o._panX -= dx*s; o._panY += dy*s; }
            this._updateCameraPos();
        });
        window.addEventListener('mouseup', e => {
            if (e.button===0 && o._lb) { o._lb=false; if (Math.abs(e.clientX-o._sx)+Math.abs(e.clientY-o._sy)<5) this._handleClick(e); }
            else { o.drag=false; o.mode=null; }
        });
        el.addEventListener('wheel', e => { if (o.locked) return; o.radius = Math.max(1.0, Math.min(8, o.radius+e.deltaY*0.004)); this._updateCameraPos(); e.preventDefault(); }, { passive:false });

        let lastDist = 0;
        el.addEventListener('touchstart', e => {
            if (o.locked) { if (e.touches.length===1){ o._sx=e.touches[0].clientX; o._sy=e.touches[0].clientY; o.drag=false; } return; }
            if (e.touches.length===1){ o.drag=true; o.mode='rotate'; o.lx=e.touches[0].clientX; o.ly=e.touches[0].clientY; o._sx=o.lx; o._sy=o.ly; }
            else if (e.touches.length===2){ o.drag=false; lastDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY); }
        }, { passive:true });
        el.addEventListener('touchmove', e => {
            if (e.touches.length===1 && o.drag){ const dx=e.touches[0].clientX-o.lx, dy=e.touches[0].clientY-o.ly; o.lx=e.touches[0].clientX; o.ly=e.touches[0].clientY; o.theta-=dx*0.008; o.phi=Math.max(0.1,Math.min(Math.PI-0.1,o.phi+dy*0.006)); this._updateCameraPos(); }
            else if (e.touches.length===2){ const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY); o.radius=Math.max(1.0,Math.min(8,o.radius-(d-lastDist)*0.008)); lastDist=d; this._updateCameraPos(); }
            e.preventDefault();
        }, { passive:false });
        el.addEventListener('touchend', e => {
            if (o.drag && e.changedTouches.length>0){ const t=e.changedTouches[0]; if (Math.abs(t.clientX-o._sx)+Math.abs(t.clientY-o._sy)<10) this._handleClick(t); }
            o.drag=false;
        });
    }

    _matNameToCallout(name) {
        if (/_HAIR/i.test(name)) return { part:PART.HAIR, callout:'hair' };
        if (/EyeIris|_EYE|_FACE/i.test(name)) return { part:PART.HEAD, callout:'face' };
        if (/Tops/i.test(name)) return { part:PART.OUTFIT, callout:'upper' };
        if (/Bottoms/i.test(name)) return { part:PART.OUTFIT, callout:'lower' };
        if (/Shoes/i.test(name)) return { part:PART.L_LEG, callout:'lower' };
        if (/_SKIN/i.test(name)) return { part:PART.TORSO, callout:'upper' };
        return { part:PART.TORSO, callout:'upper' };
    }

    _handleClick(e) {
        if (!this._raycaster || !this.vrm) return;
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1, -((e.clientY-rect.top)/rect.height)*2+1);
        this._raycaster.setFromCamera(mouse, this.camera);
        const targets = []; this.vrm.scene.traverse(o => { if (o.isMesh) targets.push(o); });
        const hits = this._raycaster.intersectObjects(targets, false);
        if (hits.length > 0) {
            const m = hits[0].object.material;
            const name = (Array.isArray(m) ? m[0]?.name : m?.name) || '';
            const { part, callout } = this._matNameToCallout(name);
            if (typeof window.__previzOnPartClick === 'function')
                window.__previzOnPartClick(part, PART_NAME[part], this.state, this);
            if (callout && typeof window.__previzOpenCallout === 'function')
                window.__previzOpenCallout(callout);
        }
    }

    _updateCameraPos() {
        const o = this._orbit;
        const baseY = o.target;
        const px=o._panX||0, py=o._panY||0;
        const sinT=Math.sin(o.theta), cosT=Math.cos(o.theta);
        const tx=px*cosT, tz=px*(-sinT), ty=baseY+py;
        this.camera.position.set(
            o.radius*Math.sin(o.phi)*sinT + tx,
            o.radius*Math.cos(o.phi) + ty,
            o.radius*Math.sin(o.phi)*cosT + tz,
        );
        this.camera.lookAt(tx, ty, tz);
    }

    _loop() {
        this.animId = requestAnimationFrame(() => this._loop());
        const dt = this.clock.getDelta();
        this._frame = (this._frame || 0) + 1;
        // 파티클 웨이브: 격frame 업데이트 (시각적 차이 없음)
        if (this._stage.grid && (this._frame & 1) === 0) {
            const a = this._stage.grid.geometry.attributes.position.array;
            const b = this._stage.gridBase; const tt = this.clock.elapsedTime;
            for (let i=0;i<a.length;i+=3) a[i+1] = Math.sin(b[i]*1.1+tt*1.3)*0.09 + Math.cos(b[i+2]*0.9+tt)*0.07;
            this._stage.grid.geometry.attributes.position.needsUpdate = true;
        }
        if (this._stage.ring) this._stage.ring.rotation.z += dt*0.3;
        this._weather?.update();
        if (this.vrm) this.vrm.update(dt);
        if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
        // callout 투영: 드래그 중에는 매 프레임, 정지 시 3프레임 주기
        if (this._orbit.drag || (this._frame % 3) === 0) this.onFrameTick?.();
    }

    pause() {
        if (this.animId !== null) {
            cancelAnimationFrame(this.animId);
            this.animId = null;
        }
    }

    resume() {
        if (this.animId !== null) return;
        // 숨겨져 있던 시간은 애니메이션 delta에 포함하지 않는다.
        this.clock.getDelta();
        this._loop();
    }

    resize() {
        if (!this.renderer || !this.camera) return;
        const w = this.container.clientWidth || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;
        this.renderer.setSize(w, h);
        this.composer?.setSize(w, h);
        this.bloomPass?.setSize(w>>1, h>>1);
        this.camera.aspect = w/h; this.camera.updateProjectionMatrix();
    }

    dispose() {
        this.pause();
        if (this._onResize) { window.removeEventListener('resize', this._onResize); this._onResize = null; }
        this._weather?.dispose();
        Object.values(this._props || {}).forEach(o => { o.parent && o.parent.remove(o); this._disposeObj(o); });
        this._props = {};
        if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
        this._scanline?.remove();
        if (this.renderer) { this.renderer.dispose(); this.renderer.domElement.remove(); }
    }
}
