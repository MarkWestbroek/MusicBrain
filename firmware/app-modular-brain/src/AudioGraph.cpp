// AudioGraph.cpp — dynamic audio graph builder.
// See AudioGraph.h for design notes.

#include "AudioGraph.h"
#include "TeensyLink.h"

namespace mmb_link {

void AudioGraph::tearDown() {
    AudioNoInterrupts();
    conns_.clear();   // dtors deregister AudioConnections from the audio system
    AudioInterrupts();
    // De mixers blijven staan (AudioStream); zonder verbindingen zijn ze stil.
    mixersUsed_ = 0;
    wired_   = 0;
    skipped_ = 0;
}

AudioMixer4& AudioGraph::takeMixer() {
    if (mixersUsed_ >= static_cast<int>(mixers_.size()))
        mixers_.push_back(std::make_unique<AudioMixer4>());
    AudioMixer4& m = *mixers_[mixersUsed_++];
    for (int ch = 0; ch < 4; ++ch) m.gain(ch, 1.0f);   // sommeren, zoals de sim
    return m;
}

void AudioGraph::connect(const AudioPort& src, AudioStream& dst, unsigned char dstCh) {
    conns_.push_back(std::make_unique<AudioConnection>(*src.stream, src.channel, dst, dstCh));
}

void AudioGraph::build(
    JsonObjectConst patch,
    const std::unordered_map<std::string,
                             std::unique_ptr<mb::runtime::Module>>& instances)
{
    tearDown();

    JsonArrayConst conns = patch["connections"].as<JsonArrayConst>();
    if (conns.isNull()) {
        TeensyLink::log("AudioGraph: no connections array in patch");
        return;
    }

    // Eerst verzamelen per bestemmingsingang, dan bedraden: zo zien we of er
    // meer dan één bron op een ingang zit (fan-in, zie de kop van AudioGraph.h).
    std::vector<FanIn> groups;

    for (JsonObjectConst c : conns) {
        const char* fromModId  = c["from"]["moduleId"] | "";
        const char* fromPortId = c["from"]["portId"]   | "";
        const char* toModId    = c["to"]["moduleId"]   | "";
        const char* toPortId   = c["to"]["portId"]     | "";

        // Look up both module instances
        auto fromIt = instances.find(std::string{fromModId});
        auto toIt   = instances.find(std::string{toModId});
        if (fromIt == instances.end() || toIt == instances.end()) {
            TeensyLink::logf("  skip(noinst): %s.%s -> %s.%s",
                             fromModId, fromPortId, toModId, toPortId);
            ++skipped_;
            continue;
        }

        // Both must be AudioModules (dynamic_cast unavailable; use virtual tag)
        auto* src = AudioModule::from(fromIt->second.get());
        auto* dst = AudioModule::from(toIt->second.get());
        if (!src || !dst) {
            TeensyLink::logf("  skip(notaudio): %s(%s).%s -> %s(%s).%s",
                             fromModId,
                             std::string{fromIt->second->typeId()}.c_str(), fromPortId,
                             toModId,
                             std::string{toIt->second->typeId()}.c_str(), toPortId);
            ++skipped_;
            continue;
        }

        // Resolve named ports to stream + channel
        AudioPort sp = src->outputPort(fromPortId);
        AudioPort dp = dst->inputPort(toPortId);
        if (!sp || !dp) {
            TeensyLink::logf("  skip(port): %s(%s).%s[%d] -> %s(%s).%s[%d]",
                             fromModId,
                             std::string{fromIt->second->typeId()}.c_str(),
                             fromPortId, (int)sp.valid,
                             toModId,
                             std::string{toIt->second->typeId()}.c_str(),
                             toPortId, (int)dp.valid);
            ++skipped_;
            continue;
        }

        TeensyLink::logf("  wire: %s(%s).%s/ch%u -> %s(%s).%s/ch%u",
                         fromModId,
                         std::string{fromIt->second->typeId()}.c_str(),
                         fromPortId, sp.channel,
                         toModId,
                         std::string{toIt->second->typeId()}.c_str(),
                         toPortId, dp.channel);

        FanIn* g = nullptr;
        for (auto& fi : groups)
            if (fi.dst.stream == dp.stream && fi.dst.channel == dp.channel) { g = &fi; break; }
        if (!g) { groups.push_back(FanIn{ dp, {} }); g = &groups.back(); }
        g->srcs.push_back(sp);
    }

    AudioNoInterrupts();

    for (const auto& g : groups) {
        if (g.srcs.size() == 1) {
            connect(g.srcs[0], *g.dst.stream, g.dst.channel);
            ++wired_;
            continue;
        }
        // Meer bronnen op één ingang: een verborgen mixer ervoor. Vier
        // ingangen per mixer; bij meer bronnen hangt de volgende mixer aan
        // ingang 3 van de vorige (cascade).
        const int n = static_cast<int>(g.srcs.size());
        int mixers = 0, idx = 0;
        AudioMixer4* cur = &takeMixer();
        ++mixers;
        conns_.push_back(std::make_unique<AudioConnection>(*cur, 0, *g.dst.stream, g.dst.channel));
        while (idx < n) {
            const int remaining = n - idx;
            const int take = remaining > 4 ? 3 : remaining;
            for (int ch = 0; ch < take; ++ch) connect(g.srcs[idx++], *cur, static_cast<unsigned char>(ch));
            if (idx < n) {
                AudioMixer4* next = &takeMixer();
                ++mixers;
                conns_.push_back(std::make_unique<AudioConnection>(*next, 0, *cur, 3));
                cur = next;
            }
        }
        wired_ += n;
        TeensyLink::logf("  fan-in: %d bronnen -> ch%u via %d mixer(s)", n, g.dst.channel, mixers);
    }

    AudioInterrupts();

    TeensyLink::logf("AudioGraph: wired=%d skipped=%d mixers=%d/%d",
                     wired_, skipped_, mixersUsed_, static_cast<int>(mixers_.size()));
}

}  // namespace mmb_link
