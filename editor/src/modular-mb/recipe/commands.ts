// Uitvoerlaag voor Commands (ED-RC-2/5): één plek waar parser, LLM,
// rechtsklik en MCP-server hun commando's laten uitvoeren. Puur: geen
// store, geen DOM, zodat Node (MCP) dit ook kan draaien.

import { resolvePorts, type ModularProject } from '../types';
import { compileRecipe, buildRecipe } from './compile';
import {
  replaceModule, setVoices, addBusFx, addModulation, findModuleByWord, findPortByWord, type EditResult,
} from './edits';
import type { Command } from './parse';
import { RecipeError } from './types';

/** Voer een geparseerd commando uit op het project. Gooit RecipeError. */
export function runCommand(p: ModularProject, cmd: Command): EditResult {
  const patchId = p.activePatchId;
  const needPatch = (): string => {
    if (!patchId || !p.patches.some((x) => x.id === patchId)) throw new RecipeError('Geen actieve patch om te bewerken.');
    return patchId;
  };
  switch (cmd.kind) {
    case 'build': {
      const r = compileRecipe(p, cmd.recipe);
      return { project: buildRecipe(p, cmd.recipe), summary: `Gebouwd: ${r.summary}`, warnings: r.warnings };
    }
    case 'voices': return setVoices(p, needPatch(), cmd.voices);
    case 'replace': {
      const pid = needPatch();
      const m = findModuleByWord(p, pid, cmd.from);
      if (!m) throw new RecipeError(`Geen module "${cmd.from}" in deze patch.`);
      return replaceModule(p, pid, m.id, cmd.to);
    }
    case 'addBus': return addBusFx(p, needPatch(), cmd.module);
    case 'addModulation': {
      const pid = needPatch();
      const m = findModuleByWord(p, pid, cmd.target);
      if (!m) throw new RecipeError(`Geen module "${cmd.target}" in deze patch.`);
      let port = cmd.port ? findPortByWord(p, m, cmd.port) : null;
      if (!port && !cmd.port) {
        const cvIns = resolvePorts(m, p.moduleTypes).filter((q) => q.direction === 'in' && q.signalType === 'cv');
        port = (cvIns.find((q) => q.id === 'cv') ?? cvIns[0])?.id ?? null;
      }
      if (!port) throw new RecipeError(`${m.name} heeft geen cv-ingang "${cmd.port ?? ''}".`);
      return addModulation(p, pid, cmd.source, { moduleId: m.id, portId: port });
    }
  }
}

/** Meerdere commando's na elkaar; stopt bij de eerste fout (gooit). */
export function runCommands(p: ModularProject, cmds: Command[]): EditResult {
  let project = p;
  const summaries: string[] = [];
  const warnings: string[] = [];
  for (const c of cmds) {
    const r = runCommand(project, c);
    project = r.project;
    summaries.push(r.summary);
    warnings.push(...r.warnings);
  }
  return { project, summary: summaries.join(' · '), warnings };
}
