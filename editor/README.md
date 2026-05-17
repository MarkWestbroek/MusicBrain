# `editor/` — React + TypeScript patch editor

Vite + React + strict TypeScript. Hosted externally; talks to the device via JSON-RPC over USB-CDC or WebSocket (see [ADR 0002](../doc/adr/0002-editor-stack.md)).

## Develop

```powershell
cd editor
npm install
npm run dev
```

Then open http://localhost:5173.

## Status

Scaffolding only — shows two demo patches and a radio button. Real features (device discovery, patch CRUD, CV matrix view, file/git-backed library) come in roadmap stages 3 and 7.

## Connecting to a device

Two transports, both will speak the same JSON-RPC schema (`doc/protocols/schemas/api.jsonrpc.v1.json`, TBD):

| Transport | When | How |
|---|---|---|
| **WebSerial** (USB-CDC) | All projects, no extra hardware | Browser API; works in Chromium-based browsers. |
| **WebSocket** (via ESP32 side car) | Project 3 on stage / from tablet | mDNS-discovered `musicbrain.local`. |
