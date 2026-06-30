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

  // 비밀번호 검증 (서버 환경변수와 비교 — 브라우저 코드엔 없음)
  if (!password || password !== process.env.DELETE_PASSWORD) {
    return Response.json({ error: "비밀번호가 틀렸어요" }, { status: 403 });
  }

  if (!sessionId) {
    return Response.json({ error: "세션 ID가 없어요" }, { status: 400 });
  }

  try {
    const supabase = adminClient();

    // 1. Storage 파일 전체 삭제
    const paths = await listAll(supabase, sessionId);
    if (paths.length > 0) {
      await supabase.storage.from("models").remove(paths);
    }

    // 2. DB 행 삭제 (피드백도 cascade)
    const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
    if (error) throw error;

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "삭제 중 오류가 발생했어요" }, { status: 500 });
  }
}
