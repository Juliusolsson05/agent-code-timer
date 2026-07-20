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
      const e = new AudioContext();
      this.context = e;
      const n = (s, o) => {
        const r = e.createOscillator(), a = e.createGain();
        r.connect(a), a.connect(e.destination), r.type = "sine", r.frequency.value = o, a.gain.setValueAtTime(0.3, s), a.gain.exponentialRampToValueAtTime(0.01, s + 0.3), r.start(s), r.stop(s + 0.3);
      }, i = e.currentTime;
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
  constructor(e) {
    this.host = e;
  }
  listeners = /* @__PURE__ */ new Set();
  interval = null;
  chime = new Rr();
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
    !e || e.version !== 1 || (this.totalSeconds = e.totalSeconds, this.reminders = e.reminders ?? [], this.firedReminderKeys = new Set(e.firedReminderKeys ?? []), this.inheritTheme = e.inheritTheme ?? !1, e.phase === "running" && e.deadlineAt != null ? e.deadlineAt > Date.now() ? (this.deadlineAt = e.deadlineAt, this.phase = "running", this.startTicking()) : (this.phase = "finished", this.deadlineAt = null) : e.phase === "paused" && e.pausedElapsedSeconds != null ? (this.pausedElapsed = e.pausedElapsedSeconds, this.phase = "paused") : e.phase === "finished" && (this.phase = "finished"), this.emit());
  }
  dispose() {
    this.stopTicking(), this.chime.stop(), this.listeners.clear();
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
    this.stopTicking(), this.chime.stop(), this.phase = "idle", this.deadlineAt = null, this.pausedElapsed = 0, this.activeReminderId = null, this.firedReminderKeys.clear(), this.commit();
  }
  addReminder(e, n) {
    const i = e.trim();
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
  removeReminder(e) {
    this.reminders = this.reminders.filter((n) => n.id !== e), this.commit();
  }
  dismissReminder() {
    if (this.phase !== "reminding") return;
    this.chime.stop(), this.activeReminderId = null;
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
    const e = this.elapsedSeconds();
    for (const n of this.reminders) {
      const i = n.intervalMinutes * 60;
      if (i <= 0) continue;
      const s = Math.floor(e / i);
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
    this.cachedSnapshot = null;
    const e = this.snapshot();
    for (const n of this.listeners)
      try {
        n(e);
      } catch {
      }
  }
}
const Lr = '.agent-code-timer{--tm-bg: #000000;--tm-surface: #0d0d0d;--tm-fg: #ffffff;--tm-dim: #8a8a8a;--tm-faint: #4a4a4a;--tm-border: #262626;--tm-accent: #ffffff;--tm-accent-fg: #000000;--tm-radius: 14px;--tm-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;--tm-font-digit: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;position:relative;display:flex;flex-direction:column;align-items:center;gap:28px;padding:34px 32px 30px;background:var(--tm-bg);color:var(--tm-fg);font-family:var(--tm-font);margin:-1px;border-radius:inherit}.agent-code-timer *,.agent-code-timer *:before,.agent-code-timer *:after{box-sizing:border-box}.agent-code-timer button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;padding:0;outline:none}.agent-code-timer input{font-family:inherit;outline:none}.tm-clock{position:absolute;top:14px;left:18px;font-size:15px;font-weight:300;letter-spacing:-.01em;color:var(--tm-dim);transition:opacity .35s ease;user-select:none}.tm-clock[data-dimmed=true]{opacity:.15}.tm-digits{font-family:var(--tm-font-digit);font-size:72px;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em;user-select:none;transition:color .5s ease}.tm-digits[data-state=idle]{color:var(--tm-dim)}.tm-digits[data-state=finished]{color:var(--tm-faint)}.tm-label{font-size:11px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:var(--tm-dim)}.tm-presets{display:flex;flex-wrap:wrap;justify-content:center;gap:7px}.tm-preset{border-radius:999px;padding:7px 15px;font-size:13px;font-weight:500;background:var(--tm-surface);color:var(--tm-dim);border:1px solid var(--tm-border);transition:all .18s ease}.tm-preset:hover{color:var(--tm-fg)}.tm-preset[data-selected=true]{background:var(--tm-accent);color:var(--tm-accent-fg);border-color:var(--tm-accent)}.tm-custom{width:108px;border-radius:10px;border:1px solid var(--tm-border);background:var(--tm-surface);color:var(--tm-fg);padding:8px 12px;text-align:center;font-size:13px}.tm-custom::placeholder{color:var(--tm-faint)}.tm-row{display:flex;align-items:center;gap:10px}.tm-primary{border-radius:999px;padding:11px 34px;font-size:14px;font-weight:500;background:var(--tm-accent);color:var(--tm-accent-fg);transition:opacity .18s ease,transform .12s ease}.tm-primary:hover{opacity:.88}.tm-primary:active{transform:scale(.97)}.tm-circle{width:46px;height:46px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:var(--tm-surface);border:1px solid var(--tm-border);color:var(--tm-fg);transition:background .18s ease,transform .12s ease}.tm-circle:hover{background:var(--tm-border)}.tm-circle:active{transform:scale(.95)}.tm-ghost{font-size:12px;color:var(--tm-dim);transition:color .18s ease}.tm-ghost:hover{color:var(--tm-fg)}.tm-reminders{width:100%;max-width:330px}.tm-reminders-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.tm-reminder{display:flex;align-items:center;justify-content:space-between;padding:10px 13px;border-radius:var(--tm-radius);background:var(--tm-surface);border:1px solid var(--tm-border);margin-bottom:6px}.tm-reminder-label{font-size:13px;color:var(--tm-fg)}.tm-reminder-sub{font-size:11px;color:var(--tm-dim)}.tm-add{display:flex;flex-direction:column;gap:8px;padding:13px;border-radius:var(--tm-radius);background:var(--tm-surface);border:1px solid var(--tm-border);margin-bottom:8px}.tm-add input{border-radius:9px;border:1px solid var(--tm-border);background:var(--tm-bg);color:var(--tm-fg);padding:7px 10px;font-size:13px}.tm-chip{font-size:11px;color:var(--tm-dim);background:var(--tm-surface);border:1px solid var(--tm-border);border-radius:999px;padding:4px 11px}.tm-alert{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--tm-bg) 88%,transparent);backdrop-filter:blur(6px);border-radius:inherit}.tm-alert-card{display:flex;flex-direction:column;align-items:center;gap:18px;padding:32px 36px;border-radius:22px;background:var(--tm-surface);border:1px solid var(--tm-border);max-width:300px;text-align:center}.tm-alert-icon{width:56px;height:56px;border-radius:999px;background:var(--tm-accent);color:var(--tm-accent-fg);display:flex;align-items:center;justify-content:center;font-size:26px}.tm-footer{display:flex;align-items:center;justify-content:center;gap:8px;padding-top:2px}.tm-toggle{display:inline-flex;align-items:center;gap:7px;font-size:11px;color:var(--tm-faint);transition:color .18s ease}.tm-toggle:hover{color:var(--tm-dim)}.tm-toggle-dot{width:7px;height:7px;border-radius:999px;border:1px solid currentColor}.tm-toggle[data-on=true] .tm-toggle-dot{background:currentColor}', Ce = "agent-code-timer-styles";
function Fr() {
  if (document.getElementById(Ce)) return;
  const t = document.createElement("style");
  t.id = Ce, t.textContent = Lr, document.head.append(t);
}
function Ir() {
  document.getElementById(Ce)?.remove();
}
function We() {
  const t = globalThis.__agentCodeHost;
  if (!t)
    throw new Error(
      "agent-code-timer: globalThis.__agentCodeHost is missing. This bundle only runs inside Agent Code (API v1 or later)."
    );
  return t;
}
const Ft = We().jsxRuntime, b = Ft.jsx, E = Ft.jsxs;
Ft.jsxDEV ?? Ft.jsx;
const Br = Ft.Fragment, jr = We().reactDom, { createRoot: Or, hydrateRoot: _u } = jr, Nr = We().react, {
  Children: Ur,
  Component: Hi,
  Fragment: Xi,
  Profiler: $u,
  PureComponent: zu,
  StrictMode: Wu,
  Suspense: Gu,
  cloneElement: Kr,
  createContext: Tt,
  createElement: Jt,
  createRef: Hu,
  forwardRef: Ge,
  isValidElement: _r,
  lazy: Xu,
  memo: Yu,
  startTransition: qu,
  useCallback: It,
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
function Ye(t) {
  const e = Y(null);
  return e.current === null && (e.current = t()), e.current;
}
const oe = Tt(null), qe = Tt({
  transformPagePoint: (t) => t,
  isStatic: !1,
  reducedMotion: "never"
});
class Wr extends Hi {
  getSnapshotBeforeUpdate(e) {
    const n = this.props.childRef.current;
    if (n && e.isPresent && !this.props.isPresent) {
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
function Gr({ children: t, isPresent: e }) {
  const n = He(), i = Y(null), s = Y({
    width: 0,
    height: 0,
    top: 0,
    left: 0
  }), { nonce: o } = I(qe);
  return Yi(() => {
    const { width: r, height: a, top: l, left: c } = s.current;
    if (e || !i.current || !r || !a)
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
  }, [e]), b(Wr, { isPresent: e, childRef: i, sizeRef: s, children: Kr(t, { ref: i }) });
}
const Hr = ({ children: t, initial: e, isPresent: n, onExitComplete: i, custom: s, presenceAffectsLayout: o, mode: r }) => {
  const a = Ye(Xr), l = He(), c = It((h) => {
    a.set(h, !0);
    for (const d of a.values())
      if (!d)
        return;
    i && i();
  }, [a, i]), u = ct(
    () => ({
      id: l,
      initial: e,
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
  }, [n]), r === "popLayout" && (t = b(Gr, { isPresent: n, children: t })), b(oe.Provider, { value: u, children: t });
};
function Xr() {
  return /* @__PURE__ */ new Map();
}
function qi(t = !0) {
  const e = I(oe);
  if (e === null)
    return [!0, null];
  const { isPresent: n, onExitComplete: i, register: s } = e, o = He();
  bt(() => {
    t && s(o);
  }, [t]);
  const r = It(() => t && i && i(o), [o, i, t]);
  return !n && i ? [!1, r] : [!0];
}
const Wt = (t) => t.key || "";
function En(t) {
  const e = [];
  return Ur.forEach(t, (n) => {
    _r(n) && e.push(n);
  }), e;
}
const Ze = typeof window < "u", Zi = Ze ? $r : bt, De = ({ children: t, custom: e, initial: n = !0, onExitComplete: i, presenceAffectsLayout: s = !0, mode: o = "sync", propagate: r = !1 }) => {
  const [a, l] = qi(r), c = ct(() => En(t), [t]), u = r && !a ? [] : c.map(Wt), h = Y(!0), d = Y(c), f = Ye(() => /* @__PURE__ */ new Map()), [m, p] = tt(c), [y, g] = tt(c);
  Zi(() => {
    h.current = !1, d.current = c;
    for (let w = 0; w < y.length; w++) {
      const v = Wt(y[w]);
      u.includes(v) ? f.delete(v) : f.get(v) !== !0 && f.set(v, !1);
    }
  }, [y, u.length, u.join("-")]);
  const x = [];
  if (c !== m) {
    let w = [...c];
    for (let v = 0; v < y.length; v++) {
      const A = y[v], M = Wt(A);
      u.includes(M) || (w.splice(v, 0, A), x.push(A));
    }
    o === "wait" && x.length && (w = x), g(En(w)), p(c);
    return;
  }
  const { forceRender: T } = I(Xe);
  return b(Br, { children: y.map((w) => {
    const v = Wt(w), A = r && !a ? !1 : c === y || u.includes(v), M = () => {
      if (f.has(v))
        f.set(v, !0);
      else
        return;
      let P = !0;
      f.forEach((L) => {
        L || (P = !1);
      }), P && (T?.(), g(d.current), r && l?.(), i && i());
    };
    return b(Hr, { isPresent: A, initial: !h.current || n ? void 0 : !1, custom: A ? void 0 : e, presenceAffectsLayout: s, mode: o, onExitComplete: A ? void 0 : M, children: w }, v);
  }) });
}, O = /* @__NO_SIDE_EFFECTS__ */ (t) => t;
let Ji = O;
// @__NO_SIDE_EFFECTS__
function Je(t) {
  let e;
  return () => (e === void 0 && (e = t()), e);
}
const yt = /* @__NO_SIDE_EFFECTS__ */ (t, e, n) => {
  const i = e - t;
  return i === 0 ? 1 : (n - t) / i;
}, q = /* @__NO_SIDE_EFFECTS__ */ (t) => t * 1e3, Z = /* @__NO_SIDE_EFFECTS__ */ (t) => t / 1e3, Yr = {
  useManualTiming: !1
};
function qr(t) {
  let e = /* @__PURE__ */ new Set(), n = /* @__PURE__ */ new Set(), i = !1, s = !1;
  const o = /* @__PURE__ */ new WeakSet();
  let r = {
    delta: 0,
    timestamp: 0,
    isProcessing: !1
  };
  function a(c) {
    o.has(c) && (l.schedule(c), t()), c(r);
  }
  const l = {
    /**
     * Schedule a process to run on the next frame.
     */
    schedule: (c, u = !1, h = !1) => {
      const f = h && i ? e : n;
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
      i = !0, [e, n] = [n, e], e.forEach(a), e.clear(), i = !1, s && (s = !1, l.process(c));
    }
  };
  return l;
}
const Gt = [
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
function Qi(t, e) {
  let n = !1, i = !0;
  const s = {
    delta: 0,
    timestamp: 0,
    isProcessing: !1
  }, o = () => n = !0, r = Gt.reduce((g, x) => (g[x] = qr(o), g), {}), { read: a, resolveKeyframes: l, update: c, preRender: u, render: h, postRender: d } = r, f = () => {
    const g = performance.now();
    n = !1, s.delta = i ? 1e3 / 60 : Math.max(Math.min(g - s.timestamp, Zr), 1), s.timestamp = g, s.isProcessing = !0, a.process(s), l.process(s), c.process(s), u.process(s), h.process(s), d.process(s), s.isProcessing = !1, n && e && (i = !1, t(f));
  }, m = () => {
    n = !0, i = !0, s.isProcessing || t(f);
  };
  return { schedule: Gt.reduce((g, x) => {
    const T = r[x];
    return g[x] = (w, v = !1, A = !1) => (n || m(), T.schedule(w, v, A)), g;
  }, {}), cancel: (g) => {
    for (let x = 0; x < Gt.length; x++)
      r[Gt[x]].cancel(g);
  }, state: s, steps: r };
}
const { schedule: V, cancel: et, state: k, steps: me } = Qi(typeof requestAnimationFrame < "u" ? requestAnimationFrame : O, !0), ts = Tt({ strict: !1 }), kn = {
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
for (const t in kn)
  vt[t] = {
    isEnabled: (e) => kn[t].some((n) => !!e[n])
  };
function Jr(t) {
  for (const e in t)
    vt[e] = {
      ...vt[e],
      ...t[e]
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
function Qt(t) {
  return t.startsWith("while") || t.startsWith("drag") && t !== "draggable" || t.startsWith("layout") || t.startsWith("onTap") || t.startsWith("onPan") || t.startsWith("onLayout") || Qr.has(t);
}
let es = (t) => !Qt(t);
function to(t) {
  t && (es = (e) => e.startsWith("on") ? !Qt(e) : t(e));
}
try {
  to(require("@emotion/is-prop-valid").default);
} catch {
}
function eo(t, e, n) {
  const i = {};
  for (const s in t)
    s === "values" && typeof t.values == "object" || (es(s) || n === !0 && Qt(s) || !e && !Qt(s) || // If trying to use native HTML drag events, forward drag listeners
    t.draggable && s.startsWith("onDrag")) && (i[s] = t[s]);
  return i;
}
function no(t) {
  if (typeof Proxy > "u")
    return t;
  const e = /* @__PURE__ */ new Map(), n = (...i) => t(...i);
  return new Proxy(n, {
    /**
     * Called when `motion` is referenced with a prop: `motion.div`, `motion.input` etc.
     * The prop name is passed through as `key` and we can use that to generate a `motion`
     * DOM component with that name.
     */
    get: (i, s) => s === "create" ? t : (e.has(s) || e.set(s, t(s)), e.get(s))
  });
}
const ae = Tt({});
function Bt(t) {
  return typeof t == "string" || Array.isArray(t);
}
function le(t) {
  return t !== null && typeof t == "object" && typeof t.start == "function";
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
function ce(t) {
  return le(t.animate) || tn.some((e) => Bt(t[e]));
}
function ns(t) {
  return !!(ce(t) || t.variants);
}
function io(t, e) {
  if (ce(t)) {
    const { initial: n, animate: i } = t;
    return {
      initial: n === !1 || Bt(n) ? n : void 0,
      animate: Bt(i) ? i : void 0
    };
  }
  return t.inherit !== !1 ? e : {};
}
function so(t) {
  const { initial: e, animate: n } = io(t, I(ae));
  return ct(() => ({ initial: e, animate: n }), [Ln(e), Ln(n)]);
}
function Ln(t) {
  return Array.isArray(t) ? t.join(" ") : t;
}
const ro = Symbol.for("motionComponentSymbol");
function dt(t) {
  return t && typeof t == "object" && Object.prototype.hasOwnProperty.call(t, "current");
}
function oo(t, e, n) {
  return It(
    (i) => {
      i && t.onMount && t.onMount(i), e && (i ? e.mount(i) : e.unmount()), n && (typeof n == "function" ? n(i) : dt(n) && (n.current = i));
    },
    /**
     * Only pass a new ref callback to React if we've received a visual element
     * factory. Otherwise we'll be mounting/remounting every time externalRef
     * or other dependencies change.
     */
    [e]
  );
}
const en = (t) => t.replace(/([a-z])([A-Z])/gu, "$1-$2").toLowerCase(), ao = "framerAppearId", is = "data-" + en(ao), { schedule: nn } = Qi(queueMicrotask, !1), ss = Tt({});
function lo(t, e, n, i, s) {
  var o, r;
  const { visualElement: a } = I(ae), l = I(ts), c = I(oe), u = I(qe).reducedMotion, h = Y(null);
  i = i || l.renderer, !h.current && i && (h.current = i(t, {
    visualState: e,
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
function co(t, e, n, i) {
  const { layoutId: s, layout: o, drag: r, dragConstraints: a, layoutScroll: l, layoutRoot: c } = e;
  t.projection = new n(t.latestValues, e["data-framer-portal-id"] ? void 0 : rs(t.parent)), t.projection.setOptions({
    layoutId: s,
    layout: o,
    alwaysMeasureLayout: !!r || a && dt(a),
    visualElement: t,
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
function rs(t) {
  if (t)
    return t.options.allowProjection !== !1 ? t.projection : rs(t.parent);
}
function uo({ preloadedFeatures: t, createVisualElement: e, useRender: n, useVisualState: i, Component: s }) {
  var o, r;
  t && Jr(t);
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
      h = y.MeasureLayout, m.visualElement = lo(s, p, d, e, y.ProjectionNode);
    }
    return E(ae.Provider, { value: m, children: [h && m.visualElement ? b(h, { visualElement: m.visualElement, ...d }) : null, n(s, c, oo(p, m.visualElement, u), p, f, m.visualElement)] });
  }
  a.displayName = `motion.${typeof s == "string" ? s : `create(${(r = (o = s.displayName) !== null && o !== void 0 ? o : s.name) !== null && r !== void 0 ? r : ""})`}`;
  const l = Ge(a);
  return l[ro] = s, l;
}
function ho({ layoutId: t }) {
  const e = I(Xe).id;
  return e && t !== void 0 ? e + "-" + t : t;
}
function fo(t, e) {
  I(ts).strict;
}
function mo(t) {
  const { drag: e, layout: n } = vt;
  if (!e && !n)
    return {};
  const i = { ...e, ...n };
  return {
    MeasureLayout: e?.isEnabled(t) || n?.isEnabled(t) ? i.MeasureLayout : void 0,
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
function sn(t) {
  return (
    /**
     * If it's not a string, it's a custom React component. Currently we only support
     * HTML custom React components.
     */
    typeof t != "string" || /**
     * If it contains a dash, the element is a custom HTML webcomponent.
     */
    t.includes("-") ? !1 : (
      /**
       * If it's in our list of lowercase SVG tags, it's an SVG component
       */
      !!(po.indexOf(t) > -1 || /**
       * If it contains a capital letter, it's an SVG component
       */
      /[A-Z]/u.test(t))
    )
  );
}
function Fn(t) {
  const e = [{}, {}];
  return t?.values.forEach((n, i) => {
    e[0][i] = n.get(), e[1][i] = n.getVelocity();
  }), e;
}
function rn(t, e, n, i) {
  if (typeof e == "function") {
    const [s, o] = Fn(i);
    e = e(n !== void 0 ? n : t.custom, s, o);
  }
  if (typeof e == "string" && (e = t.variants && t.variants[e]), typeof e == "function") {
    const [s, o] = Fn(i);
    e = e(n !== void 0 ? n : t.custom, s, o);
  }
  return e;
}
const Me = (t) => Array.isArray(t), go = (t) => !!(t && typeof t == "object" && t.mix && t.toValue), yo = (t) => Me(t) ? t[t.length - 1] || 0 : t, B = (t) => !!(t && t.getVelocity);
function Yt(t) {
  const e = B(t) ? t.get() : t;
  return go(e) ? e.toValue() : e;
}
function vo({ scrapeMotionValuesFromProps: t, createRenderState: e, onUpdate: n }, i, s, o) {
  const r = {
    latestValues: xo(i, s, o, t),
    renderState: e()
  };
  return n && (r.onMount = (a) => n({ props: i, current: a, ...r }), r.onUpdate = (a) => n(a)), r;
}
const os = (t) => (e, n) => {
  const i = I(ae), s = I(oe), o = () => vo(t, e, i, s);
  return n ? o() : Ye(o);
};
function xo(t, e, n, i) {
  const s = {}, o = i(t, {});
  for (const d in o)
    s[d] = Yt(o[d]);
  let { initial: r, animate: a } = t;
  const l = ce(t), c = ns(t);
  e && c && !l && t.inherit !== !1 && (r === void 0 && (r = e.initial), a === void 0 && (a = e.animate));
  let u = n ? n.initial === !1 : !1;
  u = u || r === !1;
  const h = u ? a : r;
  if (h && typeof h != "boolean" && !le(h)) {
    const d = Array.isArray(h) ? h : [h];
    for (let f = 0; f < d.length; f++) {
      const m = rn(t, d[f]);
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
const St = [
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
], ut = new Set(St), as = (t) => (e) => typeof e == "string" && e.startsWith(t), ls = /* @__PURE__ */ as("--"), To = /* @__PURE__ */ as("var(--"), on = (t) => To(t) ? bo.test(t.split("/*")[0].trim()) : !1, bo = /var\(--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)$/iu, cs = (t, e) => e && typeof t == "number" ? e.transform(t) : t, J = (t, e, n) => n > e ? e : n < t ? t : n, Pt = {
  test: (t) => typeof t == "number",
  parse: parseFloat,
  transform: (t) => t
}, jt = {
  ...Pt,
  transform: (t) => J(0, 1, t)
}, Ht = {
  ...Pt,
  default: 1
}, Kt = (t) => ({
  test: (e) => typeof e == "string" && e.endsWith(t) && e.split(" ").length === 1,
  parse: parseFloat,
  transform: (e) => `${e}${t}`
}), Q = /* @__PURE__ */ Kt("deg"), W = /* @__PURE__ */ Kt("%"), S = /* @__PURE__ */ Kt("px"), So = /* @__PURE__ */ Kt("vh"), Po = /* @__PURE__ */ Kt("vw"), In = {
  ...W,
  parse: (t) => W.parse(t) / 100,
  transform: (t) => W.transform(t * 100)
}, wo = {
  // Border props
  borderWidth: S,
  borderTopWidth: S,
  borderRightWidth: S,
  borderBottomWidth: S,
  borderLeftWidth: S,
  borderRadius: S,
  radius: S,
  borderTopLeftRadius: S,
  borderTopRightRadius: S,
  borderBottomRightRadius: S,
  borderBottomLeftRadius: S,
  // Positioning props
  width: S,
  maxWidth: S,
  height: S,
  maxHeight: S,
  top: S,
  right: S,
  bottom: S,
  left: S,
  // Spacing props
  padding: S,
  paddingTop: S,
  paddingRight: S,
  paddingBottom: S,
  paddingLeft: S,
  margin: S,
  marginTop: S,
  marginRight: S,
  marginBottom: S,
  marginLeft: S,
  // Misc
  backgroundPositionX: S,
  backgroundPositionY: S
}, Ao = {
  rotate: Q,
  rotateX: Q,
  rotateY: Q,
  rotateZ: Q,
  scale: Ht,
  scaleX: Ht,
  scaleY: Ht,
  scaleZ: Ht,
  skew: Q,
  skewX: Q,
  skewY: Q,
  distance: S,
  translateX: S,
  translateY: S,
  translateZ: S,
  x: S,
  y: S,
  z: S,
  perspective: S,
  transformPerspective: S,
  opacity: jt,
  originX: In,
  originY: In,
  originZ: S
}, Bn = {
  ...Pt,
  transform: Math.round
}, an = {
  ...wo,
  ...Ao,
  zIndex: Bn,
  size: S,
  // SVG
  fillOpacity: jt,
  strokeOpacity: jt,
  numOctaves: Bn
}, Vo = {
  x: "translateX",
  y: "translateY",
  z: "translateZ",
  transformPerspective: "perspective"
}, Co = St.length;
function Do(t, e, n) {
  let i = "", s = !0;
  for (let o = 0; o < Co; o++) {
    const r = St[o], a = t[r];
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
      n && (e[r] = c);
    }
  }
  return i = i.trim(), n ? i = n(e, s ? "" : i) : s && (i = "none"), i;
}
function ln(t, e, n) {
  const { style: i, vars: s, transformOrigin: o } = t;
  let r = !1, a = !1;
  for (const l in e) {
    const c = e[l];
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
  if (e.transform || (r || n ? i.transform = Do(e, t.transform, n) : i.transform && (i.transform = "none")), a) {
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
function Eo(t, e, n = 1, i = 0, s = !0) {
  t.pathLength = 1;
  const o = s ? Mo : Ro;
  t[o.offset] = S.transform(-i);
  const r = S.transform(e), a = S.transform(n);
  t[o.array] = `${r} ${a}`;
}
function jn(t, e, n) {
  return typeof t == "string" ? t : S.transform(e + n * t);
}
function ko(t, e, n) {
  const i = jn(e, t.x, t.width), s = jn(n, t.y, t.height);
  return `${i} ${s}`;
}
function cn(t, {
  attrX: e,
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
  if (ln(t, c, h), u) {
    t.style.viewBox && (t.attrs.viewBox = t.style.viewBox);
    return;
  }
  t.attrs = t.style, t.style = {};
  const { attrs: d, style: f, dimensions: m } = t;
  d.transform && (m && (f.transform = d.transform), delete d.transform), m && (s !== void 0 || o !== void 0 || f.transform) && (f.transformOrigin = ko(m, s !== void 0 ? s : 0.5, o !== void 0 ? o : 0.5)), e !== void 0 && (d.x = e), n !== void 0 && (d.y = n), i !== void 0 && (d.scale = i), r !== void 0 && Eo(d, r, a, l, !1);
}
const un = () => ({
  style: {},
  transform: {},
  transformOrigin: {},
  vars: {}
}), us = () => ({
  ...un(),
  attrs: {}
}), hn = (t) => typeof t == "string" && t.toLowerCase() === "svg";
function hs(t, { style: e, vars: n }, i, s) {
  Object.assign(t.style, e, s && s.getProjectionStyles(i));
  for (const o in n)
    t.style.setProperty(o, n[o]);
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
function fs(t, e, n, i) {
  hs(t, e, void 0, i);
  for (const s in e.attrs)
    t.setAttribute(ds.has(s) ? s : en(s), e.attrs[s]);
}
const te = {};
function Lo(t) {
  Object.assign(te, t);
}
function ms(t, { layout: e, layoutId: n }) {
  return ut.has(t) || t.startsWith("origin") || (e || n !== void 0) && (!!te[t] || t === "opacity");
}
function dn(t, e, n) {
  var i;
  const { style: s } = t, o = {};
  for (const r in s)
    (B(s[r]) || e.style && B(e.style[r]) || ms(r, t) || ((i = n?.getValue(r)) === null || i === void 0 ? void 0 : i.liveStyle) !== void 0) && (o[r] = s[r]);
  return o;
}
function ps(t, e, n) {
  const i = dn(t, e, n);
  for (const s in t)
    if (B(t[s]) || B(e[s])) {
      const o = St.indexOf(s) !== -1 ? "attr" + s.charAt(0).toUpperCase() + s.substring(1) : s;
      i[o] = t[s];
    }
  return i;
}
function Fo(t, e) {
  try {
    e.dimensions = typeof t.getBBox == "function" ? t.getBBox() : t.getBoundingClientRect();
  } catch {
    e.dimensions = {
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
    onUpdate: ({ props: t, prevProps: e, current: n, renderState: i, latestValues: s }) => {
      if (!n)
        return;
      let o = !!t.drag;
      if (!o) {
        for (const a in s)
          if (ut.has(a)) {
            o = !0;
            break;
          }
      }
      if (!o)
        return;
      let r = !e;
      if (e)
        for (let a = 0; a < On.length; a++) {
          const l = On[a];
          t[l] !== e[l] && (r = !0);
        }
      r && V.read(() => {
        Fo(n, i), V.render(() => {
          cn(i, s, hn(n.tagName), t.transformTemplate), fs(n, i);
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
function gs(t, e, n) {
  for (const i in e)
    !B(e[i]) && !ms(i, n) && (t[i] = e[i]);
}
function jo({ transformTemplate: t }, e) {
  return ct(() => {
    const n = un();
    return ln(n, e, t), Object.assign({}, n.vars, n.style);
  }, [e]);
}
function Oo(t, e) {
  const n = t.style || {}, i = {};
  return gs(i, n, t), Object.assign(i, jo(t, e)), i;
}
function No(t, e) {
  const n = {}, i = Oo(t, e);
  return t.drag && t.dragListener !== !1 && (n.draggable = !1, i.userSelect = i.WebkitUserSelect = i.WebkitTouchCallout = "none", i.touchAction = t.drag === !0 ? "none" : `pan-${t.drag === "x" ? "y" : "x"}`), t.tabIndex === void 0 && (t.onTap || t.onTapStart || t.whileTap) && (n.tabIndex = 0), n.style = i, n;
}
function Uo(t, e, n, i) {
  const s = ct(() => {
    const o = us();
    return cn(o, e, hn(i), t.transformTemplate), {
      ...o.attrs,
      style: { ...o.style }
    };
  }, [e]);
  if (t.style) {
    const o = {};
    gs(o, t.style, t), s.style = { ...o, ...s.style };
  }
  return s;
}
function Ko(t = !1) {
  return (n, i, s, { latestValues: o }, r) => {
    const l = (sn(n) ? Uo : No)(i, o, r, n), c = eo(i, typeof n == "string", t), u = n !== Xi ? { ...c, ...l, ref: s } : {}, { children: h } = i, d = ct(() => B(h) ? h.get() : h, [h]);
    return Jt(n, {
      ...u,
      children: d
    });
  };
}
function _o(t, e) {
  return function(i, { forwardMotionProps: s } = { forwardMotionProps: !1 }) {
    const r = {
      ...sn(i) ? Io : Bo,
      preloadedFeatures: t,
      useRender: Ko(s),
      createVisualElement: e,
      Component: i
    };
    return uo(r);
  };
}
function ys(t, e) {
  if (!Array.isArray(e))
    return !1;
  const n = e.length;
  if (n !== t.length)
    return !1;
  for (let i = 0; i < n; i++)
    if (e[i] !== t[i])
      return !1;
  return !0;
}
function ue(t, e, n) {
  const i = t.getProps();
  return rn(i, e, n !== void 0 ? n : i.custom, t);
}
const $o = /* @__PURE__ */ Je(() => window.ScrollTimeline !== void 0);
class zo {
  constructor(e) {
    this.stop = () => this.runAll("stop"), this.animations = e.filter(Boolean);
  }
  get finished() {
    return Promise.all(this.animations.map((e) => "finished" in e ? e.finished : e));
  }
  /**
   * TODO: Filter out cancelled or stopped animations before returning
   */
  getAll(e) {
    return this.animations[0][e];
  }
  setAll(e, n) {
    for (let i = 0; i < this.animations.length; i++)
      this.animations[i][e] = n;
  }
  attachTimeline(e, n) {
    const i = this.animations.map((s) => {
      if ($o() && s.attachTimeline)
        return s.attachTimeline(e);
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
  set time(e) {
    this.setAll("time", e);
  }
  get speed() {
    return this.getAll("speed");
  }
  set speed(e) {
    this.setAll("speed", e);
  }
  get startTime() {
    return this.getAll("startTime");
  }
  get duration() {
    let e = 0;
    for (let n = 0; n < this.animations.length; n++)
      e = Math.max(e, this.animations[n].duration);
    return e;
  }
  runAll(e) {
    this.animations.forEach((n) => n[e]());
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
  then(e, n) {
    return Promise.all(this.animations).then(e).catch(n);
  }
}
function fn(t, e) {
  return t ? t[e] || t.default || t : void 0;
}
const Re = 2e4;
function vs(t) {
  let e = 0;
  const n = 50;
  let i = t.next(e);
  for (; !i.done && e < Re; )
    e += n, i = t.next(e);
  return e >= Re ? 1 / 0 : e;
}
function mn(t) {
  return typeof t == "function";
}
function Nn(t, e) {
  t.timeline = e, t.onfinish = null;
}
const pn = (t) => Array.isArray(t) && typeof t[0] == "number", Go = {
  linearEasing: void 0
};
function Ho(t, e) {
  const n = /* @__PURE__ */ Je(t);
  return () => {
    var i;
    return (i = Go[e]) !== null && i !== void 0 ? i : n();
  };
}
const ee = /* @__PURE__ */ Ho(() => {
  try {
    document.createElement("div").animate({ opacity: 0 }, { easing: "linear(0, 1)" });
  } catch {
    return !1;
  }
  return !0;
}, "linearEasing"), xs = (t, e, n = 10) => {
  let i = "";
  const s = Math.max(Math.round(e / n), 2);
  for (let o = 0; o < s; o++)
    i += t(/* @__PURE__ */ yt(0, s - 1, o)) + ", ";
  return `linear(${i.substring(0, i.length - 2)})`;
};
function Ts(t) {
  return !!(typeof t == "function" && ee() || !t || typeof t == "string" && (t in Ee || ee()) || pn(t) || Array.isArray(t) && t.every(Ts));
}
const Ct = ([t, e, n, i]) => `cubic-bezier(${t}, ${e}, ${n}, ${i})`, Ee = {
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
function bs(t, e) {
  if (t)
    return typeof t == "function" && ee() ? xs(t, e) : pn(t) ? Ct(t) : Array.isArray(t) ? t.map((n) => bs(n, e) || Ee.easeOut) : Ee[t];
}
const $ = {
  x: !1,
  y: !1
};
function Ss() {
  return $.x || $.y;
}
function Xo(t, e, n) {
  var i;
  if (t instanceof Element)
    return [t];
  if (typeof t == "string") {
    let s = document;
    const o = (i = void 0) !== null && i !== void 0 ? i : s.querySelectorAll(t);
    return o ? Array.from(o) : [];
  }
  return Array.from(t);
}
function Ps(t, e) {
  const n = Xo(t), i = new AbortController(), s = {
    passive: !0,
    ...e,
    signal: i.signal
  };
  return [n, s, () => i.abort()];
}
function Un(t) {
  return (e) => {
    e.pointerType === "touch" || Ss() || t(e);
  };
}
function Yo(t, e, n = {}) {
  const [i, s, o] = Ps(t, n), r = Un((a) => {
    const { target: l } = a, c = e(a);
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
const ws = (t, e) => e ? t === e ? !0 : ws(t, e.parentElement) : !1, gn = (t) => t.pointerType === "mouse" ? typeof t.button != "number" || t.button <= 0 : t.isPrimary !== !1, qo = /* @__PURE__ */ new Set([
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "A"
]);
function Zo(t) {
  return qo.has(t.tagName) || t.tabIndex !== -1;
}
const Dt = /* @__PURE__ */ new WeakSet();
function Kn(t) {
  return (e) => {
    e.key === "Enter" && t(e);
  };
}
function pe(t, e) {
  t.dispatchEvent(new PointerEvent("pointer" + e, { isPrimary: !0, bubbles: !0 }));
}
const Jo = (t, e) => {
  const n = t.currentTarget;
  if (!n)
    return;
  const i = Kn(() => {
    if (Dt.has(n))
      return;
    pe(n, "down");
    const s = Kn(() => {
      pe(n, "up");
    }), o = () => pe(n, "cancel");
    n.addEventListener("keyup", s, e), n.addEventListener("blur", o, e);
  });
  n.addEventListener("keydown", i, e), n.addEventListener("blur", () => n.removeEventListener("keydown", i), e);
};
function _n(t) {
  return gn(t) && !Ss();
}
function Qo(t, e, n = {}) {
  const [i, s, o] = Ps(t, n), r = (a) => {
    const l = a.currentTarget;
    if (!_n(a) || Dt.has(l))
      return;
    Dt.add(l);
    const c = e(a), u = (f, m) => {
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
function ta(t) {
  return t === "x" || t === "y" ? $[t] ? null : ($[t] = !0, () => {
    $[t] = !1;
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
  ...St
]);
let qt;
function ea() {
  qt = void 0;
}
const G = {
  now: () => (qt === void 0 && G.set(k.isProcessing || Yr.useManualTiming ? k.timestamp : performance.now()), qt),
  set: (t) => {
    qt = t, queueMicrotask(ea);
  }
};
function yn(t, e) {
  t.indexOf(e) === -1 && t.push(e);
}
function vn(t, e) {
  const n = t.indexOf(e);
  n > -1 && t.splice(n, 1);
}
class xn {
  constructor() {
    this.subscriptions = [];
  }
  add(e) {
    return yn(this.subscriptions, e), () => vn(this.subscriptions, e);
  }
  notify(e, n, i) {
    const s = this.subscriptions.length;
    if (s)
      if (s === 1)
        this.subscriptions[0](e, n, i);
      else
        for (let o = 0; o < s; o++) {
          const r = this.subscriptions[o];
          r && r(e, n, i);
        }
  }
  getSize() {
    return this.subscriptions.length;
  }
  clear() {
    this.subscriptions.length = 0;
  }
}
function Vs(t, e) {
  return e ? t * (1e3 / e) : 0;
}
const $n = 30, na = (t) => !isNaN(parseFloat(t));
class ia {
  /**
   * @param init - The initiating value
   * @param config - Optional configuration options
   *
   * -  `transformer`: A function to transform incoming values with.
   *
   * @internal
   */
  constructor(e, n = {}) {
    this.version = "11.18.2", this.canTrackVelocity = null, this.events = {}, this.updateAndNotify = (i, s = !0) => {
      const o = G.now();
      this.updatedAt !== o && this.setPrevFrameValue(), this.prev = this.current, this.setCurrent(i), this.current !== this.prev && this.events.change && this.events.change.notify(this.current), s && this.events.renderRequest && this.events.renderRequest.notify(this.current);
    }, this.hasAnimated = !1, this.setCurrent(e), this.owner = n.owner;
  }
  setCurrent(e) {
    this.current = e, this.updatedAt = G.now(), this.canTrackVelocity === null && e !== void 0 && (this.canTrackVelocity = na(this.current));
  }
  setPrevFrameValue(e = this.current) {
    this.prevFrameValue = e, this.prevUpdatedAt = this.updatedAt;
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
  onChange(e) {
    return this.on("change", e);
  }
  on(e, n) {
    this.events[e] || (this.events[e] = new xn());
    const i = this.events[e].add(n);
    return e === "change" ? () => {
      i(), V.read(() => {
        this.events.change.getSize() || this.stop();
      });
    } : i;
  }
  clearListeners() {
    for (const e in this.events)
      this.events[e].clear();
  }
  /**
   * Attaches a passive effect to the `MotionValue`.
   *
   * @internal
   */
  attach(e, n) {
    this.passiveEffect = e, this.stopPassiveEffect = n;
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
  set(e, n = !0) {
    !n || !this.passiveEffect ? this.updateAndNotify(e, n) : this.passiveEffect(e, this.updateAndNotify);
  }
  setWithVelocity(e, n, i) {
    this.set(n), this.prev = void 0, this.prevFrameValue = e, this.prevUpdatedAt = this.updatedAt - i;
  }
  /**
   * Set the state of the `MotionValue`, stopping any active animations,
   * effects, and resets velocity to `0`.
   */
  jump(e, n = !0) {
    this.updateAndNotify(e), this.prev = e, this.prevUpdatedAt = this.prevFrameValue = void 0, n && this.stop(), this.stopPassiveEffect && this.stopPassiveEffect();
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
    const e = G.now();
    if (!this.canTrackVelocity || this.prevFrameValue === void 0 || e - this.updatedAt > $n)
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
  start(e) {
    return this.stop(), new Promise((n) => {
      this.hasAnimated = !0, this.animation = e(n), this.events.animationStart && this.events.animationStart.notify();
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
function Ot(t, e) {
  return new ia(t, e);
}
function sa(t, e, n) {
  t.hasValue(e) ? t.getValue(e).set(n) : t.addValue(e, Ot(n));
}
function ra(t, e) {
  const n = ue(t, e);
  let { transitionEnd: i = {}, transition: s = {}, ...o } = n || {};
  o = { ...o, ...i };
  for (const r in o) {
    const a = yo(o[r]);
    sa(t, r, a);
  }
}
function oa(t) {
  return !!(B(t) && t.add);
}
function ke(t, e) {
  const n = t.getValue("willChange");
  if (oa(n))
    return n.add(e);
}
function Cs(t) {
  return t.props[is];
}
const Ds = (t, e, n) => (((1 - 3 * n + 3 * e) * t + (3 * n - 6 * e)) * t + 3 * e) * t, aa = 1e-7, la = 12;
function ca(t, e, n, i, s) {
  let o, r, a = 0;
  do
    r = e + (n - e) / 2, o = Ds(r, i, s) - t, o > 0 ? n = r : e = r;
  while (Math.abs(o) > aa && ++a < la);
  return r;
}
function _t(t, e, n, i) {
  if (t === e && n === i)
    return O;
  const s = (o) => ca(o, 0, 1, t, n);
  return (o) => o === 0 || o === 1 ? o : Ds(s(o), e, i);
}
const Ms = (t) => (e) => e <= 0.5 ? t(2 * e) / 2 : (2 - t(2 * (1 - e))) / 2, Rs = (t) => (e) => 1 - t(1 - e), Es = /* @__PURE__ */ _t(0.33, 1.53, 0.69, 0.99), Tn = /* @__PURE__ */ Rs(Es), ks = /* @__PURE__ */ Ms(Tn), Ls = (t) => (t *= 2) < 1 ? 0.5 * Tn(t) : 0.5 * (2 - Math.pow(2, -10 * (t - 1))), bn = (t) => 1 - Math.sin(Math.acos(t)), Fs = Rs(bn), Is = Ms(bn), Bs = (t) => /^0[^.\s]+$/u.test(t);
function ua(t) {
  return typeof t == "number" ? t === 0 : t !== null ? t === "none" || t === "0" || Bs(t) : !0;
}
const Rt = (t) => Math.round(t * 1e5) / 1e5, Sn = /-?(?:\d+(?:\.\d+)?|\.\d+)/gu;
function ha(t) {
  return t == null;
}
const da = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))$/iu, Pn = (t, e) => (n) => !!(typeof n == "string" && da.test(n) && n.startsWith(t) || e && !ha(n) && Object.prototype.hasOwnProperty.call(n, e)), js = (t, e, n) => (i) => {
  if (typeof i != "string")
    return i;
  const [s, o, r, a] = i.match(Sn);
  return {
    [t]: parseFloat(s),
    [e]: parseFloat(o),
    [n]: parseFloat(r),
    alpha: a !== void 0 ? parseFloat(a) : 1
  };
}, fa = (t) => J(0, 255, t), ge = {
  ...Pt,
  transform: (t) => Math.round(fa(t))
}, at = {
  test: /* @__PURE__ */ Pn("rgb", "red"),
  parse: /* @__PURE__ */ js("red", "green", "blue"),
  transform: ({ red: t, green: e, blue: n, alpha: i = 1 }) => "rgba(" + ge.transform(t) + ", " + ge.transform(e) + ", " + ge.transform(n) + ", " + Rt(jt.transform(i)) + ")"
};
function ma(t) {
  let e = "", n = "", i = "", s = "";
  return t.length > 5 ? (e = t.substring(1, 3), n = t.substring(3, 5), i = t.substring(5, 7), s = t.substring(7, 9)) : (e = t.substring(1, 2), n = t.substring(2, 3), i = t.substring(3, 4), s = t.substring(4, 5), e += e, n += n, i += i, s += s), {
    red: parseInt(e, 16),
    green: parseInt(n, 16),
    blue: parseInt(i, 16),
    alpha: s ? parseInt(s, 16) / 255 : 1
  };
}
const Le = {
  test: /* @__PURE__ */ Pn("#"),
  parse: ma,
  transform: at.transform
}, ft = {
  test: /* @__PURE__ */ Pn("hsl", "hue"),
  parse: /* @__PURE__ */ js("hue", "saturation", "lightness"),
  transform: ({ hue: t, saturation: e, lightness: n, alpha: i = 1 }) => "hsla(" + Math.round(t) + ", " + W.transform(Rt(e)) + ", " + W.transform(Rt(n)) + ", " + Rt(jt.transform(i)) + ")"
}, F = {
  test: (t) => at.test(t) || Le.test(t) || ft.test(t),
  parse: (t) => at.test(t) ? at.parse(t) : ft.test(t) ? ft.parse(t) : Le.parse(t),
  transform: (t) => typeof t == "string" ? t : t.hasOwnProperty("red") ? at.transform(t) : ft.transform(t)
}, pa = /(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))/giu;
function ga(t) {
  var e, n;
  return isNaN(t) && typeof t == "string" && (((e = t.match(Sn)) === null || e === void 0 ? void 0 : e.length) || 0) + (((n = t.match(pa)) === null || n === void 0 ? void 0 : n.length) || 0) > 0;
}
const Os = "number", Ns = "color", ya = "var", va = "var(", zn = "${}", xa = /var\s*\(\s*--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)|#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\)|-?(?:\d+(?:\.\d+)?|\.\d+)/giu;
function Nt(t) {
  const e = t.toString(), n = [], i = {
    color: [],
    number: [],
    var: []
  }, s = [];
  let o = 0;
  const a = e.replace(xa, (l) => (F.test(l) ? (i.color.push(o), s.push(Ns), n.push(F.parse(l))) : l.startsWith(va) ? (i.var.push(o), s.push(ya), n.push(l)) : (i.number.push(o), s.push(Os), n.push(parseFloat(l))), ++o, zn)).split(zn);
  return { values: n, split: a, indexes: i, types: s };
}
function Us(t) {
  return Nt(t).values;
}
function Ks(t) {
  const { split: e, types: n } = Nt(t), i = e.length;
  return (s) => {
    let o = "";
    for (let r = 0; r < i; r++)
      if (o += e[r], s[r] !== void 0) {
        const a = n[r];
        a === Os ? o += Rt(s[r]) : a === Ns ? o += F.transform(s[r]) : o += s[r];
      }
    return o;
  };
}
const Ta = (t) => typeof t == "number" ? 0 : t;
function ba(t) {
  const e = Us(t);
  return Ks(t)(e.map(Ta));
}
const nt = {
  test: ga,
  parse: Us,
  createTransformer: Ks,
  getAnimatableNone: ba
}, Sa = /* @__PURE__ */ new Set(["brightness", "contrast", "saturate", "opacity"]);
function Pa(t) {
  const [e, n] = t.slice(0, -1).split("(");
  if (e === "drop-shadow")
    return t;
  const [i] = n.match(Sn) || [];
  if (!i)
    return t;
  const s = n.replace(i, "");
  let o = Sa.has(e) ? 1 : 0;
  return i !== n && (o *= 100), e + "(" + o + s + ")";
}
const wa = /\b([a-z-]*)\(.*?\)/gu, Fe = {
  ...nt,
  getAnimatableNone: (t) => {
    const e = t.match(wa);
    return e ? e.map(Pa).join(" ") : t;
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
  filter: Fe,
  WebkitFilter: Fe
}, wn = (t) => Aa[t];
function _s(t, e) {
  let n = wn(t);
  return n !== Fe && (n = nt), n.getAnimatableNone ? n.getAnimatableNone(e) : void 0;
}
const Va = /* @__PURE__ */ new Set(["auto", "none", "0"]);
function Ca(t, e, n) {
  let i = 0, s;
  for (; i < t.length && !s; ) {
    const o = t[i];
    typeof o == "string" && !Va.has(o) && Nt(o).values.length && (s = t[i]), i++;
  }
  if (s && n)
    for (const o of e)
      t[o] = _s(n, s);
}
const Wn = (t) => t === Pt || t === S, Gn = (t, e) => parseFloat(t.split(", ")[e]), Hn = (t, e) => (n, { transform: i }) => {
  if (i === "none" || !i)
    return 0;
  const s = i.match(/^matrix3d\((.+)\)$/u);
  if (s)
    return Gn(s[1], e);
  {
    const o = i.match(/^matrix\((.+)\)$/u);
    return o ? Gn(o[1], t) : 0;
  }
}, Da = /* @__PURE__ */ new Set(["x", "y", "z"]), Ma = St.filter((t) => !Da.has(t));
function Ra(t) {
  const e = [];
  return Ma.forEach((n) => {
    const i = t.getValue(n);
    i !== void 0 && (e.push([n, i.get()]), i.set(n.startsWith("scale") ? 1 : 0));
  }), e;
}
const xt = {
  // Dimensions
  width: ({ x: t }, { paddingLeft: e = "0", paddingRight: n = "0" }) => t.max - t.min - parseFloat(e) - parseFloat(n),
  height: ({ y: t }, { paddingTop: e = "0", paddingBottom: n = "0" }) => t.max - t.min - parseFloat(e) - parseFloat(n),
  top: (t, { top: e }) => parseFloat(e),
  left: (t, { left: e }) => parseFloat(e),
  bottom: ({ y: t }, { top: e }) => parseFloat(e) + (t.max - t.min),
  right: ({ x: t }, { left: e }) => parseFloat(e) + (t.max - t.min),
  // Transform
  x: Hn(4, 13),
  y: Hn(5, 14)
};
xt.translateX = xt.x;
xt.translateY = xt.y;
const lt = /* @__PURE__ */ new Set();
let Ie = !1, Be = !1;
function $s() {
  if (Be) {
    const t = Array.from(lt).filter((i) => i.needsMeasurement), e = new Set(t.map((i) => i.element)), n = /* @__PURE__ */ new Map();
    e.forEach((i) => {
      const s = Ra(i);
      s.length && (n.set(i, s), i.render());
    }), t.forEach((i) => i.measureInitialState()), e.forEach((i) => {
      i.render();
      const s = n.get(i);
      s && s.forEach(([o, r]) => {
        var a;
        (a = i.getValue(o)) === null || a === void 0 || a.set(r);
      });
    }), t.forEach((i) => i.measureEndState()), t.forEach((i) => {
      i.suspendedScrollY !== void 0 && window.scrollTo(0, i.suspendedScrollY);
    });
  }
  Be = !1, Ie = !1, lt.forEach((t) => t.complete()), lt.clear();
}
function zs() {
  lt.forEach((t) => {
    t.readKeyframes(), t.needsMeasurement && (Be = !0);
  });
}
function Ea() {
  zs(), $s();
}
class An {
  constructor(e, n, i, s, o, r = !1) {
    this.isComplete = !1, this.isAsync = !1, this.needsMeasurement = !1, this.isScheduled = !1, this.unresolvedKeyframes = [...e], this.onComplete = n, this.name = i, this.motionValue = s, this.element = o, this.isAsync = r;
  }
  scheduleResolve() {
    this.isScheduled = !0, this.isAsync ? (lt.add(this), Ie || (Ie = !0, V.read(zs), V.resolveKeyframes($s))) : (this.readKeyframes(), this.complete());
  }
  readKeyframes() {
    const { unresolvedKeyframes: e, name: n, element: i, motionValue: s } = this;
    for (let o = 0; o < e.length; o++)
      if (e[o] === null)
        if (o === 0) {
          const r = s?.get(), a = e[e.length - 1];
          if (r !== void 0)
            e[0] = r;
          else if (i && n) {
            const l = i.readValue(n, a);
            l != null && (e[0] = l);
          }
          e[0] === void 0 && (e[0] = a), s && r === void 0 && s.set(e[0]);
        } else
          e[o] = e[o - 1];
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
const Ws = (t) => /^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(t), ka = (
  // eslint-disable-next-line redos-detector/no-unsafe-regex -- false positive, as it can match a lot of words
  /^var\(--(?:([\w-]+)|([\w-]+), ?([a-zA-Z\d ()%#.,-]+))\)/u
);
function La(t) {
  const e = ka.exec(t);
  if (!e)
    return [,];
  const [, n, i, s] = e;
  return [`--${n ?? i}`, s];
}
function Gs(t, e, n = 1) {
  const [i, s] = La(t);
  if (!i)
    return;
  const o = window.getComputedStyle(e).getPropertyValue(i);
  if (o) {
    const r = o.trim();
    return Ws(r) ? parseFloat(r) : r;
  }
  return on(s) ? Gs(s, e, n + 1) : s;
}
const Hs = (t) => (e) => e.test(t), Fa = {
  test: (t) => t === "auto",
  parse: (t) => t
}, Xs = [Pt, S, W, Q, Po, So, Fa], Xn = (t) => Xs.find(Hs(t));
class Ys extends An {
  constructor(e, n, i, s, o) {
    super(e, n, i, s, o, !0);
  }
  readKeyframes() {
    const { unresolvedKeyframes: e, element: n, name: i } = this;
    if (!n || !n.current)
      return;
    super.readKeyframes();
    for (let l = 0; l < e.length; l++) {
      let c = e[l];
      if (typeof c == "string" && (c = c.trim(), on(c))) {
        const u = Gs(c, n.current);
        u !== void 0 && (e[l] = u), l === e.length - 1 && (this.finalKeyframe = c);
      }
    }
    if (this.resolveNoneKeyframes(), !As.has(i) || e.length !== 2)
      return;
    const [s, o] = e, r = Xn(s), a = Xn(o);
    if (r !== a)
      if (Wn(r) && Wn(a))
        for (let l = 0; l < e.length; l++) {
          const c = e[l];
          typeof c == "string" && (e[l] = parseFloat(c));
        }
      else
        this.needsMeasurement = !0;
  }
  resolveNoneKeyframes() {
    const { unresolvedKeyframes: e, name: n } = this, i = [];
    for (let s = 0; s < e.length; s++)
      ua(e[s]) && i.push(s);
    i.length && Ca(e, i, n);
  }
  measureInitialState() {
    const { element: e, unresolvedKeyframes: n, name: i } = this;
    if (!e || !e.current)
      return;
    i === "height" && (this.suspendedScrollY = window.pageYOffset), this.measuredOrigin = xt[i](e.measureViewportBox(), window.getComputedStyle(e.current)), n[0] = this.measuredOrigin;
    const s = n[n.length - 1];
    s !== void 0 && e.getValue(i, s).jump(s, !1);
  }
  measureEndState() {
    var e;
    const { element: n, name: i, unresolvedKeyframes: s } = this;
    if (!n || !n.current)
      return;
    const o = n.getValue(i);
    o && o.jump(this.measuredOrigin, !1);
    const r = s.length - 1, a = s[r];
    s[r] = xt[i](n.measureViewportBox(), window.getComputedStyle(n.current)), a !== null && this.finalKeyframe === void 0 && (this.finalKeyframe = a), !((e = this.removedTransforms) === null || e === void 0) && e.length && this.removedTransforms.forEach(([l, c]) => {
      n.getValue(l).set(c);
    }), this.resolveNoneKeyframes();
  }
}
const Yn = (t, e) => e === "zIndex" ? !1 : !!(typeof t == "number" || Array.isArray(t) || typeof t == "string" && // It's animatable if we have a string
(nt.test(t) || t === "0") && // And it contains numbers and/or colors
!t.startsWith("url("));
function Ia(t) {
  const e = t[0];
  if (t.length === 1)
    return !0;
  for (let n = 0; n < t.length; n++)
    if (t[n] !== e)
      return !0;
}
function Ba(t, e, n, i) {
  const s = t[0];
  if (s === null)
    return !1;
  if (e === "display" || e === "visibility")
    return !0;
  const o = t[t.length - 1], r = Yn(s, e), a = Yn(o, e);
  return !r || !a ? !1 : Ia(t) || (n === "spring" || mn(n)) && i;
}
const ja = (t) => t !== null;
function he(t, { repeat: e, repeatType: n = "loop" }, i) {
  const s = t.filter(ja), o = e && n !== "loop" && e % 2 === 1 ? 0 : s.length - 1;
  return !o || i === void 0 ? s[o] : i;
}
const Oa = 40;
class qs {
  constructor({ autoplay: e = !0, delay: n = 0, type: i = "keyframes", repeat: s = 0, repeatDelay: o = 0, repeatType: r = "loop", ...a }) {
    this.isStopped = !1, this.hasAttemptedResolve = !1, this.createdAt = G.now(), this.options = {
      autoplay: e,
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
  onKeyframesResolved(e, n) {
    this.resolvedAt = G.now(), this.hasAttemptedResolve = !0;
    const { name: i, type: s, velocity: o, delay: r, onComplete: a, onUpdate: l, isGenerator: c } = this.options;
    if (!c && !Ba(e, i, s, o))
      if (r)
        this.options.duration = 0;
      else {
        l && l(he(e, this.options, n)), a && a(), this.resolveFinishedPromise();
        return;
      }
    const u = this.initPlayback(e, n);
    u !== !1 && (this._resolved = {
      keyframes: e,
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
  then(e, n) {
    return this.currentFinishedPromise.then(e, n);
  }
  flatten() {
    this.options.type = "keyframes", this.options.ease = "linear";
  }
  updateFinishedPromise() {
    this.currentFinishedPromise = new Promise((e) => {
      this.resolveFinishedPromise = e;
    });
  }
}
const C = (t, e, n) => t + (e - t) * n;
function ye(t, e, n) {
  return n < 0 && (n += 1), n > 1 && (n -= 1), n < 1 / 6 ? t + (e - t) * 6 * n : n < 1 / 2 ? e : n < 2 / 3 ? t + (e - t) * (2 / 3 - n) * 6 : t;
}
function Na({ hue: t, saturation: e, lightness: n, alpha: i }) {
  t /= 360, e /= 100, n /= 100;
  let s = 0, o = 0, r = 0;
  if (!e)
    s = o = r = n;
  else {
    const a = n < 0.5 ? n * (1 + e) : n + e - n * e, l = 2 * n - a;
    s = ye(l, a, t + 1 / 3), o = ye(l, a, t), r = ye(l, a, t - 1 / 3);
  }
  return {
    red: Math.round(s * 255),
    green: Math.round(o * 255),
    blue: Math.round(r * 255),
    alpha: i
  };
}
function ne(t, e) {
  return (n) => n > 0 ? e : t;
}
const ve = (t, e, n) => {
  const i = t * t, s = n * (e * e - i) + i;
  return s < 0 ? 0 : Math.sqrt(s);
}, Ua = [Le, at, ft], Ka = (t) => Ua.find((e) => e.test(t));
function qn(t) {
  const e = Ka(t);
  if (!e)
    return !1;
  let n = e.parse(t);
  return e === ft && (n = Na(n)), n;
}
const Zn = (t, e) => {
  const n = qn(t), i = qn(e);
  if (!n || !i)
    return ne(t, e);
  const s = { ...n };
  return (o) => (s.red = ve(n.red, i.red, o), s.green = ve(n.green, i.green, o), s.blue = ve(n.blue, i.blue, o), s.alpha = C(n.alpha, i.alpha, o), at.transform(s));
}, _a = (t, e) => (n) => e(t(n)), $t = (...t) => t.reduce(_a), je = /* @__PURE__ */ new Set(["none", "hidden"]);
function $a(t, e) {
  return je.has(t) ? (n) => n <= 0 ? t : e : (n) => n >= 1 ? e : t;
}
function za(t, e) {
  return (n) => C(t, e, n);
}
function Vn(t) {
  return typeof t == "number" ? za : typeof t == "string" ? on(t) ? ne : F.test(t) ? Zn : Ha : Array.isArray(t) ? Zs : typeof t == "object" ? F.test(t) ? Zn : Wa : ne;
}
function Zs(t, e) {
  const n = [...t], i = n.length, s = t.map((o, r) => Vn(o)(o, e[r]));
  return (o) => {
    for (let r = 0; r < i; r++)
      n[r] = s[r](o);
    return n;
  };
}
function Wa(t, e) {
  const n = { ...t, ...e }, i = {};
  for (const s in n)
    t[s] !== void 0 && e[s] !== void 0 && (i[s] = Vn(t[s])(t[s], e[s]));
  return (s) => {
    for (const o in i)
      n[o] = i[o](s);
    return n;
  };
}
function Ga(t, e) {
  var n;
  const i = [], s = { color: 0, var: 0, number: 0 };
  for (let o = 0; o < e.values.length; o++) {
    const r = e.types[o], a = t.indexes[r][s[r]], l = (n = t.values[a]) !== null && n !== void 0 ? n : 0;
    i[o] = l, s[r]++;
  }
  return i;
}
const Ha = (t, e) => {
  const n = nt.createTransformer(e), i = Nt(t), s = Nt(e);
  return i.indexes.var.length === s.indexes.var.length && i.indexes.color.length === s.indexes.color.length && i.indexes.number.length >= s.indexes.number.length ? je.has(t) && !s.values.length || je.has(e) && !i.values.length ? $a(t, e) : $t(Zs(Ga(i, s), s.values), n) : ne(t, e);
};
function Js(t, e, n) {
  return typeof t == "number" && typeof e == "number" && typeof n == "number" ? C(t, e, n) : Vn(t)(t, e);
}
const Xa = 5;
function Qs(t, e, n) {
  const i = Math.max(e - Xa, 0);
  return Vs(n - t(i), e - i);
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
}, xe = 1e-3;
function Ya({ duration: t = D.duration, bounce: e = D.bounce, velocity: n = D.velocity, mass: i = D.mass }) {
  let s, o, r = 1 - e;
  r = J(D.minDamping, D.maxDamping, r), t = J(D.minDuration, D.maxDuration, /* @__PURE__ */ Z(t)), r < 1 ? (s = (c) => {
    const u = c * r, h = u * t, d = u - n, f = Oe(c, r), m = Math.exp(-h);
    return xe - d / f * m;
  }, o = (c) => {
    const h = c * r * t, d = h * n + n, f = Math.pow(r, 2) * Math.pow(c, 2) * t, m = Math.exp(-h), p = Oe(Math.pow(c, 2), r);
    return (-s(c) + xe > 0 ? -1 : 1) * ((d - f) * m) / p;
  }) : (s = (c) => {
    const u = Math.exp(-c * t), h = (c - n) * t + 1;
    return -xe + u * h;
  }, o = (c) => {
    const u = Math.exp(-c * t), h = (n - c) * (t * t);
    return u * h;
  });
  const a = 5 / t, l = Za(s, o, a);
  if (t = /* @__PURE__ */ q(t), isNaN(l))
    return {
      stiffness: D.stiffness,
      damping: D.damping,
      duration: t
    };
  {
    const c = Math.pow(l, 2) * i;
    return {
      stiffness: c,
      damping: r * 2 * Math.sqrt(i * c),
      duration: t
    };
  }
}
const qa = 12;
function Za(t, e, n) {
  let i = n;
  for (let s = 1; s < qa; s++)
    i = i - t(i) / e(i);
  return i;
}
function Oe(t, e) {
  return t * Math.sqrt(1 - e * e);
}
const Ja = ["duration", "bounce"], Qa = ["stiffness", "damping", "mass"];
function Jn(t, e) {
  return e.some((n) => t[n] !== void 0);
}
function tl(t) {
  let e = {
    velocity: D.velocity,
    stiffness: D.stiffness,
    damping: D.damping,
    mass: D.mass,
    isResolvedFromDuration: !1,
    ...t
  };
  if (!Jn(t, Qa) && Jn(t, Ja))
    if (t.visualDuration) {
      const n = t.visualDuration, i = 2 * Math.PI / (n * 1.2), s = i * i, o = 2 * J(0.05, 1, 1 - (t.bounce || 0)) * Math.sqrt(s);
      e = {
        ...e,
        mass: D.mass,
        stiffness: s,
        damping: o
      };
    } else {
      const n = Ya(t);
      e = {
        ...e,
        ...n,
        mass: D.mass
      }, e.isResolvedFromDuration = !0;
    }
  return e;
}
function tr(t = D.visualDuration, e = D.bounce) {
  const n = typeof t != "object" ? {
    visualDuration: t,
    keyframes: [0, 1],
    bounce: e
  } : t;
  let { restSpeed: i, restDelta: s } = n;
  const o = n.keyframes[0], r = n.keyframes[n.keyframes.length - 1], a = { done: !1, value: o }, { stiffness: l, damping: c, mass: u, duration: h, velocity: d, isResolvedFromDuration: f } = tl({
    ...n,
    velocity: -/* @__PURE__ */ Z(n.velocity || 0)
  }), m = d || 0, p = c / (2 * Math.sqrt(l * u)), y = r - o, g = /* @__PURE__ */ Z(Math.sqrt(l / u)), x = Math.abs(y) < 5;
  i || (i = x ? D.restSpeed.granular : D.restSpeed.default), s || (s = x ? D.restDelta.granular : D.restDelta.default);
  let T;
  if (p < 1) {
    const v = Oe(g, p);
    T = (A) => {
      const M = Math.exp(-p * g * A);
      return r - M * ((m + p * g * y) / v * Math.sin(v * A) + y * Math.cos(v * A));
    };
  } else if (p === 1)
    T = (v) => r - Math.exp(-g * v) * (y + (m + g * y) * v);
  else {
    const v = g * Math.sqrt(p * p - 1);
    T = (A) => {
      const M = Math.exp(-p * g * A), P = Math.min(v * A, 300);
      return r - M * ((m + p * g * y) * Math.sinh(P) + v * y * Math.cosh(P)) / v;
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
        const P = Math.abs(M) <= i, L = Math.abs(r - A) <= s;
        a.done = P && L;
      }
      return a.value = a.done ? r : A, a;
    },
    toString: () => {
      const v = Math.min(vs(w), Re), A = xs((M) => w.next(v * M).value, v, 30);
      return v + "ms " + A;
    }
  };
  return w;
}
function Qn({ keyframes: t, velocity: e = 0, power: n = 0.8, timeConstant: i = 325, bounceDamping: s = 10, bounceStiffness: o = 500, modifyTarget: r, min: a, max: l, restDelta: c = 0.5, restSpeed: u }) {
  const h = t[0], d = {
    done: !1,
    value: h
  }, f = (P) => a !== void 0 && P < a || l !== void 0 && P > l, m = (P) => a === void 0 ? l : l === void 0 || Math.abs(a - P) < Math.abs(l - P) ? a : l;
  let p = n * e;
  const y = h + p, g = r === void 0 ? y : r(y);
  g !== y && (p = g - h);
  const x = (P) => -p * Math.exp(-P / i), T = (P) => g + x(P), w = (P) => {
    const L = x(P), U = T(P);
    d.done = Math.abs(L) <= c, d.value = d.done ? g : U;
  };
  let v, A;
  const M = (P) => {
    f(d.value) && (v = P, A = tr({
      keyframes: [d.value, m(d.value)],
      velocity: Qs(T, P, d.value),
      // TODO: This should be passing * 1000
      damping: s,
      stiffness: o,
      restDelta: c,
      restSpeed: u
    }));
  };
  return M(0), {
    calculatedDuration: null,
    next: (P) => {
      let L = !1;
      return !A && v === void 0 && (L = !0, w(P), M(P)), v !== void 0 && P >= v ? A.next(P - v) : (!L && w(P), d);
    }
  };
}
const el = /* @__PURE__ */ _t(0.42, 0, 1, 1), nl = /* @__PURE__ */ _t(0, 0, 0.58, 1), er = /* @__PURE__ */ _t(0.42, 0, 0.58, 1), il = (t) => Array.isArray(t) && typeof t[0] != "number", sl = {
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
}, ti = (t) => {
  if (pn(t)) {
    Ji(t.length === 4);
    const [e, n, i, s] = t;
    return _t(e, n, i, s);
  } else if (typeof t == "string")
    return sl[t];
  return t;
};
function rl(t, e, n) {
  const i = [], s = n || Js, o = t.length - 1;
  for (let r = 0; r < o; r++) {
    let a = s(t[r], t[r + 1]);
    if (e) {
      const l = Array.isArray(e) ? e[r] || O : e;
      a = $t(l, a);
    }
    i.push(a);
  }
  return i;
}
function ol(t, e, { clamp: n = !0, ease: i, mixer: s } = {}) {
  const o = t.length;
  if (Ji(o === e.length), o === 1)
    return () => e[0];
  if (o === 2 && e[0] === e[1])
    return () => e[1];
  const r = t[0] === t[1];
  t[0] > t[o - 1] && (t = [...t].reverse(), e = [...e].reverse());
  const a = rl(e, i, s), l = a.length, c = (u) => {
    if (r && u < t[0])
      return e[0];
    let h = 0;
    if (l > 1)
      for (; h < t.length - 2 && !(u < t[h + 1]); h++)
        ;
    const d = /* @__PURE__ */ yt(t[h], t[h + 1], u);
    return a[h](d);
  };
  return n ? (u) => c(J(t[0], t[o - 1], u)) : c;
}
function al(t, e) {
  const n = t[t.length - 1];
  for (let i = 1; i <= e; i++) {
    const s = /* @__PURE__ */ yt(0, e, i);
    t.push(C(n, 1, s));
  }
}
function ll(t) {
  const e = [0];
  return al(e, t.length - 1), e;
}
function cl(t, e) {
  return t.map((n) => n * e);
}
function ul(t, e) {
  return t.map(() => e || er).splice(0, t.length - 1);
}
function ie({ duration: t = 300, keyframes: e, times: n, ease: i = "easeInOut" }) {
  const s = il(i) ? i.map(ti) : ti(i), o = {
    done: !1,
    value: e[0]
  }, r = cl(
    // Only use the provided offsets if they're the correct length
    // TODO Maybe we should warn here if there's a length mismatch
    n && n.length === e.length ? n : ll(e),
    t
  ), a = ol(r, e, {
    ease: Array.isArray(s) ? s : ul(e, s)
  });
  return {
    calculatedDuration: t,
    next: (l) => (o.value = a(l), o.done = l >= t, o)
  };
}
const hl = (t) => {
  const e = ({ timestamp: n }) => t(n);
  return {
    start: () => V.update(e, !0),
    stop: () => et(e),
    /**
     * If we're processing this frame we can use the
     * framelocked timestamp to keep things in sync.
     */
    now: () => k.isProcessing ? k.timestamp : G.now()
  };
}, dl = {
  decay: Qn,
  inertia: Qn,
  tween: ie,
  keyframes: ie,
  spring: tr
}, fl = (t) => t / 100;
class Cn extends qs {
  constructor(e) {
    super(e), this.holdTime = null, this.cancelTime = null, this.currentTime = 0, this.playbackSpeed = 1, this.pendingPlayState = "running", this.startTime = null, this.state = "idle", this.stop = () => {
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
  initPlayback(e) {
    const { type: n = "keyframes", repeat: i = 0, repeatDelay: s = 0, repeatType: o, velocity: r = 0 } = this.options, a = mn(n) ? n : dl[n] || ie;
    let l, c;
    a !== ie && typeof e[0] != "number" && (l = $t(fl, Js(e[0], e[1])), e = [0, 100]);
    const u = a({ ...this.options, keyframes: e });
    o === "mirror" && (c = a({
      ...this.options,
      keyframes: [...e].reverse(),
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
    const { autoplay: e = !0 } = this.options;
    this.play(), this.pendingPlayState === "paused" || !e ? this.pause() : this.state = this.pendingPlayState;
  }
  tick(e, n = !1) {
    const { resolved: i } = this;
    if (!i) {
      const { keyframes: P } = this.options;
      return { done: !0, value: P[P.length - 1] };
    }
    const { finalKeyframe: s, generator: o, mirroredGenerator: r, mapPercentToKeyframes: a, keyframes: l, calculatedDuration: c, totalDuration: u, resolvedDuration: h } = i;
    if (this.startTime === null)
      return o.next(0);
    const { delay: d, repeat: f, repeatType: m, repeatDelay: p, onUpdate: y } = this.options;
    this.speed > 0 ? this.startTime = Math.min(this.startTime, e) : this.speed < 0 && (this.startTime = Math.min(e - u / this.speed, this.startTime)), n ? this.currentTime = e : this.holdTime !== null ? this.currentTime = this.holdTime : this.currentTime = Math.round(e - this.startTime) * this.speed;
    const g = this.currentTime - d * (this.speed >= 0 ? 1 : -1), x = this.speed >= 0 ? g < 0 : g > u;
    this.currentTime = Math.max(g, 0), this.state === "finished" && this.holdTime === null && (this.currentTime = u);
    let T = this.currentTime, w = o;
    if (f) {
      const P = Math.min(this.currentTime, u) / h;
      let L = Math.floor(P), U = P % 1;
      !U && P >= 1 && (U = 1), U === 1 && L--, L = Math.min(L, f + 1), !!(L % 2) && (m === "reverse" ? (U = 1 - U, p && (U -= p / h)) : m === "mirror" && (w = r)), T = J(0, 1, U) * h;
    }
    const v = x ? { done: !1, value: l[0] } : w.next(T);
    a && (v.value = a(v.value));
    let { done: A } = v;
    !x && c !== null && (A = this.speed >= 0 ? this.currentTime >= u : this.currentTime <= 0);
    const M = this.holdTime === null && (this.state === "finished" || this.state === "running" && A);
    return M && s !== void 0 && (v.value = he(l, this.options, s)), y && y(v.value), M && this.finish(), v;
  }
  get duration() {
    const { resolved: e } = this;
    return e ? /* @__PURE__ */ Z(e.calculatedDuration) : 0;
  }
  get time() {
    return /* @__PURE__ */ Z(this.currentTime);
  }
  set time(e) {
    e = /* @__PURE__ */ q(e), this.currentTime = e, this.holdTime !== null || this.speed === 0 ? this.holdTime = e : this.driver && (this.startTime = this.driver.now() - e / this.speed);
  }
  get speed() {
    return this.playbackSpeed;
  }
  set speed(e) {
    const n = this.playbackSpeed !== e;
    this.playbackSpeed = e, n && (this.time = /* @__PURE__ */ Z(this.currentTime));
  }
  play() {
    if (this.resolver.isScheduled || this.resolver.resume(), !this._resolved) {
      this.pendingPlayState = "running";
      return;
    }
    if (this.isStopped)
      return;
    const { driver: e = hl, onPlay: n, startTime: i } = this.options;
    this.driver || (this.driver = e((o) => this.tick(o))), n && n();
    const s = this.driver.now();
    this.holdTime !== null ? this.startTime = s - this.holdTime : this.startTime ? this.state === "finished" && (this.startTime = s) : this.startTime = i ?? this.calcStartTime(), this.state === "finished" && this.updateFinishedPromise(), this.cancelTime = this.startTime, this.holdTime = null, this.state = "running", this.driver.start();
  }
  pause() {
    var e;
    if (!this._resolved) {
      this.pendingPlayState = "paused";
      return;
    }
    this.state = "paused", this.holdTime = (e = this.currentTime) !== null && e !== void 0 ? e : 0;
  }
  complete() {
    this.state !== "running" && this.play(), this.pendingPlayState = this.state = "finished", this.holdTime = null;
  }
  finish() {
    this.teardown(), this.state = "finished";
    const { onComplete: e } = this.options;
    e && e();
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
  sample(e) {
    return this.startTime = 0, this.tick(e, !0);
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
function pl(t, e, n, { delay: i = 0, duration: s = 300, repeat: o = 0, repeatType: r = "loop", ease: a = "easeInOut", times: l } = {}) {
  const c = { [e]: n };
  l && (c.offset = l);
  const u = bs(a, s);
  return Array.isArray(u) && (c.easing = u), t.animate(c, {
    delay: i,
    duration: s,
    easing: Array.isArray(u) ? "linear" : u,
    fill: "both",
    iterations: o + 1,
    direction: r === "reverse" ? "alternate" : "normal"
  });
}
const gl = /* @__PURE__ */ Je(() => Object.hasOwnProperty.call(Element.prototype, "animate")), se = 10, yl = 2e4;
function vl(t) {
  return mn(t.type) || t.type === "spring" || !Ts(t.ease);
}
function xl(t, e) {
  const n = new Cn({
    ...e,
    keyframes: t,
    repeat: 0,
    delay: 0,
    isGenerator: !0
  });
  let i = { done: !1, value: t[0] };
  const s = [];
  let o = 0;
  for (; !i.done && o < yl; )
    i = n.sample(o), s.push(i.value), o += se;
  return {
    times: void 0,
    keyframes: s,
    duration: o - se,
    ease: "linear"
  };
}
const nr = {
  anticipate: Ls,
  backInOut: ks,
  circInOut: Is
};
function Tl(t) {
  return t in nr;
}
class ei extends qs {
  constructor(e) {
    super(e);
    const { name: n, motionValue: i, element: s, keyframes: o } = this.options;
    this.resolver = new Ys(o, (r, a) => this.onKeyframesResolved(r, a), n, i, s), this.resolver.scheduleResolve();
  }
  initPlayback(e, n) {
    let { duration: i = 300, times: s, ease: o, type: r, motionValue: a, name: l, startTime: c } = this.options;
    if (!a.owner || !a.owner.current)
      return !1;
    if (typeof o == "string" && ee() && Tl(o) && (o = nr[o]), vl(this.options)) {
      const { onComplete: h, onUpdate: d, motionValue: f, element: m, ...p } = this.options, y = xl(e, p);
      e = y.keyframes, e.length === 1 && (e[1] = e[0]), i = y.duration, s = y.times, o = y.ease, r = "keyframes";
    }
    const u = pl(a.owner.current, l, e, { ...this.options, duration: i, times: s, ease: o });
    return u.startTime = c ?? this.calcStartTime(), this.pendingTimeline ? (Nn(u, this.pendingTimeline), this.pendingTimeline = void 0) : u.onfinish = () => {
      const { onComplete: h } = this.options;
      a.set(he(e, this.options, n)), h && h(), this.cancel(), this.resolveFinishedPromise();
    }, {
      animation: u,
      duration: i,
      times: s,
      type: r,
      ease: o,
      keyframes: e
    };
  }
  get duration() {
    const { resolved: e } = this;
    if (!e)
      return 0;
    const { duration: n } = e;
    return /* @__PURE__ */ Z(n);
  }
  get time() {
    const { resolved: e } = this;
    if (!e)
      return 0;
    const { animation: n } = e;
    return /* @__PURE__ */ Z(n.currentTime || 0);
  }
  set time(e) {
    const { resolved: n } = this;
    if (!n)
      return;
    const { animation: i } = n;
    i.currentTime = /* @__PURE__ */ q(e);
  }
  get speed() {
    const { resolved: e } = this;
    if (!e)
      return 1;
    const { animation: n } = e;
    return n.playbackRate;
  }
  set speed(e) {
    const { resolved: n } = this;
    if (!n)
      return;
    const { animation: i } = n;
    i.playbackRate = e;
  }
  get state() {
    const { resolved: e } = this;
    if (!e)
      return "idle";
    const { animation: n } = e;
    return n.playState;
  }
  get startTime() {
    const { resolved: e } = this;
    if (!e)
      return null;
    const { animation: n } = e;
    return n.startTime;
  }
  /**
   * Replace the default DocumentTimeline with another AnimationTimeline.
   * Currently used for scroll animations.
   */
  attachTimeline(e) {
    if (!this._resolved)
      this.pendingTimeline = e;
    else {
      const { resolved: n } = this;
      if (!n)
        return O;
      const { animation: i } = n;
      Nn(i, e);
    }
    return O;
  }
  play() {
    if (this.isStopped)
      return;
    const { resolved: e } = this;
    if (!e)
      return;
    const { animation: n } = e;
    n.playState === "finished" && this.updateFinishedPromise(), n.play();
  }
  pause() {
    const { resolved: e } = this;
    if (!e)
      return;
    const { animation: n } = e;
    n.pause();
  }
  stop() {
    if (this.resolver.cancel(), this.isStopped = !0, this.state === "idle")
      return;
    this.resolveFinishedPromise(), this.updateFinishedPromise();
    const { resolved: e } = this;
    if (!e)
      return;
    const { animation: n, keyframes: i, duration: s, type: o, ease: r, times: a } = e;
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
      c.setWithVelocity(m.sample(p - se).value, m.sample(p).value, se);
    }
    const { onStop: l } = this.options;
    l && l(), this.cancel();
  }
  complete() {
    const { resolved: e } = this;
    e && e.animation.finish();
  }
  cancel() {
    const { resolved: e } = this;
    e && e.animation.cancel();
  }
  static supports(e) {
    const { motionValue: n, name: i, repeatDelay: s, repeatType: o, damping: r, type: a } = e;
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
}, Sl = (t) => ({
  type: "spring",
  stiffness: 550,
  damping: t === 0 ? 2 * Math.sqrt(550) : 30,
  restSpeed: 10
}), Pl = {
  type: "keyframes",
  duration: 0.8
}, wl = {
  type: "keyframes",
  ease: [0.25, 0.1, 0.35, 1],
  duration: 0.3
}, Al = (t, { keyframes: e }) => e.length > 2 ? Pl : ut.has(t) ? t.startsWith("scale") ? Sl(e[1]) : bl : wl;
function Vl({ when: t, delay: e, delayChildren: n, staggerChildren: i, staggerDirection: s, repeat: o, repeatType: r, repeatDelay: a, from: l, elapsed: c, ...u }) {
  return !!Object.keys(u).length;
}
const Dn = (t, e, n, i = {}, s, o) => (r) => {
  const a = fn(i, t) || {}, l = a.delay || i.delay || 0;
  let { elapsed: c = 0 } = i;
  c = c - /* @__PURE__ */ q(l);
  let u = {
    keyframes: Array.isArray(n) ? n : [null, n],
    ease: "easeOut",
    velocity: e.getVelocity(),
    ...a,
    delay: -c,
    onUpdate: (d) => {
      e.set(d), a.onUpdate && a.onUpdate(d);
    },
    onComplete: () => {
      r(), a.onComplete && a.onComplete();
    },
    name: t,
    motionValue: e,
    element: o ? void 0 : s
  };
  Vl(a) || (u = {
    ...u,
    ...Al(t, u)
  }), u.duration && (u.duration = /* @__PURE__ */ q(u.duration)), u.repeatDelay && (u.repeatDelay = /* @__PURE__ */ q(u.repeatDelay)), u.from !== void 0 && (u.keyframes[0] = u.from);
  let h = !1;
  if ((u.type === !1 || u.duration === 0 && !u.repeatDelay) && (u.duration = 0, u.delay === 0 && (h = !0)), h && !o && e.get() !== void 0) {
    const d = he(u.keyframes, a);
    if (d !== void 0)
      return V.update(() => {
        u.onUpdate(d), u.onComplete();
      }), new Wo([]);
  }
  return !o && ei.supports(u) ? new ei(u) : new Cn(u);
};
function Cl({ protectedKeys: t, needsAnimating: e }, n) {
  const i = t.hasOwnProperty(n) && e[n] !== !0;
  return e[n] = !1, i;
}
function ir(t, e, { delay: n = 0, transitionOverride: i, type: s } = {}) {
  var o;
  let { transition: r = t.getDefaultTransition(), transitionEnd: a, ...l } = e;
  i && (r = i);
  const c = [], u = s && t.animationState && t.animationState.getState()[s];
  for (const h in l) {
    const d = t.getValue(h, (o = t.latestValues[h]) !== null && o !== void 0 ? o : null), f = l[h];
    if (f === void 0 || u && Cl(u, h))
      continue;
    const m = {
      delay: n,
      ...fn(r || {}, h)
    };
    let p = !1;
    if (window.MotionHandoffAnimation) {
      const g = Cs(t);
      if (g) {
        const x = window.MotionHandoffAnimation(g, h, V);
        x !== null && (m.startTime = x, p = !0);
      }
    }
    ke(t, h), d.start(Dn(h, d, f, t.shouldReduceMotion && As.has(h) ? { type: !1 } : m, t, p));
    const y = d.animation;
    y && c.push(y);
  }
  return a && Promise.all(c).then(() => {
    V.update(() => {
      a && ra(t, a);
    });
  }), c;
}
function Ne(t, e, n = {}) {
  var i;
  const s = ue(t, e, n.type === "exit" ? (i = t.presenceContext) === null || i === void 0 ? void 0 : i.custom : void 0);
  let { transition: o = t.getDefaultTransition() || {} } = s || {};
  n.transitionOverride && (o = n.transitionOverride);
  const r = s ? () => Promise.all(ir(t, s, n)) : () => Promise.resolve(), a = t.variantChildren && t.variantChildren.size ? (c = 0) => {
    const { delayChildren: u = 0, staggerChildren: h, staggerDirection: d } = o;
    return Dl(t, e, u + c, h, d, n);
  } : () => Promise.resolve(), { when: l } = o;
  if (l) {
    const [c, u] = l === "beforeChildren" ? [r, a] : [a, r];
    return c().then(() => u());
  } else
    return Promise.all([r(), a(n.delay)]);
}
function Dl(t, e, n = 0, i = 0, s = 1, o) {
  const r = [], a = (t.variantChildren.size - 1) * i, l = s === 1 ? (c = 0) => c * i : (c = 0) => a - c * i;
  return Array.from(t.variantChildren).sort(Ml).forEach((c, u) => {
    c.notify("AnimationStart", e), r.push(Ne(c, e, {
      ...o,
      delay: n + l(u)
    }).then(() => c.notify("AnimationComplete", e)));
  }), Promise.all(r);
}
function Ml(t, e) {
  return t.sortNodePosition(e);
}
function Rl(t, e, n = {}) {
  t.notify("AnimationStart", e);
  let i;
  if (Array.isArray(e)) {
    const s = e.map((o) => Ne(t, o, n));
    i = Promise.all(s);
  } else if (typeof e == "string")
    i = Ne(t, e, n);
  else {
    const s = typeof e == "function" ? ue(t, e, n.custom) : e;
    i = Promise.all(ir(t, s, n));
  }
  return i.then(() => {
    t.notify("AnimationComplete", e);
  });
}
const El = tn.length;
function sr(t) {
  if (!t)
    return;
  if (!t.isControllingVariants) {
    const n = t.parent ? sr(t.parent) || {} : {};
    return t.props.initial !== void 0 && (n.initial = t.props.initial), n;
  }
  const e = {};
  for (let n = 0; n < El; n++) {
    const i = tn[n], s = t.props[i];
    (Bt(s) || s === !1) && (e[i] = s);
  }
  return e;
}
const kl = [...Qe].reverse(), Ll = Qe.length;
function Fl(t) {
  return (e) => Promise.all(e.map(({ animation: n, options: i }) => Rl(t, n, i)));
}
function Il(t) {
  let e = Fl(t), n = ni(), i = !0;
  const s = (l) => (c, u) => {
    var h;
    const d = ue(t, u, l === "exit" ? (h = t.presenceContext) === null || h === void 0 ? void 0 : h.custom : void 0);
    if (d) {
      const { transition: f, transitionEnd: m, ...p } = d;
      c = { ...c, ...p, ...m };
    }
    return c;
  };
  function o(l) {
    e = l(t);
  }
  function r(l) {
    const { props: c } = t, u = sr(t.parent) || {}, h = [], d = /* @__PURE__ */ new Set();
    let f = {}, m = 1 / 0;
    for (let y = 0; y < Ll; y++) {
      const g = kl[y], x = n[g], T = c[g] !== void 0 ? c[g] : u[g], w = Bt(T), v = g === l ? x.isActive : null;
      v === !1 && (m = y);
      let A = T === u[g] && T !== c[g] && w;
      if (A && i && t.manuallyAnimateOnMount && (A = !1), x.protectedKeys = { ...f }, // If it isn't active and hasn't *just* been set as inactive
      !x.isActive && v === null || // If we didn't and don't have any defined prop for this animation type
      !T && !x.prevProp || // Or if the prop doesn't define an animation
      le(T) || typeof T == "boolean")
        continue;
      const M = Bl(x.prevProp, T);
      let P = M || // If we're making this variant active, we want to always make it active
      g === l && x.isActive && !A && w || // If we removed a higher-priority variant (i is in reverse order)
      y > m && w, L = !1;
      const U = Array.isArray(T) ? T : [T];
      let ht = U.reduce(s(g), {});
      v === !1 && (ht = {});
      const { prevResolvedValues: Mn = {} } = x, Vr = {
        ...Mn,
        ...ht
      }, Rn = (j) => {
        P = !0, d.has(j) && (L = !0, d.delete(j)), x.needsAnimating[j] = !0;
        const H = t.getValue(j);
        H && (H.liveStyle = !1);
      };
      for (const j in Vr) {
        const H = ht[j], de = Mn[j];
        if (f.hasOwnProperty(j))
          continue;
        let fe = !1;
        Me(H) && Me(de) ? fe = !ys(H, de) : fe = H !== de, fe ? H != null ? Rn(j) : d.add(j) : H !== void 0 && d.has(j) ? Rn(j) : x.protectedKeys[j] = !0;
      }
      x.prevProp = T, x.prevResolvedValues = ht, x.isActive && (f = { ...f, ...ht }), i && t.blockInitialAnimation && (P = !1), P && (!(A && M) || L) && h.push(...U.map((j) => ({
        animation: j,
        options: { type: g }
      })));
    }
    if (d.size) {
      const y = {};
      d.forEach((g) => {
        const x = t.getBaseTarget(g), T = t.getValue(g);
        T && (T.liveStyle = !0), y[g] = x ?? null;
      }), h.push({ animation: y });
    }
    let p = !!h.length;
    return i && (c.initial === !1 || c.initial === c.animate) && !t.manuallyAnimateOnMount && (p = !1), i = !1, p ? e(h) : Promise.resolve();
  }
  function a(l, c) {
    var u;
    if (n[l].isActive === c)
      return Promise.resolve();
    (u = t.variantChildren) === null || u === void 0 || u.forEach((d) => {
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
function Bl(t, e) {
  return typeof e == "string" ? e !== t : Array.isArray(e) ? !ys(e, t) : !1;
}
function st(t = !1) {
  return {
    isActive: t,
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
  constructor(e) {
    this.isMounted = !1, this.node = e;
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
  constructor(e) {
    super(e), e.animationState || (e.animationState = Il(e));
  }
  updateAnimationControlsSubscription() {
    const { animate: e } = this.node.getProps();
    le(e) && (this.unmountControls = e.subscribe(this.node));
  }
  /**
   * Subscribe any provided AnimationControls to the component's VisualElement
   */
  mount() {
    this.updateAnimationControlsSubscription();
  }
  update() {
    const { animate: e } = this.node.getProps(), { animate: n } = this.node.prevProps || {};
    e !== n && this.updateAnimationControlsSubscription();
  }
  unmount() {
    var e;
    this.node.animationState.reset(), (e = this.unmountControls) === null || e === void 0 || e.call(this);
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
    const { isPresent: e, onExitComplete: n } = this.node.presenceContext, { isPresent: i } = this.node.prevPresenceContext || {};
    if (!this.node.animationState || e === i)
      return;
    const s = this.node.animationState.setActive("exit", !e);
    n && !e && s.then(() => n(this.id));
  }
  mount() {
    const { register: e } = this.node.presenceContext || {};
    e && (this.unmount = e(this.id));
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
function Ut(t, e, n, i = { passive: !0 }) {
  return t.addEventListener(e, n, i), () => t.removeEventListener(e, n);
}
function zt(t) {
  return {
    point: {
      x: t.pageX,
      y: t.pageY
    }
  };
}
const Kl = (t) => (e) => gn(e) && t(e, zt(e));
function Et(t, e, n, i) {
  return Ut(t, e, Kl(n), i);
}
const ii = (t, e) => Math.abs(t - e);
function _l(t, e) {
  const n = ii(t.x, e.x), i = ii(t.y, e.y);
  return Math.sqrt(n ** 2 + i ** 2);
}
class rr {
  constructor(e, n, { transformPagePoint: i, contextWindow: s, dragSnapToOrigin: o = !1 } = {}) {
    if (this.startEvent = null, this.lastMoveEvent = null, this.lastMoveEventInfo = null, this.handlers = {}, this.contextWindow = window, this.updatePoint = () => {
      if (!(this.lastMoveEvent && this.lastMoveEventInfo))
        return;
      const h = be(this.lastMoveEventInfo, this.history), d = this.startEvent !== null, f = _l(h.offset, { x: 0, y: 0 }) >= 3;
      if (!d && !f)
        return;
      const { point: m } = h, { timestamp: p } = k;
      this.history.push({ ...m, timestamp: p });
      const { onStart: y, onMove: g } = this.handlers;
      d || (y && y(this.lastMoveEvent, h), this.startEvent = this.lastMoveEvent), g && g(this.lastMoveEvent, h);
    }, this.handlePointerMove = (h, d) => {
      this.lastMoveEvent = h, this.lastMoveEventInfo = Te(d, this.transformPagePoint), V.update(this.updatePoint, !0);
    }, this.handlePointerUp = (h, d) => {
      this.end();
      const { onEnd: f, onSessionEnd: m, resumeAnimation: p } = this.handlers;
      if (this.dragSnapToOrigin && p && p(), !(this.lastMoveEvent && this.lastMoveEventInfo))
        return;
      const y = be(h.type === "pointercancel" ? this.lastMoveEventInfo : Te(d, this.transformPagePoint), this.history);
      this.startEvent && f && f(h, y), m && m(h, y);
    }, !gn(e))
      return;
    this.dragSnapToOrigin = o, this.handlers = n, this.transformPagePoint = i, this.contextWindow = s || window;
    const r = zt(e), a = Te(r, this.transformPagePoint), { point: l } = a, { timestamp: c } = k;
    this.history = [{ ...l, timestamp: c }];
    const { onSessionStart: u } = n;
    u && u(e, be(a, this.history)), this.removeListeners = $t(Et(this.contextWindow, "pointermove", this.handlePointerMove), Et(this.contextWindow, "pointerup", this.handlePointerUp), Et(this.contextWindow, "pointercancel", this.handlePointerUp));
  }
  updateHandlers(e) {
    this.handlers = e;
  }
  end() {
    this.removeListeners && this.removeListeners(), et(this.updatePoint);
  }
}
function Te(t, e) {
  return e ? { point: e(t.point) } : t;
}
function si(t, e) {
  return { x: t.x - e.x, y: t.y - e.y };
}
function be({ point: t }, e) {
  return {
    point: t,
    delta: si(t, or(e)),
    offset: si(t, $l(e)),
    velocity: zl(e, 0.1)
  };
}
function $l(t) {
  return t[0];
}
function or(t) {
  return t[t.length - 1];
}
function zl(t, e) {
  if (t.length < 2)
    return { x: 0, y: 0 };
  let n = t.length - 1, i = null;
  const s = or(t);
  for (; n >= 0 && (i = t[n], !(s.timestamp - i.timestamp > /* @__PURE__ */ q(e))); )
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
function N(t) {
  return t.max - t.min;
}
function Yl(t, e, n) {
  return Math.abs(t - e) <= n;
}
function ri(t, e, n, i = 0.5) {
  t.origin = i, t.originPoint = C(e.min, e.max, t.origin), t.scale = N(n) / N(e), t.translate = C(n.min, n.max, t.origin) - t.originPoint, (t.scale >= Wl && t.scale <= Gl || isNaN(t.scale)) && (t.scale = 1), (t.translate >= Hl && t.translate <= Xl || isNaN(t.translate)) && (t.translate = 0);
}
function kt(t, e, n, i) {
  ri(t.x, e.x, n.x, i ? i.originX : void 0), ri(t.y, e.y, n.y, i ? i.originY : void 0);
}
function oi(t, e, n) {
  t.min = n.min + e.min, t.max = t.min + N(e);
}
function ql(t, e, n) {
  oi(t.x, e.x, n.x), oi(t.y, e.y, n.y);
}
function ai(t, e, n) {
  t.min = e.min - n.min, t.max = t.min + N(e);
}
function Lt(t, e, n) {
  ai(t.x, e.x, n.x), ai(t.y, e.y, n.y);
}
function Zl(t, { min: e, max: n }, i) {
  return e !== void 0 && t < e ? t = i ? C(e, t, i.min) : Math.max(t, e) : n !== void 0 && t > n && (t = i ? C(n, t, i.max) : Math.min(t, n)), t;
}
function li(t, e, n) {
  return {
    min: e !== void 0 ? t.min + e : void 0,
    max: n !== void 0 ? t.max + n - (t.max - t.min) : void 0
  };
}
function Jl(t, { top: e, left: n, bottom: i, right: s }) {
  return {
    x: li(t.x, n, s),
    y: li(t.y, e, i)
  };
}
function ci(t, e) {
  let n = e.min - t.min, i = e.max - t.max;
  return e.max - e.min < t.max - t.min && ([n, i] = [i, n]), { min: n, max: i };
}
function Ql(t, e) {
  return {
    x: ci(t.x, e.x),
    y: ci(t.y, e.y)
  };
}
function tc(t, e) {
  let n = 0.5;
  const i = N(t), s = N(e);
  return s > i ? n = /* @__PURE__ */ yt(e.min, e.max - i, t.min) : i > s && (n = /* @__PURE__ */ yt(t.min, t.max - s, e.min)), J(0, 1, n);
}
function ec(t, e) {
  const n = {};
  return e.min !== void 0 && (n.min = e.min - t.min), e.max !== void 0 && (n.max = e.max - t.min), n;
}
const Ue = 0.35;
function nc(t = Ue) {
  return t === !1 ? t = 0 : t === !0 && (t = Ue), {
    x: ui(t, "left", "right"),
    y: ui(t, "top", "bottom")
  };
}
function ui(t, e, n) {
  return {
    min: hi(t, e),
    max: hi(t, n)
  };
}
function hi(t, e) {
  return typeof t == "number" ? t : t[e] || 0;
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
function _(t) {
  return [t("x"), t("y")];
}
function cr({ top: t, left: e, right: n, bottom: i }) {
  return {
    x: { min: e, max: n },
    y: { min: t, max: i }
  };
}
function ic({ x: t, y: e }) {
  return { top: e.min, right: t.max, bottom: e.max, left: t.min };
}
function sc(t, e) {
  if (!e)
    return t;
  const n = e({ x: t.left, y: t.top }), i = e({ x: t.right, y: t.bottom });
  return {
    top: n.y,
    left: n.x,
    bottom: i.y,
    right: i.x
  };
}
function Se(t) {
  return t === void 0 || t === 1;
}
function Ke({ scale: t, scaleX: e, scaleY: n }) {
  return !Se(t) || !Se(e) || !Se(n);
}
function rt(t) {
  return Ke(t) || ur(t) || t.z || t.rotate || t.rotateX || t.rotateY || t.skewX || t.skewY;
}
function ur(t) {
  return mi(t.x) || mi(t.y);
}
function mi(t) {
  return t && t !== "0%";
}
function re(t, e, n) {
  const i = t - n, s = e * i;
  return n + s;
}
function pi(t, e, n, i, s) {
  return s !== void 0 && (t = re(t, s, i)), re(t, n, i) + e;
}
function _e(t, e = 0, n = 1, i, s) {
  t.min = pi(t.min, e, n, i, s), t.max = pi(t.max, e, n, i, s);
}
function hr(t, { x: e, y: n }) {
  _e(t.x, e.translate, e.scale, e.originPoint), _e(t.y, n.translate, n.scale, n.originPoint);
}
const gi = 0.999999999999, yi = 1.0000000000001;
function rc(t, e, n, i = !1) {
  const s = n.length;
  if (!s)
    return;
  e.x = e.y = 1;
  let o, r;
  for (let a = 0; a < s; a++) {
    o = n[a], r = o.projectionDelta;
    const { visualElement: l } = o.options;
    l && l.props.style && l.props.style.display === "contents" || (i && o.options.layoutScroll && o.scroll && o !== o.root && gt(t, {
      x: -o.scroll.offset.x,
      y: -o.scroll.offset.y
    }), r && (e.x *= r.x.scale, e.y *= r.y.scale, hr(t, r)), i && rt(o.latestValues) && gt(t, o.latestValues));
  }
  e.x < yi && e.x > gi && (e.x = 1), e.y < yi && e.y > gi && (e.y = 1);
}
function pt(t, e) {
  t.min = t.min + e, t.max = t.max + e;
}
function vi(t, e, n, i, s = 0.5) {
  const o = C(t.min, t.max, s);
  _e(t, e, n, o, i);
}
function gt(t, e) {
  vi(t.x, e.x, e.scaleX, e.scale, e.originX), vi(t.y, e.y, e.scaleY, e.scale, e.originY);
}
function dr(t, e) {
  return cr(sc(t.getBoundingClientRect(), e));
}
function oc(t, e, n) {
  const i = dr(t, n), { scroll: s } = e;
  return s && (pt(i.x, s.offset.x), pt(i.y, s.offset.y)), i;
}
const fr = ({ current: t }) => t ? t.ownerDocument.defaultView : null, ac = /* @__PURE__ */ new WeakMap();
class lc {
  constructor(e) {
    this.openDragLock = null, this.isDragging = !1, this.currentDirection = null, this.originPoint = { x: 0, y: 0 }, this.constraints = !1, this.hasMutatedConstraints = !1, this.elastic = R(), this.visualElement = e;
  }
  start(e, { snapToCursor: n = !1 } = {}) {
    const { presenceContext: i } = this.visualElement;
    if (i && i.isPresent === !1)
      return;
    const s = (u) => {
      const { dragSnapToOrigin: h } = this.getProps();
      h ? this.pauseAnimation() : this.stopAnimation(), n && this.snapToCursor(zt(u).point);
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
      }), m && V.postRender(() => m(u, h)), ke(this.visualElement, "transform");
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
    this.panSession = new rr(e, {
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
  stop(e, n) {
    const i = this.isDragging;
    if (this.cancel(), !i)
      return;
    const { velocity: s } = n;
    this.startAnimation(s);
    const { onDragEnd: o } = this.getProps();
    o && V.postRender(() => o(e, n));
  }
  cancel() {
    this.isDragging = !1;
    const { projection: e, animationState: n } = this.visualElement;
    e && (e.isAnimationBlocked = !1), this.panSession && this.panSession.end(), this.panSession = void 0;
    const { dragPropagation: i } = this.getProps();
    !i && this.openDragLock && (this.openDragLock(), this.openDragLock = null), n && n.setActive("whileDrag", !1);
  }
  updateAxis(e, n, i) {
    const { drag: s } = this.getProps();
    if (!i || !Xt(e, s, this.currentDirection))
      return;
    const o = this.getAxisMotionValue(e);
    let r = this.originPoint[e] + i[e];
    this.constraints && this.constraints[e] && (r = Zl(r, this.constraints[e], this.elastic[e])), o.set(r);
  }
  resolveConstraints() {
    var e;
    const { dragConstraints: n, dragElastic: i } = this.getProps(), s = this.visualElement.projection && !this.visualElement.projection.layout ? this.visualElement.projection.measure(!1) : (e = this.visualElement.projection) === null || e === void 0 ? void 0 : e.layout, o = this.constraints;
    n && dt(n) ? this.constraints || (this.constraints = this.resolveRefConstraints()) : n && s ? this.constraints = Jl(s.layoutBox, n) : this.constraints = !1, this.elastic = nc(i), o !== this.constraints && s && this.constraints && !this.hasMutatedConstraints && _((r) => {
      this.constraints !== !1 && this.getAxisMotionValue(r) && (this.constraints[r] = ec(s.layoutBox[r], this.constraints[r]));
    });
  }
  resolveRefConstraints() {
    const { dragConstraints: e, onMeasureDragConstraints: n } = this.getProps();
    if (!e || !dt(e))
      return !1;
    const i = e.current, { projection: s } = this.visualElement;
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
  startAnimation(e) {
    const { drag: n, dragMomentum: i, dragElastic: s, dragTransition: o, dragSnapToOrigin: r, onDragTransitionEnd: a } = this.getProps(), l = this.constraints || {}, c = _((u) => {
      if (!Xt(u, n, this.currentDirection))
        return;
      let h = l && l[u] || {};
      r && (h = { min: 0, max: 0 });
      const d = s ? 200 : 1e6, f = s ? 40 : 1e7, m = {
        type: "inertia",
        velocity: i ? e[u] : 0,
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
  startAxisValueAnimation(e, n) {
    const i = this.getAxisMotionValue(e);
    return ke(this.visualElement, e), i.start(Dn(e, i, 0, n, this.visualElement, !1));
  }
  stopAnimation() {
    _((e) => this.getAxisMotionValue(e).stop());
  }
  pauseAnimation() {
    _((e) => {
      var n;
      return (n = this.getAxisMotionValue(e).animation) === null || n === void 0 ? void 0 : n.pause();
    });
  }
  getAnimationState(e) {
    var n;
    return (n = this.getAxisMotionValue(e).animation) === null || n === void 0 ? void 0 : n.state;
  }
  /**
   * Drag works differently depending on which props are provided.
   *
   * - If _dragX and _dragY are provided, we output the gesture delta directly to those motion values.
   * - Otherwise, we apply the delta to the x/y motion values.
   */
  getAxisMotionValue(e) {
    const n = `_drag${e.toUpperCase()}`, i = this.visualElement.getProps(), s = i[n];
    return s || this.visualElement.getValue(e, (i.initial ? i.initial[e] : void 0) || 0);
  }
  snapToCursor(e) {
    _((n) => {
      const { drag: i } = this.getProps();
      if (!Xt(n, i, this.currentDirection))
        return;
      const { projection: s } = this.visualElement, o = this.getAxisMotionValue(n);
      if (s && s.layout) {
        const { min: r, max: a } = s.layout.layoutBox[n];
        o.set(e[n] - C(r, a, 0.5));
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
    const { drag: e, dragConstraints: n } = this.getProps(), { projection: i } = this.visualElement;
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
      if (!Xt(r, e, null))
        return;
      const a = this.getAxisMotionValue(r), { min: l, max: c } = this.constraints[r];
      a.set(C(l, c, s[r]));
    });
  }
  addListeners() {
    if (!this.visualElement.current)
      return;
    ac.set(this.visualElement, this);
    const e = this.visualElement.current, n = Et(e, "pointerdown", (l) => {
      const { drag: c, dragListener: u = !0 } = this.getProps();
      c && u && this.start(l);
    }), i = () => {
      const { dragConstraints: l } = this.getProps();
      dt(l) && l.current && (this.constraints = this.resolveRefConstraints());
    }, { projection: s } = this.visualElement, o = s.addEventListener("measure", i);
    s && !s.layout && (s.root && s.root.updateScroll(), s.updateLayout()), V.read(i);
    const r = Ut(window, "resize", () => this.scalePositionWithinConstraints()), a = s.addEventListener("didUpdate", ({ delta: l, hasLayoutChanged: c }) => {
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
    const e = this.visualElement.getProps(), { drag: n = !1, dragDirectionLock: i = !1, dragPropagation: s = !1, dragConstraints: o = !1, dragElastic: r = Ue, dragMomentum: a = !0 } = e;
    return {
      ...e,
      drag: n,
      dragDirectionLock: i,
      dragPropagation: s,
      dragConstraints: o,
      dragElastic: r,
      dragMomentum: a
    };
  }
}
function Xt(t, e, n) {
  return (e === !0 || e === t) && (n === null || n === t);
}
function cc(t, e = 10) {
  let n = null;
  return Math.abs(t.y) > e ? n = "y" : Math.abs(t.x) > e && (n = "x"), n;
}
class uc extends it {
  constructor(e) {
    super(e), this.removeGroupControls = O, this.removeListeners = O, this.controls = new lc(e);
  }
  mount() {
    const { dragControls: e } = this.node.getProps();
    e && (this.removeGroupControls = e.subscribe(this.controls)), this.removeListeners = this.controls.addListeners() || O;
  }
  unmount() {
    this.removeGroupControls(), this.removeListeners();
  }
}
const xi = (t) => (e, n) => {
  t && V.postRender(() => t(e, n));
};
class hc extends it {
  constructor() {
    super(...arguments), this.removePointerDownListener = O;
  }
  onPointerDown(e) {
    this.session = new rr(e, this.createPanHandlers(), {
      transformPagePoint: this.node.getTransformPagePoint(),
      contextWindow: fr(this.node)
    });
  }
  createPanHandlers() {
    const { onPanSessionStart: e, onPanStart: n, onPan: i, onPanEnd: s } = this.node.getProps();
    return {
      onSessionStart: xi(e),
      onStart: xi(n),
      onMove: i,
      onEnd: (o, r) => {
        delete this.session, s && V.postRender(() => s(o, r));
      }
    };
  }
  mount() {
    this.removePointerDownListener = Et(this.node.current, "pointerdown", (e) => this.onPointerDown(e));
  }
  update() {
    this.session && this.session.updateHandlers(this.createPanHandlers());
  }
  unmount() {
    this.removePointerDownListener(), this.session && this.session.end();
  }
}
const Zt = {
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
function Ti(t, e) {
  return e.max === e.min ? 0 : t / (e.max - e.min) * 100;
}
const At = {
  correct: (t, e) => {
    if (!e.target)
      return t;
    if (typeof t == "string")
      if (S.test(t))
        t = parseFloat(t);
      else
        return t;
    const n = Ti(t, e.target.x), i = Ti(t, e.target.y);
    return `${n}% ${i}%`;
  }
}, dc = {
  correct: (t, { treeScale: e, projectionDelta: n }) => {
    const i = t, s = nt.parse(t);
    if (s.length > 5)
      return i;
    const o = nt.createTransformer(t), r = typeof s[0] != "number" ? 1 : 0, a = n.x.scale * e.x, l = n.y.scale * e.y;
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
    const { visualElement: e, layoutGroup: n, switchLayoutGroup: i, layoutId: s } = this.props, { projection: o } = e;
    Lo(mc), o && (n.group && n.group.add(o), i && i.register && s && i.register(o), o.root.didUpdate(), o.addEventListener("animationComplete", () => {
      this.safeToRemove();
    }), o.setOptions({
      ...o.options,
      onExitComplete: () => this.safeToRemove()
    })), Zt.hasEverUpdated = !0;
  }
  getSnapshotBeforeUpdate(e) {
    const { layoutDependency: n, visualElement: i, drag: s, isPresent: o } = this.props, r = i.projection;
    return r && (r.isPresent = o, s || e.layoutDependency !== n || n === void 0 ? r.willUpdate() : this.safeToRemove(), e.isPresent !== o && (o ? r.promote() : r.relegate() || V.postRender(() => {
      const a = r.getStack();
      (!a || !a.members.length) && this.safeToRemove();
    }))), null;
  }
  componentDidUpdate() {
    const { projection: e } = this.props.visualElement;
    e && (e.root.didUpdate(), nn.postRender(() => {
      !e.currentAnimation && e.isLead() && this.safeToRemove();
    }));
  }
  componentWillUnmount() {
    const { visualElement: e, layoutGroup: n, switchLayoutGroup: i } = this.props, { projection: s } = e;
    s && (s.scheduleCheckAfterUnmount(), n && n.group && n.group.remove(s), i && i.deregister && i.deregister(s));
  }
  safeToRemove() {
    const { safeToRemove: e } = this.props;
    e && e();
  }
  render() {
    return null;
  }
}
function mr(t) {
  const [e, n] = qi(), i = I(Xe);
  return b(fc, { ...t, layoutGroup: i, switchLayoutGroup: I(ss), isPresent: e, safeToRemove: n });
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
function pc(t, e, n) {
  const i = B(t) ? t : Ot(t);
  return i.start(Dn("", i, e, n)), i.animation;
}
function gc(t) {
  return t instanceof SVGElement && t.tagName !== "svg";
}
const yc = (t, e) => t.depth - e.depth;
class vc {
  constructor() {
    this.children = [], this.isDirty = !1;
  }
  add(e) {
    yn(this.children, e), this.isDirty = !0;
  }
  remove(e) {
    vn(this.children, e), this.isDirty = !0;
  }
  forEach(e) {
    this.isDirty && this.children.sort(yc), this.isDirty = !1, this.children.forEach(e);
  }
}
function xc(t, e) {
  const n = G.now(), i = ({ timestamp: s }) => {
    const o = s - n;
    o >= e && (et(i), t(o - e));
  };
  return V.read(i, !0), () => et(i);
}
const pr = ["TopLeft", "TopRight", "BottomLeft", "BottomRight"], Tc = pr.length, bi = (t) => typeof t == "string" ? parseFloat(t) : t, Si = (t) => typeof t == "number" || S.test(t);
function bc(t, e, n, i, s, o) {
  s ? (t.opacity = C(
    0,
    // TODO Reinstate this if only child
    n.opacity !== void 0 ? n.opacity : 1,
    Sc(i)
  ), t.opacityExit = C(e.opacity !== void 0 ? e.opacity : 1, 0, Pc(i))) : o && (t.opacity = C(e.opacity !== void 0 ? e.opacity : 1, n.opacity !== void 0 ? n.opacity : 1, i));
  for (let r = 0; r < Tc; r++) {
    const a = `border${pr[r]}Radius`;
    let l = Pi(e, a), c = Pi(n, a);
    if (l === void 0 && c === void 0)
      continue;
    l || (l = 0), c || (c = 0), l === 0 || c === 0 || Si(l) === Si(c) ? (t[a] = Math.max(C(bi(l), bi(c), i), 0), (W.test(c) || W.test(l)) && (t[a] += "%")) : t[a] = c;
  }
  (e.rotate || n.rotate) && (t.rotate = C(e.rotate || 0, n.rotate || 0, i));
}
function Pi(t, e) {
  return t[e] !== void 0 ? t[e] : t.borderRadius;
}
const Sc = /* @__PURE__ */ gr(0, 0.5, Fs), Pc = /* @__PURE__ */ gr(0.5, 0.95, O);
function gr(t, e, n) {
  return (i) => i < t ? 0 : i > e ? 1 : n(/* @__PURE__ */ yt(t, e, i));
}
function wi(t, e) {
  t.min = e.min, t.max = e.max;
}
function K(t, e) {
  wi(t.x, e.x), wi(t.y, e.y);
}
function Ai(t, e) {
  t.translate = e.translate, t.scale = e.scale, t.originPoint = e.originPoint, t.origin = e.origin;
}
function Vi(t, e, n, i, s) {
  return t -= e, t = re(t, 1 / n, i), s !== void 0 && (t = re(t, 1 / s, i)), t;
}
function wc(t, e = 0, n = 1, i = 0.5, s, o = t, r = t) {
  if (W.test(e) && (e = parseFloat(e), e = C(r.min, r.max, e / 100) - r.min), typeof e != "number")
    return;
  let a = C(o.min, o.max, i);
  t === o && (a -= e), t.min = Vi(t.min, e, n, a, s), t.max = Vi(t.max, e, n, a, s);
}
function Ci(t, e, [n, i, s], o, r) {
  wc(t, e[n], e[i], e[s], e.scale, o, r);
}
const Ac = ["x", "scaleX", "originX"], Vc = ["y", "scaleY", "originY"];
function Di(t, e, n, i) {
  Ci(t.x, e, Ac, n ? n.x : void 0, i ? i.x : void 0), Ci(t.y, e, Vc, n ? n.y : void 0, i ? i.y : void 0);
}
function Mi(t) {
  return t.translate === 0 && t.scale === 1;
}
function yr(t) {
  return Mi(t.x) && Mi(t.y);
}
function Ri(t, e) {
  return t.min === e.min && t.max === e.max;
}
function Cc(t, e) {
  return Ri(t.x, e.x) && Ri(t.y, e.y);
}
function Ei(t, e) {
  return Math.round(t.min) === Math.round(e.min) && Math.round(t.max) === Math.round(e.max);
}
function vr(t, e) {
  return Ei(t.x, e.x) && Ei(t.y, e.y);
}
function ki(t) {
  return N(t.x) / N(t.y);
}
function Li(t, e) {
  return t.translate === e.translate && t.scale === e.scale && t.originPoint === e.originPoint;
}
class Dc {
  constructor() {
    this.members = [];
  }
  add(e) {
    yn(this.members, e), e.scheduleRender();
  }
  remove(e) {
    if (vn(this.members, e), e === this.prevLead && (this.prevLead = void 0), e === this.lead) {
      const n = this.members[this.members.length - 1];
      n && this.promote(n);
    }
  }
  relegate(e) {
    const n = this.members.findIndex((s) => e === s);
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
  promote(e, n) {
    const i = this.lead;
    if (e !== i && (this.prevLead = i, this.lead = e, e.show(), i)) {
      i.instance && i.scheduleRender(), e.scheduleRender(), e.resumeFrom = i, n && (e.resumeFrom.preserveOpacity = !0), i.snapshot && (e.snapshot = i.snapshot, e.snapshot.latestValues = i.animationValues || i.latestValues), e.root && e.root.isUpdating && (e.isLayoutDirty = !0);
      const { crossfade: s } = e.options;
      s === !1 && i.hide();
    }
  }
  exitAnimationComplete() {
    this.members.forEach((e) => {
      const { options: n, resumingFrom: i } = e;
      n.onExitComplete && n.onExitComplete(), i && i.options.onExitComplete && i.options.onExitComplete();
    });
  }
  scheduleRender() {
    this.members.forEach((e) => {
      e.instance && e.scheduleRender(!1);
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
function Mc(t, e, n) {
  let i = "";
  const s = t.x.translate / e.x, o = t.y.translate / e.y, r = n?.z || 0;
  if ((s || o || r) && (i = `translate3d(${s}px, ${o}px, ${r}px) `), (e.x !== 1 || e.y !== 1) && (i += `scale(${1 / e.x}, ${1 / e.y}) `), n) {
    const { transformPerspective: c, rotate: u, rotateX: h, rotateY: d, skewX: f, skewY: m } = n;
    c && (i = `perspective(${c}px) ${i}`), u && (i += `rotate(${u}deg) `), h && (i += `rotateX(${h}deg) `), d && (i += `rotateY(${d}deg) `), f && (i += `skewX(${f}deg) `), m && (i += `skewY(${m}deg) `);
  }
  const a = t.x.scale * e.x, l = t.y.scale * e.y;
  return (a !== 1 || l !== 1) && (i += `scale(${a}, ${l})`), i || "none";
}
const ot = {
  type: "projectionFrame",
  totalNodes: 0,
  resolvedTargetDeltas: 0,
  recalculatedProjection: 0
}, Mt = typeof window < "u" && window.MotionDebug !== void 0, Pe = ["", "X", "Y", "Z"], Rc = { visibility: "hidden" }, Fi = 1e3;
let Ec = 0;
function we(t, e, n, i) {
  const { latestValues: s } = e;
  s[t] && (n[t] = s[t], e.setStaticValue(t, 0), i && (i[t] = 0));
}
function xr(t) {
  if (t.hasCheckedOptimisedAppear = !0, t.root === t)
    return;
  const { visualElement: e } = t.options;
  if (!e)
    return;
  const n = Cs(e);
  if (window.MotionHasOptimisedAnimation(n, "transform")) {
    const { layout: s, layoutId: o } = t.options;
    window.MotionCancelOptimisedAnimation(n, "transform", V, !(s || o));
  }
  const { parent: i } = t;
  i && !i.hasCheckedOptimisedAppear && xr(i);
}
function Tr({ attachResizeListener: t, defaultParent: e, measureScroll: n, checkIsScrollRoot: i, resetTransform: s }) {
  return class {
    constructor(r = {}, a = e?.()) {
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
      if (u && !u.current && u.mount(r), this.root.nodes.add(this), this.parent && this.parent.children.add(this), a && (c || l) && (this.isLayoutDirty = !0), t) {
        let h;
        const d = () => this.root.updateBlockedByResize = !1;
        t(r, () => {
          this.root.updateBlockedByResize = !0, h && h(), h = xc(d, 250), Zt.hasAnimatedSinceResize && (Zt.hasAnimatedSinceResize = !1, this.nodes.forEach(Bi));
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
      k.delta = J(0, 1e3 / 60, a - k.timestamp), k.timestamp = a, k.isProcessing = !0, me.update.process(k), me.preRender.process(k), me.render.process(k), k.isProcessing = !1;
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
        Ke(c.latestValues) && c.updateSnapshot();
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
      if (!(!this.parent || Ke(this.parent.latestValues) || ur(this.parent.latestValues)))
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
        Zt.hasAnimatedSinceResize = !0, this.currentAnimation = pc(0, Fi, {
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
      l.z && we("z", r, c, this.animationValues);
      for (let u = 0; u < Pe.length; u++)
        we(`rotate${Pe[u]}`, r, c, this.animationValues), we(`skew${Pe[u]}`, r, c, this.animationValues);
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
        return this.needsReset = !1, c.opacity = "", c.pointerEvents = Yt(r?.pointerEvents) || "", c.transform = u ? u(this.latestValues, "") : "none", c;
      const h = this.getLead();
      if (!this.projectionDelta || !this.layout || !h.target) {
        const p = {};
        return this.options.layoutId && (p.opacity = this.latestValues.opacity !== void 0 ? this.latestValues.opacity : 1, p.pointerEvents = Yt(r?.pointerEvents) || ""), this.hasProjected && !rt(this.latestValues) && (p.transform = u ? u({}, "") : "none", this.hasProjected = !1), p;
      }
      const d = h.animationValues || h.latestValues;
      this.applyTransformsToTarget(), c.transform = Mc(this.projectionDeltaWithTransform, this.treeScale, d), u && (c.transform = u(d, c.transform));
      const { x: f, y: m } = this.projectionDelta;
      c.transformOrigin = `${f.origin * 100}% ${m.origin * 100}% 0`, h.animationValues ? c.opacity = h === this ? (l = (a = d.opacity) !== null && a !== void 0 ? a : this.latestValues.opacity) !== null && l !== void 0 ? l : 1 : this.preserveOpacity ? this.latestValues.opacity : d.opacityExit : c.opacity = h === this ? d.opacity !== void 0 ? d.opacity : "" : d.opacityExit !== void 0 ? d.opacityExit : 0;
      for (const p in te) {
        if (d[p] === void 0)
          continue;
        const { correct: y, applyTo: g } = te[p], x = c.transform === "none" ? d[p] : y(d[p], h);
        if (g) {
          const T = g.length;
          for (let w = 0; w < T; w++)
            c[g[w]] = x;
        } else
          c[p] = x;
      }
      return this.options.layoutId && (c.pointerEvents = h === this ? Yt(r?.pointerEvents) || "" : "none"), c;
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
function kc(t) {
  t.updateLayout();
}
function Lc(t) {
  var e;
  const n = ((e = t.resumeFrom) === null || e === void 0 ? void 0 : e.snapshot) || t.snapshot;
  if (t.isLead() && t.layout && n && t.hasListeners("didUpdate")) {
    const { layoutBox: i, measuredBox: s } = t.layout, { animationType: o } = t.options, r = n.source !== t.layout.source;
    o === "size" ? _((h) => {
      const d = r ? n.measuredBox[h] : n.layoutBox[h], f = N(d);
      d.min = i[h].min, d.max = d.min + f;
    }) : br(o, n.layoutBox, i) && _((h) => {
      const d = r ? n.measuredBox[h] : n.layoutBox[h], f = N(i[h]);
      d.max = d.min + f, t.relativeTarget && !t.currentAnimation && (t.isProjectionDirty = !0, t.relativeTarget[h].max = t.relativeTarget[h].min + f);
    });
    const a = mt();
    kt(a, i, n.layoutBox);
    const l = mt();
    r ? kt(l, t.applyTransform(s, !0), n.measuredBox) : kt(l, i, n.layoutBox);
    const c = !yr(a);
    let u = !1;
    if (!t.resumeFrom) {
      const h = t.getClosestProjectingParent();
      if (h && !h.resumeFrom) {
        const { snapshot: d, layout: f } = h;
        if (d && f) {
          const m = R();
          Lt(m, n.layoutBox, d.layoutBox);
          const p = R();
          Lt(p, i, f.layoutBox), vr(m, p) || (u = !0), h.options.layoutRoot && (t.relativeTarget = p, t.relativeTargetOrigin = m, t.relativeParent = h);
        }
      }
    }
    t.notifyListeners("didUpdate", {
      layout: i,
      snapshot: n,
      delta: l,
      layoutDelta: a,
      hasLayoutChanged: c,
      hasRelativeTargetChanged: u
    });
  } else if (t.isLead()) {
    const { onExitComplete: i } = t.options;
    i && i();
  }
  t.options.transition = void 0;
}
function Fc(t) {
  Mt && ot.totalNodes++, t.parent && (t.isProjecting() || (t.isProjectionDirty = t.parent.isProjectionDirty), t.isSharedProjectionDirty || (t.isSharedProjectionDirty = !!(t.isProjectionDirty || t.parent.isProjectionDirty || t.parent.isSharedProjectionDirty)), t.isTransformDirty || (t.isTransformDirty = t.parent.isTransformDirty));
}
function Ic(t) {
  t.isProjectionDirty = t.isSharedProjectionDirty = t.isTransformDirty = !1;
}
function Bc(t) {
  t.clearSnapshot();
}
function Ii(t) {
  t.clearMeasurements();
}
function jc(t) {
  t.isLayoutDirty = !1;
}
function Oc(t) {
  const { visualElement: e } = t.options;
  e && e.getProps().onBeforeLayoutMeasure && e.notify("BeforeLayoutMeasure"), t.resetTransform();
}
function Bi(t) {
  t.finishAnimation(), t.targetDelta = t.relativeTarget = t.target = void 0, t.isProjectionDirty = !0;
}
function Nc(t) {
  t.resolveTargetDelta();
}
function Uc(t) {
  t.calcProjection();
}
function Kc(t) {
  t.resetSkewAndRotation();
}
function _c(t) {
  t.removeLeadSnapshot();
}
function ji(t, e, n) {
  t.translate = C(e.translate, 0, n), t.scale = C(e.scale, 1, n), t.origin = e.origin, t.originPoint = e.originPoint;
}
function Oi(t, e, n, i) {
  t.min = C(e.min, n.min, i), t.max = C(e.max, n.max, i);
}
function $c(t, e, n, i) {
  Oi(t.x, e.x, n.x, i), Oi(t.y, e.y, n.y, i);
}
function zc(t) {
  return t.animationValues && t.animationValues.opacityExit !== void 0;
}
const Wc = {
  duration: 0.45,
  ease: [0.4, 0, 0.1, 1]
}, Ni = (t) => typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().includes(t), Ui = Ni("applewebkit/") && !Ni("chrome/") ? Math.round : O;
function Ki(t) {
  t.min = Ui(t.min), t.max = Ui(t.max);
}
function Gc(t) {
  Ki(t.x), Ki(t.y);
}
function br(t, e, n) {
  return t === "position" || t === "preserve-aspect" && !Yl(ki(e), ki(n), 0.2);
}
function Hc(t) {
  var e;
  return t !== t.root && ((e = t.scroll) === null || e === void 0 ? void 0 : e.wasRoot);
}
const Xc = Tr({
  attachResizeListener: (t, e) => Ut(t, "resize", e),
  measureScroll: () => ({
    x: document.documentElement.scrollLeft || document.body.scrollLeft,
    y: document.documentElement.scrollTop || document.body.scrollTop
  }),
  checkIsScrollRoot: () => !0
}), Ae = {
  current: void 0
}, Sr = Tr({
  measureScroll: (t) => ({
    x: t.scrollLeft,
    y: t.scrollTop
  }),
  defaultParent: () => {
    if (!Ae.current) {
      const t = new Xc({});
      t.mount(window), t.setOptions({ layoutScroll: !0 }), Ae.current = t;
    }
    return Ae.current;
  },
  resetTransform: (t, e) => {
    t.style.transform = e !== void 0 ? e : "none";
  },
  checkIsScrollRoot: (t) => window.getComputedStyle(t).position === "fixed"
}), Yc = {
  pan: {
    Feature: hc
  },
  drag: {
    Feature: uc,
    ProjectionNode: Sr,
    MeasureLayout: mr
  }
};
function _i(t, e, n) {
  const { props: i } = t;
  t.animationState && i.whileHover && t.animationState.setActive("whileHover", n === "Start");
  const s = "onHover" + n, o = i[s];
  o && V.postRender(() => o(e, zt(e)));
}
class qc extends it {
  mount() {
    const { current: e } = this.node;
    e && (this.unmount = Yo(e, (n) => (_i(this.node, n, "Start"), (i) => _i(this.node, i, "End"))));
  }
  unmount() {
  }
}
class Zc extends it {
  constructor() {
    super(...arguments), this.isActive = !1;
  }
  onFocus() {
    let e = !1;
    try {
      e = this.node.current.matches(":focus-visible");
    } catch {
      e = !0;
    }
    !e || !this.node.animationState || (this.node.animationState.setActive("whileFocus", !0), this.isActive = !0);
  }
  onBlur() {
    !this.isActive || !this.node.animationState || (this.node.animationState.setActive("whileFocus", !1), this.isActive = !1);
  }
  mount() {
    this.unmount = $t(Ut(this.node.current, "focus", () => this.onFocus()), Ut(this.node.current, "blur", () => this.onBlur()));
  }
  unmount() {
  }
}
function $i(t, e, n) {
  const { props: i } = t;
  t.animationState && i.whileTap && t.animationState.setActive("whileTap", n === "Start");
  const s = "onTap" + (n === "End" ? "" : n), o = i[s];
  o && V.postRender(() => o(e, zt(e)));
}
class Jc extends it {
  mount() {
    const { current: e } = this.node;
    e && (this.unmount = Qo(e, (n) => ($i(this.node, n, "Start"), (i, { success: s }) => $i(this.node, i, s ? "End" : "Cancel")), { useGlobalTarget: this.node.props.globalTapTarget }));
  }
  unmount() {
  }
}
const $e = /* @__PURE__ */ new WeakMap(), Ve = /* @__PURE__ */ new WeakMap(), Qc = (t) => {
  const e = $e.get(t.target);
  e && e(t);
}, tu = (t) => {
  t.forEach(Qc);
};
function eu({ root: t, ...e }) {
  const n = t || document;
  Ve.has(n) || Ve.set(n, {});
  const i = Ve.get(n), s = JSON.stringify(e);
  return i[s] || (i[s] = new IntersectionObserver(tu, { root: t, ...e })), i[s];
}
function nu(t, e, n) {
  const i = eu(e);
  return $e.set(t, n), i.observe(t), () => {
    $e.delete(t), i.unobserve(t);
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
    const { viewport: e = {} } = this.node.getProps(), { root: n, margin: i, amount: s = "some", once: o } = e, r = {
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
    const { props: e, prevProps: n } = this.node;
    ["amount", "margin", "root"].some(ru(e, n)) && this.startObserver();
  }
  unmount() {
  }
}
function ru({ viewport: t = {} }, { viewport: e = {} } = {}) {
  return (n) => t[n] !== e[n];
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
    ProjectionNode: Sr,
    MeasureLayout: mr
  }
}, ze = { current: null }, Pr = { current: !1 };
function lu() {
  if (Pr.current = !0, !!Ze)
    if (window.matchMedia) {
      const t = window.matchMedia("(prefers-reduced-motion)"), e = () => ze.current = t.matches;
      t.addListener(e), e();
    } else
      ze.current = !1;
}
const cu = [...Xs, F, nt], uu = (t) => cu.find(Hs(t)), zi = /* @__PURE__ */ new WeakMap();
function hu(t, e, n) {
  for (const i in e) {
    const s = e[i], o = n[i];
    if (B(s))
      t.addValue(i, s);
    else if (B(o))
      t.addValue(i, Ot(s, { owner: t }));
    else if (o !== s)
      if (t.hasValue(i)) {
        const r = t.getValue(i);
        r.liveStyle === !0 ? r.jump(s) : r.hasAnimated || r.set(s);
      } else {
        const r = t.getStaticValue(i);
        t.addValue(i, Ot(r !== void 0 ? r : s, { owner: t }));
      }
  }
  for (const i in n)
    e[i] === void 0 && t.removeValue(i);
  return e;
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
  scrapeMotionValuesFromProps(e, n, i) {
    return {};
  }
  constructor({ parent: e, props: n, presenceContext: i, reducedMotionConfig: s, blockInitialAnimation: o, visualState: r }, a = {}) {
    this.current = null, this.children = /* @__PURE__ */ new Set(), this.isVariantNode = !1, this.isControllingVariants = !1, this.shouldReduceMotion = null, this.values = /* @__PURE__ */ new Map(), this.KeyframeResolver = An, this.features = {}, this.valueSubscriptions = /* @__PURE__ */ new Map(), this.prevMotionValues = {}, this.events = {}, this.propEventSubscriptions = {}, this.notifyUpdate = () => this.notify("Update", this.latestValues), this.render = () => {
      this.current && (this.triggerBuild(), this.renderInstance(this.current, this.renderState, this.props.style, this.projection));
    }, this.renderScheduledAt = 0, this.scheduleRender = () => {
      const f = G.now();
      this.renderScheduledAt < f && (this.renderScheduledAt = f, V.render(this.render, !1, !0));
    };
    const { latestValues: l, renderState: c, onUpdate: u } = r;
    this.onUpdate = u, this.latestValues = l, this.baseTarget = { ...l }, this.initialValues = n.initial ? { ...l } : {}, this.renderState = c, this.parent = e, this.props = n, this.presenceContext = i, this.depth = e ? e.depth + 1 : 0, this.reducedMotionConfig = s, this.options = a, this.blockInitialAnimation = !!o, this.isControllingVariants = ce(n), this.isVariantNode = ns(n), this.isVariantNode && (this.variantChildren = /* @__PURE__ */ new Set()), this.manuallyAnimateOnMount = !!(e && e.current);
    const { willChange: h, ...d } = this.scrapeMotionValuesFromProps(n, {}, this);
    for (const f in d) {
      const m = d[f];
      l[f] !== void 0 && B(m) && m.set(l[f], !1);
    }
  }
  mount(e) {
    this.current = e, zi.set(e, this), this.projection && !this.projection.instance && this.projection.mount(e), this.parent && this.isVariantNode && !this.isControllingVariants && (this.removeFromVariantTree = this.parent.addVariantChild(this)), this.values.forEach((n, i) => this.bindToMotionValue(i, n)), Pr.current || lu(), this.shouldReduceMotion = this.reducedMotionConfig === "never" ? !1 : this.reducedMotionConfig === "always" ? !0 : ze.current, this.parent && this.parent.children.add(this), this.update(this.props, this.presenceContext);
  }
  unmount() {
    zi.delete(this.current), this.projection && this.projection.unmount(), et(this.notifyUpdate), et(this.render), this.valueSubscriptions.forEach((e) => e()), this.valueSubscriptions.clear(), this.removeFromVariantTree && this.removeFromVariantTree(), this.parent && this.parent.children.delete(this);
    for (const e in this.events)
      this.events[e].clear();
    for (const e in this.features) {
      const n = this.features[e];
      n && (n.unmount(), n.isMounted = !1);
    }
    this.current = null;
  }
  bindToMotionValue(e, n) {
    this.valueSubscriptions.has(e) && this.valueSubscriptions.get(e)();
    const i = ut.has(e), s = n.on("change", (a) => {
      this.latestValues[e] = a, this.props.onUpdate && V.preRender(this.notifyUpdate), i && this.projection && (this.projection.isTransformDirty = !0);
    }), o = n.on("renderRequest", this.scheduleRender);
    let r;
    window.MotionCheckAppearSync && (r = window.MotionCheckAppearSync(this, e, n)), this.valueSubscriptions.set(e, () => {
      s(), o(), r && r(), n.owner && n.stop();
    });
  }
  sortNodePosition(e) {
    return !this.current || !this.sortInstanceNodePosition || this.type !== e.type ? 0 : this.sortInstanceNodePosition(this.current, e.current);
  }
  updateFeatures() {
    let e = "animation";
    for (e in vt) {
      const n = vt[e];
      if (!n)
        continue;
      const { isEnabled: i, Feature: s } = n;
      if (!this.features[e] && s && i(this.props) && (this.features[e] = new s(this)), this.features[e]) {
        const o = this.features[e];
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
  getStaticValue(e) {
    return this.latestValues[e];
  }
  setStaticValue(e, n) {
    this.latestValues[e] = n;
  }
  /**
   * Update the provided props. Ensure any newly-added motion values are
   * added to our map, old ones removed, and listeners updated.
   */
  update(e, n) {
    (e.transformTemplate || this.props.transformTemplate) && this.scheduleRender(), this.prevProps = this.props, this.props = e, this.prevPresenceContext = this.presenceContext, this.presenceContext = n;
    for (let i = 0; i < Wi.length; i++) {
      const s = Wi[i];
      this.propEventSubscriptions[s] && (this.propEventSubscriptions[s](), delete this.propEventSubscriptions[s]);
      const o = "on" + s, r = e[o];
      r && (this.propEventSubscriptions[s] = this.on(s, r));
    }
    this.prevMotionValues = hu(this, this.scrapeMotionValuesFromProps(e, this.prevProps, this), this.prevMotionValues), this.handleChildMotionValue && this.handleChildMotionValue(), this.onUpdate && this.onUpdate(this);
  }
  getProps() {
    return this.props;
  }
  /**
   * Returns the variant definition with a given name.
   */
  getVariant(e) {
    return this.props.variants ? this.props.variants[e] : void 0;
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
  addVariantChild(e) {
    const n = this.getClosestVariantNode();
    if (n)
      return n.variantChildren && n.variantChildren.add(e), () => n.variantChildren.delete(e);
  }
  /**
   * Add a motion value and bind it to this visual element.
   */
  addValue(e, n) {
    const i = this.values.get(e);
    n !== i && (i && this.removeValue(e), this.bindToMotionValue(e, n), this.values.set(e, n), this.latestValues[e] = n.get());
  }
  /**
   * Remove a motion value and unbind any active subscriptions.
   */
  removeValue(e) {
    this.values.delete(e);
    const n = this.valueSubscriptions.get(e);
    n && (n(), this.valueSubscriptions.delete(e)), delete this.latestValues[e], this.removeValueFromRenderState(e, this.renderState);
  }
  /**
   * Check whether we have a motion value for this key
   */
  hasValue(e) {
    return this.values.has(e);
  }
  getValue(e, n) {
    if (this.props.values && this.props.values[e])
      return this.props.values[e];
    let i = this.values.get(e);
    return i === void 0 && n !== void 0 && (i = Ot(n === null ? void 0 : n, { owner: this }), this.addValue(e, i)), i;
  }
  /**
   * If we're trying to animate to a previously unencountered value,
   * we need to check for it in our state and as a last resort read it
   * directly from the instance (which might have performance implications).
   */
  readValue(e, n) {
    var i;
    let s = this.latestValues[e] !== void 0 || !this.current ? this.latestValues[e] : (i = this.getBaseTargetFromProps(this.props, e)) !== null && i !== void 0 ? i : this.readValueFromInstance(this.current, e, this.options);
    return s != null && (typeof s == "string" && (Ws(s) || Bs(s)) ? s = parseFloat(s) : !uu(s) && nt.test(n) && (s = _s(e, n)), this.setBaseTarget(e, B(s) ? s.get() : s)), B(s) ? s.get() : s;
  }
  /**
   * Set the base target to later animate back to. This is currently
   * only hydrated on creation and when we first read a value.
   */
  setBaseTarget(e, n) {
    this.baseTarget[e] = n;
  }
  /**
   * Find the base target for a value thats been removed from all animation
   * props.
   */
  getBaseTarget(e) {
    var n;
    const { initial: i } = this.props;
    let s;
    if (typeof i == "string" || typeof i == "object") {
      const r = rn(this.props, i, (n = this.presenceContext) === null || n === void 0 ? void 0 : n.custom);
      r && (s = r[e]);
    }
    if (i && s !== void 0)
      return s;
    const o = this.getBaseTargetFromProps(this.props, e);
    return o !== void 0 && !B(o) ? o : this.initialValues[e] !== void 0 && s === void 0 ? void 0 : this.baseTarget[e];
  }
  on(e, n) {
    return this.events[e] || (this.events[e] = new xn()), this.events[e].add(n);
  }
  notify(e, ...n) {
    this.events[e] && this.events[e].notify(...n);
  }
}
class wr extends du {
  constructor() {
    super(...arguments), this.KeyframeResolver = Ys;
  }
  sortInstanceNodePosition(e, n) {
    return e.compareDocumentPosition(n) & 2 ? 1 : -1;
  }
  getBaseTargetFromProps(e, n) {
    return e.style ? e.style[n] : void 0;
  }
  removeValueFromRenderState(e, { vars: n, style: i }) {
    delete n[e], delete i[e];
  }
  handleChildMotionValue() {
    this.childSubscription && (this.childSubscription(), delete this.childSubscription);
    const { children: e } = this.props;
    B(e) && (this.childSubscription = e.on("change", (n) => {
      this.current && (this.current.textContent = `${n}`);
    }));
  }
}
function fu(t) {
  return window.getComputedStyle(t);
}
class mu extends wr {
  constructor() {
    super(...arguments), this.type = "html", this.renderInstance = hs;
  }
  readValueFromInstance(e, n) {
    if (ut.has(n)) {
      const i = wn(n);
      return i && i.default || 0;
    } else {
      const i = fu(e), s = (ls(n) ? i.getPropertyValue(n) : i[n]) || 0;
      return typeof s == "string" ? s.trim() : s;
    }
  }
  measureInstanceViewportBox(e, { transformPagePoint: n }) {
    return dr(e, n);
  }
  build(e, n, i) {
    ln(e, n, i.transformTemplate);
  }
  scrapeMotionValuesFromProps(e, n, i) {
    return dn(e, n, i);
  }
}
class pu extends wr {
  constructor() {
    super(...arguments), this.type = "svg", this.isSVGTag = !1, this.measureInstanceViewportBox = R;
  }
  getBaseTargetFromProps(e, n) {
    return e[n];
  }
  readValueFromInstance(e, n) {
    if (ut.has(n)) {
      const i = wn(n);
      return i && i.default || 0;
    }
    return n = ds.has(n) ? n : en(n), e.getAttribute(n);
  }
  scrapeMotionValuesFromProps(e, n, i) {
    return ps(e, n, i);
  }
  build(e, n, i) {
    cn(e, n, this.isSVGTag, i.transformTemplate);
  }
  renderInstance(e, n, i, s) {
    fs(e, n, i, s);
  }
  mount(e) {
    this.isSVGTag = hn(e.tagName), super.mount(e);
  }
}
const gu = (t, e) => sn(t) ? new pu(e) : new mu(e, {
  allowProjection: t !== Xi
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
const vu = (t) => t.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), Ar = (...t) => t.filter((e, n, i) => !!e && e.trim() !== "" && i.indexOf(e) === n).join(" ").trim();
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
const Tu = Ge(
  ({
    color: t = "currentColor",
    size: e = 24,
    strokeWidth: n = 2,
    absoluteStrokeWidth: i,
    className: s = "",
    children: o,
    iconNode: r,
    ...a
  }, l) => Jt(
    "svg",
    {
      ref: l,
      ...xu,
      width: e,
      height: e,
      stroke: t,
      strokeWidth: i ? Number(n) * 24 / Number(e) : n,
      className: Ar("lucide", s),
      ...a
    },
    [
      ...r.map(([c, u]) => Jt(c, u)),
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
const wt = (t, e) => {
  const n = Ge(
    ({ className: i, ...s }, o) => Jt(Tu, {
      ref: o,
      iconNode: e,
      className: Ar(`lucide-${vu(t)}`, i),
      ...s
    })
  );
  return n.displayName = `${t}`, n;
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
const Su = wt("Pause", [
  ["rect", { x: "14", y: "4", width: "4", height: "16", rx: "1", key: "zuxfzm" }],
  ["rect", { x: "6", y: "4", width: "4", height: "16", rx: "1", key: "1okwgv" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Pu = wt("Play", [
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
function Mu(t, e) {
  const n = getComputedStyle(document.documentElement);
  for (const [i, s] of [...Cu, ...Du]) {
    if (!e) {
      t.style.removeProperty(i);
      continue;
    }
    const o = n.getPropertyValue(s).trim();
    o && t.style.setProperty(i, o);
  }
}
function Ru(t) {
  const e = new MutationObserver(t);
  return e.observe(document.documentElement, {
    attributes: !0,
    attributeFilter: ["data-mode", "data-contrast", "style", "class"]
  }), () => e.disconnect();
}
function Eu() {
  const [t, e] = tt(() => /* @__PURE__ */ new Date()), [n, i] = tt(!1);
  return bt(() => {
    const s = setInterval(() => e(/* @__PURE__ */ new Date()), 1e4);
    return () => clearInterval(s);
  }, []), /* @__PURE__ */ b(
    "button",
    {
      type: "button",
      className: "tm-clock",
      "data-dimmed": n,
      onClick: () => i((s) => !s),
      title: n ? "Show clock" : "Dim clock",
      children: t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
  );
}
const ku = [15, 25, 30, 45, 60, 90, 120];
function Lu(t) {
  if (t < 60) return `${t}m`;
  const e = t / 60;
  return Number.isInteger(e) ? `${e}h` : `${e}h`;
}
function Fu({
  totalSeconds: t,
  onSelect: e,
  onStart: n
}) {
  const [i, s] = tt(""), o = Math.round(t / 60);
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
              s(""), e(r);
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
              Number.isFinite(l) && l > 0 && e(l);
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
  reminder: t,
  onDismiss: e
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
              /* @__PURE__ */ b("div", { style: { fontSize: 17, fontWeight: 600, marginBottom: 3 }, children: t.label }),
              /* @__PURE__ */ b("div", { className: "tm-reminder-sub", children: "Timer paused until you dismiss this" })
            ] }),
            /* @__PURE__ */ b("button", { type: "button", className: "tm-primary", style: { width: "100%" }, onClick: e, children: "Done" })
          ]
        }
      )
    }
  );
}
function Bu({
  reminders: t,
  onAdd: e,
  onRemove: n
}) {
  const [i, s] = tt(""), [o, r] = tt("30"), [a, l] = tt(!1), c = () => {
    const h = Number.parseInt(o, 10);
    !i.trim() || !Number.isFinite(h) || h <= 0 || (e(i, h), s(""), r("30"), l(!1));
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
        /* @__PURE__ */ E(De, { mode: "popLayout", children: [
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
          t.map((h) => /* @__PURE__ */ E(
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
        t.length === 0 && !a ? /* @__PURE__ */ b("p", { className: "tm-reminder-sub", style: { textAlign: "center", padding: "8px 0" }, children: "No reminders set" }) : null
      ]
    }
  );
}
function Vt(t) {
  return t.toString().padStart(2, "0");
}
function ju({
  remainingSeconds: t,
  phase: e
}) {
  const n = Math.floor(t / 3600), i = Math.floor(t % 3600 / 60), s = t % 60, o = n > 0 ? `${Vt(n)}:${Vt(i)}:${Vt(s)}` : `${Vt(i)}:${Vt(s)}`;
  return /* @__PURE__ */ b(
    z.span,
    {
      className: "tm-digits",
      "data-state": e,
      initial: { opacity: 0, scale: 0.96 },
      animate: { opacity: 1, scale: 1 },
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
      children: o
    }
  );
}
function Ou({ engine: t }) {
  const e = It((a) => t.subscribe(a), [t]), n = It(() => t.snapshot(), [t]), i = zr(e, n), s = Y(null);
  bt(() => {
    const a = s.current;
    if (!a) return;
    const l = () => Mu(a, i.inheritTheme);
    return l(), i.inheritTheme ? Ru(l) : void 0;
  }, [i.inheritTheme]);
  const o = i.activeReminderId != null ? i.reminders.find((a) => a.id === i.activeReminderId) ?? null : null, r = i.phase === "idle";
  return /* @__PURE__ */ E("div", { className: "agent-code-timer", ref: s, children: [
    /* @__PURE__ */ b(Eu, {}),
    /* @__PURE__ */ b(ju, { remainingSeconds: i.remainingSeconds, phase: i.phase }),
    /* @__PURE__ */ b(De, { mode: "wait", children: r ? /* @__PURE__ */ E(
      z.div,
      {
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.2 },
        style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: "100%" },
        children: [
          /* @__PURE__ */ b(
            Fu,
            {
              totalSeconds: i.totalSeconds,
              onSelect: (a) => t.setDuration(a),
              onStart: () => t.start()
            }
          ),
          /* @__PURE__ */ b(
            Bu,
            {
              reminders: i.reminders,
              onAdd: (a, l) => t.addReminder(a, l),
              onRemove: (a) => t.removeReminder(a)
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
            i.phase === "running" ? /* @__PURE__ */ b(
              "button",
              {
                type: "button",
                className: "tm-circle",
                onClick: () => t.pause(),
                title: "Pause",
                children: /* @__PURE__ */ b(Su, { size: 17 })
              }
            ) : null,
            i.phase === "paused" ? /* @__PURE__ */ b(
              "button",
              {
                type: "button",
                className: "tm-circle",
                onClick: () => t.resume(),
                title: "Resume",
                children: /* @__PURE__ */ b(Pu, { size: 17, style: { marginLeft: 2 } })
              }
            ) : null,
            /* @__PURE__ */ b("button", { type: "button", className: "tm-circle", onClick: () => t.reset(), title: "Reset", children: /* @__PURE__ */ b(Au, { size: 17 }) })
          ] }),
          i.phase === "finished" ? /* @__PURE__ */ b(
            z.span,
            {
              className: "tm-reminder-sub",
              initial: { opacity: 0 },
              animate: { opacity: 1 },
              children: "Session complete"
            }
          ) : null,
          i.reminders.length > 0 && i.phase !== "finished" ? /* @__PURE__ */ b("div", { className: "tm-presets", style: { marginTop: 2 }, children: i.reminders.map((a) => /* @__PURE__ */ E("span", { className: "tm-chip", children: [
            a.label,
            " · ",
            a.intervalMinutes,
            "m"
          ] }, a.id)) }) : null
        ]
      },
      "running"
    ) }),
    /* @__PURE__ */ b("div", { className: "tm-footer", children: /* @__PURE__ */ E(
      "button",
      {
        type: "button",
        className: "tm-toggle",
        "data-on": i.inheritTheme,
        onClick: () => t.setInheritTheme(!i.inheritTheme),
        title: i.inheritTheme ? "Using Agent Code theme — click for black & white" : "Using black & white — click to inherit Agent Code theme",
        children: [
          /* @__PURE__ */ b("span", { className: "tm-toggle-dot" }),
          i.inheritTheme ? "Inheriting theme" : "Black & white"
        ]
      }
    ) }),
    /* @__PURE__ */ b(De, { children: o ? /* @__PURE__ */ b(Iu, { reminder: o, onDismiss: () => t.dismissReminder() }) : null })
  ] });
}
function Nu(t) {
  return (e) => {
    Fr();
    const n = Or(e);
    return n.render(/* @__PURE__ */ b(Ou, { engine: t })), () => {
      queueMicrotask(() => n.unmount());
    };
  };
}
const Gi = "session";
let X = null;
async function sh(t) {
  const { api: e } = t;
  X = new kr({
    notify: (n) => {
      e.ui.showToast(n).catch(() => {
      });
    },
    save: (n) => {
      e.storage.set(Gi, n).catch(() => {
      });
    }
  }), t.subscriptions.push(
    t.registerView("timer.main", Nu(X)),
    // `timer.open` has no handler here — opening a declared view is the host's
    // job, and a command whose only body is "show my own view" would just be a
    // worse version of the host's own routing. It is declared in the manifest so
    // it appears in the palette; the host resolves it to the view.
    t.registerCommand("timer.start", () => X?.start()),
    t.registerCommand("timer.pause", () => X?.pause()),
    t.registerCommand("timer.reset", () => X?.reset()),
    { dispose: () => X?.dispose() }
  );
  try {
    const n = await e.storage.get(Gi);
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
