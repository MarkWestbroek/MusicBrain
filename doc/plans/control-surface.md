# Control-surface-koppeling (Roto-Control) — ontwerpdocument

## Samenvatting

Bidirectionele koppeling tussen MIDI-control-surfaces en de MMB, in eerste
instantie voor de Melbourne Instruments Roto-Control (gemotoriseerde knoppen).
Een `midiMap` in de projectconfig bindt CC's aan module-controls. Inkomende
CC's lopen via het bestaande `pokeControl`-pad (FW-LIVE-1); elke wijziging van
een gebonden control uit een *andere* bron (editor, patch-wissel) wordt als CC
teruggestuurd, zodat de motorknoppen fysiek meedraaien. Program change wisselt
de actieve patch, waarna alle knoppen naar de stand van de nieuwe patch
snappen.

Ticket-prefix: **FW-CS-x** (firmware) en **ED-CS-x** (editor).

## Vastgelegde uitgangspunten

- **CC coarse (7-bit) eerst.** NRPN/14-bit is een latere uitbreiding
  (FW-CS-6); de Roto ondersteunt beide, maar CC is getest en werkt
  (midimapper-test 2026-07-05/06).
- **Tekstlabels op de Roto kunnen niet live.** MIDI 1.0 kent geen
  parameternamen en het integratieprotocol van Melbourne (Ableton/Bitwig/
  Logic/Max) is gesloten, zonder publieke SDK. Labels gaan via vooraf
  geconfigureerde ROTO-SETUP-setups: één Roto-setup per MMB-patch(familie).
  Onderzoeken (ED-CS-4): is het setup-bestandsformaat van ROTO-SETUP leesbaar
  (JSON o.i.d.)? Dan kan de editor setups mét labels genereren.
- **De Roto en de Teensy zijn beide USB-devices** en kunnen niet rechtstreeks
  via USB praten. Zie transportfasen hieronder.

## Transportfasen

| Fase | Route | Hardware nodig | Status |
|------|-------|----------------|--------|
| 1 | Roto ↔ computer (WebMIDI in editor) ↔ TeensyLink-serial ↔ firmware | geen | ontwerp hieronder |
| 2 | Roto ↔ Teensy USB-hostpoort (USBHost_t36 MIDI-driver) | USB-host-kabeltje op Teensy 4.1 | FW-CS-5 |
| 3 | Roto DIN/TRS MIDI ↔ Teensy UART + optocoupler | klein circuit | optioneel, meest robuuste feedbackpad volgens veldrapporten |

Fase 1 hergebruikt de bestaande editor-MIDI-bridge (`{"type":"cc",...}` over
TeensyLink) en vergt géén nieuwe hardware: de editor routeert de Roto naar de
Teensy en terug. Standalone spelen (zonder computer) komt pas in fase 2/3,
maar het hele bindingsmodel en het firmware-pad zijn voor alle fasen gelijk —
alleen de fysieke in-/uitgang verschilt.

## Datamodel

`midiMap` hoort bij het **project** (niet per patch): bindings beschrijven de
hardware-indeling van het surface, en die verandert niet per patch. De
*waardes* per patch komen zoals altijd uit `patch.controlState`.

```json
"midiMap": {
  "pcChannel": 1,
  "bindings": [
    { "ch": 1, "cc": 74, "mod": "vcf1", "ctrl": "cutoff",
      "min": 0.0, "max": 1.0, "curve": "lin" }
  ]
}
```

| Veld | Betekenis |
|------|-----------|
| `ch` | MIDI-kanaal 1–16 van de binding |
| `cc` | CC-nummer 0–127 |
| `mod` / `ctrl` | doel: `moduleId` + `controlId`, zelfde adressering als `controlPoke` |
| `min` / `max` | controlbereik waarop 0–127 wordt afgebeeld |
| `curve` | `lin` (default) of `exp`; matcht de knopcurve in de editor |
| `pcChannel` | kanaal waarop program change → patch-index (volgorde in project) geldt; weglaten = PC uit |

Richtlijn: max ~64 bindings. De config-buffer in TeensyLink is op 48 KB
gedimensioneerd; 64 bindings ≈ 6 KB extra, dat past, maar bij het parsen wél
de teller loggen zoals `applyConfig` dat voor modules doet.

## Firmware

### FW-CS-1 — MidiMap parse + inbound CC → control (gebouwd 2026-07-06)

- `MidiMap`-klasse (nieuw bestand `MidiMap.h`): parse uit het
  config-document, vaste array (geen heap na boot), lookup op `(ch, cc)`.
- Hook in `handleControlChange` (`main.cpp`): match → schaal 0–127 naar
  `[min,max]` met curve → `runtime.pokeControl(mod, ctrl, value)`. Dat pad
  past toe én persisteert in `controlState`, precies zoals een editor-poke.
- **Gematchte CC's worden geconsumeerd**: ze gaan niet ook nog naar
  `midiIn.onControlChange()`. Eén CC, één betekenis; anders interpreteert de
  MidiInModule (mod-wheel-pad) dezelfde draai nog een keer.
- Geldt voor beide binnenkomstroutes: hardware-USB-MIDI én de
  editor-bridge-`{"type":"cc"}` (die dispatchen al door hetzelfde pad).
- **Gebouwd**: `MidiMap.h` (parse/match/scale), float-overload van
  `ProjectRuntime::pokeControl()` + getemplate `persistControl()`, hook in
  `handleControlChange()`. Beperking: waardes gaan als float naar
  `setControl()` — continue controls werken, switch/toggle (int32/bool) is
  een latere uitbreiding. Kanaalconventie vastgelegd in `MidiMap.h`:
  binding-`ch` is 1–16 zoals usbMIDI aanlevert, 0 = omni; de editor-bridge
  moet voor surface-verkeer dus 1-based zenden (ED-CS-2).

### FW-CS-2 — Outbound feedback (motorized knoppen)

- Wijzigt een gebonden control door een andere bron, dan wordt de waarde
  terug-geschaald naar 0–127 en verstuurd. Bronnen:
  1. `pokeControl` vanuit de editor;
  2. `activatePatch` / `applyControlState` (patch-wissel of config-push):
     na afloop álle bindings uitsturen — dit is de "alle knoppen draaien
     naar de nieuwe patch"-snap.
- Versturen via een **zendwachtrij** (ringbuffer, één entry per binding,
  nieuwste waarde wint) die in `loop()` leeggetrokken wordt met een plafond
  van ~3 CC's per ms. Nooit 64 CC's in één burst vanuit de audio-/
  handlercontext.
- Uitgang is transport-afhankelijk: fase 1 serialiseert
  `{"type":"ccOut","ch":n,"cc":n,"val":n}` naar de editor (die het via
  WebMIDI naar de Roto stuurt); fase 2 stuurt direct via de USB-host-poort.
  Achter één interface (`CcSink`) zetten zodat FW-CS-5 alleen een sink
  toevoegt.

### FW-CS-3 — Echo-onderdrukking

Zelfde bugklasse als de note-echo-loop die in `main.cpp` gedocumenteerd staat
("we deliberately do NOT echo notes back over usbMIDI"): een CC die net van
het surface binnenkwam mag niet als feedback teruggestuurd worden, anders
vecht de motor met de hand van de speler.

- Per binding: laatst ontvangen 7-bit waarde + timestamp bijhouden.
- Feedback onderdrukken als de te versturen 7-bit waarde gelijk is aan de
  laatst ontvangen waarde, óf als er < 50 ms geleden een CC op die binding
  binnenkwam.
- De patch-wissel-snap (FW-CS-2 punt 2) negeert de onderdrukking bewust:
  daar is het juist de bedoeling dat de knop beweegt.

### FW-CS-4 — Learn-ondersteuning

- Editor zet learn-mode aan/uit: `{"type":"ccLearn","on":true}`.
- Zolang learn aan staat, forwardt de firmware de eerstvolgende ongebonden CC
  als `{"type":"ccSeen","ch":n,"cc":n,"val":n}` en dempt hij de normale
  verwerking van die CC.
- Learn-mode vervalt automatisch na 30 s (guard tegen blijven hangen).

### FW-CS-5 — USB-host MIDI (fase 2)

- `USBHost_t36` + `MIDIDevice`-driver; zelfde handlers als `usbMIDI`.
- CcSink-implementatie voor uitgaand.
- Pas oppakken als fase 1 end-to-end werkt.

### FW-CS-6 — NRPN / 14-bit (later)

Fijnresolutie voor bijv. cutoff. Pas relevant als 7-bit hoorbaar stapt;
de bestaande control-slew in de modules maskeert waarschijnlijk veel.
Veldrapporten melden dat NRPN-receive op oudere Roto-firmware buggy was;
eerst testen op de actuele firmware (gebruiker draait 3.2.1).

### Program change → patch-wissel

- PC op `pcChannel` → index in de patchvolgorde van het project →
  `activatePatchAndBuild()`. Buiten bereik = negeren + log.
- Let op: patch-wissel herbouwt de graphs (audio-gap is geaccepteerd gedrag,
  zelfde als `selectPatch` vanuit de editor).

## Editor

### ED-CS-1 — Projectschema + config-push (gebouwd 2026-07-06)

- `midiMap` toevoegen aan het projecttype (`types.ts`), meesturen in de
  bestaande `{"type":"config"}`-push, persisteren in presets/opslag.
- Migratie: ontbrekende `midiMap` = lege bindings (geen schema-bump nodig).

### ED-CS-2 — Control-Surface-paneel (gebouwd 2026-07-06)

- Nieuw paneel: tabel met bindings (kanaal, CC, module, control, range,
  curve), rijen toevoegen/verwijderen/bewerken.
- **Gebouwd, met een ontwerpafwijking t.o.v. de fase-1-schets hierboven**:
  de editor stuurt géén rauwe CC's door en heeft geen firmware-`ccOut`
  nodig. In plaats daarvan past `surfaceBridge.ts` de binding zelf toe:
  inkomende CC → controlState van de actieve patch bijwerken (patcher-knop
  beweegt mee op het scherm) + `controlPoke` naar de Teensy — hetzelfde
  firmware-pad als de midiMap standalone neemt. Uitgaande feedback is een
  store-diff: elke wijziging van een gebonden controlwaarde (knopdrag,
  patch-wissel, undo) gaat als CC naar de gekozen WebMIDI-output, met
  echo-onderdrukking (300 ms / gelijke 7-bit waarde) en tx-dedupe.
  `syncSurface()` = alle knoppen naar de huidige stand ("snap").
  FW-CS-2 (`ccOut`) blijft nodig voor fase 2 (standalone), niet voor fase 1.
- Bestanden: `surfaceBridge.ts` (singleton, blijft actief buiten de tab),
  `ControlSurfacePanel.tsx` (tab "Surface" in `ModularMbApp.tsx`).
- **Loop-guards**: de bridge weigert de Teensy's eigen MIDI-poort als
  in-/output (zelfde heuristiek als `sim/MidiSource.ts`), en wat net van het
  surface binnenkwam wordt niet teruggezonden.

### ED-CS-3 — Learn-flow (editor-kant geleverd in ED-CS-2)

> ED-CS-2 bevat al een learn-knop per binding-rij: de bridge luistert zelf
> naar de surface-input, dus de eerstvolgende CC vult kanaal + CC zonder
> firmware-hulp. De `ccLearn`/`ccSeen`-messages hieronder zijn daarmee
> alleen nog nodig voor de standalone-fasen (surface direct aan de Teensy,
> FW-CS-4/5).

1. Gebruiker klikt "learn" op een binding-rij (of op een knob in de patcher).
2. Editor stuurt `ccLearn on`, wacht op `ccSeen`.
3. `ch`+`cc` invullen, learn uit, binding direct pushen (config of een
   lichtgewicht `{"type":"midiMap",...}`-update — beslissen bij bouw; config
   hergebruiken is de eenvoudigste route en config-push is al snel genoeg).
4. Omgekeerde richting (Roto leert van MMB) werkt vanzelf: draai de knob in
   de editor, de feedback-CC komt bij de Roto binnen, en de Roto's eigen
   LEARN pikt hem op.

### ED-CS-4 — ROTO-SETUP-generatie (onderzoek)

Onderzoeken of ROTO-SETUP zijn setups in een leesbaar formaat bewaart. Zo ja:
"Exporteer Roto-setup"-knop die per patch een setup met labels/kleuren/ranges
uit de midiMap genereert. Zo nee: documenteren dat labels handwerk in de app
blijven.

## Valkuilen (samengevat)

1. **Echo-loops**, twee smaken: firmware→surface (FW-CS-3) en
   editor-bridge-spiegeling (ED-CS-2). Beide expliciet afdekken; dit is de
   bekendste bugklasse in dit soort koppelingen en heeft in deze codebase al
   eens toegeslagen bij notes.
2. **Burst bij patch-wissel**: zendwachtrij met rate-limit (FW-CS-2).
3. **Roto clamp**: waardes buiten de per-knob MIN/MAX op de Roto worden daar
   geclamped; editor-paneel moet de Roto-range niet proberen te overrulen —
   de midiMap-range is leidend, hou de Roto op 0–127.
4. **CC-consumptie**: een gebonden CC mag niet óók de MidiInModule bereiken
   (FW-CS-1).
5. **Kanaal-filtering**: `midiIn` staat op omni; bindings filteren wél op
   kanaal. Match dus op `(ch, cc)` vóór de omni-dispatch.

## Verificatie

- **Fase 1 end-to-end**: Roto-knop draaien → editor-bridge → control
  verandert hoorbaar én zichtbaar in de patcher; knob in de patcher slepen →
  Roto-knop draait fysiek mee; patch wisselen via de editor → alle gebonden
  Roto-knoppen snappen.
- **Echo-test**: snel heen en weer draaien op de Roto mag geen motorische
  "vecht"-beweging of oscillatie geven.
- **PC-test**: Roto-button met program change → patch wisselt + snap.
- **Regressie**: ongebonden CC's (mod-wheel) blijven de MidiInModule bereiken.

## Files

| Bestand | Locatie | Ticket |
|---------|---------|--------|
| MidiMap (nieuw) | `firmware/app-modular-brain/src/MidiMap.h` | FW-CS-1..3 |
| CC-handler hook | `firmware/app-modular-brain/src/main.cpp` | FW-CS-1 |
| Link-messages (`ccOut`/`ccSeen`/`ccLearn`) | `firmware/app-modular-brain/src/TeensyLink.h` | FW-CS-2/4 |
| Projecttype | `editor/src/modular-mb/types.ts` | ED-CS-1 |
| Bridge + paneel | `editor/src/modular-mb/` (nieuw paneel) | ED-CS-2/3 |
| Dit document | `doc/plans/control-surface.md` | — |
