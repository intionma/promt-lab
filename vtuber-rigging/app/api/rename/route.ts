import { getAdminClient, MISSING_KEY_MSG } from "@/lib/supabaseAdmin";
import { rateLimit } from "@/lib/apiGuard";
import { checkAdminPassword } from "@/lib/auth";


// 이름 수정 — scope="model"(그룹의 여러 세션 model_name 일괄) / "version"(단일 세션 title[+description])
export async function POST(request: Request) {
  const _rl = rateLimit(request);
  if (_rl) return _rl;
  let body: { scope?: string; ids?: string[]; sessionId?: string; newName?: string; description?: string | null; password?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청" }, { status: 400 }); }

  const { scope, ids, sessionId, newName, description, password } = body;
  if (!checkAdminPassword(password)) return Response.json({ error: "비밀번호가 틀렸어요" }, { status: 403 });
  const name = (newName ?? "").trim();
  if (!name) return Response.json({ error: "이름이 비었어요" }, { status: 400 });

  try {
    const sb = getAdminClient();
    if (!sb) return Response.json({ error: MISSING_KEY_MSG }, { status: 500 });
    if (scope === "model") {
      if (!Array.isArray(ids) || ids.length === 0) return Response.json({ error: "대상이 없어요" }, { status: 400 });
      const { error } = await sb.from("sessions").update({ model_name: name }).in("id", ids);
      if (error) throw error;
    } else if (scope === "version") {
      if (!sessionId) return Response.json({ error: "세션 ID가 없어요" }, { status: 400 });
      // description 이 요청에 포함되면 함께 갱신 (제목·설명 동시 편집)
      const update: { title: string; description?: string | null } = { title: name };
      if (description !== undefined) update.description = (description ?? "").trim() || null;
      const { error } = await sb.from("sessions").update(update).eq("id", sessionId);
      if (error) throw error;
    } else {
      return Response.json({ error: "scope 오류" }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "이름 수정 실패";
    return Response.json({ error: msg }, { status: 500 });
  }
}
