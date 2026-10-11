# Onze filters naast Circuit Studio (2026-10-11)

Circuit Studio (circuit.synthcity.org, dharma-1) simuleert analoge filters op
onderdeelniveau; de maker heeft de Moog-ladder, Wasp, SEM en IR3109
vergeleken met echte hardware. Via hun MCP-server (`circuit-studio`) leggen we
onze kernen ernaast. Zie ook [dsp-check-2026-10.md](dsp-check-2026-10.md).

Methode: hun kleinsignaalrespons (`ac`) op een rij frequenties; die van ons
met zachte sinussen (0,05) door de wasm-kern, zodat hij lineair blijft. De
absolute niveaus verschillen (volt tegen samplewaarden), dus alles is
genormeerd op het laag (100 Hz).

## 1. Moog-ladder: `tp_mmb_ladder` tegen "Transistor ladder (classic 4-pole)"

Hun schakeling: PNP-ladder op transistorniveau (2100-stijl kern); Cutoff is
geijkt in Hz en geeft de **−3 dB-frequentie van het geheel**, Resonance 0..1.
Onze ladder had het algoritme van `AudioFilterLadder` uit de Teensy Audio
Library (sinds fw 0.5.103 een eigen kern met hetzelfde algoritme); zijn Cutoff
ligt dichter bij de piekfrequentie. Hun "1 kHz" komt overeen met onze cutoff
≈ 2210 Hz.

**Zonder resonantie** (t.o.v. 100 Hz):

| Frequentie | Circuit Studio, RES 0 | Onze ladder, q 0 |
|---|---|---|
| 1000 Hz | −3,0 dB | −3,3 dB |
| 2000 Hz | −9,7 dB | −10,8 dB |
| 3000 Hz | −17,2 dB | −19,1 dB |
| 4000 Hz | −24,1 dB | −26,6 dB |
| 8000 Hz | −44,5 dB | −48,2 dB |

Zelfde vorm; de onze valt boven de cutoff 1–4 dB steiler af.

**Met resonantie:**

| | Circuit Studio, RES 0,9 | Onze ladder, q 1,0–1,3 |
|---|---|---|
| Piek | 2210 Hz, +19,2 dB boven het laag | 2050–2210 Hz, +17,5 … +20,4 dB |
| Laag zakt t.o.v. zonder resonantie | **−12,7 dB** | **−3,6 … −4,7 dB** |

Het grote verschil is **het wegzakken van het laag** bij resonantie. Bij een
echte transistorladder is de doorlaatversterking 1/(1+k), met k de
terugkoppeling (k = 4 bij zelf-oscillatie): bij k ≈ 3,6 is dat −13 dB, precies
wat Circuit Studio laat zien. Onze ladder compenseert dat bewust half: de
bibliotheek heeft een *passband gain compensation* (`pbg`, standaard 0,5).
Dat is een keuze, geen fout: veel moderne ladders doen het. Een knop "Bass"
of "Comp" (0 = als het origineel, 1 = volledig gecompenseerd) zou beide
mogelijk maken.

Grove omzetting van hun Resonance naar onze q: RES 0,6 ≈ q 0,6; RES 0,9 ≈
q 1,2.

## Nog te doen

- Ladder: gedrag bij harder aansturen (THD, samendrukken) en zelf-oscillatie.
- SEM: `tp_mmb_sem` tegen "SEM-style Multimode SVF" en "EFM-3521 VCF".
- MS-20: `tp_mmb_ms20` tegen "Early MS-20-style lowpass" (`korg35-lpf`):
  vooral zelf-oscillatie (bij ons alleen met drive, en een kwint te laag).
