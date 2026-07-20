export type Phase = 'idle' | 'running' | 'paused' | 'reminding' | 'finished'

export type Reminder = {
  id: string
  label: string
  intervalMinutes: number
}

/**
 * Everything the view needs. Deliberately a plain serializable object with no
 * methods and no live references: it is what gets persisted, and it is what a
 * future postMessage transport would have to send across a frame boundary.
 */
export type TimerState = {
  phase: Phase
  /** Configured session length. */
  totalSeconds: number
  /** Recomputed from the deadline on every tick — never decremented. */
  remainingSeconds: number
  reminders: Reminder[]
  /** The reminder currently demanding attention, if any. */
  activeReminderId: string | null
  /** Which reminder intervals have already fired this session, so a reminder
   *  cannot re-fire for the same elapsed minute after a pause/resume. */
  firedReminderKeys: string[]
  inheritTheme: boolean
}

/** The persisted shape. Separate from TimerState because a restored session has
 *  to be reconstructed from wall-clock truth, not from a stale countdown. */
export type PersistedTimer = {
  version: 1
  phase: Phase
  totalSeconds: number
  reminders: Reminder[]
  firedReminderKeys: string[]
  inheritTheme: boolean
  /** Epoch millis when the current run ends. Null unless phase === 'running'.
   *  THIS is what makes the timer survive an app restart: on load we compare it
   *  to Date.now() rather than trusting any stored countdown. */
  deadlineAt: number | null
  /** Seconds already elapsed before the current pause. Null unless paused. */
  pausedElapsedSeconds: number | null
}

export const DEFAULT_PRESETS = [15, 25, 30, 45, 60, 90, 120] as const
