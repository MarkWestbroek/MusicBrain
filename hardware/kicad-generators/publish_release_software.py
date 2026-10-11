"""Release-items voor firmware en editor op de releasepagina van de site.

    python publish_release_software.py <base> <token>

De releasepagina (/releases) leest niet zelf van GitHub: elk item wordt hier
gepost (POST /api/content/release/<project>-<versie>). Zonder deze stap
blijft de site op een oude versie hangen (2026-10-12: stond nog op fw 0.5.78
terwijl GitHub 0.5.107 had). Teksten in het Engels (de site is Engels); de
volledige Nederlandse notes staan op GitHub.

Per nieuwe firmware: een item toevoegen aan ITEMS (bestaande laten staan,
dan zijn ze idempotent opnieuw te posten). `date` niet in de toekomst t.o.v.
UTC: Imprint toont zo'n item dan nog niet. Eerst lokaal, dan live (zie
doc/site-publicatie-werkwijze.md).
"""
import argparse

import requests

# ---- de release-items ------------------------------------------------------
GH = 'https://github.com/MarkWestbroek/MusicBrain'
ITEMS = {
 'firmware-0.5.107': {
  'project': 'firmware', 'version': '0.5.107', 'date': '2026-10-11', 'channel': 'stable',
  'access': 'public', 'product': 'cortex', 'components': [],
  'highlights': [
   'SID chip (6581/8580): our own emulation, 1–4 chips per module, stereo, combined waveforms and filter',
   'Voices that sing: ZANG (PSOLA) with lyric banks, AUDIO IN, a working Warps vocoder, all 24 Plaits engines',
   'Classic instruments: Trautonium (MIXTUR), Ondes Martenot with Diffuseur, ARP, Fairlight CMI voice with Page 4 harmonic profiles and filter',
   'Our own Moog-style ladder filter (4× oversampled) replaces the Teensy Audio Library one',
   'Cleaner distortion: anti-aliasing (ADAA) in Drive, Tube and e-piano; the shared oversampler is 3.8× faster',
   '118 modules in the firmware/editor contract',
  ],
  'body': 'Firmware for **Teensy 4.1 with PSRAM**. Flash `mmb-fw-0.5.107.hex` with [PJRC Teensy Loader](https://www.pjrc.com/teensy/loader.html), or from the editor (**Teensy → Firmware**). Measured on a Teensy: Ladder ~8 % CPU per voice, Tube ~26 %. Covers everything since 0.5.78; full release notes (NL) on GitHub.',
  'sourceUrl': f'{GH}/releases/tag/fw-0.5.107',
  'downloads': [{'label': 'mmb-fw-0.5.107.hex', 'url': f'{GH}/releases/download/fw-0.5.107/mmb-fw-0.5.107.hex'}],
 },
 'editor-0.5.107': {
  'project': 'editor', 'version': '0.5.107', 'date': '2026-10-11', 'channel': 'beta',
  'access': 'public', 'product': 'cortex', 'components': [],
  'highlights': [
   'The simulator runs the firmware\'s own C++ DSP as WebAssembly: what you hear in the browser is what the Brain plays',
   'Play mode: patch fronts, an on-screen keyboard (also as a Trautonium ribbon), in English',
   'Record takes (wav + MIDI + patch, now with knob movements) and four-track overdub',
   'One tempo per patch with tap tempo and MIDI clock',
   'Patch pool: share patches and open them from a link',
   'Fairlight pages: Page 4, Page D in 3D, analyse a sample or the microphone into a CMI voice',
  ],
  'body': 'Editor and simulator in one, in the browser at [editor.musicbrain.nl](https://editor.musicbrain.nl). The version follows the firmware contract it is built against (0.5.107). It updates continuously; this entry marks the current state.',
  'sourceUrl': 'https://editor.musicbrain.nl',
  'downloads': [],
 },
}
# -----------------------------------------------------------------------------

ap = argparse.ArgumentParser()
ap.add_argument('base')
ap.add_argument('token')
a = ap.parse_args()
H = {'Authorization': f'Bearer {a.token}'}
for slug, rel in ITEMS.items():
    r = requests.post(f'{a.base}/api/content/release/{slug}', headers=H, json=rel)
    print(f'{slug}: {r.status_code} {r.text[:200]}')
    assert r.status_code < 300, f'{slug} faalde'
