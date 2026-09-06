// AudioEngine — connection-following Tone.js back-end voor de simulator.
//
// Aanpak: per module wordt een Tone-node opgebouwd op basis van de
// category.kind (vco/vcf/vca/envelope/lfo/sequencer/utility). Daarna lopen
// we patch.connections af en wire-en we audio→audio en cv→AudioParam-
// routes met de echte Tone .connect() / Param-coupling.
//
// Port-naming-conventies (zie seedModules.ts → mmbVco/Vcf/Vca/Out/Ahdsr/Seq):
//   VCO : out 'out' (audio), in 'voct' (cv 1V/oct), 'fm' (cv)
//   VCF : out 'out' (audio), in 'in' (audio), 'cv' (cv → cutoff), 'q_cv' (cv → resonance)
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
  ModularProject, Patch, ModuleInstance, ModuleType,
  PatchConnection, ControlValue, SignalType,
} from '../types';
import { registry, Vcf, Ladder, Ms20, Vco, FmVco, Vca, Ahdsr, Lfo, Dx7, WasmModule } from '../runtime';

export interface EngineStatus {
  running: boolean;
  voiceFreqHz: number;
  level: number;
  /** Laatste noot die binnenkwam: MIDI-nummer, velocity 0..127 en de tijd.
   *  Puur voor de UI — zonder dit kun je bij een sampler niet zien of een
   *  zachte aanslag ook werkelijk zacht binnenkomt. */
  lastNote?: { midi: number; vel: number; ts: number; on: boolean };
  /** Per-module transient values written by the engine (e.g. SEQ __currentStep). */
  liveControls: Record<string, Record<string, ControlValue>>;
}

type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square';

interface BaseNode {
  moduleId: string;
  kind: string;
  type: ModuleType;
  controls: Record<string, ControlValue>;
  /** Control-id remapping for external modules simulated by a proxy (simulationControlMap). */
  controlMap?: Record<string, string>;
}
interface VcoNode extends BaseNode {
  kind: 'vco';
  /** Runtime class instance — owns Tone.Oscillator lifecycle + setControl. */
  runtime: Vco;
  /** Alias of `runtime.osc` for legacy wire code. */
  osc: Tone.Oscillator;
  /** Base MIDI note (driven by keyboard or sequencer-cv). */
  baseMidi: number;
  /** Set if a CV cable drives the 1V/oct input — keyboard then ignores this VCO. */
  voctDriven: boolean;
}
interface VcfNode extends BaseNode {
  kind: 'vcf';
  /** Underlying Tone.Filter (alias of `runtime.filter` for legacy wire code). */
  filter: Tone.Filter;
  /** Runtime class instance — owns Tone.Filter lifecycle and setControl dispatch. */
  runtime: Vcf;
  cvAmt: number;
  baseCutoff: number;
  /** Scale node injected during wire() when a CV source is connected. */
  cvScale: Tone.Scale | null;
  /** Base resonance from the q knob (module units: Q for VCF, 0–1.8 for ladder). */
  baseQ: number;
  /** Q-CV depth from the q_cv_amt knob (module units, added to baseQ at full-scale CV). */
  qCvAmt: number;
  /** Scale node injected during wire() when a Q-CV source is connected. */
  qCvScale: Tone.Scale | null;
}
interface VcaNode extends BaseNode {
  kind: 'vca';
  runtime: Vca;
  /** Alias of `runtime.gain`. */
  gain: Tone.Gain;
  /** Sum of CV cable contributions (created via Tone.Gain when needed). */
  cvSum: Tone.Signal<'number'> | null;
}
interface EnvNode extends BaseNode {
  kind: 'envelope';
  runtime: Ahdsr;
  /** Alias of `runtime.env`. */
  env: Tone.Envelope;
  /** True when a cable drives the 'gate' input (otherwise: keyboard gates it). */
  gateDriven: boolean;
}
interface LfoNode extends BaseNode {
  kind: 'lfo';
  runtime: Lfo;
  /** Alias of `runtime.lfo`. */
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
interface MixerNode extends BaseNode {
  kind: 'mixer';
  /** Aantal kanalen (4 of 8). */
  channels: number;
  /** Per-kanaal volume-gain (Vol-knop). */
  inputs: Tone.Gain[];
  /** Per-kanaal stereo-panner (Pan-knop). */
  panners: Tone.Panner[];
  /** Gesommeerde stereo-uitgang (out_l/out_r). */
  out: Tone.Gain;
}
interface CvMathNode extends BaseNode {
  kind: 'cvmath';
  /** 0 = som (a·gA + b·gB + c·gC + offset), 1 = mult (a·b). */
  mode: number;
  gainA: number; gainB: number; gainC: number; offset: number;
  /** Connectbare CV-uitgang (de Multiply- of som-Gain-node). */
  out: Tone.ToneAudioNode;
  /** Aanwezig in mult-mode; null in som-mode. `factor` draagt de velocity/B-modulatie. */
  mult: Tone.Multiply | null;
  /** Hulp-Gain-nodes (per-input schaling in som-mode) — voor dispose. */
  extra: Tone.ToneAudioNode[];
}
interface MidiInNode extends BaseNode {
  kind: 'midiin';
  pitchTargets: string[];
  /** Envelope module-ids waarvan de gate-input aan onze gate-out hangt. */
  gateTargets: string[];
  /** CvMath module-ids waarvan een input (vel) aan onze vel-out hangt. */
  velTargets: string[];
  /** Sequencer module-ids waarvan voct_in aan onze pitch-out hangt. */
  seqVoctTargets: string[];
  /** Sequencer module-ids waarvan run_in aan onze gate-out hangt. */
  seqRunTargets: string[];
  /** Laatste gespeelde MIDI-noot (mono); null = release. */
  currentMidi: number | null;
}
interface SeqNode extends BaseNode {
  kind: 'sequencer';
  /** Computed step notes (semitones above root, length cap applied). */
  notes: number[];
  rateHz: number;
  gateRatio: number;
  /** Cached root knob value (used so V+ can override it without losing the per-step semitones). */
  rootBase: number;
  /** Run-mode: 0=Free (loop), 1=Off (passthrough), 2=Gate (wait for Run+ edge). */
  runMode: 0 | 1 | 2;
  /** Module-ids that this sequencer's gate is wired to (envelopes). */
  gateTargets: string[];
  /** Module-ids that this sequencer's CV is wired to (VCO voct inputs). */
  cvTargets: string[];
  /** Module-ids that this sequencer's trig-out is wired to (envelopes). */
  trigTargets: string[];
  intervalId: number | null;
  stepIdx: number;
  lastNote: number | null;
  /** Whether at least one connection from this sequencer exists. */
  active: boolean;
  /** Optional callback fired with 1-based step index on every step. */
  onStep?: (step1: number) => void;
  /** Cached transposition (semitones) coming from voct_in CV-input. */
  voctOffset: number;
  /** Tone.Meter listening on the V+ source (0..1 amplitude). */
  voctMeter: Tone.Meter | null;
  /** True when a run_in gate is wired (run is then engine-driven, not from toggle). */
  runDriven: boolean;
  /** When runDriven: latest gate-high state from run_in source. */
  runGate: boolean;
  /** Tone.Meter listening on the Run+ source (gate amplitude). */
  runMeter: Tone.Meter | null;
  /** External root from MIDI-IN→voct_in (overrides root knob); null = no MIDI source. */
  extVoctMidi: number | null;
  /** External gate from MIDI-IN→run_in (true = key held). */
  extGateActive: boolean;
  /** True if a MIDI-IN drives our voct_in (used to pick passthrough mechanism). */
  midiDrivenVoct: boolean;
  /** True if a MIDI-IN drives our run_in. */
  midiDrivenRun: boolean;
}
/** DX7 (msfa-wasm in een AudioWorklet). Krijgt note-events rechtstreeks
 *  van de engine — alle noten, niet alleen de laatste — en is intern poly. */
interface Dx7Node extends BaseNode {
  kind: 'dx7';
  runtime: Dx7;
}
/** Teensy-module als wasm in een AudioWorklet (Elements, Rings, Marbles…).
 *  Elke poort is een Tone.Gain; cv/gate zijn audio-rate signalen. */
interface WasmNode extends BaseNode {
  kind: 'wasm';
  runtime: WasmModule;
  /** voct/gate worden door een kabel, MIDI-In of sequencer gestuurd → klavier-fallback uit. */
  voctDriven: boolean;
  gateDriven: boolean;
  /** Module met eigen stemmen (sampler): krijgt élke noot los, niet één gate. */
  polyNotes: boolean;
}
type EngineNode = VcoNode | VcfNode | VcaNode | EnvNode | LfoNode | OutNode | MidiInNode | SeqNode | NoiseNode | EchoNode | PhaserNode | MixerNode | CvMathNode | Dx7Node | WasmNode;

/** Gate-poortnaam van een wasm-module ('gate' of 'trig'). */
function wasmGatePort(rt: WasmModule): string | null {
  return rt.hasInput('gate') ? 'gate' : rt.hasInput('trig') ? 'trig' : null;
}
/** Velocity-achtige ingang van een wasm-module. */
function wasmVelPort(rt: WasmModule): string | null {
  for (const p of ['vel', 'velocity', 'strength', 'accent_cv', 'accent']) if (rt.hasInput(p)) return p;
  return null;
}

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
  /** Wasm-PolyGroups in de simulator: master → leden (incl. master), en lid → master. */
  private wasmGroups = new Map<string, string[]>();
  private wasmFollowerOf = new Map<string, string>();
  /** Stem-allocator per wasm-node: vastgehouden noot en leeftijd (steal = oudste). */
  private wasmVoice = new Map<string, { note: number | null; age: number }>();
  private wasmAge = 0;

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
    // Niet-master-leden van PolyGroups: op de Teensy elk één stem, hier
    // zou dat unisono worden. De DX7-node is zelf al poly, dus alleen de
    // master (members[0]) krijgt een node.
    const polyVoiceIds = new Set<string>();
    this.wasmGroups.clear(); this.wasmFollowerOf.clear(); this.wasmVoice.clear();
    for (const r of racks) for (const g of r.polyGroups ?? []) {
      const ids = g.members.filter((mem) => mem.kind === 'module').map((mem) => mem.moduleId);
      if (ids.length < 2) continue;
      const masterType = project.modules.find((m) => m.id === ids[0])?.typeId ?? '';
      if (WasmModule.supports(masterType)) {
        // Wasm-groep: élk lid krijgt een node; de allocator verdeelt de noten
        // (zoals polyExpand + MidiIn op de Teensy).
        this.wasmGroups.set(ids[0]!, ids);
        for (const id of ids.slice(1)) this.wasmFollowerOf.set(id, ids[0]!);
      } else {
        for (const id of ids.slice(1)) polyVoiceIds.add(id);
      }
    }
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
      const tRaw = project.moduleTypes.find((x) => x.id === m.typeId);
      if (!tRaw) continue;
      if (tRaw.id === Dx7.typeId && polyVoiceIds.has(m.id)) continue;   // DX7 is intern poly
      // ADR 0009 — external simulation proxy. If the type declares a
      // `simulatedBy`, resolve to the proxy type and remap controls; the
      // engine then treats this external module as if it were the proxy.
      let t = tRaw;
      let ctrl = (patch.controlState[m.id] ?? {}) as Record<string, ControlValue>;
      // Wasm-follower: knopstanden van de master als basis (poly-fan-out).
      const wasmMaster = this.wasmFollowerOf.get(m.id);
      if (wasmMaster) ctrl = { ...(patch.controlState[wasmMaster] ?? {}), ...ctrl } as Record<string, ControlValue>;
      let controlMap: Record<string, string> | undefined;
      if (tRaw.simulatedBy) {
        const proxy = project.moduleTypes.find((x) => x.id === tRaw.simulatedBy);
        if (proxy) {
          t = proxy;
          const map = tRaw.simulationControlMap ?? {};
          controlMap = map;
          const remapped: Record<string, ControlValue> = {};
          for (const [k, v] of Object.entries(ctrl)) {
            const mapped = map[k];
            if (mapped !== undefined) remapped[mapped] = v;
            else if (proxy.controls.some((c) => c.id === k)) remapped[k] = v;
          }
          ctrl = remapped;
        }
      }
      const cat = project.categories.find((c) => c.id === t.categoryId);
      const kind = String(cat?.kind ?? '');
      const node = this.makeNode(kind, m, t, ctrl, controlMap);
      if (node) {
        this.nodes.set(m.id, node);
        // Seed afgeleide UI-velden zoals BPM zodat de display niet leeg
        // blijft tot de gebruiker Rate aanraakt.
        if (node.kind === 'sequencer') {
          this.status.liveControls[m.id] = {
            ...(this.status.liveControls[m.id] ?? {}),
            __rateBpm: Math.round(node.rateHz * 15),
            __runActive: node.runMode === 0 ? 1 : 0,
          };
        }
      }
    }

    // 3. Wire connections.
    this.connections = patch.connections;
    const simConns = this.expandPolyForSim(patch.connections);
    for (const conn of simConns) this.wire(conn);

    // 4. Detect which VCOs are voct-driven and which envelopes are gate-driven
    //    door *actieve* bronnen (sequencer met run=true, of MIDI-In).
    for (const conn of simConns) {
      const src = this.nodes.get(conn.from.moduleId);
      const dst = this.nodes.get(conn.to.moduleId);
      if (!src || !dst) continue;
      const srcIsActive =
        src.kind === 'midiin' ||
        (src.kind === 'sequencer' && src.runMode !== 1);
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
      if (node.kind === 'sequencer' && node.active && this.shouldRunSeq(node)) this.startSequencer(node);
    }
    this.status.running = true;
    this.emit();
    this.tickMeter();
  }

  stop(): void {
    for (const node of this.nodes.values()) {
      if (node.kind === 'sequencer') this.stopSequencer(node);
      if (node.kind === 'envelope') node.env.triggerRelease();
      if (node.kind === 'dx7') node.runtime.allOff();
      if (node.kind === 'wasm' && node.polyNotes) node.runtime.allNotesOff();
      if (node.kind === 'wasm') { const p = wasmGatePort(node.runtime); if (p) node.runtime.setInput(p, 0); }
      if (node.kind === 'noise') { try { node.noise.stop(); } catch { /* ignore */ } }
    }
    for (const o of this.startedOscs) {
      try { o.stop(); } catch { /* ignore */ }
    }
    this.startedOscs.clear();
    this.wasmVoice.forEach((v) => { v.note = null; });
    this.currentKeyboardNote = null;
    this.status.running = false;
    this.status.level = 0;
    this.status.voiceFreqHz = 0;
    this.emit();
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  noteOn(midi: number, velocity = 0.9): void {
    this.currentKeyboardNote = midi;
    const freq = midiToHz(midi);
    this.status.lastNote = { midi, vel: Math.round(clamp(velocity, 0, 1) * 127), ts: Date.now(), on: true };

    // DX7-nodes krijgen élke noot (intern poly); zie Dx7.ts. Wasm-modules met
    // een eigen stemmenset (de sampler) net zo: één gate-flank kan maar één
    // toonhoogte dragen, dus zonder dit blijft zo'n module monofoon hoe veel
    // stemmen hij intern ook heeft.
    for (const node of this.nodes.values()) {
      if (node.kind === 'dx7') node.runtime.noteOn(midi, velocity);
      else if (node.kind === 'wasm' && node.polyNotes) node.runtime.noteOn(midi, velocity);
    }
    const wasmDone = new Set<string>();   // één allocatie per wasm-groep per noot

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
          } else if (n?.kind === 'wasm' && !n.polyNotes) {
            this.wasmNoteOn(n.moduleId, midi, velocity, wasmDone);
          }
        }
        for (const tgt of mi.gateTargets) {
          const n = this.nodes.get(tgt);
          if (n?.kind === 'envelope') n.env.triggerAttack();
          else if (n?.kind === 'wasm' && !n.polyNotes) this.wasmNoteOn(n.moduleId, midi, velocity, wasmDone);
        }
        // Velocity → CvMath-factor (mult-mode): bepaalt de VCA-amplitude per noot.
        for (const tgt of mi.velTargets) {
          const cm = this.nodes.get(tgt);
          // Spiegelt firmware-mult: factor = velocity × gain_b.
          if (cm?.kind === 'cvmath' && cm.mult) cm.mult.factor.rampTo(clamp(velocity, 0, 1) * cm.gainB, 0.005);
          else if (cm?.kind === 'wasm') { const p = wasmVelPort(cm.runtime); if (p) cm.runtime.setInput(p, clamp(velocity, 0, 1)); }
        }
        for (const tgt of mi.seqVoctTargets) {
          const seq = this.nodes.get(tgt);
          if (seq?.kind !== 'sequencer') continue;
          seq.extVoctMidi = midi;
          if (seq.runMode === 1) {
            // Off / passthrough: V+ note → seq.cv_out targets directly.
            for (const vTgt of seq.cvTargets) {
              const vco = this.nodes.get(vTgt);
              if (vco?.kind === 'vco') {
                const off = readKnob(vco.controls, 'coarse', 0) + readKnob(vco.controls, 'fine', 0) / 100;
                vco.osc.frequency.rampTo(midiToHz(midi + off), 0.005);
              }
            }
          }
        }
        for (const tgt of mi.seqRunTargets) {
          const seq = this.nodes.get(tgt);
          if (seq?.kind !== 'sequencer') continue;
          const wasActive = seq.extGateActive;
          seq.extGateActive = true;
          if (seq.runMode === 1) {
            // Off / passthrough: gate-on → trigger seq.gate_out targets.
            for (const gTgt of seq.gateTargets) {
              const env = this.nodes.get(gTgt);
              if (env?.kind === 'envelope') env.env.triggerAttack();
            }
          } else if (seq.runMode === 2 && !wasActive) {
            // Gate mode: rising edge → reset and start.
            seq.stepIdx = 0;
            if (seq.intervalId === null && seq.active) this.startSequencer(seq);
          }
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
      if (node.kind === 'wasm' && !node.polyNotes && !node.gateDriven && !this.wasmFollowerOf.has(node.moduleId)) {
        this.wasmNoteOn(node.moduleId, midi, velocity, wasmDone);
      }
    }
    this.status.voiceFreqHz = freq;
    this.emit();
  }

  noteOff(midi: number): void {
    if (this.status.lastNote?.midi === midi) this.status.lastNote = { ...this.status.lastNote, on: false };
    for (const node of this.nodes.values()) {
      if (node.kind === 'dx7') node.runtime.noteOff(midi);
      else if (node.kind === 'wasm' && node.polyNotes) node.runtime.noteOff(midi);
    }
    if (this.currentKeyboardNote !== midi) return;
    // MIDI-In dispatch.
    for (const node of this.nodes.values()) {
      if (node.kind === 'midiin' && node.currentMidi === midi) {
        node.currentMidi = null;
        for (const tgt of node.gateTargets) {
          const n = this.nodes.get(tgt);
          if (n?.kind === 'envelope') n.env.triggerRelease();
          else if (n?.kind === 'wasm' && !n.polyNotes) this.wasmNoteOff(n.moduleId, midi);
        }
        // Forward release to connected sequencers.
        for (const tgt of node.seqRunTargets) {
          const seq = this.nodes.get(tgt);
          if (seq?.kind !== 'sequencer') continue;
          seq.extGateActive = false;
          if (seq.runMode === 1) {
            for (const gTgt of seq.gateTargets) {
              const env = this.nodes.get(gTgt);
              if (env?.kind === 'envelope') env.env.triggerRelease();
            }
          } else if (seq.runMode === 2) {
            // Gate mode: gate low → stop sequencer + release any open gate.
            if (seq.intervalId !== null) this.stopSequencer(seq);
            for (const gTgt of seq.gateTargets) {
              const env = this.nodes.get(gTgt);
              if (env?.kind === 'envelope') env.env.triggerRelease();
            }
          }
        }
      }
    }
    // Fallback.
    for (const node of this.nodes.values()) {
      if (node.kind === 'envelope' && !node.gateDriven) node.env.triggerRelease();
      if (node.kind === 'wasm' && !node.polyNotes && !node.gateDriven && !this.wasmFollowerOf.has(node.moduleId)) this.wasmNoteOff(node.moduleId, midi);
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
    // Remap external-module control IDs (e.g. RS-110 'freq' → 'cutoff').
    if (node.controlMap) {
      const mapped = node.controlMap[controlId];
      if (mapped !== undefined) controlId = mapped;
    }
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
        if (controlId === 'detune') { node.runtime.setControl('detune', num); return true; }
        // FM-VCO: FM-diepte (octaven) en level lopen live via de runtime.
        if (controlId === 'fm_amt' || controlId === 'level') { node.runtime.setControl(controlId, num); return true; }
        return true;
      }
      case 'dx7': {
        node.runtime.setControl(controlId, value);
        return true;
      }
      case 'wasm': {
        node.runtime.setControl(controlId, value);
        // Master van een PolyGroup: knop waaiert uit naar de followers.
        for (const fid of this.wasmGroups.get(node.moduleId) ?? []) {
          if (fid === node.moduleId) continue;
          const f = this.nodes.get(fid);
          if (f?.kind === 'wasm') f.runtime.setControl(controlId, value);
        }
        return true;
      }
      case 'vcf': {
        if (controlId === 'type') {
          // MS-20 switches LP/HP live (runtime flips Tone.Filter.type);
          // the SVF VCF needs a rebuild (output-channel mapping).
          if (node.type.id === Ms20.typeId) { node.runtime.setControl('type', num); return true; }
          return false;
        }
        if (controlId === 'cutoff') {
          node.baseCutoff = num;
          if (node.cvScale) {
            // filter.frequency is overridden by the CV Scale; update the scale
            // range so modulation depth tracks the new cutoff, but do NOT call
            // rampTo on the overridden Signal (Tone.js throws a RangeError).
            node.cvScale.max = num * 8 * node.cvAmt;
          } else {
            node.runtime.setControl('cutoff', num);
          }
          return true;
        }
        if (controlId === 'q' || controlId === 'res') {
          node.baseQ = num;
          if (node.qCvScale) {
            // filter.Q is overridden by the Q-CV Scale; shift the scale range
            // instead (same pattern as cutoff above).
            node.qCvScale.min = node.runtime.resonanceToQ(num);
            node.qCvScale.max = node.runtime.resonanceToQ(num + node.qCvAmt);
          } else {
            node.runtime.setControl('q', num);
          }
          return true;
        }
        if (controlId === 'q_cv_amt') {
          node.qCvAmt = num;
          if (node.qCvScale) node.qCvScale.max = node.runtime.resonanceToQ(node.baseQ + num);
          return true;
        }
        if (controlId === 'drive') { node.runtime.setControl('drive', num); return true; }
        if (controlId === 'cv_amt') {
          const octaveCv = node.type.id === Ladder.typeId || node.type.id === Ms20.typeId;
          node.cvAmt = octaveCv ? clamp(num / 7, 0, 1) : num;
          return true;
        }
        return true;
      }
      case 'vca': {
        if (controlId === 'gain' || controlId === 'level') {
          node.runtime.setControl(controlId, clamp(num, 0, 1));
          return true;
        }
        return true;
      }
      case 'envelope': {
        if (controlId === 'attack' || controlId === 'hold' || controlId === 'decay'
         || controlId === 'sustain' || controlId === 'release') {
          node.runtime.setControl(controlId, num);
          return true;
        }
        return true;
      }
      case 'lfo': {
        if (controlId === 'wave' || controlId === 'shape') return false;
        if (controlId === 'rate' || controlId === 'freq')   { node.runtime.setControl('rate', num);  return true; }
        if (controlId === 'depth' || controlId === 'amount'){ node.runtime.setControl('depth', num); return true; }
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
          node.rootBase = root;
          return true;
        }
          if (controlId === 'rate') {
            node.rateHz = clamp(num, 0.5, 16);
            // BPM = rate(Hz) * 60 / 4   (één step = 16e noot, 4 steps per beat).
            this.status.liveControls[node.moduleId] = {
              ...(this.status.liveControls[node.moduleId] ?? {}),
              __rateBpm: Math.round(node.rateHz * 15),
            };
            // Herstart interval met nieuwe rate als hij draait.
            if (node.intervalId !== null) {
              window.clearInterval(node.intervalId);
              node.intervalId = null;
              if (node.active && this.shouldRunSeq(node)) this.startSequencer(node);
            }
            return true;
          }
        if (controlId === 'gate') { node.gateRatio = clamp(num, 0.05, 0.95); return true; }
        if (controlId === 'run') {
          // 3-stand switch: 0=Free, 1=Off, 2=Gate. Legacy boolean true → 0.
          const mode: 0 | 1 | 2 = typeof value === 'number'
            ? (Math.max(0, Math.min(2, Math.round(value))) as 0 | 1 | 2)
            : (value === false ? 1 : 0);
          node.runMode = mode;
          // Live LED-binding: groen wanneer pattern daadwerkelijk loopt.
          this.status.liveControls[node.moduleId] = {
            ...(this.status.liveControls[node.moduleId] ?? {}),
            __runActive: mode === 0 ? 1 : 0,
          };
          if (node.intervalId !== null) this.stopSequencer(node);
          if (node.active && this.shouldRunSeq(node)) this.startSequencer(node);
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
        case 'vco': node.runtime.dispose(); break;
        case 'dx7': node.runtime.dispose(); break;
        case 'wasm': node.runtime.dispose(); break;
        case 'vcf': node.runtime.dispose(); node.cvScale?.dispose(); node.qCvScale?.dispose(); break;
        case 'vca': node.runtime.dispose(); node.cvSum?.dispose(); break;
        case 'envelope': node.runtime.dispose(); break;
        case 'lfo': node.runtime.dispose(); break;
        case 'out': node.inGain.dispose(); break;
        case 'noise': node.noise.dispose(); node.level.dispose(); break;
        case 'echo': node.delay.dispose(); node.wetGain.dispose(); node.dryGain.dispose(); node.input.dispose(); node.output.dispose(); break;
        case 'phaser': node.phaser.dispose(); node.wetGain.dispose(); node.dryGain.dispose(); node.input.dispose(); node.output.dispose(); break;
        case 'mixer': node.inputs.forEach((g) => g.dispose()); node.panners.forEach((p) => p.dispose()); node.out.dispose(); break;
        case 'cvmath': node.out.dispose(); node.extra.forEach((g) => g.dispose()); break;
        case 'sequencer': /* no Tone nodes */
          if (node.voctMeter) { try { node.voctMeter.dispose(); } catch { /* ignore */ } }
          if (node.runMeter)  { try { node.runMeter.dispose();  } catch { /* ignore */ } }
          break;
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
    kind: string, m: ModuleInstance, t: ModuleType, controls: Record<string, ControlValue>,
    controlMap?: Record<string, string>,
  ): EngineNode | null {
    const base = { moduleId: m.id, type: t, controls, controlMap };
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
    if (t.id === 'tp_mmb_cvmath') {
      // CV-combinator. Mult-mode (a·b) drijft de seed: envAmp · velocity → VCA.cv.
      const mode   = Math.round(readKnob(controls, 'mode', 0));
      const gainA  = readKnob(controls, 'gain_a', 1);
      const gainB  = readKnob(controls, 'gain_b', 1);
      const gainC  = readKnob(controls, 'gain_c', 1);
      const offset = readKnob(controls, 'offset', 0);
      if (mode === 1) {
        const mult = new Tone.Multiply(1);
        return { ...base, kind: 'cvmath', mode, gainA, gainB, gainC, offset, out: mult, mult, extra: [] };
      }
      const sum = new Tone.Gain(1);
      return { ...base, kind: 'cvmath', mode, gainA, gainB, gainC, offset, out: sum, mult: null, extra: [] };
    }
    if (t.id === 'tp_mmb_mixer' || t.id === 'tp_mmb_mixer8' || t.id === 'tp_mmb_mixer16') {
      const channels = t.id === 'tp_mmb_mixer16' ? 16 : t.id === 'tp_mmb_mixer8' ? 8 : 4;
      const out = new Tone.Gain(1);
      const inputs: Tone.Gain[] = [];
      const panners: Tone.Panner[] = [];
      for (let i = 1; i <= channels; ++i) {
        const vol = clamp(readKnob(controls, `vol${i}`, 0.8), 0, 1);
        const pan = clamp(readKnob(controls, `pan${i}`, 0), -1, 1);
        const g = new Tone.Gain(vol);
        const p = new Tone.Panner(pan);
        g.connect(p); p.connect(out);
        inputs.push(g); panners.push(p);
      }
      return { ...base, kind: 'mixer', channels, inputs, panners, out };
    }
    // DX7: eigen node-soort (worklet), los van de Tone-VCO's.
    if (t.id === Dx7.typeId) {
      const rt = registry.create(t, m, controls) as Dx7;
      return { ...base, kind: 'dx7', runtime: rt };
    }
    // Teensy-modules als wasm (Elements, Rings, Marbles, Stages, Peaks, …).
    if (WasmModule.supports(t.id)) {
      const rt = registry.create(t, m, controls) as WasmModule;
      return {
        ...base, kind: 'wasm', runtime: rt, voctDriven: false, gateDriven: false,
        polyNotes: WasmModule.isPoly(t.id),
      };
    }
    switch (kind) {
      case 'vco': {
        if (!registry.has(t.id)) return null;
        const rt = registry.create(t, m, controls) as Vco;
        return { ...base, kind: 'vco', runtime: rt, osc: rt.osc, baseMidi: 57, voctDriven: false };
      }
      case 'vcf': {
        if (!registry.has(t.id)) return null;
        // Ladder & MS-20 cv_amt is in octaves (0–7); normalize to the 0–1
        // depth the cutoff-CV Scale wiring expects. The VCF knob is already 0–1.
        const octaveCvAmt = t.id === Ladder.typeId || t.id === Ms20.typeId;
        const cvAmtRaw = readKnob(controls, 'cv_amt', 1);
        const cvAmt = octaveCvAmt ? clamp(cvAmtRaw / 7, 0, 1) : clamp(cvAmtRaw, 0, 1);
        const rt = registry.create(t, m, controls) as Vcf;
        const baseCutoff = clamp(readKnob(controls, 'cutoff', 2000), 20, 18000);
        const baseQ = readKnob(controls, 'q', 0.7);
        const qCvAmt = readKnob(controls, 'q_cv_amt', 0);
        return { ...base, kind: 'vcf', runtime: rt, filter: rt.filter, cvAmt, baseCutoff, cvScale: null,
                 baseQ, qCvAmt, qCvScale: null };
      }
      case 'vca': {
        if (!registry.has(t.id)) return null;
        const rt = registry.create(t, m, controls) as Vca;
        return { ...base, kind: 'vca', runtime: rt, gain: rt.gain, cvSum: null };
      }
      case 'envelope': {
        if (!registry.has(t.id)) return null;
        const rt = registry.create(t, m, controls) as Ahdsr;
        return { ...base, kind: 'envelope', runtime: rt, env: rt.env, gateDriven: false };
      }
      case 'lfo': {
        if (!registry.has(t.id)) return null;
        const rt = registry.create(t, m, controls) as Lfo;
        return { ...base, kind: 'lfo', runtime: rt, lfo: rt.lfo };
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
            pitchTargets: [], gateTargets: [], velTargets: [],
            seqVoctTargets: [], seqRunTargets: [],
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
        // Run is now a 3-pos switch (0=Free, 1=Off, 2=Gate). Legacy boolean true → 0 (Free).
        const runRaw = controls['run'];
        const runMode: 0 | 1 | 2 = typeof runRaw === 'number'
          ? (Math.max(0, Math.min(2, Math.round(runRaw))) as 0 | 1 | 2)
          : (runRaw === false ? 1 : 0);
        return {
          ...base, kind: 'sequencer',
          notes, rateHz: rate, gateRatio: gate,
          rootBase: root,
          runMode,
          gateTargets: [], cvTargets: [], trigTargets: [],
          intervalId: null, stepIdx: 0, lastNote: null,
          active: false,
          voctOffset: 0,
          voctMeter: null,
          runDriven: false,
          runGate: false,
          runMeter: null,
          extVoctMidi: null,
          extGateActive: false,
          midiDrivenVoct: false,
          midiDrivenRun: false,
        };
      }
      default:
        return null;
    }
  }

  /** PolyGroups van wasm-modules zoals polyExpand ze voor de firmware uitvouwt:
   *  global → groep = fan-out, groep → global = genummerde sink (in1 → in1..inN)
   *  of som, groep → groep = stem v → stem v. MIDI-In en sequencer blijven op
   *  de master: de stem-allocator kiest daar de stem. */
  private expandPolyForSim(conns: PatchConnection[]): PatchConnection[] {
    if (this.wasmGroups.size === 0) return conns;
    const out: PatchConnection[] = [];
    const numbered = (id: string): { base: string; num: number } | null => {
      const m = /^(.*?)(\d+)$/.exec(id);
      return m ? { base: m[1]!, num: Number(m[2]) } : null;
    };
    for (const c of conns) {
      const sg = this.wasmGroups.get(c.from.moduleId);
      const dg = this.wasmGroups.get(c.to.moduleId);
      const srcNode = this.nodes.get(c.from.moduleId);
      const srcIsEvent = srcNode?.kind === 'midiin' || srcNode?.kind === 'sequencer';
      if (!sg && dg && !srcIsEvent) {
        dg.forEach((id, v) => out.push({ ...c, id: `${c.id}#v${v}`, to: { moduleId: id, portId: c.to.portId } }));
      } else if (sg && !dg) {
        const n = numbered(c.to.portId);
        sg.forEach((id, v) => out.push({
          ...c, id: `${c.id}#v${v}`,
          from: { moduleId: id, portId: c.from.portId },
          to: { moduleId: c.to.moduleId, portId: n ? `${n.base}${n.num + v}` : c.to.portId },
        }));
      } else if (sg && dg && sg.length === dg.length) {
        sg.forEach((id, v) => out.push({
          ...c, id: `${c.id}#v${v}`,
          from: { moduleId: id, portId: c.from.portId },
          to: { moduleId: dg[v]!, portId: c.to.portId },
        }));
      } else {
        out.push(c);
      }
    }
    return out;
  }

  /** Stem kiezen in de groep van `id` (master of losse module) en de noot aanzetten:
   *  zelfde noot → hertrigger, anders vrije stem, anders de oudste stelen. */
  private wasmNoteOn(id: string, midi: number, velocity: number, done?: Set<string>): void {
    const master = this.wasmFollowerOf.get(id) ?? id;
    if (done) { if (done.has(master)) return; done.add(master); }
    const members = this.wasmGroups.get(master) ?? [master];
    let pick: string | null = null;
    for (const m of members) if (this.wasmVoice.get(m)?.note === midi) { pick = m; break; }
    if (!pick) for (const m of members) if ((this.wasmVoice.get(m)?.note ?? null) === null) { pick = m; break; }
    if (!pick) {
      let best = Infinity;
      for (const m of members) { const a = this.wasmVoice.get(m)?.age ?? 0; if (a < best) { best = a; pick = m; } }
    }
    const node = pick ? this.nodes.get(pick) : undefined;
    if (!pick || !node || node.kind !== 'wasm') return;
    // Module met eigen stemmen (sampler): geef de noot door in plaats van
    // gate/voct te zetten. Zo speelt ook een sequencer er akkoorden op.
    if (node.polyNotes) { node.runtime.noteOn(midi, velocity); return; }
    this.wasmVoice.set(pick, { note: midi, age: ++this.wasmAge });
    const rt = node.runtime;
    if (rt.hasInput('voct') && !rt.cabled.has('voct')) rt.setInput('voct', (midi - 60) / 12);
    const vp = wasmVelPort(rt);
    if (vp && !rt.cabled.has(vp)) rt.setInput(vp, clamp(velocity, 0, 1));
    const gp = wasmGatePort(rt);
    if (gp) rt.setInput(gp, 1);
  }
  /** Noot loslaten in de groep van `id` (midi null = alle stemmen). */
  private wasmNoteOff(id: string, midi: number | null): void {
    const self = this.nodes.get(id);
    if (self?.kind === 'wasm' && self.polyNotes) {
      if (midi === null) self.runtime.allNotesOff(); else self.runtime.noteOff(midi);
      return;
    }
    const master = this.wasmFollowerOf.get(id) ?? id;
    for (const m of this.wasmGroups.get(master) ?? [master]) {
      const st = this.wasmVoice.get(m);
      if (midi !== null && st?.note !== midi) continue;
      const node = this.nodes.get(m);
      if (node?.kind === 'wasm') { const gp = wasmGatePort(node.runtime); if (gp) node.runtime.setInput(gp, 0); }
      if (st) st.note = null;
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
      // Mixer-uitgang is stereo via één Gain-node; out_l en out_r wijzen naar
      // dezelfde node. Sluit alleen out_l aan zodat de OUT niet dubbel telt.
      if (src.kind === 'mixer' && conn.from.portId === 'out_r') return;
      const outNode = audioOutputOf(src, conn.from.portId);
      const inNode  = audioInputOf(dst, conn.to.portId);
      if (outNode && inNode) {
        if (src.kind === 'wasm' && dst.kind === 'wasm') {
          // Zie de cv/gate-tak: wasm→wasm altijd via een DelayNode tegen lus-demping.
          const d = new Tone.Delay(128 / Tone.getContext().sampleRate);
          outNode.connect(d); d.connect(inNode);
          dst.runtime.extra.push(d);
        } else {
          outNode.connect(inNode);
        }
        if (dst.kind === 'wasm') dst.runtime.markCabled(conn.to.portId);
      }
      return;
    }

    // ── cv/gate → wasm-module: alles is signaal in de worklet ──
    if (dst.kind === 'wasm' && (srcSig === 'cv' || srcSig === 'gate' || srcSig === 'trigger')) {
      const toPort = conn.to.portId;
      if (src.kind === 'midiin') {
        if (srcSig === 'cv' && toPort === 'voct') { src.pitchTargets.push(dst.moduleId); dst.voctDriven = true; }
        else if (srcSig === 'cv') { src.velTargets.push(dst.moduleId); }
        else { src.gateTargets.push(dst.moduleId); dst.gateDriven = true; }
        return;
      }
      if (src.kind === 'sequencer') {
        if (srcSig === 'cv') { src.cvTargets.push(dst.moduleId); dst.voctDriven = true; src.active = true; }
        else if (conn.from.portId === 'trig') { src.trigTargets.push(dst.moduleId); dst.gateDriven = true; src.active = true; }
        else { src.gateTargets.push(dst.moduleId); dst.gateDriven = true; src.active = true; }
        return;
      }
      const out = cvOutputOf(src, conn.from.portId) ?? audioOutputOf(src, conn.from.portId);
      const g = dst.runtime.inGain(toPort);
      if (out && g) {
        if (src.kind === 'wasm') {
          // Web Audio dempt een lus zonder DelayNode (Stages.eoc → Marbles.clock
          // → … → Stages.gate, of eoc → eigen gate). Eén render-quantum
          // vertraging (~2,7 ms) houdt zulke zelfspelende patches in leven.
          const d = new Tone.Delay(128 / Tone.getContext().sampleRate);
          out.connect(d); d.connect(g);
          dst.runtime.extra.push(d);
        } else {
          out.connect(g);
        }
        dst.runtime.markCabled(toPort);
        if (toPort === 'voct') dst.voctDriven = true;
        if (toPort === 'gate' || toPort === 'trig') dst.gateDriven = true;
      }
      return;
    }

    // ── cv → AudioParam (VCF cutoff, VCA gain) ──
    if (srcSig === 'cv') {
      // CV → CvMath-input (a/b/c). De CvMath-uitgang voedt daarna VCA/VCF.cv.
      if (dst.kind === 'cvmath') {
        const port = conn.to.portId; // 'a' | 'b' | 'c'
        // Velocity uit MIDI-In is geen continu signaal → de dispatcher zet de factor.
        if (src.kind === 'midiin') { src.velTargets.push(dst.moduleId); return; }
        const out = cvOutputOf(src, conn.from.portId);
        if (!out) return;
        if (dst.mode === 1 && dst.mult) {
          // mult: 'a' → hoofdingang, 'b' → factor (signaal-gestuurde modulatie).
          // Beide eerst door hun gain — spiegelt firmware (a·gain_a)×(b·gain_b).
          const g = port === 'b' ? dst.gainB : dst.gainA;
          const scaler = new Tone.Gain(g);
          out.connect(scaler);
          if (port === 'b') scaler.connect(dst.mult.factor); else scaler.connect(dst.mult);
          dst.extra.push(scaler);
        } else {
          const g = port === 'b' ? dst.gainB : port === 'c' ? dst.gainC : dst.gainA;
          const scaler = new Tone.Gain(g);
          out.connect(scaler); scaler.connect(dst.out);
          dst.extra.push(scaler);
        }
        return;
      }
      if (dst.kind === 'vca' && conn.to.portId === 'cv') {
        // Envelope/LFO outputs are 0..1 → add to the gain knob's base value.
        const out = cvOutputOf(src, conn.from.portId);
        if (out) out.connect(dst.gain.gain);
        return;
      }
      if (dst.kind === 'vcf' && conn.to.portId === 'cv') {
        // Map 0..1 CV → cutoff multiplier (1x..16x = 4 octaves up). We use
        // Tone.Scale to translate the 0..1 signal into a freq-offset.
        const out = cvOutputOf(src, conn.from.portId);
        if (!out) return;
        const scale = new Tone.Scale(0, dst.baseCutoff * 8 * dst.cvAmt);
        out.connect(scale);
        scale.connect(dst.filter.frequency);
        dst.cvScale = scale;
        return;
      }
      if (dst.kind === 'vcf' && conn.to.portId === 'q_cv') {
        // Map 0..1 CV → resonance offset on top of the Q knob: baseQ at CV 0,
        // baseQ + q_cv_amt at full-scale. resonanceToQ translates module
        // resonance units to the biquad Q param (1:1 for the VCF, mapped for
        // the ladder). Connecting the Scale overrides filter.Q (Tone.js).
        const out = cvOutputOf(src, conn.from.portId);
        if (!out) return;
        const scale = new Tone.Scale(
          dst.runtime.resonanceToQ(dst.baseQ),
          dst.runtime.resonanceToQ(dst.baseQ + dst.qCvAmt),
        );
        out.connect(scale);
        scale.connect(dst.filter.Q);
        dst.qCvScale = scale;
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
      // CV → sequencer V+ : transponeer alle stappen of override root via V+.
      if (dst.kind === 'sequencer' && conn.to.portId === 'voct_in') {
        if (src.kind === 'midiin') {
          // MIDI-IN heeft geen Tone.Signal; we volgen de live noot via de
          // dispatcher (zie midiInDispatcher).
          src.seqVoctTargets.push(dst.moduleId);
          dst.midiDrivenVoct = true;
          dst.active = true;
          return;
        }
        const out = cvOutputOf(src, conn.from.portId);
        if (!out) return;
        const meter = new Tone.Meter({ normalRange: true, smoothing: 0 });
        out.connect(meter);
        dst.voctMeter = meter;
        return;
      }
    }

    // ── trigger → sequencer.run_in (gate-override van Run-toggle) ──
    if ((srcSig === 'gate' || srcSig === 'trigger') && dst.kind === 'sequencer' && conn.to.portId === 'run_in') {
      if (src.kind === 'midiin') {
        src.seqRunTargets.push(dst.moduleId);
        dst.midiDrivenRun = true;
        dst.runDriven = true;
        dst.active = true;
        return;
      }
      const out = cvOutputOf(src, conn.from.portId) ?? audioOutputOf(src, conn.from.portId);
      if (!out) return;
      const meter = new Tone.Meter({ normalRange: true, smoothing: 0 });
      out.connect(meter);
      dst.runDriven = true;
      dst.runMeter = meter;
      // Forceer evaluatie elke tick: start altijd, runGate gating gebeurt in step().
      dst.active = true;
      return;
    }

    // ── sequencer.trig → envelope (korte puls per step) ──
    if (srcSig === 'trigger' && src.kind === 'sequencer' && conn.from.portId === 'trig'
        && dst.kind === 'envelope' && conn.to.portId === 'gate') {
      src.trigTargets.push(dst.moduleId);
      src.active = true;
      return;
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

  /**
   * Of een sequencer in zijn huidige runMode + extern-gate-state moet draaien.
   * - Free  : altijd
   * - Off   : nooit (passthrough loopt direct via dispatcher)
   * - Gate  : alleen als de externe gate hoog is
   */
  private shouldRunSeq(seq: SeqNode): boolean {
    if (seq.runMode === 0) return true;
    if (seq.runMode === 1) return false;
    // runMode === 2 (Gate)
    if (seq.midiDrivenRun) return seq.extGateActive;
    if (seq.runMeter) {
      const v = Number(seq.runMeter.getValue());
      return Number.isFinite(v) && v > 0.3;
    }
    // Geen Run+ wire \u00e9n Gate-stand: niets te doen.
    return false;
  }

  private startSequencer(seq: SeqNode): void {
    if (seq.intervalId !== null) return;
    if (seq.runMode === 1) return;
    const intervalMs = 1000 / seq.rateHz;
    const step = (): void => {
      // Run+ override (signal-meter pad): laat interval doorlopen,
      // maar sla de step over zolang de gate laag is.
      if (seq.runMode === 0 && seq.runDriven && seq.runMeter) {
        const v = Number(seq.runMeter.getValue());
        seq.runGate = Number.isFinite(v) && v > 0.3;
        if (!seq.runGate) {
          if (seq.lastNote !== null) {
            for (const tgt of seq.gateTargets) {
              const env = this.nodes.get(tgt);
              if (env?.kind === 'envelope') env.env.triggerRelease();
            }
            seq.lastNote = null;
          }
          return;
        }
      }
      // Gate-mode: stop interval zodra externe gate weg valt.
      if (seq.runMode === 2 && !this.shouldRunSeq(seq)) {
        if (seq.lastNote !== null) {
          for (const tgt of seq.gateTargets) {
            const env = this.nodes.get(tgt);
            if (env?.kind === 'envelope') env.env.triggerRelease();
          }
          seq.lastNote = null;
        }
        this.stopSequencer(seq);
        return;
      }
      // V+ root-override: MIDI-IN \u2192 absolute root; signal-meter \u2192 \u00b112 semis offset.
      let rootOverride: number | null = null;
      if (seq.midiDrivenVoct && seq.extVoctMidi !== null) {
        rootOverride = seq.extVoctMidi;
      }
      if (seq.voctMeter) {
        const v = Number(seq.voctMeter.getValue());
        seq.voctOffset = Number.isFinite(v) ? Math.round((v - 0.5) * 24) : 0;
      } else {
        seq.voctOffset = 0;
      }
      // Release previous gate (note off on connected envelopes).
      if (seq.lastNote !== null) {
        for (const tgt of seq.gateTargets) {
          const env = this.nodes.get(tgt);
          if (env?.kind === 'envelope') env.env.triggerRelease();
        }
        seq.lastNote = null;
      }
      // Trigger the new step.
      const absNote = seq.notes[seq.stepIdx % seq.notes.length]!;
      const semisAboveRoot = absNote - seq.rootBase;
      const effectiveRoot = rootOverride ?? seq.rootBase;
      const note = effectiveRoot + semisAboveRoot + seq.voctOffset;
      seq.lastNote = note;
      const step1 = (seq.stepIdx % seq.notes.length) + 1;
      seq.stepIdx++;
      // Write live step-index for UI (step-LEDs / display).
      this.status.liveControls[seq.moduleId] = {
        ...(this.status.liveControls[seq.moduleId] ?? {}),
        __currentStep: step1,
        __runActive: 1,
      };

      const seqDone = new Set<string>();
      // Drive CV targets (VCO voct inputs, wasm-modules).
      for (const tgt of seq.cvTargets) {
        const n = this.nodes.get(tgt);
        if (n?.kind === 'vco') {
          const offset = readKnob(n.controls, 'coarse', 0) + readKnob(n.controls, 'fine', 0) / 100;
          n.osc.frequency.rampTo(midiToHz(note + offset), 0.005);
        } else if (n?.kind === 'wasm') {
          this.wasmNoteOn(n.moduleId, note, 0.8, seqDone);
        }
      }
      // Trigger gate targets (envelopes, wasm-gates) — gehouden gate (gateRatio).
      for (const tgt of seq.gateTargets) {
        const env = this.nodes.get(tgt);
        if (env?.kind === 'envelope') env.env.triggerAttack();
        else if (env?.kind === 'wasm') this.wasmNoteOn(env.moduleId, note, 0.8, seqDone);
      }
      // Trig-out: korte puls per step (drum-trigger), onafhankelijk van gateRatio.
      for (const tgt of seq.trigTargets) {
        const env = this.nodes.get(tgt);
        if (env?.kind === 'envelope') {
          env.env.triggerAttackRelease(0.005);
        } else if (env?.kind === 'wasm') {
          this.wasmNoteOn(env.moduleId, note, 0.8, seqDone);
          window.setTimeout(() => this.wasmNoteOff(env.moduleId, note), 5);
        }
      }
      this.status.voiceFreqHz = midiToHz(note);
      this.emit();

      // Schedule note-off at gateRatio of the step.
      window.setTimeout(() => {
        for (const tgt of seq.gateTargets) {
          const env = this.nodes.get(tgt);
          if (env?.kind === 'envelope' && seq.lastNote === note) env.env.triggerRelease();
          else if (env?.kind === 'wasm' && seq.lastNote === note) this.wasmNoteOff(env.moduleId, note);
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
    if (live) { delete live.__currentStep; live.__runActive = 0; }
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

function audioOutputOf(n: EngineNode, portId?: string): Tone.ToneAudioNode | null {
  switch (n.kind) {
    case 'vco': return n.osc;
    case 'dx7': return n.runtime.out;
    case 'wasm': return n.runtime.outGain(portId ?? n.runtime.outputIds[0] ?? '') ?? n.runtime.outGain(portId === 'out' ? 'out_l' : 'out') ?? null;
    case 'vcf': return n.filter;
    case 'vca': return n.gain;
    case 'noise': return n.level;
    case 'echo': return n.output;
    case 'phaser': return n.output;
    case 'mixer': return n.out;
    default: return null;
  }
}
function audioInputOf(n: EngineNode, portId?: string): Tone.ToneAudioNode | null {
  switch (n.kind) {
    // Alleen de FM-VCO heeft een audio-ingang (fm → carrier-detune).
    case 'vco': return portId === 'fm' && n.runtime instanceof FmVco ? n.runtime.fmIn : null;
    case 'wasm': return n.runtime.inGain(portId ?? '') ?? n.runtime.inGain(portId === 'in' ? 'in_l' : 'in') ?? null;
    case 'vcf': return n.filter;
    case 'vca': return n.gain;
    case 'out': return n.inGain;
    case 'echo': return n.input;
    case 'phaser': return n.input;
    case 'mixer': {
      // portId 'inN' (1-based) kiest het kanaal; onbekend → kanaal 1.
      const idx = portId && /^in\d+$/.test(portId) ? Number(portId.slice(2)) - 1 : 0;
      return n.inputs[idx] ?? n.inputs[0] ?? null;
    }
    default: return null;
  }
}
function cvOutputOf(n: EngineNode, portId?: string): Tone.ToneAudioNode | null {
  switch (n.kind) {
    case 'envelope': return n.env;
    case 'lfo':      return n.lfo;
    case 'cvmath':   return n.out;
    case 'wasm':     return n.runtime.outGain(portId ?? '') ?? null;
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
