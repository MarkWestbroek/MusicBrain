# `core/` – hardware-independent MusicBrain library

Pure C++17, no vendor headers. Compiles on host (for tests and the simulator) and on every supported MCU via `hal/<target>/`.

## Modules

| Header | Purpose |
|---|---|
| `Types.h` | Small value types (channel ids, voltages, durations) used across the library. |
| `Patch.h` | A single program (effect-loop bits, amp routing, or modular CV/voice config). |
| `PatchBank.h` | An indexed collection of `Patch`es with current-program state. |
| `Router.h` | Pure function from `(input event, active patch, hardware model)` to output commands. |
| `Transport/ITransport.h` | Abstract send/receive of `Frame`s (USB-CDC, SPI, CAN-FD bridge, host loopback). |
| `Protocol/SpiFrame.h` | Wire format used between brain and breakouts. See [doc/protocols/spi-frame.md](../../doc/protocols/spi-frame.md). |
| `UI/IDisplay.h`, `UI/IInputs.h` | Abstract display / buttons / encoders / pots / footswitches. |
| `Storage/IStore.h` | Abstract KV/blob store for patch banks (flash, SD, in-memory). |

The library **never** allocates after start-up in production code paths; collections use fixed-capacity types (`std::array`, small custom ring buffers).

## Tests

```powershell
cd firmware
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
```
