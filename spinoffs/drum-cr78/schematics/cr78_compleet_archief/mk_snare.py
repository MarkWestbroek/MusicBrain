#!/usr/bin/env python3
"""
CR-78 snare drum. Two half-voices on one sheet:

  DRUM   a three-capacitor twin-T around Q505, same family as BD/HB/LB/LC.
         Calculated 367 Hz against 340 Hz in the factory table.

  NOISE  the same envelope block as hi-hat/maracas (Q514, D508, C514 .018
         decaying through R511 1.5M -> 62 ms, factory spec 60 ms), summed
         with noise from VR61 on the noise board and gated by Q506.
         Output filter here is an RC lowpass (R514 2.7k || C516 .0056,
         about 10.5 kHz) rather than the 9.1 kHz LC tank the cymbal and
         hi-hat share - which is why the snare reads as less metallic.
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
parts, wires, labels = [], [], []
g = [1]

def add(r, v, lib, x, y, rot=0):
    parts.append((r, v, lib, x, y, rot)); return r

def P(ref, num):
    for r, v, lib, px, py, rt in parts:
        if r == ref: return pin_xy(lib, px, py, rt, num)
    raise KeyError(ref)

def w(a, b): wires.append((a, b))

def rail(sym, x, y):
    r = '#PWR%02d' % g[0]; g[0] += 1
    add(r, sym, 'power:GND' if sym == 'GND' else 'power:+15V', x, y)
    return P(r, '1')

def ser(ref, val, lib, x, y, diode=False):
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

# =================================================== drum component
YD = 60.0
x = 40.0
w((32.0, YD), (x, YD))
x = ser('C508', '0.027u', 'Device:C', x, YD)
x = shunt('R506', '270k', 'Device:R', x, YD)
x = ser('D506', '1S1588', 'Device:D', x, YD, diode=True)
x = ser('R507', '220k', 'Device:R', x, YD)
x = shunt('R517', '68k', 'Device:R', x, YD)
x = ser('R516', '15k', 'Device:R', x, YD)
xP = x
x = ser('C510', '0.01u', 'Device:C', x, YD)
x = shunt('R518', '15k', 'Device:R', x, YD)
x = ser('C511', '0.0056u', 'Device:C', x, YD)
xB = x
qx = xB + 16
add('Q505', '2SC900-F', 'Transistor_BJT:BC549', qx, YD)
w((xB, YD), P('Q505', '2'))
xc, yc = P('Q505', '1')
w(P('Q505', '3'), rail('GND', xc, YD + 14))          # emitter straight to ground
YT = YD - 22
w((xc, yc), (xc, YT))
add('C509', '0.01u', 'Device:C', xP + 22, YT, 90)     # bridging cap
w((xP, YD), (xP, YT)); w((xP, YT), P('C509', '1')); w(P('C509', '2'), (xc, YT))
YF = YD + 40                                          # feedback below
add('R519', '1M', 'Device:R', (xB + xc) / 2 - 6, YF, 90)
add('C512', '100p', 'Device:C', (xB + xc) / 2 + 8, YF, 90)
w((xB, YD), (xB, YF)); w((xB, YF), P('R519', '1'))
w(P('R519', '2'), P('C512', '1')); w(P('C512', '2'), (xc + 8, YF))
w((xc + 8, YF), (xc + 8, YT)); w((xc + 8, YT), (xc, YT))
add('R520', '4.7k', 'Device:R', xc, YT - 12)
w((xc, YT), P('R520', '2')); w(P('R520', '1'), rail('+15V', xc, YT - 24))
xo = xc + 16
w((xc, YT), (xo, YT))
xo = ser('C513', '0.022u', 'Device:C', xo, YT)
xo = ser('R522', '1.5M', 'Device:R', xo, YT)
XOUT = xo + 10
w((xo, YT), (XOUT, YT))
labels.append(('SD_TRIG', 32.0, YD, 180))
labels.append(('SD_OUT', XOUT, YT, 0))

# =================================================== noise component
YN = 190.0
x = 40.0
w((32.0, YN), (x, YN))
x = ser('D507', '1S1588', 'Device:D', x, YN, diode=True)
x = ser('R508', '470k', 'Device:R', x, YN)
xB = x
add('R523', '820k', 'Device:R', xB, YN - 10)
w((xB, YN), P('R523', '2')); w(P('R523', '1'), rail('+15V', xB, YN - 22))
qx = xB + 16
add('Q514', '2SC1815-GR', 'Transistor_BJT:BC549', qx, YN)
w((xB, YN), P('Q514', '2'))
xc, yc = P('Q514', '1')
w(P('Q514', '3'), rail('GND', xc, YN + 14))
add('R524', '10k', 'Device:R', xc, yc - 12)
w((xc, yc), P('R524', '2')); w(P('R524', '1'), rail('+15V', xc, yc - 24))
x = xc + 14
w((xc, yc), (x, yc))
x = ser('D508', '1S1588', 'Device:D', x, yc, diode=True)
x = shunt('C514', '0.018u', 'Device:C', x, yc)
x = ser('R511', '1.5M', 'Device:R', x, yc)
xS = x                                                # summing node
# noise arrives here from VR61 on the noise sheet
add('C515', '0.0082u', 'Device:C', xS, yc + 14)
w((xS, yc), P('C515', '1'))
w(P('C515', '2'), (xS, yc + 26)); labels.append(('SD_NOISE', xS, yc + 26, 270))
x = ser('R512', '47k', 'Device:R', xS, yc)
xB2 = x
x = shunt('R513', '470k', 'Device:R', xB2, yc)
qx = xB2 + 20
add('Q506', '2SC1815-GR', 'Transistor_BJT:BC549', qx, yc)
w((xB2, yc), P('Q506', '2'))
xc2, yc2 = P('Q506', '1')
w(P('Q506', '3'), rail('GND', xc2, yc + 14))
add('R514', '2.7k', 'Device:R', xc2, yc2 - 14)
add('C516', '0.0056u', 'Device:C', xc2 + 10, yc2 - 14)
w((xc2, yc2), (xc2 + 10, yc2)); w((xc2 + 10, yc2), P('C516', '2'))
w((xc2, yc2), P('R514', '2'))
w(P('R514', '1'), (xc2, yc2 - 24)); w(P('C516', '1'), (xc2 + 10, yc2 - 24))
w((xc2, yc2 - 24), (xc2 + 10, yc2 - 24))
w((xc2, yc2 - 24), rail('+15V', xc2, yc2 - 32))
x = xc2 + 22
w((xc2, yc2), (x, yc2))
x = ser('C517', '250p', 'Device:C', x, yc2)
x = ser('R515', '100k', 'Device:R', x, yc2)
w((x, yc2), (XOUT, yc2)); w((XOUT, yc2), (XOUT, YT))

open('/mnt/user-data/outputs/cr78_snare.kicad_sch', 'w').write(
    build('CR-78 Snare Drum', parts, wires, labels, page='A3'))
print('trigger polarity:', TRIGGER)
print('%d componenten, %d draden' % (len(parts), len(wires)))
