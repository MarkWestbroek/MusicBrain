# RATCHET — stapsequencer voor roffels (plan)

*Gebouwd 2026-10-27 als fw 0.5.114 (zie §8). Voorstel van dezelfde dag. Aanleiding: hi-hat-roffels voor Dark trap in de Freestyle-machine (analyse en eisen van de FREESTYLE-sessie). Nog niets gebouwd.*

## 1. Waarom een module

Een trap-roll is een hat die binnen één stap twee, drie, vier, zes of acht keer slaat, vaak met oplopende kracht en soms met een toonsweep. Met wat er is lukt dat maar half:

- CLOCK `x3` geeft op het gevoelde tempo (genoteerd 140, gevoeld 70) de zestiendentriool. Een `x6` voor de 32e-triool ontbreekt.
- Een vaste roll per maat kan met een tweede EUCLID als venster, LOGIC *and* met `x3` en LOGIC *or* met de Grids-hat. Dat zijn vijf modules voor één rolvorm, zonder velocity-ramp en zonder sweep.

RATCHET doet het in één module, op de klok die er al is.

## 2. Wat de module doet

Zestien stappen op een stapklok (CLOCK `x4`). Elke stap heeft een ratchet-stand:

| Stand | Betekenis | Op genoteerd 140, stap = zestiende |
|---|---|---|
| uit | rust | |
| 1 | één slag (gewone stap) | zestiende |
| 2, 4, 8 | zoveel slagen gelijk verdeeld over de stap | 32e, 64e, 128e |
| 3, 6 | idem | 32e-triool, 64e-triool |
| 3:2 | drie slagen over deze en de volgende stap | **zestiendentriool** (6 per tel) |
| 3:4 | drie slagen over vier stappen | achtstetriool (= CLOCK `x3`) |

Een triool past niet binnen één zestiende: de gewone trap-roll (zestiendentriool, in het gevoelde 70 de 32e-triool) verdeelt drie slagen over **twee** zestienden. Daarom de standen 3:2 en 3:4. Een stap die door een 3:2 of 3:4 wordt overspannen, wordt overgeslagen; zijn eigen stand telt dan niet.

Er is geen eigen tempo: de module meet de klokperiode en deelt die op.

Over een roll (stand 2 of hoger) lopen twee CV's mee:

- **accent**: van `base` naar `base + ramp` over de slagen van de roll (ramp negatief = aflopend). Bij een enkele slag is accent `base`.
- **pitch**: van 0 naar `sweep` halve tonen over de roll, als V/oct (1 V per octaaf). Bij een enkele slag 0.

Beide worden vlak vóór de opgaande flank gezet en blijven staan tot de volgende slag, zodat PEAKS ze op de trigger leest.

## 3. Poorten en knoppen

| Dir | portId | Kind | Betekenis |
|---|---|---|---|
| in | `clock` | Gate | Stapklok, normaal CLOCK `x4` |
| in | `reset` | Gate | Terug naar stap 0 |
| in | `ab` | Gate | Hoog = patroon B |
| in | `roll` | Gate | Zolang hoog: elke stap speelt de `roll`-stand (fill) |
| in | `ratchet_cv` | Cv | 0..1 telt 0..5 standen op bij elke stap die niet `uit` is |
| in | `thru` | Gate | Wordt met de eigen slagen ge-or'd (Grids-hat erdoor, rolls erbij) |
| out | `gate` | Gate | Slagen |
| out | `accent` | Cv | 0..1, per slag |
| out | `pitch` | Cv | V/oct-offset, per slag |
| out | `step` | Gate | Eén puls per stap (voor koppelen of het lampje) |

`thru` scheelt in de gewone opstelling de LOGIC *or*: twee kabels op één ingang tellen niet op ("laatste wint"). Een `thru`-slag krijgt accent `base` en pitch 0, tenzij hij samenvalt met een eigen slag.

Knoppen:

- `a_1`…`a_16`, `b_1`…`b_16`: ratchet-stand per stap, keuze `uit|1|2|3|4|6|8|3:2|3:4`. Standaard staat A op alles `uit` behalve een paar voorbeeldrolls; B is leeg.
- `length` 1..16 (geldt voor A en B).
- `base` 0..1, `ramp` −1..1, `sweep` −12..+12 halve tonen.
- `roll` keuze `2|3|4|6|8|3:2` (standaard 3:2, de gewone trap-roll).

`ratchet_cv` schuift alleen de standen 1…8 op (in de volgorde 1, 2, 3, 4, 6, 8); 3:2 en 3:4 blijven staan.
- `width` 10..90 % van de deelperiode (standaard 50).

## 4. Timing

De module is een `CvModule` op 1 kHz, net als EUCLID en CLOCK.

- **Periode meten met swing.** CLOCK `x4` swingt: de stappen zijn om en om lang en kort. De module bewaart daarom de laatste twee periodes en deelt een stap op met de periode van **dezelfde pariteit**, twee stappen terug. Zonder swing zijn beide gelijk.
- **Slagmomenten.** Slag *k* van *n* valt op `k·P/n` ms na de klokflank, opgeteld als float en afgerond op de tick. De jitter is hooguit 1 ms; bij 140 bpm is de stap 107 ms en stand 8 geeft 13,4 ms tussen de slagen.
- **Overspannende standen.** Bij 3:2 is `P` de som van de laatste lange en korte periode, dus de swing middelt vanzelf uit; bij 3:4 twee keer die som. De klokflanken binnen de overspanning starten de stap niet opnieuw (zie harde sync), maar corrigeren wel de resterende slagen als het tempo verandert.
- **Gatebreedte.** `width` van de deelperiode, minimaal 2 ms hoog en minimaal 1 ms laag, zodat PEAKS elke flank ziet. Bij een deelperiode onder 3 ms (alleen bij absurde tempo's) zakt de stand terug naar de grootste die past.
- **Harde sync.** Elke klokflank buiten een overspanning start de stap opnieuw. Slagen die nog openstaan vervallen, dus een tempowissel of een haperende klok loopt nooit uit de pas.
- **Eerste stap na reset of start.** Er is nog geen periode: die stap speelt één slag, de rest volgt zodra er gemeten is.

## 5. Kosten

Een paar vergelijkingen per tick en geen audio. Op de Teensy is dat verwaarloosbaar; bij de release toch één `getStatus` vóór en na, volgens de gewone regel.

## 6. Stappen

1. **Firmware**: `RatchetModule.h` (typeId `tp_mmb_ratchet`), registratie, header met poortkaart zoals EuclidModule.
2. **Wasm**: `ratchet_wasm.cc` via `cvhost.h`, regel in `build.sh`.
3. **Tests** (vitest, wasm):
   - stand 3, 6 en 3:2 op 140 bpm: slagen op de juiste ms;
   - swing 60 %: lange en korte stappen elk goed opgedeeld;
   - reset, A/B-wissel, `roll`, `ratchet_cv`;
   - `thru` or'd;
   - accent- en pitch-ramp over een roll.
4. **Paneel en seed**: twee rijen van zestien kleine keuzeknoppen (A boven, B onder) met een display per stap, plus de zes losse knoppen. Seed "🥁 RATCHET + PEAKS": CLOCK → RATCHET → PEAKS, met een Grids-hat op `thru`.
5. **Contractketen**: `contract_dump.py` → `npm test` → `npm run catalog` → release-log, fw-tag.
6. **Teensy**: flashen (Mark), `getStatus`, een roll horen.
7. **Freestyle**: de FREESTYLE-sessie zet RATCHET in Dark trap (`freestylePatch.ts`), met `roll` op de FILL-knop en `ratchet_cv` voor de Autopilot.

Stap 1–5 kunnen in één ronde; 6 en 7 volgen.

## 7. Open vragen voor Mark

1. **Accent per stap?** Nu krijgt alleen een roll een ramp; een enkele slag is altijd `base`. Een accent-schakelaar per stap kost 32 knoppen extra. Voorstel: niet nu, eerst horen.
2. **Lengte per patroon?** Voorstel: één `length` voor A en B.
3. **Roll-stand:** vaste knop (voorstel) of ook als CV?
4. **Paneelbreedte:** 32 keuzeknoppen passen op ongeveer 20 HP. Liever smaller met alleen patroon A zichtbaar en B achter een schakelaar?

## 8. Gebouwd (fw 0.5.114, 2026-10-27)

Mark nam de vier voorstellen van §7 over. Afwijkingen van het plan:

- De knop voor de roll-stand heet `rollstand`, niet `roll`: de Roll-gate-ingang heet al `roll`, en een poort en knop met dezelfde naam botsen in de plugins.
- Standaardpatroon A: hats op de achtsten, 3:2 op stap 13, een dubbele op 16. B is leeg.
- De Peaks-hat volgt accent noch V/Oct. De seed gebruikt daarom de CR-78-hat, die nu ook V/Oct volgt.
- Tests: `editor/src/modular-mb/sim/wasmRatchet.test.ts` (standen 3, 6 en 3:2 op 140 bpm, swing, accent- en pitch-ramp, A/B, Roll, Rat+, Thru, Length, Reset).
- Stap 7 gedaan (FREESTYLE-sessie, dezelfde avond): Dark trap `hats: 'ratchet'` in `editor/src/freestyle/style.ts` en `freestylePatch.ts` (Grids-hat op `thru`, CR-78-hat, Roll op de FILL via LOGIC `gt`; standen per sectie, B via dezelfde knoppen zodat `ab` los blijft). `ratchet_cv` voor de Autopilot nog niet aangesloten.
- Nog open: Teensy flashen, `getStatus` en een roll horen (stap 6).
