# RP2040-SPI-slave-testavond (Pico + Teensy op breadboard)

**Doel**: het enige open risico-item van het poly-spoor sluiten
(`doc/poly-analog-spec.md` B2/B4): kan een RP2040 betrouwbaar als
SPI-slave op CS2 hangen? Plus bonus: de PIO-periode/duty-meting voor de
tuninglus (B10) en PWM-ijking valideren.

**Besluit dat eraan hangt**: slaagt de test → backbone-PCB-order vrij.
Faalt hij → UART (pins 22/23 van de modulekabel) wordt het primaire trage
kanaal; het backbone-ontwerp heeft die fallback al, dus alleen firmware
kiest anders.

**Materiaal**: Teensy 4.1, Raspberry Pi Pico (RP2040, zonder W/2),
breadboard, korte dupontdraadjes (< 15 cm), 2× USB-kabel. Beide borden
zijn 3,3 V-logic → draden direct, **géén 5 V ergens heen**. Beide via hun
eigen USB voeden; **GND van beide borden doorverbinden is verplicht**.

---

## Test 1 — SPI-slave (het risico-item)

### Bedrading

| Teensy 4.1 | richting | Pico (SPI0-slave-pinset) |
|---|---|---|
| 13 (SCK) | → | GP2 (SPI0 SCK) |
| 11 (MOSI) | → | GP0 (SPI0 RX) |
| 12 (MISO) | ← | GP3 (SPI0 TX) |
| 10 (CS) | → | GP1 (SPI0 CSn) |
| GND | ↔ | GND |

### Route A — hardware-SPI-slave (eerst proberen; simpelst)

De RP2040-SPI-periferie (PL022) kan native slave-mode; arduino-pico
(earlephilhower-core) levert er een **SPISlave**-library met voorbeelden
bij. Protocol voor de test: **echo-met-vertraging** — de slave zet het
láátst ontvangen frame klaar als antwoord op het vólgende frame. Zo test
één lus beide richtingen én de framing.

Pico-kant (schets; begin vanuit het meegeleverde SPISlave-voorbeeld van
arduino-pico, zet de pinnen op GP0–GP3 en mode 0):

```cpp
// Pico: SPISlave @ SPI0 (GP0=RX, GP1=CSn, GP2=SCK, GP3=TX), mode 0
// callback onDataRecv: bewaar 4-byte frame; onDataSent/queue: zet het
// bewaarde frame klaar als volgende antwoord (echo-met-vertraging).
```

Teensy-kant (master, compleet):

```cpp
#include <SPI.h>
const int CS = 10;
uint32_t frame = 0, fouten = 0;
uint8_t vorige[4];

void setup() {
  pinMode(CS, OUTPUT); digitalWrite(CS, HIGH);
  SPI.begin(); Serial.begin(115200);
}

void loop() {
  uint8_t tx[4] = { (uint8_t)(frame >> 8), (uint8_t)frame, 0xA5,
                    (uint8_t)((frame >> 8) ^ frame ^ 0xA5) };  // checksum
  uint8_t rx[4];
  SPI.beginTransaction(SPISettings(4000000, MSBFIRST, SPI_MODE0));
  digitalWrite(CS, LOW);
  for (int i = 0; i < 4; i++) rx[i] = SPI.transfer(tx[i]);
  digitalWrite(CS, HIGH);
  SPI.endTransaction();
  if (frame > 0 && memcmp(rx, vorige, 4)) fouten++;   // echo klopt?
  memcpy(vorige, tx, 4);
  if (++frame % 100000 == 0)
    Serial.printf("%lu frames, %lu fouten\n", frame, fouten);
  delayMicroseconds(1000);   // 1 kHz-poll; daarna opvoeren/verlagen
}
```

### Meetprotocol

1. Start op **2 MHz**, 1 kHz-polltempo → ≥ 10⁶ frames, tel fouten.
2. Herhaal op **4 MHz** (ons doeltempo) en — voor de marge — 8 MHz.
3. Stress: `delayMicroseconds` naar 100 (10 kHz back-to-back polls).
4. Noteer per run: klok, polltempo, frames, fouten.

### Slaagcriteria

- **0 framefouten over ≥ 10⁶ frames @ 4 MHz / 1 kHz-poll** → geslaagd,
  B2-regime bewezen, backbone-order vrij.
- Incidentele fouten alleen @ 8 MHz: ook geslaagd (wij draaien 2–4).
- Fouten @ 4 MHz → **route B** proberen vóór het faal-besluit.

### Route B — PIO-slave (alleen als A hapert)

Twee state-machines: één RX (wait CS↓ → sample MOSI op SCK↑, autopush
per 8 bits), één TX (out MISO op SCK↓, autopull). DMA aan de FIFO's.
Community-implementaties bestaan (zoek "RP2040 PIO SPI slave"); dit is
de determinismeroute uit de spec. Zelfde meetprotocol en criteria.

Faalt B óók @ 4 MHz → besluit: **UART primair** (pins 22/23), CS2 vervalt.

---

## Test 2 — periode/duty-meting (bonus, zelfde avond)

Valideert de B10-tuninglus (frequentie) en de PWM-ijking (duty).

| Teensy | richting | Pico |
|---|---|---|
| 3 (`tone()`/PWM-uit) | → | GP7 |
| GND | ↔ | GND (zit er al) |

1. Teensy: `tone(3, f)` voor f = 100 Hz, 1 kHz, 10 kHz; daarna
   `analogWrite(3, x)` voor duty 10/25/50/75/90 % (op vaste PWM-freq).
2. Pico stap 1 (snel resultaat): `pulseIn()` op GP7 voor high- en
   low-tijd → periode + duty printen.
3. Pico stap 2 (zoals de echte backbone): PWM-slice-capture (B-pin GP7,
   count-while-high voor duty; edge-count per gate-tijd voor frequentie —
   zie pico-examples `pwm/measure_duty_cycle`) of een PIO-teller.

**Slaagcriteria**: frequentie binnen 0,1 %, duty binnen 1 % over het
bereik 100 Hz–10 kHz. (Ruim voldoende: autotune ijkt tegen zichzelf.)

---

## Uitkomst vastleggen

In `doc/poly-analog-spec.md` (B2) en het geheugen: geslaagd/gefaald per
route + de gemeten foutcijfers. Bij "A geslaagd" mag de PIO-slave uit het
backbone-risicolijstje; de Pico blijft daarna het dev-platform voor de
backbone-firmware (zelfde chip, code verhuist 1-op-1).
