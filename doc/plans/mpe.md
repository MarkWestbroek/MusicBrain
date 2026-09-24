# MPE in MidiIn — verkenning (2026-09-24)

Aanleiding: de Expressive E **Osmose** stuurt MPE. Die hangt nog niet aan
MusicBrain; dit stuk zet op een rij wat MPE is, wat MidiIn nu doet, wat er
bij moet en in welke volgorde — zodat we hem straks in één keer goed
aansluiten.

## 1. Wat MPE is (in vijf regels)

- **MIDI Polyphonic Expression**: elke klinkende noot krijgt een *eigen
  MIDI-kanaal*, zodat expressie per noot kan in plaats van per kanaal.
- Een **zone** = één *master*-kanaal + een reeks *member*-kanalen. De
  gangbare "lower zone": master = kanaal 1, members = 2..16. Het master-kanaal
  draagt alles wat globaal is (sustain, program change, globale bend); de
  members dragen de noten.
- Drie dimensies per noot, op het member-kanaal van die noot:
  **X** = pitch bend (`0xE0`, bereik meestal ±48 st), **Y** = CC 74 ("slide",
  timbre), **Z** = channel pressure (`0xD0`, druk/aftertouch).
- De **MCM** (MPE Configuration Message, RPN 6 op het master-kanaal) zegt
  hoeveel member-kanalen de zone heeft; RPN 0 op het master-kanaal zet het
  bend-bereik van de members.
- Osmose per toets: *strike* (velocity), *press* (druk → Z), *shake*
  (zijwaartse beweging → X, per-noot vibrato) en *release*-velocity. Hij kan
  ook "klassiek" (één kanaal + poly-aftertouch `0xA0`, geen bend per noot).

## 2. Wat MidiIn nu doet

| | nu |
|---|---|
| Kanaal | filter omni/1..16 (`channel`); het kanaal doet verder niets |
| Stemtoewijzing | `VoiceAllocator` op *nootnummer* (steal old/low/hi), mono-stack, unison |
| Bend | één globale `bend14_`; `cv_bend` (V/Oct, `bendRange` 1..24) en sinds fw 0.5.69 `bendPitch` = per stem in `pitch`/`pitchK` gevouwen (`voicePitchV`) |
| Druk | **niets**: geen handler voor `0xD0`/`0xA0` in `main.cpp`, `TeensyLink`, `midiin_wasm.cc` noch `MidiSource.ts` |
| Poorten | per stem `pitchK/gateK/velK`; globaal `cv_mod/cv_bend/cv_cc1/cv_cc2` |
| Aansluiting | USB-device (`usbMIDI`) of via de editor-brug over de link; **geen USB-host** (USBHost_t36) en geen DIN-in in de firmware |

De editor-sim spiegelt dit: `MidiSource` gooit het kanaal weg (`status & 0xf0`)
en kent alleen noteOn/Off, cc en pitchBend.

## 3. Ontwerp

### 3.1 `mpe`-schakelaar op MidiIn (off/on)

- **Aan**: `channel` = master-kanaal (standaard 1); alle andere kanalen zijn
  members. Mono/legato/unison uit (MPE is per definitie poly).
- **Per kanaal** expressie-staat: `chanBend14_[16]`, `chanPress_[16]`,
  `chanSlide_[16]`. Op het master-kanaal blijven `bend14_`/mod-wheel/cc1/cc2
  globaal werken zoals nu.
- **Stem ↔ kanaal**: `noteOn(ch, note)` gaat door de bestaande allocator
  (steal-strategie blijft), en onthoudt `voiceChannel_[v] = ch`. Alle
  expressie van dat kanaal landt op stem `v`. Note-off op (ch, note) zoals nu
  op noot.
- `voicePitchV(v)` telt in MPE-modus `chanBendV(voiceChannel_[v])` op (het
  `bendPitch`-pad, dus precies de plek die 0.5.69 daarvoor heeft
  klaargezet); `cv_bend` blijft de master-bend.
- `bendRange` max van 24 naar **96** (MPE-spec); RPN 0 op het master-kanaal
  mag hem later automatisch zetten.

### 3.2 Nieuwe poorten

| poort | wat | ook zonder MPE |
|---|---|---|
| `pressK` (per stem) + `press` (master-cel) | Z, 0..1 | ja: poly-aftertouch `0xA0` per noot, channel pressure `0xD0` op alle stemmen |
| `slideK` + `slide` | Y (CC 74), 0..1 | ja: CC 74 op alle stemmen |
| `relK` + `rel` | release-velocity (note-off `0x80` d2), 0..1, gelatcht tot de volgende aanslag | ja: elk keyboard dat hem stuurt |

`press`/`slide` op de master-cel gedragen zich als `vel`: eerste gegate stem,
en polyExpand waaiert `press → press1..N` uit. Daarmee is per-noot druk →
filter gewoon een kabel: `press_k → cutoff_k` op de sampler (zoals de
auto-wah `env_k → cutoff_k`), of `press` → VCF-cv in een PolyGroup.

Voor de sampler is per-noot **bend** dus niets extra's: die komt via
`pitchK`; de gedeelde `bend`-ingang blijft voor de master-bend of een LFO.

### 3.3 Loodgieterswerk (alle vier de paden)

1. **Teensy**: `usbMIDI.setHandleAfterTouchChannel` (`0xD0`) en
   `setHandleAfterTouchPoly` (`0xA0`) in `main.cpp`; `onMidiPressure` in de
   link-brug (`TeensyLink.h` "midi"-berichten).
2. **Editor-brug**: `teensyLink.ts` `sendMidiPressure(...)`; `MidiSource.ts`
   houdt het **kanaal** bij in elk event en kent `pressure`/`polyPressure`;
   `AudioEngine.sendMidi` kan al elk statusbyte kwijt (let op: `0xD0` heeft
   één databyte).
3. **Sim**: `midiin_wasm.cc` `mmb_midi` routeert `0xD0`/`0xA0` naar de module
   (kanaal zit al in `status & 0x0F`).
4. **Contract**: nieuwe poorten/controls via `contract_dump.py`;
   `wasmPorts.test.ts` (MidiIn-sectie) en `test_midiin.cpp` in core.

## 4. Volgorde

1. **Druk, zonder MPE** — ✅ fw 0.5.70 (2026-09-24): `press`/`pressK`,
   `rel`/`relK`, `0xD0`/`0xA0` door alle vier de paden, gemeten op de Teensy
   (`press → sampler.bend`: 440 → 883 Hz). Les: nieuwe MidiIn-poorten ook in
   `outputPortKind()` aanmelden, anders routeert de CvGraph ze niet (de sim
   merkt dat niet).
2. **MPE-modus**: kanaal-per-stem, per-kanaal bend/slide, `slideK`,
   `bendRange` tot 96, MCM/RPN lezen (optioneel). ~1 dag firmware + ½ dag
   editor/sim/tests.
3. **Osmose eraan**: via de pc (Web MIDI → editor → brug over de link, of
   USB-MIDI van de pc naar de Teensy). Test eerst synthetisch met
   `winmidi.py` (noten op kanaal 2..9 met eigen bend/druk) en het
   meet-recept van `bend_test.py` (grondtoon vóór/na), dan met de Osmose zelf.

## 5. Open vragen

- **Rechtstreeks aan de brain** zonder pc (Mark, 2026-09-24: versie 1 op
  het protobord). Het busboard rev 3.1 heeft het al getekend: J23 =
  USB-host-doorvoer vanaf de vijf host-pads onder de Teensy (GND, +5V, D−,
  D+, GND) naar een paneel-USB-A; MIDI-DIN 2× in via H11L1-opto's op
  Serial7 (OUT2 = TX7/pin 29). Op het protobord dezelfde pinnen nemen, dan
  hoeft de firmware straks niet te wisselen. Firmware: USBHost_t36
  (`USBHost` + `MIDIDevice`) en een `MIDI`-instantie op Serial7, beide naar
  dezelfde `handleNoteOn/…`-handlers als usbMIDI (ADR 0010 §4: één
  MidiSource-aggregator onder MidiIn). De Osmose heeft een eigen voeding,
  dus de host-5V hoeft alleen de enumeratie te dragen — wel even nameten.
- Hoeveel stemmen: MidiIn kan 16 (`kMaxAllocVoices`, `pitch1..16`), het
  aantal is per patch (`voiceCount`); alleen de *sampler* heeft 8 cellen per
  module. Met `voiceCount` ≥ het aantal member-kanalen hoeft de allocator in
  MPE-modus nooit te stelen; de grens is CPU/SD-bandbreedte van de patch.
- Release-velocity: doen (`relK`/`rel`, §3.2) — alles wat expressie geeft is
  welkom.
- Zone-configuratie (lower/upper, MCM) automatisch volgen of alleen de
  eenvoudige "master = `channel`, rest = members".
