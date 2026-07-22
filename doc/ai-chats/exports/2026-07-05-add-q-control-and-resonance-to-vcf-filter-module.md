# Claude Code-sessie-export

> **Let op:** export van een **Claude Code**-sessie. Gebruiker- en assistentteksten zijn letterlijk overgenomen; tool-aanroepen staan als compacte `🔧`-annotaties (hun output niet); interne redeneerblokken weggelaten.
>
> - **Datum:** 2026-07-05
> - **Sessie-id:** `6269ca5a-df62-4f4e-8f6b-aae3a37e020b`
> - **Branch:** `main`

---

## 👤 Gebruiker (1)

De filtermodule (VCF) in de brain en in de editor dus, heeft alleen een cutoff Freq CV in. Ik zou er graag een Q CV bij willen. Kan deze module (komt uit de teensy audio lib) in principe ook resonantie? Dan zou dat ook mooi zijn. Een control en een CV.

Indien niet: is er een module denkbaar die dit wel kan? Ik ben in een ander project (E:\Dev\Gowin\MS20_synth_voice) op een FPGA aan een 'hybride Physical modeling / MS20 synth voice' bezig, een physical modeling voice met een MS-20 filter emulatie. Maar misschien zijn er wel simpeler MS-20 filter emu's die wel op een teensy zouden kunnen draaien.

Wil je eens onderzoeken?

**🤖 Claude:**

Ik ga eerst kijken hoe de VCF-module nu in de firmware en editor is opgezet, en welke Teensy-audio-object eronder ligt.
> 🔧 `Grep` — cutoff|Cutoff|filter|Filter
> 🔧 `Grep` — cutoff|vcf|Vcf|VCF
> 🔧 `Read` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\VcfModule.h

**🤖 Claude:**

De firmware wrapt `AudioFilterStateVariable`. Nu de editor-kant bekijken.
> 🔧 `Grep` — vcf
> 🔧 `Read` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\audio\Vcf.ts
> 🔧 `Grep` — writeCvPort|rate_cv|depth_cv|PortKind
> 🔧 `Grep` — vcf
> 🔧 `ToolSearch`
> 🔧 `WebSearch`
> 🔧 `WebSearch`
> 🔧 `WebFetch`

**🤖 Claude:**

Onderzoek klaar. Hier de bevindingen.

## Kort antwoord

Ja — de huidige module **kan al resonantie**, en een Q-CV erbij is goed te doen. En voor een écht MS-20-achtig filter zijn er twee realistische routes op de Teensy: de kant-en-klare `AudioFilterLadder` (Moog-stijl, mét audio-rate resonantie-CV) of een zelfgebouwde Korg35/Sallen-Key-module (het echte MS-20-karakter).

## 1. De huidige VCF heeft al een Q — alleen geen CV erop

[VcfModule.h](firmware/app-modular-brain/src/VcfModule.h) wrapt `AudioFilterStateVariable`, en die heeft al een `q`-control (regel 93–94, `vcf_.resonance(...)`), net als de editor-kant in [Vcf.ts:59](editor/src/modular-mb/runtime/audio/Vcf.ts#L59). Er is dus al een Q-knop; wat ontbreekt is alleen de CV-ingang.

Het punt: `AudioFilterStateVariable` heeft maar twee audio-ingangen (signaal + frequentie-CV). Er is **geen audio-rate resonantie-ingang** in dat object. Maar dat hoeft geen blokkade te zijn, want jullie CV-domein loopt toch op de ~1 kHz control-tick. De [PhaserModule](firmware/app-modular-brain/src/PhaserModule.h#L128-L131) doet precies dit al: een `PortKind::Cv`-poort waarvan `writeCvPort()` direct een parameter zet. Voor de VCF zou dat worden:

- nieuwe poort `q_cv` (kind `Cv`), `writeCvPort` → `vcf_.resonance(baseQ + qCvAmt * value)`, eventueel met wat smoothing tegen zipper bij hoge Q;
- optioneel een `q_cv_amt`-control naast de bestaande `cv_amt`;
- editor: poort + knob in `seedModules.ts` (mmbVcf), en in de sim is `Tone.Filter.Q` een AudioParam, dus daar is het triviaal.

Beperking: de modulatie is control-rate (effectief per audio-blok, ~350 Hz), dus prima voor LFO's en envelopes op Q, niet voor audio-rate FM van de resonantie. Twee kanttekeningen die ik tegenkwam: de Teensy-docs adviseren voor dit object Q tussen 0,7 en 5,0 (de editor-knop gaat nu tot 12, dat kan instabiel/clippend worden) en de cutoff hoort onder ~fs/6 ≈ 7,3 kHz te blijven (de knop gaat tot 18 kHz). Als je toch aan deze module zit, is dat een mooi moment om die ranges gelijk te trekken.

## 2. Audio-rate resonantie-CV: `AudioFilterLadder` zit al in de lib

Dit is de verrassend makkelijke winst. De Teensy Audio Library bevat sinds Teensyduino 1.54 een `AudioFilterLadder` (Huovilainen-model van de Moog-ladder, CMJ 2006) met **drie** ingangen: kanaal 0 = audio, kanaal 1 = frequentie-CV, kanaal 2 = **resonantie-CV** — beide op audio-rate. Verder: `octaveControl()`, `inputDrive()` (overdrive!), `passbandGain()`, 4× oversampling met keuze linear/polyphase-FIR-interpolatie. CPU op Teensy 4.x: ~1% zonder modulatie, ~2–3% met beide CV-ingangen actief. Nadeel: alleen lowpass (24 dB/oct), geen HP/BP zoals de huidige state-variable.

Een nieuwe module `tp_mmb_ladder` naast de bestaande VCF zou vrijwel een kopie van `VcfModule.h` zijn, met een tweede `AudioSynthWaveformDc`-proxy voor de resonantie-poort. Dat geeft je meteen "control én CV" voor Q, zoals je vroeg, zonder eigen DSP te schrijven.

## 3. MS-20-emulatie op de Teensy: goed haalbaar, maar zelfbouw

Het MS-20-filter is géén Moog-ladder maar een 2-pole **Sallen-Key** ("Korg35") met diode-clipping in het resonantiepad — vandaar dat rauwe, schreeuwerige karakter. Er is geen kant-en-klaar Teensy-audio-object voor, maar het model is juist een van de *simpelste* VA-filters die er zijn:

- **Will Pirkle** heeft het Korg35-model (LPF én HPF, zero-delay-feedback/TPT volgens Zavalishin) volledig uitgewerkt in app-notes en zijn boek *Designing Software Synthesizer Plug-Ins in C++*, inclusief broncode. Het is in essentie drie one-pole TPT-filters plus een feedbacklus met een `tanh`-achtige saturatie — een handvol multiply-adds per sample. Op een Teensy 4.1 @ 600 MHz is dat ruim onder de CPU-kosten van de ladder hierboven, zelfs met 2× oversampling voor de nonlineariteit.
- Open-source referentie-implementaties: o.a. de Korg35-filters in **Odin 2** (GPL) en diverse ZDF-implementaties op KVR.
- Jullie hebben met `PhaserModule` en `CombModule` al het patroon voor custom `AudioStream`-objecten in de firmware, dus zo'n `Korg35Module` past er naadloos in — inclusief control-rate Q-CV via hetzelfde `writeCvPort`-patroon, of desgewenst audio-rate door er zelf een derde ingang aan te geven.

En misschien wel het leukste: als je MS-20-model in het Gowin/FPGA-project (`E:\Dev\Gowin\MS20_synth_voice`) al op een ZDF-Sallen-Key gebaseerd is, kun je de coëfficiëntenwiskunde één-op-één delen tussen de FPGA-versie en de Teensy-versie — zelfde model, twee targets.

## Advies

Drie stappen, oplopend in moeite:

1. **Nu:** `q_cv`-poort op de bestaande VCF (Phaser-patroon) — klein, firmware + editor samen misschien een uurtje werk, en meteen jouw "control + CV"-wens vervuld.
2. **Goedkope extra:** `tp_mmb_ladder`-module rond `AudioFilterLadder` — audio-rate Q-CV plus `inputDrive`, bijna gratis omdat het stock library is.
3. **Het echte werk:** custom Korg35/MS-20-module naar Pirkle, eventueel met gedeelde wiskunde uit je FPGA-project. Meeste karakter, meeste (maar nog steeds bescheiden) werk.

Zeg maar welke je wilt; stap 1 en 2 kan ik direct implementeren.

Sources: [filter_ladder.h (PaulStoffregen/Audio)](https://github.com/PaulStoffregen/Audio/blob/master/filter_ladder.h), [Teensy Audio Design Tool — AudioFilterLadder](https://www.pjrc.com/teensy/gui/index2.html?info=AudioFilterLadder), [PJRC-forum: porting Moog ladder filters](https://forum.pjrc.com/index.php?threads/porting-moog-ladder-filters-to-audio-objects.60488/page-3), [Pirkle — Korg35 HPF app note (PDF)](http://www.willpirkle.com/Downloads/Korg35HPFAppNote_V2.pdf), [KVR: MS-20 filter emulation discussie](https://www.kvraudio.com/forum/viewtopic.php?t=470472)

---

## 👤 Gebruiker (2)

graag 1 en 2. Daarna wil ik toch 3, vrees ik :-)

**🤖 Claude:**

Mooi, dan bouw ik stap 1 (Q-CV op de bestaande VCF) en stap 2 (nieuwe ladder-module) nu in, firmware én editor. Eerst even de registratie- en wiring-patronen bekijken.
> 🔧 `Grep` — registerFactory
> 🔧 `Grep` — case 'vcf'|kind === 'vcf'|'vcf'
> 🔧 `Read` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\sim\AudioEngine.ts
> 🔧 `Read` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\sim\AudioEngine.ts
> 🔧 `Read` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\sim\AudioEngine.ts
> 🔧 `ToolSearch`
> 🔧 `TodoWrite` — takenlijst bijgewerkt
> 🔧 `Glob` — packages/framework-arduinoteensy/libraries/Audio/filter_ladder.*
> 🔧 `Read` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\RegisterAllModules.h
> 🔧 `Read` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\audio\Filter.ts
> 🔧 `Glob` — **/filter_ladder.h
> 🔧 `Glob` — .pio/libdeps/**/filter_ladder.*
> 🔧 `Read` — C:\Users\User\.platformio\packages\framework-arduinoteensy\libraries\Audio\filter_ladder.h
> 🔧 `Grep` — resonance|Kmax|blockR|octave
> 🔧 `Grep` — blockc|Kmod|MAX_RESONANCE|K = |Ktot
> 🔧 `Grep` — inputDrive|host_overdrive
> 🔧 `Read` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\seedModules.ts
> 🔧 `Read` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\index.ts
> 🔧 `Grep` — tp_mmb_vcf|tp_mmb_ladder
> 🔧 `Read` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\audio\index.ts
> 🔧 `Grep` — tp_mmb_
> 🔧 `Grep` — inputPortKind|writeCvPort
> 🔧 `Read` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\FwVersion.h
> 🔧 `Grep` — inputPortKind|PortKind::Cv
> 🔧 `TodoWrite` — takenlijst bijgewerkt
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\VcfModule.h
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\VcfModule.h
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\VcfModule.h
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\VcfModule.h
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\VcfModule.h
> 🔧 `Write` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\LadderModule.h
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\RegisterAllModules.h
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\RegisterAllModules.h
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\FwVersion.h
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\seedModules.ts

**🤖 Claude:**

De grep-weergave had wat tekens verhaspeld — ik lees het echte fragment even in.
> 🔧 `Read` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\seedModules.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\seedModules.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\seedModules.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\audio\Vcf.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\audio\Vcf.ts
> 🔧 `Write` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\audio\Ladder.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\audio\Ladder.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\audio\Ladder.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\audio\Ladder.ts
> 🔧 `TodoWrite` — takenlijst bijgewerkt
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\audio\index.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\index.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\sim\AudioEngine.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\sim\AudioEngine.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\sim\AudioEngine.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\sim\AudioEngine.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\sim\AudioEngine.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\sim\AudioEngine.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\sim\AudioEngine.ts
> 🔧 `PowerShell` — Editor package.json scripts bekijken
> 🔧 `TodoWrite` — takenlijst bijgewerkt
> 🔧 `PowerShell` — Editor TypeScript typecheck draaien
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\audio\Vcf.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\audio\Ladder.ts
> 🔧 `PowerShell` — Editor TypeScript typecheck opnieuw draaien

**🤖 Claude:**

Typecheck is groen. Nu de firmware-build (kan even duren, draait op de achtergrond):
> 🔧 `PowerShell` — Firmware compileren met PlatformIO (teensy41)
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\audio\Vcf.ts
> 🔧 `Read` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\presets.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\presets.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\presets.ts
> 🔧 `PowerShell` — Staart van firmware-buildlog bekijken

**🤖 Claude:**

Firmware compileert (SUCCESS, Teensy 4.1). Nog één snelle typecheck na de laatste edits:
> 🔧 `PowerShell` — Editor typecheck na laatste edits
> 🔧 `TodoWrite` — takenlijst bijgewerkt
> 🔧 `Write` — C:\Users\User\.claude\projects\d--Git-Muziek-MusicBrain\memory\ms20-korg35-plan.md
> 🔧 `Edit` — C:\Users\User\.claude\projects\d--Git-Muziek-MusicBrain\memory\MEMORY.md
> 🔧 `Read` — C:\Users\User\.claude\projects\d--Git-Muziek-MusicBrain\memory\MEMORY.md
> 🔧 `Edit` — C:\Users\User\.claude\projects\d--Git-Muziek-MusicBrain\memory\MEMORY.md

**🤖 Claude:**

Klaar — stap 1 en 2 zijn gebouwd en geverifieerd: firmware compileert (Teensy 4.1, SUCCESS) en de editor-typecheck is groen.

## Stap 1 — Q-CV op de bestaande VCF

**Firmware** ([VcfModule.h](firmware/app-modular-brain/src/VcfModule.h)): nieuwe CV-poort `q_cv` plus control `q_cv_amt`. Omdat de state-variable-filter geen audio-rate resonantie-ingang heeft, gaat dit via het Phaser-patroon: de CV-tick roept direct `resonance(baseQ + q_cv_amt × cv)` aan, geclampt op het stabiele bereik 0.7–5.0. Control-rate dus — prima voor LFO/envelope-sweeps op Q.

**Editor**: het VCF-paneel heeft nu een `Q CV`-ingang en `Q CV amt`-knop ([seedModules.ts](editor/src/modular-mb/seedModules.ts)), en de simulator wire-t Q-CV naar `filter.Q` via een `Tone.Scale`, zoals dat al voor cutoff gebeurde ([AudioEngine.ts](editor/src/modular-mb/sim/AudioEngine.ts)). Zoals besproken heb ik meteen de Q-ranges gelijkgetrokken met de hardware: knob nu 0.7–5 (was 0.1–12), en de "Acid"-presets die `q: 8` zetten staan nu op 5 — de Teensy clampte dat intern toch al, dus sim en hardware klinken nu hetzelfde.

## Stap 2 — Moog-stijl ladder-module (`tp_mmb_ladder`)

**Firmware**: nieuwe [LadderModule.h](firmware/app-modular-brain/src/LadderModule.h) rond `AudioFilterLadder`, geregistreerd in [RegisterAllModules.h](firmware/app-modular-brain/src/RegisterAllModules.h). Beide CV's zijn hier écht audio-rate via DC-proxies: F CV in octaven (`cv_amt` 0–7 oct) en Q CV in resonantie-eenheden. Uit de bron van de lib gehaald: een full-scale signaal op de resonantie-ingang telt exact +1.0 op bij `resonance()` (0–1.8, zelf-oscillatie boven ~1.1), dus `q_cv_amt` is daarin gekalibreerd. Ook de `inputDrive` (tanh-overdrive, 0–4) zit erop als `drive`-knob.

**Editor**: nieuw 6HP-paneel "MMB LADDER" plus een [Ladder-runtimeklasse](editor/src/modular-mb/runtime/audio/Ladder.ts) die de bestaande Vcf-klasse hergebruikt met een -24 dB/oct Tone.Filter en een eigen resonantie-naar-Q-mapping. Eerlijkheidshalve: zelf-oscillatie en het tanh-karakter hoor je alleen op de echte hardware, de sim benadert alleen de curve.

Verder is de firmware-versie gebumpt naar 0.5.20. Eén aandachtspunt: bestaande opgeslagen projecten bevatten hun eigen kopie van de VCF-moduledefinitie, dus daar verschijnt de nieuwe Q CV-poort pas na opnieuw seeden van de internals; nieuwe projecten hebben alles direct.

Stap 3 (Korg35/MS-20 Sallen-Key als custom AudioStream, naar Pirkle's ZDF-model) heb ik in mijn geheugen gezet, inclusief de uitgezochte CV-semantiek — zeg het maar als je eraan wilt beginnen, dan kijk ik ook meteen of de filterwiskunde uit je Gowin-project herbruikbaar is.

---

## 👤 Gebruiker (3)

Ja, stap 3 lijkt mij heel interessant! Wil je dat doen. Let op andere chats die ook op de firmware dingen doen. NIets met filters echter.

**🤖 Claude:**

Leuk! Ik begin met kijken of er in je FPGA-project al bruikbare MS-20-filterwiskunde zit, en dan bouw ik de Korg35-module. Ik houd de aanpassingen aan gedeelde firmware-bestanden minimaal vanwege de andere chats (en ik laat `FwVersion.h` deze keer met rust — bump die zelf even vóór het flashen).
> 🔧 `PowerShell` — Bestandslijst van het FPGA MS-20 project
> 🔧 `PowerShell` — HDL/Python/doc-bestanden zoeken buiten .venv
> 🔧 `Read` — E:\Dev\Gowin\MS20_synth_voice\src\ms20_filter.v
> 🔧 `Read` — E:\Dev\Gowin\MS20_synth_voice\gen_tables.py
> 🔧 `Grep` — class AudioEffect|class Audio.*: public AudioStream
> 🔧 `TodoWrite` — takenlijst bijgewerkt
> 🔧 `Read` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\PhaserModule.h
> 🔧 `WebFetch`

**🤖 Claude:**

De PDF is lokaal opgeslagen — ik lees hem direct:
> 🔧 `Read` — C:\Users\User\.claude\projects\d--Git-Muziek-MusicBrain\6269ca5a-df62-4f4e-8f6b-aae3a37e020b\tool-results\w...
> 🔧 `WebSearch`
> 🔧 `WebFetch`
> 🔧 `WebFetch`
> 🔧 `Bash` — Bestandslijst van WPKorg35-map op GitHub ophalen
> 🔧 `WebFetch`
> 🔧 `Grep` — Module|sizeof
> 🔧 `TodoWrite` — takenlijst bijgewerkt
> 🔧 `Write` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\Ms20Module.h

**🤖 Claude:**

Registreren en dan de editor-kant:
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\RegisterAllModules.h
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\firmware\app-modular-brain\src\RegisterAllModules.h
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\seedModules.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\seedModules.ts
> 🔧 `Write` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\audio\Ms20.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\audio\index.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\runtime\index.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\sim\AudioEngine.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\sim\AudioEngine.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\sim\AudioEngine.ts
> 🔧 `Edit` — d:\Git\Muziek\MusicBrain\editor\src\modular-mb\sim\AudioEngine.ts
> 🔧 `TodoWrite` — takenlijst bijgewerkt
> 🔧 `PowerShell` — Firmware compileren met PlatformIO (teensy41)
> 🔧 `PowerShell` — Editor TypeScript typecheck
> 🔧 `Write` — C:\Users\User\AppData\Local\Temp\claude\d--Git-Muziek-MusicBrain\6269ca5a-df62-4f4e-8f6b-aae3a37e020b\scrat...
> 🔧 `PowerShell` — Buildlog-staart + numerieke filterverificatie draaien

**🤖 Claude:**

Alles groen. Even het geheugen bijwerken (stap 3 is nu gebouwd):
> 🔧 `Write` — C:\Users\User\.claude\projects\d--Git-Muziek-MusicBrain\memory\ms20-korg35-plan.md
> 🔧 `Edit` — C:\Users\User\.claude\projects\d--Git-Muziek-MusicBrain\memory\MEMORY.md
> 🔧 `TodoWrite` — takenlijst bijgewerkt

**🤖 Claude:**

De MS-20-module is klaar en geverifieerd: firmware compileert, editor-typecheck groen, en de filterwiskunde numeriek gecontroleerd.

## Wat er gebouwd is

**Firmware** — nieuw bestand [Ms20Module.h](firmware/app-modular-brain/src/Ms20Module.h) met een custom `AudioFilterKorg35` AudioStream (naar het Phaser/Comb-patroon), geregistreerd als `tp_mmb_ms20` in [RegisterAllModules.h](firmware/app-modular-brain/src/RegisterAllModules.h). Het is de authentieke Korg35 Sallen-Key-topologie als zero-delay-feedback-model naar Pirkle — ik heb zijn gepubliceerde coëfficiënten geverifieerd tegen mijn eigen afleiding (α₀ = 1/(1 − K·G + K·G²), identiek voor LP en HP). Resonantie K loopt tot 2.0, waar het filter zelf-oscilleert.

Leuk detail: ik heb in je Gowin-project gekeken en je FPGA-filter blijkt een **Chamberlin-SVF met tanh-LUT** te zijn, geen Sallen-Key — een ander skelet dus, maar je karakter-keuzes heb ik wél overgenomen: **tanh-diodeclipping in de resonantielus** (de "scream") en **2× oversampling** met precies jouw goedkope ZOH + middeling-decimatie uit `ms20_filter.v`. Poorten en CV werken zoals bij de andere filters: `in`, `F CV` (octaven, 0–7), `Q CV` (resonantie-eenheden), control-rate met per-block smoothing. De LP/HP-switch schakelt live, zonder graph-rebuild (anders dan bij de SVF-VCF).

**Editor** — nieuw 6HP-paneel "MMB MS-20" in [seedModules.ts](editor/src/modular-mb/seedModules.ts) (Cutoff, Res, Drive, CV amt, Q CV amt, LP/HP-mode), een [Ms20-runtimeklasse](editor/src/modular-mb/runtime/audio/Ms20.ts) op het Vcf/Ladder-stramien, en engine-koppeling incl. live type-switch in de sim. Zelf-oscillatie en het tanh-karakter hoor je alleen op de Teensy; de sim benadert de curve (HP is daar 12 i.p.v. 6 dB/oct).

## Numerieke verificatie

Een Python-port van de sample-loop bevestigt het gedrag: LP-passband 0 dB met nette 12 dB/oct-rolloff; resonantiepiek +12 dB bij K=1.8; HP toont de Korg35-typische ~6 dB/oct; bij K=2.0 zelf-oscillatie exact op de cutoff-frequentie; en in het worst-case-scenario (fc=18k, K=2, drive=10, harde input) blijft de output keurig begrensd door de tanh.

Vanwege de andere firmware-chats heb ik `FwVersion.h` deze keer **niet** aangeraakt en alleen minimaal toegevoegd aan gedeelde bestanden (één include + één regel in RegisterAllModules.h, één import-regel in de editor-barrels). Bump de versie dus zelf even vóór het flashen. Geschatte CPU-kost: ~1–2% (twee `tanhf` per sample op 600 MHz), vergelijkbaar met de ladder.

Sources: [Pirkle Korg35 LPF-code (chugins/WPKorg35)](https://github.com/ccrma/chugins/blob/master/WPKorg35/WPKorg35.cpp), [Pirkle Korg35 HPF app note](http://www.willpirkle.com/Downloads/Korg35HPFAppNote_V2.pdf), [SynthLab SDK vafilters](https://www.willpirkle.com/synthlab/docs/html/vafilters_8h_source.html)

