import { getAdminClient, MISSING_KEY_MSG } from "@/lib/supabaseAdmin";

// 이 세션(버전)의 아트메쉬 id 목록 저장 — 버전 간 메쉬 차이 비교용 메타데이터.
// 공개 모델 파일에서 유도되는 값이라 비번 없이 자동 저장(비파괴적).
export async function POST(request: Request) {
  let body: { sessionId?: string; meshIds?: string[] };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청" }, { status: 400 }); }

  const { sessionId, meshIds } = body;
  if (!sessionId || !Array.isArray(meshIds)) return Response.json({ error: "잘못된 요청" }, { status: 400 });

  const sb = getAdminClient();
  if (!sb) return Response.json({ error: MISSING_KEY_MSG }, { status: 500 });
  try {
    const { error } = await sb.from("sessions").update({ mesh_ids: meshIds }).eq("id", sessionId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "저장 실패";
    return Response.json({ error: msg }, { status: 500 });
  }
}
