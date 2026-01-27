# -*- coding: utf-8 -*-
from datetime import datetime
from typing import Any, List

from pydantic import BaseModel, Field

from app.models.common import TimeRange


class EventLinks(BaseModel):
    claim_ids: List[str] = Field(default_factory=list)


class Event(BaseModel):
    id: str
    title: str = ""  # イベントタイトル
    content: str = ""  # イベント内容の記述
    time_range: TimeRange
    location_ids: List[str] = Field(default_factory=list)  # 複数の場所を選択可能
    participants: List[str] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)
    links: EventLinks = Field(default_factory=EventLinks)
    origin: str = "log"  # log | user | node
    priority: int = 1
