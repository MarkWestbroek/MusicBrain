# C++17 — the parts we actually use

## What it is
The 2017 revision of the ISO C++ standard. Mature, fully supported by every compiler we target (MSVC 19.14+, Clang 5+, GCC 7+, Teensyduino, Arduino‑Pico, ESP‑IDF, STM32CubeIDE). We chose C++17 as the floor in ADR 0001.

This page summarises **which features we lean on** and **what we deliberately avoid** in firmware. The intent is to keep the codebase modern and readable without depending on heavy runtime support that hurts on tiny MCUs.

## Features we use

| Feature | Use in MusicBrain |
|---|---|
| `constexpr` (extended in C++17) | All protocol constants, frame sizes, table look‑ups. Zero runtime cost. |
| `inline constexpr` variables | Single‑definition constants in headers (`kFrameMagic`, `kPatchNameMax`). |
| `std::array<T, N>` | Fixed‑size buffers; replaces raw C arrays everywhere. |
| `std::optional<T>` | "Active program may or may not be set"; clearer than sentinel values. |
| `std::string_view` | Pass names without copying or allocating. |
| Structured bindings (`auto [k, v] = …`) | Iterating maps in host‑side code. |
| `if constexpr` | Compile‑time branches in HAL templates (e.g. 12‑bit vs 16‑bit DAC). |
| Class template argument deduction (CTAD) | Reduces noise in tests. |
| `[[nodiscard]]` | On `Patch::write`, `Router::handle` return values that mustn't be ignored. |
| Inline namespaces | Reserved for future ABI versioning of the protocol layer. |

## Features we deliberately *avoid* in firmware

| Feature | Why |
|---|---|
| RTTI (`typeid`, `dynamic_cast`) | Disabled with `-fno-rtti`; adds runtime cost and code size. We use virtual interfaces + tag enums instead. |
| Exceptions | Disabled with `-fno-exceptions`. Hot paths return `bool` / `std::optional`. The host test harness *does* use exceptions because it's not realtime. |
| `std::function` | Allocates on the heap when the captured state exceeds the small‑buffer size. Replaced by `void (*)(void*)` callbacks or simple interfaces. |
| `std::shared_ptr` | No reference counting in realtime code; ownership is static. |
| `iostream` | Pulls in ~50 KB of code; we use `printf` (or nothing) on device. |
| Heap allocation after init | All buffers are sized at compile time. Allows static‑analysis sizing of stack/heap. |
| `std::regex` | Huge code size; we don't need it. |
| Threads / `<mutex>` | The brain is single‑threaded; the breakouts pin specific work to specific cores without OS primitives. |

## Conventions

- `#pragma once` in every header.
- `namespace mb { … }` for the core, `mb::proto`, `mb::host`, `mb::teensy4`, etc. — never anonymous nested namespaces at file scope.
- Headers in `include/`, sources in `src/`; the path under `include/` mirrors the namespace (`include/mb/Protocol/SpiFrame.h` → `mb::proto::…`).
- One class per file unless they are intimately coupled (e.g. `Router` + its event/command structs).
- No macros except include guards (we use `#pragma once`) and a couple of test‑harness helpers.

## C++20/23 — not yet
Tempting features (`std::span`, `<format>`, concepts, `consteval`, modules) but support is uneven across the embedded toolchains we target (Teensyduino still ships with GCC 11 as of 2026). Revisit in 1–2 years.

## Links
- https://en.cppreference.com/w/cpp/17
- https://www.youtube.com/watch?v=fI2xiUqqH3Q — "C++17 in Embedded" overview talks.
