"use client";

import { Play, Square, Smile, Sparkles, Image as ImageIcon, Link2, Check, Pause, RotateCcw } from "lucide-react";
import { useState } from "react";
import { BG_OPTIONS, type ModelMeta } from "./ModelViewer";

type Props = {
  meta: ModelMeta | null;
  autoIdle: boolean;
  bgKey: string;
  onPlayMotion: (group: string, index: number) => void;
  onPlayExpression: (name: string) => void;
  onStop: () => void;
  onToggleIdle: (on: boolean) => void;
  onSetBg: (key: string) => void;
  onCopyStateLink: () => void;
  onFreeze: () => void;
  onReset: () => void;
};

export default function ProductionPanel({
  meta,
  autoIdle,
  bgKey,
  onPlayMotion,
  onPlayExpression,
  onStop,
  onToggleIdle,
  onSetBg,
  onCopyStateLink,
  onFreeze,
  onReset,
}: Props) {
  const [copied, setCopied] = useState(false);
  const hasMotions = !!meta && meta.motions.length > 0;
  const hasExpr = !!meta && meta.expressions.length > 0;

  function copyLink() {
    onCopyStateLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto chat-scroll p-3 gap-4">
      {/* 멈춤 / 초기화 */}
      <div className="flex gap-2">
        <button
          onClick={onFreeze}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg glass glass-hover text-[11px] font-medium text-[var(--fg)]"
          title="모션·아이들을 끄고 파라미터를 기본값으로 — 기본 포즈로 정지"
        >
          <Pause className="w-3.5 h-3.5" /> 움직임 멈춤
        </button>
        <button
          onClick={onReset}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg glass glass-hover text-[11px] font-medium text-[var(--muted)]"
          title="배경·아이들·모션·파라미터를 모두 기본 상태로 되돌립니다"
        >
          <RotateCcw className="w-3.5 h-3.5" /> 연출 초기화
        </button>
      </div>

      {/* 모션 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--fg)]">
            <Play className="w-3.5 h-3.5 text-[var(--purple)]" /> 모션
          </div>
          {hasMotions && (
            <button
              onClick={onStop}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] glass glass-hover text-[var(--muted)]"
            >
              <Square className="w-2.5 h-2.5" /> 정지
            </button>
          )}
        </div>
        {hasMotions ? (
          <div className="space-y-2">
            {meta!.motions.map((m) => (
              <div key={m.group} className="space-y-1">
                <p className="text-[10px] text-[var(--muted)]">{m.group}</p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: m.count }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => onPlayMotion(m.group, i)}
                      className="px-2.5 py-1 rounded-lg text-[11px] glass glass-hover text-[var(--fg)]"
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-[var(--muted)]/70">이 모델엔 모션 파일이 없어요</p>
        )}
      </section>

      {/* 표정 */}
      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--fg)]">
          <Smile className="w-3.5 h-3.5 text-[var(--purple)]" /> 표정
        </div>
        {hasExpr ? (
          <div className="flex flex-wrap gap-1.5">
            {meta!.expressions.map((name) => (
              <button
                key={name}
                onClick={() => onPlayExpression(name)}
                className="px-2.5 py-1 rounded-lg text-[11px] glass glass-hover text-[var(--fg)]"
              >
                {name}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-[var(--muted)]/70">이 모델엔 표정 파일이 없어요</p>
        )}
      </section>

      {/* 자동 연출 */}
      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--fg)]">
          <Sparkles className="w-3.5 h-3.5 text-[var(--purple)]" /> 자동 연출
        </div>
        <button
          onClick={() => onToggleIdle(!autoIdle)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[11px] transition-all ${
            autoIdle ? "bg-[var(--purple)]/15 text-[var(--purple)]" : "glass glass-hover text-[var(--muted)]"
          }`}
        >
          <span>자동 깜빡임 · 호흡</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${autoIdle ? "bg-[var(--purple)]/30" : "bg-white/10"}`}>
            {autoIdle ? "ON" : "OFF"}
          </span>
        </button>
      </section>

      {/* 배경 */}
      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--fg)]">
          <ImageIcon className="w-3.5 h-3.5 text-[var(--purple)]" /> 배경
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {BG_OPTIONS.map((b) => (
            <button
              key={b.key}
              onClick={() => onSetBg(b.key)}
              className={`flex flex-col items-center gap-1 py-1.5 rounded-lg border transition-all ${
                bgKey === b.key ? "border-[var(--purple)]" : "border-white/10 hover:border-white/25"
              }`}
            >
              <span
                className="w-7 h-5 rounded"
                style={{
                  background: b.key === "transparent"
                    ? "repeating-conic-gradient(#888 0% 25%, #444 0% 50%) 50%/8px 8px"
                    : b.css,
                }}
              />
              <span className="text-[9px] text-[var(--muted)]">{b.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 상태 공유 */}
      <section className="space-y-2 pt-1">
        <button
          onClick={copyLink}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] text-white text-[11px] font-medium"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
          {copied ? "링크 복사됨!" : "현재 상태 링크 복사"}
        </button>
        <p className="text-[9px] text-[var(--muted)]/70 text-center">
          파라미터·시점·줌·얼굴반응 상태를 링크로 공유해요
        </p>
      </section>
    </div>
  );
}
