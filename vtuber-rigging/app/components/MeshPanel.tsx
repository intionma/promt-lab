"use client";

import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Search, Layers, Sparkles, MousePointerClick } from "lucide-react";

type Mesh = { index: number; id: string; part: string };

type Props = {
  meshes: Mesh[];
  hidden: Set<number>;
  selected: number | null;
  selectMode: boolean;
  onToggle: (index: number, hidden: boolean) => void;
  onShowAll: () => void;
  onFlash: (index: number) => void;
  onToggleSelectMode: (on: boolean) => void;
};

export default function MeshPanel({ meshes, hidden, selected, selectMode, onToggle, onShowAll, onFlash, onToggleSelectMode }: Props) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // 모델에서 클릭으로 선택된 메쉬를 목록에서 스크롤·표시
  useEffect(() => {
    if (selected == null || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-mesh="${selected}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selected]);

  if (meshes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--muted)] p-4 text-center">
        <Layers className="w-8 h-8 opacity-40" />
        <p className="text-sm">ArtMesh 정보를 불러오는 중이거나 없어요</p>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const list = q
    ? meshes.filter((m) => m.id.toLowerCase().includes(q) || m.part.toLowerCase().includes(q))
    : meshes;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between gap-2 flex-shrink-0">
        <p className="text-xs font-semibold text-[var(--fg)]">
          ArtMesh
          <span className="text-[10px] text-[var(--muted)] ml-1">{meshes.length}개</span>
          {hidden.size > 0 && (
            <span className="text-[10px] text-pink-400 ml-1">· {hidden.size} 숨김</span>
          )}
        </p>
        {hidden.size > 0 && (
          <button
            onClick={onShowAll}
            className="px-2 py-0.5 rounded-md text-[10px] glass glass-hover text-[var(--muted)]"
          >
            전체 표시
          </button>
        )}
      </div>

      <div className="px-2.5 pt-2.5 flex-shrink-0 space-y-1.5">
        <button
          onClick={() => onToggleSelectMode(!selectMode)}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
            selectMode ? "bg-[var(--purple)]/20 text-[var(--purple)]" : "glass glass-hover text-[var(--muted)]"
          }`}
          title="켜면 모델을 클릭해서 그 자리의 ArtMesh 를 바로 선택할 수 있어요"
        >
          <span className="flex items-center gap-1.5"><MousePointerClick className="w-3.5 h-3.5" /> 모델 클릭으로 선택</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${selectMode ? "bg-[var(--purple)]/30" : "bg-white/10"}`}>
            {selectMode ? "ON" : "OFF"}
          </span>
        </button>
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="메쉬·파트 검색"
            className="w-full glass rounded-lg pl-7 pr-2 py-1.5 text-[11px] placeholder-[var(--muted)]/60 outline-none focus:border-[var(--purple)]/50 transition-colors"
          />
        </div>
        <p className="text-[9px] text-[var(--muted)]/70 px-0.5">
          {selectMode
            ? "모델을 클릭하면 그 부위 메쉬가 아래에서 선택돼요 (겹치면 반복 클릭)"
            : "이름을 누르면 모델에서 깜빡여요 · 눈 아이콘으로 숨김"}
        </p>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto chat-scroll p-2.5 space-y-1">
        {list.length === 0 ? (
          <p className="text-[10px] text-[var(--muted)] text-center py-3">검색 결과가 없어요</p>
        ) : (
          list.map((m) => {
            const isHidden = hidden.has(m.index);
            const isSel = selected === m.index;
            return (
              <div
                key={m.index}
                data-mesh={m.index}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg glass ${
                  isSel ? "ring-1 ring-[var(--purple)] bg-[var(--purple)]/10" : ""
                } ${isHidden ? "text-[var(--muted)]/50" : "text-[var(--fg)]"}`}
              >
                <button
                  onClick={() => onToggle(m.index, !isHidden)}
                  className="flex-shrink-0 p-0.5 glass-hover rounded"
                  title={isHidden ? "표시" : "숨김"}
                >
                  {isHidden ? (
                    <EyeOff className="w-3.5 h-3.5 text-[var(--muted)]/50" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-[var(--purple)]" />
                  )}
                </button>
                <button
                  onClick={() => onFlash(m.index)}
                  className="flex-1 min-w-0 flex flex-col items-start text-left glass-hover rounded px-1 py-0.5"
                  title={`${m.id}\n클릭하면 모델에서 깜빡여요`}
                >
                  {m.part && (
                    <span className="text-[9px] text-[var(--purple)] truncate max-w-full">{m.part}</span>
                  )}
                  <span className={`text-[11px] truncate max-w-full ${isHidden ? "line-through" : ""}`}>
                    {m.id}
                  </span>
                </button>
                <Sparkles className="w-3 h-3 text-[var(--muted)]/40 flex-shrink-0" />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
