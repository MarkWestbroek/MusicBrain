"""Gedeelde helpers voor MusicBrain-slotkaart-generatoren (PCB + netcheck).

Kaartmodel (doc/spi-bus-spec.md): x = B-richting, y = H (80 mm),
busrand onder (BY1), paneelrand boven (BY0).
J1 = PinHeader_2x10_Horizontal rot 270 op (CX+11.43, BY1-6.58);
J2 = PinHeader_1x10_Horizontal rot 90 op (CX-11.43, BY0+6.58).
"""
import re

FP_DIR = r"C:\Program Files\KiCad\10.0\share\kicad\footprints"

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

def rotxy(px, py, rot):
    c = {0: 1, 90: 0, 180: -1, 270: 0}[rot]
    s = {0: 0, 90: 1, 180: 0, 270: -1}[rot]
    return (px * c + py * s, -px * s + py * c)


_FLIP_LAY = re.compile(r'"([FB])\.(Cu|Paste|Mask|SilkS|Fab|CrtYd|Adhes)"')


def flip_tree(node):
    """Spiegel een footprint-boom naar de B-zijde (pcbnew-flip om de x-as):
    lokale y negeren, F.<laag> <-> B.<laag>, tekst (justify mirror)."""
    if not isinstance(node, list) or not node:
        return
    head = node[0]
    if head in ('at', 'start', 'end', 'xy', 'center', 'mid') and len(node) >= 3 \
            and not isinstance(node[2], list):
        try:
            node[2] = fmt(-float(node[2]))
        except ValueError:
            pass
    if head in ('layer', 'layers'):
        for i in range(1, len(node)):
            if not isinstance(node[i], list):
                m = _FLIP_LAY.fullmatch(node[i])
                if m:
                    node[i] = f'"{"B" if m.group(1) == "F" else "F"}.{m.group(2)}"'
    if head == 'effects':
        node.append(['justify', 'mirror'])
    for sub in node:
        flip_tree(sub)

class Board:
    def __init__(self, title, rev, silk, bx0, by0, bx1, by1, nets, date):
        self.title, self.rev, self.silk = title, rev, silk
        self.b = (bx0, by0, bx1, by1)
        self.NETS = nets
        self.NI = {n: i for i, n in enumerate(nets)}
        self.date = date
        self.P = {}
        self.PNET = {}         # ref -> {pad: net-index} (alleen fp()-pads)
        self.PADS = []         # (netidx|None, x, y, hx, hy, side 'F'/'B'/'*')
        self.fp_texts = []
        self.tracks, self.vias, self.extra = [], [], []
        self.paper = "A4"      # zet op "A3" voor borden die van A4-landscape vallen
        # Koperstapel. Standaard 2 lagen (F/B). Voor 4 lagen:
        #   b.copper = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']
        # GND-zones komen op elke laag in gnd_zone_layers (None = alle koperlagen).
        self.copper = ['F.Cu', 'B.Cu']
        self.gnd_zone_layers = None
        self.zone_clearance = 0.3      # GND-zone pad-clearance
        self.zone_min_thickness = 0.2  # GND-zone minimale koperdikte
        self._u = 0

    def uid(self):
        self._u += 1
        return f'ca4d0000-0000-4000-8000-{self._u:012d}'

    def nm(self, m):
        return {p: (self.NI[n], n) for p, n in m.items()}

    def rc(self, a, b):
        return self.nm({'1': a, '2': b})

    def fp(self, relpath, lib_id, ref, val, x, y, rot, netmap, path_uuid='',
           skip_pad_drill=None, flip=False):
        """skip_pad_drill: laat pads met deze boring weg (bv. 0.2mm
        thermal-vias in module-EP's die onder de fab-minimumboring vallen).
        flip=True: footprint op de B-zijde (canonieke pcbnew-flip; alleen
        rot 0 ondersteund — genoeg voor 0603-passieven)."""
        tree = parse(open(FP_DIR + '\\' + relpath, encoding='utf-8').read())
        tree[1] = f'"{lib_id}"'
        if flip:
            assert rot in (0, 180), "flip alleen met rot 0/180"
            for node in tree[2:]:
                flip_tree(node)
        body = []
        self.P[ref] = {}
        for node in tree[2:]:
            if isinstance(node, list):
                if node[0] in STRIP_HEADS:
                    continue
                if (skip_pad_drill is not None and node[0] == 'pad'
                        and any(isinstance(sub, list) and sub[0] == 'drill'
                                and len(sub) > 1 and not isinstance(sub[1], list)
                                and abs(float(sub[1]) - skip_pad_drill) < 1e-6
                                for sub in node)):
                    continue
                if node[0] == 'property' and node[1] == '"KiLib_Generator"':
                    continue
                if node[0] == 'property' and node[1] == '"Reference"':
                    node[2] = f'"{ref}"'
                    # optionele label-herplaatsing (lokale coords):
                    # b.ref_at = {ref: (lx, ly[, hoek])}. Hoek default 0 =
                    # horizontaal; 90 = verticaal. Zie bus2-REF_AT:
                    # rot 90 -> global = anker + (ly, -lx).
                    _ra = getattr(self, 'ref_at', None)
                    if _ra and ref in _ra:
                        _lx, _ly = _ra[ref][0], _ra[ref][1]
                        _ang = _ra[ref][2] if len(_ra[ref]) > 2 else 0
                        for _sub in node:
                            if isinstance(_sub, list) and _sub[0] == 'at':
                                _sub[1], _sub[2] = fmt(_lx), fmt(_ly)
                                if len(_sub) > 3:
                                    _sub[3] = fmt(_ang)
                                else:
                                    _sub.append(fmt(_ang))
                if node[0] == 'property' and node[1] == '"Value"':
                    node[2] = f'"{val}"'
                if node[0] == 'pad':
                    num = node[1].strip('"')
                    _sz, _tht, _onB = None, False, False
                    for sub in node:
                        if isinstance(sub, list) and sub[0] == 'size':
                            _sz = (float(sub[1]), float(sub[2]))
                        if isinstance(sub, list) and sub[0] == 'drill':
                            _tht = True
                        if isinstance(sub, list) and sub[0] == 'layers':
                            _onB = any(t in ('"B.Cu"', 'B.Cu') for t in sub[1:]
                                       if not isinstance(t, list))
                        if isinstance(sub, list) and sub[0] == 'at':
                            px, py = float(sub[1]), float(sub[2])
                            dx, dy = rotxy(px, py, rot)
                            key = num
                            while key in self.P[ref]:
                                key += 'b'
                            self.P[ref][key] = (round(x + dx, 4), round(y + dy, 4))
                            if rot:
                                # padvorm meedraaien (pad-hoek is absoluut in het bestand)
                                if len(sub) == 3:
                                    sub.append(fmt(rot))
                                else:
                                    sub[3] = fmt((float(sub[3]) + rot) % 360)
                    ni = None
                    if num in netmap:
                        idx, name = netmap[num]
                        node.append(['net', str(idx), f'"{name}"'])
                        self.PNET.setdefault(ref, {})[key] = idx
                        ni = idx
                    hx, hy = (_sz or (0.5, 0.5))
                    hx, hy = hx / 2, hy / 2
                    if rot % 180:
                        hx, hy = hy, hx
                    side = '*' if _tht else ('B' if _onB else 'F')
                    self.PADS.append((ni, *self.P[ref][key], hx, hy, side))
            body.append(node)
        at = ['at', fmt(x), fmt(y), str(rot)] if rot else ['at', fmt(x), fmt(y)]
        tree[2:] = [['uuid', f'"{self.uid()}"'], at, ['path', f'"/{path_uuid}"']] + body
        self.fp_texts.append(serialize(tree, 1))

    def raw_fp(self, text):
        self.fp_texts.append(text)

    def T(self, net, layer, w, *pts):
        self.tracks.append((self.NI[net], layer, w, pts))

    def V(self, net, x, y):
        self.vias.append((self.NI[net], x, y))

    def snap_stubs(self, r=1.4):
        """Verleng bungelende SES-spooruiteinden naar het dichtstbijzijnde pad
        van hetzelfde net binnen r mm. Freerouting eindigt soms 0,1-1,3 mm voor
        een (QFN-)padcentrum omdat zijn padbenadering iets groter is dan die
        van KiCad; DRC ziet dat als unconnected."""
        import math
        from collections import Counter
        pads = []
        for ref, m in self.PNET.items():
            for pad, ni in m.items():
                px, py = self.P[ref][pad]
                pads.append((ni, px, py))
        ends = Counter()
        for net, layer, w, pts in self.tracks:
            ends[(net, round(pts[0][0], 3), round(pts[0][1], 3))] += 1
            ends[(net, round(pts[-1][0], 3), round(pts[-1][1], 3))] += 1
        added = 0
        for net, layer, w, pts in list(self.tracks):
            for end in (pts[0], pts[-1]):
                if ends[(net, round(end[0], 3), round(end[1], 3))] != 1:
                    continue    # geen bungelend uiteinde
                best = None
                for ni, px, py in pads:
                    if ni != net:
                        continue
                    d = math.hypot(end[0] - px, end[1] - py)
                    if 0.05 < d <= r and (best is None or d < best[0]):
                        best = (d, px, py)
                if best:
                    self.tracks.append((net, layer, w, (tuple(end), (best[1], best[2]))))
                    added += 1
        return added

    def write(self, out):
        bx0, by0, bx1, by1 = self.b
        _LAYNUM = {'F.Cu': 0, 'In1.Cu': 1, 'In2.Cu': 2, 'In3.Cu': 3,
                   'In4.Cu': 4, 'B.Cu': 31}
        cu_lines = '\n'.join(f'    ({_LAYNUM[l]} "{l}" signal)'
                             for l in self.copper)
        header = f'''(kicad_pcb
  (version 20240108)
  (generator "pcbnew")
  (generator_version "8.0")
  (general (thickness 1.6) (legacy_teardrops no))
  (paper "{self.paper}")
  (title_block
    (title "{self.title}")
    (date "{self.date}")
    (rev "{self.rev}")
    (company "MusicBrain project")
  )
  (layers
{cu_lines}
    (32 "B.Adhes" user "B.Adhesive")
    (33 "F.Adhes" user "F.Adhesive")
    (34 "B.Paste" user)
    (35 "F.Paste" user)
    (36 "B.SilkS" user "B.Silkscreen")
    (37 "F.SilkS" user "F.Silkscreen")
    (38 "B.Mask" user)
    (39 "F.Mask" user)
    (40 "Dwgs.User" user "User.Drawings")
    (41 "Cmts.User" user "User.Comments")
    (42 "Eco1.User" user "User.Eco1")
    (43 "Eco2.User" user "User.Eco2")
    (44 "Edge.Cuts" user)
    (45 "Margin" user)
    (46 "B.CrtYd" user "B.Courtyard")
    (47 "F.CrtYd" user "F.Courtyard")
    (48 "B.Fab" user)
    (49 "F.Fab" user)
  )
  (setup
    (pad_to_mask_clearance 0)
    (allow_soldermask_bridges_in_footprints no)
    (aux_axis_origin {bx0} {by0})
    (grid_origin {bx0} {by0})
  )
'''
        nets_block = '\n'.join(f'  (net {i} "{n}")' for i, n in enumerate(self.NETS))
        # Collineaire aansluitende/overlappende segmenten van hetzelfde net
        # samenvoegen tot maximale segmenten. SES-echo's + snap_stubs leveren
        # kettingen en deel-overlaps op; freerouting's DSN-import loopt daar
        # in een oneindige combine-recursie op vast (StackOverflow, vcf8kern
        # 2026-07-21). Zelfde-net-T-punten blijven geometrisch verbonden.
        import math as _math
        _groups = {}
        for net, layer, w, pts in self.tracks:
            for a, b in zip(pts, pts[1:]):
                if tuple(a) == tuple(b):
                    continue
                x1, y1, x2, y2 = a[0], a[1], b[0], b[1]
                dx, dy = x2 - x1, y2 - y1
                ln = _math.hypot(dx, dy)
                ux, uy = dx / ln, dy / ln
                if ux < -1e-9 or (abs(ux) <= 1e-9 and uy < 0):
                    ux, uy = -ux, -uy
                    x1, y1, x2, y2 = x2, y2, x1, y1
                key = (net, layer, w, round(ux, 5), round(uy, 5),
                       round(-uy * x1 + ux * y1, 3))
                _groups.setdefault(key, []).append(
                    (ux * x1 + uy * y1, ux * x2 + uy * y2, x1, y1, x2, y2))
        tt = []

        def _emit(net, layer, w, seg):
            tt.append(f'  (segment (start {fmt(seg[2])} {fmt(seg[3])}) '
                      f'(end {fmt(seg[4])} {fmt(seg[5])}) '
                      f'(width {w}) (layer "{layer}") (net {net}) (uuid "{self.uid()}"))')

        for (net, layer, w, _ux, _uy, _c), iv in _groups.items():
            iv.sort()
            cur = None
            for t1, t2, x1, y1, x2, y2 in iv:
                if cur is not None and t1 <= cur[1] + 1e-3:
                    if t2 > cur[1]:
                        cur = (cur[0], t2, cur[2], cur[3], x2, y2)
                else:
                    if cur is not None:
                        _emit(net, layer, w, cur)
                    cur = (t1, t2, x1, y1, x2, y2)
            if cur is not None:
                _emit(net, layer, w, cur)
        seen_via = set()      # dedup co-located via's (freerouting-artefact)
        for net, x, y in self.vias:
            key = (round(x, 3), round(y, 3))
            if key in seen_via:
                continue
            seen_via.add(key)
            tt.append(f'  (via (at {fmt(x)} {fmt(y)}) (size 0.5) (drill 0.3) '
                      f'(layers "F.Cu" "B.Cu") (net {net}) (uuid "{self.uid()}"))')
        sx, sy, srot = self.silk
        extras = f'''
  (gr_rect (start {bx0} {by0}) (end {bx1} {by1})
    (stroke (width 0.1) (type default)) (fill none)
    (layer "Edge.Cuts") (uuid "{self.uid()}"))
  (gr_text "musicbrain.nl/hw/{self.silk_name} rev {self.rev}" (at {fmt(sx)} {fmt(sy)} {srot}) (layer "F.SilkS")
    (uuid "{self.uid()}")
    (effects (font (size 1 1) (thickness 0.15))))
'''

        def zone(layer):
            return f'''
  (zone (net {self.NI['GND']}) (net_name "GND") (layer "{layer}")
    (uuid "{self.uid()}")
    (hatch edge 0.5)
    (connect_pads yes (clearance {self.zone_clearance}))
    (min_thickness {self.zone_min_thickness}) (filled_areas_thickness no)
    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))
    (polygon (pts
      (xy {bx0+0.5} {by0+0.5}) (xy {bx1-0.5} {by0+0.5})
      (xy {bx1-0.5} {by1-0.5}) (xy {bx0+0.5} {by1-0.5})
    ))
  )'''
        gnd_layers = (self.gnd_zone_layers if self.gnd_zone_layers is not None
                      else self.copper)
        out_txt = (header + nets_block + '\n' + '\n'.join(self.fp_texts) + '\n'
                   + '\n'.join(tt) + extras + '\n'.join(self.extra)
                   + ''.join(zone(l) for l in gnd_layers) + '\n)\n')
        open(out, 'w', encoding='utf-8', newline='\n').write(out_txt)
        print('written', out, f'({len(tt)} routed items)')


def netcheck(netfile, pcbfile):
    import collections
    txt = open(netfile, encoding='utf-8').read()
    want = {}
    for name, body in re.findall(r'\(net\s+\(code "\d+"\)\s+\(name "([^"]+)"\)(.*?)(?=\(net\s|\Z)', txt, re.S):
        pins = {f'{r}.{p}' for r, p in re.findall(r'\(ref "([^"]+)"\)\s+\(pin "([^"]+)"\)', body)}
        if len(pins) > 1:
            want[name] = pins
    pcb = open(pcbfile, encoding='utf-8').read()

    def blocks(s, key):
        i = 0
        while True:
            j = s.find('(' + key + ' ', i)
            if j < 0:
                return
            depth = 0; k = j
            while True:
                if s[k] == '(':
                    depth += 1
                elif s[k] == ')':
                    depth -= 1
                if depth == 0:
                    break
                k += 1
            yield s[j:k+1]; i = k + 1
    have = collections.defaultdict(set)
    for fp_ in blocks(pcb, 'footprint'):
        ref = re.search(r'\(property "Reference" "([^"]+)"', fp_).group(1)
        for pd in blocks(fp_, 'pad'):
            num = re.match(r'\(pad "([^"]*)"', pd).group(1)
            nm_ = re.search(r'\(net \d+ "([^"]+)"\)', pd)
            if nm_:
                have[nm_.group(1)].add(f'{ref}.{num}')

    def canon(n):
        return n.replace('{slash}', '/')
    have2 = collections.defaultdict(set)
    for k, v in have.items():
        have2[canon(k)] |= v
    ok = True
    for net, pins in want.items():
        if have2.get(canon(net), set()) != pins:
            ok = False
            print('MISMATCH', net,
                  'sch-only:', sorted(pins - have2.get(canon(net), set())),
                  'pcb-only:', sorted(have2.get(canon(net), set()) - pins))
    print('NETCHECK OK' if ok else 'NETCHECK FAILED')
    return ok
