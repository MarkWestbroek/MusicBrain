# MusicBrain-borden — status & bestellingen

Actuele stand per bord. **Bestelbaar** = ERC 0 + netcheck OK + DRC 0/0 +
fab-pakket (`<bord>/fab/…-gerbers.zip` + BOM/CPL in JLC-formaat) ververst.
Vul zelf *aantal besteld* en *besteldatum* in bij het bestellen.

| Module | Versie | Status | Opmerkingen | Todo (rot/fab) | Aantal besteld | Prijs | Besteldatum |
|---|---|---|---|---|---|---|---|
| ad5754r-breakout | 1.0 | bestelbaar (gen 1: hub-kabel, geen slot) | 4× CV-uit breakout (AD5754 + ADR421) | rot checken vóór PCBA: AD5754 (HTSSOP), ADR421 (SOIC-8) | | | |
| musicbrain-adc8 | 2.0 | bestelbaar | gen 2: 65×45, slot 2×12, RESET lokaal (RC), CONVST=pin 19; fw-spiegel `MbAdc8` | rot checken: AD7606 (LQFP-64) | | | |
| musicbrain-dac8 | 2.0 | bestelbaar | gen 2: 60×45, slot 2×12; daisy/LDAC/J2-contract gelijk | rot checken: AD5754 (HTSSOP), ADR421 (SOIC-8) | | | |
| musicbrain-gate8 | 2.0 | bestelbaar | gen 2: 55×45, slot 2×12; bitvolgorde gelijk | rot checken: 74HCT595 (SOIC-16) | | | |
| musicbrain-gatein8 | 2.0 | bestelbaar | gen 2: 50×45, slot 2×12; D_OF_IN-contract gelijk | rot ✅ | | | |
| musicbrain-jack8 | 2.0 | bestelbaar | gen 2: 20×110 (past tussen de rails), 8 @13,75, socket gecentreerd | — (PCB-only) | | | |
| musicbrain-jack4 | 2.0 | bestelbaar | gen 2: 20×60, 4 @13,75; kabel-breakout hub-DAC | — (PCB-only) | | | |
| musicbrain-riser | 2.0 | bestelbaar | gen 2: 40×45, 2×12 vólledige bus incl. audio (dev-bord delegates) | — (PCB-only) | | | |
| musicbrain-pot8front | 1.1 | bestelbaar | ⚠️ SHAFT_OFFSET (4,5 aanname) aan fysieke pot meten vóór paneel-fab | — (geen SMD) | 30 | 10 | |
| musicbrain-potriser | 2.0 | bestelbaar | gen 2: 40×45, slot 2×12; pin-1-passing checken | rot checken: MCP3208 (SOIC-16) | | | |
| musicbrain-enc5front | 2.0 | bestelbaar | 30 mm breed, uiterst links/rechts; ⚠️ QFN-pinout checken vóór assemblage | 3D-model J1/J2 nudge (render, cosmetisch); rot QFN ✅ | 10 | 53 | |
| musicbrain-i2criser | 2.0 | bestelbaar | gen 2: 40×45, slot 2×12 | — (PCB-only) | | | |
| musicbrain-axon | 0.1 | bestelbaar | ESP32-S3-netbridge (Axon): WiFi+W5500-UTP, editor-API, UART naar DLG1; voeding via J25 | rot checken (ESP32-module, W5500, USB-C) | | | |
| musicbrain-busboard | 3.1 | bestelbaar | gen 2: 203,2×128,5 (40 HP), slots 2×12 gecentreerd, audio + J24-hub, MIDI 2×2, USB-host, 1A-regelaar, J25 Axon-voeding | rot checken (nieuwe placement); connectoren + oriëntatie nalopen; U1 Teensy = 2× female 1×24 (bv. C2883741) zelf solderen, Teensy-met-pinnen erin prikken (besluit Mark: vervangbaar) | | | |
| musicbrain-vca8 | 0.1 | bestelbaar | poly-analog-spoor: gen 2 80×45, slot 2×12, 2× SSI2164 + **1× DAC128S085** octaal 12-bit (0–3V3, geen LDAC), J2=IN/J3=UIT (jack8-contract, ±13,6 van hart); GND trace-geroute (`--route-gnd`: fijne GND-pads bereikten de zone niet); SSI2164 = zelf solderen | LCSC ✅ (2026-07-20, alles gematcht behalve SSI2164 = bewust handwerk); rot ✅ SOIC-14 (U3/U4) + TSSOP-16 (U5) → **ROT_FIX 270 toegepast** (preview-geverifieerd 2026-07-20, gelijk aan de SOIC-familie); connectoren raw THT (fleet-standaard); CP_Elec-polariteit (C61-63) nog in de preview meenemen | | | |
| musicbrain-vcf8kern | 0.1 | **in ontwerp** (ERC 0, netcheck OK, plaatsing 0 courtyard-overlappen — routen moet nog) | poly-analog VCF8-kernkaart 110×92 **4-laags** (In1/In2=GND-planes), kernslot-contract v1.1: 8× SSI2140 4-pole cascade (Fig3, **pinout gecorrigeerd** t.o.v. buildspec) + pole-mixing (Fig20/AN701) 8 modes via 4051/stem; cutoff 2× AD5754-daisy + ADR421, Q DAC128S085, FMCV-som, tune LM311+4051 (TEN via 2N7002), audio J2/J3 jack8; **dubbelzijdig bestukt** (besluit 2026-07-21: pole-mix-ster/buffer-steun/ontkoppeling per stem op B.Cu, JLC PCBA beide zijden), 0603; SSI2140 = top, zelf solderen (foam/fixture: bord ligt niet vlak); tune-mux geografisch (TSEL-tabel in README) | routing (freerouting **v2.2.4/Java 25**, prep_dsn `--keep-gnd`) + DRC + fab; rot alle SMD checken; AD5754 pas op gevalideerd board (Route B) | | | |
| musicbrain-vcf8kern-testadapter | 0.1 | **in ontwerp** (ERC 0, netcheck OK, 0 courtyard-overlappen) | passief 68×58: buskabel-2×12 → kernslot-socket (MOSI→SDIN+SDIN2, SCLK→SCLK+SCLK2, IRQ→CS2, MISO←SDO); MODE/TSEL/TEN-jumpers, FMCV→GND, TOUT 4k7-pullup + testpads — bench-test vcf8kern zonder backbone | routing (triviaal) + fab | | | |
| musicbrain-matrix | 0.2 | geroute alternatief (ERC 0/netcheck/DRC 0/0) — **NIET bestellen: keuze 2026-07-21 = center-variant** | 8-stemmige audio-patchmatrix: 175×142 **4-laags**, 8× MT8816 DIP-40 (voorraad Mark; BOM-regel U1-8 = DIP-40-**socket** C72123 → JLC soldeert sockets, chips zelf erin duwen); **per-chip CS via 74HC238** (was broadcast) → per stem schakelbaar; adres fw `<groep:3><y:3><x:4>`; tussenkanaal-plaatsing (headers aan beide zijden van elke chip) + Hungarian per-chip pin→bus-mapping (tabel in gen_matrix.py-docstring = firmware-contract!); 8 IN-/16 UIT-bussen (1×10 jack8-contract); 2× 74AHCT595 + 74HC238 aan buskabel-SPI (PinSocket 2×12); VDD +6/VEE −6 (7806/7906), V5-logic (78L05) | ⚠️ 4-laags bij JLC bestellen; THT (sockets/headers) kan gewoon in **Economic PCBA** (Manual-Assembly-fee); rot checken vóór PCBA: 595's (C126402, SOP-16) + 238 (C5620) → ROT_FIX 270 toegepast; socket-nok (pin 1) in preview checken; CP_Elec-polariteit in preview meenemen; naamgeving hernoemd JUIT→JOUT (2026-07-21) | | | |
| musicbrain-matrix-c | 0.3c | **bestelbaar** (ERC 0, netcheck OK, DRC 0/0, fab ververst 2026-07-21) — **DE gekozen matrix-variant (besluit Mark 2026-07-21)** | zelfde schema/BOM als musicbrain-matrix maar plaatsing "gedistribueerd midden" (Marks schets 6): 154×133 4-laags, 4 chipkolommen × 2 rijen, alle OUT-headers in de kanalen (4-8-4), IN-headers in 2 rijen in de middengap, logica+bus op de weststrook; **audiobanen −34%** t.o.v. matrix (gem. 59,2 vs 90,2 mm; max 153,8 vs 230,4); eigen Hungarian-mapping (= ánder fw-contract, tabel in generator-stdout `gen_matrix.py center`) | zelfde todo's als musicbrain-matrix (4-laags, Standard PCBA, rot/nok-check) | | | |
| ~~musicbrain-busboard-v2~~ | 2.0 | vervangen | gen-1-stand bevroren in `musicbrain-busboard-v2/rel-v0.2/`; nooit besteld | — | | | |
| ~~musicbrain-busboard~~ | 1.1 | deprecated | vervangen door v2 (16×CS/12×IRQ + expansie) — in `deprecated/` | — | | | |
| ~~musicbrain-enc4~~ | 1.0 | deprecated | vervangen door enc5front + i2criser — in `deprecated/` | — | | | |
| ~~musicbrain-pot8~~ | 1.0 | deprecated | vervangen door pot8front + potriser — in `deprecated/` | — | | | |

> **Todo-kolom:** *"rot checken"* = dat SMD-part in de JLCPCB Component-Placements-preview verifiëren (ander chip/package dan de busboard-ijking in `ROT_FIX`). Klopt niet → graden aan mij doorgeven → ik pas `ROT_FIX` aan → jij draait `make_fab.sh "<bord>"` opnieuw. Zie [FABRICATION.md](FABRICATION.md#rotatie-correctie).

## Samenhang (wat heb je samen nodig)

- **CV in**: adc8 (slot) + jack8 (front)
- **CV uit**: dac8 (slot) + ad5754r-breakout óf direct + jack8 (front)
- **Gates uit/in**: gate8 / gatein8 (slot) + jack8 (front)
- **Potten**: potriser (slot) + pot8front (front)
- **Encoders/knoppen**: i2criser (slot) + enc5front (front, uiterst links/rechts)
- **Alles**: busboard (rev 3.1, gen 2) + Teensy 4.1

**Gen 2 (2026-07-16)**: systeembrede renovatie — slots 2×12 met audio-lijnen,
H=45, 4 HP-steek, slots gecentreerd. Gen-1-zips in oude JLC-mandjes NIET meer
bestellen; alle fab-pakketten zijn ververst. Gen-1-stand per bord bevroren in
`<bord>/rel-v0.2/` (tag `hw/v0.2`).

## Guitar Effect Switcher (apart project — spec: doc/guitar-switcher-spec.md)

| Module | Versie | Status | Opmerkingen | Aantal besteld | Prijs | Besteldatum |
|---|---|---|---|---|---|---|
| gswitch-loop8 | 0.1 | geroute (ERC 0/netcheck/DRC 0/0) | 8× relaisloop; vóór fab: jack-doorpiep + LCSC-match — NIET bestellen | | | |
| gswitch-loop8sh | 0.1 | geroute (ERC 0/netcheck/DRC 0/0) | klem-variant (Sander van Herk), 150×44; geen normalling — lege loop niet activeren; vóór fab: LCSC-match — NIET bestellen | | | |
| gswitch-brain | 0.1 | geroute (ERC 0/netcheck/DRC 0/0) | ESP32-S3-WROOM-1U, 100×70; vóór fab: LCSC-match + fab-pakket — NIET bestellen | | | |
