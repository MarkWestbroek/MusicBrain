// MCP-server voor de MusicBrain-editor (ED-RC-6) — zie doc/plans/recept-tools-en-mcp.md.
//
// Biedt de tools uit editor/src/modular-mb/recipe/tools.ts aan over stdio,
// werkend op een project-JSON. Elke wijzigende tool schrijft het bestand
// terug; in de editor laad je het via Import (en andersom exporteer je
// ernaartoe). Geen kopie van de logica: de editor-TS wordt rechtstreeks
// geïmporteerd (tsx).
//
//   node node_modules/tsx/dist/cli.mjs src/server.ts [--project pad.json]
//   (of: npm start)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, runTool } from '../../../editor/src/modular-mb/recipe/tools';
import { RecipeError } from '../../../editor/src/modular-mb/recipe/types';
import { emptyModularProject, migrateProject, type ModularProject } from '../../../editor/src/modular-mb/types';
import { seedInternals } from '../../../editor/src/modular-mb/seedModules';

const here = path.dirname(fileURLToPath(import.meta.url));
const argIdx = process.argv.indexOf('--project');
let projectPath = path.resolve(argIdx >= 0 && process.argv[argIdx + 1]
  ? process.argv[argIdx + 1]!
  : process.env.MMB_PROJECT ?? path.join(here, '..', 'project.json'));

function load(p: string): ModularProject {
  if (!fs.existsSync(p)) return seedInternals(emptyModularProject());
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  const migrated = migrateProject(parsed);
  if (!migrated) throw new RecipeError(`${p} is geen MMB-project (v1 of v2).`);
  return migrated;
}
function save(): void {
  fs.mkdirSync(path.dirname(projectPath), { recursive: true });
  fs.writeFileSync(projectPath, JSON.stringify(project, null, 2));
}

let project: ModularProject = load(projectPath);

const EXTRA = [
  { name: 'get_project_path', description: 'Pad van het project-JSON waar deze server op werkt, plus naam en aantal patches.',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'load_project', description: 'Laad een ander MMB-project-JSON (bijv. een export uit de editor) en werk daar verder op.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'save_project', description: 'Schrijf het project weg, optioneel naar een ander pad (dat wordt dan het werkbestand). Importeer het in de editor via Import.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
];

const server = new Server({ name: 'mmb', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [...TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })), ...EXTRA],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] });
  try {
    switch (name) {
      case 'get_project_path':
        return text({ path: projectPath, name: project.name, patches: project.patches.length, active: project.activePatchId ?? null });
      case 'load_project': {
        const p = path.resolve(String(args.path ?? ''));
        project = load(p); projectPath = p;
        return text({ ok: true, path: p, name: project.name, patches: project.patches.length });
      }
      case 'save_project': {
        if (typeof args.path === 'string' && args.path.trim()) projectPath = path.resolve(args.path);
        save();
        return text({ ok: true, path: projectPath });
      }
      default: {
        const r = runTool(project, name, args);
        if (r.project) { project = r.project; save(); }
        return text(r.content);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { isError: true, content: [{ type: 'text' as const, text: msg }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[mmb-mcp] klaar — project: ${projectPath} (${project.patches.length} patches)`);
