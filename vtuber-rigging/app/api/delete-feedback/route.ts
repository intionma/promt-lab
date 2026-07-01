import { getAdminClient, MISSING_KEY_MSG } from "@/lib/supabaseAdmin";
import { checkAdminPassword } from "@/lib/auth";


// 코멘트(피드백) 삭제 — 비밀번호 보호
export async function POST(request: Request) {
  let body: { feedbackId?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { feedbackId, password } = body;
  if (!checkAdminPassword(password)) {
    return Response.json({ error: "비밀번호가 틀렸어요" }, { status: 403 });
  }
  if (!feedbackId) {
    return Response.json({ error: "ID가 없어요" }, { status: 400 });
  }

  try {
    const supabase = getAdminClient();
    if (!supabase) return Response.json({ error: MISSING_KEY_MSG }, { status: 500 });
    const { error } = await supabase.from("feedback").delete().eq("id", feedbackId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "삭제 실패";
    return Response.json({ error: msg }, { status: 500 });
  }
}
