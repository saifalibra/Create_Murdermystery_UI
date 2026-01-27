import { useState, useEffect, useRef } from "react";
import { useAutoSave } from "./useAutoSave";

type Evidence = {
  id: string;
  name: string;
  summary: string;
  detail: string;
  pointers?: {
    location_id?: string | null;
    character_id?: string | null;
    final_location_id?: string | null;
    final_holder_character_id?: string | null;
  };
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
  const isInitialMount = useRef(true);

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
    const newId = `ev_${Date.now()}`;
    setForm({
      id: newId,
      name: "",
      summary: "",
      detail: "",
      pointers: { final_location_id: null, final_holder_character_id: null },
    });
    setEditId(newId);
    setModal("add");
    isInitialMount.current = true;
    // 追加時は即座に作成
    fetch("/api/evidence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: newId,
        name: "",
        summary: "",
        detail: "",
        pointers: { final_location_id: null, final_holder_character_id: null },
      }),
    })
      .then(() => fetchList())
      .catch((e) => console.error("Failed to create:", e));
  };

  const openEdit = (e: Evidence) => {
    setForm({
      ...e,
      pointers: {
        ...e.pointers,
        final_location_id: e.pointers?.final_location_id ?? e.pointers?.location_id ?? null,
        final_holder_character_id: e.pointers?.final_holder_character_id ?? e.pointers?.character_id ?? null,
      },
    });
    setEditId(e.id);
    setModal("edit");
    isInitialMount.current = true;
  };

  const save = async () => {
    if (!editId) return;
    try {
      const existing = list.find((x) => x.id === editId) as Evidence & Record<string, unknown>;
      const pointers = {
        ...(existing?.pointers as object),
        final_location_id: form.pointers?.final_location_id ?? null,
        final_holder_character_id: form.pointers?.final_holder_character_id ?? null,
      };
      const body = { ...existing, ...form, pointers };
      await fetch(`/api/evidence/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await fetchList();
    } catch (err) {
      alert(err instanceof Error ? err.message : "保存に失敗しました");
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
        <div className="unified-card-grid">
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
                <label>最終場所</label>
                <select
                  className="form-control"
                  value={form.pointers?.final_location_id ?? ""}
                  onChange={(ev) =>
                    setForm((f) => ({
                      ...f,
                      pointers: { ...f.pointers, final_location_id: ev.target.value || null },
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
                <label>最終所持者</label>
                <select
                  className="form-control"
                  value={form.pointers?.final_holder_character_id ?? ""}
                  onChange={(ev) =>
                    setForm((f) => ({
                      ...f,
                      pointers: { ...f.pointers, final_holder_character_id: ev.target.value || null },
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
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
