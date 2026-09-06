// wavRecorder — de master-som van de simulator wegschrijven als WAV.
//
// Waarom dit bestaat: om browsergeluid op te nemen moest je op de Mac langs
// een virtueel audioapparaat (BlackHole + een apparaat met meerdere
// uitvoerkanalen) en dan in een DAW mee-luisteren. Dat is een omweg langs het
// luidsprekerpad, met klokdrift tussen twee apparaten en rondzing-risico. Hier
// tappen we de graaf rechtstreeks af: wat de engine optelt, komt bit voor bit
// in het bestand.
//
// De aftakking loopt via een AudioWorklet (`public/rec/tap-worklet.js`), niet
// via `MediaRecorder`: die laatste levert Opus, en een lossy codec is geen
// bron voor een samplerbank.
//
// `encodeWav()` is zuiver — los te testen onder node, zie wavRecorder.test.ts.

import * as Tone from 'tone';
import { addWorkletModule } from '../runtime/audio/workletLoader';

/** `i24` is de standaard: verliesvrij genoeg (de bank is int16), en zowel
 *  REAPER als `decodeAudioData` lezen het zonder mokken. `f32` is bit-exact
 *  wat de engine uitrekende, `i16` alleen voor krappe SD-kaarten. */
export type WavFormat = 'i16' | 'i24' | 'f32';

const BYTES: Record<WavFormat, number> = { i16: 2, i24: 3, f32: 4 };

export function encodeWav(
  channels: Float32Array[], sampleRate: number, format: WavFormat = 'i24',
): ArrayBuffer {
  const ch = channels.length;
  if (ch === 0) throw new Error('encodeWav: geen kanalen');
  const frames = channels[0]!.length;
  for (const c of channels) {
    if (c.length !== frames) throw new Error('encodeWav: kanalen zijn ongelijk lang');
  }

  const bytes = BYTES[format];
  const isFloat = format === 'f32';
  const dataBytes = frames * ch * bytes;
  // PCM heeft genoeg aan een fmt-chunk van 16 bytes; drijvende komma hoort
  // volgens de RIFF-spec cbSize + een fact-chunk te krijgen. De meeste lezers
  // trekken zich er niets van aan, maar de strenge exemplaren wel.
  const fmtSize = isFloat ? 18 : 16;
  const factSize = isFloat ? 12 : 0;
  const headerBytes = 12 + (8 + fmtSize) + factSize + 8;

  const buf = new ArrayBuffer(headerBytes + dataBytes);
  const dv = new DataView(buf);
  let p = 0;
  const str = (s: string): void => { for (let i = 0; i < s.length; i++) dv.setUint8(p++, s.charCodeAt(i)); };
  const u32 = (v: number): void => { dv.setUint32(p, v, true); p += 4; };
  const u16 = (v: number): void => { dv.setUint16(p, v, true); p += 2; };

  str('RIFF'); u32(headerBytes - 8 + dataBytes); str('WAVE');
  str('fmt '); u32(fmtSize);
  u16(isFloat ? 3 : 1);          // 3 = IEEE_FLOAT, 1 = PCM
  u16(ch);
  u32(sampleRate);
  u32(sampleRate * ch * bytes);  // bytes per seconde
  u16(ch * bytes);               // block align
  u16(bytes * 8);
  if (isFloat) { u16(0); str('fact'); u32(4); u32(frames); }
  str('data'); u32(dataBytes);

  if (isFloat) {
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < ch; c++) { dv.setFloat32(p, channels[c]![i]!, true); p += 4; }
    }
  } else if (format === 'i16') {
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < ch; c++) { dv.setInt16(p, Math.round(clamp1(channels[c]![i]!) * 32767), true); p += 2; }
    }
  } else {
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < ch; c++) {
        const s = Math.round(clamp1(channels[c]![i]!) * 8388607);
        dv.setUint8(p++, s & 0xff); dv.setUint8(p++, (s >> 8) & 0xff); dv.setUint8(p++, (s >> 16) & 0xff);
      }
    }
  }
  return buf;
}

function clamp1(v: number): number {
  return v > 1 ? 1 : v < -1 ? -1 : Number.isFinite(v) ? v : 0;
}

export function peakOf(channels: Float32Array[]): number {
  let peak = 0;
  for (const c of channels) for (const v of c) { const a = Math.abs(v); if (a > peak) peak = a; }
  return peak;
}

/** Piek in dBFS, of null bij digitale stilte (log(0) is geen getal om te tonen). */
export function dbfs(peak: number): number | null {
  return peak > 0 ? 20 * Math.log10(peak) : null;
}

export interface RecordResult {
  channels: Float32Array[];
  sampleRate: number;
  frames: number;
  seconds: number;
  /** Lineaire piek 0..1; boven 1 heeft de som van de modules geklipt. */
  peak: number;
  clipped: boolean;
}

/**
 * MasterRecorder — hangt een tap aan een Tone-node en verzamelt de blokken.
 *
 * Eén exemplaar per paneel is genoeg; `start()` weigert een tweede opname
 * zolang de eerste loopt.
 */
export class MasterRecorder {
  private node: AudioWorkletNode | null = null;
  private sink: Tone.Gain | null = null;
  private source: Tone.Gain | null = null;
  private parts: Float32Array[][] = [];
  private frameCount = 0;
  private rate = 48000;
  private readonly chans = 2;
  private onFlushed: (() => void) | null = null;

  get active(): boolean { return this.node !== null; }
  get frames(): number { return this.frameCount; }
  get seconds(): number { return this.rate > 0 ? this.frameCount / this.rate : 0; }

  async start(source: Tone.Gain): Promise<void> {
    if (this.node) return;
    await Tone.start();
    const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
    await addWorkletModule(`${base}rec/tap-worklet.js`);

    const ctx = Tone.getContext();
    this.rate = ctx.sampleRate;
    this.parts = [];
    this.frameCount = 0;

    // Via `ctx.createAudioWorkletNode`, niet via `new AudioWorkletNode(raw…)`:
    // Tone's rawContext is niet altijd een echte BaseAudioContext (het kan de
    // schil van standardized-audio-context zijn), en de globale constructor
    // weigert die dan met "parameter 1 is not of type 'BaseAudioContext'".
    // Dezelfde route als WasmModule dus.
    //
    // channelCountMode 'explicit' zorgt dat een mono bron netjes naar stereo
    // wordt opgewaardeerd in plaats van dat we één kanaal missen.
    const node = ctx.createAudioWorkletNode('mmb-tap', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [this.chans],
      channelCount: this.chans,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
      processorOptions: { channels: this.chans },
    });
    node.port.onmessage = (e: MessageEvent): void => {
      const d = e.data as { chunks?: Float32Array[]; done?: boolean };
      if (d.chunks && d.chunks.length > 0) {
        this.parts.push(d.chunks);
        this.frameCount += d.chunks[0]!.length;
      }
      if (d.done) { this.onFlushed?.(); this.onFlushed = null; }
    };

    // De worklet zwijgt, maar een node waarvan de uitgang nergens heen gaat
    // wordt niet overal aangeslingerd. Een gain op 0 houdt hem draaiend
    // zonder dat je er iets van hoort.
    const sink = new Tone.Gain(0);
    Tone.connect(node, sink);
    sink.toDestination();
    Tone.connect(source, node);

    this.node = node; this.sink = sink; this.source = source;
  }

  async stop(): Promise<RecordResult> {
    const node = this.node;
    if (!node) throw new Error('MasterRecorder: er loopt geen opname');

    // Wachten op de staart, maar niet eindeloos: hapert de audiothread, dan
    // is een opname zonder laatste blok beter dan een knop die blijft hangen.
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => { if (!done) { done = true; resolve(); } };
      this.onFlushed = finish;
      node.port.postMessage('stop');
      setTimeout(finish, 300);
    });

    try { Tone.disconnect(this.source!, node); } catch { /* al los */ }
    node.port.onmessage = null;
    node.disconnect();
    this.sink?.dispose();
    this.node = null; this.sink = null; this.source = null;

    const channels = this.merge();
    this.parts = [];
    const peak = peakOf(channels);
    return {
      channels, sampleRate: this.rate, frames: this.frameCount,
      seconds: this.seconds, peak, clipped: peak > 1,
    };
  }

  private merge(): Float32Array[] {
    const out: Float32Array[] = [];
    for (let c = 0; c < this.chans; c++) {
      const dst = new Float32Array(this.frameCount);
      let off = 0;
      for (const part of this.parts) {
        const src = part[c];
        if (src) { dst.set(src, off); off += src.length; }
      }
      out.push(dst);
    }
    return out;
  }
}

/** Bestandsnaam zonder spaties of accenten, met een sorteerbare tijdstempel. */
export function wavFileName(patchName: string, when = new Date()): string {
  const slug = patchName.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'patch';
  const p2 = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${when.getFullYear()}${p2(when.getMonth() + 1)}${p2(when.getDate())}`
              + `-${p2(when.getHours())}${p2(when.getMinutes())}${p2(when.getSeconds())}`;
  return `mmb-${slug}-${stamp}.wav`;
}

export function downloadWav(data: ArrayBuffer, filename: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: 'audio/wav' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
