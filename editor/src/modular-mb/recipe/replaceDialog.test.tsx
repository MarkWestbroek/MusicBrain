import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ReplaceScopeDialog } from './RecipeContextMenu';

describe('ReplaceScopeDialog', () => {
  it('dialoog met titel, drie keuzes (alleen deze patch vooraf), Annuleren/Vervangen', () => {
    const html = renderToStaticMarkup(createElement(ReplaceScopeDialog, {
      ask: { from: 'FET Comp', to: 'Rotary', users: ['Lead', 'Bas', 'Pad', 'Koper'], run: () => { throw new Error('niet'); } },
      onRun: () => {}, onCancel: () => {},
    }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('FET Comp vervangen door Rotary');
    expect(html).toContain('4 andere patches (&quot;Lead&quot;, &quot;Bas&quot;, &quot;Pad&quot; en 1 meer)');
    expect((html.match(/type="radio"/g) ?? []).length).toBe(3);
    expect(html).toMatch(/checked=""[^>]*\/?>\s*<span><span[^>]*>Alleen in deze patch/);
    expect(html).toContain('>Annuleren<');
    expect(html).toContain('>Vervangen<');
  });
});
