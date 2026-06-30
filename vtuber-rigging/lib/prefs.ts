// 실루엣 모드 등 "리뷰에 들어가기 전에" 정해두는 개인 설정 (localStorage)
// 핵심: 리뷰를 열기 전에 미리 켜두면, 모델이 처음 렌더될 때부터 실루엣으로 보여서
//       그림이 한 순간도 노출되지 않음.

const KEY_ON = "vrr_silhouette";
const KEY_COLOR = "vrr_silhouette_color";
export const DEFAULT_SILHOUETTE_COLOR = 0x6b7280;

export type SilhouettePref = { on: boolean; color: number };

export function getSilhouettePref(): SilhouettePref {
  if (typeof window === "undefined") return { on: false, color: DEFAULT_SILHOUETTE_COLOR };
  try {
    const on = localStorage.getItem(KEY_ON) === "1";
    const raw = localStorage.getItem(KEY_COLOR);
    const color = raw ? parseInt(raw, 16) : NaN;
    return { on, color: Number.isFinite(color) ? color : DEFAULT_SILHOUETTE_COLOR };
  } catch {
    return { on: false, color: DEFAULT_SILHOUETTE_COLOR };
  }
}

export function setSilhouettePref(on: boolean, color: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY_ON, on ? "1" : "0");
    localStorage.setItem(KEY_COLOR, (color >>> 0).toString(16));
    // 같은 탭 내 다른 컴포넌트도 즉시 반영되도록 커스텀 이벤트 발행
    window.dispatchEvent(new CustomEvent("vrr-silhouette", { detail: { on, color } }));
  } catch { /* noop */ }
}
