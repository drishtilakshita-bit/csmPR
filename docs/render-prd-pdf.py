#!/usr/bin/env python3
"""Render PRD markdown to HTML and PDF (Chrome headless)."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import markdown

DOCS = Path(__file__).resolve().parent
MD_FILE = DOCS / "PRD-customer-success-executive-dashboard.md"
HTML_OUT = DOCS / "PRD-customer-success-executive-dashboard.html"
PDF_OUT = DOCS / "PRD-customer-success-executive-dashboard.pdf"

CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
]


def main() -> int:
    text = MD_FILE.read_text(encoding="utf-8")
    text = re.sub(
        r"```mermaid\n.*?```",
        lambda m: '<pre class="mermaid-fallback"><code>'
        + m.group(0)[10:-3].strip().replace("&", "&amp;").replace("<", "&lt;")
        + "</code></pre>",
        text,
        flags=re.DOTALL,
    )

    md = markdown.Markdown(
        extensions=[
            "markdown.extensions.tables",
            "markdown.extensions.fenced_code",
            "markdown.extensions.nl2br",
        ]
    )
    body = md.convert(text)

    css = """
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           font-size: 10.5pt; line-height: 1.45; color: #111; }
    h1 { font-size: 18pt; border-bottom: 2px solid #16a34a; padding-bottom: 6px; }
    h2 { font-size: 13pt; margin-top: 1.4em; color: #14532d; }
    h3 { font-size: 11pt; }
    table { border-collapse: collapse; width: 100%; margin: 0.8em 0; font-size: 9.5pt; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f4f4f5; }
    img { max-width: 100%; height: auto; page-break-inside: avoid; }
    pre, code { font-size: 8.5pt; }
    pre.mermaid-fallback { background: #f8fafc; padding: 8px; border: 1px solid #e2e8f0; white-space: pre-wrap; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.2em 0; }
    """

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>PRD: Customer Success Executive Dashboard</title>
<style>{css}</style>
</head>
<body>
{body}
</body>
</html>"""

    HTML_OUT.write_text(html, encoding="utf-8")

    chrome = next((c for c in CHROME_CANDIDATES if Path(c).exists()), None)
    if not chrome:
        print("Chrome not found; wrote HTML only:", HTML_OUT, file=sys.stderr)
        return 1

    url = HTML_OUT.as_uri()
    subprocess.run(
        [
            chrome,
            "--headless=new",
            "--disable-gpu",
            f"--print-to-pdf={PDF_OUT}",
            "--no-pdf-header-footer",
            url,
        ],
        check=True,
    )
    print("Wrote:", HTML_OUT)
    print("Wrote:", PDF_OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
