# Protocol schemas

JSON Schemas for the patch formats and the JSON-RPC API surface live here.

Existing:
- [patch.md](patch.md) — core-level (application-agnostic) Patch JSON & CBOR
  wire format, implemented by `mb::PatchCodec`.

Planned (per-application blob schemas, will be filled in as each app's
`core/Patch.h` blob layout crystallises — see ADR 0005):
- `patch.effect.v1.json`        — project 1 patch blob
- `patch.amp.v1.json`           — project 2 patch blob
- `patch.synth.v1.json`         — project 3 patch blob
- `api.jsonrpc.v1.json`         — editor ↔ device JSON-RPC methods
