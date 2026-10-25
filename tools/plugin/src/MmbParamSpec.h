#pragma once
// Beschrijving van een plugin-parameter en een module, zoals
// editor/scripts/pluginParams.ts die uit het paneel genereert
// (generated/<typeId>_params.h). Ids zijn de control-ids van het paneel, dus
// ook de namen van de relays in de webview (editor/src/plugin-ui).

namespace mmb_plugin {

enum class ParamKind { Float, Choice, Bool };

struct ParamSpec {
    const char* id;
    const char* name;
    ParamKind kind;
    float min, max, def;
    float interval;     // stap (0 = continu); bij Choice/Bool 1
    float skewMid;      // > 0: de waarde in het midden van de knop (log-taper)
    const char* choices;   // Choice: standen gescheiden door '|'
    const char* unit;
};

/** Fabriekspreset: waarden op parameter-id (keuze als index, aan/uit als 0/1). */
struct PresetValue { const char* id; float value; };
struct PresetSpec { const char* name; const PresetValue* values; int count; };

struct ModuleSpec {
    const char* typeId;
    const char* name;
    int hp;
    const ParamSpec* params;
    int count;
    const PresetSpec* presets = nullptr;   // editor/src/modular-mb/modulePresets.ts
    int presetCount = 0;
};

}  // namespace mmb_plugin
