# ADR 0017 – Keuzedisplay: een display dat ook kiest

## Status
Proposed (2026-10-30)

## Context

Veel modules kiezen uit een genummerde lijst met namen: de samplebank
(00–63), het DX7-programma, het Elements-programma, het Plaits-model, de
CONV-IR en de FOF-lettergreep. Op het paneel zijn dat twee losse dingen:
een **draaiknop** die het nummer zet, en een **display** (`kind: 'display'`
met `bindTo` en `lookup`) dat de naam toont. De speler leest de naam op het
display, maar moet aan de knop draaien.

Bij 16 standen ging dat. Bij 64 niet meer (Mark, 2026-10-30):

- slepen is te grof: één bank verder is een paar pixels;
- het muiswiel werkt, maar op een trackpad of telefoon is het er niet;
- + en − op het toetsenbord werken niet, want de knop houdt geen focus;
- het eigenschappenpaneel rechts heeft het wel, maar in een plugin (Logic)
  en in de speelmodus is dat er niet.

Hardware lost dit al lang op met een display dat je kunt bedienen: een
presetscherm met een encoder of ‹ ›-toetsen ernaast (de programmawisselaar
van een gitaarpedaal, Elektron, de meeste eurorack-modules met een scherm).
In een webinterface heet hetzelfde een *combobox*: een veld dat de keuze
toont en bij een klik de lijst opent.

## Decision

- **Een display kan ook kiezen.** Het blijft een display: het toont de
  waarde van de control waaraan het gebonden is (`bindTo`), en heeft zelf geen
  waarde. Bedienen schrijft naar die control, via hetzelfde pad als de knop
  (`onControlChange` → `setPatchControl`). Er komt geen tweede schrijfpad.
- **Klik op het display** opent een lijst met alle standen als
  "nummer · naam". Eén klik kiest en sluit de lijst; Escape of een klik ernaast
  sluit hem ook. De lijst rendert via een portal, zodat hij ook in een
  getransformeerde patcher-node werkt.
- **‹ en › aan de uiteinden** van het display zetten één stand terug of
  verder, binnen het bereik van de gebonden control.
- **Waar komen de namen vandaan?** Uit de `lookup` van het display, of, als
  ze pas tijdens het spelen bekend zijn, uit een bron in de editor. Bij de
  samplebank is dat de SD-kaart van de Teensy, de serverbank in de simulator
  of de bankmap van de plugin.
- **De draaiknop blijft er naast staan**, voor wie wil draaien, voor
  CV en automation, en omdat de firmware hem kent. Het keuzedisplay is een
  editorzaak: niets in de firmware of het contract verandert.
- **Touch** volgens de vaste regels (CLAUDE.md): `touch-action: none` op het
  display en de pijlen, de lijst zelf scrolt verticaal.

## Consequences

- Eerste toepassing: het bankstrookje van SAMPLER, TAPE STRIP en PERCUTER
  (`SamplerBankStrip` in `ModulePanel.tsx`, lijst in `BankPicker.tsx`). Daar
  staat ook "— laden…" achter de naam zolang de bank nog binnenkomt, want de
  naam is er eerder dan het geluid.
- Volgende stap, nog niet gebouwd: een veld `pick` op `DisplayControl`,
  zodat elk display met `bindTo` + `lookup` vanzelf een keuzedisplay wordt
  (DX7, Elements, Plaits, CONV, FOF). Het bankstrookje gaat dan in dat
  algemene display op.
- Op een patch-front is een keuzedisplay automatisch ook bedienbaar. Het
  front verwijst naar het display, en het display schrijft naar de control.
- De `lookup` wordt daarmee een echte keuzelijst, niet alleen een
  weergavetabel. Een naam die ontbreekt toont als "(leeg)" en is wel te kiezen.
