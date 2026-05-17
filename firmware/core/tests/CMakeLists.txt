add_executable(core_tests
    test_patch.cpp
    test_patchbank.cpp
    test_router.cpp
    test_spiframe.cpp
    test_main.cpp
)
target_link_libraries(core_tests PRIVATE musicbrain_core)

add_test(NAME core_tests COMMAND core_tests)
