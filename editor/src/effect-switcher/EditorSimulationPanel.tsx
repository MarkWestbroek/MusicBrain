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
import { DeviceApi } from '../api/deviceApi';
import { loadProject } from './actions';
import { DEFAULT_CATEGORIES, type SwitcherProject } from './types';

// ─── Hardware display variants ───────────────────────────────────────────────

/** All supported simulated display modules. Extend this table when adding
 *  support for more hardware. */
export interface DisplayVariant {
  id:    string;
  label: string;
  /** Width × height in logical pixels (for the OLED rectangle render). */
  width:  number;
  height: number;
  /** Rough description shown in the selector tooltip. */
  notes: string;
}

export const DISPLAY_VARIANTS: DisplayVariant[] = [
  { id: 'ssd1306-128x64', label: 'SSD1306 128×64 OLED (0.96″)',  width: 128, height: 64,  notes: 'Most common; I²C addr 0x3C or 0x3D. 4-pin: VCC GND SCL SDA.' },
  { id: 'ssd1306-128x32', label: 'SSD1306 128×32 OLED (0.91″)',  width: 128, height: 32,  notes: 'Slim version; same driver, half the height.' },
  { id: 'sh1106-128x64',  label: 'SH1106 128×64 OLED (1.3″)',    width: 128, height: 64,  notes: 'Slightly larger; needs SH1106 lib instead of SSD1306.' },
  { id: 'st7735-128x160', label: 'ST7735 128×160 TFT (1.8″)',     width: 160, height: 128, notes: 'Colour TFT; SPI. Firmware needs TFT_eSPI or Adafruit_ST7735.' },
  { id: 'none',           label: 'No display',                    width: 0,   height: 0,   notes: 'Headless device; no screen wired.' },
];

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
  const [variantId, setVariantId]     = useState<string>('ssd1306-128x64');

  const variant = DISPLAY_VARIANTS.find((v) => v.id === variantId) ?? DISPLAY_VARIANTS[0]!;

  // Read device URL from localStorage (same key as SettingsPanel)
  const deviceUrl = (() => {
    try {
      const raw = localStorage.getItem('mb.settings.v1');
      if (raw) return JSON.parse(raw).deviceUrl || 'musicbrain.local';
    } catch { /* ignore */ }
    return 'musicbrain.local';
  })();
  const api = new DeviceApi(`http://${deviceUrl}`);

  /** Append a log line. Keeps the last 40 entries. */
  function push(from: 'browser' | 'device', text: string): void {
    setLog((prev) => [...prev.slice(-39), { t: Date.now(), from, text }]);
  }

  // Real HTTP requests to the device.
  async function doConnect(): Promise<void> {
    push('browser', `connect via ${transport.toUpperCase()} → ${deviceUrl}`);
    try {
      const status = await api.getStatus();
      setConnected(true);
      setScreen({ kind: 'connected' });
      push('device', `200 OK — ${status.chip} fw${status.firmware}, ${status.wifi.ip}`);
    } catch (err) {
      push('device', `FAIL — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  function doDisconnect(): void {
    setConnected(false);
    setScreen({ kind: 'idle' });
    push('browser', 'disconnect');
  }
  async function doGetConfig(): Promise<void> {
    push('browser', 'GET /api/config');
    setScreen({ kind: 'fetching' });
    try {
      const config = await api.getConfig();
      // Show detailed summary
      push('device', `200 OK — "${config.name}" v${config.configVersion}`);
      push('device', `  ${config.devices.length} devices, ${config.patches.length} patches`);
      if (config.devices.length > 0) {
        const deviceList = config.devices.slice(0, 5).map((d: any) => `${d.brand} ${d.model}`).join(', ');
        push('device', `  Devices: ${deviceList}${config.devices.length > 5 ? '...' : ''}`);
      }
      if (config.patches.length > 0) {
        const patchList = config.patches.slice(0, 5).map((p: any) => p.name).join(', ');
        push('device', `  Patches: ${patchList}${config.patches.length > 5 ? '...' : ''}`);
      }
      setScreen({ kind: 'connected' });
    } catch (err) {
      push('device', `FAIL — ${err instanceof Error ? err.message : String(err)}`);
      setScreen({ kind: 'connected' });
    }
  }
  async function doLoadFromDevice(): Promise<void> {
    push('browser', 'Loading config into editor (smart merge)...');
    setScreen({ kind: 'fetching' });
    try {
      const config = await api.getConfig();
      // Smart merge: match existing devices by brand+model to preserve
      // images, positions, and the visual chain layout.
      const existingDevices = project.devices;
      let matchedCount = 0;
      let newCount = 0;
      
      // Sort devices by relayIndex so the physical signal chain is honoured
      const sortedConfigDevices = [...config.devices].sort(
        (a: any, b: any) => a.relayIndex - b.relayIndex
      );
      
      // Build new device list. Matched devices keep x, y, imageDataUrl, categoryId.
      const devices = sortedConfigDevices.map((d: any) => {
        const existing = existingDevices.find(
          e => e.brand === d.brand && e.model === d.model
        );
        
        if (existing) {
          matchedCount++;
          // Preserve EVERYTHING from the editor (x, y, image, category, …)
          // Only update the relayIndex coming from the device.
          return { ...existing, relayIndex: d.relayIndex };
        } else {
          newCount++;
          // Brand-new device from the firmware — no image, default position
          return {
            id: d.id,
            brand: d.brand,
            model: d.model,
            categoryId: 'utility',
            relayIndex: d.relayIndex,
            x: 80 + newCount * 220,
            y: 160,
          };
        }
      });
      
      // Build ID mapping so patches point to the right editor device IDs.
      const idMap = new Map<string, string>();
      devices.forEach((d: any) => {
        const cd = config.devices.find(
          (cd: any) => cd.brand === d.brand && cd.model === d.model && cd.relayIndex === d.relayIndex
        );
        if (cd) idMap.set(cd.id, d.id);
      });
      
      const patches = config.patches.map((p: any) => ({
        id: p.id,
        name: p.name,
        bypassed: (p.bypassed || []).map((configId: string) => idMap.get(configId) || configId),
      }));
      
      // ── Edges: preserve existing layout where possible ─────────────────
      const newDeviceIds = new Set(devices.map((d: any) => d.id));
      const validNodeIds = new Set([...newDeviceIds, 'input', 'output']);
      
      // Keep edges where both source and target still exist.
      let edges = project.edges.filter(
        (e) => validNodeIds.has(e.source) && validNodeIds.has(e.target)
      );
      
      // If the user never had edges (fresh project) fall back to linear chain.
      if (edges.length === 0 && devices.length > 0) {
        edges = [
          { id: `e_input_${devices[0].id}`, source: 'input', target: devices[0].id },
          ...devices.slice(0, -1).map((d: any, i: number) => ({
            id: `e_${d.id}_${devices[i + 1].id}`,
            source: d.id,
            target: devices[i + 1].id,
          })),
          {
            id: `e_${devices[devices.length - 1].id}_output`,
            source: devices[devices.length - 1].id,
            target: 'output',
          },
        ];
      }

      const mergedProject: SwitcherProject = {
        version: 1,
        name: config.name,
        configVersion: config.configVersion,
        relayCount: config.relayCount || 16,
        categories: DEFAULT_CATEGORIES,
        activePatchId: config.activePatchId || 0,
        edges,
        devices,
        patches,
      };
      
      loadProject(mergedProject);
      push('device', `200 OK — merged: ${matchedCount} matched, ${newCount} new`);
      push('device', `  ${devices.length} devices, ${patches.length} patches`);
      setScreen({ kind: 'connected' });
    } catch (err) {
      push('device', `FAIL — ${err instanceof Error ? err.message : String(err)}`);
      setScreen({ kind: 'connected' });
    }
  }
  async function doPutConfig(): Promise<void> {
    push('browser', `PUT /api/config (${project.devices.length} devices)`);
    setScreen({ kind: 'receiving' });
    try {
      // Convert project to device config format
      // EffectDevice: { id, brand, model, categoryId, relayIndex, x, y }
      // SwitcherPatch: { id, name, bypassed: string[] }
      const config = {
        version: 1,  // required by firmware schema validation
        activePatchId: project.activePatchId,
        name: project.name || 'unnamed',
        configVersion: project.configVersion || '1.0',
        relayCount: project.relayCount,
        devices: project.devices.map(d => ({
          id: d.id,
          brand: d.brand,
          model: d.model,
          relayIndex: d.relayIndex
        })),
        patches: project.patches.map(p => ({
          id: p.id,
          name: p.name,
          bypassed: p.bypassed
        }))
      };
      await api.putConfig(config as any);
      push('device', '200 OK — config persisted to LittleFS');
      setScreen({ kind: 'connected' });
    } catch (err) {
      push('device', `FAIL — ${err instanceof Error ? err.message : String(err)}`);
      setScreen({ kind: 'connected' });
    }
  }
  async function doGetStatus(): Promise<void> {
    push('browser', 'GET /api/status');
    try {
      const status = await api.getStatus();
      const uptimeSec = Math.round(status.uptimeMs / 1000);
      const heapKiB = Math.round(status.freeHeap / 1024);
      push('device', `200 OK — ${status.chip} fw${status.firmware}, uptime ${uptimeSec}s, free heap ${heapKiB} KiB`);
    } catch (err) {
      push('device', `FAIL — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  async function doActivate(): Promise<void> {
    const id = activateId;
    const name = project.patches.find((p) => p.id === id)?.name ?? '';
    push('browser', `POST /api/patch/${id}`);
    setScreen({ kind: 'applying', patch: id });
    try {
      await api.activatePatch(id);
      push('device', `200 OK — relays driven for "${name}" (patch ${id})`);
      setScreen({ kind: 'connected' });
    } catch (err) {
      push('device', `FAIL — ${err instanceof Error ? err.message : String(err)}`);
      setScreen({ kind: 'connected' });
    }
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
          <button disabled={!connected} onClick={doLoadFromDevice} title="Load config from device into editor (smart merge: preserves images)">⬇ Load from device</button>
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

        {/* Hardware variant selector */}
        <label className="es-edsim-variant-label">
          Display:
          <select
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
          >
            {DISPLAY_VARIANTS.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        </label>
        {variant.notes && (
          <div className="es-edsim-variant-notes">{variant.notes}</div>
        )}

        <div className="es-edsim-esp">
          <DeviceScreen variant={variant} line1="MusicBrain" line2={screenLine} />
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

// ─── Variant-aware device screen ─────────────────────────────────────────────

/** Renders a scaled-down representation of the selected display module.
 *  Different variants get different aspect-ratios and colours so the
 *  simulation gives a realistic feel of the actual hardware. */
function DeviceScreen({ variant, line1, line2 }: {
  variant: DisplayVariant;
  line1: string;
  line2: string;
}): JSX.Element {
  if (variant.id === 'none') {
    return <div className="es-edsim-esp-screen es-edsim-esp-screen--none">(no display)</div>;
  }

  const isColor = variant.id.startsWith('st7735');
  const bgColor    = isColor ? '#1a1a2e' : '#0ea5e9';
  const textColor  = isColor ? '#e0e0ff' : '#f0f9ff';
  const borderColor = isColor ? '#4a4a8a' : '#0c4a6e';

  // Scale the mock screen proportionally (max 160×80 px in the UI).
  const scale = Math.min(160 / variant.width, 80 / variant.height);
  const w = Math.round(variant.width  * scale);
  const h = Math.round(variant.height * scale);

  return (
    <div
      className="es-edsim-esp-screen"
      style={{
        width: w, minWidth: w, height: h,
        background: bgColor,
        boxShadow: `inset 0 0 0 2px ${borderColor}`,
        color: textColor,
        flexDirection: 'column',
        padding: '4px 6px',
      }}
    >
      <div className="es-edsim-esp-screen-line1">{line1}</div>
      <div className="es-edsim-esp-screen-line2">{line2}</div>
    </div>
  );
}
