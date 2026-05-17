# CRC‑16/CCITT (a.k.a. CRC‑16/CCITT‑FALSE)

## What it is
A 16‑bit **Cyclic Redundancy Check** widely used in serial protocols (XMODEM, MAVLink, MIDI MTC, many embedded buses). Computed by dividing the data, treated as a polynomial over GF(2), by the generator polynomial **0x1021** (x¹⁶ + x¹² + x⁵ + 1).

The variant we use is the common embedded one:
- Initial value: **0xFFFF**
- No input or output reflection
- No final XOR
- Big‑endian transmission

This variant is sometimes called *CRC‑16/CCITT‑FALSE* in catalogues like Greg Cook's CRC reveng list.

## Why we use it (SPI frame spec)
- Cheap to compute on every MCU we target (a few hundred cycles per frame).
- Detects all single‑bit and all two‑bit errors, plus all bursts up to 16 bits. Good enough for our short SPI/CAN‑FD frames.
- CAN‑FD already has its own CRC at the link layer, but a frame‑level CRC also catches **bridge‑induced** corruption (e.g. SPI ↔ CAN translation bug).

## Reference implementation
The one shipped in [`core/Protocol/SpiFrame.cpp`](../../firmware/core/src/Protocol/SpiFrame.cpp):

```cpp
uint16_t crc = 0xFFFF;
for (auto b : bytes) {
    crc ^= uint16_t(b) << 8;
    for (int i = 0; i < 8; ++i)
        crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : (crc << 1);
}
```

A table‑driven version (256‑entry, ~512 byte table) is ~10× faster if profiling ever shows we need it.

## Gotchas
- "CRC‑16" is **ambiguous** — there are at least a dozen flavours. Always document the *full* parameter set (poly, init, reflect‑in, reflect‑out, xor‑out) when interoperating.
- Don't confuse with **CRC‑16/CCITT‑TRUE / KERMIT** (init 0x0000, reflected) or **CRC‑16/XMODEM** (init 0x0000, not reflected). They use the same polynomial but produce different values.

## Links
- https://reveng.sourceforge.io/crc-catalogue/16.htm — definitive catalogue of CRC parameter sets.
- https://en.wikipedia.org/wiki/Cyclic_redundancy_check
