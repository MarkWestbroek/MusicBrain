// Claude-adapter voor de AI-knop (ED-RC-5b) — officiële @anthropic-ai/sdk,
// dezelfde tools als de OpenAI-compatibele route (tools.ts) en dezelfde
// regel: leestools worden uitgevoerd, wijzigende tools worden als voorstel
// verzameld op een lokale kopie van het project (pas "Toepassen" voert uit).
//
// Draait in de browser met de eigen key van de gebruiker
// (`dangerouslyAllowBrowser`): de key staat alleen in localStorage van die
// browser. Voor gedeelde toegang is er de server-route (tools/ai-proxy).
// Wordt dynamisch geïmporteerd, zodat de SDK alleen laadt als je Claude kiest.

import Anthropic from '@anthropic-ai/sdk';
import type { ModularProject } from '../types';
import { runCommand } from './commands';
import type { Command } from './parse';
import { describeCommand } from './parse';
import { TOOLS, commandForTool, runTool, toolDef } from './tools';
import { RecipeError } from './types';
import type { LlmAnswer, LlmSettings, LlmThread } from './llm';
import { TOOLS_PROMPT } from './llm';

type Msg = Anthropic.Beta.Messages.BetaMessageParam;

export async function askClaudeWithTools(
  text: string, project: ModularProject, settings: LlmSettings, prior?: LlmThread, maxRounds = 10,
): Promise<LlmAnswer & { thread: LlmThread }> {
  if (!settings.apiKey) throw new RecipeError('Geen Claude API-key ingesteld (⚙ in de commandoregel).');
  const client = new Anthropic({
    apiKey: settings.apiKey,
    dangerouslyAllowBrowser: true,
    ...(settings.endpoint ? { baseURL: settings.endpoint } : {}),
  });
  const tools = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool.InputSchema }));
  const messages: Msg[] = prior?.provider === 'anthropic'
    ? [...(prior.messages as Msg[]), { role: 'user', content: text }]
    : [{ role: 'user', content: text }];
  let sim = project;
  const commands: Command[] = [...(prior?.commands ?? [])];
  for (const c of commands) sim = runCommand(sim, c).project;
  let explanation = '';

  for (let round = 0; round < maxRounds; ++round) {
    let response: Anthropic.Beta.Messages.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: settings.model || 'claude-opus-5',
        max_tokens: 16000,
        system: TOOLS_PROMPT,
        tools,
        messages,
        // Bij een weigering van het model valt de server zelf terug op een
        // passend ander model (server-side fallbacks).
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new RecipeError('Claude weigert de key (401). Controleer de key onder ⚙.');
      if (e instanceof Anthropic.RateLimitError) throw new RecipeError('Claude: te veel verzoeken (429). Probeer het zo nog eens.');
      if (e instanceof Anthropic.APIConnectionError) throw new RecipeError(`Claude niet bereikbaar: ${e.message}`);
      if (e instanceof Anthropic.APIError) throw new RecipeError(`Claude antwoordde ${e.status}: ${e.message}`);
      throw e;
    }
    messages.push({ role: 'assistant', content: response.content });
    if (response.stop_reason === 'refusal') { explanation = 'Het model weigerde dit verzoek.'; break; }
    if (response.stop_reason === 'pause_turn') continue;
    const uses = response.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use');
    const said = response.content.filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (said) explanation = said;
    if (!uses.length) break;
    const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      const args = (u.input ?? {}) as Record<string, unknown>;
      let result: unknown; let isError = false;
      try {
        const def = toolDef(u.name);
        if (!def) { result = { error: `Onbekende tool "${u.name}".` }; isError = true; }
        else if (def.mutating) {
          const cmd = commandForTool(u.name, args);
          if (cmd) { const r = runCommand(sim, cmd); sim = r.project; commands.push(cmd); result = { planned: true, summary: r.summary, warnings: r.warnings }; }
          else { const r = runTool(sim, u.name, args); sim = r.project ?? sim; result = r.content; }
        } else {
          result = runTool(sim, u.name, args).content;
        }
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) }; isError = true;
      }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(result), ...(isError ? { is_error: true } : {}) });
    }
    messages.push({ role: 'user', content: results });
  }
  const types = project.moduleTypes;
  return {
    command: commands[0] ?? null, commands, explanation, raw: explanation,
    summary: commands.length ? commands.map((c) => describeCommand(c, types)).join(' · ') : (explanation || 'Geen voorstel.'),
    thread: { provider: 'anthropic', messages, commands },
  };
}
