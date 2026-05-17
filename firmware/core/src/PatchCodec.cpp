// PatchCodec implementation. See PatchCodec.h.
//
// Implementation notes
// --------------------
// * JSON: tiny recursive-descent parser, only supports what the patch schema
//   needs: object, string, integer. No floats, no arrays, no nested objects.
//   This keeps the parser <300 lines and easy to audit.
// * CBOR: subset of RFC 8949. We emit and accept:
//     - unsigned integers   (major type 0)   for `id` and `ver`
//     - byte strings        (major type 2)   for `blob`
//     - text strings        (major type 3)   for keys and `name`
//     - definite-length map (major type 5)   for the top-level object
//   We never emit indefinite-length items, but the decoder rejects them
//   cleanly rather than crashing.

#include "mb/PatchCodec.h"

#include <algorithm>
#include <cstring>

namespace mb {

// ---------------------------------------------------------------- equality
bool operator==(const Patch& a, const Patch& b) noexcept {
    if (a.id != b.id) return false;
    if (a.schemaVersion != b.schemaVersion) return false;
    if (a.blobSize != b.blobSize) return false;
    if (a.nameView() != b.nameView()) return false;
    return std::memcmp(a.blob.data(), b.blob.data(), a.blobSize) == 0;
}

// ================================================================ JSON
namespace {

// ---- writer ----
void appendHex(std::string& out, const uint8_t* data, std::size_t n) {
    static constexpr char kHex[] = "0123456789abcdef";
    out.reserve(out.size() + n * 2);
    for (std::size_t i = 0; i < n; ++i) {
        out.push_back(kHex[data[i] >> 4]);
        out.push_back(kHex[data[i] & 0x0F]);
    }
}

void appendJsonString(std::string& out, std::string_view s) {
    out.push_back('"');
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b";  break;
            case '\f': out += "\\f";  break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    static constexpr char kHex[] = "0123456789abcdef";
                    out += "\\u00";
                    out.push_back(kHex[(c >> 4) & 0xF]);
                    out.push_back(kHex[c & 0xF]);
                } else {
                    out.push_back(c);
                }
        }
    }
    out.push_back('"');
}

// ---- parser ----
struct JsonParser {
    std::string_view s;
    std::size_t      i = 0;

    bool eof() const { return i >= s.size(); }
    char peek() const { return s[i]; }

    void skipWs() {
        while (!eof()) {
            char c = peek();
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') ++i;
            else break;
        }
    }

    bool consume(char c) {
        skipWs();
        if (eof() || peek() != c) return false;
        ++i;
        return true;
    }

    bool parseString(std::string& out) {
        skipWs();
        if (eof() || peek() != '"') return false;
        ++i;
        while (!eof()) {
            char c = s[i++];
            if (c == '"') return true;
            if (c == '\\') {
                if (eof()) return false;
                char esc = s[i++];
                switch (esc) {
                    case '"':  out.push_back('"');  break;
                    case '\\': out.push_back('\\'); break;
                    case '/':  out.push_back('/');  break;
                    case 'b':  out.push_back('\b'); break;
                    case 'f':  out.push_back('\f'); break;
                    case 'n':  out.push_back('\n'); break;
                    case 'r':  out.push_back('\r'); break;
                    case 't':  out.push_back('\t'); break;
                    case 'u': {
                        if (i + 4 > s.size()) return false;
                        unsigned v = 0;
                        for (int k = 0; k < 4; ++k) {
                            char h = s[i++];
                            v <<= 4;
                            if (h >= '0' && h <= '9') v |= unsigned(h - '0');
                            else if (h >= 'a' && h <= 'f') v |= unsigned(h - 'a' + 10);
                            else if (h >= 'A' && h <= 'F') v |= unsigned(h - 'A' + 10);
                            else return false;
                        }
                        // We only need BMP up to 0x7F for `name` (ASCII fits in
                        // single bytes; non-ASCII chars are allowed via direct
                        // UTF-8 in the input, so \u escapes for >0x7F are not
                        // supported here — keeps the device decoder small).
                        if (v > 0x7F) return false;
                        out.push_back(static_cast<char>(v));
                        break;
                    }
                    default: return false;
                }
            } else {
                out.push_back(c);
            }
        }
        return false;  // unterminated string
    }

    bool parseUInt(uint64_t& out) {
        skipWs();
        if (eof()) return false;
        if (peek() < '0' || peek() > '9') return false;
        uint64_t v = 0;
        bool any = false;
        while (!eof() && peek() >= '0' && peek() <= '9') {
            unsigned d = unsigned(s[i++] - '0');
            // Overflow guard for uint64_t.
            if (v > (UINT64_MAX - d) / 10) return false;
            v = v * 10 + d;
            any = true;
        }
        if (!any) return false;
        out = v;
        return true;
    }

    // Skip one JSON value (for unknown fields).
    bool skipValue() {
        skipWs();
        if (eof()) return false;
        char c = peek();
        if (c == '"') { std::string tmp; return parseString(tmp); }
        if (c == '{') return skipBalanced('{', '}');
        if (c == '[') return skipBalanced('[', ']');
        if (c == 't' || c == 'f' || c == 'n') {
            while (!eof() && ((peek() >= 'a' && peek() <= 'z'))) ++i;
            return true;
        }
        // number
        if (c == '-' || (c >= '0' && c <= '9')) {
            if (c == '-') ++i;
            while (!eof()) {
                char d = peek();
                if ((d >= '0' && d <= '9') || d == '.' || d == 'e' || d == 'E'
                    || d == '+' || d == '-') ++i;
                else break;
            }
            return true;
        }
        return false;
    }

    bool skipBalanced(char open, char close) {
        if (eof() || peek() != open) return false;
        ++i;
        int depth = 1;
        bool inStr = false;
        while (!eof() && depth > 0) {
            char c = s[i++];
            if (inStr) {
                if (c == '\\' && !eof()) ++i;
                else if (c == '"') inStr = false;
            } else {
                if (c == '"') inStr = true;
                else if (c == open) ++depth;
                else if (c == close) --depth;
            }
        }
        return depth == 0;
    }
};

bool hexNibble(char c, uint8_t& out) {
    if (c >= '0' && c <= '9') { out = uint8_t(c - '0'); return true; }
    if (c >= 'a' && c <= 'f') { out = uint8_t(c - 'a' + 10); return true; }
    if (c >= 'A' && c <= 'F') { out = uint8_t(c - 'A' + 10); return true; }
    return false;
}

bool decodeHex(std::string_view s, std::vector<uint8_t>& out) {
    if (s.size() % 2 != 0) return false;
    out.clear();
    out.reserve(s.size() / 2);
    for (std::size_t k = 0; k < s.size(); k += 2) {
        uint8_t hi, lo;
        if (!hexNibble(s[k], hi) || !hexNibble(s[k + 1], lo)) return false;
        out.push_back(uint8_t((hi << 4) | lo));
    }
    return true;
}

}  // namespace

std::string PatchCodec::toJson(const Patch& p) {
    std::string out;
    out.reserve(64 + p.blobSize * 2);
    out += "{\"id\":";
    out += std::to_string(p.id);
    out += ",\"ver\":";
    out += std::to_string(p.schemaVersion);
    out += ",\"name\":";
    appendJsonString(out, p.nameView());
    out += ",\"blob\":\"";
    appendHex(out, p.blob.data(), p.blobSize);
    out += "\"}";
    return out;
}

std::optional<Patch> PatchCodec::fromJson(std::string_view s) {
    JsonParser jp{s};
    if (!jp.consume('{')) return std::nullopt;

    Patch p{};
    bool haveId = false, haveVer = false, haveName = false;

    jp.skipWs();
    if (!jp.eof() && jp.peek() == '}') {
        // empty object — missing required fields
        return std::nullopt;
    }

    while (true) {
        std::string key;
        if (!jp.parseString(key)) return std::nullopt;
        if (!jp.consume(':'))     return std::nullopt;

        if (key == "id") {
            uint64_t v;
            if (!jp.parseUInt(v) || v > UINT16_MAX) return std::nullopt;
            p.id = static_cast<ProgramId>(v);
            haveId = true;
        } else if (key == "ver") {
            uint64_t v;
            if (!jp.parseUInt(v) || v > UINT16_MAX) return std::nullopt;
            p.schemaVersion = static_cast<uint16_t>(v);
            haveVer = true;
        } else if (key == "name") {
            std::string n;
            if (!jp.parseString(n)) return std::nullopt;
            if (n.size() > kPatchNameMax - 1) return std::nullopt;
            for (char c : n) if (c == '\0') return std::nullopt;
            p.setName(n);
            haveName = true;
        } else if (key == "blob") {
            std::string hex;
            if (!jp.parseString(hex)) return std::nullopt;
            std::vector<uint8_t> bytes;
            if (!decodeHex(hex, bytes)) return std::nullopt;
            if (bytes.size() > kPatchBlobMax) return std::nullopt;
            p.blobSize = static_cast<uint16_t>(bytes.size());
            std::memcpy(p.blob.data(), bytes.data(), bytes.size());
        } else {
            if (!jp.skipValue()) return std::nullopt;
        }

        jp.skipWs();
        if (jp.consume(',')) continue;
        if (jp.consume('}')) break;
        return std::nullopt;
    }

    if (!haveId || !haveVer || !haveName) return std::nullopt;
    return p;
}

// ================================================================ CBOR
namespace {

// Encode CBOR header: major type in top 3 bits, length argument in low 5 bits
// (with extension bytes if the value doesn't fit).
void cborHead(std::vector<uint8_t>& out, uint8_t major, uint64_t arg) {
    const uint8_t mt = uint8_t(major << 5);
    if (arg <= 23) {
        out.push_back(uint8_t(mt | arg));
    } else if (arg <= 0xFF) {
        out.push_back(uint8_t(mt | 24));
        out.push_back(uint8_t(arg));
    } else if (arg <= 0xFFFF) {
        out.push_back(uint8_t(mt | 25));
        out.push_back(uint8_t(arg >> 8));
        out.push_back(uint8_t(arg));
    } else if (arg <= 0xFFFFFFFFu) {
        out.push_back(uint8_t(mt | 26));
        out.push_back(uint8_t(arg >> 24));
        out.push_back(uint8_t(arg >> 16));
        out.push_back(uint8_t(arg >> 8));
        out.push_back(uint8_t(arg));
    } else {
        out.push_back(uint8_t(mt | 27));
        for (int sh = 56; sh >= 0; sh -= 8) {
            out.push_back(uint8_t(arg >> sh));
        }
    }
}

void cborText(std::vector<uint8_t>& out, std::string_view s) {
    cborHead(out, 3, s.size());
    out.insert(out.end(), s.begin(), s.end());
}

void cborBytes(std::vector<uint8_t>& out, const uint8_t* data, std::size_t n) {
    cborHead(out, 2, n);
    out.insert(out.end(), data, data + n);
}

// ---- decoder ----
struct CborReader {
    const uint8_t* p;
    std::size_t    n;
    std::size_t    i = 0;

    bool eof() const { return i >= n; }
    bool need(std::size_t k) const { return i + k <= n; }

    // Read one header. Returns major type and the argument value.
    // Rejects indefinite-length items (additional info 31).
    bool readHead(uint8_t& major, uint64_t& arg) {
        if (eof()) return false;
        uint8_t b  = p[i++];
        major      = uint8_t(b >> 5);
        uint8_t ai = uint8_t(b & 0x1F);
        if (ai < 24) { arg = ai; return true; }
        switch (ai) {
            case 24:
                if (!need(1)) return false;
                arg = p[i++];
                return true;
            case 25:
                if (!need(2)) return false;
                arg = (uint64_t(p[i]) << 8) | p[i + 1];
                i += 2;
                return true;
            case 26:
                if (!need(4)) return false;
                arg = (uint64_t(p[i]) << 24) | (uint64_t(p[i + 1]) << 16)
                    | (uint64_t(p[i + 2]) << 8) | p[i + 3];
                i += 4;
                return true;
            case 27:
                if (!need(8)) return false;
                arg = 0;
                for (int k = 0; k < 8; ++k) arg = (arg << 8) | p[i + k];
                i += 8;
                return true;
            default:
                return false;  // 28..30 reserved, 31 = indefinite (unsupported)
        }
    }

    // Skip one whole CBOR data item (used for unknown map values).
    bool skipItem() {
        uint8_t  major;
        uint64_t arg;
        if (!readHead(major, arg)) return false;
        switch (major) {
            case 0: case 1: case 7:
                return true;
            case 2: case 3:
                if (arg > n - i) return false;
                i += static_cast<std::size_t>(arg);
                return true;
            case 4:  // array
                for (uint64_t k = 0; k < arg; ++k) if (!skipItem()) return false;
                return true;
            case 5:  // map
                for (uint64_t k = 0; k < arg; ++k) {
                    if (!skipItem()) return false;
                    if (!skipItem()) return false;
                }
                return true;
            case 6:  // tag
                return skipItem();
        }
        return false;
    }
};

}  // namespace

std::vector<uint8_t> PatchCodec::toCbor(const Patch& p) {
    std::vector<uint8_t> out;
    out.reserve(32 + p.blobSize);

    cborHead(out, 5, 4);             // map(4)
    cborText(out, "id");
    cborHead(out, 0, p.id);
    cborText(out, "ver");
    cborHead(out, 0, p.schemaVersion);
    cborText(out, "name");
    cborText(out, p.nameView());
    cborText(out, "blob");
    cborBytes(out, p.blob.data(), p.blobSize);

    return out;
}

std::optional<Patch> PatchCodec::fromCbor(const uint8_t* data, std::size_t size) {
    CborReader rd{data, size};

    uint8_t  major;
    uint64_t arg;
    if (!rd.readHead(major, arg)) return std::nullopt;
    if (major != 5) return std::nullopt;  // must be a map
    const uint64_t nEntries = arg;

    Patch p{};
    bool haveId = false, haveVer = false, haveName = false;

    for (uint64_t k = 0; k < nEntries; ++k) {
        // Key must be a text string.
        if (!rd.readHead(major, arg)) return std::nullopt;
        if (major != 3) return std::nullopt;
        if (arg > rd.n - rd.i) return std::nullopt;
        std::string_view key(reinterpret_cast<const char*>(rd.p + rd.i),
                             static_cast<std::size_t>(arg));
        rd.i += static_cast<std::size_t>(arg);

        if (key == "id") {
            if (!rd.readHead(major, arg) || major != 0 || arg > UINT16_MAX)
                return std::nullopt;
            p.id = static_cast<ProgramId>(arg);
            haveId = true;
        } else if (key == "ver") {
            if (!rd.readHead(major, arg) || major != 0 || arg > UINT16_MAX)
                return std::nullopt;
            p.schemaVersion = static_cast<uint16_t>(arg);
            haveVer = true;
        } else if (key == "name") {
            if (!rd.readHead(major, arg) || major != 3) return std::nullopt;
            if (arg > kPatchNameMax - 1) return std::nullopt;
            if (arg > rd.n - rd.i) return std::nullopt;
            std::string_view name(reinterpret_cast<const char*>(rd.p + rd.i),
                                  static_cast<std::size_t>(arg));
            for (char c : name) if (c == '\0') return std::nullopt;
            p.setName(name);
            rd.i += static_cast<std::size_t>(arg);
            haveName = true;
        } else if (key == "blob") {
            if (!rd.readHead(major, arg) || major != 2) return std::nullopt;
            if (arg > kPatchBlobMax) return std::nullopt;
            if (arg > rd.n - rd.i) return std::nullopt;
            p.blobSize = static_cast<uint16_t>(arg);
            std::memcpy(p.blob.data(), rd.p + rd.i, static_cast<std::size_t>(arg));
            rd.i += static_cast<std::size_t>(arg);
        } else {
            if (!rd.skipItem()) return std::nullopt;
        }
    }

    if (!haveId || !haveVer || !haveName) return std::nullopt;
    return p;
}

}  // namespace mb
