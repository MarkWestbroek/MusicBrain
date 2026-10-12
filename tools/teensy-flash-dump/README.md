# teensy-flash-dump

Leest het LittleFS_Program-gebied (1 MB aan het eind van de flash, 0x606C0000)
van een Teensy 4.1 uit en stuurt het als hex over USB-serieel. Koppelt het
bestandssysteem niet (LittleFS::begin formatteert bij een mislukte mount) en
schrijft niets. Gebruikt op 2026-10-12 om de patchbank van de losse 5× Elements
te redden (`sounds/Elements/`).

    pio run -d tools/teensy-flash-dump -t upload
    # dan op de seriële poort: "dump" → BEGIN / regels "<offset> <hex>" / END <som>

Let op: dit vervangt de firmware op die Teensy. Op 2026-10-12 bleef het
bankgebied daarbij staan (controlesom klopte, bank leesbaar); dat de
bootloader dat altijd zo laat, is niet nagegaan. Zet daarna de eigen firmware
terug, en bewaar de dump eerst.
