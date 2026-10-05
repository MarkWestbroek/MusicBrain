# MusicBrain — werkafspraken voor agents

Kort en concreet; achtergrond staat in de gelinkte documenten.

## Ingangen

- Publieke ingang en routes: [README.md](README.md). Leeswijzer van de docmap: [doc/README.md](doc/README.md).
- Hardware (KiCad): eerst [hardware/kicad-generators/WERKWIJZE.md](hardware/kicad-generators/WERKWIJZE.md) lezen.
- Open werk: [doc/BACKLOG.md](doc/BACKLOG.md); wat er per versie bijkwam: [doc/RELEASE-LOG.md](doc/RELEASE-LOG.md).

## Na een nieuwe of gewijzigde module (firmware, wasm of editorpaneel)

De firmware is leidend voor poorten en controls. Draai altijd, in deze volgorde:

```powershell
python tools/contract_dump.py            # firmware → firmware/app-modular-brain/contract/module-types.json (+ editor/contract-version.json; commit beide)
cd editor; npm test                      # contract-test: paneel en seeds tegen het contract
npm run catalog                          # regenereert doc/module-catalogus.md
```

Daarna: release-notitie in `doc/RELEASE-LOG.md` en, als het gedrag voor gebruikers verandert, de betreffende uitleg in `doc/` of `editor/README.md`. Een module is pas klaar als de catalogus en de release-log mee zijn.

## Patch-front en speelmodus (editor)

Overdracht en bestandenkaart: [doc/plans/patch-front-handover.md](doc/plans/patch-front-handover.md); ontwerp en besluiten: [doc/plans/patch-front.md](doc/plans/patch-front.md) §9.

- Een front is een **view** op de patch: items verwijzen naar `(module, control)` of `(module, poort)`, waarden blijven in `patch.controlState`. Geen eigen waarden, geen kopie.
- Elke controlwijziging loopt via `setPatchControl` (`editor/src/modular-mb/setPatchControl.ts`): poly-fan-out, Teensy-poke en store in één. Geen tweede schrijfpad bouwen; op een front met `{ twins: true }` voor stereoparen.
- De speelmodus blijft klein: patchkeuze, bewaren, Binnenkijken. Nieuwe functies komen achter Binnenkijken of hergebruiken een bestaand onderdeel (zoals `PatchSelect`, `PatchSave`), geen eigen variant.
- Touch-bediening op het paneel en het schermtoetsenbord: `touch-action: none` plus een niet-passieve `touchstart` met `preventDefault`, en geen tik-oplichting. Touch-gedrag op een echte telefoon laten bevestigen; de emulator bootst scrollen niet na.
- Nieuwe klankbron, filter, effect of drum: zet in `editor/src/modular-mb/frontControls.ts` welke knoppen een speler wil (de test eist een lijst). Een keuzeknop (bank, model, ritme) krijgt op het paneel een display met `lookup`, dan staat de naam ook op het front.
- Bestandsnamen in één map mogen niet alleen in hoofdletters verschillen (`editor/src/filenames.test.ts`).

## Documentatie

- Lokale Markdown-links worden in CI gecontroleerd: `python tools/check_md_links.py` (0 kapot is de eis).
- Een ingehaald document krijgt bovenaan een kort actueel-blok met datum en verwijzing; verwijder de oude tekst niet, maar laat een lezer niet raden wat geldt.
- Nieuw document in `doc/`: opnemen in [doc/README.md](doc/README.md).

## Git

- Meerdere sessies werken tegelijk in deze boom. Bekijk voor het stagen `git diff` per hunk en stage alleen eigen hunks (`git add -p` of losse paden); commit geen werk van een ander mee.
- Commit alleen als daarom gevraagd is.
