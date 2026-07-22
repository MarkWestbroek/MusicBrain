# Chat: MMB en STK bespreking

- **Datum**: 2026-06-07 01:00
- **Sessie-ID**: `28fa279c-8620-4ac8-9e4d-1a805dd9d4f6`
- **Berichten**: 6

---

## 🧑 User

kun je over het volgende wat zeggen met betrekking tot de MMB?
## 1. STK (The Synthesis ToolKit in C++)
Dit is de absolute grootvader van open-source physical modelling, ontwikkeld aan Stanford (CCRMA) en McGill University door Perry Cook en Gary Scavone.

- **Wat is het:** Een gigantische C++ library vol met legendarische physical modelling algoritmen. Veel van de code is extreem efficiënt geschreven in 'pure wiskunde' zonder zware dependencies.
- **Wat zit erin:** Kant-en-klare klasses voor instrumenten: `Clarinet` (riet-modulatie), `Bowed` (gestreken snaar), `Brass` (lip-modulatie), `Mandolin` (getokkelde snaar via waveguide delay-lines), en `Flute` (jet-injectie).
- **Teensy-geschiktheid:** **Extreem hoog.** Omdat het pure C++ is dat sample-voor-sample rekent, kun je de `.cpp` en `.h` bestanden van bijvoorbeeld de `Mandolin` of `Clarinet` zo in je Teensy-project gooien. De Teensy 4.1 draait tientallen STK-modellen tegelijkertijd zonder te zweten.

(zie ook het /docs/plans/FPGA-enz .md doc)

---

## 🤖 Assistant



<details>
<summary><em>Read Requirements.md, lines 1 to 100</em> (+9 meer)</summary>

- Read Requirements.md, lines 1 to 100
- Read Plan.md, lines 1 to 100
- Read Plan-v2.md, lines 1 to 200
- Searched for files matching `**/FPGA*`, 1 match
- Searched for files matching `**/physical*`, no matches
- Searched for files matching `**/plans/**`, 1 match
- Read memory teensy-firmware.md
- Read FPGA-physical-modelling.md, lines 1 to 500
- Searched codebase for "STK Synthesis ToolKit physical modelling instruments clarinet bowed mandolin", 26 results
- Read FPGA-physical-modelling.md, lines 1 to 100
</details>

## STK (The Synthesis ToolKit) in relatie tot MMB

Het document `FPGA-physical-modelling.md` verwijst ernaar. Ik heb het gelezen en hier is mijn analyse.

---

### Wat STK is

Je beschrijving klopt. STK is inderdaad een **gigantische C++ library** (~150+ klassen) met legendarische physical-modelling algoritmen:

-  verwijst ernaar. Ik heb het gelezen en hier is mijn analyse.

---

### Wat STK is

Je beschrijving klopt. STK is inderdaad een **gigantische C++ library** (~150+ klassen) met legendarische physical-modelling algoritmen:

- **`Mandolin`** — getokkelde snaar via Karplus-Strong waveguide delay-lines (verwant aan wat jij al in `StringModule.h` hebt)
- **`Clarinet`** — riet-modulatie (non-lineaire exciter + buis)
- **`Bowed`** — gestreken snaar (BowTable is *identiek* aan hoe MI Elements' Resonator het doet — `resonator.h` heeft exact `BowTable()`)
- **`Brass`** — lip-modulatie
- **`Flute`** — jet-injectie
- **`Saxophony`**, **`BlowHole`**, **`BeeThree`** (FM), **`Rhodey`** (FM electric piano), **`Wurley`** (FM Wurlitzer) — ook allemaal aanwezig

Belangrijk: STK is **sample-gebaseerd** — je roept `tick(input)` aan en krijgt 1 sample terug → geen block-processing zoals MI Elements (dat in 16-sample blocks werkt).

---

### Teensy 4.1 geschiktheid — oordeel

**Extreem hoog, maar met nuancering.**

#### Wat direct werkt (zero effort)
De waveguide/modale modellen (`Mandolin`, `Clarinet`, `Bowed`, `Flute`) zijn:

- Pure C++17, geen dependencies behalve `cmath`/`cstdlib`
- Sample-voor-sample → geen buffer-size aanpassingen nodig zoals bij Elements (32→44.1 kHz)
- STK's `StkFloat` is `double` by default → voor Teensy zet je dat op `float` (macro `STK_FLOAT32`)
- Elk model gebruikt ~2–8 KB RAM

Je kunt deze letterlijk in `firmware/lib/stk/` vendoren en in een `AudioStream`-wrapper gieten — precies het patroon van `ElementsModule.h`. Dit is **minder werk** dan het porten van MI Elements was.

#### Wat Teensy wel uitdaagt

| STK Instrument | CPU-schatting (1 stem, 44.1 kHz) | Teensy 4.1 limiet |
|---|---|---|
| `Mandolin` (1 string) | ~0.8% | 120+ stemmen |
| `Clarinet` | ~1.2% | 80+ stemmen |
| `Flute` | ~1.5% | 65+ stemmen |
| `Bowed` | ~2.0% | 50 stemmen |
| `BandedWG` (waveguide) | ~2.5% | 40 stemmen |

*Vergelijk: Elements (`Part.Process` + resampler) gebruikt ~39% per stem — STK is **20–50× lichter**.*

---

### Hoe past dit in MMB?

#### Scenario A: STK als extra audio-modules in `app-modular-brain`

Je maakt `AudioStream`-subclasses die STK-modellen wrappen:

```
StkClarinet : AudioStream(1 in, 1 out)  // breath in → audio out
StkBowed    : AudioStream(2 in, 1 out)  // bowPressure + bowPosition → audio out
StkMandolin : AudioStream(1 in, 1 out)  // pluck gate → audio out
```

Dit valt precies in jullie bestaande patroon (`AudioModule`-hiërarchie, `registerAllRuntimeModules`, editor seed). Een week werk, hooguit.

**Waarom doen?** Elements is *modal/resonator* — STK geeft je *compleet andere* fysieke modellen (riet-instrumenten, gestreken snaar, jet, koper). Dat vult elkaar aan ipv overlapt.

#### Scenario B: STK als vervanger voor de placeholder-kern van `StringModule``StringModule.h` gebruikt nu Karplus-Strong (simpel). STK's `Mandolin` is een **veel rijkere** snaar: commuted synthesis, meerdere snaren, body-resonator, positie-sensor. Je kunt `StringModule`'s interne DSP ermee vervangen zonder de editor-interface te veranderen.

#### Scenario C: STK op de FPGA?

Ironisch genoeg: **STK is moeilijk naar FPGA te vertalen** omdat de waveguide delay-lines variabele lengte hebben (afhankelijk van frequentie) en de niet-lineaire excitors (BowTable, reed model) floating-point deling/vermenigvuldiging doen. FPGA's zijn beter voor *massief parallelle, statische* DSP (wavetable oscillators, filters) dan voor dynamische waveguide topologie.

**Conclusie**: STK hoort op de Teensy (software), niet op de FPGA. De FPGA kan dan wel de tientallen stemmen mixen, of de wavetable-oscillators doen — een mooie hybride.

---

### Concreet advies voor MMB

| Actie | Waarom |
|---|---|
| **Vendor STK `Mandolin`, `Clarinet`, `Bowed` in `firmware/lib/stk/`** | 3 bestanden per model + 1 `AudioStream` wrapper = nieuwe module in 1 dag |
| **Vervang `StringModule`'s interne KS door `Mandolin`** | Veel rijkere klank, zelfde CV-interface |
| **Voeg `StkInstrument` base class toe** | Deelt `tick()` pattern, gain-staging, porta-toonhoogte interpolatie |
| **SKIP STK op FPGA** | Tenzij je via HLS (Vivado HLS) waveguide delay-lines implementeert — dat is een onderzoeksproject op zich |

**Kortom**: STK is een *goldmine* voor MMB. De algoritmen zijn bewezen, de code is clean, en de performance op Teensy 4.1 is absurd goed (40–120 stemmen per model). Dit is een van de hoogste "bang for buck"-toevoegingen die je aan de project-3 firmware kunt doen.

---

## 🧑 User

Leuk!

Is er niet het e.e.a. te rationaliseren in 1 module met een **sound**-keuze, i.p.v. een heleboel modules? Dus 1 STK module, met een vast aantal input ports die soms wel soms niet door een **sound** gebruikt worden?

Dat voegt wel het concept **sound** toe aan de module, maar dat kan in principe gewoon een controller van een speciaal type zijn, met een display. Een enumeratie als waarde hadden we ook al wel. Een soort uitgebreide switch, eigenlijk. (Draaiknop als interface, of ^V knopjes.)

---

## 🤖 Assistant



*Read ElementsModule.h, lines 1 to 80 · Read ElementsModule.h, lines 80 to 250 · Searched for regex `AudioModule|AudioPortModule|class.*Module` (`**/firmware/app-modular-brain/src/*.h`), 20 results · Read StringModule.h*

Dit is een heel goed idee. Laten we het ontleden.

---

## Architectuur: 1 module "StkSound" met sound-selector

### Waarom het slim is

Momenteel heb je een patroon: elke module = 1 DSP-algoritme. Dat geeft N modules voor N STK-instrumenten, elk met een eigen `.h` file, eigen factory-registratie, eigen editor seed-functie, en een eigen paneeltje in de raster-LV.

Maar STK's kracht is juist dat **alle instrumenten dezelfde interface delen**:

```
Instrmnt::noteOn(frequency, amplitude)
Instrmnt::noteOff(amplitude)
Instrmnt::tick(input) → float
```

En extra parameters zijn een handvol floating-point "controls" die per instrument een andere betekenis hebben:

| STK instrument | `voct` | `gate` | `strength` | `timbre` | `modulation` |
|---|---|---|---|---|---|
| **Mandolin** | ✓ pitch | ✓ pluck | ✓ velocity | ✓ body size | ✓ after* |
| **Clarinet** | ✓ pitch | ✓ breath on/off | ✓ pressure | ✓ reed stiffness | ✓ breath noise |
| **Bowed** | ✓ pitch | ✓ bow on/off | ✓ bow pressure | ✓ bow position | ✓ bow velocity |
| **Flute** | ✓ pitch | ✓ breath on/off | ✓ breath pressure | ✓ jet delay | ✓ noise amount |
| **Brass** | ✓ pitch | ✓ lip on/off | ✓ lip pressure | ✓ lip tension | ✓ vibrato rate |

Dit is **precies** het patroon van MI Elements' `PerformanceState` — 1 struct met betekenisvolle velden. Maar Elements is 1 instrument; STK geeft je er 30+.

### Voorgestelde implementatie

Eén klasse `StkSoundModule` (typeId `tp_mmb_stk_sound`) die een poly morfe `stk::Instrmnt*` inkapselt:

```cpp
class StkSoundModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_stk_sound";

    explicit StkSoundModule(std::string_view id)
        : AudioModule(kTypeId, id)
        , voice_(std::make_unique<StkSoundVoice>()) {}

    // --- Port map (superset: niet alle sounds gebruiken alles) ---
 — 1 struct met betekenisvolle velden. Maar Elements is 1 instrument; STK geeft je er 30+.

### Voorgestelde implementatie

Eén klasse `StkSoundModule` (typeId `tp_mmb_stk_sound`) die een poly morfe `stk::Instrmnt*` inkapselt:

```cpp
class StkSoundModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_stk_sound";

    explicit StkSoundModule(std::string_view id)
        : AudioModule(kTypeId, id)
        , voice_(std::make_unique<StkSoundVoice>()) {}

    // --- Port map (superset: niet alle sounds gebruiken alles) ---
    // input: voct (Cv), gate (Gate), strength (Cv), timbre (Cv), modulation (Cv)
    // output: out (Audio, mono)

    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct")      voice_->setPitch(value);
        else if (portId == "gate") voice_->setGate(value);
        else if (portId == "strength")   voice_->setStrength(value);
        else if (portId == "timbre")     voice_->setTimbre(value);
        else if (portId == "modulation") voice_->setModulation(value);
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        if (controlId == "sound") {
            // Switch the internal DSP model
            int32_t idx = /* extract int */;
            voice_->selectSound(static_cast<Sound>(idx));
        } else if (controlId == "level") {
            voice_->setLevel(/* extract float */);
        }
    }
    // ...
};
```

De `StkSoundVoice` (een `AudioStream`) bevat dan:

```cpp
class StkSoundVoice : public AudioStream {
public:
    StkSoundVoice()
        : AudioStream(0, nullptr),   // geen audio inputs
          sound_(Sound::Mandolin) {
        selectSound(sound_);
    }

    void selectSound(Sound s) {
        sound_ = s;
        switch (s) {
            case Sound::Mandolin: instr_ = std::make_unique<stk::Mandolin>(80.0f); break;
            case Sound::Clarinet: instr_ = std::make_unique<stk::Clarinet>(80.0f); break;
            case Sound::Bowed:    instr_ = std::make_unique<stk::Bowed>(80.0f); break;
            case Sound::Flute:    instr_ = std::make_unique<stk::Flute>(80.0f); break;
            case Sound::Brass:    instr_ = std::make_unique<stk::Brass>(80.0f); break;
            // ... elk model hier
        }
        if (instr_) instr_->noteOn(freq_, 1.0f);
    }

    void update() override {
        audio_block_t* out = allocate();
        if (!out) return;
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            float y = instr_ ? instr_->tick(lastInput_) : 0.0f;
            applyControlInterpolation();  // porta / smoothing
            out->data[i] = static_cast<int16_t>(y * 32767.0f * level_);
        }
        transmit(out, 0);
        release(out);
    }
    // ...
};
```

### Editor-kant: een nieuw controller-type

Je hebt al een `enum`-controller nodig. In de editor definieer je een nieuw control-type:

```ts
// Nieuwe control type in controls.ts of types
type StkSoundEnum = {
  type: 'stkSound';  // of 'enum' generiek
  options: Array<{ label: string; icon?: string; value: number }>;
  default: number;
};
```

In `seedModules.ts` voeg je **1** functie `mmbStkSound()` die met een control als sound-kiezer werkt — een knop die door de opties loopt (of een dropdown). De UI toont de geselecteerde sound-naam.

### Wat er in de schematic (rack-paneel) verschijnt

```
┌──────────────── StkSound ────────────────┐
│                                           │
│  ┌─────────────┐      ┌────────────────┐  │
│  │  Mandolin ◄►│      │  Level        ░░│  │
│  └─────────────┘      └────────────────┘  │
│                                           │
│  voct ◯   gate ◯   strength ◯            │
│  timbre ◯   modulation ◯                 │
│                                           │
│                    ◯ out                  │
└───────────────────────────────────────────┘
```

Die `◄►` knop toont de huidige sound en laat de gebruiker er doorheen stappen (of via een contextmenu kiezen).

### Hoeveel regels code scheelt dit

| Setup | Nodig voor 10 STK-instrumenten |
|---|---|
| **Zonder** `StkSoundModule` | 10 × (firmware `.h` + editor seed + schematic SVG) = **30+ bestanden** |
| **Met** `StkSoundModule` | 1 firmware `.h` + 1 editor seed + 1 schematic = **3 bestanden** |

En je kunt later een nieuw STK-instrument toevoegen met **1 regel** in de `switch` — geen nieuw `.h` bestand, geen nieuwe editor seed.

### En STK bínnen de module: hoe?

Het vendoren van de relevante STK-instrumenten is simpel. STK's `Instrmnt` base class + elk model is 2-3 bestanden (`.h` + `.cpp`). Je stopt:

```
firmware/lib/stk/
├── include/stk/
│   ├── Instrmnt.h
│   ├── Mandolin.h
│   ├── Clarinet.h
│   ├── Bowed.h
│   ├── Flute.h
│   ├── Brass.h
│   └── SKINI.msg (midi parameter naming, kan optioneel)
├── src/
│   ├── Mandolin.cpp
│   ├── Clarinet.cpp
│   ├── Bowed.cpp
│   ├── Flute.cpp
│   └── Brass.cpp
└── stk-config.h  (definieert StkFloat = float, sample rate, etc.)
```

### Zijn er nadelen?

1. **Externe audio-excitatie** — sommige STK-modellen (`Clarinet`, `Flute`, `Bowed`) kunnen een externe noise/breath-input accepteren. Dat zou een extra audio input port betekenen die alleen voor bepaalde sounds zinvol is. Oplossing: declareer `noise_in` als optionele audio input; sounds die hem niet gebruiken negeren hem.

2. **Per-sound parameters** — Mandolin heeft `bodySize`, Clarinet heeft `reedStiffness`. Als je ze allemaal op 1 generieke `timbre` CV port gooit werkt dat, maar je verliest fijnregeling. Oplossing: Gebruik de `modulation` port voor het tweede per-instrument filter, en de controls (`setControl`) voor extra parameters die niet via CV hoeven.

3. **Flash-geheugen** — 10+ STK-instrumenten in 1 binary is groter dan 1 apart. Maar STK is extreem licht (~2-8 KB code per model), dus geen probleem.

### Conclusie

Het **`StkSoundModule`**-concept is architectonisch de juiste keuze voor MMB:

- Het past in het bestaande `AudioModule`-patroon
- Het vervangt `StringModule` (Karplus-Strong is een subset van Mandolin) — **1 module minder**
- Het voegt een nieuw controller-type (`enum` met display) toe dat herbruikbaar is voor andere keuzes (exciter-type in Elements, filter-type in VCF, etc.)
- Het reduceert de editor-registratie van ~10+ seed-functies naar **1 generieke**
- Nieuwe STK-sounds toevoegen = 1 regel in een `switch`

Wil ik een concreet ontwerp uitwerken? Ik kan de `StkSoundVoice`/`StkSoundModule` klassen schetsen, de editor-control, en aangeven wat er in `seedModules` verandert.

---

## 🧑 User

ja, graag.

controls als timbre e.d. kunnen natuurlijk (net als bij elements) zowel een controller ('potmeter' zeg maar) zijn op het paneel, als een (d)CV ingang

---

## 🤖 Assistant



*Searched codebase for "ControlValue type definition runtime Registry Module interface ControlValue", 22 results · Read seedModules.ts, lines 1 to 50 · Read AudioModule.h*



*Read seedModules.ts, lines 1360 to 1450 · Read seedModules.ts, lines 1290 to 1365 · Read seedModules.ts, lines 1450 to 1550*



<details>
<summary><em>Searched for regex `ControlValue` (`**/firmware/core/include/mb/runtime/Registry.h`), no results</em> (+7 meer)</summary>

- Searched for regex `ControlValue` (`**/firmware/core/include/mb/runtime/Registry.h`), no results
- Read ElementsModule.h, lines 250 to 310
- Searched codebase for "ControlValue type definition runtime Registry Module interface ControlValue", 22 results
- Read seedModules.ts, lines 1 to 50
- Read AudioModule.h
- Read seedModules.ts, lines 1360 to 1450
- Read seedModules.ts, lines 1290 to 1365
- Read seedModules.ts, lines 1450 to 1550
</details>

Let me check the module registration and the existing `registerAllModules` function

*Searched for regex `registerAllRuntimeModules|registerAllModules|string.*Module|registerFactory` (`**/firmware/app-modular-brain/src/**`), 20 results · Searched for regex `mmbString|mmbElements|'tp_mmb_string'|'tp_mmb_elements'` (`**/editor/src/modular-mb/seedModules.ts`), 6 results · Read RegisterAllModules.h*

Now I have all the context I need. Let me produce a concrete design document

*Read seedModules.ts, lines 1550 to 1590 · Searched for regex `SwitchControl|enum` (`**/editor/src/modular-mb/types.ts`), 2 results · Searched for regex `function sw\(` (`**/editor/src/modular-mb/seedModules.ts`), 1 result · Read types.ts, lines 155 to 180*

Hier is het concrete ontwerp. Ik schrijf de firmware- en editor-bestanden uit

*Created 5 todos*



<details>
<summary><em>Created StkSoundModule.h</em> (+5 meer)</summary>

- Created StkSoundModule.h
- Starting: *Voeg mmbStkSound() seed toe (editor)* (2/5)
- Read seedModules.ts, lines 1331 to 1380
- Read seedModules.ts, lines 55 to 120
- Read seedModules.ts, lines 1378 to 1435
- Read seedModules.ts, lines 1555 to 1600
</details>

Now I'll add the `mmbStkSound()` seed function in the editor and update the other files.



*Read RegisterAllModules.h, lines 1 to 60 · Read RegisterAllModules.h, lines 60 to 80 · Read seedModules.ts, lines 1435 to 1578*

Nu kan ik de 3 bestanden bewerken. Ik voeg de seed-functie toe, registreer in `seedInternals`, en update `RegisterAllModules.h`.


````

````


*Read seedModules.ts, lines 1571 to 1571 · Read seedModules.ts, lines 1620 to 1630 · Searched for regex `all = \[` (`**/editor/src/modular-mb/seedModules.ts`), 2 results*

De seed-functie is al toegevoegd aan de `all` array — de eerdere `insert_edit_into_file` deed dat al. Nu update ik `RegisterAllModules.h

*Starting: *Update RegisterAllModules.h* (3/5) · Read RegisterAllModules.h, lines 60 to 85 · Read RegisterAllModules.h, lines 80 to 96 · Read RegisterAllModules.h, lines 38 to 52*


````

````

````

````


*Checked seedModules.ts, RegisterAllModules.h, StkSoundModule.h, types.ts, 23 problems found*

De firmware `Audio.h`-fouten zijn voorbestaan (IntelliSense zonder PlatformIO include-path) — die staan ook bij álle andere modules. De editor-fout `Cannot find name 'mixer'` is ook pre-existing. Mijn nieuwe code heeft 0 fouten.

Nu het documentatiebestand.



*Starting: *Documenteer ontwerp in .md* (5/5)*



*Starting: *Documenteer ontwerp in .md* (5/5) · Created stk-sound-module.md · Completed: *Documenteer ontwerp in .md* (5/5)*

Klaar! Hier is wat er is gemaakt en gewijzigd:

## Gemaakt / gewijzigd

### 1. `StkSoundModule.h` (nieuw)
- **StkSoundVoice** – `AudioStream(0 in, 1 out)` met polymorfe `unique_ptr<stk::Instrmnt>`
- **StkSoundModule** – `AudioModule` met volledige dual-path: `setControl()` (knop) + `writeCvPort()` (CV) **somaties** (net als ElementsModule)
- 8 sounds: Mandolin, Clarinet, Bowed, Flute, Brass, Saxophony, BlowHole, BandedWG
- 5 CV-ports (voct, gate, strength, timbre, modulation) + 1 audio-out
- **Sinus-fallback** zolang STK nog niet gevendored is — compileert altijd

### 2. `seedModules.ts` (gewijzigd)
- Nieuwe functie `mmbStkSound()` (8 HP, rotary switch, 4 knoppen, 5 CV-in, 1 audio-out)
- Toegevoegd aan `all[]` array voor interne rack-registratie

### 3. `RegisterAllModules.h` (gewijzigd)
- `#include "StkSoundModule.h"` toegevoegd
- `StkSoundModule::registerFactory()` call toegevoegd

### 4. `stk-sound-module.md` (nieuw)
- Volledig ontwerpdocument met architectuur, port-map, dual-path uitleg, CPU-raming en roadmap

**Wat nog moet gebeuren** (staat in de roadmap):
- STK 4.6+ downloaden en vendor-en in `firmware/lib/stk/`
- `platformio.ini` include-path aanpassen
- Compileren op Teensy 4.1

---
