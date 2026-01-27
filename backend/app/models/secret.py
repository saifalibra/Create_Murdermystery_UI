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
    character_id: str
    description: str = ""
