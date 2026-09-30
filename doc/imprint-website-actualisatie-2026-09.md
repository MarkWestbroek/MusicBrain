# Aan Imprint: actualisatie van Musicbrain.nl

Datum: 2026-09-30.
Status: uitvoerbaar wijzigingsverzoek; nog niet op de website toegepast.

## Opdracht

Actualiseer de inhoud en navigatie van Musicbrain.nl op basis van de huidige
MusicBrain-documentatie. Behoud de bestaande huisstijl, product- en
componentstructuur en historische releases. Dit is geen verzoek om een
nieuwe website of een nieuwe CMS-architectuur te bouwen.

De website vertelt nu vooral het oorspronkelijke verhaal van een brain voor
analoge apparatuur. Inmiddels is MusicBrain ook een bruikbaar browserinstrument
met digitale synthese, sampling, effecten en Teensy-firmware. Die verbreding
moet zichtbaar worden zonder prototypes als leverbare producten voor te stellen.

Bronnen:

- [Actuele README](../README.md), ook op
  [GitHub](https://github.com/MarkWestbroek/MusicBrain#readme): nieuwe publieke ingang.
- [Documentatiereview](documentatie-review-2026-09-30.md): onderbouwing en voorbeelden.
- [Release-log](RELEASE-LOG.md) en [backlog](BACKLOG.md): ontwikkeling en open werk.
- [Publicatiewerkwijze](site-publicatie-werkwijze.md): bestaande component/spec/release-keten.
- [Huisstijl](styleguide.md): behouden, geen visuele herstart nodig.

Deze bestanden staan in de MusicBrain-repository. De site zelf wordt beheerd
in Imprint; dit document geeft geen toestemming voor een ongecontroleerde
live publicatie of het herschrijven van historische productreleases.

## 1. Direct corrigeren

| Prioriteit | Probleem | Gewenste wijziging |
|---|---|---|
| P1 | Homepage en footers verwijzen naar `https://github.com/musicbrain`, een ander GitHub-doel | Gebruik centraal `https://github.com/MarkWestbroek/MusicBrain`; controleer ook hergebruikte contentblokken. |
| P1 | "Your audio stays 100% analog; the brain speaks only relays, CV and gate" | Maak onderscheid tussen een extern analoog pad en interne digitale DSP/USB-audio. |
| P1 | "Save and recall full patches" zonder voorwaarden | Benoem dat recall van externe hardware afhangt van bestuurbare parameters en schakelbare verbindingen. |
| P1 | "Exact same firmware core" en "16 voices" klinken universeel | Schrijf over gedeelde DSP-kernen voor ondersteunde modules; polyfonie en volledige patchondersteuning hangen af van doel en patch. |
| P1 | "Any pre-amp to any power amp to any cab" | Presenteer Relay als ontwikkeling met veiligheidsvoorwaarden, niet als bewezen universele schakeloplossing. |
| P2 | "Try it before it exists" verkleint de huidige editor tot toekomstige demo | Presenteer de browsereditor als nu bruikbaar, met de hardwarekoppeling als aanvullende route. |

**Klaar wanneer:** geen openbare pagina meer naar de verkeerde GitHub-organisatie
wijst en de kernclaims ook kloppen voor een bezoeker die alleen de homepage leest.

## 2. Navigatie en eerste gebruik

Voeg een duidelijke **Docs / Get started**-ingang toe aan de hoofdnavigatie.
Hergebruik een bestaande Imprint-pagina als inhoudsopgave; een apart
documentatieplatform is niet nodig. Geef drie routes:

| Route | Inhoud | Bestaande bron voor de eerste versie |
|---|---|---|
| Play in your browser | Editor openen, voorbeeld laden, audio starten, spelen, project exporteren | [README: browser](../README.md#try-it-in-the-browser) |
| Use a Teensy | Benodigdheden, released firmware, Teensy Loader, versiecontrole, USB-audio, banken | [README: Teensy](../README.md#use-a-teensy), [firmwaredistributie](firmware-distributie.md), [pc-handleiding](teensy-aan-de-pc.md) |
| Build hardware | Passende bordgeneratie, componenten, pinouts, BOM/fab, validatie en voeding | [README: hardware](../README.md#build-hardware), bord-README's |

Voeg daarnaast links toe voor ontwikkelaars, firmwaredownloads en issues.
Voor de eerste publicatie mogen de routes naar de betreffende GitHub-secties
verwijzen. Toon bij een link naar Nederlandstalige documentatie dat die in het
Nederlands is; suggereer geen volledige Engelse handleiding die nog niet bestaat.

Gebruik voor broncode, documentatie, downloads en hulp verschillende labels:

- Source: `https://github.com/MarkWestbroek/MusicBrain`
- Documentation: `https://github.com/MarkWestbroek/MusicBrain#start-here`
- Firmware releases: `https://github.com/MarkWestbroek/MusicBrain/releases`
- Issues: `https://github.com/MarkWestbroek/MusicBrain/issues`
- Editor: `https://editor.musicbrain.nl/`

## 3. Wijzigingen per pagina

### Homepage en About

Behoud het uitgangspunt van open muzikale besturing en patchgeheugen, maar
maak browserinstrumenten, digitale DSP en hybride hardware onderdeel van
de eerste uitleg. About mag niet eindigen met alleen "hardware for your
pedalboard": Cortex is een belangrijk deel van het project.

Voorgestelde Engelse tekst:

> **MusicBrain**
>
> An open platform for playable instruments, recallable patches and musical
> control. Build and play modular patches in your browser, run shared DSP on
> a Teensy, and connect supported hardware through MIDI, CV, gates and relays.
>
> Keep external audio paths analog where your setup allows it, or combine
> them with digital synthesis, sampling and effects. Recall depends on the
> parameters and connections your hardware can control.

Primaire actie: **Open the editor**. Secundaire actie: **Get started**.
Houd Cortex, Reflex en Relay herkenbaar als drie richtingen, maar geef hun
verschillende ontwikkelstatus aan. Noem Synapse niet als vierde product
zonder uitleg en bevestiging van de maker; de huidige devlog doet dat wel.

### Cortex en editor

Leg op Cortex de koppeling tussen browser, Teensy en externe modules uit.
Maak duidelijk dat de interne digitale instrumenten met een Teensy kunnen
worden geprobeerd zonder eerst een complete backplane te bouwen. De huidige
firmware gebruikt USB-audio; een zelfstandig analoog audio-uitgangspad mag
niet uit de aanwezigheid van een codec-header worden afgeleid.

Voorgestelde Engelse tekst voor de editorpagina:

> **MusicBrain editor & simulator**
>
> Assemble a rack, patch instruments and effects, and play in your browser.
> Start with a ready-made patch or build your own. No MusicBrain hardware or
> account is required for the core editor and simulator.
>
> Supported instruments use the same C++ DSP kernels as the Teensy firmware,
> compiled to WebAssembly. Audio I/O, routing and available CPU and memory
> differ between targets, so check support before moving a patch to hardware.

Toon een compact mogelijkhedenoverzicht met links naar details:

- Synthese: subtractief, FM/DX7, wavetable, fysieke modellen en SID.
- Sampling: eigen materiaal, SF2, key/velocity-zones en banken.
- Effecten: filters, delays, modulatie, galm, compressors en EQ.
- Stem en externe audio: vocoder, ZANG en lyricbanken, met hun benodigdheden.
- Bediening: MIDI, CC/aftertouch, control surfaces en verdere MPE-ontwikkeling.
- Patchgereedschap: presets, recepten en optionele AI/MCP-workflows.

Dit is een overzicht van het project, geen automatische claim dat de nieuwste
ontwikkelfunctie al in de live editor staat. Controleer de gedeployde build
voor elke functie die als "try now" wordt aangeboden. Geef morph en vroege
instrumentproeven een expliciet prototype-/ondersteuningslabel.

### Reflex en Relay

Reflex: scheid de MIDI/footswitch-controller van de eigenlijke relais-loops.
De huidige specs over footswitches en OLED-labels verklaren de schakelketen
niet. Beschrijf apart wat de offline editor simuleert en wat met hardware
is aangetoond; neem Cortex-USB-instructies niet automatisch over.

Relay: vermeld dat de editor nog een placeholder is. Publiceer geen
universele amp/cab-compatibiliteit of popvrije werking als bewezen eigenschap.
Benodigde impedantie-, vermogen-, load- en schakelvoorwaarden moeten uit een
geverifieerd ontwerp komen, niet uit marketingtekst.

### Planning, releases en devlog

De publieke planning toont bij de review vooral hardwarekaarten, waaronder
busboard-v2 terwijl Cortex v3.1 beschrijft. Breng actuele softwareontwikkeling
en hardwarevalidatie terug in hetzelfde overzicht, met drie niveaus:

1. **Available now:** daadwerkelijk gepubliceerde software en geverifieerde
   hardwarefuncties, met versie en vindbare download/bron.
2. **Next milestones:** enkele door de maker gekozen doelen met een concreet
   resultaat; geen nieuwe deadlines of prioriteiten afleiden uit deze opdracht.
3. **Research:** Instrument Lab, analoge/hybride voice-tiles, State-Graph en
   verdere synthese-experimenten. Een onderzoeksprototype is geen productbelofte.

Vervang de admin/time-travel-uitleg aan het begin van Planning door een korte
publieke uitleg van deze statusindeling. Historische bordstanden mogen blijven.
Laat Devlog naar een overzicht leiden zodra er meerdere berichten zijn,
niet permanent naar alleen "Hello, world" / "More soon".

## 4. Versies en bewijs

Bij de review op 30 september waren de volgende standen zichtbaar:

| Laag | Geobserveerd | Betekenis |
|---|---|---|
| Website-productrelease | Cortex v0.3 van 16 juli, editorcomponent 0.5.48 | Historisch vastgepinde productcombinatie |
| GitHub-downloadrelease | Firmware 0.5.78 als nieuwste release in het overzicht | Gepubliceerd firmwarebestand |
| Firmwarebron en ontwikkellog | 0.5.94 | Ontwikkelstand, niet automatisch een download of deploy |

Deze nummers zijn een gedateerde waarneming, geen waarden om zonder controle
als "latest" over te nemen. Toon per softwarepublicatie de versie, datum,
download en bekende compatibiliteit. Verifieer de daadwerkelijk aangeboden
build; een contracttest bewijst geen volledige functionele pariteit.

Scheid bij hardware ten minste ontwerp, geproduceerd prototype, fysiek
getest en leverbaar. Definieer wat "stable", "beta" en "bestelbaar" betekenen.
Een ERC/DRC-resultaat of fab-pakket bewijst alleen een deel van ontwerpvalidatie.
Toon onbekende of niet-gecontroleerde status als zodanig.

**Historische releases blijven ongewijzigd vastgepind.** Een nieuwe
editorcomponent hoort bij een nieuwe publicatie, niet stilzwijgend onder
Cortex v0.3 als vervanging voor de oude component. Gebruik de bestaande
Imprint-versies en publicatiewerkwijze; geen nieuwe infrastructuur nodig
zolang die het onderscheid kan weergeven.

## 5. Voorbeelden en praktische informatie

Publiceer bij voorkeur drie korte, reproduceerbare voorbeelden: een eenvoudige
synthpatch, een samplerpatch en een patch met expressieve bediening of effecten.
Per voorbeeld: echte screenshot, kort geluidsfragment, gebruikte versie en
eventuele bankvereisten. Alleen rechtenvrij of toegestaan materiaal publiceren.

Gebruik een directe patchlink alleen als de editor die werkelijk ondersteunt
en de volledige route is getest. Anders: een downloadbaar project met een
korte importinstructie. Verzin geen deep-linkparameters. De bestaande beelden
in [editor/screenshots](../editor/screenshots/) kunnen als vertrekpunt dienen;
maak actuele beelden wanneer de getoonde bediening veranderd is.

Voeg bij Get started een kort supportblok toe: browser-/OS-ondersteuning per
workflow, audio-/MIDI-/seriele toestemming, projectexport als backup, en
hardwarevereisten. Publiceer alleen geteste combinaties als ondersteund.
AI-diensten en lokale spraakgeneratie zijn optioneel en hebben eigen
configuratie; verwar ze niet met de accountloze basis-editor.

Nuanceer ook "everything is MIT": eigen MusicBrain-code is MIT; externe
bibliotheken en assets behouden hun eigen licenties. Link naar de bron en
bijbehorende notices, zonder een volledige licentieaudit te suggereren.

## 6. Verantwoordelijkheden en uitvoering

**Imprint:** centrale links, navigatie, paginacopy, bruikbare statusweergave en
controle dat bestaande component-, release- en assetlinks blijven werken.

**MusicBrain:** bevestigt productclaims, softwarecompatibiliteit en
hardwarebewijs; levert publiceerbare screenshots/geluid/projecten en kiest
de volgende mijlpalen. Gebruik [editor/site/cortex.md](../editor/site/cortex.md)
en de andere softwarepublicatiebronnen bij actualisatie, zodat een volgende
publicatie geen oude tekst terugzet.

Volgorde: eerst links en kernclaims, daarna Get started en actuele
softwarestatus, vervolgens voorbeelden en roadmap. Deze eerste stappen
hoeven niet op nieuwe geluidsopnames te wachten. Presenteer de wijzigingen
eerst in preview en publiceer pas na inhoudelijke controle door de maker.

## Acceptatiecheck

- Alle broncode-/GitHub-links leiden naar MarkWestbroek/MusicBrain of een
  passend onderdeel daarvan, niet naar de andere organisatie.
- Vanaf de homepage zijn editor, documentatie en firmwaredownloads vindbaar;
  een eerste bezoeker hoeft geen ontwikkellog te lezen om te beginnen.
- Homepage, About, Cortex en editor beschrijven hetzelfde analoge/digitale
  onderscheid, zonder universele recall-, pariteits- of polyfonieclaims.
- Iedere als beschikbaar gepresenteerde functie is gecontroleerd tegen de
  aangeboden build; prototypes en onderzoek zijn herkenbaar apart.
- Productrelease, firmwaredownload en ontwikkelstand hebben elk hun eigen
  betekenis. Oudere releases, vastgepinde specs en assets blijven bereikbaar.
- Een tester kan vanaf Get started een voorbeeld laten klinken, exporteren
  en terugladen, en bepalen wat nodig is om het op een Teensy te proberen.
- Controleer desktop en mobiel op leesbare tabellen, werkende navigatie,
  zichtbare acties en correcte screenshots/media. Test links zonder inloggen.
- Noteer na oplevering wat is aangepast, welke build/status is geverifieerd
  en welke onderdelen nog op inhoud of hardwarevalidatie wachten.