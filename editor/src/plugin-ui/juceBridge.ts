// Brug tussen het paneel en de plugin (JUCE 8 webview). De JUCE-frontend-
// bibliotheek (juce_gui_extra/native/javascript/index.js) komt via de alias
// `@juce` uit de JUCE-checkout (vite.plugin-ui.config.ts). Buiten de plugin
// (gewone browser) is er geen `window.__JUCE__`: dan blijft alles lokaal.

import { getComboBoxState, getNativeFunction, getSliderState, getToggleState } from '@juce/index.js';

export type Kind = 'slider' | 'toggle' | 'combo';
export interface Handle { set(v: number | boolean): void; refresh(): void }

export const inPlugin = typeof window !== 'undefined' && '__JUCE__' in window;

/** Regel naar de plugin (stdout van de gastheer); buiten de plugin de console. */
export const log: (line: string) => void = inPlugin
  ? (() => { const f = getNativeFunction('mmbLog'); return (line) => { void f(line); }; })()
  : (line) => console.log(line);

/** Vraagt de plugin om een nieuwe vensterhoogte in px (breedte volgt de verhouding). */
export const resizeTo: (heightPx: number) => void = inPlugin
  ? (() => { const f = getNativeFunction('mmbResize'); return (h) => { void f(Math.round(h)); }; })()
  : () => {};

/** Bank van de plugin (sampler, TAPE STRIP); zie MmbPluginBase.h. */
export interface BankInfo { has: boolean; name: string; error: string; own: boolean; knob: number; note?: string; loading?: boolean }

type JuceBackend = { addEventListener(id: string, fn: (payload: unknown) => void): unknown };

/** Bank-stand opvragen en volgen; geeft een functie terug die het volgen stopt. */
export function watchBank(onInfo: (b: BankInfo) => void): () => void {
  if (!inPlugin) return () => {};
  void (getNativeFunction('mmbBankInfo')() as Promise<BankInfo>).then(onInfo);
  const backend = (window as unknown as { __JUCE__: { backend: JuceBackend & { removeEventListener(t: unknown): void } } }).__JUCE__.backend;
  const token = backend.addEventListener('mmbBank', (p) => onInfo(p as BankInfo));
  return () => backend.removeEventListener(token);
}
/** De banken met naam in de bankmap van de plugin (0..63), voor de bankkiezer. */
export async function bankList(): Promise<{ n: number; name: string }[]> {
  if (!inPlugin) return [];
  const r = await (getNativeFunction('mmbBankList')() as Promise<unknown>);
  return Array.isArray(r) ? r.map((x) => ({ n: Number((x as { n: unknown }).n), name: String((x as { name: unknown }).name) })) : [];
}
// ── MMB Patch (GenericPatch.h) ─────────────────────────────────────────
/** De patch die de plugin speelt: naam, de bediening-JSON (slimProject) en een fout. */
export interface PatchState { name: string; ui: string; error: string; warning?: string }
export async function patchGet(): Promise<PatchState | null> {
  if (!inPlugin) return null;
  const r = await (getNativeFunction('mmbPatchGet')() as Promise<PatchState | undefined>);
  return r ?? null;
}
/** Een andere patch laden: configuratie (patchPluginConfig), bediening-JSON en naam. */
export async function patchLoad(config: string, ui: string, name: string): Promise<{ ok: boolean; error: string; warning?: string }> {
  if (!inPlugin) return { ok: false, error: 'geen plugin' };
  const r = await (getNativeFunction('mmbPatchLoad')(config, ui, name) as Promise<{ ok: boolean; error: string; warning?: string } | undefined>);
  return r ?? { ok: false, error: 'geen antwoord van de plugin' };
}
/** Bestandskiezer van de plugin; het bestand komt binnen via watchPatchFile. */
export const choosePatchFile = (): void => { if (inPlugin) void getNativeFunction('mmbPatchChoose')(); };
export function watchPatchFile(onFile: (f: { name: string; text: string }) => void): () => void {
  if (!inPlugin) return () => {};
  const backend = (window as unknown as { __JUCE__: { backend: JuceBackend & { removeEventListener(t: unknown): void } } }).__JUCE__.backend;
  const token = backend.addEventListener('mmbPatchFile', (p) => onFile(p as { name: string; text: string }));
  return () => backend.removeEventListener(token);
}

export const chooseBank = (): void => { if (inPlugin) void getNativeFunction('mmbBankChoose')(); };
export const clearBank = (): void => { if (inPlugin) void getNativeFunction('mmbBankClear')(); };

/** Zo lang na de laatste beweging eindigt een draai (automatisering in Touch). */
const GESTURE_IDLE_MS = 400;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Vraagt de plugin opnieuw om de huidige stand (zoals de JUCE-bibliotheek
 *  zelf doet bij het aanmaken van een state). */
function requestInitial(identifier: string) {
  (window as unknown as { __JUCE__: { backend: { emitEvent(id: string, payload: unknown): void } } })
    .__JUCE__.backend.emitEvent(identifier, { eventType: 'requestInitialUpdate' });
}

/** Koppelt één bediening aan de relay met die naam; `onValue` krijgt elke
 *  waarde die van de plugin komt (ook de beginstand). */
export function attach(name: string, kind: Kind, onValue: (v: number | boolean) => void): Handle {
  if (!inPlugin) return { set: () => {}, refresh: () => {} };
  if (kind === 'slider') {
    const s = getSliderState(name);
    const push = () => { log(`${name} <- ${s.getScaledValue()} (norm ${s.getNormalisedValue()}, ${s.properties.start}..${s.properties.end})`); onValue(s.getScaledValue()); };
    s.valueChangedEvent.addListener(push);
    s.propertiesChangedEvent.addListener(push);
    // Een draai is een gebaar (begin/einde) voor de DAW: zonder dat neemt
    // Logic in Touch/Latch geen automatisering op. Het paneel meldt geen
    // loslaten, dus het gebaar eindigt na een korte rust.
    let gesture: number | undefined;
    return {
      set: (v) => {
        const p = s.properties;
        const span = p.end - p.start;
        if (!(span > 0)) return;
        const n = Math.pow(clamp01(((v as number) - p.start) / span), p.skew || 1);
        if (gesture === undefined) s.sliderDragStarted();
        else window.clearTimeout(gesture);
        s.setNormalisedValue(n);
        gesture = window.setTimeout(() => { gesture = undefined; s.sliderDragEnded(); }, GESTURE_IDLE_MS);
      },
      refresh: () => requestInitial(s.identifier),
    };
  }
  if (kind === 'combo') {
    const c = getComboBoxState(name);
    c.valueChangedEvent.addListener(() => { log(`${name} <- keuze ${c.getChoiceIndex()}`); onValue(c.getChoiceIndex()); });
    return { set: (v) => c.setChoiceIndex(Math.round(v as number)), refresh: () => requestInitial(c.identifier) };
  }
  const t = getToggleState(name);
  t.valueChangedEvent.addListener(() => { log(`${name} <- ${t.getValue()}`); onValue(t.getValue()); });
  return { set: (v) => t.setValue(Boolean(v)), refresh: () => requestInitial(t.identifier) };
}
