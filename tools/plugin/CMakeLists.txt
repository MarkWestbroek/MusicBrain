# MusicBrain-modules als audioplugin (doc/plans/plugin.md, README.md hier).
#
# Dezelfde kern als de Teensy en de simulator (firmware/lib/mmb-dsp), in een
# JUCE-jas: VST3 (en AU op de Mac) plus een Standalone-programma per module.
# De bediening is het editorpaneel in een webview; parameters, plugin-bronnen
# en de modulelijst komen uit de editor (editor/scripts/pluginParams.ts →
# generated/). JUCE staat niet in de repo; zie README.md voor de stappen.
cmake_minimum_required(VERSION 3.22)
project(MmbPlugins VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(MMB_JUCE_DIR "" CACHE PATH "Map met de JUCE-checkout")
if(NOT MMB_JUCE_DIR)
  message(FATAL_ERROR "Zet -DMMB_JUCE_DIR=<pad naar JUCE>")
endif()
add_subdirectory(${MMB_JUCE_DIR} juce EXCLUDE_FROM_ALL)

set(MMB_DSP_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../firmware/lib/mmb-dsp)
set(MMB_WASM_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../mmb-wasm)
set(MMB_GENERATED_DIR ${CMAKE_CURRENT_SOURCE_DIR}/generated)

# ── De bediening en de gegenereerde bestanden, uit de editor ─────────────
#   cd editor && MMB_JUCE_DIR=<pad> npm run build:plugin-ui
# maakt web/ (het paneel) en generated/ (params, kernels, plugin-bronnen,
# modules.cmake). Beide niet in git.
file(GLOB MMB_WEB_FILES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/web/*)
file(GLOB MMB_GEN_FILES CONFIGURE_DEPENDS ${MMB_GENERATED_DIR}/*.h)
if(NOT MMB_WEB_FILES OR NOT MMB_GEN_FILES)
  message(FATAL_ERROR "tools/plugin/web/ of generated/ ontbreekt: eerst `npm run build:plugin-ui` in editor/ (met MMB_JUCE_DIR)")
endif()
juce_add_binary_data(MmbWebUi HEADER_NAME MmbWebUi.h NAMESPACE MmbWebUi SOURCES ${MMB_WEB_FILES})

set(MMB_FORMATS VST3 Standalone)
if(APPLE)
  list(APPEND MMB_FORMATS AU)
endif()

# wasm2c (wabt, https://github.com/WebAssembly/wabt): de gastheer-plugins
# draaien hun .wasm als C, met een eigen instantie per exemplaar
# (W2cPlugin.h). MMB_WABT_DIR is de wabt-checkout (runtime en simde), met
# wasm2c gebouwd in <dir>/build (of zet MMB_WASM2C).
set(MMB_WABT_DIR "" CACHE PATH "wabt-checkout (wasm2c-runtime en simde)")
if(MMB_WABT_DIR)
  find_program(MMB_WASM2C wasm2c PATHS ${MMB_WABT_DIR}/build ${MMB_WABT_DIR}/build/Release NO_DEFAULT_PATH
               DOC "wasm2c-programma (standaard <MMB_WABT_DIR>/build/wasm2c)")
endif()
find_package(Python3 COMPONENTS Interpreter)

# Eén module als plugin:
#   mmb_add_module(<target> <code> "<productnaam>" <synth> <bron.cpp>
#                  [CATEGORIES ...] [INCLUDES ...] [SOURCES ...] [GLOBS ...] [DEFINES ...]
#                  [W2C <module.wasm>] [W2CMODS <naam> <module.wasm> ...])
# W2C: de gastheer als wasm2c-C uit die .wasm (gen_w2c.py, in de bouwmap);
# W2CMODS: meerdere modules in één plugin (patch-plugins, generated/patches.cmake).
# De wasm-gastheren worden gecompileerd zoals in tools/mmb-wasm/build.sh:
# -DTEST, cstdio vooraf ingevoegd, de shim-map en de MI-fallbacks als include.
function(mmb_add_module target code product synth source)
  cmake_parse_arguments(A "NOLTO" "W2C" "CATEGORIES;INCLUDES;SOURCES;GLOBS;DEFINES;W2CMODS" ${ARGN})
  if(NOT A_CATEGORIES)
    set(A_CATEGORIES Fx)
  endif()
  set(srcs ${source} ${A_SOURCES})
  foreach(g ${A_GLOBS})
    file(GLOB_RECURSE found ${g})
    list(APPEND srcs ${found})
  endforeach()
  juce_add_plugin(${target}
    COMPANY_NAME "MusicBrain"
    PLUGIN_MANUFACTURER_CODE Mmbr
    PLUGIN_CODE ${code}
    FORMATS ${MMB_FORMATS}
    PRODUCT_NAME "${product}"
    IS_SYNTH ${synth}
    NEEDS_MIDI_INPUT ${synth}
    NEEDS_MIDI_OUTPUT FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
    NEEDS_WEBVIEW2 TRUE
    VST3_CATEGORIES ${A_CATEGORIES})
  target_sources(${target} PRIVATE ${srcs})
  # W2C <wasm>: één module (naam "mod"); W2CMODS <naam> <wasm> ...: meerdere (patch-plugin).
  set(w2c ${A_W2CMODS})
  if(A_W2C)
    list(APPEND w2c mod ${A_W2C})
  endif()
  if(w2c)
    if(NOT MMB_WASM2C OR NOT MMB_WABT_DIR)
      message(FATAL_ERROR "${target}: wasm2c nodig; zet -DMMB_WABT_DIR=<wabt-checkout> (README)")
    endif()
    set(gen ${CMAKE_CURRENT_BINARY_DIR}/w2c/${target})
    list(LENGTH w2c n)
    math(EXPR last "${n} - 1")
    foreach(i RANGE 0 ${last} 2)
      math(EXPR j "${i} + 1")
      list(GET w2c ${i} name)
      list(GET w2c ${j} wasm)
      add_custom_command(
        OUTPUT ${gen}/${name}.c ${gen}/${name}.h ${gen}/${name}_vt.h
        COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/wasm2c/gen_w2c.py ${MMB_WASM2C} ${wasm} ${gen} ${name}
        DEPENDS ${wasm} ${CMAKE_CURRENT_SOURCE_DIR}/wasm2c/gen_w2c.py
        COMMENT "wasm2c ${name}")
      target_sources(${target} PRIVATE ${gen}/${name}.c ${gen}/${name}_vt.h)
    endforeach()
    target_sources(${target} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/wasm2c/wasi_stubs.c ${MMB_WABT_DIR}/wasm2c/wasm-rt-impl.c
                   ${MMB_WABT_DIR}/wasm2c/wasm-rt-mem-impl.c ${MMB_WABT_DIR}/wasm2c/wasm-rt-exceptions-impl.c)
    target_include_directories(${target} PRIVATE ${gen} ${MMB_WABT_DIR}/wasm2c ${MMB_WABT_DIR}/third_party/simde)
    # Bounds checks in plaats van guard pages: geen signal handler in de DAW.
    target_compile_definitions(${target} PRIVATE WASM_RT_USE_MMAP=0 WASM_RT_MEMCHECK_BOUNDS_CHECK=1)
  endif()
  target_include_directories(${target} PRIVATE ${MMB_DSP_DIR} ${CMAKE_CURRENT_SOURCE_DIR}/src ${MMB_GENERATED_DIR} ${MMB_WASM_DIR} ${MMB_WASM_DIR}/shim ${A_INCLUDES})
  target_compile_definitions(${target} PUBLIC
    JUCE_WEB_BROWSER=1
    JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    # VST3 kent geen MIDI-CC/aftertouch/pitchbend als MIDI: de DAW stuurt ze als
    # parameters. Een patch (W2CMODS) heeft ze nodig voor MIDI-IN (modwheel,
    # aftertouch); een losse module niet (anders 2080 extra 'MIDI CC'-parameters).
    JUCE_VST3_EMULATE_MIDI_CC_WITH_PARAMETERS=$<IF:$<BOOL:${A_W2CMODS}>,1,0>)
  target_compile_definitions(${target} PRIVATE TEST=1 _USE_MATH_DEFINES=1 ${A_DEFINES})
  # Alleen voor C++ (een .c-bron met cstdio vooraf breekt de MSVC-STL). De
  # MI-bibliotheken gebruiken GCC/clang-extensies (VLA's, __attribute__,
  # lege arrays): op Windows bouwen met clang-cl (README).
  if(MSVC)
    target_compile_options(${target} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:/FIcstdio> /bigobj /wd4244 /wd4267 /wd4305)
    if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
      target_compile_options(${target} PRIVATE -Wno-everything)
    endif()
  else()
    target_compile_options(${target} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-include cstdio> -Wno-unused-value)
  endif()
  target_link_libraries(${target}
    PRIVATE MmbWebUi juce::juce_audio_utils juce::juce_gui_extra
    PUBLIC juce::juce_recommended_config_flags)
  # NOLTO: MMB Patch heeft alle modules; met LTO duurt het linken uren.
  if(NOT A_NOLTO)
    target_link_libraries(${target} PUBLIC juce::juce_recommended_lto_flags)
  endif()
endfunction()

# MMB_ONLY_PATCH=ON: alleen MMB Patch en de controle (een eigen bouwmap;
# configureren met alle modules duurt lang).
option(MMB_ONLY_PATCH "Alleen MMB Patch bouwen" OFF)
if(NOT MMB_ONLY_PATCH)
  # Handgeschreven (eigen MIDI- of kernvertaling):
  mmb_add_module(MmbHall Hall "MMB HALL" FALSE src/HallPlugin.cpp CATEGORIES Fx Reverb)
  mmb_add_module(MmbSid  Sid1 "MMB SID"  TRUE  src/SidPlugin.cpp  CATEGORIES Instrument Synth)
  # Gegenereerd: één regel per module (uniforme kern of wasm-gastheer).
  include(${MMB_GENERATED_DIR}/modules.cmake OPTIONAL)
  # Patch-plugins (editor/scripts/pluginPatches.ts): een hele patch, front als parameters.
  include(${MMB_GENERATED_DIR}/patches.cmake OPTIONAL)
endif()
# MMB Patch: elke patch in één plugin (GenericPatch.h).
include(${MMB_GENERATED_DIR}/patch_generic.cmake OPTIONAL)

# ── Controle zonder DAW: laadt een VST3, speelt/rendert, schrijft wav ─────
juce_add_console_app(MmbPluginCheck PRODUCT_NAME "mmb-plugin-check")
target_sources(MmbPluginCheck PRIVATE src/PluginCheck.cpp)
target_compile_definitions(MmbPluginCheck PRIVATE
  JUCE_WEB_BROWSER=0
  JUCE_USE_CURL=0
  JUCE_MODAL_LOOPS_PERMITTED=1
  JUCE_PLUGINHOST_VST3=1)
target_link_libraries(MmbPluginCheck
  PRIVATE juce::juce_audio_utils juce::juce_audio_processors juce::juce_audio_formats
  PUBLIC juce::juce_recommended_config_flags)
