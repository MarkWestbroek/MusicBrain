import { describe, expect, it } from 'vitest';

import { loadPins, togglePin } from './ToolbarMenus';

describe('snelmenu', () => {
  it('☆ zet achteraan erbij, nog eens haalt hem weg', () => {
    expect(togglePin(['a'], 'b')).toEqual(['a', 'b']);
    expect(togglePin(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('zonder opslag de standaard', () => {
    expect(loadPins(['teensy', 'diagnose/internals'])).toEqual(['teensy', 'diagnose/internals']);
  });
});
