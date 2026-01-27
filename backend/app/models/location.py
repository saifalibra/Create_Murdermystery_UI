# -*- coding: utf-8 -*-
from pydantic import BaseModel


class Location(BaseModel):
    id: str
    name: str
