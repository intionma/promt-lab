import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// 코멘트(피드백) 삭제 — 비밀번호 보호
export async function POST(request: Request) {
  let body: { feedbackId?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { feedbackId, password } = body;
  const expected = process.env.DELETE_PASSWORD || "12290505";
  if (!password || password !== expected) {
    return Response.json({ error: "비밀번호가 틀렸어요" }, { status: 403 });
  }
  if (!feedbackId) {
    return Response.json({ error: "ID가 없어요" }, { status: 400 });
  }

  try {
    const supabase = adminClient();
    const { error } = await supabase.from("feedback").delete().eq("id", feedbackId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "삭제 실패";
    return Response.json({ error: msg }, { status: 500 });
  }
}
