// CTest — MusicBrain-SysEx-patches (doc/plans/sysex-patch.md):
//  - Inflate: stored-, fixed- en dynamic-Huffman-blokken (vectoren uit node-zlib)
//  - MbSysexAssembler: een .syx uit de editor-encoder (editor-patch + firmwareconfig)
//  - foutgevallen: controlegetal, volgorde, vreemde SysEx
#include "test_harness.h"
#include "mb/Protocol/Inflate.h"
#include "mb/Protocol/MbSysex.h"
#include "mb_sysex_vectors.h"

#include <cstring>
#include <string>
#include <vector>

using namespace mb::protocol;

namespace {
std::string inflateToString(const uint8_t* p, size_t n) {
    std::vector<uint8_t> out;
    const char* err = nullptr;
    if (!Inflate::raw(p, n, out, 1 << 20, &err)) return std::string("FOUT: ") + (err ? err : "?");
    return std::string(out.begin(), out.end());
}
std::vector<std::vector<uint8_t>> splitSyx(const uint8_t* p, size_t n) {
    std::vector<std::vector<uint8_t>> msgs;
    size_t start = 0;
    for (size_t i = 0; i < n; ++i) {
        if (p[i] == 0xF0) start = i;
        else if (p[i] == 0xF7) msgs.emplace_back(p + start, p + i + 1);
    }
    return msgs;
}
}  // namespace

MB_TEST(inflate_stored_fixed_dynamic) {
    MB_REQUIRE(inflateToString(kStored, kStored_len) == kSmallText);
    MB_REQUIRE(inflateToString(kFixed, kFixed_len) == kSmallText);
    MB_REQUIRE(inflateToString(kDynamic, kDynamic_len) == kBigText);
}

MB_TEST(inflate_rejects_garbage_and_caps_output) {
    const uint8_t junk[] = {0xFF, 0xFF, 0xFF, 0xFF};
    std::vector<uint8_t> out;
    MB_REQUIRE(!Inflate::raw(junk, sizeof junk, out, 1 << 16));
    out.clear();
    const char* err = nullptr;
    MB_REQUIRE(!Inflate::raw(kDynamic, kDynamic_len, out, 100, &err));   // te klein plafond
    MB_REQUIRE(err != nullptr && std::strcmp(err, "te groot") == 0);
    out.clear();
    MB_REQUIRE(!Inflate::raw(kDynamic, kDynamic_len / 2, out, 1 << 20));  // afgebroken stroom
}

MB_TEST(mbsysex_assembles_firmware_config_from_editor_syx) {
    const auto msgs = splitSyx(kSyx, kSyx_len);
    MB_REQUIRE(msgs.size() == 1 + kSyxConfigMsgs);   // 1 editor-patchbericht + de config
    MbSysexAssembler a;
    unsigned partial = 0, done = 0, ignored = 0;
    for (const auto& m : msgs) {
        switch (a.feed(m.data(), m.size())) {
            case MbSysexAssembler::Status::Partial: ++partial; break;
            case MbSysexAssembler::Status::Done:    ++done; break;
            case MbSysexAssembler::Status::Ignored: ++ignored; break;
            case MbSysexAssembler::Status::Error:   MB_REQUIRE(false); break;
        }
    }
    MB_REQUIRE(ignored == 1);                        // cmd 01 is voor editors
    MB_REQUIRE(partial == kSyxConfigMsgs - 1);
    MB_REQUIRE(done == 1);
    MB_REQUIRE(a.cmd() == kMbCmdFirmwareConfig);
    MB_REQUIRE(a.text() == kBigText);
}

MB_TEST(mbsysex_rejects_bad_checksum_order_and_foreign) {
    auto msgs = splitSyx(kSyx, kSyx_len);
    std::vector<std::vector<uint8_t>> cfg(msgs.begin() + 1, msgs.end());
    MbSysexAssembler a;
    // controlegetal kapot
    auto bad = cfg[0];
    bad[12] = static_cast<uint8_t>((bad[12] + 1) & 0x7F);
    MB_REQUIRE(a.feed(bad.data(), bad.size()) == MbSysexAssembler::Status::Error);
    // volgorde: bericht 2 zonder 1
    if (cfg.size() > 1) MB_REQUIRE(a.feed(cfg[1].data(), cfg[1].size()) == MbSysexAssembler::Status::Error);
    // vreemde SysEx (Roland)
    const uint8_t roland[] = {0xF0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7F, 0x00, 0x41, 0x00, 0x00, 0xF7};
    MB_REQUIRE(a.feed(roland, sizeof roland) == MbSysexAssembler::Status::Ignored);
    // en daarna gewoon weer goed
    MbSysexAssembler::Status last = MbSysexAssembler::Status::Ignored;
    for (const auto& m : cfg) last = a.feed(m.data(), m.size());
    MB_REQUIRE(last == MbSysexAssembler::Status::Done);
    MB_REQUIRE(a.text() == kBigText);
}
