export type Phase = 'idle' | 'running' | 'paused' | 'reminding' | 'finished'

export type Reminder = {
  id: string
  label: string
  intervalMinutes: number
}

/**
 * Everything the view needs. Deliberately a plain serializable object with no
 * methods and no live references because API v2 publishes it across the runtime
 * boundary. Persistence uses the related wall-clock shape below.
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
export type PersistedTimerV1 = {
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

/**
 * v2 preserves an interrupted reminder as well as ordinary running/paused time.
 * v1 omitted both the active reminder id and its banked elapsed seconds, so an
 * app restart during a reminder silently reset the session to idle. Keep v1 in
 * the restore union because existing installations may already have that shape.
 */
export type PersistedTimerV2 = Omit<PersistedTimerV1, 'version'> & {
  version: 2
  activeReminderId: string | null
}

export type PersistedTimer = PersistedTimerV1 | PersistedTimerV2

export const DEFAULT_PRESETS = [15, 25, 30, 45, 60, 90, 120] as const
