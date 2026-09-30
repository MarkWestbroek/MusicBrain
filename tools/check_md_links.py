#!/usr/bin/env python3
"""Controleert lokale Markdown-links op een bestaand doel.

Loopt over alle door git gevolgde .md-bestanden en volgt inline-links en
afbeeldingen (`[tekst](doel)`, `![alt](doel)`). Externe links (http, https,
mailto), pure anchors (`#kop`) en `<...>`-URL's worden overgeslagen. Van een
lokaal doel wordt alleen gecontroleerd of het bestand of de map bestaat;
anchors binnen een bestand worden niet gecontroleerd.

Gebruik:  python tools/check_md_links.py [--verbose] [pad ...]
Exitcode 1 bij een of meer kapotte links (zo draait hij in CI).
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent

# Mappen die geëxporteerde chats of gearchiveerd materiaal bevatten: links
# daarin zijn geen documentatie en worden niet gerepareerd.
SKIP_DIRS = ("doc/ai-chats/", "doc/old-code/", "node_modules/", ".pio/")

LINK_RE = re.compile(r"!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+\"[^\"]*\")?\s*\)")
FENCE_RE = re.compile(r"^(```|~~~)")


def tracked_md(paths: list[str]) -> list[Path]:
    args = ["git", "-C", str(ROOT), "ls-files", "-z", "--", *(paths or ["*.md", "**/*.md"])]
    out = subprocess.run(args, check=True, capture_output=True).stdout.decode()
    files = [ROOT / p for p in out.split("\0") if p.endswith(".md")]
    return [f for f in files if not any(s in f.relative_to(ROOT).as_posix() + "/" for s in SKIP_DIRS)]


def links_in(md: Path):
    in_fence = False
    for lineno, line in enumerate(md.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        if FENCE_RE.match(line.strip()):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        # inline code weglaten: daar staan vaak voorbeeldpaden in
        line = re.sub(r"`[^`]*`", "", line)
        for m in LINK_RE.finditer(line):
            yield lineno, m.group(1).strip("<>")


def is_external(target: str) -> bool:
    return bool(re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target)) or target.startswith("//")


def check(files: list[Path], verbose: bool) -> int:
    broken = 0
    total = 0
    for md in files:
        for lineno, target in links_in(md):
            if not target or target.startswith("#") or is_external(target):
                continue
            total += 1
            path_part = unquote(target.split("#", 1)[0].split("?", 1)[0])
            if not path_part:
                continue
            dest = (ROOT if path_part.startswith("/") else md.parent) / path_part.lstrip("/")
            if not dest.exists():
                broken += 1
                print(f"{md.relative_to(ROOT).as_posix()}:{lineno}: kapot -> {target}")
            elif verbose:
                print(f"ok   {md.relative_to(ROOT).as_posix()}:{lineno} -> {target}")
    print(f"{len(files)} bestanden, {total} lokale links, {broken} kapot")
    return 1 if broken else 0


if __name__ == "__main__":
    argv = sys.argv[1:]
    verbose = "--verbose" in argv
    paths = [a for a in argv if not a.startswith("--")]
    sys.exit(check(tracked_md(paths), verbose))
