"use client";

import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Search, Layers, MousePointerClick, Plus, Pencil, Trash2, Check, FolderPlus, AlertTriangle, Share2, Link2, Loader2 } from "lucide-react";

export type MeshDiff = { onlyHere: string[]; missingHere: string[]; versions: number };

type Mesh = { index: number; id: string; part: string };
type Group = { id: string; name: string; ids: string[]; shared?: boolean; sharedIds?: string[] };

function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

type Props = {
  meshes: Mesh[];
  hiddenIds: Set<string>;
  groups: Group[];
  editingGroupId: string | null;
  selected: number | null;
  selectMode: boolean;
  sharingGroupId: string | null;
  onToggleMesh: (id: string, hide: boolean) => void;
  onToggleGroup: (g: Group) => void;
  onShowAll: () => void;
  onFlash: (index: number) => void;
  onToggleSelectMode: (on: boolean) => void;
  onCreateGroup: (name: string) => void;
  onDeleteGroup: (id: string) => void;
  onSetEditingGroup: (id: string | null) => void;
  onToggleMembership: (groupId: string, meshId: string) => void;
  onShareGroup: (g: Group) => void;
  diff?: MeshDiff | null;
};

const COLORS = ["#a855f7", "#ec4899", "#3b82f6", "#22c55e", "#f59e0b", "#06b6d4", "#ef4444", "#8b5cf6"];

export default function MeshPanel({
  meshes, hiddenIds, groups, editingGroupId, selected, selectMode, sharingGroupId,
  onToggleMesh, onToggleGroup, onShowAll, onFlash, onToggleSelectMode,
  onCreateGroup, onDeleteGroup, onSetEditingGroup, onToggleMembership, onShareGroup, diff,
}: Props) {
  const [query, setQuery] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const editingGroup = groups.find((g) => g.id === editingGroupId) || null;

  useEffect(() => {
    if (selected == null || !listRef.current) return;
    listRef.current.querySelector(`[data-mesh="${selected}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
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
  const list = q ? meshes.filter((m) => m.id.toLowerCase().includes(q) || m.part.toLowerCase().includes(q)) : meshes;

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="relative px-3 py-2 border-b border-white/5 flex items-center justify-between gap-2 flex-shrink-0">
        <p className="text-xs font-semibold text-[var(--fg)] flex items-center gap-1.5">
          ArtMesh<span className="text-[10px] text-[var(--muted)]">{meshes.length}</span>
          {hiddenIds.size > 0 && <span className="text-[10px] text-pink-400">· {hiddenIds.size} 숨김</span>}
          {diff && (
            <button
              onClick={() => setShowDiff((v) => !v)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-400 text-[9px] font-bold hover:bg-amber-400/25"
              title="다른 버전과 아트메쉬가 달라요 — 눌러서 차이 보기"
            >
              <AlertTriangle className="w-3 h-3" /> 메쉬 차이
            </button>
          )}
        </p>
        <div className="flex items-center gap-1">
          {hiddenIds.size > 0 && (
            <button onClick={onShowAll} className="px-2 py-0.5 rounded-md text-[10px] glass glass-hover text-[var(--muted)]">전체표시</button>
          )}
        </div>

        {/* 메쉬 차이 말풍선 */}
        {diff && showDiff && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowDiff(false)} />
            <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-xl border border-amber-400/30 p-3 shadow-2xl text-[10px] space-y-2" style={{ backgroundColor: "var(--bg-soft)" }}>
              <p className="text-amber-400 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> 다른 버전과 아트메쉬가 달라요 (버전 {diff.versions}개와 비교)
              </p>
              {diff.missingHere.length > 0 && (
                <div>
                  <p className="text-[var(--fg)] mb-0.5">이 버전엔 <b>없는</b> 메쉬 · {diff.missingHere.length}개 <span className="text-[var(--muted)]">(공유 폴더가 이걸 못 찾을 수 있어요)</span></p>
                  <p className="text-[var(--muted)] break-words leading-relaxed">{diff.missingHere.slice(0, 40).join(", ")}{diff.missingHere.length > 40 ? " …" : ""}</p>
                </div>
              )}
              {diff.onlyHere.length > 0 && (
                <div>
                  <p className="text-[var(--fg)] mb-0.5">이 버전에<b>만</b> 있는 메쉬 · {diff.onlyHere.length}개</p>
                  <p className="text-[var(--muted)] break-words leading-relaxed">{diff.onlyHere.slice(0, 40).join(", ")}{diff.onlyHere.length > 40 ? " …" : ""}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="px-2.5 pt-2 flex-shrink-0 space-y-2">
        {/* 그룹 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-[var(--muted)]">그룹</span>
            <button
              onClick={() => { const n = window.prompt("그룹 이름 (예: 머리카락, 얼굴)"); if (n) onCreateGroup(n); }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] glass glass-hover text-[var(--purple)]"
            >
              <FolderPlus className="w-3 h-3" /> 새 그룹
            </button>
          </div>
          {groups.length === 0 ? (
            <p className="text-[9px] text-[var(--muted)]/60 px-0.5">그룹을 만들어 머리카락·얼굴 등을 한 번에 켜고 꺼요</p>
          ) : (
            <div className="space-y-1">
              {groups.map((g, gi) => {
                const color = COLORS[gi % COLORS.length];
                const allHidden = g.ids.length > 0 && g.ids.every((id) => hiddenIds.has(id));
                const editing = editingGroupId === g.id;
                const modified = !!g.shared && !sameIds(g.ids, g.sharedIds ?? []); // 공유 후 멤버가 바뀜
                const showShare = !g.shared || modified;                          // 공유 전 · 또는 수정됨(다시 공유)
                const sharing = sharingGroupId === g.id;
                return (
                  <div key={g.id} className={`flex items-center gap-1 px-2 py-1 rounded-lg glass ${editing ? "ring-1 ring-[var(--purple)]" : ""}`}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    {g.shared && <Link2 className="w-3 h-3 text-emerald-400 flex-shrink-0" aria-label="공유된 폴더" />}
                    <span className="text-[11px] text-[var(--fg)] truncate flex-1">{g.name}<span className="text-[9px] text-[var(--muted)] ml-1">{g.ids.length}</span></span>
                    <button onClick={() => onToggleGroup(g)} className="p-1 glass-hover rounded" title={allHidden ? "그룹 표시" : "그룹 숨김"}>
                      {allHidden ? <EyeOff className="w-3.5 h-3.5 text-[var(--muted)]/60" /> : <Eye className="w-3.5 h-3.5 text-[var(--purple)]" />}
                    </button>
                    {showShare && (
                      <button onClick={() => onShareGroup(g)} disabled={sharing}
                        className={`p-1 glass-hover rounded ${modified ? "text-amber-400" : "text-[var(--purple)]"} disabled:opacity-50`}
                        title={modified ? "수정됨 — 다시 공유(다른 버전에도 반영)" : "이 폴더를 같은 모델의 모든 버전에 공유"}>
                        {sharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button onClick={() => onSetEditingGroup(editing ? null : g.id)} className={`p-1 glass-hover rounded ${editing ? "text-[var(--purple)]" : "text-[var(--muted)]"}`} title="멤버 편집">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => onDeleteGroup(g.id)} className="p-1 glass-hover rounded text-[var(--muted)] hover:text-red-400" title="그룹 삭제">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {editingGroup && (
          <div className="rounded-lg bg-[var(--purple)]/12 border border-[var(--purple)]/30 px-2.5 py-1.5 text-[10px] text-[var(--purple)] flex items-center justify-between gap-2">
            <span><b>{editingGroup.name}</b> 편집 중 — 메쉬·모델 클릭으로 추가/제거</span>
            <button onClick={() => onSetEditingGroup(null)} className="px-1.5 py-0.5 rounded bg-[var(--purple)]/25 font-medium">완료</button>
          </div>
        )}

        {/* 모델 클릭 선택 */}
        <button
          onClick={() => onToggleSelectMode(!selectMode)}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${selectMode ? "bg-[var(--purple)]/20 text-[var(--purple)]" : "glass glass-hover text-[var(--muted)]"}`}
        >
          <span className="flex items-center gap-1.5"><MousePointerClick className="w-3.5 h-3.5" /> 모델 클릭으로 선택</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${selectMode ? "bg-[var(--purple)]/30" : "bg-white/10"}`}>{selectMode ? "ON" : "OFF"}</span>
        </button>

        {/* 검색 */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2 pointer-events-none" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="메쉬·파트 검색"
            className="w-full glass rounded-lg pl-7 pr-2 py-1.5 text-[11px] placeholder-[var(--muted)]/60 outline-none focus:border-[var(--purple)]/50 transition-colors" />
        </div>
      </div>

      {/* 메쉬 목록 */}
      <div ref={listRef} className="flex-1 overflow-y-auto chat-scroll p-2.5 space-y-1 mt-1">
        {list.map((m) => {
          const isHidden = hiddenIds.has(m.id);
          const isSel = selected === m.index;
          const inEditGroup = editingGroup?.ids.includes(m.id);
          return (
            <div key={m.index} data-mesh={m.index}
              className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg glass ${isSel ? "ring-1 ring-[var(--purple)] bg-[var(--purple)]/10" : ""} ${isHidden ? "text-[var(--muted)]/50" : "text-[var(--fg)]"}`}>
              <button onClick={() => onToggleMesh(m.id, !isHidden)} className="flex-shrink-0 p-0.5 glass-hover rounded" title={isHidden ? "표시" : "숨김"}>
                {isHidden ? <EyeOff className="w-3.5 h-3.5 text-[var(--muted)]/50" /> : <Eye className="w-3.5 h-3.5 text-[var(--purple)]" />}
              </button>
              <button
                onClick={() => { if (editingGroupId) onToggleMembership(editingGroupId, m.id); else onFlash(m.index); }}
                className="flex-1 min-w-0 flex flex-col items-start text-left glass-hover rounded px-1 py-0.5"
                title={editingGroupId ? "그룹에 추가/제거" : `${m.id}\n클릭하면 깜빡여요`}
              >
                {m.part && <span className="text-[9px] text-[var(--purple)]/80 truncate max-w-full">{m.part}</span>}
                <span className={`text-[11px] truncate max-w-full ${isHidden ? "line-through" : ""}`}>{m.id}</span>
              </button>
              {editingGroupId ? (
                <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${inEditGroup ? "bg-[var(--purple)] text-white" : "border border-white/20"}`}>
                  {inEditGroup && <Check className="w-3 h-3" />}
                </span>
              ) : (
                <Plus className="w-3 h-3 text-[var(--muted)]/30 flex-shrink-0" />
              )}
            </div>
          );
        })}
        {list.length === 0 && <p className="text-[10px] text-[var(--muted)] text-center py-3">검색 결과가 없어요</p>}
      </div>
    </div>
  );
}
