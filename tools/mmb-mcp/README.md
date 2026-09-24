# mmb-mcp — de editor als MCP-tools

MCP-server (stdio) die de patch-recept-logica van de editor aanbiedt aan
Claude Code, Claude Desktop of een andere MCP-host. Ontwerp:
doc/plans/recept-tools-en-mcp.md.

## Installeren en testen

```
cd tools/mmb-mcp
npm install
npm run smoke      # start de server op een tijdelijk project en doet een paar tool-calls
```

## Gebruik in Claude Code

`.mcp.json` in de repo-root registreert de server als `mmb`. Claude Code
vraagt bij het openen van het project eenmalig of hij hem mag starten.
Daarna, in een sessie:

> Bouw een 8-stemmige patch met een wavetable-oscillator, een ladder-filter
> en een diode-compressor op de bus, en zet er een LFO op de cutoff.

Claude roept dan `list_module_types`, `compile_recipe`, `build_patch`,
`add_modulation` aan. Het resultaat staat in `tools/mmb-mcp/project.json`
(of het pad uit `--project` / `MMB_PROJECT`). Laad dat in de editor via
**Import**. Andersom: exporteer uit de editor en laat Claude `load_project`
aanroepen op dat bestand.

## Claude Desktop

Zelfde command in `claude_desktop_config.json`:

```json
{ "mcpServers": { "mmb": {
  "command": "node",
  "args": ["D:/Git/Muziek/MusicBrain/tools/mmb-mcp/node_modules/tsx/dist/cli.mjs",
           "D:/Git/Muziek/MusicBrain/tools/mmb-mcp/src/server.ts",
           "--project", "D:/Git/Muziek/MusicBrain/tools/mmb-mcp/project.json"]
} } }
```

## Tools

Lezen: `list_module_types`, `get_module_type`, `list_patches`,
`get_patch_summary`, `compile_recipe`, `get_project_path`.
Wijzigen: `build_patch`, `set_voices`, `replace_module`, `add_bus_fx`,
`add_modulation`, `set_active_patch`, `load_project`, `save_project`.

De definities staan in `editor/src/modular-mb/recipe/tools.ts` en zijn
dezelfde als die de browser-editor aan DeepSeek/OpenAI geeft (function
calling). De server importeert de editor-TS rechtstreeks via `tsx`; er is
geen build en geen kopie van de logica.

## Nog niet

Een live brug naar de draaiende browser-editor (websocket). Nu gaat het via
het project-JSON.
