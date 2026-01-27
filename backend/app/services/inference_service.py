# -*- coding: utf-8 -*-
"""
犯人推論: alone_minutes_total, murder_window_accessible, suspect_score 等を計算。
"""
from app.models import CharacterTimeline, Character, Event


def compute_derived(timeline: CharacterTimeline, victim_id: str, murder_window: tuple[str, str]) -> dict:
    """CharacterTimeline.derived を計算。"""
    return {
        "alone_minutes_total": 0.0,
        "victim_contact_blocks": [],
        "witness_density_score": 0.0,
        "movement_feasibility_score": 0.0,
        "murder_window_accessible": False,
        "suspect_score_total": 0.0,
    }


def rank_suspects(
    characters: list[Character],
    timelines: dict[str, CharacterTimeline],
    victim_id: str,
) -> list[tuple[str, float]]:
    """疑わしさスコアでソートした (character_id, score) のリスト。"""
    return []
