// 서버 전용 — 삭제/이동/저장 등 변경 작업의 비밀번호 검증.
// 기본값 "12290505" 는 항상 허용(소스에 공개된 기본값).
// Vercel 환경변수 DELETE_PASSWORD 가 설정돼 있으면 그 값도 함께 허용.
// 양쪽 모두 공백을 제거해 비교 → 환경변수/입력의 줄바꿈·공백으로 인한 오작동 방지.
const DEFAULT_PASSWORD = "12290505";

export function checkAdminPassword(input: unknown): boolean {
  if (typeof input !== "string") return false;
  const given = input.trim();
  if (!given) return false;
  if (given === DEFAULT_PASSWORD) return true;
  const env = (process.env.DELETE_PASSWORD || "").trim();
  return env !== "" && given === env;
}
