#include "mb/runtime/MidiIn.h"

template<int N> struct ShowSize;

// Exact sizes extracted from compiler errors (teensy41 target):
//   sizeof(mb::runtime::MidiInModule) = 384
//   sizeof(mb::VoiceAllocator)        = 140
//
// To re-measure: uncomment the probe lines below and read the numbers out of
// the resulting "incomplete type ShowSize<N>" compile errors. Keep them
// commented out afterwards — an active probe breaks the build by design.
// ShowSize<sizeof(mb::runtime::MidiInModule)> _midiIn;
// ShowSize<sizeof(mb::VoiceAllocator)>        _alloc;
