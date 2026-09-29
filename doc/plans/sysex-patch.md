# MusicBrain-patches als SysEx

Status: gebouwd. Editor: export/import `.syx`, SysEx in de `.mid` van een take.
Firmware (0.5.89): ontvangt cmd 02 via USB-MIDI en laadt de patch; op de
hardware getest (4-stemmige patch, 27 berichten, klinkt).

## Waarom

- Een patch reist mee in een MIDI-bestand. Speelt een DAW de `.mid` af naar
  de MusicBrain, dan komt eerst de klank mee, net als GS/XG-reset-sysex in
  oude MIDI-bestanden.
- Losse `.syx`-bestanden zijn het gangbare uitwisselformaat voor
  synth-patches: bibliotheken en SysEx-librarians begrijpen ze.
- DAW's kennen de inhoud niet en hoeven dat ook niet. Ze bewaren de
  berichten als MIDI-events. Een patch *kiezen* gaat met bank-select (CC 0)
  en program change. De editor maakt daarvoor naamlijsten: `.reabank` voor
  Reaper en een patch-script voor Cubase.

## Berichtformaat

Alle bytes tussen F0 en F7 zijn 7-bit.

```
F0 7D 4D 42 <ver> <cmd> <seqHi> <seqLo> <totHi> <totLo> <data …> <sum> F7
```

| Veld | Waarde |
|---|---|
| `7D` | Fabrikant-ID voor niet-commercieel en eigen gebruik (MMA). Voor een product is een eigen ID nodig. |
| `4D 42` | "MB", zodat andere `7D`-gebruikers ons kunnen negeren. |
| `ver` | Formaatversie, nu `01`. |
| `cmd` | `01` = editor-patch (JSON zoals de editor hem bewaart, slank: zonder moduletypes en interne prototypes).<br>`02` = firmwareconfig (dezelfde JSON die `sendConfig` via de seriële link stuurt, `buildConfigPayload`). |
| `seq`, `tot` | Volgnummer en aantal berichten van deze inhoud, elk 14-bit (2 × 7 bit). |
| `data` | Maximaal 240 bytes van de gepakte inhoud. |
| `sum` | `(128 − som(data) mod 128) mod 128`, Roland-stijl. |

Een bericht is dus hooguit 252 bytes. De USB-MIDI-sysexbuffer van de Teensy
(`USB_MIDI_SYSEX_MAX`) is 290.

**Inhoud van één `cmd`**, voor het opknippen:

```
UTF-8-JSON → deflate-raw → [lengte gecomprimeerd, 4 bytes big-endian] + gecomprimeerd → 7-bit pakken
```

**7-bit pakken:** per groep van maximaal 7 bytes eerst één byte met de hoogste
bits (bit *i* = hoogste bit van byte *i*), dan de 7 bytes zonder hoogste bit.

**Volgorde in een `.syx`/`.mid`:** eerst alle berichten van `02`
(firmwareconfig), dan `01` (editor-patch). Een ontvanger negeert commando's
die hij niet kent.

**Grootte:** een 4-stemmige patch kost ongeveer 6,6 KB. Over een DIN-kabel
(3125 bytes/s) is dat ongeveer 2 seconden, over USB verwaarloosbaar.

## Editor (gebouwd)

- `editor/src/modular-mb/sim/patchSysex.ts`: coderen en decoderen, `pack7`/`unpack7`, `.syx` splitsen en samenvoegen.
- Menu **SysEx ▾** in de kopregel: actieve patch als `.syx`, `.syx` importeren
  als nieuwe patch, patchnamen voor Reaper (`.reabank`) en Cubase (script).
- Take-editor: vinkje **patch in .mid** zet de patch van de take als SysEx
  op tijd 0 in de geëxporteerde `.mid`.
- `parseSmf` levert SysEx uit een `.mid` op (`ParsedSmf.sysex`).

## Firmware (gebouwd, 0.5.89)

- `firmware/core/include/mb/Protocol/Inflate.h`: eigen raw-DEFLATE-decoder
  (stored, fixed, dynamic), met een plafond voor de uitvoer.
- `firmware/core/include/mb/Protocol/MbSysex.h`: `MbSysexAssembler` verzamelt
  de berichten van cmd 02 in volgorde, controleert elk controlegetal, pakt uit
  en levert de JSON. cmd 01 en vreemde SysEx worden genegeerd.
- `main.cpp`: `usbMIDI.setHandleSystemExclusive` plakt USB-stukken aan elkaar
  en stuurt een complete config door `onConfigReceived`, dezelfde route als de
  link. Meldingen in de log: `sysex: config ontvangen (N bytes)` of `sysex: <fout>`.
- Tests: `core/tests/test_mbsysex.cpp` met vectoren uit de editor-encoder en
  node-zlib (`mb_sysex_vectors.h`).

Nog open:

- Een verzoek (`cmd 10` = "stuur je huidige patch") en een antwoord met `02`,
  voor een SysEx-librarian.
- DIN-MIDI-ingang, als de hardware er een krijgt.
