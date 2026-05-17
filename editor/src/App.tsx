import { useState } from 'react';
import type { Patch } from './api/types';
import { ScopePanel } from './scope/ScopePanel';

const demoPatches: Patch[] = [
  { id: 1, schemaVersion: 1, name: 'Crunch Lead', kind: 'effect', body: { loops: 0b00001011 } },
  { id: 2, schemaVersion: 1, name: 'Clean',       kind: 'effect', body: { loops: 0b00000001 } },
];

type Tab = 'patches' | 'scope';

export function App(): JSX.Element {
  const [tab, setTab]       = useState<Tab>('patches');
  const [active, setActive] = useState<number>(1);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <h1>MusicBrain editor</h1>
      <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('patches')} disabled={tab === 'patches'}>Patches</button>
        <button onClick={() => setTab('scope')}   disabled={tab === 'scope'}>Scope</button>
      </nav>

      {tab === 'patches' && (
        <section>
          <p>Scaffolding only. Connect-to-device + patch CRUD come next.</p>
          <ul>
            {demoPatches.map((p) => (
              <li key={p.id}>
                <label>
                  <input
                    type="radio"
                    name="active"
                    checked={active === p.id}
                    onChange={() => setActive(p.id)}
                  />
                  {' '}#{p.id} — {p.name}
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'scope' && (
        <>
          <p style={{ marginTop: 0 }}>
            Live CV-vs-time trace from <code>mb_simulator</code> via{' '}
            <code>tools/scope-bridge</code> (ws://localhost:8765).
          </p>
          <ScopePanel />
        </>
      )}
    </main>
  );
}
