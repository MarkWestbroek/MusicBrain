add_executable(sim_tests
    test_endtoend.cpp
    test_main.cpp
)
target_link_libraries(sim_tests PRIVATE musicbrain_sim)
target_include_directories(sim_tests PRIVATE
    ${CMAKE_SOURCE_DIR}/core/tests
)
add_test(NAME sim_tests COMMAND sim_tests)
