"""Regressietest van alle MMB-plugins: elke geïnstalleerde VST3 kort laten
klinken, de toestand bewaren en terugladen, en het venster vastleggen.

    python3 tools/plugin/test/regress.py              # alles; rapport in build-mac/regress/
    python3 tools/plugin/test/regress.py --only DX7   # alleen plugins met "DX7" in de naam
    python3 tools/plugin/test/regress.py --accept     # metingen als nieuwe ijkpunt bewaren
    python3 tools/plugin/test/regress.py --no-ui      # zonder schermafdrukken

Per plugin (mmb-plugin-check, zie src/PluginCheck.cpp):
  - Laden, en dan een akkoord (C3 + C-majeur) plus een testsignaal op de
    ingang (zaagakkoord met tikken), met een DAW-transport op 120 bpm. Zo
    klinkt een instrument én een effect zonder dat het script ze uit elkaar
    hoeft te houden.
  - Meten: niveau (RMS, piek), helderheid (nuldoorgangen per seconde), NaN.
  - Toestand bewaren, in een nieuw exemplaar terugladen en opnieuw meten:
    het niveau moet blijven (plugins met toeval wijken iets af).
  - Vergelijken met het ijkpunt (regress-baseline.json): een verschil van
    meer dan 3 dB of 30 % helderheid is een melding.
  - Het venster: de bediening (tools/plugin/web) headless in Chromium, met
    een nagebootste JUCE-brug. Laat zien of de pagina opbouwt; niet hoe hij
    in Logic (WebKit) precies oogt.

Het rapport (report.html) zet per plugin de uitslag, het venster en de wav
onder elkaar: zo loop je ze in een paar minuten langs.
"""
import argparse
import datetime
import glob
import html
import json
import math
import os
import re
import shutil
import struct
import subprocess
import sys
import threading
import http.server
import functools

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'plugin'))
from check_ir import read_wav  # noqa: E402

# De nieuwste van de twee bouwmappen (build-mac-patch bouwt hem vaker).
CHECK = max((p for p in (os.path.join(ROOT, d, 'MmbPluginCheck_artefacts', 'Release', 'MmbPluginCheck') for d in ('build-mac', 'build-mac-patch'))
             if os.path.exists(p)), key=os.path.getmtime, default='')
VST3_DIR = os.path.expanduser('~/Library/Audio/Plug-Ins/VST3')
BASELINE = os.path.join(ROOT, 'tools', 'plugin', 'test', 'regress-baseline.json')
WEB = os.path.join(ROOT, 'tools', 'plugin', 'web')
RATE = 44100
SECONDS = 1.5          # staart na het testsignaal (dat is ook 1,5 s)
NOTES = '48,60,64,67'
# Plugins die zonder hulp stil zijn, en dat hoort: een programma dat klinkt.
EXTRA = {
    'MMB LPG': ['program=6'],      # Wijd open; de LPG is dicht zonder stuurspanning
    'MMB Patch': ['program=4'],    # 8-stemmig; programma 0 is de (lege) eigen patch
}


# ── plugins en hun venstertype ──────────────────────────────────────────

def plugin_types():
    """Productnaam → typeId van de bediening (index.html?type=...)."""
    out = {}
    files = [os.path.join(ROOT, 'tools/plugin/CMakeLists.txt')] + glob.glob(os.path.join(ROOT, 'tools/plugin/generated/*.cmake'))
    for f in files:
        for line in open(f, encoding='utf-8'):
            m = re.match(r'\s*mmb_add_module\((\w+)\s+\w{4}\s+"([^"]+)"\s+\w+\s+(\S+)', line)
            if not m:
                continue
            target, product, src = m.groups()
            src = src.replace('${MMB_GENERATED_DIR}', os.path.join(ROOT, 'tools/plugin/generated'))
            if not os.path.isabs(src):
                src = os.path.join(ROOT, 'tools/plugin', src)
            base = os.path.basename(src)
            tid = None
            if base.startswith('tp_') and base.endswith('_plugin.cpp'):
                tid = base[:-len('_plugin.cpp')]
            elif os.path.exists(src):
                mm = re.search(r'ModuleSpec\s+\w+\s*\{\s*"([^"]+)"', open(src, encoding='utf-8', errors='replace').read())
                tid = mm.group(1) if mm else None
            out[product] = tid or {'MmbHall': 'tp_mmb_hall', 'MmbSid': 'tp_mmb_sid', 'MmbCr78Kit': 'kit_cr78'}.get(target)
    return out


# ── testsignaal ─────────────────────────────────────────────────────────

def write_source(path):
    """1,5 s stereo: zaagakkoord (C3, E3, G3) met een tik op elke tel van 120 bpm."""
    n = int(1.5 * RATE)
    data = bytearray()
    seed = 1
    for i in range(n):
        t = i / RATE
        v = 0.0
        for f in (130.81, 164.81, 196.0):
            v += 0.12 * (2.0 * ((t * f) % 1.0) - 1.0)
        k = i % (RATE // 2)
        if k < 600:
            seed = (seed * 1103515245 + 12345) & 0x7fffffff
            v += 0.5 * (1 - k / 600) * (seed / 0x7fffffff * 2 - 1)
        s = max(-32767, min(32767, int(v * 32767)))
        data += struct.pack('<hh', s, s)
    with open(path, 'wb') as f:
        f.write(b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVE')
        f.write(b'fmt ' + struct.pack('<IHHIIHH', 16, 1, 2, RATE, RATE * 4, 4, 16))
        f.write(b'data' + struct.pack('<I', len(data)) + data)


# ── meten ───────────────────────────────────────────────────────────────

def measure(path):
    chans, rate = read_wav(path)
    nan = any(math.isnan(x) or math.isinf(x) for c in chans for x in c)
    vals = [x for c in chans for x in c if not (math.isnan(x) or math.isinf(x))]
    if not vals:
        return {'rms_db': -200.0, 'peak': 0.0, 'zcr': 0.0, 'nan': nan}
    rms = math.sqrt(sum(x * x for x in vals) / len(vals))
    peak = max(abs(x) for x in vals)
    left = chans[0]
    zc = sum(1 for a, b in zip(left, left[1:]) if (a < 0) != (b < 0))
    return {
        'rms_db': round(20 * math.log10(rms) if rms > 1e-10 else -200.0, 2),
        'peak': round(peak, 4),
        'zcr': round(zc / (len(left) / rate), 1),
        'nan': nan,
    }


def run_check(vst3, wav, extra, log):
    cmd = [CHECK, vst3, wav, str(SECONDS), f'in={SOURCE}', f'notes={NOTES}', 'transport=120:0:0'] + extra
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired:
        log.append('mmb-plugin-check: na 180 s afgebroken')
        return False
    log.append(r.stdout[-2000:] + r.stderr[-2000:])
    return r.returncode == 0 and os.path.exists(wav)


def check_plugin(vst3, outdir, base, name=None, extra=None):
    name = name or os.path.basename(vst3)[:-5]
    extra = extra if extra is not None else EXTRA.get(name, [])
    slug = re.sub(r'[^A-Za-z0-9]+', '_', name)
    log, notes = [], []
    wav1 = os.path.join(outdir, slug + '.wav')
    wav2 = os.path.join(outdir, slug + '.reload.wav')
    state = os.path.join(outdir, slug + '.state')
    res = {'name': name, 'slug': slug, 'ok': True, 'notes': notes, 'log': log}
    if not run_check(vst3, wav1, extra + [f'savestate={state}'], log):
        res['ok'] = False
        notes.append('laden of renderen mislukt')
        return res
    m = measure(wav1)
    res['m'] = m
    if m['nan']:
        res['ok'] = False
        notes.append('NaN of oneindig in de uitgang')
    if m['rms_db'] < -70:
        res['ok'] = False
        notes.append(f"stil ({m['rms_db']} dB)")
        # De reden staat vaak in de uitvoer van de patchmotor.
        for line in '\n'.join(log).splitlines():
            if 'overgeslagen' in line and ', 0 overgeslagen' not in line or 'lyricbank' in line:
                notes.append(line.strip())
    if m['peak'] > 4.0:
        res['ok'] = False
        notes.append(f"piek {m['peak']} (meer dan 12 dB boven 0 dBFS)")
    if run_check(vst3, wav2, [f'loadstate={state}'], log):
        m2 = measure(wav2)
        res['m_reload'] = m2
        if abs(m2['rms_db'] - m['rms_db']) > 1.0:
            res['ok'] = False
            notes.append(f"na terugladen ander niveau ({m['rms_db']} → {m2['rms_db']} dB)")
    else:
        res['ok'] = False
        notes.append('terugladen van de toestand mislukt')
    b = base.get(name)
    if b:
        if abs(b['rms_db'] - m['rms_db']) > 3.0:
            res['ok'] = False
            notes.append(f"niveau {b['rms_db']} → {m['rms_db']} dB t.o.v. het ijkpunt")
        if b['zcr'] > 50 and abs(m['zcr'] - b['zcr']) / b['zcr'] > 0.3:
            res['ok'] = False
            notes.append(f"helderheid {b['zcr']} → {m['zcr']} nuldoorgangen/s t.o.v. het ijkpunt")
    else:
        notes.append('nog geen ijkpunt')
    return res


def patch_programs():
    """De patches van MMB Patch (programma 1..n; 0 is de eigen patch)."""
    p = os.path.join(VST3_DIR, 'MMB Patch.vst3')
    r = subprocess.run([CHECK, p, os.devnull, '0.1'], capture_output=True, text=True, timeout=120)
    found = re.findall(r'\[(\d+)\] (.*?)(?= \[\d+\] |$)', next((l for l in r.stdout.splitlines() if l.startswith("programma's")), ''))
    return [(p, int(k), n) for k, n in found if int(k) > 0]


# ── vensters ────────────────────────────────────────────────────────────

STUB = """(function(){
  const L = {};
  const send = (id, ev) => (L[id] || []).forEach((f) => f(ev));
  // De DX7-banken (MMB DX7, MMB Patch): zoals de plugin ze levert.
  const roms = fetch('./roms.bin').then((r) => r.arrayBuffer()).then((b) => {
    let s = ''; const u = new Uint8Array(b); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); });
  window.__JUCE__ = { initialisationData: { __juce__functions: [], __juce__sliders: [], __juce__toggles: [], __juce__comboBoxes: [] },
    backend: { addEventListener(id, f) { (L[id] = L[id] || []).push(f); },
      emitEvent(id, ev) {
        if (id !== '__juce__invoke') return;
        const m = ev.params && ev.params[0];
        if (ev.name === 'mmbPatchLive' && m && m.op === 'dx7roms') { roms.then((r) => send('__juce__complete', { promiseId: ev.resultId, result: r })); return; }
        setTimeout(() => send('__juce__complete', { promiseId: ev.resultId, result: null }), 5);
      } } };
  window.addEventListener('error', (e) => { document.title = 'FOUT ' + e.message; });
})();
"""


def chromium():
    for p in sorted(glob.glob(os.path.expanduser('~/Library/Caches/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell')), reverse=True):
        return p
    return None


def screenshots(results, types, outdir):
    ch = chromium()
    if not ch:
        print('geen headless Chromium (playwright-cache); vensters overgeslagen')
        return
    site = os.path.join(outdir, 'web')
    shutil.copytree(WEB, site, dirs_exist_ok=True)
    shutil.copy(os.path.join(ROOT, 'editor', 'public', 'dx7', 'roms.bin'), os.path.join(site, 'roms.bin'))
    with open(os.path.join(site, 'stub.js'), 'w') as f:
        f.write(STUB)
    idx = open(os.path.join(site, 'index.html'), encoding='utf-8').read()
    idx = idx.replace('<script type="module"', '<script src="./stub.js"></script><script type="module"', 1)
    with open(os.path.join(site, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(idx)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    handler = functools.partial(Quiet, directory=site)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_address[1]
    try:
        for r in results:
            tid = types.get(r['name'])
            if not tid:
                continue
            png = os.path.join(outdir, r['slug'] + '.png')
            subprocess.run([ch, '--headless', '--disable-gpu', '--hide-scrollbars', '--window-size=900,560',
                            '--virtual-time-budget=5000', f'--screenshot={png}',
                            f'http://127.0.0.1:{port}/index.html?type={tid}'],
                           capture_output=True, timeout=60)
            if os.path.exists(png):
                r['png'] = os.path.basename(png)
    finally:
        srv.shutdown()


# ── rapport ─────────────────────────────────────────────────────────────

def report(results, outdir, stamp):
    bad = [r for r in results if not r['ok']]
    rows = []
    for r in results:
        m = r.get('m', {})
        status = '<b style="color:#16a34a">goed</b>' if r['ok'] else '<b style="color:#dc2626">melding</b>'
        notes = '<br>'.join(html.escape(n) for n in r['notes'])
        img = f'<img src="{r["png"]}" loading="lazy">' if r.get('png') else ''
        audio = f'<audio controls preload="none" src="{r["slug"]}.wav"></audio>' if m else ''
        rows.append(f'''<section id="{r["slug"]}" class="{'ok' if r['ok'] else 'bad'}">
<h2>{html.escape(r["name"])} — {status}</h2>
<p>{m.get("rms_db", "–")} dB RMS · piek {m.get("peak", "–")} · {m.get("zcr", "–")} nuldoorgangen/s<br>{notes}</p>
{audio}{img}
<details><summary>uitvoer</summary><pre>{html.escape(chr(10).join(r["log"]))}</pre></details>
</section>''')
    page = f'''<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>MMB-plugins {stamp}</title>
<style>
body{{font:14px system-ui,sans-serif;margin:16px;background:#f8fafc;color:#0f172a}}
section{{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:12px 0}}
section.bad{{border-color:#fca5a5}} h2{{font-size:16px;margin:0 0 6px}}
img{{display:block;max-width:100%;width:900px;margin-top:8px;border:1px solid #e2e8f0}}
pre{{white-space:pre-wrap;font-size:11px}} label{{margin-left:12px}}
</style></head><body>
<h1>MMB-plugins, regressietest {stamp}</h1>
<p>{len(results)} plugins, {len(bad)} met een melding.
<label><input type="checkbox" id="f"> alleen meldingen</label></p>
<p>{" · ".join(f'<a href="#{r["slug"]}">{html.escape(r["name"])}</a>' for r in bad)}</p>
{"".join(rows)}
<script>document.getElementById('f').onchange=e=>document.querySelectorAll('section.ok').forEach(s=>s.style.display=e.target.checked?'none':'')</script>
</body></html>'''
    path = os.path.join(outdir, 'report.html')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(page)
    return path, bad


def main():
    global SOURCE
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--accept', action='store_true')
    ap.add_argument('--no-ui', action='store_true')
    ap.add_argument('--patches', action='store_true', help='ook elke patch van MMB Patch (programma 1..n) apart')
    a = ap.parse_args()
    if not CHECK:
        sys.exit('mmb-plugin-check ontbreekt: cmake --build build-mac-patch --target MmbPluginCheck')
    stamp = datetime.datetime.now().strftime('%Y-%m-%d_%H%M')
    outdir = os.path.join(ROOT, 'build-mac', 'regress', stamp)
    os.makedirs(outdir, exist_ok=True)
    SOURCE = os.path.join(outdir, 'source.wav')
    write_source(SOURCE)
    base = json.load(open(BASELINE)) if os.path.exists(BASELINE) else {}
    plugins = sorted(p for p in glob.glob(os.path.join(VST3_DIR, 'MMB *.vst3')) if a.only.lower() in os.path.basename(p).lower())
    results = []
    jobs = [(p, None, None) for p in plugins]
    if a.patches:
        jobs += [(p, f'MMB Patch #{k} {n}', [f'program={k}']) for p, k, n in patch_programs()]
    for i, (p, name, extra) in enumerate(jobs, 1):
        r = check_plugin(p, outdir, base, name, extra)
        results.append(r)
        print(f'[{i}/{len(jobs)}] {r["name"]}: {"goed" if r["ok"] else "; ".join(r["notes"])}', flush=True)
    if not a.no_ui:
        screenshots(results, plugin_types(), outdir)
    path, bad = report(results, outdir, stamp)
    if a.accept:
        for r in results:
            if 'm' in r and not r['m']['nan']:
                base[r['name']] = {k: r['m'][k] for k in ('rms_db', 'peak', 'zcr')}
        with open(BASELINE, 'w') as f:
            json.dump(dict(sorted(base.items())), f, indent=1, ensure_ascii=False)
            f.write('\n')
        print(f'ijkpunt bijgewerkt: {BASELINE}')
    print(f'\n{len(results)} plugins, {len(bad)} met een melding. Rapport: {path}')


SOURCE = ''
if __name__ == '__main__':
    main()
