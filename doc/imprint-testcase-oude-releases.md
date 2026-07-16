# Testcase Imprint: oude releases en versies blijven benaderbaar

**Aanvrager:** MusicBrain-project · **Datum:** 2026-07-16 ·
**Aanleiding:** de gen-2-hardwarerelease (`cortex-v0.2`) verving de
gepubliceerde gen-1-set. Bitemporaal CMS = niets raakt kwijt; dat willen
we als test vastgelegd zien.

## Gegeven

1. Component `adc8` met specs `adc8@v1.2` (gen 1) en `adc8@v2.0` (gen 2),
   beide via de ingest-API gepost (met assets: render, overview, pinouts).
2. Release A (`modular-mb@v0.2`, 2026-07-11) pint `adc8@v1.2`.
3. Release B (`cortex-v0.2`, 2026-07-16) pint `adc8@v2.0`.

## Verwacht (asserts)

1. **Release-lijst**: `GET /api/content/releases` bevat ná het posten van
   release B nog steeds release A (geen vervanging, geen verdwijning).
2. **Component-versies**: `GET /api/content/components/adc8` toont beide
   versies met hun spec-verwijzing.
3. **Oude spec**: de board-spec `adc8@v1.2` blijft opvraagbaar en zijn
   asset-URL's (content-hashed, bv.
   `/api/assets/adc8/v1.2/render-top.<hash>.png`) blijven HTTP 200 geven —
   óók nadat v2.0 met een nieuwe render is geïngest.
4. **Site-weergave**: de componentpagina toont de versie die de nieuwste
   (stable-)release pint; oudere versies zijn via de release/het
   versie-archief bereikbaar (UI-kant — invulling aan Imprint).

## Waarnemingen 2026-07-16 (musicbrain.nl, ter referentie)

- Na `cortex-v0.2`: `modular-mb v0.2` staat nog in de release-lijst ✓;
  `adc8` toont `v1.2` + `v2.0` ✓.
- Niet gecontroleerd: assert 3 (oude hashed asset-URL) — het ongehashte
  pad geeft uiteraard 404; de echte URL staat in de v1.2-spec.
- `cortex-v0.1` bestaat alleen lokaal (nooit live gepost) — geen regressie.
