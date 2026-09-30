# Review firmware en WASM-simulator - 2026-09-29

## Reikwijdte en zekerheid

Beoordeeld: de runtimecontracten, ProjectRuntime, CV-routing, de WASM-ABI en
AudioWorklet-host, plus VCF, VCO, Elements, STK-sound en de sampler. Daarnaast
bekeken: Ahdsr als voorbeeld van direct gedeelde core-code, architectuur- en
pariteitsdocumentatie, relevante tests en publicatieworkflows. Dit is een
gerichte steekproef, geen volledige audit van alle modules of firmwaretargets.
De nadruk ligt op app-modular-brain en de browser-audiosimulator, niet op de
afzonderlijke SPI/chip-simulator onder firmware/sim.

Er is geen firmware geflasht en geen hardware-audio opgenomen. De implementatie
is niet gewijzigd. De bevindingen hieronder onderscheiden broncodebewijs van
uitgevoerde gedragstests; bestaande WASM-binaries zijn getest, niet opnieuw
gebouwd. Hun overeenstemming met de huidige C++-bron is dus niet bewezen.

## Bevindingen

### 1. Hoog: dubbele module-id kan het AudioStream-lifetimeprobleem opnieuw activeren

Bron: [ProjectRuntime.h](../firmware/app-modular-brain/src/ProjectRuntime.h#L121),
[TeensyLink.h](../firmware/app-modular-brain/src/TeensyLink.h#L342).

`applyConfig()` controleert niet of een id al in `next` staat. Bij twee entries
met hetzelfde id kan de tweede entry een nieuw audio-object construeren. De
`next.emplace(...)` mislukt dan, waarna dat nieuwe object wordt vernietigd:
hetzij als afgewezen map-node, hetzij als lokale `unique_ptr`. De uitkomst van
`emplace` wordt niet gecontroleerd. Ook het pad met een hergebruikte instance
heeft dit probleem.

Dat schendt precies de invariant waarvoor de retire-pool bestaat: een
geconstrueerde Teensy AudioStream mag niet zomaar worden vernietigd omdat hij
nog in de globale update-lijst staat. Het commentaar over dubbele entries aan
het eind van de functie beschermt niet tegen deze mislukte insertie.
De config-handler valideert hier geen unieke ids voordat hij de callback doet.

Scenario: stuur een config met twee VCO-entries met hetzelfde id. Dit is een
broncodebevinding; het mogelijke hard-faultpad is niet op hardware uitgelokt.
Een normale editorconfig kan uniek zijn, maar de ontvangende firmware moet ook
ongeldige/importconfiguraties afwijzen.

Aanpak: valideer de complete nieuwe configuratie, inclusief unieke ids, voordat
de bestaande runtime wordt gemuteerd of factories worden aangeroepen. Test ook
gelijke ids met verschillende types en gevallen met een gevulde retire-pool.

### 2. Middel: verdwenen CV-kabels laten oude modulatie en gates achter

Bron: [CvGraph.cpp](../firmware/app-modular-brain/src/CvGraph.cpp#L20),
[VcfModule.h](../firmware/app-modular-brain/src/VcfModule.h#L82),
[main.cpp](../firmware/app-modular-brain/src/main.cpp#L236).

`tearDown()` wist routes en de bus, maar informeert bestemmingsmodules niet dat
hun ingang niet langer verbonden is. Modules bewaren de laatst geschreven CV.
`build()` wist wel interne routes, niet deze externe ingangstoestand.

Scenario: patch A heeft een positieve CV op VCF.cv; patch B gebruikt dezelfde
VCF zonder die kabel. De oude CV blijft in `AudioFilterSvf::cv_` staan. Ook het
opnieuw toepassen van cutoff en cv_amt gebruikt nog die oude CV. Een weggehaalde
gate kan op dezelfde manier een envelope in sustain laten staan.

Dit volgt rechtstreeks uit het controlepad, maar is niet op een Teensy gemeten.
De WASM-VCF gebruikt voor een niet-verbonden ingang juist nul. Het ontbreken van
een expliciet disconnectcontract is daarom ook een pariteitsrisico.

Aanpak: definieer per poort disconnectgedrag: modulatie-offset naar nul, gate
laag, of waar bedoeld pitch vasthouden. Laat de graph verbindingstoestand
doorgeven en test patch A -> B -> A. Niet blind alle poorten op nul zetten:
een parameter die een knop vervangt heeft een andere normalisatie nodig dan
een optellende modulatie-ingang.

### 3. Middel: Elements heeft werkende externe audio in WASM, niet in firmware

Bron: [ElementsModule.h](../firmware/app-modular-brain/src/ElementsModule.h#L166),
[elements_wasm.cc](../tools/mmb-wasm/elements_wasm.cc#L100).

De firmware biedt blow_in en strike_in aan als audiopoorten, ontvangt de
bijbehorende blokken, maar geeft ze onmiddellijk vrij. `generateBlock()` roept
`Part::Process()` vervolgens met twee stiltebuffers aan. De WASM-wrapper geeft
wel de werkelijke ingangsbuffers door.

Uitgevoerde WASM-proef: bow, blow en strike op nul, externe strike_in met een
220 Hz-sinus op amplitude 0,2, 2000 blokken. Zonder ingang was output-RMS 0;
met ingang circa 0,04213. Het broncodeverschil heeft dus functionele betekenis,
ook al zijn beide kanten gebaseerd op dezelfde Elements-DSP.

Aanpak: ook de hardware-ingangen naar de native 32 kHz-DSP resamplen en
verwerken. Tot dat gebeurt deze specifieke functionaliteit expliciet als
onondersteund aangeven. Pariteit apart testen voor interne en externe excitatie.

### 4. Middel: STK Brass verliest timbre-instelling bij pitch/note-on

Bron: [StkSoundModule.h](../firmware/app-modular-brain/src/StkSoundModule.h#L237),
[Brass.cpp](../firmware/lib/stk/src/Brass.cpp#L75),
[stksound_wasm.cc](../tools/mmb-wasm/stksound_wasm.cc#L135).

`Brass::setFrequency()` herstelt de lipfilterfrequentie. CC#2 verandert die
vervolgens voor de timbre-instelling. Firmware `setPitch()` en `noteOn()` roepen
de STK-functies aan zonder daarna de timbre-controls opnieuw toe te passen.
Een ingestelde timbre kan daardoor bij de volgende noot verdwijnen, totdat
een andere control/CV-update `applyControlChanges()` oproept.

WASM herstelt de controls iedere render na de pitch. Er blijft daar nog een
kleine volgordeafwijking: een gate-op roept daarna `noteOn()` aan, dat opnieuw
`setFrequency()` doet. In WASM duurt die afwijking tot het volgende blok;
in firmware kan ze blijven bestaan. Dit bekende aandachtspunt uit het
pariteitsplan is in de bekeken firmwarecode dus nog aanwezig.

Aanpak: behandel pitch, note-on en modelafhankelijke controles in een gedeelde,
expliciete volgorde. Test zowel aangehouden pitch als herhaalde notes met een
niet-neutrale timbre. Broncodebevinding, geen nieuwe hardwareluistertest.

### 5. Middel: VCO coarse/fine reageert pas bij een volgende CV-verandering

Bron: [VcoModule.h](../firmware/app-modular-brain/src/VcoModule.h#L128),
[vco_wasm.cc](../tools/mmb-wasm/vco_wasm.cc#L48),
[CvGraph.cpp](../firmware/app-modular-brain/src/CvGraph.cpp#L101).

De setters slaan coarse/fine op maar berekenen de frequentie niet opnieuw.
Dat gebeurt alleen via voct/tune; de CV-bridge schrijft bovendien alleen bij
een gewijzigde bronwaarde. Zonder zo'n verandering kan de knop dus onbeperkt
zonder hoorbaar effect blijven.

Gemeten met de bestaande WASM-VCO, sinus en positieve nuldoorgangen over ongeveer
een seconde: basis circa 261,83 Hz; coarse +12 zonder CV-verandering nog steeds
261,83 Hz; daarna voct van 0 naar 0,0001 circa 523,67 Hz. Dit is een grove
frequentiemeting die het ontbreken van de octaafsprong duidelijk aantoont,
geen precisiestemmeting. De wrapper documenteert expliciet dat hij het
firmwaregedrag nabootst.

Aanpak: direct recomputeren bij coarse/fine, op beide platforms. Gelijke bugs
zijn wel pariteit, maar geen correcte functionaliteit. Ook fm, sync en fm_amt
zijn in deze gewone VCO expliciete no-ops; presenteer die niet als werkende
modulatiemogelijkheden.

## Kwaliteit en OO

Mijn oordeel: een doordachte en goed testbare basis, maar de adapter- en
lifecyclelaag is nog niet consequent genoeg om het geheel als robuust
productierijp te beoordelen. Het is beslist niet uitsluitend procedurele code
met een C++-etiket. De beste stukken hebben duidelijke verantwoordelijkheden
en bruikbare grenzen.

Sterke punten:

- `Module`, `CvModule`, `AudioModule` en `Envelope` zijn echte gedragscontracten.
  De virtuele destructor, `override`/`final`, factories en `unique_ptr` maken
  eigenaarschap en polymorf gedrag grotendeels expliciet.
- Compositie van een platformadapter met `Svf`, `Korg35`, `SamplePlayer` of een
  vendor-instrument is een goede keuze. Niet alles hoeft een overervingsboom in.
- De sampler hergebruikt dezelfde filters als losse modules; dat is echte
  herbruikbaarheid, niet alleen vergelijkbare namen of gekopieerde formules.
- De scheiding tussen stemtoewijzing en een stem/cel is helder. Een samplercel
  beslist niet zelf welke MIDI-noot welke stem krijgt.
- De WASM-host leest poort- en controlmetadata uit de binary en is grotendeels
  generiek. De C-ABI als procedurele platformgrens is hier passend.
- Hardwareproblemen zijn serieus onderkend: retire/reuse wegens AudioStream,
  nothrow-bufferallocatie en ready-guard bij Elements, sample-streaming buiten
  de audiolus, limieten, underruntelemetrie en een limiter op de samplersom.

OO-verbeteringen met concreet nut:

- Deel niet alleen de DSP, maar ook relevante parameter-/gatetoestand, defaults
  en toepassingsvolgorde. Een kleine platformvrije voice/controller per module
  kan beide adapters bedienen. Begin bijvoorbeeld met VCF of STK; geen grote
  generieke moduleframeworkherschrijving.
- Houd retire/reuse, reset en disconnect aparte, expliciete contracten. Nieuwe
  knopwaarden toepassen wist geen vorige gate, filterstate of CV-offset.
- Laat een gedeelde controlconversie/defaultdefinitie de herhaalde asFloat /
  asInt-lambdas en losse catalogus/WASM/firmwarewaarden vervangen waar dat
  daadwerkelijk duplicatie wegneemt.
- SampleBank verzorgt nu opslag, upload, bankdecodering, geheugenbeleid,
  streaming en diagnose in dezelfde klasse. Bij verdere uitbreiding zijn een
  bankdecoder en een streamservice zinvollere extracties dan extra basisklassen.
- Globals in een wrapper zijn acceptabel zolang iedere WASM-instantie precies
  een module vertegenwoordigt. Ze maken meerdere modules in een gedeelde
  WASM-memory en zelfstandige hosttests later wel lastiger. Constructor-/startup-
  aannames verdienen een getest initialisatiecontract, niet alleen een comment.

Meer OO hoeft niet automatisch performance te kosten. Compositie, encapsulatie
en niet-virtuele methoden kunnen volledig inline worden. Een virtuele call per
blok of CV-tick is een andere afweging dan per sample per stem. Behoud een
eenvoudige numerieke DSP-hot-path en meet voordat je abstraheringen verwijdert.
Ook een zuivere procedurele rekenfunctie kan uitstekend onderhoudbaar zijn.

## Hoe gelijk zijn firmware en WASM?

| Steekproef | Wat daadwerkelijk gedeeld is | Wat apart blijft |
|---|---|---|
| VCF | Exact dezelfde Svf-header | Controls, defaults, CV-status, samples naar int16 |
| Sampler | SamplePlayer, filters, follower en limiter | Bank-/streaminghost, gate/CV-adapter, feedbackrouting |
| Elements | Dezelfde gevendorde Part/DSP-bronnen | Ingangsverwerking, resampling, initialisatie en controls |
| STK | Dezelfde instrumentbronnen | Instrumentkeuze, pitch/controlvolgorde, geheugenafhandeling |
| VCO | Niet letterlijk een gedeelde kernel | Firmware gebruikt AudioSynthWaveform; WASM een handmatige port in teensy_waveform.h |
| Ahdsr | Zelfs de core-runtimeklasse wordt gecompileerd | cvhost-adapter en hosttiming |

Dus: op DSP-niveau veel echte gelijkheid; op module- en patchniveau nog geen
algemene gedragsidentiteit. De VCO is een belangrijke uitzondering op de claim
dat WASM steeds letterlijk dezelfde firmwarecode draait.

Concrete nuances:

- VCF bewaakt de Prepare-cadans van 128 samples terwijl WASM blokken van 32
  gebruikt. Dat is goed. CV-bemonstering en int16-kwantisatie blijven verschillen.
  Bovendien is de constructor-default cv_amt in firmware 2 en in WASM 1. Volledige
  controlState uit de editor kan dat maskeren; ontbrekende controls niet.
- Elements resamplet in firmware lineair en in de browserhost cubisch. Ook
  zonder de ontbrekende hardware-ingangen is de totale keten dus niet bitgelijk.
- [AudioEngine.ts](../editor/src/modular-mb/sim/AudioEngine.ts#L656) voegt aan
  iedere WASM-naar-WASM-kabel een renderquantum delay toe, niet alleen aan lussen.
  Daar komt de buffering van de ontvangende worklet bij. In een keten stapelt
  dit; bij feedback verandert het gedrag. Onderzoek een gemeenschappelijke
  graphhost of beperk expliciete delay waar mogelijk tot werkelijke cycli.
- Een interne sampler env->cutoff-route draait op hardware elke 32 samples
  binnen de module; de browser gebruikt hiervoor het externe workletnetwerk.
  Dezelfde kernels en cadans bewijzen dus nog geen gelijke feedbacklatency.
- Meerdere CV-bronnen naar dezelfde ingang gebruiken bewust last-change-wins,
  zowel in CvGraph als in de worklet. Dit is getest, dus geen toevallige bug.
  Maak deze niet-gebruikelijke semantiek expliciet; laat optellen via CvMath.

## Realtime, veiligheid en documentatie

### Risico's die aanvullende tests verdienen

- STK-instrumentwissels construeren buiten de audio-fence, maar vernietigen het
  oude instrument binnen de fence. Verplaats zo mogelijk alleen de pointerswap
  naar de kritieke sectie en destruction daarbuiten. Meet worst-case duur en
  underruns; er is hier geen tijdsmeting gedaan.
- DSP-setters en reset/bind-operaties worden vanuit de hoofdlus uitgevoerd,
  terwijl de audio-ISR dezelfde toestand gebruikt. Een enkele float-write is
  iets anders dan een consistente update van meerdere velden. Definieer per
  module waar een snapshot/commando wordt overgenomen. `volatile` alleen maakt
  samengestelde transacties niet veilig. Geen specifieke race gereproduceerd.
- De samplerbankloader controleert magic, versie en aantallen, maar de bekeken
  code telt frame/channelgroottes in uint32 op zonder zichtbare checked
  arithmetic en gebruikt individuele slotvelden voordat hun bereik volledig
  is gevalideerd. Voeg tests met corrupte banken, ongeldige channels/rates en
  overflows toe; beschouw bestanden niet als veilig omdat een eigen exporter
  ze normaal correct maakt. Geen corrupt-bestandexploit uitgevoerd.
- De worklet maakt typed-arrayviews in renderBlock en compileert/initialiseert
  WASM in de processorconstructor. STK-keuze en sampleberichten kunnen daar ook
  alloceren. Dit zijn meetpunten voor worst-case audiojitter, niet het bewijs
  dat normale patches nu haperen.
- Het retire-poolbeleid houdt AudioStreams bewust in leven. Dat is een
  pragmatische oplossing voor de upstream-lifetimebeperking, geen gewone
  onbedoelde leak. Wel zijn resourcebudget, resetgedrag en gedrag na herhaald
  wisselen tussen verschillende moduletypes nodig als expliciete tests.

### Leesbaarheid en gedocumenteerdheid

De hoeveelheid uitleg, portmaps, ADR's, meetresultaten en foutanalyses is een
sterk punt. Het waarom van ontwerpkeuzes is vaak beter vastgelegd dan in veel
vergelijkbare projecten. De zwakte is actualiteit: historische uitleg staat
soms als actuele waarheid naast nieuwe code.

Voorbeelden: de VCF-header beschrijft nog cvDc_, AudioFilterStateVariable en
een benodigde graph-rebuild voor typewijzigingen, terwijl de nieuwe Svf dat
niet doet. Het WASM-README heeft een oude moduletabel en Tone-beperkingen naast
latere architectuur. De samplewrapper noemt lagere firmwarebanklimieten,
terwijl beide kanten inmiddels 256 slots/512 zones gebruiken. De workletkop
beschrijft lineaire resampling, de uitvoering gebruikt cubic voor audio;
CV/gate-invoer wordt in sampleAt nog lineair geinterpoleerd, terwijl uitvoer
zero-order-hold is. Een blanketclaim 'gates worden nooit geinterpoleerd' klopt
dus niet voor beide richtingen.

Aanpak: scheid actuele contractspecificaties van historische devlogs. Genereer
een statusmatrix uit metadata waar mogelijk: poort bestaat, poort werkt,
gedeelde kernel, gedeelde controller, en geteste pariteit zijn verschillende
eigenschappen. Een groene supportbadge of een bestaande wasm-file bewijst niet
dat iedere ingang functioneel is.

## Verificatie en vervolgstappen

Uitgevoerd:

- Zeven Vitest-bestanden: wasmWorklet, wasmFilter, wasmStkSound, wasmPorts,
  wasmSamplerWah, wasmSamplerLimit en wasmSamplerBend: **132 tests geslaagd**.
- Losse in-memory Node-proeven van de bestaande VCO- en Elements-WASM-binaries,
  met de hierboven beschreven resultaten. Geen blijvende testbestanden gemaakt.
- Firmwaretests via CMake Tools geprobeerd: niet gestart door
  `Build failed: Unable to configure the project`. Geen firmwaretestresultaat
  of geslaagde firmwarebuild geclaimd.

Niet uitgevoerd: volledige editorsuite, een nieuwe firmware/WASM-build,
bitcheck-scripts, fysieke audiometingen, geheugenstress en corrupt-inputtests.
De aanwezige bitchecks vergelijken enkele geextraheerde kernels met oude
implementaties; dat is waardevol maar geen volledige firmware-WASM-patchtest.

De bekeken releaseworkflow bouwt firmware maar draait geen tests. De
editorpublicatie voert npm ci, banks en build uit, geen Vitest of WASM-rebuild.
Er is geen bekeken PR-workflow die deze pariteitschecks afdwingt. Daardoor
kunnen bronwijzigingen en eerder gebouwde binaries uit elkaar lopen.

Aanbevolen volgorde:

1. Configvalidatie/unieke ids en expliciete CV/gate-disconnectsemantiek, met
   adapter-/lifecycle-regressietests. Dit beschermt alle modules.
2. De concrete Elements-, STK- en VCO-problemen herstellen met dezelfde
   scenario's op firmwarehost en WASM. Bekende beperkingen zichtbaar maken.
3. Voor een kleine module parameter-/gatetoestand delen en laten zien dat
   beide adapters dezelfde eventreeks uitvoeren. Breid dat patroon gericht uit.
4. CI: core-tests, DSP-/worklettests, reproduceerbare WASM-build en firmwarebuild
   als gates; binaries koppelen aan broncommit/toolchain. Vergelijk output met
   passende tolerantie, en timing/eventvolgorde afzonderlijk.
5. Worst-case callbacktijd, patchwissels, geheugendruk, inputvalidatie en
   feedbacklatency meten. Niet optimaliseren op basis van alleen gemiddelde CPU.

Kortom: behoud de architectuur en de gedeelde DSP. De grootste kwaliteitswinst
zit in gedeelde besturingslogica, betrouwbare lifecyclecontracten, actuele
documentatie en end-to-end verificatie, niet in meer overerving op zichzelf.