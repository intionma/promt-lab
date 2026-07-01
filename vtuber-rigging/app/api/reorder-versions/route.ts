import { getAdminClient, MISSING_KEY_MSG } from "@/lib/supabaseAdmin";
import { checkAdminPassword } from "@/lib/auth";


type Update = { id: string; model_name: string; sort_order: number };

// 버전 정렬/이동 일괄 반영 — model_name(그룹) + sort_order(순서)
export async function POST(request: Request) {
  let body: { updates?: Update[]; password?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청" }, { status: 400 }); }

  const { updates, password } = body;
  if (!checkAdminPassword(password)) return Response.json({ error: "비밀번호가 틀렸어요" }, { status: 403 });
  if (!Array.isArray(updates) || updates.length === 0) return Response.json({ error: "변경 내용이 없어요" }, { status: 400 });

  try {
    const sb = getAdminClient();
    if (!sb) return Response.json({ error: MISSING_KEY_MSG }, { status: 500 });
    for (const u of updates) {
      if (!u || typeof u.id !== "string" || typeof u.model_name !== "string" || typeof u.sort_order !== "number") continue;
      const { error } = await sb
        .from("sessions")
        .update({ model_name: u.model_name, sort_order: u.sort_order })
        .eq("id", u.id);
      if (error) throw error;
    }
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "정렬 저장 실패";
    // sort_order 컬럼이 없을 때도 이 메시지로 안내됨
    return Response.json({ error: msg }, { status: 500 });
  }
}
