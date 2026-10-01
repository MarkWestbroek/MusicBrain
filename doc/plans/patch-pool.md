# Patch-pool: patches centraal bewaren, delen en bespreken

Datum: 2026-10-01. Status: voorstel, nog niets gebouwd. Aanleiding: Mark hecht
aan patches die hij op verschillende plekken heeft gemaakt (desktop, laptop,
live), wil geïnteresseerden een basisset meegeven, en wil dat anderen patches
kunnen voorstellen en vragen kunnen stellen met de patch erbij.

## 1. Het idee in één zin

Een patch wordt een **contenttype op musicbrain.nl** (Imprint), net als een
foto of een take: een bestand met metadata, een eigenaar, een status en een
gesprek eronder. De editor is de "speler" ervan, zoals VLC dat voor video is.

## 2. Wat er al ligt, en wat we hergebruiken

| Al gebouwd | Rol in de pool |
|---|---|
| `patchSnapshot` / `slimSnapshot` (editor) | het bestand: één patch met zijn racks en modules, zonder de moduletypes (die vult elke editor zelf aan) |
| `addPatchSnapshot` (editor) | laden als nieuwe patch naast je eigen patches, verse id's, nooit overschrijven |
| Takes in de media library (wav + mid + patch.json + syx, `group`) | de **demo** van een patch: zo klinkt hij, en de MIDI erbij |
| `POST/PUT/GET /api/media`, tokens met scope, CORS | de transportlaag; een patch-item verwijst naar assets in de library |
| `.syx` (editor + firmware 0.5.89) | de patch voor een DAW of SysEx-librarian, en voor de Teensy zonder editor |
| Imprint contenttypes (`ContentTypeDefinition`, schema + relaties + zoeken) | het item "patch" zelf |
| Imprint annotaties/discussies (ontwerp `annotaties.md`, `communities.md` §4.3) | het gesprek onder een patch |
| Mappen = banken, programmanummers (editor) | ordening in de editor blijft zoals Astra's UX-plan hem ziet |

De pool voegt dus vooral **metadata, status en gesprek** toe. Het bestand en
het transport bestaan al.

## 3. Het contenttype `patch`

Een item in Imprint, domein "catalogus", met:

| Veld | Inhoud |
|---|---|
| `slug`, `title` | naam zoals in de editor |
| `description` | tekst van de maker: wat het is, hoe te spelen ("druk na de aanslag door") |
| `pool` | `voorstel` · `experimenteel` · `centraal` · `vraag` (zie §4) |
| `author` | de inzender (account of naam) |
| `tags` | uit een taglijst: klankfamilie (lead, pad, bas, drums, fx), techniek (fm, subtractief, fysisch), stemmen, "heeft take" |
| `file` | het `.patch.json` (asset in de library) |
| `syx` | het `.syx` (asset, optioneel maar standaard mee) |
| `takes` | nul of meer take-groups uit de library: de demo's |
| `requires` | editor-versie en firmwarecontract waarmee hij gemaakt is, en de lijst gebruikte moduletypes |
| `derivedFrom` | slug van de patch waar deze van is afgeleid (relatie) |
| `question` | alleen bij pool `vraag`: wat lukt er niet |

Imprint bewaart versies bitemporeel: een bijgewerkte patch is een nieuwe
versie van hetzelfde item, en "afgeleid van" is een relatie, dus de
stamboom van een patch is terug te vinden.

**Compatibiliteit.** `requires.modules` laat de editor vóór het laden zeggen:
"deze patch gebruikt de SID-module, die zit niet in jouw editor/firmware".
Dat is nu de grootste praktische valkuil bij uitwisselen tussen versies.

## 4. Pools en moderatie

| Pool | Wie zet er iets in | Wie ziet het | Betekenis |
|---|---|---|---|
| `voorstel` | iedereen met een token | Mark (admin) + de inzender | wacht op beoordeling |
| `experimenteel` | Mark zet erin, of een inzender met de rol "contributor" | iedereen | leuk, werkt, maar geen belofte |
| `centraal` | alleen Mark | iedereen | de basisset die bij de editor hoort |
| `vraag` | iedereen met een token | iedereen | "ik probeer dit, lukt niet, wie helpt?" |

Moderatie is één veld wijzigen in de admin, met de take-widget ernaast om te
luisteren. Dat is precies het "beluisteren en in de pool zetten" uit de vraag.
Een afgewezen voorstel krijgt een reden in het gesprek en blijft voor de
inzender zichtbaar.

## 5. Het forum: gesprek met de patch erbij

Niet een apart forum bouwen, maar Imprints discussie-/annotatiemodel
gebruiken (`communities.md` §4.3, `annotaties.md`). Elke patch is een
gespreksdraad; elke reactie kan zelf een patch meebrengen ("probeer dit
eens", als `derivedFrom`-patch met pool `voorstel` of `experimenteel`).

Pagina's op musicbrain.nl:

- **/patches** — de centrale set, per tag, met speler (take-widget) en knop
  "Open in de editor".
- **/patches/lab** — experimenteel.
- **/patches/vragen** — vragen, nieuwste eerst, met "beantwoord"-vinkje.
- **/patches/\<slug\>** — één patch: beschrijving, demo, download (.patch.json,
  .syx), gesprek, stamboom.

"Open in de editor" is een link `https://editor.musicbrain.nl/?patch=<slug>`:
de editor haalt het item op en biedt hem aan via de bestaande patch-inbox
("Laden als nieuwe patch / Negeren"). Zo opent een patch in de editor zoals
een video in VLC.

## 6. In de editor

Twee knoppen, allebei op bestaande bouwstenen:

1. **⤴ Voorstellen** (Patches-tab, rechtsklik op een patch): naam, tekst,
   tags, en een vinkje "take meesturen" als er een opname van is. Stuurt het
   `.patch.json` + `.syx` naar de library en maakt het patch-item met pool
   `voorstel` (of `vraag`, met de vraagtekst). Token zoals bij de library.
2. **📚 Patches van musicbrain.nl** (Patches-tab): bladeren per pool en tag,
   demo beluisteren, "Laden als nieuwe patch". Zelfde venster als 📚 Takes,
   met een compatibiliteitsregel per patch.

De **basisset** komt ook mee in de editor-build zelf (een gegenereerde
`public/patches/index.json` + bestanden, zoals de samplebanken), zodat hij
offline en zonder token beschikbaar is. Het Voorbeelden-menu toont hem naast
de seeds. Een script haalt bij elke editor-release de pool `centraal` op.

## 7. Toegang en identiteit

- Nu: **persoonlijk token** met scope `media:upload` + een nieuwe scope
  `patch:propose`. Mark deelt tokens uit zoals de AI-codes.
- Straks: **Imprint-logins** (OpenFTV, zie `fase-3-admin-toegang-tijdreizen.md`
  §4): dan is "inzender" een account, en rol `contributor` mag direct in
  `experimenteel`. Imprint stelde dezelfde route voor bij privé-takes.
- Zonder token kan iedereen **lezen en downloaden** (pools `centraal`,
  `experimenteel`, `vraag`).

## 8. Stappen

| Stap | Waar | Wat | Grootte |
|---|---|---|---|
| 0 | editor | `requires` berekenen (editorversie, contract, moduletypes); patch-id stabiel houden over snapshot → laden (`derivedFrom`) | klein |
| 1 | Imprint | contenttype `patch` + taglijst + `POST /api/patches` (ingest) + `GET /api/patches?pool=&tag=` + CORS; pool-veld in de admin met take-widget | middel |
| 2 | editor | ⤴ Voorstellen, 📚 Patches, `?patch=<slug>` via de inbox | middel |
| 3 | Imprint | pagina's /patches, /lab, /vragen, /patches/<slug> met "Open in de editor" | middel |
| 4 | Imprint | gesprek onder een patch (discussie/annotaties) en "antwoord met patch" | middel, hangt aan het communities-werk |
| 5 | editor | basisset in de build + release-script | klein |

Stap 1 en 2 kunnen tegelijk, zoals bij de library.

## 9. Besluiten voor Mark

1. **Pools**: de vier hierboven, of minder (bijvoorbeeld `voorstel`,
   `centraal`, `vraag`)?
2. **Wie mag naar `experimenteel`**: alleen jij, of ook een contributor-rol?
3. **Take verplicht bij een voorstel?** Het maakt beoordelen veel makkelijker,
   maar is een drempel.
4. **Licentie** van gedeelde patches (CC0? CC-BY?). Daar vraagt iemand later
   naar.
5. **Gesprek nu of later**: stap 4 leunt op Imprints discussiemodel; tot die
   tijd kan `question` + een "antwoord"-tekstveld in de admin volstaan.

## 10. Raakvlakken

- **Astra's UX-plan** (`editor-ux-aanbevelingen.md`): de pool verandert
  niets aan de ordening in de editor (mappen = banken). Het bladervenster
  kan wel hergebruiken wat UX-01 voor de modulevoorraad gaat doen: zoeken,
  tags, groepen met aantallen.
- **Imprint contenttypes**: `patch` als derde "mediasoort" naast beeld en
  take. Het `file`-veld is een asset; de viewer is de take-widget plus een
  "Open in de editor"-knop; later een pianorol van de demo.
- **Firmware**: `.syx` per patch maakt de pool ook bruikbaar zonder editor.
