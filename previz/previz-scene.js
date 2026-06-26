/**
 * previz-scene.js  —  Three.js 씬·카메라·렌더 루프
 * P0: 빈 씬 + 청록-네이비 배경 + 커스텀 오빗 + 파티클 플레이스홀더
 */

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

export class PrevizScene {
    constructor(container) {
        this.container = container;
        this.THREE = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.animId = null;

        // 오빗 상태
        this._orbit = { dragging: false, lastX: 0, lastY: 0, theta: 0, phi: Math.PI / 5, radius: 4 };

        // sceneState
        this.sceneState = this._defaultState();

        // 파티클 그룹
        this.characterPoints = null;
        this.envPoints = null;
    }

    _defaultState() {
        return {
            character: { visible: true },
            unmapped: [],
        };
    }

    async init() {
        // Three.js 동적 로드
        this.THREE = await this._loadThree();
        const THREE = this.THREE;

        // 렌더러
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x020c14, 1);
        this._setSize();
        this.container.appendChild(this.renderer.domElement);

        // 씬
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x020c14, 0.08);

        // 카메라
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
        this._updateCameraPos();

        // 앰비언트 라이트 (약하게)
        const ambient = new THREE.AmbientLight(0x003040, 0.5);
        this.scene.add(ambient);

        // 그리드 (바닥 레퍼런스)
        this._addGrid();

        // 플레이스홀더 파티클 (P1에서 실제 인체로 교체)
        this._addPlaceholderFigure();

        // 배경 성운 파티클
        this._addNebulaParticles();

        // 이벤트
        this._bindOrbitEvents();
        window.addEventListener('resize', () => this.resize());

        // 루프
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

    // ── 그리드 ────────────────────────────────────────────────────
    _addGrid() {
        const THREE = this.THREE;
        const grid = new THREE.GridHelper(10, 20, 0x003344, 0x001822);
        grid.position.y = -1.1;
        this.scene.add(grid);
    }

    // ── 플레이스홀더 파티클 (P0용 임시) ──────────────────────────
    _addPlaceholderFigure() {
        const THREE = this.THREE;
        const pts = this._samplePlaceholderFigure(8000);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));

        // 거리별 색상 변화를 위한 color 속성
        const colors = new Float32Array(pts.length);
        for (let i = 0; i < pts.length / 3; i++) {
            const y = pts[i * 3 + 1];
            // 위(머리)=밝은 시안, 아래(발)=딥 블루
            const t = Math.max(0, Math.min(1, (y + 1.1) / 2.2));
            colors[i * 3 + 0] = 0.0 + t * 0.0;
            colors[i * 3 + 1] = 0.6 + t * 0.4;
            colors[i * 3 + 2] = 0.8 + t * 0.2;
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 0.018,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.85,
            sizeAttenuation: true,
            depthWrite: false,
        });

        this.characterPoints = new THREE.Points(geo, mat);
        this.scene.add(this.characterPoints);
    }

    // ── 임시 인체 포인트 샘플링 (P1에서 교체) ───────────────────
    _samplePlaceholderFigure(count) {
        const pts = [];
        const rand = () => (Math.random() - 0.5) * 2;

        const parts = [
            // [cx, cy, cz, rx, ry, rz, weight]
            // 머리 (애니 비율: 약간 큰 타원)
            { cx: 0, cy: 0.85, cz: 0, rx: 0.22, ry: 0.26, rz: 0.20, w: 12 },
            // 목
            { cx: 0, cy: 0.55, cz: 0, rx: 0.07, ry: 0.08, rz: 0.07, w: 3 },
            // 가슴/몸통 상부
            { cx: 0, cy: 0.25, cz: 0, rx: 0.20, ry: 0.25, rz: 0.13, w: 14 },
            // 허리 (잘록)
            { cx: 0, cy: -0.05, cz: 0, rx: 0.14, ry: 0.22, rz: 0.11, w: 8 },
            // 골반
            { cx: 0, cy: -0.25, cz: 0, rx: 0.19, ry: 0.22, rz: 0.13, w: 10 },
            // 왼쪽 허벅지
            { cx: -0.14, cy: -0.55, cz: 0, rx: 0.09, ry: 0.22, rz: 0.09, w: 8 },
            // 오른쪽 허벅지
            { cx: 0.14, cy: -0.55, cz: 0, rx: 0.09, ry: 0.22, rz: 0.09, w: 8 },
            // 왼쪽 종아리
            { cx: -0.13, cy: -0.88, cz: 0.02, rx: 0.07, ry: 0.20, rz: 0.07, w: 6 },
            // 오른쪽 종아리
            { cx: 0.13, cy: -0.88, cz: 0.02, rx: 0.07, ry: 0.20, rz: 0.07, w: 6 },
            // 왼팔 상완
            { cx: -0.34, cy: 0.20, cz: 0, rx: 0.07, ry: 0.20, rz: 0.07, w: 5 },
            // 오른팔 상완
            { cx: 0.34, cy: 0.20, cz: 0, rx: 0.07, ry: 0.20, rz: 0.07, w: 5 },
            // 왼팔 전완
            { cx: -0.38, cy: -0.08, cz: 0, rx: 0.055, ry: 0.17, rz: 0.055, w: 4 },
            // 오른팔 전완
            { cx: 0.38, cy: -0.08, cz: 0, rx: 0.055, ry: 0.17, rz: 0.055, w: 4 },
            // 눈 영역 밀도 강조 (왼/오)
            { cx: -0.08, cy: 0.88, cz: 0.18, rx: 0.05, ry: 0.03, rz: 0.02, w: 5 },
            { cx: 0.08, cy: 0.88, cz: 0.18, rx: 0.05, ry: 0.03, rz: 0.02, w: 5 },
        ];

        const totalW = parts.reduce((s, p) => s + p.w, 0);

        parts.forEach(p => {
            const n = Math.round((p.w / totalW) * count);
            for (let i = 0; i < n; i++) {
                // 타원 표면 샘플링 (균등분포)
                let x, y, z, len;
                do {
                    x = rand(); y = rand(); z = rand();
                    len = Math.sqrt(x * x + y * y + z * z);
                } while (len < 0.0001);
                x /= len; y /= len; z /= len;

                // 타원 반지름 적용 + 표면 노이즈
                const noise = 0.92 + Math.random() * 0.16;
                pts.push(
                    p.cx + x * p.rx * noise,
                    p.cy + y * p.ry * noise,
                    p.cz + z * p.rz * noise,
                );
            }
        });

        return new Float32Array(pts);
    }

    // ── 배경 성운 파티클 ──────────────────────────────────────────
    _addNebulaParticles() {
        const THREE = this.THREE;
        const count = 3000;
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 20;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 20 - 5;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
            size: 0.025,
            color: 0x004466,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
        });
        this.scene.add(new THREE.Points(geo, mat));
    }

    // ── 커스텀 오빗 ───────────────────────────────────────────────
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
            o.phi = Math.max(0.1, Math.min(Math.PI * 0.7, o.phi + dy * 0.006));
            this._updateCameraPos();
        });
        el.addEventListener('mouseup', () => { o.dragging = false; });
        el.addEventListener('mouseleave', () => { o.dragging = false; });
        el.addEventListener('wheel', e => {
            o.radius = Math.max(1.5, Math.min(10, o.radius + e.deltaY * 0.005));
            this._updateCameraPos();
            e.preventDefault();
        }, { passive: false });

        // 터치 오빗
        let lastTouchDist = 0;
        el.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                o.dragging = true;
                o.lastX = e.touches[0].clientX;
                o.lastY = e.touches[0].clientY;
            }
            if (e.touches.length === 2) {
                o.dragging = false;
                lastTouchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY,
                );
            }
        }, { passive: true });
        el.addEventListener('touchmove', e => {
            if (e.touches.length === 1 && o.dragging) {
                const dx = e.touches[0].clientX - o.lastX;
                const dy = e.touches[0].clientY - o.lastY;
                o.lastX = e.touches[0].clientX;
                o.lastY = e.touches[0].clientY;
                o.theta -= dx * 0.008;
                o.phi = Math.max(0.1, Math.min(Math.PI * 0.7, o.phi + dy * 0.006));
                this._updateCameraPos();
            }
            if (e.touches.length === 2) {
                const d = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY,
                );
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
        this.camera.position.set(
            o.radius * Math.sin(o.phi) * Math.sin(o.theta),
            o.radius * Math.cos(o.phi),
            o.radius * Math.sin(o.phi) * Math.cos(o.theta),
        );
        this.camera.lookAt(0, 0, 0);
    }

    // ── 태그 변경 콜백 ────────────────────────────────────────────
    onTagsChanged(tags) {
        // P2에서 mapper 연결 예정
        // P0에서는 태그 수만 콘솔에 출력
        console.log('[previz] 태그 업데이트:', tags.length, '개',
            tags.map(t => t.token).join(', '));
    }

    // ── 렌더 루프 ─────────────────────────────────────────────────
    _loop() {
        this.animId = requestAnimationFrame(() => this._loop());

        // 파티클 미세 호흡 애니메이션
        if (this.characterPoints) {
            const t = performance.now() * 0.0005;
            this.characterPoints.rotation.y = Math.sin(t * 0.3) * 0.02;
            this.characterPoints.material.opacity = 0.75 + Math.sin(t) * 0.08;
        }

        this.renderer.render(this.scene, this.camera);
    }

    // ── 리사이즈 ──────────────────────────────────────────────────
    resize() {
        if (!this.renderer || !this.camera) return;
        this._setSize();
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    _setSize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.renderer.setSize(w, h);
    }

    // ── 정리 ─────────────────────────────────────────────────────
    dispose() {
        if (this.animId) cancelAnimationFrame(this.animId);
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.domElement.remove();
        }
    }
}
