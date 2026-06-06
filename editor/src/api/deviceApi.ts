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

export interface DeviceConfig {
  name: string;
  configVersion: string;
  devices: Array<{
    id: number;
    name: string;
    type: string;
  }>;
  patches: Array<{
    id: number;
    name: string;
    effects: Array<{
      deviceId: number;
      enabled: boolean;
    }>;
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
