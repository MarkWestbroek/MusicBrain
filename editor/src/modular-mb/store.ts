// Modular MB store — useSyncExternalStore pattern (mirrors ES).
// v2 model. `setProject()` migrates v1 inputs on the fly.
// iter-5.7: undo/redo via past/future stacks (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z).

import { useSyncExternalStore } from 'react';
import {
  type ModularProject,
  emptyModularProject,
  migrateProject,
} from './types';

let current: ModularProject = emptyModularProject();
const past: ModularProject[] = [];
const future: ModularProject[] = [];
const HISTORY_MAX = 100;
const COALESCE_MS = 350;
let lastPushAt = 0;

const listeners = new Set<() => void>();

function emit(): void { for (const l of listeners) l(); }

export function getProject(): ModularProject { return current; }

/** Accepts any unknown input (v1 or v2) and migrates to v2 if recognised.
 *  Reset the undo/redo history (load = nieuw uitgangspunt). */
export function setProject(next: ModularProject | unknown): boolean {
  if (next && typeof next === 'object' && (next as { version?: unknown }).version === 2) {
    current = next as ModularProject;
    past.length = 0; future.length = 0; lastPushAt = 0;
    emit();
    return true;
  }
  const migrated = migrateProject(next);
  if (!migrated) return false;
  current = migrated;
  past.length = 0; future.length = 0; lastPushAt = 0;
  emit();
  return true;
}

interface UpdateOptions {
  /** Sla deze edit niet op in de history (b.v. live-engine status). */
  skipHistory?: boolean;
  /** Forceer een nieuwe history-entry, ook als coalescing-window nog open is. */
  forceCommit?: boolean;
}

export function updateProject(
  fn: (p: ModularProject) => ModularProject,
  opts: UpdateOptions = {},
): void {
  const prev = current;
  const next = fn(prev);
  if (next === prev) return;

  if (!opts.skipHistory) {
    const now = Date.now();
    const coalesce = !opts.forceCommit && (now - lastPushAt) < COALESCE_MS;
    if (!coalesce) {
      past.push(prev);
      if (past.length > HISTORY_MAX) past.shift();
      future.length = 0;
    }
    lastPushAt = now;
  }

  current = next;
  emit();
}

export function undo(): boolean {
  const prev = past.pop();
  if (!prev) return false;
  future.push(current);
  if (future.length > HISTORY_MAX) future.shift();
  current = prev;
  lastPushAt = 0;
  emit();
  return true;
}

export function redo(): boolean {
  const next = future.pop();
  if (!next) return false;
  past.push(current);
  if (past.length > HISTORY_MAX) past.shift();
  current = next;
  lastPushAt = 0;
  emit();
  return true;
}

export function canUndo(): boolean { return past.length > 0; }
export function canRedo(): boolean { return future.length > 0; }

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
