#!/usr/bin/env python3
"""Generate KiCad 8 files for the AD5754BREZ minimal DAC breakout board.
AD5754BREZ = TSSOP-24, non-R variant (no internal reference, REFIN pin).
ADR421 external 2.5V reference is MANDATORY for this chip.

Outputs: .kicad_sch, .kicad_pcb, .kicad_pro — all with guaranteed
parenthesis-balanced S-expression syntax."""

from pathlib import Path
import json

OUT_DIR = Path(r"d:\Git\Muziek\MusicBrain\Images\schematics\ad5754r-breakout")

# ── AD5754BREZ TSSOP-24 Pinout (from datasheet Table 5) ────────────────
# Pin  1: AVSS       - Negative analog supply (-12V)
# Pin  2: NC         - No connect
# Pin  3: VOUTA      - DAC A output
# Pin  4: VOUTB      - DAC B output
# Pin  5: BIN/2sCOMP - Coding select (GND = twos complement)
# Pin  6: NC         - No connect
# Pin  7: SYNC       - SPI CS (active low)
# Pin  8: SCLK       - SPI clock
# Pin  9: SDIN       - SPI data in
# Pin 10: LDAC       - Load DAC (GND = immediate update)
# Pin 11: CLR        - Clear (active low, -> DVCC via 10k)
# Pin 12: NC         - No connect
# Pin 13: NC         - No connect
# Pin 14: DVCC       - Digital supply (+3.3V)
# Pin 15: GND        - Ground reference
# Pin 16: SDO        - SPI data out
# Pin 17: REFIN      - External reference input (ADR421 VOUT -> here)
# Pin 18: DAC_GND   - DAC ground
# Pin 19: DAC_GND   - DAC ground
# Pin 20: SIG_GND   - Output amplifier ground
# Pin 21: SIG_GND   - Output amplifier ground
# Pin 22: VOUTD      - DAC D output
# Pin 23: VOUTC      - DAC C output
# Pin 24: AVDD       - Positive analog supply (+12V)
# Exposed paddle: AVSS (thermally connect to copper plane)


def _make_builder():
    """Create a fresh S-expression builder with tracked paren depth."""
    lines = []
    _depth = [0]

    def o(tag, *args):
        inner = " " + " ".join(str(a) for a in args) if args else ""
        lines.append("  " * _depth[0] + f"({tag}{inner}")
        _depth[0] += 1

    def c():
        _depth[0] -= 1
        lines.append("  " * _depth[0] + ")")

    def r(text):
        lines.append("  " * _depth[0] + text)

    def sym(lib_id, at_str, unit=1):
        o("symbol")
        r(f'(lib_id "{lib_id}")')
        r(f'(at {at_str})')
        r(f'(unit {unit})')

    def pin(etype, shape, at_str, length, name, number, angle=None, hide_name=False):
        hn = " (hide yes)" if hide_name else ""
        indent = "  " * _depth[0]
        angle_str = f" {angle}" if angle is not None else ""
        lines.append(
            f'{indent}(pin {etype} {shape} (at {at_str}{angle_str}) (length {length})\n'
            f'{indent}  (name "{name}" (effects (font (size 1.27 1.27)){hn}))\n'
            f'{indent}  (number "{number}" (effects (font (size 1.0 1.0))))'
        )
        lines.append(f"{indent})")

    def prop(key, value, at_str="0 0 0", font="1.27 1.27", hide=False):
        hide_str = " (hide yes)" if hide else ""
        indent = "  " * _depth[0]
        lines.append(
            f'{indent}(property "{key}" "{value}" (at {at_str}) '
            f'(effects (font (size {font})){hide_str}))'
        )

    return lines, _depth, o, c, r, sym, pin, prop


def gen_sch():
    """Generate the .kicad_sch file."""
    lines, _depth, o, c, r, sym, pin, prop = _make_builder()

    # ── Root ──
    o("kicad_sch")
    r('(version 20231120)')
    r('(generator "eeschema")')
    r('(generator_version "8.0")')
    r('(uuid "mb000003-0000-0000-0000-000000000001")')
    r('(paper "A4" portrait)')

    # ── lib_symbols ──
    o("lib_symbols")

    # ── Device:R ──
    o("symbol", '"Device:R"')
    r("(pin_names (offset 0))")
    r("(pin_numbers (hide yes))")
    prop("Reference", "R", "1.016 0 90")
    prop("Value", "R", "-1.016 0 90")
    prop("Footprint", "", "0 0 0", hide=True)
    prop("Datasheet", "", "0 0 0", hide=True)
    o("symbol", '"R_0_1"')
    r('(polyline (pts (xy -1.016 -2.032) (xy 1.016 -2.032) (xy 1.016 2.032) (xy -1.016 2.032) (xy -1.016 -2.032))\n      (stroke (width 0) (type default)) (fill (type none)))')
    c()
    o("symbol", '"R_1_1"')
    pin("passive", "line", "0 3.81", "1.778", "~", "1", angle="270")
    pin("passive", "line", "0 -3.81", "1.778", "~", "2", angle="90")
    c()
    c()

    # ── Device:C ──
    o("symbol", '"Device:C"')
    r("(pin_names (offset 0.254))")
    prop("Reference", "C", "1.524 0 90")
    prop("Value", "C", "-1.524 0 90")
    prop("Footprint", "", "0 0 0", hide=True)
    prop("Datasheet", "", "0 0 0", hide=True)
    o("symbol", '"C_0_1"')
    r('(polyline (pts (xy -2.032 -0.762) (xy 2.032 -0.762))\n      (stroke (width 0.508) (type default)) (fill (type none)))')
    r('(polyline (pts (xy -2.032 0.762) (xy 2.032 0.762))\n      (stroke (width 0.508) (type default)) (fill (type none)))')
    c()
    o("symbol", '"C_1_1"')
    pin("passive", "line", "0 3.81", "3.048", "~", "1", angle="270")
    pin("passive", "line", "0 -3.81", "3.048", "~", "2", angle="90")
    c()
    c()

    # ── Device:C_Polarized ──
    o("symbol", '"Device:C_Polarized"')
    r("(pin_names (offset 0.254))")
    prop("Reference", "C", "1.524 0 90")
    prop("Value", "C_Polarized", "-1.524 0 90")
    prop("Footprint", "", "0 0 0", hide=True)
    prop("Datasheet", "", "0 0 0", hide=True)
    o("symbol", '"C_Polarized_0_1"')
    r('(rectangle (start -2.032 0.762) (end 2.032 -0.762)\n      (stroke (width 0.508) (type default)) (fill (type none)))')
    r('(polyline (pts (xy -2.032 -1.524) (xy 2.032 -1.524))\n      (stroke (width 0.508) (type default)) (fill (type none)))')
    r('(polyline (pts (xy -1.27 -0.762) (xy -1.27 0.762))\n      (stroke (width 0.254) (type default)) (fill (type none)))')
    c()
    o("symbol", '"C_Polarized_1_1"')
    pin("passive", "line", "0 3.81", "2.286", "+", "1", angle="270")
    pin("passive", "line", "0 -3.81", "2.286", "-", "2", angle="90")
    c()
    c()

    # ── Custom:AD5754BREZ (TSSOP-24) ──
    o("symbol", '"Custom:AD5754BREZ"')
    prop("Reference", "U", "0 16.51 0")
    prop("Value", "AD5754BREZ", "0 -16.51 0")
    prop("Footprint", "Package_SO:TSSOP-24_4.4x7.8mm_P0.65mm", "0 0 0", hide=True)
    prop("Datasheet", "https://www.analog.com/media/en/technical-documentation/data-sheets/AD5724_5734_5754.pdf", "0 0 0", hide=True)
    o("symbol", '"AD5754BREZ_0_1"')
    r('(rectangle (start -7.62 15.24) (end 7.62 -15.24)\n      (stroke (width 0.254) (type default)) (fill (type background)))')
    c()
    o("symbol", '"AD5754BREZ_1_1"')
    # Left side pins (1-12)
    pin("power_in",  "line", "-10.16 14.28",  "2.54", "AVSS",      "1",  angle="0")
    pin("no_connect","line", "-10.16 11.74",  "2.54", "NC",        "2",  angle="0", hide_name=True)
    pin("output",    "line", "-10.16 9.20",   "2.54", "VOUTA",     "3",  angle="0")
    pin("output",    "line", "-10.16 6.66",   "2.54", "VOUTB",     "4",  angle="0")
    pin("input",     "line", "-10.16 4.12",   "2.54", "BIN/2sCOMP","5",  angle="0")
    pin("no_connect","line", "-10.16 1.58",   "2.54", "NC",        "6",  angle="0", hide_name=True)
    pin("input",     "line", "-10.16 -1.02",  "2.54", "SYNC",      "7",  angle="0")
    pin("input",     "line", "-10.16 -3.56",  "2.54", "SCLK",      "8",  angle="0")
    pin("input",     "line", "-10.16 -6.10",  "2.54", "SDIN",      "9",  angle="0")
    pin("input",     "line", "-10.16 -8.64",  "2.54", "LDAC",      "10", angle="0")
    pin("input",     "line", "-10.16 -11.18", "2.54", "CLR",       "11", angle="0")
    pin("no_connect","line", "-10.16 -13.72", "2.54", "NC",        "12", angle="0", hide_name=True)
    # Right side pins (13-24)
    pin("no_connect","line", "10.16 -13.72",  "2.54", "NC",        "13", angle="180", hide_name=True)
    pin("power_in",  "line", "10.16 -11.18",  "2.54", "DVCC",      "14", angle="180")
    pin("power_in",  "line", "10.16 -8.64",   "2.54", "GND",       "15", angle="180")
    pin("output",    "line", "10.16 -6.10",   "2.54", "SDO",       "16", angle="180")
    pin("input",     "line", "10.16 -3.56",   "2.54", "REFIN",     "17", angle="180")
    pin("power_in",  "line", "10.16 -1.02",   "2.54", "DAC_GND",   "18", angle="180")
    pin("power_in",  "line", "10.16 1.58",    "2.54", "DAC_GND",   "19", angle="180")
    pin("power_in",  "line", "10.16 4.12",    "2.54", "SIG_GND",   "20", angle="180")
    pin("power_in",  "line", "10.16 6.66",    "2.54", "SIG_GND",   "21", angle="180")
    pin("output",    "line", "10.16 9.20",    "2.54", "VOUTD",     "22", angle="180")
    pin("output",    "line", "10.16 11.74",   "2.54", "VOUTC",     "23", angle="180")
    pin("power_in",  "line", "10.16 14.28",   "2.54", "AVDD",      "24", angle="180")
    c()
    c()

    # ── Custom:ADR421 ──
    o("symbol", '"Custom:ADR421"')
    prop("Reference", "U", "0 7.62 0")
    prop("Value", "ADR421", "0 -7.62 0")
    prop("Footprint", "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm", "0 0 0", hide=True)
    prop("Datasheet", "https://www.analog.com/media/en/technical-documentation/data-sheets/ADR420_421_423_425.pdf", "0 0 0", hide=True)
    o("symbol", '"ADR421_0_1"')
    r('(rectangle (start -5.08 6.35) (end 5.08 -6.35)\n      (stroke (width 0.254) (type default)) (fill (type background)))')
    c()
    o("symbol", '"ADR421_1_1"')
    pin("no_connect", "line", "-7.62 5.08",  "2.54", "NC",   "1", angle="0", hide_name=True)
    pin("power_in",   "line", "-7.62 2.54",  "2.54", "VIN",  "2", angle="0")
    pin("no_connect", "line", "-7.62 0.00",  "2.54", "NC",   "3", angle="0", hide_name=True)
    pin("power_in",   "line", "-7.62 -2.54", "2.54", "GND",  "4", angle="0")
    pin("no_connect", "line", "7.62 -2.54",  "2.54", "NC",   "5", angle="180", hide_name=True)
    pin("no_connect", "line", "7.62 0.00",   "2.54", "NC",   "6", angle="180", hide_name=True)
    pin("no_connect", "line", "7.62 2.54",   "2.54", "NC",   "7", angle="180", hide_name=True)
    pin("output",     "line", "7.62 5.08",   "2.54", "VOUT", "8", angle="180")
    c()
    c()

    # ── Connector_Generic:Conn_01x10 ──
    o("symbol", '"Connector_Generic:Conn_01x10"')
    r("(pin_names (offset 1.016) (hide yes))")
    r("(pin_numbers (hide yes))")
    prop("Reference", "J", "0 12.7 0")
    prop("Value", "Conn_01x10", "0 -12.7 0")
    prop("Footprint", "", "0 0 0", hide=True)
    prop("Datasheet", "", "0 0 0", hide=True)
    o("symbol", '"Conn_01x10_0_1"')
    r('(rectangle (start -1.27 -11.43) (end 0 11.43)\n      (stroke (width 0.254) (type default)) (fill (type background)))')
    c()
    o("symbol", '"Conn_01x10_1_1"')
    pin("passive", "line", "-2.54 10.16",  "1.27", "Pin_1",  "1",  angle="0")
    pin("passive", "line", "-2.54 7.62",   "1.27", "Pin_2",  "2",  angle="0")
    pin("passive", "line", "-2.54 5.08",   "1.27", "Pin_3",  "3",  angle="0")
    pin("passive", "line", "-2.54 2.54",   "1.27", "Pin_4",  "4",  angle="0")
    pin("passive", "line", "-2.54 0.00",   "1.27", "Pin_5",  "5",  angle="0")
    pin("passive", "line", "-2.54 -2.54",  "1.27", "Pin_6",  "6",  angle="0")
    pin("passive", "line", "-2.54 -5.08",  "1.27", "Pin_7",  "7",  angle="0")
    pin("passive", "line", "-2.54 -7.62",  "1.27", "Pin_8",  "8",  angle="0")
    pin("passive", "line", "-2.54 -10.16", "1.27", "Pin_9",  "9",  angle="0")
    pin("passive", "line", "-2.54 -12.70", "1.27", "Pin_10", "10", angle="0")
    c()
    c()

    # ── Connector_Generic:Conn_01x04 ──
    o("symbol", '"Connector_Generic:Conn_01x04"')
    r("(pin_names (offset 1.016) (hide yes))")
    r("(pin_numbers (hide yes))")
    prop("Reference", "J", "0 5.08 0")
    prop("Value", "Conn_01x04", "0 -5.08 0")
    prop("Footprint", "", "0 0 0", hide=True)
    prop("Datasheet", "", "0 0 0", hide=True)
    o("symbol", '"Conn_01x04_0_1"')
    r('(rectangle (start -1.27 -3.81) (end 0 3.81)\n      (stroke (width 0.254) (type default)) (fill (type background)))')
    c()
    o("symbol", '"Conn_01x04_1_1"')
    pin("passive", "line", "-2.54 2.54",  "1.27", "Pin_1", "1", angle="0")
    pin("passive", "line", "-2.54 0.00",  "1.27", "Pin_2", "2", angle="0")
    pin("passive", "line", "-2.54 -2.54", "1.27", "Pin_3", "3", angle="0")
    pin("passive", "line", "-2.54 -5.08", "1.27", "Pin_4", "4", angle="0")
    c()
    c()

    # ── power:GND ──
    o("symbol", '"power:GND"')
    prop("Reference", "#PWR", "0 -1.27 0", hide=True)
    prop("Value", "GND", "0 -2.54 0")
    o("symbol", '"GND_0_1"')
    r('(polyline (pts (xy 0 0) (xy 0 -1.27)) (stroke (width 0) (type default)) (fill (type none)))')
    r('(polyline (pts (xy -1.27 -1.27) (xy 1.27 -1.27)) (stroke (width 0) (type default)) (fill (type none)))')
    r('(polyline (pts (xy -0.762 -1.778) (xy 0.762 -1.778)) (stroke (width 0) (type default)) (fill (type none)))')
    r('(polyline (pts (xy -0.254 -2.286) (xy 0.254 -2.286)) (stroke (width 0) (type default)) (fill (type none)))')
    c()
    o("symbol", '"GND_1_1"')
    pin("power_in", "line", "0 0", "0", "GND", "1", angle="270", hide_name=True)
    c()
    c()

    # ── power:+12V ──
    o("symbol", '"power:+12V"')
    prop("Reference", "#PWR", "0 3.302 0", hide=True)
    prop("Value", "+12V", "0 3.302 0")
    o("symbol", '"+12V_0_1"')
    r('(polyline (pts (xy 0 0) (xy 0 1.27)) (stroke (width 0) (type default)) (fill (type none)))')
    r('(polyline (pts (xy -0.762 1.27) (xy 0 2.54) (xy 0.762 1.27)) (stroke (width 0) (type default)) (fill (type none)))')
    c()
    o("symbol", '"+12V_1_1"')
    pin("power_in", "line", "0 0", "0", "+12V", "1", angle="270", hide_name=True)
    c()
    c()

    # ── power:-12V ──
    o("symbol", '"power:-12V"')
    prop("Reference", "#PWR", "0 -3.302 0", hide=True)
    prop("Value", "-12V", "0 -3.302 0")
    o("symbol", '"-12V_0_1"')
    r('(polyline (pts (xy 0 0) (xy 0 -1.27)) (stroke (width 0) (type default)) (fill (type none)))')
    r('(polyline (pts (xy -0.762 -1.27) (xy 0 -2.54) (xy 0.762 -1.27)) (stroke (width 0) (type default)) (fill (type none)))')
    c()
    o("symbol", '"-12V_1_1"')
    pin("power_in", "line", "0 0", "0", "-12V", "1", angle="90", hide_name=True)
    c()
    c()

    # ── power:+3V3 ──
    o("symbol", '"power:+3V3"')
    prop("Reference", "#PWR", "0 3.302 0", hide=True)
    prop("Value", "+3V3", "0 3.302 0")
    o("symbol", '"+3V3_0_1"')
    r('(polyline (pts (xy 0 0) (xy 0 1.27)) (stroke (width 0) (type default)) (fill (type none)))')
    r('(polyline (pts (xy -0.762 1.27) (xy 0 2.54) (xy 0.762 1.27)) (stroke (width 0) (type default)) (fill (type none)))')
    c()
    o("symbol", '"+3V3_1_1"')
    pin("power_in", "line", "0 0", "0", "+3V3", "1", angle="270", hide_name=True)
    c()
    c()

    c()  # close lib_symbols

    # ── Net labels ──
    r('(label "SCLK" (at 55 80 0) (effects (font (size 1.27 1.27)) (justify left)))')
    r('(label "SDIN" (at 55 85 0) (effects (font (size 1.27 1.27)) (justify left)))')
    r('(label "SDO" (at 55 90 0) (effects (font (size 1.27 1.27)) (justify left)))')
    r('(label "SYNC" (at 55 95 0) (effects (font (size 1.27 1.27)) (justify left)))')
    r('(label "VOUTA" (at 55 40 0) (effects (font (size 1.27 1.27)) (justify left)))')
    r('(label "VOUTB" (at 55 45 0) (effects (font (size 1.27 1.27)) (justify left)))')
    r('(label "VOUTC" (at 55 50 0) (effects (font (size 1.27 1.27)) (justify left)))')
    r('(label "VOUTD" (at 55 55 0) (effects (font (size 1.27 1.27)) (justify left)))')
    r('(label "REFIN" (at 130 40 0) (effects (font (size 1.27 1.27)) (justify left)))')

    # ── U1 — AD5754BREZ ──
    sym("Custom:AD5754BREZ", "80 65 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-000000000001\")")
    prop("Reference", "U1", "80 45 0")
    prop("Value", "AD5754BREZ", "80 88 0")
    prop("Footprint", "Package_SO:TSSOP-24_4.4x7.8mm_P0.65mm", "0 0 0", hide=True)
    c()

    # ── Power symbols ──
    sym("power:+12V", "95 47 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-000000000002\")")
    prop("Reference", "#PWR01", "95 47 0", hide=True)
    prop("Value", "+12V", "95 44 0")
    c()

    sym("power:-12V", "65 47 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-000000000003\")")
    prop("Reference", "#PWR02", "65 47 0", hide=True)
    prop("Value", "-12V", "65 50 0")
    c()

    sym("power:+3V3", "95 67 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-000000000004\")")
    prop("Reference", "#PWR03", "95 67 0", hide=True)
    prop("Value", "+3V3", "95 64 0")
    c()

    sym("power:GND", "65 77 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-000000000005\")")
    prop("Reference", "#PWR04", "65 77 0", hide=True)
    prop("Value", "GND", "65 80 0")
    c()

    # ── Decoupling capacitors ──
    sym("Device:C_Polarized", "100 50 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-000000000008\")")
    prop("Reference", "C1", "103 50 0")
    prop("Value", "10uF", "103 53 0")
    prop("Footprint", "Capacitor_SMD:CP_Elec_4x5.3", "0 0 0", hide=True)
    c()

    sym("Device:C", "110 50 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-000000000009\")")
    prop("Reference", "C2", "113 50 0")
    prop("Value", "100nF", "113 53 0")
    prop("Footprint", "Capacitor_SMD:C_0805_2012Metric", "0 0 0", hide=True)
    c()

    sym("Device:C_Polarized", "60 50 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-00000000000a\")")
    prop("Reference", "C3", "63 50 0")
    prop("Value", "10uF", "63 53 0")
    prop("Footprint", "Capacitor_SMD:CP_Elec_4x5.3", "0 0 0", hide=True)
    c()

    sym("Device:C", "50 50 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-00000000000b\")")
    prop("Reference", "C4", "53 50 0")
    prop("Value", "100nF", "53 53 0")
    prop("Footprint", "Capacitor_SMD:C_0805_2012Metric", "0 0 0", hide=True)
    c()

    sym("Device:C", "100 70 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-00000000000c\")")
    prop("Reference", "C5", "103 70 0")
    prop("Value", "100nF", "103 73 0")
    prop("Footprint", "Capacitor_SMD:C_0805_2012Metric", "0 0 0", hide=True)
    c()

    sym("Device:C", "130 45 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-00000000000d\")")
    prop("Reference", "C6", "133 45 0")
    prop("Value", "100nF", "133 48 0")
    prop("Footprint", "Capacitor_SMD:C_0805_2012Metric", "0 0 0", hide=True)
    c()

    # ── Resistors ──
    # R1 — 10k CLR pull-up (pin 11 -> DVCC)
    sym("Device:R", "95 60 90")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-00000000000e\")")
    prop("Reference", "R1", "95 57 0")
    prop("Value", "10k", "95 63 0")
    prop("Footprint", "Resistor_SMD:R_0805_2012Metric", "0 0 0", hide=True)
    c()

    # R2-R5 — 100R VOUT series protection
    sym("Device:R", "55 40 90")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-000000000010\")")
    prop("Reference", "R2", "55 37 0")
    prop("Value", "100R", "55 43 0")
    prop("Footprint", "Resistor_SMD:R_0805_2012Metric", "0 0 0", hide=True)
    c()

    sym("Device:R", "55 45 90")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-000000000011\")")
    prop("Reference", "R3", "55 42 0")
    prop("Value", "100R", "55 48 0")
    prop("Footprint", "Resistor_SMD:R_0805_2012Metric", "0 0 0", hide=True)
    c()

    sym("Device:R", "55 50 90")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-000000000012\")")
    prop("Reference", "R4", "55 47 0")
    prop("Value", "100R", "55 53 0")
    prop("Footprint", "Resistor_SMD:R_0805_2012Metric", "0 0 0", hide=True)
    c()

    sym("Device:R", "55 55 90")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-000000000013\")")
    prop("Reference", "R5", "55 52 0")
    prop("Value", "100R", "55 58 0")
    prop("Footprint", "Resistor_SMD:R_0805_2012Metric", "0 0 0", hide=True)
    c()

    # ── LDAC -> GND (pin 10) ──
    sym("power:GND", "95 70 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-000000000014\")")
    prop("Reference", "#PWR07", "95 70 0", hide=True)
    prop("Value", "GND", "97 68 0")
    c()

    # ── BIN/2sCOMP -> GND (pin 5, twos complement coding) ──
    sym("power:GND", "65 62 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0001-0001-0001-000000000015\")")
    prop("Reference", "#PWR08", "65 62 0", hide=True)
    prop("Value", "GND", "67 60 0")
    c()

    # ── NC pins on AD5754BREZ ──
    r('(no_connect (at 69.84 76.26) (uuid "mb000003-nc01"))')
    r('(no_connect (at 69.84 66.58) (uuid "mb000003-nc02"))')
    r('(no_connect (at 69.84 51.28) (uuid "mb000003-nc03"))')
    r('(no_connect (at 90.16 51.28) (uuid "mb000003-nc04"))')

    # ── U2 — ADR421 (MANDATORY for AD5754BREZ) ──
    sym("Custom:ADR421", "130 55 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0002-0002-0002-000000000001\")")
    prop("Reference", "U2", "130 47 0")
    prop("Value", "ADR421", "130 63 0")
    prop("Footprint", "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm", "0 0 0", hide=True)
    c()

    sym("power:+12V", "122 57 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0002-0002-0002-000000000002\")")
    prop("Reference", "#PWR10", "122 57 0", hide=True)
    prop("Value", "+12V", "122 54 0")
    c()

    sym("power:GND", "122 52 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0002-0002-0002-000000000003\")")
    prop("Reference", "#PWR11", "122 52 0", hide=True)
    prop("Value", "GND", "122 55 0")
    c()

    sym("Device:C", "120 60 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0002-0002-0002-000000000004\")")
    prop("Reference", "C7", "123 60 0")
    prop("Value", "100nF", "123 63 0")
    prop("Footprint", "Capacitor_SMD:C_0805_2012Metric", "0 0 0", hide=True)
    c()

    sym("Device:C_Polarized", "140 50 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0002-0002-0002-000000000005\")")
    prop("Reference", "C8", "143 50 0")
    prop("Value", "10uF", "143 53 0")
    prop("Footprint", "Capacitor_SMD:CP_Elec_4x5.3", "0 0 0", hide=True)
    c()

    # ── NC pins on ADR421 ──
    r('(no_connect (at 122.46 60.08) (uuid "mb000003-nc05"))')
    r('(no_connect (at 122.46 55.00) (uuid "mb000003-nc06"))')
    r('(no_connect (at 137.54 52.46) (uuid "mb000003-nc07"))')
    r('(no_connect (at 137.54 55.00) (uuid "mb000003-nc08"))')
    r('(no_connect (at 137.54 57.54) (uuid "mb000003-nc09"))')

    # ── J2 — DAC output connector ──
    sym("Connector_Generic:Conn_01x04", "40 47 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0003-0003-0003-000000000001\")")
    prop("Reference", "J2", "40 41 0")
    prop("Value", "DAC Outputs", "40 53 0")
    prop("Footprint", "Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical", "0 0 0", hide=True)
    c()

    # ── J1 — SPI+Power connector ──
    sym("Connector_Generic:Conn_01x10", "30 100 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0003-0003-0003-000000000002\")")
    prop("Reference", "J1", "30 87 0")
    prop("Value", "SPI+Power", "30 115 0")
    prop("Footprint", "Connector_PinHeader_2.54mm:PinHeader_2x05_P2.54mm_Vertical", "0 0 0", hide=True)
    c()

    # ── Power symbols for J1 ──
    sym("power:+12V", "27 90 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0003-0003-0003-000000000003\")")
    prop("Reference", "#PWR12", "27 90 0", hide=True)
    prop("Value", "+12V", "27 87 0")
    c()

    sym("power:-12V", "27 92 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0003-0003-0003-000000000004\")")
    prop("Reference", "#PWR13", "27 92 0", hide=True)
    prop("Value", "-12V", "27 95 0")
    c()

    sym("power:+3V3", "27 95 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0003-0003-0003-000000000005\")")
    prop("Reference", "#PWR14", "27 95 0", hide=True)
    prop("Value", "+3V3", "25 92 0")
    c()

    sym("power:GND", "27 97 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0003-0003-0003-000000000006\")")
    prop("Reference", "#PWR15", "27 97 0", hide=True)
    prop("Value", "GND", "27 100 0")
    c()

    sym("power:GND", "27 113 0")
    r("(in_bom yes) (on_board yes) (uuid \"mb000003-0003-0003-0003-000000000007\")")
    prop("Reference", "#PWR16", "27 113 0", hide=True)
    prop("Value", "GND", "27 116 0")
    c()

    # ── Text annotations ──
    r('(text "AD5754BREZ Minimal DAC Breakout" (at 30 30 0)\n    (effects (font (size 2.54 2.54) bold) (justify left)))')
    r('(text "Quad 16-bit DAC - Bipolar +/-5V mode\\nTSSOP-24 package, SPI interface\\nAD5754BREZ (non-R, no internal ref)\\nDesigned for JLCPCB PCBA assembly" (at 30 35 0)\n    (effects (font (size 1.27 1.27)) (justify left)))')
    r('(text "Power:\\n  AVDD = +12V (Eurorack)\\n  AVSS = -12V (Eurorack)\\n  DVCC = +3.3V (Teensy)\\n  All GND/DAC_GND/SIG_GND to unified ground plane\\n  Exposed paddle = AVSS (thermal)" (at 30 120 0)\n    (effects (font (size 1.016 1.016)) (justify left)))')
    r('(text "SPI (Teensy 4.1):\\n  SCLK  -> Pin 13 (SCK)\\n  SDIN  -> Pin 11 (MOSI)\\n  SDO   -> Pin 12 (MISO)\\n  SYNC  -> Pin 10 (CS)\\n  SPI Mode 1 (CPOL=0, CPHA=1)" (at 30 135 0)\n    (effects (font (size 1.016 1.016)) (justify left)))')
    r('(text "Control pins:\\n  LDAC -> GND (immediate update)\\n  CLR  -> DVCC via 10k (no accidental clear)\\n  BIN/2sCOMP -> GND (twos complement coding)\\n  NC pins 2,6,12,13: leave unconnected" (at 100 120 0)\n    (effects (font (size 1.016 1.016)) (justify left)))')
    r('(text "Outputs:\\n  VOUTA-D -> 100R series -> header\\n  (short-circuit protection)\\n  +/-5V bipolar range (software config)\\n  0x0000=-5V, 0x8000=0V, 0xFFFF=+5V" (at 100 135 0)\n    (effects (font (size 1.016 1.016)) (justify left)))')
    r('(text "ADR421 Reference (MANDATORY):\\n  AD5754BREZ has NO internal reference\\n  ADR421 provides 2.5V ultra-precision (3 ppm/C)\\n  VOUT -> REFIN pin 17\\n  Cannot omit U2 on this chip variant!" (at 100 150 0)\n    (effects (font (size 1.016 1.016)) (justify left)))')
    r('(text "NOTE: This is the AD5754BREZ (TSSOP-24)\\nNOT the AD5754R (SSOP-28). Pinout is\\ndifferent! See datasheet Table 5.\\nNo RSET, no DCEN, no BIN/OFF pin." (at 30 155 0)\n    (effects (font (size 1.016 1.016) bold) (justify left)))')

    # ── Title block ──
    o("title_block")
    r('(title "MusicBrain - AD5754BREZ Minimal DAC Breakout Board")')
    r('(date "2026-06-07")')
    r('(rev "1.1")')
    r('(company "MusicBrain project")')
    r('(comment 1 "Quad 16-bit DAC, bipolar +/-5V, TSSOP-24, SPI interface")')
    r('(comment 2 "AD5754BREZ (non-R) requires ADR421 external 2.5V reference")')
    r('(comment 3 "Designed for JLCPCB PCBA assembly - 0805 passives, TSSOP-24 DAC")')
    r('(comment 4 "Pinout from datasheet Table 5 - 4 NC pins, no RSET/DCEN")')
    c()

    c()  # close root kicad_sch

    assert _depth[0] == 0, f"Unbalanced! depth={_depth[0]}"
    return "\n".join(lines)


def gen_pcb():
    """Generate a minimal .kicad_pcb file."""
    lines, _depth, o, c, r, sym, pin, prop = _make_builder()

    o("kicad_pcb")
    r('(version 20231120)')
    r('(generator "pcbnew")')
    r('(generator_version "8.0")')
    r('(uuid "mb000003-0000-0000-0000-000000000002")')

    r('(general (thickness 1.6) (drawings 4) (tracks 0) (zones 0) (modules 0) (nets 0))')
    r('(page A4)')

    o("title_block")
    r('(title "MusicBrain - AD5754BREZ Minimal DAC Breakout Board")')
    r('(date "2026-06-07")')
    r('(rev "1.1")')
    r('(company "MusicBrain project")')
    r('(comment 1 "Quad 16-bit DAC, bipolar +/-5V, TSSOP-24, SPI interface")')
    r('(comment 2 "AD5754BREZ (non-R) requires ADR421 external 2.5V reference")')
    c()

    o("layers")
    r('(0 F.Cu)')
    r('(31 B.Cu)')
    r('(32 B.Adhes)')
    r('(33 F.Adhes)')
    r('(34 F.Paste)')
    r('(35 B.Paste)')
    r('(36 F.SilkS)')
    r('(37 B.SilkS)')
    r('(38 F.Mask)')
    r('(39 B.Mask)')
    r('(40 Dwgs.User)')
    r('(41 Cmts.User)')
    r('(42 Eco1.User)')
    r('(43 Eco2.User)')
    r('(44 Edge.Cuts)')
    r('(45 Margin)')
    r('(46 F.CrtYd)')
    r('(47 B.CrtYd)')
    r('(48 F.Fab)')
    r('(49 B.Fab)')
    c()

    o("setup")
    r('(last_trace_width 0.254)')
    r('(zone_clearance 0.508)')
    r('(zone_45_only no)')
    r('(trace_clearance 0.254)')
    r('(edge_width 0.15)')
    r('(via_size 0.8)')
    r('(via_drill 0.4)')
    r('(via_min_size 0.4)')
    r('(through_hole_min_size 0.6)')
    r('(through_hole_drill 0.4)')
    r('(pcb_text_width 0.3)')
    r('(pcb_text_size 1.5 1.5)')
    r('(mod_edge_width 0.15)')
    r('(pad_to_mask_clearance 0.04)')
    r('(aux_axis_origin 0 0)')
    r('(use_grid yes)')
    r('(grid_origin 0 0)')
    r('(grid_unit 0.1)')
    r('(grid_size 2.54)')
    r('(units mm)')
    c()

    r('(net 0 "")')
    r('(net 1 "AVDD")')
    r('(net 2 "AVSS")')
    r('(net 3 "DVCC")')
    r('(net 4 "GND")')
    r('(net 5 "SCLK")')
    r('(net 6 "SDIN")')
    r('(net 7 "SDO")')
    r('(net 8 "SYNC")')
    r('(net 9 "VOUTA")')
    r('(net 10 "VOUTB")')
    r('(net 11 "VOUTC")')
    r('(net 12 "VOUTD")')
    r('(net 13 "REFIN")')
    r('(net 14 "CLR")')
    r('(net 15 "LDAC")')
    r('(net 16 "BIN_2sCOMP")')

    o("net_class", '"Default"', '"This is the default net class."')
    r("(clearance 0.2)")
    r("(trace_width 0.25)")
    r("(via_dia 0.8)")
    r("(via_drill 0.4)")
    r("(uvia_dia 0.3)")
    r("(uvia_drill 0.1)")
    c()

    o("net_class", '"Power"', '"Power nets."')
    r("(clearance 0.3)")
    r("(trace_width 0.5)")
    r("(via_dia 1.0)")
    r("(via_drill 0.6)")
    c()

    r('(gr_line (start 0 0) (end 30 0) (layer "Edge.Cuts") (width 0.05) (type solid))')
    r('(gr_line (start 30 0) (end 30 30) (layer "Edge.Cuts") (width 0.05) (type solid))')
    r('(gr_line (start 30 30) (end 0 30) (layer "Edge.Cuts") (width 0.05) (type solid))')
    r('(gr_line (start 0 30) (end 0 0) (layer "Edge.Cuts") (width 0.05) (type solid))')

    r('(gr_text "AD5754BREZ Breakout" (at 15 28) (layer "F.SilkS") (effects (font (size 1 1) (justify center))))')
    r('(gr_text "MusicBrain v1.1" (at 15 2) (layer "F.SilkS") (effects (font (size 0.8 0.8) (justify center))))')

    c()  # close root kicad_pcb

    assert _depth[0] == 0, f"Unbalanced! depth={_depth[0]}"
    return "\n".join(lines)


def gen_pro():
    """Generate a minimal .kicad_pro file (JSON format for KiCad 8+)."""
    pro = {
        "general": {
            "project_name": "AD5754BREZ Minimal DAC Breakout"
        },
        "schematic": {
            "file": "ad5754r-breakout.kicad_sch"
        },
        "pcb": {
            "file": "ad5754r-breakout.kicad_pcb"
        }
    }
    return json.dumps(pro, indent=2)


# ── Write files ──
sch_text = gen_sch()
pcb_text = gen_pcb()
pro_text = gen_pro()

sch_path = OUT_DIR / "ad5754r-breakout.kicad_sch"
pcb_path = OUT_DIR / "ad5754r-breakout.kicad_pcb"
pro_path = OUT_DIR / "ad5754r-breakout.kicad_pro"

sch_path.write_text(sch_text, encoding="utf-8")
pcb_path.write_text(pcb_text, encoding="utf-8")
pro_path.write_text(pro_text, encoding="utf-8")

# ── Validate ──
for p in [sch_path, pcb_path]:
    text = p.read_text(encoding="utf-8")
    bal = 0
    for ch in text:
        if ch == "(":
            bal += 1
        elif ch == ")":
            bal -= 1
            if bal < 0:
                print(f"ERROR: negative balance in {p.name}")
                break
    status = "OK" if bal == 0 else f"BALANCE={bal}"
    print(f"{p.name}: {status}")

try:
    json.loads(pro_path.read_text(encoding="utf-8"))
    print(f"{pro_path.name}: OK (valid JSON)")
except json.JSONDecodeError as e:
    print(f"{pro_path.name}: JSON ERROR: {e}")

print("Done!")