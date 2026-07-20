import { AnimatePresence, motion } from 'framer-motion'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

import type { TimerEngine } from '../engine/TimerEngine'
import { applyThemeInheritance, watchHostTheme } from '../theme/inherit'
import { CurrentTime } from './components/CurrentTime'
import { DurationPicker } from './components/DurationPicker'
import { ReminderAlert } from './components/ReminderAlert'
import { ReminderManager } from './components/ReminderManager'
import { TimerDisplay } from './components/TimerDisplay'

/**
 * The view. Owns no timer state — it is a window onto the engine.
 *
 * useSyncExternalStore rather than useState+useEffect: the engine is the source
 * of truth and can change between render and effect (a tick lands every 250ms),
 * and this is the hook designed for exactly that. It also means mounting mid-
 * session renders the correct time on the first frame instead of a default
 * followed by a correction.
 */
export function TimerView({ engine }: { engine: TimerEngine }) {
  // Both arguments must be STABLE across renders. useSyncExternalStore
  // resubscribes whenever the subscribe function's identity changes, so an
  // inline arrow would tear down and rebuild the subscription on every single
  // render — harmless-looking, and a steady stream of churn under a 250ms tick.
  const subscribe = useCallback((onChange: () => void) => engine.subscribe(onChange), [engine])
  const getSnapshot = useCallback(() => engine.snapshot(), [engine])
  const state = useSyncExternalStore(subscribe, getSnapshot)

  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const apply = () => applyThemeInheritance(root, state.inheritTheme)
    apply()
    // Re-apply when the HOST theme changes, not just when the toggle flips —
    // otherwise switching Agent Code from dark to light leaves an inherited
    // timer showing the old palette until it is reopened.
    return state.inheritTheme ? watchHostTheme(apply) : undefined
  }, [state.inheritTheme])

  const activeReminder =
    state.activeReminderId != null
      ? (state.reminders.find(reminder => reminder.id === state.activeReminderId) ?? null)
      : null

  const setup = state.phase === 'idle'

  return (
    <div className="agent-code-timer" ref={rootRef}>
      <CurrentTime />

      <TimerDisplay remainingSeconds={state.remainingSeconds} phase={state.phase} />

      <AnimatePresence mode="wait">
        {setup ? (
          <motion.div
            key="setup"
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%' }}
          >
            <DurationPicker
              totalSeconds={state.totalSeconds}
              onSelect={minutes => engine.setDuration(minutes)}
              onStart={() => engine.start()}
            />
            <ReminderManager
              reminders={state.reminders}
              onAdd={(label, minutes) => engine.addReminder(label, minutes)}
              onRemove={id => engine.removeReminder(id)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="running"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}
          >
            <div className="tm-row">
              {state.phase === 'running' ? (
                <button
                  type="button"
                  className="tm-circle"
                  onClick={() => engine.pause()}
                  title="Pause"
                >
                  <Pause size={17} />
                </button>
              ) : null}
              {state.phase === 'paused' ? (
                <button
                  type="button"
                  className="tm-circle"
                  onClick={() => engine.resume()}
                  title="Resume"
                >
                  <Play size={17} style={{ marginLeft: 2 }} />
                </button>
              ) : null}
              <button type="button" className="tm-circle" onClick={() => engine.reset()} title="Reset">
                <RotateCcw size={17} />
              </button>
            </div>

            {state.phase === 'finished' ? (
              <motion.span
                className="tm-reminder-sub"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                Session complete
              </motion.span>
            ) : null}

            {state.reminders.length > 0 && state.phase !== 'finished' ? (
              <div className="tm-presets" style={{ marginTop: 2 }}>
                {state.reminders.map(reminder => (
                  <span key={reminder.id} className="tm-chip">
                    {reminder.label} · {reminder.intervalMinutes}m
                  </span>
                ))}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="tm-footer">
        <button
          type="button"
          className="tm-toggle"
          data-on={state.inheritTheme}
          onClick={() => engine.setInheritTheme(!state.inheritTheme)}
          title={
            state.inheritTheme
              ? 'Using Agent Code theme — click for black & white'
              : 'Using black & white — click to inherit Agent Code theme'
          }
        >
          <span className="tm-toggle-dot" />
          {state.inheritTheme ? 'Inheriting theme' : 'Black & white'}
        </button>
      </div>

      <AnimatePresence>
        {activeReminder ? (
          <ReminderAlert reminder={activeReminder} onDismiss={() => engine.dismissReminder()} />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
