import { useState, useEffect, useRef } from "react";
import { useAutoSave } from "./useAutoSave";

type Location = { id: string; name: string; details?: string | null };

export default function LocationsTab() {
  const [list, setList] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ id: "", name: "", details: "" });
  const isInitialMount = useRef(true);

  const fetchList = async () => {
    try {
      const res = await fetch("/api/locations");
      if (res.ok) setList(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const openAdd = () => {
    const newId = `loc_${Date.now()}`;
    setForm({ id: newId, name: "", details: "" });
    setEditId(newId);
    setModal("add");
    isInitialMount.current = true;
    // 追加時は即座に作成
    fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: newId, name: "", details: "" }),
    })
      .then(() => fetchList())
      .catch((e) => console.error("Failed to create:", e));
  };

  const openEdit = (loc: Location) => {
    setForm({ id: loc.id, name: loc.name || "", details: loc.details || "" });
    setEditId(loc.id);
    setModal("edit");
    isInitialMount.current = true;
  };

  const save = async () => {
    if (!editId) return;
    try {
      const body = { id: editId, name: form.name, details: form.details || null };
      await fetch(`/api/locations/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await fetchList();
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  // 自動保存（追加・編集とも）
  useAutoSave(
    form,
    async () => {
      if (editId && !isInitialMount.current) await save();
    },
    500
  );

  useEffect(() => {
    if (isInitialMount.current && modal) {
      const timer = setTimeout(() => {
        isInitialMount.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [modal]);

  const remove = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      await fetch(`/api/locations/${id}`, { method: "DELETE" });
      await fetchList();
      setModal(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  if (loading) return <div className="loading">読み込み中…</div>;

  return (
    <div>
      <div className="page-header">
        <h2>場所</h2>
        <button type="button" className="btn-primary" onClick={openAdd}>
          追加
        </button>
      </div>
      {list.length === 0 ? (
        <div className="empty-state">場所がありません。「追加」で登録してください。</div>
      ) : (
        <div className="unified-card-grid">
          {list.map((loc) => (
            <div
              key={loc.id}
              className="unified-card"
              onClick={() => openEdit(loc)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && openEdit(loc)}
            >
              <div className="location-name">{loc.name || "(名前なし)"}</div>
              {loc.details && (
                <div style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "#8b949e" }}>
                  {loc.details.slice(0, 60)}
                  {loc.details.length > 60 ? "…" : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal === "add" ? "場所追加" : "場所編集"}</h3>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>名前</label>
                <input
                  className="form-control"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>詳細</label>
                <textarea
                  className="form-control"
                  value={form.details}
                  onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                  rows={4}
                  placeholder="その場所の詳細を記載"
                />
              </div>
            </div>
            <div className="modal-footer">
              {modal === "edit" && editId && (
                <button type="button" className="btn-danger" onClick={() => remove(editId)}>
                  削除
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
