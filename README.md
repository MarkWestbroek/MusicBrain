# MusicBrain

Shared firmware + editor for three music projects (effect-pedal switcher, amp/speaker switcher, polyphonic modular synth controller). See [doc/Requirements.md](doc/Requirements.md), [doc/Plan.md](doc/Plan.md) and [doc/adr/](doc/adr/).

## Repository layout

```
doc/                    Requirements, Plan, ADRs, protocol docs
firmware/
  core/                 Hardware-independent C++ library (Patch, Router, Transport, UI, Storage, Protocol)
  hal/                  Per-MCU thin abstraction (host, teensy4, rp2040, stm32f1)
  app-effect-switcher/  Project 1 main + drivers
  app-amp-switcher/     Project 2 main + drivers
  app-modular-brain/    Project 3 main + drivers
  breakouts/
    cv-out/             SPI slave: 8 CV out via DAC + S&H + CD4051
    cv-in/              SPI slave: 8 CV in
    gate-trigger/       SPI slave: gates / triggers
    bridge/             SPI <-> CAN-FD/RS-485 bridge (head + satellite)
editor/                 React + TypeScript SPA (Vite)
tools/
  patch-converter/      JSON <-> CBOR converter & migrations
  simulator/            Host-side runner of core/ for tests
```

## Building the host simulator + tests

The `core/` library and the `host` HAL compile on a normal PC, so the routing logic can be developed and tested without hardware.

Requirements: CMake ≥ 3.20 and any C++17 compiler (MSVC, Clang, or GCC). On Windows the easiest setup is "Build Tools for Visual Studio" + the CMake component, or `winget install Kitware.CMake LLVM.LLVM`.

```powershell
cd firmware
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
```

## Design language

One visual language covers the whole product — website, editor and future tools. The style guide lives in [doc/styleguide.md](doc/styleguide.md): copy-paste `tokens.css`, typography specs, and component recipes (panel/badge/button/scope-trace). It is written on what the editor actually is (plain CSS + inline styles) and is kept in lock-step with the site's "amber" theme (the Imprint repo). See §6 of the guide for the relationship with the site.

## Live

- **Website:** [www.musicbrain.nl](https://www.musicbrain.nl) — built with Imprint.
- **Editor (demo):** [editor.musicbrain.nl](https://editor.musicbrain.nl) — the React editor in [`editor/`](editor/), styled per [doc/styleguide.md](doc/styleguide.md).

## Status

Scaffolding only — see [doc/Plan.md](doc/Plan.md) section 7 (phased roadmap) for what comes next. Stage 1 (this commit) puts the directory tree, the `core/` skeleton with stub types, the host build, and the ADRs in place.

## License

MIT. See [LICENSE](LICENSE).
