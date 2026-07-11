# MusicBrain POT8 — 8× potmeter (slotkaart)

**Status**: schema ERC-schoon + netlist geverifieerd; PCB volledig geroute
(DRC 0 fouten, 0 unconnected). **Spec**: `doc/spi-bus-spec.md`.
Bord: 110 mm breed × **80 mm hoog** (H-standaard), 2 lagen.

## Wat het is

8 draaipotmeters als CV-bron voor de firmware: elke pot is een simpele
spanningsdeler 0…3,3 V die door een **MCP3208** (12-bit SAR, 8 kanalen,
SPI) wordt uitgelezen. Geen ±12V nodig — de kaart draait volledig op de
+3V3-busrail.

- **RK097N** (9 mm, haaks): de pot staat óp het kaartvlak met de as langs
  het bord omhoog — de assen steken door de **bovenplaat** (steek 13,5 mm,
  begrensd door de montagebeugels van de pots).
- **10 kΩ lineair**; wiper → 100 nF naar GND per kanaal (laadreservoir
  voor de SAR-sampler én ontdendering) → MCP3208 CH0..7.
- MCP3208 op 3V3: VREF = VDD = +3V3, dus de ADC leest rail-to-rail
  precies de deler af (ratiometrisch — railruis valt grotendeels weg).

## Busaansluiting

| MCP3208 | Buslijn |
|---|---|
| CLK / DIN / DOUT | SCLK / MOSI / MISO (DOUT is tri-state bij CS hoog) |
| ~CS/SHDN | CS (slotpin 13, geografisch) |
| VDD, VREF | +3V3 |

Firmware: SPI mode 0, ≤2 MHz bij 3V3; per kanaal 3 bytes
(start+SGL+kanaal → 12 bit terug). POT1 = westelijkste pot.

## PCB-notities

De chip ligt 90° gedraaid in het midden, zodat de kanaalpads (zuidrij)
west→oost in dezelfde volgorde liggen als de pots. De acht wipers dalen
als F.Cu-verticalen af naar **B.Cu-lanes** (y 134,6–140,2, steek 0,8) en
stijgen bij hun padkolom weer op — Manhattan-stijl, kruisingsvrij. De
SPI-lijnen lopen van J1 via banden (y 168–171) naar vier westverticalen
en als B-rijen (y 123,6–126) naar de noordrij van de chip. De +3V3-rail
(y 106,8) voedt alle pot-uiteinden; VDD/VREF hangen aan een B-run op
y 130,9 vanaf de westrand.

## Mechanica

De as-bushing (M7) van elke RK097N steekt boven de kaartrand uit en gaat
met moer door de bovenplaat, net als de Thonkiconn-bussen — dat klemt de
kaart bovenlangs vast. De montagebeugels zijn als ovale THT-sleuven
uitgevoerd (vastsolderen voor stevigheid).
