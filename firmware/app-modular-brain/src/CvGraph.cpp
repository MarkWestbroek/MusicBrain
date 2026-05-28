// CvGraph.cpp — discovery + bridge for CV-domain patch connections.
// See CvGraph.h for design notes.

#include "CvGraph.h"
#include "TeensyLink.h"
#include <cmath>

namespace mmb_link {

using PortKind = mb::runtime::Module::PortKind;

static const char* kindName(PortKind k) {
    switch (k) {
        case PortKind::Audio: return "audio";
        case PortKind::Cv:    return "cv";
        case PortKind::Gate:  return "gate";
        default:              return "none";
    }
}

void CvGraph::tearDown() {
    routes_.clear();
    skipped_ = 0;
    mb::runtime::CvBus::global().clear();
}

void CvGraph::build(
    JsonObjectConst patch,
    const std::unordered_map<std::string,
                             std::unique_ptr<mb::runtime::Module>>& instances)
{
    tearDown();

    JsonArrayConst conns = patch["connections"].as<JsonArrayConst>();
    if (conns.isNull()) {
        TeensyLink::log("CvGraph: no connections array in patch");
        return;
    }

    for (JsonObjectConst c : conns) {
        const char* fromModId  = c["from"]["moduleId"] | "";
        const char* fromPortId = c["from"]["portId"]   | "";
        const char* toModId    = c["to"]["moduleId"]   | "";
        const char* toPortId   = c["to"]["portId"]     | "";

        auto fromIt = instances.find(std::string{fromModId});
        auto toIt   = instances.find(std::string{toModId});
        if (fromIt == instances.end() || toIt == instances.end()) {
            ++skipped_;
            continue;
        }

        auto* src = fromIt->second.get();
        auto* dst = toIt  ->second.get();

        const PortKind srcKind = src->outputPortKind(fromPortId);
        const PortKind dstKind = dst->inputPortKind (toPortId);

        // Pure audio: belongs to AudioGraph, not us.
        if (srcKind == PortKind::Audio && dstKind == PortKind::Audio) continue;

        // CV / Gate domain on both sides — accept (Cv↔Cv, Gate↔Gate,
        // Cv↔Gate are all allowed; the consumer interprets the value).
        const bool srcIsCv = (srcKind == PortKind::Cv || srcKind == PortKind::Gate);
        const bool dstIsCv = (dstKind == PortKind::Cv || dstKind == PortKind::Gate);
        if (!srcIsCv || !dstIsCv) {
            TeensyLink::logf("  skip(kind): %s.%s[%s] -> %s.%s[%s]",
                             fromModId, fromPortId, kindName(srcKind),
                             toModId,   toPortId,   kindName(dstKind));
            ++skipped_;
            continue;
        }

        // Pre-register bus slot for this source port so the (future) ISR
        // can publish without resizing the map.
        const auto key = mb::runtime::CvBus::makeKey(fromModId, fromPortId);
        mb::runtime::CvBus::global().slot(key);

        routes_.push_back(Route{
            src, std::string{fromPortId},
            dst, std::string{toPortId},
            0.0f, false
        });

        TeensyLink::logf("  cv-route: %s.%s[%s] -> %s.%s[%s]",
                         fromModId, fromPortId, kindName(srcKind),
                         toModId,   toPortId,   kindName(dstKind));
    }

    TeensyLink::logf("CvGraph: routes=%d skipped=%d", routedCount(), skipped_);
}

void CvGraph::tickBridge() {
    for (auto& r : routes_) {
        const float v = r.src->readCvPort(r.srcPort);
        if (!r.primed || v != r.lastValue) {
            r.dst->writeCvPort(r.dstPort, v);
            r.lastValue = v;
            r.primed = true;
        }
    }
}

}  // namespace mmb_link
