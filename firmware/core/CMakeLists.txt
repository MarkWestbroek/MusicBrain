add_library(musicbrain_core STATIC
    src/Patch.cpp
    src/PatchBank.cpp
    src/Router.cpp
    src/Protocol/SpiFrame.cpp
)

target_include_directories(musicbrain_core PUBLIC include)
target_compile_features(musicbrain_core PUBLIC cxx_std_17)
