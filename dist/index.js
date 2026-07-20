const Cr = [880, 1046, 1174], Dr = 20, Mr = 2;
class Rr {
  context = null;
  /**
   * WHY the AudioContext is created per-play and closed on stop, rather than
   * created once and reused: a long-lived context keeps the audio hardware
   * awake, and this extension can sit idle for hours between reminders. Creating
   * one costs a few milliseconds at the exact moment we are already making
   * noise.
   */
  play() {
    this.stop();
    try {
      const t = new AudioContext();
      this.context = t;
      const n = (s, o) => {
        const r = t.createOscillator(), a = t.createGain();
        r.connect(a), a.connect(t.destination), r.type = "sine", r.frequency.value = o, a.gain.setValueAtTime(0.3, s), a.gain.exponentialRampToValueAtTime(0.01, s + 0.3), r.start(s), r.stop(s + 0.3);
      }, i = t.currentTime;
      for (let s = 0; s < Dr; s += 1) {
        const o = i + s * Mr;
        Cr.forEach((r, a) => n(o + a * 0.35, r));
      }
    } catch {
      this.context = null;
    }
  }
  stop() {
    this.context && (this.context.close().catch(() => {
    }), this.context = null);
  }
}
const Er = 250;
class kr {
  constructor(t) {
    this.host = t;
  }
  listeners = /* @__PURE__ */ new Set();
  interval = null;
  chime = new Rr();
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
  restore(t) {
    !t || t.version !== 1 || (this.totalSeconds = t.totalSeconds, this.reminders = t.reminders ?? [], this.firedReminderKeys = new Set(t.firedReminderKeys ?? []), this.inheritTheme = t.inheritTheme ?? !1, t.phase === "running" && t.deadlineAt != null ? t.deadlineAt > Date.now() ? (this.deadlineAt = t.deadlineAt, this.phase = "running", this.startTicking()) : (this.phase = "finished", this.deadlineAt = null) : t.phase === "paused" && t.pausedElapsedSeconds != null ? (this.pausedElapsed = t.pausedElapsedSeconds, this.phase = "paused") : t.phase === "finished" && (this.phase = "finished"), this.emit());
  }
  dispose() {
    this.stopTicking(), this.chime.stop(), this.listeners.clear();
  }
  // ------------------------------------------------------------- subscription
  subscribe(t) {
    return this.listeners.add(t), t(this.snapshot()), () => {
      this.listeners.delete(t);
    };
  }
  snapshot() {
    return {
      phase: this.phase,
      totalSeconds: this.totalSeconds,
      remainingSeconds: this.remainingSeconds(),
      reminders: this.reminders,
      activeReminderId: this.activeReminderId,
      firedReminderKeys: [...this.firedReminderKeys],
      inheritTheme: this.inheritTheme
    };
  }
  // ------------------------------------------------------------------ actions
  setDuration(t) {
    !Number.isFinite(t) || t <= 0 || (this.totalSeconds = Math.round(t * 60), (this.phase === "idle" || this.phase === "finished") && (this.phase = "idle", this.deadlineAt = null, this.pausedElapsed = 0), this.commit());
  }
  start() {
    this.firedReminderKeys.clear(), this.pausedElapsed = 0, this.deadlineAt = Date.now() + this.totalSeconds * 1e3, this.phase = "running", this.startTicking(), this.commit();
  }
  pause() {
    this.phase === "running" && (this.pausedElapsed = this.elapsedSeconds(), this.deadlineAt = null, this.phase = "paused", this.stopTicking(), this.commit());
  }
  resume() {
    if (this.phase !== "paused") return;
    const t = Math.max(0, this.totalSeconds - this.pausedElapsed);
    this.deadlineAt = Date.now() + t * 1e3, this.phase = "running", this.startTicking(), this.commit();
  }
  reset() {
    this.stopTicking(), this.chime.stop(), this.phase = "idle", this.deadlineAt = null, this.pausedElapsed = 0, this.activeReminderId = null, this.firedReminderKeys.clear(), this.commit();
  }
  addReminder(t, n) {
    const i = t.trim();
    !i || !Number.isFinite(n) || n <= 0 || (this.reminders = [
      ...this.reminders,
      {
        // crypto.randomUUID is available in the renderer; no dependency needed.
        id: crypto.randomUUID(),
        label: i,
        intervalMinutes: Math.round(n)
      }
    ], this.commit());
  }
  removeReminder(t) {
    this.reminders = this.reminders.filter((n) => n.id !== t), this.commit();
  }
  dismissReminder() {
    if (this.phase !== "reminding") return;
    this.chime.stop(), this.activeReminderId = null;
    const t = Math.max(0, this.totalSeconds - this.pausedElapsed);
    this.deadlineAt = Date.now() + t * 1e3, this.phase = "running", this.startTicking(), this.commit();
  }
  setInheritTheme(t) {
    this.inheritTheme = t, this.commit();
  }
  // ------------------------------------------------------------------ internals
  elapsedSeconds() {
    if (this.deadlineAt == null) return this.pausedElapsed;
    const t = Math.max(0, Math.ceil((this.deadlineAt - Date.now()) / 1e3));
    return this.totalSeconds - t;
  }
  remainingSeconds() {
    return this.phase === "idle" ? this.totalSeconds : this.deadlineAt == null ? Math.max(0, this.totalSeconds - this.pausedElapsed) : Math.max(0, Math.ceil((this.deadlineAt - Date.now()) / 1e3));
  }
  startTicking() {
    this.stopTicking(), this.interval = setInterval(() => this.tick(), Er);
  }
  stopTicking() {
    this.interval != null && (clearInterval(this.interval), this.interval = null);
  }
  tick() {
    if (this.phase !== "running") return;
    if (this.remainingSeconds() <= 0) {
      this.stopTicking(), this.phase = "finished", this.deadlineAt = null, this.host.notify("Focus session complete"), this.chime.play(), this.commit();
      return;
    }
    const n = this.dueReminder();
    if (n) {
      this.pausedElapsed = this.elapsedSeconds(), this.deadlineAt = null, this.stopTicking(), this.activeReminderId = n.id, this.phase = "reminding", this.chime.play(), this.host.notify(`Reminder: ${n.label}`), this.commit();
      return;
    }
    this.emit();
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
    const t = this.elapsedSeconds();
    for (const n of this.reminders) {
      const i = n.intervalMinutes * 60;
      if (i <= 0) continue;
      const s = Math.floor(t / i);
      if (s < 1) continue;
      const o = `${n.id}:${s}`;
      if (!this.firedReminderKeys.has(o))
        return this.firedReminderKeys.add(o), n;
    }
    return null;
  }
  persisted() {
    return {
      version: 1,
      phase: this.phase,
      totalSeconds: this.totalSeconds,
      reminders: this.reminders,
      firedReminderKeys: [...this.firedReminderKeys],
      inheritTheme: this.inheritTheme,
      deadlineAt: this.deadlineAt,
      pausedElapsedSeconds: this.phase === "paused" ? this.pausedElapsed : null
    };
  }
  /** Emit + persist. Used for transitions; plain ticks only emit, because
   *  writing to disk four times a second would be absurd and the deadline is
   *  already durable. */
  commit() {
    this.host.save(this.persisted()), this.emit();
  }
  emit() {
    const t = this.snapshot();
    for (const n of this.listeners)
      try {
        n(t);
      } catch {
      }
  }
}
const Lr = '.agent-code-timer{--tm-bg: #000000;--tm-surface: #0d0d0d;--tm-fg: #ffffff;--tm-dim: #8a8a8a;--tm-faint: #4a4a4a;--tm-border: #262626;--tm-accent: #ffffff;--tm-accent-fg: #000000;--tm-radius: 14px;--tm-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;--tm-font-digit: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;position:relative;display:flex;flex-direction:column;align-items:center;gap:28px;padding:34px 32px 30px;background:var(--tm-bg);color:var(--tm-fg);font-family:var(--tm-font);margin:-1px;border-radius:inherit}.agent-code-timer *,.agent-code-timer *:before,.agent-code-timer *:after{box-sizing:border-box}.agent-code-timer button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;padding:0;outline:none}.agent-code-timer input{font-family:inherit;outline:none}.tm-clock{position:absolute;top:14px;left:18px;font-size:15px;font-weight:300;letter-spacing:-.01em;color:var(--tm-dim);transition:opacity .35s ease;user-select:none}.tm-clock[data-dimmed=true]{opacity:.15}.tm-digits{font-family:var(--tm-font-digit);font-size:72px;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em;user-select:none;transition:color .5s ease}.tm-digits[data-state=idle]{color:var(--tm-dim)}.tm-digits[data-state=finished]{color:var(--tm-faint)}.tm-label{font-size:11px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:var(--tm-dim)}.tm-presets{display:flex;flex-wrap:wrap;justify-content:center;gap:7px}.tm-preset{border-radius:999px;padding:7px 15px;font-size:13px;font-weight:500;background:var(--tm-surface);color:var(--tm-dim);border:1px solid var(--tm-border);transition:all .18s ease}.tm-preset:hover{color:var(--tm-fg)}.tm-preset[data-selected=true]{background:var(--tm-accent);color:var(--tm-accent-fg);border-color:var(--tm-accent)}.tm-custom{width:108px;border-radius:10px;border:1px solid var(--tm-border);background:var(--tm-surface);color:var(--tm-fg);padding:8px 12px;text-align:center;font-size:13px}.tm-custom::placeholder{color:var(--tm-faint)}.tm-row{display:flex;align-items:center;gap:10px}.tm-primary{border-radius:999px;padding:11px 34px;font-size:14px;font-weight:500;background:var(--tm-accent);color:var(--tm-accent-fg);transition:opacity .18s ease,transform .12s ease}.tm-primary:hover{opacity:.88}.tm-primary:active{transform:scale(.97)}.tm-circle{width:46px;height:46px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:var(--tm-surface);border:1px solid var(--tm-border);color:var(--tm-fg);transition:background .18s ease,transform .12s ease}.tm-circle:hover{background:var(--tm-border)}.tm-circle:active{transform:scale(.95)}.tm-ghost{font-size:12px;color:var(--tm-dim);transition:color .18s ease}.tm-ghost:hover{color:var(--tm-fg)}.tm-reminders{width:100%;max-width:330px}.tm-reminders-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.tm-reminder{display:flex;align-items:center;justify-content:space-between;padding:10px 13px;border-radius:var(--tm-radius);background:var(--tm-surface);border:1px solid var(--tm-border);margin-bottom:6px}.tm-reminder-label{font-size:13px;color:var(--tm-fg)}.tm-reminder-sub{font-size:11px;color:var(--tm-dim)}.tm-add{display:flex;flex-direction:column;gap:8px;padding:13px;border-radius:var(--tm-radius);background:var(--tm-surface);border:1px solid var(--tm-border);margin-bottom:8px}.tm-add input{border-radius:9px;border:1px solid var(--tm-border);background:var(--tm-bg);color:var(--tm-fg);padding:7px 10px;font-size:13px}.tm-chip{font-size:11px;color:var(--tm-dim);background:var(--tm-surface);border:1px solid var(--tm-border);border-radius:999px;padding:4px 11px}.tm-alert{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--tm-bg) 88%,transparent);backdrop-filter:blur(6px);border-radius:inherit}.tm-alert-card{display:flex;flex-direction:column;align-items:center;gap:18px;padding:32px 36px;border-radius:22px;background:var(--tm-surface);border:1px solid var(--tm-border);max-width:300px;text-align:center}.tm-alert-icon{width:56px;height:56px;border-radius:999px;background:var(--tm-accent);color:var(--tm-accent-fg);display:flex;align-items:center;justify-content:center;font-size:26px}.tm-footer{display:flex;align-items:center;justify-content:center;gap:8px;padding-top:2px}.tm-toggle{display:inline-flex;align-items:center;gap:7px;font-size:11px;color:var(--tm-faint);transition:color .18s ease}.tm-toggle:hover{color:var(--tm-dim)}.tm-toggle-dot{width:7px;height:7px;border-radius:999px;border:1px solid currentColor}.tm-toggle[data-on=true] .tm-toggle-dot{background:currentColor}', Ve = "agent-code-timer-styles";
function Fr() {
  if (document.getElementById(Ve)) return;
  const e = document.createElement("style");
  e.id = Ve, e.textContent = Lr, document.head.append(e);
}
function Ir() {
  document.getElementById(Ve)?.remove();
}
function ze() {
  const e = globalThis.__agentCodeHost;
  if (!e)
    throw new Error(
      "agent-code-timer: globalThis.__agentCodeHost is missing. This bundle only runs inside Agent Code (API v1 or later)."
    );
  return e;
}
const Ft = ze().jsxRuntime, b = Ft.jsx, E = Ft.jsxs;
Ft.jsxDEV ?? Ft.jsx;
const Br = Ft.Fragment, jr = ze().reactDom, { createRoot: Or, hydrateRoot: _u } = jr, Nr = ze().react, {
  Children: Ur,
  Component: Hi,
  Fragment: Xi,
  Profiler: $u,
  PureComponent: zu,
  StrictMode: Wu,
  Suspense: Gu,
  cloneElement: Kr,
  createContext: Tt,
  createElement: Zt,
  createRef: Hu,
  forwardRef: We,
  isValidElement: _r,
  lazy: Xu,
  memo: Yu,
  startTransition: qu,
  useCallback: Ge,
  useContext: I,
  useDebugValue: Zu,
  useDeferredValue: Ju,
  useEffect: bt,
  useId: He,
  useImperativeHandle: Qu,
  useInsertionEffect: Yi,
  useLayoutEffect: $r,
  useMemo: ct,
  useReducer: th,
  useRef: Y,
  useState: tt,
  useSyncExternalStore: zr,
  useTransition: eh,
  version: nh
} = Nr, Xe = Tt({});
function Ye(e) {
  const t = Y(null);
  return t.current === null && (t.current = e()), t.current;
}
const re = Tt(null), qe = Tt({
  transformPagePoint: (e) => e,
  isStatic: !1,
  reducedMotion: "never"
});
class Wr extends Hi {
  getSnapshotBeforeUpdate(t) {
    const n = this.props.childRef.current;
    if (n && t.isPresent && !this.props.isPresent) {
      const i = this.props.sizeRef.current;
      i.height = n.offsetHeight || 0, i.width = n.offsetWidth || 0, i.top = n.offsetTop, i.left = n.offsetLeft;
    }
    return null;
  }
  /**
   * Required with getSnapshotBeforeUpdate to stop React complaining.
   */
  componentDidUpdate() {
  }
  render() {
    return this.props.children;
  }
}
function Gr({ children: e, isPresent: t }) {
  const n = He(), i = Y(null), s = Y({
    width: 0,
    height: 0,
    top: 0,
    left: 0
  }), { nonce: o } = I(qe);
  return Yi(() => {
    const { width: r, height: a, top: l, left: c } = s.current;
    if (t || !i.current || !r || !a)
      return;
    i.current.dataset.motionPopId = n;
    const u = document.createElement("style");
    return o && (u.nonce = o), document.head.appendChild(u), u.sheet && u.sheet.insertRule(`
          [data-motion-pop-id="${n}"] {
            position: absolute !important;
            width: ${r}px !important;
            height: ${a}px !important;
            top: ${l}px !important;
            left: ${c}px !important;
          }
        `), () => {
      document.head.removeChild(u);
    };
  }, [t]), b(Wr, { isPresent: t, childRef: i, sizeRef: s, children: Kr(e, { ref: i }) });
}
const Hr = ({ children: e, initial: t, isPresent: n, onExitComplete: i, custom: s, presenceAffectsLayout: o, mode: r }) => {
  const a = Ye(Xr), l = He(), c = Ge((h) => {
    a.set(h, !0);
    for (const d of a.values())
      if (!d)
        return;
    i && i();
  }, [a, i]), u = ct(
    () => ({
      id: l,
      initial: t,
      isPresent: n,
      custom: s,
      onExitComplete: c,
      register: (h) => (a.set(h, !1), () => a.delete(h))
    }),
    /**
     * If the presence of a child affects the layout of the components around it,
     * we want to make a new context value to ensure they get re-rendered
     * so they can detect that layout change.
     */
    o ? [Math.random(), c] : [n, c]
  );
  return ct(() => {
    a.forEach((h, d) => a.set(d, !1));
  }, [n]), bt(() => {
    !n && !a.size && i && i();
  }, [n]), r === "popLayout" && (e = b(Gr, { isPresent: n, children: e })), b(re.Provider, { value: u, children: e });
};
function Xr() {
  return /* @__PURE__ */ new Map();
}
function qi(e = !0) {
  const t = I(re);
  if (t === null)
    return [!0, null];
  const { isPresent: n, onExitComplete: i, register: s } = t, o = He();
  bt(() => {
    e && s(o);
  }, [e]);
  const r = Ge(() => e && i && i(o), [o, i, e]);
  return !n && i ? [!1, r] : [!0];
}
const zt = (e) => e.key || "";
function En(e) {
  const t = [];
  return Ur.forEach(e, (n) => {
    _r(n) && t.push(n);
  }), t;
}
const Ze = typeof window < "u", Zi = Ze ? $r : bt, Ce = ({ children: e, custom: t, initial: n = !0, onExitComplete: i, presenceAffectsLayout: s = !0, mode: o = "sync", propagate: r = !1 }) => {
  const [a, l] = qi(r), c = ct(() => En(e), [e]), u = r && !a ? [] : c.map(zt), h = Y(!0), d = Y(c), f = Ye(() => /* @__PURE__ */ new Map()), [m, p] = tt(c), [y, g] = tt(c);
  Zi(() => {
    h.current = !1, d.current = c;
    for (let w = 0; w < y.length; w++) {
      const v = zt(y[w]);
      u.includes(v) ? f.delete(v) : f.get(v) !== !0 && f.set(v, !1);
    }
  }, [y, u.length, u.join("-")]);
  const x = [];
  if (c !== m) {
    let w = [...c];
    for (let v = 0; v < y.length; v++) {
      const A = y[v], M = zt(A);
      u.includes(M) || (w.splice(v, 0, A), x.push(A));
    }
    o === "wait" && x.length && (w = x), g(En(w)), p(c);
    return;
  }
  const { forceRender: T } = I(Xe);
  return b(Br, { children: y.map((w) => {
    const v = zt(w), A = r && !a ? !1 : c === y || u.includes(v), M = () => {
      if (f.has(v))
        f.set(v, !0);
      else
        return;
      let S = !0;
      f.forEach((L) => {
        L || (S = !1);
      }), S && (T?.(), g(d.current), r && l?.(), i && i());
    };
    return b(Hr, { isPresent: A, initial: !h.current || n ? void 0 : !1, custom: A ? void 0 : t, presenceAffectsLayout: s, mode: o, onExitComplete: A ? void 0 : M, children: w }, v);
  }) });
}, O = /* @__NO_SIDE_EFFECTS__ */ (e) => e;
let Ji = O;
// @__NO_SIDE_EFFECTS__
function Je(e) {
  let t;
  return () => (t === void 0 && (t = e()), t);
}
const yt = /* @__NO_SIDE_EFFECTS__ */ (e, t, n) => {
  const i = t - e;
  return i === 0 ? 1 : (n - e) / i;
}, q = /* @__NO_SIDE_EFFECTS__ */ (e) => e * 1e3, Z = /* @__NO_SIDE_EFFECTS__ */ (e) => e / 1e3, Yr = {
  useManualTiming: !1
};
function qr(e) {
  let t = /* @__PURE__ */ new Set(), n = /* @__PURE__ */ new Set(), i = !1, s = !1;
  const o = /* @__PURE__ */ new WeakSet();
  let r = {
    delta: 0,
    timestamp: 0,
    isProcessing: !1
  };
  function a(c) {
    o.has(c) && (l.schedule(c), e()), c(r);
  }
  const l = {
    /**
     * Schedule a process to run on the next frame.
     */
    schedule: (c, u = !1, h = !1) => {
      const f = h && i ? t : n;
      return u && o.add(c), f.has(c) || f.add(c), c;
    },
    /**
     * Cancel the provided callback from running on the next frame.
     */
    cancel: (c) => {
      n.delete(c), o.delete(c);
    },
    /**
     * Execute all schedule callbacks.
     */
    process: (c) => {
      if (r = c, i) {
        s = !0;
        return;
      }
      i = !0, [t, n] = [n, t], t.forEach(a), t.clear(), i = !1, s && (s = !1, l.process(c));
    }
  };
  return l;
}
const Wt = [
  "read",
  // Read
  "resolveKeyframes",
  // Write/Read/Write/Read
  "update",
  // Compute
  "preRender",
  // Compute
  "render",
  // Write
  "postRender"
  // Compute
], Zr = 40;
function Qi(e, t) {
  let n = !1, i = !0;
  const s = {
    delta: 0,
    timestamp: 0,
    isProcessing: !1
  }, o = () => n = !0, r = Wt.reduce((g, x) => (g[x] = qr(o), g), {}), { read: a, resolveKeyframes: l, update: c, preRender: u, render: h, postRender: d } = r, f = () => {
    const g = performance.now();
    n = !1, s.delta = i ? 1e3 / 60 : Math.max(Math.min(g - s.timestamp, Zr), 1), s.timestamp = g, s.isProcessing = !0, a.process(s), l.process(s), c.process(s), u.process(s), h.process(s), d.process(s), s.isProcessing = !1, n && t && (i = !1, e(f));
  }, m = () => {
    n = !0, i = !0, s.isProcessing || e(f);
  };
  return { schedule: Wt.reduce((g, x) => {
    const T = r[x];
    return g[x] = (w, v = !1, A = !1) => (n || m(), T.schedule(w, v, A)), g;
  }, {}), cancel: (g) => {
    for (let x = 0; x < Wt.length; x++)
      r[Wt[x]].cancel(g);
  }, state: s, steps: r };
}
const { schedule: V, cancel: et, state: k, steps: fe } = Qi(typeof requestAnimationFrame < "u" ? requestAnimationFrame : O, !0), ts = Tt({ strict: !1 }), kn = {
  animation: [
    "animate",
    "variants",
    "whileHover",
    "whileTap",
    "exit",
    "whileInView",
    "whileFocus",
    "whileDrag"
  ],
  exit: ["exit"],
  drag: ["drag", "dragControls"],
  focus: ["whileFocus"],
  hover: ["whileHover", "onHoverStart", "onHoverEnd"],
  tap: ["whileTap", "onTap", "onTapStart", "onTapCancel"],
  pan: ["onPan", "onPanStart", "onPanSessionStart", "onPanEnd"],
  inView: ["whileInView", "onViewportEnter", "onViewportLeave"],
  layout: ["layout", "layoutId"]
}, vt = {};
for (const e in kn)
  vt[e] = {
    isEnabled: (t) => kn[e].some((n) => !!t[n])
  };
function Jr(e) {
  for (const t in e)
    vt[t] = {
      ...vt[t],
      ...e[t]
    };
}
const Qr = /* @__PURE__ */ new Set([
  "animate",
  "exit",
  "variants",
  "initial",
  "style",
  "values",
  "variants",
  "transition",
  "transformTemplate",
  "custom",
  "inherit",
  "onBeforeLayoutMeasure",
  "onAnimationStart",
  "onAnimationComplete",
  "onUpdate",
  "onDragStart",
  "onDrag",
  "onDragEnd",
  "onMeasureDragConstraints",
  "onDirectionLock",
  "onDragTransitionEnd",
  "_dragX",
  "_dragY",
  "onHoverStart",
  "onHoverEnd",
  "onViewportEnter",
  "onViewportLeave",
  "globalTapTarget",
  "ignoreStrict",
  "viewport"
]);
function Jt(e) {
  return e.startsWith("while") || e.startsWith("drag") && e !== "draggable" || e.startsWith("layout") || e.startsWith("onTap") || e.startsWith("onPan") || e.startsWith("onLayout") || Qr.has(e);
}
let es = (e) => !Jt(e);
function to(e) {
  e && (es = (t) => t.startsWith("on") ? !Jt(t) : e(t));
}
try {
  to(require("@emotion/is-prop-valid").default);
} catch {
}
function eo(e, t, n) {
  const i = {};
  for (const s in e)
    s === "values" && typeof e.values == "object" || (es(s) || n === !0 && Jt(s) || !t && !Jt(s) || // If trying to use native HTML drag events, forward drag listeners
    e.draggable && s.startsWith("onDrag")) && (i[s] = e[s]);
  return i;
}
function no(e) {
  if (typeof Proxy > "u")
    return e;
  const t = /* @__PURE__ */ new Map(), n = (...i) => e(...i);
  return new Proxy(n, {
    /**
     * Called when `motion` is referenced with a prop: `motion.div`, `motion.input` etc.
     * The prop name is passed through as `key` and we can use that to generate a `motion`
     * DOM component with that name.
     */
    get: (i, s) => s === "create" ? e : (t.has(s) || t.set(s, e(s)), t.get(s))
  });
}
const oe = Tt({});
function It(e) {
  return typeof e == "string" || Array.isArray(e);
}
function ae(e) {
  return e !== null && typeof e == "object" && typeof e.start == "function";
}
const Qe = [
  "animate",
  "whileInView",
  "whileFocus",
  "whileHover",
  "whileTap",
  "whileDrag",
  "exit"
], tn = ["initial", ...Qe];
function le(e) {
  return ae(e.animate) || tn.some((t) => It(e[t]));
}
function ns(e) {
  return !!(le(e) || e.variants);
}
function io(e, t) {
  if (le(e)) {
    const { initial: n, animate: i } = e;
    return {
      initial: n === !1 || It(n) ? n : void 0,
      animate: It(i) ? i : void 0
    };
  }
  return e.inherit !== !1 ? t : {};
}
function so(e) {
  const { initial: t, animate: n } = io(e, I(oe));
  return ct(() => ({ initial: t, animate: n }), [Ln(t), Ln(n)]);
}
function Ln(e) {
  return Array.isArray(e) ? e.join(" ") : e;
}
const ro = Symbol.for("motionComponentSymbol");
function dt(e) {
  return e && typeof e == "object" && Object.prototype.hasOwnProperty.call(e, "current");
}
function oo(e, t, n) {
  return Ge(
    (i) => {
      i && e.onMount && e.onMount(i), t && (i ? t.mount(i) : t.unmount()), n && (typeof n == "function" ? n(i) : dt(n) && (n.current = i));
    },
    /**
     * Only pass a new ref callback to React if we've received a visual element
     * factory. Otherwise we'll be mounting/remounting every time externalRef
     * or other dependencies change.
     */
    [t]
  );
}
const en = (e) => e.replace(/([a-z])([A-Z])/gu, "$1-$2").toLowerCase(), ao = "framerAppearId", is = "data-" + en(ao), { schedule: nn } = Qi(queueMicrotask, !1), ss = Tt({});
function lo(e, t, n, i, s) {
  var o, r;
  const { visualElement: a } = I(oe), l = I(ts), c = I(re), u = I(qe).reducedMotion, h = Y(null);
  i = i || l.renderer, !h.current && i && (h.current = i(e, {
    visualState: t,
    parent: a,
    props: n,
    presenceContext: c,
    blockInitialAnimation: c ? c.initial === !1 : !1,
    reducedMotionConfig: u
  }));
  const d = h.current, f = I(ss);
  d && !d.projection && s && (d.type === "html" || d.type === "svg") && co(h.current, n, s, f);
  const m = Y(!1);
  Yi(() => {
    d && m.current && d.update(n, c);
  });
  const p = n[is], y = Y(!!p && !(!((o = window.MotionHandoffIsComplete) === null || o === void 0) && o.call(window, p)) && ((r = window.MotionHasOptimisedAnimation) === null || r === void 0 ? void 0 : r.call(window, p)));
  return Zi(() => {
    d && (m.current = !0, window.MotionIsMounted = !0, d.updateFeatures(), nn.render(d.render), y.current && d.animationState && d.animationState.animateChanges());
  }), bt(() => {
    d && (!y.current && d.animationState && d.animationState.animateChanges(), y.current && (queueMicrotask(() => {
      var g;
      (g = window.MotionHandoffMarkAsComplete) === null || g === void 0 || g.call(window, p);
    }), y.current = !1));
  }), d;
}
function co(e, t, n, i) {
  const { layoutId: s, layout: o, drag: r, dragConstraints: a, layoutScroll: l, layoutRoot: c } = t;
  e.projection = new n(e.latestValues, t["data-framer-portal-id"] ? void 0 : rs(e.parent)), e.projection.setOptions({
    layoutId: s,
    layout: o,
    alwaysMeasureLayout: !!r || a && dt(a),
    visualElement: e,
    /**
     * TODO: Update options in an effect. This could be tricky as it'll be too late
     * to update by the time layout animations run.
     * We also need to fix this safeToRemove by linking it up to the one returned by usePresence,
     * ensuring it gets called if there's no potential layout animations.
     *
     */
    animationType: typeof o == "string" ? o : "both",
    initialPromotionConfig: i,
    layoutScroll: l,
    layoutRoot: c
  });
}
function rs(e) {
  if (e)
    return e.options.allowProjection !== !1 ? e.projection : rs(e.parent);
}
function uo({ preloadedFeatures: e, createVisualElement: t, useRender: n, useVisualState: i, Component: s }) {
  var o, r;
  e && Jr(e);
  function a(c, u) {
    let h;
    const d = {
      ...I(qe),
      ...c,
      layoutId: ho(c)
    }, { isStatic: f } = d, m = so(c), p = i(c, f);
    if (!f && Ze) {
      fo();
      const y = mo(d);
      h = y.MeasureLayout, m.visualElement = lo(s, p, d, t, y.ProjectionNode);
    }
    return E(oe.Provider, { value: m, children: [h && m.visualElement ? b(h, { visualElement: m.visualElement, ...d }) : null, n(s, c, oo(p, m.visualElement, u), p, f, m.visualElement)] });
  }
  a.displayName = `motion.${typeof s == "string" ? s : `create(${(r = (o = s.displayName) !== null && o !== void 0 ? o : s.name) !== null && r !== void 0 ? r : ""})`}`;
  const l = We(a);
  return l[ro] = s, l;
}
function ho({ layoutId: e }) {
  const t = I(Xe).id;
  return t && e !== void 0 ? t + "-" + e : e;
}
function fo(e, t) {
  I(ts).strict;
}
function mo(e) {
  const { drag: t, layout: n } = vt;
  if (!t && !n)
    return {};
  const i = { ...t, ...n };
  return {
    MeasureLayout: t?.isEnabled(e) || n?.isEnabled(e) ? i.MeasureLayout : void 0,
    ProjectionNode: i.ProjectionNode
  };
}
const po = [
  "animate",
  "circle",
  "defs",
  "desc",
  "ellipse",
  "g",
  "image",
  "line",
  "filter",
  "marker",
  "mask",
  "metadata",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "rect",
  "stop",
  "switch",
  "symbol",
  "svg",
  "text",
  "tspan",
  "use",
  "view"
];
function sn(e) {
  return (
    /**
     * If it's not a string, it's a custom React component. Currently we only support
     * HTML custom React components.
     */
    typeof e != "string" || /**
     * If it contains a dash, the element is a custom HTML webcomponent.
     */
    e.includes("-") ? !1 : (
      /**
       * If it's in our list of lowercase SVG tags, it's an SVG component
       */
      !!(po.indexOf(e) > -1 || /**
       * If it contains a capital letter, it's an SVG component
       */
      /[A-Z]/u.test(e))
    )
  );
}
function Fn(e) {
  const t = [{}, {}];
  return e?.values.forEach((n, i) => {
    t[0][i] = n.get(), t[1][i] = n.getVelocity();
  }), t;
}
function rn(e, t, n, i) {
  if (typeof t == "function") {
    const [s, o] = Fn(i);
    t = t(n !== void 0 ? n : e.custom, s, o);
  }
  if (typeof t == "string" && (t = e.variants && e.variants[t]), typeof t == "function") {
    const [s, o] = Fn(i);
    t = t(n !== void 0 ? n : e.custom, s, o);
  }
  return t;
}
const De = (e) => Array.isArray(e), go = (e) => !!(e && typeof e == "object" && e.mix && e.toValue), yo = (e) => De(e) ? e[e.length - 1] || 0 : e, B = (e) => !!(e && e.getVelocity);
function Xt(e) {
  const t = B(e) ? e.get() : e;
  return go(t) ? t.toValue() : t;
}
function vo({ scrapeMotionValuesFromProps: e, createRenderState: t, onUpdate: n }, i, s, o) {
  const r = {
    latestValues: xo(i, s, o, e),
    renderState: t()
  };
  return n && (r.onMount = (a) => n({ props: i, current: a, ...r }), r.onUpdate = (a) => n(a)), r;
}
const os = (e) => (t, n) => {
  const i = I(oe), s = I(re), o = () => vo(e, t, i, s);
  return n ? o() : Ye(o);
};
function xo(e, t, n, i) {
  const s = {}, o = i(e, {});
  for (const d in o)
    s[d] = Xt(o[d]);
  let { initial: r, animate: a } = e;
  const l = le(e), c = ns(e);
  t && c && !l && e.inherit !== !1 && (r === void 0 && (r = t.initial), a === void 0 && (a = t.animate));
  let u = n ? n.initial === !1 : !1;
  u = u || r === !1;
  const h = u ? a : r;
  if (h && typeof h != "boolean" && !ae(h)) {
    const d = Array.isArray(h) ? h : [h];
    for (let f = 0; f < d.length; f++) {
      const m = rn(e, d[f]);
      if (m) {
        const { transitionEnd: p, transition: y, ...g } = m;
        for (const x in g) {
          let T = g[x];
          if (Array.isArray(T)) {
            const w = u ? T.length - 1 : 0;
            T = T[w];
          }
          T !== null && (s[x] = T);
        }
        for (const x in p)
          s[x] = p[x];
      }
    }
  }
  return s;
}
const Pt = [
  "transformPerspective",
  "x",
  "y",
  "z",
  "translateX",
  "translateY",
  "translateZ",
  "scale",
  "scaleX",
  "scaleY",
  "rotate",
  "rotateX",
  "rotateY",
  "rotateZ",
  "skew",
  "skewX",
  "skewY"
], ut = new Set(Pt), as = (e) => (t) => typeof t == "string" && t.startsWith(e), ls = /* @__PURE__ */ as("--"), To = /* @__PURE__ */ as("var(--"), on = (e) => To(e) ? bo.test(e.split("/*")[0].trim()) : !1, bo = /var\(--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)$/iu, cs = (e, t) => t && typeof e == "number" ? t.transform(e) : e, J = (e, t, n) => n > t ? t : n < e ? e : n, St = {
  test: (e) => typeof e == "number",
  parse: parseFloat,
  transform: (e) => e
}, Bt = {
  ...St,
  transform: (e) => J(0, 1, e)
}, Gt = {
  ...St,
  default: 1
}, Ut = (e) => ({
  test: (t) => typeof t == "string" && t.endsWith(e) && t.split(" ").length === 1,
  parse: parseFloat,
  transform: (t) => `${t}${e}`
}), Q = /* @__PURE__ */ Ut("deg"), W = /* @__PURE__ */ Ut("%"), P = /* @__PURE__ */ Ut("px"), Po = /* @__PURE__ */ Ut("vh"), So = /* @__PURE__ */ Ut("vw"), In = {
  ...W,
  parse: (e) => W.parse(e) / 100,
  transform: (e) => W.transform(e * 100)
}, wo = {
  // Border props
  borderWidth: P,
  borderTopWidth: P,
  borderRightWidth: P,
  borderBottomWidth: P,
  borderLeftWidth: P,
  borderRadius: P,
  radius: P,
  borderTopLeftRadius: P,
  borderTopRightRadius: P,
  borderBottomRightRadius: P,
  borderBottomLeftRadius: P,
  // Positioning props
  width: P,
  maxWidth: P,
  height: P,
  maxHeight: P,
  top: P,
  right: P,
  bottom: P,
  left: P,
  // Spacing props
  padding: P,
  paddingTop: P,
  paddingRight: P,
  paddingBottom: P,
  paddingLeft: P,
  margin: P,
  marginTop: P,
  marginRight: P,
  marginBottom: P,
  marginLeft: P,
  // Misc
  backgroundPositionX: P,
  backgroundPositionY: P
}, Ao = {
  rotate: Q,
  rotateX: Q,
  rotateY: Q,
  rotateZ: Q,
  scale: Gt,
  scaleX: Gt,
  scaleY: Gt,
  scaleZ: Gt,
  skew: Q,
  skewX: Q,
  skewY: Q,
  distance: P,
  translateX: P,
  translateY: P,
  translateZ: P,
  x: P,
  y: P,
  z: P,
  perspective: P,
  transformPerspective: P,
  opacity: Bt,
  originX: In,
  originY: In,
  originZ: P
}, Bn = {
  ...St,
  transform: Math.round
}, an = {
  ...wo,
  ...Ao,
  zIndex: Bn,
  size: P,
  // SVG
  fillOpacity: Bt,
  strokeOpacity: Bt,
  numOctaves: Bn
}, Vo = {
  x: "translateX",
  y: "translateY",
  z: "translateZ",
  transformPerspective: "perspective"
}, Co = Pt.length;
function Do(e, t, n) {
  let i = "", s = !0;
  for (let o = 0; o < Co; o++) {
    const r = Pt[o], a = e[r];
    if (a === void 0)
      continue;
    let l = !0;
    if (typeof a == "number" ? l = a === (r.startsWith("scale") ? 1 : 0) : l = parseFloat(a) === 0, !l || n) {
      const c = cs(a, an[r]);
      if (!l) {
        s = !1;
        const u = Vo[r] || r;
        i += `${u}(${c}) `;
      }
      n && (t[r] = c);
    }
  }
  return i = i.trim(), n ? i = n(t, s ? "" : i) : s && (i = "none"), i;
}
function ln(e, t, n) {
  const { style: i, vars: s, transformOrigin: o } = e;
  let r = !1, a = !1;
  for (const l in t) {
    const c = t[l];
    if (ut.has(l)) {
      r = !0;
      continue;
    } else if (ls(l)) {
      s[l] = c;
      continue;
    } else {
      const u = cs(c, an[l]);
      l.startsWith("origin") ? (a = !0, o[l] = u) : i[l] = u;
    }
  }
  if (t.transform || (r || n ? i.transform = Do(t, e.transform, n) : i.transform && (i.transform = "none")), a) {
    const { originX: l = "50%", originY: c = "50%", originZ: u = 0 } = o;
    i.transformOrigin = `${l} ${c} ${u}`;
  }
}
const Mo = {
  offset: "stroke-dashoffset",
  array: "stroke-dasharray"
}, Ro = {
  offset: "strokeDashoffset",
  array: "strokeDasharray"
};
function Eo(e, t, n = 1, i = 0, s = !0) {
  e.pathLength = 1;
  const o = s ? Mo : Ro;
  e[o.offset] = P.transform(-i);
  const r = P.transform(t), a = P.transform(n);
  e[o.array] = `${r} ${a}`;
}
function jn(e, t, n) {
  return typeof e == "string" ? e : P.transform(t + n * e);
}
function ko(e, t, n) {
  const i = jn(t, e.x, e.width), s = jn(n, e.y, e.height);
  return `${i} ${s}`;
}
function cn(e, {
  attrX: t,
  attrY: n,
  attrScale: i,
  originX: s,
  originY: o,
  pathLength: r,
  pathSpacing: a = 1,
  pathOffset: l = 0,
  // This is object creation, which we try to avoid per-frame.
  ...c
}, u, h) {
  if (ln(e, c, h), u) {
    e.style.viewBox && (e.attrs.viewBox = e.style.viewBox);
    return;
  }
  e.attrs = e.style, e.style = {};
  const { attrs: d, style: f, dimensions: m } = e;
  d.transform && (m && (f.transform = d.transform), delete d.transform), m && (s !== void 0 || o !== void 0 || f.transform) && (f.transformOrigin = ko(m, s !== void 0 ? s : 0.5, o !== void 0 ? o : 0.5)), t !== void 0 && (d.x = t), n !== void 0 && (d.y = n), i !== void 0 && (d.scale = i), r !== void 0 && Eo(d, r, a, l, !1);
}
const un = () => ({
  style: {},
  transform: {},
  transformOrigin: {},
  vars: {}
}), us = () => ({
  ...un(),
  attrs: {}
}), hn = (e) => typeof e == "string" && e.toLowerCase() === "svg";
function hs(e, { style: t, vars: n }, i, s) {
  Object.assign(e.style, t, s && s.getProjectionStyles(i));
  for (const o in n)
    e.style.setProperty(o, n[o]);
}
const ds = /* @__PURE__ */ new Set([
  "baseFrequency",
  "diffuseConstant",
  "kernelMatrix",
  "kernelUnitLength",
  "keySplines",
  "keyTimes",
  "limitingConeAngle",
  "markerHeight",
  "markerWidth",
  "numOctaves",
  "targetX",
  "targetY",
  "surfaceScale",
  "specularConstant",
  "specularExponent",
  "stdDeviation",
  "tableValues",
  "viewBox",
  "gradientTransform",
  "pathLength",
  "startOffset",
  "textLength",
  "lengthAdjust"
]);
function fs(e, t, n, i) {
  hs(e, t, void 0, i);
  for (const s in t.attrs)
    e.setAttribute(ds.has(s) ? s : en(s), t.attrs[s]);
}
const Qt = {};
function Lo(e) {
  Object.assign(Qt, e);
}
function ms(e, { layout: t, layoutId: n }) {
  return ut.has(e) || e.startsWith("origin") || (t || n !== void 0) && (!!Qt[e] || e === "opacity");
}
function dn(e, t, n) {
  var i;
  const { style: s } = e, o = {};
  for (const r in s)
    (B(s[r]) || t.style && B(t.style[r]) || ms(r, e) || ((i = n?.getValue(r)) === null || i === void 0 ? void 0 : i.liveStyle) !== void 0) && (o[r] = s[r]);
  return o;
}
function ps(e, t, n) {
  const i = dn(e, t, n);
  for (const s in e)
    if (B(e[s]) || B(t[s])) {
      const o = Pt.indexOf(s) !== -1 ? "attr" + s.charAt(0).toUpperCase() + s.substring(1) : s;
      i[o] = e[s];
    }
  return i;
}
function Fo(e, t) {
  try {
    t.dimensions = typeof e.getBBox == "function" ? e.getBBox() : e.getBoundingClientRect();
  } catch {
    t.dimensions = {
      x: 0,
      y: 0,
      width: 0,
      height: 0
    };
  }
}
const On = ["x", "y", "width", "height", "cx", "cy", "r"], Io = {
  useVisualState: os({
    scrapeMotionValuesFromProps: ps,
    createRenderState: us,
    onUpdate: ({ props: e, prevProps: t, current: n, renderState: i, latestValues: s }) => {
      if (!n)
        return;
      let o = !!e.drag;
      if (!o) {
        for (const a in s)
          if (ut.has(a)) {
            o = !0;
            break;
          }
      }
      if (!o)
        return;
      let r = !t;
      if (t)
        for (let a = 0; a < On.length; a++) {
          const l = On[a];
          e[l] !== t[l] && (r = !0);
        }
      r && V.read(() => {
        Fo(n, i), V.render(() => {
          cn(i, s, hn(n.tagName), e.transformTemplate), fs(n, i);
        });
      });
    }
  })
}, Bo = {
  useVisualState: os({
    scrapeMotionValuesFromProps: dn,
    createRenderState: un
  })
};
function gs(e, t, n) {
  for (const i in t)
    !B(t[i]) && !ms(i, n) && (e[i] = t[i]);
}
function jo({ transformTemplate: e }, t) {
  return ct(() => {
    const n = un();
    return ln(n, t, e), Object.assign({}, n.vars, n.style);
  }, [t]);
}
function Oo(e, t) {
  const n = e.style || {}, i = {};
  return gs(i, n, e), Object.assign(i, jo(e, t)), i;
}
function No(e, t) {
  const n = {}, i = Oo(e, t);
  return e.drag && e.dragListener !== !1 && (n.draggable = !1, i.userSelect = i.WebkitUserSelect = i.WebkitTouchCallout = "none", i.touchAction = e.drag === !0 ? "none" : `pan-${e.drag === "x" ? "y" : "x"}`), e.tabIndex === void 0 && (e.onTap || e.onTapStart || e.whileTap) && (n.tabIndex = 0), n.style = i, n;
}
function Uo(e, t, n, i) {
  const s = ct(() => {
    const o = us();
    return cn(o, t, hn(i), e.transformTemplate), {
      ...o.attrs,
      style: { ...o.style }
    };
  }, [t]);
  if (e.style) {
    const o = {};
    gs(o, e.style, e), s.style = { ...o, ...s.style };
  }
  return s;
}
function Ko(e = !1) {
  return (n, i, s, { latestValues: o }, r) => {
    const l = (sn(n) ? Uo : No)(i, o, r, n), c = eo(i, typeof n == "string", e), u = n !== Xi ? { ...c, ...l, ref: s } : {}, { children: h } = i, d = ct(() => B(h) ? h.get() : h, [h]);
    return Zt(n, {
      ...u,
      children: d
    });
  };
}
function _o(e, t) {
  return function(i, { forwardMotionProps: s } = { forwardMotionProps: !1 }) {
    const r = {
      ...sn(i) ? Io : Bo,
      preloadedFeatures: e,
      useRender: Ko(s),
      createVisualElement: t,
      Component: i
    };
    return uo(r);
  };
}
function ys(e, t) {
  if (!Array.isArray(t))
    return !1;
  const n = t.length;
  if (n !== e.length)
    return !1;
  for (let i = 0; i < n; i++)
    if (t[i] !== e[i])
      return !1;
  return !0;
}
function ce(e, t, n) {
  const i = e.getProps();
  return rn(i, t, n !== void 0 ? n : i.custom, e);
}
const $o = /* @__PURE__ */ Je(() => window.ScrollTimeline !== void 0);
class zo {
  constructor(t) {
    this.stop = () => this.runAll("stop"), this.animations = t.filter(Boolean);
  }
  get finished() {
    return Promise.all(this.animations.map((t) => "finished" in t ? t.finished : t));
  }
  /**
   * TODO: Filter out cancelled or stopped animations before returning
   */
  getAll(t) {
    return this.animations[0][t];
  }
  setAll(t, n) {
    for (let i = 0; i < this.animations.length; i++)
      this.animations[i][t] = n;
  }
  attachTimeline(t, n) {
    const i = this.animations.map((s) => {
      if ($o() && s.attachTimeline)
        return s.attachTimeline(t);
      if (typeof n == "function")
        return n(s);
    });
    return () => {
      i.forEach((s, o) => {
        s && s(), this.animations[o].stop();
      });
    };
  }
  get time() {
    return this.getAll("time");
  }
  set time(t) {
    this.setAll("time", t);
  }
  get speed() {
    return this.getAll("speed");
  }
  set speed(t) {
    this.setAll("speed", t);
  }
  get startTime() {
    return this.getAll("startTime");
  }
  get duration() {
    let t = 0;
    for (let n = 0; n < this.animations.length; n++)
      t = Math.max(t, this.animations[n].duration);
    return t;
  }
  runAll(t) {
    this.animations.forEach((n) => n[t]());
  }
  flatten() {
    this.runAll("flatten");
  }
  play() {
    this.runAll("play");
  }
  pause() {
    this.runAll("pause");
  }
  cancel() {
    this.runAll("cancel");
  }
  complete() {
    this.runAll("complete");
  }
}
class Wo extends zo {
  then(t, n) {
    return Promise.all(this.animations).then(t).catch(n);
  }
}
function fn(e, t) {
  return e ? e[t] || e.default || e : void 0;
}
const Me = 2e4;
function vs(e) {
  let t = 0;
  const n = 50;
  let i = e.next(t);
  for (; !i.done && t < Me; )
    t += n, i = e.next(t);
  return t >= Me ? 1 / 0 : t;
}
function mn(e) {
  return typeof e == "function";
}
function Nn(e, t) {
  e.timeline = t, e.onfinish = null;
}
const pn = (e) => Array.isArray(e) && typeof e[0] == "number", Go = {
  linearEasing: void 0
};
function Ho(e, t) {
  const n = /* @__PURE__ */ Je(e);
  return () => {
    var i;
    return (i = Go[t]) !== null && i !== void 0 ? i : n();
  };
}
const te = /* @__PURE__ */ Ho(() => {
  try {
    document.createElement("div").animate({ opacity: 0 }, { easing: "linear(0, 1)" });
  } catch {
    return !1;
  }
  return !0;
}, "linearEasing"), xs = (e, t, n = 10) => {
  let i = "";
  const s = Math.max(Math.round(t / n), 2);
  for (let o = 0; o < s; o++)
    i += e(/* @__PURE__ */ yt(0, s - 1, o)) + ", ";
  return `linear(${i.substring(0, i.length - 2)})`;
};
function Ts(e) {
  return !!(typeof e == "function" && te() || !e || typeof e == "string" && (e in Re || te()) || pn(e) || Array.isArray(e) && e.every(Ts));
}
const Ct = ([e, t, n, i]) => `cubic-bezier(${e}, ${t}, ${n}, ${i})`, Re = {
  linear: "linear",
  ease: "ease",
  easeIn: "ease-in",
  easeOut: "ease-out",
  easeInOut: "ease-in-out",
  circIn: /* @__PURE__ */ Ct([0, 0.65, 0.55, 1]),
  circOut: /* @__PURE__ */ Ct([0.55, 0, 1, 0.45]),
  backIn: /* @__PURE__ */ Ct([0.31, 0.01, 0.66, -0.59]),
  backOut: /* @__PURE__ */ Ct([0.33, 1.53, 0.69, 0.99])
};
function bs(e, t) {
  if (e)
    return typeof e == "function" && te() ? xs(e, t) : pn(e) ? Ct(e) : Array.isArray(e) ? e.map((n) => bs(n, t) || Re.easeOut) : Re[e];
}
const $ = {
  x: !1,
  y: !1
};
function Ps() {
  return $.x || $.y;
}
function Xo(e, t, n) {
  var i;
  if (e instanceof Element)
    return [e];
  if (typeof e == "string") {
    let s = document;
    const o = (i = void 0) !== null && i !== void 0 ? i : s.querySelectorAll(e);
    return o ? Array.from(o) : [];
  }
  return Array.from(e);
}
function Ss(e, t) {
  const n = Xo(e), i = new AbortController(), s = {
    passive: !0,
    ...t,
    signal: i.signal
  };
  return [n, s, () => i.abort()];
}
function Un(e) {
  return (t) => {
    t.pointerType === "touch" || Ps() || e(t);
  };
}
function Yo(e, t, n = {}) {
  const [i, s, o] = Ss(e, n), r = Un((a) => {
    const { target: l } = a, c = t(a);
    if (typeof c != "function" || !l)
      return;
    const u = Un((h) => {
      c(h), l.removeEventListener("pointerleave", u);
    });
    l.addEventListener("pointerleave", u, s);
  });
  return i.forEach((a) => {
    a.addEventListener("pointerenter", r, s);
  }), o;
}
const ws = (e, t) => t ? e === t ? !0 : ws(e, t.parentElement) : !1, gn = (e) => e.pointerType === "mouse" ? typeof e.button != "number" || e.button <= 0 : e.isPrimary !== !1, qo = /* @__PURE__ */ new Set([
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "A"
]);
function Zo(e) {
  return qo.has(e.tagName) || e.tabIndex !== -1;
}
const Dt = /* @__PURE__ */ new WeakSet();
function Kn(e) {
  return (t) => {
    t.key === "Enter" && e(t);
  };
}
function me(e, t) {
  e.dispatchEvent(new PointerEvent("pointer" + t, { isPrimary: !0, bubbles: !0 }));
}
const Jo = (e, t) => {
  const n = e.currentTarget;
  if (!n)
    return;
  const i = Kn(() => {
    if (Dt.has(n))
      return;
    me(n, "down");
    const s = Kn(() => {
      me(n, "up");
    }), o = () => me(n, "cancel");
    n.addEventListener("keyup", s, t), n.addEventListener("blur", o, t);
  });
  n.addEventListener("keydown", i, t), n.addEventListener("blur", () => n.removeEventListener("keydown", i), t);
};
function _n(e) {
  return gn(e) && !Ps();
}
function Qo(e, t, n = {}) {
  const [i, s, o] = Ss(e, n), r = (a) => {
    const l = a.currentTarget;
    if (!_n(a) || Dt.has(l))
      return;
    Dt.add(l);
    const c = t(a), u = (f, m) => {
      window.removeEventListener("pointerup", h), window.removeEventListener("pointercancel", d), !(!_n(f) || !Dt.has(l)) && (Dt.delete(l), typeof c == "function" && c(f, { success: m }));
    }, h = (f) => {
      u(f, n.useGlobalTarget || ws(l, f.target));
    }, d = (f) => {
      u(f, !1);
    };
    window.addEventListener("pointerup", h, s), window.addEventListener("pointercancel", d, s);
  };
  return i.forEach((a) => {
    !Zo(a) && a.getAttribute("tabindex") === null && (a.tabIndex = 0), (n.useGlobalTarget ? window : a).addEventListener("pointerdown", r, s), a.addEventListener("focus", (c) => Jo(c, s), s);
  }), o;
}
function ta(e) {
  return e === "x" || e === "y" ? $[e] ? null : ($[e] = !0, () => {
    $[e] = !1;
  }) : $.x || $.y ? null : ($.x = $.y = !0, () => {
    $.x = $.y = !1;
  });
}
const As = /* @__PURE__ */ new Set([
  "width",
  "height",
  "top",
  "left",
  "right",
  "bottom",
  ...Pt
]);
let Yt;
function ea() {
  Yt = void 0;
}
const G = {
  now: () => (Yt === void 0 && G.set(k.isProcessing || Yr.useManualTiming ? k.timestamp : performance.now()), Yt),
  set: (e) => {
    Yt = e, queueMicrotask(ea);
  }
};
function yn(e, t) {
  e.indexOf(t) === -1 && e.push(t);
}
function vn(e, t) {
  const n = e.indexOf(t);
  n > -1 && e.splice(n, 1);
}
class xn {
  constructor() {
    this.subscriptions = [];
  }
  add(t) {
    return yn(this.subscriptions, t), () => vn(this.subscriptions, t);
  }
  notify(t, n, i) {
    const s = this.subscriptions.length;
    if (s)
      if (s === 1)
        this.subscriptions[0](t, n, i);
      else
        for (let o = 0; o < s; o++) {
          const r = this.subscriptions[o];
          r && r(t, n, i);
        }
  }
  getSize() {
    return this.subscriptions.length;
  }
  clear() {
    this.subscriptions.length = 0;
  }
}
function Vs(e, t) {
  return t ? e * (1e3 / t) : 0;
}
const $n = 30, na = (e) => !isNaN(parseFloat(e));
class ia {
  /**
   * @param init - The initiating value
   * @param config - Optional configuration options
   *
   * -  `transformer`: A function to transform incoming values with.
   *
   * @internal
   */
  constructor(t, n = {}) {
    this.version = "11.18.2", this.canTrackVelocity = null, this.events = {}, this.updateAndNotify = (i, s = !0) => {
      const o = G.now();
      this.updatedAt !== o && this.setPrevFrameValue(), this.prev = this.current, this.setCurrent(i), this.current !== this.prev && this.events.change && this.events.change.notify(this.current), s && this.events.renderRequest && this.events.renderRequest.notify(this.current);
    }, this.hasAnimated = !1, this.setCurrent(t), this.owner = n.owner;
  }
  setCurrent(t) {
    this.current = t, this.updatedAt = G.now(), this.canTrackVelocity === null && t !== void 0 && (this.canTrackVelocity = na(this.current));
  }
  setPrevFrameValue(t = this.current) {
    this.prevFrameValue = t, this.prevUpdatedAt = this.updatedAt;
  }
  /**
   * Adds a function that will be notified when the `MotionValue` is updated.
   *
   * It returns a function that, when called, will cancel the subscription.
   *
   * When calling `onChange` inside a React component, it should be wrapped with the
   * `useEffect` hook. As it returns an unsubscribe function, this should be returned
   * from the `useEffect` function to ensure you don't add duplicate subscribers..
   *
   * ```jsx
   * export const MyComponent = () => {
   *   const x = useMotionValue(0)
   *   const y = useMotionValue(0)
   *   const opacity = useMotionValue(1)
   *
   *   useEffect(() => {
   *     function updateOpacity() {
   *       const maxXY = Math.max(x.get(), y.get())
   *       const newOpacity = transform(maxXY, [0, 100], [1, 0])
   *       opacity.set(newOpacity)
   *     }
   *
   *     const unsubscribeX = x.on("change", updateOpacity)
   *     const unsubscribeY = y.on("change", updateOpacity)
   *
   *     return () => {
   *       unsubscribeX()
   *       unsubscribeY()
   *     }
   *   }, [])
   *
   *   return <motion.div style={{ x }} />
   * }
   * ```
   *
   * @param subscriber - A function that receives the latest value.
   * @returns A function that, when called, will cancel this subscription.
   *
   * @deprecated
   */
  onChange(t) {
    return this.on("change", t);
  }
  on(t, n) {
    this.events[t] || (this.events[t] = new xn());
    const i = this.events[t].add(n);
    return t === "change" ? () => {
      i(), V.read(() => {
        this.events.change.getSize() || this.stop();
      });
    } : i;
  }
  clearListeners() {
    for (const t in this.events)
      this.events[t].clear();
  }
  /**
   * Attaches a passive effect to the `MotionValue`.
   *
   * @internal
   */
  attach(t, n) {
    this.passiveEffect = t, this.stopPassiveEffect = n;
  }
  /**
   * Sets the state of the `MotionValue`.
   *
   * @remarks
   *
   * ```jsx
   * const x = useMotionValue(0)
   * x.set(10)
   * ```
   *
   * @param latest - Latest value to set.
   * @param render - Whether to notify render subscribers. Defaults to `true`
   *
   * @public
   */
  set(t, n = !0) {
    !n || !this.passiveEffect ? this.updateAndNotify(t, n) : this.passiveEffect(t, this.updateAndNotify);
  }
  setWithVelocity(t, n, i) {
    this.set(n), this.prev = void 0, this.prevFrameValue = t, this.prevUpdatedAt = this.updatedAt - i;
  }
  /**
   * Set the state of the `MotionValue`, stopping any active animations,
   * effects, and resets velocity to `0`.
   */
  jump(t, n = !0) {
    this.updateAndNotify(t), this.prev = t, this.prevUpdatedAt = this.prevFrameValue = void 0, n && this.stop(), this.stopPassiveEffect && this.stopPassiveEffect();
  }
  /**
   * Returns the latest state of `MotionValue`
   *
   * @returns - The latest state of `MotionValue`
   *
   * @public
   */
  get() {
    return this.current;
  }
  /**
   * @public
   */
  getPrevious() {
    return this.prev;
  }
  /**
   * Returns the latest velocity of `MotionValue`
   *
   * @returns - The latest velocity of `MotionValue`. Returns `0` if the state is non-numerical.
   *
   * @public
   */
  getVelocity() {
    const t = G.now();
    if (!this.canTrackVelocity || this.prevFrameValue === void 0 || t - this.updatedAt > $n)
      return 0;
    const n = Math.min(this.updatedAt - this.prevUpdatedAt, $n);
    return Vs(parseFloat(this.current) - parseFloat(this.prevFrameValue), n);
  }
  /**
   * Registers a new animation to control this `MotionValue`. Only one
   * animation can drive a `MotionValue` at one time.
   *
   * ```jsx
   * value.start()
   * ```
   *
   * @param animation - A function that starts the provided animation
   *
   * @internal
   */
  start(t) {
    return this.stop(), new Promise((n) => {
      this.hasAnimated = !0, this.animation = t(n), this.events.animationStart && this.events.animationStart.notify();
    }).then(() => {
      this.events.animationComplete && this.events.animationComplete.notify(), this.clearAnimation();
    });
  }
  /**
   * Stop the currently active animation.
   *
   * @public
   */
  stop() {
    this.animation && (this.animation.stop(), this.events.animationCancel && this.events.animationCancel.notify()), this.clearAnimation();
  }
  /**
   * Returns `true` if this value is currently animating.
   *
   * @public
   */
  isAnimating() {
    return !!this.animation;
  }
  clearAnimation() {
    delete this.animation;
  }
  /**
   * Destroy and clean up subscribers to this `MotionValue`.
   *
   * The `MotionValue` hooks like `useMotionValue` and `useTransform` automatically
   * handle the lifecycle of the returned `MotionValue`, so this method is only necessary if you've manually
   * created a `MotionValue` via the `motionValue` function.
   *
   * @public
   */
  destroy() {
    this.clearListeners(), this.stop(), this.stopPassiveEffect && this.stopPassiveEffect();
  }
}
function jt(e, t) {
  return new ia(e, t);
}
function sa(e, t, n) {
  e.hasValue(t) ? e.getValue(t).set(n) : e.addValue(t, jt(n));
}
function ra(e, t) {
  const n = ce(e, t);
  let { transitionEnd: i = {}, transition: s = {}, ...o } = n || {};
  o = { ...o, ...i };
  for (const r in o) {
    const a = yo(o[r]);
    sa(e, r, a);
  }
}
function oa(e) {
  return !!(B(e) && e.add);
}
function Ee(e, t) {
  const n = e.getValue("willChange");
  if (oa(n))
    return n.add(t);
}
function Cs(e) {
  return e.props[is];
}
const Ds = (e, t, n) => (((1 - 3 * n + 3 * t) * e + (3 * n - 6 * t)) * e + 3 * t) * e, aa = 1e-7, la = 12;
function ca(e, t, n, i, s) {
  let o, r, a = 0;
  do
    r = t + (n - t) / 2, o = Ds(r, i, s) - e, o > 0 ? n = r : t = r;
  while (Math.abs(o) > aa && ++a < la);
  return r;
}
function Kt(e, t, n, i) {
  if (e === t && n === i)
    return O;
  const s = (o) => ca(o, 0, 1, e, n);
  return (o) => o === 0 || o === 1 ? o : Ds(s(o), t, i);
}
const Ms = (e) => (t) => t <= 0.5 ? e(2 * t) / 2 : (2 - e(2 * (1 - t))) / 2, Rs = (e) => (t) => 1 - e(1 - t), Es = /* @__PURE__ */ Kt(0.33, 1.53, 0.69, 0.99), Tn = /* @__PURE__ */ Rs(Es), ks = /* @__PURE__ */ Ms(Tn), Ls = (e) => (e *= 2) < 1 ? 0.5 * Tn(e) : 0.5 * (2 - Math.pow(2, -10 * (e - 1))), bn = (e) => 1 - Math.sin(Math.acos(e)), Fs = Rs(bn), Is = Ms(bn), Bs = (e) => /^0[^.\s]+$/u.test(e);
function ua(e) {
  return typeof e == "number" ? e === 0 : e !== null ? e === "none" || e === "0" || Bs(e) : !0;
}
const Rt = (e) => Math.round(e * 1e5) / 1e5, Pn = /-?(?:\d+(?:\.\d+)?|\.\d+)/gu;
function ha(e) {
  return e == null;
}
const da = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))$/iu, Sn = (e, t) => (n) => !!(typeof n == "string" && da.test(n) && n.startsWith(e) || t && !ha(n) && Object.prototype.hasOwnProperty.call(n, t)), js = (e, t, n) => (i) => {
  if (typeof i != "string")
    return i;
  const [s, o, r, a] = i.match(Pn);
  return {
    [e]: parseFloat(s),
    [t]: parseFloat(o),
    [n]: parseFloat(r),
    alpha: a !== void 0 ? parseFloat(a) : 1
  };
}, fa = (e) => J(0, 255, e), pe = {
  ...St,
  transform: (e) => Math.round(fa(e))
}, at = {
  test: /* @__PURE__ */ Sn("rgb", "red"),
  parse: /* @__PURE__ */ js("red", "green", "blue"),
  transform: ({ red: e, green: t, blue: n, alpha: i = 1 }) => "rgba(" + pe.transform(e) + ", " + pe.transform(t) + ", " + pe.transform(n) + ", " + Rt(Bt.transform(i)) + ")"
};
function ma(e) {
  let t = "", n = "", i = "", s = "";
  return e.length > 5 ? (t = e.substring(1, 3), n = e.substring(3, 5), i = e.substring(5, 7), s = e.substring(7, 9)) : (t = e.substring(1, 2), n = e.substring(2, 3), i = e.substring(3, 4), s = e.substring(4, 5), t += t, n += n, i += i, s += s), {
    red: parseInt(t, 16),
    green: parseInt(n, 16),
    blue: parseInt(i, 16),
    alpha: s ? parseInt(s, 16) / 255 : 1
  };
}
const ke = {
  test: /* @__PURE__ */ Sn("#"),
  parse: ma,
  transform: at.transform
}, ft = {
  test: /* @__PURE__ */ Sn("hsl", "hue"),
  parse: /* @__PURE__ */ js("hue", "saturation", "lightness"),
  transform: ({ hue: e, saturation: t, lightness: n, alpha: i = 1 }) => "hsla(" + Math.round(e) + ", " + W.transform(Rt(t)) + ", " + W.transform(Rt(n)) + ", " + Rt(Bt.transform(i)) + ")"
}, F = {
  test: (e) => at.test(e) || ke.test(e) || ft.test(e),
  parse: (e) => at.test(e) ? at.parse(e) : ft.test(e) ? ft.parse(e) : ke.parse(e),
  transform: (e) => typeof e == "string" ? e : e.hasOwnProperty("red") ? at.transform(e) : ft.transform(e)
}, pa = /(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))/giu;
function ga(e) {
  var t, n;
  return isNaN(e) && typeof e == "string" && (((t = e.match(Pn)) === null || t === void 0 ? void 0 : t.length) || 0) + (((n = e.match(pa)) === null || n === void 0 ? void 0 : n.length) || 0) > 0;
}
const Os = "number", Ns = "color", ya = "var", va = "var(", zn = "${}", xa = /var\s*\(\s*--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)|#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\)|-?(?:\d+(?:\.\d+)?|\.\d+)/giu;
function Ot(e) {
  const t = e.toString(), n = [], i = {
    color: [],
    number: [],
    var: []
  }, s = [];
  let o = 0;
  const a = t.replace(xa, (l) => (F.test(l) ? (i.color.push(o), s.push(Ns), n.push(F.parse(l))) : l.startsWith(va) ? (i.var.push(o), s.push(ya), n.push(l)) : (i.number.push(o), s.push(Os), n.push(parseFloat(l))), ++o, zn)).split(zn);
  return { values: n, split: a, indexes: i, types: s };
}
function Us(e) {
  return Ot(e).values;
}
function Ks(e) {
  const { split: t, types: n } = Ot(e), i = t.length;
  return (s) => {
    let o = "";
    for (let r = 0; r < i; r++)
      if (o += t[r], s[r] !== void 0) {
        const a = n[r];
        a === Os ? o += Rt(s[r]) : a === Ns ? o += F.transform(s[r]) : o += s[r];
      }
    return o;
  };
}
const Ta = (e) => typeof e == "number" ? 0 : e;
function ba(e) {
  const t = Us(e);
  return Ks(e)(t.map(Ta));
}
const nt = {
  test: ga,
  parse: Us,
  createTransformer: Ks,
  getAnimatableNone: ba
}, Pa = /* @__PURE__ */ new Set(["brightness", "contrast", "saturate", "opacity"]);
function Sa(e) {
  const [t, n] = e.slice(0, -1).split("(");
  if (t === "drop-shadow")
    return e;
  const [i] = n.match(Pn) || [];
  if (!i)
    return e;
  const s = n.replace(i, "");
  let o = Pa.has(t) ? 1 : 0;
  return i !== n && (o *= 100), t + "(" + o + s + ")";
}
const wa = /\b([a-z-]*)\(.*?\)/gu, Le = {
  ...nt,
  getAnimatableNone: (e) => {
    const t = e.match(wa);
    return t ? t.map(Sa).join(" ") : e;
  }
}, Aa = {
  ...an,
  // Color props
  color: F,
  backgroundColor: F,
  outlineColor: F,
  fill: F,
  stroke: F,
  // Border props
  borderColor: F,
  borderTopColor: F,
  borderRightColor: F,
  borderBottomColor: F,
  borderLeftColor: F,
  filter: Le,
  WebkitFilter: Le
}, wn = (e) => Aa[e];
function _s(e, t) {
  let n = wn(e);
  return n !== Le && (n = nt), n.getAnimatableNone ? n.getAnimatableNone(t) : void 0;
}
const Va = /* @__PURE__ */ new Set(["auto", "none", "0"]);
function Ca(e, t, n) {
  let i = 0, s;
  for (; i < e.length && !s; ) {
    const o = e[i];
    typeof o == "string" && !Va.has(o) && Ot(o).values.length && (s = e[i]), i++;
  }
  if (s && n)
    for (const o of t)
      e[o] = _s(n, s);
}
const Wn = (e) => e === St || e === P, Gn = (e, t) => parseFloat(e.split(", ")[t]), Hn = (e, t) => (n, { transform: i }) => {
  if (i === "none" || !i)
    return 0;
  const s = i.match(/^matrix3d\((.+)\)$/u);
  if (s)
    return Gn(s[1], t);
  {
    const o = i.match(/^matrix\((.+)\)$/u);
    return o ? Gn(o[1], e) : 0;
  }
}, Da = /* @__PURE__ */ new Set(["x", "y", "z"]), Ma = Pt.filter((e) => !Da.has(e));
function Ra(e) {
  const t = [];
  return Ma.forEach((n) => {
    const i = e.getValue(n);
    i !== void 0 && (t.push([n, i.get()]), i.set(n.startsWith("scale") ? 1 : 0));
  }), t;
}
const xt = {
  // Dimensions
  width: ({ x: e }, { paddingLeft: t = "0", paddingRight: n = "0" }) => e.max - e.min - parseFloat(t) - parseFloat(n),
  height: ({ y: e }, { paddingTop: t = "0", paddingBottom: n = "0" }) => e.max - e.min - parseFloat(t) - parseFloat(n),
  top: (e, { top: t }) => parseFloat(t),
  left: (e, { left: t }) => parseFloat(t),
  bottom: ({ y: e }, { top: t }) => parseFloat(t) + (e.max - e.min),
  right: ({ x: e }, { left: t }) => parseFloat(t) + (e.max - e.min),
  // Transform
  x: Hn(4, 13),
  y: Hn(5, 14)
};
xt.translateX = xt.x;
xt.translateY = xt.y;
const lt = /* @__PURE__ */ new Set();
let Fe = !1, Ie = !1;
function $s() {
  if (Ie) {
    const e = Array.from(lt).filter((i) => i.needsMeasurement), t = new Set(e.map((i) => i.element)), n = /* @__PURE__ */ new Map();
    t.forEach((i) => {
      const s = Ra(i);
      s.length && (n.set(i, s), i.render());
    }), e.forEach((i) => i.measureInitialState()), t.forEach((i) => {
      i.render();
      const s = n.get(i);
      s && s.forEach(([o, r]) => {
        var a;
        (a = i.getValue(o)) === null || a === void 0 || a.set(r);
      });
    }), e.forEach((i) => i.measureEndState()), e.forEach((i) => {
      i.suspendedScrollY !== void 0 && window.scrollTo(0, i.suspendedScrollY);
    });
  }
  Ie = !1, Fe = !1, lt.forEach((e) => e.complete()), lt.clear();
}
function zs() {
  lt.forEach((e) => {
    e.readKeyframes(), e.needsMeasurement && (Ie = !0);
  });
}
function Ea() {
  zs(), $s();
}
class An {
  constructor(t, n, i, s, o, r = !1) {
    this.isComplete = !1, this.isAsync = !1, this.needsMeasurement = !1, this.isScheduled = !1, this.unresolvedKeyframes = [...t], this.onComplete = n, this.name = i, this.motionValue = s, this.element = o, this.isAsync = r;
  }
  scheduleResolve() {
    this.isScheduled = !0, this.isAsync ? (lt.add(this), Fe || (Fe = !0, V.read(zs), V.resolveKeyframes($s))) : (this.readKeyframes(), this.complete());
  }
  readKeyframes() {
    const { unresolvedKeyframes: t, name: n, element: i, motionValue: s } = this;
    for (let o = 0; o < t.length; o++)
      if (t[o] === null)
        if (o === 0) {
          const r = s?.get(), a = t[t.length - 1];
          if (r !== void 0)
            t[0] = r;
          else if (i && n) {
            const l = i.readValue(n, a);
            l != null && (t[0] = l);
          }
          t[0] === void 0 && (t[0] = a), s && r === void 0 && s.set(t[0]);
        } else
          t[o] = t[o - 1];
  }
  setFinalKeyframe() {
  }
  measureInitialState() {
  }
  renderEndStyles() {
  }
  measureEndState() {
  }
  complete() {
    this.isComplete = !0, this.onComplete(this.unresolvedKeyframes, this.finalKeyframe), lt.delete(this);
  }
  cancel() {
    this.isComplete || (this.isScheduled = !1, lt.delete(this));
  }
  resume() {
    this.isComplete || this.scheduleResolve();
  }
}
const Ws = (e) => /^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(e), ka = (
  // eslint-disable-next-line redos-detector/no-unsafe-regex -- false positive, as it can match a lot of words
  /^var\(--(?:([\w-]+)|([\w-]+), ?([a-zA-Z\d ()%#.,-]+))\)/u
);
function La(e) {
  const t = ka.exec(e);
  if (!t)
    return [,];
  const [, n, i, s] = t;
  return [`--${n ?? i}`, s];
}
function Gs(e, t, n = 1) {
  const [i, s] = La(e);
  if (!i)
    return;
  const o = window.getComputedStyle(t).getPropertyValue(i);
  if (o) {
    const r = o.trim();
    return Ws(r) ? parseFloat(r) : r;
  }
  return on(s) ? Gs(s, t, n + 1) : s;
}
const Hs = (e) => (t) => t.test(e), Fa = {
  test: (e) => e === "auto",
  parse: (e) => e
}, Xs = [St, P, W, Q, So, Po, Fa], Xn = (e) => Xs.find(Hs(e));
class Ys extends An {
  constructor(t, n, i, s, o) {
    super(t, n, i, s, o, !0);
  }
  readKeyframes() {
    const { unresolvedKeyframes: t, element: n, name: i } = this;
    if (!n || !n.current)
      return;
    super.readKeyframes();
    for (let l = 0; l < t.length; l++) {
      let c = t[l];
      if (typeof c == "string" && (c = c.trim(), on(c))) {
        const u = Gs(c, n.current);
        u !== void 0 && (t[l] = u), l === t.length - 1 && (this.finalKeyframe = c);
      }
    }
    if (this.resolveNoneKeyframes(), !As.has(i) || t.length !== 2)
      return;
    const [s, o] = t, r = Xn(s), a = Xn(o);
    if (r !== a)
      if (Wn(r) && Wn(a))
        for (let l = 0; l < t.length; l++) {
          const c = t[l];
          typeof c == "string" && (t[l] = parseFloat(c));
        }
      else
        this.needsMeasurement = !0;
  }
  resolveNoneKeyframes() {
    const { unresolvedKeyframes: t, name: n } = this, i = [];
    for (let s = 0; s < t.length; s++)
      ua(t[s]) && i.push(s);
    i.length && Ca(t, i, n);
  }
  measureInitialState() {
    const { element: t, unresolvedKeyframes: n, name: i } = this;
    if (!t || !t.current)
      return;
    i === "height" && (this.suspendedScrollY = window.pageYOffset), this.measuredOrigin = xt[i](t.measureViewportBox(), window.getComputedStyle(t.current)), n[0] = this.measuredOrigin;
    const s = n[n.length - 1];
    s !== void 0 && t.getValue(i, s).jump(s, !1);
  }
  measureEndState() {
    var t;
    const { element: n, name: i, unresolvedKeyframes: s } = this;
    if (!n || !n.current)
      return;
    const o = n.getValue(i);
    o && o.jump(this.measuredOrigin, !1);
    const r = s.length - 1, a = s[r];
    s[r] = xt[i](n.measureViewportBox(), window.getComputedStyle(n.current)), a !== null && this.finalKeyframe === void 0 && (this.finalKeyframe = a), !((t = this.removedTransforms) === null || t === void 0) && t.length && this.removedTransforms.forEach(([l, c]) => {
      n.getValue(l).set(c);
    }), this.resolveNoneKeyframes();
  }
}
const Yn = (e, t) => t === "zIndex" ? !1 : !!(typeof e == "number" || Array.isArray(e) || typeof e == "string" && // It's animatable if we have a string
(nt.test(e) || e === "0") && // And it contains numbers and/or colors
!e.startsWith("url("));
function Ia(e) {
  const t = e[0];
  if (e.length === 1)
    return !0;
  for (let n = 0; n < e.length; n++)
    if (e[n] !== t)
      return !0;
}
function Ba(e, t, n, i) {
  const s = e[0];
  if (s === null)
    return !1;
  if (t === "display" || t === "visibility")
    return !0;
  const o = e[e.length - 1], r = Yn(s, t), a = Yn(o, t);
  return !r || !a ? !1 : Ia(e) || (n === "spring" || mn(n)) && i;
}
const ja = (e) => e !== null;
function ue(e, { repeat: t, repeatType: n = "loop" }, i) {
  const s = e.filter(ja), o = t && n !== "loop" && t % 2 === 1 ? 0 : s.length - 1;
  return !o || i === void 0 ? s[o] : i;
}
const Oa = 40;
class qs {
  constructor({ autoplay: t = !0, delay: n = 0, type: i = "keyframes", repeat: s = 0, repeatDelay: o = 0, repeatType: r = "loop", ...a }) {
    this.isStopped = !1, this.hasAttemptedResolve = !1, this.createdAt = G.now(), this.options = {
      autoplay: t,
      delay: n,
      type: i,
      repeat: s,
      repeatDelay: o,
      repeatType: r,
      ...a
    }, this.updateFinishedPromise();
  }
  /**
   * This method uses the createdAt and resolvedAt to calculate the
   * animation startTime. *Ideally*, we would use the createdAt time as t=0
   * as the following frame would then be the first frame of the animation in
   * progress, which would feel snappier.
   *
   * However, if there's a delay (main thread work) between the creation of
   * the animation and the first commited frame, we prefer to use resolvedAt
   * to avoid a sudden jump into the animation.
   */
  calcStartTime() {
    return this.resolvedAt ? this.resolvedAt - this.createdAt > Oa ? this.resolvedAt : this.createdAt : this.createdAt;
  }
  /**
   * A getter for resolved data. If keyframes are not yet resolved, accessing
   * this.resolved will synchronously flush all pending keyframe resolvers.
   * This is a deoptimisation, but at its worst still batches read/writes.
   */
  get resolved() {
    return !this._resolved && !this.hasAttemptedResolve && Ea(), this._resolved;
  }
  /**
   * A method to be called when the keyframes resolver completes. This method
   * will check if its possible to run the animation and, if not, skip it.
   * Otherwise, it will call initPlayback on the implementing class.
   */
  onKeyframesResolved(t, n) {
    this.resolvedAt = G.now(), this.hasAttemptedResolve = !0;
    const { name: i, type: s, velocity: o, delay: r, onComplete: a, onUpdate: l, isGenerator: c } = this.options;
    if (!c && !Ba(t, i, s, o))
      if (r)
        this.options.duration = 0;
      else {
        l && l(ue(t, this.options, n)), a && a(), this.resolveFinishedPromise();
        return;
      }
    const u = this.initPlayback(t, n);
    u !== !1 && (this._resolved = {
      keyframes: t,
      finalKeyframe: n,
      ...u
    }, this.onPostResolved());
  }
  onPostResolved() {
  }
  /**
   * Allows the returned animation to be awaited or promise-chained. Currently
   * resolves when the animation finishes at all but in a future update could/should
   * reject if its cancels.
   */
  then(t, n) {
    return this.currentFinishedPromise.then(t, n);
  }
  flatten() {
    this.options.type = "keyframes", this.options.ease = "linear";
  }
  updateFinishedPromise() {
    this.currentFinishedPromise = new Promise((t) => {
      this.resolveFinishedPromise = t;
    });
  }
}
const C = (e, t, n) => e + (t - e) * n;
function ge(e, t, n) {
  return n < 0 && (n += 1), n > 1 && (n -= 1), n < 1 / 6 ? e + (t - e) * 6 * n : n < 1 / 2 ? t : n < 2 / 3 ? e + (t - e) * (2 / 3 - n) * 6 : e;
}
function Na({ hue: e, saturation: t, lightness: n, alpha: i }) {
  e /= 360, t /= 100, n /= 100;
  let s = 0, o = 0, r = 0;
  if (!t)
    s = o = r = n;
  else {
    const a = n < 0.5 ? n * (1 + t) : n + t - n * t, l = 2 * n - a;
    s = ge(l, a, e + 1 / 3), o = ge(l, a, e), r = ge(l, a, e - 1 / 3);
  }
  return {
    red: Math.round(s * 255),
    green: Math.round(o * 255),
    blue: Math.round(r * 255),
    alpha: i
  };
}
function ee(e, t) {
  return (n) => n > 0 ? t : e;
}
const ye = (e, t, n) => {
  const i = e * e, s = n * (t * t - i) + i;
  return s < 0 ? 0 : Math.sqrt(s);
}, Ua = [ke, at, ft], Ka = (e) => Ua.find((t) => t.test(e));
function qn(e) {
  const t = Ka(e);
  if (!t)
    return !1;
  let n = t.parse(e);
  return t === ft && (n = Na(n)), n;
}
const Zn = (e, t) => {
  const n = qn(e), i = qn(t);
  if (!n || !i)
    return ee(e, t);
  const s = { ...n };
  return (o) => (s.red = ye(n.red, i.red, o), s.green = ye(n.green, i.green, o), s.blue = ye(n.blue, i.blue, o), s.alpha = C(n.alpha, i.alpha, o), at.transform(s));
}, _a = (e, t) => (n) => t(e(n)), _t = (...e) => e.reduce(_a), Be = /* @__PURE__ */ new Set(["none", "hidden"]);
function $a(e, t) {
  return Be.has(e) ? (n) => n <= 0 ? e : t : (n) => n >= 1 ? t : e;
}
function za(e, t) {
  return (n) => C(e, t, n);
}
function Vn(e) {
  return typeof e == "number" ? za : typeof e == "string" ? on(e) ? ee : F.test(e) ? Zn : Ha : Array.isArray(e) ? Zs : typeof e == "object" ? F.test(e) ? Zn : Wa : ee;
}
function Zs(e, t) {
  const n = [...e], i = n.length, s = e.map((o, r) => Vn(o)(o, t[r]));
  return (o) => {
    for (let r = 0; r < i; r++)
      n[r] = s[r](o);
    return n;
  };
}
function Wa(e, t) {
  const n = { ...e, ...t }, i = {};
  for (const s in n)
    e[s] !== void 0 && t[s] !== void 0 && (i[s] = Vn(e[s])(e[s], t[s]));
  return (s) => {
    for (const o in i)
      n[o] = i[o](s);
    return n;
  };
}
function Ga(e, t) {
  var n;
  const i = [], s = { color: 0, var: 0, number: 0 };
  for (let o = 0; o < t.values.length; o++) {
    const r = t.types[o], a = e.indexes[r][s[r]], l = (n = e.values[a]) !== null && n !== void 0 ? n : 0;
    i[o] = l, s[r]++;
  }
  return i;
}
const Ha = (e, t) => {
  const n = nt.createTransformer(t), i = Ot(e), s = Ot(t);
  return i.indexes.var.length === s.indexes.var.length && i.indexes.color.length === s.indexes.color.length && i.indexes.number.length >= s.indexes.number.length ? Be.has(e) && !s.values.length || Be.has(t) && !i.values.length ? $a(e, t) : _t(Zs(Ga(i, s), s.values), n) : ee(e, t);
};
function Js(e, t, n) {
  return typeof e == "number" && typeof t == "number" && typeof n == "number" ? C(e, t, n) : Vn(e)(e, t);
}
const Xa = 5;
function Qs(e, t, n) {
  const i = Math.max(t - Xa, 0);
  return Vs(n - e(i), t - i);
}
const D = {
  // Default spring physics
  stiffness: 100,
  damping: 10,
  mass: 1,
  velocity: 0,
  // Default duration/bounce-based options
  duration: 800,
  // in ms
  bounce: 0.3,
  visualDuration: 0.3,
  // in seconds
  // Rest thresholds
  restSpeed: {
    granular: 0.01,
    default: 2
  },
  restDelta: {
    granular: 5e-3,
    default: 0.5
  },
  // Limits
  minDuration: 0.01,
  // in seconds
  maxDuration: 10,
  // in seconds
  minDamping: 0.05,
  maxDamping: 1
}, ve = 1e-3;
function Ya({ duration: e = D.duration, bounce: t = D.bounce, velocity: n = D.velocity, mass: i = D.mass }) {
  let s, o, r = 1 - t;
  r = J(D.minDamping, D.maxDamping, r), e = J(D.minDuration, D.maxDuration, /* @__PURE__ */ Z(e)), r < 1 ? (s = (c) => {
    const u = c * r, h = u * e, d = u - n, f = je(c, r), m = Math.exp(-h);
    return ve - d / f * m;
  }, o = (c) => {
    const h = c * r * e, d = h * n + n, f = Math.pow(r, 2) * Math.pow(c, 2) * e, m = Math.exp(-h), p = je(Math.pow(c, 2), r);
    return (-s(c) + ve > 0 ? -1 : 1) * ((d - f) * m) / p;
  }) : (s = (c) => {
    const u = Math.exp(-c * e), h = (c - n) * e + 1;
    return -ve + u * h;
  }, o = (c) => {
    const u = Math.exp(-c * e), h = (n - c) * (e * e);
    return u * h;
  });
  const a = 5 / e, l = Za(s, o, a);
  if (e = /* @__PURE__ */ q(e), isNaN(l))
    return {
      stiffness: D.stiffness,
      damping: D.damping,
      duration: e
    };
  {
    const c = Math.pow(l, 2) * i;
    return {
      stiffness: c,
      damping: r * 2 * Math.sqrt(i * c),
      duration: e
    };
  }
}
const qa = 12;
function Za(e, t, n) {
  let i = n;
  for (let s = 1; s < qa; s++)
    i = i - e(i) / t(i);
  return i;
}
function je(e, t) {
  return e * Math.sqrt(1 - t * t);
}
const Ja = ["duration", "bounce"], Qa = ["stiffness", "damping", "mass"];
function Jn(e, t) {
  return t.some((n) => e[n] !== void 0);
}
function tl(e) {
  let t = {
    velocity: D.velocity,
    stiffness: D.stiffness,
    damping: D.damping,
    mass: D.mass,
    isResolvedFromDuration: !1,
    ...e
  };
  if (!Jn(e, Qa) && Jn(e, Ja))
    if (e.visualDuration) {
      const n = e.visualDuration, i = 2 * Math.PI / (n * 1.2), s = i * i, o = 2 * J(0.05, 1, 1 - (e.bounce || 0)) * Math.sqrt(s);
      t = {
        ...t,
        mass: D.mass,
        stiffness: s,
        damping: o
      };
    } else {
      const n = Ya(e);
      t = {
        ...t,
        ...n,
        mass: D.mass
      }, t.isResolvedFromDuration = !0;
    }
  return t;
}
function tr(e = D.visualDuration, t = D.bounce) {
  const n = typeof e != "object" ? {
    visualDuration: e,
    keyframes: [0, 1],
    bounce: t
  } : e;
  let { restSpeed: i, restDelta: s } = n;
  const o = n.keyframes[0], r = n.keyframes[n.keyframes.length - 1], a = { done: !1, value: o }, { stiffness: l, damping: c, mass: u, duration: h, velocity: d, isResolvedFromDuration: f } = tl({
    ...n,
    velocity: -/* @__PURE__ */ Z(n.velocity || 0)
  }), m = d || 0, p = c / (2 * Math.sqrt(l * u)), y = r - o, g = /* @__PURE__ */ Z(Math.sqrt(l / u)), x = Math.abs(y) < 5;
  i || (i = x ? D.restSpeed.granular : D.restSpeed.default), s || (s = x ? D.restDelta.granular : D.restDelta.default);
  let T;
  if (p < 1) {
    const v = je(g, p);
    T = (A) => {
      const M = Math.exp(-p * g * A);
      return r - M * ((m + p * g * y) / v * Math.sin(v * A) + y * Math.cos(v * A));
    };
  } else if (p === 1)
    T = (v) => r - Math.exp(-g * v) * (y + (m + g * y) * v);
  else {
    const v = g * Math.sqrt(p * p - 1);
    T = (A) => {
      const M = Math.exp(-p * g * A), S = Math.min(v * A, 300);
      return r - M * ((m + p * g * y) * Math.sinh(S) + v * y * Math.cosh(S)) / v;
    };
  }
  const w = {
    calculatedDuration: f && h || null,
    next: (v) => {
      const A = T(v);
      if (f)
        a.done = v >= h;
      else {
        let M = 0;
        p < 1 && (M = v === 0 ? /* @__PURE__ */ q(m) : Qs(T, v, A));
        const S = Math.abs(M) <= i, L = Math.abs(r - A) <= s;
        a.done = S && L;
      }
      return a.value = a.done ? r : A, a;
    },
    toString: () => {
      const v = Math.min(vs(w), Me), A = xs((M) => w.next(v * M).value, v, 30);
      return v + "ms " + A;
    }
  };
  return w;
}
function Qn({ keyframes: e, velocity: t = 0, power: n = 0.8, timeConstant: i = 325, bounceDamping: s = 10, bounceStiffness: o = 500, modifyTarget: r, min: a, max: l, restDelta: c = 0.5, restSpeed: u }) {
  const h = e[0], d = {
    done: !1,
    value: h
  }, f = (S) => a !== void 0 && S < a || l !== void 0 && S > l, m = (S) => a === void 0 ? l : l === void 0 || Math.abs(a - S) < Math.abs(l - S) ? a : l;
  let p = n * t;
  const y = h + p, g = r === void 0 ? y : r(y);
  g !== y && (p = g - h);
  const x = (S) => -p * Math.exp(-S / i), T = (S) => g + x(S), w = (S) => {
    const L = x(S), U = T(S);
    d.done = Math.abs(L) <= c, d.value = d.done ? g : U;
  };
  let v, A;
  const M = (S) => {
    f(d.value) && (v = S, A = tr({
      keyframes: [d.value, m(d.value)],
      velocity: Qs(T, S, d.value),
      // TODO: This should be passing * 1000
      damping: s,
      stiffness: o,
      restDelta: c,
      restSpeed: u
    }));
  };
  return M(0), {
    calculatedDuration: null,
    next: (S) => {
      let L = !1;
      return !A && v === void 0 && (L = !0, w(S), M(S)), v !== void 0 && S >= v ? A.next(S - v) : (!L && w(S), d);
    }
  };
}
const el = /* @__PURE__ */ Kt(0.42, 0, 1, 1), nl = /* @__PURE__ */ Kt(0, 0, 0.58, 1), er = /* @__PURE__ */ Kt(0.42, 0, 0.58, 1), il = (e) => Array.isArray(e) && typeof e[0] != "number", sl = {
  linear: O,
  easeIn: el,
  easeInOut: er,
  easeOut: nl,
  circIn: bn,
  circInOut: Is,
  circOut: Fs,
  backIn: Tn,
  backInOut: ks,
  backOut: Es,
  anticipate: Ls
}, ti = (e) => {
  if (pn(e)) {
    Ji(e.length === 4);
    const [t, n, i, s] = e;
    return Kt(t, n, i, s);
  } else if (typeof e == "string")
    return sl[e];
  return e;
};
function rl(e, t, n) {
  const i = [], s = n || Js, o = e.length - 1;
  for (let r = 0; r < o; r++) {
    let a = s(e[r], e[r + 1]);
    if (t) {
      const l = Array.isArray(t) ? t[r] || O : t;
      a = _t(l, a);
    }
    i.push(a);
  }
  return i;
}
function ol(e, t, { clamp: n = !0, ease: i, mixer: s } = {}) {
  const o = e.length;
  if (Ji(o === t.length), o === 1)
    return () => t[0];
  if (o === 2 && t[0] === t[1])
    return () => t[1];
  const r = e[0] === e[1];
  e[0] > e[o - 1] && (e = [...e].reverse(), t = [...t].reverse());
  const a = rl(t, i, s), l = a.length, c = (u) => {
    if (r && u < e[0])
      return t[0];
    let h = 0;
    if (l > 1)
      for (; h < e.length - 2 && !(u < e[h + 1]); h++)
        ;
    const d = /* @__PURE__ */ yt(e[h], e[h + 1], u);
    return a[h](d);
  };
  return n ? (u) => c(J(e[0], e[o - 1], u)) : c;
}
function al(e, t) {
  const n = e[e.length - 1];
  for (let i = 1; i <= t; i++) {
    const s = /* @__PURE__ */ yt(0, t, i);
    e.push(C(n, 1, s));
  }
}
function ll(e) {
  const t = [0];
  return al(t, e.length - 1), t;
}
function cl(e, t) {
  return e.map((n) => n * t);
}
function ul(e, t) {
  return e.map(() => t || er).splice(0, e.length - 1);
}
function ne({ duration: e = 300, keyframes: t, times: n, ease: i = "easeInOut" }) {
  const s = il(i) ? i.map(ti) : ti(i), o = {
    done: !1,
    value: t[0]
  }, r = cl(
    // Only use the provided offsets if they're the correct length
    // TODO Maybe we should warn here if there's a length mismatch
    n && n.length === t.length ? n : ll(t),
    e
  ), a = ol(r, t, {
    ease: Array.isArray(s) ? s : ul(t, s)
  });
  return {
    calculatedDuration: e,
    next: (l) => (o.value = a(l), o.done = l >= e, o)
  };
}
const hl = (e) => {
  const t = ({ timestamp: n }) => e(n);
  return {
    start: () => V.update(t, !0),
    stop: () => et(t),
    /**
     * If we're processing this frame we can use the
     * framelocked timestamp to keep things in sync.
     */
    now: () => k.isProcessing ? k.timestamp : G.now()
  };
}, dl = {
  decay: Qn,
  inertia: Qn,
  tween: ne,
  keyframes: ne,
  spring: tr
}, fl = (e) => e / 100;
class Cn extends qs {
  constructor(t) {
    super(t), this.holdTime = null, this.cancelTime = null, this.currentTime = 0, this.playbackSpeed = 1, this.pendingPlayState = "running", this.startTime = null, this.state = "idle", this.stop = () => {
      if (this.resolver.cancel(), this.isStopped = !0, this.state === "idle")
        return;
      this.teardown();
      const { onStop: l } = this.options;
      l && l();
    };
    const { name: n, motionValue: i, element: s, keyframes: o } = this.options, r = s?.KeyframeResolver || An, a = (l, c) => this.onKeyframesResolved(l, c);
    this.resolver = new r(o, a, n, i, s), this.resolver.scheduleResolve();
  }
  flatten() {
    super.flatten(), this._resolved && Object.assign(this._resolved, this.initPlayback(this._resolved.keyframes));
  }
  initPlayback(t) {
    const { type: n = "keyframes", repeat: i = 0, repeatDelay: s = 0, repeatType: o, velocity: r = 0 } = this.options, a = mn(n) ? n : dl[n] || ne;
    let l, c;
    a !== ne && typeof t[0] != "number" && (l = _t(fl, Js(t[0], t[1])), t = [0, 100]);
    const u = a({ ...this.options, keyframes: t });
    o === "mirror" && (c = a({
      ...this.options,
      keyframes: [...t].reverse(),
      velocity: -r
    })), u.calculatedDuration === null && (u.calculatedDuration = vs(u));
    const { calculatedDuration: h } = u, d = h + s, f = d * (i + 1) - s;
    return {
      generator: u,
      mirroredGenerator: c,
      mapPercentToKeyframes: l,
      calculatedDuration: h,
      resolvedDuration: d,
      totalDuration: f
    };
  }
  onPostResolved() {
    const { autoplay: t = !0 } = this.options;
    this.play(), this.pendingPlayState === "paused" || !t ? this.pause() : this.state = this.pendingPlayState;
  }
  tick(t, n = !1) {
    const { resolved: i } = this;
    if (!i) {
      const { keyframes: S } = this.options;
      return { done: !0, value: S[S.length - 1] };
    }
    const { finalKeyframe: s, generator: o, mirroredGenerator: r, mapPercentToKeyframes: a, keyframes: l, calculatedDuration: c, totalDuration: u, resolvedDuration: h } = i;
    if (this.startTime === null)
      return o.next(0);
    const { delay: d, repeat: f, repeatType: m, repeatDelay: p, onUpdate: y } = this.options;
    this.speed > 0 ? this.startTime = Math.min(this.startTime, t) : this.speed < 0 && (this.startTime = Math.min(t - u / this.speed, this.startTime)), n ? this.currentTime = t : this.holdTime !== null ? this.currentTime = this.holdTime : this.currentTime = Math.round(t - this.startTime) * this.speed;
    const g = this.currentTime - d * (this.speed >= 0 ? 1 : -1), x = this.speed >= 0 ? g < 0 : g > u;
    this.currentTime = Math.max(g, 0), this.state === "finished" && this.holdTime === null && (this.currentTime = u);
    let T = this.currentTime, w = o;
    if (f) {
      const S = Math.min(this.currentTime, u) / h;
      let L = Math.floor(S), U = S % 1;
      !U && S >= 1 && (U = 1), U === 1 && L--, L = Math.min(L, f + 1), !!(L % 2) && (m === "reverse" ? (U = 1 - U, p && (U -= p / h)) : m === "mirror" && (w = r)), T = J(0, 1, U) * h;
    }
    const v = x ? { done: !1, value: l[0] } : w.next(T);
    a && (v.value = a(v.value));
    let { done: A } = v;
    !x && c !== null && (A = this.speed >= 0 ? this.currentTime >= u : this.currentTime <= 0);
    const M = this.holdTime === null && (this.state === "finished" || this.state === "running" && A);
    return M && s !== void 0 && (v.value = ue(l, this.options, s)), y && y(v.value), M && this.finish(), v;
  }
  get duration() {
    const { resolved: t } = this;
    return t ? /* @__PURE__ */ Z(t.calculatedDuration) : 0;
  }
  get time() {
    return /* @__PURE__ */ Z(this.currentTime);
  }
  set time(t) {
    t = /* @__PURE__ */ q(t), this.currentTime = t, this.holdTime !== null || this.speed === 0 ? this.holdTime = t : this.driver && (this.startTime = this.driver.now() - t / this.speed);
  }
  get speed() {
    return this.playbackSpeed;
  }
  set speed(t) {
    const n = this.playbackSpeed !== t;
    this.playbackSpeed = t, n && (this.time = /* @__PURE__ */ Z(this.currentTime));
  }
  play() {
    if (this.resolver.isScheduled || this.resolver.resume(), !this._resolved) {
      this.pendingPlayState = "running";
      return;
    }
    if (this.isStopped)
      return;
    const { driver: t = hl, onPlay: n, startTime: i } = this.options;
    this.driver || (this.driver = t((o) => this.tick(o))), n && n();
    const s = this.driver.now();
    this.holdTime !== null ? this.startTime = s - this.holdTime : this.startTime ? this.state === "finished" && (this.startTime = s) : this.startTime = i ?? this.calcStartTime(), this.state === "finished" && this.updateFinishedPromise(), this.cancelTime = this.startTime, this.holdTime = null, this.state = "running", this.driver.start();
  }
  pause() {
    var t;
    if (!this._resolved) {
      this.pendingPlayState = "paused";
      return;
    }
    this.state = "paused", this.holdTime = (t = this.currentTime) !== null && t !== void 0 ? t : 0;
  }
  complete() {
    this.state !== "running" && this.play(), this.pendingPlayState = this.state = "finished", this.holdTime = null;
  }
  finish() {
    this.teardown(), this.state = "finished";
    const { onComplete: t } = this.options;
    t && t();
  }
  cancel() {
    this.cancelTime !== null && this.tick(this.cancelTime), this.teardown(), this.updateFinishedPromise();
  }
  teardown() {
    this.state = "idle", this.stopDriver(), this.resolveFinishedPromise(), this.updateFinishedPromise(), this.startTime = this.cancelTime = null, this.resolver.cancel();
  }
  stopDriver() {
    this.driver && (this.driver.stop(), this.driver = void 0);
  }
  sample(t) {
    return this.startTime = 0, this.tick(t, !0);
  }
}
const ml = /* @__PURE__ */ new Set([
  "opacity",
  "clipPath",
  "filter",
  "transform"
  // TODO: Can be accelerated but currently disabled until https://issues.chromium.org/issues/41491098 is resolved
  // or until we implement support for linear() easing.
  // "background-color"
]);
function pl(e, t, n, { delay: i = 0, duration: s = 300, repeat: o = 0, repeatType: r = "loop", ease: a = "easeInOut", times: l } = {}) {
  const c = { [t]: n };
  l && (c.offset = l);
  const u = bs(a, s);
  return Array.isArray(u) && (c.easing = u), e.animate(c, {
    delay: i,
    duration: s,
    easing: Array.isArray(u) ? "linear" : u,
    fill: "both",
    iterations: o + 1,
    direction: r === "reverse" ? "alternate" : "normal"
  });
}
const gl = /* @__PURE__ */ Je(() => Object.hasOwnProperty.call(Element.prototype, "animate")), ie = 10, yl = 2e4;
function vl(e) {
  return mn(e.type) || e.type === "spring" || !Ts(e.ease);
}
function xl(e, t) {
  const n = new Cn({
    ...t,
    keyframes: e,
    repeat: 0,
    delay: 0,
    isGenerator: !0
  });
  let i = { done: !1, value: e[0] };
  const s = [];
  let o = 0;
  for (; !i.done && o < yl; )
    i = n.sample(o), s.push(i.value), o += ie;
  return {
    times: void 0,
    keyframes: s,
    duration: o - ie,
    ease: "linear"
  };
}
const nr = {
  anticipate: Ls,
  backInOut: ks,
  circInOut: Is
};
function Tl(e) {
  return e in nr;
}
class ei extends qs {
  constructor(t) {
    super(t);
    const { name: n, motionValue: i, element: s, keyframes: o } = this.options;
    this.resolver = new Ys(o, (r, a) => this.onKeyframesResolved(r, a), n, i, s), this.resolver.scheduleResolve();
  }
  initPlayback(t, n) {
    let { duration: i = 300, times: s, ease: o, type: r, motionValue: a, name: l, startTime: c } = this.options;
    if (!a.owner || !a.owner.current)
      return !1;
    if (typeof o == "string" && te() && Tl(o) && (o = nr[o]), vl(this.options)) {
      const { onComplete: h, onUpdate: d, motionValue: f, element: m, ...p } = this.options, y = xl(t, p);
      t = y.keyframes, t.length === 1 && (t[1] = t[0]), i = y.duration, s = y.times, o = y.ease, r = "keyframes";
    }
    const u = pl(a.owner.current, l, t, { ...this.options, duration: i, times: s, ease: o });
    return u.startTime = c ?? this.calcStartTime(), this.pendingTimeline ? (Nn(u, this.pendingTimeline), this.pendingTimeline = void 0) : u.onfinish = () => {
      const { onComplete: h } = this.options;
      a.set(ue(t, this.options, n)), h && h(), this.cancel(), this.resolveFinishedPromise();
    }, {
      animation: u,
      duration: i,
      times: s,
      type: r,
      ease: o,
      keyframes: t
    };
  }
  get duration() {
    const { resolved: t } = this;
    if (!t)
      return 0;
    const { duration: n } = t;
    return /* @__PURE__ */ Z(n);
  }
  get time() {
    const { resolved: t } = this;
    if (!t)
      return 0;
    const { animation: n } = t;
    return /* @__PURE__ */ Z(n.currentTime || 0);
  }
  set time(t) {
    const { resolved: n } = this;
    if (!n)
      return;
    const { animation: i } = n;
    i.currentTime = /* @__PURE__ */ q(t);
  }
  get speed() {
    const { resolved: t } = this;
    if (!t)
      return 1;
    const { animation: n } = t;
    return n.playbackRate;
  }
  set speed(t) {
    const { resolved: n } = this;
    if (!n)
      return;
    const { animation: i } = n;
    i.playbackRate = t;
  }
  get state() {
    const { resolved: t } = this;
    if (!t)
      return "idle";
    const { animation: n } = t;
    return n.playState;
  }
  get startTime() {
    const { resolved: t } = this;
    if (!t)
      return null;
    const { animation: n } = t;
    return n.startTime;
  }
  /**
   * Replace the default DocumentTimeline with another AnimationTimeline.
   * Currently used for scroll animations.
   */
  attachTimeline(t) {
    if (!this._resolved)
      this.pendingTimeline = t;
    else {
      const { resolved: n } = this;
      if (!n)
        return O;
      const { animation: i } = n;
      Nn(i, t);
    }
    return O;
  }
  play() {
    if (this.isStopped)
      return;
    const { resolved: t } = this;
    if (!t)
      return;
    const { animation: n } = t;
    n.playState === "finished" && this.updateFinishedPromise(), n.play();
  }
  pause() {
    const { resolved: t } = this;
    if (!t)
      return;
    const { animation: n } = t;
    n.pause();
  }
  stop() {
    if (this.resolver.cancel(), this.isStopped = !0, this.state === "idle")
      return;
    this.resolveFinishedPromise(), this.updateFinishedPromise();
    const { resolved: t } = this;
    if (!t)
      return;
    const { animation: n, keyframes: i, duration: s, type: o, ease: r, times: a } = t;
    if (n.playState === "idle" || n.playState === "finished")
      return;
    if (this.time) {
      const { motionValue: c, onUpdate: u, onComplete: h, element: d, ...f } = this.options, m = new Cn({
        ...f,
        keyframes: i,
        duration: s,
        type: o,
        ease: r,
        times: a,
        isGenerator: !0
      }), p = /* @__PURE__ */ q(this.time);
      c.setWithVelocity(m.sample(p - ie).value, m.sample(p).value, ie);
    }
    const { onStop: l } = this.options;
    l && l(), this.cancel();
  }
  complete() {
    const { resolved: t } = this;
    t && t.animation.finish();
  }
  cancel() {
    const { resolved: t } = this;
    t && t.animation.cancel();
  }
  static supports(t) {
    const { motionValue: n, name: i, repeatDelay: s, repeatType: o, damping: r, type: a } = t;
    if (!n || !n.owner || !(n.owner.current instanceof HTMLElement))
      return !1;
    const { onUpdate: l, transformTemplate: c } = n.owner.getProps();
    return gl() && i && ml.has(i) && /**
     * If we're outputting values to onUpdate then we can't use WAAPI as there's
     * no way to read the value from WAAPI every frame.
     */
    !l && !c && !s && o !== "mirror" && r !== 0 && a !== "inertia";
  }
}
const bl = {
  type: "spring",
  stiffness: 500,
  damping: 25,
  restSpeed: 10
}, Pl = (e) => ({
  type: "spring",
  stiffness: 550,
  damping: e === 0 ? 2 * Math.sqrt(550) : 30,
  restSpeed: 10
}), Sl = {
  type: "keyframes",
  duration: 0.8
}, wl = {
  type: "keyframes",
  ease: [0.25, 0.1, 0.35, 1],
  duration: 0.3
}, Al = (e, { keyframes: t }) => t.length > 2 ? Sl : ut.has(e) ? e.startsWith("scale") ? Pl(t[1]) : bl : wl;
function Vl({ when: e, delay: t, delayChildren: n, staggerChildren: i, staggerDirection: s, repeat: o, repeatType: r, repeatDelay: a, from: l, elapsed: c, ...u }) {
  return !!Object.keys(u).length;
}
const Dn = (e, t, n, i = {}, s, o) => (r) => {
  const a = fn(i, e) || {}, l = a.delay || i.delay || 0;
  let { elapsed: c = 0 } = i;
  c = c - /* @__PURE__ */ q(l);
  let u = {
    keyframes: Array.isArray(n) ? n : [null, n],
    ease: "easeOut",
    velocity: t.getVelocity(),
    ...a,
    delay: -c,
    onUpdate: (d) => {
      t.set(d), a.onUpdate && a.onUpdate(d);
    },
    onComplete: () => {
      r(), a.onComplete && a.onComplete();
    },
    name: e,
    motionValue: t,
    element: o ? void 0 : s
  };
  Vl(a) || (u = {
    ...u,
    ...Al(e, u)
  }), u.duration && (u.duration = /* @__PURE__ */ q(u.duration)), u.repeatDelay && (u.repeatDelay = /* @__PURE__ */ q(u.repeatDelay)), u.from !== void 0 && (u.keyframes[0] = u.from);
  let h = !1;
  if ((u.type === !1 || u.duration === 0 && !u.repeatDelay) && (u.duration = 0, u.delay === 0 && (h = !0)), h && !o && t.get() !== void 0) {
    const d = ue(u.keyframes, a);
    if (d !== void 0)
      return V.update(() => {
        u.onUpdate(d), u.onComplete();
      }), new Wo([]);
  }
  return !o && ei.supports(u) ? new ei(u) : new Cn(u);
};
function Cl({ protectedKeys: e, needsAnimating: t }, n) {
  const i = e.hasOwnProperty(n) && t[n] !== !0;
  return t[n] = !1, i;
}
function ir(e, t, { delay: n = 0, transitionOverride: i, type: s } = {}) {
  var o;
  let { transition: r = e.getDefaultTransition(), transitionEnd: a, ...l } = t;
  i && (r = i);
  const c = [], u = s && e.animationState && e.animationState.getState()[s];
  for (const h in l) {
    const d = e.getValue(h, (o = e.latestValues[h]) !== null && o !== void 0 ? o : null), f = l[h];
    if (f === void 0 || u && Cl(u, h))
      continue;
    const m = {
      delay: n,
      ...fn(r || {}, h)
    };
    let p = !1;
    if (window.MotionHandoffAnimation) {
      const g = Cs(e);
      if (g) {
        const x = window.MotionHandoffAnimation(g, h, V);
        x !== null && (m.startTime = x, p = !0);
      }
    }
    Ee(e, h), d.start(Dn(h, d, f, e.shouldReduceMotion && As.has(h) ? { type: !1 } : m, e, p));
    const y = d.animation;
    y && c.push(y);
  }
  return a && Promise.all(c).then(() => {
    V.update(() => {
      a && ra(e, a);
    });
  }), c;
}
function Oe(e, t, n = {}) {
  var i;
  const s = ce(e, t, n.type === "exit" ? (i = e.presenceContext) === null || i === void 0 ? void 0 : i.custom : void 0);
  let { transition: o = e.getDefaultTransition() || {} } = s || {};
  n.transitionOverride && (o = n.transitionOverride);
  const r = s ? () => Promise.all(ir(e, s, n)) : () => Promise.resolve(), a = e.variantChildren && e.variantChildren.size ? (c = 0) => {
    const { delayChildren: u = 0, staggerChildren: h, staggerDirection: d } = o;
    return Dl(e, t, u + c, h, d, n);
  } : () => Promise.resolve(), { when: l } = o;
  if (l) {
    const [c, u] = l === "beforeChildren" ? [r, a] : [a, r];
    return c().then(() => u());
  } else
    return Promise.all([r(), a(n.delay)]);
}
function Dl(e, t, n = 0, i = 0, s = 1, o) {
  const r = [], a = (e.variantChildren.size - 1) * i, l = s === 1 ? (c = 0) => c * i : (c = 0) => a - c * i;
  return Array.from(e.variantChildren).sort(Ml).forEach((c, u) => {
    c.notify("AnimationStart", t), r.push(Oe(c, t, {
      ...o,
      delay: n + l(u)
    }).then(() => c.notify("AnimationComplete", t)));
  }), Promise.all(r);
}
function Ml(e, t) {
  return e.sortNodePosition(t);
}
function Rl(e, t, n = {}) {
  e.notify("AnimationStart", t);
  let i;
  if (Array.isArray(t)) {
    const s = t.map((o) => Oe(e, o, n));
    i = Promise.all(s);
  } else if (typeof t == "string")
    i = Oe(e, t, n);
  else {
    const s = typeof t == "function" ? ce(e, t, n.custom) : t;
    i = Promise.all(ir(e, s, n));
  }
  return i.then(() => {
    e.notify("AnimationComplete", t);
  });
}
const El = tn.length;
function sr(e) {
  if (!e)
    return;
  if (!e.isControllingVariants) {
    const n = e.parent ? sr(e.parent) || {} : {};
    return e.props.initial !== void 0 && (n.initial = e.props.initial), n;
  }
  const t = {};
  for (let n = 0; n < El; n++) {
    const i = tn[n], s = e.props[i];
    (It(s) || s === !1) && (t[i] = s);
  }
  return t;
}
const kl = [...Qe].reverse(), Ll = Qe.length;
function Fl(e) {
  return (t) => Promise.all(t.map(({ animation: n, options: i }) => Rl(e, n, i)));
}
function Il(e) {
  let t = Fl(e), n = ni(), i = !0;
  const s = (l) => (c, u) => {
    var h;
    const d = ce(e, u, l === "exit" ? (h = e.presenceContext) === null || h === void 0 ? void 0 : h.custom : void 0);
    if (d) {
      const { transition: f, transitionEnd: m, ...p } = d;
      c = { ...c, ...p, ...m };
    }
    return c;
  };
  function o(l) {
    t = l(e);
  }
  function r(l) {
    const { props: c } = e, u = sr(e.parent) || {}, h = [], d = /* @__PURE__ */ new Set();
    let f = {}, m = 1 / 0;
    for (let y = 0; y < Ll; y++) {
      const g = kl[y], x = n[g], T = c[g] !== void 0 ? c[g] : u[g], w = It(T), v = g === l ? x.isActive : null;
      v === !1 && (m = y);
      let A = T === u[g] && T !== c[g] && w;
      if (A && i && e.manuallyAnimateOnMount && (A = !1), x.protectedKeys = { ...f }, // If it isn't active and hasn't *just* been set as inactive
      !x.isActive && v === null || // If we didn't and don't have any defined prop for this animation type
      !T && !x.prevProp || // Or if the prop doesn't define an animation
      ae(T) || typeof T == "boolean")
        continue;
      const M = Bl(x.prevProp, T);
      let S = M || // If we're making this variant active, we want to always make it active
      g === l && x.isActive && !A && w || // If we removed a higher-priority variant (i is in reverse order)
      y > m && w, L = !1;
      const U = Array.isArray(T) ? T : [T];
      let ht = U.reduce(s(g), {});
      v === !1 && (ht = {});
      const { prevResolvedValues: Mn = {} } = x, Vr = {
        ...Mn,
        ...ht
      }, Rn = (j) => {
        S = !0, d.has(j) && (L = !0, d.delete(j)), x.needsAnimating[j] = !0;
        const H = e.getValue(j);
        H && (H.liveStyle = !1);
      };
      for (const j in Vr) {
        const H = ht[j], he = Mn[j];
        if (f.hasOwnProperty(j))
          continue;
        let de = !1;
        De(H) && De(he) ? de = !ys(H, he) : de = H !== he, de ? H != null ? Rn(j) : d.add(j) : H !== void 0 && d.has(j) ? Rn(j) : x.protectedKeys[j] = !0;
      }
      x.prevProp = T, x.prevResolvedValues = ht, x.isActive && (f = { ...f, ...ht }), i && e.blockInitialAnimation && (S = !1), S && (!(A && M) || L) && h.push(...U.map((j) => ({
        animation: j,
        options: { type: g }
      })));
    }
    if (d.size) {
      const y = {};
      d.forEach((g) => {
        const x = e.getBaseTarget(g), T = e.getValue(g);
        T && (T.liveStyle = !0), y[g] = x ?? null;
      }), h.push({ animation: y });
    }
    let p = !!h.length;
    return i && (c.initial === !1 || c.initial === c.animate) && !e.manuallyAnimateOnMount && (p = !1), i = !1, p ? t(h) : Promise.resolve();
  }
  function a(l, c) {
    var u;
    if (n[l].isActive === c)
      return Promise.resolve();
    (u = e.variantChildren) === null || u === void 0 || u.forEach((d) => {
      var f;
      return (f = d.animationState) === null || f === void 0 ? void 0 : f.setActive(l, c);
    }), n[l].isActive = c;
    const h = r(l);
    for (const d in n)
      n[d].protectedKeys = {};
    return h;
  }
  return {
    animateChanges: r,
    setActive: a,
    setAnimateFunction: o,
    getState: () => n,
    reset: () => {
      n = ni(), i = !0;
    }
  };
}
function Bl(e, t) {
  return typeof t == "string" ? t !== e : Array.isArray(t) ? !ys(t, e) : !1;
}
function st(e = !1) {
  return {
    isActive: e,
    protectedKeys: {},
    needsAnimating: {},
    prevResolvedValues: {}
  };
}
function ni() {
  return {
    animate: st(!0),
    whileInView: st(),
    whileHover: st(),
    whileTap: st(),
    whileDrag: st(),
    whileFocus: st(),
    exit: st()
  };
}
class it {
  constructor(t) {
    this.isMounted = !1, this.node = t;
  }
  update() {
  }
}
class jl extends it {
  /**
   * We dynamically generate the AnimationState manager as it contains a reference
   * to the underlying animation library. We only want to load that if we load this,
   * so people can optionally code split it out using the `m` component.
   */
  constructor(t) {
    super(t), t.animationState || (t.animationState = Il(t));
  }
  updateAnimationControlsSubscription() {
    const { animate: t } = this.node.getProps();
    ae(t) && (this.unmountControls = t.subscribe(this.node));
  }
  /**
   * Subscribe any provided AnimationControls to the component's VisualElement
   */
  mount() {
    this.updateAnimationControlsSubscription();
  }
  update() {
    const { animate: t } = this.node.getProps(), { animate: n } = this.node.prevProps || {};
    t !== n && this.updateAnimationControlsSubscription();
  }
  unmount() {
    var t;
    this.node.animationState.reset(), (t = this.unmountControls) === null || t === void 0 || t.call(this);
  }
}
let Ol = 0;
class Nl extends it {
  constructor() {
    super(...arguments), this.id = Ol++;
  }
  update() {
    if (!this.node.presenceContext)
      return;
    const { isPresent: t, onExitComplete: n } = this.node.presenceContext, { isPresent: i } = this.node.prevPresenceContext || {};
    if (!this.node.animationState || t === i)
      return;
    const s = this.node.animationState.setActive("exit", !t);
    n && !t && s.then(() => n(this.id));
  }
  mount() {
    const { register: t } = this.node.presenceContext || {};
    t && (this.unmount = t(this.id));
  }
  unmount() {
  }
}
const Ul = {
  animation: {
    Feature: jl
  },
  exit: {
    Feature: Nl
  }
};
function Nt(e, t, n, i = { passive: !0 }) {
  return e.addEventListener(t, n, i), () => e.removeEventListener(t, n);
}
function $t(e) {
  return {
    point: {
      x: e.pageX,
      y: e.pageY
    }
  };
}
const Kl = (e) => (t) => gn(t) && e(t, $t(t));
function Et(e, t, n, i) {
  return Nt(e, t, Kl(n), i);
}
const ii = (e, t) => Math.abs(e - t);
function _l(e, t) {
  const n = ii(e.x, t.x), i = ii(e.y, t.y);
  return Math.sqrt(n ** 2 + i ** 2);
}
class rr {
  constructor(t, n, { transformPagePoint: i, contextWindow: s, dragSnapToOrigin: o = !1 } = {}) {
    if (this.startEvent = null, this.lastMoveEvent = null, this.lastMoveEventInfo = null, this.handlers = {}, this.contextWindow = window, this.updatePoint = () => {
      if (!(this.lastMoveEvent && this.lastMoveEventInfo))
        return;
      const h = Te(this.lastMoveEventInfo, this.history), d = this.startEvent !== null, f = _l(h.offset, { x: 0, y: 0 }) >= 3;
      if (!d && !f)
        return;
      const { point: m } = h, { timestamp: p } = k;
      this.history.push({ ...m, timestamp: p });
      const { onStart: y, onMove: g } = this.handlers;
      d || (y && y(this.lastMoveEvent, h), this.startEvent = this.lastMoveEvent), g && g(this.lastMoveEvent, h);
    }, this.handlePointerMove = (h, d) => {
      this.lastMoveEvent = h, this.lastMoveEventInfo = xe(d, this.transformPagePoint), V.update(this.updatePoint, !0);
    }, this.handlePointerUp = (h, d) => {
      this.end();
      const { onEnd: f, onSessionEnd: m, resumeAnimation: p } = this.handlers;
      if (this.dragSnapToOrigin && p && p(), !(this.lastMoveEvent && this.lastMoveEventInfo))
        return;
      const y = Te(h.type === "pointercancel" ? this.lastMoveEventInfo : xe(d, this.transformPagePoint), this.history);
      this.startEvent && f && f(h, y), m && m(h, y);
    }, !gn(t))
      return;
    this.dragSnapToOrigin = o, this.handlers = n, this.transformPagePoint = i, this.contextWindow = s || window;
    const r = $t(t), a = xe(r, this.transformPagePoint), { point: l } = a, { timestamp: c } = k;
    this.history = [{ ...l, timestamp: c }];
    const { onSessionStart: u } = n;
    u && u(t, Te(a, this.history)), this.removeListeners = _t(Et(this.contextWindow, "pointermove", this.handlePointerMove), Et(this.contextWindow, "pointerup", this.handlePointerUp), Et(this.contextWindow, "pointercancel", this.handlePointerUp));
  }
  updateHandlers(t) {
    this.handlers = t;
  }
  end() {
    this.removeListeners && this.removeListeners(), et(this.updatePoint);
  }
}
function xe(e, t) {
  return t ? { point: t(e.point) } : e;
}
function si(e, t) {
  return { x: e.x - t.x, y: e.y - t.y };
}
function Te({ point: e }, t) {
  return {
    point: e,
    delta: si(e, or(t)),
    offset: si(e, $l(t)),
    velocity: zl(t, 0.1)
  };
}
function $l(e) {
  return e[0];
}
function or(e) {
  return e[e.length - 1];
}
function zl(e, t) {
  if (e.length < 2)
    return { x: 0, y: 0 };
  let n = e.length - 1, i = null;
  const s = or(e);
  for (; n >= 0 && (i = e[n], !(s.timestamp - i.timestamp > /* @__PURE__ */ q(t))); )
    n--;
  if (!i)
    return { x: 0, y: 0 };
  const o = /* @__PURE__ */ Z(s.timestamp - i.timestamp);
  if (o === 0)
    return { x: 0, y: 0 };
  const r = {
    x: (s.x - i.x) / o,
    y: (s.y - i.y) / o
  };
  return r.x === 1 / 0 && (r.x = 0), r.y === 1 / 0 && (r.y = 0), r;
}
const ar = 1e-4, Wl = 1 - ar, Gl = 1 + ar, lr = 0.01, Hl = 0 - lr, Xl = 0 + lr;
function N(e) {
  return e.max - e.min;
}
function Yl(e, t, n) {
  return Math.abs(e - t) <= n;
}
function ri(e, t, n, i = 0.5) {
  e.origin = i, e.originPoint = C(t.min, t.max, e.origin), e.scale = N(n) / N(t), e.translate = C(n.min, n.max, e.origin) - e.originPoint, (e.scale >= Wl && e.scale <= Gl || isNaN(e.scale)) && (e.scale = 1), (e.translate >= Hl && e.translate <= Xl || isNaN(e.translate)) && (e.translate = 0);
}
function kt(e, t, n, i) {
  ri(e.x, t.x, n.x, i ? i.originX : void 0), ri(e.y, t.y, n.y, i ? i.originY : void 0);
}
function oi(e, t, n) {
  e.min = n.min + t.min, e.max = e.min + N(t);
}
function ql(e, t, n) {
  oi(e.x, t.x, n.x), oi(e.y, t.y, n.y);
}
function ai(e, t, n) {
  e.min = t.min - n.min, e.max = e.min + N(t);
}
function Lt(e, t, n) {
  ai(e.x, t.x, n.x), ai(e.y, t.y, n.y);
}
function Zl(e, { min: t, max: n }, i) {
  return t !== void 0 && e < t ? e = i ? C(t, e, i.min) : Math.max(e, t) : n !== void 0 && e > n && (e = i ? C(n, e, i.max) : Math.min(e, n)), e;
}
function li(e, t, n) {
  return {
    min: t !== void 0 ? e.min + t : void 0,
    max: n !== void 0 ? e.max + n - (e.max - e.min) : void 0
  };
}
function Jl(e, { top: t, left: n, bottom: i, right: s }) {
  return {
    x: li(e.x, n, s),
    y: li(e.y, t, i)
  };
}
function ci(e, t) {
  let n = t.min - e.min, i = t.max - e.max;
  return t.max - t.min < e.max - e.min && ([n, i] = [i, n]), { min: n, max: i };
}
function Ql(e, t) {
  return {
    x: ci(e.x, t.x),
    y: ci(e.y, t.y)
  };
}
function tc(e, t) {
  let n = 0.5;
  const i = N(e), s = N(t);
  return s > i ? n = /* @__PURE__ */ yt(t.min, t.max - i, e.min) : i > s && (n = /* @__PURE__ */ yt(e.min, e.max - s, t.min)), J(0, 1, n);
}
function ec(e, t) {
  const n = {};
  return t.min !== void 0 && (n.min = t.min - e.min), t.max !== void 0 && (n.max = t.max - e.min), n;
}
const Ne = 0.35;
function nc(e = Ne) {
  return e === !1 ? e = 0 : e === !0 && (e = Ne), {
    x: ui(e, "left", "right"),
    y: ui(e, "top", "bottom")
  };
}
function ui(e, t, n) {
  return {
    min: hi(e, t),
    max: hi(e, n)
  };
}
function hi(e, t) {
  return typeof e == "number" ? e : e[t] || 0;
}
const di = () => ({
  translate: 0,
  scale: 1,
  origin: 0,
  originPoint: 0
}), mt = () => ({
  x: di(),
  y: di()
}), fi = () => ({ min: 0, max: 0 }), R = () => ({
  x: fi(),
  y: fi()
});
function _(e) {
  return [e("x"), e("y")];
}
function cr({ top: e, left: t, right: n, bottom: i }) {
  return {
    x: { min: t, max: n },
    y: { min: e, max: i }
  };
}
function ic({ x: e, y: t }) {
  return { top: t.min, right: e.max, bottom: t.max, left: e.min };
}
function sc(e, t) {
  if (!t)
    return e;
  const n = t({ x: e.left, y: e.top }), i = t({ x: e.right, y: e.bottom });
  return {
    top: n.y,
    left: n.x,
    bottom: i.y,
    right: i.x
  };
}
function be(e) {
  return e === void 0 || e === 1;
}
function Ue({ scale: e, scaleX: t, scaleY: n }) {
  return !be(e) || !be(t) || !be(n);
}
function rt(e) {
  return Ue(e) || ur(e) || e.z || e.rotate || e.rotateX || e.rotateY || e.skewX || e.skewY;
}
function ur(e) {
  return mi(e.x) || mi(e.y);
}
function mi(e) {
  return e && e !== "0%";
}
function se(e, t, n) {
  const i = e - n, s = t * i;
  return n + s;
}
function pi(e, t, n, i, s) {
  return s !== void 0 && (e = se(e, s, i)), se(e, n, i) + t;
}
function Ke(e, t = 0, n = 1, i, s) {
  e.min = pi(e.min, t, n, i, s), e.max = pi(e.max, t, n, i, s);
}
function hr(e, { x: t, y: n }) {
  Ke(e.x, t.translate, t.scale, t.originPoint), Ke(e.y, n.translate, n.scale, n.originPoint);
}
const gi = 0.999999999999, yi = 1.0000000000001;
function rc(e, t, n, i = !1) {
  const s = n.length;
  if (!s)
    return;
  t.x = t.y = 1;
  let o, r;
  for (let a = 0; a < s; a++) {
    o = n[a], r = o.projectionDelta;
    const { visualElement: l } = o.options;
    l && l.props.style && l.props.style.display === "contents" || (i && o.options.layoutScroll && o.scroll && o !== o.root && gt(e, {
      x: -o.scroll.offset.x,
      y: -o.scroll.offset.y
    }), r && (t.x *= r.x.scale, t.y *= r.y.scale, hr(e, r)), i && rt(o.latestValues) && gt(e, o.latestValues));
  }
  t.x < yi && t.x > gi && (t.x = 1), t.y < yi && t.y > gi && (t.y = 1);
}
function pt(e, t) {
  e.min = e.min + t, e.max = e.max + t;
}
function vi(e, t, n, i, s = 0.5) {
  const o = C(e.min, e.max, s);
  Ke(e, t, n, o, i);
}
function gt(e, t) {
  vi(e.x, t.x, t.scaleX, t.scale, t.originX), vi(e.y, t.y, t.scaleY, t.scale, t.originY);
}
function dr(e, t) {
  return cr(sc(e.getBoundingClientRect(), t));
}
function oc(e, t, n) {
  const i = dr(e, n), { scroll: s } = t;
  return s && (pt(i.x, s.offset.x), pt(i.y, s.offset.y)), i;
}
const fr = ({ current: e }) => e ? e.ownerDocument.defaultView : null, ac = /* @__PURE__ */ new WeakMap();
class lc {
  constructor(t) {
    this.openDragLock = null, this.isDragging = !1, this.currentDirection = null, this.originPoint = { x: 0, y: 0 }, this.constraints = !1, this.hasMutatedConstraints = !1, this.elastic = R(), this.visualElement = t;
  }
  start(t, { snapToCursor: n = !1 } = {}) {
    const { presenceContext: i } = this.visualElement;
    if (i && i.isPresent === !1)
      return;
    const s = (u) => {
      const { dragSnapToOrigin: h } = this.getProps();
      h ? this.pauseAnimation() : this.stopAnimation(), n && this.snapToCursor($t(u).point);
    }, o = (u, h) => {
      const { drag: d, dragPropagation: f, onDragStart: m } = this.getProps();
      if (d && !f && (this.openDragLock && this.openDragLock(), this.openDragLock = ta(d), !this.openDragLock))
        return;
      this.isDragging = !0, this.currentDirection = null, this.resolveConstraints(), this.visualElement.projection && (this.visualElement.projection.isAnimationBlocked = !0, this.visualElement.projection.target = void 0), _((y) => {
        let g = this.getAxisMotionValue(y).get() || 0;
        if (W.test(g)) {
          const { projection: x } = this.visualElement;
          if (x && x.layout) {
            const T = x.layout.layoutBox[y];
            T && (g = N(T) * (parseFloat(g) / 100));
          }
        }
        this.originPoint[y] = g;
      }), m && V.postRender(() => m(u, h)), Ee(this.visualElement, "transform");
      const { animationState: p } = this.visualElement;
      p && p.setActive("whileDrag", !0);
    }, r = (u, h) => {
      const { dragPropagation: d, dragDirectionLock: f, onDirectionLock: m, onDrag: p } = this.getProps();
      if (!d && !this.openDragLock)
        return;
      const { offset: y } = h;
      if (f && this.currentDirection === null) {
        this.currentDirection = cc(y), this.currentDirection !== null && m && m(this.currentDirection);
        return;
      }
      this.updateAxis("x", h.point, y), this.updateAxis("y", h.point, y), this.visualElement.render(), p && p(u, h);
    }, a = (u, h) => this.stop(u, h), l = () => _((u) => {
      var h;
      return this.getAnimationState(u) === "paused" && ((h = this.getAxisMotionValue(u).animation) === null || h === void 0 ? void 0 : h.play());
    }), { dragSnapToOrigin: c } = this.getProps();
    this.panSession = new rr(t, {
      onSessionStart: s,
      onStart: o,
      onMove: r,
      onSessionEnd: a,
      resumeAnimation: l
    }, {
      transformPagePoint: this.visualElement.getTransformPagePoint(),
      dragSnapToOrigin: c,
      contextWindow: fr(this.visualElement)
    });
  }
  stop(t, n) {
    const i = this.isDragging;
    if (this.cancel(), !i)
      return;
    const { velocity: s } = n;
    this.startAnimation(s);
    const { onDragEnd: o } = this.getProps();
    o && V.postRender(() => o(t, n));
  }
  cancel() {
    this.isDragging = !1;
    const { projection: t, animationState: n } = this.visualElement;
    t && (t.isAnimationBlocked = !1), this.panSession && this.panSession.end(), this.panSession = void 0;
    const { dragPropagation: i } = this.getProps();
    !i && this.openDragLock && (this.openDragLock(), this.openDragLock = null), n && n.setActive("whileDrag", !1);
  }
  updateAxis(t, n, i) {
    const { drag: s } = this.getProps();
    if (!i || !Ht(t, s, this.currentDirection))
      return;
    const o = this.getAxisMotionValue(t);
    let r = this.originPoint[t] + i[t];
    this.constraints && this.constraints[t] && (r = Zl(r, this.constraints[t], this.elastic[t])), o.set(r);
  }
  resolveConstraints() {
    var t;
    const { dragConstraints: n, dragElastic: i } = this.getProps(), s = this.visualElement.projection && !this.visualElement.projection.layout ? this.visualElement.projection.measure(!1) : (t = this.visualElement.projection) === null || t === void 0 ? void 0 : t.layout, o = this.constraints;
    n && dt(n) ? this.constraints || (this.constraints = this.resolveRefConstraints()) : n && s ? this.constraints = Jl(s.layoutBox, n) : this.constraints = !1, this.elastic = nc(i), o !== this.constraints && s && this.constraints && !this.hasMutatedConstraints && _((r) => {
      this.constraints !== !1 && this.getAxisMotionValue(r) && (this.constraints[r] = ec(s.layoutBox[r], this.constraints[r]));
    });
  }
  resolveRefConstraints() {
    const { dragConstraints: t, onMeasureDragConstraints: n } = this.getProps();
    if (!t || !dt(t))
      return !1;
    const i = t.current, { projection: s } = this.visualElement;
    if (!s || !s.layout)
      return !1;
    const o = oc(i, s.root, this.visualElement.getTransformPagePoint());
    let r = Ql(s.layout.layoutBox, o);
    if (n) {
      const a = n(ic(r));
      this.hasMutatedConstraints = !!a, a && (r = cr(a));
    }
    return r;
  }
  startAnimation(t) {
    const { drag: n, dragMomentum: i, dragElastic: s, dragTransition: o, dragSnapToOrigin: r, onDragTransitionEnd: a } = this.getProps(), l = this.constraints || {}, c = _((u) => {
      if (!Ht(u, n, this.currentDirection))
        return;
      let h = l && l[u] || {};
      r && (h = { min: 0, max: 0 });
      const d = s ? 200 : 1e6, f = s ? 40 : 1e7, m = {
        type: "inertia",
        velocity: i ? t[u] : 0,
        bounceStiffness: d,
        bounceDamping: f,
        timeConstant: 750,
        restDelta: 1,
        restSpeed: 10,
        ...o,
        ...h
      };
      return this.startAxisValueAnimation(u, m);
    });
    return Promise.all(c).then(a);
  }
  startAxisValueAnimation(t, n) {
    const i = this.getAxisMotionValue(t);
    return Ee(this.visualElement, t), i.start(Dn(t, i, 0, n, this.visualElement, !1));
  }
  stopAnimation() {
    _((t) => this.getAxisMotionValue(t).stop());
  }
  pauseAnimation() {
    _((t) => {
      var n;
      return (n = this.getAxisMotionValue(t).animation) === null || n === void 0 ? void 0 : n.pause();
    });
  }
  getAnimationState(t) {
    var n;
    return (n = this.getAxisMotionValue(t).animation) === null || n === void 0 ? void 0 : n.state;
  }
  /**
   * Drag works differently depending on which props are provided.
   *
   * - If _dragX and _dragY are provided, we output the gesture delta directly to those motion values.
   * - Otherwise, we apply the delta to the x/y motion values.
   */
  getAxisMotionValue(t) {
    const n = `_drag${t.toUpperCase()}`, i = this.visualElement.getProps(), s = i[n];
    return s || this.visualElement.getValue(t, (i.initial ? i.initial[t] : void 0) || 0);
  }
  snapToCursor(t) {
    _((n) => {
      const { drag: i } = this.getProps();
      if (!Ht(n, i, this.currentDirection))
        return;
      const { projection: s } = this.visualElement, o = this.getAxisMotionValue(n);
      if (s && s.layout) {
        const { min: r, max: a } = s.layout.layoutBox[n];
        o.set(t[n] - C(r, a, 0.5));
      }
    });
  }
  /**
   * When the viewport resizes we want to check if the measured constraints
   * have changed and, if so, reposition the element within those new constraints
   * relative to where it was before the resize.
   */
  scalePositionWithinConstraints() {
    if (!this.visualElement.current)
      return;
    const { drag: t, dragConstraints: n } = this.getProps(), { projection: i } = this.visualElement;
    if (!dt(n) || !i || !this.constraints)
      return;
    this.stopAnimation();
    const s = { x: 0, y: 0 };
    _((r) => {
      const a = this.getAxisMotionValue(r);
      if (a && this.constraints !== !1) {
        const l = a.get();
        s[r] = tc({ min: l, max: l }, this.constraints[r]);
      }
    });
    const { transformTemplate: o } = this.visualElement.getProps();
    this.visualElement.current.style.transform = o ? o({}, "") : "none", i.root && i.root.updateScroll(), i.updateLayout(), this.resolveConstraints(), _((r) => {
      if (!Ht(r, t, null))
        return;
      const a = this.getAxisMotionValue(r), { min: l, max: c } = this.constraints[r];
      a.set(C(l, c, s[r]));
    });
  }
  addListeners() {
    if (!this.visualElement.current)
      return;
    ac.set(this.visualElement, this);
    const t = this.visualElement.current, n = Et(t, "pointerdown", (l) => {
      const { drag: c, dragListener: u = !0 } = this.getProps();
      c && u && this.start(l);
    }), i = () => {
      const { dragConstraints: l } = this.getProps();
      dt(l) && l.current && (this.constraints = this.resolveRefConstraints());
    }, { projection: s } = this.visualElement, o = s.addEventListener("measure", i);
    s && !s.layout && (s.root && s.root.updateScroll(), s.updateLayout()), V.read(i);
    const r = Nt(window, "resize", () => this.scalePositionWithinConstraints()), a = s.addEventListener("didUpdate", ({ delta: l, hasLayoutChanged: c }) => {
      this.isDragging && c && (_((u) => {
        const h = this.getAxisMotionValue(u);
        h && (this.originPoint[u] += l[u].translate, h.set(h.get() + l[u].translate));
      }), this.visualElement.render());
    });
    return () => {
      r(), n(), o(), a && a();
    };
  }
  getProps() {
    const t = this.visualElement.getProps(), { drag: n = !1, dragDirectionLock: i = !1, dragPropagation: s = !1, dragConstraints: o = !1, dragElastic: r = Ne, dragMomentum: a = !0 } = t;
    return {
      ...t,
      drag: n,
      dragDirectionLock: i,
      dragPropagation: s,
      dragConstraints: o,
      dragElastic: r,
      dragMomentum: a
    };
  }
}
function Ht(e, t, n) {
  return (t === !0 || t === e) && (n === null || n === e);
}
function cc(e, t = 10) {
  let n = null;
  return Math.abs(e.y) > t ? n = "y" : Math.abs(e.x) > t && (n = "x"), n;
}
class uc extends it {
  constructor(t) {
    super(t), this.removeGroupControls = O, this.removeListeners = O, this.controls = new lc(t);
  }
  mount() {
    const { dragControls: t } = this.node.getProps();
    t && (this.removeGroupControls = t.subscribe(this.controls)), this.removeListeners = this.controls.addListeners() || O;
  }
  unmount() {
    this.removeGroupControls(), this.removeListeners();
  }
}
const xi = (e) => (t, n) => {
  e && V.postRender(() => e(t, n));
};
class hc extends it {
  constructor() {
    super(...arguments), this.removePointerDownListener = O;
  }
  onPointerDown(t) {
    this.session = new rr(t, this.createPanHandlers(), {
      transformPagePoint: this.node.getTransformPagePoint(),
      contextWindow: fr(this.node)
    });
  }
  createPanHandlers() {
    const { onPanSessionStart: t, onPanStart: n, onPan: i, onPanEnd: s } = this.node.getProps();
    return {
      onSessionStart: xi(t),
      onStart: xi(n),
      onMove: i,
      onEnd: (o, r) => {
        delete this.session, s && V.postRender(() => s(o, r));
      }
    };
  }
  mount() {
    this.removePointerDownListener = Et(this.node.current, "pointerdown", (t) => this.onPointerDown(t));
  }
  update() {
    this.session && this.session.updateHandlers(this.createPanHandlers());
  }
  unmount() {
    this.removePointerDownListener(), this.session && this.session.end();
  }
}
const qt = {
  /**
   * Global flag as to whether the tree has animated since the last time
   * we resized the window
   */
  hasAnimatedSinceResize: !0,
  /**
   * We set this to true once, on the first update. Any nodes added to the tree beyond that
   * update will be given a `data-projection-id` attribute.
   */
  hasEverUpdated: !1
};
function Ti(e, t) {
  return t.max === t.min ? 0 : e / (t.max - t.min) * 100;
}
const At = {
  correct: (e, t) => {
    if (!t.target)
      return e;
    if (typeof e == "string")
      if (P.test(e))
        e = parseFloat(e);
      else
        return e;
    const n = Ti(e, t.target.x), i = Ti(e, t.target.y);
    return `${n}% ${i}%`;
  }
}, dc = {
  correct: (e, { treeScale: t, projectionDelta: n }) => {
    const i = e, s = nt.parse(e);
    if (s.length > 5)
      return i;
    const o = nt.createTransformer(e), r = typeof s[0] != "number" ? 1 : 0, a = n.x.scale * t.x, l = n.y.scale * t.y;
    s[0 + r] /= a, s[1 + r] /= l;
    const c = C(a, l, 0.5);
    return typeof s[2 + r] == "number" && (s[2 + r] /= c), typeof s[3 + r] == "number" && (s[3 + r] /= c), o(s);
  }
};
class fc extends Hi {
  /**
   * This only mounts projection nodes for components that
   * need measuring, we might want to do it for all components
   * in order to incorporate transforms
   */
  componentDidMount() {
    const { visualElement: t, layoutGroup: n, switchLayoutGroup: i, layoutId: s } = this.props, { projection: o } = t;
    Lo(mc), o && (n.group && n.group.add(o), i && i.register && s && i.register(o), o.root.didUpdate(), o.addEventListener("animationComplete", () => {
      this.safeToRemove();
    }), o.setOptions({
      ...o.options,
      onExitComplete: () => this.safeToRemove()
    })), qt.hasEverUpdated = !0;
  }
  getSnapshotBeforeUpdate(t) {
    const { layoutDependency: n, visualElement: i, drag: s, isPresent: o } = this.props, r = i.projection;
    return r && (r.isPresent = o, s || t.layoutDependency !== n || n === void 0 ? r.willUpdate() : this.safeToRemove(), t.isPresent !== o && (o ? r.promote() : r.relegate() || V.postRender(() => {
      const a = r.getStack();
      (!a || !a.members.length) && this.safeToRemove();
    }))), null;
  }
  componentDidUpdate() {
    const { projection: t } = this.props.visualElement;
    t && (t.root.didUpdate(), nn.postRender(() => {
      !t.currentAnimation && t.isLead() && this.safeToRemove();
    }));
  }
  componentWillUnmount() {
    const { visualElement: t, layoutGroup: n, switchLayoutGroup: i } = this.props, { projection: s } = t;
    s && (s.scheduleCheckAfterUnmount(), n && n.group && n.group.remove(s), i && i.deregister && i.deregister(s));
  }
  safeToRemove() {
    const { safeToRemove: t } = this.props;
    t && t();
  }
  render() {
    return null;
  }
}
function mr(e) {
  const [t, n] = qi(), i = I(Xe);
  return b(fc, { ...e, layoutGroup: i, switchLayoutGroup: I(ss), isPresent: t, safeToRemove: n });
}
const mc = {
  borderRadius: {
    ...At,
    applyTo: [
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomLeftRadius",
      "borderBottomRightRadius"
    ]
  },
  borderTopLeftRadius: At,
  borderTopRightRadius: At,
  borderBottomLeftRadius: At,
  borderBottomRightRadius: At,
  boxShadow: dc
};
function pc(e, t, n) {
  const i = B(e) ? e : jt(e);
  return i.start(Dn("", i, t, n)), i.animation;
}
function gc(e) {
  return e instanceof SVGElement && e.tagName !== "svg";
}
const yc = (e, t) => e.depth - t.depth;
class vc {
  constructor() {
    this.children = [], this.isDirty = !1;
  }
  add(t) {
    yn(this.children, t), this.isDirty = !0;
  }
  remove(t) {
    vn(this.children, t), this.isDirty = !0;
  }
  forEach(t) {
    this.isDirty && this.children.sort(yc), this.isDirty = !1, this.children.forEach(t);
  }
}
function xc(e, t) {
  const n = G.now(), i = ({ timestamp: s }) => {
    const o = s - n;
    o >= t && (et(i), e(o - t));
  };
  return V.read(i, !0), () => et(i);
}
const pr = ["TopLeft", "TopRight", "BottomLeft", "BottomRight"], Tc = pr.length, bi = (e) => typeof e == "string" ? parseFloat(e) : e, Pi = (e) => typeof e == "number" || P.test(e);
function bc(e, t, n, i, s, o) {
  s ? (e.opacity = C(
    0,
    // TODO Reinstate this if only child
    n.opacity !== void 0 ? n.opacity : 1,
    Pc(i)
  ), e.opacityExit = C(t.opacity !== void 0 ? t.opacity : 1, 0, Sc(i))) : o && (e.opacity = C(t.opacity !== void 0 ? t.opacity : 1, n.opacity !== void 0 ? n.opacity : 1, i));
  for (let r = 0; r < Tc; r++) {
    const a = `border${pr[r]}Radius`;
    let l = Si(t, a), c = Si(n, a);
    if (l === void 0 && c === void 0)
      continue;
    l || (l = 0), c || (c = 0), l === 0 || c === 0 || Pi(l) === Pi(c) ? (e[a] = Math.max(C(bi(l), bi(c), i), 0), (W.test(c) || W.test(l)) && (e[a] += "%")) : e[a] = c;
  }
  (t.rotate || n.rotate) && (e.rotate = C(t.rotate || 0, n.rotate || 0, i));
}
function Si(e, t) {
  return e[t] !== void 0 ? e[t] : e.borderRadius;
}
const Pc = /* @__PURE__ */ gr(0, 0.5, Fs), Sc = /* @__PURE__ */ gr(0.5, 0.95, O);
function gr(e, t, n) {
  return (i) => i < e ? 0 : i > t ? 1 : n(/* @__PURE__ */ yt(e, t, i));
}
function wi(e, t) {
  e.min = t.min, e.max = t.max;
}
function K(e, t) {
  wi(e.x, t.x), wi(e.y, t.y);
}
function Ai(e, t) {
  e.translate = t.translate, e.scale = t.scale, e.originPoint = t.originPoint, e.origin = t.origin;
}
function Vi(e, t, n, i, s) {
  return e -= t, e = se(e, 1 / n, i), s !== void 0 && (e = se(e, 1 / s, i)), e;
}
function wc(e, t = 0, n = 1, i = 0.5, s, o = e, r = e) {
  if (W.test(t) && (t = parseFloat(t), t = C(r.min, r.max, t / 100) - r.min), typeof t != "number")
    return;
  let a = C(o.min, o.max, i);
  e === o && (a -= t), e.min = Vi(e.min, t, n, a, s), e.max = Vi(e.max, t, n, a, s);
}
function Ci(e, t, [n, i, s], o, r) {
  wc(e, t[n], t[i], t[s], t.scale, o, r);
}
const Ac = ["x", "scaleX", "originX"], Vc = ["y", "scaleY", "originY"];
function Di(e, t, n, i) {
  Ci(e.x, t, Ac, n ? n.x : void 0, i ? i.x : void 0), Ci(e.y, t, Vc, n ? n.y : void 0, i ? i.y : void 0);
}
function Mi(e) {
  return e.translate === 0 && e.scale === 1;
}
function yr(e) {
  return Mi(e.x) && Mi(e.y);
}
function Ri(e, t) {
  return e.min === t.min && e.max === t.max;
}
function Cc(e, t) {
  return Ri(e.x, t.x) && Ri(e.y, t.y);
}
function Ei(e, t) {
  return Math.round(e.min) === Math.round(t.min) && Math.round(e.max) === Math.round(t.max);
}
function vr(e, t) {
  return Ei(e.x, t.x) && Ei(e.y, t.y);
}
function ki(e) {
  return N(e.x) / N(e.y);
}
function Li(e, t) {
  return e.translate === t.translate && e.scale === t.scale && e.originPoint === t.originPoint;
}
class Dc {
  constructor() {
    this.members = [];
  }
  add(t) {
    yn(this.members, t), t.scheduleRender();
  }
  remove(t) {
    if (vn(this.members, t), t === this.prevLead && (this.prevLead = void 0), t === this.lead) {
      const n = this.members[this.members.length - 1];
      n && this.promote(n);
    }
  }
  relegate(t) {
    const n = this.members.findIndex((s) => t === s);
    if (n === 0)
      return !1;
    let i;
    for (let s = n; s >= 0; s--) {
      const o = this.members[s];
      if (o.isPresent !== !1) {
        i = o;
        break;
      }
    }
    return i ? (this.promote(i), !0) : !1;
  }
  promote(t, n) {
    const i = this.lead;
    if (t !== i && (this.prevLead = i, this.lead = t, t.show(), i)) {
      i.instance && i.scheduleRender(), t.scheduleRender(), t.resumeFrom = i, n && (t.resumeFrom.preserveOpacity = !0), i.snapshot && (t.snapshot = i.snapshot, t.snapshot.latestValues = i.animationValues || i.latestValues), t.root && t.root.isUpdating && (t.isLayoutDirty = !0);
      const { crossfade: s } = t.options;
      s === !1 && i.hide();
    }
  }
  exitAnimationComplete() {
    this.members.forEach((t) => {
      const { options: n, resumingFrom: i } = t;
      n.onExitComplete && n.onExitComplete(), i && i.options.onExitComplete && i.options.onExitComplete();
    });
  }
  scheduleRender() {
    this.members.forEach((t) => {
      t.instance && t.scheduleRender(!1);
    });
  }
  /**
   * Clear any leads that have been removed this render to prevent them from being
   * used in future animations and to prevent memory leaks
   */
  removeLeadSnapshot() {
    this.lead && this.lead.snapshot && (this.lead.snapshot = void 0);
  }
}
function Mc(e, t, n) {
  let i = "";
  const s = e.x.translate / t.x, o = e.y.translate / t.y, r = n?.z || 0;
  if ((s || o || r) && (i = `translate3d(${s}px, ${o}px, ${r}px) `), (t.x !== 1 || t.y !== 1) && (i += `scale(${1 / t.x}, ${1 / t.y}) `), n) {
    const { transformPerspective: c, rotate: u, rotateX: h, rotateY: d, skewX: f, skewY: m } = n;
    c && (i = `perspective(${c}px) ${i}`), u && (i += `rotate(${u}deg) `), h && (i += `rotateX(${h}deg) `), d && (i += `rotateY(${d}deg) `), f && (i += `skewX(${f}deg) `), m && (i += `skewY(${m}deg) `);
  }
  const a = e.x.scale * t.x, l = e.y.scale * t.y;
  return (a !== 1 || l !== 1) && (i += `scale(${a}, ${l})`), i || "none";
}
const ot = {
  type: "projectionFrame",
  totalNodes: 0,
  resolvedTargetDeltas: 0,
  recalculatedProjection: 0
}, Mt = typeof window < "u" && window.MotionDebug !== void 0, Pe = ["", "X", "Y", "Z"], Rc = { visibility: "hidden" }, Fi = 1e3;
let Ec = 0;
function Se(e, t, n, i) {
  const { latestValues: s } = t;
  s[e] && (n[e] = s[e], t.setStaticValue(e, 0), i && (i[e] = 0));
}
function xr(e) {
  if (e.hasCheckedOptimisedAppear = !0, e.root === e)
    return;
  const { visualElement: t } = e.options;
  if (!t)
    return;
  const n = Cs(t);
  if (window.MotionHasOptimisedAnimation(n, "transform")) {
    const { layout: s, layoutId: o } = e.options;
    window.MotionCancelOptimisedAnimation(n, "transform", V, !(s || o));
  }
  const { parent: i } = e;
  i && !i.hasCheckedOptimisedAppear && xr(i);
}
function Tr({ attachResizeListener: e, defaultParent: t, measureScroll: n, checkIsScrollRoot: i, resetTransform: s }) {
  return class {
    constructor(r = {}, a = t?.()) {
      this.id = Ec++, this.animationId = 0, this.children = /* @__PURE__ */ new Set(), this.options = {}, this.isTreeAnimating = !1, this.isAnimationBlocked = !1, this.isLayoutDirty = !1, this.isProjectionDirty = !1, this.isSharedProjectionDirty = !1, this.isTransformDirty = !1, this.updateManuallyBlocked = !1, this.updateBlockedByResize = !1, this.isUpdating = !1, this.isSVG = !1, this.needsReset = !1, this.shouldResetTransform = !1, this.hasCheckedOptimisedAppear = !1, this.treeScale = { x: 1, y: 1 }, this.eventHandlers = /* @__PURE__ */ new Map(), this.hasTreeAnimated = !1, this.updateScheduled = !1, this.scheduleUpdate = () => this.update(), this.projectionUpdateScheduled = !1, this.checkUpdateFailed = () => {
        this.isUpdating && (this.isUpdating = !1, this.clearAllSnapshots());
      }, this.updateProjection = () => {
        this.projectionUpdateScheduled = !1, Mt && (ot.totalNodes = ot.resolvedTargetDeltas = ot.recalculatedProjection = 0), this.nodes.forEach(Fc), this.nodes.forEach(Nc), this.nodes.forEach(Uc), this.nodes.forEach(Ic), Mt && window.MotionDebug.record(ot);
      }, this.resolvedRelativeTargetAt = 0, this.hasProjected = !1, this.isVisible = !0, this.animationProgress = 0, this.sharedNodes = /* @__PURE__ */ new Map(), this.latestValues = r, this.root = a ? a.root || a : this, this.path = a ? [...a.path, a] : [], this.parent = a, this.depth = a ? a.depth + 1 : 0;
      for (let l = 0; l < this.path.length; l++)
        this.path[l].shouldResetTransform = !0;
      this.root === this && (this.nodes = new vc());
    }
    addEventListener(r, a) {
      return this.eventHandlers.has(r) || this.eventHandlers.set(r, new xn()), this.eventHandlers.get(r).add(a);
    }
    notifyListeners(r, ...a) {
      const l = this.eventHandlers.get(r);
      l && l.notify(...a);
    }
    hasListeners(r) {
      return this.eventHandlers.has(r);
    }
    /**
     * Lifecycles
     */
    mount(r, a = this.root.hasTreeAnimated) {
      if (this.instance)
        return;
      this.isSVG = gc(r), this.instance = r;
      const { layoutId: l, layout: c, visualElement: u } = this.options;
      if (u && !u.current && u.mount(r), this.root.nodes.add(this), this.parent && this.parent.children.add(this), a && (c || l) && (this.isLayoutDirty = !0), e) {
        let h;
        const d = () => this.root.updateBlockedByResize = !1;
        e(r, () => {
          this.root.updateBlockedByResize = !0, h && h(), h = xc(d, 250), qt.hasAnimatedSinceResize && (qt.hasAnimatedSinceResize = !1, this.nodes.forEach(Bi));
        });
      }
      l && this.root.registerSharedNode(l, this), this.options.animate !== !1 && u && (l || c) && this.addEventListener("didUpdate", ({ delta: h, hasLayoutChanged: d, hasRelativeTargetChanged: f, layout: m }) => {
        if (this.isTreeAnimationBlocked()) {
          this.target = void 0, this.relativeTarget = void 0;
          return;
        }
        const p = this.options.transition || u.getDefaultTransition() || Wc, { onLayoutAnimationStart: y, onLayoutAnimationComplete: g } = u.getProps(), x = !this.targetLayout || !vr(this.targetLayout, m) || f, T = !d && f;
        if (this.options.layoutRoot || this.resumeFrom && this.resumeFrom.instance || T || d && (x || !this.currentAnimation)) {
          this.resumeFrom && (this.resumingFrom = this.resumeFrom, this.resumingFrom.resumingFrom = void 0), this.setAnimationOrigin(h, T);
          const w = {
            ...fn(p, "layout"),
            onPlay: y,
            onComplete: g
          };
          (u.shouldReduceMotion || this.options.layoutRoot) && (w.delay = 0, w.type = !1), this.startAnimation(w);
        } else
          d || Bi(this), this.isLead() && this.options.onExitComplete && this.options.onExitComplete();
        this.targetLayout = m;
      });
    }
    unmount() {
      this.options.layoutId && this.willUpdate(), this.root.nodes.remove(this);
      const r = this.getStack();
      r && r.remove(this), this.parent && this.parent.children.delete(this), this.instance = void 0, et(this.updateProjection);
    }
    // only on the root
    blockUpdate() {
      this.updateManuallyBlocked = !0;
    }
    unblockUpdate() {
      this.updateManuallyBlocked = !1;
    }
    isUpdateBlocked() {
      return this.updateManuallyBlocked || this.updateBlockedByResize;
    }
    isTreeAnimationBlocked() {
      return this.isAnimationBlocked || this.parent && this.parent.isTreeAnimationBlocked() || !1;
    }
    // Note: currently only running on root node
    startUpdate() {
      this.isUpdateBlocked() || (this.isUpdating = !0, this.nodes && this.nodes.forEach(Kc), this.animationId++);
    }
    getTransformTemplate() {
      const { visualElement: r } = this.options;
      return r && r.getProps().transformTemplate;
    }
    willUpdate(r = !0) {
      if (this.root.hasTreeAnimated = !0, this.root.isUpdateBlocked()) {
        this.options.onExitComplete && this.options.onExitComplete();
        return;
      }
      if (window.MotionCancelOptimisedAnimation && !this.hasCheckedOptimisedAppear && xr(this), !this.root.isUpdating && this.root.startUpdate(), this.isLayoutDirty)
        return;
      this.isLayoutDirty = !0;
      for (let u = 0; u < this.path.length; u++) {
        const h = this.path[u];
        h.shouldResetTransform = !0, h.updateScroll("snapshot"), h.options.layoutRoot && h.willUpdate(!1);
      }
      const { layoutId: a, layout: l } = this.options;
      if (a === void 0 && !l)
        return;
      const c = this.getTransformTemplate();
      this.prevTransformTemplateValue = c ? c(this.latestValues, "") : void 0, this.updateSnapshot(), r && this.notifyListeners("willUpdate");
    }
    update() {
      if (this.updateScheduled = !1, this.isUpdateBlocked()) {
        this.unblockUpdate(), this.clearAllSnapshots(), this.nodes.forEach(Ii);
        return;
      }
      this.isUpdating || this.nodes.forEach(jc), this.isUpdating = !1, this.nodes.forEach(Oc), this.nodes.forEach(kc), this.nodes.forEach(Lc), this.clearAllSnapshots();
      const a = G.now();
      k.delta = J(0, 1e3 / 60, a - k.timestamp), k.timestamp = a, k.isProcessing = !0, fe.update.process(k), fe.preRender.process(k), fe.render.process(k), k.isProcessing = !1;
    }
    didUpdate() {
      this.updateScheduled || (this.updateScheduled = !0, nn.read(this.scheduleUpdate));
    }
    clearAllSnapshots() {
      this.nodes.forEach(Bc), this.sharedNodes.forEach(_c);
    }
    scheduleUpdateProjection() {
      this.projectionUpdateScheduled || (this.projectionUpdateScheduled = !0, V.preRender(this.updateProjection, !1, !0));
    }
    scheduleCheckAfterUnmount() {
      V.postRender(() => {
        this.isLayoutDirty ? this.root.didUpdate() : this.root.checkUpdateFailed();
      });
    }
    /**
     * Update measurements
     */
    updateSnapshot() {
      this.snapshot || !this.instance || (this.snapshot = this.measure());
    }
    updateLayout() {
      if (!this.instance || (this.updateScroll(), !(this.options.alwaysMeasureLayout && this.isLead()) && !this.isLayoutDirty))
        return;
      if (this.resumeFrom && !this.resumeFrom.instance)
        for (let l = 0; l < this.path.length; l++)
          this.path[l].updateScroll();
      const r = this.layout;
      this.layout = this.measure(!1), this.layoutCorrected = R(), this.isLayoutDirty = !1, this.projectionDelta = void 0, this.notifyListeners("measure", this.layout.layoutBox);
      const { visualElement: a } = this.options;
      a && a.notify("LayoutMeasure", this.layout.layoutBox, r ? r.layoutBox : void 0);
    }
    updateScroll(r = "measure") {
      let a = !!(this.options.layoutScroll && this.instance);
      if (this.scroll && this.scroll.animationId === this.root.animationId && this.scroll.phase === r && (a = !1), a) {
        const l = i(this.instance);
        this.scroll = {
          animationId: this.root.animationId,
          phase: r,
          isRoot: l,
          offset: n(this.instance),
          wasRoot: this.scroll ? this.scroll.isRoot : l
        };
      }
    }
    resetTransform() {
      if (!s)
        return;
      const r = this.isLayoutDirty || this.shouldResetTransform || this.options.alwaysMeasureLayout, a = this.projectionDelta && !yr(this.projectionDelta), l = this.getTransformTemplate(), c = l ? l(this.latestValues, "") : void 0, u = c !== this.prevTransformTemplateValue;
      r && (a || rt(this.latestValues) || u) && (s(this.instance, c), this.shouldResetTransform = !1, this.scheduleRender());
    }
    measure(r = !0) {
      const a = this.measurePageBox();
      let l = this.removeElementScroll(a);
      return r && (l = this.removeTransform(l)), Gc(l), {
        animationId: this.root.animationId,
        measuredBox: a,
        layoutBox: l,
        latestValues: {},
        source: this.id
      };
    }
    measurePageBox() {
      var r;
      const { visualElement: a } = this.options;
      if (!a)
        return R();
      const l = a.measureViewportBox();
      if (!(((r = this.scroll) === null || r === void 0 ? void 0 : r.wasRoot) || this.path.some(Hc))) {
        const { scroll: u } = this.root;
        u && (pt(l.x, u.offset.x), pt(l.y, u.offset.y));
      }
      return l;
    }
    removeElementScroll(r) {
      var a;
      const l = R();
      if (K(l, r), !((a = this.scroll) === null || a === void 0) && a.wasRoot)
        return l;
      for (let c = 0; c < this.path.length; c++) {
        const u = this.path[c], { scroll: h, options: d } = u;
        u !== this.root && h && d.layoutScroll && (h.wasRoot && K(l, r), pt(l.x, h.offset.x), pt(l.y, h.offset.y));
      }
      return l;
    }
    applyTransform(r, a = !1) {
      const l = R();
      K(l, r);
      for (let c = 0; c < this.path.length; c++) {
        const u = this.path[c];
        !a && u.options.layoutScroll && u.scroll && u !== u.root && gt(l, {
          x: -u.scroll.offset.x,
          y: -u.scroll.offset.y
        }), rt(u.latestValues) && gt(l, u.latestValues);
      }
      return rt(this.latestValues) && gt(l, this.latestValues), l;
    }
    removeTransform(r) {
      const a = R();
      K(a, r);
      for (let l = 0; l < this.path.length; l++) {
        const c = this.path[l];
        if (!c.instance || !rt(c.latestValues))
          continue;
        Ue(c.latestValues) && c.updateSnapshot();
        const u = R(), h = c.measurePageBox();
        K(u, h), Di(a, c.latestValues, c.snapshot ? c.snapshot.layoutBox : void 0, u);
      }
      return rt(this.latestValues) && Di(a, this.latestValues), a;
    }
    setTargetDelta(r) {
      this.targetDelta = r, this.root.scheduleUpdateProjection(), this.isProjectionDirty = !0;
    }
    setOptions(r) {
      this.options = {
        ...this.options,
        ...r,
        crossfade: r.crossfade !== void 0 ? r.crossfade : !0
      };
    }
    clearMeasurements() {
      this.scroll = void 0, this.layout = void 0, this.snapshot = void 0, this.prevTransformTemplateValue = void 0, this.targetDelta = void 0, this.target = void 0, this.isLayoutDirty = !1;
    }
    forceRelativeParentToResolveTarget() {
      this.relativeParent && this.relativeParent.resolvedRelativeTargetAt !== k.timestamp && this.relativeParent.resolveTargetDelta(!0);
    }
    resolveTargetDelta(r = !1) {
      var a;
      const l = this.getLead();
      this.isProjectionDirty || (this.isProjectionDirty = l.isProjectionDirty), this.isTransformDirty || (this.isTransformDirty = l.isTransformDirty), this.isSharedProjectionDirty || (this.isSharedProjectionDirty = l.isSharedProjectionDirty);
      const c = !!this.resumingFrom || this !== l;
      if (!(r || c && this.isSharedProjectionDirty || this.isProjectionDirty || !((a = this.parent) === null || a === void 0) && a.isProjectionDirty || this.attemptToResolveRelativeTarget || this.root.updateBlockedByResize))
        return;
      const { layout: h, layoutId: d } = this.options;
      if (!(!this.layout || !(h || d))) {
        if (this.resolvedRelativeTargetAt = k.timestamp, !this.targetDelta && !this.relativeTarget) {
          const f = this.getClosestProjectingParent();
          f && f.layout && this.animationProgress !== 1 ? (this.relativeParent = f, this.forceRelativeParentToResolveTarget(), this.relativeTarget = R(), this.relativeTargetOrigin = R(), Lt(this.relativeTargetOrigin, this.layout.layoutBox, f.layout.layoutBox), K(this.relativeTarget, this.relativeTargetOrigin)) : this.relativeParent = this.relativeTarget = void 0;
        }
        if (!(!this.relativeTarget && !this.targetDelta)) {
          if (this.target || (this.target = R(), this.targetWithTransforms = R()), this.relativeTarget && this.relativeTargetOrigin && this.relativeParent && this.relativeParent.target ? (this.forceRelativeParentToResolveTarget(), ql(this.target, this.relativeTarget, this.relativeParent.target)) : this.targetDelta ? (this.resumingFrom ? this.target = this.applyTransform(this.layout.layoutBox) : K(this.target, this.layout.layoutBox), hr(this.target, this.targetDelta)) : K(this.target, this.layout.layoutBox), this.attemptToResolveRelativeTarget) {
            this.attemptToResolveRelativeTarget = !1;
            const f = this.getClosestProjectingParent();
            f && !!f.resumingFrom == !!this.resumingFrom && !f.options.layoutScroll && f.target && this.animationProgress !== 1 ? (this.relativeParent = f, this.forceRelativeParentToResolveTarget(), this.relativeTarget = R(), this.relativeTargetOrigin = R(), Lt(this.relativeTargetOrigin, this.target, f.target), K(this.relativeTarget, this.relativeTargetOrigin)) : this.relativeParent = this.relativeTarget = void 0;
          }
          Mt && ot.resolvedTargetDeltas++;
        }
      }
    }
    getClosestProjectingParent() {
      if (!(!this.parent || Ue(this.parent.latestValues) || ur(this.parent.latestValues)))
        return this.parent.isProjecting() ? this.parent : this.parent.getClosestProjectingParent();
    }
    isProjecting() {
      return !!((this.relativeTarget || this.targetDelta || this.options.layoutRoot) && this.layout);
    }
    calcProjection() {
      var r;
      const a = this.getLead(), l = !!this.resumingFrom || this !== a;
      let c = !0;
      if ((this.isProjectionDirty || !((r = this.parent) === null || r === void 0) && r.isProjectionDirty) && (c = !1), l && (this.isSharedProjectionDirty || this.isTransformDirty) && (c = !1), this.resolvedRelativeTargetAt === k.timestamp && (c = !1), c)
        return;
      const { layout: u, layoutId: h } = this.options;
      if (this.isTreeAnimating = !!(this.parent && this.parent.isTreeAnimating || this.currentAnimation || this.pendingAnimation), this.isTreeAnimating || (this.targetDelta = this.relativeTarget = void 0), !this.layout || !(u || h))
        return;
      K(this.layoutCorrected, this.layout.layoutBox);
      const d = this.treeScale.x, f = this.treeScale.y;
      rc(this.layoutCorrected, this.treeScale, this.path, l), a.layout && !a.target && (this.treeScale.x !== 1 || this.treeScale.y !== 1) && (a.target = a.layout.layoutBox, a.targetWithTransforms = R());
      const { target: m } = a;
      if (!m) {
        this.prevProjectionDelta && (this.createProjectionDeltas(), this.scheduleRender());
        return;
      }
      !this.projectionDelta || !this.prevProjectionDelta ? this.createProjectionDeltas() : (Ai(this.prevProjectionDelta.x, this.projectionDelta.x), Ai(this.prevProjectionDelta.y, this.projectionDelta.y)), kt(this.projectionDelta, this.layoutCorrected, m, this.latestValues), (this.treeScale.x !== d || this.treeScale.y !== f || !Li(this.projectionDelta.x, this.prevProjectionDelta.x) || !Li(this.projectionDelta.y, this.prevProjectionDelta.y)) && (this.hasProjected = !0, this.scheduleRender(), this.notifyListeners("projectionUpdate", m)), Mt && ot.recalculatedProjection++;
    }
    hide() {
      this.isVisible = !1;
    }
    show() {
      this.isVisible = !0;
    }
    scheduleRender(r = !0) {
      var a;
      if ((a = this.options.visualElement) === null || a === void 0 || a.scheduleRender(), r) {
        const l = this.getStack();
        l && l.scheduleRender();
      }
      this.resumingFrom && !this.resumingFrom.instance && (this.resumingFrom = void 0);
    }
    createProjectionDeltas() {
      this.prevProjectionDelta = mt(), this.projectionDelta = mt(), this.projectionDeltaWithTransform = mt();
    }
    setAnimationOrigin(r, a = !1) {
      const l = this.snapshot, c = l ? l.latestValues : {}, u = { ...this.latestValues }, h = mt();
      (!this.relativeParent || !this.relativeParent.options.layoutRoot) && (this.relativeTarget = this.relativeTargetOrigin = void 0), this.attemptToResolveRelativeTarget = !a;
      const d = R(), f = l ? l.source : void 0, m = this.layout ? this.layout.source : void 0, p = f !== m, y = this.getStack(), g = !y || y.members.length <= 1, x = !!(p && !g && this.options.crossfade === !0 && !this.path.some(zc));
      this.animationProgress = 0;
      let T;
      this.mixTargetDelta = (w) => {
        const v = w / 1e3;
        ji(h.x, r.x, v), ji(h.y, r.y, v), this.setTargetDelta(h), this.relativeTarget && this.relativeTargetOrigin && this.layout && this.relativeParent && this.relativeParent.layout && (Lt(d, this.layout.layoutBox, this.relativeParent.layout.layoutBox), $c(this.relativeTarget, this.relativeTargetOrigin, d, v), T && Cc(this.relativeTarget, T) && (this.isProjectionDirty = !1), T || (T = R()), K(T, this.relativeTarget)), p && (this.animationValues = u, bc(u, c, this.latestValues, v, x, g)), this.root.scheduleUpdateProjection(), this.scheduleRender(), this.animationProgress = v;
      }, this.mixTargetDelta(this.options.layoutRoot ? 1e3 : 0);
    }
    startAnimation(r) {
      this.notifyListeners("animationStart"), this.currentAnimation && this.currentAnimation.stop(), this.resumingFrom && this.resumingFrom.currentAnimation && this.resumingFrom.currentAnimation.stop(), this.pendingAnimation && (et(this.pendingAnimation), this.pendingAnimation = void 0), this.pendingAnimation = V.update(() => {
        qt.hasAnimatedSinceResize = !0, this.currentAnimation = pc(0, Fi, {
          ...r,
          onUpdate: (a) => {
            this.mixTargetDelta(a), r.onUpdate && r.onUpdate(a);
          },
          onComplete: () => {
            r.onComplete && r.onComplete(), this.completeAnimation();
          }
        }), this.resumingFrom && (this.resumingFrom.currentAnimation = this.currentAnimation), this.pendingAnimation = void 0;
      });
    }
    completeAnimation() {
      this.resumingFrom && (this.resumingFrom.currentAnimation = void 0, this.resumingFrom.preserveOpacity = void 0);
      const r = this.getStack();
      r && r.exitAnimationComplete(), this.resumingFrom = this.currentAnimation = this.animationValues = void 0, this.notifyListeners("animationComplete");
    }
    finishAnimation() {
      this.currentAnimation && (this.mixTargetDelta && this.mixTargetDelta(Fi), this.currentAnimation.stop()), this.completeAnimation();
    }
    applyTransformsToTarget() {
      const r = this.getLead();
      let { targetWithTransforms: a, target: l, layout: c, latestValues: u } = r;
      if (!(!a || !l || !c)) {
        if (this !== r && this.layout && c && br(this.options.animationType, this.layout.layoutBox, c.layoutBox)) {
          l = this.target || R();
          const h = N(this.layout.layoutBox.x);
          l.x.min = r.target.x.min, l.x.max = l.x.min + h;
          const d = N(this.layout.layoutBox.y);
          l.y.min = r.target.y.min, l.y.max = l.y.min + d;
        }
        K(a, l), gt(a, u), kt(this.projectionDeltaWithTransform, this.layoutCorrected, a, u);
      }
    }
    registerSharedNode(r, a) {
      this.sharedNodes.has(r) || this.sharedNodes.set(r, new Dc()), this.sharedNodes.get(r).add(a);
      const c = a.options.initialPromotionConfig;
      a.promote({
        transition: c ? c.transition : void 0,
        preserveFollowOpacity: c && c.shouldPreserveFollowOpacity ? c.shouldPreserveFollowOpacity(a) : void 0
      });
    }
    isLead() {
      const r = this.getStack();
      return r ? r.lead === this : !0;
    }
    getLead() {
      var r;
      const { layoutId: a } = this.options;
      return a ? ((r = this.getStack()) === null || r === void 0 ? void 0 : r.lead) || this : this;
    }
    getPrevLead() {
      var r;
      const { layoutId: a } = this.options;
      return a ? (r = this.getStack()) === null || r === void 0 ? void 0 : r.prevLead : void 0;
    }
    getStack() {
      const { layoutId: r } = this.options;
      if (r)
        return this.root.sharedNodes.get(r);
    }
    promote({ needsReset: r, transition: a, preserveFollowOpacity: l } = {}) {
      const c = this.getStack();
      c && c.promote(this, l), r && (this.projectionDelta = void 0, this.needsReset = !0), a && this.setOptions({ transition: a });
    }
    relegate() {
      const r = this.getStack();
      return r ? r.relegate(this) : !1;
    }
    resetSkewAndRotation() {
      const { visualElement: r } = this.options;
      if (!r)
        return;
      let a = !1;
      const { latestValues: l } = r;
      if ((l.z || l.rotate || l.rotateX || l.rotateY || l.rotateZ || l.skewX || l.skewY) && (a = !0), !a)
        return;
      const c = {};
      l.z && Se("z", r, c, this.animationValues);
      for (let u = 0; u < Pe.length; u++)
        Se(`rotate${Pe[u]}`, r, c, this.animationValues), Se(`skew${Pe[u]}`, r, c, this.animationValues);
      r.render();
      for (const u in c)
        r.setStaticValue(u, c[u]), this.animationValues && (this.animationValues[u] = c[u]);
      r.scheduleRender();
    }
    getProjectionStyles(r) {
      var a, l;
      if (!this.instance || this.isSVG)
        return;
      if (!this.isVisible)
        return Rc;
      const c = {
        visibility: ""
      }, u = this.getTransformTemplate();
      if (this.needsReset)
        return this.needsReset = !1, c.opacity = "", c.pointerEvents = Xt(r?.pointerEvents) || "", c.transform = u ? u(this.latestValues, "") : "none", c;
      const h = this.getLead();
      if (!this.projectionDelta || !this.layout || !h.target) {
        const p = {};
        return this.options.layoutId && (p.opacity = this.latestValues.opacity !== void 0 ? this.latestValues.opacity : 1, p.pointerEvents = Xt(r?.pointerEvents) || ""), this.hasProjected && !rt(this.latestValues) && (p.transform = u ? u({}, "") : "none", this.hasProjected = !1), p;
      }
      const d = h.animationValues || h.latestValues;
      this.applyTransformsToTarget(), c.transform = Mc(this.projectionDeltaWithTransform, this.treeScale, d), u && (c.transform = u(d, c.transform));
      const { x: f, y: m } = this.projectionDelta;
      c.transformOrigin = `${f.origin * 100}% ${m.origin * 100}% 0`, h.animationValues ? c.opacity = h === this ? (l = (a = d.opacity) !== null && a !== void 0 ? a : this.latestValues.opacity) !== null && l !== void 0 ? l : 1 : this.preserveOpacity ? this.latestValues.opacity : d.opacityExit : c.opacity = h === this ? d.opacity !== void 0 ? d.opacity : "" : d.opacityExit !== void 0 ? d.opacityExit : 0;
      for (const p in Qt) {
        if (d[p] === void 0)
          continue;
        const { correct: y, applyTo: g } = Qt[p], x = c.transform === "none" ? d[p] : y(d[p], h);
        if (g) {
          const T = g.length;
          for (let w = 0; w < T; w++)
            c[g[w]] = x;
        } else
          c[p] = x;
      }
      return this.options.layoutId && (c.pointerEvents = h === this ? Xt(r?.pointerEvents) || "" : "none"), c;
    }
    clearSnapshot() {
      this.resumeFrom = this.snapshot = void 0;
    }
    // Only run on root
    resetTree() {
      this.root.nodes.forEach((r) => {
        var a;
        return (a = r.currentAnimation) === null || a === void 0 ? void 0 : a.stop();
      }), this.root.nodes.forEach(Ii), this.root.sharedNodes.clear();
    }
  };
}
function kc(e) {
  e.updateLayout();
}
function Lc(e) {
  var t;
  const n = ((t = e.resumeFrom) === null || t === void 0 ? void 0 : t.snapshot) || e.snapshot;
  if (e.isLead() && e.layout && n && e.hasListeners("didUpdate")) {
    const { layoutBox: i, measuredBox: s } = e.layout, { animationType: o } = e.options, r = n.source !== e.layout.source;
    o === "size" ? _((h) => {
      const d = r ? n.measuredBox[h] : n.layoutBox[h], f = N(d);
      d.min = i[h].min, d.max = d.min + f;
    }) : br(o, n.layoutBox, i) && _((h) => {
      const d = r ? n.measuredBox[h] : n.layoutBox[h], f = N(i[h]);
      d.max = d.min + f, e.relativeTarget && !e.currentAnimation && (e.isProjectionDirty = !0, e.relativeTarget[h].max = e.relativeTarget[h].min + f);
    });
    const a = mt();
    kt(a, i, n.layoutBox);
    const l = mt();
    r ? kt(l, e.applyTransform(s, !0), n.measuredBox) : kt(l, i, n.layoutBox);
    const c = !yr(a);
    let u = !1;
    if (!e.resumeFrom) {
      const h = e.getClosestProjectingParent();
      if (h && !h.resumeFrom) {
        const { snapshot: d, layout: f } = h;
        if (d && f) {
          const m = R();
          Lt(m, n.layoutBox, d.layoutBox);
          const p = R();
          Lt(p, i, f.layoutBox), vr(m, p) || (u = !0), h.options.layoutRoot && (e.relativeTarget = p, e.relativeTargetOrigin = m, e.relativeParent = h);
        }
      }
    }
    e.notifyListeners("didUpdate", {
      layout: i,
      snapshot: n,
      delta: l,
      layoutDelta: a,
      hasLayoutChanged: c,
      hasRelativeTargetChanged: u
    });
  } else if (e.isLead()) {
    const { onExitComplete: i } = e.options;
    i && i();
  }
  e.options.transition = void 0;
}
function Fc(e) {
  Mt && ot.totalNodes++, e.parent && (e.isProjecting() || (e.isProjectionDirty = e.parent.isProjectionDirty), e.isSharedProjectionDirty || (e.isSharedProjectionDirty = !!(e.isProjectionDirty || e.parent.isProjectionDirty || e.parent.isSharedProjectionDirty)), e.isTransformDirty || (e.isTransformDirty = e.parent.isTransformDirty));
}
function Ic(e) {
  e.isProjectionDirty = e.isSharedProjectionDirty = e.isTransformDirty = !1;
}
function Bc(e) {
  e.clearSnapshot();
}
function Ii(e) {
  e.clearMeasurements();
}
function jc(e) {
  e.isLayoutDirty = !1;
}
function Oc(e) {
  const { visualElement: t } = e.options;
  t && t.getProps().onBeforeLayoutMeasure && t.notify("BeforeLayoutMeasure"), e.resetTransform();
}
function Bi(e) {
  e.finishAnimation(), e.targetDelta = e.relativeTarget = e.target = void 0, e.isProjectionDirty = !0;
}
function Nc(e) {
  e.resolveTargetDelta();
}
function Uc(e) {
  e.calcProjection();
}
function Kc(e) {
  e.resetSkewAndRotation();
}
function _c(e) {
  e.removeLeadSnapshot();
}
function ji(e, t, n) {
  e.translate = C(t.translate, 0, n), e.scale = C(t.scale, 1, n), e.origin = t.origin, e.originPoint = t.originPoint;
}
function Oi(e, t, n, i) {
  e.min = C(t.min, n.min, i), e.max = C(t.max, n.max, i);
}
function $c(e, t, n, i) {
  Oi(e.x, t.x, n.x, i), Oi(e.y, t.y, n.y, i);
}
function zc(e) {
  return e.animationValues && e.animationValues.opacityExit !== void 0;
}
const Wc = {
  duration: 0.45,
  ease: [0.4, 0, 0.1, 1]
}, Ni = (e) => typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().includes(e), Ui = Ni("applewebkit/") && !Ni("chrome/") ? Math.round : O;
function Ki(e) {
  e.min = Ui(e.min), e.max = Ui(e.max);
}
function Gc(e) {
  Ki(e.x), Ki(e.y);
}
function br(e, t, n) {
  return e === "position" || e === "preserve-aspect" && !Yl(ki(t), ki(n), 0.2);
}
function Hc(e) {
  var t;
  return e !== e.root && ((t = e.scroll) === null || t === void 0 ? void 0 : t.wasRoot);
}
const Xc = Tr({
  attachResizeListener: (e, t) => Nt(e, "resize", t),
  measureScroll: () => ({
    x: document.documentElement.scrollLeft || document.body.scrollLeft,
    y: document.documentElement.scrollTop || document.body.scrollTop
  }),
  checkIsScrollRoot: () => !0
}), we = {
  current: void 0
}, Pr = Tr({
  measureScroll: (e) => ({
    x: e.scrollLeft,
    y: e.scrollTop
  }),
  defaultParent: () => {
    if (!we.current) {
      const e = new Xc({});
      e.mount(window), e.setOptions({ layoutScroll: !0 }), we.current = e;
    }
    return we.current;
  },
  resetTransform: (e, t) => {
    e.style.transform = t !== void 0 ? t : "none";
  },
  checkIsScrollRoot: (e) => window.getComputedStyle(e).position === "fixed"
}), Yc = {
  pan: {
    Feature: hc
  },
  drag: {
    Feature: uc,
    ProjectionNode: Pr,
    MeasureLayout: mr
  }
};
function _i(e, t, n) {
  const { props: i } = e;
  e.animationState && i.whileHover && e.animationState.setActive("whileHover", n === "Start");
  const s = "onHover" + n, o = i[s];
  o && V.postRender(() => o(t, $t(t)));
}
class qc extends it {
  mount() {
    const { current: t } = this.node;
    t && (this.unmount = Yo(t, (n) => (_i(this.node, n, "Start"), (i) => _i(this.node, i, "End"))));
  }
  unmount() {
  }
}
class Zc extends it {
  constructor() {
    super(...arguments), this.isActive = !1;
  }
  onFocus() {
    let t = !1;
    try {
      t = this.node.current.matches(":focus-visible");
    } catch {
      t = !0;
    }
    !t || !this.node.animationState || (this.node.animationState.setActive("whileFocus", !0), this.isActive = !0);
  }
  onBlur() {
    !this.isActive || !this.node.animationState || (this.node.animationState.setActive("whileFocus", !1), this.isActive = !1);
  }
  mount() {
    this.unmount = _t(Nt(this.node.current, "focus", () => this.onFocus()), Nt(this.node.current, "blur", () => this.onBlur()));
  }
  unmount() {
  }
}
function $i(e, t, n) {
  const { props: i } = e;
  e.animationState && i.whileTap && e.animationState.setActive("whileTap", n === "Start");
  const s = "onTap" + (n === "End" ? "" : n), o = i[s];
  o && V.postRender(() => o(t, $t(t)));
}
class Jc extends it {
  mount() {
    const { current: t } = this.node;
    t && (this.unmount = Qo(t, (n) => ($i(this.node, n, "Start"), (i, { success: s }) => $i(this.node, i, s ? "End" : "Cancel")), { useGlobalTarget: this.node.props.globalTapTarget }));
  }
  unmount() {
  }
}
const _e = /* @__PURE__ */ new WeakMap(), Ae = /* @__PURE__ */ new WeakMap(), Qc = (e) => {
  const t = _e.get(e.target);
  t && t(e);
}, tu = (e) => {
  e.forEach(Qc);
};
function eu({ root: e, ...t }) {
  const n = e || document;
  Ae.has(n) || Ae.set(n, {});
  const i = Ae.get(n), s = JSON.stringify(t);
  return i[s] || (i[s] = new IntersectionObserver(tu, { root: e, ...t })), i[s];
}
function nu(e, t, n) {
  const i = eu(t);
  return _e.set(e, n), i.observe(e), () => {
    _e.delete(e), i.unobserve(e);
  };
}
const iu = {
  some: 0,
  all: 1
};
class su extends it {
  constructor() {
    super(...arguments), this.hasEnteredView = !1, this.isInView = !1;
  }
  startObserver() {
    this.unmount();
    const { viewport: t = {} } = this.node.getProps(), { root: n, margin: i, amount: s = "some", once: o } = t, r = {
      root: n ? n.current : void 0,
      rootMargin: i,
      threshold: typeof s == "number" ? s : iu[s]
    }, a = (l) => {
      const { isIntersecting: c } = l;
      if (this.isInView === c || (this.isInView = c, o && !c && this.hasEnteredView))
        return;
      c && (this.hasEnteredView = !0), this.node.animationState && this.node.animationState.setActive("whileInView", c);
      const { onViewportEnter: u, onViewportLeave: h } = this.node.getProps(), d = c ? u : h;
      d && d(l);
    };
    return nu(this.node.current, r, a);
  }
  mount() {
    this.startObserver();
  }
  update() {
    if (typeof IntersectionObserver > "u")
      return;
    const { props: t, prevProps: n } = this.node;
    ["amount", "margin", "root"].some(ru(t, n)) && this.startObserver();
  }
  unmount() {
  }
}
function ru({ viewport: e = {} }, { viewport: t = {} } = {}) {
  return (n) => e[n] !== t[n];
}
const ou = {
  inView: {
    Feature: su
  },
  tap: {
    Feature: Jc
  },
  focus: {
    Feature: Zc
  },
  hover: {
    Feature: qc
  }
}, au = {
  layout: {
    ProjectionNode: Pr,
    MeasureLayout: mr
  }
}, $e = { current: null }, Sr = { current: !1 };
function lu() {
  if (Sr.current = !0, !!Ze)
    if (window.matchMedia) {
      const e = window.matchMedia("(prefers-reduced-motion)"), t = () => $e.current = e.matches;
      e.addListener(t), t();
    } else
      $e.current = !1;
}
const cu = [...Xs, F, nt], uu = (e) => cu.find(Hs(e)), zi = /* @__PURE__ */ new WeakMap();
function hu(e, t, n) {
  for (const i in t) {
    const s = t[i], o = n[i];
    if (B(s))
      e.addValue(i, s);
    else if (B(o))
      e.addValue(i, jt(s, { owner: e }));
    else if (o !== s)
      if (e.hasValue(i)) {
        const r = e.getValue(i);
        r.liveStyle === !0 ? r.jump(s) : r.hasAnimated || r.set(s);
      } else {
        const r = e.getStaticValue(i);
        e.addValue(i, jt(r !== void 0 ? r : s, { owner: e }));
      }
  }
  for (const i in n)
    t[i] === void 0 && e.removeValue(i);
  return t;
}
const Wi = [
  "AnimationStart",
  "AnimationComplete",
  "Update",
  "BeforeLayoutMeasure",
  "LayoutMeasure",
  "LayoutAnimationStart",
  "LayoutAnimationComplete"
];
class du {
  /**
   * This method takes React props and returns found MotionValues. For example, HTML
   * MotionValues will be found within the style prop, whereas for Three.js within attribute arrays.
   *
   * This isn't an abstract method as it needs calling in the constructor, but it is
   * intended to be one.
   */
  scrapeMotionValuesFromProps(t, n, i) {
    return {};
  }
  constructor({ parent: t, props: n, presenceContext: i, reducedMotionConfig: s, blockInitialAnimation: o, visualState: r }, a = {}) {
    this.current = null, this.children = /* @__PURE__ */ new Set(), this.isVariantNode = !1, this.isControllingVariants = !1, this.shouldReduceMotion = null, this.values = /* @__PURE__ */ new Map(), this.KeyframeResolver = An, this.features = {}, this.valueSubscriptions = /* @__PURE__ */ new Map(), this.prevMotionValues = {}, this.events = {}, this.propEventSubscriptions = {}, this.notifyUpdate = () => this.notify("Update", this.latestValues), this.render = () => {
      this.current && (this.triggerBuild(), this.renderInstance(this.current, this.renderState, this.props.style, this.projection));
    }, this.renderScheduledAt = 0, this.scheduleRender = () => {
      const f = G.now();
      this.renderScheduledAt < f && (this.renderScheduledAt = f, V.render(this.render, !1, !0));
    };
    const { latestValues: l, renderState: c, onUpdate: u } = r;
    this.onUpdate = u, this.latestValues = l, this.baseTarget = { ...l }, this.initialValues = n.initial ? { ...l } : {}, this.renderState = c, this.parent = t, this.props = n, this.presenceContext = i, this.depth = t ? t.depth + 1 : 0, this.reducedMotionConfig = s, this.options = a, this.blockInitialAnimation = !!o, this.isControllingVariants = le(n), this.isVariantNode = ns(n), this.isVariantNode && (this.variantChildren = /* @__PURE__ */ new Set()), this.manuallyAnimateOnMount = !!(t && t.current);
    const { willChange: h, ...d } = this.scrapeMotionValuesFromProps(n, {}, this);
    for (const f in d) {
      const m = d[f];
      l[f] !== void 0 && B(m) && m.set(l[f], !1);
    }
  }
  mount(t) {
    this.current = t, zi.set(t, this), this.projection && !this.projection.instance && this.projection.mount(t), this.parent && this.isVariantNode && !this.isControllingVariants && (this.removeFromVariantTree = this.parent.addVariantChild(this)), this.values.forEach((n, i) => this.bindToMotionValue(i, n)), Sr.current || lu(), this.shouldReduceMotion = this.reducedMotionConfig === "never" ? !1 : this.reducedMotionConfig === "always" ? !0 : $e.current, this.parent && this.parent.children.add(this), this.update(this.props, this.presenceContext);
  }
  unmount() {
    zi.delete(this.current), this.projection && this.projection.unmount(), et(this.notifyUpdate), et(this.render), this.valueSubscriptions.forEach((t) => t()), this.valueSubscriptions.clear(), this.removeFromVariantTree && this.removeFromVariantTree(), this.parent && this.parent.children.delete(this);
    for (const t in this.events)
      this.events[t].clear();
    for (const t in this.features) {
      const n = this.features[t];
      n && (n.unmount(), n.isMounted = !1);
    }
    this.current = null;
  }
  bindToMotionValue(t, n) {
    this.valueSubscriptions.has(t) && this.valueSubscriptions.get(t)();
    const i = ut.has(t), s = n.on("change", (a) => {
      this.latestValues[t] = a, this.props.onUpdate && V.preRender(this.notifyUpdate), i && this.projection && (this.projection.isTransformDirty = !0);
    }), o = n.on("renderRequest", this.scheduleRender);
    let r;
    window.MotionCheckAppearSync && (r = window.MotionCheckAppearSync(this, t, n)), this.valueSubscriptions.set(t, () => {
      s(), o(), r && r(), n.owner && n.stop();
    });
  }
  sortNodePosition(t) {
    return !this.current || !this.sortInstanceNodePosition || this.type !== t.type ? 0 : this.sortInstanceNodePosition(this.current, t.current);
  }
  updateFeatures() {
    let t = "animation";
    for (t in vt) {
      const n = vt[t];
      if (!n)
        continue;
      const { isEnabled: i, Feature: s } = n;
      if (!this.features[t] && s && i(this.props) && (this.features[t] = new s(this)), this.features[t]) {
        const o = this.features[t];
        o.isMounted ? o.update() : (o.mount(), o.isMounted = !0);
      }
    }
  }
  triggerBuild() {
    this.build(this.renderState, this.latestValues, this.props);
  }
  /**
   * Measure the current viewport box with or without transforms.
   * Only measures axis-aligned boxes, rotate and skew must be manually
   * removed with a re-render to work.
   */
  measureViewportBox() {
    return this.current ? this.measureInstanceViewportBox(this.current, this.props) : R();
  }
  getStaticValue(t) {
    return this.latestValues[t];
  }
  setStaticValue(t, n) {
    this.latestValues[t] = n;
  }
  /**
   * Update the provided props. Ensure any newly-added motion values are
   * added to our map, old ones removed, and listeners updated.
   */
  update(t, n) {
    (t.transformTemplate || this.props.transformTemplate) && this.scheduleRender(), this.prevProps = this.props, this.props = t, this.prevPresenceContext = this.presenceContext, this.presenceContext = n;
    for (let i = 0; i < Wi.length; i++) {
      const s = Wi[i];
      this.propEventSubscriptions[s] && (this.propEventSubscriptions[s](), delete this.propEventSubscriptions[s]);
      const o = "on" + s, r = t[o];
      r && (this.propEventSubscriptions[s] = this.on(s, r));
    }
    this.prevMotionValues = hu(this, this.scrapeMotionValuesFromProps(t, this.prevProps, this), this.prevMotionValues), this.handleChildMotionValue && this.handleChildMotionValue(), this.onUpdate && this.onUpdate(this);
  }
  getProps() {
    return this.props;
  }
  /**
   * Returns the variant definition with a given name.
   */
  getVariant(t) {
    return this.props.variants ? this.props.variants[t] : void 0;
  }
  /**
   * Returns the defined default transition on this component.
   */
  getDefaultTransition() {
    return this.props.transition;
  }
  getTransformPagePoint() {
    return this.props.transformPagePoint;
  }
  getClosestVariantNode() {
    return this.isVariantNode ? this : this.parent ? this.parent.getClosestVariantNode() : void 0;
  }
  /**
   * Add a child visual element to our set of children.
   */
  addVariantChild(t) {
    const n = this.getClosestVariantNode();
    if (n)
      return n.variantChildren && n.variantChildren.add(t), () => n.variantChildren.delete(t);
  }
  /**
   * Add a motion value and bind it to this visual element.
   */
  addValue(t, n) {
    const i = this.values.get(t);
    n !== i && (i && this.removeValue(t), this.bindToMotionValue(t, n), this.values.set(t, n), this.latestValues[t] = n.get());
  }
  /**
   * Remove a motion value and unbind any active subscriptions.
   */
  removeValue(t) {
    this.values.delete(t);
    const n = this.valueSubscriptions.get(t);
    n && (n(), this.valueSubscriptions.delete(t)), delete this.latestValues[t], this.removeValueFromRenderState(t, this.renderState);
  }
  /**
   * Check whether we have a motion value for this key
   */
  hasValue(t) {
    return this.values.has(t);
  }
  getValue(t, n) {
    if (this.props.values && this.props.values[t])
      return this.props.values[t];
    let i = this.values.get(t);
    return i === void 0 && n !== void 0 && (i = jt(n === null ? void 0 : n, { owner: this }), this.addValue(t, i)), i;
  }
  /**
   * If we're trying to animate to a previously unencountered value,
   * we need to check for it in our state and as a last resort read it
   * directly from the instance (which might have performance implications).
   */
  readValue(t, n) {
    var i;
    let s = this.latestValues[t] !== void 0 || !this.current ? this.latestValues[t] : (i = this.getBaseTargetFromProps(this.props, t)) !== null && i !== void 0 ? i : this.readValueFromInstance(this.current, t, this.options);
    return s != null && (typeof s == "string" && (Ws(s) || Bs(s)) ? s = parseFloat(s) : !uu(s) && nt.test(n) && (s = _s(t, n)), this.setBaseTarget(t, B(s) ? s.get() : s)), B(s) ? s.get() : s;
  }
  /**
   * Set the base target to later animate back to. This is currently
   * only hydrated on creation and when we first read a value.
   */
  setBaseTarget(t, n) {
    this.baseTarget[t] = n;
  }
  /**
   * Find the base target for a value thats been removed from all animation
   * props.
   */
  getBaseTarget(t) {
    var n;
    const { initial: i } = this.props;
    let s;
    if (typeof i == "string" || typeof i == "object") {
      const r = rn(this.props, i, (n = this.presenceContext) === null || n === void 0 ? void 0 : n.custom);
      r && (s = r[t]);
    }
    if (i && s !== void 0)
      return s;
    const o = this.getBaseTargetFromProps(this.props, t);
    return o !== void 0 && !B(o) ? o : this.initialValues[t] !== void 0 && s === void 0 ? void 0 : this.baseTarget[t];
  }
  on(t, n) {
    return this.events[t] || (this.events[t] = new xn()), this.events[t].add(n);
  }
  notify(t, ...n) {
    this.events[t] && this.events[t].notify(...n);
  }
}
class wr extends du {
  constructor() {
    super(...arguments), this.KeyframeResolver = Ys;
  }
  sortInstanceNodePosition(t, n) {
    return t.compareDocumentPosition(n) & 2 ? 1 : -1;
  }
  getBaseTargetFromProps(t, n) {
    return t.style ? t.style[n] : void 0;
  }
  removeValueFromRenderState(t, { vars: n, style: i }) {
    delete n[t], delete i[t];
  }
  handleChildMotionValue() {
    this.childSubscription && (this.childSubscription(), delete this.childSubscription);
    const { children: t } = this.props;
    B(t) && (this.childSubscription = t.on("change", (n) => {
      this.current && (this.current.textContent = `${n}`);
    }));
  }
}
function fu(e) {
  return window.getComputedStyle(e);
}
class mu extends wr {
  constructor() {
    super(...arguments), this.type = "html", this.renderInstance = hs;
  }
  readValueFromInstance(t, n) {
    if (ut.has(n)) {
      const i = wn(n);
      return i && i.default || 0;
    } else {
      const i = fu(t), s = (ls(n) ? i.getPropertyValue(n) : i[n]) || 0;
      return typeof s == "string" ? s.trim() : s;
    }
  }
  measureInstanceViewportBox(t, { transformPagePoint: n }) {
    return dr(t, n);
  }
  build(t, n, i) {
    ln(t, n, i.transformTemplate);
  }
  scrapeMotionValuesFromProps(t, n, i) {
    return dn(t, n, i);
  }
}
class pu extends wr {
  constructor() {
    super(...arguments), this.type = "svg", this.isSVGTag = !1, this.measureInstanceViewportBox = R;
  }
  getBaseTargetFromProps(t, n) {
    return t[n];
  }
  readValueFromInstance(t, n) {
    if (ut.has(n)) {
      const i = wn(n);
      return i && i.default || 0;
    }
    return n = ds.has(n) ? n : en(n), t.getAttribute(n);
  }
  scrapeMotionValuesFromProps(t, n, i) {
    return ps(t, n, i);
  }
  build(t, n, i) {
    cn(t, n, this.isSVGTag, i.transformTemplate);
  }
  renderInstance(t, n, i, s) {
    fs(t, n, i, s);
  }
  mount(t) {
    this.isSVGTag = hn(t.tagName), super.mount(t);
  }
}
const gu = (e, t) => sn(e) ? new pu(t) : new mu(t, {
  allowProjection: e !== Xi
}), yu = /* @__PURE__ */ _o({
  ...Ul,
  ...ou,
  ...Yc,
  ...au
}, gu), z = /* @__PURE__ */ no(yu);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const vu = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), Ar = (...e) => e.filter((t, n, i) => !!t && t.trim() !== "" && i.indexOf(t) === n).join(" ").trim();
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
var xu = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Tu = We(
  ({
    color: e = "currentColor",
    size: t = 24,
    strokeWidth: n = 2,
    absoluteStrokeWidth: i,
    className: s = "",
    children: o,
    iconNode: r,
    ...a
  }, l) => Zt(
    "svg",
    {
      ref: l,
      ...xu,
      width: t,
      height: t,
      stroke: e,
      strokeWidth: i ? Number(n) * 24 / Number(t) : n,
      className: Ar("lucide", s),
      ...a
    },
    [
      ...r.map(([c, u]) => Zt(c, u)),
      ...Array.isArray(o) ? o : [o]
    ]
  )
);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const wt = (e, t) => {
  const n = We(
    ({ className: i, ...s }, o) => Zt(Tu, {
      ref: o,
      iconNode: t,
      className: Ar(`lucide-${vu(e)}`, i),
      ...s
    })
  );
  return n.displayName = `${e}`, n;
};
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const bu = wt("Bell", [
  ["path", { d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", key: "1qo2s2" }],
  ["path", { d: "M10.3 21a1.94 1.94 0 0 0 3.4 0", key: "qgo35s" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Pu = wt("Pause", [
  ["rect", { x: "14", y: "4", width: "4", height: "16", rx: "1", key: "zuxfzm" }],
  ["rect", { x: "6", y: "4", width: "4", height: "16", rx: "1", key: "1okwgv" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Su = wt("Play", [
  ["polygon", { points: "6 3 20 12 6 21 6 3", key: "1oa8hb" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const wu = wt("Plus", [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Au = wt("RotateCcw", [
  ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Vu = wt("X", [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
]), Cu = [
  ["--tm-bg", "--theme-canvas"],
  ["--tm-surface", "--theme-surface"],
  ["--tm-fg", "--theme-ink"],
  ["--tm-dim", "--theme-ink-dim"],
  ["--tm-faint", "--theme-muted"],
  ["--tm-border", "--theme-border"],
  ["--tm-accent", "--theme-accent"],
  ["--tm-accent-fg", "--theme-accent-fg"]
], Du = [
  ["--tm-font-digit", "--theme-font-code"]
];
function Mu(e, t) {
  const n = getComputedStyle(document.documentElement);
  for (const [i, s] of [...Cu, ...Du]) {
    if (!t) {
      e.style.removeProperty(i);
      continue;
    }
    const o = n.getPropertyValue(s).trim();
    o && e.style.setProperty(i, o);
  }
}
function Ru(e) {
  const t = new MutationObserver(e);
  return t.observe(document.documentElement, {
    attributes: !0,
    attributeFilter: ["data-mode", "data-contrast", "style", "class"]
  }), () => t.disconnect();
}
function Eu() {
  const [e, t] = tt(() => /* @__PURE__ */ new Date()), [n, i] = tt(!1);
  return bt(() => {
    const s = setInterval(() => t(/* @__PURE__ */ new Date()), 1e4);
    return () => clearInterval(s);
  }, []), /* @__PURE__ */ b(
    "button",
    {
      type: "button",
      className: "tm-clock",
      "data-dimmed": n,
      onClick: () => i((s) => !s),
      title: n ? "Show clock" : "Dim clock",
      children: e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
  );
}
const ku = [15, 25, 30, 45, 60, 90, 120];
function Lu(e) {
  if (e < 60) return `${e}m`;
  const t = e / 60;
  return Number.isInteger(t) ? `${t}h` : `${t}h`;
}
function Fu({
  totalSeconds: e,
  onSelect: t,
  onStart: n
}) {
  const [i, s] = tt(""), o = Math.round(e / 60);
  return /* @__PURE__ */ E(
    z.div,
    {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.05 },
      style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 18 },
      children: [
        /* @__PURE__ */ b("span", { className: "tm-label", children: "Focus duration" }),
        /* @__PURE__ */ b("div", { className: "tm-presets", children: ku.map((r) => /* @__PURE__ */ b(
          "button",
          {
            type: "button",
            className: "tm-preset",
            "data-selected": !i && o === r,
            onClick: () => {
              s(""), t(r);
            },
            children: Lu(r)
          },
          r
        )) }),
        /* @__PURE__ */ b("div", { className: "tm-row", children: /* @__PURE__ */ b(
          "input",
          {
            className: "tm-custom",
            type: "number",
            min: 1,
            max: 480,
            placeholder: "Custom",
            value: i,
            onChange: (r) => {
              const a = r.target.value;
              s(a);
              const l = Number.parseInt(a, 10);
              Number.isFinite(l) && l > 0 && t(l);
            },
            onKeyDown: (r) => {
              r.key === "Enter" && (r.preventDefault(), r.stopPropagation(), n());
            }
          }
        ) }),
        /* @__PURE__ */ b("button", { type: "button", className: "tm-primary", onClick: n, children: "Start focus" })
      ]
    }
  );
}
function Iu({
  reminder: e,
  onDismiss: t
}) {
  return /* @__PURE__ */ b(
    z.div,
    {
      className: "tm-alert",
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.25 },
      children: /* @__PURE__ */ E(
        z.div,
        {
          className: "tm-alert-card",
          initial: { scale: 0.94, y: 10 },
          animate: { scale: 1, y: 0 },
          transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
          children: [
            /* @__PURE__ */ b(
              z.div,
              {
                className: "tm-alert-icon",
                animate: { scale: [1, 1.08, 1] },
                transition: { repeat: 1 / 0, duration: 1.6 },
                children: "⏰"
              }
            ),
            /* @__PURE__ */ E("div", { children: [
              /* @__PURE__ */ b("div", { style: { fontSize: 17, fontWeight: 600, marginBottom: 3 }, children: e.label }),
              /* @__PURE__ */ b("div", { className: "tm-reminder-sub", children: "Timer paused until you dismiss this" })
            ] }),
            /* @__PURE__ */ b("button", { type: "button", className: "tm-primary", style: { width: "100%" }, onClick: t, children: "Done" })
          ]
        }
      )
    }
  );
}
function Bu({
  reminders: e,
  onAdd: t,
  onRemove: n
}) {
  const [i, s] = tt(""), [o, r] = tt("30"), [a, l] = tt(!1), c = () => {
    const h = Number.parseInt(o, 10);
    !i.trim() || !Number.isFinite(h) || h <= 0 || (t(i, h), s(""), r("30"), l(!1));
  }, u = (h) => h.stopPropagation();
  return /* @__PURE__ */ E(
    z.div,
    {
      className: "tm-reminders",
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.12 },
      children: [
        /* @__PURE__ */ E("div", { className: "tm-reminders-head", children: [
          /* @__PURE__ */ E("span", { className: "tm-label", style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [
            /* @__PURE__ */ b(bu, { size: 12 }),
            "Reminders"
          ] }),
          a ? null : /* @__PURE__ */ E(
            "button",
            {
              type: "button",
              className: "tm-ghost",
              style: { display: "inline-flex", alignItems: "center", gap: 4 },
              onClick: () => l(!0),
              children: [
                /* @__PURE__ */ b(wu, { size: 12 }),
                "Add"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ E(Ce, { mode: "popLayout", children: [
          a ? /* @__PURE__ */ E(
            z.div,
            {
              className: "tm-add",
              initial: { opacity: 0, height: 0 },
              animate: { opacity: 1, height: "auto" },
              exit: { opacity: 0, height: 0 },
              transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
              children: [
                /* @__PURE__ */ b(
                  "input",
                  {
                    autoFocus: !0,
                    type: "text",
                    placeholder: "e.g. Stand up and stretch",
                    value: i,
                    onChange: (h) => s(h.target.value),
                    onKeyDown: (h) => {
                      u(h), h.key === "Enter" && c(), h.key === "Escape" && l(!1);
                    }
                  }
                ),
                /* @__PURE__ */ E("div", { className: "tm-row", children: [
                  /* @__PURE__ */ b("span", { className: "tm-reminder-sub", children: "Every" }),
                  /* @__PURE__ */ b(
                    "input",
                    {
                      type: "number",
                      min: 1,
                      style: { width: 62, textAlign: "center" },
                      value: o,
                      onChange: (h) => r(h.target.value),
                      onKeyDown: (h) => {
                        u(h), h.key === "Enter" && c();
                      }
                    }
                  ),
                  /* @__PURE__ */ b("span", { className: "tm-reminder-sub", children: "min" })
                ] }),
                /* @__PURE__ */ E("div", { className: "tm-row", style: { marginTop: 2 }, children: [
                  /* @__PURE__ */ b(
                    "button",
                    {
                      type: "button",
                      className: "tm-primary",
                      style: { flex: 1, padding: "8px 0", fontSize: 13 },
                      onClick: c,
                      children: "Add"
                    }
                  ),
                  /* @__PURE__ */ b(
                    "button",
                    {
                      type: "button",
                      className: "tm-circle",
                      style: { width: "auto", height: "auto", padding: "8px 16px", borderRadius: 999 },
                      onClick: () => l(!1),
                      children: /* @__PURE__ */ b("span", { style: { fontSize: 13 }, children: "Cancel" })
                    }
                  )
                ] })
              ]
            },
            "add"
          ) : null,
          e.map((h) => /* @__PURE__ */ E(
            z.div,
            {
              className: "tm-reminder",
              initial: { opacity: 0, x: -6 },
              animate: { opacity: 1, x: 0 },
              exit: { opacity: 0, x: 6 },
              transition: { duration: 0.2 },
              children: [
                /* @__PURE__ */ E("div", { style: { display: "flex", flexDirection: "column" }, children: [
                  /* @__PURE__ */ b("span", { className: "tm-reminder-label", children: h.label }),
                  /* @__PURE__ */ E("span", { className: "tm-reminder-sub", children: [
                    "Every ",
                    h.intervalMinutes,
                    " min"
                  ] })
                ] }),
                /* @__PURE__ */ b(
                  "button",
                  {
                    type: "button",
                    className: "tm-ghost",
                    onClick: () => n(h.id),
                    title: "Remove reminder",
                    children: /* @__PURE__ */ b(Vu, { size: 13 })
                  }
                )
              ]
            },
            h.id
          ))
        ] }),
        e.length === 0 && !a ? /* @__PURE__ */ b("p", { className: "tm-reminder-sub", style: { textAlign: "center", padding: "8px 0" }, children: "No reminders set" }) : null
      ]
    }
  );
}
function Vt(e) {
  return e.toString().padStart(2, "0");
}
function ju({
  remainingSeconds: e,
  phase: t
}) {
  const n = Math.floor(e / 3600), i = Math.floor(e % 3600 / 60), s = e % 60, o = n > 0 ? `${Vt(n)}:${Vt(i)}:${Vt(s)}` : `${Vt(i)}:${Vt(s)}`;
  return /* @__PURE__ */ b(
    z.span,
    {
      className: "tm-digits",
      "data-state": t,
      initial: { opacity: 0, scale: 0.96 },
      animate: { opacity: 1, scale: 1 },
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
      children: o
    }
  );
}
function Ou({ engine: e }) {
  const t = zr(
    (o) => e.subscribe(o),
    () => e.snapshot()
  ), n = Y(null);
  bt(() => {
    const o = n.current;
    if (!o) return;
    const r = () => Mu(o, t.inheritTheme);
    return r(), t.inheritTheme ? Ru(r) : void 0;
  }, [t.inheritTheme]);
  const i = t.activeReminderId != null ? t.reminders.find((o) => o.id === t.activeReminderId) ?? null : null, s = t.phase === "idle";
  return /* @__PURE__ */ E("div", { className: "agent-code-timer", ref: n, children: [
    /* @__PURE__ */ b(Eu, {}),
    /* @__PURE__ */ b(ju, { remainingSeconds: t.remainingSeconds, phase: t.phase }),
    /* @__PURE__ */ b(Ce, { mode: "wait", children: s ? /* @__PURE__ */ E(
      z.div,
      {
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.2 },
        style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: "100%" },
        children: [
          /* @__PURE__ */ b(
            Fu,
            {
              totalSeconds: t.totalSeconds,
              onSelect: (o) => e.setDuration(o),
              onStart: () => e.start()
            }
          ),
          /* @__PURE__ */ b(
            Bu,
            {
              reminders: t.reminders,
              onAdd: (o, r) => e.addReminder(o, r),
              onRemove: (o) => e.removeReminder(o)
            }
          )
        ]
      },
      "setup"
    ) : /* @__PURE__ */ E(
      z.div,
      {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.25 },
        style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
        children: [
          /* @__PURE__ */ E("div", { className: "tm-row", children: [
            t.phase === "running" ? /* @__PURE__ */ b(
              "button",
              {
                type: "button",
                className: "tm-circle",
                onClick: () => e.pause(),
                title: "Pause",
                children: /* @__PURE__ */ b(Pu, { size: 17 })
              }
            ) : null,
            t.phase === "paused" ? /* @__PURE__ */ b(
              "button",
              {
                type: "button",
                className: "tm-circle",
                onClick: () => e.resume(),
                title: "Resume",
                children: /* @__PURE__ */ b(Su, { size: 17, style: { marginLeft: 2 } })
              }
            ) : null,
            /* @__PURE__ */ b("button", { type: "button", className: "tm-circle", onClick: () => e.reset(), title: "Reset", children: /* @__PURE__ */ b(Au, { size: 17 }) })
          ] }),
          t.phase === "finished" ? /* @__PURE__ */ b(
            z.span,
            {
              className: "tm-reminder-sub",
              initial: { opacity: 0 },
              animate: { opacity: 1 },
              children: "Session complete"
            }
          ) : null,
          t.reminders.length > 0 && t.phase !== "finished" ? /* @__PURE__ */ b("div", { className: "tm-presets", style: { marginTop: 2 }, children: t.reminders.map((o) => /* @__PURE__ */ E("span", { className: "tm-chip", children: [
            o.label,
            " · ",
            o.intervalMinutes,
            "m"
          ] }, o.id)) }) : null
        ]
      },
      "running"
    ) }),
    /* @__PURE__ */ b("div", { className: "tm-footer", children: /* @__PURE__ */ E(
      "button",
      {
        type: "button",
        className: "tm-toggle",
        "data-on": t.inheritTheme,
        onClick: () => e.setInheritTheme(!t.inheritTheme),
        title: t.inheritTheme ? "Using Agent Code theme — click for black & white" : "Using black & white — click to inherit Agent Code theme",
        children: [
          /* @__PURE__ */ b("span", { className: "tm-toggle-dot" }),
          t.inheritTheme ? "Inheriting theme" : "Black & white"
        ]
      }
    ) }),
    /* @__PURE__ */ b(Ce, { children: i ? /* @__PURE__ */ b(Iu, { reminder: i, onDismiss: () => e.dismissReminder() }) : null })
  ] });
}
function Nu(e) {
  return (t) => {
    Fr();
    const n = Or(t);
    return n.render(/* @__PURE__ */ b(Ou, { engine: e })), () => {
      queueMicrotask(() => n.unmount());
    };
  };
}
const Gi = "session";
let X = null;
async function sh(e) {
  const { api: t } = e;
  X = new kr({
    notify: (n) => {
      t.ui.showToast(n).catch(() => {
      });
    },
    save: (n) => {
      t.storage.set(Gi, n).catch(() => {
      });
    }
  }), e.subscriptions.push(
    e.registerView("timer.main", Nu(X)),
    // `timer.open` has no handler here — opening a declared view is the host's
    // job, and a command whose only body is "show my own view" would just be a
    // worse version of the host's own routing. It is declared in the manifest so
    // it appears in the palette; the host resolves it to the view.
    e.registerCommand("timer.start", () => X?.start()),
    e.registerCommand("timer.pause", () => X?.pause()),
    e.registerCommand("timer.reset", () => X?.reset()),
    { dispose: () => X?.dispose() }
  );
  try {
    const n = await t.storage.get(Gi);
    X.restore(n);
  } catch {
  }
}
function rh() {
  X?.dispose(), X = null, Ir();
}
export {
  sh as activate,
  rh as deactivate
};
