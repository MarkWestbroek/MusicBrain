# Chat: SysML diagrams analysis and planning

- **Datum**: 2026-05-17 14:32
- **Sessie-ID**: `4db45503-0a7f-471a-850c-117803aee9d5`
- **Berichten**: 32

---

## 🧑 User

# Answers to Open questions
- Whether Lfo should live under CvModule (it produces a CV, not audio) or be a CvModule sibling to EnvelopeGenerator. Current placement: CvModule → Lfo. -> yes, sibbling

- Whether Param/Signal/Switch control-value wrappers belong in a shared TS/C++ library or are platform-local. -> can you explain? Waht is the (impact of) the difference?

- Whether the runtime class's static readonly definition is the source from which catalog JSON is generated, or the JSON is hand-written and the class asserts equality at boot. -> can you explain?

- Whether the audio Teensy communicates with the main brain over the existing SPI/CAN-FD bus or needs a dedicated higher-bandwidth channel (e.g. a direct SPI link for low-latency CV delivery). -> think normal should do, but it might not live in the rack anyway, as it might be a panel-less audio-engine, configured via the web-UI... It will need an audio-breakout though :-)

## forgotten internal module
See original SysMLs. I forgot about the **controller-break-ins** (here still called pots control panel).

That can be any controller though, not necessarily pots. It is a special CV-break-in module, meant to deliver control-values. Well, CV = control value. But not from another analog module, but from the user. It has a special meaning, and I guess these will be used to steer the audio-teensy if needed.
Same for an extra CV-out-module that is used to display something.

An extra breakout screen would be a different format though. Maybe not so practical to try and steer that via a bus dedicated to digital CV signals.

We could of course, add the requirements of other types of signals via the bus. Like SysEx on MIDI, that completely differs from MIDI as runtime music signals.

This could be very practical, in orde to update firmware for instance, if breakout modules have their own little processor. Then they also have code. And that code might need an update.

Or to send configuration settings, like the Voltage range for the CV breakout module.

Can you integrate this information unabbreviated on an applicable place?

---

## 🤖 Assistant


```

```
ADR 0009 bijgewerkt. Hier de antwoorden op Q2 en Q3 voor je begrip:

**Q2 — `Param`/`Signal`/`Switch` wrappers, platform-local vs gedeeld:**
Momenteel is `controlValues` gewoon `Record<string, number | boolean | string | number[]>`. Een typed wrapper zou betekenen dat `cutoff: Param<number>` een ander type is dan `mode: Switch<'lp'|'hp'|'bp'>`. Het voordeel: een verkeerde toewijzing is dan een compileer-fout, geen runtime bug. Het verschil zit in *waar die types leven*: als beide kanten (TS + C++) hun eigen definitie schrijven, kunnen ze ongemerkt van elkaar afwijken. Als je ze uit één schema genereert, is afwijking onmogelijk maar kost het een build-pipeline. Beslissing uitgesteld.

**Q3 — `static readonly definition` als bron vs hand-geschreven JSON:**
De runtime klasse (layer 3) moet kloppen met de definitie (layer 1). Optie A: de klasse schrijft zelf z'n JSON (code-generatie). Optie B: jij schrijft de JSON, de klasse controleert die bij opstart en knalt als het niet klopt. Optie B is pragmatischer voor een embedded project zonder uitgebreide toolchain — geen build-stap, maar nooit stil fout. ADR leunt naar B.

De diagrammen die je nu hebt meegestuurd (de SysML-overzichten) kunnen ook in  worden opgeslagen — `system-overview-v1.png` en `system-bdd-v1.png` als je wilt dat ik straks verwijzingen toevoeg.

---

## 🧑 User

ik had ze in /SysML gezet. Wil je verwijzingen toevoegen?

---

## 🤖 Assistant


```

```

```

```
Klaar. Verwijzingen toegevoegd naar beide SysML-diagrammen:
- In de **Context** (boven Decision) met korte beschrijvingen wat je in elk diagram ziet
- In de **References** sectie onderaan

---

## 🧑 User

okee. Ik heb de ADR geaccepteerd.

Je schreef even terug "En zodra je hem accepteert, kunnen we beginnen met migratiestap 1: Module → ModuleInstance-rename in types.ts en alle call-sites updaten. Dat is mechanisch werk (~15 files, grep-and-replace) maar wel een goeie voorbereiding voor stap 2 (runtime-laag bouwen)."

Is dat nog zo?

---

## 🤖 Assistant

Ja, dat is nog steeds zo.  staat nog op  en `ModuleInstance` bestaat nog nergens. 

Wil je dat ik de rename nu uitvoer? Het is  en `ModuleInstance` bestaat nog nergens. 

Wil je dat ik de rename nu uitvoer? Het is mechanisch:  → `interface ModuleInstance` in types.ts, plus alle usages in de ~15 call-sites bijwerken. Ik kan dat doen via de language-server rename zodat het type-veilig gaat (geen handmatig grep-and-replace).

---

## 🧑 User

ja, graag

---

## 🤖 Assistant

Rename voltooid: 33 edits over 7 bestanden, build clean (776.47 kB / 228.39 kB gzip, 1.63s). Migratiestap 1 is af. Klaar voor stap 2 (runtime-laag bouwen) wanneer je wilt.

---

## 🧑 User

ja, wil je dat doen?

---

## 🤖 Assistant

Nu de migratiestap 2 in de ADR bijwerken zodat hij de CvModule/AudioModule-splitsing weerspiegelt: 
```

```
Klaar. Migratiestap 2 (runtime-skeleton) is af:

**Nieuwe bestanden in :**
- `Module.ts` — abstract basis met , , , , `setControl()`, `dispose()`
- `CvModule.ts` — abstract, `tick()` voor ~1–2 kHz control-rate
- `AudioModule.ts` — abstract, `update()` voor audio-block rate
- `ExternalModule.ts` — concreet, data-driven, geen processing
- `Registry.ts` — -map met global `registry` singleton
- `index.ts` — barrel-export

**Build:** tsc + vite clean, geen errors. Bundle-grootte ongewijzigd (776.47 kB) want niets importeert de runtime nog — tree-shaking ruimt het op. Dat is correct voor een scaffold.

**ADR 0009** migratiestap 2 bijgewerkt: nu `CvModule / AudioModule / ExternalModule` in plaats van het oude `InternalModule`.

Klaar voor stap 3 (eerste module end-to-end migreren — `Vcf` is een goede kandidaat) wanneer je wilt.

---

## 🧑 User

ja, graag

---

## 🤖 Assistant


```

```

```

```
Build clean. Stap 3 (Vcf end-to-end als bewijs) is af:

**Nieuwe runtime-klassen:**
- runtime/audio/Filter.ts — abstract, `setCutoff()` + `setResonance()`
- runtime/audio/Vcf.ts — concreet, wraps  via compositie; `static readonly typeId = 'tp_mmb_vcf'`; self-registreert bij import
- runtime/audio/index.ts — barrel

**Registry-aansluiting:**
- `runtime/index.ts` re-exporteert , dus importeren van de barrel triggert self-registration
- `sim/engineSingleton.ts` doet een side-effect import `import '../runtime'` zodat de registry vol staat zodra  start

**Hiërarchie werkt nu live:** `Module` → `AudioModule` →  → `Vcf`. `registry.has('tp_mmb_vcf')` is `true` na boot. Bundle: 776 kB → 778 kB (+1.8 kB voor de nieuwe klassen — Tone.Filter was al meegelinkt door AudioEngine).

** is bewust nog niet aangepast** — die heeft nog steeds . Dat is stap 4 (engine refactoren naar registry-dispatch). Save/load/undo blijven werken want layer 2 is ongewijzigd.

Klaar voor stap 4 wanneer je wilt.

---

## 🧑 User

okee. De simulatie werkt nog. Al is de AHDSR's attack opeens (na stap 1 al) 'overgevoelig': hij is op een tikje omhoog al heeel lang. De range is 0-5000. Ik denk dat 5000 erg veel is. Dat was anders. Is ergens scheef gegaan.

Wil je daar even naar kijken en dan door naar stap 4?

---

## 🤖 Assistant

De max van 5000 ms voor attack staat er al sinds commit `d987ad1` (20 mei), dus stap 1 heeft er niet aan gezeten. Maar ik ben het eens dat 5000 ms voor attack overdreven is — bij een lineaire slider betekent 1 px ≈ 50 ms, dus de slider voelt inderdaad nerveus.

Ik verlaag de attack-max naar 2000 ms (ruim genoeg voor trage pad-attacks; in lijn met typische Eurorack-envelopes): 
```

```
⚠ **Belangrijke kanttekening**: dit raakt alleen *nieuw geseede* modules. ModuleTypes die al in jouw `localStorage` staan ( of vergelijkbaar) houden hun oude . Als je de range op je bestaande AHDSR wilt zien: ofwel die module verwijderen + opnieuw toevoegen, ofwel project reset.

Nu stap 4 — AudioEngine dispatch via registry. Eerst even verkennen hoe diep dat raakt:  Voor ik stap 4 in ga: het is een grotere klus dan stappen 1–3.  is een god-class waar per kind veel state buiten de runtime-klasse zit (bv. , ,  voor CV-routing). Echt alle 11 kinds doormigreren = grote refactor met breekrisico.

Drie opties, korte versie: Optie A. Plan: Vcf runtime krijgt initial controls mee, engine vraagt registry voor lifecycle + setControl, behoudt legacy state voor CV-routing. 
```

```

```

```

```

```
Now check what import is needed in Vcf for :  Good, ControlValue already imported. Now look at AudioEngine  for makeNode, updateControl, dispose:   Now apply the AudioEngine changes:   
```

```
Good. Now check  exists on Module base:    Good. Build:     Two different  defs collide. Make runtime re-use the  one:     
```

```

```

```
Build groen (778.17 kB / 228.92 kB / 1.64s). Nu documentatie bijwerken:  
```

```

```

```
Klaar.

**Bug fix (AHDSR attack)**:  regel 598 — attack  van 5000 → 2000 ms. *Caveat*: bestaande  in localStorage houdt 5000; nieuwe AHDSR-instances krijgen 2000. Onderzoek wees uit dat de 5000 al sinds commit `d987ad1` (20 mei) bestond — stap 1 was puur een type-rename en kan numerieke waarden niet veranderen.

**Stap 4 (Vcf via registry)** voltooid:
- : ControlValue nu hergebruikt uit  (geen duplicate definitie).
-  + : accepteren optionele .
- : factory geeft initiële controls door.
- `sim/AudioEngine.ts`:  in  gebruikt ;  delegeert cutoff/q via ;  via . Andere kinds blijven legacy `switch`.  is nu een alias van  voor wire-code compat.
- Build groen (778.17 kB / 228.92 kB / 1.64s).

**ADR 0009** migratiestappen 1–4 afgevinkt. Stap 5 (Vco/Vca/Ahdsr/Lfo/Seq16 migreren) is volgende.

---

## 🧑 User

okee, alles lijkt nog goed te werken. Wil je verder gaan met migreren, dus stap 5?

---

## 🤖 Assistant

Ik pak stap 5 incrementeel: Vco, Vca, Ahdsr, Lfo via runtime-classes naar het Vcf-patroon. Seq16 sla ik over want die heeft geen Tone-primitive om te bezitten — z'n hele logica is engine-orchestratie (intervalId, meters, voctOffset, runDriven…). Eerst even verkennen wat de typeIds zijn en hoe de envelope-controles  worden samengevoegd:     Plan duidelijk. Ik maak Vco/Vca als AudioModule en Ahdsr/Lfo als CvModule (met no-op `tick()` — de simulator laat Tone schedulen, firmware vult het later in). Engine houdt wire-state (, , , ).   

---

## 🧑 User

wat bedoel je met geen tone-primitive om te bezitten? Misschien in het Engels, want het lijkt ook slecht vertaald naar het  NL

---

## 🤖 Assistant

Good point. The phrase "own a Tone primitive" means: the runtime class is the sole owner of exactly one Tone.js audio node — it creates it in the constructor, delegates  to it, and disposes it in . That's what makes the migration pattern clean.

For  that's . For  it's . The runtime class is essentially just a typed wrapper around one Tone node.

`Seq16` is different. Its job in the engine is not wrapping a single Tone node — it orchestrates *other* nodes: it fires intervals, reads Tone.Meter values from connected sources, notifies envelope and VCO nodes, manages run-mode transitions, handles MIDI-IN override. There is no single  to wrap. The runtime class would just be the engine's sequencer loop, which is already where it lives.

So migration for `Seq16` would mean moving the *engine logic itself* into the class — a bigger refactor that needs a thought-out `abstract Sequencer` API (what is  for a sequencer? It would need references to other nodes). That's a separate design decision, not a mechanical follow-on to steps 1–5.

---

## 🧑 User

alles lijkt te werken. Wil je door met stap 6. Je mag ook nog verder gaan als je wilt. Wat komt daarna?

---

## 🤖 Assistant

Eerst even verkennen wat al bestaat voor externals en wat de firmware-structuur is:     

---

## 🧑 User

de UI crasht als ik iets met een externe module wil doen. Bij het patch aanmaken met een extern rack al.

 * Tone.js v15.1.22 * 
tone.js?v=a10ab74d:7611 The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page. https://developer.chrome.com/blog/autoplay/#web_audio
testAudioScheduledSourceNodeStartMethodNegativeParametersSupport @ tone.js?v=a10ab74d:7611
(anonymous) @ tone.js?v=a10ab74d:5116
(anonymous) @ tone.js?v=a10ab74d:2668
(anonymous) @ tone.js?v=a10ab74d:5116
ConstantSourceNode @ tone.js?v=a10ab74d:2846
createConstantSource @ tone.js?v=a10ab74d:2500
createConstantSource @ tone.js?v=a10ab74d:8786
_ToneConstantSource @ tone.js?v=a10ab74d:11425
_Signal @ tone.js?v=a10ab74d:11479
_TickSignal @ tone.js?v=a10ab74d:11820
_TickSource @ tone.js?v=a10ab74d:11879
_Clock @ tone.js?v=a10ab74d:12173
_TransportClass @ tone.js?v=a10ab74d:13691
(anonymous) @ tone.js?v=a10ab74d:14182
(anonymous) @ tone.js?v=a10ab74d:8585
initializeContext @ tone.js?v=a10ab74d:8585
initialize @ tone.js?v=a10ab74d:8756
get transport @ tone.js?v=a10ab74d:8866
(anonymous) @ tone.js?v=a10ab74d:24776Understand this warning
tone.js?v=a10ab74d:2868 The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page. https://developer.chrome.com/blog/autoplay/#web_audio
start @ tone.js?v=a10ab74d:2868
start @ tone.js?v=a10ab74d:11452
_Signal @ tone.js?v=a10ab74d:11487
_TickSignal @ tone.js?v=a10ab74d:11820
_TickSource @ tone.js?v=a10ab74d:11879
_Clock @ tone.js?v=a10ab74d:12173
_TransportClass @ tone.js?v=a10ab74d:13691
(anonymous) @ tone.js?v=a10ab74d:14182
(anonymous) @ tone.js?v=a10ab74d:8585
initializeContext @ tone.js?v=a10ab74d:8585
initialize @ tone.js?v=a10ab74d:8756
get transport @ tone.js?v=a10ab74d:8866
(anonymous) @ tone.js?v=a10ab74d:24776Understand this warning
:5174/favicon.ico:1  Failed to load resource: the server responded with a status of 404 (Not Found)Understand this error
chunk-PJEEZAML.js?v=a10ab74d:16670 Uncaught Error: Registry: no factory for type "tp_mi_elements"
    at Registry.create (Registry.ts:41:13)
    at AudioEngine.makeNode (AudioEngine.ts:657:29)
    at AudioEngine.build (AudioEngine.ts:236:25)
    at SimulationPanel.tsx:62:14
    at commitHookEffectListMount (chunk-PJEEZAML.js?v=a10ab74d:16915:34)
    at commitPassiveMountOnFiber (chunk-PJEEZAML.js?v=a10ab74d:18156:19)
    at commitPassiveMountEffects_complete (chunk-PJEEZAML.js?v=a10ab74d:18129:17)
    at commitPassiveMountEffects_begin (chunk-PJEEZAML.js?v=a10ab74d:18119:15)
    at commitPassiveMountEffects (chunk-PJEEZAML.js?v=a10ab74d:18109:11)
    at flushPassiveEffectsImpl (chunk-PJEEZAML.js?v=a10ab74d:19490:11)Understand this error
chunk-PJEEZAML.js?v=a10ab74d:14032 The above error occurred in the <SimulationPanel> component:

    at SimulationPanel (http://localhost:5174/src/modular-mb/SimulationPanel.tsx:28:19)
    at div
    at section
    at ModularMbApp (http://localhost:5174/src/modular-mb/ModularMbApp.tsx:40:19)
    at main
    at App (http://localhost:5174/src/App.tsx:24:33)

Consider adding an error boundary to your tree to customize error handling behavior.
Visit https://reactjs.org/link/error-boundaries to learn more about error boundaries.
logCapturedError @ chunk-PJEEZAML.js?v=a10ab74d:14032Understand this error
chunk-PJEEZAML.js?v=a10ab74d:9129 Uncaught Error: Registry: no factory for type "tp_mi_elements"
    at Registry.create (Registry.ts:41:13)
    at AudioEngine.makeNode (AudioEngine.ts:657:29)
    at AudioEngine.build (AudioEngine.ts:236:25)
    at SimulationPanel.tsx:62:14

---

## 🤖 Assistant

The crash is in `makeNode` — an external module (`tp_mi_elements`) without a  reaches `registry.create()` and throws because no factory is registered. Let me look at the exact flow: The root cause: `tp_mi_elements` has no , its category kind is , so  hits  and calls  — which throws because no factory exists for that typeId.

Fix: guard each registry-backed `switch` case with : 
```

```
Build groen. Externe modules zonder  (zoals `tp_mi_elements`) produceren nu stilletjes `null` in  en worden gewoon overgeslagen — geen crash meer. Modules mét  (zoals RS-110 → Vcf) werken zoals voorheen.

---

## 🧑 User

de AS RS-110 geeft wel het signaal door, maar er zit geen filter simulatie in het geluid

---

## 🤖 Assistant

Let me trace the wiring path for the RS-110 node: 

---

## 🧑 User

ik zou wel verder willen met de C++ invulling "C++ implementatie invullen — eerste concrete subclass (bv. Vcf met een biquad), inclusief CTest die Registry::global() round-trip test."

alleen lijkt mij een externe module niet zo zinvol, want die heeft geen implementatie. Wat dacht je van de AHDSR als concrete invulling van de Envelope (zie UML img).

Kijk ook naar mijn oude code (/old-code/ADSR), die overigens werkend is op een teensy 3.1 (door gewoon simpel te loopen, dus andere opzet)

---

## 🤖 Assistant

Goed plan. Eerst de oude werkende code lezen om de AHDSR-semantiek te begrijpen:  Plan helder. Ik ga:
1.  veiliger maken (owned `std::string` ipv `string_view`)
2.  toevoegen (abstracte tussenlaag, fasen O/A/H/D/S/R)
3.  concreet, **tick-driven** (geen  polling — past bij ADR 0008/0009 ISR-model) met self-registratie
4. CMakeLists uitbreiden
5. CTest met registry-round-trip + envelope-faseverloop   
```

```

```

```

```

```
Now add the tick-rate constant to  and create :  
```

```
Now the concrete :   Wire it into CMake and add the test:   
```

```

```

```
Now build and run the tests:     Terminal sits in . Let me move out:     
```

```

```

```
Alle 52 tests groen, inclusief de 5 nieuwe AHDSR-tests.

**Wat is er nu:**

-  — abstracte tussenlaag (`setGate`, , ) matchend met de UML
-  +  — concrete implementatie, **tick-driven** ipv -polling van het Teensy 3.1-prototype. Fase-machine is identiek (O/A/H/D/S/R, hold-skip bij hold=0, retrigger met value-preservation, loop). Sustain=0 wordt netjes afgehandeld.
- Self-registratie van de factory via static initializer in de `.cpp` — geen wijziging aan call-sites nodig.
-  — 5 tests:
  1. registry round-trip ()
  2. idle vóór gate
  3. volledige A→D→S→R progressie met juiste timing/levels
  4. hold-fase wordt ingevoegd bij hold > 0
  5. loop herstart Attack na release

**Tick-rate keuze**: `kCvTickRateHz = 1000` in  (binnen de "1–2 kHz"-range uit ADR 0008). `msToTicks` is `constexpr`, dus alle parameterconversies kunnen door de compiler weggeoptimaliseerd worden.

**Klein detail**:  include moest  worden (Types.h staat één niveau hoger), en `typeId_`/`id_` zijn nu owned `std::string` (veiliger dan `string_view` als de caller een tijdelijke door geeft).

---

## 🧑 User

zou je in alle C++ klassen wat uitgebreider willen documenteren? BIj voorkeur bij elke methode iets van uitleg.

Zou je verder kunnen gaan met een LFO implementatie in C++?
- Je kunt het model van de LFO in Tone gerust gebruiken.
- Dat is ook fijn, omdat het Panel dan ook matcht met de implementatie in de brain. Ik neem aan dat het panel gemaakt is op de Tone LFO.

Als je wilt kun je ook kijken hoe de AHDSR ook meer matchend met de Tone implementatie te maken. Dat is: de curves en loop on-off.

In eerdere gesprekken of in de reqs of het plan hebben we hier al verder over uitgewijd. WIl je dat opzoeken?

Wil je ook al nadenken over de MIDI-in? Dat is een belangrijk onderdeel van de teensy brain. JE zou kunnen kijken op deze plekken als inspiratie:
- https://github.com/pichenettes/ambika
- https://pichenettes.github.io/mutable-instruments-documentation/modules/yarns/ 
- https://github.com/herculesxe5/midimagic

Idee is wel dat polyfonie het belangrijkste doel van het project is. Tot 8 noten polyfoon moeten envelopes triggeren die analoge oscillatoren en VCA sturen

---

## 🤖 Assistant

Eerst even kijken wat er al opgeschreven is over LFO/MIDI/polyfonie in de bestaande docs, dan een gericht plan voorstellen.     Veel verschillende dingen. Ik ga prioriteren en doe nu de concrete code (LFO + AHDSR-curves + uitgebreidere docs) — en schrijf voor MIDI-in eerst een design-discussie, geen code, omdat die keuzes met je besproken moeten worden voordat ik header-API's vastleg.

Eerst LFO. Bekijk de panel-controls + Tone-model:     Nu de LFO. Eerst de header (uitgebreid gedocumenteerd):      Now add AHDSR curves (matching the panel's `Curve: Lin/Exp/Log`) and expand docs on existing headers:     
```

```
Now update Ahdsr.cpp for the curve + add the new control parser, and apply `shape()` in `computeValue`:     
```

```


---

## 🧑 User

@agent Try Again

---

## 🤖 Assistant

Now expand docs on the remaining runtime headers and update CMake + add an LFO test:      
```

```

```

```


---

## 🧑 User

Akkoord. wil je de ADR schrijven? Aantal stemmen moet wel instelbaar zijn per Patch. Soms wil je monofoon, soms duofoon, soms 4, soms 8. Het max hoeft geen 8 te zijn.

Voor het polyfoon patchen in de UI moeten we nog wel een patroon en visuals bedenken: je wilt namelijk bij polyfonie het patchpatroon kunnen herhalen als je modules in, zeg, 4-voud hebt, dan patch je één keer de VCO, A, F en intern de Env's en LFO('s) en dan zou je dat als "4x herhaald" moeten kunnen markeren.

Voor de brain is het uiteindelijk wel concreet 4x. Dus bij 2 AHDSRs zijn dat er concreet 8. 1 LFO is misschien per stem, dus dat worden er 4, en een algemeen, dat blijft er 1.

Voor de C++ is het dus gewoon een patch met veel 'kabels'.

De CV-breakout is ook een belangrijk interne module. Wil je die ook in de steigers zetten?

We moeten ook iets concreter nadenken over de bus en hoe die aan te sturen misschien, al staat er al veel in het plan. Wil je dat even naar boven halen, zodat er er naar kunnen kijken?

---

## 🤖 Assistant

I'll write ADR 0010 first, then scaffold the CV-breakout headers, and finish with a bus-review section in the chat reply. 
```

```

```

```
Now scaffold the CV-breakout headers (host-testable via a `BreakoutSink` interface):        
```

```
Now the concrete subclasses. Keep it minimal but functional:         Now the two siblings as header-only stubs (matching scaffolding) — minimal but compiling:     Update CMake + add a quick test:            
```

```

```

```

```

```
All 67 tests green. Update README and ADR 0009 step list:     
```

```

```

```
Klaar. Hier wat er ligt + de bus-review die je vroeg.

## Wat is gemaakt

**ADR 0010** — :
- Voice count blijft per `Patch` (1..16, niet vast 8). `kMaxAllocVoices` mag later omhoog als de hardware het trekt.
- Nieuwe runtime-tak `EventSourceModule` met `MidiInModule` als eerste concretisering. Per-voice outputs (`pitch/gate/velocity/aftertouch` × N) plus *global* outputs (mod, pitchbend, channel-aftertouch, clock).
- **Voice stamp** als UI-concept: een named subgraph in de patch met `voiceCount: N`. Elke module is óf binnen een stamp (per-voice) óf erbuiten (global). 2× AHDSR in een 8-stem stamp wordt op de brain dus 16 envelopes; 1 LFO in de stamp = 8 LFO's; 1 LFO eruit = 1 LFO globaal. Exact wat je beschreef.
- Verbindingsexpansie als 2×2 tabel (in/in, in/uit, uit/in, uit/uit) met `shareMode: broadcast | sum | voice-indexed`. Pitch-breakout krijgt `voice-indexed` zodat één kabel naar één DAC-kanaal-bereik vertaalt.
- Compile-time expansie: editor flatten't naar gewone `ModuleInstance` + `Connection` lijst — **de brain weet niets van stamps**, krijgt gewoon "veel kabels", precies wat je zei.
- Bandbreedte-check: 8 stemmen × per-tick CV is al spannend op SPI 10 MHz, dus  (interpolatie op de breakout, ADR 0008) is verplicht voor pitch/env, niet alleen "nice to have".

**CV-breakout in de steigers** in :
-  — abstracte base met `BreakoutSink` interface (firmware → SPI, tests → capturing, sim → null), adresvelden, dirty-tracking per slot.
-  + .cpp — 8-ch 12-bit modulatie, encodeert .
-  + .cpp — 16-bit pitch (wire-format identiek, boardside schaalt).
-  + .cpp — N-ch digitaal, dedupliceert bij gelijke state.
-  — 6 tests; 67/67 totaal groen.

## Bus-review (samenvatting wat er ligt — voor jou om te bekijken)

Het meeste staat al gelocked, dus dit is niet "opnieuw beslissen" maar "weten waar we staan":

**Vastgelegd en geïmplementeerd** (in ADR 0006 +  + ):
- In-case: brain = SPI-master, breakouts = SPI-slaves
- Inter-case: CAN-FD primair (RS-485 fallback), via bridge nodes (head bridge + satellite bridge per case)
- Frame: `[MAGIC 0xA5][VER 0x01][OP][LEN][≤56 payload][CRC16 CCITT-FALSE]` — past in één CAN-FD frame
- 8 opcodes: Ping/Pong, CvSet, **CvSegment** (target + duration + curve), GateSet, TriggerPulse, CvInRequest, CvInReport
- Adres: 16-bit `(caseId<<8) | slotId` — bridges schakelen op de high byte
- CV op de wire: i16 in -32768..+32767 ↔ -1.0..+1.0 (board doet voltage-scaling + DAC-bit-depth)
- Tick rates: brain CV @ 1 kHz, breakout interpolator @ 20-50 kHz (ADR 0008)
- ✅ encode/decode + CRC + alle 8 opcodes geïmplementeerd, met 3 frame-roundtrip tests

**Open / nog te concretiseren** (wat ik in ADR 0010 als open question heb gezet — geef aan welke je het eerst wil aanpakken):
1. **Management-laag framing** — firmware-update, telemetry, status. ADR 0009 noemt het maar er is nog geen aparte opcode-range / kanaal voor.
2. **CAN-FD prioriteits-arbitrage** — bij 8 stemmen en meerdere cases wordt de inter-case link de bottleneck. Voorstel: pitch > envelope/CV > LFO > management. Moet gemeten worden op echte hardware.
3. **Sequence numbers / detectie van bridge-loss** — ADR 0006 noemt het als requirement maar staat niet in het v1 frame. Optie: extra opcode-prefix met seqnum, of v2 frame.
4. **Bus-master backpressure** — wat als de SPI-master sneller wil sturen dan een breakout aankan? Nu impliciet "master re-sends bij geen reply"; geen flow control.
5. **Bridge firmware** — `firmware/breakouts/bridge/` directory bestaat nog niet. STM32G0/G4 of Teensy 4.x (geen RP2040 wegens geen CAN-FD).
6. **Concrete breakout-PCB's** —  is leeg. De C++ scaffolding hierboven werkt met een `BreakoutSink`, dus een echte board-cpp hoeft alleen die interface te implementeren rond de SPI driver van die specifieke MCU.

Welke van die 6 wil je als eerste aanpakken? Ik zou voorstellen: eerst **management-framing** + **seqnums** (allebei wire-format dingen die je nu makkelijk in v1→v2 kan zetten voordat er hardware is), daarna pas arbitrage en backpressure (dat wil je met echte metingen doen).

---
