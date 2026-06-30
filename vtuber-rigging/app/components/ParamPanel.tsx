"use client";

import type { Param } from "./ModelViewer";

type Props = {
  params: Param[];
  overrideIds: Set<string>;
  onChange: (id: string, value: number) => void;
  onRelease: (id: string) => void;
  onResetAll: () => void;
};

export default function ParamPanel({
  params,
  overrideIds,
  onChange,
  onRelease,
  onResetAll,
}: Props) {
  if (params.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--muted)] p-4 text-center">
        <p className="text-sm">파라미터를 불러오는 중이거나</p>
        <p className="text-xs">이 모델엔 조작 가능한 파라미터가 없어요</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between gap-2 flex-shrink-0">
        <p className="text-xs font-semibold text-[var(--fg)]">
          파라미터 조작
          <span className="text-[10px] text-[var(--muted)] ml-1">{params.length}개</span>
        </p>
        {overrideIds.size > 0 && (
          <button
            onClick={onResetAll}
            className="px-2 py-0.5 rounded-md text-[10px] glass glass-hover text-[var(--muted)]"
            title="모든 고정값 해제 → 얼굴추적 자동 제어로 복귀"
          >
            초기화 {overrideIds.size}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto chat-scroll p-2.5 space-y-2.5">
        {params.map((p) => {
          const pct     = ((p.value - p.min) / (p.max - p.min)) * 100;
          const isFixed = overrideIds.has(p.id);
          return (
            <div key={p.id} className="space-y-0.5">
              <div className="flex justify-between items-center">
                <button
                  onClick={() => isFixed && onRelease(p.id)}
                  className="text-[11px] text-[var(--muted)] truncate max-w-[150px] flex items-center gap-1 text-left"
                  title={isFixed ? `${p.id} — 클릭하면 고정 해제` : p.id}
                >
                  {isFixed && <span className="w-1.5 h-1.5 rounded-full bg-pink-400 flex-shrink-0" />}
                  {p.id.replace("Param", "")}
                </button>
                <span className="text-[10px] text-[var(--purple)] font-mono">
                  {p.value.toFixed(2)}
                </span>
              </div>
              <div className="relative h-5 flex items-center">
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
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
                  onChange={(e) => onChange(p.id, parseFloat(e.target.value))}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
