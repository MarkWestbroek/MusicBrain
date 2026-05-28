#!/usr/bin/env python3
from __future__ import annotations
"""
Kopieer de chat-export scripts naar een ander project.

Gebruik:
    python scripts/update-chat-export.py <pad-naar-doel-project>

Wat wordt gekopieerd:
    scripts/export-copilot-chats.py   — hoofdscript (zelfconfigurerend)
    scripts/run-chat-backup.ps1       — PowerShell wrapper
    scripts/install-chat-hook.ps1     — git hook installer
    scripts/pre-commit-chat-export    — de git pre-commit hook

Wat wordt bijgewerkt:
    .vscode/tasks.json                — chat-export taken worden erin samengevoegd

Het hoofdscript is zelfconfigurerend: het leest de project root
automatisch uit zijn eigen locatie, er is geen aanpassing nodig.
"""

import json
import os
import shutil
import sys

# Relatieve paden t.o.v. de projectroot die worden gekopieerd
SCRIPT_FILES = [
    "scripts/export-copilot-chats.py",
    "scripts/run-chat-backup.ps1",
    "scripts/install-chat-hook.ps1",
    "scripts/pre-commit-chat-export",
]

# VS Code tasks die worden toegevoegd/bijgewerkt in .vscode/tasks.json
CHAT_EXPORT_TASKS = [
    {
        "label": "Export Copilot Chats",
        "type": "shell",
        "command": "powershell",
        "args": [
            "-ExecutionPolicy", "Bypass",
            "-File", "${workspaceFolder}/scripts/run-chat-backup.ps1"
        ],
        "group": "none",
        "presentation": {
            "reveal": "always",
            "panel": "dedicated",
            "clear": True
        },
        "problemMatcher": []
    },
    {
        "label": "Export Copilot Chats (force)",
        "type": "shell",
        "command": "powershell",
        "args": [
            "-ExecutionPolicy", "Bypass",
            "-File", "${workspaceFolder}/scripts/run-chat-backup.ps1",
            "-Force"
        ],
        "group": "none",
        "presentation": {
            "reveal": "always",
            "panel": "dedicated",
            "clear": True
        },
        "problemMatcher": []
    },
    {
        "label": "Install Copilot Chat Hook",
        "type": "shell",
        "command": "powershell",
        "args": [
            "-ExecutionPolicy", "Bypass",
            "-File", "${workspaceFolder}/scripts/install-chat-hook.ps1"
        ],
        "group": "none",
        "presentation": {
            "reveal": "always",
            "panel": "dedicated",
            "clear": True
        },
        "problemMatcher": []
    },
]


def merge_tasks_json(tasks_path: str) -> None:
    """Voeg de chat-export taken toe aan het bestaande tasks.json (of maak het aan)."""
    if os.path.isfile(tasks_path):
        with open(tasks_path, "r", encoding="utf-8") as f:
            tasks_data = json.load(f)
    else:
        tasks_data = {"version": "2.0.0", "tasks": []}

    existing_tasks: list = tasks_data.setdefault("tasks", [])
    existing_labels = {t.get("label") for t in existing_tasks}

    added = []
    updated = []
    for new_task in CHAT_EXPORT_TASKS:
        label = new_task["label"]
        if label in existing_labels:
            for i, t in enumerate(existing_tasks):
                if t.get("label") == label:
                    existing_tasks[i] = new_task
                    updated.append(label)
                    break
        else:
            existing_tasks.append(new_task)
            added.append(label)

    os.makedirs(os.path.dirname(tasks_path), exist_ok=True)
    with open(tasks_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(tasks_data, f, indent=4, ensure_ascii=False)
        f.write("\n")

    for label in added:
        print(f"  Taak toegevoegd:    {label}")
    for label in updated:
        print(f"  Taak bijgewerkt:    {label}")


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        print("Gebruik: python scripts/update-chat-export.py <pad-naar-doel-project>")
        sys.exit(1)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    source_root = os.path.dirname(script_dir)

    target_root = os.path.abspath(sys.argv[1])
    if not os.path.isdir(target_root):
        print(f"Fout: doelmap niet gevonden: {target_root}")
        sys.exit(1)

    target_name = os.path.basename(target_root)
    print(f"Bron:  {source_root}")
    print(f"Doel:  {target_root}  ({target_name})")
    print()

    # Kopieer scripts
    for rel_path in SCRIPT_FILES:
        src = os.path.join(source_root, rel_path)
        dst = os.path.join(target_root, rel_path)

        if not os.path.isfile(src):
            print(f"  WAARSCHUWING: bronbestand niet gevonden: {rel_path}")
            continue

        os.makedirs(os.path.dirname(dst), exist_ok=True)
        action = "Bijgewerkt" if os.path.exists(dst) else "Nieuw    "
        shutil.copy2(src, dst)
        print(f"  {action}: {rel_path}")

    # Maak export-map aan
    export_dir = os.path.join(target_root, "doc", "copilot-chats", "exports")
    if not os.path.isdir(export_dir):
        os.makedirs(export_dir, exist_ok=True)
        print(f"  Aangemaakt:  doc/copilot-chats/exports/")

    # Merge .vscode/tasks.json
    print()
    tasks_path = os.path.join(target_root, ".vscode", "tasks.json")
    merge_tasks_json(tasks_path)

    print()
    print("Klaar.")
    print()
    print("Volgende stappen:")
    print(f"  cd {target_root}")
    print("  python scripts/export-copilot-chats.py          # eerste export testen")
    print("  powershell scripts/install-chat-hook.ps1        # git hook installeren (optioneel)")


if __name__ == "__main__":
    main()
