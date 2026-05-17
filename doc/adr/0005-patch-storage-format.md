# ADR 0005 – Patch storage format: JSON in editor, binary on device

## Status
Accepted (2026-05-17)

## Context
The editor benefits from a human-readable, diffable, git-friendly format. The device benefits from compact, fast-to-parse storage with bounded memory use.

## Decision
- **Canonical format (editor / git / API):** **JSON**, schema versioned via a top-level `"schemaVersion"` field. JSON Schema files live in `docs/protocols/schemas/`.
- **On-device format:** **CBOR** (RFC 8949). Same logical schema, compact binary, streaming decoder, well supported in C++ (`tinycbor`) and TS (`cbor-x`).
- **Conversion:** a `tools/patch-converter` (TypeScript) converts JSON ↔ CBOR for upload/download. The brain only ever reads/writes CBOR; the editor only ever reads/writes JSON. The transport carries CBOR over the wire to keep the brain simple.
- **Versioning / migrations:** every change to the schema bumps `schemaVersion` and ships a migration in `tools/patch-converter/migrations/`. The brain refuses to load a patch with a newer `schemaVersion` than it knows.
- **Storage backends:**
  - Editor side: flat files on disk, intended to be checked into git, or a small JSON store served by the user's web host.
  - Device side: a simple log-structured KV in onboard flash (Teensy/RP2040) or SD card if present.

## Consequences
- A small CBOR codec is added to `core/`.
- No SQL on the device.
- Patches can be code-reviewed; preset packs can be distributed as git repos or as tarballs of JSON files.
