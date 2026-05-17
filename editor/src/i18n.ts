// Minimal i18n scaffold for MusicBrain editor.
//
// Usage:
//   import { t, setLang } from '../i18n';
//   <button>{t('chain.addEffect')}</button>
//
// Adding a new string:
//   1. Add the key to BOTH `en` and `nl` below.
//   2. Use `t('your.key')` in components.
//
// The active language persists to localStorage under 'mb.lang'.

export type Lang = 'en' | 'nl';

const STORAGE_KEY = 'mb.lang';

const dictionaries: Record<Lang, Record<string, string>> = {
  en: {
    // Top-level / shell
    'app.title':            'MusicBrain editor',
    'app.exportJson':       '⬇ Export JSON',
    'app.importJson':       '⬆ Import JSON',
    'app.demo':             'Demo',
    'app.reset':            'Reset',
    'app.resetConfirm':     'Reset project?',
    'app.untitled':         'Untitled project',
    'app.projectName':      'Project name…',
    'app.description':      'Description…',
    'app.configVersion':    'v',
    'app.stats':            '{n} effects · {p} patches · {r} relays',

    // Tabs
    'tab.patches':          'Patches',
    'tab.chain':            'Effect chain',
    'tab.categories':       'Categories',
    'tab.simulation':       'Simulation',

    // Chain panel
    'chain.addEffect':      '+ Effect',
    'chain.autoAssign':     'Auto-assign relays',
    'chain.relays':         'Relays:',
    'chain.hint':           'Drag between handles to connect. Select edge + Delete to remove. Drag edge endpoint to reroute. Shift+click multiple nodes, then right-click to align.',
    'chain.properties':     'Properties',
    'chain.clickHint':      'Click a device to edit its properties.',
    'chain.brand':          'Brand',
    'chain.model':          'Model',
    'chain.category':       'Category',
    'chain.image':          'Image:',
    'chain.upload':         'Upload',
    'chain.replace':        'Replace',
    'chain.autoSearch':     '🔍 Auto-search',
    'chain.searching':      'Searching…',
    'chain.pasteUrl':       'Paste image URL…',
    'chain.delete':         'Delete device',

    // Align menu
    'align.title':          'Align ({n} nodes)',
    'align.top':            'Align top',
    'align.middle':         'Align middle',
    'align.bottom':         'Align bottom',
    'align.left':           'Align left',
    'align.center':         'Align center',
    'align.right':          'Align right',
    'align.distH':          'Distribute horizontally',
    'align.distV':          'Distribute vertically',
  },
  nl: {
    'app.title':            'MusicBrain editor',
    'app.exportJson':       '⬇ Exporteer JSON',
    'app.importJson':       '⬆ Importeer JSON',
    'app.demo':             'Demo',
    'app.reset':            'Reset',
    'app.resetConfirm':     'Project wissen?',
    'app.untitled':         'Naamloos project',
    'app.projectName':      'Projectnaam…',
    'app.description':      'Omschrijving…',
    'app.configVersion':    'v',
    'app.stats':            '{n} effecten · {p} patches · {r} relais',

    'tab.patches':          'Patches',
    'tab.chain':            'Effect-keten',
    'tab.categories':       'Categorieën',
    'tab.simulation':       'Simulatie',

    'chain.addEffect':      '+ Effect',
    'chain.autoAssign':     'Auto-assign relais',
    'chain.relays':         'Relais:',
    'chain.hint':           'Sleep tussen handles om te verbinden. Selecteer een verbinding + Delete om te verwijderen. Sleep het uiteinde om opnieuw te leggen. Shift+klik meerdere nodes en rechtsklik voor alignen.',
    'chain.properties':     'Eigenschappen',
    'chain.clickHint':      'Klik op een apparaat om eigenschappen te bewerken.',
    'chain.brand':          'Merk',
    'chain.model':          'Model',
    'chain.category':       'Categorie',
    'chain.image':          'Afbeelding:',
    'chain.upload':         'Upload',
    'chain.replace':        'Vervangen',
    'chain.autoSearch':     '🔍 Auto zoeken',
    'chain.searching':      'Zoeken…',
    'chain.pasteUrl':       'Plak afbeelding-URL…',
    'chain.delete':         'Verwijder apparaat',

    'align.title':          'Uitlijnen ({n} nodes)',
    'align.top':            'Boven uitlijnen',
    'align.middle':         'Midden uitlijnen',
    'align.bottom':         'Onder uitlijnen',
    'align.left':           'Links uitlijnen',
    'align.center':         'Centreren',
    'align.right':          'Rechts uitlijnen',
    'align.distH':          'Horizontaal verdelen',
    'align.distV':          'Verticaal verdelen',
  },
};

let activeLang: Lang = (localStorage.getItem(STORAGE_KEY) as Lang) ?? 'en';
const listeners = new Set<() => void>();

export function getLang(): Lang { return activeLang; }

export function setLang(lang: Lang): void {
  activeLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  for (const l of listeners) l();
}

export function subscribeLang(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Translate a key. Optional `vars` substitute `{name}` placeholders.
 * Falls back to English, then to the raw key if missing entirely.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = dictionaries[activeLang];
  let s = dict[key] ?? dictionaries.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}
