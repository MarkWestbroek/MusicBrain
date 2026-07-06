# MusicBrain — Design-brief: logo, stijl, look & feel

> Startdocument voor de ontwerpsessie (grafisch-designer-rol). Gebaseerd op
> het merkfundament in [brand-positioning-plan.md](brand-positioning-plan.md)
> §3. Een eerste visuele proeve van richting A staat in de HTML-one-pager
> (artifact bij deze sessie).

---

## 1. Opdracht

Ontwerp een merkidentiteit die werkt op vier heel verschillende dragers:
1. **Web** (site + browser-editor) — dark mode is het thuisland.
2. **Eurorack-panelen** (Synapse/Cortex) — 2–20 HP, gefreesd/gezeefdrukt,
   vaak maar 5 mm ruimte voor een merkje.
3. **Pedaal-/rack-behuizing** (Reflex/Relay) — leesbaar op donkere podia.
4. **Social/avatar** — herkenbaar op 32×32 px.

Eis die hieruit volgt: het logo moet een **monogram/merkteken** hebben dat
zonder woordmerk werkt, in één kleur, ook gefreesd (dus: geen gradients of
dunne haarlijnen in het merkteken zelf).

## 2. Persoonlijkheid → vormtaal

| Merkwaarde | Vertaling in vorm |
|---|---|
| Nuchter-slim, engineering-eerlijk | Geometrisch, gridmatig, geen skeuomorfisme |
| Muzikant-eerst, analog-heilig | Warmte via één accentkleur en ronde vormen, niet via texturen |
| Open source | Niets "gesloten glossy"; documentatie-esthetiek mag doorschemeren |
| Geheugen/brein | Het centrale beeldmotief — maar níet het cliché-hersenplaatje |

## 3. Drie logorichtingen (uit te werken)

**A. "Patch-brain" (voorkeur).** Een brein gesuggereerd door
patch-punten (jacks/nodes) verbonden met kabelbogen — half
neuraal netwerk, half patchkabels. Reduceerbaar tot 3–5 nodes +
2 bogen voor klein gebruik. Werkt gefreesd (cirkels + lijnen).

**B. "M-golf."** Monogram M waarvan de middenvorm een CV-staptrap/
square-wave is (verwijst naar de scope en naar gates). Strak,
techy, zeer klein bruikbaar; minder "brein".

**C. "Hemisfeer-jack."** Cirkel (jack-bus, bovenaanzicht) waarvan
de binnenring een halve breinomtrek vormt. Subtiel, chic; risico
dat de brein-lezing verdwijnt op klein formaat.

Per richting opleveren: merkteken, woordmerk-lockup (horizontaal +
gestapeld), 1-kleurs variant, freesbare variant, favicon/avatar-crop.

## 4. Kleur (voorstel, te valideren met contrastcheck)

Dark-first palet; de accentkleur is het "signaal" door alles heen:

- **Achtergrond:** near-black blauwgrijs `#0E1116` (web), zwart gepoedercoat
  (hardware).
- **Signaal-accent:** warm amber/oranje `#F5A623`-familie — verwijst naar
  vintage LED's/VU, contrasteert mooi op donker, en is schaars in het
  Eurorack-merklandschap (veel merken zitten op cyaan/groen).
- **Secundair:** koel cyaan `#39C6D6` alléén voor CV/scope-visualisaties
  (editor), niet voor marketing — zo blijft amber "het merk".
- **Neutralen:** grijstinten met lichte blauwzweem; wit `#F2F4F8` voor tekst.
- **Per-product tint (optioneel, fase 2):** Cortex amber, Reflex rood-oranje,
  Relay geel-groen — zelfde verzadiging/lichtheid, familie blijft één.

## 5. Typografie

- **Kop/merk:** een geometrische grotesk met techkarakter maar open vormen —
  kandidaten: *Space Grotesk*, *Archivo*, *Manrope* (alle open source, past
  bij merk).
- **Lopende tekst web:** *Inter* of systeemfont-stack.
- **Mono (specs, code, versienummers):** *JetBrains Mono* of *IBM Plex Mono*
  — specificaties zijn marketing, dus mono krijgt een echte rol in de stijl.
- **Panelen/hardware:** condensed variant of Archivo Narrow i.v.m. ruimte;
  vaste regels voor jack-labels (kapitaal, tracking ruim).

## 6. Beeldtaal & grafische elementen

- **Het rasterdocument-gevoel:** subtiel dot-grid of blueprint-raster als
  achtergrondtextuur (verwijst naar schema's/ADRs; "wij documenteren alles").
- **Scope-lijnen:** step-line/gate-golfjes als decoratief element en als
  sectiescheider — rechtstreeks uit de eigen editor-scope.
- **Fotografie:** echte rigs, echte kabels, warm licht, geen renders-op-wit
  als hoofdbeeld (wel voor reseller-productkaarten).
- **Statusbadges** (in development / beta / available) als vast, eerlijk
  merkelement — maak van transparantie een stijlmiddel.

## 7. Toepassingsregels (alvast)

- Merkteken minimaal 4 mm op hardware, altijd 1-kleur op panelen.
- Amber nooit als tekstkleur op wit (contrast); op dark altijd ≥ 4.5:1 checken.
- Productnamen altijd als "MusicBrain Cortex" bij eerste noeming, daarna
  "Cortex".
- Dark mode is default op web; light mode bestaat en wordt getest, maar
  beeldmateriaal wordt dark-first ontworpen.

## 8. Deliverables ontwerpsessie

1. 3 logorichtingen schetsmatig → 1 keuze → uitwerking (SVG-masters).
2. Mini-styleguide (1 pagina): logo-gebruik, palet met hexwaarden en
   contrastratio's, typografie, do's & don'ts.
3. Design-tokens-bestand (JSON/CSS-variabelen) → direct bruikbaar door de
   website-bouwsessie (koppelt aan requirement "ontwerper" in
   [website-requirements.md](website-requirements.md) B1).
4. Toepassingsproeven: website-hero, Eurorack-paneel 6 HP, pedaal-top,
   Insta-avatar, OG-image-sjabloon.
