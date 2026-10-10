// Bronnen voor UIT SAMPLE op Page 4 (doc/plans/fairlight.md §6.1): een
// audiobestand, een zone uit een samplebank of de laatste opname van de
// patch, allemaal naar mono Float32 met hun rate.

import { parseBank } from './sampleBank';
import { bankFileUrl, loadBankIndex } from './sim/bankAutoLoad';
import { lastTakeFor } from './sim/lastTakeStore';
import { noteOf } from './cmiAnalyse';

export interface MonoSound { x: Float32Array; rate: number; name: string; hintHz?: number }

const DECODE_RATE = 44100, MAX_SECONDS = 20;
const midiHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** Elk audioformaat dat de browser kent, naar mono (max 20 s). */
export async function decodeToMono(data: ArrayBuffer, name: string): Promise<MonoSound> {
  const ctx = new OfflineAudioContext(1, 1, DECODE_RATE);
  const b = await ctx.decodeAudioData(data);
  const n = Math.min(b.length, MAX_SECONDS * b.sampleRate);
  const x = new Float32Array(n);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const src = b.getChannelData(c);
    for (let i = 0; i < n; i++) x[i] = x[i]! + src[i]! / b.numberOfChannels;
  }
  return { x, rate: b.sampleRate, name };
}

/** De banken op de server. */
export async function serverBanks(): Promise<{ file: string; name: string }[]> {
  return (await loadBankIndex()).files.map((f) => ({ file: f.file, name: f.name }));
}

export interface BankZoneSound extends MonoSound { label: string }

/** Alle zones van een bank als geluid, met de root als hint voor de
 *  grondtoon. Zones die hetzelfde sample delen staan er één keer in. */
export async function bankZones(file: string): Promise<BankZoneSound[]> {
  const res = await fetch(bankFileUrl(file));
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  const { slots, zones } = parseBank(await res.arrayBuffer());
  const seen = new Set<number>();
  const out: BankZoneSound[] = [];
  for (const z of [...zones].sort((a, b) => a.root - b.root || b.highVel - a.highVel)) {
    if (seen.has(z.slot)) continue;
    const s = slots[z.slot];
    if (!s) continue;
    seen.add(z.slot);
    const n = Math.min(s.data.length / s.channels, MAX_SECONDS * s.rate);
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let c = 0; c < s.channels; c++) v += s.data[i * s.channels + c]!;
      x[i] = v / s.channels / 32768;
    }
    const hint = midiHz(z.root + (z.tuneCents ?? 0) / 100);
    out.push({ x, rate: s.rate, name: s.name ?? `zone ${z.slot}`, hintHz: hint, label: `${noteOf(hint).name}${s.name ? ` · ${s.name}` : ''}` });
  }
  return out;
}

/** De wav van de laatste opname van deze patch, of null. */
export async function lastTakeSound(patchId: string): Promise<MonoSound | null> {
  const f = lastTakeFor(patchId)?.take.files.find((t) => /\.wav$/i.test(t.name));
  return f ? decodeToMono(await f.blob.arrayBuffer(), f.name) : null;
}

/** Opnemen met de microfoon (ruw: geen echo-onderdrukking, ruisfilter of
 *  automatisch volume, die zouden de klank veranderen). `stop()` levert het
 *  geluid; na `maxSeconds` stopt hij vanzelf en roept `onAutoStop`. */
export async function startMicRecording(opts: { maxSeconds?: number; onAutoStop?: (s: Promise<MonoSound>) => void } = {}): Promise<{
  stop: () => Promise<MonoSound>; cancel: () => void;
}> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  let done: Promise<MonoSound> | null = null;
  const finish = (): Promise<MonoSound> => {
    done ??= new Promise<Blob>((resolve) => {
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); resolve(new Blob(chunks, { type: rec.mimeType })); };
      if (rec.state !== 'inactive') rec.stop(); else rec.onstop?.(new Event('stop'));
    }).then(async (blob) => decodeToMono(await blob.arrayBuffer(), `microfoon ${new Date().toLocaleTimeString()}`));
    return done;
  };
  const timer = setTimeout(() => opts.onAutoStop?.(finish()), (opts.maxSeconds ?? 10) * 1000);
  rec.start();
  return {
    stop: () => { clearTimeout(timer); return finish(); },
    cancel: () => { clearTimeout(timer); rec.onstop = null; if (rec.state !== 'inactive') rec.stop(); stream.getTracks().forEach((t) => t.stop()); },
  };
}
