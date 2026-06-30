"use client";

import { useState, useEffect } from "react";
import { Send, MessageSquare, Clock } from "lucide-react";
import { supabase, type Feedback } from "@/lib/supabase";

type Props = {
  sessionId: string;
  currentParam?: { id: string; value: number } | null;
};

export default function FeedbackPanel({ sessionId, currentParam }: Props) {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [author, setAuthor] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("feedback_author") || "" : ""
  );
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadFeedbacks();

    // 실시간 구독
    const channel = supabase
      .channel(`feedback:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "feedback", filter: `session_id=eq.${sessionId}` },
        (payload) => setFeedbacks((prev) => [payload.new as Feedback, ...prev])
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  async function loadFeedbacks() {
    const { data } = await supabase
      .from("feedback")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });
    if (data) setFeedbacks(data);
  }

  async function send() {
    if (!author.trim() || !comment.trim()) return;
    setSending(true);
    localStorage.setItem("feedback_author", author);

    await supabase.from("feedback").insert({
      session_id: sessionId,
      author: author.trim(),
      comment: comment.trim(),
      param_name: currentParam?.id ?? null,
      param_value: currentParam?.value ?? null,
    });

    setComment("");
    setSending(false);
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "방금";
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    return `${Math.floor(hr / 24)}일 전`;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-slate-300">피드백</span>
        <span className="ml-auto text-xs text-slate-500">{feedbacks.length}개</span>
      </div>

      {/* 피드백 목록 */}
      <div className="flex-1 overflow-y-auto chat-scroll p-3 space-y-2">
        {feedbacks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
            <MessageSquare className="w-8 h-8" />
            <p className="text-sm">아직 피드백이 없어요</p>
          </div>
        ) : (
          feedbacks.map((fb) => (
            <div key={fb.id} className="glass rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-purple-300">{fb.author}</span>
                <span className="text-[10px] text-slate-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {timeAgo(fb.created_at)}
                </span>
              </div>
              {fb.param_name && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-mono">
                    {fb.param_name.replace("Param", "")}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    = {fb.param_value?.toFixed(2)}
                  </span>
                </div>
              )}
              <p className="text-sm text-slate-300">{fb.comment}</p>
            </div>
          ))
        )}
      </div>

      {/* 입력 폼 */}
      <div className="p-3 border-t border-white/10 space-y-2">
        {currentParam && (
          <div className="text-[10px] text-slate-500 px-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            현재 파라미터: <span className="text-purple-400 font-mono">{currentParam.id.replace("Param", "")} = {currentParam.value.toFixed(2)}</span> 상태로 첨부됩니다
          </div>
        )}
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="이름"
          className="w-full glass rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none"
        />
        <div className="flex gap-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="피드백 내용..."
            rows={2}
            className="flex-1 glass rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
            }}
          />
          <button
            onClick={send}
            disabled={sending || !author.trim() || !comment.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-lg px-3 self-stretch transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
