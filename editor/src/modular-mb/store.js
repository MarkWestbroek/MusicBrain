// Minimal store for the Modular MB editor (v0.1). Mirrors the pattern of
// effect-switcher/store.ts: a single `useSyncExternalStore`-friendly value
// in module scope, with a subscribe API for React.
//
// We deliberately do not use Zustand/Redux here so the editor stays free
// of external dependencies beyond React and React-Flow.
import { useSyncExternalStore } from 'react';
import { emptyModularProject } from './types';
let current = emptyModularProject();
const listeners = new Set();
function emit() { for (const l of listeners)
    l(); }
export function getProject() { return current; }
export function setProject(next) {
    current = next;
    emit();
}
export function updateProject(fn) {
    current = fn(current);
    emit();
}
export function subscribe(listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
export function useModularProject() {
    return useSyncExternalStore(subscribe, getProject, getProject);
}
