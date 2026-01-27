# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException

from app.models import CharacterTimeline, TimeBlock

router = APIRouter()
_timelines: dict[str, CharacterTimeline] = {}


@router.get("")
def list_timelines():
    return list(_timelines.values())


@router.get("/{character_id}")
def get_timeline(character_id: str):
    if character_id not in _timelines:
        raise HTTPException(404, "Timeline not found")
    return _timelines[character_id]


@router.post("", status_code=201)
def create_timeline(tl: CharacterTimeline):
    _timelines[tl.character_id] = tl
    return tl


@router.put("/{character_id}")
def update_timeline(character_id: str, tl: CharacterTimeline):
    if character_id not in _timelines:
        raise HTTPException(404, "Timeline not found")
    _timelines[character_id] = tl
    return tl


@router.delete("/{character_id}", status_code=204)
def delete_timeline(character_id: str):
    if character_id not in _timelines:
        raise HTTPException(404, "Timeline not found")
    del _timelines[character_id]


@router.post("/{character_id}/blocks", status_code=201)
def add_time_block(character_id: str, block: TimeBlock):
    if character_id not in _timelines:
        raise HTTPException(404, "Timeline not found")
    _timelines[character_id].time_blocks.append(block)
    return block
