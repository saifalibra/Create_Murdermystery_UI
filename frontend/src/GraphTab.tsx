import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  MarkerType,
  Handle,
  Position,
  NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Logic, GraphNode, GraphEdge, NodeType, GraphNodeData } from "./types";

// #region agent log
const _log = (message: string, data: Record<string, unknown>, hypothesisId?: string) => {
  fetch("http://127.0.0.1:7242/ingest/bf14b69e-b890-4a74-8aa0-f7b18a675877", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "GraphTab.tsx",
      message,
      data,
      timestamp: Date.now(),
      sessionId: "debug-session",
      hypothesisId: hypothesisId ?? undefined,
    }),
  }).catch(() => {});
};
// #endregion
import EditEvidenceModal from "./EditEvidenceModal";
import EditSecretModal from "./EditSecretModal";
import EditLocationModal from "./EditLocationModal";
import EditCharacterModal from "./EditCharacterModal";

type EventForm = {
  id: string;
  title: string;
  content: string;
  time_range: { start: string; end: string };
  location_ids: string[];
  participants: string[];
  logic_details: Record<string, string>;
};

const defaultEventTime = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 19);
};
const defaultEventEnd = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toISOString().slice(0, 19);
};

// カスタムノードコンポーネント（接続点を大きく）
function CustomNode({ data }: NodeProps) {
  const d = data as unknown as GraphNodeData;
  if (d.isEventGroup) {
    return (
      <div
        style={{
          backgroundColor: d.color || "#1c2128",
          color: "#fff",
          border: "3px solid #58a6ff",
          borderRadius: "12px",
          padding: "1rem",
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Handle type="target" position={Position.Top} style={{ width: 16, height: 16, backgroundColor: "#fff" }} />
        <div style={{ 
          fontWeight: 600, 
          fontSize: "1.1rem",
          marginBottom: "0.5rem",
          flexShrink: 0,
          zIndex: 1,
        }}>
          {d.label}
        </div>
        {/* 子ノードはReact Flowによってこのdivの下に配置される */}
        <Handle type="source" position={Position.Bottom} style={{ width: 16, height: 16, backgroundColor: "#fff" }} />
      </div>
    );
  }

  // イベントグループ内の子ノードはハンドルなし（接続はイベントノード経由）
  const isChild = !!d.parentId;

  return (
    <div
      style={{
        backgroundColor: d.color || "#6b7280",
        color: "#fff",
        border: "2px solid #fff",
        borderRadius: "8px",
        padding: "10px",
        width: 150,
        minHeight: 40,
      }}
    >
      {!isChild && <Handle type="target" position={Position.Top} style={{ width: 16, height: 16, backgroundColor: "#fff" }} />}
      <div>{d.label}</div>
      {!isChild && <Handle type="source" position={Position.Bottom} style={{ width: 16, height: 16, backgroundColor: "#fff" }} />}
    </div>
  );
}

const nodeTypes = {
  custom: CustomNode,
};

/** ノードタイプ別の色 */
const NODE_TYPE_COLORS: Record<NodeType | "Event", string> = {
  Evidence: "#2563eb",
  Secret: "#dc2626",
  Location: "#ea580c",
  Character: "#7c3aed",
  Event: "#6b7280",
};
const DEFAULT_NODE_COLOR = "#6b7280";

interface GraphTabProps {
  logics: Logic[];
  onLogicsChange: (logics: Logic[]) => void;
  removedEventIdsFromGraph: string[];
  setRemovedEventIdsFromGraph: React.Dispatch<React.SetStateAction<string[]>>;
  emptyEventInstances: Array<{ eventId: string; logicId: string; instanceId: string }>;
  setEmptyEventInstances: React.Dispatch<
    React.SetStateAction<Array<{ eventId: string; logicId: string; instanceId: string }>>
  >;
}

// ハッシュベースの色生成
const hashColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
};

// ロジック名を取得
const getLogicName = (logicId: string, logics: Logic[]): string => {
  const logic = logics.find((l) => l.logic_id === logicId);
  return logic?.name || logicId;
};

// ロジックの色を取得
const getLogicColor = (logicId: string, logics: Logic[]): string => {
  const logic = logics.find((l) => l.logic_id === logicId);
  if (logic?.color) {
    return logic.color;
  }
  return hashColor(logicId);
};

const GraphTab: React.FC<GraphTabProps> = ({
  logics,
  onLogicsChange,
  removedEventIdsFromGraph,
  setRemovedEventIdsFromGraph,
  emptyEventInstances,
  setEmptyEventInstances,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [logicDetailsModal, setLogicDetailsModal] = useState<{
    nodeId: string | null;
    isOpen: boolean;
  }>({ nodeId: null, isOpen: false });
  const [edgeContextMenu, setEdgeContextMenu] = useState<{
    x: number;
    y: number;
    edgeId: string;
  } | null>(null);
  const [logicManagementModal, setLogicManagementModal] = useState(false);
  /** タイプ別編集モーダル用（クリックで開く） */
  const [editModalNode, setEditModalNode] = useState<GraphNode | null>(null);
  /** イベントノードクリック時の編集モーダル用 */
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editEventLogicId, setEditEventLogicId] = useState<string | null>(null);
  const [editInstanceId, setEditInstanceId] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<EventForm | null>(null);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [events, setEvents] = useState<{ id: string; title: string }[]>([]);
  const [evidence, setEvidence] = useState<{ id: string; name: string }[]>([]);
  const [secrets, setSecrets] = useState<{ id: string; title?: string; description: string }[]>([]);
  const [addNodeOpen, setAddNodeOpen] = useState(false);
  const [addNodeModal, setAddNodeModal] = useState<{
    open: boolean;
    type: NodeType | "Event" | null;
  }>({ open: false, type: null });
  /** ハンドルからドラッグして新規ノード追加時の接続元 */
  const [connectFromSource, setConnectFromSource] = useState<string | null>(null);

  const [nodeToLogicMap, setNodeToLogicMap] = useState<Map<string, string>>(new Map());
  /** ロジック紐づけのみ（グラフに枠は作らない）。+ ロジックで追加。 */
  const [eventLogicAssociations, setEventLogicAssociations] = useState<
    Array<{ eventId: string; logicId: string }>
  >([]);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const hasInitialLayout = useRef(false);
  const prevLayoutRevisionRef = useRef(0);
  const prevGraphNodesLength = useRef(0);
  const prevEventGroups = useRef<Map<string, GraphNode[]>>(new Map());
  const edgesRef = useRef<Edge[]>([]);

  // 連結成分を計算
  const computeLogics = useCallback(async () => {
    try {
      const res = await fetch("/api/graph/compute-logics", {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        const mapping = new Map<string, string>();
        Object.entries(data.node_to_logic).forEach(([nodeId, logicId]) => {
          mapping.set(nodeId, logicId as string);
        });
        setNodeToLogicMap(mapping);
        if (data.logics) {
          onLogicsChange(data.logics);
        }
      }
    } catch (err) {
      console.error("Failed to compute logics:", err);
    }
  }, [onLogicsChange]);

  const nodeToLogic = nodeToLogicMap;

  // グラフデータを取得
  const fetchGraphData = useCallback(async () => {
    try {
      const [nodesRes, edgesRes] = await Promise.all([
        fetch("/api/graph/nodes"),
        fetch("/api/graph/edges"),
      ]);
      if (nodesRes.ok && edgesRes.ok) {
        const nodesData = await nodesRes.json();
        const edgesData = await edgesRes.json();
        setGraphNodes(nodesData);
        setGraphEdges(edgesData);
      }
    } catch (err) {
      console.error("Failed to fetch graph data:", err);
    }
  }, []);

  useEffect(() => {
    fetchGraphData();
  }, [fetchGraphData]);

  useEffect(() => {
    const load = async () => {
      try {
        const [locRes, charRes, evRes, eviRes, secRes] = await Promise.all([
          fetch("/api/locations"),
          fetch("/api/characters"),
          fetch("/api/events"),
          fetch("/api/evidence"),
          fetch("/api/secrets"),
        ]);
        if (locRes.ok) {
          const data = await locRes.json();
          setLocations(data.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
        }
        if (charRes.ok) {
          const data = await charRes.json();
          setCharacters(data.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
        }
        if (evRes.ok) {
          const data = await evRes.json();
          setEvents(data.map((x: { id: string; title: string }) => ({ id: x.id, title: x.title || x.id })));
        }
        if (eviRes.ok) {
          const data = await eviRes.json();
          setEvidence(data.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name || x.id })));
        }
        if (secRes.ok) {
          const data = await secRes.json();
          setSecrets(
            data.map((x: { id: string; title?: string; description: string }) => ({
              id: x.id,
              title: x.title,
              description: x.description || "",
            }))
          );
        }
      } catch (e) {
        console.error("Failed to fetch locations/characters/events/evidence/secrets:", e);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (graphNodes.length > 0 || graphEdges.length > 0) {
      computeLogics();
    }
  }, [graphNodes.length, graphEdges.length, computeLogics]);

  const getNodeLabel = useCallback(
    (node: GraphNode): string => {
      const id = node.reference_id;
      switch (node.node_type) {
        case "Evidence":
          return evidence.find((e) => e.id === id)?.name ?? id;
        case "Secret": {
          const s = secrets.find((x) => x.id === id);
          return s?.title || s?.description || id;
        }
        case "Location":
          return locations.find((l) => l.id === id)?.name ?? id;
        case "Character":
          return characters.find((c) => c.id === id)?.name ?? id;
        default:
          return id;
      }
    },
    [evidence, secrets, locations, characters]
  );

  // イベント×ロジックごとにノードをグループ化。キー: "eventId::logicId"
  const eventGroups = useMemo(() => {
    const groups = new Map<string, GraphNode[]>();
    graphNodes.forEach((node) => {
      if (node.event_id) {
        const logicId = nodeToLogic.get(node.node_id) ?? "";
        const key = `${node.event_id}::${logicId}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(node);
      }
    });
    return groups;
  }, [graphNodes, nodeToLogic]);

  // eventGroups + 空 (event, logic, instance) インスタンスをマージ。同一 (event, logic) で複数可
  const mergedEventGroups = useMemo(() => {
    const m = new Map<string, GraphNode[]>(eventGroups);
    emptyEventInstances.forEach(({ eventId, logicId, instanceId }) => {
      const key = `${eventId}::${logicId}::${instanceId}`;
      m.set(key, []);
    });
    return m;
  }, [eventGroups, emptyEventInstances]);

  /** ロジックごとの階層レイアウト
   * 大前提: ノードは重ならない。同じ階層は同じ y（横の位置を揃える）で、x は隙間を空けて割り当て。
   */
  const logicLayout = useMemo(() => {
    const layout = new Map<string, { x: number; y: number }>();
    const logicIds = new Set<string>();
    graphNodes.forEach((n) => {
      const lid = nodeToLogic.get(n.node_id);
      if (lid) logicIds.add(lid);
    });

    const W = 180;
    const H = 90;
    const GAP = 40;
    let logicBaseX = 0;

    logicIds.forEach((logicId) => {
      const logicNodeIds = graphNodes
        .filter((n) => nodeToLogic.get(n.node_id) === logicId)
        .map((n) => n.node_id);
      const logicEdges = graphEdges.filter(
        (e) =>
          logicNodeIds.includes(e.source_node_id) &&
          logicNodeIds.includes(e.target_node_id)
      );

      const outDeg = new Map<string, number>();
      const ins = new Map<string, Set<string>>();
      logicNodeIds.forEach((id) => {
        outDeg.set(id, 0);
        ins.set(id, new Set());
      });
      logicEdges.forEach((e) => {
        outDeg.set(e.source_node_id, (outDeg.get(e.source_node_id) ?? 0) + 1);
        ins.get(e.target_node_id)!.add(e.source_node_id);
      });

      const levels = new Map<string, number>();
      const queue: string[] = logicNodeIds.filter((id) => ins.get(id)!.size === 0);
      queue.forEach((id) => levels.set(id, 0));
      let head = 0;
      while (head < queue.length) {
        const u = queue[head++];
        const lu = levels.get(u)!;
        logicEdges
          .filter((e) => e.source_node_id === u)
          .forEach((e) => {
            const v = e.target_node_id;
            if (!levels.has(v)) {
              levels.set(v, lu + 1);
              queue.push(v);
            }
          });
      }
      logicNodeIds.forEach((id) => {
        if (!levels.has(id)) levels.set(id, 0);
      });

      const byLevel = new Map<number, string[]>();
      logicNodeIds.forEach((id) => {
        const L = levels.get(id)!;
        if (!byLevel.has(L)) byLevel.set(L, []);
        byLevel.get(L)!.push(id);
      });

      const branching = new Set(logicNodeIds.filter((id) => (outDeg.get(id) ?? 0) > 1));
      const maxLevel = Math.max(...Array.from(byLevel.keys()), 0);

      const pos = new Map<string, { x: number; y: number }>();
      let maxCol = 0;

      for (let L = 0; L <= maxLevel; L++) {
        const ids = byLevel.get(L) ?? [];
        const branch = ids.filter((id) => branching.has(id));
        const rest = ids.filter((id) => !branching.has(id));
        const ordered = [...branch, ...rest];

        ordered.forEach((id, col) => {
          pos.set(id, { x: logicBaseX + col * (W + GAP), y: L * (H + GAP) });
        });
        maxCol = Math.max(maxCol, ordered.length);
      }

      pos.forEach((p, id) => layout.set(id, p));
      logicBaseX += Math.max(maxCol, 1) * (W + GAP) + GAP;
    });

    return layout;
  }, [graphNodes, graphEdges, nodeToLogic]);

  // React Flow用のノードに変換
  const toRFNodes = useMemo((): Node[] => {
    const nodes: Node[] = [];
    const processedNodeIds = new Set<string>();
    let baseX = 0;
    let baseY = 0;

    const nodeWidth = 150;
    const nodeHeight = 80;
    const padding = 20;
    const headerHeight = 60;
    const nodeGap = 10;
    const eventGap = 24;
    const eventRowMaxY = 800;

    let maxEventBottom = 0;
    let maxRowWidth = 0;

    const placeEventGroup = (
      groupNodeId: string,
      groupWidth: number,
      groupHeight: number,
      eventId: string,
      logicId: string,
      groupNodes: GraphNode[],
      instanceId?: string
    ) => {
      if (baseY + groupHeight > eventRowMaxY && maxRowWidth > 0) {
        baseY = 0;
        baseX += maxRowWidth + eventGap;
        maxRowWidth = 0;
      }
      nodes.push({
        id: groupNodeId,
        type: "custom",
        position: { x: baseX, y: baseY },
        data: {
          label: `イベント: ${events.find((e) => e.id === eventId)?.title || eventId}`,
          node: null,
          color: "#6b7280",
          isEventGroup: true,
          eventId,
          logicId,
          instanceId: instanceId ?? undefined,
        } as unknown as Record<string, unknown>,
        width: groupWidth,
        height: groupHeight,
      });
      groupNodes.forEach((node, idx) => {
        processedNodeIds.add(node.node_id);
        const nLogicId = nodeToLogic.get(node.node_id);
        const logicName = nLogicId ? getLogicName(nLogicId, logics) : "";
        const fillColor = NODE_TYPE_COLORS[node.node_type] ?? DEFAULT_NODE_COLOR;
        const startY = headerHeight + padding;
        nodes.push({
          id: node.node_id,
          type: "custom",
          position: {
            x: padding + (idx % 3) * (nodeWidth + nodeGap),
            y: startY + Math.floor(idx / 3) * (nodeHeight + nodeGap),
          },
          parentId: groupNodeId,
          extent: "parent" as const,
          data: {
            label: getNodeLabel(node),
            node: node,
            color: fillColor,
            parentId: groupNodeId,
            logicName,
          } as unknown as Record<string, unknown>,
          draggable: false,
        });
      });
      maxEventBottom = Math.max(maxEventBottom, baseY + groupHeight);
      maxRowWidth = Math.max(maxRowWidth, groupWidth);
      baseY += groupHeight + eventGap;
    };

    // イベントグループを処理。キー "eventId::logicId" または "eventId::logicId::instanceId"。重ならないよう配置。
    mergedEventGroups.forEach((groupNodes, key) => {
      const parts = key.split("::");
      const eventId = parts[0];
      const logicId = parts[1] ?? "";
      const instanceId = parts.length >= 3 ? parts.slice(2).join("::") : undefined;
      const groupNodeId = `event_group_${key}`;
      const cols = Math.min(3, groupNodes.length);
      const rows = Math.ceil(groupNodes.length / 3);
      const groupWidth = Math.max(300, padding * 2 + cols * nodeWidth + (cols - 1) * nodeGap);
      const groupHeight = Math.max(200, headerHeight + padding + rows * nodeHeight + (rows - 1) * nodeGap);
      placeEventGroup(groupNodeId, groupWidth, groupHeight, eventId, logicId, groupNodes, instanceId);
    });

    // 空イベントグループ（events に存在するが内包ノードが0件のイベント）
    const eventIdsWithGroup = new Set<string>();
    mergedEventGroups.forEach((_, key) => {
      const [eid] = key.split("::");
      eventIdsWithGroup.add(eid);
    });
    const removedSet = new Set(removedEventIdsFromGraph);
    events.forEach((ev) => {
      if (eventIdsWithGroup.has(ev.id)) return;
      if (removedSet.has(ev.id)) return;
      const groupNodeId = `event_group_${ev.id}::`;
      const groupWidth = 300;
      const groupHeight = 200;
      placeEventGroup(groupNodeId, groupWidth, groupHeight, ev.id, "", []);
    });

    const nonEventOffsetY = maxEventBottom > 0 ? maxEventBottom + eventGap : 0;

    // イベントに紐づいていないノード：ロジックごと階層整列。イベント領域と重ならないよう Y オフセット。
    const nonEvent = graphNodes.filter((n) => !processedNodeIds.has(n.node_id));
    nonEvent.forEach((node) => {
      const logicId = nodeToLogic.get(node.node_id);
      const logicName = logicId ? getLogicName(logicId, logics) : "";
      const fillColor = NODE_TYPE_COLORS[node.node_type] ?? DEFAULT_NODE_COLOR;
      const p = logicLayout.get(node.node_id) ?? { x: 0, y: 0 };

      nodes.push({
        id: node.node_id,
        type: "custom",
        position: { x: p.x, y: p.y + nonEventOffsetY },
        data: {
          label: getNodeLabel(node),
          node: node,
          color: fillColor,
          logicName,
        } as unknown as Record<string, unknown>,
      });
    });

    return nodes;
  }, [graphNodes, nodeToLogic, logics, mergedEventGroups, events, removedEventIdsFromGraph, getNodeLabel, logicLayout]);

  // node_id -> event_group_${eventId}::${logicId} のマッピング（イベント内の子ノード用）
  const nodeIdToEventGroupId = useMemo(() => {
    const m = new Map<string, string>();
    graphNodes.forEach((n) => {
      if (n.event_id) {
        const logicId = nodeToLogic.get(n.node_id) ?? "";
        m.set(n.node_id, `event_group_${n.event_id}::${logicId}`);
      }
    });
    return m;
  }, [graphNodes, nodeToLogic]);

  // React Flow用のエッジに変換（結節点はイベントノードに集約）
  const toRFEdges = useMemo((): Edge[] => {
    return graphEdges.map((edge) => {
      const sourceLogicId = nodeToLogic.get(edge.source_node_id);
      const targetLogicId = nodeToLogic.get(edge.target_node_id);
      let edgeColor = "#888";
      // ロジック分岐時はエッジの行き先（target）のロジック色を使用。編集画面のロジック色と一致させる。
      if (targetLogicId) {
        edgeColor = getLogicColor(targetLogicId, logics);
      } else if (sourceLogicId) {
        edgeColor = getLogicColor(sourceLogicId, logics);
      }

      const logicIdForColor = targetLogicId || sourceLogicId;
      const logicNameForColor = logicIdForColor ? getLogicName(logicIdForColor, logics) : "";

      // イベント内の子ノードならイベントノードに差し替え
      const source = nodeIdToEventGroupId.get(edge.source_node_id) ?? edge.source_node_id;
      const target = nodeIdToEventGroupId.get(edge.target_node_id) ?? edge.target_node_id;

      return {
        id: edge.edge_id,
        source,
        target,
        type: "default",
        selectable: true,
        deletable: true,
        interactionWidth: 24,
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
        style: {
          stroke: edgeColor,
          strokeWidth: 2,
        },
        title: logicNameForColor,
      };
    });
  }, [graphEdges, nodeToLogic, logics, nodeIdToEventGroupId]);

  useEffect(() => {
    // #region agent log
    _log("setEdgesFromToRF", { edgeCount: toRFEdges.length }, "H3");
    // #endregion
    setEdges((prev) => {
      const next = toRFEdges;
      return next.map((e) => {
        const p = prev.find((x) => x.id === e.id);
        return { ...e, selected: p?.selected ?? false };
      });
    });
  }, [toRFEdges, setEdges]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    if (graphNodes.length > 0 && !hasInitialLayout.current) {
      hasInitialLayout.current = true;
      setLayoutRevision((r) => r + 1);
    }
  }, [graphNodes.length]);

  useEffect(() => {
    if (layoutRevision <= 0) return;
    if (layoutRevision === prevLayoutRevisionRef.current) return;
    prevLayoutRevisionRef.current = layoutRevision;
    setNodes(toRFNodes);
  }, [layoutRevision, setNodes, toRFNodes]);

  // グラフデータが更新されたとき、既存ノードの位置を保持してマージ
  // layoutRevisionが変更されない限り、既存ノードの位置は保持する
  const prevToRFNodesRef = useRef<Node[]>([]);
  useEffect(() => {
    if (layoutRevision <= 0) {
      prevToRFNodesRef.current = toRFNodes;
      setNodes(toRFNodes);
      return;
    }

    setNodes((currentNodes) => {
      const currentMap = new Map(currentNodes.map((n) => [n.id, n]));
      const newNodes = toRFNodes;
      const result: Node[] = [];
      
      // 既存ノードの位置を保持
      for (const newNode of newNodes) {
        const existingNode = currentMap.get(newNode.id);
        
        if (existingNode) {
          // 既存ノードの位置を保持
          // ただし、イベントグループの変更（parentIdの変更）があった場合は新しい位置を使用
          const eventGroupChanged = 
            (existingNode.parentId !== newNode.parentId) ||
            (existingNode.parentId === null && newNode.parentId !== null) ||
            (existingNode.parentId !== null && newNode.parentId === null);
          
          if (eventGroupChanged) {
            // イベントグループの変更があった場合は新しい位置を使用
            result.push(newNode);
          } else {
            // 既存ノードの位置を保持
            result.push({
              ...newNode,
              position: existingNode.position,
            });
          }
        } else {
          // 新規ノードは新しい位置を使用
          result.push(newNode);
        }
      }
      
      prevToRFNodesRef.current = newNodes;
      return result;
    });
  }, [graphNodes, graphEdges, nodeToLogic, logics, mergedEventGroups, events, getNodeLabel, logicLayout, setNodes, layoutRevision, toRFNodes]);

  useEffect(() => {
    const prev = prevGraphNodesLength.current;
    const cur = graphNodes.length;
    prevGraphNodesLength.current = cur;
    if (layoutRevision <= 0 || cur <= prev) return;
    const next = toRFNodes;
    setNodes((nds) => {
      const have = new Set(nds.map((n) => n.id));
      const add = next.filter((n) => !have.has(n.id));
      if (add.length === 0) return nds;
      return [...nds, ...add];
    });
  }, [graphNodes.length, layoutRevision, toRFNodes, setNodes]);

  // イベントグループの変更を検知（レイアウトは自動更新しない）
  // 整列ボタンを押したときのみレイアウトを更新する
  useEffect(() => {
    prevEventGroups.current = new Map(mergedEventGroups);
  }, [mergedEventGroups]);

  // RFのノードID（event_group_eventId::logicId or node_id）→ API用node_id に変換
  const toApiNodeId = useCallback(
    (rfId: string): string => {
      if (rfId.startsWith("event_group_")) {
        const key = rfId.slice("event_group_".length);
        const nodes = eventGroups.get(key);
        return nodes?.length ? nodes[0].node_id : rfId;
      }
      return rfId;
    },
    [eventGroups]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        const newEdge: GraphEdge = {
          edge_id: `edge_${Date.now()}`,
          source_node_id: toApiNodeId(params.source),
          target_node_id: toApiNodeId(params.target),
          edge_type: "supports",
        };

        fetch("/api/graph/edges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newEdge),
        })
          .then(async (res) => {
            if (res.ok) {
              await fetchGraphData();
              await computeLogics();
            }
          })
          .catch((err) => console.error("Failed to create edge:", err));
      }
    },
    [fetchGraphData, computeLogics, toApiNodeId]
  );

  const onConnectEnd = useCallback((_event: MouseEvent | TouchEvent, connectionState: unknown) => {
    const cs = connectionState as { isValid?: boolean | null; fromNode?: { id: string } | null };
    const from = cs?.fromNode;
    if (cs?.isValid === true || !from?.id) return;
    setConnectFromSource(from.id);
    setAddNodeModal({ open: true, type: null });
  }, []);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setLogicDetailsModal({ nodeId: node.id, isOpen: true });
    },
    []
  );

  // ノードのクリック処理（タイプ別編集モーダル / イベント編集）
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const nodeData = node.data as unknown as GraphNodeData;

      if (nodeData.isEventGroup && nodeData.eventId) {
        setEditEventId(nodeData.eventId);
        setEditEventLogicId(nodeData.logicId ?? null);
        setEditInstanceId((nodeData as { instanceId?: string }).instanceId ?? null);
        return;
      }

      if (nodeData.node) {
        setEditModalNode(nodeData.node);
      }
    },
    []
  );

  const getNodesWithSameReference = useCallback(
    (referenceId: string) => {
      return graphNodes.filter((n) => n.reference_id === referenceId);
    },
    [graphNodes]
  );

  const getLogicDetailsData = useCallback(() => {
    if (!logicDetailsModal.nodeId) return null;

    const clickedNode = graphNodes.find((n) => n.node_id === logicDetailsModal.nodeId);
    if (!clickedNode) return null;

    const nodesWithSameReference = getNodesWithSameReference(clickedNode.reference_id);

    const logicIds = new Set<string>();
    nodesWithSameReference.forEach((n) => {
      const logicId = nodeToLogic.get(n.node_id);
      if (logicId) {
        logicIds.add(logicId);
      }
    });

    const logicDetails: Array<{
      logicId: string;
      logic: Logic | null;
      nodes: GraphNode[];
      relatedNodes: GraphNode[];
    }> = [];

    Array.from(logicIds).forEach((logicId) => {
      const logic = logics.find((l) => l.logic_id === logicId) || null;
      const nodesInLogic = nodesWithSameReference.filter(
        (n) => nodeToLogic.get(n.node_id) === logicId
      );

      const relatedNodeIds = new Set<string>();
      nodesInLogic.forEach((n) => {
        graphEdges.forEach((e) => {
          if (e.source_node_id === n.node_id) {
            relatedNodeIds.add(e.target_node_id);
          }
        });
        graphEdges.forEach((e) => {
          if (e.target_node_id === n.node_id) {
            relatedNodeIds.add(e.source_node_id);
          }
        });
      });
      const relatedNodes = graphNodes.filter((n) => relatedNodeIds.has(n.node_id));

      logicDetails.push({
        logicId,
        logic,
        nodes: nodesInLogic,
        relatedNodes,
      });
    });

    return {
      referenceId: clickedNode.reference_id,
      logicDetails,
    };
  }, [
    logicDetailsModal.nodeId,
    graphNodes,
    graphEdges,
    logics,
    nodeToLogic,
    getNodesWithSameReference,
  ]);

  const updateLogicName = async (logicId: string, newName: string) => {
    const logic = logics.find((l) => l.logic_id === logicId);
    if (!logic) return;

    try {
      const res = await fetch(`/api/graph/logics/${logicId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...logic,
          name: newName,
        }),
      });
      if (res.ok) {
        const updatedLogic = await res.json();
        onLogicsChange(logics.map((l) => (l.logic_id === logicId ? updatedLogic : l)));
      }
    } catch (err) {
      console.error(`Failed to update logic ${logicId}:`, err);
    }
  };

  const updateLogicColor = async (logicId: string, newColor: string) => {
    const logic = logics.find((l) => l.logic_id === logicId);
    if (!logic) return;

    try {
      const res = await fetch(`/api/graph/logics/${logicId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...logic,
          color: newColor,
        }),
      });
      if (res.ok) {
        const updatedLogic = await res.json();
        onLogicsChange(logics.map((l) => (l.logic_id === logicId ? updatedLogic : l)));
      }
    } catch (err) {
      console.error(`Failed to update logic color ${logicId}:`, err);
    }
  };

  const updateLogicDetail = async (
    nodeId: string,
    logicId: string,
    detailText: string
  ) => {
    const node = graphNodes.find((n) => n.node_id === nodeId);
    if (!node) return;

    const updatedNode = {
      ...node,
      logic_details: {
        ...node.logic_details,
        [logicId]: detailText,
      },
    };

    try {
      const res = await fetch(`/api/graph/nodes/${nodeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedNode),
      });
      if (res.ok) {
        await fetchGraphData();
      }
    } catch (err) {
      console.error(`Failed to update logic detail:`, err);
    }
  };

  const deleteLogic = async (logicId: string) => {
    if (!confirm(`ロジック「${getLogicName(logicId, logics)}」を削除しますか？`)) {
      return;
    }

    try {
      const res = await fetch(`/api/graph/logics/${logicId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onLogicsChange(logics.filter((l) => l.logic_id !== logicId));
      }
    } catch (err) {
      console.error(`Failed to delete logic ${logicId}:`, err);
    }
  };

  const logicDetailsData = getLogicDetailsData();

  const refreshGraph = useCallback(async () => {
    await fetchGraphData();
    await computeLogics();
  }, [fetchGraphData, computeLogics]);

  const onEdgesDelete = useCallback(
    async (edgesToRemove: Edge[]) => {
      // #region agent log
      _log("onEdgesDelete", { count: edgesToRemove.length, ids: edgesToRemove.map((e) => e.id) }, "H4");
      // #endregion
      try {
        for (const e of edgesToRemove) {
          const res = await fetch(`/api/graph/edges/${e.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error(`エッジ削除失敗: ${e.id}`);
        }
        await refreshGraph();
      } catch (err) {
        alert(err instanceof Error ? err.message : "エッジの削除に失敗しました");
      }
    },
    [refreshGraph]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
      const skipForm = tag === "input" || tag === "textarea" || tag === "select";
      const all = edgesRef.current;
      const sel = all.filter((x) => x.selected);
      _log("keydown Del/Bsp", {
        key: e.key,
        activeTag: tag,
        skipForm,
        totalEdges: all.length,
        selectedCount: sel.length,
        selectedIds: sel.map((x) => x.id),
      }, "H4");
      if (skipForm) return;
      if (sel.length === 0) return;
      e.preventDefault();
      (async () => {
        for (const edge of sel) {
          const res = await fetch(`/api/graph/edges/${edge.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error(`エッジ削除失敗: ${edge.id}`);
        }
        await refreshGraph();
      })().catch((err) => alert(err instanceof Error ? err.message : "エッジの削除に失敗しました"));
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [refreshGraph]);

  const refreshEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.map((x: { id: string; title: string }) => ({ id: x.id, title: x.title || x.id })));
      }
    } catch (e) {
      console.error("Failed to fetch events:", e);
    }
  }, []);

  const rawEventRef = useRef<{ payload?: Record<string, unknown> } | null>(null);

  useEffect(() => {
    if (!editEventId) {
      setEventForm(null);
      setEditEventLogicId(null);
      setEditInstanceId(null);
      rawEventRef.current = null;
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/events");
        if (!res.ok || cancelled) return;
        const list = await res.json();
        const ev = list.find((e: { id: string }) => e.id === editEventId) as EventForm & { payload?: Record<string, unknown> } | undefined;
        if (!cancelled && ev) {
          rawEventRef.current = ev;
          setEventForm({
            id: ev.id,
            title: ev.title ?? "",
            content: ev.content ?? "",
            time_range: ev.time_range ?? { start: defaultEventTime(), end: defaultEventEnd() },
            location_ids: ev.location_ids ?? [],
            participants: ev.participants ?? [],
            logic_details: (ev.payload?.logic_details as Record<string, string>) ?? ev.logic_details ?? {},
          });
        } else if (!cancelled) {
          setEventForm(null);
          setEditEventId(null);
          setEditEventLogicId(null);
          setEditInstanceId(null);
        }
      } catch (e) {
        console.error("Failed to load event:", e);
        if (!cancelled) {
          setEditEventId(null);
          setEditEventLogicId(null);
          setEditInstanceId(null);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [editEventId]);

  const setEventLocation = useCallback((locId: string | null) => {
    setEventForm((f) =>
      !f ? null : { ...f, location_ids: locId ? [locId] : [] }
    );
  }, []);

  const toggleEventPart = useCallback((id: string) => {
    setEventForm((f) =>
      !f ? null : {
        ...f,
        participants: f.participants.includes(id)
          ? f.participants.filter((x) => x !== id)
          : [...f.participants, id],
      }
    );
  }, []);

  const saveEvent = useCallback(async () => {
    if (!eventForm || !editEventId) return;
    try {
      const payload = { ...(rawEventRef.current?.payload ?? {}), logic_details: eventForm.logic_details };
      const body = { ...eventForm, time_range: eventForm.time_range, payload };
      const res = await fetch(`/api/events/${editEventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await refreshEvents();
        await refreshGraph();
        setEditEventId(null);
        setEditEventLogicId(null);
        setEditInstanceId(null);
        setEventForm(null);
      } else {
        alert("保存に失敗しました");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    }
  }, [eventForm, editEventId, refreshEvents, refreshGraph]);

  // 当該 (editEventId, editEventLogicId) に内包されているノード
  const containedNodes = useMemo(() => {
    if (!editEventId || editEventLogicId == null) return [];
    return graphNodes.filter(
      (n) => n.event_id === editEventId && nodeToLogic.get(n.node_id) === editEventLogicId
    );
  }, [graphNodes, editEventId, editEventLogicId, nodeToLogic]);

  // ロジックごとの内包ノード・追加可能ノード（イベント編集モーダル常時表示用）
  const containedByLogic = useMemo(() => {
    const m = new Map<string, GraphNode[]>();
    if (!editEventId) return m;
    graphNodes.forEach((n) => {
      if (n.event_id !== editEventId) return;
      const lid = nodeToLogic.get(n.node_id);
      if (!lid) return;
      if (!m.has(lid)) m.set(lid, []);
      m.get(lid)!.push(n);
    });
    return m;
  }, [editEventId, graphNodes, nodeToLogic]);

  const addableToEventByLogic = useMemo(() => {
    const m = new Map<string, GraphNode[]>();
    if (!editEventId) return m;
    const contained = new Set<string>();
    containedByLogic.forEach((nodes) => nodes.forEach((n) => contained.add(n.node_id)));
    graphNodes.forEach((n) => {
      if (contained.has(n.node_id)) return;
      const lid = nodeToLogic.get(n.node_id);
      if (!lid) return;
      if (!m.has(lid)) m.set(lid, []);
      m.get(lid)!.push(n);
    });
    return m;
  }, [editEventId, graphNodes, nodeToLogic, containedByLogic]);

  /** 当該 (eventId, logicId) にグラフ上のイベント枠（グループ）があるか */
  const hasGroupForLogic = useCallback(
    (eventId: string, logicId: string) => {
      return Array.from(mergedEventGroups.keys()).some((k) => {
        const parts = k.split("::");
        return parts[0] === eventId && parts[1] === logicId;
      });
    },
    [mergedEventGroups]
  );

  /** 当該イベントに、指定ロジック色のエッジが繋がっているか（ロジックはエッジの色で管理） */
  const eventHasEdgeInLogic = useCallback(
    (eventId: string, logicId: string) => {
      const eventNodeIds = new Set(
        graphNodes.filter((n) => n.event_id === eventId).map((n) => n.node_id)
      );
      if (eventNodeIds.size === 0) return false;
      const found = graphEdges.some((e) => {
        const srcIn = eventNodeIds.has(e.source_node_id);
        const tgtIn = eventNodeIds.has(e.target_node_id);
        if (!srcIn && !tgtIn) return false;
        const srcLogic = nodeToLogic.get(e.source_node_id);
        const tgtLogic = nodeToLogic.get(e.target_node_id);
        return srcLogic === logicId || tgtLogic === logicId;
      });
      // #region agent log
      _log("eventHasEdgeInLogic", { eventId, logicId, eventNodeCount: eventNodeIds.size, found }, "H1");
      // #endregion
      return found;
    },
    [graphEdges, graphNodes, nodeToLogic]
  );

  /** このイベントが含まれるロジック一覧（詳細・内包ブロック表示用。"" と _orphan_ 除く）。紐づけのみも含む。 */
  const logicsForEvent = useMemo(() => {
    if (!editEventId) return [];
    const skip = new Set(["", "_orphan_"]);
    const ids = new Set<string>();
    mergedEventGroups.forEach((_, key) => {
      const [eid, logicId] = key.split("::");
      if (eid === editEventId && logicId != null && !skip.has(logicId)) ids.add(logicId);
    });
    emptyEventInstances.forEach((p) => {
      if (p.eventId === editEventId && p.logicId != null && !skip.has(p.logicId)) ids.add(p.logicId);
    });
    eventLogicAssociations.forEach((p) => {
      if (p.eventId === editEventId && p.logicId != null && !skip.has(p.logicId)) ids.add(p.logicId);
    });
    return Array.from(ids);
  }, [editEventId, mergedEventGroups, emptyEventInstances, eventLogicAssociations]);

  const removeNodeFromEvent = useCallback(
    async (node: GraphNode) => {
      try {
        const updated = { ...node, event_id: null };
        const res = await fetch(`/api/graph/nodes/${node.node_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
        if (res.ok) await refreshGraph();
      } catch (e) {
        alert(e instanceof Error ? e.message : "内包からの削除に失敗しました");
      }
    },
    [refreshGraph]
  );

  const addNodeToEvent = useCallback(
    async (node: GraphNode, logicId: string) => {
      if (!editEventId) return;
      try {
        const updated = { ...node, event_id: editEventId };
        const res = await fetch(`/api/graph/nodes/${node.node_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
        if (res.ok) {
          setEmptyEventInstances((prev) =>
            prev.filter((p) => {
              if (p.eventId !== editEventId || p.logicId !== logicId) return true;
              if (editInstanceId != null && editInstanceId !== "")
                return p.instanceId !== editInstanceId;
              return true;
            })
          );
          setRemovedEventIdsFromGraph((prev) => prev.filter((id) => id !== editEventId));
          await refreshGraph();
        }
      } catch (e) {
        alert(e instanceof Error ? e.message : "内包への追加に失敗しました");
      }
    },
    [editEventId, editInstanceId, refreshGraph]
  );

  /** ロジック紐づけのみ。グラフに新規イベント枠は作らない。 */
  const addEventToOtherLogic = useCallback(
    (logicId: string) => {
      if (!editEventId) return;
      setEventLogicAssociations((prev) => {
        if (prev.some((p) => p.eventId === editEventId && p.logicId === logicId)) return prev;
        return [...prev, { eventId: editEventId, logicId }];
      });
    },
    [editEventId]
  );

  /** 指定ロジックに空イベント枠（グラフ上のノード）を追加する。 */
  const addEmptyInstanceForLogic = useCallback(
    (logicId: string) => {
      if (!editEventId) return;
      const instanceId = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      setEmptyEventInstances((prev) => [...prev, { eventId: editEventId, logicId, instanceId }]);
      setRemovedEventIdsFromGraph((prev) => prev.filter((id) => id !== editEventId));
      setLayoutRevision((r) => r + 1);
    },
    [editEventId]
  );

  const removeEventGroupFromGraph = useCallback(async () => {
    // #region agent log
    _log("removeEventGroupFromGraph", { editEventId, called: true }, "H5");
    // #endregion
    if (!editEventId) return;

    const hasEmptyForLogic = (eid: string, lid: string, instId?: string | null) =>
      emptyEventInstances.some(
        (p) =>
          p.eventId === eid &&
          p.logicId === lid &&
          (instId == null || instId === "" || p.instanceId === instId)
      );
    const hasEmptyForEvent = (eid: string) =>
      emptyEventInstances.some((p) => p.eventId === eid);

    let hasAnythingToDelete: boolean;
    if (editEventLogicId != null && editEventLogicId !== "") {
      hasAnythingToDelete =
        containedNodes.length > 0 || hasEmptyForLogic(editEventId, editEventLogicId, editInstanceId);
    } else {
      const nodesToRemove = graphNodes.filter((n) => n.event_id === editEventId);
      hasAnythingToDelete = nodesToRemove.length > 0 || hasEmptyForEvent(editEventId);
    }

    if (!hasAnythingToDelete) {
      setRemovedEventIdsFromGraph((prev) =>
        prev.includes(editEventId) ? prev : [...prev, editEventId]
      );
      setLayoutRevision((r) => r + 1);
      alert("グラフから削除しました。");
      setEditEventId(null);
      setEditEventLogicId(null);
      setEditInstanceId(null);
      setEventForm(null);
      return;
    }
    // #region agent log
    _log("removeEventGroupFromGraph", { editEventId, noConfirm: true, enteringTry: true }, "H5");
    // #endregion

    try {
      const deleteNode = async (nodeId: string) => {
        const res = await fetch(`/api/graph/nodes/${nodeId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`ノード削除失敗: ${nodeId}`);
      };
      const deleteEdge = async (edgeId: string) => {
        const res = await fetch(`/api/graph/edges/${edgeId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`エッジ削除失敗: ${edgeId}`);
      };

      let wasLastRepresentation: boolean;
      if (editEventLogicId != null && editEventLogicId !== "") {
        if (containedNodes.length > 0) {
          const edgeIds = new Set<string>();
          for (const n of containedNodes) {
            graphEdges.forEach((e) => {
              if (e.source_node_id === n.node_id || e.target_node_id === n.node_id) edgeIds.add(e.edge_id);
            });
          }
          for (const eid of edgeIds) await deleteEdge(eid);
          for (const n of containedNodes) await deleteNode(n.node_id);
        } else {
          setEmptyEventInstances((prev) =>
            prev.filter((p) => {
              if (p.eventId !== editEventId || p.logicId !== editEventLogicId) return true;
              if (editInstanceId != null && editInstanceId !== "") return p.instanceId !== editInstanceId;
              return false;
            })
          );
        }
        const otherNodes = graphNodes.filter(
          (n) => n.event_id === editEventId && nodeToLogic.get(n.node_id) !== editEventLogicId
        );
        const otherEmpties = emptyEventInstances.filter((p) => {
          if (p.eventId !== editEventId) return false;
          if (editInstanceId != null && editInstanceId !== "")
            return !(p.logicId === editEventLogicId && p.instanceId === editInstanceId);
          return true;
        });
        wasLastRepresentation = otherNodes.length === 0 && otherEmpties.length === 0;
      } else {
        const nodesToRemove = graphNodes.filter((n) => n.event_id === editEventId);
        const edgeIds = new Set<string>();
        for (const n of nodesToRemove) {
          graphEdges.forEach((e) => {
            if (e.source_node_id === n.node_id || e.target_node_id === n.node_id) edgeIds.add(e.edge_id);
          });
        }
        for (const eid of edgeIds) await deleteEdge(eid);
        for (const n of nodesToRemove) await deleteNode(n.node_id);
        setEmptyEventInstances((prev) => prev.filter((p) => p.eventId !== editEventId));
        wasLastRepresentation = true;
      }
      await refreshGraph();
      setLayoutRevision((r) => r + 1);
      if (wasLastRepresentation) {
        setRemovedEventIdsFromGraph((prev) =>
          prev.includes(editEventId) ? prev : [...prev, editEventId]
        );
      }
      alert("削除しました。");
      setEditEventId(null);
      setEditEventLogicId(null);
      setEditInstanceId(null);
      setEventForm(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
    }
  }, [
    editEventId,
    editEventLogicId,
    editInstanceId,
    containedNodes,
    graphNodes,
    graphEdges,
    emptyEventInstances,
    nodeToLogic,
    refreshGraph,
  ]);

  const addNodeForExisting = useCallback(
    async (type: NodeType, referenceId: string) => {
      const nodeId = `node_${Date.now()}`;
      const src = connectFromSource;
      setAddNodeModal({ open: false, type: null });
      setConnectFromSource(null);
      try {
        await fetch("/api/graph/nodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            node_id: nodeId,
            node_type: type,
            reference_id: referenceId,
            logic_details: {},
            logic_related_entities: {},
          }),
        });
        if (src) {
          await fetch("/api/graph/edges", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              edge_id: `edge_${Date.now()}`,
              source_node_id: toApiNodeId(src),
              target_node_id: nodeId,
              edge_type: "supports",
            }),
          });
        }
        await fetchGraphData();
      } catch (e) {
        console.error("Add node failed:", e);
        alert(e instanceof Error ? e.message : "追加に失敗しました");
      }
    },
    [fetchGraphData, connectFromSource, toApiNodeId]
  );

  const addNodeNew = useCallback(
    async (type: NodeType) => {
      const ts = Date.now();
      const nodeId = `node_${ts}`;
      const src = connectFromSource;
      setAddNodeModal({ open: false, type: null });
      setConnectFromSource(null);
      try {
        if (type === "Evidence") {
          const refId = `ev_${ts}`;
          await fetch("/api/evidence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: refId,
              name: "新規証拠",
              summary: "",
              detail: "",
            }),
          });
          await fetch("/api/graph/nodes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              node_id: nodeId,
              node_type: "Evidence",
              reference_id: refId,
              logic_details: {},
              logic_related_entities: {},
            }),
          });
        } else if (type === "Secret") {
          if (!characters.length) {
            alert("先に人物を追加してください。");
            return;
          }
          const refId = `sec_${ts}`;
          await fetch("/api/secrets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: refId,
              character_id: characters[0].id,
              title: "",
              description: "",
            }),
          });
          await fetch("/api/graph/nodes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              node_id: nodeId,
              node_type: "Secret",
              reference_id: refId,
              logic_details: {},
              logic_related_entities: {},
            }),
          });
        } else if (type === "Location") {
          const refId = `loc_${ts}`;
          await fetch("/api/locations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: refId, name: "新規場所" }),
          });
          await fetch("/api/graph/nodes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              node_id: nodeId,
              node_type: "Location",
              reference_id: refId,
              logic_details: {},
              logic_related_entities: {},
            }),
          });
        } else {
          const refId = `ch_${ts}`;
          await fetch("/api/characters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: refId, name: "新規人物" }),
          });
          await fetch("/api/graph/nodes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              node_id: nodeId,
              node_type: "Character",
              reference_id: refId,
              logic_details: {},
              logic_related_entities: {},
            }),
          });
        }
        if (src) {
          await fetch("/api/graph/edges", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              edge_id: `edge_${Date.now()}`,
              source_node_id: toApiNodeId(src),
              target_node_id: nodeId,
              edge_type: "supports",
            }),
          });
        }
        await fetchGraphData();
        if (type === "Location") {
          const locId = `loc_${ts}`;
          setLocations((prev) =>
            prev.some((x) => x.id === locId) ? prev : [...prev, { id: locId, name: "新規場所" }]
          );
        }
        if (type === "Character") {
          const chId = `ch_${ts}`;
          setCharacters((prev) =>
            prev.some((x) => x.id === chId) ? prev : [...prev, { id: chId, name: "新規人物" }]
          );
        }
      } catch (e) {
        console.error("Add node failed:", e);
        alert(e instanceof Error ? e.message : "追加に失敗しました");
      }
    },
    [characters, fetchGraphData, connectFromSource, toApiNodeId]
  );

  return (
    <div style={{ width: "100%", height: "calc(100vh - 4rem)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flexShrink: 0, padding: "0.75rem 0", marginBottom: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <button className="btn-primary" onClick={() => setAddNodeOpen((o) => !o)}>
            ノードを追加 ▾
          </button>
          {addNodeOpen && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 999 }}
                onClick={() => setAddNodeOpen(false)}
                aria-hidden="true"
              />
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  background: "#161b22",
                  border: "1px solid #30363d",
                  borderRadius: 8,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  zIndex: 1000,
                  minWidth: 160,
                }}
              >
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "0.5rem 1rem",
                    background: "none",
                    border: "none",
                    color: "#e6edf3",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setAddNodeOpen(false);
                    setAddNodeModal({ open: true, type: "Evidence" });
                  }}
                >
                  証拠
                </button>
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "0.5rem 1rem",
                    background: "none",
                    border: "none",
                    color: "#e6edf3",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setAddNodeOpen(false);
                    setAddNodeModal({ open: true, type: "Secret" });
                  }}
                >
                  秘密
                </button>
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "0.5rem 1rem",
                    background: "none",
                    border: "none",
                    color: "#e6edf3",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setAddNodeOpen(false);
                    setAddNodeModal({ open: true, type: "Location" });
                  }}
                >
                  場所
                </button>
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "0.5rem 1rem",
                    background: "none",
                    border: "none",
                    color: "#e6edf3",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setAddNodeOpen(false);
                    setAddNodeModal({ open: true, type: "Character" });
                  }}
                >
                  人物
                </button>
                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "0.5rem 1rem",
                    background: "none",
                    border: "none",
                    color: "#e6edf3",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setAddNodeOpen(false);
                    setAddNodeModal({ open: true, type: "Event" });
                  }}
                >
                  イベント
                </button>
              </div>
            </>
          )}
        </div>
        <button className="btn-primary" onClick={() => setLogicManagementModal(true)}>
          ロジック管理
        </button>
        <button
          className="btn-primary"
          onClick={async () => {
            await computeLogics();
            await fetchGraphData();
            setLayoutRevision((r) => r + 1);
          }}
        >
          整列
        </button>
      </div>

      {addNodeModal.open && (
        <div
          className="modal-overlay"
          onClick={() => {
            setAddNodeModal({ open: false, type: null });
            setConnectFromSource(null);
          }}
        >
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {addNodeModal.type == null && (connectFromSource ? "ノードを追加して接続" : "種類を選択")}
                {addNodeModal.type === "Evidence" && "証拠を選択"}
                {addNodeModal.type === "Secret" && "秘密を選択"}
                {addNodeModal.type === "Location" && "場所を選択"}
                {addNodeModal.type === "Character" && "人物を選択"}
                {addNodeModal.type === "Event" && "イベントを追加"}
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  setAddNodeModal({ open: false, type: null });
                  setConnectFromSource(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {addNodeModal.type == null ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {(["Evidence", "Secret", "Location", "Character", "Event"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="btn-secondary"
                      style={{ width: "100%", padding: "0.75rem" }}
                      onClick={() => setAddNodeModal((m) => ({ ...m, type: t }))}
                    >
                      {t === "Evidence" && "証拠"}
                      {t === "Secret" && "秘密"}
                      {t === "Location" && "場所"}
                      {t === "Character" && "人物"}
                      {t === "Event" && "イベント"}
                    </button>
                  ))}
                </div>
              ) : addNodeModal.type === "Event" ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      maxHeight: 320,
                      overflowY: "auto",
                    }}
                  >
                    {events.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.5rem 0.75rem",
                          background: "#21262d",
                          borderRadius: 6,
                          border: "1px solid #30363d",
                        }}
                      >
                        <span>{ev.title || ev.id}</span>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ padding: "0.25rem 0.75rem", fontSize: "0.9rem" }}
                          onClick={async () => {
                            await refreshEvents();
                            const instanceId = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                            setEmptyEventInstances((prev) => [
                              ...prev,
                              { eventId: ev.id, logicId: "_orphan_", instanceId },
                            ]);
                            setRemovedEventIdsFromGraph((prev) => prev.filter((id) => id !== ev.id));
                            setAddNodeModal({ open: false, type: null });
                            setConnectFromSource(null);
                            setEditEventId(ev.id);
                            setEditEventLogicId("_orphan_");
                            setEditInstanceId(instanceId);
                            setLayoutRevision((r) => r + 1);
                          }}
                        >
                          選択
                        </button>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      marginTop: "1rem",
                      paddingTop: "1rem",
                      borderTop: "1px solid #30363d",
                    }}
                  >
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ width: "100%" }}
                      onClick={async () => {
                        const newId = `ev_${Date.now()}`;
                        try {
                          await fetch("/api/events", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              id: newId,
                              title: "",
                              content: "",
                              time_range: { start: defaultEventTime(), end: defaultEventEnd() },
                              location_ids: [],
                              participants: [],
                            }),
                          });
                          await refreshEvents();
                          await refreshGraph();
                          const instanceId = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                          setEmptyEventInstances((prev) => [
                            ...prev,
                            { eventId: newId, logicId: "_orphan_", instanceId },
                          ]);
                          setRemovedEventIdsFromGraph((prev) => prev.filter((id) => id !== newId));
                          setAddNodeModal({ open: false, type: null });
                          setConnectFromSource(null);
                          setEditEventId(newId);
                          setEditEventLogicId("_orphan_");
                          setEditInstanceId(instanceId);
                          setLayoutRevision((r) => r + 1);
                        } catch (e) {
                          console.error("Failed to create event:", e);
                          alert(e instanceof Error ? e.message : "イベントの作成に失敗しました");
                        }
                      }}
                    >
                      新規作成
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      maxHeight: 320,
                      overflowY: "auto",
                    }}
                  >
                    {addNodeModal.type === "Evidence" &&
                      evidence.map((e) => (
                        <div
                          key={e.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0.5rem 0.75rem",
                            background: "#21262d",
                            borderRadius: 6,
                            border: "1px solid #30363d",
                          }}
                        >
                          <span>{e.name || e.id}</span>
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ padding: "0.25rem 0.75rem", fontSize: "0.9rem" }}
                            onClick={() => addNodeForExisting("Evidence", e.id)}
                          >
                            選択
                          </button>
                        </div>
                      ))}
                    {addNodeModal.type === "Secret" &&
                      secrets.map((s) => (
                        <div
                          key={s.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0.5rem 0.75rem",
                            background: "#21262d",
                            borderRadius: 6,
                            border: "1px solid #30363d",
                          }}
                        >
                          <span>{s.title || s.description || s.id}</span>
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ padding: "0.25rem 0.75rem", fontSize: "0.9rem" }}
                            onClick={() => addNodeForExisting("Secret", s.id)}
                          >
                            選択
                          </button>
                        </div>
                      ))}
                    {addNodeModal.type === "Location" &&
                      locations.map((l) => (
                        <div
                          key={l.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0.5rem 0.75rem",
                            background: "#21262d",
                            borderRadius: 6,
                            border: "1px solid #30363d",
                          }}
                        >
                          <span>{l.name || l.id}</span>
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ padding: "0.25rem 0.75rem", fontSize: "0.9rem" }}
                            onClick={() => addNodeForExisting("Location", l.id)}
                          >
                            選択
                          </button>
                        </div>
                      ))}
                    {addNodeModal.type === "Character" &&
                      characters.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0.5rem 0.75rem",
                            background: "#21262d",
                            borderRadius: 6,
                            border: "1px solid #30363d",
                          }}
                        >
                          <span>{c.name || c.id}</span>
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ padding: "0.25rem 0.75rem", fontSize: "0.9rem" }}
                            onClick={() => addNodeForExisting("Character", c.id)}
                          >
                            選択
                          </button>
                        </div>
                      ))}
                  </div>
                  <div
                    style={{
                      marginTop: "1rem",
                      paddingTop: "1rem",
                      borderTop: "1px solid #30363d",
                    }}
                  >
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ width: "100%" }}
                      onClick={() => addNodeNew(addNodeModal.type as NodeType)}
                    >
                      新規作成
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, width: "100%" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={(changes) => {
            for (const c of changes) {
              const t = (c as { type?: string; id?: string }).type;
              if (t === "select" || t === "remove")
                _log("onEdgesChange", { type: t, id: (c as { id?: string }).id, selected: (c as { selected?: boolean }).selected }, "H4");
            }
            onEdgesChange(changes);
          }}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onEdgesDelete={onEdgesDelete}
          onEdgeClick={(_ev, edge) => _log("onEdgeClick", { edgeId: edge.id }, "H4")}
          onEdgeContextMenu={(ev, edge) => {
            ev.preventDefault();
            setEdgeContextMenu({ x: ev.clientX, y: ev.clientY, edgeId: edge.id });
          }}
          onNodeContextMenu={onNodeContextMenu}
          onNodeClick={onNodeClick}
          deleteKeyCode={["Backspace", "Delete"]}
          elementsSelectable={true}
          elevateEdgesOnSelect={true}
          fitView
          nodeTypes={nodeTypes}
          nodeOrigin={[0, 0]}
          defaultEdgeOptions={{
            style: { strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed },
          }}
        >
          <Background />
          <Controls showZoom={false} showFitView={true} showInteractive={false} />
          <MiniMap />
        </ReactFlow>
      </div>

      {/* エッジ右クリックメニュー */}
      {edgeContextMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9998 }}
            onClick={() => setEdgeContextMenu(null)}
            aria-hidden="true"
          />
          <div
            style={{
              position: "fixed",
              left: edgeContextMenu.x,
              top: edgeContextMenu.y,
              zIndex: 9999,
              background: "#1c2128",
              border: "1px solid #30363d",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              padding: "4px 0",
              minWidth: "140px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                border: "none",
                borderRadius: 0,
                background: "transparent",
                color: "#e6edf3",
                cursor: "pointer",
              }}
              onClick={async () => {
                const id = edgeContextMenu.edgeId;
                setEdgeContextMenu(null);
                try {
                  const res = await fetch(`/api/graph/edges/${id}`, { method: "DELETE" });
                  if (!res.ok) throw new Error(`エッジ削除失敗: ${id}`);
                  await refreshGraph();
                } catch (err) {
                  alert(err instanceof Error ? err.message : "エッジの削除に失敗しました");
                }
              }}
            >
              エッジを削除
            </button>
          </div>
        </>
      )}

      {/* ロジック詳細モーダル */}
      {logicDetailsModal.isOpen && logicDetailsData && (
        <div
          className="modal-overlay"
          onClick={() => setLogicDetailsModal({ nodeId: null, isOpen: false })}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>ロジック詳細: {logicDetailsData.referenceId}</h3>
              <button
                className="modal-close"
                onClick={() => setLogicDetailsModal({ nodeId: null, isOpen: false })}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {logicDetailsData.logicDetails.map((detail) => (
                <div
                  key={detail.logicId}
                  style={{
                    marginBottom: "2rem",
                    padding: "1rem",
                    border: "1px solid #30363d",
                    borderRadius: "8px",
                  }}
                >
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem" }}>ロジック名:</label>
                    <input
                      type="text"
                      className="form-control"
                      value={detail.logic?.name || detail.logicId}
                      onChange={(e) => updateLogicName(detail.logicId, e.target.value)}
                    />
                  </div>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem" }}>ロジックの色:</label>
                    <input
                      type="color"
                      value={detail.logic?.color || getLogicColor(detail.logicId, logics)}
                      onChange={(e) => updateLogicColor(detail.logicId, e.target.value)}
                      style={{ width: "100%", height: "40px" }}
                    />
                  </div>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem" }}>詳細テキスト:</label>
                    <textarea
                      className="form-control"
                      value={
                        detail.nodes.length > 0
                          ? detail.nodes[0].logic_details[detail.logicId] || ""
                          : ""
                      }
                      onChange={async (e) => {
                        const promises = detail.nodes.map((node) =>
                          updateLogicDetail(node.node_id, detail.logicId, e.target.value)
                        );
                        await Promise.all(promises);
                      }}
                      rows={3}
                    />
                    {detail.nodes.length > 1 && (
                      <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#8b949e" }}>
                        このロジックに属するノード数: {detail.nodes.length}
                      </div>
                    )}
                  </div>
                  {detail.relatedNodes.length > 0 && (
                    <div>
                      <label style={{ display: "block", marginBottom: "0.5rem" }}>内包事象:</label>
                      <ul>
                        {detail.relatedNodes.map((node) => (
                          <li key={node.node_id}>
                            {node.node_type}: {getNodeLabel(node)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* タイプ別編集モーダル（クリックで開く） */}
      {editModalNode && (
        <>
          {editModalNode.node_type === "Evidence" && (
            <EditEvidenceModal
              node={editModalNode}
              graphNodes={graphNodes}
              graphEdges={graphEdges}
              logics={logics}
              nodeToLogic={nodeToLogicMap}
              locations={locations}
              characters={characters}
              events={events}
              onClose={() => setEditModalNode(null)}
              onSaved={refreshGraph}
              onDeletedFromGraph={refreshGraph}
              updateLogicDetail={updateLogicDetail}
              getLogicColor={(id, l) => getLogicColor(id, l)}
              getLogicName={(id, l) => getLogicName(id, l)}
              getNodeLabel={getNodeLabel}
            />
          )}
          {editModalNode.node_type === "Secret" && (
            <EditSecretModal
              node={editModalNode}
              graphNodes={graphNodes}
              graphEdges={graphEdges}
              logics={logics}
              nodeToLogic={nodeToLogicMap}
              characters={characters}
              events={events}
              onClose={() => setEditModalNode(null)}
              onSaved={refreshGraph}
              onDeletedFromGraph={refreshGraph}
              updateLogicDetail={updateLogicDetail}
              getLogicColor={(id, l) => getLogicColor(id, l)}
              getLogicName={(id, l) => getLogicName(id, l)}
              getNodeLabel={getNodeLabel}
            />
          )}
          {editModalNode.node_type === "Location" && (
            <EditLocationModal
              node={editModalNode}
              graphNodes={graphNodes}
              graphEdges={graphEdges}
              logics={logics}
              nodeToLogic={nodeToLogicMap}
              events={events}
              onClose={() => setEditModalNode(null)}
              onSaved={refreshGraph}
              onDeletedFromGraph={refreshGraph}
              updateLogicDetail={updateLogicDetail}
              getLogicColor={(id, l) => getLogicColor(id, l)}
              getLogicName={(id, l) => getLogicName(id, l)}
              getNodeLabel={getNodeLabel}
            />
          )}
          {editModalNode.node_type === "Character" && (
            <EditCharacterModal
              node={editModalNode}
              graphNodes={graphNodes}
              graphEdges={graphEdges}
              logics={logics}
              nodeToLogic={nodeToLogicMap}
              events={events}
              onClose={() => setEditModalNode(null)}
              onSaved={refreshGraph}
              onDeletedFromGraph={refreshGraph}
              updateLogicDetail={updateLogicDetail}
              getLogicColor={(id, l) => getLogicColor(id, l)}
              getLogicName={(id, l) => getLogicName(id, l)}
              getNodeLabel={getNodeLabel}
            />
          )}
        </>
      )}

      {/* ロジック管理モーダル */}
      {logicManagementModal && (
        <div className="modal-overlay" onClick={() => setLogicManagementModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>ロジック管理</h3>
              <button className="modal-close" onClick={() => setLogicManagementModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {logics.map((logic) => (
                <div
                  key={logic.logic_id}
                  style={{
                    marginBottom: "1rem",
                    padding: "1rem",
                    border: "1px solid #30363d",
                    borderRadius: "8px",
                  }}
                >
                  <div style={{ marginBottom: "0.5rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem" }}>
                      ロジックID: {logic.logic_id}
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={logic.name}
                      onChange={(e) => updateLogicName(logic.logic_id, e.target.value)}
                      style={{ marginBottom: "0.5rem" }}
                    />
                  </div>
                  <div style={{ marginBottom: "0.5rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem" }}>色:</label>
                    <input
                      type="color"
                      value={logic.color || getLogicColor(logic.logic_id, logics)}
                      onChange={(e) => updateLogicColor(logic.logic_id, e.target.value)}
                      style={{ width: "100%", height: "40px" }}
                    />
                  </div>
                  <button className="btn-danger" onClick={() => deleteLogic(logic.logic_id)}>
                    削除
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* イベント編集モーダル（イベントノードクリック時） */}
      {editEventId && (
        <div className="modal-overlay" onClick={() => { setEditEventId(null); setEditEventLogicId(null); setEditInstanceId(null); setEventForm(null); }}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>イベント編集</h3>
              <button type="button" className="modal-close" onClick={() => { setEditEventId(null); setEditEventLogicId(null); setEditInstanceId(null); setEventForm(null); }}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {!eventForm ? (
                <div className="loading">読み込み中…</div>
              ) : (
                <>
              <div className="form-group">
                <label>タイトル</label>
                <input
                  className="form-control"
                  value={eventForm.title}
                  onChange={(e) => setEventForm((f) => f ? { ...f, title: e.target.value } : null)}
                />
              </div>
              <div className="form-group">
                <label>内容</label>
                <textarea
                  className="form-control"
                  value={eventForm.content}
                  onChange={(e) => setEventForm((f) => f ? { ...f, content: e.target.value } : null)}
                  rows={3}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>開始</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={(eventForm.time_range?.start ?? "").slice(0, 16)}
                    onChange={(e) =>
                      setEventForm((f) =>
                        f
                          ? {
                              ...f,
                              time_range: {
                                ...f.time_range,
                                start: e.target.value ? `${e.target.value}:00` : f.time_range.start,
                              },
                            }
                          : null
                      )
                    }
                  />
                </div>
                <div className="form-group">
                  <label>終了</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={(eventForm.time_range?.end ?? "").slice(0, 16)}
                    onChange={(e) =>
                      setEventForm((f) =>
                        f
                          ? {
                              ...f,
                              time_range: {
                                ...f.time_range,
                                end: e.target.value ? `${e.target.value}:00` : f.time_range.end,
                              },
                            }
                          : null
                      )
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label>場所（1つのみ）</label>
                <div className="checkbox-group" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                  <label className="checkbox-label">
                    <input
                      type="radio"
                      name="graph-event-location"
                      checked={(eventForm.location_ids ?? []).length === 0}
                      onChange={() => setEventLocation(null)}
                    />
                    未設定
                  </label>
                  {locations.map((loc) => (
                    <label key={loc.id} className="checkbox-label">
                      <input
                        type="radio"
                        name="graph-event-location"
                        checked={(eventForm.location_ids ?? [])[0] === loc.id}
                        onChange={() => setEventLocation(loc.id)}
                      />
                      {loc.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>参加者（複数可）</label>
                <div className="checkbox-group">
                  {characters.map((c) => (
                    <label key={c.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={eventForm.participants.includes(c.id)}
                        onChange={() => toggleEventPart(c.id)}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>ロジックを紐づけ</label>
                <p style={{ fontSize: "0.85rem", color: "#8b949e", marginBottom: "0.5rem" }}>
                  紐づけたロジックに詳細を書けます。グラフに枠は増えません。枠を増やすには各ロジックブロックの「イベント枠を追加」を使います。
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {logics
                    .filter((L) => !logicsForEvent.includes(L.logic_id))
                    .map((L) => (
                      <button
                        key={L.logic_id}
                        type="button"
                        className="btn-secondary"
                        style={{
                          padding: "0.35rem 0.6rem",
                          fontSize: "0.9rem",
                          borderColor: L.color ?? undefined,
                        }}
                        onClick={() => addEventToOtherLogic(L.logic_id)}
                      >
                        + {L.name || L.logic_id}
                      </button>
                    ))}
                  {logics.filter((L) => !logicsForEvent.includes(L.logic_id)).length === 0 && (
                    <span style={{ fontSize: "0.9rem", color: "#8b949e" }}>全ロジックに紐づけ済み</span>
                  )}
                </div>
              </div>
              <div className="form-group">
                <label>ロジックごとの詳細・内包事象</label>
                {logicsForEvent.length === 0 ? (
                  <p style={{ fontSize: "0.9rem", color: "#8b949e" }}>
                    「ロジックを紐づけ」でロジックを追加すると、ここに詳細・内包事象を設定できます。
                  </p>
                ) : (
                  logicsForEvent.map((logicId) => {
                    const contained = containedByLogic.get(logicId) ?? [];
                    const addable = addableToEventByLogic.get(logicId) ?? [];
                    const hasGroup = editEventId ? hasGroupForLogic(editEventId, logicId) : false;
                    const hasEdge = editEventId ? eventHasEdgeInLogic(editEventId, logicId) : false;
                    const showAddFrame = !hasGroup && !hasEdge;
                    // #region agent log
                    _log("logicBlock", { editEventId, logicId, hasGroup, hasEdge, showAddFrame }, "H2");
                    // #endregion
                    return (
                      <div
                        key={logicId}
                        style={{
                          marginBottom: "1rem",
                          padding: "1rem",
                          border: "1px solid #30363d",
                          borderRadius: 8,
                          background: "#0d1117",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.2rem 0.5rem",
                            borderRadius: 6,
                            background: getLogicColor(logicId, logics),
                            color: "#fff",
                            fontSize: "0.85rem",
                            marginBottom: "0.5rem",
                          }}
                        >
                          {getLogicName(logicId, logics)}
                        </span>
                        <div style={{ marginTop: "0.5rem" }}>
                          <label style={{ fontSize: "0.85rem", color: "#8b949e", display: "block", marginBottom: "0.25rem" }}>
                            詳細
                          </label>
                          <textarea
                            className="form-control"
                            placeholder="このロジックでの説明を入力..."
                            value={eventForm.logic_details[logicId] ?? ""}
                            onChange={(e) =>
                              setEventForm((f) =>
                                !f ? null : {
                                  ...f,
                                  logic_details: { ...f.logic_details, [logicId]: e.target.value },
                                }
                              )
                            }
                            rows={2}
                            style={{ marginTop: "0.25rem" }}
                          />
                        </div>
                        {showAddFrame ? (
                          <div style={{ marginTop: "0.75rem" }}>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ fontSize: "0.9rem" }}
                              onClick={() => addEmptyInstanceForLogic(logicId)}
                            >
                              イベント枠を追加（グラフに表示）
                            </button>
                          </div>
                        ) : (
                        <div style={{ marginTop: "0.75rem" }}>
                          <label style={{ fontSize: "0.85rem", color: "#8b949e", display: "block", marginBottom: "0.35rem" }}>
                            内包事象（このロジック内のノード）
                          </label>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
                            {contained.map((n) => (
                              <span
                                key={n.node_id}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.35rem",
                                  padding: "0.25rem 0.5rem",
                                  background: "#21262d",
                                  borderRadius: 6,
                                  fontSize: "0.9rem",
                                  border: "1px solid #30363d",
                                }}
                              >
                                {getNodeLabel(n)}
                                <button
                                  type="button"
                                  className="modal-close"
                                  style={{ padding: "0.1rem", fontSize: "1rem", lineHeight: 1 }}
                                  onClick={() => removeNodeFromEvent(n)}
                                  title="内包から削除"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                          {addable.length > 0 && (
                            <div>
                              <label style={{ fontSize: "0.85rem", color: "#8b949e", display: "block", marginBottom: "0.35rem" }}>
                                内包に追加
                              </label>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                                {addable.map((n) => (
                                  <button
                                    key={n.node_id}
                                    type="button"
                                    className="btn-secondary"
                                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.9rem" }}
                                    onClick={() => addNodeToEvent(n, logicId)}
                                  >
                                    + {getNodeLabel(n)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              {eventForm && (
                <>
                  <button type="button" className="btn-danger" onClick={removeEventGroupFromGraph}>
                    ノードを削除
                  </button>
                  <button type="button" className="btn-primary" onClick={saveEvent}>
                    保存
                  </button>
                </>
              )}
              <button type="button" className="btn-secondary" onClick={() => { setEditEventId(null); setEditEventLogicId(null); setEditInstanceId(null); setEventForm(null); }}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GraphTab;
