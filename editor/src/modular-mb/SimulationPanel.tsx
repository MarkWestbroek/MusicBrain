// Simulation tab — placeholder for v0.1.
// In v0.2 this will hook into the same scope-bridge that the Poly-synth
// scope already uses, but plotting a selected port / envelope / LFO from
// the active patch instead of a fixed firmware trace.

export function SimulationPanel(): JSX.Element {
  return (
    <div style={{ color: '#6b7280', fontSize: 13 }}>
      <p style={{ marginTop: 0 }}>
        Simulatie komt in v0.2. Het idee: kies een poort of envelope/LFO uit
        de actieve patch en plot het signaal in een scope-view, identiek aan
        de Poly-synth (scope) tab.
      </p>
      <ul>
        <li>Envelope-preview (offline rendering van AHDSR/multiphase)</li>
        <li>LFO-preview (één cyclus uitgetekend)</li>
        <li>Live trace via <code>scope-bridge</code> als de brain draait</li>
      </ul>
    </div>
  );
}
