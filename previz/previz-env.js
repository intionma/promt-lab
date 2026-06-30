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

    _disposePts() {
        if (this._pts) {
            this.scene.remove(this._pts);
            this._pts.geometry.dispose();
            this._pts.material.dispose();
            this._pts = null;
        }
    }

    setWeather(type) {
        this._disposePts();
        this._type = type;
        if (type === 'clear' || !type) return;

        const THREE = this.THREE;
        const isRain   = type === 'rain';
        const isPetals = type === 'petals';
        const isSparks = type === 'sparks';
        const count = isRain ? 1200 : isPetals ? 350 : isSparks ? 400 : 800;
        const pos = new Float32Array(count * 3);
        this._velocities = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            pos[i*3]   = (Math.random() - 0.5) * 10;
            pos[i*3+1] = isSparks ? (Math.random() * 6 - 1) : Math.random() * 6;
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
            } else if (isSparks) {
                // 불꽃 스파크: 위로 떠오르는 잔불
                this._velocities[i*3]   = (Math.random() - 0.5) * 0.01;
                this._velocities[i*3+1] = (0.01 + Math.random() * 0.02);
                this._velocities[i*3+2] = (Math.random() - 0.5) * 0.01;
            } else { // snow
                this._velocities[i*3]   = (Math.random() - 0.5) * 0.008;
                this._velocities[i*3+1] = -(0.008 + Math.random() * 0.006);
                this._velocities[i*3+2] = (Math.random() - 0.5) * 0.005;
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
            size:    isRain ? 0.018 : isPetals ? 0.05 : isSparks ? 0.03 : 0.035,
            color:   isRain ? 0x88ccff : isPetals ? 0xff9ec4 : isSparks ? 0xffae3a : 0xddeeff,
            blending: isPetals ? THREE.NormalBlending : THREE.AdditiveBlending,
            transparent: true,
            opacity: isRain ? 0.55 : isPetals ? 0.9 : isSparks ? 0.85 : 0.70,
            depthWrite: false,
        });
        this._pts = new THREE.Points(geo, mat);
        this.scene.add(this._pts);
    }

    update() {
        if (!this._pts || this._type === 'clear') return;
        const pos = this._pts.geometry.attributes.position.array;
        const vel = this._velocities;
        const rising = this._type === 'sparks';
        for (let i = 0; i < pos.length / 3; i++) {
            pos[i*3]   += vel[i*3];
            pos[i*3+1] += vel[i*3+1];
            pos[i*3+2] += vel[i*3+2];
            if (rising) {
                // 위로 떠오른 잔불은 천장에서 바닥으로 재순환
                if (pos[i*3+1] > 6) {
                    pos[i*3]   = (Math.random() - 0.5) * 10;
                    pos[i*3+1] = -1;
                    pos[i*3+2] = (Math.random() - 0.5) * 10;
                }
            } else if (pos[i*3+1] < -1) {
                pos[i*3]   = (Math.random() - 0.5) * 10;
                pos[i*3+1] = 5.5;
                pos[i*3+2] = (Math.random() - 0.5) * 10;
            }
        }
        this._pts.geometry.attributes.position.needsUpdate = true;
    }

    dispose() {
        this._disposePts();
    }
}

