"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ExternalLink, Trash2, Calendar, Layers, Boxes, Link as LinkIcon, Loader2, HardDrive, Lock, X } from "lucide-react";
import {
  supabase,
  getStorageUsage,
  formatBytes,
  STORAGE_LIMIT_BYTES,
  type Session,
} from "@/lib/supabase";

type VersionItem = Session & { versionNo: number; size: number };
type ModelGroup = { name: string; versions: VersionItem[] };

export default function MyModels() {
  const [groups, setGroups] = useState<ModelGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [totalUsage, setTotalUsage] = useState(0);

  const [pwTarget, setPwTarget] = useState<Session | null>(null);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    // 모든 모델을 공개로 표시 — 접속한 누구나 전체 모델을 봄
    const { data } = await supabase
      .from("sessions")
      .select("*")
      .order("created_at", { ascending: false });

    if (!data) { setGroups([]); setLoading(false); return; }

    const sizes = await Promise.all((data as Session[]).map((s) => getStorageUsage(s.id)));
    const sizeMap = new Map<string, number>();
    (data as Session[]).forEach((s, i) => sizeMap.set(s.id, sizes[i]));
    setTotalUsage(sizes.reduce((a, b) => a + b, 0));

    const map = new Map<string, Session[]>();
    for (const s of data as Session[]) {
      const key = s.model_name || s.title;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }

    const result: ModelGroup[] = [];
    for (const [name, sessions] of map) {
      const sorted = [...sessions].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      result.push({
        name,
        versions: sorted.map((s, i) => ({ ...s, versionNo: i + 1, size: sizeMap.get(s.id) || 0 })).reverse(),
      });
    }
    result.sort((a, b) => {
      const al = Math.max(...a.versions.map((v) => new Date(v.created_at).getTime()));
      const bl = Math.max(...b.versions.map((v) => new Date(v.created_at).getTime()));
      return bl - al;
    });

    setGroups(result);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function confirmDelete() {
    if (!pwTarget) return;
    const session = pwTarget;
    const password = pwInput;
    setDeleting(session.id);
    try {
      const res = await fetch("/api/delete-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, password }),
      });
      if (res.status === 403) { setPwError(true); setDeleting(null); return; }
      if (!res.ok) throw new Error();
      setPwTarget(null);
      setPwInput("");
      setPwError(false);
      await load();
    } catch {
      alert("삭제 중 오류가 발생했어요");
    } finally {
      setDeleting(null);
    }
  }

  async function copyLink(id: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/review/${id}`);
  }

  function formatDate(s: string) {
    const d = new Date(s);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  const usagePct = Math.min(100, (totalUsage / STORAGE_LIMIT_BYTES) * 100);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--purple)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 용량 */}
      {groups.length > 0 && (
        <div className="px-4 py-3 border-b border-white/5 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-[var(--muted)]">
              <HardDrive className="w-3.5 h-3.5" /> 저장 용량
            </span>
            <span className="text-[var(--fg)] font-mono">{formatBytes(totalUsage)} / 1 GB</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usagePct > 80 ? "bg-red-500" : usagePct > 50 ? "bg-amber-500" : "bg-gradient-to-r from-[var(--purple)] to-[var(--pink)]"
              }`}
              style={{ width: `${Math.max(2, usagePct)}%` }}
            />
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--muted)] p-8">
          <Boxes className="w-12 h-12 opacity-40" />
          <p className="text-sm text-center">
            아직 업로드한 모델이 없어요
            <br />
            <span className="text-xs opacity-60">리뷰 공유 탭에서 모델을 올려보세요</span>
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-5">
          {groups.map((group) => (
            <div key={group.name} className="space-y-2 fade-up">
              <div className="flex items-center gap-2 px-1">
                <Boxes className="w-4 h-4 text-[var(--purple)]" />
                <span className="text-sm font-bold text-[var(--fg)]">{group.name}</span>
                <span className="text-[10px] text-[var(--muted)] bg-white/5 px-2 py-0.5 rounded-full">
                  {group.versions.length}개 버전
                </span>
              </div>

              <div className="space-y-1.5">
                {group.versions.map((v) => (
                  <div key={v.id} className="glass glass-hover rounded-xl p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--purple-deep)]/30 to-[var(--pink)]/20 border border-[var(--purple)]/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-[var(--purple)]">v{v.versionNo}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--fg)] truncate">{v.title}</p>
                      <div className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {formatDate(v.created_at)}
                        </span>
                        <span className="opacity-40">·</span>
                        <span>{formatBytes(v.size)}</span>
                      </div>
                    </div>

                    <button onClick={() => copyLink(v.id)} className="glass glass-hover p-2 rounded-lg text-[var(--muted)] hover:text-[var(--purple)]" title="링크 복사">
                      <LinkIcon className="w-3.5 h-3.5" />
                    </button>
                    <Link href={`/review/${v.id}`} className="glass glass-hover p-2 rounded-lg text-[var(--muted)] hover:text-[var(--purple)]" title="열기">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      onClick={() => { setPwTarget(v); setPwInput(""); setPwError(false); }}
                      disabled={deleting === v.id}
                      className="glass glass-hover p-2 rounded-lg text-[var(--muted)] hover:text-red-400"
                      title="삭제"
                    >
                      {deleting === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 text-[10px] text-[var(--muted)] px-1 pt-1">
            <Layers className="w-3 h-3" />
            같은 모델 파일명으로 올리면 버전으로 묶여요
          </div>
        </div>
      )}

      {/* 비밀번호 모달 */}
      {pwTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setPwTarget(null)}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-xs space-y-4 fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-red-400" />
                </div>
                <span className="text-sm font-semibold">삭제 확인</span>
              </div>
              <button onClick={() => setPwTarget(null)} className="text-[var(--muted)] hover:text-[var(--fg)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--muted)]">
              <span className="text-[var(--fg)]">{pwTarget.title}</span> 을(를) 삭제하려면 비밀번호를 입력하세요. 되돌릴 수 없어요.
            </p>
            <input
              type="password"
              inputMode="numeric"
              value={pwInput}
              onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") confirmDelete(); }}
              placeholder="비밀번호"
              autoFocus
              className={`w-full glass rounded-xl px-4 py-3 text-sm text-center tracking-widest outline-none ${pwError ? "border border-red-500/50" : ""}`}
            />
            {pwError && <p className="text-xs text-red-400">비밀번호가 틀렸어요</p>}
            <div className="flex gap-2">
              <button onClick={() => setPwTarget(null)} className="flex-1 glass glass-hover rounded-xl py-2.5 text-sm text-[var(--muted)]">
                취소
              </button>
              <button onClick={confirmDelete} className="flex-1 bg-red-600 hover:bg-red-500 rounded-xl py-2.5 text-sm text-white transition-all">
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
