// Round-trip tests for PatchCodec. See doc/protocols/schemas/patch.md.

#include "mb/PatchCodec.h"
#include "test_harness.h"

#include <cstring>
#include <string>

namespace {

mb::Patch makePatch() {
    mb::Patch p{};
    p.id            = 42;
    p.schemaVersion = 1;
    p.setName("Crunch Lead");
    const uint8_t kBlob[] = {0xA1, 0x63, 'f', 'o', 'o', 'd'};
    p.blobSize = sizeof(kBlob);
    std::memcpy(p.blob.data(), kBlob, sizeof(kBlob));
    return p;
}

}  // namespace

MB_TEST(patchcodec_json_roundtrip) {
    auto p = makePatch();
    auto j = mb::PatchCodec::toJson(p);
    auto p2 = mb::PatchCodec::fromJson(j);
    MB_REQUIRE(p2.has_value());
    MB_REQUIRE(*p2 == p);
}

MB_TEST(patchcodec_json_known_output) {
    auto p = makePatch();
    auto j = mb::PatchCodec::toJson(p);
    // Schema doc specifies compact, sorted-key form.
    MB_REQUIRE(j == "{\"id\":42,\"ver\":1,\"name\":\"Crunch Lead\",\"blob\":\"a163666f6f64\"}");
}

MB_TEST(patchcodec_cbor_roundtrip) {
    auto p = makePatch();
    auto c = mb::PatchCodec::toCbor(p);
    auto p2 = mb::PatchCodec::fromCbor(c);
    MB_REQUIRE(p2.has_value());
    MB_REQUIRE(*p2 == p);
}

MB_TEST(patchcodec_cross_format_roundtrip) {
    auto p = makePatch();
    auto c = mb::PatchCodec::toCbor(p);
    auto p2 = mb::PatchCodec::fromCbor(c);
    MB_REQUIRE(p2.has_value());
    auto j  = mb::PatchCodec::toJson(*p2);
    auto p3 = mb::PatchCodec::fromJson(j);
    MB_REQUIRE(p3.has_value());
    MB_REQUIRE(*p3 == p);
}

MB_TEST(patchcodec_empty_blob_roundtrip) {
    mb::Patch p{};
    p.id = 7;
    p.schemaVersion = 1;
    p.setName("Empty");
    p.blobSize = 0;

    auto j  = mb::PatchCodec::toJson(p);
    MB_REQUIRE(j.find("\"blob\":\"\"") != std::string::npos);
    auto p2 = mb::PatchCodec::fromJson(j);
    MB_REQUIRE(p2.has_value());
    MB_REQUIRE(*p2 == p);

    auto c  = mb::PatchCodec::toCbor(p);
    auto p3 = mb::PatchCodec::fromCbor(c);
    MB_REQUIRE(p3.has_value());
    MB_REQUIRE(*p3 == p);
}

MB_TEST(patchcodec_max_size_roundtrip) {
    mb::Patch p{};
    p.id = 65535;
    p.schemaVersion = 1;
    p.setName("Twenty-three character!");  // 23 chars (max usable)
    MB_REQUIRE(p.nameView().size() == mb::kPatchNameMax - 1);
    p.blobSize = mb::kPatchBlobMax;
    for (std::size_t i = 0; i < mb::kPatchBlobMax; ++i) {
        p.blob[i] = static_cast<uint8_t>(i & 0xFF);
    }
    auto c  = mb::PatchCodec::toCbor(p);
    auto p2 = mb::PatchCodec::fromCbor(c);
    MB_REQUIRE(p2.has_value());
    MB_REQUIRE(*p2 == p);
}

MB_TEST(patchcodec_unknown_fields_ignored) {
    // Decoder must skip unknown fields for forward compatibility.
    std::string j = "{\"id\":1,\"ver\":1,\"name\":\"X\","
                    "\"future\":{\"nested\":[1,2,3]},"
                    "\"blob\":\"\"}";
    auto p = mb::PatchCodec::fromJson(j);
    MB_REQUIRE(p.has_value());
    MB_REQUIRE(p->id == 1);
    MB_REQUIRE(p->nameView() == "X");
}

MB_TEST(patchcodec_rejects_missing_required) {
    MB_REQUIRE(!mb::PatchCodec::fromJson("{\"id\":1,\"ver\":1}").has_value());
    MB_REQUIRE(!mb::PatchCodec::fromJson("{\"id\":1,\"name\":\"X\"}").has_value());
    MB_REQUIRE(!mb::PatchCodec::fromJson("{\"ver\":1,\"name\":\"X\"}").has_value());
}

MB_TEST(patchcodec_rejects_oversized_name) {
    std::string j = "{\"id\":1,\"ver\":1,\"name\":\""
                    "this-name-is-far-too-long-for-the-buffer"
                    "\",\"blob\":\"\"}";
    MB_REQUIRE(!mb::PatchCodec::fromJson(j).has_value());
}

MB_TEST(patchcodec_rejects_bad_hex) {
    std::string j = "{\"id\":1,\"ver\":1,\"name\":\"X\",\"blob\":\"zz\"}";
    MB_REQUIRE(!mb::PatchCodec::fromJson(j).has_value());
}

MB_TEST(patchcodec_cbor_rejects_truncated) {
    auto c = mb::PatchCodec::toCbor(makePatch());
    c.pop_back();
    MB_REQUIRE(!mb::PatchCodec::fromCbor(c).has_value());
}
