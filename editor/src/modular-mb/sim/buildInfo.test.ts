import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBuildInfo } from '../../../build-info';
import { splitDescribe } from './patchRequires';

const editorDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const noFile = (): string => { throw new Error('bestaat niet'); };

describe('build-info: versies voor requires', () => {
  it('deploy-container (geen git, geen firmware/): contract uit de kopie, editorversie = contract', () => {
    const r = resolveBuildInfo({
      editorDir, env: {}, describe: () => { throw new Error('git: not found'); },
      read: (p) => p.split(path.sep).join('/').endsWith('editor/contract-version.json') ? '{"firmwareVersion":"0.5.94"}' : noFile(),
    });
    expect(r).toEqual({ editorVersion: 'v0.5.94', firmwareContract: '0.5.94' });
    expect(splitDescribe(r.editorVersion)).toEqual({ editorVersion: '0.5.94', editorBuild: '' });
  });
  it('clone zonder tags: git geeft alleen een hash → contract + hash als build', () => {
    const r = resolveBuildInfo({ editorDir, env: {}, describe: () => 'abc1234\n', read: () => '{"firmwareVersion":"0.5.94"}' });
    expect(splitDescribe(r.editorVersion)).toEqual({ editorVersion: '0.5.94', editorBuild: '0-gabc1234' });
  });
  it('met tag: git describe wint; env wint van alles', () => {
    const r = resolveBuildInfo({ editorDir, env: {}, describe: () => 'editor/cortex/v0.5.48-360-g62e7389', read: () => '{"firmwareVersion":"0.5.94"}' });
    expect(r.editorVersion).toBe('v0.5.48-360-g62e7389');
    const e = resolveBuildInfo({ editorDir, env: { MMB_EDITOR_VERSION: 'v1.2.3', MMB_FIRMWARE_CONTRACT: '9.9.9' }, describe: () => 'x', read: noFile });
    expect(e).toEqual({ editorVersion: 'v1.2.3', firmwareContract: '9.9.9' });
  });
  it('niets te vinden: leeg, geen crash', () => {
    expect(resolveBuildInfo({ editorDir, env: {}, describe: () => { throw new Error('x'); }, read: noFile })).toEqual({ editorVersion: '', firmwareContract: '' });
  });
  it('editor/contract-version.json loopt gelijk met het firmwarecontract (draai tools/contract_dump.py)', () => {
    const copy = JSON.parse(fs.readFileSync(path.join(editorDir, 'contract-version.json'), 'utf8')) as { firmwareVersion: string };
    const contractPath = path.resolve(editorDir, '../firmware/app-modular-brain/contract/module-types.json');
    if (!fs.existsSync(contractPath)) return;       // build zonder firmware/: niets te vergelijken
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as { firmwareVersion: string };
    expect(copy.firmwareVersion).toBe(contract.firmwareVersion);
  });
});
