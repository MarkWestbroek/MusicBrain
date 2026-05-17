# CMake

## What it is
A cross‑platform meta build system (Kitware, BSD‑3). You write `CMakeLists.txt`; CMake generates project files for the *real* build tool — Ninja, MSBuild, Xcode, Unix Makefiles. Since 3.12 the "modern target‑based" style is the only sane way to use it.

We require **CMake ≥ 3.20** because it gives us `target_compile_features(... cxx_std_17)` reliably, `CMakePresets.json` for preset builds, and good Ninja Multi‑Config support.

## Why we use it (and what for)
CMake in this repo is used **only for the host build**:

- `firmware/core/` — the platform‑independent C++17 library.
- `firmware/hal/host/` — the desktop transport/storage HAL.
- `tools/simulator/` — the MIDI → command simulator.
- The unit tests under `firmware/core/tests/`.

This lets us:
- Compile core logic on a developer laptop (PowerShell / bash) without flashing a device.
- Run protocol/codec tests in CI without any embedded toolchain.
- Use any IDE that understands CMake (CLion, VS, VS Code with the CMake Tools extension).

Device builds use **PlatformIO** instead (see [platformio.md](platformio.md)) — CMake is *not* the device build system.

## Layout
```
CMakeLists.txt                      # top level: project(), options, add_subdirectory chain
firmware/core/CMakeLists.txt        # library target mb_core
firmware/hal/host/CMakeLists.txt    # library target mb_hal_host
tools/simulator/CMakeLists.txt      # executable target mb_simulator
firmware/core/tests/CMakeLists.txt  # one executable per test file, registered via add_test()
```

Targets only link to their public API (`target_link_libraries(... PUBLIC mb_core)`); the header‑include path is set with `target_include_directories(... PUBLIC include)` so consumers see headers automatically.

## Build, the short version
```powershell
cmake -S . -B build -G Ninja
cmake --build build
ctest --test-dir build --output-on-failure
```

Or with a preset (recommended once we add `CMakePresets.json`):
```powershell
cmake --preset host-debug
cmake --build --preset host-debug
ctest --preset host-debug
```

## Gotchas
- **Don't try to build firmware with CMake.** Yes, the ESP‑IDF uses CMake, and yes Teensyduino has CMake wrappers — but the ergonomics are awful compared to PlatformIO and we'd own a lot more boilerplate.
- Never use `file(GLOB)` to collect sources — list them explicitly so removing a file actually breaks the build instead of being silently dropped.
- Always use `target_*` commands, never the global `include_directories` / `add_definitions`. Modern CMake is target‑scoped.
- Set `CMAKE_EXPORT_COMPILE_COMMANDS=ON` so editor tooling (clangd, IntelliSense) sees the right flags.

## Links
- https://cmake.org/cmake/help/latest/
- https://cliutils.gitlab.io/modern-cmake/ — the de facto "do it right" guide.
