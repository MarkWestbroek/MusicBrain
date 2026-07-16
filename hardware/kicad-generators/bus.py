"""Bus-generatie 2 — de gedeelde constanten voor élke slotkaart/riser.

Eén bron van waarheid, spiegel van `doc/spi-bus-spec.md` v2.0. Generators
importeren hieruit; niemand tikt de pinout nog zelf over.

Gen 2 (2026-07-16, besluit Mark — zie doc/systeem-v3-plan.md):
  - slot 2x12: 1-18 identiek aan gen 1, 19=SPARE1/CONVST, 20=GND-guard,
    21-24 = MCLK/BCLK/LRCLK/I2S_DATA
  - H = 50 (was 80); kaarten 80 mm breed (B-richting)
  - slotsteek 20,32 mm (4 HP); slots gecentreerd op het bordhart
"""

# ---- mechanica ----
H = 50.0                 # kaarthoogte boven het busboard (was 80 in gen 1)
KAART_B = 80.0           # standaard kaartbreedte in de B-richting
SLOT_STEEK = 20.32       # 4 HP (1 HP = 5,08)
HP = 5.08

# Kaart-assenstelsel: de generators tekenen op een vaste plek in het vel.
BY0 = 100.0              # paneelrand (boven)
BY1 = BY0 + H            # busrand (onder)  -> 150.0
CONN_INSET = 6.58        # anker-afstand van de rand voor de haakse headers

# ---- slot-pinout gen 2 (spi-bus-spec v2.0) ----
SLOT = {
    1: 'GND',   2: '+12V',
    3: 'GND',   4: '-12V',
    5: 'GND',   6: '+3V3',
    7: '/SCLK', 8: 'GND',
    9: '/MOSI', 10: 'GND',
    11: '/MISO', 12: 'GND',
    13: '/CS',  14: 'GND',
    15: '/LDAC', 16: '/IRQ',
    17: '/SDA', 18: '/SCL',
    19: '/SPARE1',          # = CONVST (busbrede ADC-strobe)
    20: 'GND',              # guard vóór het audioblok (was SPARE2)
    21: '/MCLK',            # gedeeld, van de klokmaster; = ADAT-bitklok
    22: '/BCLK',            # gedeeld
    23: '/LRCLK',           # gedeeld
    24: '/I2S_DATA',        # PER SLOT: slave -> master
}
SLOT_PINS = 24

# ---- footprints ----
# Bus: haakse male 2x12 op de kaart, verticale female 2x12 op het busboard.
HDR_BUS = ('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x12_P2.54mm_Horizontal.kicad_mod',
           'Connector_PinHeader_2.54mm:PinHeader_2x12_P2.54mm_Horizontal')
SOCKET_BUS = ('Connector_PinSocket_2.54mm.pretty\\PinSocket_2x12_P2.54mm_Vertical.kicad_mod',
              'Connector_PinSocket_2.54mm:PinSocket_2x12_P2.54mm_Vertical')
# Paneel: haakse male 1x10 op de kaart (front-contract blijft 1x10).
HDR_PANEEL = ('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x10_P2.54mm_Horizontal.kicad_mod',
              'Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Horizontal')

# Halve connectorlengte -> anker-offset om de header op CX te CENTREREN.
# 2x12 = 11 * 2.54 = 27.94 span; 2x10 was 22.86 (offset 11.43).
BUS_HALF = 13.97
PANEEL_HALF = 11.43      # 1x10: 9 * 2.54 = 22.86

# ---- front-koppel-standaard (ongewijzigd t.o.v. gen 1) ----
FRONT_HART = 8.0         # hartlijn componenten vanaf de westrand
FRONT_SOCKET_X = 16.5    # socketkolom vanaf de westrand
FRONT_LENGTE = 110.0     # bruikbaar tussen de rails (front-board-constraints.md)


def slot_nets():
    """De netnamen die een gen-2-slot voert, in pinvolgorde (voor NETS-lijsten)."""
    return sorted({n for n in SLOT.values()})


def j1_map(board, gebruikt=None):
    """Netmap voor de bus-header van een kaart/riser.

    gebruikt: verzameling netnamen die deze kaart écht aansluit; de rest
    blijft onaangesloten (spec-regel 5: nooit hard aan GND/3V3 knopen).
    """
    m = {}
    for pin, net in SLOT.items():
        if gebruikt is None or net in gebruikt:
            if net in board.NI:
                m[str(pin)] = net
    return board.nm(m)
