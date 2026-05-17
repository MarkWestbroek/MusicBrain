# Project 2 — Amp / speaker switcher

See [doc/Requirements.md §2](../../doc/Requirements.md) and [doc/Plan.md §3](../../doc/Plan.md).

Same firmware base as project 1 with a different relay driver and a different patch schema. **Safety validator** is mandatory:

- never leave a (tube) power amp without a load when switching;
- never connect two amps to the same speaker;
- always insert a short mute window during switching.

## Patch schema
```
AmpPatch {
  preampIn -> preampOut routing
  powerAmp -> speaker mapping (strict 1:1)
  muteMs   // short audio mute window during the switch
}
```

To be implemented in roadmap stage 4.
