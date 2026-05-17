# Sequence Diagram — SwitcherRouter: ProgramChange & Footswitch

Toont het flow voor project 1 (het relais-pedalboard). De applicatie-loop en de host-harness (`mb_switcher`) werken identiek; op de RP2040 vervangen echte HAL-drivers de host-mocks.

## MIDI Program Change (direct selectie)

```mermaid
sequenceDiagram
    actor MIDI as USB-MIDI / editor
    participant App as Application loop
    participant SR as SwitcherRouter
    participant Bank as PatchBank
    participant SP as switcher::readBlob()
    participant HAL as HAL driver
    participant Relay as IRelayBoard
    participant Disp as IDisplay

    MIDI->>App: ProgramChange(prog=2)
    App->>SR: handle(InputEvent{MidiProgramChange, data=2}, nullptr)

    SR->>Bank: setActive(id=2)
    Bank-->>SR: true

    SR->>Bank: active()
    Bank-->>SR: Patch{id=2, name="Lead", blob=...}

    SR->>SP: readBlob(patch)
    SP-->>SR: SwitcherPatchV1{relayCount=16, relayMask=0x000F}

    note over SR: Emit één RelaySet per relay (16x)<br/>+ één DisplayDirty

    SR-->>App: RouterResult{<br/>  RelaySet(relay=0, on=1),<br/>  RelaySet(relay=1, on=1),<br/>  RelaySet(relay=2, on=1),<br/>  RelaySet(relay=3, on=1),<br/>  RelaySet(relay=4..15, on=0),<br/>  DisplayDirty<br/>}

    loop voor elk RelaySet-commando
        App->>HAL: dispatch(cmd)
        HAL->>Relay: setRelay(id, on)
    end

    App->>HAL: dispatch(DisplayDirty)
    HAL->>Bank: active()
    Bank-->>HAL: Patch{id=2, name="Lead"}
    HAL->>Disp: showPatch(2, "Lead")
```

## Footswitch omhoog (short-press → volgende patch)

```mermaid
sequenceDiagram
    actor FS as Footswitch (short press)
    participant FW as RP2040 firmware
    participant App as Application loop
    participant SR as SwitcherRouter
    participant Bank as PatchBank
    participant Relay as IRelayBoard
    participant Disp as IDisplay

    FS->>FW: GPIO-interrupt (press)
    FW->>App: InputEvent{Footswitch, payload=0, data=1}
    App->>SR: handle(ev, nullptr)

    SR->>Bank: activeId()
    Bank-->>SR: optional{3}  (huidige index = 3)

    SR->>Bank: indexOf(3)
    Bank-->>SR: idx=3

    note over SR: up: idx = (3+1) % 4 = 0

    SR->>Bank: at(0)
    Bank-->>SR: Patch{id=0, name="Clean"}

    SR->>SR: selectProgram(id=0)
    note over SR: → setActive, readBlob, 16x RelaySet + DisplayDirty

    SR-->>App: RouterResult{<br/>  ..16x RelaySet..,<br/>  DisplayDirty,<br/>  MidiOut{0xC0, prog=0}  ← synthetische PC<br/>}

    App->>Relay: setRelay(0, on=1) [via HAL]
    App->>Relay: setRelay(1..15, on=0) [via HAL]
    App->>Disp: showPatch(0, "Clean") [via HAL]
```

## Footswitch omlaag (long-press → vorige patch, wrap-around)

```mermaid
sequenceDiagram
    actor FS as Footswitch (long press)
    participant FW as RP2040 firmware
    participant App as Application loop
    participant SR as SwitcherRouter
    participant Bank as PatchBank

    note over Bank: bank heeft 8 patches (0..7),\nactieve patch = id 0, idx = 0

    FS->>FW: GPIO-timer (long press herkend)
    FW->>App: InputEvent{Footswitch, payload=1, data=1}
    App->>SR: handle(ev, nullptr)

    SR->>Bank: activeId() → optional{0}
    SR->>Bank: indexOf(0) → idx=0
    note over SR: down: idx=0 → (0==0) → idx = n-1 = 7

    SR->>Bank: at(7)
    Bank-->>SR: Patch{id=7, name="All"}
    SR->>SR: selectProgram(7)
    SR-->>App: RouterResult{ ...RelaySet x16..., DisplayDirty, MidiOut{0xC0,7} }
```

## Onbekend program number (geen match in bank)

```mermaid
sequenceDiagram
    participant App as Application loop
    participant SR as SwitcherRouter
    participant Bank as PatchBank

    App->>SR: handle(InputEvent{MidiProgramChange, data=99}, nullptr)
    SR->>Bank: setActive(99)
    Bank-->>SR: false  (id 99 niet in bank)
    SR-->>App: RouterResult{count=0}
    note over App: Geen relay-wijzigingen, geen display-update
```

## Footswitch release — genegeerd

```mermaid
sequenceDiagram
    actor FS as Footswitch (release)
    participant App as Application loop
    participant SR as SwitcherRouter

    FS->>App: InputEvent{Footswitch, payload=0, data=0}
    App->>SR: handle(ev, nullptr)
    SR-->>App: RouterResult{count=0}
    note over SR: data==0 (release) wordt genegeerd;\nalleen presses (data==1) wisselen patches.
```
