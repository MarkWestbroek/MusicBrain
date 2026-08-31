# CR-78 stemmenreconstructie — sessielog

**Datum sessie:** 8–11 augustus 2026
**Deelnemers:** Mark Westbroek ↔ Claude (Anthropic)
**Doel:** alle veertien stemmen van de Roland CR-78 (1978) ontleden uit de originele service notes, numeriek valideren tegen Rolands fabrieksafregeltabel, en vers optekenen als KiCad-project. Context: MusicBrain (analoge stemmen in hardware + digitale modellen).

**Karakter van dit document:** chronologisch logboek. Berichten van Mark staan **woordelijk** (blockquote). De antwoorden van Claude zijn samengevat met behoud van alle technische inhoud, getallen en beslissingen; tool-stappen staan tussen [haken]. Voor het byte-letterlijke transcript: gebruik de exportfunctie van claude.ai.

---

## Deel 1 — Aanloop: TR-6S, ACB en modelleringstechnieken

> **Mark:** Hoe werkt de roland tr-6s? [Roland-productekst geplakt] Met name de gedetailleerde circuitmodellen van de TR-808, TR-909, TR-606, TR-707, CR-78 vind ik interessant. Doen ze emulatie van de analoge circuits? (Ik vergeet hoe dat heet). Het is een vrij klein apparaatje, dus wat voor chip zou er op zitten?

**Claude:** De term is **ACB — Analog Circuit Behavior**. Offline component-analyse, geen runtime-SPICE. Chip niet gepubliceerd; beredeneerd: één ARM-SoC van enkele honderden MHz (4×AA / USB-bus als harde vermogensgrens; 6 ACB-stemmen ≈ tientallen MFLOPS). TR-6S t.o.v. TR-8S: zelfde silicium, stemlimiet als productdifferentiatie.

> **Mark:** Veel schema's zijn gewoon online te vinden. De cr-78, de tr-808 iig. Hoeveel werk is het om deze acb zelf te doen? Of zijn er al open source implementaties van toevallig?

**Claude:** Bestaand werk: **Kurt Werner (PhD, CCRMA)** met de 808 BD als doorlopend voorbeeld; DAFx-papers over 808 cymbal/cowbell ("circuit-bendable"); **WDR-8** (VCV Rack, WDF-modellen 808); **chowdsp_wdf** (Jatin Chowdhury, header-only C++); **RT-WDF**; Faust WDF-library; **Mutable Instruments Plaits/Peaks** (`analog_bass_drum.h` e.d., pragmatisch, Cortex-M4-klaar). Inschatting: WDF-theorie leren = weken; lineaire subcircuits daarna een avond per stuk; meerdere gekoppelde niet-lineariteiten = proefschriftniveau. FPGA-waarschuwing: Newton-Raphson per sample pipelinet slecht → LUT's of host-model → goedkoper equivalent. Route: ngspice als ground truth → C++ double → valideren → fixed-point/FPGA.

> **Mark:** Wat is WDF?

**Claude:** **Wave Digital Filters** (Fettweis, jaren '70). Golfvariabelen a = v+Ri, b = v−Ri met vrij te kiezen poortweerstand; C wordt unit delay, L een negatieve delay, adaptoren breken delay-free loops. Behoudt passiviteit → onvoorwaardelijk stabiel, weinig bits nodig. Beperkingen: klassiek alleen serie/parallel (Werner's R-type adaptoren voor bijv. bridged-T), meerdere niet-lineariteiten → iteratieve solver. TPT = blokschema-aanpak, WDF = netlist-aanpak.

> **Mark:** maar om de oude analoge drumcomputers zo goed mogelijk na te bootsen, zonder dode samples: welke methode is dan het meest efficient? Wat zou Roland gebruiken? Is dat bekend?

**Claude:** Technisch niets gepubliceerd (ACB is een merknaam; Roland meldt zelf samenwerking met de originele engineers omdat pure schema-analyse niet volstond — een bekentenis dat het geen letterlijke simulatie is). Rangorde efficiëntie: (1) **closed-form structured models** — drumstem = trigger→pulsvormer→resonator→envelope→filter, knop→coëfficiënt als tabel, ±20–30 multiplies/sample, FPGA-vriendelijk; (2) nodal DK; (3) WDF; (4) neurale black-box; (5) volledige SPICE (alleen offline/ground truth). Gok Roland: nr. 1 + kalibratie (toleranties, trigger-crosstalk, rail-interacties).

> **Mark:** Korg doet ook iets dergelijks in de softsynths van de MS-20 e.d. toch?

**Claude:** Ja: **CMT (Component Modeling Technology)**, Legacy Collection 2004 — tien jaar vóór ACB. Gordon Reid (Sound On Sound 2004) betwijfelde de component-voor-component-claim al: realtime componentniveau was op een G4/P4 met 32 stemmen onmogelijk. Familie van merknamen: Arturia TAE (~2003), Korg CMT (2004), Roland ACB (2014) — zelfde engineeringpraktijk. Verschil zit in behouden niet-lineariteit (oversampling) en kalibratie.

> **Mark:** Interessant. Het zijn inderdaad technieken op oude computers. Dat geeft de burger moed. Bij de 808: is er nog zoiets als ander gedrag bij hertriggeren? Condensatoren die nog niet helemaal leeg zijn enz., zodat de tweede trigger misschien iets luider is? Daarna de stroomversie van 'sympathetic resonance'... Vermogensuitputting. Zou je dat kunnen meten uit een echte 808, of uit de TR-6S of 8S? Iemand op reddit wil de 6S reverse engineeren om de firmware aan te passen. Ik zou liever gewoon de sounds zelf kunnen maken. In MusicBrain wil ik de echte analoge stemmen bouwen (hardware), maar een digitale versie kan ook praktisch zijn. Ook boeiend om het verschil te analyseren.

**Claude:** Drie hertrigger-mechanismen: (1) **resonator-state summing** — bridged-T telt nieuwe puls fase-afhankelijk op bij bestaande toestand (in digitaal model: filterstate níet resetten, excitatie optellen — grootste "geen sample"-effect); (2) **envelope-cap**: diode-geklemd = niet luider, lading-injectie = wél; (3) **vrijlopende oscillatoren** (808 hihat: zes blokgolven lopen door, VCA poort alleen — geen machinegeweer-effect). Correctie op eerdere suggestie: 808 heeft nette voeding; het echte uitputtingsmechanisme is de **accentbus** (meer stemmen tegelijk → zwakker accent per stem). Meetplan TR-6S/8S via USB-audio: IOI-sweep 20 ms–2 s (bit-identiek = state gereset), micro-timing offsets (fase), 200× hihat (spectrumvariatie). Juridisch: model fitten op TR-6S-output = afleiden van Rolands werk; afleiden uit het originele 808-schema = schoon (topologie geen software, octrooien verlopen). Beste pad: eigen analoge stemmen bouwen → eigen meetrig → digitale modellen fitten op eigen circuit → drie datasets (analoog / digitaal / TR-6S) met identieke methodiek.

---

## Deel 2 — De WGD/Westbroek CR-78 snare-module

> **Mark:** cool. Nog wel even de stemmen bouwen :-) Ik heb trouwens een CR-78 snare gebouwd. Met wat extra potmeters, meen ik. https://github.com/wgd-modular/snare

**Claude:** [repo 404; ModularGrid bevestigt: WGD Modular snare, gebaseerd op de CR-78, i.s.m. Mark Westbroek, discontinued/DIY]. Extra pots = fysiek uitgebrachte "circuit-bendability" → validatie over een parameterruimte i.p.v. één punt. Meetplan: statische fit op detent-standen, hertriggergedrag, LTspice naast meting.

> **Mark:** [upload pcb.zip] het schema van de snare

**Claude:** [KiCad 6-bestand geparsed, netlist gereconstrueerd: 7× BC549, TL072, 4 dioden, 21 C, 35 R, 4 pots, 2 trimmers; 0 zwevende pinnen. Signaalstroomdiagram gemaakt.] Bevindingen:
- **Ruisbron:** Q1 open collector, basis aan massa, emitter via 1M aan +12 V — omgekeerd voorgespannen BE-junctie in doorslag. Q2 versterkt; RV1 = collectorbelasting én niveautap.
- **Mixpot-truc:** loper aan massa, signalen op pin 1 en 3 → passieve crossfade zonder opamp.
- **RV_FILTER:** duo-20k als beide serieweerstanden van een Sallen-Key LP om U1A (C7=C8=22n), cutoff ~362 Hz–7 kHz.
- **Resonator Q6** (bridged-T, eigenwaarde-analyse, β=400, Ic≈1,6 mA):

| RV_TUNE | f₀ | τ | Q | −60 dB |
|---|---|---|---|---|
| 0 | 345 Hz | 2,4 ms | 2,6 | 17 ms |
| 2k5 | 203 Hz | 13 ms | 8,2 | 89 ms |
| 5k | 164 Hz | 26 ms | 13,4 | 180 ms |
| 10k | 131 Hz | 33 ms | 13,4 | 226 ms |
| 20k | 106 Hz | 21 ms | 7,1 | 147 ms |

TUNE verandert dus toonhoogte én decay gekoppeld (Q piekt rond 5–10k). Polen links van de as: gepingde resonator, geen oscillator; bij hogere β dichter bij de rand → transistorselectie-gevoelig.
- **Hertriggeren, per blok:** Q6-caps houden lading → fase-afhankelijk optellen; C14-envelope diode-geklemd → tweede hit níet luider; Q1-ruis vrijlopend; C2/R2 ingang τ=1 ms = enige uitputting; +10V-referentie (RV2-deler, geen bypass) zakt in tijdens hit maar herstelt direct.

---

## Deel 3 — CR-78 bronnen en service notes

> **Mark:** Zou je de andere CR-78 stemmen ook online kunnen vinden?

**Claude:** Synthfool (schematics-PDF + service notes 20 juni 1979), archive.org-mirror, vintagesynthparts, ModWiggler-draad. Veertien stemmen. Waarschuwingen uit de DIY-hoek: triggerpolariteit omgekeerd (rust hoog ~10 V, dipt naar 0), metallic beat = drie blokgolven + spoelfilter, trigger-bleed als struikelblok bij BD/LC/bongo's.

> **Mark:** kun jij bijv. de bassdrum en hihat schema's naar kicad omzetten?

**Claude:** [Synthfool-PDF gefetcht: pure scan, geen tekstlaag; sandbox kan synthfool niet bereiken.] Voorstel: upload de PDF; volgorde SPICE-netlist eerst (falsifieerbaar), verdachte waarden gemarkeerd, dán pas KiCad. Waarschuwing: waarden aflezen van een scan uit '79 is waar ik stilzwijgend fout ga.

> **Mark:** [uploads: schematics-PDF + service notes-PDF] Kun je dit wel zien: [Google Drive-link] Of florian-anwander.de? Ook interessant: baratatronix.com KR-55 cymbal/hi-hat/cowbell synthesis.

**Claude:** Drive: nee (inlogscherm). Anwander: ja — CR-78-pagina is DIN-sync + WS-1, wel 808-schema's en Roland-filteroverzicht; verwijst naar synfo.nl. Baratatronix: ja, en zeer relevant — de "swing-type" VCA (Roland-metaalstemmen, door Korg gekopieerd in de KR-55) en HPF-als-sound-design. Uploads: schematics-PDF onbruikbaar (72 ppi), **service notes 400 ppi / 6614×4672 px** — bevat dezelfde voicing-pagina, kraakhelder bij croppen. **Pagina 15, de afregeltabel = validatiedataset:**

| Stem | Periode | Frequentie | Decay | Amplitude |
|---|---|---|---|---|
| BD | 16 ms | 62,5 Hz | 100 ms | 0,4 Vpp |
| SD | 3,0 ms | 340 Hz (drum) | 60 ms | 0,4 |
| RS | 0,67 ms | 1480 Hz | 5 ms | 0,8 |
| HH | — | — | 60 ms | 0,4 |
| CY | — | — | 350 ms | 0,4 |
| M | — | — | 20 ms | 0,4 |
| Claves | 0,38 ms | 2630 Hz | 18 ms | 0,15 |
| HB / LB / LC | 1,66 / 2,5 / 4,8 ms | 600 / 400 / 208 Hz | 40 / 40 / 150 ms | 0,15–0,3 |
| CB H/L | 1,25 / 1,8 ms | 800 / 555 Hz | 60 ms | 0,2 |
| Tb | — | — | 220 ms | 0,25 |
| GU H/L | 8,0 / 13,0 ms | 125 / 77 Hz | — | 0,3 |
| MB H/M/L | 0,162 / 0,178 / 0,245 ms | 6170 / 5620 / 4080 Hz | 50 ms | 0,35 |

(Twee scancijfers gecorrigeerd via reciprook-check: RS "6,67"→0,67; claves "0,43"→0,38.) Direct gesignaleerde discrepantie: CR-78 SD-spec 340 Hz/60 ms vs. WGD-module (340 Hz alleen bij TUNE=0, decay daar ~17 ms).

---

## Deel 4 — Transcriptie en validatie per stem

> **Mark:** ja, graag [begin met bassdrum en hi-hat]

**Bass drum (en de twin-T familie).** Eerste transcriptie simuleerde 85–105 Hz i.p.v. 62,5 → als FOUT gerapporteerd. Cross-check over de vier verwante stemmen gaf een consistente **factor ~2** (HB 2,12 / LB 1,84 / LC 1,99 / BD 2,02) → condensatoren correct (schalen mee), structurele fout in het weerstandsdeel.

> **Mark:** [leest mee op crops] 1: vr57 gaat via 10k naar de massa, en nergens anders heen. vr55 zie ik niet, wel 53, gelijksoortig via alleen een 10k r naar massa. 2: shunt r = R656, lees ik. Het staat ver naar links, tegen de VR57 aan. 3: alle VRs zijn boven en onder aangesloten en de regelaar is loos — symbool voor variabele weerstand; meestal sluit je loper en 1 einde kort, toch? 4: C585 loopt boven de andere c's heen naar de collector. Er zit nog een weerstand tussen C en B, denk ik.

**Claude:** Dat loste het op: R635 (10k) zit in serie met VR57 op knooppunt n1; knooppunt P heeft géén eigen shunt. Gevalideerd: HB 661 (spec 600), LB 391 (400), LC 212 (208), BD 65,5 Hz (62,5) — binnen 2–10 %. Omgekeerd oplossen gaf shunts 14,5–17,6 k, precies rond de gelezen 15k. **Decay-vondst:** VR58 = 500 Ω emitterdegeneratie = lusversterking; onder ~200 Ω zelfoscillatie; fabrieks-100 ms zit vlak onder de drempel → verklaart exemplaarverschillen en de trimmer-per-stem. Digitaal model: decay = reële deel van het poolpaar, niet een opgeplakte envelope; gevoeligste plek in fixed-point.

**Hi-hat / cymbal / maracas (ruisgroep).** HH-envelope: C525 (.018) × R537 (1,5M) = 27 ms τ → 62 ms (−20 dB) vs spec 60 ms. Zelfde bouwblok als de ruis-envelope in de WGD-snare (diode-geklemd → hertrigger stapelt niet). Cymbal: **L3 45 mH ∥ C521 .0068 = 9,1 kHz tank** (Coil no.30, 022-030).

> **Mark:** [screenshot + leeswerk] 1: de lijn vanaf R530 kruist tussen R537 en C528 en gaat naar de uitgang van het blokje M. Gelijkvormig aan HH, andere waarden. 2: duidelijk 4,7M.

**Claude:** [NOISE-blok gevolgd: Q533 → C602 .01 → R564 100k → Q525 → vier trimmers VR60–63 "50K(B)×4".] **Architectuurvondst, bevestigd door de tabelopmerking "Adjusting VR60 on any one VOICE makes all":** CY, HH en M delen één ruisbron, één trimmer (VR60), één sommeerbus, één VCA en één 9,1 kHz-tank; onderling verschil is uitsluitend de envelope (CY tweetraps .0082/470k + .12/4,7M; HH 62 ms; M .0082×1M = 19 ms vs spec 20). VR61→SD, VR62→Tb, VR63→GU. M = maracas (legenda p.14). Consequentie digitaal model: één ruisstem, drie envelope-presets; gedeelde ruis = gecorreleerde stemmen (hoorbaar anders dan zes onafhankelijke generatoren).

> **Mark:** cool! dus 6 + snaar + de 6 overige. Wil je naar die overige 6 kijken? [...] Behringer heeft de RD-78 al gemaakt. Hoe vinden mensen deze vergeleken met het origineel?

**Claude:** RD-78 (feb 2025, $199): geluid goed ontvangen, plastic bekritiseerd; specifieke klacht: guiro tot één geluid gereduceerd (origineel heeft twee schraapsnelheden — zie GU H/L in de tabel); firmware 1.0.16 verbeterde guiro/patronen. **De zes:**
- **Rim shot:** volledig passief — L2 700 mH ∥ (.015+.0015) = **1481 Hz vs spec 1480 (0,07 %)**.
- **Claves:** idem — L1 700 mH ∥ .0047 = 2775 Hz vs 2630 (+5,5 %). Spoel = Coil no.33 (700 mH, "3R").
- **Guiro:** astabiele multivibrator Q520/Q521, C .068: 82k → 7,7 ms/130 Hz (spec 8,0/125); 82k+56k → 12,9 ms/77 Hz (spec 13,0/77). Twee schraapsnelheden = twee weerstanden.
- **Tamboerijn:** twee OR-triggers, dubbel decay-pad (270k snel / 820k traag), C536 .056 × 2,2M = 123 ms τ → 283 ms (spec 220); uitgang Q509 met L5 ("Coil no.31, 1R" — inductantie NIET in de onderdelenlijst).
- **Metallic beat:** drie CMOS-ringoscillatoren op IC501 (MC14069), pinparen 5-6/9-8, 1-2/3-4, 13-12/11-10; VR64/65/66 + 47k, C .0015/.0018/.0022, 39k terugkoppeling, 470k naar mix, R581 10k (met de hand gecorrigeerd van 27k op de scan); daarna L6/L7 45 mH tanks.
- **Cowbell:** géén twee losse oscillatoren maar dezelfde astabiele multivibrator (Q529/Q530, C556/C557 .01), VR68 100k + 2,2k: ~90k→800 Hz, ~130k→555 Hz; draait op **+5 V**. Envelope: Q527-inverter → C547 .027 → D525 → Q528 → D526 → C548 .022 ∥ C549 .018 → 1,5M/100k.

**Snare (origineel).** Drumcomponent = drie-caps twin-T om Q505 (C509/C510 .01, C511 .0056), zelfde familie; toewijzing R516 15k serie / R517 68k shunt / R518 15k op n1 (naar analogie BD) geeft **367 Hz vs spec 340 (+8 %)**; emitter direct aan massa (geen decay-trim — tabel: "non-adjustable"). Ruiscomponent = HH-bouwblok: C514 .018 × R511 1,5M = 62 ms vs spec 60. Ruisfilter = RC (R514 2,7k ∥ C516 .0056, ~10,5 kHz) i.p.v. LC-tank → droger karakter. De 60 ms-spec slaat op de ruis; de drum-thud is ~7 ms. Fabriekscorrectie op de scan: **C513 250p → .022, R521 33k doorgestreept** (variant per serienummer).

**De vier primitieven (het hele apparaat):**
1. Twin-T-resonator met transistor-terugkoppeling — BD, HB, LB, LC (tune-trim in netwerk, decay-trim in emitter)
2. Passieve gepingde LC-tank (700 mH) — RS, Claves
3. Ruis + envelope gesommeerd in transistor ("swing VCA"), gedeelde bron/tank — CY, HH, M, (SD)
4. Oscillator gepoort door envelope, uitgang via 45 mH-tank — CB, GU, MB, Tb

Elk met dezelfde trigger-frontend: differentiatiecondensator, 270k naar massa, stuurdiode, serieweerstand, normaal-aan transistor met 820k bias.

---

## Deel 5 — Vragen en antwoorden (Marks leeswerk aan de scan)

> **Mark:** eens: C584 staat er 2x. Hernoemen bas-C OK. — [BD-uitgang wijkt af] dat zie ik ook. het zal een reden hebben, niet? — [diodes] nee, ze staan allemaal hetzelfde. C en RS ook naar links. Nergens zie ik iets anders.

> **Mark:** over de BD R's: er staat toch echt 27k en 18k. Als er ergens een punt staat, is die duidelijk, en is er ook meer ruimte tussen de cijfers. Dat is hier niet.

**Vastgelegde besluiten uit dit leeswerk:**
1. **Triggerpolariteit machinebreed negatief-gaand** (rust hoog, dip naar 0): alle stuurdiodes kathode naar de ingang. Claves/RS-lezing van Claude was fout; alle bladen consistent geregenereerd via één schakelaar (`TRIGGER = 'negative'` in sch_gen.py).
2. **C584-duplicaat** in Rolands eigen tekening (BD-ingang .027 én LC-uitgang .01). Oplossing: BD-ingang hernummerd naar **C594**, gedocumenteerd.
3. **VR-tekenconventie:** beide baaneinden bedraad, loper los = "variabele weerstand"; in de praktijk loper aan één einde solderen. Als rheostat gemodelleerd.
4. **R656** = de 15k-shunt op het tweede twin-T-knooppunt (designator buiten de R631–R641-reeks; op de tekening ver naar links geplaatst).
5. **BD-uitgang 10k/18k bevestigd.** Verklaring: BD voedt de BALANCE-potmeter (50 kΩ, 029-411; tabelopmerkingen "W BALANCE set to the lowest" bij BD, "highest" bij HH) → lage bronimpedantie nodig. **Onopgelost:** C589 .027 met 18k geeft een HPF-knik ~900 Hz die een 62,5 Hz-stem zou wegsnijden → er zit nog een leesfout in dit uitgangsnetwerk. Simulatie zal het tonen.
6. **VR60–63 fysiek:** op de VG-11A-print (layout p.12, afregelprocedure p.15); vier rheostats met gedeelde onderrail (ruisknoop), elk naar een eigen bestemming.

---

## Deel 6 — KiCad-generator en projectopbouw

Aanpak (voorstel Mark: origineel als indeling; uitkomst: berekende layout per stemfamilie):
- **sch_gen.py**: schrijft KiCad 6 `.kicad_sch`; symbooldefinities (R, C, D, GND, BC549, ±12V→±15V/+5V) letterlijk overgenomen uit Marks snare-project (garantie op pin-geometrie); Device:L, CR78:INV (hex-invertergate) en CR78:BA662/OPAMP handgeschreven; junctions automatisch bij ≥3 samenvallende draadeinden; centrale polariteitsschakelaar.
- **Verificatielus**: elk gegenereerd bestand wordt met dezelfde parser (ontwikkeld op Marks snare) teruggelezen tot netlist en vergeleken met de bedoelde netlist. Deze lus ving reële fouten: omgekeerde diode (rim shot v1), terugkoppeldraad dwars door het emitterbeen (twin-T), busbenen zonder junction (ruisgroep), kruiskoppeling door pinnen (astable), timingretour door potmeterpinnen (MB), collectorverbinding door emitterpin (Tb), CV-draad door weerstandpin (mix). Alle bladen eindigen op "unconnected pins: 0".
- **Ladder-layout** voor RS/claves (één regel per component, 's'/'p'); **twin-T-routine** één keer geschreven, vier keer geïnstantieerd; ruisgroep met gesegmenteerde bus; astable-routine gedeeld door CB en GU; ringoscillator ×3 voor MB.
- **Projectstructuur**: `cr78_top.kicad_pro/.kicad_sch` (A3, 13 bladblokken) → 4× twin-T, 2× LC-ping, ruisgroep, snare, cowbell, guiro, metallic beat, tamboerijn, mix/VCA/output. Cross-sheet global labels: `*_TRIG`, `*_OUT`, `SD_NOISE`, `TB_NOISE`, `GU_NOISE`, `ACCENT_CV`, `MIX_BUS`, `HIGH_OUT`, `LOW_OUT`. GL-9 (µPD8048-computer) bewust buiten scope — in MusicBrain een module met controls/poorten.
- **VG-11-inventaris buiten de stemmen**: ruisgenerator (✓), sommering + BALANCE, BA662 hoofd-VCA (accent/fade; obsolete — kloonwereld: LM13700 of discreet), uitgangstrap High/Low (220k / 10k, 3,5 / 5,5 Vpp), 2× sound killer, voeding (T1, W02, 78M15/78M05/78L05), ADD VOICE-schuiven VR20–22.

---

## Deel 7 — Openstaande punten (checklist voor de A2-print)

1. Snare: toewijzing R516/R517/R518 aan de knooppunten (afgeleid + rekensom, niet ondubbelzinnig gelezen)
2. BD-uitgang: C589/R640/R641 vs de 62,5 Hz (HPF-conflict, zie Deel 5.5)
3. Cymbal: L3 naar +15 V of naar massa
4. Tamboerijn: **L5-inductantie** (parts list geeft alleen "no.31, 1R"); rol van R555
5. Metallic beat: gating + L6/L7-uitgangsketen achter de mix nog niet getekend
6. Cowbell: rol R678 150k / R679 2,7k rond Q529
7. Mix/output-blad is het minst letterlijke: sound killers weggelaten, BA662/4558 generieke blokken
8. Footprints ontbreken; transistorsymbolen gebruiken BC549-pinout (2SC900/2SC1815 = Japanse volgorde — relevant zodra er een PCB komt)
9. Fabriekscorrecties per serienummer: C513 250p↔.022, R521 33k
10. Elke stem één keer naast de scan leggen vóór publicatie (alleen BD volledig door vier ogen)

**Printadvies:** service notes p.13 (voicing) op **A2 = ware grootte** (400 ppi-scan); p.11 (logic, triggerbus) op A3 erbij.

**Publicatie:** tekening-1979 = auteursrecht Roland, niet mee-uploaden; topologie + waarden = functioneel ontwerp, vers getekend schema publiceerbaar (gangbare praktijk 808-klonen; geen juridisch advies). Onderscheidend t.o.v. bestaand materiaal: de **validatieketen** scan → netlist → eigenwaarden → fabriekstabel → KiCad → netlist-terugcontrole.

---

## Bijlage — bestandsinventaris

**KiCad-project** (in `cr78_kicad_project.zip`, alle 16 gecontroleerd byte-identiek aan laatste versies): `cr78_top.kicad_pro`, `cr78_top.kicad_sch`, `cr78_bd/hb/lb/lc.kicad_sch`, `cr78_rimshot.kicad_sch`, `cr78_claves.kicad_sch`, `cr78_noise_group.kicad_sch`, `cr78_snare.kicad_sch`, `cr78_cowbell.kicad_sch`, `cr78_guiro.kicad_sch`, `cr78_metallic_beat.kicad_sch`, `cr78_tambourine.kicad_sch`, `cr78_mix_output.kicad_sch`, `mk_mix_top.py`.

**Generatoren/analyse** (buiten die zip): `sch_gen.py`, `mk_twint.py`, `mk_lc_voices.py`, `mk_noise_group.py`, `mk_snare.py`, `mk_osc_voices.py`, `mk_last_voices.py`, `cr78_bd_eigenvalue_check.py`.

**SPICE-netlists met aantekeningen:** `cr78_bd.cir` (gevalideerd, 4 stemmen), `cr78_hh.cir`, `cr78_cy_hh_m.cir` (architectuur + validaties), `cr78_remaining_voices.cir` (6 stemmen + de vier primitieven).

**Crops uit de service notes:** `cr78_bd_schematic.png`, `cr78_cy_hh_schematic.png`, `q_bd_twinT.png`, `q_lc_twinT.png`, `q_hh_noise_node.png`, `q1_L5_tamboerijn.png`, `q2_cowbell_oscillatoren.png`, `q3_trigger_instrmnt.png`.

*Einde sessielog.*
