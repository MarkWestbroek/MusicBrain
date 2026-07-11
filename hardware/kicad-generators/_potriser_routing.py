P = b.P
SW = 0.25
# ---- lopers: J2-vert -> rij -> gap-mid-kolom door de zuidrij-gaps -> jog -> CH-pad ----
ROW = {1: 118.9, 2: 118.1, 3: 117.3, 4: 116.5, 5: 113.3, 6: 114.1, 7: 114.9, 8: 115.7}
for k in range(1, 9):
    j2 = P['J2'][str(k + 1)]
    ch = P['U1'][str(k)]
    gx = ch[0] + 0.635
    b.T(f'/W{k}', 'F.Cu', SW, j2, (j2[0], ROW[k]), (gx, ROW[k]), (gx, 131.0),
        (ch[0], 131.0), ch)
    # reservoir-stub (cap-pad1 op j2x+1.27)
    c1 = P[f'C{k}']['1']
    b.T(f'/W{k}', 'F.Cu', SW, (j2[0], c1[1]), c1)
# ---- SPI via B.Cu (vlak is leeg): J1-pad (THT) -> B-vert -> B-laan -> via -> F-stub ----
SPI = [('/SCLK', '7', '13'), ('/MISO', '11', '12'), ('/MOSI', '9', '11'), ('/CS', '13', '10')]
LANES_Y = [123.9, 124.4, 124.9, 125.4]
import itertools as _it
def _crossings(perm):
    n = 0
    seg = [(P['J1'][jp][0], ly, P['U1'][up][0])
           for (nm_, jp, up), ly in zip(SPI, perm)]
    for a in range(len(seg)):
        for c in range(len(seg)):
            if a == c:
                continue
            vx, vy, px = seg[a]
            lx1, ly2, lx2 = min(seg[c][0], seg[c][2]), seg[c][1], max(seg[c][0], seg[c][2])
            if ly2 > vy and lx1 < vx < lx2:      # B-vert (laan->J1) kruist diepere laan c
                n += 1
            if ly2 < vy and lx1 < px < lx2:      # F-stub? nee: via zit op laan; check B-stub niet nodig
                n += 0
    return n
_best = min(_it.permutations(LANES_Y), key=_crossings)
assert _crossings(_best) == 0, f'lanetoewijzing kruist: {_crossings(_best)}'
for (net, jp, up), ly in zip(SPI, _best):
    j1 = P['J1'][jp]
    u = P['U1'][up]
    b.T(net, 'B.Cu', SW, j1, (j1[0], ly), (u[0], ly))
    b.V(net, u[0], ly)
    b.T(net, 'F.Cu', SW, (u[0], ly), u)
# ---- +3V3: oost- en noordrand + westafdaling naar VDD; VREF via padbrug ----
p6 = P['J1']['6']
j2_10 = P['J2']['10']
b.T('+3V3', 'F.Cu', .4, p6, (p6[0], 172.3), (128.8, 172.3), (128.8, 102.3),
    (105.8, 102.3), (105.8, 125.0))
b.T('+3V3', 'F.Cu', .4, (128.8, 107.5), (j2_10[0], 107.5), j2_10)
p16 = P['U1']['16']
p15 = P['U1']['15']
b.T('+3V3', 'F.Cu', SW, (105.8, 125.0), (p16[0], 125.0), p16)
b.T('+3V3', 'F.Cu', SW, p16, p15)   # VDD-VREF: aangrenzende pads, padbrug
c9 = P['C9']['1']
b.T('+3V3', 'F.Cu', SW, c9, (c9[0], 125.0))
# ---- GND-hechtvia's ----
for x, y in ((104, 102), (128, 104.5), (104, 178), (110, 150), (122, 150),
             (104, 130), (128, 150), (116, 102.7)):
    b.V('GND', x, y)
