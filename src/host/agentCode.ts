// The host handshake.
//
// Agent Code publishes a frozen `globalThis.__agentCodeHost` before importing any
// extension module. Everything in this directory reads from it. It is the ONLY
// global this extension touches — the rest of the host surface arrives as the
// `api` object passed to `activate()`.

export type AgentCodeHost = {
  react: typeof import('react')
  reactDom: typeof import('react-dom/client')
  jsxRuntime: Record<string, unknown>
  apiVersion: number
}

export function requireHost(): AgentCodeHost {
  const host = (globalThis as { __agentCodeHost?: AgentCodeHost }).__agentCodeHost
  if (!host) {
    // Reached only if this bundle is loaded outside Agent Code — a plain browser,
    // a test runner, or a host too old to publish the global. A clear message
    // beats a TypeError on `undefined.react` twelve frames deep inside
    // framer-motion.
    throw new Error(
      'agent-code-timer: globalThis.__agentCodeHost is missing. This bundle only ' +
        'runs inside Agent Code (API v1 or later).',
    )
  }
  return host
}
