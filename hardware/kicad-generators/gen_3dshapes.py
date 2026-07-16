"""Eenvoudige VRML-modellen voor custom footprints zonder fabrikants-STEP
(render-realisme; geen invloed op fab). Schrijft naar
hardware/schematics/3dshapes/*.wrl.

Conventies KiCad-WRL: 1 VRML-eenheid = 2,54 mm; x = bord-x, y = -bord-y,
z = omhoog (z-up; bevestigd met kalibratie-merkers 2026-07-17).
Alle maten in bord-mm (FOOTPRINT-lokaal); het script schaalt zelf.
Les: bij footprints met ingebakken rotatie (ACJS_MHD: pads rot90 gebakken,
footprint op "(at x y 90)") is het modelframe het fp-lokale frame VOOR die
rotatie -- leid de paneelrichting af uit de pads-mapping, niet uit de
bordorientatie.
"""
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'schematics', '3dshapes')
S = 2.54

ZWART = '0.08 0.08 0.08'
GRIJS = '0.25 0.25 0.27'
ZILVER = '0.72 0.72 0.75'


def _mat(kleur, shin=0.1):
    return (f'appearance Appearance {{ material Material {{ '
            f'diffuseColor {kleur} shininess {shin} }} }}')


def box(x0, y0, z0, x1, y1, z1, kleur):
    """As-parallelle doos in bord-mm (footprint-lokaal), z omhoog."""
    cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
    return f'''Transform {{
  translation {cx / S:.4f} {-cy / S:.4f} {cz / S:.4f}
  children [ Shape {{ {_mat(kleur)}
    geometry Box {{ size {(x1 - x0) / S:.4f} {(y1 - y0) / S:.4f} {(z1 - z0) / S:.4f} }} }} ]
}}'''


def _prisma(p0, p1, r, kleur, n=24):
    """Cilinder als IndexedFaceSet-prisma tussen fp-punten p0/p1 (bord-mm).
    KiCads WRL-parser rendert het Cylinder-primitief NIET (les 2026-07-17:
    alleen Box; bussen/kragen ontbraken geruisloos) -> zelf mesh bakken."""
    import math
    ax = tuple((b - a) for a, b in zip(p0, p1))
    ln = math.sqrt(sum(c * c for c in ax))
    ax = tuple(c / ln for c in ax)
    ref = (0.0, 0.0, 1.0) if abs(ax[2]) < 0.9 else (1.0, 0.0, 0.0)
    u = (ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2],
         ax[0] * ref[1] - ax[1] * ref[0])
    ul = math.sqrt(sum(c * c for c in u))
    u = tuple(c / ul for c in u)
    v = (ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2],
         ax[0] * u[1] - ax[1] * u[0])
    pts = []
    for p in (p0, p1):
        for k in range(n):
            t = 2 * math.pi * k / n
            pts.append(tuple(p[i] + r * (math.cos(t) * u[i] + math.sin(t) * v[i])
                             for i in range(3)))
    # fp-mm -> WRL-file-coords: (x, -y, z) / S
    coord = ' '.join(f'{px / S:.4f} {-py / S:.4f} {pz / S:.4f}'
                     for px, py, pz in pts)
    idx = []
    for k in range(n):
        k2 = (k + 1) % n
        idx.append(f'{k} {k2} {n + k2} {n + k} -1')            # mantel
    idx.append(' '.join(str(k) for k in range(n - 1, -1, -1)) + ' -1')   # kap p0
    idx.append(' '.join(str(n + k) for k in range(n)) + ' -1')           # kap p1
    return f'''Shape {{ {_mat(kleur, 0.6)}
  geometry IndexedFaceSet {{
    solid FALSE creaseAngle 0.8
    coord Coordinate {{ point [ {coord} ] }}
    coordIndex [ {' '.join(idx)} ]
  }} }}'''


def cyl_y(x, y0, y1, z, r, kleur):
    """Cilinder met as langs bord-y."""
    return _prisma((x, y0, z), (x, y1, z), r, kleur)


def cyl_x(x0, x1, y, z, r, kleur):
    """Cilinder met as langs bord-x."""
    return _prisma((x0, y, z), (x1, y, z), r, kleur)


def hex_x(x0, x1, y, z, flats, kleur):
    """Zeskantprisma (moer) met as langs bord-x; flats = sleutelwijdte."""
    L, a = abs(x1 - x0), flats / 3 ** 0.5
    cx = (x0 + x1) / 2
    uit = []
    for hoek in (0.0, 1.0472, 2.0944):
        uit.append(f'''Transform {{
  translation {cx / S:.4f} {-y / S:.4f} {z / S:.4f}
  rotation 1 0 0 {hoek}
  children [ Shape {{ {_mat(kleur, 0.4)}
    geometry Box {{ size {L / S:.4f} {flats / S:.4f} {a / S:.4f} }} }} ]
}}''')
    return '\n'.join(uit)


def hex_y(x, y0, y1, z, flats, kleur):
    """Zeskantprisma (moer) met as langs bord-y."""
    L, a = abs(y1 - y0), flats / 3 ** 0.5
    cy = (y0 + y1) / 2
    uit = []
    for hoek in (0.0, 1.0472, 2.0944):
        uit.append(f'''Transform {{
  translation {x / S:.4f} {-cy / S:.4f} {z / S:.4f}
  rotation 0 1 0 {hoek}
  children [ Shape {{ {_mat(kleur, 0.4)}
    geometry Box {{ size {flats / S:.4f} {L / S:.4f} {a / S:.4f} }} }} ]
}}''')
    return '\n'.join(uit)


def schrijf(naam, *delen):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, naam)
    open(p, 'w', encoding='utf-8', newline='\n').write(
        '#VRML V2.0 utf8\n' + '\n'.join(delen) + '\n')
    print('geschreven:', p)


# DIN-5 SDS-50J: body 20x15.8, H 15; metalen kraag + zwarte insert met
# 5 contacten in een 180-gradenboog aan de +y-kant (paneel)
import math as _m
_din_pins = []
for _a in (-90, -45, 0, 45, 90):
    _r = _m.radians(_a)
    _din_pins.append(cyl_y(3.5 * _m.sin(_r), 14.4, 16.0,
                           8.0 + 3.5 * _m.cos(_r), 0.45, ZILVER))
schrijf('DIN5_SDS50J.wrl',
        box(-10, -3.3, 0, 10, 12.5, 15, ZWART),
        cyl_y(0, 12.5, 16.2, 8.0, 7.3, ZILVER),     # schermkraag
        cyl_y(0, 14.4, 15.0, 8.0, 5.6, ZWART),      # insert (dieper verzonken)
        *_din_pins)

# ESP32-S3-WROOM-1U: 18x19.2, geen antennezone (lib heeft alleen -1-STEP,
# die is 25,5 lang en prikt in de buurcomponenten); PCB-slab + schermkap
schrijf('ESP32_WROOM1U.wrl',
        box(-9, -9.6, 0, 9, 9.6, 0.8, GRIJS),
        box(-7.9, -8.1, 0.8, 7.9, 8.1, 3.2, ZILVER))

# ACJS-MHD: dubbele stapeljack; fab-rect -19.7,-14 .. 4.25,2.6, gaten boven
# elkaar (H ~24,5). LET OP: pads zijn rot90-gebakken -> paneelwand =
# fp-lokaal +x (bord-noord), hartlijn fp-lokaal y=-5.7 (zie NPTH-post).
# Per bus: schroefbus + zeskantmoer + donker plug-gat.
def _bus_x(z):
    return (cyl_x(4.25, 11.25, -5.7, z, 4.75, ZILVER) + '\n' +
            hex_x(5.45, 7.65, -5.7, z, 14.0, ZILVER) + '\n' +
            cyl_x(10.35, 11.35, -5.7, z, 3.8, ZWART))

schrijf('ACJS_MHD.wrl',
        box(-19.7, -14, 0, 4.25, 2.6, 24.5, ZWART),
        _bus_x(6.2),
        _bus_x(18.4))

# ACJS-MH: enkele horizontale jack; fab-rect 0,-9.95 .. 24.6,9.95, H 12,5;
# bus aan de -x-kant: schroefbus + zeskantmoer + donker plug-gat
schrijf('ACJS_MH.wrl',
        box(0, -9.95, 0, 24.6, 9.95, 12.5, ZWART),
        cyl_x(-7.0, 0, 0, 6.2, 4.75, ZILVER),
        hex_x(-3.4, -1.2, 0, 6.2, 14.0, ZILVER),
        cyl_x(-7.1, -6.0, 0, 6.2, 3.8, ZWART))
