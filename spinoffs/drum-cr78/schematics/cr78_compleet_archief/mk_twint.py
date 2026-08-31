#!/usr/bin/env python3
"""
The four twin-T voices of the CR-78 (BD, HB, LB, LC) as KiCad schematics.

All four share one topology; only the four capacitors and a couple of output
values differ. The layout is computed once and instantiated four times.

TRIGGER POLARITY is the single open question from the scan. Set it here and
every voice - twin-T, rim shot and claves - is regenerated consistently.
"""
import sys, subprocess
sys.path.insert(0, '/home/claude/cr78')
import sch_gen
from sch_gen import build, pin_xy, grab, DONOR_SRC, LIBS, PINS
import re

# ------------------------------------------------------------------ setup
LIBS['Transistor_BJT:BC549'] = grab(DONOR_SRC, 'Transistor_BJT:BC549')
LIBS['power:+15V'] = grab(DONOR_SRC, 'power:+12V').replace('+12V', '+15V')
for lib in ['Transistor_BJT:BC549', 'power:+15V']:
    PINS[lib] = [(m[3], float(m[0]), float(m[1])) for m in
                 re.findall(r'\(pin \w+ \w+ \(at ([-\d.]+) ([-\d.]+) (\d+)\)'
                            r'[\s\S]*?\(number "([^"]*)"', LIBS[lib])]

# ====================================================================
# Polarity now lives in sch_gen.py so every voice shares it.
from sch_gen import TRIGGER, DIODE_ROT
# ====================================================================

Y = 100.0
DX = 12.0


def emit(title, fname, parts, wires, labels):
    open('/mnt/user-data/outputs/' + fname, 'w').write(build(title, parts, wires, labels))
    return fname


def twin_t(name, fname, refs, vals):
    """refs/vals: dicts keyed by role. One layout, four instantiations."""
    parts, wires = [], []
    g = [1]

    def add(ref, val, lib, x, y, rot=0):
        parts.append((ref, val, lib, x, y, rot)); return ref

    def P(ref, num):
        for r, v, lib, px, py, rt in parts:
            if r == ref:
                return pin_xy(lib, px, py, rt, num)
        raise KeyError(ref)

    def gnd(x, y):
        r = '#PWR%02d' % g[0]; g[0] += 1
        add(r, 'GND', 'power:GND', x, y)
        return P(r, '1')

    def w(a, b): wires.append((a, b))

    # ---- input chain: cap, 270k shunt, diode, series R, 56k shunt, 15k ----
    x = 40.0
    w((x - 8, Y), (x, Y))
    add(refs['Cin'], vals['Cin'], 'Device:C', x + 6, Y, 90)
    w((x, Y), P(refs['Cin'], '1')); w(P(refs['Cin'], '2'), (x + DX, Y)); x += DX
    add(refs['R270'], '270k', 'Device:R', x, Y + 8)
    w((x, Y), P(refs['R270'], '1')); w(P(refs['R270'], '2'), gnd(x, Y + 18))
    w((x, Y), (x + DX, Y)); x += DX
    add(refs['D'], '1S1588', 'Device:D', x + 6, Y, DIODE_ROT)
    lo, hi = ('1', '2') if DIODE_ROT == 0 else ('2', '1')
    w((x, Y), P(refs['D'], lo)); w(P(refs['D'], hi), (x + DX, Y)); x += DX
    add(refs['Rser'], vals['Rser'], 'Device:R', x + 6, Y, 90)
    w((x, Y), P(refs['Rser'], '1')); w(P(refs['Rser'], '2'), (x + DX, Y)); x += DX
    add(refs['R56'], '56k', 'Device:R', x, Y + 8)
    w((x, Y), P(refs['R56'], '1')); w(P(refs['R56'], '2'), gnd(x, Y + 18))
    w((x, Y), (x + DX, Y)); x += DX
    add(refs['R15a'], '15k', 'Device:R', x + 6, Y, 90)
    w((x, Y), P(refs['R15a'], '1')); w(P(refs['R15a'], '2'), (x + DX, Y)); x += DX

    xP = x                                    # node P

    # ---- capacitive chain P -> n1 -> n2 -> base ----
    for cap, shunt in [('Cb', 'tune'), ('Cc', 'r15b'), ('Cd', None)]:
        add(refs[cap], vals[cap], 'Device:C', x + 6, Y, 90)
        w((x, Y), P(refs[cap], '1')); w(P(refs[cap], '2'), (x + DX, Y)); x += DX
        if shunt == 'tune':
            add(refs['VRt'], vals['VRt'], 'Device:R', x, Y + 8)
            add(refs['R10'], '10k', 'Device:R', x, Y + 18)
            w((x, Y), P(refs['VRt'], '1'))
            w(P(refs['VRt'], '2'), P(refs['R10'], '1'))
            w(P(refs['R10'], '2'), gnd(x, Y + 28))
        elif shunt == 'r15b':
            add(refs['R15b'], '15k', 'Device:R', x, Y + 8)
            w((x, Y), P(refs['R15b'], '1')); w(P(refs['R15b'], '2'), gnd(x, Y + 18))

    xB = x                                    # base node

    # ---- transistor ----
    qx, qy = xB + 14, Y
    add(refs['Q'], vals['Q'], 'Transistor_BJT:BC549', qx, qy)
    w((xB, Y), P(refs['Q'], '2'))             # base
    xC = P(refs['Q'], '1')[0]                 # collector x

    # bridging cap P -> collector, routed above
    YT = Y - 20
    add(refs['Ca'], vals['Ca'], 'Device:C', xP + 20, YT, 90)
    w((xP, Y), (xP, YT)); w((xP, YT), P(refs['Ca'], '1'))
    w(P(refs['Ca'], '2'), (xC, YT)); w((xC, YT), P(refs['Q'], '1'))

    # feedback 1.5M base -> collector, routed below the base line
    YF = Y + 40
    add(refs['Rfb'], '1.5M', 'Device:R', (xB + xC) / 2, YF, 90)
    w((xB, Y), (xB, YF)); w((xB, YF), P(refs['Rfb'], '1'))
    # return the feedback up a separate column so it clears the emitter leg
    w(P(refs['Rfb'], '2'), (xC + 8, YF))
    w((xC + 8, YF), (xC + 8, YT)); w((xC + 8, YT), (xC, YT))
    w(P(refs['Q'], '1'), (xC, YT))

    # collector load to +15 V
    add(refs['Rc'], '10k', 'Device:R', xC, YT - 14)
    w((xC, YT), P(refs['Rc'], '2'))
    r = '#PWR%02d' % g[0]; g[0] += 1
    add(r, '+15V', 'power:+15V', xC, YT - 24)
    w(P(refs['Rc'], '1'), P(r, '1'))

    # emitter: decay trimmer + 100 ohm
    ey = P(refs['Q'], '3')[1]
    add(refs['VRd'], vals['VRd'], 'Device:R', xC, ey + 8)
    add(refs['Re'], '100', 'Device:R', xC, ey + 18)
    w(P(refs['Q'], '3'), P(refs['VRd'], '1'))
    w(P(refs['VRd'], '2'), P(refs['Re'], '1'))
    w(P(refs['Re'], '2'), gnd(xC, ey + 28))

    # output
    ox = xC + 14
    add(refs['Cout'], vals['Cout'], 'Device:C', ox, YT, 90)
    w((xC, YT), P(refs['Cout'], '1'))
    ox2 = P(refs['Cout'], '2')[0] + 6
    w(P(refs['Cout'], '2'), (ox2, YT))
    if 'Rgnd' in refs:                        # bass drum only
        add(refs['Rgnd'], '10k', 'Device:R', ox2, YT + 8)
        w((ox2, YT), P(refs['Rgnd'], '1')); w(P(refs['Rgnd'], '2'), gnd(ox2, YT + 18))
    add(refs['Rout'], vals['Rout'], 'Device:R', ox2 + 6, YT, 90)
    w((ox2, YT), P(refs['Rout'], '1'))
    w(P(refs['Rout'], '2'), (ox2 + DX + 4, YT))

    labels = [('%s_TRIG' % name, 32.0, Y, 180), ('%s_OUT' % name, ox2 + DX + 4, YT, 0)]
    return emit('CR-78 %s' % name, fname, parts, wires, labels)


VOICES = {
 'HB': dict(refs=dict(Cin='C567', R270='R601', D='D502', Rser='R602', R56='R603',
                      R15a='R604', Cb='C569', VRt='VR51', R10='R605', Cc='C570',
                      R15b='R606', Cd='C571', Q='Q501', Ca='C568', Rfb='R608',
                      Rc='R609', VRd='VR52', Re='R607', Cout='C572', Rout='R610'),
            vals=dict(Cin='0.027u', Rser='390k', Ca='0.0082u', Cb='0.0082u',
                      Cc='0.0068u', Cd='0.0068u', VRt='10k', VRd='500',
                      Q='2SC900-F', Cout='0.0022u', Rout='1.5M')),
 'LB': dict(refs=dict(Cin='C573', R270='R611', D='D503', Rser='R612', R56='R613',
                      R15a='R614', Cb='C575', VRt='VR53', R10='R615', Cc='C576',
                      R15b='R616', Cd='C577', Q='Q502', Ca='C574', Rfb='R618',
                      Rc='R619', VRd='VR54', Re='R617', Cout='C578', Rout='R620'),
            vals=dict(Cin='0.027u', Rser='390k', Ca='0.018u', Cb='0.012u',
                      Cc='0.012u', Cd='0.01u', VRt='10k', VRd='500',
                      Q='2SC900-F', Cout='0.0082u', Rout='680k')),
 'LC': dict(refs=dict(Cin='C579', R270='R621', D='D504', Rser='R622', R56='R623',
                      R15a='R624', Cb='C581', VRt='VR55', R10='R625', Cc='C582',
                      R15b='R626', Cd='C583', Q='Q503', Ca='C580', Rfb='R628',
                      Rc='R629', VRd='VR56', Re='R627', Cout='C584', Rout='R630'),
            vals=dict(Cin='0.027u', Rser='390k', Ca='0.027u', Cb='0.022u',
                      Cc='0.022u', Cd='0.022u', VRt='10k', VRd='500',
                      Q='2SC900-F', Cout='0.01u', Rout='560k')),
 'BD': dict(refs=dict(Cin='C594', R270='R631', D='D505', Rser='R632', R56='R633',
                      R15a='R634', Cb='C586', VRt='VR57', R10='R635', Cc='C587',
                      R15b='R656', Cd='C588', Q='Q504', Ca='C585', Rfb='R638',
                      Rc='R639', VRd='VR58', Re='R637', Cout='C589',
                      Rgnd='R640', Rout='R641'),
            vals=dict(Cin='0.027u', Rser='150k', Ca='0.082u', Cb='0.082u',
                      Cc='0.069u', Cd='0.069u', VRt='10k', VRd='500',
                      Q='2SC900-F', Cout='0.027u', Rout='18k')),
}

print('trigger polarity: %s  (diode rotation %d)\n' % (TRIGGER, DIODE_ROT))
for name, spec in VOICES.items():
    f = twin_t(name, 'cr78_%s.kicad_sch' % name.lower(), spec['refs'], spec['vals'])
    print('wrote', f)
