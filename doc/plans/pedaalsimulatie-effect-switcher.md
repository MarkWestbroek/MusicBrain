# Pedalen in de effect-switcher: catalogus, klanksimulatie en de loop naar Cortex

Datum: 2026-10-03. Status: **voorstel, nog niets gebouwd.** Drie vragen van
Mark: (a) een standaardverzameling pedalen meeleveren, (b) bruikbare
klanksimulaties van gitaarpedalen, (c) vanuit de Modular MB-editor een
effect send/return naar de effect-switcher. Plus de spin-off: effectmodules
als Teensy-pedaal voor gitaristen.

## 1. Wat er al ligt

Verkend 2026-10-03 in `editor/src/effect-switcher/`, `editor/src/modular-mb/`,
`firmware/`, `hardware/schematics/gswitch-*` en de plannen.

**Reflex (effect-switcher) nu.** Een `EffectDevice` is merk + model +
categorie + relaisnummer + positie op het canvas (`types.ts`). Geen knoppen,
geen MIDI, geen mono/stereo, geen klank. De enige "catalogus" is de demo in
`actions.ts` (`seedDemo`: TS9, DS-1, Phase 90, DD-7, BigSky). De simulatie
(`SimulationPanel.tsx`, `midiSim.ts`) laat MIDI-bytes en relais zien en heeft
geen audiopad: geen Web Audio, geen wasm. De firmware kent per patch al
`midiProgram` en `midiCcOut` (`firmware/app-effect-switcher/*/src/midi_effect.h`);
de editor heeft die velden niet, terwijl CC's bij patchwissel voor de eerste
gebruiker een MVP-eis is (`doc/effect editor notes.md`).

**Cortex (Modular MB) nu.** Vrijwel elk pedaaltype bestaat al als module met
een wasm-kern die dezelfde C++ is als de Teensy draait
([module-catalogus.md](../module-catalogus.md), sectie Effect):

| Pedaaltype | Module | Opmerking |
|---|---|---|
| overdrive / distortion / fuzz | `tp_mmb_drive` (TS / RAT / Big Muff-families) | mono, 4× overbemonsterd |
| buizenversterker + kast | `tp_mmb_tube` (Amp: Fender/Marshall/Vox-stack, Sag, kast; Studio) | vaste kastsimulatie, IR nog open |
| compressor | `tp_mmb_comp` (pedaalachtig), `tp_mmb_fet_comp`, `_opto_comp`, `_diode_comp`, `_bus_comp`, `_varimu_comp` | |
| EQ / boost | `tp_mmb_para_eq`, `_console_eq`, `_program_eq` | geen losse clean boost |
| phaser | `tp_mmb_phaser`, `tp_mmb_stereo_phaser` | |
| vibe | `tp_mmb_vibe` (univibe-familie) | |
| chorus / flanger | `tp_mmb_bbd_chorus` (2–6 ms = flanger), `tp_mmb_ensemble` | |
| delay | `tp_mmb_echo`, `tp_mmb_tape_echo`, `tp_mmb_stereo_tape_echo`, `tp_mmb_digital_echo` | **geen BBD-delay** (DM-2/Memory Man) |
| tremolo | `tp_mmb_tremolo` (amp/opto/harmonic/pan) | |
| reverb | `tp_mmb_reverb` (plate/spring), `tp_mmb_elements_reverb`, `tp_mmb_shimmer` | |
| wah | `tp_mmb_wah` (pedaal, auto, LFO; Cry Baby / klinker) | |
| pitch | `tp_mmb_octaver` (OC-2/Octavia), `tp_mmb_harmonizer`, `tp_mmb_ringmod`, `tp_mmb_freqshift` | |
| rotary | `tp_mmb_rotary` | |
| audio-in / uit | `tp_mmb_audioin` (microfoon of interface via `getUserMedia`), `tp_mmb_out` | web-audio, geen apparaatkeuze |

Ontbreekt: BBD-delay, noise gate, clean boost (Klon-achtig), kast-IR-lader,
looper (geen DSP, wel een pedaal op elk bord). Drive en Wah zijn gemeten
maar nog niet beluisterd (`modulecollectie-analyse-2026-10.md`).

**Sub-patch / samengestelde module:** bestaat niet, en
`doc/uml/11-simulation-wasm.md` §3b sluit nesten op graafniveau bewust uit.
Wat er wél is: `ModuleType.simulatedBy` + `simulationControlMap` (ADR 0009):
een extern moduletype zonder DSP wordt in de simulator gespeeld door een
interne module. Dat is precies de vorm van "echt pedaal X, klinkt als
`tp_mmb_Y`".

**Hardware.** Een Reflex-loop is een DPDT-relais met SEND/RETURN-jacks,
bypass op het NC-contact ([guitar-switcher-spec.md](../guitar-switcher-spec.md)).
Cortex heeft **geen analoge audio-in of -uit**: alleen USB-audio
(`AudioInModule.h`: "De brain heeft geen analoge audio-ingang"). Op het
busboard is een codec-header (J17) en I2S gereserveerd, niet gebouwd. Er is
geen gedocumenteerde koppeling tussen Reflex en Cortex.

## 2. Ontwerpkeuze: een pedaal is een moduletype

Eén catalogus, gebruikt door beide editors:

```ts
// editor/src/pedals/catalog.ts (nieuw, gedeeld)
{
  id: 'pedal_ts9', brand: 'Ibanez', model: 'TS9', categoryId: 'overdrive',
  io: 'mono',                                  // 'mono' | 'stereo' | 'mono-in-stereo-out'
  controls: [ { id: 'drive', label: 'Drive' }, { id: 'tone', label: 'Tone' }, { id: 'level', label: 'Level' } ],
  sim: { typeId: 'tp_mmb_drive',
         controlMap: { drive: 'drive', tone: 'tone', level: 'level' },
         preset: { mode: 0, mix: 1 } },        // vaste standen van de interne module
  midi: null                                   // of { pc: true, cc: [{ id: 'mix', cc: 20 }] } voor MIDI-pedalen
}
```

Elke catalogusregel wordt bij het laden een **extern `ModuleType`** met
`simulatedBy` en `simulationControlMap`, plus één kleine uitbreiding op het
bestaande mechanisme: `simulationPreset` (vaste waarden voor controls van de
interne module die het pedaal niet heeft, zoals `mode` = OD). Het paneel is
een getekend pedaalfront (knoppen, voetschakelaar-LED), geen foto: de
online beeldzoeker in `ChainPanel.tsx` (allthepedals, effectsdatabase) blijft
optioneel en levert geen rechtenvrije afbeeldingen; merk- en modelnamen als
beschrijving zijn gewoon toegestaan.

Winst van deze keuze:

- Reflex krijgt pedalen mét knoppen en klank zonder eigen DSP-laag.
- Dezelfde TS9 is in Cortex als module in een rack te zetten (de
  `simulatedBy`-route bestaat al), dus een Cortex-patch kan "de pedalen van
  Mark" bevatten.
- Een nieuwe pedaalfamilie die geen interne module heeft (BBD-delay) is één
  nieuwe `mmb_dsp`-kern volgens het vaste recept (kern, `*Module.h`,
  `RegisterAllModules.h`, `*_wasm.cc`, paneel in `seedModules.ts`,
  `contract_dump.py`, `npm test`, `npm run catalog`).

**Reflex-datamodel.** `EffectDevice` krijgt `catalogId?` en
`settings?: Record<controlId, number>`: de knopstanden *zoals ze op het
pedaal staan*. Dat is per apparaat, niet per patch, want een echt pedaal
onthoudt niets; een Reflex-patch schakelt alleen bypass. Alleen een
MIDI-pedaal krijgt per patch iets mee, via `midiProgram`/`midiCcOut` op
`SwitcherPatch`, dezelfde velden die de firmware al leest. Dat verschil
(relais versus MIDI) is voor de doelgroep precies de les die een
switcher leert.

## 3. (a) De standaardverzameling

Een eerste set van ~30 regels, per categorie uit `DEFAULT_CATEGORIES`, elk
met een bestaande interne module als klank:

| Categorie | Pedalen (eerste set) | Klank |
|---|---|---|
| overdrive | Ibanez TS9/TS808, Boss SD-1, Klon-achtige boost | `tp_mmb_drive` mode OD; boost = lage drive, level hoog |
| distortion | Boss DS-1, ProCo RAT, MXR Distortion+ | `tp_mmb_drive` mode Dist |
| fuzz | Big Muff, Fuzz Face, Tone Bender | `tp_mmb_drive` mode Fuzz |
| compressor | MXR Dyna Comp, Boss CS-3 | `tp_mmb_comp` |
| eq | Boss GE-7, MXR 10-band | `tp_mmb_para_eq` |
| phaser | MXR Phase 90, EHX Small Stone, Uni-Vibe | `tp_mmb_phaser`, `tp_mmb_vibe` |
| flanger | EHX Electric Mistress, Boss BF-2 | `tp_mmb_bbd_chorus` (delay 2–6 ms, feedback) |
| chorus | Boss CE-2, EHX Small Clone, Roland Dimension D | `tp_mmb_bbd_chorus`, `tp_mmb_ensemble` |
| tremolo | Boss TR-2, Fulltone Supa-Trem | `tp_mmb_tremolo` |
| delay | Boss DD-7, Strymon El Capistan, Boss DM-2 | `tp_mmb_digital_echo`, `tp_mmb_tape_echo`; DM-2 pas na de BBD-delay-kern |
| reverb | EHX Holy Grail, Strymon BigSky | `tp_mmb_reverb`, `tp_mmb_shimmer` |
| wah / filter | Dunlop Cry Baby, MXR Envelope Filter | `tp_mmb_wah` |
| pitch | Boss OC-2, Digitech Whammy | `tp_mmb_octaver`, `tp_mmb_harmonizer` |
| versterker | "amp + kast" als laatste schakel | `tp_mmb_tube` (Amp-stand) |
| utility | tuner, looper, buffer, noise gate | geen klank (passief / later) |

De lijst is een JSON-achtige tabel in code, niet een database: toevoegen is
één regel. De demo in `seedDemo` gaat over op catalogus-id's.

## 4. (b) Klanksimulatie in de Reflex-simulatie

Geen tweede audio-engine. De Reflex-keten wordt een **synthetisch
`ModularProject` + `Patch`** en gaat door de bestaande `AudioEngine`
(`sim/AudioEngine.ts`): één `tp_mmb_audioin`, per actief pedaal een
module-instantie van het catalogus-type (controls uit `settings`), kabels in
ketenvolgorde, aan het eind optioneel de amp+kast, dan `tp_mmb_out`.
Bypass = het pedaal niet in de keten. De wasm-kernen, de worklet, de
microfoon-/interface-ingang en de poly-loze graafopbouw zijn er al.

Wat er bij moet:

- **Bron.** Gitaar via een audio-interface (`getUserMedia` werkt al; een
  apparaatkiezer ontbreekt, de Teensy-vergelijkmodus in `AudioEngine.ts`
  heeft het stukje `enumerateDevices` dat we nodig hebben) of een ingebouwde
  **DI-opname** (droge elektrische gitaar, een paar frasen, CC0, in
  `editor/public/`). De repo heeft nu alleen een nylon-samplerbank.
- **Pedaalfront.** Elk pedaal in de keten als kaart met zijn knoppen,
  getekend door `ModulePanel` (zelfde virtuele-paneel-truc als bij het
  patch-front); draaien schrijft `settings` en gaat live naar de engine.
- **Schakelen.** Eerst: patchwissel = graaf opnieuw bouwen (de engine doet
  dat al bij een topologiewijziging). Daarna: alle pedalen altijd bouwen en
  bypass als crossfade over een `Tone.Gain`, zodat een relaisklik geen gat
  geeft.
- **Mono/stereo.** De keten is mono tot het eerste stereo-pedaal (zoals op
  een echt bord); de catalogus zegt per pedaal wat het is.

Zo klinkt de Reflex-simulatie zoals de patch die hij schakelt, en toont de
bestaande Box-view er nog steeds de MIDI-bytes en relais bij.

## 5. (c) Send/return tussen Cortex en Reflex

Drie lagen, van klein naar groot.

**5.1 In de simulator: een FX LOOP-module.** Nieuwe interne module
`tp_mmb_fx_loop`: `in_l/in_r` → `send_l/send_r` (uit) en
`return_l/return_r` (in) → `out_l/out_r`, met `mix` en `bypass`. In de
simulator "zit" in de loop een Reflex-keten: de keten uit §4 wordt als
deelgraaf in dezelfde `AudioEngine` gebouwd tussen send en return. Dat is de
black box andersom: vanuit Cortex is het pedalboard één module, vanuit
Reflex is een Cortex-patch één pedaal, en de audio-poorten op het
[patch-front](patch-front.md) zijn de jacks van dat pedaal. Firmware-kant
van de module: een doorgeef-module die send/return op de USB-audio-uitgang
en -ingang legt (zie 5.2).

**5.2 Hardware, nu al: via USB-audio en een interface.** Cortex heeft
alleen USB-audio. Met een audio-interface aan dezelfde pc werkt een loop
vandaag: Teensy → pc → interface-uit → pedaal → interface-in → pc →
Teensy. Latentie van twee USB-passages, maar de keten klinkt en de relais
schakelen echt. Geen nieuwe hardware, wel een pc in het pad.

**5.3 Hardware, straks: een audio-I/O-kaart.** Een Cortex-kaart met codec
(I2S op de gereserveerde busboardlijnen), twee lijn-uitgangen (SEND) en twee
ingangen (RETURN) waarvan één **hoogohmig** (JFET-buffer) voor een gitaar
direct in. Dat is de kaart die zowel de echte send/return als de spin-off
(§7) mogelijk maakt. Hardwareproject; eerste stap is een werkende I2S-codec
aan de Teensy op het busboard, los van de switcher.

**5.4 Besturing: programmanummers koppelen.** Reflex-patch `id` is al het
MIDI-programmanummer; Cortex-patch heeft `programNumber`. Met
`midiProgram`/`midiCcOut` in de editor (stap 1 hieronder) stuurt de
Reflex-brain bij een voetschakelaar een PC naar Cortex, en een "song" is één
nummer op beide. Fysiek: Reflex MIDI OUT (DIN) → Cortex, via de
transportfasen uit [control-surface.md](control-surface.md) (fase 2 USB-host,
fase 3 DIN op de Teensy-UART).

## 6. Stappen

| Stap | Waar | Wat | Grootte |
|---|---|---|---|
| 1 | editor (Reflex) | `midiProgram` + `midiCcOut` op `SwitcherPatch`, in de Patches-tab en de device-sync; MVP-eis eerste gebruiker | klein |
| 2 | editor (gedeeld) | `editor/src/pedals/catalog.ts` (~30 pedalen) → externe `ModuleType`s met `simulatedBy`; `simulationPreset`-uitbreiding; `EffectDevice.catalogId` + `settings`; tab "Pedalen" met getekend pedaalfront | middel |
| 3 | editor (Reflex) | audiopad: keten → synthetisch project → `AudioEngine`; apparaatkiezer; DI-opname; pedaalkaarten met knoppen | middel |
| 4 | editor (Reflex) | bypass als crossfade i.p.v. herbouw | klein |
| 5 | fw + wasm | BBD-delay-kern (`bbd_delay.h`: BBD-chorus-kern met lange lijn, compander, klokruis, filterbank) → DM-2/Memory Man; noise gate; clean boost als Drive-stand of eigen kern | middel |
| 6 | fw + editor | `tp_mmb_fx_loop`: sim-deelgraaf (5.1) en USB-doorgeef op de Teensy (5.2) | middel |
| 7 | hardware | audio-I/O-kaart met codec en Hi-Z-ingang (5.3) | groot |
| 8 | fw | Reflex-brain stuurt PC/CC naar Cortex; Cortex DIN/USB-host MIDI-in (5.4) | middel, na control-surface fase 2/3 |

Stap 1 en 2 kunnen tegelijk; stap 3 is de eerste die "klinkt". Luisteren
naar Drive en Wah hoort bij stap 3: de catalogus maakt die modules voor het
eerst voor gitaristen hoorbaar.

## 7. Spin-off: effectmodules als Teensy-pedaal

Dezelfde `mmb_dsp`-kernen draaien al op de Teensy (`KernelStream.h`). Een
pedaal is dan: Teensy 4.1 + codec (het PJRC-audioshield met SGTL5000 is de
snelste weg: lijn-in/uit op 44,1 kHz; een JFET-buffer ervoor voor de
gitaar) + een paar potmeters + voetschakelaar + relais-bypass, in een
stompbox-behuizing. Firmware: een uitgekleed `app-modular-brain` met één
vaste patch (een front!) en de potmeters op de front-controls; de
patch-pool levert de klanken. De audio-I/O-kaart uit 5.3 en dit pedaal delen
het analoge front-end, dus die twee horen in één hardwarestap. Later; eerst
moet de simulatie laten horen welke modules een gitarist wil hebben.

## 8. Besluiten gevraagd

1. **Pedaal = extern moduletype met `simulatedBy`** (§2), gedeeld tussen
   Reflex en Cortex, in plaats van een eigen pedaalmodel in de switcher.
2. **Knopstanden per apparaat, bypass per patch, MIDI per patch** (§2):
   trouw aan hoe een bord werkt. Of wil je dat de simulatie ook
   niet-MIDI-pedalen per patch anders laat staan ("wat als")?
3. **Bron voor de simulatie**: eigen DI-opname (CC0) opnemen, of alleen
   live gitaar via een interface?
4. **Volgorde**: stap 1 (MIDI-velden, MVP) vóór alles; daarna 2+3, of eerst
   de FX LOOP (stap 6) omdat die de twee editors verbindt?
