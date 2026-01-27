# -*- coding: utf-8 -*-
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api import (
    scenarios,
    characters,
    locations,
    events,
    evidence,
    secrets,
    claims,
    timeline,
    graph,
    validation,
    import_api,
    background,
)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, debug=settings.debug)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(scenarios.router, prefix="/api/scenarios", tags=["scenarios"])
    app.include_router(characters.router, prefix="/api/characters", tags=["characters"])
    app.include_router(locations.router, prefix="/api/locations", tags=["locations"])
    app.include_router(events.router, prefix="/api/events", tags=["events"])
    app.include_router(evidence.router, prefix="/api/evidence", tags=["evidence"])
    app.include_router(secrets.router, prefix="/api/secrets", tags=["secrets"])
    app.include_router(claims.router, prefix="/api/claims", tags=["claims"])
    app.include_router(timeline.router, prefix="/api/timeline", tags=["timeline"])
    app.include_router(graph.router, prefix="/api/graph", tags=["graph"])
    app.include_router(validation.router, prefix="/api/validation", tags=["validation"])
    app.include_router(import_api.router, prefix="/api/import", tags=["import"])
    app.include_router(background.router, prefix="/api/background", tags=["background"])

    @app.get("/")
    def root():
        return {"message": "マーダーミステリーシナリオ生成 API", "docs": "/docs"}

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/health")
    def api_health():
        return {"status": "ok"}

    return app


app = create_app()
