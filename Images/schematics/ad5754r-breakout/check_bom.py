import os

d = r'd:\Git\Muziek\MusicBrain\Images\schematics\ad5754r-breakout'
for fn in ['ad5754r-breakout.kicad_sch', 'ad5754r-breakout.kicad_pcb', 'ad5754r-breakout.kicad_pro']:
    p = os.path.join(d, fn)
    with open(p, 'rb') as f:
        b = f.read(3)
    bom = b == b'\xef\xbb\xbf'
    print(fn, 'BOM=', bom, 'first_hex=', b.hex())