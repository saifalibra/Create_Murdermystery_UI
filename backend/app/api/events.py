# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException

from app.models import Event

router = APIRouter()
_events: dict[str, Event] = {}


@router.get("")
def list_events():
    return list(_events.values())


@router.get("/{event_id}")
def get_event(event_id: str):
    if event_id not in _events:
        raise HTTPException(404, "Event not found")
    return _events[event_id]


@router.post("", status_code=201)
def create_event(ev: Event):
    _events[ev.id] = ev
    return ev


@router.put("/{event_id}")
def update_event(event_id: str, ev: Event):
    if event_id not in _events:
        raise HTTPException(404, "Event not found")
    _events[event_id] = ev
    return ev


@router.delete("/{event_id}", status_code=204)
def delete_event(event_id: str):
    if event_id not in _events:
        raise HTTPException(404, "Event not found")
    del _events[event_id]
