/// <reference types="vite/client" />
import * as Tone from 'tone';
import type { ModuleInstance, ModuleType, ControlValue } from '../../types';
import { AudioModule } from '../AudioModule';
import { registry } from '../Registry';

/**
 * Dx7 — MMB DX7-stem (firmware tp_mmb_dx7) in de browser.
 *
 * Draait *dezelfde* msfa-kern als de Teensy: `firmware/lib/msfa` is met
 * wasi-sdk naar `public/dx7/dx7.wasm` gecompileerd (tools/dx7-wasm) en
 * draait in een AudioWorklet (`public/dx7/dx7-worklet.js`). De 8 Yamaha
 * factory-ROMs komen uit `public/dx7/roms.bin`; bank 8 (USR) is een
 * geüploade .syx via `Dx7.setUserBank()`.
 *
 * Afwijking van de firmware: één Dx7Module is daar één stem (poly via
 * polyExpand). De simulator is monofoon, dus doet de wasm-kern hier zelf
 * 16-stemmige polyfonie met een eigen allocator — één instantie speelt
 * akkoorden. De engine stuurt élke note-on/off door (niet alleen de
 * laatste, zoals bij VCO's).
 *
 * Controls: bank (0–8), program (0–31), coarse (semi), fine (ct), level.
 * Ports: out (audio). voct/gate/vel worden door de engine als
 * note-events aangeleverd.
 */
export class Dx7 extends AudioModule {
  static readonly typeId = 'tp_mmb_dx7';

  private static assets: Promise<{ wasm: Uint8Array | null; roms: Uint8Array }> | null = null;
  private static userBank: Uint8Array | null = null;
  private static readonly instances = new Set<Dx7>();
  /** Laatste laad-/worklet-fout, voor de UI (SimulationPanel). */
  static lastError: string | null = null;

  /** Korte statusregel voor de UI: backend + voice van de eerste instantie. */
  static info(): string | null {
    if (Dx7.lastError) return `DX7: ${Dx7.lastError}`;
    const first = Dx7.instances.values().next().value as Dx7 | undefined;
    if (!first) return null;
    if (!first.node) return 'DX7: worklet laden…';
    return `DX7 (${first.backend || '…'}): "${first.voiceName.trim()}"`;
  }

  /** Laadt ROMs (+ optioneel dx7.wasm) en registreert de worklet — één
   *  keer per context. Zonder dx7.wasm draait de worklet de JS-port van
   *  dezelfde kern (dx7-core.js), sample-exact getest. */
  static ensureLoaded(): Promise<{ wasm: Uint8Array | null; roms: Uint8Array }> {
    if (!Dx7.assets) {
      const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
      Dx7.assets = (async () => {
        const romsRes = await fetch(`${base}dx7/roms.bin`);
        if (!romsRes.ok) throw new Error('dx7/roms.bin niet gevonden');
        const roms = new Uint8Array(await romsRes.arrayBuffer());
        let wasm: Uint8Array | null = null;
        try {
          const w = await fetch(`${base}dx7/dx7.wasm`);
          if (w.ok && (w.headers.get('content-type') ?? '').includes('wasm')) wasm = new Uint8Array(await w.arrayBuffer());
        } catch { /* geen wasm: JS-kern */ }
        await Tone.getContext().addAudioWorkletModule(`${base}dx7/dx7-worklet.js`);
        return { wasm, roms };
      })();
      Dx7.assets.catch((err: unknown) => {
        Dx7.assets = null;
        Dx7.lastError = err instanceof Error ? err.message : String(err);
      });
    }
    return Dx7.assets;
  }

  /** USER-bank (4096 bytes packed, bank 8) voor alle instanties. */
  static setUserBank(data: Uint8Array | null): void {
    Dx7.userBank = data;
    if (data) for (const d of Dx7.instances) d.post({ t: 'userbank', data });
  }

  /** Naam van de actieve voice (10 tekens), bijgewerkt door de worklet. */
  voiceName = '';
  /** 'js' of 'wasm' — welke kern de worklet draait. */
  backend = '';

  readonly out: Tone.Gain;
  private node: AudioWorkletNode | null = null;
  private disposed = false;
  private pending: unknown[] = [];

  constructor(
    type: ModuleType,
    instance: ModuleInstance,
    initialControlValues: Record<string, ControlValue> = {},
  ) {
    super(type, instance, initialControlValues);
    this.out = new Tone.Gain(1);
    Dx7.instances.add(this);
    Dx7.ensureLoaded().then(({ wasm, roms }) => {
      if (this.disposed) return;
      const node = Tone.getContext().createAudioWorkletNode('mmb-dx7', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { wasm, roms, userBank: Dx7.userBank },
      });
      node.port.onmessage = (e: MessageEvent) => {
        if (e.data?.t === 'name') {
          this.voiceName = String(e.data.name);
          this.backend = String(e.data.backend ?? '');
        }
      };
      node.onprocessorerror = () => { Dx7.lastError = 'worklet-processor gecrasht'; };
      Tone.connect(node as unknown as AudioNode, this.out);
      this.node = node;
      Dx7.lastError = null;
      // Beginstand van de knoppen, dan de wachtrij.
      this.post({ t: 'bank',   v: num(this.controlValues['bank'], 0) });
      this.post({ t: 'prog',   v: num(this.controlValues['program'], 0) });
      this.post({ t: 'coarse', v: num(this.controlValues['coarse'], 0) });
      this.post({ t: 'fine',   v: num(this.controlValues['fine'], 0) });
      this.post({ t: 'level',  v: num(this.controlValues['level'], 0.8) });
      for (const m of this.pending) this.post(m);
      this.pending = [];
    }).catch((err: unknown) => {
      Dx7.lastError = err instanceof Error ? err.message : String(err);
      console.error('[dx7] worklet niet geladen:', err);
    });
  }

  get input(): Tone.ToneAudioNode { return this.out; }
  get output(): Tone.ToneAudioNode { return this.out; }

  private post(m: unknown): void {
    if (this.node) this.node.port.postMessage(m);
    else this.pending.push(m);
  }

  noteOn(midi: number, velocity01: number): void {
    const v = Math.max(1, Math.min(127, Math.round(velocity01 * 127)));
    this.post({ t: 'on', n: midi, v });
  }
  noteOff(midi: number): void { this.post({ t: 'off', n: midi }); }
  allOff(): void { this.post({ t: 'all' }); }

  protected override onControlChanged(id: string, value: ControlValue): void {
    const n = num(value, NaN);
    if (!Number.isFinite(n)) return;
    if (id === 'bank')    this.post({ t: 'bank', v: n });
    if (id === 'program') this.post({ t: 'prog', v: n });
    if (id === 'coarse')  this.post({ t: 'coarse', v: n });
    if (id === 'fine')    this.post({ t: 'fine', v: n });
    if (id === 'level')   this.post({ t: 'level', v: n });
  }

  update(): void { /* worklet rendert zelf */ }

  dispose(): void {
    this.disposed = true;
    Dx7.instances.delete(this);
    if (this.node) {
      this.node.port.postMessage({ t: 'dispose' });
      try { (this.node as unknown as AudioNode).disconnect(); } catch { /* al los */ }
      this.node = null;
    }
    this.out.dispose();
  }
}

function num(v: ControlValue | undefined, fallback: number): number {
  return typeof v === 'number' ? v : fallback;
}

registry.register(Dx7.typeId, (type, instance, initialControlValues) =>
  new Dx7(type, instance, initialControlValues),
);
