# ADR 0002 – Editor stack: TypeScript + React, device exposes an API

## Status
Accepted (2026-05-17)

## Context
The user knows JavaScript well, likes strong typing (so TS appeals), already built a React-based UML editor in another project, and runs his own web hosting. He asked:

1. *What kind of web apps can an ESP32 serve, are there limits?*
2. *Can the ESP just expose an API and host the actual web app elsewhere?*

### Answers
1. An ESP32 can comfortably serve a small SPA (a few hundred KB of static assets) from SPIFFS/LittleFS, terminate WebSockets, and run a JSON/REST or MQTT endpoint. Realistic limits: ~150–250 concurrent TCP sockets is unrealistic — assume 4–8 simultaneous clients, ~1–2 MB of static assets, modest TLS (ESP32-S3 handles TLS 1.2 fine but it eats RAM). It is **not** suitable for serving a heavy bundle (multi-MB React app with maps, big media) or for sustained high-throughput streaming.
2. Yes. The recommended pattern is exactly that: ESP32 exposes a typed JSON/WebSocket **API** and the React/TS editor is hosted anywhere (static hosting, local dev server, even `file://`). The editor talks to the device by hostname / mDNS / IP. This decouples device firmware life-cycle from editor life-cycle and is a much better DX.

## Decision
- **Editor:** React + TypeScript single-page app (Vite). Hosted externally (the user's own web hosting) and/or runnable locally via `npm run dev`.
- **Device API:** the brain (or its ESP32 side car) exposes:
  - **USB**: a CDC serial transport carrying the same JSON-RPC frames as the network API (so the editor works without WiFi).
  - **Network (when ESP32 side car is present)**: HTTP for one-shot calls, **WebSocket** for streaming updates (meters, current patch, MIDI activity), mDNS for discovery (`musicbrain.local`).
- **Schema:** the JSON-RPC method set and the patch JSON schema live in `docs/protocols/` and are generated into both a TS package (`editor/src/api/`) and a C++ header (`core/Protocol/`). Single source of truth.
- **Persistence in editor:** patches stored as JSON files; user can keep them in git. A small optional server (or a static JSON-on-disk store) is enough — no database required initially.

## Consequences
- We must define and version the JSON-RPC protocol carefully (it is a public surface for editor and any future tooling).
- A code-generation step is needed (or hand-maintained types on both sides — acceptable while the schema is tiny).
- The ESP32 side car is optional for projects 1 & 2 (USB is enough); for project 3 it is recommended so the editor can run on a tablet on stage.
- We avoid Electron and avoid Python+Qt entirely — one less toolchain.
