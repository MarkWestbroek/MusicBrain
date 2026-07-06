// Compacte telemetrie-strip voor de Teensy-link. Rendert alleen wanneer er
// een verbinding is én er al een status-bericht binnenkwam (teensyLink pollt
// elke 2 s zolang de poort open is). Herbruikbaar: Teensy-modal + patcher.

import { useTeensyLink } from './teensyLink';

export function TeensyStatusBar(props: { compact?: boolean }): JSX.Element | null {
  const link = useTeensyLink();
  const st = link.lastStatus;
  if (link.status.kind !== 'connected' || !st) return null;

  const cpuColor = (st.cpu ?? 0) > 80 ? '#f87171' : (st.cpu ?? 0) > 60 ? '#fbbf24' : '#34d399';
  const memColor = (st.memMax ?? 0) > (st.memPool ?? 1) * 0.85 ? '#f87171' : '#34d399';

  return (
    <div style={{
      fontFamily: 'ui-monospace, monospace', fontSize: props.compact ? 11 : 12,
      display: 'flex', gap: props.compact ? 10 : 14, flexWrap: 'wrap', alignItems: 'center',
      background: '#0f172a', color: '#e2e8f0',
      borderRadius: 6, padding: props.compact ? '3px 8px' : '6px 10px',
    }}>
      <span title="Firmware-versie (uit de hello)">
        ⚡ {link.status.version ?? link.status.fw ?? 'teensy'}
      </span>
      <span title="Audio-ISR-belasting (nu / piek sinds boot)">
        CPU <b style={{ color: cpuColor }}>{st.cpu?.toFixed(1)}%</b> / piek {st.cpuMax?.toFixed(1)}%
      </span>
      <span title="Audio-blocks in gebruik (nu / piek / pool)">
        blocks <b style={{ color: memColor }}>{st.mem}</b> / piek {st.memMax} / {st.memPool}
      </span>
      <span title="Main-loop iteraties per seconde — daalt als de CV-tick verzadigt">
        loop {st.loopHz?.toLocaleString()}/s
      </span>
      {st.heapFree !== undefined && (
        <span title="Vrije heap (RAM2) — hieruit komen module-instanties, STK-delay-lines en MI-buffers. Onder ~50 KB wordt een volgende zware push riskant.">
          heap <b style={{ color: st.heapFree < 50 * 1024 ? '#f87171' : '#34d399' }}>{Math.round(st.heapFree / 1024)}K</b>
        </span>
      )}
      {st.stkOom && (
        <span style={{ color: '#f87171' }} title="Een STK-geheugenallocatie is gefaald — alle STK-instrumenten zwijgen tot een herstart. Kleinere patch pushen en power-cyclen.">
          STK-OOM!
        </span>
      )}
      <span title="Live module-instanties + gepensioneerde (power-cycle om te legen)">
        modules {st.modules}{(st.retired ?? 0) > 0 ? ` (+${st.retired} retired)` : ''}
      </span>
      {st.elementsReady !== undefined && (
        <span title="Elements-diagnose: buffers ✓/✗, ISR-aandeel, output-peak, en de keten gate→exciter→resonator (waar stopt het signaal?)">
          elements {st.elementsReady ? '✓' : '✗'} {st.elementsCpu?.toFixed(1)}%
          {st.elementsPeak !== undefined ? ` · peak ${st.elementsPeak.toFixed(3)}` : ''}
          {st.elementsGate !== undefined ? ` · gate ${st.elementsGate ? '▮' : '▯'}` : ''}
          {st.elementsExc !== undefined ? ` exc ${st.elementsExc.toFixed(2)}` : ''}
          {st.elementsRes !== undefined ? ` res ${st.elementsRes.toFixed(2)}` : ''}
        </span>
      )}
      {st.ringsReady !== undefined && (
        <span title="Rings-diagnose: buffers ✓/✗, ISR-aandeel, output-peak">
          rings {st.ringsReady ? '✓' : '✗'} {st.ringsCpu?.toFixed(1)}%
          {st.ringsPeak !== undefined ? ` · peak ${st.ringsPeak.toFixed(3)}` : ''}
        </span>
      )}
      {st.plaitsReady !== undefined && (
        <span title="Plaits-diagnose: buffers ✓/✗, ISR-aandeel, output-peak">
          plaits {st.plaitsReady ? '✓' : '✗'} {st.plaitsCpu?.toFixed(1)}%
          {st.plaitsPeak !== undefined ? ` · peak ${st.plaitsPeak.toFixed(3)}` : ''}
        </span>
      )}
      {st.cloudsReady !== undefined && (
        <span title="Clouds-diagnose: werkbuffers ✓/✗ (✗ = heap-OOM, module zwijgt), ISR-aandeel, output-peak">
          clouds {st.cloudsReady ? '✓' : '✗'} {st.cloudsCpu?.toFixed(1)}%
          {st.cloudsPeak !== undefined ? ` · peak ${st.cloudsPeak.toFixed(3)}` : ''}
        </span>
      )}
      {st.tidesOut1 !== undefined && (
        <span title="Tides: momentane waarde van uitgang 1 — moet bewegen als de generator loopt">
          tides₁ {st.tidesOut1.toFixed(2)}
        </span>
      )}
    </div>
  );
}
