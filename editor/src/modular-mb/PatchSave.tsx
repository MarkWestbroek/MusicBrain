// Bewaren van de actieve patch, gedeeld door de patcher-kop en de
// speelmodus. Spelen is ook tweaken: wie in de speelmodus aan de knoppen
// draait moet dat kunnen bewaren zonder "Binnenkijken". Hier staat het één
// keer, zodat beide plekken hetzelfde doen (en de speelmodus niet weer een
// eigen kopie van de bewaarlogica krijgt).

import type { CSSProperties } from 'react';

import { nlen } from '../i18n';
import { contentText } from './contentEn';
import { MorphSaveMenu } from './recipe/MorphPanel';
import { isDirty, saveAsPatch, savePatch } from './recipe/saved';
import { uid, updateProject } from './store';
import type { ModularProject, Patch } from './types';

/** Bewaar de huidige patch onder een nieuwe naam (binnen het project).
 *  Maakt een diepe kopie met een vers id; deze wordt direct actief. Het
 *  programmanummer wordt niet meegekopieerd (zou botsen met origineel). */
export function saveAsNewPatch(patch: Patch): void {
  const suggested = `${contentText(patch.name)} ${nlen('(kopie)', '(copy)')}`;
  const name = window.prompt(
    isDirty(patch)
      ? nlen('Bewaar als — de bewerking wordt een nieuwe patch; het origineel gaat terug naar zijn bewaarde versie. Naam:',
             'Save as — your changes become a new patch; the original goes back to its saved version. Name:')
      : nlen('Bewaar patch als — nieuwe naam:', 'Save patch as — new name:'), suggested);
  if (name === null) return;
  const id = uid('patch');
  updateProject((p) => saveAsPatch(p, patch.id, id, name.trim() || suggested), { forceCommit: true });
}

/** "Bewaar als…", of bij een morph het menu dat A, B of het mengsel bewaart. */
export function SaveAsButton({ project, patch, style }: { project: ModularProject; patch: Patch; style?: CSSProperties }) {
  if (patch.morph) return <MorphSaveMenu project={project} patch={patch} />;
  return (
    <button onClick={() => saveAsNewPatch(patch)} style={{ fontSize: 12, padding: '3px 10px', whiteSpace: 'nowrap', ...style }}
      title={nlen('Bewaar deze patch als een nieuwe patch (kopie met nieuwe naam)', 'Save this patch as a new patch (a copy with a new name)')}>
      {nlen('Bewaar als…', 'Save as…')}
    </button>
  );
}

/** Eén "● Bewaar" zodra er iets gewijzigd is; anders niets. */
export function SaveButton({ patch, style }: { patch: Patch; style?: CSSProperties }) {
  if (!isDirty(patch)) return null;
  return (
    <button onClick={() => updateProject((p) => savePatch(p, patch.id), { forceCommit: true })}
      title={nlen('Bewaar de knopstanden en het front van deze patch (Ctrl+S)', 'Save the knob settings and front panel of this patch (Ctrl+S)')}
      style={{ fontSize: 12, padding: '3px 10px', whiteSpace: 'nowrap', fontWeight: 600, border: '1px solid #f0b060', background: '#fff7e6', borderRadius: 6, cursor: 'pointer', ...style }}>
      {nlen('● Bewaar', '● Save')}
    </button>
  );
}
