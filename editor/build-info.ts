// build-info — de versies die de editor over zichzelf weet (voor `requires`
// van een gedeelde patch, doc/plans/patch-pool.md). Los van vite.config.ts,
// zodat het te testen is.
//
// De live build draait in een container die alleen editor/ ziet: geen git en
// geen firmware/. Daarom een keten van bronnen, eerste die iets oplevert wint:
//   firmwarecontract: env MMB_FIRMWARE_CONTRACT → ../firmware/…/module-types.json
//                     → editor/contract-version.json (kopie, door contract_dump.py)
//   editorversie:     env MMB_EDITOR_VERSION → git describe op de cortex-tag
//                     → het firmwarecontract (editor-cortex loopt daarmee gelijk)

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface BuildInfoSources {
  env?: Record<string, string | undefined>;
  /** `git describe`; gooit of geeft '' als git of de tags ontbreken. */
  describe?: () => string;
  /** Leest een bestand als tekst; gooit als het er niet is. */
  read?: (path: string) => string;
  /** De map editor/. */
  editorDir: string;
}

const SEMVER = /^v?(\d+\.\d+\.\d+)/;

function versionFromJson(read: (p: string) => string, path: string): string {
  try { return String((JSON.parse(read(path)) as { firmwareVersion?: string }).firmwareVersion ?? ''); }
  catch { return ''; }
}

export function resolveBuildInfo(src: BuildInfoSources): { editorVersion: string; firmwareContract: string } {
  const env = src.env ?? {};
  const read = src.read ?? ((p: string) => readFileSync(p, 'utf8'));
  const describe = src.describe ?? (() => execSync('git describe --tags --always --match "editor/cortex/*"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString());

  const firmwareContract = (env.MMB_FIRMWARE_CONTRACT ?? '').trim()
    || versionFromJson(read, resolve(src.editorDir, '../firmware/app-modular-brain/contract/module-types.json'))
    || versionFromJson(read, resolve(src.editorDir, 'contract-version.json'));

  let described = (env.MMB_EDITOR_VERSION ?? '').trim();
  if (!described) { try { described = describe().trim().replace(/^editor\/cortex\//, ''); } catch { described = ''; } }
  // Zonder tag geeft git alleen een hash: dan telt het contract als versie,
  // met de hash erachter als build.
  const editorVersion = SEMVER.test(described) ? described
    : firmwareContract ? `v${firmwareContract}${described ? `-0-g${described}` : ''}` : described;
  return { editorVersion, firmwareContract };
}
