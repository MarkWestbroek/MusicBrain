// MIDI sources for the simulator.
//
// Drie bronnen implementeren dezelfde `MidiSource`-interface zodat de UI
// ze inwisselbaar kan inhangen:
//
//   1. ScreenKeyboardSource — on-screen toetsenbord (zie SimPanel),
//      óók bestuurbaar via computer-toetsen (A S D F …).
//   2. TestSequenceSource   — speelt een C-majeur arpeggio in lus af
//      zodat je snel kunt horen of er geluid uit komt.
//   3. WebMidiSource        — echte USB/Bluetooth MIDI via de browser
//      (Web MIDI API; werkt in Chrome/Edge/Opera/recente Firefox/Safari).
class BaseSource {
    listeners = new Set();
    subscribe(fn) {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }
    emit(e) {
        this.listeners.forEach((fn) => fn(e));
    }
}
// ── 1. Screen keyboard ────────────────────────────────────────────────
/** Houdt enkel state bij — de UI in SimPanel rendert de toetsen.
 *  Computer-toetsen worden hier vertaald naar noten als `start()` actief is. */
export class ScreenKeyboardSource extends BaseSource {
    id = 'screen';
    label = 'On-screen toetsenbord';
    octave = 4;
    active = false;
    down = new Set();
    // A S D F G H J K   →  C D E F G A B C
    // W E . T Y U .      →  C# D# . F# G# A# .
    static KEYMAP = {
        a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
    };
    start() {
        if (this.active)
            return;
        this.active = true;
        window.addEventListener('keydown', this.kd);
        window.addEventListener('keyup', this.ku);
    }
    stop() {
        this.active = false;
        window.removeEventListener('keydown', this.kd);
        window.removeEventListener('keyup', this.ku);
        this.down.forEach((n) => this.emit({ kind: 'noteOff', note: n }));
        this.down.clear();
    }
    setOctave(o) { this.octave = Math.max(0, Math.min(8, o)); }
    getOctave() { return this.octave; }
    /** Called by the UI when a key is pressed/released. */
    pressNote(midi, velocity = 0.9) {
        if (this.down.has(midi))
            return;
        this.down.add(midi);
        this.emit({ kind: 'noteOn', note: midi, velocity });
    }
    releaseNote(midi) {
        if (!this.down.delete(midi))
            return;
        this.emit({ kind: 'noteOff', note: midi });
    }
    kd = (e) => {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey)
            return;
        const k = e.key.toLowerCase();
        if (k === 'z') {
            this.octave = Math.max(0, this.octave - 1);
            return;
        }
        if (k === 'x') {
            this.octave = Math.min(8, this.octave + 1);
            return;
        }
        const off = ScreenKeyboardSource.KEYMAP[k];
        if (off === undefined)
            return;
        e.preventDefault();
        this.pressNote(this.octave * 12 + 12 + off);
    };
    ku = (e) => {
        const k = e.key.toLowerCase();
        const off = ScreenKeyboardSource.KEYMAP[k];
        if (off === undefined)
            return;
        this.releaseNote(this.octave * 12 + 12 + off);
    };
}
// ── 2. Test sequence ──────────────────────────────────────────────────
export class TestSequenceSource extends BaseSource {
    id = 'sequence';
    label = 'Test-sequence (C-majeur arpeggio)';
    timer = null;
    idx = 0;
    notes = [60, 64, 67, 72, 67, 64];
    bpm = 120;
    lastNote = null;
    start() {
        if (this.timer !== null)
            return;
        const step = () => {
            if (this.lastNote !== null)
                this.emit({ kind: 'noteOff', note: this.lastNote });
            const n = this.notes[this.idx % this.notes.length];
            this.emit({ kind: 'noteOn', note: n, velocity: 0.9 });
            this.lastNote = n;
            this.idx++;
        };
        const intervalMs = 60_000 / this.bpm / 2; // 8th-notes
        this.timer = window.setInterval(step, intervalMs);
        step();
    }
    stop() {
        if (this.timer !== null) {
            window.clearInterval(this.timer);
            this.timer = null;
        }
        if (this.lastNote !== null) {
            this.emit({ kind: 'noteOff', note: this.lastNote });
            this.lastNote = null;
        }
        this.idx = 0;
    }
    setBpm(b) { this.bpm = Math.max(30, Math.min(300, b)); }
    getBpm() { return this.bpm; }
}
// ── 3. Web MIDI ───────────────────────────────────────────────────────
export class WebMidiSource extends BaseSource {
    id = 'webmidi';
    label = 'USB / Bluetooth MIDI (Web MIDI)';
    access = null;
    inputs = [];
    static isSupported() {
        return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
    }
    async start() {
        if (!WebMidiSource.isSupported()) {
            throw new Error('Web MIDI niet ondersteund in deze browser.');
        }
        this.access = await navigator.requestMIDIAccess({ sysex: false });
        this.bindInputs();
        this.access.onstatechange = () => this.bindInputs();
    }
    stop() {
        for (const inp of this.inputs)
            inp.onmidimessage = null;
        this.inputs = [];
        if (this.access)
            this.access.onstatechange = null;
        this.access = null;
    }
    describe() {
        if (!this.access)
            return 'niet verbonden';
        const names = [];
        this.access.inputs.forEach((i) => { names.push(i.name ?? 'unnamed'); });
        return names.length ? names.join(', ') : 'geen MIDI-apparaten gevonden';
    }
    bindInputs() {
        if (!this.access)
            return;
        for (const inp of this.inputs)
            inp.onmidimessage = null;
        const list = [];
        this.access.inputs.forEach((i) => list.push(i));
        this.inputs = list;
        for (const inp of this.inputs)
            inp.onmidimessage = this.onMessage;
    }
    onMessage = (ev) => {
        const data = ev.data;
        if (!data || data.length < 2)
            return;
        const status = data[0] & 0xf0;
        const d1 = data[1];
        const d2 = data[2] ?? 0;
        if (status === 0x90 && d2 > 0)
            this.emit({ kind: 'noteOn', note: d1, velocity: d2 / 127 });
        else if (status === 0x80 || (status === 0x90 && d2 === 0))
            this.emit({ kind: 'noteOff', note: d1 });
        else if (status === 0xb0)
            this.emit({ kind: 'cc', controller: d1, value: d2 });
    };
}
