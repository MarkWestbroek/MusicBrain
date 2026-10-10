// PAGE D (doc/plans/fairlight.md §7): het CMI-profiel als berglandschap,
// groen op zwart. Van achter naar voor getekend als zwart vlak met een lijn,
// zodat de voorste rijen de achterste afdekken (verborgen lijnen, zoals op
// de CMI). In HARMONISCH kiest een tik op een rij die harmonische.

import { nlen, useLang } from '../i18n';
import { pageDRows, projectPageD, type PageDMode, type PageDScale } from './cmiPageDRows';
import type { CmiProfile } from './cmiProfile';

const BG = '#020a04', DIM = '#0f4d24';
const W = 320, HT = 250;

/** Groen vooraan, donkerder naar achteren. */
function strokeAt(depth: number): string {
  const mix = (a: number, b: number): number => Math.round(a + (b - a) * depth);
  return `rgb(${mix(0x39, 0x14)},${mix(0xff, 0x7a)},${mix(0x7a, 0x3a)})`;
}

export function CmiPageD({ profile, mode, step = 1, scale = 'db', onPickHarmonic }: {
  profile: CmiProfile; mode: PageDMode; step?: number; scale?: PageDScale;
  /** HARMONISCH: tik op een rij (0-based harmonische). */
  onPickHarmonic?: (h: number) => void;
}): JSX.Element {
  useLang();
  const d = pageDRows(profile, mode, step, scale);
  const geom = { width: W - 14, height: HT - 18, rowWidth: 200, amp: mode === 'harm' ? 42 : 40 };
  const polys = projectPageD(d, geom);
  const every = d.rows.length > 16 ? 4 : 1;
  const pick = mode === 'harm' && onPickHarmonic;
  return (
    <svg viewBox={`-12 0 ${W} ${HT}`} width="100%" role="img"
      aria-label={mode === 'harm' ? nlen('Harmonischen in 3D', 'Harmonics in 3D') : nlen('Golfvormen per segment in 3D', 'Waveforms per segment in 3D')}
      style={{ display: 'block', background: '#000', border: `1px solid ${DIM}` }}>
      {polys.map((pl) => (
        <g key={pl.row} style={pick ? { cursor: 'pointer' } : undefined}
          onClick={pick ? () => onPickHarmonic!(d.labels[pl.row]! - 1) : undefined}>
          {pick && <title>{`${nlen('Harmonische', 'Harmonic')} ${pl.label}`}</title>}
          <polygon points={pl.fill} fill={BG} stroke="none" />
          <polyline points={pl.line} fill="none" stroke={strokeAt(pl.depth)} strokeWidth={pl.depth === 0 ? 1.4 : 0.9} />
          {(pl.row % every === 0 || pl.row === d.rows.length - 1) && (
            <text x={pl.labelAt[0]} y={pl.labelAt[1]} fontSize={7} fill={strokeAt(pl.depth)} textAnchor="end" dominantBaseline="middle"
              fontFamily="ui-monospace, Menlo, Consolas, monospace">{pl.label}</text>
          )}
        </g>
      ))}
      <text x={geom.rowWidth} y={HT - 4} fontSize={8} fill="#39ff7a" textAnchor="end" fontFamily="ui-monospace, Menlo, Consolas, monospace">
        {mode === 'harm' ? nlen('tijd →', 'time →') : nlen('golf →', 'wave →')}
      </text>
      <text x={W - 16} y={12} fontSize={8} fill="#39ff7a" textAnchor="end" fontFamily="ui-monospace, Menlo, Consolas, monospace">
        {mode === 'harm' ? nlen('↗ harmonische', '↗ harmonic') : nlen('↗ segment', '↗ segment')}
      </text>
    </svg>
  );
}
