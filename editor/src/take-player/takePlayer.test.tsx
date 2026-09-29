import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AudioPlayback, normRegion, type AudioLike } from './playback';
import { MidiRoll, resolvePalette, describeRoll, PALETTE_TOKENS } from './MidiRoll';
import { parseSmf, type ParsedSmf } from './smf';

/** Een SMF met twee noten en een aftertouch, 120 BPM, 480 PPQ (met de hand). */
function smf(): ParsedSmf {
  const ev = [0x00, 0x90, 60, 100, 0x83, 0x60, 0x80, 60, 0, 0x00, 0xD0, 70, 0x00, 0x90, 64, 90, 0x83, 0x60, 0x80, 64, 0, 0x00, 0xFF, 0x2F, 0x00];
  const trk = [0x4D, 0x54, 0x72, 0x6B, 0, 0, 0, ev.length, ...ev];
  return parseSmf(new Uint8Array([0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xE0, ...trk]));
}

/** Nagebootst <audio>: tijd zetten we zelf, events vuren we zelf. */
class FakeAudio implements AudioLike {
  currentTime = 0;
  duration = 2;
  paused = true;
  private l = new Map<string, Set<() => void>>();
  play(): Promise<void> { this.paused = false; this.fire('play'); return Promise.resolve(); }
  pause(): void { this.paused = true; this.fire('pause'); }
  addEventListener(t: string, fn: () => void): void { (this.l.get(t) ?? this.l.set(t, new Set()).get(t)!).add(fn); }
  removeEventListener(t: string, fn: () => void): void { this.l.get(t)?.delete(fn); }
  fire(t: string): void { this.l.get(t)?.forEach((fn) => fn()); }
  count(): number { let n = 0; this.l.forEach((s) => { n += s.size; }); return n; }
}

describe('AudioPlayback', () => {
  it('volgt de audio: positie, duur, afspelen/pauze, springen, stop', () => {
    const a = new FakeAudio();
    const frames: (() => void)[] = [];
    const p = new AudioPlayback(a, smf(), 'take', (cb) => { frames.push(cb); return frames.length; }, () => {});
    let changes = 0;
    p.onState(() => { changes++; });
    expect(p.state()).toMatchObject({ playing: false, durationMs: 2000, events: 5 });
    p.start();
    expect(p.state().playing).toBe(true);
    a.currentTime = 0.75;
    expect(p.position()).toBe(750);
    p.seek(1500);
    expect(a.currentTime).toBe(1.5);
    p.pause();
    expect(p.state().playing).toBe(false);
    p.rewind();
    expect(a.currentTime).toBe(0);
    expect(changes).toBeGreaterThan(2);
    expect(p.grid()).toEqual({ bpm: 120, offsetMs: 0, beatsPerBar: 4 });
  });

  it('lusvenster: terug naar het begin zodra de audio het einde passeert', () => {
    const a = new FakeAudio();
    const frames: (() => void)[] = [];
    const p = new AudioPlayback(a, smf(), 'take', (cb) => { frames.push(cb); return frames.length; }, () => {});
    p.setRegion({ start: 1200, end: 400 });
    expect(p.state().region).toEqual({ start: 400, end: 1200 });
    a.currentTime = 0.5;
    p.start();
    a.currentTime = 1.25;
    frames.shift()!();                               // één frame
    expect(a.currentTime).toBeCloseTo(0.4, 5);
    p.pause();
    a.currentTime = 1.5;                             // voorbij het venster
    p.start();                                       // begint vooraan de lus
    expect(a.currentTime).toBeCloseTo(0.4, 5);
  });

  it('destroy haalt alle luisteraars weg', () => {
    const a = new FakeAudio();
    const p = new AudioPlayback(a, null, null, () => 1, () => {});
    expect(a.count()).toBeGreaterThan(0);
    p.destroy();
    expect(a.count()).toBe(0);
  });

  it('normRegion', () => {
    expect(normRegion({ start: 50, end: 60 }, 1000)).toBeNull();
    expect(normRegion({ start: 900, end: 2000 }, 1000)).toEqual({ start: 900, end: 1000 });
  });
});

describe('palet en samenvatting', () => {
  it('tokens eerst (basisnaam, dan --color-*), dan palet, dan tekstkleur', () => {
    const vars: Record<string, string> = { '--accent': 'orange', '--color-line': 'gray' };
    const p = resolvePalette((n) => vars[n] ?? '', 'rgb(1, 2, 3)', { mod: 'green' });
    expect(p.notes).toBe('orange');
    expect(p.line).toBe('gray');
    expect(p.mod).toBe('green');
    expect(p.bg).toBe('rgb(1, 2, 3)');
    expect(resolvePalette((n) => vars[n] ?? '', 'x', {}, false).notes).toBe('x');
    expect(Object.keys(PALETTE_TOKENS)).toHaveLength(11);
  });
  it('describeRoll', () => {
    expect(describeRoll(12, 84, ['Aftertouch'])).toBe('Pianorol: 12 maten, 84 noten, met aftertouch');
    expect(describeRoll(1, 1, [])).toBe('Pianorol: 1 maat, 1 noot');
  });
});

describe('MidiRoll zoals in de widget', () => {
  it('vaste hoogte, geen tempo-bediening, toegankelijke transport en canvas', () => {
    const a = new FakeAudio();
    const p = new AudioPlayback(a, smf(), 'take', () => 1, () => {});
    const html = renderToStaticMarkup(createElement(MidiRoll, { playback: p, height: 160, label: 'Take: koper' }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Take: koper: 1 maat, 2 noten, met aftertouch"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Maat terug"');
    expect(html).toContain('role="group"');
    expect(html).not.toContain('Tempo in BPM');                 // geen gridControls
    expect(html).not.toContain('ns-resize');                    // geen greep bij vaste hoogte
    expect(html).not.toMatch(/#[0-9a-f]{6}/i);                  // geen losse hex-kleuren in de widget
  });
});

describe('TakePlayer', () => {
  it('server-render: audio met browserbediening, en een vaste plek voor de rol', async () => {
    const { TakePlayer } = await import('./TakePlayer');
    const html = renderToStaticMarkup(createElement(TakePlayer, { audioUrl: '/a.wav', midiUrl: '/a.mid', title: 'koper', height: 150 }));
    expect(html).toContain('<audio');
    expect(html).toContain('controls=""');
    expect(html).toContain('min-height:150px');
    const only = renderToStaticMarkup(createElement(TakePlayer, { audioUrl: '/a.wav' }));
    expect(only).not.toContain('min-height');
  });
});
