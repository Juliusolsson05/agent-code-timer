# agent-code-timer

A focus timer extension for [Agent Code](https://github.com/Juliusolsson05/agent-code).
Interval reminders, black-and-white by default, **and it keeps running when you
close the panel** — which is the entire point.

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

A focus timer whose lifetime is tied to a visible panel is not a focus timer —
you start a 45-minute session and then *close the panel to go and work*. So:

- The API v2 runtime activates on `onStartupFinished` and constructs one
  **headless `TimerEngine`** that owns all state and timing.
- The independently built **view is a subscriber**. Mounting attaches it through
  published JSON state, closing detaches it, and the engine never notices either.
- State persists as a **wall-clock deadline**, not a countdown — so a session
  survives an app restart, and if the deadline passed while Agent Code was shut,
  it correctly reports finished rather than resuming a stale number.

The same property handles machine sleep and Chromium's background-renderer
throttling for free: every tick recomputes from `Date.now()`, so a late tick
self-corrects instead of accumulating drift.

## Layout

```
src/
  runtime.ts            background activation, commands, persistence, notifications
  view.ts               API v2 view entry
  engine/               headless — outlives every view
    TimerEngine.ts      deadline-based, emits state
    types.ts
    alert.ts            view-owned AudioContext tri-tone
  view/                 disposable — a window onto the engine
    mount.tsx           ViewMount: (element, context) => cleanup
    TimerView.tsx
    components/
  theme/
    tokens.css          black & white defaults
    inherit.ts          --theme-* → --tm-* when toggled
    injectStyles.ts
```

Built with the `agent-code-extension-api` SDK: `defineRuntime`, `defineView`, and
the multi-entry Vite preset. There is no `host/` shim directory anymore.

### `dist/` is committed on purpose

Agent Code's installer downloads the repository **source tarball**, not a release
asset, so the built entry named in `agent-code.extension.json` has to exist in
the repo. A `dist/` that only existed in CI would make every install fail with
"manifest points at a file that does not exist".

### The extension bundles its own React

An extension runs in its **own sandboxed iframe** at its own origin — it cannot
reach the host's `window`, DOM, or React. So it bundles React normally, like any
web app. The old host-React shims (`src/host/`, `globalThis.__agentCodeHost`, the
Vite aliases) are gone: there is no shared React instance to collide with across a
frame boundary, so the "two reconcilers → invalid hook call" problem does not
exist. `vite.config.ts` just uses `extensionViteConfig()` from the SDK plus
`@vitejs/plugin-react`.

The host talks to each view frame over `postMessage`; the background runtime uses
a separate isolated transport. Timer state crosses that boundary as bounded JSON,
and view actions return as named runtime requests. Completion and reminder status
uses the permissioned `notifications.show` API even when no panel is mounted.
Theme tokens are pushed into a view as CSS variables on every change.

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
