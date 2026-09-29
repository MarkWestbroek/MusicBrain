// patchNames — naamlijsten van je patches voor DAW's, zodat je daar
// "CS-80 koper" kiest in plaats van "bank 2, programma 5". Bank = map
// (bank select CC 0), programma = program change, zoals de editor ze al
// gebruikt (ED-RC-8, recipe/classify.ts).

export interface NamedPatch { bank: number; program: number; name: string; bankName: string }

const clean = (s: string): string => s.replace(/[\r\n\t\]]/g, ' ').trim() || '—';

/** Reaper .reabank: "Bank <MSB> <LSB> <naam>" gevolgd door "<programma> <naam>". */
export function buildReabank(list: readonly NamedPatch[], title = 'MusicBrain'): string {
  const L = [`// ${title} — patchnamen, gegenereerd door de MusicBrain-editor`, '// Bank = map (CC 0), programma = program change.', ''];
  const banks = [...new Set(list.map((p) => p.bank))].sort((a, b) => a - b);
  for (const b of banks) {
    const items = list.filter((p) => p.bank === b).sort((x, y) => x.program - y.program);
    L.push(`Bank ${b} 0 ${clean(items[0]!.bankName)}`);
    for (const p of items) L.push(`${p.program} ${clean(p.name)}`);
    L.push('');
  }
  return L.join('\n');
}

/** Cubase patch-script (Patchnames/inbox): [p2, programma, MSB, LSB] per patch, gegroepeerd per map. */
export function buildCubaseScript(list: readonly NamedPatch[], title = 'MusicBrain'): string {
  const L = [
    '[cubase parse file]', '[parser version 0001]',
    '[creators first name]MusicBrain', '[creators last name]Editor',
    '[device manufacturer]MusicBrain', `[device name]${clean(title)}`,
    `[script name]${clean(title)} patches`, '[script version]version 1.00',
    '', '[define patchnames]', '', `[mode] ${clean(title)}`, '',
  ];
  const banks = [...new Set(list.map((p) => p.bank))].sort((a, b) => a - b);
  for (const b of banks) {
    const items = list.filter((p) => p.bank === b).sort((x, y) => x.program - y.program);
    L.push(`[g1]\t${clean(items[0]!.bankName)}`);
    for (const p of items) L.push(`[p2, ${p.program}, ${p.bank}, 0]\t${clean(p.name)}`);
    L.push('');
  }
  L.push('[end]', '');
  return L.join('\n');
}
