# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException

from app.models import Claim

router = APIRouter()
_claims: dict[str, Claim] = {}


@router.get("")
def list_claims():
    return list(_claims.values())


@router.get("/{claim_id}")
def get_claim(claim_id: str):
    if claim_id not in _claims:
        raise HTTPException(404, "Claim not found")
    return _claims[claim_id]


@router.post("", status_code=201)
def create_claim(c: Claim):
    _claims[c.id] = c
    return c


@router.put("/{claim_id}")
def update_claim(claim_id: str, c: Claim):
    if claim_id not in _claims:
        raise HTTPException(404, "Claim not found")
    _claims[claim_id] = c
    return c


@router.delete("/{claim_id}", status_code=204)
def delete_claim(claim_id: str):
    if claim_id not in _claims:
        raise HTTPException(404, "Claim not found")
    del _claims[claim_id]
