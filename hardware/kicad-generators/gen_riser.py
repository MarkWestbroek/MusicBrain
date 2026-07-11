"""MusicBrain RISER - generieke slot-verlenger (2x10 bus 1-op-1 omhoog).

Onder: haakse male 2x10 in het slot (slotpinout). Boven: haakse male 2x10 naar
het front-bord (draagt de VOLLEDIGE bus mee). Front-borden (POT8/ENC/...) gebruiken
hun eigen deel. J2 spiegelt J1 in x (rot90 vs rot270), dus J2 krijgt de nets via
x-matching -> alle banen lopen recht (oneven rij F recht, even rij F met +1.27 offset;
GND via het vlak). Zie doc/spi-bus-spec.md voor de slotpinout.
"""
import sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from cardlib import Board
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-riser"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-09"

SLOT = {1: 'GND', 2: '+12V', 3: 'GND', 4: '-12V', 5: 'GND', 6: '+3V3',
        7: '/SCLK', 8: 'GND', 9: '/MOSI', 10: 'GND', 11: '/MISO', 12: 'GND',
        13: '/CS', 14: 'GND', 15: '/LDAC', 16: '/IRQ', 17: '/SDA', 18: '/SCL',
        19: '/SPARE1', 20: '/SPARE2'}

NETS = ['', 'GND', '+12V', '-12V', '+3V3', '/SCLK', '/MOSI', '/MISO', '/CS',
        '/LDAC', '/IRQ', '/SDA', '/SCL', '/SPARE1', '/SPARE2']
b = Board("MusicBrain RISER - slot-verlenger 2x10", "1.0", (117.5, 140, 0),
          102, 100, 133, 180, NETS, DATE)
b.silk_name = 'riser'
CX = 117.5
HDR = ('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x10_P2.54mm_Horizontal.kicad_mod',
       'Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Horizontal')

J1_MAP = b.nm({str(p): SLOT[p] for p in range(1, 21)})
# J2 (rot90) pin q ligt op de x van J1-pin (20-q) [oneven] of (22-q) [even]
J2_MAP = b.nm({str(q): SLOT[(20 - q) if q % 2 else (22 - q)] for q in range(1, 21)})

b.fp(HDR[0], HDR[1], 'J1', 'BUS', CX + 11.43, 173.42, 270, J1_MAP)   # onder, in slot
b.fp(HDR[0], HDR[1], 'J2', 'NAAR FRONT', CX - 11.43, 106.58, 90, J2_MAP)  # boven

P = b.P
SW = 0.25
# routeer alle niet-GND nets recht van J1-pad naar J2-pad (zelfde x, zelfde rij)
for p in range(1, 21):
    net = SLOT[p]
    if net == 'GND':
        continue                      # via het GND-vlak
    j1 = P['J1'][str(p)]
    # bijpassende J2-pin op dezelfde x/rij:
    q = (20 - p) if p % 2 else (22 - p)
    j2 = P['J2'][str(q)]
    assert abs(j1[0] - j2[0]) < 0.01, (p, j1, j2)
    if p % 2:                         # oneven rij: recht omhoog (vrij van pads)
        b.T(net, 'F.Cu', SW, j1, j2)
    else:                             # even rij: +1.27 offset langs de padkolom
        x = j1[0] + 1.27
        b.T(net, 'F.Cu', SW, j1, (x, j1[1]), (x, j2[1]), j2)

# GND-stitching
for x, y in ((104, 102), (131, 102), (104, 178), (131, 178), (104, 140),
             (131, 140), (117.5, 140), (110, 120), (125, 120), (110, 160), (125, 160)):
    b.V('GND', x, y)

b.write(OUT_DIR + r"\musicbrain-riser.kicad_pcb")

# ================= SCHEMA =================
from schlib import Sch, conn_symbol, power_symbol, FLAG_SYM
s = Sch("d0b00000-0000-4000-8000-000000000000", "musicbrain-riser",
        "MusicBrain RISER - slot-verlenger 2x10", "1.0", DATE,
        ("Generieke riser: 2x10 slot-bus 1-op-1 omhoog naar het front-bord.",
         "J2 spiegelt J1 in x; nets via x-matching. Zie doc/spi-bus-spec.md."))
s.libs += [conn_symbol("Conn_02x10", 10),
           power_symbol("GND", False), power_symbol("+3V3", True),
           power_symbol("+12V", True), power_symbol("-12V", False), FLAG_SYM]
PWR = {"GND", "+12V", "-12V", "+3V3"}

def place(ref, x, netmap):
    s.component("Custom:Conn_02x10", ref, ref, x, 110, 0,
                "Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Horizontal")
    for k in range(10):
        y = 110 - (10 - 1) * 1.27 + 2.54 * k
        for pin, xe in ((2*k+1, x-7.62), (2*k+2, x+7.62)):
            nm = netmap[pin]; ex = xe + (-5.08 if xe < x else 5.08)
            s.wire(xe, y, ex, y)
            if nm in PWR:
                s.power(f"power:{nm}", ex, y, 0, vx=ex, vy=(y-3.302 if nm in ("+3V3","+12V") else y+3.81))
            else:
                s.label(nm.lstrip('/'), ex, y)

place("J1", 70, SLOT)                                   # bus (slotpinout)
place("J2", 130, {q: SLOT[(20-q) if q % 2 else (22-q)] for q in range(1, 21)})
s.text("RISER: hele 2x10-bus van het slot omhoog naar het front-bord; elk front (POT8=SPI, ENC=I2C) gebruikt zijn eigen deel.", 20, 30)
for i, rail in enumerate(("+12V", "-12V", "+3V3", "GND")):
    xf = 40 + 13 * i
    s.wire(xf, 46, xf + 5.08, 46)
    s.power(f"power:{rail}", xf, 46, 0, vx=xf, vy=(46 - 3.302 if rail in ("+3V3", "+12V") else 46 + 3.81))
    s.flag(xf + 5.08, 46)
s.write(OUT_DIR + r"\musicbrain-riser.kicad_sch")
