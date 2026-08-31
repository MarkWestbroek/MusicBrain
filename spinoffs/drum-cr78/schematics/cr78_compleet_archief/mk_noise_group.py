#!/usr/bin/env python3
"""
CR-78 noise group: one noise source, three envelope channels (cymbal,
hi-hat, maracas) summing onto one bus, one shared VCA and one 9.1 kHz tank.

Layout is generated. Each envelope channel is the same shape; the cymbal
just has two decay legs instead of one.
"""
import sys, re
sys.path.insert(0, '/home/claude/cr78')
import sch_gen
from sch_gen import build, pin_xy, grab, DONOR_SRC, LIBS, PINS, DIODE_ROT, TRIGGER

for lib, src in [('Transistor_BJT:BC549', grab(DONOR_SRC, 'Transistor_BJT:BC549')),
                 ('power:+15V', grab(DONOR_SRC, 'power:+12V').replace('+12V', '+15V'))]:
    LIBS[lib] = src
    PINS[lib] = [(m[3], float(m[0]), float(m[1])) for m in
                 re.findall(r'\(pin \w+ \w+ \(at ([-\d.]+) ([-\d.]+) (\d+)\)'
                            r'[\s\S]*?\(number "([^"]*)"', src)]

DX = 12.0
XBUS = 230.0
parts, wires = [], []
g = [1]
BUS = []            # y positions where something taps the shared bus

def add(ref, val, lib, x, y, rot=0):
    parts.append((ref, val, lib, x, y, rot)); return ref

def P(ref, num):
    for r, v, lib, px, py, rt in parts:
        if r == ref:
            return pin_xy(lib, px, py, rt, num)
    raise KeyError(ref)

def w(a, b): wires.append((a, b))

def rail(sym, x, y):
    r = '#PWR%02d' % g[0]; g[0] += 1
    add(r, sym, 'power:GND' if sym == 'GND' else 'power:+15V', x, y)
    return P(r, '1')

def ser(ref, val, lib, x, y, diode=False):
    """series element occupying one column, left node at x"""
    rot = DIODE_ROT if diode else 90
    add(ref, val, lib, x + DX / 2, y, rot)
    lo, hi = ('1', '2') if (not diode or DIODE_ROT == 0) else ('2', '1')
    w((x, y), P(ref, lo)); w(P(ref, hi), (x + DX, y))
    return x + DX

def shunt(ref, val, lib, x, y):
    add(ref, val, lib, x, y + 8)
    w((x, y), P(ref, '1')); w(P(ref, '2'), rail('GND', x, y + 18))
    w((x, y), (x + DX, y))
    return x + DX

# ------------------------------------------------------------ channels
def channel(name, y, refs, vals, legs):
    x = 40.0
    w((32.0, y), (x, y))
    x = ser(refs['Cin'], '0.027u', 'Device:C', x, y)
    x = shunt(refs['R270'], '270k', 'Device:R', x, y)
    x = ser(refs['D'], '1S1588', 'Device:D', x, y, diode=True)
    x = ser(refs['Rser'], vals['Rser'], 'Device:R', x, y)
    xB = x
    # 820k bias to +15 V, sitting above the base node
    add(refs['Rb'], '820k', 'Device:R', xB, y - 10)
    w((xB, y), P(refs['Rb'], '2')); w(P(refs['Rb'], '1'), rail('+15V', xB, y - 22))
    # transistor
    qx = xB + 16
    add(refs['Q'], '2SC1815-GR', 'Transistor_BJT:BC549', qx, y)
    w((xB, y), P(refs['Q'], '2'))
    xc, yc = P(refs['Q'], '1')
    w(P(refs['Q'], '3'), rail('GND', xc, y + 14))
    # collector load
    add(refs['Rc'], vals['Rc'], 'Device:R', xc, yc - 12)
    w((xc, yc), P(refs['Rc'], '2')); w(P(refs['Rc'], '1'), rail('+15V', xc, yc - 24))
    # collector rail, then one vertical drop per decay leg
    xr = xc + 14
    w((xc, yc), (xr, yc))
    ylast = yc + 30 * (len(legs) - 1)
    if len(legs) > 1:
        w((xr, yc), (xr, ylast))
    for i, (dref, cref, cval, rref, rval) in enumerate(legs):
        yl = yc + 30 * i
        x = xr
        x = ser(dref, '1S1588', 'Device:D', x, yl, diode=True)
        x = shunt(cref, cval, 'Device:C', x, yl)
        x = ser(rref, rval, 'Device:R', x, yl)
        w((x, yl), (XBUS, yl)); BUS.append(yl)
    return [('%s_TRIG' % name, 32.0, y, 180)]

labels = []
labels += channel('CY', 60.0,
    dict(Cin='C518', R270='R525', D='D510', Rser='R526', Rb='R527', Q='Q515', Rc='R528'),
    dict(Rser='270k', Rc='8.2k'),
    [('D511', 'C519', '0.0082u', 'R529', '470k'),
     ('D512', 'C520', '0.12u',   'R530', '4.7M')])
labels += channel('HH', 160.0,
    dict(Cin='C524', R270='R533', D='D514', Rser='R534', Rb='R535', Q='Q516', Rc='R536'),
    dict(Rser='330k', Rc='10k'),
    [('D515', 'C525', '0.018u', 'R537', '1.5M')])
labels += channel('M', 230.0,
    dict(Cin='C526', R270='R538', D='D517', Rser='R539', Rb='R540', Q='Q517', Rc='R541'),
    dict(Rser='560k', Rc='10k'),
    [('D518', 'C527', '0.0082u', 'R542', '1M')])

# ------------------------------------------------------------ noise source
YN = 300.0
x = 44.0
add('R563', '1M', 'Device:R', x, YN - 12)
w(P('R563', '1'), rail('+15V', x, YN - 24))
add('Q533', '2SC828-R', 'Transistor_BJT:BC549', x + 14, YN - 5.08)
w(P('R563', '2'), (x, YN)); w((x, YN), P('Q533', '3'))       # emitter = noise node
xb0 = P('Q533', '2')[0]
w(P('Q533', '2'), (xb0 - 10, YN - 5.08))
w((xb0 - 10, YN - 5.08), rail('GND', xb0 - 10, YN + 6))
x = P('Q533', '3')[0] + 14
w(P('Q533', '3'), (x, YN))
x = ser('C602', '0.01u', 'Device:C', x, YN)
x = ser('R564', '100k', 'Device:R', x, YN)
xB = x
add('Q525', '2SC1815-GR', 'Transistor_BJT:BC549', xB + 16, YN)
w((xB, YN), P('Q525', '2'))
xc, yc = P('Q525', '1')
w(P('Q525', '3'), rail('GND', xc, YN + 14))
add('R565', '2.2M', 'Device:R', (xB + xc) / 2, YN + 34, 90)   # feedback
w((xB, YN), (xB, YN + 34)); w((xB, YN + 34), P('R565', '1'))
w(P('R565', '2'), (xc + 8, YN + 34)); w((xc + 8, YN + 34), (xc + 8, yc - 14))
w((xc + 8, yc - 14), (xc, yc - 14)); w((xc, yc), (xc, yc - 14))
# collector load
add('R567b', '10k', 'Device:R', xc, yc - 26)
w((xc, yc - 14), P('R567b', '2')); w(P('R567b', '1'), rail('+15V', xc, yc - 38))

# Four independent level trimmers hang off this one noise node, each feeding
# a different destination. Confirmed from the scan: all four share a common
# bottom rail; each top goes its own way.
xv = xc + 16
for i, (ref, dest) in enumerate([('VR60', None),          # CY / HH / M, on-sheet
                                 ('VR61', 'SD_NOISE'),
                                 ('VR62', 'TB_NOISE'),
                                 ('VR63', 'GU_NOISE')]):
    px = xv + i * 16
    add(ref, '50k', 'Device:R', px, yc - 14)
    w((px, yc - 4.19 + 4.19), P(ref, '2')) if False else None
    w(P(ref, '2'), (px, yc - 4))
    w((px, yc - 4), (px, yc))
    if i == 0:
        w((xc, yc), (xv, yc))
    else:
        w((xv + (i - 1) * 16, yc), (px, yc))
    if dest:
        w(P(ref, '1'), (px, yc - 34))
        labels.append((dest, px, yc - 34, 90))
    else:
        w(P(ref, '1'), (px, yc - 34))
        w((px, yc - 34), (XBUS, yc - 34)); BUS.append(yc - 34)

BUS.append(60.0)          # VCA input
BUS.append(130.0)         # direct tap through C528

# ------------------------------------------------------------ shared VCA + tank
YV = 60.0
x = XBUS
x = ser('R531', '33k', 'Device:R', x, YV)
x = shunt('R532', '330k', 'Device:R', x, YV)
add('Q507', '2SC900-F', 'Transistor_BJT:BC549', x + 14, YV)
w((x, YV), P('Q507', '2'))
xc, yc = P('Q507', '1')
w(P('Q507', '3'), rail('GND', xc, YV + 14))
add('L3', '45m', 'Device:L', xc, yc - 14)
add('C521', '0.0068u', 'Device:C', xc + 12, yc - 14)
w((xc, yc), (xc, yc - 10.19))
w((xc, yc), (xc + 12, yc)); w((xc + 12, yc), P('C521', '2'))
w(P('L3', '1'), (xc, yc - 24)); w(P('C521', '1'), (xc + 12, yc - 24))
w((xc, yc - 24), (xc + 12, yc - 24))
w((xc, yc - 24), rail('+15V', xc, yc - 32))
xo = xc + 24
w((xc, yc), (xo, yc))
xo = ser('C522', '470p', 'Device:C', xo, yc)
xo = ser('C523', '470p', 'Device:C', xo, yc)
w((xo, yc), (xo + 8, yc))
labels.append(('METAL_OUT', xo + 8, yc, 0))
# direct bus tap
xb2 = ser('C528', '0.0082u', 'Device:C', XBUS, 130.0)
w((xb2, 130.0), (xb2 + 8, 130.0))
ys = sorted(set(round(v, 2) for v in BUS))
for a, b in zip(ys, ys[1:]):
    w((XBUS, a), (XBUS, b))
labels.append(('BUS_OUT', xb2 + 8, 130.0, 0))

open('/mnt/user-data/outputs/cr78_noise_group.kicad_sch', 'w').write(
    build('CR-78 Noise Group (CY / HH / M)', parts, wires, labels, page='A2'))
print('trigger polarity:', TRIGGER)
print('%d componenten, %d draden' % (len(parts), len(wires)))
