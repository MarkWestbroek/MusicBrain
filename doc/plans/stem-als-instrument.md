# De stem als bespeelbaar instrument

**Datum:** 2026-09-30. **Status:** onderzoeksadvies plus werkend FOF-prototype.

Vervolg op [ZANG met PSOLA](zingende-stemmen.md), de
[syntheseverkenning](synthesetechnieken-verkenning.md) en
[State-Graph Synthesis](state-graph-synthesis.md).

## Gebouwd prototype: FOF-VOICE

Op 2026-09-30 is de eerste proef als echte MusicBrain-module gebouwd:
`tp_mmb_fof`. Hij draait met dezelfde header-only DSP-kern in de
editorsimulator en op de Teensy 4.1. Er is geen opname, bank, Piper-dienst of
extra hardware nodig.

De kern gebruikt een pitch-synchrone impuls die vijf gedempte sinusresonatoren
exciteert. Hun frequenties, bandbreedtes en niveaus morfen tussen vijf vaste
klinkerprofielen. Omdat de formanten niet met F0 meeschuiven, blijft de
klinkerkleur bij verschillende noten herkenbaar. Dit is FOF/CHANT-geinspireerd,
maar nog geen volledige reconstructie van CHANT: er zijn geen afzonderlijke
FOF-grains met instelbare rise/duration/decay en geen fonemen- of
articulatiescore.

### Proberen

1. Herlaad de editor zodat de nieuwe wasm wordt opgehaald.
2. Kies `Poly` en daarna `FOF Stem (mono)`. Dit maakt automatisch
   `MidiIn -> FOF Stem -> OUT`.
3. Open `Simulatie`, start audio en speel op het schermklavier of via MIDI.
4. Draai eerst `Vowel` langzaam van 0 naar 1: dat doorloopt
   `A -> E -> I -> O -> U`.
5. Probeer daarna `Tone`, `Breath` en `Vibrato`. Houd een noot aan tijdens
   het bewegen; juist de continue klinkermorf is de kern van deze proef.

Los patchen kan ook. Ingangen zijn `voct`, `gate`, `vowel` en `breath`; uitgang
is mono `out`. `Vowel`- en `Breath`-CV tellen op bij hun knop. Een LFO of
envelope naar `vowel` maakt articulatiebeweging; velocity of een
ademcontroller naar `breath` maakt de inzet luchtiger. `Vibrato` loopt op
5,3 Hz en heeft bij de maximumstand 22 cent diepte.

### Implementatie

- `firmware/lib/mmb-dsp/mmb_dsp/fof_voice.h`: gedeelde DSP-kern zonder heap.
- `tools/mmb-wasm/fof_wasm.cc`: simulator-ABI, native 44,1 kHz.
- `firmware/app-modular-brain/src/FofModule.h`: Teensy `AudioStream` en
  MusicBrain-poort/controlcontract.
- Editorpaneel, catalogus, classificatie en mono-seed staan in de bestaande
  modulaire editorstructuur.

De wasm-rooktest rendert twee seconden, faalt bij stilte/NaN/clipping en mat
een piek van 0,232. Op de ontwikkel-pc kostte de renderlus 0,2-0,3 procent van
een realtime seconde; dat is geen browser- of Teensy-CPU-meting. De volledige
Teensy-build slaagt: 600.672 bytes code, 57.024 bytes vrije RAM1 en 269.408
bytes vrije RAM2 voor heap/new. De editor typecheckt en alle 171 contracttests
slagen. De module is nog niet op fysieke hardware beluisterd of geprofiled.

### Bekende beperkingen en volgende stappen

- De klinkertabellen zijn algemene volwassen-stemwaarden, geen Nederlandse
  zanger of persoonlijk stemprofiel.
- De eenvoudige impulsbron klinkt synthetisch; LF-achtige glottispulsen,
  spectral tilt en druk/registerkoppeling zijn de belangrijkste volgende
  klankverbeteringen.
- Alleen aspiratieruis is gemodelleerd. Medeklinkers, tweeklanken, onsetvormen,
  melisma's en woorden ontbreken.
- De envelope heeft vaste attack/release. Expressieve controls voor druk,
  glottale spanning, attack en release zijn logische uitbreidingen.
- De huidige formantmorf is akoestisch, niet articulatorisch. Een volgende
  vergelijking moet dezelfde controls op een LF-plus-waveguide-model zetten.
- Eerst droog in simulator en Teensy beluisteren. Daarna spectra en F0 meten,
  extreme CV testen en pas dan polyfonie of een geleerd parametermodel toevoegen.

## Advies in het kort

Voor MusicBrain is een hybride steminstrument de aantrekkelijkste richting:
opnames leveren uitspraak en een stemprofiel; een expliciete synthesizer maakt
de toon; de speler bestuurt adem, fonatie, klinkerbeweging en toonhoogte.
Een klein neuraal netwerk kan later de onderlinge samenhang leren. Het hoeft
niet iedere audiosample te genereren.

Drie afzonderlijke proeven zijn zinvol, in deze volgorde:

1. Een lichte FOF/CHANT-zangoscillator, als snelle hoorbare referentie.
2. Een LF-bron met een beweeglijke digitale mond-keelholte, als fysiek instrument.
3. Een kleine, causaal werkende neurale parameterbesturing voor proef 2 of een
   harmonischen-plus-ruissynthesizer, getraind op echte zang.

WORLD is daarnaast een nuttige analyse/resynthese-referentie. RAVE is interessant
voor vrijere klankinstrumenten op een compacte Linux-computer. Geen van deze
keuzes is hier op MusicBrain beluisterd of gebenchmarkt.

## Waarom toonhoogteverandering nog geen zang oplevert

Volgens het huidige ZANG-plan worden gesproken lettergrepen via pitch marks
hersynthetiseerd en wordt een klinkerkern aangehouden. Dat behoudt veel van de
opname, inclusief eigenschappen van spreken die bij zingen anders zijn.

De werkhypothese is dat naast mogelijke analyseartefacten vooral ontbreekt:

- Veranderende glottale puls: open-/sluitgedrag, spectrale helling en luchtlek.
- Samenhang tussen intensiteit, register, toonhoogte en klinkerkleur.
- Beweging tijdens een aangehouden klinker, in plaats van alleen een korte lus.
- Zangarticulatie: legato, medeklinkertiming, tweeklanken en melisma's.
- Een bedoelde tooninzet en ontwikkeling van vibrato, niet alleen een LFO.

Dit is geen vastgestelde diagnose van de huidige audio. De goedkope
onderscheidende proef is dezelfde frase door ZANG laten zingen vanuit
Piper-spraak, eigen spraak en een werkelijk gezongen opname, met gelijke
noten, duur en luidheid en zonder galm. Is de gezongen bron duidelijk beter,
dan is bronmateriaal een belangrijke beperking; blijft dezelfde rafel overal,
dan moeten pitch marks, grenzen en sustain eerst worden onderzocht.

Piper blijft bruikbaar voor uitspraak, medeklinkers en uitlijning. Een
spraakmodel heeft niet automatisch geleerd hoe dezelfde persoon klinkt bij
falset, hoge noten of sterk aangezette zang. Meer rekensnelheid verandert dat niet.

## Technieken naast de huidige PSOLA en bandvocoder

| Techniek | Wat je kunt bespelen | Verwachting en beperking |
|---|---|---|
| FOF/CHANT | Grondtoon, afzonderlijke formantfrequenties, breedtes, amplitudes en pulsomhullenden | Zeer bruikbaar voor zangachtige klinkers; geen automatische Nederlandse uitspraak of stemkopie |
| LF-bron plus formant-/LPC-filter | Fonatie los van mondkleur, inclusief ademruis | Licht en controleerbaar; analyse van de bron/filter-scheiding is niet exact |
| Harmonisch-plus-ruismodel, SMS/HNM | Partiaalsterktes, ruis, toonhoogte en tijd afzonderlijk | Flexibele resynthese; kwaliteit hangt sterk van analyse en overgangsmodellering af |
| WORLD / STRAIGHT-familie | F0, spectrale omhullende, aperiodiciteit en tijd | Technisch ook vocoders, maar geen WARPS-achtige bandvocoder; geen automatische zangexpressie |
| Articulatorische synthese | Tong, lippen, kaak, neuskoppeling, glottis | Werkelijk nieuwe klank maken uit een lichaamsmodel; uitspraakbesturing is een eigen probleem |
| DDSP / neurale bron-filtermodellen | Geleerde samenhang met expliciete pitch- en expressiebesturing | Kansrijk hybride compromis; model, training en streaming moeten hiervoor worden ontworpen |
| RAVE | Bewegen door een geleerde klankruimte | Goed voor exploratie; precieze pitch, fonemen en identiteit zijn niet vanzelf ontward |

FOF genereert korte sinusbursts op de grondtoonfrequentie, met per formant een
eigen frequentie en omhullende. Het gebruikt geen uit de opname geknipte
stemperioden zoals PSOLA. Vier tot zes formanten vormen een bruikbare eerste
proef, geen kwaliteitsgarantie. CHANT is belangrijke bestaande zangsynthetische
prior art, niet een nieuw voorstel van MusicBrain.

LPC-cross-synthesis kan de geschatte spectrale omhullende van de stem toepassen
op een andere bron. Cepstrale scheiding en spectrale morphing bieden verwante
mogelijkheden. Noem dit niet ten onrechte iets volledig buiten vocoding: het
zijn andere analyse/resynthesevormen. Een eenvoudig all-pole LPC-filter mist
onder meer de antiresonanties van een goede neusholtemodellering.

Een andere route is de stem alleen als controller gebruiken: klinkerpositie,
stemhebbendheid, luidheid en ruisfractie sturen een snaar, resonator of oscillator.
Dat vereist geen tekstherkenning. Pitchtracking op lage stemmen heeft wel een
venster van meerdere perioden nodig; MIDI-pitch vermijdt die invoervertraging.

## Fysieke modellen: wat bestaat en wat is haalbaar?

### Een licht articulatorisch model

De Kelly-Lochbaum/digital-waveguide-familie benadert het spraakkanaal als
gekoppelde buissegmenten. Doorsneden bepalen reflecties; een zijtak modelleert
de neus. Lipstraling, verliezen, vernauwingen en lokale ruis maken het bruikbaarder.
Pink Trombone is een direct bespeelbaar browservoorbeeld van een LF-bron en
een gesegmenteerd mond/neus-model. Het laat zien dat dit type model realtime
kan werken; het bewijst geen Teensy-polyfonie of professionele zangkwaliteit.

Een LF-bron (Liljencrants-Fant) is een parametrisch model van de glottale
golfvorm, geen volledige mechanische simulatie van trillende stembanden.
Voor een eerste instrument is dat juist praktisch: F0 blijft direct speelbaar.

### Een werkelijk gekoppeld stemlichaam

Twee-massa- en body-covermodellen beschrijven zelfoscillerende stembanden met
stijfheid, massa, demping, contact en luchtdruk. Koppeling aan de akoestische
belasting van het spraakkanaal kan registerovergangen en niet-lineair gedrag
opleveren. Niet ieder gereduceerd model reproduceert alle zangtechnieken.

VocalTractLab is een concrete onderzoekslijn en softwarebasis voor
articulatorische synthese, met anatomische geometrie, buismodellen,
glottale modellen en gestural scores. Het is geen kant-en-klare MIDI-zanger.
De volledige backend is hier niet op realtime snelheid onderzocht.

Gereduceerde 1D-modellen zijn serieuze realtime kandidaten op huidige computers.
Een monofone geoptimaliseerde waveguide met eenvoudige bron is een redelijke
Teensy-proef. Een gedetailleerde 3D stromings-/weefselsimulatie is een andere
orde van probleem en geen verstandige eerste embedded route.

Een eigen stem uit een opname terugrekenen naar unieke anatomie kan niet zomaar:
verschillende bron- en kanaalinstellingen kunnen vergelijkbare audio opleveren.
Gebruik eerst akoestische stemprofielen of beperkte, geregulariseerde parameterfits.
Een model dat menselijk klinkt is niet automatisch een model van jouw stem.

## Wat moderne AI-zangsynthese gebruikt

Maak onderscheid tussen drie producten, die verschillende problemen oplossen:

1. **Zangsynthese uit tekst en noten (SVS).** Fonemen, noten, timing en
   stemidentiteit gaan naar een akoestisch model. Dat voorspelt bijvoorbeeld
   een mel-spectrogram, waarna een neurale waveformgenerator audio maakt.
   DiffSinger gebruikt diffusion; OpenVPI ondersteunt ook rectified-flowwerk
   en expliciete parameters voor onder andere pitch, energie en breathiness.
   HiFi-GAN/NSF-achtige generators zijn concrete bouwstenen. VITS/VISinger is
   een verwante familie met een andere architectuur, niet hetzelfde algoritme.
2. **Singing voice conversion (SVC).** Bestaande audio levert inhoud, timing
   en vaak de zangexpressie; het model verandert vooral de stemidentiteit.
   DDSP-SVC, RVC en so-vits-svc zijn voorbeelden. Spraak invoeren en F0
   vervangen lost de ontbrekende zangarticulatie niet vanzelf op.
3. **Complete muziekgeneratie.** Audio-tokenmodellen, transformers, diffusion
   en flowmodellen zijn openbare onderzoeksrichtingen. De precieze huidige
   architecturen van gesloten diensten als Suno en Udio zijn niet volledig
   openbaar; daarom geen specifieke interne keten aan die diensten toeschrijven.

De kwaliteit komt mede uit zangdata: dynamiek, register, coarticulatie en
expressie zijn geleerd. Het is niet alleen een betere pitchshifter.
Een bestaand inferentiesysteem is nuttige infrastructuur, maar geen bewijs dat
een willekeurig zangmodel past, exporteerbaar is of causaal werkt. De door de
gebruiker genoemde AI-motor is in deze verkenning niet technisch geaudit.

## Voorgestelde hybride MusicBrain-architectuur

```text
VOORBEREIDING OP COMPUTER
opname / Piper -> uitlijning + analyse -> articulatietraject / stemprofiel
echte zang + expressielabels -> optionele training van kleine parameterdecoder

TIJDENS HET SPELEN
MIDI / MPE / adem / CV -> pitch, druk, fonatie, klinkerpositie
bank + next/hold/release -> articulatiebesturing
regels OF kleine causale decoder -> syntheseparameters
LF + mond/neus-model OF harmonischen + ruis -> audio
```

Het neuraal netwerk kan op bijvoorbeeld 100-250 Hz werken, terwijl DSP op
audiorate loopt en parameters glad interpoleert. Dit zijn ontwerpwaarden,
geen gemeten grenzen. Pitch en snelle aanslagen krijgen een directe route;
het netwerk verzorgt vooral de expressieve samenhang. Training kan
differentiable DSP gebruiken, zonder TensorFlow op de Teensy te hoeven zetten.

Begin met vijf klinkers, enkele overgangen en handmatige regels. Pas daarna
medeklinkers, complete tekst en een geleerd model. Voor expressietraining zijn
opnames over toonhoogten en dynamieken nodig; een handvol seconden spreken
dekt die ruimte niet. Datahoeveelheid en modelgrootte moeten uit een leercurve
blijken, niet uit een vooraf beloofd aantal minuten.

Voor woorden is een hybride met opgenomen medeklinkers en synthetische klinkers
een nuttige proef. Overgangen, fase en bron/filterverschillen kunnen daarbij
hoorbare naden geven. Een melisma moet dezelfde lettergreep over meerdere noten
houden; nieuwe noten mogen niet altijd automatisch de tekst laten doorlopen.

Medeklinkers voor de tel vragen voorkennis. Bij een sequencer kun je vooruit
plannen; bij onverwachte live toetsen kan het instrument niet voor de aanslag
beginnen. Kies dan expliciet voor directe medeklinkerinzet, klinker-prioriteit,
of een bekende vaste vertraging. Claim geen negatieve latency.

## Hardware en realtime criteria

| Platform | Eerst onderzoeken | Niet aannemen |
|---|---|---|
| Computer, native C++ / WASM | FOF, LF-waveguide, WORLD-referentie; training apart | Python/GPU-code verhuist niet automatisch naar AudioWorklet |
| Teensy 4.1 / STM32H7 | FOF, eenvoudige LF/filterstem, gereduceerde waveguide, kleine parameterdecoder | Acht stemmen of volledige neurale waveformgeneratie zonder meting |
| Raspberry Pi 4/5 / Compute Module | Zwaardere DSP, lichte RAVE, gekozen neurale bron-filterdecoder | Elk model werkt met instrumentwaardige latency |
| Kleine GPU-computer | Zwaardere neurale proeven | Laag stroomverbruik, stille koeling en lage latency volgen niet uit TOPS |
| FPGA | Strak gesynchroniseerde I/O en samplegewijze hybride feedback | Een groot PyTorch-model is een eenvoudige port |

RAVE documenteert een `raspberry`-configuratie voor realtime Pi 4-inferentie.
Dat is concreter dan alle neurale synthese categorisch buiten compact hardware
plaatsen. De oude syntheseverkenning sluit DDSP/RAVE uit voor Teensy/Tang;
dat is geen uitsluiting van kleine parameterdecoders of een Linux-coprocessor.

RTNeural is een mogelijke C++-referentie voor kleine Dense/GRU/LSTM-netwerken,
geen verplicht nieuw subsysteem naast de bestaande AI-motor. NPU's zijn pas
interessant als alle relevante operators, recurrente toestanden en kleine
streamingblokken ondersteund worden; kopieren en CPU-fallback kunnen de winst tenietdoen.

Meet afzonderlijk modeldoorvoer, lookahead, blokwachttijd, driver/converters,
besturingsreactie, piekbelasting en underruns. Een factor tien sneller dan
realtime renderen bewijst geen snelle reactie op een onverwachte noot.
Bij 44,1 kHz duurt een blok van 128 samples al ongeveer 2,90 ms; dat is niet
de totale systeemvertraging. Een bruikbaar voorlopig doel is onder 10 ms
van besturing tot audio, met expliciete meting en ruimte voor de rest van de patch.

Houd snelle fysieke terugkoppeling lokaal bij dezelfde processor. Gebruik
dCV voor besturing en de bedoelde audiotransporten voor audio, niet een
controlbus als samplegewijze fysieke koppeling. Ook een FPGA verwijdert de
vertraging van ADC/DAC en analoge filters niet.

## Proeven en beslismomenten

1. **Bron of algoritme?** Vergelijk Piper, gesproken en gezongen materiaal in
   de bestaande ZANG-keten. Zelfde frase, noten, niveau en droge uitvoer.
2. **Direct bespeelbare klinker.** Vergelijk FOF met LF-waveguide: lange noot,
   crescendo, octave glide en langzaam a-ee-oe-traject. Beoordeel identiteit,
   zangkarakter, regelbereik en reactietijd afzonderlijk.
3. **Uitspraak.** Voeg korte medeklinkers en tweeklanken toe. Test legato,
   melisma, nieuwe lettergreep, sustain en loslaten op onverwachte momenten.
4. **Heeft AI toegevoegde waarde?** Vergelijk dezelfde DSP met handmatige
   regels en een kleine geleerde decoder, op niet voor training gebruikte
   frasen, toonhoogten en dynamiek. Alleen doorgaan bij hoorbare verbetering.
5. **Porteren.** Eerst mono, dan maximale stemmen meten, samen met een
   representatieve patch. Controleer geheugen, aliasing, extreme parameters,
   stabiliteit en herstel na stilte. Geen hardwarekeuze uitsluitend op FLOPS.

Voor een fysiek gekoppelde stem geldt bovendien: nauwkeurige MIDI-stemming
is niet vanzelfsprekend als F0 uit luchtdruk en stijfheid ontstaat. Een
gekalibreerde feedforwardregeling kan muzikaal nuttiger zijn dan een agressieve
pitchregelaar die juist de interessante instabiliteit onderdrukt.

## Andere instrumentrichtingen

Nieuwheid hieronder is een ontwerphypothese, geen claim dat niemand dit ooit
heeft gemaakt. Waveguides, CORDIS-ANIMA, scanned synthesis, modal synthesis en
neurale timbretransfer zijn bestaande families. Ook MusicBrain heeft al het
uitgebreide State-Graph-voorstel. De volgende ideeen specificeren speelbare
experimenten daarbinnen, niet nogmaals een nieuwe naam voor hetzelfde principe.

### 1. Richtingsgevoelig resonantienetwerk

Een akkoord leeft in gekoppelde resonatoren. De speler verandert niet alleen
de sterkte maar ook de richting waarin energie tussen tonen stroomt.
Een veeg kan een lage aanslag naar hoge resonanties laten doorgeven, terwijl
de omgekeerde beweging een andere respons geeft. Dit is interne koppeling,
niet alleen stereopanning of een EQ.

Begin met drie resonatoren en vergelijk reciproque met niet-reciproque
koppeling. Meet respons in beide richtingen en begrens de interne energie.
Actieve of tijdgemoduleerde koppelingen kunnen energie toevoegen; een limiter
op de uitgang alleen maakt het model niet stabiel. Teensy-prototype eerst,
FPGA alleen bij een aangetoonde timing-/I/O-behoefte.

### 2. Leerbare aanslag en wrijving, verwisselbaar klanklichaam

Neem het contactgedrag van strijken, wrijven of aanslaan als model, en gebruik
dat om een ander fysiek klanklichaam aan te drijven. Een glasachtig lichaam
kan dan reageren op de speelbeweging van een gestreken snaar, met stick-slip
en drukafhankelijke inzet in plaats van alleen een gekopieerd timbre.

De moeilijkheid is bron en lichaam identificeren. Een willekeurige microfoonopname
scheidt die niet uniek. Begin met een bekend lichaam en gemeten kracht/beweging,
of een expliciet gekozen bronmodel. Leer eventueel alleen de lokale
contactwet; DSP bewaakt energie en stabiliteit. Dit is specifieker dan gewone
audio-naar-audio style transfer, maar raakt bestaande hybride physical modeling.

### 3. Materiaal met bespeelbare voorgeschiedenis

Hard spelen verandert tijdelijk lokale spanning, demping of contactdrempels.
Een volgende aanslag klinkt daardoor anders, zelfs bij dezelfde MIDI-waarden.
De speler kan die toestand langzaam laten herstellen, vasthouden of resetten.
Voorbeeld: een plaat die na een drukke passage zachter, lager en minder
harmonisch reageert en tijdens rust weer terugkeert.

Dit is een concrete uitwerking van de al beschreven hysterese/resource-koppeling,
niet een nieuwe synthesegrondslag. Het onderscheid moet in bespeelbaarheid
zitten: kan een muzikant het materiaal bewust conditioneren en herkennen?
Een paar langzame toestanden maken de eerste proef goedkoop op Teensy.

Van deze drie is de leerbare exciter het interessantste AI-onderzoek; het
richtingsgevoelige netwerk het duidelijkste nieuwe fysieke speelconcept;
materiaalgeheugen de goedkoopste proef binnen de huidige infrastructuur.

## Bronnen en hergebruik

Geraadpleegde projectdocumentatie; dit is geen volledige literatuur- of
licentieaudit. Pin versies en controleer code, modelgewichten, trainingsdata
en stemrechten afzonderlijk voordat iets wordt meegeleverd.

- [Csound FOF](https://csound.com/docs/manual/fof.html): werking, CHANT-herkomst
  en een vijf-formantenvoorbeeld dat realtime audio uitstuurt.
- [Pink Trombone](https://dood.al/pinktrombone/): interactief LF- en
  mond/neus-model, inclusief de uitvoerbare browserimplementatie.
- [VocalTractLab](https://www.vocaltractlab.de/): geometrie, akoestiek,
  articulatie en gestural scores; project vermeldt GPL sinds versie 2.3.
- [VocalTractLab backend](https://github.com/TUD-STKS/VocalTractLabBackend-dev):
  C++ en C-interface; ontwikkeltak, niet automatisch een stabiele release.
- [WORLD](https://github.com/mmorise/World): F0, spectral envelope,
  aperiodiciteit en sequentiele realtime synthese; modified BSD.
- [PyWORLD](https://github.com/JeremyCCHsu/Python-Wrapper-for-World-Vocoder):
  praktische computeranalyse en resynthese.
- [DDSP](https://github.com/magenta/ddsp): leerbare DSP-bouwstenen,
  harmonischen-plus-ruis en timbretransfer.
- [OpenVPI DiffSinger](https://github.com/openvpi/DiffSinger): concrete
  zangarchitectuur, expressieparameters en waveformgenerators; Apache-2.0
  voor deze codefork, niet automatisch voor alle modellen.
- [ESPnet](https://github.com/espnet/espnet): SVS-recepten en onder meer VISinger.
- [DDSP-SVC](https://github.com/yxlllc/DDSP-SVC): conversie en realtime frontends;
  sommige uitvoeringen gebruiken ook diffusion en een neurale vocoder.
- [RAVE](https://github.com/acids-ircam/RAVE): latent-klankruimte, causale
  configuraties, streamingexport en de lichte Raspberry Pi-configuratie.
- [RTNeural](https://github.com/jatinchowdhury18/RTNeural): kleine realtime
  C++-netwerken en benchmarks; BSD-3-Clause, met aparte backendlicenties.

**Verificatiestatus:** lokale plannen en moduleclassificatie gelezen;
bovenstaande upstreamdocumentatie geraadpleegd. Geen nieuwe synthesizer
gebouwd, geen luistervergelijking uitgevoerd en geen embedded prestaties
gemeten. De proeven hierboven zijn de manier om het advies te falsifieren.