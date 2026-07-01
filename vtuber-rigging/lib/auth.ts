// 서버 전용 — 삭제/이동/저장 등 변경 작업의 비밀번호 검증.
// 보안: DELETE_PASSWORD 환경변수가 '설정돼 있으면 그 값만' 허용(소스에 공개된 기본 PIN은 비활성화).
//       미설정일 때만 기본 PIN "12290505" 를 허용(개발/데모 편의).
// 비교는 timingSafeEqual 로 상수시간 처리(타이밍 부채널 차단).
import { timingSafeEqual } from "crypto";

const DEFAULT_PASSWORD = "12290505";

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

export function checkAdminPassword(input: unknown): boolean {
  if (typeof input !== "string") return false;
  const given = input.trim();
  if (!given) return false;

  const env = (process.env.DELETE_PASSWORD || "").trim();
  // 환경변수가 설정돼 있으면 그 값만 인정(기본 PIN 완전 비활성화 → 진짜 잠금).
  if (env) return safeEq(given, env);
  // 미설정 시에만 소스 공개 기본 PIN 허용.
  return safeEq(given, DEFAULT_PASSWORD);
}
