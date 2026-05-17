# scope-bridge

Small Node helper that streams the simulator's NDJSON trace over a WebSocket
so the editor's Scope panel can plot it live.

```bash
cd tools/scope-bridge
npm install
npm start
# -> scope-bridge listening on ws://localhost:8765
```

Then open the editor (`cd editor && npm run dev`) and click the **Scope** tab.

Options: `--port`, `--exe`, `--replay file.ndjson`, `--loop`. See `--help`.
