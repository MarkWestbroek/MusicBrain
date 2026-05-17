# React + Vite + TypeScript — the editor stack

## What it is
Three pieces that together make the MusicBrain editor:

- **React 18** — component library; the de facto UI standard. We use hooks, no class components.
- **Vite 5** — dev server + build tool. Uses native ES modules in dev (instant cold start, instant HMR) and Rollup for production bundles.
- **TypeScript 5.5 (strict)** — static typing across the editor; mirrors the C++ patch types in `src/api/types.ts`.

The editor lives under `editor/` and is a plain SPA: `index.html` + a bundled JS/CSS payload. No SSR, no backend, no API server.

## Why we use it
- **React + TS** is the boring, productive default for a UI like ours. Huge ecosystem, easy hiring/contribution.
- **Vite** beats Webpack/CRA for dev experience by an order of magnitude — cold reloads are milliseconds, HMR survives most edits without losing state.
- **Static output**: `vite build` produces a `dist/` folder we can serve from anywhere — GitHub Pages, the ESP32's flash, a local file via `python -m http.server`. No Node.js needed at runtime.
- **Strict TS** is set up to mirror the C++ schemas; a typo in a patch field name fails at compile time.

## What matters for MusicBrain
- `editor/src/api/types.ts` is the single source of truth for the TS view of patches; it mirrors the C++ structs under `firmware/core/include/mb/Patch/`. Keep them in sync by hand for now; consider codegen later if drift becomes painful.
- Two transports, one API surface: WebSerial (Chromium) and WebSocket (any browser, requires ESP32). Hide behind a `Transport` interface in `src/api/transport.ts`.
- **No state library yet** — `useState` + `useReducer` + props are enough for current scope. Add Zustand or Jotai only when component prop‑drilling actually hurts. Redux is overkill.
- **No CSS framework yet** — plain CSS modules. Add Tailwind only if the styling surface grows.
- Production build is `npm run build` → `editor/dist/`. Serve as static assets.

## Conventions
- `pnpm` or `npm`; pick one per developer, don't commit both lockfiles.
- All components are function components with TS prop types.
- File names: `PascalCase.tsx` for components, `camelCase.ts` for utilities.
- No `any` (`"noImplicitAny": true`); use `unknown` + narrowing at boundaries.
- ESLint with `@typescript-eslint/recommended-type-checked` + `react-hooks/recommended`.
- Prettier for formatting; CI rejects unformatted code.

## Gotchas
- Vite's dev server uses ESM; some old CommonJS‑only libraries need `optimizeDeps.include`.
- React 18 strict mode double‑invokes effects in dev. Don't make effects assume single execution; design them idempotent (matters for our connect/disconnect logic).
- TS `strict` catches a lot but **not** runtime JSON shape mismatches — validate device responses at the transport boundary (e.g. with `zod`) rather than trusting types.
- Don't put device logic in components. Transport → reducer/store → component. Keeps the UI testable without hardware.

## Links
- https://react.dev/
- https://vitejs.dev/
- https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html
