# Requirements — `Documentation` ContentItem (voor bord-documentatie)

Opgesteld vanuit het **hardware/KiCad-spoor** (MusicBrain) als eisenpakket op
het Imprint-contentmodel. Doel: de bord-informatie die wij machinaal
genereren (renders, aansluitoverzichten, pinouts, pin→net-data, README-proza,
fab-status) **met minimale beheerlast** op de site krijgen en in sync houden
met de KiCad-bron. Sluit aan op UML (`ContentItem` → `Documentation`, hangend
onder `Product`/`Component`) en op `packages/content-core/src/schemas.ts`.

Wij (de toolkit in `hardware/kicad-generators/`) leveren de data; Imprint
bepaalt opslag en weergave. Nummering `D*` naar analogie van W*/S*.

## Plaatsing in het model

- **Een bord = een `Component`** (herbruikbaar bouwblok; de busboard *bevat*
  modules via `children`). Een enkele module kan ook een `Product` zijn.
- `Documentation` is een **ContentItem-subtype** (UML: `title` + `/content`)
  dat aan een **subject** hangt: `{ type: "component" | "product", slug }`.
  Zo hangt het "onder al die dingen" (UML) zonder aparte relaties per type.
- **Eén huidige `Documentation` per subject**; revisies via de bestaande
  bitemporal-store (`putItem` superseedt, historie gratis — S4). Bordrevisie
  (bijv. busboard rev 2.0) is een **veld**, niet een aparte content-slug.

## Wat het moet kunnen bevatten

De toolkit produceert dit al; het schema moet het kwijt kunnen:

1. **Identiteit** — subject-slug, `boardRev` (bijv. "2.0"), `status`
   (orderable | deprecated | wip; parallel aan `ProductStatus`), afmetingen
   (`widthMm`/`heightMm`), `layers`.
2. **Gestructureerde connector-data** (de bron van waarheid): lijst van
   connectors, elk `{ ref, label, footprint, rows (1|2), pins: [{ pin, net }] }`.
   Hieruit leidt de site zowel pin-tabellen als de keuze diagram/tabel af —
   niet dubbel opslaan. (Wij lezen dit rechtstreeks uit het `.kicad_pcb`.)
3. **Asset-referenties** — 3D-render boven/onder (PNG), aansluitoverzicht
   (SVG), en **per connector een pinout-diagram (SVG)**. Zie D3/D10.
4. **Board-widget-config** — `image` + `points[]{x,y,label,markdown|svgRef}` +
   `mode`. Afleidbaar uit (2)+(3), zodat een pagina een `board`-widget kan
   neerzetten die de Documentation leest i.p.v. geplakte JSON (D4).
5. **Vrije secties** — geordende markdown-blokken (de README-proza: wat het
   is, koppel-contract, firmware-mapping, waarschuwingen). Per sectie
   `{ heading, markdown }`.
6. **Fab/bestel-info** — verwijzing naar het fab-pakket (zip), JLC-notities,
   BOM-hoogtepunten; optioneel prijs/besteldatum (vgl. `MODULES.md`).
7. **Relaties** — verwante borden (riser ↔ front-paren), links naar
   schema-/PCB-PDF.

## Functionele requirements

- **D1** `Documentation` valideert tegen een zod-schema bij schrijven (als alle
  content); nieuw ContentType `"documentation"` in `store.ts` + `schemas.ts`.
- **D2** Connector-data (2) is **first-class** in het schema, niet als losse
  markdown — tabellen én diagrammen leiden uit één bron af.
- **D3** Assets (renders, overzicht-SVG, pinout-SVG's) via een **stabiele
  adressering** per (subject, revisie, assetnaam), bijv.
  `/<assetroot>/<slug>/<rev>/pinout-J1.svg`. De site refereert aan URL's, niet
  aan inline blobs (behalve waar embedden logisch is, zie D10).
- **D4** Uit een `Documentation` is een **`board`-widget-config afleidbaar**
  (server-side), zodat een pagina alleen het subject hoeft te noemen; geen
  handmatige JSON-plak meer. (De huidige plak-route blijft als fallback.)
- **D5** **Ingestie-API**: een geauthenticeerd **write-endpoint** waar de
  toolkit naartoe POST. Idempotent per (subject, revisie): opnieuw posten
  overschrijft de huidige assertie (nieuwe versie in de historie). Backend
  valideert, slaat assets op, herschrijft asset-refs naar URL's, en doet
  `putItem("documentation", slug, data)`.
- **D6** **Assets mogen mee in de POST.** SVG's zijn tekst → mogen inline in de
  JSON **of** als multipart-bestanden; PNG's als multipart. Eén request draagt
  de hele set (multipart/form-data: veld `doc` = JSON + files). Ruime
  size-limiet (aansluitoverzicht-SVG ~350 KB door de ingebedde render;
  reken op enkele MB per bord).
- **D7** **Opslagkeuze is aan de backend.** Op Plesk + MariaDB nu: **assets als
  bestand** op schijf (een beheerde asset-map), metadata + het
  `Documentation`-record in de DB. Géén MinIO nu — maar de opslag achter een
  **interface** (`AssetStore.put(path, bytes) -> url`), zodat MinIO/S3 later
  een config-wissel is, niet een herschrijving (vgl. de ContentStore-splitsing
  file vs DB).
- **D8** **Versionering**: `boardRev` + de bitemporal historie; een nieuwe
  revisie posten laat de oude als historie staan (S4). De site toont standaard
  de huidige revisie.
- **D9** **Weergave met lage auteurlast**: de site kan een `Documentation`
  als (deel van een) pagina renderen — aansluitoverzicht + pinouts + secties —
  grotendeels automatisch, zonder per bord een layout te componeren.
- **D10** **Pinout-diagram als hotspot-inhoud** (idee Mark): de meeste headers
  zijn dubbelrijig; onze pinout-SVG's mimicken dat al. Het per-punt-payload
  van de `board`-widget moet daarom **een asset-ref (SVG) kunnen zijn** als
  alternatief voor de markdown-tabel — mooier, en al gegenereerd. Schema:
  `points[].svgRef?` naast `points[].markdown?` (één van beide).

## Niet-functioneel / randvoorwaarden

- **Beheerlast minimaal**: alles gegenereerd + gePOST, niet met de hand
  bijgehouden; regenereren is idempotent (D5). De studio-plak-route blijft
  bestaan voor incidentele hand-edits.
- **Auth**: de toolkit houdt een **deploy-token** (env, niet in git); het
  write-endpoint accepteert alleen dat token (of admin-sessie). Geen publieke
  schrijftoegang.
- **Meertaligheid**: `lang` als bij andere content. Bord-data (tabellen,
  pinouts) is grotendeels taalneutraal; alleen de proza-secties (5) zijn
  eventueel per taal.
- **Bord ≈ taalneutrale kern + vertaalbare proza**: overweeg de connector- en
  asset-velden taalneutraal te houden en alleen `sections[]` per `lang`.

## Concreet voorstel voor de ingestie (ter afstemming)

```
POST /api/ingest/board            (auth: Bearer <deploy-token>)
Content-Type: multipart/form-data
  doc     = <JSON: Documentation zonder asset-URL's, met assetnamen>
  files   = render-top.png, overview.svg, pinout-J1.svg, …
->  backend: valideer doc-schema → AssetStore.put elk bestand →
    vervang assetnamen door URL's → putItem("documentation", slug, data)
->  200 { slug, rev, assets: {name: url} }
```

De toolkit-kant hiervan schrijf ik zodra het schema + endpoint vaststaan
(`hardware/kicad-generators/publish_board.py`: bestaat al aan data-kant via
`widget_export.py`/`board_overview.py`/`pinout_svg.py` — alleen de POST + de
schema-mapping ontbreken nog).

## Wat er nu al klaarligt (data-kant)

Per bord in `hardware/schematics/<bord>/`:
`<bord>-overzicht.svg` (aansluitoverzicht), `pinouts/J*.svg` (per connector,
dubbelrij + nok), `<bord>-widget.json` (widget-config), README-proza, fab-zip.
Renders komen uit `kicad-cli pcb render`; alles reproduceerbaar uit het
`.kicad_pcb`. De connector-data (D2) lees ik met `pinout_svg.lees_connector()`.
