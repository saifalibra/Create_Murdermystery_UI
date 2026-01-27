# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException

from app.models import Secret

router = APIRouter()
_secrets: dict[str, Secret] = {}


@router.get("")
def list_secrets():
    return list(_secrets.values())


@router.get("/{secret_id}")
def get_secret(secret_id: str):
    if secret_id not in _secrets:
        raise HTTPException(404, "Secret not found")
    return _secrets[secret_id]


@router.post("", status_code=201)
def create_secret(s: Secret):
    _secrets[s.id] = s
    return s


@router.put("/{secret_id}")
def update_secret(secret_id: str, s: Secret):
    if secret_id not in _secrets:
        raise HTTPException(404, "Secret not found")
    _secrets[secret_id] = s
    return s


@router.delete("/{secret_id}", status_code=204)
def delete_secret(secret_id: str):
    if secret_id not in _secrets:
        raise HTTPException(404, "Secret not found")
    del _secrets[secret_id]
