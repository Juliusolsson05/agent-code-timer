import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import runtime from '../src/runtime.ts'

const disposables = []
afterEach(async () => {
  await runtime.deactivate?.()
  for (const disposable of disposables.splice(0)) await disposable.dispose()
})

function context(initial = {}) {
  const storage = new Map(Object.entries(initial))
  const commands = new Map()
  const requests = new Map()
  const publications = []
  const notifications = []
  const subscriptions = []
  const value = {
    api: {
      extension: { id: 'timer', apiVersion: 2 },
      storage: {
        async get(key) { return storage.get(key) },
        async set(key, next) { storage.set(key, structuredClone(next)) },
        async delete(key) { storage.delete(key) },
        async keys() { return [...storage.keys()] },
      },
      files: {},
      notifications: { async show(message) { notifications.push(message) } },
    },
    subscriptions,
    registerCommand(id, handler) { commands.set(id, handler); return { dispose() {} } },
    registerRequest(name, handler) { requests.set(name, handler); return { dispose() {} } },
    views: { async publish(viewId, state) {
      publications.push({ viewId, state: structuredClone(state) })
    } },
  }
  disposables.push(...subscriptions)
  return { value, storage, commands, requests, publications, notifications }
}

test('startup restores an expired session, notifies without a view, and publishes finished state', async () => {
  const expired = {
    version: 1, phase: 'running', totalSeconds: 60, reminders: [],
    firedReminderKeys: [], inheritTheme: false, deadlineAt: Date.now() - 1,
    pausedElapsedSeconds: null,
  }
  const fixture = context({ session: expired })
  await runtime.activate(fixture.value)
  assert.deepEqual(fixture.notifications, ['Focus session complete'])
  assert.equal(fixture.storage.get('session').version, 2)
  assert.equal(fixture.storage.get('session').phase, 'finished')
  assert.equal(fixture.publications.at(-1).viewId, 'timer.main')
  assert.equal(fixture.publications.at(-1).state.phase, 'finished')
  assert.deepEqual([...fixture.commands.keys()], ['timer.start', 'timer.pause', 'timer.reset'])
  assert.deepEqual([...fixture.requests.keys()], ['action'])
})

test('settings seed idle state and view actions mutate the one background engine', async () => {
  const fixture = context({ 'timer.defaultMinutes': 45, 'timer.inheritTheme': true })
  await runtime.activate(fixture.value)
  const action = fixture.requests.get('action')
  assert.equal(fixture.publications.at(-1).state.totalSeconds, 45 * 60)
  assert.equal(fixture.publications.at(-1).state.inheritTheme, true)

  await action({ type: 'setDuration', minutes: 25 }, { id: 'timer.main', instanceId: 'view-1' })
  await action({ type: 'addReminder', label: '  Stretch  ', intervalMinutes: 5 }, { id: 'timer.main', instanceId: 'view-1' })
  await action({ type: 'start' }, { id: 'timer.main', instanceId: 'view-1' })
  assert.equal(fixture.publications.at(-1).state.phase, 'running')
  assert.equal(fixture.publications.at(-1).state.totalSeconds, 25 * 60)
  assert.deepEqual(fixture.publications.at(-1).state.reminders.map(item => item.label), ['Stretch'])

  await action({ type: 'setInheritTheme', value: false }, { id: 'timer.main', instanceId: 'view-2' })
  assert.equal(fixture.storage.get('timer.inheritTheme'), false)
  assert.equal(fixture.publications.at(-1).state.inheritTheme, false)
  await fixture.commands.get('timer.pause')()
  assert.equal(fixture.publications.at(-1).state.phase, 'paused')
  await fixture.commands.get('timer.reset')()
  assert.equal(fixture.publications.at(-1).state.phase, 'idle')
})

test('settings reconciliation cannot rewrite an active deadline', async () => {
  const fixture = context({ 'timer.defaultMinutes': 30 })
  await runtime.activate(fixture.value)
  const action = fixture.requests.get('action')
  await action({ type: 'setDuration', minutes: 25 }, { id: 'timer.main', instanceId: 'view-1' })
  await action({ type: 'start' }, { id: 'timer.main', instanceId: 'view-1' })
  fixture.storage.set('timer.defaultMinutes', 90)
  await action({ type: 'syncSettings' }, { id: 'timer.main', instanceId: 'view-2' })
  assert.equal(fixture.publications.at(-1).state.totalSeconds, 25 * 60)
  assert.equal(fixture.publications.at(-1).state.phase, 'running')
})

test('a viewless start command reads the latest contributed default', async () => {
  const fixture = context({ 'timer.defaultMinutes': 30 })
  await runtime.activate(fixture.value)
  fixture.storage.set('timer.defaultMinutes', 90)
  await fixture.commands.get('timer.start')()
  assert.equal(fixture.publications.at(-1).state.phase, 'running')
  assert.equal(fixture.publications.at(-1).state.totalSeconds, 90 * 60)
})

test('malformed view actions reject without changing published timer state', async () => {
  const fixture = context()
  await runtime.activate(fixture.value)
  const action = fixture.requests.get('action')
  const before = fixture.publications.at(-1).state
  for (const invalid of [
    null,
    { type: 'setDuration', minutes: 0 },
    { type: 'setDuration', minutes: 481 },
    { type: 'addReminder', label: '', intervalMinutes: 5 },
    { type: 'addReminder', label: 'x'.repeat(81), intervalMinutes: 5 },
    { type: 'removeReminder', id: '' },
    { type: 'unknown' },
  ]) await assert.rejects(
    action(invalid, { id: 'timer.main', instanceId: 'view-1' }),
    /Invalid timer action|JSON objects/,
  )
  assert.deepEqual(fixture.publications.at(-1).state, before)
})
