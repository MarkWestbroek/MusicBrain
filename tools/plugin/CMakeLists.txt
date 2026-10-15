# MusicBrain-modules als audioplugin (doc/plans/plugin.md, README.md hier).
#
# Dezelfde kern als de Teensy en de simulator (firmware/lib/mmb-dsp), in een
# JUCE-jas: VST3 (en AU op de Mac) plus een Standalone-programma per module.
# De bediening is het editorpaneel in een webview; parameters komen uit het
# paneel (editor/scripts/pluginParams.ts → generated/). JUCE staat niet in de
# repo; zie README.md voor de stappen.
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

# ── De bediening en de parameterlijsten, uit de editor ───────────────────
#   cd editor && MMB_JUCE_DIR=<pad> npm run build:plugin-ui
# maakt web/ (index.html, app.js, app.css: het paneel) en generated/
# (<typeId>_params.h). Beide niet in git.
file(GLOB MMB_WEB_FILES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/web/*)
file(GLOB MMB_GEN_FILES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/generated/*.h)
if(NOT MMB_WEB_FILES OR NOT MMB_GEN_FILES)
  message(FATAL_ERROR "tools/plugin/web/ of generated/ ontbreekt: eerst `npm run build:plugin-ui` in editor/ (met MMB_JUCE_DIR)")
endif()
juce_add_binary_data(MmbWebUi HEADER_NAME MmbWebUi.h NAMESPACE MmbWebUi SOURCES ${MMB_WEB_FILES})

set(MMB_FORMATS VST3 Standalone)
if(APPLE)
  list(APPEND MMB_FORMATS AU)
endif()

# Eén module als plugin: mmb_add_module(<target> <code> "<productnaam>" <synth> <bron.cpp> <VST3-categorieën...>)
function(mmb_add_module target code product synth source)
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
    VST3_CATEGORIES ${ARGN})
  target_sources(${target} PRIVATE ${source})
  target_include_directories(${target} PRIVATE ${MMB_DSP_DIR} ${CMAKE_CURRENT_SOURCE_DIR}/src ${CMAKE_CURRENT_SOURCE_DIR}/generated)
  target_compile_definitions(${target} PUBLIC
    JUCE_WEB_BROWSER=1
    JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_VST3_EMULATE_MIDI_CC_WITH_PARAMETERS=0)   # anders 2080 extra 'MIDI CC'-parameters in de DAW
  target_link_libraries(${target}
    PRIVATE MmbWebUi juce::juce_audio_utils juce::juce_gui_extra
    PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags)
endfunction()

# Handgeschreven (eigen MIDI- of kernvertaling):
mmb_add_module(MmbHall Hall "MMB HALL" FALSE src/HallPlugin.cpp Fx Reverb)
mmb_add_module(MmbSid  Sid1 "MMB SID"  TRUE  src/SidPlugin.cpp  Instrument Synth)
# Gegenereerd (uniforme kern-interface, KernelPlugin.h): één regel per module.
set(MMB_GENERATED_DIR ${CMAKE_CURRENT_SOURCE_DIR}/generated)
include(${MMB_GENERATED_DIR}/modules.cmake OPTIONAL)

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
