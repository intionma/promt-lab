"use client";

import { useState } from "react";
import { Eye, EyeOff, Search, Layers } from "lucide-react";

type Mesh = { index: number; id: string };

type Props = {
  meshes: Mesh[];
  hidden: Set<number>;
  onToggle: (index: number, hidden: boolean) => void;
  onShowAll: () => void;
};

export default function MeshPanel({ meshes, hidden, onToggle, onShowAll }: Props) {
  const [query, setQuery] = useState("");

  if (meshes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--muted)] p-4 text-center">
        <Layers className="w-8 h-8 opacity-40" />
        <p className="text-sm">ArtMesh 정보를 불러오는 중이거나 없어요</p>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const list = q ? meshes.filter((m) => m.id.toLowerCase().includes(q)) : meshes;

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

      <div className="px-2.5 pt-2.5 flex-shrink-0">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="메쉬 검색 (예: eye, hair, mouth)"
            className="w-full glass rounded-lg pl-7 pr-2 py-1.5 text-[11px] placeholder-[var(--muted)]/60 outline-none focus:border-[var(--purple)]/50 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto chat-scroll p-2.5 space-y-1">
        {list.length === 0 ? (
          <p className="text-[10px] text-[var(--muted)] text-center py-3">검색 결과가 없어요</p>
        ) : (
          list.map((m) => {
            const isHidden = hidden.has(m.index);
            return (
              <button
                key={m.index}
                onClick={() => onToggle(m.index, !isHidden)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all ${
                  isHidden ? "glass glass-hover text-[var(--muted)]/50" : "glass glass-hover text-[var(--fg)]"
                }`}
                title={m.id}
              >
                {isHidden ? (
                  <EyeOff className="w-3.5 h-3.5 flex-shrink-0 text-[var(--muted)]/50" />
                ) : (
                  <Eye className="w-3.5 h-3.5 flex-shrink-0 text-[var(--purple)]" />
                )}
                <span className={`text-[11px] truncate ${isHidden ? "line-through" : ""}`}>
                  {m.id}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
