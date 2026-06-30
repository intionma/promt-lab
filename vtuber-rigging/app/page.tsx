"use client";

import { useState, useEffect } from "react";
import { Upload, Sliders, GitBranch, Boxes, Lock, LogOut, X } from "lucide-react";
import dynamic from "next/dynamic";
import UploadSession from "./components/UploadSession";
import MyModels from "./components/MyModels";
import ParamCalculator from "./components/ParamCalculator";
import { hashPin, getOwnerHash, setOwnerHash, clearOwnerHash } from "@/lib/supabase";
import { APP_VERSION, APP_UPDATED_AT } from "@/lib/version";

const DeformerTree = dynamic(() => import("./components/DeformerTree"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-[var(--muted)] text-sm">
      로딩 중...
    </div>
  ),
});

type Tab = "upload" | "models" | "params" | "deformer";

const TABS: { id: Tab; label: string; icon: typeof Upload }[] = [
  { id: "upload", label: "리뷰 공유", icon: Upload },
  { id: "models", label: "내 모델", icon: Boxes },
  { id: "params", label: "파라미터", icon: Sliders },
  { id: "deformer", label: "디포머", icon: GitBranch },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [ownerHash, setOwnerHashState] = useState<string | null>(null);
  const [pinModal, setPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");

  useEffect(() => {
    setOwnerHashState(getOwnerHash());
  }, []);

  async function savePin() {
    if (pinInput.trim().length < 4) return;
    const h = await hashPin(pinInput.trim());
    setOwnerHash(h);
    setOwnerHashState(h);
    setPinInput("");
    setPinModal(false);
  }

  function logout() {
    clearOwnerHash();
    setOwnerHashState(null);
  }

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

          {/* PIN 상태 */}
          {ownerHash ? (
            <button
              onClick={logout}
              className="flex items-center gap-1.5 glass glass-hover rounded-full px-3 py-1.5 text-xs text-[var(--purple)] shrink-0"
              title="PIN 로그아웃"
            >
              <Lock className="w-3 h-3" />
              <span className="hidden sm:inline">로그인됨</span>
              <LogOut className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={() => setPinModal(true)}
              className="flex items-center gap-1.5 glass glass-hover rounded-full px-3 py-1.5 text-xs text-[var(--muted)] shrink-0"
            >
              <Lock className="w-3 h-3" />
              PIN 설정
            </button>
          )}
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
            <UploadSession ownerHash={ownerHash} onRequestPin={() => setPinModal(true)} />
          </div>
          {activeTab === "models" && (
            <MyModels ownerHash={ownerHash} onRequestPin={() => setPinModal(true)} />
          )}
          {activeTab === "params" && <ParamCalculator />}
          {activeTab === "deformer" && <DeformerTree />}
        </main>
      </div>

      {/* PIN 모달 */}
      {pinModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setPinModal(false)}
        >
          <div
            className="glass-strong rounded-2xl p-6 w-full max-w-xs space-y-4 fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[var(--purple-deep)]/30 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-[var(--purple)]" />
                </div>
                <span className="text-sm font-semibold">PIN 입력</span>
              </div>
              <button onClick={() => setPinModal(false)} className="text-[var(--muted)] hover:text-[var(--fg)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              PIN을 입력하면 어느 기기에서든 내가 올린 모델을 모아볼 수 있어요. PIN은 암호화(SHA-256)되어 저장돼요.
            </p>
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") savePin(); }}
              placeholder="PIN (4자리 이상)"
              autoFocus
              className="w-full glass rounded-xl px-4 py-3 text-sm text-center tracking-[0.3em] outline-none focus:border-[var(--purple)]/50"
            />
            <button
              onClick={savePin}
              disabled={pinInput.trim().length < 4}
              className="w-full bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] disabled:opacity-40 rounded-xl py-3 text-sm font-medium text-white transition-all"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
