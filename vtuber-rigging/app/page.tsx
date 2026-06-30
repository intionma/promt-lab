"use client";

import { useState } from "react";
import { MessageSquare, Sliders, GitBranch, Settings } from "lucide-react";
import dynamic from "next/dynamic";
import ChatBot from "./components/ChatBot";
import ParamCalculator from "./components/ParamCalculator";

const DeformerTree = dynamic(() => import("./components/DeformerTree"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
      시각화 로딩 중...
    </div>
  ),
});

type Tab = "chat" | "params" | "deformer";

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "AI 어시스턴트", icon: MessageSquare },
  { id: "params", label: "파라미터", icon: Sliders },
  { id: "deformer", label: "디포머 계층", icon: GitBranch },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 glass flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg glow">
            🎭
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-200">
              VTuber Rigging Assistant
            </h1>
            <p className="text-[10px] text-slate-500">
              Live2D · VTube Studio · VBridger
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* API Key indicator */}
          <div
            className={`w-2 h-2 rounded-full ${
              process.env.NEXT_PUBLIC_HAS_API_KEY === "true" || apiKey
                ? "bg-green-500"
                : "bg-yellow-500"
            }`}
            title={apiKey ? "API 키 설정됨" : "API 키 없음"}
          />
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="glass glass-hover p-2 rounded-lg transition-all"
          >
            <Settings className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <div className="glass border-b border-white/10 px-4 py-3 flex gap-2 items-center flex-shrink-0">
          <label className="text-xs text-slate-400 whitespace-nowrap">
            Anthropic API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            className="flex-1 glass rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none"
          />
          <p className="text-[10px] text-slate-500 whitespace-nowrap">
            환경변수로도 설정 가능 (ANTHROPIC_API_KEY)
          </p>
        </div>
      )}

      {/* Tabs */}
      <nav className="flex gap-1 px-4 pt-2 flex-shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-purple-600/20 border border-purple-500/30 border-b-transparent text-purple-300"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <main className="flex-1 glass border border-white/10 mx-4 mb-4 rounded-b-xl rounded-tr-xl overflow-hidden flex flex-col">
        {activeTab === "chat" && <ChatBot />}
        {activeTab === "params" && <ParamCalculator />}
        {activeTab === "deformer" && <DeformerTree />}
      </main>
    </div>
  );
}
