// deviceApi.ts
//
// Real HTTP client for MusicBrain device REST API.
// Communicates with the Pico W / ESP32 firmware over WiFi.

export interface DeviceStatus {
  firmware: string;
  uptimeMs: number;
  freeHeap: number;
  chip: string;
  wifi: {
    ssid: string;
    ip: string;
    rssi: number;
  };
}

/** Wire format of GET/PUT `/api/config` — the SwitcherProject subset the
 *  editor pushes to the device (images, edges and categories are stripped;
 *  they live only in the editor). The firmware persists the JSON verbatim,
 *  so GET returns exactly what was last PUT.
 *  Mirrors `firmware/app-effect-switcher/{pico,esp32}/src/main.cpp` and
 *  `editor/src/effect-switcher/types.ts` (EffectDevice / SwitcherPatch). */
export interface DeviceConfig {
  version: 1;               // schema version, required by firmware validation
  name: string;
  configVersion: string;
  relayCount?: number;      // firmware defaults to 16 when absent
  activePatchId?: number;
  devices: Array<{
    id: string;             // stable EffectDevice.id
    brand: string;
    model: string;
    relayIndex: number;     // 0-based; -1 = unassigned
  }>;
  patches: Array<{
    id: number;             // doubles as MIDI program number (0..127)
    name: string;
    bypassed: string[];     // EffectDevice.id[] with relay OFF in this patch
  }>;
}

export class DeviceApi {
  constructor(private baseUrl: string) {
    // Ensure no trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /** Test connection and get device status */
  async getStatus(): Promise<DeviceStatus> {
    const res = await fetch(`${this.baseUrl}/api/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  }

  /** Fetch full configuration from device */
  async getConfig(): Promise<DeviceConfig> {
    const res = await fetch(`${this.baseUrl}/api/config`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  }

  /** Push configuration to device */
  async putConfig(config: DeviceConfig): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  /** Activate a specific patch by ID */
  async activatePatch(patchId: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/patch/${patchId}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  /** Get current patch */
  async getCurrentPatch(): Promise<{ id: number; name: string }> {
    const res = await fetch(`${this.baseUrl}/api/patch`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  }

  /** Switch to next patch */
  async nextPatch(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/patch/next`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  /** Switch to previous patch */
  async prevPatch(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/patch/prev`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
}
