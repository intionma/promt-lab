import { getAdminClient, MISSING_KEY_MSG } from "@/lib/supabaseAdmin";
import { checkAdminPassword } from "@/lib/auth";

// 전신/상반신 카메라 프레이밍 보정을 같은 모델(model_name)의 모든 버전에 공유 저장.
// mesh_config.viewFrame 에 얹어 저장(groups/hidden 은 그대로 보존).
export async function POST(request: Request) {
  let body: { modelName?: string | null; sessionId?: string; frame?: unknown; password?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청" }, { status: 400 }); }

  const { modelName, sessionId, frame, password } = body;
  if (!checkAdminPassword(password)) return Response.json({ error: "비밀번호가 틀렸어요" }, { status: 403 });

  try {
    const sb = getAdminClient();
    if (!sb) return Response.json({ error: MISSING_KEY_MSG }, { status: 500 });

    // 대상 세션 집합: model_name 이 있으면 같은 모델 전체, 없으면 해당 세션만
    let rows: { id: string; mesh_config: unknown }[] = [];
    if (modelName) {
      const { data } = await sb.from("sessions").select("id, mesh_config").eq("model_name", modelName);
      rows = (data ?? []) as { id: string; mesh_config: unknown }[];
    } else if (sessionId) {
      const { data } = await sb.from("sessions").select("id, mesh_config").eq("id", sessionId);
      rows = (data ?? []) as { id: string; mesh_config: unknown }[];
    } else {
      return Response.json({ error: "대상이 없어요" }, { status: 400 });
    }

    for (const r of rows) {
      const mc = (r.mesh_config as Record<string, unknown>) ?? {};
      const next = { ...mc, viewFrame: frame ?? null };
      const { error } = await sb.from("sessions").update({ mesh_config: next }).eq("id", r.id);
      if (error) throw error;
    }
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "저장 실패";
    return Response.json({ error: msg }, { status: 500 });
  }
}
