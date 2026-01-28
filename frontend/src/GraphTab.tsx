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

const GraphTab: React.FC<GraphTabProps> = ({ logics, onLogicsChange }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [logicDetailsModal, setLogicDetailsModal] = useState<{
    nodeId: string | null;
    isOpen: boolean;
  }>({ nodeId: null, isOpen: false });
  const [logicManagementModal, setLogicManagementModal] = useState(false);
  /** タイプ別編集モーダル用（クリックで開く） */
  const [editModalNode, setEditModalNode] = useState<GraphNode | null>(null);
  /** イベントノードクリック時の編集モーダル用 */
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editEventLogicId, setEditEventLogicId] = useState<string | null>(null);
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
  /** 他ロジックに追加した空 (event, logic) インスタンス */
  const [emptyEventInstances, setEmptyEventInstances] = useState<Array<{ eventId: string; logicId: string }>>([]);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const hasInitialLayout = useRef(false);
  const prevLayoutRevisionRef = useRef(0);
  const prevGraphNodesLength = useRef(0);
  const prevEventGroups = useRef<Map<string, GraphNode[]>>(new Map());

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

  // eventGroups + 空 (event, logic) インスタンスをマージ
  const mergedEventGroups = useMemo(() => {
    const m = new Map<string, GraphNode[]>(eventGroups);
    emptyEventInstances.forEach(({ eventId, logicId }) => {
      const key = `${eventId}::${logicId}`;
      if (!m.has(key)) m.set(key, []);
    });
    return m;
  }, [eventGroups, emptyEventInstances]);

  /** ロジックごとの階層レイアウト: 分岐は左列に縦、同階層は横に並べる */
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
        let col = 0;

        branch.forEach((id) => {
          pos.set(id, { x: logicBaseX + 0, y: L * (H + GAP) });
        });
        if (branch.length) col = 1;
        rest.forEach((id) => {
          pos.set(id, { x: logicBaseX + col * (W + GAP), y: L * (H + GAP) });
          col++;
        });
        maxCol = Math.max(maxCol, col);
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

    // イベントグループを処理。キー "eventId::logicId"（空グループ含む）
    mergedEventGroups.forEach((groupNodes, key) => {
      const [eventId, logicId] = key.split("::");
      const event = events.find((e) => e.id === eventId);
      const groupNodeId = `event_group_${eventId}::${logicId}`;

      const cols = Math.min(3, groupNodes.length);
      const rows = Math.ceil(groupNodes.length / 3);
      const groupWidth = Math.max(300, padding * 2 + cols * nodeWidth + (cols - 1) * nodeGap);
      const groupHeight = Math.max(200, headerHeight + padding + rows * nodeHeight + (rows - 1) * nodeGap);

      nodes.push({
        id: groupNodeId,
        type: "custom",
        position: { x: baseX, y: baseY },
        data: {
          label: `イベント: ${event?.title || eventId}`,
          node: null,
          color: "#6b7280",
          isEventGroup: true,
          eventId,
          logicId,
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

      baseY += 250;
      if (baseY > 800) {
        baseY = 0;
        baseX += 400;
      }
    });

    // 空イベントグループ（events に存在するが内包ノードが0件のイベント）
    const eventIdsWithGroup = new Set<string>();
    mergedEventGroups.forEach((_, key) => {
      const [eid] = key.split("::");
      eventIdsWithGroup.add(eid);
    });
    events.forEach((ev) => {
      if (eventIdsWithGroup.has(ev.id)) return;
      const groupNodeId = `event_group_${ev.id}::`;
      const groupWidth = 300;
      const groupHeight = 200;
      nodes.push({
        id: groupNodeId,
        type: "custom",
        position: { x: baseX, y: baseY },
        data: {
          label: `イベント: ${ev.title || ev.id}`,
          node: null,
          color: "#6b7280",
          isEventGroup: true,
          eventId: ev.id,
          logicId: "",
        } as unknown as Record<string, unknown>,
        width: groupWidth,
        height: groupHeight,
      });
      baseY += 250;
      if (baseY > 800) {
        baseY = 0;
        baseX += 400;
      }
    });

    // イベントに紐づいていないノード：ロジックごと階層整列
    const nonEvent = graphNodes.filter((n) => !processedNodeIds.has(n.node_id));
    nonEvent.forEach((node) => {
      const logicId = nodeToLogic.get(node.node_id);
      const logicName = logicId ? getLogicName(logicId, logics) : "";
      const fillColor = NODE_TYPE_COLORS[node.node_type] ?? DEFAULT_NODE_COLOR;
      const p = logicLayout.get(node.node_id) ?? { x: 0, y: 0 };

      nodes.push({
        id: node.node_id,
        type: "custom",
        position: { x: p.x, y: p.y },
        data: {
          label: getNodeLabel(node),
          node: node,
          color: fillColor,
          logicName,
        } as unknown as Record<string, unknown>,
      });
    });

    return nodes;
  }, [graphNodes, nodeToLogic, logics, mergedEventGroups, events, getNodeLabel, logicLayout]);

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
    setEdges(toRFEdges);
  }, [toRFEdges, setEdges]);

  useEffect(() => {
    if (graphNodes.length > 0 && !hasInitialLayout.current) {
      hasInitialLayout.current = true;
      setLayoutRevision((r) => r + 1);
    }
  }, [graphNodes.length]);

  useEffect(() => {
    if (layoutRevision <= 0) return;
    // 整列ボタン押下時のみ適用: layoutRevision が増えたときだけ再配置する
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
        }
      } catch (e) {
        console.error("Failed to load event:", e);
        if (!cancelled) {
          setEditEventId(null);
          setEditEventLogicId(null);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [editEventId]);

  const toggleEventLoc = useCallback((id: string) => {
    setEventForm((f) =>
      !f ? null : {
        ...f,
        location_ids: f.location_ids.includes(id)
          ? f.location_ids.filter((x) => x !== id)
          : [...f.location_ids, id],
      }
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
        setEventForm(null);
      } else {
        alert("保存に失敗しました");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    }
  }, [eventForm, editEventId, refreshEvents, refreshGraph]);

  const removeEvent = useCallback(async () => {
    if (!editEventId || !confirm("このイベントを削除しますか？")) return;
    try {
      const res = await fetch(`/api/events/${editEventId}`, { method: "DELETE" });
      if (res.ok) {
        await refreshEvents();
        await refreshGraph();
        setEditEventId(null);
        setEditEventLogicId(null);
        setEventForm(null);
      } else {
        alert("削除に失敗しました");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
    }
  }, [editEventId, refreshEvents, refreshGraph]);

  // 当該 (editEventId, editEventLogicId) に内包されているノード
  const containedNodes = useMemo(() => {
    if (!editEventId || editEventLogicId == null) return [];
    return graphNodes.filter(
      (n) => n.event_id === editEventId && nodeToLogic.get(n.node_id) === editEventLogicId
    );
  }, [graphNodes, editEventId, editEventLogicId, nodeToLogic]);

  // 同じロジックで内包に追加できるノード（event_id 未設定 or 他イベント）
  const addableToEventNodes = useMemo(() => {
    if (!editEventId || editEventLogicId == null) return [];
    const contained = new Set(containedNodes.map((n) => n.node_id));
    return graphNodes.filter((n) => {
      if (contained.has(n.node_id)) return false;
      return nodeToLogic.get(n.node_id) === editEventLogicId;
    });
  }, [graphNodes, editEventId, editEventLogicId, nodeToLogic, containedNodes]);

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
    async (node: GraphNode) => {
      if (!editEventId || editEventLogicId == null) return;
      try {
        const updated = { ...node, event_id: editEventId };
        const res = await fetch(`/api/graph/nodes/${node.node_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
        if (res.ok) {
          setEmptyEventInstances((prev) =>
            prev.filter((p) => !(p.eventId === editEventId && p.logicId === editEventLogicId))
          );
          await refreshGraph();
        }
      } catch (e) {
        alert(e instanceof Error ? e.message : "内包への追加に失敗しました");
      }
    },
    [editEventId, editEventLogicId, refreshGraph]
  );

  const addEventToOtherLogic = useCallback(
    (logicId: string) => {
      if (!editEventId) return;
      const key = `${editEventId}::${logicId}`;
      if (mergedEventGroups.has(key)) return;
      setEmptyEventInstances((prev) => {
        if (prev.some((p) => p.eventId === editEventId && p.logicId === logicId)) return prev;
        return [...prev, { eventId: editEventId, logicId }];
      });
    },
    [editEventId, mergedEventGroups]
  );

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
                          onClick={() => {
                            setAddNodeModal({ open: false, type: null });
                            setConnectFromSource(null);
                            setEditEventId(ev.id);
                            setEditEventLogicId(null);
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
                          setAddNodeModal({ open: false, type: null });
                          setConnectFromSource(null);
                          setEditEventId(newId);
                          setEditEventLogicId(null);
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
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onNodeContextMenu={onNodeContextMenu}
          onNodeClick={onNodeClick}
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
              onDeleted={refreshGraph}
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
        <div className="modal-overlay" onClick={() => { setEditEventId(null); setEditEventLogicId(null); setEventForm(null); }}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>イベント編集</h3>
              <button type="button" className="modal-close" onClick={() => { setEditEventId(null); setEditEventLogicId(null); setEventForm(null); }}>
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
                <label>場所（複数可）</label>
                <div className="checkbox-group">
                  {locations.map((loc) => (
                    <label key={loc.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={eventForm.location_ids.includes(loc.id)}
                        onChange={() => toggleEventLoc(loc.id)}
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
                <label>別ロジックにこのイベントを追加</label>
                <p style={{ fontSize: "0.85rem", color: "#8b949e", marginBottom: "0.5rem" }}>
                  追加したロジックに空のイベント枠が表示され、そこで内包ノードを設定できます。
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {logics
                    .filter((L) => !mergedEventGroups.has(`${editEventId}::${L.logic_id}`))
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
                  {logics.filter((L) => !mergedEventGroups.has(`${editEventId}::${L.logic_id}`)).length === 0 && (
                    <span style={{ fontSize: "0.9rem", color: "#8b949e" }}>すべてのロジックに追加済みです</span>
                  )}
                </div>
              </div>
              {editEventLogicId != null && editEventLogicId !== "" && (
                <div className="form-group">
                  <label>ロジックごとの詳細・内包事象</label>
                  <div
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
                        background: getLogicColor(editEventLogicId, logics),
                        color: "#fff",
                        fontSize: "0.85rem",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {getLogicName(editEventLogicId, logics)}
                    </span>
                    <div style={{ marginTop: "0.5rem" }}>
                      <label style={{ fontSize: "0.85rem", color: "#8b949e", display: "block", marginBottom: "0.25rem" }}>
                        詳細
                      </label>
                      <textarea
                        className="form-control"
                        placeholder="このロジックでの説明を入力..."
                        value={eventForm.logic_details[editEventLogicId] ?? ""}
                        onChange={(e) =>
                          setEventForm((f) =>
                            !f ? null : {
                              ...f,
                              logic_details: { ...f.logic_details, [editEventLogicId]: e.target.value },
                            }
                          )
                        }
                        rows={2}
                        style={{ marginTop: "0.25rem" }}
                      />
                    </div>
                    <div style={{ marginTop: "0.75rem" }}>
                      <label style={{ fontSize: "0.85rem", color: "#8b949e", display: "block", marginBottom: "0.35rem" }}>
                        内包事象（このロジック内のノード）
                      </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
                    {containedNodes.map((n) => (
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
                  {addableToEventNodes.length > 0 && (
                    <div>
                      <label style={{ fontSize: "0.85rem", color: "#8b949e", display: "block", marginBottom: "0.35rem" }}>
                        内包に追加
                      </label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                        {addableToEventNodes.map((n) => (
                          <button
                            key={n.node_id}
                            type="button"
                            className="btn-secondary"
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.9rem" }}
                            onClick={() => addNodeToEvent(n)}
                          >
                            + {getNodeLabel(n)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                    </div>
                  </div>
                </div>
              )}
                </>
              )}
            </div>
            <div className="modal-footer">
              {eventForm && (
                <>
                  <button type="button" className="btn-danger" onClick={removeEvent}>
                    削除
                  </button>
                  <button type="button" className="btn-primary" onClick={saveEvent}>
                    保存
                  </button>
                </>
              )}
              <button type="button" className="btn-secondary" onClick={() => { setEditEventId(null); setEditEventLogicId(null); setEventForm(null); }}>
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
