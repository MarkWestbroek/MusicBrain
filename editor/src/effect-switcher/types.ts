// Data model for the Effect Switcher editor (project 1).
//
// Persisted to localStorage under key 'mb.effect-switcher.v1'.
// All IDs are stable strings so React keys + React-Flow edges remain valid
// across reorderings.

/** A user-defined grouping for effect devices (e.g. "Overdrive", "Delay"). */
export interface EffectCategory {
  id: string;       // e.g. 'overdrive'
  label: string;    // e.g. 'Overdrive'
}

/** A single physical effect pedal / rack unit in the signal chain. */
export interface EffectDevice {
  id: string;             // stable, e.g. 'd_1716800000_3'
  brand: string;          // e.g. 'Boss'
  model: string;          // e.g. 'OD-1'
  categoryId: string;     // FK -> EffectCategory.id
  imageDataUrl?: string;  // optional inline base64 (deluxe view)
  relayIndex: number;     // 0..relayCount-1; -1 = unassigned
  // Position in the React-Flow chain canvas
  x: number;
  y: number;
}

/** A directed connection in the React-Flow chain canvas.
 *  Source and target are either an `EffectDevice.id` or the special
 *  sentinel values `'input'` / `'output'`. */
export interface ChainEdge {
  id: string;       // 'e_<source>_<target>'
  source: string;   // EffectDevice.id OR 'input' / 'output'
  target: string;
}

/** One saved preset — a snapshot of which devices are bypassed.
 *  The `id` doubles as the MIDI Program Change number (0..127). */
export interface SwitcherPatch {
  id: number;       // MIDI program number (0..127)
  name: string;
  // Devices that are BYPASSED (relay off) in this patch.
  // We store bypass rather than active so that adding a new device
  // automatically becomes active in existing patches.
  bypassed: string[]; // EffectDevice.id[]
}

/** Root document: everything the editor saves to localStorage and exports
 *  to JSON. `version` is the *schema* version (currently always 1) — do not
 *  confuse it with `configVersion`, which is a user-managed release label
 *  (e.g. `"2.3.1"`) that travels with the config to the device. */
export interface SwitcherProject {
  version: 1;                // schema version (do NOT confuse with configVersion)
  name?: string;             // free-form project label
  description?: string;      // multi-line memory aid for the musician
  configVersion?: string;    // user-managed semver-ish, e.g. '1.2.3'
  relayCount: number;       // 16 standard, max 32
  categories: EffectCategory[];
  devices: EffectDevice[];
  edges: ChainEdge[];       // signal flow; includes input/output endpoints
  patches: SwitcherPatch[];
  activePatchId: number;    // currently-selected patch (for editor + sim)
}

export const DEFAULT_CATEGORIES: EffectCategory[] = [
  { id: 'overdrive',   label: 'Overdrive'   },
  { id: 'distortion',  label: 'Distortion'  },
  { id: 'fuzz',        label: 'Fuzz'        },
  { id: 'compressor',  label: 'Compressor'  },
  { id: 'eq',          label: 'EQ / Filter' },
  { id: 'phaser',      label: 'Phaser'      },
  { id: 'flanger',     label: 'Flanger'     },
  { id: 'chorus',      label: 'Chorus'      },
  { id: 'tremolo',     label: 'Tremolo'     },
  { id: 'delay',       label: 'Delay'       },
  { id: 'reverb',      label: 'Reverb'      },
  { id: 'looper',      label: 'Looper'      },
  { id: 'utility',     label: 'Utility'     },
];

/** Return a minimal valid project with one empty patch and the default
 *  category set. Used for Reset and first-run. */
export function emptyProject(): SwitcherProject {
  return {
    version: 1,
    relayCount: 16,
    categories: DEFAULT_CATEGORIES,
    devices: [],
    edges: [],
    patches: [{ id: 0, name: 'Init', bypassed: [] }],
    activePatchId: 0,
  };
}

/** Stable ID generator. Combines a prefix, a base-36 timestamp, and a
 *  per-session counter so IDs are unique even within the same millisecond. */
let _idCounter = 0;
export function newId(prefix: string): string {
  _idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${_idCounter}`;
}
