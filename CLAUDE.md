# MusicBrain — werkafspraken voor agents

Kort en concreet; achtergrond staat in de gelinkte documenten.

## Ingangen

- Publieke ingang en routes: [README.md](README.md). Leeswijzer van de docmap: [doc/README.md](doc/README.md).
- Hardware (KiCad): eerst [doc/site-publicatie-werkwijze.md](doc/site-publicatie-werkwijze.md) lezen.
- Open werk: [doc/BACKLOG.md](doc/BACKLOG.md); wat er per versie bijkwam: [doc/RELEASE-LOG.md](doc/RELEASE-LOG.md).

## Na een nieuwe of gewijzigde module (firmware, wasm of editorpaneel)

De firmware is leidend voor poorten en controls. Draai altijd, in deze volgorde:

```powershell
python tools/contract_dump.py            # firmware → firmware/app-modular-brain/contract/module-types.json
cd editor; npm test                      # contract-test: paneel en seeds tegen het contract
npm run catalog                          # regenereert doc/module-catalogus.md
```

Daarna: release-notitie in `doc/RELEASE-LOG.md` en, als het gedrag voor gebruikers verandert, de betreffende uitleg in `doc/` of `editor/README.md`. Een module is pas klaar als de catalogus en de release-log mee zijn.

## Documentatie

- Lokale Markdown-links worden in CI gecontroleerd: `python tools/check_md_links.py` (0 kapot is de eis).
- Een ingehaald document krijgt bovenaan een kort actueel-blok met datum en verwijzing; verwijder de oude tekst niet, maar laat een lezer niet raden wat geldt.
- Nieuw document in `doc/`: opnemen in [doc/README.md](doc/README.md).

## Git

- Meerdere sessies werken tegelijk in deze boom. Bekijk voor het stagen `git diff` per hunk en stage alleen eigen hunks (`git add -p` of losse paden); commit geen werk van een ander mee.
- Commit alleen als daarom gevraagd is.
