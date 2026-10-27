# De songs als MIDI

Eén Standard MIDI File (type 1) per stijl, uitgerekend uit dezelfde tabellen
als de patch (`editor/src/freestyle/style.ts`) en een port van de
Grids-drumkaart: precies de noten die de machine speelt, in de liedvorm
I V H V H B V H E (intro 4, vers 16, hook 8, vers 16, hook 8, break 4, vers 16,
hook 8, outro 4 maten). Maken: `cd editor; npx tsx scripts/freestyleMidi.ts dark`.

| Bestand | Stijl | Tempo | Toonsoort |
|---|---|---|---|
| `dark-140.mid` | Dark trap | 140 (gevoeld 70) | F♯ mineur |
| `trap-140.mid` | Trap half-time | 140 (gevoeld 70) | F mineur |
| `boombap-88.mid` | Boom bap | 88 | A mineur |
| `bounce-100.mid` | Bounce | 100 | G mineur |
| `acidhop-75.mid` | Acid hop | 75 | C mineur |
| `acidhop2-78.mid` | Acid hop II | 78 | C mineur |

## Sporen

| Spoor | Kanaal | Inhoud |
|---|---|---|
| 1 | – | tempo, maatsoort, toonsoort, markers per sectie (naam · akkoord) |
| KICK | 10 | GM 36, uit Grids (velocity 115 bij een accent, anders 92) |
| SNARE | 10 | GM 38, uit Grids |
| HATS | 10 | GM 42, uit Grids |
| BASS | 1 | de 808 / 303: de noten van de bassequencer op het slagpatroon |
| KEYS | 2 | het motief (e-piano), de akkoorden + lijn (met sustainpedaal CC64), of de Synthex-riff |
| PAD | 3 | het Mellotron-pad: één noot per maat of het hele akkoord, zo lang als de Div-puls hoog is |

## In Logic

- **Importeren:** sleep het bestand in een leeg project; Logic maakt per
  spoor een track en neemt het tempo over (vraag "Import tempo" met ja
  beantwoorden). De drums op één Drum Kit-track (kanaal 10) of elk apart.
- **De glijdende 808 (dark trap):** de glijder staat erin als gebonden noten
  (elke noot loopt een 32e in de volgende door). Een mono-synth met legato
  en glide ≈ 60 ms (bv. Retro Synth, ES2, of een 808-sample met glide) speelt
  dan precies de boog van de machine: liggende tonen zijn één lange noot,
  een losse stoot is kort (± 90 ms).
- **A/B-maten:** oneven maten (2, 4, …) zijn de B-maat zoals de machine die
  speelt (dunner, achter de tel). Te losjes? Dan is het de B-maat die je
  strakker wilt; de A-maat staat op de tel.
- **Strijkers:** het pad heeft in dark trap één aanzet per twee maten en
  wisselt alleen mineur/kwint. Dat is met opzet kaal; in Logic is dit het
  spoor om het eerst te herschrijven.
- **Fills:** de laatste maat van elke sectie (behalve de intro) heeft de
  fill-standen van de stijl, zoals de Autopilot dat doet.
- **Niet in het bestand:** swing (boom bap 0,18, bounce 0,08, acid hop 0,1:
  zet die in Logic op het spoor), Grids-chaos, DROP, de Autopilot-mutes.
