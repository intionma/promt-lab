/**
 * previz-main.js  —  홀로그램 프리비주얼 진입점
 * P0: 뷰 전환 + 태그 브릿지 + sceneState 스켈레톤
 */

import { PrevizScene }      from './previz-scene.js';
import { initPartClickHandler } from './previz-ui.js';

// ── 전역 씬 인스턴스 ──────────────────────────────────────────────
let _scene = null;
let _tagWatchInterval = null;
let _lastTagSnapshot = '';

// ── sceneState 스켈레톤 ───────────────────────────────────────────
function makeDefaultSceneState() {
    return {
        character: {
            visible: true,
            hair: { length: 0.5, color: '#00eaff' },
            body: { scale: 1.0, height: 1.0 },
            pose: 'stand',
            clothing: { top: 'none', bottom: 'none' },
        },
        environment: {
            preset: 'park',
            timeOfDay: 0.5,   // 0=새벽, 0.5=낮, 1=밤
            weather: 'clear',
        },
        camera: {
            fov: 45,
            angle: 'eye',     // 'high' | 'eye' | 'low'
        },
        lighting: {
            intensity: 1.0,
            color: '#00eaff',
        },
        unmapped: [],         // 시각화 안 된 태그 목록
    };
}

// ── 태그 읽기 헬퍼 ────────────────────────────────────────────────
export function getActiveTags() {
    const states  = window.__getContextStates  && window.__getContextStates();
    const ctx     = window.__getCurrentContext && window.__getCurrentContext();
    const metaMap = window.__getActiveTagsMap  && window.__getActiveTagsMap();
    if (!states || !ctx) return [];

    const layerTexts = states[ctx] || [];
    const seen = new Set();
    const tags = [];

    layerTexts.forEach((layerText, li) => {
        if (!layerText) return;
        layerText.split(',').forEach(raw => {
            // 가중치 괄호 및 공백 제거
            const clean = raw.trim()
                .replace(/^\(+|\)+$/g, '')
                .replace(/:[0-9.]+$/,  '')
                .trim();
            if (!clean || seen.has(clean)) return;
            seen.add(clean);

            const meta = metaMap?.[clean];
            tags.push({
                token: clean,
                kor:   meta?.kor   || clean,
                layer: li + 1,
                color: meta?.color || '',
            });
        });
    });

    return tags;
}

// ── 태그 변경 감지 ────────────────────────────────────────────────
function startTagWatch() {
    if (_tagWatchInterval) return;
    _tagWatchInterval = setInterval(() => {
        if (!_scene) return;
        const tags = getActiveTags();
        const snapshot = tags.map(t => t.token).sort().join(',');
        if (snapshot !== _lastTagSnapshot) {
            _lastTagSnapshot = snapshot;
            _scene.onTagsChanged(tags);
        }
    }, 300);
}

function stopTagWatch() {
    if (_tagWatchInterval) {
        clearInterval(_tagWatchInterval);
        _tagWatchInterval = null;
    }
}

// ── 뷰 전환 ──────────────────────────────────────────────────────
export async function openPreviz() {
    // 기존 패널 숨김
    ['panel-left', 'panel-mid', 'panel-right',
     'resize-handle-1', 'resize-handle-2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const tabbar = document.getElementById('mobile-tabbar');
    if (tabbar) tabbar.style.display = 'none';

    // 프리비주얼 컨테이너 생성 or 재사용
    let container = document.getElementById('previz-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'previz-container';
        container.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:10000',
            'background:#020c14', 'display:flex',
            'flex-direction:column', 'overflow:hidden',
        ].join(';');

        // 헤더 바
        const header = document.createElement('div');
        header.style.cssText = [
            'display:flex', 'align-items:center', 'justify-content:space-between',
            'padding:10px 16px', 'background:rgba(0,20,35,0.85)',
            'border-bottom:1px solid rgba(0,234,255,0.15)',
            'flex-shrink:0', 'font-family:monospace',
        ].join(';');
        header.innerHTML = `
            <span style="color:#00eaff;font-size:13px;letter-spacing:2px;font-weight:700;">
                ◈ HOLOGRAM PREVIZ
            </span>
            <div style="display:flex;gap:8px;align-items:center;">
                <span id="previz-tag-count" style="color:rgba(0,234,255,0.5);font-size:11px;"></span>
                <button id="previz-close-btn" style="
                    background:transparent;border:1px solid rgba(0,234,255,0.3);
                    color:#00eaff;border-radius:6px;padding:5px 14px;
                    font-size:12px;cursor:pointer;font-family:monospace;
                    letter-spacing:1px;
                ">✕ 닫기</button>
            </div>
        `;
        container.appendChild(header);

        // 캔버스 영역
        const canvasWrap = document.createElement('div');
        canvasWrap.id = 'previz-canvas-wrap';
        canvasWrap.style.cssText = 'flex:1;position:relative;overflow:hidden;';
        container.appendChild(canvasWrap);

        // 프롬프트 readout (하단)
        const readout = document.createElement('div');
        readout.id = 'previz-readout';
        readout.style.cssText = [
            'padding:8px 16px', 'background:rgba(0,10,20,0.9)',
            'border-top:1px solid rgba(0,234,255,0.1)',
            'font-family:monospace', 'font-size:11px',
            'color:rgba(0,234,255,0.6)', 'line-height:1.5',
            'max-height:60px', 'overflow:hidden', 'flex-shrink:0',
        ].join(';');
        readout.textContent = '— 태그 없음 —';
        container.appendChild(readout);

        document.body.appendChild(container);

        // 닫기 버튼
        document.getElementById('previz-close-btn').onclick = closePreviz;
    } else {
        container.style.display = 'flex';
    }

    // Three.js 씬 초기화
    const canvasWrap = document.getElementById('previz-canvas-wrap');
    if (!_scene) {
        _scene = new PrevizScene(canvasWrap);
        await _scene.init();
        initPartClickHandler(_scene);
    } else {
        _scene.resize();
    }

    // 현재 태그로 즉시 반영
    const tags = getActiveTags();
    _lastTagSnapshot = tags.map(t => t.token).sort().join(',');
    _scene.onTagsChanged(tags);
    updateReadout(tags);
    updateTagCount(tags.length);

    startTagWatch();
}

export function closePreviz() {
    stopTagWatch();

    const container = document.getElementById('previz-container');
    if (container) container.style.display = 'none';

    // 기존 패널 복원
    ['panel-left', 'panel-mid', 'panel-right',
     'resize-handle-1', 'resize-handle-2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    });
    const tabbar = document.getElementById('mobile-tabbar');
    if (tabbar) tabbar.style.display = '';
}

// ── 프롬프트 readout 갱신 ─────────────────────────────────────────
function updateReadout(tags) {
    const el = document.getElementById('previz-readout');
    if (!el) return;
    if (tags.length === 0) {
        el.textContent = '— 태그 없음 —';
        return;
    }
    el.textContent = tags.map(t => t.token).join(', ');
}

function updateTagCount(count) {
    const el = document.getElementById('previz-tag-count');
    if (el) el.textContent = `태그 ${count}개`;
}

// ── 메인 앱에 훅 연결 (updateMasterOutput 후 태그 읽기) ──────────
export function hookIntoApp() {
    // updateMasterOutput 감싸기 — 씬이 열려 있을 때만 갱신
    const orig = window.updateMasterOutput;
    if (typeof orig === 'function') {
        window.updateMasterOutput = function (...args) {
            const ret = orig.apply(this, args);
            if (_scene) {
                const tags = getActiveTags();
                updateReadout(tags);
                updateTagCount(tags.length);
            }
            return ret;
        };
    }
}
