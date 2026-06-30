"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, listAllStorageFiles } from "@/lib/supabase";

type Param = { id: string; value: number; min: number; max: number };

type Props = {
  sessionId: string;
  onParamChange?: (paramId: string, value: number) => void;
};

export default function ModelViewer({ sessionId, onParamChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<unknown>(null);
  const modelRef = useRef<unknown>(null);
  const targetFaceRef = useRef({ x: 0, y: 0 });
  const currentFaceRef = useRef({ x: 0, y: 0 });
  const [params, setParams] = useState<Param[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let destroyed = false;
    let pointerCleanup: (() => void) | null = null;

    async function init() {
      try {
        const allFiles = await listAllStorageFiles(sessionId);
        const model3Path = allFiles.find((p) => p.endsWith(".model3.json"));
        if (!model3Path) throw new Error("model3.json 파일을 찾을 수 없어요");

        const { data: urlData } = supabase.storage
          .from("models")
          .getPublicUrl(model3Path);

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

        // 모델 크기/위치 조정 (origW/H는 scale 적용 전 원본 크기)
        const origW = model.width;
        const origH = model.height;
        const scale = Math.min(
          (app.renderer.width * 0.8) / origW,
          (app.renderer.height * 0.9) / origH
        );
        model.scale.set(scale);
        model.x = (app.renderer.width - origW * scale) / 2;
        model.y = app.renderer.height * 0.05;

        setLoading(false);

        // 파라미터 목록 추출 (실패해도 모델은 그대로 표시)
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const core = (model as any).internalModel.coreModel;
          const paramList: Param[] = [];
          for (let i = 0; i < core.getParameterCount(); i++) {
            paramList.push({
              id: core.getParameterId(i),
              value: core.getParameterValue(i),
              min: core.getParameterMinimumValue(i),
              max: core.getParameterMaximumValue(i),
            });
          }
          setParams(paramList);
        } catch { /* 파라미터 추출 실패해도 뷰어는 정상 작동 */ }

        // ── 터치·마우스 → 얼굴 각도·시선 추적 ──
        const canvas = canvasRef.current!;

        function onPointerMove(e: PointerEvent) {
          const rect = canvas.getBoundingClientRect();
          // 캔버스 중심 기준 -1 ~ 1 정규화 (Y는 위가 양수)
          targetFaceRef.current = {
            x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
            y: -(((e.clientY - rect.top) / rect.height) * 2 - 1),
          };
        }

        function onPointerLeave() {
          // 포인터가 캔버스 밖으로 나가면 중립 위치로 복귀
          targetFaceRef.current = { x: 0, y: 0 };
        }

        canvas.addEventListener("pointermove", onPointerMove);
        canvas.addEventListener("pointerleave", onPointerLeave);
        pointerCleanup = () => {
          canvas.removeEventListener("pointermove", onPointerMove);
          canvas.removeEventListener("pointerleave", onPointerLeave);
        };

        // PIXI 렌더 루프마다 부드럽게 보간(lerp) 후 파라미터 적용
        app.ticker.add(() => {
          const cur = currentFaceRef.current;
          const tgt = targetFaceRef.current;
          cur.x += (tgt.x - cur.x) * 0.08;
          cur.y += (tgt.y - cur.y) * 0.08;

          if (!modelRef.current) return;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const core = (modelRef.current as any).internalModel.coreModel;
            core.setParameterValueById("ParamAngleX",    cur.x * 30);   // 얼굴 좌우
            core.setParameterValueById("ParamAngleY",    cur.y * 20);   // 얼굴 상하
            core.setParameterValueById("ParamAngleZ",    cur.x * -8);   // 얼굴 기울기
            core.setParameterValueById("ParamEyeBallX",  cur.x * 0.8);  // 시선 좌우
            core.setParameterValueById("ParamEyeBallY",  cur.y * 0.6);  // 시선 상하
            core.setParameterValueById("ParamBodyAngleX", cur.x * 8);   // 몸 약간 따라오기
          } catch { /* 파라미터 없는 모델도 정상 표시 */ }
        });

      } catch (err: unknown) {
        if (!destroyed) {
          const raw = err instanceof Error ? err.message : String(err);
          let friendly = raw;
          if (raw.includes("model3.json")) {
            friendly = "model3.json 파일을 찾을 수 없어요. 업로드가 제대로 됐는지 확인해주세요.";
          } else if (/texture|\.png|image/i.test(raw)) {
            friendly = "텍스처(이미지) 파일을 불러오지 못했어요. 텍스처 파일이 빠졌을 수 있어요.";
          } else if (/moc/i.test(raw)) {
            friendly = "moc3 파일을 불러오지 못했어요. 파일이 손상됐거나 빠졌을 수 있어요.";
          } else if (/fetch|network|404|load/i.test(raw)) {
            friendly = "모델 파일을 불러오지 못했어요. 일부 파일이 누락됐거나 만료됐을 수 있어요.";
          } else {
            friendly = "모델을 불러오지 못했어요. 파일이 올바른지 확인해주세요.";
          }
          setError(friendly);
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      destroyed = true;
      pointerCleanup?.();
      if (appRef.current) {
        (appRef.current as { destroy: (v: boolean) => void }).destroy(true);
      }
    };
  }, [sessionId]);

  function setParam(paramId: string, value: number) {
    if (!modelRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const core = (modelRef.current as any).internalModel.coreModel;
    core.setParameterValueById(paramId, value);
    setParams((prev) =>
      prev.map((p) => (p.id === paramId ? { ...p, value } : p))
    );
    onParamChange?.(paramId, value);
  }

  return (
    <div className="flex flex-col md:flex-row h-full gap-3">
      {/* 캔버스 */}
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
        <canvas ref={canvasRef} className="w-full h-full touch-none" />
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
  );
}
