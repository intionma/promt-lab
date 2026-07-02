"use client";

import { useEffect, useState, useRef, use } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, MessageSquare, Sliders, Clapperboard, Layers, EyeOff, Eye, Columns2, X, Boxes, Loader2, Link2, Unlink, Crosshair, RotateCcw, Move } from "lucide-react";
import Link from "next/link";
import { supabase, type Session, type ViewFrame } from "@/lib/supabase";
import { toast, promptDialog } from "@/lib/ui";
import { getSilhouettePref, setSilhouettePref, DEFAULT_SILHOUETTE_COLOR } from "@/lib/prefs";
import { useAdmin } from "@/lib/admin";
import FeedbackPanel from "@/app/components/FeedbackPanel";
import ParamPanel from "@/app/components/ParamPanel";
import ProductionPanel from "@/app/components/ProductionPanel";
import MeshPanel from "@/app/components/MeshPanel";
import FolderHotToggles from "@/app/components/FolderHotToggles";
import { usePaneMesh } from "@/app/components/usePaneMesh";
import type { Param, ViewerHandle, ModelMeta, ViewerState, ViewMode } from "@/app/components/ModelViewer";

const VIEW_LABELS: Record<ViewMode, string> = { fullbody: "전신", upperbody: "상반신", free: "자유 시점" };

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

  // ── 여러 모델 비교(분할, 최대 3개: A + 비교 B·C) ─────────────────────────
  type Pane = "A" | "B" | "C";
  const viewerControlB = useRef<ViewerHandle | null>(null);
  const viewerControlC = useRef<ViewerHandle | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);   // B 슬롯
  const [compareId2, setCompareId2] = useState<string | null>(null); // C 슬롯
  const [compareSession, setCompareSession] = useState<Session | null>(null);
  const [compareSession2, setCompareSession2] = useState<Session | null>(null);
  const [metaB, setMetaB] = useState<ModelMeta | null>(null);
  const [metaC, setMetaC] = useState<ModelMeta | null>(null);
  const [activePane, setActivePane] = useState<Pane>("A");
  const [showPicker, setShowPicker] = useState(false);
  const [pickerModels, setPickerModels] = useState<{ name: string; versions: Session[] }[]>([]);
  const compareOn = !!compareId || !!compareId2;
  const activeSessionId = activePane === "C" && compareId2 ? compareId2 : activePane === "B" && compareId ? compareId : id;
  const activeViewer = () => (activePane === "C" ? viewerControlC : activePane === "B" ? viewerControlB : viewerControl);
  // 현재 살아있는 비교 창(B·C)의 뷰어 ref 목록 — 파라미터·실루엣 등 '전체 동기화'용
  function compareViewers() {
    const arr: (typeof viewerControl)[] = [];
    if (compareId) arr.push(viewerControlB);
    if (compareId2) arr.push(viewerControlC);
    return arr;
  }
  // A 포함 살아있는 모든 창 — 시점 체인 등 '함께 조작'용
  function allViewers() { return [viewerControl, ...compareViewers()]; }

  // 비교 대상 목록 로드(같은 모델 버전 먼저, 그다음 다른 모델)
  async function openPicker() {
    setShowPicker(true);
    const { data } = await supabase.from("sessions").select("*").order("created_at", { ascending: false });
    if (!data) return;
    const map = new Map<string, Session[]>();
    const taken = new Set([id, compareId, compareId2].filter(Boolean) as string[]);
    for (const s of data as Session[]) {
      if (taken.has(s.id)) continue; // 자기 자신·이미 띄운 것 제외
      const key = s.model_name || s.title;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    const own = session?.model_name || session?.title;
    const list = Array.from(map.entries()).map(([name, versions]) => ({ name, versions }));
    // 같은 모델을 맨 위로
    list.sort((a, b) => (a.name === own ? -1 : b.name === own ? 1 : 0));
    setPickerModels(list);
  }
  function pickCompare(s: Session) {
    // 빈 슬롯을 채움: B 먼저, 그다음 C. 둘 다 차면 현재 활성 비교 창을 교체.
    if (!compareId && activePane !== "B") { setCompareId(s.id); setCompareSession(s); setMetaB(null); }
    else if (!compareId2) { setCompareId2(s.id); setCompareSession2(s); setMetaC(null); }
    else if (activePane === "C") { setCompareId2(s.id); setCompareSession2(s); setMetaC(null); }
    else { setCompareId(s.id); setCompareSession(s); setMetaB(null); }
    setShowPicker(false);
    requestAnimationFrame(() => requestAnimationFrame(() => { if (chain) syncComparesFromA(); }));
  }
  function closeCompare() {   // B 닫기
    setCompareId(null); setCompareSession(null); setMetaB(null);
    if (activePane === "B") setActivePane("A");
  }
  function closeCompare2() {  // C 닫기
    setCompareId2(null); setCompareSession2(null); setMetaC(null);
    if (activePane === "C") setActivePane("A");
  }
  // 시선 동기화(한 창 → 나머지 살아있는 창들)
  function gazeFrom(src: Pane) {
    return (gx: number, gy: number, instant: boolean) => {
      if (src !== "A") viewerControl.current?.gazeTo(gx, gy, instant);
      if (src !== "B" && compareId) viewerControlB.current?.gazeTo(gx, gy, instant);
      if (src !== "C" && compareId2) viewerControlC.current?.gazeTo(gx, gy, instant);
    };
  }

  // ── 시점 체인(동시 조작) ─────────────────────────────────────────────────
  // 기본값: 묶임(chain=true) → 두 창의 시점 전환·자유시점 카메라가 함께 움직임.
  // 풀면 선택된(활성) 창의 시점만 따로 바뀜(메쉬 편집과 동일한 방식).
  const [chain, setChain] = useState(true);
  type VState = { viewMode: ViewMode; faceTrack: boolean; camLock: boolean; adjustMode: boolean };
  const [viewStateA, setViewStateA] = useState<VState>({ viewMode: "fullbody", faceTrack: true, camLock: false, adjustMode: false });
  const [viewStateB, setViewStateB] = useState<VState>({ viewMode: "fullbody", faceTrack: true, camLock: false, adjustMode: false });
  const [viewStateC, setViewStateC] = useState<VState>({ viewMode: "fullbody", faceTrack: true, camLock: false, adjustMode: false });
  const activeViewState = activePane === "C" ? viewStateC : activePane === "B" ? viewStateB : viewStateA;

  // 자유 시점 카메라 팬·줌 동기화 (체인 연결 시) — 출처 창을 뺀 나머지에 전파
  function cameraFrom(src: Pane) {
    return (free: { offsetX: number; offsetY: number; zoom: number }) => {
      if (!chain) return;
      if (src !== "A") viewerControl.current?.setCamera(free);
      if (src !== "B" && compareId) viewerControlB.current?.setCamera(free);
      if (src !== "C" && compareId2) viewerControlC.current?.setCamera(free);
    };
  }

  // 통합 시점 바 조작 — 체인이면 모든 창, 아니면 활성 창만
  function applyViewMode(mode: ViewMode) {
    if (chain) allViewers().forEach((v) => v.current?.setViewMode(mode));
    else activeViewer().current?.setViewMode(mode);
  }
  function applyFaceTrack(on: boolean) {
    if (chain) allViewers().forEach((v) => v.current?.setFaceTrack(on));
    else activeViewer().current?.setFaceTrack(on);
  }
  function applyCamLock(on: boolean) {
    if (chain) allViewers().forEach((v) => v.current?.setCamLock(on));
    else activeViewer().current?.setCamLock(on);
  }
  function applyCenterFace() {
    if (chain) allViewers().forEach((v) => v.current?.centerGaze());
    else activeViewer().current?.centerGaze();
  }
  function applyResetFree() {
    if (chain) allViewers().forEach((v) => v.current?.resetFreeView());
    else activeViewer().current?.resetFreeView();
  }
  // 전신/상반신 프레이밍 조정 — 모델별이라 체인과 무관하게 '활성 창'만 조정
  function applyAdjustMode(on: boolean) { activeViewer().current?.setViewAdjustMode(on); }
  function resetFrame() {
    const vm = activeViewState.viewMode;
    if (vm === "fullbody" || vm === "upperbody") activeViewer().current?.resetViewFrame(vm);
  }
  async function saveViewFrame() {
    const vh = activeViewer().current;
    if (!vh) return;
    const frame = vh.getViewFrame();
    const modelName = activePane === "C" ? (compareSession2?.model_name ?? null) : activePane === "B" ? (compareSession?.model_name ?? null) : (session?.model_name ?? null);
    const sid = activePane === "C" ? compareId2 : activePane === "B" ? compareId : id;
    const pw = admin.active ? admin.pin : (await promptDialog("전신/상반신 카메라 위치를 이 모델에 저장", "", "비밀번호"));
    if (!pw) return;
    try {
      const res = await fetch("/api/save-view-frame", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelName, sessionId: sid, frame, password: pw }) });
      if (res.status === 403) { toast("비밀번호가 틀렸어요", "error"); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); toast("저장 실패: " + (j.error || ""), "error"); return; }
      toast("이 모델의 전신·상반신 카메라 위치를 저장했어요 (모든 버전·모두에게 공유)", "success");
    } catch { toast("저장 중 오류가 났어요", "error"); }
  }
  // A의 현재 시점·카메라를 비교 창들(B·C)에 그대로 맞춤 (비교 시작·체인 재연결 시)
  function syncComparesFromA() {
    const st = viewerControl.current?.getState();
    if (!st) return;
    compareViewers().forEach((v) => {
      v.current?.setViewMode(st.viewMode);
      v.current?.setFaceTrack(st.faceTrack);
      v.current?.setCamLock(viewStateA.camLock);
      v.current?.setCamera(st.free);
    });
  }
  function toggleChain() {
    const next = !chain;
    setChain(next);
    if (next && compareOn) syncComparesFromA(); // 다시 묶으면 비교 창을 A에 맞춤
  }
  function handleMetaB(m: ModelMeta) {
    setMetaB(m);
    if (chain) requestAnimationFrame(() => syncComparesFromA()); // B 준비되면 A에 맞춤
  }
  function handleMetaC(m: ModelMeta) {
    setMetaC(m);
    if (chain) requestAnimationFrame(() => syncComparesFromA()); // C 준비되면 A에 맞춤
  }

  function toggleSweep(on: boolean) {
    setParamSweep(on);
    viewerControl.current?.setParamSweep(on);
    compareViewers().forEach((v) => v.current?.setParamSweep(on));
    if (!on) { setOverrideIds(new Set()); setParamList(defaultParams.current.map((p) => ({ ...p }))); }
  }

  // 연출(모션/표정/배경/아이들) 상태
  const [meta, setMeta] = useState<ModelMeta | null>(null);
  const activeMeta = activePane === "C" ? metaC : activePane === "B" ? metaB : meta; // 비교 시 하단 패널이 대상으로 하는 창의 메타
  const [autoIdle, setAutoIdle] = useState(true);
  const [bgKey, setBgKey] = useState("transparent");
  // 실루엣 모드(회사 등에서 캐릭터 아트 대신 단색 형체만)
  // SSR 안전: 초기엔 false, 마운트 후 저장된 사전 설정으로 동기화(모델 적용은 ModelViewer가 직접)
  const [silhouette, setSilhouette] = useState(false);
  const [silhouetteColor, setSilhouetteColor] = useState(DEFAULT_SILHOUETTE_COLOR);
  // 메쉬 그룹/숨김 (id 기준, 모두에게 공유 저장)
  // PC(마우스 환경) 감지 — 마운트 후 effect 에서 설정
  const [isPC, setIsPC] = useState(false);
  const admin = useAdmin(); // 관리자 모드면 폴더 공유 시 PIN 자동
  const sharePw = admin.active ? admin.pin : null;
  // 창별 메쉬 상태(폴더 포함) — A: 현재 모델, B: 비교 대상. 활성 창 것이 하단 패널에 보임.
  const meshA = usePaneMesh({ sessionId: id, meta, viewerRef: viewerControl, isPC, sharePassword: sharePw, onPicked: () => { setActivePane("A"); setPanelTab("mesh"); } });
  const meshB = usePaneMesh({ sessionId: compareId, meta: metaB, viewerRef: viewerControlB, isPC, sharePassword: sharePw, onPicked: () => { setActivePane("B"); setPanelTab("mesh"); } });
  const meshC = usePaneMesh({ sessionId: compareId2, meta: metaC, viewerRef: viewerControlC, isPC, sharePassword: sharePw, onPicked: () => { setActivePane("C"); setPanelTab("mesh"); } });
  const activeMesh = activePane === "C" ? meshC : activePane === "B" ? meshB : meshA;

  function handleModelMeta(m: ModelMeta) { setMeta(m); } // 메쉬 설정 적용은 usePaneMesh 가 처리

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

  // 실루엣 토글 (헤더 빠른 버튼·연출 탭 공용) — 사전 설정에도 저장
  function toggleSilhouette(on: boolean) {
    setSilhouette(on);
    viewerControl.current?.setSilhouette(on, silhouetteColor);
    compareViewers().forEach((v) => v.current?.setSilhouette(on, silhouetteColor));
    setSilhouettePref(on, silhouetteColor);
  }
  function changeSilhouetteColor(color: number) {
    setSilhouetteColor(color);
    viewerControl.current?.setSilhouette(silhouette, color);
    compareViewers().forEach((v) => v.current?.setSilhouette(silhouette, color));
    setSilhouettePref(silhouette, color);
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
    compareViewers().forEach((v) => v.current?.setParam(pid, value)); // 모든 모델 동일 적용
    setParamList((prev) => prev.map((p) => (p.id === pid ? { ...p, value } : p)));
    setOverrideIds((prev) => (prev.has(pid) ? prev : new Set(prev).add(pid)));
    setCurrentParam({ id: pid, value });
  }
  function handleRelease(pid: string) {
    viewerControl.current?.releaseParam(pid);
    compareViewers().forEach((v) => v.current?.releaseParam(pid));
    setOverrideIds((prev) => {
      if (!prev.has(pid)) return prev;
      const next = new Set(prev);
      next.delete(pid);
      return next;
    });
  }
  function handleResetAll() {
    viewerControl.current?.resetAll();
    compareViewers().forEach((v) => v.current?.resetAll());
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
          setSession(data); // 메쉬 설정/차이는 usePaneMesh 가 자체 로드
        } else setNotFound(true);
      } catch {
        // 네트워크 오류 등 — 무한 로딩 대신 안내 표시
        setNotFound(true);
      }
    }
    load();
  }, [id]);

  // 저장된 실루엣 사전 설정으로 헤더/연출 상태 동기화 (모델 적용은 ModelViewer가 직접)
  useEffect(() => {
    const p = getSilhouettePref();
    if (p.on) setSilhouette(true);
    setSilhouetteColor(p.color);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PC(마우스) 환경 감지 — 마운트 후 1회. 감지되면 '모델 클릭으로 선택' 기본 ON
  // (SSR 안전: useState/useRef 초기값은 서버에서 false 로 고정되므로 마운트 후 감지)
  useEffect(() => {
    const pc = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pc) setIsPC(true); // 창별 '모델 클릭 선택' 기본 ON 은 usePaneMesh 가 처리
  }, []);

  // 비교 모드 토글 시 두 뷰어의 렌더러 크기를 레이아웃 확정 후 재설정
  // (PIXI resizeTo 는 window resize 에만 반응 → 컨테이너 크기 변화를 직접 반영해야 모델이 안 사라짐)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      viewerControl.current?.resize();
      viewerControlB.current?.resize();
      viewerControlC.current?.resize();
    }));
    return () => cancelAnimationFrame(raf);
  }, [compareOn, compareId, compareId2]);

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
        {/* 두 모델 비교 */}
        <button
          onClick={openPicker}
          title={(!!compareId && !!compareId2) ? "비교 창이 꽉 찼어요 — 누르면 활성 창을 다른 모델로 교체" : "다른 모델을 옆에 띄워 나란히 비교 (최대 3개)"}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold shrink-0 transition-all ${
            compareOn ? "bg-[var(--purple)] text-white shadow-lg shadow-[var(--purple)]/30" : "glass glass-hover text-[var(--muted)]"
          }`}
        >
          <Columns2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{compareOn ? `비교 ${1 + (compareId ? 1 : 0) + (compareId2 ? 1 : 0)}개` : "비교"}</span>
        </button>
        {/* 항상 보이는 실루엣 빠른 토글 — 옆에서 누가 오면 한 번에 가리기 */}
        <button
          onClick={() => toggleSilhouette(!silhouette)}
          title={silhouette ? "실루엣 끄기 (원래 그림 보이기)" : "실루엣 켜기 (그림 가리기)"}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold shrink-0 transition-all ${
            silhouette
              ? "bg-[var(--purple)] text-white shadow-lg shadow-[var(--purple)]/30"
              : "glass glass-hover text-[var(--muted)]"
          }`}
        >
          {silhouette ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span>{silhouette ? "실루엣" : "가리기"}</span>
        </button>
        <span className="text-[10px] text-[var(--muted)] glass px-2.5 py-1 rounded-full shrink-0 hidden sm:inline">
          리뷰 모드
        </span>
      </header>

      {/* Content — 모바일: 세로 스택 / PC: 좌우 분할 */}
      <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden gap-2 sm:gap-3 min-h-0">
        {/* Model Viewer(s) — 단일 또는 분할 비교 */}
        <div className="flex-1 min-h-[60vh] md:min-h-0 overflow-hidden flex flex-col gap-2">
          {/* 통합 시점 바 (비교 모드 전용) — 두 창의 시점을 함께/따로 조작 */}
          {compareOn && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 glass rounded-xl flex-shrink-0 flex-wrap">
              <span className="text-[10px] text-[var(--muted)] mr-0.5">시점</span>
              {(["fullbody", "upperbody", "free"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => applyViewMode(mode)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    activeViewState.viewMode === mode
                      ? "bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] text-white shadow-md"
                      : "glass glass-hover text-[var(--muted)]"
                  }`}
                >
                  {VIEW_LABELS[mode]}
                </button>
              ))}
              {/* 체인(동시 조작) 토글 */}
              <button
                onClick={toggleChain}
                title={chain ? "두 창을 함께 조작 중 — 누르면 따로 조작" : "각 창을 따로 조작 중 — 누르면 함께 조작"}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 ${
                  chain ? "bg-[var(--purple)] text-white shadow-lg shadow-[var(--purple)]/30" : "glass glass-hover text-[var(--muted)]"
                }`}
              >
                {chain ? <Link2 className="w-3.5 h-3.5" /> : <Unlink className="w-3.5 h-3.5" />}
                {chain ? "동시" : "따로"}
              </button>

              {/* 시점별 보조 버튼 */}
              {activeViewState.viewMode === "free" ? (
                <>
                  <button
                    onClick={() => applyCamLock(!activeViewState.camLock)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 shadow-sm ${activeViewState.camLock ? "bg-[var(--purple)] text-white shadow-[var(--purple)]/30" : "glass glass-hover text-[var(--fg)] border border-[var(--purple)]/40"}`}
                    title="켜면 드래그로 카메라 대신 시선·고개를 돌립니다 (끄면 마우스로 시선·드래그로 화면 이동)"
                  >
                    <Move className="w-3 h-3" /> 카메라 잠금 {activeViewState.camLock ? "ON" : "OFF"}
                  </button>
                  <button onClick={applyResetFree} className="px-2 py-1 rounded-lg text-[10px] glass glass-hover text-[var(--muted)] flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> 초기화
                  </button>
                </>
              ) : (
                <>
                  {/* 카메라 조정 ({activePane} 창 모델의 이 시점 프레이밍) */}
                  <button
                    onClick={() => applyAdjustMode(!activeViewState.adjustMode)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 shadow-sm ${activeViewState.adjustMode ? "bg-[var(--purple)] text-white shadow-[var(--purple)]/30" : "glass glass-hover text-[var(--fg)] border border-[var(--purple)]/40"}`}
                    title="드래그로 화면 위치, 휠/핀치로 확대 — 이 시점의 고정 카메라 조정"
                  >
                    <Move className="w-3 h-3" /> 카메라 조정 {activeViewState.adjustMode ? "ON" : "OFF"}
                  </button>
                  {activeViewState.adjustMode ? (
                    <>
                      <button onClick={saveViewFrame} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white">저장</button>
                      <button onClick={resetFrame} className="px-2 py-1 rounded-lg text-[10px] glass glass-hover text-[var(--muted)] flex items-center gap-1"><RotateCcw className="w-3 h-3" /> 초기화</button>
                    </>
                  ) : (
                    <>
                      {activeViewState.faceTrack && (
                        <button onClick={applyCenterFace} className="px-2.5 py-1 rounded-lg text-[10px] glass glass-hover text-[var(--muted)] flex items-center gap-1">
                          <Crosshair className="w-3 h-3" /> 정면
                        </button>
                      )}
                      <button
                        onClick={() => applyFaceTrack(!activeViewState.faceTrack)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 ${activeViewState.faceTrack ? "bg-[var(--purple)]/20 text-[var(--purple)]" : "glass glass-hover text-[var(--muted)]"}`}
                        title="터치·마우스에 얼굴이 반응하는 기능"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${activeViewState.faceTrack ? "bg-[var(--purple)]" : "bg-[var(--muted)]/40"}`} />
                        얼굴 반응 {activeViewState.faceTrack ? "ON" : "OFF"}
                      </button>
                    </>
                  )}
                </>
              )}
              {!chain && (
                <span className="ml-auto text-[10px] text-[var(--purple)] font-semibold">
                  {activePane} 창만 조작 중
                </span>
              )}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col md:flex-row gap-2">
            {/* Pane A */}
            <div
              onPointerDownCapture={() => compareOn && setActivePane("A")}
              className={`flex-1 min-h-0 overflow-hidden rounded-xl relative transition-colors ${compareOn ? (activePane === "A" ? "border-2 border-[var(--purple)]" : "border-2 border-white/10") : ""}`}
            >
              {session && (
                <ModelViewer
                  sessionId={id}
                  controlRef={viewerControl}
                  onParamsLoaded={handleParamsLoaded}
                  onModelMeta={handleModelMeta}
                  onMeshPicked={meshA.handleMeshPicked}
                  onGaze={gazeFrom("A")}
                  showViewBar={!compareOn}
                  onViewState={setViewStateA}
                  onCameraChange={cameraFrom("A")}
                  initialViewFrame={session?.mesh_config?.viewFrame ?? null}
                  onSaveFrame={saveViewFrame}
                />
              )}
              <FolderHotToggles groups={meshA.groups} hiddenIds={meshA.hiddenIds} onToggle={meshA.toggleGroup} />
            </div>
            {/* Pane B (비교) */}
            {compareId && (
              <div
                onPointerDownCapture={() => setActivePane("B")}
                className={`flex-1 min-h-0 overflow-hidden rounded-xl relative transition-colors ${activePane === "B" ? "border-2 border-[var(--purple)]" : "border-2 border-white/10"}`}
              >
                <button onClick={closeCompare} title="비교 닫기" className="absolute top-2 right-2 z-30 glass-strong p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--fg)]">
                  <X className="w-4 h-4" />
                </button>
                <ModelViewer
                  sessionId={compareId}
                  controlRef={viewerControlB}
                  onModelMeta={handleMetaB}
                  onMeshPicked={meshB.handleMeshPicked}
                  onGaze={gazeFrom("B")}
                  showViewBar={false}
                  onViewState={setViewStateB}
                  onCameraChange={cameraFrom("B")}
                  initialViewFrame={compareSession?.mesh_config?.viewFrame ?? null}
                />
                <FolderHotToggles groups={meshB.groups} hiddenIds={meshB.hiddenIds} onToggle={meshB.toggleGroup} />
              </div>
            )}
            {/* Pane C (비교) */}
            {compareId2 && (
              <div
                onPointerDownCapture={() => setActivePane("C")}
                className={`flex-1 min-h-0 overflow-hidden rounded-xl relative transition-colors ${activePane === "C" ? "border-2 border-[var(--purple)]" : "border-2 border-white/10"}`}
              >
                <button onClick={closeCompare2} title="비교 닫기" className="absolute top-2 right-2 z-30 glass-strong p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--fg)]">
                  <X className="w-4 h-4" />
                </button>
                <ModelViewer
                  sessionId={compareId2}
                  controlRef={viewerControlC}
                  onModelMeta={handleMetaC}
                  onMeshPicked={meshC.handleMeshPicked}
                  onGaze={gazeFrom("C")}
                  showViewBar={false}
                  onViewState={setViewStateC}
                  onCameraChange={cameraFrom("C")}
                  initialViewFrame={compareSession2?.mesh_config?.viewFrame ?? null}
                />
                <FolderHotToggles groups={meshC.groups} hiddenIds={meshC.hiddenIds} onToggle={meshC.toggleGroup} />
              </div>
            )}
          </div>
        </div>

        {/* 우측 패널: 코멘트 / 파라미터 탭 */}
        <div className="w-full md:w-72 h-80 md:h-auto glass rounded-xl overflow-hidden flex-shrink-0 flex flex-col">
          {/* 비교 중: 아래 패널이 어느 모델을 대상으로 하는지(A/B) 선택 */}
          {compareOn && (
            <div className="flex gap-1 p-1 border-b border-white/5 flex-shrink-0 text-[10px]">
              <button onClick={() => setActivePane("A")} className={`flex-1 truncate px-2 py-1 rounded-md font-medium ${activePane === "A" ? "bg-[var(--purple)]/25 text-[var(--purple)]" : "text-[var(--muted)] hover:bg-white/5"}`} title={session?.title}>
                A · {session?.title ?? "1번"}
              </button>
              {compareId && (
                <button onClick={() => setActivePane("B")} className={`flex-1 truncate px-2 py-1 rounded-md font-medium ${activePane === "B" ? "bg-[var(--purple)]/25 text-[var(--purple)]" : "text-[var(--muted)] hover:bg-white/5"}`} title={compareSession?.title}>
                  B · {compareSession?.title ?? "2번"}
                </button>
              )}
              {compareId2 && (
                <button onClick={() => setActivePane("C")} className={`flex-1 truncate px-2 py-1 rounded-md font-medium ${activePane === "C" ? "bg-[var(--purple)]/25 text-[var(--purple)]" : "text-[var(--muted)] hover:bg-white/5"}`} title={compareSession2?.title}>
                  C · {compareSession2?.title ?? "3번"}
                </button>
              )}
            </div>
          )}
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
              key={activeSessionId}
              sessionId={activeSessionId}
              currentParam={currentParam}
              captureState={() => activeViewer().current?.getState() ?? null}
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
              meta={activeMeta}
              autoIdle={autoIdle}
              bgKey={bgKey}
              silhouette={silhouette}
              silhouetteColor={silhouetteColor}
              onToggleSilhouette={toggleSilhouette}
              onSetSilhouetteColor={changeSilhouetteColor}
              onPlayMotion={(g, i) => activeViewer().current?.playMotion(g, i)}
              onPlayExpression={(n) => activeViewer().current?.playExpression(n)}
              onStop={() => activeViewer().current?.stopMotion()}
              onToggleIdle={(on) => { setAutoIdle(on); activeViewer().current?.setAutoIdle(on); }}
              onSetBg={(k) => { setBgKey(k); activeViewer().current?.setBackground(k); }}
              onSetBgImage={(file) => {
                const url = URL.createObjectURL(file);
                setBgKey("__image__");
                activeViewer().current?.setBackgroundImage(url);
              }}
              onCopyStateLink={copyStateLink}
              onScreenshot={() => activeViewer().current?.screenshot()}
              onFreeze={handleFreeze}
              onReset={handleResetProduction}
            />
          </div>
          <div className={`flex-1 min-h-0 ${panelTab === "mesh" ? "flex flex-col" : "hidden"}`}>
            <MeshPanel
              meshes={activeMeta?.meshes ?? []}
              hiddenIds={activeMesh.hiddenIds}
              lockedIds={activeMesh.lockedIds}
              groups={activeMesh.groups}
              editingGroupId={activeMesh.editingGroupId}
              selected={activeMesh.selectedMesh}
              selectMode={activeMesh.meshSelectMode}
              sharingGroupId={activeMesh.sharingGroupId}
              onToggleMesh={activeMesh.toggleMesh}
              onToggleLock={activeMesh.toggleLock}
              onToggleGroup={activeMesh.toggleGroup}
              onShowAll={activeMesh.showAllMeshes}
              onFlash={(i) => activeViewer().current?.flashMesh(i)}
              onToggleSelectMode={activeMesh.toggleMeshSelectMode}
              onCreateGroup={activeMesh.createGroup}
              onDeleteGroup={activeMesh.deleteGroup}
              onSetEditingGroup={activeMesh.setEditingGroupId}
              onToggleMembership={activeMesh.toggleMembership}
              onShareGroup={activeMesh.shareGroup}
              diff={activeMesh.diff}
            />
          </div>
        </div>
      </div>

      {/* 비교할 모델 선택 */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPicker(false)}>
          <div className="glass-strong rounded-2xl p-4 w-full max-w-sm max-h-[80vh] flex flex-col fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Columns2 className="w-4 h-4 text-[var(--purple)]" />
                <span className="text-sm font-semibold">옆에 띄워 비교할 모델</span>
              </div>
              <button onClick={() => setShowPicker(false)} className="text-[var(--muted)] hover:text-[var(--fg)]"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-[10px] text-[var(--muted)] mb-2">같은 모델의 다른 버전이 위에 나와요. 파라미터·시선은 함께 움직입니다.</p>
            <div className="flex-1 overflow-y-auto chat-scroll space-y-2 pr-1">
              {pickerModels.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-[var(--muted)]"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : pickerModels.map((m) => (
                <div key={m.name} className="space-y-1">
                  <p className="text-[10px] font-semibold text-[var(--muted)] flex items-center gap-1"><Boxes className="w-3 h-3 text-[var(--purple)]" /> {m.name}</p>
                  <div className="space-y-1">
                    {m.versions.map((v) => (
                      <button key={v.id} onClick={() => pickCompare(v)} className="w-full text-left glass glass-hover rounded-lg px-3 py-2 text-xs text-[var(--fg)] flex items-center gap-2">
                        <span className="truncate flex-1">{v.title}</span>
                        <span className="text-[9px] text-[var(--muted)]">선택</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
