cmake_minimum_required(VERSION 3.20)
project(musicbrain CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(MSVC)
    add_compile_options(/W4 /permissive-)
else()
    add_compile_options(-Wall -Wextra -Wpedantic)
endif()

enable_testing()

# Core library (hardware-independent).
add_subdirectory(core)

# Host HAL (compiles on PC; used by simulator and tests).
add_subdirectory(hal/host)

# Sim library: virtual SPI bus + chip models (DAC8568, GateBoard, ...).
set(BUILD_TESTING ON)
add_subdirectory(sim)

# Host-side simulator that runs the router against a fake hardware.
add_subdirectory(../tools/simulator simulator)

# Unit tests for core/.
add_subdirectory(core/tests)
