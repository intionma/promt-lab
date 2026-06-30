import { createClient } from "@supabase/supabase-js";

// 서버 전용 클라이언트 (service_role 키는 RLS를 우회 — 브라우저에 절대 노출 안 됨)
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// 폴더 안 모든 파일 경로 재귀 수집
async function listAll(
  supabase: ReturnType<typeof adminClient>,
  prefix: string
): Promise<string[]> {
  const { data } = await supabase.storage.from("models").list(prefix, { limit: 1000 });
  if (!data) return [];
  let paths: string[] = [];
  for (const item of data) {
    const full = `${prefix}/${item.name}`;
    if (item.id === null) {
      paths = paths.concat(await listAll(supabase, full));
    } else {
      paths.push(full);
    }
  }
  return paths;
}

export async function POST(request: Request) {
  let body: { sessionId?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { sessionId, password } = body;

  // 비밀번호 검증 (서버 전용 — 브라우저 코드엔 노출 안 됨).
  // Vercel 환경변수 DELETE_PASSWORD 가 우선, 미설정 시 기본값으로 폴백.
  const expected = process.env.DELETE_PASSWORD || "12290505";
  if (!password || password !== expected) {
    return Response.json({ error: "비밀번호가 틀렸어요" }, { status: 403 });
  }

  if (!sessionId) {
    return Response.json({ error: "세션 ID가 없어요" }, { status: 400 });
  }

  try {
    const supabase = adminClient();

    // 1. Storage 파일 정리 (실패해도 DB 행은 지움 — best-effort)
    try {
      const paths = await listAll(supabase, sessionId);
      if (paths.length > 0) await supabase.storage.from("models").remove(paths);
    } catch { /* 스토리지 정리 실패 무시 */ }

    // 2. 피드백 먼저 삭제 (외래키 cascade 미설정 대비)
    try { await supabase.from("feedback").delete().eq("session_id", sessionId); } catch { /* noop */ }

    // 3. 세션 행 삭제
    const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
    if (error) throw error;

    return Response.json({ ok: true });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
    return Response.json({ error: `삭제 실패: ${msg}` }, { status: 500 });
  }
}
