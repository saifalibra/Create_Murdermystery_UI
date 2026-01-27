# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException

from app.models import EvidenceItem

router = APIRouter()
_evidence: dict[str, EvidenceItem] = {}


@router.get("")
def list_evidence():
    return list(_evidence.values())


@router.get("/{item_id}")
def get_evidence(item_id: str):
    if item_id not in _evidence:
        raise HTTPException(404, "Evidence not found")
    return _evidence[item_id]


@router.post("", status_code=201)
def create_evidence(item: EvidenceItem):
    _evidence[item.id] = item
    return item


@router.put("/{item_id}")
def update_evidence(item_id: str, item: EvidenceItem):
    if item_id not in _evidence:
        raise HTTPException(404, "Evidence not found")
    _evidence[item_id] = item
    return item


@router.delete("/{item_id}", status_code=204)
def delete_evidence(item_id: str):
    if item_id not in _evidence:
        raise HTTPException(404, "Evidence not found")
    del _evidence[item_id]
