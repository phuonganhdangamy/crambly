"""Recover markdown pipe tables from vision `raw_text` when blocks omit a proper table."""

from __future__ import annotations

import re
from typing import Any


def _is_gfm_separator_row(line: str) -> bool:
    stripped = line.strip()
    if not stripped.startswith("|"):
        return False
    parts = [p.strip() for p in stripped.split("|")]
    parts = [p for p in parts if p != ""]
    if len(parts) < 2:
        return False
    for p in parts:
        compact = p.replace(" ", "")
        if not re.fullmatch(r":?-{3,}:?", compact):
            return False
    return True


def _blocks_have_pipe_table(blocks: list[dict[str, Any]]) -> bool:
    for b in blocks:
        if str(b.get("type") or "").lower() != "table":
            continue
        mt = str(b.get("markdown_table") or b.get("text") or "")
        if "|" in mt and "\n" in mt:
            return True
        if mt.count("|") >= 4:
            return True
    return False


def extract_gfm_tables_from_text(text: str) -> list[str]:
    """Find GFM-style pipe tables (header + --- separator + body rows)."""
    lines = text.splitlines()
    i = 0
    out: list[str] = []
    n = len(lines)
    while i < n:
        line = lines[i]
        if "|" not in line or not line.strip().startswith("|"):
            i += 1
            continue
        start = i
        block: list[str] = []
        while i < n:
            L = lines[i]
            if "|" not in L or not L.strip():
                break
            if not L.strip().startswith("|"):
                break
            block.append(L.rstrip())
            i += 1
        if len(block) < 3:
            i = start + 1
            continue
        sep_idx: int | None = None
        for j, row in enumerate(block):
            if _is_gfm_separator_row(row):
                sep_idx = j
                break
        if sep_idx is None or sep_idx < 1:
            i = start + 1
            continue
        out.append("\n".join(block))
    return out


def _probe_text_for_tables(payload: dict[str, Any]) -> str:
    """Vision sometimes puts a pipe table only in raw_text or inside a paragraph block."""
    parts: list[str] = [str(payload.get("raw_text") or "")]
    for b in payload.get("content_blocks") or []:
        if not isinstance(b, dict):
            continue
        if str(b.get("type") or "").lower() == "paragraph":
            parts.append(str(b.get("text") or ""))
    return "\n\n".join(p for p in parts if p.strip())


def _strip_tables_from_paragraphs(blocks: list[dict[str, Any]], tables: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for b in blocks:
        if str(b.get("type") or "").lower() != "paragraph":
            out.append(b)
            continue
        t = str(b.get("text") or "")
        for tab in tables:
            s = tab.strip()
            if len(s) > 10 and s in t:
                t = t.replace(s, "").strip()
        if t:
            nb = dict(b)
            nb["text"] = t
            out.append(nb)
    return out


def ensure_table_from_raw_text(payload: dict[str, Any]) -> dict[str, Any]:
    """
    If the model split a grid into many equation/paragraph blocks but still put a
    valid pipe table in raw_text (or a paragraph), inject table block(s) so Reading view can render a grid.
    """
    blocks = list(payload.get("content_blocks") or [])
    if _blocks_have_pipe_table(blocks):
        return payload

    tables = extract_gfm_tables_from_text(_probe_text_for_tables(payload))
    if not tables:
        return payload

    new_blocks = _strip_tables_from_paragraphs(blocks, tables)
    insert_at = 0
    for j, b in enumerate(new_blocks):
        if str(b.get("type") or "").lower() in ("heading", "subheading"):
            insert_at = j + 1
    for t in reversed(tables):
        new_blocks.insert(insert_at, {"type": "table", "markdown_table": t})
    out = {**payload, "content_blocks": new_blocks}
    if tables:
        out["has_table"] = True
    return out
