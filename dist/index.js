const Er = [880, 1046, 1174], kr = 20, Lr = 2;
class Fr {
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
      for (let s = 0; s < kr; s += 1) {
        const o = i + s * Lr;
        Er.forEach((r, a) => n(o + a * 0.35, r));
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
const Ir = 250;
class Br {
  constructor(t) {
    this.host = t;
  }
  listeners = /* @__PURE__ */ new Set();
  interval = null;
  chime = new Fr();
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
    this.stopTicking(), this.interval = setInterval(() => this.tick(), Ir);
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
const Nr = '.agent-code-timer{--tm-bg: #000000;--tm-surface: #0d0d0d;--tm-fg: #ffffff;--tm-dim: #8a8a8a;--tm-faint: #4a4a4a;--tm-border: #262626;--tm-accent: #ffffff;--tm-accent-fg: #000000;--tm-radius: 14px;--tm-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;--tm-font-digit: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;position:relative;display:flex;flex-direction:column;align-items:center;gap:28px;padding:34px 32px 30px;background:var(--tm-bg);color:var(--tm-fg);font-family:var(--tm-font);margin:-1px;border-radius:inherit}.agent-code-timer *,.agent-code-timer *:before,.agent-code-timer *:after{box-sizing:border-box}.agent-code-timer button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;padding:0;outline:none}.agent-code-timer input{font-family:inherit;outline:none}.tm-clock{position:absolute;top:14px;left:18px;font-size:15px;font-weight:300;letter-spacing:-.01em;color:var(--tm-dim);transition:opacity .35s ease;user-select:none}.tm-clock[data-dimmed=true]{opacity:.15}.tm-digits{font-family:var(--tm-font-digit);font-size:72px;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em;user-select:none;transition:color .5s ease}.tm-digits[data-state=idle]{color:var(--tm-dim)}.tm-digits[data-state=finished]{color:var(--tm-faint)}.tm-label{font-size:11px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:var(--tm-dim)}.tm-presets{display:flex;flex-wrap:wrap;justify-content:center;gap:7px}.tm-preset{border-radius:999px;padding:7px 15px;font-size:13px;font-weight:500;background:var(--tm-surface);color:var(--tm-dim);border:1px solid var(--tm-border);transition:all .18s ease}.tm-preset:hover{color:var(--tm-fg)}.tm-preset[data-selected=true]{background:var(--tm-accent);color:var(--tm-accent-fg);border-color:var(--tm-accent)}.tm-custom{width:108px;border-radius:10px;border:1px solid var(--tm-border);background:var(--tm-surface);color:var(--tm-fg);padding:8px 12px;text-align:center;font-size:13px}.tm-custom::placeholder{color:var(--tm-faint)}.tm-row{display:flex;align-items:center;gap:10px}.tm-primary{border-radius:999px;padding:11px 34px;font-size:14px;font-weight:500;background:var(--tm-accent);color:var(--tm-accent-fg);transition:opacity .18s ease,transform .12s ease}.tm-primary:hover{opacity:.88}.tm-primary:active{transform:scale(.97)}.tm-circle{width:46px;height:46px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:var(--tm-surface);border:1px solid var(--tm-border);color:var(--tm-fg);transition:background .18s ease,transform .12s ease}.tm-circle:hover{background:var(--tm-border)}.tm-circle:active{transform:scale(.95)}.tm-ghost{font-size:12px;color:var(--tm-dim);transition:color .18s ease}.tm-ghost:hover{color:var(--tm-fg)}.tm-reminders{width:100%;max-width:330px}.tm-reminders-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.tm-reminder{display:flex;align-items:center;justify-content:space-between;padding:10px 13px;border-radius:var(--tm-radius);background:var(--tm-surface);border:1px solid var(--tm-border);margin-bottom:6px}.tm-reminder-label{font-size:13px;color:var(--tm-fg)}.tm-reminder-sub{font-size:11px;color:var(--tm-dim)}.tm-add{display:flex;flex-direction:column;gap:8px;padding:13px;border-radius:var(--tm-radius);background:var(--tm-surface);border:1px solid var(--tm-border);margin-bottom:8px}.tm-add input{border-radius:9px;border:1px solid var(--tm-border);background:var(--tm-bg);color:var(--tm-fg);padding:7px 10px;font-size:13px}.tm-chip{font-size:11px;color:var(--tm-dim);background:var(--tm-surface);border:1px solid var(--tm-border);border-radius:999px;padding:4px 11px}.tm-alert{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--tm-bg) 88%,transparent);backdrop-filter:blur(6px);border-radius:inherit}.tm-alert-card{display:flex;flex-direction:column;align-items:center;gap:18px;padding:32px 36px;border-radius:22px;background:var(--tm-surface);border:1px solid var(--tm-border);max-width:300px;text-align:center}.tm-alert-icon{width:56px;height:56px;border-radius:999px;background:var(--tm-accent);color:var(--tm-accent-fg);display:flex;align-items:center;justify-content:center;font-size:26px}.tm-footer{display:flex;align-items:center;justify-content:center;gap:8px;padding-top:2px}.tm-toggle{display:inline-flex;align-items:center;gap:7px;font-size:11px;color:var(--tm-faint);transition:color .18s ease}.tm-toggle:hover{color:var(--tm-dim)}.tm-toggle-dot{width:7px;height:7px;border-radius:999px;border:1px solid currentColor}.tm-toggle[data-on=true] .tm-toggle-dot{background:currentColor}', Me = "agent-code-timer-styles";
function Or() {
  if (document.getElementById(Me)) return;
  const e = document.createElement("style");
  e.id = Me, e.textContent = Nr, document.head.append(e);
}
function jr() {
  document.getElementById(Me)?.remove();
}
function He() {
  const e = globalThis.__agentCodeHost;
  if (!e)
    throw new Error(
      "agent-code-timer: globalThis.__agentCodeHost is missing. This bundle only runs inside Agent Code (API v1 or later)."
    );
  return e;
}
const Bt = He().jsxRuntime, T = Bt.jsx, E = Bt.jsxs;
Bt.jsxDEV ?? Bt.jsx;
const Ur = Bt.Fragment, _r = He().reactDom, { createRoot: Kr, hydrateRoot: Gu } = _r, $r = He().react, {
  Children: zr,
  Component: Ji,
  Fragment: Qi,
  Profiler: Hu,
  PureComponent: Yu,
  StrictMode: Xu,
  Suspense: qu,
  cloneElement: Wr,
  createContext: Tt,
  createElement: Qt,
  createRef: Zu,
  forwardRef: Ye,
  isValidElement: Gr,
  lazy: Ju,
  memo: Qu,
  startTransition: td,
  useCallback: Xe,
  useContext: I,
  useDebugValue: ed,
  useDeferredValue: nd,
  useEffect: St,
  useId: qe,
  useImperativeHandle: id,
  useInsertionEffect: ts,
  useLayoutEffect: Hr,
  useMemo: ut,
  useReducer: sd,
  useRef: q,
  useState: tt,
  useSyncExternalStore: Yr,
  useTransition: rd,
  version: od
} = $r, Ze = Tt({});
function Je(e) {
  const t = q(null);
  return t.current === null && (t.current = e()), t.current;
}
const ae = Tt(null), Qe = Tt({
  transformPagePoint: (e) => e,
  isStatic: !1,
  reducedMotion: "never"
});
class Xr extends Ji {
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
function qr({ children: e, isPresent: t }) {
  const n = qe(), i = q(null), s = q({
    width: 0,
    height: 0,
    top: 0,
    left: 0
  }), { nonce: o } = I(Qe);
  return ts(() => {
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
  }, [t]), T(Xr, { isPresent: t, childRef: i, sizeRef: s, children: Wr(e, { ref: i }) });
}
const Zr = ({ children: e, initial: t, isPresent: n, onExitComplete: i, custom: s, presenceAffectsLayout: o, mode: r }) => {
  const a = Je(Jr), l = qe(), c = Xe((d) => {
    a.set(d, !0);
    for (const h of a.values())
      if (!h)
        return;
    i && i();
  }, [a, i]), u = ut(
    () => ({
      id: l,
      initial: t,
      isPresent: n,
      custom: s,
      onExitComplete: c,
      register: (d) => (a.set(d, !1), () => a.delete(d))
    }),
    /**
     * If the presence of a child affects the layout of the components around it,
     * we want to make a new context value to ensure they get re-rendered
     * so they can detect that layout change.
     */
    o ? [Math.random(), c] : [n, c]
  );
  return ut(() => {
    a.forEach((d, h) => a.set(h, !1));
  }, [n]), St(() => {
    !n && !a.size && i && i();
  }, [n]), r === "popLayout" && (e = T(qr, { isPresent: n, children: e })), T(ae.Provider, { value: u, children: e });
};
function Jr() {
  return /* @__PURE__ */ new Map();
}
function es(e = !0) {
  const t = I(ae);
  if (t === null)
    return [!0, null];
  const { isPresent: n, onExitComplete: i, register: s } = t, o = qe();
  St(() => {
    e && s(o);
  }, [e]);
  const r = Xe(() => e && i && i(o), [o, i, e]);
  return !n && i ? [!1, r] : [!0];
}
const Gt = (e) => e.key || "";
function Fn(e) {
  const t = [];
  return zr.forEach(e, (n) => {
    Gr(n) && t.push(n);
  }), t;
}
const tn = typeof window < "u", ns = tn ? Hr : St, Re = ({ children: e, custom: t, initial: n = !0, onExitComplete: i, presenceAffectsLayout: s = !0, mode: o = "sync", propagate: r = !1 }) => {
  const [a, l] = es(r), c = ut(() => Fn(e), [e]), u = r && !a ? [] : c.map(Gt), d = q(!0), h = q(c), f = Je(() => /* @__PURE__ */ new Map()), [m, p] = tt(c), [y, g] = tt(c);
  ns(() => {
    d.current = !1, h.current = c;
    for (let P = 0; P < y.length; P++) {
      const v = Gt(y[P]);
      u.includes(v) ? f.delete(v) : f.get(v) !== !0 && f.set(v, !1);
    }
  }, [y, u.length, u.join("-")]);
  const x = [];
  if (c !== m) {
    let P = [...c];
    for (let v = 0; v < y.length; v++) {
      const A = y[v], M = Gt(A);
      u.includes(M) || (P.splice(v, 0, A), x.push(A));
    }
    o === "wait" && x.length && (P = x), g(Fn(P)), p(c);
    return;
  }
  process.env.NODE_ENV !== "production" && o === "wait" && y.length > 1 && console.warn(`You're attempting to animate multiple children within AnimatePresence, but its mode is set to "wait". This will lead to odd visual behaviour.`);
  const { forceRender: b } = I(Ze);
  return T(Ur, { children: y.map((P) => {
    const v = Gt(P), A = r && !a ? !1 : c === y || u.includes(v), M = () => {
      if (f.has(v))
        f.set(v, !0);
      else
        return;
      let w = !0;
      f.forEach((L) => {
        L || (w = !1);
      }), w && (b?.(), g(h.current), r && l?.(), i && i());
    };
    return T(Zr, { isPresent: A, initial: !d.current || n ? void 0 : !1, custom: A ? void 0 : t, presenceAffectsLayout: s, mode: o, onExitComplete: A ? void 0 : M, children: P }, v);
  }) });
}, O = /* @__NO_SIDE_EFFECTS__ */ (e) => e;
let wt = O, et = O;
process.env.NODE_ENV !== "production" && (wt = (e, t) => {
  !e && typeof console < "u" && console.warn(t);
}, et = (e, t) => {
  if (!e)
    throw new Error(t);
});
// @__NO_SIDE_EFFECTS__
function en(e) {
  let t;
  return () => (t === void 0 && (t = e()), t);
}
const vt = /* @__NO_SIDE_EFFECTS__ */ (e, t, n) => {
  const i = t - e;
  return i === 0 ? 1 : (n - e) / i;
}, W = /* @__NO_SIDE_EFFECTS__ */ (e) => e * 1e3, Z = /* @__NO_SIDE_EFFECTS__ */ (e) => e / 1e3, Qr = {
  useManualTiming: !1
};
function to(e) {
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
    schedule: (c, u = !1, d = !1) => {
      const f = d && i ? t : n;
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
const Ht = [
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
], eo = 40;
function is(e, t) {
  let n = !1, i = !0;
  const s = {
    delta: 0,
    timestamp: 0,
    isProcessing: !1
  }, o = () => n = !0, r = Ht.reduce((g, x) => (g[x] = to(o), g), {}), { read: a, resolveKeyframes: l, update: c, preRender: u, render: d, postRender: h } = r, f = () => {
    const g = performance.now();
    n = !1, s.delta = i ? 1e3 / 60 : Math.max(Math.min(g - s.timestamp, eo), 1), s.timestamp = g, s.isProcessing = !0, a.process(s), l.process(s), c.process(s), u.process(s), d.process(s), h.process(s), s.isProcessing = !1, n && t && (i = !1, e(f));
  }, m = () => {
    n = !0, i = !0, s.isProcessing || e(f);
  };
  return { schedule: Ht.reduce((g, x) => {
    const b = r[x];
    return g[x] = (P, v = !1, A = !1) => (n || m(), b.schedule(P, v, A)), g;
  }, {}), cancel: (g) => {
    for (let x = 0; x < Ht.length; x++)
      r[Ht[x]].cancel(g);
  }, state: s, steps: r };
}
const { schedule: V, cancel: nt, state: k, steps: ge } = is(typeof requestAnimationFrame < "u" ? requestAnimationFrame : O, !0), ss = Tt({ strict: !1 }), In = {
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
}, xt = {};
for (const e in In)
  xt[e] = {
    isEnabled: (t) => In[e].some((n) => !!t[n])
  };
function no(e) {
  for (const t in e)
    xt[t] = {
      ...xt[t],
      ...e[t]
    };
}
const io = /* @__PURE__ */ new Set([
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
function te(e) {
  return e.startsWith("while") || e.startsWith("drag") && e !== "draggable" || e.startsWith("layout") || e.startsWith("onTap") || e.startsWith("onPan") || e.startsWith("onLayout") || io.has(e);
}
let rs = (e) => !te(e);
function so(e) {
  e && (rs = (t) => t.startsWith("on") ? !te(t) : e(t));
}
try {
  so(require("@emotion/is-prop-valid").default);
} catch {
}
function ro(e, t, n) {
  const i = {};
  for (const s in e)
    s === "values" && typeof e.values == "object" || (rs(s) || n === !0 && te(s) || !t && !te(s) || // If trying to use native HTML drag events, forward drag listeners
    e.draggable && s.startsWith("onDrag")) && (i[s] = e[s]);
  return i;
}
const Bn = /* @__PURE__ */ new Set();
function le(e, t, n) {
  e || Bn.has(t) || (console.warn(t), Bn.add(t));
}
function oo(e) {
  if (typeof Proxy > "u")
    return e;
  const t = /* @__PURE__ */ new Map(), n = (...i) => (process.env.NODE_ENV !== "production" && le(!1, "motion() is deprecated. Use motion.create() instead."), e(...i));
  return new Proxy(n, {
    /**
     * Called when `motion` is referenced with a prop: `motion.div`, `motion.input` etc.
     * The prop name is passed through as `key` and we can use that to generate a `motion`
     * DOM component with that name.
     */
    get: (i, s) => s === "create" ? e : (t.has(s) || t.set(s, e(s)), t.get(s))
  });
}
const ce = Tt({});
function Nt(e) {
  return typeof e == "string" || Array.isArray(e);
}
function ue(e) {
  return e !== null && typeof e == "object" && typeof e.start == "function";
}
const nn = [
  "animate",
  "whileInView",
  "whileFocus",
  "whileHover",
  "whileTap",
  "whileDrag",
  "exit"
], sn = ["initial", ...nn];
function de(e) {
  return ue(e.animate) || sn.some((t) => Nt(e[t]));
}
function os(e) {
  return !!(de(e) || e.variants);
}
function ao(e, t) {
  if (de(e)) {
    const { initial: n, animate: i } = e;
    return {
      initial: n === !1 || Nt(n) ? n : void 0,
      animate: Nt(i) ? i : void 0
    };
  }
  return e.inherit !== !1 ? t : {};
}
function lo(e) {
  const { initial: t, animate: n } = ao(e, I(ce));
  return ut(() => ({ initial: t, animate: n }), [Nn(t), Nn(n)]);
}
function Nn(e) {
  return Array.isArray(e) ? e.join(" ") : e;
}
const co = Symbol.for("motionComponentSymbol");
function ft(e) {
  return e && typeof e == "object" && Object.prototype.hasOwnProperty.call(e, "current");
}
function uo(e, t, n) {
  return Xe(
    (i) => {
      i && e.onMount && e.onMount(i), t && (i ? t.mount(i) : t.unmount()), n && (typeof n == "function" ? n(i) : ft(n) && (n.current = i));
    },
    /**
     * Only pass a new ref callback to React if we've received a visual element
     * factory. Otherwise we'll be mounting/remounting every time externalRef
     * or other dependencies change.
     */
    [t]
  );
}
const rn = (e) => e.replace(/([a-z])([A-Z])/gu, "$1-$2").toLowerCase(), ho = "framerAppearId", as = "data-" + rn(ho), { schedule: on } = is(queueMicrotask, !1), ls = Tt({});
function fo(e, t, n, i, s) {
  var o, r;
  const { visualElement: a } = I(ce), l = I(ss), c = I(ae), u = I(Qe).reducedMotion, d = q(null);
  i = i || l.renderer, !d.current && i && (d.current = i(e, {
    visualState: t,
    parent: a,
    props: n,
    presenceContext: c,
    blockInitialAnimation: c ? c.initial === !1 : !1,
    reducedMotionConfig: u
  }));
  const h = d.current, f = I(ls);
  h && !h.projection && s && (h.type === "html" || h.type === "svg") && mo(d.current, n, s, f);
  const m = q(!1);
  ts(() => {
    h && m.current && h.update(n, c);
  });
  const p = n[as], y = q(!!p && !(!((o = window.MotionHandoffIsComplete) === null || o === void 0) && o.call(window, p)) && ((r = window.MotionHasOptimisedAnimation) === null || r === void 0 ? void 0 : r.call(window, p)));
  return ns(() => {
    h && (m.current = !0, window.MotionIsMounted = !0, h.updateFeatures(), on.render(h.render), y.current && h.animationState && h.animationState.animateChanges());
  }), St(() => {
    h && (!y.current && h.animationState && h.animationState.animateChanges(), y.current && (queueMicrotask(() => {
      var g;
      (g = window.MotionHandoffMarkAsComplete) === null || g === void 0 || g.call(window, p);
    }), y.current = !1));
  }), h;
}
function mo(e, t, n, i) {
  const { layoutId: s, layout: o, drag: r, dragConstraints: a, layoutScroll: l, layoutRoot: c } = t;
  e.projection = new n(e.latestValues, t["data-framer-portal-id"] ? void 0 : cs(e.parent)), e.projection.setOptions({
    layoutId: s,
    layout: o,
    alwaysMeasureLayout: !!r || a && ft(a),
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
function cs(e) {
  if (e)
    return e.options.allowProjection !== !1 ? e.projection : cs(e.parent);
}
function po({ preloadedFeatures: e, createVisualElement: t, useRender: n, useVisualState: i, Component: s }) {
  var o, r;
  e && no(e);
  function a(c, u) {
    let d;
    const h = {
      ...I(Qe),
      ...c,
      layoutId: go(c)
    }, { isStatic: f } = h, m = lo(c), p = i(c, f);
    if (!f && tn) {
      yo(h, e);
      const y = vo(h);
      d = y.MeasureLayout, m.visualElement = fo(s, p, h, t, y.ProjectionNode);
    }
    return E(ce.Provider, { value: m, children: [d && m.visualElement ? T(d, { visualElement: m.visualElement, ...h }) : null, n(s, c, uo(p, m.visualElement, u), p, f, m.visualElement)] });
  }
  a.displayName = `motion.${typeof s == "string" ? s : `create(${(r = (o = s.displayName) !== null && o !== void 0 ? o : s.name) !== null && r !== void 0 ? r : ""})`}`;
  const l = Ye(a);
  return l[co] = s, l;
}
function go({ layoutId: e }) {
  const t = I(Ze).id;
  return t && e !== void 0 ? t + "-" + e : e;
}
function yo(e, t) {
  const n = I(ss).strict;
  if (process.env.NODE_ENV !== "production" && t && n) {
    const i = "You have rendered a `motion` component within a `LazyMotion` component. This will break tree shaking. Import and render a `m` component instead.";
    e.ignoreStrict ? wt(!1, i) : et(!1, i);
  }
}
function vo(e) {
  const { drag: t, layout: n } = xt;
  if (!t && !n)
    return {};
  const i = { ...t, ...n };
  return {
    MeasureLayout: t?.isEnabled(e) || n?.isEnabled(e) ? i.MeasureLayout : void 0,
    ProjectionNode: i.ProjectionNode
  };
}
const xo = [
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
function an(e) {
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
      !!(xo.indexOf(e) > -1 || /**
       * If it contains a capital letter, it's an SVG component
       */
      /[A-Z]/u.test(e))
    )
  );
}
function On(e) {
  const t = [{}, {}];
  return e?.values.forEach((n, i) => {
    t[0][i] = n.get(), t[1][i] = n.getVelocity();
  }), t;
}
function ln(e, t, n, i) {
  if (typeof t == "function") {
    const [s, o] = On(i);
    t = t(n !== void 0 ? n : e.custom, s, o);
  }
  if (typeof t == "string" && (t = e.variants && e.variants[t]), typeof t == "function") {
    const [s, o] = On(i);
    t = t(n !== void 0 ? n : e.custom, s, o);
  }
  return t;
}
const Ee = (e) => Array.isArray(e), bo = (e) => !!(e && typeof e == "object" && e.mix && e.toValue), To = (e) => Ee(e) ? e[e.length - 1] || 0 : e, B = (e) => !!(e && e.getVelocity);
function qt(e) {
  const t = B(e) ? e.get() : e;
  return bo(t) ? t.toValue() : t;
}
function So({ scrapeMotionValuesFromProps: e, createRenderState: t, onUpdate: n }, i, s, o) {
  const r = {
    latestValues: wo(i, s, o, e),
    renderState: t()
  };
  return n && (r.onMount = (a) => n({ props: i, current: a, ...r }), r.onUpdate = (a) => n(a)), r;
}
const us = (e) => (t, n) => {
  const i = I(ce), s = I(ae), o = () => So(e, t, i, s);
  return n ? o() : Je(o);
};
function wo(e, t, n, i) {
  const s = {}, o = i(e, {});
  for (const h in o)
    s[h] = qt(o[h]);
  let { initial: r, animate: a } = e;
  const l = de(e), c = os(e);
  t && c && !l && e.inherit !== !1 && (r === void 0 && (r = t.initial), a === void 0 && (a = t.animate));
  let u = n ? n.initial === !1 : !1;
  u = u || r === !1;
  const d = u ? a : r;
  if (d && typeof d != "boolean" && !ue(d)) {
    const h = Array.isArray(d) ? d : [d];
    for (let f = 0; f < h.length; f++) {
      const m = ln(e, h[f]);
      if (m) {
        const { transitionEnd: p, transition: y, ...g } = m;
        for (const x in g) {
          let b = g[x];
          if (Array.isArray(b)) {
            const P = u ? b.length - 1 : 0;
            b = b[P];
          }
          b !== null && (s[x] = b);
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
], dt = new Set(Pt), ds = (e) => (t) => typeof t == "string" && t.startsWith(e), hs = /* @__PURE__ */ ds("--"), Po = /* @__PURE__ */ ds("var(--"), cn = (e) => Po(e) ? Ao.test(e.split("/*")[0].trim()) : !1, Ao = /var\(--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)$/iu, fs = (e, t) => t && typeof e == "number" ? t.transform(e) : e, J = (e, t, n) => n > t ? t : n < e ? e : n, At = {
  test: (e) => typeof e == "number",
  parse: parseFloat,
  transform: (e) => e
}, Ot = {
  ...At,
  transform: (e) => J(0, 1, e)
}, Yt = {
  ...At,
  default: 1
}, Kt = (e) => ({
  test: (t) => typeof t == "string" && t.endsWith(e) && t.split(" ").length === 1,
  parse: parseFloat,
  transform: (t) => `${t}${e}`
}), Q = /* @__PURE__ */ Kt("deg"), G = /* @__PURE__ */ Kt("%"), S = /* @__PURE__ */ Kt("px"), Vo = /* @__PURE__ */ Kt("vh"), Co = /* @__PURE__ */ Kt("vw"), jn = {
  ...G,
  parse: (e) => G.parse(e) / 100,
  transform: (e) => G.transform(e * 100)
}, Do = {
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
}, Mo = {
  rotate: Q,
  rotateX: Q,
  rotateY: Q,
  rotateZ: Q,
  scale: Yt,
  scaleX: Yt,
  scaleY: Yt,
  scaleZ: Yt,
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
  opacity: Ot,
  originX: jn,
  originY: jn,
  originZ: S
}, Un = {
  ...At,
  transform: Math.round
}, un = {
  ...Do,
  ...Mo,
  zIndex: Un,
  size: S,
  // SVG
  fillOpacity: Ot,
  strokeOpacity: Ot,
  numOctaves: Un
}, Ro = {
  x: "translateX",
  y: "translateY",
  z: "translateZ",
  transformPerspective: "perspective"
}, Eo = Pt.length;
function ko(e, t, n) {
  let i = "", s = !0;
  for (let o = 0; o < Eo; o++) {
    const r = Pt[o], a = e[r];
    if (a === void 0)
      continue;
    let l = !0;
    if (typeof a == "number" ? l = a === (r.startsWith("scale") ? 1 : 0) : l = parseFloat(a) === 0, !l || n) {
      const c = fs(a, un[r]);
      if (!l) {
        s = !1;
        const u = Ro[r] || r;
        i += `${u}(${c}) `;
      }
      n && (t[r] = c);
    }
  }
  return i = i.trim(), n ? i = n(t, s ? "" : i) : s && (i = "none"), i;
}
function dn(e, t, n) {
  const { style: i, vars: s, transformOrigin: o } = e;
  let r = !1, a = !1;
  for (const l in t) {
    const c = t[l];
    if (dt.has(l)) {
      r = !0;
      continue;
    } else if (hs(l)) {
      s[l] = c;
      continue;
    } else {
      const u = fs(c, un[l]);
      l.startsWith("origin") ? (a = !0, o[l] = u) : i[l] = u;
    }
  }
  if (t.transform || (r || n ? i.transform = ko(t, e.transform, n) : i.transform && (i.transform = "none")), a) {
    const { originX: l = "50%", originY: c = "50%", originZ: u = 0 } = o;
    i.transformOrigin = `${l} ${c} ${u}`;
  }
}
const Lo = {
  offset: "stroke-dashoffset",
  array: "stroke-dasharray"
}, Fo = {
  offset: "strokeDashoffset",
  array: "strokeDasharray"
};
function Io(e, t, n = 1, i = 0, s = !0) {
  e.pathLength = 1;
  const o = s ? Lo : Fo;
  e[o.offset] = S.transform(-i);
  const r = S.transform(t), a = S.transform(n);
  e[o.array] = `${r} ${a}`;
}
function _n(e, t, n) {
  return typeof e == "string" ? e : S.transform(t + n * e);
}
function Bo(e, t, n) {
  const i = _n(t, e.x, e.width), s = _n(n, e.y, e.height);
  return `${i} ${s}`;
}
function hn(e, {
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
}, u, d) {
  if (dn(e, c, d), u) {
    e.style.viewBox && (e.attrs.viewBox = e.style.viewBox);
    return;
  }
  e.attrs = e.style, e.style = {};
  const { attrs: h, style: f, dimensions: m } = e;
  h.transform && (m && (f.transform = h.transform), delete h.transform), m && (s !== void 0 || o !== void 0 || f.transform) && (f.transformOrigin = Bo(m, s !== void 0 ? s : 0.5, o !== void 0 ? o : 0.5)), t !== void 0 && (h.x = t), n !== void 0 && (h.y = n), i !== void 0 && (h.scale = i), r !== void 0 && Io(h, r, a, l, !1);
}
const fn = () => ({
  style: {},
  transform: {},
  transformOrigin: {},
  vars: {}
}), ms = () => ({
  ...fn(),
  attrs: {}
}), mn = (e) => typeof e == "string" && e.toLowerCase() === "svg";
function ps(e, { style: t, vars: n }, i, s) {
  Object.assign(e.style, t, s && s.getProjectionStyles(i));
  for (const o in n)
    e.style.setProperty(o, n[o]);
}
const gs = /* @__PURE__ */ new Set([
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
function ys(e, t, n, i) {
  ps(e, t, void 0, i);
  for (const s in t.attrs)
    e.setAttribute(gs.has(s) ? s : rn(s), t.attrs[s]);
}
const ee = {};
function No(e) {
  Object.assign(ee, e);
}
function vs(e, { layout: t, layoutId: n }) {
  return dt.has(e) || e.startsWith("origin") || (t || n !== void 0) && (!!ee[e] || e === "opacity");
}
function pn(e, t, n) {
  var i;
  const { style: s } = e, o = {};
  for (const r in s)
    (B(s[r]) || t.style && B(t.style[r]) || vs(r, e) || ((i = n?.getValue(r)) === null || i === void 0 ? void 0 : i.liveStyle) !== void 0) && (o[r] = s[r]);
  return o;
}
function xs(e, t, n) {
  const i = pn(e, t, n);
  for (const s in e)
    if (B(e[s]) || B(t[s])) {
      const o = Pt.indexOf(s) !== -1 ? "attr" + s.charAt(0).toUpperCase() + s.substring(1) : s;
      i[o] = e[s];
    }
  return i;
}
function Oo(e, t) {
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
const Kn = ["x", "y", "width", "height", "cx", "cy", "r"], jo = {
  useVisualState: us({
    scrapeMotionValuesFromProps: xs,
    createRenderState: ms,
    onUpdate: ({ props: e, prevProps: t, current: n, renderState: i, latestValues: s }) => {
      if (!n)
        return;
      let o = !!e.drag;
      if (!o) {
        for (const a in s)
          if (dt.has(a)) {
            o = !0;
            break;
          }
      }
      if (!o)
        return;
      let r = !t;
      if (t)
        for (let a = 0; a < Kn.length; a++) {
          const l = Kn[a];
          e[l] !== t[l] && (r = !0);
        }
      r && V.read(() => {
        Oo(n, i), V.render(() => {
          hn(i, s, mn(n.tagName), e.transformTemplate), ys(n, i);
        });
      });
    }
  })
}, Uo = {
  useVisualState: us({
    scrapeMotionValuesFromProps: pn,
    createRenderState: fn
  })
};
function bs(e, t, n) {
  for (const i in t)
    !B(t[i]) && !vs(i, n) && (e[i] = t[i]);
}
function _o({ transformTemplate: e }, t) {
  return ut(() => {
    const n = fn();
    return dn(n, t, e), Object.assign({}, n.vars, n.style);
  }, [t]);
}
function Ko(e, t) {
  const n = e.style || {}, i = {};
  return bs(i, n, e), Object.assign(i, _o(e, t)), i;
}
function $o(e, t) {
  const n = {}, i = Ko(e, t);
  return e.drag && e.dragListener !== !1 && (n.draggable = !1, i.userSelect = i.WebkitUserSelect = i.WebkitTouchCallout = "none", i.touchAction = e.drag === !0 ? "none" : `pan-${e.drag === "x" ? "y" : "x"}`), e.tabIndex === void 0 && (e.onTap || e.onTapStart || e.whileTap) && (n.tabIndex = 0), n.style = i, n;
}
function zo(e, t, n, i) {
  const s = ut(() => {
    const o = ms();
    return hn(o, t, mn(i), e.transformTemplate), {
      ...o.attrs,
      style: { ...o.style }
    };
  }, [t]);
  if (e.style) {
    const o = {};
    bs(o, e.style, e), s.style = { ...o, ...s.style };
  }
  return s;
}
function Wo(e = !1) {
  return (n, i, s, { latestValues: o }, r) => {
    const l = (an(n) ? zo : $o)(i, o, r, n), c = ro(i, typeof n == "string", e), u = n !== Qi ? { ...c, ...l, ref: s } : {}, { children: d } = i, h = ut(() => B(d) ? d.get() : d, [d]);
    return Qt(n, {
      ...u,
      children: h
    });
  };
}
function Go(e, t) {
  return function(i, { forwardMotionProps: s } = { forwardMotionProps: !1 }) {
    const r = {
      ...an(i) ? jo : Uo,
      preloadedFeatures: e,
      useRender: Wo(s),
      createVisualElement: t,
      Component: i
    };
    return po(r);
  };
}
function Ts(e, t) {
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
function he(e, t, n) {
  const i = e.getProps();
  return ln(i, t, n !== void 0 ? n : i.custom, e);
}
const Ho = /* @__PURE__ */ en(() => window.ScrollTimeline !== void 0);
class Yo {
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
      if (Ho() && s.attachTimeline)
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
class Xo extends Yo {
  then(t, n) {
    return Promise.all(this.animations).then(t).catch(n);
  }
}
function gn(e, t) {
  return e ? e[t] || e.default || e : void 0;
}
const ke = 2e4;
function Ss(e) {
  let t = 0;
  const n = 50;
  let i = e.next(t);
  for (; !i.done && t < ke; )
    t += n, i = e.next(t);
  return t >= ke ? 1 / 0 : t;
}
function yn(e) {
  return typeof e == "function";
}
function $n(e, t) {
  e.timeline = t, e.onfinish = null;
}
const vn = (e) => Array.isArray(e) && typeof e[0] == "number", qo = {
  linearEasing: void 0
};
function Zo(e, t) {
  const n = /* @__PURE__ */ en(e);
  return () => {
    var i;
    return (i = qo[t]) !== null && i !== void 0 ? i : n();
  };
}
const ne = /* @__PURE__ */ Zo(() => {
  try {
    document.createElement("div").animate({ opacity: 0 }, { easing: "linear(0, 1)" });
  } catch {
    return !1;
  }
  return !0;
}, "linearEasing"), ws = (e, t, n = 10) => {
  let i = "";
  const s = Math.max(Math.round(t / n), 2);
  for (let o = 0; o < s; o++)
    i += e(/* @__PURE__ */ vt(0, s - 1, o)) + ", ";
  return `linear(${i.substring(0, i.length - 2)})`;
};
function Ps(e) {
  return !!(typeof e == "function" && ne() || !e || typeof e == "string" && (e in Le || ne()) || vn(e) || Array.isArray(e) && e.every(Ps));
}
const Mt = ([e, t, n, i]) => `cubic-bezier(${e}, ${t}, ${n}, ${i})`, Le = {
  linear: "linear",
  ease: "ease",
  easeIn: "ease-in",
  easeOut: "ease-out",
  easeInOut: "ease-in-out",
  circIn: /* @__PURE__ */ Mt([0, 0.65, 0.55, 1]),
  circOut: /* @__PURE__ */ Mt([0.55, 0, 1, 0.45]),
  backIn: /* @__PURE__ */ Mt([0.31, 0.01, 0.66, -0.59]),
  backOut: /* @__PURE__ */ Mt([0.33, 1.53, 0.69, 0.99])
};
function As(e, t) {
  if (e)
    return typeof e == "function" && ne() ? ws(e, t) : vn(e) ? Mt(e) : Array.isArray(e) ? e.map((n) => As(n, t) || Le.easeOut) : Le[e];
}
const $ = {
  x: !1,
  y: !1
};
function Vs() {
  return $.x || $.y;
}
function Jo(e, t, n) {
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
function Cs(e, t) {
  const n = Jo(e), i = new AbortController(), s = {
    passive: !0,
    ...t,
    signal: i.signal
  };
  return [n, s, () => i.abort()];
}
function zn(e) {
  return (t) => {
    t.pointerType === "touch" || Vs() || e(t);
  };
}
function Qo(e, t, n = {}) {
  const [i, s, o] = Cs(e, n), r = zn((a) => {
    const { target: l } = a, c = t(a);
    if (typeof c != "function" || !l)
      return;
    const u = zn((d) => {
      c(d), l.removeEventListener("pointerleave", u);
    });
    l.addEventListener("pointerleave", u, s);
  });
  return i.forEach((a) => {
    a.addEventListener("pointerenter", r, s);
  }), o;
}
const Ds = (e, t) => t ? e === t ? !0 : Ds(e, t.parentElement) : !1, xn = (e) => e.pointerType === "mouse" ? typeof e.button != "number" || e.button <= 0 : e.isPrimary !== !1, ta = /* @__PURE__ */ new Set([
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "A"
]);
function ea(e) {
  return ta.has(e.tagName) || e.tabIndex !== -1;
}
const Rt = /* @__PURE__ */ new WeakSet();
function Wn(e) {
  return (t) => {
    t.key === "Enter" && e(t);
  };
}
function ye(e, t) {
  e.dispatchEvent(new PointerEvent("pointer" + t, { isPrimary: !0, bubbles: !0 }));
}
const na = (e, t) => {
  const n = e.currentTarget;
  if (!n)
    return;
  const i = Wn(() => {
    if (Rt.has(n))
      return;
    ye(n, "down");
    const s = Wn(() => {
      ye(n, "up");
    }), o = () => ye(n, "cancel");
    n.addEventListener("keyup", s, t), n.addEventListener("blur", o, t);
  });
  n.addEventListener("keydown", i, t), n.addEventListener("blur", () => n.removeEventListener("keydown", i), t);
};
function Gn(e) {
  return xn(e) && !Vs();
}
function ia(e, t, n = {}) {
  const [i, s, o] = Cs(e, n), r = (a) => {
    const l = a.currentTarget;
    if (!Gn(a) || Rt.has(l))
      return;
    Rt.add(l);
    const c = t(a), u = (f, m) => {
      window.removeEventListener("pointerup", d), window.removeEventListener("pointercancel", h), !(!Gn(f) || !Rt.has(l)) && (Rt.delete(l), typeof c == "function" && c(f, { success: m }));
    }, d = (f) => {
      u(f, n.useGlobalTarget || Ds(l, f.target));
    }, h = (f) => {
      u(f, !1);
    };
    window.addEventListener("pointerup", d, s), window.addEventListener("pointercancel", h, s);
  };
  return i.forEach((a) => {
    !ea(a) && a.getAttribute("tabindex") === null && (a.tabIndex = 0), (n.useGlobalTarget ? window : a).addEventListener("pointerdown", r, s), a.addEventListener("focus", (c) => na(c, s), s);
  }), o;
}
function sa(e) {
  return e === "x" || e === "y" ? $[e] ? null : ($[e] = !0, () => {
    $[e] = !1;
  }) : $.x || $.y ? null : ($.x = $.y = !0, () => {
    $.x = $.y = !1;
  });
}
const Ms = /* @__PURE__ */ new Set([
  "width",
  "height",
  "top",
  "left",
  "right",
  "bottom",
  ...Pt
]);
let Zt;
function ra() {
  Zt = void 0;
}
const H = {
  now: () => (Zt === void 0 && H.set(k.isProcessing || Qr.useManualTiming ? k.timestamp : performance.now()), Zt),
  set: (e) => {
    Zt = e, queueMicrotask(ra);
  }
};
function bn(e, t) {
  e.indexOf(t) === -1 && e.push(t);
}
function Tn(e, t) {
  const n = e.indexOf(t);
  n > -1 && e.splice(n, 1);
}
class Sn {
  constructor() {
    this.subscriptions = [];
  }
  add(t) {
    return bn(this.subscriptions, t), () => Tn(this.subscriptions, t);
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
function Rs(e, t) {
  return t ? e * (1e3 / t) : 0;
}
const Hn = 30, oa = (e) => !isNaN(parseFloat(e));
class aa {
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
      const o = H.now();
      this.updatedAt !== o && this.setPrevFrameValue(), this.prev = this.current, this.setCurrent(i), this.current !== this.prev && this.events.change && this.events.change.notify(this.current), s && this.events.renderRequest && this.events.renderRequest.notify(this.current);
    }, this.hasAnimated = !1, this.setCurrent(t), this.owner = n.owner;
  }
  setCurrent(t) {
    this.current = t, this.updatedAt = H.now(), this.canTrackVelocity === null && t !== void 0 && (this.canTrackVelocity = oa(this.current));
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
    return process.env.NODE_ENV !== "production" && le(!1, 'value.onChange(callback) is deprecated. Switch to value.on("change", callback).'), this.on("change", t);
  }
  on(t, n) {
    this.events[t] || (this.events[t] = new Sn());
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
    const t = H.now();
    if (!this.canTrackVelocity || this.prevFrameValue === void 0 || t - this.updatedAt > Hn)
      return 0;
    const n = Math.min(this.updatedAt - this.prevUpdatedAt, Hn);
    return Rs(parseFloat(this.current) - parseFloat(this.prevFrameValue), n);
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
  return new aa(e, t);
}
function la(e, t, n) {
  e.hasValue(t) ? e.getValue(t).set(n) : e.addValue(t, jt(n));
}
function ca(e, t) {
  const n = he(e, t);
  let { transitionEnd: i = {}, transition: s = {}, ...o } = n || {};
  o = { ...o, ...i };
  for (const r in o) {
    const a = To(o[r]);
    la(e, r, a);
  }
}
function ua(e) {
  return !!(B(e) && e.add);
}
function Fe(e, t) {
  const n = e.getValue("willChange");
  if (ua(n))
    return n.add(t);
}
function Es(e) {
  return e.props[as];
}
const ks = (e, t, n) => (((1 - 3 * n + 3 * t) * e + (3 * n - 6 * t)) * e + 3 * t) * e, da = 1e-7, ha = 12;
function fa(e, t, n, i, s) {
  let o, r, a = 0;
  do
    r = t + (n - t) / 2, o = ks(r, i, s) - e, o > 0 ? n = r : t = r;
  while (Math.abs(o) > da && ++a < ha);
  return r;
}
function $t(e, t, n, i) {
  if (e === t && n === i)
    return O;
  const s = (o) => fa(o, 0, 1, e, n);
  return (o) => o === 0 || o === 1 ? o : ks(s(o), t, i);
}
const Ls = (e) => (t) => t <= 0.5 ? e(2 * t) / 2 : (2 - e(2 * (1 - t))) / 2, Fs = (e) => (t) => 1 - e(1 - t), Is = /* @__PURE__ */ $t(0.33, 1.53, 0.69, 0.99), wn = /* @__PURE__ */ Fs(Is), Bs = /* @__PURE__ */ Ls(wn), Ns = (e) => (e *= 2) < 1 ? 0.5 * wn(e) : 0.5 * (2 - Math.pow(2, -10 * (e - 1))), Pn = (e) => 1 - Math.sin(Math.acos(e)), Os = Fs(Pn), js = Ls(Pn), Us = (e) => /^0[^.\s]+$/u.test(e);
function ma(e) {
  return typeof e == "number" ? e === 0 : e !== null ? e === "none" || e === "0" || Us(e) : !0;
}
const kt = (e) => Math.round(e * 1e5) / 1e5, An = /-?(?:\d+(?:\.\d+)?|\.\d+)/gu;
function pa(e) {
  return e == null;
}
const ga = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))$/iu, Vn = (e, t) => (n) => !!(typeof n == "string" && ga.test(n) && n.startsWith(e) || t && !pa(n) && Object.prototype.hasOwnProperty.call(n, t)), _s = (e, t, n) => (i) => {
  if (typeof i != "string")
    return i;
  const [s, o, r, a] = i.match(An);
  return {
    [e]: parseFloat(s),
    [t]: parseFloat(o),
    [n]: parseFloat(r),
    alpha: a !== void 0 ? parseFloat(a) : 1
  };
}, ya = (e) => J(0, 255, e), ve = {
  ...At,
  transform: (e) => Math.round(ya(e))
}, lt = {
  test: /* @__PURE__ */ Vn("rgb", "red"),
  parse: /* @__PURE__ */ _s("red", "green", "blue"),
  transform: ({ red: e, green: t, blue: n, alpha: i = 1 }) => "rgba(" + ve.transform(e) + ", " + ve.transform(t) + ", " + ve.transform(n) + ", " + kt(Ot.transform(i)) + ")"
};
function va(e) {
  let t = "", n = "", i = "", s = "";
  return e.length > 5 ? (t = e.substring(1, 3), n = e.substring(3, 5), i = e.substring(5, 7), s = e.substring(7, 9)) : (t = e.substring(1, 2), n = e.substring(2, 3), i = e.substring(3, 4), s = e.substring(4, 5), t += t, n += n, i += i, s += s), {
    red: parseInt(t, 16),
    green: parseInt(n, 16),
    blue: parseInt(i, 16),
    alpha: s ? parseInt(s, 16) / 255 : 1
  };
}
const Ie = {
  test: /* @__PURE__ */ Vn("#"),
  parse: va,
  transform: lt.transform
}, mt = {
  test: /* @__PURE__ */ Vn("hsl", "hue"),
  parse: /* @__PURE__ */ _s("hue", "saturation", "lightness"),
  transform: ({ hue: e, saturation: t, lightness: n, alpha: i = 1 }) => "hsla(" + Math.round(e) + ", " + G.transform(kt(t)) + ", " + G.transform(kt(n)) + ", " + kt(Ot.transform(i)) + ")"
}, F = {
  test: (e) => lt.test(e) || Ie.test(e) || mt.test(e),
  parse: (e) => lt.test(e) ? lt.parse(e) : mt.test(e) ? mt.parse(e) : Ie.parse(e),
  transform: (e) => typeof e == "string" ? e : e.hasOwnProperty("red") ? lt.transform(e) : mt.transform(e)
}, xa = /(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))/giu;
function ba(e) {
  var t, n;
  return isNaN(e) && typeof e == "string" && (((t = e.match(An)) === null || t === void 0 ? void 0 : t.length) || 0) + (((n = e.match(xa)) === null || n === void 0 ? void 0 : n.length) || 0) > 0;
}
const Ks = "number", $s = "color", Ta = "var", Sa = "var(", Yn = "${}", wa = /var\s*\(\s*--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)|#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\)|-?(?:\d+(?:\.\d+)?|\.\d+)/giu;
function Ut(e) {
  const t = e.toString(), n = [], i = {
    color: [],
    number: [],
    var: []
  }, s = [];
  let o = 0;
  const a = t.replace(wa, (l) => (F.test(l) ? (i.color.push(o), s.push($s), n.push(F.parse(l))) : l.startsWith(Sa) ? (i.var.push(o), s.push(Ta), n.push(l)) : (i.number.push(o), s.push(Ks), n.push(parseFloat(l))), ++o, Yn)).split(Yn);
  return { values: n, split: a, indexes: i, types: s };
}
function zs(e) {
  return Ut(e).values;
}
function Ws(e) {
  const { split: t, types: n } = Ut(e), i = t.length;
  return (s) => {
    let o = "";
    for (let r = 0; r < i; r++)
      if (o += t[r], s[r] !== void 0) {
        const a = n[r];
        a === Ks ? o += kt(s[r]) : a === $s ? o += F.transform(s[r]) : o += s[r];
      }
    return o;
  };
}
const Pa = (e) => typeof e == "number" ? 0 : e;
function Aa(e) {
  const t = zs(e);
  return Ws(e)(t.map(Pa));
}
const it = {
  test: ba,
  parse: zs,
  createTransformer: Ws,
  getAnimatableNone: Aa
}, Va = /* @__PURE__ */ new Set(["brightness", "contrast", "saturate", "opacity"]);
function Ca(e) {
  const [t, n] = e.slice(0, -1).split("(");
  if (t === "drop-shadow")
    return e;
  const [i] = n.match(An) || [];
  if (!i)
    return e;
  const s = n.replace(i, "");
  let o = Va.has(t) ? 1 : 0;
  return i !== n && (o *= 100), t + "(" + o + s + ")";
}
const Da = /\b([a-z-]*)\(.*?\)/gu, Be = {
  ...it,
  getAnimatableNone: (e) => {
    const t = e.match(Da);
    return t ? t.map(Ca).join(" ") : e;
  }
}, Ma = {
  ...un,
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
  filter: Be,
  WebkitFilter: Be
}, Cn = (e) => Ma[e];
function Gs(e, t) {
  let n = Cn(e);
  return n !== Be && (n = it), n.getAnimatableNone ? n.getAnimatableNone(t) : void 0;
}
const Ra = /* @__PURE__ */ new Set(["auto", "none", "0"]);
function Ea(e, t, n) {
  let i = 0, s;
  for (; i < e.length && !s; ) {
    const o = e[i];
    typeof o == "string" && !Ra.has(o) && Ut(o).values.length && (s = e[i]), i++;
  }
  if (s && n)
    for (const o of t)
      e[o] = Gs(n, s);
}
const Xn = (e) => e === At || e === S, qn = (e, t) => parseFloat(e.split(", ")[t]), Zn = (e, t) => (n, { transform: i }) => {
  if (i === "none" || !i)
    return 0;
  const s = i.match(/^matrix3d\((.+)\)$/u);
  if (s)
    return qn(s[1], t);
  {
    const o = i.match(/^matrix\((.+)\)$/u);
    return o ? qn(o[1], e) : 0;
  }
}, ka = /* @__PURE__ */ new Set(["x", "y", "z"]), La = Pt.filter((e) => !ka.has(e));
function Fa(e) {
  const t = [];
  return La.forEach((n) => {
    const i = e.getValue(n);
    i !== void 0 && (t.push([n, i.get()]), i.set(n.startsWith("scale") ? 1 : 0));
  }), t;
}
const bt = {
  // Dimensions
  width: ({ x: e }, { paddingLeft: t = "0", paddingRight: n = "0" }) => e.max - e.min - parseFloat(t) - parseFloat(n),
  height: ({ y: e }, { paddingTop: t = "0", paddingBottom: n = "0" }) => e.max - e.min - parseFloat(t) - parseFloat(n),
  top: (e, { top: t }) => parseFloat(t),
  left: (e, { left: t }) => parseFloat(t),
  bottom: ({ y: e }, { top: t }) => parseFloat(t) + (e.max - e.min),
  right: ({ x: e }, { left: t }) => parseFloat(t) + (e.max - e.min),
  // Transform
  x: Zn(4, 13),
  y: Zn(5, 14)
};
bt.translateX = bt.x;
bt.translateY = bt.y;
const ct = /* @__PURE__ */ new Set();
let Ne = !1, Oe = !1;
function Hs() {
  if (Oe) {
    const e = Array.from(ct).filter((i) => i.needsMeasurement), t = new Set(e.map((i) => i.element)), n = /* @__PURE__ */ new Map();
    t.forEach((i) => {
      const s = Fa(i);
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
  Oe = !1, Ne = !1, ct.forEach((e) => e.complete()), ct.clear();
}
function Ys() {
  ct.forEach((e) => {
    e.readKeyframes(), e.needsMeasurement && (Oe = !0);
  });
}
function Ia() {
  Ys(), Hs();
}
class Dn {
  constructor(t, n, i, s, o, r = !1) {
    this.isComplete = !1, this.isAsync = !1, this.needsMeasurement = !1, this.isScheduled = !1, this.unresolvedKeyframes = [...t], this.onComplete = n, this.name = i, this.motionValue = s, this.element = o, this.isAsync = r;
  }
  scheduleResolve() {
    this.isScheduled = !0, this.isAsync ? (ct.add(this), Ne || (Ne = !0, V.read(Ys), V.resolveKeyframes(Hs))) : (this.readKeyframes(), this.complete());
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
    this.isComplete = !0, this.onComplete(this.unresolvedKeyframes, this.finalKeyframe), ct.delete(this);
  }
  cancel() {
    this.isComplete || (this.isScheduled = !1, ct.delete(this));
  }
  resume() {
    this.isComplete || this.scheduleResolve();
  }
}
const Xs = (e) => /^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(e), Ba = (
  // eslint-disable-next-line redos-detector/no-unsafe-regex -- false positive, as it can match a lot of words
  /^var\(--(?:([\w-]+)|([\w-]+), ?([a-zA-Z\d ()%#.,-]+))\)/u
);
function Na(e) {
  const t = Ba.exec(e);
  if (!t)
    return [,];
  const [, n, i, s] = t;
  return [`--${n ?? i}`, s];
}
const Oa = 4;
function qs(e, t, n = 1) {
  et(n <= Oa, `Max CSS variable fallback depth detected in property "${e}". This may indicate a circular fallback dependency.`);
  const [i, s] = Na(e);
  if (!i)
    return;
  const o = window.getComputedStyle(t).getPropertyValue(i);
  if (o) {
    const r = o.trim();
    return Xs(r) ? parseFloat(r) : r;
  }
  return cn(s) ? qs(s, t, n + 1) : s;
}
const Zs = (e) => (t) => t.test(e), ja = {
  test: (e) => e === "auto",
  parse: (e) => e
}, Js = [At, S, G, Q, Co, Vo, ja], Jn = (e) => Js.find(Zs(e));
class Qs extends Dn {
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
      if (typeof c == "string" && (c = c.trim(), cn(c))) {
        const u = qs(c, n.current);
        u !== void 0 && (t[l] = u), l === t.length - 1 && (this.finalKeyframe = c);
      }
    }
    if (this.resolveNoneKeyframes(), !Ms.has(i) || t.length !== 2)
      return;
    const [s, o] = t, r = Jn(s), a = Jn(o);
    if (r !== a)
      if (Xn(r) && Xn(a))
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
      ma(t[s]) && i.push(s);
    i.length && Ea(t, i, n);
  }
  measureInitialState() {
    const { element: t, unresolvedKeyframes: n, name: i } = this;
    if (!t || !t.current)
      return;
    i === "height" && (this.suspendedScrollY = window.pageYOffset), this.measuredOrigin = bt[i](t.measureViewportBox(), window.getComputedStyle(t.current)), n[0] = this.measuredOrigin;
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
    s[r] = bt[i](n.measureViewportBox(), window.getComputedStyle(n.current)), a !== null && this.finalKeyframe === void 0 && (this.finalKeyframe = a), !((t = this.removedTransforms) === null || t === void 0) && t.length && this.removedTransforms.forEach(([l, c]) => {
      n.getValue(l).set(c);
    }), this.resolveNoneKeyframes();
  }
}
const Qn = (e, t) => t === "zIndex" ? !1 : !!(typeof e == "number" || Array.isArray(e) || typeof e == "string" && // It's animatable if we have a string
(it.test(e) || e === "0") && // And it contains numbers and/or colors
!e.startsWith("url("));
function Ua(e) {
  const t = e[0];
  if (e.length === 1)
    return !0;
  for (let n = 0; n < e.length; n++)
    if (e[n] !== t)
      return !0;
}
function _a(e, t, n, i) {
  const s = e[0];
  if (s === null)
    return !1;
  if (t === "display" || t === "visibility")
    return !0;
  const o = e[e.length - 1], r = Qn(s, t), a = Qn(o, t);
  return wt(r === a, `You are trying to animate ${t} from "${s}" to "${o}". ${s} is not an animatable value - to enable this animation set ${s} to a value animatable to ${o} via the \`style\` property.`), !r || !a ? !1 : Ua(e) || (n === "spring" || yn(n)) && i;
}
const Ka = (e) => e !== null;
function fe(e, { repeat: t, repeatType: n = "loop" }, i) {
  const s = e.filter(Ka), o = t && n !== "loop" && t % 2 === 1 ? 0 : s.length - 1;
  return !o || i === void 0 ? s[o] : i;
}
const $a = 40;
class tr {
  constructor({ autoplay: t = !0, delay: n = 0, type: i = "keyframes", repeat: s = 0, repeatDelay: o = 0, repeatType: r = "loop", ...a }) {
    this.isStopped = !1, this.hasAttemptedResolve = !1, this.createdAt = H.now(), this.options = {
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
    return this.resolvedAt ? this.resolvedAt - this.createdAt > $a ? this.resolvedAt : this.createdAt : this.createdAt;
  }
  /**
   * A getter for resolved data. If keyframes are not yet resolved, accessing
   * this.resolved will synchronously flush all pending keyframe resolvers.
   * This is a deoptimisation, but at its worst still batches read/writes.
   */
  get resolved() {
    return !this._resolved && !this.hasAttemptedResolve && Ia(), this._resolved;
  }
  /**
   * A method to be called when the keyframes resolver completes. This method
   * will check if its possible to run the animation and, if not, skip it.
   * Otherwise, it will call initPlayback on the implementing class.
   */
  onKeyframesResolved(t, n) {
    this.resolvedAt = H.now(), this.hasAttemptedResolve = !0;
    const { name: i, type: s, velocity: o, delay: r, onComplete: a, onUpdate: l, isGenerator: c } = this.options;
    if (!c && !_a(t, i, s, o))
      if (r)
        this.options.duration = 0;
      else {
        l && l(fe(t, this.options, n)), a && a(), this.resolveFinishedPromise();
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
const D = (e, t, n) => e + (t - e) * n;
function xe(e, t, n) {
  return n < 0 && (n += 1), n > 1 && (n -= 1), n < 1 / 6 ? e + (t - e) * 6 * n : n < 1 / 2 ? t : n < 2 / 3 ? e + (t - e) * (2 / 3 - n) * 6 : e;
}
function za({ hue: e, saturation: t, lightness: n, alpha: i }) {
  e /= 360, t /= 100, n /= 100;
  let s = 0, o = 0, r = 0;
  if (!t)
    s = o = r = n;
  else {
    const a = n < 0.5 ? n * (1 + t) : n + t - n * t, l = 2 * n - a;
    s = xe(l, a, e + 1 / 3), o = xe(l, a, e), r = xe(l, a, e - 1 / 3);
  }
  return {
    red: Math.round(s * 255),
    green: Math.round(o * 255),
    blue: Math.round(r * 255),
    alpha: i
  };
}
function ie(e, t) {
  return (n) => n > 0 ? t : e;
}
const be = (e, t, n) => {
  const i = e * e, s = n * (t * t - i) + i;
  return s < 0 ? 0 : Math.sqrt(s);
}, Wa = [Ie, lt, mt], Ga = (e) => Wa.find((t) => t.test(e));
function ti(e) {
  const t = Ga(e);
  if (wt(!!t, `'${e}' is not an animatable color. Use the equivalent color code instead.`), !t)
    return !1;
  let n = t.parse(e);
  return t === mt && (n = za(n)), n;
}
const ei = (e, t) => {
  const n = ti(e), i = ti(t);
  if (!n || !i)
    return ie(e, t);
  const s = { ...n };
  return (o) => (s.red = be(n.red, i.red, o), s.green = be(n.green, i.green, o), s.blue = be(n.blue, i.blue, o), s.alpha = D(n.alpha, i.alpha, o), lt.transform(s));
}, Ha = (e, t) => (n) => t(e(n)), zt = (...e) => e.reduce(Ha), je = /* @__PURE__ */ new Set(["none", "hidden"]);
function Ya(e, t) {
  return je.has(e) ? (n) => n <= 0 ? e : t : (n) => n >= 1 ? t : e;
}
function Xa(e, t) {
  return (n) => D(e, t, n);
}
function Mn(e) {
  return typeof e == "number" ? Xa : typeof e == "string" ? cn(e) ? ie : F.test(e) ? ei : Ja : Array.isArray(e) ? er : typeof e == "object" ? F.test(e) ? ei : qa : ie;
}
function er(e, t) {
  const n = [...e], i = n.length, s = e.map((o, r) => Mn(o)(o, t[r]));
  return (o) => {
    for (let r = 0; r < i; r++)
      n[r] = s[r](o);
    return n;
  };
}
function qa(e, t) {
  const n = { ...e, ...t }, i = {};
  for (const s in n)
    e[s] !== void 0 && t[s] !== void 0 && (i[s] = Mn(e[s])(e[s], t[s]));
  return (s) => {
    for (const o in i)
      n[o] = i[o](s);
    return n;
  };
}
function Za(e, t) {
  var n;
  const i = [], s = { color: 0, var: 0, number: 0 };
  for (let o = 0; o < t.values.length; o++) {
    const r = t.types[o], a = e.indexes[r][s[r]], l = (n = e.values[a]) !== null && n !== void 0 ? n : 0;
    i[o] = l, s[r]++;
  }
  return i;
}
const Ja = (e, t) => {
  const n = it.createTransformer(t), i = Ut(e), s = Ut(t);
  return i.indexes.var.length === s.indexes.var.length && i.indexes.color.length === s.indexes.color.length && i.indexes.number.length >= s.indexes.number.length ? je.has(e) && !s.values.length || je.has(t) && !i.values.length ? Ya(e, t) : zt(er(Za(i, s), s.values), n) : (wt(!0, `Complex values '${e}' and '${t}' too different to mix. Ensure all colors are of the same type, and that each contains the same quantity of number and color values. Falling back to instant transition.`), ie(e, t));
};
function nr(e, t, n) {
  return typeof e == "number" && typeof t == "number" && typeof n == "number" ? D(e, t, n) : Mn(e)(e, t);
}
const Qa = 5;
function ir(e, t, n) {
  const i = Math.max(t - Qa, 0);
  return Rs(n - e(i), t - i);
}
const C = {
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
}, Te = 1e-3;
function tl({ duration: e = C.duration, bounce: t = C.bounce, velocity: n = C.velocity, mass: i = C.mass }) {
  let s, o;
  wt(e <= /* @__PURE__ */ W(C.maxDuration), "Spring duration must be 10 seconds or less");
  let r = 1 - t;
  r = J(C.minDamping, C.maxDamping, r), e = J(C.minDuration, C.maxDuration, /* @__PURE__ */ Z(e)), r < 1 ? (s = (c) => {
    const u = c * r, d = u * e, h = u - n, f = Ue(c, r), m = Math.exp(-d);
    return Te - h / f * m;
  }, o = (c) => {
    const d = c * r * e, h = d * n + n, f = Math.pow(r, 2) * Math.pow(c, 2) * e, m = Math.exp(-d), p = Ue(Math.pow(c, 2), r);
    return (-s(c) + Te > 0 ? -1 : 1) * ((h - f) * m) / p;
  }) : (s = (c) => {
    const u = Math.exp(-c * e), d = (c - n) * e + 1;
    return -Te + u * d;
  }, o = (c) => {
    const u = Math.exp(-c * e), d = (n - c) * (e * e);
    return u * d;
  });
  const a = 5 / e, l = nl(s, o, a);
  if (e = /* @__PURE__ */ W(e), isNaN(l))
    return {
      stiffness: C.stiffness,
      damping: C.damping,
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
const el = 12;
function nl(e, t, n) {
  let i = n;
  for (let s = 1; s < el; s++)
    i = i - e(i) / t(i);
  return i;
}
function Ue(e, t) {
  return e * Math.sqrt(1 - t * t);
}
const il = ["duration", "bounce"], sl = ["stiffness", "damping", "mass"];
function ni(e, t) {
  return t.some((n) => e[n] !== void 0);
}
function rl(e) {
  let t = {
    velocity: C.velocity,
    stiffness: C.stiffness,
    damping: C.damping,
    mass: C.mass,
    isResolvedFromDuration: !1,
    ...e
  };
  if (!ni(e, sl) && ni(e, il))
    if (e.visualDuration) {
      const n = e.visualDuration, i = 2 * Math.PI / (n * 1.2), s = i * i, o = 2 * J(0.05, 1, 1 - (e.bounce || 0)) * Math.sqrt(s);
      t = {
        ...t,
        mass: C.mass,
        stiffness: s,
        damping: o
      };
    } else {
      const n = tl(e);
      t = {
        ...t,
        ...n,
        mass: C.mass
      }, t.isResolvedFromDuration = !0;
    }
  return t;
}
function sr(e = C.visualDuration, t = C.bounce) {
  const n = typeof e != "object" ? {
    visualDuration: e,
    keyframes: [0, 1],
    bounce: t
  } : e;
  let { restSpeed: i, restDelta: s } = n;
  const o = n.keyframes[0], r = n.keyframes[n.keyframes.length - 1], a = { done: !1, value: o }, { stiffness: l, damping: c, mass: u, duration: d, velocity: h, isResolvedFromDuration: f } = rl({
    ...n,
    velocity: -/* @__PURE__ */ Z(n.velocity || 0)
  }), m = h || 0, p = c / (2 * Math.sqrt(l * u)), y = r - o, g = /* @__PURE__ */ Z(Math.sqrt(l / u)), x = Math.abs(y) < 5;
  i || (i = x ? C.restSpeed.granular : C.restSpeed.default), s || (s = x ? C.restDelta.granular : C.restDelta.default);
  let b;
  if (p < 1) {
    const v = Ue(g, p);
    b = (A) => {
      const M = Math.exp(-p * g * A);
      return r - M * ((m + p * g * y) / v * Math.sin(v * A) + y * Math.cos(v * A));
    };
  } else if (p === 1)
    b = (v) => r - Math.exp(-g * v) * (y + (m + g * y) * v);
  else {
    const v = g * Math.sqrt(p * p - 1);
    b = (A) => {
      const M = Math.exp(-p * g * A), w = Math.min(v * A, 300);
      return r - M * ((m + p * g * y) * Math.sinh(w) + v * y * Math.cosh(w)) / v;
    };
  }
  const P = {
    calculatedDuration: f && d || null,
    next: (v) => {
      const A = b(v);
      if (f)
        a.done = v >= d;
      else {
        let M = 0;
        p < 1 && (M = v === 0 ? /* @__PURE__ */ W(m) : ir(b, v, A));
        const w = Math.abs(M) <= i, L = Math.abs(r - A) <= s;
        a.done = w && L;
      }
      return a.value = a.done ? r : A, a;
    },
    toString: () => {
      const v = Math.min(Ss(P), ke), A = ws((M) => P.next(v * M).value, v, 30);
      return v + "ms " + A;
    }
  };
  return P;
}
function ii({ keyframes: e, velocity: t = 0, power: n = 0.8, timeConstant: i = 325, bounceDamping: s = 10, bounceStiffness: o = 500, modifyTarget: r, min: a, max: l, restDelta: c = 0.5, restSpeed: u }) {
  const d = e[0], h = {
    done: !1,
    value: d
  }, f = (w) => a !== void 0 && w < a || l !== void 0 && w > l, m = (w) => a === void 0 ? l : l === void 0 || Math.abs(a - w) < Math.abs(l - w) ? a : l;
  let p = n * t;
  const y = d + p, g = r === void 0 ? y : r(y);
  g !== y && (p = g - d);
  const x = (w) => -p * Math.exp(-w / i), b = (w) => g + x(w), P = (w) => {
    const L = x(w), U = b(w);
    h.done = Math.abs(L) <= c, h.value = h.done ? g : U;
  };
  let v, A;
  const M = (w) => {
    f(h.value) && (v = w, A = sr({
      keyframes: [h.value, m(h.value)],
      velocity: ir(b, w, h.value),
      // TODO: This should be passing * 1000
      damping: s,
      stiffness: o,
      restDelta: c,
      restSpeed: u
    }));
  };
  return M(0), {
    calculatedDuration: null,
    next: (w) => {
      let L = !1;
      return !A && v === void 0 && (L = !0, P(w), M(w)), v !== void 0 && w >= v ? A.next(w - v) : (!L && P(w), h);
    }
  };
}
const ol = /* @__PURE__ */ $t(0.42, 0, 1, 1), al = /* @__PURE__ */ $t(0, 0, 0.58, 1), rr = /* @__PURE__ */ $t(0.42, 0, 0.58, 1), ll = (e) => Array.isArray(e) && typeof e[0] != "number", si = {
  linear: O,
  easeIn: ol,
  easeInOut: rr,
  easeOut: al,
  circIn: Pn,
  circInOut: js,
  circOut: Os,
  backIn: wn,
  backInOut: Bs,
  backOut: Is,
  anticipate: Ns
}, ri = (e) => {
  if (vn(e)) {
    et(e.length === 4, "Cubic bezier arrays must contain four numerical values.");
    const [t, n, i, s] = e;
    return $t(t, n, i, s);
  } else if (typeof e == "string")
    return et(si[e] !== void 0, `Invalid easing type '${e}'`), si[e];
  return e;
};
function cl(e, t, n) {
  const i = [], s = n || nr, o = e.length - 1;
  for (let r = 0; r < o; r++) {
    let a = s(e[r], e[r + 1]);
    if (t) {
      const l = Array.isArray(t) ? t[r] || O : t;
      a = zt(l, a);
    }
    i.push(a);
  }
  return i;
}
function ul(e, t, { clamp: n = !0, ease: i, mixer: s } = {}) {
  const o = e.length;
  if (et(o === t.length, "Both input and output ranges must be the same length"), o === 1)
    return () => t[0];
  if (o === 2 && t[0] === t[1])
    return () => t[1];
  const r = e[0] === e[1];
  e[0] > e[o - 1] && (e = [...e].reverse(), t = [...t].reverse());
  const a = cl(t, i, s), l = a.length, c = (u) => {
    if (r && u < e[0])
      return t[0];
    let d = 0;
    if (l > 1)
      for (; d < e.length - 2 && !(u < e[d + 1]); d++)
        ;
    const h = /* @__PURE__ */ vt(e[d], e[d + 1], u);
    return a[d](h);
  };
  return n ? (u) => c(J(e[0], e[o - 1], u)) : c;
}
function dl(e, t) {
  const n = e[e.length - 1];
  for (let i = 1; i <= t; i++) {
    const s = /* @__PURE__ */ vt(0, t, i);
    e.push(D(n, 1, s));
  }
}
function hl(e) {
  const t = [0];
  return dl(t, e.length - 1), t;
}
function fl(e, t) {
  return e.map((n) => n * t);
}
function ml(e, t) {
  return e.map(() => t || rr).splice(0, e.length - 1);
}
function se({ duration: e = 300, keyframes: t, times: n, ease: i = "easeInOut" }) {
  const s = ll(i) ? i.map(ri) : ri(i), o = {
    done: !1,
    value: t[0]
  }, r = fl(
    // Only use the provided offsets if they're the correct length
    // TODO Maybe we should warn here if there's a length mismatch
    n && n.length === t.length ? n : hl(t),
    e
  ), a = ul(r, t, {
    ease: Array.isArray(s) ? s : ml(t, s)
  });
  return {
    calculatedDuration: e,
    next: (l) => (o.value = a(l), o.done = l >= e, o)
  };
}
const pl = (e) => {
  const t = ({ timestamp: n }) => e(n);
  return {
    start: () => V.update(t, !0),
    stop: () => nt(t),
    /**
     * If we're processing this frame we can use the
     * framelocked timestamp to keep things in sync.
     */
    now: () => k.isProcessing ? k.timestamp : H.now()
  };
}, gl = {
  decay: ii,
  inertia: ii,
  tween: se,
  keyframes: se,
  spring: sr
}, yl = (e) => e / 100;
class Rn extends tr {
  constructor(t) {
    super(t), this.holdTime = null, this.cancelTime = null, this.currentTime = 0, this.playbackSpeed = 1, this.pendingPlayState = "running", this.startTime = null, this.state = "idle", this.stop = () => {
      if (this.resolver.cancel(), this.isStopped = !0, this.state === "idle")
        return;
      this.teardown();
      const { onStop: l } = this.options;
      l && l();
    };
    const { name: n, motionValue: i, element: s, keyframes: o } = this.options, r = s?.KeyframeResolver || Dn, a = (l, c) => this.onKeyframesResolved(l, c);
    this.resolver = new r(o, a, n, i, s), this.resolver.scheduleResolve();
  }
  flatten() {
    super.flatten(), this._resolved && Object.assign(this._resolved, this.initPlayback(this._resolved.keyframes));
  }
  initPlayback(t) {
    const { type: n = "keyframes", repeat: i = 0, repeatDelay: s = 0, repeatType: o, velocity: r = 0 } = this.options, a = yn(n) ? n : gl[n] || se;
    let l, c;
    a !== se && typeof t[0] != "number" && (process.env.NODE_ENV !== "production" && et(t.length === 2, `Only two keyframes currently supported with spring and inertia animations. Trying to animate ${t}`), l = zt(yl, nr(t[0], t[1])), t = [0, 100]);
    const u = a({ ...this.options, keyframes: t });
    o === "mirror" && (c = a({
      ...this.options,
      keyframes: [...t].reverse(),
      velocity: -r
    })), u.calculatedDuration === null && (u.calculatedDuration = Ss(u));
    const { calculatedDuration: d } = u, h = d + s, f = h * (i + 1) - s;
    return {
      generator: u,
      mirroredGenerator: c,
      mapPercentToKeyframes: l,
      calculatedDuration: d,
      resolvedDuration: h,
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
      const { keyframes: w } = this.options;
      return { done: !0, value: w[w.length - 1] };
    }
    const { finalKeyframe: s, generator: o, mirroredGenerator: r, mapPercentToKeyframes: a, keyframes: l, calculatedDuration: c, totalDuration: u, resolvedDuration: d } = i;
    if (this.startTime === null)
      return o.next(0);
    const { delay: h, repeat: f, repeatType: m, repeatDelay: p, onUpdate: y } = this.options;
    this.speed > 0 ? this.startTime = Math.min(this.startTime, t) : this.speed < 0 && (this.startTime = Math.min(t - u / this.speed, this.startTime)), n ? this.currentTime = t : this.holdTime !== null ? this.currentTime = this.holdTime : this.currentTime = Math.round(t - this.startTime) * this.speed;
    const g = this.currentTime - h * (this.speed >= 0 ? 1 : -1), x = this.speed >= 0 ? g < 0 : g > u;
    this.currentTime = Math.max(g, 0), this.state === "finished" && this.holdTime === null && (this.currentTime = u);
    let b = this.currentTime, P = o;
    if (f) {
      const w = Math.min(this.currentTime, u) / d;
      let L = Math.floor(w), U = w % 1;
      !U && w >= 1 && (U = 1), U === 1 && L--, L = Math.min(L, f + 1), !!(L % 2) && (m === "reverse" ? (U = 1 - U, p && (U -= p / d)) : m === "mirror" && (P = r)), b = J(0, 1, U) * d;
    }
    const v = x ? { done: !1, value: l[0] } : P.next(b);
    a && (v.value = a(v.value));
    let { done: A } = v;
    !x && c !== null && (A = this.speed >= 0 ? this.currentTime >= u : this.currentTime <= 0);
    const M = this.holdTime === null && (this.state === "finished" || this.state === "running" && A);
    return M && s !== void 0 && (v.value = fe(l, this.options, s)), y && y(v.value), M && this.finish(), v;
  }
  get duration() {
    const { resolved: t } = this;
    return t ? /* @__PURE__ */ Z(t.calculatedDuration) : 0;
  }
  get time() {
    return /* @__PURE__ */ Z(this.currentTime);
  }
  set time(t) {
    t = /* @__PURE__ */ W(t), this.currentTime = t, this.holdTime !== null || this.speed === 0 ? this.holdTime = t : this.driver && (this.startTime = this.driver.now() - t / this.speed);
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
    const { driver: t = pl, onPlay: n, startTime: i } = this.options;
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
const vl = /* @__PURE__ */ new Set([
  "opacity",
  "clipPath",
  "filter",
  "transform"
  // TODO: Can be accelerated but currently disabled until https://issues.chromium.org/issues/41491098 is resolved
  // or until we implement support for linear() easing.
  // "background-color"
]);
function xl(e, t, n, { delay: i = 0, duration: s = 300, repeat: o = 0, repeatType: r = "loop", ease: a = "easeInOut", times: l } = {}) {
  const c = { [t]: n };
  l && (c.offset = l);
  const u = As(a, s);
  return Array.isArray(u) && (c.easing = u), e.animate(c, {
    delay: i,
    duration: s,
    easing: Array.isArray(u) ? "linear" : u,
    fill: "both",
    iterations: o + 1,
    direction: r === "reverse" ? "alternate" : "normal"
  });
}
const bl = /* @__PURE__ */ en(() => Object.hasOwnProperty.call(Element.prototype, "animate")), re = 10, Tl = 2e4;
function Sl(e) {
  return yn(e.type) || e.type === "spring" || !Ps(e.ease);
}
function wl(e, t) {
  const n = new Rn({
    ...t,
    keyframes: e,
    repeat: 0,
    delay: 0,
    isGenerator: !0
  });
  let i = { done: !1, value: e[0] };
  const s = [];
  let o = 0;
  for (; !i.done && o < Tl; )
    i = n.sample(o), s.push(i.value), o += re;
  return {
    times: void 0,
    keyframes: s,
    duration: o - re,
    ease: "linear"
  };
}
const or = {
  anticipate: Ns,
  backInOut: Bs,
  circInOut: js
};
function Pl(e) {
  return e in or;
}
class oi extends tr {
  constructor(t) {
    super(t);
    const { name: n, motionValue: i, element: s, keyframes: o } = this.options;
    this.resolver = new Qs(o, (r, a) => this.onKeyframesResolved(r, a), n, i, s), this.resolver.scheduleResolve();
  }
  initPlayback(t, n) {
    let { duration: i = 300, times: s, ease: o, type: r, motionValue: a, name: l, startTime: c } = this.options;
    if (!a.owner || !a.owner.current)
      return !1;
    if (typeof o == "string" && ne() && Pl(o) && (o = or[o]), Sl(this.options)) {
      const { onComplete: d, onUpdate: h, motionValue: f, element: m, ...p } = this.options, y = wl(t, p);
      t = y.keyframes, t.length === 1 && (t[1] = t[0]), i = y.duration, s = y.times, o = y.ease, r = "keyframes";
    }
    const u = xl(a.owner.current, l, t, { ...this.options, duration: i, times: s, ease: o });
    return u.startTime = c ?? this.calcStartTime(), this.pendingTimeline ? ($n(u, this.pendingTimeline), this.pendingTimeline = void 0) : u.onfinish = () => {
      const { onComplete: d } = this.options;
      a.set(fe(t, this.options, n)), d && d(), this.cancel(), this.resolveFinishedPromise();
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
    i.currentTime = /* @__PURE__ */ W(t);
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
      $n(i, t);
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
      const { motionValue: c, onUpdate: u, onComplete: d, element: h, ...f } = this.options, m = new Rn({
        ...f,
        keyframes: i,
        duration: s,
        type: o,
        ease: r,
        times: a,
        isGenerator: !0
      }), p = /* @__PURE__ */ W(this.time);
      c.setWithVelocity(m.sample(p - re).value, m.sample(p).value, re);
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
    return bl() && i && vl.has(i) && /**
     * If we're outputting values to onUpdate then we can't use WAAPI as there's
     * no way to read the value from WAAPI every frame.
     */
    !l && !c && !s && o !== "mirror" && r !== 0 && a !== "inertia";
  }
}
const Al = {
  type: "spring",
  stiffness: 500,
  damping: 25,
  restSpeed: 10
}, Vl = (e) => ({
  type: "spring",
  stiffness: 550,
  damping: e === 0 ? 2 * Math.sqrt(550) : 30,
  restSpeed: 10
}), Cl = {
  type: "keyframes",
  duration: 0.8
}, Dl = {
  type: "keyframes",
  ease: [0.25, 0.1, 0.35, 1],
  duration: 0.3
}, Ml = (e, { keyframes: t }) => t.length > 2 ? Cl : dt.has(e) ? e.startsWith("scale") ? Vl(t[1]) : Al : Dl;
function Rl({ when: e, delay: t, delayChildren: n, staggerChildren: i, staggerDirection: s, repeat: o, repeatType: r, repeatDelay: a, from: l, elapsed: c, ...u }) {
  return !!Object.keys(u).length;
}
const En = (e, t, n, i = {}, s, o) => (r) => {
  const a = gn(i, e) || {}, l = a.delay || i.delay || 0;
  let { elapsed: c = 0 } = i;
  c = c - /* @__PURE__ */ W(l);
  let u = {
    keyframes: Array.isArray(n) ? n : [null, n],
    ease: "easeOut",
    velocity: t.getVelocity(),
    ...a,
    delay: -c,
    onUpdate: (h) => {
      t.set(h), a.onUpdate && a.onUpdate(h);
    },
    onComplete: () => {
      r(), a.onComplete && a.onComplete();
    },
    name: e,
    motionValue: t,
    element: o ? void 0 : s
  };
  Rl(a) || (u = {
    ...u,
    ...Ml(e, u)
  }), u.duration && (u.duration = /* @__PURE__ */ W(u.duration)), u.repeatDelay && (u.repeatDelay = /* @__PURE__ */ W(u.repeatDelay)), u.from !== void 0 && (u.keyframes[0] = u.from);
  let d = !1;
  if ((u.type === !1 || u.duration === 0 && !u.repeatDelay) && (u.duration = 0, u.delay === 0 && (d = !0)), d && !o && t.get() !== void 0) {
    const h = fe(u.keyframes, a);
    if (h !== void 0)
      return V.update(() => {
        u.onUpdate(h), u.onComplete();
      }), new Xo([]);
  }
  return !o && oi.supports(u) ? new oi(u) : new Rn(u);
};
function El({ protectedKeys: e, needsAnimating: t }, n) {
  const i = e.hasOwnProperty(n) && t[n] !== !0;
  return t[n] = !1, i;
}
function ar(e, t, { delay: n = 0, transitionOverride: i, type: s } = {}) {
  var o;
  let { transition: r = e.getDefaultTransition(), transitionEnd: a, ...l } = t;
  i && (r = i);
  const c = [], u = s && e.animationState && e.animationState.getState()[s];
  for (const d in l) {
    const h = e.getValue(d, (o = e.latestValues[d]) !== null && o !== void 0 ? o : null), f = l[d];
    if (f === void 0 || u && El(u, d))
      continue;
    const m = {
      delay: n,
      ...gn(r || {}, d)
    };
    let p = !1;
    if (window.MotionHandoffAnimation) {
      const g = Es(e);
      if (g) {
        const x = window.MotionHandoffAnimation(g, d, V);
        x !== null && (m.startTime = x, p = !0);
      }
    }
    Fe(e, d), h.start(En(d, h, f, e.shouldReduceMotion && Ms.has(d) ? { type: !1 } : m, e, p));
    const y = h.animation;
    y && c.push(y);
  }
  return a && Promise.all(c).then(() => {
    V.update(() => {
      a && ca(e, a);
    });
  }), c;
}
function _e(e, t, n = {}) {
  var i;
  const s = he(e, t, n.type === "exit" ? (i = e.presenceContext) === null || i === void 0 ? void 0 : i.custom : void 0);
  let { transition: o = e.getDefaultTransition() || {} } = s || {};
  n.transitionOverride && (o = n.transitionOverride);
  const r = s ? () => Promise.all(ar(e, s, n)) : () => Promise.resolve(), a = e.variantChildren && e.variantChildren.size ? (c = 0) => {
    const { delayChildren: u = 0, staggerChildren: d, staggerDirection: h } = o;
    return kl(e, t, u + c, d, h, n);
  } : () => Promise.resolve(), { when: l } = o;
  if (l) {
    const [c, u] = l === "beforeChildren" ? [r, a] : [a, r];
    return c().then(() => u());
  } else
    return Promise.all([r(), a(n.delay)]);
}
function kl(e, t, n = 0, i = 0, s = 1, o) {
  const r = [], a = (e.variantChildren.size - 1) * i, l = s === 1 ? (c = 0) => c * i : (c = 0) => a - c * i;
  return Array.from(e.variantChildren).sort(Ll).forEach((c, u) => {
    c.notify("AnimationStart", t), r.push(_e(c, t, {
      ...o,
      delay: n + l(u)
    }).then(() => c.notify("AnimationComplete", t)));
  }), Promise.all(r);
}
function Ll(e, t) {
  return e.sortNodePosition(t);
}
function Fl(e, t, n = {}) {
  e.notify("AnimationStart", t);
  let i;
  if (Array.isArray(t)) {
    const s = t.map((o) => _e(e, o, n));
    i = Promise.all(s);
  } else if (typeof t == "string")
    i = _e(e, t, n);
  else {
    const s = typeof t == "function" ? he(e, t, n.custom) : t;
    i = Promise.all(ar(e, s, n));
  }
  return i.then(() => {
    e.notify("AnimationComplete", t);
  });
}
const Il = sn.length;
function lr(e) {
  if (!e)
    return;
  if (!e.isControllingVariants) {
    const n = e.parent ? lr(e.parent) || {} : {};
    return e.props.initial !== void 0 && (n.initial = e.props.initial), n;
  }
  const t = {};
  for (let n = 0; n < Il; n++) {
    const i = sn[n], s = e.props[i];
    (Nt(s) || s === !1) && (t[i] = s);
  }
  return t;
}
const Bl = [...nn].reverse(), Nl = nn.length;
function Ol(e) {
  return (t) => Promise.all(t.map(({ animation: n, options: i }) => Fl(e, n, i)));
}
function jl(e) {
  let t = Ol(e), n = ai(), i = !0;
  const s = (l) => (c, u) => {
    var d;
    const h = he(e, u, l === "exit" ? (d = e.presenceContext) === null || d === void 0 ? void 0 : d.custom : void 0);
    if (h) {
      const { transition: f, transitionEnd: m, ...p } = h;
      c = { ...c, ...p, ...m };
    }
    return c;
  };
  function o(l) {
    t = l(e);
  }
  function r(l) {
    const { props: c } = e, u = lr(e.parent) || {}, d = [], h = /* @__PURE__ */ new Set();
    let f = {}, m = 1 / 0;
    for (let y = 0; y < Nl; y++) {
      const g = Bl[y], x = n[g], b = c[g] !== void 0 ? c[g] : u[g], P = Nt(b), v = g === l ? x.isActive : null;
      v === !1 && (m = y);
      let A = b === u[g] && b !== c[g] && P;
      if (A && i && e.manuallyAnimateOnMount && (A = !1), x.protectedKeys = { ...f }, // If it isn't active and hasn't *just* been set as inactive
      !x.isActive && v === null || // If we didn't and don't have any defined prop for this animation type
      !b && !x.prevProp || // Or if the prop doesn't define an animation
      ue(b) || typeof b == "boolean")
        continue;
      const M = Ul(x.prevProp, b);
      let w = M || // If we're making this variant active, we want to always make it active
      g === l && x.isActive && !A && P || // If we removed a higher-priority variant (i is in reverse order)
      y > m && P, L = !1;
      const U = Array.isArray(b) ? b : [b];
      let ht = U.reduce(s(g), {});
      v === !1 && (ht = {});
      const { prevResolvedValues: kn = {} } = x, Rr = {
        ...kn,
        ...ht
      }, Ln = (N) => {
        w = !0, h.has(N) && (L = !0, h.delete(N)), x.needsAnimating[N] = !0;
        const Y = e.getValue(N);
        Y && (Y.liveStyle = !1);
      };
      for (const N in Rr) {
        const Y = ht[N], me = kn[N];
        if (f.hasOwnProperty(N))
          continue;
        let pe = !1;
        Ee(Y) && Ee(me) ? pe = !Ts(Y, me) : pe = Y !== me, pe ? Y != null ? Ln(N) : h.add(N) : Y !== void 0 && h.has(N) ? Ln(N) : x.protectedKeys[N] = !0;
      }
      x.prevProp = b, x.prevResolvedValues = ht, x.isActive && (f = { ...f, ...ht }), i && e.blockInitialAnimation && (w = !1), w && (!(A && M) || L) && d.push(...U.map((N) => ({
        animation: N,
        options: { type: g }
      })));
    }
    if (h.size) {
      const y = {};
      h.forEach((g) => {
        const x = e.getBaseTarget(g), b = e.getValue(g);
        b && (b.liveStyle = !0), y[g] = x ?? null;
      }), d.push({ animation: y });
    }
    let p = !!d.length;
    return i && (c.initial === !1 || c.initial === c.animate) && !e.manuallyAnimateOnMount && (p = !1), i = !1, p ? t(d) : Promise.resolve();
  }
  function a(l, c) {
    var u;
    if (n[l].isActive === c)
      return Promise.resolve();
    (u = e.variantChildren) === null || u === void 0 || u.forEach((h) => {
      var f;
      return (f = h.animationState) === null || f === void 0 ? void 0 : f.setActive(l, c);
    }), n[l].isActive = c;
    const d = r(l);
    for (const h in n)
      n[h].protectedKeys = {};
    return d;
  }
  return {
    animateChanges: r,
    setActive: a,
    setAnimateFunction: o,
    getState: () => n,
    reset: () => {
      n = ai(), i = !0;
    }
  };
}
function Ul(e, t) {
  return typeof t == "string" ? t !== e : Array.isArray(t) ? !Ts(t, e) : !1;
}
function rt(e = !1) {
  return {
    isActive: e,
    protectedKeys: {},
    needsAnimating: {},
    prevResolvedValues: {}
  };
}
function ai() {
  return {
    animate: rt(!0),
    whileInView: rt(),
    whileHover: rt(),
    whileTap: rt(),
    whileDrag: rt(),
    whileFocus: rt(),
    exit: rt()
  };
}
class st {
  constructor(t) {
    this.isMounted = !1, this.node = t;
  }
  update() {
  }
}
class _l extends st {
  /**
   * We dynamically generate the AnimationState manager as it contains a reference
   * to the underlying animation library. We only want to load that if we load this,
   * so people can optionally code split it out using the `m` component.
   */
  constructor(t) {
    super(t), t.animationState || (t.animationState = jl(t));
  }
  updateAnimationControlsSubscription() {
    const { animate: t } = this.node.getProps();
    ue(t) && (this.unmountControls = t.subscribe(this.node));
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
let Kl = 0;
class $l extends st {
  constructor() {
    super(...arguments), this.id = Kl++;
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
const zl = {
  animation: {
    Feature: _l
  },
  exit: {
    Feature: $l
  }
};
function _t(e, t, n, i = { passive: !0 }) {
  return e.addEventListener(t, n, i), () => e.removeEventListener(t, n);
}
function Wt(e) {
  return {
    point: {
      x: e.pageX,
      y: e.pageY
    }
  };
}
const Wl = (e) => (t) => xn(t) && e(t, Wt(t));
function Lt(e, t, n, i) {
  return _t(e, t, Wl(n), i);
}
const li = (e, t) => Math.abs(e - t);
function Gl(e, t) {
  const n = li(e.x, t.x), i = li(e.y, t.y);
  return Math.sqrt(n ** 2 + i ** 2);
}
class cr {
  constructor(t, n, { transformPagePoint: i, contextWindow: s, dragSnapToOrigin: o = !1 } = {}) {
    if (this.startEvent = null, this.lastMoveEvent = null, this.lastMoveEventInfo = null, this.handlers = {}, this.contextWindow = window, this.updatePoint = () => {
      if (!(this.lastMoveEvent && this.lastMoveEventInfo))
        return;
      const d = we(this.lastMoveEventInfo, this.history), h = this.startEvent !== null, f = Gl(d.offset, { x: 0, y: 0 }) >= 3;
      if (!h && !f)
        return;
      const { point: m } = d, { timestamp: p } = k;
      this.history.push({ ...m, timestamp: p });
      const { onStart: y, onMove: g } = this.handlers;
      h || (y && y(this.lastMoveEvent, d), this.startEvent = this.lastMoveEvent), g && g(this.lastMoveEvent, d);
    }, this.handlePointerMove = (d, h) => {
      this.lastMoveEvent = d, this.lastMoveEventInfo = Se(h, this.transformPagePoint), V.update(this.updatePoint, !0);
    }, this.handlePointerUp = (d, h) => {
      this.end();
      const { onEnd: f, onSessionEnd: m, resumeAnimation: p } = this.handlers;
      if (this.dragSnapToOrigin && p && p(), !(this.lastMoveEvent && this.lastMoveEventInfo))
        return;
      const y = we(d.type === "pointercancel" ? this.lastMoveEventInfo : Se(h, this.transformPagePoint), this.history);
      this.startEvent && f && f(d, y), m && m(d, y);
    }, !xn(t))
      return;
    this.dragSnapToOrigin = o, this.handlers = n, this.transformPagePoint = i, this.contextWindow = s || window;
    const r = Wt(t), a = Se(r, this.transformPagePoint), { point: l } = a, { timestamp: c } = k;
    this.history = [{ ...l, timestamp: c }];
    const { onSessionStart: u } = n;
    u && u(t, we(a, this.history)), this.removeListeners = zt(Lt(this.contextWindow, "pointermove", this.handlePointerMove), Lt(this.contextWindow, "pointerup", this.handlePointerUp), Lt(this.contextWindow, "pointercancel", this.handlePointerUp));
  }
  updateHandlers(t) {
    this.handlers = t;
  }
  end() {
    this.removeListeners && this.removeListeners(), nt(this.updatePoint);
  }
}
function Se(e, t) {
  return t ? { point: t(e.point) } : e;
}
function ci(e, t) {
  return { x: e.x - t.x, y: e.y - t.y };
}
function we({ point: e }, t) {
  return {
    point: e,
    delta: ci(e, ur(t)),
    offset: ci(e, Hl(t)),
    velocity: Yl(t, 0.1)
  };
}
function Hl(e) {
  return e[0];
}
function ur(e) {
  return e[e.length - 1];
}
function Yl(e, t) {
  if (e.length < 2)
    return { x: 0, y: 0 };
  let n = e.length - 1, i = null;
  const s = ur(e);
  for (; n >= 0 && (i = e[n], !(s.timestamp - i.timestamp > /* @__PURE__ */ W(t))); )
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
const dr = 1e-4, Xl = 1 - dr, ql = 1 + dr, hr = 0.01, Zl = 0 - hr, Jl = 0 + hr;
function j(e) {
  return e.max - e.min;
}
function Ql(e, t, n) {
  return Math.abs(e - t) <= n;
}
function ui(e, t, n, i = 0.5) {
  e.origin = i, e.originPoint = D(t.min, t.max, e.origin), e.scale = j(n) / j(t), e.translate = D(n.min, n.max, e.origin) - e.originPoint, (e.scale >= Xl && e.scale <= ql || isNaN(e.scale)) && (e.scale = 1), (e.translate >= Zl && e.translate <= Jl || isNaN(e.translate)) && (e.translate = 0);
}
function Ft(e, t, n, i) {
  ui(e.x, t.x, n.x, i ? i.originX : void 0), ui(e.y, t.y, n.y, i ? i.originY : void 0);
}
function di(e, t, n) {
  e.min = n.min + t.min, e.max = e.min + j(t);
}
function tc(e, t, n) {
  di(e.x, t.x, n.x), di(e.y, t.y, n.y);
}
function hi(e, t, n) {
  e.min = t.min - n.min, e.max = e.min + j(t);
}
function It(e, t, n) {
  hi(e.x, t.x, n.x), hi(e.y, t.y, n.y);
}
function ec(e, { min: t, max: n }, i) {
  return t !== void 0 && e < t ? e = i ? D(t, e, i.min) : Math.max(e, t) : n !== void 0 && e > n && (e = i ? D(n, e, i.max) : Math.min(e, n)), e;
}
function fi(e, t, n) {
  return {
    min: t !== void 0 ? e.min + t : void 0,
    max: n !== void 0 ? e.max + n - (e.max - e.min) : void 0
  };
}
function nc(e, { top: t, left: n, bottom: i, right: s }) {
  return {
    x: fi(e.x, n, s),
    y: fi(e.y, t, i)
  };
}
function mi(e, t) {
  let n = t.min - e.min, i = t.max - e.max;
  return t.max - t.min < e.max - e.min && ([n, i] = [i, n]), { min: n, max: i };
}
function ic(e, t) {
  return {
    x: mi(e.x, t.x),
    y: mi(e.y, t.y)
  };
}
function sc(e, t) {
  let n = 0.5;
  const i = j(e), s = j(t);
  return s > i ? n = /* @__PURE__ */ vt(t.min, t.max - i, e.min) : i > s && (n = /* @__PURE__ */ vt(e.min, e.max - s, t.min)), J(0, 1, n);
}
function rc(e, t) {
  const n = {};
  return t.min !== void 0 && (n.min = t.min - e.min), t.max !== void 0 && (n.max = t.max - e.min), n;
}
const Ke = 0.35;
function oc(e = Ke) {
  return e === !1 ? e = 0 : e === !0 && (e = Ke), {
    x: pi(e, "left", "right"),
    y: pi(e, "top", "bottom")
  };
}
function pi(e, t, n) {
  return {
    min: gi(e, t),
    max: gi(e, n)
  };
}
function gi(e, t) {
  return typeof e == "number" ? e : e[t] || 0;
}
const yi = () => ({
  translate: 0,
  scale: 1,
  origin: 0,
  originPoint: 0
}), pt = () => ({
  x: yi(),
  y: yi()
}), vi = () => ({ min: 0, max: 0 }), R = () => ({
  x: vi(),
  y: vi()
});
function K(e) {
  return [e("x"), e("y")];
}
function fr({ top: e, left: t, right: n, bottom: i }) {
  return {
    x: { min: t, max: n },
    y: { min: e, max: i }
  };
}
function ac({ x: e, y: t }) {
  return { top: t.min, right: e.max, bottom: t.max, left: e.min };
}
function lc(e, t) {
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
function Pe(e) {
  return e === void 0 || e === 1;
}
function $e({ scale: e, scaleX: t, scaleY: n }) {
  return !Pe(e) || !Pe(t) || !Pe(n);
}
function ot(e) {
  return $e(e) || mr(e) || e.z || e.rotate || e.rotateX || e.rotateY || e.skewX || e.skewY;
}
function mr(e) {
  return xi(e.x) || xi(e.y);
}
function xi(e) {
  return e && e !== "0%";
}
function oe(e, t, n) {
  const i = e - n, s = t * i;
  return n + s;
}
function bi(e, t, n, i, s) {
  return s !== void 0 && (e = oe(e, s, i)), oe(e, n, i) + t;
}
function ze(e, t = 0, n = 1, i, s) {
  e.min = bi(e.min, t, n, i, s), e.max = bi(e.max, t, n, i, s);
}
function pr(e, { x: t, y: n }) {
  ze(e.x, t.translate, t.scale, t.originPoint), ze(e.y, n.translate, n.scale, n.originPoint);
}
const Ti = 0.999999999999, Si = 1.0000000000001;
function cc(e, t, n, i = !1) {
  const s = n.length;
  if (!s)
    return;
  t.x = t.y = 1;
  let o, r;
  for (let a = 0; a < s; a++) {
    o = n[a], r = o.projectionDelta;
    const { visualElement: l } = o.options;
    l && l.props.style && l.props.style.display === "contents" || (i && o.options.layoutScroll && o.scroll && o !== o.root && yt(e, {
      x: -o.scroll.offset.x,
      y: -o.scroll.offset.y
    }), r && (t.x *= r.x.scale, t.y *= r.y.scale, pr(e, r)), i && ot(o.latestValues) && yt(e, o.latestValues));
  }
  t.x < Si && t.x > Ti && (t.x = 1), t.y < Si && t.y > Ti && (t.y = 1);
}
function gt(e, t) {
  e.min = e.min + t, e.max = e.max + t;
}
function wi(e, t, n, i, s = 0.5) {
  const o = D(e.min, e.max, s);
  ze(e, t, n, o, i);
}
function yt(e, t) {
  wi(e.x, t.x, t.scaleX, t.scale, t.originX), wi(e.y, t.y, t.scaleY, t.scale, t.originY);
}
function gr(e, t) {
  return fr(lc(e.getBoundingClientRect(), t));
}
function uc(e, t, n) {
  const i = gr(e, n), { scroll: s } = t;
  return s && (gt(i.x, s.offset.x), gt(i.y, s.offset.y)), i;
}
const yr = ({ current: e }) => e ? e.ownerDocument.defaultView : null, dc = /* @__PURE__ */ new WeakMap();
class hc {
  constructor(t) {
    this.openDragLock = null, this.isDragging = !1, this.currentDirection = null, this.originPoint = { x: 0, y: 0 }, this.constraints = !1, this.hasMutatedConstraints = !1, this.elastic = R(), this.visualElement = t;
  }
  start(t, { snapToCursor: n = !1 } = {}) {
    const { presenceContext: i } = this.visualElement;
    if (i && i.isPresent === !1)
      return;
    const s = (u) => {
      const { dragSnapToOrigin: d } = this.getProps();
      d ? this.pauseAnimation() : this.stopAnimation(), n && this.snapToCursor(Wt(u).point);
    }, o = (u, d) => {
      const { drag: h, dragPropagation: f, onDragStart: m } = this.getProps();
      if (h && !f && (this.openDragLock && this.openDragLock(), this.openDragLock = sa(h), !this.openDragLock))
        return;
      this.isDragging = !0, this.currentDirection = null, this.resolveConstraints(), this.visualElement.projection && (this.visualElement.projection.isAnimationBlocked = !0, this.visualElement.projection.target = void 0), K((y) => {
        let g = this.getAxisMotionValue(y).get() || 0;
        if (G.test(g)) {
          const { projection: x } = this.visualElement;
          if (x && x.layout) {
            const b = x.layout.layoutBox[y];
            b && (g = j(b) * (parseFloat(g) / 100));
          }
        }
        this.originPoint[y] = g;
      }), m && V.postRender(() => m(u, d)), Fe(this.visualElement, "transform");
      const { animationState: p } = this.visualElement;
      p && p.setActive("whileDrag", !0);
    }, r = (u, d) => {
      const { dragPropagation: h, dragDirectionLock: f, onDirectionLock: m, onDrag: p } = this.getProps();
      if (!h && !this.openDragLock)
        return;
      const { offset: y } = d;
      if (f && this.currentDirection === null) {
        this.currentDirection = fc(y), this.currentDirection !== null && m && m(this.currentDirection);
        return;
      }
      this.updateAxis("x", d.point, y), this.updateAxis("y", d.point, y), this.visualElement.render(), p && p(u, d);
    }, a = (u, d) => this.stop(u, d), l = () => K((u) => {
      var d;
      return this.getAnimationState(u) === "paused" && ((d = this.getAxisMotionValue(u).animation) === null || d === void 0 ? void 0 : d.play());
    }), { dragSnapToOrigin: c } = this.getProps();
    this.panSession = new cr(t, {
      onSessionStart: s,
      onStart: o,
      onMove: r,
      onSessionEnd: a,
      resumeAnimation: l
    }, {
      transformPagePoint: this.visualElement.getTransformPagePoint(),
      dragSnapToOrigin: c,
      contextWindow: yr(this.visualElement)
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
    if (!i || !Xt(t, s, this.currentDirection))
      return;
    const o = this.getAxisMotionValue(t);
    let r = this.originPoint[t] + i[t];
    this.constraints && this.constraints[t] && (r = ec(r, this.constraints[t], this.elastic[t])), o.set(r);
  }
  resolveConstraints() {
    var t;
    const { dragConstraints: n, dragElastic: i } = this.getProps(), s = this.visualElement.projection && !this.visualElement.projection.layout ? this.visualElement.projection.measure(!1) : (t = this.visualElement.projection) === null || t === void 0 ? void 0 : t.layout, o = this.constraints;
    n && ft(n) ? this.constraints || (this.constraints = this.resolveRefConstraints()) : n && s ? this.constraints = nc(s.layoutBox, n) : this.constraints = !1, this.elastic = oc(i), o !== this.constraints && s && this.constraints && !this.hasMutatedConstraints && K((r) => {
      this.constraints !== !1 && this.getAxisMotionValue(r) && (this.constraints[r] = rc(s.layoutBox[r], this.constraints[r]));
    });
  }
  resolveRefConstraints() {
    const { dragConstraints: t, onMeasureDragConstraints: n } = this.getProps();
    if (!t || !ft(t))
      return !1;
    const i = t.current;
    et(i !== null, "If `dragConstraints` is set as a React ref, that ref must be passed to another component's `ref` prop.");
    const { projection: s } = this.visualElement;
    if (!s || !s.layout)
      return !1;
    const o = uc(i, s.root, this.visualElement.getTransformPagePoint());
    let r = ic(s.layout.layoutBox, o);
    if (n) {
      const a = n(ac(r));
      this.hasMutatedConstraints = !!a, a && (r = fr(a));
    }
    return r;
  }
  startAnimation(t) {
    const { drag: n, dragMomentum: i, dragElastic: s, dragTransition: o, dragSnapToOrigin: r, onDragTransitionEnd: a } = this.getProps(), l = this.constraints || {}, c = K((u) => {
      if (!Xt(u, n, this.currentDirection))
        return;
      let d = l && l[u] || {};
      r && (d = { min: 0, max: 0 });
      const h = s ? 200 : 1e6, f = s ? 40 : 1e7, m = {
        type: "inertia",
        velocity: i ? t[u] : 0,
        bounceStiffness: h,
        bounceDamping: f,
        timeConstant: 750,
        restDelta: 1,
        restSpeed: 10,
        ...o,
        ...d
      };
      return this.startAxisValueAnimation(u, m);
    });
    return Promise.all(c).then(a);
  }
  startAxisValueAnimation(t, n) {
    const i = this.getAxisMotionValue(t);
    return Fe(this.visualElement, t), i.start(En(t, i, 0, n, this.visualElement, !1));
  }
  stopAnimation() {
    K((t) => this.getAxisMotionValue(t).stop());
  }
  pauseAnimation() {
    K((t) => {
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
    K((n) => {
      const { drag: i } = this.getProps();
      if (!Xt(n, i, this.currentDirection))
        return;
      const { projection: s } = this.visualElement, o = this.getAxisMotionValue(n);
      if (s && s.layout) {
        const { min: r, max: a } = s.layout.layoutBox[n];
        o.set(t[n] - D(r, a, 0.5));
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
    if (!ft(n) || !i || !this.constraints)
      return;
    this.stopAnimation();
    const s = { x: 0, y: 0 };
    K((r) => {
      const a = this.getAxisMotionValue(r);
      if (a && this.constraints !== !1) {
        const l = a.get();
        s[r] = sc({ min: l, max: l }, this.constraints[r]);
      }
    });
    const { transformTemplate: o } = this.visualElement.getProps();
    this.visualElement.current.style.transform = o ? o({}, "") : "none", i.root && i.root.updateScroll(), i.updateLayout(), this.resolveConstraints(), K((r) => {
      if (!Xt(r, t, null))
        return;
      const a = this.getAxisMotionValue(r), { min: l, max: c } = this.constraints[r];
      a.set(D(l, c, s[r]));
    });
  }
  addListeners() {
    if (!this.visualElement.current)
      return;
    dc.set(this.visualElement, this);
    const t = this.visualElement.current, n = Lt(t, "pointerdown", (l) => {
      const { drag: c, dragListener: u = !0 } = this.getProps();
      c && u && this.start(l);
    }), i = () => {
      const { dragConstraints: l } = this.getProps();
      ft(l) && l.current && (this.constraints = this.resolveRefConstraints());
    }, { projection: s } = this.visualElement, o = s.addEventListener("measure", i);
    s && !s.layout && (s.root && s.root.updateScroll(), s.updateLayout()), V.read(i);
    const r = _t(window, "resize", () => this.scalePositionWithinConstraints()), a = s.addEventListener("didUpdate", ({ delta: l, hasLayoutChanged: c }) => {
      this.isDragging && c && (K((u) => {
        const d = this.getAxisMotionValue(u);
        d && (this.originPoint[u] += l[u].translate, d.set(d.get() + l[u].translate));
      }), this.visualElement.render());
    });
    return () => {
      r(), n(), o(), a && a();
    };
  }
  getProps() {
    const t = this.visualElement.getProps(), { drag: n = !1, dragDirectionLock: i = !1, dragPropagation: s = !1, dragConstraints: o = !1, dragElastic: r = Ke, dragMomentum: a = !0 } = t;
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
function Xt(e, t, n) {
  return (t === !0 || t === e) && (n === null || n === e);
}
function fc(e, t = 10) {
  let n = null;
  return Math.abs(e.y) > t ? n = "y" : Math.abs(e.x) > t && (n = "x"), n;
}
class mc extends st {
  constructor(t) {
    super(t), this.removeGroupControls = O, this.removeListeners = O, this.controls = new hc(t);
  }
  mount() {
    const { dragControls: t } = this.node.getProps();
    t && (this.removeGroupControls = t.subscribe(this.controls)), this.removeListeners = this.controls.addListeners() || O;
  }
  unmount() {
    this.removeGroupControls(), this.removeListeners();
  }
}
const Pi = (e) => (t, n) => {
  e && V.postRender(() => e(t, n));
};
class pc extends st {
  constructor() {
    super(...arguments), this.removePointerDownListener = O;
  }
  onPointerDown(t) {
    this.session = new cr(t, this.createPanHandlers(), {
      transformPagePoint: this.node.getTransformPagePoint(),
      contextWindow: yr(this.node)
    });
  }
  createPanHandlers() {
    const { onPanSessionStart: t, onPanStart: n, onPan: i, onPanEnd: s } = this.node.getProps();
    return {
      onSessionStart: Pi(t),
      onStart: Pi(n),
      onMove: i,
      onEnd: (o, r) => {
        delete this.session, s && V.postRender(() => s(o, r));
      }
    };
  }
  mount() {
    this.removePointerDownListener = Lt(this.node.current, "pointerdown", (t) => this.onPointerDown(t));
  }
  update() {
    this.session && this.session.updateHandlers(this.createPanHandlers());
  }
  unmount() {
    this.removePointerDownListener(), this.session && this.session.end();
  }
}
const Jt = {
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
function Ai(e, t) {
  return t.max === t.min ? 0 : e / (t.max - t.min) * 100;
}
const Ct = {
  correct: (e, t) => {
    if (!t.target)
      return e;
    if (typeof e == "string")
      if (S.test(e))
        e = parseFloat(e);
      else
        return e;
    const n = Ai(e, t.target.x), i = Ai(e, t.target.y);
    return `${n}% ${i}%`;
  }
}, gc = {
  correct: (e, { treeScale: t, projectionDelta: n }) => {
    const i = e, s = it.parse(e);
    if (s.length > 5)
      return i;
    const o = it.createTransformer(e), r = typeof s[0] != "number" ? 1 : 0, a = n.x.scale * t.x, l = n.y.scale * t.y;
    s[0 + r] /= a, s[1 + r] /= l;
    const c = D(a, l, 0.5);
    return typeof s[2 + r] == "number" && (s[2 + r] /= c), typeof s[3 + r] == "number" && (s[3 + r] /= c), o(s);
  }
};
class yc extends Ji {
  /**
   * This only mounts projection nodes for components that
   * need measuring, we might want to do it for all components
   * in order to incorporate transforms
   */
  componentDidMount() {
    const { visualElement: t, layoutGroup: n, switchLayoutGroup: i, layoutId: s } = this.props, { projection: o } = t;
    No(vc), o && (n.group && n.group.add(o), i && i.register && s && i.register(o), o.root.didUpdate(), o.addEventListener("animationComplete", () => {
      this.safeToRemove();
    }), o.setOptions({
      ...o.options,
      onExitComplete: () => this.safeToRemove()
    })), Jt.hasEverUpdated = !0;
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
    t && (t.root.didUpdate(), on.postRender(() => {
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
function vr(e) {
  const [t, n] = es(), i = I(Ze);
  return T(yc, { ...e, layoutGroup: i, switchLayoutGroup: I(ls), isPresent: t, safeToRemove: n });
}
const vc = {
  borderRadius: {
    ...Ct,
    applyTo: [
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomLeftRadius",
      "borderBottomRightRadius"
    ]
  },
  borderTopLeftRadius: Ct,
  borderTopRightRadius: Ct,
  borderBottomLeftRadius: Ct,
  borderBottomRightRadius: Ct,
  boxShadow: gc
};
function xc(e, t, n) {
  const i = B(e) ? e : jt(e);
  return i.start(En("", i, t, n)), i.animation;
}
function bc(e) {
  return e instanceof SVGElement && e.tagName !== "svg";
}
const Tc = (e, t) => e.depth - t.depth;
class Sc {
  constructor() {
    this.children = [], this.isDirty = !1;
  }
  add(t) {
    bn(this.children, t), this.isDirty = !0;
  }
  remove(t) {
    Tn(this.children, t), this.isDirty = !0;
  }
  forEach(t) {
    this.isDirty && this.children.sort(Tc), this.isDirty = !1, this.children.forEach(t);
  }
}
function wc(e, t) {
  const n = H.now(), i = ({ timestamp: s }) => {
    const o = s - n;
    o >= t && (nt(i), e(o - t));
  };
  return V.read(i, !0), () => nt(i);
}
const xr = ["TopLeft", "TopRight", "BottomLeft", "BottomRight"], Pc = xr.length, Vi = (e) => typeof e == "string" ? parseFloat(e) : e, Ci = (e) => typeof e == "number" || S.test(e);
function Ac(e, t, n, i, s, o) {
  s ? (e.opacity = D(
    0,
    // TODO Reinstate this if only child
    n.opacity !== void 0 ? n.opacity : 1,
    Vc(i)
  ), e.opacityExit = D(t.opacity !== void 0 ? t.opacity : 1, 0, Cc(i))) : o && (e.opacity = D(t.opacity !== void 0 ? t.opacity : 1, n.opacity !== void 0 ? n.opacity : 1, i));
  for (let r = 0; r < Pc; r++) {
    const a = `border${xr[r]}Radius`;
    let l = Di(t, a), c = Di(n, a);
    if (l === void 0 && c === void 0)
      continue;
    l || (l = 0), c || (c = 0), l === 0 || c === 0 || Ci(l) === Ci(c) ? (e[a] = Math.max(D(Vi(l), Vi(c), i), 0), (G.test(c) || G.test(l)) && (e[a] += "%")) : e[a] = c;
  }
  (t.rotate || n.rotate) && (e.rotate = D(t.rotate || 0, n.rotate || 0, i));
}
function Di(e, t) {
  return e[t] !== void 0 ? e[t] : e.borderRadius;
}
const Vc = /* @__PURE__ */ br(0, 0.5, Os), Cc = /* @__PURE__ */ br(0.5, 0.95, O);
function br(e, t, n) {
  return (i) => i < e ? 0 : i > t ? 1 : n(/* @__PURE__ */ vt(e, t, i));
}
function Mi(e, t) {
  e.min = t.min, e.max = t.max;
}
function _(e, t) {
  Mi(e.x, t.x), Mi(e.y, t.y);
}
function Ri(e, t) {
  e.translate = t.translate, e.scale = t.scale, e.originPoint = t.originPoint, e.origin = t.origin;
}
function Ei(e, t, n, i, s) {
  return e -= t, e = oe(e, 1 / n, i), s !== void 0 && (e = oe(e, 1 / s, i)), e;
}
function Dc(e, t = 0, n = 1, i = 0.5, s, o = e, r = e) {
  if (G.test(t) && (t = parseFloat(t), t = D(r.min, r.max, t / 100) - r.min), typeof t != "number")
    return;
  let a = D(o.min, o.max, i);
  e === o && (a -= t), e.min = Ei(e.min, t, n, a, s), e.max = Ei(e.max, t, n, a, s);
}
function ki(e, t, [n, i, s], o, r) {
  Dc(e, t[n], t[i], t[s], t.scale, o, r);
}
const Mc = ["x", "scaleX", "originX"], Rc = ["y", "scaleY", "originY"];
function Li(e, t, n, i) {
  ki(e.x, t, Mc, n ? n.x : void 0, i ? i.x : void 0), ki(e.y, t, Rc, n ? n.y : void 0, i ? i.y : void 0);
}
function Fi(e) {
  return e.translate === 0 && e.scale === 1;
}
function Tr(e) {
  return Fi(e.x) && Fi(e.y);
}
function Ii(e, t) {
  return e.min === t.min && e.max === t.max;
}
function Ec(e, t) {
  return Ii(e.x, t.x) && Ii(e.y, t.y);
}
function Bi(e, t) {
  return Math.round(e.min) === Math.round(t.min) && Math.round(e.max) === Math.round(t.max);
}
function Sr(e, t) {
  return Bi(e.x, t.x) && Bi(e.y, t.y);
}
function Ni(e) {
  return j(e.x) / j(e.y);
}
function Oi(e, t) {
  return e.translate === t.translate && e.scale === t.scale && e.originPoint === t.originPoint;
}
class kc {
  constructor() {
    this.members = [];
  }
  add(t) {
    bn(this.members, t), t.scheduleRender();
  }
  remove(t) {
    if (Tn(this.members, t), t === this.prevLead && (this.prevLead = void 0), t === this.lead) {
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
function Lc(e, t, n) {
  let i = "";
  const s = e.x.translate / t.x, o = e.y.translate / t.y, r = n?.z || 0;
  if ((s || o || r) && (i = `translate3d(${s}px, ${o}px, ${r}px) `), (t.x !== 1 || t.y !== 1) && (i += `scale(${1 / t.x}, ${1 / t.y}) `), n) {
    const { transformPerspective: c, rotate: u, rotateX: d, rotateY: h, skewX: f, skewY: m } = n;
    c && (i = `perspective(${c}px) ${i}`), u && (i += `rotate(${u}deg) `), d && (i += `rotateX(${d}deg) `), h && (i += `rotateY(${h}deg) `), f && (i += `skewX(${f}deg) `), m && (i += `skewY(${m}deg) `);
  }
  const a = e.x.scale * t.x, l = e.y.scale * t.y;
  return (a !== 1 || l !== 1) && (i += `scale(${a}, ${l})`), i || "none";
}
const at = {
  type: "projectionFrame",
  totalNodes: 0,
  resolvedTargetDeltas: 0,
  recalculatedProjection: 0
}, Et = typeof window < "u" && window.MotionDebug !== void 0, Ae = ["", "X", "Y", "Z"], Fc = { visibility: "hidden" }, ji = 1e3;
let Ic = 0;
function Ve(e, t, n, i) {
  const { latestValues: s } = t;
  s[e] && (n[e] = s[e], t.setStaticValue(e, 0), i && (i[e] = 0));
}
function wr(e) {
  if (e.hasCheckedOptimisedAppear = !0, e.root === e)
    return;
  const { visualElement: t } = e.options;
  if (!t)
    return;
  const n = Es(t);
  if (window.MotionHasOptimisedAnimation(n, "transform")) {
    const { layout: s, layoutId: o } = e.options;
    window.MotionCancelOptimisedAnimation(n, "transform", V, !(s || o));
  }
  const { parent: i } = e;
  i && !i.hasCheckedOptimisedAppear && wr(i);
}
function Pr({ attachResizeListener: e, defaultParent: t, measureScroll: n, checkIsScrollRoot: i, resetTransform: s }) {
  return class {
    constructor(r = {}, a = t?.()) {
      this.id = Ic++, this.animationId = 0, this.children = /* @__PURE__ */ new Set(), this.options = {}, this.isTreeAnimating = !1, this.isAnimationBlocked = !1, this.isLayoutDirty = !1, this.isProjectionDirty = !1, this.isSharedProjectionDirty = !1, this.isTransformDirty = !1, this.updateManuallyBlocked = !1, this.updateBlockedByResize = !1, this.isUpdating = !1, this.isSVG = !1, this.needsReset = !1, this.shouldResetTransform = !1, this.hasCheckedOptimisedAppear = !1, this.treeScale = { x: 1, y: 1 }, this.eventHandlers = /* @__PURE__ */ new Map(), this.hasTreeAnimated = !1, this.updateScheduled = !1, this.scheduleUpdate = () => this.update(), this.projectionUpdateScheduled = !1, this.checkUpdateFailed = () => {
        this.isUpdating && (this.isUpdating = !1, this.clearAllSnapshots());
      }, this.updateProjection = () => {
        this.projectionUpdateScheduled = !1, Et && (at.totalNodes = at.resolvedTargetDeltas = at.recalculatedProjection = 0), this.nodes.forEach(Oc), this.nodes.forEach($c), this.nodes.forEach(zc), this.nodes.forEach(jc), Et && window.MotionDebug.record(at);
      }, this.resolvedRelativeTargetAt = 0, this.hasProjected = !1, this.isVisible = !0, this.animationProgress = 0, this.sharedNodes = /* @__PURE__ */ new Map(), this.latestValues = r, this.root = a ? a.root || a : this, this.path = a ? [...a.path, a] : [], this.parent = a, this.depth = a ? a.depth + 1 : 0;
      for (let l = 0; l < this.path.length; l++)
        this.path[l].shouldResetTransform = !0;
      this.root === this && (this.nodes = new Sc());
    }
    addEventListener(r, a) {
      return this.eventHandlers.has(r) || this.eventHandlers.set(r, new Sn()), this.eventHandlers.get(r).add(a);
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
      this.isSVG = bc(r), this.instance = r;
      const { layoutId: l, layout: c, visualElement: u } = this.options;
      if (u && !u.current && u.mount(r), this.root.nodes.add(this), this.parent && this.parent.children.add(this), a && (c || l) && (this.isLayoutDirty = !0), e) {
        let d;
        const h = () => this.root.updateBlockedByResize = !1;
        e(r, () => {
          this.root.updateBlockedByResize = !0, d && d(), d = wc(h, 250), Jt.hasAnimatedSinceResize && (Jt.hasAnimatedSinceResize = !1, this.nodes.forEach(_i));
        });
      }
      l && this.root.registerSharedNode(l, this), this.options.animate !== !1 && u && (l || c) && this.addEventListener("didUpdate", ({ delta: d, hasLayoutChanged: h, hasRelativeTargetChanged: f, layout: m }) => {
        if (this.isTreeAnimationBlocked()) {
          this.target = void 0, this.relativeTarget = void 0;
          return;
        }
        const p = this.options.transition || u.getDefaultTransition() || Xc, { onLayoutAnimationStart: y, onLayoutAnimationComplete: g } = u.getProps(), x = !this.targetLayout || !Sr(this.targetLayout, m) || f, b = !h && f;
        if (this.options.layoutRoot || this.resumeFrom && this.resumeFrom.instance || b || h && (x || !this.currentAnimation)) {
          this.resumeFrom && (this.resumingFrom = this.resumeFrom, this.resumingFrom.resumingFrom = void 0), this.setAnimationOrigin(d, b);
          const P = {
            ...gn(p, "layout"),
            onPlay: y,
            onComplete: g
          };
          (u.shouldReduceMotion || this.options.layoutRoot) && (P.delay = 0, P.type = !1), this.startAnimation(P);
        } else
          h || _i(this), this.isLead() && this.options.onExitComplete && this.options.onExitComplete();
        this.targetLayout = m;
      });
    }
    unmount() {
      this.options.layoutId && this.willUpdate(), this.root.nodes.remove(this);
      const r = this.getStack();
      r && r.remove(this), this.parent && this.parent.children.delete(this), this.instance = void 0, nt(this.updateProjection);
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
      this.isUpdateBlocked() || (this.isUpdating = !0, this.nodes && this.nodes.forEach(Wc), this.animationId++);
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
      if (window.MotionCancelOptimisedAnimation && !this.hasCheckedOptimisedAppear && wr(this), !this.root.isUpdating && this.root.startUpdate(), this.isLayoutDirty)
        return;
      this.isLayoutDirty = !0;
      for (let u = 0; u < this.path.length; u++) {
        const d = this.path[u];
        d.shouldResetTransform = !0, d.updateScroll("snapshot"), d.options.layoutRoot && d.willUpdate(!1);
      }
      const { layoutId: a, layout: l } = this.options;
      if (a === void 0 && !l)
        return;
      const c = this.getTransformTemplate();
      this.prevTransformTemplateValue = c ? c(this.latestValues, "") : void 0, this.updateSnapshot(), r && this.notifyListeners("willUpdate");
    }
    update() {
      if (this.updateScheduled = !1, this.isUpdateBlocked()) {
        this.unblockUpdate(), this.clearAllSnapshots(), this.nodes.forEach(Ui);
        return;
      }
      this.isUpdating || this.nodes.forEach(_c), this.isUpdating = !1, this.nodes.forEach(Kc), this.nodes.forEach(Bc), this.nodes.forEach(Nc), this.clearAllSnapshots();
      const a = H.now();
      k.delta = J(0, 1e3 / 60, a - k.timestamp), k.timestamp = a, k.isProcessing = !0, ge.update.process(k), ge.preRender.process(k), ge.render.process(k), k.isProcessing = !1;
    }
    didUpdate() {
      this.updateScheduled || (this.updateScheduled = !0, on.read(this.scheduleUpdate));
    }
    clearAllSnapshots() {
      this.nodes.forEach(Uc), this.sharedNodes.forEach(Gc);
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
      const r = this.isLayoutDirty || this.shouldResetTransform || this.options.alwaysMeasureLayout, a = this.projectionDelta && !Tr(this.projectionDelta), l = this.getTransformTemplate(), c = l ? l(this.latestValues, "") : void 0, u = c !== this.prevTransformTemplateValue;
      r && (a || ot(this.latestValues) || u) && (s(this.instance, c), this.shouldResetTransform = !1, this.scheduleRender());
    }
    measure(r = !0) {
      const a = this.measurePageBox();
      let l = this.removeElementScroll(a);
      return r && (l = this.removeTransform(l)), qc(l), {
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
      if (!(((r = this.scroll) === null || r === void 0 ? void 0 : r.wasRoot) || this.path.some(Zc))) {
        const { scroll: u } = this.root;
        u && (gt(l.x, u.offset.x), gt(l.y, u.offset.y));
      }
      return l;
    }
    removeElementScroll(r) {
      var a;
      const l = R();
      if (_(l, r), !((a = this.scroll) === null || a === void 0) && a.wasRoot)
        return l;
      for (let c = 0; c < this.path.length; c++) {
        const u = this.path[c], { scroll: d, options: h } = u;
        u !== this.root && d && h.layoutScroll && (d.wasRoot && _(l, r), gt(l.x, d.offset.x), gt(l.y, d.offset.y));
      }
      return l;
    }
    applyTransform(r, a = !1) {
      const l = R();
      _(l, r);
      for (let c = 0; c < this.path.length; c++) {
        const u = this.path[c];
        !a && u.options.layoutScroll && u.scroll && u !== u.root && yt(l, {
          x: -u.scroll.offset.x,
          y: -u.scroll.offset.y
        }), ot(u.latestValues) && yt(l, u.latestValues);
      }
      return ot(this.latestValues) && yt(l, this.latestValues), l;
    }
    removeTransform(r) {
      const a = R();
      _(a, r);
      for (let l = 0; l < this.path.length; l++) {
        const c = this.path[l];
        if (!c.instance || !ot(c.latestValues))
          continue;
        $e(c.latestValues) && c.updateSnapshot();
        const u = R(), d = c.measurePageBox();
        _(u, d), Li(a, c.latestValues, c.snapshot ? c.snapshot.layoutBox : void 0, u);
      }
      return ot(this.latestValues) && Li(a, this.latestValues), a;
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
      const { layout: d, layoutId: h } = this.options;
      if (!(!this.layout || !(d || h))) {
        if (this.resolvedRelativeTargetAt = k.timestamp, !this.targetDelta && !this.relativeTarget) {
          const f = this.getClosestProjectingParent();
          f && f.layout && this.animationProgress !== 1 ? (this.relativeParent = f, this.forceRelativeParentToResolveTarget(), this.relativeTarget = R(), this.relativeTargetOrigin = R(), It(this.relativeTargetOrigin, this.layout.layoutBox, f.layout.layoutBox), _(this.relativeTarget, this.relativeTargetOrigin)) : this.relativeParent = this.relativeTarget = void 0;
        }
        if (!(!this.relativeTarget && !this.targetDelta)) {
          if (this.target || (this.target = R(), this.targetWithTransforms = R()), this.relativeTarget && this.relativeTargetOrigin && this.relativeParent && this.relativeParent.target ? (this.forceRelativeParentToResolveTarget(), tc(this.target, this.relativeTarget, this.relativeParent.target)) : this.targetDelta ? (this.resumingFrom ? this.target = this.applyTransform(this.layout.layoutBox) : _(this.target, this.layout.layoutBox), pr(this.target, this.targetDelta)) : _(this.target, this.layout.layoutBox), this.attemptToResolveRelativeTarget) {
            this.attemptToResolveRelativeTarget = !1;
            const f = this.getClosestProjectingParent();
            f && !!f.resumingFrom == !!this.resumingFrom && !f.options.layoutScroll && f.target && this.animationProgress !== 1 ? (this.relativeParent = f, this.forceRelativeParentToResolveTarget(), this.relativeTarget = R(), this.relativeTargetOrigin = R(), It(this.relativeTargetOrigin, this.target, f.target), _(this.relativeTarget, this.relativeTargetOrigin)) : this.relativeParent = this.relativeTarget = void 0;
          }
          Et && at.resolvedTargetDeltas++;
        }
      }
    }
    getClosestProjectingParent() {
      if (!(!this.parent || $e(this.parent.latestValues) || mr(this.parent.latestValues)))
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
      const { layout: u, layoutId: d } = this.options;
      if (this.isTreeAnimating = !!(this.parent && this.parent.isTreeAnimating || this.currentAnimation || this.pendingAnimation), this.isTreeAnimating || (this.targetDelta = this.relativeTarget = void 0), !this.layout || !(u || d))
        return;
      _(this.layoutCorrected, this.layout.layoutBox);
      const h = this.treeScale.x, f = this.treeScale.y;
      cc(this.layoutCorrected, this.treeScale, this.path, l), a.layout && !a.target && (this.treeScale.x !== 1 || this.treeScale.y !== 1) && (a.target = a.layout.layoutBox, a.targetWithTransforms = R());
      const { target: m } = a;
      if (!m) {
        this.prevProjectionDelta && (this.createProjectionDeltas(), this.scheduleRender());
        return;
      }
      !this.projectionDelta || !this.prevProjectionDelta ? this.createProjectionDeltas() : (Ri(this.prevProjectionDelta.x, this.projectionDelta.x), Ri(this.prevProjectionDelta.y, this.projectionDelta.y)), Ft(this.projectionDelta, this.layoutCorrected, m, this.latestValues), (this.treeScale.x !== h || this.treeScale.y !== f || !Oi(this.projectionDelta.x, this.prevProjectionDelta.x) || !Oi(this.projectionDelta.y, this.prevProjectionDelta.y)) && (this.hasProjected = !0, this.scheduleRender(), this.notifyListeners("projectionUpdate", m)), Et && at.recalculatedProjection++;
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
      this.prevProjectionDelta = pt(), this.projectionDelta = pt(), this.projectionDeltaWithTransform = pt();
    }
    setAnimationOrigin(r, a = !1) {
      const l = this.snapshot, c = l ? l.latestValues : {}, u = { ...this.latestValues }, d = pt();
      (!this.relativeParent || !this.relativeParent.options.layoutRoot) && (this.relativeTarget = this.relativeTargetOrigin = void 0), this.attemptToResolveRelativeTarget = !a;
      const h = R(), f = l ? l.source : void 0, m = this.layout ? this.layout.source : void 0, p = f !== m, y = this.getStack(), g = !y || y.members.length <= 1, x = !!(p && !g && this.options.crossfade === !0 && !this.path.some(Yc));
      this.animationProgress = 0;
      let b;
      this.mixTargetDelta = (P) => {
        const v = P / 1e3;
        Ki(d.x, r.x, v), Ki(d.y, r.y, v), this.setTargetDelta(d), this.relativeTarget && this.relativeTargetOrigin && this.layout && this.relativeParent && this.relativeParent.layout && (It(h, this.layout.layoutBox, this.relativeParent.layout.layoutBox), Hc(this.relativeTarget, this.relativeTargetOrigin, h, v), b && Ec(this.relativeTarget, b) && (this.isProjectionDirty = !1), b || (b = R()), _(b, this.relativeTarget)), p && (this.animationValues = u, Ac(u, c, this.latestValues, v, x, g)), this.root.scheduleUpdateProjection(), this.scheduleRender(), this.animationProgress = v;
      }, this.mixTargetDelta(this.options.layoutRoot ? 1e3 : 0);
    }
    startAnimation(r) {
      this.notifyListeners("animationStart"), this.currentAnimation && this.currentAnimation.stop(), this.resumingFrom && this.resumingFrom.currentAnimation && this.resumingFrom.currentAnimation.stop(), this.pendingAnimation && (nt(this.pendingAnimation), this.pendingAnimation = void 0), this.pendingAnimation = V.update(() => {
        Jt.hasAnimatedSinceResize = !0, this.currentAnimation = xc(0, ji, {
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
      this.currentAnimation && (this.mixTargetDelta && this.mixTargetDelta(ji), this.currentAnimation.stop()), this.completeAnimation();
    }
    applyTransformsToTarget() {
      const r = this.getLead();
      let { targetWithTransforms: a, target: l, layout: c, latestValues: u } = r;
      if (!(!a || !l || !c)) {
        if (this !== r && this.layout && c && Ar(this.options.animationType, this.layout.layoutBox, c.layoutBox)) {
          l = this.target || R();
          const d = j(this.layout.layoutBox.x);
          l.x.min = r.target.x.min, l.x.max = l.x.min + d;
          const h = j(this.layout.layoutBox.y);
          l.y.min = r.target.y.min, l.y.max = l.y.min + h;
        }
        _(a, l), yt(a, u), Ft(this.projectionDeltaWithTransform, this.layoutCorrected, a, u);
      }
    }
    registerSharedNode(r, a) {
      this.sharedNodes.has(r) || this.sharedNodes.set(r, new kc()), this.sharedNodes.get(r).add(a);
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
      l.z && Ve("z", r, c, this.animationValues);
      for (let u = 0; u < Ae.length; u++)
        Ve(`rotate${Ae[u]}`, r, c, this.animationValues), Ve(`skew${Ae[u]}`, r, c, this.animationValues);
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
        return Fc;
      const c = {
        visibility: ""
      }, u = this.getTransformTemplate();
      if (this.needsReset)
        return this.needsReset = !1, c.opacity = "", c.pointerEvents = qt(r?.pointerEvents) || "", c.transform = u ? u(this.latestValues, "") : "none", c;
      const d = this.getLead();
      if (!this.projectionDelta || !this.layout || !d.target) {
        const p = {};
        return this.options.layoutId && (p.opacity = this.latestValues.opacity !== void 0 ? this.latestValues.opacity : 1, p.pointerEvents = qt(r?.pointerEvents) || ""), this.hasProjected && !ot(this.latestValues) && (p.transform = u ? u({}, "") : "none", this.hasProjected = !1), p;
      }
      const h = d.animationValues || d.latestValues;
      this.applyTransformsToTarget(), c.transform = Lc(this.projectionDeltaWithTransform, this.treeScale, h), u && (c.transform = u(h, c.transform));
      const { x: f, y: m } = this.projectionDelta;
      c.transformOrigin = `${f.origin * 100}% ${m.origin * 100}% 0`, d.animationValues ? c.opacity = d === this ? (l = (a = h.opacity) !== null && a !== void 0 ? a : this.latestValues.opacity) !== null && l !== void 0 ? l : 1 : this.preserveOpacity ? this.latestValues.opacity : h.opacityExit : c.opacity = d === this ? h.opacity !== void 0 ? h.opacity : "" : h.opacityExit !== void 0 ? h.opacityExit : 0;
      for (const p in ee) {
        if (h[p] === void 0)
          continue;
        const { correct: y, applyTo: g } = ee[p], x = c.transform === "none" ? h[p] : y(h[p], d);
        if (g) {
          const b = g.length;
          for (let P = 0; P < b; P++)
            c[g[P]] = x;
        } else
          c[p] = x;
      }
      return this.options.layoutId && (c.pointerEvents = d === this ? qt(r?.pointerEvents) || "" : "none"), c;
    }
    clearSnapshot() {
      this.resumeFrom = this.snapshot = void 0;
    }
    // Only run on root
    resetTree() {
      this.root.nodes.forEach((r) => {
        var a;
        return (a = r.currentAnimation) === null || a === void 0 ? void 0 : a.stop();
      }), this.root.nodes.forEach(Ui), this.root.sharedNodes.clear();
    }
  };
}
function Bc(e) {
  e.updateLayout();
}
function Nc(e) {
  var t;
  const n = ((t = e.resumeFrom) === null || t === void 0 ? void 0 : t.snapshot) || e.snapshot;
  if (e.isLead() && e.layout && n && e.hasListeners("didUpdate")) {
    const { layoutBox: i, measuredBox: s } = e.layout, { animationType: o } = e.options, r = n.source !== e.layout.source;
    o === "size" ? K((d) => {
      const h = r ? n.measuredBox[d] : n.layoutBox[d], f = j(h);
      h.min = i[d].min, h.max = h.min + f;
    }) : Ar(o, n.layoutBox, i) && K((d) => {
      const h = r ? n.measuredBox[d] : n.layoutBox[d], f = j(i[d]);
      h.max = h.min + f, e.relativeTarget && !e.currentAnimation && (e.isProjectionDirty = !0, e.relativeTarget[d].max = e.relativeTarget[d].min + f);
    });
    const a = pt();
    Ft(a, i, n.layoutBox);
    const l = pt();
    r ? Ft(l, e.applyTransform(s, !0), n.measuredBox) : Ft(l, i, n.layoutBox);
    const c = !Tr(a);
    let u = !1;
    if (!e.resumeFrom) {
      const d = e.getClosestProjectingParent();
      if (d && !d.resumeFrom) {
        const { snapshot: h, layout: f } = d;
        if (h && f) {
          const m = R();
          It(m, n.layoutBox, h.layoutBox);
          const p = R();
          It(p, i, f.layoutBox), Sr(m, p) || (u = !0), d.options.layoutRoot && (e.relativeTarget = p, e.relativeTargetOrigin = m, e.relativeParent = d);
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
function Oc(e) {
  Et && at.totalNodes++, e.parent && (e.isProjecting() || (e.isProjectionDirty = e.parent.isProjectionDirty), e.isSharedProjectionDirty || (e.isSharedProjectionDirty = !!(e.isProjectionDirty || e.parent.isProjectionDirty || e.parent.isSharedProjectionDirty)), e.isTransformDirty || (e.isTransformDirty = e.parent.isTransformDirty));
}
function jc(e) {
  e.isProjectionDirty = e.isSharedProjectionDirty = e.isTransformDirty = !1;
}
function Uc(e) {
  e.clearSnapshot();
}
function Ui(e) {
  e.clearMeasurements();
}
function _c(e) {
  e.isLayoutDirty = !1;
}
function Kc(e) {
  const { visualElement: t } = e.options;
  t && t.getProps().onBeforeLayoutMeasure && t.notify("BeforeLayoutMeasure"), e.resetTransform();
}
function _i(e) {
  e.finishAnimation(), e.targetDelta = e.relativeTarget = e.target = void 0, e.isProjectionDirty = !0;
}
function $c(e) {
  e.resolveTargetDelta();
}
function zc(e) {
  e.calcProjection();
}
function Wc(e) {
  e.resetSkewAndRotation();
}
function Gc(e) {
  e.removeLeadSnapshot();
}
function Ki(e, t, n) {
  e.translate = D(t.translate, 0, n), e.scale = D(t.scale, 1, n), e.origin = t.origin, e.originPoint = t.originPoint;
}
function $i(e, t, n, i) {
  e.min = D(t.min, n.min, i), e.max = D(t.max, n.max, i);
}
function Hc(e, t, n, i) {
  $i(e.x, t.x, n.x, i), $i(e.y, t.y, n.y, i);
}
function Yc(e) {
  return e.animationValues && e.animationValues.opacityExit !== void 0;
}
const Xc = {
  duration: 0.45,
  ease: [0.4, 0, 0.1, 1]
}, zi = (e) => typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().includes(e), Wi = zi("applewebkit/") && !zi("chrome/") ? Math.round : O;
function Gi(e) {
  e.min = Wi(e.min), e.max = Wi(e.max);
}
function qc(e) {
  Gi(e.x), Gi(e.y);
}
function Ar(e, t, n) {
  return e === "position" || e === "preserve-aspect" && !Ql(Ni(t), Ni(n), 0.2);
}
function Zc(e) {
  var t;
  return e !== e.root && ((t = e.scroll) === null || t === void 0 ? void 0 : t.wasRoot);
}
const Jc = Pr({
  attachResizeListener: (e, t) => _t(e, "resize", t),
  measureScroll: () => ({
    x: document.documentElement.scrollLeft || document.body.scrollLeft,
    y: document.documentElement.scrollTop || document.body.scrollTop
  }),
  checkIsScrollRoot: () => !0
}), Ce = {
  current: void 0
}, Vr = Pr({
  measureScroll: (e) => ({
    x: e.scrollLeft,
    y: e.scrollTop
  }),
  defaultParent: () => {
    if (!Ce.current) {
      const e = new Jc({});
      e.mount(window), e.setOptions({ layoutScroll: !0 }), Ce.current = e;
    }
    return Ce.current;
  },
  resetTransform: (e, t) => {
    e.style.transform = t !== void 0 ? t : "none";
  },
  checkIsScrollRoot: (e) => window.getComputedStyle(e).position === "fixed"
}), Qc = {
  pan: {
    Feature: pc
  },
  drag: {
    Feature: mc,
    ProjectionNode: Vr,
    MeasureLayout: vr
  }
};
function Hi(e, t, n) {
  const { props: i } = e;
  e.animationState && i.whileHover && e.animationState.setActive("whileHover", n === "Start");
  const s = "onHover" + n, o = i[s];
  o && V.postRender(() => o(t, Wt(t)));
}
class tu extends st {
  mount() {
    const { current: t } = this.node;
    t && (this.unmount = Qo(t, (n) => (Hi(this.node, n, "Start"), (i) => Hi(this.node, i, "End"))));
  }
  unmount() {
  }
}
class eu extends st {
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
    this.unmount = zt(_t(this.node.current, "focus", () => this.onFocus()), _t(this.node.current, "blur", () => this.onBlur()));
  }
  unmount() {
  }
}
function Yi(e, t, n) {
  const { props: i } = e;
  e.animationState && i.whileTap && e.animationState.setActive("whileTap", n === "Start");
  const s = "onTap" + (n === "End" ? "" : n), o = i[s];
  o && V.postRender(() => o(t, Wt(t)));
}
class nu extends st {
  mount() {
    const { current: t } = this.node;
    t && (this.unmount = ia(t, (n) => (Yi(this.node, n, "Start"), (i, { success: s }) => Yi(this.node, i, s ? "End" : "Cancel")), { useGlobalTarget: this.node.props.globalTapTarget }));
  }
  unmount() {
  }
}
const We = /* @__PURE__ */ new WeakMap(), De = /* @__PURE__ */ new WeakMap(), iu = (e) => {
  const t = We.get(e.target);
  t && t(e);
}, su = (e) => {
  e.forEach(iu);
};
function ru({ root: e, ...t }) {
  const n = e || document;
  De.has(n) || De.set(n, {});
  const i = De.get(n), s = JSON.stringify(t);
  return i[s] || (i[s] = new IntersectionObserver(su, { root: e, ...t })), i[s];
}
function ou(e, t, n) {
  const i = ru(t);
  return We.set(e, n), i.observe(e), () => {
    We.delete(e), i.unobserve(e);
  };
}
const au = {
  some: 0,
  all: 1
};
class lu extends st {
  constructor() {
    super(...arguments), this.hasEnteredView = !1, this.isInView = !1;
  }
  startObserver() {
    this.unmount();
    const { viewport: t = {} } = this.node.getProps(), { root: n, margin: i, amount: s = "some", once: o } = t, r = {
      root: n ? n.current : void 0,
      rootMargin: i,
      threshold: typeof s == "number" ? s : au[s]
    }, a = (l) => {
      const { isIntersecting: c } = l;
      if (this.isInView === c || (this.isInView = c, o && !c && this.hasEnteredView))
        return;
      c && (this.hasEnteredView = !0), this.node.animationState && this.node.animationState.setActive("whileInView", c);
      const { onViewportEnter: u, onViewportLeave: d } = this.node.getProps(), h = c ? u : d;
      h && h(l);
    };
    return ou(this.node.current, r, a);
  }
  mount() {
    this.startObserver();
  }
  update() {
    if (typeof IntersectionObserver > "u")
      return;
    const { props: t, prevProps: n } = this.node;
    ["amount", "margin", "root"].some(cu(t, n)) && this.startObserver();
  }
  unmount() {
  }
}
function cu({ viewport: e = {} }, { viewport: t = {} } = {}) {
  return (n) => e[n] !== t[n];
}
const uu = {
  inView: {
    Feature: lu
  },
  tap: {
    Feature: nu
  },
  focus: {
    Feature: eu
  },
  hover: {
    Feature: tu
  }
}, du = {
  layout: {
    ProjectionNode: Vr,
    MeasureLayout: vr
  }
}, Ge = { current: null }, Cr = { current: !1 };
function hu() {
  if (Cr.current = !0, !!tn)
    if (window.matchMedia) {
      const e = window.matchMedia("(prefers-reduced-motion)"), t = () => Ge.current = e.matches;
      e.addListener(t), t();
    } else
      Ge.current = !1;
}
const fu = [...Js, F, it], mu = (e) => fu.find(Zs(e)), Xi = /* @__PURE__ */ new WeakMap();
function pu(e, t, n) {
  for (const i in t) {
    const s = t[i], o = n[i];
    if (B(s))
      e.addValue(i, s), process.env.NODE_ENV === "development" && le(s.version === "11.18.2", `Attempting to mix Motion versions ${s.version} with 11.18.2 may not work as expected.`);
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
const qi = [
  "AnimationStart",
  "AnimationComplete",
  "Update",
  "BeforeLayoutMeasure",
  "LayoutMeasure",
  "LayoutAnimationStart",
  "LayoutAnimationComplete"
];
class gu {
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
    this.current = null, this.children = /* @__PURE__ */ new Set(), this.isVariantNode = !1, this.isControllingVariants = !1, this.shouldReduceMotion = null, this.values = /* @__PURE__ */ new Map(), this.KeyframeResolver = Dn, this.features = {}, this.valueSubscriptions = /* @__PURE__ */ new Map(), this.prevMotionValues = {}, this.events = {}, this.propEventSubscriptions = {}, this.notifyUpdate = () => this.notify("Update", this.latestValues), this.render = () => {
      this.current && (this.triggerBuild(), this.renderInstance(this.current, this.renderState, this.props.style, this.projection));
    }, this.renderScheduledAt = 0, this.scheduleRender = () => {
      const f = H.now();
      this.renderScheduledAt < f && (this.renderScheduledAt = f, V.render(this.render, !1, !0));
    };
    const { latestValues: l, renderState: c, onUpdate: u } = r;
    this.onUpdate = u, this.latestValues = l, this.baseTarget = { ...l }, this.initialValues = n.initial ? { ...l } : {}, this.renderState = c, this.parent = t, this.props = n, this.presenceContext = i, this.depth = t ? t.depth + 1 : 0, this.reducedMotionConfig = s, this.options = a, this.blockInitialAnimation = !!o, this.isControllingVariants = de(n), this.isVariantNode = os(n), this.isVariantNode && (this.variantChildren = /* @__PURE__ */ new Set()), this.manuallyAnimateOnMount = !!(t && t.current);
    const { willChange: d, ...h } = this.scrapeMotionValuesFromProps(n, {}, this);
    for (const f in h) {
      const m = h[f];
      l[f] !== void 0 && B(m) && m.set(l[f], !1);
    }
  }
  mount(t) {
    this.current = t, Xi.set(t, this), this.projection && !this.projection.instance && this.projection.mount(t), this.parent && this.isVariantNode && !this.isControllingVariants && (this.removeFromVariantTree = this.parent.addVariantChild(this)), this.values.forEach((n, i) => this.bindToMotionValue(i, n)), Cr.current || hu(), this.shouldReduceMotion = this.reducedMotionConfig === "never" ? !1 : this.reducedMotionConfig === "always" ? !0 : Ge.current, process.env.NODE_ENV !== "production" && le(this.shouldReduceMotion !== !0, "You have Reduced Motion enabled on your device. Animations may not appear as expected."), this.parent && this.parent.children.add(this), this.update(this.props, this.presenceContext);
  }
  unmount() {
    Xi.delete(this.current), this.projection && this.projection.unmount(), nt(this.notifyUpdate), nt(this.render), this.valueSubscriptions.forEach((t) => t()), this.valueSubscriptions.clear(), this.removeFromVariantTree && this.removeFromVariantTree(), this.parent && this.parent.children.delete(this);
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
    const i = dt.has(t), s = n.on("change", (a) => {
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
    for (t in xt) {
      const n = xt[t];
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
    for (let i = 0; i < qi.length; i++) {
      const s = qi[i];
      this.propEventSubscriptions[s] && (this.propEventSubscriptions[s](), delete this.propEventSubscriptions[s]);
      const o = "on" + s, r = t[o];
      r && (this.propEventSubscriptions[s] = this.on(s, r));
    }
    this.prevMotionValues = pu(this, this.scrapeMotionValuesFromProps(t, this.prevProps, this), this.prevMotionValues), this.handleChildMotionValue && this.handleChildMotionValue(), this.onUpdate && this.onUpdate(this);
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
    return s != null && (typeof s == "string" && (Xs(s) || Us(s)) ? s = parseFloat(s) : !mu(s) && it.test(n) && (s = Gs(t, n)), this.setBaseTarget(t, B(s) ? s.get() : s)), B(s) ? s.get() : s;
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
      const r = ln(this.props, i, (n = this.presenceContext) === null || n === void 0 ? void 0 : n.custom);
      r && (s = r[t]);
    }
    if (i && s !== void 0)
      return s;
    const o = this.getBaseTargetFromProps(this.props, t);
    return o !== void 0 && !B(o) ? o : this.initialValues[t] !== void 0 && s === void 0 ? void 0 : this.baseTarget[t];
  }
  on(t, n) {
    return this.events[t] || (this.events[t] = new Sn()), this.events[t].add(n);
  }
  notify(t, ...n) {
    this.events[t] && this.events[t].notify(...n);
  }
}
class Dr extends gu {
  constructor() {
    super(...arguments), this.KeyframeResolver = Qs;
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
function yu(e) {
  return window.getComputedStyle(e);
}
class vu extends Dr {
  constructor() {
    super(...arguments), this.type = "html", this.renderInstance = ps;
  }
  readValueFromInstance(t, n) {
    if (dt.has(n)) {
      const i = Cn(n);
      return i && i.default || 0;
    } else {
      const i = yu(t), s = (hs(n) ? i.getPropertyValue(n) : i[n]) || 0;
      return typeof s == "string" ? s.trim() : s;
    }
  }
  measureInstanceViewportBox(t, { transformPagePoint: n }) {
    return gr(t, n);
  }
  build(t, n, i) {
    dn(t, n, i.transformTemplate);
  }
  scrapeMotionValuesFromProps(t, n, i) {
    return pn(t, n, i);
  }
}
class xu extends Dr {
  constructor() {
    super(...arguments), this.type = "svg", this.isSVGTag = !1, this.measureInstanceViewportBox = R;
  }
  getBaseTargetFromProps(t, n) {
    return t[n];
  }
  readValueFromInstance(t, n) {
    if (dt.has(n)) {
      const i = Cn(n);
      return i && i.default || 0;
    }
    return n = gs.has(n) ? n : rn(n), t.getAttribute(n);
  }
  scrapeMotionValuesFromProps(t, n, i) {
    return xs(t, n, i);
  }
  build(t, n, i) {
    hn(t, n, this.isSVGTag, i.transformTemplate);
  }
  renderInstance(t, n, i, s) {
    ys(t, n, i, s);
  }
  mount(t) {
    this.isSVGTag = mn(t.tagName), super.mount(t);
  }
}
const bu = (e, t) => an(e) ? new xu(t) : new vu(t, {
  allowProjection: e !== Qi
}), Tu = /* @__PURE__ */ Go({
  ...zl,
  ...uu,
  ...Qc,
  ...du
}, bu), z = /* @__PURE__ */ oo(Tu);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Su = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), Mr = (...e) => e.filter((t, n, i) => !!t && t.trim() !== "" && i.indexOf(t) === n).join(" ").trim();
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
var wu = {
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
const Pu = Ye(
  ({
    color: e = "currentColor",
    size: t = 24,
    strokeWidth: n = 2,
    absoluteStrokeWidth: i,
    className: s = "",
    children: o,
    iconNode: r,
    ...a
  }, l) => Qt(
    "svg",
    {
      ref: l,
      ...wu,
      width: t,
      height: t,
      stroke: e,
      strokeWidth: i ? Number(n) * 24 / Number(t) : n,
      className: Mr("lucide", s),
      ...a
    },
    [
      ...r.map(([c, u]) => Qt(c, u)),
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
const Vt = (e, t) => {
  const n = Ye(
    ({ className: i, ...s }, o) => Qt(Pu, {
      ref: o,
      iconNode: t,
      className: Mr(`lucide-${Su(e)}`, i),
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
const Au = Vt("Bell", [
  ["path", { d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", key: "1qo2s2" }],
  ["path", { d: "M10.3 21a1.94 1.94 0 0 0 3.4 0", key: "qgo35s" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Vu = Vt("Pause", [
  ["rect", { x: "14", y: "4", width: "4", height: "16", rx: "1", key: "zuxfzm" }],
  ["rect", { x: "6", y: "4", width: "4", height: "16", rx: "1", key: "1okwgv" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Cu = Vt("Play", [
  ["polygon", { points: "6 3 20 12 6 21 6 3", key: "1oa8hb" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Du = Vt("Plus", [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Mu = Vt("RotateCcw", [
  ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Ru = Vt("X", [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
]), Eu = [
  ["--tm-bg", "--theme-canvas"],
  ["--tm-surface", "--theme-surface"],
  ["--tm-fg", "--theme-ink"],
  ["--tm-dim", "--theme-ink-dim"],
  ["--tm-faint", "--theme-muted"],
  ["--tm-border", "--theme-border"],
  ["--tm-accent", "--theme-accent"],
  ["--tm-accent-fg", "--theme-accent-fg"]
], ku = [
  ["--tm-font-digit", "--theme-font-code"]
];
function Lu(e, t) {
  const n = getComputedStyle(document.documentElement);
  for (const [i, s] of [...Eu, ...ku]) {
    if (!t) {
      e.style.removeProperty(i);
      continue;
    }
    const o = n.getPropertyValue(s).trim();
    o && e.style.setProperty(i, o);
  }
}
function Fu(e) {
  const t = new MutationObserver(e);
  return t.observe(document.documentElement, {
    attributes: !0,
    attributeFilter: ["data-mode", "data-contrast", "style", "class"]
  }), () => t.disconnect();
}
function Iu() {
  const [e, t] = tt(() => /* @__PURE__ */ new Date()), [n, i] = tt(!1);
  return St(() => {
    const s = setInterval(() => t(/* @__PURE__ */ new Date()), 1e4);
    return () => clearInterval(s);
  }, []), /* @__PURE__ */ T(
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
const Bu = [15, 25, 30, 45, 60, 90, 120];
function Nu(e) {
  if (e < 60) return `${e}m`;
  const t = e / 60;
  return Number.isInteger(t) ? `${t}h` : `${t}h`;
}
function Ou({
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
        /* @__PURE__ */ T("span", { className: "tm-label", children: "Focus duration" }),
        /* @__PURE__ */ T("div", { className: "tm-presets", children: Bu.map((r) => /* @__PURE__ */ T(
          "button",
          {
            type: "button",
            className: "tm-preset",
            "data-selected": !i && o === r,
            onClick: () => {
              s(""), t(r);
            },
            children: Nu(r)
          },
          r
        )) }),
        /* @__PURE__ */ T("div", { className: "tm-row", children: /* @__PURE__ */ T(
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
        /* @__PURE__ */ T("button", { type: "button", className: "tm-primary", onClick: n, children: "Start focus" })
      ]
    }
  );
}
function ju({
  reminder: e,
  onDismiss: t
}) {
  return /* @__PURE__ */ T(
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
            /* @__PURE__ */ T(
              z.div,
              {
                className: "tm-alert-icon",
                animate: { scale: [1, 1.08, 1] },
                transition: { repeat: 1 / 0, duration: 1.6 },
                children: "⏰"
              }
            ),
            /* @__PURE__ */ E("div", { children: [
              /* @__PURE__ */ T("div", { style: { fontSize: 17, fontWeight: 600, marginBottom: 3 }, children: e.label }),
              /* @__PURE__ */ T("div", { className: "tm-reminder-sub", children: "Timer paused until you dismiss this" })
            ] }),
            /* @__PURE__ */ T("button", { type: "button", className: "tm-primary", style: { width: "100%" }, onClick: t, children: "Done" })
          ]
        }
      )
    }
  );
}
function Uu({
  reminders: e,
  onAdd: t,
  onRemove: n
}) {
  const [i, s] = tt(""), [o, r] = tt("30"), [a, l] = tt(!1), c = () => {
    const d = Number.parseInt(o, 10);
    !i.trim() || !Number.isFinite(d) || d <= 0 || (t(i, d), s(""), r("30"), l(!1));
  }, u = (d) => d.stopPropagation();
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
            /* @__PURE__ */ T(Au, { size: 12 }),
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
                /* @__PURE__ */ T(Du, { size: 12 }),
                "Add"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ E(Re, { mode: "popLayout", children: [
          a ? /* @__PURE__ */ E(
            z.div,
            {
              className: "tm-add",
              initial: { opacity: 0, height: 0 },
              animate: { opacity: 1, height: "auto" },
              exit: { opacity: 0, height: 0 },
              transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
              children: [
                /* @__PURE__ */ T(
                  "input",
                  {
                    autoFocus: !0,
                    type: "text",
                    placeholder: "e.g. Stand up and stretch",
                    value: i,
                    onChange: (d) => s(d.target.value),
                    onKeyDown: (d) => {
                      u(d), d.key === "Enter" && c(), d.key === "Escape" && l(!1);
                    }
                  }
                ),
                /* @__PURE__ */ E("div", { className: "tm-row", children: [
                  /* @__PURE__ */ T("span", { className: "tm-reminder-sub", children: "Every" }),
                  /* @__PURE__ */ T(
                    "input",
                    {
                      type: "number",
                      min: 1,
                      style: { width: 62, textAlign: "center" },
                      value: o,
                      onChange: (d) => r(d.target.value),
                      onKeyDown: (d) => {
                        u(d), d.key === "Enter" && c();
                      }
                    }
                  ),
                  /* @__PURE__ */ T("span", { className: "tm-reminder-sub", children: "min" })
                ] }),
                /* @__PURE__ */ E("div", { className: "tm-row", style: { marginTop: 2 }, children: [
                  /* @__PURE__ */ T(
                    "button",
                    {
                      type: "button",
                      className: "tm-primary",
                      style: { flex: 1, padding: "8px 0", fontSize: 13 },
                      onClick: c,
                      children: "Add"
                    }
                  ),
                  /* @__PURE__ */ T(
                    "button",
                    {
                      type: "button",
                      className: "tm-circle",
                      style: { width: "auto", height: "auto", padding: "8px 16px", borderRadius: 999 },
                      onClick: () => l(!1),
                      children: /* @__PURE__ */ T("span", { style: { fontSize: 13 }, children: "Cancel" })
                    }
                  )
                ] })
              ]
            },
            "add"
          ) : null,
          e.map((d) => /* @__PURE__ */ E(
            z.div,
            {
              className: "tm-reminder",
              initial: { opacity: 0, x: -6 },
              animate: { opacity: 1, x: 0 },
              exit: { opacity: 0, x: 6 },
              transition: { duration: 0.2 },
              children: [
                /* @__PURE__ */ E("div", { style: { display: "flex", flexDirection: "column" }, children: [
                  /* @__PURE__ */ T("span", { className: "tm-reminder-label", children: d.label }),
                  /* @__PURE__ */ E("span", { className: "tm-reminder-sub", children: [
                    "Every ",
                    d.intervalMinutes,
                    " min"
                  ] })
                ] }),
                /* @__PURE__ */ T(
                  "button",
                  {
                    type: "button",
                    className: "tm-ghost",
                    onClick: () => n(d.id),
                    title: "Remove reminder",
                    children: /* @__PURE__ */ T(Ru, { size: 13 })
                  }
                )
              ]
            },
            d.id
          ))
        ] }),
        e.length === 0 && !a ? /* @__PURE__ */ T("p", { className: "tm-reminder-sub", style: { textAlign: "center", padding: "8px 0" }, children: "No reminders set" }) : null
      ]
    }
  );
}
function Dt(e) {
  return e.toString().padStart(2, "0");
}
function _u({
  remainingSeconds: e,
  phase: t
}) {
  const n = Math.floor(e / 3600), i = Math.floor(e % 3600 / 60), s = e % 60, o = n > 0 ? `${Dt(n)}:${Dt(i)}:${Dt(s)}` : `${Dt(i)}:${Dt(s)}`;
  return /* @__PURE__ */ T(
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
function Ku({ engine: e }) {
  const t = Yr(
    (o) => e.subscribe(o),
    () => e.snapshot()
  ), n = q(null);
  St(() => {
    const o = n.current;
    if (!o) return;
    const r = () => Lu(o, t.inheritTheme);
    return r(), t.inheritTheme ? Fu(r) : void 0;
  }, [t.inheritTheme]);
  const i = t.activeReminderId != null ? t.reminders.find((o) => o.id === t.activeReminderId) ?? null : null, s = t.phase === "idle";
  return /* @__PURE__ */ E("div", { className: "agent-code-timer", ref: n, children: [
    /* @__PURE__ */ T(Iu, {}),
    /* @__PURE__ */ T(_u, { remainingSeconds: t.remainingSeconds, phase: t.phase }),
    /* @__PURE__ */ T(Re, { mode: "wait", children: s ? /* @__PURE__ */ E(
      z.div,
      {
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.2 },
        style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: "100%" },
        children: [
          /* @__PURE__ */ T(
            Ou,
            {
              totalSeconds: t.totalSeconds,
              onSelect: (o) => e.setDuration(o),
              onStart: () => e.start()
            }
          ),
          /* @__PURE__ */ T(
            Uu,
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
            t.phase === "running" ? /* @__PURE__ */ T(
              "button",
              {
                type: "button",
                className: "tm-circle",
                onClick: () => e.pause(),
                title: "Pause",
                children: /* @__PURE__ */ T(Vu, { size: 17 })
              }
            ) : null,
            t.phase === "paused" ? /* @__PURE__ */ T(
              "button",
              {
                type: "button",
                className: "tm-circle",
                onClick: () => e.resume(),
                title: "Resume",
                children: /* @__PURE__ */ T(Cu, { size: 17, style: { marginLeft: 2 } })
              }
            ) : null,
            /* @__PURE__ */ T("button", { type: "button", className: "tm-circle", onClick: () => e.reset(), title: "Reset", children: /* @__PURE__ */ T(Mu, { size: 17 }) })
          ] }),
          t.phase === "finished" ? /* @__PURE__ */ T(
            z.span,
            {
              className: "tm-reminder-sub",
              initial: { opacity: 0 },
              animate: { opacity: 1 },
              children: "Session complete"
            }
          ) : null,
          t.reminders.length > 0 && t.phase !== "finished" ? /* @__PURE__ */ T("div", { className: "tm-presets", style: { marginTop: 2 }, children: t.reminders.map((o) => /* @__PURE__ */ E("span", { className: "tm-chip", children: [
            o.label,
            " · ",
            o.intervalMinutes,
            "m"
          ] }, o.id)) }) : null
        ]
      },
      "running"
    ) }),
    /* @__PURE__ */ T("div", { className: "tm-footer", children: /* @__PURE__ */ E(
      "button",
      {
        type: "button",
        className: "tm-toggle",
        "data-on": t.inheritTheme,
        onClick: () => e.setInheritTheme(!t.inheritTheme),
        title: t.inheritTheme ? "Using Agent Code theme — click for black & white" : "Using black & white — click to inherit Agent Code theme",
        children: [
          /* @__PURE__ */ T("span", { className: "tm-toggle-dot" }),
          t.inheritTheme ? "Inheriting theme" : "Black & white"
        ]
      }
    ) }),
    /* @__PURE__ */ T(Re, { children: i ? /* @__PURE__ */ T(ju, { reminder: i, onDismiss: () => e.dismissReminder() }) : null })
  ] });
}
function $u(e) {
  return (t) => {
    Or();
    const n = Kr(t);
    return n.render(/* @__PURE__ */ T(Ku, { engine: e })), () => {
      queueMicrotask(() => n.unmount());
    };
  };
}
const Zi = "session";
let X = null;
async function ld(e) {
  const { api: t } = e;
  X = new Br({
    notify: (n) => {
      t.ui.showToast(n).catch(() => {
      });
    },
    save: (n) => {
      t.storage.set(Zi, n).catch(() => {
      });
    }
  }), e.subscriptions.push(
    e.registerView("timer.main", $u(X)),
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
    const n = await t.storage.get(Zi);
    X.restore(n);
  } catch {
  }
}
function cd() {
  X?.dispose(), X = null, jr();
}
export {
  ld as activate,
  cd as deactivate
};
