# -*- coding: utf-8 -*-
from enum import Enum

from pydantic import BaseModel, Field


class NodeType(str, Enum):
    evidence = "Evidence"
    event = "Event"
    location = "Location"
    character = "Character"
    secret = "Secret"


class EdgeType(str, Enum):
    supports = "supports"
    refutes = "refutes"
    implies = "implies"
    contradicts = "contradicts"
    rule_applies = "rule_applies"


class GraphNode(BaseModel):
    node_id: str
    node_type: NodeType
    reference_id: str = Field(..., description="evidence_id | event_id | location_id | character_id | secret_id")
    event_id: str | None = Field(None, description="このノードが紐づくイベントID（任意）")
    logic_details: dict[str, str] = Field(default_factory=dict, description="ロジックID -> 詳細テキストのマップ")
    logic_related_entities: dict[str, list[str]] = Field(default_factory=dict, description="ロジックID -> 関連ノードIDのリストのマップ")


class GraphEdge(BaseModel):
    edge_id: str
    source_node_id: str
    target_node_id: str
    edge_type: EdgeType


class Logic(BaseModel):
    logic_id: str
    name: str
    color: str | None = None  # カスタム色（オプション）
