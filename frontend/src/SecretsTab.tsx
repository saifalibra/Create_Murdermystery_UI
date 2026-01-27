import { useState, useEffect } from "react";

type Secret = { id: string; character_id: string; description: string };

export default function SecretsTab() {
  const [list, setList] = useState<Secret[]>([]);
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Secret>({ id: "", character_id: "", description: "" });

  const fetchList = async () => {
    try {
      const [secRes, charRes] = await Promise.all([
        fetch("/api/secrets"),
        fetch("/api/characters"),
      ]);
      if (secRes.ok) setList(await secRes.json());
      if (charRes.ok) {
        const data = await charRes.json();
        setCharacters(data.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      }
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
    setForm({
      id: `sec_${Date.now()}`,
      character_id: characters[0]?.id ?? "",
      description: "",
    });
    setEditId(null);
    setModal("add");
  };

  const openEdit = (s: Secret) => {
    setForm({ ...s });
    setEditId(s.id);
    setModal("edit");
  };

  const save = async () => {
    try {
      if (modal === "add") {
        await fetch("/api/secrets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      } else {
        await fetch(`/api/secrets/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }
      await fetchList();
      setModal(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      await fetch(`/api/secrets/${id}`, { method: "DELETE" });
      await fetchList();
      setModal(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const charName = (cid: string) => characters.find((c) => c.id === cid)?.name ?? cid;

  if (loading) return <div className="loading">読み込み中…</div>;

  return (
    <div>
      <div className="page-header">
        <h2>秘密</h2>
        <button
          type="button"
          className="btn-primary"
          onClick={openAdd}
          disabled={!characters.length}
        >
          追加
        </button>
      </div>
      {!characters.length && (
        <p style={{ marginBottom: "1rem", color: "#8b949e" }}>
          秘密を追加するには、先にキャラクターを登録してください。
        </p>
      )}
      {list.length === 0 ? (
        <div className="empty-state">
          秘密がありません。「追加」で登録してください。
        </div>
      ) : (
        <div className="secrets-list">
          {list.map((s) => (
            <div
              key={s.id}
              className="unified-card"
              onClick={() => openEdit(s)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && openEdit(s)}
            >
              <div className="location-name">ID: {s.id}</div>
              <div className="location-type">キャラ: {charName(s.character_id)}</div>
              {s.description && (
                <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "#8b949e" }}>
                  {s.description.slice(0, 80)}
                  {s.description.length > 80 ? "…" : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal === "add" ? "秘密追加" : "秘密編集"}</h3>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>ID</label>
                <input
                  className="form-control"
                  value={form.id}
                  onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                  disabled={modal === "edit"}
                />
              </div>
              <div className="form-group">
                <label>キャラクター</label>
                <select
                  className="form-control"
                  value={form.character_id}
                  onChange={(e) => setForm((f) => ({ ...f, character_id: e.target.value }))}
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
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={4}
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
                キャンセル
              </button>
              <button type="button" className="btn-primary" onClick={save}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
