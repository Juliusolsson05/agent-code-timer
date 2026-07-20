# agent-code-timer

A focus timer extension for [Agent Code](https://github.com/Juliusolsson05/agent-code).
Interval reminders, black-and-white by default, **and it keeps running when you
close the window** — which is the entire point.

## Install

Agent Code → Settings → Extensions → paste:

```
Juliusolsson05/agent-code-timer
```

Then `Open Timer` from the command palette.

## What it does

- Duration presets (15 / 25 / 30 / 45 / 60 / 90 / 120 min) plus a custom field
- **Interval reminders** — "Stand up and stretch" every 30 minutes. A reminder
  pauses the session, plays a repeating tri-tone, and holds until dismissed. The
  break does not count against your focus time.
- A wall clock in the corner; click to dim it
- Black and white by default, with a one-click toggle to inherit the Agent Code
  theme

## Why the timer survives closing the window

This is the design decision the whole extension is built around.

A focus timer whose lifetime is tied to a visible window is not a focus timer —
you start a 45-minute session and then *close the window to go and work*. So:

- `activate()` runs on `onStartupFinished` and constructs a **headless
  `TimerEngine`** that owns all state and all timing.
- The **view is a subscriber**. Mounting attaches it, closing detaches it, and
  the engine never notices either.
- State persists as a **wall-clock deadline**, not a countdown — so a session
  survives an app restart, and if the deadline passed while Agent Code was shut,
  it correctly reports finished rather than resuming a stale number.

The same property handles machine sleep and Chromium's background-renderer
throttling for free: every tick recomputes from `Date.now()`, so a late tick
self-corrects instead of accumulating drift.

## Layout

```
src/
  index.ts              activate() / deactivate()
  engine/               headless — outlives every view
    TimerEngine.ts      deadline-based, emits state
    types.ts
    alert.ts            AudioContext tri-tone
  view/                 disposable — a window onto the engine
    mount.tsx           ViewMount: (element) => cleanup
    TimerView.tsx
    components/
  theme/
    tokens.css          black & white defaults
    inherit.ts          --theme-* → --tm-* when toggled
    injectStyles.ts
  host/                 resolves react to Agent Code's instance
```

### `dist/` is committed on purpose

Agent Code's installer downloads the repository **source tarball**, not a release
asset, so the built entry named in `agent-code.extension.json` has to exist in
the repo. A `dist/` that only existed in CI would make every install fail with
"manifest points at a file that does not exist".

### React comes from the host

`vite.config.ts` aliases `react`, `react/jsx-runtime` and `react-dom/client` to
shims in `src/host/` that read `globalThis.__agentCodeHost`. Bundling a second
React would mean two reconcilers and "invalid hook call" on every hook.

Marking react `external` instead would leave a bare specifier the browser cannot
resolve without a host-declared import map — aliasing resolves it at *this*
build's time and needs nothing from the host beyond the global.

## Development

```bash
npm install
npm run build     # vite build + tsc --noEmit
npm run dev       # rebuild on change
```

After building, commit `dist/` and tag a release. Agent Code prefers the latest
release tag and falls back to the default branch.

## Credit

Ported from [focus-flow-timer](https://github.com/Juliusolsson05/focus-flow-timer),
which was a standalone Vite/React/shadcn app. The timing logic — deadline-based,
sleep-resilient — is carried over intact; it took five commits to get right there
and did not need rediscovering. The reminder scheduling was rewritten: the
original tested `elapsed % interval === 0`, which silently drops a reminder
whenever a tick is delayed past the exact second. This version records which
interval ordinals have fired, so a late tick still fires the one it missed,
exactly once.

## License

MIT
