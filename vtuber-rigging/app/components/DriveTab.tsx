"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { FileUp, FolderUp, Download, Trash2, Loader2, HardDrive, CheckCircle, AlertCircle, File as FileIcon, Boxes } from "lucide-react";
import { supabase, listDriveFiles, publicUrl, formatBytes, DRIVE_PREFIX } from "@/lib/supabase";

type DriveFile = { path: string; size: number; name: string };

// 저장 키로 안전한 경로 (슬래시 유지 → 폴더 구조 보존)
function safeSeg(s: string) { return s.replace(/[^A-Za-z0-9._-]+/g, "_"); }
function safePath(p: string) { return p.replace(/\\/g, "/").split("/").map(safeSeg).join("/"); }

export default function DriveTab() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);

  // 드라이브의 최상위 폴더들 (모델로 등록 가능한지 = .model3.json 포함)
  const folders = useMemo(() => {
    const map = new Map<string, DriveFile[]>();
    for (const f of files) {
      const seg = f.name.split("/");
      if (seg.length > 1) {
        const top = seg[0];
        if (!map.has(top)) map.set(top, []);
        map.get(top)!.push(f);
      }
    }
    return Array.from(map.entries()).map(([name, fs]) => ({
      name,
      count: fs.length,
      hasModel: fs.some((x) => x.name.toLowerCase().endsWith(".model3.json")),
    }));
  }, [files]);

  async function publishFolder(folder: string) {
    const pw = window.prompt("모델 갤러리에 등록 — 비밀번호를 입력하세요");
    if (!pw) return;
    const title = window.prompt("세션 이름 (비우면 모델 파일명)", folder) ?? "";
    setPublishing(folder);
    try {
      const res = await fetch("/api/publish-from-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder, title, password: pw }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 403) { alert("비밀번호가 틀렸어요"); return; }
      if (!res.ok) { alert("등록 실패: " + (j.error || "")); return; }
      alert("모델 갤러리에 등록됐어요! '모델 갤러리' 탭에서 확인하세요.");
    } finally {
      setPublishing(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try { setFiles(await listDriveFiles()); } catch { setFiles([]); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function uploadFiles(list: File[]) {
    if (!list.length) return;
    setUploading(true);
    setMsg(null);
    let ok = 0;
    const fails: string[] = [];
    const stamp = Date.now();
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      // 폴더로 올린 경우 webkitRelativePath 로 구조 보존, 아니면 파일명만
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
      const path = rel
        ? `${DRIVE_PREFIX}/${safePath(rel)}`
        : `${DRIVE_PREFIX}/${stamp}_${i}_${safePath(f.name)}`;
      try {
        const { error } = await supabase.storage
          .from("models")
          .upload(path, f, { upsert: true, contentType: f.type || undefined });
        if (error) fails.push(`${f.name}: ${error.message}`); else ok += 1;
      } catch (e) {
        fails.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setUploading(false);
    setMsg(
      fails.length
        ? { ok: false, text: `${ok}개 완료 · ${fails.length}개 실패 — ${fails[0]}` }
        : { ok: true, text: `${ok}개 파일 백업 완료` }
    );
    await load();
  }

  async function del(file: DriveFile) {
    const pw = window.prompt(`"${file.name}" 삭제 — 비밀번호를 입력하세요`);
    if (!pw) return;
    setDeleting(file.path);
    try {
      const res = await fetch("/api/delete-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: file.path, password: pw }),
      });
      if (res.status === 403) { alert("비밀번호가 틀렸어요"); return; }
      if (!res.ok) { alert("삭제 실패"); return; }
      await load();
    } finally {
      setDeleting(null);
    }
  }

  const total = files.reduce((a, b) => a + b.size, 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto chat-scroll p-4 gap-3">
      <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <HardDrive className="w-4 h-4 text-[var(--purple)]" />
        <span className="font-semibold text-[var(--fg)]">드라이브 백업</span>
        <span className="ml-auto text-[10px]">{files.length}개 · {formatBytes(total)}</span>
      </div>
      <p className="text-[11px] text-[var(--muted)]/80 -mt-1">
        어떤 파일이든 올려서 백업하세요 (cmo3, psd, zip, 이미지 등 전부 가능). 모두가 볼 수 있는 공용 보관함이에요.
      </p>

      {/* 업로드 영역 */}
      <div
        onDrop={(e) => { e.preventDefault(); setDragging(false); uploadFiles(Array.from(e.dataTransfer.files)); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all ${
          dragging ? "border-[var(--purple)] bg-[var(--purple)]/10" : "border-white/10 hover:border-[var(--purple)]/40"
        }`}
      >
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[var(--purple-deep)]/30 to-[var(--pink)]/20 flex items-center justify-center mx-auto mb-2">
          {uploading ? <Loader2 className="w-5 h-5 text-[var(--purple)] animate-spin" /> : <FileUp className="w-5 h-5 text-[var(--purple)]" />}
        </div>
        <p className="text-sm text-[var(--fg)] mb-2">{uploading ? "업로드 중..." : "파일을 드래그하거나"}</p>
        <div className="flex gap-2 justify-center">
          <label className="inline-flex cursor-pointer bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] rounded-lg px-4 py-2 text-xs text-white items-center gap-1.5 font-medium hover:opacity-90">
            <FileUp className="w-3.5 h-3.5" /> 파일 선택
            <input
              type="file"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => { if (e.target.files) uploadFiles(Array.from(e.target.files)); e.target.value = ""; }}
            />
          </label>
          <label className="inline-flex cursor-pointer glass glass-hover rounded-lg px-4 py-2 text-xs text-[var(--muted)] items-center gap-1.5 font-medium">
            <FolderUp className="w-3.5 h-3.5" /> 폴더 선택
            <input
              type="file"
              // @ts-expect-error webkitdirectory 는 비표준
              webkitdirectory=""
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => { if (e.target.files) uploadFiles(Array.from(e.target.files)); e.target.value = ""; }}
            />
          </label>
        </div>
        <p className="text-[10px] text-[var(--muted)]/60 mt-2">폴더를 올리면 폴더 구조 그대로 백업돼요</p>
      </div>

      {msg && (
        <div className={`rounded-xl px-3 py-2 text-xs flex gap-2 items-start ${msg.ok ? "bg-green-500/10 text-green-400 border border-green-500/30" : "bg-red-500/10 text-red-400 border border-red-500/30"}`}>
          {msg.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          {msg.text}
        </div>
      )}

      {/* 폴더 → 모델 갤러리 등록 */}
      {folders.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-[var(--muted)]">폴더 ({folders.length})</p>
          {folders.map((fo) => (
            <div key={fo.name} className="glass rounded-xl p-2.5 flex items-center gap-2.5">
              <FolderUp className="w-4 h-4 text-[var(--purple)]/80 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--fg)] truncate" title={fo.name}>{fo.name}</p>
                <p className="text-[10px] text-[var(--muted)]/60">{fo.count}개 파일{fo.hasModel ? " · 모델" : ""}</p>
              </div>
              {fo.hasModel && (
                <button
                  onClick={() => publishFolder(fo.name)}
                  disabled={publishing === fo.name}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--purple)]/20 text-[var(--purple)] text-[11px] font-medium flex items-center gap-1 disabled:opacity-50"
                  title="이 폴더를 모델 갤러리에 등록"
                >
                  {publishing === fo.name ? <Loader2 className="w-3 h-3 animate-spin" /> : <Boxes className="w-3 h-3" />} 갤러리 등록
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 파일 목록 */}
      <div className="space-y-1.5">
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[var(--purple)]" /></div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-[var(--muted)]">
            <HardDrive className="w-10 h-10 opacity-40" />
            <p className="text-sm">아직 백업한 파일이 없어요</p>
          </div>
        ) : (
          files.map((f) => (
            <div key={f.path} className="glass rounded-xl p-2.5 flex items-center gap-2.5">
              <FileIcon className="w-4 h-4 text-[var(--muted)]/70 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--fg)] truncate" title={f.name}>{f.name}</p>
                <p className="text-[10px] text-[var(--muted)]/60 font-mono">{formatBytes(f.size)}</p>
              </div>
              <a href={publicUrl(f.path)} target="_blank" rel="noreferrer" download className="glass glass-hover p-2 rounded-lg text-[var(--muted)] hover:text-[var(--purple)]" title="다운로드">
                <Download className="w-3.5 h-3.5" />
              </a>
              <button onClick={() => del(f)} disabled={deleting === f.path} className="glass glass-hover p-2 rounded-lg text-[var(--muted)] hover:text-red-400" title="삭제">
                {deleting === f.path ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
