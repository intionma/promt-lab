"use client";

import { useState, useRef, useMemo } from "react";
import { ChevronDown, ChevronRight, Search, Zap, Crosshair, X } from "lucide-react";
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
  const holdTimer = useRef<number | null>(null);
  const holdKey = useRef<string | null>(null);
  const locked = useRef(false); // 스냅 후 손 뗄 때까지 값 고정(터치 놓임)

  const xr = xP.max - xP.min || 1;
  const yr = yP.max - yP.min || 1;
  const nx = clamp01((xP.value - xP.min) / xr);   // 0..1 (좌→우)
  const ny = clamp01((yP.value - yP.min) / yr);   // 0..1 (아래→위)

  // 스냅 지점: 네 꼭짓점(각 축 min/max) + 중앙(0,0)(두 축 모두 0을 포함할 때)
  const snaps = useMemo(() => {
    const arr: { xv: number; yv: number; px: number; py: number; label: string }[] = [];
    const corners: [number, number][] = [
      [xP.min, yP.min], [xP.max, yP.min], [xP.min, yP.max], [xP.max, yP.max],
    ];
    for (const [xv, yv] of corners) arr.push({ xv, yv, px: (xv - xP.min) / xr, py: (yv - yP.min) / yr, label: "꼭짓점" });
    if (xP.min < 0 && xP.max > 0 && yP.min < 0 && yP.max > 0) arr.push({ xv: 0, yv: 0, px: (0 - xP.min) / xr, py: (0 - yP.min) / yr, label: "중앙(0,0)" });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xP.min, xP.max, yP.min, yP.max]);

  const SNAP_DIST = 0.08; // 정규화 거리(패드 대각선 비율)

  function clearHold() { if (holdTimer.current != null) { clearTimeout(holdTimer.current); holdTimer.current = null; } holdKey.current = null; }
  function endHold() { clearHold(); locked.current = false; dragging.current = false; }

  function setFromPointer(clientX: number, clientY: number) {
    if (locked.current) return;
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clamp01((clientX - rect.left) / rect.width);
    const py = clamp01((clientY - rect.top) / rect.height);
    const curNx = px, curNy = 1 - py; // ny: 아래→위
    onChange(xP.id, xP.min + px * xr);
    onChange(yP.id, yP.min + curNy * yr); // 위=최대(Cubism 관례)
    // 모바일: 스냅 근처 1초 유지 → 그 값으로 이동 + 터치 놓임
    const near = snaps.find((s) => Math.hypot(curNx - s.px, curNy - s.py) <= SNAP_DIST);
    if (near) {
      const key = `${near.xv},${near.yv}`;
      if (holdKey.current !== key) {
        clearHold();
        holdKey.current = key;
        holdTimer.current = window.setTimeout(() => {
          onChange(xP.id, near.xv); onChange(yP.id, near.yv);
          locked.current = true; clearHold();
        }, HOLD_MS);
      }
    } else { clearHold(); }
  }

  // PC: 우클릭 → 가까운 스냅 지점(꼭짓점·중앙)으로 이동
  function onContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = 1 - (e.clientY - rect.top) / rect.height;
    const near = snaps.find((s) => Math.hypot(px - s.px, py - s.py) <= SNAP_DIST);
    if (near) { e.preventDefault(); onChange(xP.id, near.xv); onChange(yP.id, near.yv); }
  }

  return (
    <div className="glass rounded-xl p-2.5 space-y-2 ring-1 ring-[var(--purple)]/25">
      <div className="flex items-center gap-1.5">
        <Crosshair className="w-3.5 h-3.5 text-[var(--purple)] shrink-0" />
        <span className="text-[11px] font-semibold text-[var(--fg)] truncate">{combo.label}</span>
        <button onClick={onRemove} title="결합 해제 (두 파라미터로 다시 분리)" className="ml-auto p-1 rounded-md text-[var(--muted)] hover:text-red-400 hover:bg-white/5 shrink-0">
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
          onPointerDown={(e) => { locked.current = false; dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); setFromPointer(e.clientX, e.clientY); }}
          onPointerMove={(e) => { if (dragging.current) setFromPointer(e.clientX, e.clientY); }}
          onPointerUp={(e) => { endHold(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ } }}
          onPointerCancel={endHold}
          onContextMenu={onContextMenu}
          className="relative flex-1 aspect-square rounded-lg bg-black/25 border border-white/10 cursor-crosshair touch-none overflow-hidden"
          style={{ touchAction: "none" }}
        >
          {/* 격자·중심선 */}
          <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
          {/* 스냅 점 (꼭짓점·중앙) — 우클릭 또는 근처 1초 유지 */}
          {snaps.map((s) => {
            const active = Math.hypot(nx - s.px, ny - s.py) <= SNAP_DIST;
            return (
              <span
                key={`${s.xv},${s.yv}`}
                title={`${s.label} — 우클릭 또는 근처에서 1초 유지하면 이동`}
                className={`absolute w-2.5 h-2.5 rounded-full border pointer-events-none transition-colors ${active ? "bg-[var(--purple)] border-white" : "bg-[var(--bg-soft)] border-white/50"}`}
                style={{ left: `${s.px * 100}%`, top: `${(1 - s.py) * 100}%`, marginLeft: "-5px", marginTop: "-5px" }}
              />
            );
          })}
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
  p, isFixed, onChange, onRelease, combineActive, isCombineSource, onCombine,
}: {
  p: Param;
  isFixed: boolean;
  onChange: (id: string, value: number) => void;
  onRelease: (id: string) => void;
  combineActive: boolean;      // 결합 대기 중(다른 파라미터 선택 대기)
  isCombineSource: boolean;    // 내가 결합 시작한 파라미터
  onCombine: () => void;
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
      <div className="flex justify-between items-center gap-1">
        <div className="flex items-center gap-1 min-w-0">
          {/* 결합 버튼 (이름 왼쪽) — 큐비즘처럼 다른 파라미터와 2D 결합 */}
          <button
            onClick={onCombine}
            title={isCombineSource ? "결합 취소" : combineActive ? "이 파라미터와 결합" : "결합 시작 — 누른 뒤 결합할 다른 파라미터를 고르세요"}
            className={`shrink-0 w-4 h-4 rounded flex items-center justify-center transition-colors ${
              isCombineSource ? "bg-[var(--purple)] text-white"
              : combineActive ? "bg-[var(--purple)]/20 text-[var(--purple)] animate-pulse"
              : "text-[var(--muted)]/50 hover:text-[var(--purple)] hover:bg-white/5"
            }`}
          >
            <Crosshair className="w-3 h-3" />
          </button>
          <button
            onClick={() => isFixed && onRelease(p.id)}
            className="text-[11px] text-[var(--muted)] truncate flex items-center gap-1 text-left min-w-0"
            title={isFixed ? `${p.id} — 클릭하면 고정 해제` : p.id}
          >
            {isFixed && <span className="w-1.5 h-1.5 rounded-full bg-pink-400 flex-shrink-0" />}
            <span className="truncate">{short(p.id)}</span>
          </button>
        </div>
        <span className="text-[10px] text-[var(--purple)] font-mono shrink-0">{p.value.toFixed(2)}</span>
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
  const [combineSource, setCombineSource] = useState<string | null>(null); // 결합 대기 중인 첫 파라미터

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

  function comboLabel(xId: string, yId: string) {
    const preset = COMBO_PRESETS.find(
      (pr) => (pr.xId === xId && pr.yId === yId) || (pr.xId === yId && pr.yId === xId)
    );
    return preset ? preset.label : `${short(xId)} × ${short(yId)}`;
  }
  function addCombo(xId: string, yId: string, label: string) {
    if (!byId.has(xId) || !byId.has(yId) || xId === yId) return;
    if (combinedIds.has(xId) || combinedIds.has(yId)) return;
    setCombos((prev) => [...prev, { id: `${xId}__${yId}`, xId, yId, label }]);
  }
  function removeCombo(id: string) {
    setCombos((prev) => prev.filter((c) => c.id !== id));
  }
  // 결합 버튼: 첫 클릭 → 대기, 다른 파라미터 클릭 → 결합, 같은 것 다시 → 취소
  function onCombineClick(pid: string) {
    if (!combineSource) { setCombineSource(pid); return; }
    if (combineSource === pid) { setCombineSource(null); return; }
    addCombo(combineSource, pid, comboLabel(combineSource, pid)); // source=X, 대상=Y
    setCombineSource(null);
  }

  // 결합에 안 들어간 파라미터만 슬라이더로
  const freeParams = params.filter((p) => !combinedIds.has(p.id));
  const hasPrimary = freeParams.some((p) => PRIMARY_IDS.has(p.id));
  const primary  = hasPrimary ? freeParams.filter((p) => PRIMARY_IDS.has(p.id)) : freeParams;
  const advanced = hasPrimary ? freeParams.filter((p) => !PRIMARY_IDS.has(p.id)) : [];

  const q = query.trim().toLowerCase();
  const advFiltered = q ? advanced.filter((p) => p.id.toLowerCase().includes(q)) : advanced;
  const combineActive = combineSource !== null;

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
        {/* 결합 대기 안내 */}
        {combineActive && (
          <div className="rounded-lg bg-[var(--purple)]/12 border border-[var(--purple)]/30 px-2.5 py-1.5 text-[10px] text-[var(--purple)] flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5"><Crosshair className="w-3.5 h-3.5" /> <b>{short(combineSource!)}</b> 와 결합할 파라미터의 <Crosshair className="w-3 h-3 inline" /> 버튼을 누르세요</span>
            <button onClick={() => setCombineSource(null)} className="px-1.5 py-0.5 rounded bg-[var(--purple)]/25 font-medium shrink-0">취소</button>
          </div>
        )}

        {/* 결합된 2D 패드 (두 파라미터가 병합된 슬라이더) */}
        {combos.map((c) => {
          const xP = byId.get(c.xId), yP = byId.get(c.yId);
          if (!xP || !yP) return null;
          return <ComboPad key={c.id} combo={c} xP={xP} yP={yP} onChange={onChange} onRemove={() => removeCombo(c.id)} />;
        })}

        {/* 기본(주요) 파라미터 */}
        {primary.map((p) => (
          <Slider key={p.id} p={p} isFixed={overrideIds.has(p.id)} onChange={onChange} onRelease={onRelease}
            combineActive={combineActive} isCombineSource={combineSource === p.id} onCombine={() => onCombineClick(p.id)} />
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
                    <Slider key={p.id} p={p} isFixed={overrideIds.has(p.id)} onChange={onChange} onRelease={onRelease}
                      combineActive={combineActive} isCombineSource={combineSource === p.id} onCombine={() => onCombineClick(p.id)} />
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
