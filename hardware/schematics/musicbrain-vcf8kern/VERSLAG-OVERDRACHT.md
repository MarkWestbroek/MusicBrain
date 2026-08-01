# VCF8-kern - verslag en overdracht

Datum: 2026-07-31

## Eindstand

De VCF8-kernkaart rev 0.1 is volledig gerouteerd en reproduceerbaar vanuit de
generator. Een volledige generatorrun, gevolgd door KiCad 10.0.4 DRC met
opnieuw gevulde zones, geeft:

- 0 DRC-violations;
- 0 unconnected items;
- ERC 0 en netcheck OK volgens de bestaande projectvalidatie.

Het gegenereerde bord staat in `musicbrain-vcf8kern.kicad_pcb`. De generator
`hardware/kicad-generators/gen_vcf8kern.py` blijft de bron van waarheid.

## Uitgevoerde afronding

De laatste handroutes zijn in de generator opgenomen:

- MOUT7 gaat lokaal via `In1.Cu` onder OUT48 door;
- MODE0 en MODE1 zijn gesloten;
- AOUT3 is via een vrije `In1.Cu`-route met J3.4 verbonden;
- de resterende GND-zone-eilanden zijn verankerd;
- rond U2.10 is de redundante IN12-lus geopend voor een GND-via;
- rond U18.8 zijn MN8_7 en +3V3 lokaal omgelegd voor een GND-via-in-pad;
- footprintpaden in `cardlib.py` werken op macOS en Windows.

Tijdens de generatorrun zijn meldingen als
`MISLUKT (1): ['GND']` en
`NIET: ['C905.2', 'U18.8', 'U2.10']` verwacht. Ze komen uit de algemene
afmaker; de definitieve handroutes aan het einde van de generator lossen deze
gevallen alsnog op. De afsluitende DRC is leidend.

## Reproduceren en controleren

Vanaf de repository-root:

```sh
cd hardware/kicad-generators
python3 gen_vcf8kern.py
cd ../..
/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli pcb drc \
  --severity-error --exit-code-violations --refill-zones \
  hardware/schematics/musicbrain-vcf8kern/musicbrain-vcf8kern.kicad_pcb
```

Verwacht eindresultaat:

```text
Found 0 violations
Found 0 unconnected items
```

De generator gebruikt deze blijvende invoerbestanden uit de bordmap:

- `musicbrain-vcf8kern.ses`;
- `gnd_stitch.json`;
- `gnd_orphans.json`.

Niet verwijderen: zonder deze bestanden is het huidige resultaat niet op
dezelfde manier reproduceerbaar.

## Volgende stappen

1. Genereer het fab-pakket met `bash make_fab.sh "musicbrain-vcf8kern"` vanuit
   `hardware/kicad-generators/`.
2. Controleer Gerbers, drills en de 4-laags stack-up.
3. Controleer in de JLC-preview alle rotaties en beide assemblagezijden.
4. Houd de AD5754 buiten de eerste goedkope assemblage als Route B wordt
   gevolgd; plaats de SSI2140's later met de hand.
5. Voer daarna de rev-0.1 bench-tests uit: voedingsrails, DAC-uitgangen,
   SSI2140-niveaus, pole-mix-modi, resonantie en tune-lus.

Zie voor achtergrond en ontwerpdetails `README.md`. De uitgebreide historische
overdracht staat in `doc/plans/vcf8kern-handover.md`.
