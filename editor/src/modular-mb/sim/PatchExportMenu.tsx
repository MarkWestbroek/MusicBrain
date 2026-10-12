// SysEx in de bovenbalk (Project ▾): de actieve patch als .syx exporteren,
// een .syx importeren als nieuwe patch, en naamlijsten voor Reaper en Cubase.

import { useRef, useState } from 'react';
import { getProject, updateProject, uid } from '../store';
import { admitActivePatch } from '../patchIntake';
import { patchOrder } from '../recipe/classify';
import { buildConfigPayload } from '../teensyLink';
import { patchSnapshot, slimSnapshot } from './midiRecorder';
import { seedInternals } from '../seedModules';
import { addPatchSnapshot } from './takeLibrary';
import { encodePatchSysex, decodePatchSysex, splitSysex, joinSysex, SYSEX_CMD } from './patchSysex';
import { buildReabank, buildCubaseScript } from './patchNames';
import { slugName } from './mediaLibrary';
import type { ModularProject } from '../types';

function download(data: BlobPart, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** De actieve patch als SysEx: firmwareconfig (02) en editor-patch (01). */
export async function patchToSysex(project: ModularProject): Promise<Uint8Array[]> {
  const patch = project.patches.find((x) => x.id === project.activePatchId);
  if (!patch) throw new Error('Geen actieve patch.');
  const snap = patchSnapshot(project, patch);
  return [
    ...await encodePatchSysex(SYSEX_CMD.firmwareConfig, buildConfigPayload(snap).json),
    ...await encodePatchSysex(SYSEX_CMD.editorPatch, JSON.stringify(slimSnapshot(snap))),
  ];
}

/** De SysEx-handelingen voor de bovenbalk (Project ▾, editor-structuur.md
 *  stap 8): .syx van de actieve patch, .syx inlezen, patchnamen voor een
 *  DAW. `ui` is het verborgen bestandsveld en de melding; zet die ergens in
 *  de balk. */
export function usePatchSysex(): {
  exportSyx: () => void; importSyx: () => void; exportNames: (kind: 'reaper' | 'cubase') => void; ui: JSX.Element;
} {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function exportSyx(): Promise<void> {
    try {
      const p = getProject();
      const patch = p.patches.find((x) => x.id === p.activePatchId);
      const msgs = await patchToSysex(p);
      download(joinSysex(msgs), `mmb-${slugName(patch?.name ?? 'patch') || 'patch'}.syx`, 'application/octet-stream');
      setMsg({ ok: true, text: `${msgs.length} SysEx-berichten (${joinSysex(msgs).length} bytes).` });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
  }

  async function importSyx(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      const got = await decodePatchSysex(splitSysex(new Uint8Array(await file.arrayBuffer())));
      const json = got.get(SYSEX_CMD.editorPatch);
      if (!json) throw new Error(got.size ? 'Dit bestand bevat alleen een firmwareconfig, geen editor-patch.' : 'Geen MusicBrain-SysEx in dit bestand.');
      const snap = JSON.parse(json) as ModularProject;
      const name = snap.patches?.[0]?.name ?? file.name.replace(/\.syx$/i, '');
      // Types en interne modules zitten niet in de SysEx: eerst aanvullen.
      updateProject((p) => addPatchSnapshot(seedInternals(p), snap, name, uid), { forceCommit: true });
      admitActivePatch('uit SysEx');
      setMsg({ ok: true, text: `Patch "${name}" toegevoegd.` });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
  }

  function exportNames(kind: 'reaper' | 'cubase'): void {
    const list = patchOrder(getProject()).map((x) => ({ ...x }));
    if (kind === 'reaper') download(buildReabank(list), 'MusicBrain.reabank', 'text/plain');
    else download(buildCubaseScript(list), 'MusicBrain patches.txt', 'text/plain');
    setMsg({ ok: true, text: `${list.length} patchnamen.` });
  }

  return {
    exportSyx: () => void exportSyx(),
    importSyx: () => fileRef.current?.click(),
    exportNames,
    ui: (
      <>
        <input ref={fileRef} type="file" accept=".syx,application/octet-stream" style={{ display: 'none' }}
          onChange={(e) => { void importSyx(e.target.files?.[0]); e.target.value = ''; }} />
        {msg && <span style={{ fontSize: 12, color: msg.ok ? '#15803d' : '#b91c1c' }}>{msg.ok ? '✔' : '⚠'} {msg.text}</span>}
      </>
    ),
  };
}
