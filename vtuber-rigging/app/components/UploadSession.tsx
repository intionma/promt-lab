"use client";

import { useState, useCallback, useEffect } from "react";
import { Upload, FileUp, Link, CheckCircle, AlertCircle, X, FolderOpen } from "lucide-react";
import { supabase, addMySessionId } from "@/lib/supabase";

type UploadedFile = { name: string; done: boolean; error?: boolean };

// .model3.json 파일명에서 모델 이름 추출 (e.g. "rina.model3.json" → "rina")
function extractModelName(files: File[]): string | null {
  const model3 = files.find((f) => f.name.endsWith(".model3.json"));
  if (!model3) return null;
  return model3.name.replace(/\.model3\.json$/i, "");
}

// Live2D 런타임에 실제로 필요한 파일만 통과 (cmo3, psd 등 작업 파일은 제외)
const RUNTIME_EXTENSIONS = [
  ".moc3",
  ".model3.json",
  ".physics3.json",
  ".pose3.json",
  ".exp3.json",
  ".motion3.json",
  ".cdi3.json",
  ".userdata3.json",
  ".png",
  ".jpg",
  ".jpeg",
];

function isRuntimeFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return RUNTIME_EXTENSIONS.some((ext) => name.endsWith(ext));
}

// 파일의 저장 경로 계산 (폴더 구조 유지) — 최상위 폴더명 제거
function getStoragePath(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (rel) {
    const parts = rel.split("/");
    return parts.slice(1).join("/") || file.name;
  }
  return file.name;
}

// 경로 정규화 (./ 제거)
function normalizePath(p: string): string {
  return p.replace(/^\.\//, "").replace(/\\/g, "/");
}

// model3.json을 파싱해서 참조하는 모든 파일이 실제로 선택됐는지 검사
async function findMissingFiles(files: File[]): Promise<string[]> {
  const model3 = files.find((f) => f.name.endsWith(".model3.json"));
  if (!model3) return [];

  let json: {
    FileReferences?: {
      Moc?: string;
      Textures?: string[];
      Physics?: string;
      Pose?: string;
      DisplayInfo?: string;
      UserData?: string;
      Expressions?: { File?: string }[];
      Motions?: Record<string, { File?: string }[]>;
    };
  };
  try {
    json = JSON.parse(await model3.text());
  } catch {
    return ["__PARSE_ERROR__"];
  }

  const refs = json.FileReferences || {};
  const referenced: string[] = [];
  if (refs.Moc) referenced.push(refs.Moc);
  if (Array.isArray(refs.Textures)) referenced.push(...refs.Textures);
  if (refs.Physics) referenced.push(refs.Physics);
  if (refs.Pose) referenced.push(refs.Pose);
  if (refs.DisplayInfo) referenced.push(refs.DisplayInfo);
  if (refs.UserData) referenced.push(refs.UserData);
  if (Array.isArray(refs.Expressions))
    referenced.push(...refs.Expressions.map((e) => e.File).filter((x): x is string => !!x));
  if (refs.Motions)
    for (const group of Object.values(refs.Motions))
      if (Array.isArray(group))
        referenced.push(...group.map((m) => m.File).filter((x): x is string => !!x));

  // model3.json 위치 기준으로 참조 경로 해석
  const model3Path = getStoragePath(model3);
  const baseDir = model3Path.includes("/")
    ? model3Path.slice(0, model3Path.lastIndexOf("/") + 1)
    : "";

  const available = new Set(files.map((f) => normalizePath(getStoragePath(f))));

  const missing: string[] = [];
  for (const ref of referenced) {
    const expected = normalizePath(baseDir + normalizePath(ref));
    if (!available.has(expected)) missing.push(ref);
  }
  return missing;
}

export default function UploadSession() {
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadedFile[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);

  const moc3Count = files.filter((f) => f.name.endsWith(".moc3")).length;
  const model3Count = files.filter((f) => f.name.endsWith(".model3.json")).length;
  const hasModel3 = model3Count > 0;
  const hasMoc3 = moc3Count > 0;
  // moc3 / model3.json은 모델당 1개여야 함 — 2개 이상이면 다른 모델이 섞인 것
  const tooManyMain = moc3Count > 1 || model3Count > 1;
  const parseError = missingFiles.includes("__PARSE_ERROR__");
  const realMissing = missingFiles.filter((m) => m !== "__PARSE_ERROR__");

  // 모델 파일이 선택되면 세션 이름을 모델 파일명으로 자동 설정 (사용자가 직접 수정하기 전까지)
  useEffect(() => {
    if (titleEdited) return;
    const name = extractModelName(files);
    if (name) setTitle(name);
  }, [files, titleEdited]);

  // 파일이 바뀔 때마다 model3.json이 참조하는 파일이 다 있는지 검사
  useEffect(() => {
    let cancelled = false;
    findMissingFiles(files).then((m) => {
      if (!cancelled) setMissingFiles(m);
    });
    return () => { cancelled = true; };
  }, [files]);

  const addFiles = useCallback((incoming: File[]) => {
    // 런타임에 필요한 파일만 통과 (cmo3, psd 등은 제외)
    const runtime = incoming.filter(isRuntimeFile);
    const skipped = incoming.length - runtime.length;
    if (skipped > 0) setSkippedCount((c) => c + skipped);

    setFiles((prev) => {
      const names = new Set(prev.map((f) => getStoragePath(f)));
      return [...prev, ...runtime.filter((f) => !names.has(getStoragePath(f)))];
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
    if (!hasModel3 || !hasMoc3) return;
    setUploading(true);
    setError(null);
    setProgress(files.map((f) => ({ name: getStoragePath(f), done: false })));

    const modelName = extractModelName(files);
    const finalTitle =
      title.trim() || modelName || `리깅 리뷰 ${new Date().toLocaleDateString("ko-KR")}`;

    try {
      const { data: session, error: sessionErr } = await supabase
        .from("sessions")
        .insert({
          title: finalTitle,
          description: description.trim() || null,
          model_name: modelName,
        })
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

      addMySessionId(session.id);
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
            setTitleEdited(false);
            setDescription("");
            setProgress([]);
            setSkippedCount(0);
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
        <label className="text-xs text-slate-400">세션 이름 (모델 파일명 자동)</label>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleEdited(true);
          }}
          placeholder="모델 파일을 올리면 자동으로 채워져요"
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

          {skippedCount > 0 && (
            <p className="text-[11px] text-slate-500">
              💡 런타임에 불필요한 파일 {skippedCount}개는 자동 제외됐어요 (cmo3, psd 등)
            </p>
          )}

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

      {/* model3.json 파싱 오류 */}
      {parseError && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-400 flex gap-2 bg-red-500/10 border border-red-500/30">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">model3.json 파일이 손상됐어요</p>
            <p className="text-xs text-red-400/70 mt-0.5">Cubism Editor에서 다시 내보내 주세요</p>
          </div>
        </div>
      )}

      {/* moc3 / model3.json 중복 경고 */}
      {tooManyMain && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 space-y-1">
          <div className="flex gap-2 items-center font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            모델 파일이 중복됐어요
          </div>
          <p className="text-xs text-red-400/70">
            {moc3Count > 1 && `.moc3 ${moc3Count}개 `}
            {model3Count > 1 && `.model3.json ${model3Count}개 `}
            — 한 모델에는 각각 1개만 있어야 해요. 다른 모델 폴더가 섞였는지 확인해주세요.
          </p>
        </div>
      )}

      {/* 참조 파일 누락 경고 */}
      {realMissing.length > 0 && (
        <div className="rounded-xl px-4 py-3 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 space-y-1.5">
          <div className="flex gap-2 items-center font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            빠진 파일이 {realMissing.length}개 있어요
          </div>
          <p className="text-xs text-amber-400/70">
            이대로 올리면 모델이 깨지거나 안 보일 수 있어요. 폴더 전체를 선택했는지 확인하세요.
          </p>
          <div className="space-y-0.5 max-h-24 overflow-y-auto chat-scroll">
            {realMissing.map((m) => (
              <p key={m} className="text-xs font-mono text-amber-300/80 truncate">· {m}</p>
            ))}
          </div>
        </div>
      )}

      {/* 모든 파일 정상 */}
      {hasModel3 && hasMoc3 && !parseError && !tooManyMain && realMissing.length === 0 && files.length > 0 && (
        <div className="rounded-xl px-4 py-2.5 text-sm text-green-400 bg-green-500/10 border border-green-500/30 flex gap-2 items-center">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          필요한 파일이 모두 준비됐어요
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
        disabled={uploading || !hasModel3 || !hasMoc3 || parseError || tooManyMain}
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
