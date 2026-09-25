// Samplebank vanzelf in de simulator (ED-SIM-BANK) — de bank die een
// SAMPLER-module met zijn Bank-knop (NN, 0–15) aanwijst wordt van de server
// gehaald (public/banks/, zie banks/index.json) en in de sampler-wasm gezet.
// Niemand hoeft meer via 🎹 Multisample een bestand van schijf te kiezen.
//
// Welk bestand hoort bij NN? In deze volgorde:
//   1. Teensy verbonden en de SD-kaart meldt een naam voor NN
//      (status.sdBankNames[NN]) → de serverbank met dezelfde naam;
//   2. een keuze die je in de simulatie maakte (onthouden per NN);
//   3. de standaardindeling in banks/index.json.
// De sampler-wasm heeft één bank voor alle instanties (WasmModule.setBlob
// per type), dus de laatst gevraagde bank wint.

import { WasmModule } from '../runtime';
import { parseBank } from '../sampleBank';

const TYPE_ID = 'tp_mmb_sampler';
const PICK_KEY = 'mmb.sim.bankPick.v1';

export interface BankIndexEntry { file: string; name: string; size: number }
export interface BankIndex { files: BankIndexEntry[]; defaults: Record<string, string> }

const base = (): string => ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/').replace(/\/?$/, '/');

let indexP: Promise<BankIndex> | null = null;
export function loadBankIndex(): Promise<BankIndex> {
  indexP ??= fetch(`${base()}banks/index.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() as Promise<BankIndex> : { files: [], defaults: {} }))
    .catch(() => ({ files: [], defaults: {} }));
  return indexP;
}

export function userPicks(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(PICK_KEY) ?? '{}') as Record<string, string>; } catch { return {}; }
}
export function setUserPick(nn: number, file: string | null): void {
  const m = userPicks();
  if (file) m[String(nn)] = file; else delete m[String(nn)];
  try { localStorage.setItem(PICK_KEY, JSON.stringify(m)); } catch { /* geen opslag */ }
}

export type BankSource = 'teensy' | 'keuze' | 'standaard';

/** Welk serverbestand hoort bij bank NN (zonder te laden). */
export function resolveBank(index: BankIndex, nn: number, sdNames?: (string | undefined)[]): { file: string; source: BankSource } | null {
  const sd = sdNames?.[nn]?.trim();
  if (sd) {
    const hit = index.files.find((f) => f.name.trim().toLowerCase() === sd.toLowerCase());
    if (hit) return { file: hit.file, source: 'teensy' };
  }
  const pick = userPicks()[String(nn)];
  if (pick && index.files.some((f) => f.file === pick)) return { file: pick, source: 'keuze' };
  const def = index.defaults[String(nn)];
  return def ? { file: def, source: 'standaard' } : null;
}

export interface LoadedBank { nn: number; file: string; name: string; source: BankSource; summary: string }
let loaded: LoadedBank | null = null;
let inflight: Promise<LoadedBank | null> | null = null;
let inflightKey = '';
export function currentBank(): LoadedBank | null { return loaded; }

/** Zorg dat bank NN in de sampler-wasm staat; doet niets als hij er al staat. */
export async function ensureSamplerBank(nn: number, sdNames?: (string | undefined)[], force = false): Promise<LoadedBank | null> {
  const index = await loadBankIndex();
  const r = resolveBank(index, nn, sdNames);
  if (!r) return null;
  const key = `${nn}:${r.file}`;
  if (!force && loaded && `${loaded.nn}:${loaded.file}` === key) return loaded;
  if (inflight && inflightKey === key) return inflight;
  inflightKey = key;
  inflight = (async () => {
    const res = await fetch(`${base()}banks/${encodeURIComponent(r.file)}`);
    if (!res.ok) throw new Error(`${r.file} niet op de server (${res.status})`);
    const { name, slots, zones } = parseBank(await res.arrayBuffer());
    slots.forEach((s, i) => WasmModule.setBlob(TYPE_ID, i, s.data, s.rate, s.name ?? '', s.channels));
    WasmModule.setZones(TYPE_ID, zones);
    loaded = { nn, file: r.file, name: name || r.file, source: r.source, summary: `${slots.length} samples, ${zones.length} zones` };
    return loaded;
  })().finally(() => { inflight = null; });
  return inflight;
}
