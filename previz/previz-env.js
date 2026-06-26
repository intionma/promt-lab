/**
 * previz-env.js — 날씨 파티클 / 태그 매핑
 */

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
        if (type === 'clear' || !type) return;

        const THREE = this.THREE;
        const isRain   = type === 'rain';
        const isPetals = type === 'petals';
        const count = isRain ? 1200 : isPetals ? 350 : 800;
        const pos = new Float32Array(count * 3);
        this._velocities = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            pos[i*3]   = (Math.random() - 0.5) * 10;
            pos[i*3+1] = Math.random() * 6;
            pos[i*3+2] = (Math.random() - 0.5) * 10;
            if (isRain) {
                this._velocities[i*3]   = (Math.random() - 0.5) * 0.005;
                this._velocities[i*3+1] = -(0.04 + Math.random() * 0.03);
                this._velocities[i*3+2] = (Math.random() - 0.5) * 0.005;
            } else if (isPetals) {
                // 꽃잎: 옆으로 크게 흩날리며 천천히 낙하
                this._velocities[i*3]   = (Math.random() - 0.5) * 0.022;
                this._velocities[i*3+1] = -(0.006 + Math.random() * 0.006);
                this._velocities[i*3+2] = (Math.random() - 0.5) * 0.022;
            } else { // snow
                this._velocities[i*3]   = (Math.random() - 0.5) * 0.008;
                this._velocities[i*3+1] = -(0.008 + Math.random() * 0.006);
                this._velocities[i*3+2] = (Math.random() - 0.5) * 0.005;
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
            size:    isRain ? 0.018 : isPetals ? 0.05  : 0.035,
            color:   isRain ? 0x88ccff : isPetals ? 0xff9ec4 : 0xddeeff,
            blending: isPetals ? THREE.NormalBlending : THREE.AdditiveBlending,
            transparent: true,
            opacity: isRain ? 0.55 : isPetals ? 0.9 : 0.70,
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
