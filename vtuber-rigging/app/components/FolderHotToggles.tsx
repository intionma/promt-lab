"use client";
// 미리보기 창 오른쪽에 겹쳐 띄우는 폴더 빠른 토글 버튼.
// 메쉬 탭을 열지 않아도 [머리카락] 같은 버튼으로 폴더를 바로 켜고 끌 수 있음. 창(A/B)별 독립.
import { Eye, EyeOff } from "lucide-react";
import type { MeshGroup } from "@/lib/supabase";

export default function FolderHotToggles({
  groups, hiddenIds, onToggle,
}: {
  groups: MeshGroup[];
  hiddenIds: Set<string>;
  onToggle: (g: MeshGroup) => void;
}) {
  // 멤버가 있는 폴더만 (빈 폴더는 토글 의미 없음)
  const usable = groups.filter((g) => g.ids.length > 0);
  if (usable.length === 0) return null;

  return (
    <div className="absolute top-1/2 -translate-y-1/2 right-1.5 z-20 flex flex-col items-end gap-1 max-h-[80%] overflow-y-auto chat-scroll pointer-events-auto">
      {usable.map((g) => {
        const allHidden = g.ids.every((id) => hiddenIds.has(id));
        return (
          <button
            key={g.id}
            onClick={() => onToggle(g)}
            title={allHidden ? `${g.name} 표시` : `${g.name} 숨김`}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold shadow-lg backdrop-blur-md transition-all ${
              allHidden
                ? "bg-black/40 text-[var(--muted)] border border-white/10"
                : "bg-[var(--purple)]/85 text-white border border-[var(--purple)]"
            }`}
          >
            {allHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span className="truncate max-w-[80px]">{g.name}</span>
          </button>
        );
      })}
    </div>
  );
}
