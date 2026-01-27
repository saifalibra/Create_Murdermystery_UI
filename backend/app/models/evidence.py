# -*- coding: utf-8 -*-
from typing import Any, List

from pydantic import BaseModel, Field

from app.models.common import TimeRange


class EvidencePointers(BaseModel):
    time_range: TimeRange | None = None
    location_id: str | None = None
    character_id: str | None = None
    event_ids: List[str] = Field(default_factory=list)
    # 最終所持者・最終場所（発見場所・発見人物から統合）
    final_location_id: str | None = None
    final_holder_character_id: str | None = None


class EvidenceEffects(BaseModel):
    supports_claim_ids: List[str] = Field(default_factory=list)
    refutes_claim_ids: List[str] = Field(default_factory=list)
    confidence: str = "medium"  # high | medium | low


class EvidenceVisibility(BaseModel):
    reveal_phase: str = "phase1"  # phase1 | phase2 | ...


class EvidenceAcquisition(BaseModel):
    difficulty: str = "normal"  # easy | normal | hard


class EvidenceAssets(BaseModel):
    image_prompt: str | None = None
    image_ids: List[str] = Field(default_factory=list)
    printable: str | None = None


class EvidenceItem(BaseModel):
    id: str
    name: str
    summary: str = ""
    detail: str = ""
    appearance_spec: dict[str, Any] = Field(default_factory=dict)
    origin: str = "log"  # log | user | LLM
    pointers: EvidencePointers = Field(default_factory=EvidencePointers)
    effects: EvidenceEffects = Field(default_factory=EvidenceEffects)
    visibility: EvidenceVisibility = Field(default_factory=EvidenceVisibility)
    acquisition: EvidenceAcquisition = Field(default_factory=EvidenceAcquisition)
    assets: EvidenceAssets = Field(default_factory=EvidenceAssets)
