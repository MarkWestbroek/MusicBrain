# BankHeader is 48 bytes, niet 44 — firmware bouwt niet

**Waar:** `firmware/lib/mmb-dsp/mmb_dsp/sample_bank.h`
**Sinds:** e5bb61d ("Multisampler: keymap met key- en velocity-zones, …"), zat er vanaf het begin in
**Gevonden bij:** `pio run -e teensy41` in `firmware/app-modular-brain`, tijdens werk aan een andere module

## Symptoom

```
firmware/lib/mmb-dsp/mmb_dsp/sample_bank.h:77:34: error: static assertion failed: BankHeader layout
*** [.pio/build/teensy41/src/main.cpp.o] Error 1
```

De hele firmware compileert hierdoor niet.

## Oorzaak

```cpp
struct BankHeader {
    char     magic[4];
    uint32_t version;
    uint32_t numSlots;
    uint32_t numZones;
    char     name[32];      // ← 16 + 32 = 48
};                          // 44 bytes   ← comment klopt niet
static_assert(sizeof(BankHeader) == 44, "BankHeader layout");
```

De struct is `#pragma pack(1)`, dus 4+4+4+4+32 = **48** bytes. De assert eist 44.

44 is het juiste getal — de editor schrijft dat formaat:

`editor/src/modular-mb/sampleBank.ts:27` → `const headerSize = 44;`
Slot-tabel begint daar op offset 44, dus het naamveld loopt van 16 t/m 43 = **28 bytes**.

Dus: `char name[32]` moet `char name[28]` zijn. Het doc-commentaar bovenin dezelfde
header (`char name[32] bank-naam (nul-getermineerd)`) noemt 32 en moet mee.

## Waarom "assert op 48 zetten" de verkeerde fix is

`SamplerModule.h:90` leest de header met `f.read(&h, sizeof(h))` en leest de
slot-tabel meteen daarna op de dan bereikte filepositie. Bij `sizeof(h) == 48`
eet de header 4 bytes van de eerste `SlotHeader` op en schuift alles daarna 4 bytes
op — elke door de editor geschreven `.mmbs` wordt dan verkeerd gelezen, zonder
foutmelding. Alleen `name[28]` herstelt zowel de build als het inleespad.

## Twee dingetjes uit dezelfde 32-vs-28-verwarring in de editor

Allebei nog niet gefixt, allebei aan de schrijf/leeskant in `sampleBank.ts`:

1. `sampleBank.ts:40` — `new TextEncoder().encode(name).subarray(0, 31)` op offset 16
   schrijft tot byte 46, terwijl de slot-tabel op 44 begint. Een banknaam van 29 bytes
   of langer overschrijft de `frameOffset` van slot 0. Moet `subarray(0, 27)` zijn
   (27 + afsluitende nul in een veld van 28).
2. `sampleBank.ts:108` — `bytes.subarray(16, 48).indexOf(0)` zoekt de nul buiten de
   header, in de slot-tabel. Moet `subarray(16, 44)` zijn.

Ook de doc-comment op `sampleBank.ts:11` zegt `naam[32]`.

## Reproductie

```
cd firmware/app-modular-brain && pio run -e teensy41
```

Voor de leesbug: een bank bouwen met een naam van 29+ tekens en die weer inlezen.
