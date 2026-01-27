import { useState, useEffect, useCallback, useMemo } from "react";
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Logic, GraphNode, GraphEdge } from "./types";
import EditEvidenceModal from "./EditEvidenceModal";
import EditSecretModal from "./EditSecretModal";
import EditLocationModal from "./EditLocationModal";
import EditCharacterModal from "./EditCharacterModal";

/** ノードタイプ別の色（画像の証拠=青・秘密=赤・場所=橙・人物=紫に合わせる） */
const NODE_TYPE_COLORS: Record<string, string> = {
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
  /** タイプ別編集モーダル用（ダブルクリックで開く） */
  const [editModalNodeId, setEditModalNodeId] = useState<string | null>(null);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [addNodeOpen, setAddNodeOpen] = useState(false);

  const [nodeToLogicMap, setNodeToLogicMap] = useState<Map<string, string>>(
    new Map()
  );

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
        // ロジック一覧も更新
        if (data.logics) {
          onLogicsChange(data.logics);
        }
      }
    } catch (err) {
      console.error("Failed to compute logics:", err);
    }
  }, [onLogicsChange]);

  // ノードからロジックIDへのマッピング
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
        const [locRes, charRes] = await Promise.all([
          fetch("/api/locations"),
          fetch("/api/characters"),
        ]);
        if (locRes.ok) {
          const data = await locRes.json();
          setLocations(data.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
        }
        if (charRes.ok) {
          const data = await charRes.json();
          setCharacters(data.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
        }
      } catch (e) {
        console.error("Failed to fetch locations/characters:", e);
      }
    };
    load();
  }, []);

  // グラフデータが更新されたら連結成分を再計算
  useEffect(() => {
    if (graphNodes.length > 0 || graphEdges.length > 0) {
      computeLogics();
    }
  }, [graphNodes.length, graphEdges.length, computeLogics]);


  // React Flow用のノードに変換（タイプ別色 + ロジックはtitleで表示）
  const toRFNodes = useMemo((): Node[] => {
    return graphNodes.map((node, index) => {
      const logicId = nodeToLogic.get(node.node_id);
      const logicName = logicId ? getLogicName(logicId, logics) : "";
      const fillColor = NODE_TYPE_COLORS[node.node_type] ?? DEFAULT_NODE_COLOR;

      return {
        id: node.node_id,
        type: "default",
        position: {
          x: (index % 10) * 150,
          y: Math.floor(index / 10) * 100,
        },
        data: {
          label: `${node.node_type}: ${node.reference_id}`,
          node,
        },
        style: {
          background: fillColor,
          color: "#fff",
          border: "2px solid #fff",
          borderRadius: "8px",
          padding: "10px",
          width: 150,
        },
        title: logicName,
      };
    });
  }, [graphNodes, nodeToLogic, logics]);

  // React Flow用のエッジに変換（色分け改善）
  const toRFEdges = useMemo((): Edge[] => {
    return graphEdges.map((edge) => {
      const sourceLogicId = nodeToLogic.get(edge.source_node_id);
      const targetLogicId = nodeToLogic.get(edge.target_node_id);
      let edgeColor = "#888";

      if (sourceLogicId && targetLogicId) {
        if (sourceLogicId === targetLogicId) {
          // 同じロジックに属する場合
          edgeColor = getLogicColor(sourceLogicId, logics);
        } else {
          // 異なるロジックに属する場合（通常は起こらないが）
          edgeColor = getLogicColor(sourceLogicId, logics);
        }
      } else if (sourceLogicId) {
        edgeColor = getLogicColor(sourceLogicId, logics);
      }

      const sourceLogicName = sourceLogicId
        ? getLogicName(sourceLogicId, logics)
        : "";

      return {
        id: edge.edge_id,
        source: edge.source_node_id,
        target: edge.target_node_id,
        label: edge.edge_type,
        type: "default",
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
        style: {
          stroke: edgeColor,
          strokeWidth: 2,
        },
        labelStyle: {
          fill: edgeColor,
          fontWeight: 600,
        },
        title: sourceLogicName,
      };
    });
  }, [graphEdges, nodeToLogic, logics]);

  useEffect(() => {
    setNodes(toRFNodes);
  }, [toRFNodes, setNodes]);

  useEffect(() => {
    setEdges(toRFEdges);
  }, [toRFEdges, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        const newEdge: GraphEdge = {
          edge_id: `edge_${Date.now()}`,
          source_node_id: params.source,
          target_node_id: params.target,
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
    [fetchGraphData, computeLogics]
  );

  // ノードの右クリック処理（ロジック詳細）
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setLogicDetailsModal({ nodeId: node.id, isOpen: true });
    },
    []
  );

  // ノードのダブルクリック処理（タイプ別編集モーダル）
  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setEditModalNodeId(node.id);
  }, []);

  // 同じreference_idを持つノードを検索
  const getNodesWithSameReference = useCallback(
    (referenceId: string) => {
      return graphNodes.filter((n) => n.reference_id === referenceId);
    },
    [graphNodes]
  );

  // ロジック詳細モーダルで表示するデータを取得
  const getLogicDetailsData = useCallback(() => {
    if (!logicDetailsModal.nodeId) return null;

    const clickedNode = graphNodes.find(
      (n) => n.node_id === logicDetailsModal.nodeId
    );
    if (!clickedNode) return null;

    // 同じreference_idを持つすべてのノードを検索
    const nodesWithSameReference = getNodesWithSameReference(
      clickedNode.reference_id
    );

    // それらのノードが属するすべてのロジックIDを収集（nodeToLogicマッピングを使用）
    const logicIds = new Set<string>();
    nodesWithSameReference.forEach((n) => {
      const logicId = nodeToLogic.get(n.node_id);
      if (logicId) {
        logicIds.add(logicId);
      }
    });

    // 各ロジックごとの詳細を構築
    const logicDetails: Array<{
      logicId: string;
      logic: Logic | null;
      nodes: GraphNode[];
      relatedNodes: GraphNode[];
    }> = [];

    Array.from(logicIds).forEach((logicId) => {
      const logic = logics.find((l) => l.logic_id === logicId) || null;
      // 同じreference_idを持ち、かつこのロジックに属するノードを取得
      const nodesInLogic = nodesWithSameReference.filter(
        (n) => nodeToLogic.get(n.node_id) === logicId
      );

      // そのロジック内での関連事象（エッジで直接つながるノード）を取得
      const relatedNodeIds = new Set<string>();
      nodesInLogic.forEach((n) => {
        // このノードから出るエッジを検索
        graphEdges.forEach((e) => {
          if (e.source_node_id === n.node_id) {
            relatedNodeIds.add(e.target_node_id);
          }
        });
        // このノードに入るエッジを検索
        graphEdges.forEach((e) => {
          if (e.target_node_id === n.node_id) {
            relatedNodeIds.add(e.source_node_id);
          }
        });
      });
      const relatedNodes = graphNodes.filter((n) =>
        relatedNodeIds.has(n.node_id)
      );

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

  // ロジック名を更新
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
        onLogicsChange(
          logics.map((l) => (l.logic_id === logicId ? updatedLogic : l))
        );
      }
    } catch (err) {
      console.error(`Failed to update logic ${logicId}:`, err);
    }
  };

  // ロジックの色を更新
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
        onLogicsChange(
          logics.map((l) => (l.logic_id === logicId ? updatedLogic : l))
        );
      }
    } catch (err) {
      console.error(`Failed to update logic color ${logicId}:`, err);
    }
  };

  // ロジック詳細テキストを更新
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

  // ロジックを削除
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
  const editModalNode = editModalNodeId
    ? graphNodes.find((n) => n.node_id === editModalNodeId)
    : null;

  const refreshGraph = useCallback(async () => {
    await fetchGraphData();
    await computeLogics();
  }, [fetchGraphData, computeLogics]);

  const addNode = useCallback(
    async (type: "Evidence" | "Secret" | "Location" | "Character") => {
      setAddNodeOpen(false);
      const ts = Date.now();
      const nodeId = `node_${ts}`;
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
        await refreshGraph();
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
    [characters, refreshGraph]
  );

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <button
            className="btn-primary"
            onClick={() => setAddNodeOpen((o) => !o)}
          >
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
                  onClick={() => addNode("Evidence")}
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
                  onClick={() => addNode("Secret")}
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
                  onClick={() => addNode("Location")}
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
                  onClick={() => addNode("Character")}
                >
                  人物
                </button>
              </div>
            </>
          )}
        </div>
        <button
          className="btn-primary"
          onClick={() => setLogicManagementModal(true)}
        >
          ロジック管理
        </button>
      </div>
      <div style={{ width: "100%", height: "calc(100vh - 100px)" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDoubleClick={onNodeDoubleClick}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>

      {/* ロジック詳細モーダル */}
      {logicDetailsModal.isOpen && logicDetailsData && (
        <div className="modal-overlay" onClick={() => setLogicDetailsModal({ nodeId: null, isOpen: false })}>
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
                    <label style={{ display: "block", marginBottom: "0.5rem" }}>
                      ロジック名:
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={detail.logic?.name || detail.logicId}
                      onChange={(e) =>
                        updateLogicName(detail.logicId, e.target.value)
                      }
                    />
                  </div>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem" }}>
                      ロジックの色:
                    </label>
                    <input
                      type="color"
                      value={
                        detail.logic?.color ||
                        getLogicColor(detail.logicId, logics)
                      }
                      onChange={(e) =>
                        updateLogicColor(detail.logicId, e.target.value)
                      }
                      style={{ width: "100%", height: "40px" }}
                    />
                  </div>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem" }}>
                      詳細テキスト:
                    </label>
                    <textarea
                      className="form-control"
                      value={
                        detail.nodes.length > 0
                          ? detail.nodes[0].logic_details[detail.logicId] || ""
                          : ""
                      }
                      onChange={async (e) => {
                        // 同じreference_idを持つすべてのノードのlogic_detailsを更新
                        const promises = detail.nodes.map((node) =>
                          updateLogicDetail(
                            node.node_id,
                            detail.logicId,
                            e.target.value
                          )
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
                      <label style={{ display: "block", marginBottom: "0.5rem" }}>
                        関連事象:
                      </label>
                      <ul>
                        {detail.relatedNodes.map((node) => (
                          <li key={node.node_id}>
                            {node.node_type}: {node.reference_id}
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

      {/* タイプ別編集モーダル（ダブルクリックで開く） */}
      {editModalNode && editModalNodeId && (
        <>
          {editModalNode.node_type === "Evidence" && (
            <EditEvidenceModal
              node={editModalNode}
              graphNodes={graphNodes}
              graphEdges={graphEdges}
              locations={locations}
              characters={characters}
              onClose={() => setEditModalNodeId(null)}
              onSaved={refreshGraph}
              onDeletedFromGraph={refreshGraph}
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
              onClose={() => setEditModalNodeId(null)}
              onSaved={refreshGraph}
              onDeletedFromGraph={refreshGraph}
              onDeleted={refreshGraph}
              updateLogicDetail={updateLogicDetail}
              getLogicColor={(id, l) => getLogicColor(id, l)}
              getLogicName={(id, l) => getLogicName(id, l)}
            />
          )}
          {editModalNode.node_type === "Location" && (
            <EditLocationModal
              node={editModalNode}
              graphNodes={graphNodes}
              graphEdges={graphEdges}
              onClose={() => setEditModalNodeId(null)}
              onSaved={refreshGraph}
              onDeletedFromGraph={refreshGraph}
            />
          )}
          {editModalNode.node_type === "Character" && (
            <EditCharacterModal
              node={editModalNode}
              graphNodes={graphNodes}
              graphEdges={graphEdges}
              onClose={() => setEditModalNodeId(null)}
              onSaved={refreshGraph}
              onDeletedFromGraph={refreshGraph}
            />
          )}
        </>
      )}

      {/* ロジック管理モーダル */}
      {logicManagementModal && (
        <div
          className="modal-overlay"
          onClick={() => setLogicManagementModal(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>ロジック管理</h3>
              <button
                className="modal-close"
                onClick={() => setLogicManagementModal(false)}
              >
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
                      onChange={(e) =>
                        updateLogicName(logic.logic_id, e.target.value)
                      }
                      style={{ marginBottom: "0.5rem" }}
                    />
                  </div>
                  <div style={{ marginBottom: "0.5rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem" }}>
                      色:
                    </label>
                    <input
                      type="color"
                      value={logic.color || getLogicColor(logic.logic_id, logics)}
                      onChange={(e) =>
                        updateLogicColor(logic.logic_id, e.target.value)
                      }
                      style={{ width: "100%", height: "40px" }}
                    />
                  </div>
                  <button
                    className="btn-danger"
                    onClick={() => deleteLogic(logic.logic_id)}
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GraphTab;
