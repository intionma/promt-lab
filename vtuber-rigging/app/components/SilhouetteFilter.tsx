"use client";
// 실루엣 모드가 켜져 있으면 화면 전체를 무채색(흑백)으로 — 누가 봐도 실루엣 모드임을 알 수 있게.
// localStorage 사전설정 + 'vrr-silhouette' 이벤트를 구독해 <html> 에 클래스를 토글.
import { useEffect } from "react";
import { getSilhouettePref } from "@/lib/prefs";

export default function SilhouetteFilter() {
  useEffect(() => {
    const apply = () => {
      const on = getSilhouettePref().on;
      document.documentElement.classList.toggle("vrr-grayscale", on);
    };
    apply();
    window.addEventListener("vrr-silhouette", apply);
    window.addEventListener("storage", apply);
    return () => {
      window.removeEventListener("vrr-silhouette", apply);
      window.removeEventListener("storage", apply);
      document.documentElement.classList.remove("vrr-grayscale");
    };
  }, []);
  return null;
}
