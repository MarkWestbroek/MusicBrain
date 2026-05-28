// AudioGraph.cpp — dynamic audio graph builder.
// See AudioGraph.h for design notes.

#include "AudioGraph.h"
#include "TeensyLink.h"

namespace mmb_link {

void AudioGraph::tearDown() {
    AudioNoInterrupts();
    conns_.clear();   // dtors deregister AudioConnections from the audio system
    AudioInterrupts();
    wired_   = 0;
    skipped_ = 0;
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

    AudioNoInterrupts();

    for (JsonObjectConst c : conns) {
        const char* fromModId  = c["from"]["moduleId"] | "";
        const char* fromPortId = c["from"]["portId"]   | "";
        const char* toModId    = c["to"]["moduleId"]   | "";
        const char* toPortId   = c["to"]["portId"]     | "";

        // Look up both module instances
        auto fromIt = instances.find(std::string{fromModId});
        auto toIt   = instances.find(std::string{toModId});
        if (fromIt == instances.end() || toIt == instances.end()) {
            ++skipped_;
            continue;
        }

        // Both must be AudioPortModules (dynamic_cast unavailable; use virtual tag)
        auto* src = AudioPortModule::from(fromIt->second.get());
        auto* dst = AudioPortModule::from(toIt->second.get());
        if (!src || !dst) {
            ++skipped_;
            continue;
        }

        // Resolve named ports to stream + channel
        AudioPort sp = src->outputPort(fromPortId);
        AudioPort dp = dst->inputPort(toPortId);
        if (!sp || !dp) {
            ++skipped_;
            continue;
        }

        // Create and own the AudioConnection
        conns_.push_back(
            std::make_unique<AudioConnection>(
                *sp.stream, sp.channel,
                *dp.stream, dp.channel));
        ++wired_;
    }

    AudioInterrupts();

    TeensyLink::logf("AudioGraph: wired=%d skipped=%d", wired_, skipped_);
}

}  // namespace mmb_link
