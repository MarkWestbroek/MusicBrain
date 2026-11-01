// Een bestand aan de gebruiker geven. In de browser een download; in een
// plugin (plugin-ui) kan de webview niet downloaden, dan zet de plugin
// `saveFile.host` op zijn eigen bewaarvenster (mmbSaveFile).

export interface SaveFileHost {
  (name: string, data: Uint8Array): Promise<boolean>;
}

export const saveFileHost: { current: SaveFileHost | null } = { current: null };

/** Bewaar `data` als `name`. Antwoord: false als het niet gelukt of afgebroken is. */
export async function saveFile(name: string, data: Uint8Array, type = 'application/octet-stream'): Promise<boolean> {
  if (saveFileHost.current) return saveFileHost.current(name, data);
  const url = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
