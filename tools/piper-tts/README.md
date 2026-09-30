# piper-tts — tekst laten inspreken voor het Zang-venster

## Wat is dit

De module ZANG zingt ingesproken lettergrepen. Die kun je zelf inspreken,
maar je kunt de tekst ook laten uitspreken. Dat doet dit dienstje: de editor
stuurt tekst, en krijgt audio terug met de tijden van elk foneem.

```
editor (🎤 Zang → 🗣 Laat inspreken: "zon-ne-tje")
   │  "zonnetje", stem, tempo
   ▼
piper-tts (dit programma)
   │  eSpeak-NG: tekst → fonemen      z ˈ ɔ n ɛ t ʲ ə
   │  VITS-model: fonemen → audio, 22 kHz
   ▼
audio + per foneem begin en lengte
   │
   ▼
editor: lettergreepgrenzen uit de fonemen, analyse, lyricbank (.mmbl)
```

De foneemtijden zijn het punt. Uit een golfvorm is de grens tussen "zon" en
"ne" niet te zien (o, n en e lopen in elkaar over); uit de fonemen weet de
editor hem precies. De verdeling van de medeklinkers volgt wat je typt:
`zon-ne-tje` geeft zon | ne | tje.

[Piper](https://github.com/OHF-Voice/piper1-gpl) is een open neuraal
spraaksysteem. Het rekent op een gewone processor: na het laden van een stem
(anderhalve seconde, eenmalig) kost een zin 50 tot 100 milliseconden.

## Stemmen en licenties

| Stem | Taal | Klinkt als | Dataset |
|---|---|---|---|
| `nl_NL-pim-medium` | Nederlands | man, ~165 Hz | CC0 |
| `nl_NL-ronnie-medium` | Nederlands | man | CC0 |
| `nl_NL-alex-medium` | Nederlands | man, ~165 Hz | CC0 |
| `nl_BE-nathalie-medium` | Vlaams | vrouw | CC0 |
| `nl_NL-mls_5809-low` | Nederlands | vrouw, ~185 Hz, lagere kwaliteit | CC-BY 4.0 |
| `nl_NL-mls_7432-low` | Nederlands | vrouw, ~230 Hz, lagere kwaliteit | CC-BY 4.0 |
| `nl_NL-mls-medium` | Nederlands, 52 sprekers | kies de spreker in het venster | CC-BY 4.0 (naamsvermelding) |

Bron: het bestand `MODEL_CARD` bij elke stem op
<https://huggingface.co/rhasspy/piper-voices>. Het Dockerfile haalt de vier
CC0-stemmen op. Een echte Nederlandse vrouwenstem in medium-kwaliteit is er
(nog) niet; de MLS-stemmen komen uit voorgelezen boeken en zeggen soms iets
anders dan je typt. Van het meerstemmige model klinken deze sprekers als
vrouw (gemeten aan de toonhoogte, boven 180 Hz): 2, 3, 5, 6, 9, 10, 15, 18,
19, 22, 25, 26, 29, 30, 34, 35, 38, 47, 48 — 6, 15, 26 en 35 het hoogst.

**Piper zelf is GPL-3.0**, net als eSpeak-NG dat erin zit. Dit dienstje
roept Piper aan als los programma en geeft de audio door. De editor en de
firmware bevatten geen Piper-code, en de gemaakte audio valt niet onder de
GPL. Lever Piper niet mee in de editor (bijvoorbeeld als wasm) zonder die
licentie te volgen.

## Op je eigen computer

Eenmalig (vanuit de map van het repo; op Linux/Mac is het `bin/` in plaats
van `Scripts/`):

```bash
python -m venv tools/piper-tts/.venv
tools/piper-tts/.venv/Scripts/pip install "piper-tts[alignment]"
tools/piper-tts/.venv/Scripts/python -m piper.download_voices \
    --data-dir tools/piper-tts/voices nl_NL-pim-medium nl_BE-nathalie-medium
```

Daarna, elke keer dat je hem nodig hebt, dubbelklik op `tools\piper-tts\start.cmd`
of:

```bash
tools/piper-tts/.venv/Scripts/python tools/piper-tts/server.py --open --cors "*"
```

De stemmen staan standaard in `tools/piper-tts/voices` (buiten git, net als
de `.venv`). In de editor: 🎤 Zang → ⚙ → **eigen computer**. Er is geen code
nodig; de dienst luistert alleen op `127.0.0.1`. Sluit het venster van de
dienst met Ctrl+C.

Proberen zonder editor:

```bash
curl -s 127.0.0.1:8788/tts/health
curl -s 127.0.0.1:8788/tts/voices
cd editor && MMB_TTS_TEXT="zon-ne-tje | slaap kind-je slaap" MMB_TTS_OUT=../00.mmbl \
  npx vitest run src/modular-mb/lyric/makeTtsBank.test.ts --silent=false
```

Dat laatste maakt in één keer een lyricbank van getypte tekst.

## Op de VPS

Nog niet uitgerold. Het patroon is dat van de AI-proxy
([tools/ai-proxy](../ai-proxy/README.md)):

| Onderdeel | Waar |
|---|---|
| Container | `musicbrain-tts`, gepubliceerd op `127.0.0.1:8788` |
| Toegang | de codes van de AI-proxy: `/srv/musicbrain-ai/invites.json`, alleen-lezen gekoppeld |
| Gebruik | `/srv/musicbrain-tts/usage.jsonl`, met een eigen daglimiet (200 verzoeken per code) |
| Webserver | Caddy, blok `editor.musicbrain.nl`: `handle /tts/* { reverse_proxy 127.0.0.1:8788 }` |

```bash
docker build -t musicbrain-tts tools/piper-tts
sudo mkdir -p /srv/musicbrain-tts && sudo chown nobody /srv/musicbrain-tts
docker run -d --name musicbrain-tts --restart unless-stopped \
  -p 127.0.0.1:8788:8788 \
  -v /srv/musicbrain-ai:/invites:ro -v /srv/musicbrain-tts:/data \
  musicbrain-tts
curl -s 127.0.0.1:8788/tts/health
```

Waar je op let:

- **Schijf.** Het image is ongeveer 900 MB (Python, onnxruntime en vier
  stemmen). De VPS had op 2026-09-30 nog 5,5 GB vrij, met 18 GB aan
  opruimbare Docker-bouwcache (`docker builder prune`).
- **Geheugen.** Een geladen stem kost 150 tot 200 MB; de dienst houdt er
  hooguit twee tegelijk vast.
- **Rekenkracht.** Eén synthese tegelijk. De VPS heeft twee kernen en deelt
  ze met de websites.
- **Caddy** draait voor alle sites op de VPS: `caddy validate` vóór het
  herladen.

## Het protocol

```
GET  /tts/health     {"ok": true, "voices": 4, "open": false}
GET  /tts/voices     [{"id": "nl_NL-pim-medium", "language": "nl_NL", "name": "pim", ...}]
POST /tts/speak      {"text": "zonnetje", "voice": "nl_NL-pim-medium", "lengthScale": 1.3}
  → {"rate": 22050, "pcm": "<base64, int16 little-endian, mono>",
     "phonemes": [{"p": "^", "start": 0, "samples": 7936}, {"p": "z", ...}], ...}
```

`speaker` (0..n−1) kiest de spreker in een meerstemmig model. `lengthScale`
is het tempo: 1 is normaal, hoger is trager. Voor zingen werkt
1,3 tot 1,5 goed: de klinkers worden langer en zijn beter aan te houden.
Tekst is begrensd op 400 tekens per verzoek. `^` en `$` zijn de stilte voor
en na de zin; `ˈ` is een klemtoonteken, dat de editor bij de klinker erna
rekent.
