"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, listAllStorageFiles } from "@/lib/supabase";
import { getSilhouettePref } from "@/lib/prefs";

export type Param = { id: string; value: number; min: number; max: number };
export type ViewMode = "fullbody" | "upperbody" | "free";

// 모델이 가진 모션·표정·아트메쉬 메타
export type ModelMeta = {
  motions: { group: string; count: number }[];
  expressions: string[];
  meshes: { index: number; id: string; part: string }[];
};

// 공유/딥링크용 뷰어 상태 스냅샷
export type ViewerState = {
  overrides: Record<string, number>;
  viewMode: ViewMode;
  free: { offsetX: number; offsetY: number; zoom: number };
  faceTrack: boolean;
};

// 부모(리뷰 페이지)가 뷰어를 제어하기 위한 핸들 (controlRef prop 으로 주입)
export interface ViewerHandle {
  setParam: (id: string, value: number) => void;
  releaseParam: (id: string) => void;
  resetAll: () => void;
  centerFace: () => void;
  freezeToBase: () => void;
  playMotion: (group: string, index: number) => void;
  playExpression: (name: string) => void;
  stopMotion: () => void;
  setAutoIdle: (on: boolean) => void;
  setBackground: (key: string) => void;
  setBackgroundImage: (url: string) => void;
  getState: () => ViewerState;
  applyState: (s: ViewerState) => void;
  screenshot: () => void;
  setMeshHidden: (index: number, hidden: boolean) => void;
  showAllMeshes: () => void;
  flashMesh: (index: number) => void;
  setMeshSelectMode: (on: boolean) => void;
  setParamSweep: (on: boolean) => void;
  setSilhouette: (on: boolean, color?: number) => void;
  // 두 모델 비교: 다른 창의 시선을 그대로 적용 (focusController 값 gx,gy)
  gazeTo: (gx: number, gy: number, instant: boolean) => void;
}

type Props = {
  sessionId: string;
  onParamsLoaded?: (params: Param[]) => void;
  onModelMeta?: (meta: ModelMeta) => void;
  onMeshPicked?: (index: number) => void;
  controlRef?: { current: ViewerHandle | null };
  // 두 모델 비교: 이 창의 시선(focusController 값)이 바뀌면 알림 → 다른 창에 전달
  onGaze?: (gx: number, gy: number, instant: boolean) => void;
};

// 배경 옵션 (캔버스 컨테이너 CSS 배경 + 스크린샷 합성용 draw)
export type BgOption = {
  key: string;
  label: string;
  css: string;
  draw?: (ctx: CanvasRenderingContext2D, W: number, H: number) => void;
};

// 세로 그라데이션 헬퍼
function vGrad(stops: [number, string][]): (ctx: CanvasRenderingContext2D, W: number, H: number) => void {
  return (ctx, W, H) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
}

export const BG_OPTIONS: BgOption[] = [
  { key: "transparent", label: "투명",    css: "transparent" },
  { key: "white",       label: "흰색",    css: "#ffffff" },
  { key: "dark",        label: "다크",    css: "#0b0b14" },
  { key: "green",       label: "크로마키", css: "#00b140" },
  { key: "blue",        label: "블루백",  css: "#1f4fd6" },
  {
    key: "sky", label: "하늘",
    css: "linear-gradient(to bottom,#4aa3df 0%,#9fd4f0 60%,#cdeefb 100%)",
    draw: vGrad([[0, "#4aa3df"], [0.6, "#9fd4f0"], [1, "#cdeefb"]]),
  },
  {
    key: "sunset", label: "노을",
    css: "linear-gradient(to bottom,#ff7e5f 0%,#feb47b 45%,#ffe6b3 100%)",
    draw: vGrad([[0, "#ff7e5f"], [0.45, "#feb47b"], [1, "#ffe6b3"]]),
  },
  {
    key: "night", label: "밤하늘",
    css: "radial-gradient(circle at 50% 28%,#2b2b63 0%,#10102a 70%,#070714 100%)",
    draw: (ctx, W, H) => {
      const g = ctx.createRadialGradient(W * 0.5, H * 0.28, 0, W * 0.5, H * 0.28, Math.max(W, H) * 0.8);
      g.addColorStop(0, "#2b2b63"); g.addColorStop(0.7, "#10102a"); g.addColorStop(1, "#070714");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // 별 몇 개
      ctx.fillStyle = "rgba(255,255,255,.8)";
      const pts = [[0.15, 0.2], [0.8, 0.15], [0.6, 0.3], [0.3, 0.12], [0.9, 0.4], [0.45, 0.22], [0.7, 0.5]];
      for (const [px, py] of pts) { ctx.beginPath(); ctx.arc(W * px, H * py, 1.6, 0, Math.PI * 2); ctx.fill(); }
    },
  },
  {
    key: "park", label: "공원",
    css: "linear-gradient(to bottom,#8fd0f0 0%,#cdeefb 52%,#8bc34a 52%,#4e7d2e 100%)",
    draw: vGrad([[0, "#8fd0f0"], [0.52, "#cdeefb"], [0.521, "#8bc34a"], [1, "#4e7d2e"]]),
  },
  {
    key: "classroom", label: "교실",
    css: "linear-gradient(to bottom,#dccfa8 0%,#cdbb95 60%,#9c7b46 60%,#6e5230 100%)",
    draw: vGrad([[0, "#dccfa8"], [0.6, "#cdbb95"], [0.601, "#9c7b46"], [1, "#6e5230"]]),
  },
  {
    key: "stage", label: "무대",
    css: "radial-gradient(ellipse at 50% 38%,rgba(255,255,255,.28) 0%,#241433 55%,#0c0718 100%)",
    draw: (ctx, W, H) => {
      ctx.fillStyle = "#0c0718"; ctx.fillRect(0, 0, W, H);
      const g = ctx.createRadialGradient(W * 0.5, H * 0.38, 0, W * 0.5, H * 0.38, Math.max(W, H) * 0.6);
      g.addColorStop(0, "rgba(255,255,255,.28)"); g.addColorStop(0.55, "rgba(36,20,51,.6)"); g.addColorStop(1, "rgba(12,7,24,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    },
  },
  {
    key: "sakura", label: "벚꽃",
    css: "linear-gradient(to bottom,#ffd0e6 0%,#ffe3f0 55%,#fff3f8 100%)",
    draw: vGrad([[0, "#ffd0e6"], [0.55, "#ffe3f0"], [1, "#fff3f8"]]),
  },
];

const VIEW_LABELS: Record<ViewMode, string> = {
  fullbody: "전신",
  upperbody: "상반신",
  free: "자유 시점",
};

export default function ModelViewer({ sessionId, onParamsLoaded, onModelMeta, onMeshPicked, controlRef, onGaze }: Props) {
  // 최신 onGaze 를 ref 로 (init 클로저에서 안전하게 참조)
  const onGazeRef = useRef(onGaze);
  onGazeRef.current = onGaze;
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const gazeDotRef  = useRef<HTMLDivElement>(null);
  const appRef      = useRef<unknown>(null);
  const modelRef    = useRef<unknown>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const internalRef = useRef<any>(null);
  // 자동 깜빡임/호흡/아이들모션 원본 보관 (토글 off 시 제거, on 시 복원)
  const idleStashRef = useRef<{ eyeBlink: unknown; breath: unknown; idleGroup: string | undefined } | null>(null);

  // 원본 크기 (scale 전)
  const origWRef = useRef(0);
  const origHRef = useRef(0);

  // 전신 기준 transform
  const baseRef = useRef({ x: 0, y: 0, scale: 1 });

  // 얼굴 추적: 라이브러리 focusController 를 호출하는 함수(effect 안에서 주입)
  const focusFnRef = useRef<((nx: number, ny: number, instant: boolean) => void) | null>(null);

  // 수동 파라미터 오버라이드 (슬라이더로 고정한 값 — 매 프레임 재적용해야 유지됨)
  const overridesRef   = useRef<Map<string, number>>(new Map());

  // 파라미터 기본값 (초기화·기본포즈에서 되돌림)
  const defaultsRef    = useRef<Map<string, number>>(new Map());
  // 파라미터 범위 (극한값 테스트용)
  const paramRangesRef = useRef<Map<string, { min: number; max: number }>>(new Map());
  // 극한값 스윕 상태
  const sweepRef       = useRef<{ active: boolean; map: Map<string, { min: number; max: number; phase: number; speed: number }> }>({ active: false, map: new Map() });

  // 숨긴 ArtMesh(drawable) 인덱스 + 원본 opacity 배열 참조
  const hiddenMeshesRef = useRef<Set<number>>(new Set());
  // 깜빡임(찾기): index → 경과시간(ms). 렌더 루프에서 부드럽게 페이드.
  const flashMeshesRef  = useRef<Map<number, number>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawOpacitiesRef = useRef<any>(null);
  // 실루엣 모드(회사 등에서 캐릭터 아트 대신 단색 형체만 보이게)
  // 저장된 사전 설정으로 초기화 → 모델 첫 렌더부터 실루엣 적용(그림 노출 0프레임)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pixiRef         = useRef<any>(null);
  const silhouetteRef   = useRef<{ on: boolean; color: number }>(getSilhouettePref());
  // 메쉬 선택 모드 — 켜면 캔버스 클릭으로 그 자리 ArtMesh 선택
  const meshSelectRef   = useRef(false);
  // 같은 지점 반복 클릭 시 겹친 메쉬 순환용
  const lastPickRef     = useRef<{ x: number; y: number; cands: number[]; cursor: number } | null>(null);

  // 얼굴 반응(터치/마우스 추적) ON/OFF
  const faceTrackRef   = useRef(true);

  // 자유 시점 상태
  const viewModeRef       = useRef<ViewMode>("fullbody");
  const freeRef           = useRef({ offsetX: 0, offsetY: 0, zoom: 1 });
  // 자유시점 카메라 잠금 — 켜면 드래그가 팬 대신 시선/고개 돌리기
  const camLockRef        = useRef(false);
  // 현재 배경 키 (스크린샷 합성용)
  const bgKeyRef          = useRef("transparent");
  // 사용자 업로드 배경 이미지 (스크린샷 합성용 Image 요소)
  const bgImageElRef      = useRef<HTMLImageElement | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistRef  = useRef(0);
  const isDraggingRef     = useRef(false);
  const lastPtrRef        = useRef({ x: 0, y: 0 });
  // 자유 시점에서 '탭(안 움직임)' 판정용 — 탭이면 메쉬 선택, 드래그면 카메라 조작
  const tapRef            = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const [viewMode,     setViewMode]     = useState<ViewMode>("fullbody");
  const [faceTrack,    setFaceTrack]    = useState(true);
  const [camLock,      setCamLock]      = useState(false);
  const [meshSelect,   setMeshSelect]   = useState(false);
  const [bgKey,        setBgKey]        = useState("transparent");
  const [bgImageUrl,   setBgImageUrl]   = useState<string | null>(null);

  function toggleCamLock() {
    const next = !camLockRef.current;
    camLockRef.current = next;
    setCamLock(next);
  }
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [errorDetail,  setErrorDetail]  = useState<string | null>(null); // 실제 기술적 원인(진단용)

  // 자동 깜빡임/호흡/아이들모션 on/off
  function applyAutoIdle(on: boolean) {
    const im = internalRef.current;
    if (!im) return;
    const mm = im.motionManager;
    if (!idleStashRef.current) {
      idleStashRef.current = { eyeBlink: im.eyeBlink, breath: im.breath, idleGroup: mm?.groups?.idle };
    }
    // 깜빡임·호흡
    im.eyeBlink = on ? idleStashRef.current.eyeBlink : undefined;
    im.breath   = on ? idleStashRef.current.breath   : undefined;
    // 아이들 모션 자동재생 — off 시 그룹명을 무효화해 매 프레임 재시작을 차단
    if (mm?.groups) {
      mm.groups.idle = on ? (idleStashRef.current.idleGroup ?? "idle") : "__freeze_none__";
    }
    if (!on) mm?.stopAllMotions?.();
  }

  // 공유 상태 적용 (딥링크/주석 복원)
  function applyState(s: ViewerState) {
    overridesRef.current.clear();
    for (const [id, v] of Object.entries(s.overrides || {})) overridesRef.current.set(id, v);
    faceTrackRef.current = s.faceTrack;
    setFaceTrack(s.faceTrack);
    freeRef.current = { ...s.free };
    switchView(s.viewMode);
    if (s.viewMode === "free") { freeRef.current = { ...s.free }; applyView("free"); }
  }

  // 부모가 호출하는 파라미터 제어 (overridesRef = beforeModelUpdate 훅이 매 프레임 적용)
  useEffect(() => {
    if (!controlRef) return;
    // 모델 파라미터를 기본값으로 강제 복원
    const restoreDefaults = () => {
      const core = internalRef.current?.coreModel;
      if (!core) return;
      defaultsRef.current.forEach((v, id) => {
        try { core.setParameterValueById(id, v); } catch { /* noop */ }
      });
    };
    controlRef.current = {
      setParam: (id, value) => { overridesRef.current.set(id, value); },
      releaseParam: (id)    => { overridesRef.current.delete(id); },
      resetAll:    ()       => { overridesRef.current.clear(); restoreDefaults(); },
      centerFace:  ()       => { focusFnRef.current?.(0, 0, true); },
      freezeToBase: () => {
        internalRef.current?.motionManager?.stopAllMotions?.();
        applyAutoIdle(false);
        faceTrackRef.current = false;
        setFaceTrack(false);
        overridesRef.current.clear();
        restoreDefaults();
        focusFnRef.current?.(0, 0, true);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      playMotion: (group, index) => { (modelRef.current as any)?.motion?.(group, index); },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      playExpression: (name) => { (modelRef.current as any)?.expression?.(name); },
      stopMotion: () => { internalRef.current?.motionManager?.stopAllMotions?.(); },
      setAutoIdle: (on) => { applyAutoIdle(on); },
      setBackground: (key) => { setBgKey(key); bgKeyRef.current = key; },
      setBackgroundImage: (url) => {
        const img = new Image();
        img.onload = () => { bgImageElRef.current = img; };
        img.src = url;
        setBgImageUrl(url);
        setBgKey("__image__"); bgKeyRef.current = "__image__";
      },
      screenshot: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const app = appRef.current as any;
        if (!app) return;
        try {
          // 모델만 렌더된 캔버스(배경 투명) 추출
          const modelCanvas: HTMLCanvasElement = app.renderer.extract.canvas(app.stage);
          const W = modelCanvas.width, H = modelCanvas.height;
          const out = document.createElement("canvas");
          out.width = W; out.height = H;
          const ctx = out.getContext("2d");
          if (!ctx) return;
          // 배경 합성
          if (bgKeyRef.current === "__image__" && bgImageElRef.current?.complete) {
            // cover 맞춤
            const img = bgImageElRef.current;
            const s = Math.max(W / img.width, H / img.height);
            const dw = img.width * s, dh = img.height * s;
            ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
          } else {
            const bg = BG_OPTIONS.find((b) => b.key === bgKeyRef.current);
            if (bg && bg.key !== "transparent") {
              if (bg.draw) bg.draw(ctx, W, H);
              else { ctx.fillStyle = bg.css; ctx.fillRect(0, 0, W, H); }
            }
          }
          ctx.drawImage(modelCanvas, 0, 0);
          out.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `vtuber-${Date.now()}.png`;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
          }, "image/png");
        } catch { /* 추출 실패 무시 */ }
      },
      setMeshHidden: (index, hidden) => {
        if (hidden) hiddenMeshesRef.current.add(index);
        else hiddenMeshesRef.current.delete(index);
      },
      showAllMeshes: () => { hiddenMeshesRef.current.clear(); },
      setMeshSelectMode: (on) => { meshSelectRef.current = on; setMeshSelect(on); lastPickRef.current = null; },
      setParamSweep: (on) => {
        if (on) {
          const m = new Map<string, { min: number; max: number; phase: number; speed: number }>();
          paramRangesRef.current.forEach((r, id) => {
            // 랜덤 속도 — 일부 빠르게, 일부 느리게
            m.set(id, { min: r.min, max: r.max, phase: Math.random() * Math.PI * 2, speed: 0.004 + Math.random() * 0.03 });
          });
          sweepRef.current = { active: true, map: m };
        } else {
          sweepRef.current = { active: false, map: new Map() };
          // 기본값 복원
          const core = internalRef.current?.coreModel;
          if (core) defaultsRef.current.forEach((v, id) => { try { core.setParameterValueById(id, v); } catch { /* noop */ } });
        }
      },
      setSilhouette: (on, color = 0x6b7280) => {
        silhouetteRef.current = { on, color };
        applySilhouette();
      },
      // 다른 창의 시선을 그대로 적용 (자기 pointer 이벤트가 아니라 외부 값 → onGaze 재발행 안 함)
      gazeTo: (gx, gy, instant) => { focusFnRef.current?.(gx, gy, instant); },
      flashMesh: (index) => {
        // 해당 메쉬를 부드럽게 페이드(밝→어둠→밝) 반복해 어떤 부위인지 눈에 띄게 함.
        // 경과시간을 0 으로 (재)시작 — 실제 페이드 애니메이션은 렌더 루프가 처리.
        flashMeshesRef.current.set(index, 0);
      },
      getState: () => ({
        overrides: Object.fromEntries(overridesRef.current),
        viewMode: viewModeRef.current,
        free: { ...freeRef.current },
        faceTrack: faceTrackRef.current,
      }),
      applyState: (s) => { applyState(s); },
    };
    return () => { if (controlRef) controlRef.current = null; };
  }, [controlRef]);

  // 현재 viewport 기준으로 전신 transform(baseRef) 재계산 (로드·리사이즈 시)
  // 실루엣 모드: 모델의 모든 픽셀 RGB를 단색으로 치환(알파=형태 유지) → 평면 실루엣
  function applySilhouette() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = modelRef.current as any;
    const PIXI = pixiRef.current;
    if (!model || !PIXI) return;
    const { on, color } = silhouetteRef.current;
    if (!on) { model.filters = null; return; }
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;
    const f = new PIXI.ColorMatrixFilter();
    f.matrix = [0, 0, 0, 0, r,  0, 0, 0, 0, g,  0, 0, 0, 0, b,  0, 0, 0, 1, 0];
    model.filters = [f];
  }

  function recomputeBase() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = appRef.current as any;
    const origW = origWRef.current;
    const origH = origHRef.current;
    if (!app || !origW || !origH) return;
    const scale = Math.min(
      (app.renderer.width  * 0.8) / origW,
      (app.renderer.height * 0.9) / origH,
    );
    baseRef.current = {
      x: (app.renderer.width - origW * scale) / 2,
      y: app.renderer.height * 0.05,
      scale,
    };
  }

  // 시점에 맞는 transform 을 모델에 적용 (state 변경 없음 — 리사이즈에서도 재사용)
  function applyView(mode: ViewMode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mdl = modelRef.current as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = appRef.current as any;
    if (!mdl || !app) return;

    const base  = baseRef.current;
    const origW = origWRef.current;

    if (mode === "upperbody") {
      // 상반신: 머리~어깨가 화면 세로를 채우도록 확대한 바스트 샷.
      const H       = app.renderer.height;
      const W       = app.renderer.width;
      const origH   = origHRef.current || (H / base.scale);
      const SHOW    = 0.32;                          // 본문 상단 32%(얼굴+어깨)
      const upScale = (H * 0.96) / (origH * SHOW);
      mdl.scale.set(upScale);
      mdl.x = (W - origW * upScale) / 2;
      mdl.y = H * 0.05;
    } else if (mode === "free") {
      mdl.scale.set(base.scale * freeRef.current.zoom);
      mdl.x = base.x + freeRef.current.offsetX;
      mdl.y = base.y + freeRef.current.offsetY;
    } else {
      mdl.scale.set(base.scale);
      mdl.x = base.x;
      mdl.y = base.y;
    }
  }

  // ── 시점 전환 ──────────────────────────────────────────────────────────────
  function switchView(mode: ViewMode) {
    setViewMode(mode);
    viewModeRef.current = mode;
    if (mode === "free") freeRef.current = { offsetX: 0, offsetY: 0, zoom: 1 };
    applyView(mode);
    focusFnRef.current?.(0, 0, true);  // 시점 바꾸면 얼굴 정면으로
  }

  // 얼굴 정면 복귀 (터치로 돌려둔 각도 초기화)
  function centerFace() {
    focusFnRef.current?.(0, 0, false);
  }

  // 얼굴 반응(터치/마우스 추적) 토글
  function toggleFaceTrack() {
    const next = !faceTrackRef.current;
    faceTrackRef.current = next;
    setFaceTrack(next);
    if (!next) focusFnRef.current?.(0, 0, false);  // 끄면 정면으로 복귀
  }

  function resetFreeView() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mdl = modelRef.current as any;
    if (!mdl) return;
    const base = baseRef.current;
    freeRef.current = { offsetX: 0, offsetY: 0, zoom: 1 };
    mdl.scale.set(base.scale);
    mdl.x = base.x;
    mdl.y = base.y;
  }

  // ── 줌 계산 (pivot 기준 유지) ──────────────────────────────────────────────
  function applyZoom(ratio: number, pivotX: number, pivotY: number) {
    const free    = freeRef.current;
    const base    = baseRef.current;
    const oldZoom = free.zoom;
    const newZoom = Math.max(0.15, Math.min(10, oldZoom * ratio));
    const zRatio  = newZoom / oldZoom;
    const px = pivotX - base.x;
    const py = pivotY - base.y;
    free.offsetX = px * (1 - zRatio) + free.offsetX * zRatio;
    free.offsetY = py * (1 - zRatio) + free.offsetY * zRatio;
    free.zoom    = newZoom;
  }

  // ── useEffect ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let destroyed    = false;
    let eventCleanup: (() => void) | null = null;

    async function init() {
      try {
        const allFiles = await listAllStorageFiles(sessionId);
        const model3Path = allFiles.find((p) => p.endsWith(".model3.json"));
        if (!model3Path) throw new Error("model3.json 파일을 찾을 수 없어요");

        const { data: urlData } = supabase.storage.from("models").getPublicUrl(model3Path);
        const modelUrl = urlData.publicUrl;

        // ── 사전 점검: model3.json 이 참조하는 파일이 실제 저장소에 다 있는지 ──
        // PC 는 캐시로 넘어가도 모바일은 새로 받으며 누락 파일에서 404 → 로드 실패.
        // 기기와 무관하게 "무엇이 빠졌는지"를 정확히 안내하기 위함.
        try {
          const res0 = await fetch(modelUrl, { cache: "no-store" });
          if (res0.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fr = ((await res0.json()) as any)?.FileReferences ?? {};
            const refs: string[] = [];
            if (fr.Moc) refs.push(fr.Moc);
            if (Array.isArray(fr.Textures)) refs.push(...fr.Textures);
            if (fr.Physics) refs.push(fr.Physics);
            if (fr.Pose) refs.push(fr.Pose);
            if (fr.DisplayInfo) refs.push(fr.DisplayInfo);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (Array.isArray(fr.Expressions)) fr.Expressions.forEach((e: any) => { if (e?.File) refs.push(e.File); });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (fr.Motions) for (const g of Object.values(fr.Motions) as any[]) if (Array.isArray(g)) g.forEach((m: any) => { if (m?.File) refs.push(m.File); });

            const baseDir = model3Path.includes("/") ? model3Path.slice(0, model3Path.lastIndexOf("/")) : "";
            const have = new Set(allFiles);
            const norm = (r: string) => (baseDir ? baseDir + "/" : "") + r.replace(/^\.?\//, "");
            // 핵심 파일(moc3·텍스처)만 빠져도 렌더 불가 → 명확히 차단
            const criticalMissing = refs.filter((r) => /\.moc3$|\.png$|\.jpe?g$/i.test(r) && !have.has(norm(r)));
            if (criticalMissing.length) throw new Error("MISSING_FILES::" + criticalMissing.join(", "));
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("MISSING_FILES::")) throw e;
          // 점검 자체(네트워크 등) 실패는 무시하고 정상 로드 시도
        }

        const PIXI = await import("pixi.js");
        pixiRef.current = PIXI; // 실루엣 필터 생성에 사용
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).PIXI = PIXI;
        const { Live2DModel } = await import("pixi-live2d-display/cubism4");

        if (destroyed || !canvasRef.current) return;

        // 모바일은 메모리/GPU 한도가 낮음 → 안티앨리어싱을 꺼 메모리를 절약.
        // (해상도는 기본 1 유지가 모바일 메모리에 안전)
        const isMobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const app = new PIXI.Application({
          view: canvasRef.current,
          backgroundAlpha: 0,
          resizeTo: canvasRef.current.parentElement!,
          antialias: !isMobile,
        });
        appRef.current = app;

        const model = await Live2DModel.from(modelUrl, { autoInteract: false });
        if (destroyed) { app.destroy(); return; }

        // 모델 업데이트를 우리가 직접 구동(아래 app.ticker 에서 model.update 호출).
        // 라이브러리 자동 업데이트는 Ticker.shared 가동 여부에 의존해 불안정하므로 끔.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (model as any).autoUpdate = false;

        modelRef.current = model;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        app.stage.addChild(model as any);
        applySilhouette(); // 실루엣 모드가 켜져 있으면 재적용

        // 기준 transform 계산 (전신 기준) + 현재 시점 적용
        origWRef.current = model.width;
        origHRef.current = model.height;
        recomputeBase();
        applyView(viewModeRef.current);

        setLoading(false);

        // 파라미터 목록 추출 — Cubism4 raw core model 에서 직접 읽음.
        // (framework CubismModel 에는 getParameterId/getParameterValue 가 없어
        //  raw 의 parameters.ids/values/min/max 배열을 써야 전체가 나옴)
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const core = (model as any).internalModel.coreModel;
          const paramList: Param[] = [];
          defaultsRef.current.clear();
          paramRangesRef.current.clear();

          // 1순위: raw core model 의 parameters 배열 (가장 확실 — 모든 파라미터)
          const raw = typeof core.getModel === "function" ? core.getModel() : core._model;
          const pp  = raw?.parameters;
          if (pp && typeof pp.count === "number" && pp.ids) {
            for (let i = 0; i < pp.count; i++) {
              const id  = String(pp.ids[i]);
              const def = pp.defaultValues?.[i] ?? pp.values?.[i] ?? 0;
              const mn  = pp.minimumValues?.[i] ?? -30;
              const mx  = pp.maximumValues?.[i] ??  30;
              defaultsRef.current.set(id, def);
              paramRangesRef.current.set(id, { min: mn, max: mx });
              paramList.push({ id, value: def, min: mn, max: mx });
            }
          } else if (typeof core.getParameterCount === "function") {
            // 2순위(폴백): framework API + 내부 _parameterIds 로 id 확보
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ids = (core as any)._parameterIds ?? [];
            for (let i = 0; i < core.getParameterCount(); i++) {
              const id  = String(ids[i] ?? `param_${i}`);
              const def = core.getParameterDefaultValue?.(i) ?? core.getParameterValueByIndex?.(i) ?? 0;
              const mn  = core.getParameterMinimumValue(i);
              const mx  = core.getParameterMaximumValue(i);
              defaultsRef.current.set(id, def);
              paramRangesRef.current.set(id, { min: mn, max: mx });
              paramList.push({ id, value: def, min: mn, max: mx });
            }
          }
          onParamsLoaded?.(paramList);
        } catch { /* 파라미터 없어도 정상 표시 */ }

        // ── 이벤트 핸들러 ──────────────────────────────────────────────────
        const canvas = canvasRef.current!;

        // ── 파라미터 강제 적용 훅 ────────────────────────────────────────────
        // 라이브러리는 model.update()(변형 계산) 직전에 'beforeModelUpdate' 를 emit.
        // 이 시점에 오버라이드를 setParameterValueById 하면 모션·물리에 안 덮이고
        // 변형에 확실히 반영됨. (app.ticker 에서 따로 set 하면 타이밍이 어긋나 무시됨)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internalModel = (model as any).internalModel;
        internalRef.current = internalModel;

        // 모션·표정 메타 수집 → 부모(연출 탭)에 전달
        try {
          const settings = internalModel.settings ?? {};
          const motionsObj = settings.motions ?? {};
          const motions = Object.entries(motionsObj)
            .map(([group, arr]) => ({ group, count: Array.isArray(arr) ? arr.length : 0 }))
            .filter((m) => m.count > 0);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const expressions: string[] = (settings.expressions ?? [])
            .map((e: any) => e?.Name ?? e?.name)
            .filter((n: unknown): n is string => typeof n === "string");

          // ArtMesh(drawable) 목록 수집 + opacity 배열 참조 확보
          const meshes: { index: number; id: string; part: string }[] = [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cm: any = internalModel.coreModel;
          const rawModel = typeof cm.getModel === "function" ? cm.getModel() : cm._model;
          const dd = rawModel?.drawables;
          const partIds: string[] = rawModel?.parts?.ids ?? [];
          const parentParts: ArrayLike<number> = dd?.parentPartIndices ?? [];
          if (dd && typeof dd.count === "number" && dd.ids) {
            drawOpacitiesRef.current = dd.opacities;
            for (let i = 0; i < dd.count; i++) {
              const pIdx = parentParts[i];
              const part = pIdx != null && partIds[pIdx] != null ? String(partIds[pIdx]) : "";
              meshes.push({ index: i, id: String(dd.ids[i]), part });
            }
          }
          onModelMeta?.({ motions, expressions, meshes });
        } catch { /* 메타 없어도 정상 */ }

        const onBeforeModelUpdate = () => {
          const core = internalModel.coreModel;
          // 극한값 테스트(스윕): 각 파라미터를 랜덤 속도로 min↔max 부드럽게 왕복
          if (sweepRef.current.active) {
            sweepRef.current.map.forEach((s, id) => {
              s.phase += s.speed;
              const t = 0.5 - 0.5 * Math.cos(s.phase); // 0..1
              try { core.setParameterValueById(id, s.min + (s.max - s.min) * t); } catch { /* noop */ }
            });
            return; // 스윕 중엔 일반 오버라이드 무시
          }
          overridesRef.current.forEach((v, id) => {
            try { core.setParameterValueById(id, v); } catch { /* noop */ }
          });
        };
        internalModel.on("beforeModelUpdate", onBeforeModelUpdate);

        // ArtMesh 숨김: model.update()(변형) 직후 ~ draw 직전에 opacity 를 0 으로.
        // internalModel.update 를 감싸 원본 실행 후 숨긴 drawable 만 투명 처리.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const origUpdate = internalModel.update.bind(internalModel);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        internalModel.update = (dt: number, now: number) => {
          origUpdate(dt, now);
          const op = drawOpacitiesRef.current;
          if (!op) return;
          if (hiddenMeshesRef.current.size) hiddenMeshesRef.current.forEach((i) => { op[i] = 0; });
          // 깜빡임: 하드 블링크 대신 부드러운 페이드(밝→어둠→밝)를 몇 번 반복 후 종료
          if (flashMeshesRef.current.size) {
            const FL_PERIOD = 560, FL_DUR = 2240; // 주기 0.56s, 총 2.24s(약 4번), 예전보다 살짝 느림
            flashMeshesRef.current.forEach((t, i) => {
              const nt = t + dt;
              if (nt >= FL_DUR) { flashMeshesRef.current.delete(i); return; }
              flashMeshesRef.current.set(i, nt);
              const mult = 0.5 + 0.5 * Math.cos((2 * Math.PI * nt) / FL_PERIOD); // 1→0→1 부드럽게
              op[i] = (op[i] ?? 1) * mult;
            });
          }
        };

        // 얼굴 추적: 라이브러리 내장 focusController 사용(올바른 타이밍·스무딩 내장)
        function setFocus(e: PointerEvent, instant = false) {
          const free = viewModeRef.current === "free";
          // 자유시점: 카메라 잠금일 때만 추적 / 비자유: 얼굴반응 ON 일 때만
          if (free) { if (!camLockRef.current) return; }
          else if (!faceTrackRef.current) return;
          const rect = canvas.getBoundingClientRect();
          const nx = ((e.clientX - rect.left) / rect.width)  * 2 - 1;  // -1(좌)~+1(우)
          const ny = ((e.clientY - rect.top)  / rect.height) * 2 - 1;  // -1(상)~+1(하)
          internalModel.focusController.focus(nx, -ny, instant);
          onGazeRef.current?.(nx, -ny, instant); // 다른 창에 같은 시선 전달
        }
        focusFnRef.current = (nx: number, ny: number, instant: boolean) =>
          internalModel.focusController.focus(nx, ny, instant);

        function onFaceLeave(e: PointerEvent) {
          // 마우스 hover 가 캔버스를 벗어나면 정면 복귀.
          // 터치/펜은 손을 떼도 마지막 각도를 '유지'(탭으로 각도 테스트 가능)
          if (e.pointerType === "mouse") { internalModel.focusController.focus(0, 0); onGazeRef.current?.(0, 0, false); }
        }

        // ── 메쉬 선택(클릭한 지점의 ArtMesh 집기) ───────────────────────────
        function pointInTri(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
          const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
          const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
          const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
          const neg = d1 < 0 || d2 < 0 || d3 < 0;
          const pos = d1 > 0 || d2 > 0 || d3 > 0;
          return !(neg && pos);
        }
        function pickMeshAt(clientX: number, clientY: number): number | null {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cm: any = internalModel.coreModel;
          const raw = typeof cm.getModel === "function" ? cm.getModel() : cm._model;
          const dd = raw?.drawables;
          if (!dd) return null;
          const rect = canvas.getBoundingClientRect();
          const sx = app.renderer.width / rect.width;
          const sy = app.renderer.height / rect.height;
          const mp = { x: 0, y: 0 };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (model as any).toModelPosition({ x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy }, mp);

          const hits: number[] = [];
          const bboxHits: number[] = [];   // 삼각형엔 안 맞아도 바운딩박스 안 (폴백)
          for (let i = 0; i < dd.count; i++) {
            if (hiddenMeshesRef.current.has(i)) continue;
            if ((dd.opacities?.[i] ?? 1) <= 0.02) continue;
            // 라이브러리와 동일 좌표계의 변환된 정점 사용
            // (x*pixelsPerUnit + W/2, -y*pixelsPerUnit + H/2) — toModelPosition 과 매칭
            const verts = internalModel.getDrawableVertices(i);
            const idx = dd.indices[i];
            if (!verts || !idx || !verts.length) continue;
            // 바운딩박스 먼저(빠른 제외 + 폴백)
            let minX = verts[0], maxX = verts[0], minY = verts[1], maxY = verts[1];
            for (let k = 2; k < verts.length; k += 2) {
              if (verts[k] < minX) minX = verts[k]; else if (verts[k] > maxX) maxX = verts[k];
              if (verts[k + 1] < minY) minY = verts[k + 1]; else if (verts[k + 1] > maxY) maxY = verts[k + 1];
            }
            if (mp.x < minX || mp.x > maxX || mp.y < minY || mp.y > maxY) continue;
            bboxHits.push(i);
            let hit = false;
            for (let t = 0; t < idx.length; t += 3) {
              const a = idx[t] * 2, b = idx[t + 1] * 2, c = idx[t + 2] * 2;
              if (pointInTri(mp.x, mp.y, verts[a], verts[a + 1], verts[b], verts[b + 1], verts[c], verts[c + 1])) { hit = true; break; }
            }
            if (hit) hits.push(i);
          }
          const ro = dd.renderOrders;
          // 삼각형 히트 우선, 없으면 바운딩박스 폴백
          const pool = hits.length ? hits : bboxHits;
          if (!pool.length) { lastPickRef.current = null; return null; }
          // 렌더 순서 앞쪽(큰 값)부터
          pool.sort((a, b) => (ro?.[b] ?? 0) - (ro?.[a] ?? 0));
          // 같은 지점 반복 클릭이면 겹친 메쉬 순환
          const last = lastPickRef.current;
          const same = last && Math.abs(last.x - clientX) < 10 && Math.abs(last.y - clientY) < 10
            && last.cands.length === pool.length && last.cands.every((v, k) => v === pool[k]);
          const cursor = same ? (last!.cursor + 1) % pool.length : 0;
          lastPickRef.current = { x: clientX, y: clientY, cands: pool, cursor };
          return pool[cursor];
        }

        // 자유 시점: 드래그 이동 / 전신·상반신: 탭·드래그로 그쪽을 바라봄
        function onPtrDown(e: PointerEvent) {
          // 자유 시점: 카메라 조작(팬·줌·회전)이 최우선. 메쉬 선택은 '탭'일 때 pointerup 에서 처리.
          // (예전엔 메쉬 선택 모드면 여기서 return 해버려 자유 시점 드래그가 아예 안 됐음)
          if (viewModeRef.current === "free") {
            canvas.setPointerCapture(e.pointerId);
            activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            isDraggingRef.current = true;
            lastPtrRef.current    = { x: e.clientX, y: e.clientY };
            tapRef.current        = { x: e.clientX, y: e.clientY, moved: false };
            if (camLockRef.current) setFocus(e, true);  // 카메라 잠금: 즉시 그쪽 바라봄
            return;
          }
          // 비자유(전신/상반신/정면): 메쉬 선택 모드면 클릭으로 집기
          if (meshSelectRef.current) {
            const idx = pickMeshAt(e.clientX, e.clientY);
            if (idx != null) onMeshPicked?.(idx);
            return;
          }
          // 모바일: 포인터 캡처로 손가락이 살짝 벗어나도 계속 추종
          try { canvas.setPointerCapture(e.pointerId); } catch { /* noop */ }
          setFocus(e, true);  // 탭/터치 즉시 그 각도로 (responsive)
        }

        function onPtrMove(e: PointerEvent) {
          if (viewModeRef.current !== "free") { setFocus(e, false); return; }
          if (!activePointersRef.current.has(e.pointerId)) return;
          // 조금이라도 움직이면 '탭'이 아님(=드래그) → 메쉬 선택 안 함
          if (tapRef.current && (Math.abs(e.clientX - tapRef.current.x) > 6 || Math.abs(e.clientY - tapRef.current.y) > 6)) {
            tapRef.current.moved = true;
          }
          activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

          const ptrs = Array.from(activePointersRef.current.values());

          if (ptrs.length >= 2) {
            // 핀치 줌 (두 손가락)
            const [p1, p2] = ptrs;
            const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            if (lastPinchDistRef.current > 0 && dist > 0) {
              const rect  = canvas.getBoundingClientRect();
              const midX  = (p1.x + p2.x) / 2 - rect.left;
              const midY  = (p1.y + p2.y) / 2 - rect.top;
              applyZoom(dist / lastPinchDistRef.current, midX, midY);
            }
            lastPinchDistRef.current = dist;
          } else if (ptrs.length === 1 && isDraggingRef.current) {
            if (camLockRef.current) {
              // 카메라 잠금: 드래그로 시선·고개 돌리기
              setFocus(e, false);
            } else {
              // 한 손가락 드래그: 카메라 이동(팬)
              freeRef.current.offsetX += e.clientX - lastPtrRef.current.x;
              freeRef.current.offsetY += e.clientY - lastPtrRef.current.y;
              lastPtrRef.current = { x: e.clientX, y: e.clientY };
            }
          }
        }

        function onPtrUp(e: PointerEvent) {
          // 자유 시점에서 '탭(안 움직임)' + 메쉬 선택 모드면 그 지점 ArtMesh 집기
          if (viewModeRef.current === "free" && meshSelectRef.current && tapRef.current && !tapRef.current.moved) {
            const idx = pickMeshAt(e.clientX, e.clientY);
            if (idx != null) onMeshPicked?.(idx);
          }
          tapRef.current = null;
          activePointersRef.current.delete(e.pointerId);
          if (activePointersRef.current.size === 0) {
            isDraggingRef.current    = false;
            lastPinchDistRef.current = 0;
          }
          try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
          // 터치/펜은 손을 떼도 마지막 각도를 유지 → '정면' 버튼으로 복귀
        }

        // 마우스 휠 줌
        function onWheel(e: WheelEvent) {
          if (viewModeRef.current !== "free") return;
          e.preventDefault();
          const rect   = canvas.getBoundingClientRect();
          const pivotX = e.clientX - rect.left;
          const pivotY = e.clientY - rect.top;
          applyZoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, pivotX, pivotY);
        }

        canvas.addEventListener("pointermove",  onPtrMove);
        canvas.addEventListener("pointerdown",  onPtrDown);
        canvas.addEventListener("pointerup",    onPtrUp);
        canvas.addEventListener("pointercancel",onPtrUp);
        canvas.addEventListener("pointerleave", onFaceLeave);
        canvas.addEventListener("wheel",        onWheel, { passive: false });

        // 화면 회전·리사이즈 시 모델 재정렬 (모바일 가로↔세로 대응)
        const onResize = () => { recomputeBase(); applyView(viewModeRef.current); };
        app.renderer.on("resize", onResize);

        // PIXI resizeTo 는 window resize 에만 반응 → 컨테이너 크기 변화(비교 모드 토글 등)엔
        // 반응 안 함. ResizeObserver 로 부모 크기가 바뀌면 직접 app.resize() 호출해 재적용.
        const parentEl = canvas.parentElement;
        let ro: ResizeObserver | null = null;
        if (parentEl && typeof ResizeObserver !== "undefined") {
          ro = new ResizeObserver(() => {
            if (parentEl.clientWidth > 0 && parentEl.clientHeight > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (app as any).resize();
            }
          });
          ro.observe(parentEl);
        }

        eventCleanup = () => {
          canvas.removeEventListener("pointermove",  onPtrMove);
          canvas.removeEventListener("pointerdown",  onPtrDown);
          canvas.removeEventListener("pointerup",    onPtrUp);
          canvas.removeEventListener("pointercancel",onPtrUp);
          canvas.removeEventListener("pointerleave", onFaceLeave);
          canvas.removeEventListener("wheel",        onWheel);
          ro?.disconnect();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (app.renderer as any)?.off?.("resize", onResize);
        };

        // ── PIXI 렌더 루프 ──────────────────────────────────────────────────
        app.ticker.add(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mdl = modelRef.current as any;
          if (!mdl) return;

          // 자유 시점: 팬·줌 transform 적용
          if (viewModeRef.current === "free") {
            const base = baseRef.current;
            const free = freeRef.current;
            mdl.scale.set(base.scale * free.zoom);
            mdl.x = base.x + free.offsetX;
            mdl.y = base.y + free.offsetY;
          }

          // 모델 업데이트 구동: deltaTime 누적 → 렌더 시 internalModel.update 실행
          // (focusController 얼굴추적 · beforeModelUpdate 오버라이드 · 물리 · breath · 변형)
          mdl.update(app.ticker.deltaMS);

          // 시선 포인터: 캐릭터가 보고 있는 방향(focusController)을 화면 점으로 표시
          const gd = gazeDotRef.current;
          if (gd) {
            const fc = internalModel.focusController;
            const free = viewModeRef.current === "free";
            const tracking = (!free && faceTrackRef.current) || (free && camLockRef.current);
            if (tracking && (Math.abs(fc.x) + Math.abs(fc.y)) > 0.03) {
              const px = ((fc.x + 1) / 2) * canvas.clientWidth;
              const py = ((1 - fc.y) / 2) * canvas.clientHeight;
              gd.style.left = `${px}px`;
              gd.style.top = `${py}px`;
              gd.style.opacity = "1";
            } else {
              gd.style.opacity = "0";
            }
          }
        });

      } catch (err: unknown) {
        if (!destroyed) {
          const raw = err instanceof Error ? err.message : String(err);
          let msg = raw;
          let detail: string | null = raw; // 기본적으로 실제 원인을 함께 노출(특히 모바일 진단)
          if (raw.startsWith("MISSING_FILES::")) {
            msg = "이 모델은 일부 핵심 파일이 저장소에 없어요. 업로드가 도중에 실패한 것 같아요. 다시 업로드하면 해결됩니다. (PC에선 캐시로 보이지만 모바일은 새로 받으며 실패해요)";
            detail = "누락된 파일: " + raw.slice("MISSING_FILES::".length);
          }
          else if (raw.includes("model3.json"))         msg = "model3.json 파일을 찾을 수 없어요. 업로드가 제대로 됐는지 확인해주세요.";
          else if (/texture|\.png|image/i.test(raw))    msg = "텍스처(이미지) 파일을 불러오지 못했어요. 텍스처가 빠졌거나, 모바일 GPU 한도를 넘는 큰 텍스처일 수 있어요.";
          else if (/moc/i.test(raw))                    msg = "moc3 파일을 불러오지 못했어요. 파일이 손상됐거나 빠졌을 수 있어요.";
          else if (/context|webgl|gpu|memory|size/i.test(raw)) msg = "모바일 그래픽(WebGL)에서 모델을 그리지 못했어요. 텍스처가 너무 크거나 메모리가 부족할 수 있어요.";
          else if (/fetch|network|404|load/i.test(raw)) msg = "모델 파일을 불러오지 못했어요. 일부 파일이 누락됐거나 만료됐을 수 있어요.";
          else                                          msg = "모델을 불러오지 못했어요. 파일이 올바른지 확인해주세요.";
          setError(msg);
          setErrorDetail(detail);
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      destroyed = true;
      eventCleanup?.();
      if (appRef.current) {
        (appRef.current as { destroy: (v: boolean) => void }).destroy(true);
      }
    };
  }, [sessionId]);

  // ── 렌더 ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full gap-2">

      {/* 시점 버튼 */}
      <div className="flex items-center gap-1.5 px-3 pt-3 flex-shrink-0">
        <span className="text-[10px] text-[var(--muted)] mr-0.5">시점</span>
        {(["fullbody", "upperbody", "free"] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => switchView(mode)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              viewMode === mode
                ? "bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] text-white shadow-md"
                : "glass glass-hover text-[var(--muted)]"
            }`}
          >
            {VIEW_LABELS[mode]}
          </button>
        ))}
        {viewMode === "free" ? (
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={toggleCamLock}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 ${
                camLock
                  ? "bg-[var(--purple)]/20 text-[var(--purple)]"
                  : "glass glass-hover text-[var(--muted)]"
              }`}
              title="켜면 드래그로 카메라 대신 시선·고개를 돌립니다"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${camLock ? "bg-[var(--purple)]" : "bg-[var(--muted)]/40"}`} />
              카메라 잠금 {camLock ? "ON" : "OFF"}
            </button>
            <button
              onClick={resetFreeView}
              className="px-2 py-1 rounded-lg text-[10px] glass glass-hover text-[var(--muted)]"
            >
              초기화
            </button>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-1.5">
            {faceTrack && (
              <button
                onClick={centerFace}
                className="px-2.5 py-1 rounded-lg text-[10px] glass glass-hover text-[var(--muted)]"
                title="터치로 돌려둔 얼굴 각도를 정면으로 되돌립니다"
              >
                정면
              </button>
            )}
            <button
              onClick={toggleFaceTrack}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 ${
                faceTrack
                  ? "bg-[var(--purple)]/20 text-[var(--purple)]"
                  : "glass glass-hover text-[var(--muted)]"
              }`}
              title="터치·마우스에 얼굴이 반응하는 기능을 켜고 끕니다"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${faceTrack ? "bg-[var(--purple)]" : "bg-[var(--muted)]/40"}`} />
              얼굴 반응 {faceTrack ? "ON" : "OFF"}
            </button>
          </div>
        )}
      </div>

      {/* 캔버스 */}
      <div className="flex flex-1 min-h-0 px-3 pb-3">

        {/* 캔버스 영역 */}
        <div
          className={`relative flex-1 min-h-[40vh] rounded-xl overflow-hidden ${bgKey === "transparent" ? "glass" : ""}`}
          style={
            bgKey === "transparent"
              ? undefined
              : bgKey === "__image__" && bgImageUrl
                ? { backgroundImage: `url(${bgImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                : { background: BG_OPTIONS.find((b) => b.key === bgKey)?.css }
          }
        >
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
              <div className="w-8 h-8 rounded-full border-2 border-[var(--purple)] border-t-transparent animate-spin" />
              <p className="text-sm text-[var(--muted)]">모델 불러오는 중...</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-6 gap-3">
              <p className="text-sm text-red-400 text-center max-w-md">{error}</p>
              {errorDetail && (
                <p className="text-[10px] text-[var(--muted)]/70 text-center font-mono break-all max-w-md leading-relaxed">{errorDetail}</p>
              )}
              <button
                onClick={() => { if (typeof window !== "undefined") window.location.reload(); }}
                className="mt-1 px-4 py-1.5 rounded-lg bg-[var(--purple)]/20 text-[var(--purple)] text-xs font-medium hover:bg-[var(--purple)]/30"
              >
                다시 시도
              </button>
            </div>
          )}
          {!loading && !error && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <span className="text-[10px] text-[var(--muted)]/50 bg-black/20 rounded-full px-2 py-0.5">
                {meshSelect
                  ? "메쉬 선택 모드 · 모델을 클릭해 부위 선택 (겹치면 반복 클릭)"
                  : viewMode === "free"
                  ? camLock
                    ? "카메라 잠금 · 드래그로 시선·고개 · 핀치/휠 확대축소"
                    : "드래그 이동 · 핀치/휠 확대축소"
                  : faceTrack
                    ? "터치·드래그로 각도 조절 · 손 떼면 유지 · 정면 버튼으로 복귀"
                    : "얼굴 반응 꺼짐 · 슬라이더로 직접 조작"}
              </span>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className={`w-full h-full touch-none ${
              meshSelect ? "cursor-crosshair" : viewMode === "free" && !camLock ? "cursor-grab active:cursor-grabbing" : ""
            }`}
          />
          {/* 시선 포인터 — 캐릭터가 바라보는 지점 */}
          <div
            ref={gazeDotRef}
            className="absolute z-20 pointer-events-none -translate-x-1/2 -translate-y-1/2 transition-opacity duration-150"
            style={{ left: 0, top: 0, opacity: 0 }}
          >
            <div className="w-5 h-5 rounded-full border-2 border-[var(--purple)] flex items-center justify-center" style={{ boxShadow: "0 0 8px rgba(168,85,247,.7)" }}>
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--purple)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
