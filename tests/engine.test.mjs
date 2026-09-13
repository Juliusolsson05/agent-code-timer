import assert from 'node:assert/strict'
import { test } from 'node:test'

import { TimerEngine } from '../src/engine/TimerEngine.ts'

function fixture() {
  const saved = []
  const notifications = []
  const engine = new TimerEngine({
    save: state => saved.push(structuredClone(state)),
    notify: message => notifications.push(message),
  })
  return { engine, saved, notifications }
}

function fakeClock(t, now = 1_000_000) {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'] })
  t.mock.timers.setTime(now)
}

test('a running timer derives from wall time and excludes a paused break', t => {
  fakeClock(t)
  const { engine, notifications } = fixture()
  t.after(() => engine.dispose())
  engine.setDuration(1)
  engine.start()
  t.mock.timers.tick(10_000)
  assert.equal(engine.snapshot().remainingSeconds, 50)
  engine.pause()
  t.mock.timers.tick(30_000)
  assert.equal(engine.snapshot().remainingSeconds, 50)
  engine.resume()
  t.mock.timers.tick(50_000)
  assert.equal(engine.snapshot().phase, 'finished')
  assert.deepEqual(notifications, ['Focus session complete'])
})

test('a delayed tick fires one interval reminder, pauses, and resumes the banked time', t => {
  fakeClock(t)
  const { engine, notifications } = fixture()
  t.after(() => engine.dispose())
  engine.setDuration(2)
  engine.addReminder('Stand up', 1)
  engine.start()
  t.mock.timers.tick(60_250)
  const reminder = engine.snapshot()
  assert.equal(reminder.phase, 'reminding')
  assert.equal(reminder.remainingSeconds, 60)
  assert.equal(reminder.activeReminderId, reminder.reminders[0].id)
  assert.deepEqual(notifications, ['Reminder: Stand up'])
  t.mock.timers.tick(20_000)
  assert.equal(engine.snapshot().remainingSeconds, 60)
  engine.dismissReminder()
  t.mock.timers.tick(60_000)
  assert.equal(engine.snapshot().phase, 'finished')
  assert.deepEqual(notifications, ['Reminder: Stand up', 'Focus session complete'])
})

test('v2 persistence restores a reminder that was awaiting dismissal', t => {
  fakeClock(t)
  const { engine } = fixture()
  t.after(() => engine.dispose())
  engine.restore({
    version: 2,
    phase: 'reminding',
    totalSeconds: 120,
    reminders: [{ id: 'stretch', label: 'Stretch', intervalMinutes: 1 }],
    firedReminderKeys: ['stretch:1'],
    inheritTheme: true,
    deadlineAt: null,
    pausedElapsedSeconds: 60,
    activeReminderId: 'stretch',
  })
  assert.deepEqual(engine.snapshot(), {
    phase: 'reminding', totalSeconds: 120, remainingSeconds: 60,
    reminders: [{ id: 'stretch', label: 'Stretch', intervalMinutes: 1 }],
    activeReminderId: 'stretch', firedReminderKeys: ['stretch:1'], inheritTheme: true,
  })
  engine.dismissReminder()
  t.mock.timers.tick(10_000)
  assert.equal(engine.snapshot().phase, 'running')
  assert.equal(engine.snapshot().remainingSeconds, 50)
})

test('an expired running session is announced once and persisted as finished', t => {
  fakeClock(t)
  const { engine, saved, notifications } = fixture()
  t.after(() => engine.dispose())
  engine.restore({
    version: 1,
    phase: 'running',
    totalSeconds: 60,
    reminders: [],
    firedReminderKeys: [],
    inheritTheme: false,
    deadlineAt: Date.now() - 1,
    pausedElapsedSeconds: null,
  })
  assert.equal(engine.snapshot().phase, 'finished')
  assert.deepEqual(notifications, ['Focus session complete'])
  assert.equal(saved.at(-1).version, 2)
  assert.equal(saved.at(-1).phase, 'finished')

  const next = fixture()
  next.engine.restore(saved.at(-1))
  assert.deepEqual(next.notifications, [])
  next.engine.dispose()
})

test('a future deadline resumes and corrects itself after a long sleep', t => {
  fakeClock(t)
  const { engine } = fixture()
  t.after(() => engine.dispose())
  engine.restore({
    version: 1,
    phase: 'running',
    totalSeconds: 90,
    reminders: [],
    firedReminderKeys: [],
    inheritTheme: false,
    deadlineAt: Date.now() + 45_000,
    pausedElapsedSeconds: null,
  })
  assert.equal(engine.snapshot().remainingSeconds, 45)
  t.mock.timers.tick(44_000)
  assert.equal(engine.snapshot().remainingSeconds, 1)
  t.mock.timers.tick(1_000)
  assert.equal(engine.snapshot().phase, 'finished')
})

test('publishes at visible second boundaries instead of every 250ms check', t => {
  fakeClock(t)
  const { engine } = fixture()
  t.after(() => engine.dispose())
  let publications = 0
  engine.subscribe(() => publications++)
  engine.setDuration(1)
  engine.start()
  const afterStart = publications
  t.mock.timers.tick(999)
  assert.equal(publications, afterStart)
  t.mock.timers.tick(1)
  assert.equal(publications, afterStart + 1)
})

test('invalid mutations preserve valid state and subscriber failures are isolated', () => {
  const { engine, saved } = fixture()
  engine.subscribe(() => { throw new Error('broken view') })
  engine.setDuration(Number.NaN)
  engine.setDuration(0)
  engine.addReminder(' ', 10)
  engine.addReminder('Stretch', Number.NaN)
  assert.equal(engine.snapshot().totalSeconds, 30 * 60)
  assert.deepEqual(engine.snapshot().reminders, [])
  assert.equal(saved.length, 0)
  engine.setDuration(25)
  assert.equal(engine.snapshot().totalSeconds, 25 * 60)
  engine.dispose()
})
