#!/usr/bin/env python3
"""
piper-tts — tekst naar spraak voor het Zang-venster van de editor.

Een klein HTTP-dienstje rond Piper (https://github.com/OHF-Voice/piper1-gpl):
de editor stuurt tekst, en krijgt de audio terug mét de tijden van elk
foneem. Die tijden zijn het punt: daarmee weet de editor precies waar een
lettergreep begint en eindigt, in plaats van het uit de golfvorm te schatten.

    GET  /tts/health              {"ok": true, "voices": 4}
    GET  /tts/voices              [{"id": "nl_NL-pim-medium", "language": "nl_NL", ...}]
    POST /tts/speak               {"text": "zonnetje", "voice": "nl_NL-pim-medium",
                                   "lengthScale": 1.3}
      ->  {"rate": 22050, "pcm": "<base64 int16 little-endian mono>",
           "phonemes": [{"p": "z", "start": 7938, "samples": 3328}, ...]}

Toegang: dezelfde toegangscodes als de AI-proxy (`Authorization: Bearer
<code>`, uit invites.json), met een eigen daglimiet. Met `--open` is er geen
code nodig; dat is voor op je eigen computer.

Piper is GPL-3.0 en draait hier als los programma. Deze dienst roept het aan
en geeft de audio door; de editor en de firmware bevatten geen Piper-code.

Starten (lokaal):
    pip install "piper-tts[alignment]"
    python -m piper.download_voices --data-dir voices nl_NL-pim-medium
    python server.py --open --cors "*"        # stemmen uit tools/piper-tts/voices

Omgevingsvariabelen (of de gelijknamige opties):
    TTS_HOST (127.0.0.1)   TTS_PORT (8788)   TTS_VOICES (./voices)
    TTS_INVITES (pad naar invites.json van de AI-proxy)
    TTS_USAGE (pad naar usage-bestand, standaard naast de stemmen)
    TTS_PER_DAY (200 verzoeken per code per dag)
"""
import argparse
import base64
import datetime
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_TEXT = 400          # tekens per verzoek: een regel van een liedje, geen boek
MAX_BODY = 8 * 1024


class Voices:
    """De stemmen in een map; een stem wordt geladen bij het eerste gebruik."""

    def __init__(self, folder: Path, keep: int = 2):
        self.folder = folder
        self.keep = keep                    # zoveel stemmen tegelijk in het geheugen
        self.loaded: dict[str, object] = {}
        self.order: list[str] = []
        self.lock = threading.Lock()

    def list(self):
        out = []
        for cfg in sorted(self.folder.glob('*.onnx.json')):
            vid = cfg.name[:-len('.onnx.json')]
            if not (self.folder / f'{vid}.onnx').exists():
                continue
            try:
                meta = json.loads(cfg.read_text(encoding='utf-8'))
            except (OSError, ValueError):
                meta = {}
            lang = meta.get('language', {})
            out.append({
                'id': vid,
                'language': lang.get('code', vid.split('-')[0]),
                'name': vid.split('-')[1] if '-' in vid else vid,
                'quality': meta.get('audio', {}).get('quality', ''),
                'rate': meta.get('audio', {}).get('sample_rate', 22050),
                'speakers': meta.get('num_speakers', 1),
            })
        return out

    def get(self, vid: str):
        from piper import PiperVoice
        with self.lock:
            if vid in self.loaded:
                self.order.remove(vid)
                self.order.append(vid)
                return self.loaded[vid]
            model = self.folder / f'{vid}.onnx'
            if '/' in vid or '\\' in vid or '..' in vid or not model.exists():
                raise KeyError(vid)
            voice = PiperVoice.load(str(model), include_alignments=True)
            self.loaded[vid] = voice
            self.order.append(vid)
            while len(self.order) > self.keep:
                del self.loaded[self.order.pop(0)]
            return voice


def speak(voice, text: str, length_scale: float, speaker):
    """Tekst -> (rate, int16-bytes, fonemen met begin en lengte in samples)."""
    from piper import SynthesisConfig
    cfg = SynthesisConfig(length_scale=length_scale, speaker_id=speaker)
    pcm = bytearray()
    phonemes = []
    rate = int(voice.config.sample_rate)
    for chunk in voice.synthesize(text, cfg, include_alignments=True):
        rate = int(chunk.sample_rate)
        base = len(pcm) // 2
        if chunk.phoneme_alignments:
            pos = base
            for a in chunk.phoneme_alignments:
                n = int(a.num_samples)               # numpy-getal: niet te serialiseren
                phonemes.append({'p': str(a.phoneme), 'start': pos, 'samples': n})
                pos += n
        pcm += chunk.audio_int16_bytes
    return rate, bytes(pcm), phonemes


class Access:
    """Toegangscodes van de AI-proxy, met een eigen teller per dag."""

    def __init__(self, invites: Path | None, usage: Path, per_day: int, is_open: bool):
        self.invites, self.usage, self.per_day, self.is_open = invites, usage, per_day, is_open
        self.lock = threading.Lock()

    def check(self, header: str):
        """Geeft (naam, None) of (None, (status, melding))."""
        if self.is_open:
            return 'lokaal', None
        code = header[7:].strip() if header.lower().startswith('bearer ') else ''
        try:
            invites = json.loads(self.invites.read_text(encoding='utf-8')) if self.invites else []
        except (OSError, ValueError):
            invites = []
        invite = next((i for i in invites if i.get('code') == code and i.get('active')), None)
        if not code or not invite:
            return None, (401, 'onbekende of ingetrokken toegangscode')
        today = datetime.date.today().isoformat()
        used = 0
        try:
            with self.usage.open(encoding='utf-8') as f:
                for line in f:
                    try:
                        u = json.loads(line)
                    except ValueError:
                        continue
                    if u.get('date') == today and u.get('code') == code:
                        used += 1
        except OSError:
            pass
        if used >= self.per_day:
            return None, (429, f'daglimiet bereikt ({self.per_day})')
        return invite.get('name', '?'), None

    def log(self, header: str, name: str, voice: str, chars: int, seconds: float):
        code = header[7:].strip() if header.lower().startswith('bearer ') else ''
        row = {'date': datetime.date.today().isoformat(), 't': datetime.datetime.now().isoformat(timespec='seconds'),
               'code': code, 'name': name, 'voice': voice, 'chars': chars, 'seconds': round(seconds, 2)}
        with self.lock:
            try:
                with self.usage.open('a', encoding='utf-8') as f:
                    f.write(json.dumps(row, ensure_ascii=False) + '\n')
            except OSError:
                pass


def make_handler(voices: Voices, access: Access, cors: str):
    synth_lock = threading.Lock()          # één synthese tegelijk: de VPS heeft twee kernen

    class Handler(BaseHTTPRequestHandler):
        server_version = 'piper-tts/1'

        def log_message(self, fmt, *args):
            sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))

        def send_json(self, status: int, obj):
            body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            if cors:
                self.send_header('Access-Control-Allow-Origin', cors)
                self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            # Voorvraag van de browser. Een pagina op https die een dienst op
            # 127.0.0.1 aanroept vraagt ook om Private-Network-toestemming.
            if not cors:
                return self.send_json(405, {'error': 'geen CORS ingesteld'})
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', cors)
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
            self.send_header('Access-Control-Max-Age', '600')
            self.send_header('Content-Length', '0')
            self.end_headers()

        def do_GET(self):
            path = self.path.split('?')[0].rstrip('/')
            if path == '/tts/health':
                return self.send_json(200, {'ok': True, 'voices': len(voices.list()), 'open': access.is_open})
            if path == '/tts/voices':
                return self.send_json(200, voices.list())
            self.send_json(404, {'error': 'onbekend pad'})

        def do_POST(self):
            if self.path.split('?')[0].rstrip('/') != '/tts/speak':
                return self.send_json(404, {'error': 'onbekend pad'})
            auth = self.headers.get('Authorization', '')
            name, err = access.check(auth)
            if err:
                return self.send_json(err[0], {'error': err[1]})
            try:
                n = int(self.headers.get('Content-Length', '0'))
                if n <= 0 or n > MAX_BODY:
                    return self.send_json(413, {'error': 'verzoek te groot'})
                req = json.loads(self.rfile.read(n).decode('utf-8'))
                text = ' '.join(str(req.get('text', '')).split())
                vid = str(req.get('voice', ''))
                scale = float(req.get('lengthScale', 1.0))
                speaker = req.get('speaker')
                speaker = int(speaker) if speaker is not None else None
            except (ValueError, TypeError):
                return self.send_json(400, {'error': 'ongeldig verzoek'})
            if not text:
                return self.send_json(400, {'error': 'geen tekst'})
            if len(text) > MAX_TEXT:
                return self.send_json(400, {'error': f'tekst langer dan {MAX_TEXT} tekens'})
            scale = min(3.0, max(0.5, scale))
            try:
                voice = voices.get(vid)
            except KeyError:
                return self.send_json(404, {'error': f'onbekende stem: {vid}'})
            except Exception as e:                          # laden mislukt (geheugen, kapot model)
                return self.send_json(500, {'error': f'stem laden mislukt: {e}'})
            try:
                with synth_lock:
                    rate, pcm, phonemes = speak(voice, text, scale, speaker)
            except Exception as e:
                return self.send_json(500, {'error': f'synthese mislukt: {e}'})
            access.log(auth, name, vid, len(text), len(pcm) / 2 / rate)
            self.send_json(200, {'rate': rate, 'pcm': base64.b64encode(pcm).decode('ascii'),
                                 'phonemes': phonemes, 'text': text, 'voice': vid})

    return Handler


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--host', default=os.environ.get('TTS_HOST', '127.0.0.1'))
    ap.add_argument('--port', type=int, default=int(os.environ.get('TTS_PORT', '8788')))
    ap.add_argument('--voices', default=os.environ.get('TTS_VOICES', str(Path(__file__).resolve().parent / 'voices')),
                    help='map met .onnx-stemmen (standaard tools/piper-tts/voices)')
    ap.add_argument('--invites', default=os.environ.get('TTS_INVITES', ''))
    ap.add_argument('--usage', default=os.environ.get('TTS_USAGE', ''))
    ap.add_argument('--per-day', type=int, default=int(os.environ.get('TTS_PER_DAY', '200')))
    ap.add_argument('--open', action='store_true', default=os.environ.get('TTS_OPEN', '') == '1',
                    help='geen toegangscode vragen (alleen op je eigen computer)')
    ap.add_argument('--cors', default=os.environ.get('TTS_CORS', ''),
                    help='toegestane herkomst voor de browser, bv. http://localhost:5173 of *')
    a = ap.parse_args()

    folder = Path(a.voices)
    if not folder.is_dir():
        raise SystemExit(f'stemmenmap niet gevonden: {folder}')
    if a.open and a.host not in ('127.0.0.1', 'localhost', '::1') and os.environ.get('TTS_OPEN_ANYWAY') != '1':
        raise SystemExit('--open werkt alleen op 127.0.0.1: zonder code mag de dienst niet van buiten bereikbaar zijn')
    if not a.open and not a.invites:
        raise SystemExit('geef --invites (invites.json van de AI-proxy) of --open')
    voices = Voices(folder)
    found = voices.list()
    if not found:
        raise SystemExit(f'geen stemmen in {folder} (python -m piper.download_voices --data-dir {folder} nl_NL-pim-medium)')
    usage = Path(a.usage) if a.usage else folder / 'usage.jsonl'
    access = Access(Path(a.invites) if a.invites else None, usage, a.per_day, a.open)
    # Een stem laden patcht het ONNX-model in het geheugen (voor de
    # foneemtijden), en dat gaat diep de stack in: met de standaardstack van
    # een thread (1 MB op Windows) stopt het proces zonder foutmelding.
    threading.stack_size(64 * 1024 * 1024)
    class Server(ThreadingHTTPServer):
        # Op Windows laat SO_REUSEADDR een tweede proces dezelfde poort
        # pakken; dan beantwoordt een oud exemplaar de verzoeken. Uit dus.
        allow_reuse_address = os.name != 'nt'
        daemon_threads = True

    httpd = Server((a.host, a.port), make_handler(voices, access, a.cors))
    print(f'piper-tts op http://{a.host}:{a.port}/tts — {len(found)} stemmen: {", ".join(v["id"] for v in found)}'
          f'{" — open, geen code nodig" if a.open else ""}', flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
