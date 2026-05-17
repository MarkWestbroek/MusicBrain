# ADR 0007 – Open source by default

## Status
Accepted (2026-05-17)

## Context
The user prefers open source. He asked whether PJRC (Teensy) libraries are open source. Short answer: **yes** — Teensyduino core and most PJRC libraries are MIT-licensed (or compatible); the Audio Library is MIT; PaulStoffregen's GitHub repos are open. There is no licensing obstacle to building open-source firmware on top of them.

Closed-source components are acceptable only when *specific, needed, and not core*.

## Decision
- **License:** firmware and editor are released under the **MIT License**. (Permissive, compatible with PJRC/Arduino/Pico SDK ecosystems.)
- **Third-party policy:** prefer MIT/BSD/Apache-2 dependencies. LGPL is acceptable if dynamically linked. GPL is avoided in firmware to keep the door open for derivative hardware kits.
- **Repository:** public, on GitHub, with a `LICENSE`, `CONTRIBUTING.md`, and a `THIRD_PARTY_NOTICES.md` listing every dependency and its license.
- **Schematics & PCBs** (when they appear): CERN-OHL-P or equivalent permissive hardware licence.

## Consequences
- We track licenses of every dependency from day one.
- No closed binary blobs in `core/` or `editor/`. If a closed vendor SDK is ever required (e.g. a specific touchscreen driver), it is isolated in `hal/<target>/vendor/` and clearly labelled.
