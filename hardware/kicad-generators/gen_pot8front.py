"""MusicBrain POT8-FRONT - horizontaal front-bord: 8 pots + MCP3208 + 2x10 socket.

Floorplan (na de eerste mislukte poging herzien):
- Pots RK09K VERTICAAL, rot180 -> body/montagepennen naar WEST (x=100, boardrand),
  de 3 elektrische pinnen op x=107. Zo is de OOST-zijde (x 107..119) vrij voor routing.
- MCP3208 rot90 in het zuiden, naar oost geschoven: CH0..7 op een horizontale rij,
  x = 109..118 (ruim oostelijk van de pot-pin-kolom x=107). Elke wiper = 1 B.Cu-stub
  (op eigen y) + 1 F.Cu-verticaal (op eigen chX) -> kruisingsvrij (V en H op aparte laag).
- Kanaaltoewijzing = identiteit: MCP-pin i = /POTi (geen firmware-remap nodig).
- Socket (2x10 female, riser-J2-pinout) + SPI/voeding gegroepeerd in het zuiden bij de MCP.
- GND via het vlak (beide lagen). Zie doc/spi-bus-spec.md + musicbrain-riser (koppel-pinout).
"""
import sys
sys.path.insert(0, r'C:\Users\User\AppData\Local\Temp\claude\d--Git-Muziek-MusicBrain\99e404c8-b02c-48a1-b346-1e9bb9c444c9\scratchpad')
from cardlib import Board, fmt
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\Images\schematics\musicbrain-pot8front"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-09"

SLOT = {1: 'GND', 2: '+12V', 3: 'GND', 4: '-12V', 5: 'GND', 6: '+3V3',
        7: '/SCLK', 8: 'GND', 9: '/MOSI', 10: 'GND', 11: '/MISO', 12: 'GND',
        13: '/CS', 14: 'GND', 15: '/LDAC', 16: '/IRQ', 17: '/SDA', 18: '/SCL',
        19: '/SPARE1', 20: '/SPARE2'}
def sock_net(q):                       # riser-J2-pinout (x-matching), zie riser-README
    return SLOT[(20 - q) if q % 2 else (22 - q)]

NETS = (['', 'GND', '+3V3', '/SCLK', '/MOSI', '/MISO', '/CS']
        + [f'/POT{k}' for k in range(1, 9)]
        + ['+12V', '-12V', '/LDAC', '/IRQ', '/SDA', '/SCL', '/SPARE1', '/SPARE2'])
b = Board("MusicBrain POT8-FRONT - 8 pots + MCP3208", "1.0", (108.0, 250.0, 90),
          100, 100, 119, 252, NETS, DATE)
b.silk_name = 'pot8front'
P = b.P
SW = 0.25
T, V = b.T, b.V

# ---- 8 verticale RK09K-pots, rot180 (body/pennen naar west), pinnen op x=107 ----
POTX = 107.0
PY = [110.0 + 12.0 * k for k in range(8)]      # pin1(GND) y; pin2(wiper) y-2.5; pin3(+3V3) y-5
for k, y in enumerate(PY, start=1):
    b.fp('Potentiometer_THT.pretty\\Potentiometer_Alps_RK09K_Single_Vertical.kicad_mod',
         'Potentiometer_THT:Potentiometer_Alps_RK09K_Single_Vertical',
         f'RV{k}', '10k', POTX, y, 180,
         b.nm({'1': 'GND', '2': f'/POT{k}', '3': '+3V3'}))

# ---- MCP3208 (SOIC-16) rot90 in het zuiden, naar oost ----
MCPX, MCPY = 113.5, 210.0
U1_MAP = b.nm({**{str(i): f'/POT{i}' for i in range(1, 9)},      # pin1..8 = CH0..7 = POT1..8
               '9': 'GND', '10': '/CS', '11': '/MOSI', '12': '/MISO',
               '13': '/SCLK', '14': 'GND', '15': '+3V3', '16': '+3V3'})
b.fp('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm', 'U1', 'MCP3208', MCPX, MCPY, 90, U1_MAP)

# ontkoppeling: 100n dicht bij VDD (pin16), 10u wat verder
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C1', '100n', 116.5, 205.0, 0, b.rc('+3V3', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C2', '10u', 116.5, 216.0, 0, b.rc('+3V3', 'GND'))

# ---- female 2x10 koppel-socket (achterzijde), riser-J2-pinout, zuidrand ----
SOCKX, SOCKY0 = 104.0, 224.0
hp = []
for q in range(1, 21):
    col = 0 if q % 2 else 1
    row = (q - 1) // 2
    x = SOCKX + 2.54 * col
    y = SOCKY0 + 2.54 * row
    net = sock_net(q)
    idx = b.NI[net]
    shape = 'rect' if q == 1 else 'oval'
    hp.append(f'    (pad "{q}" thru_hole {shape} (at {fmt(x-SOCKX)} {fmt(y-SOCKY0)}) '
              f'(size 1.7 1.7) (drill 1.0) (layers "*.Cu" "*.Mask") (net {idx} "{net}"))')
    b.P.setdefault('J1', {})[str(q)] = (round(x, 3), round(y, 3))
b.raw_fp(f'''  (footprint "MusicBrain:Header_2x10_backside"
    (layer "F.Cu")
    (uuid "{b.uid()}")
    (at {fmt(SOCKX)} {fmt(SOCKY0)})
    (path "/")
    (descr "2x10 female koppel-socket naar de riser - OP ACHTERZIJDE monteren")
    (property "Reference" "J1" (at -2.2 -2.2 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "RISER-SOCKET" (at 1.27 {fmt(2.54*9+3)} 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (attr through_hole)
    (fp_rect (start -1.6 -1.6) (end {fmt(2.54+1.6)} {fmt(2.54*9+1.6)})
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
{chr(10).join(hp)}
  )''')

# ================= ROUTING =================
def ch(n): return P['U1'][str(n)]

# ---- wipers: pot pin2 (107, wy) -> B.Cu-stub naar chX -> via -> F.Cu-verticaal -> CH-pad ----
for k in range(1, 9):
    wy = PY[k-1] - 2.5                 # wiper (pin2) y, rot180
    chp = ch(k)                        # CH(k-1)=pin k, op (chX, ~212.5)
    chx = chp[0]
    T(f'/POT{k}', 'B.Cu', SW, (POTX, wy), (chx, wy))   # stub (eigen y)
    V(f'/POT{k}', chx, wy)
    T(f'/POT{k}', 'F.Cu', SW, (chx, wy), chp)          # verticaal (eigen x) tot in pad

# ---- +3V3-rail: verticaal op x=104 (west), stubs oost naar elke pot-pin3 (107, PY-5) ----
railx = 104.0
T('+3V3', 'F.Cu', 0.3, (railx, PY[0]-5), (railx, PY[-1]-5))
for y in PY:
    T('+3V3', 'F.Cu', SW, (railx, y-5), (POTX, y-5))
# +3V3 rail zuidwaarts naar MCP VREF/VDD (pin15/16) + caps
T('+3V3', 'F.Cu', 0.3, (railx, PY[-1]-5), (railx, 208.0))
T('+3V3', 'F.Cu', 0.3, (railx, 208.0), (ch('15')[0], 208.0))
V('+3V3', ch('15')[0], 208.0)
T('+3V3', 'B.Cu', SW, (ch('15')[0], 208.0), ch('15'))     # naar VREF (pin15)
T('+3V3', 'B.Cu', SW, ch('15'), ch('16'))                 # VREF->VDD (naast elkaar op zuidrij)
V('+3V3', ch('16')[0], ch('16')[1])
T('+3V3', 'F.Cu', SW, ch('16'), P['C1']['1'])             # VDD -> C1
T('+3V3', 'F.Cu', SW, P['C1']['1'], P['C2']['1'])         # -> C2

# ---- SPI: socket -> MCP (pin10 CS, 11 MOSI, 12 MISO, 13 SCLK) via zuid-lanes ----
spi = [('/CS', '10'), ('/MOSI', '11'), ('/MISO', '12'), ('/SCLK', '13')]
for i, (net, mpin) in enumerate(spi):
    sq = next(q for q in range(1, 21) if sock_net(q) == net)
    sp = P['J1'][str(sq)]
    mp = ch(mpin)
    lane = 244.0 + 1.2 * i            # eigen B.Cu-lane, ruim zuidelijk van alles
    T(net, 'F.Cu', SW, sp, (sp[0], lane))
    V(net, sp[0], lane)
    T(net, 'B.Cu', SW, (sp[0], lane), (mp[0], lane))
    V(net, mp[0], lane)
    T(net, 'F.Cu', SW, (mp[0], lane), mp)

# ---- +3V3 van socket (pin met +3V3) naar de rail ----
sq3 = next(q for q in range(1, 21) if sock_net(q) == '+3V3')
sp3 = P['J1'][str(sq3)]
T('+3V3', 'F.Cu', SW, sp3, (sp3[0], 222.0))
V('+3V3', sp3[0], 222.0)
T('+3V3', 'B.Cu', SW, (sp3[0], 222.0), (railx, 222.0))
V('+3V3', railx, 222.0)
T('+3V3', 'F.Cu', 0.3, (railx, 222.0), (railx, 208.0))

# ---- GND-stitching (pot pin1, MCP 9/14, socket-GND, caps -> via het vlak) ----
for x, y in ((101, 103), (118, 103), (101, 250), (118, 250), (101, 160),
             (118, 160), (110, 240), (117, 230), (102, 200), (109, 202)):
    V('GND', x, y)

b.write(OUT_DIR + r"\musicbrain-pot8front.kicad_pcb")
print("POT8-front PCB geschreven")
