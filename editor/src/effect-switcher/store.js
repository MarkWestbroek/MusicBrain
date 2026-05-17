// Minimal external store with localStorage persistence and React subscription
// via useSyncExternalStore. Zero dependencies.
import { useSyncExternalStore } from 'react';
import { emptyProject } from './types';
const STORAGE_KEY = 'mb.effect-switcher.v1';
class ProjectStore {
    state;
    listeners = new Set();
    constructor() {
        this.state = this.load();
    }
    load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw)
                return emptyProject();
            const parsed = JSON.parse(raw);
            // Light sanity-check / migration hook
            if (parsed && parsed.version === 1)
                return parsed;
        }
        catch {
            // fallthrough
        }
        return emptyProject();
    }
    persist() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        }
        catch {
            // quota / private mode: ignored
        }
    }
    getSnapshot = () => this.state;
    subscribe = (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };
    /** Replace the entire project (immutably). */
    set(update) {
        this.state = update(this.state);
        this.persist();
        for (const l of this.listeners)
            l();
    }
    reset() {
        this.state = emptyProject();
        this.persist();
        for (const l of this.listeners)
            l();
    }
}
export const projectStore = new ProjectStore();
export function useProject() {
    return useSyncExternalStore(projectStore.subscribe, projectStore.getSnapshot);
}
