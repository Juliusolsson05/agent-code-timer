// The reminder chime.
//
// Ported from the original focus-flow-timer: an Apple-ish ascending tri-tone
// (880 / 1046 / 1174 Hz) repeated so it keeps demanding attention until
// dismissed. The point of a reminder is that you are heads-down and not looking
// at the screen, so a single beep is useless.

const TONES = [880, 1046, 1174]
const REPEATS = 20
const REPEAT_GAP_SECONDS = 2

export class Chime {
  private context: AudioContext | null = null

  /**
   * WHY the AudioContext is created per-play and closed on stop, rather than
   * created once and reused: a long-lived context keeps the audio hardware
   * awake, and this extension can sit idle for hours between reminders. Creating
   * one costs a few milliseconds at the exact moment we are already making
   * noise.
   */
  play(): void {
    this.stop()
    try {
      const ctx = new AudioContext()
      this.context = ctx

      const beep = (at: number, frequency: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = frequency
        // Exponential decay rather than a hard stop: an abrupt gain cut produces
        // an audible click at the tail of every tone.
        gain.gain.setValueAtTime(0.3, at)
        gain.gain.exponentialRampToValueAtTime(0.01, at + 0.3)
        osc.start(at)
        osc.stop(at + 0.3)
      }

      const start = ctx.currentTime
      for (let repeat = 0; repeat < REPEATS; repeat += 1) {
        const base = start + repeat * REPEAT_GAP_SECONDS
        TONES.forEach((frequency, index) => beep(base + index * 0.35, frequency))
      }
    } catch {
      // Autoplay policy, no audio device, or a context limit. A silent reminder
      // is degraded but the visual alert still fires, so this must not throw
      // into the view update that announced the reminder.
      this.context = null
    }
  }

  stop(): void {
    if (!this.context) return
    // Closing cancels every scheduled oscillator at once — the reason all 20
    // repeats are scheduled up front rather than driven by a timer.
    void this.context.close().catch(() => {})
    this.context = null
  }
}
