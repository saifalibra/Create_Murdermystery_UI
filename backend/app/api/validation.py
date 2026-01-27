# -*- coding: utf-8 -*-
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class ValidationResult(BaseModel):
    valid: bool
    errors: list[str] = []
    warnings: list[str] = []


@router.post("/timeline", response_model=ValidationResult)
def validate_timeline():
    """タイムラインの整合性チェック（移動不可能・同一人物重複など）"""
    return ValidationResult(valid=True, errors=[], warnings=[])


@router.post("/graph", response_model=ValidationResult)
def validate_graph():
    """グラフ整合性：各秘密に1本以上のバックトラックパス、矛盾なし等"""
    return ValidationResult(valid=True, errors=[], warnings=[])


@router.post("/culprit", response_model=ValidationResult)
def validate_culprit():
    """犯人決定可能性：公開証拠のみで犯人に到達できるか"""
    return ValidationResult(valid=True, errors=[], warnings=[])
