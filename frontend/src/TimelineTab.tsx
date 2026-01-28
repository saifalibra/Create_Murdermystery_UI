import { useState, useEffect, useRef, useCallback } from "react";

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

type Event = {
  id: string;
  title: string;
  content?: string;
  time_range: { start: string; end: string };
  location_ids: string[];
  participants?: string[];
};

type GridCell = {
  locationId: string;
  timeSlot: string;
};

const TIME_SLOTS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    TIME_SLOTS.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
  }
}

function TimelineEventEditModal({
  event,
  locations,
  characters,
  onClose,
  onSaved,
}: {
  event: Event;
  locations: { id: string; name: string }[];
  characters: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [content, setContent] = useState(event.content ?? "");
  const [start, setStart] = useState((event.time_range?.start ?? "").slice(0, 16));
  const [end, setEnd] = useState((event.time_range?.end ?? "").slice(0, 16));
  const [locationIds, setLocationIds] = useState<string[]>(event.location_ids ?? []);
  const [participants, setParticipants] = useState<string[]>(event.participants ?? []);

  const setEventLocation = (locId: string | null) => {
    setLocationIds(locId ? [locId] : []);
  };
  const togglePart = (id: string) => {
    setParticipants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const save = async () => {
    try {
      await fetch(`/api/events/${event.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...event,
          title,
          content,
          time_range: {
            start: start ? `${start}:00` : event.time_range.start,
            end: end ? `${end}:00` : event.time_range.end,
          },
          location_ids: locationIds,
          participants,
        }),
      });
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>イベント編集</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>タイトル</label>
            <input className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="form-group">
            <label>内容</label>
            <textarea className="form-control" value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>開始</label>
              <input
                type="datetime-local"
                className="form-control"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>終了</label>
              <input
                type="datetime-local"
                className="form-control"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label>場所（1つのみ）</label>
            <div className="checkbox-group" style={{ flexDirection: "column", alignItems: "flex-start" }}>
              <label className="checkbox-label">
                <input
                  type="radio"
                  name="timeline-event-location"
                  checked={locationIds.length === 0}
                  onChange={() => setEventLocation(null)}
                />
                未設定
              </label>
              {locations.map((loc) => (
                <label key={loc.id} className="checkbox-label">
                  <input
                    type="radio"
                    name="timeline-event-location"
                    checked={locationIds[0] === loc.id}
                    onChange={() => setEventLocation(loc.id)}
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
                  <input type="checkbox" checked={participants.includes(c.id)} onChange={() => togglePart(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>キャンセル</button>
          <button type="button" className="btn-primary" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  );
}

export default function TimelineTab() {
  const [, setTimelines] = useState<CharacterTimeline[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<GridCell | null>(null);
  const [eventModal, setEventModal] = useState<{ isOpen: boolean; cells: GridCell[] }>({
    isOpen: false,
    cells: [],
  });
  const [createTitle, setCreateTitle] = useState("");
  const [createContent, setCreateContent] = useState("");
  const [createParticipants, setCreateParticipants] = useState<string[]>([]);
  const [editEvent, setEditEvent] = useState<Event | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      const [tlRes, evRes, charRes, locRes] = await Promise.all([
        fetch("/api/timeline"),
        fetch("/api/events"),
        fetch("/api/characters"),
        fetch("/api/locations"),
      ]);
      if (tlRes.ok) setTimelines(await tlRes.json());
      if (evRes.ok) setEvents(await evRes.json());
      if (charRes.ok) {
        const d = await charRes.json();
        setCharacters(d.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
        if (d.length > 0 && !selectedCharacter) {
          setSelectedCharacter(d[0].id);
        }
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

  const getCellKey = (locationId: string, timeSlot: string) => `${locationId}:${timeSlot}`;

  const parseCellKey = (key: string): GridCell => {
    const i = key.indexOf(":");
    if (i < 0) return { locationId: "", timeSlot: "" };
    return { locationId: key.slice(0, i), timeSlot: key.slice(i + 1) };
  };

  const getCellFromEvent = (event: Event): GridCell[] => {
    const cells: GridCell[] = [];
    const start = new Date(event.time_range.start);
    const end = new Date(event.time_range.end);
    event.location_ids.forEach((locId) => {
      TIME_SLOTS.forEach((slot) => {
        const [h, m] = slot.split(":").map(Number);
        const slotTime = new Date(start);
        slotTime.setHours(h, m, 0, 0);
        if (slotTime >= start && slotTime < end) {
          cells.push({ locationId: locId, timeSlot: slot });
        }
      });
    });
    return cells;
  };

  const handleMouseDown = (locationId: string, timeSlot: string) => {
    setIsDragging(true);
    setDragStart({ locationId, timeSlot });
    setSelectedCells(new Set([getCellKey(locationId, timeSlot)]));
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragStart || !gridRef.current) return;
      const rect = gridRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const scrollTop = gridRef.current.scrollTop || 0;

      const cellWidth = rect.width / (locations.length + 1);
      const cellHeight = 40;
      const headerHeight = 40;

      const locationIndex = Math.floor(x / cellWidth) - 1;
      const timeIndex = Math.floor((y + scrollTop - headerHeight) / cellHeight);

      if (locationIndex >= 0 && locationIndex < locations.length && timeIndex >= 0 && timeIndex < TIME_SLOTS.length) {
        const startLocIdx = locations.findIndex((l) => l.id === dragStart.locationId);
        const startTimeIdx = TIME_SLOTS.indexOf(dragStart.timeSlot);
        const endLocIdx = locationIndex;
        const endTimeIdx = timeIndex;

        const minLocIdx = Math.min(startLocIdx, endLocIdx);
        const maxLocIdx = Math.max(startLocIdx, endLocIdx);
        const minTimeIdx = Math.min(startTimeIdx, endTimeIdx);
        const maxTimeIdx = Math.max(startTimeIdx, endTimeIdx);

        const newSelected = new Set<string>();
        for (let locIdx = minLocIdx; locIdx <= maxLocIdx; locIdx++) {
          for (let timeIdx = minTimeIdx; timeIdx <= maxTimeIdx; timeIdx++) {
            newSelected.add(getCellKey(locations[locIdx].id, TIME_SLOTS[timeIdx]));
          }
        }
        setSelectedCells(newSelected);
      }
    },
    [isDragging, dragStart, locations]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging && selectedCells.size > 0) {
      const cells = Array.from(selectedCells).map(parseCellKey);
      setEventModal({ isOpen: true, cells });
      setCreateTitle("");
      setCreateContent("");
      setCreateParticipants([]);
    }
    setIsDragging(false);
    setDragStart(null);
  }, [isDragging, selectedCells]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const createEventFromCells = async (title: string, content: string, participants: string[]) => {
    if (eventModal.cells.length === 0) return;

    const locationIds = Array.from(new Set(eventModal.cells.map((c) => c.locationId)));
    const timeSlots = [...new Set(eventModal.cells.map((c) => c.timeSlot))].sort();
    const startSlot = timeSlots[0];
    const endSlot = timeSlots[timeSlots.length - 1];

    const [startH, startM] = startSlot.split(":").map(Number);
    const [endH, endM] = endSlot.split(":").map(Number);
    const endMinutes = endH * 60 + endM + 30;
    const endH2 = Math.floor(endMinutes / 60) % 24;
    const endM2 = endMinutes % 60;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setHours(startH, startM, 0, 0);
    const end = new Date(today);
    end.setHours(endH2, endM2, 0, 0);

    try {
      const eventId = `ev_${Date.now()}`;
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eventId,
          title,
          content,
          time_range: { start: start.toISOString(), end: end.toISOString() },
          location_ids: locationIds,
          participants,
        }),
      });
      await fetchData();
      setEventModal({ isOpen: false, cells: [] });
      setSelectedCells(new Set());
      setCreateTitle("");
      setCreateContent("");
      setCreateParticipants([]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "イベント作成に失敗しました");
    }
  };

  const getEventsInCell = (locationId: string, timeSlot: string): Event[] => {
    return events.filter((ev) => {
      const cellKey = getCellKey(locationId, timeSlot);
      return getCellFromEvent(ev).some((c) => getCellKey(c.locationId, c.timeSlot) === cellKey);
    });
  };

  // イベントごとに、各場所での時間範囲を計算
  const getEventRanges = (event: Event): Map<string, { startSlot: string; endSlot: string }> => {
    const ranges = new Map<string, { startSlot: string; endSlot: string }>();
    const start = new Date(event.time_range.start);
    const end = new Date(event.time_range.end);
    
    event.location_ids.forEach((locId) => {
      const slots: string[] = [];
      TIME_SLOTS.forEach((slot) => {
        const [h, m] = slot.split(":").map(Number);
        const slotTime = new Date(start);
        slotTime.setHours(h, m, 0, 0);
        if (slotTime >= start && slotTime < end) {
          slots.push(slot);
        }
      });
      if (slots.length > 0) {
        ranges.set(locId, { startSlot: slots[0], endSlot: slots[slots.length - 1] });
      }
    });
    return ranges;
  };

  // セルがイベントの開始セルかどうか（rowspanの開始位置）
  const isEventStartCell = (event: Event, locationId: string, timeSlot: string): boolean => {
    const ranges = getEventRanges(event);
    const range = ranges.get(locationId);
    if (!range) return false;
    return range.startSlot === timeSlot;
  };

  // イベントのrowspanを計算（同じ場所での時間スロット数）
  const getEventRowspan = (event: Event, locationId: string): number => {
    const ranges = getEventRanges(event);
    const range = ranges.get(locationId);
    if (!range) return 1;
    const startIdx = TIME_SLOTS.indexOf(range.startSlot);
    const endIdx = TIME_SLOTS.indexOf(range.endSlot);
    return endIdx - startIdx + 1;
  };

  // セルがrowspanで覆われているかどうか（他のイベントのrowspanで覆われている）
  const isCellCoveredByRowspan = (locationId: string, timeSlot: string): boolean => {
    for (const ev of events) {
      if (!ev.location_ids.includes(locationId)) continue;
      // このセルがイベントの開始セルでない場合のみチェック
      if (isEventStartCell(ev, locationId, timeSlot)) continue;
      const ranges = getEventRanges(ev);
      const range = ranges.get(locationId);
      if (!range) continue;
      const startIdx = TIME_SLOTS.indexOf(range.startSlot);
      const endIdx = TIME_SLOTS.indexOf(range.endSlot);
      const currentIdx = TIME_SLOTS.indexOf(timeSlot);
      // 開始セルより後で、終了セル以前の場合、rowspanで覆われている
      if (currentIdx > startIdx && currentIdx <= endIdx) {
        return true;
      }
    }
    return false;
  };

  const locName = (lid: string) => locations.find((l) => l.id === lid)?.name ?? lid;

  if (loading) return <div className="loading">読み込み中…</div>;

  if (!characters.length) {
    return (
      <div>
        <h2>タイムライン</h2>
        <p style={{ color: "#8b949e" }}>タイムラインを表示するには、先にキャラクターを登録してください。</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>タイムライン</h2>
        <div>
          <label style={{ marginRight: "0.5rem", color: "#c9d1d9" }}>キャラクター:</label>
          <select
            className="form-control"
            style={{ display: "inline-block", width: "auto", minWidth: "200px" }}
            value={selectedCharacter || ""}
            onChange={(e) => setSelectedCharacter(e.target.value)}
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!locations.length ? (
        <div className="empty-state">場所を登録すると、タイムライングリッドが表示されます。</div>
      ) : (
        <div
          ref={gridRef}
          style={{
            overflow: "auto",
            border: "1px solid #30363d",
            borderRadius: 8,
            background: "#0d1117",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "800px" }}>
            <thead>
              <tr>
                <th
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 10,
                    background: "#21262d",
                    padding: "0.5rem",
                    border: "1px solid #30363d",
                    minWidth: "100px",
                  }}
                >
                  時間
                </th>
                {locations.map((loc) => (
                  <th
                    key={loc.id}
                    style={{
                      padding: "0.5rem",
                      border: "1px solid #30363d",
                      background: "#21262d",
                      minWidth: "120px",
                    }}
                  >
                    {loc.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((timeSlot) => (
                <tr key={timeSlot}>
                  <td
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 9,
                      background: "#161b22",
                      padding: "0.5rem",
                      border: "1px solid #30363d",
                      fontFamily: "ui-monospace, monospace",
                      fontSize: "0.9rem",
                      color: "#58a6ff",
                    }}
                  >
                    {timeSlot}
                  </td>
                  {locations.map((loc) => {
                    const cellKey = getCellKey(loc.id, timeSlot);
                    const isSelected = selectedCells.has(cellKey);
                    const cellEvents = getEventsInCell(loc.id, timeSlot);
                    const isCovered = isCellCoveredByRowspan(loc.id, timeSlot);
                    // このセルが開始セルであるイベントのみ表示（rowspanで結合）
                    const startEvents = cellEvents.filter((ev) => isEventStartCell(ev, loc.id, timeSlot));
                    
                    // rowspanで覆われているセルは空にする（rowspanで結合されているため）
                    if (isCovered) {
                      return (
                        <td
                          key={loc.id}
                          style={{
                            padding: 0,
                            border: "1px solid #30363d",
                            background: isSelected ? "#1f6feb40" : "#0d1117",
                            height: "40px",
                          }}
                        />
                      );
                    }
                    
                    return (
                      <td
                        key={loc.id}
                        style={{
                          padding: 0,
                          border: "1px solid #30363d",
                          background: isSelected ? "#1f6feb40" : "#0d1117",
                          height: "40px",
                          cursor: "pointer",
                          position: "relative",
                          verticalAlign: "top",
                        }}
                        onMouseDown={() => handleMouseDown(loc.id, timeSlot)}
                        rowSpan={startEvents.length > 0 ? getEventRowspan(startEvents[0], loc.id) : undefined}
                      >
                        {startEvents.map((ev) => {
                          const rowspan = getEventRowspan(ev, loc.id);
                          return (
                            <div
                              key={ev.id}
                              role="button"
                              tabIndex={0}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditEvent(ev);
                              }}
                              onKeyDown={(e) => e.key === "Enter" && setEditEvent(ev)}
                              style={{
                                background: "#1f6feb",
                                color: "#fff",
                                padding: "0.25rem 0.5rem",
                                fontSize: "0.85rem",
                                borderRadius: 4,
                                margin: "0.1rem",
                                cursor: "pointer",
                                minHeight: `${rowspan * 40 - 4}px`,
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                              }}
                              title={ev.title}
                            >
                              {ev.title || "(無題)"}
                            </div>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {eventModal.isOpen && (
        <div className="modal-overlay" onClick={() => setEventModal({ isOpen: false, cells: [] })}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>イベント作成</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setEventModal({ isOpen: false, cells: [] })}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>タイトル</label>
                <input
                  className="form-control"
                  placeholder="イベントタイトル"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>内容</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="イベント内容"
                  value={createContent}
                  onChange={(e) => setCreateContent(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>参加者（複数可）</label>
                <div className="checkbox-group">
                  {characters.map((c) => (
                    <label key={c.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={createParticipants.includes(c.id)}
                        onChange={() =>
                          setCreateParticipants((prev) =>
                            prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                          )
                        }
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: "1rem", padding: "0.5rem", background: "#21262d", borderRadius: 6 }}>
                <div style={{ fontSize: "0.9rem", color: "#8b949e", marginBottom: "0.5rem" }}>選択範囲:</div>
                <div style={{ fontSize: "0.85rem", color: "#c9d1d9" }}>
                  場所: {Array.from(new Set(eventModal.cells.map((c) => locName(c.locationId)))).join(", ")}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#c9d1d9" }}>
                  時間: {eventModal.cells[0]?.timeSlot} ～ {eventModal.cells[eventModal.cells.length - 1]?.timeSlot}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEventModal({ isOpen: false, cells: [] })}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() =>
                  createEventFromCells(
                    createTitle || "(無題)",
                    createContent,
                    createParticipants
                  )
                }
              >
                作成
              </button>
            </div>
          </div>
        </div>
      )}

      {editEvent && (
        <TimelineEventEditModal
          event={editEvent}
          locations={locations}
          characters={characters}
          onClose={() => setEditEvent(null)}
          onSaved={async () => {
            await fetchData();
            setEditEvent(null);
          }}
        />
      )}
    </div>
  );
}
