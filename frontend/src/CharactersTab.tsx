import { useState, useEffect, useRef } from "react";
import { useAutoSave } from "./useAutoSave";

type Relation = {
  to: string;
  label: string;
  strength: number;
};

type Character = {
  id: string;
  name: string;
  role?: string;
  bio?: string | null;
  relations?: Relation[];
  secret_ids?: string[];
};

export default function CharactersTab() {
  const [list, setList] = useState<Character[]>([]);
  const [secrets, setSecrets] = useState<{ id: string; character_id: string; title?: string; description: string; hidden_from_character_ids?: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    id: "",
    name: "",
    role: "player",
    bio: "",
    relations: [] as Relation[],
    secret_ids: [] as string[],
  });
  const [editingRelation, setEditingRelation] = useState<Relation | null>(null);
  const isInitialMount = useRef(true);

  const fetchList = async () => {
    try {
      const [charRes, secRes] = await Promise.all([
        fetch("/api/characters"),
        fetch("/api/secrets"),
      ]);
      if (charRes.ok) setList(await charRes.json());
      if (secRes.ok) setSecrets(await secRes.json());
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
    const newId = `ch_${Date.now()}`;
    setForm({
      id: newId,
      name: "",
      role: "player",
      bio: "",
      relations: [],
      secret_ids: [],
    });
    setEditId(newId);
    setModal("add");
    isInitialMount.current = true;
    // 追加時は即座に作成
    fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: newId,
        name: "",
        role: "player",
        bio: null,
        relations: [],
        secret_ids: [],
      }),
    })
      .then(() => fetchList())
      .catch((e) => console.error("Failed to create:", e));
  };

  const openEdit = (c: Character) => {
    setForm({
      id: c.id,
      name: c.name,
      role: (c.role as string) || "player",
      bio: c.bio || "",
      relations: (c.relations as Relation[]) || [],
      secret_ids: c.secret_ids || [],
    });
    setEditId(c.id);
    setModal("edit");
    isInitialMount.current = true;
  };

  const save = async () => {
    if (!editId) return;
    try {
      const existing = list.find((x) => x.id === editId) ?? null;
      const body = {
        ...existing,
        id: editId,
        name: form.name,
        role: form.role,
        bio: form.bio || null,
        relations: form.relations,
        secret_ids: existing?.secret_ids ?? form.secret_ids,
      };
      await fetch(`/api/characters/${editId}`, {
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

  const addRelation = () => {
    setEditingRelation({ to: "", label: "friend", strength: 0.5 });
  };

  const saveRelation = () => {
    if (!editingRelation || !editingRelation.to) return;
    setForm((f) => ({
      ...f,
      relations: [...f.relations, editingRelation],
    }));
    setEditingRelation(null);
  };

  const removeRelation = (index: number) => {
    setForm((f) => ({
      ...f,
      relations: f.relations.filter((_, i) => i !== index),
    }));
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
        <div className="unified-card-grid">
          {list.map((c) => (
            <div
              key={c.id}
              className="unified-card"
              onClick={() => openEdit(c)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && openEdit(c)}
            >
              <div className="location-name">{c.name || "(名前なし)"}</div>
              <div className="location-type">{(c.role as string) || "player"}</div>
              {c.bio && (
                <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "#8b949e" }}>
                  {c.bio.slice(0, 60)}
                  {c.bio.length > 60 ? "…" : ""}
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
              <h3>{modal === "add" ? "キャラクター追加" : "キャラクター編集"}</h3>
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
              <div className="form-group">
                <label>背景</label>
                <textarea
                  className="form-control"
                  value={form.bio}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                  rows={4}
                  placeholder="キャラクターの背景・プロフィール"
                />
              </div>
              <div className="form-group">
                <label>人間関係</label>
                <div style={{ marginBottom: "0.5rem" }}>
                  {form.relations.map((rel, idx) => {
                    const targetChar = list.find((c) => c.id === rel.to);
                    return (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "0.5rem",
                          background: "#21262d",
                          borderRadius: 6,
                          marginBottom: "0.5rem",
                        }}
                      >
                        <span>{targetChar?.name || rel.to}</span>
                        <span style={{ color: "#8b949e" }}>—</span>
                        <span>{rel.label}</span>
                        <span style={{ color: "#8b949e" }}>({rel.strength.toFixed(1)})</span>
                        <button
                          type="button"
                          className="btn-danger"
                          style={{ marginLeft: "auto", padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
                          onClick={() => removeRelation(idx)}
                        >
                          削除
                        </button>
                      </div>
                    );
                  })}
                </div>
                {!editingRelation ? (
                  <button type="button" className="btn-secondary" onClick={addRelation}>
                    関係を追加
                  </button>
                ) : (
                  <div style={{ padding: "0.5rem", background: "#21262d", borderRadius: 6 }}>
                    <div className="form-row">
                      <div className="form-group" style={{ marginBottom: "0.5rem" }}>
                        <label>対象キャラ</label>
                        <select
                          className="form-control"
                          value={editingRelation.to}
                          onChange={(e) =>
                            setEditingRelation((r) => (r ? { ...r, to: e.target.value } : null))
                          }
                        >
                          <option value="">選択</option>
                          {list
                            .filter((c) => c.id !== form.id && !form.relations.some((r) => r.to === c.id))
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: "0.5rem" }}>
                        <label>関係タイプ</label>
                        <select
                          className="form-control"
                          value={editingRelation.label}
                          onChange={(e) =>
                            setEditingRelation((r) => (r ? { ...r, label: e.target.value } : null))
                          }
                        >
                          <option value="friend">friend</option>
                          <option value="colleague">colleague</option>
                          <option value="lover">lover</option>
                          <option value="rival">rival</option>
                          <option value="enemy">enemy</option>
                          <option value="family">family</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: "0.5rem" }}>
                      <label>強度: {editingRelation.strength.toFixed(1)}</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={editingRelation.strength}
                        onChange={(e) =>
                          setEditingRelation((r) =>
                            r ? { ...r, strength: parseFloat(e.target.value) } : null
                          )
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button type="button" className="btn-primary" onClick={saveRelation}>
                        追加
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setEditingRelation(null)}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>秘密（秘密タブの「隠したい人物」で自動設定・読取専用）</label>
                <div style={{ fontSize: "0.9rem", color: "#8b949e", marginBottom: "0.35rem" }}>
                  秘密タブで設定します。
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                  {(form.secret_ids ?? [])
                    .map((sid) => secrets.find((s) => s.id === sid))
                    .filter(Boolean)
                    .map((s) => (
                      <span
                        key={s!.id}
                        style={{
                          display: "inline-block",
                          padding: "0.2rem 0.5rem",
                          borderRadius: 6,
                          background: "#21262d",
                          border: "1px solid #30363d",
                          fontSize: "0.9rem",
                        }}
                      >
                        {(s!.title || s!.description || "(無題)").slice(0, 40)}
                        {(s!.title || s!.description || "").length > 40 ? "…" : ""}
                      </span>
                    ))}
                  {(form.secret_ids ?? []).length === 0 && (
                    <span style={{ color: "#8b949e", fontSize: "0.9rem" }}>—</span>
                  )}
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
