// Opslag en geheugen van de Teensy, zoals de status ze meldt — omgezet naar
// korte teksten voor de statusbalk. Los van React, zodat het te testen is.
//
// De firmware kijkt één keer, bij het opstarten, wat er op de SD-kaart staat
// (hij leest de kaart ook alleen dan). Een kaart verwisselen zonder herstart
// ziet hij dus niet — en deze status ook niet.

export interface StorageStatus {
  psramMB?: number;
  sdOk?: boolean;
  /** 12/16/32 = FAT, 64 = exFAT, 0 = geen. */
  sdFs?: number;
  sdMB?: number;
  /** Bit k = `/mmb/banks/kk.mmbs` staat op de kaart. */
  sdBanks?: number;
  /** Naam uit de kop van elke bank, op banknummer; "" = staat er niet,
   *  "?" = bestand staat er maar is geen geldige bank. */
  sdBankNames?: string[];
  /** Bij de hoeveelste poging de kaart openging (of hoeveel er mislukten). */
  sdTries?: number;
  /** SdFat-foutcode van de laatste mislukte poging. */
  sdErr?: number;
}

export function fsName(type: number | undefined): string {
  switch (type) {
    case 64: return 'exFAT';
    case 32: return 'FAT32';
    case 16: return 'FAT16';
    case 12: return 'FAT12';
    default: return '?';
  }
}

/** Banknummers uit het bitmasker, oplopend. */
export function bankList(mask: number | undefined): number[] {
  const out: number[] = [];
  for (let k = 0; k < 16; k++) if (((mask ?? 0) >> k) & 1) out.push(k);
  return out;
}

/** "8 MB", "geen" — of undefined als de firmware het (nog) niet meldt. */
export function psramSummary(st: StorageStatus): string | undefined {
  if (st.psramMB === undefined) return undefined;
  return st.psramMB > 0 ? `${st.psramMB} MB` : 'geen';
}

/** "exFAT 60 GB · banken 00 03", "geen kaart" — of undefined bij oude firmware. */
export function sdSummary(st: StorageStatus): string | undefined {
  if (st.sdOk === undefined) return undefined;
  if (!st.sdOk) {
    // De foutcode maakt het verschil tussen "er zit niets in" en "hij
    // antwoordde niet op tijd" — zie SampleBank::beginStorage().
    return st.sdErr ? `geen kaart (fout 0x${st.sdErr.toString(16).padStart(2, '0')}, ${st.sdTries ?? 1}× geprobeerd)` : 'geen kaart';
  }
  const gb = Math.round((st.sdMB ?? 0) / 1024);
  const banks = bankList(st.sdBanks);
  const list = banks.length
    ? `banken ${banks.map((k) => String(k).padStart(2, '0')).join(' ')}`
    : 'geen banken';
  // Pas bij een latere poging open? Dan staat dat erbij — de kaart had tijd nodig.
  const tries = (st.sdTries ?? 1) > 1 ? ` · poging ${st.sdTries}` : '';
  return `${fsName(st.sdFs)} ${gb} GB · ${list}${tries}`;
}

/**
 * Wat het display op het sampler-paneel toont voor de gekozen bank. De naam
 * komt van de kaart zelf (de kop van de .mmbs), dus het display loopt nooit
 * uit de pas met wat er echt op staat. Zonder Teensy (of met firmware die
 * geen namen meldt) blijft het bij het nummer.
 */
export function bankTitle(
  bank: number, st: StorageStatus | undefined,
): { text: string; tone: 'ok' | 'warn' | 'dim' } {
  const k = Math.max(0, Math.round(bank));
  const nn = String(k).padStart(2, '0');
  if (!st || st.sdOk === undefined) return { text: `bank ${nn}`, tone: 'dim' };
  if (!st.sdOk) return { text: `${nn} · geen SD-kaart`, tone: 'warn' };
  const name = st.sdBankNames?.[k] ?? '';
  if (!name) return { text: `${nn} · niet op de kaart`, tone: 'warn' };
  if (name === '?') return { text: `${nn} · geen geldige bank`, tone: 'warn' };
  return { text: `${nn} · ${name}`, tone: 'ok' };
}
