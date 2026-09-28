# SID (MOS 6581/8580): emulatie en echte chip (verkenning 2026-09-27)

Aanleiding: de SID uit de C64 als klankbron in MusicBrain, eerst als
emulatie en daarna met de echte chips die hier liggen (tweedehands ~€40 per
stuk). Dit stuk zet beide sporen op een rij en legt vast hoe ze op elkaar
aansluiten. Kernbesluit: **één module, twee backends.** De module spreekt
SID-registers. De backend is óf onze eigen emulatie (Teensy + wasm), óf de
echte chip op een buskaart. Patch, editor en contract blijven gelijk.

## 1. De chip in het kort

- 3 stemmen. Elke stem heeft een 24-bit fase-accumulator (16-bit frequentieregister),
  golfvormen **tri / saw / pulse (12-bit PW) / noise** (23-bit LFSR), en
  combinaties daarvan (de "combined waveforms": AND-achtig, per chip anders).
- Per stem **ring-mod** (tri × MSB van de vorige stem) en **hard sync**.
- Per stem een **ADSR** met 4-bit rates, een 8-bit teller, een
  pseudo-exponentieel verval en de bekende **ADSR-bug** (de rate-teller loopt
  door bij een wissel en wacht dan tot hij omloopt, bij 15 bits tot ~33 ms).
- Eén gedeeld **multimode-filter** (LP/BP/HP, combineerbaar, 11-bit cutoff,
  4-bit resonantie); per stem kies je of die door het filter gaat.
  Plus **EXT IN**: extern audio door hetzelfde filter.
- 4-bit master volume. Op de 6581 geeft volume-writes een klik door de
  DC-offset: zo speelden C64-spellen samples ("$D418-digi's").
- Klok ~1 MHz (PAL 985 kHz, NTSC 1,023 MHz). Toonhoogte:
  `f = reg × clk / 2^24`.

**6581 vs 8580.** De 6581 (1982) is NMOS: vuil, een grote DC-offset, en een
filter met een grillige, per exemplaar verschillende cutoffcurve die bij
resonantie vervormt. Dat is het "klassieke" C64-geluid. De 8580 (1986, HMOS)
is schoner, heeft een lineairder filter en betere combined waveforms, maar
bijna geen digi-klik. Voeding: 6581 = **12 V** VDD, 8580 = **9 V** VDD, beide
5 V VCC. De filtercondensatoren verschillen ook (6581: 470 pF, 8580: 22 nF;
**datasheet nalopen bij het ontwerp**).

## 2. Spoor A: emulatie (`tp_mmb_sid`)

### Licentie: eigen kern

De bekende emulators (**reSID / reSIDfp**, ook de basis van de Teensy-SID-
ports en van C64-emulators zoals VICE) zijn **GPL**. MusicBrain is **MIT**:
die code nemen we niet over, en we kijken er ook niet in terwijl we schrijven.
We bouwen een eigen kern op basis van de openbare documentatie (datasheet,
C64 Programmer's Reference Guide, gepubliceerde metingen van de ADSR-perioden
en het LFSR). Grijs gebied: de **combined-waveform-tabellen**. Die zijn
gemeten data uit echte chips. Onze eigen tabellen **meten we zelf met de
buskaart uit spoor B** (zie §4). Tot dan: een benadering (AND van de
golfvormen met een zachte afronding) en dat eerlijk zo labelen.

### Kern (`mmb_dsp::Sid`, firmware + wasm)

- **Niet cycle-exact.** Per audio-sample (44,1 kHz ≈ 22,3 SID-cycli) de
  accumulator doorschuiven en de golfvormen **band-limited** maken (PolyBLEP
  op saw/pulse, sync en noise-klokflank). Cycle-exact is nodig voor een
  C64-emulator, niet voor een synthmodule, en het aliast zonder
  oversampling juist meer.
- **ADSR in cycli.** De rate-teller telt per sample 22–23 cycli door, met de
  bekende periodetabel (9 … 31251 cycli) en de exponentiële knikpunten
  (bij 93/54/26/14/6). De ADSR-bug zit er dan vanzelf in. Een schakelaar
  "bug" zet hem uit.
- **Filter.** Een ZDF-SVF (dezelfde techniek als de MS-20/Korg35-module)
  met per chipmodel een **cutoffcurve-tabel** (reg → Hz) en voor de 6581 een
  zachte verzadiging in de terugkoppeling. Knop "Curve" varieert de 6581-curve
  (echte chips verschillen onderling; zo heb je een "goede" of een
  "donkere" 6581).
- **Uitgang.** DC-offset en de volume-klik alleen in de 6581-stand, met een
  DC-blokker erachter, zodat digi-trucs werken maar de mix niet verschuift.
- Kosten: 3 stemmen + filter is licht, ruim onder de DX7. Meerdere SID's
  per patch kan.

### Module

- **Eén instantie = één chip = 3 stemmen**, bewust parafonisch (één filter),
  want dat is het karakter. Poly spelen via MIDI-In: stemmen 1..3 op de drie
  SID-stemmen. Meer stemmen = meer SID's (zoals in een SammichSID / MIDIbox
  SID).
- Poorten: per stem `voct` + `gate`; `cutoff` en `pw` als cv; `ext_in`
  (audio door het SID-filter); `out`.
- Knoppen per stem: golfvorm (bitmask: tri/saw/pul/noi), PW, ring, sync,
  A/D/S/R, filter-routing. Globaal: cutoff, reso, mode (LP/BP/HP), volume,
  **chip 6581/8580**, **backend emu/hw** (§4).
- Registerbeeld: de module houdt intern een **registerschaduw** van 25
  bytes. De emulatie leest die, de hardware krijgt de wijzigingen. Dat is de
  naad tussen de sporen.
- Contract-keten zoals gewoonlijk: `contract_dump.py` → vitest-contracttest,
  firmware leidend; de sim draait dezelfde kern als wasm.
- Seeds om mee te beginnen: een Hubbard-achtige bas (pulse + PWM-LFO),
  arpeggio-akkoord (één stem die snel door een akkoord loopt, het
  C64-alternatief voor polyfonie), een ring-mod-bel en een noise-drum.

### Stappen

1. **Klaar (fw 0.5.79, 2026-09-28).** Oscillatoren + noise + ring/sync,
   zonder filter. PolyBLEP op elke sprong (wrap, pulsflank, sync-reset,
   ring-omslag, noise-klok) op zijn exacte tijdstip, één sample latentie.
2. **Klaar (fw 0.5.79).** ADSR als cycle-exacte integer-toestandsmachine:
   periodetabel, exponentieel verval, 15-bit rate-teller → de ADSR-bug
   ontstaat vanzelf. Gemeten: attack 0 = 2,3 ms, attack 15 = 8,09 s,
   decay 0 = 6,9 ms, bug = eerste stap na 23 ms in het testscenario.
3. **Klaar (fw 0.5.79).** Module `tp_mmb_sid` als multi-module met drie
   stem-cellen (`voct_k`/`gate_k`, zoals de sampler), wasm, paneel,
   contract, seed **Poly ▾ → 🕹️ SID ×3 (C64)**. Op de Teensy gemeten:
   C-E-G = 261,4 / 329,4 / 391,6 Hz, A4 = 439,6 Hz; hele patch 10,7 % cpu.
   Tests: `firmware/core/tests/test_sid.cpp` (10 kerntests) en
   `editor/src/modular-mb/sim/wasmPorts.test.ts` (namen, toonhoogte,
   release, akkoord).
4. **Klaar (fw 0.5.82).** Filter 8580: ZDF-SVF 12 dB/oct, LP/BP/HP
   combineerbaar, cutoff lineair ~30 Hz … ~12 kHz, res tot Q ≈ 4, routing
   (Filt) en EXT IN. Mapping op het oor.
5. **Klaar (fw 0.5.83).** 6581-model: S-curve met Curve-knop, zwakkere
   resonantie, zachte begrenzing, DC per stem en de volume-klik; schakelaar
   Chip 6581/8580. Op het oor.
6. Combined waveforms. **Model klaar (fw 0.5.81):** bitlijn-model met
   zachte drempel en een Combo-knop (0 = AND, 4 = 8580, 7 = 6581, 10 =
   verder), noise-terugschrijving in de LFSR. Parameters op het oor; later
   vervangen door eigen metingen met de kaart (§4). Mark heeft geen C64
   meer, dus meten wacht op de SID-kaart rev 0.2.

7. **Klaar (fw 0.5.84).** SID 3-osc (`tp_mmb_sid3`): instellingen per stem,
   Stack/Split, poly via een PolyGroup van modules (elke noot een eigen chip).
8. **Klaar (fw 0.5.85).** Cpu: stille chips overslaan, oscillator als
   integer-fase met float-tijdstippen. Een actieve chip ~8 % op de Teensy
   (was ~12 %), een stille bijna niets; ×4 met vier noten 34 %.

9. **Klaar (fw 0.5.86).** Meerdere chips in de SID-module (SIDs 1–4, 12
   cellen, stereo met Spread, S1–S4 per chip). Gekozen boven poly×poly (een
   PolyGroup over PolyGroups) en boven een PolyGroup over cellen van
   meerdere modules: één module, één set knoppen. SID ×12 met 12 noten:
   36 % cpu op de Teensy.

Uitbreidingen die aan de module kunnen, los van de volgorde: hard restart
(ADSR één frame op 0 vóór een noot, de tracker-truc tegen de ADSR-bug), een
"PAL-frame"-stand (CV-wijzigingen 50× per seconde, de getrapte C64-beweging),
een arp-akkoordstand (één stem die op 50 Hz door een akkoord loopt).

## 3. Spoor B: echte chip op een buskaart ("SID-kaart")

### Kaart-architectuur

Een gewone slotkaart op de SPI-bus, zelfde recept als de GATE8:

| Onderdeel | Keuze |
|---|---|
| Chip | 28-pins DIP-**voet** (nooit solderen). Past ook voor vervangers (ARMSID, FPGASID, SwinSID) om de kaart eerst zonder echte chip op te starten |
| VDD | **Soldeer-jumper** 12 V (6581, direct van +12 V) / 9 V (8580, via 78L09). Silk in hoofdletters bij de voet: welke stand bij welke chip. 12 V op een 8580 is fataal |
| VCC 5 V | Lokale 78L05 / AMS1117-5.0 van +12 V, zoals op de GATE8 |
| Filtercaps | Jumper of twee sets footprints: 470 pF (6581) / 22 nF (8580) |
| Klok φ2 | 1,000 MHz kristaloscillator (5 V, DIP-8/SMD) op de kaart. Firmware rekent met exact 1 MHz, dus stemming is eenvoudig |
| Bus | 2× **74HCT595** @ 5 V (TTL-drempels, dus 3V3-SPI werkt), 16 bits: A0–A4, D0–D7, CS, RES, 1 reserve. **R/W vast aan GND**: write-only, de SID drijft de databus nooit, dus geen 5 V richting de Teensy |
| Audio uit | AUDIO OUT is een open source-uitgang: 1 k naar GND (C64-schakeling), dan AC-koppeling, dan een opamp (TL072 op ±12 V) naar Eurorack-niveau. Jack via het jack4/jack8-contract of een eigen jack |
| EXT IN | Jack → AC-koppeling + deler/bias volgens datasheet → pin 26. Hiermee wordt de kaart ook een "SID-filter" voor elk ander signaal |
| POTX/POTY | Voorlopig niet gebruikt (open laten volgens datasheet) |

**Schrijftiming zonder synchronisatie.** De SID latcht een write op de
dalende φ2-flank zolang CS laag is. Dat geeft een simpele procedure per
register, drie 16-bit SPI-transfers:
1. adres + data klaarzetten met CS hoog;
2. zelfde bits met CS laag, ≥ 2 µs laten staan (twee φ2-cycli);
3. CS weer hoog.
Staat CS een cyclus te lang laag, dan schrijft de SID dezelfde waarde
nog eens. Dat is onschuldig, dus de SPI hoeft niet op φ2 te wachten. Bij
4 MHz SPI kost een registerwrite ~15 µs; alle 25 registers per 1 kHz-tick
is ~40 % van de bus. Daarom **alleen wijzigingen** sturen (diff tegen de
schaduw), en dan is het verwaarloosbaar.

**Terugkoppeling (rev 0.2, optioneel).** OSC3/ENV3 uitlezen (register
$1B/$1C) is handig voor een zelftest en om de combined waveforms te meten.
Dat vraagt R/W onder firmware-controle en een 5 V → 3V3-leespad op de
databus (5V-tolerante LVC-buffer + schuifregister, zoals de MISO-trap van
de gatein8). Rev 0.1 laat dit weg: write-only is veiliger en eenvoudiger.

### Firmware

- Zelfde module `tp_mmb_sid`, backend **hw**: de registerschaduw wordt per
  control-tick vergeleken en de wijzigingen gaan over SPI. De emulatie kan
  daarbij stil meelopen, dan kun je A/B'en.
- De kaart meldt zich via geografische CS, net als de andere kaarten.
- **Audio komt analoog uit de kaart**, niet terug in de Teensy-mix. Net als
  bij het poly-analoge spoor: de SID-kaart is een hardwarestem met een eigen
  uitgang. (Terugvoeren via een audio-ingang is een apart besluit.)

### Risico's en veiligheid

- **Voeding**: verkeerde VDD-stand doodt de chip. Soldeer-jumper in plaats
  van een losse jumper, duidelijke silk, en de kaart eerst zonder chip
  inschakelen en de voet doormeten (pin 28 VDD, pin 25 VCC).
- **ESD en omgekeerd plaatsen**: voet met duidelijke pin-1-markering;
  chips in antistatische foam bewaren.
- **Nep- en kapotte chips**: veel remarked/defecte exemplaren tweedehands.
  Een testpatch in de firmware ("selfTest sid": drie stemmen, filterzwaai)
  maakt het binnen tien seconden hoorbaar. Met de rev 0.2-terugkoppeling kan
  het automatisch (OSC3 van een bekende saw uitlezen).
- **Warmte**: een 6581 op 12 V wordt warm. Niets warmtegevoeligs vlak naast
  de voet, en ruimte voor een klein koellichaam.

## 4. Hoe de sporen elkaar helpen

- De emulatie komt eerst: module, UI, contract en seeds liggen dan klaar.
  De kaart is daarna "alleen" een tweede backend.
- De kaart is daarna het **meetinstrument voor de emulatie**: met de
  rev 0.2-terugkoppeling (OSC3/ENV3) en een opname van AUDIO OUT meten we de
  combined waveforms en de filtercurves van onze eigen 6581's en 8580's.
  Dat geeft eigen, MIT-vrije tabellen, en een curve van onze eigen 6581 in de
  emulatie.

## 5. Open besluiten

1. Volgorde: emulatie eerst (advies), of de kaart parallel?
2. Kaart rev 0.1 write-only (advies) of meteen met terugkoppeling?
3. Hoe breed: 1 SID per kaart (advies, 45 mm past) of 2 (stereo, 6 stemmen)?
4. Audio van de kaart terug de Teensy in, ja of nee?
5. Welke chips liggen er precies (6581 R3/R4AR, 8580)? Bepaalt de
   standaardstand van de VDD-jumper en de caps.
