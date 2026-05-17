# CAN‑FD (Controller Area Network — Flexible Data‑rate)

## What it is
A robust **differential, multi‑drop** serial bus originally designed for cars (Bosch, 1986). **Classic CAN** runs at up to 1 Mbit/s with 8‑byte data fields. **CAN‑FD** (2012) extends that: data‑phase bit rate up to 5–8 Mbit/s and data fields up to **64 bytes**.

Two wires (CAN_H, CAN_L) carry a differential signal — excellent noise immunity over long, twisted‑pair cables. The bus is terminated with **120 Ω** at each end (not in the middle). Up to 32+ nodes on one trunk; tens of metres at typical bit rates.

The protocol provides **built‑in arbitration** (lowest ID wins, non‑destructive), **CRC**, **automatic retransmit** on error, and **acknowledgement** by other nodes — features we'd otherwise have to layer on top.

## Why we use it (ADR 0006)
- Stable, deterministic transport between Eurorack cases that can be metres apart.
- Differential signalling tolerates the noisy environment around analog synth gear far better than RS‑232/SPI extended over long cables.
- 64‑byte data field fits our 62‑byte SPI frame exactly — the bridge can map 1‑to‑1.

## What matters for MusicBrain
- **Bridge node** in each case: SPI on one side, CAN‑FD on the other (ADR 0006).
- Need an MCU with a hardware **FDCAN** peripheral (STM32G0/G4/H7) or an external SPI‑attached CAN‑FD controller (MCP2517FD / MCP2518FD).
- Always need a **transceiver chip** (TCAN1051, MCP2562FD, etc.) — the MCU pin can't drive the differential bus directly.
- Topology: linear daisy‑chain trunk with 120 Ω termination at the two physical ends. Star and ring topologies are discouraged.
- Bit rates we'll use: 1 Mbit nominal / 5 Mbit data‑phase is comfortable and well‑supported.

## Gotchas
- **CAN ≠ CAN‑FD**. Classic CAN controllers (e.g. STM32F1 bxCAN) cannot speak FD. Check the part datasheet.
- **CAN‑FD ≠ CAN‑XL**. CAN‑XL (2024) goes further still but is rare in MCUs today.
- **Arbitration uses IDs**: assign IDs carefully so the most time‑sensitive traffic (note‑on, gates) wins arbitration over bulk traffic (patch upload).
- Long cables need correct termination *and* a reasonable propagation‑delay budget — if you go > 10 m, lower the data‑phase rate.
- Two transceivers minimum (one per bus end is already two nodes; we typically have a head + one or more satellites). The "two ends" termination still applies regardless of node count.

## STM32G0 and STM32G4 FDCAN peripheral

Both families implement **Bosch M_CAN IP** under the `FDCAN` peripheral name. This is the recommended silicon for bridge nodes because it is cheap (G0B0/G0C1 < €1.50 at qty-10), has hardware CAN-FD support, and requires only one external transceiver.

### Which variant?

| Series | FDCAN instances | Notes |
|---|---|---|
| STM32G0B0 / G0B1 / G0C1 | **1** | Bridge node: one SPI master + one FDCAN is enough |
| STM32G4 (Cat 2–4) | **2–3** | More compute; useful if a bridge also does modulation math |

For a dedicated bridge (SPI ↔ CAN-FD), the **G0B0/G0C1** is the sweet spot: LQFP-32 or QFN-32, runs at 64 MHz, has DMA, costs almost nothing.

### Getting it running (STM32 HAL, CubeMX generated)

**1. Clock tree**  
FDCAN runs from PCLK1 or HSE/PLL. Set it to a value that gives clean bit-timing divisors for 1 Mbit nominal / 5 Mbit data. CubeMX's bit-timing calculator helps; a common choice is 80 MHz → `NBTP` = 8 TQ brp=1 → 1 Mbit, `DBTP` = 16 TQ brp=1 → 5 Mbit.

**2. Init**
```c
FDCAN_HandleTypeDef hfdcan1;

hfdcan1.Init.ClockDivider        = FDCAN_CLOCK_DIV1;
hfdcan1.Init.FrameFormat         = FDCAN_FRAME_FD_BRS;   // FD + bit-rate switch
hfdcan1.Init.Mode                = FDCAN_MODE_NORMAL;
hfdcan1.Init.AutoRetransmission  = ENABLE;
hfdcan1.Init.TransmitPause       = DISABLE;
hfdcan1.Init.ProtocolException   = ENABLE;
// Nominal 1 Mbit (at 80 MHz, brp=1, seg1=63, seg2=16, sjw=16)
hfdcan1.Init.NominalPrescaler    = 1;
hfdcan1.Init.NominalSyncJumpWidth= 16;
hfdcan1.Init.NominalTimeSeg1     = 63;
hfdcan1.Init.NominalTimeSeg2     = 16;
// Data-phase 5 Mbit (brp=1, seg1=11, seg2=4, sjw=4)
hfdcan1.Init.DataPrescaler       = 1;
hfdcan1.Init.DataSyncJumpWidth   = 4;
hfdcan1.Init.DataTimeSeg1        = 11;
hfdcan1.Init.DataTimeSeg2        = 4;
// Message RAM sizing
hfdcan1.Init.StdFiltersNbr       = 4;
hfdcan1.Init.ExtFiltersNbr       = 0;
hfdcan1.Init.RxFifo0ElmtsNbr    = 8;
hfdcan1.Init.RxFifo0ElmSize     = FDCAN_DATA_BYTES_64;
hfdcan1.Init.TxElmSize           = FDCAN_DATA_BYTES_64;
hfdcan1.Init.TxFifoQueueElmtsNbr = 8;
hfdcan1.Init.TxFifoQueueMode    = FDCAN_TX_FIFO_OPERATION;

HAL_FDCAN_Init(&hfdcan1);
```

**3. Accept-all filter** (or configure acceptance per bridge node ID)
```c
FDCAN_FilterTypeDef filterCfg = {
    .IdType       = FDCAN_STANDARD_ID,
    .FilterIndex  = 0,
    .FilterType   = FDCAN_FILTER_RANGE,
    .FilterConfig = FDCAN_FILTER_TO_RXFIFO0,
    .FilterID1    = 0x000,
    .FilterID2    = 0x7FF,
};
HAL_FDCAN_ConfigFilter(&hfdcan1, &filterCfg);
HAL_FDCAN_ConfigGlobalFilter(&hfdcan1,
    FDCAN_REJECT_REMOTE, FDCAN_REJECT_REMOTE,
    FDCAN_FILTER_REJECT, FDCAN_FILTER_REJECT);
HAL_FDCAN_Start(&hfdcan1);
```

**4. Transmit one SPI frame wrapped in CAN-FD**
```c
FDCAN_TxHeaderTypeDef txHdr = {
    .Identifier          = 0x010,          // assign per ADR 0006 ID scheme
    .IdType              = FDCAN_STANDARD_ID,
    .TxFrameType         = FDCAN_DATA_FRAME,
    .DataLength          = FDCAN_DLC_BYTES_62,  // or the actual frame size
    .ErrorStateIndicator = FDCAN_ESI_ACTIVE,
    .BitRateSwitch       = FDCAN_BRS_ON,
    .FDFormat            = FDCAN_FD_CAN,
    .TxEventFifoControl  = FDCAN_NO_TX_EVENTS,
    .MessageMarker       = 0,
};
HAL_FDCAN_AddMessageToTxFifoQ(&hfdcan1, &txHdr, frame_bytes);
```

**5. Receive**
```c
FDCAN_RxHeaderTypeDef rxHdr;
uint8_t rxData[64];
if (HAL_FDCAN_GetRxMessage(&hfdcan1, FDCAN_RX_FIFO0, &rxHdr, rxData) == HAL_OK) {
    // validate CRC, dispatch opcode
}
```

### Transceiver wiring
The MCU's `FDCAN_TX` / `FDCAN_RX` pins connect to a **TCAN1051HGQ1** (or SN65HVD251) transceiver. The transceiver's `CANH`/`CANL` go to the bus cable. Add a ferrite bead + 100 nF bypass cap at the transceiver supply. 120 Ω termination at each physical bus end.

### Gotchas
- CubeMX will calculate the Message RAM layout automatically; don't exceed the 10 KB of SRAM0 allocated to CAN RAM on G0 — with 8 RX + 8 TX 64-byte elements you're using ~1.5 KB, well within budget.
- **Transceiver enable pin**: some packages have an `STB` (standby) or `EN` pin that must be driven low / high at startup. Don't overlook it or the bus will be silent.
- `FDCAN_BRS_ON` (Bit Rate Switch) must match on **all** nodes. Don't mix classic-CAN nodes and FD nodes on the same segment without a gateway.
- After `HAL_FDCAN_Init`, the peripheral is in **Init mode** — it won't send/receive until `HAL_FDCAN_Start` is called.

## Links
- https://www.bosch-semiconductors.com/ip-modules/can-protocols/can-fd/
- https://en.wikipedia.org/wiki/CAN_FD
- https://www.ti.com/lit/an/sloa101b/sloa101b.pdf — practical CAN physical‑layer notes.
- https://www.st.com/resource/en/reference_manual/rm0444-stm32g0x1-advanced-armbased-32bit-mcus-stmicroelectronics.pdf — RM0444 §34 FDCAN
