"""Deterministische afmaker voor freerouting-restjes (vcf8kern, 2026-07-21).

Freerouting (v2.1 en v2.2.4) laat op dichte borden een staart achter en de
hybride narun crasht/hangt op de import van protected wiring. Deze module
maakt het bord in de GENERATOR af:

  purge_conflicts(b)  - mini-DRC: verwijdert spoorsegmenten die hard door
                        vreemd koper lopen (freerouting/snap_stubs-artefacten);
                        pads roundrect-bewust (rratio 0.25) om valse treffers
                        op hoekpassages te vermijden. Het gat herstelt de
                        maze-router daarna.
  finish_routes(b)    - union-find per net over pads/sporen/via's; elk
                        gebroken net wordt afgemaakt met Dijkstra op een
                        0,2 mm-grid (F.Cu/B.Cu, via-kosten). Obstakelkaart =
                        EIGENAAR-kaart: cel vrij (0), hard geblokkeerd (-1,
                        rand/multi-net) of van net X -> net X mag er wel
                        doorheen/vanaf starten. GND overslaan (zones +
                        gnd_stitch doen GND).

De afmaker routeert SMALLER dan freerouting (0.2 spoor / 0.16 clearance,
enc5front-precedent) zodat hij door gaten glipt waar 0.25/0.2 niet meer
past. VEREIST: Default-netclass clearance 0.15 + min_track_width 0.15 in
het .kicad_pro (anders keurt DRC de smalle staarten af). Purge-drempel =
0.13 gap (hard conflict onder het 0.15-bordminimum).
"""
import heapq
import math
from array import array

W = 0.2           # spoorbreedte afmaak-routes (smaller dan freerouting-0.25)
CLR = 0.16        # route-clearance (bordminimum 0.15 + marge)
PURGE_GAP = 0.13  # bestaand koper: pas purgen onder deze gap (echte fout)
GRID = 0.2        # rasterstap
VIA_R = 0.25      # via-ring-straal
VIA_COST = 30     # in rasterstappen
EDGE = 0.85       # marge tot bordrand (via-ring 0.25 + copper_edge 0.5 + kwantisatie)
LAYERS = ('F.Cu', 'B.Cu')
HARD = -1


def _rr(hx, hy):
    """roundrect-hoekstraal (KiCad rratio 0.25, gecapt op 0.25 mm)."""
    return min(0.25, 0.5 * min(hx, hy))


def _seg_pt_d(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    ln2 = dx * dx + dy * dy
    if ln2 < 1e-12:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / ln2))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def _seg_pad_d(ax, ay, bx, by, cx, cy, hx, hy, circle=False):
    """Afstand segment -> pad (sampling 0.05). SMD = roundrect (rratio
    0.25); THT (circle=True) = CIRKEL r=max(hx,hy) — het rect-model
    overschatte hoeken met ~0.25 en purgede legale header-passages
    (J1/J2/J3-slachting 2026-07-21)."""
    if circle:
        r = max(hx, hy)
        sx, sy = 0.0, 0.0
    else:
        r = _rr(hx, hy)
        sx, sy = hx - r, hy - r
    n = max(1, int(math.hypot(bx - ax, by - ay) / 0.05))
    best = 1e9
    for i in range(n + 1):
        px = ax + (bx - ax) * i / n
        py = ay + (by - ay) * i / n
        d = math.hypot(max(abs(px - cx) - sx, 0.0),
                       max(abs(py - cy) - sy, 0.0)) - r
        if d < best:
            best = d
            if best <= 0:
                return best
    return best


def _seg_seg_d(a, b):
    (ax, ay, bx, by), (cx, cy, dx, dy) = a, b
    return min(_seg_pt_d(ax, ay, cx, cy, dx, dy), _seg_pt_d(bx, by, cx, cy, dx, dy),
               _seg_pt_d(cx, cy, ax, ay, bx, by), _seg_pt_d(dx, dy, ax, ay, bx, by))


def _explode(b):
    """b.tracks (polylines) -> 2-punts-segmenten, in situ."""
    segs = []
    for net, layer, w, pts in b.tracks:
        for p, q in zip(pts, pts[1:]):
            if tuple(p) != tuple(q):
                segs.append((net, layer, w, (tuple(p), tuple(q))))
    b.tracks[:] = segs


def _buckets(items, cell=2.0):
    bk = {}
    for i, bb in items:
        for gx in range(int(bb[0] // cell), int(bb[2] // cell) + 1):
            for gy in range(int(bb[1] // cell), int(bb[3] // cell) + 1):
                bk.setdefault((gx, gy), []).append(i)
    return bk


def _near(bk, bb, cell=2.0):
    out = set()
    for gx in range(int(bb[0] // cell), int(bb[2] // cell) + 1):
        for gy in range(int(bb[1] // cell), int(bb[3] // cell) + 1):
            out.update(bk.get((gx, gy), ()))
    return out


def _side_ok(side, layer):
    return side == '*' or (side == 'F') == (layer == 'F.Cu')


def purge_conflicts(b):
    _explode(b)
    pad_bk = _buckets([(i, (x - hx, y - hy, x + hx, y + hy))
                       for i, (ni, x, y, hx, hy, sd) in enumerate(b.PADS)])
    seg_bk = _buckets([(i, (min(s[3][0][0], s[3][1][0]), min(s[3][0][1], s[3][1][1]),
                            max(s[3][0][0], s[3][1][0]), max(s[3][0][1], s[3][1][1])))
                       for i, s in enumerate(b.tracks)])
    kill = set()
    for i, (net, layer, w, ((ax, ay), (bx, by))) in enumerate(b.tracks):
        bb = (min(ax, bx) - 1, min(ay, by) - 1, max(ax, bx) + 1, max(ay, by) + 1)
        for j in _near(pad_bk, bb):
            ni, x, y, hx, hy, sd = b.PADS[j]
            if ni == net or not _side_ok(sd, layer):
                continue
            if _seg_pad_d(ax, ay, bx, by, x, y, hx, hy,
                          circle=(sd == '*')) < w / 2 + PURGE_GAP:
                kill.add(i)
                import os as _os
                if _os.environ.get('FR_DEBUG'):
                    print(f"      purge-trigger PAD net={ni} ({x},{y}) "
                          f"hxhy=({hx},{hy}) sd={sd} voor {b.NETS[net]} "
                          f"({ax},{ay})-({bx},{by})")
                break
        if i in kill:
            continue
        for j in _near(seg_bk, bb):
            net2, lay2, w2, ((cx, cy), (dx, dy)) = b.tracks[j]
            if net2 == net or lay2 != layer:
                continue
            if _seg_seg_d((ax, ay, bx, by), (cx, cy, dx, dy)) < (w + w2) / 2 + PURGE_GAP:
                kill.add(i)
                kill.add(j)
        for (vn, vx, vy) in b.vias:
            if vn != net and _seg_pt_d(vx, vy, ax, ay, bx, by) < w / 2 + VIA_R + PURGE_GAP:
                kill.add(i)
                break
    import os as _os
    if _os.environ.get('FR_DEBUG'):
        for i in sorted(kill):
            net, layer, w, (a, c) = b.tracks[i]
            print(f"    purge {b.NETS[net]} {layer} {a}-{c}")
    b.tracks[:] = [s for i, s in enumerate(b.tracks) if i not in kill]
    print(f"purge_conflicts: {len(kill)} conflicterende segmenten verwijderd")
    return len(kill)


class _Grid:
    """Eigenaar-kaart per laag: 0 = vrij, HARD = verboden, ni+1 = van net ni."""

    def __init__(self, b, step=GRID):
        self.step = step
        self.bx0, self.by0, self.bx1, self.by1 = b.b
        self.nx = int((self.bx1 - self.bx0) / step) + 1
        self.ny = int((self.by1 - self.by0) / step) + 1
        self.own = {l: array('i', [0]) * (self.nx * self.ny) for l in LAYERS}
        self.padc = {l: bytearray(self.nx * self.ny) for l in LAYERS}
        m = int(math.ceil(EDGE / step))
        for l in LAYERS:
            A = self.own[l]
            for ix in range(self.nx):
                for iy in range(self.ny):
                    if ix < m or iy < m or ix >= self.nx - m or iy >= self.ny - m:
                        A[ix * self.ny + iy] = HARD

    def cell(self, x, y):
        return (int(round((x - self.bx0) / self.step)),
                int(round((y - self.by0) / self.step)))

    def xy(self, ix, iy):
        return (self.bx0 + ix * self.step, self.by0 + iy * self.step)

    def _mark(self, A, idx, owner):
        v = A[idx]
        if v == 0:
            A[idx] = owner
        elif v != owner:
            A[idx] = HARD

    def stamp_circle(self, layers, x, y, r, owner):
        ir = int(math.ceil(r / self.step))
        cx, cy = self.cell(x, y)
        for l in layers:
            A = self.own[l]
            for ix in range(max(0, cx - ir), min(self.nx, cx + ir + 1)):
                for iy in range(max(0, cy - ir), min(self.ny, cy + ir + 1)):
                    px, py = self.xy(ix, iy)
                    if math.hypot(px - x, py - y) <= r:
                        self._mark(A, ix * self.ny + iy, owner)

    def stamp_rect(self, layers, x, y, hx, hy, infl, owner, pad=False):
        for l in layers:
            A = self.own[l]
            P = self.padc[l]
            x0, y0 = self.cell(x - hx - infl, y - hy - infl)
            x1, y1 = self.cell(x + hx + infl, y + hy + infl)
            for ix in range(max(0, x0), min(self.nx, x1 + 1)):
                for iy in range(max(0, y0), min(self.ny, y1 + 1)):
                    px, py = self.xy(ix, iy)
                    if (max(abs(px - x) - hx, 0) ** 2
                            + max(abs(py - y) - hy, 0) ** 2) <= infl * infl:
                        self._mark(A, ix * self.ny + iy, owner)
                        if pad:
                            P[ix * self.ny + iy] = 1

    def stamp_seg(self, layer, ax, ay, bx, by, r, owner):
        n = max(1, int(math.hypot(bx - ax, by - ay) / (self.step / 2)))
        for i in range(n + 1):
            self.stamp_circle((layer,), ax + (bx - ax) * i / n,
                              ay + (by - ay) * i / n, r, owner)

    def cells_near(self, ax, ay, bx, by, r):
        out = set()
        n = max(1, int(math.hypot(bx - ax, by - ay) / (self.step / 2)))
        ir = int(math.ceil(r / self.step))
        for i in range(n + 1):
            x = ax + (bx - ax) * i / n
            y = ay + (by - ay) * i / n
            cx, cy = self.cell(x, y)
            for ix in range(cx - ir, cx + ir + 1):
                for iy in range(cy - ir, cy + ir + 1):
                    if 0 <= ix < self.nx and 0 <= iy < self.ny:
                        px, py = self.xy(ix, iy)
                        if math.hypot(px - x, py - y) <= r:
                            out.add((ix, iy))
        return out


def _net_items(b, ni):
    pads = [(x, y, hx, hy, sd) for (n, x, y, hx, hy, sd) in b.PADS if n == ni]
    segs = [(layer, s[0], s[1], w) for (n, layer, w, s) in b.tracks if n == ni]
    vias = [(x, y) for (n, x, y) in b.vias if n == ni]
    return pads, segs, vias


def _clusters(pads, segs, vias):
    n = len(pads) + len(segs) + len(vias)
    par = list(range(n))

    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]
            a = par[a]
        return a

    def uni(a, c):
        par[find(a)] = find(c)

    P0, S0, V0 = 0, len(pads), len(pads) + len(segs)
    # OVERLAP-strikt (zoals KiCad connectiviteit ziet): niet 'dichtbij' maar
    # echt rakend koper; gaatjes worden daarna fysiek gebridged.
    for i, (l1, a1, b1, w1) in enumerate(segs):
        for j, (l2, a2, b2, w2) in enumerate(segs[:i]):
            if l1 == l2 and _seg_seg_d((*a1, *b1), (*a2, *b2)) < (w1 + w2) / 2 - 0.02:
                uni(S0 + i, S0 + j)
        for j, (x, y, hx, hy, sd) in enumerate(pads):
            if _side_ok(sd, l1) and _seg_pad_d(*a1, *b1, x, y, hx, hy,
                                               circle=(sd == '*')) < w1 / 2 - 0.02:
                uni(S0 + i, P0 + j)
        for j, (x, y) in enumerate(vias):
            if _seg_pt_d(x, y, *a1, *b1) < w1 / 2 + VIA_R - 0.02:
                uni(S0 + i, V0 + j)
    for j, (x, y) in enumerate(vias):
        for k, (px, py, hx, hy, sd) in enumerate(pads):
            # ECHTE rechthoek-afstand (max(hx,hy)-cirkel gaf valse joins:
            # stitch-via op 0.9 mm telde als contact, wees-pads bleven los)
            dr = math.hypot(max(abs(x - px) - hx, 0.0),
                            max(abs(y - py) - hy, 0.0))
            if dr < VIA_R - 0.02:
                uni(V0 + j, P0 + k)
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    return groups, P0, S0, V0


def _pad_cells(g, x, y, hx, hy):
    """Celcentra BINNEN het padkoper (rechthoek, 0.02 marge); minimaal de
    cel het dichtst bij het centrum (smalle IC-pads bevatten soms geen
    celcentrum). Cirkel-r=max(hx,hy) was FOUT: routes eindigden net naast
    het koper en telden als verbonden (wees-pads-debacle 2026-07-21)."""
    out = set()
    x0, y0 = g.cell(x - hx, y - hy)
    x1, y1 = g.cell(x + hx, y + hy)
    for ix in range(max(0, x0), min(g.nx, x1 + 1)):
        for iy in range(max(0, y0), min(g.ny, y1 + 1)):
            px, py = g.xy(ix, iy)
            if abs(px - x) <= hx - 0.02 and abs(py - y) <= hy - 0.02:
                out.add((ix, iy))
    if not out:
        out.add(g.cell(x, y))
    return out


def _own_cells(g, pads, segs, vias, items, S0, V0):
    """Cellen VAN het cluster als (ix, iy, laagindex) — laag-bewust, anders
    telt een route die op B.Cu onder een F-pad eindigt als 'aangekomen'."""
    cs = set()
    for i in items:
        if i < S0:
            x, y, hx, hy, sd = pads[i]
            lis = (0, 1) if sd == '*' else ((0,) if sd == 'F' else (1,))
            for c2 in _pad_cells(g, x, y, hx, hy):
                for li in lis:
                    cs.add((*c2, li))
        elif i < V0:
            layer, a, c, w = segs[i - S0]
            li = LAYERS.index(layer)
            for c2 in g.cells_near(*a, *c, w / 2 + GRID / 2):
                cs.add((*c2, li))
        else:
            x, y = vias[i - V0]
            for c2 in g.cells_near(x, y, x, y, VIA_R):
                cs.add((*c2, 0))
                cs.add((*c2, 1))
    return cs


def _build_grid(b, skip_ni, step=GRID):
    """Twee kaarten: g = spoor-obstakels (inflatie CLR + W/2), gv =
    via-toestemming (inflatie VIA_R + CLR, beide lagen: een via raakt alles).
    Zonder aparte via-kaart komen via's op 0.01 van vreemd koper te staan
    (52 clearance-fouten, 2026-07-21)."""
    _explode(b)       # _emit voegt polylines toe; hier weer 2-punts maken
    g = _Grid(b, step)
    gv = _Grid(b, step)
    infl = CLR + W / 2
    infl_v = VIA_R + CLR
    for (ni, x, y, hx, hy, sd) in b.PADS:
        own = HARD if ni is None else ni + 1
        lay = LAYERS if sd == '*' else (('F.Cu',) if sd == 'F' else ('B.Cu',))
        g.stamp_rect(lay, x, y, hx, hy, infl, own, pad=True)
        gv.stamp_rect(LAYERS, x, y, hx, hy, infl_v, own)
        if sd == '*':
            # PTH-boring: via-gat minimaal ~0.9 van het padcentrum (hole-
            # to-hole 0.25) - ook voor het EIGEN net, dus HARD
            gv.stamp_circle(LAYERS, x, y, 0.95, HARD)
    for (ni, layer, w, (a, c)) in b.tracks:
        if layer in g.own:
            g.stamp_seg(layer, *a, *c, w / 2 + infl, ni + 1)
            gv.stamp_seg('F.Cu', *a, *c, w / 2 + infl_v, ni + 1)
            gv.stamp_seg('B.Cu', *a, *c, w / 2 + infl_v, ni + 1)
    for (ni, x, y) in b.vias:
        # GND-via's zijn onaantastbaar (planes): HARD
        own = HARD if ni in skip_ni else ni + 1
        g.stamp_circle(LAYERS, x, y, VIA_R + infl, own)
        # gat-tot-gat 0.25 (boring 0.3): nieuwe via's >=0.6 van elke via,
        # ongeacht net -> HARD
        gv.stamp_circle(LAYERS, x, y, 0.66, HARD)
    return g, gv


def _rip(b, ni, victims, path_xy):
    """Verwijder segmenten/via's van victim-netten die het pad blokkeren."""
    _explode(b)
    rad_s = W / 2 + CLR + 0.25 / 2 + 0.05
    rad_v = W / 2 + CLR + VIA_R + 0.05
    ripped = 0

    def near_path(x, y, r):
        return any(abs(x - px) < 3 and abs(y - py) < 3
                   and math.hypot(x - px, y - py) < r for (px, py) in path_xy)
    keep = []
    for (n, layer, w, (a, c)) in b.tracks:
        if n in victims and (near_path(*a, rad_s + 3) or near_path(*c, rad_s + 3)):
            mid = ((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)
            if any(_seg_pt_d(px, py, *a, *c) < rad_s for (px, py) in path_xy):
                ripped += 1
                continue
        keep.append((n, layer, w, (a, c)))
    b.tracks[:] = keep
    keepv = []
    for (n, x, y) in b.vias:
        if n in victims and near_path(x, y, rad_v):
            ripped += 1
            continue
        keepv.append((n, x, y))
    b.vias[:] = keepv
    return ripped


def weld_gaps(b):
    """Las micro-gaatjes (0.01-0.24) tussen eindpunten van zelfde-net/laag-
    segmenten dicht. Merge-afronding + purge laten zulke gaatjes achter;
    KiCad ziet ze (terecht) als onderbroken."""
    _explode(b)
    ends = []
    for i, (net, layer, w, (a, c)) in enumerate(b.tracks):
        ends.append((net, layer, w, a))
        ends.append((net, layer, w, c))
    bk = {}
    for idx, (net, layer, w, pt) in enumerate(ends):
        bk.setdefault((int(pt[0] // 2), int(pt[1] // 2)), []).append(idx)
    added = 0
    done = set()
    for idx, (net, layer, w, pt) in enumerate(ends):
        for gx in (int(pt[0] // 2) - 1, int(pt[0] // 2), int(pt[0] // 2) + 1):
            for gy in (int(pt[1] // 2) - 1, int(pt[1] // 2), int(pt[1] // 2) + 1):
                for j in bk.get((gx, gy), ()):
                    if j <= idx:
                        continue
                    n2, l2, w2, p2 = ends[j]
                    if n2 != net or l2 != layer:
                        continue
                    d = math.hypot(pt[0] - p2[0], pt[1] - p2[1])
                    if 0.01 < d <= 0.24 and (idx, j) not in done:
                        b.tracks.append((net, layer, min(w, w2), (pt, p2)))
                        done.add((idx, j))
                        added += 1
    # 2e pas: eindpunt -> LIJF van een ander segment (zijdelingse 0.2-gaps)
    seg_bk = _buckets([(i, (min(sg[3][0][0], sg[3][1][0]) - 0.3,
                            min(sg[3][0][1], sg[3][1][1]) - 0.3,
                            max(sg[3][0][0], sg[3][1][0]) + 0.3,
                            max(sg[3][0][1], sg[3][1][1]) + 0.3))
                       for i, sg in enumerate(b.tracks)])
    for i, (net, layer, w, (a, c)) in enumerate(list(b.tracks)):
        for end in (a, c):
            bb = (end[0] - 0.3, end[1] - 0.3, end[0] + 0.3, end[1] + 0.3)
            for j in _near(seg_bk, bb):
                if j == i:
                    continue
                n2, l2, w2, (a2, c2) = b.tracks[j]
                if n2 != net or l2 != layer:
                    continue
                d = _seg_pt_d(*end, *a2, *c2)
                if 0.01 < d <= 0.24:
                    dx, dy = c2[0] - a2[0], c2[1] - a2[1]
                    ln2 = dx * dx + dy * dy
                    t = 0.0 if ln2 < 1e-12 else max(0.0, min(1.0, (
                        (end[0] - a2[0]) * dx + (end[1] - a2[1]) * dy) / ln2))
                    foot = (a2[0] + t * dx, a2[1] + t * dy)
                    b.tracks.append((net, layer, min(w, w2), (end, foot)))
                    added += 1
                    break
    print(f"weld_gaps: {added} micro-gaatjes gelast")
    return added


def trim_dangles(b, max_iter=12):
    """Verwijder hangende spooruiteinden (eindpunt raakt geen pad/via/spoor)
    iteratief. Freerouting/purge laat stubs achter (bv. -12V naast de
    AD5754-EP); de maze-router herstelt daarna wat echt ontbreekt."""
    _explode(b)
    removed = 0
    for _ in range(max_iter):
        pad_bk = _buckets([(i, (x - hx - 0.3, y - hy - 0.3, x + hx + 0.3, y + hy + 0.3))
                           for i, (ni, x, y, hx, hy, sd) in enumerate(b.PADS)])
        seg_bk = _buckets([(i, (min(sg[3][0][0], sg[3][1][0]) - 0.3,
                                min(sg[3][0][1], sg[3][1][1]) - 0.3,
                                max(sg[3][0][0], sg[3][1][0]) + 0.3,
                                max(sg[3][0][1], sg[3][1][1]) + 0.3))
                           for i, sg in enumerate(b.tracks)])
        kill = set()
        for i, (net, layer, w, (a, c)) in enumerate(b.tracks):
            for end in (a, c):
                bb = (end[0] - 0.3, end[1] - 0.3, end[0] + 0.3, end[1] + 0.3)
                ok = False
                for j in _near(pad_bk, bb):
                    ni, x, y, hx, hy, sd = b.PADS[j]
                    if ni == net and _side_ok(sd, layer):
                        if math.hypot(max(abs(end[0] - x) - hx, 0.0),
                                      max(abs(end[1] - y) - hy, 0.0)) < w / 2:
                            ok = True
                            break
                if not ok:
                    for (vn, vx, vy) in b.vias:
                        if vn == net and math.hypot(end[0] - vx, end[1] - vy)                                 < w / 2 + VIA_R - 0.02:
                            ok = True
                            break
                if not ok:
                    for j in _near(seg_bk, bb):
                        if j == i:
                            continue
                        n2, l2, w2, (a2, c2) = b.tracks[j]
                        if n2 == net and l2 == layer and j not in kill                                 and _seg_pt_d(*end, *a2, *c2) < (w + w2) / 2 - 0.02:
                            ok = True
                            break
                if not ok:
                    kill.add(i)
                    break
        vkill = set()
        for vi, (vn, vx, vy) in enumerate(b.vias):
            ok = False
            for (net, layer, w, (a, c)) in b.tracks:
                if net == vn and _seg_pt_d(vx, vy, *a, *c) < w / 2 + VIA_R - 0.02:
                    ok = True
                    break
            if not ok:
                for (ni, x, y, hx, hy, sd) in b.PADS:
                    if ni == vn and math.hypot(max(abs(vx - x) - hx, 0.0),
                                               max(abs(vy - y) - hy, 0.0))                             < VIA_R - 0.02:
                        ok = True
                        break
            if not ok:
                vkill.add(vi)
        import os as _os
        if _os.environ.get('FR_DEBUG'):
            for i in sorted(kill):
                net, layer, w, (a, c) = b.tracks[i]
                print(f"    trim seg {b.NETS[net]} {layer} {a}-{c}")
            for i in sorted(vkill):
                vn, vx, vy = b.vias[i]
                print(f"    trim via {b.NETS[vn]} ({vx},{vy})")
        b.vias[:] = [v for i, v in enumerate(b.vias) if i not in vkill]
        if not kill and not vkill:
            break
        removed += len(kill) + len(vkill)
        b.tracks[:] = [sg for i, sg in enumerate(b.tracks) if i not in kill]
    print(f"trim_dangles: {removed} hangende segmenten/via's verwijderd")
    return removed


def _cluster_pts(pads, segs, vias, items, S0, V0):
    """(x, y, lagen, hx, hy) — hx/hy > 0 voor pads: brugpunt mag naar de
    padRAND geclampt worden (EP-pads zijn groot; het centrum ligt ver)."""
    pts = []
    for i in items:
        if i < S0:
            x, y, hx, hy, sd = pads[i]
            ls = {0, 1} if sd == '*' else ({0} if sd == 'F' else {1})
            pts.append((x, y, ls, hx, hy))
        elif i < V0:
            layer, a, c, _w = segs[i - S0]
            li = {LAYERS.index(layer)}
            pts.append((*a, li, 0.0, 0.0))
            pts.append((*c, li, 0.0, 0.0))
        else:
            x, y = vias[i - V0]
            pts.append((x, y, {0, 1}, 0.0, 0.0))
    return pts


def _clean_seg(g, ni, p1, p2, li):
    """Recht segment alleen als elke cel vrij-of-eigen is (bruggen mogen
    NIET blind door vreemde pads — mux-pin-7-short, 2026-07-21)."""
    me = ni + 1
    A = g.own[LAYERS[li]]
    n = max(1, int(math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / (GRID / 2)))
    for t in range(n + 1):
        x = p1[0] + (p2[0] - p1[0]) * t / n
        y = p1[1] + (p2[1] - p1[1]) * t / n
        ix, iy = g.cell(x, y)
        if not (0 <= ix < g.nx and 0 <= iy < g.ny):
            return False
        v = A[ix * g.ny + iy]
        if v != 0 and v != me:
            return False
    return True


def _bridge(g, gv, b, ni, pads, segs, vias, ita, itb, S0, V0, near=None):
    """Clusters die elkaar bijna raken: directe korte brug op een
    gedeelde laag, of via bij een laag-kruising (1-cel-paden emitten
    niets -> eeuwige herhaling). near=(x,y): kruispunt-hint — dan worden
    ook punten OP de segmenten gesampled (kruisingen liggen mid-span,
    ver van de eindpunten)."""
    pa = _cluster_pts(pads, segs, vias, ita, S0, V0)
    pb = _cluster_pts(pads, segs, vias, itb, S0, V0)
    if near is not None:
        nx, ny = near
        for items, dst in ((ita, pa), (itb, pb)):
            for i in items:
                if S0 <= i < V0:
                    layer, a, c, _w = segs[i - S0]
                    if _seg_pt_d(nx, ny, *a, *c) > 1.5:
                        continue
                    li = {LAYERS.index(layer)}
                    n = max(1, int(math.hypot(c[0] - a[0], c[1] - a[1]) / 0.1))
                    for t in range(n + 1):
                        px = a[0] + (c[0] - a[0]) * t / n
                        py = a[1] + (c[1] - a[1]) * t / n
                        if math.hypot(px - nx, py - ny) < 1.5:
                            dst.append((px, py, li, 0.0, 0.0))
    best = None
    for (x1, y1, l1, hx1, hy1) in pa:
        for (x2, y2, l2, hx2, hy2) in pb:
            # pad-punten naar de rand clampen, richting het andere punt
            q1 = (min(max(x2, x1 - hx1), x1 + hx1),
                  min(max(y2, y1 - hy1), y1 + hy1))
            q2 = (min(max(q1[0], x2 - hx2), x2 + hx2),
                  min(max(q1[1], y2 - hy2), y2 + hy2))
            d = math.hypot(q1[0] - q2[0], q1[1] - q2[1])
            com = l1 & l2
            # gedeelde laag wint bij gelijke afstand (geen via nodig)
            key = (d, 0 if com else 1)
            if best is None or key < best[0]:
                best = (key, q1, q2, min(com) if com else None,
                        min(l1), min(l2))
    import os as _os
    if _os.environ.get('FR_DEBUG'):
        print(f"    bridge net {ni}: |pa|={len(pa)} |pb|={len(pb)} "
              f"best={best[0] if best else None} p1={best[1] if best else '-'} "
              f"p2={best[2] if best else '-'}")
    if best is None or best[0][0] > 2.0:
        return None
    _k, p1, p2, li, la, lb = best
    out = set()
    if li is not None:              # zelfde laag: kort brugsegment
        # micro-gap (<0.45): er past fysiek niets vreemds tussen -> blind
        # bruggen mag; de cel-check is daar te conservatief (inflatie-echo's)
        gap = math.hypot(p1[0] - p2[0], p1[1] - p2[1])
        if gap > 0.45 and not _clean_seg(g, ni, p1, p2, li):
            return None
        lay = LAYERS[li]
        if p1 != p2:
            b.tracks.append((ni, lay, W, (p1, p2)))
            g.stamp_seg(lay, *p1, *p2, W / 2 + CLR + W / 2, ni + 1)
        out = {(*c2, li) for c2 in g.cells_near(*p1, *p2, W / 2 + GRID / 2)}
    else:                           # laagwissel: via + stubjes
        pm = None
        for cand in (((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2), p1, p2):
            cix, ciy = gv.cell(*cand)
            if not (0 <= cix < gv.nx and 0 <= ciy < gv.ny):
                continue
            v = gv.own['F.Cu'][cix * gv.ny + ciy]
            if (v == 0 or v == ni + 1)                     and _clean_seg(g, ni, p1, cand, la)                     and _clean_seg(g, ni, cand, p2, lb):
                pm = cand
                break
        if pm is None:
            return None
        b.vias.append((ni, *pm))
        g.stamp_circle(LAYERS, *pm, VIA_R + CLR + W / 2, ni + 1)
        gv.stamp_circle(LAYERS, *pm, 0.66, HARD)
        for (p, l) in ((p1, la), (p2, lb)):
            if p != pm:
                b.tracks.append((ni, LAYERS[l], W, (p, pm)))
                g.stamp_seg(LAYERS[l], *p, *pm, W / 2 + CLR + W / 2, ni + 1)
        for c2 in g.cells_near(*pm, *pm, VIA_R):
            out.add((*c2, 0))
            out.add((*c2, 1))
    return out


def force_gnd_via(b, refpads):
    """Voor GND-wees-pads: zoek per pad (Dijkstra, eigen laag) de
    dichtstbijzijnde cel waar de via-kaart een via toestaat (ruime marge:
    cel + 4 buren vrij) en leg stub + via. Inzicht: bij GND is ELKE legale
    via-plek een anker (In1/In2 = GND-planes) — er hoeft geen bestaande
    via bereikt te worden."""
    # FIJN raster (0.1): legale via-strookjes zijn ~0.15 breed en vallen op
    # het 0.2-raster vaak net tussen twee celcentra (kwantisatie)
    g, gv = _build_grid(b, set(), step=0.1)
    gnd = b.NI['GND']
    me = gnd + 1
    AF = gv.own['F.Cu']
    done, fail = 0, []
    for (ref, pad) in refpads:
        if ref not in b.P or pad not in b.P[ref]:
            continue
        x, y = b.P[ref][pad]
        info = [pd for pd in b.PADS if abs(pd[1] - x) < .01 and abs(pd[2] - y) < .01]
        hx, hy, sd = (info[0][3], info[0][4], info[0][5]) if info else (.4, .5, 'B')
        li = 0 if sd in ('F', '*') else 1
        lay = LAYERS[li]
        A = g.own[lay]

        def viaok(ix, iy):
            if not (0 <= ix < gv.nx and 0 <= iy < gv.ny):
                return False
            v = AF[ix * gv.ny + iy]
            return v == 0 or v == me
        starts = _pad_cells(g, x, y, hx, hy)
        pq = []
        dist = {}
        for c2 in starts:
            v = A[c2[0] * g.ny + c2[1]]
            if v == 0 or v == me:
                dist[c2] = 0
                heapq.heappush(pq, (0, c2, None))
        prev = {}
        seen = set()
        hit = None
        limit = 400000
        while pq and limit:
            limit -= 1
            d, c2, pr = heapq.heappop(pq)
            if c2 in seen:
                continue
            seen.add(c2)
            prev[c2] = pr
            if viaok(*c2) and d > 0:
                hit = c2
                break
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n2 = (c2[0] + dx, c2[1] + dy)
                if n2 in seen or not (0 <= n2[0] < g.nx and 0 <= n2[1] < g.ny):
                    continue
                v = A[n2[0] * g.ny + n2[1]]
                if v != 0 and v != me:
                    continue
                nd = d + 1
                if nd < dist.get(n2, 1 << 30):
                    dist[n2] = nd
                    heapq.heappush(pq, (nd, n2, c2))
        if hit is None:
            # soft: stub mag foreign SIGNAALcellen kruisen (straf); het
            # geraakte spoor wordt geript en door de heel-pass hersteld.
            prot = {b.NI[nm] for nm in ('GND', '+12V', '-12V', '+3V3')
                    if nm in b.NI}
            pq = []
            dist = {}
            for c2 in starts:
                v = A[c2[0] * g.ny + c2[1]]
                if v == 0 or v == me:
                    dist[c2] = 0
                    heapq.heappush(pq, (0, c2, None))
            prev = {}
            seen = set()
            limit = 400000
            while pq and limit:
                limit -= 1
                d, c2, pr = heapq.heappop(pq)
                if c2 in seen:
                    continue
                seen.add(c2)
                prev[c2] = pr
                if viaok(*c2) and d > 0:
                    hit = c2
                    break
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    n2 = (c2[0] + dx, c2[1] + dy)
                    if n2 in seen or not (0 <= n2[0] < g.nx and 0 <= n2[1] < g.ny):
                        continue
                    v = A[n2[0] * g.ny + n2[1]]
                    if v == 0 or v == me:
                        step = 1
                    elif v != HARD and (v - 1) not in prot                             and not g.padc[lay][n2[0] * g.ny + n2[1]]:
                        step = 2000
                    else:
                        continue
                    nd = d + step
                    if nd < dist.get(n2, 1 << 30):
                        dist[n2] = nd
                        heapq.heappush(pq, (nd, n2, c2))
            if hit is not None:
                pth = [hit]
                while prev[pth[-1]] is not None:
                    pth.append(prev[pth[-1]])
                victims = set()
                for c2 in pth:
                    v = A[c2[0] * g.ny + c2[1]]
                    if v > 0 and v != me:
                        victims.add(v - 1)
                if victims:
                    _rip(b, gnd, victims, [g.xy(*c2) for c2 in pth])
        if hit is None:
            fail.append(f"{ref}.{pad}")
            continue
        path = [hit]
        while prev[path[-1]] is not None:
            path.append(prev[path[-1]])
        pts = [g.xy(*c2) for c2 in path[::-1]]
        simp = [pts[0]]
        for q, r in zip(pts[1:], pts[2:] + [None]):
            if r is None or (round(q[0] - simp[-1][0], 6) * round(r[1] - q[1], 6)
                             != round(q[1] - simp[-1][1], 6) * round(r[0] - q[0], 6)):
                simp.append(q)
        if len(simp) > 1:
            b.tracks.append((gnd, lay, W, tuple(simp)))
            for a2, c2 in zip(simp, simp[1:]):
                g.stamp_seg(lay, *a2, *c2, W / 2 + CLR + W / 2, me)
                gv.stamp_seg('F.Cu', *a2, *c2, W / 2 + VIA_R + CLR, me)
                gv.stamp_seg('B.Cu', *a2, *c2, W / 2 + VIA_R + CLR, me)
        vx, vy = g.xy(*hit)
        b.vias.append((gnd, vx, vy))
        g.stamp_circle(LAYERS, vx, vy, VIA_R + CLR + W / 2, me)
        gv.stamp_circle(LAYERS, vx, vy, 0.66, HARD)
        done += 1
    print(f"force_gnd_via: {done} via-ankers gelegd"
          + (f", NIET: {fail}" if fail else ""))
    return done, fail


def finish_routes(b, skip=('GND',), max_rounds=8, rip=False):
    """rip=True (soft-modus + wegknippen van blokkerende netten) DIVERGEERT
    op dichte borden (vcf8kern: 7609 rips in 8 rondes, faallijst groeide) —
    alleen gebruiken voor een handvol staart-netten op een verder los bord."""
    skip_ni = {b.NI[nm] for nm in skip if nm in b.NI}
    total, fails = 0, []
    for rnd in range(max_rounds):
        g, gv = _build_grid(b, skip_ni)
        nets = sorted(({n for (n, *_r) in b.PADS if n is not None}
                       | {n for (n, *_r) in b.tracks}) - skip_ni - {None})
        fails = []
        routed_rnd, ripped_rnd = 0, 0
        for ni in nets:
            pads, segs, vias = _net_items(b, ni)
            if len(pads) + len(segs) + len(vias) < 2:
                continue
            groups, P0, S0, V0 = _clusters(pads, segs, vias)
            gids = list(groups)
            if len(gids) < 2:
                continue
            own = {gid: _own_cells(g, pads, segs, vias, groups[gid], S0, V0)
                   for gid in gids}
            banned = set()      # mislukte paren overslaan, rest afmaken

            def _samp(gid):
                # paar-selectie op een sample (<=96 cellen) — anders wordt
                # de selectie kwadratisch onbetaalbaar op grote GND-clusters
                cs = sorted(own[gid])
                return cs[::max(1, len(cs) // 96)]
            samp = {gid: _samp(gid) for gid in gids}

            def _c2d(gid):
                return {(x, y) for (x, y, _l) in own[gid]}

            def _bbox(gid):
                xs = [x for (x, y, _l) in own[gid]]
                ys = [y for (x, y, _l) in own[gid]]
                return (min(xs), min(ys), max(xs), max(ys))
            c2d = {gid: _c2d(gid) for gid in gids}
            bbx = {gid: _bbox(gid) for gid in gids}
            while len(gids) > 1:
                best = None
                for i, g1 in enumerate(gids):
                    for g2 in gids[i + 1:]:
                        if (g1, g2) in banned:
                            continue
                        b1, b2 = bbx[g1], bbx[g2]
                        gap = max(b1[0] - b2[2], b2[0] - b1[2],
                                  b1[1] - b2[3], b2[1] - b1[3], 0)
                        if gap <= 4:
                            # exacte near-scan: sampling mist micro-gaps
                            # (-12V-0.2mm-gap-debacle 2026-07-21)
                            small, big = ((g1, g2) if len(c2d[g1]) <= len(c2d[g2])
                                          else (g2, g1))
                            found = None
                            for r in range(0, 5):
                                for (x, y) in c2d[small]:
                                    for dx in range(-r, r + 1):
                                        dy = r - abs(dx)
                                        for sy in ((dy, -dy) if dy else (0,)):
                                            if (x + dx, y + sy) in c2d[big]:
                                                found = r
                                                break
                                        if found is not None:
                                            break
                                    if found is not None:
                                        break
                                if found is not None:
                                    break
                            if found is not None and (best is None or found < best[0]):
                                best = (found, g1, g2)
                                continue
                        for (x1, y1, _l1) in samp[g1]:
                            for (x2, y2, _l2) in samp[g2]:
                                d = abs(x1 - x2) + abs(y1 - y2)
                                if best is None or d < best[0]:
                                    best = (d, g1, g2)
                if best is None:
                    fails.append(b.NETS[ni])
                    break
                _d, ga, gb = best
                import os as _os
                if _os.environ.get('FR_DEBUG'):
                    c0 = next(iter(own[ga]))
                    print(f"    pair {b.NETS[ni]} celdist={_d} rond "
                          f"{g.xy(c0[0], c0[1])}")
                if _d <= 1:
                    shared = ({(x, y) for (x, y, _l) in own[ga]}
                              & {(x, y) for (x, y, _l) in own[gb]})
                    near = g.xy(*next(iter(shared))) if shared else None
                    newcells = _bridge(g, gv, b, ni, pads, segs, vias,
                                       groups[ga], groups[gb], S0, V0,
                                       near=near)
                    if newcells is not None:
                        total += 1
                        routed_rnd += 1
                        own[ga] |= own.pop(gb) | newcells
                        groups[ga] = groups.pop(gb) + groups[ga]
                        gids.remove(gb)
                        samp[ga] = _samp(ga)
                        c2d[ga] = _c2d(ga)
                        bbx[ga] = _bbox(ga)
                        continue
                path = _route(g, gv, ni, own[ga], own[gb], soft=False)
                if path is None and rip:
                    # voeding/GND zijn onschendbaar voor rip (de EP-handfix
                    # werd anders elke run weggeript, 2026-07-21)
                    prot = {b.NI[nm] for nm in ('GND', '+12V', '-12V', '+3V3')
                            if nm in b.NI} - {ni}
                    path = _route(g, gv, ni, own[ga], own[gb], soft=True,
                                  prot=frozenset(prot))
                    if path is not None:
                        me = ni + 1
                        victims = set()
                        for (ix, iy, li) in path:
                            v = g.own[LAYERS[li]][ix * g.ny + iy]
                            if v > 0 and v != me:
                                victims.add(v - 1)
                        path_xy = [g.xy(ix, iy) for (ix, iy, _l) in path]
                        ripped_rnd += _rip(b, ni, victims, path_xy)
                if path is None or len(path) < 2:
                    # geen route, of 1-cel-pad terwijl de brug geweigerd is:
                    # dit paar bannen en de overige verbindingen afmaken
                    banned.add((ga, gb))
                    continue
                import os
                if os.environ.get('FR_DEBUG'):
                    print(f"    route {b.NETS[ni]} ({len(path)} cellen)")
                newcells = _emit(g, gv, b, ni, path)
                total += 1
                routed_rnd += 1
                own[ga] |= own.pop(gb) | newcells
                groups[ga] = groups.pop(gb) + groups[ga]
                gids.remove(gb)
                samp[ga] = _samp(ga)
                c2d[ga] = _c2d(ga)
                bbx[ga] = _bbox(ga)
        print(f"  ronde {rnd + 1}: {routed_rnd} gelegd, {ripped_rnd} geript, "
              f"{len(fails)} vast")
        if routed_rnd == 0 and ripped_rnd == 0:
            break
    print(f"finish_routes: {total} verbindingen gelegd"
          + (f", MISLUKT ({len(fails)}): {fails}" if fails else ""))
    return total, fails


RIP_PEN = 300     # extra kosten per cel door vreemd koper (soft-modus)


def force_gnd_links(b, refpads):
    """Forceer een spoor van elke (ref, pad) naar het dichtstbijzijnde
    GND-via-anker (stitch/hoek). Voor zone-wees-pads die de union-find
    (zonder zone-kennis) al verbonden acht (gnd_orphans.json-lus)."""
    skip_ni = set()
    g, gv = _build_grid(b, skip_ni)
    gnd = b.NI['GND']
    tset = set()
    for (ni, x, y) in b.vias:
        if ni == gnd:
            for c2 in g.cells_near(x, y, x, y, VIA_R):
                tset.add((*c2, 0))
                tset.add((*c2, 1))
    done, fail = 0, []
    for (ref, pad) in refpads:
        if ref not in b.P or pad not in b.P[ref]:
            continue
        x, y = b.P[ref][pad]
        info = [pd for pd in b.PADS if abs(pd[1] - x) < .01 and abs(pd[2] - y) < .01]
        hx, hy, sd = (info[0][3], info[0][4], info[0][5]) if info else (.4, .5, 'B')
        lis = (0, 1) if sd == '*' else ((0,) if sd == 'F' else (1,))
        starts = set()
        for c2 in _pad_cells(g, x, y, hx, hy):
            for li in lis:
                starts.add((*c2, li))
        # 1e keus: SNAP — een GND-web-spooruiteinde eindigt vaak vlak
        # naast het pad (daarom dacht de union-find dat het verbonden was);
        # trek dat uiteinde door tot op het pad.
        snapped = False
        cand = None
        # ALLEEN via-ankers: web-segmenten kunnen in hetzelfde wees-eiland
        # liggen (snap-op-eigen-eiland gaf schijn-succes, 2026-07-21);
        # via's zitten per definitie aan de In1/In2-planes.
        for (vn, vx, vy) in b.vias:
            if vn != gnd:
                continue
            dr = math.hypot(max(abs(vx - x) - hx, 0.0),
                            max(abs(vy - y) - hy, 0.0))
            if dr < 2.0 and (cand is None or dr < cand[0]):
                cand = (dr, (vx, vy), LAYERS[0 if sd != 'B' else 1], W)
        if cand is not None:
            dr, end, l2, w2 = cand
            tgt = (min(max(end[0], x - hx + 0.05), x + hx - 0.05),
                   min(max(end[1], y - hy + 0.05), y + hy - 0.05))
            li = LAYERS.index(l2)
            gap = math.hypot(end[0] - tgt[0], end[1] - tgt[1])
            if gap <= 0.45 or _clean_seg(g, gnd, end, tgt, li):
                b.tracks.append((gnd, l2, W, (end, tgt)))
                g.stamp_seg(l2, *end, *tgt, W / 2 + CLR + W / 2, gnd + 1)
                done += 1
                snapped = True
        if snapped:
            continue
        path = _route(g, gv, gnd, starts, tset, soft=False)
        # (soft-rip hier bleek netto destructief: slachtoffers CS2/VCUT6
        # heelden niet - hard-only + handmatige via's voor de restjes)
        if path is None or len(path) < 2:
            fail.append(f"{ref}.{pad}")
            continue
        _emit(g, gv, b, gnd, path)
        done += 1
    print(f"force_gnd_links: {done} gelegd"
          + (f", NIET: {fail}" if fail else ""))
    return done, fail


def _route(g, gv, ni, starts, targets, soft=False, prot=frozenset()):
    me = ni + 1
    A = [g.own[l] for l in LAYERS]
    ny = g.ny
    tset = set(targets)

    def cost(ix, iy, li):
        """None = verboden; anders extra kosten voor deze cel."""
        if not (0 <= ix < g.nx and 0 <= iy < ny):
            return None
        v = A[li][ix * ny + iy]
        if v == 0 or v == me:
            return 0
        if soft and v != HARD and (v - 1) not in prot:
            return RIP_PEN
        return None

    pq = []
    dist = {}
    for (ix, iy, li) in starts:
        if cost(ix, iy, li) == 0:
            dist[(ix, iy, li)] = 0
            heapq.heappush(pq, (0, ix, iy, li, None))
    prev = {}
    seen = set()
    limit = 1000000
    while pq and limit:
        limit -= 1
        d, ix, iy, li, pr = heapq.heappop(pq)
        if (ix, iy, li) in seen:
            continue
        seen.add((ix, iy, li))
        prev[(ix, iy, li)] = pr
        if (ix, iy, li) in tset:
            path = [(ix, iy, li)]
            while prev[path[-1]] is not None:
                path.append(prev[path[-1]])
            return path[::-1]
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nxt = (ix + dx, iy + dy, li)
            if nxt in seen:
                continue
            c = cost(ix + dx, iy + dy, li)
            if c is not None:
                nd = d + 1 + c
                if nd < dist.get(nxt, 1 << 30):
                    dist[nxt] = nd
                    heapq.heappush(pq, (nd, ix + dx, iy + dy, li, (ix, iy, li)))
        lj = 1 - li
        c = cost(ix, iy, lj)
        vv = gv.own['F.Cu'][ix * ny + iy]
        if c is not None and (vv == 0 or vv == me):
            nxt = (ix, iy, lj)
            if nxt not in seen:
                nd = d + VIA_COST + c
                if nd < dist.get(nxt, 1 << 30):
                    dist[nxt] = nd
                    heapq.heappush(pq, (nd, ix, iy, lj, (ix, iy, li)))
    return None


def _emit(g, gv, b, ni, path):
    """Celpad -> segmenten + via's; nieuw koper meteen stempelen (owner)."""
    runs = []
    cur = [path[0]]
    for p in path[1:]:
        if p[2] != cur[-1][2]:
            runs.append(cur)
            cur = [p]
        else:
            cur.append(p)
    runs.append(cur)
    infl = CLR + W / 2
    newcells = set()
    for ri, run in enumerate(runs):
        layer = LAYERS[run[0][2]]
        pts = [g.xy(ix, iy) for (ix, iy, _l) in run]
        simp = [pts[0]]
        for p, q in zip(pts[1:], pts[2:] + [None]):
            if q is None or (round(p[0] - simp[-1][0], 6) * round(q[1] - p[1], 6)
                             != round(p[1] - simp[-1][1], 6) * round(q[0] - p[0], 6)):
                simp.append(p)
        if len(simp) > 1:
            b.tracks.append((ni, layer, W, tuple(simp)))
            li = LAYERS.index(layer)
            for a, c in zip(simp, simp[1:]):
                g.stamp_seg(layer, *a, *c, W / 2 + infl, ni + 1)
                gv.stamp_seg('F.Cu', *a, *c, W / 2 + VIA_R + CLR, ni + 1)
                gv.stamp_seg('B.Cu', *a, *c, W / 2 + VIA_R + CLR, ni + 1)
                newcells |= {(*c2, li)
                             for c2 in g.cells_near(*a, *c, W / 2 + GRID / 2)}
        if ri < len(runs) - 1:
            x, y = g.xy(run[-1][0], run[-1][1])
            b.vias.append((ni, x, y))
            g.stamp_circle(LAYERS, x, y, VIA_R + infl, ni + 1)
            gv.stamp_circle(LAYERS, x, y, 0.66, HARD)
            for c2 in g.cells_near(x, y, x, y, VIA_R):
                newcells.add((*c2, 0))
                newcells.add((*c2, 1))
    return newcells
