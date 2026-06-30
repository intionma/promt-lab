"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ExternalLink, Trash2, Calendar, Layers, Boxes, Link as LinkIcon, Loader2, HardDrive, Lock, X } from "lucide-react";
import {
  supabase,
  getMySessionIds,
  removeMySessionId,
  listAllStorageFiles,
  getStorageUsage,
  formatBytes,
  STORAGE_LIMIT_BYTES,
  DELETE_PASSWORD,
  type Session,
} from "@/lib/supabase";

type VersionItem = Session & { versionNo: number; size: number };
type ModelGroup = { name: string; versions: VersionItem[] };

export default function MyModels() {
  const [groups, setGroups] = useState<ModelGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [totalUsage, setTotalUsage] = useState(0);

  // 비밀번호 모달
  const [pwTarget, setPwTarget] = useState<Session | null>(null);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const ids = getMySessionIds();
    if (ids.length === 0) {
      setGroups([]);
      setTotalUsage(0);
      setLoading(false);
      return;
    }

    const { data } = await supabase.from("sessions").select("*").in("id", ids);
    if (!data) {
      setGroups([]);
      setLoading(false);
      return;
    }

    // 각 세션의 용량 계산
    const sizes = await Promise.all(
      (data as Session[]).map((s) => getStorageUsage(s.id))
    );
    const sizeMap = new Map<string, number>();
    (data as Session[]).forEach((s, i) => sizeMap.set(s.id, sizes[i]));
    setTotalUsage(sizes.reduce((a, b) => a + b, 0));

    // model_name 기준으로 묶기
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
        versions: sorted
          .map((s, i) => ({ ...s, versionNo: i + 1, size: sizeMap.get(s.id) || 0 }))
          .reverse(),
      });
    }
    result.sort((a, b) => {
      const aLatest = Math.max(...a.versions.map((v) => new Date(v.created_at).getTime()));
      const bLatest = Math.max(...b.versions.map((v) => new Date(v.created_at).getTime()));
      return bLatest - aLatest;
    });

    setGroups(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 비밀번호 확인 후 실제 삭제
  async function confirmDelete() {
    if (!pwTarget) return;
    if (pwInput !== DELETE_PASSWORD) {
      setPwError(true);
      return;
    }
    const session = pwTarget;
    setPwTarget(null);
    setPwInput("");
    setPwError(false);
    setDeleting(session.id);
    try {
      const paths = await listAllStorageFiles(session.id);
      if (paths.length > 0) {
        await supabase.storage.from("models").remove(paths);
      }
      await supabase.from("sessions").delete().eq("id", session.id);
      removeMySessionId(session.id);
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
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 용량 표시 */}
      {groups.length > 0 && (
        <div className="px-4 py-3 border-b border-white/10 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-400">
              <HardDrive className="w-3.5 h-3.5" />
              저장 용량
            </span>
            <span className="text-slate-300 font-mono">
              {formatBytes(totalUsage)} / 1 GB
            </span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usagePct > 80 ? "bg-red-500" : usagePct > 50 ? "bg-amber-500" : "bg-gradient-to-r from-purple-600 to-pink-500"
              }`}
              style={{ width: `${Math.max(2, usagePct)}%` }}
            />
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-600 p-8">
          <Boxes className="w-10 h-10" />
          <p className="text-sm text-center">
            아직 업로드한 모델이 없어요
            <br />
            <span className="text-xs text-slate-700">리뷰 공유 탭에서 모델을 올려보세요</span>
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-4">
          {groups.map((group) => (
            <div key={group.name} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Boxes className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-slate-200">{group.name}</span>
                <span className="text-[10px] text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">
                  {group.versions.length}개 버전
                </span>
              </div>

              <div className="space-y-1.5">
                {group.versions.map((v) => (
                  <div key={v.id} className="glass rounded-xl p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-purple-300">v{v.versionNo}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">{v.title}</p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(v.created_at)}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span>{formatBytes(v.size)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => copyLink(v.id)}
                      className="glass glass-hover p-2 rounded-lg transition-all text-slate-400 hover:text-purple-300"
                      title="링크 복사"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                    </button>
                    <Link
                      href={`/review/${v.id}`}
                      className="glass glass-hover p-2 rounded-lg transition-all text-slate-400 hover:text-purple-300"
                      title="열기"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      onClick={() => { setPwTarget(v); setPwInput(""); setPwError(false); }}
                      disabled={deleting === v.id}
                      className="glass glass-hover p-2 rounded-lg transition-all text-slate-400 hover:text-red-400"
                      title="삭제"
                    >
                      {deleting === v.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 text-[10px] text-slate-600 px-1 pt-2">
            <Layers className="w-3 h-3" />
            같은 모델 파일명으로 올리면 버전으로 묶여요
          </div>
        </div>
      )}

      {/* 비밀번호 모달 */}
      {pwTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setPwTarget(null)}>
          <div className="glass rounded-2xl p-5 w-full max-w-xs space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-red-400" />
                <span className="text-sm font-semibold text-slate-200">삭제 확인</span>
              </div>
              <button onClick={() => setPwTarget(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              <span className="text-slate-200">{pwTarget.title}</span> 을(를) 삭제하려면 비밀번호를 입력하세요. 되돌릴 수 없어요.
            </p>
            <input
              type="password"
              inputMode="numeric"
              value={pwInput}
              onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") confirmDelete(); }}
              placeholder="비밀번호"
              autoFocus
              className={`w-full glass rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 outline-none ${pwError ? "border border-red-500/50" : ""}`}
            />
            {pwError && <p className="text-xs text-red-400">비밀번호가 틀렸어요</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setPwTarget(null)}
                className="flex-1 glass hover:bg-white/10 rounded-lg py-2 text-sm text-slate-400 transition-all"
              >
                취소
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 bg-red-600 hover:bg-red-500 rounded-lg py-2 text-sm text-white transition-all"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
