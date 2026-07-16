"""MusicBrain ADC8 (gen 2) - 8x CV in (AD7606 serial mode), PCB.

Gen 2 (spi-bus-spec v2.0): slot 2x12, kaart 80x45 (bus.KAART_B x bus.H).
Schema: gen_adc_sch.py (zelfde map). Onder: haakse male 2x12 in het slot;
CONVST = /SPARE1 (pin 19), RESET is lokaal (C15/R9 RC-power-up, geen buslijn
meer). Boven: haakse male 1x10 naar het jack-front, gecentreerd.
U1 rot 0: V-ingangen (pins 49-64) noordwaarts naar de IN-kolommen -
v1.2-recht-toe-bedrading blijft: paneeljack j = V(9-j), remap in MbAdc8.
Signaalroutes via freerouting (SES naast dit script); GND via de vlakken +
gnd_stitch.json. Vervangt gen_adc_pcb_v11.py (gen 1, 50x80, handroutes).
"""
import sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from cardlib import Board
import bus
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-adc8"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-16"
REV = "2.0"

GEBRUIKT = {'GND', '+12V', '+3V3', '/SCLK', '/MISO', '/CS', '/IRQ'}

NETS = (['', '+12V', '+5V', '+3V3', 'GND', '/SCLK', '/MISO', '/CS', '/IRQ',
         '/CONVST', '/RANGE', '/RESET', '/REGCAP1', '/REGCAP2', '/REF',
         '/REFCAP']
        + [f'/IN{k}' for k in range(1, 9)] + [f'/V{k}' for k in range(1, 9)])
BX0, BX1 = 100.0, bus.KAART_B + 100.0     # 80 mm
CX = (BX0 + BX1) / 2                      # 140.0
b = Board("MusicBrain ADC8 - 8x CV in slot card", REV,
          (113, 138, 0), BX0, bus.BY0, BX1, bus.BY1, NETS, DATE)
b.silk_name = 'adc8'
P = b.P

# AD7606 netmap (serial mode): DB0-6/DB9-15 + OS* aan GND, VDRIVE/PAR/STBY/
# REF_SELECT aan +3V3, DOUTB (25) + FRSTDATA (15) nc.
U1_M = {'23': '+3V3', '6': '+3V3', '7': '+3V3', '34': '+3V3',
        '8': '/RANGE', '9': '/CONVST', '10': '/CONVST', '11': '/RESET',
        '12': '/SCLK', '13': '/CS', '24': '/MISO', '14': '/IRQ',
        '36': '/REGCAP1', '39': '/REGCAP2', '42': '/REF',
        '44': '/REFCAP', '45': '/REFCAP',
        '1': '+5V', '37': '+5V', '38': '+5V', '48': '+5V'}
for p_ in ('3', '4', '5', '16', '17', '18', '19', '20', '21', '22',
           '27', '28', '29', '30', '31', '32', '33',
           '2', '26', '35', '40', '41', '43', '46', '47'):
    U1_M[p_] = 'GND'
for ch in range(1, 9):
    U1_M[str(48 + 2 * ch - 1)] = f'/V{ch}'
    U1_M[str(48 + 2 * ch)] = 'GND'
U1_MAP = b.nm(U1_M)

J1_MAP = bus.j1_map(b, GEBRUIKT)
J1_MAP.update(b.nm({'19': '/CONVST'}))       # /SPARE1 = busbrede CONVST
J2_MAP = b.nm({'1': 'GND', '10': 'GND',
               **{str(k+1): f'/IN{k}' for k in range(1, 9)}})

b.fp(bus.HDR_BUS[0], bus.HDR_BUS[1], 'J1', 'BUS',
     CX + bus.BUS_HALF, bus.BY1 - bus.CONN_INSET, 270, J1_MAP)
b.fp(bus.HDR_PANEEL[0], bus.HDR_PANEEL[1], 'J2', 'CV IN',
     CX - bus.PANEEL_HALF, bus.BY0 + bus.CONN_INSET_PANEEL, 90, J2_MAP)

# IN-serieweerstanden recht onder hun J2-pin; kolom k draagt IN{k},
# gevoed door V(9-k) (v1.2-mapping) -> R{9-k} in kolom k.
INX = [P['J2']['1'][0] + 2.54 * k for k in range(1, 9)]
for k in range(1, 9):
    ch = 9 - k
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', f'R{ch}', '1k', INX[k - 1], 108.3,
         90, b.rc(f'/V{ch}', f'/IN{k}'))

# AD7606: rot 0 -> pins 49-64 (V-ingangen) op de noordrand, V1 oost
b.fp('Package_QFP.pretty\\LQFP-64_10x10mm_P0.5mm.kicad_mod',
     'Package_QFP:LQFP-64_10x10mm_P0.5mm', 'U1', 'AD7606BSTZ',
     CX, 122.5, 0, U1_MAP)

# REGCAP/REF/REFCAP-caps in een kolom pal oost van U1 (pins 33-48 oostrand)
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C9', '10u', 149.3, 119.5, 0,
     b.rc('/REFCAP', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C8', '10u', 149.3, 122.0, 0,
     b.rc('/REF', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C7', '1u', 149.3, 124.5, 0,
     b.rc('/REGCAP2', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C6', '1u', 149.3, 127.0, 0,
     b.rc('/REGCAP1', 'GND'))

# +5V-regelaar en ontkoppeling in de oosthoek
b.fp('Package_TO_SOT_SMD.pretty\\SOT-223-3_TabPin2.kicad_mod',
     'Package_TO_SOT_SMD:SOT-223-3_TabPin2', 'U2', 'AMS1117-5.0',
     161.0, 111.5, 0, b.nm({'1': 'GND', '2': '+5V', '3': '+12V'}))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C1', '100n', 169.5, 111.5, 90,
     b.rc('+12V', 'GND'))
b.fp('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
     'Capacitor_SMD:CP_Elec_4x5.3', 'C2', '10u', 158.0, 121.0, 90,
     b.rc('+5V', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C3', '100n', 153.5, 114.5, 0,
     b.rc('+5V', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C4', '100n', 153.5, 117.5, 0,
     b.rc('+5V', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C5', '100n', 131.0, 130.5, 0,
     b.rc('+3V3', 'GND'))

# RANGE-jumper + RESET-RC in de westhelft
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x03_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical',
     'JP1', 'RANGE', 112.0, 112.0, 0,
     b.nm({'1': '+3V3', '2': '/RANGE', '3': 'GND'}))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C15', '100n', 124.0, 122.5, 0,
     b.rc('+3V3', '/RESET'))
b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric', 'R9', '100k', 124.0, 125.5, 0,
     b.rc('/RESET', 'GND'))

# GND-binnenring onder U1: zone-vulling kan pads op 0,5mm-steek nooit
# bereiken (0,6 mm kanaal nodig). Alle GND-pads krijgen een strap naar een
# ring in het chip-binnenvlak (op F onbereikbaar voor de router - de padring
# sluit het af) + 2 via's naar het B-hoofdvlak. Gen-1 deed dit met de hand.
U1C = (CX, 122.5)
RING = 3.0
rx0, rx1 = U1C[0] - RING, U1C[0] + RING
ry0, ry1 = U1C[1] - RING, U1C[1] + RING
for pin, net in U1_M.items():
    if net != 'GND':
        continue
    px, py = P['U1'][pin]
    if abs(px - U1C[0]) > 4.0:      # oost-/westrij
        b.T('GND', 'F.Cu', 0.25, (px, py), (rx1 if px > U1C[0] else rx0, py))
    else:                           # noord-/zuidrij
        b.T('GND', 'F.Cu', 0.25, (px, py), (px, ry1 if py > U1C[1] else ry0))
b.T('GND', 'F.Cu', 0.3, (rx0, ry0), (rx1, ry0), (rx1, ry1), (rx0, ry1),
    (rx0, ry0))
b.V('GND', U1C[0] - 1.5, U1C[1])
b.V('GND', U1C[0] + 1.5, U1C[1])

# signalen via freerouting (SES); GND via de vlakken
from seslib import apply_ses
ses = os.path.join(OUT_DIR, "musicbrain-adc8.ses")
if os.path.exists(ses):
    nt, nv = apply_ses(b, ses)
    print(f"SES: {nt} sporen, {nv} vias overgenomen")
    print(f"snap_stubs: {b.snap_stubs()} stubs aangevuld")

# GND-hechtvia's: hoeken/randen + eiland-via's uit gnd_stitch.json
for x, y in ((102, bus.BY0 + 2), (178, bus.BY0 + 2), (102, bus.BY1 - 2),
             (178, bus.BY1 - 2), (102, 122), (178, 122),
             (112, bus.BY1 - 10), (168, bus.BY1 - 10)):
    b.V('GND', x, y)
import json as _json
_sf = os.path.join(OUT_DIR, 'gnd_stitch.json')
if os.path.exists(_sf):
    _st = _json.load(open(_sf))
    for _sx, _sy in _st:
        b.V('GND', _sx, _sy)
    print('gnd_stitch-via\'s:', len(_st))

b.write(OUT_DIR + r"\musicbrain-adc8.kicad_pcb")
print("written musicbrain-adc8 (gen 2)")
