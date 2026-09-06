# De simulator als instrument — overzicht

*Stand 2026-09-06. Dit is de leeswijzer bij het werk van 5 en 6 september: de
editor-simulator is in twee dagen van "benadering met Tone.js-nodes" naar
"dezelfde C++ als de Teensy, in een AudioWorklet" gegaan, en er is een sampler,
een DX7 met patch-editor en een draagbaar test-instrument bijgekomen.*

De losse detailnotities staan in [RELEASE-LOG.md](RELEASE-LOG.md) (editor 0.6.0
t/m 0.7.5). Dit document vertelt hoe de stukken samenhangen en waar je moet
zijn.

---

## 1. Waarom dit er is

Aanleiding was banaal: demonstreren zonder de koffer met de Teensy 4.1. De
Teensy 3.2 die wél mee was, kan Elements niet draaien — niet qua RAM, niet qua
flash en niet qua rekenkracht, elk van de drie afzonderlijk al niet. Het
alternatief was de Mac zelf, en daarmee de vraag: kunnen we de firmware-DSP
*zonder herschrijven* in de browser draaien?

Dat kan, en het antwoord is beter dan een demo-noodgreep. Wat je in de browser
hoort **is** de code die op de Teensy staat, dus de simulator is nu ook een
ontwikkel- en testbank: patches uitproberen, samples analyseren, DX7-voices
maken — allemaal zonder hardware, en met resultaten die overdraagbaar zijn.

---

## 2. De lagen

```
   editor (React)  ──► sim/AudioEngine ──┬─► Tone.js-proxies      (VCO, VCF, VCA, ADSR, LFO, …)
                                          └─► AudioWorklet + wasm  (Elements, Rings, DX7, sampler, …)
                                                     │
                                                     └── exact dezelfde bron als firmware/
```

| Laag | Waar | Wat |
|---|---|---|
| ABI | [`tools/mmb-wasm/mmb_abi.h`](../tools/mmb-wasm/mmb_abi.h) | de C-interface die elke module-wrapper exporteert: poorten, controls, `mmb_process` |
| Build | [`tools/mmb-wasm/build.sh`](../tools/mmb-wasm/build.sh) | wasi-sdk (`wasm32-wasip1`, `-O3 -msimd128`) → `editor/public/wasm/<typeId>.wasm` |
| Host | `editor/public/wasm/mmb-worklet.js` | één generieke worklet voor álle modules; resamplet, mengt kabel- en klavierwaarden |
| Engine | `editor/src/modular-mb/runtime/audio/WasmModule.ts` | node-soort `wasm`, één `Tone.Gain` per poort |

Waarom **wasi-sdk** en niet Emscripten: we willen geen JS-runtime, geen
`Module`-glue en geen filesystem-emulatie. Een wasi-sdk-build is één `.wasm`
met platte exports die een AudioWorklet zelf kan instantiëren — precies wat een
worklet nodig heeft, waar Emscriptens glue juist in de weg zit. Van WASI zelf
gebruiken we vrijwel niets: geen heap-allocatie, geen I/O, alles statisch.

Uitleg per module en het bouwen: [`tools/mmb-wasm/README.md`](../tools/mmb-wasm/README.md).
Architectuur en de bekende grenzen: [`Simulation.md` §9](Simulation.md).

Modules die zo draaien: Elements, Rings, Marbles, Stages, Peaks, Morph-WT,
Clouds, Plaits, Tides, Warps, tape echo, sampler en DX7.

---

## 3. Wat er onderweg uit de firmware kwam rollen

Het compileren van dezelfde bron voor twee doelen legde echte fouten bloot:

- **`StagesModule` deelde zijn uitgang door 8.** De aanname was ±8 V, maar
  `SegmentGenerator` levert al 0..1. Gevolg: de Krell-VCA ging maar tot 12,5 %
  open. Gerepareerd in firmware én wasm.
- **`voice.cc` (mi-elements)** — clang weigert `float** bow_bufs` uit een const
  struct; `const_cast` toegevoegd.
- Twee nieuwe **header-only kernen** in `firmware/lib/mmb-dsp` die per definitie
  door beide doelen worden gedeeld: `tape_echo.h` en `sample_player.h`.

Omgekeerd geldt de waarschuwing: er staat **geen PlatformIO-toolchain op deze
Mac**, dus de nieuwe firmware-wrappers (tape echo, sampler) zijn niet op
hardware gebouwd of gedraaid.

---

## 4. De sampler

Van "één sample per patch" naar een echte keymap. Kern:
[`firmware/lib/mmb-dsp/mmb_dsp/sample_player.h`](../firmware/lib/mmb-dsp/mmb_dsp/sample_player.h),
bankformaat `sample_bank.h`, Teensy-schil `SamplerModule.h`, editor-import
`editor/src/modular-mb/SampleImportModal.tsx`.

- **Multi-module** (construct B): één instantie met acht stem-cellen
  `voct_k`/`gate_k`/`vel_k` die één bank delen; MIDI-in verdeelt de noten,
  de sampler heeft geen eigen allocator. Poly ▾ → Sampler ×8.
- **Zones** over toets- én velocity-bereik, elk met root, `tuneCents`, gain,
  pan, decay/release en vier loop-modes (`none`, `one_shot`, `continuous`,
  `sustain`).
- **1–4 kanalen** interleaved — mono, stereo, of quadrafonisch. Loop-punten
  zitten op frame-niveau, dus het stereobeeld springt niet door de naad.
- **Positie als `int` + `float`**, niet als losse float: voorbij ~16 M frames
  loopt sub-sample-precisie in een float weg.
- `decay = 0` betekent: de sample brengt zijn eigen uitsterving mee.

### Import uit één lange opname

De prettigste manier om een echt instrument te samplen is doorspelen: C1 zacht,
C1 midden, C1 hard, C2 zacht, … in één take. `sampleAnalysis.ts` ontleedt die:

1. segmenteren op stilte + onset;
2. toonhoogte per aanslag met **YIN** (eigen implementatie — aubio is GPL-3 en
   kan dus niet in deze MIT-repo);
3. velocity-lagen uit de attack-RMS;
4. toetsbereiken tot halverwege de buurnoot;
5. uitsterving in twee fasen (snelle val + trage naklank);
6. loop-zoeker gesynchroniseerd op de periode, met nuldoorgang-snap en een
   ingebakken gelijk-vermogen-crossfade.

Je kunt de noten ook **vooraf opgeven** (`"C1 C2 C3"`, `"36,48"`,
`"C1..C5/12"`). Bij inharmonisch materiaal — klokken, klankschalen, modale
resonatoren — is dat betrouwbaarder dan detectie, en de detector hermeet dan
alleen nog ±6 halve tonen rond de bekende noot. De **stemreferentie** is vrij
instelbaar (knoppen voor 432 en 440 Hz), en "afwijking wegstemmen" is een apart
vinkje: een op A432 gestemde klankschaal mag zijn eigen stemming houden.

> **De bug die dit afdwong.** Zonder klem paste een octaaffout van de vrije
> YIN-zoeker zichzelf toe als −1126 cent stemcorrectie, waarna C3 op 28 Hz
> speelde. `safeTuneCents()` negeert nu alles boven een halve toon: zo'n
> afwijking betekent een verkeerd *gedetecteerde noot*, geen ontstemd
> instrument.

### Bestandsnaam = magic byte

Bankextensie is **`.mmbs`**: MMB = *Modular Music Brain*, en de vierde letter
van de extensie is gelijk aan de vierde magic-byte (`MMBS`). Naam en inhoud
kunnen dus niet uiteenlopen. Daarmee zijn `.mmbw` (wavetables) en `.mmbd`
(DX7-banken) gereserveerd.

---

## 5. De DX7

Eén kern, één bron: `firmware/lib/msfa` (Google's
music-synthesizer-for-android, Apache-2.0) wordt met wasi-sdk gebouwd tot een
gewone mmb-wasm-module (`tools/mmb-wasm/dx7_wasm.cc` →
`editor/public/wasm/tp_mmb_dx7.wasm`): **één stem per instantie, precies als
`Dx7Module.h`**, polyfonie via een PolyGroup ×8. Daarnaast bestaat een
regel-voor-regel JS-port (`dx7-core.js`), **sample-exact** getest tegen de
native build (maximaal verschil 1,5e-8, SNR 148 dB); die dient nu alleen nog
als referentie en als kern van `compare.mjs`.

De 8 factory-ROMs (`roms.bin`) en een geüploade `.syx` (bank 8, USR) gaan als
blobs de wasm in — dezelfde weg als samples bij de sampler; `dx7Host.ts` regelt
dat. Een browser-eigen 16-stemmige kern met eigen allocator heeft één middag
bestaan en is weer weg: zie [uml/11-simulation-wasm.md](uml/11-simulation-wasm.md).

### Patch-editor

Nieuw: [`Dx7EditorModal.tsx`](../editor/src/modular-mb/Dx7EditorModal.tsx),
knop **🎛 DX7** in de MMB-werkbalk.

De DX7 is berucht om 155 parameters achter één dataslider en een display van
twee regels. Hier staat alles tegelijk in beeld, en omdat de synth in de
browser draait hoor je elke wijziging meteen: de editor zet een **edit-patch**
die de bank overstemt (`dx7Host.setEditPatch` → blob-slot 9 + control `edit`),
zodat álle DX7-instanties in de patch spelen wat je maakt.

Het formaat zelf staat los van UI en audio in
[`dx7Patch.ts`](../editor/src/modular-mb/dx7Patch.ts): packed 128 ↔ unpacked 156
bytes (port van msfa's `patch.cc`), de 32 algoritmes met bus- en
feedback-vlaggen, `algorithmRouting()` en `modulationTargets()` voor het
diagram, en `opRatio()` dat rekent zoals het display van een echte DX7.

> **Operatornummering.** In een bulkdump staan de operators achterstevoren:
> index 0 in het bestand is OP6. msfa houdt die volgorde aan, de UI draait 'm
> om — vandaar `opIndex = 6 - uiOp`.

Wat je maakt kan als 32-voice `.syx` het bestand uit, en dat laadt zowel in
onze USER-bank als in een echte DX7.

### Naast een echte DX7 leggen

Er staat een echte DX7 bij de hand, dus is er een meetgereedschap:
[`tools/dx7-wasm/compare.mjs`](../tools/dx7-wasm/compare.mjs) rendert onze kern
met dezelfde noten en vergelijkt met een opname. Wat het meet:

| meting | waarom |
|---|---|
| onset + envelope-tijden in dB | de voorspelling is dat wij ~11 % *traag* zijn: msfa's `Env` telt per blok van 64 samples en kent geen samplerate |
| partiaal-amplitudes (Goertzel) | klopt het spectrum, dus de FM zelf |
| ruis **tussen** de partialen, en de helling daarvan tegen het signaalniveau | dít is de "grunge" |

Die laatste is de interessante. Een lineaire PCM-DAC geeft ruis die *niet*
meeschaalt met het signaal (helling ≈ 0 dB/dB); de companding DAC van de
originele DX7 geeft ruis die wél meeschaalt (helling → 1). Zo is het verschil
niet alleen hoorbaar maar meetbaar — en daarmee ook **terug te genereren**:
`compand(x, mantissaBits)` in hetzelfde bestand doet de kwantisatie na.

`node compare.mjs --selftest` bewijst dat de meting werkt: op materiaal met een
bekend aangebrachte fout meet hij ×0,870 waar ×0,898 voorspeld was, en 0,23
tegen 0,63 dB/dB.

Opnameprotocol en gebruik: [`tools/dx7-wasm/README.md`](../tools/dx7-wasm/README.md).

---

## 6. De Snaarbank

`editor/public/snaarbank-worklet.html` — een draagbaar test-instrument dat
buiten de editor om draait, en waar de modulatie-experimenten in gebeuren.
Karplus-Strong plus een port van Elements' modale resonator (stiffness-LUT,
q-verlies, positie-cosinus), een bow op banded waveguides met BowTable-frictie,
een particle-mallet, tape echo, Web MIDI in *en* uit (de Roto-Control-knoppen
bewegen mee), en modulatievlakken: trackpad, Wacom, aanraakscherm en telefoons
over websocket.

Details en de CC-map: [`snaarbank-testlab.md`](snaarbank-testlab.md) en
[ADR 0016](adr/0016-modulation-surfaces-over-cc.md).

> **Web MIDI werkt niet in een ingebedde iframe.** De Snaarbank draait daarom
> onder `editor/public/`, geserveerd door Vite op localhost.

---

## 7. Wat nog open staat

- **Firmware niet op hardware gebouwd**: tape echo en sampler
  (`SD.begin(BUILTIN_SDCARD)`, `extmem_malloc`, `/mmb/banks/NN.mmbs`) wachten op
  een Teensy met toolchain.
- **Engine-grenzen** (backlog ED-SM-3..6): note-dispatch is mono, wasm-gates
  triggeren geen Tone-ADSR, wasm-CV stemt geen Tone-VCO, en Elements kost ~33 %
  van één core per stem.
- **Echte opnames**: piano, tubular bells, Hohner-blaasorgel en klankschalen
  moeten nog door de multisampler; de DX7-vergelijking wacht op de opname naast
  de echte machine.
- **`.mmbp`** — een generieke patchbank met type-id in de header, in plaats van
  een eigen extensie per module (`.mmbe` voor Elements enz.). Nog niet gebouwd.

---

## 8. SoundFonts als bron

Een SF2 heeft precies het model dat onze sampler ook heeft — samples in één
blok plus een keymap van zones — dus de vertaling is vooral boekhouding.
[`editor/src/modular-mb/sf2.ts`](../editor/src/modular-mb/sf2.ts) leest het
formaat; de editor gebruikt het in de Multisample-import (**⤒ .mmbs / .sf2**,
daarna een preset kiezen), en
[`tools/mmb-wasm/sf2-to-mmbs.mjs`](../tools/mmb-wasm/sf2-to-mmbs.mjs) doet
hetzelfde vanaf de opdrachtregel:

```sh
node tools/mmb-wasm/sf2-to-mmbs.mjs piano.sf2                 # welke presets zitten erin
node tools/mmb-wasm/sf2-to-mmbs.mjs piano.sf2 "grand" uit.mmbs --vel-layers=2
```

Preset- en instrument-zones worden platgevouwen (de preset-laag is een
*offset* op de instrument-laag), bereiken snijden, en key-range, velocity-range,
root, stemming, pan, gain en loop-punten gaan één op één mee, en sinds
bankversie 2 ook de volume-envelope: `attack`, en `hold`/`decay`/`sustain` +
`release` (zie hieronder). Wat we niet overnemen: filter, LFO's en modulatoren.

Drie dingen die deze route aan het licht bracht:

- **SF2 laat de dynamiek aan een modulator over.** Alle lagen staan op gain
  1,0; dat velocity het volume stuurt regelt een *default modulator* die wij
  niet nabouwen. Zonder meer klonken alle vijf de lagen van een gesampelde
  vleugel even hard. Daarom heeft een zone er een veld bij: `velTrack`, de
  velocity-gevoeligheid *binnen* de zone in dB (kwadratische kromme, 0 = uit).
  Het zat in het padding-byte van `ZoneRecord`, dus het bankformaat blijft 40
  bytes per zone en oudere banken lezen als 0 — wat voor een opname met genoeg
  lagen ook precies goed is.
- **Een loop zonder envelope dreunt door.** Een SF2 laat een sample vaak
  eeuwig loopen en laat de *volume-envelope* het einde maken: na `hold` zakt
  hij in `decay` seconden naar `sustain`. Namen we die niet over, dan bleef
  een marimba of Rhodes staan tot je de toets losliet — de loop had immers
  geen einde en onze `decay` stond op 0. Nu rekent de import uit wanneer die
  SF2-kromme op −60 dB staat en zet `decay` daarop; bij een `sustain` van
  vrijwel 0 dB (orgel, pad, koor) blijft `decay` 0, want dan hóórt de toon
  aan te houden. Een zone die niet loopt houdt `decay = 0`: daar draagt het
  sample zijn eigen uitsterving en zou een extra kromme dubbelop zijn.
- **Een pad zet zijn opkomst niet in het sample.** De Warm Pad van
  GeneralUser wil 0,8 s zwellen en het koor 0,1–0,6 s; dat staat in
  `attackVolEnv`, niet in de opname. Daarvoor heeft een zone er een veld bij
  (`attack`, seconden) en ging de bank naar **versie 2**: `ZoneRecord` is 44
  bytes in plaats van 40. Versie 1 leest gewoon door — de eerste 40 bytes zijn
  ongewijzigd en `attack` wordt dan 0. Andersom niet: een v2-bank op oude
  firmware wordt geweigerd, dus banken die op de SD staan opnieuw wegschrijven.
  De `attack`-control van de module telt bij die van de zone op, zodat de knop
  blijft doen wat hij deed.
- **Grootte.** De YDP-vleugel (FreePats, CC0) is 121 samples in 150 zones:
  113 MB. In de browser geen probleem, in 8 MB PSRAM onmogelijk. `--vel-layers`
  dunt de lagen uit; de tool waarschuwt zodra een bank niet meer op hardware
  past. De wasm-sampler kreeg ruimere tabellen (256 sloten, 512 zones); de
  firmware houdt zijn eigen limieten.

Let op de licentie van de SoundFont die je omzet: vrij te gebruiken betekent
niet vrij te herdistribueren. Grote banken en afgeleiden van bronnen die dat
niet toestaan horen niet in deze repo: `editor/public/banks/` staat in
`.gitignore`, met een uitzondering voor de kleine banken die er wél in mogen
(zie [`editor/public/banks/README.md`](../editor/public/banks/README.md)).

---

## 9. De opnameknop

Om browsergeluid in een bestand te krijgen moest je op de Mac langs een
virtueel audioapparaat: BlackHole installeren, een apparaat met meerdere
uitvoerkanalen maken zodat je zelf nog wat hoort, en dan in een DAW meelezen.
Dat is een omweg langs het luidsprekerpad, met twee klokken die uit elkaar
lopen en een microfoon-achtig rondzing-risico als je je uitgang verkeerd zet.
Terwijl de graaf waar het om gaat gewoon in de pagina staat.

Vandaar **⏺ Opname** naast Start/Stop in het Simulatie-paneel. Hij tapt de
master-som af, schrijft mee, en levert bij Stop een 24-bits WAV af — met de
patchnaam en een sorteerbare tijdstempel erin.

De keuzes die eronder zitten:

- **Een AudioWorklet, geen `MediaRecorder`.** Die laatste levert Opus, en een
  lossy codec is geen bron voor een samplerbank. De worklet
  ([`public/rec/tap-worklet.js`](../editor/public/rec/tap-worklet.js)) kopieert
  alleen, buffert tot 4096 frames en post dat als transferable.
- **Ook geen `ScriptProcessorNode`.** Die draait op de hoofdthread, en dan lekt
  elke hapering in React of in het tekenen van de golfvorm als een gat in de
  opname.
- **Een `recordBus` die een rebuild overleeft.** `AudioEngine.build()` gooit de
  master weg en maakt een nieuwe; hing de tap daaraan, dan viel de opname stil
  zodra je tijdens het opnemen een kabel verlegde. De bus wordt daarom niet in
  `dispose()` opgeruimd — één Gain voor de duur van de pagina.
- **De piek staat in de afloopregel**, in dBFS. Een zachte opname merk je
  anders pas als de bankimport er int16 van maakt en je drie bits kwijt bent;
  bij oversturing komt er `⚠ overstuurd` achter. Het mastervolume zit ín de
  opname, dus dat is de knop om aan te draaien, niet achteraf normaliseren.

Twee dingen die het bouwen opleverde:

- **`new AudioWorkletNode(ctx.rawContext, …)` werkt niet.** Tone's `rawContext`
  is niet altijd een echte `BaseAudioContext` — het kan de schil van
  standardized-audio-context zijn, en de globale constructor weigert die met
  *"parameter 1 is not of type 'BaseAudioContext'"*. Het moet via
  `ctx.createAudioWorkletNode()`, dezelfde route als `WasmModule` al gebruikte.
- **Stilte doorschrijven is niet hetzelfde als niets schrijven.** Tijdens een
  rebuild hangt er even niets aan de bus. Schrijft de tap dan niets, dan wordt
  de opname stiekem korter dan wat je speelde en loopt alles erna uit de pas.
  Hij schrijft nu nullen door.

`encodeWav()` is zuiver en staat los van de audiograaf, dus de RIFF-kop, de
kanaalvolgorde en het klemmen bij oversturing zijn onder node getest — zonder
klem wordt +1,5 in int24 een grote negatieve waarde, en dat hoor je als een tik
in plaats van een luide piek. De boekhouding van de worklet draait daar met een
schil omheen: 5120 frames erin als oplopende reeks, dezelfde reeks eruit, één
keer per monster, ook over de blokgrens van 4096 heen.

Wat dit **niet** is: een offline render. Het loopt op ware snelheid, want het
tapt de draaiende graaf af. Sneller dan realtime zou een `OfflineAudioContext`
vragen waarin de hele engine opnieuw wordt opgebouwd — Tone-singleton en
worklets incluis — en dat is een eigen klus.
