import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { extensionViteConfig } from 'agent-code-extension-api'

// Build config for an Agent Code API v2 extension.
//
// WHY there are no React aliases here anymore (they were the heart of the old
// build): an extension now runs in its OWN sandboxed iframe at its own origin, so
// it bundles its own React. There is no shared host React instance to collide with,
// so the "two reconcilers → invalid hook call" problem that forced the host-shim
// dance simply does not exist across the frame boundary. Bundle React normally.
//
// extensionViteConfig() keeps the background runtime and disposable React view
// as separate browser modules. Sharing one entry would recreate the API v1 bug:
// closing the panel would destroy the timer that is meant to outlive it.
const preset = extensionViteConfig({ entries: {
  runtime: 'src/runtime.ts',
  view: 'src/view.ts',
} }) as UserConfig

export default defineConfig({
  plugins: [react()],
  define: preset.define,
  build: {
    ...preset.build,
    minify: 'esbuild',
    target: 'es2022',
    emptyOutDir: true,
    // dist/ is COMMITTED — the installer downloads the repo SOURCE tarball, not a
    // release asset, so a CI-only dist/ would be a manifest pointing at nothing.
    outDir: 'dist',
  },
})
