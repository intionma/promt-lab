"use client";

import { useEffect, useState, useRef, use } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, MessageSquare, Sliders, Clapperboard, Layers } from "lucide-react";
import Link from "next/link";
import { supabase, type Session, type MeshGroup, type MeshConfig } from "@/lib/supabase";
import FeedbackPanel from "@/app/components/FeedbackPanel";
import ParamPanel from "@/app/components/ParamPanel";
import ProductionPanel from "@/app/components/ProductionPanel";
import MeshPanel from "@/app/components/MeshPanel";
import type { Param, ViewerHandle, ModelMeta, ViewerState } from "@/app/components/ModelViewer";

const ModelViewer = dynamic(() => import("@/app/components/ModelViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
      뷰어 로딩 중...
    </div>
  ),
});

type PanelTab = "comments" | "params" | "production" | "mesh";

// URL ?s= 파라미터에서 공유 상태 디코드
function parseSharedState(): ViewerState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = new URLSearchParams(window.location.search).get("s");
    if (!raw) return null;
    return JSON.parse(atob(decodeURIComponent(raw))) as ViewerState;
  } catch {
    return null;
  }
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [currentParam, setCurrentParam] = useState<{ id: string; value: number } | null>(null);
  const [notFound, setNotFound] = useState(false);

  // 파라미터 제어 상태 (ModelViewer 에서 끌어올림)
  const viewerControl = useRef<ViewerHandle | null>(null);
  const [paramList, setParamList]   = useState<Param[]>([]);
  const [overrideIds, setOverrideIds] = useState<Set<string>>(new Set());
  const [paramSweep, setParamSweep] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>("comments");

  function toggleSweep(on: boolean) {
    setParamSweep(on);
    viewerControl.current?.setParamSweep(on);
    if (!on) { setOverrideIds(new Set()); setParamList(defaultParams.current.map((p) => ({ ...p }))); }
  }

  // 연출(모션/표정/배경/아이들) 상태
  const [meta, setMeta] = useState<ModelMeta | null>(null);
  const [autoIdle, setAutoIdle] = useState(true);
  const [bgKey, setBgKey] = useState("transparent");
  // 실루엣 모드(회사 등에서 캐릭터 아트 대신 단색 형체만)
  const [silhouette, setSilhouette] = useState(false);
  const [silhouetteColor, setSilhouetteColor] = useState(0x6b7280);
  // 메쉬 그룹/숨김 (id 기준, 모두에게 공유 저장)
  const [meshGroups, setMeshGroups] = useState<MeshGroup[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  // PC(마우스 환경)면 '모델 클릭으로 선택' 기본 ON
  // (useRef 로 마운트 시 1회 평가하면 SSR 값 false 에 고정되므로 useState + effect 로 감지)
  const [isPC, setIsPC] = useState(false);
  const [meshSelectMode, setMeshSelectMode] = useState(false);
  const [selectedMesh, setSelectedMesh] = useState<number | null>(null);
  const [meshSaving, setMeshSaving] = useState(false);
  const pendingMeshConfig = useRef<MeshConfig | null>(null);

  function idxOf(meshId: string): number {
    return meta?.meshes.find((m) => m.id === meshId)?.index ?? -1;
  }
  function setHiddenById(meshId: string, hide: boolean) {
    const idx = idxOf(meshId);
    if (idx >= 0) viewerControl.current?.setMeshHidden(idx, hide);
    setHiddenIds((prev) => {
      const n = new Set(prev);
      if (hide) n.add(meshId); else n.delete(meshId);
      return n;
    });
  }
  function toggleGroup(g: MeshGroup) {
    const allHidden = g.ids.length > 0 && g.ids.every((id) => hiddenIds.has(id));
    const hide = !allHidden;
    g.ids.forEach((id) => { const idx = idxOf(id); if (idx >= 0) viewerControl.current?.setMeshHidden(idx, hide); });
    setHiddenIds((prev) => {
      const n = new Set(prev);
      g.ids.forEach((id) => { if (hide) n.add(id); else n.delete(id); });
      return n;
    });
  }
  function createGroup(name: string) {
    const g: MeshGroup = { id: `g_${Date.now()}`, name: name.trim() || "새 그룹", ids: [] };
    setMeshGroups((p) => [...p, g]);
    setEditingGroupId(g.id);
  }
  function deleteGroup(gid: string) {
    setMeshGroups((p) => p.filter((g) => g.id !== gid));
    if (editingGroupId === gid) setEditingGroupId(null);
  }
  function toggleMembership(gid: string, meshId: string) {
    setMeshGroups((p) => p.map((g) =>
      g.id === gid
        ? { ...g, ids: g.ids.includes(meshId) ? g.ids.filter((x) => x !== meshId) : [...g.ids, meshId] }
        : g
    ));
  }
  function toggleMeshSelectMode(on: boolean) {
    setMeshSelectMode(on);
    viewerControl.current?.setMeshSelectMode(on);
  }
  function handleMeshPicked(index: number) {
    const m = meta?.meshes.find((x) => x.index === index);
    viewerControl.current?.flashMesh(index);
    setPanelTab("mesh");
    if (m && editingGroupId) {
      toggleMembership(editingGroupId, m.id); // 그룹 편집 중이면 멤버 토글
    } else {
      setSelectedMesh(index);
    }
  }
  function toggleMesh(meshId: string, hide: boolean) { setHiddenById(meshId, hide); }
  function showAllMeshes() {
    viewerControl.current?.showAllMeshes();
    setHiddenIds(new Set());
  }
  async function saveMeshConfig() {
    const pw = window.prompt("모두에게 저장 — 비밀번호를 입력하세요");
    if (!pw) return;
    setMeshSaving(true);
    try {
      const config: MeshConfig = { groups: meshGroups, hidden: Array.from(hiddenIds) };
      const res = await fetch("/api/save-mesh-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id, config, password: pw }),
      });
      if (res.status === 403) { alert("비밀번호가 틀렸어요"); return; }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert("저장 실패: " + (j.error || "") + "\n(Supabase 에 mesh_config 컬럼이 필요할 수 있어요)");
        return;
      }
      alert("저장됐어요 — 이제 이 모델을 여는 모두에게 반영됩니다");
    } finally {
      setMeshSaving(false);
    }
  }

  function applyMeshConfig(cfg: MeshConfig, m: ModelMeta) {
    setMeshGroups(cfg.groups ?? []);
    const hid = new Set(cfg.hidden ?? []);
    setHiddenIds(hid);
    hid.forEach((mid) => {
      const idx = m.meshes.find((x) => x.id === mid)?.index ?? -1;
      if (idx >= 0) viewerControl.current?.setMeshHidden(idx, true);
    });
  }
  function handleModelMeta(m: ModelMeta) {
    setMeta(m);
    if (isPC) viewerControl.current?.setMeshSelectMode(true); // PC 기본 ON
    if (pendingMeshConfig.current) {
      applyMeshConfig(pendingMeshConfig.current, m);
      pendingMeshConfig.current = null;
    }
  }

  // 딥링크: URL ?s= 의 공유 상태를 모델 로드 후 1회 적용
  const pendingState = useRef<ViewerState | null>(parseSharedState());
  // 파라미터 기본값(초기화 복원용)
  const defaultParams = useRef<Param[]>([]);

  function handleParamsLoaded(params: Param[]) {
    defaultParams.current = params.map((p) => ({ ...p })); // 기본값 보관
    const st = pendingState.current;
    if (st) {
      viewerControl.current?.applyState(st);
      const ov = st.overrides || {};
      setOverrideIds(new Set(Object.keys(ov)));
      setParamList(params.map((p) => (ov[p.id] !== undefined ? { ...p, value: ov[p.id] } : p)));
      pendingState.current = null;
    } else {
      setParamList(params);
    }
  }

  // 움직임 멈춤 — 모션 정지 + 아이들 off + 파라미터 기본값 + 얼굴 정면
  function handleFreeze() {
    viewerControl.current?.freezeToBase();
    setAutoIdle(false);
    setOverrideIds(new Set());
    setParamList(defaultParams.current.map((p) => ({ ...p })));
  }

  // 연출 초기화 — 배경/아이들/모션/파라미터/얼굴을 기본 상태로
  function handleResetProduction() {
    viewerControl.current?.stopMotion();
    viewerControl.current?.setAutoIdle(true);
    viewerControl.current?.setBackground("transparent");
    viewerControl.current?.resetAll();
    viewerControl.current?.centerFace();
    setAutoIdle(true);
    setBgKey("transparent");
    setOverrideIds(new Set());
    setParamList(defaultParams.current.map((p) => ({ ...p })));
  }

  // 코멘트에 첨부된 상태로 복원
  function restoreState(s: ViewerState) {
    viewerControl.current?.applyState(s);
    const ov = s.overrides || {};
    setOverrideIds(new Set(Object.keys(ov)));
    setParamList(defaultParams.current.map((p) => (ov[p.id] !== undefined ? { ...p, value: ov[p.id] } : { ...p })));
  }

  function copyStateLink() {
    const st = viewerControl.current?.getState();
    if (!st) return;
    const encoded = encodeURIComponent(btoa(JSON.stringify(st)));
    const url = `${window.location.origin}/review/${id}?s=${encoded}`;
    navigator.clipboard?.writeText(url);
  }

  function handleSetParam(pid: string, value: number) {
    viewerControl.current?.setParam(pid, value);
    setParamList((prev) => prev.map((p) => (p.id === pid ? { ...p, value } : p)));
    setOverrideIds((prev) => (prev.has(pid) ? prev : new Set(prev).add(pid)));
    setCurrentParam({ id: pid, value });
  }
  function handleRelease(pid: string) {
    viewerControl.current?.releaseParam(pid);
    setOverrideIds((prev) => {
      if (!prev.has(pid)) return prev;
      const next = new Set(prev);
      next.delete(pid);
      return next;
    });
  }
  function handleResetAll() {
    viewerControl.current?.resetAll();
    setOverrideIds(new Set());
    setParamList(defaultParams.current.map((p) => ({ ...p })));
  }

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase
          .from("sessions")
          .select("*")
          .eq("id", id)
          .single();
        if (data) {
          setSession(data);
          pendingMeshConfig.current = (data.mesh_config as MeshConfig | null) ?? null;
        } else setNotFound(true);
      } catch {
        // 네트워크 오류 등 — 무한 로딩 대신 안내 표시
        setNotFound(true);
      }
    }
    load();
  }, [id]);

  // PC(마우스) 환경 감지 — 마운트 후 1회. 감지되면 '모델 클릭으로 선택' 기본 ON
  // (SSR 안전: useState/useRef 초기값은 서버에서 false 로 고정되므로 마운트 후 감지)
  useEffect(() => {
    const pc = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches;
    if (pc) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPC(true);
      setMeshSelectMode(true);
      viewerControl.current?.setMeshSelectMode(true);
    }
  }, []);

  // 모델 메타가 DB 응답보다 먼저 도착한 경우, 세션이 도착하면 저장된 mesh_config 적용
  useEffect(() => {
    if (meta && pendingMeshConfig.current) {
      applyMeshConfig(pendingMeshConfig.current, meta);
      pendingMeshConfig.current = null;
    }
  }, [meta, session]);

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-[var(--muted)]">세션을 찾을 수 없거나 만료되었어요</p>
        <Link href="/" className="text-[var(--purple)] hover:opacity-80 text-sm">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden p-2 sm:p-3 gap-2 sm:gap-3">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 glass-strong rounded-2xl flex-shrink-0">
        <Link href="/" className="glass glass-hover p-2 rounded-lg text-[var(--muted)] hover:text-[var(--fg)] transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold text-[var(--fg)] truncate">
            {session?.title ?? "로딩 중..."}
          </h1>
          {session?.description && (
            <p className="text-[11px] text-[var(--muted)] truncate">{session.description}</p>
          )}
        </div>
        <span className="text-[10px] text-[var(--muted)] glass px-2.5 py-1 rounded-full shrink-0">
          리뷰 모드
        </span>
      </header>

      {/* Content — 모바일: 세로 스택 / PC: 좌우 분할 */}
      <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden gap-2 sm:gap-3 min-h-0">
        {/* Model Viewer */}
        <div className="flex-1 min-h-[60vh] md:min-h-0 overflow-hidden">
          {session && (
            <ModelViewer
              sessionId={id}
              controlRef={viewerControl}
              onParamsLoaded={handleParamsLoaded}
              onModelMeta={handleModelMeta}
              onMeshPicked={handleMeshPicked}
            />
          )}
        </div>

        {/* 우측 패널: 코멘트 / 파라미터 탭 */}
        <div className="w-full md:w-72 h-80 md:h-auto glass rounded-xl overflow-hidden flex-shrink-0 flex flex-col">
          {/* 탭 헤더 */}
          <div className="flex gap-1 p-1 border-b border-white/5 flex-shrink-0">
            <button
              onClick={() => setPanelTab("comments")}
              className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                panelTab === "comments"
                  ? "bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] text-white shadow"
                  : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-white/5"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              코멘트
            </button>
            <button
              onClick={() => setPanelTab("params")}
              className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                panelTab === "params"
                  ? "bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] text-white shadow"
                  : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-white/5"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              파라미터
            </button>
            <button
              onClick={() => setPanelTab("production")}
              className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                panelTab === "production"
                  ? "bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] text-white shadow"
                  : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-white/5"
              }`}
            >
              <Clapperboard className="w-3.5 h-3.5" />
              연출
            </button>
            <button
              onClick={() => setPanelTab("mesh")}
              className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                panelTab === "mesh"
                  ? "bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] text-white shadow"
                  : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-white/5"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              메쉬
            </button>
          </div>

          {/* 탭 내용 (display 토글로 모두 마운트 유지 → 상태 보존) */}
          <div className={`flex-1 min-h-0 ${panelTab === "comments" ? "flex flex-col" : "hidden"}`}>
            <FeedbackPanel
              sessionId={id}
              currentParam={currentParam}
              captureState={() => viewerControl.current?.getState() ?? null}
              onRestoreState={restoreState}
            />
          </div>
          <div className={`flex-1 min-h-0 ${panelTab === "params" ? "flex flex-col" : "hidden"}`}>
            <ParamPanel
              params={paramList}
              overrideIds={overrideIds}
              sweepOn={paramSweep}
              onChange={handleSetParam}
              onRelease={handleRelease}
              onResetAll={handleResetAll}
              onToggleSweep={toggleSweep}
            />
          </div>
          <div className={`flex-1 min-h-0 ${panelTab === "production" ? "flex flex-col" : "hidden"}`}>
            <ProductionPanel
              meta={meta}
              autoIdle={autoIdle}
              bgKey={bgKey}
              silhouette={silhouette}
              silhouetteColor={silhouetteColor}
              onToggleSilhouette={(on) => { setSilhouette(on); viewerControl.current?.setSilhouette(on, silhouetteColor); }}
              onSetSilhouetteColor={(c) => { setSilhouetteColor(c); viewerControl.current?.setSilhouette(silhouette, c); }}
              onPlayMotion={(g, i) => viewerControl.current?.playMotion(g, i)}
              onPlayExpression={(n) => viewerControl.current?.playExpression(n)}
              onStop={() => viewerControl.current?.stopMotion()}
              onToggleIdle={(on) => { setAutoIdle(on); viewerControl.current?.setAutoIdle(on); }}
              onSetBg={(k) => { setBgKey(k); viewerControl.current?.setBackground(k); }}
              onSetBgImage={(file) => {
                const url = URL.createObjectURL(file);
                setBgKey("__image__");
                viewerControl.current?.setBackgroundImage(url);
              }}
              onCopyStateLink={copyStateLink}
              onScreenshot={() => viewerControl.current?.screenshot()}
              onFreeze={handleFreeze}
              onReset={handleResetProduction}
            />
          </div>
          <div className={`flex-1 min-h-0 ${panelTab === "mesh" ? "flex flex-col" : "hidden"}`}>
            <MeshPanel
              meshes={meta?.meshes ?? []}
              hiddenIds={hiddenIds}
              groups={meshGroups}
              editingGroupId={editingGroupId}
              selected={selectedMesh}
              selectMode={meshSelectMode}
              saving={meshSaving}
              onToggleMesh={toggleMesh}
              onToggleGroup={toggleGroup}
              onShowAll={showAllMeshes}
              onFlash={(i) => viewerControl.current?.flashMesh(i)}
              onToggleSelectMode={toggleMeshSelectMode}
              onCreateGroup={createGroup}
              onDeleteGroup={deleteGroup}
              onSetEditingGroup={setEditingGroupId}
              onToggleMembership={toggleMembership}
              onSave={saveMeshConfig}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
