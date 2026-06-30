import { createClient } from "@supabase/supabase-js";
import { checkAdminPassword } from "@/lib/auth";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// 세션(버전)을 다른 모델로 이동 — model_name 변경
export async function POST(request: Request) {
  let body: { sessionId?: string; modelName?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { sessionId, modelName, password } = body;
  if (!checkAdminPassword(password)) {
    return Response.json({ error: "비밀번호가 틀렸어요" }, { status: 403 });
  }
  if (!sessionId || !modelName) {
    return Response.json({ error: "세션 ID/모델 이름이 없어요" }, { status: 400 });
  }

  try {
    const supabase = adminClient();
    const { error } = await supabase
      .from("sessions")
      .update({ model_name: modelName })
      .eq("id", sessionId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "이동 실패";
    return Response.json({ error: msg }, { status: 500 });
  }
}
