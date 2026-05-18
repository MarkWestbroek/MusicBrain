/**
 * Rolling per-channel buffer of CV samples. Bounded so memory stays flat
 * even on infinite streams; oldest samples are dropped.
 */
export class TraceBuffer {
    maxPerChannel;
    series = new Map();
    constructor(maxPerChannel = 2000) {
        this.maxPerChannel = maxPerChannel;
    }
    /** Parse one newline-delimited JSON event from the simulator stream and
     *  append it to the per-channel ring buffer. Non-`cv` events are silently
     *  ignored; malformed JSON is discarded without throwing. */
    ingest(line) {
        let ev;
        try {
            ev = JSON.parse(line);
        }
        catch {
            return;
        }
        if (ev.kind !== 'cv')
            return;
        const ch = ev.ch;
        const arr = this.series.get(ch) ?? [];
        arr.push({ t_us: ev.t_us, volts: ev.volts });
        if (arr.length > this.maxPerChannel)
            arr.shift();
        this.series.set(ch, arr);
    }
    /** Sorted list of channel IDs that have received at least one sample. */
    channels() { return Array.from(this.series.keys()).sort(); }
    /** All buffered samples for `ch`, oldest first. Returns `[]` if unknown. */
    pointsFor(ch) { return this.series.get(ch) ?? []; }
    /** Discard all buffered data. */
    clear() { this.series.clear(); }
    /** Compute the min/max time and voltage across all channels so the scope
     *  canvas can set its axes without a separate pass. Provides sensible
     *  defaults when the buffer is empty. */
    bounds() {
        let tMin = +Infinity, tMax = -Infinity, vMin = +Infinity, vMax = -Infinity;
        for (const arr of this.series.values()) {
            for (const p of arr) {
                if (p.t_us < tMin)
                    tMin = p.t_us;
                if (p.t_us > tMax)
                    tMax = p.t_us;
                if (p.volts < vMin)
                    vMin = p.volts;
                if (p.volts > vMax)
                    vMax = p.volts;
            }
        }
        if (!isFinite(tMin)) {
            tMin = 0;
            tMax = 1;
        }
        if (!isFinite(vMin)) {
            vMin = -5;
            vMax = 5;
        }
        if (vMax - vMin < 0.1) {
            vMin -= 0.5;
            vMax += 0.5;
        }
        if (tMax - tMin < 1) {
            tMax = tMin + 1;
        }
        return { tMin, tMax, vMin, vMax };
    }
}
