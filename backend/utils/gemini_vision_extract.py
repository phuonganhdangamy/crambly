"""Gemini Vision slide extraction (PNG → structured JSON)."""

from __future__ import annotations

import logging
import time
from typing import Any

import google.generativeai as genai
from google.api_core import exceptions as google_api_exceptions

from config import get_settings
from gemini_client import configure_gemini, extract_json_blob
from utils.table_recovery import ensure_table_from_raw_text

logger = logging.getLogger(__name__)

SLIDE_EXTRACTION_PROMPT = """
You are an expert academic content extractor for university STEM slides.
Analyze this lecture slide image and extract ALL content with perfect fidelity.

IGNORE these visual elements — do not extract them:
- Navigation dots or progress indicators (small circles at bottom of slide)
- Slide number indicators
- Footer bars with repeated section titles
- Beamer navigation bars (the row of small dots/squares between sections)
- Any decorative or structural UI elements that are not academic content

EXTRACT and CONVERT these elements:

Plain text:
  Extract exactly as written.

Mathematical expressions — convert ALL to LaTeX:
  Inline math (mid-sentence): wrap in $...$
    e.g. "the mean μᵢⱼ for the (i,j) cell" →
         "the mean $\\mu_{ij}$ for the $(i,j)$ cell"
  Display math (equation on its own line or visually prominent):
    wrap in $$...$$
  Greek letters: \\lambda \\mu \\alpha \\beta \\sigma \\pi \\prod \\sum
  Subscripts: x_{ij} (use braces for multi-character subscripts)
  Superscripts: x^{y_{ij}} (nest correctly)
  Fractions: \\frac{numerator}{denominator}
  Products: \\prod_{i=1}^{I}
  Factorials: y_{ij}!
  Exponentials: e^{-\\mu_{ij}}
  If a formula spans multiple visual lines, reconstruct it as ONE
  complete LaTeX expression — do not split it across multiple blocks.

Tables — convert to markdown table format:
  Use standard markdown pipe tables:
  | Header 1 | Header 2 | Header 3 |
  |----------|----------|----------|
  | value    | value    | value    |
  Preserve all row and column labels exactly.
  For cells containing math, use inline LaTeX: $x_{ij}$
  For column/row spans that markdown cannot represent,
  add a plain text note below the table explaining the structure.
  Do NOT use LaTeX tabular environment — use markdown tables only.

CONTINGENCY TABLES, MATRIX GRIDS, AND I×J LAYOUTS (CRITICAL):
- If the slide shows a rectangular grid (counts, symbols like y_11, y_12, … across
  columns and rows, row totals y_i., column headers 1…J, FACTOR labels):
  you MUST encode the ENTIRE grid in ONE content block with type "table" and
  markdown_table set to ONE complete GFM pipe table string.
- Each visual ROW of the grid = exactly ONE line in markdown_table, with cells
  separated by " | ". Never put one cell per line unless it is its own row.
- NEVER emit one "equation" or "paragraph" or "bullet_list" item per cell.
  That destroys the 2D layout and is forbidden for grid slides.
- Put row labels (e.g. 1, 2, 3, …, I, FACTOR V) in the first column; column
  headers (1, 2, …, j, …, J, FACTOR W) in the header row.
- If introductory text appears above the grid, use a "paragraph" block above
  the single "table" block.
- The raw_text field must ALSO contain the same pipe table (copy of markdown_table)
  so the structure is recoverable.

Bullet points:
  Preserve hierarchy. Top-level bullets as "- text".
  Nested bullets as "  - text" (2-space indent per level).
  If a bullet contains math, convert the math inline.

Italic text (common in academic slides for emphasis):
  Wrap in *...* e.g. *et al.*

Code blocks:
  Wrap in ``` with language tag (r, python, etc.)

Return JSON only, no markdown fences, no commentary:
{
  "slide_title": string or null,
  "content_blocks": [
    {
      "type": "heading" | "subheading" | "paragraph" | "bullet_list" | "equation" | "table" | "code",
      "text": string,
      "latex": string or null,
      "items": string[] or null,
      "markdown_table": string or null,
      "language": string or null
    }
  ],
  "has_math": boolean,
  "has_code": boolean,
  "has_table": boolean,
  "raw_text": string
}
"""


def _normalize_slide_payload(data: dict[str, Any]) -> dict[str, Any]:
    blocks = data.get("content_blocks")
    if not isinstance(blocks, list):
        blocks = []
    out_blocks: list[dict[str, Any]] = []
    for b in blocks:
        if isinstance(b, dict):
            out_blocks.append(b)
    base = {
        "slide_title": data.get("slide_title"),
        "content_blocks": out_blocks,
        "has_math": bool(data.get("has_math")),
        "has_code": bool(data.get("has_code")),
        "has_table": bool(data.get("has_table")),
        "raw_text": str(data.get("raw_text") or ""),
    }
    return ensure_table_from_raw_text(base)


def _empty_slide_payload() -> dict[str, Any]:
    return {
        "slide_title": None,
        "content_blocks": [],
        "has_math": False,
        "has_code": False,
        "has_table": False,
        "raw_text": "",
    }


def extract_slide_from_png(png_bytes: bytes) -> dict[str, Any]:
    """Call Gemini Vision on one slide PNG; return normalized dict (never raises)."""
    configure_gemini()
    model_name = get_settings().gemini_ingestion_model
    model = genai.GenerativeModel(model_name)
    part = {"mime_type": "image/png", "data": png_bytes}
    last_err: Exception | None = None
    for attempt in range(4):
        try:
            resp = model.generate_content(
                [SLIDE_EXTRACTION_PROMPT, part],
                generation_config=genai.types.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=8192,
                ),
            )
            raw = (resp.text or "").strip()
            data = extract_json_blob(raw)
            if not isinstance(data, dict):
                raise ValueError("Vision response is not a JSON object")
            return _normalize_slide_payload(data)
        except google_api_exceptions.ResourceExhausted as e:
            last_err = e
            if attempt < 3:
                time.sleep(min(30.0, 2.0 * (attempt + 1)))
        except Exception as e:  # noqa: BLE001
            last_err = e
            if attempt < 3:
                time.sleep(0.8 * (2**attempt))
    logger.warning("Gemini vision slide extract failed after retries: %s", last_err)
    return _empty_slide_payload()
