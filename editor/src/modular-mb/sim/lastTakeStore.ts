// De laatst gemaakte take (⏺ Opname of demo), zodat een voorstel naar de
// patch-pool hem kan meesturen. Eén per patch-id; alleen in het geheugen.

import type { Take } from './mediaLibrary';

const takes = new Map<string, { take: Take; uploadedGroup?: string }>();
const listeners = new Set<() => void>();

export function setLastTake(patchId: string, take: Take, uploadedGroup?: string): void {
  takes.set(patchId, { take, uploadedGroup });
  listeners.forEach((fn) => fn());
}
export function markUploaded(patchId: string, group: string): void {
  const t = takes.get(patchId);
  if (t) { t.uploadedGroup = group; listeners.forEach((fn) => fn()); }
}
export function lastTakeFor(patchId: string): { take: Take; uploadedGroup?: string } | undefined { return takes.get(patchId); }
export function onLastTake(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
