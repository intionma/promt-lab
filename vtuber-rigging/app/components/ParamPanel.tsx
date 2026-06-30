"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Search, Zap } from "lucide-react";
import type { Param } from "./ModelViewer";

type Props = {
  params: Param[];
  overrideIds: Set<string>;
  sweepOn: boolean;
  onChange: (id: string, value: number) => void;
  onRelease: (id: string) => void;
  onResetAll: () => void;
  onToggleSweep: (on: boolean) => void;
};

// 기본(주요) 파라미터 — VTube Studio / Cubism 표준 얼굴·몸 파라미터.
// 나머지(커스텀·VBridger·물리·ArtMesh 등)는 전부 '고급 설정'으로 분리.
const PRIMARY_IDS = new Set([
  "ParamAngleX", "ParamAngleY", "ParamAngleZ",
  "ParamEyeBallX", "ParamEyeBallY",
  "ParamEyeLOpen", "ParamEyeROpen",
  "ParamEyeLSmile", "ParamEyeRSmile",
  "ParamBrowLY", "ParamBrowRY", "ParamBrowLForm", "ParamBrowRForm",
  "ParamMouthOpenY", "ParamMouthForm", "ParamMouthX",
  "ParamCheekPuff", "ParamCheekPuffC",
  "ParamBodyAngleX", "ParamBodyAngleY", "ParamBodyAngleZ",
  "ParamBreath",
]);

function Slider({
  p, isFixed, onChange, onRelease,
}: {
  p: Param;
  isFixed: boolean;
  onChange: (id: string, value: number) => void;
  onRelease: (id: string) => void;
}) {
  const pct = ((p.value - p.min) / (p.max - p.min)) * 100;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-center">
        <button
          onClick={() => isFixed && onRelease(p.id)}
          className="text-[11px] text-[var(--muted)] truncate max-w-[160px] flex items-center gap-1 text-left"
          title={isFixed ? `${p.id} — 클릭하면 고정 해제` : p.id}
        >
          {isFixed && <span className="w-1.5 h-1.5 rounded-full bg-pink-400 flex-shrink-0" />}
          {p.id.replace("Param", "")}
        </button>
        <span className="text-[10px] text-[var(--purple)] font-mono">{p.value.toFixed(2)}</span>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="absolute inset-x-0 h-1.5 bg-white/10 rounded-full overflow-hidden">
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
          className="param-slider absolute inset-0"
        />
      </div>
    </div>
  );
}

export default function ParamPanel({
  params,
  overrideIds,
  sweepOn,
  onChange,
  onRelease,
  onResetAll,
  onToggleSweep,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [query, setQuery] = useState("");

  if (params.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--muted)] p-4 text-center">
        <p className="text-sm">파라미터를 불러오는 중이거나</p>
        <p className="text-xs">이 모델엔 조작 가능한 파라미터가 없어요</p>
      </div>
    );
  }

  const hasPrimary = params.some((p) => PRIMARY_IDS.has(p.id));
  const primary  = hasPrimary ? params.filter((p) => PRIMARY_IDS.has(p.id)) : params;
  const advanced = hasPrimary ? params.filter((p) => !PRIMARY_IDS.has(p.id)) : [];

  const q = query.trim().toLowerCase();
  const advFiltered = q
    ? advanced.filter((p) => p.id.toLowerCase().includes(q))
    : advanced;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between gap-2 flex-shrink-0">
        <p className="text-xs font-semibold text-[var(--fg)]">
          파라미터 조작
          <span className="text-[10px] text-[var(--muted)] ml-1">{params.length}개</span>
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleSweep(!sweepOn)}
            className={`px-2 py-0.5 rounded-md text-[10px] flex items-center gap-1 transition-all ${sweepOn ? "bg-[var(--purple)]/25 text-[var(--purple)]" : "glass glass-hover text-[var(--muted)]"}`}
            title="모든 파라미터를 랜덤 속도로 끝값까지 왕복 — 한 번에 전체 테스트"
          >
            <Zap className="w-2.5 h-2.5" /> {sweepOn ? "테스트 중" : "극한값 테스트"}
          </button>
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
      </div>

      <div className="flex-1 overflow-y-auto chat-scroll p-2.5 space-y-2.5">
        {/* 기본(주요) 파라미터 */}
        {primary.map((p) => (
          <Slider
            key={p.id}
            p={p}
            isFixed={overrideIds.has(p.id)}
            onChange={onChange}
            onRelease={onRelease}
          />
        ))}

        {/* 고급 설정 — 나머지 전체 파라미터 */}
        {advanced.length > 0 && (
          <div className="pt-1">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg glass glass-hover text-[11px] font-medium text-[var(--fg)]"
            >
              {showAdvanced ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              고급 설정
              <span className="text-[10px] text-[var(--muted)]">전체 {advanced.length}개</span>
            </button>

            {showAdvanced && (
              <div className="mt-2 space-y-2.5">
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2 pointer-events-none" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="파라미터 검색 (예: Jaw, Mouth)"
                    className="w-full glass rounded-lg pl-7 pr-2 py-1.5 text-[11px] placeholder-[var(--muted)]/60 outline-none focus:border-[var(--purple)]/50 transition-colors"
                  />
                </div>
                {advFiltered.length === 0 ? (
                  <p className="text-[10px] text-[var(--muted)] text-center py-2">검색 결과가 없어요</p>
                ) : (
                  advFiltered.map((p) => (
                    <Slider
                      key={p.id}
                      p={p}
                      isFixed={overrideIds.has(p.id)}
                      onChange={onChange}
                      onRelease={onRelease}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-white/5 flex-shrink-0">
        <p className="text-[9px] text-[var(--muted)]/70 text-center">
          모든 파라미터는 미리보기 화면에 즉시 반영돼요
        </p>
      </div>
    </div>
  );
}
