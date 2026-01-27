# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException
from collections import defaultdict

from app.models import GraphNode, GraphEdge, Logic

router = APIRouter()
_nodes: dict[str, GraphNode] = {}
_edges: dict[str, GraphEdge] = {}
_logics: dict[str, Logic] = {}


def compute_connected_components() -> dict[str, str]:
    """
    グラフの連結成分を計算し、ノードIDからロジックIDへのマッピングを返す。
    ロジックIDは logic_0, logic_1, ... の形式。
    """
    # グラフを構築
    graph: dict[str, set[str]] = defaultdict(set)
    for edge in _edges.values():
        graph[edge.source_node_id].add(edge.target_node_id)
        graph[edge.target_node_id].add(edge.source_node_id)  # 無向グラフとして扱う
    
    # すべてのノードを含める（孤立ノードも）
    for node_id in _nodes.keys():
        if node_id not in graph:
            graph[node_id] = set()
    
    # DFSで連結成分を探索
    visited = set()
    node_to_logic: dict[str, str] = {}
    logic_counter = 0
    
    def dfs(node_id: str, logic_id: str):
        if node_id in visited:
            return
        visited.add(node_id)
        node_to_logic[node_id] = logic_id
        for neighbor in graph[node_id]:
            dfs(neighbor, logic_id)
    
    for node_id in _nodes.keys():
        if node_id not in visited:
            logic_id = f"logic_{logic_counter}"
            dfs(node_id, logic_id)
            logic_counter += 1
    
    return node_to_logic


@router.get("/nodes")
def list_nodes():
    return list(_nodes.values())


@router.get("/nodes/{node_id}")
def get_node(node_id: str):
    if node_id not in _nodes:
        raise HTTPException(404, "Node not found")
    return _nodes[node_id]


@router.post("/nodes", status_code=201)
def create_node(n: GraphNode):
    _nodes[n.node_id] = n
    return n


@router.put("/nodes/{node_id}")
def update_node(node_id: str, n: GraphNode):
    if node_id not in _nodes:
        raise HTTPException(404, "Node not found")
    _nodes[node_id] = n
    return n


@router.delete("/nodes/{node_id}", status_code=204)
def delete_node(node_id: str):
    if node_id not in _nodes:
        raise HTTPException(404, "Node not found")
    del _nodes[node_id]


@router.get("/edges")
def list_edges():
    return list(_edges.values())


@router.get("/edges/{edge_id}")
def get_edge(edge_id: str):
    if edge_id not in _edges:
        raise HTTPException(404, "Edge not found")
    return _edges[edge_id]


@router.post("/edges", status_code=201)
def create_edge(e: GraphEdge):
    _edges[e.edge_id] = e
    return e


@router.delete("/edges/{edge_id}", status_code=204)
def delete_edge(edge_id: str):
    if edge_id not in _edges:
        raise HTTPException(404, "Edge not found")
    del _edges[edge_id]


@router.get("/logics")
def list_logics():
    return list(_logics.values())


@router.get("/logics/{logic_id}")
def get_logic(logic_id: str):
    if logic_id not in _logics:
        raise HTTPException(404, "Logic not found")
    return _logics[logic_id]


@router.post("/logics", status_code=201)
def create_logic(l: Logic):
    _logics[l.logic_id] = l
    return l


@router.put("/logics/{logic_id}")
def update_logic(logic_id: str, l: Logic):
    if logic_id not in _logics:
        raise HTTPException(404, "Logic not found")
    _logics[logic_id] = l
    return l


@router.delete("/logics/{logic_id}", status_code=204)
def delete_logic(logic_id: str):
    if logic_id not in _logics:
        raise HTTPException(404, "Logic not found")
    del _logics[logic_id]


@router.post("/compute-logics")
def compute_logics():
    """
    連結成分を計算し、存在しないロジックIDに対して自動的にロジックエンティティを作成する。
    """
    node_to_logic = compute_connected_components()
    
    # 存在しないロジックIDに対して自動的にロジックエンティティを作成
    for logic_id in set(node_to_logic.values()):
        if logic_id not in _logics:
            # デフォルト名と色を生成
            logic_counter = len(_logics)
            default_name = f"ロジック {logic_counter + 1}"
            # ハッシュベースの色を生成
            hash_val = hash(logic_id) % 360
            default_color = f"hsl({hash_val}, 70%, 50%)"
            
            logic = Logic(
                logic_id=logic_id,
                name=default_name,
                color=default_color
            )
            _logics[logic_id] = logic
    
    return {
        "node_to_logic": node_to_logic,
        "logics": list(_logics.values())
    }
