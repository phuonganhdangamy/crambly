"""Turn vision JSON content_blocks into markdown + LaTeX for concepts.raw_content."""

from __future__ import annotations

from typing import Any


def blocks_to_markdown(content_blocks: list[dict[str, Any]] | None) -> str:
    if not content_blocks:
        return ""

    lines: list[str] = []

    for block in content_blocks:
        if not isinstance(block, dict):
            continue
        btype = str(block.get("type") or "paragraph").lower()

        if btype == "heading":
            t = str(block.get("text") or "").strip()
            if t:
                lines.append(f"### {t}\n")

        elif btype == "subheading":
            t = str(block.get("text") or "").strip()
            if t:
                lines.append(f"#### {t}\n")

        elif btype == "paragraph":
            t = str(block.get("text") or "").strip()
            if t:
                lines.append(f"{t}\n")

        elif btype == "bullet_list":
            for item in block.get("items") or []:
                s = str(item).rstrip()
                if s:
                    lines.append(s if s.startswith(("-", "*", " ")) else f"- {s}")
            lines.append("")

        elif btype == "equation":
            latex = (block.get("latex") or block.get("text") or "")
            latex = str(latex).strip().lstrip("$").rstrip("$").strip()
            if latex:
                lines.append(f"\n$$\n{latex}\n$$\n")

        elif btype == "table":
            table_str = str(block.get("markdown_table") or block.get("text") or "").strip()
            if table_str:
                lines.append(f"\n{table_str}\n")

        elif btype == "code":
            lang = str(block.get("language") or "").strip()
            body = str(block.get("text") or "")
            lines.append(f"```{lang}\n{body.rstrip()}\n```\n")

        else:
            t = str(block.get("text") or "").strip()
            if t:
                lines.append(f"{t}\n")

    return "\n".join(lines).strip()
