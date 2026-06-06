# Effect-switcher firmware — RP2040 (Raspberry Pi Pico W) build

This subfolder is a **PlatformIO** project that turns a Raspberry Pi Pico W
into the runtime for the MusicBrain effect switcher. It mirrors the ESP32
version but uses RP2040-specific peripherals:

- **CYW43 WiFi** (slower than ESP32 but functional for REST API)
- **LittleFS** on external flash (2MB total, 1MB reserved for filesystem)
- **Hardware SPI** for 74HC595 relay chain
- **UART MIDI** (31250 baud) via DIN connector
- **USB MIDI device** (appears as MIDI device to PC — new feature!)

```
firmware/app-effect-switcher/pico/
├── platformio.ini          ← board + library configuration
├── src/
│   ├── main.cpp            ← WiFi + REST API + glue
│   ├── relays.{h,cpp}      ← 74HC595 shift-register driver
│   ├── storage.{h,cpp}     ← LittleFS persistence
│   ├── patch_engine.{h,cpp}← pure logic: JSON config → relay bitmask
│   ├── midi_effect.{h,cpp} ← UART MIDI (DIN) handler
│   ├── usb_midi.{h,cpp}    ← USB MIDI device handler
│   ├── hal/
│   │   └── mcu.h           ← RP2040-specific pin definitions
│   └── secrets.h.example   ← copy to secrets.h and add your WiFi creds
└── data/                   ← (optional) LittleFS image source
```

## 1. Hardware

### 1.1 Pin map (Raspberry Pi Pico W)

| Pin (Pico W) | 74HC595        | Notes                       |
|--------------|----------------|-----------------------------|
| 3V3 / 5V     | VCC            | Match relay-board logic     |
| GND          | GND            |                             |
| GP18 (SCK)   | SRCLK          | SPI clock                   |
| GP19 (MOSI)  | SER            | Serial data                 |
| GP17         | RCLK (LATCH)   | Configurable in `relays.cpp`|
| —            | OE (active-low)| Tie to GND if not needed    |
| —            | MR / SRCLR     | Tie to VCC (active-low)     |

Two 74HC595s daisy-chained give 16 relays = the editor's default `relayCount`.
For other relay boards, rewrite `Relays::begin` / `Relays::setMask`; the rest
of the firmware never touches GPIO directly.

### 1.2 MIDI wiring

| Pin (Pico W) | MIDI connector | Notes                  |
|--------------|----------------|------------------------|
| GP1 (UART0 RX) | MIDI IN (DIN) | 31250 baud, 8N1       |
| GP0 (UART0 TX) | MIDI OUT (DIN)| Optional, for CC out  |

The Pico W also appears as a **USB MIDI device** when connected to a PC.
This allows Program Change and other MIDI messages to be sent from a DAW
or MIDI editor directly over USB.

### 1.3 Wiring diagram (16-relay setup)

```
   Raspberry Pi Pico W            74HC595 #1 (R1..R8)           74HC595 #2 (R9..R16)
  ┌──────────────────┐           ┌──────────────────┐          ┌──────────────────┐
  │                  │           │  VCC ─── +5V     │          │  VCC ─── +5V     │
  │  3V3 / 5V ───────┼── +5V ──▶ │  GND ─── GND     │          │  GND ─── GND     │
  │  GND          ───┼── GND ──▶ │  MR  ─── VCC     │          │  MR  ─── VCC     │
  │                  │           │  OE  ─── GND     │          │  OE  ─── GND     │
  │  GP19 (MOSI)  ───┼── SER ──▶ │  DS  (pin 14)    │          │  DS  (pin 14)    │
  │                  │           │                  │          │       ▲          │
  │                  │           │  Q7' (pin 9)  ───┼──────────┘       │          │
  │  GP18 (SCK)   ───┼── SRCLK ▶ │  SH_CP (pin 11)  │ ────────────────▶│ SH_CP    │
  │                  │           │                  │                  │          │
  │  GP17           ───┼── RCLK ─▶ │  ST_CP (pin 12)  │ ────────────────▶│ ST_CP    │
  │                  │           │                  │                  │          │
  └──────────────────┘           │  Q0..Q7 ─▶ relay-board IN1..IN8     │  Q0..Q7 ─▶ IN9..IN16
                                 └──────────────────┘                  └──────────────────┘
                                          │                                     │
                                          ▼                                     ▼
                                 ┌─────────────────────────────────────────────────────────┐
                                 │ 16-channel opto-isolated relay board (e.g. SONGLE 5V)   │
                                 │ Common VCC = +5V, common GND tied to Pico W GND         │
                                 │ Each channel: NO / NC / COM to your effect-loop send    │
                                 └─────────────────────────────────────────────────────────┘
```

> The lines from Pico W → 74HC595 #1 are 3.3 V logic. 74HC595 accepts that
> at any VCC between 2 V and 6 V, so a 5 V relay board still gets driven
> correctly. If you use 3.3 V coil relays you can skip the level mismatch
> entirely and run everything on 3V3.

### 1.4 Hardware shopping list

| Item | Why |
|---|---|
| **Raspberry Pi Pico W** | The brain (with WiFi + USB MIDI) |
| **2× 74HC595** | Shift-register chain → 16 GPIOs from 3 pins |
| **16-channel opto-isolated relay board** (5V coils) | Switches the audio loops; opto-isolation prevents the relay back-EMF reaching the Pico |
| **5 V / ≥2 A PSU** | A 16-coil relay board pulls ~70 mA per energised relay |
| **2× 0.1 µF ceramic + 1× 10 µF electrolytic** per 74HC595 | Decoupling on VCC↔GND, right at the chip |
| **0.25 W flyback diodes** | Already on most relay boards; if yours doesn't have them, add 1N4007 across each coil |
| **MIDI DIN connector** (5-pin) | For MIDI IN (and optional MIDI OUT) |
| **6N138 optocoupler + resistors** | MIDI input isolation (see [midi.md](../../../doc/tech/midi.md)) |
| Optional: **SSD1306 0.96″ I²C OLED** | Status display on GP4/GP5 — not yet wired in the firmware |
| Optional: **TRS / 1/4″ jacks + screw terminals** | One jack pair per audio loop |
| USB-A → micro-USB cable | For first flash + serial monitor + USB MIDI |

## 2. One-time toolchain install

1. Install [VS Code](https://code.visualstudio.com/) and the
   **PlatformIO IDE** extension. PlatformIO bundles the full RP2040 toolchain
   on first build — no manual SDK install needed.
2. Plug in the Pico W over USB. On first use you may need to hold the
   **BOOTSEL** button while plugging in to enter mass-storage mode for
   initial firmware upload.
3. Copy `src/secrets.h.example` to `src/secrets.h` and fill in your WiFi
   credentials.

## 3. Build & flash

```bash
# Build the firmware
pio run -e picow

# Upload to Pico W (hold BOOTSEL if needed)
pio run -e picow -t upload

# Monitor serial output
pio device monitor -e picow
```

The first build downloads the RP2040 toolchain and libraries (~500 MB).
Subsequent builds are fast.

## 4. REST API

Once connected to WiFi, the Pico W exposes the same REST API as the ESP32:

```
GET  /api/status     → { firmware, uptimeMs, freeHeap, chip, wifi }
GET  /api/config     → current SwitcherProject JSON
PUT  /api/config     → replace + persist config, re-apply patch
GET  /api/patch      → { activePatchId, relayMask, relayCount }
POST /api/patch/<id> → activate patch by id, drive relays
POST /api/patch/next → +1 to current patch index (wraps)
POST /api/patch/prev → -1 to current patch index (wraps)
```

CORS is wide-open so the editor (running on localhost:5173 in dev) can talk
to the device directly during a "Connect to device" flow.

## 5. MIDI support

### 5.1 UART MIDI (DIN connector)

Connect a standard MIDI DIN cable from your MIDI controller to the Pico W's
MIDI IN port (GP1). Program Change messages activate patches.

### 5.2 USB MIDI (new feature!)

When connected to a PC via USB, the Pico W appears as a **USB MIDI device**.
You can send Program Change messages from a DAW (Ableton, Reaper, etc.) or
MIDI editor directly over USB.

In your DAW:
1. Open MIDI preferences
2. Enable the "Pico W" or "USB MIDI" device
3. Send Program Change messages to switch patches

Both UART and USB MIDI are polled in `loop()`, so you can use them
simultaneously.

## 6. Differences from ESP32 build

| Feature | ESP32 | Pico W |
|---------|-------|--------|
| WiFi speed | Fast (direct) | Slower (CYW43 via SPI) |
| Flash size | 4-16 MB | 2 MB (1 MB for LittleFS) |
| USB MIDI | ❌ No | ✅ Yes (native USB device) |
| FPU | ✅ Yes (ESP32-S3) | ❌ No (software emulation) |
| Cost | ~€6-10 | ~€5-7 |
| Availability | Good | Excellent |

The REST API, JSON schema, and relay logic are **identical**. The React
editor works with both boards without modification.

## 7. Troubleshooting

- **WiFi won't connect**: Check `secrets.h`. The Pico W's WiFi is slower than
  ESP32; give it 20 seconds on first boot.
- **LittleFS mount fails**: The filesystem is auto-formatted on first boot.
  If you see repeated failures, try `pio run -e picow -t erase` to wipe flash.
- **USB MIDI not detected**: Ensure the Pico W is connected via USB (not just
  power). Check Device Manager for "USB MIDI Device" or similar.
- **Relays not switching**: Verify SPI wiring (GP18/GP19/GP17). Check that
  the 74HC595 VCC matches your relay board logic level.

## 8. License

Same as the parent MusicBrain project. See `LICENSE` in the repository root.
