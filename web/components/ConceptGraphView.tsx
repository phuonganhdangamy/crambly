"use client";

import { useCallback, useEffect } from "react";
import {
  Background,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export type ConceptGraphPayload = {
  nodes: { id: string; label: string }[];
  edges: { source: string; target: string; relationship: string }[];
};

function buildFlowState(
  graph: ConceptGraphPayload,
  selectedId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const w = 280;
  const nodes: Node[] = graph.nodes.map((n, i) => ({
    id: n.id,
    position: { x: (i % 3) * w + 40, y: Math.floor(i / 3) * 140 + 40 },
    data: { label: n.label },
    style: {
      background: "#1e293b",
      color: "#e2e8f0",
      border: selectedId === n.id ? "2px solid #818cf8" : "1px solid #334155",
      borderRadius: 12,
      padding: "10px 14px",
      fontSize: 13,
      maxWidth: 220,
      whiteSpace: "normal" as const,
    },
  }));
  const edges: Edge[] = (graph.edges || []).map((e, i) => ({
    id: `e-${i}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    label: e.relationship,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#64748b" },
    style: { stroke: "#64748b", strokeWidth: 1.5 },
    labelStyle: { fill: "#94a3b8", fontSize: 11 },
    labelBgStyle: { fill: "#0f172a" },
  }));
  return { nodes, edges };
}

export function ConceptGraphView({
  graph,
  onSelectNode,
  selectedId,
}: {
  graph: ConceptGraphPayload | null | undefined;
  onSelectNode: (id: string | null) => void;
  selectedId: string | null;
}) {
  const empty = !graph?.nodes?.length;
  const { nodes: initNodes, edges: initEdges } = empty
    ? { nodes: [] as Node[], edges: [] as Edge[] }
    : buildFlowState(graph!, selectedId);

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  useEffect(() => {
    if (empty) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const { nodes: n, edges: e } = buildFlowState(graph!, selectedId);
    setNodes(n);
    setEdges(e);
  }, [graph, selectedId, empty, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectNode(node.id);
    },
    [onSelectNode],
  );

  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  if (empty) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 text-center text-sm text-slate-500">
        No concept graph is available for this deck yet. If this is a recent upload, refresh once after
        processing finishes. If it persists, ensure migration{" "}
        <code className="mx-1 rounded bg-slate-800 px-1 text-slate-300">20250325000000_concepts_stem_visual.sql</code>{" "}
        has been applied.
      </div>
    );
  }

  return (
    <div className="h-[min(60vh,520px)] w-full rounded-2xl border border-slate-800 bg-slate-950 [&_.react-flow\_\_attribution]:hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        minZoom={0.35}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#334155" gap={20} />
        <Controls className="!border-slate-600 !bg-slate-800 [&_button]:!bg-slate-800 [&_button]:!text-slate-200" />
        <Panel position="top-left" className="rounded-lg bg-slate-900/90 px-3 py-2 text-xs text-slate-400">
          Click a node for details · Drag to pan
        </Panel>
      </ReactFlow>
    </div>
  );
}
