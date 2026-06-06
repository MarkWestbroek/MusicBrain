


Gefeliciteerd met deze prachtige poort! Het compileren en draaien van Mutable Instruments code op een ander platform is een flinke vuurdoop, en het feit dat de code byte-exact draait en de reverb er al succesvol is uitgevlooid volgens jullie documentatie, betekent dat de grootste hobbels al zijn genomen.

Als we kijken naar de geheugenarchitectuur van de NXP i.MXRT1062 op de **Teensy 4.1**, zien we dat je exact tegen de grenzen van de standaard C++ allocatie aanloopt. Een enkele `elements::Part` instantie kost momenteel namelijk zo'n **113 kB**. Vier stemmen kosten je dus theoretisch $4 \times 113 = 452\text{ kB}$. Aangezien de DTCM (RAM1) in totaal 512 kB groot is, en je al 131 kB kwijt bent aan de stack en basiscode (totaal nodig: ~583 kB), past dit simpelweg fysiek niet meer in RAM1.

Hier is een diepgaande analyse van hoe je de verschillende RAM-regio's optimaal inzet om die 4 polyfone stemmen stabiel te laten draaien, zonder direct naar een grotere processor te hoeven grijpen.

---

## 1. De Geheugen-Anatomie van de Teensy 4.1

De Teensy 4.1 heeft drie soorten RAM, elk met hun eigen snelheid en kenmerken:

1. **RAM1 (DTCM - Data Tightly Coupled RAM):** 512 kB. Draait op de volledige kloksnelheid van de processor (600 MHz). Dit is de *enige* regio waar de processor zonder vertraging (single-cycle access) data kan ophalen. Globale variabelen landen hier standaard.


2. **RAM2 (OCRAM - On-Chip RAM):** 512 kB. Loopt via een interne bus op een kwart van de snelheid (150 MHz). Dit is de regio waar je variabelen plaatst door er `DMAMEM` voor te zetten.


3. **PSRAM (Extern):** Maximaal twee chips van 8 Megabyte die je op de onderkant soldeert. Dit loopt via een seriële QSPI-bus. Dit is erg traag voor real-time DSP, maar uitstekend voor grote buffers. Je spreekt dit aan met `EXTMEM`.

---

## 2. Strategieën voor Slim Geheugengebruik (Zonder hardware-upgrade)

Om 4 stemmen stabiel te draaien, moeten we een aantal specifieke ingrepen doen in de `mi-elements` datastructuren.

### Strategie A: Statische structuren delen (Het grootste voordeel)

Als je de code van Emilie Gillet induikt, zie je dat veel arrays en buffers binnen de klassen `Voice`, `Exciter` en `Resonator` worden gebruikt als *tijdelijke krapbuffers* of constante structuren die niet uniek hoeven te zijn per stem als de stemmen identiek worden aangestuurd, óf die prima gedeeld kunnen worden.

* **De Resonator-modi (64-mode filter bank):** De `elements::Resonator` berekent de coëfficiënten voor 64 parallelle bandpass-filters. Als jouw 4 stemmen *gelijkvormig* zijn (polyfoon, waarbij de parameters zoals `geometry`, `brightness` en `damping` voor de hele syntesizer gelden en niet per stem verschillen), kun je de **coëfficiënten-arrays** (`frequency`, `gain`, `damping`) globaal maken. Laat één centrale master-functie deze coëfficiënten berekenen, en laat de 4 individuele stemmen deze arrays alleen *uitlezen* tijdens hun eigen `Process()` stap. Dit scheelt tientallen kilobytes aan DTCM per stem.



### Strategie B: Verschuif de interne buffers naar OCRAM (`DMAMEM`)

De `elements::Part` en `elements::Voice` maken intern intensief gebruik van float-arrays om audioblokken tussen de exciter en resonator te passeren (zoals `bow_buffer`, `blow_buffer`, `strike_buffer` van elk 16 of 128 samples).

* Als je deze grotere buffers binnen de klassen definieert als statische arrays buiten de klasses, of als je de gehele `ElementsVoice` instanties dwingt om in RAM2 te leven, maak je DTCM leeg.
* **Hoe doe je dit?** Je kunt de instanties van je stemmen in `main.cpp` expliciet declareren in het OCRAM:
```cpp
DMAMEM ElementsVoice poly_voices[4];

```

*   **Het risico:** Omdat OCRAM op 150 MHz draait, krijgt de processor te maken met *wait-states* tijdens de audio-interrupt. Gelukkig heeft de Cortex-M7 een **Data Cache (D-Cache)**. Als de D-Cache correct aan staat in de Teensy-core (wat standaard zo is), zal de processor de data uit OCRAM naar de cache trekken. Omdat de audio-blockgrootte klein is (16 samples), past dit vaak prima in de cache en blijft de CPU-overhead binnen de perken.

### Strategie C: Grote delay-lijnen naar PSRAM (`EXTMEM`)
Als je de Karplus-Strong string-modellen (`elements::String`) of de wind-modellen (`elements::Tube`) gebruikt, bevatten deze interne delay-lijnen[cite: 1]. 
*   Mochten deze groot zijn (meer dan een paar honderd samples), verplaats dan specifiek de array-definities binnen die klassen naar `EXTMEM`. 

---

## 3. Evaluatie van de Geheugenkaart (Memory Map)

Jullie huidige verdeling ziet er als volgt uit[cite: 1]:

| Regio | Status | Jouw Toepassing | Advies voor 4-voice Polyfonie |
| :--- | :--- | :--- | :--- |
| **RAM1 (DTCM)** | **Volg gevaar** (267 kB in gebruik, maar groeit hard bij 4 stemmen)[cite: 1] | Stack, basistabellen, core DSP[cite: 1]. | **Houd dit exclusief voor de 'hot-loop' wiskunde.** Alleen de directe variabelen van de 64-mode filter bank horen hier thuis[cite: 1]. |
| **RAM2 (OCRAM)** | **Zeeën van ruimte** (413 kB vrij)[cite: 1] | Reverb buffer (is er al uit!)[cite: 1]. | **Verplaats hier de complete `ElementsVoice` instanties naartoe** middels de `DMAMEM` tag[cite: 1]. |
| **FLASH** | Ruimte zat (7.27 MB vrij)[cite: 1] | `resources.cc` opgeslagen met `FLASHMEM`[cite: 1]. | Perfect. Laat dit zo staan. De lookup-tables horen in flash[cite: 1]. |

---

## 4. Is uitwijken naar een dikkere processor slimmer?

Eerlijk gezegd: **Nee, waarschijnlijk niet direct nodig.** De Teensy 4.1 (Cortex-M7 op 600 MHz) is op dit moment een van de absolute koplopers onder de microcontrollers voor dit soort zware DSP-taken[cite: 1]. Als je overstapt op een andere embedded processor (zoals een high-end STM32H7), krijg je weliswaar soms 1 MB DTCM, maar lever je vaak in op kloksnelheid (draaien meestal op 400-480 MHz). 

Gezien jullie CPU-budget waarbij één Elements-stem **~22%** van de CPU verbruikt, zit je bij 4 stemmen op ongeveer **88% CPU-utilisatie**[cite: 1]. Dat is heel krap, maar haalbaar als je de compiler-optimalisaties op maximaal zet (`-O3 -flto` in je `platformio.ini`)[cite: 1].

### Wat is het alternatief als de Teensy écht te traag blijkt?
Mocht je merken dat 4 stemmen stabiel qua geheugen draaien (via OCRAM), maar dat de audio-interrupt gaat stotteren (CPU-overload), dan is de logische vervolgstap niet een andere microcontroller, maar de stap waar we het eerder over hadden: **De FPGA (zoals je zojuist aangeschafte Arty S7-50).** 
De 64 parallelle bandpass-filters van de Elements resonator zijn namelijk bij uitstek een taak die je massief parallel in hardware kunt gieten op een FPGA, waardoor je CPU-belasting direct naar nagenoeg 0% zakt.

### Concreet actieplan voor nu:
1.  Zet de 4 instanties van `ElementsVoice` in `DMAMEM` (OCRAM) om je RAM1 (DTCM) te ontlasten[cite: 1].
2.  Zorg dat de compiler-flags in `platformio.ini` op de allerhoogste versnelling staan (`-O3`).
3.  Meet het CPU-verbuik met `AudioProcessorUsageMax()`[cite: 1]. Zit je hiermee veilig onder de 90%? Dan is de Teensy 4.1 de perfecte en meest compacte behuizing voor je project!

```