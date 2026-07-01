import { createClient } from "@supabase/supabase-js";

// 서버 전용 관리자 클라이언트 (service_role 키 — 브라우저에 절대 노출 안 됨).
// 키가 없으면 createClient 가 'supabaseKey is required' 로 터지므로, 미리 null 반환 + 안내.
export const MISSING_KEY_MSG =
  "서버 설정 오류: SUPABASE_SERVICE_ROLE_KEY 환경변수가 없어요. Vercel → 프로젝트 → Settings → Environment Variables 에 추가하고 재배포해 주세요.";

export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
