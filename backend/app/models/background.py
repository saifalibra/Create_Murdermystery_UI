# -*- coding: utf-8 -*-
from pydantic import BaseModel


class Background(BaseModel):
    id: str
    synopsis: str = ""  # あらすじ
    world_view: str = ""  # 世界観
    common_knowledge: str = ""  # 共通認識
