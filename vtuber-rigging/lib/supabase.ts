import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 사용자가 만든 ArtMesh 그룹 + 숨김 상태 (모두에게 공유 저장)
// shared: 이 폴더가 같은 모델의 다른 버전과 공유됨. sharedIds: 마지막 공유 시점의 멤버(수정 감지용)
export type MeshGroup = { id: string; name: string; ids: string[]; shared?: boolean; sharedIds?: string[] };
// 전신/상반신 고정 카메라 프레이밍 보정(모델별 공유). dx·dy = 픽셀 이동, zoom = 배율.
export type FrameAdjust = { dx: number; dy: number; zoom: number };
export type ViewFrame = { fullbody?: FrameAdjust; upperbody?: FrameAdjust };
export type MeshConfig = { groups: MeshGroup[]; hidden: string[]; viewFrame?: ViewFrame };

export type Session = {
  id: string;
  title: string;
  description: string | null;
  model_name: string | null;
  owner_hash: string | null;
  created_at: string;
  expires_at: string;
  // 메쉬 그룹/숨김 설정 (컬럼 없으면 undefined)
  mesh_config?: MeshConfig | null;
  // 갤러리 내 수동 정렬 순서 (작을수록 위, 컬럼 없으면 undefined)
  sort_order?: number | null;
  // 모델(그룹) 표시 순서 — 같은 그룹의 모든 세션이 동일 값(작을수록 위, 모두에게 공유. 컬럼 없으면 undefined)
  group_order?: number | null;
  // 이 버전의 아트메쉬 id 목록 (버전 간 메쉬 차이 비교용, 컬럼 없으면 undefined)
  mesh_ids?: string[] | null;
};

// ===== PIN 기반 소유권 (모든 기기에서 내 모델 보기) =====
// PIN은 SHA-256으로 해싱해서만 저장/조회 — 평문은 어디에도 남지 않음
const PIN_SALT = "vtuber-rig::"; // 레인보우 테이블 방지용 솔트

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(PIN_SALT + pin);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const OWNER_HASH_KEY = "owner_hash";

export function getOwnerHash(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(OWNER_HASH_KEY);
}

export function setOwnerHash(hash: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(OWNER_HASH_KEY, hash);
}

export function clearOwnerHash() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(OWNER_HASH_KEY);
}

// Storage 폴더 안의 모든 파일 경로를 재귀적으로 수집
export async function listAllStorageFiles(prefix: string): Promise<string[]> {
  const { data } = await supabase.storage.from("models").list(prefix, { limit: 1000 });
  if (!data) return [];
  let paths: string[] = [];
  for (const item of data) {
    const full = `${prefix}/${item.name}`;
    if (item.id === null) {
      // 폴더면 재귀
      paths = paths.concat(await listAllStorageFiles(full));
    } else {
      paths.push(full);
    }
  }
  return paths;
}

// Storage 폴더의 총 용량(바이트)을 재귀적으로 계산
export async function getStorageUsage(prefix: string): Promise<number> {
  const { data } = await supabase.storage.from("models").list(prefix, { limit: 1000 });
  if (!data) return 0;
  let total = 0;
  for (const item of data) {
    const full = `${prefix}/${item.name}`;
    if (item.id === null) {
      total += await getStorageUsage(full);
    } else {
      total += (item.metadata?.size as number) || 0;
    }
  }
  return total;
}

// 파일 경로 + 크기를 재귀적으로 수집
export async function listFilesWithMeta(prefix: string): Promise<{ path: string; size: number }[]> {
  const { data } = await supabase.storage.from("models").list(prefix, { limit: 1000 });
  if (!data) return [];
  let out: { path: string; size: number }[] = [];
  for (const item of data) {
    const full = `${prefix}/${item.name}`;
    if (item.id === null) {
      out = out.concat(await listFilesWithMeta(full));
    } else {
      out.push({ path: full, size: (item.metadata?.size as number) || 0 });
    }
  }
  return out;
}

// 스토리지 경로의 공개 URL
export function publicUrl(path: string): string {
  return supabase.storage.from("models").getPublicUrl(path).data.publicUrl;
}

// ===== 드라이브(자유 백업) =====
export const DRIVE_PREFIX = "drive";

export async function listDriveFiles(): Promise<{ path: string; size: number; name: string }[]> {
  const files = await listFilesWithMeta(DRIVE_PREFIX);
  return files.map((f) => ({ ...f, name: f.path.replace(new RegExp(`^${DRIVE_PREFIX}/`), "") }));
}

// 바이트를 읽기 좋은 단위로
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Supabase 무료 플랜 Storage 한도 (1GB)
export const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;

export type Feedback = {
  id: string;
  session_id: string;
  author: string;
  param_name: string | null;
  param_value: number | null;
  comment: string;
  created_at: string;
  // 코멘트 작성 시점의 뷰어 상태(파라미터·시점·줌 등) — 선택(컬럼 없으면 무시)
  state?: Record<string, unknown> | null;
};
