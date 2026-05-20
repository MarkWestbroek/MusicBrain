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
import type {
  ModularProject, Patch, Module, ModuleType,
  PatchConnection, ControlValue, SignalType,
} from '../types';

export interface EngineStatus {
  running: boolean;
  voiceFreqHz: number;
  level: number;
  /** Per-module transient values written by the engine (e.g. SEQ __currentStep). */
  liveControls: Record<string, Record<string, ControlValue>>;
}

type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square';

interface BaseNode {
  moduleId: string;
  kind: string;
  type: ModuleType;
  controls: Record<string, ControlValue>;
}
interface VcoNode extends BaseNode {
  kind: 'vco';
  osc: Tone.Oscillator;
  /** Base MIDI note (driven by keyboard or sequencer-cv). */
  baseMidi: number;
  /** Set if a CV cable drives the 1V/oct input — keyboard then ignores this VCO. */
  voctDriven: boolean;
}
interface VcfNode extends BaseNode {
  kind: 'vcf';
  filter: Tone.Filter;
  cvAmt: number;
  baseCutoff: number;
}
interface VcaNode extends BaseNode {
  kind: 'vca';
  gain: Tone.Gain;
  /** Sum of CV cable contributions (created via Tone.Gain when needed). */
  cvSum: Tone.Signal<'number'> | null;
}
interface EnvNode extends BaseNode {
  kind: 'envelope';
  env: Tone.Envelope;
  /** True when a cable drives the 'gate' input (otherwise: keyboard gates it). */
  gateDriven: boolean;
}
interface LfoNode extends BaseNode {
  kind: 'lfo';
  lfo: Tone.LFO;
}
interface OutNode extends BaseNode {
  kind: 'out';
  inGain: Tone.Gain;
}
interface NoiseNode extends BaseNode {
  kind: 'noise';
  noise: Tone.Noise;
  level: Tone.Gain;
}
interface EchoNode extends BaseNode {
  kind: 'echo';
  delay: Tone.FeedbackDelay;
  wetGain: Tone.Gain;
  dryGain: Tone.Gain;
  input: Tone.Gain;
  output: Tone.Gain;
}
interface PhaserNode extends BaseNode {
  kind: 'phaser';
  phaser: Tone.Phaser;
  wetGain: Tone.Gain;
  dryGain: Tone.Gain;
  input: Tone.Gain;
  output: Tone.Gain;
}
interface MidiInNode extends BaseNode {
  kind: 'midiin';
  /** VCO module-ids waarvan de voct-input aan onze pitch-out hangt. */
  pitchTargets: string[];
  /** Envelope module-ids waarvan de gate-input aan onze gate-out hangt. */
  gateTargets: string[];
  /** Laatste gespeelde MIDI-noot (mono); null = release. */
  currentMidi: number | null;
}
interface SeqNode extends BaseNode {
  kind: 'sequencer';
  /** Computed step notes (semitones above root, length cap applied). */
  notes: number[];
  rateHz: number;
  gateRatio: number;
  /** True als de 'run'-toggle aan staat én er minstens één connectie is. */
  running: boolean;
  /** Module-ids that this sequencer's gate is wired to (envelopes). */
  gateTargets: string[];
  /** Module-ids that this sequencer's CV is wired to (VCO voct inputs). */
  cvTargets: string[];
  intervalId: number | null;
  stepIdx: number;
  lastNote: number | null;
  /** Whether at least one connection from this sequencer exists. */
  active: boolean;
  /** Optional callback fired with 1-based step index on every step. */
  onStep?: (step1: number) => void;
  /** Cached transposition (semitones) coming from voct_in CV-input (set during build). */
  voctOffset: number;
  /** True when a run_in gate is wired (run is then engine-driven, not from toggle). */
  runDriven: boolean;
  /** When runDriven: latest gate-high state from run_in source. */
  runGate: boolean;
}
type EngineNode = VcoNode | VcfNode | VcaNode | EnvNode | LfoNode | OutNode | MidiInNode | SeqNode | NoiseNode | EchoNode | PhaserNode;

export class AudioEngine {
  private master: Tone.Gain | null = null;
  private meter: Tone.Meter | null = null;
  private nodes = new Map<string, EngineNode>();
  private connections: PatchConnection[] = [];
  private portIndex = new Map<string, { signalType: SignalType; direction: 'in' | 'out' }>();
  private currentKeyboardNote: number | null = null;
  private listeners = new Set<(s: EngineStatus) => void>();
  private status: EngineStatus = { running: false, voiceFreqHz: 0, level: 0, liveControls: {} };
  private rafId: number | null = null;
  private startedOscs = new Set<Tone.Oscillator | Tone.LFO>();

  // ── public API ─────────────────────────────────────────────────────

  build(project: ModularProject, patch: Patch): void {
    this.dispose();

    this.master = new Tone.Gain(0.7);
    this.meter  = new Tone.Meter({ smoothing: 0.85 });
    this.master.connect(this.meter);
    this.master.toDestination();

    // 1. Index ports.
    const racks = project.racks.filter((r) => patch.rackIds.includes(r.id));
    const inRack = new Set<string>();
    for (const r of racks) for (const s of r.slots) inRack.add(s.moduleId);
    for (const m of project.modules) {
      if (!inRack.has(m.id)) continue;
      const t = project.moduleTypes.find((x) => x.id === m.typeId);
      if (!t) continue;
      for (const p of t.ports) {
        this.portIndex.set(`${m.id}:${p.id}`, { signalType: p.signalType, direction: p.direction });
      }
    }

    // 2. Build a node per module.
    for (const m of project.modules) {
      if (!inRack.has(m.id)) continue;
      const t = project.moduleTypes.find((x) => x.id === m.typeId);
      if (!t) continue;
      const cat = project.categories.find((c) => c.id === t.categoryId);
      const kind = String(cat?.kind ?? '');
      const ctrl = (patch.controlState[m.id] ?? {}) as Record<string, ControlValue>;
      const node = this.makeNode(kind, m, t, ctrl);
      if (node) this.nodes.set(m.id, node);
    }

    // 3. Wire connections.
    this.connections = patch.connections;
    for (const conn of patch.connections) this.wire(conn);

    // 4. Detect which VCOs are voct-driven and which envelopes are gate-driven
    //    door *actieve* bronnen (sequencer met run=true, of MIDI-In).
    for (const conn of patch.connections) {
      const src = this.nodes.get(conn.from.moduleId);
      const dst = this.nodes.get(conn.to.moduleId);
      if (!src || !dst) continue;
      const srcIsActive =
        src.kind === 'midiin' ||
        (src.kind === 'sequencer' && src.running);
      if (!srcIsActive) continue;
      if (dst.kind === 'vco' && conn.to.portId === 'voct') dst.voctDriven = true;
      if (dst.kind === 'envelope' && conn.to.portId === 'gate') dst.gateDriven = true;
    }
  }

  async start(): Promise<void> {
    await Tone.start();
    for (const node of this.nodes.values()) {
      if (node.kind === 'vco') {
        if (node.osc.state !== 'started') { node.osc.start(); this.startedOscs.add(node.osc); }
      }
      if (node.kind === 'lfo') {
        // Tone.LFO.start() is idempotent w.r.t. state via internal logic.
        try { node.lfo.start(); this.startedOscs.add(node.lfo); } catch { /* already started */ }
      }
      if (node.kind === 'noise') {
        if (node.noise.state !== 'started') { try { node.noise.start(); } catch { /* ignore */ } }
      }
      if (node.kind === 'sequencer' && node.active && node.running) this.startSequencer(node);
    }
    this.status.running = true;
    this.emit();
    this.tickMeter();
  }

  stop(): void {
    for (const node of this.nodes.values()) {
      if (node.kind === 'sequencer') this.stopSequencer(node);
      if (node.kind === 'envelope') node.env.triggerRelease();
      if (node.kind === 'noise') { try { node.noise.stop(); } catch { /* ignore */ } }
    }
    for (const o of this.startedOscs) {
      try { o.stop(); } catch { /* ignore */ }
    }
    this.startedOscs.clear();
    this.currentKeyboardNote = null;
    this.status.running = false;
    this.status.level = 0;
    this.status.voiceFreqHz = 0;
    this.emit();
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  noteOn(midi: number, _velocity = 0.9): void {
    this.currentKeyboardNote = midi;
    const freq = midiToHz(midi);

    // Verzamel alle MIDI-In modules; als die er zijn, fungeren zij als
    // dispatcher: keyboard/sequence-source rijdt via hen naar VCO/ENV.
    const midiIns: MidiInNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.kind === 'midiin') midiIns.push(node);
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
          if (n?.kind === 'envelope') n.env.triggerAttack();
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

  noteOff(midi: number): void {
    if (this.currentKeyboardNote !== midi) return;
    // MIDI-In dispatch.
    for (const node of this.nodes.values()) {
      if (node.kind === 'midiin' && node.currentMidi === midi) {
        node.currentMidi = null;
        for (const tgt of node.gateTargets) {
          const n = this.nodes.get(tgt);
          if (n?.kind === 'envelope') n.env.triggerRelease();
        }
      }
    }
    // Fallback.
    for (const node of this.nodes.values()) {
      if (node.kind === 'envelope' && !node.gateDriven) node.env.triggerRelease();
    }
    this.currentKeyboardNote = null;
    this.emit();
  }

  setMasterVolume(v: number): void {
    if (this.master) this.master.gain.rampTo(clamp(v, 0, 1), 0.05);
  }

  /**
   * Pas een control-wijziging *live* toe op de bestaande Tone-graph.
   * Returnt `true` als de wijziging zonder rebuild verwerkt is, `false`
   * als de aanroeper alsnog `build()` moet aanroepen (kabel/topologie-
   * gevoelige parameters zoals oscillator-type, filter-type, noise-color).
   */
  updateControl(moduleId: string, controlId: string, value: ControlValue): boolean {
    const node = this.nodes.get(moduleId);
    if (!node) return false;
    // Houd node.controls altijd in sync zodat SEQ-step herberekening en
    // toekomstige rebuilds correct doorlopen.
    node.controls = { ...node.controls, [controlId]: value };
    const num = typeof value === 'number' ? value : Number(value);
    const RAMP = 0.02;
    switch (node.kind) {
      case 'vco': {
        if (controlId === 'wave') return false; // type-wisseling = rebuild
        if (controlId === 'coarse' || controlId === 'fine') {
          const offset = readKnob(node.controls, 'coarse', 0) + readKnob(node.controls, 'fine', 0) / 100;
          node.osc.frequency.rampTo(midiToHz(node.baseMidi + offset), RAMP);
          return true;
        }
        if (controlId === 'detune') { node.osc.detune.rampTo(num, RAMP); return true; }
        return true;
      }
      case 'vcf': {
        if (controlId === 'type') return false;
        if (controlId === 'cutoff') {
          node.baseCutoff = num;
          node.filter.frequency.rampTo(num, RAMP);
          return true;
        }
        if (controlId === 'q' || controlId === 'res') { node.filter.Q.rampTo(num, RAMP); return true; }
        if (controlId === 'cv_amt') { node.cvAmt = num; return true; }
        return true;
      }
      case 'vca': {
        if (controlId === 'gain' || controlId === 'level') {
          node.gain.gain.rampTo(clamp(num, 0, 1), RAMP);
          return true;
        }
        return true;
      }
      case 'envelope': {
        const e = node.env;
        if (controlId === 'attack')  { e.attack  = Math.max(0.001, num); return true; }
        if (controlId === 'hold')    { /* Tone.Envelope kent geen native hold */ return true; }
        if (controlId === 'decay')   { e.decay   = Math.max(0.001, num); return true; }
        if (controlId === 'sustain') { e.sustain = clamp(num, 0, 1);     return true; }
        if (controlId === 'release') { e.release = Math.max(0.001, num); return true; }
        return true;
      }
      case 'lfo': {
        if (controlId === 'wave' || controlId === 'shape') return false;
        if (controlId === 'rate' || controlId === 'freq') { node.lfo.frequency.rampTo(num, RAMP); return true; }
        if (controlId === 'depth' || controlId === 'amount') {
          node.lfo.max = num; node.lfo.min = -num; return true;
        }
        return true;
      }
      case 'out': {
        if (controlId === 'level') { node.inGain.gain.rampTo(clamp(num, 0, 1), RAMP); return true; }
        return true;
      }
      case 'sequencer': {
        if (controlId === 'length' || controlId.startsWith('s') || controlId === 'root') {
          // Herbereken notes[] uit de huidige controls.
          const lengthRaw = readKnob(node.controls, 'length', 8);
          const length = Math.max(1, Math.min(16, Math.round(lengthRaw)));
          const root   = Math.round(readKnob(node.controls, 'root', 60));
          const notes: number[] = [];
          for (let i = 0; i < length; i++) {
            notes.push(root + Math.round(readKnob(node.controls, `s${i + 1}`, 0)));
          }
          node.notes = notes;
          return true;
        }
        if (controlId === 'rate') {
          node.rateHz = clamp(num, 0.5, 16);
          // Herstart interval met nieuwe rate als hij draait.
          if (node.intervalId !== null) {
            window.clearInterval(node.intervalId);
            node.intervalId = null;
            if (node.active && node.running) this.startSequencer(node);
          }
          return true;
        }
        if (controlId === 'gate') { node.gateRatio = clamp(num, 0.05, 0.95); return true; }
        if (controlId === 'run') {
          const run = Boolean(value);
          node.running = run;
          if (run && node.active && node.intervalId === null) this.startSequencer(node);
          if (!run && node.intervalId !== null) this.stopSequencer(node);
          return true;
        }
        return true;
      }
      case 'noise': {
        if (controlId === 'color') return false; // Tone.Noise.type → rebuild
        if (controlId === 'level') { node.level.gain.rampTo(clamp(num, 0, 1), RAMP); return true; }
        return true;
      }
      case 'echo': {
        if (controlId === 'tempo_sync') return false;
        if (controlId === 'time')     { node.delay.delayTime.rampTo(clamp(num, 0.001, 2), RAMP); return true; }
        if (controlId === 'feedback') { node.delay.feedback.rampTo(clamp(num, 0, 0.95), RAMP); return true; }
        if (controlId === 'mix') {
          const mix = clamp(num, 0, 1);
          node.wetGain.gain.rampTo(mix, RAMP);
          node.dryGain.gain.rampTo(1 - mix, RAMP);
          return true;
        }
        return true;
      }
      case 'phaser': {
        if (controlId === 'rate')     { node.phaser.frequency.rampTo(clamp(num, 0.01, 10), RAMP); return true; }
        if (controlId === 'depth')    { node.phaser.Q.value = 10 * clamp(num, 0, 1); return true; }
        if (controlId === 'feedback') { /* Tone.Phaser heeft geen public feedback param */ return false; }
        if (controlId === 'mix') {
          const mix = clamp(num, 0, 1);
          node.wetGain.gain.rampTo(mix, RAMP);
          node.dryGain.gain.rampTo(1 - mix, RAMP);
          return true;
        }
        return true;
      }
      case 'midiin': return true;
    }
    return false;
  }

  subscribe(fn: (s: EngineStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => { this.listeners.delete(fn); };
  }

  dispose(): void {
    this.stop();
    for (const node of this.nodes.values()) {
      switch (node.kind) {
        case 'vco': node.osc.dispose(); break;
        case 'vcf': node.filter.dispose(); break;
        case 'vca': node.gain.dispose(); node.cvSum?.dispose(); break;
        case 'envelope': node.env.dispose(); break;
        case 'lfo': node.lfo.dispose(); break;
        case 'out': node.inGain.dispose(); break;
        case 'noise': node.noise.dispose(); node.level.dispose(); break;
        case 'echo': node.delay.dispose(); node.wetGain.dispose(); node.dryGain.dispose(); node.input.dispose(); node.output.dispose(); break;
        case 'phaser': node.phaser.dispose(); node.wetGain.dispose(); node.dryGain.dispose(); node.input.dispose(); node.output.dispose(); break;
        case 'sequencer': /* no Tone nodes */ break;
        case 'midiin':    /* no Tone nodes */ break;
      }
    }
    this.nodes.clear();
    this.portIndex.clear();
    this.connections = [];
    this.master?.dispose(); this.meter?.dispose();
    this.master = null; this.meter = null;
  }

  // ── helpers ────────────────────────────────────────────────────────

  private makeNode(
    kind: string, m: Module, t: ModuleType, controls: Record<string, ControlValue>,
  ): EngineNode | null {
    const base = { moduleId: m.id, type: t, controls };
    // Speciale interne modules waarvan de categorie-`kind` niet aansluit
    // op het standaard switch-vocabulaire (utility/vco/vcf/...). Deze
    // worden op typeId herkend zodat ze altijd worden gebouwd, los van
    // welke categorie de gebruiker aan ze hangt.
    if (t.id === 'tp_mmb_noise') {
      const colorIdx = readKnob(controls, 'color', 0);
      const ntype: 'white'|'pink'|'brown' = colorIdx === 1 ? 'pink' : colorIdx === 2 ? 'brown' : 'white';
      const level = clamp(readKnob(controls, 'level', 0.6), 0, 1);
      const noise = new Tone.Noise(ntype);
      const g = new Tone.Gain(level);
      noise.connect(g);
      return { ...base, kind: 'noise', noise, level: g };
    }
    if (t.id === 'tp_mmb_echo') {
      const time = clamp(readKnob(controls, 'time', 0.30), 0.001, 2);
      const fbk  = clamp(readKnob(controls, 'feedback', 0.45), 0, 0.95);
      const mix  = clamp(readKnob(controls, 'mix', 0.35), 0, 1);
      const input = new Tone.Gain(1);
      const output = new Tone.Gain(1);
      const dryG = new Tone.Gain(1 - mix);
      const wetG = new Tone.Gain(mix);
      const delay = new Tone.FeedbackDelay({ delayTime: time, feedback: fbk });
      input.connect(dryG); dryG.connect(output);
      input.connect(delay); delay.connect(wetG); wetG.connect(output);
      return { ...base, kind: 'echo', delay, wetGain: wetG, dryGain: dryG, input, output };
    }
    if (t.id === 'tp_mmb_phaser') {
      const rate = clamp(readKnob(controls, 'rate', 0.5), 0.01, 10);
      const depth = clamp(readKnob(controls, 'depth', 0.7), 0, 1);
      const mix = clamp(readKnob(controls, 'mix', 0.5), 0, 1);
      const input = new Tone.Gain(1);
      const output = new Tone.Gain(1);
      const dryG = new Tone.Gain(1 - mix);
      const wetG = new Tone.Gain(mix);
      const ph = new Tone.Phaser({ frequency: rate, octaves: 3, baseFrequency: 350 });
      ph.Q.value = 10 * depth;
      input.connect(dryG); dryG.connect(output);
      input.connect(ph); ph.connect(wetG); wetG.connect(output);
      return { ...base, kind: 'phaser', phaser: ph, wetGain: wetG, dryGain: dryG, input, output };
    }
    switch (kind) {
      case 'vco': {
        const wave = pickWaveform(controls);
        const osc = new Tone.Oscillator({ frequency: 220, type: wave, volume: -6 });
        return { ...base, kind: 'vco', osc, baseMidi: 57, voctDriven: false };
      }
      case 'vcf': {
        const baseCutoff = clamp(readKnob(controls, 'cutoff', 2000), 20, 18000);
        const q          = clamp(readKnob(controls, 'q', 0.7),       0.1, 12);
        const cvAmt      = clamp(readKnob(controls, 'cv_amt', 1),    0, 1);
        const tIdx       = readKnob(controls, 'type', 0);
        const ftype: 'lowpass' | 'highpass' | 'bandpass' =
          tIdx === 1 ? 'highpass' : tIdx === 2 ? 'bandpass' : 'lowpass';
        const filter = new Tone.Filter({ frequency: baseCutoff, Q: q, type: ftype });
        return { ...base, kind: 'vcf', filter, cvAmt, baseCutoff };
      }
      case 'vca': {
        const baseGain = clamp(readKnob(controls, 'gain', 0), 0, 1);
        const gain = new Tone.Gain(baseGain);
        return { ...base, kind: 'vca', gain, cvSum: null };
      }
      case 'envelope': {
        const A = msToSec(controls['attack'],  10);
        const H = msToSec(controls['hold'],    0);
        const D = msToSec(controls['decay'],   200);
        const S = clamp(Number(controls['sustain'] ?? 0.7), 0, 1);
        const R = msToSec(controls['release'], 400);
        const env = new Tone.Envelope({ attack: A + H, decay: D, sustain: S, release: R });
        return { ...base, kind: 'envelope', env, gateDriven: false };
      }
      case 'lfo': {
        const rate  = clamp(readKnob(controls, 'rate',  1), 0.01, 50);
        const depth = clamp(readKnob(controls, 'depth', 1), 0, 1);
        const wIdx  = readKnob(controls, 'wave', 0);
        const ltype: Wave = wIdx === 1 ? 'triangle' : wIdx === 2 ? 'sawtooth'
                          : wIdx === 3 ? 'square'   : 'sine';
        const lfo = new Tone.LFO({ frequency: rate, min: 0, max: depth, type: ltype });
        return { ...base, kind: 'lfo', lfo };
      }
      case 'utility':
        // Convention: alleen 'MMB OUT' wordt als audio-output-node behandeld.
        if (t.id === 'tp_mmb_out') {
          const level = clamp(readKnob(controls, 'level', 0.8), 0, 1);
          const inGain = new Tone.Gain(level);
          if (this.master) inGain.connect(this.master);
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
        if (t.id === 'tp_mmb_noise') {
          // Already handled above; never reach here.
          return null;
        }
        if (t.id === 'tp_mmb_echo' || t.id === 'tp_mmb_phaser') {
          return null;
        }
        return null;
      case 'sequencer': {
        const lengthRaw = readKnob(controls, 'length', 8);
        const length = Math.max(1, Math.min(16, Math.round(lengthRaw)));
        const root   = Math.round(readKnob(controls, 'root', 60));
        const notes: number[] = [];
        for (let i = 0; i < length; i++) {
          const semis = readKnob(controls, `s${i + 1}`, 0);
          notes.push(root + Math.round(semis));
        }
        const rate = clamp(readKnob(controls, 'rate', 4), 0.5, 16);
        const gate = clamp(readKnob(controls, 'gate', 0.5), 0.05, 0.95);
        const run  = readToggle(controls, 'run', true);
        return {
          ...base, kind: 'sequencer',
          notes, rateHz: rate, gateRatio: gate,
          running: run,
          gateTargets: [], cvTargets: [],
          intervalId: null, stepIdx: 0, lastNote: null,
          active: false,
          voctOffset: 0,
          runDriven: false,
          runGate: false,
        };
      }
      default:
        return null;
    }
  }

  private wire(conn: PatchConnection): void {
    const src = this.nodes.get(conn.from.moduleId);
    const dst = this.nodes.get(conn.to.moduleId);
    const srcPort = this.portIndex.get(`${conn.from.moduleId}:${conn.from.portId}`);
    const dstPort = this.portIndex.get(`${conn.to.moduleId}:${conn.to.portId}`);
    if (!src || !dst || !srcPort || !dstPort) return;

    const srcSig = srcPort.signalType;
    const dstSig = dstPort.signalType;

    // ── audio → audio ──
    if (srcSig === 'audio' && dstSig === 'audio') {
      const outNode = audioOutputOf(src);
      const inNode  = audioInputOf(dst);
      if (outNode && inNode) outNode.connect(inNode);
      return;
    }

    // ── cv → AudioParam (VCF cutoff, VCA gain) ──
    if (srcSig === 'cv') {
      if (dst.kind === 'vca' && conn.to.portId === 'cv') {
        // Envelope/LFO outputs are 0..1 → add to the gain knob's base value.
        const out = cvOutputOf(src);
        if (out) out.connect(dst.gain.gain);
        return;
      }
      if (dst.kind === 'vcf' && conn.to.portId === 'cv') {
        // Map 0..1 CV → cutoff multiplier (1x..16x = 4 octaves up). We use
        // Tone.Scale to translate the 0..1 signal into a freq-offset.
        const out = cvOutputOf(src);
        if (!out) return;
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
      } else if (src.kind === 'midiin') {
        src.gateTargets.push(dst.moduleId);
      }
      return;
    }
  }

  private startSequencer(seq: SeqNode): void {
    if (seq.intervalId !== null) return;
    const intervalMs = 1000 / seq.rateHz;
    const step = (): void => {
      // Release previous gate (note off on connected envelopes).
      if (seq.lastNote !== null) {
        for (const tgt of seq.gateTargets) {
          const env = this.nodes.get(tgt);
          if (env?.kind === 'envelope') env.env.triggerRelease();
        }
        seq.lastNote = null;
      }
      // Trigger the new step.
      const note = seq.notes[seq.stepIdx % seq.notes.length]!;
      seq.lastNote = note;
      const step1 = (seq.stepIdx % seq.notes.length) + 1;
      seq.stepIdx++;
      // Write live step-index for UI (step-LEDs / display).
      this.status.liveControls[seq.moduleId] = {
        ...(this.status.liveControls[seq.moduleId] ?? {}),
        __currentStep: step1,
      };

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
        if (env?.kind === 'envelope') env.env.triggerAttack();
      }
      this.status.voiceFreqHz = midiToHz(note);
      this.emit();

      // Schedule note-off at gateRatio of the step.
      window.setTimeout(() => {
        for (const tgt of seq.gateTargets) {
          const env = this.nodes.get(tgt);
          if (env?.kind === 'envelope' && seq.lastNote === note) env.env.triggerRelease();
        }
      }, intervalMs * seq.gateRatio);
    };
    seq.intervalId = window.setInterval(step, intervalMs);
    step();
  }
  private stopSequencer(seq: SeqNode): void {
    if (seq.intervalId !== null) { window.clearInterval(seq.intervalId); seq.intervalId = null; }
    seq.stepIdx = 0;
    seq.lastNote = null;
    // Clear live step indicator.
    const live = this.status.liveControls[seq.moduleId];
    if (live) { delete live.__currentStep; }
  }

  private emit(): void {
    const s = { ...this.status };
    this.listeners.forEach((fn) => fn(s));
  }

  private tickMeter(): void {
    if (!this.status.running) return;
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

function audioOutputOf(n: EngineNode): Tone.ToneAudioNode | null {
  switch (n.kind) {
    case 'vco': return n.osc;
    case 'vcf': return n.filter;
    case 'vca': return n.gain;
    case 'noise': return n.level;
    case 'echo': return n.output;
    case 'phaser': return n.output;
    default: return null;
  }
}
function audioInputOf(n: EngineNode): Tone.ToneAudioNode | null {
  switch (n.kind) {
    case 'vcf': return n.filter;
    case 'vca': return n.gain;
    case 'out': return n.inGain;
    case 'echo': return n.input;
    case 'phaser': return n.input;
    default: return null;
  }
}
function cvOutputOf(n: EngineNode): Tone.ToneAudioNode | null {
  switch (n.kind) {
    case 'envelope': return n.env;
    case 'lfo':      return n.lfo;
    default: return null;
  }
}

// ── value helpers ────────────────────────────────────────────────────

function pickWaveform(controls: Record<string, ControlValue>): Wave {
  const w = controls['wave'] ?? controls['waveform'];
  if (typeof w === 'number') {
    return (['sine','triangle','sawtooth','square'][w] ?? 'sawtooth') as Wave;
  }
  const s = String(w ?? '').toLowerCase();
  if (s.includes('sin')) return 'sine';
  if (s.includes('tri')) return 'triangle';
  if (s.includes('sq'))  return 'square';
  return 'sawtooth';
}
function readKnob(controls: Record<string, ControlValue>, id: string, def: number): number {
  const v = controls[id];
  return typeof v === 'number' ? v : def;
}
function readToggle(controls: Record<string, ControlValue>, id: string, def: boolean): boolean {
  const v = controls[id];
  return typeof v === 'boolean' ? v : def;
}
function msToSec(v: ControlValue | undefined, fallbackMs: number): number {
  const ms = typeof v === 'number' ? v : fallbackMs;
  return Math.max(0.001, ms / 1000);
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
