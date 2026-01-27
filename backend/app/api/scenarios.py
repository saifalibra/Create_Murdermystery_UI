# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException

from app.models import ScenarioConfig

router = APIRouter()

# 一時的なインメモリ（後でDB/JSON永続化に置換）
_scenarios: dict[str, ScenarioConfig] = {}


@router.get("")
def list_scenarios():
    return list(_scenarios.values())


@router.get("/{scenario_id}")
def get_scenario(scenario_id: str):
    if scenario_id not in _scenarios:
        raise HTTPException(404, "Scenario not found")
    return _scenarios[scenario_id]


@router.post("", status_code=201)
def create_scenario(config: ScenarioConfig):
    sid = f"scenario_{len(_scenarios) + 1}"
    _scenarios[sid] = config
    return {"id": sid, "config": config}


@router.put("/{scenario_id}")
def update_scenario(scenario_id: str, config: ScenarioConfig):
    if scenario_id not in _scenarios:
        raise HTTPException(404, "Scenario not found")
    _scenarios[scenario_id] = config
    return {"id": scenario_id, "config": config}


@router.delete("/{scenario_id}", status_code=204)
def delete_scenario(scenario_id: str):
    if scenario_id not in _scenarios:
        raise HTTPException(404, "Scenario not found")
    del _scenarios[scenario_id]
