# MCU family preference – Teensy (recommended) vs. STM32 vs. RP2040 vs. ESP32. Any prior experience that should weigh in?
I know teensy already a bit, so preferred. ESP32 as a wifi and or UTP sidecar no prob, not as central brain.
I have some STM32 boards laying (this bluepill testboards) and they are very cheap. RP pico also fine, but did not use them much.

# Editor host – Python+Qt (faster to write, leverages your taste for Python) vs. TypeScript/Electron (nicer UI) vs. Web (served by an ESP32)?
I know javascript well. TS not yet, but am good in OO and like the strong typing of it. Nicer UI is also important, so rather TS above python.
I do a lot of web development too, but what kind of web-applications could be served by an esp? Are there limits?
I do use react and js on another project. Can you also expose just an API via an esp and then make the web app somewhere else? I can host web apps. For the editing interfaces that might be an option.

I made a whole UML editor / half an IDE with react in the bitemporal project (also on github and here in the git folder).

# Project 1 on‑device UI – minimal LCD or full touchscreen?
minimal LCD and link to a phone / tablet (I do not own one, but musicians, especially sound techs often do)/ PC/ laptop. See above, pref. web app. Configuration editing doesn't need to be superfast and doesn't happen during a show.

# Project 3 DAC resolution – 12 bit everywhere (cheap) or 16 bit for pitch CV (accurate intonation)?
exactly that.

# Patch storage format – JSON (debuggable) or compact binary (faster)? Recommendation: JSON in editor, binary on device, with a converter.
Yes, best of both worlds: editor uses json. If using a web app, it can be stored in a database or git to be able to have version management too.
But on the brain you will need to be fast and save memory, so binary is better there.

# Multi‑case future – will project 3 ever span more than one chassis? If yes, plan CAN‑FD/RS‑485 from the start.
Yes, very well possible with the grand setups of eurorack users. I have friends that have a whole room filled with multiple setups. They can be meters apart from each other.

Still: audio also needs to be routed and if polyphonic, you also don't want 8 five meter cables going to another case and back again (so 16 cables).

How would this CAN or RS-485 function? As a bridge? So send the signals for that case separately to another SPI port, that translates it to CAN/RS and at the case another adapter re-translates it back to SPI to internally distribute it?

# Open source / closed? – influences license choices for libraries used (e.g. PJRC libs).
I prefer open source. PJRC is open source, right?

If very specific, needed and not core, closed source could be an option, but rather avoid it.

# Stage requirements – worst‑case latency you will accept (≤ 5 ms? ≤ 1 ms?). This locks the transport choice.
I do not know so well. I would have to try. 5 ms sounds reasonable though. This is for project 3. 1 and 2 are between songs, so half a second even is acceptable.

Thinking about it: D/A will probably always go via a small microcontroller or processor anyway. Interpolation should probably be a task of that one. So you do not hear steps in for instance filter envelopes.

That is an issue of old analog but digitally controlled poly synths from the 80-ies. The digital was not so fast and not so deep (bitwise) and you could hear the steps.

That must be avoided. (Or done as as effect, but constiously :-)
