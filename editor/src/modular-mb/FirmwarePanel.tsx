// Firmware-paneel in het Teensy-venster (ED-FW-DIST-2): nieuwste firmware
// downloaden, met de drie stappen om te flashen, en een waarschuwing als de
// verbonden Teensy een oudere versie draait.

import { useEffect, useState } from 'react';
import { useTeensyLink } from './teensyLink';
import { compareVersions, fetchFirmwareReleases, type FirmwareRelease } from './firmwareRelease';

export function FirmwarePanel(): JSX.Element {
  const link = useTeensyLink();
  const [list, setList] = useState<FirmwareRelease[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { fetchFirmwareReleases().then(setList).catch((e) => setErr(e instanceof Error ? e.message : String(e))); }, []);

  const latest = list?.[0];
  const running = link.status.kind === 'connected' ? link.status.version : undefined;
  const cmp = latest && running ? compareVersions(running, latest.version) : null;
  const outdated = cmp !== null && cmp < 0;
  const box: React.CSSProperties = {
    border: `1px solid ${outdated ? '#fcd34d' : '#e5e7eb'}`, borderRadius: 8, padding: '8px 10px',
    background: outdated ? '#fffbeb' : '#f8fafc', fontSize: 13,
  };

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong>Firmware</strong>
        {running && <span>op de Teensy: <code>{running}</code></span>}
        {latest && <span>nieuwste: <code>{latest.version}</code> ({new Date(latest.published).toLocaleDateString('nl-NL')})</span>}
        {outdated && <span style={{ color: '#92400e', fontWeight: 600 }}>⚠ je Teensy draait een oudere versie</span>}
        {cmp !== null && cmp >= 0 && <span style={{ color: '#065f46' }}>✓ actueel</span>}
        <span style={{ flex: 1 }} />
        {latest && (
          <a href={latest.hexUrl} download style={{ fontWeight: 600 }} onClick={() => setOpen(true)}
             title={`${(latest.hexSize / 1e6).toFixed(1)} MB — rechtstreeks van GitHub`}>
            ⤓ mmb-fw-{latest.version}.hex
          </a>
        )}
        <button onClick={() => setOpen((v) => !v)} style={{ fontSize: 12 }}>{open ? 'minder' : 'hoe flash ik?'}</button>
      </div>
      {err && <div style={{ color: '#b91c1c', marginTop: 4 }}>Kon de firmwarelijst niet ophalen: {err}</div>}
      {list && !latest && <div style={{ color: '#64748b', marginTop: 4 }}>Nog geen firmware-release gepubliceerd.</div>}
      {open && (
        <ol style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.5 }}>
          <li>Installeer <a href="https://www.pjrc.com/teensy/loader.html" target="_blank" rel="noreferrer">Teensy Loader</a> van PJRC (gratis, Windows/Mac/Linux).</li>
          <li>Download het .hex-bestand hierboven. Sluit in de editor eerst de Teensy-link (Disconnect).</li>
          <li>Open het bestand in Teensy Loader (File → Open HEX File) en druk op het knopje op de Teensy. Hij flasht en herstart vanzelf.</li>
          <li>Verbind daarna opnieuw; hierboven staat dan de nieuwe versie.</li>
        </ol>
      )}
      {open && (
        <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
          Nodig: Teensy 4.1 met PSRAM (de sampler en de echo's gebruiken die) en voor de sampler een SD-kaart.
          {latest && <> Wat er in deze versie zit: <a href={latest.pageUrl} target="_blank" rel="noreferrer">release-notes</a>.</>}
          {list && list.length > 1 && <> Oudere versies staan ook op GitHub.</>}
        </div>
      )}
    </div>
  );
}
