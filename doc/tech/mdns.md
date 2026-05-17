# mDNS / Zeroconf

## What it is
**Multicast DNS** (RFC 6762) + **DNS Service Discovery** (RFC 6763), together known as **Zeroconf** (or Bonjour on Apple, Avahi on Linux). Lets devices on a local network advertise themselves under a `.local` hostname and announce the services they offer — no DHCP entry, no central DNS server, no IP address typing.

When the ESP32 side car advertises:

```
musicbrain.local                    A 192.168.1.42
_musicbrain._tcp.local              PTR <instance>._musicbrain._tcp.local
<instance>._musicbrain._tcp.local   SRV port=80 host=musicbrain.local
                                    TXT version=1 caps=patch,meter
```

…the editor in any browser on the same WiFi sees `http://musicbrain.local` resolve, and a discovery client sees the service offer.

## Why we use it (ADR 0002)
- Lets the editor connect without the user ever typing an IP address.
- Built into the ESP‑IDF (`mdns` component) and Arduino‑ESP32 (`ESPmDNS`).
- Supported out of the box on **macOS, iOS, Windows 10+, modern Linux**. Android historically poor (use the IP fallback there).

## What matters for MusicBrain
- The ESP32 publishes `_musicbrain._tcp` on port 80 (HTTP + WebSocket).
- Editor offers a "Discover devices" button that queries the service type and lists found instances.
- Manual IP entry is always available as a fallback.

## Gotchas
- mDNS uses UDP multicast (`224.0.0.251:5353`). Some corporate/guest WiFi blocks multicast — discovery silently fails, manual IP works.
- Don't put more than ~50 devices in one mDNS namespace; the traffic isn't designed for that scale (no problem for us).
- **Android** support varies: Android 8+ added NSD support but browsers still resolve `.local` inconsistently. Document the IP fallback for Android users.
- Only one device per LAN should claim `musicbrain.local`; for multi‑device setups append a suffix (`musicbrain-1.local`, etc.).

## Links
- https://datatracker.ietf.org/doc/html/rfc6762
- https://datatracker.ietf.org/doc/html/rfc6763
- https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/protocols/mdns.html
