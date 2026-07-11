"""Zoek per GND-F-fragment (dat alleen SMD-GND raakt) een via-plek die vrij
ligt van vreemd koper (>=0.75mm van andere netten) en schrijf gnd_stitch.json."""
import pcbnew, math, json
IU = 1e-6
import sys
BOARD = sys.argv[1]
b = pcbnew.LoadBoard(BOARD)
filler = pcbnew.ZONE_FILLER(b); filler.Fill(b.Zones())

# vreemd koper (niet-GND): pads, sporen, vias -> afstandstest
obst = []   # (soort, geom)
for t in b.GetTracks():
    nm = t.GetNetname()
    if t.Type() == pcbnew.PCB_VIA_T:
        p = t.GetPosition()
        obst.append(('pt', (p.x*IU, p.y*IU, 0.3 if nm=='GND' else 0.3)) if nm!='GND' else ('gndvia', (p.x*IU, p.y*IU)))
    else:
        if nm != 'GND':
            s, e = t.GetStart(), t.GetEnd()
            obst.append(('seg', (s.x*IU, s.y*IU, e.x*IU, e.y*IU, t.GetWidth()*IU/2)))
for pad in b.GetPads():
    p = pad.GetPosition()
    r = max(pad.GetSizeX(), pad.GetSizeY())*IU/2
    if pad.GetNetname() != 'GND':
        obst.append(('pt', (p.x*IU, p.y*IU, r)))
    elif pad.HasHole():
        pass
gnd_through = [(c[1][0], c[1][1]) for c in obst if c[0]=='gndvia']
for pad in b.GetPads():
    if pad.GetNetname()=='GND' and pad.HasHole():
        p = pad.GetPosition(); gnd_through.append((p.x*IU, p.y*IU))

def spd(x1,y1,x2,y2,px,py):
    dx,dy = x2-x1,y2-y1; L2 = dx*dx+dy*dy
    if L2 == 0: return math.hypot(px-x1,py-y1)
    tt = max(0,min(1,((px-x1)*dx+(py-y1)*dy)/L2))
    return math.hypot(px-(x1+tt*dx), py-(y1+tt*dy))

def vrij(px, py):
    """afstand van kandidaat-via (straal 0.3, boring 0.3) tot vreemd koper"""
    m = 9e9
    for kind, g in obst:
        if kind == 'seg':
            d = spd(g[0],g[1],g[2],g[3],px,py) - g[4]
        elif kind == 'pt':
            d = math.hypot(px-g[0], py-g[1]) - g[2]
        else:
            continue
        m = min(m, d)
    return m

vias = []
for z in b.Zones():
    if z.GetNetname() != 'GND' or not z.IsOnLayer(pcbnew.F_Cu):
        continue
    poly = z.GetFilledPolysList(pcbnew.F_Cu)
    for i in range(poly.OutlineCount()):
        outline = poly.Outline(i)
        single = pcbnew.SHAPE_POLY_SET(); single.AddOutline(outline)
        # al door de plaat verbonden?
        if any(single.Contains(pcbnew.VECTOR2I(int(x/IU), int(y/IU))) for x, y in gnd_through):
            continue
        bb = outline.BBox()
        x0,x1 = bb.GetLeft()*IU, bb.GetRight()*IU
        y0,y1 = bb.GetTop()*IU, bb.GetBottom()*IU
        best = None
        n = 48
        for ix in range(n+1):
            for iy in range(n+1):
                px = x0 + (x1-x0)*ix/n; py = y0 + (y1-y0)*iy/n
                if not single.Contains(pcbnew.VECTOR2I(int(px/IU), int(py/IU))):
                    continue
                d = vrij(px, py)
                if best is None or d > best[0]:
                    best = (d, px, py)
        if best and best[0] >= 0.46:   # via-koper 0.3 + clearance 0.25
            vias.append((round(best[1],2), round(best[2],2)))
            print(f"frag ({x0:.1f},{y0:.1f})-({x1:.1f},{y1:.1f}): via ({best[1]:.2f},{best[2]:.2f}) marge {best[0]:.2f}")
        elif best:
            print(f"frag ({x0:.1f},{y0:.1f})-({x1:.1f},{y1:.1f}): GEEN plek (beste marge {best[0]:.2f}) opp {outline.Area()*IU*IU:.1f}")
import os
out = os.path.join(os.path.dirname(BOARD), 'gnd_stitch.json')
json.dump(vias, open(out, 'w'))
print('geschreven:', out, len(vias), 'vias')
