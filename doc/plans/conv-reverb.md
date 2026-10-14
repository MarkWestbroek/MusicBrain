# CONV: convolutiegalm (voorstel 2026-10-14)

Mark: "wil je al met de conv starten?" Vervolg op
[hall-reverb.md](hall-reverb.md) §5. HALL is algoritmisch (Lexicon-stijl);
CONV is de andere familie: de galm van een échte ruimte of een échte machine,
vastgelegd als impulsrespons (IR). Dat is ook hoe de "Bricasti-klank" buiten
de M7 zelf bestaat (gesampelde presets, Seventh Heaven).

Ter review; niets gebouwd. Eerst de werkwijze, dan de techniek.

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
