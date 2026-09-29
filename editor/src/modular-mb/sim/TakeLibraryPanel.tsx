// Takes uit de media library: lijst per opname (nieuwste eerst), de wav
// beluisteren, de .mid in de MIDI-speler, de patch als nieuwe patch.

import { useEffect, useState } from 'react';
import type { LibrarySettings } from './mediaLibrary';
import { listTakes, fetchAsset, type TakeEntry } from './takeLibrary';
import { openTakeEditor, takeFromBytes } from './TakeEditorWindow';

export function TakeLibraryPanel({ settings, onMidi, onPatch }: {
  settings: LibrarySettings;
  onMidi: (bytes: Uint8Array, name: string, slug: string) => void;
  onPatch: (bytes: Uint8Array, name: string) => void;
}): JSX.Element {
  const [folder, setFolder] = useState(settings.folder);
  const [tag, setTag] = useState('');
  const [takes, setTakes] = useState<TakeEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function refresh(): Promise<void> {
    setBusy('lijst'); setMsg(null);
    try { setTakes(await listTakes(settings, { folder, tag })); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(null); }
  }
  useEffect(() => { if (settings.token.trim()) void refresh(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  async function edit(t: TakeEntry): Promise<void> {
    if (!t.wav) return;
    setBusy(`${t.group}:edit`); setMsg(null);
    try {
      const [wav, mid, patch] = await Promise.all([
        fetchAsset(t.wav),
        t.mid ? fetchAsset(t.mid) : Promise.resolve(null),
        t.patch ? fetchAsset(t.patch) : Promise.resolve(null),
      ]);
      openTakeEditor(takeFromBytes(t.group, wav, mid, patch ? new Blob([patch], { type: 'application/json' }) : null,
        { group: t.group, wav: t.wav.slug, mid: t.mid?.slug }));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(null); }
  }

  async function load(t: TakeEntry, what: 'mid' | 'patch'): Promise<void> {
    const asset = what === 'mid' ? t.mid : t.patch;
    if (!asset) return;
    setBusy(`${t.group}:${what}`); setMsg(null);
    try {
      const bytes = await fetchAsset(asset);
      if (what === 'mid') onMidi(bytes, `${t.group}.mid`, asset.slug); else onPatch(bytes, t.group);
      setMsg({ ok: true, text: what === 'mid' ? `${t.group}.mid staat in de MIDI-speler (bron: MIDI-bestand).` : `Patch van ${t.group} toegevoegd en actief.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(null); }
  }

  const fmt = (d: Date | null): string => d
    ? d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const cell: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle' };

  return (
    <div style={{ marginTop: 8, fontSize: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>Map <input value={folder} onChange={(e) => setFolder(e.target.value)} style={{ width: 140 }} /></label>
        <label>Tag <input value={tag} onChange={(e) => setTag(e.target.value)} style={{ width: 100 }} placeholder="(alle)" /></label>
        <button onClick={() => void refresh()} disabled={busy !== null}>{busy === 'lijst' ? '… laden' : '↻ Vernieuwen'}</button>
        {takes && <span style={{ color: '#6b7280' }}>{takes.length} take{takes.length === 1 ? '' : 's'}</span>}
      </div>
      {msg && <div style={{ marginTop: 6, color: msg.ok ? '#15803d' : '#b91c1c' }}>{msg.ok ? '✔' : '⚠'} {msg.text}</div>}
      {takes && takes.length > 0 && (
        <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 6 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              {takes.map((t) => (
                <tr key={t.group}>
                  <td style={{ ...cell, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.group}>
                    {t.group.replace(/^mmb-/, '').replace(/-\d{8}-\d{6}$/, '')}
                    <div style={{ color: '#6b7280' }}>{fmt(t.when)}</div>
                  </td>
                  <td style={cell}>
                    {t.wav ? <audio controls preload="none" src={t.wav.url} style={{ height: 28, width: 220 }} /> : <span style={{ color: '#9ca3af' }}>geen wav</span>}
                  </td>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                    <button disabled={!t.mid || busy !== null} onClick={() => void load(t, 'mid')}
                      title="De MIDI van deze take in de MIDI-speler zetten (bron wordt MIDI-bestand)">
                      {busy === `${t.group}:mid` ? '…' : '▶ MIDI'}
                    </button>{' '}
                    <button disabled={!t.patch || busy !== null} onClick={() => void load(t, 'patch')}
                      title="De patch van deze take als nieuwe patch toevoegen (je eigen patches blijven staan)">
                      {busy === `${t.group}:patch` ? '…' : '⤵ Patch'}
                    </button>{' '}
                    {t.syx && <a href={t.syx.url} download title="De patch als SysEx (.syx) downloaden, voor een SysEx-librarian of DAW">⤓ .syx</a>}{' '}
                    <button disabled={!t.wav || busy !== null} onClick={() => void edit(t)}
                      title="In de take-editor openen: bijsnijden, exporteren (wav + mid, Reaper), terug naar de library">
                      {busy === `${t.group}:edit` ? '…' : '✎'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {takes && takes.length === 0 && <div style={{ marginTop: 6, color: '#6b7280' }}>Geen takes in deze map{tag ? ` met tag ${tag}` : ''}.</div>}
    </div>
  );
}
