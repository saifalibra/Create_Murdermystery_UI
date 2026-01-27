# -*- coding: utf-8 -*-
from datetime import datetime

from pydantic import BaseModel


class TimeRange(BaseModel):
    start: datetime
    end: datetime


class BaseModelConfig(BaseModel):
    class Config:
        str_strip_whitespace = True
        populate_by_name = True
