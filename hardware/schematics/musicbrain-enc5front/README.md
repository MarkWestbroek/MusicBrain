# MusicBrain ENC5-FRONT — slim front: 5× encoder + MCP23017 op de generieke riser

**Status**: ERC 0, netlijst pad-voor-pad geverifieerd, DRC 0/0. Bord 20×110 mm,
2 lagen; signaal-koper door **freerouting** (SES native in de generator ingelezen).

## Opbouw

- **5× EC11E verticaal mét drukas** (Alps of kloon, M7-bus + moer), assen op de
  **hartlijn 8,0 mm**, steek **14,2 mm** (paneelknoppen ≤ 14 mm kiezen).
- **MCP23017-E/ML (QFN-28)** op de voorzijde (past onder het paneel, ~7 mm lucht);
  SSOP/SOIC past niet in de 20 mm-kolom. Adres 0x20 (A0-2 = GND). QFN-pinvolgorde
  per datasheet DS20001952 — **check dit vóór assembly-bestelling nog één keer**.
- **J1 = 2×10 female socket op de achterzijde** (zuid, in-lijn): prikt op
  **J2 van de generieke `musicbrain-riser`** (x-matching per riser-README).
  Gebruikt: SDA, SCL, IRQ, +3V3, GND — de rest van de bus loopt ongebruikt mee.
- GPIO-map: **GPA0-7 = E1A,E1B .. E4A,E4B; GPB0/1 = E5A/E5B; GPB2-7 vrij**.
  INTA → IRQ (mirror in firmware aanzetten), interne pull-ups (GPPU) aan.

## Bewuste keuzes / opgeschoven punten

1. **De 2 drukknopjes zijn van dit bord af**: 5 encoders + knoppen + QFN +
   2×10-socket passen fysiek niet samen op één 110 mm-kolom (socketbody +
   encoder-courtyards). GPB2-7 zijn vrij — de knopjes kunnen naar het
   brain-console-deel (paneel-v1 had die optie al: "2+4 onder display").
2. **Encoder-drukassen (S1/S2) zijn niet bedraad** (GPIO-budget). De gaten
   zitten er wél in; een v1.1 kan ze op GPB2-6 leggen als gewenst.
3. **Pin-1-oriëntatie** socket ↔ riser-J2 bij de eerste fysieke passing
   verifiëren; bij spiegeling de FRONTPIN-map in `gen_enc5front.py` omkeren.
