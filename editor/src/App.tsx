import { useState } from 'react';
import type { Patch } from './api/types';

const demoPatches: Patch[] = [
  { id: 1, schemaVersion: 1, name: 'Crunch Lead', kind: 'effect', body: { loops: 0b00001011 } },
  { id: 2, schemaVersion: 1, name: 'Clean',       kind: 'effect', body: { loops: 0b00000001 } },
];

export function App() {
  const [active, setActive] = useState<number>(1);
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <h1>MusicBrain editor</h1>
      <p>Scaffolding only. Connect-to-device, patch CRUD, and matrix view come next (roadmap stage 3).</p>
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
    </main>
  );
}
