// Minimal store for the Modular MB editor (v0.1). Mirrors the pattern of
// effect-switcher/store.ts: a single `useSyncExternalStore`-friendly value
// in module scope, with a subscribe API for React.
//
// We deliberately do not use Zustand/Redux here so the editor stays free
// of external dependencies beyond React and React-Flow.

import { useSyncExternalStore } from 'react';
import { type ModularProject, emptyModularProject } from './types';

let current: ModularProject = emptyModularProject();
const listeners = new Set<() => void>();

function emit(): void { for (const l of listeners) l(); }

export function getProject(): ModularProject { return current; }

export function setProject(next: ModularProject): void {
  current = next;
  emit();
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
