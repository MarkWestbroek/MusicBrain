// Poly-gedrag van de simulator, los van Tone — en daarmee testbaar zonder
// AudioContext. Twee dingen die samen polyfonie maken:
//
//   1. `expandPolyConnections` — de kabels van één getekende stem uitvouwen
//      naar alle stemmen, met dezelfde regels als `polyExpand.ts` voor de
//      firmware. Zonder dit hangt alleen de master aan de mixer en hoor je
//      stem 1, hoe dik het akkoord ook is.
//   2. `VoiceAllocator` — welke stem krijgt deze noot? Wasm-modules hebben er
//      één per groep; Tone-stemmen (VCO → VCF → VCA, elk hun eigen PolyGroup)
//      delen er één op stem-*index*, zodat stem v van elke groep bij elkaar
//      hoort.

import type { PatchConnection } from '../types';

export interface PolyExpandOptions {
  /** Master-id → alle leden inclusief de master, in stemvolgorde. */
  groups: ReadonlyMap<string, readonly string[]>;
  /** Multi-module-id → zijn master-cel (`mod#1`), voor construct B. */
  cellMasterOf: ReadonlyMap<string, string>;
  /** MIDI-In of sequencer? Die kabel blijft op de master staan. */
  isEventSource: (moduleId: string) => boolean;
}

/**
 * PolyGroups uitvouwen zoals `polyExpand` dat voor de firmware doet:
 *   global → groep : fan-out naar elke stem
 *   groep  → groep : stem v → stem v
 *   groep  → global: genummerde sink (`in1` → `in1..inN`) of anders een som
 *   event  → groep : blijft staan — MIDI-In en sequencer gaan via de
 *                    stemtoewijzer, die kiest welke stem de noot krijgt.
 * Werkt voor hele modules (construct A, `mod`) én voor cellen van een
 * multi-module (construct B, `mod#k` met poorten `voct_k`).
 */
export function expandPolyConnections(
  conns: readonly PatchConnection[], o: PolyExpandOptions,
): PatchConnection[] {
  if (o.groups.size === 0) return [...conns];
  const out: PatchConnection[] = [];
  const numbered = (id: string): { base: string; num: number } | null => {
    const m = /^(.*?)(\d+)$/.exec(id);
    return m ? { base: m[1]!, num: Number(m[2]) } : null;
  };
  // Cel-groepen (construct B): een kabel op de master-cel (`env_1`,
  // `cutoff_1`) staat voor alle cellen. Zelfde regels als hieronder voor
  // modules, maar dan op het poortnummer: cel → cel is stem k → stem k,
  // global → cel waaiert uit, cel → global gaat genummerd of als som.
  const cellPort = (id: string): { base: string; k: number } | null => {
    const m = /^(.*?)_(\d+)$/.exec(id);
    return m ? { base: m[1]!, k: Number(m[2]) } : null;
  };
  const cellGroupOf = (moduleId: string, portId: string): readonly string[] | null => {
    const cp = cellPort(portId);
    if (!cp || cp.k !== 1) return null;                       // alleen de master-cel draagt kabels
    const master = o.cellMasterOf.get(moduleId);
    return master ? o.groups.get(master) ?? null : null;
  };
  for (const c of conns) {
    const srcCells = cellGroupOf(c.from.moduleId, c.from.portId);
    const dstCells = cellGroupOf(c.to.moduleId, c.to.portId);
    const srcEvent = o.isEventSource(c.from.moduleId);
    if (srcCells || dstCells) {
      const N = (srcCells ?? dstCells)!.length;
      const sp = cellPort(c.from.portId), dp = cellPort(c.to.portId);
      if (srcCells && dstCells && srcCells.length === dstCells.length) {
        for (let v = 0; v < N; v++) out.push({ ...c, id: `${c.id}#v${v}`,
          from: { moduleId: c.from.moduleId, portId: `${sp!.base}_${v + 1}` },
          to:   { moduleId: c.to.moduleId,   portId: `${dp!.base}_${v + 1}` } });
      } else if (!srcCells && dstCells && !srcEvent) {
        for (let v = 0; v < N; v++) out.push({ ...c, id: `${c.id}#v${v}`,
          to: { moduleId: c.to.moduleId, portId: `${dp!.base}_${v + 1}` } });
      } else if (srcCells && !dstCells) {
        const n = numbered(c.to.portId);
        for (let v = 0; v < N; v++) out.push({ ...c, id: `${c.id}#v${v}`,
          from: { moduleId: c.from.moduleId, portId: `${sp!.base}_${v + 1}` },
          to: { moduleId: c.to.moduleId, portId: n ? `${n.base}${n.num + v}` : c.to.portId } });
      } else {
        out.push(c);                                          // MIDI-in/sequencer → master: de toewijzer doet de rest
      }
      continue;
    }
    const sg = o.groups.get(c.from.moduleId);
    const dg = o.groups.get(c.to.moduleId);
    if (!sg && dg && !srcEvent) {
      dg.forEach((id, v) => out.push({ ...c, id: `${c.id}#v${v}`, to: { moduleId: id, portId: c.to.portId } }));
    } else if (sg && !dg) {
      const n = numbered(c.to.portId);
      sg.forEach((id, v) => out.push({
        ...c, id: `${c.id}#v${v}`,
        from: { moduleId: id, portId: c.from.portId },
        to: { moduleId: c.to.moduleId, portId: n ? `${n.base}${n.num + v}` : c.to.portId },
      }));
    } else if (sg && dg && sg.length === dg.length) {
      sg.forEach((id, v) => out.push({
        ...c, id: `${c.id}#v${v}`,
        from: { moduleId: id, portId: c.from.portId },
        to: { moduleId: dg[v]!, portId: c.to.portId },
      }));
    } else {
      out.push(c);
    }
  }
  return out;
}

/**
 * Hoeveel stemmen MIDI-In speelt. Zelfde voorrang als `applyPatchVoiceCount()`
 * in de firmware: eerst `patch.voiceCount` (tab Patches, en wat het
 * MIDI-In-display toont); pas als die ontbreekt of ongeldig is de control
 * `voiceCount` op MIDI-In zelf. 0 = geen beperking (de hele groep speelt).
 */
export function patchVoiceLimit(patchVoiceCount: number | undefined, midiInControl: number | undefined): number {
  const pv = Math.round(patchVoiceCount ?? 0);
  if (pv >= 1) return pv;
  return Math.max(0, Math.round(midiInControl ?? 0));
}

/** Welke klinkende stem wordt afgepakt als alles bezet is. Spiegelt de
 *  STEAL-knop van MIDI-In en firmware `StealStrategy` {Oldest, Lowest, Highest}. */
export type StealStrategy = 'oldest' | 'lowest' | 'highest';

/** Welke ingedrukte toets de monofone stem volgt. PRIO-knop van MIDI-In. */
export type NotePriority = 'last' | 'low' | 'high';

/** PRIO-knop (0/1/2) → prioriteit. */
export function notePriorityOf(v: number): NotePriority {
  return v === 1 ? 'low' : v === 2 ? 'high' : 'last';
}

/**
 * De toetsen die nu ingedrukt zijn, in de volgorde waarin ze kwamen.
 *
 * Dit is het stukje dat een monofone synth zijn karakter geeft. Speel je een
 * lage noot terwijl je een hoge vasthoudt, dan gebeurt er in `high`-prioriteit
 * niets — en laat je de hoge los, dan zakt de stem terug naar de lage die nog
 * ligt. Beide referentie-implementaties die ik ernaast legde doen het zo:
 * Mutable's Yarns (`stmlib/algorithms/note_stack.h`, `note_by_priority`) en
 * Surge (`SurgeSynthesizer::releaseNotePostHoldCheck`, dat bij loslaten de
 * ingedrukte toetsen afzoekt op highest/lowest/latest).
 */
export class NoteStack {
  private held: number[] = [];        // aankomstvolgorde, oudste eerst
  private vel = new Map<number, number>();

  get size(): number { return this.held.length; }
  has(note: number): boolean { return this.held.includes(note); }
  clear(): void { this.held = []; this.vel.clear(); }

  press(note: number, velocity = 0.9): void {
    const i = this.held.indexOf(note);
    if (i >= 0) this.held.splice(i, 1);   // opnieuw aangeslagen = opnieuw de nieuwste
    this.held.push(note);
    this.vel.set(note, velocity);
  }
  release(note: number): void {
    const i = this.held.indexOf(note);
    if (i >= 0) this.held.splice(i, 1);
    this.vel.delete(note);
  }
  /** Aanslag waarmee deze toets is ingedrukt — de stem neemt die mee als hij
   *  bij het loslaten van een andere toets naar deze terugzakt. */
  velocityOf(note: number): number { return this.vel.get(note) ?? 0.9; }

  /** Welke toets de stem hoort te volgen; null als er niets ligt. */
  winner(priority: NotePriority): number | null {
    if (this.held.length === 0) return null;
    if (priority === 'last') return this.held[this.held.length - 1]!;
    let best = this.held[0]!;
    for (const n of this.held) {
      if (priority === 'low' ? n < best : n > best) best = n;
    }
    return best;
  }
}

/** STEAL-knop (0/1/2) → strategie. */
export function stealStrategyOf(v: number): StealStrategy {
  return v === 1 ? 'lowest' : v === 2 ? 'highest' : 'oldest';
}

/** Eén stem zoals de toewijzer hem ziet: welke noot klinkt er, en hoe oud. */
export interface VoiceState { note: number | null; age: number }

/**
 * Het beleid, los van waar de stemmen wonen — de Tone-toewijzer heeft ze in
 * een rij, de wasm-toewijzer in een Map per groep, maar de keuze is dezelfde:
 * dezelfde noot pakt zijn eigen stem terug (hertrigger), anders de eerste
 * vrije, anders stelen volgens `steal`.
 */
export function pickVoiceIndex(
  voices: readonly VoiceState[], midi: number, steal: StealStrategy = 'oldest',
): number {
  const n = voices.length;
  if (n === 0) return -1;
  for (let v = 0; v < n; v++) if (voices[v]!.note === midi) return v;
  // Vrije stem: die het lángst stil is, niet de laagste index. Anders krijgt
  // stem 1 elke noot en kappen we telkens dezelfde release-staart af, terwijl
  // de andere stemmen niets doen. Zo doet Yarns' voice_allocator het ook.
  let free = -1, freeAge = Infinity;
  for (let v = 0; v < n; v++) {
    const s = voices[v]!;
    if (s.note === null && s.age < freeAge) { freeAge = s.age; free = v; }
  }
  if (free >= 0) return free;
  let pick = 0, best = Infinity;
  for (let v = 0; v < n; v++) {
    // Bij 'lowest'/'highest' beslist de toonhoogte, en de leeftijd breekt de
    // gelijkstand — anders zou een akkoord met dubbele noten blijven hangen.
    const s = voices[v]!;
    const key = steal === 'lowest'  ? (s.note ?? 0)
              : steal === 'highest' ? -(s.note ?? 0)
              : s.age;
    if (key < best) { best = key; pick = v; }
  }
  return pick;
}

/**
 * Detune van stem `v` in unison, in volt (1 V/oct). Letterlijk de formule uit
 * `MidiInModule::spreadOffsetV()`: de stemmen waaieren symmetrisch uit over
 * ±0,5 × de spreiding, dus bij vier stemmen en 40 cent staat stem 1 op −20 ct
 * en stem 4 op +20 ct. Eén stem of geen spreiding = geen detune.
 */
export function unisonSpreadVolts(voice: number, voiceCount: number, spreadCents: number): number {
  if (spreadCents <= 0 || voiceCount <= 1 || voice >= voiceCount || voice < 0) return 0;
  const pos = voice / (voiceCount - 1) - 0.5;
  return pos * (spreadCents / 100) / 12;
}

/**
 * Stemtoewijzing op index: dezelfde noot pakt zijn eigen stem terug
 * (hertrigger), anders de eerste vrije, anders stelen volgens de STEAL-knop.
 */
export class VoiceAllocator {
  private voices: VoiceState[] = [];
  private age = 0;
  private steal: StealStrategy = 'oldest';

  /** Aantal stemmen; 0 = geen PolyGroup, alles blijft monofoon. */
  get size(): number { return this.voices.length; }

  resize(n: number): void {
    this.voices = Array.from({ length: Math.max(0, n) }, () => ({ note: null, age: 0 }));
    this.age = 0;
  }

  setSteal(s: StealStrategy): void { this.steal = s; }

  /** Stem voor een nieuwe noot, meteen bezet gezet. −1 = geen stemmen. */
  pick(midi: number): number {
    const v = pickVoiceIndex(this.voices, midi, this.steal);
    if (v < 0) return -1;
    this.voices[v]! = { note: midi, age: ++this.age };
    return v;
  }

  /** Welke stem houdt deze noot vast? −1 = geen. */
  voiceOf(midi: number): number {
    for (let v = 0; v < this.voices.length; v++) if (this.voices[v]!.note === midi) return v;
    return -1;
  }

  /** Stem vrijgeven; de leeftijd blijft staan, zodat "oudste" blijft kloppen. */
  release(v: number): void {
    const slot = this.voices[v];
    if (slot) slot.note = null;
  }

  releaseAll(): void {
    for (const slot of this.voices) slot.note = null;
  }

  /** Voor een doel dat op de master getekend is: het lid voor stem `v`. */
  static memberFor(members: readonly string[] | undefined, v: number, fallback: string): string {
    if (v < 0 || !members || members.length === 0) return fallback;
    return members[Math.min(v, members.length - 1)] ?? fallback;
  }
}
