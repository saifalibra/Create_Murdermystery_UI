import { useState, useEffect } from "react";

type TimeBlock = {
  block_id: string;
  time_range: { start: string; end: string };
  location_id: string;
  events?: string[];
};

type CharacterTimeline = {
  character_id: string;
  time_blocks: TimeBlock[];
};

export default function TimelineTab() {
  const [timelines, setTimelines] = useState<CharacterTimeline[]>([]);
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | null>(null);
  const [form, setForm] = useState({ character_id: "" });

  const fetchData = async () => {
    try {
      const [tlRes, charRes, locRes] = await Promise.all([
        fetch("/api/timeline"),
        fetch("/api/characters"),
        fetch("/api/locations"),
      ]);
      if (tlRes.ok) setTimelines(await tlRes.json());
      if (charRes.ok) {
        const d = await charRes.json();
        setCharacters(d.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      }
      if (locRes.ok) {
        const d = await locRes.json();
        setLocations(d.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
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
    setForm({ character_id: characters[0]?.id ?? "" });
    setModal("add");
  };

  const createTimeline = async () => {
    if (!form.character_id) return;
    try {
      const locId = locations[0]?.id;
      const start = "2025-01-01T00:00:00";
      const end = "2025-01-01T01:00:00";
      await fetch("/api/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character_id: form.character_id,
          time_blocks: locId
            ? [
                {
                  block_id: `tb_${Date.now()}`,
                  time_range: { start, end },
                  location_id: locId,
                  events: [],
                },
              ]
            : [],
        }),
      });
      await fetchData();
      setModal(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "作成に失敗しました");
    }
  };

  const charName = (cid: string) => characters.find((c) => c.id === cid)?.name ?? cid;
  const locName = (lid: string) => locations.find((l) => l.id === lid)?.name ?? lid;

  if (loading) return <div className="loading">読み込み中…</div>;

  return (
    <div>
      <div className="page-header">
        <h2>タイムライン</h2>
        <button
          type="button"
          className="btn-primary"
          onClick={openAdd}
          disabled={!characters.length}
        >
          タイムライン追加
        </button>
      </div>
      {!characters.length && (
        <p style={{ marginBottom: "1rem", color: "#8b949e" }}>
          タイムラインを追加するには、先にキャラクターを登録してください。
        </p>
      )}
      {timelines.length === 0 ? (
        <div className="empty-state">
          タイムラインがありません。「タイムライン追加」でキャラクターごとに作成してください。
        </div>
      ) : (
        <div className="contact-timeline">
          {timelines.map((tl) => (
            <div key={tl.character_id} className="contact-block">
              <div className="contact-block-time" style={{ fontWeight: 600 }}>
                {charName(tl.character_id)}（{tl.character_id}）
              </div>
              <div style={{ marginTop: "0.5rem" }}>
                {tl.time_blocks?.length
                  ? tl.time_blocks.map((b) => (
                      <div
                        key={b.block_id}
                        style={{
                          padding: "0.5rem",
                          marginBottom: "0.5rem",
                          background: "#21262d",
                          borderRadius: 6,
                          border: "1px solid #30363d",
                        }}
                      >
                        <span style={{ color: "#58a6ff" }}>
                          {b.time_range?.start ?? "—"} ～ {b.time_range?.end ?? "—"}
                        </span>
                        <span style={{ marginLeft: "0.5rem", color: "#8b949e" }}>
                          @ {locName(b.location_id)}
                        </span>
                      </div>
                    ))
                  : "（ブロックなし）"}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>タイムライン追加</h3>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
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
              {!locations.length && (
                <p style={{ color: "#8b949e", fontSize: "0.9rem" }}>
                  場所が未登録の場合は、初回ブロックなしで作成します。後から編集できます。
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>
                キャンセル
              </button>
              <button type="button" className="btn-primary" onClick={createTimeline}>
                作成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
