#!/usr/bin/env python3
"""Exporteer Claude Code-sessies naar leesbare Markdown — project-agnostisch.

Canonieke, gedeelde versie (D:\\Git\\_VScode-scripts). Draai het vanuit (of met
``cwd`` in) een git-repo; het script:

1. bepaalt de repo-root via ``git rev-parse --git-common-dir`` (werkt ook in een
   worktree),
2. vindt daarmee de Claude-sessiemap ``~/.claude/projects/<geëncodeerd-pad>/``,
3. zoekt in de repo een bestaande ``copilot-chats``-map (``doc/`` óf ``docs/``,
   ook genest) en schrijft de export naar ``<die map>/exports/``. Bestaat er geen,
   dan valt hij terug op ``<repo>/doc/copilot-chats/exports/``.

Bestandsnaam = ``YYYY-MM-DD-<titel>.md``; de titel komt automatisch uit de sessie
(Claude Code's ``ai-title``, anders de eerste prompt), of via ``--title``.

Gebruiker- en assistentteksten komen letterlijk mee; tool-aanroepen als compacte
``🔧``-annotaties (hun output niet); interne redeneerblokken weggelaten.

Voorbeelden:
    python export-claude-chats.py --latest --title mijn-onderwerp
    python export-claude-chats.py --all            # idempotent (slaat bestaande over)
    python export-claude-chats.py --all --force    # her-exporteer alles
    python export-claude-chats.py --session <id> --summary
"""

from __future__ import annotations

import argparse
import io
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── Repo- en projectmap-detectie ─────────────────────────────────────────────


def _encode_project_path(path: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "-", path)


def _git_main_repo_root() -> Path | None:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--git-common-dir"],
            stderr=subprocess.DEVNULL, text=True,
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    if not out:
        return None
    common = Path(out)
    if not common.is_absolute():
        common = (Path.cwd() / common).resolve()
    if common.name == ".git":
        return common.parent
    return common.parent if common.parent != common else common


def _projects_base() -> Path:
    return Path.home() / ".claude" / "projects"


def find_project_dir(explicit: str | None) -> Path:
    base = _projects_base()
    if explicit:
        d = Path(explicit)
        if not d.is_absolute():
            d = base / explicit
        if not d.is_dir():
            sys.exit(f"Opgegeven --project-dir bestaat niet: {d}")
        return d

    root = _git_main_repo_root()
    candidates: list[str] = []
    if root is not None:
        raw_variants = {str(root), str(root).replace("/", "\\"), str(root).replace("\\", "/")}
        for raw in raw_variants:
            enc = _encode_project_path(raw)
            candidates.append(enc)
            if enc[:1].isalpha():
                candidates.append(enc[:1].lower() + enc[1:])
                candidates.append(enc[:1].upper() + enc[1:])

    if base.is_dir():
        existing = {p.name: p for p in base.iterdir() if p.is_dir()}
        for cand in candidates:
            if cand in existing:
                return existing[cand]
        lower = {name.lower(): p for name, p in existing.items()}
        for cand in candidates:
            if cand.lower() in lower:
                return lower[cand.lower()]
        if root is not None:
            token = _encode_project_path(root.name).lower()
            hits = [p for name, p in existing.items() if token in name.lower()]
            if len(hits) == 1:
                return hits[0]
            if len(hits) > 1:
                namen = ", ".join(sorted(p.name for p in hits))
                sys.exit("Meerdere projectmappen matchen; kies met --project-dir. "
                         f"Kandidaten: {namen}")

    hint = f"\nBeschikbaar onder {base}:\n  " + "\n  ".join(
        sorted(p.name for p in base.iterdir() if p.is_dir())) if base.is_dir() \
        else f"\n(map {base} bestaat niet)"
    sys.exit("Kon de Claude-projectmap niet bepalen; geef --project-dir op." + hint)


def _under(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def _chats_dir(repo_root: Path) -> Path:
    """Bepaal de ``copilot-chats``-map (met ``doc/`` of ``docs/``, ook genest).

    - Staat dit script **in** de repo (kopie-in-project, optie B), dan bepalen we
      de map deterministisch t.o.v. de scriptmap (``<scripts>/../(docs|doc)/
      copilot-chats``) — zo klopt het ook bij een genest deelproject.
    - Draait het als **gedeeld** script (buiten de repo, optie A), dan zoeken we
      in de repo naar een bestaande ``copilot-chats`` en kiezen de actief
      gebruikte (meeste exports; bij gelijkspel de ondiepste).
    - Niets gevonden → ``<repo>/doc/copilot-chats``.
    """
    script = Path(__file__).resolve()
    if _under(script, repo_root):
        base = script.parent.parent
        for name in ("docs", "doc"):
            cand = base / name / "copilot-chats"
            if cand.is_dir():
                return cand
        return base / "doc" / "copilot-chats"

    skip = {".git", "node_modules", ".venv", "venv", "__pycache__", "build", "dist"}
    hits = [p for p in repo_root.rglob("copilot-chats")
            if p.is_dir() and not any(part in skip for part in p.parts)]
    if hits:
        def score(p: Path):
            exp = p / "exports"
            n = len(list(exp.glob("*.md"))) if exp.is_dir() else 0
            return (n, -len(p.parts))     # meeste exports, dan ondiepste
        hits.sort(key=score, reverse=True)
        return hits[0]
    return repo_root / "doc" / "copilot-chats"


# ── Sessie inlezen + renderen ────────────────────────────────────────────────


def _iter_records(jsonl_path: Path):
    with io.open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def _tool_hint(block: dict) -> str:
    naam = block.get("name", "?")
    inp = block.get("input", {}) or {}
    hint = (inp.get("description") or inp.get("file_path") or inp.get("pattern")
            or inp.get("skill") or "")
    if not hint and naam == "TodoWrite":
        hint = "takenlijst bijgewerkt"
    hint = str(hint).replace("\n", " ").strip()
    if len(hint) > 110:
        hint = hint[:107] + "..."
    return (f"> 🔧 `{naam}` — {hint}" if hint else f"> 🔧 `{naam}`") + "\n"


def _strip_reminders(tekst: str) -> str:
    return re.sub(r"<system-reminder>.*?</system-reminder>", "", tekst, flags=re.S).strip()


def _is_ruis(tekst: str) -> bool:
    t = tekst.strip()
    if not t:
        return True
    return t.startswith(("<system-reminder>", "<command-", "<local-command-", "Caveat:"))


def _first_meta(jsonl_path: Path) -> tuple[str, str]:
    datum = datetime.fromtimestamp(jsonl_path.stat().st_mtime, tz=timezone.utc).strftime("%Y-%m-%d")
    branch = ""
    for rec in _iter_records(jsonl_path):
        if rec.get("type") == "user" and not rec.get("isMeta"):
            ts = rec.get("timestamp")
            if ts:
                try:
                    datum = datetime.fromisoformat(ts.replace("Z", "+00:00")).strftime("%Y-%m-%d")
                except ValueError:
                    pass
            branch = rec.get("gitBranch", "") or ""
            break
    return datum, branch


def render_session(jsonl_path: Path, session_id: str) -> str:
    datum, branch = _first_meta(jsonl_path)
    blokken: list[str] = []
    beurt = 0
    for rec in _iter_records(jsonl_path):
        rtype = rec.get("type")
        content = (rec.get("message") or {}).get("content")
        if rtype == "user" and not rec.get("isMeta"):
            teksten: list[str] = []
            if isinstance(content, str):
                teksten.append(content)
            elif isinstance(content, list):
                for blok in content:
                    if isinstance(blok, dict) and blok.get("type") == "text":
                        teksten.append(blok.get("text", ""))
            for t in teksten:
                t = _strip_reminders(t)
                if _is_ruis(t):
                    continue
                beurt += 1
                blokken.append(f"\n---\n\n## 👤 Gebruiker ({beurt})\n\n{t}\n")
        elif rtype == "assistant" and isinstance(content, list):
            for blok in content:
                if not isinstance(blok, dict):
                    continue
                if blok.get("type") == "text":
                    t = blok.get("text", "").strip()
                    if t:
                        blokken.append(f"\n**🤖 Claude:**\n\n{t}\n")
                elif blok.get("type") == "tool_use":
                    blokken.append(_tool_hint(blok))
    branch_regel = f"\n> - **Branch:** `{branch}`" if branch else ""
    kop = ("# Claude Code-sessie-export\n\n"
           "> **Let op:** export van een **Claude Code**-sessie. Gebruiker- en "
           "assistentteksten zijn letterlijk overgenomen; tool-aanroepen staan als "
           "compacte `🔧`-annotaties (hun output niet); interne redeneerblokken "
           "weggelaten.\n>\n"
           f"> - **Datum:** {datum}\n"
           f"> - **Sessie-id:** `{session_id}`"
           f"{branch_regel}\n")
    return kop + "".join(blokken) + "\n"


# ── Naamgeving, dedup, samenvatting ──────────────────────────────────────────


def _slugify(tekst: str, maxlen: int = 60) -> str:
    tekst = re.sub(r"[^a-z0-9]+", "-", tekst.strip().lower()).strip("-")
    if len(tekst) > maxlen:
        tekst = tekst[:maxlen].rsplit("-", 1)[0]
    return tekst


def _derive_title(jsonl_path: Path) -> str | None:
    ai_title = None
    first_user = None
    for rec in _iter_records(jsonl_path):
        t = rec.get("type")
        if t == "ai-title" and rec.get("aiTitle"):
            ai_title = rec["aiTitle"]
        elif first_user is None and t == "user" and not rec.get("isMeta"):
            content = (rec.get("message") or {}).get("content")
            txt = ""
            if isinstance(content, str):
                txt = content
            elif isinstance(content, list):
                for blok in content:
                    if isinstance(blok, dict) and blok.get("type") == "text":
                        txt = blok.get("text", ""); break
            txt = _strip_reminders(txt)
            if txt and not _is_ruis(txt):
                first_user = " ".join(txt.split()[:9])
    return ai_title or first_user


def _output_stem(jsonl_path: Path, session_id: str, title: str | None) -> str:
    datum, _ = _first_meta(jsonl_path)
    if not title:
        title = _derive_title(jsonl_path)
    slug = _slugify(title) if title else ""
    return f"{datum}-{slug}" if slug else f"{datum}-claude-{session_id[:8]}"


def _already_exported_ids(out_dir: Path) -> set[str]:
    ids: set[str] = set()
    pat = re.compile(r"\*\*Sessie-id:\*\*\s*`([0-9a-fA-F-]+)`")
    for md in out_dir.glob("*.md"):
        try:
            m = pat.search(md.read_text(encoding="utf-8")[:600])
        except OSError:
            continue
        if m:
            ids.add(m.group(1))
    return ids


def _write_summary_stub(summaries_dir: Path, stem: str, jsonl_path: Path,
                        session_id: str, title: str | None) -> Path | None:
    dst = summaries_dir / f"{stem}.md"
    if dst.exists():
        return None                       # nooit een handgeschreven samenvatting overschrijven
    datum, branch = _first_meta(jsonl_path)
    template = summaries_dir.parent / "templates" / "chat-summary-template.md"
    body = template.read_text(encoding="utf-8") if template.exists() else "# Chat-samenvatting\n"
    titel = title or _derive_title(jsonl_path) or f"claude-{session_id[:8]}"
    body = body.replace("- Datum:", f"- Datum: {datum}", 1)
    body = body.replace("- Titel:", f"- Titel: {titel}", 1)
    body = body.replace("- Bestandstamnaam:", f"- Bestandstamnaam: {stem}", 1)
    body = body.replace("- Gerelateerde export:", f"- Gerelateerde export: ../exports/{stem}.md", 1)
    if branch:
        body = body.replace("- Gerelateerde branch/commit:", f"- Gerelateerde branch/commit: {branch}", 1)
    summaries_dir.mkdir(parents=True, exist_ok=True)
    dst.write_text(body, encoding="utf-8", newline="\n")
    return dst


# ── CLI ──────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="Exporteer Claude Code-sessies naar Markdown.")
    sel = parser.add_mutually_exclusive_group()
    sel.add_argument("--session", metavar="ID", help="Session-id (bestandsnaam zonder .jsonl)")
    sel.add_argument("--latest", action="store_true", help="Meest recent gewijzigde sessie (default)")
    sel.add_argument("--all", action="store_true", help="Alle sessies van dit project")
    parser.add_argument("--title", help="Titelslug (alleen bij één sessie); anders auto uit ai-title")
    parser.add_argument("--project-dir", help="Override ~/.claude/projects/<...> map")
    parser.add_argument("--out-dir", help="Output-map (default: <repo>/(doc|docs)/copilot-chats/exports)")
    parser.add_argument("--summary", action="store_true", help="Maak ook een samenvattingsstub (nooit overschrijven)")
    parser.add_argument("--force", action="store_true", help="Bij --all: ook bestaande exports overschrijven")
    args = parser.parse_args()

    project_dir = find_project_dir(args.project_dir)
    sessions = sorted(project_dir.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not sessions:
        sys.exit(f"Geen sessies (*.jsonl) gevonden in {project_dir}")

    if args.all:
        gekozen = sessions
        if args.title:
            sys.exit("--title kan niet met --all (elke sessie krijgt een eigen naam).")
    elif args.session:
        pad = project_dir / f"{args.session}.jsonl"
        if not pad.exists():
            sys.exit(f"Sessie niet gevonden: {pad}")
        gekozen = [pad]
    else:
        gekozen = [sessions[0]]

    repo_root = _git_main_repo_root() or Path.cwd()
    chats_dir = _chats_dir(repo_root)
    out_dir = Path(args.out_dir) if args.out_dir else chats_dir / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)

    skip_ids = _already_exported_ids(out_dir) if (args.all and not args.force) else set()

    for pad in gekozen:
        session_id = pad.stem
        if session_id in skip_ids:
            print(f"overgeslagen (al geëxporteerd): {session_id[:8]}")
            continue
        markdown = render_session(pad, session_id)
        stem = _output_stem(pad, session_id, args.title)
        dst = out_dir / f"{stem}.md"
        dst.write_text(markdown, encoding="utf-8", newline="\n")
        try:
            shown = dst.relative_to(repo_root)
        except ValueError:
            shown = dst
        print(f"geëxporteerd: {shown}")
        if args.summary:
            stub = _write_summary_stub(chats_dir / "summaries", stem, pad, session_id, args.title)
            if stub is not None:
                try:
                    print(f"  samenvattingsstub: {stub.relative_to(repo_root)}")
                except ValueError:
                    print(f"  samenvattingsstub: {stub}")


if __name__ == "__main__":
    main()
