// Shim voor de wasm-build: de gevendorde MI-resources zetten hun tabellen
// met FLASHMEM/PROGMEM in Teensy-flash. In wasm is alles gewoon geheugen.
#pragma once
#ifndef FLASHMEM
#define FLASHMEM
#endif
#ifndef PROGMEM
#define PROGMEM
#endif
#ifndef DMAMEM
#define DMAMEM
#endif
