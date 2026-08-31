#!/usr/bin/env python3
"""
Both passive pinged-LC voices of the CR-78, generated from a one-line-per-
component description. The layout is computed, not hand-placed: every voice
of this family is a ladder of series elements along one signal line with
shunt legs dropping to ground, so one layout routine covers them all.
"""
import sys
sys.path.insert(0, '/home/claude/cr78')
from sch_gen import build, pin_xy, DIODE_ROT, TRIGGER

DX   = 12.0     # column pitch
YSIG = 100.0    # signal line
YSH  = 8.0      # shunt symbol offset below the line
YGND = 18.0     # ground symbol offset below the line


def ladder(items, x0=50.0, y=YSIG, gnd_start=1):
    """items: (kind, ref, value, lib_id) with kind 's' (series) or 'p' (shunt).
    Returns parts, wires, and the x of the output node."""
    parts, wires = [], []
    x = x0
    g = gnd_start

    def P(ref, num):
        for r, v, lib, px, py, rt in parts:
            if r == ref:
                return pin_xy(lib, px, py, rt, num)
        raise KeyError(ref)

    for kind, ref, val, lib in items:
        if kind == 's':
            isd = (lib == 'Device:D')
            rot = DIODE_ROT if isd else 90
            lo, hi = ('1', '2') if (not isd or DIODE_ROT == 0) else ('2', '1')
            parts.append((ref, val, lib, x + DX / 2, y, rot))
            wires.append(((x, y), P(ref, lo)))
            wires.append((P(ref, hi), (x + DX, y)))
        else:
            parts.append((ref, val, lib, x, y + YSH, 0))
            gref = '#PWR%02d' % g
            parts.append((gref, 'GND', 'power:GND', x, y + YGND, 0))
            g += 1
            wires.append(((x, y), P(ref, '1')))
            wires.append((P(ref, '2'), P(gref, '1')))
            wires.append(((x, y), (x + DX, y)))
        x += DX
    return parts, wires, x


def make(title, fname, items, in_label, out_label):
    parts, wires, xend = ladder(items)
    wires.insert(0, ((38.0, YSIG), (50.0, YSIG)))
    wires.append(((xend, YSIG), (xend + 10.0, YSIG)))
    labels = [(in_label, 38.0, YSIG, 180), (out_label, xend + 10.0, YSIG, 0)]
    open('/mnt/user-data/outputs/' + fname, 'w').write(build(title, parts, wires, labels))
    print('%-28s %2d componenten, %2d draden' % (fname, len(parts), len(wires)))


# ---------------------------------------------------------------- rim shot
make('CR-78 Rim Shot', 'cr78_rimshot.kicad_sch', [
    ('s', 'C590', '0.027u',  'Device:C'),
    ('p', 'R503', '270k',    'Device:R'),
    ('s', 'D501', '1S1588',  'Device:D'),
    ('s', 'R504', '27k',     'Device:R'),
    ('p', 'R505', '47k',     'Device:R'),
    ('p', 'L2',   '700m',    'Device:L'),
    ('p', 'C591', '0.015u',  'Device:C'),
    ('p', 'C592', '0.0015u', 'Device:C'),
    ('s', 'C593', '470p',    'Device:C'),
], 'RS_TRIG', 'RS_OUT')

# ------------------------------------------------------------------ claves
make('CR-78 Claves', 'cr78_claves.kicad_sch', [
    ('s', 'C500', '0.027u',  'Device:C'),
    ('p', 'R500', '270k',    'Device:R'),
    ('s', 'D500', '1S1588',  'Device:D'),
    ('p', 'R501', '2.2M',    'Device:R'),
    ('s', 'R502', '47k',     'Device:R'),
    ('p', 'C501', '0.001u',  'Device:C'),
    ('s', 'C502', '0.0022u', 'Device:C'),
    ('p', 'L1',   '700m',    'Device:L'),
    ('p', 'C506', '0.0047u', 'Device:C'),
    ('s', 'C503', '250p',    'Device:C'),
    ('p', 'C505', '0.0056u', 'Device:C'),
    ('s', 'C504', '0.001u',  'Device:C'),
], 'CL_TRIG', 'CL_OUT')
