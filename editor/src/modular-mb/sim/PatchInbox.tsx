// Patch-inbox: een patch die binnenkomt (SysEx in een .mid, of live via MIDI
// uit een DAW) wordt aangeboden, niet meteen geladen. Een melding rechtsonder
// met Laden / Negeren; laden voegt hem toe als nieuwe patch en maakt hem actief.

import { useEffect, useState } from 'react';
import { updateProject, uid } from '../store';
import { seedInternals } from '../seedModules';
import { addPatchSnapshot } from './takeLibrary';
import type { ModularProject } from '../types';
import { SysexCollector, SYSEX_CMD } from './patchSysex';

export interface OfferedPatch { name: string; json: string; source: string }

let pending: OfferedPatch | null = null;
const listeners = new Set<(p: OfferedPatch | null) => void>();
function set(p: OfferedPatch | null): void { pending = p; listeners.forEach((fn) => fn(p)); }

/** Een editor-patch (JSON van cmd 01) aanbieden; de gebruiker beslist. */
export function offerPatch(json: string, source: string): void {
  let name = 'Patch';
  try { name = (JSON.parse(json) as ModularProject).patches?.[0]?.name ?? name; } catch { return; }
  set({ name, json, source });
}

/** De aangeboden patch laden als nieuwe, actieve patch. */
export function loadOffered(p: OfferedPatch): void {
  const snap = JSON.parse(p.json) as ModularProject;
  updateProject((proj) => addPatchSnapshot(seedInternals(proj), snap, p.name, uid), { forceCommit: true });
}

export function PatchInboxHost(): JSX.Element | null {
  const [p, setP] = useState<OfferedPatch | null>(pending);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { listeners.add(setP); return () => { listeners.delete(setP); }; }, []);
  if (!p) return null;
  return (
    <div role="alertdialog" aria-label="Patch ontvangen" style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 70, background: '#0f172a', color: '#e2e8f0',
      borderRadius: 8, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', fontSize: 13, maxWidth: 380,
    }}>
      <div style={{ marginBottom: 8 }}>
        Patch <strong>{p.name}</strong> ontvangen via {p.source}.
      </div>
      {err && <div style={{ color: '#fca5a5', marginBottom: 6 }}>⚠ {err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => { setErr(null); set(null); }}>Negeren</button>
        <button onClick={() => {
          try { loadOffered(p); set(null); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
        }} style={{ fontWeight: 700 }}>Laden als nieuwe patch</button>
      </div>
    </div>
  );
}

/** Staat er een MusicBrain-editorpatch als SysEx in dit bestand? Dan aanbieden. */
export async function offerFromSysex(msgs: readonly Uint8Array[] | undefined, source: string): Promise<boolean> {
  if (!msgs?.length) return false;
  const c = new SysexCollector();
  for (const m of msgs) {
    const r = await c.feed(m).catch(() => null);
    if (r && r.cmd === SYSEX_CMD.editorPatch) { offerPatch(r.json, source); return true; }
  }
  return false;
}
