import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

test('the committed API v2 bundle has independent runtime and panel entries', async () => {
  const manifest = JSON.parse(await readFile('agent-code.extension.json', 'utf8'))
  assert.equal(manifest.apiVersion, 2)
  assert.equal(manifest.entry, 'dist/runtime.js')
  assert.deepEqual(manifest.permissions, ['sessions.observe', 'notifications.show'])
  assert.deepEqual(manifest.activationEvents, ['onStartupFinished'])
  assert.deepEqual(manifest.contributes.views, [{
    id: 'timer.main', title: 'Timer', mount: 'panel', entry: 'dist/view.js',
  }])

  const runtime = await import(pathToFileURL(`${process.cwd()}/${manifest.entry}`).href)
  const view = await import(pathToFileURL(
    `${process.cwd()}/${manifest.contributes.views[0].entry}`,
  ).href)
  assert.equal(typeof runtime.default.activate, 'function')
  assert.equal(typeof view.default.mount, 'function')
  assert.equal(view.default.activate, undefined)

  const runtimeSource = await readFile(manifest.entry, 'utf8')
  const viewSource = await readFile(manifest.contributes.views[0].entry, 'utf8')
  // Audio belongs to visible view feedback. Keeping it out of the hidden engine
  // prevents an autoplay-dependent browser primitive from becoming completion's
  // only signal; the permissioned host notification is the durable path.
  assert.doesNotMatch(runtimeSource, /AudioContext/)
  assert.match(viewSource, /AudioContext/)
})
