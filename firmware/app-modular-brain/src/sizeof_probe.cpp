#include "mb/runtime/MidiIn.h"

template<int N> struct ShowSize;

// Exact sizes extracted from compiler errors (teensy41 target):
// ShowSize<sizeof(mb::runtime::MidiInModule)> _midiIn;  // 384
// ShowSize<sizeof(mb::VoiceAllocator)>        _alloc;  // 140
ShowSize<384> _midiIn;
ShowSize<140> _alloc;
