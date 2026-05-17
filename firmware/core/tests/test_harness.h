// Tiny zero-dependency test harness so the host build needs no extra packages.
#pragma once
#include <cstdio>
#include <cstdlib>
#include <stdexcept>
#include <string>
#include <vector>

namespace mbtest {

using TestFn = void (*)();
struct TestCase { const char* name; TestFn fn; };

inline std::vector<TestCase>& registry() {
    static std::vector<TestCase> r;
    return r;
}

inline int registerCase(const char* name, TestFn fn) {
    registry().push_back({name, fn});
    return 0;
}

inline int runAll() {
    int failed = 0;
    for (auto& tc : registry()) {
        try {
            tc.fn();
            std::printf("[ OK   ] %s\n", tc.name);
        } catch (const std::exception& e) {
            std::printf("[ FAIL ] %s: %s\n", tc.name, e.what());
            ++failed;
        } catch (...) {
            std::printf("[ FAIL ] %s: unknown\n", tc.name);
            ++failed;
        }
    }
    std::printf("%zu test(s), %d failed\n", registry().size(), failed);
    return failed == 0 ? 0 : 1;
}

}  // namespace mbtest

#define MB_TEST(name)                                                    \
    static void name();                                                  \
    static int  name##_reg = ::mbtest::registerCase(#name, &name);       \
    static void name()

#define MB_REQUIRE(cond)                                                 \
    do {                                                                 \
        if (!(cond)) {                                                   \
            throw std::runtime_error(std::string("REQUIRE failed: " #cond \
                " at " __FILE__));                                       \
        }                                                                \
    } while (0)
