// Tests voor de grenzen uit foneemtijden (tts.ts) en het rekenwerk van de
// golfvorm-editor (SyllableEditor.tsx). De fonemen hieronder zijn echte
// uitvoer van Piper (stem nl_NL-pim-medium, tempo 1,3), omgerekend naar ms.

import { describe, expect, it } from 'vitest';

import type { Span } from './analyze';
import { edgesOf, mergeAt, moveEdge, splitAt } from './SyllableEditor';
import { consonantLetters, phonemeUnits, spansFromPhonemes, type TtsPhoneme } from './tts';

const RATE = 22050;
/** [foneem, lengte in ms] → TtsPhoneme[] */
function seq(list: [string, number][]): TtsPhoneme[] {
  let at = 0;
  return list.map(([p, ms]) => {
    const samples = Math.round((ms / 1000) * RATE);
    const ph = { p, start: at, samples };
    at += samples;
    return ph;
  });
}
const ms = (frames: number): number => (frames / RATE) * 1000;

const ZONNETJE = seq([['^', 360], ['z', 151], ['ˈ', 93], ['ɔ', 104], ['n', 93], ['ɛ', 104], ['t', 104], ['ʲ', 151], ['ə', 244], ['$', 81]]);
const SLAAP = seq([
  ['^', 325], ['s', 163], ['l', 93], ['ˈ', 70], ['a', 81], ['ː', 35], ['p', 70], [' ', 93],
  ['k', 23], ['ˈ', 46], ['ɪ', 81], ['n', 46], ['t', 81], ['j', 58], ['ə', 58], [' ', 116],
  ['s', 70], ['l', 81], ['ˈ', 128], ['a', 46], ['ː', 116], ['p', 174], ['$', 116],
]);
const KLEINE = seq([['^', 100], ['k', 60], ['l', 60], ['ˈ', 40], ['ɛ', 80], ['ɪ', 80], ['n', 60], ['ə', 120], ['$', 50]]);

describe('lyric/tts: grenzen uit foneemtijden', () => {
  it('telt medeklinkerletters aan het begin en eind van een lettergreep', () => {
    expect(consonantLetters('zon')).toEqual({ onset: 1, coda: 1 });
    expect(consonantLetters('tje')).toEqual({ onset: 2, coda: 0 });
    expect(consonantLetters('kind')).toEqual({ onset: 1, coda: 2 });
    expect(consonantLetters('klei')).toEqual({ onset: 2, coda: 0 });
    expect(consonantLetters('nijn')).toEqual({ onset: 1, coda: 1 });      // ij is een klinker
    expect(consonantLetters('a')).toEqual({ onset: 0, coda: 0 });
  });

  it('trekt klemtoon en lengte bij hun foneem, en maakt van een tweeklank één kern', () => {
    const z = phonemeUnits(ZONNETJE).units;
    expect(z.map((u) => (u.vowel ? 'V' : 'C')).join('')).toBe('CVCVCV');       // z ɔ n ɛ tʲ ə
    expect(ms(z[1]!.start)).toBeCloseTo(360 + 151, 0);                          // de ɔ begint bij zijn klemtoonteken
    const k = phonemeUnits(KLEINE).units;
    expect(k.map((u) => (u.vowel ? 'V' : 'C')).join('')).toBe('CCVCV');         // k l ɛɪ n ə
    expect(k[2]!.vowels).toBe(2);
  });

  it('zon-ne-tje: de n gaat mee met "ne", de tj met "tje"', () => {
    const spans = spansFromPhonemes(['zon', 'ne', 'tje'], ZONNETJE, RATE)!;
    expect(spans.length).toBe(3);
    expect(spans.map((s) => s.wordEnd)).toEqual([false, false, true]);
    expect(ms(spans[0]!.end)).toBeCloseTo(360 + 151 + 93 + 104, 0);             // tot en met de ɔ
    expect(spans[1]!.start).toBe(spans[0]!.end);                                // gedeelde grens
    expect(ms(spans[1]!.end)).toBeCloseTo(360 + 151 + 93 + 104 + 93 + 104, 0);  // n + ɛ
    expect(spans[2]!.start).toBe(spans[1]!.end);
    expect(ms(spans[0]!.start)).toBeLessThan(360);                              // een randje stilte ervoor
    expect(ms(spans[0]!.start)).toBeGreaterThan(330);
  });

  it('slaap kind-je slaap: drie woorden, vier lettergrepen', () => {
    const spans = spansFromPhonemes(['slaap', 'kind', 'je', 'slaap'], SLAAP, RATE)!;
    expect(spans.map((s) => s.wordEnd)).toEqual([true, false, true, true]);
    expect(spans[1]!.start).toBeGreaterThan(spans[0]!.end);                     // stilte tussen de woorden
    expect(spans[2]!.start).toBe(spans[1]!.end);
    // "kind|je": van n, t, j gaat alleen de j mee naar "je"
    const kStart = 325 + 163 + 93 + 70 + 81 + 35 + 70 + 93;
    expect(ms(spans[1]!.end)).toBeCloseTo(kStart + 23 + 46 + 81 + 46 + 81, 0);
    for (const s of spans) expect(s.end).toBeGreaterThan(s.start);
  });

  it('een tweeklank blijft één lettergreep, tenzij er meer getypt zijn', () => {
    expect(spansFromPhonemes(['klei', 'ne'], KLEINE, RATE)!.length).toBe(2);
    const three = spansFromPhonemes(['kle', 'i', 'ne'], KLEINE, RATE)!;
    expect(three.length).toBe(3);
    expect(three[1]!.start).toBe(three[0]!.end);
  });

  it('geeft null als het aantal kernen niet past', () => {
    expect(spansFromPhonemes(['zon', 'ne'], ZONNETJE, RATE)).toBeNull();        // te weinig getypt
    expect(spansFromPhonemes(['a', 'b', 'c', 'd', 'e'], ZONNETJE, RATE)).toBeNull();
    expect(spansFromPhonemes([], ZONNETJE, RATE)).toBeNull();
  });
});

describe('lyric/SyllableEditor: grenzen verschuiven', () => {
  const spans: Span[] = [
    { start: 100, end: 500, wordEnd: false },
    { start: 500, end: 900, wordEnd: true },
    { start: 1200, end: 1600, wordEnd: true },
  ];

  it('gedeelde grenzen tellen één keer', () => {
    const e = edgesOf(spans);
    expect(e.map((x) => x.frame)).toEqual([100, 500, 900, 1200, 1600]);
    expect(e[1]).toEqual({ frame: 500, endOf: 0, startOf: 1 });
    expect(e[2]).toEqual({ frame: 900, endOf: 1, startOf: null });
  });

  it('een gedeelde grens verschuift beide vakken, binnen de minimale lengte', () => {
    const e = edgesOf(spans)[1]!;
    const moved = moveEdge(spans, e, 650, 50, 2000);
    expect(moved[0]!.end).toBe(650);
    expect(moved[1]!.start).toBe(650);
    expect(moveEdge(spans, e, 0, 50, 2000)[0]!.end).toBe(150);                  // niet korter dan 50
    expect(moveEdge(spans, e, 5000, 50, 2000)[1]!.start).toBe(850);
    expect(spans[0]!.end).toBe(500);                                            // het origineel blijft
  });

  it('een losse rand botst niet op zijn buur', () => {
    const end = edgesOf(spans)[2]!;                                             // eind van vak 1
    expect(moveEdge(spans, end, 1500, 50, 2000)[1]!.end).toBe(1200);
    const start = edgesOf(spans)[3]!;                                           // begin van vak 2
    expect(moveEdge(spans, start, 0, 50, 2000)[2]!.start).toBe(900);
  });

  it('splitsen en samenvoegen', () => {
    const s = splitAt(spans, 300, 50);
    expect(s.length).toBe(4);
    expect(s[0]).toEqual({ start: 100, end: 300, wordEnd: false });
    expect(s[1]).toEqual({ start: 300, end: 500, wordEnd: false });
    expect(splitAt(spans, 1000, 50)).toBe(spans);                               // in de stilte: niets
    expect(splitAt(spans, 120, 50)).toBe(spans);                                // te dicht bij de rand
    const m = mergeAt(spans, edgesOf(spans)[1]!);
    expect(m.length).toBe(2);
    expect(m[0]).toEqual({ start: 100, end: 900, wordEnd: true });
    expect(mergeAt(spans, edgesOf(spans)[2]!)).toBe(spans);                     // geen gedeelde grens
  });
});

describe('lyric/preview: de lus laten horen', () => {
  it('houdt de klinker zo lang als gevraagd, zonder klikken op de naden', async () => {
    const { analyzeRecording, LYRIC_RATE: R } = await import('./analyze');
    const { renderSustainLoop } = await import('./preview');
    // dezelfde synthetische klinker als in lyric.test.ts, kort en zonder ruis
    const n = Math.round(0.35 * R);
    const src = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) { phase += 120 / R; if (phase >= 1) { phase -= 1; src[i] = 1; } }
    const y = new Float32Array(n);
    let y1 = 0, y2 = 0;
    const r = Math.exp((-Math.PI * 90) / R), a1 = 2 * r * Math.cos((2 * Math.PI * 700) / R), a2 = -r * r;
    for (let i = 0; i < n; i++) { const v = src[i]! + a1 * y1 + a2 * y2; y[i] = v * 0.05; y2 = y1; y1 = v; }
    const syl = analyzeRecording(y, R, { syllables: ['a'] })[0]!;
    expect(syl.sustainEnd).toBeGreaterThan(syl.sustainStart);
    const out = renderSustainLoop(syl, 1.0);
    expect(out.length).toBeGreaterThan(1.0 * R);
    expect(out.length).toBeLessThan(1.6 * R);
    // geen sprongen: het grootste verschil tussen twee samples blijft klein
    let maxJump = 0, peak = 0;
    for (let i = 1; i < out.length; i++) { maxJump = Math.max(maxJump, Math.abs(out[i]! - out[i - 1]!)); peak = Math.max(peak, Math.abs(out[i]!)); }
    expect(peak).toBeGreaterThan(0.01);
    expect(maxJump).toBeLessThan(peak * 0.6);
  });
});

describe('lyric/LyricModal: een bank opnieuw openen', () => {
  it('wordt weer opnames per woord, met dezelfde grenzen en lussen, en schrijft dezelfde bank terug', async () => {
    const { analyzeRecording, LYRIC_RATE: R } = await import('./analyze');
    const { buildLyricBank, fromAnalysis, parseLyricBank } = await import('./lyricBank');
    const { takesFromBank } = await import('./LyricModal');
    // twee woorden: "aa" en "aa-aa" (klinkers met stilte ertussen)
    const vowel = (secs: number): Float32Array => {
      const n = Math.round(secs * R), out = new Float32Array(n);
      let phase = 0, y1 = 0, y2 = 0;
      const r = Math.exp((-Math.PI * 90) / R), a1 = 2 * r * Math.cos((2 * Math.PI * 700) / R), a2 = -r * r;
      for (let i = 0; i < n; i++) {
        phase += 120 / R; let x = 0; if (phase >= 1) { phase -= 1; x = 1; }
        const v = x + a1 * y1 + a2 * y2; out[i] = v * 0.05; y2 = y1; y1 = v;
      }
      return out;
    };
    const gap = new Float32Array(Math.round(0.3 * R));
    const x = new Float32Array([...gap, ...vowel(0.3), ...gap, ...vowel(0.25), ...vowel(0.25), ...gap]);
    const syl = analyzeRecording(x, R, { syllables: ['aa', 'ba', 'ka'] });
    expect(syl.length).toBe(3);
    const bank = fromAnalysis('Test', syl);
    const takes = takesFromBank(parseLyricBank(buildLyricBank(bank)), 1);
    expect(takes.length).toBe(2);                                    // "aa" en "ba-ka"
    expect(takes[0]!.text).toBe('aa');
    expect(takes[1]!.text).toBe('ba-ka');
    expect(takes[1]!.spans!.length).toBe(2);
    expect(takes[1]!.origin).toBe('bank');
    // de lus uit de bank is overgenomen, en het geheel is weer een bank van drie lettergrepen
    const again = fromAnalysis('Test', takes.flatMap((t) => t.syllables));
    expect(again.syllables.length).toBe(3);
    again.syllables.forEach((s, i) => {
      expect(s.data.length).toBe(bank.syllables[i]!.data.length);
      expect(s.text).toBe(bank.syllables[i]!.text);
      expect(s.sustainEnd > s.sustainStart).toBe(bank.syllables[i]!.sustainEnd > bank.syllables[i]!.sustainStart);
    });
  });
});
