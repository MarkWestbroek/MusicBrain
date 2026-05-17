# 16-bit DAC comparison — DAC8568 vs AD5754R vs MAX5134

For pitch CV we need 16-bit resolution so that the quantisation step (≈ 76 µV at ±5 V range) falls well below 1 cent. This page compares the three realistic candidates noted in the BOM discussions, and addresses whether a Sample-and-Hold stage is still needed at 16-bit precision.

> Selected choice: **DAC8568** (ADR 0004), principally for its 8-channel density. The tradeoffs below explain why.

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

## DAC8568 — the choice for MusicBrain

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

## AD5754R — bipolar native

**Pros**
- **Output ranges are hardware-selectable: ±5 V, ±10 V, 0–10 V** — matches Eurorack pitch range (0–8 V typical, ±5 V modulation) with no extra scaling stage.
- No drift-introducing output op-amp; offset and gain registers allow on-chip fine-trim.
- The "R" suffix has an on-chip reference; the non-R needs external.

**Cons**
- **Needs a ±15 V supply** (or at minimum ±12 V) — requires an extra DC-DC converter, adding cost, board area and noise.
- Only 4 channels; two chips for 8 outputs.
- Higher cost.
- Harder to source reliably in small quantities.

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

### Option B — Use the DAC8568 directly (8-channel, no mux/S&H)

**Simpler analog, higher chip cost.**

- DAC8568 has **8 independent outputs**. No mux, no S&H — each channel holds its value until the MCU writes a new one; the on-chip output amp holds the voltage indefinitely.
- Droop = zero. Glitches = zero. Settling time = ~10 µs per channel, irrelevant at human-ear timescales.
- Still need the output op-amp stage for bipolar/range shifting — but that is 8× unity-gain difference amps, nothing exotic.
- **This is what ADR 0004 chooses for the pitch CV bank.**

**Bottom line**: preferable for 16-bit pitch CV.

### Summary recommendation

| Use case | Architecture | Why |
|---|---|---|
| 16-bit pitch CV (≤ 8 channels) | DAC8568 direct | No droop, simpler, one chip |
| 12-bit mod / gate / env (≤ 8 channels) | MCP4922 + CD4051 + S&H | Cheap, established, droop fine |
| 16-bit pitch CV (> 8 channels) | Two DAC8568 on the same SPI bus, different CS | Same architecture, just one more chip |

---

## Links
- https://www.ti.com/lit/ds/symlink/dac8568.pdf
- https://www.analog.com/media/en/technical-documentation/data-sheets/AD5754R.pdf
- https://www.analog.com/media/en/technical-documentation/data-sheets/MAX5134-MAX5137.pdf
- [doc/tech/dac-sh-mux.md](dac-sh-mux.md) — S&H + mux topology overview
- [doc/adr/0004-dac-resolution.md](../adr/0004-dac-resolution.md)
