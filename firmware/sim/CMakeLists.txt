cmake_minimum_required(VERSION 3.20)

add_library(musicbrain_sim STATIC
    src/VirtualSpiBus.cpp
    src/chips/Dac8568.cpp
    src/chips/GateBoard.cpp
)
target_include_directories(musicbrain_sim PUBLIC include)
target_link_libraries(musicbrain_sim PUBLIC musicbrain_core)
target_compile_features(musicbrain_sim PUBLIC cxx_std_17)

if(BUILD_TESTING)
    enable_testing()
    add_subdirectory(tests)
endif()
