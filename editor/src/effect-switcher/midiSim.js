// midiSim.ts
//
// End-to-end MIDI 1.0 emulation for the simulation panel.
//
// This module deliberately mirrors the firmware implementation in
// `firmware/lib/midi_common/MidiPort.h/.cpp` byte-for-byte:
//   - serializeProgramChange / serializeControlChange produce the same bytes
//     that the C++ sendProgramChange / sendCC would emit on the wire;
//   - MidiParser implements the same running-status / SysEx-skip / System
//     Real-Time-passthrough state machine as MidiPort::processByte.
//
// That way the simulation exercises the actual MIDI byte stream — a real
// MIDI cable's worth of data is encoded and decoded, instead of just calling
// a JavaScript function on the other side.
// ─── Message types (mirror of mb::MidiType) ──────────────────────────────────
/** MIDI 1.0 channel-voice message types (high nibble of the status byte). */
export var MidiType;
(function (MidiType) {
    MidiType[MidiType["NoteOff"] = 8] = "NoteOff";
    MidiType[MidiType["NoteOn"] = 9] = "NoteOn";
    MidiType[MidiType["ControlChange"] = 11] = "ControlChange";
    MidiType[MidiType["ProgramChange"] = 12] = "ProgramChange";
})(MidiType || (MidiType = {}));
// ─── Serializers (mirror of MidiPort::sendXxx) ──────────────────────────────
/** Two bytes: 0xC0|(ch-1) , program. */
export function serializeProgramChange(channel, program) {
    const status = 0xC0 | ((channel - 1) & 0x0F);
    return new Uint8Array([status, program & 0x7F]);
}
/** Three bytes: 0xB0|(ch-1) , cc , value. */
export function serializeControlChange(channel, cc, value) {
    const status = 0xB0 | ((channel - 1) & 0x0F);
    return new Uint8Array([status, cc & 0x7F, value & 0x7F]);
}
/** Three bytes: 0x90|(ch-1) , note , velocity. */
export function serializeNoteOn(channel, note, velocity) {
    const status = 0x90 | ((channel - 1) & 0x0F);
    return new Uint8Array([status, note & 0x7F, velocity & 0x7F]);
}
/** Three bytes: 0x80|(ch-1) , note , velocity. */
export function serializeNoteOff(channel, note, velocity = 0) {
    const status = 0x80 | ((channel - 1) & 0x0F);
    return new Uint8Array([status, note & 0x7F, velocity & 0x7F]);
}
// ─── Parser (mirror of MidiPort::processByte / dispatch) ─────────────────────
/** Number of data bytes following a given status byte. */
function dataLen(status) {
    switch (status >> 4) {
        case 0x8:
        case 0x9:
        case 0xA:
        case 0xB:
        case 0xE: return 2;
        case 0xC:
        case 0xD: return 1;
        default: return 0;
    }
}
/**
 * Streaming MIDI parser. Feed it bytes one at a time via `processByte`; the
 * callback fires once per completed channel-voice message. Implements
 * running status, SysEx skip and System Real-Time passthrough exactly like
 * the firmware.
 */
export class MidiParser {
    onMessage;
    status = 0;
    d = [0, 0];
    dLen = 0;
    sysex = false;
    constructor(onMessage) {
        this.onMessage = onMessage;
    }
    /** Convenience: feed a whole buffer. */
    feed(bytes) {
        for (const b of bytes)
            this.processByte(b);
    }
    processByte(b) {
        // System Real-Time (0xF8..0xFF): single-byte, no state change.
        if (b >= 0xF8)
            return;
        if (b === 0xF0) {
            this.sysex = true;
            return;
        }
        if (this.sysex) {
            if (b === 0xF7)
                this.sysex = false;
            return;
        }
        if (b & 0x80) {
            this.status = b;
            this.dLen = 0;
            if (b >= 0xF0)
                this.status = 0; // System Common: not parsed
            return;
        }
        if (this.status === 0)
            return;
        this.d[this.dLen++] = b;
        if (this.dLen >= dataLen(this.status)) {
            this.dispatch();
            this.dLen = 0; // keep running status
        }
    }
    dispatch() {
        const nibble = this.status >> 4;
        let type;
        switch (nibble) {
            case 0x8:
                type = MidiType.NoteOff;
                break;
            case 0x9:
                type = MidiType.NoteOn;
                break;
            case 0xB:
                type = MidiType.ControlChange;
                break;
            case 0xC:
                type = MidiType.ProgramChange;
                break;
            default: return;
        }
        this.onMessage({
            type,
            channel: (this.status & 0x0F) + 1,
            data1: this.d[0],
            data2: this.dLen > 1 ? this.d[1] : 0,
        });
    }
}
// ─── Display helpers ─────────────────────────────────────────────────────────
/** Format a byte as a two-character uppercase hex string (no `0x` prefix). */
export function hex2(b) {
    return b.toString(16).toUpperCase().padStart(2, '0');
}
/** Short human label for a parsed message, e.g. `PC1 #5` or `CC1 70=127`. */
export function describeMessage(m) {
    switch (m.type) {
        case MidiType.ProgramChange: return `PC${m.channel} #${m.data1}`;
        case MidiType.ControlChange: return `CC${m.channel} ${m.data1}=${m.data2}`;
        case MidiType.NoteOn: return `NoteOn${m.channel} ${m.data1} v${m.data2}`;
        case MidiType.NoteOff: return `NoteOff${m.channel} ${m.data1}`;
        default: return '??';
    }
}
