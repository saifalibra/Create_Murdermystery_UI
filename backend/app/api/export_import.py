# -*- coding: utf-8 -*-
"""
作成データの一括エクスポート／インポート用 API。
GET /api/export/json で全データを JSON 出力、POST /api/import/json で上書き復元。
"""
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.api import characters as characters_api
from app.api import events as events_api
from app.api import evidence as evidence_api
from app.api import graph as graph_api
from app.api import locations as locations_api
from app.api import scenarios as scenarios_api
from app.api import secrets as secrets_api
from app.api import timeline as timeline_api
from app.models import (
    Character,
    CharacterTimeline,
    Event,
    EvidenceItem,
    GraphEdge,
    GraphNode,
    Logic,
    Location,
    ScenarioConfig,
    Secret,
)

router = APIRouter()


def _dump(obj: Any) -> Any:
    """Pydantic model -> JSON-serializable dict (datetime -> ISO string)."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump(mode="json")
    return obj


@router.get("/export/json")
def export_json() -> dict[str, Any]:
    """全データを 1 つの JSON にまとめて返す。"""
    scenarios = [
        {"id": sid, "config": _dump(cfg)}
        for sid, cfg in scenarios_api._scenarios.items()
    ]
    payload: dict[str, Any] = {
        "version": 1,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "characters": [_dump(c) for c in characters_api._characters.values()],
        "locations": [_dump(l) for l in locations_api._locations.values()],
        "events": [_dump(e) for e in events_api._events.values()],
        "evidence": [_dump(e) for e in evidence_api._evidence.values()],
        "secrets": [_dump(s) for s in secrets_api._secrets.values()],
        "graph": {
            "nodes": [_dump(n) for n in graph_api._nodes.values()],
            "edges": [_dump(e) for e in graph_api._edges.values()],
            "logics": [_dump(l) for l in graph_api._logics.values()],
        },
        "timelines": [_dump(t) for t in timeline_api._timelines.values()],
        "scenarios": scenarios,
    }
    return payload


@router.post("/import/json")
async def import_json(request: Request) -> dict[str, Any]:
    """JSON を受け取り、既存をクリアしてから復元。上書き置換。"""
    try:
        body = await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}") from e
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")

    def arr(key: str) -> list[Any]:
        v = body.get(key)
        if v is None:
            return []
        if not isinstance(v, list):
            raise HTTPException(status_code=400, detail=f"'{key}' must be an array")
        return v

    summary: dict[str, int] = {}

    def load_characters() -> None:
        characters_api._characters.clear()
        for raw in arr("characters"):
            c = Character.model_validate(raw)
            characters_api._characters[c.id] = c
        summary["characters"] = len(characters_api._characters)

    def load_locations() -> None:
        locations_api._locations.clear()
        for raw in arr("locations"):
            loc = Location.model_validate(raw)
            locations_api._locations[loc.id] = loc
        summary["locations"] = len(locations_api._locations)

    def load_events() -> None:
        events_api._events.clear()
        for raw in arr("events"):
            ev = Event.model_validate(raw)
            events_api._events[ev.id] = ev
        summary["events"] = len(events_api._events)

    def load_evidence() -> None:
        evidence_api._evidence.clear()
        for raw in arr("evidence"):
            e = EvidenceItem.model_validate(raw)
            evidence_api._evidence[e.id] = e
        summary["evidence"] = len(evidence_api._evidence)

    def load_secrets() -> None:
        secrets_api._secrets.clear()
        for raw in arr("secrets"):
            s = Secret.model_validate(raw)
            secrets_api._secrets[s.id] = s
        summary["secrets"] = len(secrets_api._secrets)

    def load_graph() -> None:
        graph_api._nodes.clear()
        graph_api._edges.clear()
        graph_api._logics.clear()
        g = body.get("graph")
        if g is None or not isinstance(g, dict):
            summary["graph_nodes"] = 0
            summary["graph_edges"] = 0
            summary["graph_logics"] = 0
            return
        nodes_raw = g.get("nodes")
        edges_raw = g.get("edges")
        logics_raw = g.get("logics")
        if isinstance(nodes_raw, list):
            for raw in nodes_raw:
                n = GraphNode.model_validate(raw)
                graph_api._nodes[n.node_id] = n
        if isinstance(edges_raw, list):
            for raw in edges_raw:
                e = GraphEdge.model_validate(raw)
                graph_api._edges[e.edge_id] = e
        if isinstance(logics_raw, list):
            for raw in logics_raw:
                l = Logic.model_validate(raw)
                graph_api._logics[l.logic_id] = l
        summary["graph_nodes"] = len(graph_api._nodes)
        summary["graph_edges"] = len(graph_api._edges)
        summary["graph_logics"] = len(graph_api._logics)

    def load_timelines() -> None:
        timeline_api._timelines.clear()
        for raw in arr("timelines"):
            t = CharacterTimeline.model_validate(raw)
            timeline_api._timelines[t.character_id] = t
        summary["timelines"] = len(timeline_api._timelines)

    def load_scenarios() -> None:
        scenarios_api._scenarios.clear()
        for raw in arr("scenarios"):
            if not isinstance(raw, dict):
                raise HTTPException(status_code=400, detail="Each scenario must be { id, config }")
            sid = raw.get("id")
            cfg = raw.get("config")
            if not sid or not isinstance(cfg, dict):
                raise HTTPException(status_code=400, detail="Scenario must have 'id' and 'config'")
            sc = ScenarioConfig.model_validate(cfg)
            scenarios_api._scenarios[sid] = sc
        summary["scenarios"] = len(scenarios_api._scenarios)

    try:
        load_characters()
        load_locations()
        load_events()
        load_evidence()
        load_secrets()
        load_graph()
        load_timelines()
        load_scenarios()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Import validation failed: {e}") from e

    return {"ok": True, "summary": summary}
