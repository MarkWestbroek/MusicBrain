# WebSockets

## What it is
A protocol (RFC 6455) that upgrades an HTTP/1.1 connection to a **persistent, full‑duplex, message‑oriented** channel between browser and server. Same TCP connection, but after the upgrade handshake both sides can send framed messages whenever they want, with no per‑message HTTP overhead.

Messages are either **text** (UTF‑8 string) or **binary** (arbitrary bytes). The browser API is the global `WebSocket` constructor:

```ts
const ws = new WebSocket('ws://musicbrain.local/api');
ws.onmessage = (ev) => console.log(ev.data);
ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'device.hello', id: 1 }));
```

`wss://` is the TLS variant; otherwise identical.

## Why we use it (ADR 0002)
- Lets the editor receive **push notifications** (meters, MIDI activity, current patch changes) instead of polling.
- Carries our JSON‑RPC frames cleanly — one message = one JSON‑RPC object, framing solved.
- First‑class browser support since ~2012; no library needed on the editor side beyond ergonomics wrappers.
- Easy to serve from the ESP32 side car (`esp_websocket_server`, `ESPAsyncWebServer`).

## What matters for MusicBrain
- The ESP32 hosts the server on, e.g., `ws://musicbrain.local/api`.
- The editor (React app, hosted anywhere) connects and exchanges JSON‑RPC.
- Auto‑reconnect with backoff on the editor side; on the device, accept the dropped socket silently.
- **Ping/Pong**: the spec defines control frames; configure the server to send a ping every 10–20 s so the editor notices a dead link quickly.

## Gotchas
- **Mixed content**: a page served over `https://` cannot open a `ws://` connection — only `wss://`. If the editor is hosted on HTTPS, the device needs a TLS WebSocket server (RAM cost on ESP32) **or** the editor must be served on HTTP locally.
- **CORS does *not* apply to WebSockets** — connections from any origin succeed. If you ever expose the device to the wider network, validate the `Origin` header on the server.
- **Per‑message size**: keep messages small (< 4 KB) so an ESP32's RAM doesn't get squeezed under load. Stream big patch dumps in chunks.
- **Don't use WebSockets for the realtime CV path** — the latency is fine for control‑plane editing, but the brain's hot loop has no business talking TCP.

## Links
- https://datatracker.ietf.org/doc/html/rfc6455
- https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
