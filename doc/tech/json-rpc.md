# JSON‑RPC 2.0

## What it is
A tiny, stateless, transport‑agnostic **remote procedure call** protocol. Both request and response are JSON objects. Spec: ~3 pages.

### Request
```json
{ "jsonrpc": "2.0", "method": "patch.get", "params": { "id": 7 }, "id": 42 }
```

### Successful response
```json
{ "jsonrpc": "2.0", "result": { "id": 7, "name": "Crunch" }, "id": 42 }
```

### Error response
```json
{ "jsonrpc": "2.0", "error": { "code": -32601, "message": "Method not found" }, "id": 42 }
```

A request without an `id` field is a **notification** (no response expected). Multiple requests can be batched as a JSON array.

## Why we use it (ADR 0002)
- **One protocol, multiple transports**: the same JSON‑RPC frames travel over USB‑CDC (default) and WebSocket (via the ESP32 side car). The editor doesn't need two code paths.
- Trivially debuggable: paste a frame into a text editor and read it.
- Notifications fit our streaming needs: meters, MIDI activity and current‑patch updates are pushed from the device as notifications with no `id`.
- Avoids the ceremony and tooling of gRPC/protobuf for a project this size.

## What matters for MusicBrain
- **Method namespacing**: `patch.*`, `bank.*`, `device.*`, `meter.*`, `system.*`. The full set lives (will live) in `doc/protocols/schemas/api.jsonrpc.v1.json`.
- **Framing on USB‑CDC**: JSON‑RPC itself does not define a framing rule. We use **NDJSON** (one JSON object per `\n`‑terminated line) on the serial port. WebSocket already provides framing.
- **Versioning**: include a `device.hello` exchange on connect that returns `schemaVersion`, firmware version, capabilities. Editor refuses to talk to incompatible versions and points the user at an update.
- **Error codes**: reuse the spec's reserved range (–32000 … –32099 for app errors).

## Gotchas
- JSON‑RPC does **not** define authentication; on a trusted LAN we don't need any, but if you ever expose the side car to the internet, put it behind a reverse proxy with TLS + a token.
- The spec is permissive about parameter style (`params` may be array *or* object). Pick one project‑wide ("object only") and lint for it.
- Batching is allowed but rarely needed; skip it for the first version.

## Links
- https://www.jsonrpc.org/specification
- http://ndjson.org/ — newline‑delimited JSON framing convention.
