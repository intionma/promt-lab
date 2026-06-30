import { createClient } from "@supabase/supabase-js";

// 서버 전용 클라이언트 (service_role — 브라우저 노출 안 됨)
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// 메쉬 그룹/숨김 설정을 세션에 저장 → 모두에게 공유 반영
export async function POST(request: Request) {
  let body: { sessionId?: string; config?: unknown; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { sessionId, config, password } = body;
  const expected = process.env.DELETE_PASSWORD || "12290505";
  if (!password || password !== expected) {
    return Response.json({ error: "비밀번호가 틀렸어요" }, { status: 403 });
  }
  if (!sessionId) {
    return Response.json({ error: "세션 ID가 없어요" }, { status: 400 });
  }

  try {
    const supabase = adminClient();
    const { error } = await supabase
      .from("sessions")
      .update({ mesh_config: config })
      .eq("id", sessionId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "저장 실패";
    // mesh_config 컬럼이 없을 때 안내
    return Response.json({ error: msg }, { status: 500 });
  }
}
