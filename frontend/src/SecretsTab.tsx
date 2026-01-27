import { useState, useEffect, useRef } from "react";
import { useAutoSave } from "./useAutoSave";

type Secret = {
  id: string;
  character_id: string;
  title?: string;
  description: string;
  hidden_from_character_ids?: string[];
};

export default function SecretsTab() {
  const [list, setList] = useState<Secret[]>([]);
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Secret>({
    id: "",
    character_id: "",
    title: "",
    description: "",
    hidden_from_character_ids: [],
  });
  const isInitialMount = useRef(true);

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
    const newId = `sec_${Date.now()}`;
    const defaultHidden = characters.map((c) => c.id);
    setForm({
      id: newId,
      character_id: "",
      title: "",
      description: "",
      hidden_from_character_ids: defaultHidden,
    });
    setEditId(newId);
    setModal("add");
    isInitialMount.current = true;
    fetch("/api/secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: newId,
        character_id: "",
        title: "",
        description: "",
        hidden_from_character_ids: defaultHidden,
      }),
    })
      .then(() => fetchList())
      .catch((e) => console.error("Failed to create:", e));
  };

  const openEdit = (s: Secret) => {
    const hidden = s.hidden_from_character_ids ?? [];
    setForm({
      ...s,
      character_id: "",
      hidden_from_character_ids: hidden.length
        ? hidden
        : characters.map((c) => c.id),
    });
    setEditId(s.id);
    setModal("edit");
    isInitialMount.current = true;
  };

  const save = async () => {
    if (!editId) return;
    try {
      const body = {
        ...form,
        hidden_from_character_ids: form.hidden_from_character_ids ?? [],
      };
      await fetch(`/api/secrets/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const hidden = new Set(form.hidden_from_character_ids ?? []);
      let chars: { id: string; secret_ids?: string[]; [k: string]: unknown }[] = [];
      try {
        const r = await fetch("/api/characters");
        if (r.ok) chars = await r.json();
      } catch (_) {}
      for (const c of chars) {
        const ids = (c.secret_ids ?? []) as string[];
        if (!ids.includes(editId)) continue;
        if (!hidden.has(c.id)) continue;
        const next = ids.filter((id) => id !== editId);
        await fetch(`/api/characters/${c.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...c, secret_ids: next }),
        });
      }
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

  const toggleHiddenFrom = (characterId: string) => {
    setForm((f) => ({
      ...f,
      hidden_from_character_ids: f.hidden_from_character_ids?.includes(characterId)
        ? f.hidden_from_character_ids.filter((id) => id !== characterId)
        : [...(f.hidden_from_character_ids ?? []), characterId],
    }));
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

  if (loading) return <div className="loading">読み込み中…</div>;

  return (
    <div>
      <div className="page-header">
        <h2>秘密</h2>
        <button type="button" className="btn-primary" onClick={openAdd}>
          追加
        </button>
      </div>
      {!characters.length && (
        <p style={{ marginBottom: "1rem", color: "#8b949e" }}>
          「隠したい人物」を選ぶには、先にキャラクターを登録してください。
        </p>
      )}
      {list.length === 0 ? (
        <div className="empty-state">
          秘密がありません。「追加」で登録してください。
        </div>
      ) : (
        <div className="unified-card-grid">
          {list.map((s) => (
            <div
              key={s.id}
              className="unified-card"
              onClick={() => openEdit(s)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && openEdit(s)}
            >
              <div className="location-name">
                {s.title || "(タイトルなし)"}
              </div>
              <div style={{ marginTop: "0.25rem", fontSize: "0.85rem", color: "#8b949e" }}>
                隠す: {characters.filter((c) => (s.hidden_from_character_ids ?? []).includes(c.id)).map((c) => c.name).join(", ") || "—"}
              </div>
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
                <label>タイトル</label>
                <input
                  className="form-control"
                  value={form.title ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="短い見出し"
                />
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
              <div className="form-group">
                <label>隠したい人物（全員から複数選択）</label>
                <div className="checkbox-group">
                  {characters.map((c) => (
                      <label key={c.id} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={form.hidden_from_character_ids?.includes(c.id) ?? false}
                          onChange={() => toggleHiddenFrom(c.id)}
                        />
                        {c.name}
                      </label>
                    ))}
                </div>
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
