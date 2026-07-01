"use client";

import { useState, useEffect } from "react";
import { Send, MessageSquare, Clock, Camera, Eye, Trash2 } from "lucide-react";
import { supabase, type Feedback } from "@/lib/supabase";
import { toast, promptDialog, confirmDialog } from "@/lib/ui";
import type { ViewerState } from "./ModelViewer";

type Props = {
  sessionId: string;
  currentParam?: { id: string; value: number } | null;
  captureState?: () => ViewerState | null;
  onRestoreState?: (s: ViewerState) => void;
};

export default function FeedbackPanel({ sessionId, currentParam, captureState, onRestoreState }: Props) {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [author, setAuthor] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("feedback_author") || "" : ""
  );
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachState, setAttachState] = useState(true); // 현재 상태(파라미터·시점) 첨부
  const [pwCache, setPwCache] = useState<string | null>(null); // 삭제 비번 1회 캐시

  async function deleteFeedback(fb: Feedback) {
    let pw = pwCache;
    if (pw) { if (!(await confirmDialog("이 코멘트를 삭제할까요?", { danger: true, okLabel: "삭제" }))) return; }
    else { pw = await promptDialog("코멘트 삭제", "", "비밀번호"); if (!pw) return; }
    const res = await fetch("/api/delete-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedbackId: fb.id, password: pw }),
    });
    if (res.status === 403) { setPwCache(null); toast("비밀번호가 틀렸어요", "error"); return; }
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast("삭제 실패: " + (j.error || ""), "error"); return; }
    setPwCache(pw);
    setFeedbacks((prev) => prev.filter((f) => f.id !== fb.id));
  }

  useEffect(() => {
    loadFeedbacks();

    // 실시간 구독 (켜져 있으면 다른 사람 코멘트도 즉시 반영 — 없어도 동작)
    const channel = supabase
      .channel(`feedback:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "feedback", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const fb = payload.new as Feedback;
          setFeedbacks((prev) => (prev.some((f) => f.id === fb.id) ? prev : [fb, ...prev]));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  async function loadFeedbacks() {
    const { data, error: err } = await supabase
      .from("feedback")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });
    if (err) { setError(err.message); return; }
    if (data) setFeedbacks(data);
  }

  async function send() {
    if (!author.trim() || !comment.trim() || sending) return;
    setSending(true);
    setError(null);
    localStorage.setItem("feedback_author", author);

    const base = {
      session_id: sessionId,
      author: author.trim(),
      comment: comment.trim(),
      param_name: currentParam?.id ?? null,
      param_value: currentParam?.value ?? null,
    };
    const snapshot = attachState ? captureState?.() ?? null : null;
    const payload: Record<string, unknown> = snapshot ? { ...base, state: snapshot } : { ...base };

    // state 컬럼 포함해 시도 → 컬럼이 없으면 빼고 재시도(그레이스풀)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let res = await supabase.from("feedback").insert(payload as any).select().single();

    if (res.error && snapshot && /state|column|schema|find/i.test(res.error.message)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res = await supabase.from("feedback").insert(base as any).select().single();
    }

    const { data, error: err } = res;
    if (err) {
      // 실제 오류 노출 (테이블/RLS 권한 문제 등 바로 파악 가능)
      setError(err.message || "전송에 실패했어요");
      setSending(false);
      return;
    }

    // 낙관적 추가 — 실시간 구독이 꺼져 있어도 바로 보이도록 (중복은 id 로 방지)
    if (data) {
      const fb = data as Feedback;
      setFeedbacks((prev) => (prev.some((f) => f.id === fb.id) ? prev : [fb, ...prev]));
    } else {
      await loadFeedbacks();
    }

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
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-[var(--purple)]" />
        <span className="text-sm font-semibold text-[var(--fg)]">피드백</span>
        <span className="ml-auto text-xs text-[var(--muted)] bg-white/5 px-2 py-0.5 rounded-full">{feedbacks.length}개</span>
      </div>

      {/* 피드백 목록 */}
      <div className="flex-1 overflow-y-auto chat-scroll p-3 space-y-2">
        {feedbacks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--muted)]">
            <MessageSquare className="w-8 h-8 opacity-40" />
            <p className="text-sm">아직 피드백이 없어요</p>
          </div>
        ) : (
          feedbacks.map((fb) => (
            <div key={fb.id} className="glass rounded-xl p-3 space-y-1.5 fade-up">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--purple)]">{fb.author}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--muted)] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {timeAgo(fb.created_at)}
                  </span>
                  <button onClick={() => deleteFeedback(fb)} className="text-[var(--muted)]/50 hover:text-red-400 p-0.5" title="코멘트 삭제">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              {fb.param_name && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] bg-[var(--purple)]/15 text-[var(--purple)] px-2 py-0.5 rounded-full font-mono">
                    {fb.param_name.replace("Param", "")}
                  </span>
                  <span className="text-[10px] text-[var(--muted)]">
                    = {fb.param_value?.toFixed(2)}
                  </span>
                </div>
              )}
              <p className="text-sm text-[var(--fg)]/90">{fb.comment}</p>
              {fb.state && onRestoreState && (
                <button
                  onClick={() => onRestoreState(fb.state as unknown as ViewerState)}
                  className="mt-1 inline-flex items-center gap-1 text-[10px] glass glass-hover px-2 py-1 rounded-md text-[var(--purple)]"
                  title="이 코멘트를 작성한 시점의 파라미터·시점으로 모델을 되돌립니다"
                >
                  <Eye className="w-3 h-3" /> 이 상태 보기
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* 입력 폼 */}
      <div className="p-3 border-t border-white/5 space-y-2">
        {error && (
          <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-2.5 py-1.5">
            전송 실패: {error}
          </div>
        )}
        {captureState && (
          <button
            onClick={() => setAttachState((v) => !v)}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] transition-all ${
              attachState ? "bg-[var(--purple)]/15 text-[var(--purple)]" : "glass glass-hover text-[var(--muted)]"
            }`}
            title="켜면 코멘트에 현재 파라미터·시점·줌 상태가 함께 저장돼, 나중에 '이 상태 보기'로 복원할 수 있어요"
          >
            <span className="flex items-center gap-1"><Camera className="w-3 h-3" /> 현재 상태 첨부</span>
            <span className={`px-1.5 py-0.5 rounded-full font-bold ${attachState ? "bg-[var(--purple)]/30" : "bg-white/10"}`}>
              {attachState ? "ON" : "OFF"}
            </span>
          </button>
        )}
        {currentParam && (
          <div className="text-[10px] text-[var(--muted)] px-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--purple)]" />
            <span className="text-[var(--purple)] font-mono">{currentParam.id.replace("Param", "")} = {currentParam.value.toFixed(2)}</span> 상태로 첨부됩니다
          </div>
        )}
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="이름"
          className="w-full glass rounded-lg px-3 py-2 text-xs placeholder-[var(--muted)]/60 outline-none focus:border-[var(--purple)]/50 transition-colors"
        />
        <div className="flex gap-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="피드백 내용... (Ctrl+Enter 전송)"
            rows={2}
            className="flex-1 glass rounded-lg px-3 py-2 text-xs placeholder-[var(--muted)]/60 outline-none resize-none focus:border-[var(--purple)]/50 transition-colors"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
            }}
          />
          <button
            onClick={send}
            disabled={sending || !author.trim() || !comment.trim()}
            className="bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] hover:opacity-90 disabled:opacity-40 rounded-lg px-3 self-stretch transition-all text-white"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
