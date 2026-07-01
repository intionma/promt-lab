import { checkAdminPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/apiGuard";

// 관리자 PIN 즉시 검증 (관리자 모드 진입용)
export async function POST(request: Request) {
  const _rl = rateLimit(request, 15, 60_000);
  if (_rl) return _rl;
  let body: { password?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청" }, { status: 400 }); }
  if (!checkAdminPassword(body?.password)) return Response.json({ error: "PIN이 틀렸어요" }, { status: 403 });
  return Response.json({ ok: true });
}
