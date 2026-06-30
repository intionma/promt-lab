"use client";

import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Search, Layers, MousePointerClick, Plus, Pencil, Trash2, Check, Save, FolderPlus } from "lucide-react";

type Mesh = { index: number; id: string; part: string };
type Group = { id: string; name: string; ids: string[] };

type Props = {
  meshes: Mesh[];
  hiddenIds: Set<string>;
  groups: Group[];
  editingGroupId: string | null;
  selected: number | null;
  selectMode: boolean;
  saving: boolean;
  onToggleMesh: (id: string, hide: boolean) => void;
  onToggleGroup: (g: Group) => void;
  onShowAll: () => void;
  onFlash: (index: number) => void;
  onToggleSelectMode: (on: boolean) => void;
  onCreateGroup: (name: string) => void;
  onDeleteGroup: (id: string) => void;
  onSetEditingGroup: (id: string | null) => void;
  onToggleMembership: (groupId: string, meshId: string) => void;
  onSave: () => void;
};

const COLORS = ["#a855f7", "#ec4899", "#3b82f6", "#22c55e", "#f59e0b", "#06b6d4", "#ef4444", "#8b5cf6"];

export default function MeshPanel({
  meshes, hiddenIds, groups, editingGroupId, selected, selectMode, saving,
  onToggleMesh, onToggleGroup, onShowAll, onFlash, onToggleSelectMode,
  onCreateGroup, onDeleteGroup, onSetEditingGroup, onToggleMembership, onSave,
}: Props) {
  const [query, setQuery] = useState("");
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
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between gap-2 flex-shrink-0">
        <p className="text-xs font-semibold text-[var(--fg)]">
          ArtMesh<span className="text-[10px] text-[var(--muted)] ml-1">{meshes.length}</span>
          {hiddenIds.size > 0 && <span className="text-[10px] text-pink-400 ml-1">· {hiddenIds.size} 숨김</span>}
        </p>
        <div className="flex items-center gap-1">
          {hiddenIds.size > 0 && (
            <button onClick={onShowAll} className="px-2 py-0.5 rounded-md text-[10px] glass glass-hover text-[var(--muted)]">전체표시</button>
          )}
          <button onClick={onSave} disabled={saving} className="px-2 py-0.5 rounded-md text-[10px] bg-[var(--purple)]/25 text-[var(--purple)] flex items-center gap-1 disabled:opacity-50" title="그룹·숨김 상태를 모두에게 공유 저장">
            <Save className="w-2.5 h-2.5" /> {saving ? "저장중" : "공유 저장"}
          </button>
        </div>
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
                return (
                  <div key={g.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg glass ${editing ? "ring-1 ring-[var(--purple)]" : ""}`}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-[11px] text-[var(--fg)] truncate flex-1">{g.name}<span className="text-[9px] text-[var(--muted)] ml-1">{g.ids.length}</span></span>
                    <button onClick={() => onToggleGroup(g)} className="p-1 glass-hover rounded" title={allHidden ? "그룹 표시" : "그룹 숨김"}>
                      {allHidden ? <EyeOff className="w-3.5 h-3.5 text-[var(--muted)]/60" /> : <Eye className="w-3.5 h-3.5 text-[var(--purple)]" />}
                    </button>
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
