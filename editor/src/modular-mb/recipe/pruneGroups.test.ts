import { describe, it, expect } from 'vitest';
import { emptyModularProject, pruneOrphanGroups, migrateProject, type ModularProject } from '../types';
import { seedInternals } from '../seedModules';
import { seedSid3Patch } from '../seedSid';
import { analyzeProject, applyActions } from './optimize';

/** Project met een SID 3-osc ×4 (een PolyGroup van 4 modules). */
function withGroup(): { p: ModularProject; members: string[]; rackId: string } {
  const p = seedSid3Patch(seedInternals(emptyModularProject()), 4);
  const rack = p.racks.find((r) => r.id === p.activeRackId)!;
  return { p, members: rack.polyGroups![0]!.members.map((m) => m.moduleId), rackId: rack.id };
}
const groupsOf = (p: ModularProject, rackId: string) => p.racks.find((r) => r.id === rackId)!.polyGroups ?? [];

describe('verweesde voice-groepen opruimen', () => {
  it('alle leden verdwenen: de groep gaat weg', () => {
    const { p, members, rackId } = withGroup();
    const gone = new Set(members);
    const broken = { ...p, modules: p.modules.filter((m) => !gone.has(m.id)) };
    const r = pruneOrphanGroups(broken);
    expect(r.groups).toBe(1);
    expect(groupsOf(r.project, rackId)).toHaveLength(0);
  });

  it('één van vier verdwenen: de groep blijft, met 3 stemmen', () => {
    const { p, members, rackId } = withGroup();
    const broken = { ...p, modules: p.modules.filter((m) => m.id !== members[3]) };
    const r = pruneOrphanGroups(broken);
    expect(r).toMatchObject({ groups: 0, members: 1 });
    const g = groupsOf(r.project, rackId)[0]!;
    expect(g.members).toHaveLength(3);
    expect(g.voiceCount).toBe(3);
  });

  it('niets mis: hetzelfde project terug', () => {
    const { p } = withGroup();
    expect(pruneOrphanGroups(p).project).toBe(p);
  });

  it('bij het laden (migrateProject) al opgeruimd', () => {
    const { p, members, rackId } = withGroup();
    const gone = new Set(members);
    const loaded = migrateProject(JSON.parse(JSON.stringify({ ...p, modules: p.modules.filter((m) => !gone.has(m.id)) })))!;
    expect(groupsOf(loaded, rackId)).toHaveLength(0);
  });

  it('bezem: uit de rackslots gehaald, dan als losse modules weg — geen groep blijft achter', () => {
    const { p: p0, members, rackId } = withGroup();
    const gone = new Set(members);
    // Zoals via het Rack-tabblad: slots weg, de modules (en de groep) blijven.
    const p = { ...p0, racks: p0.racks.map((r) => (r.id === rackId ? { ...r, slots: r.slots.filter((s) => !gone.has(s.moduleId)) } : r)) };
    const plan = analyzeProject(p);
    expect(plan.actions.some((a) => a.kind === 'removeModules')).toBe(true);
    const r = applyActions(p, plan.actions.filter((a) => !a.defaultOff));
    expect(groupsOf(r.project, rackId)).toHaveLength(0);
  });

  it('bezem: een al verweesde groep staat als actie in het rapport', () => {
    const { p, members } = withGroup();
    const gone = new Set(members);
    const broken = { ...p, modules: p.modules.filter((m) => !gone.has(m.id)) };
    const plan = analyzeProject(broken);
    const a = plan.actions.find((x) => x.kind === 'pruneGroups');
    expect(a?.label).toContain('lege voice-groep');
    expect(plan.summary).toContain('lege voice-groepen');
  });
});
