# Requirements — `board-spec` ContentItem-type (bord-documentatie)

Opgesteld vanuit het **hardware/KiCad-spoor** (MusicBrain) als eisenpakket op
het Imprint-contentmodel. Doel: de bord-informatie die wij machinaal
genereren (renders, aansluitoverzichten, pinouts, pin→net-data, README-proza,
fab-status) **met minimale beheerlast** op de site krijgen en in sync houden
met de KiCad-bron. Sluit aan op UML (`ContentItem`, en de nog vage
`Documentation`) en op `packages/content-core/src/schemas.ts`.

Wij (de toolkit in `hardware/kicad-generators/`) leveren de data; Imprint
bepaalt opslag en weergave. Nummering `D*` naar analogie van W*/S*.

## Plaatsing in het model

- **Een bord = een `Component`** (herbruikbaar bouwblok; de busboard *bevat*
  modules via `children`). Componenten zijn bewust **onafhankelijk** van
  producten: geen compositie, een component kan in meerdere producten
  voorkomen. Wordt een bord los verkocht, dan is dat een **`Product` dat naar
  dat ene component verwijst** — het bord *is* geen product.
- **`Documentation` (UML) = het algemene idee** dat een content-item-type (CIT)
  een ander CIT kan *bevatten/refereren*: X → Y, en A → Y of Z. Eventueel
  beperkt via een **matrix** (welk CIT mag welk bevatten), of vrij kiesbaar.
  Dat is een Imprint-brede ontwerpkeuze; wij hebben er maar één concreet geval
  van nodig:
- **Nieuw CIT `board-spec`** — houdt de SVG's/PNG's + wat tekst van één bord
  vast. Een **`Component` verwijst naar zijn `board-spec`** via een slug,
  precies zoals `Component.children` / `Product.components` / `docs` nu al naar
  slugs verwijzen. **Geen nieuw "subject"-concept** — gewoon een referentie.
- **Versie zit al in het `Component`** (`ComponentVersion`). Een `board-spec`
  draagt dus **geen eigen revisienummer**; de revisie-context komt van het
  component. Open keuze (D8): één `board-spec` per component, of één per
  `ComponentVersion` (bord rev 2.0 = een componentversie).

## Wat een `board-spec` moet kunnen bevatten

De toolkit produceert dit al; het schema moet het kwijt kunnen:

1. **Gestructureerde connector-data**: lijst van connectors, elk
   `{ ref, label, footprint, rows (1|2), pins: [{ pin, net }] }`. Taalneutraal.
   Wij lezen dit rechtstreeks uit het `.kicad_pcb`.
2. **Gerenderde assets**: 3D-render boven/onder (PNG), aansluitoverzicht (SVG),
   en **per connector een pinout-diagram (SVG)**. Zie D3/D10.
3. **Board-widget-config** — `image` + `points[]{x,y,label,markdown|svgRef}` +
   `mode`. Afleidbaar uit (1)+(2), zodat een pagina een `board`-widget kan
   neerzetten die de spec leest i.p.v. geplakte JSON (D4).
4. **Vrije secties** — geordende blokken `{ heading, markdown }` (de
   README-proza: wat het is, koppel-contract, firmware-mapping,
   waarschuwingen). **Vertaalbaar** (D-taal).
5. **Fab/bestel-info** — verwijzing naar het fab-pakket (zip), JLC-notities,
   BOM-hoogtepunten; optioneel status/afmetingen/lagen als die niet al in het
   component staan.
6. **Relaties** — verwante borden (riser ↔ front-paren), links naar
   schema-/PCB-PDF. Via component-slug-referenties.

## Functionele requirements

- **D1** Nieuw ContentType `"board-spec"` in `store.ts` + zod-schema in
  `schemas.ts`; valideert bij schrijven zoals alle content. Een `Component`
  krijgt een referentie naar zijn spec (bijv. `spec?: slug`, of via het
  bestaande `docs`-mechanisme).
- **D2** **Beide opslaan**: de gestructureerde connector-data (1) **én** de
  gerenderde pinout-SVG's (2). Ze worden **samen** uit dezelfde KiCad-bron
  gegenereerd, dus kunnen niet uit de pas lopen; de site kiest per weergave
  tabel (uit 1) of diagram (uit 2).
- **D3** Assets via een **stabiele adressering** per (component[, versie],
  assetnaam), bijv. `/<assetroot>/<component-slug>/<rev>/pinout-J1.svg`. De
  site refereert aan URL's (behalve waar embedden logisch is, D10).
- **D4** Uit een `board-spec` is een **`board`-widget-config afleidbaar**
  (server-side), zodat een pagina alleen het component/de spec hoeft te noemen;
  geen handmatige JSON-plak meer. (De plak-route blijft als fallback.)
- **D5** **Ingestie-API**: een geauthenticeerd **write-endpoint** waar de
  toolkit naartoe POST. Idempotent per (component[, versie]): opnieuw posten
  superseedt de huidige assertie (nieuwe versie in de historie). Backend
  valideert, slaat assets op, herschrijft asset-refs naar URL's, en doet
  `putItem("board-spec", slug, data)`.
- **D6** **Assets mogen mee in de POST.** SVG's zijn tekst → inline in de JSON
  **of** als multipart-bestanden; PNG's als multipart. Eén request draagt de
  hele set. Ruime size-limiet (aansluitoverzicht-SVG ~350 KB door de ingebedde
  render; reken op enkele MB per bord).
- **D7** **Opslagkeuze is aan de backend.** Op Plesk + MariaDB nu: **assets als
  bestand** op schijf (beheerde asset-map), metadata + het `board-spec`-record
  in de DB. Géén MinIO nu — maar de opslag achter een **interface**
  (`AssetStore.put(path, bytes) -> url`), zodat MinIO/S3 later een config-wissel
  is, niet een herschrijving (vgl. de ContentStore-splitsing file vs DB).
- **D8** **Versionering via het `Component`** (`ComponentVersion`) + de
  bitemporal historie (S4). Open keuze: één `board-spec` per component (documenteert
  de huidige revisie) óf één per `ComponentVersion`. Aanbeveling: **per
  ComponentVersion**, zodat oude revisies hun eigen renders/pinouts houden.
- **D9** **Weergave met lage auteurlast**: de site kan een `board-spec` als
  (deel van een) pagina renderen — aansluitoverzicht + pinouts + secties —
  grotendeels automatisch, zonder per bord een layout te componeren.
- **D10** **Pinout-diagram als hotspot-inhoud** (idee Mark): de meeste headers
  zijn dubbelrijig; onze pinout-SVG's mimicken dat al. Het per-punt-payload van
  de `board`-widget moet daarom **een asset-ref (SVG) kunnen zijn** als
  alternatief voor de markdown-tabel — mooier, en al gegenereerd. Schema:
  `points[].svgRef?` naast `points[].markdown?` (één van beide).

## Niet-functioneel / randvoorwaarden

- **Meertaligheid, naar keuze** (D-taal): op ~alle content mogelijk, maar
  optioneel per veld. **Taalneutraal** blijft: connector-data, netnamen
  (MISO/MOSI), pinout-diagrammen, renders. **Vertaalbaar**: de proza-secties
  (4) en labels/uitleg. Model: houd de technische kern taalneutraal en laat
  alleen de tekstvelden per `lang` variëren (bijv. `sections` per taal, of een
  vertaallaag zoals de rest van de content).
- **Beheerlast minimaal**: alles gegenereerd + gePOST, niet met de hand
  bijgehouden; regenereren is idempotent (D5). De studio blijft beschikbaar
  voor incidentele hand-edits.
- **Auth**: de toolkit houdt een **deploy-token** (env, niet in git); het
  write-endpoint accepteert alleen dat token (of admin-sessie). Geen publieke
  schrijftoegang.

## Concreet voorstel voor de ingestie (ter afstemming)

```
POST /api/ingest/board-spec        (auth: Bearer <deploy-token>)
Content-Type: multipart/form-data
  doc     = <JSON: board-spec zonder asset-URL's, met assetnamen +
             de component-slug/versie waaraan het hangt>
  files   = render-top.png, overview.svg, pinout-J1.svg, …
->  backend: valideer board-spec-schema → AssetStore.put elk bestand →
    vervang assetnamen door URL's → putItem("board-spec", slug, data)
->  200 { slug, rev, assets: {name: url} }
```

De toolkit-kant hiervan (`hardware/kicad-generators/publish_board.py`) schrijf
ik zodra het schema + endpoint vaststaan. De **data-generatie staat al**:
`widget_export.py` (widget-config), `board_overview.py` (aansluitoverzicht),
`pinout_svg.py` (per connector + `lees_connector()` voor de connector-data D1).
Alleen de schema-mapping + de POST ontbreken nog.

## Wat er nu al klaarligt (data-kant)

Per bord in `hardware/schematics/<bord>/`:
`<bord>-overzicht.svg` (aansluitoverzicht), `pinouts/J*.svg` (per connector,
dubbelrij + nok), `<bord>-widget.json` (widget-config), README-proza, fab-zip.
Renders uit `kicad-cli pcb render`; alles reproduceerbaar uit het `.kicad_pcb`.
