"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ExternalLink, Trash2, Calendar, Layers, Boxes, Link as LinkIcon, Loader2 } from "lucide-react";
import {
  supabase,
  getMySessionIds,
  removeMySessionId,
  listAllStorageFiles,
  type Session,
} from "@/lib/supabase";

type ModelGroup = {
  name: string;
  versions: (Session & { versionNo: number })[];
};

export default function MyModels() {
  const [groups, setGroups] = useState<ModelGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const ids = getMySessionIds();
    if (ids.length === 0) {
      setGroups([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("sessions")
      .select("*")
      .in("id", ids);

    if (!data) {
      setGroups([]);
      setLoading(false);
      return;
    }

    // model_name 기준으로 묶기 (없으면 title 사용)
    const map = new Map<string, Session[]>();
    for (const s of data as Session[]) {
      const key = s.model_name || s.title;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }

    // 각 그룹 내에서 오래된 순으로 v1, v2... 부여
    const result: ModelGroup[] = [];
    for (const [name, sessions] of map) {
      const sorted = [...sessions].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      result.push({
        name,
        versions: sorted
          .map((s, i) => ({ ...s, versionNo: i + 1 }))
          .reverse(), // 최신 버전이 위로
      });
    }
    // 그룹은 최근 업로드된 것이 위로
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

  async function deleteVersion(session: Session) {
    if (!confirm(`"${session.title}" 버전을 삭제할까요? (되돌릴 수 없어요)`)) return;
    setDeleting(session.id);
    try {
      // 1. Storage 파일 전체 삭제
      const paths = await listAllStorageFiles(session.id);
      if (paths.length > 0) {
        await supabase.storage.from("models").remove(paths);
      }
      // 2. DB 행 삭제 (피드백도 cascade로 삭제됨)
      await supabase.from("sessions").delete().eq("id", session.id);
      // 3. localStorage에서 제거
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-600 p-8">
        <Boxes className="w-10 h-10" />
        <p className="text-sm text-center">
          아직 업로드한 모델이 없어요
          <br />
          <span className="text-xs text-slate-700">
            리뷰 공유 탭에서 모델을 올려보세요
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-4">
      {groups.map((group) => (
        <div key={group.name} className="space-y-2">
          {/* 모델 이름 헤더 */}
          <div className="flex items-center gap-2 px-1">
            <Boxes className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-slate-200">{group.name}</span>
            <span className="text-[10px] text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">
              {group.versions.length}개 버전
            </span>
          </div>

          {/* 버전 목록 */}
          <div className="space-y-1.5">
            {group.versions.map((v) => (
              <div
                key={v.id}
                className="glass rounded-xl p-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-purple-300">v{v.versionNo}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{v.title}</p>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <Calendar className="w-3 h-3" />
                    {formatDate(v.created_at)}
                  </div>
                </div>

                {/* 액션 버튼 */}
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
                  onClick={() => deleteVersion(v)}
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
  );
}
