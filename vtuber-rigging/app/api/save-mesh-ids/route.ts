import { getAdminClient, MISSING_KEY_MSG } from "@/lib/supabaseAdmin";
import { rateLimit } from "@/lib/apiGuard";

// 이 세션(버전)의 아트메쉬 id 목록 저장 — 버전 간 메쉬 차이 비교용 메타데이터.
// 공개 모델 파일에서 유도되는 값이라 비번 없이 자동 저장되지만, service_role 쓰기이므로 남용을 막는다:
//  · 엄격한 형식/크기 검증(DB 부풀리기 방지)
//  · '최초 1회만' 기록(이미 값이 있으면 덮어쓰지 않음 → 임의 변조 방지)
//  · 레이트리밋
export async function POST(request: Request) {
  const limited = rateLimit(request, 60, 60_000);
  if (limited) return limited;

  let body: { sessionId?: string; meshIds?: string[] };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청" }, { status: 400 }); }

  const { sessionId, meshIds } = body;
  if (!sessionId || typeof sessionId !== "string" || !Array.isArray(meshIds)) {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }
  // 크기·형식 제한 (남용 방지)
  if (meshIds.length > 5000 || !meshIds.every((x) => typeof x === "string" && x.length <= 256)) {
    return Response.json({ error: "형식 오류" }, { status: 400 });
  }

  const sb = getAdminClient();
  if (!sb) return Response.json({ error: MISSING_KEY_MSG }, { status: 500 });
  try {
    // 대상 세션이 있고, 아직 mesh_ids 가 비어있을 때만 기록(최초 1회 — 변조 방지)
    const { data: cur } = await sb.from("sessions").select("mesh_ids").eq("id", sessionId).single();
    if (!cur) return Response.json({ error: "세션이 없어요" }, { status: 404 });
    if (Array.isArray(cur.mesh_ids) && cur.mesh_ids.length > 0) {
      return Response.json({ ok: true, skipped: true }); // 이미 설정됨 → 덮어쓰지 않음
    }
    const { error } = await sb.from("sessions").update({ mesh_ids: meshIds }).eq("id", sessionId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "저장 실패";
    return Response.json({ error: msg }, { status: 500 });
  }
}
