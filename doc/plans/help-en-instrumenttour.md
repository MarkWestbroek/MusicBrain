# Help per knop en instrumenttour (speelmodus)

Status 2026-10-10: deel A gebouwd, deel B is een ontwerp ter review.

Een speler ziet op het front knoppen als *Timbre*, *Seg* of *Contact* en weet
niet wat ze doen. Deel A legt ze uit in tekst; deel B laat het horen.

## Deel A — help (gebouwd)

- **Tekst**: `editor/src/modular-mb/moduleHelp.ts`, per moduletype een korte
  uitleg (`about`) en per knop één regel, Nederlands en Engels (UK). De tabel
  staat los van de moduledefinities: een project bewaart zijn eigen kopie van
  de moduletypen, dus tekst daarin zou in bestaande projecten ontbreken.
  De lange uitleg blijft de `notes` van de module.
- **?-knop** boven het front (`data-tour="play-help"`) opent een blad
  (`FrontHelp.tsx`): per module op het front de uitleg en per knop zijn label
  met de regel. Zonder eigen tekst valt de module terug op de eerste zin van
  zijn notes; een knop zonder regel krijgt een streepje.
- **Hover** (muis) toont de regel als tooltip; **lang drukken** (½ s stil,
  telefoon) toont hem als ballon. Dat zit in `ModulePanel`
  (`controlHelp`, `onControlHold`) via capture-handlers, zodat de knop zelf
  gewoon draait: wie beweegt, annuleert de timer. `FrontPanel` vertaalt de
  virtuele id van het front naar `(module, control)`.
- **Test** (`moduleHelp.test.ts`): elke knop op een front van de standaardset
  heeft een regel in beide talen; regels blijven onder 140 tekens.
- **Nieuwe module**: een regel per frontknop in `moduleHelp.ts` hoort bij
  "klaar", net als `frontControls.ts`; de test vangt het anders.
- **Later**: hetzelfde blad per modulepaneel in Binnenkijken (de props
  bestaan al in `ModulePanel`).

## Deel B — instrumenttour (ontwerp)

Doel: het instrument speelt iets en draait intussen aan één knop, zodat je
het verschil hoort. Twee standen:

1. **Speel voor mij en draai** — de tour speelt een frase en draait.
2. **Ik speel, jij draait** — jij speelt op het klavier, de tour draait alleen.

### Bouwstenen

| Onderdeel | Wat | Hergebruik |
|---|---|---|
| Script | lijst stappen per moduletype: `{ control, from, to, ms, text? }`; zonder script een automatische stap per frontknop (min → max → terug) | tekst valt terug op `moduleHelp` |
| Frase | korte nootreeks per soort instrument (akkoorden voor piano/orgel/pad, riff voor bas/acid, lange noot voor drones en effecten), herhaald zolang de stap loopt | `engine.noteOn/noteOff`, zoals `FrontKeys` |
| Speler | timerlus zoals `recipe/demo.tsx` (`startDemo`: state, stop, finish) | patroon, geen code |
| Draaien | een stap zet elke ~30 ms een tussenwaarde | `setPatchControl` met een nieuwe optie `{ preview: true }` (zie hieronder) |
| Aanwijzen | de ballon van de rondleiding bij de knop die draait, met de regel | `PlayTour`-ballon; knoppen krijgen een anker per vid |
| Ingang | ▶ per knopregel in het ?-blad ("laat horen") en ▶ Tour bovenaan het blad | geen nieuwe knop in de speelmodus |

### Het schrijfpad

De tour mag de patch niet veranderen: geen Bewaar-knop, geen undo-punten.
Toch moet het geluid in de simulator én op de Teensy veranderen, met
poly-fan-out. Voorstel: één pad houden en `setPatchControl` een optie
`{ preview: true }` geven die engine en Teensy aanstuurt maar de store
overslaat, plus een overlay met previewwaarden die `frontControlState` over de
patchwaarden legt (zoals nu de live waarden). Aan het eind, bij stop of bij
een patchwissel, zet de speler elke geraakte knop terug naar de patchwaarde
via hetzelfde pad. **Besluit nodig**: dit is een uitbreiding van het ene
schrijfpad, geen tweede; akkoord?

### Gedrag

- **Jij wint**: raak je tijdens de tour een knop aan, dan laat de tour die
  knop los (jouw waarde blijft, en wordt gewoon in de patch gezet).
- **Stand 2** draait alleen terwijl er een toets ingedrukt is; laat je los,
  dan pauzeert de stap. Daarvoor een teller van ingedrukte noten uit
  `FrontKeys`/de engine.
- Stoppen: ✕ in de ballon, Escape, patchwissel of Binnenkijken.
- Teensy verbonden: dezelfde pokes, rond 30/s per knop is ruim binnen wat de
  link aankan.

### Stappen

1. ▶ per knopregel in het ?-blad: automatische zwaai, stand 1 met de
   standaardfrase. Klein en meteen nuttig.
2. ▶ Tour per instrument: alle frontknoppen na elkaar, met de ballon.
3. Stand 2 (ik speel, jij draait).
4. Handgeschreven scripts voor een paar instrumenten (e-piano, orgel, acid,
   CMI), met eigen frases en bereiken (de "sweet spot" in plaats van min–max).
