"""MusicBrain RISER (gen 2) - generieke slot-verlenger (2x12 bus 1-op-1 omhoog).

Onder: haakse male 2x12 in het slot (slotpinout, spi-bus-spec v2.0). Boven:
haakse male 2x12 die de VOLLEDIGE bus meedraagt - inclusief de audio-lijnen
(MCLK/BCLK/LRCLK/I2S_DATA). Daarmee is dit het ontwikkelbord voor een
gedelegeerde Teensy-/FPGA-kaart: hele bus omhoog naar een breadboard.

De twee productie-sporen gebruiken hun eigen smalle riser (potriser = SPI +
MCP3208, i2criser = I2C-doorlus); die hebben een 1x10 front-contract.

J2 spiegelt J1 in x (rot90 vs rot270), dus J2 krijgt de nets via x-matching ->
alle banen lopen recht: J2-pin q draagt de slotfunctie van pin (24-q) [oneven]
of (26-q) [even]. Oneven rij recht omhoog; even rij met 1,27 offset langs de
padkolom (anders loopt hij door de oneven pad heen). GND via het vlak.
"""
import sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from cardlib import Board
import bus
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-riser"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-16"
REV = "2.0"

N = bus.SLOT_PINS                       # 24
SLOT = bus.SLOT
NETS = [''] + sorted(set(SLOT.values()))

BX0, BX1 = 100.0, 140.0                 # 40 mm (2x12 spant 27,94 + marge)
CX = (BX0 + BX1) / 2                    # 120.0
b = Board("MusicBrain RISER - slot-verlenger 2x12", REV,
          (CX, (bus.BY0 + bus.BY1) / 2, 0), BX0, bus.BY0, BX1, bus.BY1, NETS, DATE)
b.silk_name = 'riser'


def match(p):
    """J1-pin p ligt op dezelfde x als J2-pin match(p)."""
    return (N - p) if p % 2 else (N + 2 - p)


J1_MAP = b.nm({str(p): SLOT[p] for p in range(1, N + 1)})
J2_MAP = b.nm({str(q): SLOT[match(q)] for q in range(1, N + 1)})

b.fp(bus.HDR_BUS[0], bus.HDR_BUS[1], 'J1', 'BUS',
     CX + bus.BUS_HALF, bus.BY1 - bus.CONN_INSET, 270, J1_MAP)     # onder, in slot
b.fp(bus.HDR_BUS[0], bus.HDR_BUS[1], 'J2', 'NAAR FRONT',
     CX - bus.BUS_HALF, bus.BY0 + bus.CONN_INSET, 90, J2_MAP)      # boven

P = b.P
SW = 0.25
for p in range(1, N + 1):
    net = SLOT[p]
    if net == 'GND':
        continue                        # via het GND-vlak
    j1 = P['J1'][str(p)]
    j2 = P['J2'][str(match(p))]
    assert abs(j1[0] - j2[0]) < 0.01, (p, j1, j2)
    if p % 2:                           # oneven rij: recht omhoog (vrij van pads)
        b.T(net, 'F.Cu', SW, j1, j2)
    else:                               # even rij: langs de padkolom heen
        x = j1[0] + 1.27
        b.T(net, 'F.Cu', SW, j1, (x, j1[1]), (x, j2[1]), j2)

# GND-stitching (40x50)
MID = (bus.BY0 + bus.BY1) / 2
for x, y in ((102, bus.BY0 + 2), (138, bus.BY0 + 2), (102, bus.BY1 - 2),
             (138, bus.BY1 - 2), (102, MID), (138, MID),
             (105, MID - 7), (135, MID - 7), (105, MID + 7), (135, MID + 7)):
    b.V('GND', x, y)

b.write(OUT_DIR + r"\musicbrain-riser.kicad_pcb")

# ================= SCHEMA =================
from schlib import Sch, conn_symbol, power_symbol, FLAG_SYM
s = Sch("d0b00000-0000-4000-8000-000000000000", "musicbrain-riser",
        "MusicBrain RISER - slot-verlenger 2x12", REV, DATE,
        ("Generieke riser: hele 2x12 slot-bus 1-op-1 omhoog (incl. audio-lijnen).",
         "J2 spiegelt J1 in x; nets via x-matching. Zie doc/spi-bus-spec.md v2.0."))
s.libs += [conn_symbol("Conn_02x12", 12),
           power_symbol("GND", False), power_symbol("+3V3", True),
           power_symbol("+12V", True), power_symbol("-12V", False), FLAG_SYM]
PWR = {"GND", "+12V", "-12V", "+3V3"}


def place(ref, x, netmap):
    s.component("Custom:Conn_02x12", ref, ref, x, 110, 0, bus.HDR_BUS[1])
    for k in range(N // 2):
        y = 110 - (N // 2 - 1) * 1.27 + 2.54 * k
        for pin, xe in ((2 * k + 1, x - 7.62), (2 * k + 2, x + 7.62)):
            nm = netmap[pin]; ex = xe + (-5.08 if xe < x else 5.08)
            s.wire(xe, y, ex, y)
            if nm in PWR:
                s.power(f"power:{nm}", ex, y, 0, vx=ex,
                        vy=(y - 3.302 if nm in ("+3V3", "+12V") else y + 3.81))
            else:
                s.label(nm.lstrip('/'), ex, y)


place("J1", 70, SLOT)                                    # bus (slotpinout)
place("J2", 130, {q: SLOT[match(q)] for q in range(1, N + 1)})
s.text("RISER gen 2: hele 2x12-bus van het slot omhoog. Draagt ook de audio-lijnen\\n"
       "(MCLK/BCLK/LRCLK/I2S_DATA) - ontwikkelbord voor een gedelegeerde Teensy/FPGA.", 20, 30)
for i, rail in enumerate(("+12V", "-12V", "+3V3", "GND")):
    xf = 40 + 13 * i
    s.wire(xf, 46, xf + 5.08, 46)
    s.power(f"power:{rail}", xf, 46, 0, vx=xf,
            vy=(46 - 3.302 if rail in ("+3V3", "+12V") else 46 + 3.81))
    s.flag(xf + 5.08, 46)
s.write(OUT_DIR + r"\musicbrain-riser.kicad_sch")
print("written musicbrain-riser (gen 2)")
