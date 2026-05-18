import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// SettingsPanel.tsx
//
// Gear-icon dropdown for device connectivity settings.
//
// State is persisted to localStorage key 'mb.settings.v1' so it survives
// page reloads without polluting the project document.
//
// The "Test connection" button is currently simulated (no real fetch).
// When the real Connect-to-device flow lands it will fire
//   GET <deviceUrl>/api/status
// and display firmware version + uptime.
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
const STORAGE_KEY = 'mb.settings.v1';
function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw)
            return { ...defaultSettings(), ...JSON.parse(raw) };
    }
    catch { /* ignore */ }
    return defaultSettings();
}
function defaultSettings() {
    return { deviceUrl: 'musicbrain.local', transport: 'auto', lastSync: null };
}
function saveSettings(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
/** Gear-icon button + drop-down settings panel for device connectivity.
 *  Closes when the user clicks outside. */
export function SettingsButton() {
    const [open, setOpen] = useState(false);
    const [settings, setSettings] = useState(loadSettings);
    const [testStatus, setTest] = useState(null);
    const [testing, setTesting] = useState(false);
    const panelRef = useRef(null);
    // Close on outside click
    useEffect(() => {
        if (!open)
            return;
        function onDown(e) {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);
    function update(patch) {
        const next = { ...settings, ...patch };
        setSettings(next);
        saveSettings(next);
    }
    /** Simulated connection test. Replace the body with a real fetch() later. */
    function testConnection() {
        setTesting(true);
        setTest(null);
        window.setTimeout(() => {
            // Simulate success 80 % of the time so the UI path is exercisable.
            const ok = Math.random() > 0.2;
            if (ok) {
                setTest(t('settings.ok', { info: 'firmware v0.1.0, uptime 42 s' }));
                update({ lastSync: new Date().toISOString() });
            }
            else {
                setTest(t('settings.fail', { err: 'ECONNREFUSED (device not reachable)' }));
            }
            setTesting(false);
        }, 900);
    }
    const lastSyncLabel = settings.lastSync
        ? new Date(settings.lastSync).toLocaleString()
        : t('settings.never');
    return (_jsxs("div", { className: "es-settings-wrap", ref: panelRef, children: [_jsx("button", { className: `es-settings-gear${open ? ' open' : ''}`, onClick: () => setOpen((v) => !v), title: t('settings.title'), "aria-expanded": open, children: "\u2699" }), open && (_jsxs("div", { className: "es-settings-panel", children: [_jsx("div", { className: "es-settings-title", children: t('settings.title') }), _jsxs("label", { className: "es-settings-row", children: [_jsx("span", { children: t('settings.deviceUrl') }), _jsx("input", { type: "text", value: settings.deviceUrl, onChange: (e) => update({ deviceUrl: e.target.value }), placeholder: "musicbrain.local", spellCheck: false })] }), _jsxs("label", { className: "es-settings-row", children: [_jsx("span", { children: t('settings.transport') }), _jsxs("select", { value: settings.transport, onChange: (e) => update({ transport: e.target.value }), children: [_jsx("option", { value: "auto", children: t('settings.transport.auto') }), _jsx("option", { value: "wifi", children: t('settings.transport.wifi') }), _jsx("option", { value: "usb", children: t('settings.transport.usb') })] })] }), _jsxs("div", { className: "es-settings-row es-settings-test-row", children: [_jsx("button", { className: "primary", disabled: testing, onClick: testConnection, children: testing ? t('settings.testing') : t('settings.test') }), testStatus && (_jsx("span", { className: `es-settings-test-result ${testStatus.startsWith('OK') ? 'ok' : 'fail'}`, children: testStatus }))] }), _jsxs("div", { className: "es-settings-footer", children: [t('settings.lastSync'), ": ", _jsx("em", { children: lastSyncLabel })] })] }))] }));
}
