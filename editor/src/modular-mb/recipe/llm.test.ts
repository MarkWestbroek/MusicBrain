import { describe, it, expect } from 'vitest';
import { emptyModularProject } from '../types';
import { seedInternals } from '../seedModules';
import { buildRecipe } from './compile';
import { askLlm, buildSystemPrompt, commandFromLlmJson, extractJson, summarizePatch } from './llm';
import { RecipeError } from './types';

const base = () => seedInternals(emptyModularProject());
const types = base().moduleTypes;

describe('LLM-adapter: prompt', () => {
  it('bevat de catalogus met type-id, korte naam en soort', () => {
    const s = buildSystemPrompt(types);
    expect(s).toContain('tp_mmb_wt_vco | WT-VCO | source');
    expect(s).toContain('tp_mmb_diode_comp | Diode | fx');
    expect(s).toMatch(/"command":"build"/);
  });

  it('samenvatting van de actieve patch: masters, geen followers, cv-ingangen', () => {
    const p = buildRecipe(base(), { voices: 4, source: 'vco', filter: 'ladder' });
    const s = summarizePatch(p);
    expect(s).toContain('4 stemmen');
    expect(s).toContain('Ladder (tp_mmb_ladder) [poly ×4] — cv, q_cv, drive_cv');
    expect((s.match(/tp_mmb_ladder/g) ?? []).length).toBe(1);   // followers niet
    expect(s).toContain('Kabels:');
    expect(summarizePatch(base())).toMatch(/geen actieve patch/);
  });
});

describe('LLM-adapter: validatie van het antwoord', () => {
  it('build met aliassen en type-id\'s', () => {
    const r = commandFromLlmJson({
      command: 'build', explanation: 'ok',
      recipe: { voices: 8, source: 'wavetable', filter: 'tp_mmb_vcf', bus: ['tp_mmb_diode_comp'], vibrato: false },
    }, types);
    expect(r.command).toMatchObject({ kind: 'build', recipe: { voices: 8, source: 'tp_mmb_wt_vco', filter: 'tp_mmb_vcf', bus: ['tp_mmb_diode_comp'], vibrato: false } });
    expect((r.command as { recipe: Record<string, unknown> }).recipe).not.toHaveProperty('voiceFx');
  });

  it('verzonnen type-id → RecipeError', () => {
    expect(() => commandFromLlmJson({ command: 'build', recipe: { source: 'tp_mmb_supersaw' } }, types)).toThrowError(RecipeError);
    expect(() => commandFromLlmJson({ command: 'addBus', module: 'flanger' }, types)).toThrowError(/onbekende module/);
    expect(() => commandFromLlmJson({ command: 'addModulation', source: 'tp_mmb_vco', target: 'filter' }, types)).toThrowError(/geen modulatiebron/);
  });

  it('overige commando\'s', () => {
    expect(commandFromLlmJson({ command: 'voices', voices: 40 }, types).command).toEqual({ kind: 'voices', voices: 16 });
    expect(commandFromLlmJson({ command: 'replace', from: 'osc', to: 'moog' }, types).command).toEqual({ kind: 'replace', from: 'osc', to: 'tp_mmb_ladder' });
    expect(commandFromLlmJson({ command: 'addModulation', source: 'lfo', target: 'filter', port: 'cv' }, types).command)
      .toEqual({ kind: 'addModulation', source: 'tp_mmb_lfo', target: 'filter', port: 'cv' });
    expect(commandFromLlmJson({ command: 'none', explanation: 'te vaag' }, types)).toEqual({ command: null, explanation: 'te vaag' });
    expect(() => commandFromLlmJson({ command: 'delete' }, types)).toThrowError(/onbekend commando/);
    expect(() => commandFromLlmJson('nee', types)).toThrowError(RecipeError);
  });

  it('JSON uit hekken en rommel eromheen', () => {
    expect(extractJson('Hier is het:\n```json\n{"command":"voices","voices":4}\n```')).toEqual({ command: 'voices', voices: 4 });
    expect(() => extractJson('geen json')).toThrowError(RecipeError);
  });
});

describe('LLM-adapter: aanroep (fetch gemockt)', () => {
  it('stuurt systeem + gebruiker en verwerkt het antwoord', async () => {
    const p = buildRecipe(base(), { voices: 2, source: 'vco' });
    let sent: { url: string; body: Record<string, unknown> } | null = null;
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      sent = { url: String(url), body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"command":"addBus","module":"tp_mmb_tape_echo","explanation":"Tape op de bus."}' } }] }), { status: 200 });
    }) as typeof fetch;
    const a = await askLlm('zet er een bandecho achter', p, { endpoint: 'https://x/chat', model: 'm', apiKey: 'k' }, fetchFn);
    expect(a.command).toEqual({ kind: 'addBus', module: 'tp_mmb_tape_echo' });
    expect(a.summary).toMatch(/Tape/);
    expect(sent!.url).toBe('https://x/chat');
    const msgs = sent!.body.messages as { role: string; content: string }[];
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[1]!.content).toContain('Verzoek: zet er een bandecho achter');
    expect(msgs[1]!.content).not.toContain('"controlState"');   // nooit het project
  });

  it('zonder key → RecipeError, http-fout → RecipeError', async () => {
    const p = base();
    await expect(askLlm('x', p, { endpoint: 'https://x', model: 'm', apiKey: '' })).rejects.toThrowError(/API-key/);
    const bad = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    await expect(askLlm('x', p, { endpoint: 'https://x', model: 'm', apiKey: 'k' }, bad)).rejects.toThrowError(/401/);
  });
});
