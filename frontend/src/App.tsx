import { useState, useEffect } from "react";
import "./App.css";
import GraphTab from "./GraphTab";
import CharactersTab from "./CharactersTab";
import LocationsTab from "./LocationsTab";
import TimelineTab from "./TimelineTab";
import EventsTab from "./EventsTab";
import EvidenceTab from "./EvidenceTab";
import SecretsTab from "./SecretsTab";
import SettingsTab from "./SettingsTab";
import type { Logic } from "./types";

export type EmptyEventInstance = { eventId: string; logicId: string; instanceId: string };

const TABS = [
  { id: "dashboard", label: "ダッシュボード" },
  { id: "graph", label: "グラフ" },
  { id: "characters", label: "キャラクター" },
  { id: "locations", label: "場所" },
  { id: "timeline", label: "タイムライン" },
  { id: "events", label: "イベント" },
  { id: "evidence", label: "証拠" },
  { id: "secrets", label: "秘密" },
  { id: "settings", label: "設定" },
] as const;

function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [logics, setLogics] = useState<Logic[]>([]);
  const [backendStatus, setBackendStatus] = useState<"online" | "offline">("offline");
  /** グラフから削除したイベントID（タブ切替・リロードで保持するため App で管理、sessionStorage に永続化） */
  const [removedEventIdsFromGraph, setRemovedEventIdsFromGraph] = useState<string[]>(() => {
    try {
      const s = sessionStorage.getItem("mm-removed-event-ids");
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });

  /** 空イベントインスタンス（オーファン・別ロジック追加。タブ切替・リロードで保持するため App で管理、sessionStorage に永続化） */
  const [emptyEventInstances, setEmptyEventInstances] = useState<EmptyEventInstance[]>(() => {
    try {
      const s = sessionStorage.getItem("mm-empty-event-instances");
      if (!s) return [];
      const parsed = JSON.parse(s) as unknown;
      return Array.isArray(parsed)
        ? (parsed as EmptyEventInstance[]).filter(
            (p): p is EmptyEventInstance =>
              p != null &&
              typeof p.eventId === "string" &&
              typeof p.logicId === "string" &&
              typeof p.instanceId === "string"
          )
        : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem("mm-removed-event-ids", JSON.stringify(removedEventIdsFromGraph));
    } catch {
      /* ignore */
    }
  }, [removedEventIdsFromGraph]);

  useEffect(() => {
    try {
      sessionStorage.setItem("mm-empty-event-instances", JSON.stringify(emptyEventInstances));
    } catch {
      /* ignore */
    }
  }, [emptyEventInstances]);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch("/api/health");
        if (res.ok) {
          setBackendStatus("online");
        } else {
          setBackendStatus("offline");
        }
      } catch {
        setBackendStatus("offline");
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchLogics = async () => {
    try {
      const res = await fetch("/api/graph/logics");
      if (res.ok) {
        const data = await res.json();
        setLogics(data);
      }
    } catch (err) {
      console.error("Failed to fetch logics:", err);
    }
  };

  useEffect(() => {
    if (activeTab === "graph") {
      fetchLogics();
    }
  }, [activeTab]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-title">
          マーダーミステリー
          <br />
          シナリオ生成
        </div>
        <nav className="sidebar-nav">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={activeTab === id ? "active" : ""}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className={`status ${backendStatus}`}>
            {backendStatus === "online" ? "● オンライン" : "● オフライン"}
          </div>
        </div>
      </aside>
      <main className="main-content">
        {activeTab === "dashboard" && (
          <div>
            <h2>ダッシュボード</h2>
            <p>ダッシュボードの実装は今後追加予定です。</p>
          </div>
        )}
        {activeTab === "graph" && (
          <GraphTab
            logics={logics}
            onLogicsChange={setLogics}
            removedEventIdsFromGraph={removedEventIdsFromGraph}
            setRemovedEventIdsFromGraph={setRemovedEventIdsFromGraph}
            emptyEventInstances={emptyEventInstances}
            setEmptyEventInstances={setEmptyEventInstances}
          />
        )}
        {activeTab === "characters" && <CharactersTab />}
        {activeTab === "locations" && <LocationsTab />}
        {activeTab === "timeline" && <TimelineTab />}
        {activeTab === "events" && <EventsTab />}
        {activeTab === "evidence" && <EvidenceTab />}
        {activeTab === "secrets" && <SecretsTab />}
        {activeTab === "settings" && <SettingsTab />}
      </main>
    </div>
  );
}

export default App;
