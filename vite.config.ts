import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Build config for an Agent Code extension.
//
// WHY react is ALIASED to a local shim rather than marked `external`:
// marking it external leaves a bare `import 'react'` specifier in the output,
// and the browser has no way to resolve a bare specifier without an import map
// — which would have to be declared in the HOST's document before its own first
// module loads, coupling every extension to a host-side registration. Aliasing
// resolves the specifier at OUR build time to a shim that reads the host's React
// off `globalThis.__agentCodeHost`. The output has no bare specifiers, needs no
// host cooperation beyond the global, and any dependency that imports react
// (framer-motion does) gets the same alias for free.
//
// WHY not just bundle React: two React copies in one document means two
// reconcilers and every hook throws "invalid hook call". The host's instance is
// the only correct one.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^react$/, replacement: resolve(__dirname, 'src/host/react.ts') },
      {
        find: /^react\/jsx-runtime$/,
        replacement: resolve(__dirname, 'src/host/jsx-runtime.ts'),
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: resolve(__dirname, 'src/host/jsx-runtime.ts'),
      },
      {
        find: /^react-dom\/client$/,
        replacement: resolve(__dirname, 'src/host/react-dom-client.ts'),
      },
    ],
  },
  esbuild: {
    // The shims re-export the host's runtime, so the automatic runtime must
    // point at our jsx-runtime alias rather than a bundled react.
    jsx: 'automatic',
  },
  // REQUIRED, and the single most likely thing to break an extension build.
  //
  // Vite's LIBRARY mode does not define process.env.NODE_ENV — a normal app
  // build replaces it, but a library is expected to leave it for the consuming
  // bundler. There is no consuming bundler here: the output is loaded straight
  // into a renderer with nodeIntegration:false, where `process` does not exist.
  // Every React-ecosystem dependency guards its dev warnings with
  // `process.env.NODE_ENV !== "production"`, so the first such guard to execute
  // throws "process is not defined" and the extension fails to activate.
  //
  // Found the hard way: framer-motion ships eight of these, and the extension
  // installed and imported cleanly before dying inside activate().
  //
  // Defining it rather than shimming a global `process` is deliberate — a fake
  // process object would make libraries take Node code paths in a browser realm,
  // which fails later and less obviously.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      // Must match `entry` in agent-code.extension.json. The host loads exactly
      // this path over agent-code-ext://, so renaming it here without updating
      // the manifest produces a "manifest points at a file that does not exist"
      // install failure.
      fileName: () => 'index.js',
    },
    // Single file. The host serves the bundle over a custom scheme and loads it
    // with one dynamic import; code-splitting would emit sibling chunks that
    // resolve relative to the extension origin. That WOULD work (the scheme is
    // `standard`, so relative specifiers resolve), but a single file means one
    // request and no chance of a partially-fetched extension.
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    // CSS is injected by the JS rather than emitted as a sibling file: the
    // manifest declares one entry, and a stylesheet the host does not know to
    // fetch would silently never load.
    cssCodeSplit: false,
    minify: 'esbuild',
    target: 'es2022',
    emptyOutDir: true,
    // dist/ is COMMITTED. The installer downloads the repository source
    // tarball, not a release asset, so a build output that only exists in CI
    // would not be present when the extension is installed.
    outDir: 'dist',
  },
})
