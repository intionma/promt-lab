/**
 * previz-main.js  —  홀로그램 프리비주얼 진입점
 * P0: 뷰 전환 + 태그 브릿지 + sceneState 스켈레톤
 */

import { PrevizScene }                    from './previz-scene.js';
import { initPartClickHandler, initHUD } from './previz-ui.js';
import { CalloutManager }                from './previz-callouts.js';
import { ensurePrevizTagsInDB }          from './previz-sync.js';

// ── 전역 씬 인스턴스 ──────────────────────────────────────────────
let _scene = null;
let _callouts = null;
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

    // 모바일 반응형 CSS (최초 1회)
    if (!document.getElementById('previz-mobile-style')) {
        const mStyle = document.createElement('style');
        mStyle.id = 'previz-mobile-style';
        mStyle.textContent = `
            @media (max-width: 640px) {
                #previz-header-subtitle { display: none !important; }
                #previz-tag-count { display: none !important; }
                #previz-close-btn { padding: 5px 10px !important; font-size: 11px !important; }
                #previz-readout { display: none !important; }
                #previz-part-panel {
                    top: auto !important; bottom: 56px !important;
                    right: 8px !important; left: 8px !important;
                    width: auto !important; max-height: 52vh !important;
                }
                #previz-hud {
                    bottom: 4px !important; left: 4px !important;
                    right: 4px !important; width: auto;
                    flex-wrap: nowrap !important; overflow-x: auto !important;
                    justify-content: flex-start !important;
                    -webkit-overflow-scrolling: touch;
                    scrollbar-width: none;
                }
                #previz-hud::-webkit-scrollbar { display: none; }
                .previz-callout { font-size: 10px !important; padding: 3px 7px !important; }
            }
        `;
        document.head.appendChild(mStyle);
    }

    // 프리비주얼 컨테이너 생성 or 재사용
    let container = document.getElementById('previz-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'previz-container';
        container.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:10000',
            'background:#13161c', 'display:flex',
            'flex-direction:column', 'overflow:hidden',
        ].join(';');

        // 헤더 바
        const header = document.createElement('div');
        header.id = 'previz-header';
        header.style.cssText = [
            'display:flex', 'align-items:center', 'justify-content:space-between',
            'padding:6px 12px', 'background:#1a1e26',
            'border-bottom:1px solid #252b35',
            'flex-shrink:0', 'font-family:system-ui,sans-serif',
            'min-height:40px',
        ].join(';');
        header.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                <span style="color:#d8dde8;font-size:13px;font-weight:600;white-space:nowrap;">
                    🎬 Preview Studio
                </span>
                <span id="previz-header-subtitle" style="color:#4a5260;font-size:11px;white-space:nowrap;">실시간 3D</span>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
                <span id="previz-tag-count" style="color:#6a7384;font-size:11px;background:#1e2330;padding:2px 8px;border-radius:4px;"></span>
                <button id="previz-close-btn" style="
                    background:#222830;border:1px solid #333a47;
                    color:#b8c0ce;border-radius:6px;padding:5px 12px;
                    font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap;
                " onmouseover="this.style.background='#2c3340'" onmouseout="this.style.background='#222830'">✕ 닫기</button>
            </div>
        `;
        container.appendChild(header);

        // 캔버스 영역
        const canvasWrap = document.createElement('div');
        canvasWrap.id = 'previz-canvas-wrap';
        canvasWrap.style.cssText = 'flex:1;position:relative;overflow:hidden;';
        container.appendChild(canvasWrap);

        // 프롬프트 readout (하단 — 모바일에서 숨김)
        const readout = document.createElement('div');
        readout.id = 'previz-readout';
        readout.style.cssText = [
            'padding:5px 12px', 'background:#161920',
            'border-top:1px solid #202530',
            'font-family:system-ui,sans-serif', 'font-size:10px',
            'color:#585f6e', 'line-height:1.5',
            'max-height:36px', 'overflow:hidden', 'flex-shrink:0',
        ].join(';');
        readout.textContent = '— 태그를 선택하면 캐릭터가 업데이트됩니다 —';
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
        initHUD(_scene);

        // Callout 오버레이 초기화
        ensurePrevizTagsInDB();
        _callouts = new CalloutManager(canvasWrap, _scene.camera, _scene.THREE);
        _scene.onFrameTick = () => _callouts.update();

        // 좌클릭 → Callout 패널 자동 오픈 브릿지
        window.__previzOpenCallout = (calloutId) => {
            _callouts?.openById(calloutId);
        };
    } else {
        _scene.resize();
        initHUD(_scene);
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
    _callouts?.dispose();
    _callouts = null;

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
