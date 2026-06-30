"use client";

import { useEffect, useState, useRef, use } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, MessageSquare, Sliders } from "lucide-react";
import Link from "next/link";
import { supabase, type Session } from "@/lib/supabase";
import FeedbackPanel from "@/app/components/FeedbackPanel";
import ParamPanel from "@/app/components/ParamPanel";
import type { Param, ViewerHandle } from "@/app/components/ModelViewer";

const ModelViewer = dynamic(() => import("@/app/components/ModelViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
      뷰어 로딩 중...
    </div>
  ),
});

type PanelTab = "comments" | "params";

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
              onParamsLoaded={setParamList}
            />
          )}
        </div>

        {/* 우측 패널: 코멘트 / 파라미터 탭 */}
        <div className="w-full md:w-72 h-80 md:h-auto glass rounded-xl overflow-hidden flex-shrink-0 flex flex-col">
          {/* 탭 헤더 */}
          <div className="flex gap-1 p-1 border-b border-white/5 flex-shrink-0">
            <button
              onClick={() => setPanelTab("comments")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
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
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                panelTab === "params"
                  ? "bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] text-white shadow"
                  : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-white/5"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              파라미터
              {paramList.length > 0 && (
                <span className="text-[9px] opacity-70">{paramList.length}</span>
              )}
            </button>
          </div>

          {/* 탭 내용 (display 토글로 둘 다 마운트 유지 → 상태 보존) */}
          <div className={`flex-1 min-h-0 ${panelTab === "comments" ? "flex flex-col" : "hidden"}`}>
            <FeedbackPanel sessionId={id} currentParam={currentParam} />
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
        </div>
      </div>
    </div>
  );
}
