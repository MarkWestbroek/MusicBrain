#!/usr/bin/env python3
"""
The last two voices.

METALLIC BEAT: three CMOS ring oscillators on IC501 (MC14069UB hex inverter).
Each is the classic two-inverter RC oscillator:
    f ~ 1 / (2.2 * R * C)   with R = VR + 4.7k series pot leg, C per section
  section A  pins 5-6, 9-8    VR64 + R573 47k?, C544 .0015 -> ~6.2 kHz
  section B  pins 1-2, 3-4    VR65,  R575 47k,  C545 .0018
  section C  pins 13-12,11-10 VR66,  R577 47k,  C546 .0022
Factory table: 6170 / 5620 / 4080 Hz (VR64/65/66), decay 50 ms, 0.35 Vpp.
Mixed through R579/R580 (470k each) + section A's mix resistor, into R581
10k to ground (hand-corrected from 27k on the schematic), then gated and
sent through L6 45mH || C542 .018.

TAMBOURINE: two OR'd triggers, double-diode decay, envelope onto Q524,
then the swing VCA around Q509 with L5 || C538 .033 in the collector.
L5 henry value is NOT printed; only "1R" (its DC resistance). Left as 45m
with a TODO.
"""
import sys, re
sys.path.insert(0, '/home/claude/cr78')
import sch_gen
from sch_gen import build, pin_xy, grab, DONOR_SRC, LIBS, PINS, DIODE_ROT, TRIGGER

for lib, src in [('Transistor_BJT:BC549', grab(DONOR_SRC, 'Transistor_BJT:BC549')),
                 ('power:+15V', grab(DONOR_SRC, 'power:+12V').replace('+12V', '+15V')),
                 ('power:+5V', grab(DONOR_SRC, 'power:+12V').replace('+12V', '+5V'))]:
    LIBS[lib] = src

# ---- hand-written single-gate inverter, one unit per placement ----
INV = '''(symbol "CR78:INV" (pin_names (offset 0.254) hide) (in_bom yes) (on_board yes)
      (property "Reference" "U" (id 0) (at 0 3.81 0) (effects (font (size 1.27 1.27))))
      (property "Value" "MC14069" (id 1) (at 0 -3.81 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (id 2) (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
      (property "Datasheet" "~" (id 3) (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
      (symbol "INV_0_1"
        (polyline (pts (xy -2.54 2.54) (xy -2.54 -2.54) (xy 2.54 0) (xy -2.54 2.54))
          (stroke (width 0.254) (type default)) (fill (type background)))
        (circle (center 3.048 0) (radius 0.508) (stroke (width 0.254) (type default)) (fill (type none)))
      )
      (symbol "INV_1_1"
        (pin input line (at -5.08 0 0) (length 2.54) (name "A" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
        (pin output line (at 6.35 0 180) (length 2.794) (name "Y" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
      )
    )'''
LIBS['CR78:INV'] = INV
for lib in ['Transistor_BJT:BC549', 'power:+15V', 'power:+5V', 'CR78:INV']:
    PINS[lib] = [(m[3], float(m[0]), float(m[1])) for m in
                 re.findall(r'\(pin \w+ \w+ \(at ([-\d.]+) ([-\d.]+) (\d+)\)'
                            r'[\s\S]*?\(number "([^"]*)"', LIBS[lib])]

DX = 12.0

def new(): return {'parts': [], 'wires': [], 'labels': [], 'g': [1]}

def mk(S):
    parts, wires, g = S['parts'], S['wires'], S['g']
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

# ==================================================== metallic beat
S = new(); add, P, w, rail, ser, shunt = mk(S)

S_YLr=[None]
def ring_osc(y, ua, ub, vr, rt, rf, cf, cval, rmix, rmval, XMIX):
    """two-inverter RC oscillator; output through rmix to the mix column"""
    x = 60.0
    add(ua, 'MC14069', 'CR78:INV', x, y)
    add(ub, 'MC14069', 'CR78:INV', x + 22, y)
    w(P(ua, '2'), P(ub, '1'))
    xin = P(ua, '1')[0]
    xo  = P(ub, '2')[0]
    xmid_pin = P(ua, '2')[0]
    XIN, XMID, XO = xin - 8, xmid_pin + 4, xo + 4     # private columns
    w((XIN, y), P(ua, '1'))
    w(P(ua, '2'), P(ub, '1'))
    w(P(ua, '2'), (xmid_pin + 0.0, y)) if False else None
    # feedback R 39k from the second output back to the first input, above
    YU = y - 14
    add(rf, '39k', 'Device:R', (XIN + XO) / 2, YU, 90)
    w(P(ub, '2'), (XO, y)); w((XO, y), (XO, YU))
    pfar, pnear = sorted([P(rf, '1'), P(rf, '2')], key=lambda q: abs(q[0] - XO))
    w((XO, YU), pfar)
    w(pnear, (XIN, YU)); w((XIN, YU), (XIN, y))
    # timing chain VR + 4.7k from the midpoint down and back to the input
    YL = y + 14
    add(vr, '50k', 'Device:R', XMID + 10, YL, 90)
    add(rt, '4.7k', 'Device:R', XMID + 28, YL, 90)
    w((XMID, y), (XMID, YL))
    # tap the midpoint via a short stub from the inter-inverter wire
    w((xmid_pin, y), (XMID, y))
    w((XMID, YL), P(vr, '1')); w(P(vr, '2'), P(rt, '1'))
    YLr = YL + 6
    rx = P(rt, '2')[0] + 4
    w(P(rt, '2'), (rx, YL)); w((rx, YL), (rx, YLr))
    w((rx, YLr), (XIN, YLr)); w((XIN, YLr), (XIN, y))
    S_YLr[0] = YLr
    # cap from the midpoint to the input, one level lower
    YC = y + 26
    add(cf, cval, 'Device:C', (XMID + XIN) / 2, YC, 90)
    w((XMID, YL), (XMID, YC))
    pfar, pnear = sorted([P(cf, '1'), P(cf, '2')], key=lambda q: abs(q[0] - XMID))
    w((XMID, YC), pfar)
    YCr = YC + 6
    nx = pnear[0] - 4
    w(pnear, (nx, YC)); w((nx, YC), (nx, YCr))
    w((nx, YCr), (XIN, YCr)); w((XIN, YCr), (XIN, S_YLr[0]))
    # mix resistor to the summing column
    add(rmix, rmval, 'Device:R', xo + 12, y, 90)
    w((xo, y), P(rmix, '1'))
    w(P(rmix, '2'), (XMIX, y))
    return y

XMIX = 150.0
ys = []
ys.append(ring_osc(60.0,  'U501A', 'U501B', 'VR64', 'R573', 'R574a', 'C544', '0.0015u', 'R578', '470k', XMIX))
ys.append(ring_osc(130.0, 'U501C', 'U501D', 'VR65', 'R575', 'R574',  'C545', '0.0018u', 'R579', '470k', XMIX))
ys.append(ring_osc(200.0, 'U501E', 'U501F', 'VR66', 'R577', 'R576',  'C546', '0.0022u', 'R580', '470k', XMIX))
for a, b in zip(ys, ys[1:]):
    w((XMIX, a), (XMIX, b))
add('R581', '10k', 'Device:R', XMIX, ys[-1] + 12)
w((XMIX, ys[-1]), P('R581', '1')); w(P('R581', '2'), rail('GND', XMIX, ys[-1] + 24))
S['labels'].append(('MB_MIX', XMIX + 8, ys[0], 0))
w((XMIX, ys[0]), (XMIX + 8, ys[0]))
open('/mnt/user-data/outputs/cr78_metallic_beat.kicad_sch', 'w').write(
    build('CR-78 Metallic Beat', S['parts'], S['wires'], S['labels'], page='A3'))
print('metallic beat: %d componenten, %d draden' % (len(S['parts']), len(S['wires'])))

# ==================================================== tambourine
S = new(); add, P, w, rail, ser, shunt = mk(S)
Y = 80.0
# two OR'd trigger inputs
for i, (rref, lab) in enumerate([('R551', 'TB_TRIG1'), ('R552', 'TB_TRIG2')]):
    yy = Y + i * 16
    w((32.0, yy), (40.0, yy))
    add(rref, '56k', 'Device:R', 46.0, yy, 90)
    w((40.0, yy), P(rref, '1'))
    w(P(rref, '2'), (58.0, yy))
    S['labels'].append((lab, 32.0, yy, 180))
add('Q522', '2SC1815-GR', 'Transistor_BJT:BC549', 72.0, Y)
add('Q523', '2SC1815-GR', 'Transistor_BJT:BC549', 72.0, Y + 16)
w((58.0, Y), P('Q522', '2')); w((58.0, Y + 16), P('Q523', '2'))
xc = P('Q522', '1')[0]
e1, e2 = P('Q522', '3'), P('Q523', '3')
w(e1, (e1[0] + 8, e1[1])); w((e1[0] + 8, e1[1]), rail('GND', e1[0] + 8, e1[1] + 8))
w(e2, (e2[0] + 8, e2[1])); w((e2[0] + 8, e2[1]), rail('GND', e2[0] + 8, e2[1] + 8))
# both collectors share R553 to +15, joined on a private column
c1, c2 = P('Q522', '1'), P('Q523', '1')
jx = c1[0] + 6
w(c1, (jx, c1[1])); w((jx, c1[1]), (jx, c2[1])); w((jx, c2[1]), c2)
add('R553', '10k', 'Device:R', xc, Y - 18)
w(P('Q522', '1'), P('R553', '2')); w(P('R553', '1'), rail('+15V', xc, Y - 30))
x = xc + 12; yz = P('Q522', '1')[1]
w((xc, yz), (x, yz))
x = ser('C534', '0.027u', 'Device:C', x, yz)
x = shunt('R556', '270k', 'Device:R', x, yz)
xsplit = x
# fast leg
x = ser('D521', '1S1588', 'Device:D', xsplit, yz, diode=True)
x = ser('R557', '270k', 'Device:R', x, yz)
xjoin = x
# slow leg below
YS = yz + 20
w((xsplit, yz), (xsplit, YS))
x2 = ser('D522', '1S1588', 'Device:D', xsplit, YS, diode=True)
x2 = ser('R558', '820k', 'Device:R', x2, YS)
w((x2, YS), (xjoin, YS)); w((xjoin, YS), (xjoin, yz))
xB = xjoin
add('R555', '270k', 'Device:R', xB, yz + 34)
w((xB, YS), P('R555', '1')) if False else None
w((xB, yz), (xB, yz))
add('Q524', '2SC1815-GR', 'Transistor_BJT:BC549', xB + 16, yz)
w((xB, yz), P('Q524', '2'))
xc2, yc2 = P('Q524', '1')
w(P('Q524', '3'), rail('GND', xc2, yz + 14))
add('R559', '10k', 'Device:R', xc2, yc2 - 12)
w((xc2, yc2), P('R559', '2')); w(P('R559', '1'), rail('+15V', xc2, yc2 - 24))
x = xc2 + 14; w((xc2, yc2), (x, yc2))
x = ser('D523', '1S1588', 'Device:D', x, yc2, diode=True)
x = shunt('C536', '0.056u', 'Device:C', x, yc2)
x = ser('R560', '2.2M', 'Device:R', x, yc2)
xS = x
add('C537', '0.01u', 'Device:C', xS, yc2 + 14)
w((xS, yc2), P('C537', '1'))
w(P('C537', '2'), (xS, yc2 + 26)); S['labels'].append(('TB_NOISE', xS, yc2 + 26, 270))
x = ser('R561', '47k', 'Device:R', xS, yc2)
x = shunt('R562', '470k', 'Device:R', x, yc2)
add('Q509', '2SC900-F', 'Transistor_BJT:BC549', x + 14, yc2)
w((x, yc2), P('Q509', '2'))
xc3, yc3 = P('Q509', '1')
w(P('Q509', '3'), rail('GND', xc3, yc2 + 14))
add('L5', '45m TODO', 'Device:L', xc3, yc3 - 14)
add('C538', '0.033u', 'Device:C', xc3 + 12, yc3 - 14)
w((xc3, yc3), (xc3, yc3 - 10.19))
w((xc3, yc3), (xc3 + 12, yc3)); w((xc3 + 12, yc3), P('C538', '2'))
w(P('L5', '1'), (xc3, yc3 - 24)); w(P('C538', '1'), (xc3 + 12, yc3 - 24))
w((xc3, yc3 - 24), (xc3 + 12, yc3 - 24))
w((xc3, yc3 - 24), rail('+15V', xc3, yc3 - 32))
x = xc3 + 24; w((xc3, yc3), (x, yc3))
x = ser('C539', '250p', 'Device:C', x, yc3)
w((x, yc3), (x + 8, yc3))
S['labels'].append(('TB_OUT', x + 8, yc3, 0))
open('/mnt/user-data/outputs/cr78_tambourine.kicad_sch', 'w').write(
    build('CR-78 Tambourine', S['parts'], S['wires'], S['labels'], page='A3'))
print('tambourine:    %d componenten, %d draden' % (len(S['parts']), len(S['wires'])))
