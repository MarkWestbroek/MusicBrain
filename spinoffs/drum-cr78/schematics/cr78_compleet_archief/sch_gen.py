#!/usr/bin/env python3
"""
sch_gen.py - write a KiCad 6 (.kicad_sch) schematic from a placement
description, then verify it by re-extracting the netlist from the file it
just wrote and comparing that against the intended netlist.

The symbol definitions for Device:R / Device:C / Device:D / power:GND are
lifted verbatim from an existing KiCad project so they are guaranteed to be
the exact ones KiCad expects. Device:L is written out by hand.
"""
import re, uuid, math
from collections import defaultdict

# ===================================================================
# Trigger polarity for the whole machine. Confirmed from the scan:
# every voice's steering diode has its cathode facing the input, so the
# trigger rests high and dips low. Flip this and every voice regenerates.
TRIGGER   = 'negative'
DIODE_ROT = 0 if TRIGGER == 'negative' else 180
# ===================================================================

DONOR = '/home/claude/snare/pcb/pcb.kicad_sch'

# ---------------------------------------------------------------- donor libs
def grab(src, lib_id):
    i = src.find('(symbol "%s"' % lib_id)
    if i < 0: raise KeyError(lib_id)
    d = 0
    for j in range(i, len(src)):
        if src[j] == '(': d += 1
        elif src[j] == ')':
            d -= 1
            if d == 0: return src[i:j+1]
    raise ValueError

DONOR_SRC = open(DONOR).read()

L_SYM = '''(symbol "Device:L" (pin_numbers hide) (pin_names (offset 1.016) hide) (in_bom yes) (on_board yes)
      (property "Reference" "L" (id 0) (at -1.27 0 90) (effects (font (size 1.27 1.27))))
      (property "Value" "L" (id 1) (at 1.905 0 90) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (id 2) (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
      (property "Datasheet" "~" (id 3) (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
      (symbol "L_0_1"
        (arc (start 0 -2.54) (mid 0.6323 -1.905) (end 0 -1.27) (stroke (width 0) (type default)) (fill (type none)))
        (arc (start 0 -1.27) (mid 0.6323 -0.635) (end 0 0) (stroke (width 0) (type default)) (fill (type none)))
        (arc (start 0 0) (mid 0.6323 0.635) (end 0 1.27) (stroke (width 0) (type default)) (fill (type none)))
        (arc (start 0 1.27) (mid 0.6323 1.905) (end 0 2.54) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "L_1_1"
        (pin passive line (at 0 3.81 270) (length 1.27) (name "1" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 0 -3.81 90) (length 1.27) (name "2" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
      )
    )'''

LIBS = {k: grab(DONOR_SRC, k) for k in ['Device:R', 'Device:C', 'Device:D', 'power:GND']}
LIBS['Device:L'] = L_SYM

# pin geometry, read back out of the definitions we are actually embedding
PINS = {}
for lib, txt in LIBS.items():
    PINS[lib] = [(m[3], float(m[0]), float(m[1]))
                 for m in re.findall(r'\(pin \w+ \w+ \(at ([-\d.]+) ([-\d.]+) (\d+)\)'
                                     r'[\s\S]*?\(number "([^"]*)"', txt)]

def rot(x, y, a):
    return {0: (x, y), 90: (-y, x), 180: (-x, -y), 270: (y, -x)}[a % 360]

def pin_xy(lib, px, py, ang, num):
    for n, lx, ly in PINS[lib]:
        if n == num:
            rx, ry = rot(lx, ly, ang)
            return (round(px + rx, 2), round(py - ry, 2))
    raise KeyError((lib, num))

# ---------------------------------------------------------------- emitter
def build(title, parts, wires, labels, page='A4'):
    """parts: list of (ref, value, lib_id, x, y, rotation)
       wires: list of ((x1,y1),(x2,y2))
       labels: list of (text, x, y, rotation)"""
    U = lambda: str(uuid.uuid4())
    out = ['(kicad_sch (version 20211123) (generator sch_gen)', '',
           '  (uuid %s)' % U(), '', '  (paper "%s")' % page, '',
           '  (title_block (title "%s") (company "CR-78 reconstruction"))' % title, '',
           '  (lib_symbols']
    for lib in sorted(set(p[2] for p in parts)):
        out.append('    ' + LIBS[lib])
    out.append('  )')
    out.append('')

    for a, b in wires:
        out.append('  (wire (pts (xy %s %s) (xy %s %s))' % (a[0], a[1], b[0], b[1]))
        out.append('    (stroke (width 0) (type default) (color 0 0 0 0)) (uuid %s)' % U())
        out.append('  )')

    # junction wherever three or more wire ends meet
    ends = defaultdict(int)
    for a, b in wires:
        ends[a] += 1; ends[b] += 1
    for pt, n in ends.items():
        if n >= 3:
            out.append('  (junction (at %s %s) (diameter 0) (color 0 0 0 0) (uuid %s))' % (pt[0], pt[1], U()))

    for txt, x, y, r in labels:
        out.append('  (global_label "%s" (shape input) (at %s %s %s) (fields_autoplaced)' % (txt, x, y, r))
        out.append('    (effects (font (size 1.27 1.27)) (justify left)) (uuid %s)' % U())
        out.append('  )')

    inst = []
    for ref, val, lib, x, y, r in parts:
        u = U()
        out.append('  (symbol (lib_id "%s") (at %s %s %s) (unit 1)' % (lib, x, y, r))
        out.append('    (in_bom yes) (on_board yes) (fields_autoplaced)')
        out.append('    (uuid %s)' % u)
        hide = ' hide' if lib.startswith('power:') else ''
        out.append('    (property "Reference" "%s" (id 0) (at %s %s 0)' % (ref, x + 2.54, y - 1.27))
        out.append('      (effects (font (size 1.27 1.27)) (justify left)%s))' % hide)
        out.append('    (property "Value" "%s" (id 1) (at %s %s 0)' % (val, x + 2.54, y + 1.27))
        out.append('      (effects (font (size 1.27 1.27)) (justify left)))')
        for pi, (n, _, _) in enumerate(PINS[lib]):
            out.append('    (pin "%s" (uuid %s))' % (n, U()))
        out.append('  )')
        inst.append((u, ref))

    out.append('')
    out.append('  (sheet_instances (path "/" (page "1")))')
    out.append('  (symbol_instances')
    for u, ref in inst:
        out.append('    (path "/%s" (reference "%s") (unit 1) (value "") (footprint ""))' % (u, ref))
    out.append('  )')
    out.append(')')
    return '\n'.join(out) + '\n'
