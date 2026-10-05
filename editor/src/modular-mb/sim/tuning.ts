// Stemtoon (A4): een persoonlijke instelling van de speler, los van de patch.
//
// De firmware voert hem uit in MIDI-IN (control `a4`, Hz): elke pitch-uitgang
// schuift log2(a4/440) V, zodat alle V/Oct-oscillators meegaan en A432 op
// elke patch 31,8 cent lager klinkt. De patch zelf kan `a4` ook zetten; de
// persoonlijke instelling gaat daar overheen zolang hij gezet is (zoals een
// master tune op een synth), en "volgens patch" laat de patch het zeggen.
//
// De editor zet de instelling op drie plekken: in de simulator (de engine
// telt de offset op bij elke pitch-kabel uit MIDI-IN, en bij het klavier-
// gemak), op de Teensy (controlPoke `a4` naar elke MIDI-IN van de actieve
// patch; vluchtig tot de firmware een apparaatinstelling heeft) en in de
// browser (onthouden).

const KEY = 'mb.tuning.a4';
const listeners = new Set<() => void>();

export const A4_MIN = 380;
export const A4_MAX = 500;
export const A4_PRESETS = [440, 432, 415, 442, 443] as const;

/** V/Oct-verschuiving die een stemtoon van `hz` betekent t.o.v. A440. */
export function tuneVolts(hz: number): number {
  return Math.log2(clampA4(hz) / 440);
}
export function clampA4(hz: number): number {
  return Math.min(A4_MAX, Math.max(A4_MIN, hz));
}
/** Wat er geldt: de persoonlijke instelling als die er is, anders de patch. */
export function effectiveA4(personal: number | null, patch: number | undefined): number {
  return clampA4(personal ?? patch ?? 440);
}

/** De persoonlijke stemtoon uit de browser, of null = volgens patch. */
export function loadA4(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v >= A4_MIN && v <= A4_MAX ? v : null;
  } catch { return null; }
}
export function saveA4(hz: number | null): void {
  try { if (hz === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(clampA4(hz))); } catch { /* geen opslag */ }
  for (const l of listeners) l();
}
export function subscribeA4(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
