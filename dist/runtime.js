import { d as l } from "./runtime-D_epeM7Z.js";
const c = 250;
class m {
  constructor(e) {
    this.host = e;
  }
  listeners = /* @__PURE__ */ new Set();
  interval = null;
  /** Null means "rebuild on next read". See snapshot(). */
  cachedSnapshot = null;
  phase = "idle";
  totalSeconds = 30 * 60;
  reminders = [];
  firedReminderKeys = /* @__PURE__ */ new Set();
  activeReminderId = null;
  inheritTheme = !1;
  /** Epoch millis at which the current run ends. Null unless running. */
  deadlineAt = null;
  /** Elapsed seconds banked before the current pause. */
  pausedElapsed = 0;
  // ---------------------------------------------------------------- lifecycle
  restore(e) {
    if (!e || e.version !== 1 && e.version !== 2) return;
    let i = !1;
    this.totalSeconds = e.totalSeconds, this.reminders = e.reminders ?? [], this.firedReminderKeys = new Set(e.firedReminderKeys ?? []), this.inheritTheme = e.inheritTheme ?? !1, e.phase === "running" && e.deadlineAt != null ? e.deadlineAt > Date.now() ? (this.deadlineAt = e.deadlineAt, this.phase = "running", this.startTicking()) : (this.phase = "finished", this.deadlineAt = null, i = !0) : e.phase === "paused" && e.pausedElapsedSeconds != null ? (this.pausedElapsed = e.pausedElapsedSeconds, this.phase = "paused") : e.version === 2 && e.phase === "reminding" && e.pausedElapsedSeconds != null && e.activeReminderId != null && this.reminders.some((t) => t.id === e.activeReminderId) ? (this.pausedElapsed = e.pausedElapsedSeconds, this.activeReminderId = e.activeReminderId, this.phase = "reminding") : e.phase === "finished" && (this.phase = "finished"), i ? (this.host.notify("Focus session complete"), this.commit()) : this.emit();
  }
  dispose() {
    this.stopTicking(), this.listeners.clear();
  }
  // ------------------------------------------------------------- subscription
  subscribe(e) {
    return this.listeners.add(e), () => {
      this.listeners.delete(e);
    };
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
  snapshot() {
    return this.cachedSnapshot || (this.cachedSnapshot = {
      phase: this.phase,
      totalSeconds: this.totalSeconds,
      remainingSeconds: this.remainingSeconds(),
      reminders: this.reminders,
      activeReminderId: this.activeReminderId,
      firedReminderKeys: [...this.firedReminderKeys],
      inheritTheme: this.inheritTheme
    }), this.cachedSnapshot;
  }
  // ------------------------------------------------------------------ actions
  setDuration(e) {
    !Number.isFinite(e) || e <= 0 || (this.totalSeconds = Math.round(e * 60), (this.phase === "idle" || this.phase === "finished") && (this.phase = "idle", this.deadlineAt = null, this.pausedElapsed = 0), this.commit());
  }
  start() {
    this.firedReminderKeys.clear(), this.pausedElapsed = 0, this.deadlineAt = Date.now() + this.totalSeconds * 1e3, this.phase = "running", this.startTicking(), this.commit();
  }
  pause() {
    this.phase === "running" && (this.pausedElapsed = this.elapsedSeconds(), this.deadlineAt = null, this.phase = "paused", this.stopTicking(), this.commit());
  }
  resume() {
    if (this.phase !== "paused") return;
    const e = Math.max(0, this.totalSeconds - this.pausedElapsed);
    this.deadlineAt = Date.now() + e * 1e3, this.phase = "running", this.startTicking(), this.commit();
  }
  reset() {
    this.stopTicking(), this.phase = "idle", this.deadlineAt = null, this.pausedElapsed = 0, this.activeReminderId = null, this.firedReminderKeys.clear(), this.commit();
  }
  addReminder(e, i) {
    const t = e.trim();
    !t || !Number.isFinite(i) || i <= 0 || (this.reminders = [
      ...this.reminders,
      {
        // crypto.randomUUID is available in the renderer; no dependency needed.
        id: crypto.randomUUID(),
        label: t,
        intervalMinutes: Math.round(i)
      }
    ], this.commit());
  }
  removeReminder(e) {
    this.reminders = this.reminders.filter((i) => i.id !== e), this.commit();
  }
  dismissReminder() {
    if (this.phase !== "reminding") return;
    this.activeReminderId = null;
    const e = Math.max(0, this.totalSeconds - this.pausedElapsed);
    this.deadlineAt = Date.now() + e * 1e3, this.phase = "running", this.startTicking(), this.commit();
  }
  setInheritTheme(e) {
    this.inheritTheme = e, this.commit();
  }
  // ------------------------------------------------------------------ internals
  elapsedSeconds() {
    if (this.deadlineAt == null) return this.pausedElapsed;
    const e = Math.max(0, Math.ceil((this.deadlineAt - Date.now()) / 1e3));
    return this.totalSeconds - e;
  }
  remainingSeconds() {
    return this.phase === "idle" ? this.totalSeconds : this.deadlineAt == null ? Math.max(0, this.totalSeconds - this.pausedElapsed) : Math.max(0, Math.ceil((this.deadlineAt - Date.now()) / 1e3));
  }
  startTicking() {
    this.stopTicking(), this.interval = setInterval(() => this.tick(), c);
  }
  stopTicking() {
    this.interval != null && (clearInterval(this.interval), this.interval = null);
  }
  tick() {
    if (this.phase !== "running") return;
    const e = this.remainingSeconds();
    if (e <= 0) {
      this.stopTicking(), this.phase = "finished", this.deadlineAt = null, this.host.notify("Focus session complete"), this.commit();
      return;
    }
    const i = this.dueReminder();
    if (i) {
      this.pausedElapsed = this.elapsedSeconds(), this.deadlineAt = null, this.stopTicking(), this.activeReminderId = i.id, this.phase = "reminding", this.host.notify(`Reminder: ${i.label}`), this.commit();
      return;
    }
    this.cachedSnapshot?.remainingSeconds !== e && this.emit();
  }
  /**
   * WHY reminders are keyed by (id, interval-ordinal) rather than tested with
   * `elapsed % intervalSeconds === 0`: the modulo test only holds on the exact
   * second, and a throttled or delayed tick skips straight past it — the
   * original implementation could silently drop a reminder whenever the renderer
   * was backgrounded. Recording which ordinals have fired means a late tick
   * still fires the one it missed, exactly once.
   */
  dueReminder() {
    const e = this.elapsedSeconds();
    for (const i of this.reminders) {
      const t = i.intervalMinutes * 60;
      if (t <= 0) continue;
      const n = Math.floor(e / t);
      if (n < 1) continue;
      const h = `${i.id}:${n}`;
      if (!this.firedReminderKeys.has(h))
        return this.firedReminderKeys.add(h), i;
    }
    return null;
  }
  persisted() {
    return {
      version: 2,
      phase: this.phase,
      totalSeconds: this.totalSeconds,
      reminders: this.reminders,
      firedReminderKeys: [...this.firedReminderKeys],
      inheritTheme: this.inheritTheme,
      deadlineAt: this.deadlineAt,
      pausedElapsedSeconds: this.phase === "paused" || this.phase === "reminding" ? this.pausedElapsed : null,
      activeReminderId: this.activeReminderId
    };
  }
  /** Emit + persist. Used for transitions; plain ticks only emit, because
   *  writing to disk four times a second would be absurd and the deadline is
   *  already durable. */
  commit() {
    this.host.save(this.persisted()), this.emit();
  }
  emit() {
    this.cachedSnapshot = null;
    const e = this.snapshot();
    for (const i of this.listeners)
      try {
        i(e);
      } catch {
      }
  }
}
const d = "session", u = "timer.defaultMinutes", o = "timer.inheritTheme";
let r = null;
function p(s) {
  if (!s || typeof s != "object" || Array.isArray(s))
    throw new Error("Timer actions must be JSON objects.");
  return s;
}
function f(s) {
  const e = p(s);
  switch (e.type) {
    case "setDuration":
      if (typeof e.minutes == "number" && Number.isFinite(e.minutes) && e.minutes >= 1 && e.minutes <= 480)
        return { type: e.type, minutes: e.minutes };
      break;
    case "addReminder":
      if (typeof e.label == "string" && e.label.trim().length > 0 && e.label.length <= 80 && typeof e.intervalMinutes == "number" && Number.isInteger(e.intervalMinutes) && e.intervalMinutes >= 1 && e.intervalMinutes <= 480)
        return {
          type: e.type,
          label: e.label,
          intervalMinutes: e.intervalMinutes
        };
      break;
    case "removeReminder":
      if (typeof e.id == "string" && e.id.length > 0)
        return { type: e.type, id: e.id };
      break;
    case "setInheritTheme":
      if (typeof e.value == "boolean") return { type: e.type, value: e.value };
      break;
    case "start":
    case "pause":
    case "resume":
    case "reset":
    case "dismissReminder":
    case "syncSettings":
      return { type: e.type };
  }
  throw new Error("Invalid timer action.");
}
async function a(s, e) {
  const [i, t] = await Promise.all([
    s.api.storage.get(u),
    s.api.storage.get(o)
  ]);
  e.snapshot().phase === "idle" && typeof i == "number" && Number.isFinite(i) && i >= 1 && i <= 480 && e.setDuration(i), typeof t == "boolean" && e.setInheritTheme(t);
}
async function g(s, e, i) {
  const t = f(i);
  switch (t.type) {
    case "setDuration":
      e.setDuration(t.minutes);
      break;
    case "start":
      e.start();
      break;
    case "pause":
      e.pause();
      break;
    case "resume":
      e.resume();
      break;
    case "reset":
      e.reset();
      break;
    case "addReminder":
      e.addReminder(t.label, t.intervalMinutes);
      break;
    case "removeReminder":
      e.removeReminder(t.id);
      break;
    case "dismissReminder":
      e.dismissReminder();
      break;
    case "syncSettings":
      await a(s, e);
      break;
    case "setInheritTheme":
      await s.api.storage.set(o, t.value), e.setInheritTheme(t.value);
      break;
  }
  return e.snapshot();
}
const v = l({
  async activate(s) {
    const e = new m({
      // Persistence and notification failures should not stop the clock that
      // produced them. Both services report independently through host status.
      save: (n) => {
        s.api.storage.set(d, n).catch(() => {
        });
      },
      notify: (n) => {
        s.api.notifications.show(n).catch(() => {
        });
      }
    });
    r = e;
    try {
      const n = await s.api.storage.get(d);
      e.restore(n);
    } catch {
    }
    await a(s, e).catch(() => {
    });
    const i = (n = e.snapshot()) => s.views.publish("timer.main", n), t = e.subscribe((n) => {
      i(n).catch(() => {
      });
    });
    s.subscriptions.push({ dispose: t }, { dispose: () => e.dispose() }), s.registerCommand("timer.start", async () => {
      await a(s, e).catch(() => {
      }), e.start();
    }), s.registerCommand("timer.pause", () => e.pause()), s.registerCommand("timer.reset", () => e.reset()), s.registerRequest("action", (n) => g(s, e, n)), await i();
  },
  deactivate() {
    r?.dispose(), r = null;
  }
});
export {
  v as default
};
