import { requireHost } from './agentCode'

// Resolves the automatic JSX runtime to the host's.
//
// Vite compiles JSX to `import { jsx } from 'react/jsx-runtime'`, and that
// specifier is aliased here. Without this, JSX would pull in a second React
// runtime alongside the host's and every hook would throw "invalid hook call".
const runtime = requireHost().jsxRuntime as {
  jsx: unknown
  jsxs: unknown
  jsxDEV?: unknown
  Fragment: unknown
}

export const jsx = runtime.jsx
export const jsxs = runtime.jsxs
// Dev builds emit jsxDEV; production emits jsx/jsxs. Falling back keeps a
// development build of this extension working against a production host.
export const jsxDEV = runtime.jsxDEV ?? runtime.jsx
export const Fragment = runtime.Fragment
