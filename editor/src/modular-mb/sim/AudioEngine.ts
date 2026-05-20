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
import type {
  ModularProject, Patch, Module, ModuleType, ModuleCategory, ControlValue,
} from '../types';

type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square';

export interface EngineStatus {
  running: boolean;
  voiceFreqHz: number;
  level: number;
}

export class AudioEngine {
  private osc: Tone.Oscillator | null = null;
  private filter: Tone.Filter | null = null;
  private vca: Tone.Gain | null = null;
  private env: Tone.AmplitudeEnvelope | null = null;
  private master: Tone.Gain | null = null;
  private meter: Tone.Meter | null = null;
  private currentNote: number | null = null;
  private listeners = new Set<(s: EngineStatus) => void>();
  private status: EngineStatus = { running: false, voiceFreqHz: 0, level: 0 };
  private rafId: number | null = null;

  /** (Re)build the audio graph from a project+patch snapshot. */
  build(project: ModularProject, patch: Patch): void {
    this.dispose();

    const lookup = buildLookup(project, patch);

    // ── Oscillator ──
    const osc = lookup.vco;
    const wave: Wave = osc ? pickWaveform(osc.module, osc.controls) : 'sawtooth';
    this.osc = new Tone.Oscillator({ frequency: 220, type: wave, volume: -6 });

    // ── Filter ──
    const vcf = lookup.vcf;
    const cutoff = vcf ? Number(vcf.controls['cutoff'] ?? vcf.controls['frequency'] ?? 1200) : 6000;
    const q      = vcf ? Number(vcf.controls['resonance'] ?? vcf.controls['q'] ?? 1) : 0.7;
    this.filter = new Tone.Filter({ frequency: clamp(cutoff, 40, 18000), Q: clamp(q, 0.1, 12), type: 'lowpass' });

    // ── Envelope + VCA ──
    const envCtrl = lookup.envelope?.controls ?? {};
    const A = msToSec(envCtrl['attack'],  10);
    const H = msToSec(envCtrl['hold'],    0);
    const D = msToSec(envCtrl['decay'],   200);
    const S = clamp(Number(envCtrl['sustain'] ?? 0.7), 0, 1);
    const R = msToSec(envCtrl['release'], 400);
    this.env = new Tone.AmplitudeEnvelope({ attack: A + H, decay: D, sustain: S, release: R });

    const vcaCtrl = lookup.vca?.controls ?? {};
    const vcaGain = clamp(Number(vcaCtrl['gain'] ?? vcaCtrl['level'] ?? 0.8), 0, 1);
    this.vca = new Tone.Gain(vcaGain);

    this.master = new Tone.Gain(0.7);
    this.meter  = new Tone.Meter({ smoothing: 0.85 });

    // Connect
    this.osc.connect(this.filter);
    this.filter.connect(this.env);
    this.env.connect(this.vca);
    this.vca.connect(this.master);
    this.master.connect(this.meter);
    this.master.toDestination();
  }

  async start(): Promise<void> {
    await Tone.start();
    if (!this.osc) return;
    if (this.osc.state !== 'started') this.osc.start();
    this.status.running = true;
    this.emit();
    this.tickMeter();
  }

  stop(): void {
    if (this.osc && this.osc.state === 'started') this.osc.stop();
    this.currentNote = null;
    this.status.running = false;
    this.status.level = 0;
    this.emit();
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  noteOn(midi: number, _velocity = 0.9): void {
    if (!this.osc || !this.env) return;
    const freq = midiToHz(midi);
    this.osc.frequency.rampTo(freq, 0.005);
    this.currentNote = midi;
    this.env.triggerAttack(undefined, undefined);
    this.status.voiceFreqHz = freq;
    this.emit();
  }

  noteOff(midi: number): void {
    if (!this.env) return;
    if (this.currentNote !== midi) return;   // last-note-priority
    this.env.triggerRelease();
    this.currentNote = null;
    this.emit();
  }

  setMasterVolume(v: number): void {
    if (this.master) this.master.gain.rampTo(clamp(v, 0, 1), 0.05);
  }

  subscribe(fn: (s: EngineStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => { this.listeners.delete(fn); };
  }

  dispose(): void {
    this.stop();
    this.osc?.dispose(); this.filter?.dispose(); this.env?.dispose();
    this.vca?.dispose(); this.master?.dispose(); this.meter?.dispose();
    this.osc = null; this.filter = null; this.env = null;
    this.vca = null; this.master = null; this.meter = null;
  }

  private emit(): void {
    const s = { ...this.status };
    this.listeners.forEach((fn) => fn(s));
  }

  private tickMeter(): void {
    if (!this.status.running) return;
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

// ── helpers ───────────────────────────────────────────────────────────

interface ModuleLookup {
  vco?:      { module: Module; type: ModuleType; controls: Record<string, ControlValue> };
  vcf?:      { module: Module; type: ModuleType; controls: Record<string, ControlValue> };
  vca?:      { module: Module; type: ModuleType; controls: Record<string, ControlValue> };
  envelope?: { module: Module; type: ModuleType; controls: Record<string, ControlValue> };
  lfo?:      { module: Module; type: ModuleType; controls: Record<string, ControlValue> };
}

function buildLookup(project: ModularProject, patch: Patch): ModuleLookup {
  const out: ModuleLookup = {};
  const racks = project.racks.filter((r) => patch.rackIds.includes(r.id));
  for (const r of racks) {
    for (const slot of r.slots) {
      const mod  = project.modules.find((m) => m.id === slot.moduleId);
      if (!mod) continue;
      const type = project.moduleTypes.find((t) => t.id === mod.typeId);
      if (!type) continue;
      const cat  = project.categories.find((c) => c.id === type.categoryId);
      const kind = String(cat?.kind ?? '');
      const controls = (patch.controlState[mod.id] ?? {}) as Record<string, ControlValue>;
      const entry = { module: mod, type, controls };
      if (kind === 'vco'      && !out.vco)      out.vco = entry;
      if (kind === 'vcf'      && !out.vcf)      out.vcf = entry;
      if (kind === 'vca'      && !out.vca)      out.vca = entry;
      if (kind === 'envelope' && !out.envelope) out.envelope = entry;
      if (kind === 'lfo'      && !out.lfo)      out.lfo = entry;
    }
  }
  return out;
}

function pickWaveform(_mod: Module, controls: Record<string, ControlValue>): Wave {
  const w = String(controls['wave'] ?? controls['waveform'] ?? '').toLowerCase();
  if (w.includes('sin')) return 'sine';
  if (w.includes('tri')) return 'triangle';
  if (w.includes('sq'))  return 'square';
  return 'sawtooth';
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

// Avoid unused-import warning for ModuleCategory (kept for future extensions)
export type _Cat = ModuleCategory;
