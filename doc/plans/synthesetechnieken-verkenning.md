# Synthesetechnieken buiten de vier bekende

Verkenning voor MusicBrain / Cortex. De vier waar we al mee werken — additief,
subtractief, FM (of eigenlijk PM), en physical modeling — dekken maar een deel
van het veld. Hieronder de rest, met per techniek een routing naar Teensy,
FPGA of analoog.

**Revisie 2.** De eerste versie routeerde een aantal technieken naar de FPGA
met het argument "veel identieke filters". Dat argument is in de
FPGA-vergelijking van augustus al weggestreept en is hieronder gecorrigeerd.

**Revisie 3 (2026-09-06).** §F toegevoegd: structuurgedreven synthese
(state graph, resource-coupled en verwanten). Die categorie ontbrak, terwijl
[State-Graph Synthesis](state-graph-synthesis.md) er al lag.

---

## 0. De routingcriteria, zoals eerder vastgesteld

Deze staan voorop omdat de rest van het document eraan hangt.

**Rekenkracht is nooit het argument.** Bij 100 MHz en 48 kHz heb je ruim 2000
klokcycli per sample; één multiplier levert dus meer dan 2000
vermenigvuldigingen per sample. Een 24-bands vocoder kost er zo'n 260, een
achtstemmige poly zo'n 80. De 48 multipliers van de GW2A-18 zijn niet de
beperking — blok-RAM en ontwerptijd zijn dat.

**Waar de FPGA wél wint:**

1. **Sub-sample latency in een feedbacklus.** Een blokgebaseerde DSP zit op
   0,7–1,3 ms plus codec. Zodra het digitale deel *in* de analoge keten zit
   met terugkoppeling via de matrix, is dat hoorbaar. Dit is het sterkste
   argument dat het project heeft.
2. **Heterogene, gekoppelde structuren.** Honderden kleine verschillende
   dingen die op elkaar reageren. Niet: N identieke stemmen — dat is een lus,
   en daar is een DSP goed in.
3. **Bit-niveau werk** en rare fixed-point formaten.
4. **I/O-vrijheid**: veel synchrone I²S-streams en CV-kanalen op één klok.

**Waar de Teensy wint:** geheugen (PSRAM, SD), sequentiële en vertakkende
wiskunde (recursies, deling, sorteren), en alles wat toch al blokgebaseerd is.

**Waar analoog wint:** niet-lineariteiten die digitaal aliassen, en alles wat
onder de productbelofte valt dat het audiopad analoog blijft.

*Niet in de tabel, wel eerder afgewogen:* SigmaDSP (ADAU1466/1467) vult het
gat tussen MCU en FPGA netjes, maar de toolchain is gesloten en
Windows-only — voor open hardware een principieel bezwaar. Buiten beschouwing
gelaten.

---

## A. Golfvormmanipulatie

### Wavetable
Een tabel met golfvormen, waarbij je *tussen* tabellen scant met een CV. PPG,
Waldorf, later Serum. Klinkt niet als sample-playback omdat de tabel één
cyclus is, geen opname.

- Per stem: fase-accumulator, twee samples ophalen, interpoleren. Zestien
  stemmen kosten enkele procenten van een Teensy of STM32H7.
- De beperking is **geheugenbandbreedte**, en daar is een SDRAM-controller op
  een MCU net zo goed als op een FPGA.
- **Routing: Teensy.** Zoals eerder geconcludeerd: geen FPGA-zaak.

### Phase distortion / waveshaping
Casio CZ. Je houdt een sinus-lookup maar vervormt de *fase-index* voordat je
opzoekt. Levert filtersweeps zonder filter. Waveshaping is de broer ervan:
lineaire golf door een niet-lineaire transferfunctie.

- Kosten: één extra tabel-lookup, geen multiply. Extreem goedkoop.
- **Routing: Teensy.** Veertig stemmen hiervan is een lus, geen
  FPGA-argument — dat was precies de denkfout uit versie 1. Wél naar de FPGA
  zodra de waveshaper *in* een analoge feedbacklus hangt, want dan telt punt 1.

### Wavefolding (West Coast)
Buchla/Serge: in plaats van harmonischen wegfilteren, voeg je ze toe door de
golf op zichzelf terug te vouwen bij hoge amplitude. Met low-pass gates geeft
dit het typische Buchla-gedrag waarbij toonhoogte, timbre en envelope aan
elkaar vastzitten.

- **Routing: analoog.** Een digitale folder aliast hard; dit is een van de
  weinige gevallen waar analoog objectief beter is. Past als klein analoog
  kaartje op een Cortex-slot, en sluit aan bij de productbelofte.

### Wave terrain
Een 2D-oppervlak z = f(x,y); je laat een baan over het oppervlak lopen en het
hoogteprofiel is je golfvorm. Twee CV's, twee volstrekt verschillende
timbre-assen.

- **Direct raakvlak met het trackpad.** De Cirque GlidePoint levert X, Y én Z
  op 300 Hz — precies de invoer die deze techniek nodig heeft, en een sterkere
  demo dan "pad mapt naar cutoff".
- **Routing: Teensy** (het oppervlak is een 2D-tabel, dus geheugen).

### Vector synthesis
Prophet VS, Wavestation. Vier bronnen, één joystick, een envelope die de
joystickpositie automatiseert. Meer een *architectuur* dan een klankmethode —
en daarom goed op een busgebaseerd systeem: vier willekeurige Cortex-slots
kunnen de vier hoeken zijn, met de kruisfade als dCV.

---

## B. Tijd- en korreldomein

### Granulaire synthese
Geluid opgehakt in korrels van 1–100 ms, elk met eigen toonhoogte, positie,
envelope en pan. Weinig, gespreide korrels = pointillisme; veel overlappende
korrels = een wolk.

- Kosten: geheugenbandbreedte. Honderd korrels = honderd gelijktijdige
  leesposities in een lange buffer.
- **Routing: Teensy met PSRAM.** Op de FPGA loop je vast op blok-RAM tenzij je
  externe SDRAM erbij haalt, en dan vecht je met de geheugencontroller — en
  blok-RAM was al de echte beperking.

### Pulsar-synthese (Roads)
Strakkere neef van granulair: een korte golfvorm gevolgd door stilte, herhaald
op een grondfrequentie. De verhouding puls/stilte bepaalt een formant. Zit op
de grens tussen ritme en toonhoogte — traag herhaald hoor je een ritme,
versneld wordt het een toon.

- **Routing: Teensy.**

### Concatenatieve synthese
Een database met korte fragmenten, geïndexeerd op akoestische kenmerken. Je
"schildert" een doelklank en het systeem plakt de best passende fragmenten aan
elkaar. Beslissingslogica, geen DSP.

- **Routing: Teensy**, database op de onboard microSD — dezelfde kaart die de
  freestyle-machine al als ringbuffer gebruikt.

---

## C. Spectraal

### Kanaalvocoder
16–24 bandpassfilters op de modulator, envelopevolgers per band, dezelfde
banden op de carrier.

- **Routing: FPGA — maar niet vanwege rekenlast.** Die is triviaal (~260
  mults per sample). De reden is architectureel, zoals eerder vastgelegd: een
  Teensy-vocoder breekt de belofte dat het audiopad analoog blijft en zet
  blokvertraging in de keten.
- Meegenomen uit dat werk: de precisieval bij lage frequenties. g = tan(π·fc/fs)
  wordt zó klein dat integratortoestanden in Q1.15 onder de radar verdwijnen;
  minimaal Q8.24 voor g en 48-bit toestanden. Plus multirate decimatie per
  frequentiegroep, met anti-aliasfilters die losstaan van de bandfilters, en
  delay-matching tussen de groepen.

### Phase vocoder / spectrale resynthese
FFT in, spectrum bewerken, IFFT uit. Time-stretch zonder toonhoogtewijziging,
spectrale morphing, freeze, spectrale filtering.

- **Routing: Teensy.** Twee redenen. De CMSIS-DSP FFT op de M7 is snel en
  volwassen; en deze techniek is *intrinsiek* blokgebaseerd, dus het
  latency-argument dat de FPGA elders wint, bestaat hier niet eens.

### LPC en formantsynthese (FOF)
LPC modelleert spraak als bron plus all-pole filter. FOF (CHANT) bouwt zang op
uit formantkorrels — hoe je een geloofwaardige stem maakt zonder sample.

- Levinson-Durbin is sequentieel en heeft deling: slechte FPGA-taak.
- **Routing: Teensy.** Relevant voor de freestyle-machine: een stemmodel in
  plaats van een samplebibliotheek houdt dat ding compact en batterijvriendelijk.

### Frequency shifting (Bode) en ringmodulatie
Ringmod levert som- en verschilfrequenties: inharmonisch, klokachtig.
Frequency shifting verschuift elke partiaal met hetzelfde aantal Hz in plaats
van hetzelfde interval — vernietigt de harmonische reeks.

- Vereist een Hilbert-transformator (twee allpassketens, 90° uit fase).
- **Routing: Teensy** voor de gewone toepassing. **FPGA** in de klassieke
  toepassing met terugkoppeling (de oneindige glijvlucht), want dat ís een
  feedbacklus.

---

## D. Resonantie en feedback

### Modale synthese
Een klank als som van gedempte resonatoren, elk met frequentie, amplitude en
demping. Metaal, glas, hout, vellen. Familie van physical modeling, maar de
implementatie is anders: geen waveguide, alleen een bank biquads die je met een
impuls aanslaat.

Hier moet het onderscheid uit §0 scherp:

- **Onafhankelijke resonatoren** (64 losse tomklanken) = een lus.
  **Routing: Teensy.**
- **Gekoppelde resonatoren die op elkaar reageren** — sympathische resonantie,
  een mesh, een gedistribueerd model — = honderden gekoppelde
  toestandsvariabelen met terugkoppeling. **Routing: FPGA**, en dit valt samen
  met wat er al over Wave Digital Filters is gezegd.
- Het instrumentidee dat hierbij hoort staat er al: high-Q SSI2140-filters als
  resonatoren, gekoppeld via een analoge sommeerbus (virtual earth met
  weerstanden), in plaats van getriggerde VCO's. Dat is de **analoge** variant
  van modale synthese, en waarschijnlijk het onderscheidendste van de drie.

### Karplus-Strong, uitgebreid
Al draaiend als FPGA-voice 0.3.0. De volgende stap die eerder is voorgesteld:
uitgang naar het analoge filter en de filteruitgang terug naar binnen als
exciter — één snaar, sample-voor-sample. Dat beantwoordt de enige vraag die
telt: klinkt dit anders dan software. Blokkade is nog steeds hardware: DAC,
ADC en de analoge filterborden zijn nog niet besteld.

### Feedbacknetwerken en niet-lineaire systemen
No-input mixing, zelfoscillerende filterbanken, chaotische oscillatoren, aan
elkaar gekoppelde oscillatoren die inregelen.

- **Routing: FPGA, en dit is het schoolvoorbeeld.** Eén sample vertraging in
  de lus verandert het gedrag hoorbaar. Dit is criterium 1 in zuivere vorm.

### Scanned synthesis (Verplank, Shaw, Mathews)
Een massa-veersysteem draait op lage snelheid en je leest de vorm ervan uit als
golftabel op audiorate. De golfvorm leeft, heeft traagheid, en je kunt hem
tijdens het spelen aanraken en verstoren.

- **Past op de bestaande bus.** De dCV over SPI op 1 kHz is precies de
  update-rate die zo'n model nodig heeft: model op de Teensy, tabel via de bus
  naar de oscillator. Weinig andere technieken gebruiken die 1 kHz zo
  natuurlijk.

---

## E. Algoritmisch en niet-klassiek

### Dynamische stochastische synthese (GENDYN, Xenakis)
Geen golfvorm en geen model: de breekpunten van de golf lopen zelf een random
walk binnen begrenzingen, per cyclus. Ruw en herkenbaar.

- Kosten: een LFSR en wat optellingen. **Routing: allebei.**

### Bitwise / logic-synthese (bytebeat)
Eén expressie met XOR, shift en modulo op een oplopende teller, direct als
sample. **Routing: allebei**, op de FPGA in pure logica.

### Neurale synthese (DDSP, RAVE)
Buiten bereik van zowel de Teensy als de Tang Primer 20K voor realtime audio.
Noteren, niet inplannen.

---

## F. Structuurgedreven synthese (state graph en verwanten)

Deze categorie ontbrak in revisie 2, en dat is een echt gat: er ligt een
uitgewerkt voorstel in [State-Graph Synthesis](state-graph-synthesis.md)
(2026-09-01) dat hier niet in verwerkt was.

Het onderscheid met A–E is principieel. Daar is de techniek een *klankmethode*
die in een verder vaste stemarchitectuur past. Hier is de **structuur zelf het
instrument** en is de klankmethode per knoop bijzaak: knopen bewaren energie,
verbindingen dragen die over (soms hysteretisch, dus met materiaalgeheugen),
exciters injecteren, pickups lezen ergens mee, en de topologie is een
speelparameter. Een noot start dan niet per se een stem — hij kan een
verbinding leggen tussen twee dingen die al klinken.

Daarom valt het ook buiten de routingtabel zoals die was: je routeert geen
oscillator, je routeert een netwerk. Hieronder alleen wat er voor §0 toe doet;
het model, de veiligheidseisen en de proeven staan in het eigen document.

### State-graph synthesis

- Dit is **criterium 2 in zuivere vorm**: honderden kleine *verschillende*
  dingen die op elkaar reageren, expliciet niet N identieke stemmen. Plus
  criterium 1 zodra er een analoge lus doorheen loopt. Het is daarmee het enige
  idee in dit document dat de FPGA wil om een andere reden dan rekenlast — en
  die reden overleeft de correctie van revisie 2 wél.
- Maar de rem is opnieuw **blok-RAM**, niet de multipliers. Elke
  delay-verbinding vraagt een eigen buffer; dat is precies waar granulair en
  wavetable op stukliepen. Een graaf van modale knopen en korte segmenten past;
  een graaf van lange delaylijnen niet. Dat moet uit profiling blijken vóór
  er een BRAM-layout wordt vastgelegd.
- **Routing: Teensy voor het prototype, FPGA pas na profiling.** Het eigen
  document concludeert hetzelfde, en om de goede reden: eerst bewijzen dat
  gedeelde toestand muzikaal werkt, dan pas fixed-point vastleggen.
- Wat er al staat: `ResonatorModule` (12 gestemde Karplus-Strong-resonatoren op
  één gedeelde excitatie) is een state graph met sterren-topologie — de knopen
  luisteren naar dezelfde exciter, maar niet naar elkaar. Juist die ontbrekende
  koppelingsterm is waar de techniek begint. Het is het kortste pad naar proef 1
  uit het state-graph-document.

### Resource-coupled synthesis

Meerdere stemmen putten uit één eindige, langzaam herstellende bron: luchtdruk,
snaarspanning, voedingsspanning. Een harde noot laat tijdelijk minder over voor
de volgende, en het herstel is hoorbaar.

- Kosten: één toestandsvariabele op controlrate. Bijna gratis.
- **Routing: Teensy, en het past op de bestaande bus.** Het reservoir is een
  CV-module die alle stemmen tegelijk moduleert; 1 kHz dCV is ruim genoeg voor
  de herstelcurve. In het huidige modulaire runtime is dit een nieuwe
  `CvModule` met een som-ingang — geen nieuwe audio-architectuur, geen nieuwe
  hardware.
- Dit is de **goedkoopste experimentele test van de hele lijst**: het beantwoordt
  de vraag of gedeelde fysieke toestand werkelijk anders speelt dan
  onafhankelijke stemmen, zonder dat de rest van de state graph er al hoeft te
  zijn.

### Excitable media

Cellen met rust-, actieve en refractaire toestand; een aanslag stuurt golven
over een raster die botsen, uitdoven of gesloten banen vormen.

- Een homogeen raster is per §0 **een lus met buurkoppeling**, en dus geen
  FPGA-argument — tot het raster duizenden cellen telt of in een analoge lus
  hangt. Dezelfde denkfout als in versie 1 bij waveshaping ligt hier klaar.
- **Routing: Teensy** tot enkele honderden cellen.

### Negotiated resonance

Stemmen bezitten geen eigen resonatoren maar concurreren om een gedeelde bank
modi; een nieuwe excitatie kan een bestaande mode aantrekken, verstemmen of
verdringen.

- De klank is een biquadbank en dus goedkoop; de **toewijzing** is sorteer- en
  matchlogica met vertakkingen — precies wat §0 bij de Teensy legt.
- **Routing: Teensy.**

### Observer-coupled synthesis

Pickups beïnvloeden door hun virtuele massa of impedantie wat zij waarnemen:
dichterbij luisteren dempt, of koppelt terug.

- Alleen interessant met meerdere gelijktijdige coherente uitgangen — dus met
  de AudioHub, en met het trackpad als pickuppositie (X/Y) en contactkracht (Z).
  Dat is dezelfde invoer die wave terrain nodig heeft, uit een andere hoek.
- **Routing: Teensy** voor het model. Het analoge equivalent — een echte pickup
  die de resonator belast — hoort bij de SSI2140-sommeerbus en is daar
  waarschijnlijk overtuigender dan als simulatie.

### Morphogenetic synthesis

De graaf groeit, snoeit of verstevigt verbindingen op grond van speelgeschiedenis.
Administratie, geen DSP. **Routing: Teensy**, en pas nadat handmatige
topologiemutaties muzikaal blijken te werken.

---

## Routingtabel (herzien)

| Techniek | Routing | Reden |
|---|---|---|
| Wavetable | Teensy | geheugenbandbreedte, geen FPGA-voordeel |
| Phase distortion / waveshaping | Teensy | veel stemmen = lus |
| Wavefolding | analoog | aliasing; audiopad blijft analoog |
| Wave terrain | Teensy | 2D-tabel; invoer van het trackpad |
| Granulair | Teensy + PSRAM | blok-RAM is de FPGA-bottleneck |
| Pulsar | Teensy | idem |
| Concatenatief | Teensy | zoeklogica, SD |
| Kanaalvocoder | **FPGA** | analoog audiopad + geen blokvertraging |
| Phase vocoder | Teensy | intrinsiek blokgebaseerd; CMSIS-FFT |
| LPC / FOF | Teensy | sequentiële recursie met deling |
| Frequency shifting | Teensy / FPGA | FPGA zodra er teruggekoppeld wordt |
| Modaal, onafhankelijk | Teensy | lus |
| Modaal, gekoppeld | **FPGA** | heterogeen + feedback |
| Modaal, analoog (SSI2140-bus) | **analoog** | onderscheidend, past bij de belofte |
| Feedbacknetwerken | **FPGA** | sub-sample latency, criterium 1 |
| Scanned synthesis | Teensy + bus | 1 kHz dCV is de modelrate |
| GENDYN / bytebeat | allebei | verwaarloosbaar |
| State graph + hysterese | Teensy → **FPGA** | criterium 2; blok-RAM is de rem, niet de rekenlast |
| Resource-coupled | Teensy + bus | één langzame toestandsvariabele op de dCV |
| Excitable media | Teensy | homogeen raster = lus met buurkoppeling |
| Negotiated resonance | Teensy | toewijzingslogica met vertakkingen |
| Observer-coupled | Teensy / analoog | vraagt meerdere coherente uitgangen |
| Morphogenetic | Teensy | administratie, geen DSP |

---

## Drie kandidaten die het meest opleveren

1. **Analoge modale synthese via de SSI2140-sommeerbus.** Sympathische
   resonantie met high-Q filters in plaats van getriggerde VCO's. Sluit aan bij
   het bestaande filterwerk, bij de analoog-audiobelofte, en het is het enige
   idee in deze lijst dat geen andere fabrikant zomaar kopieert.

2. **Scanned synthesis over de dCV-bus.** Weinig nieuwe hardware, gebruikt de
   1 kHz-bus zoals hij bedoeld is, en levert een speelgevoel dat geen enkele
   tabelmethode geeft.

3. **Wave terrain op het trackpad.** Geeft de trackpad-spinoff een reden van
   bestaan die verder gaat dan een extra controller.

Daarnaast, uit §F en in een andere categorie: **resource-coupled synthesis**.
Het staat niet in de top drie omdat het geen nieuwe klankmethode is, maar het
is wel het goedkoopste experiment in dit document — één gedeelde, langzaam
herstellende toestandsvariabele over de bestaande stemmen — en het toetst de
aanname waar de hele state graph op rust. Als gedeelde toestand niet anders
blijkt te spelen dan onafhankelijke stemmen, hoeft de rest van dat traject niet.

Wat hier bewust ontbreekt: een oordeel over wat *muzikaal* het interessantst
is. Dat volgt niet uit de rekenkosten.

---

## Herkomst

Geen teruggevonden brainstormchat — die is niet gevonden in de chatgeschiedenis
en staat niet in de repo (`doc/Plan.md` gaat over architectuur, niet over
klankmethoden). *Naschrift:* er staat wél een oudere chattabel
"Synthesetechnieken en hun Hardware-Match" onderin
[FPGA-physical-modelling.md](FPGA-physical-modelling.md) (rond regel 800). Die
is hier niet als bron gebruikt en dat blijft zo: hij routeert wavetable, FM en
additief naar de FPGA op precies het rekenkracht-argument dat in §0 is
weggestreept. Dit document is opnieuw opgeschreven en daarna consistent
gemaakt met wat er wél lag: de FPGA-vergelijking (routingcriteria,
kostenmodel, wavetable-oordeel), het vocoderwerk (precisie, multirate,
architectuurargument), de 808/CR-78-analyse en de trackpad-keuze.
