#!/usr/bin/env node
// publish_product.mjs — publiceer een HELE product-boardset naar de Imprint-site.
//
// Waar `publish_board.py` één bord post (component + board-spec), doet dit script
// de *volledige keten* uit `imprint-engine/docs/mmb-ingest-guide.md` voor een set
// borden tegelijk, in de afgedwongen volgorde:
//
//   1. componenten        POST /api/content/component/<slug>   (read-modify-post)
//   2. board-specs        POST /api/ingest/board-spec          (multipart + assets)
//   3. product koppelen   POST /api/content/product/<slug>     (read-modify-post;
//                         voegt de component-slugs toe aan .components, behoudt
//                         de bestaande productteksten)
//   4. release            POST /api/content/release/<proj>-<ver>  (product ↔ versies)
//
// Alles idempotent: opnieuw draaien maakt nieuwe bitemporale versies, overschrijft
// niets in de historie. Referenties worden afgedwongen (422 bij een dode verwijzing),
// vandaar de volgorde hierboven.
//
// Zero-dependency: gebruikt alleen Node ≥ 20 built-ins (fetch/FormData/Blob/fs).
// Geen kicad-cli of Python nodig — de render/overzicht/pinout-assets worden
// hergebruikt (normaal geproduceerd door `publish_board.py` / de generators).
//
// ── Databron per bord ──────────────────────────────────────────────────────────
//   <bord>/<bord>-widget.json      hotspots (x/y/label) + pin-tabellen (markdown)
//                                  → points[] én connectors[] (pins per J-ref)
//   <bord>/<bord>-overzicht.svg    → assets.overview
//   <bord>/pinouts/<ref>.svg       → assets.pinouts[ref]  (indien aanwezig)
//   render-PNG                     → assets.renderTop, gezocht in deze volgorde:
//                                     1) <bord>/<bord>.png
//                                     2) <assets-dir>/<bord>.png   (--assets-dir)
//   Component-slug = mapnaam zonder "musicbrain-" prefix (guide-conventie:
//   busboard-v2, adc8, dac8, …). Versie + naam uit de widget-titel ("… rev X.Y").
//
// ── Gebruik ─────────────────────────────────────────────────────────────────────
//   node publish_product.mjs --product cortex \
//        [--boards musicbrain-adc8,musicbrain-dac8 | (default: hele modular-set)] \
//        [--release modular-mb@v0.2] [--date 2026-07-11] \
//        [--base http://localhost:3000] [--token <INGEST_TOKEN>] \
//        [--assets-dir <dir met render-PNG's>] [--dry]
//
//   Env-fallbacks: INGEST_TOKEN, IMPRINT_BASE, IMPRINT_BOARDS (assets-dir).
//   Deze worden ook uit een gitignored `.env` naast dit script gelezen (zie
//   .env.example); een expliciete `export` of --flag wint daarboven.
//   --dry  = bouw + toon de payloads, post niets.
//   Zonder --boards wordt de modulaire cortex-set genomen: alle
//   hardware/schematics/musicbrain-* (excl. deprecated) + ad5754r-breakout.
//   Zonder --product worden alleen de borden gepost (geen koppeling/release).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMATICS = path.resolve(HERE, "../schematics");

// Laad een gitignored .env naast dit script (KEY=VALUE per regel). Een variabele
// die al in de omgeving staat (export / CLI) wint — we vullen alleen aan.
function loadDotenv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotenv(path.join(HERE, ".env"));
// Renders leven (nog) in de Imprint-repo public/boards; overschrijfbaar met --assets-dir.
const DEFAULT_ASSETS = path.resolve(
  HERE,
  "../../../../imprint-engine/sites/musicbrain/public/boards"
);

// ── argv-parser ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("--")) {
      const key = t.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) a[key] = true;
      else (a[key] = next), i++;
    } else a._.push(t);
  }
  return a;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── board discovery ──────────────────────────────────────────────────────────
function defaultBoards() {
  return fs
    .readdirSync(SCHEMATICS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter(
      (n) =>
        (n.startsWith("musicbrain-") || n === "ad5754r-breakout") &&
        n !== "deprecated"
    )
    .sort();
}

// ── widget.json → connectors[] + points[] ────────────────────────────────────
const REF_RE = /\b(J\d+|JP\d+|H\d+)\b/; // connector-referenties op het bord

function refOf(label) {
  const m = label && label.match(REF_RE);
  return m ? m[1] : undefined;
}

// "| pin | net |"-markdowntabel → [{pin, net}]
function parsePins(md) {
  if (!md) return [];
  const pins = [];
  for (const line of md.split("\n")) {
    const l = line.trim();
    if (!l.startsWith("|")) continue;
    const cells = l.split("|").map((c) => c.trim()).filter((c) => c !== "");
    if (cells.length < 2) continue;
    const [pin, net] = cells;
    if (/^pin$/i.test(pin) || /^-+$/.test(pin)) continue; // header/scheidingsrij
    pins.push({ pin, net });
  }
  return pins;
}

// widget.json + de aanwezige pinout-refs → {connectors, points}
function buildFromWidget(widget, pinoutRefs) {
  const connectors = [];
  const points = [];
  for (const p of widget.points ?? []) {
    const ref = refOf(p.label);
    const point = { x: p.x, y: p.y };
    if (p.label) point.label = p.label;
    if (ref) point.connector = ref; // site linkt assets.pinouts[ref] als die er is
    if (p.markdown) point.markdown = p.markdown; // fallback-detail
    points.push(point);

    const pins = parsePins(p.markdown);
    if (ref && pins.length) {
      connectors.push({
        ref,
        label: (p.label || ref).replace(/\s*\([^)]*\)\s*$/, "").trim(),
        rows: pins.length > 10 ? 2 : 1, // heuristiek (publish_board.py leest dit uit de PCB)
        pins,
      });
    }
  }
  return { connectors, points };
}

// ── één bord → alles wat nodig is om te posten ───────────────────────────────
function prepareBoard(dirName, assetsDir) {
  const dir = path.join(SCHEMATICS, dirName);
  const base = dirName; // widget/overzicht heten <mapnaam>-…
  const widgetPath = path.join(dir, `${base}-widget.json`);
  if (!fs.existsSync(widgetPath)) return { skip: `geen ${base}-widget.json` };
  const widget = JSON.parse(fs.readFileSync(widgetPath, "utf8"));

  const slug = dirName.replace(/^musicbrain-/, ""); // guide-conventie
  const revM = (widget.title || "").match(/rev\s+([0-9][0-9.]*)/i);
  const version = "v" + (revM ? revM[1] : "1.0");
  const name = (widget.title || dirName).split(/\s+rev\s+/i)[0].trim();

  // pinout-SVG's die echt bestaan → assets.pinouts
  const pinoutsDir = path.join(dir, "pinouts");
  const pinoutFiles = {}; // ref -> absoluut pad
  if (fs.existsSync(pinoutsDir)) {
    for (const f of fs.readdirSync(pinoutsDir)) {
      const m = f.match(/^(J\d+|JP\d+|H\d+)\.svg$/);
      if (m) pinoutFiles[m[1]] = path.join(pinoutsDir, f);
    }
  }

  const { connectors, points } = buildFromWidget(widget, Object.keys(pinoutFiles));

  // assets verzamelen (bestandsnaam -> pad); doc verwijst naar de kale namen
  const files = {};
  const assets = { pinouts: {} };

  // render: eerst repo-lokaal, dan de assets-dir
  const localPng = path.join(dir, `${base}.png`);
  const fallbackPng = path.join(assetsDir, `${base}.png`);
  const render = fs.existsSync(localPng)
    ? localPng
    : fs.existsSync(fallbackPng)
    ? fallbackPng
    : null;
  if (render) {
    files["render-top.png"] = render;
    assets.renderTop = "render-top.png";
  }

  const overview = path.join(dir, `${base}-overzicht.svg`);
  if (fs.existsSync(overview)) {
    files["overview.svg"] = overview;
    assets.overview = "overview.svg";
  }

  for (const [ref, p] of Object.entries(pinoutFiles)) {
    const fn = `pinout-${ref}.svg`;
    files[fn] = p;
    assets.pinouts[ref] = fn;
  }

  const doc = {
    slug: `${slug}@${version}`,
    component: slug,
    version,
    connectors,
    assets,
    points,
    sections: [{ heading: "Aansluitoverzicht", markdown: widget.title || name }],
  };

  return { dirName, slug, version, name, doc, files, render: !!render };
}

// ── HTTP-helpers ─────────────────────────────────────────────────────────────
function makeClient(base, token) {
  const H = { Authorization: `Bearer ${token}` };
  return {
    async getJSON(pathname) {
      const r = await fetch(base + pathname);
      if (r.status !== 200) return null;
      const t = await r.text();
      if (!t.trim() || t.trim() === "null") return null;
      try {
        return JSON.parse(t);
      } catch {
        return null;
      }
    },
    async postJSON(pathname, body) {
      const r = await fetch(base + pathname, {
        method: "POST",
        headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: r.status, text: await r.text() };
    },
    async postMultipart(pathname, docObj, files) {
      const form = new FormData();
      form.set("doc", JSON.stringify(docObj));
      let i = 0;
      for (const [fn, p] of Object.entries(files)) {
        const type = fn.endsWith(".png") ? "image/png" : "image/svg+xml";
        const blob = new Blob([fs.readFileSync(p)], { type });
        form.set(`f${i++}`, blob, fn); // veldnaam maakt niet uit; bestandsnaam telt
      }
      const r = await fetch(base + pathname, { method: "POST", headers: H, body: form });
      return { status: r.status, text: await r.text() };
    },
  };
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const a = parseArgs(process.argv.slice(2));
  const base = a.base || process.env.IMPRINT_BASE || "http://localhost:3000";
  const token = a.token || process.env.INGEST_TOKEN || "";
  const assetsDir = a["assets-dir"] || process.env.IMPRINT_BOARDS || DEFAULT_ASSETS;
  const product = typeof a.product === "string" ? a.product : null;
  const dry = !!a.dry;

  const boardDirs =
    typeof a.boards === "string" ? a.boards.split(",").map((s) => s.trim()) : defaultBoards();

  if (!dry && !token) {
    console.error("FOUT: geen token (--token of env INGEST_TOKEN). Schrijven is uit.");
    process.exit(1);
  }

  console.log(`Imprint: ${base}  |  assets-dir: ${assetsDir}`);
  console.log(`token: ${token ? `geladen (${token.length} tekens)` : "GEEN — schrijven uit"}`);
  console.log(`Borden (${boardDirs.length}): ${boardDirs.join(", ")}`);
  if (product) console.log(`Product: ${product}`);
  console.log("");

  const prepared = [];
  for (const d of boardDirs) {
    const b = prepareBoard(d, assetsDir);
    if (b.skip) {
      console.log(`  ${d}: OVERGESLAGEN (${b.skip})`);
      continue;
    }
    prepared.push(b);
    console.log(
      `  ${b.slug}@${b.version}: ${b.doc.connectors.length} connectors, ` +
        `${b.doc.points.length} points, ${Object.keys(b.files).length} assets` +
        (b.render ? "" : "  ⚠ geen render-PNG gevonden")
    );
  }
  console.log("");

  const client = makeClient(base, token);

  if (dry) {
    console.log("── dry-run: niets gepost ──");
    for (const b of prepared) {
      console.log(`\n## ${b.slug}@${b.version}`);
      console.log(JSON.stringify(b.doc, null, 1));
    }
    return;
  }

  const publishedVersions = []; // {component, version} voor de release
  const componentSlugs = [];

  // 1 + 2) component (read-modify-post) + board-spec per bord
  for (const b of prepared) {
    const existing = (await client.getJSON(`/api/content/components/${b.slug}`)) || {};
    const comp = typeof existing === "object" ? existing : {};
    comp.slug = b.slug;
    if (!comp.name) comp.name = b.name; // bestaande naam met rust laten
    comp.description ??= "";
    comp.children ??= [];
    const versions = Array.isArray(comp.versions) ? comp.versions : [];
    const v = versions.find((x) => x.number === b.version);
    if (v) v.spec = b.doc.slug;
    else versions.push({ number: b.version, spec: b.doc.slug });
    comp.versions = versions;

    const r1 = await client.postJSON(`/api/content/component/${b.slug}`, comp);
    if (r1.status >= 300) {
      console.error(`  ✗ component ${b.slug}: ${r1.status} ${r1.text.slice(0, 200)}`);
      continue;
    }
    const r2 = await client.postMultipart(`/api/ingest/board-spec`, b.doc, b.files);
    if (r2.status >= 300) {
      console.error(`  ✗ board-spec ${b.doc.slug}: ${r2.status} ${r2.text.slice(0, 300)}`);
      continue;
    }
    console.log(`  ✓ ${b.doc.slug}  (component + board-spec + assets)`);
    componentSlugs.push(b.slug);
    publishedVersions.push({ component: b.slug, version: b.version });
  }

  // 3) product koppelen (read-modify-post; behoudt de placeholder-teksten)
  if (product && componentSlugs.length) {
    const prod = await client.getJSON(`/api/content/products/${product}`);
    if (!prod) {
      console.error(`  ✗ product ${product} bestaat niet — koppeling overgeslagen`);
    } else {
      prod.components = Array.from(new Set([...(prod.components || []), ...componentSlugs]));
      const r3 = await client.postJSON(`/api/content/product/${product}`, prod);
      console.log(
        r3.status < 300
          ? `  ✓ product ${product}.components = [${prod.components.join(", ")}]`
          : `  ✗ product ${product}: ${r3.status} ${r3.text.slice(0, 200)}`
      );
    }
  }

  // 4) release (product ↔ component-versies)
  if (a.release && product && publishedVersions.length) {
    const [project, ver] = String(a.release).split("@");
    const version = ver || "v0.1";
    const rel = {
      project,
      product,
      version,
      date: typeof a.date === "string" ? a.date : today(),
      channel: "dev",
      components: publishedVersions,
      body: `Auto-gepost door publish_product.mjs (${publishedVersions.length} componenten).`,
    };
    const slug = `${project}-${version}`;
    const r4 = await client.postJSON(`/api/content/release/${slug}`, rel);
    console.log(
      r4.status < 300
        ? `  ✓ release ${slug}  (${publishedVersions.length} componenten)`
        : `  ✗ release ${slug}: ${r4.status} ${r4.text.slice(0, 200)}`
    );
  }

  console.log(`\nKlaar: ${componentSlugs.length}/${prepared.length} borden gepubliceerd.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
