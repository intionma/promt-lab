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
};
const SKIN_TONES = { pale_skin:0xfff2ee, normal:0xffffff, tanned:0xd9a878, dark_skin:0xb07d52 };
const OUTFIT_COLORS = {
    school_uniform:0x4a5b8f, business_suit:0x3a3f4a, oversized_hoodie:0x9aa4b2,
    dress:0xd06a8e, casual:0x6aa0c0, sportswear:0x4caa6a, gothic:0x4a3550,
    kimono:0xc05068, maid:0x3a3f6a, white_dress:0xeef2f7,
};

// ── 표정 → 블렌드셰이프 ──────────────────────────────────────────
const EXPRESSION_MAP = {
    smile:'happy', happy:'happy', grin:'happy',
    tears:'sad', crying:'sad', sad:'sad',
    open_mouth:'aa', serious:'neutral', closed_mouth:'neutral',
    angry:'angry', surprised:'surprised', relaxed:'relaxed',
};

// ── 포즈 → 휴머노이드 본 회전 (정규화 본 로컬, [x,y,z] rad) ───────
// VRM 기본은 T포즈. stand에서 팔을 내려 A포즈로.
const POSE_PRESETS = {
    stand:        { lUpperArm:[0,0,-1.18], rUpperArm:[0,0,1.18] },
    standing:     { lUpperArm:[0,0,-1.18], rUpperArm:[0,0,1.18] },
    arms_up:      { lUpperArm:[0,0,1.4],   rUpperArm:[0,0,-1.4] },
    hands_on_hips:{ lUpperArm:[0,0,-1.0],  rUpperArm:[0,0,1.0], lLowerArm:[0,-1.5,0], rLowerArm:[0,1.5,0] },
    crossed_arms: { lUpperArm:[0,0,-1.35], rUpperArm:[0,0,1.35], lLowerArm:[0,-1.9,0], rLowerArm:[0,1.9,0] },
    peace_sign:   { lUpperArm:[0,0,-1.15], rUpperArm:[0,0,-1.35], rLowerArm:[0,-0.3,0] },
    sit:          { lUpperArm:[0,0,-1.0],  rUpperArm:[0,0,1.0], lUpperLeg:[-1.5,0,0.05], rUpperLeg:[-1.5,0,-0.05], lLowerLeg:[1.6,0,0], rLowerLeg:[1.6,0,0] },
    sitting:      { lUpperArm:[0,0,-1.0],  rUpperArm:[0,0,1.0], lUpperLeg:[-1.5,0,0.05], rUpperLeg:[-1.5,0,-0.05], lLowerLeg:[1.6,0,0], rLowerLeg:[1.6,0,0] },
    lying_on_back:{ lUpperArm:[0,0,-1.3],  rUpperArm:[0,0,1.3], _rootRotX:-1.5708, _rootY:0.05 },
    lean:         { lUpperArm:[0,0,-1.15], rUpperArm:[0,0,1.15], _rootRotZ:0.08 },
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
    // 피부
    pale_skin:['skin.tone'], tanned:['skin.tone'], dark_skin:['skin.tone'],
    // 표정
    smile:['expression'], tears:['expression'], crying:['expression'], open_mouth:['expression'],
    serious:['expression'], angry:['expression'], surprised:['expression'],
    // 체형
    petite:['body.size'], small:['body.size'], tall:['body.size'], skinny:['body.size'],
    // 포즈
    standing:['pose'], sitting:['pose'], lying_on_back:['pose'], sit:['pose'], stand:['pose'],
    hands_on_hips:['pose'], peace_sign:['pose'], crossed_arms:['pose'], arms_up:['pose'], lean:['pose'],
    // 카메라
    close_up:['camera'], full_body:['camera'], from_behind:['camera'], from_above:['camera'],
    from_below:['camera'], looking_at_viewer:['camera'],
    // 의상 (색 틴트)
    school_uniform:['outfit'], business_suit:['outfit'], oversized_hoodie:['outfit'],
    dress:['outfit'], casual:['outfit'], sportswear:['outfit'], gothic:['outfit'],
    kimono:['outfit'], maid:['outfit'], white_dress:['outfit'],
    // 배경/환경
    indoors:['env'], outdoors:['env'], bedroom:['env'], classroom:['env'], nature:['env'], city:['env'],
    simple_background:['bg'], white_background:['bg'], solid_color:['bg'],
    // 시간/날씨
    daytime:['time'], night:['time'], raining:['weather'], clear_sky:['weather'], snow:['weather'],
    // 조명
    cinematic_lighting:['light'], soft_lighting:['light'], natural_lighting:['light'],
    // 파티클
    falling_petals:['particle'], wind:['particle'], water_drops:['particle'],
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
        window.addEventListener('resize', () => this.resize());
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
    _applyAll(state) {
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
        this._saveState(state);
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
        if (p._rootRotX) this._charWrap.rotation.x = p._rootRotX;
        if (p._rootRotZ) this._charWrap.rotation.z = p._rootRotZ;
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
        if (size === 'skinny') this._charWrap.scale.x = this._charWrap.scale.z = s * 0.95;
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

    // ── 환경 ──────────────────────────────────────────────────────
    _applyEnv(envState) {
        const bgMap = {
            studio:0x0a0e16, indoor:0x14121c, bedroom:0x1a141e, classroom:0x141a22,
            outdoor:0x10202c, nature:0x0e2018, city:0x0a0e1a, sky:0x081420,
            white:0xe8eef5, simple:0x10141c,
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
                    case 'bg':         ns.env.bg = (t === 'white_background' ? 'white' : 'simple'); break;
                    case 'time':       ns.env.timeOfDay = (t === 'night' ? 0.9 : 0.5); break;
                    case 'weather':    ns.env.weather = (t === 'raining' ? 'rain' : t === 'snow' ? 'snow' : 'clear'); break;
                    case 'light':      ns._light = t; break;
                    case 'particle':   ns.env.weather = (t === 'falling_petals' ? 'petals' : t === 'water_drops' ? 'rain' : ns.env.weather); break;
                }
            });
        });

        this.state = ns;
        this._applyAll(ns);
        this._applyEnv(ns.env);
        this._applyLight(ns._light);
        if (hasCamera) this._updateCameraForState(ns);

        if (typeof window.__previzUpdateUnmapped === 'function')
            window.__previzUpdateUnmapped(ns.promptOnly);
    }

    _tagToCamera(t, ns) {
        if (t === 'close_up')          ns.camera.zoom = 0.55;
        else if (t === 'full_body')    ns.camera.zoom = 1.25;
        else if (t === 'from_behind')  ns.camera.angle = 'back';
        else if (t === 'from_above')   ns.camera.angle = 'high';
        else if (t === 'from_below')   ns.camera.angle = 'low';
        else if (t === 'looking_at_viewer') ns.camera.angle = 'front';
    }
    _tagToEnv(t, ns) {
        const m = { indoors:'indoor', bedroom:'bedroom', classroom:'classroom', outdoors:'outdoor', nature:'nature', city:'city' };
        ns.env.preset = m[t] || ns.env.preset; ns.env.bg = m[t] || ns.env.bg;
    }
    _applyLight(l) {
        const L = this._lights; if (!L.key) return;
        if (l === 'cinematic_lighting') { L.key.intensity = 2.1; L.amb.intensity = 0.9; }
        else if (l === 'soft_lighting') { L.key.intensity = 1.2; L.amb.intensity = 1.9; }
        else if (l === 'natural_lighting') { L.key.intensity = 1.6; L.key.color.setHex(0xfff3e6); L.amb.intensity = 1.5; }
    }

    _updateCameraForState(state) {
        const angle = state.camera?.angle || 'front';
        const o = this._orbit;
        if (angle === 'back')      o.theta = Math.PI;
        else if (angle === 'high') { o.theta = 0; o.phi = Math.PI/6; }
        else if (angle === 'low')  { o.theta = 0; o.phi = Math.PI/2 + 0.3; }
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
        if (this.animId) cancelAnimationFrame(this.animId);
        this._weather?.dispose();
        if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
        this._scanline?.remove();
        if (this.renderer) { this.renderer.dispose(); this.renderer.domElement.remove(); }
    }
}
