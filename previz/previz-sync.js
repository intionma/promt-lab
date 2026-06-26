/**
 * previz-sync.js — 홀로그램 ↔ 에디터 양방향 태그 연동 + DB 자동 추가
 */

// ── 홀로그램 파라미터에 필요한 표준 태그 ──────────────────────────
// DB에 없으면 자동으로 추가
const PREVIZ_STANDARD_TAGS = [
    // layer 3 — 헤어 컬러 확장
    { layer: 3, folder: '헤어 컬러|1개', t: 'white_hair',    n: 'black_hair',  k: '흰 머리',      c: 'hair_color' },
    { layer: 3, folder: '헤어 컬러|1개', t: 'pink_hair',     n: 'black_hair',  k: '핑크 머리',    c: 'hair_color' },
    { layer: 3, folder: '헤어 컬러|1개', t: 'silver_hair',   n: 'black_hair',  k: '은발',         c: 'hair_color' },
    { layer: 3, folder: '헤어 컬러|1개', t: 'red_hair',      n: 'black_hair',  k: '빨간 머리',    c: 'hair_color' },
    { layer: 3, folder: '헤어 컬러|1개', t: 'purple_hair',   n: 'black_hair',  k: '보라 머리',    c: 'hair_color' },
    { layer: 3, folder: '헤어 컬러|1개', t: 'blue_hair',     n: 'black_hair',  k: '파란 머리',    c: 'hair_color' },
    { layer: 3, folder: '헤어 컬러|1개', t: 'green_hair',    n: 'black_hair',  k: '초록 머리',    c: 'hair_color' },
    { layer: 3, folder: '헤어 컬러|1개', t: 'orange_hair',   n: 'black_hair',  k: '주황 머리',    c: 'hair_color' },
    // layer 3 — 헤어 스타일 확장
    { layer: 3, folder: '헤어 스타일|1~2개', t: 'twintails',    n: 'ponytail', k: '트윈테일',     c: 'hair_style' },
    { layer: 3, folder: '헤어 스타일|1~2개', t: 'braid',         n: '',         k: '브레이드',     c: 'hair_style' },
    { layer: 3, folder: '헤어 스타일|1~2개', t: 'very_long_hair',n: 'short_hair',k: '매우 긴 머리',c: 'hair_len' },
    { layer: 3, folder: '헤어 스타일|1~2개', t: 'medium_hair',   n: '',         k: '중간 길이 머리',c: 'hair_len' },
    // layer 3 — 눈 색 확장
    { layer: 3, folder: '눈동자 (Eyes)|1개', t: 'green_eyes',   n: '',         k: '초록 눈',      c: 'eye_color' },
    { layer: 3, folder: '눈동자 (Eyes)|1개', t: 'purple_eyes',  n: '',         k: '보라 눈',      c: 'eye_color' },
    { layer: 3, folder: '눈동자 (Eyes)|1개', t: 'brown_eyes',   n: '',         k: '갈색 눈',      c: 'eye_color' },
    { layer: 3, folder: '눈동자 (Eyes)|1개', t: 'golden_eyes',  n: '',         k: '금색 눈',      c: 'eye_color' },
    // layer 4 — 의상 확장
    { layer: 4, folder: '의상 (Clothes)|1~2개', t: 'dress',         n: 'pants',    k: '드레스',       c: 'clothes' },
    { layer: 4, folder: '의상 (Clothes)|1~2개', t: 'casual',        n: '',         k: '캐주얼 의상',  c: 'clothes' },
    { layer: 4, folder: '의상 (Clothes)|1~2개', t: 'sportswear',    n: '',         k: '스포츠웨어',   c: 'clothes' },
    { layer: 4, folder: '의상 (Clothes)|1~2개', t: 'gothic_lolita', n: '',         k: '고딕 로리타',  c: 'clothes' },
    { layer: 4, folder: '의상 (Clothes)|1~2개', t: 'kimono',        n: '',         k: '기모노',       c: 'clothes' },
    { layer: 4, folder: '의상 (Clothes)|1~2개', t: 'maid_uniform',  n: '',         k: '메이드 복장',  c: 'clothes' },
    { layer: 4, folder: '의상 (Clothes)|1~2개', t: 'white_dress',   n: '',         k: '흰 드레스',    c: 'clothes' },
    // layer 5 — 포즈 확장
    { layer: 5, folder: '손 & 팔 제스처|자유', t: 'arms_up',       n: '',         k: '팔 들기',      c: '' },
    // layer 6 — 환경 확장
    { layer: 6, folder: '장소 & 공간|1개', t: 'bedroom',        n: '',         k: '침실',         c: 'location' },
    { layer: 6, folder: '장소 & 공간|1개', t: 'street',         n: '',         k: '거리',         c: 'location' },
    // layer 6 — 날씨
    { layer: 6, folder: '날씨 & 분위기|자유', t: 'rain',           n: '',         k: '비',           c: '' },
    { layer: 6, folder: '날씨 & 분위기|자유', t: 'snow',           n: '',         k: '눈',           c: '' },
];

// ── DB 자동 추가 ─────────────────────────────────────────────────
export function ensurePrevizTagsInDB() {
    const promptDB = window.__getPromptDB?.();
    if (!promptDB) return;

    let changed = false;

    PREVIZ_STANDARD_TAGS.forEach(({ layer, folder, t, n, k, c }) => {
        if (!promptDB[layer]) promptDB[layer] = {};

        // 폴더 없으면 생성
        if (!promptDB[layer][folder]) {
            promptDB[layer][folder] = [];
        }

        const arr = promptDB[layer][folder];
        // 이미 있는지 확인 (token 기준)
        const exists = arr.some(item => item.t === t);
        if (!exists) {
            arr.push({ t, n, k, c });
            changed = true;
        }
    });

    if (changed) {
        window.__savePromptDB?.();
        console.log('[previz-sync] DB에 홀로그램 표준 태그 추가 완료');
    }
}

// ── 충돌 그룹 판별 ────────────────────────────────────────────────
// 같은 c(충돌그룹)에 있는 기존 태그를 제거하고 새 태그 삽입
function getConflictGroup(token) {
    const map = window.__getActiveTagsMap?.() || {};
    return map[token]?.c || null;
}

// ── 핵심: 홀로그램 → 에디터 태그 적용 ────────────────────────────
export function applyTokenToEditor(token, options = {}) {
    const {
        layerHint = null,   // 강제 레이어 번호
        removeGroup = true, // 충돌 그룹 자동 제거
        silent = false,     // syncFromManualInput 호출 여부
    } = options;

    const states   = window.__getContextStates?.();
    const ctx      = window.__getCurrentContext?.();
    const map      = window.__getActiveTagsMap?.() || {};
    if (!states || !ctx) return;

    // 레이어 결정
    const meta  = map[token];
    const layer = layerHint ?? meta?.layer ?? 5;   // 없으면 레이어 5 기본

    const textarea = document.getElementById(`layer-${layer}`);
    if (!textarea) return;

    let content = textarea.value;

    // 충돌 그룹 제거
    if (removeGroup) {
        const group = meta?.c || getConflictGroup(token);
        if (group) {
            // 같은 레이어, 같은 c 값을 가진 모든 토큰 제거
            Object.keys(map).forEach(existing => {
                if (map[existing]?.layer === layer && map[existing]?.c === group && existing !== token) {
                    content = (window.__removeTagFromContent?.(existing, content)) ?? content;
                }
            });
        }
    }

    // 이미 있으면 그대로
    if (window.__isTagActive?.(token, content)) return;

    // 토큰 삽입
    content = content ? `${content}, ${token}` : token;
    textarea.value = content.split(',').map(s => s.trim()).filter(Boolean).join(', ');
    if (states[ctx]) states[ctx][layer - 1] = textarea.value;

    if (!silent) window.__syncFromManualInput?.(layer);
}

// ── 홀로그램 → 에디터 토큰 제거 ─────────────────────────────────
export function removeTokenFromEditor(token, layerHint = null) {
    const map   = window.__getActiveTagsMap?.() || {};
    const states = window.__getContextStates?.();
    const ctx   = window.__getCurrentContext?.();
    if (!states || !ctx) return;

    const layer = layerHint ?? (map[token]?.layer) ?? 5;
    const textarea = document.getElementById(`layer-${layer}`);
    if (!textarea) return;

    const newContent = (window.__removeTagFromContent?.(token, textarea.value)) ?? textarea.value;
    textarea.value = newContent;
    if (states[ctx]) states[ctx][layer - 1] = newContent;
    window.__syncFromManualInput?.(layer);
}

// ── 에디터에서 현재 선택된 태그 읽기 ─────────────────────────────
export function getEditorActiveTags() {
    const states = window.__getContextStates?.();
    const ctx    = window.__getCurrentContext?.();
    const map    = window.__getActiveTagsMap?.() || {};
    if (!states || !ctx) return [];

    const layerTexts = states[ctx] || [];
    const seen = new Set();
    const tags = [];

    layerTexts.forEach((text, li) => {
        if (!text) return;
        text.split(',').forEach(raw => {
            const clean = raw.trim()
                .replace(/^\(+|\)+$/g, '')
                .replace(/:[0-9.]+$/, '')
                .trim();
            if (!clean || seen.has(clean)) return;
            seen.add(clean);
            tags.push({
                token: clean,
                layer: li + 1,
                kor: map[clean]?.kor || clean,
                c: map[clean]?.c || '',
                color: map[clean]?.color || '',
            });
        });
    });

    return tags;
}
