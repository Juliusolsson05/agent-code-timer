import type { PersistedTimer, Reminder, TimerState } from './types'

export type EngineHost = {
  /** Toast through Agent Code. Used when a reminder fires with no view open. */
  notify(message: string): void
  /** Persist. Called on every state transition, not on every tick. */
  save(data: PersistedTimer): void
}

type Listener = (state: TimerState) => void

const TICK_MS = 250

/**
 * The timer itself. Headless.
 *
 * WHY this exists separately from the view, and why it is the whole point of the
 * extension: a focus timer whose lifetime is tied to a visible window is not a
 * focus timer. You start a 45-minute session and then close the window to go and
 * work — that is the entire use case. So the engine owns all state and all
 * timing, the API v2 runtime constructs it once, and views subscribe through
 * published state that can come and go without the session noticing.
 *
 * WHY every derivation is from a wall-clock deadline rather than a decrementing
 * counter: a per-tick subtraction accumulates however long each tick was
 * delayed, and Chromium throttles background renderers hard — a 45-minute
 * session in an unfocused window would finish minutes late. Recomputing from
 * `deadlineAt` means a late tick self-corrects, and machine sleep is handled by
 * the same property with no extra code. The original focus-flow-timer took five
 * commits to arrive at this; it is preserved deliberately.
 */
export class TimerEngine {
  private listeners = new Set<Listener>()
  private interval: ReturnType<typeof setInterval> | null = null
  /** Null means "rebuild on next read". See snapshot(). */
  private cachedSnapshot: TimerState | null = null

  private phase: TimerState['phase'] = 'idle'
  private totalSeconds = 30 * 60
  private reminders: Reminder[] = []
  private firedReminderKeys = new Set<string>()
  private activeReminderId: string | null = null
  private inheritTheme = false

  /** Epoch millis at which the current run ends. Null unless running. */
  private deadlineAt: number | null = null
  /** Elapsed seconds banked before the current pause. */
  private pausedElapsed = 0

  constructor(private host: EngineHost) {}

  // ---------------------------------------------------------------- lifecycle

  restore(data: PersistedTimer | undefined): void {
    if (!data || (data.version !== 1 && data.version !== 2)) return
    let completedWhileAway = false

    this.totalSeconds = data.totalSeconds
    this.reminders = data.reminders ?? []
    this.firedReminderKeys = new Set(data.firedReminderKeys ?? [])
    this.inheritTheme = data.inheritTheme ?? false

    if (data.phase === 'running' && data.deadlineAt != null) {
      // The app was closed mid-session. Recompute against the wall clock rather
      // than resuming a stale countdown: if the deadline has passed while Agent
      // Code was shut, the session is finished, not still running.
      if (data.deadlineAt > Date.now()) {
        this.deadlineAt = data.deadlineAt
        this.phase = 'running'
        this.startTicking()
      } else {
        this.phase = 'finished'
        this.deadlineAt = null
        completedWhileAway = true
      }
    } else if (data.phase === 'paused' && data.pausedElapsedSeconds != null) {
      this.pausedElapsed = data.pausedElapsedSeconds
      this.phase = 'paused'
    } else if (
      data.version === 2
      && data.phase === 'reminding'
      && data.pausedElapsedSeconds != null
      && data.activeReminderId != null
      && this.reminders.some(reminder => reminder.id === data.activeReminderId)
    ) {
      // A reminder is a paused timer with an acknowledgement gate. Restoring it
      // as ordinary paused state would hide the reason the timer stopped and let
      // the user accidentally resume without seeing the reminder.
      this.pausedElapsed = data.pausedElapsedSeconds
      this.activeReminderId = data.activeReminderId
      this.phase = 'reminding'
    } else if (data.phase === 'finished') {
      this.phase = 'finished'
    }

    if (completedWhileAway) {
      // Record the recovered terminal state before notifying. Otherwise every
      // later app start would rediscover the same stale running deadline and
      // announce one completion repeatedly.
      this.host.notify('Focus session complete')
      this.commit()
    } else {
      this.emit()
    }
  }

  dispose(): void {
    this.stopTicking()
    this.listeners.clear()
  }

  // ------------------------------------------------------------- subscription

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    // Deliberately does NOT call the listener here.
    //
    // useSyncExternalStore reads the current value through getSnapshot itself,
    // so an immediate push is redundant — and worse, it fires a state update
    // during subscription, which React counts toward its update-depth limit.
    // The first version did push, and combined with the allocating snapshot
    // below it produced React error #185 (maximum update depth) the moment the
    // view mounted, leaving a blank modal and an uncaught error.
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * The current state, as a STABLE reference.
   *
   * WHY the cache is not an optimisation: `useSyncExternalStore` compares the
   * result of getSnapshot by identity on every render, and treats a new object
   * as "the store changed". An allocating snapshot therefore reports a change on
   * every render forever — React re-renders, calls getSnapshot, sees another new
   * object, and gives up with error #185. Returning the same object until
   * something actually changes is a CORRECTNESS requirement of the hook, not a
   * performance tweak.
   *
   * Every mutation path goes through emit(), which invalidates. If a new mutator
   * is added that does not, this cache silently goes stale and the UI freezes —
   * so invalidation lives in emit() alone rather than being sprinkled per setter.
   */
  snapshot(): TimerState {
    if (!this.cachedSnapshot) {
      this.cachedSnapshot = {
        phase: this.phase,
        totalSeconds: this.totalSeconds,
        remainingSeconds: this.remainingSeconds(),
        reminders: this.reminders,
        activeReminderId: this.activeReminderId,
        firedReminderKeys: [...this.firedReminderKeys],
        inheritTheme: this.inheritTheme,
      }
    }
    return this.cachedSnapshot
  }

  // ------------------------------------------------------------------ actions

  setDuration(minutes: number): void {
    if (!Number.isFinite(minutes) || minutes <= 0) return
    this.totalSeconds = Math.round(minutes * 60)
    if (this.phase === 'idle' || this.phase === 'finished') {
      this.phase = 'idle'
      this.deadlineAt = null
      this.pausedElapsed = 0
    }
    this.commit()
  }

  start(): void {
    this.firedReminderKeys.clear()
    this.pausedElapsed = 0
    this.deadlineAt = Date.now() + this.totalSeconds * 1000
    this.phase = 'running'
    this.startTicking()
    this.commit()
  }

  pause(): void {
    if (this.phase !== 'running') return
    this.pausedElapsed = this.elapsedSeconds()
    this.deadlineAt = null
    this.phase = 'paused'
    this.stopTicking()
    this.commit()
  }

  resume(): void {
    if (this.phase !== 'paused') return
    const remaining = Math.max(0, this.totalSeconds - this.pausedElapsed)
    this.deadlineAt = Date.now() + remaining * 1000
    this.phase = 'running'
    this.startTicking()
    this.commit()
  }

  reset(): void {
    this.stopTicking()
    this.phase = 'idle'
    this.deadlineAt = null
    this.pausedElapsed = 0
    this.activeReminderId = null
    this.firedReminderKeys.clear()
    this.commit()
  }

  addReminder(label: string, intervalMinutes: number): void {
    const trimmed = label.trim()
    if (!trimmed || !Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return
    this.reminders = [
      ...this.reminders,
      {
        // crypto.randomUUID is available in the renderer; no dependency needed.
        id: crypto.randomUUID(),
        label: trimmed,
        intervalMinutes: Math.round(intervalMinutes),
      },
    ]
    this.commit()
  }

  removeReminder(id: string): void {
    this.reminders = this.reminders.filter(reminder => reminder.id !== id)
    this.commit()
  }

  dismissReminder(): void {
    if (this.phase !== 'reminding') return
    this.activeReminderId = null
    // Resume from where the reminder interrupted, not from the original
    // deadline — the time spent doing pushups should not count against the
    // session.
    const remaining = Math.max(0, this.totalSeconds - this.pausedElapsed)
    this.deadlineAt = Date.now() + remaining * 1000
    this.phase = 'running'
    this.startTicking()
    this.commit()
  }

  setInheritTheme(value: boolean): void {
    this.inheritTheme = value
    this.commit()
  }

  // ------------------------------------------------------------------ internals

  private elapsedSeconds(): number {
    if (this.deadlineAt == null) return this.pausedElapsed
    const remaining = Math.max(0, Math.ceil((this.deadlineAt - Date.now()) / 1000))
    return this.totalSeconds - remaining
  }

  private remainingSeconds(): number {
    if (this.phase === 'idle') return this.totalSeconds
    if (this.deadlineAt == null) return Math.max(0, this.totalSeconds - this.pausedElapsed)
    return Math.max(0, Math.ceil((this.deadlineAt - Date.now()) / 1000))
  }

  private startTicking(): void {
    this.stopTicking()
    // 250ms rather than 1000ms so the visible seconds never appear to skip when
    // a tick lands just after a second boundary. The work per tick is two
    // subtractions.
    this.interval = setInterval(() => this.tick(), TICK_MS)
  }

  private stopTicking(): void {
    if (this.interval == null) return
    clearInterval(this.interval)
    this.interval = null
  }

  private tick(): void {
    if (this.phase !== 'running') return

    const remaining = this.remainingSeconds()
    if (remaining <= 0) {
      this.stopTicking()
      this.phase = 'finished'
      this.deadlineAt = null
      this.host.notify('Focus session complete')
      this.commit()
      return
    }

    const fired = this.dueReminder()
    if (fired) {
      // A reminder pauses the session and takes over. Banking the elapsed time
      // here is what lets dismissReminder resume without losing the break.
      this.pausedElapsed = this.elapsedSeconds()
      this.deadlineAt = null
      this.stopTicking()
      this.activeReminderId = fired.id
      this.phase = 'reminding'
      // Always toast, even when a view is open: the view's own modal covers the
      // in-window case, and the host has no way to tell us whether it is
      // visible. A duplicate notification is better than a missed one.
      this.host.notify(`Reminder: ${fired.label}`)
      this.commit()
      return
    }

    // A 250ms check catches boundaries promptly, but sending four identical
    // snapshots per visible second only creates transport churn. The cached
    // snapshot is also the last state listeners actually received.
    if (this.cachedSnapshot?.remainingSeconds !== remaining) this.emit()
  }

  /**
   * WHY reminders are keyed by (id, interval-ordinal) rather than tested with
   * `elapsed % intervalSeconds === 0`: the modulo test only holds on the exact
   * second, and a throttled or delayed tick skips straight past it — the
   * original implementation could silently drop a reminder whenever the renderer
   * was backgrounded. Recording which ordinals have fired means a late tick
   * still fires the one it missed, exactly once.
   */
  private dueReminder(): Reminder | null {
    const elapsed = this.elapsedSeconds()
    for (const reminder of this.reminders) {
      const intervalSeconds = reminder.intervalMinutes * 60
      if (intervalSeconds <= 0) continue
      const ordinal = Math.floor(elapsed / intervalSeconds)
      if (ordinal < 1) continue
      const key = `${reminder.id}:${ordinal}`
      if (this.firedReminderKeys.has(key)) continue
      this.firedReminderKeys.add(key)
      return reminder
    }
    return null
  }

  private persisted(): PersistedTimer {
    return {
      version: 2,
      phase: this.phase,
      totalSeconds: this.totalSeconds,
      reminders: this.reminders,
      firedReminderKeys: [...this.firedReminderKeys],
      inheritTheme: this.inheritTheme,
      deadlineAt: this.deadlineAt,
      pausedElapsedSeconds:
        this.phase === 'paused' || this.phase === 'reminding' ? this.pausedElapsed : null,
      activeReminderId: this.activeReminderId,
    }
  }

  /** Emit + persist. Used for transitions; plain ticks only emit, because
   *  writing to disk four times a second would be absurd and the deadline is
   *  already durable. */
  private commit(): void {
    this.host.save(this.persisted())
    this.emit()
  }

  private emit(): void {
    // The ONE invalidation point. Every mutator routes through emit() or
    // commit() (which calls emit()), so the cache cannot go stale without a new
    // code path bypassing both — which is why this is here and not duplicated
    // into each setter.
    this.cachedSnapshot = null
    const state = this.snapshot()
    for (const listener of this.listeners) {
      try {
        listener(state)
      } catch {
        // A throwing subscriber must not stop the timer or starve its siblings.
      }
    }
  }
}
