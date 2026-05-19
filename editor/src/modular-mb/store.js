// Modular MB store — useSyncExternalStore pattern (mirrors ES).
// v2 model. `setProject()` migrates v1 inputs on the fly.
import { useSyncExternalStore } from 'react';
import { emptyModularProject, migrateProject, } from './types';
let current = emptyModularProject();
const listeners = new Set();
function emit() { for (const l of listeners)
    l(); }
export function getProject() { return current; }
/** Accepts any unknown input (v1 or v2) and migrates to v2 if recognised.
 *  Returns true on success, false on unrecognised input. */
export function setProject(next) {
    if (next && typeof next === 'object' && next.version === 2) {
        current = next;
        emit();
        return true;
    }
    const migrated = migrateProject(next);
    if (!migrated)
        return false;
    current = migrated;
    emit();
    return true;
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
export function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
