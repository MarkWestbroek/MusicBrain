# CONV: convolutiegalm (voorstel 2026-10-14)

Mark: "wil je al met de conv starten?" Vervolg op
[hall-reverb.md](hall-reverb.md) §5. HALL is algoritmisch (Lexicon-stijl);
CONV is de andere familie: de galm van een échte ruimte of een échte machine,
vastgelegd als impulsrespons (IR). Dat is ook hoe de "Bricasti-klank" buiten
de M7 zelf bestaat (gesampelde presets, Seventh Heaven).

> **Besluiten (Mark, 2026-10-14):** 1 gegenereerde IR's + vrije CC-sets,
> zelf opnemen in stap 4; 2 maximum mag ruimer dan 2 s als het kan (de kern
> gaat tot 4 s; de Teensy-grens volgt uit de meting); 3 Size erbij (rekt de
> IR op: een grotere of kleinere ruimte); 4 eerst CONV, dan Cloud Seed.
> Zware varianten later eventueel op een effectenkaart (BACKLOG HB-5).
>
> **Stand 2026-10-14:** stap 1 gebouwd: kern `mmb_dsp/conv.h` (eigen reële
> FFT, partities 64 … 4096, de grote verdeeld over de tikken, 6 gegenereerde
> ruimtes), wasm, `wasmConv.test.ts` (exact tegen directe convolutie,
> vertraging, galmtijden, Size, Length). Stap 2 (paneel, front, seed) ook
> klaar. Stap 3 (Teensy) gemeten en te zwaar: zie §8.

Eerst de werkwijze, dan de techniek.

## 1. De werkwijze

Een module **CONV**, stereo uit, voor op de bus of achter een stem.

- **IR kiezen** met een knop en een naamdisplay (zoals Program bij Elements),
  uit een bank: een paar meegeleverde IR's plus wat je zelf laadt.
- **Een IR laden**: een `.wav` op de module slepen of via een knop (zoals
  de wavetable-import en de sampler). Mono of stereo; langer dan het
  maximum wordt afgekapt met een korte uitfade.
- **Knoppen**: Mix, Pre-delay, **Length** (de staart inkorten met een
  uitfade, scheelt ook rekentijd), **Size** (de IR sneller of trager
  afspelen: een grotere of kleinere ruimte, zonder nieuwe opname), Lo cut
  en Hi cut op de galm, Width.
- Geen Freeze: een convolutie heeft geen lus. Wie wil bevriezen zet HALL
  erachter.

## 2. Waar de IR's vandaan komen

Alleen met een heldere licentie (de site toont ze en Imprint publiceert de
patches):

1. **Gegenereerd** (eigen code, zoals de Snaarbank-"Space"): ruis met een
   uitsterving per band. Altijd beschikbaar, nul licentievragen.
2. **Zelf opgenomen**: een sinussweep afspelen in een ruimte en opnemen;
   een klein script rekent de IR uit (Farina-deconvolutie). Kan met de
   Teensy of de pc. Eigen ruimtes, eigen apparaten (de PCM 91 als hij er
   komt: dan heb je die klank ook als IR).
3. **Vrije bibliotheken**: OpenAIR (University of York; licentie per IR,
   meestal Creative Commons — per IR controleren en vermelden) en
   vergelijkbare sets.
4. **Eigen IR's van de gebruiker**: gekochte of gratis sets waarvan
   gebruik in producties mag, maar herverspreiden niet (zoals de
   gesampelde Bricasti M7-set van Samplicity: eerst de readme lezen). Die
   gaan **nooit in de repo of op de site**; de editor laadt ze lokaal
   (slepen of kiezen), ze gaan via de link naar de SD van de eigen Teensy,
   en een patch bewaart alleen de naam. Deelt iemand zo'n patch, dan
   meldt de editor dat de IR ontbreekt en kiest hij een meegeleverde.

## 3. Techniek

- **Opgedeelde FFT-convolutie** (partitioned convolution). Gewoon
  uniform opdelen in blokjes van 128 is op de Teensy te duur: voor een
  IR van 2 s zijn dat ~700 complexe vermenigvuldigingen per sample.
  **Niet-uniform** (Gardner 1995): de kop in kleine blokken (geen
  vertraging), de staart in steeds grotere (256 … 4096). Dat brengt het
  terug naar enkele tientallen per sample. Schatting op de Teensy: een
  mono IR van 2 s ~5–10 % cpu, stereo het dubbele. Meten na stap 3.
- FFT: CMSIS-DSP `arm_rfft_fast_f32` op de Teensy (zit in de core), een
  eigen kleine FFT in de kern voor de simulator — of overal dezelfde
  eigen FFT, als die snel genoeg is (meten).
- **De grote blokken** rekenen we niet in één audioblok uit, maar verdeeld
  over de blokken van hun periode (anders een piek elke 4096 samples).
- **Geheugen**: per partitie het spectrum van de IR plus de ingangsgeschiedenis,
  ~2× de IR-lengte in complexe getallen: een stereo-IR van 2 s ≈ 1,4 MB.
  Dat moet in **PSRAM**, en dat kan: de toegang is op volgorde (per
  partitie een aaneengesloten blok), niet verspreid zoals in een tank
  (FxMem.h). Zonder PSRAM: een korte IR op de heap (~0,5 s).
- **Als de Teensy krap is: de staart op halve samplerate.** Het hoog is na
  een paar honderd ms uitgestorven; de kop blijft op 44,1 kHz, de staart
  (de blokken van 4096) rekent op 22 kHz. Halveert de kosten van de staart
  zonder hoorbaar verschil. Pas doen als de meting tegenvalt. (Niet de hele
  IR naar 16 kHz: dan is alles boven 8 kHz weg.)
- **Stereo**: mono IR → beide kanten met wat decorrelatie, of een
  stereo-IR (L→L, R→R). "True stereo" (vier IR's) pas later, is 2× zo zwaar.
- **Size** = de IR bij het laden herbemonsteren (niet tijdens het spelen):
  draaien rekent de spectra opnieuw uit, op de achtergrond, en wisselt dan.
- **Opslag**: de IR's als bank, zoals de sampler (`bankPut` via de link,
  op de SD van de Teensy); in de patch alleen de naam en de knoppen. Eén
  kern (`mmb_dsp/conv.h`) voor Teensy en simulator.

## 4. Hoe we weten dat hij goed is (tests)

- Een tik erin geeft exact de IR terug (binnen afrondingsfouten), ook over
  de grenzen van de partities heen.
- Vergelijking met directe convolutie op een willekeurig signaal.
- Geen tikken bij het wisselen van IR of Size (overvloeien).
- Latentie 0 (de kop in kleine blokken) en cpu-pieken vlak (verdeelde grote
  blokken) — op de Teensy meten.

## 5. Stappen

1. Kern `mmb_dsp/conv.h` (FFT + niet-uniforme partities) + simulator +
   tests van §4, met een gegenereerde IR.
2. Paneel, IR-bank met naamdisplay, `.wav` laden in de editor, help,
   front, seed.
3. Teensy: PSRAM, `bankPut`, SD; cpu meten.
4. Een sweep-script om zelf IR's op te nemen; een eerste set eigen IR's.
5. Sitepagina.

## 6. Bronnen

- W. G. Gardner, "Efficient Convolution without Input-Output Delay",
  J. Audio Eng. Soc. 43(3), 1995.
- A. Farina, "Simultaneous Measurement of Impulse Response and Distortion
  with a Swept-Sine Technique", AES Convention 108, 2000.
- OpenAIR, University of York (licenties per IR).

## 7. Vragen voor Mark

1. **IR's om mee te beginnen**: gegenereerd + vrije CC-sets (OpenAIR), en
   zelf opnemen in stap 4 — goed? Of liever meteen het sweep-script?
2. **Maximale lengte op de Teensy**: 2 s stereo (≈ 1,4 MB PSRAM) als
   grens, of ruimer (4 s, dan ~3 MB en meer cpu)?
3. **Size** (de IR herbemonsteren) erbij, of alleen Length?
4. **Volgorde ten opzichte van Cloud Seed** (zie
   [hall-reverb.md](hall-reverb.md) §8): eerst CONV, eerst Cloud Seed, of
   Cloud Seed alleen als referentie?

## 8. De Teensy-meting (2026-10-14)

- CONV met de Hall-IR (2,6 s) op de Teensy: **82 % cpu**. Uitgesplitst
  (bench `conv`, cycli per sample): MAC 38 700, IFFT 11 200, FFT 7 100,
  kopiëren 4 100; samen ~4,5× het budget van een sample (13 600). (De
  bench draait zonder interrupts en telt anders dan de audio-meter; de
  verhouding tussen de delen is wat telt.)
- Oorzaak: de **PSRAM**. Bench `psram`/`ram2`: doorlezen kost 64 cycli per
  float uit PSRAM (~37 MB/s), 4 uit RAM2; ook 32 KB "in de cache" kost al
  15. Convolutie leest per partitie per periode de hele ingangs- en
  IR-spectra; met alles in PSRAM is dat de grens.
- Wat het theoretisch kan worden: per partitie in PSRAM minstens ~6 floats
  per sample (ingang + IR links + IR rechts). Met de kleine blokken op de
  heap, de MAC per stukje bins (accumulator lokaal), de spectra in 16 bit en
  de FFT's in een snelle kladruimte schat ik **~1 s stereo rond 20–25 %**,
  2 s rond 35–45 %. Veel werk, en de heap is krap (HALL).
- Keuzes:
  1. **Kort op de Teensy**: CONV optimaliseren voor IR's tot ~0,5–1 s
     (kamers, platen, vroege reflecties); de simulator houdt 4 s.
  2. **Hybride**: de kop (0,3–0,5 s, het karakter van de ruimte) met
     convolutie, de staart met de HALL-tank, afgestemd op de galmtijd per
     band van de IR. Zo doen veel hardware-galmen het.
  3. **Lang alleen op een effectenkaart** (BACKLOG HB-5); de Teensy krijgt
     CONV voorlopig niet.
- **Bijgesteld (zelfde avond):** de schatting hierboven vergat het kopiëren
  rond de FFT's (ring → klad → FDL, acc → klad → uitgang) en het lezen van
  de uitgangsbuffers: per niveau in PSRAM ~12 floats per sample bovenop de
  6 per partitie. Alleen al het PSRAM-verkeer kost dan, met alle
  optimalisaties: 0,25 s ≈ 40 % cpu (of 20 % als de blokken t/m 1024 in
  ~170 KB heap passen, wat naast HALL niet kan), 1 s ≈ 65 %, 2 s ≈ 95 %.
  **Keuze 1 en 2 halen het dus niet**: convolutie hoort op de Teensy 4.1
  niet thuis.
- De proefbouw (ConvModule.h, bench `conv`/`psram`) staat op de branch
  `proef/conv-teensy`, niet in een release; de Teensy draait weer 0.5.113.
- Advies: CONV blijft in de simulator (4 s, zoals gebouwd); lang op
  hardware via de effectenkaart (BACKLOG HB-5). Voor de Teensy eventueel
  later: een IR "nabootsen" met HALL (de editor meet de galmtijd per band en
  de vroege reflecties uit de IR en zet HALL daarop), goedkoop en met
  dezelfde kern in simulator en Teensy.

