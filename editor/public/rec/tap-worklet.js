// mmb-tap — aftakking die blokken PCM naar de hoofdthread doorschuift.
//
// Waarom een worklet en geen ScriptProcessorNode: die laatste draait op de
// hoofdthread, en dan lekt elke hapering in React of in het tekenen van de
// golfvorm als een gat in de opname. Hier kopiëren we alleen, bufferen tot een
// blok vol is en posten dat als transferable — de audiothread doet verder
// niets.
//
// De processor houdt zijn uitgang stil. Hij heeft er wel één, want een node
// zonder uitgaande verbinding wordt niet in alle browsers aangeslingerd; de
// aanroeper hangt er een gain op 0 achter.

const CHUNK = 4096; // frames per bericht (~85 ms bij 48 kHz)

class TapProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.channels = options?.processorOptions?.channels ?? 2;
    this.buf = [];
    for (let c = 0; c < this.channels; c++) this.buf.push(new Float32Array(CHUNK));
    this.fill = 0;
    this.running = true;
    this.port.onmessage = (e) => {
      if (e.data !== 'stop') return;
      // Laatste, halfvolle blok nog meesturen — anders mis je tot 85 ms
      // staart, en laat je net de uitklank van de laatste aanslag liggen.
      this.flush();
      this.running = false;
      this.port.postMessage({ done: true });
    };
  }

  flush() {
    if (this.fill === 0) return;
    const chunks = [];
    for (let c = 0; c < this.channels; c++) chunks.push(this.buf[c].slice(0, this.fill));
    this.port.postMessage({ chunks }, chunks.map((a) => a.buffer));
    this.fill = 0;
  }

  process(inputs) {
    if (!this.running) return false;
    const input = inputs[0] ?? [];
    // Tijdens een patch-herbouw hangt er even niets aan de bus. Dan schrijven
    // we nullen door, zodat de tijdlijn blijft kloppen en de opname niet
    // stiekem korter wordt dan wat je gespeeld hebt.
    const n = input[0] ? input[0].length : 128;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < this.channels; c++) {
        const src = input[c] ?? input[0];
        this.buf[c][this.fill] = src ? src[i] : 0;
      }
      if (++this.fill === CHUNK) this.flush();
    }
    return true;
  }
}

registerProcessor('mmb-tap', TapProcessor);
