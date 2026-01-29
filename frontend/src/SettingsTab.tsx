import { useRef, useState, useEffect } from "react";

type ValidationResult = { valid: boolean; errors: string[]; warnings: string[] };

export default function SettingsTab() {
  const [scenarios, setScenarios] = useState<{ world?: string; incident_type?: string; tone?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState<{
    timeline?: ValidationResult;
    graph?: ValidationResult;
    culprit?: ValidationResult;
  }>({});
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ world: "現代日本", incident_type: "殺人", tone: "ミステリー" });
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchScenarios = async () => {
    try {
      const res = await fetch("/api/scenarios");
      if (res.ok) {
        const data = await res.json();
        setScenarios(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScenarios();
  }, []);

  const runValidation = async (kind: "timeline" | "graph" | "culprit") => {
    try {
      const res = await fetch(`/api/validation/${kind}`, { method: "POST" });
      const data: ValidationResult = await res.json();
      setValidation((v) => ({ ...v, [kind]: data }));
    } catch (e) {
      setValidation((v) => ({
        ...v,
        [kind]: {
          valid: false,
          errors: [e instanceof Error ? e.message : "検証に失敗しました"],
          warnings: [],
        },
      }));
    }
  };

  const createScenario = async () => {
    try {
      await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, taboos: [] }),
      });
      await fetchScenarios();
      setAddOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "作成に失敗しました");
    }
  };

  const exportJson = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/export/json");
      if (!res.ok) throw new Error(`エクスポート失敗: ${res.status}`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mm-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "JSONの書き出しに失敗しました");
    } finally {
      setExporting(false);
    }
  };

  const importJson = async (file: File) => {
    setImporting(true);
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
        r.readAsText(file, "utf-8");
      });
      const parsed = JSON.parse(text) as unknown;
      if (parsed === null || typeof parsed !== "object") throw new Error("無効なJSONです");
      const res = await fetch("/api/import/json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = (await res.json()) as { ok?: boolean; detail?: string; summary?: Record<string, number> };
      if (!res.ok) throw new Error(data.detail ?? `読み込み失敗: ${res.status}`);
      alert("読み込みました。");
      await fetchScenarios();
    } catch (e) {
      alert(e instanceof Error ? e.message : "JSONの読み込みに失敗しました");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!confirm("現在のデータはすべて上書きされます。よろしいですか？")) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    importJson(f);
  };

  return (
    <div>
      <h2>設定</h2>

      <section style={{ marginBottom: "2rem" }}>
        <h3>整合性チェック</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
          <button type="button" className="btn-primary" onClick={() => runValidation("timeline")}>
            タイムライン整合性
          </button>
          <button type="button" className="btn-primary" onClick={() => runValidation("graph")}>
            グラフ整合性
          </button>
          <button type="button" className="btn-primary" onClick={() => runValidation("culprit")}>
            犯人決定可能性
          </button>
        </div>
        {(validation.timeline || validation.graph || validation.culprit) && (
          <div className="form-card" style={{ marginTop: "1rem" }}>
            {validation.timeline && (
              <div style={{ marginBottom: "1rem" }}>
                <strong>タイムライン:</strong>{" "}
                <span style={{ color: validation.timeline.valid ? "#7ee787" : "#f85149" }}>
                  {validation.timeline.valid ? "OK" : "NG"}
                </span>
                {validation.timeline.errors?.length ? (
                  <ul style={{ marginTop: "0.5rem", color: "#f85149" }}>
                    {validation.timeline.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                ) : null}
                {validation.timeline.warnings?.length ? (
                  <ul style={{ marginTop: "0.5rem", color: "#d29922" }}>
                    {validation.timeline.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
            {validation.graph && (
              <div style={{ marginBottom: "1rem" }}>
                <strong>グラフ:</strong>{" "}
                <span style={{ color: validation.graph.valid ? "#7ee787" : "#f85149" }}>
                  {validation.graph.valid ? "OK" : "NG"}
                </span>
                {validation.graph.errors?.length ? (
                  <ul style={{ marginTop: "0.5rem", color: "#f85149" }}>
                    {validation.graph.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
            {validation.culprit && (
              <div>
                <strong>犯人決定:</strong>{" "}
                <span style={{ color: validation.culprit.valid ? "#7ee787" : "#f85149" }}>
                  {validation.culprit.valid ? "OK" : "NG"}
                </span>
                {validation.culprit.errors?.length ? (
                  <ul style={{ marginTop: "0.5rem", color: "#f85149" }}>
                    {validation.culprit.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </div>
        )}
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h3>データの書き出し・読み込み</h3>
        <div className="form-card" style={{ marginTop: "1rem" }}>
          <p style={{ marginBottom: "1rem", color: "var(--text-secondary, #666)" }}>
            作成したキャラ・場所・イベント・証拠・秘密・グラフ・タイムライン・シナリオを JSON で保存したり、読み込んだりできます。読み込み時は現在のデータをすべて上書きします。
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn-primary"
              onClick={exportJson}
              disabled={exporting}
            >
              {exporting ? "書き出し中…" : "JSONに書きだす"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={onImportFileChange}
            />
            <button
              type="button"
              className="btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? "読み込み中…" : "JSONから読み込む"}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h3>シナリオ設定</h3>
        {loading ? (
          <div className="loading">読み込み中…</div>
        ) : (
          <>
            <div style={{ marginBottom: "1rem" }}>
              <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>
                シナリオ追加
              </button>
            </div>
            {scenarios.length === 0 ? (
              <div className="empty-state">シナリオがありません。</div>
            ) : (
              <div className="unified-card-grid">
                {scenarios.map((s, i) => (
                  <div key={i} className="unified-card">
                    <div className="location-name">
                      {s.world ?? "—"} / {s.incident_type ?? "—"}
                    </div>
                    <div className="location-type">{s.tone ?? "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {addOpen && (
        <div className="modal-overlay" onClick={() => setAddOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>シナリオ追加</h3>
              <button type="button" className="modal-close" onClick={() => setAddOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>世界観</label>
                <input
                  className="form-control"
                  value={form.world}
                  onChange={(e) => setForm((f) => ({ ...f, world: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>事件タイプ</label>
                <input
                  className="form-control"
                  value={form.incident_type}
                  onChange={(e) => setForm((f) => ({ ...f, incident_type: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>トーン</label>
                <input
                  className="form-control"
                  value={form.tone}
                  onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setAddOpen(false)}>
                キャンセル
              </button>
              <button type="button" className="btn-primary" onClick={createScenario}>
                作成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
