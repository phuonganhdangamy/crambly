"""Rasterize PDF pages to PNG bytes for Gemini Vision."""

from __future__ import annotations

from typing import Any


def pdf_to_page_images(pdf_bytes: bytes, *, dpi: int = 150) -> list[dict[str, Any]]:
    """
    Convert each PDF page to a PNG image (raw bytes, not base64).
    Returns [{"page_number": int, "png_bytes": bytes, "width": int, "height": int}, ...]
    """
    try:
        import fitz  # PyMuPDF
    except ImportError as e:  # pragma: no cover
        raise RuntimeError(
            "PyMuPDF is required for PDF vision ingestion. Install with: pip install PyMuPDF"
        ) from e

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages: list[dict[str, Any]] = []
    try:
        scale = dpi / 72.0
        mat = fitz.Matrix(scale, scale)
        for page_num in range(len(doc)):
            page = doc[page_num]
            pix = page.get_pixmap(matrix=mat, alpha=False)
            png_bytes = pix.tobytes("png")
            pages.append(
                {
                    "page_number": page_num + 1,
                    "png_bytes": png_bytes,
                    "width": pix.width,
                    "height": pix.height,
                }
            )
    finally:
        doc.close()
    return pages
