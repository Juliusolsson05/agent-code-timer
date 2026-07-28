import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { extensionViteConfig } from 'agent-code-extension-api'

// Build config for an Agent Code extension — the iframe model.
//
// WHY there are no React aliases here anymore (they were the heart of the old
// build): an extension now runs in its OWN sandboxed iframe at its own origin, so
// it bundles its own React. There is no shared host React instance to collide with,
// so the "two reconcilers → invalid hook call" problem that forced the host-shim
// dance simply does not exist across the frame boundary. Bundle React normally.
//
// extensionViteConfig() from the SDK supplies the parts that are easy to get wrong:
// a single inlined ES module (the host loads exactly the one `entry` file over the
// scheme), process.env.NODE_ENV defined (Vite lib mode does not, and the frame has
// no `process`, so a React dev-guard would throw at activate()), and no CSS split.
const preset = extensionViteConfig({ entry: 'src/index.ts' }) as UserConfig

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
