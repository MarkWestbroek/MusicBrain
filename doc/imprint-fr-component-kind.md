# Feature request Imprint: component-soort (kind) — "Board" is niet altijd een bord

**Aanvrager:** MusicBrain-project · **Datum:** 2026-07-17

## Aanleiding

Sinds vandaag staan er ook software-componenten op de site: `editor-cortex`
en `editor-reflex` (de browser-editors, gepind in cortex-v0.3 en
reflex-v0.1). De spec-ingest bleek daar prima voor te werken — lege
`connectors`/`points`, screenshots als renderTop/overview — maar de
componentpagina rendert de versiekop hardcoded als **"Board v0.5.48"**.
Een editor is geen bord.

## Voorstel

Een **soort-veld op het component** (en/of op de spec), default `board`
zodat alles wat er nu staat ongewijzigd blijft:

```jsonc
// component-doc
{ "slug": "editor-cortex", "kind": "software", ... }

// spec-doc (ingest), zelfde veld mag ook hier
{ "slug": "editor-cortex@v0.5.48", "kind": "software", ... }
```

## Gewenst gedrag

1. `kind` ontbreekt → gedrag als nu (`board`); geen migratie nodig.
2. De versiekop op de componentpagina gebruikt een label per soort:
   `board` → "Board", `software` → "Software" (of de naam weglaten en
   alleen "vX.Y.Z" tonen — ook prima).
3. Bord-specifieke UI-delen (connectortabel, pinout-links) blijven
   verborgen wanneer ze leeg zijn — dat doen ze nu al.
4. Soorten zijn een open lijstje (string), geen enum-migratie bij elke
   nieuwe soort; `board` en `software` zijn genoeg voor nu.
5. Bij `kind: software` graag de **renderTop als gewone `<img>`** in
   plaats van via de widget-viewer: die tekent op een canvas en dan speelt
   een geanimeerde GIF niet af (hotspots zijn er toch niet). Workaround nu:
   wij zetten de GIF in het overview-slot, dat al een `<img>` is — met een
   `<img>`-renderTop kan de animatie gewoon de hero zijn.

## Acceptatie

- `https://musicbrain.nl/components/editor-cortex` toont "Software v0.5.48"
  (of neutraal "v0.5.48"), geen "Board".
- `https://musicbrain.nl/components/adc8` blijft exact zoals hij is.

## Context

`publish_software.py` (hardware/kicad-generators) stuurt het veld `kind:
"software"` sinds 2026-07-17 alvast mee in component- én spec-doc. Getest:
de ingest accepteert het (200) maar bewáárt het veld nu niet (GET geeft
geen `kind` terug) — na implementatie draaien wij dus één herpost per
editor-component; daarna loopt het vanzelf mee.
De software-publicatieflow staat beschreven in
`doc/site-publicatie-werkwijze.md` (sectie "Software-componenten").
