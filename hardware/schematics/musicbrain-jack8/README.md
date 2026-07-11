# MusicBrain jack8 — Thonkiconn-paneeldrager (8 jacks)

**Status**: schema ERC-schoon; PCB volledig geroute (DRC 0/0). Bord 20×125 mm.
**Zusje**: `musicbrain-jack4/` (4 jacks + 1×6 header, half zo hoog).

## Wat het is

Een passieve strip met **8× Thonkiconn** (PJ398SM = PJ301M-12 = WQP518MA,
onderling uitwisselbaar) op 15 mm steek, die als **frontpaneel-drager**
dient: de strip ligt horizontaal onder de bovenplaat, de schroefbussen steken erdoorheen en de moeren klemmen paneel
en printje op elkaar — geen extra steunen nodig.

## Aansluiting op de kaarten

- **J1** (1×10): 1 = GND, 2–9 = CH1..8, 10 = GND — hetzelfde contract als
  J2 op GATE8 én ADC8, dus één jack8 past op beide kaartsoorten.
- **Montage**: de female socket wordt op de **achterzijde** gesoldeerd
  (opening richting kaart); de kaart krijgt aan zijn frontrand een haakse
  male header. Het silkscreen op de achterzijde markeert de positie.
- Headerpositie: hart in het **midden van de strip**; de kaart heeft zijn
  paneelconnector recht boven het slotcentrum (spec-standaard), zodat elk
  jack-printje op elke kaart past en de strips op de bovenplaat uitlijnen.

## JP1: schakelcontact-normalling

Elke Thonkiconn heeft een schakelcontact (TN) dat bij een ongepatchte jack
tegen de tip ligt. Alle TN's zijn gebust naar één soldeerjumper **JP1**:

- **INPUT-kaart (ADC8): JP1 dichtsolderen** → ongepatchte ingangen lezen
  netjes 0 V.
- **OUTPUT-kaart (GATE8/DAC): JP1 OPEN laten!** Anders wordt elke
  ongepatchte uitgang via het schakelcontact naar GND kortgesloten
  (de 100R/1k serieweerstanden beperken dat, maar het hoort niet).

## Paneel

3U Eurorack: paneelhoogte 128,5 mm; boorpatroon = 8× Ø6 mm gat op 15 mm
steek, gecentreerd op de jackposities (eerste jack 8 mm van de bovenrand
van het printje). Printje zelf is 125 mm hoog.
