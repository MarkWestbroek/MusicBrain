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
