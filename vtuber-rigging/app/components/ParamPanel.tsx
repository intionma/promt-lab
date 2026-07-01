"use client";

import { useState, useRef, useMemo } from "react";
import { ChevronDown, ChevronRight, Search, Zap, Crosshair, X, Plus } from "lucide-react";
import type { Param } from "./ModelViewer";

type Props = {
  params: Param[];
  overrideIds: Set<string>;
  sweepOn: boolean;
  onChange: (id: string, value: number) => void;
  onRelease: (id: string) => void;
  onResetAll: () => void;
  onToggleSweep: (on: boolean) => void;
};

const PRIMARY_IDS = new Set([
  "ParamAngleX", "ParamAngleY", "ParamAngleZ",
  "ParamEyeBallX", "ParamEyeBallY",
  "ParamEyeLOpen", "ParamEyeROpen",
  "ParamEyeLSmile", "ParamEyeRSmile",
  "ParamBrowLY", "ParamBrowRY", "ParamBrowLForm", "ParamBrowRForm",
  "ParamMouthOpenY", "ParamMouthForm", "ParamMouthX",
  "ParamCheekPuff", "ParamCheekPuffC",
  "ParamBodyAngleX", "ParamBodyAngleY", "ParamBodyAngleZ",
  "ParamBreath",
]);

// Cubism 표준 결합(2D) 프리셋 — 두 파라미터가 모두 있으면 버튼 노출
const COMBO_PRESETS = [
  { label: "얼굴 각도 XY", xId: "ParamAngleX", yId: "ParamAngleY" },
  { label: "눈알 XY", xId: "ParamEyeBallX", yId: "ParamEyeBallY" },
  { label: "몸 각도 XY", xId: "ParamBodyAngleX", yId: "ParamBodyAngleY" },
];

const short = (id: string) => id.replace("Param", "");
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

type Combo = { id: string; xId: string; yId: string; label: string };

// ── 2D 결합 패드 ──────────────────────────────────────────────────────────
function ComboPad({
  combo, xP, yP, onChange, onRemove,
}: {
  combo: Combo;
  xP: Param;
  yP: Param;
  onChange: (id: string, value: number) => void;
  onRemove: () => void;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const nx = clamp01((xP.value - xP.min) / (xP.max - xP.min || 1));   // 0..1 (좌→우)
  const ny = clamp01((yP.value - yP.min) / (yP.max - yP.min || 1));   // 0..1 (아래→위)

  function setFromPointer(clientX: number, clientY: number) {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clamp01((clientX - rect.left) / rect.width);
    const py = clamp01((clientY - rect.top) / rect.height);
    onChange(xP.id, xP.min + px * (xP.max - xP.min));
    onChange(yP.id, yP.min + (1 - py) * (yP.max - yP.min)); // 위=최대(Cubism 관례)
  }

  return (
    <div className="glass rounded-xl p-2.5 space-y-2">
      <div className="flex items-center gap-1.5">
        <Crosshair className="w-3.5 h-3.5 text-[var(--purple)] shrink-0" />
        <span className="text-[11px] font-semibold text-[var(--fg)] truncate">{combo.label}</span>
        <button onClick={onRemove} title="결합 해제" className="ml-auto p-1 rounded-md text-[var(--muted)] hover:text-red-400 hover:bg-white/5 shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex gap-2">
        {/* 세로축(Y) 라벨 */}
        <div className="flex flex-col justify-between items-center py-1">
          <span className="text-[8px] text-[var(--muted)] rotate-180" style={{ writingMode: "vertical-rl" }}>{short(yP.id)}</span>
        </div>

        <div
          ref={padRef}
          onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); setFromPointer(e.clientX, e.clientY); }}
          onPointerMove={(e) => { if (dragging.current) setFromPointer(e.clientX, e.clientY); }}
          onPointerUp={(e) => { dragging.current = false; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ } }}
          onPointerCancel={() => { dragging.current = false; }}
          className="relative flex-1 aspect-square rounded-lg bg-black/25 border border-white/10 cursor-crosshair touch-none overflow-hidden"
          style={{ touchAction: "none" }}
        >
          {/* 격자·중심선 */}
          <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
          {/* 이동 점 */}
          <div
            className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-[var(--purple)] border-2 border-white shadow-lg shadow-[var(--purple)]/40 pointer-events-none"
            style={{ left: `${nx * 100}%`, top: `${(1 - ny) * 100}%` }}
          />
        </div>
      </div>

      {/* 가로축(X) 라벨 + 값 */}
      <div className="flex items-center justify-between text-[9px] text-[var(--muted)] pl-5">
        <span>{short(xP.id)}: <span className="text-[var(--purple)] font-mono">{xP.value.toFixed(2)}</span></span>
        <span>{short(yP.id)}: <span className="text-[var(--purple)] font-mono">{yP.value.toFixed(2)}</span></span>
      </div>
    </div>
  );
}

// 스냅 지점(끝값·중앙0)에 머무르거나 우클릭하면 그 값으로 이동 — Cubism 처럼.
const SNAP_FRAC = 0.05; // 근처 판정: 범위의 5%
const HOLD_MS = 1000;   // 모바일: 잡은 채 1초 유지하면 스냅

function Slider({
  p, isFixed, onChange, onRelease,
}: {
  p: Param;
  isFixed: boolean;
  onChange: (id: string, value: number) => void;
  onRelease: (id: string) => void;
}) {
  const range = p.max - p.min || 1;
  const pct = ((p.value - p.min) / range) * 100;

  // 끝값(min·max) + 범위에 0이 들어오면 중앙(0)
  const snaps = useMemo(() => {
    const arr: { v: number; pos: number; label: string }[] = [
      { v: p.min, pos: 0, label: "최소" },
      { v: p.max, pos: 100, label: "최대" },
    ];
    if (p.min < 0 && p.max > 0) arr.push({ v: 0, pos: ((0 - p.min) / range) * 100, label: "중앙(0)" });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.min, p.max]);

  const inputRef = useRef<HTMLInputElement>(null);
  const holdTimer = useRef<number | null>(null);
  const holdTarget = useRef<number | null>(null);
  const locked = useRef(false); // 스냅 후 손 뗄 때까지 true → 값이 손가락을 안 따라감(터치 놓임)

  function clearHold() {
    if (holdTimer.current != null) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    holdTarget.current = null;
  }
  function endHold() { clearHold(); locked.current = false; }

  function handleValue(v: number) {
    if (locked.current) return; // 스냅 잠금 중엔 무시
    onChange(p.id, v);
    // 모바일: 스냅 근처에 1초 이상 머무르면 그 값으로 고정
    const near = snaps.find((s) => Math.abs(v - s.v) <= range * SNAP_FRAC);
    if (near) {
      if (holdTarget.current !== near.v) {
        clearHold();
        holdTarget.current = near.v;
        holdTimer.current = window.setTimeout(() => {
          onChange(p.id, near.v);       // 정확히 그 값으로
          locked.current = true;         // 이동 완료 → 터치 놓임
          clearHold();
          inputRef.current?.blur();
        }, HOLD_MS);
      }
    } else {
      clearHold();
    }
  }

  // PC: 트랙에서 우클릭 → 가까운 스냅 지점 값으로 이동
  function onContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const near = snaps.find((s) => Math.abs(xPct - s.pos) <= 8);
    if (near) { e.preventDefault(); onChange(p.id, near.v); }
  }

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-center">
        <button
          onClick={() => isFixed && onRelease(p.id)}
          className="text-[11px] text-[var(--muted)] truncate max-w-[160px] flex items-center gap-1 text-left"
          title={isFixed ? `${p.id} — 클릭하면 고정 해제` : p.id}
        >
          {isFixed && <span className="w-1.5 h-1.5 rounded-full bg-pink-400 flex-shrink-0" />}
          {short(p.id)}
        </button>
        <span className="text-[10px] text-[var(--purple)] font-mono">{p.value.toFixed(2)}</span>
      </div>
      <div className="relative h-6 flex items-center" onContextMenu={onContextMenu}>
        <div className="absolute inset-x-0 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-purple-600 to-pink-500 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        {/* 스냅 점 (끝값·중앙0) — PC는 우클릭, 모바일은 근처 1초 유지 */}
        {snaps.map((s) => {
          const active = Math.abs(p.value - s.v) <= range * SNAP_FRAC;
          return (
            <span
              key={s.label}
              title={`${s.label} — 우클릭 또는 이 값 근처에서 1초 유지하면 이동`}
              className={`absolute w-2.5 h-2.5 rounded-full border pointer-events-none transition-colors ${active ? "bg-[var(--purple)] border-white" : "bg-[var(--bg-soft)] border-white/50"}`}
              style={{ left: `${s.pos}%`, marginLeft: "-5px" }}
            />
          );
        })}
        <input
          ref={inputRef}
          type="range"
          min={p.min}
          max={p.max}
          step={range / 200}
          value={p.value}
          onChange={(e) => handleValue(parseFloat(e.target.value))}
          onPointerDown={() => { locked.current = false; }}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onLostPointerCapture={endHold}
          className="param-slider absolute inset-0"
        />
      </div>
    </div>
  );
}

export default function ParamPanel({
  params,
  overrideIds,
  sweepOn,
  onChange,
  onRelease,
  onResetAll,
  onToggleSweep,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [query, setQuery] = useState("");
  const [combos, setCombos] = useState<Combo[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickX, setPickX] = useState("");
  const [pickY, setPickY] = useState("");

  if (params.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--muted)] p-4 text-center">
        <p className="text-sm">파라미터를 불러오는 중이거나</p>
        <p className="text-xs">이 모델엔 조작 가능한 파라미터가 없어요</p>
      </div>
    );
  }

  const byId = new Map(params.map((p) => [p.id, p]));
  const combinedIds = new Set(combos.flatMap((c) => [c.xId, c.yId]));

  function addCombo(xId: string, yId: string, label: string) {
    if (!byId.has(xId) || !byId.has(yId) || xId === yId) return;
    if (combinedIds.has(xId) || combinedIds.has(yId)) return;
    setCombos((prev) => [...prev, { id: `${xId}__${yId}`, xId, yId, label }]);
  }
  function removeCombo(id: string) {
    setCombos((prev) => prev.filter((c) => c.id !== id));
  }

  // 결합에 안 들어간 파라미터만 슬라이더로
  const freeParams = params.filter((p) => !combinedIds.has(p.id));
  const hasPrimary = freeParams.some((p) => PRIMARY_IDS.has(p.id));
  const primary  = hasPrimary ? freeParams.filter((p) => PRIMARY_IDS.has(p.id)) : freeParams;
  const advanced = hasPrimary ? freeParams.filter((p) => !PRIMARY_IDS.has(p.id)) : [];

  const q = query.trim().toLowerCase();
  const advFiltered = q ? advanced.filter((p) => p.id.toLowerCase().includes(q)) : advanced;

  const availablePresets = COMBO_PRESETS.filter(
    (pr) => byId.has(pr.xId) && byId.has(pr.yId) && !combinedIds.has(pr.xId) && !combinedIds.has(pr.yId)
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between gap-2 flex-shrink-0">
        <p className="text-xs font-semibold text-[var(--fg)]">
          파라미터 조작
          <span className="text-[10px] text-[var(--muted)] ml-1">{params.length}개</span>
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleSweep(!sweepOn)}
            className={`px-2 py-0.5 rounded-md text-[10px] flex items-center gap-1 transition-all ${sweepOn ? "bg-[var(--purple)]/25 text-[var(--purple)]" : "glass glass-hover text-[var(--muted)]"}`}
            title="모든 파라미터를 랜덤 속도로 끝값까지 왕복 — 한 번에 전체 테스트"
          >
            <Zap className="w-2.5 h-2.5" /> {sweepOn ? "테스트 중" : "극한값 테스트"}
          </button>
          {overrideIds.size > 0 && (
            <button
              onClick={onResetAll}
              className="px-2 py-0.5 rounded-md text-[10px] glass glass-hover text-[var(--muted)]"
              title="모든 고정값 해제 → 얼굴추적 자동 제어로 복귀"
            >
              초기화 {overrideIds.size}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto chat-scroll p-2.5 space-y-2.5">
        {/* 결합(2D) */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5 text-[var(--purple)]" />
            <span className="text-[11px] font-semibold text-[var(--fg)]">결합 (2D)</span>
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="ml-auto px-2 py-0.5 rounded-md text-[10px] glass glass-hover text-[var(--muted)] flex items-center gap-1"
              title="두 파라미터를 2D 패드로 결합"
            >
              <Plus className="w-2.5 h-2.5" /> 결합 추가
            </button>
          </div>

          {/* 결합된 패드들 */}
          {combos.map((c) => {
            const xP = byId.get(c.xId), yP = byId.get(c.yId);
            if (!xP || !yP) return null;
            return <ComboPad key={c.id} combo={c} xP={xP} yP={yP} onChange={onChange} onRemove={() => removeCombo(c.id)} />;
          })}

          {/* 추가 UI */}
          {pickerOpen && (
            <div className="glass rounded-xl p-2.5 space-y-2">
              {availablePresets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {availablePresets.map((pr) => (
                    <button
                      key={pr.label}
                      onClick={() => { addCombo(pr.xId, pr.yId, pr.label); }}
                      className="px-2 py-1 rounded-lg text-[10px] bg-[var(--purple)]/15 text-[var(--purple)] hover:bg-[var(--purple)]/25"
                    >
                      + {pr.label}
                    </button>
                  ))}
                </div>
              )}
              {/* 직접 결합 */}
              <div className="flex items-center gap-1.5">
                <select value={pickX} onChange={(e) => setPickX(e.target.value)} className="flex-1 min-w-0 glass rounded-md px-2 py-1 text-[10px] outline-none">
                  <option value="">X 축…</option>
                  {params.filter((p) => !combinedIds.has(p.id) && p.id !== pickY).map((p) => <option key={p.id} value={p.id}>{short(p.id)}</option>)}
                </select>
                <span className="text-[10px] text-[var(--muted)]">×</span>
                <select value={pickY} onChange={(e) => setPickY(e.target.value)} className="flex-1 min-w-0 glass rounded-md px-2 py-1 text-[10px] outline-none">
                  <option value="">Y 축…</option>
                  {params.filter((p) => !combinedIds.has(p.id) && p.id !== pickX).map((p) => <option key={p.id} value={p.id}>{short(p.id)}</option>)}
                </select>
                <button
                  onClick={() => { if (pickX && pickY) { addCombo(pickX, pickY, `${short(pickX)} × ${short(pickY)}`); setPickX(""); setPickY(""); } }}
                  disabled={!pickX || !pickY}
                  className="px-2 py-1 rounded-md text-[10px] bg-[var(--purple)] text-white disabled:opacity-40 shrink-0"
                >결합</button>
              </div>
              <p className="text-[9px] text-[var(--muted)]/70">패드의 점을 끌면 두 값이 함께 움직여요. X 최소→최대는 좌→우, Y는 아래→위.</p>
            </div>
          )}
        </div>

        {(combos.length > 0 || pickerOpen) && <div className="h-px bg-white/5" />}

        {/* 기본(주요) 파라미터 */}
        {primary.map((p) => (
          <Slider key={p.id} p={p} isFixed={overrideIds.has(p.id)} onChange={onChange} onRelease={onRelease} />
        ))}

        {/* 고급 설정 */}
        {advanced.length > 0 && (
          <div className="pt-1">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg glass glass-hover text-[11px] font-medium text-[var(--fg)]"
            >
              {showAdvanced ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              고급 설정
              <span className="text-[10px] text-[var(--muted)]">전체 {advanced.length}개</span>
            </button>

            {showAdvanced && (
              <div className="mt-2 space-y-2.5">
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2 pointer-events-none" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="파라미터 검색 (예: Jaw, Mouth)"
                    className="w-full glass rounded-lg pl-7 pr-2 py-1.5 text-[11px] placeholder-[var(--muted)]/60 outline-none focus:border-[var(--purple)]/50 transition-colors"
                  />
                </div>
                {advFiltered.length === 0 ? (
                  <p className="text-[10px] text-[var(--muted)] text-center py-2">검색 결과가 없어요</p>
                ) : (
                  advFiltered.map((p) => (
                    <Slider key={p.id} p={p} isFixed={overrideIds.has(p.id)} onChange={onChange} onRelease={onRelease} />
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-white/5 flex-shrink-0">
        <p className="text-[9px] text-[var(--muted)]/70 text-center">
          모든 파라미터는 미리보기 화면에 즉시 반영돼요
        </p>
      </div>
    </div>
  );
}
