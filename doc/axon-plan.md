# Axon — ESP32-netbridge voor Cortex, voorlopig plan v0.1

*2026-07-20. Aanleiding: Mark constateert dat de geplande ESP32 naast de
Teensy (UTP + WiFi + API naar de frontend) nooit op het busboard is
geland — zonder die brug is de Teensy niet goed van patches en
instellingen te voorzien.*

## Wat er al besloten wás (en nog steeds klopt)

- **ADR 0001**: ESP32/ESP32-S3 als *connectivity side car*, pratend met de
  brain over UART of SPI — **nooit** de centrale brain (WiFi/BT-jitter).
- **ADR 0002**: de editor praat USB-CDC óf netwerk; het netwerk-eind is de
  ESP32-sidecar met HTTP (one-shot), **WebSocket** (streaming: meters,
  huidige patch) en mDNS-discovery (`musicbrain.local`). Zelfde
  JSON-RPC-frames als over USB — de Teensy ziet gewoon een `Transport`.

Het gat zit alleen in de hardware: busboard v2/v3 kreeg DLG-UART's, CAN
en USB-host, maar geen ESP32-landing.

## Voorstel: sidecar-kaart op DLG1, géén busboard-respin

Het busboard v3 is net DRC-schoon en heeft al precies de goede poort:
**J19 = DLG1 (Serial3, 1×4: GND/TX/RX/GND)**. De netbridge wordt een
kleine satellietkaart aan een kabeltje, niet een verbouwing van het
busboard.

Blokken (grotendeels hergebruik van gswitch-brain, zelfde recepten):

- **ESP32-S3-WROOM-1U** — de 1U met U.FL: de antenne moet naar het paneel,
  in een rack vol metaal (les uit het gswitch-project).
- **W5500 (SPI-Ethernet)** voor de UTP-kant + MagJack op het paneel. Zo
  termineert **al het netwerk (WiFi én UTP) in de ESP32** en ziet de
  Teensy één UART-protocol, ongeacht het medium.
- **USB-C** voor eerste flash, daarna WiFi-OTA (gswitch-recept).
- **UART naar J19** (Serial3); baudrate ruim (2–6 Mbaud kan op beide) —
  patches en instellingen zijn klein, streaming-meters ook.
- Voeding: **J19 heeft geen voedingspen.** Rev 3.0: +5V aftakken bij U2/
  de ontkoppelbank (soldeertap, nette draad). Bij een toekomstige rev 3.1
  van het busboard: 1×2 header **J25 (+5V/GND)** naast J19 — micro-delta.

## Ethernet-feiten (vraag Mark 2026-07-20)

Geen enkele ESP32 heeft een kant-en-klare UTP-uitgang. De klassieke ESP32
heeft een Ethernet-MAC maar geen PHY (LAN8720 + magnetics + RJ45 ernaast);
de **ESP32-S3 heeft geen Ethernet-MAC** — bekabeld gaat daar via
SPI-Ethernet, vandaar de W5500 in dit plan (ESP-IDF-driver, ruim genoeg
voor patches/API). De S3 blijft de keuze vanwege USB-flash/OTA en het
gswitch-recept.

## Verticaal op het busboard (idee Mark 2026-07-20, voor een rev 3.2)

De westzone naast de Teensy (tussen J23 en de voedingshoek) ligt buiten
het kaartvolume — daar kan de Axon als **staande kaart** in een verticale
socket. Ontwerpkeuze nu: de Axon-kaart krijgt aan de onderrand **één
1×6-connector** (+5V, GND, TX, RX, GND, reserve). Dezelfde kaart werkt
dan met twee kabeltjes aan J19+J25 (rev 3.1) én rechtstreeks in een
socket op een rev 3.2. Busboard 3.2 pas spinnen als Axon rev 0.1 bestaat
en de maten vastliggen; antenne (U.FL) en RJ45 gaan sowieso per kabel
naar het paneel.

## J1-kabels: oriëntatie-valkuilen (let op bij assemblage!)

Enkelrijige 0,1"-headers **keyen niet** — een kabel kan omgekeerd in. Twee
vallen (Mark 2026-07-20):

- **2-pin naar J25 (+5V/GND)** — omgekeerd = **voeding omgepoold** → schade
  aan de LDO/ESP32. Kritisch: pin 1 (+5V, vierkante pad + silk "5V")
  consequent markeren; overweeg een gekeyde/geshroude connector.
- **4-pin naar J19 (GND/RX/TX/GND)** — lijkt symmetrisch (GND aan beide
  uiteinden) maar is het níét: omgedraaid wisselen **RX↔TX**. Geen comms +
  TX-TX-contentie (geen serieweerstand). GND-GND matcht wél, dus de fout is
  onzichtbaar aan de connector. Pin 1-kant van élke kabel markeren.

## Busboard 3.2 — directe koppeling (geen kabel): extra opletten

Als Axon rechtstreeks in een 1×6-socket op busboard 3.2 prikt (haakse header
op Axon), is er **geen kabel meer die een verkeerde oriëntatie opvangt**. De
socket-pinout op het busboard moet exact spiegelen met de werkelijke
mechanische stand van de staande Axon — één verkeerde spiegeling en +5V
staat op een GND-pin. Daarom voor 3.2:

1. **Gekeyde/geshroude connector** (boxed header + notch) zodat er maar één
   stand past — bij een directe board-to-board-koppeling geen luxe maar nodig.
2. De busboard-socketpinout **afleiden uit de gemonteerde geometrie** (welke
   Axon-rand naar welke kant), niet uit het schema-nummer; verifiëren met een
   doorbel-check op een sample vóór fab.
3. J25 (nu apart, 1×2) en J19 (1×4) worden dan één 1×6 op het busboard;
   pinvolgorde 1:1 kopiëren van Axon J1 ná de spiegel-analyse.

## Alternatief, bekeken en geparkeerd

**Teensy 4.1 native Ethernet** (de PHY zit al op de Teensy; PJRC-kit naar
een MagJack, geen busboard-wijziging nodig). Pro: 100 Mbit bekabeld
gratis. Contra: dan draait de netwerkstack op de realtime-Teensy, en WiFi
heb je er nog steeds niet. Kan later altijd nog **naast** de netbridge
(de pads blijven bereikbaar); voor de patch/instellingen-API is de
ESP32-route de architectuur die de ADR's al kozen.

## Naam

**Axon** — bekrachtigd door Mark 2026-07-20. Een axon is de zenuwvezel
die signalen het systeem uit draagt; precies wat deze kaart doet.

## USB-host staat hier los van (vraag Mark 2026-07-20)

De DLG-poorten J19/J20 zijn kale UART's (GND/TX/RX/GND) — de
**USB-host-doorvoer is J23** (2×5, Teensy-hostpads ↔ paneel-USB-A, netten
USBH_1..5). Axon raakt USB dus niet aan; de paneel-USB-A blijft volledig
vrij voor bijv. een USB-MIDI-controller. En klopt: meerdere USB-apparaten
op die ene poort vergt een hub — de Teensy-hoststack (USBHost_t36)
ondersteunt hubs, dus een klein hubje achter/aan de paneelpoort werkt;
Axon voegt daar geen apparaat aan toe (zijn USB-C is alleen voor de
eerste flash en hangt aan de ESP32, niet aan de Teensy).

## Connectors J1/J3/J4 — oriëntatie (vragen Mark 2026-07-20)

Alle drie staan aan een bordrand, dus een **haakse (right-angle) THT-header
deelt exact hetzelfde padpatroon** als de rechte variant — de gefabriceerde
PCB steunt beide; het is een bestockings-/BOM-keuze, geen bordwijziging.

- **J1 (1×6, zuidrand)** — voeding+UART naar het busboard, **2+4 gegroepeerd**
  (besluit Mark 2026-07-20, alle 6 pinnen in gebruik): pin 1-2 = +5V/GND → J25,
  pin 3-6 = GND/RX/TX/GND → J19. RX op 4 en TX op 5 zodat **beide kabels recht
  1:1** zijn (de UART-TX↔RX-wissel zit in de pinvolgorde, niet in de kabel).
  Rechte header nu; haaks → pinnen zuid = Axon **verticaal** in socket op
  busboard rev 3.2. Padrij ligt al op de rand, geen herplaatsing nodig.
- **J3 (2×7, oostrand)** — magjack-header naar de **paneel-RJ45 (UTP)** met
  geïntegreerde magnetics; gaat sowieso met een lintkabel naar het paneel, dus
  rechte of haakse header maakt alleen uit voor de kabelbocht. Geen bord-Ethernet-
  connector: dat zit op het paneel.
- **J4 (1×3, noordrand)** — **debug-UART (UART0, TX0/RX0/GND)**, alleen tijdens
  firmware-bring-up. **Naar de noordrand verplaatst (2026-07-20)**: de DBG-pinnen
  (module 36/37) liggen op de NO-hoek van de module, dus dit was een korte,
  makkelijke route (loterij meteen DRC 0/0). Zo staat J4 weg van de zuidrand
  waar J1 en — op het busboard — de Teensy zitten; een staande of haakse
  debug-header botst daar niet meer. Haaks omhoog op de oude zuidplek paste
  níét (R18/C22 stonden ~6 mm noordelijk in de weg).

## Volgende stappen

1. Firmware-kant: `Transport`-implementatie over Serial3 + ESP32-app
   (API-server, zelfde JSON-RPC-frames; editor krijgt een
   netwerk-transport naast WebSerial).
2. Hardware: gen_netbridge.py afleiden van gswitch-brain (ESP32-S3-blok,
   USB-C, 3V3) + W5500-blok; klein bord, paneelmontage bij antenne/RJ45.
3. Busboard rev 3.1-lijstje starten (J25-voedingsheader) — pas mee-spinnen
   met de eerstvolgende echte busboard-wijziging, niet er speciaal voor.
