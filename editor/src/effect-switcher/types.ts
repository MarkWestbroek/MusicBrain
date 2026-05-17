// Data model for the Effect Switcher editor (project 1).
//
// Persisted to localStorage under key 'mb.effect-switcher.v1'.
// All IDs are stable strings so React keys + React-Flow edges remain valid
// across reorderings.

export interface EffectCategory {
  id: string;       // e.g. 'overdrive'
  label: string;    // e.g. 'Overdrive'
}

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

export interface ChainEdge {
  id: string;       // 'e_<source>_<target>'
  source: string;   // EffectDevice.id OR 'input' / 'output'
  target: string;
}

export interface SwitcherPatch {
  id: number;       // MIDI program number (0..127)
  name: string;
  // Devices that are BYPASSED (relay off) in this patch.
  // We store bypass rather than active so that adding a new device
  // automatically becomes active in existing patches.
  bypassed: string[]; // EffectDevice.id[]
}

export interface SwitcherProject {
  version: 1;
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

/** Stable ID generator. */
let _idCounter = 0;
export function newId(prefix: string): string {
  _idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${_idCounter}`;
}
