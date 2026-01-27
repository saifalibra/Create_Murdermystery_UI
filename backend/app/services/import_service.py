# -*- coding: utf-8 -*-
"""
Bluetooth接触ログの取り込み。
位置情報は無視。user / contacted_user がその時間一緒にいた log として扱う。
"""
import csv
import io
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from app.models import Character, CharacterRole


def _connected_components(edges: list[tuple[str, str]]) -> list[frozenset[str]]:
    """無向グラフの連結成分。transitive: A-B, B-C → A,B,C 同一グループ。"""
    adj: dict[str, set[str]] = defaultdict(set)
    all_ids: set[str] = set()
    for u, v in edges:
        all_ids.add(u)
        all_ids.add(v)
        adj[u].add(v)
        adj[v].add(u)

    visited: set[str] = set()
    components: list[frozenset[str]] = []

    def dfs(x: str) -> set[str]:
        stack = [x]
        comp: set[str] = set()
        while stack:
            n = stack.pop()
            if n in visited:
                continue
            visited.add(n)
            comp.add(n)
            for w in adj[n]:
                if w not in visited:
                    stack.append(w)
        return comp

    for uid in all_ids:
        if uid not in visited:
            components.append(frozenset(dfs(uid)))
    return components


def build_contact_timeline(
    contact_rows: list[dict[str, Any]],
    gap_minutes: float = 1.0,
    transitive_window_seconds: float = 10.0,
) -> list[dict[str, Any]]:
    """
    接触ログからタイムラインを構築。

    - ログが gap_minutes 以上空いたら非接触 → 新区間。マージはしない。
    - 同区間内で、連続する接触の「直後との差」が transitive_window_seconds 超なら
      そこでクラスタを分割。各クラスタ＝1ブロック。
    - 各ブロック内で、そのクラスタの edges のみを使って連結成分を1回だけ計算。
      → 連結成分は互いに素なので、**同一ブロック内で誰も複数グループに跨らない**。
    - transitive: クラスタ内では「隣接する接触同士」が高々10秒なので、
      A-B, B-C がともにクラスタ内にあれば A,B,C は同一グループ。

    返り値: [ { "start": iso, "end": iso, "groups": [ [id, ...], ... ] }, ... ]
    """
    if not contact_rows:
        return []

    sorted_rows: list[tuple[str, str, datetime]] = []
    for r in contact_rows:
        u = (r.get("user_id") or "").strip()
        v = (r.get("contacted_user_id") or "").strip()
        ts_str = r.get("timestamp") or ""
        if not u or not v or not ts_str:
            continue
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            sorted_rows.append((u, v, ts))
        except (ValueError, TypeError):
            continue

    if not sorted_rows:
        return []

    sorted_rows.sort(key=lambda x: x[2])
    gap_delta = timedelta(minutes=gap_minutes)
    window_delta = timedelta(seconds=transitive_window_seconds)

    # 1. gap_minutes ルールで「期間」に分割
    periods: list[tuple[datetime, datetime, list[tuple[str, str, datetime]]]] = []
    period_start: datetime | None = None
    period_end: datetime | None = None
    period_edges: list[tuple[str, str, datetime]] = []

    for u, v, ts in sorted_rows:
        if period_start is None:
            period_start = ts
            period_end = ts
            period_edges = [(u, v, ts)]
            continue
        if (ts - period_end) > gap_delta:
            if period_start is not None and period_end is not None:
                periods.append((period_start, period_end, period_edges))
            period_start = ts
            period_end = ts
            period_edges = [(u, v, ts)]
        else:
            period_end = ts
            period_edges.append((u, v, ts))

    if period_start is not None and period_end is not None:
        periods.append((period_start, period_end, period_edges))

    # 2. 各期間内で「連続差 ≤ 10秒」のクラスタに分割 → 1クラスタ = 1ブロック
    blocks: list[dict[str, Any]] = []
    for _start, _end, edges_with_ts in periods:
        edges_with_ts = sorted(edges_with_ts, key=lambda x: x[2])

        clusters: list[list[tuple[str, str, datetime]]] = []
        cluster: list[tuple[str, str, datetime]] = []
        last_ts: datetime | None = None

        for u, v, ts in edges_with_ts:
            if last_ts is None:
                cluster = [(u, v, ts)]
                last_ts = ts
                continue
            if (ts - last_ts) > window_delta:
                if cluster:
                    clusters.append(cluster)
                cluster = [(u, v, ts)]
                last_ts = ts
            else:
                cluster.append((u, v, ts))
                last_ts = ts

        if cluster:
            clusters.append(cluster)

        for cl in clusters:
            if not cl:
                continue
            edges_only = [(u, v) for u, v, _ in cl]
            comps = _connected_components(edges_only)
            gs = sorted(comps, key=lambda x: -len(x))
            block_start = cl[0][2]
            block_end = cl[-1][2]
            blocks.append({
                "start": block_start.isoformat(),
                "end": block_end.isoformat(),
                "groups": [list(g) for g in gs],
            })

    return blocks


def _row_val(row: dict, *keys: str) -> str:
    """キー名のゆらぎ（BOM・空白など）に備え、候補のいずれかで値を取得。"""
    for k in keys:
        v = row.get(k)
        if v is not None:
            return (v or "").strip()
    for k in row:
        if k.strip().lower() in {x.lower() for x in keys}:
            return (row[k] or "").strip()
    return ""


def parse_bt_contacts_csv(content: str | bytes) -> dict[str, Any]:
    """
    位置情報は無視。
    user / contacted_user がその時間一緒にいた log として扱う。
    返り値: {
        "characters": [Character, ...],
        "contact_timeline": [ { start, end, groups: [[id,...], ...] }, ... ],
        "contact_rows": [ { user_id, contacted_user_id, timestamp }, ... ]
    }
    """
    if isinstance(content, bytes):
        text = content.decode("utf-8")
    else:
        text = content
    if text.startswith("\ufeff"):
        text = text[1:]

    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)

    characters_map: dict[str, Character] = {}
    contact_rows: list[dict[str, Any]] = []

    for row in rows:
        user_id = _row_val(row, "user_id")
        user_name = _row_val(row, "user_id_display_name") or user_id
        contacted_id = _row_val(row, "contacted_user_id")
        contacted_name = _row_val(row, "contacted_user_id_display_name") or contacted_id
        ts = _row_val(row, "timestamp")
        is_contacted_val = _row_val(row, "is_contacted")

        if user_id and user_id not in characters_map:
            characters_map[user_id] = Character(id=user_id, name=user_name, role=CharacterRole.player)
        if contacted_id and contacted_id not in characters_map:
            characters_map[contacted_id] = Character(id=contacted_id, name=contacted_name, role=CharacterRole.player)

        if not user_id or not contacted_id or not ts:
            continue
        if is_contacted_val.lower() not in ("true", "1", "yes"):
            continue
        contact_rows.append({"user_id": user_id, "contacted_user_id": contacted_id, "timestamp": ts})

    print(f"[DEBUG] Total rows: {len(rows)}, Contact rows (is_contacted=True): {len(contact_rows)}")
    
    # 空き時間がこの分数以上なら新区間。1分にするとこのCSVは1枠のままなので 0.5（30秒）で分割。
    contact_timeline = build_contact_timeline(contact_rows, gap_minutes=0.5)
    
    print(f"[DEBUG] Contact timeline blocks: {len(contact_timeline)}")

    return {
        "characters": list(characters_map.values()),
        "contact_timeline": contact_timeline,
        "contact_rows": contact_rows,
    }


def parse_gps_log(content: str | bytes) -> list[dict[str, Any]]:
    """GPSログをパース。場所・時間範囲を返す。"""
    return []
