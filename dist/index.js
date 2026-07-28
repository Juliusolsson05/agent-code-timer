const Lm = [880, 1046, 1174], _m = 20, Fm = 2;
class Im {
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
      const n = (i, s) => {
        const o = t.createOscillator(), l = t.createGain();
        o.connect(l), l.connect(t.destination), o.type = "sine", o.frequency.value = s, l.gain.setValueAtTime(0.3, i), l.gain.exponentialRampToValueAtTime(0.01, i + 0.3), o.start(i), o.stop(i + 0.3);
      }, r = t.currentTime;
      for (let i = 0; i < _m; i += 1) {
        const s = r + i * Fm;
        Lm.forEach((o, l) => n(s + l * 0.35, o));
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
const Om = 250;
class zm {
  constructor(t) {
    this.host = t;
  }
  listeners = /* @__PURE__ */ new Set();
  interval = null;
  chime = new Im();
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
  restore(t) {
    !t || t.version !== 1 || (this.totalSeconds = t.totalSeconds, this.reminders = t.reminders ?? [], this.firedReminderKeys = new Set(t.firedReminderKeys ?? []), this.inheritTheme = t.inheritTheme ?? !1, t.phase === "running" && t.deadlineAt != null ? t.deadlineAt > Date.now() ? (this.deadlineAt = t.deadlineAt, this.phase = "running", this.startTicking()) : (this.phase = "finished", this.deadlineAt = null) : t.phase === "paused" && t.pausedElapsedSeconds != null ? (this.pausedElapsed = t.pausedElapsedSeconds, this.phase = "paused") : t.phase === "finished" && (this.phase = "finished"), this.emit());
  }
  dispose() {
    this.stopTicking(), this.chime.stop(), this.listeners.clear();
  }
  // ------------------------------------------------------------- subscription
  subscribe(t) {
    return this.listeners.add(t), () => {
      this.listeners.delete(t);
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
    const r = t.trim();
    !r || !Number.isFinite(n) || n <= 0 || (this.reminders = [
      ...this.reminders,
      {
        // crypto.randomUUID is available in the renderer; no dependency needed.
        id: crypto.randomUUID(),
        label: r,
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
    this.stopTicking(), this.interval = setInterval(() => this.tick(), Om);
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
      const r = n.intervalMinutes * 60;
      if (r <= 0) continue;
      const i = Math.floor(t / r);
      if (i < 1) continue;
      const s = `${n.id}:${i}`;
      if (!this.firedReminderKeys.has(s))
        return this.firedReminderKeys.add(s), n;
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
    const t = this.snapshot();
    for (const n of this.listeners)
      try {
        n(t);
      } catch {
      }
  }
}
const Um = '.agent-code-timer{--tm-bg: #000000;--tm-surface: #0d0d0d;--tm-fg: #ffffff;--tm-dim: #8a8a8a;--tm-faint: #4a4a4a;--tm-border: #262626;--tm-accent: #ffffff;--tm-accent-fg: #000000;--tm-radius: 14px;--tm-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;--tm-font-digit: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;position:relative;display:flex;flex-direction:column;align-items:center;gap:28px;padding:34px 32px 30px;background:var(--tm-bg);color:var(--tm-fg);font-family:var(--tm-font);margin:-1px;border-radius:inherit}.agent-code-timer *,.agent-code-timer *:before,.agent-code-timer *:after{box-sizing:border-box}.agent-code-timer button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;padding:0;outline:none}.agent-code-timer input{font-family:inherit;outline:none}.tm-clock{position:absolute;top:14px;left:18px;font-size:15px;font-weight:300;letter-spacing:-.01em;color:var(--tm-dim);transition:opacity .35s ease;user-select:none}.tm-clock[data-dimmed=true]{opacity:.15}.tm-digits{font-family:var(--tm-font-digit);font-size:72px;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em;user-select:none;transition:color .5s ease}.tm-digits[data-state=idle]{color:var(--tm-dim)}.tm-digits[data-state=finished]{color:var(--tm-faint)}.tm-label{font-size:11px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:var(--tm-dim)}.tm-presets{display:flex;flex-wrap:wrap;justify-content:center;gap:7px}.tm-preset{border-radius:999px;padding:7px 15px;font-size:13px;font-weight:500;background:var(--tm-surface);color:var(--tm-dim);border:1px solid var(--tm-border);transition:all .18s ease}.tm-preset:hover{color:var(--tm-fg)}.tm-preset[data-selected=true]{background:var(--tm-accent);color:var(--tm-accent-fg);border-color:var(--tm-accent)}.tm-custom{width:108px;border-radius:10px;border:1px solid var(--tm-border);background:var(--tm-surface);color:var(--tm-fg);padding:8px 12px;text-align:center;font-size:13px}.tm-custom::placeholder{color:var(--tm-faint)}.tm-row{display:flex;align-items:center;gap:10px}.tm-primary{border-radius:999px;padding:11px 34px;font-size:14px;font-weight:500;background:var(--tm-accent);color:var(--tm-accent-fg);transition:opacity .18s ease,transform .12s ease}.tm-primary:hover{opacity:.88}.tm-primary:active{transform:scale(.97)}.tm-circle{width:46px;height:46px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:var(--tm-surface);border:1px solid var(--tm-border);color:var(--tm-fg);transition:background .18s ease,transform .12s ease}.tm-circle:hover{background:var(--tm-border)}.tm-circle:active{transform:scale(.95)}.tm-ghost{font-size:12px;color:var(--tm-dim);transition:color .18s ease}.tm-ghost:hover{color:var(--tm-fg)}.tm-reminders{width:100%;max-width:330px}.tm-reminders-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.tm-reminder{display:flex;align-items:center;justify-content:space-between;padding:10px 13px;border-radius:var(--tm-radius);background:var(--tm-surface);border:1px solid var(--tm-border);margin-bottom:6px}.tm-reminder-label{font-size:13px;color:var(--tm-fg)}.tm-reminder-sub{font-size:11px;color:var(--tm-dim)}.tm-add{display:flex;flex-direction:column;gap:8px;padding:13px;border-radius:var(--tm-radius);background:var(--tm-surface);border:1px solid var(--tm-border);margin-bottom:8px}.tm-add input{border-radius:9px;border:1px solid var(--tm-border);background:var(--tm-bg);color:var(--tm-fg);padding:7px 10px;font-size:13px}.tm-chip{font-size:11px;color:var(--tm-dim);background:var(--tm-surface);border:1px solid var(--tm-border);border-radius:999px;padding:4px 11px}.tm-alert{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--tm-bg) 88%,transparent);backdrop-filter:blur(6px);border-radius:inherit}.tm-alert-card{display:flex;flex-direction:column;align-items:center;gap:18px;padding:32px 36px;border-radius:22px;background:var(--tm-surface);border:1px solid var(--tm-border);max-width:300px;text-align:center}.tm-alert-icon{width:56px;height:56px;border-radius:999px;background:var(--tm-accent);color:var(--tm-accent-fg);display:flex;align-items:center;justify-content:center;font-size:26px}.tm-footer{display:flex;align-items:center;justify-content:center;gap:8px;padding-top:2px}.tm-toggle{display:inline-flex;align-items:center;gap:7px;font-size:11px;color:var(--tm-faint);transition:color .18s ease}.tm-toggle:hover{color:var(--tm-dim)}.tm-toggle-dot{width:7px;height:7px;border-radius:999px;border:1px solid currentColor}.tm-toggle[data-on=true] .tm-toggle-dot{background:currentColor}', Mo = "agent-code-timer-styles";
function Bm() {
  if (document.getElementById(Mo)) return;
  const e = document.createElement("style");
  e.id = Mo, e.textContent = Um, document.head.append(e);
}
function $m() {
  document.getElementById(Mo)?.remove();
}
var Kf = { exports: {} }, $l = {};
/**
 * @license React
 * react-jsx-dev-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var Wm = Symbol.for("react.fragment");
$l.Fragment = Wm;
$l.jsxDEV = void 0;
Kf.exports = $l;
var V = Kf.exports, Hf = { exports: {} }, Ae = {}, bf = { exports: {} }, _ = {};
/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var qr = Symbol.for("react.element"), Km = Symbol.for("react.portal"), Hm = Symbol.for("react.fragment"), bm = Symbol.for("react.strict_mode"), Gm = Symbol.for("react.profiler"), Qm = Symbol.for("react.provider"), Ym = Symbol.for("react.context"), Xm = Symbol.for("react.forward_ref"), Zm = Symbol.for("react.suspense"), qm = Symbol.for("react.memo"), Jm = Symbol.for("react.lazy"), yu = Symbol.iterator;
function eg(e) {
  return e === null || typeof e != "object" ? null : (e = yu && e[yu] || e["@@iterator"], typeof e == "function" ? e : null);
}
var Gf = { isMounted: function() {
  return !1;
}, enqueueForceUpdate: function() {
}, enqueueReplaceState: function() {
}, enqueueSetState: function() {
} }, Qf = Object.assign, Yf = {};
function Gn(e, t, n) {
  this.props = e, this.context = t, this.refs = Yf, this.updater = n || Gf;
}
Gn.prototype.isReactComponent = {};
Gn.prototype.setState = function(e, t) {
  if (typeof e != "object" && typeof e != "function" && e != null) throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
  this.updater.enqueueSetState(this, e, t, "setState");
};
Gn.prototype.forceUpdate = function(e) {
  this.updater.enqueueForceUpdate(this, e, "forceUpdate");
};
function Xf() {
}
Xf.prototype = Gn.prototype;
function Wl(e, t, n) {
  this.props = e, this.context = t, this.refs = Yf, this.updater = n || Gf;
}
var Kl = Wl.prototype = new Xf();
Kl.constructor = Wl;
Qf(Kl, Gn.prototype);
Kl.isPureReactComponent = !0;
var xu = Array.isArray, Zf = Object.prototype.hasOwnProperty, Hl = { current: null }, qf = { key: !0, ref: !0, __self: !0, __source: !0 };
function Jf(e, t, n) {
  var r, i = {}, s = null, o = null;
  if (t != null) for (r in t.ref !== void 0 && (o = t.ref), t.key !== void 0 && (s = "" + t.key), t) Zf.call(t, r) && !qf.hasOwnProperty(r) && (i[r] = t[r]);
  var l = arguments.length - 2;
  if (l === 1) i.children = n;
  else if (1 < l) {
    for (var a = Array(l), u = 0; u < l; u++) a[u] = arguments[u + 2];
    i.children = a;
  }
  if (e && e.defaultProps) for (r in l = e.defaultProps, l) i[r] === void 0 && (i[r] = l[r]);
  return { $$typeof: qr, type: e, key: s, ref: o, props: i, _owner: Hl.current };
}
function tg(e, t) {
  return { $$typeof: qr, type: e.type, key: t, ref: e.ref, props: e.props, _owner: e._owner };
}
function bl(e) {
  return typeof e == "object" && e !== null && e.$$typeof === qr;
}
function ng(e) {
  var t = { "=": "=0", ":": "=2" };
  return "$" + e.replace(/[=:]/g, function(n) {
    return t[n];
  });
}
var wu = /\/+/g;
function bs(e, t) {
  return typeof e == "object" && e !== null && e.key != null ? ng("" + e.key) : t.toString(36);
}
function Ai(e, t, n, r, i) {
  var s = typeof e;
  (s === "undefined" || s === "boolean") && (e = null);
  var o = !1;
  if (e === null) o = !0;
  else switch (s) {
    case "string":
    case "number":
      o = !0;
      break;
    case "object":
      switch (e.$$typeof) {
        case qr:
        case Km:
          o = !0;
      }
  }
  if (o) return o = e, i = i(o), e = r === "" ? "." + bs(o, 0) : r, xu(i) ? (n = "", e != null && (n = e.replace(wu, "$&/") + "/"), Ai(i, t, n, "", function(u) {
    return u;
  })) : i != null && (bl(i) && (i = tg(i, n + (!i.key || o && o.key === i.key ? "" : ("" + i.key).replace(wu, "$&/") + "/") + e)), t.push(i)), 1;
  if (o = 0, r = r === "" ? "." : r + ":", xu(e)) for (var l = 0; l < e.length; l++) {
    s = e[l];
    var a = r + bs(s, l);
    o += Ai(s, t, n, a, i);
  }
  else if (a = eg(e), typeof a == "function") for (e = a.call(e), l = 0; !(s = e.next()).done; ) s = s.value, a = r + bs(s, l++), o += Ai(s, t, n, a, i);
  else if (s === "object") throw t = String(e), Error("Objects are not valid as a React child (found: " + (t === "[object Object]" ? "object with keys {" + Object.keys(e).join(", ") + "}" : t) + "). If you meant to render a collection of children, use an array instead.");
  return o;
}
function ci(e, t, n) {
  if (e == null) return e;
  var r = [], i = 0;
  return Ai(e, r, "", "", function(s) {
    return t.call(n, s, i++);
  }), r;
}
function rg(e) {
  if (e._status === -1) {
    var t = e._result;
    t = t(), t.then(function(n) {
      (e._status === 0 || e._status === -1) && (e._status = 1, e._result = n);
    }, function(n) {
      (e._status === 0 || e._status === -1) && (e._status = 2, e._result = n);
    }), e._status === -1 && (e._status = 0, e._result = t);
  }
  if (e._status === 1) return e._result.default;
  throw e._result;
}
var ye = { current: null }, Mi = { transition: null }, ig = { ReactCurrentDispatcher: ye, ReactCurrentBatchConfig: Mi, ReactCurrentOwner: Hl };
function ed() {
  throw Error("act(...) is not supported in production builds of React.");
}
_.Children = { map: ci, forEach: function(e, t, n) {
  ci(e, function() {
    t.apply(this, arguments);
  }, n);
}, count: function(e) {
  var t = 0;
  return ci(e, function() {
    t++;
  }), t;
}, toArray: function(e) {
  return ci(e, function(t) {
    return t;
  }) || [];
}, only: function(e) {
  if (!bl(e)) throw Error("React.Children.only expected to receive a single React element child.");
  return e;
} };
_.Component = Gn;
_.Fragment = Hm;
_.Profiler = Gm;
_.PureComponent = Wl;
_.StrictMode = bm;
_.Suspense = Zm;
_.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ig;
_.act = ed;
_.cloneElement = function(e, t, n) {
  if (e == null) throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + e + ".");
  var r = Qf({}, e.props), i = e.key, s = e.ref, o = e._owner;
  if (t != null) {
    if (t.ref !== void 0 && (s = t.ref, o = Hl.current), t.key !== void 0 && (i = "" + t.key), e.type && e.type.defaultProps) var l = e.type.defaultProps;
    for (a in t) Zf.call(t, a) && !qf.hasOwnProperty(a) && (r[a] = t[a] === void 0 && l !== void 0 ? l[a] : t[a]);
  }
  var a = arguments.length - 2;
  if (a === 1) r.children = n;
  else if (1 < a) {
    l = Array(a);
    for (var u = 0; u < a; u++) l[u] = arguments[u + 2];
    r.children = l;
  }
  return { $$typeof: qr, type: e.type, key: i, ref: s, props: r, _owner: o };
};
_.createContext = function(e) {
  return e = { $$typeof: Ym, _currentValue: e, _currentValue2: e, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null }, e.Provider = { $$typeof: Qm, _context: e }, e.Consumer = e;
};
_.createElement = Jf;
_.createFactory = function(e) {
  var t = Jf.bind(null, e);
  return t.type = e, t;
};
_.createRef = function() {
  return { current: null };
};
_.forwardRef = function(e) {
  return { $$typeof: Xm, render: e };
};
_.isValidElement = bl;
_.lazy = function(e) {
  return { $$typeof: Jm, _payload: { _status: -1, _result: e }, _init: rg };
};
_.memo = function(e, t) {
  return { $$typeof: qm, type: e, compare: t === void 0 ? null : t };
};
_.startTransition = function(e) {
  var t = Mi.transition;
  Mi.transition = {};
  try {
    e();
  } finally {
    Mi.transition = t;
  }
};
_.unstable_act = ed;
_.useCallback = function(e, t) {
  return ye.current.useCallback(e, t);
};
_.useContext = function(e) {
  return ye.current.useContext(e);
};
_.useDebugValue = function() {
};
_.useDeferredValue = function(e) {
  return ye.current.useDeferredValue(e);
};
_.useEffect = function(e, t) {
  return ye.current.useEffect(e, t);
};
_.useId = function() {
  return ye.current.useId();
};
_.useImperativeHandle = function(e, t, n) {
  return ye.current.useImperativeHandle(e, t, n);
};
_.useInsertionEffect = function(e, t) {
  return ye.current.useInsertionEffect(e, t);
};
_.useLayoutEffect = function(e, t) {
  return ye.current.useLayoutEffect(e, t);
};
_.useMemo = function(e, t) {
  return ye.current.useMemo(e, t);
};
_.useReducer = function(e, t, n) {
  return ye.current.useReducer(e, t, n);
};
_.useRef = function(e) {
  return ye.current.useRef(e);
};
_.useState = function(e) {
  return ye.current.useState(e);
};
_.useSyncExternalStore = function(e, t, n) {
  return ye.current.useSyncExternalStore(e, t, n);
};
_.useTransition = function() {
  return ye.current.useTransition();
};
_.version = "18.3.1";
bf.exports = _;
var P = bf.exports, td = { exports: {} }, nd = {};
/**
 * @license React
 * scheduler.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
(function(e) {
  function t(C, M) {
    var j = C.length;
    C.push(M);
    e: for (; 0 < j; ) {
      var Y = j - 1 >>> 1, re = C[Y];
      if (0 < i(re, M)) C[Y] = M, C[j] = re, j = Y;
      else break e;
    }
  }
  function n(C) {
    return C.length === 0 ? null : C[0];
  }
  function r(C) {
    if (C.length === 0) return null;
    var M = C[0], j = C.pop();
    if (j !== M) {
      C[0] = j;
      e: for (var Y = 0, re = C.length, ai = re >>> 1; Y < ai; ) {
        var Kt = 2 * (Y + 1) - 1, Hs = C[Kt], Ht = Kt + 1, ui = C[Ht];
        if (0 > i(Hs, j)) Ht < re && 0 > i(ui, Hs) ? (C[Y] = ui, C[Ht] = j, Y = Ht) : (C[Y] = Hs, C[Kt] = j, Y = Kt);
        else if (Ht < re && 0 > i(ui, j)) C[Y] = ui, C[Ht] = j, Y = Ht;
        else break e;
      }
    }
    return M;
  }
  function i(C, M) {
    var j = C.sortIndex - M.sortIndex;
    return j !== 0 ? j : C.id - M.id;
  }
  if (typeof performance == "object" && typeof performance.now == "function") {
    var s = performance;
    e.unstable_now = function() {
      return s.now();
    };
  } else {
    var o = Date, l = o.now();
    e.unstable_now = function() {
      return o.now() - l;
    };
  }
  var a = [], u = [], c = 1, f = null, d = 3, g = !1, v = !1, y = !1, S = typeof setTimeout == "function" ? setTimeout : null, p = typeof clearTimeout == "function" ? clearTimeout : null, h = typeof setImmediate < "u" ? setImmediate : null;
  typeof navigator < "u" && navigator.scheduling !== void 0 && navigator.scheduling.isInputPending !== void 0 && navigator.scheduling.isInputPending.bind(navigator.scheduling);
  function m(C) {
    for (var M = n(u); M !== null; ) {
      if (M.callback === null) r(u);
      else if (M.startTime <= C) r(u), M.sortIndex = M.expirationTime, t(a, M);
      else break;
      M = n(u);
    }
  }
  function x(C) {
    if (y = !1, m(C), !v) if (n(a) !== null) v = !0, li(w);
    else {
      var M = n(u);
      M !== null && J(x, M.startTime - C);
    }
  }
  function w(C, M) {
    v = !1, y && (y = !1, p(k), k = -1), g = !0;
    var j = d;
    try {
      for (m(M), f = n(a); f !== null && (!(f.expirationTime > M) || C && !ne()); ) {
        var Y = f.callback;
        if (typeof Y == "function") {
          f.callback = null, d = f.priorityLevel;
          var re = Y(f.expirationTime <= M);
          M = e.unstable_now(), typeof re == "function" ? f.callback = re : f === n(a) && r(a), m(M);
        } else r(a);
        f = n(a);
      }
      if (f !== null) var ai = !0;
      else {
        var Kt = n(u);
        Kt !== null && J(x, Kt.startTime - M), ai = !1;
      }
      return ai;
    } finally {
      f = null, d = j, g = !1;
    }
  }
  var E = !1, D = null, k = -1, L = 5, A = -1;
  function ne() {
    return !(e.unstable_now() - A < L);
  }
  function yt() {
    if (D !== null) {
      var C = e.unstable_now();
      A = C;
      var M = !0;
      try {
        M = D(!0, C);
      } finally {
        M ? Wt() : (E = !1, D = null);
      }
    } else E = !1;
  }
  var Wt;
  if (typeof h == "function") Wt = function() {
    h(yt);
  };
  else if (typeof MessageChannel < "u") {
    var Jn = new MessageChannel(), vu = Jn.port2;
    Jn.port1.onmessage = yt, Wt = function() {
      vu.postMessage(null);
    };
  } else Wt = function() {
    S(yt, 0);
  };
  function li(C) {
    D = C, E || (E = !0, Wt());
  }
  function J(C, M) {
    k = S(function() {
      C(e.unstable_now());
    }, M);
  }
  e.unstable_IdlePriority = 5, e.unstable_ImmediatePriority = 1, e.unstable_LowPriority = 4, e.unstable_NormalPriority = 3, e.unstable_Profiling = null, e.unstable_UserBlockingPriority = 2, e.unstable_cancelCallback = function(C) {
    C.callback = null;
  }, e.unstable_continueExecution = function() {
    v || g || (v = !0, li(w));
  }, e.unstable_forceFrameRate = function(C) {
    0 > C || 125 < C ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : L = 0 < C ? Math.floor(1e3 / C) : 5;
  }, e.unstable_getCurrentPriorityLevel = function() {
    return d;
  }, e.unstable_getFirstCallbackNode = function() {
    return n(a);
  }, e.unstable_next = function(C) {
    switch (d) {
      case 1:
      case 2:
      case 3:
        var M = 3;
        break;
      default:
        M = d;
    }
    var j = d;
    d = M;
    try {
      return C();
    } finally {
      d = j;
    }
  }, e.unstable_pauseExecution = function() {
  }, e.unstable_requestPaint = function() {
  }, e.unstable_runWithPriority = function(C, M) {
    switch (C) {
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
        break;
      default:
        C = 3;
    }
    var j = d;
    d = C;
    try {
      return M();
    } finally {
      d = j;
    }
  }, e.unstable_scheduleCallback = function(C, M, j) {
    var Y = e.unstable_now();
    switch (typeof j == "object" && j !== null ? (j = j.delay, j = typeof j == "number" && 0 < j ? Y + j : Y) : j = Y, C) {
      case 1:
        var re = -1;
        break;
      case 2:
        re = 250;
        break;
      case 5:
        re = 1073741823;
        break;
      case 4:
        re = 1e4;
        break;
      default:
        re = 5e3;
    }
    return re = j + re, C = { id: c++, callback: M, priorityLevel: C, startTime: j, expirationTime: re, sortIndex: -1 }, j > Y ? (C.sortIndex = j, t(u, C), n(a) === null && C === n(u) && (y ? (p(k), k = -1) : y = !0, J(x, j - Y))) : (C.sortIndex = re, t(a, C), v || g || (v = !0, li(w))), C;
  }, e.unstable_shouldYield = ne, e.unstable_wrapCallback = function(C) {
    var M = d;
    return function() {
      var j = d;
      d = M;
      try {
        return C.apply(this, arguments);
      } finally {
        d = j;
      }
    };
  };
})(nd);
td.exports = nd;
var sg = td.exports;
/**
 * @license React
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var og = P, Ve = sg;
function T(e) {
  for (var t = "https://reactjs.org/docs/error-decoder.html?invariant=" + e, n = 1; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
  return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
}
var rd = /* @__PURE__ */ new Set(), Rr = {};
function cn(e, t) {
  In(e, t), In(e + "Capture", t);
}
function In(e, t) {
  for (Rr[e] = t, e = 0; e < t.length; e++) rd.add(t[e]);
}
var dt = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), jo = Object.prototype.hasOwnProperty, lg = /^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/, Su = {}, ku = {};
function ag(e) {
  return jo.call(ku, e) ? !0 : jo.call(Su, e) ? !1 : lg.test(e) ? ku[e] = !0 : (Su[e] = !0, !1);
}
function ug(e, t, n, r) {
  if (n !== null && n.type === 0) return !1;
  switch (typeof t) {
    case "function":
    case "symbol":
      return !0;
    case "boolean":
      return r ? !1 : n !== null ? !n.acceptsBooleans : (e = e.toLowerCase().slice(0, 5), e !== "data-" && e !== "aria-");
    default:
      return !1;
  }
}
function cg(e, t, n, r) {
  if (t === null || typeof t > "u" || ug(e, t, n, r)) return !0;
  if (r) return !1;
  if (n !== null) switch (n.type) {
    case 3:
      return !t;
    case 4:
      return t === !1;
    case 5:
      return isNaN(t);
    case 6:
      return isNaN(t) || 1 > t;
  }
  return !1;
}
function xe(e, t, n, r, i, s, o) {
  this.acceptsBooleans = t === 2 || t === 3 || t === 4, this.attributeName = r, this.attributeNamespace = i, this.mustUseProperty = n, this.propertyName = e, this.type = t, this.sanitizeURL = s, this.removeEmptyString = o;
}
var ue = {};
"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(e) {
  ue[e] = new xe(e, 0, !1, e, null, !1, !1);
});
[["acceptCharset", "accept-charset"], ["className", "class"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"]].forEach(function(e) {
  var t = e[0];
  ue[t] = new xe(t, 1, !1, e[1], null, !1, !1);
});
["contentEditable", "draggable", "spellCheck", "value"].forEach(function(e) {
  ue[e] = new xe(e, 2, !1, e.toLowerCase(), null, !1, !1);
});
["autoReverse", "externalResourcesRequired", "focusable", "preserveAlpha"].forEach(function(e) {
  ue[e] = new xe(e, 2, !1, e, null, !1, !1);
});
"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(e) {
  ue[e] = new xe(e, 3, !1, e.toLowerCase(), null, !1, !1);
});
["checked", "multiple", "muted", "selected"].forEach(function(e) {
  ue[e] = new xe(e, 3, !0, e, null, !1, !1);
});
["capture", "download"].forEach(function(e) {
  ue[e] = new xe(e, 4, !1, e, null, !1, !1);
});
["cols", "rows", "size", "span"].forEach(function(e) {
  ue[e] = new xe(e, 6, !1, e, null, !1, !1);
});
["rowSpan", "start"].forEach(function(e) {
  ue[e] = new xe(e, 5, !1, e.toLowerCase(), null, !1, !1);
});
var Gl = /[\-:]([a-z])/g;
function Ql(e) {
  return e[1].toUpperCase();
}
"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e) {
  var t = e.replace(
    Gl,
    Ql
  );
  ue[t] = new xe(t, 1, !1, e, null, !1, !1);
});
"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e) {
  var t = e.replace(Gl, Ql);
  ue[t] = new xe(t, 1, !1, e, "http://www.w3.org/1999/xlink", !1, !1);
});
["xml:base", "xml:lang", "xml:space"].forEach(function(e) {
  var t = e.replace(Gl, Ql);
  ue[t] = new xe(t, 1, !1, e, "http://www.w3.org/XML/1998/namespace", !1, !1);
});
["tabIndex", "crossOrigin"].forEach(function(e) {
  ue[e] = new xe(e, 1, !1, e.toLowerCase(), null, !1, !1);
});
ue.xlinkHref = new xe("xlinkHref", 1, !1, "xlink:href", "http://www.w3.org/1999/xlink", !0, !1);
["src", "href", "action", "formAction"].forEach(function(e) {
  ue[e] = new xe(e, 1, !1, e.toLowerCase(), null, !0, !0);
});
function Yl(e, t, n, r) {
  var i = ue.hasOwnProperty(t) ? ue[t] : null;
  (i !== null ? i.type !== 0 : r || !(2 < t.length) || t[0] !== "o" && t[0] !== "O" || t[1] !== "n" && t[1] !== "N") && (cg(t, n, i, r) && (n = null), r || i === null ? ag(t) && (n === null ? e.removeAttribute(t) : e.setAttribute(t, "" + n)) : i.mustUseProperty ? e[i.propertyName] = n === null ? i.type === 3 ? !1 : "" : n : (t = i.attributeName, r = i.attributeNamespace, n === null ? e.removeAttribute(t) : (i = i.type, n = i === 3 || i === 4 && n === !0 ? "" : "" + n, r ? e.setAttributeNS(r, t, n) : e.setAttribute(t, n))));
}
var vt = og.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED, fi = Symbol.for("react.element"), pn = Symbol.for("react.portal"), mn = Symbol.for("react.fragment"), Xl = Symbol.for("react.strict_mode"), Lo = Symbol.for("react.profiler"), id = Symbol.for("react.provider"), sd = Symbol.for("react.context"), Zl = Symbol.for("react.forward_ref"), _o = Symbol.for("react.suspense"), Fo = Symbol.for("react.suspense_list"), ql = Symbol.for("react.memo"), St = Symbol.for("react.lazy"), od = Symbol.for("react.offscreen"), Tu = Symbol.iterator;
function er(e) {
  return e === null || typeof e != "object" ? null : (e = Tu && e[Tu] || e["@@iterator"], typeof e == "function" ? e : null);
}
var b = Object.assign, Gs;
function cr(e) {
  if (Gs === void 0) try {
    throw Error();
  } catch (n) {
    var t = n.stack.trim().match(/\n( *(at )?)/);
    Gs = t && t[1] || "";
  }
  return `
` + Gs + e;
}
var Qs = !1;
function Ys(e, t) {
  if (!e || Qs) return "";
  Qs = !0;
  var n = Error.prepareStackTrace;
  Error.prepareStackTrace = void 0;
  try {
    if (t) if (t = function() {
      throw Error();
    }, Object.defineProperty(t.prototype, "props", { set: function() {
      throw Error();
    } }), typeof Reflect == "object" && Reflect.construct) {
      try {
        Reflect.construct(t, []);
      } catch (u) {
        var r = u;
      }
      Reflect.construct(e, [], t);
    } else {
      try {
        t.call();
      } catch (u) {
        r = u;
      }
      e.call(t.prototype);
    }
    else {
      try {
        throw Error();
      } catch (u) {
        r = u;
      }
      e();
    }
  } catch (u) {
    if (u && r && typeof u.stack == "string") {
      for (var i = u.stack.split(`
`), s = r.stack.split(`
`), o = i.length - 1, l = s.length - 1; 1 <= o && 0 <= l && i[o] !== s[l]; ) l--;
      for (; 1 <= o && 0 <= l; o--, l--) if (i[o] !== s[l]) {
        if (o !== 1 || l !== 1)
          do
            if (o--, l--, 0 > l || i[o] !== s[l]) {
              var a = `
` + i[o].replace(" at new ", " at ");
              return e.displayName && a.includes("<anonymous>") && (a = a.replace("<anonymous>", e.displayName)), a;
            }
          while (1 <= o && 0 <= l);
        break;
      }
    }
  } finally {
    Qs = !1, Error.prepareStackTrace = n;
  }
  return (e = e ? e.displayName || e.name : "") ? cr(e) : "";
}
function fg(e) {
  switch (e.tag) {
    case 5:
      return cr(e.type);
    case 16:
      return cr("Lazy");
    case 13:
      return cr("Suspense");
    case 19:
      return cr("SuspenseList");
    case 0:
    case 2:
    case 15:
      return e = Ys(e.type, !1), e;
    case 11:
      return e = Ys(e.type.render, !1), e;
    case 1:
      return e = Ys(e.type, !0), e;
    default:
      return "";
  }
}
function Io(e) {
  if (e == null) return null;
  if (typeof e == "function") return e.displayName || e.name || null;
  if (typeof e == "string") return e;
  switch (e) {
    case mn:
      return "Fragment";
    case pn:
      return "Portal";
    case Lo:
      return "Profiler";
    case Xl:
      return "StrictMode";
    case _o:
      return "Suspense";
    case Fo:
      return "SuspenseList";
  }
  if (typeof e == "object") switch (e.$$typeof) {
    case sd:
      return (e.displayName || "Context") + ".Consumer";
    case id:
      return (e._context.displayName || "Context") + ".Provider";
    case Zl:
      var t = e.render;
      return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
    case ql:
      return t = e.displayName || null, t !== null ? t : Io(e.type) || "Memo";
    case St:
      t = e._payload, e = e._init;
      try {
        return Io(e(t));
      } catch {
      }
  }
  return null;
}
function dg(e) {
  var t = e.type;
  switch (e.tag) {
    case 24:
      return "Cache";
    case 9:
      return (t.displayName || "Context") + ".Consumer";
    case 10:
      return (t._context.displayName || "Context") + ".Provider";
    case 18:
      return "DehydratedFragment";
    case 11:
      return e = t.render, e = e.displayName || e.name || "", t.displayName || (e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef");
    case 7:
      return "Fragment";
    case 5:
      return t;
    case 4:
      return "Portal";
    case 3:
      return "Root";
    case 6:
      return "Text";
    case 16:
      return Io(t);
    case 8:
      return t === Xl ? "StrictMode" : "Mode";
    case 22:
      return "Offscreen";
    case 12:
      return "Profiler";
    case 21:
      return "Scope";
    case 13:
      return "Suspense";
    case 19:
      return "SuspenseList";
    case 25:
      return "TracingMarker";
    case 1:
    case 0:
    case 17:
    case 2:
    case 14:
    case 15:
      if (typeof t == "function") return t.displayName || t.name || null;
      if (typeof t == "string") return t;
  }
  return null;
}
function _t(e) {
  switch (typeof e) {
    case "boolean":
    case "number":
    case "string":
    case "undefined":
      return e;
    case "object":
      return e;
    default:
      return "";
  }
}
function ld(e) {
  var t = e.type;
  return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
}
function hg(e) {
  var t = ld(e) ? "checked" : "value", n = Object.getOwnPropertyDescriptor(e.constructor.prototype, t), r = "" + e[t];
  if (!e.hasOwnProperty(t) && typeof n < "u" && typeof n.get == "function" && typeof n.set == "function") {
    var i = n.get, s = n.set;
    return Object.defineProperty(e, t, { configurable: !0, get: function() {
      return i.call(this);
    }, set: function(o) {
      r = "" + o, s.call(this, o);
    } }), Object.defineProperty(e, t, { enumerable: n.enumerable }), { getValue: function() {
      return r;
    }, setValue: function(o) {
      r = "" + o;
    }, stopTracking: function() {
      e._valueTracker = null, delete e[t];
    } };
  }
}
function di(e) {
  e._valueTracker || (e._valueTracker = hg(e));
}
function ad(e) {
  if (!e) return !1;
  var t = e._valueTracker;
  if (!t) return !0;
  var n = t.getValue(), r = "";
  return e && (r = ld(e) ? e.checked ? "true" : "false" : e.value), e = r, e !== n ? (t.setValue(e), !0) : !1;
}
function bi(e) {
  if (e = e || (typeof document < "u" ? document : void 0), typeof e > "u") return null;
  try {
    return e.activeElement || e.body;
  } catch {
    return e.body;
  }
}
function Oo(e, t) {
  var n = t.checked;
  return b({}, t, { defaultChecked: void 0, defaultValue: void 0, value: void 0, checked: n ?? e._wrapperState.initialChecked });
}
function Eu(e, t) {
  var n = t.defaultValue == null ? "" : t.defaultValue, r = t.checked != null ? t.checked : t.defaultChecked;
  n = _t(t.value != null ? t.value : n), e._wrapperState = { initialChecked: r, initialValue: n, controlled: t.type === "checkbox" || t.type === "radio" ? t.checked != null : t.value != null };
}
function ud(e, t) {
  t = t.checked, t != null && Yl(e, "checked", t, !1);
}
function zo(e, t) {
  ud(e, t);
  var n = _t(t.value), r = t.type;
  if (n != null) r === "number" ? (n === 0 && e.value === "" || e.value != n) && (e.value = "" + n) : e.value !== "" + n && (e.value = "" + n);
  else if (r === "submit" || r === "reset") {
    e.removeAttribute("value");
    return;
  }
  t.hasOwnProperty("value") ? Uo(e, t.type, n) : t.hasOwnProperty("defaultValue") && Uo(e, t.type, _t(t.defaultValue)), t.checked == null && t.defaultChecked != null && (e.defaultChecked = !!t.defaultChecked);
}
function Pu(e, t, n) {
  if (t.hasOwnProperty("value") || t.hasOwnProperty("defaultValue")) {
    var r = t.type;
    if (!(r !== "submit" && r !== "reset" || t.value !== void 0 && t.value !== null)) return;
    t = "" + e._wrapperState.initialValue, n || t === e.value || (e.value = t), e.defaultValue = t;
  }
  n = e.name, n !== "" && (e.name = ""), e.defaultChecked = !!e._wrapperState.initialChecked, n !== "" && (e.name = n);
}
function Uo(e, t, n) {
  (t !== "number" || bi(e.ownerDocument) !== e) && (n == null ? e.defaultValue = "" + e._wrapperState.initialValue : e.defaultValue !== "" + n && (e.defaultValue = "" + n));
}
var fr = Array.isArray;
function An(e, t, n, r) {
  if (e = e.options, t) {
    t = {};
    for (var i = 0; i < n.length; i++) t["$" + n[i]] = !0;
    for (n = 0; n < e.length; n++) i = t.hasOwnProperty("$" + e[n].value), e[n].selected !== i && (e[n].selected = i), i && r && (e[n].defaultSelected = !0);
  } else {
    for (n = "" + _t(n), t = null, i = 0; i < e.length; i++) {
      if (e[i].value === n) {
        e[i].selected = !0, r && (e[i].defaultSelected = !0);
        return;
      }
      t !== null || e[i].disabled || (t = e[i]);
    }
    t !== null && (t.selected = !0);
  }
}
function Bo(e, t) {
  if (t.dangerouslySetInnerHTML != null) throw Error(T(91));
  return b({}, t, { value: void 0, defaultValue: void 0, children: "" + e._wrapperState.initialValue });
}
function Du(e, t) {
  var n = t.value;
  if (n == null) {
    if (n = t.children, t = t.defaultValue, n != null) {
      if (t != null) throw Error(T(92));
      if (fr(n)) {
        if (1 < n.length) throw Error(T(93));
        n = n[0];
      }
      t = n;
    }
    t == null && (t = ""), n = t;
  }
  e._wrapperState = { initialValue: _t(n) };
}
function cd(e, t) {
  var n = _t(t.value), r = _t(t.defaultValue);
  n != null && (n = "" + n, n !== e.value && (e.value = n), t.defaultValue == null && e.defaultValue !== n && (e.defaultValue = n)), r != null && (e.defaultValue = "" + r);
}
function Cu(e) {
  var t = e.textContent;
  t === e._wrapperState.initialValue && t !== "" && t !== null && (e.value = t);
}
function fd(e) {
  switch (e) {
    case "svg":
      return "http://www.w3.org/2000/svg";
    case "math":
      return "http://www.w3.org/1998/Math/MathML";
    default:
      return "http://www.w3.org/1999/xhtml";
  }
}
function $o(e, t) {
  return e == null || e === "http://www.w3.org/1999/xhtml" ? fd(t) : e === "http://www.w3.org/2000/svg" && t === "foreignObject" ? "http://www.w3.org/1999/xhtml" : e;
}
var hi, dd = function(e) {
  return typeof MSApp < "u" && MSApp.execUnsafeLocalFunction ? function(t, n, r, i) {
    MSApp.execUnsafeLocalFunction(function() {
      return e(t, n, r, i);
    });
  } : e;
}(function(e, t) {
  if (e.namespaceURI !== "http://www.w3.org/2000/svg" || "innerHTML" in e) e.innerHTML = t;
  else {
    for (hi = hi || document.createElement("div"), hi.innerHTML = "<svg>" + t.valueOf().toString() + "</svg>", t = hi.firstChild; e.firstChild; ) e.removeChild(e.firstChild);
    for (; t.firstChild; ) e.appendChild(t.firstChild);
  }
});
function Ar(e, t) {
  if (t) {
    var n = e.firstChild;
    if (n && n === e.lastChild && n.nodeType === 3) {
      n.nodeValue = t;
      return;
    }
  }
  e.textContent = t;
}
var vr = {
  animationIterationCount: !0,
  aspectRatio: !0,
  borderImageOutset: !0,
  borderImageSlice: !0,
  borderImageWidth: !0,
  boxFlex: !0,
  boxFlexGroup: !0,
  boxOrdinalGroup: !0,
  columnCount: !0,
  columns: !0,
  flex: !0,
  flexGrow: !0,
  flexPositive: !0,
  flexShrink: !0,
  flexNegative: !0,
  flexOrder: !0,
  gridArea: !0,
  gridRow: !0,
  gridRowEnd: !0,
  gridRowSpan: !0,
  gridRowStart: !0,
  gridColumn: !0,
  gridColumnEnd: !0,
  gridColumnSpan: !0,
  gridColumnStart: !0,
  fontWeight: !0,
  lineClamp: !0,
  lineHeight: !0,
  opacity: !0,
  order: !0,
  orphans: !0,
  tabSize: !0,
  widows: !0,
  zIndex: !0,
  zoom: !0,
  fillOpacity: !0,
  floodOpacity: !0,
  stopOpacity: !0,
  strokeDasharray: !0,
  strokeDashoffset: !0,
  strokeMiterlimit: !0,
  strokeOpacity: !0,
  strokeWidth: !0
}, pg = ["Webkit", "ms", "Moz", "O"];
Object.keys(vr).forEach(function(e) {
  pg.forEach(function(t) {
    t = t + e.charAt(0).toUpperCase() + e.substring(1), vr[t] = vr[e];
  });
});
function hd(e, t, n) {
  return t == null || typeof t == "boolean" || t === "" ? "" : n || typeof t != "number" || t === 0 || vr.hasOwnProperty(e) && vr[e] ? ("" + t).trim() : t + "px";
}
function pd(e, t) {
  e = e.style;
  for (var n in t) if (t.hasOwnProperty(n)) {
    var r = n.indexOf("--") === 0, i = hd(n, t[n], r);
    n === "float" && (n = "cssFloat"), r ? e.setProperty(n, i) : e[n] = i;
  }
}
var mg = b({ menuitem: !0 }, { area: !0, base: !0, br: !0, col: !0, embed: !0, hr: !0, img: !0, input: !0, keygen: !0, link: !0, meta: !0, param: !0, source: !0, track: !0, wbr: !0 });
function Wo(e, t) {
  if (t) {
    if (mg[e] && (t.children != null || t.dangerouslySetInnerHTML != null)) throw Error(T(137, e));
    if (t.dangerouslySetInnerHTML != null) {
      if (t.children != null) throw Error(T(60));
      if (typeof t.dangerouslySetInnerHTML != "object" || !("__html" in t.dangerouslySetInnerHTML)) throw Error(T(61));
    }
    if (t.style != null && typeof t.style != "object") throw Error(T(62));
  }
}
function Ko(e, t) {
  if (e.indexOf("-") === -1) return typeof t.is == "string";
  switch (e) {
    case "annotation-xml":
    case "color-profile":
    case "font-face":
    case "font-face-src":
    case "font-face-uri":
    case "font-face-format":
    case "font-face-name":
    case "missing-glyph":
      return !1;
    default:
      return !0;
  }
}
var Ho = null;
function Jl(e) {
  return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
}
var bo = null, Mn = null, jn = null;
function Nu(e) {
  if (e = ti(e)) {
    if (typeof bo != "function") throw Error(T(280));
    var t = e.stateNode;
    t && (t = Cs(t), bo(e.stateNode, e.type, t));
  }
}
function md(e) {
  Mn ? jn ? jn.push(e) : jn = [e] : Mn = e;
}
function gd() {
  if (Mn) {
    var e = Mn, t = jn;
    if (jn = Mn = null, Nu(e), t) for (e = 0; e < t.length; e++) Nu(t[e]);
  }
}
function vd(e, t) {
  return e(t);
}
function yd() {
}
var Xs = !1;
function xd(e, t, n) {
  if (Xs) return e(t, n);
  Xs = !0;
  try {
    return vd(e, t, n);
  } finally {
    Xs = !1, (Mn !== null || jn !== null) && (yd(), gd());
  }
}
function Mr(e, t) {
  var n = e.stateNode;
  if (n === null) return null;
  var r = Cs(n);
  if (r === null) return null;
  n = r[t];
  e: switch (t) {
    case "onClick":
    case "onClickCapture":
    case "onDoubleClick":
    case "onDoubleClickCapture":
    case "onMouseDown":
    case "onMouseDownCapture":
    case "onMouseMove":
    case "onMouseMoveCapture":
    case "onMouseUp":
    case "onMouseUpCapture":
    case "onMouseEnter":
      (r = !r.disabled) || (e = e.type, r = !(e === "button" || e === "input" || e === "select" || e === "textarea")), e = !r;
      break e;
    default:
      e = !1;
  }
  if (e) return null;
  if (n && typeof n != "function") throw Error(T(231, t, typeof n));
  return n;
}
var Go = !1;
if (dt) try {
  var tr = {};
  Object.defineProperty(tr, "passive", { get: function() {
    Go = !0;
  } }), window.addEventListener("test", tr, tr), window.removeEventListener("test", tr, tr);
} catch {
  Go = !1;
}
function gg(e, t, n, r, i, s, o, l, a) {
  var u = Array.prototype.slice.call(arguments, 3);
  try {
    t.apply(n, u);
  } catch (c) {
    this.onError(c);
  }
}
var yr = !1, Gi = null, Qi = !1, Qo = null, vg = { onError: function(e) {
  yr = !0, Gi = e;
} };
function yg(e, t, n, r, i, s, o, l, a) {
  yr = !1, Gi = null, gg.apply(vg, arguments);
}
function xg(e, t, n, r, i, s, o, l, a) {
  if (yg.apply(this, arguments), yr) {
    if (yr) {
      var u = Gi;
      yr = !1, Gi = null;
    } else throw Error(T(198));
    Qi || (Qi = !0, Qo = u);
  }
}
function fn(e) {
  var t = e, n = e;
  if (e.alternate) for (; t.return; ) t = t.return;
  else {
    e = t;
    do
      t = e, t.flags & 4098 && (n = t.return), e = t.return;
    while (e);
  }
  return t.tag === 3 ? n : null;
}
function wd(e) {
  if (e.tag === 13) {
    var t = e.memoizedState;
    if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
  }
  return null;
}
function Vu(e) {
  if (fn(e) !== e) throw Error(T(188));
}
function wg(e) {
  var t = e.alternate;
  if (!t) {
    if (t = fn(e), t === null) throw Error(T(188));
    return t !== e ? null : e;
  }
  for (var n = e, r = t; ; ) {
    var i = n.return;
    if (i === null) break;
    var s = i.alternate;
    if (s === null) {
      if (r = i.return, r !== null) {
        n = r;
        continue;
      }
      break;
    }
    if (i.child === s.child) {
      for (s = i.child; s; ) {
        if (s === n) return Vu(i), e;
        if (s === r) return Vu(i), t;
        s = s.sibling;
      }
      throw Error(T(188));
    }
    if (n.return !== r.return) n = i, r = s;
    else {
      for (var o = !1, l = i.child; l; ) {
        if (l === n) {
          o = !0, n = i, r = s;
          break;
        }
        if (l === r) {
          o = !0, r = i, n = s;
          break;
        }
        l = l.sibling;
      }
      if (!o) {
        for (l = s.child; l; ) {
          if (l === n) {
            o = !0, n = s, r = i;
            break;
          }
          if (l === r) {
            o = !0, r = s, n = i;
            break;
          }
          l = l.sibling;
        }
        if (!o) throw Error(T(189));
      }
    }
    if (n.alternate !== r) throw Error(T(190));
  }
  if (n.tag !== 3) throw Error(T(188));
  return n.stateNode.current === n ? e : t;
}
function Sd(e) {
  return e = wg(e), e !== null ? kd(e) : null;
}
function kd(e) {
  if (e.tag === 5 || e.tag === 6) return e;
  for (e = e.child; e !== null; ) {
    var t = kd(e);
    if (t !== null) return t;
    e = e.sibling;
  }
  return null;
}
var Td = Ve.unstable_scheduleCallback, Ru = Ve.unstable_cancelCallback, Sg = Ve.unstable_shouldYield, kg = Ve.unstable_requestPaint, Z = Ve.unstable_now, Tg = Ve.unstable_getCurrentPriorityLevel, ea = Ve.unstable_ImmediatePriority, Ed = Ve.unstable_UserBlockingPriority, Yi = Ve.unstable_NormalPriority, Eg = Ve.unstable_LowPriority, Pd = Ve.unstable_IdlePriority, Ts = null, Je = null;
function Pg(e) {
  if (Je && typeof Je.onCommitFiberRoot == "function") try {
    Je.onCommitFiberRoot(Ts, e, void 0, (e.current.flags & 128) === 128);
  } catch {
  }
}
var be = Math.clz32 ? Math.clz32 : Ng, Dg = Math.log, Cg = Math.LN2;
function Ng(e) {
  return e >>>= 0, e === 0 ? 32 : 31 - (Dg(e) / Cg | 0) | 0;
}
var pi = 64, mi = 4194304;
function dr(e) {
  switch (e & -e) {
    case 1:
      return 1;
    case 2:
      return 2;
    case 4:
      return 4;
    case 8:
      return 8;
    case 16:
      return 16;
    case 32:
      return 32;
    case 64:
    case 128:
    case 256:
    case 512:
    case 1024:
    case 2048:
    case 4096:
    case 8192:
    case 16384:
    case 32768:
    case 65536:
    case 131072:
    case 262144:
    case 524288:
    case 1048576:
    case 2097152:
      return e & 4194240;
    case 4194304:
    case 8388608:
    case 16777216:
    case 33554432:
    case 67108864:
      return e & 130023424;
    case 134217728:
      return 134217728;
    case 268435456:
      return 268435456;
    case 536870912:
      return 536870912;
    case 1073741824:
      return 1073741824;
    default:
      return e;
  }
}
function Xi(e, t) {
  var n = e.pendingLanes;
  if (n === 0) return 0;
  var r = 0, i = e.suspendedLanes, s = e.pingedLanes, o = n & 268435455;
  if (o !== 0) {
    var l = o & ~i;
    l !== 0 ? r = dr(l) : (s &= o, s !== 0 && (r = dr(s)));
  } else o = n & ~i, o !== 0 ? r = dr(o) : s !== 0 && (r = dr(s));
  if (r === 0) return 0;
  if (t !== 0 && t !== r && !(t & i) && (i = r & -r, s = t & -t, i >= s || i === 16 && (s & 4194240) !== 0)) return t;
  if (r & 4 && (r |= n & 16), t = e.entangledLanes, t !== 0) for (e = e.entanglements, t &= r; 0 < t; ) n = 31 - be(t), i = 1 << n, r |= e[n], t &= ~i;
  return r;
}
function Vg(e, t) {
  switch (e) {
    case 1:
    case 2:
    case 4:
      return t + 250;
    case 8:
    case 16:
    case 32:
    case 64:
    case 128:
    case 256:
    case 512:
    case 1024:
    case 2048:
    case 4096:
    case 8192:
    case 16384:
    case 32768:
    case 65536:
    case 131072:
    case 262144:
    case 524288:
    case 1048576:
    case 2097152:
      return t + 5e3;
    case 4194304:
    case 8388608:
    case 16777216:
    case 33554432:
    case 67108864:
      return -1;
    case 134217728:
    case 268435456:
    case 536870912:
    case 1073741824:
      return -1;
    default:
      return -1;
  }
}
function Rg(e, t) {
  for (var n = e.suspendedLanes, r = e.pingedLanes, i = e.expirationTimes, s = e.pendingLanes; 0 < s; ) {
    var o = 31 - be(s), l = 1 << o, a = i[o];
    a === -1 ? (!(l & n) || l & r) && (i[o] = Vg(l, t)) : a <= t && (e.expiredLanes |= l), s &= ~l;
  }
}
function Yo(e) {
  return e = e.pendingLanes & -1073741825, e !== 0 ? e : e & 1073741824 ? 1073741824 : 0;
}
function Dd() {
  var e = pi;
  return pi <<= 1, !(pi & 4194240) && (pi = 64), e;
}
function Zs(e) {
  for (var t = [], n = 0; 31 > n; n++) t.push(e);
  return t;
}
function Jr(e, t, n) {
  e.pendingLanes |= t, t !== 536870912 && (e.suspendedLanes = 0, e.pingedLanes = 0), e = e.eventTimes, t = 31 - be(t), e[t] = n;
}
function Ag(e, t) {
  var n = e.pendingLanes & ~t;
  e.pendingLanes = t, e.suspendedLanes = 0, e.pingedLanes = 0, e.expiredLanes &= t, e.mutableReadLanes &= t, e.entangledLanes &= t, t = e.entanglements;
  var r = e.eventTimes;
  for (e = e.expirationTimes; 0 < n; ) {
    var i = 31 - be(n), s = 1 << i;
    t[i] = 0, r[i] = -1, e[i] = -1, n &= ~s;
  }
}
function ta(e, t) {
  var n = e.entangledLanes |= t;
  for (e = e.entanglements; n; ) {
    var r = 31 - be(n), i = 1 << r;
    i & t | e[r] & t && (e[r] |= t), n &= ~i;
  }
}
var I = 0;
function Cd(e) {
  return e &= -e, 1 < e ? 4 < e ? e & 268435455 ? 16 : 536870912 : 4 : 1;
}
var Nd, na, Vd, Rd, Ad, Xo = !1, gi = [], Ct = null, Nt = null, Vt = null, jr = /* @__PURE__ */ new Map(), Lr = /* @__PURE__ */ new Map(), Tt = [], Mg = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");
function Au(e, t) {
  switch (e) {
    case "focusin":
    case "focusout":
      Ct = null;
      break;
    case "dragenter":
    case "dragleave":
      Nt = null;
      break;
    case "mouseover":
    case "mouseout":
      Vt = null;
      break;
    case "pointerover":
    case "pointerout":
      jr.delete(t.pointerId);
      break;
    case "gotpointercapture":
    case "lostpointercapture":
      Lr.delete(t.pointerId);
  }
}
function nr(e, t, n, r, i, s) {
  return e === null || e.nativeEvent !== s ? (e = { blockedOn: t, domEventName: n, eventSystemFlags: r, nativeEvent: s, targetContainers: [i] }, t !== null && (t = ti(t), t !== null && na(t)), e) : (e.eventSystemFlags |= r, t = e.targetContainers, i !== null && t.indexOf(i) === -1 && t.push(i), e);
}
function jg(e, t, n, r, i) {
  switch (t) {
    case "focusin":
      return Ct = nr(Ct, e, t, n, r, i), !0;
    case "dragenter":
      return Nt = nr(Nt, e, t, n, r, i), !0;
    case "mouseover":
      return Vt = nr(Vt, e, t, n, r, i), !0;
    case "pointerover":
      var s = i.pointerId;
      return jr.set(s, nr(jr.get(s) || null, e, t, n, r, i)), !0;
    case "gotpointercapture":
      return s = i.pointerId, Lr.set(s, nr(Lr.get(s) || null, e, t, n, r, i)), !0;
  }
  return !1;
}
function Md(e) {
  var t = Zt(e.target);
  if (t !== null) {
    var n = fn(t);
    if (n !== null) {
      if (t = n.tag, t === 13) {
        if (t = wd(n), t !== null) {
          e.blockedOn = t, Ad(e.priority, function() {
            Vd(n);
          });
          return;
        }
      } else if (t === 3 && n.stateNode.current.memoizedState.isDehydrated) {
        e.blockedOn = n.tag === 3 ? n.stateNode.containerInfo : null;
        return;
      }
    }
  }
  e.blockedOn = null;
}
function ji(e) {
  if (e.blockedOn !== null) return !1;
  for (var t = e.targetContainers; 0 < t.length; ) {
    var n = Zo(e.domEventName, e.eventSystemFlags, t[0], e.nativeEvent);
    if (n === null) {
      n = e.nativeEvent;
      var r = new n.constructor(n.type, n);
      Ho = r, n.target.dispatchEvent(r), Ho = null;
    } else return t = ti(n), t !== null && na(t), e.blockedOn = n, !1;
    t.shift();
  }
  return !0;
}
function Mu(e, t, n) {
  ji(e) && n.delete(t);
}
function Lg() {
  Xo = !1, Ct !== null && ji(Ct) && (Ct = null), Nt !== null && ji(Nt) && (Nt = null), Vt !== null && ji(Vt) && (Vt = null), jr.forEach(Mu), Lr.forEach(Mu);
}
function rr(e, t) {
  e.blockedOn === t && (e.blockedOn = null, Xo || (Xo = !0, Ve.unstable_scheduleCallback(Ve.unstable_NormalPriority, Lg)));
}
function _r(e) {
  function t(i) {
    return rr(i, e);
  }
  if (0 < gi.length) {
    rr(gi[0], e);
    for (var n = 1; n < gi.length; n++) {
      var r = gi[n];
      r.blockedOn === e && (r.blockedOn = null);
    }
  }
  for (Ct !== null && rr(Ct, e), Nt !== null && rr(Nt, e), Vt !== null && rr(Vt, e), jr.forEach(t), Lr.forEach(t), n = 0; n < Tt.length; n++) r = Tt[n], r.blockedOn === e && (r.blockedOn = null);
  for (; 0 < Tt.length && (n = Tt[0], n.blockedOn === null); ) Md(n), n.blockedOn === null && Tt.shift();
}
var Ln = vt.ReactCurrentBatchConfig, Zi = !0;
function _g(e, t, n, r) {
  var i = I, s = Ln.transition;
  Ln.transition = null;
  try {
    I = 1, ra(e, t, n, r);
  } finally {
    I = i, Ln.transition = s;
  }
}
function Fg(e, t, n, r) {
  var i = I, s = Ln.transition;
  Ln.transition = null;
  try {
    I = 4, ra(e, t, n, r);
  } finally {
    I = i, Ln.transition = s;
  }
}
function ra(e, t, n, r) {
  if (Zi) {
    var i = Zo(e, t, n, r);
    if (i === null) lo(e, t, r, qi, n), Au(e, r);
    else if (jg(i, e, t, n, r)) r.stopPropagation();
    else if (Au(e, r), t & 4 && -1 < Mg.indexOf(e)) {
      for (; i !== null; ) {
        var s = ti(i);
        if (s !== null && Nd(s), s = Zo(e, t, n, r), s === null && lo(e, t, r, qi, n), s === i) break;
        i = s;
      }
      i !== null && r.stopPropagation();
    } else lo(e, t, r, null, n);
  }
}
var qi = null;
function Zo(e, t, n, r) {
  if (qi = null, e = Jl(r), e = Zt(e), e !== null) if (t = fn(e), t === null) e = null;
  else if (n = t.tag, n === 13) {
    if (e = wd(t), e !== null) return e;
    e = null;
  } else if (n === 3) {
    if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
    e = null;
  } else t !== e && (e = null);
  return qi = e, null;
}
function jd(e) {
  switch (e) {
    case "cancel":
    case "click":
    case "close":
    case "contextmenu":
    case "copy":
    case "cut":
    case "auxclick":
    case "dblclick":
    case "dragend":
    case "dragstart":
    case "drop":
    case "focusin":
    case "focusout":
    case "input":
    case "invalid":
    case "keydown":
    case "keypress":
    case "keyup":
    case "mousedown":
    case "mouseup":
    case "paste":
    case "pause":
    case "play":
    case "pointercancel":
    case "pointerdown":
    case "pointerup":
    case "ratechange":
    case "reset":
    case "resize":
    case "seeked":
    case "submit":
    case "touchcancel":
    case "touchend":
    case "touchstart":
    case "volumechange":
    case "change":
    case "selectionchange":
    case "textInput":
    case "compositionstart":
    case "compositionend":
    case "compositionupdate":
    case "beforeblur":
    case "afterblur":
    case "beforeinput":
    case "blur":
    case "fullscreenchange":
    case "focus":
    case "hashchange":
    case "popstate":
    case "select":
    case "selectstart":
      return 1;
    case "drag":
    case "dragenter":
    case "dragexit":
    case "dragleave":
    case "dragover":
    case "mousemove":
    case "mouseout":
    case "mouseover":
    case "pointermove":
    case "pointerout":
    case "pointerover":
    case "scroll":
    case "toggle":
    case "touchmove":
    case "wheel":
    case "mouseenter":
    case "mouseleave":
    case "pointerenter":
    case "pointerleave":
      return 4;
    case "message":
      switch (Tg()) {
        case ea:
          return 1;
        case Ed:
          return 4;
        case Yi:
        case Eg:
          return 16;
        case Pd:
          return 536870912;
        default:
          return 16;
      }
    default:
      return 16;
  }
}
var Pt = null, ia = null, Li = null;
function Ld() {
  if (Li) return Li;
  var e, t = ia, n = t.length, r, i = "value" in Pt ? Pt.value : Pt.textContent, s = i.length;
  for (e = 0; e < n && t[e] === i[e]; e++) ;
  var o = n - e;
  for (r = 1; r <= o && t[n - r] === i[s - r]; r++) ;
  return Li = i.slice(e, 1 < r ? 1 - r : void 0);
}
function _i(e) {
  var t = e.keyCode;
  return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
}
function vi() {
  return !0;
}
function ju() {
  return !1;
}
function Me(e) {
  function t(n, r, i, s, o) {
    this._reactName = n, this._targetInst = i, this.type = r, this.nativeEvent = s, this.target = o, this.currentTarget = null;
    for (var l in e) e.hasOwnProperty(l) && (n = e[l], this[l] = n ? n(s) : s[l]);
    return this.isDefaultPrevented = (s.defaultPrevented != null ? s.defaultPrevented : s.returnValue === !1) ? vi : ju, this.isPropagationStopped = ju, this;
  }
  return b(t.prototype, { preventDefault: function() {
    this.defaultPrevented = !0;
    var n = this.nativeEvent;
    n && (n.preventDefault ? n.preventDefault() : typeof n.returnValue != "unknown" && (n.returnValue = !1), this.isDefaultPrevented = vi);
  }, stopPropagation: function() {
    var n = this.nativeEvent;
    n && (n.stopPropagation ? n.stopPropagation() : typeof n.cancelBubble != "unknown" && (n.cancelBubble = !0), this.isPropagationStopped = vi);
  }, persist: function() {
  }, isPersistent: vi }), t;
}
var Qn = { eventPhase: 0, bubbles: 0, cancelable: 0, timeStamp: function(e) {
  return e.timeStamp || Date.now();
}, defaultPrevented: 0, isTrusted: 0 }, sa = Me(Qn), ei = b({}, Qn, { view: 0, detail: 0 }), Ig = Me(ei), qs, Js, ir, Es = b({}, ei, { screenX: 0, screenY: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, getModifierState: oa, button: 0, buttons: 0, relatedTarget: function(e) {
  return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
}, movementX: function(e) {
  return "movementX" in e ? e.movementX : (e !== ir && (ir && e.type === "mousemove" ? (qs = e.screenX - ir.screenX, Js = e.screenY - ir.screenY) : Js = qs = 0, ir = e), qs);
}, movementY: function(e) {
  return "movementY" in e ? e.movementY : Js;
} }), Lu = Me(Es), Og = b({}, Es, { dataTransfer: 0 }), zg = Me(Og), Ug = b({}, ei, { relatedTarget: 0 }), eo = Me(Ug), Bg = b({}, Qn, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }), $g = Me(Bg), Wg = b({}, Qn, { clipboardData: function(e) {
  return "clipboardData" in e ? e.clipboardData : window.clipboardData;
} }), Kg = Me(Wg), Hg = b({}, Qn, { data: 0 }), _u = Me(Hg), bg = {
  Esc: "Escape",
  Spacebar: " ",
  Left: "ArrowLeft",
  Up: "ArrowUp",
  Right: "ArrowRight",
  Down: "ArrowDown",
  Del: "Delete",
  Win: "OS",
  Menu: "ContextMenu",
  Apps: "ContextMenu",
  Scroll: "ScrollLock",
  MozPrintableKey: "Unidentified"
}, Gg = {
  8: "Backspace",
  9: "Tab",
  12: "Clear",
  13: "Enter",
  16: "Shift",
  17: "Control",
  18: "Alt",
  19: "Pause",
  20: "CapsLock",
  27: "Escape",
  32: " ",
  33: "PageUp",
  34: "PageDown",
  35: "End",
  36: "Home",
  37: "ArrowLeft",
  38: "ArrowUp",
  39: "ArrowRight",
  40: "ArrowDown",
  45: "Insert",
  46: "Delete",
  112: "F1",
  113: "F2",
  114: "F3",
  115: "F4",
  116: "F5",
  117: "F6",
  118: "F7",
  119: "F8",
  120: "F9",
  121: "F10",
  122: "F11",
  123: "F12",
  144: "NumLock",
  145: "ScrollLock",
  224: "Meta"
}, Qg = { Alt: "altKey", Control: "ctrlKey", Meta: "metaKey", Shift: "shiftKey" };
function Yg(e) {
  var t = this.nativeEvent;
  return t.getModifierState ? t.getModifierState(e) : (e = Qg[e]) ? !!t[e] : !1;
}
function oa() {
  return Yg;
}
var Xg = b({}, ei, { key: function(e) {
  if (e.key) {
    var t = bg[e.key] || e.key;
    if (t !== "Unidentified") return t;
  }
  return e.type === "keypress" ? (e = _i(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? Gg[e.keyCode] || "Unidentified" : "";
}, code: 0, location: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, repeat: 0, locale: 0, getModifierState: oa, charCode: function(e) {
  return e.type === "keypress" ? _i(e) : 0;
}, keyCode: function(e) {
  return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
}, which: function(e) {
  return e.type === "keypress" ? _i(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
} }), Zg = Me(Xg), qg = b({}, Es, { pointerId: 0, width: 0, height: 0, pressure: 0, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0, pointerType: 0, isPrimary: 0 }), Fu = Me(qg), Jg = b({}, ei, { touches: 0, targetTouches: 0, changedTouches: 0, altKey: 0, metaKey: 0, ctrlKey: 0, shiftKey: 0, getModifierState: oa }), ev = Me(Jg), tv = b({}, Qn, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }), nv = Me(tv), rv = b({}, Es, {
  deltaX: function(e) {
    return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
  },
  deltaY: function(e) {
    return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
  },
  deltaZ: 0,
  deltaMode: 0
}), iv = Me(rv), sv = [9, 13, 27, 32], la = dt && "CompositionEvent" in window, xr = null;
dt && "documentMode" in document && (xr = document.documentMode);
var ov = dt && "TextEvent" in window && !xr, _d = dt && (!la || xr && 8 < xr && 11 >= xr), Iu = " ", Ou = !1;
function Fd(e, t) {
  switch (e) {
    case "keyup":
      return sv.indexOf(t.keyCode) !== -1;
    case "keydown":
      return t.keyCode !== 229;
    case "keypress":
    case "mousedown":
    case "focusout":
      return !0;
    default:
      return !1;
  }
}
function Id(e) {
  return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
}
var gn = !1;
function lv(e, t) {
  switch (e) {
    case "compositionend":
      return Id(t);
    case "keypress":
      return t.which !== 32 ? null : (Ou = !0, Iu);
    case "textInput":
      return e = t.data, e === Iu && Ou ? null : e;
    default:
      return null;
  }
}
function av(e, t) {
  if (gn) return e === "compositionend" || !la && Fd(e, t) ? (e = Ld(), Li = ia = Pt = null, gn = !1, e) : null;
  switch (e) {
    case "paste":
      return null;
    case "keypress":
      if (!(t.ctrlKey || t.altKey || t.metaKey) || t.ctrlKey && t.altKey) {
        if (t.char && 1 < t.char.length) return t.char;
        if (t.which) return String.fromCharCode(t.which);
      }
      return null;
    case "compositionend":
      return _d && t.locale !== "ko" ? null : t.data;
    default:
      return null;
  }
}
var uv = { color: !0, date: !0, datetime: !0, "datetime-local": !0, email: !0, month: !0, number: !0, password: !0, range: !0, search: !0, tel: !0, text: !0, time: !0, url: !0, week: !0 };
function zu(e) {
  var t = e && e.nodeName && e.nodeName.toLowerCase();
  return t === "input" ? !!uv[e.type] : t === "textarea";
}
function Od(e, t, n, r) {
  md(r), t = Ji(t, "onChange"), 0 < t.length && (n = new sa("onChange", "change", null, n, r), e.push({ event: n, listeners: t }));
}
var wr = null, Fr = null;
function cv(e) {
  Yd(e, 0);
}
function Ps(e) {
  var t = xn(e);
  if (ad(t)) return e;
}
function fv(e, t) {
  if (e === "change") return t;
}
var zd = !1;
if (dt) {
  var to;
  if (dt) {
    var no = "oninput" in document;
    if (!no) {
      var Uu = document.createElement("div");
      Uu.setAttribute("oninput", "return;"), no = typeof Uu.oninput == "function";
    }
    to = no;
  } else to = !1;
  zd = to && (!document.documentMode || 9 < document.documentMode);
}
function Bu() {
  wr && (wr.detachEvent("onpropertychange", Ud), Fr = wr = null);
}
function Ud(e) {
  if (e.propertyName === "value" && Ps(Fr)) {
    var t = [];
    Od(t, Fr, e, Jl(e)), xd(cv, t);
  }
}
function dv(e, t, n) {
  e === "focusin" ? (Bu(), wr = t, Fr = n, wr.attachEvent("onpropertychange", Ud)) : e === "focusout" && Bu();
}
function hv(e) {
  if (e === "selectionchange" || e === "keyup" || e === "keydown") return Ps(Fr);
}
function pv(e, t) {
  if (e === "click") return Ps(t);
}
function mv(e, t) {
  if (e === "input" || e === "change") return Ps(t);
}
function gv(e, t) {
  return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
}
var Ye = typeof Object.is == "function" ? Object.is : gv;
function Ir(e, t) {
  if (Ye(e, t)) return !0;
  if (typeof e != "object" || e === null || typeof t != "object" || t === null) return !1;
  var n = Object.keys(e), r = Object.keys(t);
  if (n.length !== r.length) return !1;
  for (r = 0; r < n.length; r++) {
    var i = n[r];
    if (!jo.call(t, i) || !Ye(e[i], t[i])) return !1;
  }
  return !0;
}
function $u(e) {
  for (; e && e.firstChild; ) e = e.firstChild;
  return e;
}
function Wu(e, t) {
  var n = $u(e);
  e = 0;
  for (var r; n; ) {
    if (n.nodeType === 3) {
      if (r = e + n.textContent.length, e <= t && r >= t) return { node: n, offset: t - e };
      e = r;
    }
    e: {
      for (; n; ) {
        if (n.nextSibling) {
          n = n.nextSibling;
          break e;
        }
        n = n.parentNode;
      }
      n = void 0;
    }
    n = $u(n);
  }
}
function Bd(e, t) {
  return e && t ? e === t ? !0 : e && e.nodeType === 3 ? !1 : t && t.nodeType === 3 ? Bd(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : !1 : !1;
}
function $d() {
  for (var e = window, t = bi(); t instanceof e.HTMLIFrameElement; ) {
    try {
      var n = typeof t.contentWindow.location.href == "string";
    } catch {
      n = !1;
    }
    if (n) e = t.contentWindow;
    else break;
    t = bi(e.document);
  }
  return t;
}
function aa(e) {
  var t = e && e.nodeName && e.nodeName.toLowerCase();
  return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
}
function vv(e) {
  var t = $d(), n = e.focusedElem, r = e.selectionRange;
  if (t !== n && n && n.ownerDocument && Bd(n.ownerDocument.documentElement, n)) {
    if (r !== null && aa(n)) {
      if (t = r.start, e = r.end, e === void 0 && (e = t), "selectionStart" in n) n.selectionStart = t, n.selectionEnd = Math.min(e, n.value.length);
      else if (e = (t = n.ownerDocument || document) && t.defaultView || window, e.getSelection) {
        e = e.getSelection();
        var i = n.textContent.length, s = Math.min(r.start, i);
        r = r.end === void 0 ? s : Math.min(r.end, i), !e.extend && s > r && (i = r, r = s, s = i), i = Wu(n, s);
        var o = Wu(
          n,
          r
        );
        i && o && (e.rangeCount !== 1 || e.anchorNode !== i.node || e.anchorOffset !== i.offset || e.focusNode !== o.node || e.focusOffset !== o.offset) && (t = t.createRange(), t.setStart(i.node, i.offset), e.removeAllRanges(), s > r ? (e.addRange(t), e.extend(o.node, o.offset)) : (t.setEnd(o.node, o.offset), e.addRange(t)));
      }
    }
    for (t = [], e = n; e = e.parentNode; ) e.nodeType === 1 && t.push({ element: e, left: e.scrollLeft, top: e.scrollTop });
    for (typeof n.focus == "function" && n.focus(), n = 0; n < t.length; n++) e = t[n], e.element.scrollLeft = e.left, e.element.scrollTop = e.top;
  }
}
var yv = dt && "documentMode" in document && 11 >= document.documentMode, vn = null, qo = null, Sr = null, Jo = !1;
function Ku(e, t, n) {
  var r = n.window === n ? n.document : n.nodeType === 9 ? n : n.ownerDocument;
  Jo || vn == null || vn !== bi(r) || (r = vn, "selectionStart" in r && aa(r) ? r = { start: r.selectionStart, end: r.selectionEnd } : (r = (r.ownerDocument && r.ownerDocument.defaultView || window).getSelection(), r = { anchorNode: r.anchorNode, anchorOffset: r.anchorOffset, focusNode: r.focusNode, focusOffset: r.focusOffset }), Sr && Ir(Sr, r) || (Sr = r, r = Ji(qo, "onSelect"), 0 < r.length && (t = new sa("onSelect", "select", null, t, n), e.push({ event: t, listeners: r }), t.target = vn)));
}
function yi(e, t) {
  var n = {};
  return n[e.toLowerCase()] = t.toLowerCase(), n["Webkit" + e] = "webkit" + t, n["Moz" + e] = "moz" + t, n;
}
var yn = { animationend: yi("Animation", "AnimationEnd"), animationiteration: yi("Animation", "AnimationIteration"), animationstart: yi("Animation", "AnimationStart"), transitionend: yi("Transition", "TransitionEnd") }, ro = {}, Wd = {};
dt && (Wd = document.createElement("div").style, "AnimationEvent" in window || (delete yn.animationend.animation, delete yn.animationiteration.animation, delete yn.animationstart.animation), "TransitionEvent" in window || delete yn.transitionend.transition);
function Ds(e) {
  if (ro[e]) return ro[e];
  if (!yn[e]) return e;
  var t = yn[e], n;
  for (n in t) if (t.hasOwnProperty(n) && n in Wd) return ro[e] = t[n];
  return e;
}
var Kd = Ds("animationend"), Hd = Ds("animationiteration"), bd = Ds("animationstart"), Gd = Ds("transitionend"), Qd = /* @__PURE__ */ new Map(), Hu = "abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
function zt(e, t) {
  Qd.set(e, t), cn(t, [e]);
}
for (var io = 0; io < Hu.length; io++) {
  var so = Hu[io], xv = so.toLowerCase(), wv = so[0].toUpperCase() + so.slice(1);
  zt(xv, "on" + wv);
}
zt(Kd, "onAnimationEnd");
zt(Hd, "onAnimationIteration");
zt(bd, "onAnimationStart");
zt("dblclick", "onDoubleClick");
zt("focusin", "onFocus");
zt("focusout", "onBlur");
zt(Gd, "onTransitionEnd");
In("onMouseEnter", ["mouseout", "mouseover"]);
In("onMouseLeave", ["mouseout", "mouseover"]);
In("onPointerEnter", ["pointerout", "pointerover"]);
In("onPointerLeave", ["pointerout", "pointerover"]);
cn("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" "));
cn("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));
cn("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]);
cn("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" "));
cn("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" "));
cn("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
var hr = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), Sv = new Set("cancel close invalid load scroll toggle".split(" ").concat(hr));
function bu(e, t, n) {
  var r = e.type || "unknown-event";
  e.currentTarget = n, xg(r, t, void 0, e), e.currentTarget = null;
}
function Yd(e, t) {
  t = (t & 4) !== 0;
  for (var n = 0; n < e.length; n++) {
    var r = e[n], i = r.event;
    r = r.listeners;
    e: {
      var s = void 0;
      if (t) for (var o = r.length - 1; 0 <= o; o--) {
        var l = r[o], a = l.instance, u = l.currentTarget;
        if (l = l.listener, a !== s && i.isPropagationStopped()) break e;
        bu(i, l, u), s = a;
      }
      else for (o = 0; o < r.length; o++) {
        if (l = r[o], a = l.instance, u = l.currentTarget, l = l.listener, a !== s && i.isPropagationStopped()) break e;
        bu(i, l, u), s = a;
      }
    }
  }
  if (Qi) throw e = Qo, Qi = !1, Qo = null, e;
}
function z(e, t) {
  var n = t[il];
  n === void 0 && (n = t[il] = /* @__PURE__ */ new Set());
  var r = e + "__bubble";
  n.has(r) || (Xd(t, e, 2, !1), n.add(r));
}
function oo(e, t, n) {
  var r = 0;
  t && (r |= 4), Xd(n, e, r, t);
}
var xi = "_reactListening" + Math.random().toString(36).slice(2);
function Or(e) {
  if (!e[xi]) {
    e[xi] = !0, rd.forEach(function(n) {
      n !== "selectionchange" && (Sv.has(n) || oo(n, !1, e), oo(n, !0, e));
    });
    var t = e.nodeType === 9 ? e : e.ownerDocument;
    t === null || t[xi] || (t[xi] = !0, oo("selectionchange", !1, t));
  }
}
function Xd(e, t, n, r) {
  switch (jd(t)) {
    case 1:
      var i = _g;
      break;
    case 4:
      i = Fg;
      break;
    default:
      i = ra;
  }
  n = i.bind(null, t, n, e), i = void 0, !Go || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (i = !0), r ? i !== void 0 ? e.addEventListener(t, n, { capture: !0, passive: i }) : e.addEventListener(t, n, !0) : i !== void 0 ? e.addEventListener(t, n, { passive: i }) : e.addEventListener(t, n, !1);
}
function lo(e, t, n, r, i) {
  var s = r;
  if (!(t & 1) && !(t & 2) && r !== null) e: for (; ; ) {
    if (r === null) return;
    var o = r.tag;
    if (o === 3 || o === 4) {
      var l = r.stateNode.containerInfo;
      if (l === i || l.nodeType === 8 && l.parentNode === i) break;
      if (o === 4) for (o = r.return; o !== null; ) {
        var a = o.tag;
        if ((a === 3 || a === 4) && (a = o.stateNode.containerInfo, a === i || a.nodeType === 8 && a.parentNode === i)) return;
        o = o.return;
      }
      for (; l !== null; ) {
        if (o = Zt(l), o === null) return;
        if (a = o.tag, a === 5 || a === 6) {
          r = s = o;
          continue e;
        }
        l = l.parentNode;
      }
    }
    r = r.return;
  }
  xd(function() {
    var u = s, c = Jl(n), f = [];
    e: {
      var d = Qd.get(e);
      if (d !== void 0) {
        var g = sa, v = e;
        switch (e) {
          case "keypress":
            if (_i(n) === 0) break e;
          case "keydown":
          case "keyup":
            g = Zg;
            break;
          case "focusin":
            v = "focus", g = eo;
            break;
          case "focusout":
            v = "blur", g = eo;
            break;
          case "beforeblur":
          case "afterblur":
            g = eo;
            break;
          case "click":
            if (n.button === 2) break e;
          case "auxclick":
          case "dblclick":
          case "mousedown":
          case "mousemove":
          case "mouseup":
          case "mouseout":
          case "mouseover":
          case "contextmenu":
            g = Lu;
            break;
          case "drag":
          case "dragend":
          case "dragenter":
          case "dragexit":
          case "dragleave":
          case "dragover":
          case "dragstart":
          case "drop":
            g = zg;
            break;
          case "touchcancel":
          case "touchend":
          case "touchmove":
          case "touchstart":
            g = ev;
            break;
          case Kd:
          case Hd:
          case bd:
            g = $g;
            break;
          case Gd:
            g = nv;
            break;
          case "scroll":
            g = Ig;
            break;
          case "wheel":
            g = iv;
            break;
          case "copy":
          case "cut":
          case "paste":
            g = Kg;
            break;
          case "gotpointercapture":
          case "lostpointercapture":
          case "pointercancel":
          case "pointerdown":
          case "pointermove":
          case "pointerout":
          case "pointerover":
          case "pointerup":
            g = Fu;
        }
        var y = (t & 4) !== 0, S = !y && e === "scroll", p = y ? d !== null ? d + "Capture" : null : d;
        y = [];
        for (var h = u, m; h !== null; ) {
          m = h;
          var x = m.stateNode;
          if (m.tag === 5 && x !== null && (m = x, p !== null && (x = Mr(h, p), x != null && y.push(zr(h, x, m)))), S) break;
          h = h.return;
        }
        0 < y.length && (d = new g(d, v, null, n, c), f.push({ event: d, listeners: y }));
      }
    }
    if (!(t & 7)) {
      e: {
        if (d = e === "mouseover" || e === "pointerover", g = e === "mouseout" || e === "pointerout", d && n !== Ho && (v = n.relatedTarget || n.fromElement) && (Zt(v) || v[ht])) break e;
        if ((g || d) && (d = c.window === c ? c : (d = c.ownerDocument) ? d.defaultView || d.parentWindow : window, g ? (v = n.relatedTarget || n.toElement, g = u, v = v ? Zt(v) : null, v !== null && (S = fn(v), v !== S || v.tag !== 5 && v.tag !== 6) && (v = null)) : (g = null, v = u), g !== v)) {
          if (y = Lu, x = "onMouseLeave", p = "onMouseEnter", h = "mouse", (e === "pointerout" || e === "pointerover") && (y = Fu, x = "onPointerLeave", p = "onPointerEnter", h = "pointer"), S = g == null ? d : xn(g), m = v == null ? d : xn(v), d = new y(x, h + "leave", g, n, c), d.target = S, d.relatedTarget = m, x = null, Zt(c) === u && (y = new y(p, h + "enter", v, n, c), y.target = m, y.relatedTarget = S, x = y), S = x, g && v) t: {
            for (y = g, p = v, h = 0, m = y; m; m = hn(m)) h++;
            for (m = 0, x = p; x; x = hn(x)) m++;
            for (; 0 < h - m; ) y = hn(y), h--;
            for (; 0 < m - h; ) p = hn(p), m--;
            for (; h--; ) {
              if (y === p || p !== null && y === p.alternate) break t;
              y = hn(y), p = hn(p);
            }
            y = null;
          }
          else y = null;
          g !== null && Gu(f, d, g, y, !1), v !== null && S !== null && Gu(f, S, v, y, !0);
        }
      }
      e: {
        if (d = u ? xn(u) : window, g = d.nodeName && d.nodeName.toLowerCase(), g === "select" || g === "input" && d.type === "file") var w = fv;
        else if (zu(d)) if (zd) w = mv;
        else {
          w = hv;
          var E = dv;
        }
        else (g = d.nodeName) && g.toLowerCase() === "input" && (d.type === "checkbox" || d.type === "radio") && (w = pv);
        if (w && (w = w(e, u))) {
          Od(f, w, n, c);
          break e;
        }
        E && E(e, d, u), e === "focusout" && (E = d._wrapperState) && E.controlled && d.type === "number" && Uo(d, "number", d.value);
      }
      switch (E = u ? xn(u) : window, e) {
        case "focusin":
          (zu(E) || E.contentEditable === "true") && (vn = E, qo = u, Sr = null);
          break;
        case "focusout":
          Sr = qo = vn = null;
          break;
        case "mousedown":
          Jo = !0;
          break;
        case "contextmenu":
        case "mouseup":
        case "dragend":
          Jo = !1, Ku(f, n, c);
          break;
        case "selectionchange":
          if (yv) break;
        case "keydown":
        case "keyup":
          Ku(f, n, c);
      }
      var D;
      if (la) e: {
        switch (e) {
          case "compositionstart":
            var k = "onCompositionStart";
            break e;
          case "compositionend":
            k = "onCompositionEnd";
            break e;
          case "compositionupdate":
            k = "onCompositionUpdate";
            break e;
        }
        k = void 0;
      }
      else gn ? Fd(e, n) && (k = "onCompositionEnd") : e === "keydown" && n.keyCode === 229 && (k = "onCompositionStart");
      k && (_d && n.locale !== "ko" && (gn || k !== "onCompositionStart" ? k === "onCompositionEnd" && gn && (D = Ld()) : (Pt = c, ia = "value" in Pt ? Pt.value : Pt.textContent, gn = !0)), E = Ji(u, k), 0 < E.length && (k = new _u(k, e, null, n, c), f.push({ event: k, listeners: E }), D ? k.data = D : (D = Id(n), D !== null && (k.data = D)))), (D = ov ? lv(e, n) : av(e, n)) && (u = Ji(u, "onBeforeInput"), 0 < u.length && (c = new _u("onBeforeInput", "beforeinput", null, n, c), f.push({ event: c, listeners: u }), c.data = D));
    }
    Yd(f, t);
  });
}
function zr(e, t, n) {
  return { instance: e, listener: t, currentTarget: n };
}
function Ji(e, t) {
  for (var n = t + "Capture", r = []; e !== null; ) {
    var i = e, s = i.stateNode;
    i.tag === 5 && s !== null && (i = s, s = Mr(e, n), s != null && r.unshift(zr(e, s, i)), s = Mr(e, t), s != null && r.push(zr(e, s, i))), e = e.return;
  }
  return r;
}
function hn(e) {
  if (e === null) return null;
  do
    e = e.return;
  while (e && e.tag !== 5);
  return e || null;
}
function Gu(e, t, n, r, i) {
  for (var s = t._reactName, o = []; n !== null && n !== r; ) {
    var l = n, a = l.alternate, u = l.stateNode;
    if (a !== null && a === r) break;
    l.tag === 5 && u !== null && (l = u, i ? (a = Mr(n, s), a != null && o.unshift(zr(n, a, l))) : i || (a = Mr(n, s), a != null && o.push(zr(n, a, l)))), n = n.return;
  }
  o.length !== 0 && e.push({ event: t, listeners: o });
}
var kv = /\r\n?/g, Tv = /\u0000|\uFFFD/g;
function Qu(e) {
  return (typeof e == "string" ? e : "" + e).replace(kv, `
`).replace(Tv, "");
}
function wi(e, t, n) {
  if (t = Qu(t), Qu(e) !== t && n) throw Error(T(425));
}
function es() {
}
var el = null, tl = null;
function nl(e, t) {
  return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
}
var rl = typeof setTimeout == "function" ? setTimeout : void 0, Ev = typeof clearTimeout == "function" ? clearTimeout : void 0, Yu = typeof Promise == "function" ? Promise : void 0, Pv = typeof queueMicrotask == "function" ? queueMicrotask : typeof Yu < "u" ? function(e) {
  return Yu.resolve(null).then(e).catch(Dv);
} : rl;
function Dv(e) {
  setTimeout(function() {
    throw e;
  });
}
function ao(e, t) {
  var n = t, r = 0;
  do {
    var i = n.nextSibling;
    if (e.removeChild(n), i && i.nodeType === 8) if (n = i.data, n === "/$") {
      if (r === 0) {
        e.removeChild(i), _r(t);
        return;
      }
      r--;
    } else n !== "$" && n !== "$?" && n !== "$!" || r++;
    n = i;
  } while (n);
  _r(t);
}
function Rt(e) {
  for (; e != null; e = e.nextSibling) {
    var t = e.nodeType;
    if (t === 1 || t === 3) break;
    if (t === 8) {
      if (t = e.data, t === "$" || t === "$!" || t === "$?") break;
      if (t === "/$") return null;
    }
  }
  return e;
}
function Xu(e) {
  e = e.previousSibling;
  for (var t = 0; e; ) {
    if (e.nodeType === 8) {
      var n = e.data;
      if (n === "$" || n === "$!" || n === "$?") {
        if (t === 0) return e;
        t--;
      } else n === "/$" && t++;
    }
    e = e.previousSibling;
  }
  return null;
}
var Yn = Math.random().toString(36).slice(2), qe = "__reactFiber$" + Yn, Ur = "__reactProps$" + Yn, ht = "__reactContainer$" + Yn, il = "__reactEvents$" + Yn, Cv = "__reactListeners$" + Yn, Nv = "__reactHandles$" + Yn;
function Zt(e) {
  var t = e[qe];
  if (t) return t;
  for (var n = e.parentNode; n; ) {
    if (t = n[ht] || n[qe]) {
      if (n = t.alternate, t.child !== null || n !== null && n.child !== null) for (e = Xu(e); e !== null; ) {
        if (n = e[qe]) return n;
        e = Xu(e);
      }
      return t;
    }
    e = n, n = e.parentNode;
  }
  return null;
}
function ti(e) {
  return e = e[qe] || e[ht], !e || e.tag !== 5 && e.tag !== 6 && e.tag !== 13 && e.tag !== 3 ? null : e;
}
function xn(e) {
  if (e.tag === 5 || e.tag === 6) return e.stateNode;
  throw Error(T(33));
}
function Cs(e) {
  return e[Ur] || null;
}
var sl = [], wn = -1;
function Ut(e) {
  return { current: e };
}
function U(e) {
  0 > wn || (e.current = sl[wn], sl[wn] = null, wn--);
}
function O(e, t) {
  wn++, sl[wn] = e.current, e.current = t;
}
var Ft = {}, me = Ut(Ft), ke = Ut(!1), sn = Ft;
function On(e, t) {
  var n = e.type.contextTypes;
  if (!n) return Ft;
  var r = e.stateNode;
  if (r && r.__reactInternalMemoizedUnmaskedChildContext === t) return r.__reactInternalMemoizedMaskedChildContext;
  var i = {}, s;
  for (s in n) i[s] = t[s];
  return r && (e = e.stateNode, e.__reactInternalMemoizedUnmaskedChildContext = t, e.__reactInternalMemoizedMaskedChildContext = i), i;
}
function Te(e) {
  return e = e.childContextTypes, e != null;
}
function ts() {
  U(ke), U(me);
}
function Zu(e, t, n) {
  if (me.current !== Ft) throw Error(T(168));
  O(me, t), O(ke, n);
}
function Zd(e, t, n) {
  var r = e.stateNode;
  if (t = t.childContextTypes, typeof r.getChildContext != "function") return n;
  r = r.getChildContext();
  for (var i in r) if (!(i in t)) throw Error(T(108, dg(e) || "Unknown", i));
  return b({}, n, r);
}
function ns(e) {
  return e = (e = e.stateNode) && e.__reactInternalMemoizedMergedChildContext || Ft, sn = me.current, O(me, e), O(ke, ke.current), !0;
}
function qu(e, t, n) {
  var r = e.stateNode;
  if (!r) throw Error(T(169));
  n ? (e = Zd(e, t, sn), r.__reactInternalMemoizedMergedChildContext = e, U(ke), U(me), O(me, e)) : U(ke), O(ke, n);
}
var st = null, Ns = !1, uo = !1;
function qd(e) {
  st === null ? st = [e] : st.push(e);
}
function Vv(e) {
  Ns = !0, qd(e);
}
function Bt() {
  if (!uo && st !== null) {
    uo = !0;
    var e = 0, t = I;
    try {
      var n = st;
      for (I = 1; e < n.length; e++) {
        var r = n[e];
        do
          r = r(!0);
        while (r !== null);
      }
      st = null, Ns = !1;
    } catch (i) {
      throw st !== null && (st = st.slice(e + 1)), Td(ea, Bt), i;
    } finally {
      I = t, uo = !1;
    }
  }
  return null;
}
var Sn = [], kn = 0, rs = null, is = 0, _e = [], Fe = 0, on = null, ot = 1, lt = "";
function Gt(e, t) {
  Sn[kn++] = is, Sn[kn++] = rs, rs = e, is = t;
}
function Jd(e, t, n) {
  _e[Fe++] = ot, _e[Fe++] = lt, _e[Fe++] = on, on = e;
  var r = ot;
  e = lt;
  var i = 32 - be(r) - 1;
  r &= ~(1 << i), n += 1;
  var s = 32 - be(t) + i;
  if (30 < s) {
    var o = i - i % 5;
    s = (r & (1 << o) - 1).toString(32), r >>= o, i -= o, ot = 1 << 32 - be(t) + i | n << i | r, lt = s + e;
  } else ot = 1 << s | n << i | r, lt = e;
}
function ua(e) {
  e.return !== null && (Gt(e, 1), Jd(e, 1, 0));
}
function ca(e) {
  for (; e === rs; ) rs = Sn[--kn], Sn[kn] = null, is = Sn[--kn], Sn[kn] = null;
  for (; e === on; ) on = _e[--Fe], _e[Fe] = null, lt = _e[--Fe], _e[Fe] = null, ot = _e[--Fe], _e[Fe] = null;
}
var Ce = null, De = null, $ = !1, He = null;
function eh(e, t) {
  var n = Ie(5, null, null, 0);
  n.elementType = "DELETED", n.stateNode = t, n.return = e, t = e.deletions, t === null ? (e.deletions = [n], e.flags |= 16) : t.push(n);
}
function Ju(e, t) {
  switch (e.tag) {
    case 5:
      var n = e.type;
      return t = t.nodeType !== 1 || n.toLowerCase() !== t.nodeName.toLowerCase() ? null : t, t !== null ? (e.stateNode = t, Ce = e, De = Rt(t.firstChild), !0) : !1;
    case 6:
      return t = e.pendingProps === "" || t.nodeType !== 3 ? null : t, t !== null ? (e.stateNode = t, Ce = e, De = null, !0) : !1;
    case 13:
      return t = t.nodeType !== 8 ? null : t, t !== null ? (n = on !== null ? { id: ot, overflow: lt } : null, e.memoizedState = { dehydrated: t, treeContext: n, retryLane: 1073741824 }, n = Ie(18, null, null, 0), n.stateNode = t, n.return = e, e.child = n, Ce = e, De = null, !0) : !1;
    default:
      return !1;
  }
}
function ol(e) {
  return (e.mode & 1) !== 0 && (e.flags & 128) === 0;
}
function ll(e) {
  if ($) {
    var t = De;
    if (t) {
      var n = t;
      if (!Ju(e, t)) {
        if (ol(e)) throw Error(T(418));
        t = Rt(n.nextSibling);
        var r = Ce;
        t && Ju(e, t) ? eh(r, n) : (e.flags = e.flags & -4097 | 2, $ = !1, Ce = e);
      }
    } else {
      if (ol(e)) throw Error(T(418));
      e.flags = e.flags & -4097 | 2, $ = !1, Ce = e;
    }
  }
}
function ec(e) {
  for (e = e.return; e !== null && e.tag !== 5 && e.tag !== 3 && e.tag !== 13; ) e = e.return;
  Ce = e;
}
function Si(e) {
  if (e !== Ce) return !1;
  if (!$) return ec(e), $ = !0, !1;
  var t;
  if ((t = e.tag !== 3) && !(t = e.tag !== 5) && (t = e.type, t = t !== "head" && t !== "body" && !nl(e.type, e.memoizedProps)), t && (t = De)) {
    if (ol(e)) throw th(), Error(T(418));
    for (; t; ) eh(e, t), t = Rt(t.nextSibling);
  }
  if (ec(e), e.tag === 13) {
    if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(T(317));
    e: {
      for (e = e.nextSibling, t = 0; e; ) {
        if (e.nodeType === 8) {
          var n = e.data;
          if (n === "/$") {
            if (t === 0) {
              De = Rt(e.nextSibling);
              break e;
            }
            t--;
          } else n !== "$" && n !== "$!" && n !== "$?" || t++;
        }
        e = e.nextSibling;
      }
      De = null;
    }
  } else De = Ce ? Rt(e.stateNode.nextSibling) : null;
  return !0;
}
function th() {
  for (var e = De; e; ) e = Rt(e.nextSibling);
}
function zn() {
  De = Ce = null, $ = !1;
}
function fa(e) {
  He === null ? He = [e] : He.push(e);
}
var Rv = vt.ReactCurrentBatchConfig;
function sr(e, t, n) {
  if (e = n.ref, e !== null && typeof e != "function" && typeof e != "object") {
    if (n._owner) {
      if (n = n._owner, n) {
        if (n.tag !== 1) throw Error(T(309));
        var r = n.stateNode;
      }
      if (!r) throw Error(T(147, e));
      var i = r, s = "" + e;
      return t !== null && t.ref !== null && typeof t.ref == "function" && t.ref._stringRef === s ? t.ref : (t = function(o) {
        var l = i.refs;
        o === null ? delete l[s] : l[s] = o;
      }, t._stringRef = s, t);
    }
    if (typeof e != "string") throw Error(T(284));
    if (!n._owner) throw Error(T(290, e));
  }
  return e;
}
function ki(e, t) {
  throw e = Object.prototype.toString.call(t), Error(T(31, e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e));
}
function tc(e) {
  var t = e._init;
  return t(e._payload);
}
function nh(e) {
  function t(p, h) {
    if (e) {
      var m = p.deletions;
      m === null ? (p.deletions = [h], p.flags |= 16) : m.push(h);
    }
  }
  function n(p, h) {
    if (!e) return null;
    for (; h !== null; ) t(p, h), h = h.sibling;
    return null;
  }
  function r(p, h) {
    for (p = /* @__PURE__ */ new Map(); h !== null; ) h.key !== null ? p.set(h.key, h) : p.set(h.index, h), h = h.sibling;
    return p;
  }
  function i(p, h) {
    return p = Lt(p, h), p.index = 0, p.sibling = null, p;
  }
  function s(p, h, m) {
    return p.index = m, e ? (m = p.alternate, m !== null ? (m = m.index, m < h ? (p.flags |= 2, h) : m) : (p.flags |= 2, h)) : (p.flags |= 1048576, h);
  }
  function o(p) {
    return e && p.alternate === null && (p.flags |= 2), p;
  }
  function l(p, h, m, x) {
    return h === null || h.tag !== 6 ? (h = vo(m, p.mode, x), h.return = p, h) : (h = i(h, m), h.return = p, h);
  }
  function a(p, h, m, x) {
    var w = m.type;
    return w === mn ? c(p, h, m.props.children, x, m.key) : h !== null && (h.elementType === w || typeof w == "object" && w !== null && w.$$typeof === St && tc(w) === h.type) ? (x = i(h, m.props), x.ref = sr(p, h, m), x.return = p, x) : (x = $i(m.type, m.key, m.props, null, p.mode, x), x.ref = sr(p, h, m), x.return = p, x);
  }
  function u(p, h, m, x) {
    return h === null || h.tag !== 4 || h.stateNode.containerInfo !== m.containerInfo || h.stateNode.implementation !== m.implementation ? (h = yo(m, p.mode, x), h.return = p, h) : (h = i(h, m.children || []), h.return = p, h);
  }
  function c(p, h, m, x, w) {
    return h === null || h.tag !== 7 ? (h = nn(m, p.mode, x, w), h.return = p, h) : (h = i(h, m), h.return = p, h);
  }
  function f(p, h, m) {
    if (typeof h == "string" && h !== "" || typeof h == "number") return h = vo("" + h, p.mode, m), h.return = p, h;
    if (typeof h == "object" && h !== null) {
      switch (h.$$typeof) {
        case fi:
          return m = $i(h.type, h.key, h.props, null, p.mode, m), m.ref = sr(p, null, h), m.return = p, m;
        case pn:
          return h = yo(h, p.mode, m), h.return = p, h;
        case St:
          var x = h._init;
          return f(p, x(h._payload), m);
      }
      if (fr(h) || er(h)) return h = nn(h, p.mode, m, null), h.return = p, h;
      ki(p, h);
    }
    return null;
  }
  function d(p, h, m, x) {
    var w = h !== null ? h.key : null;
    if (typeof m == "string" && m !== "" || typeof m == "number") return w !== null ? null : l(p, h, "" + m, x);
    if (typeof m == "object" && m !== null) {
      switch (m.$$typeof) {
        case fi:
          return m.key === w ? a(p, h, m, x) : null;
        case pn:
          return m.key === w ? u(p, h, m, x) : null;
        case St:
          return w = m._init, d(
            p,
            h,
            w(m._payload),
            x
          );
      }
      if (fr(m) || er(m)) return w !== null ? null : c(p, h, m, x, null);
      ki(p, m);
    }
    return null;
  }
  function g(p, h, m, x, w) {
    if (typeof x == "string" && x !== "" || typeof x == "number") return p = p.get(m) || null, l(h, p, "" + x, w);
    if (typeof x == "object" && x !== null) {
      switch (x.$$typeof) {
        case fi:
          return p = p.get(x.key === null ? m : x.key) || null, a(h, p, x, w);
        case pn:
          return p = p.get(x.key === null ? m : x.key) || null, u(h, p, x, w);
        case St:
          var E = x._init;
          return g(p, h, m, E(x._payload), w);
      }
      if (fr(x) || er(x)) return p = p.get(m) || null, c(h, p, x, w, null);
      ki(h, x);
    }
    return null;
  }
  function v(p, h, m, x) {
    for (var w = null, E = null, D = h, k = h = 0, L = null; D !== null && k < m.length; k++) {
      D.index > k ? (L = D, D = null) : L = D.sibling;
      var A = d(p, D, m[k], x);
      if (A === null) {
        D === null && (D = L);
        break;
      }
      e && D && A.alternate === null && t(p, D), h = s(A, h, k), E === null ? w = A : E.sibling = A, E = A, D = L;
    }
    if (k === m.length) return n(p, D), $ && Gt(p, k), w;
    if (D === null) {
      for (; k < m.length; k++) D = f(p, m[k], x), D !== null && (h = s(D, h, k), E === null ? w = D : E.sibling = D, E = D);
      return $ && Gt(p, k), w;
    }
    for (D = r(p, D); k < m.length; k++) L = g(D, p, k, m[k], x), L !== null && (e && L.alternate !== null && D.delete(L.key === null ? k : L.key), h = s(L, h, k), E === null ? w = L : E.sibling = L, E = L);
    return e && D.forEach(function(ne) {
      return t(p, ne);
    }), $ && Gt(p, k), w;
  }
  function y(p, h, m, x) {
    var w = er(m);
    if (typeof w != "function") throw Error(T(150));
    if (m = w.call(m), m == null) throw Error(T(151));
    for (var E = w = null, D = h, k = h = 0, L = null, A = m.next(); D !== null && !A.done; k++, A = m.next()) {
      D.index > k ? (L = D, D = null) : L = D.sibling;
      var ne = d(p, D, A.value, x);
      if (ne === null) {
        D === null && (D = L);
        break;
      }
      e && D && ne.alternate === null && t(p, D), h = s(ne, h, k), E === null ? w = ne : E.sibling = ne, E = ne, D = L;
    }
    if (A.done) return n(
      p,
      D
    ), $ && Gt(p, k), w;
    if (D === null) {
      for (; !A.done; k++, A = m.next()) A = f(p, A.value, x), A !== null && (h = s(A, h, k), E === null ? w = A : E.sibling = A, E = A);
      return $ && Gt(p, k), w;
    }
    for (D = r(p, D); !A.done; k++, A = m.next()) A = g(D, p, k, A.value, x), A !== null && (e && A.alternate !== null && D.delete(A.key === null ? k : A.key), h = s(A, h, k), E === null ? w = A : E.sibling = A, E = A);
    return e && D.forEach(function(yt) {
      return t(p, yt);
    }), $ && Gt(p, k), w;
  }
  function S(p, h, m, x) {
    if (typeof m == "object" && m !== null && m.type === mn && m.key === null && (m = m.props.children), typeof m == "object" && m !== null) {
      switch (m.$$typeof) {
        case fi:
          e: {
            for (var w = m.key, E = h; E !== null; ) {
              if (E.key === w) {
                if (w = m.type, w === mn) {
                  if (E.tag === 7) {
                    n(p, E.sibling), h = i(E, m.props.children), h.return = p, p = h;
                    break e;
                  }
                } else if (E.elementType === w || typeof w == "object" && w !== null && w.$$typeof === St && tc(w) === E.type) {
                  n(p, E.sibling), h = i(E, m.props), h.ref = sr(p, E, m), h.return = p, p = h;
                  break e;
                }
                n(p, E);
                break;
              } else t(p, E);
              E = E.sibling;
            }
            m.type === mn ? (h = nn(m.props.children, p.mode, x, m.key), h.return = p, p = h) : (x = $i(m.type, m.key, m.props, null, p.mode, x), x.ref = sr(p, h, m), x.return = p, p = x);
          }
          return o(p);
        case pn:
          e: {
            for (E = m.key; h !== null; ) {
              if (h.key === E) if (h.tag === 4 && h.stateNode.containerInfo === m.containerInfo && h.stateNode.implementation === m.implementation) {
                n(p, h.sibling), h = i(h, m.children || []), h.return = p, p = h;
                break e;
              } else {
                n(p, h);
                break;
              }
              else t(p, h);
              h = h.sibling;
            }
            h = yo(m, p.mode, x), h.return = p, p = h;
          }
          return o(p);
        case St:
          return E = m._init, S(p, h, E(m._payload), x);
      }
      if (fr(m)) return v(p, h, m, x);
      if (er(m)) return y(p, h, m, x);
      ki(p, m);
    }
    return typeof m == "string" && m !== "" || typeof m == "number" ? (m = "" + m, h !== null && h.tag === 6 ? (n(p, h.sibling), h = i(h, m), h.return = p, p = h) : (n(p, h), h = vo(m, p.mode, x), h.return = p, p = h), o(p)) : n(p, h);
  }
  return S;
}
var Un = nh(!0), rh = nh(!1), ss = Ut(null), os = null, Tn = null, da = null;
function ha() {
  da = Tn = os = null;
}
function pa(e) {
  var t = ss.current;
  U(ss), e._currentValue = t;
}
function al(e, t, n) {
  for (; e !== null; ) {
    var r = e.alternate;
    if ((e.childLanes & t) !== t ? (e.childLanes |= t, r !== null && (r.childLanes |= t)) : r !== null && (r.childLanes & t) !== t && (r.childLanes |= t), e === n) break;
    e = e.return;
  }
}
function _n(e, t) {
  os = e, da = Tn = null, e = e.dependencies, e !== null && e.firstContext !== null && (e.lanes & t && (Se = !0), e.firstContext = null);
}
function ze(e) {
  var t = e._currentValue;
  if (da !== e) if (e = { context: e, memoizedValue: t, next: null }, Tn === null) {
    if (os === null) throw Error(T(308));
    Tn = e, os.dependencies = { lanes: 0, firstContext: e };
  } else Tn = Tn.next = e;
  return t;
}
var qt = null;
function ma(e) {
  qt === null ? qt = [e] : qt.push(e);
}
function ih(e, t, n, r) {
  var i = t.interleaved;
  return i === null ? (n.next = n, ma(t)) : (n.next = i.next, i.next = n), t.interleaved = n, pt(e, r);
}
function pt(e, t) {
  e.lanes |= t;
  var n = e.alternate;
  for (n !== null && (n.lanes |= t), n = e, e = e.return; e !== null; ) e.childLanes |= t, n = e.alternate, n !== null && (n.childLanes |= t), n = e, e = e.return;
  return n.tag === 3 ? n.stateNode : null;
}
var kt = !1;
function ga(e) {
  e.updateQueue = { baseState: e.memoizedState, firstBaseUpdate: null, lastBaseUpdate: null, shared: { pending: null, interleaved: null, lanes: 0 }, effects: null };
}
function sh(e, t) {
  e = e.updateQueue, t.updateQueue === e && (t.updateQueue = { baseState: e.baseState, firstBaseUpdate: e.firstBaseUpdate, lastBaseUpdate: e.lastBaseUpdate, shared: e.shared, effects: e.effects });
}
function at(e, t) {
  return { eventTime: e, lane: t, tag: 0, payload: null, callback: null, next: null };
}
function At(e, t, n) {
  var r = e.updateQueue;
  if (r === null) return null;
  if (r = r.shared, F & 2) {
    var i = r.pending;
    return i === null ? t.next = t : (t.next = i.next, i.next = t), r.pending = t, pt(e, n);
  }
  return i = r.interleaved, i === null ? (t.next = t, ma(r)) : (t.next = i.next, i.next = t), r.interleaved = t, pt(e, n);
}
function Fi(e, t, n) {
  if (t = t.updateQueue, t !== null && (t = t.shared, (n & 4194240) !== 0)) {
    var r = t.lanes;
    r &= e.pendingLanes, n |= r, t.lanes = n, ta(e, n);
  }
}
function nc(e, t) {
  var n = e.updateQueue, r = e.alternate;
  if (r !== null && (r = r.updateQueue, n === r)) {
    var i = null, s = null;
    if (n = n.firstBaseUpdate, n !== null) {
      do {
        var o = { eventTime: n.eventTime, lane: n.lane, tag: n.tag, payload: n.payload, callback: n.callback, next: null };
        s === null ? i = s = o : s = s.next = o, n = n.next;
      } while (n !== null);
      s === null ? i = s = t : s = s.next = t;
    } else i = s = t;
    n = { baseState: r.baseState, firstBaseUpdate: i, lastBaseUpdate: s, shared: r.shared, effects: r.effects }, e.updateQueue = n;
    return;
  }
  e = n.lastBaseUpdate, e === null ? n.firstBaseUpdate = t : e.next = t, n.lastBaseUpdate = t;
}
function ls(e, t, n, r) {
  var i = e.updateQueue;
  kt = !1;
  var s = i.firstBaseUpdate, o = i.lastBaseUpdate, l = i.shared.pending;
  if (l !== null) {
    i.shared.pending = null;
    var a = l, u = a.next;
    a.next = null, o === null ? s = u : o.next = u, o = a;
    var c = e.alternate;
    c !== null && (c = c.updateQueue, l = c.lastBaseUpdate, l !== o && (l === null ? c.firstBaseUpdate = u : l.next = u, c.lastBaseUpdate = a));
  }
  if (s !== null) {
    var f = i.baseState;
    o = 0, c = u = a = null, l = s;
    do {
      var d = l.lane, g = l.eventTime;
      if ((r & d) === d) {
        c !== null && (c = c.next = {
          eventTime: g,
          lane: 0,
          tag: l.tag,
          payload: l.payload,
          callback: l.callback,
          next: null
        });
        e: {
          var v = e, y = l;
          switch (d = t, g = n, y.tag) {
            case 1:
              if (v = y.payload, typeof v == "function") {
                f = v.call(g, f, d);
                break e;
              }
              f = v;
              break e;
            case 3:
              v.flags = v.flags & -65537 | 128;
            case 0:
              if (v = y.payload, d = typeof v == "function" ? v.call(g, f, d) : v, d == null) break e;
              f = b({}, f, d);
              break e;
            case 2:
              kt = !0;
          }
        }
        l.callback !== null && l.lane !== 0 && (e.flags |= 64, d = i.effects, d === null ? i.effects = [l] : d.push(l));
      } else g = { eventTime: g, lane: d, tag: l.tag, payload: l.payload, callback: l.callback, next: null }, c === null ? (u = c = g, a = f) : c = c.next = g, o |= d;
      if (l = l.next, l === null) {
        if (l = i.shared.pending, l === null) break;
        d = l, l = d.next, d.next = null, i.lastBaseUpdate = d, i.shared.pending = null;
      }
    } while (!0);
    if (c === null && (a = f), i.baseState = a, i.firstBaseUpdate = u, i.lastBaseUpdate = c, t = i.shared.interleaved, t !== null) {
      i = t;
      do
        o |= i.lane, i = i.next;
      while (i !== t);
    } else s === null && (i.shared.lanes = 0);
    an |= o, e.lanes = o, e.memoizedState = f;
  }
}
function rc(e, t, n) {
  if (e = t.effects, t.effects = null, e !== null) for (t = 0; t < e.length; t++) {
    var r = e[t], i = r.callback;
    if (i !== null) {
      if (r.callback = null, r = n, typeof i != "function") throw Error(T(191, i));
      i.call(r);
    }
  }
}
var ni = {}, et = Ut(ni), Br = Ut(ni), $r = Ut(ni);
function Jt(e) {
  if (e === ni) throw Error(T(174));
  return e;
}
function va(e, t) {
  switch (O($r, t), O(Br, e), O(et, ni), e = t.nodeType, e) {
    case 9:
    case 11:
      t = (t = t.documentElement) ? t.namespaceURI : $o(null, "");
      break;
    default:
      e = e === 8 ? t.parentNode : t, t = e.namespaceURI || null, e = e.tagName, t = $o(t, e);
  }
  U(et), O(et, t);
}
function Bn() {
  U(et), U(Br), U($r);
}
function oh(e) {
  Jt($r.current);
  var t = Jt(et.current), n = $o(t, e.type);
  t !== n && (O(Br, e), O(et, n));
}
function ya(e) {
  Br.current === e && (U(et), U(Br));
}
var W = Ut(0);
function as(e) {
  for (var t = e; t !== null; ) {
    if (t.tag === 13) {
      var n = t.memoizedState;
      if (n !== null && (n = n.dehydrated, n === null || n.data === "$?" || n.data === "$!")) return t;
    } else if (t.tag === 19 && t.memoizedProps.revealOrder !== void 0) {
      if (t.flags & 128) return t;
    } else if (t.child !== null) {
      t.child.return = t, t = t.child;
      continue;
    }
    if (t === e) break;
    for (; t.sibling === null; ) {
      if (t.return === null || t.return === e) return null;
      t = t.return;
    }
    t.sibling.return = t.return, t = t.sibling;
  }
  return null;
}
var co = [];
function xa() {
  for (var e = 0; e < co.length; e++) co[e]._workInProgressVersionPrimary = null;
  co.length = 0;
}
var Ii = vt.ReactCurrentDispatcher, fo = vt.ReactCurrentBatchConfig, ln = 0, H = null, ee = null, ie = null, us = !1, kr = !1, Wr = 0, Av = 0;
function ce() {
  throw Error(T(321));
}
function wa(e, t) {
  if (t === null) return !1;
  for (var n = 0; n < t.length && n < e.length; n++) if (!Ye(e[n], t[n])) return !1;
  return !0;
}
function Sa(e, t, n, r, i, s) {
  if (ln = s, H = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, Ii.current = e === null || e.memoizedState === null ? _v : Fv, e = n(r, i), kr) {
    s = 0;
    do {
      if (kr = !1, Wr = 0, 25 <= s) throw Error(T(301));
      s += 1, ie = ee = null, t.updateQueue = null, Ii.current = Iv, e = n(r, i);
    } while (kr);
  }
  if (Ii.current = cs, t = ee !== null && ee.next !== null, ln = 0, ie = ee = H = null, us = !1, t) throw Error(T(300));
  return e;
}
function ka() {
  var e = Wr !== 0;
  return Wr = 0, e;
}
function Ze() {
  var e = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null };
  return ie === null ? H.memoizedState = ie = e : ie = ie.next = e, ie;
}
function Ue() {
  if (ee === null) {
    var e = H.alternate;
    e = e !== null ? e.memoizedState : null;
  } else e = ee.next;
  var t = ie === null ? H.memoizedState : ie.next;
  if (t !== null) ie = t, ee = e;
  else {
    if (e === null) throw Error(T(310));
    ee = e, e = { memoizedState: ee.memoizedState, baseState: ee.baseState, baseQueue: ee.baseQueue, queue: ee.queue, next: null }, ie === null ? H.memoizedState = ie = e : ie = ie.next = e;
  }
  return ie;
}
function Kr(e, t) {
  return typeof t == "function" ? t(e) : t;
}
function ho(e) {
  var t = Ue(), n = t.queue;
  if (n === null) throw Error(T(311));
  n.lastRenderedReducer = e;
  var r = ee, i = r.baseQueue, s = n.pending;
  if (s !== null) {
    if (i !== null) {
      var o = i.next;
      i.next = s.next, s.next = o;
    }
    r.baseQueue = i = s, n.pending = null;
  }
  if (i !== null) {
    s = i.next, r = r.baseState;
    var l = o = null, a = null, u = s;
    do {
      var c = u.lane;
      if ((ln & c) === c) a !== null && (a = a.next = { lane: 0, action: u.action, hasEagerState: u.hasEagerState, eagerState: u.eagerState, next: null }), r = u.hasEagerState ? u.eagerState : e(r, u.action);
      else {
        var f = {
          lane: c,
          action: u.action,
          hasEagerState: u.hasEagerState,
          eagerState: u.eagerState,
          next: null
        };
        a === null ? (l = a = f, o = r) : a = a.next = f, H.lanes |= c, an |= c;
      }
      u = u.next;
    } while (u !== null && u !== s);
    a === null ? o = r : a.next = l, Ye(r, t.memoizedState) || (Se = !0), t.memoizedState = r, t.baseState = o, t.baseQueue = a, n.lastRenderedState = r;
  }
  if (e = n.interleaved, e !== null) {
    i = e;
    do
      s = i.lane, H.lanes |= s, an |= s, i = i.next;
    while (i !== e);
  } else i === null && (n.lanes = 0);
  return [t.memoizedState, n.dispatch];
}
function po(e) {
  var t = Ue(), n = t.queue;
  if (n === null) throw Error(T(311));
  n.lastRenderedReducer = e;
  var r = n.dispatch, i = n.pending, s = t.memoizedState;
  if (i !== null) {
    n.pending = null;
    var o = i = i.next;
    do
      s = e(s, o.action), o = o.next;
    while (o !== i);
    Ye(s, t.memoizedState) || (Se = !0), t.memoizedState = s, t.baseQueue === null && (t.baseState = s), n.lastRenderedState = s;
  }
  return [s, r];
}
function lh() {
}
function ah(e, t) {
  var n = H, r = Ue(), i = t(), s = !Ye(r.memoizedState, i);
  if (s && (r.memoizedState = i, Se = !0), r = r.queue, Ta(fh.bind(null, n, r, e), [e]), r.getSnapshot !== t || s || ie !== null && ie.memoizedState.tag & 1) {
    if (n.flags |= 2048, Hr(9, ch.bind(null, n, r, i, t), void 0, null), se === null) throw Error(T(349));
    ln & 30 || uh(n, t, i);
  }
  return i;
}
function uh(e, t, n) {
  e.flags |= 16384, e = { getSnapshot: t, value: n }, t = H.updateQueue, t === null ? (t = { lastEffect: null, stores: null }, H.updateQueue = t, t.stores = [e]) : (n = t.stores, n === null ? t.stores = [e] : n.push(e));
}
function ch(e, t, n, r) {
  t.value = n, t.getSnapshot = r, dh(t) && hh(e);
}
function fh(e, t, n) {
  return n(function() {
    dh(t) && hh(e);
  });
}
function dh(e) {
  var t = e.getSnapshot;
  e = e.value;
  try {
    var n = t();
    return !Ye(e, n);
  } catch {
    return !0;
  }
}
function hh(e) {
  var t = pt(e, 1);
  t !== null && Ge(t, e, 1, -1);
}
function ic(e) {
  var t = Ze();
  return typeof e == "function" && (e = e()), t.memoizedState = t.baseState = e, e = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: Kr, lastRenderedState: e }, t.queue = e, e = e.dispatch = Lv.bind(null, H, e), [t.memoizedState, e];
}
function Hr(e, t, n, r) {
  return e = { tag: e, create: t, destroy: n, deps: r, next: null }, t = H.updateQueue, t === null ? (t = { lastEffect: null, stores: null }, H.updateQueue = t, t.lastEffect = e.next = e) : (n = t.lastEffect, n === null ? t.lastEffect = e.next = e : (r = n.next, n.next = e, e.next = r, t.lastEffect = e)), e;
}
function ph() {
  return Ue().memoizedState;
}
function Oi(e, t, n, r) {
  var i = Ze();
  H.flags |= e, i.memoizedState = Hr(1 | t, n, void 0, r === void 0 ? null : r);
}
function Vs(e, t, n, r) {
  var i = Ue();
  r = r === void 0 ? null : r;
  var s = void 0;
  if (ee !== null) {
    var o = ee.memoizedState;
    if (s = o.destroy, r !== null && wa(r, o.deps)) {
      i.memoizedState = Hr(t, n, s, r);
      return;
    }
  }
  H.flags |= e, i.memoizedState = Hr(1 | t, n, s, r);
}
function sc(e, t) {
  return Oi(8390656, 8, e, t);
}
function Ta(e, t) {
  return Vs(2048, 8, e, t);
}
function mh(e, t) {
  return Vs(4, 2, e, t);
}
function gh(e, t) {
  return Vs(4, 4, e, t);
}
function vh(e, t) {
  if (typeof t == "function") return e = e(), t(e), function() {
    t(null);
  };
  if (t != null) return e = e(), t.current = e, function() {
    t.current = null;
  };
}
function yh(e, t, n) {
  return n = n != null ? n.concat([e]) : null, Vs(4, 4, vh.bind(null, t, e), n);
}
function Ea() {
}
function xh(e, t) {
  var n = Ue();
  t = t === void 0 ? null : t;
  var r = n.memoizedState;
  return r !== null && t !== null && wa(t, r[1]) ? r[0] : (n.memoizedState = [e, t], e);
}
function wh(e, t) {
  var n = Ue();
  t = t === void 0 ? null : t;
  var r = n.memoizedState;
  return r !== null && t !== null && wa(t, r[1]) ? r[0] : (e = e(), n.memoizedState = [e, t], e);
}
function Sh(e, t, n) {
  return ln & 21 ? (Ye(n, t) || (n = Dd(), H.lanes |= n, an |= n, e.baseState = !0), t) : (e.baseState && (e.baseState = !1, Se = !0), e.memoizedState = n);
}
function Mv(e, t) {
  var n = I;
  I = n !== 0 && 4 > n ? n : 4, e(!0);
  var r = fo.transition;
  fo.transition = {};
  try {
    e(!1), t();
  } finally {
    I = n, fo.transition = r;
  }
}
function kh() {
  return Ue().memoizedState;
}
function jv(e, t, n) {
  var r = jt(e);
  if (n = { lane: r, action: n, hasEagerState: !1, eagerState: null, next: null }, Th(e)) Eh(t, n);
  else if (n = ih(e, t, n, r), n !== null) {
    var i = ve();
    Ge(n, e, r, i), Ph(n, t, r);
  }
}
function Lv(e, t, n) {
  var r = jt(e), i = { lane: r, action: n, hasEagerState: !1, eagerState: null, next: null };
  if (Th(e)) Eh(t, i);
  else {
    var s = e.alternate;
    if (e.lanes === 0 && (s === null || s.lanes === 0) && (s = t.lastRenderedReducer, s !== null)) try {
      var o = t.lastRenderedState, l = s(o, n);
      if (i.hasEagerState = !0, i.eagerState = l, Ye(l, o)) {
        var a = t.interleaved;
        a === null ? (i.next = i, ma(t)) : (i.next = a.next, a.next = i), t.interleaved = i;
        return;
      }
    } catch {
    } finally {
    }
    n = ih(e, t, i, r), n !== null && (i = ve(), Ge(n, e, r, i), Ph(n, t, r));
  }
}
function Th(e) {
  var t = e.alternate;
  return e === H || t !== null && t === H;
}
function Eh(e, t) {
  kr = us = !0;
  var n = e.pending;
  n === null ? t.next = t : (t.next = n.next, n.next = t), e.pending = t;
}
function Ph(e, t, n) {
  if (n & 4194240) {
    var r = t.lanes;
    r &= e.pendingLanes, n |= r, t.lanes = n, ta(e, n);
  }
}
var cs = { readContext: ze, useCallback: ce, useContext: ce, useEffect: ce, useImperativeHandle: ce, useInsertionEffect: ce, useLayoutEffect: ce, useMemo: ce, useReducer: ce, useRef: ce, useState: ce, useDebugValue: ce, useDeferredValue: ce, useTransition: ce, useMutableSource: ce, useSyncExternalStore: ce, useId: ce, unstable_isNewReconciler: !1 }, _v = { readContext: ze, useCallback: function(e, t) {
  return Ze().memoizedState = [e, t === void 0 ? null : t], e;
}, useContext: ze, useEffect: sc, useImperativeHandle: function(e, t, n) {
  return n = n != null ? n.concat([e]) : null, Oi(
    4194308,
    4,
    vh.bind(null, t, e),
    n
  );
}, useLayoutEffect: function(e, t) {
  return Oi(4194308, 4, e, t);
}, useInsertionEffect: function(e, t) {
  return Oi(4, 2, e, t);
}, useMemo: function(e, t) {
  var n = Ze();
  return t = t === void 0 ? null : t, e = e(), n.memoizedState = [e, t], e;
}, useReducer: function(e, t, n) {
  var r = Ze();
  return t = n !== void 0 ? n(t) : t, r.memoizedState = r.baseState = t, e = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: e, lastRenderedState: t }, r.queue = e, e = e.dispatch = jv.bind(null, H, e), [r.memoizedState, e];
}, useRef: function(e) {
  var t = Ze();
  return e = { current: e }, t.memoizedState = e;
}, useState: ic, useDebugValue: Ea, useDeferredValue: function(e) {
  return Ze().memoizedState = e;
}, useTransition: function() {
  var e = ic(!1), t = e[0];
  return e = Mv.bind(null, e[1]), Ze().memoizedState = e, [t, e];
}, useMutableSource: function() {
}, useSyncExternalStore: function(e, t, n) {
  var r = H, i = Ze();
  if ($) {
    if (n === void 0) throw Error(T(407));
    n = n();
  } else {
    if (n = t(), se === null) throw Error(T(349));
    ln & 30 || uh(r, t, n);
  }
  i.memoizedState = n;
  var s = { value: n, getSnapshot: t };
  return i.queue = s, sc(fh.bind(
    null,
    r,
    s,
    e
  ), [e]), r.flags |= 2048, Hr(9, ch.bind(null, r, s, n, t), void 0, null), n;
}, useId: function() {
  var e = Ze(), t = se.identifierPrefix;
  if ($) {
    var n = lt, r = ot;
    n = (r & ~(1 << 32 - be(r) - 1)).toString(32) + n, t = ":" + t + "R" + n, n = Wr++, 0 < n && (t += "H" + n.toString(32)), t += ":";
  } else n = Av++, t = ":" + t + "r" + n.toString(32) + ":";
  return e.memoizedState = t;
}, unstable_isNewReconciler: !1 }, Fv = {
  readContext: ze,
  useCallback: xh,
  useContext: ze,
  useEffect: Ta,
  useImperativeHandle: yh,
  useInsertionEffect: mh,
  useLayoutEffect: gh,
  useMemo: wh,
  useReducer: ho,
  useRef: ph,
  useState: function() {
    return ho(Kr);
  },
  useDebugValue: Ea,
  useDeferredValue: function(e) {
    var t = Ue();
    return Sh(t, ee.memoizedState, e);
  },
  useTransition: function() {
    var e = ho(Kr)[0], t = Ue().memoizedState;
    return [e, t];
  },
  useMutableSource: lh,
  useSyncExternalStore: ah,
  useId: kh,
  unstable_isNewReconciler: !1
}, Iv = { readContext: ze, useCallback: xh, useContext: ze, useEffect: Ta, useImperativeHandle: yh, useInsertionEffect: mh, useLayoutEffect: gh, useMemo: wh, useReducer: po, useRef: ph, useState: function() {
  return po(Kr);
}, useDebugValue: Ea, useDeferredValue: function(e) {
  var t = Ue();
  return ee === null ? t.memoizedState = e : Sh(t, ee.memoizedState, e);
}, useTransition: function() {
  var e = po(Kr)[0], t = Ue().memoizedState;
  return [e, t];
}, useMutableSource: lh, useSyncExternalStore: ah, useId: kh, unstable_isNewReconciler: !1 };
function We(e, t) {
  if (e && e.defaultProps) {
    t = b({}, t), e = e.defaultProps;
    for (var n in e) t[n] === void 0 && (t[n] = e[n]);
    return t;
  }
  return t;
}
function ul(e, t, n, r) {
  t = e.memoizedState, n = n(r, t), n = n == null ? t : b({}, t, n), e.memoizedState = n, e.lanes === 0 && (e.updateQueue.baseState = n);
}
var Rs = { isMounted: function(e) {
  return (e = e._reactInternals) ? fn(e) === e : !1;
}, enqueueSetState: function(e, t, n) {
  e = e._reactInternals;
  var r = ve(), i = jt(e), s = at(r, i);
  s.payload = t, n != null && (s.callback = n), t = At(e, s, i), t !== null && (Ge(t, e, i, r), Fi(t, e, i));
}, enqueueReplaceState: function(e, t, n) {
  e = e._reactInternals;
  var r = ve(), i = jt(e), s = at(r, i);
  s.tag = 1, s.payload = t, n != null && (s.callback = n), t = At(e, s, i), t !== null && (Ge(t, e, i, r), Fi(t, e, i));
}, enqueueForceUpdate: function(e, t) {
  e = e._reactInternals;
  var n = ve(), r = jt(e), i = at(n, r);
  i.tag = 2, t != null && (i.callback = t), t = At(e, i, r), t !== null && (Ge(t, e, r, n), Fi(t, e, r));
} };
function oc(e, t, n, r, i, s, o) {
  return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, s, o) : t.prototype && t.prototype.isPureReactComponent ? !Ir(n, r) || !Ir(i, s) : !0;
}
function Dh(e, t, n) {
  var r = !1, i = Ft, s = t.contextType;
  return typeof s == "object" && s !== null ? s = ze(s) : (i = Te(t) ? sn : me.current, r = t.contextTypes, s = (r = r != null) ? On(e, i) : Ft), t = new t(n, s), e.memoizedState = t.state !== null && t.state !== void 0 ? t.state : null, t.updater = Rs, e.stateNode = t, t._reactInternals = e, r && (e = e.stateNode, e.__reactInternalMemoizedUnmaskedChildContext = i, e.__reactInternalMemoizedMaskedChildContext = s), t;
}
function lc(e, t, n, r) {
  e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(n, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(n, r), t.state !== e && Rs.enqueueReplaceState(t, t.state, null);
}
function cl(e, t, n, r) {
  var i = e.stateNode;
  i.props = n, i.state = e.memoizedState, i.refs = {}, ga(e);
  var s = t.contextType;
  typeof s == "object" && s !== null ? i.context = ze(s) : (s = Te(t) ? sn : me.current, i.context = On(e, s)), i.state = e.memoizedState, s = t.getDerivedStateFromProps, typeof s == "function" && (ul(e, t, s, n), i.state = e.memoizedState), typeof t.getDerivedStateFromProps == "function" || typeof i.getSnapshotBeforeUpdate == "function" || typeof i.UNSAFE_componentWillMount != "function" && typeof i.componentWillMount != "function" || (t = i.state, typeof i.componentWillMount == "function" && i.componentWillMount(), typeof i.UNSAFE_componentWillMount == "function" && i.UNSAFE_componentWillMount(), t !== i.state && Rs.enqueueReplaceState(i, i.state, null), ls(e, n, i, r), i.state = e.memoizedState), typeof i.componentDidMount == "function" && (e.flags |= 4194308);
}
function $n(e, t) {
  try {
    var n = "", r = t;
    do
      n += fg(r), r = r.return;
    while (r);
    var i = n;
  } catch (s) {
    i = `
Error generating stack: ` + s.message + `
` + s.stack;
  }
  return { value: e, source: t, stack: i, digest: null };
}
function mo(e, t, n) {
  return { value: e, source: null, stack: n ?? null, digest: t ?? null };
}
function fl(e, t) {
  try {
    console.error(t.value);
  } catch (n) {
    setTimeout(function() {
      throw n;
    });
  }
}
var Ov = typeof WeakMap == "function" ? WeakMap : Map;
function Ch(e, t, n) {
  n = at(-1, n), n.tag = 3, n.payload = { element: null };
  var r = t.value;
  return n.callback = function() {
    ds || (ds = !0, Sl = r), fl(e, t);
  }, n;
}
function Nh(e, t, n) {
  n = at(-1, n), n.tag = 3;
  var r = e.type.getDerivedStateFromError;
  if (typeof r == "function") {
    var i = t.value;
    n.payload = function() {
      return r(i);
    }, n.callback = function() {
      fl(e, t);
    };
  }
  var s = e.stateNode;
  return s !== null && typeof s.componentDidCatch == "function" && (n.callback = function() {
    fl(e, t), typeof r != "function" && (Mt === null ? Mt = /* @__PURE__ */ new Set([this]) : Mt.add(this));
    var o = t.stack;
    this.componentDidCatch(t.value, { componentStack: o !== null ? o : "" });
  }), n;
}
function ac(e, t, n) {
  var r = e.pingCache;
  if (r === null) {
    r = e.pingCache = new Ov();
    var i = /* @__PURE__ */ new Set();
    r.set(t, i);
  } else i = r.get(t), i === void 0 && (i = /* @__PURE__ */ new Set(), r.set(t, i));
  i.has(n) || (i.add(n), e = qv.bind(null, e, t, n), t.then(e, e));
}
function uc(e) {
  do {
    var t;
    if ((t = e.tag === 13) && (t = e.memoizedState, t = t !== null ? t.dehydrated !== null : !0), t) return e;
    e = e.return;
  } while (e !== null);
  return null;
}
function cc(e, t, n, r, i) {
  return e.mode & 1 ? (e.flags |= 65536, e.lanes = i, e) : (e === t ? e.flags |= 65536 : (e.flags |= 128, n.flags |= 131072, n.flags &= -52805, n.tag === 1 && (n.alternate === null ? n.tag = 17 : (t = at(-1, 1), t.tag = 2, At(n, t, 1))), n.lanes |= 1), e);
}
var zv = vt.ReactCurrentOwner, Se = !1;
function ge(e, t, n, r) {
  t.child = e === null ? rh(t, null, n, r) : Un(t, e.child, n, r);
}
function fc(e, t, n, r, i) {
  n = n.render;
  var s = t.ref;
  return _n(t, i), r = Sa(e, t, n, r, s, i), n = ka(), e !== null && !Se ? (t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~i, mt(e, t, i)) : ($ && n && ua(t), t.flags |= 1, ge(e, t, r, i), t.child);
}
function dc(e, t, n, r, i) {
  if (e === null) {
    var s = n.type;
    return typeof s == "function" && !Ma(s) && s.defaultProps === void 0 && n.compare === null && n.defaultProps === void 0 ? (t.tag = 15, t.type = s, Vh(e, t, s, r, i)) : (e = $i(n.type, null, r, t, t.mode, i), e.ref = t.ref, e.return = t, t.child = e);
  }
  if (s = e.child, !(e.lanes & i)) {
    var o = s.memoizedProps;
    if (n = n.compare, n = n !== null ? n : Ir, n(o, r) && e.ref === t.ref) return mt(e, t, i);
  }
  return t.flags |= 1, e = Lt(s, r), e.ref = t.ref, e.return = t, t.child = e;
}
function Vh(e, t, n, r, i) {
  if (e !== null) {
    var s = e.memoizedProps;
    if (Ir(s, r) && e.ref === t.ref) if (Se = !1, t.pendingProps = r = s, (e.lanes & i) !== 0) e.flags & 131072 && (Se = !0);
    else return t.lanes = e.lanes, mt(e, t, i);
  }
  return dl(e, t, n, r, i);
}
function Rh(e, t, n) {
  var r = t.pendingProps, i = r.children, s = e !== null ? e.memoizedState : null;
  if (r.mode === "hidden") if (!(t.mode & 1)) t.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, O(Pn, Pe), Pe |= n;
  else {
    if (!(n & 1073741824)) return e = s !== null ? s.baseLanes | n : n, t.lanes = t.childLanes = 1073741824, t.memoizedState = { baseLanes: e, cachePool: null, transitions: null }, t.updateQueue = null, O(Pn, Pe), Pe |= e, null;
    t.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, r = s !== null ? s.baseLanes : n, O(Pn, Pe), Pe |= r;
  }
  else s !== null ? (r = s.baseLanes | n, t.memoizedState = null) : r = n, O(Pn, Pe), Pe |= r;
  return ge(e, t, i, n), t.child;
}
function Ah(e, t) {
  var n = t.ref;
  (e === null && n !== null || e !== null && e.ref !== n) && (t.flags |= 512, t.flags |= 2097152);
}
function dl(e, t, n, r, i) {
  var s = Te(n) ? sn : me.current;
  return s = On(t, s), _n(t, i), n = Sa(e, t, n, r, s, i), r = ka(), e !== null && !Se ? (t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~i, mt(e, t, i)) : ($ && r && ua(t), t.flags |= 1, ge(e, t, n, i), t.child);
}
function hc(e, t, n, r, i) {
  if (Te(n)) {
    var s = !0;
    ns(t);
  } else s = !1;
  if (_n(t, i), t.stateNode === null) zi(e, t), Dh(t, n, r), cl(t, n, r, i), r = !0;
  else if (e === null) {
    var o = t.stateNode, l = t.memoizedProps;
    o.props = l;
    var a = o.context, u = n.contextType;
    typeof u == "object" && u !== null ? u = ze(u) : (u = Te(n) ? sn : me.current, u = On(t, u));
    var c = n.getDerivedStateFromProps, f = typeof c == "function" || typeof o.getSnapshotBeforeUpdate == "function";
    f || typeof o.UNSAFE_componentWillReceiveProps != "function" && typeof o.componentWillReceiveProps != "function" || (l !== r || a !== u) && lc(t, o, r, u), kt = !1;
    var d = t.memoizedState;
    o.state = d, ls(t, r, o, i), a = t.memoizedState, l !== r || d !== a || ke.current || kt ? (typeof c == "function" && (ul(t, n, c, r), a = t.memoizedState), (l = kt || oc(t, n, l, r, d, a, u)) ? (f || typeof o.UNSAFE_componentWillMount != "function" && typeof o.componentWillMount != "function" || (typeof o.componentWillMount == "function" && o.componentWillMount(), typeof o.UNSAFE_componentWillMount == "function" && o.UNSAFE_componentWillMount()), typeof o.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof o.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = a), o.props = r, o.state = a, o.context = u, r = l) : (typeof o.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
  } else {
    o = t.stateNode, sh(e, t), l = t.memoizedProps, u = t.type === t.elementType ? l : We(t.type, l), o.props = u, f = t.pendingProps, d = o.context, a = n.contextType, typeof a == "object" && a !== null ? a = ze(a) : (a = Te(n) ? sn : me.current, a = On(t, a));
    var g = n.getDerivedStateFromProps;
    (c = typeof g == "function" || typeof o.getSnapshotBeforeUpdate == "function") || typeof o.UNSAFE_componentWillReceiveProps != "function" && typeof o.componentWillReceiveProps != "function" || (l !== f || d !== a) && lc(t, o, r, a), kt = !1, d = t.memoizedState, o.state = d, ls(t, r, o, i);
    var v = t.memoizedState;
    l !== f || d !== v || ke.current || kt ? (typeof g == "function" && (ul(t, n, g, r), v = t.memoizedState), (u = kt || oc(t, n, u, r, d, v, a) || !1) ? (c || typeof o.UNSAFE_componentWillUpdate != "function" && typeof o.componentWillUpdate != "function" || (typeof o.componentWillUpdate == "function" && o.componentWillUpdate(r, v, a), typeof o.UNSAFE_componentWillUpdate == "function" && o.UNSAFE_componentWillUpdate(r, v, a)), typeof o.componentDidUpdate == "function" && (t.flags |= 4), typeof o.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof o.componentDidUpdate != "function" || l === e.memoizedProps && d === e.memoizedState || (t.flags |= 4), typeof o.getSnapshotBeforeUpdate != "function" || l === e.memoizedProps && d === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = v), o.props = r, o.state = v, o.context = a, r = u) : (typeof o.componentDidUpdate != "function" || l === e.memoizedProps && d === e.memoizedState || (t.flags |= 4), typeof o.getSnapshotBeforeUpdate != "function" || l === e.memoizedProps && d === e.memoizedState || (t.flags |= 1024), r = !1);
  }
  return hl(e, t, n, r, s, i);
}
function hl(e, t, n, r, i, s) {
  Ah(e, t);
  var o = (t.flags & 128) !== 0;
  if (!r && !o) return i && qu(t, n, !1), mt(e, t, s);
  r = t.stateNode, zv.current = t;
  var l = o && typeof n.getDerivedStateFromError != "function" ? null : r.render();
  return t.flags |= 1, e !== null && o ? (t.child = Un(t, e.child, null, s), t.child = Un(t, null, l, s)) : ge(e, t, l, s), t.memoizedState = r.state, i && qu(t, n, !0), t.child;
}
function Mh(e) {
  var t = e.stateNode;
  t.pendingContext ? Zu(e, t.pendingContext, t.pendingContext !== t.context) : t.context && Zu(e, t.context, !1), va(e, t.containerInfo);
}
function pc(e, t, n, r, i) {
  return zn(), fa(i), t.flags |= 256, ge(e, t, n, r), t.child;
}
var pl = { dehydrated: null, treeContext: null, retryLane: 0 };
function ml(e) {
  return { baseLanes: e, cachePool: null, transitions: null };
}
function jh(e, t, n) {
  var r = t.pendingProps, i = W.current, s = !1, o = (t.flags & 128) !== 0, l;
  if ((l = o) || (l = e !== null && e.memoizedState === null ? !1 : (i & 2) !== 0), l ? (s = !0, t.flags &= -129) : (e === null || e.memoizedState !== null) && (i |= 1), O(W, i & 1), e === null)
    return ll(t), e = t.memoizedState, e !== null && (e = e.dehydrated, e !== null) ? (t.mode & 1 ? e.data === "$!" ? t.lanes = 8 : t.lanes = 1073741824 : t.lanes = 1, null) : (o = r.children, e = r.fallback, s ? (r = t.mode, s = t.child, o = { mode: "hidden", children: o }, !(r & 1) && s !== null ? (s.childLanes = 0, s.pendingProps = o) : s = js(o, r, 0, null), e = nn(e, r, n, null), s.return = t, e.return = t, s.sibling = e, t.child = s, t.child.memoizedState = ml(n), t.memoizedState = pl, e) : Pa(t, o));
  if (i = e.memoizedState, i !== null && (l = i.dehydrated, l !== null)) return Uv(e, t, o, r, l, i, n);
  if (s) {
    s = r.fallback, o = t.mode, i = e.child, l = i.sibling;
    var a = { mode: "hidden", children: r.children };
    return !(o & 1) && t.child !== i ? (r = t.child, r.childLanes = 0, r.pendingProps = a, t.deletions = null) : (r = Lt(i, a), r.subtreeFlags = i.subtreeFlags & 14680064), l !== null ? s = Lt(l, s) : (s = nn(s, o, n, null), s.flags |= 2), s.return = t, r.return = t, r.sibling = s, t.child = r, r = s, s = t.child, o = e.child.memoizedState, o = o === null ? ml(n) : { baseLanes: o.baseLanes | n, cachePool: null, transitions: o.transitions }, s.memoizedState = o, s.childLanes = e.childLanes & ~n, t.memoizedState = pl, r;
  }
  return s = e.child, e = s.sibling, r = Lt(s, { mode: "visible", children: r.children }), !(t.mode & 1) && (r.lanes = n), r.return = t, r.sibling = null, e !== null && (n = t.deletions, n === null ? (t.deletions = [e], t.flags |= 16) : n.push(e)), t.child = r, t.memoizedState = null, r;
}
function Pa(e, t) {
  return t = js({ mode: "visible", children: t }, e.mode, 0, null), t.return = e, e.child = t;
}
function Ti(e, t, n, r) {
  return r !== null && fa(r), Un(t, e.child, null, n), e = Pa(t, t.pendingProps.children), e.flags |= 2, t.memoizedState = null, e;
}
function Uv(e, t, n, r, i, s, o) {
  if (n)
    return t.flags & 256 ? (t.flags &= -257, r = mo(Error(T(422))), Ti(e, t, o, r)) : t.memoizedState !== null ? (t.child = e.child, t.flags |= 128, null) : (s = r.fallback, i = t.mode, r = js({ mode: "visible", children: r.children }, i, 0, null), s = nn(s, i, o, null), s.flags |= 2, r.return = t, s.return = t, r.sibling = s, t.child = r, t.mode & 1 && Un(t, e.child, null, o), t.child.memoizedState = ml(o), t.memoizedState = pl, s);
  if (!(t.mode & 1)) return Ti(e, t, o, null);
  if (i.data === "$!") {
    if (r = i.nextSibling && i.nextSibling.dataset, r) var l = r.dgst;
    return r = l, s = Error(T(419)), r = mo(s, r, void 0), Ti(e, t, o, r);
  }
  if (l = (o & e.childLanes) !== 0, Se || l) {
    if (r = se, r !== null) {
      switch (o & -o) {
        case 4:
          i = 2;
          break;
        case 16:
          i = 8;
          break;
        case 64:
        case 128:
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
        case 67108864:
          i = 32;
          break;
        case 536870912:
          i = 268435456;
          break;
        default:
          i = 0;
      }
      i = i & (r.suspendedLanes | o) ? 0 : i, i !== 0 && i !== s.retryLane && (s.retryLane = i, pt(e, i), Ge(r, e, i, -1));
    }
    return Aa(), r = mo(Error(T(421))), Ti(e, t, o, r);
  }
  return i.data === "$?" ? (t.flags |= 128, t.child = e.child, t = Jv.bind(null, e), i._reactRetry = t, null) : (e = s.treeContext, De = Rt(i.nextSibling), Ce = t, $ = !0, He = null, e !== null && (_e[Fe++] = ot, _e[Fe++] = lt, _e[Fe++] = on, ot = e.id, lt = e.overflow, on = t), t = Pa(t, r.children), t.flags |= 4096, t);
}
function mc(e, t, n) {
  e.lanes |= t;
  var r = e.alternate;
  r !== null && (r.lanes |= t), al(e.return, t, n);
}
function go(e, t, n, r, i) {
  var s = e.memoizedState;
  s === null ? e.memoizedState = { isBackwards: t, rendering: null, renderingStartTime: 0, last: r, tail: n, tailMode: i } : (s.isBackwards = t, s.rendering = null, s.renderingStartTime = 0, s.last = r, s.tail = n, s.tailMode = i);
}
function Lh(e, t, n) {
  var r = t.pendingProps, i = r.revealOrder, s = r.tail;
  if (ge(e, t, r.children, n), r = W.current, r & 2) r = r & 1 | 2, t.flags |= 128;
  else {
    if (e !== null && e.flags & 128) e: for (e = t.child; e !== null; ) {
      if (e.tag === 13) e.memoizedState !== null && mc(e, n, t);
      else if (e.tag === 19) mc(e, n, t);
      else if (e.child !== null) {
        e.child.return = e, e = e.child;
        continue;
      }
      if (e === t) break e;
      for (; e.sibling === null; ) {
        if (e.return === null || e.return === t) break e;
        e = e.return;
      }
      e.sibling.return = e.return, e = e.sibling;
    }
    r &= 1;
  }
  if (O(W, r), !(t.mode & 1)) t.memoizedState = null;
  else switch (i) {
    case "forwards":
      for (n = t.child, i = null; n !== null; ) e = n.alternate, e !== null && as(e) === null && (i = n), n = n.sibling;
      n = i, n === null ? (i = t.child, t.child = null) : (i = n.sibling, n.sibling = null), go(t, !1, i, n, s);
      break;
    case "backwards":
      for (n = null, i = t.child, t.child = null; i !== null; ) {
        if (e = i.alternate, e !== null && as(e) === null) {
          t.child = i;
          break;
        }
        e = i.sibling, i.sibling = n, n = i, i = e;
      }
      go(t, !0, n, null, s);
      break;
    case "together":
      go(t, !1, null, null, void 0);
      break;
    default:
      t.memoizedState = null;
  }
  return t.child;
}
function zi(e, t) {
  !(t.mode & 1) && e !== null && (e.alternate = null, t.alternate = null, t.flags |= 2);
}
function mt(e, t, n) {
  if (e !== null && (t.dependencies = e.dependencies), an |= t.lanes, !(n & t.childLanes)) return null;
  if (e !== null && t.child !== e.child) throw Error(T(153));
  if (t.child !== null) {
    for (e = t.child, n = Lt(e, e.pendingProps), t.child = n, n.return = t; e.sibling !== null; ) e = e.sibling, n = n.sibling = Lt(e, e.pendingProps), n.return = t;
    n.sibling = null;
  }
  return t.child;
}
function Bv(e, t, n) {
  switch (t.tag) {
    case 3:
      Mh(t), zn();
      break;
    case 5:
      oh(t);
      break;
    case 1:
      Te(t.type) && ns(t);
      break;
    case 4:
      va(t, t.stateNode.containerInfo);
      break;
    case 10:
      var r = t.type._context, i = t.memoizedProps.value;
      O(ss, r._currentValue), r._currentValue = i;
      break;
    case 13:
      if (r = t.memoizedState, r !== null)
        return r.dehydrated !== null ? (O(W, W.current & 1), t.flags |= 128, null) : n & t.child.childLanes ? jh(e, t, n) : (O(W, W.current & 1), e = mt(e, t, n), e !== null ? e.sibling : null);
      O(W, W.current & 1);
      break;
    case 19:
      if (r = (n & t.childLanes) !== 0, e.flags & 128) {
        if (r) return Lh(e, t, n);
        t.flags |= 128;
      }
      if (i = t.memoizedState, i !== null && (i.rendering = null, i.tail = null, i.lastEffect = null), O(W, W.current), r) break;
      return null;
    case 22:
    case 23:
      return t.lanes = 0, Rh(e, t, n);
  }
  return mt(e, t, n);
}
var _h, gl, Fh, Ih;
_h = function(e, t) {
  for (var n = t.child; n !== null; ) {
    if (n.tag === 5 || n.tag === 6) e.appendChild(n.stateNode);
    else if (n.tag !== 4 && n.child !== null) {
      n.child.return = n, n = n.child;
      continue;
    }
    if (n === t) break;
    for (; n.sibling === null; ) {
      if (n.return === null || n.return === t) return;
      n = n.return;
    }
    n.sibling.return = n.return, n = n.sibling;
  }
};
gl = function() {
};
Fh = function(e, t, n, r) {
  var i = e.memoizedProps;
  if (i !== r) {
    e = t.stateNode, Jt(et.current);
    var s = null;
    switch (n) {
      case "input":
        i = Oo(e, i), r = Oo(e, r), s = [];
        break;
      case "select":
        i = b({}, i, { value: void 0 }), r = b({}, r, { value: void 0 }), s = [];
        break;
      case "textarea":
        i = Bo(e, i), r = Bo(e, r), s = [];
        break;
      default:
        typeof i.onClick != "function" && typeof r.onClick == "function" && (e.onclick = es);
    }
    Wo(n, r);
    var o;
    n = null;
    for (u in i) if (!r.hasOwnProperty(u) && i.hasOwnProperty(u) && i[u] != null) if (u === "style") {
      var l = i[u];
      for (o in l) l.hasOwnProperty(o) && (n || (n = {}), n[o] = "");
    } else u !== "dangerouslySetInnerHTML" && u !== "children" && u !== "suppressContentEditableWarning" && u !== "suppressHydrationWarning" && u !== "autoFocus" && (Rr.hasOwnProperty(u) ? s || (s = []) : (s = s || []).push(u, null));
    for (u in r) {
      var a = r[u];
      if (l = i?.[u], r.hasOwnProperty(u) && a !== l && (a != null || l != null)) if (u === "style") if (l) {
        for (o in l) !l.hasOwnProperty(o) || a && a.hasOwnProperty(o) || (n || (n = {}), n[o] = "");
        for (o in a) a.hasOwnProperty(o) && l[o] !== a[o] && (n || (n = {}), n[o] = a[o]);
      } else n || (s || (s = []), s.push(
        u,
        n
      )), n = a;
      else u === "dangerouslySetInnerHTML" ? (a = a ? a.__html : void 0, l = l ? l.__html : void 0, a != null && l !== a && (s = s || []).push(u, a)) : u === "children" ? typeof a != "string" && typeof a != "number" || (s = s || []).push(u, "" + a) : u !== "suppressContentEditableWarning" && u !== "suppressHydrationWarning" && (Rr.hasOwnProperty(u) ? (a != null && u === "onScroll" && z("scroll", e), s || l === a || (s = [])) : (s = s || []).push(u, a));
    }
    n && (s = s || []).push("style", n);
    var u = s;
    (t.updateQueue = u) && (t.flags |= 4);
  }
};
Ih = function(e, t, n, r) {
  n !== r && (t.flags |= 4);
};
function or(e, t) {
  if (!$) switch (e.tailMode) {
    case "hidden":
      t = e.tail;
      for (var n = null; t !== null; ) t.alternate !== null && (n = t), t = t.sibling;
      n === null ? e.tail = null : n.sibling = null;
      break;
    case "collapsed":
      n = e.tail;
      for (var r = null; n !== null; ) n.alternate !== null && (r = n), n = n.sibling;
      r === null ? t || e.tail === null ? e.tail = null : e.tail.sibling = null : r.sibling = null;
  }
}
function fe(e) {
  var t = e.alternate !== null && e.alternate.child === e.child, n = 0, r = 0;
  if (t) for (var i = e.child; i !== null; ) n |= i.lanes | i.childLanes, r |= i.subtreeFlags & 14680064, r |= i.flags & 14680064, i.return = e, i = i.sibling;
  else for (i = e.child; i !== null; ) n |= i.lanes | i.childLanes, r |= i.subtreeFlags, r |= i.flags, i.return = e, i = i.sibling;
  return e.subtreeFlags |= r, e.childLanes = n, t;
}
function $v(e, t, n) {
  var r = t.pendingProps;
  switch (ca(t), t.tag) {
    case 2:
    case 16:
    case 15:
    case 0:
    case 11:
    case 7:
    case 8:
    case 12:
    case 9:
    case 14:
      return fe(t), null;
    case 1:
      return Te(t.type) && ts(), fe(t), null;
    case 3:
      return r = t.stateNode, Bn(), U(ke), U(me), xa(), r.pendingContext && (r.context = r.pendingContext, r.pendingContext = null), (e === null || e.child === null) && (Si(t) ? t.flags |= 4 : e === null || e.memoizedState.isDehydrated && !(t.flags & 256) || (t.flags |= 1024, He !== null && (El(He), He = null))), gl(e, t), fe(t), null;
    case 5:
      ya(t);
      var i = Jt($r.current);
      if (n = t.type, e !== null && t.stateNode != null) Fh(e, t, n, r, i), e.ref !== t.ref && (t.flags |= 512, t.flags |= 2097152);
      else {
        if (!r) {
          if (t.stateNode === null) throw Error(T(166));
          return fe(t), null;
        }
        if (e = Jt(et.current), Si(t)) {
          r = t.stateNode, n = t.type;
          var s = t.memoizedProps;
          switch (r[qe] = t, r[Ur] = s, e = (t.mode & 1) !== 0, n) {
            case "dialog":
              z("cancel", r), z("close", r);
              break;
            case "iframe":
            case "object":
            case "embed":
              z("load", r);
              break;
            case "video":
            case "audio":
              for (i = 0; i < hr.length; i++) z(hr[i], r);
              break;
            case "source":
              z("error", r);
              break;
            case "img":
            case "image":
            case "link":
              z(
                "error",
                r
              ), z("load", r);
              break;
            case "details":
              z("toggle", r);
              break;
            case "input":
              Eu(r, s), z("invalid", r);
              break;
            case "select":
              r._wrapperState = { wasMultiple: !!s.multiple }, z("invalid", r);
              break;
            case "textarea":
              Du(r, s), z("invalid", r);
          }
          Wo(n, s), i = null;
          for (var o in s) if (s.hasOwnProperty(o)) {
            var l = s[o];
            o === "children" ? typeof l == "string" ? r.textContent !== l && (s.suppressHydrationWarning !== !0 && wi(r.textContent, l, e), i = ["children", l]) : typeof l == "number" && r.textContent !== "" + l && (s.suppressHydrationWarning !== !0 && wi(
              r.textContent,
              l,
              e
            ), i = ["children", "" + l]) : Rr.hasOwnProperty(o) && l != null && o === "onScroll" && z("scroll", r);
          }
          switch (n) {
            case "input":
              di(r), Pu(r, s, !0);
              break;
            case "textarea":
              di(r), Cu(r);
              break;
            case "select":
            case "option":
              break;
            default:
              typeof s.onClick == "function" && (r.onclick = es);
          }
          r = i, t.updateQueue = r, r !== null && (t.flags |= 4);
        } else {
          o = i.nodeType === 9 ? i : i.ownerDocument, e === "http://www.w3.org/1999/xhtml" && (e = fd(n)), e === "http://www.w3.org/1999/xhtml" ? n === "script" ? (e = o.createElement("div"), e.innerHTML = "<script><\/script>", e = e.removeChild(e.firstChild)) : typeof r.is == "string" ? e = o.createElement(n, { is: r.is }) : (e = o.createElement(n), n === "select" && (o = e, r.multiple ? o.multiple = !0 : r.size && (o.size = r.size))) : e = o.createElementNS(e, n), e[qe] = t, e[Ur] = r, _h(e, t, !1, !1), t.stateNode = e;
          e: {
            switch (o = Ko(n, r), n) {
              case "dialog":
                z("cancel", e), z("close", e), i = r;
                break;
              case "iframe":
              case "object":
              case "embed":
                z("load", e), i = r;
                break;
              case "video":
              case "audio":
                for (i = 0; i < hr.length; i++) z(hr[i], e);
                i = r;
                break;
              case "source":
                z("error", e), i = r;
                break;
              case "img":
              case "image":
              case "link":
                z(
                  "error",
                  e
                ), z("load", e), i = r;
                break;
              case "details":
                z("toggle", e), i = r;
                break;
              case "input":
                Eu(e, r), i = Oo(e, r), z("invalid", e);
                break;
              case "option":
                i = r;
                break;
              case "select":
                e._wrapperState = { wasMultiple: !!r.multiple }, i = b({}, r, { value: void 0 }), z("invalid", e);
                break;
              case "textarea":
                Du(e, r), i = Bo(e, r), z("invalid", e);
                break;
              default:
                i = r;
            }
            Wo(n, i), l = i;
            for (s in l) if (l.hasOwnProperty(s)) {
              var a = l[s];
              s === "style" ? pd(e, a) : s === "dangerouslySetInnerHTML" ? (a = a ? a.__html : void 0, a != null && dd(e, a)) : s === "children" ? typeof a == "string" ? (n !== "textarea" || a !== "") && Ar(e, a) : typeof a == "number" && Ar(e, "" + a) : s !== "suppressContentEditableWarning" && s !== "suppressHydrationWarning" && s !== "autoFocus" && (Rr.hasOwnProperty(s) ? a != null && s === "onScroll" && z("scroll", e) : a != null && Yl(e, s, a, o));
            }
            switch (n) {
              case "input":
                di(e), Pu(e, r, !1);
                break;
              case "textarea":
                di(e), Cu(e);
                break;
              case "option":
                r.value != null && e.setAttribute("value", "" + _t(r.value));
                break;
              case "select":
                e.multiple = !!r.multiple, s = r.value, s != null ? An(e, !!r.multiple, s, !1) : r.defaultValue != null && An(
                  e,
                  !!r.multiple,
                  r.defaultValue,
                  !0
                );
                break;
              default:
                typeof i.onClick == "function" && (e.onclick = es);
            }
            switch (n) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                r = !!r.autoFocus;
                break e;
              case "img":
                r = !0;
                break e;
              default:
                r = !1;
            }
          }
          r && (t.flags |= 4);
        }
        t.ref !== null && (t.flags |= 512, t.flags |= 2097152);
      }
      return fe(t), null;
    case 6:
      if (e && t.stateNode != null) Ih(e, t, e.memoizedProps, r);
      else {
        if (typeof r != "string" && t.stateNode === null) throw Error(T(166));
        if (n = Jt($r.current), Jt(et.current), Si(t)) {
          if (r = t.stateNode, n = t.memoizedProps, r[qe] = t, (s = r.nodeValue !== n) && (e = Ce, e !== null)) switch (e.tag) {
            case 3:
              wi(r.nodeValue, n, (e.mode & 1) !== 0);
              break;
            case 5:
              e.memoizedProps.suppressHydrationWarning !== !0 && wi(r.nodeValue, n, (e.mode & 1) !== 0);
          }
          s && (t.flags |= 4);
        } else r = (n.nodeType === 9 ? n : n.ownerDocument).createTextNode(r), r[qe] = t, t.stateNode = r;
      }
      return fe(t), null;
    case 13:
      if (U(W), r = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
        if ($ && De !== null && t.mode & 1 && !(t.flags & 128)) th(), zn(), t.flags |= 98560, s = !1;
        else if (s = Si(t), r !== null && r.dehydrated !== null) {
          if (e === null) {
            if (!s) throw Error(T(318));
            if (s = t.memoizedState, s = s !== null ? s.dehydrated : null, !s) throw Error(T(317));
            s[qe] = t;
          } else zn(), !(t.flags & 128) && (t.memoizedState = null), t.flags |= 4;
          fe(t), s = !1;
        } else He !== null && (El(He), He = null), s = !0;
        if (!s) return t.flags & 65536 ? t : null;
      }
      return t.flags & 128 ? (t.lanes = n, t) : (r = r !== null, r !== (e !== null && e.memoizedState !== null) && r && (t.child.flags |= 8192, t.mode & 1 && (e === null || W.current & 1 ? te === 0 && (te = 3) : Aa())), t.updateQueue !== null && (t.flags |= 4), fe(t), null);
    case 4:
      return Bn(), gl(e, t), e === null && Or(t.stateNode.containerInfo), fe(t), null;
    case 10:
      return pa(t.type._context), fe(t), null;
    case 17:
      return Te(t.type) && ts(), fe(t), null;
    case 19:
      if (U(W), s = t.memoizedState, s === null) return fe(t), null;
      if (r = (t.flags & 128) !== 0, o = s.rendering, o === null) if (r) or(s, !1);
      else {
        if (te !== 0 || e !== null && e.flags & 128) for (e = t.child; e !== null; ) {
          if (o = as(e), o !== null) {
            for (t.flags |= 128, or(s, !1), r = o.updateQueue, r !== null && (t.updateQueue = r, t.flags |= 4), t.subtreeFlags = 0, r = n, n = t.child; n !== null; ) s = n, e = r, s.flags &= 14680066, o = s.alternate, o === null ? (s.childLanes = 0, s.lanes = e, s.child = null, s.subtreeFlags = 0, s.memoizedProps = null, s.memoizedState = null, s.updateQueue = null, s.dependencies = null, s.stateNode = null) : (s.childLanes = o.childLanes, s.lanes = o.lanes, s.child = o.child, s.subtreeFlags = 0, s.deletions = null, s.memoizedProps = o.memoizedProps, s.memoizedState = o.memoizedState, s.updateQueue = o.updateQueue, s.type = o.type, e = o.dependencies, s.dependencies = e === null ? null : { lanes: e.lanes, firstContext: e.firstContext }), n = n.sibling;
            return O(W, W.current & 1 | 2), t.child;
          }
          e = e.sibling;
        }
        s.tail !== null && Z() > Wn && (t.flags |= 128, r = !0, or(s, !1), t.lanes = 4194304);
      }
      else {
        if (!r) if (e = as(o), e !== null) {
          if (t.flags |= 128, r = !0, n = e.updateQueue, n !== null && (t.updateQueue = n, t.flags |= 4), or(s, !0), s.tail === null && s.tailMode === "hidden" && !o.alternate && !$) return fe(t), null;
        } else 2 * Z() - s.renderingStartTime > Wn && n !== 1073741824 && (t.flags |= 128, r = !0, or(s, !1), t.lanes = 4194304);
        s.isBackwards ? (o.sibling = t.child, t.child = o) : (n = s.last, n !== null ? n.sibling = o : t.child = o, s.last = o);
      }
      return s.tail !== null ? (t = s.tail, s.rendering = t, s.tail = t.sibling, s.renderingStartTime = Z(), t.sibling = null, n = W.current, O(W, r ? n & 1 | 2 : n & 1), t) : (fe(t), null);
    case 22:
    case 23:
      return Ra(), r = t.memoizedState !== null, e !== null && e.memoizedState !== null !== r && (t.flags |= 8192), r && t.mode & 1 ? Pe & 1073741824 && (fe(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : fe(t), null;
    case 24:
      return null;
    case 25:
      return null;
  }
  throw Error(T(156, t.tag));
}
function Wv(e, t) {
  switch (ca(t), t.tag) {
    case 1:
      return Te(t.type) && ts(), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
    case 3:
      return Bn(), U(ke), U(me), xa(), e = t.flags, e & 65536 && !(e & 128) ? (t.flags = e & -65537 | 128, t) : null;
    case 5:
      return ya(t), null;
    case 13:
      if (U(W), e = t.memoizedState, e !== null && e.dehydrated !== null) {
        if (t.alternate === null) throw Error(T(340));
        zn();
      }
      return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
    case 19:
      return U(W), null;
    case 4:
      return Bn(), null;
    case 10:
      return pa(t.type._context), null;
    case 22:
    case 23:
      return Ra(), null;
    case 24:
      return null;
    default:
      return null;
  }
}
var Ei = !1, he = !1, Kv = typeof WeakSet == "function" ? WeakSet : Set, N = null;
function En(e, t) {
  var n = e.ref;
  if (n !== null) if (typeof n == "function") try {
    n(null);
  } catch (r) {
    Q(e, t, r);
  }
  else n.current = null;
}
function vl(e, t, n) {
  try {
    n();
  } catch (r) {
    Q(e, t, r);
  }
}
var gc = !1;
function Hv(e, t) {
  if (el = Zi, e = $d(), aa(e)) {
    if ("selectionStart" in e) var n = { start: e.selectionStart, end: e.selectionEnd };
    else e: {
      n = (n = e.ownerDocument) && n.defaultView || window;
      var r = n.getSelection && n.getSelection();
      if (r && r.rangeCount !== 0) {
        n = r.anchorNode;
        var i = r.anchorOffset, s = r.focusNode;
        r = r.focusOffset;
        try {
          n.nodeType, s.nodeType;
        } catch {
          n = null;
          break e;
        }
        var o = 0, l = -1, a = -1, u = 0, c = 0, f = e, d = null;
        t: for (; ; ) {
          for (var g; f !== n || i !== 0 && f.nodeType !== 3 || (l = o + i), f !== s || r !== 0 && f.nodeType !== 3 || (a = o + r), f.nodeType === 3 && (o += f.nodeValue.length), (g = f.firstChild) !== null; )
            d = f, f = g;
          for (; ; ) {
            if (f === e) break t;
            if (d === n && ++u === i && (l = o), d === s && ++c === r && (a = o), (g = f.nextSibling) !== null) break;
            f = d, d = f.parentNode;
          }
          f = g;
        }
        n = l === -1 || a === -1 ? null : { start: l, end: a };
      } else n = null;
    }
    n = n || { start: 0, end: 0 };
  } else n = null;
  for (tl = { focusedElem: e, selectionRange: n }, Zi = !1, N = t; N !== null; ) if (t = N, e = t.child, (t.subtreeFlags & 1028) !== 0 && e !== null) e.return = t, N = e;
  else for (; N !== null; ) {
    t = N;
    try {
      var v = t.alternate;
      if (t.flags & 1024) switch (t.tag) {
        case 0:
        case 11:
        case 15:
          break;
        case 1:
          if (v !== null) {
            var y = v.memoizedProps, S = v.memoizedState, p = t.stateNode, h = p.getSnapshotBeforeUpdate(t.elementType === t.type ? y : We(t.type, y), S);
            p.__reactInternalSnapshotBeforeUpdate = h;
          }
          break;
        case 3:
          var m = t.stateNode.containerInfo;
          m.nodeType === 1 ? m.textContent = "" : m.nodeType === 9 && m.documentElement && m.removeChild(m.documentElement);
          break;
        case 5:
        case 6:
        case 4:
        case 17:
          break;
        default:
          throw Error(T(163));
      }
    } catch (x) {
      Q(t, t.return, x);
    }
    if (e = t.sibling, e !== null) {
      e.return = t.return, N = e;
      break;
    }
    N = t.return;
  }
  return v = gc, gc = !1, v;
}
function Tr(e, t, n) {
  var r = t.updateQueue;
  if (r = r !== null ? r.lastEffect : null, r !== null) {
    var i = r = r.next;
    do {
      if ((i.tag & e) === e) {
        var s = i.destroy;
        i.destroy = void 0, s !== void 0 && vl(t, n, s);
      }
      i = i.next;
    } while (i !== r);
  }
}
function As(e, t) {
  if (t = t.updateQueue, t = t !== null ? t.lastEffect : null, t !== null) {
    var n = t = t.next;
    do {
      if ((n.tag & e) === e) {
        var r = n.create;
        n.destroy = r();
      }
      n = n.next;
    } while (n !== t);
  }
}
function yl(e) {
  var t = e.ref;
  if (t !== null) {
    var n = e.stateNode;
    switch (e.tag) {
      case 5:
        e = n;
        break;
      default:
        e = n;
    }
    typeof t == "function" ? t(e) : t.current = e;
  }
}
function Oh(e) {
  var t = e.alternate;
  t !== null && (e.alternate = null, Oh(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && (delete t[qe], delete t[Ur], delete t[il], delete t[Cv], delete t[Nv])), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
}
function zh(e) {
  return e.tag === 5 || e.tag === 3 || e.tag === 4;
}
function vc(e) {
  e: for (; ; ) {
    for (; e.sibling === null; ) {
      if (e.return === null || zh(e.return)) return null;
      e = e.return;
    }
    for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
      if (e.flags & 2 || e.child === null || e.tag === 4) continue e;
      e.child.return = e, e = e.child;
    }
    if (!(e.flags & 2)) return e.stateNode;
  }
}
function xl(e, t, n) {
  var r = e.tag;
  if (r === 5 || r === 6) e = e.stateNode, t ? n.nodeType === 8 ? n.parentNode.insertBefore(e, t) : n.insertBefore(e, t) : (n.nodeType === 8 ? (t = n.parentNode, t.insertBefore(e, n)) : (t = n, t.appendChild(e)), n = n._reactRootContainer, n != null || t.onclick !== null || (t.onclick = es));
  else if (r !== 4 && (e = e.child, e !== null)) for (xl(e, t, n), e = e.sibling; e !== null; ) xl(e, t, n), e = e.sibling;
}
function wl(e, t, n) {
  var r = e.tag;
  if (r === 5 || r === 6) e = e.stateNode, t ? n.insertBefore(e, t) : n.appendChild(e);
  else if (r !== 4 && (e = e.child, e !== null)) for (wl(e, t, n), e = e.sibling; e !== null; ) wl(e, t, n), e = e.sibling;
}
var oe = null, Ke = !1;
function xt(e, t, n) {
  for (n = n.child; n !== null; ) Uh(e, t, n), n = n.sibling;
}
function Uh(e, t, n) {
  if (Je && typeof Je.onCommitFiberUnmount == "function") try {
    Je.onCommitFiberUnmount(Ts, n);
  } catch {
  }
  switch (n.tag) {
    case 5:
      he || En(n, t);
    case 6:
      var r = oe, i = Ke;
      oe = null, xt(e, t, n), oe = r, Ke = i, oe !== null && (Ke ? (e = oe, n = n.stateNode, e.nodeType === 8 ? e.parentNode.removeChild(n) : e.removeChild(n)) : oe.removeChild(n.stateNode));
      break;
    case 18:
      oe !== null && (Ke ? (e = oe, n = n.stateNode, e.nodeType === 8 ? ao(e.parentNode, n) : e.nodeType === 1 && ao(e, n), _r(e)) : ao(oe, n.stateNode));
      break;
    case 4:
      r = oe, i = Ke, oe = n.stateNode.containerInfo, Ke = !0, xt(e, t, n), oe = r, Ke = i;
      break;
    case 0:
    case 11:
    case 14:
    case 15:
      if (!he && (r = n.updateQueue, r !== null && (r = r.lastEffect, r !== null))) {
        i = r = r.next;
        do {
          var s = i, o = s.destroy;
          s = s.tag, o !== void 0 && (s & 2 || s & 4) && vl(n, t, o), i = i.next;
        } while (i !== r);
      }
      xt(e, t, n);
      break;
    case 1:
      if (!he && (En(n, t), r = n.stateNode, typeof r.componentWillUnmount == "function")) try {
        r.props = n.memoizedProps, r.state = n.memoizedState, r.componentWillUnmount();
      } catch (l) {
        Q(n, t, l);
      }
      xt(e, t, n);
      break;
    case 21:
      xt(e, t, n);
      break;
    case 22:
      n.mode & 1 ? (he = (r = he) || n.memoizedState !== null, xt(e, t, n), he = r) : xt(e, t, n);
      break;
    default:
      xt(e, t, n);
  }
}
function yc(e) {
  var t = e.updateQueue;
  if (t !== null) {
    e.updateQueue = null;
    var n = e.stateNode;
    n === null && (n = e.stateNode = new Kv()), t.forEach(function(r) {
      var i = ey.bind(null, e, r);
      n.has(r) || (n.add(r), r.then(i, i));
    });
  }
}
function Be(e, t) {
  var n = t.deletions;
  if (n !== null) for (var r = 0; r < n.length; r++) {
    var i = n[r];
    try {
      var s = e, o = t, l = o;
      e: for (; l !== null; ) {
        switch (l.tag) {
          case 5:
            oe = l.stateNode, Ke = !1;
            break e;
          case 3:
            oe = l.stateNode.containerInfo, Ke = !0;
            break e;
          case 4:
            oe = l.stateNode.containerInfo, Ke = !0;
            break e;
        }
        l = l.return;
      }
      if (oe === null) throw Error(T(160));
      Uh(s, o, i), oe = null, Ke = !1;
      var a = i.alternate;
      a !== null && (a.return = null), i.return = null;
    } catch (u) {
      Q(i, t, u);
    }
  }
  if (t.subtreeFlags & 12854) for (t = t.child; t !== null; ) Bh(t, e), t = t.sibling;
}
function Bh(e, t) {
  var n = e.alternate, r = e.flags;
  switch (e.tag) {
    case 0:
    case 11:
    case 14:
    case 15:
      if (Be(t, e), Xe(e), r & 4) {
        try {
          Tr(3, e, e.return), As(3, e);
        } catch (y) {
          Q(e, e.return, y);
        }
        try {
          Tr(5, e, e.return);
        } catch (y) {
          Q(e, e.return, y);
        }
      }
      break;
    case 1:
      Be(t, e), Xe(e), r & 512 && n !== null && En(n, n.return);
      break;
    case 5:
      if (Be(t, e), Xe(e), r & 512 && n !== null && En(n, n.return), e.flags & 32) {
        var i = e.stateNode;
        try {
          Ar(i, "");
        } catch (y) {
          Q(e, e.return, y);
        }
      }
      if (r & 4 && (i = e.stateNode, i != null)) {
        var s = e.memoizedProps, o = n !== null ? n.memoizedProps : s, l = e.type, a = e.updateQueue;
        if (e.updateQueue = null, a !== null) try {
          l === "input" && s.type === "radio" && s.name != null && ud(i, s), Ko(l, o);
          var u = Ko(l, s);
          for (o = 0; o < a.length; o += 2) {
            var c = a[o], f = a[o + 1];
            c === "style" ? pd(i, f) : c === "dangerouslySetInnerHTML" ? dd(i, f) : c === "children" ? Ar(i, f) : Yl(i, c, f, u);
          }
          switch (l) {
            case "input":
              zo(i, s);
              break;
            case "textarea":
              cd(i, s);
              break;
            case "select":
              var d = i._wrapperState.wasMultiple;
              i._wrapperState.wasMultiple = !!s.multiple;
              var g = s.value;
              g != null ? An(i, !!s.multiple, g, !1) : d !== !!s.multiple && (s.defaultValue != null ? An(
                i,
                !!s.multiple,
                s.defaultValue,
                !0
              ) : An(i, !!s.multiple, s.multiple ? [] : "", !1));
          }
          i[Ur] = s;
        } catch (y) {
          Q(e, e.return, y);
        }
      }
      break;
    case 6:
      if (Be(t, e), Xe(e), r & 4) {
        if (e.stateNode === null) throw Error(T(162));
        i = e.stateNode, s = e.memoizedProps;
        try {
          i.nodeValue = s;
        } catch (y) {
          Q(e, e.return, y);
        }
      }
      break;
    case 3:
      if (Be(t, e), Xe(e), r & 4 && n !== null && n.memoizedState.isDehydrated) try {
        _r(t.containerInfo);
      } catch (y) {
        Q(e, e.return, y);
      }
      break;
    case 4:
      Be(t, e), Xe(e);
      break;
    case 13:
      Be(t, e), Xe(e), i = e.child, i.flags & 8192 && (s = i.memoizedState !== null, i.stateNode.isHidden = s, !s || i.alternate !== null && i.alternate.memoizedState !== null || (Na = Z())), r & 4 && yc(e);
      break;
    case 22:
      if (c = n !== null && n.memoizedState !== null, e.mode & 1 ? (he = (u = he) || c, Be(t, e), he = u) : Be(t, e), Xe(e), r & 8192) {
        if (u = e.memoizedState !== null, (e.stateNode.isHidden = u) && !c && e.mode & 1) for (N = e, c = e.child; c !== null; ) {
          for (f = N = c; N !== null; ) {
            switch (d = N, g = d.child, d.tag) {
              case 0:
              case 11:
              case 14:
              case 15:
                Tr(4, d, d.return);
                break;
              case 1:
                En(d, d.return);
                var v = d.stateNode;
                if (typeof v.componentWillUnmount == "function") {
                  r = d, n = d.return;
                  try {
                    t = r, v.props = t.memoizedProps, v.state = t.memoizedState, v.componentWillUnmount();
                  } catch (y) {
                    Q(r, n, y);
                  }
                }
                break;
              case 5:
                En(d, d.return);
                break;
              case 22:
                if (d.memoizedState !== null) {
                  wc(f);
                  continue;
                }
            }
            g !== null ? (g.return = d, N = g) : wc(f);
          }
          c = c.sibling;
        }
        e: for (c = null, f = e; ; ) {
          if (f.tag === 5) {
            if (c === null) {
              c = f;
              try {
                i = f.stateNode, u ? (s = i.style, typeof s.setProperty == "function" ? s.setProperty("display", "none", "important") : s.display = "none") : (l = f.stateNode, a = f.memoizedProps.style, o = a != null && a.hasOwnProperty("display") ? a.display : null, l.style.display = hd("display", o));
              } catch (y) {
                Q(e, e.return, y);
              }
            }
          } else if (f.tag === 6) {
            if (c === null) try {
              f.stateNode.nodeValue = u ? "" : f.memoizedProps;
            } catch (y) {
              Q(e, e.return, y);
            }
          } else if ((f.tag !== 22 && f.tag !== 23 || f.memoizedState === null || f === e) && f.child !== null) {
            f.child.return = f, f = f.child;
            continue;
          }
          if (f === e) break e;
          for (; f.sibling === null; ) {
            if (f.return === null || f.return === e) break e;
            c === f && (c = null), f = f.return;
          }
          c === f && (c = null), f.sibling.return = f.return, f = f.sibling;
        }
      }
      break;
    case 19:
      Be(t, e), Xe(e), r & 4 && yc(e);
      break;
    case 21:
      break;
    default:
      Be(
        t,
        e
      ), Xe(e);
  }
}
function Xe(e) {
  var t = e.flags;
  if (t & 2) {
    try {
      e: {
        for (var n = e.return; n !== null; ) {
          if (zh(n)) {
            var r = n;
            break e;
          }
          n = n.return;
        }
        throw Error(T(160));
      }
      switch (r.tag) {
        case 5:
          var i = r.stateNode;
          r.flags & 32 && (Ar(i, ""), r.flags &= -33);
          var s = vc(e);
          wl(e, s, i);
          break;
        case 3:
        case 4:
          var o = r.stateNode.containerInfo, l = vc(e);
          xl(e, l, o);
          break;
        default:
          throw Error(T(161));
      }
    } catch (a) {
      Q(e, e.return, a);
    }
    e.flags &= -3;
  }
  t & 4096 && (e.flags &= -4097);
}
function bv(e, t, n) {
  N = e, $h(e);
}
function $h(e, t, n) {
  for (var r = (e.mode & 1) !== 0; N !== null; ) {
    var i = N, s = i.child;
    if (i.tag === 22 && r) {
      var o = i.memoizedState !== null || Ei;
      if (!o) {
        var l = i.alternate, a = l !== null && l.memoizedState !== null || he;
        l = Ei;
        var u = he;
        if (Ei = o, (he = a) && !u) for (N = i; N !== null; ) o = N, a = o.child, o.tag === 22 && o.memoizedState !== null ? Sc(i) : a !== null ? (a.return = o, N = a) : Sc(i);
        for (; s !== null; ) N = s, $h(s), s = s.sibling;
        N = i, Ei = l, he = u;
      }
      xc(e);
    } else i.subtreeFlags & 8772 && s !== null ? (s.return = i, N = s) : xc(e);
  }
}
function xc(e) {
  for (; N !== null; ) {
    var t = N;
    if (t.flags & 8772) {
      var n = t.alternate;
      try {
        if (t.flags & 8772) switch (t.tag) {
          case 0:
          case 11:
          case 15:
            he || As(5, t);
            break;
          case 1:
            var r = t.stateNode;
            if (t.flags & 4 && !he) if (n === null) r.componentDidMount();
            else {
              var i = t.elementType === t.type ? n.memoizedProps : We(t.type, n.memoizedProps);
              r.componentDidUpdate(i, n.memoizedState, r.__reactInternalSnapshotBeforeUpdate);
            }
            var s = t.updateQueue;
            s !== null && rc(t, s, r);
            break;
          case 3:
            var o = t.updateQueue;
            if (o !== null) {
              if (n = null, t.child !== null) switch (t.child.tag) {
                case 5:
                  n = t.child.stateNode;
                  break;
                case 1:
                  n = t.child.stateNode;
              }
              rc(t, o, n);
            }
            break;
          case 5:
            var l = t.stateNode;
            if (n === null && t.flags & 4) {
              n = l;
              var a = t.memoizedProps;
              switch (t.type) {
                case "button":
                case "input":
                case "select":
                case "textarea":
                  a.autoFocus && n.focus();
                  break;
                case "img":
                  a.src && (n.src = a.src);
              }
            }
            break;
          case 6:
            break;
          case 4:
            break;
          case 12:
            break;
          case 13:
            if (t.memoizedState === null) {
              var u = t.alternate;
              if (u !== null) {
                var c = u.memoizedState;
                if (c !== null) {
                  var f = c.dehydrated;
                  f !== null && _r(f);
                }
              }
            }
            break;
          case 19:
          case 17:
          case 21:
          case 22:
          case 23:
          case 25:
            break;
          default:
            throw Error(T(163));
        }
        he || t.flags & 512 && yl(t);
      } catch (d) {
        Q(t, t.return, d);
      }
    }
    if (t === e) {
      N = null;
      break;
    }
    if (n = t.sibling, n !== null) {
      n.return = t.return, N = n;
      break;
    }
    N = t.return;
  }
}
function wc(e) {
  for (; N !== null; ) {
    var t = N;
    if (t === e) {
      N = null;
      break;
    }
    var n = t.sibling;
    if (n !== null) {
      n.return = t.return, N = n;
      break;
    }
    N = t.return;
  }
}
function Sc(e) {
  for (; N !== null; ) {
    var t = N;
    try {
      switch (t.tag) {
        case 0:
        case 11:
        case 15:
          var n = t.return;
          try {
            As(4, t);
          } catch (a) {
            Q(t, n, a);
          }
          break;
        case 1:
          var r = t.stateNode;
          if (typeof r.componentDidMount == "function") {
            var i = t.return;
            try {
              r.componentDidMount();
            } catch (a) {
              Q(t, i, a);
            }
          }
          var s = t.return;
          try {
            yl(t);
          } catch (a) {
            Q(t, s, a);
          }
          break;
        case 5:
          var o = t.return;
          try {
            yl(t);
          } catch (a) {
            Q(t, o, a);
          }
      }
    } catch (a) {
      Q(t, t.return, a);
    }
    if (t === e) {
      N = null;
      break;
    }
    var l = t.sibling;
    if (l !== null) {
      l.return = t.return, N = l;
      break;
    }
    N = t.return;
  }
}
var Gv = Math.ceil, fs = vt.ReactCurrentDispatcher, Da = vt.ReactCurrentOwner, Oe = vt.ReactCurrentBatchConfig, F = 0, se = null, q = null, ae = 0, Pe = 0, Pn = Ut(0), te = 0, br = null, an = 0, Ms = 0, Ca = 0, Er = null, we = null, Na = 0, Wn = 1 / 0, it = null, ds = !1, Sl = null, Mt = null, Pi = !1, Dt = null, hs = 0, Pr = 0, kl = null, Ui = -1, Bi = 0;
function ve() {
  return F & 6 ? Z() : Ui !== -1 ? Ui : Ui = Z();
}
function jt(e) {
  return e.mode & 1 ? F & 2 && ae !== 0 ? ae & -ae : Rv.transition !== null ? (Bi === 0 && (Bi = Dd()), Bi) : (e = I, e !== 0 || (e = window.event, e = e === void 0 ? 16 : jd(e.type)), e) : 1;
}
function Ge(e, t, n, r) {
  if (50 < Pr) throw Pr = 0, kl = null, Error(T(185));
  Jr(e, n, r), (!(F & 2) || e !== se) && (e === se && (!(F & 2) && (Ms |= n), te === 4 && Et(e, ae)), Ee(e, r), n === 1 && F === 0 && !(t.mode & 1) && (Wn = Z() + 500, Ns && Bt()));
}
function Ee(e, t) {
  var n = e.callbackNode;
  Rg(e, t);
  var r = Xi(e, e === se ? ae : 0);
  if (r === 0) n !== null && Ru(n), e.callbackNode = null, e.callbackPriority = 0;
  else if (t = r & -r, e.callbackPriority !== t) {
    if (n != null && Ru(n), t === 1) e.tag === 0 ? Vv(kc.bind(null, e)) : qd(kc.bind(null, e)), Pv(function() {
      !(F & 6) && Bt();
    }), n = null;
    else {
      switch (Cd(r)) {
        case 1:
          n = ea;
          break;
        case 4:
          n = Ed;
          break;
        case 16:
          n = Yi;
          break;
        case 536870912:
          n = Pd;
          break;
        default:
          n = Yi;
      }
      n = Xh(n, Wh.bind(null, e));
    }
    e.callbackPriority = t, e.callbackNode = n;
  }
}
function Wh(e, t) {
  if (Ui = -1, Bi = 0, F & 6) throw Error(T(327));
  var n = e.callbackNode;
  if (Fn() && e.callbackNode !== n) return null;
  var r = Xi(e, e === se ? ae : 0);
  if (r === 0) return null;
  if (r & 30 || r & e.expiredLanes || t) t = ps(e, r);
  else {
    t = r;
    var i = F;
    F |= 2;
    var s = Hh();
    (se !== e || ae !== t) && (it = null, Wn = Z() + 500, tn(e, t));
    do
      try {
        Xv();
        break;
      } catch (l) {
        Kh(e, l);
      }
    while (!0);
    ha(), fs.current = s, F = i, q !== null ? t = 0 : (se = null, ae = 0, t = te);
  }
  if (t !== 0) {
    if (t === 2 && (i = Yo(e), i !== 0 && (r = i, t = Tl(e, i))), t === 1) throw n = br, tn(e, 0), Et(e, r), Ee(e, Z()), n;
    if (t === 6) Et(e, r);
    else {
      if (i = e.current.alternate, !(r & 30) && !Qv(i) && (t = ps(e, r), t === 2 && (s = Yo(e), s !== 0 && (r = s, t = Tl(e, s))), t === 1)) throw n = br, tn(e, 0), Et(e, r), Ee(e, Z()), n;
      switch (e.finishedWork = i, e.finishedLanes = r, t) {
        case 0:
        case 1:
          throw Error(T(345));
        case 2:
          Qt(e, we, it);
          break;
        case 3:
          if (Et(e, r), (r & 130023424) === r && (t = Na + 500 - Z(), 10 < t)) {
            if (Xi(e, 0) !== 0) break;
            if (i = e.suspendedLanes, (i & r) !== r) {
              ve(), e.pingedLanes |= e.suspendedLanes & i;
              break;
            }
            e.timeoutHandle = rl(Qt.bind(null, e, we, it), t);
            break;
          }
          Qt(e, we, it);
          break;
        case 4:
          if (Et(e, r), (r & 4194240) === r) break;
          for (t = e.eventTimes, i = -1; 0 < r; ) {
            var o = 31 - be(r);
            s = 1 << o, o = t[o], o > i && (i = o), r &= ~s;
          }
          if (r = i, r = Z() - r, r = (120 > r ? 120 : 480 > r ? 480 : 1080 > r ? 1080 : 1920 > r ? 1920 : 3e3 > r ? 3e3 : 4320 > r ? 4320 : 1960 * Gv(r / 1960)) - r, 10 < r) {
            e.timeoutHandle = rl(Qt.bind(null, e, we, it), r);
            break;
          }
          Qt(e, we, it);
          break;
        case 5:
          Qt(e, we, it);
          break;
        default:
          throw Error(T(329));
      }
    }
  }
  return Ee(e, Z()), e.callbackNode === n ? Wh.bind(null, e) : null;
}
function Tl(e, t) {
  var n = Er;
  return e.current.memoizedState.isDehydrated && (tn(e, t).flags |= 256), e = ps(e, t), e !== 2 && (t = we, we = n, t !== null && El(t)), e;
}
function El(e) {
  we === null ? we = e : we.push.apply(we, e);
}
function Qv(e) {
  for (var t = e; ; ) {
    if (t.flags & 16384) {
      var n = t.updateQueue;
      if (n !== null && (n = n.stores, n !== null)) for (var r = 0; r < n.length; r++) {
        var i = n[r], s = i.getSnapshot;
        i = i.value;
        try {
          if (!Ye(s(), i)) return !1;
        } catch {
          return !1;
        }
      }
    }
    if (n = t.child, t.subtreeFlags & 16384 && n !== null) n.return = t, t = n;
    else {
      if (t === e) break;
      for (; t.sibling === null; ) {
        if (t.return === null || t.return === e) return !0;
        t = t.return;
      }
      t.sibling.return = t.return, t = t.sibling;
    }
  }
  return !0;
}
function Et(e, t) {
  for (t &= ~Ca, t &= ~Ms, e.suspendedLanes |= t, e.pingedLanes &= ~t, e = e.expirationTimes; 0 < t; ) {
    var n = 31 - be(t), r = 1 << n;
    e[n] = -1, t &= ~r;
  }
}
function kc(e) {
  if (F & 6) throw Error(T(327));
  Fn();
  var t = Xi(e, 0);
  if (!(t & 1)) return Ee(e, Z()), null;
  var n = ps(e, t);
  if (e.tag !== 0 && n === 2) {
    var r = Yo(e);
    r !== 0 && (t = r, n = Tl(e, r));
  }
  if (n === 1) throw n = br, tn(e, 0), Et(e, t), Ee(e, Z()), n;
  if (n === 6) throw Error(T(345));
  return e.finishedWork = e.current.alternate, e.finishedLanes = t, Qt(e, we, it), Ee(e, Z()), null;
}
function Va(e, t) {
  var n = F;
  F |= 1;
  try {
    return e(t);
  } finally {
    F = n, F === 0 && (Wn = Z() + 500, Ns && Bt());
  }
}
function un(e) {
  Dt !== null && Dt.tag === 0 && !(F & 6) && Fn();
  var t = F;
  F |= 1;
  var n = Oe.transition, r = I;
  try {
    if (Oe.transition = null, I = 1, e) return e();
  } finally {
    I = r, Oe.transition = n, F = t, !(F & 6) && Bt();
  }
}
function Ra() {
  Pe = Pn.current, U(Pn);
}
function tn(e, t) {
  e.finishedWork = null, e.finishedLanes = 0;
  var n = e.timeoutHandle;
  if (n !== -1 && (e.timeoutHandle = -1, Ev(n)), q !== null) for (n = q.return; n !== null; ) {
    var r = n;
    switch (ca(r), r.tag) {
      case 1:
        r = r.type.childContextTypes, r != null && ts();
        break;
      case 3:
        Bn(), U(ke), U(me), xa();
        break;
      case 5:
        ya(r);
        break;
      case 4:
        Bn();
        break;
      case 13:
        U(W);
        break;
      case 19:
        U(W);
        break;
      case 10:
        pa(r.type._context);
        break;
      case 22:
      case 23:
        Ra();
    }
    n = n.return;
  }
  if (se = e, q = e = Lt(e.current, null), ae = Pe = t, te = 0, br = null, Ca = Ms = an = 0, we = Er = null, qt !== null) {
    for (t = 0; t < qt.length; t++) if (n = qt[t], r = n.interleaved, r !== null) {
      n.interleaved = null;
      var i = r.next, s = n.pending;
      if (s !== null) {
        var o = s.next;
        s.next = i, r.next = o;
      }
      n.pending = r;
    }
    qt = null;
  }
  return e;
}
function Kh(e, t) {
  do {
    var n = q;
    try {
      if (ha(), Ii.current = cs, us) {
        for (var r = H.memoizedState; r !== null; ) {
          var i = r.queue;
          i !== null && (i.pending = null), r = r.next;
        }
        us = !1;
      }
      if (ln = 0, ie = ee = H = null, kr = !1, Wr = 0, Da.current = null, n === null || n.return === null) {
        te = 1, br = t, q = null;
        break;
      }
      e: {
        var s = e, o = n.return, l = n, a = t;
        if (t = ae, l.flags |= 32768, a !== null && typeof a == "object" && typeof a.then == "function") {
          var u = a, c = l, f = c.tag;
          if (!(c.mode & 1) && (f === 0 || f === 11 || f === 15)) {
            var d = c.alternate;
            d ? (c.updateQueue = d.updateQueue, c.memoizedState = d.memoizedState, c.lanes = d.lanes) : (c.updateQueue = null, c.memoizedState = null);
          }
          var g = uc(o);
          if (g !== null) {
            g.flags &= -257, cc(g, o, l, s, t), g.mode & 1 && ac(s, u, t), t = g, a = u;
            var v = t.updateQueue;
            if (v === null) {
              var y = /* @__PURE__ */ new Set();
              y.add(a), t.updateQueue = y;
            } else v.add(a);
            break e;
          } else {
            if (!(t & 1)) {
              ac(s, u, t), Aa();
              break e;
            }
            a = Error(T(426));
          }
        } else if ($ && l.mode & 1) {
          var S = uc(o);
          if (S !== null) {
            !(S.flags & 65536) && (S.flags |= 256), cc(S, o, l, s, t), fa($n(a, l));
            break e;
          }
        }
        s = a = $n(a, l), te !== 4 && (te = 2), Er === null ? Er = [s] : Er.push(s), s = o;
        do {
          switch (s.tag) {
            case 3:
              s.flags |= 65536, t &= -t, s.lanes |= t;
              var p = Ch(s, a, t);
              nc(s, p);
              break e;
            case 1:
              l = a;
              var h = s.type, m = s.stateNode;
              if (!(s.flags & 128) && (typeof h.getDerivedStateFromError == "function" || m !== null && typeof m.componentDidCatch == "function" && (Mt === null || !Mt.has(m)))) {
                s.flags |= 65536, t &= -t, s.lanes |= t;
                var x = Nh(s, l, t);
                nc(s, x);
                break e;
              }
          }
          s = s.return;
        } while (s !== null);
      }
      Gh(n);
    } catch (w) {
      t = w, q === n && n !== null && (q = n = n.return);
      continue;
    }
    break;
  } while (!0);
}
function Hh() {
  var e = fs.current;
  return fs.current = cs, e === null ? cs : e;
}
function Aa() {
  (te === 0 || te === 3 || te === 2) && (te = 4), se === null || !(an & 268435455) && !(Ms & 268435455) || Et(se, ae);
}
function ps(e, t) {
  var n = F;
  F |= 2;
  var r = Hh();
  (se !== e || ae !== t) && (it = null, tn(e, t));
  do
    try {
      Yv();
      break;
    } catch (i) {
      Kh(e, i);
    }
  while (!0);
  if (ha(), F = n, fs.current = r, q !== null) throw Error(T(261));
  return se = null, ae = 0, te;
}
function Yv() {
  for (; q !== null; ) bh(q);
}
function Xv() {
  for (; q !== null && !Sg(); ) bh(q);
}
function bh(e) {
  var t = Yh(e.alternate, e, Pe);
  e.memoizedProps = e.pendingProps, t === null ? Gh(e) : q = t, Da.current = null;
}
function Gh(e) {
  var t = e;
  do {
    var n = t.alternate;
    if (e = t.return, t.flags & 32768) {
      if (n = Wv(n, t), n !== null) {
        n.flags &= 32767, q = n;
        return;
      }
      if (e !== null) e.flags |= 32768, e.subtreeFlags = 0, e.deletions = null;
      else {
        te = 6, q = null;
        return;
      }
    } else if (n = $v(n, t, Pe), n !== null) {
      q = n;
      return;
    }
    if (t = t.sibling, t !== null) {
      q = t;
      return;
    }
    q = t = e;
  } while (t !== null);
  te === 0 && (te = 5);
}
function Qt(e, t, n) {
  var r = I, i = Oe.transition;
  try {
    Oe.transition = null, I = 1, Zv(e, t, n, r);
  } finally {
    Oe.transition = i, I = r;
  }
  return null;
}
function Zv(e, t, n, r) {
  do
    Fn();
  while (Dt !== null);
  if (F & 6) throw Error(T(327));
  n = e.finishedWork;
  var i = e.finishedLanes;
  if (n === null) return null;
  if (e.finishedWork = null, e.finishedLanes = 0, n === e.current) throw Error(T(177));
  e.callbackNode = null, e.callbackPriority = 0;
  var s = n.lanes | n.childLanes;
  if (Ag(e, s), e === se && (q = se = null, ae = 0), !(n.subtreeFlags & 2064) && !(n.flags & 2064) || Pi || (Pi = !0, Xh(Yi, function() {
    return Fn(), null;
  })), s = (n.flags & 15990) !== 0, n.subtreeFlags & 15990 || s) {
    s = Oe.transition, Oe.transition = null;
    var o = I;
    I = 1;
    var l = F;
    F |= 4, Da.current = null, Hv(e, n), Bh(n, e), vv(tl), Zi = !!el, tl = el = null, e.current = n, bv(n), kg(), F = l, I = o, Oe.transition = s;
  } else e.current = n;
  if (Pi && (Pi = !1, Dt = e, hs = i), s = e.pendingLanes, s === 0 && (Mt = null), Pg(n.stateNode), Ee(e, Z()), t !== null) for (r = e.onRecoverableError, n = 0; n < t.length; n++) i = t[n], r(i.value, { componentStack: i.stack, digest: i.digest });
  if (ds) throw ds = !1, e = Sl, Sl = null, e;
  return hs & 1 && e.tag !== 0 && Fn(), s = e.pendingLanes, s & 1 ? e === kl ? Pr++ : (Pr = 0, kl = e) : Pr = 0, Bt(), null;
}
function Fn() {
  if (Dt !== null) {
    var e = Cd(hs), t = Oe.transition, n = I;
    try {
      if (Oe.transition = null, I = 16 > e ? 16 : e, Dt === null) var r = !1;
      else {
        if (e = Dt, Dt = null, hs = 0, F & 6) throw Error(T(331));
        var i = F;
        for (F |= 4, N = e.current; N !== null; ) {
          var s = N, o = s.child;
          if (N.flags & 16) {
            var l = s.deletions;
            if (l !== null) {
              for (var a = 0; a < l.length; a++) {
                var u = l[a];
                for (N = u; N !== null; ) {
                  var c = N;
                  switch (c.tag) {
                    case 0:
                    case 11:
                    case 15:
                      Tr(8, c, s);
                  }
                  var f = c.child;
                  if (f !== null) f.return = c, N = f;
                  else for (; N !== null; ) {
                    c = N;
                    var d = c.sibling, g = c.return;
                    if (Oh(c), c === u) {
                      N = null;
                      break;
                    }
                    if (d !== null) {
                      d.return = g, N = d;
                      break;
                    }
                    N = g;
                  }
                }
              }
              var v = s.alternate;
              if (v !== null) {
                var y = v.child;
                if (y !== null) {
                  v.child = null;
                  do {
                    var S = y.sibling;
                    y.sibling = null, y = S;
                  } while (y !== null);
                }
              }
              N = s;
            }
          }
          if (s.subtreeFlags & 2064 && o !== null) o.return = s, N = o;
          else e: for (; N !== null; ) {
            if (s = N, s.flags & 2048) switch (s.tag) {
              case 0:
              case 11:
              case 15:
                Tr(9, s, s.return);
            }
            var p = s.sibling;
            if (p !== null) {
              p.return = s.return, N = p;
              break e;
            }
            N = s.return;
          }
        }
        var h = e.current;
        for (N = h; N !== null; ) {
          o = N;
          var m = o.child;
          if (o.subtreeFlags & 2064 && m !== null) m.return = o, N = m;
          else e: for (o = h; N !== null; ) {
            if (l = N, l.flags & 2048) try {
              switch (l.tag) {
                case 0:
                case 11:
                case 15:
                  As(9, l);
              }
            } catch (w) {
              Q(l, l.return, w);
            }
            if (l === o) {
              N = null;
              break e;
            }
            var x = l.sibling;
            if (x !== null) {
              x.return = l.return, N = x;
              break e;
            }
            N = l.return;
          }
        }
        if (F = i, Bt(), Je && typeof Je.onPostCommitFiberRoot == "function") try {
          Je.onPostCommitFiberRoot(Ts, e);
        } catch {
        }
        r = !0;
      }
      return r;
    } finally {
      I = n, Oe.transition = t;
    }
  }
  return !1;
}
function Tc(e, t, n) {
  t = $n(n, t), t = Ch(e, t, 1), e = At(e, t, 1), t = ve(), e !== null && (Jr(e, 1, t), Ee(e, t));
}
function Q(e, t, n) {
  if (e.tag === 3) Tc(e, e, n);
  else for (; t !== null; ) {
    if (t.tag === 3) {
      Tc(t, e, n);
      break;
    } else if (t.tag === 1) {
      var r = t.stateNode;
      if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (Mt === null || !Mt.has(r))) {
        e = $n(n, e), e = Nh(t, e, 1), t = At(t, e, 1), e = ve(), t !== null && (Jr(t, 1, e), Ee(t, e));
        break;
      }
    }
    t = t.return;
  }
}
function qv(e, t, n) {
  var r = e.pingCache;
  r !== null && r.delete(t), t = ve(), e.pingedLanes |= e.suspendedLanes & n, se === e && (ae & n) === n && (te === 4 || te === 3 && (ae & 130023424) === ae && 500 > Z() - Na ? tn(e, 0) : Ca |= n), Ee(e, t);
}
function Qh(e, t) {
  t === 0 && (e.mode & 1 ? (t = mi, mi <<= 1, !(mi & 130023424) && (mi = 4194304)) : t = 1);
  var n = ve();
  e = pt(e, t), e !== null && (Jr(e, t, n), Ee(e, n));
}
function Jv(e) {
  var t = e.memoizedState, n = 0;
  t !== null && (n = t.retryLane), Qh(e, n);
}
function ey(e, t) {
  var n = 0;
  switch (e.tag) {
    case 13:
      var r = e.stateNode, i = e.memoizedState;
      i !== null && (n = i.retryLane);
      break;
    case 19:
      r = e.stateNode;
      break;
    default:
      throw Error(T(314));
  }
  r !== null && r.delete(t), Qh(e, n);
}
var Yh;
Yh = function(e, t, n) {
  if (e !== null) if (e.memoizedProps !== t.pendingProps || ke.current) Se = !0;
  else {
    if (!(e.lanes & n) && !(t.flags & 128)) return Se = !1, Bv(e, t, n);
    Se = !!(e.flags & 131072);
  }
  else Se = !1, $ && t.flags & 1048576 && Jd(t, is, t.index);
  switch (t.lanes = 0, t.tag) {
    case 2:
      var r = t.type;
      zi(e, t), e = t.pendingProps;
      var i = On(t, me.current);
      _n(t, n), i = Sa(null, t, r, e, i, n);
      var s = ka();
      return t.flags |= 1, typeof i == "object" && i !== null && typeof i.render == "function" && i.$$typeof === void 0 ? (t.tag = 1, t.memoizedState = null, t.updateQueue = null, Te(r) ? (s = !0, ns(t)) : s = !1, t.memoizedState = i.state !== null && i.state !== void 0 ? i.state : null, ga(t), i.updater = Rs, t.stateNode = i, i._reactInternals = t, cl(t, r, e, n), t = hl(null, t, r, !0, s, n)) : (t.tag = 0, $ && s && ua(t), ge(null, t, i, n), t = t.child), t;
    case 16:
      r = t.elementType;
      e: {
        switch (zi(e, t), e = t.pendingProps, i = r._init, r = i(r._payload), t.type = r, i = t.tag = ny(r), e = We(r, e), i) {
          case 0:
            t = dl(null, t, r, e, n);
            break e;
          case 1:
            t = hc(null, t, r, e, n);
            break e;
          case 11:
            t = fc(null, t, r, e, n);
            break e;
          case 14:
            t = dc(null, t, r, We(r.type, e), n);
            break e;
        }
        throw Error(T(
          306,
          r,
          ""
        ));
      }
      return t;
    case 0:
      return r = t.type, i = t.pendingProps, i = t.elementType === r ? i : We(r, i), dl(e, t, r, i, n);
    case 1:
      return r = t.type, i = t.pendingProps, i = t.elementType === r ? i : We(r, i), hc(e, t, r, i, n);
    case 3:
      e: {
        if (Mh(t), e === null) throw Error(T(387));
        r = t.pendingProps, s = t.memoizedState, i = s.element, sh(e, t), ls(t, r, null, n);
        var o = t.memoizedState;
        if (r = o.element, s.isDehydrated) if (s = { element: r, isDehydrated: !1, cache: o.cache, pendingSuspenseBoundaries: o.pendingSuspenseBoundaries, transitions: o.transitions }, t.updateQueue.baseState = s, t.memoizedState = s, t.flags & 256) {
          i = $n(Error(T(423)), t), t = pc(e, t, r, n, i);
          break e;
        } else if (r !== i) {
          i = $n(Error(T(424)), t), t = pc(e, t, r, n, i);
          break e;
        } else for (De = Rt(t.stateNode.containerInfo.firstChild), Ce = t, $ = !0, He = null, n = rh(t, null, r, n), t.child = n; n; ) n.flags = n.flags & -3 | 4096, n = n.sibling;
        else {
          if (zn(), r === i) {
            t = mt(e, t, n);
            break e;
          }
          ge(e, t, r, n);
        }
        t = t.child;
      }
      return t;
    case 5:
      return oh(t), e === null && ll(t), r = t.type, i = t.pendingProps, s = e !== null ? e.memoizedProps : null, o = i.children, nl(r, i) ? o = null : s !== null && nl(r, s) && (t.flags |= 32), Ah(e, t), ge(e, t, o, n), t.child;
    case 6:
      return e === null && ll(t), null;
    case 13:
      return jh(e, t, n);
    case 4:
      return va(t, t.stateNode.containerInfo), r = t.pendingProps, e === null ? t.child = Un(t, null, r, n) : ge(e, t, r, n), t.child;
    case 11:
      return r = t.type, i = t.pendingProps, i = t.elementType === r ? i : We(r, i), fc(e, t, r, i, n);
    case 7:
      return ge(e, t, t.pendingProps, n), t.child;
    case 8:
      return ge(e, t, t.pendingProps.children, n), t.child;
    case 12:
      return ge(e, t, t.pendingProps.children, n), t.child;
    case 10:
      e: {
        if (r = t.type._context, i = t.pendingProps, s = t.memoizedProps, o = i.value, O(ss, r._currentValue), r._currentValue = o, s !== null) if (Ye(s.value, o)) {
          if (s.children === i.children && !ke.current) {
            t = mt(e, t, n);
            break e;
          }
        } else for (s = t.child, s !== null && (s.return = t); s !== null; ) {
          var l = s.dependencies;
          if (l !== null) {
            o = s.child;
            for (var a = l.firstContext; a !== null; ) {
              if (a.context === r) {
                if (s.tag === 1) {
                  a = at(-1, n & -n), a.tag = 2;
                  var u = s.updateQueue;
                  if (u !== null) {
                    u = u.shared;
                    var c = u.pending;
                    c === null ? a.next = a : (a.next = c.next, c.next = a), u.pending = a;
                  }
                }
                s.lanes |= n, a = s.alternate, a !== null && (a.lanes |= n), al(
                  s.return,
                  n,
                  t
                ), l.lanes |= n;
                break;
              }
              a = a.next;
            }
          } else if (s.tag === 10) o = s.type === t.type ? null : s.child;
          else if (s.tag === 18) {
            if (o = s.return, o === null) throw Error(T(341));
            o.lanes |= n, l = o.alternate, l !== null && (l.lanes |= n), al(o, n, t), o = s.sibling;
          } else o = s.child;
          if (o !== null) o.return = s;
          else for (o = s; o !== null; ) {
            if (o === t) {
              o = null;
              break;
            }
            if (s = o.sibling, s !== null) {
              s.return = o.return, o = s;
              break;
            }
            o = o.return;
          }
          s = o;
        }
        ge(e, t, i.children, n), t = t.child;
      }
      return t;
    case 9:
      return i = t.type, r = t.pendingProps.children, _n(t, n), i = ze(i), r = r(i), t.flags |= 1, ge(e, t, r, n), t.child;
    case 14:
      return r = t.type, i = We(r, t.pendingProps), i = We(r.type, i), dc(e, t, r, i, n);
    case 15:
      return Vh(e, t, t.type, t.pendingProps, n);
    case 17:
      return r = t.type, i = t.pendingProps, i = t.elementType === r ? i : We(r, i), zi(e, t), t.tag = 1, Te(r) ? (e = !0, ns(t)) : e = !1, _n(t, n), Dh(t, r, i), cl(t, r, i, n), hl(null, t, r, !0, e, n);
    case 19:
      return Lh(e, t, n);
    case 22:
      return Rh(e, t, n);
  }
  throw Error(T(156, t.tag));
};
function Xh(e, t) {
  return Td(e, t);
}
function ty(e, t, n, r) {
  this.tag = e, this.key = n, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
}
function Ie(e, t, n, r) {
  return new ty(e, t, n, r);
}
function Ma(e) {
  return e = e.prototype, !(!e || !e.isReactComponent);
}
function ny(e) {
  if (typeof e == "function") return Ma(e) ? 1 : 0;
  if (e != null) {
    if (e = e.$$typeof, e === Zl) return 11;
    if (e === ql) return 14;
  }
  return 2;
}
function Lt(e, t) {
  var n = e.alternate;
  return n === null ? (n = Ie(e.tag, t, e.key, e.mode), n.elementType = e.elementType, n.type = e.type, n.stateNode = e.stateNode, n.alternate = e, e.alternate = n) : (n.pendingProps = t, n.type = e.type, n.flags = 0, n.subtreeFlags = 0, n.deletions = null), n.flags = e.flags & 14680064, n.childLanes = e.childLanes, n.lanes = e.lanes, n.child = e.child, n.memoizedProps = e.memoizedProps, n.memoizedState = e.memoizedState, n.updateQueue = e.updateQueue, t = e.dependencies, n.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, n.sibling = e.sibling, n.index = e.index, n.ref = e.ref, n;
}
function $i(e, t, n, r, i, s) {
  var o = 2;
  if (r = e, typeof e == "function") Ma(e) && (o = 1);
  else if (typeof e == "string") o = 5;
  else e: switch (e) {
    case mn:
      return nn(n.children, i, s, t);
    case Xl:
      o = 8, i |= 8;
      break;
    case Lo:
      return e = Ie(12, n, t, i | 2), e.elementType = Lo, e.lanes = s, e;
    case _o:
      return e = Ie(13, n, t, i), e.elementType = _o, e.lanes = s, e;
    case Fo:
      return e = Ie(19, n, t, i), e.elementType = Fo, e.lanes = s, e;
    case od:
      return js(n, i, s, t);
    default:
      if (typeof e == "object" && e !== null) switch (e.$$typeof) {
        case id:
          o = 10;
          break e;
        case sd:
          o = 9;
          break e;
        case Zl:
          o = 11;
          break e;
        case ql:
          o = 14;
          break e;
        case St:
          o = 16, r = null;
          break e;
      }
      throw Error(T(130, e == null ? e : typeof e, ""));
  }
  return t = Ie(o, n, t, i), t.elementType = e, t.type = r, t.lanes = s, t;
}
function nn(e, t, n, r) {
  return e = Ie(7, e, r, t), e.lanes = n, e;
}
function js(e, t, n, r) {
  return e = Ie(22, e, r, t), e.elementType = od, e.lanes = n, e.stateNode = { isHidden: !1 }, e;
}
function vo(e, t, n) {
  return e = Ie(6, e, null, t), e.lanes = n, e;
}
function yo(e, t, n) {
  return t = Ie(4, e.children !== null ? e.children : [], e.key, t), t.lanes = n, t.stateNode = { containerInfo: e.containerInfo, pendingChildren: null, implementation: e.implementation }, t;
}
function ry(e, t, n, r, i) {
  this.tag = t, this.containerInfo = e, this.finishedWork = this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.pendingContext = this.context = null, this.callbackPriority = 0, this.eventTimes = Zs(0), this.expirationTimes = Zs(-1), this.entangledLanes = this.finishedLanes = this.mutableReadLanes = this.expiredLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Zs(0), this.identifierPrefix = r, this.onRecoverableError = i, this.mutableSourceEagerHydrationData = null;
}
function ja(e, t, n, r, i, s, o, l, a) {
  return e = new ry(e, t, n, l, a), t === 1 ? (t = 1, s === !0 && (t |= 8)) : t = 0, s = Ie(3, null, null, t), e.current = s, s.stateNode = e, s.memoizedState = { element: r, isDehydrated: n, cache: null, transitions: null, pendingSuspenseBoundaries: null }, ga(s), e;
}
function iy(e, t, n) {
  var r = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
  return { $$typeof: pn, key: r == null ? null : "" + r, children: e, containerInfo: t, implementation: n };
}
function Zh(e) {
  if (!e) return Ft;
  e = e._reactInternals;
  e: {
    if (fn(e) !== e || e.tag !== 1) throw Error(T(170));
    var t = e;
    do {
      switch (t.tag) {
        case 3:
          t = t.stateNode.context;
          break e;
        case 1:
          if (Te(t.type)) {
            t = t.stateNode.__reactInternalMemoizedMergedChildContext;
            break e;
          }
      }
      t = t.return;
    } while (t !== null);
    throw Error(T(171));
  }
  if (e.tag === 1) {
    var n = e.type;
    if (Te(n)) return Zd(e, n, t);
  }
  return t;
}
function qh(e, t, n, r, i, s, o, l, a) {
  return e = ja(n, r, !0, e, i, s, o, l, a), e.context = Zh(null), n = e.current, r = ve(), i = jt(n), s = at(r, i), s.callback = t ?? null, At(n, s, i), e.current.lanes = i, Jr(e, i, r), Ee(e, r), e;
}
function Ls(e, t, n, r) {
  var i = t.current, s = ve(), o = jt(i);
  return n = Zh(n), t.context === null ? t.context = n : t.pendingContext = n, t = at(s, o), t.payload = { element: e }, r = r === void 0 ? null : r, r !== null && (t.callback = r), e = At(i, t, o), e !== null && (Ge(e, i, o, s), Fi(e, i, o)), o;
}
function ms(e) {
  if (e = e.current, !e.child) return null;
  switch (e.child.tag) {
    case 5:
      return e.child.stateNode;
    default:
      return e.child.stateNode;
  }
}
function Ec(e, t) {
  if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
    var n = e.retryLane;
    e.retryLane = n !== 0 && n < t ? n : t;
  }
}
function La(e, t) {
  Ec(e, t), (e = e.alternate) && Ec(e, t);
}
function sy() {
  return null;
}
var Jh = typeof reportError == "function" ? reportError : function(e) {
  console.error(e);
};
function _a(e) {
  this._internalRoot = e;
}
_s.prototype.render = _a.prototype.render = function(e) {
  var t = this._internalRoot;
  if (t === null) throw Error(T(409));
  Ls(e, t, null, null);
};
_s.prototype.unmount = _a.prototype.unmount = function() {
  var e = this._internalRoot;
  if (e !== null) {
    this._internalRoot = null;
    var t = e.containerInfo;
    un(function() {
      Ls(null, e, null, null);
    }), t[ht] = null;
  }
};
function _s(e) {
  this._internalRoot = e;
}
_s.prototype.unstable_scheduleHydration = function(e) {
  if (e) {
    var t = Rd();
    e = { blockedOn: null, target: e, priority: t };
    for (var n = 0; n < Tt.length && t !== 0 && t < Tt[n].priority; n++) ;
    Tt.splice(n, 0, e), n === 0 && Md(e);
  }
};
function Fa(e) {
  return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11);
}
function Fs(e) {
  return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11 && (e.nodeType !== 8 || e.nodeValue !== " react-mount-point-unstable "));
}
function Pc() {
}
function oy(e, t, n, r, i) {
  if (i) {
    if (typeof r == "function") {
      var s = r;
      r = function() {
        var u = ms(o);
        s.call(u);
      };
    }
    var o = qh(t, r, e, 0, null, !1, !1, "", Pc);
    return e._reactRootContainer = o, e[ht] = o.current, Or(e.nodeType === 8 ? e.parentNode : e), un(), o;
  }
  for (; i = e.lastChild; ) e.removeChild(i);
  if (typeof r == "function") {
    var l = r;
    r = function() {
      var u = ms(a);
      l.call(u);
    };
  }
  var a = ja(e, 0, !1, null, null, !1, !1, "", Pc);
  return e._reactRootContainer = a, e[ht] = a.current, Or(e.nodeType === 8 ? e.parentNode : e), un(function() {
    Ls(t, a, n, r);
  }), a;
}
function Is(e, t, n, r, i) {
  var s = n._reactRootContainer;
  if (s) {
    var o = s;
    if (typeof i == "function") {
      var l = i;
      i = function() {
        var a = ms(o);
        l.call(a);
      };
    }
    Ls(t, o, e, i);
  } else o = oy(n, t, e, i, r);
  return ms(o);
}
Nd = function(e) {
  switch (e.tag) {
    case 3:
      var t = e.stateNode;
      if (t.current.memoizedState.isDehydrated) {
        var n = dr(t.pendingLanes);
        n !== 0 && (ta(t, n | 1), Ee(t, Z()), !(F & 6) && (Wn = Z() + 500, Bt()));
      }
      break;
    case 13:
      un(function() {
        var r = pt(e, 1);
        if (r !== null) {
          var i = ve();
          Ge(r, e, 1, i);
        }
      }), La(e, 1);
  }
};
na = function(e) {
  if (e.tag === 13) {
    var t = pt(e, 134217728);
    if (t !== null) {
      var n = ve();
      Ge(t, e, 134217728, n);
    }
    La(e, 134217728);
  }
};
Vd = function(e) {
  if (e.tag === 13) {
    var t = jt(e), n = pt(e, t);
    if (n !== null) {
      var r = ve();
      Ge(n, e, t, r);
    }
    La(e, t);
  }
};
Rd = function() {
  return I;
};
Ad = function(e, t) {
  var n = I;
  try {
    return I = e, t();
  } finally {
    I = n;
  }
};
bo = function(e, t, n) {
  switch (t) {
    case "input":
      if (zo(e, n), t = n.name, n.type === "radio" && t != null) {
        for (n = e; n.parentNode; ) n = n.parentNode;
        for (n = n.querySelectorAll("input[name=" + JSON.stringify("" + t) + '][type="radio"]'), t = 0; t < n.length; t++) {
          var r = n[t];
          if (r !== e && r.form === e.form) {
            var i = Cs(r);
            if (!i) throw Error(T(90));
            ad(r), zo(r, i);
          }
        }
      }
      break;
    case "textarea":
      cd(e, n);
      break;
    case "select":
      t = n.value, t != null && An(e, !!n.multiple, t, !1);
  }
};
vd = Va;
yd = un;
var ly = { usingClientEntryPoint: !1, Events: [ti, xn, Cs, md, gd, Va] }, lr = { findFiberByHostInstance: Zt, bundleType: 0, version: "18.3.1", rendererPackageName: "react-dom" }, ay = { bundleType: lr.bundleType, version: lr.version, rendererPackageName: lr.rendererPackageName, rendererConfig: lr.rendererConfig, overrideHookState: null, overrideHookStateDeletePath: null, overrideHookStateRenamePath: null, overrideProps: null, overridePropsDeletePath: null, overridePropsRenamePath: null, setErrorHandler: null, setSuspenseHandler: null, scheduleUpdate: null, currentDispatcherRef: vt.ReactCurrentDispatcher, findHostInstanceByFiber: function(e) {
  return e = Sd(e), e === null ? null : e.stateNode;
}, findFiberByHostInstance: lr.findFiberByHostInstance || sy, findHostInstancesForRefresh: null, scheduleRefresh: null, scheduleRoot: null, setRefreshHandler: null, getCurrentFiber: null, reconcilerVersion: "18.3.1-next-f1338f8080-20240426" };
if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
  var Di = __REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!Di.isDisabled && Di.supportsFiber) try {
    Ts = Di.inject(ay), Je = Di;
  } catch {
  }
}
Ae.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ly;
Ae.createPortal = function(e, t) {
  var n = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
  if (!Fa(t)) throw Error(T(200));
  return iy(e, t, null, n);
};
Ae.createRoot = function(e, t) {
  if (!Fa(e)) throw Error(T(299));
  var n = !1, r = "", i = Jh;
  return t != null && (t.unstable_strictMode === !0 && (n = !0), t.identifierPrefix !== void 0 && (r = t.identifierPrefix), t.onRecoverableError !== void 0 && (i = t.onRecoverableError)), t = ja(e, 1, !1, null, null, n, !1, r, i), e[ht] = t.current, Or(e.nodeType === 8 ? e.parentNode : e), new _a(t);
};
Ae.findDOMNode = function(e) {
  if (e == null) return null;
  if (e.nodeType === 1) return e;
  var t = e._reactInternals;
  if (t === void 0)
    throw typeof e.render == "function" ? Error(T(188)) : (e = Object.keys(e).join(","), Error(T(268, e)));
  return e = Sd(t), e = e === null ? null : e.stateNode, e;
};
Ae.flushSync = function(e) {
  return un(e);
};
Ae.hydrate = function(e, t, n) {
  if (!Fs(t)) throw Error(T(200));
  return Is(null, e, t, !0, n);
};
Ae.hydrateRoot = function(e, t, n) {
  if (!Fa(e)) throw Error(T(405));
  var r = n != null && n.hydratedSources || null, i = !1, s = "", o = Jh;
  if (n != null && (n.unstable_strictMode === !0 && (i = !0), n.identifierPrefix !== void 0 && (s = n.identifierPrefix), n.onRecoverableError !== void 0 && (o = n.onRecoverableError)), t = qh(t, null, e, 1, n ?? null, i, !1, s, o), e[ht] = t.current, Or(e), r) for (e = 0; e < r.length; e++) n = r[e], i = n._getVersion, i = i(n._source), t.mutableSourceEagerHydrationData == null ? t.mutableSourceEagerHydrationData = [n, i] : t.mutableSourceEagerHydrationData.push(
    n,
    i
  );
  return new _s(t);
};
Ae.render = function(e, t, n) {
  if (!Fs(t)) throw Error(T(200));
  return Is(null, e, t, !1, n);
};
Ae.unmountComponentAtNode = function(e) {
  if (!Fs(e)) throw Error(T(40));
  return e._reactRootContainer ? (un(function() {
    Is(null, null, e, !1, function() {
      e._reactRootContainer = null, e[ht] = null;
    });
  }), !0) : !1;
};
Ae.unstable_batchedUpdates = Va;
Ae.unstable_renderSubtreeIntoContainer = function(e, t, n, r) {
  if (!Fs(n)) throw Error(T(200));
  if (e == null || e._reactInternals === void 0) throw Error(T(38));
  return Is(e, t, n, !1, r);
};
Ae.version = "18.3.1-next-f1338f8080-20240426";
function ep() {
  if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
    try {
      __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(ep);
    } catch (e) {
      console.error(e);
    }
}
ep(), Hf.exports = Ae;
var uy = Hf.exports, tp, Dc = uy;
tp = Dc.createRoot, Dc.hydrateRoot;
var np = { exports: {} }, Os = {};
/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var cy = P, fy = Symbol.for("react.element"), dy = Symbol.for("react.fragment"), hy = Object.prototype.hasOwnProperty, py = cy.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, my = { key: !0, ref: !0, __self: !0, __source: !0 };
function rp(e, t, n) {
  var r, i = {}, s = null, o = null;
  n !== void 0 && (s = "" + n), t.key !== void 0 && (s = "" + t.key), t.ref !== void 0 && (o = t.ref);
  for (r in t) hy.call(t, r) && !my.hasOwnProperty(r) && (i[r] = t[r]);
  if (e && e.defaultProps) for (r in t = e.defaultProps, t) i[r] === void 0 && (i[r] = t[r]);
  return { $$typeof: fy, type: e, key: s, ref: o, props: i, _owner: py.current };
}
Os.Fragment = dy;
Os.jsx = rp;
Os.jsxs = rp;
np.exports = Os;
var ut = np.exports;
const Ia = P.createContext({});
function Oa(e) {
  const t = P.useRef(null);
  return t.current === null && (t.current = e()), t.current;
}
const zs = P.createContext(null), za = P.createContext({
  transformPagePoint: (e) => e,
  isStatic: !1,
  reducedMotion: "never"
});
class gy extends P.Component {
  getSnapshotBeforeUpdate(t) {
    const n = this.props.childRef.current;
    if (n && t.isPresent && !this.props.isPresent) {
      const r = this.props.sizeRef.current;
      r.height = n.offsetHeight || 0, r.width = n.offsetWidth || 0, r.top = n.offsetTop, r.left = n.offsetLeft;
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
function vy({ children: e, isPresent: t }) {
  const n = P.useId(), r = P.useRef(null), i = P.useRef({
    width: 0,
    height: 0,
    top: 0,
    left: 0
  }), { nonce: s } = P.useContext(za);
  return P.useInsertionEffect(() => {
    const { width: o, height: l, top: a, left: u } = i.current;
    if (t || !r.current || !o || !l)
      return;
    r.current.dataset.motionPopId = n;
    const c = document.createElement("style");
    return s && (c.nonce = s), document.head.appendChild(c), c.sheet && c.sheet.insertRule(`
          [data-motion-pop-id="${n}"] {
            position: absolute !important;
            width: ${o}px !important;
            height: ${l}px !important;
            top: ${a}px !important;
            left: ${u}px !important;
          }
        `), () => {
      document.head.removeChild(c);
    };
  }, [t]), ut.jsx(gy, { isPresent: t, childRef: r, sizeRef: i, children: P.cloneElement(e, { ref: r }) });
}
const yy = ({ children: e, initial: t, isPresent: n, onExitComplete: r, custom: i, presenceAffectsLayout: s, mode: o }) => {
  const l = Oa(xy), a = P.useId(), u = P.useCallback((f) => {
    l.set(f, !0);
    for (const d of l.values())
      if (!d)
        return;
    r && r();
  }, [l, r]), c = P.useMemo(
    () => ({
      id: a,
      initial: t,
      isPresent: n,
      custom: i,
      onExitComplete: u,
      register: (f) => (l.set(f, !1), () => l.delete(f))
    }),
    /**
     * If the presence of a child affects the layout of the components around it,
     * we want to make a new context value to ensure they get re-rendered
     * so they can detect that layout change.
     */
    s ? [Math.random(), u] : [n, u]
  );
  return P.useMemo(() => {
    l.forEach((f, d) => l.set(d, !1));
  }, [n]), P.useEffect(() => {
    !n && !l.size && r && r();
  }, [n]), o === "popLayout" && (e = ut.jsx(vy, { isPresent: n, children: e })), ut.jsx(zs.Provider, { value: c, children: e });
};
function xy() {
  return /* @__PURE__ */ new Map();
}
function ip(e = !0) {
  const t = P.useContext(zs);
  if (t === null)
    return [!0, null];
  const { isPresent: n, onExitComplete: r, register: i } = t, s = P.useId();
  P.useEffect(() => {
    e && i(s);
  }, [e]);
  const o = P.useCallback(() => e && r && r(s), [s, r, e]);
  return !n && r ? [!1, o] : [!0];
}
const Ci = (e) => e.key || "";
function Cc(e) {
  const t = [];
  return P.Children.forEach(e, (n) => {
    P.isValidElement(n) && t.push(n);
  }), t;
}
const Ua = typeof window < "u", sp = Ua ? P.useLayoutEffect : P.useEffect, Pl = ({ children: e, custom: t, initial: n = !0, onExitComplete: r, presenceAffectsLayout: i = !0, mode: s = "sync", propagate: o = !1 }) => {
  const [l, a] = ip(o), u = P.useMemo(() => Cc(e), [e]), c = o && !l ? [] : u.map(Ci), f = P.useRef(!0), d = P.useRef(u), g = Oa(() => /* @__PURE__ */ new Map()), [v, y] = P.useState(u), [S, p] = P.useState(u);
  sp(() => {
    f.current = !1, d.current = u;
    for (let x = 0; x < S.length; x++) {
      const w = Ci(S[x]);
      c.includes(w) ? g.delete(w) : g.get(w) !== !0 && g.set(w, !1);
    }
  }, [S, c.length, c.join("-")]);
  const h = [];
  if (u !== v) {
    let x = [...u];
    for (let w = 0; w < S.length; w++) {
      const E = S[w], D = Ci(E);
      c.includes(D) || (x.splice(w, 0, E), h.push(E));
    }
    s === "wait" && h.length && (x = h), p(Cc(x)), y(u);
    return;
  }
  const { forceRender: m } = P.useContext(Ia);
  return ut.jsx(ut.Fragment, { children: S.map((x) => {
    const w = Ci(x), E = o && !l ? !1 : u === S || c.includes(w), D = () => {
      if (g.has(w))
        g.set(w, !0);
      else
        return;
      let k = !0;
      g.forEach((L) => {
        L || (k = !1);
      }), k && (m?.(), p(d.current), o && a?.(), r && r());
    };
    return ut.jsx(yy, { isPresent: E, initial: !f.current || n ? void 0 : !1, custom: E ? void 0 : t, presenceAffectsLayout: i, mode: s, onExitComplete: E ? void 0 : D, children: x }, w);
  }) });
}, Ne = /* @__NO_SIDE_EFFECTS__ */ (e) => e;
let op = Ne;
// @__NO_SIDE_EFFECTS__
function Ba(e) {
  let t;
  return () => (t === void 0 && (t = e()), t);
}
const Kn = /* @__NO_SIDE_EFFECTS__ */ (e, t, n) => {
  const r = t - e;
  return r === 0 ? 1 : (n - e) / r;
}, ct = /* @__NO_SIDE_EFFECTS__ */ (e) => e * 1e3, ft = /* @__NO_SIDE_EFFECTS__ */ (e) => e / 1e3, wy = {
  useManualTiming: !1
};
function Sy(e) {
  let t = /* @__PURE__ */ new Set(), n = /* @__PURE__ */ new Set(), r = !1, i = !1;
  const s = /* @__PURE__ */ new WeakSet();
  let o = {
    delta: 0,
    timestamp: 0,
    isProcessing: !1
  };
  function l(u) {
    s.has(u) && (a.schedule(u), e()), u(o);
  }
  const a = {
    /**
     * Schedule a process to run on the next frame.
     */
    schedule: (u, c = !1, f = !1) => {
      const g = f && r ? t : n;
      return c && s.add(u), g.has(u) || g.add(u), u;
    },
    /**
     * Cancel the provided callback from running on the next frame.
     */
    cancel: (u) => {
      n.delete(u), s.delete(u);
    },
    /**
     * Execute all schedule callbacks.
     */
    process: (u) => {
      if (o = u, r) {
        i = !0;
        return;
      }
      r = !0, [t, n] = [n, t], t.forEach(l), t.clear(), r = !1, i && (i = !1, a.process(u));
    }
  };
  return a;
}
const Ni = [
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
], ky = 40;
function lp(e, t) {
  let n = !1, r = !0;
  const i = {
    delta: 0,
    timestamp: 0,
    isProcessing: !1
  }, s = () => n = !0, o = Ni.reduce((p, h) => (p[h] = Sy(s), p), {}), { read: l, resolveKeyframes: a, update: u, preRender: c, render: f, postRender: d } = o, g = () => {
    const p = performance.now();
    n = !1, i.delta = r ? 1e3 / 60 : Math.max(Math.min(p - i.timestamp, ky), 1), i.timestamp = p, i.isProcessing = !0, l.process(i), a.process(i), u.process(i), c.process(i), f.process(i), d.process(i), i.isProcessing = !1, n && t && (r = !1, e(g));
  }, v = () => {
    n = !0, r = !0, i.isProcessing || e(g);
  };
  return { schedule: Ni.reduce((p, h) => {
    const m = o[h];
    return p[h] = (x, w = !1, E = !1) => (n || v(), m.schedule(x, w, E)), p;
  }, {}), cancel: (p) => {
    for (let h = 0; h < Ni.length; h++)
      o[Ni[h]].cancel(p);
  }, state: i, steps: o };
}
const { schedule: B, cancel: It, state: le, steps: xo } = lp(typeof requestAnimationFrame < "u" ? requestAnimationFrame : Ne, !0), ap = P.createContext({ strict: !1 }), Nc = {
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
}, Hn = {};
for (const e in Nc)
  Hn[e] = {
    isEnabled: (t) => Nc[e].some((n) => !!t[n])
  };
function Ty(e) {
  for (const t in e)
    Hn[t] = {
      ...Hn[t],
      ...e[t]
    };
}
const Ey = /* @__PURE__ */ new Set([
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
function gs(e) {
  return e.startsWith("while") || e.startsWith("drag") && e !== "draggable" || e.startsWith("layout") || e.startsWith("onTap") || e.startsWith("onPan") || e.startsWith("onLayout") || Ey.has(e);
}
let up = (e) => !gs(e);
function Py(e) {
  e && (up = (t) => t.startsWith("on") ? !gs(t) : e(t));
}
try {
  Py(require("@emotion/is-prop-valid").default);
} catch {
}
function Dy(e, t, n) {
  const r = {};
  for (const i in e)
    i === "values" && typeof e.values == "object" || (up(i) || n === !0 && gs(i) || !t && !gs(i) || // If trying to use native HTML drag events, forward drag listeners
    e.draggable && i.startsWith("onDrag")) && (r[i] = e[i]);
  return r;
}
function Cy(e) {
  if (typeof Proxy > "u")
    return e;
  const t = /* @__PURE__ */ new Map(), n = (...r) => e(...r);
  return new Proxy(n, {
    /**
     * Called when `motion` is referenced with a prop: `motion.div`, `motion.input` etc.
     * The prop name is passed through as `key` and we can use that to generate a `motion`
     * DOM component with that name.
     */
    get: (r, i) => i === "create" ? e : (t.has(i) || t.set(i, e(i)), t.get(i))
  });
}
const Us = P.createContext({});
function Gr(e) {
  return typeof e == "string" || Array.isArray(e);
}
function Bs(e) {
  return e !== null && typeof e == "object" && typeof e.start == "function";
}
const $a = [
  "animate",
  "whileInView",
  "whileFocus",
  "whileHover",
  "whileTap",
  "whileDrag",
  "exit"
], Wa = ["initial", ...$a];
function $s(e) {
  return Bs(e.animate) || Wa.some((t) => Gr(e[t]));
}
function cp(e) {
  return !!($s(e) || e.variants);
}
function Ny(e, t) {
  if ($s(e)) {
    const { initial: n, animate: r } = e;
    return {
      initial: n === !1 || Gr(n) ? n : void 0,
      animate: Gr(r) ? r : void 0
    };
  }
  return e.inherit !== !1 ? t : {};
}
function Vy(e) {
  const { initial: t, animate: n } = Ny(e, P.useContext(Us));
  return P.useMemo(() => ({ initial: t, animate: n }), [Vc(t), Vc(n)]);
}
function Vc(e) {
  return Array.isArray(e) ? e.join(" ") : e;
}
const Ry = Symbol.for("motionComponentSymbol");
function Dn(e) {
  return e && typeof e == "object" && Object.prototype.hasOwnProperty.call(e, "current");
}
function Ay(e, t, n) {
  return P.useCallback(
    (r) => {
      r && e.onMount && e.onMount(r), t && (r ? t.mount(r) : t.unmount()), n && (typeof n == "function" ? n(r) : Dn(n) && (n.current = r));
    },
    /**
     * Only pass a new ref callback to React if we've received a visual element
     * factory. Otherwise we'll be mounting/remounting every time externalRef
     * or other dependencies change.
     */
    [t]
  );
}
const Ka = (e) => e.replace(/([a-z])([A-Z])/gu, "$1-$2").toLowerCase(), My = "framerAppearId", fp = "data-" + Ka(My), { schedule: Ha } = lp(queueMicrotask, !1), dp = P.createContext({});
function jy(e, t, n, r, i) {
  var s, o;
  const { visualElement: l } = P.useContext(Us), a = P.useContext(ap), u = P.useContext(zs), c = P.useContext(za).reducedMotion, f = P.useRef(null);
  r = r || a.renderer, !f.current && r && (f.current = r(e, {
    visualState: t,
    parent: l,
    props: n,
    presenceContext: u,
    blockInitialAnimation: u ? u.initial === !1 : !1,
    reducedMotionConfig: c
  }));
  const d = f.current, g = P.useContext(dp);
  d && !d.projection && i && (d.type === "html" || d.type === "svg") && Ly(f.current, n, i, g);
  const v = P.useRef(!1);
  P.useInsertionEffect(() => {
    d && v.current && d.update(n, u);
  });
  const y = n[fp], S = P.useRef(!!y && !(!((s = window.MotionHandoffIsComplete) === null || s === void 0) && s.call(window, y)) && ((o = window.MotionHasOptimisedAnimation) === null || o === void 0 ? void 0 : o.call(window, y)));
  return sp(() => {
    d && (v.current = !0, window.MotionIsMounted = !0, d.updateFeatures(), Ha.render(d.render), S.current && d.animationState && d.animationState.animateChanges());
  }), P.useEffect(() => {
    d && (!S.current && d.animationState && d.animationState.animateChanges(), S.current && (queueMicrotask(() => {
      var p;
      (p = window.MotionHandoffMarkAsComplete) === null || p === void 0 || p.call(window, y);
    }), S.current = !1));
  }), d;
}
function Ly(e, t, n, r) {
  const { layoutId: i, layout: s, drag: o, dragConstraints: l, layoutScroll: a, layoutRoot: u } = t;
  e.projection = new n(e.latestValues, t["data-framer-portal-id"] ? void 0 : hp(e.parent)), e.projection.setOptions({
    layoutId: i,
    layout: s,
    alwaysMeasureLayout: !!o || l && Dn(l),
    visualElement: e,
    /**
     * TODO: Update options in an effect. This could be tricky as it'll be too late
     * to update by the time layout animations run.
     * We also need to fix this safeToRemove by linking it up to the one returned by usePresence,
     * ensuring it gets called if there's no potential layout animations.
     *
     */
    animationType: typeof s == "string" ? s : "both",
    initialPromotionConfig: r,
    layoutScroll: a,
    layoutRoot: u
  });
}
function hp(e) {
  if (e)
    return e.options.allowProjection !== !1 ? e.projection : hp(e.parent);
}
function _y({ preloadedFeatures: e, createVisualElement: t, useRender: n, useVisualState: r, Component: i }) {
  var s, o;
  e && Ty(e);
  function l(u, c) {
    let f;
    const d = {
      ...P.useContext(za),
      ...u,
      layoutId: Fy(u)
    }, { isStatic: g } = d, v = Vy(u), y = r(u, g);
    if (!g && Ua) {
      Iy();
      const S = Oy(d);
      f = S.MeasureLayout, v.visualElement = jy(i, y, d, t, S.ProjectionNode);
    }
    return ut.jsxs(Us.Provider, { value: v, children: [f && v.visualElement ? ut.jsx(f, { visualElement: v.visualElement, ...d }) : null, n(i, u, Ay(y, v.visualElement, c), y, g, v.visualElement)] });
  }
  l.displayName = `motion.${typeof i == "string" ? i : `create(${(o = (s = i.displayName) !== null && s !== void 0 ? s : i.name) !== null && o !== void 0 ? o : ""})`}`;
  const a = P.forwardRef(l);
  return a[Ry] = i, a;
}
function Fy({ layoutId: e }) {
  const t = P.useContext(Ia).id;
  return t && e !== void 0 ? t + "-" + e : e;
}
function Iy(e, t) {
  P.useContext(ap).strict;
}
function Oy(e) {
  const { drag: t, layout: n } = Hn;
  if (!t && !n)
    return {};
  const r = { ...t, ...n };
  return {
    MeasureLayout: t?.isEnabled(e) || n?.isEnabled(e) ? r.MeasureLayout : void 0,
    ProjectionNode: r.ProjectionNode
  };
}
const zy = [
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
function ba(e) {
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
      !!(zy.indexOf(e) > -1 || /**
       * If it contains a capital letter, it's an SVG component
       */
      /[A-Z]/u.test(e))
    )
  );
}
function Rc(e) {
  const t = [{}, {}];
  return e?.values.forEach((n, r) => {
    t[0][r] = n.get(), t[1][r] = n.getVelocity();
  }), t;
}
function Ga(e, t, n, r) {
  if (typeof t == "function") {
    const [i, s] = Rc(r);
    t = t(n !== void 0 ? n : e.custom, i, s);
  }
  if (typeof t == "string" && (t = e.variants && e.variants[t]), typeof t == "function") {
    const [i, s] = Rc(r);
    t = t(n !== void 0 ? n : e.custom, i, s);
  }
  return t;
}
const Dl = (e) => Array.isArray(e), Uy = (e) => !!(e && typeof e == "object" && e.mix && e.toValue), By = (e) => Dl(e) ? e[e.length - 1] || 0 : e, pe = (e) => !!(e && e.getVelocity);
function Wi(e) {
  const t = pe(e) ? e.get() : e;
  return Uy(t) ? t.toValue() : t;
}
function $y({ scrapeMotionValuesFromProps: e, createRenderState: t, onUpdate: n }, r, i, s) {
  const o = {
    latestValues: Wy(r, i, s, e),
    renderState: t()
  };
  return n && (o.onMount = (l) => n({ props: r, current: l, ...o }), o.onUpdate = (l) => n(l)), o;
}
const pp = (e) => (t, n) => {
  const r = P.useContext(Us), i = P.useContext(zs), s = () => $y(e, t, r, i);
  return n ? s() : Oa(s);
};
function Wy(e, t, n, r) {
  const i = {}, s = r(e, {});
  for (const d in s)
    i[d] = Wi(s[d]);
  let { initial: o, animate: l } = e;
  const a = $s(e), u = cp(e);
  t && u && !a && e.inherit !== !1 && (o === void 0 && (o = t.initial), l === void 0 && (l = t.animate));
  let c = n ? n.initial === !1 : !1;
  c = c || o === !1;
  const f = c ? l : o;
  if (f && typeof f != "boolean" && !Bs(f)) {
    const d = Array.isArray(f) ? f : [f];
    for (let g = 0; g < d.length; g++) {
      const v = Ga(e, d[g]);
      if (v) {
        const { transitionEnd: y, transition: S, ...p } = v;
        for (const h in p) {
          let m = p[h];
          if (Array.isArray(m)) {
            const x = c ? m.length - 1 : 0;
            m = m[x];
          }
          m !== null && (i[h] = m);
        }
        for (const h in y)
          i[h] = y[h];
      }
    }
  }
  return i;
}
const Xn = [
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
], dn = new Set(Xn), mp = (e) => (t) => typeof t == "string" && t.startsWith(e), gp = /* @__PURE__ */ mp("--"), Ky = /* @__PURE__ */ mp("var(--"), Qa = (e) => Ky(e) ? Hy.test(e.split("/*")[0].trim()) : !1, Hy = /var\(--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)$/iu, vp = (e, t) => t && typeof e == "number" ? t.transform(e) : e, gt = (e, t, n) => n > t ? t : n < e ? e : n, Zn = {
  test: (e) => typeof e == "number",
  parse: parseFloat,
  transform: (e) => e
}, Qr = {
  ...Zn,
  transform: (e) => gt(0, 1, e)
}, Vi = {
  ...Zn,
  default: 1
}, ri = (e) => ({
  test: (t) => typeof t == "string" && t.endsWith(e) && t.split(" ").length === 1,
  parse: parseFloat,
  transform: (t) => `${t}${e}`
}), wt = /* @__PURE__ */ ri("deg"), tt = /* @__PURE__ */ ri("%"), R = /* @__PURE__ */ ri("px"), by = /* @__PURE__ */ ri("vh"), Gy = /* @__PURE__ */ ri("vw"), Ac = {
  ...tt,
  parse: (e) => tt.parse(e) / 100,
  transform: (e) => tt.transform(e * 100)
}, Qy = {
  // Border props
  borderWidth: R,
  borderTopWidth: R,
  borderRightWidth: R,
  borderBottomWidth: R,
  borderLeftWidth: R,
  borderRadius: R,
  radius: R,
  borderTopLeftRadius: R,
  borderTopRightRadius: R,
  borderBottomRightRadius: R,
  borderBottomLeftRadius: R,
  // Positioning props
  width: R,
  maxWidth: R,
  height: R,
  maxHeight: R,
  top: R,
  right: R,
  bottom: R,
  left: R,
  // Spacing props
  padding: R,
  paddingTop: R,
  paddingRight: R,
  paddingBottom: R,
  paddingLeft: R,
  margin: R,
  marginTop: R,
  marginRight: R,
  marginBottom: R,
  marginLeft: R,
  // Misc
  backgroundPositionX: R,
  backgroundPositionY: R
}, Yy = {
  rotate: wt,
  rotateX: wt,
  rotateY: wt,
  rotateZ: wt,
  scale: Vi,
  scaleX: Vi,
  scaleY: Vi,
  scaleZ: Vi,
  skew: wt,
  skewX: wt,
  skewY: wt,
  distance: R,
  translateX: R,
  translateY: R,
  translateZ: R,
  x: R,
  y: R,
  z: R,
  perspective: R,
  transformPerspective: R,
  opacity: Qr,
  originX: Ac,
  originY: Ac,
  originZ: R
}, Mc = {
  ...Zn,
  transform: Math.round
}, Ya = {
  ...Qy,
  ...Yy,
  zIndex: Mc,
  size: R,
  // SVG
  fillOpacity: Qr,
  strokeOpacity: Qr,
  numOctaves: Mc
}, Xy = {
  x: "translateX",
  y: "translateY",
  z: "translateZ",
  transformPerspective: "perspective"
}, Zy = Xn.length;
function qy(e, t, n) {
  let r = "", i = !0;
  for (let s = 0; s < Zy; s++) {
    const o = Xn[s], l = e[o];
    if (l === void 0)
      continue;
    let a = !0;
    if (typeof l == "number" ? a = l === (o.startsWith("scale") ? 1 : 0) : a = parseFloat(l) === 0, !a || n) {
      const u = vp(l, Ya[o]);
      if (!a) {
        i = !1;
        const c = Xy[o] || o;
        r += `${c}(${u}) `;
      }
      n && (t[o] = u);
    }
  }
  return r = r.trim(), n ? r = n(t, i ? "" : r) : i && (r = "none"), r;
}
function Xa(e, t, n) {
  const { style: r, vars: i, transformOrigin: s } = e;
  let o = !1, l = !1;
  for (const a in t) {
    const u = t[a];
    if (dn.has(a)) {
      o = !0;
      continue;
    } else if (gp(a)) {
      i[a] = u;
      continue;
    } else {
      const c = vp(u, Ya[a]);
      a.startsWith("origin") ? (l = !0, s[a] = c) : r[a] = c;
    }
  }
  if (t.transform || (o || n ? r.transform = qy(t, e.transform, n) : r.transform && (r.transform = "none")), l) {
    const { originX: a = "50%", originY: u = "50%", originZ: c = 0 } = s;
    r.transformOrigin = `${a} ${u} ${c}`;
  }
}
const Jy = {
  offset: "stroke-dashoffset",
  array: "stroke-dasharray"
}, e0 = {
  offset: "strokeDashoffset",
  array: "strokeDasharray"
};
function t0(e, t, n = 1, r = 0, i = !0) {
  e.pathLength = 1;
  const s = i ? Jy : e0;
  e[s.offset] = R.transform(-r);
  const o = R.transform(t), l = R.transform(n);
  e[s.array] = `${o} ${l}`;
}
function jc(e, t, n) {
  return typeof e == "string" ? e : R.transform(t + n * e);
}
function n0(e, t, n) {
  const r = jc(t, e.x, e.width), i = jc(n, e.y, e.height);
  return `${r} ${i}`;
}
function Za(e, {
  attrX: t,
  attrY: n,
  attrScale: r,
  originX: i,
  originY: s,
  pathLength: o,
  pathSpacing: l = 1,
  pathOffset: a = 0,
  // This is object creation, which we try to avoid per-frame.
  ...u
}, c, f) {
  if (Xa(e, u, f), c) {
    e.style.viewBox && (e.attrs.viewBox = e.style.viewBox);
    return;
  }
  e.attrs = e.style, e.style = {};
  const { attrs: d, style: g, dimensions: v } = e;
  d.transform && (v && (g.transform = d.transform), delete d.transform), v && (i !== void 0 || s !== void 0 || g.transform) && (g.transformOrigin = n0(v, i !== void 0 ? i : 0.5, s !== void 0 ? s : 0.5)), t !== void 0 && (d.x = t), n !== void 0 && (d.y = n), r !== void 0 && (d.scale = r), o !== void 0 && t0(d, o, l, a, !1);
}
const qa = () => ({
  style: {},
  transform: {},
  transformOrigin: {},
  vars: {}
}), yp = () => ({
  ...qa(),
  attrs: {}
}), Ja = (e) => typeof e == "string" && e.toLowerCase() === "svg";
function xp(e, { style: t, vars: n }, r, i) {
  Object.assign(e.style, t, i && i.getProjectionStyles(r));
  for (const s in n)
    e.style.setProperty(s, n[s]);
}
const wp = /* @__PURE__ */ new Set([
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
function Sp(e, t, n, r) {
  xp(e, t, void 0, r);
  for (const i in t.attrs)
    e.setAttribute(wp.has(i) ? i : Ka(i), t.attrs[i]);
}
const vs = {};
function r0(e) {
  Object.assign(vs, e);
}
function kp(e, { layout: t, layoutId: n }) {
  return dn.has(e) || e.startsWith("origin") || (t || n !== void 0) && (!!vs[e] || e === "opacity");
}
function eu(e, t, n) {
  var r;
  const { style: i } = e, s = {};
  for (const o in i)
    (pe(i[o]) || t.style && pe(t.style[o]) || kp(o, e) || ((r = n?.getValue(o)) === null || r === void 0 ? void 0 : r.liveStyle) !== void 0) && (s[o] = i[o]);
  return s;
}
function Tp(e, t, n) {
  const r = eu(e, t, n);
  for (const i in e)
    if (pe(e[i]) || pe(t[i])) {
      const s = Xn.indexOf(i) !== -1 ? "attr" + i.charAt(0).toUpperCase() + i.substring(1) : i;
      r[s] = e[i];
    }
  return r;
}
function i0(e, t) {
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
const Lc = ["x", "y", "width", "height", "cx", "cy", "r"], s0 = {
  useVisualState: pp({
    scrapeMotionValuesFromProps: Tp,
    createRenderState: yp,
    onUpdate: ({ props: e, prevProps: t, current: n, renderState: r, latestValues: i }) => {
      if (!n)
        return;
      let s = !!e.drag;
      if (!s) {
        for (const l in i)
          if (dn.has(l)) {
            s = !0;
            break;
          }
      }
      if (!s)
        return;
      let o = !t;
      if (t)
        for (let l = 0; l < Lc.length; l++) {
          const a = Lc[l];
          e[a] !== t[a] && (o = !0);
        }
      o && B.read(() => {
        i0(n, r), B.render(() => {
          Za(r, i, Ja(n.tagName), e.transformTemplate), Sp(n, r);
        });
      });
    }
  })
}, o0 = {
  useVisualState: pp({
    scrapeMotionValuesFromProps: eu,
    createRenderState: qa
  })
};
function Ep(e, t, n) {
  for (const r in t)
    !pe(t[r]) && !kp(r, n) && (e[r] = t[r]);
}
function l0({ transformTemplate: e }, t) {
  return P.useMemo(() => {
    const n = qa();
    return Xa(n, t, e), Object.assign({}, n.vars, n.style);
  }, [t]);
}
function a0(e, t) {
  const n = e.style || {}, r = {};
  return Ep(r, n, e), Object.assign(r, l0(e, t)), r;
}
function u0(e, t) {
  const n = {}, r = a0(e, t);
  return e.drag && e.dragListener !== !1 && (n.draggable = !1, r.userSelect = r.WebkitUserSelect = r.WebkitTouchCallout = "none", r.touchAction = e.drag === !0 ? "none" : `pan-${e.drag === "x" ? "y" : "x"}`), e.tabIndex === void 0 && (e.onTap || e.onTapStart || e.whileTap) && (n.tabIndex = 0), n.style = r, n;
}
function c0(e, t, n, r) {
  const i = P.useMemo(() => {
    const s = yp();
    return Za(s, t, Ja(r), e.transformTemplate), {
      ...s.attrs,
      style: { ...s.style }
    };
  }, [t]);
  if (e.style) {
    const s = {};
    Ep(s, e.style, e), i.style = { ...s, ...i.style };
  }
  return i;
}
function f0(e = !1) {
  return (n, r, i, { latestValues: s }, o) => {
    const a = (ba(n) ? c0 : u0)(r, s, o, n), u = Dy(r, typeof n == "string", e), c = n !== P.Fragment ? { ...u, ...a, ref: i } : {}, { children: f } = r, d = P.useMemo(() => pe(f) ? f.get() : f, [f]);
    return P.createElement(n, {
      ...c,
      children: d
    });
  };
}
function d0(e, t) {
  return function(r, { forwardMotionProps: i } = { forwardMotionProps: !1 }) {
    const o = {
      ...ba(r) ? s0 : o0,
      preloadedFeatures: e,
      useRender: f0(i),
      createVisualElement: t,
      Component: r
    };
    return _y(o);
  };
}
function Pp(e, t) {
  if (!Array.isArray(t))
    return !1;
  const n = t.length;
  if (n !== e.length)
    return !1;
  for (let r = 0; r < n; r++)
    if (t[r] !== e[r])
      return !1;
  return !0;
}
function Ws(e, t, n) {
  const r = e.getProps();
  return Ga(r, t, n !== void 0 ? n : r.custom, e);
}
const h0 = /* @__PURE__ */ Ba(() => window.ScrollTimeline !== void 0);
class p0 {
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
    for (let r = 0; r < this.animations.length; r++)
      this.animations[r][t] = n;
  }
  attachTimeline(t, n) {
    const r = this.animations.map((i) => {
      if (h0() && i.attachTimeline)
        return i.attachTimeline(t);
      if (typeof n == "function")
        return n(i);
    });
    return () => {
      r.forEach((i, s) => {
        i && i(), this.animations[s].stop();
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
class m0 extends p0 {
  then(t, n) {
    return Promise.all(this.animations).then(t).catch(n);
  }
}
function tu(e, t) {
  return e ? e[t] || e.default || e : void 0;
}
const Cl = 2e4;
function Dp(e) {
  let t = 0;
  const n = 50;
  let r = e.next(t);
  for (; !r.done && t < Cl; )
    t += n, r = e.next(t);
  return t >= Cl ? 1 / 0 : t;
}
function nu(e) {
  return typeof e == "function";
}
function _c(e, t) {
  e.timeline = t, e.onfinish = null;
}
const ru = (e) => Array.isArray(e) && typeof e[0] == "number", g0 = {
  linearEasing: void 0
};
function v0(e, t) {
  const n = /* @__PURE__ */ Ba(e);
  return () => {
    var r;
    return (r = g0[t]) !== null && r !== void 0 ? r : n();
  };
}
const ys = /* @__PURE__ */ v0(() => {
  try {
    document.createElement("div").animate({ opacity: 0 }, { easing: "linear(0, 1)" });
  } catch {
    return !1;
  }
  return !0;
}, "linearEasing"), Cp = (e, t, n = 10) => {
  let r = "";
  const i = Math.max(Math.round(t / n), 2);
  for (let s = 0; s < i; s++)
    r += e(/* @__PURE__ */ Kn(0, i - 1, s)) + ", ";
  return `linear(${r.substring(0, r.length - 2)})`;
};
function Np(e) {
  return !!(typeof e == "function" && ys() || !e || typeof e == "string" && (e in Nl || ys()) || ru(e) || Array.isArray(e) && e.every(Np));
}
const pr = ([e, t, n, r]) => `cubic-bezier(${e}, ${t}, ${n}, ${r})`, Nl = {
  linear: "linear",
  ease: "ease",
  easeIn: "ease-in",
  easeOut: "ease-out",
  easeInOut: "ease-in-out",
  circIn: /* @__PURE__ */ pr([0, 0.65, 0.55, 1]),
  circOut: /* @__PURE__ */ pr([0.55, 0, 1, 0.45]),
  backIn: /* @__PURE__ */ pr([0.31, 0.01, 0.66, -0.59]),
  backOut: /* @__PURE__ */ pr([0.33, 1.53, 0.69, 0.99])
};
function Vp(e, t) {
  if (e)
    return typeof e == "function" && ys() ? Cp(e, t) : ru(e) ? pr(e) : Array.isArray(e) ? e.map((n) => Vp(n, t) || Nl.easeOut) : Nl[e];
}
const $e = {
  x: !1,
  y: !1
};
function Rp() {
  return $e.x || $e.y;
}
function y0(e, t, n) {
  var r;
  if (e instanceof Element)
    return [e];
  if (typeof e == "string") {
    let i = document;
    const s = (r = void 0) !== null && r !== void 0 ? r : i.querySelectorAll(e);
    return s ? Array.from(s) : [];
  }
  return Array.from(e);
}
function Ap(e, t) {
  const n = y0(e), r = new AbortController(), i = {
    passive: !0,
    ...t,
    signal: r.signal
  };
  return [n, i, () => r.abort()];
}
function Fc(e) {
  return (t) => {
    t.pointerType === "touch" || Rp() || e(t);
  };
}
function x0(e, t, n = {}) {
  const [r, i, s] = Ap(e, n), o = Fc((l) => {
    const { target: a } = l, u = t(l);
    if (typeof u != "function" || !a)
      return;
    const c = Fc((f) => {
      u(f), a.removeEventListener("pointerleave", c);
    });
    a.addEventListener("pointerleave", c, i);
  });
  return r.forEach((l) => {
    l.addEventListener("pointerenter", o, i);
  }), s;
}
const Mp = (e, t) => t ? e === t ? !0 : Mp(e, t.parentElement) : !1, iu = (e) => e.pointerType === "mouse" ? typeof e.button != "number" || e.button <= 0 : e.isPrimary !== !1, w0 = /* @__PURE__ */ new Set([
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "A"
]);
function S0(e) {
  return w0.has(e.tagName) || e.tabIndex !== -1;
}
const mr = /* @__PURE__ */ new WeakSet();
function Ic(e) {
  return (t) => {
    t.key === "Enter" && e(t);
  };
}
function wo(e, t) {
  e.dispatchEvent(new PointerEvent("pointer" + t, { isPrimary: !0, bubbles: !0 }));
}
const k0 = (e, t) => {
  const n = e.currentTarget;
  if (!n)
    return;
  const r = Ic(() => {
    if (mr.has(n))
      return;
    wo(n, "down");
    const i = Ic(() => {
      wo(n, "up");
    }), s = () => wo(n, "cancel");
    n.addEventListener("keyup", i, t), n.addEventListener("blur", s, t);
  });
  n.addEventListener("keydown", r, t), n.addEventListener("blur", () => n.removeEventListener("keydown", r), t);
};
function Oc(e) {
  return iu(e) && !Rp();
}
function T0(e, t, n = {}) {
  const [r, i, s] = Ap(e, n), o = (l) => {
    const a = l.currentTarget;
    if (!Oc(l) || mr.has(a))
      return;
    mr.add(a);
    const u = t(l), c = (g, v) => {
      window.removeEventListener("pointerup", f), window.removeEventListener("pointercancel", d), !(!Oc(g) || !mr.has(a)) && (mr.delete(a), typeof u == "function" && u(g, { success: v }));
    }, f = (g) => {
      c(g, n.useGlobalTarget || Mp(a, g.target));
    }, d = (g) => {
      c(g, !1);
    };
    window.addEventListener("pointerup", f, i), window.addEventListener("pointercancel", d, i);
  };
  return r.forEach((l) => {
    !S0(l) && l.getAttribute("tabindex") === null && (l.tabIndex = 0), (n.useGlobalTarget ? window : l).addEventListener("pointerdown", o, i), l.addEventListener("focus", (u) => k0(u, i), i);
  }), s;
}
function E0(e) {
  return e === "x" || e === "y" ? $e[e] ? null : ($e[e] = !0, () => {
    $e[e] = !1;
  }) : $e.x || $e.y ? null : ($e.x = $e.y = !0, () => {
    $e.x = $e.y = !1;
  });
}
const jp = /* @__PURE__ */ new Set([
  "width",
  "height",
  "top",
  "left",
  "right",
  "bottom",
  ...Xn
]);
let Ki;
function P0() {
  Ki = void 0;
}
const nt = {
  now: () => (Ki === void 0 && nt.set(le.isProcessing || wy.useManualTiming ? le.timestamp : performance.now()), Ki),
  set: (e) => {
    Ki = e, queueMicrotask(P0);
  }
};
function su(e, t) {
  e.indexOf(t) === -1 && e.push(t);
}
function ou(e, t) {
  const n = e.indexOf(t);
  n > -1 && e.splice(n, 1);
}
class lu {
  constructor() {
    this.subscriptions = [];
  }
  add(t) {
    return su(this.subscriptions, t), () => ou(this.subscriptions, t);
  }
  notify(t, n, r) {
    const i = this.subscriptions.length;
    if (i)
      if (i === 1)
        this.subscriptions[0](t, n, r);
      else
        for (let s = 0; s < i; s++) {
          const o = this.subscriptions[s];
          o && o(t, n, r);
        }
  }
  getSize() {
    return this.subscriptions.length;
  }
  clear() {
    this.subscriptions.length = 0;
  }
}
function Lp(e, t) {
  return t ? e * (1e3 / t) : 0;
}
const zc = 30, D0 = (e) => !isNaN(parseFloat(e));
class C0 {
  /**
   * @param init - The initiating value
   * @param config - Optional configuration options
   *
   * -  `transformer`: A function to transform incoming values with.
   *
   * @internal
   */
  constructor(t, n = {}) {
    this.version = "11.18.2", this.canTrackVelocity = null, this.events = {}, this.updateAndNotify = (r, i = !0) => {
      const s = nt.now();
      this.updatedAt !== s && this.setPrevFrameValue(), this.prev = this.current, this.setCurrent(r), this.current !== this.prev && this.events.change && this.events.change.notify(this.current), i && this.events.renderRequest && this.events.renderRequest.notify(this.current);
    }, this.hasAnimated = !1, this.setCurrent(t), this.owner = n.owner;
  }
  setCurrent(t) {
    this.current = t, this.updatedAt = nt.now(), this.canTrackVelocity === null && t !== void 0 && (this.canTrackVelocity = D0(this.current));
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
    this.events[t] || (this.events[t] = new lu());
    const r = this.events[t].add(n);
    return t === "change" ? () => {
      r(), B.read(() => {
        this.events.change.getSize() || this.stop();
      });
    } : r;
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
  setWithVelocity(t, n, r) {
    this.set(n), this.prev = void 0, this.prevFrameValue = t, this.prevUpdatedAt = this.updatedAt - r;
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
    const t = nt.now();
    if (!this.canTrackVelocity || this.prevFrameValue === void 0 || t - this.updatedAt > zc)
      return 0;
    const n = Math.min(this.updatedAt - this.prevUpdatedAt, zc);
    return Lp(parseFloat(this.current) - parseFloat(this.prevFrameValue), n);
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
function Yr(e, t) {
  return new C0(e, t);
}
function N0(e, t, n) {
  e.hasValue(t) ? e.getValue(t).set(n) : e.addValue(t, Yr(n));
}
function V0(e, t) {
  const n = Ws(e, t);
  let { transitionEnd: r = {}, transition: i = {}, ...s } = n || {};
  s = { ...s, ...r };
  for (const o in s) {
    const l = By(s[o]);
    N0(e, o, l);
  }
}
function R0(e) {
  return !!(pe(e) && e.add);
}
function Vl(e, t) {
  const n = e.getValue("willChange");
  if (R0(n))
    return n.add(t);
}
function _p(e) {
  return e.props[fp];
}
const Fp = (e, t, n) => (((1 - 3 * n + 3 * t) * e + (3 * n - 6 * t)) * e + 3 * t) * e, A0 = 1e-7, M0 = 12;
function j0(e, t, n, r, i) {
  let s, o, l = 0;
  do
    o = t + (n - t) / 2, s = Fp(o, r, i) - e, s > 0 ? n = o : t = o;
  while (Math.abs(s) > A0 && ++l < M0);
  return o;
}
function ii(e, t, n, r) {
  if (e === t && n === r)
    return Ne;
  const i = (s) => j0(s, 0, 1, e, n);
  return (s) => s === 0 || s === 1 ? s : Fp(i(s), t, r);
}
const Ip = (e) => (t) => t <= 0.5 ? e(2 * t) / 2 : (2 - e(2 * (1 - t))) / 2, Op = (e) => (t) => 1 - e(1 - t), zp = /* @__PURE__ */ ii(0.33, 1.53, 0.69, 0.99), au = /* @__PURE__ */ Op(zp), Up = /* @__PURE__ */ Ip(au), Bp = (e) => (e *= 2) < 1 ? 0.5 * au(e) : 0.5 * (2 - Math.pow(2, -10 * (e - 1))), uu = (e) => 1 - Math.sin(Math.acos(e)), $p = Op(uu), Wp = Ip(uu), Kp = (e) => /^0[^.\s]+$/u.test(e);
function L0(e) {
  return typeof e == "number" ? e === 0 : e !== null ? e === "none" || e === "0" || Kp(e) : !0;
}
const Dr = (e) => Math.round(e * 1e5) / 1e5, cu = /-?(?:\d+(?:\.\d+)?|\.\d+)/gu;
function _0(e) {
  return e == null;
}
const F0 = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))$/iu, fu = (e, t) => (n) => !!(typeof n == "string" && F0.test(n) && n.startsWith(e) || t && !_0(n) && Object.prototype.hasOwnProperty.call(n, t)), Hp = (e, t, n) => (r) => {
  if (typeof r != "string")
    return r;
  const [i, s, o, l] = r.match(cu);
  return {
    [e]: parseFloat(i),
    [t]: parseFloat(s),
    [n]: parseFloat(o),
    alpha: l !== void 0 ? parseFloat(l) : 1
  };
}, I0 = (e) => gt(0, 255, e), So = {
  ...Zn,
  transform: (e) => Math.round(I0(e))
}, en = {
  test: /* @__PURE__ */ fu("rgb", "red"),
  parse: /* @__PURE__ */ Hp("red", "green", "blue"),
  transform: ({ red: e, green: t, blue: n, alpha: r = 1 }) => "rgba(" + So.transform(e) + ", " + So.transform(t) + ", " + So.transform(n) + ", " + Dr(Qr.transform(r)) + ")"
};
function O0(e) {
  let t = "", n = "", r = "", i = "";
  return e.length > 5 ? (t = e.substring(1, 3), n = e.substring(3, 5), r = e.substring(5, 7), i = e.substring(7, 9)) : (t = e.substring(1, 2), n = e.substring(2, 3), r = e.substring(3, 4), i = e.substring(4, 5), t += t, n += n, r += r, i += i), {
    red: parseInt(t, 16),
    green: parseInt(n, 16),
    blue: parseInt(r, 16),
    alpha: i ? parseInt(i, 16) / 255 : 1
  };
}
const Rl = {
  test: /* @__PURE__ */ fu("#"),
  parse: O0,
  transform: en.transform
}, Cn = {
  test: /* @__PURE__ */ fu("hsl", "hue"),
  parse: /* @__PURE__ */ Hp("hue", "saturation", "lightness"),
  transform: ({ hue: e, saturation: t, lightness: n, alpha: r = 1 }) => "hsla(" + Math.round(e) + ", " + tt.transform(Dr(t)) + ", " + tt.transform(Dr(n)) + ", " + Dr(Qr.transform(r)) + ")"
}, de = {
  test: (e) => en.test(e) || Rl.test(e) || Cn.test(e),
  parse: (e) => en.test(e) ? en.parse(e) : Cn.test(e) ? Cn.parse(e) : Rl.parse(e),
  transform: (e) => typeof e == "string" ? e : e.hasOwnProperty("red") ? en.transform(e) : Cn.transform(e)
}, z0 = /(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))/giu;
function U0(e) {
  var t, n;
  return isNaN(e) && typeof e == "string" && (((t = e.match(cu)) === null || t === void 0 ? void 0 : t.length) || 0) + (((n = e.match(z0)) === null || n === void 0 ? void 0 : n.length) || 0) > 0;
}
const bp = "number", Gp = "color", B0 = "var", $0 = "var(", Uc = "${}", W0 = /var\s*\(\s*--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)|#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\)|-?(?:\d+(?:\.\d+)?|\.\d+)/giu;
function Xr(e) {
  const t = e.toString(), n = [], r = {
    color: [],
    number: [],
    var: []
  }, i = [];
  let s = 0;
  const l = t.replace(W0, (a) => (de.test(a) ? (r.color.push(s), i.push(Gp), n.push(de.parse(a))) : a.startsWith($0) ? (r.var.push(s), i.push(B0), n.push(a)) : (r.number.push(s), i.push(bp), n.push(parseFloat(a))), ++s, Uc)).split(Uc);
  return { values: n, split: l, indexes: r, types: i };
}
function Qp(e) {
  return Xr(e).values;
}
function Yp(e) {
  const { split: t, types: n } = Xr(e), r = t.length;
  return (i) => {
    let s = "";
    for (let o = 0; o < r; o++)
      if (s += t[o], i[o] !== void 0) {
        const l = n[o];
        l === bp ? s += Dr(i[o]) : l === Gp ? s += de.transform(i[o]) : s += i[o];
      }
    return s;
  };
}
const K0 = (e) => typeof e == "number" ? 0 : e;
function H0(e) {
  const t = Qp(e);
  return Yp(e)(t.map(K0));
}
const Ot = {
  test: U0,
  parse: Qp,
  createTransformer: Yp,
  getAnimatableNone: H0
}, b0 = /* @__PURE__ */ new Set(["brightness", "contrast", "saturate", "opacity"]);
function G0(e) {
  const [t, n] = e.slice(0, -1).split("(");
  if (t === "drop-shadow")
    return e;
  const [r] = n.match(cu) || [];
  if (!r)
    return e;
  const i = n.replace(r, "");
  let s = b0.has(t) ? 1 : 0;
  return r !== n && (s *= 100), t + "(" + s + i + ")";
}
const Q0 = /\b([a-z-]*)\(.*?\)/gu, Al = {
  ...Ot,
  getAnimatableNone: (e) => {
    const t = e.match(Q0);
    return t ? t.map(G0).join(" ") : e;
  }
}, Y0 = {
  ...Ya,
  // Color props
  color: de,
  backgroundColor: de,
  outlineColor: de,
  fill: de,
  stroke: de,
  // Border props
  borderColor: de,
  borderTopColor: de,
  borderRightColor: de,
  borderBottomColor: de,
  borderLeftColor: de,
  filter: Al,
  WebkitFilter: Al
}, du = (e) => Y0[e];
function Xp(e, t) {
  let n = du(e);
  return n !== Al && (n = Ot), n.getAnimatableNone ? n.getAnimatableNone(t) : void 0;
}
const X0 = /* @__PURE__ */ new Set(["auto", "none", "0"]);
function Z0(e, t, n) {
  let r = 0, i;
  for (; r < e.length && !i; ) {
    const s = e[r];
    typeof s == "string" && !X0.has(s) && Xr(s).values.length && (i = e[r]), r++;
  }
  if (i && n)
    for (const s of t)
      e[s] = Xp(n, i);
}
const Bc = (e) => e === Zn || e === R, $c = (e, t) => parseFloat(e.split(", ")[t]), Wc = (e, t) => (n, { transform: r }) => {
  if (r === "none" || !r)
    return 0;
  const i = r.match(/^matrix3d\((.+)\)$/u);
  if (i)
    return $c(i[1], t);
  {
    const s = r.match(/^matrix\((.+)\)$/u);
    return s ? $c(s[1], e) : 0;
  }
}, q0 = /* @__PURE__ */ new Set(["x", "y", "z"]), J0 = Xn.filter((e) => !q0.has(e));
function e1(e) {
  const t = [];
  return J0.forEach((n) => {
    const r = e.getValue(n);
    r !== void 0 && (t.push([n, r.get()]), r.set(n.startsWith("scale") ? 1 : 0));
  }), t;
}
const bn = {
  // Dimensions
  width: ({ x: e }, { paddingLeft: t = "0", paddingRight: n = "0" }) => e.max - e.min - parseFloat(t) - parseFloat(n),
  height: ({ y: e }, { paddingTop: t = "0", paddingBottom: n = "0" }) => e.max - e.min - parseFloat(t) - parseFloat(n),
  top: (e, { top: t }) => parseFloat(t),
  left: (e, { left: t }) => parseFloat(t),
  bottom: ({ y: e }, { top: t }) => parseFloat(t) + (e.max - e.min),
  right: ({ x: e }, { left: t }) => parseFloat(t) + (e.max - e.min),
  // Transform
  x: Wc(4, 13),
  y: Wc(5, 14)
};
bn.translateX = bn.x;
bn.translateY = bn.y;
const rn = /* @__PURE__ */ new Set();
let Ml = !1, jl = !1;
function Zp() {
  if (jl) {
    const e = Array.from(rn).filter((r) => r.needsMeasurement), t = new Set(e.map((r) => r.element)), n = /* @__PURE__ */ new Map();
    t.forEach((r) => {
      const i = e1(r);
      i.length && (n.set(r, i), r.render());
    }), e.forEach((r) => r.measureInitialState()), t.forEach((r) => {
      r.render();
      const i = n.get(r);
      i && i.forEach(([s, o]) => {
        var l;
        (l = r.getValue(s)) === null || l === void 0 || l.set(o);
      });
    }), e.forEach((r) => r.measureEndState()), e.forEach((r) => {
      r.suspendedScrollY !== void 0 && window.scrollTo(0, r.suspendedScrollY);
    });
  }
  jl = !1, Ml = !1, rn.forEach((e) => e.complete()), rn.clear();
}
function qp() {
  rn.forEach((e) => {
    e.readKeyframes(), e.needsMeasurement && (jl = !0);
  });
}
function t1() {
  qp(), Zp();
}
class hu {
  constructor(t, n, r, i, s, o = !1) {
    this.isComplete = !1, this.isAsync = !1, this.needsMeasurement = !1, this.isScheduled = !1, this.unresolvedKeyframes = [...t], this.onComplete = n, this.name = r, this.motionValue = i, this.element = s, this.isAsync = o;
  }
  scheduleResolve() {
    this.isScheduled = !0, this.isAsync ? (rn.add(this), Ml || (Ml = !0, B.read(qp), B.resolveKeyframes(Zp))) : (this.readKeyframes(), this.complete());
  }
  readKeyframes() {
    const { unresolvedKeyframes: t, name: n, element: r, motionValue: i } = this;
    for (let s = 0; s < t.length; s++)
      if (t[s] === null)
        if (s === 0) {
          const o = i?.get(), l = t[t.length - 1];
          if (o !== void 0)
            t[0] = o;
          else if (r && n) {
            const a = r.readValue(n, l);
            a != null && (t[0] = a);
          }
          t[0] === void 0 && (t[0] = l), i && o === void 0 && i.set(t[0]);
        } else
          t[s] = t[s - 1];
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
    this.isComplete = !0, this.onComplete(this.unresolvedKeyframes, this.finalKeyframe), rn.delete(this);
  }
  cancel() {
    this.isComplete || (this.isScheduled = !1, rn.delete(this));
  }
  resume() {
    this.isComplete || this.scheduleResolve();
  }
}
const Jp = (e) => /^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(e), n1 = (
  // eslint-disable-next-line redos-detector/no-unsafe-regex -- false positive, as it can match a lot of words
  /^var\(--(?:([\w-]+)|([\w-]+), ?([a-zA-Z\d ()%#.,-]+))\)/u
);
function r1(e) {
  const t = n1.exec(e);
  if (!t)
    return [,];
  const [, n, r, i] = t;
  return [`--${n ?? r}`, i];
}
function em(e, t, n = 1) {
  const [r, i] = r1(e);
  if (!r)
    return;
  const s = window.getComputedStyle(t).getPropertyValue(r);
  if (s) {
    const o = s.trim();
    return Jp(o) ? parseFloat(o) : o;
  }
  return Qa(i) ? em(i, t, n + 1) : i;
}
const tm = (e) => (t) => t.test(e), i1 = {
  test: (e) => e === "auto",
  parse: (e) => e
}, nm = [Zn, R, tt, wt, Gy, by, i1], Kc = (e) => nm.find(tm(e));
class rm extends hu {
  constructor(t, n, r, i, s) {
    super(t, n, r, i, s, !0);
  }
  readKeyframes() {
    const { unresolvedKeyframes: t, element: n, name: r } = this;
    if (!n || !n.current)
      return;
    super.readKeyframes();
    for (let a = 0; a < t.length; a++) {
      let u = t[a];
      if (typeof u == "string" && (u = u.trim(), Qa(u))) {
        const c = em(u, n.current);
        c !== void 0 && (t[a] = c), a === t.length - 1 && (this.finalKeyframe = u);
      }
    }
    if (this.resolveNoneKeyframes(), !jp.has(r) || t.length !== 2)
      return;
    const [i, s] = t, o = Kc(i), l = Kc(s);
    if (o !== l)
      if (Bc(o) && Bc(l))
        for (let a = 0; a < t.length; a++) {
          const u = t[a];
          typeof u == "string" && (t[a] = parseFloat(u));
        }
      else
        this.needsMeasurement = !0;
  }
  resolveNoneKeyframes() {
    const { unresolvedKeyframes: t, name: n } = this, r = [];
    for (let i = 0; i < t.length; i++)
      L0(t[i]) && r.push(i);
    r.length && Z0(t, r, n);
  }
  measureInitialState() {
    const { element: t, unresolvedKeyframes: n, name: r } = this;
    if (!t || !t.current)
      return;
    r === "height" && (this.suspendedScrollY = window.pageYOffset), this.measuredOrigin = bn[r](t.measureViewportBox(), window.getComputedStyle(t.current)), n[0] = this.measuredOrigin;
    const i = n[n.length - 1];
    i !== void 0 && t.getValue(r, i).jump(i, !1);
  }
  measureEndState() {
    var t;
    const { element: n, name: r, unresolvedKeyframes: i } = this;
    if (!n || !n.current)
      return;
    const s = n.getValue(r);
    s && s.jump(this.measuredOrigin, !1);
    const o = i.length - 1, l = i[o];
    i[o] = bn[r](n.measureViewportBox(), window.getComputedStyle(n.current)), l !== null && this.finalKeyframe === void 0 && (this.finalKeyframe = l), !((t = this.removedTransforms) === null || t === void 0) && t.length && this.removedTransforms.forEach(([a, u]) => {
      n.getValue(a).set(u);
    }), this.resolveNoneKeyframes();
  }
}
const Hc = (e, t) => t === "zIndex" ? !1 : !!(typeof e == "number" || Array.isArray(e) || typeof e == "string" && // It's animatable if we have a string
(Ot.test(e) || e === "0") && // And it contains numbers and/or colors
!e.startsWith("url("));
function s1(e) {
  const t = e[0];
  if (e.length === 1)
    return !0;
  for (let n = 0; n < e.length; n++)
    if (e[n] !== t)
      return !0;
}
function o1(e, t, n, r) {
  const i = e[0];
  if (i === null)
    return !1;
  if (t === "display" || t === "visibility")
    return !0;
  const s = e[e.length - 1], o = Hc(i, t), l = Hc(s, t);
  return !o || !l ? !1 : s1(e) || (n === "spring" || nu(n)) && r;
}
const l1 = (e) => e !== null;
function Ks(e, { repeat: t, repeatType: n = "loop" }, r) {
  const i = e.filter(l1), s = t && n !== "loop" && t % 2 === 1 ? 0 : i.length - 1;
  return !s || r === void 0 ? i[s] : r;
}
const a1 = 40;
class im {
  constructor({ autoplay: t = !0, delay: n = 0, type: r = "keyframes", repeat: i = 0, repeatDelay: s = 0, repeatType: o = "loop", ...l }) {
    this.isStopped = !1, this.hasAttemptedResolve = !1, this.createdAt = nt.now(), this.options = {
      autoplay: t,
      delay: n,
      type: r,
      repeat: i,
      repeatDelay: s,
      repeatType: o,
      ...l
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
    return this.resolvedAt ? this.resolvedAt - this.createdAt > a1 ? this.resolvedAt : this.createdAt : this.createdAt;
  }
  /**
   * A getter for resolved data. If keyframes are not yet resolved, accessing
   * this.resolved will synchronously flush all pending keyframe resolvers.
   * This is a deoptimisation, but at its worst still batches read/writes.
   */
  get resolved() {
    return !this._resolved && !this.hasAttemptedResolve && t1(), this._resolved;
  }
  /**
   * A method to be called when the keyframes resolver completes. This method
   * will check if its possible to run the animation and, if not, skip it.
   * Otherwise, it will call initPlayback on the implementing class.
   */
  onKeyframesResolved(t, n) {
    this.resolvedAt = nt.now(), this.hasAttemptedResolve = !0;
    const { name: r, type: i, velocity: s, delay: o, onComplete: l, onUpdate: a, isGenerator: u } = this.options;
    if (!u && !o1(t, r, i, s))
      if (o)
        this.options.duration = 0;
      else {
        a && a(Ks(t, this.options, n)), l && l(), this.resolveFinishedPromise();
        return;
      }
    const c = this.initPlayback(t, n);
    c !== !1 && (this._resolved = {
      keyframes: t,
      finalKeyframe: n,
      ...c
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
const K = (e, t, n) => e + (t - e) * n;
function ko(e, t, n) {
  return n < 0 && (n += 1), n > 1 && (n -= 1), n < 1 / 6 ? e + (t - e) * 6 * n : n < 1 / 2 ? t : n < 2 / 3 ? e + (t - e) * (2 / 3 - n) * 6 : e;
}
function u1({ hue: e, saturation: t, lightness: n, alpha: r }) {
  e /= 360, t /= 100, n /= 100;
  let i = 0, s = 0, o = 0;
  if (!t)
    i = s = o = n;
  else {
    const l = n < 0.5 ? n * (1 + t) : n + t - n * t, a = 2 * n - l;
    i = ko(a, l, e + 1 / 3), s = ko(a, l, e), o = ko(a, l, e - 1 / 3);
  }
  return {
    red: Math.round(i * 255),
    green: Math.round(s * 255),
    blue: Math.round(o * 255),
    alpha: r
  };
}
function xs(e, t) {
  return (n) => n > 0 ? t : e;
}
const To = (e, t, n) => {
  const r = e * e, i = n * (t * t - r) + r;
  return i < 0 ? 0 : Math.sqrt(i);
}, c1 = [Rl, en, Cn], f1 = (e) => c1.find((t) => t.test(e));
function bc(e) {
  const t = f1(e);
  if (!t)
    return !1;
  let n = t.parse(e);
  return t === Cn && (n = u1(n)), n;
}
const Gc = (e, t) => {
  const n = bc(e), r = bc(t);
  if (!n || !r)
    return xs(e, t);
  const i = { ...n };
  return (s) => (i.red = To(n.red, r.red, s), i.green = To(n.green, r.green, s), i.blue = To(n.blue, r.blue, s), i.alpha = K(n.alpha, r.alpha, s), en.transform(i));
}, d1 = (e, t) => (n) => t(e(n)), si = (...e) => e.reduce(d1), Ll = /* @__PURE__ */ new Set(["none", "hidden"]);
function h1(e, t) {
  return Ll.has(e) ? (n) => n <= 0 ? e : t : (n) => n >= 1 ? t : e;
}
function p1(e, t) {
  return (n) => K(e, t, n);
}
function pu(e) {
  return typeof e == "number" ? p1 : typeof e == "string" ? Qa(e) ? xs : de.test(e) ? Gc : v1 : Array.isArray(e) ? sm : typeof e == "object" ? de.test(e) ? Gc : m1 : xs;
}
function sm(e, t) {
  const n = [...e], r = n.length, i = e.map((s, o) => pu(s)(s, t[o]));
  return (s) => {
    for (let o = 0; o < r; o++)
      n[o] = i[o](s);
    return n;
  };
}
function m1(e, t) {
  const n = { ...e, ...t }, r = {};
  for (const i in n)
    e[i] !== void 0 && t[i] !== void 0 && (r[i] = pu(e[i])(e[i], t[i]));
  return (i) => {
    for (const s in r)
      n[s] = r[s](i);
    return n;
  };
}
function g1(e, t) {
  var n;
  const r = [], i = { color: 0, var: 0, number: 0 };
  for (let s = 0; s < t.values.length; s++) {
    const o = t.types[s], l = e.indexes[o][i[o]], a = (n = e.values[l]) !== null && n !== void 0 ? n : 0;
    r[s] = a, i[o]++;
  }
  return r;
}
const v1 = (e, t) => {
  const n = Ot.createTransformer(t), r = Xr(e), i = Xr(t);
  return r.indexes.var.length === i.indexes.var.length && r.indexes.color.length === i.indexes.color.length && r.indexes.number.length >= i.indexes.number.length ? Ll.has(e) && !i.values.length || Ll.has(t) && !r.values.length ? h1(e, t) : si(sm(g1(r, i), i.values), n) : xs(e, t);
};
function om(e, t, n) {
  return typeof e == "number" && typeof t == "number" && typeof n == "number" ? K(e, t, n) : pu(e)(e, t);
}
const y1 = 5;
function lm(e, t, n) {
  const r = Math.max(t - y1, 0);
  return Lp(n - e(r), t - r);
}
const G = {
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
}, Eo = 1e-3;
function x1({ duration: e = G.duration, bounce: t = G.bounce, velocity: n = G.velocity, mass: r = G.mass }) {
  let i, s, o = 1 - t;
  o = gt(G.minDamping, G.maxDamping, o), e = gt(G.minDuration, G.maxDuration, /* @__PURE__ */ ft(e)), o < 1 ? (i = (u) => {
    const c = u * o, f = c * e, d = c - n, g = _l(u, o), v = Math.exp(-f);
    return Eo - d / g * v;
  }, s = (u) => {
    const f = u * o * e, d = f * n + n, g = Math.pow(o, 2) * Math.pow(u, 2) * e, v = Math.exp(-f), y = _l(Math.pow(u, 2), o);
    return (-i(u) + Eo > 0 ? -1 : 1) * ((d - g) * v) / y;
  }) : (i = (u) => {
    const c = Math.exp(-u * e), f = (u - n) * e + 1;
    return -Eo + c * f;
  }, s = (u) => {
    const c = Math.exp(-u * e), f = (n - u) * (e * e);
    return c * f;
  });
  const l = 5 / e, a = S1(i, s, l);
  if (e = /* @__PURE__ */ ct(e), isNaN(a))
    return {
      stiffness: G.stiffness,
      damping: G.damping,
      duration: e
    };
  {
    const u = Math.pow(a, 2) * r;
    return {
      stiffness: u,
      damping: o * 2 * Math.sqrt(r * u),
      duration: e
    };
  }
}
const w1 = 12;
function S1(e, t, n) {
  let r = n;
  for (let i = 1; i < w1; i++)
    r = r - e(r) / t(r);
  return r;
}
function _l(e, t) {
  return e * Math.sqrt(1 - t * t);
}
const k1 = ["duration", "bounce"], T1 = ["stiffness", "damping", "mass"];
function Qc(e, t) {
  return t.some((n) => e[n] !== void 0);
}
function E1(e) {
  let t = {
    velocity: G.velocity,
    stiffness: G.stiffness,
    damping: G.damping,
    mass: G.mass,
    isResolvedFromDuration: !1,
    ...e
  };
  if (!Qc(e, T1) && Qc(e, k1))
    if (e.visualDuration) {
      const n = e.visualDuration, r = 2 * Math.PI / (n * 1.2), i = r * r, s = 2 * gt(0.05, 1, 1 - (e.bounce || 0)) * Math.sqrt(i);
      t = {
        ...t,
        mass: G.mass,
        stiffness: i,
        damping: s
      };
    } else {
      const n = x1(e);
      t = {
        ...t,
        ...n,
        mass: G.mass
      }, t.isResolvedFromDuration = !0;
    }
  return t;
}
function am(e = G.visualDuration, t = G.bounce) {
  const n = typeof e != "object" ? {
    visualDuration: e,
    keyframes: [0, 1],
    bounce: t
  } : e;
  let { restSpeed: r, restDelta: i } = n;
  const s = n.keyframes[0], o = n.keyframes[n.keyframes.length - 1], l = { done: !1, value: s }, { stiffness: a, damping: u, mass: c, duration: f, velocity: d, isResolvedFromDuration: g } = E1({
    ...n,
    velocity: -/* @__PURE__ */ ft(n.velocity || 0)
  }), v = d || 0, y = u / (2 * Math.sqrt(a * c)), S = o - s, p = /* @__PURE__ */ ft(Math.sqrt(a / c)), h = Math.abs(S) < 5;
  r || (r = h ? G.restSpeed.granular : G.restSpeed.default), i || (i = h ? G.restDelta.granular : G.restDelta.default);
  let m;
  if (y < 1) {
    const w = _l(p, y);
    m = (E) => {
      const D = Math.exp(-y * p * E);
      return o - D * ((v + y * p * S) / w * Math.sin(w * E) + S * Math.cos(w * E));
    };
  } else if (y === 1)
    m = (w) => o - Math.exp(-p * w) * (S + (v + p * S) * w);
  else {
    const w = p * Math.sqrt(y * y - 1);
    m = (E) => {
      const D = Math.exp(-y * p * E), k = Math.min(w * E, 300);
      return o - D * ((v + y * p * S) * Math.sinh(k) + w * S * Math.cosh(k)) / w;
    };
  }
  const x = {
    calculatedDuration: g && f || null,
    next: (w) => {
      const E = m(w);
      if (g)
        l.done = w >= f;
      else {
        let D = 0;
        y < 1 && (D = w === 0 ? /* @__PURE__ */ ct(v) : lm(m, w, E));
        const k = Math.abs(D) <= r, L = Math.abs(o - E) <= i;
        l.done = k && L;
      }
      return l.value = l.done ? o : E, l;
    },
    toString: () => {
      const w = Math.min(Dp(x), Cl), E = Cp((D) => x.next(w * D).value, w, 30);
      return w + "ms " + E;
    }
  };
  return x;
}
function Yc({ keyframes: e, velocity: t = 0, power: n = 0.8, timeConstant: r = 325, bounceDamping: i = 10, bounceStiffness: s = 500, modifyTarget: o, min: l, max: a, restDelta: u = 0.5, restSpeed: c }) {
  const f = e[0], d = {
    done: !1,
    value: f
  }, g = (k) => l !== void 0 && k < l || a !== void 0 && k > a, v = (k) => l === void 0 ? a : a === void 0 || Math.abs(l - k) < Math.abs(a - k) ? l : a;
  let y = n * t;
  const S = f + y, p = o === void 0 ? S : o(S);
  p !== S && (y = p - f);
  const h = (k) => -y * Math.exp(-k / r), m = (k) => p + h(k), x = (k) => {
    const L = h(k), A = m(k);
    d.done = Math.abs(L) <= u, d.value = d.done ? p : A;
  };
  let w, E;
  const D = (k) => {
    g(d.value) && (w = k, E = am({
      keyframes: [d.value, v(d.value)],
      velocity: lm(m, k, d.value),
      // TODO: This should be passing * 1000
      damping: i,
      stiffness: s,
      restDelta: u,
      restSpeed: c
    }));
  };
  return D(0), {
    calculatedDuration: null,
    next: (k) => {
      let L = !1;
      return !E && w === void 0 && (L = !0, x(k), D(k)), w !== void 0 && k >= w ? E.next(k - w) : (!L && x(k), d);
    }
  };
}
const P1 = /* @__PURE__ */ ii(0.42, 0, 1, 1), D1 = /* @__PURE__ */ ii(0, 0, 0.58, 1), um = /* @__PURE__ */ ii(0.42, 0, 0.58, 1), C1 = (e) => Array.isArray(e) && typeof e[0] != "number", N1 = {
  linear: Ne,
  easeIn: P1,
  easeInOut: um,
  easeOut: D1,
  circIn: uu,
  circInOut: Wp,
  circOut: $p,
  backIn: au,
  backInOut: Up,
  backOut: zp,
  anticipate: Bp
}, Xc = (e) => {
  if (ru(e)) {
    op(e.length === 4);
    const [t, n, r, i] = e;
    return ii(t, n, r, i);
  } else if (typeof e == "string")
    return N1[e];
  return e;
};
function V1(e, t, n) {
  const r = [], i = n || om, s = e.length - 1;
  for (let o = 0; o < s; o++) {
    let l = i(e[o], e[o + 1]);
    if (t) {
      const a = Array.isArray(t) ? t[o] || Ne : t;
      l = si(a, l);
    }
    r.push(l);
  }
  return r;
}
function R1(e, t, { clamp: n = !0, ease: r, mixer: i } = {}) {
  const s = e.length;
  if (op(s === t.length), s === 1)
    return () => t[0];
  if (s === 2 && t[0] === t[1])
    return () => t[1];
  const o = e[0] === e[1];
  e[0] > e[s - 1] && (e = [...e].reverse(), t = [...t].reverse());
  const l = V1(t, r, i), a = l.length, u = (c) => {
    if (o && c < e[0])
      return t[0];
    let f = 0;
    if (a > 1)
      for (; f < e.length - 2 && !(c < e[f + 1]); f++)
        ;
    const d = /* @__PURE__ */ Kn(e[f], e[f + 1], c);
    return l[f](d);
  };
  return n ? (c) => u(gt(e[0], e[s - 1], c)) : u;
}
function A1(e, t) {
  const n = e[e.length - 1];
  for (let r = 1; r <= t; r++) {
    const i = /* @__PURE__ */ Kn(0, t, r);
    e.push(K(n, 1, i));
  }
}
function M1(e) {
  const t = [0];
  return A1(t, e.length - 1), t;
}
function j1(e, t) {
  return e.map((n) => n * t);
}
function L1(e, t) {
  return e.map(() => t || um).splice(0, e.length - 1);
}
function ws({ duration: e = 300, keyframes: t, times: n, ease: r = "easeInOut" }) {
  const i = C1(r) ? r.map(Xc) : Xc(r), s = {
    done: !1,
    value: t[0]
  }, o = j1(
    // Only use the provided offsets if they're the correct length
    // TODO Maybe we should warn here if there's a length mismatch
    n && n.length === t.length ? n : M1(t),
    e
  ), l = R1(o, t, {
    ease: Array.isArray(i) ? i : L1(t, i)
  });
  return {
    calculatedDuration: e,
    next: (a) => (s.value = l(a), s.done = a >= e, s)
  };
}
const _1 = (e) => {
  const t = ({ timestamp: n }) => e(n);
  return {
    start: () => B.update(t, !0),
    stop: () => It(t),
    /**
     * If we're processing this frame we can use the
     * framelocked timestamp to keep things in sync.
     */
    now: () => le.isProcessing ? le.timestamp : nt.now()
  };
}, F1 = {
  decay: Yc,
  inertia: Yc,
  tween: ws,
  keyframes: ws,
  spring: am
}, I1 = (e) => e / 100;
class mu extends im {
  constructor(t) {
    super(t), this.holdTime = null, this.cancelTime = null, this.currentTime = 0, this.playbackSpeed = 1, this.pendingPlayState = "running", this.startTime = null, this.state = "idle", this.stop = () => {
      if (this.resolver.cancel(), this.isStopped = !0, this.state === "idle")
        return;
      this.teardown();
      const { onStop: a } = this.options;
      a && a();
    };
    const { name: n, motionValue: r, element: i, keyframes: s } = this.options, o = i?.KeyframeResolver || hu, l = (a, u) => this.onKeyframesResolved(a, u);
    this.resolver = new o(s, l, n, r, i), this.resolver.scheduleResolve();
  }
  flatten() {
    super.flatten(), this._resolved && Object.assign(this._resolved, this.initPlayback(this._resolved.keyframes));
  }
  initPlayback(t) {
    const { type: n = "keyframes", repeat: r = 0, repeatDelay: i = 0, repeatType: s, velocity: o = 0 } = this.options, l = nu(n) ? n : F1[n] || ws;
    let a, u;
    l !== ws && typeof t[0] != "number" && (a = si(I1, om(t[0], t[1])), t = [0, 100]);
    const c = l({ ...this.options, keyframes: t });
    s === "mirror" && (u = l({
      ...this.options,
      keyframes: [...t].reverse(),
      velocity: -o
    })), c.calculatedDuration === null && (c.calculatedDuration = Dp(c));
    const { calculatedDuration: f } = c, d = f + i, g = d * (r + 1) - i;
    return {
      generator: c,
      mirroredGenerator: u,
      mapPercentToKeyframes: a,
      calculatedDuration: f,
      resolvedDuration: d,
      totalDuration: g
    };
  }
  onPostResolved() {
    const { autoplay: t = !0 } = this.options;
    this.play(), this.pendingPlayState === "paused" || !t ? this.pause() : this.state = this.pendingPlayState;
  }
  tick(t, n = !1) {
    const { resolved: r } = this;
    if (!r) {
      const { keyframes: k } = this.options;
      return { done: !0, value: k[k.length - 1] };
    }
    const { finalKeyframe: i, generator: s, mirroredGenerator: o, mapPercentToKeyframes: l, keyframes: a, calculatedDuration: u, totalDuration: c, resolvedDuration: f } = r;
    if (this.startTime === null)
      return s.next(0);
    const { delay: d, repeat: g, repeatType: v, repeatDelay: y, onUpdate: S } = this.options;
    this.speed > 0 ? this.startTime = Math.min(this.startTime, t) : this.speed < 0 && (this.startTime = Math.min(t - c / this.speed, this.startTime)), n ? this.currentTime = t : this.holdTime !== null ? this.currentTime = this.holdTime : this.currentTime = Math.round(t - this.startTime) * this.speed;
    const p = this.currentTime - d * (this.speed >= 0 ? 1 : -1), h = this.speed >= 0 ? p < 0 : p > c;
    this.currentTime = Math.max(p, 0), this.state === "finished" && this.holdTime === null && (this.currentTime = c);
    let m = this.currentTime, x = s;
    if (g) {
      const k = Math.min(this.currentTime, c) / f;
      let L = Math.floor(k), A = k % 1;
      !A && k >= 1 && (A = 1), A === 1 && L--, L = Math.min(L, g + 1), !!(L % 2) && (v === "reverse" ? (A = 1 - A, y && (A -= y / f)) : v === "mirror" && (x = o)), m = gt(0, 1, A) * f;
    }
    const w = h ? { done: !1, value: a[0] } : x.next(m);
    l && (w.value = l(w.value));
    let { done: E } = w;
    !h && u !== null && (E = this.speed >= 0 ? this.currentTime >= c : this.currentTime <= 0);
    const D = this.holdTime === null && (this.state === "finished" || this.state === "running" && E);
    return D && i !== void 0 && (w.value = Ks(a, this.options, i)), S && S(w.value), D && this.finish(), w;
  }
  get duration() {
    const { resolved: t } = this;
    return t ? /* @__PURE__ */ ft(t.calculatedDuration) : 0;
  }
  get time() {
    return /* @__PURE__ */ ft(this.currentTime);
  }
  set time(t) {
    t = /* @__PURE__ */ ct(t), this.currentTime = t, this.holdTime !== null || this.speed === 0 ? this.holdTime = t : this.driver && (this.startTime = this.driver.now() - t / this.speed);
  }
  get speed() {
    return this.playbackSpeed;
  }
  set speed(t) {
    const n = this.playbackSpeed !== t;
    this.playbackSpeed = t, n && (this.time = /* @__PURE__ */ ft(this.currentTime));
  }
  play() {
    if (this.resolver.isScheduled || this.resolver.resume(), !this._resolved) {
      this.pendingPlayState = "running";
      return;
    }
    if (this.isStopped)
      return;
    const { driver: t = _1, onPlay: n, startTime: r } = this.options;
    this.driver || (this.driver = t((s) => this.tick(s))), n && n();
    const i = this.driver.now();
    this.holdTime !== null ? this.startTime = i - this.holdTime : this.startTime ? this.state === "finished" && (this.startTime = i) : this.startTime = r ?? this.calcStartTime(), this.state === "finished" && this.updateFinishedPromise(), this.cancelTime = this.startTime, this.holdTime = null, this.state = "running", this.driver.start();
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
const O1 = /* @__PURE__ */ new Set([
  "opacity",
  "clipPath",
  "filter",
  "transform"
  // TODO: Can be accelerated but currently disabled until https://issues.chromium.org/issues/41491098 is resolved
  // or until we implement support for linear() easing.
  // "background-color"
]);
function z1(e, t, n, { delay: r = 0, duration: i = 300, repeat: s = 0, repeatType: o = "loop", ease: l = "easeInOut", times: a } = {}) {
  const u = { [t]: n };
  a && (u.offset = a);
  const c = Vp(l, i);
  return Array.isArray(c) && (u.easing = c), e.animate(u, {
    delay: r,
    duration: i,
    easing: Array.isArray(c) ? "linear" : c,
    fill: "both",
    iterations: s + 1,
    direction: o === "reverse" ? "alternate" : "normal"
  });
}
const U1 = /* @__PURE__ */ Ba(() => Object.hasOwnProperty.call(Element.prototype, "animate")), Ss = 10, B1 = 2e4;
function $1(e) {
  return nu(e.type) || e.type === "spring" || !Np(e.ease);
}
function W1(e, t) {
  const n = new mu({
    ...t,
    keyframes: e,
    repeat: 0,
    delay: 0,
    isGenerator: !0
  });
  let r = { done: !1, value: e[0] };
  const i = [];
  let s = 0;
  for (; !r.done && s < B1; )
    r = n.sample(s), i.push(r.value), s += Ss;
  return {
    times: void 0,
    keyframes: i,
    duration: s - Ss,
    ease: "linear"
  };
}
const cm = {
  anticipate: Bp,
  backInOut: Up,
  circInOut: Wp
};
function K1(e) {
  return e in cm;
}
class Zc extends im {
  constructor(t) {
    super(t);
    const { name: n, motionValue: r, element: i, keyframes: s } = this.options;
    this.resolver = new rm(s, (o, l) => this.onKeyframesResolved(o, l), n, r, i), this.resolver.scheduleResolve();
  }
  initPlayback(t, n) {
    let { duration: r = 300, times: i, ease: s, type: o, motionValue: l, name: a, startTime: u } = this.options;
    if (!l.owner || !l.owner.current)
      return !1;
    if (typeof s == "string" && ys() && K1(s) && (s = cm[s]), $1(this.options)) {
      const { onComplete: f, onUpdate: d, motionValue: g, element: v, ...y } = this.options, S = W1(t, y);
      t = S.keyframes, t.length === 1 && (t[1] = t[0]), r = S.duration, i = S.times, s = S.ease, o = "keyframes";
    }
    const c = z1(l.owner.current, a, t, { ...this.options, duration: r, times: i, ease: s });
    return c.startTime = u ?? this.calcStartTime(), this.pendingTimeline ? (_c(c, this.pendingTimeline), this.pendingTimeline = void 0) : c.onfinish = () => {
      const { onComplete: f } = this.options;
      l.set(Ks(t, this.options, n)), f && f(), this.cancel(), this.resolveFinishedPromise();
    }, {
      animation: c,
      duration: r,
      times: i,
      type: o,
      ease: s,
      keyframes: t
    };
  }
  get duration() {
    const { resolved: t } = this;
    if (!t)
      return 0;
    const { duration: n } = t;
    return /* @__PURE__ */ ft(n);
  }
  get time() {
    const { resolved: t } = this;
    if (!t)
      return 0;
    const { animation: n } = t;
    return /* @__PURE__ */ ft(n.currentTime || 0);
  }
  set time(t) {
    const { resolved: n } = this;
    if (!n)
      return;
    const { animation: r } = n;
    r.currentTime = /* @__PURE__ */ ct(t);
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
    const { animation: r } = n;
    r.playbackRate = t;
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
        return Ne;
      const { animation: r } = n;
      _c(r, t);
    }
    return Ne;
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
    const { animation: n, keyframes: r, duration: i, type: s, ease: o, times: l } = t;
    if (n.playState === "idle" || n.playState === "finished")
      return;
    if (this.time) {
      const { motionValue: u, onUpdate: c, onComplete: f, element: d, ...g } = this.options, v = new mu({
        ...g,
        keyframes: r,
        duration: i,
        type: s,
        ease: o,
        times: l,
        isGenerator: !0
      }), y = /* @__PURE__ */ ct(this.time);
      u.setWithVelocity(v.sample(y - Ss).value, v.sample(y).value, Ss);
    }
    const { onStop: a } = this.options;
    a && a(), this.cancel();
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
    const { motionValue: n, name: r, repeatDelay: i, repeatType: s, damping: o, type: l } = t;
    if (!n || !n.owner || !(n.owner.current instanceof HTMLElement))
      return !1;
    const { onUpdate: a, transformTemplate: u } = n.owner.getProps();
    return U1() && r && O1.has(r) && /**
     * If we're outputting values to onUpdate then we can't use WAAPI as there's
     * no way to read the value from WAAPI every frame.
     */
    !a && !u && !i && s !== "mirror" && o !== 0 && l !== "inertia";
  }
}
const H1 = {
  type: "spring",
  stiffness: 500,
  damping: 25,
  restSpeed: 10
}, b1 = (e) => ({
  type: "spring",
  stiffness: 550,
  damping: e === 0 ? 2 * Math.sqrt(550) : 30,
  restSpeed: 10
}), G1 = {
  type: "keyframes",
  duration: 0.8
}, Q1 = {
  type: "keyframes",
  ease: [0.25, 0.1, 0.35, 1],
  duration: 0.3
}, Y1 = (e, { keyframes: t }) => t.length > 2 ? G1 : dn.has(e) ? e.startsWith("scale") ? b1(t[1]) : H1 : Q1;
function X1({ when: e, delay: t, delayChildren: n, staggerChildren: r, staggerDirection: i, repeat: s, repeatType: o, repeatDelay: l, from: a, elapsed: u, ...c }) {
  return !!Object.keys(c).length;
}
const gu = (e, t, n, r = {}, i, s) => (o) => {
  const l = tu(r, e) || {}, a = l.delay || r.delay || 0;
  let { elapsed: u = 0 } = r;
  u = u - /* @__PURE__ */ ct(a);
  let c = {
    keyframes: Array.isArray(n) ? n : [null, n],
    ease: "easeOut",
    velocity: t.getVelocity(),
    ...l,
    delay: -u,
    onUpdate: (d) => {
      t.set(d), l.onUpdate && l.onUpdate(d);
    },
    onComplete: () => {
      o(), l.onComplete && l.onComplete();
    },
    name: e,
    motionValue: t,
    element: s ? void 0 : i
  };
  X1(l) || (c = {
    ...c,
    ...Y1(e, c)
  }), c.duration && (c.duration = /* @__PURE__ */ ct(c.duration)), c.repeatDelay && (c.repeatDelay = /* @__PURE__ */ ct(c.repeatDelay)), c.from !== void 0 && (c.keyframes[0] = c.from);
  let f = !1;
  if ((c.type === !1 || c.duration === 0 && !c.repeatDelay) && (c.duration = 0, c.delay === 0 && (f = !0)), f && !s && t.get() !== void 0) {
    const d = Ks(c.keyframes, l);
    if (d !== void 0)
      return B.update(() => {
        c.onUpdate(d), c.onComplete();
      }), new m0([]);
  }
  return !s && Zc.supports(c) ? new Zc(c) : new mu(c);
};
function Z1({ protectedKeys: e, needsAnimating: t }, n) {
  const r = e.hasOwnProperty(n) && t[n] !== !0;
  return t[n] = !1, r;
}
function fm(e, t, { delay: n = 0, transitionOverride: r, type: i } = {}) {
  var s;
  let { transition: o = e.getDefaultTransition(), transitionEnd: l, ...a } = t;
  r && (o = r);
  const u = [], c = i && e.animationState && e.animationState.getState()[i];
  for (const f in a) {
    const d = e.getValue(f, (s = e.latestValues[f]) !== null && s !== void 0 ? s : null), g = a[f];
    if (g === void 0 || c && Z1(c, f))
      continue;
    const v = {
      delay: n,
      ...tu(o || {}, f)
    };
    let y = !1;
    if (window.MotionHandoffAnimation) {
      const p = _p(e);
      if (p) {
        const h = window.MotionHandoffAnimation(p, f, B);
        h !== null && (v.startTime = h, y = !0);
      }
    }
    Vl(e, f), d.start(gu(f, d, g, e.shouldReduceMotion && jp.has(f) ? { type: !1 } : v, e, y));
    const S = d.animation;
    S && u.push(S);
  }
  return l && Promise.all(u).then(() => {
    B.update(() => {
      l && V0(e, l);
    });
  }), u;
}
function Fl(e, t, n = {}) {
  var r;
  const i = Ws(e, t, n.type === "exit" ? (r = e.presenceContext) === null || r === void 0 ? void 0 : r.custom : void 0);
  let { transition: s = e.getDefaultTransition() || {} } = i || {};
  n.transitionOverride && (s = n.transitionOverride);
  const o = i ? () => Promise.all(fm(e, i, n)) : () => Promise.resolve(), l = e.variantChildren && e.variantChildren.size ? (u = 0) => {
    const { delayChildren: c = 0, staggerChildren: f, staggerDirection: d } = s;
    return q1(e, t, c + u, f, d, n);
  } : () => Promise.resolve(), { when: a } = s;
  if (a) {
    const [u, c] = a === "beforeChildren" ? [o, l] : [l, o];
    return u().then(() => c());
  } else
    return Promise.all([o(), l(n.delay)]);
}
function q1(e, t, n = 0, r = 0, i = 1, s) {
  const o = [], l = (e.variantChildren.size - 1) * r, a = i === 1 ? (u = 0) => u * r : (u = 0) => l - u * r;
  return Array.from(e.variantChildren).sort(J1).forEach((u, c) => {
    u.notify("AnimationStart", t), o.push(Fl(u, t, {
      ...s,
      delay: n + a(c)
    }).then(() => u.notify("AnimationComplete", t)));
  }), Promise.all(o);
}
function J1(e, t) {
  return e.sortNodePosition(t);
}
function ex(e, t, n = {}) {
  e.notify("AnimationStart", t);
  let r;
  if (Array.isArray(t)) {
    const i = t.map((s) => Fl(e, s, n));
    r = Promise.all(i);
  } else if (typeof t == "string")
    r = Fl(e, t, n);
  else {
    const i = typeof t == "function" ? Ws(e, t, n.custom) : t;
    r = Promise.all(fm(e, i, n));
  }
  return r.then(() => {
    e.notify("AnimationComplete", t);
  });
}
const tx = Wa.length;
function dm(e) {
  if (!e)
    return;
  if (!e.isControllingVariants) {
    const n = e.parent ? dm(e.parent) || {} : {};
    return e.props.initial !== void 0 && (n.initial = e.props.initial), n;
  }
  const t = {};
  for (let n = 0; n < tx; n++) {
    const r = Wa[n], i = e.props[r];
    (Gr(i) || i === !1) && (t[r] = i);
  }
  return t;
}
const nx = [...$a].reverse(), rx = $a.length;
function ix(e) {
  return (t) => Promise.all(t.map(({ animation: n, options: r }) => ex(e, n, r)));
}
function sx(e) {
  let t = ix(e), n = qc(), r = !0;
  const i = (a) => (u, c) => {
    var f;
    const d = Ws(e, c, a === "exit" ? (f = e.presenceContext) === null || f === void 0 ? void 0 : f.custom : void 0);
    if (d) {
      const { transition: g, transitionEnd: v, ...y } = d;
      u = { ...u, ...y, ...v };
    }
    return u;
  };
  function s(a) {
    t = a(e);
  }
  function o(a) {
    const { props: u } = e, c = dm(e.parent) || {}, f = [], d = /* @__PURE__ */ new Set();
    let g = {}, v = 1 / 0;
    for (let S = 0; S < rx; S++) {
      const p = nx[S], h = n[p], m = u[p] !== void 0 ? u[p] : c[p], x = Gr(m), w = p === a ? h.isActive : null;
      w === !1 && (v = S);
      let E = m === c[p] && m !== u[p] && x;
      if (E && r && e.manuallyAnimateOnMount && (E = !1), h.protectedKeys = { ...g }, // If it isn't active and hasn't *just* been set as inactive
      !h.isActive && w === null || // If we didn't and don't have any defined prop for this animation type
      !m && !h.prevProp || // Or if the prop doesn't define an animation
      Bs(m) || typeof m == "boolean")
        continue;
      const D = ox(h.prevProp, m);
      let k = D || // If we're making this variant active, we want to always make it active
      p === a && h.isActive && !E && x || // If we removed a higher-priority variant (i is in reverse order)
      S > v && x, L = !1;
      const A = Array.isArray(m) ? m : [m];
      let ne = A.reduce(i(p), {});
      w === !1 && (ne = {});
      const { prevResolvedValues: yt = {} } = h, Wt = {
        ...yt,
        ...ne
      }, Jn = (J) => {
        k = !0, d.has(J) && (L = !0, d.delete(J)), h.needsAnimating[J] = !0;
        const C = e.getValue(J);
        C && (C.liveStyle = !1);
      };
      for (const J in Wt) {
        const C = ne[J], M = yt[J];
        if (g.hasOwnProperty(J))
          continue;
        let j = !1;
        Dl(C) && Dl(M) ? j = !Pp(C, M) : j = C !== M, j ? C != null ? Jn(J) : d.add(J) : C !== void 0 && d.has(J) ? Jn(J) : h.protectedKeys[J] = !0;
      }
      h.prevProp = m, h.prevResolvedValues = ne, h.isActive && (g = { ...g, ...ne }), r && e.blockInitialAnimation && (k = !1), k && (!(E && D) || L) && f.push(...A.map((J) => ({
        animation: J,
        options: { type: p }
      })));
    }
    if (d.size) {
      const S = {};
      d.forEach((p) => {
        const h = e.getBaseTarget(p), m = e.getValue(p);
        m && (m.liveStyle = !0), S[p] = h ?? null;
      }), f.push({ animation: S });
    }
    let y = !!f.length;
    return r && (u.initial === !1 || u.initial === u.animate) && !e.manuallyAnimateOnMount && (y = !1), r = !1, y ? t(f) : Promise.resolve();
  }
  function l(a, u) {
    var c;
    if (n[a].isActive === u)
      return Promise.resolve();
    (c = e.variantChildren) === null || c === void 0 || c.forEach((d) => {
      var g;
      return (g = d.animationState) === null || g === void 0 ? void 0 : g.setActive(a, u);
    }), n[a].isActive = u;
    const f = o(a);
    for (const d in n)
      n[d].protectedKeys = {};
    return f;
  }
  return {
    animateChanges: o,
    setActive: l,
    setAnimateFunction: s,
    getState: () => n,
    reset: () => {
      n = qc(), r = !0;
    }
  };
}
function ox(e, t) {
  return typeof t == "string" ? t !== e : Array.isArray(t) ? !Pp(t, e) : !1;
}
function bt(e = !1) {
  return {
    isActive: e,
    protectedKeys: {},
    needsAnimating: {},
    prevResolvedValues: {}
  };
}
function qc() {
  return {
    animate: bt(!0),
    whileInView: bt(),
    whileHover: bt(),
    whileTap: bt(),
    whileDrag: bt(),
    whileFocus: bt(),
    exit: bt()
  };
}
class $t {
  constructor(t) {
    this.isMounted = !1, this.node = t;
  }
  update() {
  }
}
class lx extends $t {
  /**
   * We dynamically generate the AnimationState manager as it contains a reference
   * to the underlying animation library. We only want to load that if we load this,
   * so people can optionally code split it out using the `m` component.
   */
  constructor(t) {
    super(t), t.animationState || (t.animationState = sx(t));
  }
  updateAnimationControlsSubscription() {
    const { animate: t } = this.node.getProps();
    Bs(t) && (this.unmountControls = t.subscribe(this.node));
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
let ax = 0;
class ux extends $t {
  constructor() {
    super(...arguments), this.id = ax++;
  }
  update() {
    if (!this.node.presenceContext)
      return;
    const { isPresent: t, onExitComplete: n } = this.node.presenceContext, { isPresent: r } = this.node.prevPresenceContext || {};
    if (!this.node.animationState || t === r)
      return;
    const i = this.node.animationState.setActive("exit", !t);
    n && !t && i.then(() => n(this.id));
  }
  mount() {
    const { register: t } = this.node.presenceContext || {};
    t && (this.unmount = t(this.id));
  }
  unmount() {
  }
}
const cx = {
  animation: {
    Feature: lx
  },
  exit: {
    Feature: ux
  }
};
function Zr(e, t, n, r = { passive: !0 }) {
  return e.addEventListener(t, n, r), () => e.removeEventListener(t, n);
}
function oi(e) {
  return {
    point: {
      x: e.pageX,
      y: e.pageY
    }
  };
}
const fx = (e) => (t) => iu(t) && e(t, oi(t));
function Cr(e, t, n, r) {
  return Zr(e, t, fx(n), r);
}
const Jc = (e, t) => Math.abs(e - t);
function dx(e, t) {
  const n = Jc(e.x, t.x), r = Jc(e.y, t.y);
  return Math.sqrt(n ** 2 + r ** 2);
}
class hm {
  constructor(t, n, { transformPagePoint: r, contextWindow: i, dragSnapToOrigin: s = !1 } = {}) {
    if (this.startEvent = null, this.lastMoveEvent = null, this.lastMoveEventInfo = null, this.handlers = {}, this.contextWindow = window, this.updatePoint = () => {
      if (!(this.lastMoveEvent && this.lastMoveEventInfo))
        return;
      const f = Do(this.lastMoveEventInfo, this.history), d = this.startEvent !== null, g = dx(f.offset, { x: 0, y: 0 }) >= 3;
      if (!d && !g)
        return;
      const { point: v } = f, { timestamp: y } = le;
      this.history.push({ ...v, timestamp: y });
      const { onStart: S, onMove: p } = this.handlers;
      d || (S && S(this.lastMoveEvent, f), this.startEvent = this.lastMoveEvent), p && p(this.lastMoveEvent, f);
    }, this.handlePointerMove = (f, d) => {
      this.lastMoveEvent = f, this.lastMoveEventInfo = Po(d, this.transformPagePoint), B.update(this.updatePoint, !0);
    }, this.handlePointerUp = (f, d) => {
      this.end();
      const { onEnd: g, onSessionEnd: v, resumeAnimation: y } = this.handlers;
      if (this.dragSnapToOrigin && y && y(), !(this.lastMoveEvent && this.lastMoveEventInfo))
        return;
      const S = Do(f.type === "pointercancel" ? this.lastMoveEventInfo : Po(d, this.transformPagePoint), this.history);
      this.startEvent && g && g(f, S), v && v(f, S);
    }, !iu(t))
      return;
    this.dragSnapToOrigin = s, this.handlers = n, this.transformPagePoint = r, this.contextWindow = i || window;
    const o = oi(t), l = Po(o, this.transformPagePoint), { point: a } = l, { timestamp: u } = le;
    this.history = [{ ...a, timestamp: u }];
    const { onSessionStart: c } = n;
    c && c(t, Do(l, this.history)), this.removeListeners = si(Cr(this.contextWindow, "pointermove", this.handlePointerMove), Cr(this.contextWindow, "pointerup", this.handlePointerUp), Cr(this.contextWindow, "pointercancel", this.handlePointerUp));
  }
  updateHandlers(t) {
    this.handlers = t;
  }
  end() {
    this.removeListeners && this.removeListeners(), It(this.updatePoint);
  }
}
function Po(e, t) {
  return t ? { point: t(e.point) } : e;
}
function ef(e, t) {
  return { x: e.x - t.x, y: e.y - t.y };
}
function Do({ point: e }, t) {
  return {
    point: e,
    delta: ef(e, pm(t)),
    offset: ef(e, hx(t)),
    velocity: px(t, 0.1)
  };
}
function hx(e) {
  return e[0];
}
function pm(e) {
  return e[e.length - 1];
}
function px(e, t) {
  if (e.length < 2)
    return { x: 0, y: 0 };
  let n = e.length - 1, r = null;
  const i = pm(e);
  for (; n >= 0 && (r = e[n], !(i.timestamp - r.timestamp > /* @__PURE__ */ ct(t))); )
    n--;
  if (!r)
    return { x: 0, y: 0 };
  const s = /* @__PURE__ */ ft(i.timestamp - r.timestamp);
  if (s === 0)
    return { x: 0, y: 0 };
  const o = {
    x: (i.x - r.x) / s,
    y: (i.y - r.y) / s
  };
  return o.x === 1 / 0 && (o.x = 0), o.y === 1 / 0 && (o.y = 0), o;
}
const mm = 1e-4, mx = 1 - mm, gx = 1 + mm, gm = 0.01, vx = 0 - gm, yx = 0 + gm;
function Re(e) {
  return e.max - e.min;
}
function xx(e, t, n) {
  return Math.abs(e - t) <= n;
}
function tf(e, t, n, r = 0.5) {
  e.origin = r, e.originPoint = K(t.min, t.max, e.origin), e.scale = Re(n) / Re(t), e.translate = K(n.min, n.max, e.origin) - e.originPoint, (e.scale >= mx && e.scale <= gx || isNaN(e.scale)) && (e.scale = 1), (e.translate >= vx && e.translate <= yx || isNaN(e.translate)) && (e.translate = 0);
}
function Nr(e, t, n, r) {
  tf(e.x, t.x, n.x, r ? r.originX : void 0), tf(e.y, t.y, n.y, r ? r.originY : void 0);
}
function nf(e, t, n) {
  e.min = n.min + t.min, e.max = e.min + Re(t);
}
function wx(e, t, n) {
  nf(e.x, t.x, n.x), nf(e.y, t.y, n.y);
}
function rf(e, t, n) {
  e.min = t.min - n.min, e.max = e.min + Re(t);
}
function Vr(e, t, n) {
  rf(e.x, t.x, n.x), rf(e.y, t.y, n.y);
}
function Sx(e, { min: t, max: n }, r) {
  return t !== void 0 && e < t ? e = r ? K(t, e, r.min) : Math.max(e, t) : n !== void 0 && e > n && (e = r ? K(n, e, r.max) : Math.min(e, n)), e;
}
function sf(e, t, n) {
  return {
    min: t !== void 0 ? e.min + t : void 0,
    max: n !== void 0 ? e.max + n - (e.max - e.min) : void 0
  };
}
function kx(e, { top: t, left: n, bottom: r, right: i }) {
  return {
    x: sf(e.x, n, i),
    y: sf(e.y, t, r)
  };
}
function of(e, t) {
  let n = t.min - e.min, r = t.max - e.max;
  return t.max - t.min < e.max - e.min && ([n, r] = [r, n]), { min: n, max: r };
}
function Tx(e, t) {
  return {
    x: of(e.x, t.x),
    y: of(e.y, t.y)
  };
}
function Ex(e, t) {
  let n = 0.5;
  const r = Re(e), i = Re(t);
  return i > r ? n = /* @__PURE__ */ Kn(t.min, t.max - r, e.min) : r > i && (n = /* @__PURE__ */ Kn(e.min, e.max - i, t.min)), gt(0, 1, n);
}
function Px(e, t) {
  const n = {};
  return t.min !== void 0 && (n.min = t.min - e.min), t.max !== void 0 && (n.max = t.max - e.min), n;
}
const Il = 0.35;
function Dx(e = Il) {
  return e === !1 ? e = 0 : e === !0 && (e = Il), {
    x: lf(e, "left", "right"),
    y: lf(e, "top", "bottom")
  };
}
function lf(e, t, n) {
  return {
    min: af(e, t),
    max: af(e, n)
  };
}
function af(e, t) {
  return typeof e == "number" ? e : e[t] || 0;
}
const uf = () => ({
  translate: 0,
  scale: 1,
  origin: 0,
  originPoint: 0
}), Nn = () => ({
  x: uf(),
  y: uf()
}), cf = () => ({ min: 0, max: 0 }), X = () => ({
  x: cf(),
  y: cf()
});
function Le(e) {
  return [e("x"), e("y")];
}
function vm({ top: e, left: t, right: n, bottom: r }) {
  return {
    x: { min: t, max: n },
    y: { min: e, max: r }
  };
}
function Cx({ x: e, y: t }) {
  return { top: t.min, right: e.max, bottom: t.max, left: e.min };
}
function Nx(e, t) {
  if (!t)
    return e;
  const n = t({ x: e.left, y: e.top }), r = t({ x: e.right, y: e.bottom });
  return {
    top: n.y,
    left: n.x,
    bottom: r.y,
    right: r.x
  };
}
function Co(e) {
  return e === void 0 || e === 1;
}
function Ol({ scale: e, scaleX: t, scaleY: n }) {
  return !Co(e) || !Co(t) || !Co(n);
}
function Yt(e) {
  return Ol(e) || ym(e) || e.z || e.rotate || e.rotateX || e.rotateY || e.skewX || e.skewY;
}
function ym(e) {
  return ff(e.x) || ff(e.y);
}
function ff(e) {
  return e && e !== "0%";
}
function ks(e, t, n) {
  const r = e - n, i = t * r;
  return n + i;
}
function df(e, t, n, r, i) {
  return i !== void 0 && (e = ks(e, i, r)), ks(e, n, r) + t;
}
function zl(e, t = 0, n = 1, r, i) {
  e.min = df(e.min, t, n, r, i), e.max = df(e.max, t, n, r, i);
}
function xm(e, { x: t, y: n }) {
  zl(e.x, t.translate, t.scale, t.originPoint), zl(e.y, n.translate, n.scale, n.originPoint);
}
const hf = 0.999999999999, pf = 1.0000000000001;
function Vx(e, t, n, r = !1) {
  const i = n.length;
  if (!i)
    return;
  t.x = t.y = 1;
  let s, o;
  for (let l = 0; l < i; l++) {
    s = n[l], o = s.projectionDelta;
    const { visualElement: a } = s.options;
    a && a.props.style && a.props.style.display === "contents" || (r && s.options.layoutScroll && s.scroll && s !== s.root && Rn(e, {
      x: -s.scroll.offset.x,
      y: -s.scroll.offset.y
    }), o && (t.x *= o.x.scale, t.y *= o.y.scale, xm(e, o)), r && Yt(s.latestValues) && Rn(e, s.latestValues));
  }
  t.x < pf && t.x > hf && (t.x = 1), t.y < pf && t.y > hf && (t.y = 1);
}
function Vn(e, t) {
  e.min = e.min + t, e.max = e.max + t;
}
function mf(e, t, n, r, i = 0.5) {
  const s = K(e.min, e.max, i);
  zl(e, t, n, s, r);
}
function Rn(e, t) {
  mf(e.x, t.x, t.scaleX, t.scale, t.originX), mf(e.y, t.y, t.scaleY, t.scale, t.originY);
}
function wm(e, t) {
  return vm(Nx(e.getBoundingClientRect(), t));
}
function Rx(e, t, n) {
  const r = wm(e, n), { scroll: i } = t;
  return i && (Vn(r.x, i.offset.x), Vn(r.y, i.offset.y)), r;
}
const Sm = ({ current: e }) => e ? e.ownerDocument.defaultView : null, Ax = /* @__PURE__ */ new WeakMap();
class Mx {
  constructor(t) {
    this.openDragLock = null, this.isDragging = !1, this.currentDirection = null, this.originPoint = { x: 0, y: 0 }, this.constraints = !1, this.hasMutatedConstraints = !1, this.elastic = X(), this.visualElement = t;
  }
  start(t, { snapToCursor: n = !1 } = {}) {
    const { presenceContext: r } = this.visualElement;
    if (r && r.isPresent === !1)
      return;
    const i = (c) => {
      const { dragSnapToOrigin: f } = this.getProps();
      f ? this.pauseAnimation() : this.stopAnimation(), n && this.snapToCursor(oi(c).point);
    }, s = (c, f) => {
      const { drag: d, dragPropagation: g, onDragStart: v } = this.getProps();
      if (d && !g && (this.openDragLock && this.openDragLock(), this.openDragLock = E0(d), !this.openDragLock))
        return;
      this.isDragging = !0, this.currentDirection = null, this.resolveConstraints(), this.visualElement.projection && (this.visualElement.projection.isAnimationBlocked = !0, this.visualElement.projection.target = void 0), Le((S) => {
        let p = this.getAxisMotionValue(S).get() || 0;
        if (tt.test(p)) {
          const { projection: h } = this.visualElement;
          if (h && h.layout) {
            const m = h.layout.layoutBox[S];
            m && (p = Re(m) * (parseFloat(p) / 100));
          }
        }
        this.originPoint[S] = p;
      }), v && B.postRender(() => v(c, f)), Vl(this.visualElement, "transform");
      const { animationState: y } = this.visualElement;
      y && y.setActive("whileDrag", !0);
    }, o = (c, f) => {
      const { dragPropagation: d, dragDirectionLock: g, onDirectionLock: v, onDrag: y } = this.getProps();
      if (!d && !this.openDragLock)
        return;
      const { offset: S } = f;
      if (g && this.currentDirection === null) {
        this.currentDirection = jx(S), this.currentDirection !== null && v && v(this.currentDirection);
        return;
      }
      this.updateAxis("x", f.point, S), this.updateAxis("y", f.point, S), this.visualElement.render(), y && y(c, f);
    }, l = (c, f) => this.stop(c, f), a = () => Le((c) => {
      var f;
      return this.getAnimationState(c) === "paused" && ((f = this.getAxisMotionValue(c).animation) === null || f === void 0 ? void 0 : f.play());
    }), { dragSnapToOrigin: u } = this.getProps();
    this.panSession = new hm(t, {
      onSessionStart: i,
      onStart: s,
      onMove: o,
      onSessionEnd: l,
      resumeAnimation: a
    }, {
      transformPagePoint: this.visualElement.getTransformPagePoint(),
      dragSnapToOrigin: u,
      contextWindow: Sm(this.visualElement)
    });
  }
  stop(t, n) {
    const r = this.isDragging;
    if (this.cancel(), !r)
      return;
    const { velocity: i } = n;
    this.startAnimation(i);
    const { onDragEnd: s } = this.getProps();
    s && B.postRender(() => s(t, n));
  }
  cancel() {
    this.isDragging = !1;
    const { projection: t, animationState: n } = this.visualElement;
    t && (t.isAnimationBlocked = !1), this.panSession && this.panSession.end(), this.panSession = void 0;
    const { dragPropagation: r } = this.getProps();
    !r && this.openDragLock && (this.openDragLock(), this.openDragLock = null), n && n.setActive("whileDrag", !1);
  }
  updateAxis(t, n, r) {
    const { drag: i } = this.getProps();
    if (!r || !Ri(t, i, this.currentDirection))
      return;
    const s = this.getAxisMotionValue(t);
    let o = this.originPoint[t] + r[t];
    this.constraints && this.constraints[t] && (o = Sx(o, this.constraints[t], this.elastic[t])), s.set(o);
  }
  resolveConstraints() {
    var t;
    const { dragConstraints: n, dragElastic: r } = this.getProps(), i = this.visualElement.projection && !this.visualElement.projection.layout ? this.visualElement.projection.measure(!1) : (t = this.visualElement.projection) === null || t === void 0 ? void 0 : t.layout, s = this.constraints;
    n && Dn(n) ? this.constraints || (this.constraints = this.resolveRefConstraints()) : n && i ? this.constraints = kx(i.layoutBox, n) : this.constraints = !1, this.elastic = Dx(r), s !== this.constraints && i && this.constraints && !this.hasMutatedConstraints && Le((o) => {
      this.constraints !== !1 && this.getAxisMotionValue(o) && (this.constraints[o] = Px(i.layoutBox[o], this.constraints[o]));
    });
  }
  resolveRefConstraints() {
    const { dragConstraints: t, onMeasureDragConstraints: n } = this.getProps();
    if (!t || !Dn(t))
      return !1;
    const r = t.current, { projection: i } = this.visualElement;
    if (!i || !i.layout)
      return !1;
    const s = Rx(r, i.root, this.visualElement.getTransformPagePoint());
    let o = Tx(i.layout.layoutBox, s);
    if (n) {
      const l = n(Cx(o));
      this.hasMutatedConstraints = !!l, l && (o = vm(l));
    }
    return o;
  }
  startAnimation(t) {
    const { drag: n, dragMomentum: r, dragElastic: i, dragTransition: s, dragSnapToOrigin: o, onDragTransitionEnd: l } = this.getProps(), a = this.constraints || {}, u = Le((c) => {
      if (!Ri(c, n, this.currentDirection))
        return;
      let f = a && a[c] || {};
      o && (f = { min: 0, max: 0 });
      const d = i ? 200 : 1e6, g = i ? 40 : 1e7, v = {
        type: "inertia",
        velocity: r ? t[c] : 0,
        bounceStiffness: d,
        bounceDamping: g,
        timeConstant: 750,
        restDelta: 1,
        restSpeed: 10,
        ...s,
        ...f
      };
      return this.startAxisValueAnimation(c, v);
    });
    return Promise.all(u).then(l);
  }
  startAxisValueAnimation(t, n) {
    const r = this.getAxisMotionValue(t);
    return Vl(this.visualElement, t), r.start(gu(t, r, 0, n, this.visualElement, !1));
  }
  stopAnimation() {
    Le((t) => this.getAxisMotionValue(t).stop());
  }
  pauseAnimation() {
    Le((t) => {
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
    const n = `_drag${t.toUpperCase()}`, r = this.visualElement.getProps(), i = r[n];
    return i || this.visualElement.getValue(t, (r.initial ? r.initial[t] : void 0) || 0);
  }
  snapToCursor(t) {
    Le((n) => {
      const { drag: r } = this.getProps();
      if (!Ri(n, r, this.currentDirection))
        return;
      const { projection: i } = this.visualElement, s = this.getAxisMotionValue(n);
      if (i && i.layout) {
        const { min: o, max: l } = i.layout.layoutBox[n];
        s.set(t[n] - K(o, l, 0.5));
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
    const { drag: t, dragConstraints: n } = this.getProps(), { projection: r } = this.visualElement;
    if (!Dn(n) || !r || !this.constraints)
      return;
    this.stopAnimation();
    const i = { x: 0, y: 0 };
    Le((o) => {
      const l = this.getAxisMotionValue(o);
      if (l && this.constraints !== !1) {
        const a = l.get();
        i[o] = Ex({ min: a, max: a }, this.constraints[o]);
      }
    });
    const { transformTemplate: s } = this.visualElement.getProps();
    this.visualElement.current.style.transform = s ? s({}, "") : "none", r.root && r.root.updateScroll(), r.updateLayout(), this.resolveConstraints(), Le((o) => {
      if (!Ri(o, t, null))
        return;
      const l = this.getAxisMotionValue(o), { min: a, max: u } = this.constraints[o];
      l.set(K(a, u, i[o]));
    });
  }
  addListeners() {
    if (!this.visualElement.current)
      return;
    Ax.set(this.visualElement, this);
    const t = this.visualElement.current, n = Cr(t, "pointerdown", (a) => {
      const { drag: u, dragListener: c = !0 } = this.getProps();
      u && c && this.start(a);
    }), r = () => {
      const { dragConstraints: a } = this.getProps();
      Dn(a) && a.current && (this.constraints = this.resolveRefConstraints());
    }, { projection: i } = this.visualElement, s = i.addEventListener("measure", r);
    i && !i.layout && (i.root && i.root.updateScroll(), i.updateLayout()), B.read(r);
    const o = Zr(window, "resize", () => this.scalePositionWithinConstraints()), l = i.addEventListener("didUpdate", ({ delta: a, hasLayoutChanged: u }) => {
      this.isDragging && u && (Le((c) => {
        const f = this.getAxisMotionValue(c);
        f && (this.originPoint[c] += a[c].translate, f.set(f.get() + a[c].translate));
      }), this.visualElement.render());
    });
    return () => {
      o(), n(), s(), l && l();
    };
  }
  getProps() {
    const t = this.visualElement.getProps(), { drag: n = !1, dragDirectionLock: r = !1, dragPropagation: i = !1, dragConstraints: s = !1, dragElastic: o = Il, dragMomentum: l = !0 } = t;
    return {
      ...t,
      drag: n,
      dragDirectionLock: r,
      dragPropagation: i,
      dragConstraints: s,
      dragElastic: o,
      dragMomentum: l
    };
  }
}
function Ri(e, t, n) {
  return (t === !0 || t === e) && (n === null || n === e);
}
function jx(e, t = 10) {
  let n = null;
  return Math.abs(e.y) > t ? n = "y" : Math.abs(e.x) > t && (n = "x"), n;
}
class Lx extends $t {
  constructor(t) {
    super(t), this.removeGroupControls = Ne, this.removeListeners = Ne, this.controls = new Mx(t);
  }
  mount() {
    const { dragControls: t } = this.node.getProps();
    t && (this.removeGroupControls = t.subscribe(this.controls)), this.removeListeners = this.controls.addListeners() || Ne;
  }
  unmount() {
    this.removeGroupControls(), this.removeListeners();
  }
}
const gf = (e) => (t, n) => {
  e && B.postRender(() => e(t, n));
};
class _x extends $t {
  constructor() {
    super(...arguments), this.removePointerDownListener = Ne;
  }
  onPointerDown(t) {
    this.session = new hm(t, this.createPanHandlers(), {
      transformPagePoint: this.node.getTransformPagePoint(),
      contextWindow: Sm(this.node)
    });
  }
  createPanHandlers() {
    const { onPanSessionStart: t, onPanStart: n, onPan: r, onPanEnd: i } = this.node.getProps();
    return {
      onSessionStart: gf(t),
      onStart: gf(n),
      onMove: r,
      onEnd: (s, o) => {
        delete this.session, i && B.postRender(() => i(s, o));
      }
    };
  }
  mount() {
    this.removePointerDownListener = Cr(this.node.current, "pointerdown", (t) => this.onPointerDown(t));
  }
  update() {
    this.session && this.session.updateHandlers(this.createPanHandlers());
  }
  unmount() {
    this.removePointerDownListener(), this.session && this.session.end();
  }
}
const Hi = {
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
function vf(e, t) {
  return t.max === t.min ? 0 : e / (t.max - t.min) * 100;
}
const ar = {
  correct: (e, t) => {
    if (!t.target)
      return e;
    if (typeof e == "string")
      if (R.test(e))
        e = parseFloat(e);
      else
        return e;
    const n = vf(e, t.target.x), r = vf(e, t.target.y);
    return `${n}% ${r}%`;
  }
}, Fx = {
  correct: (e, { treeScale: t, projectionDelta: n }) => {
    const r = e, i = Ot.parse(e);
    if (i.length > 5)
      return r;
    const s = Ot.createTransformer(e), o = typeof i[0] != "number" ? 1 : 0, l = n.x.scale * t.x, a = n.y.scale * t.y;
    i[0 + o] /= l, i[1 + o] /= a;
    const u = K(l, a, 0.5);
    return typeof i[2 + o] == "number" && (i[2 + o] /= u), typeof i[3 + o] == "number" && (i[3 + o] /= u), s(i);
  }
};
class Ix extends P.Component {
  /**
   * This only mounts projection nodes for components that
   * need measuring, we might want to do it for all components
   * in order to incorporate transforms
   */
  componentDidMount() {
    const { visualElement: t, layoutGroup: n, switchLayoutGroup: r, layoutId: i } = this.props, { projection: s } = t;
    r0(Ox), s && (n.group && n.group.add(s), r && r.register && i && r.register(s), s.root.didUpdate(), s.addEventListener("animationComplete", () => {
      this.safeToRemove();
    }), s.setOptions({
      ...s.options,
      onExitComplete: () => this.safeToRemove()
    })), Hi.hasEverUpdated = !0;
  }
  getSnapshotBeforeUpdate(t) {
    const { layoutDependency: n, visualElement: r, drag: i, isPresent: s } = this.props, o = r.projection;
    return o && (o.isPresent = s, i || t.layoutDependency !== n || n === void 0 ? o.willUpdate() : this.safeToRemove(), t.isPresent !== s && (s ? o.promote() : o.relegate() || B.postRender(() => {
      const l = o.getStack();
      (!l || !l.members.length) && this.safeToRemove();
    }))), null;
  }
  componentDidUpdate() {
    const { projection: t } = this.props.visualElement;
    t && (t.root.didUpdate(), Ha.postRender(() => {
      !t.currentAnimation && t.isLead() && this.safeToRemove();
    }));
  }
  componentWillUnmount() {
    const { visualElement: t, layoutGroup: n, switchLayoutGroup: r } = this.props, { projection: i } = t;
    i && (i.scheduleCheckAfterUnmount(), n && n.group && n.group.remove(i), r && r.deregister && r.deregister(i));
  }
  safeToRemove() {
    const { safeToRemove: t } = this.props;
    t && t();
  }
  render() {
    return null;
  }
}
function km(e) {
  const [t, n] = ip(), r = P.useContext(Ia);
  return ut.jsx(Ix, { ...e, layoutGroup: r, switchLayoutGroup: P.useContext(dp), isPresent: t, safeToRemove: n });
}
const Ox = {
  borderRadius: {
    ...ar,
    applyTo: [
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomLeftRadius",
      "borderBottomRightRadius"
    ]
  },
  borderTopLeftRadius: ar,
  borderTopRightRadius: ar,
  borderBottomLeftRadius: ar,
  borderBottomRightRadius: ar,
  boxShadow: Fx
};
function zx(e, t, n) {
  const r = pe(e) ? e : Yr(e);
  return r.start(gu("", r, t, n)), r.animation;
}
function Ux(e) {
  return e instanceof SVGElement && e.tagName !== "svg";
}
const Bx = (e, t) => e.depth - t.depth;
class $x {
  constructor() {
    this.children = [], this.isDirty = !1;
  }
  add(t) {
    su(this.children, t), this.isDirty = !0;
  }
  remove(t) {
    ou(this.children, t), this.isDirty = !0;
  }
  forEach(t) {
    this.isDirty && this.children.sort(Bx), this.isDirty = !1, this.children.forEach(t);
  }
}
function Wx(e, t) {
  const n = nt.now(), r = ({ timestamp: i }) => {
    const s = i - n;
    s >= t && (It(r), e(s - t));
  };
  return B.read(r, !0), () => It(r);
}
const Tm = ["TopLeft", "TopRight", "BottomLeft", "BottomRight"], Kx = Tm.length, yf = (e) => typeof e == "string" ? parseFloat(e) : e, xf = (e) => typeof e == "number" || R.test(e);
function Hx(e, t, n, r, i, s) {
  i ? (e.opacity = K(
    0,
    // TODO Reinstate this if only child
    n.opacity !== void 0 ? n.opacity : 1,
    bx(r)
  ), e.opacityExit = K(t.opacity !== void 0 ? t.opacity : 1, 0, Gx(r))) : s && (e.opacity = K(t.opacity !== void 0 ? t.opacity : 1, n.opacity !== void 0 ? n.opacity : 1, r));
  for (let o = 0; o < Kx; o++) {
    const l = `border${Tm[o]}Radius`;
    let a = wf(t, l), u = wf(n, l);
    if (a === void 0 && u === void 0)
      continue;
    a || (a = 0), u || (u = 0), a === 0 || u === 0 || xf(a) === xf(u) ? (e[l] = Math.max(K(yf(a), yf(u), r), 0), (tt.test(u) || tt.test(a)) && (e[l] += "%")) : e[l] = u;
  }
  (t.rotate || n.rotate) && (e.rotate = K(t.rotate || 0, n.rotate || 0, r));
}
function wf(e, t) {
  return e[t] !== void 0 ? e[t] : e.borderRadius;
}
const bx = /* @__PURE__ */ Em(0, 0.5, $p), Gx = /* @__PURE__ */ Em(0.5, 0.95, Ne);
function Em(e, t, n) {
  return (r) => r < e ? 0 : r > t ? 1 : n(/* @__PURE__ */ Kn(e, t, r));
}
function Sf(e, t) {
  e.min = t.min, e.max = t.max;
}
function je(e, t) {
  Sf(e.x, t.x), Sf(e.y, t.y);
}
function kf(e, t) {
  e.translate = t.translate, e.scale = t.scale, e.originPoint = t.originPoint, e.origin = t.origin;
}
function Tf(e, t, n, r, i) {
  return e -= t, e = ks(e, 1 / n, r), i !== void 0 && (e = ks(e, 1 / i, r)), e;
}
function Qx(e, t = 0, n = 1, r = 0.5, i, s = e, o = e) {
  if (tt.test(t) && (t = parseFloat(t), t = K(o.min, o.max, t / 100) - o.min), typeof t != "number")
    return;
  let l = K(s.min, s.max, r);
  e === s && (l -= t), e.min = Tf(e.min, t, n, l, i), e.max = Tf(e.max, t, n, l, i);
}
function Ef(e, t, [n, r, i], s, o) {
  Qx(e, t[n], t[r], t[i], t.scale, s, o);
}
const Yx = ["x", "scaleX", "originX"], Xx = ["y", "scaleY", "originY"];
function Pf(e, t, n, r) {
  Ef(e.x, t, Yx, n ? n.x : void 0, r ? r.x : void 0), Ef(e.y, t, Xx, n ? n.y : void 0, r ? r.y : void 0);
}
function Df(e) {
  return e.translate === 0 && e.scale === 1;
}
function Pm(e) {
  return Df(e.x) && Df(e.y);
}
function Cf(e, t) {
  return e.min === t.min && e.max === t.max;
}
function Zx(e, t) {
  return Cf(e.x, t.x) && Cf(e.y, t.y);
}
function Nf(e, t) {
  return Math.round(e.min) === Math.round(t.min) && Math.round(e.max) === Math.round(t.max);
}
function Dm(e, t) {
  return Nf(e.x, t.x) && Nf(e.y, t.y);
}
function Vf(e) {
  return Re(e.x) / Re(e.y);
}
function Rf(e, t) {
  return e.translate === t.translate && e.scale === t.scale && e.originPoint === t.originPoint;
}
class qx {
  constructor() {
    this.members = [];
  }
  add(t) {
    su(this.members, t), t.scheduleRender();
  }
  remove(t) {
    if (ou(this.members, t), t === this.prevLead && (this.prevLead = void 0), t === this.lead) {
      const n = this.members[this.members.length - 1];
      n && this.promote(n);
    }
  }
  relegate(t) {
    const n = this.members.findIndex((i) => t === i);
    if (n === 0)
      return !1;
    let r;
    for (let i = n; i >= 0; i--) {
      const s = this.members[i];
      if (s.isPresent !== !1) {
        r = s;
        break;
      }
    }
    return r ? (this.promote(r), !0) : !1;
  }
  promote(t, n) {
    const r = this.lead;
    if (t !== r && (this.prevLead = r, this.lead = t, t.show(), r)) {
      r.instance && r.scheduleRender(), t.scheduleRender(), t.resumeFrom = r, n && (t.resumeFrom.preserveOpacity = !0), r.snapshot && (t.snapshot = r.snapshot, t.snapshot.latestValues = r.animationValues || r.latestValues), t.root && t.root.isUpdating && (t.isLayoutDirty = !0);
      const { crossfade: i } = t.options;
      i === !1 && r.hide();
    }
  }
  exitAnimationComplete() {
    this.members.forEach((t) => {
      const { options: n, resumingFrom: r } = t;
      n.onExitComplete && n.onExitComplete(), r && r.options.onExitComplete && r.options.onExitComplete();
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
function Jx(e, t, n) {
  let r = "";
  const i = e.x.translate / t.x, s = e.y.translate / t.y, o = n?.z || 0;
  if ((i || s || o) && (r = `translate3d(${i}px, ${s}px, ${o}px) `), (t.x !== 1 || t.y !== 1) && (r += `scale(${1 / t.x}, ${1 / t.y}) `), n) {
    const { transformPerspective: u, rotate: c, rotateX: f, rotateY: d, skewX: g, skewY: v } = n;
    u && (r = `perspective(${u}px) ${r}`), c && (r += `rotate(${c}deg) `), f && (r += `rotateX(${f}deg) `), d && (r += `rotateY(${d}deg) `), g && (r += `skewX(${g}deg) `), v && (r += `skewY(${v}deg) `);
  }
  const l = e.x.scale * t.x, a = e.y.scale * t.y;
  return (l !== 1 || a !== 1) && (r += `scale(${l}, ${a})`), r || "none";
}
const Xt = {
  type: "projectionFrame",
  totalNodes: 0,
  resolvedTargetDeltas: 0,
  recalculatedProjection: 0
}, gr = typeof window < "u" && window.MotionDebug !== void 0, No = ["", "X", "Y", "Z"], ew = { visibility: "hidden" }, Af = 1e3;
let tw = 0;
function Vo(e, t, n, r) {
  const { latestValues: i } = t;
  i[e] && (n[e] = i[e], t.setStaticValue(e, 0), r && (r[e] = 0));
}
function Cm(e) {
  if (e.hasCheckedOptimisedAppear = !0, e.root === e)
    return;
  const { visualElement: t } = e.options;
  if (!t)
    return;
  const n = _p(t);
  if (window.MotionHasOptimisedAnimation(n, "transform")) {
    const { layout: i, layoutId: s } = e.options;
    window.MotionCancelOptimisedAnimation(n, "transform", B, !(i || s));
  }
  const { parent: r } = e;
  r && !r.hasCheckedOptimisedAppear && Cm(r);
}
function Nm({ attachResizeListener: e, defaultParent: t, measureScroll: n, checkIsScrollRoot: r, resetTransform: i }) {
  return class {
    constructor(o = {}, l = t?.()) {
      this.id = tw++, this.animationId = 0, this.children = /* @__PURE__ */ new Set(), this.options = {}, this.isTreeAnimating = !1, this.isAnimationBlocked = !1, this.isLayoutDirty = !1, this.isProjectionDirty = !1, this.isSharedProjectionDirty = !1, this.isTransformDirty = !1, this.updateManuallyBlocked = !1, this.updateBlockedByResize = !1, this.isUpdating = !1, this.isSVG = !1, this.needsReset = !1, this.shouldResetTransform = !1, this.hasCheckedOptimisedAppear = !1, this.treeScale = { x: 1, y: 1 }, this.eventHandlers = /* @__PURE__ */ new Map(), this.hasTreeAnimated = !1, this.updateScheduled = !1, this.scheduleUpdate = () => this.update(), this.projectionUpdateScheduled = !1, this.checkUpdateFailed = () => {
        this.isUpdating && (this.isUpdating = !1, this.clearAllSnapshots());
      }, this.updateProjection = () => {
        this.projectionUpdateScheduled = !1, gr && (Xt.totalNodes = Xt.resolvedTargetDeltas = Xt.recalculatedProjection = 0), this.nodes.forEach(iw), this.nodes.forEach(uw), this.nodes.forEach(cw), this.nodes.forEach(sw), gr && window.MotionDebug.record(Xt);
      }, this.resolvedRelativeTargetAt = 0, this.hasProjected = !1, this.isVisible = !0, this.animationProgress = 0, this.sharedNodes = /* @__PURE__ */ new Map(), this.latestValues = o, this.root = l ? l.root || l : this, this.path = l ? [...l.path, l] : [], this.parent = l, this.depth = l ? l.depth + 1 : 0;
      for (let a = 0; a < this.path.length; a++)
        this.path[a].shouldResetTransform = !0;
      this.root === this && (this.nodes = new $x());
    }
    addEventListener(o, l) {
      return this.eventHandlers.has(o) || this.eventHandlers.set(o, new lu()), this.eventHandlers.get(o).add(l);
    }
    notifyListeners(o, ...l) {
      const a = this.eventHandlers.get(o);
      a && a.notify(...l);
    }
    hasListeners(o) {
      return this.eventHandlers.has(o);
    }
    /**
     * Lifecycles
     */
    mount(o, l = this.root.hasTreeAnimated) {
      if (this.instance)
        return;
      this.isSVG = Ux(o), this.instance = o;
      const { layoutId: a, layout: u, visualElement: c } = this.options;
      if (c && !c.current && c.mount(o), this.root.nodes.add(this), this.parent && this.parent.children.add(this), l && (u || a) && (this.isLayoutDirty = !0), e) {
        let f;
        const d = () => this.root.updateBlockedByResize = !1;
        e(o, () => {
          this.root.updateBlockedByResize = !0, f && f(), f = Wx(d, 250), Hi.hasAnimatedSinceResize && (Hi.hasAnimatedSinceResize = !1, this.nodes.forEach(jf));
        });
      }
      a && this.root.registerSharedNode(a, this), this.options.animate !== !1 && c && (a || u) && this.addEventListener("didUpdate", ({ delta: f, hasLayoutChanged: d, hasRelativeTargetChanged: g, layout: v }) => {
        if (this.isTreeAnimationBlocked()) {
          this.target = void 0, this.relativeTarget = void 0;
          return;
        }
        const y = this.options.transition || c.getDefaultTransition() || mw, { onLayoutAnimationStart: S, onLayoutAnimationComplete: p } = c.getProps(), h = !this.targetLayout || !Dm(this.targetLayout, v) || g, m = !d && g;
        if (this.options.layoutRoot || this.resumeFrom && this.resumeFrom.instance || m || d && (h || !this.currentAnimation)) {
          this.resumeFrom && (this.resumingFrom = this.resumeFrom, this.resumingFrom.resumingFrom = void 0), this.setAnimationOrigin(f, m);
          const x = {
            ...tu(y, "layout"),
            onPlay: S,
            onComplete: p
          };
          (c.shouldReduceMotion || this.options.layoutRoot) && (x.delay = 0, x.type = !1), this.startAnimation(x);
        } else
          d || jf(this), this.isLead() && this.options.onExitComplete && this.options.onExitComplete();
        this.targetLayout = v;
      });
    }
    unmount() {
      this.options.layoutId && this.willUpdate(), this.root.nodes.remove(this);
      const o = this.getStack();
      o && o.remove(this), this.parent && this.parent.children.delete(this), this.instance = void 0, It(this.updateProjection);
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
      this.isUpdateBlocked() || (this.isUpdating = !0, this.nodes && this.nodes.forEach(fw), this.animationId++);
    }
    getTransformTemplate() {
      const { visualElement: o } = this.options;
      return o && o.getProps().transformTemplate;
    }
    willUpdate(o = !0) {
      if (this.root.hasTreeAnimated = !0, this.root.isUpdateBlocked()) {
        this.options.onExitComplete && this.options.onExitComplete();
        return;
      }
      if (window.MotionCancelOptimisedAnimation && !this.hasCheckedOptimisedAppear && Cm(this), !this.root.isUpdating && this.root.startUpdate(), this.isLayoutDirty)
        return;
      this.isLayoutDirty = !0;
      for (let c = 0; c < this.path.length; c++) {
        const f = this.path[c];
        f.shouldResetTransform = !0, f.updateScroll("snapshot"), f.options.layoutRoot && f.willUpdate(!1);
      }
      const { layoutId: l, layout: a } = this.options;
      if (l === void 0 && !a)
        return;
      const u = this.getTransformTemplate();
      this.prevTransformTemplateValue = u ? u(this.latestValues, "") : void 0, this.updateSnapshot(), o && this.notifyListeners("willUpdate");
    }
    update() {
      if (this.updateScheduled = !1, this.isUpdateBlocked()) {
        this.unblockUpdate(), this.clearAllSnapshots(), this.nodes.forEach(Mf);
        return;
      }
      this.isUpdating || this.nodes.forEach(lw), this.isUpdating = !1, this.nodes.forEach(aw), this.nodes.forEach(nw), this.nodes.forEach(rw), this.clearAllSnapshots();
      const l = nt.now();
      le.delta = gt(0, 1e3 / 60, l - le.timestamp), le.timestamp = l, le.isProcessing = !0, xo.update.process(le), xo.preRender.process(le), xo.render.process(le), le.isProcessing = !1;
    }
    didUpdate() {
      this.updateScheduled || (this.updateScheduled = !0, Ha.read(this.scheduleUpdate));
    }
    clearAllSnapshots() {
      this.nodes.forEach(ow), this.sharedNodes.forEach(dw);
    }
    scheduleUpdateProjection() {
      this.projectionUpdateScheduled || (this.projectionUpdateScheduled = !0, B.preRender(this.updateProjection, !1, !0));
    }
    scheduleCheckAfterUnmount() {
      B.postRender(() => {
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
        for (let a = 0; a < this.path.length; a++)
          this.path[a].updateScroll();
      const o = this.layout;
      this.layout = this.measure(!1), this.layoutCorrected = X(), this.isLayoutDirty = !1, this.projectionDelta = void 0, this.notifyListeners("measure", this.layout.layoutBox);
      const { visualElement: l } = this.options;
      l && l.notify("LayoutMeasure", this.layout.layoutBox, o ? o.layoutBox : void 0);
    }
    updateScroll(o = "measure") {
      let l = !!(this.options.layoutScroll && this.instance);
      if (this.scroll && this.scroll.animationId === this.root.animationId && this.scroll.phase === o && (l = !1), l) {
        const a = r(this.instance);
        this.scroll = {
          animationId: this.root.animationId,
          phase: o,
          isRoot: a,
          offset: n(this.instance),
          wasRoot: this.scroll ? this.scroll.isRoot : a
        };
      }
    }
    resetTransform() {
      if (!i)
        return;
      const o = this.isLayoutDirty || this.shouldResetTransform || this.options.alwaysMeasureLayout, l = this.projectionDelta && !Pm(this.projectionDelta), a = this.getTransformTemplate(), u = a ? a(this.latestValues, "") : void 0, c = u !== this.prevTransformTemplateValue;
      o && (l || Yt(this.latestValues) || c) && (i(this.instance, u), this.shouldResetTransform = !1, this.scheduleRender());
    }
    measure(o = !0) {
      const l = this.measurePageBox();
      let a = this.removeElementScroll(l);
      return o && (a = this.removeTransform(a)), gw(a), {
        animationId: this.root.animationId,
        measuredBox: l,
        layoutBox: a,
        latestValues: {},
        source: this.id
      };
    }
    measurePageBox() {
      var o;
      const { visualElement: l } = this.options;
      if (!l)
        return X();
      const a = l.measureViewportBox();
      if (!(((o = this.scroll) === null || o === void 0 ? void 0 : o.wasRoot) || this.path.some(vw))) {
        const { scroll: c } = this.root;
        c && (Vn(a.x, c.offset.x), Vn(a.y, c.offset.y));
      }
      return a;
    }
    removeElementScroll(o) {
      var l;
      const a = X();
      if (je(a, o), !((l = this.scroll) === null || l === void 0) && l.wasRoot)
        return a;
      for (let u = 0; u < this.path.length; u++) {
        const c = this.path[u], { scroll: f, options: d } = c;
        c !== this.root && f && d.layoutScroll && (f.wasRoot && je(a, o), Vn(a.x, f.offset.x), Vn(a.y, f.offset.y));
      }
      return a;
    }
    applyTransform(o, l = !1) {
      const a = X();
      je(a, o);
      for (let u = 0; u < this.path.length; u++) {
        const c = this.path[u];
        !l && c.options.layoutScroll && c.scroll && c !== c.root && Rn(a, {
          x: -c.scroll.offset.x,
          y: -c.scroll.offset.y
        }), Yt(c.latestValues) && Rn(a, c.latestValues);
      }
      return Yt(this.latestValues) && Rn(a, this.latestValues), a;
    }
    removeTransform(o) {
      const l = X();
      je(l, o);
      for (let a = 0; a < this.path.length; a++) {
        const u = this.path[a];
        if (!u.instance || !Yt(u.latestValues))
          continue;
        Ol(u.latestValues) && u.updateSnapshot();
        const c = X(), f = u.measurePageBox();
        je(c, f), Pf(l, u.latestValues, u.snapshot ? u.snapshot.layoutBox : void 0, c);
      }
      return Yt(this.latestValues) && Pf(l, this.latestValues), l;
    }
    setTargetDelta(o) {
      this.targetDelta = o, this.root.scheduleUpdateProjection(), this.isProjectionDirty = !0;
    }
    setOptions(o) {
      this.options = {
        ...this.options,
        ...o,
        crossfade: o.crossfade !== void 0 ? o.crossfade : !0
      };
    }
    clearMeasurements() {
      this.scroll = void 0, this.layout = void 0, this.snapshot = void 0, this.prevTransformTemplateValue = void 0, this.targetDelta = void 0, this.target = void 0, this.isLayoutDirty = !1;
    }
    forceRelativeParentToResolveTarget() {
      this.relativeParent && this.relativeParent.resolvedRelativeTargetAt !== le.timestamp && this.relativeParent.resolveTargetDelta(!0);
    }
    resolveTargetDelta(o = !1) {
      var l;
      const a = this.getLead();
      this.isProjectionDirty || (this.isProjectionDirty = a.isProjectionDirty), this.isTransformDirty || (this.isTransformDirty = a.isTransformDirty), this.isSharedProjectionDirty || (this.isSharedProjectionDirty = a.isSharedProjectionDirty);
      const u = !!this.resumingFrom || this !== a;
      if (!(o || u && this.isSharedProjectionDirty || this.isProjectionDirty || !((l = this.parent) === null || l === void 0) && l.isProjectionDirty || this.attemptToResolveRelativeTarget || this.root.updateBlockedByResize))
        return;
      const { layout: f, layoutId: d } = this.options;
      if (!(!this.layout || !(f || d))) {
        if (this.resolvedRelativeTargetAt = le.timestamp, !this.targetDelta && !this.relativeTarget) {
          const g = this.getClosestProjectingParent();
          g && g.layout && this.animationProgress !== 1 ? (this.relativeParent = g, this.forceRelativeParentToResolveTarget(), this.relativeTarget = X(), this.relativeTargetOrigin = X(), Vr(this.relativeTargetOrigin, this.layout.layoutBox, g.layout.layoutBox), je(this.relativeTarget, this.relativeTargetOrigin)) : this.relativeParent = this.relativeTarget = void 0;
        }
        if (!(!this.relativeTarget && !this.targetDelta)) {
          if (this.target || (this.target = X(), this.targetWithTransforms = X()), this.relativeTarget && this.relativeTargetOrigin && this.relativeParent && this.relativeParent.target ? (this.forceRelativeParentToResolveTarget(), wx(this.target, this.relativeTarget, this.relativeParent.target)) : this.targetDelta ? (this.resumingFrom ? this.target = this.applyTransform(this.layout.layoutBox) : je(this.target, this.layout.layoutBox), xm(this.target, this.targetDelta)) : je(this.target, this.layout.layoutBox), this.attemptToResolveRelativeTarget) {
            this.attemptToResolveRelativeTarget = !1;
            const g = this.getClosestProjectingParent();
            g && !!g.resumingFrom == !!this.resumingFrom && !g.options.layoutScroll && g.target && this.animationProgress !== 1 ? (this.relativeParent = g, this.forceRelativeParentToResolveTarget(), this.relativeTarget = X(), this.relativeTargetOrigin = X(), Vr(this.relativeTargetOrigin, this.target, g.target), je(this.relativeTarget, this.relativeTargetOrigin)) : this.relativeParent = this.relativeTarget = void 0;
          }
          gr && Xt.resolvedTargetDeltas++;
        }
      }
    }
    getClosestProjectingParent() {
      if (!(!this.parent || Ol(this.parent.latestValues) || ym(this.parent.latestValues)))
        return this.parent.isProjecting() ? this.parent : this.parent.getClosestProjectingParent();
    }
    isProjecting() {
      return !!((this.relativeTarget || this.targetDelta || this.options.layoutRoot) && this.layout);
    }
    calcProjection() {
      var o;
      const l = this.getLead(), a = !!this.resumingFrom || this !== l;
      let u = !0;
      if ((this.isProjectionDirty || !((o = this.parent) === null || o === void 0) && o.isProjectionDirty) && (u = !1), a && (this.isSharedProjectionDirty || this.isTransformDirty) && (u = !1), this.resolvedRelativeTargetAt === le.timestamp && (u = !1), u)
        return;
      const { layout: c, layoutId: f } = this.options;
      if (this.isTreeAnimating = !!(this.parent && this.parent.isTreeAnimating || this.currentAnimation || this.pendingAnimation), this.isTreeAnimating || (this.targetDelta = this.relativeTarget = void 0), !this.layout || !(c || f))
        return;
      je(this.layoutCorrected, this.layout.layoutBox);
      const d = this.treeScale.x, g = this.treeScale.y;
      Vx(this.layoutCorrected, this.treeScale, this.path, a), l.layout && !l.target && (this.treeScale.x !== 1 || this.treeScale.y !== 1) && (l.target = l.layout.layoutBox, l.targetWithTransforms = X());
      const { target: v } = l;
      if (!v) {
        this.prevProjectionDelta && (this.createProjectionDeltas(), this.scheduleRender());
        return;
      }
      !this.projectionDelta || !this.prevProjectionDelta ? this.createProjectionDeltas() : (kf(this.prevProjectionDelta.x, this.projectionDelta.x), kf(this.prevProjectionDelta.y, this.projectionDelta.y)), Nr(this.projectionDelta, this.layoutCorrected, v, this.latestValues), (this.treeScale.x !== d || this.treeScale.y !== g || !Rf(this.projectionDelta.x, this.prevProjectionDelta.x) || !Rf(this.projectionDelta.y, this.prevProjectionDelta.y)) && (this.hasProjected = !0, this.scheduleRender(), this.notifyListeners("projectionUpdate", v)), gr && Xt.recalculatedProjection++;
    }
    hide() {
      this.isVisible = !1;
    }
    show() {
      this.isVisible = !0;
    }
    scheduleRender(o = !0) {
      var l;
      if ((l = this.options.visualElement) === null || l === void 0 || l.scheduleRender(), o) {
        const a = this.getStack();
        a && a.scheduleRender();
      }
      this.resumingFrom && !this.resumingFrom.instance && (this.resumingFrom = void 0);
    }
    createProjectionDeltas() {
      this.prevProjectionDelta = Nn(), this.projectionDelta = Nn(), this.projectionDeltaWithTransform = Nn();
    }
    setAnimationOrigin(o, l = !1) {
      const a = this.snapshot, u = a ? a.latestValues : {}, c = { ...this.latestValues }, f = Nn();
      (!this.relativeParent || !this.relativeParent.options.layoutRoot) && (this.relativeTarget = this.relativeTargetOrigin = void 0), this.attemptToResolveRelativeTarget = !l;
      const d = X(), g = a ? a.source : void 0, v = this.layout ? this.layout.source : void 0, y = g !== v, S = this.getStack(), p = !S || S.members.length <= 1, h = !!(y && !p && this.options.crossfade === !0 && !this.path.some(pw));
      this.animationProgress = 0;
      let m;
      this.mixTargetDelta = (x) => {
        const w = x / 1e3;
        Lf(f.x, o.x, w), Lf(f.y, o.y, w), this.setTargetDelta(f), this.relativeTarget && this.relativeTargetOrigin && this.layout && this.relativeParent && this.relativeParent.layout && (Vr(d, this.layout.layoutBox, this.relativeParent.layout.layoutBox), hw(this.relativeTarget, this.relativeTargetOrigin, d, w), m && Zx(this.relativeTarget, m) && (this.isProjectionDirty = !1), m || (m = X()), je(m, this.relativeTarget)), y && (this.animationValues = c, Hx(c, u, this.latestValues, w, h, p)), this.root.scheduleUpdateProjection(), this.scheduleRender(), this.animationProgress = w;
      }, this.mixTargetDelta(this.options.layoutRoot ? 1e3 : 0);
    }
    startAnimation(o) {
      this.notifyListeners("animationStart"), this.currentAnimation && this.currentAnimation.stop(), this.resumingFrom && this.resumingFrom.currentAnimation && this.resumingFrom.currentAnimation.stop(), this.pendingAnimation && (It(this.pendingAnimation), this.pendingAnimation = void 0), this.pendingAnimation = B.update(() => {
        Hi.hasAnimatedSinceResize = !0, this.currentAnimation = zx(0, Af, {
          ...o,
          onUpdate: (l) => {
            this.mixTargetDelta(l), o.onUpdate && o.onUpdate(l);
          },
          onComplete: () => {
            o.onComplete && o.onComplete(), this.completeAnimation();
          }
        }), this.resumingFrom && (this.resumingFrom.currentAnimation = this.currentAnimation), this.pendingAnimation = void 0;
      });
    }
    completeAnimation() {
      this.resumingFrom && (this.resumingFrom.currentAnimation = void 0, this.resumingFrom.preserveOpacity = void 0);
      const o = this.getStack();
      o && o.exitAnimationComplete(), this.resumingFrom = this.currentAnimation = this.animationValues = void 0, this.notifyListeners("animationComplete");
    }
    finishAnimation() {
      this.currentAnimation && (this.mixTargetDelta && this.mixTargetDelta(Af), this.currentAnimation.stop()), this.completeAnimation();
    }
    applyTransformsToTarget() {
      const o = this.getLead();
      let { targetWithTransforms: l, target: a, layout: u, latestValues: c } = o;
      if (!(!l || !a || !u)) {
        if (this !== o && this.layout && u && Vm(this.options.animationType, this.layout.layoutBox, u.layoutBox)) {
          a = this.target || X();
          const f = Re(this.layout.layoutBox.x);
          a.x.min = o.target.x.min, a.x.max = a.x.min + f;
          const d = Re(this.layout.layoutBox.y);
          a.y.min = o.target.y.min, a.y.max = a.y.min + d;
        }
        je(l, a), Rn(l, c), Nr(this.projectionDeltaWithTransform, this.layoutCorrected, l, c);
      }
    }
    registerSharedNode(o, l) {
      this.sharedNodes.has(o) || this.sharedNodes.set(o, new qx()), this.sharedNodes.get(o).add(l);
      const u = l.options.initialPromotionConfig;
      l.promote({
        transition: u ? u.transition : void 0,
        preserveFollowOpacity: u && u.shouldPreserveFollowOpacity ? u.shouldPreserveFollowOpacity(l) : void 0
      });
    }
    isLead() {
      const o = this.getStack();
      return o ? o.lead === this : !0;
    }
    getLead() {
      var o;
      const { layoutId: l } = this.options;
      return l ? ((o = this.getStack()) === null || o === void 0 ? void 0 : o.lead) || this : this;
    }
    getPrevLead() {
      var o;
      const { layoutId: l } = this.options;
      return l ? (o = this.getStack()) === null || o === void 0 ? void 0 : o.prevLead : void 0;
    }
    getStack() {
      const { layoutId: o } = this.options;
      if (o)
        return this.root.sharedNodes.get(o);
    }
    promote({ needsReset: o, transition: l, preserveFollowOpacity: a } = {}) {
      const u = this.getStack();
      u && u.promote(this, a), o && (this.projectionDelta = void 0, this.needsReset = !0), l && this.setOptions({ transition: l });
    }
    relegate() {
      const o = this.getStack();
      return o ? o.relegate(this) : !1;
    }
    resetSkewAndRotation() {
      const { visualElement: o } = this.options;
      if (!o)
        return;
      let l = !1;
      const { latestValues: a } = o;
      if ((a.z || a.rotate || a.rotateX || a.rotateY || a.rotateZ || a.skewX || a.skewY) && (l = !0), !l)
        return;
      const u = {};
      a.z && Vo("z", o, u, this.animationValues);
      for (let c = 0; c < No.length; c++)
        Vo(`rotate${No[c]}`, o, u, this.animationValues), Vo(`skew${No[c]}`, o, u, this.animationValues);
      o.render();
      for (const c in u)
        o.setStaticValue(c, u[c]), this.animationValues && (this.animationValues[c] = u[c]);
      o.scheduleRender();
    }
    getProjectionStyles(o) {
      var l, a;
      if (!this.instance || this.isSVG)
        return;
      if (!this.isVisible)
        return ew;
      const u = {
        visibility: ""
      }, c = this.getTransformTemplate();
      if (this.needsReset)
        return this.needsReset = !1, u.opacity = "", u.pointerEvents = Wi(o?.pointerEvents) || "", u.transform = c ? c(this.latestValues, "") : "none", u;
      const f = this.getLead();
      if (!this.projectionDelta || !this.layout || !f.target) {
        const y = {};
        return this.options.layoutId && (y.opacity = this.latestValues.opacity !== void 0 ? this.latestValues.opacity : 1, y.pointerEvents = Wi(o?.pointerEvents) || ""), this.hasProjected && !Yt(this.latestValues) && (y.transform = c ? c({}, "") : "none", this.hasProjected = !1), y;
      }
      const d = f.animationValues || f.latestValues;
      this.applyTransformsToTarget(), u.transform = Jx(this.projectionDeltaWithTransform, this.treeScale, d), c && (u.transform = c(d, u.transform));
      const { x: g, y: v } = this.projectionDelta;
      u.transformOrigin = `${g.origin * 100}% ${v.origin * 100}% 0`, f.animationValues ? u.opacity = f === this ? (a = (l = d.opacity) !== null && l !== void 0 ? l : this.latestValues.opacity) !== null && a !== void 0 ? a : 1 : this.preserveOpacity ? this.latestValues.opacity : d.opacityExit : u.opacity = f === this ? d.opacity !== void 0 ? d.opacity : "" : d.opacityExit !== void 0 ? d.opacityExit : 0;
      for (const y in vs) {
        if (d[y] === void 0)
          continue;
        const { correct: S, applyTo: p } = vs[y], h = u.transform === "none" ? d[y] : S(d[y], f);
        if (p) {
          const m = p.length;
          for (let x = 0; x < m; x++)
            u[p[x]] = h;
        } else
          u[y] = h;
      }
      return this.options.layoutId && (u.pointerEvents = f === this ? Wi(o?.pointerEvents) || "" : "none"), u;
    }
    clearSnapshot() {
      this.resumeFrom = this.snapshot = void 0;
    }
    // Only run on root
    resetTree() {
      this.root.nodes.forEach((o) => {
        var l;
        return (l = o.currentAnimation) === null || l === void 0 ? void 0 : l.stop();
      }), this.root.nodes.forEach(Mf), this.root.sharedNodes.clear();
    }
  };
}
function nw(e) {
  e.updateLayout();
}
function rw(e) {
  var t;
  const n = ((t = e.resumeFrom) === null || t === void 0 ? void 0 : t.snapshot) || e.snapshot;
  if (e.isLead() && e.layout && n && e.hasListeners("didUpdate")) {
    const { layoutBox: r, measuredBox: i } = e.layout, { animationType: s } = e.options, o = n.source !== e.layout.source;
    s === "size" ? Le((f) => {
      const d = o ? n.measuredBox[f] : n.layoutBox[f], g = Re(d);
      d.min = r[f].min, d.max = d.min + g;
    }) : Vm(s, n.layoutBox, r) && Le((f) => {
      const d = o ? n.measuredBox[f] : n.layoutBox[f], g = Re(r[f]);
      d.max = d.min + g, e.relativeTarget && !e.currentAnimation && (e.isProjectionDirty = !0, e.relativeTarget[f].max = e.relativeTarget[f].min + g);
    });
    const l = Nn();
    Nr(l, r, n.layoutBox);
    const a = Nn();
    o ? Nr(a, e.applyTransform(i, !0), n.measuredBox) : Nr(a, r, n.layoutBox);
    const u = !Pm(l);
    let c = !1;
    if (!e.resumeFrom) {
      const f = e.getClosestProjectingParent();
      if (f && !f.resumeFrom) {
        const { snapshot: d, layout: g } = f;
        if (d && g) {
          const v = X();
          Vr(v, n.layoutBox, d.layoutBox);
          const y = X();
          Vr(y, r, g.layoutBox), Dm(v, y) || (c = !0), f.options.layoutRoot && (e.relativeTarget = y, e.relativeTargetOrigin = v, e.relativeParent = f);
        }
      }
    }
    e.notifyListeners("didUpdate", {
      layout: r,
      snapshot: n,
      delta: a,
      layoutDelta: l,
      hasLayoutChanged: u,
      hasRelativeTargetChanged: c
    });
  } else if (e.isLead()) {
    const { onExitComplete: r } = e.options;
    r && r();
  }
  e.options.transition = void 0;
}
function iw(e) {
  gr && Xt.totalNodes++, e.parent && (e.isProjecting() || (e.isProjectionDirty = e.parent.isProjectionDirty), e.isSharedProjectionDirty || (e.isSharedProjectionDirty = !!(e.isProjectionDirty || e.parent.isProjectionDirty || e.parent.isSharedProjectionDirty)), e.isTransformDirty || (e.isTransformDirty = e.parent.isTransformDirty));
}
function sw(e) {
  e.isProjectionDirty = e.isSharedProjectionDirty = e.isTransformDirty = !1;
}
function ow(e) {
  e.clearSnapshot();
}
function Mf(e) {
  e.clearMeasurements();
}
function lw(e) {
  e.isLayoutDirty = !1;
}
function aw(e) {
  const { visualElement: t } = e.options;
  t && t.getProps().onBeforeLayoutMeasure && t.notify("BeforeLayoutMeasure"), e.resetTransform();
}
function jf(e) {
  e.finishAnimation(), e.targetDelta = e.relativeTarget = e.target = void 0, e.isProjectionDirty = !0;
}
function uw(e) {
  e.resolveTargetDelta();
}
function cw(e) {
  e.calcProjection();
}
function fw(e) {
  e.resetSkewAndRotation();
}
function dw(e) {
  e.removeLeadSnapshot();
}
function Lf(e, t, n) {
  e.translate = K(t.translate, 0, n), e.scale = K(t.scale, 1, n), e.origin = t.origin, e.originPoint = t.originPoint;
}
function _f(e, t, n, r) {
  e.min = K(t.min, n.min, r), e.max = K(t.max, n.max, r);
}
function hw(e, t, n, r) {
  _f(e.x, t.x, n.x, r), _f(e.y, t.y, n.y, r);
}
function pw(e) {
  return e.animationValues && e.animationValues.opacityExit !== void 0;
}
const mw = {
  duration: 0.45,
  ease: [0.4, 0, 0.1, 1]
}, Ff = (e) => typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().includes(e), If = Ff("applewebkit/") && !Ff("chrome/") ? Math.round : Ne;
function Of(e) {
  e.min = If(e.min), e.max = If(e.max);
}
function gw(e) {
  Of(e.x), Of(e.y);
}
function Vm(e, t, n) {
  return e === "position" || e === "preserve-aspect" && !xx(Vf(t), Vf(n), 0.2);
}
function vw(e) {
  var t;
  return e !== e.root && ((t = e.scroll) === null || t === void 0 ? void 0 : t.wasRoot);
}
const yw = Nm({
  attachResizeListener: (e, t) => Zr(e, "resize", t),
  measureScroll: () => ({
    x: document.documentElement.scrollLeft || document.body.scrollLeft,
    y: document.documentElement.scrollTop || document.body.scrollTop
  }),
  checkIsScrollRoot: () => !0
}), Ro = {
  current: void 0
}, Rm = Nm({
  measureScroll: (e) => ({
    x: e.scrollLeft,
    y: e.scrollTop
  }),
  defaultParent: () => {
    if (!Ro.current) {
      const e = new yw({});
      e.mount(window), e.setOptions({ layoutScroll: !0 }), Ro.current = e;
    }
    return Ro.current;
  },
  resetTransform: (e, t) => {
    e.style.transform = t !== void 0 ? t : "none";
  },
  checkIsScrollRoot: (e) => window.getComputedStyle(e).position === "fixed"
}), xw = {
  pan: {
    Feature: _x
  },
  drag: {
    Feature: Lx,
    ProjectionNode: Rm,
    MeasureLayout: km
  }
};
function zf(e, t, n) {
  const { props: r } = e;
  e.animationState && r.whileHover && e.animationState.setActive("whileHover", n === "Start");
  const i = "onHover" + n, s = r[i];
  s && B.postRender(() => s(t, oi(t)));
}
class ww extends $t {
  mount() {
    const { current: t } = this.node;
    t && (this.unmount = x0(t, (n) => (zf(this.node, n, "Start"), (r) => zf(this.node, r, "End"))));
  }
  unmount() {
  }
}
class Sw extends $t {
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
    this.unmount = si(Zr(this.node.current, "focus", () => this.onFocus()), Zr(this.node.current, "blur", () => this.onBlur()));
  }
  unmount() {
  }
}
function Uf(e, t, n) {
  const { props: r } = e;
  e.animationState && r.whileTap && e.animationState.setActive("whileTap", n === "Start");
  const i = "onTap" + (n === "End" ? "" : n), s = r[i];
  s && B.postRender(() => s(t, oi(t)));
}
class kw extends $t {
  mount() {
    const { current: t } = this.node;
    t && (this.unmount = T0(t, (n) => (Uf(this.node, n, "Start"), (r, { success: i }) => Uf(this.node, r, i ? "End" : "Cancel")), { useGlobalTarget: this.node.props.globalTapTarget }));
  }
  unmount() {
  }
}
const Ul = /* @__PURE__ */ new WeakMap(), Ao = /* @__PURE__ */ new WeakMap(), Tw = (e) => {
  const t = Ul.get(e.target);
  t && t(e);
}, Ew = (e) => {
  e.forEach(Tw);
};
function Pw({ root: e, ...t }) {
  const n = e || document;
  Ao.has(n) || Ao.set(n, {});
  const r = Ao.get(n), i = JSON.stringify(t);
  return r[i] || (r[i] = new IntersectionObserver(Ew, { root: e, ...t })), r[i];
}
function Dw(e, t, n) {
  const r = Pw(t);
  return Ul.set(e, n), r.observe(e), () => {
    Ul.delete(e), r.unobserve(e);
  };
}
const Cw = {
  some: 0,
  all: 1
};
class Nw extends $t {
  constructor() {
    super(...arguments), this.hasEnteredView = !1, this.isInView = !1;
  }
  startObserver() {
    this.unmount();
    const { viewport: t = {} } = this.node.getProps(), { root: n, margin: r, amount: i = "some", once: s } = t, o = {
      root: n ? n.current : void 0,
      rootMargin: r,
      threshold: typeof i == "number" ? i : Cw[i]
    }, l = (a) => {
      const { isIntersecting: u } = a;
      if (this.isInView === u || (this.isInView = u, s && !u && this.hasEnteredView))
        return;
      u && (this.hasEnteredView = !0), this.node.animationState && this.node.animationState.setActive("whileInView", u);
      const { onViewportEnter: c, onViewportLeave: f } = this.node.getProps(), d = u ? c : f;
      d && d(a);
    };
    return Dw(this.node.current, o, l);
  }
  mount() {
    this.startObserver();
  }
  update() {
    if (typeof IntersectionObserver > "u")
      return;
    const { props: t, prevProps: n } = this.node;
    ["amount", "margin", "root"].some(Vw(t, n)) && this.startObserver();
  }
  unmount() {
  }
}
function Vw({ viewport: e = {} }, { viewport: t = {} } = {}) {
  return (n) => e[n] !== t[n];
}
const Rw = {
  inView: {
    Feature: Nw
  },
  tap: {
    Feature: kw
  },
  focus: {
    Feature: Sw
  },
  hover: {
    Feature: ww
  }
}, Aw = {
  layout: {
    ProjectionNode: Rm,
    MeasureLayout: km
  }
}, Bl = { current: null }, Am = { current: !1 };
function Mw() {
  if (Am.current = !0, !!Ua)
    if (window.matchMedia) {
      const e = window.matchMedia("(prefers-reduced-motion)"), t = () => Bl.current = e.matches;
      e.addListener(t), t();
    } else
      Bl.current = !1;
}
const jw = [...nm, de, Ot], Lw = (e) => jw.find(tm(e)), Bf = /* @__PURE__ */ new WeakMap();
function _w(e, t, n) {
  for (const r in t) {
    const i = t[r], s = n[r];
    if (pe(i))
      e.addValue(r, i);
    else if (pe(s))
      e.addValue(r, Yr(i, { owner: e }));
    else if (s !== i)
      if (e.hasValue(r)) {
        const o = e.getValue(r);
        o.liveStyle === !0 ? o.jump(i) : o.hasAnimated || o.set(i);
      } else {
        const o = e.getStaticValue(r);
        e.addValue(r, Yr(o !== void 0 ? o : i, { owner: e }));
      }
  }
  for (const r in n)
    t[r] === void 0 && e.removeValue(r);
  return t;
}
const $f = [
  "AnimationStart",
  "AnimationComplete",
  "Update",
  "BeforeLayoutMeasure",
  "LayoutMeasure",
  "LayoutAnimationStart",
  "LayoutAnimationComplete"
];
class Fw {
  /**
   * This method takes React props and returns found MotionValues. For example, HTML
   * MotionValues will be found within the style prop, whereas for Three.js within attribute arrays.
   *
   * This isn't an abstract method as it needs calling in the constructor, but it is
   * intended to be one.
   */
  scrapeMotionValuesFromProps(t, n, r) {
    return {};
  }
  constructor({ parent: t, props: n, presenceContext: r, reducedMotionConfig: i, blockInitialAnimation: s, visualState: o }, l = {}) {
    this.current = null, this.children = /* @__PURE__ */ new Set(), this.isVariantNode = !1, this.isControllingVariants = !1, this.shouldReduceMotion = null, this.values = /* @__PURE__ */ new Map(), this.KeyframeResolver = hu, this.features = {}, this.valueSubscriptions = /* @__PURE__ */ new Map(), this.prevMotionValues = {}, this.events = {}, this.propEventSubscriptions = {}, this.notifyUpdate = () => this.notify("Update", this.latestValues), this.render = () => {
      this.current && (this.triggerBuild(), this.renderInstance(this.current, this.renderState, this.props.style, this.projection));
    }, this.renderScheduledAt = 0, this.scheduleRender = () => {
      const g = nt.now();
      this.renderScheduledAt < g && (this.renderScheduledAt = g, B.render(this.render, !1, !0));
    };
    const { latestValues: a, renderState: u, onUpdate: c } = o;
    this.onUpdate = c, this.latestValues = a, this.baseTarget = { ...a }, this.initialValues = n.initial ? { ...a } : {}, this.renderState = u, this.parent = t, this.props = n, this.presenceContext = r, this.depth = t ? t.depth + 1 : 0, this.reducedMotionConfig = i, this.options = l, this.blockInitialAnimation = !!s, this.isControllingVariants = $s(n), this.isVariantNode = cp(n), this.isVariantNode && (this.variantChildren = /* @__PURE__ */ new Set()), this.manuallyAnimateOnMount = !!(t && t.current);
    const { willChange: f, ...d } = this.scrapeMotionValuesFromProps(n, {}, this);
    for (const g in d) {
      const v = d[g];
      a[g] !== void 0 && pe(v) && v.set(a[g], !1);
    }
  }
  mount(t) {
    this.current = t, Bf.set(t, this), this.projection && !this.projection.instance && this.projection.mount(t), this.parent && this.isVariantNode && !this.isControllingVariants && (this.removeFromVariantTree = this.parent.addVariantChild(this)), this.values.forEach((n, r) => this.bindToMotionValue(r, n)), Am.current || Mw(), this.shouldReduceMotion = this.reducedMotionConfig === "never" ? !1 : this.reducedMotionConfig === "always" ? !0 : Bl.current, this.parent && this.parent.children.add(this), this.update(this.props, this.presenceContext);
  }
  unmount() {
    Bf.delete(this.current), this.projection && this.projection.unmount(), It(this.notifyUpdate), It(this.render), this.valueSubscriptions.forEach((t) => t()), this.valueSubscriptions.clear(), this.removeFromVariantTree && this.removeFromVariantTree(), this.parent && this.parent.children.delete(this);
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
    const r = dn.has(t), i = n.on("change", (l) => {
      this.latestValues[t] = l, this.props.onUpdate && B.preRender(this.notifyUpdate), r && this.projection && (this.projection.isTransformDirty = !0);
    }), s = n.on("renderRequest", this.scheduleRender);
    let o;
    window.MotionCheckAppearSync && (o = window.MotionCheckAppearSync(this, t, n)), this.valueSubscriptions.set(t, () => {
      i(), s(), o && o(), n.owner && n.stop();
    });
  }
  sortNodePosition(t) {
    return !this.current || !this.sortInstanceNodePosition || this.type !== t.type ? 0 : this.sortInstanceNodePosition(this.current, t.current);
  }
  updateFeatures() {
    let t = "animation";
    for (t in Hn) {
      const n = Hn[t];
      if (!n)
        continue;
      const { isEnabled: r, Feature: i } = n;
      if (!this.features[t] && i && r(this.props) && (this.features[t] = new i(this)), this.features[t]) {
        const s = this.features[t];
        s.isMounted ? s.update() : (s.mount(), s.isMounted = !0);
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
    return this.current ? this.measureInstanceViewportBox(this.current, this.props) : X();
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
    for (let r = 0; r < $f.length; r++) {
      const i = $f[r];
      this.propEventSubscriptions[i] && (this.propEventSubscriptions[i](), delete this.propEventSubscriptions[i]);
      const s = "on" + i, o = t[s];
      o && (this.propEventSubscriptions[i] = this.on(i, o));
    }
    this.prevMotionValues = _w(this, this.scrapeMotionValuesFromProps(t, this.prevProps, this), this.prevMotionValues), this.handleChildMotionValue && this.handleChildMotionValue(), this.onUpdate && this.onUpdate(this);
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
    const r = this.values.get(t);
    n !== r && (r && this.removeValue(t), this.bindToMotionValue(t, n), this.values.set(t, n), this.latestValues[t] = n.get());
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
    let r = this.values.get(t);
    return r === void 0 && n !== void 0 && (r = Yr(n === null ? void 0 : n, { owner: this }), this.addValue(t, r)), r;
  }
  /**
   * If we're trying to animate to a previously unencountered value,
   * we need to check for it in our state and as a last resort read it
   * directly from the instance (which might have performance implications).
   */
  readValue(t, n) {
    var r;
    let i = this.latestValues[t] !== void 0 || !this.current ? this.latestValues[t] : (r = this.getBaseTargetFromProps(this.props, t)) !== null && r !== void 0 ? r : this.readValueFromInstance(this.current, t, this.options);
    return i != null && (typeof i == "string" && (Jp(i) || Kp(i)) ? i = parseFloat(i) : !Lw(i) && Ot.test(n) && (i = Xp(t, n)), this.setBaseTarget(t, pe(i) ? i.get() : i)), pe(i) ? i.get() : i;
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
    const { initial: r } = this.props;
    let i;
    if (typeof r == "string" || typeof r == "object") {
      const o = Ga(this.props, r, (n = this.presenceContext) === null || n === void 0 ? void 0 : n.custom);
      o && (i = o[t]);
    }
    if (r && i !== void 0)
      return i;
    const s = this.getBaseTargetFromProps(this.props, t);
    return s !== void 0 && !pe(s) ? s : this.initialValues[t] !== void 0 && i === void 0 ? void 0 : this.baseTarget[t];
  }
  on(t, n) {
    return this.events[t] || (this.events[t] = new lu()), this.events[t].add(n);
  }
  notify(t, ...n) {
    this.events[t] && this.events[t].notify(...n);
  }
}
class Mm extends Fw {
  constructor() {
    super(...arguments), this.KeyframeResolver = rm;
  }
  sortInstanceNodePosition(t, n) {
    return t.compareDocumentPosition(n) & 2 ? 1 : -1;
  }
  getBaseTargetFromProps(t, n) {
    return t.style ? t.style[n] : void 0;
  }
  removeValueFromRenderState(t, { vars: n, style: r }) {
    delete n[t], delete r[t];
  }
  handleChildMotionValue() {
    this.childSubscription && (this.childSubscription(), delete this.childSubscription);
    const { children: t } = this.props;
    pe(t) && (this.childSubscription = t.on("change", (n) => {
      this.current && (this.current.textContent = `${n}`);
    }));
  }
}
function Iw(e) {
  return window.getComputedStyle(e);
}
class Ow extends Mm {
  constructor() {
    super(...arguments), this.type = "html", this.renderInstance = xp;
  }
  readValueFromInstance(t, n) {
    if (dn.has(n)) {
      const r = du(n);
      return r && r.default || 0;
    } else {
      const r = Iw(t), i = (gp(n) ? r.getPropertyValue(n) : r[n]) || 0;
      return typeof i == "string" ? i.trim() : i;
    }
  }
  measureInstanceViewportBox(t, { transformPagePoint: n }) {
    return wm(t, n);
  }
  build(t, n, r) {
    Xa(t, n, r.transformTemplate);
  }
  scrapeMotionValuesFromProps(t, n, r) {
    return eu(t, n, r);
  }
}
class zw extends Mm {
  constructor() {
    super(...arguments), this.type = "svg", this.isSVGTag = !1, this.measureInstanceViewportBox = X;
  }
  getBaseTargetFromProps(t, n) {
    return t[n];
  }
  readValueFromInstance(t, n) {
    if (dn.has(n)) {
      const r = du(n);
      return r && r.default || 0;
    }
    return n = wp.has(n) ? n : Ka(n), t.getAttribute(n);
  }
  scrapeMotionValuesFromProps(t, n, r) {
    return Tp(t, n, r);
  }
  build(t, n, r) {
    Za(t, n, this.isSVGTag, r.transformTemplate);
  }
  renderInstance(t, n, r, i) {
    Sp(t, n, r, i);
  }
  mount(t) {
    this.isSVGTag = Ja(t.tagName), super.mount(t);
  }
}
const Uw = (e, t) => ba(e) ? new zw(t) : new Ow(t, {
  allowProjection: e !== P.Fragment
}), Bw = /* @__PURE__ */ d0({
  ...cx,
  ...Rw,
  ...xw,
  ...Aw
}, Uw), Qe = /* @__PURE__ */ Cy(Bw);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const $w = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), jm = (...e) => e.filter((t, n, r) => !!t && t.trim() !== "" && r.indexOf(t) === n).join(" ").trim();
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
var Ww = {
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
const Kw = P.forwardRef(
  ({
    color: e = "currentColor",
    size: t = 24,
    strokeWidth: n = 2,
    absoluteStrokeWidth: r,
    className: i = "",
    children: s,
    iconNode: o,
    ...l
  }, a) => P.createElement(
    "svg",
    {
      ref: a,
      ...Ww,
      width: t,
      height: t,
      stroke: e,
      strokeWidth: r ? Number(n) * 24 / Number(t) : n,
      className: jm("lucide", i),
      ...l
    },
    [
      ...o.map(([u, c]) => P.createElement(u, c)),
      ...Array.isArray(s) ? s : [s]
    ]
  )
);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const qn = (e, t) => {
  const n = P.forwardRef(
    ({ className: r, ...i }, s) => P.createElement(Kw, {
      ref: s,
      iconNode: t,
      className: jm(`lucide-${$w(e)}`, r),
      ...i
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
const Hw = qn("Bell", [
  ["path", { d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", key: "1qo2s2" }],
  ["path", { d: "M10.3 21a1.94 1.94 0 0 0 3.4 0", key: "qgo35s" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const bw = qn("Pause", [
  ["rect", { x: "14", y: "4", width: "4", height: "16", rx: "1", key: "zuxfzm" }],
  ["rect", { x: "6", y: "4", width: "4", height: "16", rx: "1", key: "1okwgv" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Gw = qn("Play", [
  ["polygon", { points: "6 3 20 12 6 21 6 3", key: "1oa8hb" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Qw = qn("Plus", [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Yw = qn("RotateCcw", [
  ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Xw = qn("X", [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
]), Zw = [
  ["--tm-bg", "--theme-canvas"],
  ["--tm-surface", "--theme-surface"],
  ["--tm-fg", "--theme-ink"],
  ["--tm-dim", "--theme-ink-dim"],
  ["--tm-faint", "--theme-muted"],
  ["--tm-border", "--theme-border"],
  ["--tm-accent", "--theme-accent"],
  ["--tm-accent-fg", "--theme-accent-fg"]
], qw = [
  ["--tm-font-digit", "--theme-font-code"]
];
function Jw(e, t) {
  const n = getComputedStyle(document.documentElement);
  for (const [r, i] of [...Zw, ...qw]) {
    if (!t) {
      e.style.removeProperty(r);
      continue;
    }
    const s = n.getPropertyValue(i).trim();
    s && e.style.setProperty(r, s);
  }
}
function eS(e) {
  const t = new MutationObserver(e);
  return t.observe(document.documentElement, {
    attributes: !0,
    attributeFilter: ["data-mode", "data-contrast", "style", "class"]
  }), () => t.disconnect();
}
function tS() {
  const [e, t] = P.useState(() => /* @__PURE__ */ new Date()), [n, r] = P.useState(!1);
  return P.useEffect(() => {
    const i = setInterval(() => t(/* @__PURE__ */ new Date()), 1e4);
    return () => clearInterval(i);
  }, []), /* @__PURE__ */ V.jsxDEV(
    "button",
    {
      type: "button",
      className: "tm-clock",
      "data-dimmed": n,
      onClick: () => r((i) => !i),
      title: n ? "Show clock" : "Dim clock",
      children: e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    },
    void 0,
    !1,
    {
      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/CurrentTime.tsx",
      lineNumber: 22,
      columnNumber: 5
    },
    this
  );
}
const nS = [15, 25, 30, 45, 60, 90, 120];
function rS(e) {
  if (e < 60) return `${e}m`;
  const t = e / 60;
  return Number.isInteger(t) ? `${t}h` : `${t}h`;
}
function iS({
  totalSeconds: e,
  onSelect: t,
  onStart: n
}) {
  const [r, i] = P.useState(""), s = Math.round(e / 60);
  return /* @__PURE__ */ V.jsxDEV(
    Qe.div,
    {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.05 },
      style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 18 },
      children: [
        /* @__PURE__ */ V.jsxDEV("span", { className: "tm-label", children: "Focus duration" }, void 0, !1, {
          fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/DurationPicker.tsx",
          lineNumber: 31,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ V.jsxDEV("div", { className: "tm-presets", children: nS.map((o) => /* @__PURE__ */ V.jsxDEV(
          "button",
          {
            type: "button",
            className: "tm-preset",
            "data-selected": !r && s === o,
            onClick: () => {
              i(""), t(o);
            },
            children: rS(o)
          },
          o,
          !1,
          {
            fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/DurationPicker.tsx",
            lineNumber: 35,
            columnNumber: 11
          },
          this
        )) }, void 0, !1, {
          fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/DurationPicker.tsx",
          lineNumber: 33,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ V.jsxDEV("div", { className: "tm-row", children: /* @__PURE__ */ V.jsxDEV(
          "input",
          {
            className: "tm-custom",
            type: "number",
            min: 1,
            max: 480,
            placeholder: "Custom",
            value: r,
            onChange: (o) => {
              const l = o.target.value;
              i(l);
              const a = Number.parseInt(l, 10);
              Number.isFinite(a) && a > 0 && t(a);
            },
            onKeyDown: (o) => {
              o.key === "Enter" && (o.preventDefault(), o.stopPropagation(), n());
            }
          },
          void 0,
          !1,
          {
            fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/DurationPicker.tsx",
            lineNumber: 51,
            columnNumber: 9
          },
          this
        ) }, void 0, !1, {
          fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/DurationPicker.tsx",
          lineNumber: 50,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ V.jsxDEV("button", { type: "button", className: "tm-primary", onClick: n, children: "Start focus" }, void 0, !1, {
          fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/DurationPicker.tsx",
          lineNumber: 76,
          columnNumber: 7
        }, this)
      ]
    },
    void 0,
    !0,
    {
      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/DurationPicker.tsx",
      lineNumber: 25,
      columnNumber: 5
    },
    this
  );
}
function sS({
  reminder: e,
  onDismiss: t
}) {
  return /* @__PURE__ */ V.jsxDEV(
    Qe.div,
    {
      className: "tm-alert",
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.25 },
      children: /* @__PURE__ */ V.jsxDEV(
        Qe.div,
        {
          className: "tm-alert-card",
          initial: { scale: 0.94, y: 10 },
          animate: { scale: 1, y: 0 },
          transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
          children: [
            /* @__PURE__ */ V.jsxDEV(
              Qe.div,
              {
                className: "tm-alert-icon",
                animate: { scale: [1, 1.08, 1] },
                transition: { repeat: 1 / 0, duration: 1.6 },
                children: "⏰"
              },
              void 0,
              !1,
              {
                fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderAlert.tsx",
                lineNumber: 35,
                columnNumber: 9
              },
              this
            ),
            /* @__PURE__ */ V.jsxDEV("div", { children: [
              /* @__PURE__ */ V.jsxDEV("div", { style: { fontSize: 17, fontWeight: 600, marginBottom: 3 }, children: e.label }, void 0, !1, {
                fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderAlert.tsx",
                lineNumber: 44,
                columnNumber: 11
              }, this),
              /* @__PURE__ */ V.jsxDEV("div", { className: "tm-reminder-sub", children: "Timer paused until you dismiss this" }, void 0, !1, {
                fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderAlert.tsx",
                lineNumber: 45,
                columnNumber: 11
              }, this)
            ] }, void 0, !0, {
              fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderAlert.tsx",
              lineNumber: 43,
              columnNumber: 9
            }, this),
            /* @__PURE__ */ V.jsxDEV("button", { type: "button", className: "tm-primary", style: { width: "100%" }, onClick: t, children: "Done" }, void 0, !1, {
              fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderAlert.tsx",
              lineNumber: 48,
              columnNumber: 9
            }, this)
          ]
        },
        void 0,
        !0,
        {
          fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderAlert.tsx",
          lineNumber: 29,
          columnNumber: 7
        },
        this
      )
    },
    void 0,
    !1,
    {
      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderAlert.tsx",
      lineNumber: 22,
      columnNumber: 5
    },
    this
  );
}
function oS({
  reminders: e,
  onAdd: t,
  onRemove: n
}) {
  const [r, i] = P.useState(""), [s, o] = P.useState("30"), [l, a] = P.useState(!1), u = () => {
    const f = Number.parseInt(s, 10);
    !r.trim() || !Number.isFinite(f) || f <= 0 || (t(r, f), i(""), o("30"), a(!1));
  }, c = (f) => f.stopPropagation();
  return /* @__PURE__ */ V.jsxDEV(
    Qe.div,
    {
      className: "tm-reminders",
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.12 },
      children: [
        /* @__PURE__ */ V.jsxDEV("div", { className: "tm-reminders-head", children: [
          /* @__PURE__ */ V.jsxDEV("span", { className: "tm-label", style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [
            /* @__PURE__ */ V.jsxDEV(Hw, { size: 12 }, void 0, !1, {
              fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
              lineNumber: 44,
              columnNumber: 11
            }, this),
            "Reminders"
          ] }, void 0, !0, {
            fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
            lineNumber: 43,
            columnNumber: 9
          }, this),
          l ? null : /* @__PURE__ */ V.jsxDEV(
            "button",
            {
              type: "button",
              className: "tm-ghost",
              style: { display: "inline-flex", alignItems: "center", gap: 4 },
              onClick: () => a(!0),
              children: [
                /* @__PURE__ */ V.jsxDEV(Qw, { size: 12 }, void 0, !1, {
                  fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
                  lineNumber: 54,
                  columnNumber: 13
                }, this),
                "Add"
              ]
            },
            void 0,
            !0,
            {
              fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
              lineNumber: 48,
              columnNumber: 11
            },
            this
          )
        ] }, void 0, !0, {
          fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
          lineNumber: 42,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ V.jsxDEV(Pl, { mode: "popLayout", children: [
          l ? /* @__PURE__ */ V.jsxDEV(
            Qe.div,
            {
              className: "tm-add",
              initial: { opacity: 0, height: 0 },
              animate: { opacity: 1, height: "auto" },
              exit: { opacity: 0, height: 0 },
              transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
              children: [
                /* @__PURE__ */ V.jsxDEV(
                  "input",
                  {
                    autoFocus: !0,
                    type: "text",
                    placeholder: "e.g. Stand up and stretch",
                    value: r,
                    onChange: (f) => i(f.target.value),
                    onKeyDown: (f) => {
                      c(f), f.key === "Enter" && u(), f.key === "Escape" && a(!1);
                    }
                  },
                  void 0,
                  !1,
                  {
                    fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
                    lineNumber: 70,
                    columnNumber: 13
                  },
                  this
                ),
                /* @__PURE__ */ V.jsxDEV("div", { className: "tm-row", children: [
                  /* @__PURE__ */ V.jsxDEV("span", { className: "tm-reminder-sub", children: "Every" }, void 0, !1, {
                    fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
                    lineNumber: 83,
                    columnNumber: 15
                  }, this),
                  /* @__PURE__ */ V.jsxDEV(
                    "input",
                    {
                      type: "number",
                      min: 1,
                      style: { width: 62, textAlign: "center" },
                      value: s,
                      onChange: (f) => o(f.target.value),
                      onKeyDown: (f) => {
                        c(f), f.key === "Enter" && u();
                      }
                    },
                    void 0,
                    !1,
                    {
                      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
                      lineNumber: 84,
                      columnNumber: 15
                    },
                    this
                  ),
                  /* @__PURE__ */ V.jsxDEV("span", { className: "tm-reminder-sub", children: "min" }, void 0, !1, {
                    fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
                    lineNumber: 95,
                    columnNumber: 15
                  }, this)
                ] }, void 0, !0, {
                  fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
                  lineNumber: 82,
                  columnNumber: 13
                }, this),
                /* @__PURE__ */ V.jsxDEV("div", { className: "tm-row", style: { marginTop: 2 }, children: [
                  /* @__PURE__ */ V.jsxDEV(
                    "button",
                    {
                      type: "button",
                      className: "tm-primary",
                      style: { flex: 1, padding: "8px 0", fontSize: 13 },
                      onClick: u,
                      children: "Add"
                    },
                    void 0,
                    !1,
                    {
                      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
                      lineNumber: 98,
                      columnNumber: 15
                    },
                    this
                  ),
                  /* @__PURE__ */ V.jsxDEV(
                    "button",
                    {
                      type: "button",
                      className: "tm-circle",
                      style: { width: "auto", height: "auto", padding: "8px 16px", borderRadius: 999 },
                      onClick: () => a(!1),
                      children: /* @__PURE__ */ V.jsxDEV("span", { style: { fontSize: 13 }, children: "Cancel" }, void 0, !1, {
                        fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
                        lineNumber: 112,
                        columnNumber: 17
                      }, this)
                    },
                    void 0,
                    !1,
                    {
                      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
                      lineNumber: 106,
                      columnNumber: 15
                    },
                    this
                  )
                ] }, void 0, !0, {
                  fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
                  lineNumber: 97,
                  columnNumber: 13
                }, this)
              ]
            },
            "add",
            !0,
            {
              fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
              lineNumber: 62,
              columnNumber: 11
            },
            this
          ) : null,
          e.map((f) => /* @__PURE__ */ V.jsxDEV(
            Qe.div,
            {
              className: "tm-reminder",
              initial: { opacity: 0, x: -6 },
              animate: { opacity: 1, x: 0 },
              exit: { opacity: 0, x: 6 },
              transition: { duration: 0.2 },
              children: [
                /* @__PURE__ */ V.jsxDEV("div", { style: { display: "flex", flexDirection: "column" }, children: [
                  /* @__PURE__ */ V.jsxDEV("span", { className: "tm-reminder-label", children: f.label }, void 0, !1, {
                    fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
                    lineNumber: 128,
                    columnNumber: 15
                  }, this),
                  /* @__PURE__ */ V.jsxDEV("span", { className: "tm-reminder-sub", children: [
                    "Every ",
                    f.intervalMinutes,
                    " min"
                  ] }, void 0, !0, {
                    fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
                    lineNumber: 129,
                    columnNumber: 15
                  }, this)
                ] }, void 0, !0, {
                  fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
                  lineNumber: 127,
                  columnNumber: 13
                }, this),
                /* @__PURE__ */ V.jsxDEV(
                  "button",
                  {
                    type: "button",
                    className: "tm-ghost",
                    onClick: () => n(f.id),
                    title: "Remove reminder",
                    children: /* @__PURE__ */ V.jsxDEV(Xw, { size: 13 }, void 0, !1, {
                      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
                      lineNumber: 137,
                      columnNumber: 15
                    }, this)
                  },
                  void 0,
                  !1,
                  {
                    fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
                    lineNumber: 131,
                    columnNumber: 13
                  },
                  this
                )
              ]
            },
            f.id,
            !0,
            {
              fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
              lineNumber: 119,
              columnNumber: 11
            },
            this
          ))
        ] }, void 0, !0, {
          fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
          lineNumber: 60,
          columnNumber: 7
        }, this),
        e.length === 0 && !l ? /* @__PURE__ */ V.jsxDEV("p", { className: "tm-reminder-sub", style: { textAlign: "center", padding: "8px 0" }, children: "No reminders set" }, void 0, !1, {
          fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
          lineNumber: 144,
          columnNumber: 9
        }, this) : null
      ]
    },
    void 0,
    !0,
    {
      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/ReminderManager.tsx",
      lineNumber: 36,
      columnNumber: 5
    },
    this
  );
}
function ur(e) {
  return e.toString().padStart(2, "0");
}
function lS({
  remainingSeconds: e,
  phase: t
}) {
  const n = Math.floor(e / 3600), r = Math.floor(e % 3600 / 60), i = e % 60, s = n > 0 ? `${ur(n)}:${ur(r)}:${ur(i)}` : `${ur(r)}:${ur(i)}`;
  return /* @__PURE__ */ V.jsxDEV(
    Qe.span,
    {
      className: "tm-digits",
      "data-state": t,
      initial: { opacity: 0, scale: 0.96 },
      animate: { opacity: 1, scale: 1 },
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
      children: s
    },
    void 0,
    !1,
    {
      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/components/TimerDisplay.tsx",
      lineNumber: 26,
      columnNumber: 5
    },
    this
  );
}
function aS({ engine: e }) {
  const t = P.useCallback((l) => e.subscribe(l), [e]), n = P.useCallback(() => e.snapshot(), [e]), r = P.useSyncExternalStore(t, n), i = P.useRef(null);
  P.useEffect(() => {
    const l = i.current;
    if (!l) return;
    const a = () => Jw(l, r.inheritTheme);
    return a(), r.inheritTheme ? eS(a) : void 0;
  }, [r.inheritTheme]);
  const s = r.activeReminderId != null ? r.reminders.find((l) => l.id === r.activeReminderId) ?? null : null, o = r.phase === "idle";
  return /* @__PURE__ */ V.jsxDEV("div", { className: "agent-code-timer", ref: i, children: [
    /* @__PURE__ */ V.jsxDEV(tS, {}, void 0, !1, {
      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
      lineNumber: 53,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ V.jsxDEV(lS, { remainingSeconds: r.remainingSeconds, phase: r.phase }, void 0, !1, {
      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
      lineNumber: 55,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ V.jsxDEV(Pl, { mode: "wait", children: o ? /* @__PURE__ */ V.jsxDEV(
      Qe.div,
      {
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.2 },
        style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: "100%" },
        children: [
          /* @__PURE__ */ V.jsxDEV(
            iS,
            {
              totalSeconds: r.totalSeconds,
              onSelect: (l) => e.setDuration(l),
              onStart: () => e.start()
            },
            void 0,
            !1,
            {
              fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
              lineNumber: 65,
              columnNumber: 13
            },
            this
          ),
          /* @__PURE__ */ V.jsxDEV(
            oS,
            {
              reminders: r.reminders,
              onAdd: (l, a) => e.addReminder(l, a),
              onRemove: (l) => e.removeReminder(l)
            },
            void 0,
            !1,
            {
              fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
              lineNumber: 70,
              columnNumber: 13
            },
            this
          )
        ]
      },
      "setup",
      !0,
      {
        fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
        lineNumber: 59,
        columnNumber: 11
      },
      this
    ) : /* @__PURE__ */ V.jsxDEV(
      Qe.div,
      {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.25 },
        style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
        children: [
          /* @__PURE__ */ V.jsxDEV("div", { className: "tm-row", children: [
            r.phase === "running" ? /* @__PURE__ */ V.jsxDEV(
              "button",
              {
                type: "button",
                className: "tm-circle",
                onClick: () => e.pause(),
                title: "Pause",
                children: /* @__PURE__ */ V.jsxDEV(bw, { size: 17 }, void 0, !1, {
                  fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
                  lineNumber: 92,
                  columnNumber: 19
                }, this)
              },
              void 0,
              !1,
              {
                fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
                lineNumber: 86,
                columnNumber: 17
              },
              this
            ) : null,
            r.phase === "paused" ? /* @__PURE__ */ V.jsxDEV(
              "button",
              {
                type: "button",
                className: "tm-circle",
                onClick: () => e.resume(),
                title: "Resume",
                children: /* @__PURE__ */ V.jsxDEV(Gw, { size: 17, style: { marginLeft: 2 } }, void 0, !1, {
                  fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
                  lineNumber: 102,
                  columnNumber: 19
                }, this)
              },
              void 0,
              !1,
              {
                fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
                lineNumber: 96,
                columnNumber: 17
              },
              this
            ) : null,
            /* @__PURE__ */ V.jsxDEV("button", { type: "button", className: "tm-circle", onClick: () => e.reset(), title: "Reset", children: /* @__PURE__ */ V.jsxDEV(Yw, { size: 17 }, void 0, !1, {
              fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
              lineNumber: 106,
              columnNumber: 17
            }, this) }, void 0, !1, {
              fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
              lineNumber: 105,
              columnNumber: 15
            }, this)
          ] }, void 0, !0, {
            fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
            lineNumber: 84,
            columnNumber: 13
          }, this),
          r.phase === "finished" ? /* @__PURE__ */ V.jsxDEV(
            Qe.span,
            {
              className: "tm-reminder-sub",
              initial: { opacity: 0 },
              animate: { opacity: 1 },
              children: "Session complete"
            },
            void 0,
            !1,
            {
              fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
              lineNumber: 111,
              columnNumber: 15
            },
            this
          ) : null,
          r.reminders.length > 0 && r.phase !== "finished" ? /* @__PURE__ */ V.jsxDEV("div", { className: "tm-presets", style: { marginTop: 2 }, children: r.reminders.map((l) => /* @__PURE__ */ V.jsxDEV("span", { className: "tm-chip", children: [
            l.label,
            " · ",
            l.intervalMinutes,
            "m"
          ] }, l.id, !0, {
            fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
            lineNumber: 123,
            columnNumber: 19
          }, this)) }, void 0, !1, {
            fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
            lineNumber: 121,
            columnNumber: 15
          }, this) : null
        ]
      },
      "running",
      !0,
      {
        fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
        lineNumber: 77,
        columnNumber: 11
      },
      this
    ) }, void 0, !1, {
      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
      lineNumber: 57,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ V.jsxDEV("div", { className: "tm-footer", children: /* @__PURE__ */ V.jsxDEV(
      "button",
      {
        type: "button",
        className: "tm-toggle",
        "data-on": r.inheritTheme,
        onClick: () => e.setInheritTheme(!r.inheritTheme),
        title: r.inheritTheme ? "Using Agent Code theme — click for black & white" : "Using black & white — click to inherit Agent Code theme",
        children: [
          /* @__PURE__ */ V.jsxDEV("span", { className: "tm-toggle-dot" }, void 0, !1, {
            fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
            lineNumber: 145,
            columnNumber: 11
          }, this),
          r.inheritTheme ? "Inheriting theme" : "Black & white"
        ]
      },
      void 0,
      !0,
      {
        fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
        lineNumber: 134,
        columnNumber: 9
      },
      this
    ) }, void 0, !1, {
      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
      lineNumber: 133,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ V.jsxDEV(Pl, { children: s ? /* @__PURE__ */ V.jsxDEV(sS, { reminder: s, onDismiss: () => e.dismissReminder() }, void 0, !1, {
      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
      lineNumber: 152,
      columnNumber: 11
    }, this) : null }, void 0, !1, {
      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
      lineNumber: 150,
      columnNumber: 7
    }, this)
  ] }, void 0, !0, {
    fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/TimerView.tsx",
    lineNumber: 52,
    columnNumber: 5
  }, this);
}
function uS(e) {
  return (t) => {
    Bm();
    const n = tp(t);
    return n.render(/* @__PURE__ */ V.jsxDEV(aS, { engine: e }, void 0, !1, {
      fileName: "/Users/juliusolsson/Desktop/Development/agent-code-timer/src/view/mount.tsx",
      lineNumber: 26,
      columnNumber: 17
    }, this)), () => {
      queueMicrotask(() => n.unmount());
    };
  };
}
const Wf = "session";
let rt = null;
const { activate: fS, deactivate: dS } = {
  async activate(e) {
    const { api: t } = e;
    rt = new zm({
      // Fire-and-forget with an explicit catch: a failed toast must never interrupt
      // the tick that produced it, and an unhandled rejection in a 250ms interval
      // would flood the console.
      notify: (n) => {
        t.ui.showToast(n).catch(() => {
        });
      },
      save: (n) => {
        t.storage.set(Wf, n).catch(() => {
        });
      }
    }), e.subscriptions.push(
      e.registerView("timer.main", uS(rt)),
      // `timer.open` has no handler — opening a declared view is the host's job.
      e.registerCommand("timer.start", () => rt?.start()),
      e.registerCommand("timer.pause", () => rt?.pause()),
      e.registerCommand("timer.reset", () => rt?.reset()),
      { dispose: () => rt?.dispose() }
    );
    try {
      const n = await t.storage.get(Wf);
      rt.restore(n);
    } catch {
    }
  },
  deactivate() {
    rt?.dispose(), rt = null, $m();
  }
};
export {
  fS as activate,
  dS as deactivate
};
