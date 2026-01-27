import { useState, useEffect } from "react";

type Character = {
  id: string;
  name: string;
  role?: string;
  bio?: string | null;
  relations?: unknown[];
  secret_ids?: string[];
};

export default function CharactersTab() {
  const [list, setList] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ id: "", name: "", role: "player" });

  const fetchList = async () => {
    try {
      const res = await fetch("/api/characters");
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
    setForm({ id: `ch_${Date.now()}`, name: "", role: "player" });
    setEditId(null);
    setModal("add");
  };

  const openEdit = (c: Character) => {
    setForm({ id: c.id, name: c.name, role: (c.role as string) || "player" });
    setEditId(c.id);
    setModal("edit");
  };

  const save = async () => {
    try {
      const existing = modal === "edit" ? list.find((x) => x.id === editId) : null;
      if (modal === "add") {
        await fetch("/api/characters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, relations: [], secret_ids: [] }),
        });
      } else if (existing) {
        const body = {
          ...existing,
          ...form,
          relations: existing.relations ?? [],
          secret_ids: existing.secret_ids ?? [],
        };
        await fetch(`/api/characters/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
      await fetch(`/api/characters/${id}`, { method: "DELETE" });
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
        <h2>キャラクター</h2>
        <button type="button" className="btn-primary" onClick={openAdd}>
          追加
        </button>
      </div>
      {list.length === 0 ? (
        <div className="empty-state">キャラクターがありません。「追加」で登録してください。</div>
      ) : (
        <div className="characters-grid">
          {list.map((c) => (
            <div
              key={c.id}
              className="character-card"
              onClick={() => openEdit(c)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && openEdit(c)}
            >
              <div className="character-avatar">{(c.name || "?")[0]}</div>
              <div className="character-info">
                <div className="character-name">{c.name || "(名前なし)"}</div>
                <div className="character-id">{c.id}</div>
                <div className="character-role">{(c.role as string) || "player"}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal === "add" ? "キャラクター追加" : "キャラクター編集"}</h3>
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
                <label>名前</label>
                <input
                  className="form-control"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>役割</label>
                <select
                  className="form-control"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                >
                  <option value="player">player</option>
                  <option value="npc">npc</option>
                  <option value="victim">victim</option>
                  <option value="culprit">culprit</option>
                </select>
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
