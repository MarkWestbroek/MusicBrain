# Labels per control: van editor naar Teensy (2026-10-03)

**Status:** editorkant gebouwd (`Patch.controlLabels`, display op PADS, groene naam bij draaiknop en schuif, invoer in de eigenschappen). De firmwarekant is een plan: pas bouwen als er een display of een fysieke kaart is die de tekst toont.

## Wat er is

Een patch kan per module per control een korte tekst hebben, tot 24 tekens:

```json
"controlLabels": { "mod_pads1": { "b1": "Start/Stop", "b2": "Restart" },
                   "mod_faders": { "f1": "Cutoff" } }
```

- **PADS** (grote knoppen): een vast display onder elke pad. Leeg toont het het nummer, met tekst bijvoorbeeld "1 Start/Stop".
- **Draaiknop en schuif:** het label vervangt de gedrukte naam, in groen.
- **Invoer:** in de eigenschappen ("Labels (deze patch)") in de Rack- en de Patcher-tab, of met een dubbelklik op een display. Code: `editor/src/modular-mb/controlLabels.tsx`.
- Labels horen bij de patch, niet bij de module. Dezelfde PADS kan in een andere patch iets anders doen.

## Waarom geen tekst-control

Een control-waarde (`ControlValue`) is een getal, een aan/uit of een joystickstand. Alles wat met controls werkt rekent daarop: controlPoke naar de Teensy, morph A/B, MIDI- en surface-mapping, `sanitizeControls`, het contract. Een tekstwaarde moet al die paden door, terwijl een label geen klank verandert. Daarom staat de tekst los van `controlState`.

Ter vergelijking, het DX7-display: daar staat in de patch alleen `bank` en `program` (getallen). Het display zoekt de naam op in een tabel (`DisplayControl.bindTo/bindTo2/lookup`, `dx7BankNames.ts`). Dat is afgeleide tekst. Een label is vrije tekst van de gebruiker en moet dus als data mee.

## Plan voor de Teensy

1. **Payload.** `buildConfigPayload` (`teensyLink.ts`) stuurt nu alleen wat de runtime nodig heeft, onder de regelbuffer van 96 KB. Hier komt per gepushte patch een optioneel `labels`-blok bij, in dezelfde vorm als hierboven. Alleen labels van modules die meegaan; lege blokken weglaten. Bij 4 pads × 24 tekens gaat het om een paar honderd bytes.
2. **Firmware.** `ProjectRuntime::applyConfig` bewaart de labels per patch: een kleine vaste tabel (bijvoorbeeld 64 regels van moduleId + controlId + 24 tekens), niet op de heap per string. Bij een patchwissel (`selectPatch`) krijgt elke module `setLabel(controlId, text)`. Dat is een virtuele functie op `Module` die standaard niets doet.
3. **Wie het toont:**
   - een fysieke PADS-kaart met displays (de module zet de tekst op zijn eigen display);
   - een display op de brain zelf (bijvoorbeeld: welke module bij welke knop hoort);
   - de control-surface-koppeling (ED-CS-1, `MidiBinding`): een fysieke knop of encoder die aan deze control hangt, krijgt het label op zijn display (de Roto-Control heeft er een).
4. **Contract.** Geen wijziging in `module-types.json`: labels zijn geen controls. Wel een fw-tag zodra de firmware het blok leest, zodat de editor weet of het meegestuurd kan worden.

## Open

- Tekenset: alleen ASCII op kleine displays? (De editor laat nu alles toe.)
- Lengte per display: 24 tekens is de editorgrens; een kaart met 8 tekens kapt af of scrolt.
