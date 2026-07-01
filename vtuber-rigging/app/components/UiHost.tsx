"use client";
// 앱 내부 알림/입력/확인을 렌더 (layout 에 1개 마운트). 브라우저 팝업 대체.
import { useEffect, useReducer, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";
import { subscribeUi, getUiState, dismissToast, resolvePrompt, resolveConfirm } from "@/lib/ui";

export default function UiHost() {
  const [, force] = useReducer((x) => x + 1, 0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => subscribeUi(force), []);
  if (!mounted) return null;

  const { toasts, promptReq, confirmReq } = getUiState();

  return createPortal(
    <>
      {/* 토스트 스택 (하단 중앙) */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none w-full max-w-sm px-4">
        {toasts.map((t) => {
          const Icon = t.type === "error" ? AlertCircle : t.type === "success" ? CheckCircle : Info;
          const color = t.type === "error" ? "text-red-400" : t.type === "success" ? "text-emerald-400" : "text-[var(--purple)]";
          return (
            <div key={t.id} className="pointer-events-auto w-full rounded-xl px-3.5 py-2.5 flex items-start gap-2 shadow-2xl fade-up" style={{ backgroundColor: "var(--bg-soft)", border: "1px solid rgba(255,255,255,.1)" }}>
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
              <span className="text-[12px] text-[var(--fg)] leading-snug flex-1 whitespace-pre-wrap break-words">{t.msg}</span>
              <button onClick={() => dismissToast(t.id)} className="text-[var(--muted)] hover:text-[var(--fg)] shrink-0"><X className="w-3.5 h-3.5" /></button>
            </div>
          );
        })}
      </div>

      {/* 입력 다이얼로그 */}
      {promptReq && <PromptModal key={promptReq.id} title={promptReq.title} defaultValue={promptReq.defaultValue} placeholder={promptReq.placeholder} />}

      {/* 확인 다이얼로그 */}
      {confirmReq && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[210] p-4" onClick={() => resolveConfirm(false)}>
          <div className="glass-strong rounded-2xl p-5 w-full max-w-xs space-y-4 fade-up" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-[var(--fg)]">{confirmReq.title}</p>
            {confirmReq.message && <p className="text-xs text-[var(--muted)] whitespace-pre-wrap leading-relaxed">{confirmReq.message}</p>}
            <div className="flex gap-2">
              <button onClick={() => resolveConfirm(false)} className="flex-1 glass glass-hover rounded-xl py-2.5 text-sm text-[var(--muted)]">취소</button>
              <button onClick={() => resolveConfirm(true)} className={`flex-1 rounded-xl py-2.5 text-sm text-white transition-all ${confirmReq.danger ? "bg-red-600 hover:bg-red-500" : "bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] hover:opacity-90"}`}>
                {confirmReq.okLabel ?? "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}

function PromptModal({ title, defaultValue, placeholder }: { title: string; defaultValue: string; placeholder?: string }) {
  const [val, setVal] = useState(defaultValue);
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[210] p-4" onClick={() => resolvePrompt(null)}>
      <div className="glass-strong rounded-2xl p-5 w-full max-w-xs space-y-3.5 fade-up" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-[var(--fg)] whitespace-pre-wrap">{title}</p>
        <input
          autoFocus
          value={val}
          placeholder={placeholder}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") resolvePrompt(val); else if (e.key === "Escape") resolvePrompt(null); }}
          className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-black/25 border border-white/15 outline-none focus:border-[var(--purple)]/60 text-[var(--fg)]"
        />
        <div className="flex gap-2">
          <button onClick={() => resolvePrompt(null)} className="flex-1 glass glass-hover rounded-xl py-2.5 text-sm text-[var(--muted)]">취소</button>
          <button onClick={() => resolvePrompt(val)} className="flex-1 bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] hover:opacity-90 rounded-xl py-2.5 text-sm text-white transition-all">확인</button>
        </div>
      </div>
    </div>
  );
}
