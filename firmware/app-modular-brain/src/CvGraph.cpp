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
    // Ingangen die tot nu toe een kabel hadden: wie er straks geen meer heeft,
    // krijgt dat te horen (releaseVanished). De modules zelf blijven leven, ook
    // als ze uit de config verdwenen zijn (retire-pool), dus de pointers kloppen.
    std::vector<std::pair<mb::runtime::Module*, std::string>> had;
    had.reserve(routes_.size());
    for (const auto& r : routes_) had.emplace_back(r.dst, r.dstPort);

    tearDown();
    // Interne routes van de vorige patch vergeten; die van deze patch komen
    // hieronder opnieuw binnen via routeInternally().
    for (const auto& kv : instances) if (kv.second) kv.second->clearInternalRoutes();

    JsonArrayConst conns = patch["connections"].as<JsonArrayConst>();
    if (conns.isNull()) {
        TeensyLink::log("CvGraph: no connections array in patch");
        releaseVanished(had);
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

        // Kabel van een module naar zichzelf: mag hij hem zelf afhandelen, op
        // audiotempo? (Auto-wah op de sampler: env_k -> cutoff_k.)
        if (src == dst && src->routeInternally(fromPortId, toPortId)) {
            TeensyLink::logf("  cv-route intern: %s.%s -> %s", fromModId, fromPortId, toPortId);
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

    const int released = releaseVanished(had);
    TeensyLink::logf("CvGraph: routes=%d skipped=%d released=%d",
                     routedCount(), skipped_, released);
}

int CvGraph::releaseVanished(
    const std::vector<std::pair<mb::runtime::Module*, std::string>>& had)
{
    released_.clear();
    int released = 0;
    for (std::size_t i = 0; i < had.size(); ++i) {
        const auto& [dst, port] = had[i];
        // Twee kabels op dezelfde ingang: één keer melden is genoeg.
        bool seen = false;
        for (std::size_t j = 0; j < i && !seen; ++j)
            seen = (had[j].first == dst && had[j].second == port);
        if (seen) continue;
        bool still = false;
        for (const auto& r : routes_)
            if (r.dst == dst && r.dstPort == port) { still = true; break; }
        if (still) continue;
        dst->onCvDisconnected(port);
        ++released;
        bool listed = false;
        for (const auto* m : released_) if (m == dst) { listed = true; break; }
        if (!listed) released_.push_back(dst);
    }
    return released;
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
