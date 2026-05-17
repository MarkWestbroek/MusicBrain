# `tools/patch-converter` — JSON ↔ CBOR converter

Per [ADR 0005](../../doc/adr/0005-patch-storage-format.md), patches are JSON in git and in the editor, and CBOR on the device. This tool converts between the two and runs schema migrations.

Planned CLI (TypeScript, runs via Node):

```
patch-converter pack    bank.json    -o bank.cbor
patch-converter unpack  bank.cbor    -o bank.json
patch-converter migrate bank.json --to-version 3
```

To be implemented in roadmap stage 3.
