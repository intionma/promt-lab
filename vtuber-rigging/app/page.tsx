"use client";

import { useState } from "react";
import { Upload, Sliders, GitBranch, Boxes } from "lucide-react";
import dynamic from "next/dynamic";
import UploadSession from "./components/UploadSession";
import MyModels from "./components/MyModels";
import ParamCalculator from "./components/ParamCalculator";

const DeformerTree = dynamic(() => import("./components/DeformerTree"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
      로딩 중...
    </div>
  ),
});

type Tab = "upload" | "models" | "params" | "deformer";

const TABS: { id: Tab; label: string; icon: typeof Upload }[] = [
  { id: "upload", label: "리뷰 공유", icon: Upload },
  { id: "models", label: "내 모델", icon: Boxes },
  { id: "params", label: "파라미터", icon: Sliders },
  { id: "deformer", label: "디포머 계층", icon: GitBranch },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");

  return (
    <div className="min-h-screen flex flex-col items-center py-6 px-4">
      <div className="w-full max-w-2xl flex flex-col" style={{ height: "calc(100vh - 3rem)" }}>
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10 glass rounded-t-xl flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg glow">
            🎭
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-200">VTuber Rigging Assistant</h1>
            <p className="text-[10px] text-slate-500">Live2D · VTube Studio · VBridger</p>
          </div>
        </header>

        {/* Tabs */}
        <nav className="flex gap-1 px-4 pt-2 flex-shrink-0 bg-transparent">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm font-medium transition-all ${
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
        <main className="flex-1 glass border border-white/10 rounded-b-xl rounded-tr-xl overflow-hidden flex flex-col min-h-0">
          {/* 업로드 탭은 항상 마운트 유지 — 탭 전환해도 선택한 파일이 유지됨 */}
          <div className={activeTab === "upload" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
            <UploadSession />
          </div>
          {activeTab === "models" && <MyModels />}
          {activeTab === "params" && <ParamCalculator />}
          {activeTab === "deformer" && <DeformerTree />}
        </main>
      </div>
    </div>
  );
}
