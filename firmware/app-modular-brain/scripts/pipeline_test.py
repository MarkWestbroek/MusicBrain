"""Pipeline-validation: send a note to the Teensy, expect echo back +12.

Uses Windows winmm.dll via ctypes — no compiled MIDI library needed
(python-rtmidi / pygame have no Python 3.14 wheels yet).

Expected firmware behaviour (firmware/app-modular-brain/src/main.cpp):
  * note-on  → echoed back one octave up
  * note-off → echoed back one octave up
"""

from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import queue
import sys
import time

winmm = ctypes.WinDLL("winmm")

MAXPNAMELEN = 32


class MIDIOUTCAPS(ctypes.Structure):
    _fields_ = [
        ("wMid", wt.WORD), ("wPid", wt.WORD),
        ("vDriverVersion", wt.DWORD),
        ("szPname", ctypes.c_wchar * MAXPNAMELEN),
        ("wTechnology", wt.WORD), ("wVoices", wt.WORD),
        ("wNotes", wt.WORD), ("wChannelMask", wt.WORD),
        ("dwSupport", wt.DWORD),
    ]


class MIDIINCAPS(ctypes.Structure):
    _fields_ = [
        ("wMid", wt.WORD), ("wPid", wt.WORD),
        ("vDriverVersion", wt.DWORD),
        ("szPname", ctypes.c_wchar * MAXPNAMELEN),
        ("dwSupport", wt.DWORD),
    ]


def list_outputs() -> list[str]:
    n = winmm.midiOutGetNumDevs()
    out = []
    for i in range(n):
        caps = MIDIOUTCAPS()
        winmm.midiOutGetDevCapsW(i, ctypes.byref(caps), ctypes.sizeof(caps))
        out.append(caps.szPname)
    return out


def list_inputs() -> list[str]:
    n = winmm.midiInGetNumDevs()
    out = []
    for i in range(n):
        caps = MIDIINCAPS()
        winmm.midiInGetDevCapsW(i, ctypes.byref(caps), ctypes.sizeof(caps))
        out.append(caps.szPname)
    return out


def open_output(index: int) -> wt.HANDLE:
    h = wt.HANDLE()
    r = winmm.midiOutOpen(ctypes.byref(h), index, 0, 0, 0)
    if r != 0:
        raise RuntimeError(f"midiOutOpen failed: {r}")
    return h


def send_short(h: wt.HANDLE, status: int, data1: int, data2: int) -> None:
    msg = status | (data1 << 8) | (data2 << 16)
    r = winmm.midiOutShortMsg(h, msg)
    if r != 0:
        raise RuntimeError(f"midiOutShortMsg failed: {r}")


def close_output(h: wt.HANDLE) -> None:
    winmm.midiOutClose(h)


MIM_DATA = 0x3C3

MidiInProc = ctypes.WINFUNCTYPE(
    None, wt.HANDLE, wt.UINT, ctypes.c_void_p, wt.DWORD, wt.DWORD
)


def open_input(index: int, q: "queue.Queue[tuple[int,int,int]]"):
    def _cb(_hmi, msg, _inst, p1, _p2):
        if msg == MIM_DATA:
            status = p1 & 0xFF
            d1 = (p1 >> 8) & 0xFF
            d2 = (p1 >> 16) & 0xFF
            q.put((status, d1, d2))

    cb = MidiInProc(_cb)
    h = wt.HANDLE()
    CALLBACK_FUNCTION = 0x00030000
    r = winmm.midiInOpen(
        ctypes.byref(h), index, ctypes.cast(cb, ctypes.c_void_p), 0, CALLBACK_FUNCTION
    )
    if r != 0:
        raise RuntimeError(f"midiInOpen failed: {r}")
    winmm.midiInStart(h)
    return h, cb


def close_input(h: wt.HANDLE) -> None:
    winmm.midiInStop(h)
    winmm.midiInClose(h)


HINT = "teensy"


def find_index(names: list[str], hint: str) -> int:
    for i, n in enumerate(names):
        if hint.lower() in n.lower():
            return i
    raise SystemExit(f"No MIDI port matching {hint!r} in {names}")


def main() -> int:
    outs = list_outputs()
    ins = list_inputs()
    print("MIDI outputs:", outs)
    print("MIDI inputs :", ins)

    oi = find_index(outs, HINT)
    ii = find_index(ins, HINT)
    print(f"Using OUT idx={oi} ({outs[oi]!r})  IN idx={ii} ({ins[ii]!r})")

    q: "queue.Queue[tuple[int,int,int]]" = queue.Queue()
    h_in, _cb_ref = open_input(ii, q)
    h_out = open_output(oi)

    try:
        time.sleep(0.1)
        while not q.empty():
            q.get_nowait()

        # ── Test 1: single-note roundtrip (regression from step 0) ──────
        print("\n--- test 1: single-note echo ---")
        sent_note = 60
        ch = 0
        send_short(h_out, 0x90 | ch, sent_note, 100)
        time.sleep(0.25)
        send_short(h_out, 0x80 | ch, sent_note, 0)

        received: list[tuple[int, int, int]] = []
        deadline = time.monotonic() + 1.0
        while time.monotonic() < deadline and len(received) < 2:
            try:
                received.append(q.get(timeout=0.1))
            except queue.Empty:
                pass
        expected = sent_note + 12
        ok1 = any((s & 0xF0) == 0x90 and d1 == expected for s, d1, _ in received) and \
              any((s & 0xF0) == 0x80 and d1 == expected for s, d1, _ in received)
        print(f"  result: {'OK' if ok1 else 'FAIL'}  (received={received})")

        # ── Test 2: 4-note chord — every voice allocated, all echoed ────
        print("\n--- test 2: 4-note chord (voice allocator full) ---")
        while not q.empty():
            q.get_nowait()
        chord = [60, 64, 67, 71]   # C maj7
        for n in chord:
            send_short(h_out, 0x90 | ch, n, 100)
            time.sleep(0.02)
        time.sleep(0.4)
        for n in chord:
            send_short(h_out, 0x80 | ch, n, 0)
            time.sleep(0.02)

        received2: list[tuple[int, int, int]] = []
        deadline = time.monotonic() + 1.5
        while time.monotonic() < deadline and len(received2) < len(chord) * 2:
            try:
                received2.append(q.get(timeout=0.1))
            except queue.Empty:
                pass
        on_notes = sorted(d1 for s, d1, _ in received2 if (s & 0xF0) == 0x90)
        off_notes = sorted(d1 for s, d1, _ in received2 if (s & 0xF0) == 0x80)
        expected_chord = sorted(n + 12 for n in chord)
        ok2 = on_notes == expected_chord and off_notes == expected_chord
        print(f"  expected: {expected_chord}")
        print(f"  on echoes : {on_notes}")
        print(f"  off echoes: {off_notes}")
        print(f"  result: {'OK' if ok2 else 'FAIL'}")

        # ── Test 3: voice-stealing — 5th note pushes allocator past N=4 ──
        # The allocator must still respond (no crash); host tests verify the
        # exact stealing semantics. Here we just check the firmware echoes
        # back the 5th note too (i.e. didn't lock up).
        print("\n--- test 3: voice stealing (5 simultaneous notes) ---")
        while not q.empty():
            q.get_nowait()
        five = [60, 64, 67, 71, 74]
        for n in five:
            send_short(h_out, 0x90 | ch, n, 100)
            time.sleep(0.02)
        time.sleep(0.3)
        for n in five:
            send_short(h_out, 0x80 | ch, n, 0)
            time.sleep(0.02)

        received3: list[tuple[int, int, int]] = []
        deadline = time.monotonic() + 1.5
        while time.monotonic() < deadline and len(received3) < len(five) * 2:
            try:
                received3.append(q.get(timeout=0.1))
            except queue.Empty:
                pass
        on5 = sorted(d1 for s, d1, _ in received3 if (s & 0xF0) == 0x90)
        ok3 = on5 == sorted(n + 12 for n in five)
        print(f"  expected on-echoes : {sorted(n + 12 for n in five)}")
        print(f"  got               : {on5}")
        print(f"  result: {'OK' if ok3 else 'FAIL'} (check Serial monitor for voice-table to see stealing)")

        all_ok = ok1 and ok2 and ok3
        print(f"\n=== {'ALL OK' if all_ok else 'FAIL'} ===")
        return 0 if all_ok else 1
    finally:
        close_output(h_out)
        close_input(h_in)


if __name__ == "__main__":
    sys.exit(main())
