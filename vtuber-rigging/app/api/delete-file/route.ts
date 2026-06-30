import { createClient } from "@supabase/supabase-js";
import { checkAdminPassword } from "@/lib/auth";

// 서버 전용 클라이언트 (service_role — 브라우저 노출 안 됨)
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// 드라이브(백업) 파일 삭제 — drive/ 경로만 허용
export async function POST(request: Request) {
  let body: { path?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { path, password } = body;
  if (!checkAdminPassword(password)) {
    return Response.json({ error: "비밀번호가 틀렸어요" }, { status: 403 });
  }
  if (!path || typeof path !== "string" || !path.startsWith("drive/")) {
    return Response.json({ error: "잘못된 경로" }, { status: 400 });
  }

  try {
    const supabase = adminClient();
    const { error } = await supabase.storage.from("models").remove([path]);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "삭제 중 오류가 발생했어요" }, { status: 500 });
  }
}
