


Gefeliciteerd met deze prachtige poort! Het compileren en draaien van Mutable Instruments code op een ander platform is een flinke vuurdoop, en het feit dat de code byte-exact draait en de reverb er al succesvol is uitgevlooid volgens jullie documentatie, betekent dat de grootste hobbels al zijn genomen.

Als we kijken naar de geheugenarchitectuur van de NXP i.MXRT1062 op de **Teensy 4.1**, zien we dat je exact tegen de grenzen van de standaard C++ allocatie aanloopt. Een enkele `elements::Part` instantie kost momenteel namelijk zo'n **113 kB**. Vier stemmen kosten je dus theoretisch $4 \times 113 = 452\text{ kB}$. Aangezien de DTCM (RAM1) in totaal 512 kB groot is, en je al 131 kB kwijt bent aan de stack en basiscode (totaal nodig: ~583 kB), past dit simpelweg fysiek niet meer in RAM1.

Hier is een diepgaande analyse van hoe je de verschillende RAM-regio's optimaal inzet om die 4 polyfone stemmen stabiel te laten draaien, zonder direct naar een grotere processor te hoeven grijpen.

---

## De Geheugen-Anatomie van de Teensy 4.1

De Teensy 4.1 heeft drie soorten RAM, elk met hun eigen snelheid en kenmerken:

1. **RAM1 (DTCM - Data Tightly Coupled RAM):** 512 kB. Draait op de volledige kloksnelheid van de processor (600 MHz). Dit is de *enige* regio waar de processor zonder vertraging (single-cycle access) data kan ophalen. Globale variabelen landen hier standaard.
2. **RAM2 (OCRAM - On-Chip RAM):** 512 kB. Loopt via een interne bus op een kwart van de snelheid (150 MHz). Dit is de regio waar je variabelen plaatst door er `DMAMEM` voor te zetten.
3. **PSRAM (Extern):** Maximaal twee optionele chips van 8 Megabyte die je op de onderkant soldeert. Dit loopt via een seriële QSPI-bus. Dit is te traag voor real-time DSP-hotloops, maar uitstekend voor grote buffers (zoals delays). Je spreekt dit aan met `EXTMEM`.

---

## Strategieën voor Slim Geheugengebruik

Om 4 stemmen stabiel te draaien, moeten we een aantal specifieke ingrepen doen in de `mi-elements` datastructuren.

### 1. Verschuif de complete stemmen naar OCRAM (`DMAMEM`)

Aangezien een enkele `elements::Part` instantie zo'n **113 kB** kost, passen 4 stemmen ($4 \times 113 = 452 \text{ kB}$) plus je stack en basiscode (~131 kB) simpelweg niet samen in de 512 kB van RAM1 (DTCM).

**Hoe los je dit op?** Declareer de instanties van je stemmen in `main.cpp` expliciet in het OCRAM:

```cpp
DMAMEM ElementsVoice poly_voices[4];

```

> **Het risico & de caching:** Omdat OCRAM op 150 MHz draait, krijgt de processor in theorie te maken met *wait-states* tijdens de audio-interrupt. Gelukkig heeft de Cortex-M7 een **Data Cache (D-Cache)**. Omdat de audio-blockgrootte van Elements heel klein is (16 samples @ 32 kHz), trekt de processor deze datablokken heel efficiënt in één keer de snelle cache in. In de praktijk merk je hierdoor nauwelijks prestatieverlies.

### 2. Grote delay-lijnen naar PSRAM (`EXTMEM`)

Als je de Karplus-Strong string-modellen (`elements::String`) of de wind-modellen (`elements::Tube`) gebruikt, bevatten deze interne delay-lijnen. Mochten deze bij grotere polyfonie te veel ruimte innemen, verplaats dan specifiek de grotere array-definities binnen die klassen naar `EXTMEM`.

### 3. Statische structuren en tabellen delen

De ~380 kB aan lookup-tables (`resources.cc`) zijn in jullie code al slim getagd met `FLASHMEM`. Daardoor blijven ze keurig in het grote flashgeheugen staan en belasten ze de RAM-regio's überhaupt niet.

---

## Evaluatie van de Geheugenkaart (Memory Map)

Jullie verdeling na deze ingreep:

| Regio | Status | Jouw Toepassing | Advies voor 4-voice Polyfonie |
| --- | --- | --- | --- |
| **RAM1 (DTCM)** | **Volgevaar geweken** (~267 kB vrij) | Stack, basistabellen, core DSP. | Houd dit exclusief voor de 'hot-loop' wiskunde en de lokale registers van de filters. |
| **RAM2 (OCRAM)** | **Ruimte genoeg** (~413 kB vrij) | De standalone reverb (64 kB). | **Plaats hier de 4 `ElementsVoice` instanties** middels de `DMAMEM` tag. |
| **FLASH** | Zeeën van ruimte (7.27 MB vrij) | Code + `FLASHMEM` lookup-tables (~380 kB). | Perfect zo laten staan. |

---

## Is uitwijken naar een dikkere processor slimmer?

Eerlijk gezegd: **Nee, waarschijnlijk niet nodig.** De Teensy 4.1 (Cortex-M7 op 600 MHz) is op dit moment een absolute koploper onder de microcontrollers voor dit soort zware DSP-taken. Als je overstapt op een andere embedded processor (zoals een high-end STM32H7), krijg je weliswaar soms iets meer DTCM, maar lever je vaak in op kloksnelheid (die draaien meestal op 400-480 MHz).

Gezien jullie CPU-budget waarbij één Elements-stem **~22%** van de CPU verbruikt, zit je bij 4 stemmen op ongeveer **88% CPU-utilisatie**. Dat is heel krap, maar haalbaar als je de compiler-optimalisaties op maximaal zet (`-O3 -flto` in je `platformio.ini`).

Mocht het met de `DMAMEM`-optimalisatie op de Teensy tóch net gaan haperen bij extreme modulatie, dan is de meest logische vervolgstap niet een andere microcontroller, maar je gloednieuwe **Arty S7-50 FPGA**. De 64 parallelle bandpass-filters van de Elements resonator zijn namelijk bij uitstek een taak die je massief parallel in hardware kunt gieten, waardoor de CPU-belasting direct naar nagenoeg 0% zakt!