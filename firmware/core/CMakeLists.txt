add_library(musicbrain_core STATIC
    src/Patch.cpp
    src/PatchBank.cpp
    src/PatchCodec.cpp
    src/Router.cpp
    src/MatrixRouter.cpp
    src/SynthPatch.cpp
    src/SwitcherPatch.cpp
    src/SwitcherRouter.cpp
    src/VoiceAllocator.cpp
    src/Protocol/SpiFrame.cpp
)

target_include_directories(musicbrain_core PUBLIC include)
target_compile_features(musicbrain_core PUBLIC cxx_std_17)
