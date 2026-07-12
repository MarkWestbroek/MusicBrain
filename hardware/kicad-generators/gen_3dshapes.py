"""Eenvoudige VRML-modellen voor custom footprints zonder fabrikants-STEP
(render-realisme; geen invloed op fab). Schrijft naar
hardware/schematics/3dshapes/*.wrl.

Conventies KiCad-WRL: 1 VRML-eenheid = 2,54 mm; x = bord-x, y = -bord-y,
z = omhoog. Alle maten hieronder in bord-mm (footprint-lokaal), het script
schaalt zelf.
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


def cyl_y(x, y0, y1, z, r, kleur):
    """Cilinder met as langs bord-y (bus/kraag)."""
    return f'''Transform {{
  translation {x / S:.4f} {-(y0 + y1) / 2 / S:.4f} {z / S:.4f}
  children [ Shape {{ {_mat(kleur, 0.6)}
    geometry Cylinder {{ radius {r / S:.4f} height {abs(y1 - y0) / S:.4f} }} }} ]
}}'''


def cyl_x(x0, x1, y, z, r, kleur):
    """Cilinder met as langs bord-x."""
    return f'''Transform {{
  translation {(x0 + x1) / 2 / S:.4f} {-y / S:.4f} {z / S:.4f}
  rotation 0 0 1 1.5708
  children [ Shape {{ {_mat(kleur, 0.6)}
    geometry Cylinder {{ radius {r / S:.4f} height {abs(x1 - x0) / S:.4f} }} }} ]
}}'''


def schrijf(naam, *delen):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, naam)
    open(p, 'w', encoding='utf-8', newline='\n').write(
        '#VRML V2.0 utf8\n' + '\n'.join(delen) + '\n')
    print('geschreven:', p)


# DIN-5 SDS-50J: body 20x15.8, H 15; zilveren bus aan de +y-kant (paneel)
schrijf('DIN5_SDS50J.wrl',
        box(-10, -3.3, 0, 10, 12.5, 15, ZWART),
        cyl_y(0, 12.5, 14.3, 8.0, 6.7, ZILVER),
        cyl_y(0, 14.3, 14.9, 8.0, 4.2, ZWART))

# ACJS-MHD: dubbele stapeljack; fab-rect -19.7,-14 .. 4.25,2.6; twee bussen
# aan de -y-kant (noordwand), gaten boven elkaar (H ~24,5)
schrijf('ACJS_MHD.wrl',
        box(-19.7, -14, 0, 4.25, 2.6, 24.5, ZWART),
        cyl_y(-7.7, -15.8, -14, 6.2, 5.6, ZILVER),
        cyl_y(-7.7, -15.8, -14, 18.4, 5.6, ZILVER))

# ACJS-MH: enkele horizontale jack; fab-rect 0,-9.95 .. 24.6,9.95, H 12,5;
# bus aan de -x-kant
schrijf('ACJS_MH.wrl',
        box(0, -9.95, 0, 24.6, 9.95, 12.5, ZWART),
        cyl_x(-1.8, 0, 0, 6.2, 5.6, ZILVER))
