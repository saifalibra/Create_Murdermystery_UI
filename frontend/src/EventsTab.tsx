import { useState, useEffect, useRef } from "react";
import { useAutoSave } from "./useAutoSave";

type Event = {
  id: string;
  title: string;
  content: string;
  time_range: { start: string; end: string };
  location_ids: string[];
  participants: string[];
};

const defaultTime = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 19);
};

const defaultEnd = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toISOString().slice(0, 19);
};

export default function EventsTab() {
  const [list, setList] = useState<Event[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Event>({
    id: "",
    title: "",
    content: "",
    time_range: { start: defaultTime(), end: defaultEnd() },
    location_ids: [],
    participants: [],
  });
  const isInitialMount = useRef(true);

  const fetchData = async () => {
    try {
      const [evRes, locRes, charRes] = await Promise.all([
        fetch("/api/events"),
        fetch("/api/locations"),
        fetch("/api/characters"),
      ]);
      if (evRes.ok) setList(await evRes.json());
      if (locRes.ok) {
        const d = await locRes.json();
        setLocations(d.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      }
      if (charRes.ok) {
        const d = await charRes.json();
        setCharacters(d.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openAdd = () => {
    const newId = `ev_${Date.now()}`;
    setForm({
      id: newId,
      title: "",
      content: "",
      time_range: { start: defaultTime(), end: defaultEnd() },
      location_ids: [],
      participants: [],
    });
    setEditId(newId);
    setModal("add");
    isInitialMount.current = true;
    // 追加時は即座に作成
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: newId,
        title: "",
        content: "",
        time_range: { start: defaultTime(), end: defaultEnd() },
        location_ids: [],
        participants: [],
      }),
    })
      .then(() => fetchData())
      .catch((e) => console.error("Failed to create:", e));
  };

  const openEdit = (e: Event) => {
    setForm({ ...e });
    setEditId(e.id);
    setModal("edit");
    isInitialMount.current = true;
  };

  const save = async () => {
    if (!editId) return;
    try {
      const body = { ...form, time_range: form.time_range };
      await fetch(`/api/events/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await fetchData();
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
      await fetch(`/api/events/${id}`, { method: "DELETE" });
      await fetchData();
      setModal(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const toggleLoc = (id: string) => {
    setForm((f) => ({
      ...f,
      location_ids: f.location_ids.includes(id)
        ? f.location_ids.filter((x) => x !== id)
        : [...f.location_ids, id],
    }));
  };

  const togglePart = (id: string) => {
    setForm((f) => ({
      ...f,
      participants: f.participants.includes(id)
        ? f.participants.filter((x) => x !== id)
        : [...f.participants, id],
    }));
  };

  if (loading) return <div className="loading">読み込み中…</div>;

  return (
    <div>
      <div className="page-header">
        <h2>イベント</h2>
        <button type="button" className="btn-primary" onClick={openAdd}>
          追加
        </button>
      </div>
      {list.length === 0 ? (
        <div className="empty-state">イベントがありません。「追加」で登録してください。</div>
      ) : (
        <div className="events-table" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>タイトル</th>
                <th>開始</th>
                <th>終了</th>
                <th>場所</th>
                <th>参加者</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => openEdit(e)}
                  style={{ cursor: "pointer" }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => ev.key === "Enter" && openEdit(e)}
                >
                  <td>{e.title || "(無題)"}</td>
                  <td>{(e.time_range?.start ?? "").slice(0, 16)}</td>
                  <td>{(e.time_range?.end ?? "").slice(0, 16)}</td>
                  <td>
                    {(e.location_ids ?? [])
                      .map((lid) => locations.find((l) => l.id === lid)?.name || lid)
                      .join(", ") || "—"}
                  </td>
                  <td>
                    {(e.participants ?? [])
                      .map((pid) => characters.find((c) => c.id === pid)?.name || pid)
                      .join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal === "add" ? "イベント追加" : "イベント編集"}</h3>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>タイトル</label>
                <input
                  className="form-control"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>内容</label>
                <textarea
                  className="form-control"
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>開始</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={(form.time_range?.start ?? "").slice(0, 16)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        time_range: {
                          ...f.time_range,
                          start: e.target.value ? `${e.target.value}:00` : f.time_range.start,
                        },
                      }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>終了</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={(form.time_range?.end ?? "").slice(0, 16)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        time_range: {
                          ...f.time_range,
                          end: e.target.value ? `${e.target.value}:00` : f.time_range.end,
                        },
                      }))
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label>場所（複数可）</label>
                <div className="checkbox-group">
                  {locations.map((loc) => (
                    <label key={loc.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.location_ids.includes(loc.id)}
                        onChange={() => toggleLoc(loc.id)}
                      />
                      {loc.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>参加者（複数可）</label>
                <div className="checkbox-group">
                  {characters.map((c) => (
                    <label key={c.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.participants.includes(c.id)}
                        onChange={() => togglePart(c.id)}
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
