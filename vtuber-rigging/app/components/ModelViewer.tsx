"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, listAllStorageFiles } from "@/lib/supabase";

type Param = { id: string; value: number; min: number; max: number };
type ViewMode = "fullbody" | "upperbody" | "free";

type Props = {
  sessionId: string;
  onParamChange?: (paramId: string, value: number) => void;
};

const VIEW_LABELS: Record<ViewMode, string> = {
  fullbody: "전신",
  upperbody: "상반신",
  free: "자유 시점",
};

export default function ModelViewer({ sessionId, onParamChange }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const appRef      = useRef<unknown>(null);
  const modelRef    = useRef<unknown>(null);

  // 원본 크기 (scale 전)
  const origWRef = useRef(0);

  // 전신 기준 transform
  const baseRef = useRef({ x: 0, y: 0, scale: 1 });

  // 얼굴 추적 (전신·상반신 모드)
  const targetFaceRef  = useRef({ x: 0, y: 0 });
  const currentFaceRef = useRef({ x: 0, y: 0 });

  // 자유 시점 상태
  const viewModeRef       = useRef<ViewMode>("fullbody");
  const freeRef           = useRef({ offsetX: 0, offsetY: 0, zoom: 1 });
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistRef  = useRef(0);
  const isDraggingRef     = useRef(false);
  const lastPtrRef        = useRef({ x: 0, y: 0 });

  const [viewMode, setViewMode] = useState<ViewMode>("fullbody");
  const [params,   setParams]   = useState<Param[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

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
      // 상반신: 전신 대비 ~1.85× 확대 후 상단 고정 → 얼굴·어깨 영역만 표시
      const upScale = base.scale * 1.85;
      mdl.scale.set(upScale);
      mdl.x = (app.renderer.width - origW * upScale) / 2;
      mdl.y = base.y;  // 상단 여백 유지 → 하단이 화면 밖으로

    } else {
      // 자유 시점: 전신 위치에서 시작
      freeRef.current = { offsetX: 0, offsetY: 0, zoom: 1 };
      mdl.scale.set(base.scale);
      mdl.x = base.x;
      mdl.y = base.y;
    }

    targetFaceRef.current  = { x: 0, y: 0 };
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

        modelRef.current = model;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        app.stage.addChild(model as any);

        // 기준 transform 계산 (전신 기준)
        const origW  = model.width;
        const origH  = model.height;
        origWRef.current = origW;

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
          for (let i = 0; i < core.getParameterCount(); i++) {
            paramList.push({
              id:    core.getParameterId(i),
              value: core.getParameterValue(i),
              min:   core.getParameterMinimumValue(i),
              max:   core.getParameterMaximumValue(i),
            });
          }
          setParams(paramList);
        } catch { /* 파라미터 없어도 정상 표시 */ }

        // ── 이벤트 핸들러 ──────────────────────────────────────────────────
        const canvas = canvasRef.current!;

        // 전신·상반신: 얼굴 추적
        function onFaceMove(e: PointerEvent) {
          if (viewModeRef.current === "free") return;
          const rect = canvas.getBoundingClientRect();
          targetFaceRef.current = {
            x:  ((e.clientX - rect.left) / rect.width)  * 2 - 1,
            y: -(((e.clientY - rect.top)  / rect.height) * 2 - 1),
          };
        }
        function onFaceLeave() {
          targetFaceRef.current = { x: 0, y: 0 };
        }

        // 자유 시점: 드래그 이동
        function onPtrDown(e: PointerEvent) {
          if (viewModeRef.current !== "free") return;
          canvas.setPointerCapture(e.pointerId);
          activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          isDraggingRef.current = true;
          lastPtrRef.current    = { x: e.clientX, y: e.clientY };
        }

        function onPtrMove(e: PointerEvent) {
          if (viewModeRef.current !== "free") { onFaceMove(e); return; }
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
          const mode = viewModeRef.current;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mdl  = modelRef.current as any;
          if (!mdl) return;

          if (mode !== "free") {
            // 얼굴 추적 부드러운 보간 (lerp)
            const cur = currentFaceRef.current;
            const tgt = targetFaceRef.current;
            cur.x += (tgt.x - cur.x) * 0.08;
            cur.y += (tgt.y - cur.y) * 0.08;

            try {
              const core = mdl.internalModel.coreModel;
              core.setParameterValueById("ParamAngleX",     cur.x * 30);  // 얼굴 좌우
              core.setParameterValueById("ParamAngleY",     cur.y * 20);  // 얼굴 상하
              core.setParameterValueById("ParamAngleZ",     cur.x * -8);  // 얼굴 기울기
              core.setParameterValueById("ParamEyeBallX",   cur.x * 0.8); // 시선 좌우
              core.setParameterValueById("ParamEyeBallY",   cur.y * 0.6); // 시선 상하
              core.setParameterValueById("ParamBodyAngleX", cur.x * 8);   // 몸 연동
            } catch { /* 파라미터 없는 모델도 정상 표시 */ }

          } else {
            // 자유 시점: 팬·줌 transform 적용
            const base = baseRef.current;
            const free = freeRef.current;
            mdl.scale.set(base.scale * free.zoom);
            mdl.x = base.x + free.offsetX;
            mdl.y = base.y + free.offsetY;
          }
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

  function setParam(paramId: string, value: number) {
    if (!modelRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (modelRef.current as any).internalModel.coreModel.setParameterValueById(paramId, value);
    setParams((prev) => prev.map((p) => (p.id === paramId ? { ...p, value } : p)));
    onParamChange?.(paramId, value);
  }

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
        {viewMode === "free" && (
          <button
            onClick={resetFreeView}
            className="ml-auto px-2 py-1 rounded-lg text-[10px] glass glass-hover text-[var(--muted)]"
          >
            초기화
          </button>
        )}
      </div>

      {/* 캔버스 + 파라미터 */}
      <div className="flex flex-col md:flex-row flex-1 gap-3 min-h-0 px-3 pb-3">

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
          {viewMode === "free" && !loading && !error && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <span className="text-[10px] text-[var(--muted)]/50 bg-black/20 rounded-full px-2 py-0.5">
                드래그 이동 · 핀치/휠 확대축소
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

        {/* 파라미터 슬라이더 */}
        {params.length > 0 && (
          <div className="w-full md:w-56 h-48 md:h-auto flex flex-col glass rounded-2xl overflow-hidden flex-shrink-0">
            <div className="px-3 py-2.5 border-b border-white/5">
              <p className="text-xs font-semibold text-[var(--fg)]">파라미터 조작</p>
            </div>
            <div className="flex-1 overflow-y-auto chat-scroll p-2.5 space-y-2.5">
              {params.map((p) => {
                const pct = ((p.value - p.min) / (p.max - p.min)) * 100;
                return (
                  <div key={p.id} className="space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-[10px] text-[var(--muted)] truncate max-w-[110px]" title={p.id}>
                        {p.id.replace("Param", "")}
                      </span>
                      <span className="text-[10px] text-[var(--purple)] font-mono">
                        {p.value.toFixed(2)}
                      </span>
                    </div>
                    <div className="relative h-4 flex items-center">
                      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-600 to-pink-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <input
                        type="range"
                        min={p.min}
                        max={p.max}
                        step={(p.max - p.min) / 200}
                        value={p.value}
                        onChange={(e) => setParam(p.id, parseFloat(e.target.value))}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
