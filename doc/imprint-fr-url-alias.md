# Feature request Imprint: URL-alias per contenttype

**Aanvrager:** MusicBrain-project · **Datum:** 2026-07-16

## Aanleiding

De MusicBrain-borden dragen een silk-opdruk met een korte URL, bijvoorbeeld
`musicbrain.nl/hw/adc8`. Kort moet, want silk-tekst is 1,5 mm hoog en het
bord is smal. Het werkelijke pad op de site is echter
`https://musicbrain.nl/components/adc8` — `component` is het contenttype,
`hw` bestaat niet. De opdruk staat straks onuitwisbaar op geproduceerde
printplaten, dus de korte vorm moet blijvend werken.

## Voorstel

Een configureerbare **URL-alias per contenttype** in de site-config:

```yaml
contentTypes:
  component:
    alias: hw        # /hw/<slug> -> /components/<slug>
```

> **Status 2026-07-17**: geïmplementeerd door Imprint als **308-redirect**
> — zelfde permanente semantiek als de gevraagde 301, akkoord. Live na de
> Plesk-pull + alias via admin → Site.

## Gewenst gedrag

1. `GET /hw/<slug>` beantwoordt met een **permanente redirect** (301 of
   308 — beide voldoen) naar `/components/<slug>` (canoniek pad blijft
   het contenttype-pad; geen duplicate content).
2. Onbekende slug onder de alias → gewone 404.
3. Meerdere aliassen per type mogen (array), maar één is genoeg.
4. Alias geldt alleen voor de detailpagina's; de overzichtspagina
   (`/components`) heeft geen alias nodig.

## Acceptatie

- `https://musicbrain.nl/hw/adc8` → 308 (of 301) → `https://musicbrain.nl/components/adc8`
- geldt voor alle dertien (straks meer) gepubliceerde borden zonder
  per-bord-configuratie.

## Context

De silk-URL's staan in de KiCad-generators
(`hardware/kicad-generators/gen_*.py`, patroon `musicbrain.nl/hw/<naam>`)
en op alle gen-2-borden van de renovatie van 2026-07.
