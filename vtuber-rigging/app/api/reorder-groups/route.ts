import { getAdminClient, MISSING_KEY_MSG } from "@/lib/supabaseAdmin";
import { rateLimit } from "@/lib/apiGuard";
import { checkAdminPassword } from "@/lib/auth";


// 모델(그룹) 표시 순서를 모두에게 공유 저장 — 그룹별 세션 id 묶음을 표시 순서대로 받음.
// 같은 그룹의 모든 세션에 group_order(=표시 순위)를 동일하게 기록한다.
type GroupUpdate = { ids: string[]; group_order: number };

export async function POST(request: Request) {
  const _rl = rateLimit(request);
  if (_rl) return _rl;
  let body: { groups?: GroupUpdate[]; password?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청" }, { status: 400 }); }

  const { groups, password } = body;
  if (!checkAdminPassword(password)) return Response.json({ error: "비밀번호가 틀렸어요" }, { status: 403 });
  if (!Array.isArray(groups) || groups.length === 0) return Response.json({ error: "변경 내용이 없어요" }, { status: 400 });

  try {
    const sb = getAdminClient();
    if (!sb) return Response.json({ error: MISSING_KEY_MSG }, { status: 500 });
    for (const g of groups) {
      if (!g || !Array.isArray(g.ids) || g.ids.length === 0 || typeof g.group_order !== "number") continue;
      const ids = g.ids.filter((x) => typeof x === "string").slice(0, 5000);
      if (!ids.length) continue;
      const { error } = await sb
        .from("sessions")
        .update({ group_order: g.group_order })
        .in("id", ids);
      if (error) throw error;
    }
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "순서 저장 실패";
    // group_order 컬럼이 없을 때도 이 메시지로 안내됨
    return Response.json({ error: msg }, { status: 500 });
  }
}
