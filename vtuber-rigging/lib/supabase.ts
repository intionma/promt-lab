import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type Session = {
  id: string;
  title: string;
  description: string | null;
  model_name: string | null;
  created_at: string;
  expires_at: string;
};

// 이 브라우저에서 업로드한 세션 ID 추적 (로그인 없이 "내 모델" 구현)
const MY_SESSIONS_KEY = "my_sessions";

export function getMySessionIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(MY_SESSIONS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addMySessionId(id: string) {
  if (typeof window === "undefined") return;
  const ids = getMySessionIds();
  if (!ids.includes(id)) {
    localStorage.setItem(MY_SESSIONS_KEY, JSON.stringify([id, ...ids]));
  }
}

export function removeMySessionId(id: string) {
  if (typeof window === "undefined") return;
  const ids = getMySessionIds().filter((x) => x !== id);
  localStorage.setItem(MY_SESSIONS_KEY, JSON.stringify(ids));
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

// 바이트를 읽기 좋은 단위로
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Supabase 무료 플랜 Storage 한도 (1GB)
export const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;

// 삭제 비밀번호
export const DELETE_PASSWORD = "12290505";

export type Feedback = {
  id: string;
  session_id: string;
  author: string;
  param_name: string | null;
  param_value: number | null;
  comment: string;
  created_at: string;
};
