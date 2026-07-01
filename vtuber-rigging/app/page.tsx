"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Upload, Sliders, GitBranch, Boxes, HardDrive, EyeOff, Eye, Shield, ShieldCheck, X, Menu, ChevronDown } from "lucide-react";
import dynamic from "next/dynamic";
import { getSilhouettePref, setSilhouettePref } from "@/lib/prefs";
import { useAdmin, useAdminRemaining, startAdmin, stopAdmin, fmtRemain } from "@/lib/admin";

// 남은 시간만 매초 갱신 (헤더 버튼만 리렌더 → 페이지 전체 리렌더 방지)
function AdminCountdown() {
  const ms = useAdminRemaining();
  return <span className="text-[8px] font-semibold leading-none tabular-nums">{fmtRemain(ms)}</span>;
}
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

type TabDef = { id: Tab; label: string; icon: typeof Upload };
// 주요 탭 2개만 노출, 나머지는 햄버거(더보기)로 정리
const PRIMARY_TABS: TabDef[] = [
  { id: "upload", label: "리뷰 공유", icon: Upload },
  { id: "models", label: "모델 갤러리", icon: Boxes },
];
const MORE_TABS: TabDef[] = [
  { id: "drive", label: "드라이브", icon: HardDrive },
  { id: "params", label: "파라미터", icon: Sliders },
  { id: "deformer", label: "디포머", icon: GitBranch },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  // 관리자 모드 (10분) — 삭제·이동·이름수정 잠금 해제 + 드라이브 접근
  const admin = useAdmin();
  // 드라이브는 관리자일 때만 메뉴에 노출
  const visibleMoreTabs = admin.active ? MORE_TABS : MORE_TABS.filter((t) => t.id !== "drive");
  const moreActive = visibleMoreTabs.find((t) => t.id === activeTab);
  const MoreIcon = moreActive?.icon ?? Menu;
  useEffect(() => { setMounted(true); }, []);
  // 관리자 모드가 꺼지면 드라이브 탭에서 자동으로 빠져나옴
  useEffect(() => {
    if (!admin.active && activeTab === "drive") setActiveTab("models");
  }, [admin.active, activeTab]);
  function toggleMore() {
    if (!moreOpen && moreBtnRef.current) {
      const r = moreBtnRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    }
    setMoreOpen((o) => !o);
  }
  // 실루엣 사전 설정 — 리뷰에 들어가기 전에 미리 켜두면, 모델이 처음부터 실루엣으로 열림
  const [silhouette, setSilhouette] = useState(false);
  useEffect(() => { setSilhouette(getSilhouettePref().on); }, []);
  function toggleSilhouette() {
    const next = !silhouette;
    setSilhouette(next);
    setSilhouettePref(next, getSilhouettePref().color);
  }

  const [adminModal, setAdminModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [verifying, setVerifying] = useState(false);
  async function submitPin() {
    if (verifying || !pinInput) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/verify-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pinInput }),
      });
      if (!res.ok) { setPinError(true); return; }
      startAdmin(pinInput);
      setAdminModal(false);
      setPinInput("");
      setPinError(false);
    } catch {
      setPinError(true);
    } finally {
      setVerifying(false);
    }
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
          {/* 실루엣 사전 설정 — 리뷰 들어가기 전에 미리 켜두면, 열 때부터 실루엣으로 보임 */}
          <button
            onClick={toggleSilhouette}
            title={silhouette
              ? "실루엣 켜짐 — 모든 리뷰가 그림 없이 실루엣으로 열립니다 (끄려면 클릭)"
              : "리뷰를 열 때 처음부터 실루엣(단색 형체)으로 보이게 — 회사 등에서 미리 켜두세요"}
            className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl shrink-0 transition-all ${
              silhouette
                ? "bg-[var(--purple)] text-white shadow-lg shadow-[var(--purple)]/30"
                : "glass glass-hover text-[var(--muted)]"
            }`}
          >
            {silhouette ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="text-[8px] font-semibold leading-none">{silhouette ? "실루엣 ON" : "실루엣"}</span>
          </button>
          {/* 관리자 모드 (10분) — 삭제·이동·이름수정 잠금 해제 */}
          {admin.active ? (
            <button
              onClick={stopAdmin}
              title="관리자 모드 켜짐 — 눌러서 끄기"
              className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl shrink-0 bg-emerald-500/90 text-white shadow-lg shadow-emerald-500/30 transition-all"
            >
              <ShieldCheck className="w-4 h-4" />
              <AdminCountdown />
            </button>
          ) : (
            <button
              onClick={() => { setAdminModal(true); setPinInput(""); setPinError(false); }}
              title="관리자 모드 — PIN 입력 시 10분간 삭제·이동·이름수정 가능"
              className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl shrink-0 glass glass-hover text-[var(--muted)] transition-all"
            >
              <Shield className="w-4 h-4" />
              <span className="text-[8px] font-semibold leading-none">관리자</span>
            </button>
          )}
        </header>

        {/* Tabs — 주요 2개 + 더보기(햄버거) */}
        <nav className="flex gap-1 p-1 mt-3 glass rounded-2xl flex-shrink-0 fade-up">
          {PRIMARY_TABS.map((tab) => {
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

          {/* 더보기 (드라이브 / 파라미터 / 디포머) */}
          <button
            ref={moreBtnRef}
            onClick={toggleMore}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
              moreActive
                ? "bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] text-white shadow-lg shadow-purple-900/40"
                : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-white/5"
            }`}
          >
            <MoreIcon className="w-4 h-4 shrink-0" />
            <span className="truncate">{moreActive ? moreActive.label : "더보기"}</span>
            <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
          </button>
        </nav>

        {/* 더보기 드롭다운 — 불투명 배경 + body 포탈(스택/투명 문제 방지) */}
        {mounted && moreOpen && menuPos && createPortal(
          <>
            <div className="fixed inset-0 z-[90]" onClick={() => setMoreOpen(false)} />
            <div
              className="fixed z-[100] w-44 rounded-xl p-1 border border-white/10 shadow-2xl"
              style={{ top: menuPos.top, right: menuPos.right, backgroundColor: "var(--bg-soft)" }}
            >
              {visibleMoreTabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); setMoreOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                      active ? "bg-[var(--purple)]/25 text-[var(--purple)]" : "text-[var(--fg)] hover:bg-white/10"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </>,
          document.body
        )}

        {/* Content */}
        <main className="flex-1 glass rounded-2xl overflow-hidden flex flex-col min-h-0 mt-3 fade-up">
          <div className={activeTab === "upload" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
            <UploadSession />
          </div>
          {activeTab === "models" && <MyModels adminPin={admin.active ? admin.pin : null} />}
          {activeTab === "drive" && admin.active && <DriveTab />}
          {activeTab === "params" && <ParamCalculator />}
          {activeTab === "deformer" && <DeformerTree />}
        </main>
      </div>

      {/* 관리자 PIN 모달 */}
      {adminModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setAdminModal(false)}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-xs space-y-4 fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-emerald-400" />
                </div>
                <span className="text-sm font-semibold">관리자 모드</span>
              </div>
              <button onClick={() => setAdminModal(false)} className="text-[var(--muted)] hover:text-[var(--fg)]"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-[var(--muted)]">PIN을 입력하면 <span className="text-[var(--fg)]">10분간</span> 삭제·이동·이름수정을 비밀번호 없이 할 수 있어요.</p>
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") submitPin(); }}
              placeholder="PIN"
              autoFocus
              className={`w-full glass rounded-xl px-4 py-3 text-sm text-center tracking-widest outline-none ${pinError ? "border border-red-500/50" : ""}`}
            />
            {pinError && <p className="text-xs text-red-400">PIN이 틀렸어요</p>}
            <div className="flex gap-2">
              <button onClick={() => setAdminModal(false)} className="flex-1 glass glass-hover rounded-xl py-2.5 text-sm text-[var(--muted)]">취소</button>
              <button onClick={submitPin} disabled={verifying || !pinInput} className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded-xl py-2.5 text-sm text-white transition-all disabled:opacity-60">
                {verifying ? "확인 중..." : "관리자 모드 켜기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
