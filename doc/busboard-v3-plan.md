# Busboard v3 — gen-2-herbouw (ontwerpdocument)

**Datum:** 2026-07-16 · **Status:** ontwerp gestart (stap 6 van
`doc/systeem-v3-plan.md`; besluiten door Mark genomen 2026-07-14..16).
**Basis:** busboard v2 (rev 2.0, DRC 0/0, commit d3b7849) +
`doc/spi-bus-spec.md` v2.0. **v2 is nooit besteld** — v3 vervangt hem.

## Delta t.o.v. v2 (de zeven ingrepen)

| # | ingreep | bron |
|---|---|---|
| 1 | **bord 200×115 → 203,2×128,5** (40 HP × 3U-paneelvlak; paneel, fronts en grondbord delen één footprint) | besluit 3 |
| 2 | **slots gecentreerd**: 6× 2×12-socket, steek **20,32** (4 HP), x = 50,8 + 20,32·k (50,8 … 152,4), socketveld gecentreerd op de diepte (hart y = 64,25) | besluiten 1/2/6 |
| 3 | **slot 2×10 → 2×12** (`bus.SOCKET_BUS`): pinnen 19/20 = CONVST/GND-guard, 21–24 = MCLK/BCLK/LRCLK/I2S_DATA·slot | spec v2.0 |
| 4 | **U2 R-78E5.0-0.5 → R-78E5.0-1.0** (zelfde SIP-3-footprint, alleen BOM) + verplaatsen (stond het zuidwaarts schuiven van de slots in de weg) | besluiten 4/7 |
| 5 | **MIDI 2×IN / 2×UIT**: OUT2 = TX7 (pin 29, stond vrij op EXP) → tweede 74LVC1G17 + 33R/10R → J22 (1×3, naast J15) | besluit 8 |
| 6 | **USB-host-header J23** (1×5): 1-op-1 kabel naar de 5 host-pads op de Teensy 4.1 (GND, D−, D+, +5V, GND). Paneel krijgt later een USB-A op die kabel. 500 mA komt uit VIN → daarom de 1A-regelaar | besluit 9 |
| 7 | **audio-lijnen aanlanden** (zie hieronder) | besluit 6/11 |

**Ongewijzigd**: Teensy-pintoewijzing v2 (op pin 29 na), CS-decoder 74HC154,
IRQ-keten 2×74HC165+1G125, expansieheader J21 (één detail: **ADCRST_X wordt
reservepin** — ADC_RESET is in gen 2 geen buslijn meer), MIDI-IN-blokken,
CAN, codec-header J17, TUNE-IN, DLG-UARTs, display J11, Qwiic J12 (zuidoost),
power-entry J9 10-pins, hub-headers J7/J8, slot-pinnen 1–18.

**Expander-segment, het complete beeld**: twee lintkabels — J21↔J21 voor
SPI/besturing (CS9–14, IRQ7–12), J24↔mixer voor audio (klokken heen, zes
datalijnen terug). J24 = de digitale-audiohub, het broertje van de
SPI-hubs J7/J8; volledig passief.

## Audio-aanlanding (voorstel)

![audio-aanlanding](audio-aanlanding-v3.svg)

- **MCLK/BCLK/LRCLK (gedeeld)**: doorverbinden met de bestaande I2S1-netten
  van J17/Teensy (MCLK1 = 23, BCLK1 = 21, LRCLK1 = 20). Er komt géén extra
  hardware: wie klokmaster is (Teensy, codec óf FPGA-kaart) drijft de lijnen,
  de rest staat in slave — dat is een firmware-/configuratiekeuze en werkt
  voor alle drie de opties zonder bordwijziging.
- **I2S_DATA1–6 (per slot)**: de master-Teensy heeft geen 6 SAI-ingangen,
  dus de zes lijnen kunnen niet rechtstreeks de Teensy in. Ze landen op een
  **verzamelheader J24 (2×7): MCLK/BCLK/LRCLK + DATA1–6 + 5×GND**, naast
  J17. Een toekomstige mixer (FPGA-kaart via kabel, of codec-TDM-bord)
  prikt daar in. Tot die tijd is J24 gewoon reserve — de backplane-
  bedrading is het punt.
  De klokken zitten mee op J24 (vraag Mark 2026-07-16, expansie): zo is
  één lintkabel per segment compleet — een expansiesegment (zonder Teensy)
  krijgt zijn klokrails vía zijn J24 aangeleverd en levert zijn zes
  datalijnen over dezelfde kabel terug. Eén FPGA-mixer bedient daarmee het
  busboard + twee expansiesegmenten (18 datalijnen; zie capaciteitsnoot in
  het J24-hoofdstukje hieronder).
- ⚠️ open (ongewijzigd uit de spec): SI-review pinnen 21–24; klokmaster-keuze.

## Floorplan (uitgangspunt)

v1/v2-recept blijft: Teensy west, slotveld midden, hubs oost, voeding
zuidwest, B.Cu-lanebundel onder het slotveld. Verschuivingen:

- Slotveld: x 50,8…152,4 (was 70…170) → **alles ten westen krijgt 19 mm
  minder, oostrand 17 mm méér**; de hub/Qwiic-hoek wordt ruimer.
- Slot-sockets: y 50,28…78,22 (2×12 gecentreerd op 64,25). De lanebundel
  schuift mee omlaag (was y 65–105 op 115 diep; wordt ~72–112 op 128,5).
- Noordstrook (y 12–36) wordt y 12–48: meer ruimte voor J21/U6/U8 én de
  nieuwe J24.
- U2 (regelaar): uit de slotveld-zuidschuiflijn weg, naar de
  voedingshoek bij J9 (zuidwest).
- M3-gaten: 4 hoeken + noord/zuid-midden, afgestemd op het gedeelde
  3U-footprintraster (paneel = zelfde gatenpatroon).
- MIDI-hoek zuidrand: J13/J14 (IN) + J15/J22 (UIT ×2) naast elkaar;
  tweede 1G17 bij de eerste.
- J23 (USB-host) pal naast de Teensy-socket (korte kabel).

## Aanpak

1. Schema-delta op `gen_bus2_sch.py` → `gen_bus3_sch.py` (nieuwe map
   `musicbrain-busboard-v3/`): 2×12-slots + audio-netten, J22/J23/J24,
   R-78E5.0-1.0, ERC 0.
2. PCB-generator `gen_bus3_pcb.py`: nieuw floorplan, placement compleet,
   netcheck groen.
3. Routen: vaste power-spines + lanes v1-stijl waar bewezen, de rest
   freerouting (`prep_dsn.py`, best-of-N; power-class 0,35 — de
   v2-les: 0,5 past niet tussen de slotpads).
4. Gates: ERC 0 + netcheck OK + DRC 0/0 vóór commit; daarna render-check.

## Open punten

1. **Klokmaster**: master-Teensy als default (firmware), FPGA neemt later
   over. — **akkoord Mark 2026-07-16**.
2. **J24-vorm**: **2×7 IDC-baar** (klokken mee op de header — zie
   audio-aanlanding). Capaciteit mixer: mixen is MAC-werk; één Tang Nano 9K
   doet bij 48 kHz duizenden MAC's per sample — 18 datalijnen (3 segmenten)
   kosten ~1k LUT aan deserializers + een opteller. De grens is kabels/
   FPGA-pinnen, niet rekenkracht; 18 lijnen + klokken + SPI past op de
   Nano-9K-headers.
3. **Versienummers (besluit Mark 2026-07-16)**: v2 blijft gearchiveerd in
   `rel-v0.2/` (staat er al), níet naar deprecated. Bord-revs blijven
   overal MAJOR.MINOR — het busboard wordt **rev 3.0**; de "v2/v3" in de
   map-/bordnaam vervalt: de nieuwe map heet `musicbrain-busboard`
   (hernoemen bij de herpublicatie, stap 8).
