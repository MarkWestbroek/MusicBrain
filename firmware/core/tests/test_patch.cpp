#include "test_harness.h"
#include "mb/Patch.h"

MB_TEST(patch_set_and_read_name) {
    mb::Patch p;
    p.setName("Crunch Lead");
    MB_REQUIRE(p.nameView() == "Crunch Lead");
}

MB_TEST(patch_truncates_long_name) {
    mb::Patch p;
    std::string huge(100, 'x');
    p.setName(huge);
    MB_REQUIRE(p.nameView().size() == mb::kPatchNameMax - 1);
}
