# ADR 0003 – Project 1 on-device UI: minimal LCD + remote editor

## Status
Accepted (2026-05-17)

## Context
For the effect-box switcher the user prefers a minimal on-device UI and intends to do all configuration from a phone, tablet, laptop, or PC (sound techs typically own one). Editing does not need to be fast and does not happen during a show.

## Decision
- **On stage:** a single, high-contrast display showing **current program number + name** (and optionally a small chain visualisation). Either a transflective 16×2/20×4 character LCD or a 1.3" mono OLED. No touch.
- **Stage controls:** up/down footswitches **and** a MIDI Program Change input so any commercial foot controller can be used.
- **Configuration:** done remotely via the TypeScript/React editor (ADR 0002), connected over USB-CDC by default, optionally over WiFi via the ESP32 side car.
- **No on-device editing menus** beyond brightness / MIDI channel / factory-reset — keeps firmware small and avoids fiddly button choreography.

## Consequences
- The brain firmware does not embed a menu system; saves flash and developer time.
- The device is unusable for editing without an external screen — acceptable per the user's preference, and the editor is reachable from any browser.
- The display driver lives in `core/UI/` behind an abstract `IDisplay` so projects 2 and 3 can reuse or replace it.
