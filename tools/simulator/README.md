# `tools/simulator` — host-side runner of `firmware/core`

Built by the firmware CMake project. After `cmake --build firmware/build`, run:

```powershell
firmware/build/simulator/mb_simulator
```

It loads a tiny in-memory `PatchBank`, feeds canned events through `NullRouter`, and prints the resulting output commands. Will grow into a scriptable test harness for application-level routers (project 1/2/3) in roadmap stages 2, 4 and 5.
