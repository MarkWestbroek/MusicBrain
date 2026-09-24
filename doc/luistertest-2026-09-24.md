# Luistertest na de simulator-omzetting (24 september 2026)

Sinds vannacht draait de simulator dezelfde code als de Teensy, ook voor de
noten: klavier en MIDI gaan via MIDI-In, net als op de hardware. Dit is de
lijst om dat met je oren na te lopen. Achtergrond en de gevonden fouten:
[todo-2026-09-20-teensy-aan-de-kabel.md](todo-2026-09-20-teensy-aan-de-kabel.md)
en [sim-firmware-parity-plan.md](sim-firmware-parity-plan.md).

Twee delen. **Deel A** kan nu meteen, alleen in de browser. **Deel B** is
Teensy naast de simulator; daarvoor moet eerst de nieuwe firmware erop.

Per punt: wat je doet, wat je hoort te horen, en wat het betekent als het
anders klinkt. Noteer bij een afwijking liefst de patch en wat je hoorde —
een opname (⏺ in het simulatiepaneel) helpt het meest.

---

## Deel A — alleen de simulator

Begin met **Ctrl+Shift+R** in de editor, anders kan de browser nog een oude
worklet vasthouden (symptoom: "worklet-processor gecrasht" of een module die
stil blijft).

### A1. Poly — het belangrijkste

Poly ▾ → een 4-stemmige patch. Start, en speel met het klavier op het scherm
(of de testsequentie "Opbouwend akkoord").

- [ ] **Drie toetsen tegelijk** → drie noten, alle drie even hard.
- [ ] **Loslaten** → alles dooft uit met de release, niets blijft hangen.
- [ ] **Vier toetsen, dan een vijfde** → er valt er één weg. Welke: STEAL op
      MIDI-In. *Oldest* = de eerst aangeslagen, *Lowest*/*Highest* spreken
      voor zich. Draai STEAL en probeer opnieuw.
- [ ] **Voices op 2 zetten** (Patches-tab of de knop op MIDI-In) → nog maar
      twee noten tegelijk, ook al staan er vier stemmen in het rack.
- [ ] **Testsequentie "Akkoorden (Cmaj7 · Am7 · …)"** → vier-klanken, met
      verschillende aanslag per noot (zacht/hard).

*Anders?* Speelt er maar één stem, of hangen noten: dat is de nieuwe
stemverdeling via MIDI-In, en dat moet ik weten.

### A2. Mono en de toetsenstapel

Test-patch, en zet op de SEQ-16 **Run op Off** (anders speelt de sequencer
mee, zie A5).

- [ ] **Lage toets vasthouden, hoge erbij, hoge los** → de toon zakt terug
      naar de lage.
- [ ] **PRIO op High**, hoge toets vasthouden, lagere erbij → er gebeurt
      niets; de hoge los → de lage klinkt.
- [ ] **Twee toetsen overlappend spelen** (legato) → de toon verspringt, maar
      de envelope slaat **niet** opnieuw aan. Dat is hoe de firmware het nu
      doet (FW-10), niet hoe het hoort. Klinkt het zo, dan klopt de sim.
- [ ] **Glide** open → de toon glijdt naar de volgende noot. De allereerste
      noot na het starten glijdt niet.

### A3. Unison

MIDI-In: UNI aan, SPRD open, in een 4-stemmige patch.

- [ ] Eén toets → een dikke, zwevende toon (alle stemmen op dezelfde noot,
      uit elkaar gestemd). SPRD dicht → één schone toon.

### A4. Wat bewust anders klinkt dan vroeger

Deze zijn nieuw in de simulator, omdat de hardware het zo doet.

- [ ] **VCA zonder CV-kabel is stil**, hoe je de Gain-knop ook draait.
- [ ] **VCO Coarse draaien terwijl een noot klinkt** → er gebeurt niets tot
      de volgende noot.
- [ ] **AHDSR met Loop aan** → hij herhaalt één keer en blijft dan op het
      sustain-niveau staan (geen LFO-achtig lussen).

### A5. De sequencer

Test-patch met de SEQ-16 op **Run = Free**.

- [ ] De sequencer speelt meteen na Start, ook zonder dat je iets aanraakt.
- [ ] De **stap-lampjes** en het stap-display lopen mee; BPM staat naast Rate.
- [ ] **Een toets indrukken** → de toon verspringt naar jouw noot tot de
      volgende stap; daarna neemt de sequencer het weer over (twee kabels op
      één ingang: de laatste verandering wint, zoals op de Teensy).
- [ ] **Stop** → stil, ook al tikt de sequencer intern door. **Start** → hij
      speelt weer.
- [ ] In een poly-patch met een sequencer erop speelt **elke stem** de
      sequencer-noot (zo vouwt de firmware het ook uit).

### A6. Losse dingen

- [ ] **Plaits solo**: de rechterkant (aux) klinkt nu ook — die was in de sim
      altijd stil.
- [ ] **Draw-VCO**: open de tekenmodal (zonder Teensy) en teken → je hoort
      de nieuwe golfvorm meteen.
- [ ] **Noise**: Color wit → roze → bruin wordt steeds donkerder.
- [ ] **LFO**: Bip uit → de modulatie gaat alleen nog omhoog; de Inv-uitgang
      is het spiegelbeeld.
- [ ] **Mod-wiel / pitch-bend** van een MIDI-keyboard op `tune` van een VCO →
      bend werkt, vibrato via het mod-wiel werkt.

### A7. Zwaar werk

Poly ▾ → de stresspatches (Strings ×16, Comb per stem ×16, Alles tegelijk ×8).

- [ ] Geen gekraak of haperingen. Kraakt het wel: welke patch, en is het
      meteen of pas na een tijdje?

---

## Deel B — Teensy naast de simulator

**Voorbereiding.** Flash de nieuwste firmware (hij bevat Noise; controleer
met `hello` dat de versie klopt — zie de todo, sectie 1). Laad dezelfde
patch op de Teensy en in de editor. Klik in het simulatiepaneel op
**⇄ Vergelijk met Teensy**: links hoor je de Teensy, rechts de simulator.
Zie [teensy-aan-de-pc.md](teensy-aan-de-pc.md) als de Teensy-ingang niet
gevonden wordt.

Bij elk punt is de vraag: **klinken links en rechts hetzelfde?** Ook als
het allebei "fout" klinkt — dan klopt de simulator en is de firmware aan de
beurt.

### B1. Eerst de nulmeting

- [ ] **Test-patch, SEQ op Off, één noot** → zelfde toonhoogte, zelfde
      klank, ongeveer even hard links en rechts. (Tientallen ms verschil in
      timing is normaal.)
- [ ] **4-stemmig, akkoord** → zelfde akkoord aan beide kanten.

Klopt dit niet, stop dan hier en laat het me weten: dan zit er iets
fundamenteels scheef en zegt de rest weinig.

### B2. Dingen die op de hardware waarschijnlijk fout zijn

Hier verwacht ik dat beide kanten **hetzelfde fout** klinken. Daarna kiezen
we of de firmware gerepareerd wordt.

- [ ] **Comb**: speel C4 → hij resoneert rond 148 Hz in plaats van 262 Hz
      (bijna een octaaf te laag), en een octaaf hoger spelen maakt de toon
      maar ~1,4× hoger. *Beslissing:* comb repareren (klankverandering)?
- [ ] **Ladder met drive 3–4** achter een luide VCO → harde klikken of een
      raspende foldover. *Beslissing:* klemmen, zoals bij de MS-20?
- [ ] **Compressor, CV op `thr_cv`** → nauwelijks compressie, want de CV
      wordt letterlijk als dB gelezen (0..1 dB). *Beslissing:* schalen naar
      het knopbereik?
- [ ] **AHDSR met Loop** → één herhaling, dan sustain. *Beslissing:* echte
      lus maken?
- [ ] **Mono overlappend spelen** → geen nieuwe aanslag (FW-10).
      *Beslissing:* retrigger-puls bouwen (de hertrigger-flank uit de todo)?
- [ ] **VCO Coarse tijdens een noot** → pas bij de volgende noot.
      *Beslissing:* één regel fix?
- [ ] **VCA Gain-knop** → doet niets. *Beslissing:* laten meewerken of van
      het paneel halen?
- [ ] **Octa-VCO zonder aan Level te draaien** → luider dan het paneel doet
      vermoeden (firmware 0,8, paneel 0,5).

### B3. Wat al klaarstond (uit de todo, sectie 2)

- [ ] **MS-20** met resonantie open en drive erbij → schoon zelf-oscilleren,
      geen foldover meer.
- [ ] **PRIO low/high en terugvallen** op de hardware (zoals A2).
- [ ] **Unison met spread** → links en rechts even breed.
- [ ] **Auto-wah op de sampler** (Poly ▾ → Sampler ×8 auto-wah) → het filter
      ademt mee met hard en zacht spelen, aan beide kanten.

### B4. Nieuw in de firmware

- [ ] **Noise**: wit, roze en bruin → links en rechts dezelfde kleur. (Zelfde
      reeks; alleen de USB-weg ertussen verschilt.)

---

## Na afloop

Voor elk punt uit B2 is een keuze nodig: repareren (en dan de simulator
meenemen, zodat ze gelijk blijven) of zo laten. Geef per punt "fix" of
"laten" door, dan kan ik ze in één firmwaresessie afwerken — het liefst met
de Teensy aan de kabel, zodat je elke fix meteen hoort.
