// Balkje in de Simulatie-tab (ED-SIM-BANK): staat er een SAMPLER in de
// patch, dan haalt dit de bank van de server die zijn Bank-knop aanwijst,
// en kun je hier een andere serverbank voor dat nummer kiezen.

import { useEffect, useState } from 'react';
import type { ModularProject, Patch } from '../types';
import { useTeensyLink } from '../teensyLink';
import { ensureSamplerBank, loadBankIndex, resolveBank, setUserPick, currentBank, type BankIndex, type LoadedBank } from './bankAutoLoad';

export function SamplerBankBar(props: { project: ModularProject; patch: Patch }): JSX.Element | null {
  const { project, patch } = props;
  const link = useTeensyLink();
  const sdNames = link.lastStatus?.sdBankNames;
  const sampler = project.modules.find((m) => m.typeId === 'tp_mmb_sampler'
    && patch.connections.some((c) => c.from.moduleId === m.id || c.to.moduleId === m.id));
  const nn = sampler ? Math.round(Number(patch.controlState[sampler.id]?.bank ?? 0)) : null;
  const [index, setIndex] = useState<BankIndex | null>(null);
  const [state, setState] = useState<{ busy?: boolean; bank?: LoadedBank | null; err?: string }>({ bank: currentBank() });
  const [tick, setTick] = useState(0);

  useEffect(() => { void loadBankIndex().then(setIndex); }, []);
  useEffect(() => {
    if (nn === null) return;
    let cancelled = false;
    setState((s) => ({ ...s, busy: true, err: undefined }));
    ensureSamplerBank(nn, sdNames, tick > 0)
      .then((bank) => { if (!cancelled) setState({ bank, busy: false }); })
      .catch((e) => { if (!cancelled) setState({ busy: false, err: e instanceof Error ? e.message : String(e) }); });
    return () => { cancelled = true; };
  }, [nn, (sdNames ?? []).join('|'), tick]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (nn === null) return null;
  const resolved = index ? resolveBank(index, nn, sdNames) : null;
  const src = { teensy: 'zelfde naam als op de SD-kaart', keuze: 'jouw keuze voor dit nummer', standaard: 'standaardindeling' } as const;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13,
                  padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#f8fafc', margin: '8px 0' }}>
      <strong>Sampler-bank {String(nn).padStart(2, '0')}</strong>
      <select value={resolved?.file ?? ''} style={{ fontSize: 13, maxWidth: 280 }}
              title="Welke bank van de server de simulator voor dit nummer laadt. Je keuze wordt onthouden (per nummer)."
              onChange={(e) => { setUserPick(nn, e.target.value || null); setTick((t) => t + 1); }}>
        {!resolved && <option value="">—</option>}
        {index?.files.map((f) => (
          <option key={f.file} value={f.file}>{f.name} ({(f.size / 1e6).toFixed(1)} MB)</option>
        ))}
      </select>
      <span style={{ color: state.err ? '#b91c1c' : '#475569' }}>
        {state.busy ? 'bank ophalen…'
          : state.err ? `✕ ${state.err}`
          : state.bank ? `✓ "${state.bank.name}" in de simulator · ${state.bank.summary}${resolved ? ` · ${src[resolved.source]}` : ''}`
          : 'geen bank voor dit nummer'}
      </span>
      {sdNames?.[nn] && resolved?.source !== 'teensy' && (
        <span style={{ color: '#b45309' }} title="De Teensy heeft onder dit nummer een bank met een naam die op de server niet voorkomt">
          SD-kaart: "{sdNames[nn]}" staat niet op de server
        </span>
      )}
    </div>
  );
}
