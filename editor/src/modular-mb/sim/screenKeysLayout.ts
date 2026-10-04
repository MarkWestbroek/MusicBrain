// Layout en hit-test van het schermtoetsenbord, los van React zodat het
// te testen is. Maten in "toetseneenheden" (een witte toets is W breed, het
// klavier H hoog); de component schaalt via een viewBox.

export interface KeyRect { midi: number; black: boolean; x: number; y: number; w: number; h: number; label: string }

export const KEY_W = 22;
export const KEY_H = 90;
const LABELS = ['C', '', 'D', '', 'E', 'F', '', 'G', '', 'A', '', 'B'];

/** Het klavier vanaf `startMidi` over `octaves` octaven, plus de C erboven. */
export function keyLayout(startMidi: number, octaves = 2, w = KEY_W, h = KEY_H): KeyRect[] {
  const keys: KeyRect[] = [];
  let white = 0;
  const n = octaves * 12 + 1;
  for (let i = 0; i < n; i++) {
    const midi = startMidi + i;
    const note = midi % 12;
    const black = [1, 3, 6, 8, 10].includes(note);
    if (black) {
      keys.push({ midi, black, x: white * w - w * 0.35, y: 0, w: w * 0.7, h: h * 0.6, label: '' });
    } else {
      keys.push({ midi, black, x: white * w, y: 0, w: w - 1, h, label: LABELS[note] ?? '' });
      white++;
    }
  }
  return keys;
}

export function layoutWidth(keys: KeyRect[]): number {
  return Math.max(0, ...keys.filter((k) => !k.black).map((k) => k.x + k.w + 1));
}

/** Welke toets ligt onder (x, y)? Zwarte toetsen liggen bovenop, dus die
 *  eerst. Buiten het klavier: null. */
export function keyAt(keys: KeyRect[], x: number, y: number): KeyRect | null {
  const hit = (k: KeyRect) => x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h;
  return keys.find((k) => k.black && hit(k)) ?? keys.find((k) => !k.black && hit(k)) ?? null;
}

/** Aanslagsterkte uit de plek op de toets: onderaan (bij de rand) hard,
 *  bovenaan zacht; 0,35..1. */
export function velocityAt(k: KeyRect, y: number): number {
  const t = Math.max(0, Math.min(1, (y - k.y) / k.h));
  return Math.round((0.35 + 0.65 * t) * 100) / 100;
}

/** Pitch bend uit horizontaal schuiven: één toetsbreedte opzij = het volle
 *  bereik (14-bits, 8192 = midden). */
export function bendFor(dx: number, w = KEY_W): number {
  const t = Math.max(-1, Math.min(1, dx / w));
  return Math.round(8192 + t * 8191);
}

/** Aftertouch uit omhoog schuiven na de aanslag: 0 op de aanslagplek, 127
 *  na 60 % van de toetshoogte omhoog; omlaag schuiven blijft 0. */
export function aftertouchFor(dy: number, h = KEY_H): number {
  const t = Math.max(0, Math.min(1, -dy / (0.6 * h)));
  return Math.round(t * 127);
}

// ── Wielen links van de toetsen: pitch bend (veert terug) en mod (blijft) ──

export const WHEEL_W = 11;          // breedte van één wiel
export const WHEELS_W = 2 * WHEEL_W + 8;   // het hele wielenblok incl. tussenruimte en rand

export type Wheel = 'bend' | 'mod';

/** Welk wiel ligt onder x (in de wielzone links van de toetsen)? */
export function wheelAt(x: number, y: number, h = KEY_H): Wheel | null {
  if (y < 0 || y > h) return null;
  if (x >= 2 && x < 2 + WHEEL_W) return 'bend';
  if (x >= 2 + WHEEL_W + 4 && x < 2 + 2 * WHEEL_W + 4) return 'mod';
  return null;
}

/** Pitch bend uit de plek op het wiel: midden = 8192, bovenaan 16383. */
export function bendFromY(y: number, h = KEY_H): number {
  const t = Math.max(-1, Math.min(1, (h / 2 - y) / (h / 2)));
  return Math.round(8192 + t * 8191);
}

/** Mod uit de plek op het wiel: onderaan 0, bovenaan 127. */
export function modFromY(y: number, h = KEY_H): number {
  return Math.round(Math.max(0, Math.min(1, (h - y) / h)) * 127);
}
