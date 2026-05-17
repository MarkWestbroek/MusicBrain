import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// EditorSimulationPanel.tsx
//
// Second simulation use-case: an engineer editing the configuration in the
// browser and pushing it to the ESP32 over either USB or WiFi.
//
// Everything here is a *visual* simulation — no real HTTP calls are made.
// (When the real "Connect to device" panel lands, it will reuse this layout
// but the buttons will actually hit the ESP32 REST endpoints.)
//
// Layout (left → middle → right):
//   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
//   │   Browser    │====│  Transport   │====│    ESP32     │
//   │  (4 buttons) │  cable / WiFi     │   (tiny screen)   │
//   └──────────────┘    └──────────────┘    └──────────────┘
//
// Bottom row: scrollable request log (newest on top).
import { useState } from 'react';
import { useProject } from './store';
import { t } from '../i18n';
export function EditorSimulationPanel() {
    const project = useProject();
    const activePatch = project.patches.find((p) => p.id === project.activePatchId)
        ?? project.patches[0];
    const [transport, setTransport] = useState('wifi');
    const [connected, setConnected] = useState(false);
    const [screen, setScreen] = useState({ kind: 'idle' });
    const [log, setLog] = useState([]);
    const [activateId, setActivateId] = useState(0);
    /** Append a log line. Keeps the last 40 entries. */
    function push(from, text) {
        setLog((prev) => [...prev.slice(-39), { t: Date.now(), from, text }]);
    }
    // Simulated requests: just push to log + nudge the device screen.
    function doConnect() {
        setConnected(true);
        setScreen({ kind: 'connected' });
        push('browser', `connect via ${transport.toUpperCase()}`);
        push('device', `200 OK — handshake`);
    }
    function doDisconnect() {
        setConnected(false);
        setScreen({ kind: 'idle' });
        push('browser', 'disconnect');
    }
    function doGetConfig() {
        push('browser', 'GET /api/config');
        setScreen({ kind: 'fetching' });
        window.setTimeout(() => {
            const name = project.name || '(unnamed)';
            const cv = project.configVersion || '—';
            push('device', `200 OK — "${name}" v${cv} · ${project.devices.length} devices, ${project.patches.length} patches`);
            setScreen({ kind: 'connected' });
        }, 500);
    }
    function doPutConfig() {
        push('browser', `PUT /api/config (${project.devices.length} devices)`);
        setScreen({ kind: 'receiving' });
        window.setTimeout(() => {
            push('device', '200 OK — config persisted to LittleFS');
            setScreen({ kind: 'connected' });
        }, 600);
    }
    function doGetStatus() {
        push('browser', 'GET /api/status');
        // firmware version and config version are independent:
        // firmware 0.1.0 = the .bin flashed on the chip
        // configVersion  = user-managed label on the project (e.g. '2.0.0')
        const cv = project.configVersion ? ` · config v${project.configVersion}` : '';
        push('device', `200 OK — firmware v0.1.0${cv}, uptime ${Math.round(performance.now() / 1000)}s, free heap 142 KiB`);
    }
    function doActivate() {
        const id = activateId;
        const name = project.patches.find((p) => p.id === id)?.name ?? '';
        push('browser', `POST /api/patch/${id}`);
        setScreen({ kind: 'applying', patch: id });
        window.setTimeout(() => {
            push('device', `200 OK — relays driven for "${name}" (patch ${id})`);
            setScreen({ kind: 'connected' });
        }, 400);
    }
    // ─── Screen text ─────────────────────────────────────────────────────────
    const screenLine = (() => {
        switch (screen.kind) {
            case 'idle': return t('sim.editor.screen.idle');
            case 'connected': return t('sim.editor.screen.connected');
            case 'fetching': return t('sim.editor.screen.fetching');
            case 'receiving': return t('sim.editor.screen.receiving');
            case 'applying': return t('sim.editor.screen.applying', { n: screen.patch });
        }
    })();
    return (_jsxs("div", { className: "es-edsim", children: [_jsxs("div", { className: "es-edsim-stage es-edsim-browser", children: [_jsx("div", { className: "es-edsim-stage-title", children: t('sim.editor.browser') }), _jsx("div", { className: "es-edsim-browser-bar", children: "\u2302 http://musicbrain.local/" }), _jsxs("label", { className: "es-edsim-transport", children: [t('sim.editor.transport'), ":", _jsxs("select", { value: transport, onChange: (e) => setTransport(e.target.value), disabled: connected, children: [_jsx("option", { value: "usb", children: t('sim.editor.transport.usb') }), _jsx("option", { value: "wifi", children: t('sim.editor.transport.wifi') })] })] }), _jsxs("div", { className: "es-edsim-btns", children: [connected
                                ? _jsx("button", { onClick: doDisconnect, children: t('sim.editor.disconnect') })
                                : _jsx("button", { className: "primary", onClick: doConnect, children: t('sim.editor.connect') }), _jsx("button", { disabled: !connected, onClick: doGetStatus, children: t('sim.editor.getStatus') }), _jsx("button", { disabled: !connected, onClick: doGetConfig, children: t('sim.editor.getConfig') }), _jsx("button", { disabled: !connected, onClick: doPutConfig, children: t('sim.editor.putConfig') }), _jsxs("div", { className: "es-edsim-activate-row", children: [_jsx("select", { disabled: !connected, value: activateId, onChange: (e) => setActivateId(parseInt(e.target.value, 10)), children: project.patches.map((p) => (_jsxs("option", { value: p.id, children: ["patch ", p.id, " \u2014 ", p.name] }, p.id))) }), _jsxs("button", { disabled: !connected || project.patches.length === 0, onClick: doActivate, children: ["POST /api/patch/", activateId] })] })] })] }), _jsx("div", { className: `es-edsim-link ${transport} ${connected ? 'on' : 'off'}`, children: transport === 'usb' ? _jsx(UsbCable, { on: connected }) : _jsx(WifiWaves, { on: connected }) }), _jsxs("div", { className: "es-edsim-stage es-edsim-device", children: [_jsx("div", { className: "es-edsim-stage-title", children: t('sim.editor.device') }), _jsxs("div", { className: "es-edsim-esp", children: [_jsxs("div", { className: "es-edsim-esp-screen", children: [_jsx("div", { className: "es-edsim-esp-screen-line1", children: "MusicBrain" }), _jsx("div", { className: "es-edsim-esp-screen-line2", children: screenLine })] }), _jsx("div", { className: "es-edsim-esp-led", "data-on": connected ? '1' : '0', title: "status LED" }), _jsx("div", { className: "es-edsim-esp-label", children: "ESP32-WROOM" })] })] }), _jsxs("div", { className: "es-edsim-log", children: [_jsx("div", { className: "es-edsim-log-title", children: t('sim.editor.log') }), log.length === 0
                        ? _jsx("div", { className: "es-edsim-log-empty", children: "\u2014" })
                        : [...log].reverse().map((e, i) => (_jsxs("div", { className: `es-edsim-log-entry from-${e.from}`, children: [_jsx("span", { className: "es-edsim-log-time", children: new Date(e.t).toLocaleTimeString() }), _jsx("span", { className: "es-edsim-log-from", children: e.from === 'browser' ? '→' : '←' }), _jsx("span", { className: "es-edsim-log-text", children: e.text })] }, e.t + '_' + i)))] })] }));
}
// ─── Cute SVG cable / WiFi visualisation ────────────────────────────────────
function UsbCable({ on }) {
    const stroke = on ? '#16a34a' : '#94a3b8';
    return (_jsxs("svg", { width: "120", height: "40", viewBox: "0 0 120 40", "aria-label": "USB cable", children: [_jsx("rect", { x: "0", y: "14", width: "14", height: "12", fill: stroke }), "          ", _jsx("rect", { x: "106", y: "14", width: "14", height: "12", fill: stroke }), "        ", _jsx("path", { d: "M14 20 Q 40 -2 60 20 Q 80 42 106 20", fill: "none", stroke: stroke, strokeWidth: "3" }), _jsx("text", { x: "60", y: "36", fontSize: "9", textAnchor: "middle", fill: stroke, children: "USB" })] }));
}
function WifiWaves({ on }) {
    const stroke = on ? '#2563eb' : '#94a3b8';
    return (_jsxs("svg", { width: "120", height: "40", viewBox: "0 0 120 40", "aria-label": "WiFi link", children: [_jsxs("g", { stroke: stroke, strokeWidth: "2", fill: "none", children: [_jsx("path", { d: "M 20 28 Q 30 14 40 28" }), _jsx("path", { d: "M 14 32 Q 30  6 46 32" }), _jsx("path", { d: "M  8 36 Q 30  0 52 36" }), _jsx("path", { d: "M 80 28 Q 90 14 100 28" }), _jsx("path", { d: "M 74 32 Q 90  6 106 32" }), _jsx("path", { d: "M 68 36 Q 90  0 112 36" })] }), _jsx("text", { x: "60", y: "22", fontSize: "9", textAnchor: "middle", fill: stroke, children: "WiFi" })] }));
}
