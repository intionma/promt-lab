"use client";
// 관리자 모드 — PIN 입력 후 10분간 유지. localStorage 기반, 탭/페이지 공유.
// 서버는 매 요청마다 PIN 을 재검증하므로(admin PIN=삭제 비번), 클라이언트는 '10분간 자동으로 PIN을 붙여주는' 역할.
import { useEffect, useState } from "react";

const UNTIL_KEY = "vrr_admin_until";
const PIN_KEY = "vrr_admin_pin";
export const ADMIN_DURATION_MS = 10 * 60 * 1000;

export type AdminInfo = { active: boolean; pin: string | null; remainingMs: number };

export function adminInfo(): AdminInfo {
  if (typeof window === "undefined") return { active: false, pin: null, remainingMs: 0 };
  try {
    const until = parseInt(localStorage.getItem(UNTIL_KEY) || "0", 10);
    const now = Date.now();
    if (until > now) return { active: true, pin: localStorage.getItem(PIN_KEY), remainingMs: until - now };
  } catch { /* noop */ }
  return { active: false, pin: null, remainingMs: 0 };
}

export function startAdmin(pin: string) {
  try {
    localStorage.setItem(UNTIL_KEY, String(Date.now() + ADMIN_DURATION_MS));
    localStorage.setItem(PIN_KEY, pin);
    window.dispatchEvent(new Event("vrr-admin"));
  } catch { /* noop */ }
}

export function stopAdmin() {
  try {
    localStorage.removeItem(UNTIL_KEY);
    localStorage.removeItem(PIN_KEY);
    window.dispatchEvent(new Event("vrr-admin"));
  } catch { /* noop */ }
}

// 관리자 활성/PIN 만 구독 (변할 때만 리렌더 — 매초 리렌더 방지). 만료는 2초 내 감지.
export function useAdmin(): { active: boolean; pin: string | null } {
  const [st, setSt] = useState<{ active: boolean; pin: string | null }>({ active: false, pin: null });
  useEffect(() => {
    const refresh = () => {
      const i = adminInfo();
      setSt((prev) => (prev.active === i.active && prev.pin === i.pin ? prev : { active: i.active, pin: i.pin }));
    };
    refresh();
    const id = setInterval(refresh, 2000);
    window.addEventListener("vrr-admin", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("vrr-admin", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return st;
}

// 남은 시간만 매초 갱신 (카운트다운 표시용 — 이것만 쓰는 작은 컴포넌트에서 사용)
export function useAdminRemaining(): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const f = () => setMs(adminInfo().remainingMs);
    f();
    const id = setInterval(f, 1000);
    window.addEventListener("vrr-admin", f);
    return () => { clearInterval(id); window.removeEventListener("vrr-admin", f); };
  }, []);
  return ms;
}

export function fmtRemain(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
