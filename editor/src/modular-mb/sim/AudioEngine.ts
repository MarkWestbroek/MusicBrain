// AudioEngine — de simulator: dezelfde graaf als de Teensy, in de browser.
//
// Sinds stap 6 van doc/sim-firmware-parity-plan.md draait elke interne
// module als wasm: dezelfde C++ als de firmware, in een AudioWorklet (zie
// runtime/audio/WasmModule.ts en tools/mmb-wasm). De engine bouwt per module
// een node, vouwt de PolyGroups uit zoals `polyExpand.ts` dat voor de
// firmware doet, en legt de kabels als gewone Web Audio-verbindingen. Cv,
// gate en audio zijn allemaal signalen.
//
// Noten volgen de weg van de hardware: klavier, MIDI-apparaat en
// testsequenties gaan als MIDI-berichten naar MIDI-In (de firmwareklasse
// `MidiInModule`), en die zet per stem pitch/gate/vel op zijn uitgangen.
// Stemtoewijzing, prioriteit, legato, glide en unison doet dus de firmware.
//
// Eén gemak dat de hardware niet heeft: een module met een `voct`- of
// `gate`-ingang waar géén kabel in zit, speelt het klavier zelf mee
// (`wasmNoteOn`). Zo klinkt een losse Plaits of een patch zonder MIDI-In
// meteen. Op de Teensy doet zo'n module niets.
//
// Wat níét meer als wasm draait: OUT (naar de speakers) en de mixers. Die
// zijn optellen en pannen; daar valt niets na te bootsen.

import * as Tone from 'tone';
import type {
  ModularProject, Patch, ModuleInstance, ModuleType,
  PatchConnection, ControlValue, SignalType,
} from '../types';
import { registry, WasmModule } from '../runtime';
import { simSupportByKind } from './simSupport';
import { NoteStack, notePriorityOf, pickVoiceIndex,
  stealStrategyOf, type NotePriority, type StealStrategy } from './polySim';
import { planSimGraph, MIDIIN_TYPE } from './simGraph';
import { pickTeensyInput } from './teensyInput';

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
  /** Vergelijken met de Teensy: aan/uit, welk apparaat, of waarom het niet lukte. */
  compare?: { on: boolean; device?: string; error?: string };
}

const MIDIIN = MIDIIN_TYPE;
const SEQ = 'tp_mmb_seq8';

interface BaseNode {
  moduleId: string;
  kind: string;
  type: ModuleType;
  controls: Record<string, ControlValue>;
  /** Control-id remapping for external modules simulated by a proxy (simulationControlMap). */
  controlMap?: Record<string, string>;
}
interface OutNode extends BaseNode {
  kind: 'out';
  inGain: Tone.Gain;
}
interface MixerNode extends BaseNode {
  kind: 'mixer';
  /** Aantal kanalen (4, 8 of 16). */
  channels: number;
  /** Per-kanaal volume-gain (Vol-knop). */
  inputs: Tone.Gain[];
  /** Per-kanaal stereo-panner (Pan-knop). */
  panners: Tone.Panner[];
  /** Gesommeerde stereo-uitgang (out_l/out_r). */
  out: Tone.Gain;
}
/** Teensy-module als wasm in een AudioWorklet. Elke poort is een Tone.Gain;
 *  cv/gate zijn audio-rate signalen. */
interface WasmNode extends BaseNode {
  kind: 'wasm';
  runtime: WasmModule;
  /** Er zit een kabel op voct/gate → het klavier speelt deze module niet zelf. */
  voctDriven: boolean;
  gateDriven: boolean;
}
type EngineNode = OutNode | MixerNode | WasmNode;

/** Stilte tussen loslaten en opnieuw aanslaan van dezelfde wasm-stem (ms).
 *  Eén renderblok is ~2,7 ms; hierna heeft de module de dalende flank gezien. */
const RETRIGGER_MS = 5;

/** Stem-id `mod#3` → module-id `mod`; `mod` → `mod`. */
function voiceModuleId(voiceId: string): string { return voiceId.split('#')[0]!; }
/** Stem-id `mod#3` → poort-suffix `_3`; zonder cel → ''. */
function voiceSuffix(voiceId: string): string { const k = voiceId.split('#')[1]; return k ? `_${k}` : ''; }
/** Alle gate-achtige ingangen van een node (ook cel-gates), om te sluiten bij stop. */
function allGatePorts(rt: WasmModule): string[] {
  return rt.inputIds.filter((p) => /^(gate|trig|strike|blow|bow)(_\d+)?$/.test(p));
}
/** Gate-poortnaam van een wasm-module ('gate' of 'trig'). */
function wasmGatePort(rt: WasmModule, sfx = ''): string | null {
  return rt.hasInput(`gate${sfx}`) ? `gate${sfx}` : rt.hasInput(`trig${sfx}`) ? `trig${sfx}` : null;
}
/** Velocity-achtige ingang van een wasm-module (met cel-suffix voor multi-modules). */
function wasmVelPort(rt: WasmModule, sfx = ''): string | null {
  for (const p of ['vel', 'velocity', 'strength', 'accent_cv', 'accent']) if (rt.hasInput(p + sfx)) return p + sfx;
  return null;
}

export class AudioEngine {
  private master: Tone.Gain | null = null;
  private meter: Tone.Meter | null = null;
  /** Aftakpunt voor de recorder. Blijft met opzet leven over een `build()`
   *  heen — verleg je tijdens het opnemen een kabel, dan wordt de master
   *  vervangen maar valt de opname niet stil. Wordt daarom ook niet in
   *  `dispose()` opgeruimd; het is één Gain voor de duur van de pagina. */
  private recordBus: Tone.Gain | null = null;
  private recordBusWired = false;
  /** Alles wat naar de speakers gaat, gaat hierdoor — en de recorder tapt
   *  hier af. Zo neemt hij op wat je hoort: normaal de simulator, tijdens het
   *  vergelijken Teensy links en simulator rechts in één WAV. Net als
   *  `recordBus` blijft hij de hele pagina leven. */
  private speakers: Tone.Gain | null = null;
  /** Aan/uit van de simulator. De worklets lopen door zolang de AudioContext
   *  loopt — een sequencer of LFO tikt dus ook als je op stop drukt, net als
   *  de Teensy. Stop draait daarom hier de kraan dicht. Blijft leven over een
   *  `build()` heen, net als `simOut`. */
  private runGate: Tone.Gain | null = null;
  private nodes = new Map<string, EngineNode>();
  private connections: PatchConnection[] = [];
  private portIndex = new Map<string, { signalType: SignalType; direction: 'in' | 'out' }>();
  private currentKeyboardNote: number | null = null;
  private listeners = new Set<(s: EngineStatus) => void>();
  private status: EngineStatus = { running: false, voiceFreqHz: 0, level: 0, liveControls: {} };

  // ── Vergelijken met de Teensy: Teensy links, simulator rechts ────────
  // Staat los van de patch: build() gooit master weg en bouwt hem opnieuw,
  // maar deze nodes blijven, zodat je tijdens het vergelijken gewoon kunt
  // doorpatchen. `simOut` is de vaste uitgang waar elke nieuwe master op
  // aansluit; daarachter beslist `applySimRoute` of hij rechtstreeks naar de
  // speakers gaat of via de panner naar rechts.
  private simOut: Tone.Gain | null = null;
  private simSide: Tone.Panner | null = null;
  private teensyStream: MediaStream | null = null;
  private teensySrc: MediaStreamAudioSourceNode | null = null;
  private teensySide: Tone.Panner | null = null;
  private rafId: number | null = null;

  // ── Het klavier-gemak (modules zonder voct/gate-kabel) ─────────────
  /** PolyGroups: master → leden (incl. master), en lid → master. Een stem is
   *  óf een hele module (`moduleId`) óf een cel van een multi-module
   *  (`moduleId#k`, k 1-based) — zie doc/uml/11-simulation-wasm.md. */
  private wasmGroups = new Map<string, string[]>();
  private wasmFollowerOf = new Map<string, string>();
  /** Multi-module → master-stem-id (`moduleId#1`) van zijn cel-PolyGroup. */
  private cellMasterOf = new Map<string, string>();
  /** Stem-allocator per wasm-node: vastgehouden noot en leeftijd (steal = oudste). */
  private wasmVoice = new Map<string, { note: number | null; age: number }>();
  private wasmAge = 0;
  /** Wasm-stemmen die al een noot gespeeld hebben: de eerste noot staat meteen
   *  goed, pas vanaf de tweede glijdt hij (`glidePrimed_` in MidiIn.cpp). */
  private glidePrimed = new Set<string>();
  /** De knoppen van MIDI-In, voor het klavier-gemak. Zit er een MIDI-In in de
   *  patch, dan speelt die de gekabelde modules zelf, met de firmwareregels. */
  private steal: StealStrategy = 'oldest';
  private glideMs = 0;
  private noteStack = new NoteStack();
  private priority: NotePriority = 'last';
  private legato = false;

  // ── public API ─────────────────────────────────────────────────────

  build(project: ModularProject, patch: Patch): void {
    this.dispose();

    this.master = new Tone.Gain(0.7);
    this.meter  = new Tone.Meter({ smoothing: 0.85 });
    this.master.connect(this.meter);
    this.master.connect(this.ensureRunGate());

    // 1. Het plan: wat staat er in het rack, welke PolyGroups, hoeveel
    //    stemmen, en de kabels na het uitvouwen (zie simGraph.ts).
    const plan = planSimGraph(project, patch);
    const { inRack, midiVoices, midiOuts } = plan;
    this.wasmGroups = plan.groups; this.wasmFollowerOf = plan.followerOf; this.cellMasterOf = plan.cellMasterOf;
    this.wasmVoice.clear();
    this.glidePrimed.clear();          // nieuwe worklets beginnen weer op 0 V
    this.noteStack.clear();
    const miMod = project.modules.find((m) => m.typeId === MIDIIN && inRack.has(m.id));
    this.readMidiInKnobs((miMod ? patch.controlState[miMod.id] : undefined) ?? {});

    for (const m of project.modules) {
      if (!inRack.has(m.id)) continue;
      const t = project.moduleTypes.find((x) => x.id === m.typeId);
      if (!t) continue;
      for (const p of t.ports) {
        this.portIndex.set(`${m.id}:${p.id}`, { signalType: p.signalType, direction: p.direction });
        if (p.eventKind === 'voice' && p.direction === 'out') {
          for (let k = 1; k <= midiOuts; k++) {
            this.portIndex.set(`${m.id}:${p.id}${k}`, { signalType: p.signalType, direction: p.direction });
          }
        }
      }
    }

    // 2. Een node per module.
    for (const m of project.modules) {
      if (!inRack.has(m.id)) continue;
      const tRaw = project.moduleTypes.find((x) => x.id === m.typeId);
      if (!tRaw) continue;
      // ADR 0009 — external simulation proxy. If the type declares a
      // `simulatedBy`, resolve to the proxy type and remap controls; the
      // engine then treats this external module as if it were the proxy.
      let t = tRaw;
      let ctrl = (patch.controlState[m.id] ?? {}) as Record<string, ControlValue>;
      // Poly-follower: knopstanden van de master als basis (poly-fan-out).
      const polyMaster = this.wasmFollowerOf.get(m.id);
      if (polyMaster) ctrl = { ...(patch.controlState[polyMaster] ?? {}), ...ctrl } as Record<string, ControlValue>;
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
      if (t.id === MIDIIN) ctrl = { ...ctrl, voiceCount: midiVoices };
      const cat = project.categories.find((c) => c.id === t.categoryId);
      const kind = String(cat?.kind ?? '');
      const node = this.makeNode(kind, m, t, ctrl, controlMap, t.id === MIDIIN ? midiOuts : 0);
      if (node) this.nodes.set(m.id, node);
    }

    // 3. Kabels, uitgevouwen zoals polyExpand het voor de firmware doet.
    this.connections = patch.connections;
    const simConns = plan.conns;
    for (const conn of simConns) this.wire(conn);
  }

  /** Node waarop een opname mag meeluisteren: precies wat naar de speakers
   *  gaat, ná het volume. Normaal de simulator; tijdens het vergelijken
   *  Teensy links en simulator rechts — dan kun je beide kanten achteraf
   *  naast elkaar leggen. */
  recorderTap(): Tone.Gain {
    if (!this.recordBus) this.recordBus = new Tone.Gain(1);
    if (!this.recordBusWired) {
      this.ensureSpeakers().connect(this.recordBus);
      this.recordBusWired = true;
    }
    return this.recordBus;
  }

  async start(): Promise<void> {
    await Tone.start();
    this.ensureRunGate().gain.rampTo(1, 0.01);
    this.status.running = true;
    this.emit();
    this.tickMeter();
  }

  stop(): void {
    this.runGate?.gain.rampTo(0, 0.01);
    for (const node of this.nodes.values()) {
      if (node.kind !== 'wasm') continue;
      for (const p of allGatePorts(node.runtime)) node.runtime.setInput(p, 0);
      // All Notes Off (CC 123): MidiInModule::allNotesOff.
      if (node.type.id === MIDIIN) node.runtime.midi(0xB0, 123, 0);
    }
    this.wasmVoice.forEach((v) => { v.note = null; });
    this.noteStack.clear();
    this.currentKeyboardNote = null;
    this.status.running = false;
    this.status.level = 0;
    this.status.voiceFreqHz = 0;
    this.emit();
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  /**
   * Toets ingedrukt. Gaat als MIDI naar elke MIDI-In in de patch — die doet
   * de rest, met de regels van de firmware.
   *
   * Voor het klavier-gemak (modules zonder kabel) houdt de engine zelf een
   * toetsenstapel bij: monofoon bepaalt PRIO welke toets de stem volgt, en
   * LEG of hij opnieuw aanslaat. De regels komen uit Yarns
   * (`Part::InternalNoteOn`) en Surge, en zijn dezelfde als die van MidiIn.cpp.
   */
  noteOn(midi: number, velocity = 0.9): void {
    this.sendMidi(0x90, midi, Math.max(1, Math.min(127, Math.round(velocity * 127))));
    this.noteStack.press(midi, velocity);
    if (this.wasmGroups.size === 0) {
      if (this.noteStack.winner(this.priority) !== midi) { this.emit(); return; }
      // Lag er al een toets, dan is dit legato: bij LEG aan slaat de envelope
      // niet opnieuw aan, de stem glijdt alleen naar de nieuwe toon.
      const legatoNow = this.legato && this.noteStack.size > 1;
      this.driveNoteOn(midi, velocity, !legatoNow);
      return;
    }
    this.driveNoteOn(midi, velocity, true);
  }

  /**
   * Toets losgelaten. Monofoon zakt de stem terug naar een toets die nog
   * ligt — glijdend, en alleen opnieuw aanslaand als legato uit staat
   * (Yarns `InternalNoteOff`, Surge `releaseNotePostHoldCheck`).
   */
  noteOff(midi: number): void {
    this.sendMidi(0x80, midi, 0);
    if (this.wasmGroups.size === 0) {
      const before = this.noteStack.winner(this.priority);
      this.noteStack.release(midi);
      const after = this.noteStack.winner(this.priority);
      if (after === null) { this.driveNoteOff(before ?? midi); return; }
      if (after !== before) {
        this.driveNoteOn(after, this.noteStack.velocityOf(after), !this.legato);
      } else {
        this.emit();                    // losgelaten toets was niet de winnaar
      }
      return;
    }
    this.noteStack.release(midi);
    this.driveNoteOff(midi);
  }

  /**
   * MIDI control change naar MIDI-In. CC1 is het mod-wiel; daarnaast luistert
   * elke MIDI-In naar zijn twee zelfgekozen nummers (CC1#/CC2# op de front).
   */
  controlChange(controller: number, value: number): void {
    this.sendMidi(0xB0, controller, Math.max(0, Math.min(127, Math.round(value))));
  }

  /** Pitch-bend, 14-bit met 8192 als midden. */
  pitchBend(value14: number): void {
    const v = Math.max(0, Math.min(16383, Math.round(value14)));
    this.sendMidi(0xE0, v & 0x7F, v >> 7);
  }

  setMasterVolume(v: number): void {
    if (this.master) this.master.gain.rampTo(clamp(v, 0, 1), 0.05);
  }

  /**
   * Pas een control-wijziging *live* toe. Returnt `true` als de wijziging
   * zonder rebuild verwerkt is, `false` als de aanroeper alsnog `build()`
   * moet aanroepen (het aantal stemmen, of een mixer).
   */
  updateControl(moduleId: string, controlId: string, value: ControlValue): boolean {
    const node = this.nodes.get(moduleId);
    if (!node) return false;
    node.controls = { ...node.controls, [controlId]: value };
    // Remap external-module control IDs (e.g. RS-110 'freq' → 'cutoff').
    if (node.controlMap) {
      const mapped = node.controlMap[controlId];
      if (mapped !== undefined) controlId = mapped;
    }
    const num = typeof value === 'number' ? value : Number(value);
    switch (node.kind) {
      case 'wasm': {
        // Het aantal stemmen verandert de groepen zelf — dat blijft een rebuild.
        if (node.type.id === MIDIIN && controlId === 'voiceCount') return false;
        node.runtime.setControl(controlId, value);
        // Master van een PolyGroup: knop waaiert uit naar de followers.
        for (const fid of this.wasmGroups.get(node.moduleId) ?? []) {
          if (fid === node.moduleId) continue;
          const f = this.nodes.get(fid);
          if (f?.kind === 'wasm') f.runtime.setControl(controlId, value);
        }
        if (node.type.id === MIDIIN) this.readMidiInKnobs(node.controls);
        if (node.type.id === SEQ) this.seqDisplays(node);
        return true;
      }
      case 'out': {
        if (controlId === 'level') { node.inGain.gain.rampTo(clamp(num, 0, 1), 0.02); return true; }
        return true;
      }
      case 'mixer':
        return false;
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
        case 'wasm': node.runtime.dispose(); break;
        case 'out': node.inGain.dispose(); break;
        case 'mixer': node.inputs.forEach((g) => g.dispose()); node.panners.forEach((p) => p.dispose()); node.out.dispose(); break;
      }
    }
    this.nodes.clear();
    this.portIndex.clear();
    this.connections = [];
    this.status.liveControls = {};
    this.master?.dispose(); this.meter?.dispose();
    this.master = null; this.meter = null;
    // recordBus, speakers, simOut en runGate bewust niet disposen — zie de velden.
  }

  // ── helpers ────────────────────────────────────────────────────────

  private makeNode(
    kind: string, m: ModuleInstance, t: ModuleType, controls: Record<string, ControlValue>,
    controlMap: Record<string, string> | undefined, voices: number,
  ): EngineNode | null {
    const base = { moduleId: m.id, type: t, controls, controlMap };
    // Eén rem voor alles wat de simulator niet speelt — dezelfde functie die
    // de Modules-tab het Sim-kolommetje geeft, zodat een module die daar
    // "speelt" heet hier ook echt een node krijgt.
    if (simSupportByKind(t, kind) === 'none') return null;
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
    if (t.id === 'tp_mmb_out') {
      const level = clamp(readKnob(controls, 'level', 0.8), 0, 1);
      const inGain = new Tone.Gain(level);
      if (this.master) inGain.connect(this.master);
      return { ...base, kind: 'out', inGain };
    }
    if (WasmModule.supports(t.id)) {
      const rt = t.id === MIDIIN
        ? new WasmModule(t, m, controls, { voices })
        : registry.create(t, m, controls) as WasmModule;
      const node: WasmNode = { ...base, kind: 'wasm', runtime: rt, voctDriven: false, gateDriven: false };
      if (t.id === SEQ) {
        // De stap-lampjes: de wasm meldt de stap, de engine zet hem 1-based
        // op `__currentStep` (daar binden de LED's en het display aan).
        rt.onTelemetry = (v) => {
          const live = (this.status.liveControls[m.id] ??= {});
          live.__currentStep = Math.round(v) + 1;
          this.emit();
        };
        this.seqDisplays(node);
      }
      return node;
    }
    return null;
  }

  /** De afgeleide displays van de SEQ-16: BPM bij de Rate en het Run-lampje. */
  private seqDisplays(node: WasmNode): void {
    const rate = clamp(readKnob(node.controls, 'rate', 4), 0.5, 16);
    const run = Math.round(readKnob(node.controls, 'run', 0));
    this.status.liveControls[node.moduleId] = {
      ...(this.status.liveControls[node.moduleId] ?? {}),
      // BPM = rate(Hz) · 60 / 4 (één stap = 16e noot, vier stappen per tel).
      __rateBpm: Math.round(rate * 15),
      __runActive: run === 0 ? 1 : 0,
    };
  }

  /** MIDI-In-knoppen die het klavier-gemak volgt (PRIO, LEG, STEAL, GLIDE). */
  private readMidiInKnobs(c: Record<string, ControlValue>): void {
    this.steal = stealStrategyOf(readKnob(c, 'steal', 0));
    this.glideMs = Math.max(0, readKnob(c, 'glide', 0));
    this.priority = notePriorityOf(readKnob(c, 'priority', 0));
    this.legato = readKnob(c, 'legato', 0) >= 0.5;
  }

  /**
   * Eén MIDI-bericht naar elke MIDI-In. Het kanaal is dat van zijn filter
   * (CH-knop), of 1 bij omni: het klavier van de simulator speelt altijd op
   * het kanaal waar MIDI-In naar luistert.
   */
  private sendMidi(status: number, d1: number, d2: number): void {
    for (const node of this.nodes.values()) {
      if (node.kind !== 'wasm' || node.type.id !== MIDIIN) continue;
      const ch = Math.max(1, Math.min(16, Math.round(readKnob(node.controls, 'channel', 0)) || 1));
      node.runtime.midi((status & 0xF0) | (ch - 1), d1 & 0x7F, d2 & 0x7F);
    }
  }

  private driveNoteOn(midi: number, velocity: number, retrigger: boolean): void {
    this.currentKeyboardNote = midi;
    this.status.lastNote = { midi, vel: Math.round(clamp(velocity, 0, 1) * 127), ts: Date.now(), on: true };
    // Het klavier-gemak: modules zonder gate-kabel spelen zelf mee.
    // Poly-followers slaan we over; de toewijzer kiest binnen de groep.
    const done = new Set<string>();   // één allocatie per groep per noot
    for (const node of this.nodes.values()) {
      if (node.kind === 'wasm' && !node.gateDriven && !this.wasmFollowerOf.has(node.moduleId)) {
        this.wasmNoteOn(node.moduleId, midi, velocity, done, retrigger);
      }
    }
    this.status.voiceFreqHz = midiToHz(midi);
    this.emit();
  }

  private driveNoteOff(midi: number): void {
    if (this.status.lastNote?.midi === midi) this.status.lastNote = { ...this.status.lastNote, on: false };
    for (const node of this.nodes.values()) {
      if (node.kind === 'wasm' && !node.gateDriven && !this.wasmFollowerOf.has(node.moduleId)) {
        this.wasmNoteOff(node.moduleId, midi);
      }
    }
    if (this.currentKeyboardNote === midi) this.currentKeyboardNote = null;
    this.emit();
  }

  /** Stem kiezen in de groep van `id` (master of losse module) en de noot aanzetten:
   *  zelfde noot → hertrigger, anders vrije stem, anders de oudste stelen. */
  private wasmNoteOn(id: string, midi: number, velocity: number, done: Set<string>, retrigger = true): void {
    // Een kale module-id van een multi-module → zijn master-cel.
    if (!id.includes('#')) id = this.cellMasterOf.get(id) ?? id;
    const master = this.wasmFollowerOf.get(id) ?? id;
    if (done.has(master)) return;
    done.add(master);
    const members = this.wasmGroups.get(master) ?? [master];
    const states = members.map((m) => this.wasmVoice.get(m) ?? { note: null, age: 0 });
    let idx = pickVoiceIndex(states, midi, this.steal);
    if (!retrigger) {
      // Legato: niet toewijzen maar de stem die al klinkt naar de nieuwe toon
      // schuiven, zonder de gate aan te raken.
      const sounding = states.findIndex((st) => st.note !== null);
      if (sounding >= 0) idx = sounding;
    }
    const voice: string | null = idx >= 0 ? members[idx] ?? null : null;
    const node = voice ? this.nodes.get(voiceModuleId(voice)) : undefined;
    if (!voice || !node || node.kind !== 'wasm') return;
    // Klonk deze stem al (gestolen, of dezelfde toets nog eens), dan staat de
    // gate hoog en zou `setInput(gate, 1)` niets doen: de module hoort geen
    // nieuwe aanslag, alleen een pitch die verspringt. Daarom eerst laag, en
    // de noot een blok later. `age` is het bonnetje: is de stem intussen aan
    // een andere noot uitgegeven, dan gaat deze aanslag niet meer door.
    const busy = retrigger && (this.wasmVoice.get(voice)?.note ?? null) !== null;
    const stamp = ++this.wasmAge;
    this.wasmVoice.set(voice, { note: midi, age: stamp });
    const rt = node.runtime;
    const sfx = voiceSuffix(voice);
    const gp = wasmGatePort(rt, sfx);
    const attack = (): void => {
      const st = this.wasmVoice.get(voice);
      if (!st || st.age !== stamp || st.note !== midi) return;
      const voct = `voct${sfx}`;
      if (rt.hasInput(voct) && !rt.cabled.has(voct)) {
        // Glide zoals MidiInModule::tick(): een vaste snelheid in volt per
        // seconde (glide = ms per octaaf), gelopen door de worklet zelf, en
        // de allereerste noot van een stem staat meteen goed.
        const primed = this.glidePrimed.has(voice);
        this.glidePrimed.add(voice);
        const slew = primed && this.glideMs > 0 ? 1000 / this.glideMs : 0;
        rt.setInput(voct, (midi - 60) / 12, slew);
      }
      const vp = wasmVelPort(rt, sfx);
      if (vp && !rt.cabled.has(vp)) rt.setInput(vp, clamp(velocity, 0, 1));
      if (gp && retrigger && !rt.cabled.has(gp)) rt.setInput(gp, 1);
    };
    if (busy && gp) {
      rt.setInput(gp, 0);
      window.setTimeout(attack, RETRIGGER_MS);
    } else {
      attack();
    }
  }
  /** Noot loslaten in de groep van `id` (midi null = alle stemmen). */
  private wasmNoteOff(id: string, midi: number | null): void {
    if (!id.includes('#')) id = this.cellMasterOf.get(id) ?? id;
    const master = this.wasmFollowerOf.get(id) ?? id;
    for (const m of this.wasmGroups.get(master) ?? [master]) {
      const st = this.wasmVoice.get(m);
      if (midi !== null && st?.note !== midi) continue;
      const node = this.nodes.get(voiceModuleId(m));
      if (node?.kind === 'wasm') { const gp = wasmGatePort(node.runtime, voiceSuffix(m)); if (gp) node.runtime.setInput(gp, 0); }
      if (st) st.note = null;
    }
  }

  /**
   * Eén kabel. Alles is signaal: audio, cv en gate lopen als Web Audio-
   * verbinding van een uitgang naar een ingang, zoals de AudioGraph en de
   * CvGraph van de Teensy ze samen leggen.
   */
  private wire(conn: PatchConnection): void {
    const src = this.nodes.get(conn.from.moduleId);
    const dst = this.nodes.get(conn.to.moduleId);
    if (!src || !dst) return;
    if (!this.portIndex.has(`${conn.from.moduleId}:${conn.from.portId}`)) return;
    if (!this.portIndex.has(`${conn.to.moduleId}:${conn.to.portId}`)) return;
    // Mixer-uitgang is stereo via één Gain-node; out_l en out_r wijzen naar
    // dezelfde node. Sluit alleen out_l aan zodat de OUT niet dubbel telt.
    if (src.kind === 'mixer' && conn.from.portId === 'out_r') return;
    const out = outputOf(src, conn.from.portId);
    // Een tweede kabel op een cv/gate-ingang: eigen worklet-ingang, zodat de
    // laatste verandering wint zoals in de CvGraph (zie WasmModule.addFeeder).
    const dstSig = this.portIndex.get(`${conn.to.moduleId}:${conn.to.portId}`)?.signalType;
    const inp = dst.kind === 'wasm' && dstSig !== 'audio' && dst.runtime.cabled.has(conn.to.portId)
      ? dst.runtime.addFeeder(conn.to.portId)
      : inputOf(dst, conn.to.portId);
    if (!out || !inp) return;
    if (src.kind === 'wasm' && dst.kind === 'wasm') {
      // Web Audio dempt een lus zonder DelayNode (Stages.eoc → Marbles.clock
      // → … → Stages.gate, of eoc → eigen gate). Eén render-quantum
      // vertraging (~2,7 ms) houdt zulke zelfspelende patches in leven.
      const d = new Tone.Delay(128 / Tone.getContext().sampleRate);
      out.connect(d); d.connect(inp);
      dst.runtime.extra.push(d);
    } else {
      out.connect(inp);
    }
    if (dst.kind === 'wasm') {
      const toPort = conn.to.portId;
      dst.runtime.markCabled(toPort);
      if (/^voct(_\d+)?$/.test(toPort)) dst.voctDriven = true;
      if (/^(gate|trig)(_\d+)?$/.test(toPort)) dst.gateDriven = true;
    }
  }

  // ── Uitgang, stop-kraan en vergelijken met de Teensy ─────────────────

  private ensureSpeakers(): Tone.Gain {
    if (!this.speakers) this.speakers = new Tone.Gain(1).toDestination();
    return this.speakers;
  }

  private ensureRunGate(): Tone.Gain {
    if (!this.runGate) {
      this.runGate = new Tone.Gain(this.status.running ? 1 : 0);
      this.runGate.connect(this.ensureSimOut());
    }
    return this.runGate;
  }

  private ensureSimOut(): Tone.Gain {
    if (!this.simOut) {
      this.simOut = new Tone.Gain(1);
      this.applySimRoute();
    }
    return this.simOut;
  }

  /** Simulator naar de speakers — of, tijdens het vergelijken, naar rechts. */
  private applySimRoute(): void {
    const out = this.simOut;
    if (!out) return;
    out.disconnect();
    if (this.teensySide) {
      // Tone.Panner telt een stereo-ingang eerst op tot mono (½·(L+R)) en zet
      // die dan helemaal naar één kant: een mono-patch houdt zijn niveau.
      if (!this.simSide) this.simSide = new Tone.Panner(1).connect(this.ensureSpeakers());
      out.connect(this.simSide);
    } else {
      out.connect(this.ensureSpeakers());
    }
  }

  /**
   * Teensy links, simulator rechts — om met je oren te horen of ze gelijk
   * klinken. De browser opent de Teensy als audio-ingang (voor Windows is hij
   * een microfoon, zie doc/teensy-aan-de-pc.md).
   *
   * Echo-onderdrukking, ruisfilter en automatische versterking gaan expliciet
   * uit: anders gaat de browser het Teensy-signaal "verbeteren" en vergelijk
   * je appels met peren.
   */
  async setCompare(on: boolean): Promise<void> {
    this.stopCompare();
    if (!on) { this.status.compare = { on: false }; this.applySimRoute(); this.emit(); return; }

    const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) {
      this.status.compare = { on: false, error: 'Deze browser kan geen audio-ingang openen.' };
      this.emit();
      return;
    }
    const raw: MediaTrackConstraints = {
      echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2,
    };
    try {
      await Tone.start();
      // Eerst toestemming (dan pas krijgen de apparaten een naam), dan de
      // Teensy er op naam uit halen — zie teensyInput.ts.
      let stream = await media.getUserMedia({ audio: raw });
      const teensy = pickTeensyInput(await media.enumerateDevices());
      if (!teensy) {
        stream.getTracks().forEach((t) => t.stop());
        this.status.compare = {
          on: false,
          error: 'Geen Teensy-ingang gevonden. Hangt hij aan de USB, en draait de firmware met USB-audio?',
        };
        this.emit();
        return;
      }
      if (stream.getAudioTracks()[0]?.getSettings().deviceId !== teensy.deviceId) {
        stream.getTracks().forEach((t) => t.stop());
        stream = await media.getUserMedia({ audio: { ...raw, deviceId: { exact: teensy.deviceId } } });
      }
      const ctx = Tone.getContext().rawContext as AudioContext;
      this.teensyStream = stream;
      this.teensySrc = ctx.createMediaStreamSource(stream);
      this.teensySide = new Tone.Panner(-1).connect(this.ensureSpeakers());
      Tone.connect(this.teensySrc, this.teensySide);
      // Kabel eruit of Teensy herstart (flashen!): netjes terug naar normaal.
      stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        this.stopCompare();
        this.applySimRoute();
        this.status.compare = { on: false, error: 'De Teensy-ingang is weggevallen.' };
        this.emit();
      });
      this.applySimRoute();
      this.status.compare = { on: true, device: teensy.label };
    } catch (err) {
      this.stopCompare();
      this.applySimRoute();
      const name = err instanceof DOMException ? err.name : '';
      this.status.compare = {
        on: false,
        error: name === 'NotAllowedError'
          ? 'De browser kreeg geen toestemming voor de audio-ingang.'
          : `Teensy-ingang openen mislukt: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    this.emit();
  }

  private stopCompare(): void {
    this.teensyStream?.getTracks().forEach((t) => t.stop());
    this.teensyStream = null;
    try { this.teensySrc?.disconnect(); } catch { /* al los */ }
    this.teensySrc = null;
    this.teensySide?.dispose(); this.teensySide = null;
    this.simSide?.dispose();    this.simSide = null;
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

function outputOf(n: EngineNode, portId: string): Tone.ToneAudioNode | null {
  switch (n.kind) {
    case 'wasm': return n.runtime.outGain(portId) ?? n.runtime.outGain(portId === 'out' ? 'out_l' : 'out') ?? null;
    case 'mixer': return n.out;
    default: return null;
  }
}
function inputOf(n: EngineNode, portId: string): Tone.ToneAudioNode | null {
  switch (n.kind) {
    case 'wasm': return n.runtime.inGain(portId) ?? n.runtime.inGain(portId === 'in' ? 'in_l' : 'in') ?? null;
    case 'out': return n.inGain;
    case 'mixer': {
      // portId 'inN' (1-based) kiest het kanaal; onbekend → kanaal 1.
      const idx = /^in\d+$/.test(portId) ? Number(portId.slice(2)) - 1 : 0;
      return n.inputs[idx] ?? n.inputs[0] ?? null;
    }
  }
}

// ── value helpers ────────────────────────────────────────────────────

function readKnob(controls: Record<string, ControlValue>, id: string, def: number): number {
  const v = controls[id];
  return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : def;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
