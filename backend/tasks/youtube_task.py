from __future__ import annotations

import logging
from typing import Any

import httpx

from config import get_settings
from tasks.common import fetch_concepts_for_upload, patch_study_deck

logger = logging.getLogger(__name__)


def _search_videos(api_key: str, query: str) -> list[dict[str, str]]:
    url = "https://www.googleapis.com/youtube/v3/search"
    params = {
        "part": "snippet",
        "q": f"{query} explained",
        "type": "video",
        "maxResults": 2,
        "relevanceLanguage": "en",
        "videoDuration": "medium",
        "key": api_key,
    }
    out: list[dict[str, str]] = []
    with httpx.Client(timeout=30.0) as client:
        r = client.get(url, params=params)
        r.raise_for_status()
        body = r.json()
    for item in body.get("items") or []:
        if not isinstance(item, dict):
            continue
        vid = item.get("id") or {}
        if not isinstance(vid, dict):
            continue
        video_id = vid.get("videoId")
        sn = item.get("snippet") or {}
        if not isinstance(sn, dict) or not video_id:
            continue
        thumbs = sn.get("thumbnails") or {}
        med = thumbs.get("medium") or thumbs.get("default") or {}
        thumb_url = str(med.get("url", "")) if isinstance(med, dict) else ""
        out.append(
            {
                "title": str(sn.get("title", "")),
                "channel": str(sn.get("channelTitle", "")),
                "thumbnail_url": thumb_url,
                "video_url": f"https://www.youtube.com/watch?v={video_id}",
            }
        )
    return out[:2]


def run_youtube_task(upload_id: str, user_id: str) -> None:
    _ = user_id
    settings = get_settings()
    key = (settings.youtube_api_key or "").strip()
    if not key:
        logger.warning("YOUTUBE_API_KEY missing — youtube_task skipped")
        patch_study_deck(
            upload_id,
            fields={"youtube_suggestions": []},
            task_updates={"youtube": "error"},
        )
        return
    try:
        concepts = fetch_concepts_for_upload(upload_id)
        top3 = concepts[:3]
        suggestions: list[dict[str, Any]] = []
        for c in top3:
            title = str(c.get("title", "")).strip() or "concept"
            videos = _search_videos(key, title)
            suggestions.append({"concept": title, "videos": videos})
        patch_study_deck(
            upload_id,
            fields={"youtube_suggestions": suggestions},
            task_updates={"youtube": "done"},
        )
    except Exception:  # noqa: BLE001
        logger.exception("youtube_task failed upload_id=%s", upload_id)
        patch_study_deck(upload_id, task_updates={"youtube": "error"})
