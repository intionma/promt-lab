"use client";

import { useState } from "react";
import { Upload, Sliders, GitBranch, Boxes, HardDrive } from "lucide-react";
import dynamic from "next/dynamic";
import UploadSession from "./components/UploadSession";
import MyModels from "./components/MyModels";
import ParamCalculator from "./components/ParamCalculator";
import DriveTab from "./components/DriveTab";
import { APP_VERSION, APP_UPDATED_AT } from "@/lib/version";

const DeformerTree = dynamic(() => import("./components/DeformerTree"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-[var(--muted)] text-sm">
      로딩 중...
    </div>
  ),
});

type Tab = "upload" | "models" | "params" | "deformer" | "drive";

const TABS: { id: Tab; label: string; icon: typeof Upload }[] = [
  { id: "upload", label: "리뷰 공유", icon: Upload },
  { id: "models", label: "모델 갤러리", icon: Boxes },
  { id: "drive", label: "드라이브", icon: HardDrive },
  { id: "params", label: "파라미터", icon: Sliders },
  { id: "deformer", label: "디포머", icon: GitBranch },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");

  return (
    <div className="min-h-screen flex flex-col items-center py-4 sm:py-6 px-3 sm:px-4">
      <div
        className="w-full max-w-2xl flex flex-col"
        style={{ height: "calc(100dvh - 2rem)" }}
      >
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 glass-strong rounded-2xl flex-shrink-0 fade-up">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--purple-deep)] to-[var(--pink)] flex items-center justify-center text-lg glow shrink-0">
            🎭
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold text-[var(--fg)] truncate">
                VTuber Rigging <span className="gradient-text">Assistant</span>
              </h1>
              <span className="text-[9px] font-mono text-[var(--purple)] bg-[var(--purple)]/15 px-1.5 py-0.5 rounded-full shrink-0">
                {APP_VERSION}
              </span>
            </div>
            <p className="text-[10px] text-[var(--muted)] truncate">
              Live2D · VTube Studio · VBridger
            </p>
            <p className="text-[8px] text-[var(--muted)]/50 truncate mt-0.5">
              업데이트 {APP_UPDATED_AT}
            </p>
          </div>
        </header>

        {/* Tabs */}
        <nav className="flex gap-1 p-1 mt-3 glass rounded-2xl flex-shrink-0 fade-up">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  active
                    ? "bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] text-white shadow-lg shadow-purple-900/40"
                    : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-white/5"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <main className="flex-1 glass rounded-2xl overflow-hidden flex flex-col min-h-0 mt-3 fade-up">
          <div className={activeTab === "upload" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
            <UploadSession />
          </div>
          {activeTab === "models" && <MyModels />}
          {activeTab === "drive" && <DriveTab />}
          {activeTab === "params" && <ParamCalculator />}
          {activeTab === "deformer" && <DeformerTree />}
        </main>
      </div>
    </div>
  );
}
