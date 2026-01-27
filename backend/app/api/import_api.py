# -*- coding: utf-8 -*-
import json
import os
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException

from app.services.import_service import parse_bt_contacts_csv
from app.api import characters

router = APIRouter()

# 取り込み後に保持。接触状況タブ用
_contact_timeline: list[dict] = []
_name_map: dict[str, str] = {}


@router.post("/csv")
async def import_csv(file: UploadFile = File(...)):
    """
    Bluetooth接触CSV（bt_contacts_1230.csv 等）をアップロード。
    位置情報は無視。user / contacted_user がその時間一緒にいた log として扱う。
    接触ログが gap_minutes 以上空いたら新区間（新枠）。transitive グループを適用しタイムライン生成。
    """
    try:
        raw = await file.read()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("cp932", errors="replace")

        result = parse_bt_contacts_csv(text)

        for c in result["characters"]:
            try:
                characters._characters[c.id] = c
            except Exception as e:
                print(f"Warning: Failed to register character {c.id}: {e}")

        global _contact_timeline, _name_map
        _contact_timeline = result.get("contact_timeline") or []
        _name_map = {c.id: c.name for c in result["characters"]}

        # 接触枠データを contact_data.json に保存
        try:
            # プロジェクトルートを取得（backend/app/api から 3階層上）
            project_root = Path(__file__).parent.parent.parent.parent
            contact_data_path = project_root / "contact_data.json"
            
            contact_data = {
                "timeline": _contact_timeline,
                "name_map": _name_map,
                "characters": [{"id": c.id, "name": c.name} for c in result["characters"]],
                "summary": {
                    "total_blocks": len(_contact_timeline),
                    "total_characters": len(result["characters"]),
                }
            }
            
            with open(contact_data_path, "w", encoding="utf-8") as f:
                json.dump(contact_data, f, ensure_ascii=False, indent=2)
            
            print(f"[INFO] Contact data saved to: {contact_data_path}")
        except Exception as e:
            print(f"[WARNING] Failed to save contact_data.json: {e}")

        return {
            "filename": file.filename,
            "summary": {
                "characters": len(result["characters"]),
                "blocks": len(_contact_timeline),
            },
            "character_ids": [c.id for c in result["characters"]][:20],
        }
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"Import error: {error_detail}")
        raise HTTPException(status_code=500, detail=f"CSV取り込みエラー: {str(e)}")


@router.get("/contact-timeline")
def get_contact_timeline():
    """
    CSV取り込みで生成した接触タイムラインを返す。
    [ { start, end, groups: [ [id, ...], ... ] }, ... ] と id -> 表示名のマップ。
    """
    return {
        "timeline": _contact_timeline,
        "name_map": _name_map,
    }
