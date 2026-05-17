# WebSerial API

## What it is
A browser API (W3C draft, shipped in **Chromium‑based browsers since 2020**: Chrome, Edge, Opera, Brave; **not** in Firefox or Safari) that lets a web page open and talk to a USB‑CDC serial device directly — no native driver, no Electron, no installer.

```ts
const port = await navigator.serial.requestPort();   // shows a chooser dialog
await port.open({ baudRate: 115200 });
const writer = port.writable!.getWriter();
await writer.write(new TextEncoder().encode('{"jsonrpc":"2.0","method":"device.hello","id":1}\n'));
const reader = port.readable!.getReader();
const { value } = await reader.read();
```

Access requires a **secure context** (HTTPS or localhost) and a **user gesture** (click) to trigger `requestPort`. The user explicitly picks the device from a system dialog; the page cannot enumerate ports silently.

## Why we use it (ADR 0002)
- Most direct way to let the editor edit a device with **no extra hardware** (no ESP32 needed, no WiFi).
- Removes the entire "install a USB driver" support burden — the device just enumerates as CDC.
- Same JSON‑RPC over NDJSON we use over WebSockets — only the byte transport differs.

## What matters for MusicBrain
- The brain (Teensy / RP2040) exposes a standard USB‑CDC interface; OS sees it as a COM port.
- Editor lets the user pick the port once; we remember the device via `navigator.serial.getPorts()` so reconnection is one click next time.
- Frame in / frame out: split on `\n`, parse JSON.

## Gotchas
- **Browser support is Chromium‑only**. If we ever need Firefox/Safari users, fall back to a tiny native helper or use the ESP32 + WebSocket path.
- **No port enumeration without user gesture** — design the connect button accordingly.
- On Linux the user typically needs to be in the `dialout` group for USB‑CDC access; document that.
- COM ports on Windows can change number when plugging into a different USB hub. WebSerial handles re‑identification via the `getPorts()` permission grant, not by port name — good for us.
- WebUSB is a *different* API (raw USB transfers, vendor‑class devices). We use **WebSerial**, not WebUSB.

## Links
- https://wicg.github.io/serial/
- https://developer.chrome.com/docs/capabilities/serial
