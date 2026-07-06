# MusicBrain — Website copy (EN)

> Draft copy for the brand/product website. English-first (international
> market); NL versions can be derived later. Product names follow the
> proposal in [brand-positioning-plan.md](brand-positioning-plan.md) §2.2 —
> swap if naming decision changes. Everything marked `[status]` must stay
> honest about the pre-1.0 state.

---

## Home

### Hero
**The open brain for your analog rig.**

MusicBrain gives pedalboards, amp racks and modular synths what they never
had: memory. Save every patch, every routing, every setting — and recall it
in milliseconds. Fully open source. Your sound stays 100% analog.

[Explore the family] [Try the simulator — no hardware needed]

### The problem (three tiles)
- **Pedalboards** — Tap-dancing across a floor of pedals, tone lost in a
  chain of buffers and cables.
- **Amp racks** — Re-plugging amps and cabs for every session, with pops and
  downtime.
- **Modular synths** — The best sound you'll ever make is one you can never
  recall. And polyphony? Practically impossible.

### The idea
**One brain, three bodies.** MusicBrain is a single open platform — one
firmware core, one browser editor — driving three very different machines.
What they share: relays and CV instead of digital audio, so your signal path
stays pure. What you gain: programs, patches, presets — for gear that never
had them.

### Product family (cards → product pages)
- **Cortex** — polyphonic brain for modular synths
- **Reflex** — silent programmable pedal switcher
- **Relay** — amp & speaker switching matrix
- **Synapse** — CV/gate breakout modules
- **Editor** — free browser-based patch editor & scope

### Open source banner
**MIT-licensed, top to bottom.** Firmware, editor, schematics, protocols.
Your rig will never be orphaned. → github.com/…

### Status strip `[status]`
MusicBrain is in active development (firmware 0.5, working prototypes).
Follow the build: [Releases] [Newsletter] [Discord]

---

## Product page — Cortex

**Cortex. Total recall for your modular.**

Your modular synth is analog, alive — and amnesiac. Cortex is the brain that
remembers. It routes MIDI and CV, allocates up to 16 voices across your
oscillators, and stores every patch for instant recall. Your audio never
touches a converter: Cortex speaks only CV and gate.

**How it works.** Cortex (a Teensy 4.1-based controller) connects to Synapse
breakout modules over a fast digital bus. Breakouts translate to and from
analog: 16-bit pitch CV (your octaves stay in tune), gates, triggers,
modulation. Patch it once, name it, save it. Load it back tomorrow — or
mid-set.

**Polyphony, finally.** Play a chord on a MIDI keyboard; Cortex spreads the
voices across your VCO/VCF/VCA groups with smart voice-stealing and
last-note priority. A polysynth built from *your* modules.

**Key specs**
- ≤ 5 ms note-on → CV settle
- 16-bit pitch CV (1V/oct), 12-bit modulation CV
- Up to 16 voices; multi-case via CAN-FD bus (Axon)
- Oscillator auto-tune & calibration `[roadmap]`
- Built-in digital modules: oscillators, filters (incl. MS-20-style),
  physical modelling, effects — plus ports of open-source classics
- Browser editor with live scope; patches as open JSON
- Open source: MIT firmware, documented protocols, module SDK

`[status]` In development — firmware 0.5.x running on hardware. Join the
beta list.

---

## Product page — Reflex

**Reflex. One tap. Your whole board changes.**

Reflex puts your pedals in true-bypass loops switched by relays. Build
programs — verse, chorus, solo — and switch your entire board with one tap,
silently, with the shortest possible signal path. No more tap-dancing, no
more tone-sucking daisy chains.

**Set up from your phone.** Reflex has WiFi built in: open the editor in any
browser, name your pedals, drag them into programs, done. On stage it's all
hardware: footswitch, MIDI program change, and a display readable in
darkness and stage lights alike.

**Key specs**
- 8–16 true-bypass relay loops
- MIDI program change in/out; footswitch up/down
- WiFi + browser editor (no app to install), USB-C
- Programs stored on the device — works without any computer
- Open source firmware & schematics (MIT)

`[status]` Working prototype (ESP32 & RP2040). Beta list open.

---

## Product page — Relay

**Relay. Every amp, every cab, one click.**

For studios and collectors: route any pre-amp to any power amp to any
speaker cabinet — pure relay switching, nothing active in your signal path,
safe sequencing so nothing pops or runs unloaded. Recall full setups from
your desk.

`[status]` In design. Register interest.

---

## Product page — Synapse & Axon

**Synapse. Where digital meets analog.**

Eurorack-format breakouts that give Cortex hands: CV out (16-bit pitch /
12-bit mod), CV in, gates and triggers. Axon links multiple cases into one
instrument over CAN-FD. Open hardware — build your own or buy assembled
`[roadmap]`.

---

## Page — Editor & Simulator

**See your patch. Before you even own the hardware.**

The MusicBrain Editor runs in your browser — nothing to install. Drag
modules onto the rack, wire CV and audio, turn a knob and hear the change
live over USB or WiFi. The built-in scope shows every CV and gate as it
happens.

No hardware yet? Run the **simulator**: the exact same firmware core,
compiled for your computer, playing patches into a virtual scope. Kick the
tires, design your dream rig, then build it.

[Open the editor] [Download the simulator]

---

## Page — Why open source?

**Gear you can trust is gear you can read.**

Everything — firmware, editor, schematics, wire protocols — is MIT-licensed
on GitHub. That means: no vendor lock-in, no orphaned hardware when a
company folds, and a platform you can extend. Write your own module, port a
classic, fix your own bug at 2 a.m. The MI ports (Rings, Plaits) exist
because the platform is open; yours could be next.

For developers: C++17 core that compiles on your laptop, 50+ unit tests, a
host simulator, documented JSON-RPC / CBOR / SPI-frame protocols, and ADRs
explaining every major decision.

---

## Page — About / Who we are

**Built in the Netherlands, in the open.**

MusicBrain started the way most good gear does: a musician-engineer with a
problem. Years of pedalboards, amps and a growing modular system — and no
way to save any of it. The answer became a platform: one brain for all of
it, open source so it outlives any one maker.

I'm Mark — engineer, guitarist, synthesist. MusicBrain is developed in the
open; every design decision is documented, every release is public. Come
build it with me.

[GitHub] [Discord] [Newsletter] [Contact]

---

## Page — Support
- Getting started guides per product
- FAQ (latency, calibration, licensing, "will this color my tone?" → no,
  and here's why)
- Firmware updates & downloads
- Community forum / Discord for help
- Contact form for everything else

## Page — Releases / News
Feed of release notes (sourced from the repo's release log) and devlog
posts. Each entry: version, date, highlights in plain language, full
changelog link.

## Footer
Products · Editor · Downloads · Docs · Community · Dealers `[later]` ·
About · Contact · Privacy · Press kit
