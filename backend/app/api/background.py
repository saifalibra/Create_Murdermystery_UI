# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException

from app.models import Background

router = APIRouter()
_backgrounds: dict[str, Background] = {}


@router.get("")
def list_backgrounds():
    return list(_backgrounds.values())


@router.get("/{bg_id}")
def get_background(bg_id: str):
    if bg_id not in _backgrounds:
        raise HTTPException(404, "Background not found")
    return _backgrounds[bg_id]


@router.post("", status_code=201)
def create_background(bg: Background):
    _backgrounds[bg.id] = bg
    return bg


@router.put("/{bg_id}")
def update_background(bg_id: str, bg: Background):
    if bg_id not in _backgrounds:
        raise HTTPException(404, "Background not found")
    _backgrounds[bg_id] = bg
    return bg


@router.delete("/{bg_id}", status_code=204)
def delete_background(bg_id: str):
    if bg_id not in _backgrounds:
        raise HTTPException(404, "Background not found")
    del _backgrounds[bg_id]
