// Modular MB store — useSyncExternalStore pattern (mirrors ES).
// v2 model. `setProject()` migrates v1 inputs on the fly.

import { useSyncExternalStore } from 'react';
import {
  type ModularProject,
  emptyModularProject,
  migrateProject,
} from './types';

let current: ModularProject = emptyModularProject();
const listeners = new Set<() => void>();

function emit(): void { for (const l of listeners) l(); }

export function getProject(): ModularProject { return current; }

/** Accepts any unknown input (v1 or v2) and migrates to v2 if recognised.
 *  Returns true on success, false on unrecognised input. */
export function setProject(next: ModularProject | unknown): boolean {
  if (next && typeof next === 'object' && (next as { version?: unknown }).version === 2) {
    current = next as ModularProject;
    emit();
    return true;
  }
  const migrated = migrateProject(next);
  if (!migrated) return false;
  current = migrated;
  emit();
  return true;
}

export function updateProject(fn: (p: ModularProject) => ModularProject): void {
  current = fn(current);
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useModularProject(): ModularProject {
  return useSyncExternalStore(subscribe, getProject, getProject);
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
