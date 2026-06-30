"use client";

import { useEffect, useState, useRef, use } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, MessageSquare, Sliders, Clapperboard, Layers } from "lucide-react";
import Link from "next/link";
import { supabase, type Session } from "@/lib/supabase";
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
  const [panelTab, setPanelTab] = useState<PanelTab>("comments");

  // 연출(모션/표정/배경/아이들) 상태
  const [meta, setMeta] = useState<ModelMeta | null>(null);
  const [autoIdle, setAutoIdle] = useState(true);
  const [bgKey, setBgKey] = useState("transparent");
  const [hiddenMeshes, setHiddenMeshes] = useState<Set<number>>(new Set());

  function toggleMesh(index: number, hide: boolean) {
    viewerControl.current?.setMeshHidden(index, hide);
    setHiddenMeshes((prev) => {
      const next = new Set(prev);
      if (hide) next.add(index); else next.delete(index);
      return next;
    });
  }
  function showAllMeshes() {
    viewerControl.current?.showAllMeshes();
    setHiddenMeshes(new Set());
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
        if (data) setSession(data);
        else setNotFound(true);
      } catch {
        // 네트워크 오류 등 — 무한 로딩 대신 안내 표시
        setNotFound(true);
      }
    }
    load();
  }, [id]);

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
              onModelMeta={setMeta}
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
              onChange={handleSetParam}
              onRelease={handleRelease}
              onResetAll={handleResetAll}
            />
          </div>
          <div className={`flex-1 min-h-0 ${panelTab === "production" ? "flex flex-col" : "hidden"}`}>
            <ProductionPanel
              meta={meta}
              autoIdle={autoIdle}
              bgKey={bgKey}
              onPlayMotion={(g, i) => viewerControl.current?.playMotion(g, i)}
              onPlayExpression={(n) => viewerControl.current?.playExpression(n)}
              onStop={() => viewerControl.current?.stopMotion()}
              onToggleIdle={(on) => { setAutoIdle(on); viewerControl.current?.setAutoIdle(on); }}
              onSetBg={(k) => { setBgKey(k); viewerControl.current?.setBackground(k); }}
              onCopyStateLink={copyStateLink}
              onScreenshot={() => viewerControl.current?.screenshot()}
              onFreeze={handleFreeze}
              onReset={handleResetProduction}
            />
          </div>
          <div className={`flex-1 min-h-0 ${panelTab === "mesh" ? "flex flex-col" : "hidden"}`}>
            <MeshPanel
              meshes={meta?.meshes ?? []}
              hidden={hiddenMeshes}
              onToggle={toggleMesh}
              onShowAll={showAllMeshes}
              onFlash={(i) => viewerControl.current?.flashMesh(i)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
