# Sequence Diagram — MatrixRouter: NoteOn / NoteOff

Toont wat er intern gebeurt wanneer een MIDI NoteOn binnenkomt op project 3 (de modulaire synthesizer) en uitloopt in CV- en gate-signalen op de echte breakout-boards c.q. in de simulator.

## NoteOn — vrije stem

```mermaid
sequenceDiagram
    actor MIDI as MIDI-host / toetsenbord
    participant App as Application loop
    participant MR as MatrixRouter
    participant VA as VoiceAllocator
    participant SP as synth::readBlob()
    participant RB as RouterBridge
    participant Bus as VirtualSpiBus
    participant DAC as Dac8568
    participant Gate as GateBoard
    participant TR as Trace (stdout)

    MIDI->>App: NoteOn(note=60, vel=100)
    App->>MR: handle(InputEvent{MidiNoteOn, ch=0, payload=note, data=vel}, patch)

    MR->>SP: readBlob(patch)
    SP-->>MR: SynthPatchV1{voiceCount=4, caseId=0, firstSlot=0}

    MR->>VA: noteOn(note=60)
    VA-->>MR: AllocResult{voiceIdx=0, stole=false}

    note over MR: pitchCh = (0<<8)|0 = 0x0000<br/>gateCh  = (0<<8)|1 = 0x0001<br/>CV code = (60-60)/60 * 32767 = 0

    MR-->>App: RouterResult{ CvSet(0x0000, 0), GateSet(0x0001, 1) }

    App->>RB: dispatch(result)
    RB->>Bus: sendCvSet(0x0000, 0)
    Bus->>TR: {"t_us":500,"kind":"spi","op":0x10,"bytes":8}
    Bus->>DAC: onSpi(CvSet, payload)
    DAC->>TR: {"t_us":500,"kind":"cv","ch":"0x0000","code":0,"volts":2.5}

    RB->>Bus: sendGateSet(0x0001, true)
    Bus->>TR: {"t_us":500,"kind":"spi","op":0x20,"bytes":7}
    Bus->>Gate: onSpi(GateSet, payload)
    Gate->>TR: {"t_us":500,"kind":"gate","ch":"0x0001","on":true}
```

## NoteOn — stem stelen (4 stemmen vol)

```mermaid
sequenceDiagram
    actor MIDI as MIDI-host
    participant App as Application loop
    participant MR as MatrixRouter
    participant VA as VoiceAllocator
    participant RB as RouterBridge
    participant Bus as VirtualSpiBus

    note over App: stemmen 0-3 houden al noten C, D, E, F
    MIDI->>App: NoteOn(note=71, G)
    App->>MR: handle(InputEvent{MidiNoteOn, note=71}, patch)
    MR->>VA: noteOn(note=71)
    note over VA: oudste stem = stem 0 (note C, age=1)
    VA-->>MR: AllocResult{voiceIdx=0, stole=true, prevNote=60}

    note over MR: Steal: eerst gate-off op stem 0<br/>dan nieuwe pitch + gate-on

    MR-->>App: RouterResult{<br/>  GateSet(0x0001, 0),   ← gate-off gestolen stem<br/>  CvSet(0x0000, cvG),   ← nieuwe pitch<br/>  GateSet(0x0001, 1)    ← gate-on nieuwe noot<br/>}

    App->>RB: dispatch(result)
    RB->>Bus: sendGateSet(0x0001, false)
    RB->>Bus: sendCvSet(0x0000, cvG)
    RB->>Bus: sendGateSet(0x0001, true)
```

## NoteOff

```mermaid
sequenceDiagram
    actor MIDI as MIDI-host
    participant App as Application loop
    participant MR as MatrixRouter
    participant VA as VoiceAllocator
    participant RB as RouterBridge
    participant Bus as VirtualSpiBus

    MIDI->>App: NoteOff(note=60)
    App->>MR: handle(InputEvent{MidiNoteOff, note=60}, patch)
    MR->>VA: noteOff(note=60)
    VA-->>MR: voiceIdx=0
    note over MR: gateCh = (0<<8)|(0+1) = 0x0001

    MR-->>App: RouterResult{ GateSet(0x0001, 0) }
    App->>RB: dispatch(result)
    RB->>Bus: sendGateSet(0x0001, false)
```

## CV-waarde berekening

```
midiNoteToCvCode(note):
    float norm = (note - 60) / 60.0f   // 1V/oct, MIDI 60 = 0V
    norm = clamp(norm, -1.0f, 1.0f)
    return (int16_t)(norm * 32767)

Voorbeelden:
    MIDI 60 (C4)  → 0       → 2.5V (op een 5V DAC)
    MIDI 72 (C5)  → 21845   → +1V
    MIDI 48 (C3)  → -21845  → -1V
    MIDI 120      → 32767   → +5V (clipped)
```
