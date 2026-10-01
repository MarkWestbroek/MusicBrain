# State-Graph Synthesis

**Status:** onderzoeksvoorstel; compact Material Bridge-prototype gebouwd (2026-09-30), stemming en demo hersteld (2026-10-01). De actuele stand, meetwaarden en vervolgstappen staan in [Material Bridge: overdracht en vervolg](material-bridge-handover.md); dit document bewaart het model en de ontwerpbesluiten.

**Datum:** 2026-09-01

**Doel:** onderzoeken of een live herconfigureerbaar netwerk van energie,
resonantie en materiaalgeheugen een herkenbaar nieuwe klasse bespeelbare
digitale instrumenten kan opleveren.

## Samenvatting

State-Graph Synthesis begint niet met een oscillator-filter-amplifierketen en
ook niet met een vooraf vastgelegd fysiek object. Het instrument is een graaf:

- **knopen** bewaren energie en toestand;
- **verbindingen** dragen energie over, vertragen, dempen of vervormen;
- **exciters** injecteren energie;
- **pickups** lezen het netwerk op één of meer plaatsen;
- **hysterese** laat materiaalgedrag afhangen van zijn voorgeschiedenis;
- **topologiemutaties** verbinden, splitsen of verplaatsen onderdelen tijdens
  het spelen.

De voorlopige naam is bewust beschrijvend en geen nieuwheidsclaim. Digitale
waveguides, modale synthese, wave digital filters, mass-springnetwerken,
cellulaire automaten en dynamische systemen leveren belangrijke prior art.
De onderzoeksvraag is smaller:

> Levert de combinatie van energiegedragen interactie, live veranderlijke
> topologie, hysteretisch materiaal en meerdere exciters/pickups een eigen,
> leerbaar instrumentaal gedrag op?

## Van signaalketen naar bespeelbaar materiaal

Een klassieke subtractieve stem heeft hoofdzakelijk een voorwaartse route:

```mermaid
flowchart LR
    O[oscillator] --> F[filter]
    F --> A[amplifier]
    E[envelope] --> F
    E --> A
    A --> Out[audio]
```

Een state graph heeft geen verplichte bron of vaste uitgangsroute:

```mermaid
flowchart LR
    X1[exciter: aanslag] --> A((A: snaarenergie))
    X2[exciter: strijken] --> C((C: wrijving))
    A <-->|elastisch| B((B: resonator))
    B <-->|vertraagd| C
    C <-->|hysteretisch| D((D: membraan))
    D <-->|feedback| A
    B --> P1[pickup links]
    C --> P2[pickup rechts]
```

Een noot start dan niet noodzakelijk een nieuwe, zelfstandige stem. Hij kan
energie toevoegen aan een netwerk dat nog beweegt en dat door eerdere noten is
veranderd. Polyfonie ontstaat uit meerdere gelijktijdige excitatieplaatsen en
niet uitsluitend uit het dupliceren van een voice.

## Minimaal formeel model

Laat $G(t) = (V, E(t))$ de graaf zijn. Iedere knoop $i$ heeft een toestand
$x_i$, opgeslagen energie $H_i(x_i)$ en eventueel een langzame
materiaaltoestand $h_i$. Een verbinding $e=(i,j)$ berekent een energiestroom
uit het lokale verschil en haar eigen toestand:

$$
\dot{x}_i = f_i(x_i, h_i, u_i)
            + \sum_{e \rightarrow i} \phi_e
            - \sum_{e \leftarrow i} \phi_e
$$

$$
\dot{h}_i = g_i(x_i, h_i, T_i)
$$

Daarin zijn:

- $u_i$ een externe excitatie;
- $\phi_e$ de energiestroom over verbinding $e$;
- $h_i$ geheugen zoals spanning, magnetisatie, slijtage of temperatuur;
- $T_i$ een langzame context zoals tijd of thermische toestand.

De totale opgeslagen energie is:

$$
H = \sum_i H_i + \sum_e H_e
$$

Voor een passief netwerk moet per sample of tijdstap gelden:

$$
\Delta H \leq E_{\mathrm{in}} - E_{\mathrm{dissipatie}}
$$

Dat is geen volledige implementatiemethode, maar wel een belangrijke
ontwerptest. Een verbinding die zonder expliciete exciter blijvend energie
toevoegt, is actief en moet als feedback/gain-element worden begrensd.

## Wat hysterese hier betekent

Een geheugenloze component geeft voor dezelfde invoer steeds dezelfde uitvoer:

$$
y(t) = f(x(t))
$$

Een hysteretische component reageert ook op interne geschiedenis:

$$
y(t) = f(x(t), h(t))
$$

Dezelfde kracht, spanning of vervorming kan daardoor twee verschillende
uitkomsten hebben, afhankelijk van de richting en eerdere belasting.

### Eenvoudigste digitale vorm: twee drempels

```text
uit -- invoer > 0,60 --> aan
aan -- invoer < 0,40 --> uit

tussen 0,40 en 0,60 blijft de vorige toestand behouden
```

Dit is bruikbaar voor contact, stick-slip en het vast- of losslaan van een
koppeling. Het is nog geen rijk materiaalmodel.

### Continue materiaaltoestand

Een eenvoudige virtuele `stress` kan bij belasting oplopen en langzaam
herstellen:

$$
h[n+1] = \operatorname{clamp}
\left(h[n] + \alpha |x[n]| - \beta h[n], 0, 1\right)
$$

Die toestand kan vervolgens stijfheid, demping en vervorming beïnvloeden:

$$
k_{\mathrm{eff}} = k_0 (1 + a h), \qquad
d_{\mathrm{eff}} = d_0 (1 + b h)
$$

Hiermee klinkt een tweede harde aanslag anders wanneer het materiaal nog niet
is hersteld. Belangrijk is dat `stress` niet simpelweg een willekeurige
modulator is: zij wordt causaal opgebouwd door de energie in het netwerk.

### Mogelijke hysteretische verbindingen

| Type | Geheugen | Muzikaal gedrag |
|---|---|---|
| stick-slip | vast/glijdend en vorige snelheid | strijkstok, piep, schrapen |
| magnetisch | eerdere veldsterkte/magnetisatie | asymmetrische verzadiging, remanentie |
| elastisch | eerdere rek en herstel | tijdelijke ontstemming of stijfheid |
| thermisch | gedissipeerd vermogen | langzaam veranderende drive/demping |
| contact | open/dicht plus contactdruk | klik, chatter, niet-synchrone keying |
| vermoeiing | cumulatieve belasting | klank wordt tijdelijk doffer of instabieler |

`Wear` moet voor een muziekinstrument meestal omkeerbaar, begrensd en
reproduceerbaar zijn. Een aparte destructieve modus kan permanente verandering
simuleren, maar mag geen onbedoelde presetvernietiging opleveren.

## Bouwblokken

### Knopen

Een eerste bibliotheek hoeft klein te zijn:

| Knoop | Toestand | Voorbeeld |
|---|---|---|
| oscillator/resonator | positie en snelheid, of quadratuurpaar | snaar, membraan, LC-resonator |
| delay junction | samples en voortplantingsrichting | buis, snaarsegment, ruimte |
| integrator | lading, druk of impuls | condensator, luchtkamer, massa |
| modal bank | amplitudes/fasen van enkele modi | plaat, body, klankkast |
| reservoir | energie plus langzaam herstel | balg, voeding, spanning |
| excitable node | rust, actief en refractair | klikkend of pulserend materiaal |

### Verbindingen

- lineaire veer, weerstand of conductantie;
- dispersieve of frequentieafhankelijke koppeling;
- fractional delay;
- diode-/softclipverbinding;
- eenrichtingsklep;
- stick-slipcontact;
- magnetische of elastische hysterese;
- schakelbare en soepel in-/uitfadebare verbinding;
- actieve feedbackverbinding met expliciet energiebudget.

### Exciters

- impuls of hamer met snelheid en hardheid;
- noise burst;
- periodieke druk, strijken of blazen;
- externe audio;
- gate/CV die een verbinding beweegt in plaats van audio injecteert;
- terugkoppeling van een echte analoge sensor of voice-tile.

### Pickups

Een pickup is een waarnemer en geen eigenschap van de bron. Hij kan positie,
snelheid, druk, energiestroom of een gewogen combinatie uitlezen. Meerdere
pickups uit hetzelfde netwerk leveren coherent meerkanaals geluid. Het live
verplaatsen van een pickup verandert de waarneming zonder het materiaal zelf
te veranderen.

## Topologie als speelparameter

Een abrupte graafwijziging kan klikken of numerieke energie creëren. Live
mutaties moeten daarom een expliciete overgang hebben:

```mermaid
stateDiagram-v2
    [*] --> Afwezig
    Afwezig --> Inschakelen: verbinding toevoegen
    Inschakelen --> Actief: gain 0 naar doelwaarde
    Actief --> Omschakelen: type of eindpunt wijzigen
    Omschakelen --> Actief: toestand overdragen
    Actief --> Uitschakelen: gain naar 0
    Uitschakelen --> Afwezig: toestand vrijgeven
```

Mogelijke mutaties zijn:

- twee resonatoren koppelen of losmaken;
- een knoop splitsen en de bestaande energie verdelen;
- twee knopen samenvoegen met behoud van impuls of lading;
- een verbinding langs een snaar of plaat verplaatsen;
- een pickup verplaatsen;
- een lineaire koppeling door belasting geleidelijk hysteretisch maken.

Bij splitsen en samenvoegen moet worden vastgelegd welke grootheid behouden
blijft. Zonder zo'n regel is een topologiemutatie alleen een crossfade tussen
algoritmen en niet werkelijk onderdeel van het materiaalmodel.

## Bespeling

De meest interessante controls beschrijven handelingen:

| Spelhandeling | Graafactie |
|---|---|
| toets/noot | energie op een gekozen knoop injecteren |
| velocity | impuls, contacthardheid of initiële druk |
| poly pressure | exciterdruk of lokale demping |
| pitchbend | spanning of geometrie wijzigen |
| modwheel | pickup bewegen of verbinding openen |
| trackpadpositie | exciter- en pickupplaats in twee dimensies |
| trackpaddruk | contactkracht/stick-slipregime |
| pedaal | knopen aan een gedeelde resonator koppelen |
| sequencer | periodiek topologie bouwen en afbreken |

Noten hoeven niet één-op-één aan voices te zijn gekoppeld. Een akkoord kan drie
plaatsen in hetzelfde membraan aanslaan; een volgende noot kan een brug tussen
twee nog klinkende gebieden maken. Dat is een belangrijk onderscheid met een
gebruikelijke polyfone physical-modelingstem.

## Editorconcept

De editor toont een werkvlak en geen verborgen modulatielijst:

```text
+---------------- MATERIAL CANVAS ----------------+  +-- INSPECTOR --------+
|                                                  |  | selected: edge E4   |
| [hammer] -> (string A) === E4 === (plate B)      |  | type: stick-slip    |
|                |                    |             |  | coupling: 0.63      |
|             [pickup L]          (reservoir)      |  | stress: 0.28        |
|                |                    |             |  | recovery: 1.8 s     |
|             audio L             [pickup R]       |  | passive: yes        |
|                                                  |  | energy: 0.014 J*    |
+--------------------------------------------------+  +---------------------+
| energy | topology | material memory | pickups | scope | safe edit | perform |
+--------------------------------------------------------------------------+

* genormaliseerde modeleenergie, niet noodzakelijk fysieke joules
```

Noodzakelijke editorfuncties:

- live energieweergave per knoop en verbinding;
- zichtbare richting van energiestroom;
- inspectie en reset van hysteretische toestand;
- `freeze`, `release` en veilige `clear energy`;
- vergelijking tussen twee materiaaltoestanden;
- opname van een gebaar als topologie-automatisering;
- waarschuwing voor actieve lussen en geschatte stabiliteitsmarge;
- begrensde performancemacro's bovenop de technische parameters.

De complete graaf past niet in het bestaande vaste `patch.synth.v1`-blobje.
Gebruik een aparte, versieerbare `MaterialDefinition` die offline of bij laden
naar een begrensd runtimeprogramma wordt gecompileerd. Realtimebesturing blijft
via de bestaande CV-, gate- en segmentcommando's lopen.

## Voorlopige `MaterialDefinition`

```json
{
  "schemaVersion": 1,
  "sampleRate": 48000,
  "energyLimit": 1.0,
  "nodes": [
    {"id": "stringA", "type": "modal", "modes": 8, "decay": 0.992},
    {"id": "body", "type": "resonator", "frequencyHz": 184.0}
  ],
  "edges": [
    {
      "id": "bridge",
      "from": "stringA",
      "to": "body",
      "type": "elasticHysteresis",
      "coupling": 0.4,
      "recoveryMs": 1200,
      "passive": true
    }
  ],
  "exciters": [
    {"id": "hammer", "node": "stringA", "type": "impulse"}
  ],
  "pickups": [
    {"id": "left", "node": "stringA", "quantity": "velocity"},
    {"id": "right", "node": "body", "quantity": "position"}
  ]
}
```

Getallen zijn illustratief. Het uiteindelijke schema moet eenheden,
parameterbereiken, toestandsoverdracht bij mutaties en een resourcebudget
expliciet vastleggen.

## Uitvoering op MusicBrain

```mermaid
flowchart LR
    Editor[editor: MaterialDefinition] --> Compiler[graph compiler en validator]
    Compiler --> Program[begrensd runtimeprogramma]
    Brain[MusicBrain router] -->|CV / gate / segment| Control[control interpreter]
    Program --> FPGA[FPGA audio graph]
    Control --> FPGA
    FPGA --> I2S[I2S audio]
    I2S --> Hub[AudioHub / DAC]
    FPGA --> Telemetry[energie- en statusmeters]
    Telemetry --> Editor
```

### FPGA

Geschikt voor:

- veel gelijktijdige knopen en verbindingen;
- vaste sampleplanning zonder jitter;
- korte delaylijnen in BRAM;
- parallelle of time-multiplexed multiply-accumulatebewerkingen;
- saturerende fixed-pointrekenkunde;
- energie- en overflowmeters.

De bestaande FPGA-synth-ADR laat al zien hoe zo'n kaart een gewone SPI-slave
kan blijven. State-Graph Synthesis verandert die systeembeslissing niet.

### Teensy

Geschikt voor:

- MIDI/CV-mapping en performancegebaren;
- langzame materiaaltoestand;
- topologiemutaties voorbereiden en valideren;
- presets, logging en editorcommunicatie;
- een kleine volledig softwarematige referentie-engine.

Voor het eerste prototype is Teensy-only waarschijnlijk sneller. Een engine
gaat pas naar FPGA als profiling aantoont welke rekeneenheden, BRAM-layout en
fixed-pointbereiken werkelijk nodig zijn.

## Numerieke veiligheid

Een dynamische feedbackgraaf kan zeer snel onstabiel worden. Minimumeisen:

- ieder knoop- en verbindingstype heeft bekende energie- of gain-grenzen;
- passieve elementen mogen samen geen energie genereren;
- actieve verbindingen declareren maximale gain en energietoevoer;
- topologiemutaties gebruiken crossfades of toestandsoverdracht;
- alle accumulators gebruiken saturatie, geen wraparound;
- denormals, NaN en oneindigheid kunnen de audioloop niet besmetten;
- een snelle limiter is alleen de laatste bescherming, niet het stabiliteitsmodel;
- `clear energy` en watchdogmute werken zonder editor;
- compile-timevalidatie weigert algebraïsche lussen die niet oplosbaar zijn.

Voor fixed point moeten per knoop headroom en worst-case som worden bewezen.
Een globale schaalfactor alleen is waarschijnlijk te grof voor grafen met
sterk verschillende lokale energieniveaus.

## Eerste prototype

### Begrenzing

- 8 tot 16 knopen;
- maximaal 24 verbindingen;
- twee exciters en twee pickups;
- resonator, delay, dissipatieve koppeling en één hysteretisch contact;
- één veilige mutatie: verbinding toevoegen/verwijderen;
- 48 kHz stereo;
- software-engine vóór FPGA-port;
- geen automatische groei of machine learning.

### Drie proeven

1. **Gedeeld membraan:** drie toetsen slaan verschillende punten aan; noten
   beïnvloeden aantoonbaar elkaars decay en spectrum.
2. **Vermoeide brug:** herhaalde harde aanslagen veranderen tijdelijk koppeling
   en demping; herstel is hoorbaar en meetbaar.
3. **Bouwbaar akkoord:** iedere nieuwe noot voegt een verbinding toe; loslaten
   verwijdert haar gecontroleerd zonder klik of energietoename.

### Go/no-go

Ga alleen door wanneer:

- spelers het effect van gedeelde toestand leren voorspellen en inzetten;
- hysterese in een blinde A/B-test meer oplevert dan een gewone envelope/LFO;
- topology edits klikvrij en begrensd blijven;
- CPU-belasting en geheugen lineair en voorspelbaar schalen;
- dezelfde patch deterministisch kan worden opgeslagen en teruggeroepen;
- de engine klanken en speelgedrag oplevert die niet eenvoudiger met bestaande
  subtractieve, FM- of standaard physical-modelingblokken ontstaan.

## Verwante nieuwe onderzoeksrichtingen

Deze ideeën zijn geen bewezen nieuwe synthesevormen. Ze zijn kandidaten die
dezelfde infrastructuur kunnen benutten en tegen bestaande technieken moeten
worden getoetst.

### 1. Resource-Coupled Synthesis

Veel stemmen delen een eindige virtuele bron: lucht, snaarspanning, elektrische
lading, warmte of motorvermogen. Een harde noot laat tijdelijk minder resource
voor andere noten over; de bron herstelt geleidelijk.

```text
                 +--> voice A
[drukreservoir] -+--> voice B
                 +--> voice C
        ^
        +--- langzaam herstel
```

Dit is sterker dan sidechaincompressie wanneer de resource de toonhoogte,
aanval, koppeling en vervorming causaal beïnvloedt. Het kan zelfstandig worden
onderzocht, maar past ook als reservoirknoop in een state graph.

### 2. Excitable-Media Synthesis

Een raster of graaf bestaat uit cellen met rust-, actieve en refractaire
toestand. Een aanslag start golven die botsen, uitdoven, rond obstakels lopen of
gesloten banen vormen. Pickups luisteren naar lokale activiteit.

Het muzikale materiaal is dan geen periodieke oscillator maar voortplantende
gebeurtenis. Dit raakt cellulaire automaten en reaction-diffusiononderzoek;
nieuwheid zou vooral zitten in energiebegrenzing, audio-rate koppeling en een
bespeelbare interface.

### 3. Negotiated Resonance

Stemmen bezitten geen vaste resonatoren, maar concurreren om een gedeelde bank
modi. Een nieuwe excitatie kan een bestaande mode aantrekken, verstemmen,
splitsen of verdringen. Akkoorden onderhandelen daardoor over hun gezamenlijke
spectrum.

Dit kan interessante harmonie-afhankelijke klank opleveren zonder akkoorden
expliciet te herkennen. Het risico is onvoorspelbare intonatie; behoud van een
duidelijke tonale ankerlaag is waarschijnlijk nodig.

### 4. Observer-Coupled Synthesis

Het geluidsveld bestaat onafhankelijk, maar pickups beïnvloeden door hun
virtuele massa, impedantie of feedback ook wat zij waarnemen. Luisteren wordt
dus een fysieke handeling. Een pickup dichter bij een knoop plaatsen kan het
materiaal lokaal dempen of juist terugkoppelen.

Dit principe is bekend uit echte meet- en versterkersystemen, maar zelden de
centrale speelmetafoor van een synthesizer. Meerdere beweegbare pickups en
coherente meerkanaalsuitgangen passen goed bij trackpad en AudioHub.

### 5. Morphogenetic Synthesis

De graaf groeit, snoeit of verstevigt verbindingen door speelgeschiedenis.
Vaak gebruikte paden worden sterker; ongebruikte paden herstellen of verdwijnen.
In tegenstelling tot een generatief AI-model blijft iedere verandering lokaal,
causaal en inspecteerbaar.

Dit is de meest experimentele richting. Begin pas nadat handmatige
topologiemutaties muzikaal werken. Anders automatiseert het systeem gedrag dat
nog niet goed begrepen of bestuurbaar is.

## Prioriteit

| Richting | Eigen speelgedrag | Technisch risico | Eerste prioriteit |
|---|---:|---:|---:|
| State-Graph + hysterese | hoog | hoog maar begrensbaar | 1 |
| Resource-Coupled | hoog | laag/middel | 2 |
| Observer-Coupled | middel/hoog | middel | 3 |
| Excitable Media | middel/hoog | middel/hoog | 4 |
| Negotiated Resonance | onzeker maar interessant | hoog | 5 |
| Morphogenetic | potentieel hoog | zeer hoog | pas later |

Resource-Coupled Synthesis is de beste tweede proef: klein genoeg om snel te
bouwen en direct bruikbaar om te testen of gedeelde fysieke toestand werkelijk
anders speelt dan onafhankelijke voices. Morphogenetic Synthesis is pas zinvol
wanneer de onderliggende handmatige state graph stabiel en muzikaal begrijpelijk
is.

## Relatie tot bestaande MusicBrain-documenten

- [Instrument Lab](musicbrain-instrument-lab.md) levert meetinfrastructuur,
  AudioHub en mogelijke analoge referentietiles.
- [ADR 0013](../adr/0013-fpga-synth-instrument.md) beschrijft de FPGA-kaart als
  gewone SPI-slave met onafhankelijk I2S-audio.
- [patch.synth.v1](../protocols/schemas/patch.synth.v1.md) blijft het compacte
  bestaande voicecontract; de state graph krijgt een afzonderlijke definitie.
- [Synthesetechnieken buiten de vier bekende](synthesetechnieken-verkenning.md)
  §F plaatst dit voorstel naast de overige technieken en toetst het aan de
  routingcriteria (§0 daar). Kortste samenvatting: criterium 2 geldt hier
  werkelijk, maar blok-RAM is de bottleneck, dus Teensy-prototype eerst.
- `firmware/app-modular-brain/src/ResonatorModule.h` is de dichtstbijzijnde
  bestaande code: 12 gestemde resonatoren op één gedeelde excitatie. Het is een
  sterren-topologie zonder onderlinge koppeling en zonder hysterese — precies
  de twee dingen die dit voorstel toevoegt.

## Material Bridge: eerste uitvoerbare proef (2026-09-30)

De review in [Synthesetechnieken](synthesetechnieken-verkenning.md), vooral
de ontbrekende onderlinge resonatorkoppeling in sectie F, is opgepakt als
**Material Bridge** (`tp_mmb_material_bridge`). Geen stem/zang, geen FPGA
en geen nieuwe graafeditor: een kleine, vaste state graph binnen de bestaande
modulearchitectuur. De concrete onderzoeksvraag is of een tweede aanslag
anders reageert doordat hetzelfde materiaal nog belast is.

Dit is een bewuste versmalling van het oorspronkelijke prototype: **vier
quadratuurresonatoren, drie verbindingen, twee aanslagpunten, twee pickups en
een brug met geheugen**. Geen delaylijnen, mesh, vrij bewerkbare topologie of
akkoordherkenning. Het is een eigen experimenteel model, geen reconstructie
van een bestaand fysiek instrument en geen claim op een nieuwe synthesevorm.

```mermaid
flowchart LR
    A[Hit A / audio] --> R0((0))
    R0 <--> R1((1))
    R1 <-->|brug met geheugen| R2((2))
    R2 <--> R3((3))
    B[Hit B] --> R3
    R0 --> L[Pickup L]
    R1 --> L
    R2 --> R[Pickup R]
    R3 --> R
    E[Totale modeleenergie] --> S[Stress / herstel]
    S --> C[Brugsterkte en demping]
```

### Model en veiligheid

Een resonator bewaart een complex quadratuurpaar. Zijn frequentierotatie
bewaart de norm; een exponentiele dempingsfactor maakt de vrije uitklank
passief. Een verbinding gebruikt de transformatie
`z_a' = c*z_a + i*s*z_b`, `z_b' = c*z_b + i*s*z_a`, met
`c=(1-t*t)/(1+t*t)` en `s=2*t/(1+t*t)`. Deze is unitair: de som van beide
kwadratische normen blijft behouden. Ook een gewijzigde koppeling voegt dus
geen energie toe. De hoek `t` schaalt sinds 2026-10-01 met de grondtoon
(`0,1 * Couple * hoek van de grondtoon`), zodat de modusverhoudingen vastliggen
en V/Oct het hele spectrum transponeert; een vaste hoek per sample gaf een
splitsing groter dan de grondtoon zelf. Samplegewijs uitvoeren voorkomt een audioblokvertraging
**binnen** het netwerk; externe kabels behouden de normale platformlatency.

`Stress` volgt de begrensde totale energie met 25 ms aanval en instelbaar
herstel. Boven 0,60 verzwakt de middelste brug; pas onder 0,25 herstelt zij.
Dat zijn echte afzonderlijke omschakeldrempels, niet alleen een envelope.
De brugovergang wordt over circa 10 ms gladgestreken. `Memory` mengt de
brugverzwakking in; dat herverdeelt energie maar dissipeert niets. `Fatigue`
(sinds 2026-10-01 een aparte control) verhoogt de demping bij belasting. Bij
`Memory=0` en `Fatigue=0` heeft de stressvolger geen invloed op de klank: een
bruikbare A/B-referentie.

De som van de vier resonatornormen wordt na excitatie tot 4 begrensd.
Dit is een **genormaliseerde modeleenergie**, niet joules. Het is een
expliciete excitatiebegrenzing, geen uitgangslimiter die een instabiele lus
moet verbergen. De passieve pickups lezen alleen mee. Output is maximaal
circa 0,9 bij `Level=1`; ongeldige audio/CV/controls worden begrensd of
vervangen, zeer kleine resonatortoestanden worden nul. Reset wist energie
en materiaalgeheugen, zonder een aangehouden gate opnieuw aan te slaan.

### Bediening en patch

In de editor: **Solo > Material Bridge (materiaalgeheugen)**. De seed voegt
een rack toe met MIDI-IN, Material Bridge en OUT. Pitch, gate en velocity
zijn bekabeld; beide pickups gaan afzonderlijk naar links/rechts. Speel
korte, gescheiden noten en vergelijk zachte aanslagen met een reeks harde.
Alle noten stemmen hetzelfde materiaal opnieuw; dit zijn geen vier
onafhankelijke polyfone stemmen.

| Control | Bereik / default | Betekenis |
|---|---|---|
| Pitch | -36..36 semi / 0 | Grondtoon rond C4, bovenop V/Oct |
| Spread | 0..1 / 0,35 | Van bijna gelijke naar inharmonisch gespreide modi |
| Couple | 0..1 / 0,5 | Energie-uitwisseling tussen de resonatoren |
| Decay | 0,05..8 s / 2 | Nominale -60 dB-tijd zonder extra geheugendemping |
| Memory | 0..1 / 0,7 | Verzwakking van de middelste brug bij gebroken contact (geen extra demping) |
| Fatigue | 0..1 / 0,5 | Stressafhankelijke extra demping (kortere uitklank onder belasting) |
| Recover | 0,1..10 s / 2 | Tijdconstante waarmee stress terugloopt |
| Pickup | 0..1 / 0,25 | Beide pickups bewegen van buiten naar binnen |
| Level | 0..1 / 0,8 | Uitgangsniveau |

Ingangen: `in` audio op resonator 0; `gate`/`gate_b` slaan resonator 0/3
aan op een stijgende flank; `vel` is 0..1 en standaard 1 zonder kabel;
`voct` is 1 V/oct rond C4; `reset` wist op een stijgende flank en onderdrukt
nieuwe excitatie zolang hij hoog is. Uitgangen: `out_l`, `out_r`, `stress`
(0..1 CV). Gebruik voor Teensy-gates pulsen die minstens een audioblok
overbruggen, bijvoorbeeld 5 ms. De browser kan gates samplegewijs verwerken;
de Teensy-wrapper bemonstert CV/gates per blok van 128 samples.

De soloseed kiest iets expressievere standen: Spread 0,12, Couple 0,65,
Decay 4 s, Memory 0,85. Proeven: Couple=0 isoleert de aanslagpunten;
Memory=0 versus 0,85 vergelijkt de uitklank; een klok naar Hit B laat twee
exciters hetzelfde materiaal bespelen; audio naar In maakt er een resonator
voor extern geluid van. Reset is een onmiddellijke wisactie en kan klikken.

### Implementatie en verificatie

- Gedeelde header-only DSP: `firmware/lib/mmb-dsp/mmb_dsp/material_bridge.h`.
  De kernel is **156 bytes** na de CV-uitbreiding, zonder heap of samplebuffers.
- Teensy: `MaterialBridgeModule.h`, geregistreerd in `RegisterAllModules.h`.
  AudioStream met mono-in/stereo-uit; parameteroverdracht aan het begin van
  het audioblok, stressuitlezing via de bestaande CV-bridge. Retired streams
  blijven bestaan en worden stilgezet, conform de AudioStream-lifetime.
- Browser: `tools/mmb-wasm/materialbridge_wasm.cc`, ABI op 44,1 kHz/32,
  gebouwd als `editor/public/wasm/tp_mmb_material_bridge.wasm` (66.007 bytes).
  Geen afzonderlijke JS-benadering. Dezelfde kern draait op beide platforms,
  maar CV-timing en int16-audio op Teensy zijn niet bit-identiek aan WebAudio.
- Zeven wasm-tests: contract, stilte, overdracht, Hit B/velocity nul,
  stress/herstel/reset, causale klankverandering en ongeldige/extreme invoer.
  Samen met bestaande wasm- en firmwarecontracttests: **286 tests geslaagd**.
- C++-check op 32/44,1/48/96 kHz: vrije energie daalt ook bij wisselende
  frequenties en koppelingen; hysterese/herstel, energielimiet en reset
  slagen. Uitvoerbaar via `bash tools/mmb-wasm/bitcheck/check.sh materialbridge`.
- `npm --prefix editor run typecheck` en `npm --prefix editor run build`
  slagen. De volledige PlatformIO-build voor Teensy 4.1 slaagt; **niet
  geflasht**. Bestaande compiler- en bundelgroottewaarschuwingen blijven staan.
- Solopatch en paneel in de browser aangemaakt naast de bestaande FOF-patch.
  Dit vervangt geen luisterproef of meting van realtime audio op hardware.

### Open grenzen

1. Luistertest: is materiaalgeheugen herkenbaar en bespeelbaar, ook na
   luidheidsmatching met Memory=0? Sneller uitdoven alleen bewijst dat niet.
2. Teensy flashen en CPU/interruptbudget meten in een echte patch. Klein
   geheugen en een geslaagde build bewijzen geen realtime CPU-marge.
3. Koppeling verschuift de gezamenlijke modi; sinds 2026-10-01 schaalt de
   koppeling met de grondtoon, zodat V/Oct zuiver transponeert. De sterkste
   modus houdt per Couple-stand een vaste offset (tot ~50 cent); zie de
   moduskaart in de handover.
4. Couple en Pickup (knop plus CV) en het hysteretische brugcontact hebben
  smoothing. Andere knop- en toonhoogtewissels zijn energiebegrensd maar
  nog niet allemaal klikvrij; er is bewust geen impliciet portamento.
5. Geen audio-rate externe CV-pariteit, geen observer-loading, geen
   topologiemutaties, geen gedeeld polyfoon MIDI-spectrum. Die blijven
   afzonderlijke proeven uit het oorspronkelijke voorstel.

## Aanbevolen vervolg voor Material Bridge

**Vastgelegd: 2026-09-30. Bijgewerkt: demonstratie, A/B-renderer en CV-smoothing
zijn uitgevoerd. Blinde luisterbeoordeling, stemming en hardwaremetingen blijven open.**

De aanbeveling is om Material Bridge eerst beter bespeelbaar en beoordeelbaar
te maken, niet om direct meer resonatoren of een vrij bewerkbare graaf toe
te voegen. Technisch is aangetoond dat energie wordt uitgewisseld en dat
materiaalgeheugen de uitklank verandert. Nog niet aangetoond is dat een
muzikant dit gedrag leert herkennen en bewust in zijn spel kan gebruiken.

**De eerste bouwstappen zijn beschikbaar: demonstratiepatch, A/B-takes en
twee CV-ingangen met smoothing.** Hieronder staan de oorspronkelijke
toetscriteria; de uitvoering en meetresultaten staan erna. Stemming en
hardwaremetingen volgen pas na de muzikale beoordeling.

### Stap 1: demonstratiepatch en eerlijke luistervergelijking

Maak een reproduceerbare, zelfspelende patch met twee verschillende ritmes
op Hit A en Hit B. Laat zachte en harde aanslagen elkaar afwisselen, zodat
een volgende aanslag aankomt terwijl het materiaal nog belast is. Begin met
een vaste toonhoogte en vaste overige controls: anders zijn de oorzaken van
een klankverandering moeilijk uit elkaar te houden.

De huidige module heeft **een gedeelde velocity-ingang**. Stel die voor elke
aanslag in en laat haar tijdens de gateflank stabiel staan. Gelijktijdige
aanslagen krijgen dezelfde velocity; deze demonstratie vereist dus geen
nieuwe velocity-ingang per exciter. Gebruik gates van minstens 5 ms zodat
dezelfde demonstratie ook binnen de huidige Teensy-blokafhandeling past.

Lever twee versies van dezelfde uitvoering op: Memory=0 als referentie en
Memory=0,85 als materiaalgeheugenproef. Reset beide voor het begin en gebruik
identieke timing, velocities en overige instellingen. Match de gemiddelde
luidheid met een vaste gain per opname; normaliseer niet iedere aanslag
afzonderlijk, want dan verdwijnt juist een deel van de te onderzoeken dynamiek.

Beoordeel niet alleen of de versie met geheugen korter of zachter klinkt.
De vraag is of de eerdere belasting herkenbaar doorwerkt in een volgende
aanslag, de resonantieverdeling en de verhouding tussen de pickups. Vergelijk
zo nodig ook met een referentie zonder geheugen maar met kortere Decay: als
dat hetzelfde muzikale resultaat geeft, is de complexere brug nog niet
overtuigend gerechtvaardigd.

**Toetscriteria:** de patch start zonder handmatige noten; beide exciters zijn
afzonderlijk hoorbaar te maken; een reset en herhaling leveren hetzelfde
gedrag op; Stress loopt op en herstelt. Leg daarnaast de resultaten van een
blinde, luidheidsgematchte A/B-luisterproef vast. Hoorbare verschillen zijn
geen automatische go: noteer ook of de speler ze kan voorspellen en inzetten.
Bij een onduidelijk resultaat eerst het model of de demonstratie bijstellen,
niet het netwerk vergroten.

### Stap 2: Couple en Pickup als expressieve CV-besturing

Voeg **`coupling_cv` en `pickup_cv`** toe aan de gedeelde module-interface,
beide wrappers, het firmwarecontract en het editorpaneel. Daarmee kunnen
bijvoorbeeld een modwheel, LFO of trackpad de energie-uitwisseling en
luisterpositie bewegen. De pickups blijven passieve waarnemers: dit is nog
geen observer-coupled model waarbij luisteren het materiaal belast.

Voorgestelde semantiek: de CV telt op bij de knopstand en de effectieve
waarde wordt begrensd op 0..1. Een ontbrekende kabel levert nul modulatie;
loskoppelen brengt de knopstand terug. Een negatieve CV kan dus ook omlaag
moduleren. Deze afspraak moet op Teensy en in de browser hetzelfde zijn en
expliciet worden getest; de bestaande presets moeten zonder nieuwe kabels
ongewijzigd bruikbaar blijven.

Voer parameter-smoothing uit in de **gedeelde DSP-kern**, op basis van tijd
en samplerate, niet met een verschillend tempo per wrapperblok. Begin met
Couple en Pickup en neem de overige continue controls mee waar abrupte
wijzigingen ongewenste tikken veroorzaken. Gateflanken blijven scherp;
Reset blijft een bewuste onmiddellijke wisactie. Maak toonhoogte niet
stilzwijgend traag: pitch-smoothing en eventueel portamento vragen een
afzonderlijke muzikale afweging.

**Toetscriteria:** CV nul, negatieve/positieve CV, uitersten, ongeldige waarden
en loskoppelen zijn getest. Een stapverandering in Couple/Pickup verloopt
vloeiend op verschillende samplerates en bij blokken van 32 en 128 samples.
De bestaande energiegrens en passiviteit blijven gelden tijdens sweeps.
Controleer paneel, kabels en hoorbare bediening in een echte browser en bouw
de Teensy-firmware; claim nog geen gelijke externe CV-timing op beide platforms.

### Stap 3: stemming en realtime gedrag op Teensy

Meet eerst hoe de waargenomen grondtoon en dominante modi veranderen met
Pitch, Spread en Couple. V/Oct stemt nu de losse knopen; de gekoppelde
structuur heeft niet noodzakelijk dezelfde grondtoon. Onderzoek pas op basis
van die metingen of een tonale ankerlaag, compensatie of een optionele
gestemde modus helpt. Behoud de vrije materiaalstand als referentie: exacte
stemming mag het onderscheidende gedrag niet ongemerkt vervangen.

Test vervolgens de demonstratiepatch op een echte Teensy: CPU- en
interruptbelasting, audio-uitval, snelle/herhaalde triggers, parameterbeweging,
reset en langdurige werking. Meet zowel de module in een eenvoudige patch
als naast andere DSP. Noteer firmwareversie, samplerate, blokgrootte,
patchconfiguratie en gemeten marges; een geslaagde build of klein geheugen
is geen bewijs van realtime capaciteit. Flashen is een afzonderlijke,
bewuste stap en is met deze documentatie niet uitgevoerd.

**Toetscriteria:** een vastgelegd stembereik met bekende afwijkingen en een
hardwareverslag met gemeten belasting en eventuele gemiste triggers of
audiofouten. Stel de bruikbare grenzen vast voordat extra polyfonie of grotere
netwerken worden beloofd.

### Prioriteit en afbakening

| Volgorde | Resultaat | Backlog |
|---|---|---|
| 1 | Zelfspelende tweepuntsdemonstratie en luidheidsgematchte Memory-A/B | ED-SM-MB-2 |
| 2 | Couple/Pickup-CV, gedeelde smoothing, contract- en regressietests | ED-SM-MB-3 |
| 3 | Stemmingsonderzoek en gemeten realtime gedrag op Teensy | ED-SM-MB-4 |
| Later | Meer knopen, vrij bewerkbare topologie of automatisch groeiend netwerk | Alleen na een overtuigende muzikale proef |

Een volledige graafeditor, morphogenetische groei, FPGA-port en uitbreiding
naar veel stemmen vallen buiten deze vervolgstap. De eerstvolgende beslissing
gaat over **eigen speelgedrag**, niet over het aantal functies.

## Uitvoering: demo, A/B en CV-smoothing

**Let op (2026-10-01):** de demo en de metingen hieronder beschrijven de
eerste uitvoering met het 2:3-ritme en de ongeschaalde koppeling. Die demo
hield de brug 94 % van de speeltijd gebroken en het verschil kwam vooral uit de
stressdemping. De huidige demo (zacht-hard-zacht-frase, drie takes, Memory en
Fatigue gescheiden) en de bijbehorende meetwaarden staan in de
[handover](material-bridge-handover.md#demonstratie-instellingen). Deze sectie
blijft staan als verslag van de eerste stap.

### Demonstratie en herhaalbare takes

**Solo > Material Bridge demo (2:3)** voegt een rack met twee SEQ-16-modules,
Material Bridge en stereo-OUT toe, plus twee patches: `Memory aan` (0,85) en
`Memory uit` (0). Bestaande patches blijven behouden. Start de simulator:
handmatige MIDI-noten zijn niet nodig. Beide patches gebruiken hetzelfde rack,
dezelfde kabels en dezelfde parameters, met alleen Memory als verschil.

- SEQ A: 2 Hz, gatefractie 0,1 (circa 50 ms), acht stappen.
- SEQ B: 3 Hz, gatefractie 0,1 (circa 33 ms), tweede aanslagpunt.
- SEQ A CV levert de gedeelde velocity: semitonestappen
  `3, 12, 5, 12, 3, 9, 12, 4`, Root 60. Door deling door 12 ontstaan
  velocities `0,25; 1; 0,417; 1; 0,25; 0,75; 1; 0,333`.
- De instrumentgrondtoon blijft C3: Pitch -12, geen kabel op V/Oct.
  Spread 0,12, Couple 0,65, Decay 4 s, Recover 2 s, Pickup 0,25, Level 0,8.
- Beide exciters delen velocity, ook bij gelijktijdige aanslagen. Ontkoppel
  een van de gatekabels om het andere aanslagpunt afzonderlijk te beluisteren.

Live patchwisselen is geen gecontroleerde A/B: het garandeert geen reset van
sequencers, resonatoren of stress, en de live uitgangsniveaus zijn niet gematcht.
Gebruik daarvoor de renderer vanuit de repositoryroot:

```powershell
node tools/mmb-wasm/render-material-bridge.mjs editor/public/material-bridge-ab
```

Zonder uitvoermap schrijft hij naar de tijdelijke map `mmb-material-bridge-ab`.
Hij gebruikt de echte demoseed en de echte SEQ-16- en Material Bridge-wasm,
geen nagemaakte oscillator of ritmische formule. Iedere take krijgt een nieuwe
instantie en reset; beide gebruiken exact dezelfde opgeslagen gate-/velocity-
samples. De sequencers draaien op 1 kHz; hun waarden worden sample-and-hold
doorgegeven aan de DSP op 44,1 kHz. Velocity staat vast voordat dezelfde
DSP-sample de gateflank verwerkt. Dit is een deterministische referentie,
geen bewijs van identieke scheduling door WebAudio of Teensy CvGraph.

De opname duurt 20 s: na 12 s komen geen nieuwe aanslagen meer, lopende gates
mogen uitlopen en het materiaal herstelt in de resterende tijd. De test telde
24 aanslagen op A en 37 op B. De reset geeft beide sequencers een eerste gate;
door de 1-kHz-klok en faseafronding kan de laatste B-aanslag nog net voor de
12-s-grens vallen. Alle opgenomen gates duren minstens 5 ms.

Uitvoer: `memory-on.wav`, `memory-off.wav` (stereo PCM16) en `report.json`
met instellingen, meetwaarden, gains en SHA-256-hashes. Met een editorserver
zijn de bestanden bereikbaar onder `/material-bridge-ab/`.

| Meting | Memory 0,85 | Memory 0 |
|---|---|---|
| Ruwe stereo-RMS | 0,0407194 | 0,0977310 |
| Vaste gain voor gehele take | 2,362670 | 0,984401 |
| Gematchte stereo-RMS | 0,0962065 | 0,0962065 |
| Gematchte piek | 0,900000 | 0,503576 |
| Maximale Stress | 0,978874 | 0,999967 |
| Stress aan het einde | 0,013427 | 0,018319 |

De renderer controleert reproduceerbaarheid van de Memory-aan-take
sample-voor-sample, eindige en begrensde audio, herstel, gatebreedte en minder
dan 0,01 dB RMS-afwijking na PCM16-kwantisatie. Geen limiter, normalisatie per
aanslag of compressor: het karakter van de dynamiek blijft behouden.
**RMS-matching is geen perceptuele LUFS-matching en geen afgeronde blinde
luisterproef.** De takes zijn bewust herkenbaar benoemd; laat iemand de
volgorde blind aanbieden voor een luisterbeoordeling. Een kortere-Decay-
referentie, herkenning van eerder opgebouwde stress en doelbewuste
bespeelbaarheid zijn nog niet muzikaal beoordeeld.

### CV-contract en smoothing

De ingangen `coupling_cv` en `pickup_cv` staan op het 14HP-paneel als `Cpl+`
en `Pick+`. Voor beide geldt: effectieve doelwaarde = `clamp(knop + CV, 0, 1)`.
Negatieve CV moduleert omlaag; buitenbereik-CV wordt verzadigd en NaN/Infinity
betekent nul modulatie. Zonder kabel geldt eveneens nul modulatie.
Loskoppelen keert gesmoothd terug naar de knopstand, ook wanneer in de
wasm-invoerbuffer nog een oude CV-waarde staat.

De gedeelde kernel gebruikt per sample een eerste-ordefilter met een
tijdsconstante van 10 ms, coefficient `1 - exp(-1 / (0,01 * samplerate))`.
Na 10 ms is circa 63,2% van een stap afgelegd, na 50 ms circa 99,3%.
Dit geldt voor handmatige Couple/Pickup-wijzigingen en hun CV samen.
De eerste DSP-sample neemt de ingestelde doelwaarden direct over: een nieuw
gestarte preset hoeft niet vanaf fabrieksdefaults te glijden. Reset wist
energie/stress direct maar herstart de parametersmoother niet. Gates blijven
flankgestuurd, V/Oct krijgt geen glide en andere controls zijn niet gewijzigd.

De CV-setter berekent geen trigonometrie en herstemt geen resonatoren.
Wasm leest de nieuwe ingangen samplegewijs; Teensy neemt hun waarden aan
het begin van ieder 128-sample blok over. De smoothingtijd is gelijk, maar
extern aangeboden snelle CV heeft daardoor nog steeds verschillende timing.
De pickups blijven passieve waarnemers; de koppelingen blijven unitair en
voegen tijdens modulatie geen energie toe.

### Verificatie en grenzen

- 300 tests geslaagd in `contract.test.ts` en `sim/wasmPorts.test.ts`, waaronder
  16 Material Bridge-wasm-tests en een nieuwe demo-/A/B-contracttest.
- C++-invarianten slagen op 32/44,1/48/96 kHz: passiviteit bij CV-sprongen,
  de analytische 10-ms-curve bij blokken van 32/128 samples, directe gate/reset,
  hysterese, herstel en energiegrens. Kernel: 156 bytes; wasm: 66.007 bytes.
- TypeScript-check en editorproductiebouw slagen. PlatformIO Teensy 4.1-build
  slaagt. Bestaande compilerwaarschuwingen en de bundelgroottewaarschuwing
  blijven buiten deze wijziging. **Niet geflasht en geen hardware-CPU-meting.**
- Geisoleerde headless Chromium-sessie: menu via echte klikken, demo starten,
  draaiende AudioContext en gemeten uitgangsaudio (piek circa 0,055), geen
  JavaScript-fouten. CV-kabels in de live projectstate toegevoegd en zichtbaar
  als zeven verbindingen. Nieuwe labels liggen binnen het paneel en overlappen
  elkaar niet bij 1440x1000 en 390x844. Screenshots gemaakt; dit is geen
  audit van de volledige mobiele editor en geen menselijke klankbeoordeling.

## Beslispunt

State-Graph Synthesis verdient voorlopig de status **onderzoeksinstrument**, niet
productarchitectuur. Het compacte Material Bridge-prototype is gebouwd;
de demonstratie en expressieve besturing uit het
[vervolgvoorstel](#aanbevolen-vervolg-voor-material-bridge) zijn beschikbaar.
De volgende stap is hun muzikale beoordeling. Alleen als spelers
het geheugen en de onderlinge beinvloeding hoorbaar kunnen voorspellen en
gebruiken, is een volledige graafeditor gerechtvaardigd. Een FPGA-traject
vraagt daarnaast profiling die een concrete technische noodzaak aantoont.

Voor een volgende implementatie- of onderzoekssessie staat de praktische
context in [Material Bridge: overdracht en vervolg](material-bridge-handover.md).