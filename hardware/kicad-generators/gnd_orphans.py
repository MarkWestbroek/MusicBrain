"""Waarheidsmeting GND-connectiviteit (pcbnew): union-find over pads/sporen/
via's/zone-fragmenten; print de wees-groepen (niet aan het hoofdcluster) met
een representatief punt + inhoud. Gebruik:
  PYTHONPATH=<kicad site-packages> kicad-python gnd_orphans.py <bord.kicad_pcb>
"""
import sys
import pcbnew

board = pcbnew.LoadBoard(sys.argv[1])
filler = pcbnew.ZONE_FILLER(board)
filler.Fill(board.Zones())

IU = 1e-6  # nm -> mm


def mm(v):
    return v * IU


gnd_code = None
nets = board.GetNetInfo()
for code in range(board.GetNetCount()):
    net = nets.GetNetItem(code)
    if net and net.GetNetname() == 'GND':
        gnd_code = code
assert gnd_code is not None

items = []   # (soort, beschrijving, punt(mm), polygon of geometrie)
# pads
for fp in board.GetFootprints():
    for pad in fp.Pads():
        if pad.GetNetCode() == gnd_code:
            p = pad.GetPosition()
            items.append(('pad', f"{fp.GetReference()}.{pad.GetPadName()}",
                          (mm(p.x), mm(p.y)), ('pad', pad)))
# sporen + via's
for t in board.GetTracks():
    if t.GetNetCode() != gnd_code:
        continue
    if t.GetClass() == 'PCB_VIA':
        p = t.GetPosition()
        items.append(('via', 'via', (mm(p.x), mm(p.y)), ('via', t)))
    else:
        s, e = t.GetStart(), t.GetEnd()
        items.append(('seg', t.GetLayerName(),
                      ((mm(s.x) + mm(e.x)) / 2, (mm(s.y) + mm(e.y)) / 2),
                      ('seg', t)))
# zone-fragmenten
frag_polys = []
for z in board.Zones():
    if z.GetNetCode() != gnd_code:
        continue
    for lid in z.GetLayerSet().Seq():
        if not z.IsOnLayer(lid):
            continue
        polys = z.GetFilledPolysList(lid)
        for i in range(polys.OutlineCount()):
            ol = polys.Outline(i)
            bb = ol.BBox()
            cx, cy = mm(bb.Centre().x), mm(bb.Centre().y)
            name = board.GetLayerName(lid)
            items.append(('frag', f"zone-{name}", (cx, cy),
                          ('frag', polys, i, lid)))
            frag_polys.append((len(items) - 1, polys, i, lid))

par = list(range(len(items)))


def find(a):
    while par[a] != a:
        par[a] = par[par[a]]
        a = par[a]
    return a


def uni(a, b):
    par[find(a)] = find(b)


def touch_frag(geo, kind2, obj2):
    _tag, polys, i, lid = geo
    ol = polys.Outline(i)
    if kind2 == 'pad':
        if not obj2.IsOnLayer(lid):
            return False
        p = obj2.GetPosition()
        return ol.PointInside(pcbnew.VECTOR2I(p.x, p.y), int(0.5 / IU))
    if kind2 == 'via':
        p = obj2.GetPosition()
        return ol.PointInside(pcbnew.VECTOR2I(p.x, p.y), int(0.4 / IU))
    if kind2 == 'seg':
        if obj2.GetLayer() != lid:
            return False
        for p in (obj2.GetStart(), obj2.GetEnd()):
            if ol.PointInside(pcbnew.VECTOR2I(p.x, p.y), int(0.25 / IU)):
                return True
    return False


import math
for i, (k1, d1, p1, g1) in enumerate(items):
    for j in range(i):
        k2, d2, p2, g2 = items[j]
        if abs(p1[0] - p2[0]) > 30 or abs(p1[1] - p2[1]) > 30:
            if not (k1 == 'frag' or k2 == 'frag'):
                continue
        joined = False
        if k1 == 'frag' and k2 != 'frag':
            joined = touch_frag(g1, k2, g2[1])
        elif k2 == 'frag' and k1 != 'frag':
            joined = touch_frag(g2, k1, g1[1])
        elif k1 == 'frag' and k2 == 'frag':
            joined = False    # fragmenten raken elkaar niet (anders 1 fragment)
        else:
            o1, o2 = g1[1], g2[1]
            if k1 == 'via' or k2 == 'via' or k1 == 'pad' or k2 == 'pad':
                d = math.hypot(p1[0] - p2[0], p1[1] - p2[1])
                if d < 3:
                    hit = pcbnew.VECTOR2I(int(p2[0] / IU), int(p2[1] / IU))
                    joined = o1.HitTest(hit, int(0.3 / IU)) if hasattr(o1, 'HitTest') else False
            if not joined and k1 == 'seg' and k2 == 'seg':
                s1, e1 = g1[1].GetStart(), g1[1].GetEnd()
                s2, e2 = g2[1].GetStart(), g2[1].GetEnd()
                if g1[1].GetLayer() == g2[1].GetLayer():
                    for a in (s1, e1):
                        if g2[1].HitTest(a, int(0.05 / IU)):
                            joined = True
                    for a in (s2, e2):
                        if g1[1].HitTest(a, int(0.05 / IU)):
                            joined = True
        if joined:
            uni(i, j)

# via's verbinden alle lagen: pads/segs op andere lagen bij dezelfde via horen
# al via HitTest hierboven (via-object beslaat beide lagen).
groups = {}
for i in range(len(items)):
    groups.setdefault(find(i), []).append(i)
main = max(groups, key=lambda g: len(groups[g]))
print(f"clusters: {len(groups)}, hoofdcluster {len(groups[main])} items")
orphan_pads = []
for gid, mem in sorted(groups.items(), key=lambda kv: -len(kv[1])):
    if gid == main:
        continue
    pts = [items[i][2] for i in mem]
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    desc = ', '.join(f"{items[i][0]}:{items[i][1]}" for i in mem[:6])
    print(f"  wees ({cx:.1f},{cy:.1f}) n={len(mem)}: {desc}")
    for i in mem:
        if items[i][0] == 'pad':
            ref, pad = items[i][1].rsplit('.', 1)
            orphan_pads.append([ref, pad])
import json as _j
import os as _o
out = _o.path.join(_o.path.dirname(sys.argv[1]), 'gnd_orphans.json')
# CUMULATIEF: eerder geankerde pads verliezen hun anker als ze uit de
# lijst vallen (de regen herbouwt alles uit SES+json) -> unie bewaren
if _o.path.exists(out):
    seen = {tuple(e) for e in _j.load(open(out))}
    orphan_pads = sorted(seen | {tuple(e) for e in orphan_pads})
_j.dump([list(e) for e in orphan_pads], open(out, 'w'), indent=0)
print('geschreven:', out, len(orphan_pads), 'wees-pads (cumulatief)')
