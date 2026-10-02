# Leeswijzer voor `doc/`

Deze map is gegroeid als werkarchief: ontwerpdocumenten, reviews, plannen en
notities uit anderhalf jaar ontwikkeling staan naast elkaar. Dit bestand zegt
per document wat het is en of het nog leidend is. De publieke ingang met
routes (proberen, Teensy, hardware, bijdragen) is de
[hoofd-README](../README.md); herhaal die hier niet.

Status: **leidend** = beschrijft de huidige stand en wordt bijgehouden;
**naslag** = correct maar niet actief onderhouden; **historisch** = bewaard
voor de geschiedenis, niet meer als instructie gebruiken; **plan** = voorstel
of ontwerp, kijk naar de datum en de status in het document zelf.

## Leidend

| Document | Wat het is |
|---|---|
| [BACKLOG.md](BACKLOG.md) | Open werk per laag (editor, firmware, hardware), met prioriteit en status. Naslag, niet het verhaal. |
| [RELEASE-LOG.md](RELEASE-LOG.md) | Wat er per firmware- en editorversie bijkwam, met datum. Firmwareblok 0.5.16–0.5.48 ontbreekt. |
| [module-catalogus.md](module-catalogus.md) | Gegenereerd: alle interne modules met poorten, controls, sim- en firmwarestatus. `npm run catalog` in `editor/`. |
| [browser-instrumenten.md](browser-instrumenten.md) | De simulator als instrument: lagen, sampler, DX7, SoundFonts, opname. Sectie 7 is ingehaald, zie het actueel-blok daar. |
| [teensy-aan-de-pc.md](teensy-aan-de-pc.md) | Teensy horen, flashen, SD-kaart en banken, testen zonder handen, audio-in. |
| [firmware-distributie.md](firmware-distributie.md) | Hoe firmware-releases gebouwd en gepubliceerd worden. |
| [editor-deploy.md](editor-deploy.md) | Deploy van de editor naar editor.musicbrain.nl. |
| [sim-firmware-parity-plan.md](sim-firmware-parity-plan.md) | Simulator versus Teensy: wat nog verschilt en in welke volgorde het is opgelost. Stap 6 (alles wasm) is klaar. |
| [Simulation.md](Simulation.md) | Simulatiestrategie; §9 gaat over de wasm-simulator. Oudere secties beschrijven de eerdere Web Audio-nabouw. |
| [spi-bus-spec.md](spi-bus-spec.md) | SPI-busspecificatie voor busboard en uitbreidingskaarten. Leidend voor alle kaarten. |
| [systeem-v3-plan.md](systeem-v3-plan.md) | Mechanica en bus-herziening van het gen-2-systeem (ontwerpbesluiten). |
| [poly-analog-spec.md](poly-analog-spec.md) | Poly-analoge modules (VCA8, VCF8, matrix) op de Cortex-bus. |
| [guitar-switcher-spec.md](guitar-switcher-spec.md) | Ontwerp-spec van de Reflex/guitar-switcher (BRAIN + LOOP8-keten). |
| [styleguide.md](styleguide.md) | Huisstijl: tokens, typografie, CSS-recepten. Loopt gelijk met het amber-thema van de site. |
| [site-publicatie-werkwijze.md](site-publicatie-werkwijze.md) | Borden publiceren naar de site (component/spec/release-keten in Imprint). |
| [adr/](adr/README.md) | Architectuurbesluiten. Een ADR blijft geldig tot een latere hem vervangt. |
| [uml/](uml/README.md) | Klassen- en sequentiediagrammen van firmware en simulator. |
| [protocols/](protocols/) | SPI-frame, JSON-schema's van patch en API. Het JSON-RPC-schema is nog een plan. |
| [tech/](tech/README.md) | Technische achtergrond: CAN-FD, CBOR, CMake. |

## Reviews en verslagen (gedateerd, naslag)

| Document | Wat het is |
|---|---|
| [documentatie-review-2026-09-30.md](documentatie-review-2026-09-30.md) | Externe review van documentatie en website. Stap 1–4 van de aanpak zijn uitgevoerd; stap 5 (publieke roadmap, site) loopt via Imprint. |
| [imprint-website-actualisatie-2026-09.md](imprint-website-actualisatie-2026-09.md) | Wijzigingsverzoek aan Imprint voor Musicbrain.nl, volgt uit de review. |
| [code-review-firmware-wasm-2026-09-29.md](code-review-firmware-wasm-2026-09-29.md) | Review firmware + WASM-simulator; bevindingen staan in de backlog. |
| [code-review-firmware-editor-2026-07-05.md](code-review-firmware-editor-2026-07-05.md) | Eerdere review firmware ↔ editor. |
| [code-review-busboard-2026-08-31.md](code-review-busboard-2026-08-31.md), [code-review-axon-dac8-2026-09-01.md](code-review-axon-dac8-2026-09-01.md), [code-review-gswitch-2026-09-01.md](code-review-gswitch-2026-09-01.md), [code-review-matrix-2026-09-01.md](code-review-matrix-2026-09-01.md), [code-review-uitbreidingskaarten-2026-09-01.md](code-review-uitbreidingskaarten-2026-09-01.md), [code-review-vcf8-2026-09-01.md](code-review-vcf8-2026-09-01.md) | Ontwerpreviews van borden. Afgehandelde punten staan in de bord-README's. |
| [luistertest-2026-09-24.md](luistertest-2026-09-24.md) | Luistertest na de simulator-omzetting. |
| [bug-bankheader-2026-09-06.md](bug-bankheader-2026-09-06.md) | Bugverslag BankHeader (opgelost). |
| [snaarbank-testlab.md](snaarbank-testlab.md) | Snaarbank als testlab voor modulatie (trackpad, telefoon). |
| [todo-2026-09-20-teensy-aan-de-kabel.md](todo-2026-09-20-teensy-aan-de-kabel.md) | Werklijst van 20 september; grotendeels afgehandeld, zie release-log. |

## Plannen en ontwerpdocumenten (`plans/`)

Elk plan draagt zijn eigen datum en status. Kort per thema:

- **Editor**: [editor-ux-aanbevelingen.md](plans/editor-ux-aanbevelingen.md) (UX-01..07, besluit 2026-10-01), [patch-recept.md](plans/patch-recept.md) en [recept-tools-en-mcp.md](plans/recept-tools-en-mcp.md) (recepten, AI, MCP-server), [morph-a-b.md](plans/morph-a-b.md), [sysex-patch.md](plans/sysex-patch.md), [patch-pool.md](plans/patch-pool.md) (patches delen via musicbrain.nl), [control-surface.md](plans/control-surface.md) (Roto-Control).
- **Stem en zang**: [stem-als-instrument.md](plans/stem-als-instrument.md), [fof-voice-overdracht.md](plans/fof-voice-overdracht.md), [zingende-stemmen.md](plans/zingende-stemmen.md).
- **Synthex**: [synthex.md](plans/synthex.md) (polyfone stem naar de Elka Synthex, uit het schema afgeleid).
- **Percuter**: [percuter.md](plans/percuter.md) (acht 8-bit drumkanalen naar de Dynacord Percuter, cartridge-dumps omzetten).
- **Ritmebox**: [ritmebox.md](plans/ritmebox.md) (CR-78-presets uit de Service Notes overgenomen, wat er ontbreekt, en waarom de Elka-ritmes niet uit de documentatie komen).
- **Samplebanken**: [bank-store.md](plans/bank-store.md) (voorstel: banken met uuid en revisie, patch verwijst naar de bank in plaats van het nummer, meer dan 16 plekken).
- **Synthese en modules**: [modulecollectie-analyse-2026-10.md](plans/modulecollectie-analyse-2026-10.md) (wat er is, wat er miste, en de zestien modules van 2026-10-02: CV-pakket, West Coast, acid, rungler, orgel), [material-bridge-handover.md](plans/material-bridge-handover.md), [nieuwe-synthesemodules-handover.md](plans/nieuwe-synthesemodules-handover.md) (scanned, reservoir, GENDYN, excitable, tape strip; 2026-10-02), [stk-sound-module.md](plans/stk-sound-module.md), [sid.md](plans/sid.md), [vintage-compressors.md](plans/vintage-compressors.md), [vintage-eq.md](plans/vintage-eq.md), [mpe.md](plans/mpe.md), [synthesetechnieken-verkenning.md](plans/synthesetechnieken-verkenning.md).
- **Onderzoek (geen productbelofte)**: [musicbrain-instrument-lab.md](plans/musicbrain-instrument-lab.md), [state-graph-synthesis.md](plans/state-graph-synthesis.md), [FPGA-physical-modelling.md](plans/FPGA-physical-modelling.md), [analoge-fx-verkenning.md](plans/analoge-fx-verkenning.md).
- **Hardware**: [ssi2140_8voice_buildspec.md](plans/ssi2140_8voice_buildspec.md) (let op: pinout in de buildspec is fout, zie de vcf8-README), [vcf8kern-handover.md](plans/vcf8kern-handover.md), [vcf8kern-mac-overdracht.md](plans/vcf8kern-mac-overdracht.md), [vco8-chip-keuze.md](plans/vco8-chip-keuze.md), [analog-patch-matrix.md](plans/analog-patch-matrix.md), [matrix-routing-handover.md](plans/matrix-routing-handover.md), [rp2040-spi-slave-testplan.md](plans/rp2040-spi-slave-testplan.md).

Hardware-ontwerpdocumenten in deze map: [busboard-v2-plan.md](busboard-v2-plan.md), [busboard-v3-plan.md](busboard-v3-plan.md), [busexp-plan.md](busexp-plan.md), [axon-plan.md](axon-plan.md). De bord-README's onder `hardware/schematics/` zijn leidend voor de gebouwde revisies; begin met `hardware/kicad-generators/WERKWIJZE.md`.

## Website en Imprint

[imprint-vragen-2026-07.md](imprint-vragen-2026-07.md), [imprint-fr-component-kind.md](imprint-fr-component-kind.md), [imprint-fr-url-alias.md](imprint-fr-url-alias.md), [imprint-testcase-oude-releases.md](imprint-testcase-oude-releases.md), [imprint-widget-3d-voorstel.md](imprint-widget-3d-voorstel.md), [board-spec-contenttype-requirements.md](board-spec-contenttype-requirements.md): verzoeken en specificaties richting het CMS van de site. [marketing/](marketing/) bevat positionering en design-brief (namen nog niet bekrachtigd).

## Historisch

| Document | Waarom bewaard |
|---|---|
| [Requirements.md](Requirements.md) | Oorspronkelijke requirements vanuit de drie muzikale problemen, met later componentonderzoek en UI-iteraties. De eerste secties zijn nog de beste uitleg van het waarom. |
| [Plan.md](Plan.md), [Plan-v2.md](Plan-v2.md) | Roadmaps uit het voorjaar van 2026; achterhaald (desktopeditor, stages). |
| [Answers.md](Answers.md) | Antwoorden op de acht openingsvragen die tot de ADRs leidden. |
| [Requirements.backup-2026-05-31.md](Requirements.backup-2026-05-31.md) | Back-up van de requirements. |
| `effect editor notes.md`, `global to multiple and back thoughts 01.md`, `remarks on ADR 0010.md`, `open source eurorack.md`, `backlog kicad boards.md` | Losse denknotities. |
| [ai-chats/](ai-chats/) | Geëxporteerde chats en handovers. Bron voor de geschiedenis, geen documentatie. |
| [elements/](elements/), [eurorack/](eurorack/), [old-code/](old-code/), [sketches/](sketches/), [schematics/](schematics/), [SysML/](SysML/) | Achtergrondmateriaal, schetsen en oude code. |

Overige mappen: [data-sheets/](data-sheets/), [manuals/](manuals/), [daisy/](daisy/) (datasheets en handleidingen), [mechanics/](mechanics/) (behuizing, FreeCAD), [pcb/](pcb/), [demos/](demos/), [RotoControl/](RotoControl/) (setup-exports), [architecture/](architecture/) (PlantUML-bronnen), `api/` (gegenereerde TypeDoc, niet ingecheckt).

## Onderhoud

- Lokale links in alle `.md`-bestanden worden in CI gecontroleerd: `python tools/check_md_links.py`.
- Een nieuw of gewijzigd document: zet het hier in de juiste tabel. Een document dat is ingehaald: zet een kort actueel-blok bovenaan met datum en verwijzing, en verplaats het hier naar historisch.
- Een moduleverandering is documentair klaar als de catalogus opnieuw is gegenereerd en de release-log is bijgewerkt (zie de [CLAUDE.md](../CLAUDE.md) in de hoofdmap).
