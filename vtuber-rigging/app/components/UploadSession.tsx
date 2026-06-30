"use client";

import { useState, useCallback, useEffect } from "react";
import { Upload, FileUp, Link, CheckCircle, AlertCircle, X, FolderOpen } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Props = {
  ownerHash: string;
};

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

export default function UploadSession({ ownerHash }: Props) {
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

    const insertData = {
      title: finalTitle,
      description: description.trim() || null,
      model_name: modelName,
      owner_hash: ownerHash,
    };

    try {
      const { data: session, error: sessionErr } = await supabase
        .from("sessions")
        .insert(insertData)
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
      // Supabase 오류(PostgrestError 등)는 Error 인스턴스가 아니라 객체 — 실제 메시지를 꺼냄
      let msg = "업로드 실패";
      if (err instanceof Error) msg = err.message;
      else if (err && typeof err === "object" && "message" in err) {
        msg = String((err as { message: unknown }).message);
      }
      setError(msg);
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
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 fade-up">
        <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center glow">
          <CheckCircle className="w-10 h-10 text-green-400" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold text-[var(--fg)]">업로드 완료! 🎉</h2>
          <p className="text-sm text-[var(--muted)]">아래 링크를 친구들에게 공유하세요</p>
        </div>
        <div className="glass rounded-xl p-3 flex items-center gap-2 w-full">
          <Link className="w-4 h-4 text-[var(--purple)] flex-shrink-0" />
          <span className="text-xs text-[var(--fg)] flex-1 truncate font-mono">{shareUrl}</span>
          <button
            onClick={copyUrl}
            className="bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] text-white text-xs px-4 py-2 rounded-lg transition-all whitespace-nowrap font-medium"
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
          className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition-all"
        >
          + 새 세션 만들기
        </button>
      </div>
    );
  }

  const allGood = hasModel3 && hasMoc3 && !parseError && !tooManyMain && realMissing.length === 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto chat-scroll p-4 gap-3.5">
      <div className="space-y-1.5">
        <label className="text-xs text-[var(--muted)] px-1">세션 이름</label>
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setTitleEdited(true); }}
          placeholder="모델 파일을 올리면 자동으로 채워져요"
          className="w-full glass rounded-xl px-4 py-3 text-sm placeholder-[var(--muted)]/60 outline-none focus:border-[var(--purple)]/50 transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-[var(--muted)] px-1">설명 (선택)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="친구들에게 확인 요청할 내용..."
          rows={2}
          className="w-full glass rounded-xl px-4 py-3 text-sm placeholder-[var(--muted)]/60 outline-none resize-none focus:border-[var(--purple)]/50 transition-colors"
        />
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
          dragging ? "border-[var(--purple)] bg-[var(--purple)]/10 scale-[1.01]" : "border-white/10 hover:border-[var(--purple)]/40"
        }`}
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--purple-deep)]/30 to-[var(--pink)]/20 flex items-center justify-center mx-auto mb-3">
          <FileUp className="w-6 h-6 text-[var(--purple)]" />
        </div>
        <p className="text-sm text-[var(--fg)] mb-1">파일을 드래그하거나</p>
        <p className="text-[11px] text-[var(--muted)] mb-4">
          Cubism Editor → 내보내기 → 런타임 파일 폴더 전체
        </p>
        <div className="flex gap-2 justify-center">
          <label className="relative cursor-pointer bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] rounded-lg px-4 py-2 text-xs text-white flex items-center gap-1.5 transition-all font-medium hover:opacity-90">
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
          <label className="relative cursor-pointer glass glass-hover rounded-lg px-4 py-2 text-xs text-[var(--muted)] flex items-center gap-1.5 transition-all">
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
        <div className="space-y-2 fade-up">
          <div className="flex gap-2 flex-wrap">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${hasMoc3 ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
              {hasMoc3 ? "✓" : "✗"} .moc3
            </span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${hasModel3 ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
              {hasModel3 ? "✓" : "✗"} .model3.json
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-[var(--muted)]">
              총 {files.length}개
            </span>
          </div>

          {skippedCount > 0 && (
            <p className="text-[11px] text-[var(--muted)] px-1">
              💡 불필요한 파일 {skippedCount}개는 자동 제외됐어요 (cmo3, psd 등)
            </p>
          )}

          <div className="space-y-1 max-h-40 overflow-y-auto chat-scroll">
            {files.map((f, i) => {
              const path = getStoragePath(f);
              const p = progress[i];
              return (
                <div key={path} className="flex items-center gap-2 glass rounded-lg px-3 py-1.5">
                  <span className="text-xs text-[var(--muted)] flex-1 truncate">{path}</span>
                  <span className="text-[10px] text-[var(--muted)]/60 flex-shrink-0 font-mono">
                    {(f.size / 1024).toFixed(0)}KB
                  </span>
                  {p ? (
                    p.error ? <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" /> :
                    p.done ? <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /> :
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-[var(--purple)] border-t-transparent animate-spin flex-shrink-0" />
                  ) : (
                    <button onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} className="flex-shrink-0">
                      <X className="w-3.5 h-3.5 text-[var(--muted)]/60 hover:text-red-400" />
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

      {/* 중복 경고 */}
      {tooManyMain && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 space-y-1">
          <div className="flex gap-2 items-center font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            모델 파일이 중복됐어요
          </div>
          <p className="text-xs text-red-400/70">
            {moc3Count > 1 && `.moc3 ${moc3Count}개 `}
            {model3Count > 1 && `.model3.json ${model3Count}개 `}
            — 한 모델에는 각각 1개만 있어야 해요.
          </p>
        </div>
      )}

      {/* 누락 경고 */}
      {realMissing.length > 0 && (
        <div className="rounded-xl px-4 py-3 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 space-y-1.5">
          <div className="flex gap-2 items-center font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            빠진 파일이 {realMissing.length}개 있어요
          </div>
          <p className="text-xs text-amber-400/70">
            이대로 올리면 모델이 깨질 수 있어요. 폴더 전체를 선택했는지 확인하세요.
          </p>
          <div className="space-y-0.5 max-h-24 overflow-y-auto chat-scroll">
            {realMissing.map((m) => (
              <p key={m} className="text-xs font-mono text-amber-300/80 truncate">· {m}</p>
            ))}
          </div>
        </div>
      )}

      {/* 정상 */}
      {allGood && files.length > 0 && (
        <div className="rounded-xl px-4 py-2.5 text-sm text-green-400 bg-green-500/10 border border-green-500/30 flex gap-2 items-center fade-up">
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
        className="w-full bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-3.5 text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30 mt-1"
      >
        {uploading ? (
          <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> 업로드 중...</>
        ) : (
          <><Upload className="w-4 h-4" /> 업로드 &amp; 공유 링크 생성</>
        )}
      </button>
    </div>
  );
}
