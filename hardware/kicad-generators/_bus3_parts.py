"""Generate musicbrain-busboard.kicad_pcb (v3) — v2-floorplan per doc/busboard-v2-plan.md.

Gebaseerd op het bewezen v1-layout (Teensy west, 6 slots, hubs oost, voeding
zuidwest, B.Cu-lanebundel y 65..105) met de v2-clusters:
- U4 74HC154 (rot 180) in de oude SDA/SCL-waaierzone (53,57); CS1-8 oost-waaier,
  CS9-11 noordoost-kolommen, CS12-14 + codec-kwartet noordkolommen x 46.4-51.2.
- IRQ-keten zuidwest: U5 (40,101) op de IRQ-lanes, U7 1G125 (59,84) naar MISO.
- Expansie noord: J21 (108,22.5 rot 90), U6 (146,15.5 rot 90), U8 245 (95,31
  rot 90) met lane-taps door de inter-slot-kolommen.
- MIDI/CAN/EXP/DLG zuidrand; codec-header J17 + TUNE noordwest.
- Teensy-courtyard = twee socketstroken (SMD eronder toegestaan, sockets!).
"""
import math, re

FP_DIR = r"C:\Program Files\KiCad\10.0\share\kicad\footprints"
OUT = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-busboard\musicbrain-busboard.kicad_pcb"
SCH_FILE = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-busboard\musicbrain-busboard.kicad_sch"

def tokenize(text):
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c in ' \t\r\n':
            i += 1
        elif c in '()':
            yield c; i += 1
        elif c == '"':
            j = i + 1; buf = []
            while text[j] != '"':
                if text[j] == '\\':
                    buf.append(text[j:j+2]); j += 2
                else:
                    buf.append(text[j]); j += 1
            yield '"' + ''.join(buf) + '"'; i = j + 1
        else:
            j = i
            while j < n and text[j] not in ' \t\r\n()':
                j += 1
            yield text[i:j]; i = j

def parse(text):
    stack = [[]]
    for tok in tokenize(text):
        if tok == '(':
            stack.append([])
        elif tok == ')':
            done = stack.pop(); stack[-1].append(done)
        else:
            stack[-1].append(tok)
    return stack[0][0]

def serialize(node, indent=0):
    pad = '  ' * indent
    if not isinstance(node, list):
        return pad + node
    if all(not isinstance(x, list) for x in node):
        return pad + '(' + ' '.join(node) + ')'
    line = pad + '(' + str(node[0])
    i = 1
    while i < len(node) and not isinstance(node[i], list):
        line += ' ' + node[i]; i += 1
    out = [line]
    for child in node[i:]:
        out.append(serialize(child, indent + 1))
    out.append(pad + ')')
    return '\n'.join(out)

STRIP_HEADS = {'version', 'generator', 'generator_version',
               'duplicate_pad_numbers_are_jumpers', 'embedded_fonts',
               'tenting', 'zone_layer_connections'}

def fmt(v):
    s = f'{v:.6f}'.rstrip('0').rstrip('.')
    return s if s else '0'

_u = [0]
def uid():
    _u[0] += 1
    return f'c3000000-0000-4000-8000-{_u[0]:012d}'

def rotxy(px, py, rot):
    c = math.cos(math.radians(rot)); s = math.sin(math.radians(rot))
    return (px * c + py * s, -px * s + py * c)

P = {}  # ref -> pad -> (x, y)

# Reference-labelpositie per ref (lokale coords; teksthoek blijft 0 =
# horizontaal). Zuidrand-headers (rot 90) kregen hun lib-label ONDER de body;
# rot 90: global = anker + (ly, -lx) -> lx = 3.9 zet het label 3,9 mm noord
# van de pinnenrij, ly = halve rijlengte centreert het boven de connector.
REF_AT = {
    'J7': (1.27, -6.5), 'J8': (2, -6.5), 'J9': (1.27, -6.5),     # HUB1/HUB2/PWRIN IDC 2x5
    'J10': (5.5, 9),                                             # EXP 2x7
    'J11': (-1, -3.5),                                           # DISPLAY 1x9
    'J12': (3.9, 3.81), 'J16': (3.9, 3.81),                      # QWIIC / CAN
    'J13': (3.9, 2.54), 'J14': (3.9, 2.54), 'J15': (3.9, 2.54),  # MIDI 1x3
    'J17': (2.5, -6.15),                                         # AUDIO/CODEC 2x7
    'J18': (-3.5, -1),                                           # TUNE 1x2
    'J19': (3.9, 3.81), 'J20': (3.9, 3.81),                      # DLG 1x4
    'J21': (2.5, -7.5),                                          # EXPANSION IDC 2x13
    'J22': (3.9, 2.54),                                          # MIDI OUT2 1x3
    'J23': (1.27, -6.5),                                         # USB HOST 2x5
    'J24': (2.5, -6.15),                                         # AUDIOHUB 2x7
}

def load_footprint(relpath, lib_id, ref, value, x, y, path_uuid, netmap, rot=0):
    tree = parse(open(FP_DIR + '\\' + relpath, encoding='utf-8').read())
    tree[1] = f'"{lib_id}"'
    body = []
    P[ref] = {}
    for node in tree[2:]:
        if isinstance(node, list):
            if node[0] in STRIP_HEADS:
                continue
            if node[0] == 'property' and node[1] == '"KiLib_Generator"':
                continue
            if node[0] == 'property' and node[1] == '"Reference"':
                node[2] = f'"{ref}"'
                if ref in REF_AT:
                    _lx, _ly = REF_AT[ref]
                    for _sub in node:
                        if isinstance(_sub, list) and _sub[0] == 'at':
                            _sub[1], _sub[2] = fmt(_lx), fmt(_ly)
                            if len(_sub) > 3:
                                _sub[3] = '0'
            if node[0] == 'property' and node[1] == '"Value"':
                node[2] = f'"{value}"'
            if node[0] == 'pad':
                num = node[1].strip('"')
                for sub in node:
                    if isinstance(sub, list) and sub[0] == 'at':
                        px, py = float(sub[1]), float(sub[2])
                        dx, dy = rotxy(px, py, rot)
                        key = num
                        while key in P[ref]:
                            key += 'b'
                        P[ref][key] = (round(x + dx, 4), round(y + dy, 4))
                        if rot:
                            if len(sub) == 3:
                                sub.append(fmt(rot))
                            else:
                                sub[3] = fmt((float(sub[3]) + rot) % 360)
                if num in netmap:
                    idx, name = netmap[num]
                    node.append(['net', str(idx), f'"{name}"'])
            body.append(node)
        else:
            body.append(node)
    at = ['at', fmt(x), fmt(y), str(rot)] if rot else ['at', fmt(x), fmt(y)]
    tree[2:] = [['uuid', f'"{uid()}"'], at, ['path', f'"/{path_uuid}"']] + body
    return tree


<<<NETS>>>
# ---------- custom Teensy 4.1 footprint (courtyard = 2 socketstroken) ----------
def teensy_fp(x0, y0, netmap, path_uuid):
    pads = []
    for n in range(1, 25):
        pads.append((n, 0.0, 2.54 * (n - 1)))
    for n in range(25, 49):
        pads.append((n, 15.24, 2.54 * (48 - n)))
    P['U1'] = {}
    pad_txt = []
    for n, px, py in pads:
        P['U1'][str(n)] = (round(x0 + px, 4), round(y0 + py, 4))
        shape = 'rect' if n == 1 else 'oval'
        net = ''
        if str(n) in netmap:
            idx, name = netmap[str(n)]
            net = f' (net {idx} "{name}")'
        pad_txt.append(f'    (pad "{n}" thru_hole {shape} (at {fmt(px)} {fmt(py)}) '
                       f'(size 1.7 1.7) (drill 1.0) (layers "*.Cu" "*.Mask"){net})')
    return f'''  (footprint "MusicBrain:Teensy41_THT"
    (layer "F.Cu")
    (uuid "{uid()}")
    (at {fmt(x0)} {fmt(y0)})
    (path "/{path_uuid}")
    (descr "Teensy 4.1 op twee 1x24 socketstrips; courtyard = alleen de strips (SMD <=6mm eronder ok)")
    (property "Reference" "U1" (at 7.62 -2.8 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "Teensy 4.1" (at 7.62 61.2 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (attr through_hole)
    (fp_rect (start -1.27 -1.6) (end 16.51 60.02)
      (stroke (width 0.12) (type solid)) (fill no) (layer "F.SilkS"))
    (fp_rect (start -2.5 -2.5) (end 2.5 60.3)
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
    (fp_rect (start 12.74 -2.5) (end 17.74 60.3)
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
    (fp_text user "USB" (at 7.62 0 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (fp_text user "SMD <=6mm onder Teensy (sockets)" (at 7.62 30 90) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
{chr(10).join(pad_txt)}
  )'''


<<<REST>>>
