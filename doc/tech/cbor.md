# CBOR (Concise Binary Object Representation, RFC 8949)

## What it is
A binary serialisation format with the **same data model as JSON** — null, boolean, number, string, array, object — but encoded in bytes instead of text. Designed by the IETF (RFC 7049, superseded by RFC 8949 in 2020). Think "JSON, but compact and faster to parse, with no whitespace ambiguity".

A typical patch object might shrink from ~250 bytes of JSON to ~120 bytes of CBOR, and parsing on an MCU is ~5–10× faster (no decimal scanning, no string‑escape handling).

### Tiny example
JSON: `{"id": 7, "name": "Crunch", "loops": [true,false,true,true]}`

CBOR (hex):
```
A3                       # map(3)
   62 69 64              # "id"
   07                    #   = 7
   64 6E 61 6D 65        # "name"
   66 43 72 75 6E 63 68  #   = "Crunch"
   65 6C 6F 6F 70 73     # "loops"
   84 F5 F4 F5 F5        #   = [true,false,true,true]
```

The structure is self‑describing: every value is preceded by a one‑byte type/length tag.

## Why we use it (ADR 0005)
- **Byte‑for‑byte cheaper** than JSON on the wire and in flash.
- **Streaming decoder**: read one item at a time, bounded memory, no DOM build.
- **Same model as JSON** → trivial lossless conversion to/from the canonical JSON we keep in git and in the editor.
- Battle‑tested standard, used by COSE (RFC 8152) and many IoT stacks.

## What matters for MusicBrain
- **Editor side** (TypeScript): JSON for humans, convert to CBOR only when uploading. Library: [`cbor-x`](https://github.com/kriszyp/cbor-x).
- **Device side** (C++): always CBOR. Library: [`tinycbor`](https://github.com/intel/tinycbor) (MIT, header‑only‑ish, perfect for MCUs).
- **Schema versioning** lives in the data, not the format: top‑level `schemaVersion` field (ADR 0005).
- **Stable map‑key ordering** matters if we ever hash/sign patches. RFC 8949 §4.2 defines a canonical ordering — use it.

## Gotchas
- CBOR is **not** schemaless‑safe in the way Protobuf is — there is no IDL. We rely on JSON Schema (`doc/protocols/schemas/`) as the contract.
- The spec has many optional features (tags, indefinite‑length, half‑precision floats). Pin a **profile**: definite‑length only, no tags except a small allow‑list, no big integers — keeps decoder code small.
- Don't confuse with **MessagePack** (similar idea, different encoding, no IETF stewardship). CBOR is the more standards‑backed choice today.
- Hand‑inspecting a CBOR blob without tools is painful; ship a `tools/cbor-dump` helper early.

## Links
- https://www.rfc-editor.org/rfc/rfc8949 — current spec.
- https://cbor.io/ — overview, tools, playground.
- https://github.com/intel/tinycbor — C library.
- https://github.com/kriszyp/cbor-x — fast TS/JS library.
