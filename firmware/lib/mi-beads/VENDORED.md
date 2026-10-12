# mi-beads — gevendorde bron

- `beads/dsp/**` en `beads/resources.{cc,h}`: byte-identiek uit
  [pichenettes/eurorack](https://github.com/pichenettes/eurorack), commit
  `d8f4739` ("Beads code/sch", 2026-10-11). MIT, © Émilie Gillet, met
  Frédéric Meslin en Oliver Rockstedt.
- `stmlib/dsp/hysteresis_filter.h`, `stmlib/dsp/sample_rate_converter.h`: uit
  [pichenettes/stmlib](https://github.com/pichenettes/stmlib), commit
  `d18def8`. Overige stmlib-headers komen uit mi-elements (de gedeelde,
  byte-identieke kopie), mi-stages en mi-clouds.
- `ref-beads.cc.txt`: `beads/beads.cc` van dezelfde commit, alleen als
  naslag (hoe de hardware knoppen en CV inleest); wordt niet gebouwd.
- `beads_host.h`: eigen code (MIT), gedeeld door de Teensy-module en de
  simulator.

README van Émilie bij Beads: "Code provided as is, builds on a Desktop
platform but not verified to build and run on a module."
