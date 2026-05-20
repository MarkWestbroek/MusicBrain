// AudioEngine — connection-following Tone.js back-end voor de simulator.
//
// Aanpak: per module wordt een Tone-node opgebouwd op basis van de
// category.kind (vco/vcf/vca/envelope/lfo/sequencer/utility). Daarna lopen
// we patch.connections af en wire-en we audio→audio en cv→AudioParam-
// routes met de echte Tone .connect() / Param-coupling.
//
// Port-naming-conventies (zie seedModules.ts → mmbVco/Vcf/Vca/Out/Ahdsr/Seq):
//   VCO : out 'out' (audio), in 'voct' (cv 1V/oct), 'fm' (cv)
//   VCF : out 'out' (audio), in 'in' (audio), 'cv' (cv → cutoff)
//   VCA : out 'out' (audio), in 'in' (audio), 'cv' (cv → gain)
//   ENV : out 'cv_out' (cv 0..1), 'eoc' (trig); in 'gate' (gate), 'trig' (trig)
//   LFO : out 'out' (cv), 'out_inv' (cv); in 'rate_cv' (cv), 'reset' (trig)
//   OUT : in 'l','r' (audio) → master
//   SEQ : out 'cv' (cv semitones), 'gate_out' (gate); in 'clock','reset' (trig)
//
// Trigger-flow: noteOn/noteOff van de MIDI-bron → engine:
//   - Voor elk VCO zonder voct-input-connection : direct freq instellen.
//   - Voor elk VCO mét voct-input-connection    : keyboard wordt genegeerd
//                                                 voor dat oscillator
//     (de bron — bv. sequencer — bepaalt de toonhoogte).
//   - Voor elk envelope zonder gate-input-connection: trigger op elke noot.
//   - Voor elk envelope mét gate-input-connection : extern bron triggert;
//     keyboard triggert het alleen als de bron 'keyboard' is.
import * as Tone from 'tone';
export class AudioEngine {
    master = null;
    meter = null;
    nodes = new Map();
    connections = [];
    portIndex = new Map();
    currentKeyboardNote = null;
    listeners = new Set();
    status = { running: false, voiceFreqHz: 0, level: 0 };
    rafId = null;
    startedOscs = new Set();
    // ── public API ─────────────────────────────────────────────────────
    build(project, patch) {
        this.dispose();
        this.master = new Tone.Gain(0.7);
        this.meter = new Tone.Meter({ smoothing: 0.85 });
        this.master.connect(this.meter);
        this.master.toDestination();
        // 1. Index ports.
        const racks = project.racks.filter((r) => patch.rackIds.includes(r.id));
        const inRack = new Set();
        for (const r of racks)
            for (const s of r.slots)
                inRack.add(s.moduleId);
        for (const m of project.modules) {
            if (!inRack.has(m.id))
                continue;
            const t = project.moduleTypes.find((x) => x.id === m.typeId);
            if (!t)
                continue;
            for (const p of t.ports) {
                this.portIndex.set(`${m.id}:${p.id}`, { signalType: p.signalType, direction: p.direction });
            }
        }
        // 2. Build a node per module.
        for (const m of project.modules) {
            if (!inRack.has(m.id))
                continue;
            const t = project.moduleTypes.find((x) => x.id === m.typeId);
            if (!t)
                continue;
            const cat = project.categories.find((c) => c.id === t.categoryId);
            const kind = String(cat?.kind ?? '');
            const ctrl = (patch.controlState[m.id] ?? {});
            const node = this.makeNode(kind, m, t, ctrl);
            if (node)
                this.nodes.set(m.id, node);
        }
        // 3. Wire connections.
        this.connections = patch.connections;
        for (const conn of patch.connections)
            this.wire(conn);
        // 4. Detect which VCOs are voct-driven and which envelopes are gate-driven
        //    door *actieve* bronnen (sequencer met run=true, of MIDI-In).
        for (const conn of patch.connections) {
            const src = this.nodes.get(conn.from.moduleId);
            const dst = this.nodes.get(conn.to.moduleId);
            if (!src || !dst)
                continue;
            const srcIsActive = src.kind === 'midiin' ||
                (src.kind === 'sequencer' && src.running);
            if (!srcIsActive)
                continue;
            if (dst.kind === 'vco' && conn.to.portId === 'voct')
                dst.voctDriven = true;
            if (dst.kind === 'envelope' && conn.to.portId === 'gate')
                dst.gateDriven = true;
        }
    }
    async start() {
        await Tone.start();
        for (const node of this.nodes.values()) {
            if (node.kind === 'vco') {
                if (node.osc.state !== 'started') {
                    node.osc.start();
                    this.startedOscs.add(node.osc);
                }
            }
            if (node.kind === 'lfo') {
                // Tone.LFO.start() is idempotent w.r.t. state via internal logic.
                try {
                    node.lfo.start();
                    this.startedOscs.add(node.lfo);
                }
                catch { /* already started */ }
            }
            if (node.kind === 'sequencer' && node.active && node.running)
                this.startSequencer(node);
        }
        this.status.running = true;
        this.emit();
        this.tickMeter();
    }
    stop() {
        for (const node of this.nodes.values()) {
            if (node.kind === 'sequencer')
                this.stopSequencer(node);
            if (node.kind === 'envelope')
                node.env.triggerRelease();
        }
        for (const o of this.startedOscs) {
            try {
                o.stop();
            }
            catch { /* ignore */ }
        }
        this.startedOscs.clear();
        this.currentKeyboardNote = null;
        this.status.running = false;
        this.status.level = 0;
        this.status.voiceFreqHz = 0;
        this.emit();
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }
    noteOn(midi, _velocity = 0.9) {
        this.currentKeyboardNote = midi;
        const freq = midiToHz(midi);
        // Verzamel alle MIDI-In modules; als die er zijn, fungeren zij als
        // dispatcher: keyboard/sequence-source rijdt via hen naar VCO/ENV.
        const midiIns = [];
        for (const node of this.nodes.values()) {
            if (node.kind === 'midiin')
                midiIns.push(node);
        }
        if (midiIns.length > 0) {
            for (const mi of midiIns) {
                mi.currentMidi = midi;
                for (const tgt of mi.pitchTargets) {
                    const n = this.nodes.get(tgt);
                    if (n?.kind === 'vco') {
                        const off = readKnob(n.controls, 'coarse', 0) + readKnob(n.controls, 'fine', 0) / 100;
                        n.osc.frequency.rampTo(midiToHz(midi + off), 0.005);
                    }
                }
                for (const tgt of mi.gateTargets) {
                    const n = this.nodes.get(tgt);
                    if (n?.kind === 'envelope')
                        n.env.triggerAttack();
                }
            }
        }
        // Implicit-route fallback voor VCO's/envelopes zonder actieve driver.
        for (const node of this.nodes.values()) {
            if (node.kind === 'vco' && !node.voctDriven) {
                const offset = readKnob(node.controls, 'coarse', 0) + readKnob(node.controls, 'fine', 0) / 100;
                node.baseMidi = midi;
                node.osc.frequency.rampTo(midiToHz(midi + offset), 0.005);
            }
            if (node.kind === 'envelope' && !node.gateDriven) {
                node.env.triggerAttack();
            }
        }
        this.status.voiceFreqHz = freq;
        this.emit();
    }
    noteOff(midi) {
        if (this.currentKeyboardNote !== midi)
            return;
        // MIDI-In dispatch.
        for (const node of this.nodes.values()) {
            if (node.kind === 'midiin' && node.currentMidi === midi) {
                node.currentMidi = null;
                for (const tgt of node.gateTargets) {
                    const n = this.nodes.get(tgt);
                    if (n?.kind === 'envelope')
                        n.env.triggerRelease();
                }
            }
        }
        // Fallback.
        for (const node of this.nodes.values()) {
            if (node.kind === 'envelope' && !node.gateDriven)
                node.env.triggerRelease();
        }
        this.currentKeyboardNote = null;
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
        for (const node of this.nodes.values()) {
            switch (node.kind) {
                case 'vco':
                    node.osc.dispose();
                    break;
                case 'vcf':
                    node.filter.dispose();
                    break;
                case 'vca':
                    node.gain.dispose();
                    node.cvSum?.dispose();
                    break;
                case 'envelope':
                    node.env.dispose();
                    break;
                case 'lfo':
                    node.lfo.dispose();
                    break;
                case 'out':
                    node.inGain.dispose();
                    break;
                case 'sequencer': /* no Tone nodes */ break;
                case 'midiin': /* no Tone nodes */ break;
            }
        }
        this.nodes.clear();
        this.portIndex.clear();
        this.connections = [];
        this.master?.dispose();
        this.meter?.dispose();
        this.master = null;
        this.meter = null;
    }
    // ── helpers ────────────────────────────────────────────────────────
    makeNode(kind, m, t, controls) {
        const base = { moduleId: m.id, type: t, controls };
        switch (kind) {
            case 'vco': {
                const wave = pickWaveform(controls);
                const osc = new Tone.Oscillator({ frequency: 220, type: wave, volume: -6 });
                return { ...base, kind: 'vco', osc, baseMidi: 57, voctDriven: false };
            }
            case 'vcf': {
                const baseCutoff = clamp(readKnob(controls, 'cutoff', 2000), 20, 18000);
                const q = clamp(readKnob(controls, 'q', 0.7), 0.1, 12);
                const cvAmt = clamp(readKnob(controls, 'cv_amt', 1), 0, 1);
                const tIdx = readKnob(controls, 'type', 0);
                const ftype = tIdx === 1 ? 'highpass' : tIdx === 2 ? 'bandpass' : 'lowpass';
                const filter = new Tone.Filter({ frequency: baseCutoff, Q: q, type: ftype });
                return { ...base, kind: 'vcf', filter, cvAmt, baseCutoff };
            }
            case 'vca': {
                const baseGain = clamp(readKnob(controls, 'gain', 0), 0, 1);
                const gain = new Tone.Gain(baseGain);
                return { ...base, kind: 'vca', gain, cvSum: null };
            }
            case 'envelope': {
                const A = msToSec(controls['attack'], 10);
                const H = msToSec(controls['hold'], 0);
                const D = msToSec(controls['decay'], 200);
                const S = clamp(Number(controls['sustain'] ?? 0.7), 0, 1);
                const R = msToSec(controls['release'], 400);
                const env = new Tone.Envelope({ attack: A + H, decay: D, sustain: S, release: R });
                return { ...base, kind: 'envelope', env, gateDriven: false };
            }
            case 'lfo': {
                const rate = clamp(readKnob(controls, 'rate', 1), 0.01, 50);
                const depth = clamp(readKnob(controls, 'depth', 1), 0, 1);
                const wIdx = readKnob(controls, 'wave', 0);
                const ltype = wIdx === 1 ? 'triangle' : wIdx === 2 ? 'sawtooth'
                    : wIdx === 3 ? 'square' : 'sine';
                const lfo = new Tone.LFO({ frequency: rate, min: 0, max: depth, type: ltype });
                return { ...base, kind: 'lfo', lfo };
            }
            case 'utility':
                // Convention: alleen 'MMB OUT' wordt als audio-output-node behandeld.
                if (t.id === 'tp_mmb_out') {
                    const level = clamp(readKnob(controls, 'level', 0.8), 0, 1);
                    const inGain = new Tone.Gain(level);
                    if (this.master)
                        inGain.connect(this.master);
                    return { ...base, kind: 'out', inGain };
                }
                // MIDI-In breakout: dispatcher die noteOn/noteOff van de actieve
                // MIDI-bron doorgeeft aan alle aangesloten VCO's (pitch) en
                // envelopes (gate).
                if (t.id === 'tp_mmb_midiin') {
                    return {
                        ...base, kind: 'midiin',
                        pitchTargets: [], gateTargets: [],
                        currentMidi: null,
                    };
                }
                return null;
            case 'sequencer': {
                const length = Math.max(1, readKnob(controls, 'length', 6) + 2); // switch idx 0..6 → 2..8 steps
                const root = Math.round(readKnob(controls, 'root', 60));
                const notes = [];
                for (let i = 0; i < length; i++) {
                    const semis = readKnob(controls, `s${i + 1}`, 0);
                    notes.push(root + Math.round(semis));
                }
                const rate = clamp(readKnob(controls, 'rate', 4), 0.5, 16);
                const gate = clamp(readKnob(controls, 'gate', 0.5), 0.05, 0.95);
                const run = readToggle(controls, 'run', true);
                return {
                    ...base, kind: 'sequencer',
                    notes, rateHz: rate, gateRatio: gate,
                    running: run,
                    gateTargets: [], cvTargets: [],
                    intervalId: null, stepIdx: 0, lastNote: null,
                    active: false,
                };
            }
            default:
                return null;
        }
    }
    wire(conn) {
        const src = this.nodes.get(conn.from.moduleId);
        const dst = this.nodes.get(conn.to.moduleId);
        const srcPort = this.portIndex.get(`${conn.from.moduleId}:${conn.from.portId}`);
        const dstPort = this.portIndex.get(`${conn.to.moduleId}:${conn.to.portId}`);
        if (!src || !dst || !srcPort || !dstPort)
            return;
        const srcSig = srcPort.signalType;
        const dstSig = dstPort.signalType;
        // ── audio → audio ──
        if (srcSig === 'audio' && dstSig === 'audio') {
            const outNode = audioOutputOf(src);
            const inNode = audioInputOf(dst);
            if (outNode && inNode)
                outNode.connect(inNode);
            return;
        }
        // ── cv → AudioParam (VCF cutoff, VCA gain) ──
        if (srcSig === 'cv') {
            if (dst.kind === 'vca' && conn.to.portId === 'cv') {
                // Envelope/LFO outputs are 0..1 → add to the gain knob's base value.
                const out = cvOutputOf(src);
                if (out)
                    out.connect(dst.gain.gain);
                return;
            }
            if (dst.kind === 'vcf' && conn.to.portId === 'cv') {
                // Map 0..1 CV → cutoff multiplier (1x..16x = 4 octaves up). We use
                // Tone.Scale to translate the 0..1 signal into a freq-offset.
                const out = cvOutputOf(src);
                if (!out)
                    return;
                const scale = new Tone.Scale(0, dst.baseCutoff * 8 * dst.cvAmt);
                out.connect(scale);
                scale.connect(dst.filter.frequency);
                return;
            }
            // VCO V/Oct uit een SEQ-module → handled door step-update, niet via signal.
            if (dst.kind === 'vco' && conn.to.portId === 'voct' && src.kind === 'sequencer') {
                src.cvTargets.push(dst.moduleId);
                src.active = true;
                return;
            }
            // VCO V/Oct uit een MIDI-In module → ook via dispatcher (mono pitch).
            if (dst.kind === 'vco' && conn.to.portId === 'voct' && src.kind === 'midiin') {
                src.pitchTargets.push(dst.moduleId);
                return;
            }
        }
        // ── gate → envelope ──
        if (srcSig === 'gate' && dst.kind === 'envelope' && conn.to.portId === 'gate') {
            if (src.kind === 'sequencer') {
                src.gateTargets.push(dst.moduleId);
                src.active = true;
            }
            else if (src.kind === 'midiin') {
                src.gateTargets.push(dst.moduleId);
            }
            return;
        }
    }
    startSequencer(seq) {
        if (seq.intervalId !== null)
            return;
        const intervalMs = 1000 / seq.rateHz;
        const step = () => {
            // Release previous gate (note off on connected envelopes).
            if (seq.lastNote !== null) {
                for (const tgt of seq.gateTargets) {
                    const env = this.nodes.get(tgt);
                    if (env?.kind === 'envelope')
                        env.env.triggerRelease();
                }
                seq.lastNote = null;
            }
            // Trigger the new step.
            const note = seq.notes[seq.stepIdx % seq.notes.length];
            seq.lastNote = note;
            seq.stepIdx++;
            // Drive CV targets (VCO voct inputs).
            for (const tgt of seq.cvTargets) {
                const n = this.nodes.get(tgt);
                if (n?.kind === 'vco') {
                    const offset = readKnob(n.controls, 'coarse', 0) + readKnob(n.controls, 'fine', 0) / 100;
                    n.osc.frequency.rampTo(midiToHz(note + offset), 0.005);
                }
            }
            // Trigger gate targets (envelopes).
            for (const tgt of seq.gateTargets) {
                const env = this.nodes.get(tgt);
                if (env?.kind === 'envelope')
                    env.env.triggerAttack();
            }
            this.status.voiceFreqHz = midiToHz(note);
            this.emit();
            // Schedule note-off at gateRatio of the step.
            window.setTimeout(() => {
                for (const tgt of seq.gateTargets) {
                    const env = this.nodes.get(tgt);
                    if (env?.kind === 'envelope' && seq.lastNote === note)
                        env.env.triggerRelease();
                }
            }, intervalMs * seq.gateRatio);
        };
        seq.intervalId = window.setInterval(step, intervalMs);
        step();
    }
    stopSequencer(seq) {
        if (seq.intervalId !== null) {
            window.clearInterval(seq.intervalId);
            seq.intervalId = null;
        }
        seq.stepIdx = 0;
        seq.lastNote = null;
    }
    emit() {
        const s = { ...this.status };
        this.listeners.forEach((fn) => fn(s));
    }
    tickMeter() {
        if (!this.status.running)
            return;
        const v = this.meter ? Number(this.meter.getValue()) : -Infinity;
        const norm = clamp((v + 60) / 60, 0, 1);
        if (Math.abs(norm - this.status.level) > 0.01) {
            this.status.level = norm;
            this.emit();
        }
        this.rafId = requestAnimationFrame(() => this.tickMeter());
    }
}
// ── node-port lookups ────────────────────────────────────────────────
function audioOutputOf(n) {
    switch (n.kind) {
        case 'vco': return n.osc;
        case 'vcf': return n.filter;
        case 'vca': return n.gain;
        default: return null;
    }
}
function audioInputOf(n) {
    switch (n.kind) {
        case 'vcf': return n.filter;
        case 'vca': return n.gain;
        case 'out': return n.inGain;
        default: return null;
    }
}
function cvOutputOf(n) {
    switch (n.kind) {
        case 'envelope': return n.env;
        case 'lfo': return n.lfo;
        default: return null;
    }
}
// ── value helpers ────────────────────────────────────────────────────
function pickWaveform(controls) {
    const w = controls['wave'] ?? controls['waveform'];
    if (typeof w === 'number') {
        return (['sine', 'triangle', 'sawtooth', 'square'][w] ?? 'sawtooth');
    }
    const s = String(w ?? '').toLowerCase();
    if (s.includes('sin'))
        return 'sine';
    if (s.includes('tri'))
        return 'triangle';
    if (s.includes('sq'))
        return 'square';
    return 'sawtooth';
}
function readKnob(controls, id, def) {
    const v = controls[id];
    return typeof v === 'number' ? v : def;
}
function readToggle(controls, id, def) {
    const v = controls[id];
    return typeof v === 'boolean' ? v : def;
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
