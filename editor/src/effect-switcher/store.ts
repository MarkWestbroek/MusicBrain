// Minimal external store with localStorage persistence and React subscription
// via useSyncExternalStore. Zero dependencies.

import { useSyncExternalStore } from 'react';
import { emptyProject, type SwitcherProject } from './types';

const STORAGE_KEY = 'mb.effect-switcher.v1';

type Listener = () => void;

class ProjectStore {
  private state: SwitcherProject;
  private listeners = new Set<Listener>();

  constructor() {
    this.state = this.load();
  }

  private load(): SwitcherProject {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyProject();
      const parsed = JSON.parse(raw) as SwitcherProject;
      // Light sanity-check / migration hook
      if (parsed && parsed.version === 1) return parsed;
    } catch {
      // fallthrough
    }
    return emptyProject();
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // quota / private mode: ignored
    }
  }

  getSnapshot = (): SwitcherProject => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Replace the entire project (immutably). */
  set(update: (prev: SwitcherProject) => SwitcherProject): void {
    this.state = update(this.state);
    this.persist();
    for (const l of this.listeners) l();
  }

  reset(): void {
    this.state = emptyProject();
    this.persist();
    for (const l of this.listeners) l();
  }
}

export const projectStore = new ProjectStore();

export function useProject(): SwitcherProject {
  return useSyncExternalStore(projectStore.subscribe, projectStore.getSnapshot);
}
