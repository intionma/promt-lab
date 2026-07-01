"use client";
// 한 모델(창)의 메쉬 상태·로직을 캡슐화 — 단일/분할 비교 모두에서 창별 독립 사용.
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, type MeshGroup, type MeshConfig, type Session } from "@/lib/supabase";
import { toast, promptDialog } from "@/lib/ui";
import type { ModelMeta, ViewerHandle } from "./ModelViewer";
import type { MeshDiff } from "./MeshPanel";

type Opts = {
  sessionId: string | null;
  meta: ModelMeta | null;
  viewerRef: { current: ViewerHandle | null };
  isPC: boolean;
  sharePassword: string | null; // 관리자 모드면 PIN, 아니면 null(→ 프롬프트)
  onPicked?: () => void;         // 메쉬를 클릭해 집었을 때(패널/활성창 전환용)
};

export function usePaneMesh({ sessionId, meta, viewerRef, isPC, sharePassword, onPicked }: Opts) {
  const [groups, setGroups] = useState<MeshGroup[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [selectedMesh, setSelectedMesh] = useState<number | null>(null);
  const [meshSelectMode, setMeshSelectMode] = useState(false);
  const [sharingGroupId, setSharingGroupId] = useState<string | null>(null);
  const [siblingMeshes, setSiblingMeshes] = useState<{ id: string; meshIds: string[] }[]>([]);
  const [diff, setDiff] = useState<MeshDiff | null>(null);

  const pendingCfg = useRef<MeshConfig | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const meshIdsSaved = useRef(false);
  const pcApplied = useRef(false);

  const idxOf = useCallback((meshId: string) => meta?.meshes.find((m) => m.id === meshId)?.index ?? -1, [meta]);

  const applyCfg = useCallback((cfg: MeshConfig, m: ModelMeta) => {
    setGroups(cfg.groups ?? []);
    const hid = new Set(cfg.hidden ?? []);
    setHiddenIds(hid);
    hid.forEach((mid) => {
      const idx = m.meshes.find((x) => x.id === mid)?.index ?? -1;
      if (idx >= 0) viewerRef.current?.setMeshHidden(idx, true);
    });
  }, [viewerRef]);

  // 세션 변경 → mesh_config + 형제 mesh_ids 로드 (창 초기화)
  useEffect(() => {
    setGroups([]); setHiddenIds(new Set()); setLockedIds(new Set()); setEditingGroupId(null); setSelectedMesh(null);
    setSiblingMeshes([]); setDiff(null); pendingCfg.current = null; meshIdsSaved.current = false; pcApplied.current = false;
    viewerRef.current?.clearLockedMeshes();
    if (!sessionId) { sessionRef.current = null; return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("sessions").select("*").eq("id", sessionId).single();
      if (cancelled || !data) return;
      sessionRef.current = data as Session;
      const own = (data.mesh_config as MeshConfig | null) ?? null;
      let g = own?.groups ?? [];
      const hidden = own?.hidden ?? [];
      if (g.length === 0 && data.model_name) {
        const { data: sibs } = await supabase.from("sessions").select("mesh_config").eq("model_name", data.model_name).neq("id", sessionId);
        for (const s of sibs ?? []) {
          const sg = ((s as { mesh_config: MeshConfig | null }).mesh_config)?.groups;
          if (sg && sg.length) { g = sg; break; }
        }
      }
      pendingCfg.current = { groups: g, hidden };
      if (data.model_name) {
        const { data: sm, error } = await supabase.from("sessions").select("id, mesh_ids").eq("model_name", data.model_name).neq("id", sessionId);
        if (!error && sm) {
          setSiblingMeshes(sm.map((s) => ({ id: s.id as string, meshIds: ((s as { mesh_ids: string[] | null }).mesh_ids) ?? [] })).filter((s) => s.meshIds.length > 0));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // 메타 도착 → 저장된 설정 적용 + PC면 선택모드 ON + mesh_ids 저장 + 차이 계산
  useEffect(() => {
    if (!meta) return;
    if (pendingCfg.current) { applyCfg(pendingCfg.current, meta); pendingCfg.current = null; }
    if (isPC && !pcApplied.current) { pcApplied.current = true; setMeshSelectMode(true); viewerRef.current?.setMeshSelectMode(true); }

    const hereArr = meta.meshes.map((m) => m.id);
    const here = new Set(hereArr);
    if (!meshIdsSaved.current && sessionId && sessionRef.current) {
      const prev = sessionRef.current.mesh_ids ?? null;
      const changed = !prev || prev.length !== hereArr.length || prev.some((x, i) => x !== hereArr[i]);
      if (changed) {
        meshIdsSaved.current = true;
        fetch("/api/save-mesh-ids", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, meshIds: hereArr }) }).catch(() => {});
      }
    }
    if (siblingMeshes.length === 0) { setDiff(null); return; }
    const union = new Set<string>();
    siblingMeshes.forEach((s) => s.meshIds.forEach((x) => union.add(x)));
    const onlyHere = hereArr.filter((x) => !union.has(x));
    const missingHere = [...union].filter((x) => !here.has(x));
    setDiff(onlyHere.length || missingHere.length ? { onlyHere, missingHere, versions: siblingMeshes.length } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, siblingMeshes, isPC]);

  function setHiddenById(meshId: string, hide: boolean) {
    const idx = idxOf(meshId);
    if (idx >= 0) viewerRef.current?.setMeshHidden(idx, hide);
    setHiddenIds((prev) => { const n = new Set(prev); if (hide) n.add(meshId); else n.delete(meshId); return n; });
  }
  function toggleMesh(meshId: string, hide: boolean) { setHiddenById(meshId, hide); }
  // 메쉬 잠금 토글 — 보이는 채로 클릭 선택에서만 제외(겹친 뒤 메쉬 선택용). 저장 안 함(창 세션 한정).
  function toggleLock(meshId: string, lock: boolean) {
    const idx = idxOf(meshId);
    if (idx >= 0) viewerRef.current?.setMeshLocked(idx, lock);
    setLockedIds((prev) => { const n = new Set(prev); if (lock) n.add(meshId); else n.delete(meshId); return n; });
  }
  function showAllMeshes() { viewerRef.current?.showAllMeshes(); setHiddenIds(new Set()); }
  function toggleGroup(g: MeshGroup) {
    const allHidden = g.ids.length > 0 && g.ids.every((id) => hiddenIds.has(id));
    const hide = !allHidden;
    g.ids.forEach((id) => { const idx = idxOf(id); if (idx >= 0) viewerRef.current?.setMeshHidden(idx, hide); });
    setHiddenIds((prev) => { const n = new Set(prev); g.ids.forEach((id) => { if (hide) n.add(id); else n.delete(id); }); return n; });
  }
  function createGroup(name: string) {
    const nm = name.trim() || "새 그룹";
    if (groups.some((g) => g.name === nm)) { toast(`'${nm}' 폴더가 이미 있어요. (같은 모델에선 폴더 이름이 겹치면 안 돼요)`, "error"); return; }
    const g: MeshGroup = { id: `g_${Date.now()}`, name: nm, ids: [] };
    setGroups((p) => [...p, g]);
    setEditingGroupId(g.id);
  }
  function deleteGroup(gid: string) {
    setGroups((p) => p.filter((g) => g.id !== gid));
    if (editingGroupId === gid) setEditingGroupId(null);
  }
  function toggleMembership(gid: string, meshId: string) {
    const g = groups.find((x) => x.id === gid);
    const adding = g ? !g.ids.includes(meshId) : false;
    if (adding && g && g.ids.length > 0 && g.ids.every((id) => hiddenIds.has(id))) setHiddenById(meshId, true);
    setGroups((p) => p.map((x) => (x.id === gid ? { ...x, ids: x.ids.includes(meshId) ? x.ids.filter((y) => y !== meshId) : [...x.ids, meshId] } : x)));
  }
  function toggleMeshSelectMode(on: boolean) { setMeshSelectMode(on); viewerRef.current?.setMeshSelectMode(on); }
  function handleMeshPicked(index: number) {
    const m = meta?.meshes.find((x) => x.index === index);
    viewerRef.current?.flashMesh(index);
    onPicked?.();
    if (m && editingGroupId) toggleMembership(editingGroupId, m.id);
    else setSelectedMesh(index);
  }
  async function shareGroup(g: MeshGroup) {
    if (!sessionId) return;
    const pw = sharePassword ?? (await promptDialog(`'${g.name}' 폴더를 같은 모델의 모든 버전에 공유`, "", "비밀번호"));
    if (!pw) return;
    setSharingGroupId(g.id);
    try {
      const res = await fetch("/api/share-mesh-group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, group: { name: g.name, ids: g.ids }, password: pw }) });
      if (res.status === 403) { toast("비밀번호가 틀렸어요", "error"); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); toast("공유 실패: " + (j.error || ""), "error"); return; }
      setGroups((p) => p.map((x) => (x.id === g.id ? { ...x, shared: true, sharedIds: [...x.ids] } : x)));
      toast(`'${g.name}' 폴더를 모든 버전에 공유했어요`, "success");
    } finally { setSharingGroupId(null); }
  }

  return {
    groups, hiddenIds, lockedIds, editingGroupId, selectedMesh, meshSelectMode, sharingGroupId, diff,
    setEditingGroupId, toggleMesh, toggleLock, showAllMeshes, toggleGroup, createGroup, deleteGroup,
    toggleMembership, toggleMeshSelectMode, handleMeshPicked, shareGroup,
  };
}
