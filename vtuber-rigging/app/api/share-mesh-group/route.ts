import { getAdminClient, MISSING_KEY_MSG } from "@/lib/supabaseAdmin";
import { rateLimit } from "@/lib/apiGuard";
import { checkAdminPassword } from "@/lib/auth";

type Group = { id: string; name: string; ids: string[]; shared?: boolean; sharedIds?: string[] };
type Cfg = { groups?: Group[]; hidden?: string[] };

// 폴더(그룹) 하나를 같은 모델의 모든 버전에 이름 기준으로 공유(생성/갱신)
export async function POST(request: Request) {
  const _rl = rateLimit(request);
  if (_rl) return _rl;
  let body: { sessionId?: string; group?: { name?: string; ids?: string[] }; password?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청" }, { status: 400 }); }

  const { sessionId, group, password } = body;
  if (!checkAdminPassword(password)) return Response.json({ error: "비밀번호가 틀렸어요" }, { status: 403 });
  const name = (group?.name ?? "").trim();
  const ids = Array.isArray(group?.ids) ? group!.ids : null;
  if (!sessionId || !name || !ids) return Response.json({ error: "잘못된 요청" }, { status: 400 });

  const sb = getAdminClient();
  if (!sb) return Response.json({ error: MISSING_KEY_MSG }, { status: 500 });

  try {
    const { data: cur } = await sb.from("sessions").select("model_name").eq("id", sessionId).single();
    const modelName = cur?.model_name ?? null;

    // 대상 세션들: 같은 model_name (없으면 자기 자신만)
    const targets = modelName
      ? (await sb.from("sessions").select("id, mesh_config").eq("model_name", modelName)).data ?? []
      : (await sb.from("sessions").select("id, mesh_config").eq("id", sessionId)).data ?? [];

    for (const t of targets) {
      const cfg = ((t as { mesh_config: Cfg | null }).mesh_config) ?? {};
      const groups: Group[] = Array.isArray(cfg.groups) ? [...cfg.groups] : [];
      const idx = groups.findIndex((g) => g.name === name);
      const shared: Group = idx >= 0
        ? { ...groups[idx], name, ids, shared: true, sharedIds: ids }
        : { id: `g_${name}_${(t as { id: string }).id}`, name, ids, shared: true, sharedIds: ids };
      if (idx >= 0) groups[idx] = shared; else groups.push(shared);
      const next = { groups, hidden: Array.isArray(cfg.hidden) ? cfg.hidden : [] };
      const { error } = await sb.from("sessions").update({ mesh_config: next }).eq("id", (t as { id: string }).id);
      if (error) throw error;
    }
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "공유 실패";
    return Response.json({ error: msg }, { status: 500 });
  }
}
