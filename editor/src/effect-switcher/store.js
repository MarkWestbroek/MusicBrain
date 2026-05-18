// Minimal external store with localStorage persistence and React subscription
// via useSyncExternalStore. Zero dependencies.
import { useSyncExternalStore } from 'react';
import { emptyProject } from './types';
const STORAGE_KEY = 'mb.effect-switcher.v1';
/** Internal store class. Exposed for TypeDoc only — use `useProject()` and
 *  `projectStore` in application code. */
export class ProjectStore {
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
    /** Snapshot accessor for `useSyncExternalStore`. Returns the *same*
     *  reference until `set()` swaps it out, so React's identity check works. */
    getSnapshot = () => this.state;
    /** Subscribe to state changes. Returns an unsubscribe function. */
    subscribe = (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };
    /** Replace the project immutably via an updater. Persists to localStorage
     *  and notifies every subscriber. All `actions.ts` helpers go through here. */
    set(update) {
        this.state = update(this.state);
        this.persist();
        for (const l of this.listeners)
            l();
    }
    /** Wipe back to the empty default project. */
    reset() {
        this.state = emptyProject();
        this.persist();
        for (const l of this.listeners)
            l();
    }
}
export const projectStore = new ProjectStore();
/** React hook — subscribe a component to the project store and re-render on
 *  every change. Equivalent to `useSyncExternalStore(subscribe, getSnapshot)`. */
export function useProject() {
    return useSyncExternalStore(projectStore.subscribe, projectStore.getSnapshot);
}
