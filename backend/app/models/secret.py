# -*- coding: utf-8 -*-
from typing import List

from pydantic import BaseModel, Field


class Deny(BaseModel):
    by_character_id: str
    alibi_statement: str


class Claim(BaseModel):
    id: str
    description: str
    deny: Deny | None = None


class Secret(BaseModel):
    id: str
    character_id: str = ""  # 廃止予定。紐づけはキャラクターの secret_ids で管理
    description: str = ""
    hidden_from_character_ids: List[str] = Field(default_factory=list)
