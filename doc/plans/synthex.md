# Synthex: polyfone stem naar de Elka Synthex (2026-10-02)

**Status:** module `tp_mmb_synthex` gebouwd en gemeten in wasm, Teensy-build slaagt; niet beluisterd en niet geflasht.
**Bron:** Elka Synthex schematic diagrams (blad 1 blokschema en blad 4 stemkaart 410CST5800, gedateerd 1-6-83; ontwerp Mario Maggi), met de kalibratie-instructie voor de oscillatoren. Aanleiding: het artikel over Behringers plannen met de Synthex en Marks schema.

## Wat het schema laat zien

- **Oscillatoren:** twee per stem, digitaal: tellers (74LS193) en multiplexers (74LS151) op een klok van 4 MHz per sectie. De kalibratietekst: "their tuning is controlled only by number codes that cannot change as time passes by". Vier referentiegeneratoren (Gen A–D, per sectie en per oscillator) zijn het punt waar LFO en pitch bend de toonhoogte buigen.
- **Menger:** per oscillator vier CMOS-schakelaars met 75k/150k/300k/680k: een volume van 4 bit, 16 stappen. Ruis via 22k.
- **Filter:** vier OTA-trappen (één viervoudige OTA, 330 pF per trap) met een resonantielus via een BC559. CMOS-schakelaars kiezen de aftakking en aarden condensatoren, waardoor hetzelfde filter LP, BP of HP is.
- **Envelopes:** analoog, met de tijden digitaal gekozen: een 4051 schakelt tussen weerstanden van 390k tot 10M, een 40174 houdt de stand vast (op 2 kHz geklokt).
- **Secties:** Upper en Lower, elk met LFO, ruis, routing en een chorus; normaal 8 stemmen, met Split of Double 4 + 4. De joystick stuurt VCF en VCO.
- Bedieningsnamen uit de kalibratiepagina: Octave (4′ …), Transpose, Waveform (ramp …), Volume 0–10, Osc 2 Sync, Master tune, Detune; Filter Frequency, Envelope, Resonance, Keyboard, Mode.

## De module

Kern `firmware/lib/mmb-dsp/mmb_dsp/synthex.h`. Acht stem-cellen (V/Oct + gate), één sectie:

- twee oscillatoren (Ramp/Square/Pulse met PolyBLEP, voetmaat 16′–2′, Transpose, Detune, Sync, Ring), ruis, menger in 16 stappen;
- het vierpolige filter als vier eenpolige trappen met een zachte begrenzer in de resonantielus; LP 24 dB, BP en HP 24 dB als mengsel van de trapuitgangen;
- ENV F en ENV A als ADSR (knop 0–10 = 2 ms tot 10 s);
- LFO (driehoek, blok, zaag, S&H) naar oscillatoren, PW, filter en volume; Glide, Tune, chorus (de BBD-chorus van de collectie), Level;
- joystick: Joy X = pitch bend (V/Oct), Joy Y = filter (±3 octaven).

Gemeten: 4′ speelt de toon van V/Oct, 8′ een octaaf lager; LP valt meer dan 40 dB over vijf octaven, HP loopt op; resonantie geeft ruim +20 dB op de cutoff zonder zelf te zingen; sync trekt oscillator 2 op de toon van 1; acht stemmen met alles open blijven binnen ±1.

Demo: **Poly ▾ → 🎛️ Synthex ×8**. Pitch-wheel = Joy X, mod-wiel = Joy Y.

## Wat ontbreekt

- Split en Double (twee secties met eigen klank) en de 4-sporensequencer van het origineel.
- Het precieze karakter: de golfvormen van de digitale oscillatoren (de trapjes van hun DAC), de juiste filtercurve en de chorus van het origineel. Daarvoor is meten aan een echte Synthex of aan een opname het snelst.
- Luisteren en flashen.
