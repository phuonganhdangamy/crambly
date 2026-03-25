"""
Convert study text (markdown-ish **bold**, LaTeX $...$, $$...$$) into safe HTML for emails.
Avoids raw $$ / backslash soup in clients that do not render KaTeX.
"""

from __future__ import annotations

import html as html_module
import re


def _latex_to_plain(inner: str) -> str:
    """Best-effort readable text from a LaTeX fragment (no KaTeX in email)."""
    s = inner.strip()
    if not s:
        return ""
    # Nested \frac — flatten shallow {…} pairs iteratively
    for _ in range(48):
        ns = re.sub(r"\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}", r"(\1)/(\2)", s)
        if ns == s:
            break
        s = ns
    s = re.sub(
        r"\\(?:text|mathrm|mathbf|mathit|mathcal|mathbb|mathsf|mathtt)\s*\{([^}]+)\}",
        r"\1",
        s,
    )
    s = re.sub(r"\\quad|\\qquad", " ", s)
    s = re.sub(r"\\[,;:!]", " ", s)
    # Remaining \word commands → space (drops \alpha etc. but avoids parse errors)
    s = re.sub(r"\\([a-zA-Z]+)(\[[^]]*\])?", " ", s)
    s = re.sub(r"[{}]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s if s else "[math]"


def strip_math_regions(s: str) -> str:
    """Replace display/inline math with plain-language placeholders."""
    s = re.sub(r"\$\$([\s\S]*?)\$\$", lambda m: f" {_latex_to_plain(m.group(1))} ", s)
    s = re.sub(r"\\\[([\s\S]*?)\\\]", lambda m: f" {_latex_to_plain(m.group(1))} ", s)
    s = re.sub(r"\\\(([\s\S]*?)\\\)", lambda m: f" {_latex_to_plain(m.group(1))} ", s)
    # Single $…$ (avoid $$)
    s = re.sub(
        r"(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)",
        lambda m: f" {_latex_to_plain(m.group(1))} ",
        s,
    )
    return s


def email_html_from_study_text(raw: str, *, max_len: int | None = None) -> str:
    """
    Escape HTML, preserve **bold** as <strong>, flatten LaTeX to readable text.
    Newlines are kept as \\n for caller to convert to <br/> if needed.
    """
    if not raw:
        return ""
    text = raw if max_len is None else raw[: max(0, max_len)]
    text = strip_math_regions(text)
    # Strip stray backticks from markdown code that would look broken in email
    text = re.sub(r"`([^`]+)`", r"\1", text)

    placeholders: list[tuple[str, str]] = []

    def bold_repl(m: re.Match[str]) -> str:
        token = f"\ue200{len(placeholders)}\ue201"
        placeholders.append((token, f"<strong>{html_module.escape(m.group(1))}</strong>"))
        return token

    text = re.sub(r"\*\*([^*]+)\*\*", bold_repl, text)
    text = html_module.escape(text)
    for token, frag in placeholders:
        text = text.replace(token, frag)
    return text


def email_html_paragraphs(raw: str, *, max_len: int | None = None, style: str) -> str:
    """Split on blank lines; each paragraph is sanitized and wrapped in <p>."""
    if not raw:
        return ""
    blob = raw if max_len is None else raw[: max(0, max_len)]
    parts: list[str] = []
    for para in re.split(r"\n\s*\n", blob):
        p = para.strip()
        if not p:
            continue
        inner = email_html_from_study_text(p).replace("\n", "<br/>")
        parts.append(f'<p style="{style}">{inner}</p>')
    return "".join(parts) if parts else f'<p style="{style}">—</p>'
