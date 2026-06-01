# MusicBrain Firmware — UML Documentation

Generated: May 2026, based on Stage 6 codebase.

## Files in this directory

| File | Type | Inhoud |
|------|------|--------|
| `01-core-classes.md` | Mermaid classDiagram | Alle core-klassen + structs |
| `02-sim-hal-classes.md` | Mermaid classDiagram | Sim-laag + HAL interfaces + host-mocks |
| `03-seq-matrixrouter.md` | Mermaid sequenceDiagram | NoteOn/NoteOff flow door MatrixRouter |
| `04-seq-switcherrouter.md` | Mermaid sequenceDiagram | ProgramChange + footswitch flow door SwitcherRouter |
| `05-components.md` | Mermaid C4-stijl component | Pakketstructuur + afhankelijkheden |
| `06-usecases.md` | Mermaid journey / use case | Use cases per actor |
| `07-modular-brain-runtime.md` | Mermaid class + sequence | Modular-brain runtime (ProjectRuntime/AudioGraph/CvGraph) + editor-datamodel |
| `08-core-runtime-hierarchy.md` | Mermaid class + flow | Core runtime module-hiërarchie (Module/CvModule/Envelope/Ahdsr), AhdsrAudioModule-opschoning + dCV-bus/SPI-split |
| `09-modular-brain-audiomodules.md` | Mermaid classDiagram | AudioModule-hiërarchie: alle 18 subklassen met audio-port-mapping, CV-ports en registratie |
| `10-modular-brain-cv-modules.md` | Mermaid classDiagram | CvModule-hiërarchie: 8 CvModule-subklassen + CvMath, met port-mapping, tick-gedrag en CV-bridge-uitleg |
| `musicbrain.xmi` | XMI 2.1 | Import in Sparx EA: alle klassen + relaties |

## Hoe importeren in Sparx EA

1. **File → Import → Import Package from XMI File**
2. Kies `musicbrain.xmi`
3. Selecteer *UML 2.x XMI (XMI 2.1)*
4. Klik *Import* → alle packages + klassen + operaties verschijnen in de browser.
