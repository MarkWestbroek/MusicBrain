// De diagnoseknoppen in de bovenbalk, uit de patchcatalogus (patchCatalog.ts).
// Poly ▾, Solo ▾ en Stress ▾ zijn opgegaan in de patchkiezer (PatchBrowser.tsx);
// deze knoppen blijven voorlopig staan voor snel testen, tot het snelmenu
// van de bovenbalk er is (editor-structuur.md stap 8).

import { catalogMenu } from './patchCatalog';
import { getProject, setProject } from './store';

/** De diagnoseknoppen (Voorbeelden, Internals, Test-patch, FM-test, CV-bridge)
 *  als losse knoppen, zoals ze stonden; voorlopig voor iedereen zichtbaar
 *  (besluit 2, editor-structuur.md §8). */
export function DiagnoseButtons(): JSX.Element {
  return (
    <>
      {catalogMenu('diagnose').map((e) => (
        <button key={e.id} title={e.title} onClick={() => setProject(e.build(getProject()))}>{e.label}</button>
      ))}
    </>
  );
}
