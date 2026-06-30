"use client";

import { useState } from "react";
import { ChevronDown, Info, Copy, Check } from "lucide-react";

type ParamDef = {
  id: string;
  name: string;
  nameKo: string;
  category: string;
  min: number;
  max: number;
  default: number;
  description: string;
  tips: string[];
  vts?: string;
  vbridger?: string;
};

const PARAMS: ParamDef[] = [
  {
    id: "ParamAngleX",
    name: "ParamAngleX",
    nameKo: "머리 좌우 회전 (Yaw)",
    category: "머리 회전",
    min: -30,
    max: 30,
    default: 0,
    description: "머리를 좌우로 돌리는 파라미터입니다.",
    tips: [
      "±30이 표준이지만 모델에 따라 ±20으로 제한하면 더 자연스럽습니다",
      "극단값에서 메시 왜곡이 없는지 확인하세요",
    ],
    vts: "FaceAngleX",
    vbridger: "headYaw",
  },
  {
    id: "ParamAngleY",
    name: "ParamAngleY",
    nameKo: "머리 상하 회전 (Pitch)",
    category: "머리 회전",
    min: -30,
    max: 30,
    default: 0,
    description: "머리를 위아래로 끄덕이는 파라미터입니다.",
    tips: [
      "위 방향(+)과 아래 방향(-) 변형량을 따로 체크하세요",
      "머리카락 물리에 영향을 주므로 물리 설정 후 재확인 필요",
    ],
    vts: "FaceAngleY",
    vbridger: "headPitch",
  },
  {
    id: "ParamAngleZ",
    name: "ParamAngleZ",
    nameKo: "머리 기울기 (Roll)",
    category: "머리 회전",
    min: -30,
    max: 30,
    default: 0,
    description: "머리를 어깨 방향으로 기울이는 파라미터입니다.",
    tips: [
      "±30보다 ±10~15 범위로 설정하면 더 자연스러운 기울기",
      "머리카락이 중력 방향을 따라야 하므로 물리 설정 필수",
    ],
    vts: "FaceAngleZ",
    vbridger: "headRoll",
  },
  {
    id: "ParamEyeLOpen",
    name: "ParamEyeLOpen",
    nameKo: "왼쪽 눈 개폐",
    category: "눈",
    min: 0,
    max: 1,
    default: 1,
    description: "왼쪽 눈의 열림/닫힘 정도입니다. 0 = 완전 닫힘, 1 = 완전 열림.",
    tips: [
      "0.8~1.0 사이를 '눈 반쯤 뜬 상태'로 활용 가능",
      "윙크는 한쪽만 0으로 설정",
      "눈 깜빡임은 VTS에서 Blink 파라미터로 자동 제어 가능",
    ],
    vts: "EyeOpenLeft",
    vbridger: "eyeBlink_L",
  },
  {
    id: "ParamEyeROpen",
    name: "ParamEyeROpen",
    nameKo: "오른쪽 눈 개폐",
    category: "눈",
    min: 0,
    max: 1,
    default: 1,
    description: "오른쪽 눈의 열림/닫힘 정도입니다.",
    tips: [
      "ParamEyeLOpen과 동일한 키 설정 권장",
      "양쪽 눈이 완벽히 동기화되지 않으면 더 자연스러울 수 있음",
    ],
    vts: "EyeOpenRight",
    vbridger: "eyeBlink_R",
  },
  {
    id: "ParamEyeBallX",
    name: "ParamEyeBallX",
    nameKo: "눈동자 좌우",
    category: "눈",
    min: -1,
    max: 1,
    default: 0,
    description: "눈동자의 좌우 방향입니다.",
    tips: [
      "눈 텍스처 이동 범위가 너무 크면 흰자가 보여 어색함",
      "VTS의 EyeLeftX/RightX와 연동 권장",
    ],
    vts: "EyeLeftX / EyeRightX",
    vbridger: "eyeLookLeft / eyeLookRight",
  },
  {
    id: "ParamMouthOpenY",
    name: "ParamMouthOpenY",
    nameKo: "입 세로 개폐",
    category: "입",
    min: 0,
    max: 1,
    default: 0,
    description: "입이 위아래로 열리는 정도입니다.",
    tips: [
      "0.3 이하 = 작은 발화, 0.7 이상 = 크게 벌린 입",
      "치아 아트워크는 0.3 이상일 때만 보이도록 설정 권장",
      "VBridger의 jawOpen 값이 주로 사용됨",
    ],
    vts: "MouthOpen",
    vbridger: "jawOpen",
  },
  {
    id: "ParamMouthForm",
    name: "ParamMouthForm",
    nameKo: "입 모양 (웃음/슬픔)",
    category: "입",
    min: -1,
    max: 1,
    default: 0,
    description: "-1 = 슬픈 표정, 0 = 기본, 1 = 웃는 표정",
    tips: [
      "표현식(expression)으로 미세 조정하면 더 다양한 감정 표현 가능",
      "입꼬리 디포머를 따로 분리하면 섬세한 조절 가능",
    ],
    vts: "MouthSmile",
    vbridger: "mouthSmile_L / mouthSmile_R",
  },
  {
    id: "ParamBrowLY",
    name: "ParamBrowLY",
    nameKo: "왼쪽 눈썹 상하",
    category: "눈썹",
    min: -1,
    max: 1,
    default: 0,
    description: "왼쪽 눈썹의 높낮이입니다. -1 = 찌푸림, 1 = 올라감.",
    tips: [
      "눈썹 움직임이 없으면 표정이 단조로워짐 — 꼭 설정하세요",
      "ParamBrowLForm (각도)와 함께 사용하면 더 풍부한 표정",
    ],
    vts: "BrowLeftY",
    vbridger: "browInnerUp / browOuterUpLeft",
  },
  {
    id: "ParamBodyAngleX",
    name: "ParamBodyAngleX",
    nameKo: "몸통 좌우 기울기",
    category: "몸통",
    min: -10,
    max: 10,
    default: 0,
    description: "몸통의 좌우 기울기입니다.",
    tips: [
      "머리의 AngleX에 연동해서 살짝 따라오게 하면 자연스러움",
      "범위는 ±10이 표준, 더 크면 어색해짐",
    ],
    vts: "BodyAngleX",
  },
];

const CATEGORIES = [...new Set(PARAMS.map((p) => p.category))];

export default function ParamCalculator() {
  const [selectedCategory, setSelectedCategory] = useState<string>("전체");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [customValues, setCustomValues] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const filtered =
    selectedCategory === "전체"
      ? PARAMS
      : PARAMS.filter((p) => p.category === selectedCategory);

  function getValue(param: ParamDef) {
    return customValues[param.id] ?? param.default;
  }

  async function copyId(id: string) {
    await navigator.clipboard.writeText(id);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Category filter */}
      <div className="flex gap-2 p-4 border-b border-white/5 overflow-x-auto chat-scroll">
        {["전체", ...CATEGORIES].map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? "bg-gradient-to-br from-[var(--purple-deep)] to-[#9333ea] text-white shadow-lg shadow-purple-900/30"
                : "glass glass-hover text-[var(--muted)]"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Param list */}
      <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-2">
        {filtered.map((param) => {
          const val = getValue(param);
          const pct = ((val - param.min) / (param.max - param.min)) * 100;
          const isExpanded = expandedId === param.id;

          return (
            <div key={param.id} className="glass rounded-xl overflow-hidden">
              <button
                className="w-full p-4 text-left hover:bg-white/5 transition-all"
                onClick={() =>
                  setExpandedId(isExpanded ? null : param.id)
                }
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">
                      {param.nameKo}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyId(param.id);
                      }}
                      className="text-slate-500 hover:text-purple-400 transition-colors"
                    >
                      {copied === param.id ? (
                        <Check className="w-3 h-3 text-green-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-purple-400 font-mono">
                      {val.toFixed(1)}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </div>
                </div>

                {/* Slider */}
                <div className="space-y-1">
                  <div className="relative">
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-600 to-pink-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <input
                      type="range"
                      min={param.min}
                      max={param.max}
                      step={(param.max - param.min) / 100}
                      value={val}
                      onChange={(e) =>
                        setCustomValues((prev) => ({
                          ...prev,
                          [param.id]: parseFloat(e.target.value),
                        }))
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>{param.min}</span>
                    <span className="text-slate-500 font-mono text-[10px]">
                      {param.id}
                    </span>
                    <span>{param.max}</span>
                  </div>
                </div>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
                  <p className="text-xs text-slate-400">{param.description}</p>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Info className="w-3 h-3" /> 팁
                    </div>
                    {param.tips.map((tip, i) => (
                      <p
                        key={i}
                        className="text-xs text-slate-400 pl-4 before:content-['·'] before:mr-1 before:text-purple-400"
                      >
                        {tip}
                      </p>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {param.vts && (
                      <div className="glass rounded-lg p-2">
                        <div className="text-[10px] text-cyan-400 font-medium mb-0.5">
                          VTube Studio
                        </div>
                        <div className="text-xs font-mono text-slate-300">
                          {param.vts}
                        </div>
                      </div>
                    )}
                    {param.vbridger && (
                      <div className="glass rounded-lg p-2">
                        <div className="text-[10px] text-pink-400 font-medium mb-0.5">
                          VBridger (ARKit)
                        </div>
                        <div className="text-xs font-mono text-slate-300">
                          {param.vbridger}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
