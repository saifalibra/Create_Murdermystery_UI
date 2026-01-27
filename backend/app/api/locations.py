# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException

from app.models import Location

router = APIRouter()
_locations: dict[str, Location] = {}


@router.get("")
def list_locations():
    return list(_locations.values())


@router.get("/{location_id}")
def get_location(location_id: str):
    if location_id not in _locations:
        raise HTTPException(404, "Location not found")
    return _locations[location_id]


@router.post("", status_code=201)
def create_location(loc: Location):
    _locations[loc.id] = loc
    return loc


@router.put("/{location_id}")
def update_location(location_id: str, loc: Location):
    if location_id not in _locations:
        raise HTTPException(404, "Location not found")
    _locations[location_id] = loc
    return loc


@router.delete("/{location_id}", status_code=204)
def delete_location(location_id: str):
    if location_id not in _locations:
        raise HTTPException(404, "Location not found")
    del _locations[location_id]
