#!/usr/bin/env python3
"""
The fourth CR-78 primitive: an oscillator gated by an envelope, output
through an LC tank.

  COWBELL   astable multivibrator Q529/Q530 on +5 V, C556/C557 .01 each,
            VR68 100k + R597 2.2k sets the rate. Two pitches in the
            factory table (800 Hz / 555 Hz) come from trimmer positions
            around 90k and 130k - both inside VR68's range.
  GUIRO     astable Q520/Q521 on +15 V, C529/C530 .068 each. Two scrape
            rates selected by D519/D520 switching 82k or 82k+56k:
            7.7 ms (130 Hz) and 12.9 ms (77 Hz) against 8.0/13.0 in spec.
  TAMBOURINE two trigger inputs OR'd, two decay paths, output via L5.
  METALLIC BEAT three CMOS oscillators on IC501 (MC14069), mixed and
            gated, output via L6/L7.

Cowbell and guiro are drawn here. Tambourine and metallic beat are left
as descriptions - see notes at the end.
"""
import sys, re
sys.path.insert(0, '/home/claude/cr78')
import sch_gen
from sch_gen import build, pin_xy, grab, DONOR_SRC, LIBS, PINS, DIODE_ROT, TRIGGER

for lib, src in [('Transistor_BJT:BC549', grab(DONOR_SRC, 'Transistor_BJT:BC549')),
                 ('power:+15V', grab(DONOR_SRC, 'power:+12V').replace('+12V', '+15V')),
                 ('power:+5V', grab(DONOR_SRC, 'power:+12V').replace('+12V', '+5V'))]:
    LIBS[lib] = src
    PINS[lib] = [(m[3], float(m[0]), float(m[1])) for m in
                 re.findall(r'\(pin \w+ \w+ \(at ([-\d.]+) ([-\d.]+) (\d+)\)'
                            r'[\s\S]*?\(number "([^"]*)"', src)]

DX = 12.0

def new():
    return {'parts': [], 'wires': [], 'labels': [], 'g': [1]}

def mk(S):
    parts, wires, labels, g = S['parts'], S['wires'], S['labels'], S['g']
    def add(r, v, lib, x, y, rot=0):
        parts.append((r, v, lib, x, y, rot)); return r
    def P(ref, num):
        for r, v, lib, px, py, rt in parts:
            if r == ref: return pin_xy(lib, px, py, rt, num)
        raise KeyError(ref)
    def w(a, b): wires.append((a, b))
    def rail(sym, x, y):
        r = '#PWR%02d' % g[0]; g[0] += 1
        lib = 'power:GND' if sym == 'GND' else 'power:%s' % sym
        add(r, sym, lib, x, y); return P(r, '1')
    def ser(ref, val, lib, x, y, diode=False):
        rot = DIODE_ROT if diode else 90
        add(ref, val, lib, x + DX / 2, y, rot)
        lo, hi = ('1', '2') if (not diode or DIODE_ROT == 0) else ('2', '1')
        w((x, y), P(ref, lo)); w(P(ref, hi), (x + DX, y)); return x + DX
    def shunt(ref, val, lib, x, y):
        add(ref, val, lib, x, y + 8)
        w((x, y), P(ref, '1')); w(P(ref, '2'), rail('GND', x, y + 18))
        w((x, y), (x + DX, y)); return x + DX
    return add, P, w, rail, ser, shunt


def astable(S, y, x0, qa, qb, ca, cb, cval, ra, rb, rload, rail_sym, timing):
    """Cross-coupled pair. Returns x of the right-hand collector."""
    add, P, w, rail, ser, shunt = mk(S)
    xa, xb = x0, x0 + 60
    add(qa, '2SC1815-GR', 'Transistor_BJT:BC549', xa, y)
    add(qb, '2SC1815-GR', 'Transistor_BJT:BC549', xb, y)
    for q in (qa, qb):
        ex, ey = P(q, '3')
        w((ex, ey), (ex + 10, ey))
        w((ex + 10, ey), rail('GND', ex + 10, ey + 10))
    ca_x, cb_x = P(qa, '1')[0], P(qb, '1')[0]
    for q, rl, x in ((qa, ra, ca_x), (qb, rb, cb_x)):
        add(rl, rload, 'Device:R', x, y - 20)
        w(P(q, '1'), (x, y - 16.19)); w((x, y - 16.19), P(rl, '2'))
        w(P(rl, '1'), rail(rail_sym, x, y - 32))
    # cross coupling, routed on two levels so the two paths do not touch
    YU, YL = y - 40, y + 34
    # each cross link leaves its collector on a private column
    la, lb = ca_x + 5, cb_x + 5
    add(ca, cval, 'Device:C', (la + P(qb, '2')[0]) / 2, YU, 90)
    w(P(qa, '1'), (la, P(qa, '1')[1])); w((la, P(qa, '1')[1]), (la, YU))
    w((la, YU), P(ca, '1'))
    bx = P(qb, '2')[0] - 6
    w(P(ca, '2'), (bx, YU)); w((bx, YU), (bx, P(qb, '2')[1]))
    w((bx, P(qb, '2')[1]), P(qb, '2'))
    # lower link runs above the row, mirrored, on its own two columns
    # lower link mirrored above; place the cap so its pins land exactly on
    # the two vertical columns, otherwise the wire runs through both pins
    YL2 = y - 56
    colb, cola = lb + 12, P(qa, '2')[0] - 12
    add(cb, cval, 'Device:C', (colb + cola) / 2, YL2, 90)
    # attach whichever pin actually sits nearer each column, otherwise the
    # horizontal run passes straight through the far pin and shorts the cap
    pb, pa = sorted([P(cb, '1'), P(cb, '2')], key=lambda q: abs(q[0] - colb))
    w(P(qb, '1'), (colb, P(qb, '1')[1])); w((colb, P(qb, '1')[1]), (colb, YL2))
    w((colb, YL2), pb)
    w(pa, (cola, YL2)); w((cola, YL2), (cola, P(qa, '2')[1]))
    w((cola, P(qa, '2')[1]), P(qa, '2'))
    # shared timing resistor(s) to the rail, tapped from both bases
    tx = (P(qa, '2')[0] + P(qb, '2')[0]) / 2
    prev = None
    for i, (ref, val) in enumerate(timing):
        add(ref, val, 'Device:R', tx, y + 52 + i * 12)
        if prev is None:
            w(P(qa, '2'), (P(qa, '2')[0], y + 46))
            w((P(qa, '2')[0], y + 46), (tx, y + 46)); w((tx, y + 46), P(ref, '1'))
        else:
            w(P(prev, '2'), P(ref, '1'))
        prev = ref
    w(P(prev, '2'), rail(rail_sym, tx, y + 52 + len(timing) * 12 + 6))
    return cb_x


# ============================================================ cowbell
S = new(); add, P, w, rail, ser, shunt = mk(S)
Y = 120.0
x = 40.0
w((32.0, Y), (x, Y))
x = ser('R582', '56k', 'Device:R', x, Y)
add('Q527', '2SC1815-GR', 'Transistor_BJT:BC549', x + 14, Y)
w((x, Y), P('Q527', '2'))
xc, yc = P('Q527', '1')
w(P('Q527', '3'), rail('GND', xc, Y + 14))
add('R583', '10k', 'Device:R', xc, yc - 12)
w((xc, yc), P('R583', '2')); w(P('R583', '1'), rail('+15V', xc, yc - 24))
x = xc + 14; w((xc, yc), (x, yc))
x = ser('C547', '0.027u', 'Device:C', x, yc)
x = shunt('R584', '270k', 'Device:R', x, yc)
x = ser('D525', '1S1588', 'Device:D', x, yc, diode=True)
x = ser('R585', '560k', 'Device:R', x, yc)
xB = x
add('R586', '820k', 'Device:R', xB, yc - 10)
w((xB, yc), P('R586', '2')); w(P('R586', '1'), rail('+15V', xB, yc - 22))
add('Q528', '2SC1815-GR', 'Transistor_BJT:BC549', xB + 16, yc)
w((xB, yc), P('Q528', '2'))
xc2, yc2 = P('Q528', '1')
w(P('Q528', '3'), rail('GND', xc2, yc + 14))
add('R587', '10k', 'Device:R', xc2, yc2 - 12)
w((xc2, yc2), P('R587', '2')); w(P('R587', '1'), rail('+15V', xc2, yc2 - 24))
x = xc2 + 14; w((xc2, yc2), (x, yc2))
x = ser('D526', '1S1588', 'Device:D', x, yc2, diode=True)
x = shunt('C548', '0.022u', 'Device:C', x, yc2)
x = shunt('C549', '0.018u', 'Device:C', x, yc2)
x = ser('R588', '1.5M', 'Device:R', x, yc2)
x = ser('R589', '100k', 'Device:R', x, yc2)
x = shunt('R590', '270k', 'Device:R', x, yc2)
S['labels'].append(('CB_TRIG', 32.0, Y, 180))
S['labels'].append(('CB_ENV', x, yc2, 0))
w((x - DX, yc2), (x, yc2))
# the oscillator pair, on +5 V
xosc = astable(S, 260.0, 60.0, 'Q529', 'Q530', 'C556', 'C557', '0.01u',
               'R596', 'R600', '8.2k', '+5V',
               [('R680', '100k'), ('R597', '2.2k')])
S['labels'].append(('CB_OSC', xosc + 30, 260.0, 0))
w((xosc, 260.0), (xosc + 30, 260.0))
open('/mnt/user-data/outputs/cr78_cowbell.kicad_sch', 'w').write(
    build('CR-78 Cowbell', S['parts'], S['wires'], S['labels'], page='A3'))
print('cowbell:  %d componenten, %d draden' % (len(S['parts']), len(S['wires'])))

# ============================================================ guiro
S = new(); add, P, w, rail, ser, shunt = mk(S)
Y = 120.0
x = 40.0
w((32.0, Y), (x, Y))
x = ser('R667', '56k', 'Device:R', x, Y)
add('Q518', '2SC1815-GR', 'Transistor_BJT:BC549', x + 14, Y)
w((x, Y), P('Q518', '2'))
xc, yc = P('Q518', '1')
w(P('Q518', '3'), rail('GND', xc, Y + 14))
add('R669', '10k', 'Device:R', xc, yc - 12)
w((xc, yc), P('R669', '2')); w(P('R669', '1'), rail('+15V', xc, yc - 24))
x = xc + 14; w((xc, yc), (x, yc))
x = ser('R671', '82k', 'Device:R', x, yc)
x = shunt('R677', '18k', 'Device:R', x, yc)
x = ser('D519', '1S1588', 'Device:D', x, yc, diode=True)
S['labels'].append(('GU_TRIG', 32.0, Y, 180))
S['labels'].append(('GU_GATE', x + 10, yc, 0))
w((x, yc), (x + 10, yc))
xosc = astable(S, 260.0, 60.0, 'Q520', 'Q521', 'C529', 'C530', '0.068u',
               'R673', 'R674', '5.6k', '+15V',
               [('R643', '82k'), ('R644', '56k')])
S['labels'].append(('GU_OSC', xosc + 30, 260.0, 0))
w((xosc, 260.0), (xosc + 30, 260.0))
open('/mnt/user-data/outputs/cr78_guiro.kicad_sch', 'w').write(
    build('CR-78 Guiro', S['parts'], S['wires'], S['labels'], page='A3'))
print('guiro:    %d componenten, %d draden' % (len(S['parts']), len(S['wires'])))
