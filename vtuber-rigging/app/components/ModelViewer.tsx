"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, listAllStorageFiles } from "@/lib/supabase";

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
  getState: () => ViewerState;
  applyState: (s: ViewerState) => void;
  screenshot: () => void;
  setMeshHidden: (index: number, hidden: boolean) => void;
  showAllMeshes: () => void;
  flashMesh: (index: number) => void;
  setMeshSelectMode: (on: boolean) => void;
}

type Props = {
  sessionId: string;
  onParamsLoaded?: (params: Param[]) => void;
  onModelMeta?: (meta: ModelMeta) => void;
  onMeshPicked?: (index: number) => void;
  controlRef?: { current: ViewerHandle | null };
};

// 배경 옵션 (캔버스 컨테이너 CSS 배경)
export const BG_OPTIONS: { key: string; label: string; css: string }[] = [
  { key: "transparent", label: "투명",    css: "transparent" },
  { key: "white",       label: "흰색",    css: "#ffffff" },
  { key: "dark",        label: "다크",    css: "#0b0b14" },
  { key: "green",       label: "크로마키", css: "#00b140" },
  { key: "blue",        label: "블루백",  css: "#1f4fd6" },
  { key: "grad",        label: "그라데이션", css: "linear-gradient(160deg,#3b1d6e 0%,#0b0b14 100%)" },
];

const VIEW_LABELS: Record<ViewMode, string> = {
  fullbody: "전신",
  upperbody: "상반신",
  free: "자유 시점",
};

export default function ModelViewer({ sessionId, onParamsLoaded, onModelMeta, onMeshPicked, controlRef }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
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

  // 숨긴 ArtMesh(drawable) 인덱스 + 원본 opacity 배열 참조
  const hiddenMeshesRef = useRef<Set<number>>(new Set());
  // 깜빡임(찾기)용 임시 숨김 세트
  const flashMeshesRef  = useRef<Set<number>>(new Set());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawOpacitiesRef = useRef<any>(null);
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
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistRef  = useRef(0);
  const isDraggingRef     = useRef(false);
  const lastPtrRef        = useRef({ x: 0, y: 0 });

  const [viewMode,     setViewMode]     = useState<ViewMode>("fullbody");
  const [faceTrack,    setFaceTrack]    = useState(true);
  const [camLock,      setCamLock]      = useState(false);
  const [meshSelect,   setMeshSelect]   = useState(false);
  const [bgKey,        setBgKey]        = useState("transparent");

  function toggleCamLock() {
    const next = !camLockRef.current;
    camLockRef.current = next;
    setCamLock(next);
  }
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

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
          // 배경 합성 (투명이 아니면 색/그라데이션을 먼저 칠함)
          const bg = BG_OPTIONS.find((b) => b.key === bgKeyRef.current);
          if (bg && bg.key !== "transparent") {
            if (bg.key === "grad") {
              const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
              g.addColorStop(0, "#3b1d6e"); g.addColorStop(1, "#0b0b14");
              ctx.fillStyle = g;
            } else {
              ctx.fillStyle = bg.css;
            }
            ctx.fillRect(0, 0, W, H);
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
      flashMesh: (index) => {
        // 해당 메쉬를 잠깐 깜빡여 어떤 부위인지 눈으로 찾게 함
        const fset = flashMeshesRef.current;
        let n = 0;
        const tick = () => {
          if (fset.has(index)) fset.delete(index); else fset.add(index);
          n += 1;
          if (n >= 6) { fset.delete(index); return; }
          setTimeout(tick, 160);
        };
        tick();
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

        const PIXI = await import("pixi.js");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).PIXI = PIXI;
        const { Live2DModel } = await import("pixi-live2d-display/cubism4");

        if (destroyed || !canvasRef.current) return;

        const app = new PIXI.Application({
          view: canvasRef.current,
          backgroundAlpha: 0,
          resizeTo: canvasRef.current.parentElement!,
          antialias: true,
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

          // 1순위: raw core model 의 parameters 배열 (가장 확실 — 모든 파라미터)
          const raw = typeof core.getModel === "function" ? core.getModel() : core._model;
          const pp  = raw?.parameters;
          if (pp && typeof pp.count === "number" && pp.ids) {
            for (let i = 0; i < pp.count; i++) {
              const id  = String(pp.ids[i]);
              const def = pp.defaultValues?.[i] ?? pp.values?.[i] ?? 0;
              defaultsRef.current.set(id, def);
              paramList.push({
                id,
                value: def,
                min:   pp.minimumValues?.[i] ?? -30,
                max:   pp.maximumValues?.[i] ??  30,
              });
            }
          } else if (typeof core.getParameterCount === "function") {
            // 2순위(폴백): framework API + 내부 _parameterIds 로 id 확보
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ids = (core as any)._parameterIds ?? [];
            for (let i = 0; i < core.getParameterCount(); i++) {
              const id  = String(ids[i] ?? `param_${i}`);
              const def = core.getParameterDefaultValue?.(i) ?? core.getParameterValueByIndex?.(i) ?? 0;
              defaultsRef.current.set(id, def);
              paramList.push({
                id,
                value: def,
                min:   core.getParameterMinimumValue(i),
                max:   core.getParameterMaximumValue(i),
              });
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
          if (flashMeshesRef.current.size)  flashMeshesRef.current.forEach((i) => { op[i] = 0; });
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
        }
        focusFnRef.current = (nx: number, ny: number, instant: boolean) =>
          internalModel.focusController.focus(nx, ny, instant);

        function onFaceLeave(e: PointerEvent) {
          // 마우스 hover 가 캔버스를 벗어나면 정면 복귀.
          // 터치/펜은 손을 떼도 마지막 각도를 '유지'(탭으로 각도 테스트 가능)
          if (e.pointerType === "mouse") internalModel.focusController.focus(0, 0);
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
          // 메쉬 선택 모드: 클릭 지점의 ArtMesh 를 집어 부모에 알림(+깜빡임)
          if (meshSelectRef.current) {
            const idx = pickMeshAt(e.clientX, e.clientY);
            if (idx != null) onMeshPicked?.(idx);
            return;
          }
          if (viewModeRef.current !== "free") {
            // 모바일: 포인터 캡처로 손가락이 살짝 벗어나도 계속 추종
            try { canvas.setPointerCapture(e.pointerId); } catch { /* noop */ }
            setFocus(e, true);  // 탭/터치 즉시 그 각도로 (responsive)
            return;
          }
          canvas.setPointerCapture(e.pointerId);
          activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          isDraggingRef.current = true;
          lastPtrRef.current    = { x: e.clientX, y: e.clientY };
          if (camLockRef.current) setFocus(e, true);  // 카메라 잠금: 즉시 그쪽 바라봄
        }

        function onPtrMove(e: PointerEvent) {
          if (viewModeRef.current !== "free") { setFocus(e, false); return; }
          if (!activePointersRef.current.has(e.pointerId)) return;
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

        eventCleanup = () => {
          canvas.removeEventListener("pointermove",  onPtrMove);
          canvas.removeEventListener("pointerdown",  onPtrDown);
          canvas.removeEventListener("pointerup",    onPtrUp);
          canvas.removeEventListener("pointercancel",onPtrUp);
          canvas.removeEventListener("pointerleave", onFaceLeave);
          canvas.removeEventListener("wheel",        onWheel);
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
        });

      } catch (err: unknown) {
        if (!destroyed) {
          const raw = err instanceof Error ? err.message : String(err);
          let msg = raw;
          if (raw.includes("model3.json"))             msg = "model3.json 파일을 찾을 수 없어요. 업로드가 제대로 됐는지 확인해주세요.";
          else if (/texture|\.png|image/i.test(raw))   msg = "텍스처(이미지) 파일을 불러오지 못했어요. 텍스처 파일이 빠졌을 수 있어요.";
          else if (/moc/i.test(raw))                   msg = "moc3 파일을 불러오지 못했어요. 파일이 손상됐거나 빠졌을 수 있어요.";
          else if (/fetch|network|404|load/i.test(raw)) msg = "모델 파일을 불러오지 못했어요. 일부 파일이 누락됐거나 만료됐을 수 있어요.";
          else                                          msg = "모델을 불러오지 못했어요. 파일이 올바른지 확인해주세요.";
          setError(msg);
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
          style={bgKey === "transparent" ? undefined : { background: BG_OPTIONS.find((b) => b.key === bgKey)?.css }}
        >
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
              <div className="w-8 h-8 rounded-full border-2 border-[var(--purple)] border-t-transparent animate-spin" />
              <p className="text-sm text-[var(--muted)]">모델 불러오는 중...</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-10 p-6">
              <p className="text-sm text-red-400 text-center">{error}</p>
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
        </div>
      </div>
    </div>
  );
}
