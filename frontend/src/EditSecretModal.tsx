import { useState, useEffect, useRef } from "react";
import type { GraphNode, GraphEdge, Logic } from "./types";

interface EditSecretModalProps {
  node: GraphNode;
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  logics: Logic[];
  nodeToLogic: Map<string, string>;
  characters: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
  onDeletedFromGraph: () => void;
  onDeleted: () => void;
  updateLogicDetail: (nodeId: string, logicId: string, detailText: string) => Promise<void>;
  getLogicColor: (logicId: string, logics: Logic[]) => string;
  getLogicName: (logicId: string, logics: Logic[]) => string;
}

type SecretApi = { id: string; character_id: string; description: string; [k: string]: unknown };

export default function EditSecretModal({
  node,
  graphNodes,
  graphEdges,
  logics,
  nodeToLogic,
  characters,
  onClose,
  onSaved,
  onDeletedFromGraph,
  onDeleted,
  updateLogicDetail,
  getLogicColor,
  getLogicName,
}: EditSecretModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<SecretApi | null>(null);
  const [saving, setSaving] = useState(false);
  const [logicDetails, setLogicDetails] = useState<Record<string, string>>({});
  const logicDetailsInited = useRef(false);

  const refId = node.reference_id;
  const sameRefNodes = graphNodes.filter((n) => n.reference_id === refId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/secrets/${refId}`)
      .then((r) => {
        if (!r.ok) throw new Error("秘密を取得できませんでした");
        return r.json();
      })
      .then((data: SecretApi) => {
        if (!cancelled) setForm(data);
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

  const relatedIds = new Set<string>();
  sameRefNodes.forEach((n) => {
    graphEdges.forEach((e) => {
      if (e.source_node_id === n.node_id) relatedIds.add(e.target_node_id);
      if (e.target_node_id === n.node_id) relatedIds.add(e.source_node_id);
    });
  });
  const relatedNodes = graphNodes.filter((n) => relatedIds.has(n.node_id));

  const logicIds = new Set<string>();
  sameRefNodes.forEach((n) => {
    const lid = nodeToLogic.get(n.node_id);
    if (lid) logicIds.add(lid);
  });

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/secrets/${refId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("保存に失敗しました");
      for (const logicId of Object.keys(logicDetails)) {
        const text = logicDetails[logicId];
        const nodesInLogic = sameRefNodes.filter((n) => nodeToLogic.get(n.node_id) === logicId);
        for (const nod of nodesInLogic.length ? nodesInLogic : sameRefNodes) {
          await updateLogicDetail(nod.node_id, logicId, text);
        }
      }
      onSaved();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFromGraph = async () => {
    if (!confirm("グラフからこの秘密を削除しますか？")) return;
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

  const handleDelete = async () => {
    if (!confirm("この秘密を完全に削除しますか？")) return;
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
      await fetch(`/api/secrets/${refId}`, { method: "DELETE" });
      onDeleted();
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
            <h3>秘密を編集</h3>
            <button type="button" className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">読み込み中…</div>
        </div>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>秘密を編集</h3>
            <button type="button" className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <p>{error ?? "データがありません"}</p>
            <div className="modal-footer" style={{ marginTop: "1rem", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" className="btn-danger" onClick={handleDeleteFromGraph}>グラフから削除</button>
                <button type="button" className="btn-danger" onClick={handleDelete}>削除</button>
              </div>
              <button type="button" className="btn-secondary" onClick={onClose}>キャンセル</button>
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
          <h3>秘密を編集</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>キャラクター</label>
            <select
              className="form-control"
              value={form.character_id}
              onChange={(e) => setForm({ ...form, character_id: e.target.value })}
            >
              {characters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>説明</label>
            <textarea
              className="form-control"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>
          {Array.from(logicIds).length > 0 && (
            <div className="form-group">
              <label>ロジックごとの情報</label>
              {Array.from(logicIds).map((logicId) => (
                <div key={logicId} style={{ marginBottom: "1rem" }}>
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
                  <textarea
                    className="form-control"
                    placeholder="このロジックでの説明を入力..."
                    value={logicDetails[logicId] ?? ""}
                    onChange={(e) =>
                      setLogicDetails((prev) => ({ ...prev, [logicId]: e.target.value }))
                    }
                    rows={2}
                    style={{ marginTop: "0.35rem" }}
                  />
                </div>
              ))}
            </div>
          )}
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
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="btn-danger" onClick={handleDeleteFromGraph}>
              グラフから削除
            </button>
            <button type="button" className="btn-danger" onClick={handleDelete}>
              削除
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="btn-secondary" onClick={onClose}>キャンセル</button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
