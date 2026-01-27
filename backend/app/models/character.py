# -*- coding: utf-8 -*-
from enum import Enum
from typing import List

from pydantic import BaseModel, Field


class CharacterRole(str, Enum):
    player = "player"
    npc = "npc"
    victim = "victim"
    culprit = "culprit"


class Relation(BaseModel):
    to: str = Field(..., description="character_id")
    label: str = Field(..., description="friend|colleague|lover|rival|...")
    strength: float = Field(0.0, ge=0.0, le=1.0)


class Character(BaseModel):
    id: str
    name: str
    image: str | None = None  # url or file id
    role: CharacterRole = CharacterRole.player
    relations: List[Relation] = Field(default_factory=list)
    secret_ids: List[str] = Field(default_factory=list)
    bio: str | None = None  # 背景・プロフィール
