# MusicBrain stijlgids — "open brain"

Eén visuele taal voor alles van MusicBrain: de website (musicbrain.nl,
Imprint), de editor/simulator en toekomstige tools. Bron van waarheid is het
"open brain"-ontwerp (`Images/Graphical design/MusicBrain — The open brain
for your analog rig.html`) zoals uitgewerkt op de site; dit document maakt
die stijl overdraagbaar naar de editor.

De editor gebruikt gewone CSS-klassen en inline styles — daarom staat alles
hier als **platte CSS custom properties en recepten**, framework-loos.
Kopieer §2 als `tokens.css`, importeer hem bovenaan `main.tsx`, en vervang
hardcoded kleuren/fonts stap voor stap door de variabelen.

## 1. Principes

- **Donker instrument, geen app.** De achtergrond is diep blauwzwart, panelen
  liggen er nauwelijks bovenop; de sfeer is die van hardware in een donkere
  studio.
- **Amber is de stem, cyaan is het signaal.** Amber (`--accent`) markeert wat
  belangrijk is: één woord in een kop, links, badges, de actieve staat.
  Cyaan (`--accent-2`) is gereserveerd voor signaalweergave: scope-traces,
  CV/gate-lijnen, meters. Niet mengen — cyaan nooit voor UI-chrome.
- **Mono voor labels en data, sans voor verhaal.** Alles wat "van de machine"
  is (sectielabels, badges, specs, versienummers, waarden) staat in
  monospace, klein, uppercase, met ruime letterspacing. Lopende tekst is
  sans, rustig en verklarend.
- **Scherpe randen.** Hoekradius 2–6 px, nooit ronder. Randen zijn 1 px
  `--border`; diepte komt van vlakken, niet van schaduwen.
- **Eén accentwoord per kop, meer niet.** Kleur is klemtoon; wie alles
  benadrukt, benadrukt niets.

## 2. Tokens (kopieer als `tokens.css`)

```css
/* MusicBrain "open brain" design tokens — bron: doc/styleguide.md.
 * Zelfde waarden als het Amber-thema van de site (Imprint, content/themes/amber.json). */
:root {
  /* Kleur */
  --background:    #0e1116;  /* pagina/app-achtergrond            */
  --surface:       #151b23;  /* panelen, kaarten                  */
  --surface-2:     #10151c;  /* verdiepte vlakken (specs, inputs) */
  --border:        #232b36;  /* alle randen, 1px                  */
  --foreground:    #f2f4f8;  /* primaire tekst                    */
  --muted:         #8c96a5;  /* secundaire tekst, captions        */
  --accent:        #f5a623;  /* amber: klemtoon, links, actief    */
  --accent-strong: #b87f1f;  /* amber-dim: hover, subtiele rand   */
  --accent-2:      #3ec9d8;  /* cyaan: alléén signaal/scope       */

  /* Status (spaarzaam, alleen voor echte toestanden) */
  --status-warn:   #fbbf24;  /* in ontwikkeling / let op          */
  --status-info:   #38bdf8;  /* beta / informatief                */
  --status-ok:     #34d399;  /* beschikbaar / actief / ok         */
  --status-off:    #a3a3a3;  /* uitgefaseerd / inactief           */

  /* Typografie */
  --font-sans: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  --font-mono: "Cascadia Code", "JetBrains Mono", Consolas, "SF Mono", monospace;

  /* Vorm */
  --radius-sm: 2px;   /* badges, inputs        */
  --radius-md: 4px;   /* knoppen, kleine kaart */
  --radius-lg: 6px;   /* panelen               */
}

html { background: var(--background); }
body {
  margin: 0;
  color: var(--foreground);
  font-family: var(--font-sans);
  line-height: 1.55;
  /* Signatuur-achtergrond: amber-gloed bovenin + dot-grid, afgeleid van de
   * tokens zodat hij meekleurt als de waarden ooit wijzigen. */
  background:
    radial-gradient(ellipse 90% 40% at 50% -5%,
      color-mix(in srgb, var(--accent) 7%, transparent), transparent 70%),
    radial-gradient(circle 1px at 1px 1px,
      color-mix(in srgb, var(--muted) 13%, transparent) 1px, transparent 1px)
      0 0 / 26px 26px,
    var(--background);
}
```

## 3. Typografie

| Rol | Spec |
|---|---|
| Grote kop (h1/hero) | sans, `clamp(38px, 7vw, 58px)`, weight 800, letter-spacing −0.025em, line-height 1.04; één woord in `--accent` |
| Sectiekop (h2) | sans, 20–24px, weight 600–700, letter-spacing −0.015em |
| Lede/intro | sans, 19px, `--muted`; nadrukwoorden weight 600 in `--foreground` |
| Lopende tekst | sans, 14–15px, `--muted` op panelen, `--foreground` als primair |
| **Eyebrow** (sectielabel) | mono, 11px, uppercase, letter-spacing 0.22em, kleur `--accent` |
| Machinelabel (boven een naam) | mono, 10px, uppercase, letter-spacing 0.16em, `--muted` |
| Data/waarden | mono, `font-variant-numeric: tabular-nums` |

```css
.eyebrow {
  font-family: var(--font-mono);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--accent);
  margin: 0 0 14px;
}
```

## 4. Componentrecepten

**Paneel / kaart** — het basisblok van elke view:

```css
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px 18px;
}
.panel--deep { background: var(--surface-2); } /* specs, meters, inputs */
```

**Badge** — status en versies, altijd mono:

```css
.badge {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--accent);
  border: 1px solid var(--accent-strong);
  border-radius: var(--radius-sm);
  padding: 3px 8px;
}
.badge--dim { color: var(--muted); border-color: var(--border); }
```

**Knop** — amber gevuld voor de primaire actie, rand voor de rest:

```css
.btn {
  font: 600 14px var(--font-sans);
  color: var(--background); background: var(--accent);
  border: none; border-radius: var(--radius-md);
  padding: 10px 20px; cursor: pointer;
}
.btn:hover { background: var(--accent-strong); }
.btn--ghost {
  color: var(--foreground); background: none;
  border: 1px solid var(--border);
}
.btn--ghost:hover { border-color: var(--accent); }
```

**Link** — amber met onderstreping op afstand:

```css
a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
```

**Specs-strip** — rij kerncijfers (mono, grote waarde + klein bijschrift):

```css
.specs {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
  background: var(--surface-2); border: 1px solid var(--border);
  padding: 18px 22px; font-family: var(--font-mono);
}
.specs b { display: block; font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; }
.specs span { font-size: 10.5px; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; }
```

**Scope-trace** — de signatuur-divider (gate/CV-staplijn). Cyaan, over een
baseline in `--border`; in de editor is dit óók de stijl voor echte
scope-/CV-weergave:

```html
<svg viewBox="0 0 780 46" preserveAspectRatio="none" style="width:100%;height:40px" aria-hidden="true">
  <line x1="0" y1="23" x2="780" y2="23" stroke="var(--border)" stroke-width="1"/>
  <path d="M0 36 H90 V10 H210 V36 H330 V10 H400 V36 H560 V18 H660 V36 H780"
        fill="none" stroke="var(--accent-2)" stroke-width="2" opacity="0.9"/>
</svg>
```

**Logo** — het patch-brain-merk (jack-nodes + kabelbogen): kabels en
node-randen in `--accent`, node-vulling `--background`, kern gevuld
`--accent`. SVG-bron: de site-header (Imprint,
`sites/musicbrain/src/components/site-chrome.tsx`) of het ontwerp-artifact.
Wordmark: "Music" in `--foreground`, "**Brain**" in `--accent`, met eronder
het motto in machinelabel-stijl (mono 10–11px, uppercase, 0.14em).

## 5. Editor-specifiek

- **Panelen-layout**: elk paneel (Rack, Patcher, Modules, Simulation…) is een
  `.panel`; de paneltitel is een `.eyebrow`. Geen aparte titelbalken met
  eigen kleuren.
- **Knoppen en waarden op modules**: waarden in mono met `tabular-nums`
  zodat draaiende knoppen niet "dansen".
- **Kabels/patches**: signaalkleuren mogen variëren (dat is betekenis), maar
  de UI eromheen blijft in de tokens. Cyaan = neutrale signaalkleur.
- **Actief/geselecteerd** = amber (rand of gloed), niet blauw en geen
  browser-default focusring: `outline: 2px solid var(--accent); outline-offset: 3px`.
- **Migratie**: importeer `tokens.css` vóór bestaande styles en vervang in
  `effect-switcher/styles.css` en de inline styles de hardcoded kleuren en
  `system-ui`-fontstacks door de variabelen. De bestaande `es-*`-klassen
  kunnen gewoon blijven bestaan — alleen de waarden gaan naar tokens.

## 6. Relatie met de site (Imprint)

Op de site zijn deze tokens **content**: het thema "amber"
(`sites/musicbrain/content/themes/amber.json` in het Imprint-repo),
bewerkbaar in de admin en per bezoeker wisselbaar — en sinds juli 2026
tevens de **default** van de site (de `:root`-waarden in `globals.css`). Dit document en dat
thema horen gelijk te lopen; wijzigt de huisstijl, pas dan beide aan.
Toekomst-optie: de editor haalt de tokens live op via de site-API
(thema's zijn opvraagbare content), zodat site en editor met één wijziging
samen restylen.
