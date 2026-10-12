# Elements: de programma's van de losse 5× Elements-Teensy

Gered op 2026-10-12 van de Teensy met de losse firmware `firmware/app-elements`
(fw 0.5.5, vijf Elements-stemmen, patchbank in LittleFS_Program).

- `5x-elements-programs.json`: de 19 programma's (naam en alle velden van
  `elements::Patch`, plus FM-verschuiving en de reverb-instelling van toen).
  Veldnamen zoals de knoppen van `tp_mmb_elements`; `mod_freq_raw` is de ruwe
  `resonator_modulation_frequency` (knop ModFrq = waarde × 16000).
- `5x-elements-littlefs.bin`: het ruwe 1 MB-geheugengebied (0x606C0000),
  byte voor byte, met controlesom. Met `littlefs-python` te koppelen
  (block 65536 × 16, read/prog/cache/lookahead 128); bevat `patchbank.bin`.

Hoe: `tools/teensy-flash-dump` (leest alleen, koppelt het bestandssysteem niet)
op de Teensy gezet, het gebied uitgelezen, en op de pc ontleed. De
Elements-firmware zelf had geen commando om de waarden af te drukken.
