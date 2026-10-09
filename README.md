# MusicBrain

An open platform for playable instruments, recallable patches and musical
control. Build and play modular patches in your browser, run shared DSP on a
Teensy, and connect supported external hardware through MIDI, CV, gates and
relay switching.

MusicBrain started as a way to give analog rigs memory. It now also includes
digital synthesizers, samplers and effects. External audio paths can remain
analog; internal DSP and USB audio are digital. Recall of external equipment
depends on which parameters and connections its hardware can actually control.

**[Open the editor](https://editor.musicbrain.nl/)** ([in English](https://editor.musicbrain.nl/?lang=en)) ·
[Website](https://musicbrain.nl/) ·
[Firmware downloads](https://github.com/MarkWestbroek/MusicBrain/releases) ·
[Development log](doc/RELEASE-LOG.md)

![MusicBrain modular patcher with module panels and signal cables](editor/screenshots/modular-patcher.png)

## Start here

| I want to... | Start with |
|---|---|
| Hear and edit a patch without hardware | [Try it in the browser](#try-it-in-the-browser) |
| Play patches on a Teensy | [Use a Teensy](#use-a-teensy) |
| Build or extend the hardware | [Build hardware](#build-hardware) |
| Explore instruments and workflows | [Feature guide](#feature-guide) |
| Work on the code | [Develop locally](#develop-locally) |
| Understand the direction | [Where it is going](#where-it-is-going) |

## Current status

**Development snapshot: 9 October 2026.** This is an active development
project, not just scaffolding and not a finished hardware product family.
The firmware source identifies itself as **0.5.99**. The deployed editor,
downloadable firmware and published hardware releases can lag behind source;
check the release notes and the version reported by a connected device.

| Product | Name used in this repository/editor | Current scope |
|---|---|---|
| **Cortex** | Modular MB / MMB / modular-brain | Working rack editor, patcher, browser instruments, presets and Teensy link. Digital audio runs on Teensy 4.1. The external modular hardware system is in development; validation varies by board and function. |
| **Reflex** | Effect-switcher / guitar-switcher | Offline pedal-chain and patch editor with MIDI/relay-state simulation; firmware implementations and hardware designs exist. Do not assume Cortex's connection workflow or a production-ready build. |
| **Relay** | Amp-switcher / amp/speaker-switcher | Architecture and safety requirements; the editor mode is a placeholder. Not a verified amp/cab switching system. |

The browser runs the same C++ DSP kernels as the firmware for supported
modules, compiled to WebAssembly. Audio I/O and some routing use Web Audio.
Shared kernels do **not** guarantee identical behavior of every complete
patch: hardware I/O, CPU/memory limits and feature support differ. The
**Modules** tab's **Sim** column indicates module support; polyphony depends
on the patch and target, not a universal voice-count guarantee.

## Try it in the browser

No MusicBrain hardware or account is needed for the core editor and simulator.
Use a current Chrome or Edge browser for the most straightforward MIDI/USB
workflow; device access depends on browser support and permissions.

1. Open [the editor](https://editor.musicbrain.nl/) (add
  [`?lang=en`](https://editor.musicbrain.nl/?lang=en) for English; an English
  browser gets it automatically). It opens in **play mode**: a patch from
  the standard set, its front panel and an on-screen keyboard that also
  works on a phone. A short tour explains the controls; **?** repeats it.
2. Choose another patch from the list and play. The first key press starts
  the audio. A MIDI keyboard is optional; grant access when using Web MIDI.
  Start with a low listening volume.
3. Turn the knobs on the front panel. **Save** keeps your changes in the
  patch; **Look inside ▸** opens the full editor (rack, patcher, simulator).
4. Export the project as JSON to keep a portable copy; browser storage is
  not a backup.

If a patch stays silent, check that audio has started, that it reaches an
output and that its modules are supported in the simulator. Sampler and
lyric instruments also need their banks. Availability of newer examples
depends on the deployed editor version.

For background and bank workflows, read
[The simulator as an instrument](doc/browser-instrumenten.md).
For pedalboards, select **Effect-switcher** and follow the
[effect-switcher guide](editor/README.md#effect-switcher-editor); its
simulation visualizes switching rather than emulating the sound of every pedal.

## Use a Teensy

Start with a **Teensy 4.1**, a USB data cable and a computer. Sampler and
memory-heavy patches need PSRAM; sample/lyric banks use a microSD card.
The current firmware's audio connection is **USB**, not a standalone analog
headphone or line output. An assembled Cortex backplane is not required to
try the internal digital instruments.

1. Follow [Firmware distribution](doc/firmware-distributie.md): download a
  released `.hex` from the editor's **Teensy > Firmware** panel or
  [GitHub Releases](https://github.com/MarkWestbroek/MusicBrain/releases),
  and install it with [PJRC Teensy Loader](https://www.pjrc.com/teensy/loader.html).
  Browser-only flashing is still a proposal.
2. Connect through the editor's Teensy link, verify the reported version
  and send a supported patch. Close the link before flashing again.
3. Set up USB-audio monitoring and, if needed, transfer banks to the SD card.
  Follow [Teensy on a PC: audio, flashing and storage](doc/teensy-aan-de-pc.md)
  for the Windows workflow and common silent-output problems.

Start with a simple patch before trying large sample banks or many voices.
See [simulator/firmware parity](doc/sim-firmware-parity-plan.md) for the
development history and [release notes](doc/RELEASE-LOG.md) for later changes.

## Feature guide

The generated [module catalogue](doc/module-catalogus.md) lists every internal module with ports, controls, simulator status, firmware status and the example patches that use it (regenerate with `npm run catalog` in `editor/`).

The linked guides include both current behavior and dated development notes;
some are in Dutch. Check their status and version before treating a proposal
or an old limitation as current. A module panel is not proof that a physical
module exists or that every target supports it.

| Area | What to explore | Guide |
|---|---|---|
| Modular editing | Racks, signal-typed cables, live controls, patches, presets and polyphonic voice groups | [Editor](editor/README.md), [polyphony model](doc/uml/11-simulation-wasm.md) |
| Synthesis | Subtractive/FM/wavetable, DX7, Mutable Instruments ports, STK physical models and SID | [Browser instruments](doc/browser-instrumenten.md), [STK](doc/plans/stk-sound-module.md), [SID](doc/plans/sid.md) |
| Sampling | Multisample analysis, SF2 import, key/velocity zones, bank transfer and SD streaming | [Browser instruments](doc/browser-instrumenten.md), [Teensy storage](doc/teensy-aan-de-pc.md#3-de-sd-kaart-voor-de-sampler) |
| Effects | Filters, delays, chorus, phasers, reverbs, pitch effects, compressors and EQ | [Release log](doc/RELEASE-LOG.md), [compressors](doc/plans/vintage-compressors.md), [EQ](doc/plans/vintage-eq.md) |
| Voice and audio input | External audio/vocoder, ZANG lyric banks and voice-synthesis experiments | [Zang](doc/plans/zingende-stemmen.md), [voice as an instrument](doc/plans/stem-als-instrument.md), [local speech generation](tools/piper-tts/README.md) |
| Play mode | Front panels, a touch keyboard and a Trautonium-style ribbon on the phone, a guided tour, English/Dutch, a four-track overdub recorder (free recording, then loop a region and punch in), one tempo per patch with tap tempo and MIDI clock | [Editor: play mode](editor/README.md#speelmodus-en-front), [overdub](doc/plans/overdub.md), [tempo](doc/plans/tempo.md) |
| Classic instruments | Trautonium (MIXTUR), Ondes Martenot with its Palme and Métallique speakers, Fairlight CMI (8-bit sampler mode and waveform synthesis drawn on a green-on-black PAGE 4), an arpeggiator, organ, e-piano, Mellotron, CS-80 brass and more | [Release log](doc/RELEASE-LOG.md), [Fairlight](doc/plans/fairlight.md), [module catalogue](doc/module-catalogus.md) |
| Performance control | MIDI, CC, aftertouch, control-surface feedback and touch/phone experiments | [Roto-Control](doc/plans/control-surface.md), [MPE status](doc/plans/mpe.md), [Snaarbank](doc/snaarbank-testlab.md) |
| Patch creation tools | Recipes, optional AI assistance and project-file editing through MCP | [Recipes](doc/plans/patch-recept.md), [MCP tools](tools/mmb-mcp/README.md) |
| A/B and morph | Compare and interpolate patches on the same rack; firmware support is incomplete | [Morph status and limits](doc/plans/morph-a-b.md) |

The core editor does not require an AI service. AI-assisted workflows can
require separate provider configuration; local speech generation has its
own setup. They are optional, not prerequisites for making music.

## Build hardware

Cortex uses a Teensy-based backplane with function cards for conversion,
gates, controls and routing. **dCV** is the digital control representation;
DAC/ADC cards connect it to physical analog CV. Do not mix board generations
or assume that every connector present on a PCB is already supported by firmware.

1. Read the [system-generation overview](doc/systeem-v3-plan.md) and
  [Cortex busboard guide](hardware/schematics/musicbrain-busboard/README.md).
2. Select compatible cards from [hardware/schematics](hardware/schematics/)
  using the [SPI bus specification](doc/spi-bus-spec.md). Check each board's
  revision, status, pinouts, BOM/fabrication files and remaining work.
3. Verify power, orientation and the intended firmware before first power-up.
  A clean ERC/DRC or fabrication package is not evidence of a physically
  assembled and tested board. Check the documented validation before ordering.

For Reflex, start with the [guitar-switcher specification](doc/guitar-switcher-spec.md)
and [gswitch-brain status](hardware/schematics/gswitch-brain/README.md).
For Relay, read the [amp/speaker-switcher requirements](firmware/app-amp-switcher/README.md):
never treat an unverified relay design as safe for power-amp/speaker switching.

## Where it is going

The goal is one open workflow spanning browser instruments, embedded DSP and
controllable analog hardware, with portable patches and reusable components.
It is not a promise to make every existing analog knob or cable recallable.

- **Current work:** stabilize playing, patch changes and simulator/Teensy
  behavior; expand useful instruments and complete hardware integration.
  Track concrete work in the [backlog](doc/BACKLOG.md).
- **Partially implemented directions:** expressive control including
  [MPE](doc/plans/mpe.md), [patch morphing](doc/plans/morph-a-b.md) and
  richer voice workflows. Each plan records its own supported and open parts.
- **Research, not a delivery commitment:** [Instrument Lab](doc/plans/musicbrain-instrument-lab.md)
  for analog/hybrid voice circuits, [State-Graph Synthesis](doc/plans/state-graph-synthesis.md)
  with early material-memory experiments, and [instrument spinoffs](spinoffs/README.md).

[Requirements](doc/Requirements.md), [Plan](doc/Plan.md) and
[Plan v2](doc/Plan-v2.md) preserve the original thinking and development
history. They are **not** the current release checklist or getting-started guide.

## Develop locally

### Editor

Install a current Node.js LTS release with npm. From the repository root:

```powershell
cd editor
npm install
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`. The development
server is also configured for local-network access; use it on a trusted network.
Run `npm run typecheck`, `npm test` and `npm run build` in the editor directory
when changing its code. See the [editor guide](editor/README.md) and
[WASM build instructions](tools/mmb-wasm/README.md) for details.

### Host firmware tests

The hardware-independent core can be built without a Teensy. Requirements:
CMake 3.20 or later and a C++17 compiler (MSVC, Clang or GCC).
From the repository root:

```powershell
cmake -S firmware -B firmware/build
cmake --build firmware/build
ctest --test-dir firmware/build --output-on-failure
```

For multi-configuration generators such as Visual Studio, pass `-C Debug`
to `ctest` when testing a Debug build. This host simulator tests control and
routing; it is distinct from the browser audio simulator and the Teensy build.

### Find your way around

| Location | Purpose |
|---|---|
| [editor](editor/) | React/TypeScript application, instruments, patch tools and simulator |
| [firmware/core](firmware/core/) and [firmware/hal](firmware/hal/) | Shared C++ control logic and hardware abstraction |
| [firmware/app-modular-brain](firmware/app-modular-brain/) | Cortex/Teensy application and module contract |
| [firmware/lib](firmware/lib/) | Shared DSP and third-party libraries |
| [firmware/app-effect-switcher](firmware/app-effect-switcher/) | Reflex firmware targets |
| [hardware](hardware/) | Board designs, generators and sourcing |
| [tools](tools/) | WASM builds, measurement, bank conversion, speech and MCP tooling |
| [doc](doc/) | Guides, specifications, plans and development history |

For architecture, use the [ADRs](doc/adr/README.md) and
[UML overview](doc/uml/README.md). Editor module definitions and firmware
share a tested contract; changes to ports and controls must stay aligned.
Include usage/status documentation with substantive changes, not only a log entry.
The [style guide](doc/styleguide.md) covers the editor and the Imprint-built website.
Website maintainers: see the [Imprint content update brief](doc/imprint-website-actualisatie-2026-09.md).

## License

MusicBrain's own code is MIT-licensed; see [LICENSE](LICENSE). Third-party
libraries and assets retain their respective licenses and notices; the
root license does not replace them. Check those terms before redistributing
firmware, sample banks or other bundled material.
