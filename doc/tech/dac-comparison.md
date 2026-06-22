# 16-bit DAC comparison — DAC8568 vs AD5754R vs MAX5134

For pitch CV we need 16-bit resolution so that the quantisation step (≈ 76 µV at ±5 V range) falls well below 1 cent. This page compares the three realistic candidates noted in the BOM discussions, and addresses whether a Sample-and-Hold stage is still needed at 16-bit precision.

> **Selected choice: AD5754R** (ADR 0004, amended 2026-06-22).
> This page originally selected the **DAC8568** for its 8-channel density and single-supply simplicity, scaling its unipolar 0–5 V output up to Eurorack range with a final op-amp stage. Voortschrijdend inzicht reversed that: the AD5754R's **native, software-selectable bipolar output ranges** (±5 V, ±10 V, 0–10 V, 0–10.8 V) deliver the exact voltages that 1 V/oct *and* Hz/V instruments expect — with no scaling op-amp and therefore no added offset/drift — plus on-chip per-channel offset/gain trim. That directly serves the multi-standard connectivity goal of [ADR 0014](../adr/0014-pitch-formats-and-cv-ranges.md) (Eurorack V/oct alongside a Korg MS-20 on Hz/V + S-Trig). The DAC8568 comparison below is kept for the record; the tradeoffs that flipped the decision are called out in each section.

---

## At a glance

| | DAC8568 | AD5754R | MAX5134 |
|---|---|---|---|
| Manufacturer | Texas Instruments | Analog Devices | Maxim / Analog Devices |
| Channels | **8** | 4 | 4 |
| Resolution | 16-bit | 16-bit | 16-bit |
| Interface | SPI (up to 50 MHz) | SPI (up to 30 MHz) | SPI (up to 50 MHz) |
| Output ranges | Unipolar: 0 → VREF × 2 (max ~5 V with 2.5 V ref) | ±5 V, ±10 V, 0–10 V **bipolar**, selectable per device | Unipolar: 0 → VREF × 2 |
| Supply | 2.7–5.5 V (single) | ±(11.4–16.5 V) for bipolar ranges; ±5 V min | 2.7–5.5 V (single) |
| Internal reference | Yes (1.25 V / 2.5 V, can buffer out to next chip) | Yes (1.25 V) | Yes (1.25 V) |
| Simultaneous update | LDAC pin, all 8 at once | LDAC pin | LDAC pin |
| INL (typ) | ±1 LSB | ±1 LSB | ±1 LSB |
| INL (max) | ±4 LSB | ±4 LSB | ±4 LSB |
| Settling time (full scale) | ~10 µs (to 0.5 LSB) | ~10 µs | ~10 µs |
| Package | TSSOP-24, QFN-24 | SSOP-28 | TSSOP-24 |
| Price (qty-1 approx) | €5–8 | €12–18 | €8–12 |

---

## DAC8568 — the original pick (since superseded)

> Superseded by the AD5754R. Strong on density and supply simplicity, but unipolar-only: it cannot reach Eurorack/MS-20 voltages without an external op-amp scaling stage, which reintroduces the offset/drift a 16-bit pitch path is trying to avoid.

**Pros**
- **8 channels in one chip** — drives 8 CVs directly; halves the chip count vs. 4-channel alternatives.
- Single-supply (same 3.3 V / 5 V rail as the MCU); no ±15 V generation circuitry.
- Internal 2.5 V reference with output buffer — can daisy-chain the reference to the next DAC8568 on the board.
- LDAC allows atomic simultaneous update of all 8 outputs.
- Well documented, widespread availability (DigiKey, Mouser, LCSC).

**Cons**
- Unipolar output only (0 V → ~5 V). You need a **final op-amp stage** (inverting/non-inverting summing) to shift to the ±5 V or ±10 V range Eurorack expects for pitch CV.
- The op-amp stage introduces its own offset/drift — must calibrate.

---

## AD5754R — bipolar native — **the choice for MusicBrain**

**Pros**
- **Output ranges are software-selectable per channel: ±5 V, ±10 V, 0–10 V, 0–10.8 V** — matches Eurorack pitch range (0–8 V typical, ±5 V modulation) *and* gives the headroom Hz/V high notes need, with no extra scaling stage. Re-rangeable in firmware to suit whatever is patched in (ADR 0014).
- No drift-introducing output op-amp; on-chip per-channel offset and gain registers give a hardware coarse-trim under the software calibration table — valuable for per-unit Hz/V drift (e.g. Korg MS-20).
- DC-stable and audio-rate capable (SPI to 30 MHz, ~10 µs settling): same part can hold a steady V/oct pitch or, on a fast channel, double as a bipolar audio-rate source.
- The "R" suffix has an on-chip 2.5 V reference; the non-R needs external.

**Cons (accepted)**
- **Needs a ±12 V…±15 V analog supply** (AVDD/AVSS) — an extra bipolar rail vs. the single-supply DAC8568. The rack already provides ±12 V, so this is a layout/noise concern, not a blocker.
- Only 4 channels; two chips for 8 pitch outputs.
- Higher per-chip cost — but it absorbs the per-channel bipolar op-amp stage the DAC8568 would have required, so parts count nets out closer than the sticker price suggests.

---

## MAX5134 — mid-tier option

**Pros**
- Similar price/channel to DAC8568.
- Daisy-chainable SPI (24-bit word, fits many MCU SPI framing assumptions).
- Well-behaved single-supply part.

**Cons**
- Only 4 channels; two chips for 8 outputs.
- Unipolar — same output-stage problem as DAC8568.
- No real advantage over DAC8568 for this application.
- Maxim's supply chain absorbed into Analog Devices; occasional availability gaps.

---

## S&H with 16-bit DACs — is it still needed?

At 12-bit precision the S&H + CD4051 mux trick (one cheap DAC drives 8 channels) saves significant silicon cost. At 16-bit the question is more nuanced.

### Option A — Keep the S&H + mux architecture

**Works, but demands tighter hardware.**

- Hold-capacitor droop becomes the limiting factor. A 100 nF C0G cap with a JFET op-amp (TL071, OPA134) will drift ~mV/ms. At 200 µs refresh intervals, droop is ~0.5 µV/200 µs — 10 pF leakage × 500 mV/µs is far smaller — effectively negligible *if* the capacitor and switch leakage are good.
- Mux **charge injection** (the CD4051 switches ~10 pC per switching event) injects a spike proportional to `Q/C`. With 100 nF that's ≈ 0.1 mV per switch — 1.3 LSB at 16-bit into 5 V. Add a small (10 Ω) series resistor and let the cap re-settle before unselecting INH.
- **The SMP08** (8-channel S&H in one DIP-16) is the convenient single-chip solution from the original diagram. Out of production; track down old stock or use 8× TL071 + 8× ADG419 switch + 8× 100 nF C0G.
- Refresh rate requirement stays the same (ADR 0008: 20–50 kHz interpolation loop).

**Bottom line**: architecturally valid at 16-bit but requires careful PCB layout and component selection. Fine for a prototype; borderline for a product.

### Option B — Use a multi-channel 16-bit DAC directly (no mux/S&H)

**Simpler analog, higher chip cost.**

- A direct-drive DAC gives **one independent output per channel**. No mux, no S&H — each channel holds its value until the MCU writes a new one; the on-chip output amp holds the voltage indefinitely.
- Droop = zero. Glitches = zero. Settling time = ~10 µs per channel, irrelevant at human-ear timescales.
- With the **AD5754R** there is no output op-amp stage at all: the bipolar range is selected on-chip, so the DAC pin drives the jack directly. (With the unipolar DAC8568 you would still need an 8× difference-amp stage for bipolar/range shifting — the very stage the AD5754R makes unnecessary.)
- **This is what ADR 0004 chooses for the pitch CV bank** (AD5754R, 4 channels per chip).

**Bottom line**: preferable for 16-bit pitch CV.

### Summary recommendation

| Use case | Architecture | Why |
|---|---|---|
| 16-bit pitch CV (≤ 4 channels) | AD5754R direct | Native bipolar ranges, no op-amp, on-chip trim, no droop |
| 12-bit mod / gate / env (≤ 8 channels) | MCP4922 + CD4051 + S&H | Cheap, established, droop fine |
| 16-bit pitch CV (> 4 channels) | Two AD5754R on the same SPI bus, different CS | Same architecture, just one more chip |

---

## Links
- https://www.ti.com/lit/ds/symlink/dac8568.pdf
- https://www.analog.com/media/en/technical-documentation/data-sheets/AD5754R.pdf
- https://www.analog.com/media/en/technical-documentation/data-sheets/MAX5134-MAX5137.pdf
- [doc/tech/dac-sh-mux.md](dac-sh-mux.md) — S&H + mux topology overview
- [doc/adr/0004-dac-resolution.md](../adr/0004-dac-resolution.md)
