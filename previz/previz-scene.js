/**
 * previz-scene.js  —  Three.js 씬·카메라·렌더 루프
 * P1: 단면 보간 방식 애니 인체 포인트클라우드
 */

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

// ── 애니 인체 단면 정의 ───────────────────────────────────────────
// sections: Y좌표(상→하), rx(좌우반경), rz(앞뒤반경), density(포인트 밀도 가중치)
// 총 신장 약 1.65 → 단위는 Three.js 유닛
const BODY_SECTIONS = [
    // 머리 꼭대기
    { y: 1.55, rx: 0.01, rz: 0.01, w: 0.2 },
    { y: 1.48, rx: 0.13, rz: 0.12, w: 1.0 },
    { y: 1.40, rx: 0.19, rz: 0.17, w: 1.5 },  // 머리 상부
    { y: 1.30, rx: 0.22, rz: 0.19, w: 2.0 },  // 머리 중부
    { y: 1.20, rx: 0.21, rz: 0.18, w: 2.0 },  // 눈 높이
    { y: 1.12, rx: 0.18, rz: 0.17, w: 1.5 },  // 코 높이
    { y: 1.05, rx: 0.15, rz: 0.15, w: 1.2 },  // 턱선
    // 목
    { y: 0.97, rx: 0.06, rz: 0.055, w: 0.8 },
    { y: 0.90, rx: 0.06, rz: 0.055, w: 0.8 },
    // 어깨
    { y: 0.83, rx: 0.22, rz: 0.11, w: 1.5 },
    { y: 0.77, rx: 0.22, rz: 0.11, w: 1.2 },
    // 가슴
    { y: 0.70, rx: 0.18, rz: 0.12, w: 1.5 },
    { y: 0.58, rx: 0.17, rz: 0.11, w: 1.2 },
    // 허리 (잘록)
    { y: 0.45, rx: 0.13, rz: 0.09, w: 1.0 },
    { y: 0.35, rx: 0.13, rz: 0.09, w: 1.0 },
    // 골반
    { y: 0.24, rx: 0.18, rz: 0.11, w: 1.5 },
    { y: 0.15, rx: 0.19, rz: 0.11, w: 1.5 },
    // 엉덩이 분기
    { y: 0.05, rx: 0.18, rz: 0.10, w: 1.2 },
];

// 왼/오른 다리 단면 (x 오프셋 적용)
const LEG_SECTIONS = [
    { y: -0.05, rx: 0.085, rz: 0.08, w: 1.2 },  // 허벅지 상
    { y: -0.20, rx: 0.080, rz: 0.075, w: 1.2 },
    { y: -0.35, rx: 0.072, rz: 0.068, w: 1.0 },  // 허벅지 하
    { y: -0.50, rx: 0.058, rz: 0.055, w: 0.9 },  // 무릎
    { y: -0.62, rx: 0.052, rz: 0.050, w: 0.8 },  // 종아리 상
    { y: -0.75, rx: 0.045, rz: 0.042, w: 0.8 },
    { y: -0.88, rx: 0.038, rz: 0.035, w: 0.7 },  // 발목
    { y: -0.96, rx: 0.035, rz: 0.065, w: 0.6 },  // 발
];

// 왼/오른 팔 단면 (어깨에서 시작, 약간 벌려서)
const ARM_SECTIONS = [
    { y: 0.82, rx: 0.055, rz: 0.050, w: 0.8 },  // 어깨
    { y: 0.68, rx: 0.050, rz: 0.045, w: 0.7 },  // 상완 중
    { y: 0.55, rx: 0.045, rz: 0.040, w: 0.7 },  // 팔꿈치
    { y: 0.42, rx: 0.038, rz: 0.034, w: 0.6 },  // 전완 상
    { y: 0.30, rx: 0.033, rz: 0.030, w: 0.6 },
    { y: 0.20, rx: 0.030, rz: 0.028, w: 0.5 },  // 손목
    { y: 0.13, rx: 0.038, rz: 0.025, w: 0.4 },  // 손
];

// 눈 위치 (밀도 강조)
const EYE_SPOTS = [
    { x: -0.082, y: 1.205, z: 0.175 },
    { x:  0.082, y: 1.205, z: 0.175 },
];

export class PrevizScene {
    constructor(container) {
        this.container = container;
        this.THREE = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.animId = null;
        this._orbit = { dragging: false, lastX: 0, lastY: 0, theta: 0, phi: Math.PI / 6, radius: 3.8 };
        this.characterPoints = null;
        this.unmappedLabels = [];
    }

    async init() {
        this.THREE = await this._loadThree();
        const THREE = this.THREE;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x020c14, 1);
        this._setSize();
        this.container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x020c14, 0.045);

        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(42, w / h, 0.01, 100);
        this._updateCameraPos();

        this._addGrid();
        this._buildFigure();
        this._addNebulaParticles();
        this._bindOrbitEvents();
        window.addEventListener('resize', () => this.resize());
        this._loop();
    }

    // ── Three.js 동적 로드 ────────────────────────────────────────
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

    // ── 인체 포인트 생성 ──────────────────────────────────────────
    _buildFigure(params = {}) {
        if (this.characterPoints) {
            this.scene.remove(this.characterPoints);
            this.characterPoints.geometry.dispose();
            this.characterPoints = null;
        }

        const totalPoints = 14000;
        const allPts = [];
        const allColors = [];

        // 몸통
        this._sampleSections(BODY_SECTIONS, 0, 0, totalPoints * 0.38, allPts, allColors);

        // 왼다리 / 오른다리
        this._sampleSections(LEG_SECTIONS, -0.11, 0, totalPoints * 0.16, allPts, allColors);
        this._sampleSections(LEG_SECTIONS,  0.11, 0, totalPoints * 0.16, allPts, allColors);

        // 왼팔 / 오른팔 (약간 벌린 각도)
        this._sampleArm(-1, totalPoints * 0.07, allPts, allColors);
        this._sampleArm( 1, totalPoints * 0.07, allPts, allColors);

        // 눈 포인트 강조
        EYE_SPOTS.forEach(e => {
            for (let i = 0; i < 120; i++) {
                const nx = (Math.random() - 0.5) * 0.055;
                const ny = (Math.random() - 0.5) * 0.035;
                const nz = (Math.random() - 0.5) * 0.010;
                allPts.push(e.x + nx, e.y + ny, e.z + nz);
                allColors.push(0.4, 1.0, 1.0);  // 더 밝은 시안
            }
        });

        const THREE = this.THREE;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(allPts), 3));
        geo.setAttribute('color',    new THREE.Float32BufferAttribute(new Float32Array(allColors), 3));

        const mat = new THREE.PointsMaterial({
            size: 0.012,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.90,
            sizeAttenuation: true,
            depthWrite: false,
        });

        this.characterPoints = new THREE.Points(geo, mat);
        // 살짝 위로 올려서 그리드 위에 서 있게
        this.characterPoints.position.y = 0.96;
        this.scene.add(this.characterPoints);
    }

    // ── 단면 목록을 따라 포인트 샘플링 ───────────────────────────
    _sampleSections(sections, offsetX, offsetZ, totalCount, pts, colors) {
        const totalW = sections.reduce((s, sec) => s + sec.w, 0);

        for (let si = 0; si < sections.length - 1; si++) {
            const s0 = sections[si];
            const s1 = sections[si + 1];
            const segW = (s0.w + s1.w) * 0.5;
            const n = Math.max(2, Math.round((segW / totalW) * totalCount));

            for (let i = 0; i < n; i++) {
                const t = Math.random();
                // 두 단면 사이 보간
                const y   = s0.y  + (s1.y  - s0.y)  * t;
                const rx  = s0.rx + (s1.rx - s0.rx) * t;
                const rz  = s0.rz + (s1.rz - s0.rz) * t;

                // 타원 둘레 균등 샘플 (표면에만)
                const angle = Math.random() * Math.PI * 2;
                const surfNoise = 0.88 + Math.random() * 0.24;
                const x = Math.cos(angle) * rx * surfNoise + offsetX;
                const z = Math.sin(angle) * rz * surfNoise + offsetZ;

                pts.push(x, y, z);
                this._pushColor(colors, y);
            }
        }
    }

    // ── 팔: 어깨에서 아래로 기울어진 방향으로 샘플링 ─────────────
    _sampleArm(side, totalCount, pts, colors) {
        // 팔이 몸에 살짝 붙어 있는 자연스러운 각도
        const xBase = side * 0.235;  // 어깨 X 위치
        const totalW = ARM_SECTIONS.reduce((s, sec) => s + sec.w, 0);

        for (let si = 0; si < ARM_SECTIONS.length - 1; si++) {
            const s0 = ARM_SECTIONS[si];
            const s1 = ARM_SECTIONS[si + 1];
            const segW = (s0.w + s1.w) * 0.5;
            const n = Math.max(2, Math.round((segW / totalW) * totalCount));

            for (let i = 0; i < n; i++) {
                const t = Math.random();
                const y  = s0.y  + (s1.y  - s0.y)  * t;
                const rx = s0.rx + (s1.rx - s0.rx) * t;
                const rz = s0.rz + (s1.rz - s0.rz) * t;

                // 팔이 몸통에서 벌어지는 정도 (위→아래로 살짝 벌어짐)
                const progress = si / (ARM_SECTIONS.length - 1);
                const xOff = xBase + side * progress * 0.06;

                const angle = Math.random() * Math.PI * 2;
                const noise = 0.88 + Math.random() * 0.24;
                pts.push(
                    Math.cos(angle) * rx * noise + xOff,
                    y,
                    Math.sin(angle) * rz * noise,
                );
                this._pushColor(colors, y);
            }
        }
    }

    // ── Y 높이에 따른 색상 (머리=밝은 시안 / 발=딥 블루) ─────────
    _pushColor(colors, y) {
        // y 범위: 약 1.55(머리 꼭대기) ~ -0.96(발바닥)
        const t = Math.max(0, Math.min(1, (y + 1.0) / 2.6));
        // 0(발)=딥 네이비, 1(머리)=밝은 시안
        colors.push(
            0.0  + t * 0.05,
            0.45 + t * 0.55,
            0.70 + t * 0.30,
        );
    }

    // ── 배경 성운 파티클 ──────────────────────────────────────────
    _addNebulaParticles() {
        const THREE = this.THREE;
        const count = 2500;
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3]     = (Math.random() - 0.5) * 22;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 22 - 5;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
            size: 0.028, color: 0x003d5c,
            blending: THREE.AdditiveBlending,
            transparent: true, opacity: 0.35, depthWrite: false,
        });
        this.scene.add(new THREE.Points(geo, mat));
    }

    // ── 그리드 ────────────────────────────────────────────────────
    _addGrid() {
        const THREE = this.THREE;
        const grid = new THREE.GridHelper(12, 24, 0x003344, 0x001622);
        this.scene.add(grid);
    }

    // ── 오빗 ─────────────────────────────────────────────────────
    _bindOrbitEvents() {
        const el = this.renderer.domElement;
        const o = this._orbit;

        el.addEventListener('mousedown', e => {
            o.dragging = true; o.lastX = e.clientX; o.lastY = e.clientY;
        });
        el.addEventListener('mousemove', e => {
            if (!o.dragging) return;
            const dx = e.clientX - o.lastX;
            const dy = e.clientY - o.lastY;
            o.lastX = e.clientX; o.lastY = e.clientY;
            o.theta -= dx * 0.008;
            o.phi = Math.max(0.08, Math.min(Math.PI * 0.65, o.phi + dy * 0.006));
            this._updateCameraPos();
        });
        window.addEventListener('mouseup', () => { o.dragging = false; });
        el.addEventListener('wheel', e => {
            o.radius = Math.max(1.5, Math.min(10, o.radius + e.deltaY * 0.005));
            this._updateCameraPos();
            e.preventDefault();
        }, { passive: false });

        let lastTouchDist = 0;
        el.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                o.dragging = true;
                o.lastX = e.touches[0].clientX;
                o.lastY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                o.dragging = false;
                lastTouchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY);
            }
        }, { passive: true });
        el.addEventListener('touchmove', e => {
            if (e.touches.length === 1 && o.dragging) {
                const dx = e.touches[0].clientX - o.lastX;
                const dy = e.touches[0].clientY - o.lastY;
                o.lastX = e.touches[0].clientX;
                o.lastY = e.touches[0].clientY;
                o.theta -= dx * 0.008;
                o.phi = Math.max(0.08, Math.min(Math.PI * 0.65, o.phi + dy * 0.006));
                this._updateCameraPos();
            } else if (e.touches.length === 2) {
                const d = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY);
                o.radius = Math.max(1.5, Math.min(10, o.radius - (d - lastTouchDist) * 0.01));
                lastTouchDist = d;
                this._updateCameraPos();
            }
            e.preventDefault();
        }, { passive: false });
        el.addEventListener('touchend', () => { o.dragging = false; });
    }

    _updateCameraPos() {
        const o = this._orbit;
        // 카메라 타깃: 인체 중심 (허리 높이 약 0.5)
        const targetY = 0.5;
        this.camera.position.set(
            o.radius * Math.sin(o.phi) * Math.sin(o.theta),
            o.radius * Math.cos(o.phi) + targetY,
            o.radius * Math.sin(o.phi) * Math.cos(o.theta),
        );
        this.camera.lookAt(0, targetY, 0);
    }

    // ── 태그 변경 콜백 (P2에서 mapper 연결) ─────────────────────
    onTagsChanged(tags) {
        console.log('[previz] 태그 업데이트:', tags.length, '개 →',
            tags.slice(0, 8).map(t => t.token).join(', '),
            tags.length > 8 ? `...+${tags.length - 8}` : '');
        // P2: 여기서 mapper → sceneState → _buildFigure(params) 호출
    }

    // ── 렌더 루프 ─────────────────────────────────────────────────
    _loop() {
        this.animId = requestAnimationFrame(() => this._loop());
        const t = performance.now() * 0.0004;

        if (this.characterPoints) {
            // 미세 호흡 애니메이션 (좌우 흔들림 최소화)
            this.characterPoints.material.opacity = 0.82 + Math.sin(t) * 0.06;
        }

        this.renderer.render(this.scene, this.camera);
    }

    resize() {
        if (!this.renderer || !this.camera) return;
        this._setSize();
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    _setSize() {
        const w = this.container.clientWidth || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;
        this.renderer.setSize(w, h);
    }

    dispose() {
        if (this.animId) cancelAnimationFrame(this.animId);
        if (this.renderer) { this.renderer.dispose(); this.renderer.domElement.remove(); }
    }
}
