add_executable(core_tests
    test_patch.cpp
    test_patchbank.cpp
    test_patchcodec.cpp
    test_matrixrouter.cpp
    test_router.cpp
    test_spiframe.cpp
    test_switcherrouter.cpp
    test_ahdsr.cpp
    test_lfo.cpp
    test_midiin.cpp
    test_cvbreakout.cpp
    test_main.cpp
)
target_link_libraries(core_tests PRIVATE musicbrain_core)

add_test(NAME core_tests COMMAND core_tests)
