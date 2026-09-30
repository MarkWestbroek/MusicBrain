# Review documentatie en Musicbrain.nl

Datum: 2026-09-30. Perspectief: een nieuwe GitHub-bezoeker met basiskennis
van synthese, muziek, software en hardware, maar zonder projectgeschiedenis.

## Conclusie

Er is veel waardevolle documentatie, maar nog geen samenhangende publieke
handleiding. De hoeveelheid informatie is niet het hoofdprobleem: de ingang,
actualiteit, statusduiding en onderlinge verbindingen zijn dat wel. Een nieuwe
lezer krijgt een veel kleiner en ouder beeld van MusicBrain dan het project
verdient. De website is toegankelijker, maar vertelt grotendeels het
oorspronkelijke analoge verhaal en maakt enkele te absolute beloftes.

| Vraag | Oordeel | Belangrijkste reden |
|---|---|---|
| Eenvoudig te begrijpen? | Gedeeltelijk | Goede lokale uitleg, maar projecttermen en ontwikkelgeschiedenis domineren de instap. |
| Eenvoudig doorlopen en doorklikken? | Onvoldoende | Geen centrale leeswijzer; README stuurt naar oude plannen; website verwijst naar een andere GitHub-organisatie. |
| Volledig en dekkend? | Veel bouwstenen, geen aantoonbaar complete gebruikersdekking | Grote functies staan in losse plannen, code en release-notities, niet in een actuele functiecatalogus met handleidingen. |
| Geeft het de visie weer? | De oorspronkelijke visie wel, de gegroeide visie onvoldoende | Geheugen voor analoge apparatuur is helder; zelfstandig browserinstrument, digitale DSP en hybride instrumentontwikkeling blijven onderbelicht. |
| Brengt het de toekomst in beeld? | Intern uitgebreid, publiek onvoldoende geordend | Veel onderzoeksrichtingen, maar geen korte actuele roadmap met onderscheid tussen toezegging, prototype en onderzoek. |

## Werkwijze en grenzen

- De publieke [GitHub-repository](https://github.com/MarkWestbroek/MusicBrain)
  en de lokale README zijn vergeleken; de verouderde instap is ook publiek zichtbaar.
- Gelezen: instapdocumenten, delen van requirements/backlog/release-log,
  simulator- en Teensy-uitleg, firmware- en hardware-README's en gerichte
  themadocumenten. Steekproeven in de editorstructuur en simulatorselectie
  dienen als controle op de beschreven mogelijkheden.
- Website: homepage, Cortex/Reflex/Relay, editor, editor-component, planning,
  About, devlog en Cortex v0.3. De homepage is ook in een browser bekeken.
- In 11 instap-/vervolgdocumenten zijn 116 lokale inline-Markdownlinks op
  bestaand doel gecontroleerd: 2 verwijzingen hebben een ontbrekend doel.
  Dit is geen volledige crawl; anchors, referentielinks en alle externe links
  zijn niet integraal gecontroleerd.
- Geen volledige functionele test van editor, firmware of hardware; geen
  mobiele/toegankelijkheidsaudit. Een aanwezig schema of geslaagde build is
  niet gelijk aan bewezen werkende hardware.
- Lokale ongecommitte wijzigingen zijn aanwezig, onder meer rond FOF-VOICE.
  Die tellen niet automatisch als publiek beschikbare functionaliteit.
- Deze review wijzigt alleen dit verslag, geen bestaande productteksten,
  backlog, firmware, editor of live publicaties.

## Bevindingen op prioriteit

### P1: de website stuurt bezoekers naar het verkeerde GitHub-doel

De homepage en footers gebruiken `https://github.com/musicbrain`. Dat doel
toont bij controle een organisatie met een Python-repository `music-brain`,
laatst bijgewerkt in 2024. De ingestelde remote van dit project en de
daadwerkelijk openbare repository zijn
[MarkWestbroek/MusicBrain](https://github.com/MarkWestbroek/MusicBrain).

Gevolg: de belofte "Everything on GitHub" leidt niet naar de aangeboden
firmware, editor en hardware. Corrigeer de centrale siteverwijzing en geef
waar zinvol directe links naar documentatie, releases en issues.

### P1: de primaire ingang zegt ten onrechte dat er alleen scaffolding is

[README](../README.md) noemt onder Status nog "Scaffolding only" en Stage 1.
De eerste leesroute is Requirements, Plan en ADRs. De browsereditor staat pas
na repositorylayout, CMake-buildinstructies en huisstijl beschreven.

[Plan](Plan.md) adviseert nog een Python/Qt-desktopeditor in de roadmap;
[Plan v2](Plan-v2.md) noemt expliciet een momentopname uit mei.
[De firmware-README](../firmware/app-modular-brain/README.md) begint met een
planschets en "To be implemented", gevolgd door oude ontwikkellogs.

Gevolg: de bezoeker kan redelijkerwijs concluderen dat er nog niets te
proberen is. Begin met wat MusicBrain is, wat vandaag werkt, de editorlink,
een voorbeeld en drie routes: proberen, hardware gebruiken, bijdragen.
Bewaar oude plannen, maar markeer ze als historisch met een actuele opvolger.

### P1: actuele uitleg spreekt zichzelf tegen

Concrete voorbeelden:

- [Editor-README](../editor/README.md): noemt een Teensy-link en WASM-simulator,
  maar stelt ook dat device-discovery/WebSerial-upload nog in Stage 7 komt.
  Dat moet per product worden uitgesplitst; Reflex en Cortex zijn niet even ver.
- [Teensy aan de pc](teensy-aan-de-pc.md), sectie 3: begint met "Samples gaan
  niet over de kabel" en beschrijft vervolgens upload via de editor sinds
  firmware 0.5.67. Een lezer kan al bij de eerste zin het verkeerde pad kiezen.
- [Browserinstrumenten](browser-instrumenten.md), sectie 7: noemt mono
  note-dispatch en niet op hardware gebouwde sampler/tape-echo. De latere
  [pariteitsontwikkeling](sim-firmware-parity-plan.md) en
  [release-log](RELEASE-LOG.md) beschrijven belangrijke vervolgstappen.
- [Backlog](BACKLOG.md): ED-SM-3 meldt gerealiseerde WASM-polyfonie, terwijl
  ED-RV-9 nog spreekt over toekomstige echte poly-simulatie. Oude context
  moet herkenbaar historisch zijn, niet als huidige beperking blijven staan.

Advies: per onderwerp een korte actuele samenvatting bovenaan, met datum,
geldende versie en beperkingen. Verplaats het verloop naar een historieblok
of release-log. Laat gebruikers geen chronologie reconstrueren.

### P1: websiteclaims lopen vooruit op of achter bij de werkelijkheid

Op [homepage](https://musicbrain.nl/) en
[Cortex](https://musicbrain.nl/products/cortex) staat dat audio 100% analoog
blijft en de brain alleen CV/gate/relais spreekt. Dat beschrijft een mogelijk
extern analoog pad, niet het hele platform: er zijn digitale oscillatoren,
sampler, effecten en USB-audio. Zie [Teensy aan de pc](teensy-aan-de-pc.md)
en [browserinstrumenten](browser-instrumenten.md).

"Save and recall full patches" heeft eveneens een grens nodig: welke
moduleparameters zijn bestuurbaar, welke kabels/audioverbindingen schakelbaar,
en welke standen van externe analoge apparatuur blijven handwerk? Een
ingetekende module maakt bestaande hardware niet vanzelf recallbaar.

De [editorpagina](https://musicbrain.nl/editor) zegt "exact same firmware
core" en "16 voices". Gedeelde DSP is een echte kracht, maar is niet hetzelfde
als identieke uitvoering van iedere patch, I/O en hardware-interactie. De
[simulatorselectie](../editor/src/modular-mb/sim/simSupport.ts) onderscheidt
WASM, Web Audio en niet-gesimuleerde types. Het
[morph-plan](plans/morph-a-b.md) noemt bijvoorbeeld expliciet ontbrekende
firmwareondersteuning. Vermeld polyfonie per patch/doel, niet als universele
prestatiegarantie.

### P2: status, versies en publicatie zijn niet uit elkaar te houden

Tijdens de review zijn drie verschillende standen zichtbaar:

| Bron | Zichtbare stand | Wat dat betekent |
|---|---|---|
| Website, nieuwste productrelease | Cortex v0.3, 2026-07-16, editorcomponent 0.5.48 | Gepubliceerde productcombinatie; niet noodzakelijk actuele softwareontwikkeling. |
| GitHub, nieuwste release in repository-overzicht | Firmware 0.5.78 | Zichtbare downloadrelease; niet automatisch de nieuwste broncode. |
| Repository-release-log | Firmware 0.5.94 op 2026-09-30 | Beschreven ontwikkelstand; aanwezigheid van een download/deploy apart controleren. |

Dit verschil is niet op zichzelf fout, maar nergens helder uitgelegd.
Behoud historische releases; voeg een actuele softwarestatus toe met
compatibele editor/firmware, download, beperkingen en verificatiedatum.

De website gebruikt tegelijk "in development", "stable" en "bestelbaar /
beta". Definieer die termen. DRC/ ERC schoon of een fab-pakket betekent
"ontwerp klaar voor productie", niet automatisch "gebouwd, getest en leverbaar".
De [busboard-README](../hardware/schematics/musicbrain-busboard/README.md)
is technisch rijk, maar "AF" en "Bestelbaar" hebben publiek die nuance nodig.

### P2: gebruikershandleiding en ontwikkelarchief zijn vermengd

[Requirements](Requirements.md) begint begrijpelijk vanuit de drie muzikale
problemen, maar bevat daarna onder meer componentonderzoek, UI-iteraties,
codepaden, oude TODO's en dubbele implementatiestartkoppen. De
[release-log](RELEASE-LOG.md) bevat veel technische waarde, maar vermeldt
zelf een ontbrekend firmwareblok 0.5.16-0.5.48. Geen van beide is een
betrouwbare complete functie-index voor nieuwe gebruikers.

Een lezer met synthkennis hoeft geen VCO-les, maar wel uitleg van
MusicBrain-termen: Cortex = Modular MB/MMB, Reflex = effect/guitar-switcher,
Relay = amp/speaker-switcher; daarnaast module-type tegenover instantie,
intern/extern rack, PolyGroup tegenover CellGroup en dCV tegenover analoge CV.
Kies per document een hoofdtaal en leg afkortingen bij eerste gebruik uit.

### P2: doorklikken werkt niet consequent

De linksteekproef vindt in [Plan v2](Plan-v2.md) twee foute doelen:

- `adr/0005-patch-format.md`; werkelijk bestand:
  [0005-patch-storage-format](adr/0005-patch-storage-format.md).
- `adr/0007-license.md`; werkelijk bestand:
  [0007-licensing](adr/0007-licensing.md).

Daarnaast zijn veel verwijzingen slechts code-opgemaakte bestandsnamen.
Bijvoorbeeld de overzichtstabel in [UML](uml/README.md): wel een inventaris,
maar geen klikbare documenten. Ook "zie sectie 9" verwijst geregeld naar
de hele pagina in plaats van het bedoelde kopje. Voeg echte links, gerichte
anchors en een teruglink naar de leeswijzer toe. Een centrale documentatie-
ingang ontbreekt nu op het niveau van de hoofdmap `doc/`.

## Functiedekking

Onderstaande matrix beoordeelt vindbaarheid en uitleg, niet of elk onderdeel
functioneel is getest. "Niet in de instap" betekent niet "nergens beschreven".

| Gebied | Bestaande bron | Wat ontbreekt voor de bezoeker |
|---|---|---|
| Drie productlijnen | [Requirements](Requirements.md), [editor](../editor/README.md), website | Een naamkaart en actuele status per product; Cortex domineert, Relay is in de editor een placeholder. |
| Rack, patcher, opslag, presets, polyfonie | [Editor](../editor/README.md), [UML WASM](uml/11-simulation-wasm.md), release-log | Een aaneengesloten handleiding: voorbeeld laden, spelen, wijzigen, opslaan, terugladen; onderscheid project/rack/patch/preset. |
| DSP-instrumenten en effecten | [Browserinstrumenten](browser-instrumenten.md), [release-log](RELEASE-LOG.md), modulecatalogus in de editor | Een doorzoekbare publieke catalogus per familie, met controls, poorten, voorbeeld en sim/hardware-status; ook SID, STK, vintage FX, ZANG en nieuwe ontwikkelingen. |
| Sampler, SF2, DX7 en banken | [Browserinstrumenten](browser-instrumenten.md), [Teensy](teensy-aan-de-pc.md), [WASM-tools](../tools/mmb-wasm/README.md) | Gebruikersroutes voor bronmateriaal, import/export, browseropslag, SD/PSRAM, overdracht en beperkingen. |
| Zang en externe audio | [Zingende stemmen](plans/zingende-stemmen.md), [Teensy](teensy-aan-de-pc.md), [Piper](../tools/piper-tts/README.md) | Vindbare ingang; scheid lokaal gegenereerde spraak, opname, lyricbank en zangmodule; vermeld afhankelijkheden. |
| MIDI en fysieke bediening | [Control surface](plans/control-surface.md), [MPE](plans/mpe.md), [Snaarbank](snaarbank-testlab.md) | Praktisch overzicht klavier, CC, aftertouch, Roto-Control en touch/telefoon; onderscheid browserverbinding en standalone hardware. |
| Recepten, AI en MCP | [Patch-recept](plans/patch-recept.md), [MCP](../tools/mmb-mcp/README.md) | In de hoofdingang afwezig; leg uit wat zonder AI werkt, welke externe dienst optioneel is en hoe een project wordt overgedragen. |
| A/B en morph | [Morph](plans/morph-a-b.md) | Gebruikersuitleg en nadrukkelijke grens tussen simulator en firmware; geen algemene pariteitsbelofte. |
| Firmware proberen | [Distributie](firmware-distributie.md), [Teensy](teensy-aan-de-pc.md) | Eenvoudige route met kant-en-klare firmware, benodigdheden, versiecontrole en eerste geluid; ontwikkelaarscommando's apart. |
| Hardware bouwen/uitbreiden | Bord-README's, [SPI-specificatie](spi-bus-spec.md), [systeem v3](systeem-v3-plan.md) | Centrale bordencatalogus, passende revisies, minimumconfiguratie, BOM/fab, veilige voeding en bring-up; verschillen tussen schema, geproduceerd en getest. |
| Architectuur en bijdragen | [ADRs](adr/README.md), [UML](uml/README.md), modulecontract | Een korte contributieroute: lokaal starten, relevante checks, module toevoegen, documentatie bijwerken; niet beginnen met alle historische besluiten. |
| Toekomstige instrumenten | [Instrument Lab](plans/musicbrain-instrument-lab.md), [State-Graph](plans/state-graph-synthesis.md), [spinoffs](../spinoffs/README.md) | Verbindend toekomstbeeld met expliciet label onderzoek, zonder alles als aankomende productfunctie te presenteren. |

Voor aantoonbare volledigheid: onderhoud een matrix functie -> uitleg ->
voorbeeld -> simulatorstatus -> firmwarestatus -> hardwarebewijs -> versie.
Gebruik voor module-id's, controls en poorten het bestaande contract/catalogus
als bron, maar voeg menselijke gebruiksuitleg toe. Een contracttest bewijst
geen volledige gebruikersdocumentatie of identiek hoorbaar gedrag.

## Visie en toekomst

Sterk en behouden: open gereedschap, geen vendor lock-in, patches als data,
een gemeenschappelijke besturing en ontwikkelen/proberen zonder hardware.
De website maakt het oorspronkelijke muzikale probleem snel duidelijk.

Voorstel voor een bredere visieformulering, ter bevestiging door de maker:

> MusicBrain is een open platform om muzikale besturing, patches en
> instrumenten samen te brengen. Je ontwerpt en bespeelt patches in de browser,
> gebruikt gedeelde DSP op de Teensy en verbindt waar ondersteund analoge
> hardware via MIDI, CV, gates en schakelkaarten. Van een pedalboard met
> geheugen tot een polyfoon hybride instrument, zonder gesloten ecosysteem.

Daarachter passen drie duidelijk onderscheiden horizonten:

1. **Nu bruikbaar:** beschrijf gepubliceerde editor/firmware, concrete
   voorbeelden en bekende beperkingen; link naar de passende release.
2. **Volgende mijlpalen:** selecteer een kleine set uit de backlog, met
   resultaat en acceptatiecriterium, zoals betrouwbare hardware-integratie,
   verdere expressieve bediening of pariteit van ontbrekende functies.
   Dit zijn te kiezen prioriteiten, geen in deze review vastgestelde planning.
3. **Onderzoek:** Instrument Lab, analoge/hybride voice-tiles, State-Graph,
   nieuwe synthesevormen en verdere distributie over kaarten/processoren.
   Benoem de onderzoeksvraag en wat eerst bewezen moet worden.

De [publieke planning](https://musicbrain.nl/planning) toont nu zes kaarten,
vooral hardware, waaronder busboard-v2 terwijl de productpagina v3.1 toont.
Editor/DSP en de bovenstaande onderzoeksvisie zijn daarin nauwelijks zichtbaar.
De opening legt bovendien admin en time travel uit, niet de muzikale richting.

## Gewenste leesroutes

Maak eerst een kleine centrale leeswijzer, geen nieuw encyclopedisch document.
De volgende titels zijn voorstellen, nog geen bestaande documenten:

1. **Ik wil het horen:** README -> editor -> eerste patch -> opslaan ->
   instrumenten/effecten -> bekende beperkingen.
2. **Ik heb een Teensy:** README -> benodigdheden -> firmwaredownload en
   installatie -> USB-audio/MIDI -> patch/bank overzetten -> troubleshooting.
3. **Ik wil hardware bouwen:** productstatus -> passende bordenset/revisies ->
   BOM/fabricage -> veilige eerste inschakeling -> firmware -> acceptatietest.
4. **Ik wil bijdragen:** ontwikkelstart -> architectuuroverzicht -> contract
   en tests -> wijziging/module toevoegen -> gerichte ADRs en achtergrond.
5. **Ik wil weten waar dit heen gaat:** visie -> nu/straks/onderzoek ->
   themaplan -> backlog. Een backlog is naslag, niet het verhaal zelf.

De hardware-route moet voor Relay expliciet veiligheidsvoorwaarden en
geverifieerde schakelcombinaties noemen. "Any amp to any cab" is geen
verantwoorde universele belofte zonder impedantie-, vermogens- en
load/schakelvoorwaarden.

## Waardevolle aanvullingen op Musicbrain.nl

1. **Corrigeer eerst de GitHub-link en absolute claims.** Beschrijf behoud
   van een analoog pad als mogelijkheid; benoem digitale/hybride instrumenten.
2. **Voeg een duidelijke documentatie-ingang toe.** De huidige navigatie
   bevat Products, Releases, Editor, Planning, Devlog en About, maar geen Docs
   of Start. Laat website en GitHub dezelfde leesroutes gebruiken.
3. **Maak de editor een zelfstandig bruikbaar aanbod.** "Try it before it
   exists" doet de huidige browserinstrumenten tekort. Toon enkele actuele
   patches met korte geluidsfragmenten, echte screenshots en een werkende
   open-in-editor-route zodra die betrouwbaar beschikbaar is.
4. **Maak een beknopt mogelijkhedenoverzicht.** Synthese, sampling/SF2,
   effecten, externe audio/vocoder/zang, MIDI/bediening en hardwarekoppeling;
   details horen achter de categorie, niet allemaal in de hero.
5. **Publiceer een support- en statusoverzicht.** Browser/OS, Web MIDI en
   Web Serial, toestemming voor audio, lokale opslag en export, benodigdheden
   per workflow, wat al te downloaden is en wat nog niet gebouwd is.
6. **Vernieuw planning en devlog inhoudelijk.** Nu verwijst Devlog naar
   "Hello, world" met "More soon". Een verhaal over gedeelde DSP, een
   browser/Teensy-vergelijking en een hardware-benchverslag laten beter zien
   wat gebeurt. Leg het verschil tussen productrelease en softwarebuild uit.
7. **Verbind componentdetail met praktisch gebruik.** De bestaande versie-
   en releasekoppelingen zijn nuttig; voeg waar nog nodig BOM/fab/broncode,
   bijpassende firmware, bouw-/teststatus en gebruikersuitleg toe.
8. **Scherp About en productgrenzen aan.** About eindigt nu met "hardware for
   your pedalboard", te smal voor Cortex. De devlog noemt bovendien Synapse
   zonder plaats in de drie-productenindeling. Reflex noemt vooral
   controllerkenmerken; leg controller versus relais-loops duidelijk uit.
9. **Nuanceer de licentievermelding.** Eigen projectwerk is MIT; meegeleverde
   bibliotheken en assets kunnen andere voorwaarden hebben. De DX7-kern
   wordt bijvoorbeeld als Apache-2.0 beschreven in browserinstrumenten.
   Voeg third-party-verwijzingen toe; dit is geen volledige licentieaudit.

De donkere instrumentachtige huisstijl is herkenbaar en hoeft voor dit doel
niet opnieuw ontworpen te worden. De grootste winst zit in inhoud, echte
voorbeelden, navigatie en betrouwbare status, niet in meer marketingtekst.

## Aanpak en toetscriteria

| Volgorde | Afgebakende verbetering | Klaar wanneer |
|---|---|---|
| 1 | README, site-GitHub-link, kernclaims en status | Een nieuwe bezoeker begrijpt wat nu werkt en bereikt de juiste editor, broncode en download zonder historische plannen. |
| 2 | Centrale leeswijzer en drie praktische starts | Proberen, Teensy gebruiken en hardware bouwen hebben elk een complete route met benodigdheden, resultaat en teruglink. |
| 3 | Oude tekst markeren en lokale tegenstrijdigheden oplossen | Per onderwerp is duidelijk wat leidend is; beide gevonden ADR-links werken; oude statusregels staan niet meer als actuele instructie. |
| 4 | Functiematrix en modulecatalogus | Iedere publieke functie heeft uitleg, voorbeeld of expliciete beperking en een versie-/doelstatus. |
| 5 | Publieke roadmap en websitevoorbeelden | Nu, volgende mijlpalen en onderzoek zijn gescheiden; website toont actuele muziekvoorbeelden en verwijst naar dezelfde bronnen. |

Praktische acceptatietest: laat iemand zonder projectkennis vanaf GitHub een
bestaande patch laten klinken, aanpassen, exporteren en terugladen; daarna
vaststellen wat nodig is om diezelfde patch op een Teensy te proberen.
Noteer waar uitleg of een link ontbreekt. Controleer met een tweede route
of een hardwarebouwer de juiste revisie en aantoonbare teststatus kan vinden.

Onderhoudsregel: een substantiële featurewijziging is documentair pas klaar
als de actuele gebruiksuitleg/statusmatrix en relevante release-notitie
bijgewerkt zijn. Publiceer de website op basis daarvan; houd historische
releasepagina's historisch. Voeg een Markdown-linkcheck toe aan CI, maar
besef dat een werkende link nog geen actuele of begrijpelijke uitleg bewijst.