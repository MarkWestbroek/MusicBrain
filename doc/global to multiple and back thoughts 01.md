# global to multiple - and back - thoughts v01

## introduction
This document writes about how a single source (like MIDI) may lead to multiple voices in polyphonic mode.

In the polyphonic concept, each voice is equally configured, only note, duration and possibly modulation differs.

The complexity and subltety of polyphonic (hereafter poly or N in short) notes relies heavyly on the source and the protocol.

The old MIDI (MIDI 1) only supports pitch, velocity and duration per note within one channel. The concept of voice does not exist within one channel. How notes (basically note on and off events) are related cannot be defined (if they stop and start like a piano, or slide, like a guitar, violin or trombone). Control messages, like the pitch bend and modulation wheels are global: across the whole channel.

MIDI 2 adds more possibilities there.

For now, we stick to MIDI 1, but think of what MIDI 2 can, and keep it in the back of our mind.

## layers and how polyphony appears there
We discern three layers, and polyphonic-ness appears in each of them as follows:
- RACK layer: configuration of a **rack**
    - we need to indicate which (parts of) modules exist in multiplicity (N times), so voices may be "stamped" on them
    - we will define "stamp" later
    - parts of: a module may convert from single to multiple or the other way around
    - we will use the word **group** to group an N number of modules into a **multiple** module or multiple-part-of-a-module (explained later)
- PATCH layer: definition of a **patch**
    - a patch is mono or polyphonic (including the exact max number of voices N) **by nature**
    - a patch contains the MIDI-in module that converts MIDI-in to CV and gate signals
    - the MIDI-in outputs of a poly patch will have the same multiplicity (the max number of voices, N) as the patch
    - the MIDI-in may output some **poly outputs** (that exist N times, one for each voice) and some **global outputs**
- RUNTIME layer **runtime** execution
    - that is in **simulation** in the web UI
    - in real on the **brain**

## RACK layer: the configuration of racks
I will first define all terms again. To be sure everybody is on the same page.

### kinds of modules
There are a few 'kinds' of modules, that are important to discern, apart from the special cases "event source" and the breakout- and breakin-boards.
- event source: outputs mono or poly signals, based on events from outside, such as MIDI. If poly, there still may exist global signals (described above)
    - the Controller-break-in module also generates events. Like: turning a knob, pushing a button, but it could use any interface. A breath-controller, an eye-movement reader, a hand gesture interpreter, like Roli Airwave (although that probably generates MIDI too), an electromagnetic field disturbance reader like a theremin, etc. etc.
- normal modules, that however exist multiple times in the rack
- modules that contain the same function already multiple times: a dual oscillator, a quad VCO, a quad VCA etc.
    - usually these contain the controls also N times, so a quad VCO does not automatically have the same settings 4 times
    - I would probably like to create a number of N-times hardware modules, but with a single set of controls, shared across all instances, especially for this polyphonic purpose
- modules that convert a poly signal into a single signal.
    - usually that is something like an audio mixer, that takes N audio signals and mixes them with volume and pan into a stereo signal, or without volume and pan, just a plain summing mixer. Note: we might discern audio as mono or stereo. That is not the case right now.
- modules that convert a monophonic signal into a poly signal
    - not trivial, but a more complicated sequencer could for instance do that.
    - even a monophonic and polyphonic at the same time: create a baseline and a chord from the base note

### dCV and aCV
Before we go to the breakout and breakin boards, first about the CV signals inbetween them.

We have two kinds of CV's, apart from the types of CV: pitch (16 bit), control (12 bit), gate (1 bit) and trigger (1 bit):
- the digital representation of it within the brain (dCV)
- the real analog voltage in the physical rack (CV or aCV, to discern from dCV in this context)
    - the aCV has a range (0..5V, 0..12 V, etc.)

### ports
The rack configurations defines ports. A port is an input or an output and only accepts or creates one type of CV signal.
- the exception maybe being 12 bit and 16 bit CV, that can be mixed. The meaning gets a bit lost though. A gate can also be sent to a 1V/oct, but typically we do not do that.
- Note: we might need to build an "override CV-type constraint"-function in the patch configurator

When configuring a patch, we kind of skipped the break-in (BI) and breakout (BO) boards for now. I thought about that. A BI converts aCV to dCV and a BO a dCV to aCV. More that that it isn't.
- note: when we find that we haven't got sufficient bandwith on the SPI/CAN-bus, we might have to expand the tasks of the BI and (especially) the BO.
    - We already coined the idea of sending a line segment with a kind of bend.
    - we could send a (mathematical) function (of time) to perform until we say otherwise (a change or stop message)
    - on an even higher level we could even delegate more complex functions to the BO, like a VCO that responds to one or more control inputs, an envelope that responds to a gate and or one or more control messages, etc.
    - the latter would we the most efficient for the bus of course, but needs more logic on the BO. The BO becomes more of a swiss knife that a D/A converter
    - cost wise, that could be interesting enough. A teensy, a STM32, a ESP32 or even a FPGA are not that expensive. The most difficult is the standardisation of functions and control messages. But I like to do such things (model, rationalise, abstract and make concrete again, standardise a diverse palette of things in something that is coherent and logical).
- so, back to the dCV->aCV and vice versa: this basically is signal conversion, so it should maybe be placed **on the connection**
- we are still in the rack-configuration section, so here, we only want to register the available BI and BO boards

### event source
An event source is a component that converts any event in the outside world into something we can use in 'our world', so basically to CV. The most used being the MIDI-in, we will implement ourselves.

The MIDI-in also has a simulation counterpart, but the base is the implementation we will make in the brain. The simulation mimics it's behaviour (hopefully perfectly).

Some outside events produce polyphonic music, like a keyboard (normal MIDI keyboards produce MIDI 1 and I own an Expressive E Osmose and Roli keyboard. Both produce MIDI 2 data if I wish).

Important notion of an event source is that it can output both global events and voice events.
- global events are voice-unrelated. It is almost always used to manipulate the voice or voices though, but cannot descern between them, if there are more than one.
- voice events are voice-related. Basic things are pitch (note), start/stop and velocity information in MIDI 1. There is more possible in MIDI 2 (control, aftertouch, pitch bend per note etc.).

Again: if a patch is monophonic, an event source must be set to output monophonic events. If poly, the number of voices N of the event source must be N or less (may be monophonic as well). In the rack, these rules are not yet applicable. Only the possibilities are configured.
- an eventy source can be specifically monophonic, polyphonic or able to do both.
- it can be specifically (e.g.) 6 voice or 4 or flexible.

### grouping of (parts of) modules of the samen kind
The most interesting part of this layer, is to configure which modules or parts of module count as a 'per voice' item. And to configure how many of them are there in the rack. (They must live in **one rack**, to divide them across racks seems too tedious for now.)

#### multi-modules
Important for below use case is to be able to configure which part of a module is a single function and how many times this occors and which  part is global for that module, so applies to all single functions.
- e.g. a dual osc can be just two oscillators in one box (although usually a kind of crosslink function exists, but if we leave that out for the poly configuration of a module, it is just two the same osc's)
- e.g. a quad VCO. Same story: they can probably be linked, but if set as separate, they can be viewed as 4 independent VCO's.
- etc.

A BI an BO are also typical (partly multi-modules).
Same for the input part of a mixer.

#### configuration
I envision the following use case for **creating a poly group of modules** 
- the user clicks on a module and sets it as **master** module for polyphony
- the system shows a **master** label on it (topright corner or so)
- the user clicks on a second module of the same kind
- the system marks it as number **2** and shows it slightly greyed out
- and so forth until number **N**

Use case for **creating a group of poly-functions** is the same with difference that not a whole module, but a coherent part is selected as first master, then the rest as 2...N.
- so 4 dual osc's will show one half of the first clear and master, the rest greyed out and 2..8.
- a BO box of 8 12 bit CV's will show one dCV and one aCV clear and master, and the other 7x2 sockets greyed and 2..8.
- etc.


## PATCH layer: here patches are defined

### Introduction
- a patch is mono or polyphonic (including the exact max number of voices N) **by nature**
- a patch must contain an event source (like the MIDI-in module that converts MIDI-in to CV and gate signals)
    - it may also contain more than one source, for example: a hand gesture source
- the MIDI-in outputs of a poly patch will have the same multiplicity (the max number of voices, N) as the patch (if it has voice data)
- any MIDI-in may output some **poly outputs** (that exist N times, one for each voice) and some **global outputs**

The global output ports are not so interesting in this polyphony discussion, but it is good to keep in mind that they are there, in parallel to the N-voice outputs.

### polyphonic outputs
My basic notion here is that a poly output is different from a mono or global output, in that it is repeated N times. If there are multiple kinds of voice outputs, e.g. note, velocity, gate, then they are all repeated for each voice.

For a poly patch, we configured groups on purpose: the master is the one you patch to, first from the poly output of the event source, then probably from a from a poly audio output to another master's audio input, etc.

The idea: you patch only one voice and the system knows the rest.

Important note:
- the polyphonicness (or polyphonicity?) is in the connection! A master VCO module may have, for instance a v/oct pitch input and a CV PWM input. If you patch the poly voice output to the v/oct, it will be **'voice-replicated'** across the N voices in the group ('under water', effectuated in runtime), where the pitch input module number X is connected to voice number X's pitch output
- but: if you patch a global output of the event source to the PWM port, it will be simply **duplicated** to all modules in the group: the event source's CV (e.g. de mod wheel) will have the same effect on all voices' PWM

### mixing back to stereo
Typically, but not necessairily, you will want to mix the voices back to a stereo signal. The, for example, an 8-2-mixer has **one** poly audio input (N=8) configured, (and 7 greyed out ones) and one stereo audio output (**not configured as poly**).

For example the N-VCA module's audio output goes to the poly audio input of the mixer. Meaning that VCA 1 out goes to mixer input 1, VCA 2 out to mixer input 2, etc.
Mixer output L + R (or the stereo output as a whole) goes to a global reverb or so and then to master out.


## RUNTIME layer
That is the realtime execution of events, connections (dCV to aCV) and software modules.

We do that in the brain and in **simulation** in the web UI (mimicking the brain and real hardware modules).

The brain gets information about the active patch and:
A either expands it itself
B or gets it already expanded

In case A it must have a notion about polyphony (which is does, as it runs the MIDI-in itself, for instance), and in case B it doesn't need it for the rest of the modules. It just 'sees' a graph of connections, which it executes.

### runtime display
If we will expand the brain with some runtime visual display (a view on the events and probably - in a simple way - on the chosen patch as well), it would be good to keep the original compact poly (master + 2...N) data as it is, instead of expanding it already before it goes to the brain.

The visual information about a patch (which cables to patch) can be much and probably really needs a full computer screen anyway, but the more symbolic view could fit on a somewhat bigger touchscreen or so.

### use case
A use case for **patching a poly patch** (in the web UI) could be like this.
- user chooses poly out port from event source and connects it to a **physical module group** master's port (of the right type, like now: CV to CV, gate to gate, audio to audio).
    - *E.g. voice pitch to OSC V/oct.*
- System asks which breakout group to use in order to connect
    - this is because we cross the dCV - aCV barrier here, so 'conversion' is needed
- user chooses the 2*4-CV16-BO group (2 modules of 4*16bit CV's grouped as a group of 8 dCV-aCV converters) and the master's dCV in port
- system draws connection
- user may patch the audio out of the OSC group to another physical module group's master's audio in port
- and so forth
- if CV needs to go back to the brain, it must go via a a-CV-dCV Break-In board
- apart from poly signals, global signals may be connected to.
    - If connected to a master they will be *duplicated* across the voices.












