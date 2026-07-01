"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ExternalLink, Trash2, Calendar, Layers, Boxes, Link as LinkIcon, Loader2, HardDrive, Lock, X, FileText, Download, GripVertical, Split, AlertTriangle } from "lucide-react";
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

export default function MyModels() {
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [totalUsage, setTotalUsage] = useState(0);

  // 드래그앤드롭 정렬 상태
  const [containers, setContainers] = useState<string[]>([]);            // 모델(그룹) 이름 — 표시 순서
  const [items, setItems] = useState<Record<string, string[]>>({});      // 그룹 → 버전 id 배열(표시 순서)
  const [vmap, setVmap] = useState<Record<string, VersionItem>>({});     // id → 버전 데이터
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false); // 드래그 오버레이 포탈용 (document.body)

  const [pwTarget, setPwTarget] = useState<Session | null>(null);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [verifiedPw, setVerifiedPw] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Session | null>(null);

  // 버전별 파일 목록 펼치기
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fileCache, setFileCache] = useState<Record<string, { path: string; size: number }[] | "loading">>({});

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

    // 그룹핑
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
    // 그룹 순서: 그룹 내 최신 활동순
    groupList.sort((a, b) => {
      const al = Math.max(...a[1].map((v) => new Date(v.created_at).getTime()));
      const bl = Math.max(...b[1].map((v) => new Date(v.created_at).getTime()));
      return bl - al;
    });
    for (const [name, sessions] of groupList) {
      const ordered = [...sessions].sort(orderCmp); // 위(0) → 아래
      nextContainers.push(name);
      nextItems[name] = ordered.map((s) => s.id);
      const n = ordered.length;
      ordered.forEach((s, idx) => {
        // 위치 따라 재번호: 맨 위가 가장 높은 번호 (현재 UI 와 동일하게 v{n} 이 위)
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
    // 같은 그룹 내 재정렬
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

  async function persistOrder(itemsState: Record<string, string[]>, affected: Set<string>) {
    const updates: { id: string; model_name: string; sort_order: number }[] = [];
    for (const c of affected) {
      (itemsState[c] ?? []).forEach((id, idx) => updates.push({ id, model_name: c, sort_order: idx }));
    }
    if (!updates.length) return;

    const password = verifiedPw || window.prompt("순서/이동을 저장하려면 비밀번호를 입력하세요");
    if (!password) { load(); return; } // 취소 → 서버 기준으로 되돌림
    try {
      const res = await fetch("/api/reorder-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates, password }),
      });
      if (res.status === 403) { setVerifiedPw(null); alert("비밀번호가 틀렸어요"); load(); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || "정렬 저장 실패 (sort_order 컬럼이 필요할 수 있어요)"); load(); return; }
      setVerifiedPw(password);
      load();
    } catch {
      alert("정렬 저장 중 오류가 발생했어요");
      load();
    }
  }

  // 완전히 새 이름의 모델로 분리 (드래그로는 기존 그룹끼리만 가능하므로 별도 버튼)
  async function splitToNewModel(v: VersionItem) {
    const name = window.prompt("새 모델 이름을 입력하세요 (이 버전을 그 이름으로 분리)");
    if (!name?.trim()) return;
    const target = name.trim();
    if (containers.includes(target)) { alert("이미 있는 모델 이름이에요. 그건 드래그로 옮기세요."); return; }
    const password = verifiedPw || window.prompt("분리하려면 비밀번호를 입력하세요");
    if (!password) return;
    try {
      const res = await fetch("/api/reorder-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [{ id: v.id, model_name: target, sort_order: 0 }], password }),
      });
      if (res.status === 403) { setVerifiedPw(null); alert("비밀번호가 틀렸어요"); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || "분리 실패"); return; }
      setVerifiedPw(password);
      load();
    } catch { alert("분리 중 오류가 발생했어요"); }
  }

  function startDelete(session: Session) {
    if (verifiedPw) setConfirmTarget(session);
    else { setPwTarget(session); setPwInput(""); setPwError(false); }
  }

  async function doDelete(session: Session, password: string) {
    if (deleting) return;
    setDeleting(session.id);
    try {
      const res = await fetch("/api/delete-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, password }),
      });
      if (res.status === 403) {
        setVerifiedPw(null);
        if (pwTarget) setPwError(true);
        else { setConfirmTarget(null); alert("비밀번호가 만료됐어요. 다시 입력해주세요"); }
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "삭제 실패");
        return;
      }
      setVerifiedPw(password);
      setPwTarget(null);
      setConfirmTarget(null);
      setPwInput("");
      setPwError(false);
      await load();
    } finally {
      setDeleting(null);
    }
  }

  async function copyLink(id: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/review/${id}`);
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
                problem={(items[name] ?? []).some((id) => (vmap[id]?.size ?? 0) === 0)}
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
                          open={expandedId === id}
                          files={fileCache[id]}
                          deleting={deleting === id}
                          onToggleFiles={() => toggleFiles(id)}
                          onCopyLink={() => copyLink(id)}
                          onDelete={() => startDelete(v)}
                          onSplit={() => splitToNewModel(v)}
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
            <Layers className="w-3 h-3" />
            왼쪽 손잡이(⋮⋮)를 끌어 순서를 바꾸거나 다른 모델로 옮기세요
          </div>
        </div>
      )}

      {/* 비밀번호 모달 */}
      {pwTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setPwTarget(null)}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-xs space-y-4 fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-red-400" />
                </div>
                <span className="text-sm font-semibold">삭제 확인</span>
              </div>
              <button onClick={() => setPwTarget(null)} className="text-[var(--muted)] hover:text-[var(--fg)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--muted)]">
              <span className="text-[var(--fg)]">{pwTarget.title}</span> 을(를) 삭제하려면 비밀번호를 입력하세요. 되돌릴 수 없어요.
            </p>
            <input
              type="password"
              inputMode="numeric"
              value={pwInput}
              onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter" && pwTarget) doDelete(pwTarget, pwInput); }}
              placeholder="비밀번호"
              autoFocus
              className={`w-full glass rounded-xl px-4 py-3 text-sm text-center tracking-widest outline-none ${pwError ? "border border-red-500/50" : ""}`}
            />
            {pwError && <p className="text-xs text-red-400">비밀번호가 틀렸어요</p>}
            <div className="flex gap-2">
              <button onClick={() => setPwTarget(null)} className="flex-1 glass glass-hover rounded-xl py-2.5 text-sm text-[var(--muted)]">
                취소
              </button>
              <button onClick={() => pwTarget && doDelete(pwTarget, pwInput)} disabled={deleting === pwTarget.id} className="flex-1 bg-red-600 hover:bg-red-500 rounded-xl py-2.5 text-sm text-white transition-all disabled:opacity-60">
                {deleting === pwTarget.id ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 네/아니요 삭제 확인 (비번 캐시 상태) */}
      {confirmTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConfirmTarget(null)}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-xs space-y-4 fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center"><Trash2 className="w-4 h-4 text-red-400" /></div>
              <span className="text-sm font-semibold">삭제할까요?</span>
            </div>
            <p className="text-xs text-[var(--muted)]">
              <span className="text-[var(--fg)]">{confirmTarget.title}</span> 을(를) 삭제합니다. (비밀번호 확인됨 · 되돌릴 수 없어요)
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmTarget(null)} className="flex-1 glass glass-hover rounded-xl py-2.5 text-sm text-[var(--muted)]">아니요</button>
              <button onClick={() => confirmTarget && verifiedPw && doDelete(confirmTarget, verifiedPw)} disabled={deleting === confirmTarget.id} className="flex-1 bg-red-600 hover:bg-red-500 rounded-xl py-2.5 text-sm text-white transition-all">
                {deleting === confirmTarget.id ? "삭제 중..." : "네, 삭제"}
              </button>
            </div>
            <button onClick={() => { setVerifiedPw(null); setConfirmTarget(null); }} className="w-full text-[10px] text-[var(--muted)]/60 hover:text-[var(--muted)]">비밀번호 저장 해제</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 드롭 가능한 그룹(모델) ──────────────────────────────────────────────
function DroppableGroup({ name, count, dragging, problem, children }: { name: string; count: number; dragging: boolean; problem: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: name });
  return (
    <div
      ref={setNodeRef}
      className={`space-y-2 fade-up rounded-xl p-1 -m-1 transition-all ${isOver ? "ring-2 ring-[var(--purple)] bg-[var(--purple)]/5" : ""}`}
    >
      <div className="flex items-center gap-2 px-1">
        <Boxes className="w-4 h-4 text-[var(--purple)]" />
        <span className="text-sm font-bold text-[var(--fg)]">{name}</span>
        {problem && (
          <span className="flex items-center gap-0.5 text-[9px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full" title="이 모델에 파일이 비어있는(업로드 실패) 버전이 있어요">
            <AlertTriangle className="w-3 h-3" /> 문제
          </span>
        )}
        <span className="text-[10px] text-[var(--muted)] bg-white/5 px-2 py-0.5 rounded-full">{count}개 버전</span>
        {dragging && <span className="text-[9px] text-[var(--purple)]">여기로 드롭</span>}
      </div>
      {children}
    </div>
  );
}

// ── 정렬 가능한 버전 행 ──────────────────────────────────────────────────
function SortableVersionRow({
  v, open, files, deleting, onToggleFiles, onCopyLink, onDelete, onSplit,
}: {
  v: VersionItem;
  open: boolean;
  files: { path: string; size: number }[] | "loading" | undefined;
  deleting: boolean;
  onToggleFiles: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
  onSplit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: v.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="glass rounded-xl overflow-hidden">
      <div className="glass-hover p-3 flex items-center gap-2">
        {/* 드래그 손잡이 */}
        <button
          {...attributes}
          {...listeners}
          aria-label="드래그해서 이동/정렬"
          title="끌어서 순서 변경 · 다른 모델로 이동"
          className="touch-none cursor-grab active:cursor-grabbing text-[var(--muted)]/60 hover:text-[var(--purple)] p-1 -ml-1 shrink-0"
          style={{ touchAction: "none" }}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--purple-deep)]/30 to-[var(--pink)]/20 border border-[var(--purple)]/20 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-[var(--purple)]">v{v.versionNo}</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--fg)] truncate flex items-center gap-1.5">
            {v.size === 0 && (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" aria-label="업로드 실패 가능성" />
            )}
            <span className="truncate">{v.title}</span>
          </p>
          <div className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(v.created_at)}</span>
            <span className="opacity-40">·</span>
            <span className={v.size === 0 ? "text-amber-400" : ""}>{v.size === 0 ? "파일 없음 (업로드 실패)" : formatBytes(v.size)}</span>
          </div>
        </div>

        <button onClick={onToggleFiles} className={`glass glass-hover p-2 rounded-lg ${open ? "text-[var(--purple)]" : "text-[var(--muted)] hover:text-[var(--purple)]"}`} title="파일 목록">
          <FileText className="w-3.5 h-3.5" />
        </button>
        <button onClick={onCopyLink} className="glass glass-hover p-2 rounded-lg text-[var(--muted)] hover:text-[var(--purple)]" title="링크 복사">
          <LinkIcon className="w-3.5 h-3.5" />
        </button>
        <Link href={`/review/${v.id}`} className="glass glass-hover p-2 rounded-lg text-[var(--muted)] hover:text-[var(--purple)]" title="열기">
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
        <button onClick={onSplit} className="glass glass-hover p-2 rounded-lg text-[var(--muted)] hover:text-[var(--purple)]" title="새 모델 이름으로 분리">
          <Split className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} disabled={deleting} className="glass glass-hover p-2 rounded-lg text-[var(--muted)] hover:text-red-400" title="삭제">
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {open && (
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
