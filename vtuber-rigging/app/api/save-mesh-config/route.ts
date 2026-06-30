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

// 메쉬 그룹/숨김 설정을 세션에 저장 → 모두에게 공유 반영
export async function POST(request: Request) {
  let body: { sessionId?: string; config?: unknown; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { sessionId, config, password } = body;
  if (!checkAdminPassword(password)) {
    return Response.json({ error: "비밀번호가 틀렸어요" }, { status: 403 });
  }
  if (!sessionId) {
    return Response.json({ error: "세션 ID가 없어요" }, { status: 400 });
  }

  try {
    const supabase = adminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = config as any;
    const groups = cfg?.groups ?? [];
    const hidden = cfg?.hidden ?? [];

    // 같은 모델(model_name)의 모든 버전에 '그룹'은 공유, '숨김'은 현재 버전만
    const { data: cur } = await supabase.from("sessions").select("model_name").eq("id", sessionId).single();
    const modelName = cur?.model_name ?? null;

    if (modelName) {
      const { data: siblings } = await supabase.from("sessions").select("id, mesh_config").eq("model_name", modelName);
      for (const s of siblings ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing = (s as any).mesh_config ?? {};
        const next = {
          groups,
          hidden: s.id === sessionId ? hidden : (existing.hidden ?? []),
        };
        const { error } = await supabase.from("sessions").update({ mesh_config: next }).eq("id", s.id);
        if (error) throw error;
      }
    } else {
      const { error } = await supabase.from("sessions").update({ mesh_config: { groups, hidden } }).eq("id", sessionId);
      if (error) throw error;
    }
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "저장 실패";
    // mesh_config 컬럼이 없을 때 안내
    return Response.json({ error: msg }, { status: 500 });
  }
}
