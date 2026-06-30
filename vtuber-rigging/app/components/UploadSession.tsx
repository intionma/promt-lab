"use client";

import { useState, useCallback } from "react";
import { Upload, FileUp, Link, CheckCircle, AlertCircle, X, FolderOpen } from "lucide-react";
import { supabase } from "@/lib/supabase";

type UploadedFile = { name: string; done: boolean; error?: boolean };

export default function UploadSession() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadedFile[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasModel3 = files.some((f) => f.name.endsWith(".model3.json"));
  const hasMoc3 = files.some((f) => f.name.endsWith(".moc3"));

  // 파일의 저장 경로 계산 (폴더 구조 유지)
  function getStoragePath(file: File): string {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    if (rel) {
      // 최상위 폴더명 제거 (e.g. "modelFolder/textures/tex.png" → "textures/tex.png")
      const parts = rel.split("/");
      return parts.slice(1).join("/") || file.name;
    }
    return file.name;
  }

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => {
      const names = new Set(prev.map((f) => getStoragePath(f)));
      return [...prev, ...newFiles.filter((f) => !names.has(getStoragePath(f)))];
    });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    addFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  async function upload() {
    if (!title.trim() || !hasModel3 || !hasMoc3) return;
    setUploading(true);
    setError(null);
    setProgress(files.map((f) => ({ name: getStoragePath(f), done: false })));

    try {
      const { data: session, error: sessionErr } = await supabase
        .from("sessions")
        .insert({ title: title.trim(), description: description.trim() || null })
        .select()
        .single();

      if (sessionErr) throw sessionErr;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const storagePath = `${session.id}/${getStoragePath(file)}`;

        const { error: uploadErr } = await supabase.storage
          .from("models")
          .upload(storagePath, file, { upsert: true });

        setProgress((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, done: !uploadErr, error: !!uploadErr } : p
          )
        );

        if (uploadErr) throw new Error(`${file.name} 업로드 실패`);
      }

      setShareUrl(`${window.location.origin}/review/${session.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  async function copyUrl() {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl);
    }
  }

  if (shareUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-green-400" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold text-slate-200">업로드 완료!</h2>
          <p className="text-sm text-slate-400">아래 링크를 친구들에게 공유하세요</p>
        </div>
        <div className="glass rounded-xl p-4 flex items-center gap-3 w-full">
          <Link className="w-4 h-4 text-purple-400 flex-shrink-0" />
          <span className="text-sm text-slate-300 flex-1 truncate">{shareUrl}</span>
          <button
            onClick={copyUrl}
            className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap"
          >
            복사
          </button>
        </div>
        <button
          onClick={() => {
            setShareUrl(null);
            setFiles([]);
            setTitle("");
            setDescription("");
            setProgress([]);
          }}
          className="text-sm text-slate-500 hover:text-slate-300 transition-all"
        >
          새 세션 만들기
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto chat-scroll p-4 gap-4">
      <div className="space-y-2">
        <label className="text-xs text-slate-400">세션 이름 *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 리나 v2 눈 리깅 피드백"
          className="w-full glass rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-slate-400">설명 (선택)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="친구들에게 확인 요청할 내용..."
          rows={2}
          className="w-full glass rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none resize-none"
        />
      </div>

      {/* 업로드 방법 안내 */}
      <div className="glass rounded-xl p-3 space-y-1.5">
        <p className="text-xs font-medium text-purple-300">파일 준비 방법</p>
        <p className="text-xs text-slate-400">
          Cubism Editor → 파일 → 내보내기 → <span className="text-slate-300">런타임 파일 내보내기</span>
        </p>
        <p className="text-xs text-slate-500">
          내보낸 폴더 전체를 아래에 드래그하거나, 폴더 선택 버튼을 사용하세요
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all ${
          dragging ? "border-purple-400 bg-purple-500/10" : "border-white/10 hover:border-purple-500/40"
        }`}
      >
        <FileUp className="w-7 h-7 text-slate-500 mx-auto mb-2" />
        <p className="text-sm text-slate-400 mb-3">파일을 드래그하거나</p>
        <div className="flex gap-2 justify-center">
          {/* 폴더 선택 */}
          <label className="relative cursor-pointer bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 rounded-lg px-3 py-2 text-xs text-purple-300 flex items-center gap-1.5 transition-all">
            <FolderOpen className="w-3.5 h-3.5" />
            폴더 선택
            <input
              type="file"
              // @ts-expect-error webkitdirectory is non-standard
              webkitdirectory=""
              multiple
              onChange={onFileInput}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
          {/* 파일 선택 */}
          <label className="relative cursor-pointer glass hover:bg-white/10 rounded-lg px-3 py-2 text-xs text-slate-400 flex items-center gap-1.5 transition-all">
            <Upload className="w-3.5 h-3.5" />
            파일 선택
            <input
              type="file"
              multiple
              accept=".moc3,.json,.png,.jpg"
              onChange={onFileInput}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* 필수 파일 체크 */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <span className={`text-xs px-2 py-1 rounded-full ${hasMoc3 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              {hasMoc3 ? "✓" : "✗"} .moc3
            </span>
            <span className={`text-xs px-2 py-1 rounded-full ${hasModel3 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              {hasModel3 ? "✓" : "✗"} .model3.json
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-slate-700/50 text-slate-400">
              총 {files.length}개
            </span>
          </div>

          <div className="space-y-1 max-h-40 overflow-y-auto chat-scroll">
            {files.map((f, i) => {
              const path = getStoragePath(f);
              const p = progress[i];
              return (
                <div key={path} className="flex items-center gap-2 glass rounded-lg px-3 py-1.5">
                  <span className="text-xs text-slate-400 flex-1 truncate">{path}</span>
                  <span className="text-xs text-slate-600 flex-shrink-0">
                    {(f.size / 1024).toFixed(0)}KB
                  </span>
                  {p ? (
                    p.error ? <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" /> :
                    p.done ? <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /> :
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin flex-shrink-0" />
                  ) : (
                    <button onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} className="flex-shrink-0">
                      <X className="w-3.5 h-3.5 text-slate-600 hover:text-red-400" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="glass rounded-xl px-4 py-3 text-sm text-red-400 flex gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <button
        onClick={upload}
        disabled={uploading || !title.trim() || !hasModel3 || !hasMoc3}
        className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-3 text-sm font-medium transition-all flex items-center justify-center gap-2"
      >
        {uploading ? (
          <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> 업로드 중...</>
        ) : (
          <><Upload className="w-4 h-4" /> 업로드 & 공유 링크 생성</>
        )}
      </button>
    </div>
  );
}
