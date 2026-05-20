// AudioEngine — minimal Tone.js back-end for the patch simulator.
//
// MVP-strategie (v0.3): we kijken naar de actieve patch en bouwen één
// monofone voice volgens een vast pad:
//
//     VCO  →  VCF  →  VCA  →  master out
//                       ▲
//                  AHDSR-envelope
//
// Bouwstenen worden gekozen op basis van category.kind. Modules in het
// patcher-graf die niet onder dit pad vallen worden (nog) genegeerd; latere
// iteraties kunnen `patch.connections` echt volgen (zie roadmap in
// Requirements.md §v0.3-simulatie).
//
// Controls die door de seed gebruikt worden (frequency/cutoff/resonance/
// gain/A/H/D/S/R) worden via heuristieken op de juiste Tone-param gemapt.
import * as Tone from 'tone';
export class AudioEngine {
    osc = null;
    filter = null;
    vca = null;
    env = null;
    master = null;
    meter = null;
    currentNote = null;
    listeners = new Set();
    status = { running: false, voiceFreqHz: 0, level: 0 };
    rafId = null;
    /** (Re)build the audio graph from a project+patch snapshot. */
    build(project, patch) {
        this.dispose();
        const lookup = buildLookup(project, patch);
        // ── Oscillator ──
        const osc = lookup.vco;
        const wave = osc ? pickWaveform(osc.module, osc.controls) : 'sawtooth';
        this.osc = new Tone.Oscillator({ frequency: 220, type: wave, volume: -6 });
        // ── Filter ──
        const vcf = lookup.vcf;
        const cutoff = vcf ? Number(vcf.controls['cutoff'] ?? vcf.controls['frequency'] ?? 1200) : 6000;
        const q = vcf ? Number(vcf.controls['resonance'] ?? vcf.controls['q'] ?? 1) : 0.7;
        this.filter = new Tone.Filter({ frequency: clamp(cutoff, 40, 18000), Q: clamp(q, 0.1, 12), type: 'lowpass' });
        // ── Envelope + VCA ──
        const envCtrl = lookup.envelope?.controls ?? {};
        const A = msToSec(envCtrl['attack'], 10);
        const H = msToSec(envCtrl['hold'], 0);
        const D = msToSec(envCtrl['decay'], 200);
        const S = clamp(Number(envCtrl['sustain'] ?? 0.7), 0, 1);
        const R = msToSec(envCtrl['release'], 400);
        this.env = new Tone.AmplitudeEnvelope({ attack: A + H, decay: D, sustain: S, release: R });
        const vcaCtrl = lookup.vca?.controls ?? {};
        const vcaGain = clamp(Number(vcaCtrl['gain'] ?? vcaCtrl['level'] ?? 0.8), 0, 1);
        this.vca = new Tone.Gain(vcaGain);
        this.master = new Tone.Gain(0.7);
        this.meter = new Tone.Meter({ smoothing: 0.85 });
        // Connect
        this.osc.connect(this.filter);
        this.filter.connect(this.env);
        this.env.connect(this.vca);
        this.vca.connect(this.master);
        this.master.connect(this.meter);
        this.master.toDestination();
    }
    async start() {
        await Tone.start();
        if (!this.osc)
            return;
        if (this.osc.state !== 'started')
            this.osc.start();
        this.status.running = true;
        this.emit();
        this.tickMeter();
    }
    stop() {
        if (this.osc && this.osc.state === 'started')
            this.osc.stop();
        this.currentNote = null;
        this.status.running = false;
        this.status.level = 0;
        this.emit();
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }
    noteOn(midi, _velocity = 0.9) {
        if (!this.osc || !this.env)
            return;
        const freq = midiToHz(midi);
        this.osc.frequency.rampTo(freq, 0.005);
        this.currentNote = midi;
        this.env.triggerAttack(undefined, undefined);
        this.status.voiceFreqHz = freq;
        this.emit();
    }
    noteOff(midi) {
        if (!this.env)
            return;
        if (this.currentNote !== midi)
            return; // last-note-priority
        this.env.triggerRelease();
        this.currentNote = null;
        this.emit();
    }
    setMasterVolume(v) {
        if (this.master)
            this.master.gain.rampTo(clamp(v, 0, 1), 0.05);
    }
    subscribe(fn) {
        this.listeners.add(fn);
        fn(this.status);
        return () => { this.listeners.delete(fn); };
    }
    dispose() {
        this.stop();
        this.osc?.dispose();
        this.filter?.dispose();
        this.env?.dispose();
        this.vca?.dispose();
        this.master?.dispose();
        this.meter?.dispose();
        this.osc = null;
        this.filter = null;
        this.env = null;
        this.vca = null;
        this.master = null;
        this.meter = null;
    }
    emit() {
        const s = { ...this.status };
        this.listeners.forEach((fn) => fn(s));
    }
    tickMeter() {
        if (!this.status.running)
            return;
        const v = this.meter ? Number(this.meter.getValue()) : -Infinity;
        // -60..0 dB → 0..1
        const norm = clamp((v + 60) / 60, 0, 1);
        if (Math.abs(norm - this.status.level) > 0.01) {
            this.status.level = norm;
            this.emit();
        }
        this.rafId = requestAnimationFrame(() => this.tickMeter());
    }
}
function buildLookup(project, patch) {
    const out = {};
    const racks = project.racks.filter((r) => patch.rackIds.includes(r.id));
    for (const r of racks) {
        for (const slot of r.slots) {
            const mod = project.modules.find((m) => m.id === slot.moduleId);
            if (!mod)
                continue;
            const type = project.moduleTypes.find((t) => t.id === mod.typeId);
            if (!type)
                continue;
            const cat = project.categories.find((c) => c.id === type.categoryId);
            const kind = String(cat?.kind ?? '');
            const controls = (patch.controlState[mod.id] ?? {});
            const entry = { module: mod, type, controls };
            if (kind === 'vco' && !out.vco)
                out.vco = entry;
            if (kind === 'vcf' && !out.vcf)
                out.vcf = entry;
            if (kind === 'vca' && !out.vca)
                out.vca = entry;
            if (kind === 'envelope' && !out.envelope)
                out.envelope = entry;
            if (kind === 'lfo' && !out.lfo)
                out.lfo = entry;
        }
    }
    return out;
}
function pickWaveform(_mod, controls) {
    const w = String(controls['wave'] ?? controls['waveform'] ?? '').toLowerCase();
    if (w.includes('sin'))
        return 'sine';
    if (w.includes('tri'))
        return 'triangle';
    if (w.includes('sq'))
        return 'square';
    return 'sawtooth';
}
function msToSec(v, fallbackMs) {
    const ms = typeof v === 'number' ? v : fallbackMs;
    return Math.max(0.001, ms / 1000);
}
function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}
function midiToHz(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
}
