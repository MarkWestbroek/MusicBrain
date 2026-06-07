# STK Sound Module — ontwerpdocument

## Samenvatting

Eén module (`tp_mmb_stk_sound`, 8 HP, FW-AU-10) die een heel palet aan STK
physical-modelling instrumenten bevat. De sound-selector (rotary switch op het
paneel, 8 standen) kiest het actieve algoritme. Alle klankparameters zijn zowel
als paneelknop (`setControl()`) als CV-ingang (`writeCvPort()`) bestuurbaar,
analoog aan ElementsModule.

## Files

| Bestand | Locatie |
|---------|---------|
| Firmware | `firmware/app-modular-brain/src/StkSoundModule.h` |
| Factory-registratie | `firmware/app-modular-brain/src/RegisterAllModules.h` |
| Editor seed | `editor/src/modular-mb/seedModules.ts` |
| Dit document | `doc/plans/stk-sound-module.md` |

## Firmware: StkSoundModule.h

### Architectuur

```
StkSoundModule : AudioModule
  └── StkSoundVoice : AudioStream(0 in, 1 out)
       └── std::unique_ptr<stk::Instrmnt> instr_
```

**StkSoundVoice** is een `AudioStream` (geen audio-inputs, één audio-output).
Het bezit polymorf een STK-instrument via `unique_ptr<stk::Instrmnt>`. De
`update()`-methode roept 128× `instr_->tick(0.0f)` aan.

**StkSoundModule** is de `AudioModule`-wrapper die de dual-path
CV+control-architectuur implementeert.

### Sound-keuze (Sound enum)

| Index | Sound       | STK-klasse    | Karakter                 |
|-------|-------------|---------------|--------------------------|
| 0     | Mandolin    | `Mandolin`    | Getokkelde snaar         |
| 1     | Clarinet    | `Clarinet`    | Riet-instrument           |
| 2     | Bowed       | `Bowed`       | Gestreken snaar          |
| 3     | Flute       | `Flute`       | Fluit (jet-injectie)     |
| 4     | Brass       | `Brass`       | Koperblaas               |
| 5     | Saxophony   | `Saxophony`   | Saxofoon                 |
| 6     | BlowHole    | `BlowHole`    | Enkelriet + klankgat     |
| 7     | BandedWG    | `BandedWG`    | Waveguide-modale mix     |

### Port map

| Direction | portId       | Domain | Betekenis                             |
|-----------|--------------|--------|---------------------------------------|
| input     | `voct`       | Cv     | Toonhoogte (V/Oct)                    |
| input     | `gate`       | Gate   | Triggers noteOn / noteOff             |
| input     | `strength`   | Cv     | Aanslag/embouchure-sterkte (CC#1)     |
| input     | `timbre`     | Cv     | Timbre (CC#2: bodySize, reed, bowPressure,…) |
| input     | `modulation` | Cv     | Modulatie (CC#11: noiseGain, bowVel, vibrato) |
| output    | `out`        | Audio  | Mono audio-uitgang                    |

### Controls (knop/schakelaar op paneel)

| controlId    | type  | default | Koppeling                              |
|--------------|-------|---------|----------------------------------------|
| `sound`      | int   | 0       | Switch (8 pos) → `selectSound()`       |
| `level`      | float | 0.8     | Uitgangsniveau (geen CV-offset)        |
| `strength`   | float | 0.8     | Sommatie met `cvStrengthOffset_`       |
| `timbre`     | float | 0.5     | Sommatie met `cvTimbreOffset_`         |
| `modulation` | float | 0.5     | Sommatie met `cvModOffset_`            |

### Dual-path CV+knop (summing)

```
setControl("timbre", 0.7)       → controlTimbre_ = 0.7
writeCvPort("timbre", 0.3)      → cvTimbreOffset_ = 0.3
voice_.setTimbre(clamp(0.7 + 0.3)) → 1.0
```

Elke CV-ingang telt op bij de corresponderende knopwaarde, binnen [0,1].
Dit is hetzelfde patroon als `ElementsModule`.

### STK-vendoring

STK (MIT-licentie, CCRMA) moet in `firmware/lib/stk/`:

```
firmware/lib/stk/
├── include/stk/
│   ├── Stk.h                 — base class, typedef float StkFloat
│   ├── Instrmnt.h            — abstract instrument base
│   ├── Mandolin.h
│   ├── Clarinet.h
│   ├── Bowed.h
│   ├── Flute.h
│   ├── Brass.h
│   ├── Saxophony.h
│   ├── BlowHole.h
│   ├── BandedWG.h
│   └── SKINI.msg
└── src/
    ├── Stk.cpp
    ├── Mandolin.cpp
    ├── Clarinet.cpp
    ├── Bowed.cpp
    ├── Flute.cpp
    ├── Brass.cpp
    ├── Saxophony.cpp
    ├── BlowHole.cpp
    └── BandedWG.cpp
```

Configuratie: `StkFloat = float`, sample rate = `44100.0f`.
De STK `tick()` is sample-gebaseerd — `update()` roept 128× aan, perfect
voor Teensy AudioLibrary block-processing.

**Fallback zónder STK**: als `stk/Instrmnt.h` niet gevonden wordt, gebruikt
`StkSoundVoice` een simpele sinus (geen dependency), zodat de module altijd
compileert.

## Editor: mmbStkSound() seed

Zie `editor/src/modular-mb/seedModules.ts` — functie `mmbStkSound()`.

- 8 HP, intern rack
- Rotary switch (8 posities) voor sound-selectie
- 4 knobs: Level, Timbre, Mod, Str
- 5 CV-ingangen: V/Oct, Gate, Str+, Tim+, Mod+
- 1 audio-uitgang

## CPU-raming (Teensy 4.1, 600 MHz)

| Sound       | per voice | 8 voices | 16 voices |
|-------------|-----------|----------|-----------|
| Mandolin    | ~0.8%     | 6.4%     | 12.8%     |
| Clarinet    | ~1.2%     | 9.6%     | 19.2%     |
| Flute       | ~1.5%     | 12%      | 24%       |
| Bowed       | ~2.0%     | 16%      | 32%       |
| BandedWG    | ~2.5%     | 20%      | 40%       |

Zelfs 16 stemmen BandedWG blijft binnen 40% — ruimte genoeg voor effects,
mixer, CV-routing.

## Dependencies

- **STK 4.6+** (MIT) — The Synthesis ToolKit in C++ (ccrma.stanford.edu)
- Teensy AudioLibrary (ingebouwd)
- Eigen `AudioModule.h` (bestaand)

## Roadmap

1. [✅] Firmware `StkSoundModule.h` geschreven (met sinus-fallback)
2. [✅] Editor seed `mmbStkSound()` geschreven
3. [✅] Factory-registratie in `RegisterAllModules.h`
4. [ ] STK 4.6 downloaden en vendor-en in `firmware/lib/stk/`
5. [ ] `platformio.ini` include-path updaten voor `lib/stk/include`
6. [ ] Compileren op Teensy 4.1
7. [ ] Testen met elk sound-type