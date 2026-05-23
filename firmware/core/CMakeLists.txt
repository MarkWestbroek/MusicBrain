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
    src/runtime/Ahdsr.cpp
    src/runtime/Lfo.cpp
    src/runtime/CvBreakout.cpp
    src/runtime/CvOut12.cpp
    src/runtime/CvOut16.cpp
    src/runtime/GateOut.cpp
)

target_include_directories(musicbrain_core PUBLIC include)
target_compile_features(musicbrain_core PUBLIC cxx_std_17)
