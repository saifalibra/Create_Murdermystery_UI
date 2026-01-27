# -*- coding: utf-8 -*-
from typing import List

from pydantic import BaseModel, Field


class ScenarioConfig(BaseModel):
    world: str = Field(..., description="現代日本|幕末|テーマパーク|...")
    incident_type: str = Field(..., description="殺人|詐欺|誘拐|...")
    tone: str = Field(..., description="シリアス|ミステリー|コメディ")
    taboos: List[str] = Field(default_factory=list, description="表現禁止・過激要素など")
