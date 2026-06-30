"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  NodeProps,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Trash2, Info } from "lucide-react";

type DeformerType = "warp" | "rotation" | "mesh" | "art";

type DeformerNode = {
  id: string;
  label: string;
  type: DeformerType;
  note?: string;
};

const TYPE_COLORS: Record<DeformerType, string> = {
  warp: "#7c3aed",
  rotation: "#0891b2",
  mesh: "#059669",
  art: "#be185d",
};

const TYPE_LABELS: Record<DeformerType, string> = {
  warp: "워프 디포머",
  rotation: "회전 디포머",
  mesh: "메시",
  art: "아트 메시",
};

const TYPE_DESC: Record<DeformerType, string> = {
  warp: "면 변형. 얼굴 윤곽, 눈 영역 등 큰 범위 변형에 사용",
  rotation: "회전 중심점 기반. 눈꺼풀, 눈썹 등 회전 운동에 적합",
  mesh: "부모 없는 독립 메시 (비권장)",
  art: "실제 아트워크가 들어있는 최하위 레이어",
};

const TEMPLATE_NODES: DeformerNode[] = [
  { id: "root", label: "Root", type: "warp", note: "최상위 부모" },
  { id: "body", label: "몸통 그룹", type: "warp" },
  { id: "head", label: "머리 그룹", type: "warp", note: "ParamAngleX/Y/Z 적용" },
  { id: "face", label: "얼굴 윤곽", type: "warp", note: "워프로 입체감" },
  { id: "eye_l", label: "눈 L 그룹", type: "warp" },
  { id: "eye_l_lid", label: "눈꺼풀 L", type: "rotation", note: "ParamEyeLOpen" },
  { id: "eye_l_art", label: "눈 L 아트", type: "art" },
  { id: "eye_r", label: "눈 R 그룹", type: "warp" },
  { id: "eye_r_lid", label: "눈꺼풀 R", type: "rotation", note: "ParamEyeROpen" },
  { id: "eye_r_art", label: "눈 R 아트", type: "art" },
  { id: "brow_l", label: "눈썹 L", type: "rotation", note: "ParamBrowLY" },
  { id: "brow_r", label: "눈썹 R", type: "rotation", note: "ParamBrowRY" },
  { id: "mouth", label: "입 그룹", type: "warp", note: "ParamMouthForm" },
  { id: "mouth_art", label: "입 아트", type: "art", note: "ParamMouthOpenY" },
  { id: "hair_front", label: "앞머리 물리", type: "warp", note: "Physics 적용" },
  { id: "hair_back", label: "뒷머리 물리", type: "warp", note: "Physics 적용" },
];

const TEMPLATE_EDGES = [
  { source: "root", target: "body" },
  { source: "root", target: "head" },
  { source: "head", target: "face" },
  { source: "head", target: "eye_l" },
  { source: "head", target: "eye_r" },
  { source: "head", target: "brow_l" },
  { source: "head", target: "brow_r" },
  { source: "head", target: "mouth" },
  { source: "head", target: "hair_front" },
  { source: "head", target: "hair_back" },
  { source: "eye_l", target: "eye_l_lid" },
  { source: "eye_l_lid", target: "eye_l_art" },
  { source: "eye_r", target: "eye_r_lid" },
  { source: "eye_r_lid", target: "eye_r_art" },
  { source: "mouth", target: "mouth_art" },
];

function buildLayout(
  nodes: DeformerNode[],
  edges: { source: string; target: string }[]
): { rfNodes: Node[]; rfEdges: Edge[] } {
  const childrenMap: Record<string, string[]> = {};
  const parentMap: Record<string, string> = {};

  for (const e of edges) {
    if (!childrenMap[e.source]) childrenMap[e.source] = [];
    childrenMap[e.source].push(e.target);
    parentMap[e.target] = e.source;
  }

  const roots = nodes.filter((n) => !parentMap[n.id]).map((n) => n.id);
  const positions: Record<string, { x: number; y: number }> = {};
  let col = 0;

  function place(id: string, depth: number) {
    const children = childrenMap[id] || [];
    if (children.length === 0) {
      positions[id] = { x: col * 180, y: depth * 100 };
      col++;
    } else {
      const startCol = col;
      for (const child of children) place(child, depth + 1);
      const endCol = col - 1;
      positions[id] = {
        x: ((startCol + endCol) / 2) * 180,
        y: depth * 100,
      };
    }
  }

  for (const r of roots) place(r, 0);

  const rfNodes: Node[] = nodes
    .filter((n) => positions[n.id])
    .map((n) => ({
      id: n.id,
      type: "deformer",
      position: positions[n.id],
      data: n,
    }));

  const rfEdges: Edge[] = edges.map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    style: { stroke: "#7c3aed", strokeWidth: 1.5, opacity: 0.6 },
  }));

  return { rfNodes, rfEdges };
}

function DeformerNodeComponent({ data }: NodeProps) {
  const d = data as DeformerNode;
  const color = TYPE_COLORS[d.type];
  return (
    <div
      className="rounded-lg px-3 py-2 min-w-[130px] text-center relative"
      style={{
        background: `${color}22`,
        border: `1px solid ${color}88`,
        boxShadow: `0 0 8px ${color}33`,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color, border: "none", width: 6, height: 6 }} />
      <div className="text-[10px] font-medium mb-0.5" style={{ color }}>
        {TYPE_LABELS[d.type]}
      </div>
      <div className="text-xs text-slate-200 font-medium">{d.label}</div>
      {d.note && (
        <div className="text-[9px] text-slate-500 mt-0.5">{d.note}</div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: color, border: "none", width: 6, height: 6 }} />
    </div>
  );
}

const nodeTypes = { deformer: DeformerNodeComponent };

export default function DeformerTree() {
  const [nodes, setNodes] = useState<DeformerNode[]>(TEMPLATE_NODES);
  const [edges, setEdges] = useState(TEMPLATE_EDGES);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<DeformerType>("warp");
  const [newParent, setNewParent] = useState("");
  const [selectedInfo, setSelectedInfo] = useState<DeformerType | null>(null);

  const { rfNodes, rfEdges } = useMemo(
    () => buildLayout(nodes, edges),
    [nodes, edges]
  );

  const addNode = useCallback(() => {
    if (!newLabel.trim()) return;
    const id = `node_${Date.now()}`;
    setNodes((prev) => [...prev, { id, label: newLabel, type: newType }]);
    if (newParent) {
      setEdges((prev) => [...prev, { source: newParent, target: id }]);
    }
    setNewLabel("");
  }, [newLabel, newType, newParent]);

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="p-4 border-b border-white/10 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(TYPE_COLORS) as DeformerType[]).map((t) => (
            <button
              key={t}
              onClick={() => setSelectedInfo(selectedInfo === t ? null : t)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all"
              style={{
                background: selectedInfo === t ? `${TYPE_COLORS[t]}33` : `${TYPE_COLORS[t]}11`,
                border: `1px solid ${TYPE_COLORS[t]}55`,
                color: TYPE_COLORS[t],
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: TYPE_COLORS[t] }} />
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {selectedInfo && (
          <div
            className="rounded-lg px-3 py-2 text-xs text-slate-300 flex gap-2 items-start"
            style={{ background: `${TYPE_COLORS[selectedInfo]}15`, border: `1px solid ${TYPE_COLORS[selectedInfo]}30` }}
          >
            <Info className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: TYPE_COLORS[selectedInfo] }} />
            {TYPE_DESC[selectedInfo]}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="새 디포머 이름"
            className="flex-1 glass rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as DeformerType)}
            className="glass rounded-lg px-2 py-2 text-xs text-slate-300 outline-none"
          >
            {(Object.keys(TYPE_LABELS) as DeformerType[]).map((t) => (
              <option key={t} value={t} style={{ background: "#1a1a2e" }}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <select
            value={newParent}
            onChange={(e) => setNewParent(e.target.value)}
            className="glass rounded-lg px-2 py-2 text-xs text-slate-300 outline-none"
          >
            <option value="" style={{ background: "#1a1a2e" }}>부모 없음</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id} style={{ background: "#1a1a2e" }}>
                {n.label}
              </option>
            ))}
          </select>
          <button
            onClick={addNode}
            disabled={!newLabel.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-lg px-3 py-2 transition-all"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setNodes(TEMPLATE_NODES); setEdges(TEMPLATE_EDGES); }}
            className="glass hover:bg-white/10 rounded-lg px-3 py-2 transition-all text-slate-400 hover:text-red-400"
            title="템플릿으로 초기화"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Flow */}
      <div className="flex-1">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} color="#ffffff10" gap={20} size={1} />
          <Controls className="!bg-slate-900 !border-white/10" />
          <MiniMap
            nodeColor={(n) => TYPE_COLORS[(n.data as DeformerNode).type] ?? "#7c3aed"}
            maskColor="#0d0d1a99"
            className="!bg-slate-900/80"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
