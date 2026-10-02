// lyric/tts — tekst laten inspreken door de Piper-dienst (tools/piper-tts), en
// uit de foneemtijden die hij meestuurt de lettergreepgrenzen afleiden.
//
// De dienst geeft per foneem het begin en de lengte in samples. Wij weten
// welke lettergrepen de gebruiker typte ("zon-ne-tje"). Klinkers zijn de
// kernen; de medeklinkers ertussen verdelen we zoals de getypte lettergrepen
// het aangeven. Zo valt de grens precies, ook tussen twee klinkers zonder dal
// in de golfvorm ("zon-ne"), waar de energie-methode in analyze.ts moet
// gokken.

import type { Span } from './analyze';
import { SERVER_ENDPOINT, loadLlmConfig } from '../recipe/llm';

export interface TtsPhoneme { p: string; start: number; samples: number }
export interface TtsResult { rate: number; pcm: Int16Array; phonemes: TtsPhoneme[]; text: string; voice: string }
export interface TtsVoice { id: string; language: string; name: string; quality: string; rate: number; speakers: number }

export interface TtsSettings {
  /** Basis-URL van de dienst, zonder slash aan het eind. */
  endpoint: string;
  /** Toegangscode (dezelfde als voor de AI op de MusicBrain-server); leeg bij een lokale dienst. */
  code: string;
  voice: string;
  /** Spreektempo: 1 = normaal, hoger = trager (langere klinkers, makkelijker aan te houden). */
  lengthScale: number;
  /** Spreker binnen een meerstemmig model (mls heeft er 52); 0 = de eerste. */
  speaker: number;
}

const STORAGE_KEY = 'mmb.tts.v1';
export const TTS_DEFAULTS: TtsSettings = { endpoint: '/tts', code: '', voice: 'nl_NL-pim-medium', lengthScale: 1.3, speaker: 0 };
export const TTS_LOCAL_ENDPOINT = 'http://127.0.0.1:8788/tts';

export function loadTtsSettings(): TtsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...TTS_DEFAULTS, ...(JSON.parse(raw) as Partial<TtsSettings>) };
  } catch { /* geen opslag of kapotte inhoud */ }
  return { ...TTS_DEFAULTS };
}
export function saveTtsSettings(s: TtsSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* quota/private */ }
}

/** De toegangscode van het AI-profiel "MusicBrain-server", als dat er is. */
export function serverAiCode(): string {
  try {
    return loadLlmConfig().profiles.find((p) => p.endpoint === SERVER_ENDPOINT && p.apiKey.trim())?.apiKey.trim() ?? '';
  } catch { return ''; }
}

/** De code die we meesturen: de ingevulde, anders die van het AI-profiel (alleen naar de eigen server). */
export function effectiveCode(s: TtsSettings): string {
  if (s.code.trim()) return s.code.trim();
  return s.endpoint.startsWith('/') ? serverAiCode() : '';
}

function headers(s: TtsSettings): Record<string, string> {
  const code = effectiveCode(s);
  return { 'Content-Type': 'application/json', ...(code ? { Authorization: `Bearer ${code}` } : {}) };
}

async function fail(r: Response): Promise<never> {
  let msg = `${r.status}`;
  try { const j = await r.json() as { error?: string }; if (j.error) msg = j.error; } catch { /* geen json */ }
  throw new Error(msg);
}

export async function listVoices(s: TtsSettings): Promise<TtsVoice[]> {
  const r = await fetch(`${s.endpoint.replace(/\/$/, '')}/voices`, { headers: headers(s) });
  if (!r.ok) await fail(r);
  return await r.json() as TtsVoice[];
}

export async function speak(s: TtsSettings, text: string): Promise<TtsResult> {
  const r = await fetch(`${s.endpoint.replace(/\/$/, '')}/speak`, {
    method: 'POST', headers: headers(s),
    body: JSON.stringify({ text, voice: s.voice, lengthScale: s.lengthScale, ...(s.speaker ? { speaker: s.speaker } : {}) }),
  });
  if (!r.ok) await fail(r);
  const j = await r.json() as { rate: number; pcm: string; phonemes: TtsPhoneme[]; text: string; voice: string };
  const bin = atob(j.pcm);
  const bytes = new Uint8Array(bin.length - (bin.length & 1));
  for (let i = 0; i < bytes.length; i++) bytes[i] = bin.charCodeAt(i);
  return { rate: j.rate, pcm: new Int16Array(bytes.buffer), phonemes: j.phonemes, text: j.text, voice: j.voice };
}

// ── van fonemen naar lettergrepen ─────────────────────────────────────────

const IPA_VOWELS = new Set('aeiouyøœɛɔɑɪʏəɵæɐʊɒʌɜɨʉɯɤɘɞɶ'.split(''));
const LETTER_VOWELS = new Set('aeiouyäëïöüáéíóúàèìòùâêîôû'.split(''));

/** Een teken dat bij het vorige foneem hoort: lengte, palatalisatie, combinerende tekens. */
function attachesToPrevious(p: string): boolean {
  if (p === 'ː' || p === 'ˑ') return true;
  const c = p.codePointAt(0) ?? 0;
  return (c >= 0x02B0 && c <= 0x02FF && p !== 'ˈ' && p !== 'ˌ') || (c >= 0x0300 && c <= 0x036F);
}
const isStress = (p: string): boolean => p === 'ˈ' || p === 'ˌ';
const isGap = (p: string): boolean => p === ' ' || p === '^' || p === '$' || /^[.,;:!?\-—…"'()]$/.test(p);

interface Unit { vowel: boolean; start: number; end: number; word: number; vowels: number }

/** Fonemen → eenheden (klinker of medeklinker) per woord; klemtoon en lengte zijn erbij getrokken. */
export function phonemeUnits(phonemes: TtsPhoneme[]): { units: Unit[]; total: number } {
  const units: Unit[] = [];
  let word = 0, pendingStart = -1, sawUnitInWord = false, total = 0;
  for (const ph of phonemes) {
    const end = ph.start + ph.samples;
    if (end > total) total = end;
    if (isGap(ph.p)) {
      if (sawUnitInWord) { word++; sawUnitInWord = false; }
      pendingStart = -1;
      continue;
    }
    if (isStress(ph.p)) { if (pendingStart < 0) pendingStart = ph.start; continue; }
    const last = units[units.length - 1];
    if (attachesToPrevious(ph.p) && last && last.word === word) { last.end = end; continue; }
    const vowel = IPA_VOWELS.has(ph.p[0]!.toLowerCase());
    const start = pendingStart >= 0 ? pendingStart : ph.start;
    pendingStart = -1;
    // Twee klinkers achter elkaar in één woord = tweeklank: één kern.
    if (vowel && last && last.vowel && last.word === word) { last.end = end; last.vowels++; continue; }
    units.push({ vowel, start, end, word, vowels: vowel ? 1 : 0 });
    sawUnitInWord = true;
  }
  return { units, total };
}

/** Aantal medeklinkerletters aan het begin (onset) en eind (coda) van een getypte lettergreep. */
export function consonantLetters(syllable: string): { onset: number; coda: number } {
  const s = syllable.toLowerCase().replace(/[^a-zäëïöüáéíóúàèìòùâêîôû]/g, '');
  const vowelAt = (i: number): boolean =>
    LETTER_VOWELS.has(s[i]!) || (s[i] === 'j' && i > 0 && s[i - 1] === 'i');       // ij
  let onset = 0;
  while (onset < s.length && !vowelAt(onset)) onset++;
  let coda = 0;
  while (coda < s.length - onset && !vowelAt(s.length - 1 - coda)) coda++;
  return { onset, coda };
}

/**
 * Lettergreepgrenzen (in samples op de rate van de dienst) uit de fonemen en
 * de getypte lettergrepen. Geeft `null` als het aantal klinkerkernen niet op
 * het aantal lettergrepen uitkomt; de aanroeper valt dan terug op de
 * analyse van de golfvorm.
 */
export function spansFromPhonemes(syllables: string[], phonemes: TtsPhoneme[], rate: number): Span[] | null {
  const { units, total } = phonemeUnits(phonemes);
  if (syllables.length === 0 || units.length === 0) return null;

  // Tweeklanken splitsen als er meer lettergrepen getypt zijn dan kernen
  // ("be-amen": e en a zijn twee lettergrepen).
  let nuclei = units.filter((u) => u.vowel).length;
  while (nuclei < syllables.length) {
    let k = -1;
    units.forEach((u, i) => {
      if (u.vowel && u.vowels > 1 && (k < 0 || u.end - u.start > units[k]!.end - units[k]!.start)) k = i;
    });
    if (k < 0) return null;
    const u = units[k]!;
    const mid = Math.round(u.start + (u.end - u.start) / u.vowels);
    units.splice(k, 1,
      { vowel: true, start: u.start, end: mid, word: u.word, vowels: 1 },
      { vowel: true, start: mid, end: u.end, word: u.word, vowels: u.vowels - 1 });
    nuclei++;
  }
  if (nuclei !== syllables.length) return null;

  const pad = Math.round(rate * 0.012);
  const nucleusAt: number[] = [];
  units.forEach((u, i) => { if (u.vowel) nucleusAt.push(i); });

  // Waar begint lettergreep s? Bij de eerste medeklinker van zijn onset.
  const startUnit = (s: number): number => {
    const n = nucleusAt[s]!;
    if (s === 0) return 0;
    const prev = nucleusAt[s - 1]!;
    if (units[n]!.word !== units[prev]!.word) {
      // nieuw woord: alles vanaf het eerste foneem van dat woord
      let i = n;
      while (i - 1 > prev && units[i - 1]!.word === units[n]!.word) i--;
      return i;
    }
    const between = n - prev - 1;                        // medeklinkers tussen de twee kernen
    if (between <= 0) return n;
    const { onset } = consonantLetters(syllables[s]!);
    const { coda } = consonantLetters(syllables[s - 1]!);
    let take: number;
    if (onset + coda === 0) take = 1;
    else take = Math.round((between * onset) / (onset + coda));
    if (onset > 0 && take < 1) take = 1;
    if (coda > 0 && take > between - 1 && between > 1) take = between - 1;
    if (onset === 0) take = 0;
    take = Math.max(0, Math.min(between, take));
    return n - take;
  };

  const spans: Span[] = [];
  for (let s = 0; s < syllables.length; s++) {
    const first = startUnit(s);
    const lastUnit = s + 1 < syllables.length ? startUnit(s + 1) - 1 : units.length - 1;
    const a = units[first]!, b = units[Math.max(first, lastUnit)]!;
    const nextWord = s + 1 < syllables.length ? units[nucleusAt[s + 1]!]!.word : -1;
    const wordEnd = nextWord !== a.word;
    const prevSameWord = s > 0 && units[nucleusAt[s - 1]!]!.word === a.word;
    spans.push({
      start: Math.max(0, a.start - (prevSameWord ? 0 : pad)),
      end: Math.min(total, b.end + (wordEnd ? pad : 0)),
      wordEnd,
    });
  }
  return spans.every((sp) => sp.end - sp.start > 16) ? spans : null;
}
