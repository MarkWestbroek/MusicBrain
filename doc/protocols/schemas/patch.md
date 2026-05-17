# Patch — JSON & CBOR schema

Core-level (application-agnostic) representation of one preset, as produced by
`mb::PatchCodec`. The application-specific data lives inside `blob`, which is
opaque to the core (it can be CBOR, raw bytes, or anything else the app
defines).

See [ADR 0005 — Patch format JSON in editor, CBOR on device](../../adr/0005-patch-format-json-cbor.md).

---

## Fields

| Field   | Type      | Range / size           | Description                                         |
|---------|-----------|------------------------|-----------------------------------------------------|
| `id`    | uint16    | 0 .. 65535             | Program number / preset slot index.                 |
| `ver`   | uint16    | 1 ..                   | Schema version (this document = 1).                 |
| `name`  | text      | up to 23 bytes UTF-8   | Display name. Trailing `\0` not stored.             |
| `blob`  | byte str  | 0 .. 512 bytes         | Application payload (effect bitmask, matrix, etc.). |

Unknown JSON fields are ignored on decode (forward compatibility).

---

## JSON

```json
{
  "id": 42,
  "ver": 1,
  "name": "Crunch Lead",
  "blob": "a163666f6f64"
}
```

- `blob` is **lowercase hex** (2 chars per byte, no separators, no `0x` prefix).
  Chosen over base64 because it survives any text transport, is trivial to
  diff in git, and is straightforward to hand-roll on the device side.
- `name` is JSON-escaped UTF-8. Embedded `\0` is not allowed.
- Whitespace inside the object is allowed; the encoder produces compact output
  (no spaces, sorted key order: `id`, `ver`, `name`, `blob`).

### Decode rules
- Missing `id`, `ver` or `name` → error.
- Missing `blob` → treated as empty (`""`).
- `blob` length > 1024 hex chars (= 512 bytes) → error.
- `name` length > 23 → error.

---

## CBOR (RFC 8949)

A CBOR **map** with text-string keys (so it stays self-describing and forward-
compatible with new fields). Wire bytes for the example above:

```
A4                            # map(4)
  62 69 64                    #   "id"
  18 2A                       #   42
  63 76 65 72                 #   "ver"
  01                          #   1
  64 6E 61 6D 65              #   "name"
  6B 43 72 75 6E 63 68 20 4C 65 61 64   # "Crunch Lead"
  64 62 6C 6F 62              #   "blob"
  46 A1 63 66 6F 6F 64        #   byte string (6 bytes)
```

- Total: 30 bytes for this patch.
- Worst-case (24-char name, 512-byte blob): ~560 bytes — well under the
  4 KiB LittleFS sector size.
- The decoder accepts maps with keys in any order and skips unknown keys.

---

## Round-trip guarantees

`PatchCodec` provides four functions:

```cpp
std::string                toJson(const Patch&);
std::vector<uint8_t>       toCbor(const Patch&);
std::optional<Patch>       fromJson(std::string_view);
std::optional<Patch>       fromCbor(std::span<const uint8_t>);
```

For any well-formed `Patch p`:

- `fromJson(toJson(p)) == p`
- `fromCbor(toCbor(p)) == p`
- `fromJson(toJson(fromCbor(toCbor(p)))) == p` (cross-format round-trip)

These invariants are enforced by `firmware/core/tests/test_patchcodec.cpp`.
