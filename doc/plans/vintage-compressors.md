# Vintage compressors (en een Pultec) voor MusicBrain

> Backlog: **FW-FX-3** (`doc/BACKLOG.md` §2.4). Opgesteld 2026-09-22.
> Status: alles gebouwd — FET (fw 0.5.58–0.5.60), Opto (0.5.61), VCA-bus,
> Vari-mu en Program EQ (0.5.62), Diodebrug (0.5.63). Nog open: inregelen op
> het oor.

## Waarom

Een compressor maakt geluid, niet alleen niveau: de beroemde apparaten klinken
elk anders door hun detector, hun topologie en hun regelelement. Dat karakter
is op de Teensy goed na te bootsen, en in de sim met dezelfde kern.

Eén regel voor MusicBrain: tussen modules gaat audio als 16 bits. Wat een
module aan zijn uitgang hard op ±1 afknipt, kan een compressor erachter niet
meer herstellen. Een compressor is dus voor dynamiek en kleur. Tegen clippen
hoort een limiter in de bron zelf; de sampler heeft er sinds fw 0.5.57 een
(`mmb_dsp/limiter.h`).

## De apparaten

De getallen zijn van handleidingen en veelgeciteerde specificaties en zijn
indicatief. Controleer ze voordat je een model inregelt.

| Apparaat | Techniek | Aanval / loslaten | Ratio | Karakter | Typisch voor |
|---|---|---|---|---|---|
| **Teletronix LA-2A** (1965) | **Opto**: een lampje en een lichtgevoelige cel (T4), buizenversterker erachter | Traag en vast: aanval ~10 ms. Loslaten in twee stappen: ~60 ms voor de eerste helft, daarna 1–15 s, afhankelijk van wat er speelde | ~3:1 met zachte knie (*Compress*) of bijna begrenzen (*Limit*) | Heel vloeiend en warm. Twee knoppen: Gain en Peak Reduction | Zang, bas, strijkers |
| **UREI/UA 1176** (1967) | **FET** als regelbare weerstand, klasse-A versterker met transformator | Heel snel: aanval 20–800 µs, loslaten 50 ms–1,1 s. De knoppen lopen omgekeerd: 7 is het snelst | 4, 8, 12, 20. *Alle knoppen tegelijk* ("British mode") wordt wild en vervormd | Pittig en agressief. De vervorming groeit met het ingrijpen. De drempel ligt vast: je stuurt hem aan met Input | Drums, zang, gitaar |
| **Fairchild 660/670** (1959) | **Variable-mu**: buizen waarvan de versterking afneemt met de stuurspanning; ~20 buizen | Zes vaste standen: aanval 0,2–0,8 ms, loslaten 0,3–25 s. Stand 5 en 6 passen zich aan het programma aan | Loopt vanzelf op met het ingrijpen (zachte knie) | "Lijm", dik en warm. De 670 kan ook midden/zijkant (M/S) | Mixbus, mastering |
| **SSL G-bus** (1980s) | **VCA**, feed-forward | Aanval 0,1–30 ms (6 standen), loslaten 0,1–1,2 s plus **Auto** | 2, 4, 10 | Strak en schoon. Het ritmische "pompen" | Mixbus |
| **dbx 160** (1976) | **VCA** met RMS-detectie | Past zich aan het programma aan | Instelbaar, **OverEasy** (zachte knie) | Punchy; de meting volgt hoe luid we iets horen | Drums, bas |
| **Neve 33609 / 2254** (1969–) | **Diodebrug** als regelbare verzwakker | Aanval snel of langzaam, loslaten 100 ms–1,5 s plus Auto | 1,5–6 | Dik en gekleurd; oneven harmonischen die met het ingrijpen groeien | Mixbus, drums |
| **API 2500** (modern, klassieke opbouw) | **VCA**; schakelaar tussen feedback ("old") en feed-forward ("new") | Volledig instelbaar | Instelbaar, knie kiesbaar | *Thrust*: hoogdoorlaat in de detectie, minder pompen op de bas | Drums, bus |
| **Manley Vari-Mu** (1994) | Variable-mu | Traag | Loopt op met het ingrijpen | Moderne Fairchild-smaak, strakker | Mastering |

### Pultec EQP-1A: geen compressor

De Pultec (1951) is een **equalizer**. Hij hoort in hetzelfde vintage rijtje
en staat in bijna elke mixketen.

- **Passief filter**, met een buizenversterker en transformators om het
  verlies weer op te halen. Brede, muzikale curves.
- **Laag:** 20, 30, 60 of 100 Hz, met aparte knoppen voor *boost* en
  *attenuate*.
- **Hoog:** een boost tussen 3 en 16 kHz met instelbare breedte, en een
  afzwakking op 5, 10 of 20 kHz.
- **De Pultec-truc:** dezelfde lage frequentie tegelijk boosten en
  verzwakken. Omdat de curves net verschillend liggen, krijg je een stevige
  bas met een dip erboven: vol maar niet modderig.
- De **MEQ-5** is het broertje voor het middengebied.

## Wat je nodig hebt om ze na te bootsen

Alle compressors bestaan uit drie bouwstenen. Het karakter zit in hoe die zich
gedragen:

1. **Detector:** pieken of RMS, en het verloop van aanval en loslaten. De
   LA-2A is het lastigst: de cel "onthoudt" hoe hard het was, vandaar het
   loslaten in twee stappen (te modelleren met twee tijdconstanten en een
   geheugen). De rest gaat met een paar tijdconstanten.
2. **Topologie:** *feedback* (1176, LA-2A, Fairchild) meet de eigen uitgang en
   regelt bij, en klinkt zachter en muzikaler. *Feed-forward* (SSL, dbx) meet
   de ingang: preciezer en harder. Een feedback-compressor met ratio R haalt
   zijn statische ratio met `GR = (L_uit − T)·(R − 1)`.
3. **Regelelement en vervorming:** een VCA is vrijwel schoon. FET, diodebrug
   en buis vervormen meer naarmate ze harder ingrijpen: buizen vooral even
   harmonischen, diodes oneven. Dat is een verzadigingskromme waarvan de
   sterkte meeloopt met de gain reduction, eventueel met oversampling.

## Opzet in MusicBrain

- **Kern in `mmb_dsp`** (header-only, zonder heap), gedeeld door de firmware
  en de wasm van de sim. Zelfde patroon als de tape echo en de MS-20.
- **Eén module per apparaat**, met het paneel van dat apparaat: een LA-2A
  heeft twee knoppen, een 1176 zes. Dat speelt prettiger dan één module met
  modi. De bouwstenen (detector, gain computer, verzadiging) zijn gedeeld.
- **Stereo gekoppeld** (`in_l`/`in_r` → `out_l`/`out_r`, één detector over
  beide), zodat een stereobron (sampler, mix) niet uit het midden schuift.
  Mono = alleen `in_l` → `out_l`.
- **`mix`** (parallelle compressie, de "New York"-truc) en een CV-uitgang
  **`gr`** (gain reduction, 0..1) voor een meter of om iets anders mee te
  sturen.
- De bestaande `tp_mmb_comp` (generieke compressor + drive, alleen firmware)
  blijft zoals hij is.

### Volgorde

| # | Module | Waarom in deze volgorde |
|---|---|---|
| 1 | **FET** (1176-stijl) ✅ `tp_mmb_fet_comp` | Het bekendst en het meest herkenbaar; de snelle detector, de knie per ratio en vervorming die met het ingrijpen groeit leggen meteen de gedeelde bouwstenen neer |
| 2 | **Opto** (LA-2A-stijl) ✅ `tp_mmb_opto_comp` | Het tweede grote karakter: traag, met het geheugen in de cel |
| 3 | **VCA-bus** (SSL-stijl) ✅ `tp_mmb_bus_comp` | Eenvoudig na 1 en 2; de mixbus-lijm met Auto-release |
| 4 | **Vari-mu** (Fairchild-stijl) ✅ `tp_mmb_varimu_comp` | Ratio die met het ingrijpen oploopt, buisvervorming |
| 5 | **Pultec-EQ** ✅ `tp_mmb_program_eq` | Losse EQ-module: een paar filters naar de passieve curves plus buisverzadiging |
| 6 | **Diodebrug** (Neve-33609-stijl) ✅ `tp_mmb_diode_comp` | Oneven harmonischen die met het ingrijpen meegroeien; A1/A2 programma-afhankelijk |

Namen in de editor zonder merknamen (FET, Opto, VCA-bus, Vari-mu, Program EQ).
In de notes staat naar welk apparaat hij knipoogt.

## FET-compressor (stap 1): ontwerp

- **Controls:** `input` (dB; stuurt de vaste drempel aan, zoals de echte),
  `output` (dB), `attack` en `release` (1..7 zoals op het apparaat, 7 =
  snelst: aanval 800 → 20 µs, loslaten 1100 → 50 ms, logaritmisch
  verdeeld), `ratio` (4 / 8 / 12 / 20 / Alle), `mix` (0..1).
- **Topologie:** feed-forward, met een zachte knie per ratio. Een digitale
  feedbacklus met 20 µs aanval en ratio 20 oscilleert (stabiel alleen als de
  stap per sample < 2/R); het karakter zit in de snelle detector, de knie en
  de vervorming.
- **Alle knoppen:** ratio ~20, drempel lager, trager aanslaan (de transiënt
  schiet erdoor) en veel meer vervorming. Zo beschrijven gebruikers het
  karakter; de precieze vorm stellen we op het oor in.
- **Vervorming:** een verzadiging vóór de uitgangstrap waarvan de sterkte
  meeloopt met de gain reduction, plus een lichte asymmetrie (even
  harmonischen). Daarna een zachte uitgangsbegrenzing.
- **Tests:** statische ratio (stapjes in niveau → uitgangsniveau), aanvals-
  tijd, dat vervorming (THD) groeit met het ingrijpen, en dat Alle knoppen
  harder ingrijpt dan 20:1.
