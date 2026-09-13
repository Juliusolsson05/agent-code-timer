// Bundle TypeScript tests before handing them to Node's built-in runner. This
// uses the same esbuild family as the production Vite build while leaving dist/
// untouched, so engine tests cannot accidentally make an installable bundle pass.
import { spawnSync } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'

const files = (await readdir(new URL('../tests/', import.meta.url)))
  .filter(file => file.endsWith('.test.mjs'))
const output = await mkdtemp(join(tmpdir(), 'agent-code-timer-tests-'))
try {
  await build({
    entryPoints: files.map(file => `tests/${file}`),
    outdir: output,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'warning',
  })
  const result = spawnSync(
    process.execPath,
    ['--test', ...files.map(file => join(output, file))],
    { stdio: 'inherit' },
  )
  process.exitCode = result.status ?? 1
} finally {
  await rm(output, { recursive: true, force: true })
}
