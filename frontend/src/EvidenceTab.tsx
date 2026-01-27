import { useState, useEffect } from "react";

type Evidence = {
  id: string;
  name: string;
  summary: string;
  detail: string;
  pointers?: { location_id?: string | null; character_id?: string | null };
};

export default function EvidenceTab() {
  const [list, setList] = useState<Evidence[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Evidence>({
    id: "",
    name: "",
    summary: "",
    detail: "",
    pointers: {},
  });

  const fetchList = async () => {
    try {
      const [evRes, locRes, charRes] = await Promise.all([
        fetch("/api/evidence"),
        fetch("/api/locations"),
        fetch("/api/characters"),
      ]);
      if (evRes.ok) setList(await evRes.json());
      if (locRes.ok) {
        const data = await locRes.json();
        setLocations(data.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      }
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
      id: `ev_${Date.now()}`,
      name: "",
      summary: "",
      detail: "",
      pointers: {},
    });
    setEditId(null);
    setModal("add");
  };

  const openEdit = (e: Evidence) => {
    setForm({
      ...e,
      pointers: e.pointers ?? {},
    });
    setEditId(e.id);
    setModal("edit");
  };

  const save = async () => {
    try {
      const pointers = {
        location_id: form.pointers?.location_id ?? null,
        character_id: form.pointers?.character_id ?? null,
      };
      if (modal === "add") {
        const body = { ...form, pointers };
        await fetch("/api/evidence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        const existing = list.find((x) => x.id === editId) as Evidence & Record<string, unknown>;
        const merged = {
          ...existing,
          ...form,
          pointers: { ...(existing?.pointers as object), ...pointers },
        };
        await fetch(`/api/evidence/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(merged),
        });
      }
      await fetchList();
      setModal(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "保存に失敗しました");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      await fetch(`/api/evidence/${id}`, { method: "DELETE" });
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
        <h2>証拠</h2>
        <button type="button" className="btn-primary" onClick={openAdd}>
          追加
        </button>
      </div>
      {list.length === 0 ? (
        <div className="empty-state">証拠がありません。「追加」で登録してください。</div>
      ) : (
        <div className="evidence-list">
          {list.map((e) => (
            <div
              key={e.id}
              className="unified-card"
              onClick={() => openEdit(e)}
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => ev.key === "Enter" && openEdit(e)}
            >
              <div className="location-name">{e.name || "(名前なし)"}</div>
              <div className="location-type">{e.id}</div>
              {e.summary && (
                <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "#8b949e" }}>{e.summary}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal === "add" ? "証拠追加" : "証拠編集"}</h3>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>ID</label>
                <input
                  className="form-control"
                  value={form.id}
                  onChange={(ev) => setForm((f) => ({ ...f, id: ev.target.value }))}
                  disabled={modal === "edit"}
                />
              </div>
              <div className="form-group">
                <label>名前</label>
                <input
                  className="form-control"
                  value={form.name}
                  onChange={(ev) => setForm((f) => ({ ...f, name: ev.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>概要</label>
                <input
                  className="form-control"
                  placeholder="短い説明"
                  value={form.summary}
                  onChange={(ev) => setForm((f) => ({ ...f, summary: ev.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>詳細</label>
                <textarea
                  className="form-control"
                  placeholder="調査で判明する内容"
                  value={form.detail}
                  onChange={(ev) => setForm((f) => ({ ...f, detail: ev.target.value }))}
                  rows={4}
                />
              </div>
              <div className="form-group">
                <label>発見場所</label>
                <select
                  className="form-control"
                  value={form.pointers?.location_id ?? ""}
                  onChange={(ev) =>
                    setForm((f) => ({
                      ...f,
                      pointers: { ...f.pointers, location_id: ev.target.value || null },
                    }))
                  }
                >
                  <option value="">— 未設定 —</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>発見人物</label>
                <select
                  className="form-control"
                  value={form.pointers?.character_id ?? ""}
                  onChange={(ev) =>
                    setForm((f) => ({
                      ...f,
                      pointers: { ...f.pointers, character_id: ev.target.value || null },
                    }))
                  }
                >
                  <option value="">— 未設定 —</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
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
