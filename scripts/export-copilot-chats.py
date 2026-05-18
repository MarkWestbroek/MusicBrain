#!/usr/bin/env python3
from __future__ import annotations

"""
Export VS Code Copilot Chat sessies naar leesbare Markdown bestanden.

Zoekt de JSONL chat-sessiebestanden in VS Code's workspace storage
en converteert ze naar Markdown in doc/copilot-chats/exports/.

Gebruik:
    python3 scripts/export-copilot-chats.py

Draait vanuit de root van MusicBrain/.
"""

import json
import os
import sys
import glob
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlparse


def decode_file_uri(value: str) -> str:
    """Zet een file:// URI om naar een lokaal pad als dat nodig is."""
    if not isinstance(value, str):
        return ""
    if not value.startswith("file://"):
        return value

    parsed = urlparse(value)
    path = unquote(parsed.path or "")
    if re.match(r"^/[A-Za-z]:", path):
        path = path[1:]
    return path.replace("/", os.sep)


def workspace_contains_project(workspace_meta: dict, project_path: str) -> bool:
    """Check of een workspace naar dit project verwijst, ook bij multi-root workspaces."""
    needle = project_path.replace("\\", "/").lower().rstrip("/")
    candidate_paths = []

    for key in ("folder", "workspace"):
        value = workspace_meta.get(key)
        if isinstance(value, str):
            candidate_paths.append(decode_file_uri(value))

    for folder in workspace_meta.get("folders", []):
        if isinstance(folder, dict) and isinstance(folder.get("path"), str):
            candidate_paths.append(decode_file_uri(folder["path"]))

    workspace_ref = workspace_meta.get("workspace")
    workspace_file = decode_file_uri(workspace_ref) if isinstance(workspace_ref, str) else ""
    if workspace_file and os.path.isfile(workspace_file):
        try:
            with open(workspace_file, "r", encoding="utf-8") as wf:
                nested_workspace = json.load(wf)
            for folder in nested_workspace.get("folders", []):
                if isinstance(folder, dict) and isinstance(folder.get("path"), str):
                    candidate_paths.append(decode_file_uri(folder["path"]))
        except (json.JSONDecodeError, IOError):
            pass

    for candidate in candidate_paths:
        normalized = candidate.replace("\\", "/").lower().rstrip("/")
        if needle and needle in normalized:
            return True
    return False


def find_workspace_storage_dirs(project_path: str) -> list[str]:
    """Vind VS Code workspace storage directories voor dit project."""
    vscode_storage = os.path.expanduser(
        "~/Library/Application Support/Code/User/workspaceStorage"
    )
    if not os.path.isdir(vscode_storage):
        # Windows pad
        appdata = os.environ.get("APPDATA", "")
        vscode_storage = os.path.join(appdata, "Code", "User", "workspaceStorage")
    if not os.path.isdir(vscode_storage):
        # Linux pad
        vscode_storage = os.path.expanduser(
            "~/.config/Code/User/workspaceStorage"
        )
    if not os.path.isdir(vscode_storage):
        print("Kan VS Code workspace storage niet vinden.")
        return []

    matches = []
    for entry in os.listdir(vscode_storage):
        ws_json = os.path.join(vscode_storage, entry, "workspace.json")
        if os.path.isfile(ws_json):
            try:
                with open(ws_json, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if workspace_contains_project(data, project_path):
                    matches.append(os.path.join(vscode_storage, entry))
            except (json.JSONDecodeError, IOError):
                continue
    return sorted(set(matches))


def _extract_text_from_response_list(response_list: list) -> list[str]:
    """Extraheer tekst-items uit een response-lijst (response-field of streaming chunks)."""
    texts = []
    for r in response_list:
        if not isinstance(r, dict):
            continue
        r_kind = r.get("kind", "")
        r_val = r.get("value", "")
        if isinstance(r_val, str) and r_val.strip():
            if r_kind in ("", "markdownContent") or "supportThemeIcons" in r:
                texts.append(r_val)
    return texts


def replay_jsonl_state(filepath: str) -> dict:
    """
    Replay een JSONL state-journal naar bruikbare conversatie-data.

    VS Code slaat chatsessies op als append-only JSONL:
    - kind=0: volledige snapshot (initieel, requests is meestal leeg)
    - kind=1: scalar patches (user input, titels, metadata)
    - kind=2: list patches (request markers, response parts)

    We extraheren user berichten en assistant responses uit de patches.

    Strategie voor response-tekst:
    - Request markers (requestId) bevatten een geconsolideerd 'response'-veld met de
      volledige finale assistent-tekst (inclusief tekst na tool-calls).
    - Losse streaming chunks in kind=2 patches bevatten tussentijdse fragmenten.
    - We gebruiken het geconsolideerde response-veld als primaire bron en vallen
      terug op streaming chunks als dat veld leeg is.
    """
    session_header = None
    messages = []
    current_response_parts = []      # streaming chunks (fallback)
    current_consolidated = []        # geconsolideerde response uit marker (primair)
    current_request_id = None
    latest_generated_title = ""
    first_message_timestamp = 0

    def flush_pending_response() -> None:
        """Voeg de lopende assistent-response toe als bericht."""
        # Gebruik geconsolideerde marker-response als die gevuld is, anders streaming chunks.
        resp_parts = current_consolidated if current_consolidated else current_response_parts
        if resp_parts:
            messages.append({
                "role": "assistant",
                "text": "".join(resp_parts)
            })
        current_consolidated.clear()
        current_response_parts.clear()

    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue

            kind = obj.get("kind")
            v = obj.get("v")

            if kind == 0:
                session_header = v or {}
                for key in ("customTitle", "sessionTitle", "generatedTitle", "title"):
                    value = session_header.get(key, "")
                    if isinstance(value, str) and value.strip():
                        cleaned = " ".join(value.split()).strip()
                        session_header[key] = cleaned
                        if key == "generatedTitle":
                            latest_generated_title = cleaned
                        break
                continue

            if kind == 1:
                patch_path = obj.get("k", [])
                if isinstance(patch_path, list) and patch_path:
                    patch_key = patch_path[-1]
                    if patch_key in ("customTitle", "sessionTitle", "generatedTitle", "title"):
                        if isinstance(v, str) and v.strip():
                            cleaned = " ".join(v.split()).strip()
                            session_header = session_header or {}
                            session_header[patch_key] = cleaned
                            if patch_key == "generatedTitle":
                                latest_generated_title = cleaned
                continue

            if kind == 2 and isinstance(v, list):
                patch_key = obj.get("k", [])

                # Live streaming patches: k=['requests', N, 'response']
                if (
                    isinstance(patch_key, list)
                    and len(patch_key) == 3
                    and patch_key[0] == "requests"
                    and isinstance(patch_key[1], int)
                    and patch_key[2] == "response"
                ):
                    for item in v:
                        if not isinstance(item, dict):
                            continue
                        item_kind = item.get("kind", "")
                        item_val = item.get("value", "")
                        if isinstance(item_val, str) and item_val.strip():
                            if item_kind in ("", "markdownContent") or "supportThemeIcons" in item:
                                if not current_consolidated:
                                    current_response_parts.append(item_val)
                    continue

                for item in v:
                    if not isinstance(item, dict):
                        continue

                    timestamp = item.get("timestamp")
                    if isinstance(timestamp, (int, float)) and timestamp > 0:
                        first_message_timestamp = (
                            timestamp
                            if not first_message_timestamp
                            else min(first_message_timestamp, timestamp)
                        )

                    generated_title = item.get("generatedTitle", "")
                    if isinstance(generated_title, str) and generated_title.strip():
                        latest_generated_title = " ".join(generated_title.split()).strip()

                    if "requestId" in item:
                        flush_pending_response()
                        current_request_id = item["requestId"]

                        msg_data = item.get("message", {})
                        if isinstance(msg_data, dict):
                            user_text = msg_data.get("text", "")
                        elif isinstance(msg_data, str):
                            user_text = msg_data
                        else:
                            user_text = ""
                        if user_text.strip():
                            messages.append({
                                "role": "user",
                                "text": user_text.strip()
                            })

                        consolidated = _extract_text_from_response_list(
                            item.get("response", [])
                        )
                        if consolidated:
                            current_response_parts.clear()
                            current_consolidated.extend(consolidated)

                    elif "value" in item and isinstance(item["value"], str):
                        item_kind = item.get("kind", "")
                        if (item_kind in ("", "markdownContent")
                                or "supportThemeIcons" in item):
                            if not current_consolidated:
                                current_response_parts.append(item["value"])

    flush_pending_response()

    if not session_header:
        session_header = {}

    if latest_generated_title and not session_header.get("generatedTitle"):
        session_header["generatedTitle"] = latest_generated_title

    if first_message_timestamp:
        session_header["_first_timestamp"] = first_message_timestamp

    session_header["_extracted_messages"] = messages
    return session_header


def extract_messages(session: dict) -> list[dict]:
    """
    Extraheer user/assistant berichten uit een chat-sessie.

    Returns: lijst van {"role": "user"|"assistant", "text": str}
    """
    return session.get("_extracted_messages", [])


def resolve_session_datetime(session: dict, filepath: str | None = None) -> datetime | None:
    """Bepaal een bruikbare sessiedatum, met fallback op bericht-timestamps en bestandstijd."""
    for key in ("creationDate", "lastUpdatedDate", "_first_timestamp"):
        value = session.get(key, 0)
        if isinstance(value, (int, float)) and value > 0:
            timestamp = value / 1000 if value > 10_000_000_000 else value
            try:
                return datetime.fromtimestamp(timestamp)
            except (ValueError, OSError, OverflowError):
                continue

    if filepath and os.path.exists(filepath):
        try:
            return datetime.fromtimestamp(os.path.getmtime(filepath))
        except (ValueError, OSError, OverflowError):
            return None

    return None


def build_session_title(session: dict, messages: list[dict], session_id: str) -> str:
    """Gebruik bij voorkeur de echte sessietitel uit VS Code, met fallback naar het eerste user-bericht."""
    for key in ("customTitle", "sessionTitle", "generatedTitle", "title"):
        value = session.get(key, "")
        if isinstance(value, str):
            cleaned = " ".join(value.split()).strip()
            if cleaned:
                if len(cleaned) > 80:
                    return cleaned[:80].rstrip() + "..."
                return cleaned

    first_user = next((m["text"] for m in messages if m["role"] == "user"), "")
    title = first_user[:80].replace("\n", " ").strip()
    if len(first_user) > 80:
        title += "..."
    if title:
        return title
    return session_id[:8]


def slugify_title(title: str, max_length: int = 60) -> str:
    """Normaliseer een titel naar een nette bestandsnaam-slug, inclusief accenten zoals é -> e."""
    if not isinstance(title, str):
        return ""

    normalized = unicodedata.normalize("NFKD", title)
    ascii_title = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_title.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)

    if max_length > 0 and len(slug) > max_length:
        truncated = slug[:max_length].rstrip("-")
        word_boundary = truncated.rfind("-")
        if word_boundary >= max(8, max_length // 2):
            truncated = truncated[:word_boundary]
        slug = truncated.rstrip("-")

    return slug


def session_to_markdown(session: dict, session_id: str, source_path: str | None = None) -> str:
    """Converteer een chat-sessie naar leesbaar Markdown."""
    created_dt = resolve_session_datetime(session, source_path)
    if created_dt:
        date_str = created_dt.strftime("%Y-%m-%d %H:%M")
    else:
        date_str = "onbekend"

    messages = extract_messages(session)
    if not messages:
        return ""

    title = build_session_title(session, messages, session_id)

    lines = [
        f"# Chat: {title}",
        f"",
        f"- **Datum**: {date_str}",
        f"- **Sessie-ID**: `{session_id}`",
        f"- **Berichten**: {len(messages)}",
        f"",
        f"---",
        f"",
    ]

    for msg in messages:
        if msg["role"] == "user":
            lines.append(f"## 🧑 User\n")
        else:
            lines.append(f"## 🤖 Assistant\n")
        lines.append(msg["text"])
        lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Exporteer VS Code Copilot chatsessies naar Markdown.")
    parser.add_argument(
        "--force", "-f",
        action="store_true",
        help="Exporteer alle sessies opnieuw, ook als ze al up-to-date lijken.",
    )
    args = parser.parse_args()
    force = args.force

    # Bepaal project root (één niveau boven scripts/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)  # MusicBrain/

    export_dir = os.path.join(project_root, "doc", "copilot-chats", "exports")
    os.makedirs(export_dir, exist_ok=True)

    # Zoek workspace storage dirs voor MusicBrain
    ws_dirs = find_workspace_storage_dirs("MusicBrain")
    if not ws_dirs:
        print("Geen VS Code workspace storage gevonden voor MusicBrain.")
        sys.exit(1)

    print(f"Gevonden workspace storage directories: {len(ws_dirs)}")
    if force:
        print("  (--force actief: alle sessies worden opnieuw geëxporteerd)")

    exported = 0
    skipped = 0

    for ws_dir in ws_dirs:
        chat_dir = os.path.join(ws_dir, "chatSessions")
        if not os.path.isdir(chat_dir):
            continue

        for jsonl_file in glob.glob(os.path.join(chat_dir, "*.jsonl")):
            session_id = os.path.basename(jsonl_file).replace(".jsonl", "")

            session = replay_jsonl_state(jsonl_file)
            if not session:
                print(f"  Overgeslagen (leeg): {session_id[:8]}")
                skipped += 1
                continue

            messages = extract_messages(session)
            if not messages:
                print(f"  Overgeslagen (geen berichten): {session_id[:8]}")
                skipped += 1
                continue

            created_dt = resolve_session_datetime(session, jsonl_file)
            if created_dt:
                date_prefix = created_dt.strftime("%Y-%m-%d")
            else:
                date_prefix = "onbekend"

            title_for_filename = build_session_title(session, messages, session_id)
            slug = slugify_title(title_for_filename, max_length=60)
            if not slug:
                slug = session_id[:8]

            filename = f"{date_prefix}-{slug}.md"
            filepath = os.path.join(export_dir, filename)

            existing_files = glob.glob(os.path.join(export_dir, "*.md"))
            existing_filepath = None
            existing_msg_count = 0
            for ef in existing_files:
                try:
                    with open(ef, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read(600)
                    if session_id in content:
                        existing_filepath = ef
                        m = re.search(r"\*\*Berichten\*\*:\s*(\d+)", content)
                        if m:
                            existing_msg_count = int(m.group(1))
                        break
                except IOError:
                    continue

            current_msg_count = len(messages)
            needs_filename_update = bool(
                existing_filepath and os.path.basename(existing_filepath) != filename
            )

            jsonl_mtime = os.path.getmtime(jsonl_file)
            export_mtime = os.path.getmtime(existing_filepath) if existing_filepath else 0.0
            jsonl_is_newer = jsonl_mtime > export_mtime

            if (not force
                    and existing_filepath
                    and current_msg_count <= existing_msg_count
                    and not needs_filename_update
                    and not jsonl_is_newer):
                print(f"  Ongewijzigd ({current_msg_count} berichten): {session_id[:8]} → {os.path.basename(existing_filepath)}")
                skipped += 1
                continue

            if existing_filepath:
                if needs_filename_update:
                    filepath = os.path.join(export_dir, filename)
                    counter = 1
                    base_filepath = filepath
                    while os.path.exists(filepath) and os.path.abspath(filepath) != os.path.abspath(existing_filepath):
                        name, ext = os.path.splitext(base_filepath)
                        filepath = f"{name}-{counter}{ext}"
                        counter += 1
                    if current_msg_count > existing_msg_count:
                        action = f"Hernoemd en bijgewerkt ({existing_msg_count}→{current_msg_count} berichten)"
                    else:
                        action = "Hernoemd"
                else:
                    filepath = existing_filepath
                    if current_msg_count > existing_msg_count:
                        action = f"Bijgewerkt ({existing_msg_count}→{current_msg_count} berichten)"
                    elif jsonl_is_newer or force:
                        action = f"Ververst ({current_msg_count} berichten, JSONL bijgewerkt)"
                    else:
                        action = f"Bijgewerkt ({existing_msg_count}→{current_msg_count} berichten)"
            else:
                counter = 1
                base_filepath = filepath
                while os.path.exists(filepath):
                    name, ext = os.path.splitext(base_filepath)
                    filepath = f"{name}-{counter}{ext}"
                    counter += 1
                action = "Geëxporteerd"

            md = session_to_markdown(session, session_id, jsonl_file)
            if md:
                with open(filepath, "w", encoding="utf-8", newline="\n") as f:
                    f.write(md)
                if existing_filepath and os.path.abspath(existing_filepath) != os.path.abspath(filepath):
                    try:
                        os.remove(existing_filepath)
                    except OSError:
                        pass
                print(f"  {action}: {session_id[:8]} → {os.path.basename(filepath)}")
                exported += 1

    export_dir_display = os.path.relpath(export_dir, project_root)
    print(f"\nKlaar: {exported} geëxporteerd/bijgewerkt, {skipped} overgeslagen.")
    print(f"Map:   {export_dir}")


if __name__ == "__main__":
    main()
