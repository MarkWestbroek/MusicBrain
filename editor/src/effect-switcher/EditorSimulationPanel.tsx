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

type Transport = 'usb' | 'wifi';
type ScreenState =
  | { kind: 'idle' }
  | { kind: 'connected' }
  | { kind: 'fetching' }      // device is sending config to browser
  | { kind: 'receiving' }    // browser is writing config to device
  | { kind: 'applying'; patch: number };

interface LogEntry { t: number; from: 'browser' | 'device'; text: string; }

export function EditorSimulationPanel(): JSX.Element {
  const project = useProject();
  const activePatch = project.patches.find((p) => p.id === project.activePatchId)
                   ?? project.patches[0];
  const [transport, setTransport]     = useState<Transport>('wifi');
  const [connected, setConnected]     = useState(false);
  const [screen, setScreen]           = useState<ScreenState>({ kind: 'idle' });
  const [log, setLog]                 = useState<LogEntry[]>([]);
  const [activateId, setActivateId]   = useState<number>(0);

  /** Append a log line. Keeps the last 40 entries. */
  function push(from: 'browser' | 'device', text: string): void {
    setLog((prev) => [...prev.slice(-39), { t: Date.now(), from, text }]);
  }

  // Simulated requests: just push to log + nudge the device screen.
  function doConnect(): void {
    setConnected(true);
    setScreen({ kind: 'connected' });
    push('browser', `connect via ${transport.toUpperCase()}`);
    push('device',  `200 OK — handshake`);
  }
  function doDisconnect(): void {
    setConnected(false);
    setScreen({ kind: 'idle' });
    push('browser', 'disconnect');
  }
  function doGetConfig(): void {
    push('browser', 'GET /api/config');
    setScreen({ kind: 'fetching' });
    window.setTimeout(() => {
      const name = project.name || '(unnamed)';
      const cv   = project.configVersion || '—';
      push('device', `200 OK — "${name}" v${cv} · ${project.devices.length} devices, ${project.patches.length} patches`);
      setScreen({ kind: 'connected' });
    }, 500);
  }
  function doPutConfig(): void {
    push('browser', `PUT /api/config (${project.devices.length} devices)`);
    setScreen({ kind: 'receiving' });
    window.setTimeout(() => {
      push('device', '200 OK — config persisted to LittleFS');
      setScreen({ kind: 'connected' });
    }, 600);
  }
  function doGetStatus(): void {
    push('browser', 'GET /api/status');
    // firmware version and config version are independent:
    // firmware 0.1.0 = the .bin flashed on the chip
    // configVersion  = user-managed label on the project (e.g. '2.0.0')
    const cv = project.configVersion ? ` · config v${project.configVersion}` : '';
    push('device', `200 OK — firmware v0.1.0${cv}, uptime ${Math.round(performance.now() / 1000)}s, free heap 142 KiB`);
  }
  function doActivate(): void {
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
      case 'idle':       return t('sim.editor.screen.idle');
      case 'connected':  return t('sim.editor.screen.connected');
      case 'fetching':   return t('sim.editor.screen.fetching');
      case 'receiving':  return t('sim.editor.screen.receiving');
      case 'applying':   return t('sim.editor.screen.applying', { n: screen.patch });
    }
  })();

  return (
    <div className="es-edsim">

      {/* ── Browser column ── */}
      <div className="es-edsim-stage es-edsim-browser">
        <div className="es-edsim-stage-title">{t('sim.editor.browser')}</div>
        <div className="es-edsim-browser-bar">⌂ http://musicbrain.local/</div>

        <label className="es-edsim-transport">
          {t('sim.editor.transport')}:
          <select
            value={transport}
            onChange={(e) => setTransport(e.target.value as Transport)}
            disabled={connected}
          >
            <option value="usb">{t('sim.editor.transport.usb')}</option>
            <option value="wifi">{t('sim.editor.transport.wifi')}</option>
          </select>
        </label>

        <div className="es-edsim-btns">
          {connected
            ? <button onClick={doDisconnect}>{t('sim.editor.disconnect')}</button>
            : <button className="primary" onClick={doConnect}>{t('sim.editor.connect')}</button>}
          <button disabled={!connected} onClick={doGetStatus}>{t('sim.editor.getStatus')}</button>
          <button disabled={!connected} onClick={doGetConfig}>{t('sim.editor.getConfig')}</button>
          <button disabled={!connected} onClick={doPutConfig}>{t('sim.editor.putConfig')}</button>
          <div className="es-edsim-activate-row">
            <select
              disabled={!connected}
              value={activateId}
              onChange={(e) => setActivateId(parseInt(e.target.value, 10))}
            >
              {project.patches.map((p) => (
                <option key={p.id} value={p.id}>patch {p.id} — {p.name}</option>
              ))}
            </select>
            <button disabled={!connected || project.patches.length === 0} onClick={doActivate}>
              POST /api/patch/{activateId}
            </button>
          </div>
        </div>
      </div>

      {/* ── Transport visualisation ── */}
      <div className={`es-edsim-link ${transport} ${connected ? 'on' : 'off'}`}>
        {transport === 'usb' ? <UsbCable on={connected} /> : <WifiWaves on={connected} />}
      </div>

      {/* ── ESP32 column ── */}
      <div className="es-edsim-stage es-edsim-device">
        <div className="es-edsim-stage-title">{t('sim.editor.device')}</div>
        <div className="es-edsim-esp">
          <div className="es-edsim-esp-screen">
            <div className="es-edsim-esp-screen-line1">MusicBrain</div>
            <div className="es-edsim-esp-screen-line2">{screenLine}</div>
          </div>
          <div className="es-edsim-esp-led" data-on={connected ? '1' : '0'} title="status LED" />
          <div className="es-edsim-esp-label">ESP32-WROOM</div>
        </div>
      </div>

      {/* ── Request log (spans full width) ── */}
      <div className="es-edsim-log">
        <div className="es-edsim-log-title">{t('sim.editor.log')}</div>
        {log.length === 0
          ? <div className="es-edsim-log-empty">—</div>
          : [...log].reverse().map((e, i) => (
              <div key={e.t + '_' + i} className={`es-edsim-log-entry from-${e.from}`}>
                <span className="es-edsim-log-time">{new Date(e.t).toLocaleTimeString()}</span>
                <span className="es-edsim-log-from">{e.from === 'browser' ? '→' : '←'}</span>
                <span className="es-edsim-log-text">{e.text}</span>
              </div>
            ))}
      </div>
    </div>
  );
}

// ─── Cute SVG cable / WiFi visualisation ────────────────────────────────────

function UsbCable({ on }: { on: boolean }): JSX.Element {
  const stroke = on ? '#16a34a' : '#94a3b8';
  return (
    <svg width="120" height="40" viewBox="0 0 120 40" aria-label="USB cable">
      <rect x="0" y="14" width="14" height="12" fill={stroke} />          {/* connector */}
      <rect x="106" y="14" width="14" height="12" fill={stroke} />        {/* connector */}
      <path d="M14 20 Q 40 -2 60 20 Q 80 42 106 20" fill="none" stroke={stroke} strokeWidth="3" />
      <text x="60" y="36" fontSize="9" textAnchor="middle" fill={stroke}>USB</text>
    </svg>
  );
}

function WifiWaves({ on }: { on: boolean }): JSX.Element {
  const stroke = on ? '#2563eb' : '#94a3b8';
  return (
    <svg width="120" height="40" viewBox="0 0 120 40" aria-label="WiFi link">
      {/* three concentric arcs from each side */}
      <g stroke={stroke} strokeWidth="2" fill="none">
        <path d="M 20 28 Q 30 14 40 28" />
        <path d="M 14 32 Q 30  6 46 32" />
        <path d="M  8 36 Q 30  0 52 36" />
        <path d="M 80 28 Q 90 14 100 28" />
        <path d="M 74 32 Q 90  6 106 32" />
        <path d="M 68 36 Q 90  0 112 36" />
      </g>
      <text x="60" y="22" fontSize="9" textAnchor="middle" fill={stroke}>WiFi</text>
    </svg>
  );
}
