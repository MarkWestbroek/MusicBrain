

==================
>> The panel exposes voiceCount as a knob mirrored from Patch.voiceCount (read-only there; 
Me: A read-only knob is a **display**, isn't it?

>> Voice stamp: a number of modules that are patched identically. 
>> There are a number of entry points and exit points drawn. They will be either
>> - replicated if global events
>> - allocated if per voice events
>> Internally any connection drawn and any control set is replicated to all.

The modules exist in the rack.
Modules in the rack should exist n times in order to stamp a connection to or from this module n times 

NB: a global event source, eg pitch bend or cc could be connected to a stamped module too. Then the signal is connected to each voice's module. 


>> aftertouch_cv (per-voice, 0..1, optional)
Only exists in midi 2?

>> Mixer outside any stamp 1 (sums the 8 VCA outputs)
-> well, it is on the border of a stamp: inputs are inside, volume and pan should be inside too I suppose. So you can pan the voices. Don't want that always but can be fun. Volume should be the same for all, but you might want to play with it.
Then the sum is outside and only one....

Aren't the connections the things that need N ports?


C (pitch) outside any stamp 1 board, but its channels are addressed per-voice via voice-index expansion


Cv out breakout basically is a dCV-aCV portal. There need to be physically N of them if you need a poly connection from an internal module to an external. 

Other way round if you need to read an external cv port.


## visualisation
Module, like a single vco of which there are a few in the rack: mark as group. Mark the first, second etc. 

First is clear and marked master of N. Rest is greyed out and numbered 2,3...N.

Modules that are already multiple, like a quad VCO, a quad filter. Possibly will make an octal envelope. The breakout and break-in modules are 4 or 8x.

If N=8, and breakout is 4x, you need to group 2.

If breakout is 8x, and N=2, you can make two groups of it.

### use case
Choose poly out port from event source. Connect to a group master 's port (of the right type, like now).
System asks which breakout group to use in order to connect. 

Breakout master goes to module group master 
2 , 3 automatically follow. 2 to 2, 3 to 3 etc.

Same way, poly output ports must be summer in order to move back into the global domain.