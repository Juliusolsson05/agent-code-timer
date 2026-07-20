import { Chime } from './alert'
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
 * timing, `activate()` constructs it once, and the view is a subscriber that can
 * come and go without the session noticing.
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
  private chime = new Chime()

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
    if (!data || data.version !== 1) return

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
      }
    } else if (data.phase === 'paused' && data.pausedElapsedSeconds != null) {
      this.pausedElapsed = data.pausedElapsedSeconds
      this.phase = 'paused'
    } else if (data.phase === 'finished') {
      this.phase = 'finished'
    }

    this.emit()
  }

  dispose(): void {
    this.stopTicking()
    this.chime.stop()
    this.listeners.clear()
  }

  // ------------------------------------------------------------- subscription

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    // Push current state immediately so a view that mounts mid-session renders
    // the truth on its first frame rather than a default and then a correction.
    listener(this.snapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  snapshot(): TimerState {
    return {
      phase: this.phase,
      totalSeconds: this.totalSeconds,
      remainingSeconds: this.remainingSeconds(),
      reminders: this.reminders,
      activeReminderId: this.activeReminderId,
      firedReminderKeys: [...this.firedReminderKeys],
      inheritTheme: this.inheritTheme,
    }
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
    this.chime.stop()
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
    this.chime.stop()
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
      this.chime.play()
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
      this.chime.play()
      // Always toast, even when a view is open: the view's own modal covers the
      // in-window case, and the host has no way to tell us whether it is
      // visible. A duplicate notification is better than a missed one.
      this.host.notify(`Reminder: ${fired.label}`)
      this.commit()
      return
    }

    this.emit()
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
      version: 1,
      phase: this.phase,
      totalSeconds: this.totalSeconds,
      reminders: this.reminders,
      firedReminderKeys: [...this.firedReminderKeys],
      inheritTheme: this.inheritTheme,
      deadlineAt: this.deadlineAt,
      pausedElapsedSeconds: this.phase === 'paused' ? this.pausedElapsed : null,
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
