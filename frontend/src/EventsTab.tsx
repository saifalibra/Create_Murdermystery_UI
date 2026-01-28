import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAutoSave } from "./useAutoSave";
import type { Logic } from "./types";
import type { GraphNode } from "./types";

type EventForm = {
  id: string;
  title: string;
  content: string;
  time_range: { start: string; end: string };
  location_ids: string[];
  participants: string[];
  logic_details: Record<string, string>;
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

const hashColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
};

const getLogicColor = (logicId: string, logics: Logic[]): string => {
  const logic = logics.find((l) => l.logic_id === logicId);
  if (logic?.color) return logic.color;
  return hashColor(logicId);
};

const getLogicName = (logicId: string, logics: Logic[]): string => {
  const logic = logics.find((l) => l.logic_id === logicId);
  return logic?.name || logicId;
};

export default function EventsTab() {
  const [list, setList] = useState<EventForm[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [evidence, setEvidence] = useState<{ id: string; name: string }[]>([]);
  const [secrets, setSecrets] = useState<{ id: string; title?: string; description: string }[]>([]);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<{ edge_id: string; source_node_id: string; target_node_id: string; edge_type: string }[]>([]);
  const [logics, setLogics] = useState<Logic[]>([]);
  const [nodeToLogic, setNodeToLogic] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>({
    id: "",
    title: "",
    content: "",
    time_range: { start: defaultTime(), end: defaultEnd() },
    location_ids: [],
    participants: [],
    logic_details: {},
  });
  const isInitialMount = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const [evRes, locRes, charRes, eviRes, secRes, nodesRes, edgesRes, logicsRes] = await Promise.all([
        fetch("/api/events"),
        fetch("/api/locations"),
        fetch("/api/characters"),
        fetch("/api/evidence"),
        fetch("/api/secrets"),
        fetch("/api/graph/nodes"),
        fetch("/api/graph/edges"),
        fetch("/api/graph/logics"),
      ]);
      if (evRes.ok) {
        const raw = await evRes.json();
        setList(
          raw.map((e: EventForm & { payload?: { logic_details?: Record<string, string> } }) => ({
            ...e,
            logic_details: e.payload?.logic_details ?? e.logic_details ?? {},
          }))
        );
      }
      if (locRes.ok) {
        const d = await locRes.json();
        setLocations(d.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      }
      if (charRes.ok) {
        const d = await charRes.json();
        setCharacters(d.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      }
      if (eviRes.ok) {
        const d = await eviRes.json();
        setEvidence(d.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name || x.id })));
      }
      if (secRes.ok) {
        const d = await secRes.json();
        setSecrets(
          d.map((x: { id: string; title?: string; description: string }) => ({
            id: x.id,
            title: x.title,
            description: x.description || "",
          }))
        );
      }
      if (nodesRes.ok) setGraphNodes(await nodesRes.json());
      if (edgesRes.ok) setGraphEdges(await edgesRes.json());
      if (logicsRes.ok) setLogics(await logicsRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const computeLogics = useCallback(async () => {
    try {
      const res = await fetch("/api/graph/compute-logics", { method: "POST" });
      if (!res.ok) return;
      const data = await res.json();
      const m = new Map<string, string>();
      Object.entries(data.node_to_logic || {}).forEach(([nodeId, logicId]) => {
        m.set(nodeId, logicId as string);
      });
      setNodeToLogic(m);
      if (data.logics) setLogics(data.logics);
    } catch (e) {
      console.error("compute-logics", e);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (graphNodes.length > 0 || graphEdges.length > 0) computeLogics();
  }, [graphNodes.length, graphEdges.length, computeLogics]);

  const getNodeLabel = useCallback(
    (node: GraphNode): string => {
      const id = node.reference_id;
      switch (node.node_type) {
        case "Evidence":
          return evidence.find((e) => e.id === id)?.name ?? id;
        case "Secret": {
          const s = secrets.find((x) => x.id === id);
          return s?.title || s?.description || id;
        }
        case "Location":
          return locations.find((l) => l.id === id)?.name ?? id;
        case "Character":
          return characters.find((c) => c.id === id)?.name ?? id;
        default:
          return id;
      }
    },
    [evidence, secrets, locations, characters]
  );

  const containedByLogic = useMemo(() => {
    const m = new Map<string, GraphNode[]>();
    if (!editId) return m;
    graphNodes.forEach((n) => {
      if (n.event_id !== editId) return;
      const lid = nodeToLogic.get(n.node_id);
      if (!lid) return;
      if (!m.has(lid)) m.set(lid, []);
      m.get(lid)!.push(n);
    });
    return m;
  }, [editId, graphNodes, nodeToLogic]);

  const addableToEventByLogic = useMemo(() => {
    const m = new Map<string, GraphNode[]>();
    if (!editId) return m;
    const contained = new Set<string>();
    containedByLogic.forEach((nodes) => nodes.forEach((n) => contained.add(n.node_id)));
    graphNodes.forEach((n) => {
      if (contained.has(n.node_id)) return;
      const lid = nodeToLogic.get(n.node_id);
      if (!lid) return;
      if (!m.has(lid)) m.set(lid, []);
      m.get(lid)!.push(n);
    });
    return m;
  }, [editId, graphNodes, nodeToLogic, containedByLogic]);

  const removeNodeFromEvent = useCallback(
    async (node: GraphNode) => {
      try {
        const res = await fetch(`/api/graph/nodes/${node.node_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...node, event_id: null }),
        });
        if (res.ok) {
          const [nodesRes, edgesRes] = await Promise.all([
            fetch("/api/graph/nodes"),
            fetch("/api/graph/edges"),
          ]);
          if (nodesRes.ok) setGraphNodes(await nodesRes.json());
          if (edgesRes.ok) setGraphEdges(await edgesRes.json());
          await computeLogics();
        }
      } catch (e) {
        alert(e instanceof Error ? e.message : "内包からの削除に失敗しました");
      }
    },
    [computeLogics]
  );

  const addNodeToEvent = useCallback(
    async (node: GraphNode) => {
      if (!editId) return;
      try {
        const res = await fetch(`/api/graph/nodes/${node.node_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...node, event_id: editId }),
        });
        if (res.ok) {
          const [nodesRes, edgesRes] = await Promise.all([
            fetch("/api/graph/nodes"),
            fetch("/api/graph/edges"),
          ]);
          if (nodesRes.ok) setGraphNodes(await nodesRes.json());
          if (edgesRes.ok) setGraphEdges(await edgesRes.json());
          await computeLogics();
        }
      } catch (e) {
        alert(e instanceof Error ? e.message : "内包への追加に失敗しました");
      }
    },
    [editId, computeLogics]
  );


  const openAdd = () => {
    const newId = `ev_${Date.now()}`;
    setForm({
      id: newId,
      title: "",
      content: "",
      time_range: { start: defaultTime(), end: defaultEnd() },
      location_ids: [],
      participants: [],
      logic_details: {},
    });
    setEditId(newId);
    setModal("add");
    isInitialMount.current = true;
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

  const openEdit = (e: EventForm) => {
    setForm({
      ...e,
      logic_details: e.logic_details ?? {},
    });
    setEditId(e.id);
    setModal("edit");
    isInitialMount.current = true;
  };

  const save = async () => {
    if (!editId) return;
    try {
      const raw = list.find((x) => x.id === editId) as EventForm & { payload?: Record<string, unknown> };
      const payload = { ...(raw?.payload ?? {}), logic_details: form.logic_details };
      const body = {
        ...form,
        time_range: form.time_range,
        payload,
      };
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
          <div className="modal" style={{ maxWidth: 600 }} onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal === "add" ? "イベント追加" : "イベント編集"}</h3>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>
                ×
              </button>
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

              {modal === "edit" && logics.length > 0 && (
                <div className="form-group">
                  <label>ロジックごとの詳細・内包事象</label>
                  {logics
                    .filter((logic) => {
                      const logicId = logic.logic_id;
                      const contained = containedByLogic.get(logicId) ?? [];
                      const addable = addableToEventByLogic.get(logicId) ?? [];
                      return contained.length > 0 || addable.length > 0 || !!(form.logic_details[logicId] ?? "");
                    })
                    .map((logic) => {
                      const logicId = logic.logic_id;
                      const contained = containedByLogic.get(logicId) ?? [];
                      const addable = addableToEventByLogic.get(logicId) ?? [];
                      return (
                    <div
                      key={logicId}
                      style={{
                        marginBottom: "1.25rem",
                        padding: "1rem",
                        border: "1px solid #30363d",
                        borderRadius: 8,
                        background: "#0d1117",
                      }}
                    >
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
                      <div style={{ marginTop: "0.5rem" }}>
                        <label style={{ fontSize: "0.85rem", color: "#8b949e" }}>詳細</label>
                        <textarea
                          className="form-control"
                          placeholder="このロジックでの説明を入力..."
                          value={form.logic_details[logicId] ?? ""}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              logic_details: { ...f.logic_details, [logicId]: e.target.value },
                            }))
                          }
                          rows={2}
                          style={{ marginTop: "0.25rem" }}
                        />
                      </div>
                      <div style={{ marginTop: "0.75rem" }}>
                        <label style={{ fontSize: "0.85rem", color: "#8b949e", display: "block", marginBottom: "0.35rem" }}>
                          内包事象
                        </label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
                          {contained.map((n) => (
                            <span
                              key={n.node_id}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                padding: "0.25rem 0.5rem",
                                background: "#21262d",
                                borderRadius: 6,
                                fontSize: "0.9rem",
                                border: "1px solid #30363d",
                              }}
                            >
                              {getNodeLabel(n)}
                              <button
                                type="button"
                                className="modal-close"
                                style={{ padding: "0.1rem", fontSize: "1rem", lineHeight: 1 }}
                                onClick={() => removeNodeFromEvent(n)}
                                title="内包から削除"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                        {addable.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                            {addable.map((n) => (
                              <button
                                key={n.node_id}
                                type="button"
                                className="btn-secondary"
                                style={{ padding: "0.25rem 0.5rem", fontSize: "0.9rem" }}
                                onClick={() => addNodeToEvent(n)}
                              >
                                + {getNodeLabel(n)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                      );
                    })}
                </div>
              )}
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
