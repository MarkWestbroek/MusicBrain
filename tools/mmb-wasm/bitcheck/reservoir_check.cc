// Invariantentest voor de reservoir-kern: de bron blijft in 0..1, leegloop
// bij Drain 1 en één volle stem duurt 1 s, herstel volgt de tijdconstante,
// het aanbod is monotoon in de bron, de empty-gate heeft hysterese en de
// uitgang per stem is belasting maal aanbod.
#include "mmb_dsp/reservoir.h"
#include <cassert>
#include <cmath>
#include <cstdio>

int main() {
    using Reservoir = mmb_dsp::Reservoir;
    static_assert(sizeof(Reservoir) < 128, "Reservoir must stay a tiny control-rate kernel");
    Reservoir reservoir;
    reservoir.Init(1000);
    reservoir.setControl(Reservoir::Drain, 1);
    reservoir.setControl(Reservoir::Recover, 20);  // bijna geen herstel tijdens de leegloop
    reservoir.setControl(Reservoir::Floor, 0);
    reservoir.setLoad(0, 1);
    int ticks = 0;
    while (reservoir.level() > 0.05f && ticks < 5000) { reservoir.tick(false); ++ticks; }
    assert(ticks > 900 && ticks < 1100);
    for (int tick = 0; tick < 5000; ++tick) {
        reservoir.tick(false);
        assert(reservoir.level() >= 0 && reservoir.level() <= 1);
        assert(reservoir.output(0) >= 0 && reservoir.output(0) <= 1);
    }
    assert(reservoir.empty());
    assert(std::fabs(reservoir.output(0) - reservoir.supply()) < 1e-6f);

    // Herstel: na één tijdconstante zonder belasting ~63 % van het tekort ingelopen.
    reservoir.setLoad(0, 0);
    reservoir.setControl(Reservoir::Recover, 2);
    const float start = reservoir.level();
    for (int tick = 0; tick < 2000; ++tick) reservoir.tick(false);
    const float expected = start + (1 - start) * (1 - std::exp(-1.0f));
    assert(std::fabs(reservoir.level() - expected) < 0.02f);
    assert(!reservoir.empty());

    // Aanbod monotoon in de bron, met vloer en curve.
    reservoir.setControl(Reservoir::Floor, 0.2f);
    reservoir.setControl(Reservoir::Curve, 2);
    reservoir.setLoad(0, 1);
    float previousSupply = 2;
    for (int tick = 0; tick < 3000; ++tick) {
        reservoir.tick(false);
        assert(reservoir.supply() <= previousSupply + 1e-6f && reservoir.supply() >= 0.2f - 1e-6f);
        previousSupply = reservoir.supply();
    }
    // Vier stemmen delen de bron: samen trekken ze sneller leeg dan één.
    Reservoir single, quartet;
    single.Init(1000); quartet.Init(1000);
    single.setLoad(0, 0.5f);
    for (int voice = 0; voice < 4; ++voice) quartet.setLoad(voice, 0.5f);
    for (int tick = 0; tick < 500; ++tick) { single.tick(false); quartet.tick(false); }
    assert(quartet.level() < single.level());
    assert(std::fabs(quartet.output(1) - 0.5f * quartet.supply()) < 1e-6f);

    // Reset: direct vol; ongeldige invoer wordt begrensd.
    quartet.setLoad(0, NAN); quartet.setRefill(INFINITY);
    quartet.tick(true);
    assert(quartet.level() == 1 && !quartet.empty());
    quartet.tick(false);
    assert(std::isfinite(quartet.level()) && quartet.level() <= 1);
    std::printf("PASS: drain timing, bounds, recovery constant, monotone supply, shared source, reset; kernel %zu bytes\n", sizeof(Reservoir));
}
