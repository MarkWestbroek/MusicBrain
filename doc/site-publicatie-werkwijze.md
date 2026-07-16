# Borden publiceren naar de site (lokaal + live) — werkwijze

Voor élke bordenset in dit repo (Cortex/modular én Reflex/guitar-switcher).
Geschreven 2026-07-17 na de gen-2-publicatie; de valkuilen hieronder zijn
allemaal écht gebeurd.

## Het model in één zin

De site (Imprint) kent **componenten** (een bord), **board-specs**
(component@versie, met assets), een **product** (verzameling componenten)
en **releases** (pinnen component-versies aan een productversie). De
release-/productpagina's tonen wat de release pint; de componentpagina
toont alle versies uit `component.versions[]`.

## De twee doelen

| doel | base | token |
|---|---|---|
| lokaal | `http://localhost:3000` | `test-ingest-token-123` |
| live | `https://musicbrain.nl` | `INGEST_TOKEN` uit `hardware/kicad-generators/.env` |

Het `.env` (met `INGEST_TOKEN` en `IMPRINT_BASE`) is **gitignored** — nooit
committen, nooit in chatuitvoer echoën. Laden zonder tonen:

```bash
cd hardware/kicad-generators
set -a; . ./.env; set +a     # daarna $INGEST_TOKEN / $IMPRINT_BASE gebruiken
```

## Stap 0 — assets genereren (per bord, na elke bordwijziging)

```bash
cd hardware/kicad-generators
B=gswitch-loop8   # mapnaam onder hardware/schematics/
D=../schematics/$B
python make_overzicht.py  $D/$B.kicad_pcb                      # callout-json uit het bord
python board_overview.py  $D/$B.kicad_pcb $D/$B-overzicht.json $D/$B-overzicht.svg
mkdir -p $D/pinouts && python pinout_svg.py $D/$B.kicad_pcb --alle -o $D/pinouts
python widget_export.py   $D/$B.kicad_pcb --out $D/$B-widget.json
```

(De render-PNG maakt `publish_board.py` zelf, bijgesneden op dezelfde marge
als de widget-hotspots.)

## Stap 1+2 — component + board-spec posten

```bash
python publish_board.py $D/$B.kicad_pcb \
    --component <slug> --version <vN.M> \
    --base <base> --token <token>       # + evt. --dry om eerst te kijken
```

Conventies:
- **slug** = korte naam zonder `musicbrain-`-prefix (Reflex: `gswitch-brain`,
  `gswitch-loop8`).
- **versie** = de bord-rev uit het titelblok, als `vN.M` (borden N.M,
  software x.y.z — besluit Mark 2026-07-16).
- Draai het commando **twee keer**: eenmaal lokaal, eenmaal live.

De response bevat sinds 2026-07-17 `pinned_by: [...]` — **is die lijst
leeg, dan verschijnt de nieuwe versie op geen enkele productpagina** en
moet stap 3+4 nog (dat was de "waarom zie ik niets?"-valkuil).

## Stap 3+4 — product koppelen + release pinnen

`publish_release.py` doet beide; het recept-blok bovenin (PROJECT, VERSIE,
PINS, HIGHLIGHTS) is de release-definitie en staat in git. Voor Reflex:
pas het blok aan (PROJECT `reflex`, PINS = gswitch-borden) of kopieer het
script naar een reflex-variant.

```bash
python publish_release.py <base> <token>
```

Check eerst wat er al staat (slugs/versies verschillen soms van je
verwachting — live heette de eerste modular-release `modular-mb@v0.2`):

```bash
curl -s <base>/api/content/releases | python -m json.tool
curl -s <base>/api/content/components/<slug>
```

## Fout gepost? Terugtrekken (tombstone)

```bash
python publish_release.py <base> <token> --withdraw <release-slug>
# of los: curl -X DELETE <base>/api/content/release/<slug> -H "Authorization: Bearer <token>"
```

Bitemporaal: historie blijft, herstel via admin → History → Restore.
Hernoemen bestaat niet — terugtrekken + opnieuw posten onder de goede slug.
Let op de versiereeks vóór je post (dubbele "v0.2" in de release-lijst was
de les van 2026-07-16).

## Controleren

- `npm run testcase:bitemporal -- <base> <component>@<versie>` (in de
  Imprint-repo): oude spec + assets blijven bereikbaar.
- Silk-URL's (`musicbrain.nl/hw/<slug>`) werken via een 308-alias; die
  moet eenmalig in de Imprint-admin (→ Site) aangezet zijn.

## Naslag

- Volledige API-keten: `imprint-engine/docs/mmb-ingest-guide.md` (§6 =
  terugtrekken).
- Vraag & antwoord juli 2026: `doc/imprint-vragen-2026-07.md`.
- Alles-in-één-alternatief: `publish_product.mjs` (zelfde keten, hele set
  in één run; leest `.env` automatisch). ⚠ De default `--assets-dir` wijst
  naar `D:\Git\imprint-engine\...`, maar de Imprint-repo staat op
  `D:\Git\Web\Imprint-engine\...` — geef
  `--assets-dir "D:/Git/Web/Imprint-engine/sites/musicbrain/public/boards"`
  mee, anders "geen render-PNG gevonden". Een bestaande release bijwerken
  (zelfde versie, extra bord) = gewoon opnieuw posten met dezelfde
  `--release proj@vN.M` en de volledige boardset (2026-07-17: zo is
  gswitch-loop8sh aan guitar-switcher-v0.1 toegevoegd).
