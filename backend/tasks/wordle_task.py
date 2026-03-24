from __future__ import annotations

import logging
import re
from typing import Iterable

from tasks.common import fetch_concepts_for_upload, patch_study_deck

logger = logging.getLogger(__name__)

_FILLERS = ("study", "terms", "topic", "ideas", "facts", "logic", "proof", "model", "scale", "trend")


def _words_len(text: str, n: int) -> list[str]:
    return [m.group(0).lower() for m in re.finditer(rf"\b[A-Za-z]{{{n}}}\b", text)]


def _unique_preserve(xs: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for w in xs:
        if w not in seen:
            seen.add(w)
            out.append(w)
    return out


def build_word_bank(concepts: list[dict]) -> list[str]:
    """5- and 6-letter alphabetic tokens; pad to at least 10 entries."""
    chunks: list[str] = []
    for c in concepts:
        chunks.append(str(c.get("title", "")))
        chunks.append(str(c.get("summary", "")))
    blob = " ".join(chunks)
    bank = _unique_preserve(_words_len(blob, 5) + _words_len(blob, 6))
    if len(bank) < 10:
        for c in concepts:
            for piece in re.split(r"[^a-zA-Z]+", f"{c.get('title', '')} {c.get('summary', '')}"):
                p = piece.lower()
                if len(p) >= 5 and p.isalpha():
                    frag = p[:5]
                    if frag not in bank:
                        bank.append(frag)
                if len(bank) >= 10:
                    break
            if len(bank) >= 10:
                break
    if len(bank) < 10:
        for w in _FILLERS:
            if w not in bank:
                bank.append(w)
            if len(bank) >= 10:
                break
    return bank[:80]


def run_wordle_task(upload_id: str, user_id: str) -> None:
    _ = user_id
    try:
        concepts = fetch_concepts_for_upload(upload_id)
        bank = build_word_bank(concepts)
        patch_study_deck(
            upload_id,
            fields={"word_bank": bank},
            task_updates={"wordle": "done"},
        )
    except Exception:  # noqa: BLE001
        logger.exception("wordle_task failed upload_id=%s", upload_id)
        patch_study_deck(upload_id, task_updates={"wordle": "error"})
