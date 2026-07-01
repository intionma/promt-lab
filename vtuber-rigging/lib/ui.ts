// 앱 내부 알림/입력/확인 UI — 브라우저 기본 alert/prompt/confirm 대체.
// 어디서든 toast()/promptDialog()/confirmDialog() 를 부르면 <UiHost/> 가 앱 안에서 렌더한다.

export type ToastType = "info" | "error" | "success";
export type ToastItem = { id: number; msg: string; type: ToastType };
export type PromptReq = { id: number; title: string; defaultValue: string; placeholder?: string; resolve: (v: string | null) => void };
export type ConfirmReq = { id: number; title: string; message?: string; danger?: boolean; okLabel?: string; resolve: (v: boolean) => void };

let toasts: ToastItem[] = [];
let promptReq: PromptReq | null = null;
let confirmReq: ConfirmReq | null = null;
let seq = 1;

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
export function subscribeUi(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export function getUiState() { return { toasts, promptReq, confirmReq }; }

// ── 토스트(알림) ─────────────────────────────────────────────
export function toast(msg: string, type: ToastType = "info") {
  const id = seq++;
  toasts = [...toasts, { id, msg, type }];
  emit();
  const ttl = type === "error" ? 5000 : 3000;
  if (typeof window !== "undefined") window.setTimeout(() => dismissToast(id), ttl);
}
export function dismissToast(id: number) { toasts = toasts.filter((t) => t.id !== id); emit(); }

// ── 입력 다이얼로그 (prompt 대체) ─────────────────────────────
export function promptDialog(title: string, defaultValue = "", placeholder?: string): Promise<string | null> {
  return new Promise((resolve) => { promptReq = { id: seq++, title, defaultValue, placeholder, resolve }; emit(); });
}
export function resolvePrompt(v: string | null) { const r = promptReq?.resolve; promptReq = null; emit(); r?.(v); }

// ── 확인 다이얼로그 (confirm 대체) ────────────────────────────
export function confirmDialog(title: string, opts?: { message?: string; danger?: boolean; okLabel?: string }): Promise<boolean> {
  return new Promise((resolve) => { confirmReq = { id: seq++, title, message: opts?.message, danger: opts?.danger, okLabel: opts?.okLabel, resolve }; emit(); });
}
export function resolveConfirm(v: boolean) { const r = confirmReq?.resolve; confirmReq = null; emit(); r?.(v); }
