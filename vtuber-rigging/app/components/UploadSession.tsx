"use client";

import { useState, useCallback } from "react";
import { Upload, FileUp, Link, CheckCircle, AlertCircle, X } from "lucide-react";
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

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...dropped.filter((f) => !names.has(f.name))];
    });
  }, []);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files);
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...selected.filter((f) => !names.has(f.name))];
    });
  };

  async function upload() {
    if (!title.trim() || !hasModel3 || !hasMoc3) return;
    setUploading(true);
    setError(null);
    setProgress(files.map((f) => ({ name: f.name, done: false })));

    try {
      // 1. DB에 세션 생성
      const { data: session, error: sessionErr } = await supabase
        .from("sessions")
        .insert({ title: title.trim(), description: description.trim() || null })
        .select()
        .single();

      if (sessionErr) throw sessionErr;

      // 2. 파일들 Storage에 업로드
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const { error: uploadErr } = await supabase.storage
          .from("models")
          .upload(`${session.id}/${file.name}`, file, { upsert: true });

        setProgress((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, done: !uploadErr, error: !!uploadErr } : p
          )
        );

        if (uploadErr) throw new Error(`${file.name} 업로드 실패`);
      }

      // 3. 공유 URL 생성
      const url = `${window.location.origin}/review/${session.id}`;
      setShareUrl(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  async function copyUrl() {
    if (shareUrl) await navigator.clipboard.writeText(shareUrl);
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
        <div className="glass rounded-xl p-4 flex items-center gap-3 w-full max-w-md">
          <Link className="w-4 h-4 text-purple-400 flex-shrink-0" />
          <span className="text-sm text-slate-300 flex-1 truncate">{shareUrl}</span>
          <button
            onClick={copyUrl}
            className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1.5 rounded-lg transition-all"
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
          className="w-full glass rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-purple-500/50"
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

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
          dragging
            ? "border-purple-400 bg-purple-500/10"
            : "border-white/10 hover:border-purple-500/40"
        }`}
      >
        <input
          type="file"
          multiple
          accept=".moc3,.json,.png,.jpg"
          onChange={onFileInput}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
        <FileUp className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <p className="text-sm text-slate-400">
          파일을 드래그하거나 클릭해서 선택
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Cubism Editor → 파일 → 내보내기 → moc3 내보내기 후 폴더 전체 선택
        </p>
        <p className="text-xs text-slate-600 mt-0.5">
          .moc3, .model3.json, 텍스처(.png) 필요
        </p>
      </div>

      {/* 필수 파일 체크 */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-3">
            <span className={`text-xs px-2 py-1 rounded-full ${hasMoc3 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              {hasMoc3 ? "✓" : "✗"} .moc3
            </span>
            <span className={`text-xs px-2 py-1 rounded-full ${hasModel3 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              {hasModel3 ? "✓" : "✗"} .model3.json
            </span>
          </div>

          <div className="space-y-1">
            {files.map((f, i) => {
              const p = progress[i];
              return (
                <div key={f.name} className="flex items-center gap-2 glass rounded-lg px-3 py-2">
                  <span className="text-xs text-slate-400 flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-slate-600">
                    {(f.size / 1024 / 1024).toFixed(1)}MB
                  </span>
                  {p ? (
                    p.error ? <AlertCircle className="w-4 h-4 text-red-400" /> :
                    p.done ? <CheckCircle className="w-4 h-4 text-green-400" /> :
                    <div className="w-4 h-4 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
                  ) : (
                    <button onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                      <X className="w-4 h-4 text-slate-600 hover:text-red-400" />
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
