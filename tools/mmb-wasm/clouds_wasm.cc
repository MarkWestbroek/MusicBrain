// tp_mmb_clouds — Mutable Instruments Clouds (spiegel van CloudsModule.h).
// Native 32 kHz, blokken van 32, stereo in/uit.
#include "mmb_abi.h"
#include "clouds/dsp/granular_processor.h"

const char* const MMB_TYPE_ID     = "tp_mmb_clouds";
const float       MMB_NATIVE_RATE = 32000.0f;
const int         MMB_BLOCK       = static_cast<int>(clouds::kMaxBlockSize);

enum { IN_L, IN_R, IN_FREEZE, IN_TRIG, IN_POSITION, IN_SIZE, IN_PITCH, IN_DENSITY, IN_TEXTURE, IN_MIX };
MmbPort MMB_INPUTS[] = {
    { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} },
    { "freeze", MMB_GATE, 0, {} }, { "trig", MMB_GATE, 0, {} },
    { "position_cv", MMB_CV, 0, {} }, { "size_cv", MMB_CV, 0, {} }, { "pitch_cv", MMB_CV, 0, {} },
    { "density_cv", MMB_CV, 0, {} }, { "texture_cv", MMB_CV, 0, {} }, { "mix_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 10;
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_POSITION, C_SIZE, C_PITCH, C_DENSITY, C_TEXTURE, C_MIX, C_SPREAD, C_FEEDBACK, C_REVERB, C_FREEZE, C_MODE, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "position", 0.5f }, { "size", 0.5f }, { "pitch", 0.f }, { "density", 0.5f }, { "texture", 0.5f },
    { "mix", 0.5f }, { "spread", 0.3f }, { "feedback", 0.3f }, { "reverb", 0.3f }, { "freeze", 0.f },
    { "mode", 0.f }, { "level", 1.f },
};
const int MMB_NUM_CONTROLS = 12;

namespace {
constexpr size_t kLarge = 118784, kSmall = 65536 - 128;
uint8_t g_large[kLarge];
uint8_t g_small[kSmall];
clouds::GranularProcessor g_proc;
clouds::ShortFrame g_in[clouds::kMaxBlockSize], g_out[clouds::kMaxBlockSize];
float g_level = 1.f;
bool  g_trigPrev = false, g_trigPending = false;
float g_knobPos = 0.5f, g_knobSize = 0.5f, g_knobPitch = 0.f, g_knobDens = 0.5f, g_knobTex = 0.5f, g_knobMix = 0.5f;
bool  g_freezeKnob = false;
}

void mmb_setup() {
    g_proc.Init(g_large, kLarge, g_small, kSmall);
    g_proc.set_num_channels(2);
    g_proc.set_low_fidelity(false);
    g_proc.set_playback_mode(clouds::PLAYBACK_MODE_GRANULAR);
    clouds::Parameters* p = g_proc.mutable_parameters();
    p->position = 0.5f; p->size = 0.5f; p->pitch = 0.f; p->density = 0.5f; p->texture = 0.5f;
    p->dry_wet = 0.5f; p->stereo_spread = 0.3f; p->feedback = 0.3f; p->reverb = 0.3f;
    p->freeze = false; p->trigger = false; p->gate = false;
}

void mmb_on_control(int idx, float v) {
    clouds::Parameters* p = g_proc.mutable_parameters();
    switch (idx) {
        case C_POSITION: g_knobPos = mmb_clamp01(v); break;
        case C_SIZE:     g_knobSize = mmb_clamp01(v); break;
        case C_PITCH:    g_knobPitch = v; break;
        case C_DENSITY:  g_knobDens = mmb_clamp01(v); break;
        case C_TEXTURE:  g_knobTex = mmb_clamp01(v); break;
        case C_MIX:      g_knobMix = mmb_clamp01(v); break;
        case C_SPREAD:   p->stereo_spread = mmb_clamp01(v); break;
        case C_FEEDBACK: p->feedback = mmb_clamp01(v); break;
        case C_REVERB:   p->reverb = mmb_clamp01(v); break;
        case C_FREEZE:   g_freezeKnob = v >= 0.5f; break;
        case C_MODE: {
            int m = static_cast<int>(v); if (m < 0) m = 0;
            if (m >= clouds::PLAYBACK_MODE_LAST) m = clouds::PLAYBACK_MODE_LAST - 1;
            g_proc.set_playback_mode(static_cast<clouds::PlaybackMode>(m));
            break;
        }
        case C_LEVEL:    g_level = mmb_clamp01(v); break;
    }
}

void mmb_process(int frames) {
    clouds::Parameters* p = g_proc.mutable_parameters();
    p->position = mmb_connected(IN_POSITION) ? mmb_clamp01(mmb_in0(IN_POSITION)) : g_knobPos;
    p->size     = mmb_connected(IN_SIZE)     ? mmb_clamp01(mmb_in0(IN_SIZE))     : g_knobSize;
    p->pitch    = mmb_connected(IN_PITCH)    ? mmb_in0(IN_PITCH) * 12.0f          : g_knobPitch;
    p->density  = mmb_connected(IN_DENSITY)  ? mmb_clamp01(mmb_in0(IN_DENSITY))  : g_knobDens;
    p->texture  = mmb_connected(IN_TEXTURE)  ? mmb_clamp01(mmb_in0(IN_TEXTURE))  : g_knobTex;
    p->dry_wet  = mmb_connected(IN_MIX)      ? mmb_clamp01(mmb_in0(IN_MIX))      : g_knobMix;
    p->freeze   = g_freezeKnob || (mmb_connected(IN_FREEZE) && mmb_gate_in(IN_FREEZE));
    const bool trigHigh = mmb_gate_in(IN_TRIG);
    if (trigHigh && !g_trigPrev) g_trigPending = true;
    g_trigPrev = trigHigh;
    p->trigger = g_trigPending;
    g_trigPending = false;

    const bool hasR = mmb_connected(IN_R);
    for (int k = 0; k < frames; ++k) {
        float l = MMB_INPUTS[IN_L].buf[k], r = hasR ? MMB_INPUTS[IN_R].buf[k] : l;
        if (l > 1.f) l = 1.f; else if (l < -1.f) l = -1.f;
        if (r > 1.f) r = 1.f; else if (r < -1.f) r = -1.f;
        g_in[k].l = static_cast<int16_t>(l * 32767.f);
        g_in[k].r = static_cast<int16_t>(r * 32767.f);
    }
    g_proc.Prepare();
    g_proc.Process(g_in, g_out, static_cast<size_t>(frames));
    for (int k = 0; k < frames; ++k) {
        MMB_OUTPUTS[0].buf[k] = g_out[k].l * (1.f / 32768.f) * g_level;
        MMB_OUTPUTS[1].buf[k] = g_out[k].r * (1.f / 32768.f) * g_level;
    }
}
