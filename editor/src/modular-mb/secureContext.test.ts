import { describe, expect, it } from 'vitest';

import { secureContextHint } from './secureContext';

describe('secureContextHint', () => {
  it('zwijgt op een veilige pagina (https of localhost)', () => {
    expect(secureContextHint({ protocol: 'http:', hostname: 'localhost', port: '5173' }, true)).toBeNull();
    expect(secureContextHint({ protocol: 'https:', hostname: '192.168.2.10', port: '5173' }, true)).toBeNull();
  });

  it('wijst bij http op een netwerkadres naar hetzelfde adres over https', () => {
    const h = secureContextHint({ protocol: 'http:', hostname: '192.168.2.10', port: '5173' }, false);
    expect(h?.httpsUrl).toBe('https://192.168.2.10:5173/');
    expect(h?.text).toMatch(/https of localhost/);
  });

  it('geeft geen https-adres als het al geen http was', () => {
    expect(secureContextHint({ protocol: 'file:', hostname: '', port: '' }, false)?.httpsUrl).toBeNull();
  });
});
