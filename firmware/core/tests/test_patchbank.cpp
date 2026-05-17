#include "test_harness.h"
#include "mb/PatchBank.h"

MB_TEST(bank_insert_and_find) {
    mb::PatchBank bank;
    mb::Patch a; a.id = 1; a.setName("A");
    mb::Patch b; b.id = 2; b.setName("B");
    MB_REQUIRE(bank.insert(a));
    MB_REQUIRE(bank.insert(b));
    MB_REQUIRE(!bank.insert(a));  // duplicate
    MB_REQUIRE(bank.size() == 2);
    MB_REQUIRE(bank.find(2)->nameView() == "B");
    MB_REQUIRE(bank.find(99) == nullptr);
}

MB_TEST(bank_active_program) {
    mb::PatchBank bank;
    mb::Patch a; a.id = 1; a.setName("A");
    bank.insert(a);
    MB_REQUIRE(!bank.active());
    MB_REQUIRE(bank.setActive(1));
    MB_REQUIRE(bank.active() && bank.active()->id == 1);
    MB_REQUIRE(!bank.setActive(7));
}
