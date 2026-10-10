// De rij BANK op Page 4 (doc/plans/fairlight.md §8): 32 plekken met
// CMI-klanken in het project. LADEN zet profiel en knoppen op de stem (één
// undo-stap), BEWAREN… zet de klank van nu op de gekozen plek, ⤓/⤒ exporteert
// en importeert de bank als bestand. Het rekenwerk staat in cmiBank.ts.

import { useRef, useState } from 'react';

import { nlen, useLang } from '../i18n';
import { BANK_SIZE, applyVoice, bankOf, clearVoice, exportBank, importBank, parseBankFile, storeVoice, voiceFromPatch } from './cmiBank';
import { decodeProfile, type CmiProfile } from './cmiProfile';
import { downloadBlob } from './sim/midiRecorder';
import { getProject, updateProject, useModularProject } from './store';
import { sendControlPoke } from './teensyLink';
import type { CmiVoice } from './types';

const GREEN = '#39ff7a', BG = '#020a04';

export function CmiBankRow({ patchId, owner, btn, onLoaded }: {
  patchId: string; owner: string;
  btn: (on: boolean) => React.CSSProperties;
  /** Na LADEN: het nieuwe profiel voor Page 4 (tekenen, stemmen). */
  onLoaded: (p: CmiProfile) => void;
}): JSX.Element {
  useLang();
  const project = useModularProject();
  const bank = bankOf(project);
  const current = project.patches.find((x) => x.id === patchId)?.moduleData?.[owner]?.cmi;
  const [slot, setSlot] = useState(() => {
    const i = bank.voices.findIndex((v) => v?.cmi === current);
    return i >= 0 ? i : 0;
  });
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const v = bank.voices[slot] ?? null;
  const small: React.CSSProperties = { ...btn(false), minWidth: 0, padding: '0 8px' };
  const num = (i: number): string => String(i + 1).padStart(2, '0');

  function load(voice: CmiVoice): void {
    const { project: next, pokes } = applyVoice(getProject(), patchId, owner, voice);
    updateProject(() => next, { forceCommit: true });
    for (const p of pokes) void sendControlPoke(p.moduleId, p.controlId, p.value);
    const prof = decodeProfile(voice.cmi);
    if (prof) onLoaded(prof);
    setMsg(nlen(`${num(slot)} ${voice.name} geladen`, `${num(slot)} ${voice.name} loaded`));
  }
  function save(): void {
    const name = window.prompt(nlen(`Naam voor plek ${num(slot)}:`, `Name for slot ${num(slot)}:`), v?.name ?? project.patches.find((x) => x.id === patchId)?.name ?? 'CMI');
    if (name === null) return;
    if (v && !window.confirm(nlen(`Plek ${num(slot)} (${v.name}) overschrijven?`, `Overwrite slot ${num(slot)} (${v.name})?`))) return;
    const voice = voiceFromPatch(getProject(), patchId, owner, name.trim().slice(0, 40) || 'CMI');
    if (!voice) return;
    updateProject((p) => storeVoice(p, slot, voice), { forceCommit: true });
    setMsg(nlen(`bewaard op ${num(slot)}`, `saved to ${num(slot)}`));
  }
  function clear(): void {
    if (!v || !window.confirm(nlen(`Plek ${num(slot)} (${v.name}) leegmaken?`, `Clear slot ${num(slot)} (${v.name})?`))) return;
    updateProject((p) => clearVoice(p, slot), { forceCommit: true });
  }
  async function importFile(f: File): Promise<void> {
    const b = parseBankFile(await f.text());
    if (!b) { setMsg(nlen('Dit is geen CMI-bank.', 'This is not a CMI bank.')); return; }
    const replace = window.confirm(nlen(
      `"${b.name}" inlezen.\nOK = de bank vervangen\nAnnuleren = alleen de lege plekken vullen`,
      `Import "${b.name}".\nOK = replace the bank\nCancel = only fill the empty slots`));
    const r = importBank(getProject(), b, replace ? 'replace' : 'fill');
    updateProject(() => r.project, { forceCommit: true });
    setMsg(r.skipped ? nlen(`${r.skipped} klank(en) pasten niet`, `${r.skipped} voice(s) did not fit`) : nlen('ingelezen', 'imported'));
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8, fontSize: 12 }}>
      <span>BANK:</span>
      <select aria-label={nlen('Plek in de CMI-bank', 'Slot in the CMI bank')} value={slot} onChange={(e) => { setSlot(Number(e.target.value)); setMsg(null); }}
        style={{ ...small, background: BG, color: GREEN, maxWidth: 190 }}>
        {Array.from({ length: BANK_SIZE }, (_, i) => (
          <option key={i} value={i}>{num(i)} {bank.voices[i]?.name ?? '—'}{bank.voices[i]?.cmi === current ? ' ◂' : ''}</option>
        ))}
      </select>
      <button type="button" style={{ ...small, opacity: v ? 1 : 0.4 }} disabled={!v} onClick={() => v && load(v)}
        title={nlen('Profiel en knoppen van deze plek op de stem zetten', 'Put the profile and knobs of this slot on the voice')}>{nlen('LADEN', 'LOAD')}</button>
      <button type="button" style={small} onClick={save}
        title={nlen('De klank van nu (profiel en knoppen) op deze plek bewaren', 'Save the current sound (profile and knobs) to this slot')}>{nlen('BEWAREN…', 'SAVE…')}</button>
      <button type="button" style={{ ...small, opacity: v ? 1 : 0.4 }} disabled={!v} onClick={clear} aria-label={nlen('Plek leegmaken', 'Clear slot')}
        title={nlen('Plek leegmaken', 'Clear slot')}>✕</button>
      <button type="button" style={small} onClick={() => downloadBlob(exportBank(bankOf(getProject())), `${(bank.name || 'cmi-bank').replace(/[^\w-]+/g, '-')}.cmibank.json`, 'application/json')}
        title={nlen('De bank als bestand bewaren', 'Save the bank as a file')}>⤓</button>
      <button type="button" style={small} onClick={() => fileRef.current?.click()}
        title={nlen('Een bank uit een bestand inlezen', 'Load a bank from a file')}>⤒</button>
      <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
      {msg && <span style={{ opacity: 0.8 }}>{msg}</span>}
    </div>
  );
}
