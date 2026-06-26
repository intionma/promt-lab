/**
 * previz-scene.js — Three.js 씬 + 애니 인체 포인트클라우드
 * 베지어 단면 보간 / 머리카락 / 레이캐스팅 / 바디파트 인터랙션
 */

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

// ── 신체 제어점 정의 ──────────────────────────────────────────────
// 각 row: [y, rxFront, rzSide]  (대칭 타원 단면)
// 위에서 아래로, 보간 구간은 _interpSections()에서 cubicHermite로 처리
const TORSO_CP = [
    // y       rx     rz
    [ 1.535,  0.005, 0.005 ],  // 머리 꼭대기
    [ 1.470,  0.110, 0.100 ],  // 머리 상부
    [ 1.385,  0.205, 0.185 ],  // 머리 중부 (가장 넓음)
    [ 1.290,  0.215, 0.190 ],  // 눈 높이
    [ 1.200,  0.195, 0.175 ],  // 코
    [ 1.115,  0.155, 0.150 ],  // 턱선
    [ 1.025,  0.058, 0.052 ],  // 목 상
    [ 0.940,  0.055, 0.050 ],  // 목 하
    [ 0.870,  0.210, 0.105 ],  // 어깨 (좌우로 넓음)
    [ 0.800,  0.195, 0.108 ],
    [ 0.720,  0.172, 0.115 ],  // 가슴 상
    [ 0.640,  0.168, 0.125 ],  // 가슴 하
    [ 0.540,  0.128, 0.090 ],  // 허리 상 (잘록)
    [ 0.440,  0.122, 0.085 ],  // 허리 하
    [ 0.340,  0.165, 0.100 ],  // 골반 상
    [ 0.230,  0.185, 0.108 ],  // 골반 하 (엉덩이)
    [ 0.120,  0.180, 0.105 ],
    [ 0.040,  0.165, 0.098 ],  // 가랑이 분기 직전
];

const LEG_CP = [   // x오프셋은 좌우로 ±0.105 적용
    [ 0.020,  0.088, 0.082 ],  // 허벅지 상
    [-0.110,  0.085, 0.078 ],
    [-0.240,  0.078, 0.072 ],  // 허벅지 하
    [-0.360,  0.060, 0.057 ],  // 무릎
    [-0.460,  0.052, 0.050 ],  // 종아리 상
    [-0.580,  0.048, 0.044 ],
    [-0.700,  0.040, 0.037 ],
    [-0.810,  0.033, 0.031 ],  // 발목
    [-0.880,  0.032, 0.060 ],  // 발
    [-0.940,  0.030, 0.055 ],
];

const ARM_CP = [   // x오프셋 ±0.225 (어깨)→±0.28 (손목) 선형 증가
    [ 0.860,  0.052, 0.048 ],  // 어깨
    [ 0.760,  0.050, 0.045 ],
    [ 0.650,  0.046, 0.041 ],  // 팔꿈치
    [ 0.540,  0.040, 0.036 ],
    [ 0.430,  0.035, 0.031 ],  // 손목
    [ 0.340,  0.032, 0.029 ],
    [ 0.240,  0.038, 0.022 ],  // 손
];

// 눈 클러스터 (강조 밀도)
const EYE_POS = [
    { x: -0.085, y: 1.287, z: 0.180 },
    { x:  0.085, y: 1.287, z: 0.180 },
];

// 바디파트 ID
const PART = { HEAD: 0, TORSO: 1, L_ARM: 2, R_ARM: 3, L_LEG: 4, R_LEG: 5, HAIR: 6 };
const PART_NAME = ['머리', '몸통', '왼팔', '오른팔', '왼다리', '오른다리', '머리카락'];

// ── 태그 → sceneState 매핑 테이블 ────────────────────────────────
const TAG_MAP = {
    // 머리카락 길이
    long_hair:    { channel: 'hair.length', value: 1.0 },
    medium_hair:  { channel: 'hair.length', value: 0.55 },
    short_hair:   { channel: 'hair.length', value: 0.18 },
    very_long_hair:{ channel: 'hair.length', value: 1.3 },
    // 머리카락 색
    blonde_hair:  { channel: 'hair.color', value: '#f5d060' },
    black_hair:   { channel: 'hair.color', value: '#1a1a2e' },
    brown_hair:   { channel: 'hair.color', value: '#7a4a1e' },
    white_hair:   { channel: 'hair.color', value: '#e8eaf0' },
    pink_hair:    { channel: 'hair.color', value: '#ff80b0' },
    silver_hair:  { channel: 'hair.color', value: '#c0c8d8' },
    red_hair:     { channel: 'hair.color', value: '#cc2200' },
    // 눈 색
    blue_eyes:    { channel: 'eye.color', value: '#2288ff' },
    red_eyes:     { channel: 'eye.color', value: '#ff2222' },
    green_eyes:   { channel: 'eye.color', value: '#22cc44' },
    purple_eyes:  { channel: 'eye.color', value: '#9933ff' },
    brown_eyes:   { channel: 'eye.color', value: '#885522' },
    // 체형
    petite:       { channel: 'body.height', value: 0.88 },
    tall:         { channel: 'body.height', value: 1.10 },
    large_breasts:{ channel: 'body.chest', value: 1.35 },
    small_breasts:{ channel: 'body.chest', value: 0.75 },
    // 헤어스타일
    ponytail:     { channel: 'hair.style', value: 'ponytail' },
    twintails:    { channel: 'hair.style', value: 'twintails' },
    braid:        { channel: 'hair.style', value: 'braid' },
    // 카메라
    close_up:     { channel: 'camera.zoom', value: 0.55 },
    from_behind:  { channel: 'camera.angle', value: 'back' },
    from_above:   { channel: 'camera.angle', value: 'high' },
    // 의상 색상 힌트
    school_uniform: { channel: 'outfit.hint', value: '#1133aa' },
};

export class PrevizScene {
    constructor(container) {
        this.container = container;
        this.THREE = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.animId = null;
        this._orbit = { dragging: false, lastX: 0, lastY: 0, theta: 0, phi: Math.PI / 6, radius: 3.6 };

        // 파트별 Points 객체
        this._parts = {};         // partId → THREE.Points
        this._partColors = {};    // partId → default color hex

        // sceneState
        this.state = this._defaultState();

        // 인터랙션
        this._raycaster = null;
        this._hoveredPart = null;
        this._onPartClick = null;   // 외부에서 주입 (previz-ui)
    }

    _defaultState() {
        return {
            hair: { length: 0.85, color: '#00eaff', style: 'straight' },
            eye:  { color: '#00eaff' },
            body: { height: 1.0, chest: 1.0 },
            camera: { zoom: 1.0, angle: 'front' },
            outfit: { hint: null },
            unmapped: [],
        };
    }

    // ── 초기화 ───────────────────────────────────────────────────
    async init() {
        this.THREE = await this._loadThree();
        const THREE = this.THREE;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x020c14, 1);
        this._setSize();
        this.container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x020c14, 0.038);

        const [w, h] = [this.container.clientWidth, this.container.clientHeight];
        this.camera = new THREE.PerspectiveCamera(42, w / h, 0.01, 100);
        this._updateCameraPos();

        this._raycaster = new THREE.Raycaster();
        this._raycaster.params.Points = { threshold: 0.06 };

        this._addGrid();
        this._buildAllParts();
        this._addNebula();
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

    // ── 단면 보간 (Catmull-Rom 스플라인) ─────────────────────────
    _interpSections(cp, steps) {
        // cp: [[y, rx, rz], ...], steps: 총 샘플 구간 수
        const result = [];
        const n = cp.length;
        for (let i = 0; i < n - 1; i++) {
            const p0 = cp[Math.max(0, i - 1)];
            const p1 = cp[i];
            const p2 = cp[i + 1];
            const p3 = cp[Math.min(n - 1, i + 2)];
            const seg = Math.max(2, Math.round(steps / (n - 1)));
            for (let s = 0; s < seg; s++) {
                const t = s / seg;
                const t2 = t * t, t3 = t2 * t;
                // Catmull-Rom
                const f = (a, b, c, d) =>
                    0.5 * ((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t2 + (-a+3*b-3*c+d)*t3);
                result.push([
                    f(p0[0], p1[0], p2[0], p3[0]),
                    f(p0[1], p1[1], p2[1], p3[1]),
                    f(p0[2], p1[2], p2[2], p3[2]),
                ]);
            }
        }
        result.push(cp[n - 1]);
        return result;
    }

    // ── 단면 배열에서 포인트 샘플링 ──────────────────────────────
    _sampleFromSections(sections, offsetX, offsetZ, count, partId) {
        const pts = [], cols = [];
        const angleSteps = 28; // 원주 방향 분해능

        for (let si = 0; si < sections.length; si++) {
            const [y, rx, rz] = sections[si];
            const n = Math.max(1, Math.round(count / sections.length));

            for (let i = 0; i < n; i++) {
                // 균등 원주 샘플 + 약간의 노이즈
                const angle = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
                const surf  = 0.90 + Math.random() * 0.20;  // 표면 ±10% 퍼짐

                pts.push(
                    Math.cos(angle) * rx * surf + offsetX,
                    y,
                    Math.sin(angle) * rz * surf + offsetZ,
                );
                this._pushBodyColor(cols, y, partId);
            }
        }
        return { pts: new Float32Array(pts), cols: new Float32Array(cols) };
    }

    // ── 머리카락 포인트 ───────────────────────────────────────────
    _buildHair(state) {
        const { length, color } = state.hair;
        const pts = [], cols = [];

        // 머리 위 볼륨 (길이에 상관없이 공통)
        const headCX = 0, headCY = 1.34, headCZ = -0.02;
        const hairCount = 900 + length * 600 | 0;

        // 두상을 감싸는 헤어 볼륨
        for (let i = 0; i < hairCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const elev  = Math.random() * Math.PI;
            const r     = 0.20 + Math.random() * 0.04;
            const x = Math.cos(angle) * Math.sin(elev) * r * 1.05 + headCX;
            const y = Math.cos(elev)  * r * 1.15 + headCY + 0.05;
            const z = Math.sin(angle) * Math.sin(elev) * r * 0.95 + headCZ - 0.02;
            pts.push(x, y, z);
            this._pushHexColor(cols, color, 0.85 + Math.random() * 0.15);
        }

        // 긴 머리 — 아래로 늘어지는 스트랜드
        if (length > 0.25) {
            const strandCount = (length * 1200) | 0;
            for (let i = 0; i < strandCount; i++) {
                const side  = (Math.random() - 0.5) * 0.38;
                const front = -0.10 - Math.random() * 0.10;  // 뒤쪽
                const dropY = headCY - 0.12 - Math.random() * (length * 0.95);
                const spread = Math.random() * 0.06;

                pts.push(
                    headCX + side + (Math.random() - 0.5) * spread,
                    dropY,
                    headCZ + front + (Math.random() - 0.5) * spread,
                );
                this._pushHexColor(cols, color, 0.70 + Math.random() * 0.25);
            }
        }

        return { pts: new Float32Array(pts), cols: new Float32Array(cols) };
    }

    // ── 전체 파트 빌드 ────────────────────────────────────────────
    _buildAllParts(state) {
        state = state || this.state;

        // 기존 파트 제거
        Object.values(this._parts).forEach(p => {
            this.scene.remove(p);
            p.geometry.dispose();
            p.material.dispose();
        });
        this._parts = {};

        const heightScale = state.body.height;
        const chestScale  = state.body.chest;

        // 몸통 단면 (가슴 크기 반영)
        const torsoCp = TORSO_CP.map(([y, rx, rz], i) => {
            let nrx = rx, nrz = rz;
            // 가슴 영역 (y 0.62~0.76) → chest scale 적용
            if (y >= 0.62 && y <= 0.76) {
                nrx = rx * (0.7 + chestScale * 0.3);
                nrz = rz * (0.7 + chestScale * 0.3);
            }
            return [y * heightScale, nrx, nrz];
        });
        const torsoBaked = this._interpSections(torsoCp, 60);

        const legCp  = LEG_CP.map( ([y, rx, rz]) => [y * heightScale, rx, rz]);
        const armCp  = ARM_CP.map( ([y, rx, rz]) => [y * heightScale, rx, rz]);
        const legBaked = this._interpSections(legCp, 40);
        const armBaked = this._interpSections(armCp, 30);

        // 파트별 포인트 생성
        const parts = [
            { id: PART.TORSO,  data: this._sampleFromSections(torsoBaked, 0, 0, 5500, PART.TORSO) },
            { id: PART.L_LEG,  data: this._sampleFromSections(legBaked, -0.105, 0, 2200, PART.L_LEG) },
            { id: PART.R_LEG,  data: this._sampleFromSections(legBaked,  0.105, 0, 2200, PART.R_LEG) },
            { id: PART.L_ARM,  data: this._sampleArm(-1, armBaked, 1800) },
            { id: PART.R_ARM,  data: this._sampleArm( 1, armBaked, 1800) },
        ];

        parts.forEach(({ id, data }) => {
            this._makePart(id, data.pts, data.cols, 0.0085);
        });

        // 눈 강조
        this._buildEyes(state);

        // 머리카락
        const hairData = this._buildHair(state);
        this._makePart(PART.HAIR, hairData.pts, hairData.cols, 0.0095);
    }

    _buildEyes(state) {
        if (this._parts[PART.HEAD]) {
            this.scene.remove(this._parts[PART.HEAD]);
            this._parts[PART.HEAD].geometry.dispose();
        }
        const pts = [], cols = [];
        const eyeHex = state.eye.color;

        EYE_POS.forEach(e => {
            for (let i = 0; i < 140; i++) {
                pts.push(
                    e.x + (Math.random() - 0.5) * 0.060,
                    e.y + (Math.random() - 0.5) * 0.038,
                    e.z + (Math.random() - 0.5) * 0.008,
                );
                this._pushHexColor(cols, eyeHex, 0.9 + Math.random() * 0.1);
            }
        });
        this._makePart(PART.HEAD, new Float32Array(pts), new Float32Array(cols), 0.012);
    }

    _sampleArm(side, sections, count) {
        const pts = [], cols = [];
        const xBase = side * 0.225;
        const xEnd  = side * 0.285;

        for (let si = 0; si < sections.length; si++) {
            const [y, rx, rz] = sections[si];
            const progress = si / (sections.length - 1);
            const xOff = xBase + (xEnd - xBase) * progress;
            const n = Math.max(1, Math.round(count / sections.length));

            for (let i = 0; i < n; i++) {
                const angle = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
                const surf  = 0.90 + Math.random() * 0.20;
                pts.push(
                    Math.cos(angle) * rx * surf + xOff,
                    y,
                    Math.sin(angle) * rz * surf,
                );
                this._pushBodyColor(cols, y, side < 0 ? PART.L_ARM : PART.R_ARM);
            }
        }
        return { pts: new Float32Array(pts), cols: new Float32Array(cols) };
    }

    _makePart(partId, positions, colors, size) {
        const THREE = this.THREE;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
        const mat = new THREE.PointsMaterial({
            size,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.90,
            sizeAttenuation: true,
            depthWrite: false,
        });
        const pts = new THREE.Points(geo, mat);
        pts.userData.partId = partId;
        this.scene.add(pts);
        this._parts[partId] = pts;
    }

    // ── 색상 헬퍼 ─────────────────────────────────────────────────
    _pushBodyColor(cols, y, partId) {
        // y 범위: ~1.55 ~ -0.95
        const t = Math.max(0, Math.min(1, (y + 1.0) / 2.6));
        cols.push(0.0 + t * 0.04, 0.42 + t * 0.58, 0.68 + t * 0.32);
    }

    _pushHexColor(cols, hex, brightness = 1.0) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        cols.push(r * brightness, g * brightness, b * brightness);
    }

    // ── 배경 성운 ─────────────────────────────────────────────────
    _addNebula() {
        const THREE = this.THREE;
        const count = 2200;
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i*3]   = (Math.random()-0.5)*22;
            pos[i*3+1] = (Math.random()-0.5)*14;
            pos[i*3+2] = (Math.random()-0.5)*22 - 5;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
            size: 0.030, color: 0x003d5c,
            blending: THREE.AdditiveBlending,
            transparent: true, opacity: 0.30, depthWrite: false,
        });
        this.scene.add(new THREE.Points(geo, mat));
    }

    _addGrid() {
        const g = new this.THREE.GridHelper(12, 24, 0x003344, 0x001622);
        this.scene.add(g);
    }

    // ── 태그 변경 → sceneState 갱신 ──────────────────────────────
    onTagsChanged(tags) {
        const newState = this._defaultState();
        newState.unmapped = [];

        tags.forEach(({ token }) => {
            const mapping = TAG_MAP[token];
            if (mapping) {
                const [domain, prop] = mapping.channel.split('.');
                if (newState[domain]) newState[domain][prop] = mapping.value;
            } else {
                // 키워드 자동추정
                const t = token.toLowerCase();
                if      (t.includes('long') && t.includes('hair')) newState.hair.length = 1.0;
                else if (t.includes('short') && t.includes('hair')) newState.hair.length = 0.18;
                else if (t.includes('blue') && t.includes('eye')) newState.eye.color = '#2288ff';
                else if (t.includes('tall')) newState.body.height = 1.10;
                else if (t.includes('petite') || t.includes('small')) newState.body.height = 0.88;
                else newState.unmapped.push(token);
            }
        });

        this.state = newState;
        this._buildAllParts(newState);
        this._updateCameraForState(newState);

        // 미매핑 태그 readout
        if (typeof window.__previzUpdateUnmapped === 'function')
            window.__previzUpdateUnmapped(newState.unmapped);

        console.log('[previz] 씬 업데이트. 매핑:', tags.length - newState.unmapped.length,
            '/ 미매핑:', newState.unmapped.length, newState.unmapped.slice(0, 5).join(', '));
    }

    _updateCameraForState(state) {
        if (state.camera.angle === 'back') {
            this._orbit.theta = Math.PI;
        } else if (state.camera.angle === 'high') {
            this._orbit.phi = Math.PI / 10;
        } else {
            this._orbit.theta = 0;
        }
        if (state.camera.zoom) {
            this._orbit.radius = 3.6 * state.camera.zoom * 2;
        }
        this._updateCameraPos();
    }

    // ── 바디파트 클릭 인터랙션 ───────────────────────────────────
    _bindEvents() {
        const el = this.renderer.domElement;
        const o = this._orbit;

        // 마우스 오빗
        el.addEventListener('mousedown', e => {
            o.dragging = true; o.lastX = e.clientX; o.lastY = e.clientY;
            o._startX = e.clientX; o._startY = e.clientY;
        });
        el.addEventListener('mousemove', e => {
            if (!o.dragging) return;
            const dx = e.clientX - o.lastX, dy = e.clientY - o.lastY;
            o.lastX = e.clientX; o.lastY = e.clientY;
            o.theta -= dx * 0.008;
            o.phi = Math.max(0.06, Math.min(Math.PI * 0.62, o.phi + dy * 0.006));
            this._updateCameraPos();
        });
        window.addEventListener('mouseup', e => {
            if (o.dragging) {
                const moved = Math.abs(e.clientX - o._startX) + Math.abs(e.clientY - o._startY);
                if (moved < 5) this._handleClick(e);
            }
            o.dragging = false;
        });
        el.addEventListener('wheel', e => {
            o.radius = Math.max(1.4, Math.min(10, o.radius + e.deltaY * 0.005));
            this._updateCameraPos();
            e.preventDefault();
        }, { passive: false });

        // 터치
        let lastDist = 0;
        el.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                o.dragging = true;
                o.lastX = e.touches[0].clientX; o.lastY = e.touches[0].clientY;
                o._startX = o.lastX; o._startY = o.lastY;
            } else if (e.touches.length === 2) {
                o.dragging = false;
                lastDist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
            }
        }, { passive: true });
        el.addEventListener('touchmove', e => {
            if (e.touches.length === 1 && o.dragging) {
                const dx = e.touches[0].clientX - o.lastX, dy = e.touches[0].clientY - o.lastY;
                o.lastX = e.touches[0].clientX; o.lastY = e.touches[0].clientY;
                o.theta -= dx * 0.008;
                o.phi = Math.max(0.06, Math.min(Math.PI * 0.62, o.phi + dy * 0.006));
                this._updateCameraPos();
            } else if (e.touches.length === 2) {
                const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
                o.radius = Math.max(1.4, Math.min(10, o.radius - (d - lastDist) * 0.01));
                lastDist = d;
                this._updateCameraPos();
            }
            e.preventDefault();
        }, { passive: false });
        el.addEventListener('touchend', e => {
            if (o.dragging && e.changedTouches.length > 0) {
                const moved = Math.abs(e.changedTouches[0].clientX - o._startX) + Math.abs(e.changedTouches[0].clientY - o._startY);
                if (moved < 10) this._handleClick(e.changedTouches[0]);
            }
            o.dragging = false;
        });
    }

    _handleClick(e) {
        if (!this._raycaster || !this.camera) return;
        const THREE = this.THREE;
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width)  * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        this._raycaster.setFromCamera(mouse, this.camera);
        const partMeshes = Object.values(this._parts);
        const hits = this._raycaster.intersectObjects(partMeshes);
        if (hits.length > 0) {
            const partId = hits[0].object.userData.partId;
            if (typeof window.__previzOnPartClick === 'function')
                window.__previzOnPartClick(partId, PART_NAME[partId], this.state, this);
        }
    }

    // ── 카메라 ────────────────────────────────────────────────────
    _updateCameraPos() {
        const o = this._orbit;
        const targetY = 0.55;
        this.camera.position.set(
            o.radius * Math.sin(o.phi) * Math.sin(o.theta),
            o.radius * Math.cos(o.phi) + targetY,
            o.radius * Math.sin(o.phi) * Math.cos(o.theta),
        );
        this.camera.lookAt(0, targetY, 0);
    }

    // ── 렌더 루프 ─────────────────────────────────────────────────
    _loop() {
        this.animId = requestAnimationFrame(() => this._loop());
        const t = performance.now() * 0.0004;
        // 미세 호흡
        Object.values(this._parts).forEach(p => {
            p.material.opacity = 0.82 + Math.sin(t + p.userData.partId) * 0.05;
        });
        this.renderer.render(this.scene, this.camera);
    }

    resize() {
        if (!this.renderer || !this.camera) return;
        this._setSize();
        const w = this.container.clientWidth, h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    _setSize() {
        const w = this.container.clientWidth  || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;
        this.renderer.setSize(w, h);
    }

    dispose() {
        if (this.animId) cancelAnimationFrame(this.animId);
        if (this.renderer) { this.renderer.dispose(); this.renderer.domElement.remove(); }
    }
}
