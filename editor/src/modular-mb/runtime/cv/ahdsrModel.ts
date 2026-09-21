// De AHDSR zoals de firmware hem rekent (firmware/core/src/runtime/Ahdsr.cpp),
// als los model zonder Tone — zodat hij zonder browser te testen is.
//
// Waarom niet gewoon Tone.Envelope: die heeft standaard een *exponentiële*
// decay en release, met als tijdconstante ln(tijd + 1) / ln(200). Bij een
// release van 400 ms is dat 63 ms: na 190 ms staat Tone op 5 %, de Teensy op
// 52 %. Op de Teensy klonk dezelfde patch daardoor veel trager. Bovendien
// kende Tone de Lin/Exp/Log-schakelaar niet, geen echte hold, en geen Reset.
//
// De firmware-semantiek, hier in continue tijd (ms) in plaats van 1 kHz-ticks:
//   gate open   vanuit Zero                → attack vanaf 0
//               vanuit Decay/Sustain/Release → attack gaat verder vanaf de
//                 huidige waarde (p = waarde, net als phaseTicks = v·Ta)
//               vanuit Attack/Hold          → niets (plakkende gate)
//               met Reset (retrig)          → altijd opnieuw vanaf 0
//   gate dicht  vanuit A/H/D/S              → release vanaf de huidige waarde,
//                                             altijd de volle releasetijd
//   loop        na de release weer attack → hold → decay → sustain
// De curve (0 Lin, 1 Exp = p², 2 Log = 1 − (1−p)²) geldt voor attack, decay en
// release; hold en sustain zijn vlak.

export type AhdsrCurve = 0 | 1 | 2;
export type AhdsrPhase = 'zero' | 'attack' | 'hold' | 'decay' | 'sustain' | 'release';

export interface AhdsrParams {
  /** ms */ attack: number;
  /** ms */ hold: number;
  /** ms */ decay: number;
  /** 0…1 */ sustain: number;
  /** ms */ release: number;
  curve: AhdsrCurve;
  loop: boolean;
  /** Reset: elke aanslag vanaf 0 (consistente filter-wah). */
  retrig: boolean;
}

/** `Ahdsr::shape()` uit de firmware, letterlijk. */
export function ahdsrShape(p: number, curve: AhdsrCurve): number {
  const q = p < 0 ? 0 : p > 1 ? 1 : p;
  if (curve === 1) return q * q;
  if (curve === 2) { const r = 1 - q; return 1 - r * r; }
  return q;
}

/** Eén stuk van de envelope. `at(u)` geeft de waarde bij u = 0…1 binnen het stuk. */
interface Segment {
  phase: AhdsrPhase;
  t0: number;
  dur: number;               // Infinity = de rustfase aan het eind (sustain of zero)
  at: (u: number) => number;
}

export class AhdsrModel {
  params: AhdsrParams;
  /** Wat er vanaf de laatste gate-flank gaat gebeuren, tot en met de rustfase. */
  private plan: Segment[] = [{ phase: 'zero', t0: -Infinity, dur: Infinity, at: () => 0 }];

  constructor(params: AhdsrParams) { this.params = { ...params }; }

  /** Fase en waarde op tijdstip t (ms). */
  stateAt(t: number): { phase: AhdsrPhase; value: number } {
    let seg = this.plan[0]!;
    for (const s of this.plan) { if (s.t0 <= t) seg = s; else break; }
    if (!Number.isFinite(seg.dur)) return { phase: seg.phase, value: seg.at(1) };
    // Voorbij het eind van een eindig stuk (kan alleen bij afronding) → einde.
    const u = seg.dur <= 0 ? 1 : Math.min(1, (t - seg.t0) / seg.dur);
    return { phase: seg.phase, value: seg.at(u) };
  }

  /**
   * Gate-flank op tijdstip t (ms). Geeft `true` als de envelope een nieuwe
   * koers krijgt (dan moet de automation opnieuw gepland worden), `false` als
   * de firmware deze flank negeert.
   */
  gate(open: boolean, t: number): boolean {
    const { phase, value } = this.stateAt(t);
    const p = this.params;
    if (open) {
      if (p.retrig) { this.plan = this.attackPlan(t, 0); return true; }
      if (phase === 'attack' || phase === 'hold') return false;
      const a0 = phase === 'zero' ? 0 : value * p.attack;
      this.plan = this.attackPlan(t, a0);
      return true;
    }
    if (phase === 'zero' || phase === 'release') return false;
    this.plan = this.releasePlan(t, value);
    return true;
  }

  /**
   * Punten (tijd in ms, waarde) om de automation mee te tekenen, vanaf de
   * laatste flank tot en met het begin van de rustfase. Lineaire stukken
   * hebben genoeg aan hun eindpunten; Exp/Log krijgen er 32 per stuk.
   */
  points(): Array<[number, number]> {
    const pts: Array<[number, number]> = [];
    for (const s of this.plan) {
      if (!Number.isFinite(s.t0)) continue;
      if (!Number.isFinite(s.dur)) { pts.push([s.t0, s.at(1)]); break; }
      const steps = s.dur <= 0 ? 1
        : (this.params.curve === 0 || s.phase === 'hold') ? 1 : 32;
      for (let i = 0; i <= steps; i++) {
        const u = s.dur <= 0 ? 1 : i / steps;
        pts.push([s.t0 + s.dur * u, s.at(u)]);
      }
    }
    return pts;
  }

  private attackPlan(t: number, a0: number): Segment[] {
    const { attack: A, hold: H, decay: D, sustain: S, curve } = this.params;
    const out: Segment[] = [];
    let tt = t;
    const aDur = Math.max(0, A - a0);
    out.push({ phase: 'attack', t0: tt, dur: aDur,
               at: (u) => (A > 0 ? ahdsrShape((a0 + u * aDur) / A, curve) : 1) });
    tt += aDur;
    if (H > 0) { out.push({ phase: 'hold', t0: tt, dur: H, at: () => 1 }); tt += H; }
    out.push({ phase: 'decay', t0: tt, dur: Math.max(0, D),
               at: (u) => 1 - (1 - S) * ahdsrShape(D > 0 ? u : 1, curve) });
    tt += Math.max(0, D);
    out.push({ phase: 'sustain', t0: tt, dur: Infinity, at: () => S });
    return out;
  }

  private releasePlan(t: number, from: number): Segment[] {
    const { release: R, curve, loop } = this.params;
    const dur = Math.max(0, R);
    const rel: Segment = { phase: 'release', t0: t, dur,
                           at: (u) => from * (1 - ahdsrShape(dur > 0 ? u : 1, curve)) };
    if (loop) return [rel, ...this.attackPlan(t + dur, 0)];
    return [rel, { phase: 'zero', t0: t + dur, dur: Infinity, at: () => 0 }];
  }
}
