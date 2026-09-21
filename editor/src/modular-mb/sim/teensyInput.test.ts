// De Teensy vinden tussen de audio-ingangen — zonder op een alias te prikken.

import { describe, expect, it } from 'vitest';

import { pickTeensyInput } from './teensyInput';

const inp = (deviceId: string, label: string) => ({ deviceId, kind: 'audioinput', label });

describe('pickTeensyInput', () => {
  it('neemt het echte apparaat, niet de Default- of Communications-alias', () => {
    // Zo geeft Chrome op Windows ze door: de aliassen staan vooraan.
    const devices = [
      inp('default',        'Default - Digital Audio Interface (2- Teensy MIDI/Audio)'),
      inp('communications', 'Communications - Digital Audio Interface (2- Teensy MIDI/Audio)'),
      inp('a1b2',           'Speakerphone (MX Brio)'),
      inp('c3d4',           'Digital Audio Interface (2- Teensy MIDI/Audio)'),
    ];
    expect(pickTeensyInput(devices)?.deviceId).toBe('c3d4');
  });

  it('vindt hem ook onder zijn Mac-naam', () => {
    expect(pickTeensyInput([inp('x', 'Teensy MIDI/Audio')])?.deviceId).toBe('x');
  });

  it('negeert de Teensy als afspeelapparaat en geeft niets als hij er niet is', () => {
    expect(pickTeensyInput([
      { deviceId: 'o1', kind: 'audiooutput', label: 'Digital Audio Interface (2- Teensy MIDI/Audio)' },
      inp('m1', 'Microphone (Realtek(R) Audio)'),
    ])).toBeUndefined();
  });

  it('vindt niets zolang de browser nog geen toestemming heeft (lege labels)', () => {
    expect(pickTeensyInput([inp('c3d4', '')])).toBeUndefined();
  });
});
