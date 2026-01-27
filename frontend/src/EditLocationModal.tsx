import { useState, useEffect, useRef } from "react";
import { useAutoSave } from "./useAutoSave";
import type { GraphNode, GraphEdge } from "./types";

interface EditLocationModalProps {
  node: GraphNode;
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  events: { id: string; title: string }[];
  onClose: () => void;
  onSaved: () => void;
  onDeletedFromGraph: () => void;
}

type LocationApi = { id: string; name: string };

export default function EditLocationModal({
  node,
  graphNodes,
  graphEdges,
  events,
  onClose,
  onSaved,
  onDeletedFromGraph,
}: EditLocationModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [eventId, setEventId] = useState<string | null>(node.event_id || null);
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

  const relatedIds = new Set<string>();
  sameRefNodes.forEach((n) => {
    graphEdges.forEach((e) => {
      if (e.source_node_id === n.node_id) relatedIds.add(e.target_node_id);
      if (e.target_node_id === n.node_id) relatedIds.add(e.source_node_id);
    });
  });
  const relatedNodes = graphNodes.filter((n) => relatedIds.has(n.node_id));

  const handleSave = async () => {
    try {
      const res = await fetch(`/api/locations/${refId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: refId, name }),
      });
      if (!res.ok) throw new Error("保存に失敗しました");
      // イベントIDを更新
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

  // 自動保存
  useAutoSave(
    { name, eventId },
    async () => {
      if (!isInitialMount.current) {
        await handleSave();
      }
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
          {relatedNodes.length > 0 && (
            <div className="form-group">
              <label>関連事象（直接つながっているノード）</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {relatedNodes.map((n) => (
                  <span
                    key={n.node_id}
                    style={{
                      padding: "0.25rem 0.5rem",
                      background: "#21262d",
                      borderRadius: 6,
                      fontSize: "0.9rem",
                    }}
                  >
                    {n.node_type}: {n.reference_id}
                  </span>
                ))}
              </div>
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
