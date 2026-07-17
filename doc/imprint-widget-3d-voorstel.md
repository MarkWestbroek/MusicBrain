# Voorstel: 3D-tab in de board-widget (meerdere kijkhoeken)

Van het MMB-hardwarespoor aan Imprint, 2026-07-17. Wens (Mark): naast de
huidige render+hotspots en pinouts een derde tab **"3D"** waarin je een bord
vanuit meerdere hoeken bekijkt — juist de iets gedraaide hoeken geven het
ruimtelijke gevoel. Hieronder wat wij aan de bronkant kunnen leveren
(met gemeten groottes), drie opties oplopend in rijkdom, en een voorstel
voor de widget-config. Kies gerust; de MMB-kant (widget_export.py) bouwen
wij zodra het contract vastligt.

## Wat de bron kan leveren (gemeten aan gswitch-loop8sh, 150×44 mm)

| bron | maat | generatietijd |
|---|---|---|
| GLB (binair glTF), zonder koper | **2,5 MB** | ~2 s |
| GLB met sporen/zones/silk | 5,5 MB | ~2,5 s |
| sprite-frame 1200×750 WebP q80, transparant | ~32 KB | ~4 s/frame |
| 36 frames (10°-stappen, 1 ring) | **≈ 1,1 MB** | ~2,5 min |
| 24 frames (15°-stappen) | ≈ 0,8 MB | ~1,5 min |

`kicad-cli pcb export glb` en `kicad-cli pcb render --rotate` doen al het
werk; beide draaien headless in onze pipeline. Grotere borden (brain
100×70, loop8 200×58) schalen ruwweg lineair mee.

## Optie A — echt 3D: GLB + `<model-viewer>` (voorkeur MMB)

Eén `.glb`-asset per board-spec; de widget laadt Googles
[`<model-viewer>`](https://modelviewer.dev)-webcomponent (of three.js) en
je krijgt traploos draaien/zoomen, traagheid, belichting — het "smoothe"
zit dan gratis in de engine. 2,5 MB is kleiner dan twee sprite-ringen en
oneindig vloeiend.

- lazy: pas laden bij openen van de 3D-tab; tot die tijd een poster-PNG
  (die hebben we al: de bestaande render).
- `<model-viewer>` is één zelf te hosten ESM-bundel (~300 KB); geen CDN
  nodig. Alternatief three.js `GLTFLoader` als jullie al three in huis
  hebben.
- vraag aan Imprint: mag er een 3D-engine in de bundel? Zo nee → optie B.

## Optie B — sprite-turntable (geen 3D-engine)

Vooraf gerenderde frames; de widget wisselt het `<img>`-src (of een
sprite-sheet) op basis van horizontaal slepen. Voelt als 3D, is puur DOM.

- **Aantal frames voor "smooth"**: 10°-stappen (36 frames) draait soepel;
  15° (24 frames) is acceptabel; onder de 20 frames gaat het "klikken".
- **Eén elevatie-ring volstaat**: −35° (driekwart van schuin boven) is de
  informatieve band. Een tweede ring op −65° (vlakker, "ooghoogte over de
  connectoren") verdubbelt naar ≈ 2,2 MB — mooi, niet noodzakelijk.
- alle frames zelfde canvas/versnijding (vast kader, geen per-frame crop),
  anders verspringt het beeld tijdens draaien.
- naamgeving-voorstel: `boards/<slug>-r<elev>-<az>.webp`, az in stappen
  van 10 vanaf 0.

## Optie C — minimaal: gecureerde hoekengalerij

Geen slepen, gewoon 6–8 vaste views als klikbare galerij. Op basis van
onze render-ervaring de informatiefste hoeken (elevatie, azimut):

1. (−35°, 30°) — driekwart NW: hoofdview, connectorkant + hoogteopbouw
2. (−35°, 150°) — driekwart NO: de andere korte kant
3. (−35°, 210°) en (−35°, 330°) — de twee achter-driekwarten
4. (−65°, 20°) — vlak over het bord: connector-silhouetten ("panelgevoel")
5. (−90°, 0°) — recht van voren op de connectorrand (paneelzijde)
6. top (bestaat al) en evt. bottom

Kost ~8 × 35 KB per bord; kan desnoods vandaag nog zonder widget-wijziging
als extra assets + thumbnails in de bestaande spec-pagina.

## Voorstel widget-contract (BoardConfig-uitbreiding)

```jsonc
{
  // bestaand: title, image, points, pinouts...
  "view3d": {
    "mode": "glb" | "sprites" | "gallery",
    "poster": "boards/gswitch-loop8sh.png",     // placeholder tot activatie
    // mode=glb:
    "src": "boards/gswitch-loop8sh.glb",
    // mode=sprites:
    "frames": { "pattern": "boards/gswitch-loop8sh-r35-{az}.webp",
                 "azStep": 10, "elevations": [35] },
    // mode=gallery:
    "views": [ { "label": "driekwart NW", "src": "..." }, ... ]
  }
}
```

Ingest: geen nieuw contenttype nodig — de glb/webp's kunnen mee als
board-spec-assets (zelfde multipart als nu); alleen de widget-config
krijgt het `view3d`-blok.

## Wat MMB levert zodra gekozen is

- `widget_export.py --3d glb|sprites|gallery`: exporteert de assets +
  vult `view3d` in de widget-json (vast kader over alle frames, poster).
- Regeneratie zit dan in de normale stap-0 van
  `doc/site-publicatie-werkwijze.md`; publicatie via de bestaande keten.

**Aanbeveling MMB**: optie A (GLB). Kleinste asset voor de vloeiendste
ervaring, en de pipeline-kant is triviaal. B als 3D-engine bezwaarlijk is;
C kan altijd alvast als tussenstap.
