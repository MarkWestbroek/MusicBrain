# Modular-brain runtime — architectuuroverzicht

> Geldt voor de **modular-brain** (`firmware/app-modular-brain/` + `editor/src/modular-mb/`),
> niet voor het oudere effect-switcher/core-domein in `01-core-classes.md`.
> Bijgewerkt: mei 2026 (fw 0.5.3).

Een gekozen **patch** bepaalt drie dingen:
1. het **aantal stemmen** (`voiceCount`),
2. **welke modules** klaargezet worden,
3. **welke connecties** gelegd worden — twee domeinen: **audio** en **CV/gate**.

---

## 1. Firmware-runtime — wie houdt wat vast bij het uitvoeren van een patch

Er is geen `Patch`-klasse op de Teensy. De "draaiende patch" leeft verspreid over
drie houders. `ProjectRuntime` is de centrale eigenaar van de module-objecten;
`AudioGraph` en `CvGraph` materialiseren de connecties.

```mermaid
classDiagram
    direction LR

    class TeensyLink {
        +begin(callbacks)
        +poll()
        +logf(...)
    }

    class ProjectRuntime {
        -JsonDocument projectDoc_
        -map~string, Module~ instances_
        -vector~Module~ retired_
        -string activePatchId_
        +applyConfig(json) LoadResult
        +activatePatch(id) bool
        +instances() map
        +activePatchJson() json
        +find(id) Module*
    }

    class AudioGraph {
        -vector~AudioConnection~ conns_
        +build(patch, instances)
        +tearDown()
    }

    class CvGraph {
        -vector~Route~ routes_
        +build(patch, instances)
        +tickBridge()
    }

    class Module {
        <<abstract>>
        +id() string
        +typeId() string
        +setControl(id, value)
        +outputPortKind(port) PortKind
        +inputPortKind(port) PortKind
        +readCvPort(port) float
        +writeCvPort(port, value)
    }

    class AudioPortModule {
        <<abstract>>
        +audioStreamFor(port) AudioStream*
    }
    class MidiInModule {
        -VoiceAllocator alloc_
        +voiceGate(i) / voicePitchV(i) / voiceVelocity(i)
    }
    class VoiceAllocator {
        -StealStrategy steal_
        +noteOn() / noteOff()
        +markReleaseComplete(i)
    }
    class Registry {
        +create(typeId, id) Module
        +has(typeId) bool
    }

    Module <|-- AudioPortModule
    AudioPortModule <|-- VcoModule
    AudioPortModule <|-- VcfModule
    AudioPortModule <|-- VcaModule
    AudioPortModule <|-- OutModule
    AudioPortModule <|-- MixerModule
    Module <|-- AhdsrAudioModule
    Module <|-- MidiInModule
    MidiInModule *-- VoiceAllocator

    TeensyLink ..> ProjectRuntime : callbacks
    ProjectRuntime "1" o-- "0..*" Module : owns (instances_)
    Registry ..> Module : factory creates
    AudioGraph ..> Module : raw pointers (audio ports)
    CvGraph ..> Module : raw pointers (Route)
```

**Belangrijk — AudioStream-levensduur.** `AudioGraph`/`CvGraph` houden *rauwe*
pointers naar de modules in `ProjectRuntime`. Teensy's `AudioStream` schrijft
zichzelf in een globale update-lijst zonder zich in de destructor uit te
schrijven, dus een module mag **nooit** vernietigd worden terwijl de engine
draait. Daarom **reconciliëert** `applyConfig()` (hergebruik + retire) i.p.v.
clear+recreate. Zie DEVLOG 2026-05-30 (fw 0.5.3).

---

## 2. Editor-config — het datamodel (racks + alle patches)

Aan de editor-kant is alles **platte TypeScript-interfaces** (pure data, geen
gedrag). `ModularProject` is de wortel; het wordt geserialiseerd naar JSON,
geëxpandeerd door `flattenProjectForFirmware()` (poly-groups → per-stem) en als
config naar de Teensy gestuurd.

```mermaid
classDiagram
    direction LR

    class ModularProject {
        version
        name
        activePatchId
    }
    class ModuleType {
        id
        categoryId
        ports: Port[]
        controls: Control[]
        role
    }
    class ModuleInstance {
        id
        typeId
        internal
        visual
    }
    class Rack {
        id
        name
        slots: RackSlot[]
        polyGroups: PolyGroup[]
    }
    class Patch {
        id
        name
        voiceCount
        rackIds
        connections: PatchConnection[]
        controlState
    }
    class PatchConnection {
        from {moduleId, portId}
        to   {moduleId, portId}
        attenuation?
    }
    class PolyGroup {
        id
        label
        voiceCount
        members: PolyGroupMember[]
    }
    class Port {
        id
        direction
        signal
        eventKind?
    }

    ModularProject "1" o-- "*" ModuleType
    ModularProject "1" o-- "*" ModuleInstance
    ModularProject "1" o-- "*" Rack
    ModularProject "1" o-- "*" Patch
    ModuleType "1" o-- "*" Port
    ModuleInstance ..> ModuleType : typeId
    Rack "1" o-- "*" PolyGroup
    Patch "1" o-- "*" PatchConnection
    PatchConnection ..> ModuleInstance : moduleId
    PolyGroup ..> ModuleInstance : members
```

---

## 3. Levensloop — van push tot klinkende patch

```mermaid
sequenceDiagram
    autonumber
    participant E as Editor (browser)
    participant L as TeensyLink (fw)
    participant R as ProjectRuntime
    participant A as AudioGraph
    participant C as CvGraph

    E->>E: flattenProjectForFirmware() — poly-groups ×N → per-stem
    E->>L: {type:config, project}
    L->>R: applyConfig(json)
    R->>R: reconcile instances_ (reuse / create / retire)
    L-->>E: ack (modules, retired)

    E->>L: {type:selectPatch, id}
    L->>R: activatePatch(id) — telt wired/dangling, zet controlState
    L->>A: build(activePatchJson, instances)
    A->>A: per audio-connectie: new AudioConnection
    L->>C: build(activePatchJson, instances)
    C->>C: per CV/gate-connectie: cache Route
    L-->>E: ack (selectPatch)

    loop elke ~1 ms (loop)
        L->>C: tickBridge() — read src → write sink bij wijziging
    end
```

---

## Openstaand: voiceCount volgt de patch nog niet

`main.cpp` initialiseert `MidiInModule` hard met `kVoices = 4`. De patch stuurt
wél `voiceCount: 2` mee in `controlState`, maar dat zet alleen de waarde op de
module — de allocator-staat in de firmware blijft 4 stemmen uitdelen. Gevolg:
noten worden over 4 stemmen verdeeld terwijl maar 2 stemmen audio-bedraad zijn.
Fix: `voiceCount` uit de actieve patch lezen en op de allocator zetten bij
`selectPatch`.
