"""Zoek brug-vias voor GND-groepen (F+B) die los liggen van het hoofdvlak;
vult gnd_stitch.json aan. Draaien met KiCad-python: gnd_bridge.py <bord.kicad_pcb>"""
import pcbnew, math, json, os
IU = 1e-6
import sys
BOARD = sys.argv[1]
b = pcbnew.LoadBoard(BOARD)
filler = pcbnew.ZONE_FILLER(b); filler.Fill(b.Zones())
through = []
for t in b.GetTracks():
    if t.Type() == pcbnew.PCB_VIA_T and t.GetNetname() == 'GND':
        p = t.GetPosition(); through.append((p.x, p.y))
for pad in b.GetPads():
    if pad.GetNetname() == 'GND' and pad.HasHole():
        p = pad.GetPosition(); through.append((p.x, p.y))
frags = []
for z in b.Zones():
    if z.GetNetname() != 'GND':
        continue
    for lay, nm in ((pcbnew.F_Cu, 'F'), (pcbnew.B_Cu, 'B')):
        if not z.IsOnLayer(lay):
            continue
        poly = z.GetFilledPolysList(lay)
        for i in range(poly.OutlineCount()):
            outline = poly.Outline(i)
            single = pcbnew.SHAPE_POLY_SET(); single.AddOutline(outline)
            bb = outline.BBox()
            frags.append((nm, single, (bb.GetLeft()*IU, bb.GetTop()*IU, bb.GetRight()*IU, bb.GetBottom()*IU), outline.Area()*IU*IU))
n = len(frags); parent = list(range(n))
def find(i):
    while parent[i]!=i: parent[i]=parent[parent[i]]; i=parent[i]
    return i
for tx, ty in through:
    hit = [i for i,(nm,s,_,_) in enumerate(frags) if s.Contains(pcbnew.VECTOR2I(tx,ty))]
    for a in hit[1:]:
        pa, pb = find(hit[0]), find(a)
        if pa != pb: parent[pa] = pb
from collections import defaultdict
groups = defaultdict(list)
for i in range(n):
    groups[find(i)].append(i)
groups = sorted(groups.values(), key=lambda g: -sum(frags[i][3] for i in g))
main = set(groups[0])
mainB = [frags[i][1] for i in main if frags[i][0]=='B']
# obstakels voor clearance
obst = []
for t in b.GetTracks():
    nm = t.GetNetname()
    if t.Type() == pcbnew.PCB_VIA_T:
        if nm != 'GND':
            p = t.GetPosition(); obst.append(('pt', (p.x*IU, p.y*IU, 0.3)))
    elif nm != 'GND':
        s, e = t.GetStart(), t.GetEnd()
        obst.append(('seg', (s.x*IU, s.y*IU, e.x*IU, e.y*IU, t.GetWidth()*IU/2)))
for pad in b.GetPads():
    if pad.GetNetname() != 'GND':
        p = pad.GetPosition()
        obst.append(('pt', (p.x*IU, p.y*IU, max(pad.GetSizeX(), pad.GetSizeY())*IU/2)))
def spd(x1,y1,x2,y2,px,py):
    dx,dy = x2-x1,y2-y1; L2 = dx*dx+dy*dy
    if L2 == 0: return math.hypot(px-x1,py-y1)
    tt = max(0,min(1,((px-x1)*dx+(py-y1)*dy)/L2))
    return math.hypot(px-(x1+tt*dx), py-(y1+tt*dy))
def vrij(px, py):
    m = 9e9
    for kind, g in obst:
        d = (spd(*g[:4], px, py) - g[4]) if kind=='seg' else (math.hypot(px-g[0],py-g[1]) - g[2])
        m = min(m, d)
    return m
nieuw = []
for g in groups[1:]:
    best = None
    for i in g:
        nm, single, bb, _ = frags[i]
        if nm != 'F':
            continue
        x0,y0,x1,y1 = bb
        for ix in range(49):
            for iy in range(49):
                px = x0 + (x1-x0)*ix/48; py = y0 + (y1-y0)*iy/48
                pt = pcbnew.VECTOR2I(int(px/IU), int(py/IU))
                if not single.Contains(pt):
                    continue
                if not any(mb.Contains(pt) for mb in mainB):
                    continue
                d = vrij(px, py)
                if best is None or d > best[0]:
                    best = (d, px, py)
    if best and best[0] >= 0.46:
        nieuw.append((round(best[1],2), round(best[2],2)))
        print(f'groep -> brugvia ({best[1]:.2f},{best[2]:.2f}) marge {best[0]:.2f}')
    else:
        print('groep: GEEN brugplek', best)
out = os.path.join(os.path.dirname(BOARD), 'gnd_stitch.json')
cur = json.load(open(out))
json.dump(cur + nieuw, open(out, 'w'))
print('json aangevuld:', len(nieuw))
