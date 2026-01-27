import { useState, useEffect, useRef, useMemo } from "react";
import { useAutoSave } from "./useAutoSave";
import type { GraphNode, GraphEdge, Logic } from "./types";

interface EditLocationModalProps {
  node: GraphNode;
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  logics: Logic[];
  nodeToLogic: Map<string, string>;
  events: { id: string; title: string }[];
  onClose: () => void;
  onSaved: () => void;
  onDeletedFromGraph: () => void;
  updateLogicDetail: (nodeId: string, logicId: string, detailText: string) => Promise<void>;
  getLogicColor: (logicId: string, logics: Logic[]) => string;
  getLogicName: (logicId: string, logics: Logic[]) => string;
  getNodeLabel: (node: GraphNode) => string;
}

type LocationApi = { id: string; name: string };

export default function EditLocationModal({
  node,
  graphNodes,
  graphEdges,
  logics,
  nodeToLogic,
  events,
  onClose,
  onSaved,
  onDeletedFromGraph,
  updateLogicDetail,
  getLogicColor,
  getLogicName,
  getNodeLabel,
}: EditLocationModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [eventId, setEventId] = useState<string | null>(node.event_id || null);
  const [logicDetails, setLogicDetails] = useState<Record<string, string>>({});
  const logicDetailsInited = useRef(false);
  const isInitialMount = useRef(true);

  const refId = node.reference_id;
  const sameRefNodes = graphNodes.filter((n) => n.reference_id === refId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/locations/${refId}`)
      .then((r) => {
        if (!r.ok) throw new Error("場所を取得できませんでした");
        return r.json();
      })
      .then((data: LocationApi) => {
        if (!cancelled) setName(data.name);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "エラー");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refId]);

  const logicIds = useMemo(() => {
    const s = new Set<string>();
    sameRefNodes.forEach((n) => {
      const lid = nodeToLogic.get(n.node_id);
      if (lid) s.add(lid);
    });
    return Array.from(s);
  }, [sameRefNodes, nodeToLogic]);

  const relatedByLogic = useMemo(() => {
    const m = new Map<string, GraphNode[]>();
    logicIds.forEach((logicId) => {
      const nodesInLogic = sameRefNodes.filter((n) => nodeToLogic.get(n.node_id) === logicId);
      const relatedIds = new Set<string>();
      nodesInLogic.forEach((n) => {
        graphEdges.forEach((e) => {
          if (e.source_node_id === n.node_id) relatedIds.add(e.target_node_id);
          if (e.target_node_id === n.node_id) relatedIds.add(e.source_node_id);
        });
      });
      m.set(logicId, graphNodes.filter((n) => relatedIds.has(n.node_id)));
    });
    return m;
  }, [logicIds, sameRefNodes, nodeToLogic, graphEdges, graphNodes]);

  useEffect(() => {
    if (logicDetailsInited.current || loading || !sameRefNodes.length) return;
    logicDetailsInited.current = true;
    const next: Record<string, string> = {};
    sameRefNodes.forEach((n) => {
      Object.entries(n.logic_details || {}).forEach(([k, v]) => {
        if (v) next[k] = v;
      });
    });
    setLogicDetails(next);
  }, [loading, refId, sameRefNodes]);

  const handleSave = async () => {
    try {
      const res = await fetch(`/api/locations/${refId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: refId, name }),
      });
      if (!res.ok) throw new Error("保存に失敗しました");
      for (const logicId of Object.keys(logicDetails)) {
        const text = logicDetails[logicId];
        const nodesInLogic = sameRefNodes.filter((n) => nodeToLogic.get(n.node_id) === logicId);
        for (const nod of nodesInLogic.length ? nodesInLogic : sameRefNodes) {
          await updateLogicDetail(nod.node_id, logicId, text);
        }
      }
      if (eventId !== node.event_id) {
        for (const n of sameRefNodes) {
          const updatedNode = { ...n, event_id: eventId || null };
          await fetch(`/api/graph/nodes/${n.node_id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedNode),
          });
        }
      }
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  useAutoSave(
    { name, eventId, logicDetails },
    async () => {
      if (!isInitialMount.current) await handleSave();
    },
    500
  );

  useEffect(() => {
    if (isInitialMount.current) {
      const timer = setTimeout(() => {
        isInitialMount.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDeleteFromGraph = async () => {
    if (!confirm("グラフからこの場所を削除しますか？")) return;
    try {
      for (const n of sameRefNodes) {
        const connected = graphEdges.filter(
          (e) => e.source_node_id === n.node_id || e.target_node_id === n.node_id
        );
        for (const e of connected) {
          await fetch(`/api/graph/edges/${e.edge_id}`, { method: "DELETE" });
        }
        await fetch(`/api/graph/nodes/${n.node_id}`, { method: "DELETE" });
      }
      onDeletedFromGraph();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const removeEdgeToNode = async (relatedNodeId: string) => {
    try {
      const toDelete = graphEdges.filter(
        (e) =>
          (sameRefNodes.some((n) => n.node_id === e.source_node_id) && e.target_node_id === relatedNodeId) ||
          (sameRefNodes.some((n) => n.node_id === e.target_node_id) && e.source_node_id === relatedNodeId)
      );
      for (const e of toDelete) {
        await fetch(`/api/graph/edges/${e.edge_id}`, { method: "DELETE" });
      }
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "接続の解除に失敗しました");
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>場所を編集</h3>
            <button type="button" className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">読み込み中…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>場所を編集</h3>
            <button type="button" className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <p>{error}</p>
            <div className="modal-footer" style={{ marginTop: "1rem" }}>
              <button type="button" className="btn-secondary" onClick={onClose}>キャンセル</button>
              <button type="button" className="btn-danger" onClick={handleDeleteFromGraph}>グラフから削除</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>場所を編集</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>名前</label>
            <input
              type="text"
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>イベント</label>
            <select
              className="form-control"
              value={eventId || ""}
              onChange={(e) => setEventId(e.target.value || null)}
            >
              <option value="">— 未設定 —</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.title || ev.id}</option>
              ))}
            </select>
          </div>
          {logicIds.length > 0 && (
            <div className="form-group">
              <label>ロジックごとの詳細・関連事象</label>
              {logicIds.map((logicId) => (
                <div
                  key={logicId}
                  style={{
                    marginBottom: "1.25rem",
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
                    <label style={{ fontSize: "0.85rem", color: "#8b949e" }}>詳細</label>
                    <textarea
                      className="form-control"
                      placeholder="このロジックでの説明を入力..."
                      value={logicDetails[logicId] ?? ""}
                      onChange={(e) =>
                        setLogicDetails((prev) => ({ ...prev, [logicId]: e.target.value }))
                      }
                      rows={2}
                      style={{ marginTop: "0.25rem" }}
                    />
                  </div>
                  {(relatedByLogic.get(logicId) ?? []).length > 0 && (
                    <div style={{ marginTop: "0.75rem" }}>
                      <label style={{ fontSize: "0.85rem", color: "#8b949e", display: "block", marginBottom: "0.35rem" }}>
                        関連事象
                      </label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                        {(relatedByLogic.get(logicId) ?? []).map((n) => (
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
                            }}
                          >
                            {getNodeLabel(n)}
                            <button
                              type="button"
                              className="modal-close"
                              style={{ padding: "0.1rem", fontSize: "1rem", lineHeight: 1 }}
                              onClick={() => removeEdgeToNode(n.node_id)}
                              title="接続を解除"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <button type="button" className="btn-danger" onClick={handleDeleteFromGraph}>
            グラフから削除
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
