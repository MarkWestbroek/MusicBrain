import { describe, it, expect } from 'vitest';
import { emptyModularProject } from '../types';
import { seedInternals } from '../seedModules';
import { buildRecipe } from './compile';
import {
  askLlm, askLlmWithTools, askAi, buildSystemPrompt, commandFromLlmJson, extractJson, summarizePatch, type LlmSettings,
} from './llm';
import { RecipeError } from './types';

const base = () => seedInternals(emptyModularProject());
const types = base().moduleTypes;
const S = (mode: LlmSettings['mode'] = 'json'): LlmSettings => ({ endpoint: 'https://x/chat', model: 'm', apiKey: 'k', mode });

/** Nep-API: geeft per beurt het volgende antwoord uit `turns` en bewaart wat er heen ging. */
function fakeApi(turns: unknown[]): { fetchFn: typeof fetch; sent: { url: string; body: Record<string, unknown> }[] } {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  let i = 0;
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    const message = turns[Math.min(i, turns.length - 1)];
    i += 1;
    return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
  }) as typeof fetch;
  return { fetchFn, sent };
}

describe('LLM-adapter: prompt (json-modus)', () => {
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
    expect((s.match(/tp_mmb_ladder\)/g) ?? []).length).toBe(1);   // followers niet
    expect(s).toContain('Kabels:');
    expect(summarizePatch(base())).toMatch(/geen actieve patch/);
  });
});

describe('LLM-adapter: validatie van het JSON-antwoord', () => {
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

describe('LLM-adapter: json-modus (fetch gemockt)', () => {
  it('stuurt systeem + gebruiker en verwerkt het antwoord', async () => {
    const p = buildRecipe(base(), { voices: 2, source: 'vco' });
    const api = fakeApi([{ role: 'assistant', content: '{"command":"addBus","module":"tp_mmb_tape_echo","explanation":"Tape op de bus."}' }]);
    const a = await askLlm('zet er een bandecho achter', p, S('json'), api.fetchFn);
    expect(a.command).toEqual({ kind: 'addBus', module: 'tp_mmb_tape_echo' });
    expect(a.commands.length).toBe(1);
    expect(a.summary).toMatch(/Tape/);
    const msgs = api.sent[0]!.body.messages as { role: string; content: string }[];
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[1]!.content).toContain('Verzoek: zet er een bandecho achter');
    expect(msgs[1]!.content).not.toContain('"controlState"');   // nooit het project
  });

  it('zonder key → RecipeError, http-fout → RecipeError', async () => {
    const p = base();
    await expect(askLlm('x', p, { ...S(), apiKey: '' })).rejects.toThrowError(/API-key/);
    const bad = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    await expect(askLlm('x', p, S(), bad)).rejects.toThrowError(/401/);
  });
});

describe('LLM-adapter: tools-modus (function calling, fetch gemockt)', () => {
  it('leest via tools, plant wijzigingen als voorstel, en ziet zijn eigen voorstel in een volgende leestool', async () => {
    const p = buildRecipe(base(), { voices: 2, source: 'vco' });
    const call = (id: string, name: string, args: unknown) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
    const api = fakeApi([
      { role: 'assistant', content: null, tool_calls: [call('c1', 'get_patch_summary', {}), call('c2', 'get_module_type', { typeId: 'diode' })] },
      { role: 'assistant', content: null, tool_calls: [call('c3', 'add_bus_fx', { module: 'diode compressor' }), call('c4', 'set_voices', { voices: 4 })] },
      { role: 'assistant', content: null, tool_calls: [call('c5', 'get_patch_summary', {})] },
      { role: 'assistant', content: 'Diode-compressor op de bus en vier stemmen.' },
    ]);
    const a = await askLlmWithTools('zet een diode comp op de bus en maak het 4 stemmig', p, S('tools'), api.fetchFn);
    expect(a.commands).toEqual([{ kind: 'addBus', module: 'diode compressor' }, { kind: 'voices', voices: 4 }]);
    expect(a.explanation).toMatch(/vier stemmen/);
    expect(a.summary).toMatch(/Diode.*4-stemmig/);
    // Vier beurten, elke beurt met tools meegestuurd.
    expect(api.sent.length).toBe(4);
    expect((api.sent[0]!.body.tools as unknown[]).length).toBeGreaterThan(5);
    // Toolresultaten zijn als role:tool teruggestuurd; het derde get_patch_summary zag het voorstel (4 stemmen, diode).
    const last = api.sent[3]!.body.messages as { role: string; content: string; tool_call_id?: string }[];
    const c5 = last.find((m) => m.role === 'tool' && m.tool_call_id === 'c5')!;
    expect(c5.content).toContain('"voices":4');
    expect(c5.content).toContain('tp_mmb_diode_comp');
    const c3 = last.find((m) => m.role === 'tool' && m.tool_call_id === 'c3')!;
    expect(JSON.parse(c3.content)).toMatchObject({ planned: true });
  });

  it('fouten in een tool gaan als resultaat terug naar het model, niet als exception', async () => {
    const p = base();   // geen actieve patch
    const call = (id: string, name: string, args: unknown) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
    const api = fakeApi([
      { role: 'assistant', content: null, tool_calls: [call('c1', 'set_voices', { voices: 4 }), call('c2', 'no_such_tool', {})] },
      { role: 'assistant', content: 'Er is geen patch.' },
    ]);
    const a = await askLlmWithTools('4 stemmen', p, S('tools'), api.fetchFn);
    expect(a.commands).toEqual([]);
    const msgs = api.sent[1]!.body.messages as { role: string; content: string; tool_call_id?: string }[];
    expect(JSON.parse(msgs.find((m) => m.tool_call_id === 'c1')!.content).error).toMatch(/Geen actieve patch/);
    expect(JSON.parse(msgs.find((m) => m.tool_call_id === 'c2')!.content).error).toMatch(/Onbekende tool/);
  });

  it('doorpraten: het gesprek gaat verder en de voorstellen stapelen', async () => {
    const p = base();
    const call = (id: string, name: string, args: unknown) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
    const api = fakeApi([
      { role: 'assistant', content: null, tool_calls: [call('c1', 'build_patch', { recipe: { voices: 4, source: 'vco' } })] },
      { role: 'assistant', content: 'Vierstemmige VCO-patch.' },
    ]);
    const a = await askLlmWithTools('maak een 4 stemmige patch', p, S('tools'), api.fetchFn);
    expect(a.commands.map((c) => c.kind)).toEqual(['build']);
    expect(a.thread.messages.length).toBe(5);   // system, user, assistant(tool), tool, assistant

    const api2 = fakeApi([
      { role: 'assistant', content: null, tool_calls: [call('c2', 'get_patch_summary', {}), call('c3', 'set_voices', { voices: 8 })] },
      { role: 'assistant', content: 'Nu acht stemmen.' },
    ]);
    const b = await askLlmWithTools('maak het toch 8 stemmig', p, S('tools'), api2.fetchFn, 10, a.thread);
    expect(b.commands.map((c) => c.kind)).toEqual(['build', 'voices']);
    expect(b.summary).toMatch(/Nieuwe patch.*8-stemmig/);
    // Het vervolg stuurde de hele geschiedenis mee, plus de nieuwe vraag.
    const sent = api2.sent[0]!.body.messages as { role: string; content: string | null }[];
    expect(sent.length).toBe(6);
    expect(sent[5]).toMatchObject({ role: 'user', content: 'maak het toch 8 stemmig' });
    // En get_patch_summary zag de (nog niet toegepaste) vierstemmige patch uit ronde 1.
    const last = api2.sent[1]!.body.messages as { role: string; content: string; tool_call_id?: string }[];
    expect(last.find((m) => m.tool_call_id === 'c2')!.content).toContain('"voices":4');
  });

  it('askAi kiest de modus', async () => {
    const p = base();
    const api = fakeApi([{ role: 'assistant', content: '{"command":"none","explanation":"x"}' }]);
    await askAi('x', p, S('json'), api.fetchFn);
    expect(api.sent[0]!.body.response_format).toEqual({ type: 'json_object' });
    const api2 = fakeApi([{ role: 'assistant', content: 'klaar' }]);
    await askAi('x', p, S('tools'), api2.fetchFn);
    expect(api2.sent[0]!.body.tools).toBeDefined();
  });
});
