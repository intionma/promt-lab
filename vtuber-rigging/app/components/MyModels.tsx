"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ExternalLink, Trash2, Calendar, Layers, Boxes, Loader2, HardDrive, FileText, Download, GripVertical, Split, AlertTriangle, Pencil, Lock, Check, X } from "lucide-react";
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCorners, useDroppable, type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  supabase,
  getStorageUsage,
  formatBytes,
  listFilesWithMeta,
  publicUrl,
  STORAGE_LIMIT_BYTES,
  type Session,
} from "@/lib/supabase";

type VersionItem = Session & { versionNo: number; size: number };

function formatDate(s: string) {
  const d = new Date(s);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 같은 그룹 안에서 표시 순서 비교 — sort_order 가 있으면 우선(작을수록 위), 없으면 최신순
function orderCmp(a: Session, b: Session) {
  const ax = a.sort_order, bx = b.sort_order;
  const aHas = typeof ax === "number", bHas = typeof bx === "number";
  if (aHas && bHas) return ax! - bx!;
  if (aHas) return -1;
  if (bHas) return 1;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export default function MyModels({ adminPin }: { adminPin: string | null }) {
  const admin = !!adminPin;
  const [loading, setLoading] = useState(true);
  const [totalUsage, setTotalUsage] = useState(0);

  // 드래그앤드롭 정렬 상태
  const [containers, setContainers] = useState<string[]>([]);
  const [items, setItems] = useState<Record<string, string[]>>({});
  const [vmap, setVmap] = useState<Record<string, VersionItem>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState<Session | null>(null);

  // 버전별 파일 목록 펼치기
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fileCache, setFileCache] = useState<Record<string, { path: string; size: number }[] | "loading">>({});

  // 인라인 편집(팝업 대신 그 자리에서 수정) — 버전 제목+설명 / 모델 이름
  const [editingVer, setEditingVer] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [expandedDesc, setExpandedDesc] = useState<string | null>(null); // 긴 설명 펼침
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [editModelName, setEditModelName] = useState("");
  // Enter→저장 직후 blur 로 저장이 한 번 더 불리는 중복 저장 방지(같은 tick 내 1회)
  const saveGuard = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  async function toggleFiles(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!fileCache[id]) {
      setFileCache((p) => ({ ...p, [id]: "loading" }));
      const files = await listFilesWithMeta(id);
      setFileCache((p) => ({ ...p, [id]: files }));
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("sessions").select("*").order("created_at", { ascending: false });
    if (!data) { setContainers([]); setItems({}); setVmap({}); setLoading(false); return; }

    const sizes = await Promise.all((data as Session[]).map((s) => getStorageUsage(s.id)));
    const sizeMap = new Map<string, number>();
    (data as Session[]).forEach((s, i) => sizeMap.set(s.id, sizes[i]));
    setTotalUsage(sizes.reduce((a, b) => a + b, 0));

    const groupMap = new Map<string, Session[]>();
    for (const s of data as Session[]) {
      const key = s.model_name || s.title;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(s);
    }

    const nextContainers: string[] = [];
    const nextItems: Record<string, string[]> = {};
    const nextVmap: Record<string, VersionItem> = {};
    const groupList = Array.from(groupMap.entries());
    groupList.sort((a, b) => {
      const al = Math.max(...a[1].map((v) => new Date(v.created_at).getTime()));
      const bl = Math.max(...b[1].map((v) => new Date(v.created_at).getTime()));
      return bl - al;
    });
    for (const [name, sessions] of groupList) {
      const ordered = [...sessions].sort(orderCmp);
      nextContainers.push(name);
      nextItems[name] = ordered.map((s) => s.id);
      const n = ordered.length;
      ordered.forEach((s, idx) => {
        nextVmap[s.id] = { ...s, versionNo: n - idx, size: sizeMap.get(s.id) || 0 };
      });
    }
    setContainers(nextContainers);
    setItems(nextItems);
    setVmap(nextVmap);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setMounted(true); }, []);

  const findContainer = useCallback(
    (id: string): string | undefined => {
      if (containers.includes(id)) return id;
      return containers.find((c) => items[c]?.includes(id));
    },
    [containers, items]
  );

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveId(id);
    setDragSource(findContainer(id) ?? null);
  }

  function handleDragOver(e: DragOverEvent) {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    const from = findContainer(activeId);
    const to = findContainer(overId);
    if (!from || !to || from === to) return;
    setItems((prev) => {
      const fromArr = prev[from] ?? [];
      const toArr = prev[to] ?? [];
      const overIndex = containers.includes(overId) ? toArr.length : toArr.indexOf(overId);
      const insertAt = overIndex >= 0 ? overIndex : toArr.length;
      return {
        ...prev,
        [from]: fromArr.filter((x) => x !== activeId),
        [to]: [...toArr.slice(0, insertAt), activeId, ...toArr.slice(insertAt)],
      };
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const aId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    const source = dragSource;
    setActiveId(null);
    setDragSource(null);
    if (!overId) return;

    const to = findContainer(overId);
    if (!to) return;

    let nextItems = items;
    if (to === findContainer(aId)) {
      const arr = items[to] ?? [];
      const oldIndex = arr.indexOf(aId);
      const newIndex = containers.includes(overId) ? arr.length - 1 : arr.indexOf(overId);
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        nextItems = { ...items, [to]: arrayMove(arr, oldIndex, newIndex) };
        setItems(nextItems);
      }
    }

    const affected = new Set<string>();
    if (source) affected.add(source);
    affected.add(to);
    persistOrder(nextItems, affected);
  }

  // 낙관적 업데이트용 스냅샷/롤백 (모든 변경은 화면 먼저 반영 → 새로고침 없음 → 깜빡임 없음)
  function snapshot() {
    return { containers, items, vmap, usage: totalUsage };
  }
  function restore(s: { containers: string[]; items: Record<string, string[]>; vmap: Record<string, VersionItem>; usage: number }) {
    setContainers(s.containers); setItems(s.items); setVmap(s.vmap); setTotalUsage(s.usage);
  }

  async function persistOrder(itemsState: Record<string, string[]>, affected: Set<string>) {
    const updates: { id: string; model_name: string; sort_order: number }[] = [];
    for (const c of affected) {
      (itemsState[c] ?? []).forEach((id, idx) => updates.push({ id, model_name: c, sort_order: idx }));
    }
    if (!updates.length || !adminPin) return;
    const snap = snapshot();
    // vmap(그룹·버전번호) 갱신 + 빈 그룹 제거를 즉시 반영
    setVmap((prev) => {
      const n = { ...prev };
      for (const c of affected) {
        const arr = itemsState[c] ?? [];
        const cnt = arr.length;
        arr.forEach((id, idx) => { if (n[id]) n[id] = { ...n[id], model_name: c, versionNo: cnt - idx }; });
      }
      return n;
    });
    setContainers((prev) => prev.filter((c) => (itemsState[c]?.length ?? 0) > 0));
    try {
      const res = await fetch("/api/reorder-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates, password: adminPin }),
      });
      if (!res.ok) {
        restore(snap);
        const j = await res.json().catch(() => ({}));
        alert(res.status === 403 ? "관리자 인증이 만료됐어요. 관리자 모드를 다시 켜주세요." : (j.error || "정렬 저장 실패 — 되돌렸어요 (sort_order 컬럼 필요할 수 있어요)"));
      }
    } catch { restore(snap); alert("정렬 저장 중 오류 — 되돌렸어요"); }
  }

  // 새 이름의 모델로 분리 — 낙관적
  async function splitToNewModel(v: VersionItem) {
    if (!adminPin) return;
    const name = window.prompt("새 모델 이름을 입력하세요 (이 버전을 그 이름으로 분리)");
    if (!name?.trim()) return;
    const target = name.trim();
    if (containers.includes(target)) { alert("이미 있는 모델 이름이에요. 그건 드래그로 옮기세요."); return; }
    const snap = snapshot();
    const from = findContainer(v.id);
    const newFrom = from ? (items[from] ?? []).filter((x) => x !== v.id) : [];
    setItems((prev) => {
      const next = { ...prev };
      if (from) next[from] = newFrom;
      next[target] = [v.id];
      return next;
    });
    setContainers((prev) => {
      const withNew = [target, ...prev.filter((c) => c !== target)];
      return from && newFrom.length === 0 ? withNew.filter((c) => c !== from) : withNew;
    });
    setVmap((prev) => {
      const n = { ...prev, [v.id]: { ...prev[v.id], model_name: target, versionNo: 1 } };
      const cnt = newFrom.length;
      newFrom.forEach((id, idx) => { if (n[id]) n[id] = { ...n[id], versionNo: cnt - idx }; });
      return n;
    });
    try {
      const res = await fetch("/api/reorder-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [{ id: v.id, model_name: target, sort_order: 0 }], password: adminPin }),
      });
      if (!res.ok) { restore(snap); const j = await res.json().catch(() => ({})); alert(res.status === 403 ? "관리자 인증이 만료됐어요." : (j.error || "분리 실패 — 되돌렸어요")); }
    } catch { restore(snap); alert("분리 중 오류 — 되돌렸어요"); }
  }

  // 이름 수정 — 낙관적(호출부에서 화면 먼저 반영), 실패 시 snap 롤백
  async function apiRename(
    payload:
      | { scope: "model"; ids: string[]; newName: string }
      | { scope: "version"; sessionId: string; newName: string; description?: string | null },
    snap: ReturnType<typeof snapshot>
  ) {
    if (!adminPin) return;
    try {
      const res = await fetch("/api/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, password: adminPin }),
      });
      if (!res.ok) { restore(snap); const j = await res.json().catch(() => ({})); alert(res.status === 403 ? "관리자 인증이 만료됐어요." : (j.error || "이름 수정 실패 — 되돌렸어요")); }
    } catch { restore(snap); alert("이름 수정 중 오류 — 되돌렸어요"); }
  }
  // 모델 이름 인라인 편집 시작/저장
  function startEditModel(name: string) { setEditingModel(name); setEditModelName(name); }
  function saveEditModel(name: string) {
    if (saveGuard.current) return;                       // Enter 직후 blur 중복 저장 차단
    saveGuard.current = true; setTimeout(() => { saveGuard.current = false; }, 0);
    const target = editModelName.trim();
    setEditingModel(null);
    if (!target || target === name) return;
    const ids = items[name] ?? [];
    const snap = snapshot();
    const merge = containers.includes(target);
    setItems((prev) => {
      const next = { ...prev };
      const arr = next[name] ?? [];
      delete next[name];
      next[target] = merge ? [...(next[target] ?? []), ...arr] : arr;
      return next;
    });
    setContainers((prev) => (merge ? prev.filter((c) => c !== name) : prev.map((c) => (c === name ? target : c))));
    setVmap((prev) => {
      const n = { ...prev };
      ids.forEach((id) => { if (n[id]) n[id] = { ...n[id], model_name: target }; });
      return n;
    });
    apiRename({ scope: "model", ids, newName: target }, snap);
  }

  // 버전 제목+설명 인라인 편집 시작/저장 (제목 수정 시 설명도 함께)
  function startEditVer(v: VersionItem) { setEditingVer(v.id); setEditTitle(v.title); setEditDesc(v.description ?? ""); }
  function saveEditVer(v: VersionItem) {
    const target = editTitle.trim();
    const desc = editDesc.trim();
    setEditingVer(null);
    if (!target) return; // 제목은 비울 수 없음
    if (target === v.title && desc === (v.description ?? "")) return; // 변경 없음
    const snap = snapshot();
    setVmap((prev) => ({ ...prev, [v.id]: { ...prev[v.id], title: target, description: desc || null } }));
    apiRename({ scope: "version", sessionId: v.id, newName: target, description: desc || null }, snap);
  }

  // 삭제 — 낙관적(즉시 목록에서 제거) + 백그라운드 처리, 실패 시 롤백
  function doDelete(session: Session) {
    if (!adminPin) return;
    const id = session.id;
    const snap = snapshot();
    const group = findContainer(id);
    const remaining = group ? (items[group] ?? []).filter((x) => x !== id) : [];
    const size = vmap[id]?.size ?? 0;
    setConfirmTarget(null);
    setItems((prev) => (group ? { ...prev, [group]: remaining } : prev));
    if (group && remaining.length === 0) setContainers((prev) => prev.filter((c) => c !== group));
    setVmap((prev) => {
      const n = { ...prev };
      delete n[id];
      const cnt = remaining.length;
      remaining.forEach((rid, idx) => { if (n[rid]) n[rid] = { ...n[rid], versionNo: cnt - idx }; });
      return n;
    });
    setTotalUsage((u) => Math.max(0, u - size));
    fetch("/api/delete-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: id, password: adminPin }),
    })
      .then(async (res) => {
        if (!res.ok) {
          restore(snap);
          const j = await res.json().catch(() => ({}));
          alert(res.status === 403 ? "관리자 인증이 만료됐어요. 관리자 모드를 다시 켜주세요." : (j.error || "삭제 실패 — 되돌렸어요"));
        }
      })
      .catch(() => { restore(snap); alert("삭제 중 오류 — 되돌렸어요"); });
  }

  const usagePct = Math.min(100, (totalUsage / STORAGE_LIMIT_BYTES) * 100);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--purple)]" />
      </div>
    );
  }

  const activeV = activeId ? vmap[activeId] : null;

  return (
    <div className="flex flex-col h-full">
      {/* 용량 */}
      {containers.length > 0 && (
        <div className="px-4 py-3 border-b border-white/5 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-[var(--muted)]">
              <HardDrive className="w-3.5 h-3.5" /> 저장 용량
            </span>
            <span className="text-[var(--fg)] font-mono">{formatBytes(totalUsage)} / 1 GB</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usagePct > 80 ? "bg-red-500" : usagePct > 50 ? "bg-amber-500" : "bg-gradient-to-r from-[var(--purple)] to-[var(--pink)]"
              }`}
              style={{ width: `${Math.max(2, usagePct)}%` }}
            />
          </div>
        </div>
      )}

      {containers.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--muted)] p-8">
          <Boxes className="w-12 h-12 opacity-40" />
          <p className="text-sm text-center">
            아직 업로드한 모델이 없어요
            <br />
            <span className="text-xs opacity-60">리뷰 공유 탭에서 모델을 올려보세요</span>
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-5">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => { setActiveId(null); setDragSource(null); }}
          >
            {containers.map((name) => (
              <DroppableGroup
                key={name}
                name={name}
                count={items[name]?.length ?? 0}
                dragging={!!activeId}
                admin={admin}
                problem={(items[name] ?? []).some((id) => (vmap[id]?.size ?? 0) === 0)}
                editing={editingModel === name}
                editValue={editModelName}
                onEditChange={setEditModelName}
                onStartEdit={() => startEditModel(name)}
                onSaveEdit={() => saveEditModel(name)}
                onCancelEdit={() => setEditingModel(null)}
              >
                <SortableContext items={items[name] ?? []} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {(items[name] ?? []).map((id) => {
                      const v = vmap[id];
                      if (!v) return null;
                      return (
                        <SortableVersionRow
                          key={id}
                          v={v}
                          admin={admin}
                          open={expandedId === id}
                          files={fileCache[id]}
                          onToggleFiles={() => toggleFiles(id)}
                          onDelete={() => setConfirmTarget(v)}
                          onSplit={() => splitToNewModel(v)}
                          editing={editingVer === id}
                          editTitle={editTitle}
                          editDesc={editDesc}
                          onEditTitle={setEditTitle}
                          onEditDesc={setEditDesc}
                          onStartEdit={() => startEditVer(v)}
                          onSaveEdit={() => saveEditVer(v)}
                          onCancelEdit={() => setEditingVer(null)}
                          descExpanded={expandedDesc === id}
                          onToggleDesc={() => setExpandedDesc((p) => (p === id ? null : id))}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DroppableGroup>
            ))}

            {mounted && createPortal(
              <DragOverlay>
                {activeV ? (
                  <div className="glass-strong rounded-xl p-3 flex items-center gap-3 shadow-2xl ring-2 ring-[var(--purple)]/50">
                    <GripVertical className="w-4 h-4 text-[var(--purple)]" />
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--purple-deep)]/30 to-[var(--pink)]/20 border border-[var(--purple)]/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-[var(--purple)]">v{activeV.versionNo}</span>
                    </div>
                    <span className="text-sm text-[var(--fg)] truncate max-w-[160px]">{activeV.title}</span>
                  </div>
                ) : null}
              </DragOverlay>,
              document.body
            )}
          </DndContext>

          <div className="flex items-center gap-2 text-[10px] text-[var(--muted)] px-1 pt-1">
            {admin ? (
              <><Layers className="w-3 h-3" /> 왼쪽 손잡이(⋮⋮)를 끌어 순서를 바꾸거나 다른 모델로 옮기세요</>
            ) : (
              <><Lock className="w-3 h-3" /> 삭제·이동·이름수정은 상단 &lsquo;관리자&rsquo; 버튼으로 관리자 모드를 켜면 가능해요</>
            )}
          </div>
        </div>
      )}

      {/* 삭제 확인 (관리자 모드) */}
      {confirmTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConfirmTarget(null)}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-xs space-y-4 fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center"><Trash2 className="w-4 h-4 text-red-400" /></div>
              <span className="text-sm font-semibold">삭제할까요?</span>
            </div>
            <p className="text-xs text-[var(--muted)]">
              <span className="text-[var(--fg)]">{confirmTarget.title}</span> 을(를) 삭제합니다. 되돌릴 수 없어요.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmTarget(null)} className="flex-1 glass glass-hover rounded-xl py-2.5 text-sm text-[var(--muted)]">아니요</button>
              <button onClick={() => doDelete(confirmTarget)} className="flex-1 bg-red-600 hover:bg-red-500 rounded-xl py-2.5 text-sm text-white transition-all">
                네, 삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 드롭 가능한 그룹(모델) ──────────────────────────────────────────────
function DroppableGroup({
  name, count, dragging, admin, problem, editing, editValue, onEditChange, onStartEdit, onSaveEdit, onCancelEdit, children,
}: {
  name: string; count: number; dragging: boolean; admin: boolean; problem: boolean;
  editing: boolean; editValue: string;
  onEditChange: (v: string) => void; onStartEdit: () => void; onSaveEdit: () => void; onCancelEdit: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: name });
  return (
    <div
      ref={setNodeRef}
      className={`space-y-2 fade-up rounded-xl p-1 -m-1 transition-all ${isOver ? "ring-2 ring-[var(--purple)] bg-[var(--purple)]/5" : ""}`}
    >
      <div className="flex items-center gap-2 px-1">
        <Boxes className="w-4 h-4 text-[var(--purple)] shrink-0" />
        {editing ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSaveEdit(); else if (e.key === "Escape") onCancelEdit(); }}
            onBlur={onSaveEdit}
            className="flex-1 min-w-0 text-sm font-bold bg-transparent border-b border-[var(--purple)]/60 outline-none text-[var(--fg)] px-0.5"
          />
        ) : (
          <span
            onClick={admin ? onStartEdit : undefined}
            className={`text-sm font-bold text-[var(--fg)] truncate ${admin ? "cursor-text hover:text-[var(--purple)]" : ""}`}
            title={admin ? "클릭해서 모델 이름 수정" : name}
          >{name}</span>
        )}
        {admin && !editing && (
          <button onClick={onStartEdit} title="모델 이름 수정" className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--purple)] hover:bg-white/5 shrink-0">
            <Pencil className="w-3 h-3" />
          </button>
        )}
        {problem && (
          <span className="flex items-center gap-0.5 text-[9px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full shrink-0" title="이 모델에 파일이 비어있는(업로드 실패) 버전이 있어요">
            <AlertTriangle className="w-3 h-3" /> 문제
          </span>
        )}
        <span className="text-[10px] text-[var(--muted)] bg-white/5 px-2 py-0.5 rounded-full shrink-0">{count}개 버전</span>
        {dragging && <span className="text-[9px] text-[var(--purple)] shrink-0">여기로 드롭</span>}
      </div>
      {children}
    </div>
  );
}

// ── 정렬 가능한 버전 행 ──────────────────────────────────────────────────
function SortableVersionRow({
  v, admin, open, files, onToggleFiles, onDelete, onSplit,
  editing, editTitle, editDesc, onEditTitle, onEditDesc, onStartEdit, onSaveEdit, onCancelEdit,
  descExpanded, onToggleDesc,
}: {
  v: VersionItem;
  admin: boolean;
  open: boolean;
  files: { path: string; size: number }[] | "loading" | undefined;
  onToggleFiles: () => void;
  onDelete: () => void;
  onSplit: () => void;
  editing: boolean;
  editTitle: string;
  editDesc: string;
  onEditTitle: (v: string) => void;
  onEditDesc: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  descExpanded: boolean;
  onToggleDesc: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: v.id, disabled: !admin });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const hasDesc = !!(v.description && v.description.trim());
  return (
    <div ref={setNodeRef} style={style} className="glass rounded-xl overflow-hidden">
      <div className="glass-hover p-3 flex items-start gap-2">
        {admin && !editing && (
          <button
            {...attributes}
            {...listeners}
            aria-label="드래그해서 이동/정렬"
            title="끌어서 순서 변경 · 다른 모델로 이동"
            className="touch-none cursor-grab active:cursor-grabbing text-[var(--muted)]/60 hover:text-[var(--purple)] p-1 -ml-1 shrink-0 mt-0.5"
            style={{ touchAction: "none" }}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}

        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--purple-deep)]/30 to-[var(--pink)]/20 border border-[var(--purple)]/20 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-[var(--purple)]">v{v.versionNo}</span>
        </div>

        {editing ? (
          // 인라인 편집 — 제목 + 설명 동시 수정
          <div className="flex-1 min-w-0 space-y-1.5">
            <input
              autoFocus
              value={editTitle}
              onChange={(e) => onEditTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSaveEdit(); else if (e.key === "Escape") onCancelEdit(); }}
              placeholder="버전 제목"
              className="w-full text-sm text-[var(--fg)] bg-transparent border-b border-[var(--purple)]/60 outline-none px-0.5 py-0.5"
            />
            <textarea
              value={editDesc}
              onChange={(e) => onEditDesc(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") onCancelEdit(); }}
              placeholder="설명 (선택)"
              rows={2}
              className="w-full text-[11px] text-[var(--muted)] bg-black/20 rounded-lg border border-white/10 outline-none focus:border-[var(--purple)]/50 px-2 py-1.5 resize-none"
            />
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--fg)] truncate flex items-center gap-1.5">
              {v.size === 0 && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" aria-label="업로드 실패 가능성" />}
              <span className="truncate">{v.title}</span>
            </p>
            {hasDesc && (
              <p
                onClick={onToggleDesc}
                className={`text-[11px] text-[var(--muted)] mt-0.5 cursor-pointer hover:text-[var(--fg)]/80 ${descExpanded ? "whitespace-pre-wrap break-words" : "truncate"}`}
                title={descExpanded ? "접기" : "펼쳐 보기"}
              >
                {v.description}
              </p>
            )}
            <div className="flex items-center gap-2 text-[10px] text-[var(--muted)] mt-0.5">
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(v.created_at)}</span>
              <span className="opacity-40">·</span>
              <span className={v.size === 0 ? "text-amber-400" : ""}>{v.size === 0 ? "파일 없음 (업로드 실패)" : formatBytes(v.size)}</span>
            </div>
          </div>
        )}

        {editing ? (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onSaveEdit} className="glass glass-hover p-2 rounded-lg text-green-400 hover:text-green-300" title="저장">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={onCancelEdit} className="glass glass-hover p-2 rounded-lg text-[var(--muted)] hover:text-red-400" title="취소">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
            {admin && (
              <button onClick={onToggleFiles} className={`glass glass-hover p-2 rounded-lg shrink-0 ${open ? "text-[var(--purple)]" : "text-[var(--muted)] hover:text-[var(--purple)]"}`} title="파일 목록 · 다운로드 (관리자)">
                <FileText className="w-3.5 h-3.5" />
              </button>
            )}
            <Link href={`/review/${v.id}`} className="glass glass-hover p-2 rounded-lg text-[var(--muted)] hover:text-[var(--purple)] shrink-0" title="열기">
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
            {admin && (
              <>
                <button onClick={onStartEdit} className="glass glass-hover p-2 rounded-lg text-[var(--muted)] hover:text-[var(--purple)] shrink-0" title="제목·설명 수정">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={onSplit} className="glass glass-hover p-2 rounded-lg text-[var(--muted)] hover:text-[var(--purple)] shrink-0" title="새 모델 이름으로 분리">
                  <Split className="w-3.5 h-3.5" />
                </button>
                <button onClick={onDelete} className="glass glass-hover p-2 rounded-lg text-[var(--muted)] hover:text-red-400 shrink-0" title="삭제">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </>
        )}
      </div>

      {admin && open && (
        <div className="border-t border-white/5 p-2.5 space-y-1 bg-black/10">
          {files === "loading" || !files ? (
            <div className="flex items-center gap-2 text-[10px] text-[var(--muted)] px-1 py-1">
              <Loader2 className="w-3 h-3 animate-spin" /> 파일 불러오는 중...
            </div>
          ) : files.length === 0 ? (
            <p className="text-[10px] text-red-400/80 px-1 py-1">업로드된 파일이 없어요 (업로드 실패 가능성)</p>
          ) : (
            <>
              <p className="text-[9px] text-[var(--muted)] px-1">{files.length}개 파일</p>
              {files.map((f) => (
                <div key={f.path} className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-white/5">
                  <FileText className="w-3 h-3 text-[var(--muted)]/60 flex-shrink-0" />
                  <span className="text-[10px] text-[var(--fg)]/80 truncate flex-1" title={f.path}>{f.path.replace(`${v.id}/`, "")}</span>
                  <span className="text-[9px] text-[var(--muted)]/60 font-mono flex-shrink-0">{formatBytes(f.size)}</span>
                  <a href={publicUrl(f.path)} target="_blank" rel="noreferrer" download className="text-[var(--muted)] hover:text-[var(--purple)] flex-shrink-0" title="다운로드">
                    <Download className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
