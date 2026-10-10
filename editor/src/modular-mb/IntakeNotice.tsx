// De melding van de patchcontrole (patchIntake.ts): wat er bij het laden,
// importeren of binnenhalen hersteld is, wat een besluit vraagt, en of de
// moduletypes van het project ouder zijn dan die van de editor.
//
// Hier draait ook de controle van het hele project: elke keer dat de store
// meldt dat het project vervangen is (opstart, import, Nieuw, preset). Het
// herstel gaat via updateProject, dus "Ongedaan maken" is gewoon undo.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { nlen } from '../i18n';
import { applyIntake, lastIntake, publishIntake, reviewProject, subscribeIntake, type IntakeReport } from './patchIntake';
import { seedInternals } from './seedModules';
import { getProject, projectReplacedCount, setProject, undo, updateProject, useModularProject } from './store';

/** Controleert het project na elke vervanging. Eén keer per vervanging. */
function useProjectIntake(): void {
  useModularProject();   // opnieuw renderen na elke store-wijziging
  const count = projectReplacedCount();
  const seen = useRef(0);
  useEffect(() => {
    if (seen.current === count) return;
    seen.current = count;
    applyIntake(reviewProject(getProject(), nlen('bij het laden', 'on loading')), getProject, updateProject);
  }, [count]);
}

export function IntakeNotice(): JSX.Element | null {
  useProjectIntake();
  const now = useModularProject();
  const report = useSyncExternalStore(subscribeIntake, lastIntake);
  const [open, setOpen] = useState(false);
  if (!report) return null;
  return <Notice report={report} canUndo={report.after === now} open={open} onToggle={() => setOpen(!open)} onClose={() => { setOpen(false); publishIntake(null); }} />;
}

function Notice({ report, canUndo, open, onToggle, onClose }: { report: IntakeReport; canUndo: boolean; open: boolean; onToggle: () => void; onClose: () => void }): JSX.Element {
  const all = report.patches.flatMap((p) => p.findings);
  const fixed = all.filter((f) => f.severity === 'fix').length;
  const ask = all.filter((f) => f.severity === 'ask').length;
  const inPatches = report.patches.filter((p) => p.findings.some((f) => f.severity !== 'info')).length;
  const parts: string[] = [];
  if (fixed) parts.push(nlen(`${fixed} ${fixed === 1 ? 'ding' : 'dingen'} hersteld`, `${fixed} ${fixed === 1 ? 'thing' : 'things'} repaired`));
  if (ask) parts.push(nlen(`${ask} ${ask === 1 ? 'vraagt' : 'vragen'} je oordeel`, `${ask} need${ask === 1 ? 's' : ''} your decision`));
  const btn: React.CSSProperties = { fontSize: 12, padding: '2px 8px', cursor: 'pointer' };

  return (
    // overflowWrap: een module-id of typenaam zonder spaties mag de melding
    // niet breder maken dan het scherm; Chrome op Android zoomt dan de hele
    // pagina uit en blijft dat doen tot je herlaadt.
    <div role="status" style={{ margin: '0 0 10px', padding: '8px 12px', borderRadius: 6, background: '#fff4e5', border: '1px solid #f0b060', fontSize: 13, lineHeight: 1.4,
      maxWidth: '100%', boxSizing: 'border-box', overflowWrap: 'anywhere' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{nlen('Patchcontrole', 'Patch check')} {report.source}:</strong>
        {parts.length > 0 && <span>{parts.join(', ')}{inPatches > 1 ? nlen(`, in ${inPatches} patches`, `, in ${inPatches} patches`) : ''}.</span>}
        {report.staleTypes.length > 0 && (
          <span>{report.staleTypes.length === 1
            ? nlen('1 moduletype is ouder dan in deze editor.', '1 module type is older than in this editor.')
            : nlen(`${report.staleTypes.length} moduletypes zijn ouder dan in deze editor.`, `${report.staleTypes.length} module types are older than in this editor.`)}</span>
        )}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          {report.staleTypes.length > 0 && (
            <button type="button" style={btn} onClick={() => { publishIntake(null); setProject(seedInternals(getProject())); }}
              title={nlen('Zet de moduletypes van het project op die van deze editor (zoals de knop Internals), en controleer daarna opnieuw', 'Update the project\'s module types to this editor\'s, then check again')}>
              {nlen('Modules verversen', 'Update modules')}
            </button>
          )}
          {fixed > 0 && canUndo && <button type="button" style={btn} onClick={() => { undo(); onClose(); }}>{nlen('Ongedaan maken', 'Undo')}</button>}
          <button type="button" style={btn} onClick={onToggle}>{open ? nlen('Minder', 'Less') : nlen('Details', 'Details')}</button>
          <button type="button" style={btn} onClick={onClose} aria-label={nlen('Sluiten', 'Close')}>✕</button>
        </span>
      </div>
      {open && (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          {report.patches.map((p) => {
            const shown = p.findings.filter((f) => f.severity !== 'info');
            if (!shown.length) return null;
            return (
              <div key={p.patchId} style={{ marginTop: 4 }}>
                <strong>{p.patchName}</strong>
                <ul style={{ margin: '2px 0 0 18px', padding: 0 }}>
                  {shown.map((f, i) => (
                    <li key={i}>{f.severity === 'fix' ? nlen('hersteld: ', 'repaired: ') : nlen('vraagt je oordeel: ', 'needs your decision: ')}{f.message}</li>
                  ))}
                </ul>
              </div>
            );
          })}
          {report.staleTypes.length > 0 && (
            <div style={{ marginTop: 4, color: '#6b7280' }}>
              {nlen('Ouder dan in deze editor: ', 'Older than in this editor: ')}{report.staleTypes.map((t) => t.replace(/^tp_mmb_/, '')).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
