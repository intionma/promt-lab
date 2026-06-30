"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const QUICK_PROMPTS = [
  "눈 깜빡임 파라미터 설정 방법",
  "입 모양 파라미터 범위 추천",
  "VBridger ARKit 블렌드쉐이프 최적 매핑",
  "디포머 계층 구조 모범 사례",
  "물리 설정으로 머리카락 흔들림",
  "VTS 핫키로 표현식 전환",
];

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("## "))
          return (
            <p key={i} className="font-bold text-purple-300 text-sm mt-2">
              {line.slice(3)}
            </p>
          );
        if (line.startsWith("# "))
          return (
            <p key={i} className="font-bold text-purple-200 mt-2">
              {line.slice(2)}
            </p>
          );
        if (line.startsWith("- ") || line.startsWith("* "))
          return (
            <p key={i} className="text-sm pl-2 before:content-['•'] before:mr-2 before:text-purple-400">
              {renderInline(line.slice(2))}
            </p>
          );
        if (/^\d+\./.test(line))
          return (
            <p key={i} className="text-sm pl-2">
              {renderInline(line)}
            </p>
          );
        if (line === "") return <div key={i} className="h-1" />;
        return (
          <p key={i} className="text-sm">
            {renderInline(line)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return (
        <strong key={i} className="text-purple-300 font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="bg-purple-900/40 px-1 rounded text-cyan-300 text-xs">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

export default function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: full };
          return updated;
        });
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "오류가 발생했습니다. API 키를 확인해주세요.",
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          <div className="text-center space-y-2">
            <div className="text-4xl">🎭</div>
            <h2 className="text-xl font-semibold text-purple-300">
              VTuber 리깅 AI 어시스턴트
            </h2>
            <p className="text-sm text-slate-400">
              Live2D · VTube Studio · VBridger 관련 무엇이든 물어보세요
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                className="glass glass-hover rounded-lg p-3 text-left text-xs text-slate-300 transition-all cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-purple-400 mb-1" />
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "user"
                    ? "bg-purple-600"
                    : "bg-gradient-to-br from-pink-500 to-purple-600"
                }`}
              >
                {msg.role === "user" ? (
                  <User className="w-4 h-4 text-white" />
                ) : (
                  <Bot className="w-4 h-4 text-white" />
                )}
              </div>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-purple-600/30 border border-purple-500/30 text-sm"
                    : "glass text-slate-200"
                }`}
              >
                {msg.role === "assistant" && msg.content === "" ? (
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                ) : msg.role === "assistant" ? (
                  <MarkdownText text={msg.content} />
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="p-4 border-t border-white/10">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="리깅 관련 질문을 입력하세요..."
            className="flex-1 glass rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-purple-500/50 transition-all"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl px-4 py-3 transition-all"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
