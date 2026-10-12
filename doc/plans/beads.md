# Beads: de opvolger van Clouds als module (voorstel 2026-10-12)

Op 11 oktober 2026 zette Émilie Gillet de broncode van Mutable Instruments
**Beads** online ([pichenettes/eurorack, `beads/`](https://github.com/pichenettes/eurorack/tree/master/beads),
commit d8f4739). Mark: "Is dit niet interessant voor ons?" Ja: Beads is de
opvolger van Clouds, en Clouds draait hier al (`tp_mmb_clouds`).

Ter review; niets gebouwd. Eerst de werkwijze, dan de techniek.

## 0. Wat vaststaat

- **Licentie**: MIT, in elk bestand (Émilie Gillet, Frédéric Meslin, Oliver
  Rockstedt), net als de andere MI-ports. Haar README: *"Code provided as
  is, builds on a Desktop platform but not verified to build and run on a
  module."* Voor ons gunstig: een desktopbuild is precies wat de simulator
  (wasm) nodig heeft.
- **Omvang**: `beads/dsp/` is ~30 bestanden (granulaire speler, delay- en
  wavetable-modus, korrelgenerator, reverb, wow & flutter, µ-law), plus de
  stmlib die we al hebben (`mi-elements`).
- **Geheugen**: één opnamebuffer van 768 KB (4 s stereo, 16 bit op 48 kHz)
  plus een reverbbuffer. Past in het PSRAM, zoals de sampler en de
  effecten (FxMem/FxBuf).
- **Samplerate**: Beads rekent op 24, 32 of 48 kHz, afhankelijk van de
  "media" (zie §1); wij op 44,1 kHz. Er komt dus een omzetting, zoals bij
  Clouds (48k→44,1k lineair, MI-port-recept).

## 1. De werkwijze: wat je ermee doet

Beads op het paneel, zoals het origineel (knoppen en ingangen uit
`beads/drivers/pots_adc.h` en `cv_adc.h`):

- **Knoppen**: Time, Size, Shape, Pitch, Density (de korrels); Feedback,
  Dry/Wet, Reverb (de mix); vier **attenuverters** voor de CV op Time, Size,
  Shape en Pitch.
- **Knoppen-als-schakelaar**: Freeze, Seed (één korrel), Quality/media
  (vier stappen: *dirty tape* 24 kHz, *clean tape* 48 kHz, *vintage
  digital* 32 kHz, *digital* 48 kHz).
- **Ingangen**: In L/R (audio), Freeze (gate), Seed (trigger), Clock, en CV
  voor Time, Size, Shape, Pitch (V/Oct), Density en een vrij toe te wijzen
  CV. **Uitgangen**: Out L/R.

Spelen, drie manieren (dit is wat Beads boven Clouds geeft):

1. **Korrels** uit wat er binnenkomt: Density bepaalt hoe vaak, vrij of op
   de klok; Seed zet er één neer. Freeze houdt de buffer vast.
2. **Delay en looper**: Size helemaal open schakelt de korrels uit; dan is
   het een delay, en met Freeze een looper.
3. **Klankbron zonder ingang**: niets in In, dan speelt Beads korrels uit
   ingebouwde wavetables. Met een MIDI-noot op Pitch een instrument.

De "+"-regel van FW-MOD-1 (fw 0.5.110) geldt ook hier: CV telt bij de knop
op, via de attenuverter, zoals op het origineel.

## 2. Stappen

1. **Vendor + desktoptest**: `beads/` (alleen `dsp/` en wat dat nodig heeft)
   naar `firmware/lib/mi-beads/`, stmlib uit `mi-elements` (byte-identiek,
   geen dubbele .cc's). Een klein desktopharnas (CMake, scratchpad) dat een
   wav door de processor stuurt: klinkt het als Beads?
2. **Simulator (wasm)**: `tools/mmb-wasm/beads_wasm.cc` naar het
   Clouds-voorbeeld, met de omzetting naar 44,1 kHz. Tests: geluid binnen de
   perken, Freeze houdt vast, delaymodus herhaalt, wavetablemodus klinkt
   zonder ingang, CV + attenuverter telt op.
3. **Paneel** in `seedModules.ts` (familie *Delay & reverb*, tags
   mutable-instruments, stereo), `moduleHelp.ts`, `frontControls.ts`
   (welke knoppen een speler wil), een seed in `patchCatalog.ts`.
4. **Teensy**: `BeadsModule.h` naar het ElementsModule/Clouds-patroon (het
   MI-port-recept: zero-init `operator new`, buffers op de heap/PSRAM met
   stil-bij-OOM, NaN-vangnet, `ready_`-guard, eventueel de `.text.mmbdsp`
   ld-sectie). Daarna **rekentijd meten** (`module_cpu.py`, schone Teensy)
   per media-stand: korrels lezen uit PSRAM is trager dan intern RAM.
5. **Contractketen, catalogus, release-log**, en een sitepagina
   (`sw-beads`, met bronvermelding "based on Mutable Instruments Beads").

## 3. Risico's

- **Rekentijd**: Beads draaide op een STM32F405 (168 MHz, alles in intern
  RAM). De Teensy is sneller, maar de korrels lezen willekeurig uit PSRAM.
  Meet het bij stap 4; zo nodig de buffer in RAM2 voor de kortere modi.
- **Niet geverifieerd door Émilie** op hardware ("install at your own
  risks"): de desktoptest in stap 1 vangt het meeste af.
- **Samplerate per media**: drie verschillende omzettingen (24/32/48 →
  44,1). Of één omzetting met de verhouding als parameter; stap 2 kiest.

## 4. Vragen voor Mark

1. **Naast Clouds of in plaats van?** Voorstel: ernaast. Clouds zit in
   patches en heeft zijn eigen karakter (spectrale en looping-modi).
2. **Alle drie de modi** (korrels, delay, wavetable) in de eerste versie,
   of eerst korrels en delay?
3. **De vrije CV-ingang** ("assign" op het origineel, via een knopcombinatie
   toe te wijzen): weglaten, of als vaste ingang met een keuzeschakelaar?
