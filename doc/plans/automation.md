# Automation: knopbewegingen in de opname (ED-SM-10, voorstel 2026-10-11)

Mark: "Ik bewoog de cutoff, maar met de muis. Dat zou eigenlijk in de opname
moeten landen, als een soort automation-data (zoals in Logic)."

> **Besluiten (Mark, 2026-10-12):** 1 **altijd meeschrijven**, geen aparte
> knop. 3 **afspelen hoort erbij**: "bij afspelen moet hetzelfde gebeuren; het
> is deel van het spel, dus van de opname". Afspelen is dus geen latere stap
> maar hoort bij de eerste versie, en de knoppen op het scherm bewegen mee.
> 4 niet-gebonden knoppen als lane in Reaper/Logic: **nog niet**, staat in de
> backlog (ED-SM-12). 2 **allebei, en meteen afmaken**: de regel bij take en
> spoor én de lijnen onder de sporen ("anders hangt het maar weer in de
> backlog"). Bouwen: de editor-UI-chat (overgedragen 2026-10-12).

> **Stand 2026-10-12:** stap 1 (vastleggen en afspelen) is gebouwd:
> `editor/src/modular-mb/automation.ts`, `controlPreview.ts`, de luisteraar
> `onControlWrite` in `setPatchControl.ts`, afspelen in `MidiFileSource`
> (`setAutomation`). Afwijkingen van het plan hieronder: een event draagt
> ook `twins` (front-knop van een stereopaar), en `controls` heeft per knop
> `typeId` en `ordinal`, zodat een take ook op een kopie van de patch (nieuwe
> id's) zijn knoppen terugvindt. `cc` in het bestand noemt de CC-lanes die
> in de .mid dezelfde beweging dragen; de speler slaat die over.
>
> **Stand 2026-10-12, later:** stap 2 en 3 ook gebouwd (zie RELEASE-LOG):
> `SongTrack.automation`, `automationToRegion`, `spliceAutomation` (na de
> regio terug naar de stand van het spoor), export per spoor, de regel en de
> lijnen in ≣ Sporen. Afwijking: een song afspelen beweegt de knoppen niet
> (de sporen zijn audio); de lijnen tonen de beweging. Open: stap 4
> (bewerken) en ED-SM-12.

Eerst de werkwijze, dan de techniek (les van de overdub-sporen:
[overdub.md](overdub.md)).

## 1. De werkwijze

**Opnemen.** Je drukt ⏺ (een take, of een spoor in ≣ Sporen), speelt en
draait aan knoppen: met de muis op het front of in de patcher, met een
Roto-Control, met een MIDI-controller die aan een knop gebonden is. Alles
wat je aanraakt wordt meegeschreven, zonder extra knop. (In Logic heet dat
"Touch": wat je aanraakt wordt opgenomen, de rest blijft staan.)

**Terugzien.** Na de opname staat bij de take en bij het spoor welke knoppen
bewogen zijn ("Cutoff, Drive"). Later: per knop een smalle lijn onder het
spoor in de sporenstrip, zoals de automation-lanes in een DAW.

**Waar het voor dient.** De sporen zijn audio: de knopbeweging zit al in het
geluid. De automation is er voor wat je daarna doet:

1. **Bewaren en exporteren**: naar Reaper of Logic, naast de wav en de .mid,
   zodat je de beweging daar kunt terugzien of op een andere klank zetten.
2. **Opnieuw laten klinken**: de take afspelen op de Teensy of in de
   simulator met noten én knopbewegingen (zoals ik vandaag met de MIDI deed,
   maar dan compleet). Handig om te vergelijken na een firmwarewijziging, of
   een spoor opnieuw op te nemen met een andere patch.
3. **Drop-in**: een regio opnieuw inspelen vervangt in die regio ook de
   automation, net als het geluid en de MIDI.
4. Later: **bewerken** (een lijn wissen, gladmaken, tekenen).

## 2. Wat er wordt vastgelegd

```ts
interface AutomationEvent {
  t: number;          // ms vanaf het begin van de take/song (zoals MidiEvent)
  moduleId: string;   // de module waar je aan draaide (bij poly: de master)
  controlId: string;
  value: number;      // in de eenheid van de knop (Hz, ms, 0..1 …)
}
```

- Alleen veranderingen, en hoogstens één per knop per 10 ms (een muisbeweging
  levert anders honderden waarden per seconde).
- Bij poly de knop waar je aan draaide, niet elke stem: afspelen gaat weer via
  de poly-uitwaaiering.
- Niet-getal-waarden (joystick-standen) in deze eerste versie niet.

## 3. Waar het vandaan komt

Eén plek: **`setPatchControl`** (`editor/src/modular-mb/setPatchControl.ts`).
Elke knopwijziging loopt daar al langs (CLAUDE.md: één schrijfpad), dus ook
die van de Roto-Control-brug en de MIDI-bindingen. Daar komt een luisteraar
bij; de recorder schrijft mee zolang ⏺ loopt. Wat niet via dat pad gaat
(de preview van de knoptour) wordt niet opgenomen, en dat is goed: dat is
uitproberen, geen spelen. "Houden" in de knoptour gaat wel via dat pad.

## 4. Waar het bewaard wordt

- **Take**: een vierde bestand naast wav, mid en patch.json:
  `<take>.auto.json` met `{ version, patchId, controls: {id → label, min, max,
  unit}, events }`. De media-library neemt het mee als een gewoon bestand van
  de take-groep (zoals de .syx).
- **In de .mid**: knoppen met een MIDI-binding (control-surface, `midiMap`)
  komen er ook als CC in, zodat een DAW ze direct als CC-lane ziet. Knoppen
  zonder binding staan alleen in de .auto.json.
- **Spoor** (`SongTrack`): `automation: AutomationEvent[]` naast `midi`;
  drop-in knipt en plakt het zoals `spliceMidi` dat met de MIDI doet.

## 5. Afspelen

Niet via `setPatchControl` (dat zou de patch veranderen, de Bewaar-knop laten
verschijnen en de undo vullen), maar via hetzelfde previewpad als de knoptour:
engine en Teensy krijgen de waarde, de patch niet; na afloop gaat alles terug.
Dat pad (`knobTour.ts`, `preview`) wordt daarvoor een gedeeld stuk.

## 6. Stappen

1. **Vastleggen en afspelen** (samen, besluit 3): luisteraar op
   `setPatchControl`, recorder, `.auto.json` bij de take, CC in de .mid voor
   gebonden knoppen; een take opnieuw laten klinken speelt noten én
   knopbewegingen, en de knoppen op het scherm bewegen mee. Test: opnemen met
   knopbewegingen en terugspelen levert dezelfde controlwaarden op dezelfde
   tijden.
2. **Sporen**: automation per spoor, mee met drop-in, mee in de export
   (Reaper).
3. **Tonen**: de bewogen knoppen bij take en spoor, en de lanes in ≣ Sporen
   (besluit 2: allebei in deze ronde).
4. **Bewerken.**

## 7. Vragen voor Mark

1. ~~Altijd meeschrijven?~~ Besloten: ja.
2. ~~Hoe zie je het?~~ Besloten: allebei, in deze ronde: een regel bij de take en bij het spoor ("bewogen: Cutoff,
   Drive"); later, in ≣ Sporen, per bewogen knop een smalle lijn onder het
   spoor die de beweging laat zien (zoals in Logic). Tijdens het afspelen zie
   je het hoe dan ook: de knoppen draaien mee.
3. ~~Opnieuw laten klinken?~~ Besloten: ja, hoort bij de eerste versie.
4. ~~Niet-gebonden knoppen als lane in de DAW?~~ Nog niet (ED-SM-12).
