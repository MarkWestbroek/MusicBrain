# MusicBrain-modules als audioplugin (proef, 2026-10-15; doc/plans/plugin.md).
#
# Dezelfde kern als de Teensy en de simulator (firmware/lib/mmb-dsp), in een
# JUCE-jas: VST3 en een Standalone-programma. JUCE staat niet in de repo:
#
#   git clone --depth 1 --branch 8.0.4 https://github.com/juce-framework/JUCE <pad>
#   cmake -S tools/plugin -B <build> -G Ninja -DCMAKE_BUILD_TYPE=Release -DMMB_JUCE_DIR=<pad>
#   cmake --build <build>
#
# Op Windows vanuit een "x64 Native Tools"-omgeving (vcvars64.bat).
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

# ── HALL ─────────────────────────────────────────────────────────────────
juce_add_plugin(MmbHall
  COMPANY_NAME "MusicBrain"
  PLUGIN_MANUFACTURER_CODE Mmbr
  PLUGIN_CODE Hall
  FORMATS VST3 Standalone
  PRODUCT_NAME "MMB HALL"
  IS_SYNTH FALSE
  NEEDS_MIDI_INPUT FALSE
  NEEDS_MIDI_OUTPUT FALSE
  COPY_PLUGIN_AFTER_BUILD FALSE
  VST3_CATEGORIES Fx Reverb)
target_sources(MmbHall PRIVATE src/HallPlugin.cpp)
target_include_directories(MmbHall PRIVATE ${MMB_DSP_DIR})
target_compile_definitions(MmbHall PUBLIC
  JUCE_WEB_BROWSER=0
  JUCE_USE_CURL=0
  JUCE_VST3_CAN_REPLACE_VST2=0)
target_link_libraries(MmbHall
  PRIVATE juce::juce_audio_utils
  PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags)

# ── Controle zonder DAW: laadt een VST3, rendert een impuls, schrijft wav ──
juce_add_console_app(MmbPluginCheck PRODUCT_NAME "mmb-plugin-check")
target_sources(MmbPluginCheck PRIVATE src/PluginCheck.cpp)
target_compile_definitions(MmbPluginCheck PRIVATE
  JUCE_WEB_BROWSER=0
  JUCE_USE_CURL=0
  JUCE_PLUGINHOST_VST3=1)
target_link_libraries(MmbPluginCheck
  PRIVATE juce::juce_audio_utils juce::juce_audio_processors juce::juce_audio_formats
  PUBLIC juce::juce_recommended_config_flags)
