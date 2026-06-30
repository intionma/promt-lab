"use client";

import { useEffect, useState, use } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { supabase, type Session } from "@/lib/supabase";
import FeedbackPanel from "@/app/components/FeedbackPanel";

const ModelViewer = dynamic(() => import("@/app/components/ModelViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
      뷰어 로딩 중...
    </div>
  ),
});

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [currentParam, setCurrentParam] = useState<{ id: string; value: number } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", id)
        .single();
      if (data) setSession(data);
      else setNotFound(true);
    }
    load();
  }, [id]);

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-slate-400">세션을 찾을 수 없거나 만료되었어요</p>
        <Link href="/" className="text-purple-400 hover:text-purple-300 text-sm">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10 glass flex-shrink-0">
        <Link href="/" className="text-slate-500 hover:text-slate-300 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-sm font-semibold text-slate-200">
            {session?.title ?? "로딩 중..."}
          </h1>
          {session?.description && (
            <p className="text-[11px] text-slate-500">{session.description}</p>
          )}
        </div>
        <div className="ml-auto text-[10px] text-slate-600">
          7일 후 만료
        </div>
      </header>

      {/* Content — 모바일: 세로 스택 / PC: 좌우 분할 */}
      <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden p-3 gap-3">
        {/* Model Viewer */}
        <div className="flex-1 min-h-[60vh] md:min-h-0 overflow-hidden">
          {session && (
            <ModelViewer
              sessionId={id}
              onParamChange={(paramId, value) =>
                setCurrentParam({ id: paramId, value })
              }
            />
          )}
        </div>

        {/* Feedback Panel */}
        <div className="w-full md:w-72 h-80 md:h-auto glass rounded-xl overflow-hidden flex-shrink-0">
          <FeedbackPanel sessionId={id} currentParam={currentParam} />
        </div>
      </div>
    </div>
  );
}
