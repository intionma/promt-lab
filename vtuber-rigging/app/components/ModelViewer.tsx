"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, listAllStorageFiles } from "@/lib/supabase";

export type Param = { id: string; value: number; min: number; max: number };
type ViewMode = "fullbody" | "upperbody" | "free";

// 부모(리뷰 페이지)가 파라미터를 제어하기 위한 핸들 (controlRef prop 으로 주입)
export interface ViewerHandle {
  setParam: (id: string, value: number) => void;
  releaseParam: (id: string) => void;
  resetAll: () => void;
}

type Props = {
  sessionId: string;
  onParamsLoaded?: (params: Param[]) => void;
  controlRef?: { current: ViewerHandle | null };
};

const VIEW_LABELS: Record<ViewMode, string> = {
  fullbody: "전신",
  upperbody: "상반신",
  free: "자유 시점",
};

export default function ModelViewer({ sessionId, onParamsLoaded, controlRef }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const appRef      = useRef<unknown>(null);
  const modelRef    = useRef<unknown>(null);

  // 원본 크기 (scale 전)
  const origWRef = useRef(0);
  const origHRef = useRef(0);

  // 전신 기준 transform
  const baseRef = useRef({ x: 0, y: 0, scale: 1 });

  // 얼굴 추적: 라이브러리 focusController 를 호출하는 함수(effect 안에서 주입)
  const focusFnRef = useRef<((nx: number, ny: number, instant: boolean) => void) | null>(null);

  // 수동 파라미터 오버라이드 (슬라이더로 고정한 값 — 매 프레임 재적용해야 유지됨)
  const overridesRef   = useRef<Map<string, number>>(new Map());

  // 이 모델이 실제 보유한 파라미터 ID 집합 (없는 ID 는 건드리지 않음 → 커스텀 리깅 대응)
  const availIdsRef    = useRef<Set<string>>(new Set());

  // 얼굴 반응(터치/마우스 추적) ON/OFF
  const faceTrackRef   = useRef(true);

  // 자유 시점 상태
  const viewModeRef       = useRef<ViewMode>("fullbody");
  const freeRef           = useRef({ offsetX: 0, offsetY: 0, zoom: 1 });
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistRef  = useRef(0);
  const isDraggingRef     = useRef(false);
  const lastPtrRef        = useRef({ x: 0, y: 0 });

  const [viewMode,     setViewMode]     = useState<ViewMode>("fullbody");
  const [faceTrack,    setFaceTrack]    = useState(true);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  // 부모가 호출하는 파라미터 제어 (overridesRef = beforeModelUpdate 훅이 매 프레임 적용)
  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      setParam: (id, value) => { overridesRef.current.set(id, value); },
      releaseParam: (id)    => { overridesRef.current.delete(id); },
      resetAll:    ()       => { overridesRef.current.clear(); },
    };
    return () => { if (controlRef) controlRef.current = null; };
  }, [controlRef]);

  // ── 시점 전환 ──────────────────────────────────────────────────────────────
  function switchView(mode: ViewMode) {
    setViewMode(mode);
    viewModeRef.current = mode;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mdl = modelRef.current as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = appRef.current as any;
    if (!mdl || !app) return;

    const base  = baseRef.current;
    const origW = origWRef.current;

    if (mode === "fullbody") {
      mdl.scale.set(base.scale);
      mdl.x = base.x;
      mdl.y = base.y;

    } else if (mode === "upperbody") {
      // 상반신: 머리~어깨가 화면 세로를 채우도록 확대한 바스트 샷.
      // 머리 위 약간의 여백을 두어 얼굴이 잘 보이게 함.
      const H      = app.renderer.height;
      const W      = app.renderer.width;
      const origH  = origHRef.current || (H / base.scale);
      const SHOW   = 0.32;                         // 본문 상단 32%(얼굴+어깨) = 바스트 샷
      const upScale = (H * 0.96) / (origH * SHOW);
      mdl.scale.set(upScale);
      mdl.x = (W - origW * upScale) / 2;
      mdl.y = H * 0.05;  // 머리 위 약간의 여백 → 어깨 아래는 화면 밖

    } else {
      // 자유 시점: 전신 위치에서 시작
      freeRef.current = { offsetX: 0, offsetY: 0, zoom: 1 };
      mdl.scale.set(base.scale);
      mdl.x = base.x;
      mdl.y = base.y;
    }

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

        // 기준 transform 계산 (전신 기준)
        const origW  = model.width;
        const origH  = model.height;
        origWRef.current = origW;
        origHRef.current = origH;

        const scale  = Math.min(
          (app.renderer.width  * 0.8) / origW,
          (app.renderer.height * 0.9) / origH,
        );
        const baseX = (app.renderer.width - origW * scale) / 2;
        const baseY = app.renderer.height * 0.05;
        baseRef.current = { x: baseX, y: baseY, scale };

        model.scale.set(scale);
        model.x = baseX;
        model.y = baseY;

        setLoading(false);

        // 파라미터 목록 추출
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const core = (model as any).internalModel.coreModel;
          const paramList: Param[] = [];
          const ids = new Set<string>();
          for (let i = 0; i < core.getParameterCount(); i++) {
            const id = core.getParameterId(i);
            ids.add(id);
            paramList.push({
              id,
              value: core.getParameterValue(i),
              min:   core.getParameterMinimumValue(i),
              max:   core.getParameterMaximumValue(i),
            });
          }
          availIdsRef.current = ids;
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
        const onBeforeModelUpdate = () => {
          const core = internalModel.coreModel;
          overridesRef.current.forEach((v, id) => {
            try { core.setParameterValueById(id, v); } catch { /* noop */ }
          });
        };
        internalModel.on("beforeModelUpdate", onBeforeModelUpdate);

        // 얼굴 추적: 라이브러리 내장 focusController 사용(올바른 타이밍·스무딩 내장)
        function setFocus(e: PointerEvent, instant = false) {
          if (viewModeRef.current === "free" || !faceTrackRef.current) return;
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

        // 자유 시점: 드래그 이동 / 전신·상반신: 탭·드래그로 그쪽을 바라봄
        function onPtrDown(e: PointerEvent) {
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
            // 한 손가락 드래그: 이동
            freeRef.current.offsetX += e.clientX - lastPtrRef.current.x;
            freeRef.current.offsetY += e.clientY - lastPtrRef.current.y;
            lastPtrRef.current = { x: e.clientX, y: e.clientY };
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

        eventCleanup = () => {
          canvas.removeEventListener("pointermove",  onPtrMove);
          canvas.removeEventListener("pointerdown",  onPtrDown);
          canvas.removeEventListener("pointerup",    onPtrUp);
          canvas.removeEventListener("pointercancel",onPtrUp);
          canvas.removeEventListener("pointerleave", onFaceLeave);
          canvas.removeEventListener("wheel",        onWheel);
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
          <button
            onClick={resetFreeView}
            className="ml-auto px-2 py-1 rounded-lg text-[10px] glass glass-hover text-[var(--muted)]"
          >
            초기화
          </button>
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
        <div className="relative flex-1 min-h-[40vh] glass rounded-xl overflow-hidden">
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
                {viewMode === "free"
                  ? "드래그 이동 · 핀치/휠 확대축소"
                  : faceTrack
                    ? "터치·드래그로 각도 조절 · 손 떼면 유지 · 정면 버튼으로 복귀"
                    : "얼굴 반응 꺼짐 · 슬라이더로 직접 조작"}
              </span>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className={`w-full h-full touch-none ${
              viewMode === "free" ? "cursor-grab active:cursor-grabbing" : ""
            }`}
          />
        </div>
      </div>
    </div>
  );
}
