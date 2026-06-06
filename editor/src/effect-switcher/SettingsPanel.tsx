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
import { DeviceApi } from '../api/deviceApi';

type Transport = 'auto' | 'wifi' | 'usb';

interface Settings {
  deviceUrl:  string;
  transport:  Transport;
  lastSync:   string | null;  // ISO timestamp or null
}

const STORAGE_KEY = 'mb.settings.v1';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) as Settings };
  } catch { /* ignore */ }
  return defaultSettings();
}

function defaultSettings(): Settings {
  return { deviceUrl: 'musicbrain.local', transport: 'auto', lastSync: null };
}

function saveSettings(s: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/** Gear-icon button + drop-down settings panel for device connectivity.
 *  Closes when the user clicks outside. */
export function SettingsButton(): JSX.Element {
  const [open, setOpen]         = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [testStatus, setTest]   = useState<string | null>(null);
  const [testing, setTesting]   = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function update(patch: Partial<Settings>): void {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  }

  /** Real connection test: GET /api/status from the device. */
  async function testConnection(): Promise<void> {
    setTesting(true);
    setTest(null);
    try {
      const api = new DeviceApi(`http://${settings.deviceUrl}`);
      const status = await api.getStatus();
      const uptimeSec = Math.round(status.uptimeMs / 1000);
      setTest(`OK — ${status.chip} fw${status.firmware}, WiFi ${status.wifi.ssid} (${status.wifi.ip}), ${uptimeSec}s up`);
      update({ lastSync: new Date().toISOString() });
    } catch (err) {
      setTest(`FAIL — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTesting(false);
    }
  }

  const lastSyncLabel = settings.lastSync
    ? new Date(settings.lastSync).toLocaleString()
    : t('settings.never');

  return (
    <div className="es-settings-wrap" ref={panelRef}>
      <button
        className={`es-settings-gear${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={t('settings.title')}
        aria-expanded={open}
      >
        ⚙
      </button>

      {open && (
        <div className="es-settings-panel">
          <div className="es-settings-title">{t('settings.title')}</div>

          <label className="es-settings-row">
            <span>{t('settings.deviceUrl')}</span>
            <input
              type="text"
              value={settings.deviceUrl}
              onChange={(e) => update({ deviceUrl: e.target.value })}
              placeholder="musicbrain.local"
              spellCheck={false}
            />
          </label>

          <label className="es-settings-row">
            <span>{t('settings.transport')}</span>
            <select
              value={settings.transport}
              onChange={(e) => update({ transport: e.target.value as Transport })}
            >
              <option value="auto">{t('settings.transport.auto')}</option>
              <option value="wifi">{t('settings.transport.wifi')}</option>
              <option value="usb">{t('settings.transport.usb')}</option>
            </select>
          </label>

          <div className="es-settings-row es-settings-test-row">
            <button
              className="primary"
              disabled={testing}
              onClick={testConnection}
            >
              {testing ? t('settings.testing') : t('settings.test')}
            </button>
            {testStatus && (
              <span className={`es-settings-test-result ${testStatus.startsWith('OK') ? 'ok' : 'fail'}`}>
                {testStatus}
              </span>
            )}
          </div>

          <div className="es-settings-footer">
            {t('settings.lastSync')}: <em>{lastSyncLabel}</em>
          </div>
        </div>
      )}
    </div>
  );
}
