"""MusicBrain MATRIX (rev 0.2) - 8-stemmige audio-patchmatrix, 8x MT8816.

NIEUWE ARCHITECTUUR (per-chip CS-adressering; was broadcast).
--------------------------------------------------------------
8 parallelle MT8816-vlakken, chip k = stem k van alle bussen. Logische
matrix: 8 IN-bussen (Y0-7) x 16 OUT-bussen (X0-15), elk 8 stemmen breed
(jack8-contract 1x10: pin1=GND, pins2-9=stem1-8, pin10=GND).

Besturing:
  - AX0-3, AY0-2, DATA, STROBE, RESET zijn GEDEELD (broadcast) naar alle 8.
  - CS is NIET meer broadcast: elke chip heeft zijn EIGEN CS, gedreven door
    een 74HC238 (3-naar-8 decoder, actief-hoog). MT8816-CS is actief-hoog en
    poort STROBE: alleen de chip met CS hoog latcht op STROBE.
  - Bron: 2x 74AHCT595 daisy aan slot-SPI (RCLK = CS-flank).
      U9  (8 uit): AX0,AX1,AX2,AX3,AY0,AY1,AY2,DATA
      U10 (6 uit): STROBE,RESET,G0,G1,G2,DECEN  (QG,QH -> NC)
      U9.QH' -> U10.SER (/S1).
  - 74HC238 U14 (SOIC-16): A0<-G0 A1<-G1 A2<-G2 ; /E1,/E2 -> GND ; E3<-DECEN ;
    Y0..Y7 -> CS1..CS8 (chip U1..U8). Gevoed uit /V5 + 100n.
    Pinout (uit KiCad 74xx:74HC238-symbool, geverifieerd):
      1=A0 2=A1 3=A2 4=/E1 5=/E2 6=E3 7=Y7 8=GND 9=Y6 10=Y5 11=Y4
      12=Y3 13=Y2 14=Y1 15=Y0 16=VCC
  - Firmware logisch adres = <group:3 (chip 0-7)><y:3><x:4>. G2G1G0 = group;
    238.Y(group) drijft CS(group+1) -> chip U(group+1).

Voeding (ongewijzigd): L7806->/VDD6 (+6, MT8816 VDD), L7906->/VEE6 (-6, VEE),
78L05->/V5 (+5 logic). 100n per MT8816 (VDD+VEE), per 595, per 238; 10u bulk
per rail. Bus J1 = PinSocket 2x12 (slotcontract; GND/12V/SPI gebruikt).

MT8816 DIP-40 (geverifieerd): 1=Y3 2=AY2 3=RESET 4=AX3 5=AX0 6=X14 7=X15
  8=X6 9=X7 10=X8 11=X9 12=X10 13=X11 14=NC 15=Y7 16=VSS 17=Y6 18=STROBE
  19=Y5 20=VEE 21=Y4 22=AX1 23=AX2 24=AY0 25=AY1 26=X13 27=X12 28=X5 29=X4
  30=X3 31=X2 32=X1 33=X0 34=NC 35=Y0 36=CS 37=Y1 38=DATA 39=Y2 40=VDD

FLOORPLAN (landscape, 4-laags, rev 0.2b "tussenkanaal"): 2 groepen van 4
chips (2x2), gespiegeld links/rechts, control+voedingsstrook in het MIDDEN.
  Groep A = U1..U4 (links), Groep B = U5..U8 (rechts). Chips rot 0 (lange as
  verticaal). 16 OUT/X-headers: per zijde 4 op de buitenrand + 4 in het
  TUSSENKANAAL tussen de twee chipkolommen — elke chip heeft zo aan beide
  zijden een headerkolom direct naast zich (geen vermijdbare kruising van de
  binnenchips over de buitenchips meer). 8 IN/Y-headers: 4 noord, 4 zuid
  (Y-pins verlaten de chip-uiteinden). Headers PinHeader_1x10_Vertical.
  NB elektrisch: alle OUT/IN-netten zijn 2-punts (header-pin k+1 <-> chip Uk);
  chips delen alleen control/voeding. Een header hoort dus niet bij een chip:
  jack8 = 1 bus x 8 stemmen -> pins 2-9 gaan naar 8 verschillende chips.

AUTO PER-CHIP PIN->BUS-TOEWIJZING (Hungarian, per chip, min. draadlengte):
  Elke chip krijgt onafhankelijk zijn 16 X-pads gematcht aan de 16 OUT-headers
  (target = headerpad voor stem k) en zijn 8 Y-pads aan de 8 IN-headers.
  De berekende AX-index->OUT en AY-index->IN tabel wordt geprint (firmware).

--- BEREKENDE MAPPING (deterministisch; ook geprint bij run) ---
LET OP: onderstaande tabel geldt voor de EDGE-variant (rev 0.2). De
center-variant (rev 0.3c, `gen_matrix.py center`) heeft een ANDERE mapping —
zie de run-uitvoer of doc/plans/analog-patch-matrix.md (beide staan daar).
Firmware: group g (0-7) -> chip U(g+1). Per chip: AX-index -> OUT-bus (0-15),
AY-index -> IN-bus (0-7). OUT/IN nummers zijn 1-based (bus 1..16 / 1..8).

  chip  AX0..AX15 -> OUT                                            AY0..AY7 -> IN
  U1 g0 13 14 10  2 15 11  9  6  3  4  7  8 16 12  5  1             4 3 2 1 7 5 6 8
  U2 g1  9 13 14 10 15 11  6  7  2  8  3  4 16 12  1  5             4 3 2 1 8 6 5 7
  U3 g2  9 10 14 11 15  4  1  2  7  3 13  8 12 16  5  6             4 3 2 1 6 5 7 8
  U4 g3  9 13 10 14 11 15  3  5  6  7  8  4 12 16  1  2             4 3 2 1 7 6 5 8
  U5 g4  9 13 14 15 10 16  6  2  7  3  8  4 11 12  1  5             1 4 3 2 8 7 6 5
  U6 g5 13  3 10 14 11 12  5  6  2  7  8  4 15 16  9  1             1 2 4 3 8 7 6 5
  U7 g6  9 10 11 13 14 15  2  6  3  7  8  4 16 12  1  5             2 4 3 1 8 7 6 5
  U8 g7 13 14  9 10 15  4  5  2  6  3  7  8 12 16  1 11             1 3 4 2 8 7 6 5
"""
import sys, os, math
import os as _os
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, conn1_symbol, box_symbol, R_SYM, C_SYM,
                    CP_SYM, FLAG_SYM, power_symbol)
from cardlib import Board, rotxy
import bus

# Twee plaatsingsvarianten uit dezelfde generator:
#   edge   (default) = rev 0.2 "tussenkanaal"  -> musicbrain-matrix/
#   center           = rev 0.3c "gedistribueerd midden" (Marks schets 6)
#                      -> musicbrain-matrix-c/  (alle headers tussen de
#                      chips, logica+bus op de weststrook; korte audio,
#                      lange control - control is traag/zeldzaam actief)
VARIANT = sys.argv[1] if len(sys.argv) > 1 else 'edge'
assert VARIANT in ('edge', 'center'), VARIANT
BASE = 'musicbrain-matrix' if VARIANT == 'edge' else 'musicbrain-matrix-c'
OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics" + "\\" + BASE
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-21"
REV = "0.2" if VARIANT == 'edge' else "0.3c"

GEBRUIKT = {'GND', '+12V', '-12V', '/SCLK', '/MOSI', '/CS'}

# ------------------- silicon pin -> logische index -------------------
XPIN2IDX = {6: 14, 7: 15, 8: 6, 9: 7, 10: 8, 11: 9, 12: 10, 13: 11,
            33: 0, 32: 1, 31: 2, 30: 3, 29: 4, 28: 5, 27: 12, 26: 13}
YPIN2IDX = {1: 3, 15: 7, 17: 6, 19: 5, 39: 2, 37: 1, 35: 0, 21: 4}
XIDX2PIN = {v: k for k, v in XPIN2IDX.items()}
YIDX2PIN = {v: k for k, v in YPIN2IDX.items()}
# gedeelde/vaste MT8816-pinnen (net met slash zoals in de PCB)
CTRL = {2: '/AY2', 3: '/RST', 4: '/AX3', 5: '/AX0', 16: 'GND', 18: '/STB',
        20: '/VEE6', 22: '/AX1', 23: '/AX2', 24: '/AY0', 25: '/AY1',
        38: '/DATA', 40: '/VDD6'}   # 36=CS -> per k; 14/34 = NC


def chip_net(k, pin, xp, yp):
    """Net (met slash) voor MT8816-pin `pin` van chip k, gegeven de per-chip
    permutaties xp (xindex->OUT-bus) en yp (yindex->IN-bus). None = NC."""
    if pin in XPIN2IDX:
        return f'/OUT{xp[XPIN2IDX[pin]]}V{k}'
    if pin in YPIN2IDX:
        return f'/IN{yp[YPIN2IDX[pin]]}V{k}'
    if pin == 36:
        return f'/CS{k}'
    return CTRL.get(pin)


# ------------------- Hungarian (Kuhn-Munkres) O(n^3) -------------------
def hungarian(cost):
    """cost n x n (kosten minimaliseren). Geeft assign[i]=j (rij i -> kolom j)."""
    n = len(cost)
    INF = float('inf')
    u = [0.0] * (n + 1)
    v = [0.0] * (n + 1)
    p = [0] * (n + 1)
    way = [0] * (n + 1)
    for i in range(1, n + 1):
        p[0] = i
        j0 = 0
        minv = [INF] * (n + 1)
        used = [False] * (n + 1)
        while True:
            used[j0] = True
            i0 = p[j0]
            delta = INF
            j1 = -1
            for j in range(1, n + 1):
                if not used[j]:
                    cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
                    if cur < minv[j]:
                        minv[j] = cur
                        way[j] = j0
                    if minv[j] < delta:
                        delta = minv[j]
                        j1 = j
            for j in range(0, n + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break
    assign = [0] * n
    for j in range(1, n + 1):
        assign[p[j] - 1] = j - 1
    return assign


# ------------------- floorplan-coordinaten (gedeeld dry-run/echt) -------------------
# chips rot 0, anker = pin1. Per zijde 2 chipkolommen met een TUSSENKANAAL
# ertussen (rev 0.2b): de binnenste OUT-subkolom staat IN dat kanaal, zodat
# elke chip aan beide zijden een headerkolom naast zich heeft. Spiegel-as =
# bordmidden x=129.5 (control-strook).
CHIP_XY = {1: (58, 45), 2: (83.7, 45), 3: (58, 105), 4: (83.7, 105),
           5: (160.1, 45), 6: (185.8, 45), 7: (160.1, 105), 8: (185.8, 105)}
# OUT-headers (rot 0): buitenrand west x=48 / oost x=211; tussenkanalen
# x=78.5 (tussen U1/U3 en U2/U4) en x=180.5 (tussen U5/U7 en U6/U8).
_OUT_ROWS = [38, 68, 98, 128]
OUT_XY = {}
for _i, _u in enumerate(range(1, 5)):      # west tussenkanaal
    OUT_XY[_u] = (78.5, _OUT_ROWS[_i], 0)
for _i, _u in enumerate(range(5, 9)):      # west buitenrand
    OUT_XY[_u] = (48, _OUT_ROWS[_i], 0)
for _i, _u in enumerate(range(9, 13)):     # oost tussenkanaal
    OUT_XY[_u] = (180.5, _OUT_ROWS[_i], 0)
for _i, _u in enumerate(range(13, 17)):    # oost buitenrand
    OUT_XY[_u] = (211, _OUT_ROWS[_i], 0)
# IN-headers (rot 90, pads lopen +x vanaf anker): 4 noord (y=32), 4 zuid (y=162).
_IN_COLS = [52, 80, 156.1, 184.1]
IN_XY = {}
for _i, _b in enumerate(range(1, 5)):
    IN_XY[_b] = (_IN_COLS[_i], 32, 90)
for _i, _b in enumerate(range(5, 9)):
    IN_XY[_b] = (_IN_COLS[_i], 162, 90)

if VARIANT == 'center':
    # "Gedistribueerd midden" (schets 6): 4 chipkolommen x 2 rijen; OUT-
    # headers in de verticale kanalen tussen de kolommen (4-8-4, midden
    # dubbel), IN-headers in 2 horizontale rijen in de middengap. Logica op
    # de weststrook. Elke chip raakt zo max ~2 kolombreedtes van elke header.
    CHIP_XY = {1: (91, 45), 2: (116.4, 45), 3: (146.9, 45), 4: (172.5, 45),
               5: (91, 113.5), 6: (116.4, 113.5), 7: (146.9, 113.5),
               8: (172.5, 113.5)}
    _VCOLS = [111.3, 136.7, 141.8, 167.4]      # V1, V2a, V2b, V3
    _ROWS_C = [40, 66.4, 112, 138.4]           # 2 boven, 2 onder de middengap
    OUT_XY = {}
    for _c in range(4):
        for _i in range(4):
            OUT_XY[4 * _c + _i + 1] = (_VCOLS[_c], _ROWS_C[_i], 0)
    _IN_COLS_C = [86, 112.6, 142.4, 169.0]   # pitch >= courtyard 26.4
    IN_XY = {}
    for _i in range(4):
        IN_XY[_i + 1] = (_IN_COLS_C[_i], 99.4, 90)     # middengap rij A
        IN_XY[_i + 5] = (_IN_COLS_C[_i], 105.6, 90)    # middengap rij B

# footprints
DIP40 = ('Package_DIP.pretty\\DIP-40_W15.24mm.kicad_mod',
         'Package_DIP:DIP-40_W15.24mm')
SOIC16 = ('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
          'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm')
HDR10 = ('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x10_P2.54mm_Vertical.kicad_mod',
         'Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Vertical')
SOCK12 = ('Connector_PinSocket_2.54mm.pretty\\PinSocket_2x12_P2.54mm_Vertical.kicad_mod',
          'Connector_PinSocket_2.54mm:PinSocket_2x12_P2.54mm_Vertical')
TO220 = ('Package_TO_SOT_THT.pretty\\TO-220-3_Vertical.kicad_mod',
         'Package_TO_SOT_THT:TO-220-3_Vertical')
TO92 = ('Package_TO_SOT_THT.pretty\\TO-92_Inline.kicad_mod',
        'Package_TO_SOT_THT:TO-92_Inline')
C0805 = ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
         'Capacitor_SMD:C_0805_2012Metric')
CPEL = ('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
        'Capacitor_SMD:CP_Elec_4x5.3')

# lokale courtyard-AABB's (uit de fp-bestanden gelezen, niet geschat)
LOCAL_CRT = {
    DIP40[1]: (-1.05, -1.53, 16.29, 49.78),
    SOIC16[1]: (-3.70, -5.34, 3.70, 5.20),
    HDR10[1]: (-1.77, -1.77, 1.77, 24.63),
    SOCK12[1]: (-4.31, -1.77, 1.77, 29.71),
    TO220[1]: (-2.71, -3.40, 7.79, 1.50),
    TO92[1]: (-1.46, -2.73, 4.00, 2.01),
    C0805[1]: (-1.70, -0.98, 1.70, 0.98),
    CPEL[1]: (-3.35, -2.40, 3.35, 2.40),
}

# ------------------- NETS -------------------
NETS = ['', '+12V', '-12V', 'GND', '/SCLK', '/MOSI', '/CS',
        '/VDD6', '/VEE6', '/V5', '/S1',
        '/AX0', '/AX1', '/AX2', '/AX3', '/AY0', '/AY1', '/AY2',
        '/DATA', '/STB', '/RST', '/G0', '/G1', '/G2', '/DECEN']
NETS += [f'/CS{k}' for k in range(1, 9)]
for bb in range(1, 9):
    NETS += [f'/IN{bb}V{v}' for v in range(1, 9)]
for u in range(1, 17):
    NETS += [f'/OUT{u}V{v}' for v in range(1, 9)]

if VARIANT == 'edge':
    BX0, BY0, BX1, BY1 = 42.0, 26.0, 217.0, 168.0   # 175 x 142 landscape
else:
    BX0, BY0, BX1, BY1 = 42.0, 36.0, 196.0, 169.0   # 154 x 133 landscape


# ------------------- DRY-RUN: plaats chips+headers, lees pad-posities -------------------
def place_geometry(bd, nm_chip, nm_uit, nm_in):
    for k in range(1, 9):
        x, y = CHIP_XY[k]
        bd.fp(*DIP40, f'U{k}', 'MT8816AE', x, y, 0, nm_chip(k))
    for u in range(1, 17):
        x, y, rot = OUT_XY[u]
        bd.fp(*HDR10, f'JOUT{u}', f'OUT{u}', x, y, rot, nm_uit(u))
    for bb in range(1, 9):
        x, y, rot = IN_XY[bb]
        bd.fp(*HDR10, f'JIN{bb}', f'IN{bb}', x, y, rot, nm_in(bb))


bdry = Board("dry", REV, (0, 0, 0), BX0, BY0, BX1, BY1, NETS, DATE)
place_geometry(bdry, lambda k: {}, lambda u: {}, lambda b: {})

XP, YP = {}, {}          # per chip: xindex->OUT-bus, yindex->IN-bus
XCOST, YCOST = 0.0, 0.0
for k in range(1, 9):
    cx = [[0.0] * 16 for _ in range(16)]
    for xi in range(16):
        px, py = bdry.P[f'U{k}'][str(XIDX2PIN[xi])]
        for uj in range(16):
            tx, ty = bdry.P[f'JOUT{uj + 1}'][str(k + 1)]
            cx[xi][uj] = math.hypot(px - tx, py - ty)
    ax = hungarian(cx)
    XP[k] = {xi: ax[xi] + 1 for xi in range(16)}
    XCOST += sum(cx[xi][ax[xi]] for xi in range(16))
    cy = [[0.0] * 8 for _ in range(8)]
    for yi in range(8):
        px, py = bdry.P[f'U{k}'][str(YIDX2PIN[yi])]
        for bj in range(8):
            tx, ty = bdry.P[f'JIN{bj + 1}'][str(k + 1)]
            cy[yi][bj] = math.hypot(px - tx, py - ty)
    ay = hungarian(cy)
    YP[k] = {yi: ay[yi] + 1 for yi in range(8)}
    YCOST += sum(cy[yi][ay[yi]] for yi in range(8))

print("=" * 68)
print("PER-CHIP AX/AY -> BUS MAPPING (firmware: group g -> chip U(g+1))")
print("=" * 68)
for k in range(1, 9):
    xrow = "  ".join(f"AX{xi:>2}->OUT{XP[k][xi]:<2}" for xi in range(16))
    print(f"U{k} (group {k-1}):")
    print("   " + "  ".join(f"AX{xi}->OUT{XP[k][xi]}" for xi in range(16)))
    print("   " + "  ".join(f"AY{yi}->IN{YP[k][yi]}" for yi in range(8)))
print(f"totale X-toewijzingskost {XCOST:.1f} mm, Y {YCOST:.1f} mm, "
      f"som {XCOST + YCOST:.1f} mm")
print("=" * 68)


# ------------------- schema-symbolen (silicon-pinnamen) -------------------
def _et(nm):
    if nm in ("VSS", "VEE", "VDD"):
        return "power_in"
    if nm == "NC":
        return "no_connect"
    if nm in ("AY2", "RESET", "AX3", "AX0", "STROBE", "DATA", "CS",
              "AY1", "AY0", "AX2", "AX1"):
        return "input"
    return "passive"


MT_L_NAMES = ["Y3", "AY2", "RESET", "AX3", "AX0", "X14", "X15", "X6", "X7",
              "X8", "X9", "X10", "X11", "NC", "Y7", "VSS", "Y6", "STROBE",
              "Y5", "VEE"]                       # pins 1..20
MT_R_NAMES = ["VDD", "Y2", "DATA", "Y1", "CS", "Y0", "NC", "X0", "X1", "X2",
              "X3", "X4", "X5", "X12", "X13", "AY1", "AY0", "AX2", "AX1",
              "Y4"]                              # pins 40..21
MT_L = [(str(i + 1), MT_L_NAMES[i], _et(MT_L_NAMES[i])) for i in range(20)]
MT_R = [(str(40 - i), MT_R_NAMES[i], _et(MT_R_NAMES[i])) for i in range(20)]

SR_L = [("15", "QA", "output"), ("1", "QB", "output"), ("2", "QC", "output"),
        ("3", "QD", "output"), ("4", "QE", "output"), ("5", "QF", "output"),
        ("6", "QG", "output"), ("7", "QH", "output")]
SR_R = [("16", "VCC", "power_in"), ("14", "SER", "input"),
        ("11", "SRCLK", "input"), ("12", "RCLK", "input"),
        ("10", "~{SRCLR}", "input"), ("13", "~{OE}", "input"),
        ("9", "QH'", "output"), ("8", "GND", "power_in")]
DEC_L = [("1", "A0", "input"), ("2", "A1", "input"), ("3", "A2", "input"),
         ("4", "~{E1}", "input"), ("5", "~{E2}", "input"),
         ("6", "E3", "input"), ("8", "GND", "power_in")]
DEC_R = [("16", "VCC", "power_in"), ("15", "Y0", "output"),
         ("14", "Y1", "output"), ("13", "Y2", "output"), ("12", "Y3", "output"),
         ("11", "Y4", "output"), ("10", "Y5", "output"), ("9", "Y6", "output"),
         ("7", "Y7", "output")]
REG78_L = [("1", "IN", "power_in"), ("2", "GND", "power_in")]
REG78_R = [("3", "OUT", "power_out")]
REG79_L = [("2", "IN", "power_in"), ("1", "GND", "power_in")]
REG79_R = [("3", "OUT", "power_out")]
REG78L_L = [("3", "IN", "power_in"), ("2", "GND", "power_in")]
REG78L_R = [("1", "OUT", "power_out")]

# ================= SCHEMA =================
s = Sch("aa160000-0000-4000-8000-00000000000" + ("0" if VARIANT == 'edge' else "1"),
        BASE,
        "MusicBrain MATRIX - 8-stemmige audio-patchmatrix (8x MT8816)", REV,
        DATE,
        ("8 chips MT8816; adres/data/strobe GEDEELD, CS per chip via 74HC238",
         "8 IN-bussen (Y) x 16 OUT-bussen (X), jack8-contract 1x10 per bus",
         "VDD +6V / VEE -6V (audio +-5V nom.); 2x 74AHCT595 + 74HC238 op SPI"))
s.libs += [R_SYM, C_SYM, CP_SYM, FLAG_SYM,
           conn_symbol("Conn_02x12", 12), conn1_symbol("Conn_01x10", 10),
           box_symbol("MT8816", MT_L, MT_R, width=20.32),
           box_symbol("74AHCT595", SR_L, SR_R),
           box_symbol("74HC238", DEC_L, DEC_R),
           box_symbol("L7806", REG78_L, REG78_R),
           box_symbol("L7906", REG79_L, REG79_R),
           box_symbol("78L05", REG78L_L, REG78L_R),
           power_symbol("GND", False), power_symbol("+12V", True),
           power_symbol("-12V", False)]

# J1 = buskabel (slotcontract 2x12; alleen GND/12V/SPI gebruikt)
JX, JY = 45, 60
s.component("Custom:Conn_02x12", "J1", "BUS (kabel, 2x12)", JX, JY, 0,
            "Connector_PinSocket_2.54mm:PinSocket_2x12_P2.54mm_Vertical")
for q in range(1, bus.SLOT_PINS + 1):
    row = (q - 1) // 2
    west = (q % 2 == 1)
    y = JY - 13.97 + 2.54 * row
    x = JX + (-7.62 if west else 7.62)
    xe = JX + (-12.7 if west else 12.7)
    net = bus.SLOT[q]
    if net not in GEBRUIKT:
        s.nc(x, y)
    elif net in ('GND', '+12V', '-12V'):
        s.wire(x, y, xe, y)
        s.power(f"power:{net}", xe, y, 0, vx=xe,
                vy=(y + 3.81 if net in ('GND', '-12V') else y - 3.302))
    else:
        s.wire(x, y, xe, y)
        s.label(net.lstrip('/'), xe, y)

# 2x 74AHCT595 (SPI -> parallelle matrixbesturing; RCLK = CS-flank)
for un, uy, L in (("U9", 130,
                   ["AX0", "AX1", "AX2", "AX3", "AY0", "AY1", "AY2", "DATA"]),
                  ("U10", 185,
                   ["STB", "RST", "G0", "G1", "G2", "DECEN", None, None])):
    s.component("Custom:74AHCT595", un, "74AHCT595", 45, uy, 0,
                "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
    off = 7 * 1.27
    for k, nm in enumerate(L):
        y = uy - off + 2.54 * k
        xp, xe = 45 - 11.43, 45 - 13.97
        if nm is None:
            s.nc(xp, y)
        else:
            s.wire(xp, y, xe, y)
            s.label(nm, xe, y)
    R = ["V5!", "SER_" + un, "SCLK", "CS", "V5!", "GND!", "QH_" + un, "GND!"]
    for k, nm in enumerate(R):
        y = uy - off + 2.54 * k
        xp, xe = 45 + 11.43, 45 + 13.97
        if nm == "SER_U9":
            s.wire(xp, y, xe, y)
            s.label("MOSI", xe, y)
        elif nm == "SER_U10":
            s.wire(xp, y, xe, y)
            s.label("S1", xe, y)
        elif nm == "QH_U9":
            s.wire(xp, y, xe, y)
            s.label("S1", xe, y)
        elif nm == "QH_U10":
            s.nc(xp, y)
        elif nm.endswith("!"):
            r = nm[:-1]
            if r == "V5":
                s.wire(xp, y, xe, y)
                s.label("V5", xe, y)
            else:
                s.wire(xp, y, xe, y)
                s.power("power:GND", xe, y, 0, vx=xe, vy=y + 3.81)
        else:
            s.wire(xp, y, xe, y)
            s.label(nm, xe, y)

# 74HC238 U14 (decoder: G0-2/DECEN -> CS1..CS8)
UX, UY = 110, 185
s.component("Custom:74HC238", "U14", "74HC238", UX, UY, 0,
            "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
off = (9 - 1) * 1.27
for j, (num, nm, et) in enumerate(DEC_L):
    y = UY - off + 2.54 * j
    xp, xe = UX - 11.43, UX - 13.97
    if nm in ("~{E1}", "~{E2}", "GND"):
        s.wire(xp, y, xe, y)
        s.power("power:GND", xe, y, 0, vx=xe, vy=y + 3.81)
    else:
        lbl = {"A0": "G0", "A1": "G1", "A2": "G2", "E3": "DECEN"}[nm]
        s.wire(xp, y, xe, y)
        s.label(lbl, xe, y)
for j, (num, nm, et) in enumerate(DEC_R):
    y = UY - off + 2.54 * j
    xp, xe = UX + 11.43, UX + 13.97
    if nm == "VCC":
        s.wire(xp, y, xe, y)
        s.label("V5", xe, y)
    else:
        idx = int(nm[1:])           # Y0..Y7 -> CS1..CS8
        s.wire(xp, y, xe, y)
        s.label(f"CS{idx + 1}", xe, y)

# regelaars: +6 (VDD6), -6 (VEE6), +5 logic
s.component("Custom:L7806", "U11", "L7806", 45, 235, 0,
            "Package_TO_SOT_THT:TO-220-3_Vertical")
s.wire(45 - 11.43, 233.73, 45 - 16.51, 233.73)
s.power("power:+12V", 45 - 16.51, 233.73, vx=45 - 16.51, vy=233.73 - 3.302)
s.wire(45 - 11.43, 236.27, 45 - 16.51, 236.27)
s.power("power:GND", 45 - 16.51, 236.27)
s.wire(45 + 11.43, 233.73, 45 + 16.51, 233.73)
s.label("VDD6", 45 + 16.51, 233.73)
s.component("Custom:L7906", "U12", "L7906", 45, 260, 0,
            "Package_TO_SOT_THT:TO-220-3_Vertical")
s.wire(45 - 11.43, 258.73, 45 - 16.51, 258.73)
s.power("power:-12V", 45 - 16.51, 258.73, vx=45 - 16.51, vy=258.73 + 3.81)
s.wire(45 - 11.43, 261.27, 45 - 16.51, 261.27)
s.power("power:GND", 45 - 16.51, 261.27)
s.wire(45 + 11.43, 258.73, 45 + 16.51, 258.73)
s.label("VEE6", 45 + 16.51, 258.73)
s.component("Custom:78L05", "U13", "78L05", 45, 285, 0,
            "Package_TO_SOT_THT:TO-92_Inline")
s.wire(45 - 11.43, 283.73, 45 - 16.51, 283.73)
s.power("power:+12V", 45 - 16.51, 283.73, vx=45 - 16.51, vy=283.73 - 3.302)
s.wire(45 - 11.43, 286.27, 45 - 16.51, 286.27)
s.power("power:GND", 45 - 16.51, 286.27)
s.wire(45 + 11.43, 285 - 1.27, 45 + 16.51, 285 - 1.27)
s.label("V5", 45 + 16.51, 285 - 1.27)

# 8x MT8816 (U1..U8 = stem 1..8); labels uit de per-chip permutaties
for k in range(1, 9):
    ux = 140 if k <= 4 else 230
    uy = 60 + 60 * ((k - 1) % 4)
    s.component("Custom:MT8816", f"U{k}", "MT8816AE", ux, uy, 0,
                "Package_DIP:DIP-40_W15.24mm")
    off = 19 * 1.27
    hw = 10.16
    for side, spec in (("L", MT_L), ("R", MT_R)):
        for j, (num, nm, et) in enumerate(spec):
            y = uy - off + 2.54 * j
            xp = ux - (hw + 2.54) if side == "L" else ux + (hw + 2.54)
            xe = xp - 2.54 if side == "L" else xp + 2.54
            net = chip_net(k, int(num), XP[k], YP[k])
            if net is None:
                s.nc(xp, y)
            elif net == 'GND':
                s.wire(xp, y, xe, y)
                s.power("power:GND", xe, y, 0, vx=xe, vy=y + 3.81)
            else:
                s.wire(xp, y, xe, y)
                s.label(net.lstrip('/'), xe, y)

# 24x 1x10-busconnector (1=GND, 2-9=stem, 10=GND)
CONNS = ([(f"JIN{b}", f"IN{b}") for b in range(1, 9)]
         + [(f"JOUT{u}", f"OUT{u}") for u in range(1, 17)])
for i, (ref, pfx) in enumerate(CONNS):
    cx = 320 + 45 * (i // 8)
    cy = 45 + 33 * (i % 8)
    s.component("Custom:Conn_01x10", ref, pfx, cx, cy, 0,
                "Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Vertical")
    for p in range(10):
        y = cy - 11.43 + 2.54 * p
        s.wire(cx - 7.62, y, cx - 12.7, y)
        if p in (0, 9):
            s.power("power:GND", cx - 12.7, y)
        else:
            s.label(f"{pfx}V{p}", cx - 12.7, y)

# ontkoppeling: 100n VDD+VEE per chip, 595's, 238, reg-elco's
CAPS = ([(f"C{k}", "100n", "VDD6") for k in range(1, 9)]
        + [(f"C{10+k}", "100n", "VEE6") for k in range(1, 9)]
        + [("C21", "100n", "V5"), ("C22", "100n", "V5"),
           ("C23", "100n", "V5"),
           ("C31", "10u", "+12V"), ("C32", "10u", "VDD6"),
           ("C33", "10u", "-12V"), ("C34", "10u", "VEE6"),
           ("C35", "10u", "V5")])
for i, (ref, val, rail) in enumerate(CAPS):
    x = 90 + 12 * i
    lib = "Device:C_Polarized" if val == "10u" else "Device:C"
    fp = ("Capacitor_SMD:CP_Elec_4x5.3" if val == "10u"
          else "Capacitor_SMD:C_0805_2012Metric")
    s.component(lib, ref, val, x, 300, 0, fp)
    if rail in ("+12V", "-12V"):
        s.wire(x, 296.19, x, 293.83)
        s.power(f"power:{rail}", x, 293.83, vx=x,
                vy=(293.83 + 3.81 if rail == "-12V" else 293.83 - 3.302))
    else:
        s.wire(x, 296.19, x, 294.5)
        s.label(rail, x, 294.5)
    s.wire(x, 303.81, x, 306.17)
    s.power("power:GND", x, 306.17)

# flags
for k, rail in enumerate(("+12V", "-12V", "GND")):
    x1 = 90 + 14 * k
    s.wire(x1, 30, x1 + 5.08, 30)
    s.power(f"power:{rail}", x1, 30,
            vx=x1, vy=(30 + 3.81 if rail in ("GND", "-12V") else 30 - 3.302))
    s.flag(x1 + 5.08, 30)

s.text("MATRIX: 8x MT8816 (chip k = stem k). Adres/data/strobe/reset GEDEELD;\\n"
       "CS per chip via 74HC238 (G2G1G0 = group -> Y(group) -> CS(group+1)).\\n"
       "Besturing: U9 (AX0-3/AY0-2/DATA) + U10 (STB/RST/G0-2/DECEN) = AHCT595-\\n"
       "daisy aan slot-SPI; RCLK = CS-flank. Per-chip X->OUT / Y->IN toewijzing\\n"
       "geoptimaliseerd op draadlengte (zie generator-stdout voor de tabel).\\n"
       "VDD6 = +6V, VEE6 = -6V (audio +-5V nom); V5 = logic. Contract 1x10:\\n"
       "1 = GND, 2-9 = stem 1-8, 10 = GND (jack8).", 150, 22)
s.write(OUT_DIR + "\\" + BASE + ".kicad_sch")

# ================= PCB =================
_TITLE = ("MusicBrain MATRIX - 8-stemmige audio-patchmatrix"
          + (" (center-variant)" if VARIANT == 'center' else ""))
_SILK_AT = (129, 157, 0) if VARIANT == 'edge' else (64, 161, 0)
b = Board(_TITLE, REV, _SILK_AT, BX0, BY0, BX1, BY1, NETS, DATE)
b.silk_name = 'matrix' if VARIANT == 'edge' else 'matrix-c'
b.paper = "A3"
b.copper = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']
# IN-headers zijn rot 90: lib-label valt onder de body -> herplaatsen
# (rot 90: global = anker + (ly, -lx)). Noord: 3,9 mm boven de rij;
# zuid: 3,9 mm eronder. Gecentreerd over de 10 pinnen (ly = 11.43).
b.ref_at = {f'JIN{n}': (3.9, 11.43) for n in range(1, 5)}
b.ref_at.update({f'JIN{n}': (-3.9, 11.43) for n in range(5, 9)})
if VARIANT == 'center':
    # JOUT-labels verticaal NAAST de header (kanalen zijn te krap voor
    # horizontale labels; V2a west / V2b oost zodat ze elkaar niet raken).
    _LBL_DX = {111.3: 2.6, 136.7: -2.6, 141.8: 2.6, 167.4: -2.6}
    for _u, (_hx, _hy, _hr) in OUT_XY.items():
        b.ref_at[f'JOUT{_u}'] = (_LBL_DX[_hx], 11.43, 90)


def mtmap(k):
    m = {}
    for num in range(1, 41):
        net = chip_net(k, num, XP[k], YP[k])
        if net:
            m[str(num)] = net
    return b.nm(m)


def outmap(u):
    return b.nm({'1': 'GND', '10': 'GND',
                 **{str(k + 1): f'/OUT{u}V{k}' for k in range(1, 9)}})


def inmap(bb):
    return b.nm({'1': 'GND', '10': 'GND',
                 **{str(k + 1): f'/IN{bb}V{k}' for k in range(1, 9)}})


def srmap(which):
    if which == 1:      # U9: adres + data
        q = {'15': '/AX0', '1': '/AX1', '2': '/AX2', '3': '/AX3',
             '4': '/AY0', '5': '/AY1', '6': '/AY2', '7': '/DATA',
             '9': '/S1', '14': '/MOSI'}
    else:               # U10: strobe/reset + G0-2/DECEN
        q = {'15': '/STB', '1': '/RST', '2': '/G0', '3': '/G1',
             '4': '/G2', '5': '/DECEN', '14': '/S1'}
    q.update({'16': '/V5', '10': '/V5', '11': '/SCLK', '12': '/CS',
              '13': 'GND', '8': 'GND'})
    return b.nm(q)


def decmap():
    return b.nm({'1': '/G0', '2': '/G1', '3': '/G2', '4': 'GND', '5': 'GND',
                 '6': '/DECEN', '7': '/CS8', '9': '/CS7', '10': '/CS6',
                 '11': '/CS5', '12': '/CS4', '13': '/CS3', '14': '/CS2',
                 '15': '/CS1', '8': 'GND', '16': '/V5'})


J1_MAP = bus.j1_map(b, GEBRUIKT)

# --- plaats chips + headers (echte netten) ---
place_geometry(b, mtmap, outmap, inmap)

# --- ontkoppel-100n per MT8816 bij de voedingspinnen (kanaal = headers):
#     VDD-C (C1..C8) bij pin 40 (rechtsboven), VEE-C (C11..C18) bij pin 20
#     (linksonder); boven de chip / in de rij-tussengap / onder de chip. ---
DECPOS = {1: (73.2, 41), 11: (58, 97.5), 2: (98.9, 41), 12: (83.7, 97.5),
          3: (73.2, 101), 13: (58, 158), 4: (98.9, 101), 14: (83.7, 158),
          5: (175.3, 41), 15: (160.1, 97.5), 6: (201, 41), 16: (185.8, 97.5),
          7: (175.3, 101), 17: (160.1, 158), 8: (201, 101), 18: (185.8, 158)}
if VARIANT == 'center':
    DECPOS = {}
    for _k in (1, 2, 3, 4):                       # rij 1
        _ax = CHIP_XY[_k][0]
        DECPOS[_k] = (_ax + 15.24, 41.0)          # VDD boven de chip
        DECPOS[10 + _k] = (_ax, 96.2)             # VEE in de middengap
    for _k in (5, 6, 7, 8):                       # rij 2
        _ax = CHIP_XY[_k][0]
        DECPOS[_k] = (_ax + 15.24, 109.7)         # VDD in de middengap
        DECPOS[10 + _k] = (_ax, 165.8)            # VEE onder de chip

# control+voedingsstrook: edge = centraal, center = weststrook
CTRL_POS = {
    'J1': (129.0, 42.0), 'U9': (120.0, 82.0), 'U14': (129.5, 82.0),
    'U10': (139.0, 82.0), 'C21': (120.0, 90.5), 'C23': (129.5, 90.5),
    'C22': (139.0, 90.5), 'U11': (120.0, 105.0), 'U12': (120.0, 118.0),
    'U13': (138.0, 110.0), 'C31': (120.0, 130.0), 'C32': (139.0, 130.0),
    'C33': (120.0, 140.0), 'C34': (139.0, 140.0), 'C35': (129.5, 148.0)}
if VARIANT == 'center':
    CTRL_POS = {
        'J1': (52.0, 42.0), 'U9': (64.0, 85.0), 'U14': (64.0, 100.0),
        'U10': (64.0, 115.0), 'C21': (71.5, 85.0), 'C23': (71.5, 100.0),
        'C22': (71.5, 115.0), 'U11': (52.0, 130.0), 'U12': (52.0, 141.0),
        'U13': (52.0, 150.0), 'C31': (66.0, 130.0), 'C32': (74.0, 130.0),
        'C33': (66.0, 140.0), 'C34': (74.0, 140.0), 'C35': (66.0, 150.0)}
for k in range(1, 9):
    x, y = DECPOS[k]
    b.fp(*C0805, f'C{k}', '100n', x, y, 0, b.rc('/VDD6', 'GND'))
    x, y = DECPOS[10 + k]
    b.fp(*C0805, f'C{10+k}', '100n', x, y, 0, b.rc('/VEE6', 'GND'))

# --- control+voedingsstrook (posities per variant in CTRL_POS) ---
b.fp(*SOCK12, 'J1', 'BUS', *CTRL_POS['J1'], 0, J1_MAP)
b.fp(*SOIC16, 'U9', '74AHCT595', *CTRL_POS['U9'], 0, srmap(1))
b.fp(*SOIC16, 'U14', '74HC238', *CTRL_POS['U14'], 0, decmap())
b.fp(*SOIC16, 'U10', '74AHCT595', *CTRL_POS['U10'], 0, srmap(2))
b.fp(*C0805, 'C21', '100n', *CTRL_POS['C21'], 0, b.rc('/V5', 'GND'))
b.fp(*C0805, 'C23', '100n', *CTRL_POS['C23'], 0, b.rc('/V5', 'GND'))
b.fp(*C0805, 'C22', '100n', *CTRL_POS['C22'], 0, b.rc('/V5', 'GND'))
b.fp(*TO220, 'U11', 'L7806', *CTRL_POS['U11'], 0,
     b.nm({'1': '+12V', '2': 'GND', '3': '/VDD6'}))
b.fp(*TO220, 'U12', 'L7906', *CTRL_POS['U12'], 0,
     b.nm({'1': 'GND', '2': '-12V', '3': '/VEE6'}))
b.fp(*TO92, 'U13', '78L05', *CTRL_POS['U13'], 0,
     b.nm({'1': '/V5', '2': 'GND', '3': '+12V'}))
b.fp(*CPEL, 'C31', '10u', *CTRL_POS['C31'], 0, b.rc('+12V', 'GND'))
b.fp(*CPEL, 'C32', '10u', *CTRL_POS['C32'], 0, b.rc('/VDD6', 'GND'))
b.fp(*CPEL, 'C33', '10u', *CTRL_POS['C33'], 0, b.rc('-12V', 'GND'))
b.fp(*CPEL, 'C34', '10u', *CTRL_POS['C34'], 0, b.rc('/VEE6', 'GND'))
b.fp(*CPEL, 'C35', '10u', *CTRL_POS['C35'], 0, b.rc('/V5', 'GND'))

# --- signalen via freerouting (SES); GND via de vlakken (4 lagen) ---
from seslib import apply_ses
_ses = os.path.join(OUT_DIR, BASE + ".ses")
if os.path.exists(_ses):
    _nt, _nv = apply_ses(b, _ses)
    print(f"SES: {_nt} sporen, {_nv} vias overgenomen")
    print(f"snap_stubs: {b.snap_stubs()} stubs aangevuld")

# GND-hechtvia's: hoeken + randmiddens; eiland-via's uit gnd_stitch.json.
# Edge-variant extra: 2 via's op de GND-padteen (pin 13) van U9/U10 — de
# F.Cu-sliver rond die pads raakt anders geisoleerd (te vol voor gnd_stitch;
# handmatig geijkt op >=0.29 mm randafstand, alle lagen).
GNDVIAS = [(BX0 + 2, BY0 + 2), (BX1 - 2, BY0 + 2),
           (BX0 + 2, BY1 - 2), (BX1 - 2, BY1 - 2),
           ((BX0 + BX1) / 2, BY0 + 2), ((BX0 + BX1) / 2, BY1 - 2),
           (BX0 + 2, (BY0 + BY1) / 2), (BX1 - 2, (BY0 + BY1) / 2)]
if VARIANT == 'edge':
    GNDVIAS += [(122.125, 81.215), (141.225, 81.015)]
for _vx, _vy in GNDVIAS:
    b.V('GND', _vx, _vy)
import json as _json
_sf = os.path.join(OUT_DIR, 'gnd_stitch.json')
if os.path.exists(_sf):
    _st = _json.load(open(_sf))
    for _sx, _sy in _st:
        b.V('GND', _sx, _sy)
    print("gnd_stitch-via's:", len(_st))

# --- courtyard-zelfcheck (AABB uit de fp-bestanden) ---
PLACED = []
for k in range(1, 9):
    PLACED.append((f'U{k}', DIP40[1], *CHIP_XY[k], 0))
for u in range(1, 17):
    PLACED.append((f'JOUT{u}', HDR10[1], *OUT_XY[u]))
for bb in range(1, 9):
    PLACED.append((f'JIN{bb}', HDR10[1], *IN_XY[bb]))
for k in range(1, 9):
    PLACED.append((f'C{k}', C0805[1], *DECPOS[k], 0))
    PLACED.append((f'C{10+k}', C0805[1], *DECPOS[10 + k], 0))
_CTRL_FP = {'J1': SOCK12, 'U9': SOIC16, 'U14': SOIC16, 'U10': SOIC16,
            'C21': C0805, 'C23': C0805, 'C22': C0805, 'U11': TO220,
            'U12': TO220, 'U13': TO92, 'C31': CPEL, 'C32': CPEL,
            'C33': CPEL, 'C34': CPEL, 'C35': CPEL}
PLACED += [(_r, _CTRL_FP[_r][1], *CTRL_POS[_r], 0) for _r in _CTRL_FP]


def aabb(key, x, y, rot):
    x0, y0, x1, y1 = LOCAL_CRT[key]
    cs = [rotxy(px, py, rot) for px, py in
          ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    xs = [x + c[0] for c in cs]
    ys = [y + c[1] for c in cs]
    return (min(xs), min(ys), max(xs), max(ys))


BOXES = {ref: aabb(key, x, y, rot) for ref, key, x, y, rot in PLACED}
overlaps = []
refs = list(BOXES)
for i in range(len(refs)):
    for j in range(i + 1, len(refs)):
        a, c = BOXES[refs[i]], BOXES[refs[j]]
        ox = min(a[2], c[2]) - max(a[0], c[0])
        oy = min(a[3], c[3]) - max(a[1], c[1])
        if ox > 1e-6 and oy > 1e-6:
            overlaps.append((refs[i], refs[j], round(ox, 3), round(oy, 3)))
edge = []
for ref, (x0, y0, x1, y1) in BOXES.items():
    if x0 < BX0 or y0 < BY0 or x1 > BX1 or y1 > BY1:
        edge.append((ref, round(x0, 2), round(y0, 2), round(x1, 2),
                     round(y1, 2)))
if overlaps:
    print("COURTYARD-OVERLAPS:", overlaps)
if edge:
    print("BUITEN BORDRAND:", edge)
assert not overlaps, "courtyard-overlaps gevonden"
assert not edge, "footprint buiten de bordrand"
print(f"courtyard-zelfcheck OK ({len(PLACED)} footprints, 0 overlaps, "
      f"0 buiten rand). Bord {BX1-BX0:.0f} x {BY1-BY0:.0f} mm.")

b.write(OUT_DIR + "\\" + BASE + ".kicad_pcb")
print(f"written {BASE} (rev {REV}, variant {VARIANT})")
