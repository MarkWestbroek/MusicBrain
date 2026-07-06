# MusicBrain — Merk- & positioneringsplan

> Sessie 2026-07-06. Doel: MusicBrain neerzetten als productfamilie en merk,
> bekeken vanuit zes rollen. Leidt tot websitecopy ([website-copy.md](website-copy.md)),
> social one-pager ([one-pager.md](one-pager.md)), website-requirements
> ([website-requirements.md](website-requirements.md)) en een design-brief
> ([design-brief.md](design-brief.md)).

---

## 1. Wat is MusicBrain? (feitelijke basis)

Eén gedeeld firmware + editor-platform (C++17 core, React/TS editor, MIT-licentie)
met drie concrete producten en een ecosysteem eromheen:

| Onderdeel | Wat het is | Status (juli 2026) |
|---|---|---|
| Modular brain | Polyfone modulaire synth-controller/router/patch-saver (Teensy 4.1) met CV/gate-breakouts, MI-ports (Rings, Plaits), eigen filters (MS-20/Korg35), audio-modules | fw 0.5.x, werkend op hardware |
| Effect switcher | Relay-gebaseerde pedalboard-switcher, MIDI PC + footswitch, WiFi-configuratie (ESP32) | Werkend prototype |
| Amp/speaker switcher | Pre-amp → power-amp → speaker routing via relays | Ontwerp/scaffold |
| Editor | Browser-based patch-editor met live scope, WebSerial/WebSocket, drag-&-drop patcher | Actief in gebruik |
| Breakouts | CV-out, CV-in, gate/trigger, bus-bridge (SPI/CAN-FD); AD5754-DAC-breakout PCB's | PCB's in ontwerp |
| Simulator | Host-side closed-loop simulatie (MIDI → router → virtuele DAC → scope) | Werkend |

**Kernwaarheid van het merk:** één brein, drie lichamen. Dezelfde core stuurt
een pedalboard, een amp-rack en een polyfoon modulair systeem aan. Alles is
open source, alles is te editen vanuit de browser, alles is te simuleren
zonder hardware.

---

## 2. Zes rollen, zes perspectieven

### 2.1 Marketingmanager

- **Positionering:** "The open brain for your analog rig." MusicBrain is geen
  zoveelste Eurorack-module of pedalboard-switcher; het is een *platform* dat
  het analoge domein (pedalen, amps, CV) programmeerbaar, opslaanbaar en
  polyfoon maakt — zonder het analoge geluidspad aan te tasten.
- **Belangrijkste differentiator vs. concurrentie** (Boss ES-8, Morningstar,
  GigRig — switchers; Expert Sleepers, Ornament & Crime, Nerdseq — CV):
  1. Eén platform over drie productcategorieën heen (niemand doet dat).
  2. Volledig open source (MIT) — geen vendor lock-in, community-uitbreidbaar.
  3. Browser-editor + hardware-loze simulator — proberen vóór je iets bouwt/koopt.
  4. Patch-opslag voor modulair: "save & recall your modular patch" is een
     bekende heilige graal in Eurorack.
- **Fase-bewust communiceren:** we zijn pre-1.0. Geen retailclaims doen; de
  boodschap nu is "bouw mee / probeer de simulator / volg de reis". Eerlijkheid
  over status is bij de DIY/Eurorack-doelgroep juist een pré.
- **Funnel:** ontdekking via ModWiggler, Reddit (r/modular, r/synthdiy,
  r/guitarpedals), YouTube-demo's, Superbooth-achtige events → website →
  GitHub/Discord → nieuwsbrief → (later) kits/hardware kopen.

### 2.2 Productmanager

- **Merkarchitectuur — branded house.** Eén merk (MusicBrain), producten als
  benoemde familieleden. Neurale metafoor als naamgevingssysteem:

  | Productnaam (voorstel) | Onderdeel | Waarom |
  |---|---|---|
  | **MusicBrain Cortex** | Polyfone modular brain | Het denkende centrum |
  | **MusicBrain Reflex** | Effect-switcher | Reflexen = razendsnel schakelen, on stage |
  | **MusicBrain Relay** | Amp/speaker-switcher | Letterlijk relays; neuraal relay-station |
  | **MusicBrain Synapse** | CV/gate-breakouts | Het contactpunt digitaal ↔ analoog |
  | **MusicBrain Axon** | Bus/bridge (CAN-FD/RS-485) | Axonen = signaal over lange afstand |
  | **MusicBrain Editor** | Browser-editor | Functioneel, geen metafoor nodig |

  Alternatief (afgewezen maar genoteerd): puur functionele namen
  (MB Switch, MB Route, MB Poly). Minder onderscheidend, minder merkgevoel.
- **Portfolio-volgorde:** Reflex eerst als instapproduct (laag risico, grote
  doelgroep gitaristen, laag prijspunt), Cortex als vlaggenschip/haloproduct,
  Relay als nichevervolg. Synapse/Axon verkopen mee met Cortex.
- **Verdienmodel bij MIT-licentie:** hardware (kits + assembled), panels/PCB's,
  eventueel gehoste diensten (patch-cloud) later. Software gratis houden —
  dat ís het merk.
- **Roadmap-communicatie:** publieke roadmap op de site, gevoed door
  BACKLOG.md/RELEASE-LOG.md. Onderbeloven, overleveren.

### 2.3 Productontwikkelaar / ontwerper

- **Designprincipes die het merk moeten dragen:**
  1. *Het analoge pad is heilig* — wij schakelen en sturen, we kleuren nooit
     het audiosignaal. Dit is een technisch feit én een merkbelofte.
  2. *Alles heeft een geheugen* — elke stand, elke patch, elke routing is
     opslaanbaar en terughaalbaar.
  3. *Zichtbaar op het podium, begrijpelijk in de studio* — hardware-UI is
     minimaal en stage-proof; de diepte zit in de browser-editor.
  4. *Simuleer eerst* — elk product werkt ook zonder hardware.
- **Consequentie voor industrieel ontwerp:** familie-uiterlijk over drie heel
  verschillende vormfactoren (pedalboard-doos, 19"-rack, Eurorack-module).
  Bindmiddel: kleur/typografie/logo-plaatsing, niet vorm. Zie design-brief.

### 2.4 Developer

- **Open source is een kanaal, geen bijzaak.** GitHub-repo is een etalage:
  goede README met GIF/demo, CONTRIBUTING, good-first-issues, architectuur-
  docs (die zijn er al — ADR's zijn een sterk signaal van volwassenheid).
- **Developer-verhaal voor de site:** "Hackable by design" — C++17 core die
  op je laptop compileert, 50+ unit tests, host-simulator, gedocumenteerde
  wire-protocollen (JSON-RPC, CBOR-patches, SPI-frames). Module-SDK-verhaal:
  eigen audio/CV-modules schrijven voor Cortex (zoals de MI-ports laten zien).
- **Wat developers nodig hebben op de site:** docs-sectie (of link naar
  GitHub-docs), changelog/releases (automatisch uit repo), duidelijke
  licentie-info, Discord/Discussions-link.

### 2.5 Gebruiker

Drie persona's, drie boodschappen:

- **De gigende gitarist (Reflex).** Pijn: kabelspaghetti, tap-dansen op
  pedalen, ruis. Boodschap: "One tap. Your whole board changes. Silently."
  Wil: betrouwbaarheid op het podium, leesbaar display in fel/donker licht,
  configureren vanaf de telefoon in het oefenhok.
- **De modulaire synthesist (Cortex + Synapse).** Pijn: patches zijn
  vluchtig, polyfonie is in modulair vrijwel onbetaalbaar/onmogelijk.
  Boodschap: "Save your patch. Play it polyphonic. Keep your analog sound."
  Wil: lage latency (≤ 5 ms), 1V/oct die klopt (kalibratie!), geen digitale
  kleuring van audio.
- **De studio-eigenaar (Relay).** Pijn: amps/speakers omprikken kost tijd en
  geeft plofjes. Boodschap: "Every amp, every cab, one click from your desk."
- **Gemeenschappelijke gebruikerszorg:** "wat als de maker ermee stopt?" →
  open source is het antwoord; maak dat expliciet ("Your rig will never be
  orphaned").

### 2.6 Wederverkoper

- **Relevante kanalen:** Eurorack-speciaalzaken (bijv. Schneidersladen,
  Signal Sounds, Patchwerks), pedal-boutiques, Thomann (later), DIY-shops
  (Thonk, Modular Addict) voor kits/PCB+panel.
- **Wat een reseller nodig heeft:** duidelijke marge (30–40% gangbaar),
  demo-units, één A4/productkaart per product met specs en doelgroep,
  productfoto's op wit + lifestyle, EAN/SKU's, CE/verpakking geregeld,
  dropship-optie voor kits, en een supportbelofte ("wij doen eindgebruiker-
  support, jij hoeft alleen te verkopen").
- **Voor nu (pre-1.0):** resellers nog niet actief benaderen; wel de
  productkaarten en het B2B-gedeelte van de site alvast ontwerpen, en een
  "dealer interest"-formulier opnemen om vroege interesse te vangen.

---

## 3. Merkfundament

- **Merkessentie:** *Geheugen voor je analoge rig.*
- **Belofte:** MusicBrain maakt analoge setups programmeerbaar, opslaanbaar
  en polyfoon — zonder ooit je geluid aan te raken.
- **Persoonlijkheid:** nuchter-slim, open, muzikant-eerst, een tikje nerdy
  maar nooit ontoegankelijk. Nederlandse no-nonsense engineering.
- **Tagline (hoofdvoorstel):** **"The open brain for your analog rig."**
  - Alternatieven: "Total recall for analog." / "Your rig, remembered." /
    "Analog sound. Digital brain."
- **Tone of voice:** kort, concreet, technisch eerlijk. Specificaties zijn
  marketing (≤ 5 ms latency, 16-bit pitch-CV, MIT-licentie). Geen superlatieven
  zonder getal erachter. Engels als hoofdtaal (internationale markt), NL als
  tweede.

---

## 4. Positioneringsstatements per product

- **Cortex** — Voor modulaire synthesisten die polyfonie en patch-recall
  willen zonder hun analoge klank op te geven, is Cortex de open-source
  brain die MIDI en CV's routeert, patches opslaat en tot 16 stemmen
  alloceert — met ≤ 5 ms latency en zonder één sample audio te digitaliseren.
- **Reflex** — Voor gitaristen met een groeiend pedalboard is Reflex de
  stille, programmeerbare relay-switcher die je hele board in één tap
  omschakelt en die je vanuit de browser (of via WiFi vanaf je telefoon)
  configureert.
- **Relay** — Voor studio's en amp-verzamelaars is Relay de schakelmatrix
  die elke pre-amp, power-amp en speaker met één klik verbindt — puur
  relaygeschakeld, dus zonder actieve elektronica in je signaalpad.
- **Synapse & Axon** — De bouwstenen die Cortex-brein en analoge wereld
  verbinden: nauwkeurige CV/gate-I/O per case, en een bus die cases
  koppelt tot één instrument.
- **Editor & Simulator** — Gratis, browser-based, werkt ook zonder hardware.
  Het laagdrempelige begin van elke MusicBrain-reis.

---

## 5. Communicatieplan (fase-gebonden)

### Fase 0 — nu → fw 1.0 ("build in the open")
- Website live met: verhaal, producten (als "in development"), releases-feed,
  simulator-download/demo, GitHub/Discord-links, nieuwsbrief-signup.
- Maandelijks devlog-bericht (site + hergebruik als LinkedIn/Insta-post).
- 2–3 korte demo-video's: (1) patch-recall op echt modulair systeem,
  (2) Reflex on stage, (3) editor + scope in de browser.
- One-pager (zie [one-pager.md](one-pager.md)) delen op ModWiggler,
  r/synthdiy, lines (llllllll.co).

### Fase 1 — bèta-hardware
- 10–20 bètatesters werven via de community; hun bevindingen publiek maken.
- Productkaarten/A4's definitief; eerste dealer-gesprekken.

### Fase 2 — launch
- Launch-event/video, Superbooth-aanwezigheid overwegen, press-kit
  (foto's, logo-pack, specs) op de site, reviews regelen (Sonicstate,
  Loopop, mylarmelodies — Cortex; JHS/That Pedal Show-sfeer — Reflex).

### Meetlat
- Fase 0: nieuwsbrief-inschrijvingen, GitHub-stars, Discord-leden,
  simulator-downloads.
- Fase 1+: bèta-aanmeldingen, pre-orders, dealer-interesse.

---

## 6. Besluiten die nog open staan (voor Mark)

1. **Naamgeving:** akkoord met Cortex/Reflex/Relay/Synapse/Axon, of liever
   functionele namen? (Check t.z.t. ook merkregistratie/collisies — "Cortex"
   wordt veel gebruikt, o.a. NDSP Quad Cortex! → mogelijk alternatief voor
   het vlaggenschip: **MusicBrain Poly**, **MusicBrain One** of gewoon
   **MusicBrain** als de brain zelf het merk draagt en alleen de satellieten
   namen krijgen.)
2. **Tagline-keuze** uit §3.
3. **Handelsnaam/entiteit** voor verkoop later (eenmanszaak? merknaam
   vastleggen? musicbrain.* domeinen checken — let op naamsverwarring met
   MusicBrainz, de open muziekdatabase! Dit is een reëel risico; overweeg
   domein + schrijfwijze die afstand houdt, bijv. `musicbrain.audio`,
   `musicbrain.io`, of stilering "MusicBrain" met consequent merkbeeld).
4. **Taalstrategie:** EN-first met NL-vertaling, of EN-only?
