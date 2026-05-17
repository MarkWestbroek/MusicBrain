# Teensy 4.0 / 4.1 HAL — placeholder

To be populated in roadmap stage 2 (project 1 MVP). Will use PlatformIO + Teensyduino. Will provide concrete:

- `TeensyDisplay` (Adafruit_SSD1306 or LiquidCrystal_I2C)
- `TeensyInputs` (debounced buttons, quadrature encoders, ADC pots)
- `TeensyUsbCdcTransport`
- `TeensyUsbMidiTransport`
- `TeensySpiMaster` (project 3) / `TeensySpiSlave` (breakouts run on RP2040/STM32, not Teensy, so slave is optional)
- `TeensyFlashStore` (LittleFS on QSPI flash)

See [ADR 0001](../../../doc/adr/0001-mcu-choice.md).
