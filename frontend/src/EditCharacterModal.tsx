import { useState, useEffect } from "react";
import type { GraphNode, GraphEdge } from "./types";

interface EditCharacterModalProps {
  node: GraphNode;
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  onClose: () => void;
  onSaved: () => void;
  onDeletedFromGraph: () => void;
}

type CharacterApi = { id: string; name: string; [k: string]: unknown };

export default function EditCharacterModal({
  node,
  graphNodes,
  graphEdges,
  onClose,
  onSaved,
  onDeletedFromGraph,
}: EditCharacterModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CharacterApi | null>(null);
  const [saving, setSaving] = useState(false);

  const refId = node.reference_id;
  const sameRefNodes = graphNodes.filter((n) => n.reference_id === refId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/characters/${refId}`)
      .then((r) => {
        if (!r.ok) throw new Error("人物を取得できませんでした");
        return r.json();
      })
      .then((data: CharacterApi) => {
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

  const relatedIds = new Set<string>();
  sameRefNodes.forEach((n) => {
    graphEdges.forEach((e) => {
      if (e.source_node_id === n.node_id) relatedIds.add(e.target_node_id);
      if (e.target_node_id === n.node_id) relatedIds.add(e.source_node_id);
    });
  });
  const relatedNodes = graphNodes.filter((n) => relatedIds.has(n.node_id));

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/characters/${refId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, name: form.name }),
      });
      if (!res.ok) throw new Error("保存に失敗しました");
      onSaved();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFromGraph = async () => {
    if (!confirm("グラフからこの人物を削除しますか？")) return;
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
            <h3>人物を編集</h3>
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
            <h3>人物を編集</h3>
            <button type="button" className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <p>{error ?? "データがありません"}</p>
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
          <h3>人物を編集</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>名前</label>
            <input
              type="text"
              className="form-control"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
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