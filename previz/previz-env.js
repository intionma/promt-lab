/**
 * previz-env.js — 환경 프리셋 / 날씨 파티클 / 배경 포인트클라우드
 * P4: park / indoor / street / sky + rain / snow / clear
 */

// ── 환경 프리셋 ───────────────────────────────────────────────────
export const ENV_PRESETS = {
    park: {
        label: '공원',
        fogColor: 0x020c14,
        fogDensity: 0.035,
        ambientColor: '#003a28',
        buildPoints(THREE) { return buildPark(THREE); },
    },
    indoor: {
        label: '실내',
        fogColor: 0x06090f,
        fogDensity: 0.060,
        ambientColor: '#1a0a30',
        buildPoints(THREE) { return buildIndoor(THREE); },
    },
    street: {
        label: '거리',
        fogColor: 0x020810,
        fogDensity: 0.045,
        ambientColor: '#0a1a00',
        buildPoints(THREE) { return buildStreet(THREE); },
    },
    sky: {
        label: '하늘',
        fogColor: 0x000814,
        fogDensity: 0.018,
        ambientColor: '#000d28',
        buildPoints(THREE) { return buildSky(THREE); },
    },
};

// ── 공원 ─────────────────────────────────────────────────────────
function buildPark(THREE) {
    const pts = [], cols = [];

    // 지면
    for (let i = 0; i < 600; i++) {
        const x = (Math.random() - 0.5) * 14;
        const z = (Math.random() - 0.5) * 12 - 2;
        pts.push(x, 0, z);
        cols.push(0, 0.22 + Math.random() * 0.12, 0.08 + Math.random() * 0.06);
    }

    // 나무 3그루
    [[-3.5, -2.5], [3.8, -3], [0.2, -5]].forEach(([tx, tz]) => {
        // 기둥
        for (let i = 0; i < 60; i++) {
            const angle = Math.random() * Math.PI * 2;
            const y = Math.random() * 1.8;
            pts.push(tx + Math.cos(angle) * 0.08, y, tz + Math.sin(angle) * 0.08);
            cols.push(0.10, 0.20, 0.08);
        }
        // 수관
        for (let i = 0; i < 200; i++) {
            const angle = Math.random() * Math.PI * 2;
            const elev  = Math.random() * Math.PI;
            const r = 0.55 + Math.random() * 0.3;
            pts.push(
                tx + Math.cos(angle) * Math.sin(elev) * r,
                1.8 + Math.cos(elev) * r * 0.7,
                tz + Math.sin(angle) * Math.sin(elev) * r,
            );
            cols.push(0, 0.38 + Math.random() * 0.20, 0.10 + Math.random() * 0.08);
        }
    });

    // 벤치
    for (let i = 0; i < 40; i++) {
        pts.push(-1.8 + Math.random() * 1.2, 0.28 + Math.random() * 0.12, -1.5 + Math.random() * 0.3);
        cols.push(0.25, 0.15, 0.05);
    }

    return makePts(THREE, pts, cols, 0.028, 0x223300);
}

// ── 실내 (침실/소파) ─────────────────────────────────────────────
function buildIndoor(THREE) {
    const pts = [], cols = [];

    // 바닥
    for (let i = 0; i < 400; i++) {
        pts.push((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 8 - 1);
        cols.push(0.06, 0.04, 0.10);
    }
    // 뒷벽
    for (let i = 0; i < 300; i++) {
        pts.push((Math.random() - 0.5) * 10, Math.random() * 3, -5);
        cols.push(0.05, 0.03, 0.12);
    }
    // 창문 (빛줄기)
    for (let i = 0; i < 120; i++) {
        const wx = 1.5 + Math.random() * 1.2;
        const wy = 1.0 + Math.random() * 1.2;
        pts.push(wx, wy, -4.95 + Math.random() * 0.05);
        cols.push(0.35 + Math.random() * 0.3, 0.6 + Math.random() * 0.2, 0.8 + Math.random() * 0.15);
    }
    // 소파
    for (let i = 0; i < 180; i++) {
        const sx = (Math.random() - 0.5) * 2.4;
        const sy = 0.25 + Math.random() * 0.35;
        const sz = -2.5 + Math.random() * 0.6;
        pts.push(sx, sy, sz);
        cols.push(0.18, 0.08, 0.28);
    }
    // 침대
    for (let i = 0; i < 180; i++) {
        pts.push(-2.5 + Math.random() * 1.8, 0.22 + Math.random() * 0.15, -1 + Math.random() * 1.8);
        cols.push(0.28, 0.22, 0.38);
    }

    return makePts(THREE, pts, cols, 0.030, 0x06090f);
}

// ── 거리 ──────────────────────────────────────────────────────────
function buildStreet(THREE) {
    const pts = [], cols = [];

    // 도로
    for (let i = 0; i < 500; i++) {
        pts.push((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 12 - 1);
        cols.push(0.06, 0.07, 0.08);
    }
    // 가로등 2개
    [[-3, -3], [3, -3]].forEach(([lx, lz]) => {
        for (let i = 0; i < 30; i++) {
            pts.push(lx + (Math.random() - 0.5) * 0.08, Math.random() * 2.5, lz + (Math.random() - 0.5) * 0.08);
            cols.push(0.15, 0.15, 0.12);
        }
        // 빛
        for (let i = 0; i < 60; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * 0.5;
            pts.push(lx + Math.cos(angle) * r, 2.4 + Math.random() * 0.2, lz + Math.sin(angle) * r);
            cols.push(0.6, 0.55, 0.2);
        }
    });
    // 건물 실루엣 (뒷배경)
    [[-5, -6, 1.2, 3], [5, -6, 1.0, 2.5], [0, -7, 0.8, 2]].forEach(([bx, bz, bw, bh]) => {
        for (let i = 0; i < 120; i++) {
            pts.push(bx + (Math.random() - 0.5) * bw * 2, Math.random() * bh, bz + (Math.random() - 0.5) * 0.5);
            cols.push(0.04, 0.06, 0.10);
        }
    });

    return makePts(THREE, pts, cols, 0.028, 0x020810);
}

// ── 하늘 (야외+구름) ──────────────────────────────────────────────
function buildSky(THREE) {
    const pts = [], cols = [];

    // 지평선 별
    for (let i = 0; i < 500; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 8 + Math.random() * 4;
        const y = 2 + Math.random() * 5;
        pts.push(Math.cos(angle) * r, y, Math.sin(angle) * r);
        const b = 0.5 + Math.random() * 0.5;
        cols.push(b * 0.5, b * 0.7, b);
    }
    // 구름
    [[0, 3.5, -6], [-3, 4, -5], [3, 4.5, -7]].forEach(([cx, cy, cz]) => {
        for (let i = 0; i < 150; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 0.6 + Math.random() * 0.8;
            pts.push(cx + Math.cos(angle) * r * 1.6, cy + (Math.random() - 0.5) * 0.4, cz + Math.sin(angle) * r);
            const b = 0.3 + Math.random() * 0.25;
            cols.push(b * 0.6, b * 0.8, b);
        }
    });
    // 지면
    for (let i = 0; i < 300; i++) {
        pts.push((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 12 - 1);
        cols.push(0.05, 0.12, 0.08);
    }

    return makePts(THREE, pts, cols, 0.030, 0x000814);
}

function makePts(THREE, pts, cols, size, clearColor) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pts), 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(new Float32Array(cols), 3));
    const mat = new THREE.PointsMaterial({
        size, vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true, opacity: 0.75, depthWrite: false,
    });
    return { points: new THREE.Points(geo, mat), clearColor };
}

// ── 날씨 파티클 시스템 ────────────────────────────────────────────
export class WeatherSystem {
    constructor(THREE, scene) {
        this.THREE = THREE;
        this.scene = scene;
        this._pts = null;
        this._velocities = null;
        this._type = 'clear';
    }

    setWeather(type) {
        if (this._pts) { this.scene.remove(this._pts); this._pts = null; }
        this._type = type;
        if (type === 'clear') return;

        const THREE = this.THREE;
        const count = type === 'rain' ? 1200 : 800;
        const pos = new Float32Array(count * 3);
        this._velocities = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            pos[i*3]   = (Math.random() - 0.5) * 10;
            pos[i*3+1] = Math.random() * 6;
            pos[i*3+2] = (Math.random() - 0.5) * 10;
            // velocity
            this._velocities[i*3]   = type === 'rain' ? (Math.random() - 0.5) * 0.005 : (Math.random() - 0.5) * 0.008;
            this._velocities[i*3+1] = type === 'rain' ? -(0.04 + Math.random() * 0.03) : -(0.008 + Math.random() * 0.006);
            this._velocities[i*3+2] = (Math.random() - 0.5) * 0.005;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
            size: type === 'rain' ? 0.018 : 0.035,
            color: type === 'rain' ? 0x88ccff : 0xddeeFF,
            blending: THREE.AdditiveBlending,
            transparent: true, opacity: type === 'rain' ? 0.55 : 0.70,
            depthWrite: false,
        });
        this._pts = new THREE.Points(geo, mat);
        this.scene.add(this._pts);
    }

    update() {
        if (!this._pts || this._type === 'clear') return;
        const pos = this._pts.geometry.attributes.position.array;
        const vel = this._velocities;
        for (let i = 0; i < pos.length / 3; i++) {
            pos[i*3]   += vel[i*3];
            pos[i*3+1] += vel[i*3+1];
            pos[i*3+2] += vel[i*3+2];
            if (pos[i*3+1] < -1) {
                pos[i*3]   = (Math.random() - 0.5) * 10;
                pos[i*3+1] = 5.5;
                pos[i*3+2] = (Math.random() - 0.5) * 10;
            }
        }
        this._pts.geometry.attributes.position.needsUpdate = true;
    }

    dispose() {
        if (this._pts) { this.scene.remove(this._pts); this._pts = null; }
    }
}

// ── 태그 → 환경 매핑 ─────────────────────────────────────────────
export const ENV_TAG_MAP = {
    // 배경
    park:      { env: 'park' },   outdoors:   { env: 'park' },
    nature:    { env: 'park' },   garden:     { env: 'park' },
    indoors:   { env: 'indoor' }, bedroom:    { env: 'indoor' },
    classroom: { env: 'indoor' }, cafe:       { env: 'indoor' },
    street:    { env: 'street' }, city:       { env: 'street' },
    urban:     { env: 'street' }, road:       { env: 'street' },
    sky:       { env: 'sky' },    cloud:      { env: 'sky' },
    // 날씨
    rain:      { weather: 'rain' },  rainy:   { weather: 'rain' },
    snow:      { weather: 'snow' },  snowy:   { weather: 'snow' },
    // 시간대
    night:     { timeOfDay: 0.95 }, evening: { timeOfDay: 0.75 },
    morning:   { timeOfDay: 0.25 }, day:     { timeOfDay: 0.5  },
    sunset:    { timeOfDay: 0.70 },
};
