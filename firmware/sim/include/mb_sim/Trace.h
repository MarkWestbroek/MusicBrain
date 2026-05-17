#pragma once
// Trace: NDJSON event log of every observable simulator event.
// One JSON object per line, lines flushed eagerly so a tail -f works.
//
// Event schema (see doc/Simulation.md):
//   {"t_us": <int>, "kind": "<str>", ...}
// Common kinds:
//   "midi"   - MIDI event in:    {ev: "noteOn"|"noteOff"|"pc", note?, vel?, prog?}
//   "spi"    - SPI frame on bus: {op, bytes}
//   "cv"     - DAC output:       {ch: "0xNNNN", code, volts}
//   "gate"   - gate output:      {ch: "0xNNNN", on: bool}

#include <cstdint>
#include <ostream>
#include <sstream>
#include <string>

namespace mb::sim {

class Trace {
public:
    explicit Trace(std::ostream& out) : out_(out) {}

    // Begin a line. The caller writes "field":value pairs via the helpers,
    // then calls end(). Time is captured implicitly by the caller via `t_us`.
    Trace& begin(uint64_t tUs, const char* kind) {
        line_.str(std::string{});
        line_ << "{\"t_us\":" << tUs
              << ",\"kind\":\"" << kind << "\"";
        return *this;
    }
    template <typename T>
    Trace& field(const char* name, T&& v) {
        line_ << ",\"" << name << "\":" << std::forward<T>(v);
        return *this;
    }
    Trace& fieldStr(const char* name, const std::string& v) {
        line_ << ",\"" << name << "\":\"" << v << "\"";
        return *this;
    }
    Trace& fieldBool(const char* name, bool v) {
        line_ << ",\"" << name << "\":" << (v ? "true" : "false");
        return *this;
    }
    void end() {
        line_ << "}\n";
        out_ << line_.str();
        out_.flush();
    }

private:
    std::ostream&      out_;
    std::ostringstream line_;
};

}  // namespace mb::sim
