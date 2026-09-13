import { defineRuntime } from 'agent-code-extension-api'
import type { JsonValue, RuntimeContext } from 'agent-code-extension-api'

import { TimerEngine } from './engine/TimerEngine'
import type { PersistedTimer, TimerState } from './engine/types'

const SESSION_KEY = 'session'
const DEFAULT_MINUTES_KEY = 'timer.defaultMinutes'
const INHERIT_THEME_KEY = 'timer.inheritTheme'

type TimerAction =
  | { type: 'setDuration'; minutes: number }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'reset' }
  | { type: 'addReminder'; label: string; intervalMinutes: number }
  | { type: 'removeReminder'; id: string }
  | { type: 'dismissReminder' }
  | { type: 'setInheritTheme'; value: boolean }
  | { type: 'syncSettings' }

let engine: TimerEngine | null = null

function record(value: JsonValue): Record<string, JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Timer actions must be JSON objects.')
  }
  return value
}

function actionFrom(input: JsonValue): TimerAction {
  const value = record(input)
  switch (value.type) {
    case 'setDuration':
      if (typeof value.minutes === 'number' && Number.isFinite(value.minutes)
        && value.minutes >= 1 && value.minutes <= 480) {
        return { type: value.type, minutes: value.minutes }
      }
      break
    case 'addReminder':
      if (typeof value.label === 'string' && value.label.trim().length > 0
        && value.label.length <= 80 && typeof value.intervalMinutes === 'number'
        && Number.isInteger(value.intervalMinutes) && value.intervalMinutes >= 1
        && value.intervalMinutes <= 480) {
        return {
          type: value.type,
          label: value.label,
          intervalMinutes: value.intervalMinutes,
        }
      }
      break
    case 'removeReminder':
      if (typeof value.id === 'string' && value.id.length > 0) {
        return { type: value.type, id: value.id }
      }
      break
    case 'setInheritTheme':
      if (typeof value.value === 'boolean') return { type: value.type, value: value.value }
      break
    case 'start':
    case 'pause':
    case 'resume':
    case 'reset':
    case 'dismissReminder':
    case 'syncSettings':
      return { type: value.type }
  }
  // The view is untrusted transport input even though our own bundle normally
  // creates it. Reject malformed actions here so a stale or edited view cannot
  // push impossible values into the long-lived engine.
  throw new Error('Invalid timer action.')
}

async function syncSettings(context: RuntimeContext, timer: TimerEngine): Promise<void> {
  const [defaultMinutes, inheritTheme] = await Promise.all([
    context.api.storage.get<number>(DEFAULT_MINUTES_KEY),
    context.api.storage.get<boolean>(INHERIT_THEME_KEY),
  ])
  // Settings are an input to the next idle session. A preference change must not
  // rewrite the deadline of a timer that is already running or paused.
  if (timer.snapshot().phase === 'idle'
    && typeof defaultMinutes === 'number'
    && Number.isFinite(defaultMinutes)
    && defaultMinutes >= 1
    && defaultMinutes <= 480) {
    timer.setDuration(defaultMinutes)
  }
  if (typeof inheritTheme === 'boolean') timer.setInheritTheme(inheritTheme)
}

async function performAction(
  context: RuntimeContext,
  timer: TimerEngine,
  input: JsonValue,
): Promise<TimerState> {
  const action = actionFrom(input)
  switch (action.type) {
    case 'setDuration': timer.setDuration(action.minutes); break
    case 'start': timer.start(); break
    case 'pause': timer.pause(); break
    case 'resume': timer.resume(); break
    case 'reset': timer.reset(); break
    case 'addReminder': timer.addReminder(action.label, action.intervalMinutes); break
    case 'removeReminder': timer.removeReminder(action.id); break
    case 'dismissReminder': timer.dismissReminder(); break
    case 'syncSettings': await syncSettings(context, timer); break
    case 'setInheritTheme':
      // The contributed Settings row and the in-view toggle share this key. Save
      // it before changing the live engine so a storage failure cannot make the
      // UI claim a preference that will disappear on the next activation.
      await context.api.storage.set(INHERIT_THEME_KEY, action.value)
      timer.setInheritTheme(action.value)
      break
  }
  return timer.snapshot()
}

export default defineRuntime({
  async activate(context) {
    const timer = new TimerEngine({
      // Persistence and notification failures should not stop the clock that
      // produced them. Both services report independently through host status.
      save: data => { void context.api.storage.set(SESSION_KEY, data).catch(() => {}) },
      notify: message => { void context.api.notifications.show(message).catch(() => {}) },
    })
    engine = timer

    try {
      const saved = await context.api.storage.get<PersistedTimer>(SESSION_KEY)
      timer.restore(saved)
    } catch {
      // A corrupt/unreadable prior session starts clean. The host preserves the
      // bytes for diagnosis; this extension must still activate and be usable.
    }
    await syncSettings(context, timer).catch(() => {})

    const publish = (state = timer.snapshot()) => context.views.publish('timer.main', state)
    const unsubscribe = timer.subscribe(state => { void publish(state).catch(() => {}) })
    context.subscriptions.push({ dispose: unsubscribe }, { dispose: () => timer.dispose() })

    context.registerCommand('timer.start', async () => {
      // A command can start the timer without ever opening its panel. Re-read
      // contributed settings here so that path honors a newly selected default.
      await syncSettings(context, timer).catch(() => {})
      timer.start()
    })
    context.registerCommand('timer.pause', () => timer.pause())
    context.registerCommand('timer.reset', () => timer.reset())
    context.registerRequest('action', input => performAction(context, timer, input))
    await publish()
  },

  deactivate() {
    engine?.dispose()
    engine = null
  },
})
