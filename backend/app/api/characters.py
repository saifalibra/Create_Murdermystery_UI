# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException

from app.models import Character

router = APIRouter()
_characters: dict[str, Character] = {}


@router.get("")
def list_characters():
    return list(_characters.values())


@router.get("/{character_id}")
def get_character(character_id: str):
    if character_id not in _characters:
        raise HTTPException(404, "Character not found")
    return _characters[character_id]


@router.post("", status_code=201)
def create_character(c: Character):
    _characters[c.id] = c
    return c


@router.put("/{character_id}")
def update_character(character_id: str, c: Character):
    if character_id not in _characters:
        raise HTTPException(404, "Character not found")
    _characters[character_id] = c
    return c


@router.delete("/{character_id}", status_code=204)
def delete_character(character_id: str):
    if character_id not in _characters:
        raise HTTPException(404, "Character not found")
    del _characters[character_id]
