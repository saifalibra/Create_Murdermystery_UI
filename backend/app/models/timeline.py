# -*- coding: utf-8 -*-
from typing import Any, List

from pydantic import BaseModel, Field

from app.models.common import TimeRange


class ContactObservation(BaseModel):
    with_character_id: str
    strength: float = 0.0
    source: str = "bluetooth"  # bluetooth | wifi | manual


class PresenceObservation(BaseModel):
    confidence: float = 0.0
    source: str = "gps"  # gps | manual


class Observations(BaseModel):
    contacts: List[ContactObservation] = Field(default_factory=list)
    presence: PresenceObservation | None = None


class Contradiction(BaseModel):
    rule_id: str
    message: str


class Interpretation(BaseModel):
    alibi_strength: float = 0.0
    suspicion_delta: float = 0.0
    contradictions: List[Contradiction] = Field(default_factory=list)
    inference_notes: List[str] = Field(default_factory=list)


class PromptBits(BaseModel):
    public_facts: List[str] = Field(default_factory=list)
    private_facts: List[str] = Field(default_factory=list)
    tone_tags: List[str] = Field(default_factory=list)
    dialogue_hooks: List[str] = Field(default_factory=list)


class TimeBlockLinks(BaseModel):
    evidence_item_ids: List[str] = Field(default_factory=list)
    claim_ids: List[str] = Field(default_factory=list)
    secret_ids: List[str] = Field(default_factory=list)


class TimeBlock(BaseModel):
    block_id: str
    time_range: TimeRange
    location_id: str
    observations: Observations = Field(default_factory=Observations)
    events: List[str] = Field(default_factory=list)
    links: TimeBlockLinks = Field(default_factory=TimeBlockLinks)
    interpretation: Interpretation = Field(default_factory=Interpretation)
    prompt_bits: PromptBits = Field(default_factory=PromptBits)


class DerivedStats(BaseModel):
    alone_minutes_total: float = 0.0
    victim_contact_blocks: List[str] = Field(default_factory=list)
    witness_density_score: float = 0.0
    movement_feasibility_score: float = 0.0
    murder_window_accessible: bool = False
    suspect_score_total: float = 0.0


class IdentitySeed(BaseModel):
    age: str | None = None
    occupation: str | None = None
    position: str | None = None
    relations_summary: str | None = None


class StyleControls(BaseModel):
    tone: str | None = None
    dialect: str | None = None
    other: dict[str, Any] = Field(default_factory=dict)


class PromptPack(BaseModel):
    identity_seed: IdentitySeed | None = None
    timeline_digest_public: List[str] = Field(default_factory=list)
    timeline_digest_private: List[str] = Field(default_factory=list)
    signature_events: List[str] = Field(default_factory=list)
    alibi_statement: str = ""
    vulnerability_points: List[str] = Field(default_factory=list)
    evidence_mentions: List[str] = Field(default_factory=list)
    style_controls: StyleControls | None = None


class CharacterTimeline(BaseModel):
    character_id: str
    time_blocks: List[TimeBlock] = Field(default_factory=list)
    derived: DerivedStats = Field(default_factory=DerivedStats)
    prompt_pack: PromptPack = Field(default_factory=PromptPack)
