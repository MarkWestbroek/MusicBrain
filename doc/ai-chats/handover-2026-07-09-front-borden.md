# Handover — front-borden (pot/enc) onder besluit B (voor supervisie)

**Datum:** 2026-07-09 · **Repo:** `d:\Git\Muziek\MusicBrain` · **Spoor:** hardware/KiCad.
Dit is een *werkbon* voor het afmaken van de bediening-front-borden. Lees eerst
`doc/copilot-chats/handover-2026-07-08-hardware-kicad.md` (algemene werkwijze + valkuilen)
en `doc/mechanics/front-board-constraints.md` (de maten + het besluit). Auto-memory:
`MEMORY.md` + [[hardware-handover]] + [[spi-bus-architectuur]] + [[kicad-workflow]].

## Stand van zaken (git)

- **Alle 11 borden af** (DRC 0/0, ERC-schoon, fab-pakket): de 10 uit de vorige ronde +
  de nieuwe generieke **`musicbrain-riser`** (commits `3008b01`, `ef52dd8`).
- **Mechanica/paneel vastgelegd**: `doc/mechanics/frontpanel-v1.svg` (paneel-v1),
  `doc/mechanics/front-board-constraints.md` (envelope + besluit), handover-updates
  in `handover-2026-07-08-hardware-kicad.md` (stand 2026-07-09).
- Working tree schoon. Alleen mijn eigen bestanden gecommit (nooit `git add -A`;
  de firmware/editor-sessie commit apart — niet aanraken).

## Het besluit: **Optie B** (Mark, 2026-07-09)

Bediening (pot/enc) komt op **passieve front-borden** + een **slimme verticale kaart**
(MCP op de kaart, niet op het front). Voorkeursvorm: **MCP op een pot-/enc-specifieke
*riser***, front = puur dom (controls + compacte koppeling). Zie constraints-doc §BESLUIT.

### Wat vaststaat
- 8 RK09K-pots @ ~13,3 mm steek passen in de ~110 mm-kolom (courtyard-span ≈106 mm).
- MCP3208 (pot) / MCP23017 (enc) op de verticale kaart, niet op het krappe front.
- GND via het vlak; +3V3 + wipers + SPI/I2C over de koppeling.

### Wat Mark nog fysiek test (BLOKKEERT de definitieve build)
1. **Exacte pot-steek** — courtyard 13,3 mm is conservatief; echte 9 mm-body ~10-11 mm.
   Mark legt de pots neer en bepaalt de minimale praktische steek → dát wordt de
   paneel-gatsteek én de board-steek.
2. **Koppelvorm front↔kaart** — plat soldeer-lintje langs de rand, óf een haakse
   connector in het ~4,6 mm zijkanaal. 10 lijnen (8 wipers + 3V3 + GND) voor POT;
   voor ENC: I2C (SDA/SCL) + IRQ + 3V3 + GND + evt. knop-lijnen.

## Volgende stappen (zodra Mark de steek + koppelvorm doorgeeft)

1. **POT-front (dom):** 8 RK09K-vertikaal @ gekozen steek, pin1→GND, pin2→wiper,
   pin3→+3V3, koppeling naar de riser. Triviale routing (geen chip). Generate→ERC→
   netcheck→DRC 0/0 → fab. Generator-aanzet: `scratchpad/gen_pot8front.py` (moet
   omgebouwd van "smart front" naar "dom front" — MCP eruit).
2. **POT-riser (slim):** generieke riser + MCP3208 + de koppel-connector naar het front.
   Baseer op `scratchpad/gen_riser.py`; voeg MCP3208 + wiper-ingangen toe. SPI naar de bus.
3. **ENC-front + ENC-riser:** zelfde patroon, MCP23017 (I2C), 5 enc + 2 knop.
4. Daarna de resterende losse punten (ongewijzigd, zie 07-08-handover):
   **ADC8 v1.1** (recht-toe + `MbAdc8`-remap), **silk-URL-fixes** (dac8/gatein8/gate8 —
   mét visuele check van Mark), **busboard-v2** (MIDI 2×IN/1×UIT op Serial8=34/35,
   codec-I2S-pinreserve, TUNE-IN).

## Werkwijze-herinnering (voor de supervisor)

- KiCad GUI-loos via `kicad-cli` 10.0: **generate → `sch erc` → netlist + `netcheck()`
  pad-voor-pad → `pcb drc --refill-zones`** (zonder refill meldt DRC valse GND-open).
  Toolkit in scratchpad: `cardlib.py`, `schlib.py`, `make_fab.sh` (riser staat er nu in).
- **Commit alleen eigen werk met expliciete `git add <files>`.** Nooit `-A`/`-a`.
  Trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Commit alleen bij DRC 0/0 + netcheck OK.** Nooit een half/kapot bord committen.
- Silk-plaatsing en 3D-uitlijning zijn **niet blind te verifiëren** — die stappen mét Mark.
- Elke nieuwe kaart heeft een `.kicad_pro` nodig (kopieer een template, pas naam+uuid aan).

## Openstaande vragen voor Mark (kort)

- Pot-steek (mm) + paneel-gatsteek?
- Koppelvorm: soldeer-lintje of haakse connector?
- Pot-riser (nieuw, met MCP) óf gewoon de bestaande `musicbrain-pot8` als buskaart?
