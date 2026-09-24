# Recept-tools en MCP-server — ontwerpdocument

Datum: 2026-09-24. Ticket-prefix: **ED-RC-5** (tools + function calling in de
editor) en **ED-RC-6** (MCP-server). Vervolg op doc/plans/patch-recept.md.

## Waarom

De AI-knop in de commandoregel (ED-RC-3) stuurt bij elke vraag een vaste
context mee: de catalogustabel, het commandoschema en een samenvatting van
de actieve patch. Dat is klein (een paar duizend tokens) en de systeemprompt
wordt door DeepSeek en OpenAI als prefix gecachet, dus kosten en snelheid
zijn geen probleem. Het wordt wél een probleem zodra het model méér moet
weten: poorten en knoppen van een specifieke module, meerdere patches, of
een reeks bewerkingen in één vraag. Dan groeit een vooraf meegestuurde
prompt hard.

De oplossing is het model te laten **ophalen** wat het nodig heeft in plaats
van alles vooraf te duwen: tools. Dezelfde tools dienen twee hosts:

1. **In de editor** (browser, eigen key): DeepSeek/OpenAI function calling.
   De lus draait in de browser; leestools worden direct uitgevoerd,
   wijzigende tools worden als voorstel verzameld en pas na "Toepassen"
   uitgevoerd (preview-first blijft).
2. **MCP-server** voor Claude Code / Claude Desktop: dezelfde tools over
   stdio, werkend op een project-JSON. Dat is Marks huidige werkwijze
   ("vraag een chat om een seed") maar dan met de editor-logica als hand,
   en met een model dat de code en de docs kan lezen.

MCP is geen geheugen tussen API-aanroepen; het is een protocol waarmee een
agent-host tools aanroept. Ook daar gaat elke beurt het gesprek opnieuw mee.
De winst zit in *on demand* context en in acties.

## Eén toolmodule, twee hosts (ED-RC-5)

`editor/src/modular-mb/recipe/tools.ts` definieert de tools als JSON-schema
(OpenAI-functieformaat = MCP-`inputSchema`) en implementeert ze puur:
`runTool(project, name, args) → { content, project? }`. Geen DOM, geen
localStorage, geen React, zodat Node ze ook kan draaien.

| Tool | Soort | Doet |
|------|-------|------|
| `list_module_types` | lezen | catalogustabel: type-id, korte naam, soort, aliassen |
| `get_module_type` | lezen | poorten (richting, signaal, eventKind) en knoppen (bereik, default, standen) van één type |
| `list_patches` | lezen | patches in het project, welke actief is |
| `get_patch_summary` | lezen | actieve (of gegeven) patch: modules met poly-status en cv-ingangen, master-kabels |
| `compile_recipe` | lezen | droogloop van een recept: samenvatting, waarschuwingen, aantal stappen, of de fout |
| `set_active_patch` | wijzigen | maak een patch actief |
| `build_patch` | wijzigen | recept → nieuwe patch (compileRecipe + applyOps) |
| `set_voices` | wijzigen | ×N poly / mono op de actieve patch |
| `replace_module` | wijzigen | vervang module (woord, alias of id) door een ander type |
| `add_bus_fx` | wijzigen | effect vóór OUT |
| `add_modulation` | wijzigen | LFO/envelope op een cv-ingang |

Wijzigende tools zijn één-op-één de `Command`s van de parser; `commands.ts`
(`runCommand`) is de gedeelde uitvoerlaag. In de browser worden ze niet
uitgevoerd maar verzameld; de lus houdt een lokale kopie van het project
bij waarop de voorstellen al zijn toegepast, zodat een volgende leestool
("hoe ziet de patch er nu uit?") het voorlopige resultaat ziet.

De commandoregel toont de voorstellen als lijst met de uitleg van het
model; "Toepassen" voert ze in volgorde uit als één undo-stap. Bestaat het
voorstel uit één nieuwe patch, dan werkt "Demonstreer" ook.

Instelling `mode` (⚙): `tools` (default) of `json` (de oude ene-JSON-modus,
voor modellen zonder function calling).

## MCP-server (ED-RC-6)

`tools/mmb-mcp/`: kleine Node-server (stdio) op het officiële
`@modelcontextprotocol/sdk`, gestart met `tsx` zodat hij de editor-TS
rechtstreeks importeert (geen build, geen kopie van de logica).

- **Staat**: een project-JSON (`--project <pad>`, default
  `tools/mmb-mcp/project.json`). Bestaat het niet, dan leeg project +
  internals. Elke wijzigende tool schrijft het bestand terug. In de editor
  laad je het via Import; andersom exporteer je uit de editor naar dat pad.
- **Extra tools**: `load_project(path)`, `save_project(path)`.
- **Registratie**: `.mcp.json` in de repo-root, zodat Claude Code de server
  in dit project kent (`mmb`). Claude Desktop: zelfde command in zijn
  config.
- **Test**: `tools/mmb-mcp/smoke.mjs` start de server, doet `initialize`,
  `tools/list` en een paar `tools/call`s over stdio.

Niet in scope: een live brug naar de draaiende browser-editor (websocket).
Dat is de logische volgende stap als het bestand heen-en-weer gaat irriteren;
de TeensyLink-bridge is er het voorbeeld voor.

## Bestanden

- `editor/src/modular-mb/recipe/commands.ts` — `runCommand` (uit CommandPalette gehaald).
- `editor/src/modular-mb/recipe/tools.ts` — tooldefinities + `runTool`, `commandForTool`, `summarizePatch`.
- `editor/src/modular-mb/recipe/tools.test.ts`
- `editor/src/modular-mb/recipe/llm.ts` — `askLlmWithTools` (function-calling-lus), `mode`-instelling.
- `editor/src/modular-mb/recipe/CommandPalette.tsx` — voorstellenlijst, mode-keuze.
- `tools/mmb-mcp/package.json`, `src/server.ts`, `smoke.mjs`, `README.md`
- `.mcp.json`

## Status

| Onderdeel | Status |
|-----------|--------|
| ED-RC-5 tools + function calling | gebouwd 2026-09-24 (lus met gemockte fetch getest) |
| ED-RC-6 MCP-server | gebouwd 2026-09-24 (smoke-test over stdio) |
| Live tegen DeepSeek | open |
| Websocket-brug naar de browser | open |
