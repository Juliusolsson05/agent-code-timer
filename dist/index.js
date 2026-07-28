const Vm = [880, 1046, 1174], Lm = 20, Nm = 2;
class _m {
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
      for (let i = 0; i < Lm; i += 1) {
        const s = r + i * Nm;
        Vm.forEach((o, l) => n(s + l * 0.35, o));
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
const jm = 250;
class Fm {
  constructor(t) {
    this.host = t;
  }
  listeners = /* @__PURE__ */ new Set();
  interval = null;
  chime = new _m();
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
    this.stopTicking(), this.interval = setInterval(() => this.tick(), jm);
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
const Im = '.agent-code-timer{--tm-bg: #000000;--tm-surface: #0d0d0d;--tm-fg: #ffffff;--tm-dim: #8a8a8a;--tm-faint: #4a4a4a;--tm-border: #262626;--tm-accent: #ffffff;--tm-accent-fg: #000000;--tm-radius: 14px;--tm-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;--tm-font-digit: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;position:relative;display:flex;flex-direction:column;align-items:center;gap:28px;padding:34px 32px 30px;background:var(--tm-bg);color:var(--tm-fg);font-family:var(--tm-font);margin:-1px;border-radius:inherit}.agent-code-timer *,.agent-code-timer *:before,.agent-code-timer *:after{box-sizing:border-box}.agent-code-timer button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;padding:0;outline:none}.agent-code-timer input{font-family:inherit;outline:none}.tm-clock{position:absolute;top:14px;left:18px;font-size:15px;font-weight:300;letter-spacing:-.01em;color:var(--tm-dim);transition:opacity .35s ease;user-select:none}.tm-clock[data-dimmed=true]{opacity:.15}.tm-digits{font-family:var(--tm-font-digit);font-size:72px;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em;user-select:none;transition:color .5s ease}.tm-digits[data-state=idle]{color:var(--tm-dim)}.tm-digits[data-state=finished]{color:var(--tm-faint)}.tm-label{font-size:11px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:var(--tm-dim)}.tm-presets{display:flex;flex-wrap:wrap;justify-content:center;gap:7px}.tm-preset{border-radius:999px;padding:7px 15px;font-size:13px;font-weight:500;background:var(--tm-surface);color:var(--tm-dim);border:1px solid var(--tm-border);transition:all .18s ease}.tm-preset:hover{color:var(--tm-fg)}.tm-preset[data-selected=true]{background:var(--tm-accent);color:var(--tm-accent-fg);border-color:var(--tm-accent)}.tm-custom{width:108px;border-radius:10px;border:1px solid var(--tm-border);background:var(--tm-surface);color:var(--tm-fg);padding:8px 12px;text-align:center;font-size:13px}.tm-custom::placeholder{color:var(--tm-faint)}.tm-row{display:flex;align-items:center;gap:10px}.tm-primary{border-radius:999px;padding:11px 34px;font-size:14px;font-weight:500;background:var(--tm-accent);color:var(--tm-accent-fg);transition:opacity .18s ease,transform .12s ease}.tm-primary:hover{opacity:.88}.tm-primary:active{transform:scale(.97)}.tm-circle{width:46px;height:46px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:var(--tm-surface);border:1px solid var(--tm-border);color:var(--tm-fg);transition:background .18s ease,transform .12s ease}.tm-circle:hover{background:var(--tm-border)}.tm-circle:active{transform:scale(.95)}.tm-ghost{font-size:12px;color:var(--tm-dim);transition:color .18s ease}.tm-ghost:hover{color:var(--tm-fg)}.tm-reminders{width:100%;max-width:330px}.tm-reminders-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.tm-reminder{display:flex;align-items:center;justify-content:space-between;padding:10px 13px;border-radius:var(--tm-radius);background:var(--tm-surface);border:1px solid var(--tm-border);margin-bottom:6px}.tm-reminder-label{font-size:13px;color:var(--tm-fg)}.tm-reminder-sub{font-size:11px;color:var(--tm-dim)}.tm-add{display:flex;flex-direction:column;gap:8px;padding:13px;border-radius:var(--tm-radius);background:var(--tm-surface);border:1px solid var(--tm-border);margin-bottom:8px}.tm-add input{border-radius:9px;border:1px solid var(--tm-border);background:var(--tm-bg);color:var(--tm-fg);padding:7px 10px;font-size:13px}.tm-chip{font-size:11px;color:var(--tm-dim);background:var(--tm-surface);border:1px solid var(--tm-border);border-radius:999px;padding:4px 11px}.tm-alert{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--tm-bg) 88%,transparent);backdrop-filter:blur(6px);border-radius:inherit}.tm-alert-card{display:flex;flex-direction:column;align-items:center;gap:18px;padding:32px 36px;border-radius:22px;background:var(--tm-surface);border:1px solid var(--tm-border);max-width:300px;text-align:center}.tm-alert-icon{width:56px;height:56px;border-radius:999px;background:var(--tm-accent);color:var(--tm-accent-fg);display:flex;align-items:center;justify-content:center;font-size:26px}.tm-footer{display:flex;align-items:center;justify-content:center;gap:8px;padding-top:2px}.tm-toggle{display:inline-flex;align-items:center;gap:7px;font-size:11px;color:var(--tm-faint);transition:color .18s ease}.tm-toggle:hover{color:var(--tm-dim)}.tm-toggle-dot{width:7px;height:7px;border-radius:999px;border:1px solid currentColor}.tm-toggle[data-on=true] .tm-toggle-dot{background:currentColor}', Vo = "agent-code-timer-styles";
function Om() {
  if (document.getElementById(Vo)) return;
  const e = document.createElement("style");
  e.id = Vo, e.textContent = Im, document.head.append(e);
}
function zm() {
  document.getElementById(Vo)?.remove();
}
var $f = { exports: {} }, ks = {}, Wf = { exports: {} }, j = {};
/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var qr = Symbol.for("react.element"), Bm = Symbol.for("react.portal"), Um = Symbol.for("react.fragment"), $m = Symbol.for("react.strict_mode"), Wm = Symbol.for("react.profiler"), Km = Symbol.for("react.provider"), Hm = Symbol.for("react.context"), Gm = Symbol.for("react.forward_ref"), Qm = Symbol.for("react.suspense"), Ym = Symbol.for("react.memo"), Xm = Symbol.for("react.lazy"), gu = Symbol.iterator;
function Zm(e) {
  return e === null || typeof e != "object" ? null : (e = gu && e[gu] || e["@@iterator"], typeof e == "function" ? e : null);
}
var Kf = { isMounted: function() {
  return !1;
}, enqueueForceUpdate: function() {
}, enqueueReplaceState: function() {
}, enqueueSetState: function() {
} }, Hf = Object.assign, Gf = {};
function Gn(e, t, n) {
  this.props = e, this.context = t, this.refs = Gf, this.updater = n || Kf;
}
Gn.prototype.isReactComponent = {};
Gn.prototype.setState = function(e, t) {
  if (typeof e != "object" && typeof e != "function" && e != null) throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
  this.updater.enqueueSetState(this, e, t, "setState");
};
Gn.prototype.forceUpdate = function(e) {
  this.updater.enqueueForceUpdate(this, e, "forceUpdate");
};
function Qf() {
}
Qf.prototype = Gn.prototype;
function Ul(e, t, n) {
  this.props = e, this.context = t, this.refs = Gf, this.updater = n || Kf;
}
var $l = Ul.prototype = new Qf();
$l.constructor = Ul;
Hf($l, Gn.prototype);
$l.isPureReactComponent = !0;
var yu = Array.isArray, Yf = Object.prototype.hasOwnProperty, Wl = { current: null }, Xf = { key: !0, ref: !0, __self: !0, __source: !0 };
function Zf(e, t, n) {
  var r, i = {}, s = null, o = null;
  if (t != null) for (r in t.ref !== void 0 && (o = t.ref), t.key !== void 0 && (s = "" + t.key), t) Yf.call(t, r) && !Xf.hasOwnProperty(r) && (i[r] = t[r]);
  var l = arguments.length - 2;
  if (l === 1) i.children = n;
  else if (1 < l) {
    for (var a = Array(l), u = 0; u < l; u++) a[u] = arguments[u + 2];
    i.children = a;
  }
  if (e && e.defaultProps) for (r in l = e.defaultProps, l) i[r] === void 0 && (i[r] = l[r]);
  return { $$typeof: qr, type: e, key: s, ref: o, props: i, _owner: Wl.current };
}
function qm(e, t) {
  return { $$typeof: qr, type: e.type, key: t, ref: e.ref, props: e.props, _owner: e._owner };
}
function Kl(e) {
  return typeof e == "object" && e !== null && e.$$typeof === qr;
}
function Jm(e) {
  var t = { "=": "=0", ":": "=2" };
  return "$" + e.replace(/[=:]/g, function(n) {
    return t[n];
  });
}
var vu = /\/+/g;
function Hs(e, t) {
  return typeof e == "object" && e !== null && e.key != null ? Jm("" + e.key) : t.toString(36);
}
function Mi(e, t, n, r, i) {
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
        case Bm:
          o = !0;
      }
  }
  if (o) return o = e, i = i(o), e = r === "" ? "." + Hs(o, 0) : r, yu(i) ? (n = "", e != null && (n = e.replace(vu, "$&/") + "/"), Mi(i, t, n, "", function(u) {
    return u;
  })) : i != null && (Kl(i) && (i = qm(i, n + (!i.key || o && o.key === i.key ? "" : ("" + i.key).replace(vu, "$&/") + "/") + e)), t.push(i)), 1;
  if (o = 0, r = r === "" ? "." : r + ":", yu(e)) for (var l = 0; l < e.length; l++) {
    s = e[l];
    var a = r + Hs(s, l);
    o += Mi(s, t, n, a, i);
  }
  else if (a = Zm(e), typeof a == "function") for (e = a.call(e), l = 0; !(s = e.next()).done; ) s = s.value, a = r + Hs(s, l++), o += Mi(s, t, n, a, i);
  else if (s === "object") throw t = String(e), Error("Objects are not valid as a React child (found: " + (t === "[object Object]" ? "object with keys {" + Object.keys(e).join(", ") + "}" : t) + "). If you meant to render a collection of children, use an array instead.");
  return o;
}
function ui(e, t, n) {
  if (e == null) return e;
  var r = [], i = 0;
  return Mi(e, r, "", "", function(s) {
    return t.call(n, s, i++);
  }), r;
}
function bm(e) {
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
var ve = { current: null }, Vi = { transition: null }, eg = { ReactCurrentDispatcher: ve, ReactCurrentBatchConfig: Vi, ReactCurrentOwner: Wl };
function qf() {
  throw Error("act(...) is not supported in production builds of React.");
}
j.Children = { map: ui, forEach: function(e, t, n) {
  ui(e, function() {
    t.apply(this, arguments);
  }, n);
}, count: function(e) {
  var t = 0;
  return ui(e, function() {
    t++;
  }), t;
}, toArray: function(e) {
  return ui(e, function(t) {
    return t;
  }) || [];
}, only: function(e) {
  if (!Kl(e)) throw Error("React.Children.only expected to receive a single React element child.");
  return e;
} };
j.Component = Gn;
j.Fragment = Um;
j.Profiler = Wm;
j.PureComponent = Ul;
j.StrictMode = $m;
j.Suspense = Qm;
j.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = eg;
j.act = qf;
j.cloneElement = function(e, t, n) {
  if (e == null) throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + e + ".");
  var r = Hf({}, e.props), i = e.key, s = e.ref, o = e._owner;
  if (t != null) {
    if (t.ref !== void 0 && (s = t.ref, o = Wl.current), t.key !== void 0 && (i = "" + t.key), e.type && e.type.defaultProps) var l = e.type.defaultProps;
    for (a in t) Yf.call(t, a) && !Xf.hasOwnProperty(a) && (r[a] = t[a] === void 0 && l !== void 0 ? l[a] : t[a]);
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
j.createContext = function(e) {
  return e = { $$typeof: Hm, _currentValue: e, _currentValue2: e, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null }, e.Provider = { $$typeof: Km, _context: e }, e.Consumer = e;
};
j.createElement = Zf;
j.createFactory = function(e) {
  var t = Zf.bind(null, e);
  return t.type = e, t;
};
j.createRef = function() {
  return { current: null };
};
j.forwardRef = function(e) {
  return { $$typeof: Gm, render: e };
};
j.isValidElement = Kl;
j.lazy = function(e) {
  return { $$typeof: Xm, _payload: { _status: -1, _result: e }, _init: bm };
};
j.memo = function(e, t) {
  return { $$typeof: Ym, type: e, compare: t === void 0 ? null : t };
};
j.startTransition = function(e) {
  var t = Vi.transition;
  Vi.transition = {};
  try {
    e();
  } finally {
    Vi.transition = t;
  }
};
j.unstable_act = qf;
j.useCallback = function(e, t) {
  return ve.current.useCallback(e, t);
};
j.useContext = function(e) {
  return ve.current.useContext(e);
};
j.useDebugValue = function() {
};
j.useDeferredValue = function(e) {
  return ve.current.useDeferredValue(e);
};
j.useEffect = function(e, t) {
  return ve.current.useEffect(e, t);
};
j.useId = function() {
  return ve.current.useId();
};
j.useImperativeHandle = function(e, t, n) {
  return ve.current.useImperativeHandle(e, t, n);
};
j.useInsertionEffect = function(e, t) {
  return ve.current.useInsertionEffect(e, t);
};
j.useLayoutEffect = function(e, t) {
  return ve.current.useLayoutEffect(e, t);
};
j.useMemo = function(e, t) {
  return ve.current.useMemo(e, t);
};
j.useReducer = function(e, t, n) {
  return ve.current.useReducer(e, t, n);
};
j.useRef = function(e) {
  return ve.current.useRef(e);
};
j.useState = function(e) {
  return ve.current.useState(e);
};
j.useSyncExternalStore = function(e, t, n) {
  return ve.current.useSyncExternalStore(e, t, n);
};
j.useTransition = function() {
  return ve.current.useTransition();
};
j.version = "18.3.1";
Wf.exports = j;
var C = Wf.exports;
/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var tg = C, ng = Symbol.for("react.element"), rg = Symbol.for("react.fragment"), ig = Object.prototype.hasOwnProperty, sg = tg.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, og = { key: !0, ref: !0, __self: !0, __source: !0 };
function Jf(e, t, n) {
  var r, i = {}, s = null, o = null;
  n !== void 0 && (s = "" + n), t.key !== void 0 && (s = "" + t.key), t.ref !== void 0 && (o = t.ref);
  for (r in t) ig.call(t, r) && !og.hasOwnProperty(r) && (i[r] = t[r]);
  if (e && e.defaultProps) for (r in t = e.defaultProps, t) i[r] === void 0 && (i[r] = t[r]);
  return { $$typeof: ng, type: e, key: s, ref: o, props: i, _owner: sg.current };
}
ks.Fragment = rg;
ks.jsx = Jf;
ks.jsxs = Jf;
$f.exports = ks;
var R = $f.exports, bf = { exports: {} }, Ve = {}, ed = { exports: {} }, td = {};
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
  function t(A, L) {
    var N = A.length;
    A.push(L);
    e: for (; 0 < N; ) {
      var X = N - 1 >>> 1, re = A[X];
      if (0 < i(re, L)) A[X] = L, A[N] = re, N = X;
      else break e;
    }
  }
  function n(A) {
    return A.length === 0 ? null : A[0];
  }
  function r(A) {
    if (A.length === 0) return null;
    var L = A[0], N = A.pop();
    if (N !== L) {
      A[0] = N;
      e: for (var X = 0, re = A.length, li = re >>> 1; X < li; ) {
        var Wt = 2 * (X + 1) - 1, Ks = A[Wt], Kt = Wt + 1, ai = A[Kt];
        if (0 > i(Ks, N)) Kt < re && 0 > i(ai, Ks) ? (A[X] = ai, A[Kt] = N, X = Kt) : (A[X] = Ks, A[Wt] = N, X = Wt);
        else if (Kt < re && 0 > i(ai, N)) A[X] = ai, A[Kt] = N, X = Kt;
        else break e;
      }
    }
    return L;
  }
  function i(A, L) {
    var N = A.sortIndex - L.sortIndex;
    return N !== 0 ? N : A.id - L.id;
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
  var a = [], u = [], c = 1, f = null, d = 3, g = !1, y = !1, v = !1, S = typeof setTimeout == "function" ? setTimeout : null, p = typeof clearTimeout == "function" ? clearTimeout : null, h = typeof setImmediate < "u" ? setImmediate : null;
  typeof navigator < "u" && navigator.scheduling !== void 0 && navigator.scheduling.isInputPending !== void 0 && navigator.scheduling.isInputPending.bind(navigator.scheduling);
  function m(A) {
    for (var L = n(u); L !== null; ) {
      if (L.callback === null) r(u);
      else if (L.startTime <= A) r(u), L.sortIndex = L.expirationTime, t(a, L);
      else break;
      L = n(u);
    }
  }
  function x(A) {
    if (v = !1, m(A), !y) if (n(a) !== null) y = !0, oi(w);
    else {
      var L = n(u);
      L !== null && b(x, L.startTime - A);
    }
  }
  function w(A, L) {
    y = !1, v && (v = !1, p(k), k = -1), g = !0;
    var N = d;
    try {
      for (m(L), f = n(a); f !== null && (!(f.expirationTime > L) || A && !ne()); ) {
        var X = f.callback;
        if (typeof X == "function") {
          f.callback = null, d = f.priorityLevel;
          var re = X(f.expirationTime <= L);
          L = e.unstable_now(), typeof re == "function" ? f.callback = re : f === n(a) && r(a), m(L);
        } else r(a);
        f = n(a);
      }
      if (f !== null) var li = !0;
      else {
        var Wt = n(u);
        Wt !== null && b(x, Wt.startTime - L), li = !1;
      }
      return li;
    } finally {
      f = null, d = N, g = !1;
    }
  }
  var P = !1, E = null, k = -1, _ = 5, V = -1;
  function ne() {
    return !(e.unstable_now() - V < _);
  }
  function yt() {
    if (E !== null) {
      var A = e.unstable_now();
      V = A;
      var L = !0;
      try {
        L = E(!0, A);
      } finally {
        L ? $t() : (P = !1, E = null);
      }
    } else P = !1;
  }
  var $t;
  if (typeof h == "function") $t = function() {
    h(yt);
  };
  else if (typeof MessageChannel < "u") {
    var Jn = new MessageChannel(), mu = Jn.port2;
    Jn.port1.onmessage = yt, $t = function() {
      mu.postMessage(null);
    };
  } else $t = function() {
    S(yt, 0);
  };
  function oi(A) {
    E = A, P || (P = !0, $t());
  }
  function b(A, L) {
    k = S(function() {
      A(e.unstable_now());
    }, L);
  }
  e.unstable_IdlePriority = 5, e.unstable_ImmediatePriority = 1, e.unstable_LowPriority = 4, e.unstable_NormalPriority = 3, e.unstable_Profiling = null, e.unstable_UserBlockingPriority = 2, e.unstable_cancelCallback = function(A) {
    A.callback = null;
  }, e.unstable_continueExecution = function() {
    y || g || (y = !0, oi(w));
  }, e.unstable_forceFrameRate = function(A) {
    0 > A || 125 < A ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : _ = 0 < A ? Math.floor(1e3 / A) : 5;
  }, e.unstable_getCurrentPriorityLevel = function() {
    return d;
  }, e.unstable_getFirstCallbackNode = function() {
    return n(a);
  }, e.unstable_next = function(A) {
    switch (d) {
      case 1:
      case 2:
      case 3:
        var L = 3;
        break;
      default:
        L = d;
    }
    var N = d;
    d = L;
    try {
      return A();
    } finally {
      d = N;
    }
  }, e.unstable_pauseExecution = function() {
  }, e.unstable_requestPaint = function() {
  }, e.unstable_runWithPriority = function(A, L) {
    switch (A) {
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
        break;
      default:
        A = 3;
    }
    var N = d;
    d = A;
    try {
      return L();
    } finally {
      d = N;
    }
  }, e.unstable_scheduleCallback = function(A, L, N) {
    var X = e.unstable_now();
    switch (typeof N == "object" && N !== null ? (N = N.delay, N = typeof N == "number" && 0 < N ? X + N : X) : N = X, A) {
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
    return re = N + re, A = { id: c++, callback: L, priorityLevel: A, startTime: N, expirationTime: re, sortIndex: -1 }, N > X ? (A.sortIndex = N, t(u, A), n(a) === null && A === n(u) && (v ? (p(k), k = -1) : v = !0, b(x, N - X))) : (A.sortIndex = re, t(a, A), y || g || (y = !0, oi(w))), A;
  }, e.unstable_shouldYield = ne, e.unstable_wrapCallback = function(A) {
    var L = d;
    return function() {
      var N = d;
      d = L;
      try {
        return A.apply(this, arguments);
      } finally {
        d = N;
      }
    };
  };
})(td);
ed.exports = td;
var lg = ed.exports;
/**
 * @license React
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var ag = C, De = lg;
function T(e) {
  for (var t = "https://reactjs.org/docs/error-decoder.html?invariant=" + e, n = 1; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
  return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
}
var nd = /* @__PURE__ */ new Set(), Dr = {};
function un(e, t) {
  Fn(e, t), Fn(e + "Capture", t);
}
function Fn(e, t) {
  for (Dr[e] = t, e = 0; e < t.length; e++) nd.add(t[e]);
}
var ft = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), Lo = Object.prototype.hasOwnProperty, ug = /^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/, xu = {}, wu = {};
function cg(e) {
  return Lo.call(wu, e) ? !0 : Lo.call(xu, e) ? !1 : ug.test(e) ? wu[e] = !0 : (xu[e] = !0, !1);
}
function fg(e, t, n, r) {
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
function dg(e, t, n, r) {
  if (t === null || typeof t > "u" || fg(e, t, n, r)) return !0;
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
var Hl = /[\-:]([a-z])/g;
function Gl(e) {
  return e[1].toUpperCase();
}
"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e) {
  var t = e.replace(
    Hl,
    Gl
  );
  ue[t] = new xe(t, 1, !1, e, null, !1, !1);
});
"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e) {
  var t = e.replace(Hl, Gl);
  ue[t] = new xe(t, 1, !1, e, "http://www.w3.org/1999/xlink", !1, !1);
});
["xml:base", "xml:lang", "xml:space"].forEach(function(e) {
  var t = e.replace(Hl, Gl);
  ue[t] = new xe(t, 1, !1, e, "http://www.w3.org/XML/1998/namespace", !1, !1);
});
["tabIndex", "crossOrigin"].forEach(function(e) {
  ue[e] = new xe(e, 1, !1, e.toLowerCase(), null, !1, !1);
});
ue.xlinkHref = new xe("xlinkHref", 1, !1, "xlink:href", "http://www.w3.org/1999/xlink", !0, !1);
["src", "href", "action", "formAction"].forEach(function(e) {
  ue[e] = new xe(e, 1, !1, e.toLowerCase(), null, !0, !0);
});
function Ql(e, t, n, r) {
  var i = ue.hasOwnProperty(t) ? ue[t] : null;
  (i !== null ? i.type !== 0 : r || !(2 < t.length) || t[0] !== "o" && t[0] !== "O" || t[1] !== "n" && t[1] !== "N") && (dg(t, n, i, r) && (n = null), r || i === null ? cg(t) && (n === null ? e.removeAttribute(t) : e.setAttribute(t, "" + n)) : i.mustUseProperty ? e[i.propertyName] = n === null ? i.type === 3 ? !1 : "" : n : (t = i.attributeName, r = i.attributeNamespace, n === null ? e.removeAttribute(t) : (i = i.type, n = i === 3 || i === 4 && n === !0 ? "" : "" + n, r ? e.setAttributeNS(r, t, n) : e.setAttribute(t, n))));
}
var gt = ag.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED, ci = Symbol.for("react.element"), hn = Symbol.for("react.portal"), pn = Symbol.for("react.fragment"), Yl = Symbol.for("react.strict_mode"), No = Symbol.for("react.profiler"), rd = Symbol.for("react.provider"), id = Symbol.for("react.context"), Xl = Symbol.for("react.forward_ref"), _o = Symbol.for("react.suspense"), jo = Symbol.for("react.suspense_list"), Zl = Symbol.for("react.memo"), wt = Symbol.for("react.lazy"), sd = Symbol.for("react.offscreen"), Su = Symbol.iterator;
function bn(e) {
  return e === null || typeof e != "object" ? null : (e = Su && e[Su] || e["@@iterator"], typeof e == "function" ? e : null);
}
var G = Object.assign, Gs;
function ur(e) {
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
  return (e = e ? e.displayName || e.name : "") ? ur(e) : "";
}
function hg(e) {
  switch (e.tag) {
    case 5:
      return ur(e.type);
    case 16:
      return ur("Lazy");
    case 13:
      return ur("Suspense");
    case 19:
      return ur("SuspenseList");
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
function Fo(e) {
  if (e == null) return null;
  if (typeof e == "function") return e.displayName || e.name || null;
  if (typeof e == "string") return e;
  switch (e) {
    case pn:
      return "Fragment";
    case hn:
      return "Portal";
    case No:
      return "Profiler";
    case Yl:
      return "StrictMode";
    case _o:
      return "Suspense";
    case jo:
      return "SuspenseList";
  }
  if (typeof e == "object") switch (e.$$typeof) {
    case id:
      return (e.displayName || "Context") + ".Consumer";
    case rd:
      return (e._context.displayName || "Context") + ".Provider";
    case Xl:
      var t = e.render;
      return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
    case Zl:
      return t = e.displayName || null, t !== null ? t : Fo(e.type) || "Memo";
    case wt:
      t = e._payload, e = e._init;
      try {
        return Fo(e(t));
      } catch {
      }
  }
  return null;
}
function pg(e) {
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
      return Fo(t);
    case 8:
      return t === Yl ? "StrictMode" : "Mode";
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
function od(e) {
  var t = e.type;
  return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
}
function mg(e) {
  var t = od(e) ? "checked" : "value", n = Object.getOwnPropertyDescriptor(e.constructor.prototype, t), r = "" + e[t];
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
function fi(e) {
  e._valueTracker || (e._valueTracker = mg(e));
}
function ld(e) {
  if (!e) return !1;
  var t = e._valueTracker;
  if (!t) return !0;
  var n = t.getValue(), r = "";
  return e && (r = od(e) ? e.checked ? "true" : "false" : e.value), e = r, e !== n ? (t.setValue(e), !0) : !1;
}
function Hi(e) {
  if (e = e || (typeof document < "u" ? document : void 0), typeof e > "u") return null;
  try {
    return e.activeElement || e.body;
  } catch {
    return e.body;
  }
}
function Io(e, t) {
  var n = t.checked;
  return G({}, t, { defaultChecked: void 0, defaultValue: void 0, value: void 0, checked: n ?? e._wrapperState.initialChecked });
}
function ku(e, t) {
  var n = t.defaultValue == null ? "" : t.defaultValue, r = t.checked != null ? t.checked : t.defaultChecked;
  n = _t(t.value != null ? t.value : n), e._wrapperState = { initialChecked: r, initialValue: n, controlled: t.type === "checkbox" || t.type === "radio" ? t.checked != null : t.value != null };
}
function ad(e, t) {
  t = t.checked, t != null && Ql(e, "checked", t, !1);
}
function Oo(e, t) {
  ad(e, t);
  var n = _t(t.value), r = t.type;
  if (n != null) r === "number" ? (n === 0 && e.value === "" || e.value != n) && (e.value = "" + n) : e.value !== "" + n && (e.value = "" + n);
  else if (r === "submit" || r === "reset") {
    e.removeAttribute("value");
    return;
  }
  t.hasOwnProperty("value") ? zo(e, t.type, n) : t.hasOwnProperty("defaultValue") && zo(e, t.type, _t(t.defaultValue)), t.checked == null && t.defaultChecked != null && (e.defaultChecked = !!t.defaultChecked);
}
function Tu(e, t, n) {
  if (t.hasOwnProperty("value") || t.hasOwnProperty("defaultValue")) {
    var r = t.type;
    if (!(r !== "submit" && r !== "reset" || t.value !== void 0 && t.value !== null)) return;
    t = "" + e._wrapperState.initialValue, n || t === e.value || (e.value = t), e.defaultValue = t;
  }
  n = e.name, n !== "" && (e.name = ""), e.defaultChecked = !!e._wrapperState.initialChecked, n !== "" && (e.name = n);
}
function zo(e, t, n) {
  (t !== "number" || Hi(e.ownerDocument) !== e) && (n == null ? e.defaultValue = "" + e._wrapperState.initialValue : e.defaultValue !== "" + n && (e.defaultValue = "" + n));
}
var cr = Array.isArray;
function Mn(e, t, n, r) {
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
  return G({}, t, { value: void 0, defaultValue: void 0, children: "" + e._wrapperState.initialValue });
}
function Pu(e, t) {
  var n = t.value;
  if (n == null) {
    if (n = t.children, t = t.defaultValue, n != null) {
      if (t != null) throw Error(T(92));
      if (cr(n)) {
        if (1 < n.length) throw Error(T(93));
        n = n[0];
      }
      t = n;
    }
    t == null && (t = ""), n = t;
  }
  e._wrapperState = { initialValue: _t(n) };
}
function ud(e, t) {
  var n = _t(t.value), r = _t(t.defaultValue);
  n != null && (n = "" + n, n !== e.value && (e.value = n), t.defaultValue == null && e.defaultValue !== n && (e.defaultValue = n)), r != null && (e.defaultValue = "" + r);
}
function Cu(e) {
  var t = e.textContent;
  t === e._wrapperState.initialValue && t !== "" && t !== null && (e.value = t);
}
function cd(e) {
  switch (e) {
    case "svg":
      return "http://www.w3.org/2000/svg";
    case "math":
      return "http://www.w3.org/1998/Math/MathML";
    default:
      return "http://www.w3.org/1999/xhtml";
  }
}
function Uo(e, t) {
  return e == null || e === "http://www.w3.org/1999/xhtml" ? cd(t) : e === "http://www.w3.org/2000/svg" && t === "foreignObject" ? "http://www.w3.org/1999/xhtml" : e;
}
var di, fd = function(e) {
  return typeof MSApp < "u" && MSApp.execUnsafeLocalFunction ? function(t, n, r, i) {
    MSApp.execUnsafeLocalFunction(function() {
      return e(t, n, r, i);
    });
  } : e;
}(function(e, t) {
  if (e.namespaceURI !== "http://www.w3.org/2000/svg" || "innerHTML" in e) e.innerHTML = t;
  else {
    for (di = di || document.createElement("div"), di.innerHTML = "<svg>" + t.valueOf().toString() + "</svg>", t = di.firstChild; e.firstChild; ) e.removeChild(e.firstChild);
    for (; t.firstChild; ) e.appendChild(t.firstChild);
  }
});
function Mr(e, t) {
  if (t) {
    var n = e.firstChild;
    if (n && n === e.lastChild && n.nodeType === 3) {
      n.nodeValue = t;
      return;
    }
  }
  e.textContent = t;
}
var gr = {
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
}, gg = ["Webkit", "ms", "Moz", "O"];
Object.keys(gr).forEach(function(e) {
  gg.forEach(function(t) {
    t = t + e.charAt(0).toUpperCase() + e.substring(1), gr[t] = gr[e];
  });
});
function dd(e, t, n) {
  return t == null || typeof t == "boolean" || t === "" ? "" : n || typeof t != "number" || t === 0 || gr.hasOwnProperty(e) && gr[e] ? ("" + t).trim() : t + "px";
}
function hd(e, t) {
  e = e.style;
  for (var n in t) if (t.hasOwnProperty(n)) {
    var r = n.indexOf("--") === 0, i = dd(n, t[n], r);
    n === "float" && (n = "cssFloat"), r ? e.setProperty(n, i) : e[n] = i;
  }
}
var yg = G({ menuitem: !0 }, { area: !0, base: !0, br: !0, col: !0, embed: !0, hr: !0, img: !0, input: !0, keygen: !0, link: !0, meta: !0, param: !0, source: !0, track: !0, wbr: !0 });
function $o(e, t) {
  if (t) {
    if (yg[e] && (t.children != null || t.dangerouslySetInnerHTML != null)) throw Error(T(137, e));
    if (t.dangerouslySetInnerHTML != null) {
      if (t.children != null) throw Error(T(60));
      if (typeof t.dangerouslySetInnerHTML != "object" || !("__html" in t.dangerouslySetInnerHTML)) throw Error(T(61));
    }
    if (t.style != null && typeof t.style != "object") throw Error(T(62));
  }
}
function Wo(e, t) {
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
var Ko = null;
function ql(e) {
  return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
}
var Ho = null, Vn = null, Ln = null;
function Eu(e) {
  if (e = ei(e)) {
    if (typeof Ho != "function") throw Error(T(280));
    var t = e.stateNode;
    t && (t = As(t), Ho(e.stateNode, e.type, t));
  }
}
function pd(e) {
  Vn ? Ln ? Ln.push(e) : Ln = [e] : Vn = e;
}
function md() {
  if (Vn) {
    var e = Vn, t = Ln;
    if (Ln = Vn = null, Eu(e), t) for (e = 0; e < t.length; e++) Eu(t[e]);
  }
}
function gd(e, t) {
  return e(t);
}
function yd() {
}
var Xs = !1;
function vd(e, t, n) {
  if (Xs) return e(t, n);
  Xs = !0;
  try {
    return gd(e, t, n);
  } finally {
    Xs = !1, (Vn !== null || Ln !== null) && (yd(), md());
  }
}
function Vr(e, t) {
  var n = e.stateNode;
  if (n === null) return null;
  var r = As(n);
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
if (ft) try {
  var er = {};
  Object.defineProperty(er, "passive", { get: function() {
    Go = !0;
  } }), window.addEventListener("test", er, er), window.removeEventListener("test", er, er);
} catch {
  Go = !1;
}
function vg(e, t, n, r, i, s, o, l, a) {
  var u = Array.prototype.slice.call(arguments, 3);
  try {
    t.apply(n, u);
  } catch (c) {
    this.onError(c);
  }
}
var yr = !1, Gi = null, Qi = !1, Qo = null, xg = { onError: function(e) {
  yr = !0, Gi = e;
} };
function wg(e, t, n, r, i, s, o, l, a) {
  yr = !1, Gi = null, vg.apply(xg, arguments);
}
function Sg(e, t, n, r, i, s, o, l, a) {
  if (wg.apply(this, arguments), yr) {
    if (yr) {
      var u = Gi;
      yr = !1, Gi = null;
    } else throw Error(T(198));
    Qi || (Qi = !0, Qo = u);
  }
}
function cn(e) {
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
function xd(e) {
  if (e.tag === 13) {
    var t = e.memoizedState;
    if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
  }
  return null;
}
function Au(e) {
  if (cn(e) !== e) throw Error(T(188));
}
function kg(e) {
  var t = e.alternate;
  if (!t) {
    if (t = cn(e), t === null) throw Error(T(188));
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
        if (s === n) return Au(i), e;
        if (s === r) return Au(i), t;
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
function wd(e) {
  return e = kg(e), e !== null ? Sd(e) : null;
}
function Sd(e) {
  if (e.tag === 5 || e.tag === 6) return e;
  for (e = e.child; e !== null; ) {
    var t = Sd(e);
    if (t !== null) return t;
    e = e.sibling;
  }
  return null;
}
var kd = De.unstable_scheduleCallback, Ru = De.unstable_cancelCallback, Tg = De.unstable_shouldYield, Pg = De.unstable_requestPaint, q = De.unstable_now, Cg = De.unstable_getCurrentPriorityLevel, Jl = De.unstable_ImmediatePriority, Td = De.unstable_UserBlockingPriority, Yi = De.unstable_NormalPriority, Eg = De.unstable_LowPriority, Pd = De.unstable_IdlePriority, Ts = null, be = null;
function Ag(e) {
  if (be && typeof be.onCommitFiberRoot == "function") try {
    be.onCommitFiberRoot(Ts, e, void 0, (e.current.flags & 128) === 128);
  } catch {
  }
}
var Ge = Math.clz32 ? Math.clz32 : Mg, Rg = Math.log, Dg = Math.LN2;
function Mg(e) {
  return e >>>= 0, e === 0 ? 32 : 31 - (Rg(e) / Dg | 0) | 0;
}
var hi = 64, pi = 4194304;
function fr(e) {
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
    l !== 0 ? r = fr(l) : (s &= o, s !== 0 && (r = fr(s)));
  } else o = n & ~i, o !== 0 ? r = fr(o) : s !== 0 && (r = fr(s));
  if (r === 0) return 0;
  if (t !== 0 && t !== r && !(t & i) && (i = r & -r, s = t & -t, i >= s || i === 16 && (s & 4194240) !== 0)) return t;
  if (r & 4 && (r |= n & 16), t = e.entangledLanes, t !== 0) for (e = e.entanglements, t &= r; 0 < t; ) n = 31 - Ge(t), i = 1 << n, r |= e[n], t &= ~i;
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
function Lg(e, t) {
  for (var n = e.suspendedLanes, r = e.pingedLanes, i = e.expirationTimes, s = e.pendingLanes; 0 < s; ) {
    var o = 31 - Ge(s), l = 1 << o, a = i[o];
    a === -1 ? (!(l & n) || l & r) && (i[o] = Vg(l, t)) : a <= t && (e.expiredLanes |= l), s &= ~l;
  }
}
function Yo(e) {
  return e = e.pendingLanes & -1073741825, e !== 0 ? e : e & 1073741824 ? 1073741824 : 0;
}
function Cd() {
  var e = hi;
  return hi <<= 1, !(hi & 4194240) && (hi = 64), e;
}
function Zs(e) {
  for (var t = [], n = 0; 31 > n; n++) t.push(e);
  return t;
}
function Jr(e, t, n) {
  e.pendingLanes |= t, t !== 536870912 && (e.suspendedLanes = 0, e.pingedLanes = 0), e = e.eventTimes, t = 31 - Ge(t), e[t] = n;
}
function Ng(e, t) {
  var n = e.pendingLanes & ~t;
  e.pendingLanes = t, e.suspendedLanes = 0, e.pingedLanes = 0, e.expiredLanes &= t, e.mutableReadLanes &= t, e.entangledLanes &= t, t = e.entanglements;
  var r = e.eventTimes;
  for (e = e.expirationTimes; 0 < n; ) {
    var i = 31 - Ge(n), s = 1 << i;
    t[i] = 0, r[i] = -1, e[i] = -1, n &= ~s;
  }
}
function bl(e, t) {
  var n = e.entangledLanes |= t;
  for (e = e.entanglements; n; ) {
    var r = 31 - Ge(n), i = 1 << r;
    i & t | e[r] & t && (e[r] |= t), n &= ~i;
  }
}
var I = 0;
function Ed(e) {
  return e &= -e, 1 < e ? 4 < e ? e & 268435455 ? 16 : 536870912 : 4 : 1;
}
var Ad, ea, Rd, Dd, Md, Xo = !1, mi = [], Et = null, At = null, Rt = null, Lr = /* @__PURE__ */ new Map(), Nr = /* @__PURE__ */ new Map(), kt = [], _g = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");
function Du(e, t) {
  switch (e) {
    case "focusin":
    case "focusout":
      Et = null;
      break;
    case "dragenter":
    case "dragleave":
      At = null;
      break;
    case "mouseover":
    case "mouseout":
      Rt = null;
      break;
    case "pointerover":
    case "pointerout":
      Lr.delete(t.pointerId);
      break;
    case "gotpointercapture":
    case "lostpointercapture":
      Nr.delete(t.pointerId);
  }
}
function tr(e, t, n, r, i, s) {
  return e === null || e.nativeEvent !== s ? (e = { blockedOn: t, domEventName: n, eventSystemFlags: r, nativeEvent: s, targetContainers: [i] }, t !== null && (t = ei(t), t !== null && ea(t)), e) : (e.eventSystemFlags |= r, t = e.targetContainers, i !== null && t.indexOf(i) === -1 && t.push(i), e);
}
function jg(e, t, n, r, i) {
  switch (t) {
    case "focusin":
      return Et = tr(Et, e, t, n, r, i), !0;
    case "dragenter":
      return At = tr(At, e, t, n, r, i), !0;
    case "mouseover":
      return Rt = tr(Rt, e, t, n, r, i), !0;
    case "pointerover":
      var s = i.pointerId;
      return Lr.set(s, tr(Lr.get(s) || null, e, t, n, r, i)), !0;
    case "gotpointercapture":
      return s = i.pointerId, Nr.set(s, tr(Nr.get(s) || null, e, t, n, r, i)), !0;
  }
  return !1;
}
function Vd(e) {
  var t = Zt(e.target);
  if (t !== null) {
    var n = cn(t);
    if (n !== null) {
      if (t = n.tag, t === 13) {
        if (t = xd(n), t !== null) {
          e.blockedOn = t, Md(e.priority, function() {
            Rd(n);
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
function Li(e) {
  if (e.blockedOn !== null) return !1;
  for (var t = e.targetContainers; 0 < t.length; ) {
    var n = Zo(e.domEventName, e.eventSystemFlags, t[0], e.nativeEvent);
    if (n === null) {
      n = e.nativeEvent;
      var r = new n.constructor(n.type, n);
      Ko = r, n.target.dispatchEvent(r), Ko = null;
    } else return t = ei(n), t !== null && ea(t), e.blockedOn = n, !1;
    t.shift();
  }
  return !0;
}
function Mu(e, t, n) {
  Li(e) && n.delete(t);
}
function Fg() {
  Xo = !1, Et !== null && Li(Et) && (Et = null), At !== null && Li(At) && (At = null), Rt !== null && Li(Rt) && (Rt = null), Lr.forEach(Mu), Nr.forEach(Mu);
}
function nr(e, t) {
  e.blockedOn === t && (e.blockedOn = null, Xo || (Xo = !0, De.unstable_scheduleCallback(De.unstable_NormalPriority, Fg)));
}
function _r(e) {
  function t(i) {
    return nr(i, e);
  }
  if (0 < mi.length) {
    nr(mi[0], e);
    for (var n = 1; n < mi.length; n++) {
      var r = mi[n];
      r.blockedOn === e && (r.blockedOn = null);
    }
  }
  for (Et !== null && nr(Et, e), At !== null && nr(At, e), Rt !== null && nr(Rt, e), Lr.forEach(t), Nr.forEach(t), n = 0; n < kt.length; n++) r = kt[n], r.blockedOn === e && (r.blockedOn = null);
  for (; 0 < kt.length && (n = kt[0], n.blockedOn === null); ) Vd(n), n.blockedOn === null && kt.shift();
}
var Nn = gt.ReactCurrentBatchConfig, Zi = !0;
function Ig(e, t, n, r) {
  var i = I, s = Nn.transition;
  Nn.transition = null;
  try {
    I = 1, ta(e, t, n, r);
  } finally {
    I = i, Nn.transition = s;
  }
}
function Og(e, t, n, r) {
  var i = I, s = Nn.transition;
  Nn.transition = null;
  try {
    I = 4, ta(e, t, n, r);
  } finally {
    I = i, Nn.transition = s;
  }
}
function ta(e, t, n, r) {
  if (Zi) {
    var i = Zo(e, t, n, r);
    if (i === null) oo(e, t, r, qi, n), Du(e, r);
    else if (jg(i, e, t, n, r)) r.stopPropagation();
    else if (Du(e, r), t & 4 && -1 < _g.indexOf(e)) {
      for (; i !== null; ) {
        var s = ei(i);
        if (s !== null && Ad(s), s = Zo(e, t, n, r), s === null && oo(e, t, r, qi, n), s === i) break;
        i = s;
      }
      i !== null && r.stopPropagation();
    } else oo(e, t, r, null, n);
  }
}
var qi = null;
function Zo(e, t, n, r) {
  if (qi = null, e = ql(r), e = Zt(e), e !== null) if (t = cn(e), t === null) e = null;
  else if (n = t.tag, n === 13) {
    if (e = xd(t), e !== null) return e;
    e = null;
  } else if (n === 3) {
    if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
    e = null;
  } else t !== e && (e = null);
  return qi = e, null;
}
function Ld(e) {
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
      switch (Cg()) {
        case Jl:
          return 1;
        case Td:
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
var Pt = null, na = null, Ni = null;
function Nd() {
  if (Ni) return Ni;
  var e, t = na, n = t.length, r, i = "value" in Pt ? Pt.value : Pt.textContent, s = i.length;
  for (e = 0; e < n && t[e] === i[e]; e++) ;
  var o = n - e;
  for (r = 1; r <= o && t[n - r] === i[s - r]; r++) ;
  return Ni = i.slice(e, 1 < r ? 1 - r : void 0);
}
function _i(e) {
  var t = e.keyCode;
  return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
}
function gi() {
  return !0;
}
function Vu() {
  return !1;
}
function Le(e) {
  function t(n, r, i, s, o) {
    this._reactName = n, this._targetInst = i, this.type = r, this.nativeEvent = s, this.target = o, this.currentTarget = null;
    for (var l in e) e.hasOwnProperty(l) && (n = e[l], this[l] = n ? n(s) : s[l]);
    return this.isDefaultPrevented = (s.defaultPrevented != null ? s.defaultPrevented : s.returnValue === !1) ? gi : Vu, this.isPropagationStopped = Vu, this;
  }
  return G(t.prototype, { preventDefault: function() {
    this.defaultPrevented = !0;
    var n = this.nativeEvent;
    n && (n.preventDefault ? n.preventDefault() : typeof n.returnValue != "unknown" && (n.returnValue = !1), this.isDefaultPrevented = gi);
  }, stopPropagation: function() {
    var n = this.nativeEvent;
    n && (n.stopPropagation ? n.stopPropagation() : typeof n.cancelBubble != "unknown" && (n.cancelBubble = !0), this.isPropagationStopped = gi);
  }, persist: function() {
  }, isPersistent: gi }), t;
}
var Qn = { eventPhase: 0, bubbles: 0, cancelable: 0, timeStamp: function(e) {
  return e.timeStamp || Date.now();
}, defaultPrevented: 0, isTrusted: 0 }, ra = Le(Qn), br = G({}, Qn, { view: 0, detail: 0 }), zg = Le(br), qs, Js, rr, Ps = G({}, br, { screenX: 0, screenY: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, getModifierState: ia, button: 0, buttons: 0, relatedTarget: function(e) {
  return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
}, movementX: function(e) {
  return "movementX" in e ? e.movementX : (e !== rr && (rr && e.type === "mousemove" ? (qs = e.screenX - rr.screenX, Js = e.screenY - rr.screenY) : Js = qs = 0, rr = e), qs);
}, movementY: function(e) {
  return "movementY" in e ? e.movementY : Js;
} }), Lu = Le(Ps), Bg = G({}, Ps, { dataTransfer: 0 }), Ug = Le(Bg), $g = G({}, br, { relatedTarget: 0 }), bs = Le($g), Wg = G({}, Qn, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }), Kg = Le(Wg), Hg = G({}, Qn, { clipboardData: function(e) {
  return "clipboardData" in e ? e.clipboardData : window.clipboardData;
} }), Gg = Le(Hg), Qg = G({}, Qn, { data: 0 }), Nu = Le(Qg), Yg = {
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
}, Xg = {
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
}, Zg = { Alt: "altKey", Control: "ctrlKey", Meta: "metaKey", Shift: "shiftKey" };
function qg(e) {
  var t = this.nativeEvent;
  return t.getModifierState ? t.getModifierState(e) : (e = Zg[e]) ? !!t[e] : !1;
}
function ia() {
  return qg;
}
var Jg = G({}, br, { key: function(e) {
  if (e.key) {
    var t = Yg[e.key] || e.key;
    if (t !== "Unidentified") return t;
  }
  return e.type === "keypress" ? (e = _i(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? Xg[e.keyCode] || "Unidentified" : "";
}, code: 0, location: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, repeat: 0, locale: 0, getModifierState: ia, charCode: function(e) {
  return e.type === "keypress" ? _i(e) : 0;
}, keyCode: function(e) {
  return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
}, which: function(e) {
  return e.type === "keypress" ? _i(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
} }), bg = Le(Jg), ey = G({}, Ps, { pointerId: 0, width: 0, height: 0, pressure: 0, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0, pointerType: 0, isPrimary: 0 }), _u = Le(ey), ty = G({}, br, { touches: 0, targetTouches: 0, changedTouches: 0, altKey: 0, metaKey: 0, ctrlKey: 0, shiftKey: 0, getModifierState: ia }), ny = Le(ty), ry = G({}, Qn, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }), iy = Le(ry), sy = G({}, Ps, {
  deltaX: function(e) {
    return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
  },
  deltaY: function(e) {
    return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
  },
  deltaZ: 0,
  deltaMode: 0
}), oy = Le(sy), ly = [9, 13, 27, 32], sa = ft && "CompositionEvent" in window, vr = null;
ft && "documentMode" in document && (vr = document.documentMode);
var ay = ft && "TextEvent" in window && !vr, _d = ft && (!sa || vr && 8 < vr && 11 >= vr), ju = " ", Fu = !1;
function jd(e, t) {
  switch (e) {
    case "keyup":
      return ly.indexOf(t.keyCode) !== -1;
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
function Fd(e) {
  return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
}
var mn = !1;
function uy(e, t) {
  switch (e) {
    case "compositionend":
      return Fd(t);
    case "keypress":
      return t.which !== 32 ? null : (Fu = !0, ju);
    case "textInput":
      return e = t.data, e === ju && Fu ? null : e;
    default:
      return null;
  }
}
function cy(e, t) {
  if (mn) return e === "compositionend" || !sa && jd(e, t) ? (e = Nd(), Ni = na = Pt = null, mn = !1, e) : null;
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
var fy = { color: !0, date: !0, datetime: !0, "datetime-local": !0, email: !0, month: !0, number: !0, password: !0, range: !0, search: !0, tel: !0, text: !0, time: !0, url: !0, week: !0 };
function Iu(e) {
  var t = e && e.nodeName && e.nodeName.toLowerCase();
  return t === "input" ? !!fy[e.type] : t === "textarea";
}
function Id(e, t, n, r) {
  pd(r), t = Ji(t, "onChange"), 0 < t.length && (n = new ra("onChange", "change", null, n, r), e.push({ event: n, listeners: t }));
}
var xr = null, jr = null;
function dy(e) {
  Yd(e, 0);
}
function Cs(e) {
  var t = vn(e);
  if (ld(t)) return e;
}
function hy(e, t) {
  if (e === "change") return t;
}
var Od = !1;
if (ft) {
  var eo;
  if (ft) {
    var to = "oninput" in document;
    if (!to) {
      var Ou = document.createElement("div");
      Ou.setAttribute("oninput", "return;"), to = typeof Ou.oninput == "function";
    }
    eo = to;
  } else eo = !1;
  Od = eo && (!document.documentMode || 9 < document.documentMode);
}
function zu() {
  xr && (xr.detachEvent("onpropertychange", zd), jr = xr = null);
}
function zd(e) {
  if (e.propertyName === "value" && Cs(jr)) {
    var t = [];
    Id(t, jr, e, ql(e)), vd(dy, t);
  }
}
function py(e, t, n) {
  e === "focusin" ? (zu(), xr = t, jr = n, xr.attachEvent("onpropertychange", zd)) : e === "focusout" && zu();
}
function my(e) {
  if (e === "selectionchange" || e === "keyup" || e === "keydown") return Cs(jr);
}
function gy(e, t) {
  if (e === "click") return Cs(t);
}
function yy(e, t) {
  if (e === "input" || e === "change") return Cs(t);
}
function vy(e, t) {
  return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
}
var Xe = typeof Object.is == "function" ? Object.is : vy;
function Fr(e, t) {
  if (Xe(e, t)) return !0;
  if (typeof e != "object" || e === null || typeof t != "object" || t === null) return !1;
  var n = Object.keys(e), r = Object.keys(t);
  if (n.length !== r.length) return !1;
  for (r = 0; r < n.length; r++) {
    var i = n[r];
    if (!Lo.call(t, i) || !Xe(e[i], t[i])) return !1;
  }
  return !0;
}
function Bu(e) {
  for (; e && e.firstChild; ) e = e.firstChild;
  return e;
}
function Uu(e, t) {
  var n = Bu(e);
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
    n = Bu(n);
  }
}
function Bd(e, t) {
  return e && t ? e === t ? !0 : e && e.nodeType === 3 ? !1 : t && t.nodeType === 3 ? Bd(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : !1 : !1;
}
function Ud() {
  for (var e = window, t = Hi(); t instanceof e.HTMLIFrameElement; ) {
    try {
      var n = typeof t.contentWindow.location.href == "string";
    } catch {
      n = !1;
    }
    if (n) e = t.contentWindow;
    else break;
    t = Hi(e.document);
  }
  return t;
}
function oa(e) {
  var t = e && e.nodeName && e.nodeName.toLowerCase();
  return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
}
function xy(e) {
  var t = Ud(), n = e.focusedElem, r = e.selectionRange;
  if (t !== n && n && n.ownerDocument && Bd(n.ownerDocument.documentElement, n)) {
    if (r !== null && oa(n)) {
      if (t = r.start, e = r.end, e === void 0 && (e = t), "selectionStart" in n) n.selectionStart = t, n.selectionEnd = Math.min(e, n.value.length);
      else if (e = (t = n.ownerDocument || document) && t.defaultView || window, e.getSelection) {
        e = e.getSelection();
        var i = n.textContent.length, s = Math.min(r.start, i);
        r = r.end === void 0 ? s : Math.min(r.end, i), !e.extend && s > r && (i = r, r = s, s = i), i = Uu(n, s);
        var o = Uu(
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
var wy = ft && "documentMode" in document && 11 >= document.documentMode, gn = null, qo = null, wr = null, Jo = !1;
function $u(e, t, n) {
  var r = n.window === n ? n.document : n.nodeType === 9 ? n : n.ownerDocument;
  Jo || gn == null || gn !== Hi(r) || (r = gn, "selectionStart" in r && oa(r) ? r = { start: r.selectionStart, end: r.selectionEnd } : (r = (r.ownerDocument && r.ownerDocument.defaultView || window).getSelection(), r = { anchorNode: r.anchorNode, anchorOffset: r.anchorOffset, focusNode: r.focusNode, focusOffset: r.focusOffset }), wr && Fr(wr, r) || (wr = r, r = Ji(qo, "onSelect"), 0 < r.length && (t = new ra("onSelect", "select", null, t, n), e.push({ event: t, listeners: r }), t.target = gn)));
}
function yi(e, t) {
  var n = {};
  return n[e.toLowerCase()] = t.toLowerCase(), n["Webkit" + e] = "webkit" + t, n["Moz" + e] = "moz" + t, n;
}
var yn = { animationend: yi("Animation", "AnimationEnd"), animationiteration: yi("Animation", "AnimationIteration"), animationstart: yi("Animation", "AnimationStart"), transitionend: yi("Transition", "TransitionEnd") }, no = {}, $d = {};
ft && ($d = document.createElement("div").style, "AnimationEvent" in window || (delete yn.animationend.animation, delete yn.animationiteration.animation, delete yn.animationstart.animation), "TransitionEvent" in window || delete yn.transitionend.transition);
function Es(e) {
  if (no[e]) return no[e];
  if (!yn[e]) return e;
  var t = yn[e], n;
  for (n in t) if (t.hasOwnProperty(n) && n in $d) return no[e] = t[n];
  return e;
}
var Wd = Es("animationend"), Kd = Es("animationiteration"), Hd = Es("animationstart"), Gd = Es("transitionend"), Qd = /* @__PURE__ */ new Map(), Wu = "abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
function Ot(e, t) {
  Qd.set(e, t), un(t, [e]);
}
for (var ro = 0; ro < Wu.length; ro++) {
  var io = Wu[ro], Sy = io.toLowerCase(), ky = io[0].toUpperCase() + io.slice(1);
  Ot(Sy, "on" + ky);
}
Ot(Wd, "onAnimationEnd");
Ot(Kd, "onAnimationIteration");
Ot(Hd, "onAnimationStart");
Ot("dblclick", "onDoubleClick");
Ot("focusin", "onFocus");
Ot("focusout", "onBlur");
Ot(Gd, "onTransitionEnd");
Fn("onMouseEnter", ["mouseout", "mouseover"]);
Fn("onMouseLeave", ["mouseout", "mouseover"]);
Fn("onPointerEnter", ["pointerout", "pointerover"]);
Fn("onPointerLeave", ["pointerout", "pointerover"]);
un("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" "));
un("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));
un("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]);
un("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" "));
un("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" "));
un("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
var dr = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), Ty = new Set("cancel close invalid load scroll toggle".split(" ").concat(dr));
function Ku(e, t, n) {
  var r = e.type || "unknown-event";
  e.currentTarget = n, Sg(r, t, void 0, e), e.currentTarget = null;
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
        Ku(i, l, u), s = a;
      }
      else for (o = 0; o < r.length; o++) {
        if (l = r[o], a = l.instance, u = l.currentTarget, l = l.listener, a !== s && i.isPropagationStopped()) break e;
        Ku(i, l, u), s = a;
      }
    }
  }
  if (Qi) throw e = Qo, Qi = !1, Qo = null, e;
}
function z(e, t) {
  var n = t[rl];
  n === void 0 && (n = t[rl] = /* @__PURE__ */ new Set());
  var r = e + "__bubble";
  n.has(r) || (Xd(t, e, 2, !1), n.add(r));
}
function so(e, t, n) {
  var r = 0;
  t && (r |= 4), Xd(n, e, r, t);
}
var vi = "_reactListening" + Math.random().toString(36).slice(2);
function Ir(e) {
  if (!e[vi]) {
    e[vi] = !0, nd.forEach(function(n) {
      n !== "selectionchange" && (Ty.has(n) || so(n, !1, e), so(n, !0, e));
    });
    var t = e.nodeType === 9 ? e : e.ownerDocument;
    t === null || t[vi] || (t[vi] = !0, so("selectionchange", !1, t));
  }
}
function Xd(e, t, n, r) {
  switch (Ld(t)) {
    case 1:
      var i = Ig;
      break;
    case 4:
      i = Og;
      break;
    default:
      i = ta;
  }
  n = i.bind(null, t, n, e), i = void 0, !Go || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (i = !0), r ? i !== void 0 ? e.addEventListener(t, n, { capture: !0, passive: i }) : e.addEventListener(t, n, !0) : i !== void 0 ? e.addEventListener(t, n, { passive: i }) : e.addEventListener(t, n, !1);
}
function oo(e, t, n, r, i) {
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
  vd(function() {
    var u = s, c = ql(n), f = [];
    e: {
      var d = Qd.get(e);
      if (d !== void 0) {
        var g = ra, y = e;
        switch (e) {
          case "keypress":
            if (_i(n) === 0) break e;
          case "keydown":
          case "keyup":
            g = bg;
            break;
          case "focusin":
            y = "focus", g = bs;
            break;
          case "focusout":
            y = "blur", g = bs;
            break;
          case "beforeblur":
          case "afterblur":
            g = bs;
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
            g = Ug;
            break;
          case "touchcancel":
          case "touchend":
          case "touchmove":
          case "touchstart":
            g = ny;
            break;
          case Wd:
          case Kd:
          case Hd:
            g = Kg;
            break;
          case Gd:
            g = iy;
            break;
          case "scroll":
            g = zg;
            break;
          case "wheel":
            g = oy;
            break;
          case "copy":
          case "cut":
          case "paste":
            g = Gg;
            break;
          case "gotpointercapture":
          case "lostpointercapture":
          case "pointercancel":
          case "pointerdown":
          case "pointermove":
          case "pointerout":
          case "pointerover":
          case "pointerup":
            g = _u;
        }
        var v = (t & 4) !== 0, S = !v && e === "scroll", p = v ? d !== null ? d + "Capture" : null : d;
        v = [];
        for (var h = u, m; h !== null; ) {
          m = h;
          var x = m.stateNode;
          if (m.tag === 5 && x !== null && (m = x, p !== null && (x = Vr(h, p), x != null && v.push(Or(h, x, m)))), S) break;
          h = h.return;
        }
        0 < v.length && (d = new g(d, y, null, n, c), f.push({ event: d, listeners: v }));
      }
    }
    if (!(t & 7)) {
      e: {
        if (d = e === "mouseover" || e === "pointerover", g = e === "mouseout" || e === "pointerout", d && n !== Ko && (y = n.relatedTarget || n.fromElement) && (Zt(y) || y[dt])) break e;
        if ((g || d) && (d = c.window === c ? c : (d = c.ownerDocument) ? d.defaultView || d.parentWindow : window, g ? (y = n.relatedTarget || n.toElement, g = u, y = y ? Zt(y) : null, y !== null && (S = cn(y), y !== S || y.tag !== 5 && y.tag !== 6) && (y = null)) : (g = null, y = u), g !== y)) {
          if (v = Lu, x = "onMouseLeave", p = "onMouseEnter", h = "mouse", (e === "pointerout" || e === "pointerover") && (v = _u, x = "onPointerLeave", p = "onPointerEnter", h = "pointer"), S = g == null ? d : vn(g), m = y == null ? d : vn(y), d = new v(x, h + "leave", g, n, c), d.target = S, d.relatedTarget = m, x = null, Zt(c) === u && (v = new v(p, h + "enter", y, n, c), v.target = m, v.relatedTarget = S, x = v), S = x, g && y) t: {
            for (v = g, p = y, h = 0, m = v; m; m = dn(m)) h++;
            for (m = 0, x = p; x; x = dn(x)) m++;
            for (; 0 < h - m; ) v = dn(v), h--;
            for (; 0 < m - h; ) p = dn(p), m--;
            for (; h--; ) {
              if (v === p || p !== null && v === p.alternate) break t;
              v = dn(v), p = dn(p);
            }
            v = null;
          }
          else v = null;
          g !== null && Hu(f, d, g, v, !1), y !== null && S !== null && Hu(f, S, y, v, !0);
        }
      }
      e: {
        if (d = u ? vn(u) : window, g = d.nodeName && d.nodeName.toLowerCase(), g === "select" || g === "input" && d.type === "file") var w = hy;
        else if (Iu(d)) if (Od) w = yy;
        else {
          w = my;
          var P = py;
        }
        else (g = d.nodeName) && g.toLowerCase() === "input" && (d.type === "checkbox" || d.type === "radio") && (w = gy);
        if (w && (w = w(e, u))) {
          Id(f, w, n, c);
          break e;
        }
        P && P(e, d, u), e === "focusout" && (P = d._wrapperState) && P.controlled && d.type === "number" && zo(d, "number", d.value);
      }
      switch (P = u ? vn(u) : window, e) {
        case "focusin":
          (Iu(P) || P.contentEditable === "true") && (gn = P, qo = u, wr = null);
          break;
        case "focusout":
          wr = qo = gn = null;
          break;
        case "mousedown":
          Jo = !0;
          break;
        case "contextmenu":
        case "mouseup":
        case "dragend":
          Jo = !1, $u(f, n, c);
          break;
        case "selectionchange":
          if (wy) break;
        case "keydown":
        case "keyup":
          $u(f, n, c);
      }
      var E;
      if (sa) e: {
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
      else mn ? jd(e, n) && (k = "onCompositionEnd") : e === "keydown" && n.keyCode === 229 && (k = "onCompositionStart");
      k && (_d && n.locale !== "ko" && (mn || k !== "onCompositionStart" ? k === "onCompositionEnd" && mn && (E = Nd()) : (Pt = c, na = "value" in Pt ? Pt.value : Pt.textContent, mn = !0)), P = Ji(u, k), 0 < P.length && (k = new Nu(k, e, null, n, c), f.push({ event: k, listeners: P }), E ? k.data = E : (E = Fd(n), E !== null && (k.data = E)))), (E = ay ? uy(e, n) : cy(e, n)) && (u = Ji(u, "onBeforeInput"), 0 < u.length && (c = new Nu("onBeforeInput", "beforeinput", null, n, c), f.push({ event: c, listeners: u }), c.data = E));
    }
    Yd(f, t);
  });
}
function Or(e, t, n) {
  return { instance: e, listener: t, currentTarget: n };
}
function Ji(e, t) {
  for (var n = t + "Capture", r = []; e !== null; ) {
    var i = e, s = i.stateNode;
    i.tag === 5 && s !== null && (i = s, s = Vr(e, n), s != null && r.unshift(Or(e, s, i)), s = Vr(e, t), s != null && r.push(Or(e, s, i))), e = e.return;
  }
  return r;
}
function dn(e) {
  if (e === null) return null;
  do
    e = e.return;
  while (e && e.tag !== 5);
  return e || null;
}
function Hu(e, t, n, r, i) {
  for (var s = t._reactName, o = []; n !== null && n !== r; ) {
    var l = n, a = l.alternate, u = l.stateNode;
    if (a !== null && a === r) break;
    l.tag === 5 && u !== null && (l = u, i ? (a = Vr(n, s), a != null && o.unshift(Or(n, a, l))) : i || (a = Vr(n, s), a != null && o.push(Or(n, a, l)))), n = n.return;
  }
  o.length !== 0 && e.push({ event: t, listeners: o });
}
var Py = /\r\n?/g, Cy = /\u0000|\uFFFD/g;
function Gu(e) {
  return (typeof e == "string" ? e : "" + e).replace(Py, `
`).replace(Cy, "");
}
function xi(e, t, n) {
  if (t = Gu(t), Gu(e) !== t && n) throw Error(T(425));
}
function bi() {
}
var bo = null, el = null;
function tl(e, t) {
  return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
}
var nl = typeof setTimeout == "function" ? setTimeout : void 0, Ey = typeof clearTimeout == "function" ? clearTimeout : void 0, Qu = typeof Promise == "function" ? Promise : void 0, Ay = typeof queueMicrotask == "function" ? queueMicrotask : typeof Qu < "u" ? function(e) {
  return Qu.resolve(null).then(e).catch(Ry);
} : nl;
function Ry(e) {
  setTimeout(function() {
    throw e;
  });
}
function lo(e, t) {
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
function Dt(e) {
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
function Yu(e) {
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
var Yn = Math.random().toString(36).slice(2), Je = "__reactFiber$" + Yn, zr = "__reactProps$" + Yn, dt = "__reactContainer$" + Yn, rl = "__reactEvents$" + Yn, Dy = "__reactListeners$" + Yn, My = "__reactHandles$" + Yn;
function Zt(e) {
  var t = e[Je];
  if (t) return t;
  for (var n = e.parentNode; n; ) {
    if (t = n[dt] || n[Je]) {
      if (n = t.alternate, t.child !== null || n !== null && n.child !== null) for (e = Yu(e); e !== null; ) {
        if (n = e[Je]) return n;
        e = Yu(e);
      }
      return t;
    }
    e = n, n = e.parentNode;
  }
  return null;
}
function ei(e) {
  return e = e[Je] || e[dt], !e || e.tag !== 5 && e.tag !== 6 && e.tag !== 13 && e.tag !== 3 ? null : e;
}
function vn(e) {
  if (e.tag === 5 || e.tag === 6) return e.stateNode;
  throw Error(T(33));
}
function As(e) {
  return e[zr] || null;
}
var il = [], xn = -1;
function zt(e) {
  return { current: e };
}
function B(e) {
  0 > xn || (e.current = il[xn], il[xn] = null, xn--);
}
function O(e, t) {
  xn++, il[xn] = e.current, e.current = t;
}
var jt = {}, me = zt(jt), ke = zt(!1), rn = jt;
function In(e, t) {
  var n = e.type.contextTypes;
  if (!n) return jt;
  var r = e.stateNode;
  if (r && r.__reactInternalMemoizedUnmaskedChildContext === t) return r.__reactInternalMemoizedMaskedChildContext;
  var i = {}, s;
  for (s in n) i[s] = t[s];
  return r && (e = e.stateNode, e.__reactInternalMemoizedUnmaskedChildContext = t, e.__reactInternalMemoizedMaskedChildContext = i), i;
}
function Te(e) {
  return e = e.childContextTypes, e != null;
}
function es() {
  B(ke), B(me);
}
function Xu(e, t, n) {
  if (me.current !== jt) throw Error(T(168));
  O(me, t), O(ke, n);
}
function Zd(e, t, n) {
  var r = e.stateNode;
  if (t = t.childContextTypes, typeof r.getChildContext != "function") return n;
  r = r.getChildContext();
  for (var i in r) if (!(i in t)) throw Error(T(108, pg(e) || "Unknown", i));
  return G({}, n, r);
}
function ts(e) {
  return e = (e = e.stateNode) && e.__reactInternalMemoizedMergedChildContext || jt, rn = me.current, O(me, e), O(ke, ke.current), !0;
}
function Zu(e, t, n) {
  var r = e.stateNode;
  if (!r) throw Error(T(169));
  n ? (e = Zd(e, t, rn), r.__reactInternalMemoizedMergedChildContext = e, B(ke), B(me), O(me, e)) : B(ke), O(ke, n);
}
var st = null, Rs = !1, ao = !1;
function qd(e) {
  st === null ? st = [e] : st.push(e);
}
function Vy(e) {
  Rs = !0, qd(e);
}
function Bt() {
  if (!ao && st !== null) {
    ao = !0;
    var e = 0, t = I;
    try {
      var n = st;
      for (I = 1; e < n.length; e++) {
        var r = n[e];
        do
          r = r(!0);
        while (r !== null);
      }
      st = null, Rs = !1;
    } catch (i) {
      throw st !== null && (st = st.slice(e + 1)), kd(Jl, Bt), i;
    } finally {
      I = t, ao = !1;
    }
  }
  return null;
}
var wn = [], Sn = 0, ns = null, rs = 0, je = [], Fe = 0, sn = null, ot = 1, lt = "";
function Gt(e, t) {
  wn[Sn++] = rs, wn[Sn++] = ns, ns = e, rs = t;
}
function Jd(e, t, n) {
  je[Fe++] = ot, je[Fe++] = lt, je[Fe++] = sn, sn = e;
  var r = ot;
  e = lt;
  var i = 32 - Ge(r) - 1;
  r &= ~(1 << i), n += 1;
  var s = 32 - Ge(t) + i;
  if (30 < s) {
    var o = i - i % 5;
    s = (r & (1 << o) - 1).toString(32), r >>= o, i -= o, ot = 1 << 32 - Ge(t) + i | n << i | r, lt = s + e;
  } else ot = 1 << s | n << i | r, lt = e;
}
function la(e) {
  e.return !== null && (Gt(e, 1), Jd(e, 1, 0));
}
function aa(e) {
  for (; e === ns; ) ns = wn[--Sn], wn[Sn] = null, rs = wn[--Sn], wn[Sn] = null;
  for (; e === sn; ) sn = je[--Fe], je[Fe] = null, lt = je[--Fe], je[Fe] = null, ot = je[--Fe], je[Fe] = null;
}
var Ae = null, Ee = null, $ = !1, He = null;
function bd(e, t) {
  var n = Ie(5, null, null, 0);
  n.elementType = "DELETED", n.stateNode = t, n.return = e, t = e.deletions, t === null ? (e.deletions = [n], e.flags |= 16) : t.push(n);
}
function qu(e, t) {
  switch (e.tag) {
    case 5:
      var n = e.type;
      return t = t.nodeType !== 1 || n.toLowerCase() !== t.nodeName.toLowerCase() ? null : t, t !== null ? (e.stateNode = t, Ae = e, Ee = Dt(t.firstChild), !0) : !1;
    case 6:
      return t = e.pendingProps === "" || t.nodeType !== 3 ? null : t, t !== null ? (e.stateNode = t, Ae = e, Ee = null, !0) : !1;
    case 13:
      return t = t.nodeType !== 8 ? null : t, t !== null ? (n = sn !== null ? { id: ot, overflow: lt } : null, e.memoizedState = { dehydrated: t, treeContext: n, retryLane: 1073741824 }, n = Ie(18, null, null, 0), n.stateNode = t, n.return = e, e.child = n, Ae = e, Ee = null, !0) : !1;
    default:
      return !1;
  }
}
function sl(e) {
  return (e.mode & 1) !== 0 && (e.flags & 128) === 0;
}
function ol(e) {
  if ($) {
    var t = Ee;
    if (t) {
      var n = t;
      if (!qu(e, t)) {
        if (sl(e)) throw Error(T(418));
        t = Dt(n.nextSibling);
        var r = Ae;
        t && qu(e, t) ? bd(r, n) : (e.flags = e.flags & -4097 | 2, $ = !1, Ae = e);
      }
    } else {
      if (sl(e)) throw Error(T(418));
      e.flags = e.flags & -4097 | 2, $ = !1, Ae = e;
    }
  }
}
function Ju(e) {
  for (e = e.return; e !== null && e.tag !== 5 && e.tag !== 3 && e.tag !== 13; ) e = e.return;
  Ae = e;
}
function wi(e) {
  if (e !== Ae) return !1;
  if (!$) return Ju(e), $ = !0, !1;
  var t;
  if ((t = e.tag !== 3) && !(t = e.tag !== 5) && (t = e.type, t = t !== "head" && t !== "body" && !tl(e.type, e.memoizedProps)), t && (t = Ee)) {
    if (sl(e)) throw eh(), Error(T(418));
    for (; t; ) bd(e, t), t = Dt(t.nextSibling);
  }
  if (Ju(e), e.tag === 13) {
    if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(T(317));
    e: {
      for (e = e.nextSibling, t = 0; e; ) {
        if (e.nodeType === 8) {
          var n = e.data;
          if (n === "/$") {
            if (t === 0) {
              Ee = Dt(e.nextSibling);
              break e;
            }
            t--;
          } else n !== "$" && n !== "$!" && n !== "$?" || t++;
        }
        e = e.nextSibling;
      }
      Ee = null;
    }
  } else Ee = Ae ? Dt(e.stateNode.nextSibling) : null;
  return !0;
}
function eh() {
  for (var e = Ee; e; ) e = Dt(e.nextSibling);
}
function On() {
  Ee = Ae = null, $ = !1;
}
function ua(e) {
  He === null ? He = [e] : He.push(e);
}
var Ly = gt.ReactCurrentBatchConfig;
function ir(e, t, n) {
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
function Si(e, t) {
  throw e = Object.prototype.toString.call(t), Error(T(31, e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e));
}
function bu(e) {
  var t = e._init;
  return t(e._payload);
}
function th(e) {
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
    return p = Nt(p, h), p.index = 0, p.sibling = null, p;
  }
  function s(p, h, m) {
    return p.index = m, e ? (m = p.alternate, m !== null ? (m = m.index, m < h ? (p.flags |= 2, h) : m) : (p.flags |= 2, h)) : (p.flags |= 1048576, h);
  }
  function o(p) {
    return e && p.alternate === null && (p.flags |= 2), p;
  }
  function l(p, h, m, x) {
    return h === null || h.tag !== 6 ? (h = go(m, p.mode, x), h.return = p, h) : (h = i(h, m), h.return = p, h);
  }
  function a(p, h, m, x) {
    var w = m.type;
    return w === pn ? c(p, h, m.props.children, x, m.key) : h !== null && (h.elementType === w || typeof w == "object" && w !== null && w.$$typeof === wt && bu(w) === h.type) ? (x = i(h, m.props), x.ref = ir(p, h, m), x.return = p, x) : (x = Ui(m.type, m.key, m.props, null, p.mode, x), x.ref = ir(p, h, m), x.return = p, x);
  }
  function u(p, h, m, x) {
    return h === null || h.tag !== 4 || h.stateNode.containerInfo !== m.containerInfo || h.stateNode.implementation !== m.implementation ? (h = yo(m, p.mode, x), h.return = p, h) : (h = i(h, m.children || []), h.return = p, h);
  }
  function c(p, h, m, x, w) {
    return h === null || h.tag !== 7 ? (h = tn(m, p.mode, x, w), h.return = p, h) : (h = i(h, m), h.return = p, h);
  }
  function f(p, h, m) {
    if (typeof h == "string" && h !== "" || typeof h == "number") return h = go("" + h, p.mode, m), h.return = p, h;
    if (typeof h == "object" && h !== null) {
      switch (h.$$typeof) {
        case ci:
          return m = Ui(h.type, h.key, h.props, null, p.mode, m), m.ref = ir(p, null, h), m.return = p, m;
        case hn:
          return h = yo(h, p.mode, m), h.return = p, h;
        case wt:
          var x = h._init;
          return f(p, x(h._payload), m);
      }
      if (cr(h) || bn(h)) return h = tn(h, p.mode, m, null), h.return = p, h;
      Si(p, h);
    }
    return null;
  }
  function d(p, h, m, x) {
    var w = h !== null ? h.key : null;
    if (typeof m == "string" && m !== "" || typeof m == "number") return w !== null ? null : l(p, h, "" + m, x);
    if (typeof m == "object" && m !== null) {
      switch (m.$$typeof) {
        case ci:
          return m.key === w ? a(p, h, m, x) : null;
        case hn:
          return m.key === w ? u(p, h, m, x) : null;
        case wt:
          return w = m._init, d(
            p,
            h,
            w(m._payload),
            x
          );
      }
      if (cr(m) || bn(m)) return w !== null ? null : c(p, h, m, x, null);
      Si(p, m);
    }
    return null;
  }
  function g(p, h, m, x, w) {
    if (typeof x == "string" && x !== "" || typeof x == "number") return p = p.get(m) || null, l(h, p, "" + x, w);
    if (typeof x == "object" && x !== null) {
      switch (x.$$typeof) {
        case ci:
          return p = p.get(x.key === null ? m : x.key) || null, a(h, p, x, w);
        case hn:
          return p = p.get(x.key === null ? m : x.key) || null, u(h, p, x, w);
        case wt:
          var P = x._init;
          return g(p, h, m, P(x._payload), w);
      }
      if (cr(x) || bn(x)) return p = p.get(m) || null, c(h, p, x, w, null);
      Si(h, x);
    }
    return null;
  }
  function y(p, h, m, x) {
    for (var w = null, P = null, E = h, k = h = 0, _ = null; E !== null && k < m.length; k++) {
      E.index > k ? (_ = E, E = null) : _ = E.sibling;
      var V = d(p, E, m[k], x);
      if (V === null) {
        E === null && (E = _);
        break;
      }
      e && E && V.alternate === null && t(p, E), h = s(V, h, k), P === null ? w = V : P.sibling = V, P = V, E = _;
    }
    if (k === m.length) return n(p, E), $ && Gt(p, k), w;
    if (E === null) {
      for (; k < m.length; k++) E = f(p, m[k], x), E !== null && (h = s(E, h, k), P === null ? w = E : P.sibling = E, P = E);
      return $ && Gt(p, k), w;
    }
    for (E = r(p, E); k < m.length; k++) _ = g(E, p, k, m[k], x), _ !== null && (e && _.alternate !== null && E.delete(_.key === null ? k : _.key), h = s(_, h, k), P === null ? w = _ : P.sibling = _, P = _);
    return e && E.forEach(function(ne) {
      return t(p, ne);
    }), $ && Gt(p, k), w;
  }
  function v(p, h, m, x) {
    var w = bn(m);
    if (typeof w != "function") throw Error(T(150));
    if (m = w.call(m), m == null) throw Error(T(151));
    for (var P = w = null, E = h, k = h = 0, _ = null, V = m.next(); E !== null && !V.done; k++, V = m.next()) {
      E.index > k ? (_ = E, E = null) : _ = E.sibling;
      var ne = d(p, E, V.value, x);
      if (ne === null) {
        E === null && (E = _);
        break;
      }
      e && E && ne.alternate === null && t(p, E), h = s(ne, h, k), P === null ? w = ne : P.sibling = ne, P = ne, E = _;
    }
    if (V.done) return n(
      p,
      E
    ), $ && Gt(p, k), w;
    if (E === null) {
      for (; !V.done; k++, V = m.next()) V = f(p, V.value, x), V !== null && (h = s(V, h, k), P === null ? w = V : P.sibling = V, P = V);
      return $ && Gt(p, k), w;
    }
    for (E = r(p, E); !V.done; k++, V = m.next()) V = g(E, p, k, V.value, x), V !== null && (e && V.alternate !== null && E.delete(V.key === null ? k : V.key), h = s(V, h, k), P === null ? w = V : P.sibling = V, P = V);
    return e && E.forEach(function(yt) {
      return t(p, yt);
    }), $ && Gt(p, k), w;
  }
  function S(p, h, m, x) {
    if (typeof m == "object" && m !== null && m.type === pn && m.key === null && (m = m.props.children), typeof m == "object" && m !== null) {
      switch (m.$$typeof) {
        case ci:
          e: {
            for (var w = m.key, P = h; P !== null; ) {
              if (P.key === w) {
                if (w = m.type, w === pn) {
                  if (P.tag === 7) {
                    n(p, P.sibling), h = i(P, m.props.children), h.return = p, p = h;
                    break e;
                  }
                } else if (P.elementType === w || typeof w == "object" && w !== null && w.$$typeof === wt && bu(w) === P.type) {
                  n(p, P.sibling), h = i(P, m.props), h.ref = ir(p, P, m), h.return = p, p = h;
                  break e;
                }
                n(p, P);
                break;
              } else t(p, P);
              P = P.sibling;
            }
            m.type === pn ? (h = tn(m.props.children, p.mode, x, m.key), h.return = p, p = h) : (x = Ui(m.type, m.key, m.props, null, p.mode, x), x.ref = ir(p, h, m), x.return = p, p = x);
          }
          return o(p);
        case hn:
          e: {
            for (P = m.key; h !== null; ) {
              if (h.key === P) if (h.tag === 4 && h.stateNode.containerInfo === m.containerInfo && h.stateNode.implementation === m.implementation) {
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
        case wt:
          return P = m._init, S(p, h, P(m._payload), x);
      }
      if (cr(m)) return y(p, h, m, x);
      if (bn(m)) return v(p, h, m, x);
      Si(p, m);
    }
    return typeof m == "string" && m !== "" || typeof m == "number" ? (m = "" + m, h !== null && h.tag === 6 ? (n(p, h.sibling), h = i(h, m), h.return = p, p = h) : (n(p, h), h = go(m, p.mode, x), h.return = p, p = h), o(p)) : n(p, h);
  }
  return S;
}
var zn = th(!0), nh = th(!1), is = zt(null), ss = null, kn = null, ca = null;
function fa() {
  ca = kn = ss = null;
}
function da(e) {
  var t = is.current;
  B(is), e._currentValue = t;
}
function ll(e, t, n) {
  for (; e !== null; ) {
    var r = e.alternate;
    if ((e.childLanes & t) !== t ? (e.childLanes |= t, r !== null && (r.childLanes |= t)) : r !== null && (r.childLanes & t) !== t && (r.childLanes |= t), e === n) break;
    e = e.return;
  }
}
function _n(e, t) {
  ss = e, ca = kn = null, e = e.dependencies, e !== null && e.firstContext !== null && (e.lanes & t && (Se = !0), e.firstContext = null);
}
function ze(e) {
  var t = e._currentValue;
  if (ca !== e) if (e = { context: e, memoizedValue: t, next: null }, kn === null) {
    if (ss === null) throw Error(T(308));
    kn = e, ss.dependencies = { lanes: 0, firstContext: e };
  } else kn = kn.next = e;
  return t;
}
var qt = null;
function ha(e) {
  qt === null ? qt = [e] : qt.push(e);
}
function rh(e, t, n, r) {
  var i = t.interleaved;
  return i === null ? (n.next = n, ha(t)) : (n.next = i.next, i.next = n), t.interleaved = n, ht(e, r);
}
function ht(e, t) {
  e.lanes |= t;
  var n = e.alternate;
  for (n !== null && (n.lanes |= t), n = e, e = e.return; e !== null; ) e.childLanes |= t, n = e.alternate, n !== null && (n.childLanes |= t), n = e, e = e.return;
  return n.tag === 3 ? n.stateNode : null;
}
var St = !1;
function pa(e) {
  e.updateQueue = { baseState: e.memoizedState, firstBaseUpdate: null, lastBaseUpdate: null, shared: { pending: null, interleaved: null, lanes: 0 }, effects: null };
}
function ih(e, t) {
  e = e.updateQueue, t.updateQueue === e && (t.updateQueue = { baseState: e.baseState, firstBaseUpdate: e.firstBaseUpdate, lastBaseUpdate: e.lastBaseUpdate, shared: e.shared, effects: e.effects });
}
function at(e, t) {
  return { eventTime: e, lane: t, tag: 0, payload: null, callback: null, next: null };
}
function Mt(e, t, n) {
  var r = e.updateQueue;
  if (r === null) return null;
  if (r = r.shared, F & 2) {
    var i = r.pending;
    return i === null ? t.next = t : (t.next = i.next, i.next = t), r.pending = t, ht(e, n);
  }
  return i = r.interleaved, i === null ? (t.next = t, ha(r)) : (t.next = i.next, i.next = t), r.interleaved = t, ht(e, n);
}
function ji(e, t, n) {
  if (t = t.updateQueue, t !== null && (t = t.shared, (n & 4194240) !== 0)) {
    var r = t.lanes;
    r &= e.pendingLanes, n |= r, t.lanes = n, bl(e, n);
  }
}
function ec(e, t) {
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
function os(e, t, n, r) {
  var i = e.updateQueue;
  St = !1;
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
          var y = e, v = l;
          switch (d = t, g = n, v.tag) {
            case 1:
              if (y = v.payload, typeof y == "function") {
                f = y.call(g, f, d);
                break e;
              }
              f = y;
              break e;
            case 3:
              y.flags = y.flags & -65537 | 128;
            case 0:
              if (y = v.payload, d = typeof y == "function" ? y.call(g, f, d) : y, d == null) break e;
              f = G({}, f, d);
              break e;
            case 2:
              St = !0;
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
    ln |= o, e.lanes = o, e.memoizedState = f;
  }
}
function tc(e, t, n) {
  if (e = t.effects, t.effects = null, e !== null) for (t = 0; t < e.length; t++) {
    var r = e[t], i = r.callback;
    if (i !== null) {
      if (r.callback = null, r = n, typeof i != "function") throw Error(T(191, i));
      i.call(r);
    }
  }
}
var ti = {}, et = zt(ti), Br = zt(ti), Ur = zt(ti);
function Jt(e) {
  if (e === ti) throw Error(T(174));
  return e;
}
function ma(e, t) {
  switch (O(Ur, t), O(Br, e), O(et, ti), e = t.nodeType, e) {
    case 9:
    case 11:
      t = (t = t.documentElement) ? t.namespaceURI : Uo(null, "");
      break;
    default:
      e = e === 8 ? t.parentNode : t, t = e.namespaceURI || null, e = e.tagName, t = Uo(t, e);
  }
  B(et), O(et, t);
}
function Bn() {
  B(et), B(Br), B(Ur);
}
function sh(e) {
  Jt(Ur.current);
  var t = Jt(et.current), n = Uo(t, e.type);
  t !== n && (O(Br, e), O(et, n));
}
function ga(e) {
  Br.current === e && (B(et), B(Br));
}
var W = zt(0);
function ls(e) {
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
var uo = [];
function ya() {
  for (var e = 0; e < uo.length; e++) uo[e]._workInProgressVersionPrimary = null;
  uo.length = 0;
}
var Fi = gt.ReactCurrentDispatcher, co = gt.ReactCurrentBatchConfig, on = 0, H = null, ee = null, ie = null, as = !1, Sr = !1, $r = 0, Ny = 0;
function ce() {
  throw Error(T(321));
}
function va(e, t) {
  if (t === null) return !1;
  for (var n = 0; n < t.length && n < e.length; n++) if (!Xe(e[n], t[n])) return !1;
  return !0;
}
function xa(e, t, n, r, i, s) {
  if (on = s, H = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, Fi.current = e === null || e.memoizedState === null ? Iy : Oy, e = n(r, i), Sr) {
    s = 0;
    do {
      if (Sr = !1, $r = 0, 25 <= s) throw Error(T(301));
      s += 1, ie = ee = null, t.updateQueue = null, Fi.current = zy, e = n(r, i);
    } while (Sr);
  }
  if (Fi.current = us, t = ee !== null && ee.next !== null, on = 0, ie = ee = H = null, as = !1, t) throw Error(T(300));
  return e;
}
function wa() {
  var e = $r !== 0;
  return $r = 0, e;
}
function qe() {
  var e = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null };
  return ie === null ? H.memoizedState = ie = e : ie = ie.next = e, ie;
}
function Be() {
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
function Wr(e, t) {
  return typeof t == "function" ? t(e) : t;
}
function fo(e) {
  var t = Be(), n = t.queue;
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
      if ((on & c) === c) a !== null && (a = a.next = { lane: 0, action: u.action, hasEagerState: u.hasEagerState, eagerState: u.eagerState, next: null }), r = u.hasEagerState ? u.eagerState : e(r, u.action);
      else {
        var f = {
          lane: c,
          action: u.action,
          hasEagerState: u.hasEagerState,
          eagerState: u.eagerState,
          next: null
        };
        a === null ? (l = a = f, o = r) : a = a.next = f, H.lanes |= c, ln |= c;
      }
      u = u.next;
    } while (u !== null && u !== s);
    a === null ? o = r : a.next = l, Xe(r, t.memoizedState) || (Se = !0), t.memoizedState = r, t.baseState = o, t.baseQueue = a, n.lastRenderedState = r;
  }
  if (e = n.interleaved, e !== null) {
    i = e;
    do
      s = i.lane, H.lanes |= s, ln |= s, i = i.next;
    while (i !== e);
  } else i === null && (n.lanes = 0);
  return [t.memoizedState, n.dispatch];
}
function ho(e) {
  var t = Be(), n = t.queue;
  if (n === null) throw Error(T(311));
  n.lastRenderedReducer = e;
  var r = n.dispatch, i = n.pending, s = t.memoizedState;
  if (i !== null) {
    n.pending = null;
    var o = i = i.next;
    do
      s = e(s, o.action), o = o.next;
    while (o !== i);
    Xe(s, t.memoizedState) || (Se = !0), t.memoizedState = s, t.baseQueue === null && (t.baseState = s), n.lastRenderedState = s;
  }
  return [s, r];
}
function oh() {
}
function lh(e, t) {
  var n = H, r = Be(), i = t(), s = !Xe(r.memoizedState, i);
  if (s && (r.memoizedState = i, Se = !0), r = r.queue, Sa(ch.bind(null, n, r, e), [e]), r.getSnapshot !== t || s || ie !== null && ie.memoizedState.tag & 1) {
    if (n.flags |= 2048, Kr(9, uh.bind(null, n, r, i, t), void 0, null), se === null) throw Error(T(349));
    on & 30 || ah(n, t, i);
  }
  return i;
}
function ah(e, t, n) {
  e.flags |= 16384, e = { getSnapshot: t, value: n }, t = H.updateQueue, t === null ? (t = { lastEffect: null, stores: null }, H.updateQueue = t, t.stores = [e]) : (n = t.stores, n === null ? t.stores = [e] : n.push(e));
}
function uh(e, t, n, r) {
  t.value = n, t.getSnapshot = r, fh(t) && dh(e);
}
function ch(e, t, n) {
  return n(function() {
    fh(t) && dh(e);
  });
}
function fh(e) {
  var t = e.getSnapshot;
  e = e.value;
  try {
    var n = t();
    return !Xe(e, n);
  } catch {
    return !0;
  }
}
function dh(e) {
  var t = ht(e, 1);
  t !== null && Qe(t, e, 1, -1);
}
function nc(e) {
  var t = qe();
  return typeof e == "function" && (e = e()), t.memoizedState = t.baseState = e, e = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: Wr, lastRenderedState: e }, t.queue = e, e = e.dispatch = Fy.bind(null, H, e), [t.memoizedState, e];
}
function Kr(e, t, n, r) {
  return e = { tag: e, create: t, destroy: n, deps: r, next: null }, t = H.updateQueue, t === null ? (t = { lastEffect: null, stores: null }, H.updateQueue = t, t.lastEffect = e.next = e) : (n = t.lastEffect, n === null ? t.lastEffect = e.next = e : (r = n.next, n.next = e, e.next = r, t.lastEffect = e)), e;
}
function hh() {
  return Be().memoizedState;
}
function Ii(e, t, n, r) {
  var i = qe();
  H.flags |= e, i.memoizedState = Kr(1 | t, n, void 0, r === void 0 ? null : r);
}
function Ds(e, t, n, r) {
  var i = Be();
  r = r === void 0 ? null : r;
  var s = void 0;
  if (ee !== null) {
    var o = ee.memoizedState;
    if (s = o.destroy, r !== null && va(r, o.deps)) {
      i.memoizedState = Kr(t, n, s, r);
      return;
    }
  }
  H.flags |= e, i.memoizedState = Kr(1 | t, n, s, r);
}
function rc(e, t) {
  return Ii(8390656, 8, e, t);
}
function Sa(e, t) {
  return Ds(2048, 8, e, t);
}
function ph(e, t) {
  return Ds(4, 2, e, t);
}
function mh(e, t) {
  return Ds(4, 4, e, t);
}
function gh(e, t) {
  if (typeof t == "function") return e = e(), t(e), function() {
    t(null);
  };
  if (t != null) return e = e(), t.current = e, function() {
    t.current = null;
  };
}
function yh(e, t, n) {
  return n = n != null ? n.concat([e]) : null, Ds(4, 4, gh.bind(null, t, e), n);
}
function ka() {
}
function vh(e, t) {
  var n = Be();
  t = t === void 0 ? null : t;
  var r = n.memoizedState;
  return r !== null && t !== null && va(t, r[1]) ? r[0] : (n.memoizedState = [e, t], e);
}
function xh(e, t) {
  var n = Be();
  t = t === void 0 ? null : t;
  var r = n.memoizedState;
  return r !== null && t !== null && va(t, r[1]) ? r[0] : (e = e(), n.memoizedState = [e, t], e);
}
function wh(e, t, n) {
  return on & 21 ? (Xe(n, t) || (n = Cd(), H.lanes |= n, ln |= n, e.baseState = !0), t) : (e.baseState && (e.baseState = !1, Se = !0), e.memoizedState = n);
}
function _y(e, t) {
  var n = I;
  I = n !== 0 && 4 > n ? n : 4, e(!0);
  var r = co.transition;
  co.transition = {};
  try {
    e(!1), t();
  } finally {
    I = n, co.transition = r;
  }
}
function Sh() {
  return Be().memoizedState;
}
function jy(e, t, n) {
  var r = Lt(e);
  if (n = { lane: r, action: n, hasEagerState: !1, eagerState: null, next: null }, kh(e)) Th(t, n);
  else if (n = rh(e, t, n, r), n !== null) {
    var i = ye();
    Qe(n, e, r, i), Ph(n, t, r);
  }
}
function Fy(e, t, n) {
  var r = Lt(e), i = { lane: r, action: n, hasEagerState: !1, eagerState: null, next: null };
  if (kh(e)) Th(t, i);
  else {
    var s = e.alternate;
    if (e.lanes === 0 && (s === null || s.lanes === 0) && (s = t.lastRenderedReducer, s !== null)) try {
      var o = t.lastRenderedState, l = s(o, n);
      if (i.hasEagerState = !0, i.eagerState = l, Xe(l, o)) {
        var a = t.interleaved;
        a === null ? (i.next = i, ha(t)) : (i.next = a.next, a.next = i), t.interleaved = i;
        return;
      }
    } catch {
    } finally {
    }
    n = rh(e, t, i, r), n !== null && (i = ye(), Qe(n, e, r, i), Ph(n, t, r));
  }
}
function kh(e) {
  var t = e.alternate;
  return e === H || t !== null && t === H;
}
function Th(e, t) {
  Sr = as = !0;
  var n = e.pending;
  n === null ? t.next = t : (t.next = n.next, n.next = t), e.pending = t;
}
function Ph(e, t, n) {
  if (n & 4194240) {
    var r = t.lanes;
    r &= e.pendingLanes, n |= r, t.lanes = n, bl(e, n);
  }
}
var us = { readContext: ze, useCallback: ce, useContext: ce, useEffect: ce, useImperativeHandle: ce, useInsertionEffect: ce, useLayoutEffect: ce, useMemo: ce, useReducer: ce, useRef: ce, useState: ce, useDebugValue: ce, useDeferredValue: ce, useTransition: ce, useMutableSource: ce, useSyncExternalStore: ce, useId: ce, unstable_isNewReconciler: !1 }, Iy = { readContext: ze, useCallback: function(e, t) {
  return qe().memoizedState = [e, t === void 0 ? null : t], e;
}, useContext: ze, useEffect: rc, useImperativeHandle: function(e, t, n) {
  return n = n != null ? n.concat([e]) : null, Ii(
    4194308,
    4,
    gh.bind(null, t, e),
    n
  );
}, useLayoutEffect: function(e, t) {
  return Ii(4194308, 4, e, t);
}, useInsertionEffect: function(e, t) {
  return Ii(4, 2, e, t);
}, useMemo: function(e, t) {
  var n = qe();
  return t = t === void 0 ? null : t, e = e(), n.memoizedState = [e, t], e;
}, useReducer: function(e, t, n) {
  var r = qe();
  return t = n !== void 0 ? n(t) : t, r.memoizedState = r.baseState = t, e = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: e, lastRenderedState: t }, r.queue = e, e = e.dispatch = jy.bind(null, H, e), [r.memoizedState, e];
}, useRef: function(e) {
  var t = qe();
  return e = { current: e }, t.memoizedState = e;
}, useState: nc, useDebugValue: ka, useDeferredValue: function(e) {
  return qe().memoizedState = e;
}, useTransition: function() {
  var e = nc(!1), t = e[0];
  return e = _y.bind(null, e[1]), qe().memoizedState = e, [t, e];
}, useMutableSource: function() {
}, useSyncExternalStore: function(e, t, n) {
  var r = H, i = qe();
  if ($) {
    if (n === void 0) throw Error(T(407));
    n = n();
  } else {
    if (n = t(), se === null) throw Error(T(349));
    on & 30 || ah(r, t, n);
  }
  i.memoizedState = n;
  var s = { value: n, getSnapshot: t };
  return i.queue = s, rc(ch.bind(
    null,
    r,
    s,
    e
  ), [e]), r.flags |= 2048, Kr(9, uh.bind(null, r, s, n, t), void 0, null), n;
}, useId: function() {
  var e = qe(), t = se.identifierPrefix;
  if ($) {
    var n = lt, r = ot;
    n = (r & ~(1 << 32 - Ge(r) - 1)).toString(32) + n, t = ":" + t + "R" + n, n = $r++, 0 < n && (t += "H" + n.toString(32)), t += ":";
  } else n = Ny++, t = ":" + t + "r" + n.toString(32) + ":";
  return e.memoizedState = t;
}, unstable_isNewReconciler: !1 }, Oy = {
  readContext: ze,
  useCallback: vh,
  useContext: ze,
  useEffect: Sa,
  useImperativeHandle: yh,
  useInsertionEffect: ph,
  useLayoutEffect: mh,
  useMemo: xh,
  useReducer: fo,
  useRef: hh,
  useState: function() {
    return fo(Wr);
  },
  useDebugValue: ka,
  useDeferredValue: function(e) {
    var t = Be();
    return wh(t, ee.memoizedState, e);
  },
  useTransition: function() {
    var e = fo(Wr)[0], t = Be().memoizedState;
    return [e, t];
  },
  useMutableSource: oh,
  useSyncExternalStore: lh,
  useId: Sh,
  unstable_isNewReconciler: !1
}, zy = { readContext: ze, useCallback: vh, useContext: ze, useEffect: Sa, useImperativeHandle: yh, useInsertionEffect: ph, useLayoutEffect: mh, useMemo: xh, useReducer: ho, useRef: hh, useState: function() {
  return ho(Wr);
}, useDebugValue: ka, useDeferredValue: function(e) {
  var t = Be();
  return ee === null ? t.memoizedState = e : wh(t, ee.memoizedState, e);
}, useTransition: function() {
  var e = ho(Wr)[0], t = Be().memoizedState;
  return [e, t];
}, useMutableSource: oh, useSyncExternalStore: lh, useId: Sh, unstable_isNewReconciler: !1 };
function We(e, t) {
  if (e && e.defaultProps) {
    t = G({}, t), e = e.defaultProps;
    for (var n in e) t[n] === void 0 && (t[n] = e[n]);
    return t;
  }
  return t;
}
function al(e, t, n, r) {
  t = e.memoizedState, n = n(r, t), n = n == null ? t : G({}, t, n), e.memoizedState = n, e.lanes === 0 && (e.updateQueue.baseState = n);
}
var Ms = { isMounted: function(e) {
  return (e = e._reactInternals) ? cn(e) === e : !1;
}, enqueueSetState: function(e, t, n) {
  e = e._reactInternals;
  var r = ye(), i = Lt(e), s = at(r, i);
  s.payload = t, n != null && (s.callback = n), t = Mt(e, s, i), t !== null && (Qe(t, e, i, r), ji(t, e, i));
}, enqueueReplaceState: function(e, t, n) {
  e = e._reactInternals;
  var r = ye(), i = Lt(e), s = at(r, i);
  s.tag = 1, s.payload = t, n != null && (s.callback = n), t = Mt(e, s, i), t !== null && (Qe(t, e, i, r), ji(t, e, i));
}, enqueueForceUpdate: function(e, t) {
  e = e._reactInternals;
  var n = ye(), r = Lt(e), i = at(n, r);
  i.tag = 2, t != null && (i.callback = t), t = Mt(e, i, r), t !== null && (Qe(t, e, r, n), ji(t, e, r));
} };
function ic(e, t, n, r, i, s, o) {
  return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, s, o) : t.prototype && t.prototype.isPureReactComponent ? !Fr(n, r) || !Fr(i, s) : !0;
}
function Ch(e, t, n) {
  var r = !1, i = jt, s = t.contextType;
  return typeof s == "object" && s !== null ? s = ze(s) : (i = Te(t) ? rn : me.current, r = t.contextTypes, s = (r = r != null) ? In(e, i) : jt), t = new t(n, s), e.memoizedState = t.state !== null && t.state !== void 0 ? t.state : null, t.updater = Ms, e.stateNode = t, t._reactInternals = e, r && (e = e.stateNode, e.__reactInternalMemoizedUnmaskedChildContext = i, e.__reactInternalMemoizedMaskedChildContext = s), t;
}
function sc(e, t, n, r) {
  e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(n, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(n, r), t.state !== e && Ms.enqueueReplaceState(t, t.state, null);
}
function ul(e, t, n, r) {
  var i = e.stateNode;
  i.props = n, i.state = e.memoizedState, i.refs = {}, pa(e);
  var s = t.contextType;
  typeof s == "object" && s !== null ? i.context = ze(s) : (s = Te(t) ? rn : me.current, i.context = In(e, s)), i.state = e.memoizedState, s = t.getDerivedStateFromProps, typeof s == "function" && (al(e, t, s, n), i.state = e.memoizedState), typeof t.getDerivedStateFromProps == "function" || typeof i.getSnapshotBeforeUpdate == "function" || typeof i.UNSAFE_componentWillMount != "function" && typeof i.componentWillMount != "function" || (t = i.state, typeof i.componentWillMount == "function" && i.componentWillMount(), typeof i.UNSAFE_componentWillMount == "function" && i.UNSAFE_componentWillMount(), t !== i.state && Ms.enqueueReplaceState(i, i.state, null), os(e, n, i, r), i.state = e.memoizedState), typeof i.componentDidMount == "function" && (e.flags |= 4194308);
}
function Un(e, t) {
  try {
    var n = "", r = t;
    do
      n += hg(r), r = r.return;
    while (r);
    var i = n;
  } catch (s) {
    i = `
Error generating stack: ` + s.message + `
` + s.stack;
  }
  return { value: e, source: t, stack: i, digest: null };
}
function po(e, t, n) {
  return { value: e, source: null, stack: n ?? null, digest: t ?? null };
}
function cl(e, t) {
  try {
    console.error(t.value);
  } catch (n) {
    setTimeout(function() {
      throw n;
    });
  }
}
var By = typeof WeakMap == "function" ? WeakMap : Map;
function Eh(e, t, n) {
  n = at(-1, n), n.tag = 3, n.payload = { element: null };
  var r = t.value;
  return n.callback = function() {
    fs || (fs = !0, wl = r), cl(e, t);
  }, n;
}
function Ah(e, t, n) {
  n = at(-1, n), n.tag = 3;
  var r = e.type.getDerivedStateFromError;
  if (typeof r == "function") {
    var i = t.value;
    n.payload = function() {
      return r(i);
    }, n.callback = function() {
      cl(e, t);
    };
  }
  var s = e.stateNode;
  return s !== null && typeof s.componentDidCatch == "function" && (n.callback = function() {
    cl(e, t), typeof r != "function" && (Vt === null ? Vt = /* @__PURE__ */ new Set([this]) : Vt.add(this));
    var o = t.stack;
    this.componentDidCatch(t.value, { componentStack: o !== null ? o : "" });
  }), n;
}
function oc(e, t, n) {
  var r = e.pingCache;
  if (r === null) {
    r = e.pingCache = new By();
    var i = /* @__PURE__ */ new Set();
    r.set(t, i);
  } else i = r.get(t), i === void 0 && (i = /* @__PURE__ */ new Set(), r.set(t, i));
  i.has(n) || (i.add(n), e = ev.bind(null, e, t, n), t.then(e, e));
}
function lc(e) {
  do {
    var t;
    if ((t = e.tag === 13) && (t = e.memoizedState, t = t !== null ? t.dehydrated !== null : !0), t) return e;
    e = e.return;
  } while (e !== null);
  return null;
}
function ac(e, t, n, r, i) {
  return e.mode & 1 ? (e.flags |= 65536, e.lanes = i, e) : (e === t ? e.flags |= 65536 : (e.flags |= 128, n.flags |= 131072, n.flags &= -52805, n.tag === 1 && (n.alternate === null ? n.tag = 17 : (t = at(-1, 1), t.tag = 2, Mt(n, t, 1))), n.lanes |= 1), e);
}
var Uy = gt.ReactCurrentOwner, Se = !1;
function ge(e, t, n, r) {
  t.child = e === null ? nh(t, null, n, r) : zn(t, e.child, n, r);
}
function uc(e, t, n, r, i) {
  n = n.render;
  var s = t.ref;
  return _n(t, i), r = xa(e, t, n, r, s, i), n = wa(), e !== null && !Se ? (t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~i, pt(e, t, i)) : ($ && n && la(t), t.flags |= 1, ge(e, t, r, i), t.child);
}
function cc(e, t, n, r, i) {
  if (e === null) {
    var s = n.type;
    return typeof s == "function" && !Ma(s) && s.defaultProps === void 0 && n.compare === null && n.defaultProps === void 0 ? (t.tag = 15, t.type = s, Rh(e, t, s, r, i)) : (e = Ui(n.type, null, r, t, t.mode, i), e.ref = t.ref, e.return = t, t.child = e);
  }
  if (s = e.child, !(e.lanes & i)) {
    var o = s.memoizedProps;
    if (n = n.compare, n = n !== null ? n : Fr, n(o, r) && e.ref === t.ref) return pt(e, t, i);
  }
  return t.flags |= 1, e = Nt(s, r), e.ref = t.ref, e.return = t, t.child = e;
}
function Rh(e, t, n, r, i) {
  if (e !== null) {
    var s = e.memoizedProps;
    if (Fr(s, r) && e.ref === t.ref) if (Se = !1, t.pendingProps = r = s, (e.lanes & i) !== 0) e.flags & 131072 && (Se = !0);
    else return t.lanes = e.lanes, pt(e, t, i);
  }
  return fl(e, t, n, r, i);
}
function Dh(e, t, n) {
  var r = t.pendingProps, i = r.children, s = e !== null ? e.memoizedState : null;
  if (r.mode === "hidden") if (!(t.mode & 1)) t.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, O(Pn, Ce), Ce |= n;
  else {
    if (!(n & 1073741824)) return e = s !== null ? s.baseLanes | n : n, t.lanes = t.childLanes = 1073741824, t.memoizedState = { baseLanes: e, cachePool: null, transitions: null }, t.updateQueue = null, O(Pn, Ce), Ce |= e, null;
    t.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, r = s !== null ? s.baseLanes : n, O(Pn, Ce), Ce |= r;
  }
  else s !== null ? (r = s.baseLanes | n, t.memoizedState = null) : r = n, O(Pn, Ce), Ce |= r;
  return ge(e, t, i, n), t.child;
}
function Mh(e, t) {
  var n = t.ref;
  (e === null && n !== null || e !== null && e.ref !== n) && (t.flags |= 512, t.flags |= 2097152);
}
function fl(e, t, n, r, i) {
  var s = Te(n) ? rn : me.current;
  return s = In(t, s), _n(t, i), n = xa(e, t, n, r, s, i), r = wa(), e !== null && !Se ? (t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~i, pt(e, t, i)) : ($ && r && la(t), t.flags |= 1, ge(e, t, n, i), t.child);
}
function fc(e, t, n, r, i) {
  if (Te(n)) {
    var s = !0;
    ts(t);
  } else s = !1;
  if (_n(t, i), t.stateNode === null) Oi(e, t), Ch(t, n, r), ul(t, n, r, i), r = !0;
  else if (e === null) {
    var o = t.stateNode, l = t.memoizedProps;
    o.props = l;
    var a = o.context, u = n.contextType;
    typeof u == "object" && u !== null ? u = ze(u) : (u = Te(n) ? rn : me.current, u = In(t, u));
    var c = n.getDerivedStateFromProps, f = typeof c == "function" || typeof o.getSnapshotBeforeUpdate == "function";
    f || typeof o.UNSAFE_componentWillReceiveProps != "function" && typeof o.componentWillReceiveProps != "function" || (l !== r || a !== u) && sc(t, o, r, u), St = !1;
    var d = t.memoizedState;
    o.state = d, os(t, r, o, i), a = t.memoizedState, l !== r || d !== a || ke.current || St ? (typeof c == "function" && (al(t, n, c, r), a = t.memoizedState), (l = St || ic(t, n, l, r, d, a, u)) ? (f || typeof o.UNSAFE_componentWillMount != "function" && typeof o.componentWillMount != "function" || (typeof o.componentWillMount == "function" && o.componentWillMount(), typeof o.UNSAFE_componentWillMount == "function" && o.UNSAFE_componentWillMount()), typeof o.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof o.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = a), o.props = r, o.state = a, o.context = u, r = l) : (typeof o.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
  } else {
    o = t.stateNode, ih(e, t), l = t.memoizedProps, u = t.type === t.elementType ? l : We(t.type, l), o.props = u, f = t.pendingProps, d = o.context, a = n.contextType, typeof a == "object" && a !== null ? a = ze(a) : (a = Te(n) ? rn : me.current, a = In(t, a));
    var g = n.getDerivedStateFromProps;
    (c = typeof g == "function" || typeof o.getSnapshotBeforeUpdate == "function") || typeof o.UNSAFE_componentWillReceiveProps != "function" && typeof o.componentWillReceiveProps != "function" || (l !== f || d !== a) && sc(t, o, r, a), St = !1, d = t.memoizedState, o.state = d, os(t, r, o, i);
    var y = t.memoizedState;
    l !== f || d !== y || ke.current || St ? (typeof g == "function" && (al(t, n, g, r), y = t.memoizedState), (u = St || ic(t, n, u, r, d, y, a) || !1) ? (c || typeof o.UNSAFE_componentWillUpdate != "function" && typeof o.componentWillUpdate != "function" || (typeof o.componentWillUpdate == "function" && o.componentWillUpdate(r, y, a), typeof o.UNSAFE_componentWillUpdate == "function" && o.UNSAFE_componentWillUpdate(r, y, a)), typeof o.componentDidUpdate == "function" && (t.flags |= 4), typeof o.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof o.componentDidUpdate != "function" || l === e.memoizedProps && d === e.memoizedState || (t.flags |= 4), typeof o.getSnapshotBeforeUpdate != "function" || l === e.memoizedProps && d === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = y), o.props = r, o.state = y, o.context = a, r = u) : (typeof o.componentDidUpdate != "function" || l === e.memoizedProps && d === e.memoizedState || (t.flags |= 4), typeof o.getSnapshotBeforeUpdate != "function" || l === e.memoizedProps && d === e.memoizedState || (t.flags |= 1024), r = !1);
  }
  return dl(e, t, n, r, s, i);
}
function dl(e, t, n, r, i, s) {
  Mh(e, t);
  var o = (t.flags & 128) !== 0;
  if (!r && !o) return i && Zu(t, n, !1), pt(e, t, s);
  r = t.stateNode, Uy.current = t;
  var l = o && typeof n.getDerivedStateFromError != "function" ? null : r.render();
  return t.flags |= 1, e !== null && o ? (t.child = zn(t, e.child, null, s), t.child = zn(t, null, l, s)) : ge(e, t, l, s), t.memoizedState = r.state, i && Zu(t, n, !0), t.child;
}
function Vh(e) {
  var t = e.stateNode;
  t.pendingContext ? Xu(e, t.pendingContext, t.pendingContext !== t.context) : t.context && Xu(e, t.context, !1), ma(e, t.containerInfo);
}
function dc(e, t, n, r, i) {
  return On(), ua(i), t.flags |= 256, ge(e, t, n, r), t.child;
}
var hl = { dehydrated: null, treeContext: null, retryLane: 0 };
function pl(e) {
  return { baseLanes: e, cachePool: null, transitions: null };
}
function Lh(e, t, n) {
  var r = t.pendingProps, i = W.current, s = !1, o = (t.flags & 128) !== 0, l;
  if ((l = o) || (l = e !== null && e.memoizedState === null ? !1 : (i & 2) !== 0), l ? (s = !0, t.flags &= -129) : (e === null || e.memoizedState !== null) && (i |= 1), O(W, i & 1), e === null)
    return ol(t), e = t.memoizedState, e !== null && (e = e.dehydrated, e !== null) ? (t.mode & 1 ? e.data === "$!" ? t.lanes = 8 : t.lanes = 1073741824 : t.lanes = 1, null) : (o = r.children, e = r.fallback, s ? (r = t.mode, s = t.child, o = { mode: "hidden", children: o }, !(r & 1) && s !== null ? (s.childLanes = 0, s.pendingProps = o) : s = Ns(o, r, 0, null), e = tn(e, r, n, null), s.return = t, e.return = t, s.sibling = e, t.child = s, t.child.memoizedState = pl(n), t.memoizedState = hl, e) : Ta(t, o));
  if (i = e.memoizedState, i !== null && (l = i.dehydrated, l !== null)) return $y(e, t, o, r, l, i, n);
  if (s) {
    s = r.fallback, o = t.mode, i = e.child, l = i.sibling;
    var a = { mode: "hidden", children: r.children };
    return !(o & 1) && t.child !== i ? (r = t.child, r.childLanes = 0, r.pendingProps = a, t.deletions = null) : (r = Nt(i, a), r.subtreeFlags = i.subtreeFlags & 14680064), l !== null ? s = Nt(l, s) : (s = tn(s, o, n, null), s.flags |= 2), s.return = t, r.return = t, r.sibling = s, t.child = r, r = s, s = t.child, o = e.child.memoizedState, o = o === null ? pl(n) : { baseLanes: o.baseLanes | n, cachePool: null, transitions: o.transitions }, s.memoizedState = o, s.childLanes = e.childLanes & ~n, t.memoizedState = hl, r;
  }
  return s = e.child, e = s.sibling, r = Nt(s, { mode: "visible", children: r.children }), !(t.mode & 1) && (r.lanes = n), r.return = t, r.sibling = null, e !== null && (n = t.deletions, n === null ? (t.deletions = [e], t.flags |= 16) : n.push(e)), t.child = r, t.memoizedState = null, r;
}
function Ta(e, t) {
  return t = Ns({ mode: "visible", children: t }, e.mode, 0, null), t.return = e, e.child = t;
}
function ki(e, t, n, r) {
  return r !== null && ua(r), zn(t, e.child, null, n), e = Ta(t, t.pendingProps.children), e.flags |= 2, t.memoizedState = null, e;
}
function $y(e, t, n, r, i, s, o) {
  if (n)
    return t.flags & 256 ? (t.flags &= -257, r = po(Error(T(422))), ki(e, t, o, r)) : t.memoizedState !== null ? (t.child = e.child, t.flags |= 128, null) : (s = r.fallback, i = t.mode, r = Ns({ mode: "visible", children: r.children }, i, 0, null), s = tn(s, i, o, null), s.flags |= 2, r.return = t, s.return = t, r.sibling = s, t.child = r, t.mode & 1 && zn(t, e.child, null, o), t.child.memoizedState = pl(o), t.memoizedState = hl, s);
  if (!(t.mode & 1)) return ki(e, t, o, null);
  if (i.data === "$!") {
    if (r = i.nextSibling && i.nextSibling.dataset, r) var l = r.dgst;
    return r = l, s = Error(T(419)), r = po(s, r, void 0), ki(e, t, o, r);
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
      i = i & (r.suspendedLanes | o) ? 0 : i, i !== 0 && i !== s.retryLane && (s.retryLane = i, ht(e, i), Qe(r, e, i, -1));
    }
    return Da(), r = po(Error(T(421))), ki(e, t, o, r);
  }
  return i.data === "$?" ? (t.flags |= 128, t.child = e.child, t = tv.bind(null, e), i._reactRetry = t, null) : (e = s.treeContext, Ee = Dt(i.nextSibling), Ae = t, $ = !0, He = null, e !== null && (je[Fe++] = ot, je[Fe++] = lt, je[Fe++] = sn, ot = e.id, lt = e.overflow, sn = t), t = Ta(t, r.children), t.flags |= 4096, t);
}
function hc(e, t, n) {
  e.lanes |= t;
  var r = e.alternate;
  r !== null && (r.lanes |= t), ll(e.return, t, n);
}
function mo(e, t, n, r, i) {
  var s = e.memoizedState;
  s === null ? e.memoizedState = { isBackwards: t, rendering: null, renderingStartTime: 0, last: r, tail: n, tailMode: i } : (s.isBackwards = t, s.rendering = null, s.renderingStartTime = 0, s.last = r, s.tail = n, s.tailMode = i);
}
function Nh(e, t, n) {
  var r = t.pendingProps, i = r.revealOrder, s = r.tail;
  if (ge(e, t, r.children, n), r = W.current, r & 2) r = r & 1 | 2, t.flags |= 128;
  else {
    if (e !== null && e.flags & 128) e: for (e = t.child; e !== null; ) {
      if (e.tag === 13) e.memoizedState !== null && hc(e, n, t);
      else if (e.tag === 19) hc(e, n, t);
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
      for (n = t.child, i = null; n !== null; ) e = n.alternate, e !== null && ls(e) === null && (i = n), n = n.sibling;
      n = i, n === null ? (i = t.child, t.child = null) : (i = n.sibling, n.sibling = null), mo(t, !1, i, n, s);
      break;
    case "backwards":
      for (n = null, i = t.child, t.child = null; i !== null; ) {
        if (e = i.alternate, e !== null && ls(e) === null) {
          t.child = i;
          break;
        }
        e = i.sibling, i.sibling = n, n = i, i = e;
      }
      mo(t, !0, n, null, s);
      break;
    case "together":
      mo(t, !1, null, null, void 0);
      break;
    default:
      t.memoizedState = null;
  }
  return t.child;
}
function Oi(e, t) {
  !(t.mode & 1) && e !== null && (e.alternate = null, t.alternate = null, t.flags |= 2);
}
function pt(e, t, n) {
  if (e !== null && (t.dependencies = e.dependencies), ln |= t.lanes, !(n & t.childLanes)) return null;
  if (e !== null && t.child !== e.child) throw Error(T(153));
  if (t.child !== null) {
    for (e = t.child, n = Nt(e, e.pendingProps), t.child = n, n.return = t; e.sibling !== null; ) e = e.sibling, n = n.sibling = Nt(e, e.pendingProps), n.return = t;
    n.sibling = null;
  }
  return t.child;
}
function Wy(e, t, n) {
  switch (t.tag) {
    case 3:
      Vh(t), On();
      break;
    case 5:
      sh(t);
      break;
    case 1:
      Te(t.type) && ts(t);
      break;
    case 4:
      ma(t, t.stateNode.containerInfo);
      break;
    case 10:
      var r = t.type._context, i = t.memoizedProps.value;
      O(is, r._currentValue), r._currentValue = i;
      break;
    case 13:
      if (r = t.memoizedState, r !== null)
        return r.dehydrated !== null ? (O(W, W.current & 1), t.flags |= 128, null) : n & t.child.childLanes ? Lh(e, t, n) : (O(W, W.current & 1), e = pt(e, t, n), e !== null ? e.sibling : null);
      O(W, W.current & 1);
      break;
    case 19:
      if (r = (n & t.childLanes) !== 0, e.flags & 128) {
        if (r) return Nh(e, t, n);
        t.flags |= 128;
      }
      if (i = t.memoizedState, i !== null && (i.rendering = null, i.tail = null, i.lastEffect = null), O(W, W.current), r) break;
      return null;
    case 22:
    case 23:
      return t.lanes = 0, Dh(e, t, n);
  }
  return pt(e, t, n);
}
var _h, ml, jh, Fh;
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
ml = function() {
};
jh = function(e, t, n, r) {
  var i = e.memoizedProps;
  if (i !== r) {
    e = t.stateNode, Jt(et.current);
    var s = null;
    switch (n) {
      case "input":
        i = Io(e, i), r = Io(e, r), s = [];
        break;
      case "select":
        i = G({}, i, { value: void 0 }), r = G({}, r, { value: void 0 }), s = [];
        break;
      case "textarea":
        i = Bo(e, i), r = Bo(e, r), s = [];
        break;
      default:
        typeof i.onClick != "function" && typeof r.onClick == "function" && (e.onclick = bi);
    }
    $o(n, r);
    var o;
    n = null;
    for (u in i) if (!r.hasOwnProperty(u) && i.hasOwnProperty(u) && i[u] != null) if (u === "style") {
      var l = i[u];
      for (o in l) l.hasOwnProperty(o) && (n || (n = {}), n[o] = "");
    } else u !== "dangerouslySetInnerHTML" && u !== "children" && u !== "suppressContentEditableWarning" && u !== "suppressHydrationWarning" && u !== "autoFocus" && (Dr.hasOwnProperty(u) ? s || (s = []) : (s = s || []).push(u, null));
    for (u in r) {
      var a = r[u];
      if (l = i?.[u], r.hasOwnProperty(u) && a !== l && (a != null || l != null)) if (u === "style") if (l) {
        for (o in l) !l.hasOwnProperty(o) || a && a.hasOwnProperty(o) || (n || (n = {}), n[o] = "");
        for (o in a) a.hasOwnProperty(o) && l[o] !== a[o] && (n || (n = {}), n[o] = a[o]);
      } else n || (s || (s = []), s.push(
        u,
        n
      )), n = a;
      else u === "dangerouslySetInnerHTML" ? (a = a ? a.__html : void 0, l = l ? l.__html : void 0, a != null && l !== a && (s = s || []).push(u, a)) : u === "children" ? typeof a != "string" && typeof a != "number" || (s = s || []).push(u, "" + a) : u !== "suppressContentEditableWarning" && u !== "suppressHydrationWarning" && (Dr.hasOwnProperty(u) ? (a != null && u === "onScroll" && z("scroll", e), s || l === a || (s = [])) : (s = s || []).push(u, a));
    }
    n && (s = s || []).push("style", n);
    var u = s;
    (t.updateQueue = u) && (t.flags |= 4);
  }
};
Fh = function(e, t, n, r) {
  n !== r && (t.flags |= 4);
};
function sr(e, t) {
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
function Ky(e, t, n) {
  var r = t.pendingProps;
  switch (aa(t), t.tag) {
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
      return Te(t.type) && es(), fe(t), null;
    case 3:
      return r = t.stateNode, Bn(), B(ke), B(me), ya(), r.pendingContext && (r.context = r.pendingContext, r.pendingContext = null), (e === null || e.child === null) && (wi(t) ? t.flags |= 4 : e === null || e.memoizedState.isDehydrated && !(t.flags & 256) || (t.flags |= 1024, He !== null && (Tl(He), He = null))), ml(e, t), fe(t), null;
    case 5:
      ga(t);
      var i = Jt(Ur.current);
      if (n = t.type, e !== null && t.stateNode != null) jh(e, t, n, r, i), e.ref !== t.ref && (t.flags |= 512, t.flags |= 2097152);
      else {
        if (!r) {
          if (t.stateNode === null) throw Error(T(166));
          return fe(t), null;
        }
        if (e = Jt(et.current), wi(t)) {
          r = t.stateNode, n = t.type;
          var s = t.memoizedProps;
          switch (r[Je] = t, r[zr] = s, e = (t.mode & 1) !== 0, n) {
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
              for (i = 0; i < dr.length; i++) z(dr[i], r);
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
              ku(r, s), z("invalid", r);
              break;
            case "select":
              r._wrapperState = { wasMultiple: !!s.multiple }, z("invalid", r);
              break;
            case "textarea":
              Pu(r, s), z("invalid", r);
          }
          $o(n, s), i = null;
          for (var o in s) if (s.hasOwnProperty(o)) {
            var l = s[o];
            o === "children" ? typeof l == "string" ? r.textContent !== l && (s.suppressHydrationWarning !== !0 && xi(r.textContent, l, e), i = ["children", l]) : typeof l == "number" && r.textContent !== "" + l && (s.suppressHydrationWarning !== !0 && xi(
              r.textContent,
              l,
              e
            ), i = ["children", "" + l]) : Dr.hasOwnProperty(o) && l != null && o === "onScroll" && z("scroll", r);
          }
          switch (n) {
            case "input":
              fi(r), Tu(r, s, !0);
              break;
            case "textarea":
              fi(r), Cu(r);
              break;
            case "select":
            case "option":
              break;
            default:
              typeof s.onClick == "function" && (r.onclick = bi);
          }
          r = i, t.updateQueue = r, r !== null && (t.flags |= 4);
        } else {
          o = i.nodeType === 9 ? i : i.ownerDocument, e === "http://www.w3.org/1999/xhtml" && (e = cd(n)), e === "http://www.w3.org/1999/xhtml" ? n === "script" ? (e = o.createElement("div"), e.innerHTML = "<script><\/script>", e = e.removeChild(e.firstChild)) : typeof r.is == "string" ? e = o.createElement(n, { is: r.is }) : (e = o.createElement(n), n === "select" && (o = e, r.multiple ? o.multiple = !0 : r.size && (o.size = r.size))) : e = o.createElementNS(e, n), e[Je] = t, e[zr] = r, _h(e, t, !1, !1), t.stateNode = e;
          e: {
            switch (o = Wo(n, r), n) {
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
                for (i = 0; i < dr.length; i++) z(dr[i], e);
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
                ku(e, r), i = Io(e, r), z("invalid", e);
                break;
              case "option":
                i = r;
                break;
              case "select":
                e._wrapperState = { wasMultiple: !!r.multiple }, i = G({}, r, { value: void 0 }), z("invalid", e);
                break;
              case "textarea":
                Pu(e, r), i = Bo(e, r), z("invalid", e);
                break;
              default:
                i = r;
            }
            $o(n, i), l = i;
            for (s in l) if (l.hasOwnProperty(s)) {
              var a = l[s];
              s === "style" ? hd(e, a) : s === "dangerouslySetInnerHTML" ? (a = a ? a.__html : void 0, a != null && fd(e, a)) : s === "children" ? typeof a == "string" ? (n !== "textarea" || a !== "") && Mr(e, a) : typeof a == "number" && Mr(e, "" + a) : s !== "suppressContentEditableWarning" && s !== "suppressHydrationWarning" && s !== "autoFocus" && (Dr.hasOwnProperty(s) ? a != null && s === "onScroll" && z("scroll", e) : a != null && Ql(e, s, a, o));
            }
            switch (n) {
              case "input":
                fi(e), Tu(e, r, !1);
                break;
              case "textarea":
                fi(e), Cu(e);
                break;
              case "option":
                r.value != null && e.setAttribute("value", "" + _t(r.value));
                break;
              case "select":
                e.multiple = !!r.multiple, s = r.value, s != null ? Mn(e, !!r.multiple, s, !1) : r.defaultValue != null && Mn(
                  e,
                  !!r.multiple,
                  r.defaultValue,
                  !0
                );
                break;
              default:
                typeof i.onClick == "function" && (e.onclick = bi);
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
      if (e && t.stateNode != null) Fh(e, t, e.memoizedProps, r);
      else {
        if (typeof r != "string" && t.stateNode === null) throw Error(T(166));
        if (n = Jt(Ur.current), Jt(et.current), wi(t)) {
          if (r = t.stateNode, n = t.memoizedProps, r[Je] = t, (s = r.nodeValue !== n) && (e = Ae, e !== null)) switch (e.tag) {
            case 3:
              xi(r.nodeValue, n, (e.mode & 1) !== 0);
              break;
            case 5:
              e.memoizedProps.suppressHydrationWarning !== !0 && xi(r.nodeValue, n, (e.mode & 1) !== 0);
          }
          s && (t.flags |= 4);
        } else r = (n.nodeType === 9 ? n : n.ownerDocument).createTextNode(r), r[Je] = t, t.stateNode = r;
      }
      return fe(t), null;
    case 13:
      if (B(W), r = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
        if ($ && Ee !== null && t.mode & 1 && !(t.flags & 128)) eh(), On(), t.flags |= 98560, s = !1;
        else if (s = wi(t), r !== null && r.dehydrated !== null) {
          if (e === null) {
            if (!s) throw Error(T(318));
            if (s = t.memoizedState, s = s !== null ? s.dehydrated : null, !s) throw Error(T(317));
            s[Je] = t;
          } else On(), !(t.flags & 128) && (t.memoizedState = null), t.flags |= 4;
          fe(t), s = !1;
        } else He !== null && (Tl(He), He = null), s = !0;
        if (!s) return t.flags & 65536 ? t : null;
      }
      return t.flags & 128 ? (t.lanes = n, t) : (r = r !== null, r !== (e !== null && e.memoizedState !== null) && r && (t.child.flags |= 8192, t.mode & 1 && (e === null || W.current & 1 ? te === 0 && (te = 3) : Da())), t.updateQueue !== null && (t.flags |= 4), fe(t), null);
    case 4:
      return Bn(), ml(e, t), e === null && Ir(t.stateNode.containerInfo), fe(t), null;
    case 10:
      return da(t.type._context), fe(t), null;
    case 17:
      return Te(t.type) && es(), fe(t), null;
    case 19:
      if (B(W), s = t.memoizedState, s === null) return fe(t), null;
      if (r = (t.flags & 128) !== 0, o = s.rendering, o === null) if (r) sr(s, !1);
      else {
        if (te !== 0 || e !== null && e.flags & 128) for (e = t.child; e !== null; ) {
          if (o = ls(e), o !== null) {
            for (t.flags |= 128, sr(s, !1), r = o.updateQueue, r !== null && (t.updateQueue = r, t.flags |= 4), t.subtreeFlags = 0, r = n, n = t.child; n !== null; ) s = n, e = r, s.flags &= 14680066, o = s.alternate, o === null ? (s.childLanes = 0, s.lanes = e, s.child = null, s.subtreeFlags = 0, s.memoizedProps = null, s.memoizedState = null, s.updateQueue = null, s.dependencies = null, s.stateNode = null) : (s.childLanes = o.childLanes, s.lanes = o.lanes, s.child = o.child, s.subtreeFlags = 0, s.deletions = null, s.memoizedProps = o.memoizedProps, s.memoizedState = o.memoizedState, s.updateQueue = o.updateQueue, s.type = o.type, e = o.dependencies, s.dependencies = e === null ? null : { lanes: e.lanes, firstContext: e.firstContext }), n = n.sibling;
            return O(W, W.current & 1 | 2), t.child;
          }
          e = e.sibling;
        }
        s.tail !== null && q() > $n && (t.flags |= 128, r = !0, sr(s, !1), t.lanes = 4194304);
      }
      else {
        if (!r) if (e = ls(o), e !== null) {
          if (t.flags |= 128, r = !0, n = e.updateQueue, n !== null && (t.updateQueue = n, t.flags |= 4), sr(s, !0), s.tail === null && s.tailMode === "hidden" && !o.alternate && !$) return fe(t), null;
        } else 2 * q() - s.renderingStartTime > $n && n !== 1073741824 && (t.flags |= 128, r = !0, sr(s, !1), t.lanes = 4194304);
        s.isBackwards ? (o.sibling = t.child, t.child = o) : (n = s.last, n !== null ? n.sibling = o : t.child = o, s.last = o);
      }
      return s.tail !== null ? (t = s.tail, s.rendering = t, s.tail = t.sibling, s.renderingStartTime = q(), t.sibling = null, n = W.current, O(W, r ? n & 1 | 2 : n & 1), t) : (fe(t), null);
    case 22:
    case 23:
      return Ra(), r = t.memoizedState !== null, e !== null && e.memoizedState !== null !== r && (t.flags |= 8192), r && t.mode & 1 ? Ce & 1073741824 && (fe(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : fe(t), null;
    case 24:
      return null;
    case 25:
      return null;
  }
  throw Error(T(156, t.tag));
}
function Hy(e, t) {
  switch (aa(t), t.tag) {
    case 1:
      return Te(t.type) && es(), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
    case 3:
      return Bn(), B(ke), B(me), ya(), e = t.flags, e & 65536 && !(e & 128) ? (t.flags = e & -65537 | 128, t) : null;
    case 5:
      return ga(t), null;
    case 13:
      if (B(W), e = t.memoizedState, e !== null && e.dehydrated !== null) {
        if (t.alternate === null) throw Error(T(340));
        On();
      }
      return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
    case 19:
      return B(W), null;
    case 4:
      return Bn(), null;
    case 10:
      return da(t.type._context), null;
    case 22:
    case 23:
      return Ra(), null;
    case 24:
      return null;
    default:
      return null;
  }
}
var Ti = !1, he = !1, Gy = typeof WeakSet == "function" ? WeakSet : Set, D = null;
function Tn(e, t) {
  var n = e.ref;
  if (n !== null) if (typeof n == "function") try {
    n(null);
  } catch (r) {
    Y(e, t, r);
  }
  else n.current = null;
}
function gl(e, t, n) {
  try {
    n();
  } catch (r) {
    Y(e, t, r);
  }
}
var pc = !1;
function Qy(e, t) {
  if (bo = Zi, e = Ud(), oa(e)) {
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
  for (el = { focusedElem: e, selectionRange: n }, Zi = !1, D = t; D !== null; ) if (t = D, e = t.child, (t.subtreeFlags & 1028) !== 0 && e !== null) e.return = t, D = e;
  else for (; D !== null; ) {
    t = D;
    try {
      var y = t.alternate;
      if (t.flags & 1024) switch (t.tag) {
        case 0:
        case 11:
        case 15:
          break;
        case 1:
          if (y !== null) {
            var v = y.memoizedProps, S = y.memoizedState, p = t.stateNode, h = p.getSnapshotBeforeUpdate(t.elementType === t.type ? v : We(t.type, v), S);
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
      Y(t, t.return, x);
    }
    if (e = t.sibling, e !== null) {
      e.return = t.return, D = e;
      break;
    }
    D = t.return;
  }
  return y = pc, pc = !1, y;
}
function kr(e, t, n) {
  var r = t.updateQueue;
  if (r = r !== null ? r.lastEffect : null, r !== null) {
    var i = r = r.next;
    do {
      if ((i.tag & e) === e) {
        var s = i.destroy;
        i.destroy = void 0, s !== void 0 && gl(t, n, s);
      }
      i = i.next;
    } while (i !== r);
  }
}
function Vs(e, t) {
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
function Ih(e) {
  var t = e.alternate;
  t !== null && (e.alternate = null, Ih(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && (delete t[Je], delete t[zr], delete t[rl], delete t[Dy], delete t[My])), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
}
function Oh(e) {
  return e.tag === 5 || e.tag === 3 || e.tag === 4;
}
function mc(e) {
  e: for (; ; ) {
    for (; e.sibling === null; ) {
      if (e.return === null || Oh(e.return)) return null;
      e = e.return;
    }
    for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
      if (e.flags & 2 || e.child === null || e.tag === 4) continue e;
      e.child.return = e, e = e.child;
    }
    if (!(e.flags & 2)) return e.stateNode;
  }
}
function vl(e, t, n) {
  var r = e.tag;
  if (r === 5 || r === 6) e = e.stateNode, t ? n.nodeType === 8 ? n.parentNode.insertBefore(e, t) : n.insertBefore(e, t) : (n.nodeType === 8 ? (t = n.parentNode, t.insertBefore(e, n)) : (t = n, t.appendChild(e)), n = n._reactRootContainer, n != null || t.onclick !== null || (t.onclick = bi));
  else if (r !== 4 && (e = e.child, e !== null)) for (vl(e, t, n), e = e.sibling; e !== null; ) vl(e, t, n), e = e.sibling;
}
function xl(e, t, n) {
  var r = e.tag;
  if (r === 5 || r === 6) e = e.stateNode, t ? n.insertBefore(e, t) : n.appendChild(e);
  else if (r !== 4 && (e = e.child, e !== null)) for (xl(e, t, n), e = e.sibling; e !== null; ) xl(e, t, n), e = e.sibling;
}
var oe = null, Ke = !1;
function vt(e, t, n) {
  for (n = n.child; n !== null; ) zh(e, t, n), n = n.sibling;
}
function zh(e, t, n) {
  if (be && typeof be.onCommitFiberUnmount == "function") try {
    be.onCommitFiberUnmount(Ts, n);
  } catch {
  }
  switch (n.tag) {
    case 5:
      he || Tn(n, t);
    case 6:
      var r = oe, i = Ke;
      oe = null, vt(e, t, n), oe = r, Ke = i, oe !== null && (Ke ? (e = oe, n = n.stateNode, e.nodeType === 8 ? e.parentNode.removeChild(n) : e.removeChild(n)) : oe.removeChild(n.stateNode));
      break;
    case 18:
      oe !== null && (Ke ? (e = oe, n = n.stateNode, e.nodeType === 8 ? lo(e.parentNode, n) : e.nodeType === 1 && lo(e, n), _r(e)) : lo(oe, n.stateNode));
      break;
    case 4:
      r = oe, i = Ke, oe = n.stateNode.containerInfo, Ke = !0, vt(e, t, n), oe = r, Ke = i;
      break;
    case 0:
    case 11:
    case 14:
    case 15:
      if (!he && (r = n.updateQueue, r !== null && (r = r.lastEffect, r !== null))) {
        i = r = r.next;
        do {
          var s = i, o = s.destroy;
          s = s.tag, o !== void 0 && (s & 2 || s & 4) && gl(n, t, o), i = i.next;
        } while (i !== r);
      }
      vt(e, t, n);
      break;
    case 1:
      if (!he && (Tn(n, t), r = n.stateNode, typeof r.componentWillUnmount == "function")) try {
        r.props = n.memoizedProps, r.state = n.memoizedState, r.componentWillUnmount();
      } catch (l) {
        Y(n, t, l);
      }
      vt(e, t, n);
      break;
    case 21:
      vt(e, t, n);
      break;
    case 22:
      n.mode & 1 ? (he = (r = he) || n.memoizedState !== null, vt(e, t, n), he = r) : vt(e, t, n);
      break;
    default:
      vt(e, t, n);
  }
}
function gc(e) {
  var t = e.updateQueue;
  if (t !== null) {
    e.updateQueue = null;
    var n = e.stateNode;
    n === null && (n = e.stateNode = new Gy()), t.forEach(function(r) {
      var i = nv.bind(null, e, r);
      n.has(r) || (n.add(r), r.then(i, i));
    });
  }
}
function Ue(e, t) {
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
      zh(s, o, i), oe = null, Ke = !1;
      var a = i.alternate;
      a !== null && (a.return = null), i.return = null;
    } catch (u) {
      Y(i, t, u);
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
      if (Ue(t, e), Ze(e), r & 4) {
        try {
          kr(3, e, e.return), Vs(3, e);
        } catch (v) {
          Y(e, e.return, v);
        }
        try {
          kr(5, e, e.return);
        } catch (v) {
          Y(e, e.return, v);
        }
      }
      break;
    case 1:
      Ue(t, e), Ze(e), r & 512 && n !== null && Tn(n, n.return);
      break;
    case 5:
      if (Ue(t, e), Ze(e), r & 512 && n !== null && Tn(n, n.return), e.flags & 32) {
        var i = e.stateNode;
        try {
          Mr(i, "");
        } catch (v) {
          Y(e, e.return, v);
        }
      }
      if (r & 4 && (i = e.stateNode, i != null)) {
        var s = e.memoizedProps, o = n !== null ? n.memoizedProps : s, l = e.type, a = e.updateQueue;
        if (e.updateQueue = null, a !== null) try {
          l === "input" && s.type === "radio" && s.name != null && ad(i, s), Wo(l, o);
          var u = Wo(l, s);
          for (o = 0; o < a.length; o += 2) {
            var c = a[o], f = a[o + 1];
            c === "style" ? hd(i, f) : c === "dangerouslySetInnerHTML" ? fd(i, f) : c === "children" ? Mr(i, f) : Ql(i, c, f, u);
          }
          switch (l) {
            case "input":
              Oo(i, s);
              break;
            case "textarea":
              ud(i, s);
              break;
            case "select":
              var d = i._wrapperState.wasMultiple;
              i._wrapperState.wasMultiple = !!s.multiple;
              var g = s.value;
              g != null ? Mn(i, !!s.multiple, g, !1) : d !== !!s.multiple && (s.defaultValue != null ? Mn(
                i,
                !!s.multiple,
                s.defaultValue,
                !0
              ) : Mn(i, !!s.multiple, s.multiple ? [] : "", !1));
          }
          i[zr] = s;
        } catch (v) {
          Y(e, e.return, v);
        }
      }
      break;
    case 6:
      if (Ue(t, e), Ze(e), r & 4) {
        if (e.stateNode === null) throw Error(T(162));
        i = e.stateNode, s = e.memoizedProps;
        try {
          i.nodeValue = s;
        } catch (v) {
          Y(e, e.return, v);
        }
      }
      break;
    case 3:
      if (Ue(t, e), Ze(e), r & 4 && n !== null && n.memoizedState.isDehydrated) try {
        _r(t.containerInfo);
      } catch (v) {
        Y(e, e.return, v);
      }
      break;
    case 4:
      Ue(t, e), Ze(e);
      break;
    case 13:
      Ue(t, e), Ze(e), i = e.child, i.flags & 8192 && (s = i.memoizedState !== null, i.stateNode.isHidden = s, !s || i.alternate !== null && i.alternate.memoizedState !== null || (Ea = q())), r & 4 && gc(e);
      break;
    case 22:
      if (c = n !== null && n.memoizedState !== null, e.mode & 1 ? (he = (u = he) || c, Ue(t, e), he = u) : Ue(t, e), Ze(e), r & 8192) {
        if (u = e.memoizedState !== null, (e.stateNode.isHidden = u) && !c && e.mode & 1) for (D = e, c = e.child; c !== null; ) {
          for (f = D = c; D !== null; ) {
            switch (d = D, g = d.child, d.tag) {
              case 0:
              case 11:
              case 14:
              case 15:
                kr(4, d, d.return);
                break;
              case 1:
                Tn(d, d.return);
                var y = d.stateNode;
                if (typeof y.componentWillUnmount == "function") {
                  r = d, n = d.return;
                  try {
                    t = r, y.props = t.memoizedProps, y.state = t.memoizedState, y.componentWillUnmount();
                  } catch (v) {
                    Y(r, n, v);
                  }
                }
                break;
              case 5:
                Tn(d, d.return);
                break;
              case 22:
                if (d.memoizedState !== null) {
                  vc(f);
                  continue;
                }
            }
            g !== null ? (g.return = d, D = g) : vc(f);
          }
          c = c.sibling;
        }
        e: for (c = null, f = e; ; ) {
          if (f.tag === 5) {
            if (c === null) {
              c = f;
              try {
                i = f.stateNode, u ? (s = i.style, typeof s.setProperty == "function" ? s.setProperty("display", "none", "important") : s.display = "none") : (l = f.stateNode, a = f.memoizedProps.style, o = a != null && a.hasOwnProperty("display") ? a.display : null, l.style.display = dd("display", o));
              } catch (v) {
                Y(e, e.return, v);
              }
            }
          } else if (f.tag === 6) {
            if (c === null) try {
              f.stateNode.nodeValue = u ? "" : f.memoizedProps;
            } catch (v) {
              Y(e, e.return, v);
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
      Ue(t, e), Ze(e), r & 4 && gc(e);
      break;
    case 21:
      break;
    default:
      Ue(
        t,
        e
      ), Ze(e);
  }
}
function Ze(e) {
  var t = e.flags;
  if (t & 2) {
    try {
      e: {
        for (var n = e.return; n !== null; ) {
          if (Oh(n)) {
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
          r.flags & 32 && (Mr(i, ""), r.flags &= -33);
          var s = mc(e);
          xl(e, s, i);
          break;
        case 3:
        case 4:
          var o = r.stateNode.containerInfo, l = mc(e);
          vl(e, l, o);
          break;
        default:
          throw Error(T(161));
      }
    } catch (a) {
      Y(e, e.return, a);
    }
    e.flags &= -3;
  }
  t & 4096 && (e.flags &= -4097);
}
function Yy(e, t, n) {
  D = e, Uh(e);
}
function Uh(e, t, n) {
  for (var r = (e.mode & 1) !== 0; D !== null; ) {
    var i = D, s = i.child;
    if (i.tag === 22 && r) {
      var o = i.memoizedState !== null || Ti;
      if (!o) {
        var l = i.alternate, a = l !== null && l.memoizedState !== null || he;
        l = Ti;
        var u = he;
        if (Ti = o, (he = a) && !u) for (D = i; D !== null; ) o = D, a = o.child, o.tag === 22 && o.memoizedState !== null ? xc(i) : a !== null ? (a.return = o, D = a) : xc(i);
        for (; s !== null; ) D = s, Uh(s), s = s.sibling;
        D = i, Ti = l, he = u;
      }
      yc(e);
    } else i.subtreeFlags & 8772 && s !== null ? (s.return = i, D = s) : yc(e);
  }
}
function yc(e) {
  for (; D !== null; ) {
    var t = D;
    if (t.flags & 8772) {
      var n = t.alternate;
      try {
        if (t.flags & 8772) switch (t.tag) {
          case 0:
          case 11:
          case 15:
            he || Vs(5, t);
            break;
          case 1:
            var r = t.stateNode;
            if (t.flags & 4 && !he) if (n === null) r.componentDidMount();
            else {
              var i = t.elementType === t.type ? n.memoizedProps : We(t.type, n.memoizedProps);
              r.componentDidUpdate(i, n.memoizedState, r.__reactInternalSnapshotBeforeUpdate);
            }
            var s = t.updateQueue;
            s !== null && tc(t, s, r);
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
              tc(t, o, n);
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
        Y(t, t.return, d);
      }
    }
    if (t === e) {
      D = null;
      break;
    }
    if (n = t.sibling, n !== null) {
      n.return = t.return, D = n;
      break;
    }
    D = t.return;
  }
}
function vc(e) {
  for (; D !== null; ) {
    var t = D;
    if (t === e) {
      D = null;
      break;
    }
    var n = t.sibling;
    if (n !== null) {
      n.return = t.return, D = n;
      break;
    }
    D = t.return;
  }
}
function xc(e) {
  for (; D !== null; ) {
    var t = D;
    try {
      switch (t.tag) {
        case 0:
        case 11:
        case 15:
          var n = t.return;
          try {
            Vs(4, t);
          } catch (a) {
            Y(t, n, a);
          }
          break;
        case 1:
          var r = t.stateNode;
          if (typeof r.componentDidMount == "function") {
            var i = t.return;
            try {
              r.componentDidMount();
            } catch (a) {
              Y(t, i, a);
            }
          }
          var s = t.return;
          try {
            yl(t);
          } catch (a) {
            Y(t, s, a);
          }
          break;
        case 5:
          var o = t.return;
          try {
            yl(t);
          } catch (a) {
            Y(t, o, a);
          }
      }
    } catch (a) {
      Y(t, t.return, a);
    }
    if (t === e) {
      D = null;
      break;
    }
    var l = t.sibling;
    if (l !== null) {
      l.return = t.return, D = l;
      break;
    }
    D = t.return;
  }
}
var Xy = Math.ceil, cs = gt.ReactCurrentDispatcher, Pa = gt.ReactCurrentOwner, Oe = gt.ReactCurrentBatchConfig, F = 0, se = null, J = null, ae = 0, Ce = 0, Pn = zt(0), te = 0, Hr = null, ln = 0, Ls = 0, Ca = 0, Tr = null, we = null, Ea = 0, $n = 1 / 0, it = null, fs = !1, wl = null, Vt = null, Pi = !1, Ct = null, ds = 0, Pr = 0, Sl = null, zi = -1, Bi = 0;
function ye() {
  return F & 6 ? q() : zi !== -1 ? zi : zi = q();
}
function Lt(e) {
  return e.mode & 1 ? F & 2 && ae !== 0 ? ae & -ae : Ly.transition !== null ? (Bi === 0 && (Bi = Cd()), Bi) : (e = I, e !== 0 || (e = window.event, e = e === void 0 ? 16 : Ld(e.type)), e) : 1;
}
function Qe(e, t, n, r) {
  if (50 < Pr) throw Pr = 0, Sl = null, Error(T(185));
  Jr(e, n, r), (!(F & 2) || e !== se) && (e === se && (!(F & 2) && (Ls |= n), te === 4 && Tt(e, ae)), Pe(e, r), n === 1 && F === 0 && !(t.mode & 1) && ($n = q() + 500, Rs && Bt()));
}
function Pe(e, t) {
  var n = e.callbackNode;
  Lg(e, t);
  var r = Xi(e, e === se ? ae : 0);
  if (r === 0) n !== null && Ru(n), e.callbackNode = null, e.callbackPriority = 0;
  else if (t = r & -r, e.callbackPriority !== t) {
    if (n != null && Ru(n), t === 1) e.tag === 0 ? Vy(wc.bind(null, e)) : qd(wc.bind(null, e)), Ay(function() {
      !(F & 6) && Bt();
    }), n = null;
    else {
      switch (Ed(r)) {
        case 1:
          n = Jl;
          break;
        case 4:
          n = Td;
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
      n = Xh(n, $h.bind(null, e));
    }
    e.callbackPriority = t, e.callbackNode = n;
  }
}
function $h(e, t) {
  if (zi = -1, Bi = 0, F & 6) throw Error(T(327));
  var n = e.callbackNode;
  if (jn() && e.callbackNode !== n) return null;
  var r = Xi(e, e === se ? ae : 0);
  if (r === 0) return null;
  if (r & 30 || r & e.expiredLanes || t) t = hs(e, r);
  else {
    t = r;
    var i = F;
    F |= 2;
    var s = Kh();
    (se !== e || ae !== t) && (it = null, $n = q() + 500, en(e, t));
    do
      try {
        Jy();
        break;
      } catch (l) {
        Wh(e, l);
      }
    while (!0);
    fa(), cs.current = s, F = i, J !== null ? t = 0 : (se = null, ae = 0, t = te);
  }
  if (t !== 0) {
    if (t === 2 && (i = Yo(e), i !== 0 && (r = i, t = kl(e, i))), t === 1) throw n = Hr, en(e, 0), Tt(e, r), Pe(e, q()), n;
    if (t === 6) Tt(e, r);
    else {
      if (i = e.current.alternate, !(r & 30) && !Zy(i) && (t = hs(e, r), t === 2 && (s = Yo(e), s !== 0 && (r = s, t = kl(e, s))), t === 1)) throw n = Hr, en(e, 0), Tt(e, r), Pe(e, q()), n;
      switch (e.finishedWork = i, e.finishedLanes = r, t) {
        case 0:
        case 1:
          throw Error(T(345));
        case 2:
          Qt(e, we, it);
          break;
        case 3:
          if (Tt(e, r), (r & 130023424) === r && (t = Ea + 500 - q(), 10 < t)) {
            if (Xi(e, 0) !== 0) break;
            if (i = e.suspendedLanes, (i & r) !== r) {
              ye(), e.pingedLanes |= e.suspendedLanes & i;
              break;
            }
            e.timeoutHandle = nl(Qt.bind(null, e, we, it), t);
            break;
          }
          Qt(e, we, it);
          break;
        case 4:
          if (Tt(e, r), (r & 4194240) === r) break;
          for (t = e.eventTimes, i = -1; 0 < r; ) {
            var o = 31 - Ge(r);
            s = 1 << o, o = t[o], o > i && (i = o), r &= ~s;
          }
          if (r = i, r = q() - r, r = (120 > r ? 120 : 480 > r ? 480 : 1080 > r ? 1080 : 1920 > r ? 1920 : 3e3 > r ? 3e3 : 4320 > r ? 4320 : 1960 * Xy(r / 1960)) - r, 10 < r) {
            e.timeoutHandle = nl(Qt.bind(null, e, we, it), r);
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
  return Pe(e, q()), e.callbackNode === n ? $h.bind(null, e) : null;
}
function kl(e, t) {
  var n = Tr;
  return e.current.memoizedState.isDehydrated && (en(e, t).flags |= 256), e = hs(e, t), e !== 2 && (t = we, we = n, t !== null && Tl(t)), e;
}
function Tl(e) {
  we === null ? we = e : we.push.apply(we, e);
}
function Zy(e) {
  for (var t = e; ; ) {
    if (t.flags & 16384) {
      var n = t.updateQueue;
      if (n !== null && (n = n.stores, n !== null)) for (var r = 0; r < n.length; r++) {
        var i = n[r], s = i.getSnapshot;
        i = i.value;
        try {
          if (!Xe(s(), i)) return !1;
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
function Tt(e, t) {
  for (t &= ~Ca, t &= ~Ls, e.suspendedLanes |= t, e.pingedLanes &= ~t, e = e.expirationTimes; 0 < t; ) {
    var n = 31 - Ge(t), r = 1 << n;
    e[n] = -1, t &= ~r;
  }
}
function wc(e) {
  if (F & 6) throw Error(T(327));
  jn();
  var t = Xi(e, 0);
  if (!(t & 1)) return Pe(e, q()), null;
  var n = hs(e, t);
  if (e.tag !== 0 && n === 2) {
    var r = Yo(e);
    r !== 0 && (t = r, n = kl(e, r));
  }
  if (n === 1) throw n = Hr, en(e, 0), Tt(e, t), Pe(e, q()), n;
  if (n === 6) throw Error(T(345));
  return e.finishedWork = e.current.alternate, e.finishedLanes = t, Qt(e, we, it), Pe(e, q()), null;
}
function Aa(e, t) {
  var n = F;
  F |= 1;
  try {
    return e(t);
  } finally {
    F = n, F === 0 && ($n = q() + 500, Rs && Bt());
  }
}
function an(e) {
  Ct !== null && Ct.tag === 0 && !(F & 6) && jn();
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
  Ce = Pn.current, B(Pn);
}
function en(e, t) {
  e.finishedWork = null, e.finishedLanes = 0;
  var n = e.timeoutHandle;
  if (n !== -1 && (e.timeoutHandle = -1, Ey(n)), J !== null) for (n = J.return; n !== null; ) {
    var r = n;
    switch (aa(r), r.tag) {
      case 1:
        r = r.type.childContextTypes, r != null && es();
        break;
      case 3:
        Bn(), B(ke), B(me), ya();
        break;
      case 5:
        ga(r);
        break;
      case 4:
        Bn();
        break;
      case 13:
        B(W);
        break;
      case 19:
        B(W);
        break;
      case 10:
        da(r.type._context);
        break;
      case 22:
      case 23:
        Ra();
    }
    n = n.return;
  }
  if (se = e, J = e = Nt(e.current, null), ae = Ce = t, te = 0, Hr = null, Ca = Ls = ln = 0, we = Tr = null, qt !== null) {
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
function Wh(e, t) {
  do {
    var n = J;
    try {
      if (fa(), Fi.current = us, as) {
        for (var r = H.memoizedState; r !== null; ) {
          var i = r.queue;
          i !== null && (i.pending = null), r = r.next;
        }
        as = !1;
      }
      if (on = 0, ie = ee = H = null, Sr = !1, $r = 0, Pa.current = null, n === null || n.return === null) {
        te = 1, Hr = t, J = null;
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
          var g = lc(o);
          if (g !== null) {
            g.flags &= -257, ac(g, o, l, s, t), g.mode & 1 && oc(s, u, t), t = g, a = u;
            var y = t.updateQueue;
            if (y === null) {
              var v = /* @__PURE__ */ new Set();
              v.add(a), t.updateQueue = v;
            } else y.add(a);
            break e;
          } else {
            if (!(t & 1)) {
              oc(s, u, t), Da();
              break e;
            }
            a = Error(T(426));
          }
        } else if ($ && l.mode & 1) {
          var S = lc(o);
          if (S !== null) {
            !(S.flags & 65536) && (S.flags |= 256), ac(S, o, l, s, t), ua(Un(a, l));
            break e;
          }
        }
        s = a = Un(a, l), te !== 4 && (te = 2), Tr === null ? Tr = [s] : Tr.push(s), s = o;
        do {
          switch (s.tag) {
            case 3:
              s.flags |= 65536, t &= -t, s.lanes |= t;
              var p = Eh(s, a, t);
              ec(s, p);
              break e;
            case 1:
              l = a;
              var h = s.type, m = s.stateNode;
              if (!(s.flags & 128) && (typeof h.getDerivedStateFromError == "function" || m !== null && typeof m.componentDidCatch == "function" && (Vt === null || !Vt.has(m)))) {
                s.flags |= 65536, t &= -t, s.lanes |= t;
                var x = Ah(s, l, t);
                ec(s, x);
                break e;
              }
          }
          s = s.return;
        } while (s !== null);
      }
      Gh(n);
    } catch (w) {
      t = w, J === n && n !== null && (J = n = n.return);
      continue;
    }
    break;
  } while (!0);
}
function Kh() {
  var e = cs.current;
  return cs.current = us, e === null ? us : e;
}
function Da() {
  (te === 0 || te === 3 || te === 2) && (te = 4), se === null || !(ln & 268435455) && !(Ls & 268435455) || Tt(se, ae);
}
function hs(e, t) {
  var n = F;
  F |= 2;
  var r = Kh();
  (se !== e || ae !== t) && (it = null, en(e, t));
  do
    try {
      qy();
      break;
    } catch (i) {
      Wh(e, i);
    }
  while (!0);
  if (fa(), F = n, cs.current = r, J !== null) throw Error(T(261));
  return se = null, ae = 0, te;
}
function qy() {
  for (; J !== null; ) Hh(J);
}
function Jy() {
  for (; J !== null && !Tg(); ) Hh(J);
}
function Hh(e) {
  var t = Yh(e.alternate, e, Ce);
  e.memoizedProps = e.pendingProps, t === null ? Gh(e) : J = t, Pa.current = null;
}
function Gh(e) {
  var t = e;
  do {
    var n = t.alternate;
    if (e = t.return, t.flags & 32768) {
      if (n = Hy(n, t), n !== null) {
        n.flags &= 32767, J = n;
        return;
      }
      if (e !== null) e.flags |= 32768, e.subtreeFlags = 0, e.deletions = null;
      else {
        te = 6, J = null;
        return;
      }
    } else if (n = Ky(n, t, Ce), n !== null) {
      J = n;
      return;
    }
    if (t = t.sibling, t !== null) {
      J = t;
      return;
    }
    J = t = e;
  } while (t !== null);
  te === 0 && (te = 5);
}
function Qt(e, t, n) {
  var r = I, i = Oe.transition;
  try {
    Oe.transition = null, I = 1, by(e, t, n, r);
  } finally {
    Oe.transition = i, I = r;
  }
  return null;
}
function by(e, t, n, r) {
  do
    jn();
  while (Ct !== null);
  if (F & 6) throw Error(T(327));
  n = e.finishedWork;
  var i = e.finishedLanes;
  if (n === null) return null;
  if (e.finishedWork = null, e.finishedLanes = 0, n === e.current) throw Error(T(177));
  e.callbackNode = null, e.callbackPriority = 0;
  var s = n.lanes | n.childLanes;
  if (Ng(e, s), e === se && (J = se = null, ae = 0), !(n.subtreeFlags & 2064) && !(n.flags & 2064) || Pi || (Pi = !0, Xh(Yi, function() {
    return jn(), null;
  })), s = (n.flags & 15990) !== 0, n.subtreeFlags & 15990 || s) {
    s = Oe.transition, Oe.transition = null;
    var o = I;
    I = 1;
    var l = F;
    F |= 4, Pa.current = null, Qy(e, n), Bh(n, e), xy(el), Zi = !!bo, el = bo = null, e.current = n, Yy(n), Pg(), F = l, I = o, Oe.transition = s;
  } else e.current = n;
  if (Pi && (Pi = !1, Ct = e, ds = i), s = e.pendingLanes, s === 0 && (Vt = null), Ag(n.stateNode), Pe(e, q()), t !== null) for (r = e.onRecoverableError, n = 0; n < t.length; n++) i = t[n], r(i.value, { componentStack: i.stack, digest: i.digest });
  if (fs) throw fs = !1, e = wl, wl = null, e;
  return ds & 1 && e.tag !== 0 && jn(), s = e.pendingLanes, s & 1 ? e === Sl ? Pr++ : (Pr = 0, Sl = e) : Pr = 0, Bt(), null;
}
function jn() {
  if (Ct !== null) {
    var e = Ed(ds), t = Oe.transition, n = I;
    try {
      if (Oe.transition = null, I = 16 > e ? 16 : e, Ct === null) var r = !1;
      else {
        if (e = Ct, Ct = null, ds = 0, F & 6) throw Error(T(331));
        var i = F;
        for (F |= 4, D = e.current; D !== null; ) {
          var s = D, o = s.child;
          if (D.flags & 16) {
            var l = s.deletions;
            if (l !== null) {
              for (var a = 0; a < l.length; a++) {
                var u = l[a];
                for (D = u; D !== null; ) {
                  var c = D;
                  switch (c.tag) {
                    case 0:
                    case 11:
                    case 15:
                      kr(8, c, s);
                  }
                  var f = c.child;
                  if (f !== null) f.return = c, D = f;
                  else for (; D !== null; ) {
                    c = D;
                    var d = c.sibling, g = c.return;
                    if (Ih(c), c === u) {
                      D = null;
                      break;
                    }
                    if (d !== null) {
                      d.return = g, D = d;
                      break;
                    }
                    D = g;
                  }
                }
              }
              var y = s.alternate;
              if (y !== null) {
                var v = y.child;
                if (v !== null) {
                  y.child = null;
                  do {
                    var S = v.sibling;
                    v.sibling = null, v = S;
                  } while (v !== null);
                }
              }
              D = s;
            }
          }
          if (s.subtreeFlags & 2064 && o !== null) o.return = s, D = o;
          else e: for (; D !== null; ) {
            if (s = D, s.flags & 2048) switch (s.tag) {
              case 0:
              case 11:
              case 15:
                kr(9, s, s.return);
            }
            var p = s.sibling;
            if (p !== null) {
              p.return = s.return, D = p;
              break e;
            }
            D = s.return;
          }
        }
        var h = e.current;
        for (D = h; D !== null; ) {
          o = D;
          var m = o.child;
          if (o.subtreeFlags & 2064 && m !== null) m.return = o, D = m;
          else e: for (o = h; D !== null; ) {
            if (l = D, l.flags & 2048) try {
              switch (l.tag) {
                case 0:
                case 11:
                case 15:
                  Vs(9, l);
              }
            } catch (w) {
              Y(l, l.return, w);
            }
            if (l === o) {
              D = null;
              break e;
            }
            var x = l.sibling;
            if (x !== null) {
              x.return = l.return, D = x;
              break e;
            }
            D = l.return;
          }
        }
        if (F = i, Bt(), be && typeof be.onPostCommitFiberRoot == "function") try {
          be.onPostCommitFiberRoot(Ts, e);
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
function Sc(e, t, n) {
  t = Un(n, t), t = Eh(e, t, 1), e = Mt(e, t, 1), t = ye(), e !== null && (Jr(e, 1, t), Pe(e, t));
}
function Y(e, t, n) {
  if (e.tag === 3) Sc(e, e, n);
  else for (; t !== null; ) {
    if (t.tag === 3) {
      Sc(t, e, n);
      break;
    } else if (t.tag === 1) {
      var r = t.stateNode;
      if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (Vt === null || !Vt.has(r))) {
        e = Un(n, e), e = Ah(t, e, 1), t = Mt(t, e, 1), e = ye(), t !== null && (Jr(t, 1, e), Pe(t, e));
        break;
      }
    }
    t = t.return;
  }
}
function ev(e, t, n) {
  var r = e.pingCache;
  r !== null && r.delete(t), t = ye(), e.pingedLanes |= e.suspendedLanes & n, se === e && (ae & n) === n && (te === 4 || te === 3 && (ae & 130023424) === ae && 500 > q() - Ea ? en(e, 0) : Ca |= n), Pe(e, t);
}
function Qh(e, t) {
  t === 0 && (e.mode & 1 ? (t = pi, pi <<= 1, !(pi & 130023424) && (pi = 4194304)) : t = 1);
  var n = ye();
  e = ht(e, t), e !== null && (Jr(e, t, n), Pe(e, n));
}
function tv(e) {
  var t = e.memoizedState, n = 0;
  t !== null && (n = t.retryLane), Qh(e, n);
}
function nv(e, t) {
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
    if (!(e.lanes & n) && !(t.flags & 128)) return Se = !1, Wy(e, t, n);
    Se = !!(e.flags & 131072);
  }
  else Se = !1, $ && t.flags & 1048576 && Jd(t, rs, t.index);
  switch (t.lanes = 0, t.tag) {
    case 2:
      var r = t.type;
      Oi(e, t), e = t.pendingProps;
      var i = In(t, me.current);
      _n(t, n), i = xa(null, t, r, e, i, n);
      var s = wa();
      return t.flags |= 1, typeof i == "object" && i !== null && typeof i.render == "function" && i.$$typeof === void 0 ? (t.tag = 1, t.memoizedState = null, t.updateQueue = null, Te(r) ? (s = !0, ts(t)) : s = !1, t.memoizedState = i.state !== null && i.state !== void 0 ? i.state : null, pa(t), i.updater = Ms, t.stateNode = i, i._reactInternals = t, ul(t, r, e, n), t = dl(null, t, r, !0, s, n)) : (t.tag = 0, $ && s && la(t), ge(null, t, i, n), t = t.child), t;
    case 16:
      r = t.elementType;
      e: {
        switch (Oi(e, t), e = t.pendingProps, i = r._init, r = i(r._payload), t.type = r, i = t.tag = iv(r), e = We(r, e), i) {
          case 0:
            t = fl(null, t, r, e, n);
            break e;
          case 1:
            t = fc(null, t, r, e, n);
            break e;
          case 11:
            t = uc(null, t, r, e, n);
            break e;
          case 14:
            t = cc(null, t, r, We(r.type, e), n);
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
      return r = t.type, i = t.pendingProps, i = t.elementType === r ? i : We(r, i), fl(e, t, r, i, n);
    case 1:
      return r = t.type, i = t.pendingProps, i = t.elementType === r ? i : We(r, i), fc(e, t, r, i, n);
    case 3:
      e: {
        if (Vh(t), e === null) throw Error(T(387));
        r = t.pendingProps, s = t.memoizedState, i = s.element, ih(e, t), os(t, r, null, n);
        var o = t.memoizedState;
        if (r = o.element, s.isDehydrated) if (s = { element: r, isDehydrated: !1, cache: o.cache, pendingSuspenseBoundaries: o.pendingSuspenseBoundaries, transitions: o.transitions }, t.updateQueue.baseState = s, t.memoizedState = s, t.flags & 256) {
          i = Un(Error(T(423)), t), t = dc(e, t, r, n, i);
          break e;
        } else if (r !== i) {
          i = Un(Error(T(424)), t), t = dc(e, t, r, n, i);
          break e;
        } else for (Ee = Dt(t.stateNode.containerInfo.firstChild), Ae = t, $ = !0, He = null, n = nh(t, null, r, n), t.child = n; n; ) n.flags = n.flags & -3 | 4096, n = n.sibling;
        else {
          if (On(), r === i) {
            t = pt(e, t, n);
            break e;
          }
          ge(e, t, r, n);
        }
        t = t.child;
      }
      return t;
    case 5:
      return sh(t), e === null && ol(t), r = t.type, i = t.pendingProps, s = e !== null ? e.memoizedProps : null, o = i.children, tl(r, i) ? o = null : s !== null && tl(r, s) && (t.flags |= 32), Mh(e, t), ge(e, t, o, n), t.child;
    case 6:
      return e === null && ol(t), null;
    case 13:
      return Lh(e, t, n);
    case 4:
      return ma(t, t.stateNode.containerInfo), r = t.pendingProps, e === null ? t.child = zn(t, null, r, n) : ge(e, t, r, n), t.child;
    case 11:
      return r = t.type, i = t.pendingProps, i = t.elementType === r ? i : We(r, i), uc(e, t, r, i, n);
    case 7:
      return ge(e, t, t.pendingProps, n), t.child;
    case 8:
      return ge(e, t, t.pendingProps.children, n), t.child;
    case 12:
      return ge(e, t, t.pendingProps.children, n), t.child;
    case 10:
      e: {
        if (r = t.type._context, i = t.pendingProps, s = t.memoizedProps, o = i.value, O(is, r._currentValue), r._currentValue = o, s !== null) if (Xe(s.value, o)) {
          if (s.children === i.children && !ke.current) {
            t = pt(e, t, n);
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
                s.lanes |= n, a = s.alternate, a !== null && (a.lanes |= n), ll(
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
            o.lanes |= n, l = o.alternate, l !== null && (l.lanes |= n), ll(o, n, t), o = s.sibling;
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
      return r = t.type, i = We(r, t.pendingProps), i = We(r.type, i), cc(e, t, r, i, n);
    case 15:
      return Rh(e, t, t.type, t.pendingProps, n);
    case 17:
      return r = t.type, i = t.pendingProps, i = t.elementType === r ? i : We(r, i), Oi(e, t), t.tag = 1, Te(r) ? (e = !0, ts(t)) : e = !1, _n(t, n), Ch(t, r, i), ul(t, r, i, n), dl(null, t, r, !0, e, n);
    case 19:
      return Nh(e, t, n);
    case 22:
      return Dh(e, t, n);
  }
  throw Error(T(156, t.tag));
};
function Xh(e, t) {
  return kd(e, t);
}
function rv(e, t, n, r) {
  this.tag = e, this.key = n, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
}
function Ie(e, t, n, r) {
  return new rv(e, t, n, r);
}
function Ma(e) {
  return e = e.prototype, !(!e || !e.isReactComponent);
}
function iv(e) {
  if (typeof e == "function") return Ma(e) ? 1 : 0;
  if (e != null) {
    if (e = e.$$typeof, e === Xl) return 11;
    if (e === Zl) return 14;
  }
  return 2;
}
function Nt(e, t) {
  var n = e.alternate;
  return n === null ? (n = Ie(e.tag, t, e.key, e.mode), n.elementType = e.elementType, n.type = e.type, n.stateNode = e.stateNode, n.alternate = e, e.alternate = n) : (n.pendingProps = t, n.type = e.type, n.flags = 0, n.subtreeFlags = 0, n.deletions = null), n.flags = e.flags & 14680064, n.childLanes = e.childLanes, n.lanes = e.lanes, n.child = e.child, n.memoizedProps = e.memoizedProps, n.memoizedState = e.memoizedState, n.updateQueue = e.updateQueue, t = e.dependencies, n.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, n.sibling = e.sibling, n.index = e.index, n.ref = e.ref, n;
}
function Ui(e, t, n, r, i, s) {
  var o = 2;
  if (r = e, typeof e == "function") Ma(e) && (o = 1);
  else if (typeof e == "string") o = 5;
  else e: switch (e) {
    case pn:
      return tn(n.children, i, s, t);
    case Yl:
      o = 8, i |= 8;
      break;
    case No:
      return e = Ie(12, n, t, i | 2), e.elementType = No, e.lanes = s, e;
    case _o:
      return e = Ie(13, n, t, i), e.elementType = _o, e.lanes = s, e;
    case jo:
      return e = Ie(19, n, t, i), e.elementType = jo, e.lanes = s, e;
    case sd:
      return Ns(n, i, s, t);
    default:
      if (typeof e == "object" && e !== null) switch (e.$$typeof) {
        case rd:
          o = 10;
          break e;
        case id:
          o = 9;
          break e;
        case Xl:
          o = 11;
          break e;
        case Zl:
          o = 14;
          break e;
        case wt:
          o = 16, r = null;
          break e;
      }
      throw Error(T(130, e == null ? e : typeof e, ""));
  }
  return t = Ie(o, n, t, i), t.elementType = e, t.type = r, t.lanes = s, t;
}
function tn(e, t, n, r) {
  return e = Ie(7, e, r, t), e.lanes = n, e;
}
function Ns(e, t, n, r) {
  return e = Ie(22, e, r, t), e.elementType = sd, e.lanes = n, e.stateNode = { isHidden: !1 }, e;
}
function go(e, t, n) {
  return e = Ie(6, e, null, t), e.lanes = n, e;
}
function yo(e, t, n) {
  return t = Ie(4, e.children !== null ? e.children : [], e.key, t), t.lanes = n, t.stateNode = { containerInfo: e.containerInfo, pendingChildren: null, implementation: e.implementation }, t;
}
function sv(e, t, n, r, i) {
  this.tag = t, this.containerInfo = e, this.finishedWork = this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.pendingContext = this.context = null, this.callbackPriority = 0, this.eventTimes = Zs(0), this.expirationTimes = Zs(-1), this.entangledLanes = this.finishedLanes = this.mutableReadLanes = this.expiredLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Zs(0), this.identifierPrefix = r, this.onRecoverableError = i, this.mutableSourceEagerHydrationData = null;
}
function Va(e, t, n, r, i, s, o, l, a) {
  return e = new sv(e, t, n, l, a), t === 1 ? (t = 1, s === !0 && (t |= 8)) : t = 0, s = Ie(3, null, null, t), e.current = s, s.stateNode = e, s.memoizedState = { element: r, isDehydrated: n, cache: null, transitions: null, pendingSuspenseBoundaries: null }, pa(s), e;
}
function ov(e, t, n) {
  var r = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
  return { $$typeof: hn, key: r == null ? null : "" + r, children: e, containerInfo: t, implementation: n };
}
function Zh(e) {
  if (!e) return jt;
  e = e._reactInternals;
  e: {
    if (cn(e) !== e || e.tag !== 1) throw Error(T(170));
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
  return e = Va(n, r, !0, e, i, s, o, l, a), e.context = Zh(null), n = e.current, r = ye(), i = Lt(n), s = at(r, i), s.callback = t ?? null, Mt(n, s, i), e.current.lanes = i, Jr(e, i, r), Pe(e, r), e;
}
function _s(e, t, n, r) {
  var i = t.current, s = ye(), o = Lt(i);
  return n = Zh(n), t.context === null ? t.context = n : t.pendingContext = n, t = at(s, o), t.payload = { element: e }, r = r === void 0 ? null : r, r !== null && (t.callback = r), e = Mt(i, t, o), e !== null && (Qe(e, i, o, s), ji(e, i, o)), o;
}
function ps(e) {
  if (e = e.current, !e.child) return null;
  switch (e.child.tag) {
    case 5:
      return e.child.stateNode;
    default:
      return e.child.stateNode;
  }
}
function kc(e, t) {
  if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
    var n = e.retryLane;
    e.retryLane = n !== 0 && n < t ? n : t;
  }
}
function La(e, t) {
  kc(e, t), (e = e.alternate) && kc(e, t);
}
function lv() {
  return null;
}
var Jh = typeof reportError == "function" ? reportError : function(e) {
  console.error(e);
};
function Na(e) {
  this._internalRoot = e;
}
js.prototype.render = Na.prototype.render = function(e) {
  var t = this._internalRoot;
  if (t === null) throw Error(T(409));
  _s(e, t, null, null);
};
js.prototype.unmount = Na.prototype.unmount = function() {
  var e = this._internalRoot;
  if (e !== null) {
    this._internalRoot = null;
    var t = e.containerInfo;
    an(function() {
      _s(null, e, null, null);
    }), t[dt] = null;
  }
};
function js(e) {
  this._internalRoot = e;
}
js.prototype.unstable_scheduleHydration = function(e) {
  if (e) {
    var t = Dd();
    e = { blockedOn: null, target: e, priority: t };
    for (var n = 0; n < kt.length && t !== 0 && t < kt[n].priority; n++) ;
    kt.splice(n, 0, e), n === 0 && Vd(e);
  }
};
function _a(e) {
  return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11);
}
function Fs(e) {
  return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11 && (e.nodeType !== 8 || e.nodeValue !== " react-mount-point-unstable "));
}
function Tc() {
}
function av(e, t, n, r, i) {
  if (i) {
    if (typeof r == "function") {
      var s = r;
      r = function() {
        var u = ps(o);
        s.call(u);
      };
    }
    var o = qh(t, r, e, 0, null, !1, !1, "", Tc);
    return e._reactRootContainer = o, e[dt] = o.current, Ir(e.nodeType === 8 ? e.parentNode : e), an(), o;
  }
  for (; i = e.lastChild; ) e.removeChild(i);
  if (typeof r == "function") {
    var l = r;
    r = function() {
      var u = ps(a);
      l.call(u);
    };
  }
  var a = Va(e, 0, !1, null, null, !1, !1, "", Tc);
  return e._reactRootContainer = a, e[dt] = a.current, Ir(e.nodeType === 8 ? e.parentNode : e), an(function() {
    _s(t, a, n, r);
  }), a;
}
function Is(e, t, n, r, i) {
  var s = n._reactRootContainer;
  if (s) {
    var o = s;
    if (typeof i == "function") {
      var l = i;
      i = function() {
        var a = ps(o);
        l.call(a);
      };
    }
    _s(t, o, e, i);
  } else o = av(n, t, e, i, r);
  return ps(o);
}
Ad = function(e) {
  switch (e.tag) {
    case 3:
      var t = e.stateNode;
      if (t.current.memoizedState.isDehydrated) {
        var n = fr(t.pendingLanes);
        n !== 0 && (bl(t, n | 1), Pe(t, q()), !(F & 6) && ($n = q() + 500, Bt()));
      }
      break;
    case 13:
      an(function() {
        var r = ht(e, 1);
        if (r !== null) {
          var i = ye();
          Qe(r, e, 1, i);
        }
      }), La(e, 1);
  }
};
ea = function(e) {
  if (e.tag === 13) {
    var t = ht(e, 134217728);
    if (t !== null) {
      var n = ye();
      Qe(t, e, 134217728, n);
    }
    La(e, 134217728);
  }
};
Rd = function(e) {
  if (e.tag === 13) {
    var t = Lt(e), n = ht(e, t);
    if (n !== null) {
      var r = ye();
      Qe(n, e, t, r);
    }
    La(e, t);
  }
};
Dd = function() {
  return I;
};
Md = function(e, t) {
  var n = I;
  try {
    return I = e, t();
  } finally {
    I = n;
  }
};
Ho = function(e, t, n) {
  switch (t) {
    case "input":
      if (Oo(e, n), t = n.name, n.type === "radio" && t != null) {
        for (n = e; n.parentNode; ) n = n.parentNode;
        for (n = n.querySelectorAll("input[name=" + JSON.stringify("" + t) + '][type="radio"]'), t = 0; t < n.length; t++) {
          var r = n[t];
          if (r !== e && r.form === e.form) {
            var i = As(r);
            if (!i) throw Error(T(90));
            ld(r), Oo(r, i);
          }
        }
      }
      break;
    case "textarea":
      ud(e, n);
      break;
    case "select":
      t = n.value, t != null && Mn(e, !!n.multiple, t, !1);
  }
};
gd = Aa;
yd = an;
var uv = { usingClientEntryPoint: !1, Events: [ei, vn, As, pd, md, Aa] }, or = { findFiberByHostInstance: Zt, bundleType: 0, version: "18.3.1", rendererPackageName: "react-dom" }, cv = { bundleType: or.bundleType, version: or.version, rendererPackageName: or.rendererPackageName, rendererConfig: or.rendererConfig, overrideHookState: null, overrideHookStateDeletePath: null, overrideHookStateRenamePath: null, overrideProps: null, overridePropsDeletePath: null, overridePropsRenamePath: null, setErrorHandler: null, setSuspenseHandler: null, scheduleUpdate: null, currentDispatcherRef: gt.ReactCurrentDispatcher, findHostInstanceByFiber: function(e) {
  return e = wd(e), e === null ? null : e.stateNode;
}, findFiberByHostInstance: or.findFiberByHostInstance || lv, findHostInstancesForRefresh: null, scheduleRefresh: null, scheduleRoot: null, setRefreshHandler: null, getCurrentFiber: null, reconcilerVersion: "18.3.1-next-f1338f8080-20240426" };
if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
  var Ci = __REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!Ci.isDisabled && Ci.supportsFiber) try {
    Ts = Ci.inject(cv), be = Ci;
  } catch {
  }
}
Ve.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = uv;
Ve.createPortal = function(e, t) {
  var n = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
  if (!_a(t)) throw Error(T(200));
  return ov(e, t, null, n);
};
Ve.createRoot = function(e, t) {
  if (!_a(e)) throw Error(T(299));
  var n = !1, r = "", i = Jh;
  return t != null && (t.unstable_strictMode === !0 && (n = !0), t.identifierPrefix !== void 0 && (r = t.identifierPrefix), t.onRecoverableError !== void 0 && (i = t.onRecoverableError)), t = Va(e, 1, !1, null, null, n, !1, r, i), e[dt] = t.current, Ir(e.nodeType === 8 ? e.parentNode : e), new Na(t);
};
Ve.findDOMNode = function(e) {
  if (e == null) return null;
  if (e.nodeType === 1) return e;
  var t = e._reactInternals;
  if (t === void 0)
    throw typeof e.render == "function" ? Error(T(188)) : (e = Object.keys(e).join(","), Error(T(268, e)));
  return e = wd(t), e = e === null ? null : e.stateNode, e;
};
Ve.flushSync = function(e) {
  return an(e);
};
Ve.hydrate = function(e, t, n) {
  if (!Fs(t)) throw Error(T(200));
  return Is(null, e, t, !0, n);
};
Ve.hydrateRoot = function(e, t, n) {
  if (!_a(e)) throw Error(T(405));
  var r = n != null && n.hydratedSources || null, i = !1, s = "", o = Jh;
  if (n != null && (n.unstable_strictMode === !0 && (i = !0), n.identifierPrefix !== void 0 && (s = n.identifierPrefix), n.onRecoverableError !== void 0 && (o = n.onRecoverableError)), t = qh(t, null, e, 1, n ?? null, i, !1, s, o), e[dt] = t.current, Ir(e), r) for (e = 0; e < r.length; e++) n = r[e], i = n._getVersion, i = i(n._source), t.mutableSourceEagerHydrationData == null ? t.mutableSourceEagerHydrationData = [n, i] : t.mutableSourceEagerHydrationData.push(
    n,
    i
  );
  return new js(t);
};
Ve.render = function(e, t, n) {
  if (!Fs(t)) throw Error(T(200));
  return Is(null, e, t, !1, n);
};
Ve.unmountComponentAtNode = function(e) {
  if (!Fs(e)) throw Error(T(40));
  return e._reactRootContainer ? (an(function() {
    Is(null, null, e, !1, function() {
      e._reactRootContainer = null, e[dt] = null;
    });
  }), !0) : !1;
};
Ve.unstable_batchedUpdates = Aa;
Ve.unstable_renderSubtreeIntoContainer = function(e, t, n, r) {
  if (!Fs(n)) throw Error(T(200));
  if (e == null || e._reactInternals === void 0) throw Error(T(38));
  return Is(e, t, n, !1, r);
};
Ve.version = "18.3.1-next-f1338f8080-20240426";
function bh() {
  if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
    try {
      __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(bh);
    } catch (e) {
      console.error(e);
    }
}
bh(), bf.exports = Ve;
var fv = bf.exports, ep, Pc = fv;
ep = Pc.createRoot, Pc.hydrateRoot;
const ja = C.createContext({});
function Fa(e) {
  const t = C.useRef(null);
  return t.current === null && (t.current = e()), t.current;
}
const Os = C.createContext(null), Ia = C.createContext({
  transformPagePoint: (e) => e,
  isStatic: !1,
  reducedMotion: "never"
});
class dv extends C.Component {
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
function hv({ children: e, isPresent: t }) {
  const n = C.useId(), r = C.useRef(null), i = C.useRef({
    width: 0,
    height: 0,
    top: 0,
    left: 0
  }), { nonce: s } = C.useContext(Ia);
  return C.useInsertionEffect(() => {
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
  }, [t]), R.jsx(dv, { isPresent: t, childRef: r, sizeRef: i, children: C.cloneElement(e, { ref: r }) });
}
const pv = ({ children: e, initial: t, isPresent: n, onExitComplete: r, custom: i, presenceAffectsLayout: s, mode: o }) => {
  const l = Fa(mv), a = C.useId(), u = C.useCallback((f) => {
    l.set(f, !0);
    for (const d of l.values())
      if (!d)
        return;
    r && r();
  }, [l, r]), c = C.useMemo(
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
  return C.useMemo(() => {
    l.forEach((f, d) => l.set(d, !1));
  }, [n]), C.useEffect(() => {
    !n && !l.size && r && r();
  }, [n]), o === "popLayout" && (e = R.jsx(hv, { isPresent: n, children: e })), R.jsx(Os.Provider, { value: c, children: e });
};
function mv() {
  return /* @__PURE__ */ new Map();
}
function tp(e = !0) {
  const t = C.useContext(Os);
  if (t === null)
    return [!0, null];
  const { isPresent: n, onExitComplete: r, register: i } = t, s = C.useId();
  C.useEffect(() => {
    e && i(s);
  }, [e]);
  const o = C.useCallback(() => e && r && r(s), [s, r, e]);
  return !n && r ? [!1, o] : [!0];
}
const Ei = (e) => e.key || "";
function Cc(e) {
  const t = [];
  return C.Children.forEach(e, (n) => {
    C.isValidElement(n) && t.push(n);
  }), t;
}
const Oa = typeof window < "u", np = Oa ? C.useLayoutEffect : C.useEffect, Pl = ({ children: e, custom: t, initial: n = !0, onExitComplete: r, presenceAffectsLayout: i = !0, mode: s = "sync", propagate: o = !1 }) => {
  const [l, a] = tp(o), u = C.useMemo(() => Cc(e), [e]), c = o && !l ? [] : u.map(Ei), f = C.useRef(!0), d = C.useRef(u), g = Fa(() => /* @__PURE__ */ new Map()), [y, v] = C.useState(u), [S, p] = C.useState(u);
  np(() => {
    f.current = !1, d.current = u;
    for (let x = 0; x < S.length; x++) {
      const w = Ei(S[x]);
      c.includes(w) ? g.delete(w) : g.get(w) !== !0 && g.set(w, !1);
    }
  }, [S, c.length, c.join("-")]);
  const h = [];
  if (u !== y) {
    let x = [...u];
    for (let w = 0; w < S.length; w++) {
      const P = S[w], E = Ei(P);
      c.includes(E) || (x.splice(w, 0, P), h.push(P));
    }
    s === "wait" && h.length && (x = h), p(Cc(x)), v(u);
    return;
  }
  const { forceRender: m } = C.useContext(ja);
  return R.jsx(R.Fragment, { children: S.map((x) => {
    const w = Ei(x), P = o && !l ? !1 : u === S || c.includes(w), E = () => {
      if (g.has(w))
        g.set(w, !0);
      else
        return;
      let k = !0;
      g.forEach((_) => {
        _ || (k = !1);
      }), k && (m?.(), p(d.current), o && a?.(), r && r());
    };
    return R.jsx(pv, { isPresent: P, initial: !f.current || n ? void 0 : !1, custom: P ? void 0 : t, presenceAffectsLayout: i, mode: s, onExitComplete: P ? void 0 : E, children: x }, w);
  }) });
}, Re = /* @__NO_SIDE_EFFECTS__ */ (e) => e;
let rp = Re;
// @__NO_SIDE_EFFECTS__
function za(e) {
  let t;
  return () => (t === void 0 && (t = e()), t);
}
const Wn = /* @__NO_SIDE_EFFECTS__ */ (e, t, n) => {
  const r = t - e;
  return r === 0 ? 1 : (n - e) / r;
}, ut = /* @__NO_SIDE_EFFECTS__ */ (e) => e * 1e3, ct = /* @__NO_SIDE_EFFECTS__ */ (e) => e / 1e3, gv = {
  useManualTiming: !1
};
function yv(e) {
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
const Ai = [
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
], vv = 40;
function ip(e, t) {
  let n = !1, r = !0;
  const i = {
    delta: 0,
    timestamp: 0,
    isProcessing: !1
  }, s = () => n = !0, o = Ai.reduce((p, h) => (p[h] = yv(s), p), {}), { read: l, resolveKeyframes: a, update: u, preRender: c, render: f, postRender: d } = o, g = () => {
    const p = performance.now();
    n = !1, i.delta = r ? 1e3 / 60 : Math.max(Math.min(p - i.timestamp, vv), 1), i.timestamp = p, i.isProcessing = !0, l.process(i), a.process(i), u.process(i), c.process(i), f.process(i), d.process(i), i.isProcessing = !1, n && t && (r = !1, e(g));
  }, y = () => {
    n = !0, r = !0, i.isProcessing || e(g);
  };
  return { schedule: Ai.reduce((p, h) => {
    const m = o[h];
    return p[h] = (x, w = !1, P = !1) => (n || y(), m.schedule(x, w, P)), p;
  }, {}), cancel: (p) => {
    for (let h = 0; h < Ai.length; h++)
      o[Ai[h]].cancel(p);
  }, state: i, steps: o };
}
const { schedule: U, cancel: Ft, state: le, steps: vo } = ip(typeof requestAnimationFrame < "u" ? requestAnimationFrame : Re, !0), sp = C.createContext({ strict: !1 }), Ec = {
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
}, Kn = {};
for (const e in Ec)
  Kn[e] = {
    isEnabled: (t) => Ec[e].some((n) => !!t[n])
  };
function xv(e) {
  for (const t in e)
    Kn[t] = {
      ...Kn[t],
      ...e[t]
    };
}
const wv = /* @__PURE__ */ new Set([
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
function ms(e) {
  return e.startsWith("while") || e.startsWith("drag") && e !== "draggable" || e.startsWith("layout") || e.startsWith("onTap") || e.startsWith("onPan") || e.startsWith("onLayout") || wv.has(e);
}
let op = (e) => !ms(e);
function Sv(e) {
  e && (op = (t) => t.startsWith("on") ? !ms(t) : e(t));
}
try {
  Sv(require("@emotion/is-prop-valid").default);
} catch {
}
function kv(e, t, n) {
  const r = {};
  for (const i in e)
    i === "values" && typeof e.values == "object" || (op(i) || n === !0 && ms(i) || !t && !ms(i) || // If trying to use native HTML drag events, forward drag listeners
    e.draggable && i.startsWith("onDrag")) && (r[i] = e[i]);
  return r;
}
function Tv(e) {
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
const zs = C.createContext({});
function Gr(e) {
  return typeof e == "string" || Array.isArray(e);
}
function Bs(e) {
  return e !== null && typeof e == "object" && typeof e.start == "function";
}
const Ba = [
  "animate",
  "whileInView",
  "whileFocus",
  "whileHover",
  "whileTap",
  "whileDrag",
  "exit"
], Ua = ["initial", ...Ba];
function Us(e) {
  return Bs(e.animate) || Ua.some((t) => Gr(e[t]));
}
function lp(e) {
  return !!(Us(e) || e.variants);
}
function Pv(e, t) {
  if (Us(e)) {
    const { initial: n, animate: r } = e;
    return {
      initial: n === !1 || Gr(n) ? n : void 0,
      animate: Gr(r) ? r : void 0
    };
  }
  return e.inherit !== !1 ? t : {};
}
function Cv(e) {
  const { initial: t, animate: n } = Pv(e, C.useContext(zs));
  return C.useMemo(() => ({ initial: t, animate: n }), [Ac(t), Ac(n)]);
}
function Ac(e) {
  return Array.isArray(e) ? e.join(" ") : e;
}
const Ev = Symbol.for("motionComponentSymbol");
function Cn(e) {
  return e && typeof e == "object" && Object.prototype.hasOwnProperty.call(e, "current");
}
function Av(e, t, n) {
  return C.useCallback(
    (r) => {
      r && e.onMount && e.onMount(r), t && (r ? t.mount(r) : t.unmount()), n && (typeof n == "function" ? n(r) : Cn(n) && (n.current = r));
    },
    /**
     * Only pass a new ref callback to React if we've received a visual element
     * factory. Otherwise we'll be mounting/remounting every time externalRef
     * or other dependencies change.
     */
    [t]
  );
}
const $a = (e) => e.replace(/([a-z])([A-Z])/gu, "$1-$2").toLowerCase(), Rv = "framerAppearId", ap = "data-" + $a(Rv), { schedule: Wa } = ip(queueMicrotask, !1), up = C.createContext({});
function Dv(e, t, n, r, i) {
  var s, o;
  const { visualElement: l } = C.useContext(zs), a = C.useContext(sp), u = C.useContext(Os), c = C.useContext(Ia).reducedMotion, f = C.useRef(null);
  r = r || a.renderer, !f.current && r && (f.current = r(e, {
    visualState: t,
    parent: l,
    props: n,
    presenceContext: u,
    blockInitialAnimation: u ? u.initial === !1 : !1,
    reducedMotionConfig: c
  }));
  const d = f.current, g = C.useContext(up);
  d && !d.projection && i && (d.type === "html" || d.type === "svg") && Mv(f.current, n, i, g);
  const y = C.useRef(!1);
  C.useInsertionEffect(() => {
    d && y.current && d.update(n, u);
  });
  const v = n[ap], S = C.useRef(!!v && !(!((s = window.MotionHandoffIsComplete) === null || s === void 0) && s.call(window, v)) && ((o = window.MotionHasOptimisedAnimation) === null || o === void 0 ? void 0 : o.call(window, v)));
  return np(() => {
    d && (y.current = !0, window.MotionIsMounted = !0, d.updateFeatures(), Wa.render(d.render), S.current && d.animationState && d.animationState.animateChanges());
  }), C.useEffect(() => {
    d && (!S.current && d.animationState && d.animationState.animateChanges(), S.current && (queueMicrotask(() => {
      var p;
      (p = window.MotionHandoffMarkAsComplete) === null || p === void 0 || p.call(window, v);
    }), S.current = !1));
  }), d;
}
function Mv(e, t, n, r) {
  const { layoutId: i, layout: s, drag: o, dragConstraints: l, layoutScroll: a, layoutRoot: u } = t;
  e.projection = new n(e.latestValues, t["data-framer-portal-id"] ? void 0 : cp(e.parent)), e.projection.setOptions({
    layoutId: i,
    layout: s,
    alwaysMeasureLayout: !!o || l && Cn(l),
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
function cp(e) {
  if (e)
    return e.options.allowProjection !== !1 ? e.projection : cp(e.parent);
}
function Vv({ preloadedFeatures: e, createVisualElement: t, useRender: n, useVisualState: r, Component: i }) {
  var s, o;
  e && xv(e);
  function l(u, c) {
    let f;
    const d = {
      ...C.useContext(Ia),
      ...u,
      layoutId: Lv(u)
    }, { isStatic: g } = d, y = Cv(u), v = r(u, g);
    if (!g && Oa) {
      Nv();
      const S = _v(d);
      f = S.MeasureLayout, y.visualElement = Dv(i, v, d, t, S.ProjectionNode);
    }
    return R.jsxs(zs.Provider, { value: y, children: [f && y.visualElement ? R.jsx(f, { visualElement: y.visualElement, ...d }) : null, n(i, u, Av(v, y.visualElement, c), v, g, y.visualElement)] });
  }
  l.displayName = `motion.${typeof i == "string" ? i : `create(${(o = (s = i.displayName) !== null && s !== void 0 ? s : i.name) !== null && o !== void 0 ? o : ""})`}`;
  const a = C.forwardRef(l);
  return a[Ev] = i, a;
}
function Lv({ layoutId: e }) {
  const t = C.useContext(ja).id;
  return t && e !== void 0 ? t + "-" + e : e;
}
function Nv(e, t) {
  C.useContext(sp).strict;
}
function _v(e) {
  const { drag: t, layout: n } = Kn;
  if (!t && !n)
    return {};
  const r = { ...t, ...n };
  return {
    MeasureLayout: t?.isEnabled(e) || n?.isEnabled(e) ? r.MeasureLayout : void 0,
    ProjectionNode: r.ProjectionNode
  };
}
const jv = [
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
function Ka(e) {
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
      !!(jv.indexOf(e) > -1 || /**
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
function Ha(e, t, n, r) {
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
const Cl = (e) => Array.isArray(e), Fv = (e) => !!(e && typeof e == "object" && e.mix && e.toValue), Iv = (e) => Cl(e) ? e[e.length - 1] || 0 : e, pe = (e) => !!(e && e.getVelocity);
function $i(e) {
  const t = pe(e) ? e.get() : e;
  return Fv(t) ? t.toValue() : t;
}
function Ov({ scrapeMotionValuesFromProps: e, createRenderState: t, onUpdate: n }, r, i, s) {
  const o = {
    latestValues: zv(r, i, s, e),
    renderState: t()
  };
  return n && (o.onMount = (l) => n({ props: r, current: l, ...o }), o.onUpdate = (l) => n(l)), o;
}
const fp = (e) => (t, n) => {
  const r = C.useContext(zs), i = C.useContext(Os), s = () => Ov(e, t, r, i);
  return n ? s() : Fa(s);
};
function zv(e, t, n, r) {
  const i = {}, s = r(e, {});
  for (const d in s)
    i[d] = $i(s[d]);
  let { initial: o, animate: l } = e;
  const a = Us(e), u = lp(e);
  t && u && !a && e.inherit !== !1 && (o === void 0 && (o = t.initial), l === void 0 && (l = t.animate));
  let c = n ? n.initial === !1 : !1;
  c = c || o === !1;
  const f = c ? l : o;
  if (f && typeof f != "boolean" && !Bs(f)) {
    const d = Array.isArray(f) ? f : [f];
    for (let g = 0; g < d.length; g++) {
      const y = Ha(e, d[g]);
      if (y) {
        const { transitionEnd: v, transition: S, ...p } = y;
        for (const h in p) {
          let m = p[h];
          if (Array.isArray(m)) {
            const x = c ? m.length - 1 : 0;
            m = m[x];
          }
          m !== null && (i[h] = m);
        }
        for (const h in v)
          i[h] = v[h];
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
], fn = new Set(Xn), dp = (e) => (t) => typeof t == "string" && t.startsWith(e), hp = /* @__PURE__ */ dp("--"), Bv = /* @__PURE__ */ dp("var(--"), Ga = (e) => Bv(e) ? Uv.test(e.split("/*")[0].trim()) : !1, Uv = /var\(--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)$/iu, pp = (e, t) => t && typeof e == "number" ? t.transform(e) : e, mt = (e, t, n) => n > t ? t : n < e ? e : n, Zn = {
  test: (e) => typeof e == "number",
  parse: parseFloat,
  transform: (e) => e
}, Qr = {
  ...Zn,
  transform: (e) => mt(0, 1, e)
}, Ri = {
  ...Zn,
  default: 1
}, ni = (e) => ({
  test: (t) => typeof t == "string" && t.endsWith(e) && t.split(" ").length === 1,
  parse: parseFloat,
  transform: (t) => `${t}${e}`
}), xt = /* @__PURE__ */ ni("deg"), tt = /* @__PURE__ */ ni("%"), M = /* @__PURE__ */ ni("px"), $v = /* @__PURE__ */ ni("vh"), Wv = /* @__PURE__ */ ni("vw"), Dc = {
  ...tt,
  parse: (e) => tt.parse(e) / 100,
  transform: (e) => tt.transform(e * 100)
}, Kv = {
  // Border props
  borderWidth: M,
  borderTopWidth: M,
  borderRightWidth: M,
  borderBottomWidth: M,
  borderLeftWidth: M,
  borderRadius: M,
  radius: M,
  borderTopLeftRadius: M,
  borderTopRightRadius: M,
  borderBottomRightRadius: M,
  borderBottomLeftRadius: M,
  // Positioning props
  width: M,
  maxWidth: M,
  height: M,
  maxHeight: M,
  top: M,
  right: M,
  bottom: M,
  left: M,
  // Spacing props
  padding: M,
  paddingTop: M,
  paddingRight: M,
  paddingBottom: M,
  paddingLeft: M,
  margin: M,
  marginTop: M,
  marginRight: M,
  marginBottom: M,
  marginLeft: M,
  // Misc
  backgroundPositionX: M,
  backgroundPositionY: M
}, Hv = {
  rotate: xt,
  rotateX: xt,
  rotateY: xt,
  rotateZ: xt,
  scale: Ri,
  scaleX: Ri,
  scaleY: Ri,
  scaleZ: Ri,
  skew: xt,
  skewX: xt,
  skewY: xt,
  distance: M,
  translateX: M,
  translateY: M,
  translateZ: M,
  x: M,
  y: M,
  z: M,
  perspective: M,
  transformPerspective: M,
  opacity: Qr,
  originX: Dc,
  originY: Dc,
  originZ: M
}, Mc = {
  ...Zn,
  transform: Math.round
}, Qa = {
  ...Kv,
  ...Hv,
  zIndex: Mc,
  size: M,
  // SVG
  fillOpacity: Qr,
  strokeOpacity: Qr,
  numOctaves: Mc
}, Gv = {
  x: "translateX",
  y: "translateY",
  z: "translateZ",
  transformPerspective: "perspective"
}, Qv = Xn.length;
function Yv(e, t, n) {
  let r = "", i = !0;
  for (let s = 0; s < Qv; s++) {
    const o = Xn[s], l = e[o];
    if (l === void 0)
      continue;
    let a = !0;
    if (typeof l == "number" ? a = l === (o.startsWith("scale") ? 1 : 0) : a = parseFloat(l) === 0, !a || n) {
      const u = pp(l, Qa[o]);
      if (!a) {
        i = !1;
        const c = Gv[o] || o;
        r += `${c}(${u}) `;
      }
      n && (t[o] = u);
    }
  }
  return r = r.trim(), n ? r = n(t, i ? "" : r) : i && (r = "none"), r;
}
function Ya(e, t, n) {
  const { style: r, vars: i, transformOrigin: s } = e;
  let o = !1, l = !1;
  for (const a in t) {
    const u = t[a];
    if (fn.has(a)) {
      o = !0;
      continue;
    } else if (hp(a)) {
      i[a] = u;
      continue;
    } else {
      const c = pp(u, Qa[a]);
      a.startsWith("origin") ? (l = !0, s[a] = c) : r[a] = c;
    }
  }
  if (t.transform || (o || n ? r.transform = Yv(t, e.transform, n) : r.transform && (r.transform = "none")), l) {
    const { originX: a = "50%", originY: u = "50%", originZ: c = 0 } = s;
    r.transformOrigin = `${a} ${u} ${c}`;
  }
}
const Xv = {
  offset: "stroke-dashoffset",
  array: "stroke-dasharray"
}, Zv = {
  offset: "strokeDashoffset",
  array: "strokeDasharray"
};
function qv(e, t, n = 1, r = 0, i = !0) {
  e.pathLength = 1;
  const s = i ? Xv : Zv;
  e[s.offset] = M.transform(-r);
  const o = M.transform(t), l = M.transform(n);
  e[s.array] = `${o} ${l}`;
}
function Vc(e, t, n) {
  return typeof e == "string" ? e : M.transform(t + n * e);
}
function Jv(e, t, n) {
  const r = Vc(t, e.x, e.width), i = Vc(n, e.y, e.height);
  return `${r} ${i}`;
}
function Xa(e, {
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
  if (Ya(e, u, f), c) {
    e.style.viewBox && (e.attrs.viewBox = e.style.viewBox);
    return;
  }
  e.attrs = e.style, e.style = {};
  const { attrs: d, style: g, dimensions: y } = e;
  d.transform && (y && (g.transform = d.transform), delete d.transform), y && (i !== void 0 || s !== void 0 || g.transform) && (g.transformOrigin = Jv(y, i !== void 0 ? i : 0.5, s !== void 0 ? s : 0.5)), t !== void 0 && (d.x = t), n !== void 0 && (d.y = n), r !== void 0 && (d.scale = r), o !== void 0 && qv(d, o, l, a, !1);
}
const Za = () => ({
  style: {},
  transform: {},
  transformOrigin: {},
  vars: {}
}), mp = () => ({
  ...Za(),
  attrs: {}
}), qa = (e) => typeof e == "string" && e.toLowerCase() === "svg";
function gp(e, { style: t, vars: n }, r, i) {
  Object.assign(e.style, t, i && i.getProjectionStyles(r));
  for (const s in n)
    e.style.setProperty(s, n[s]);
}
const yp = /* @__PURE__ */ new Set([
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
function vp(e, t, n, r) {
  gp(e, t, void 0, r);
  for (const i in t.attrs)
    e.setAttribute(yp.has(i) ? i : $a(i), t.attrs[i]);
}
const gs = {};
function bv(e) {
  Object.assign(gs, e);
}
function xp(e, { layout: t, layoutId: n }) {
  return fn.has(e) || e.startsWith("origin") || (t || n !== void 0) && (!!gs[e] || e === "opacity");
}
function Ja(e, t, n) {
  var r;
  const { style: i } = e, s = {};
  for (const o in i)
    (pe(i[o]) || t.style && pe(t.style[o]) || xp(o, e) || ((r = n?.getValue(o)) === null || r === void 0 ? void 0 : r.liveStyle) !== void 0) && (s[o] = i[o]);
  return s;
}
function wp(e, t, n) {
  const r = Ja(e, t, n);
  for (const i in e)
    if (pe(e[i]) || pe(t[i])) {
      const s = Xn.indexOf(i) !== -1 ? "attr" + i.charAt(0).toUpperCase() + i.substring(1) : i;
      r[s] = e[i];
    }
  return r;
}
function e0(e, t) {
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
const Lc = ["x", "y", "width", "height", "cx", "cy", "r"], t0 = {
  useVisualState: fp({
    scrapeMotionValuesFromProps: wp,
    createRenderState: mp,
    onUpdate: ({ props: e, prevProps: t, current: n, renderState: r, latestValues: i }) => {
      if (!n)
        return;
      let s = !!e.drag;
      if (!s) {
        for (const l in i)
          if (fn.has(l)) {
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
      o && U.read(() => {
        e0(n, r), U.render(() => {
          Xa(r, i, qa(n.tagName), e.transformTemplate), vp(n, r);
        });
      });
    }
  })
}, n0 = {
  useVisualState: fp({
    scrapeMotionValuesFromProps: Ja,
    createRenderState: Za
  })
};
function Sp(e, t, n) {
  for (const r in t)
    !pe(t[r]) && !xp(r, n) && (e[r] = t[r]);
}
function r0({ transformTemplate: e }, t) {
  return C.useMemo(() => {
    const n = Za();
    return Ya(n, t, e), Object.assign({}, n.vars, n.style);
  }, [t]);
}
function i0(e, t) {
  const n = e.style || {}, r = {};
  return Sp(r, n, e), Object.assign(r, r0(e, t)), r;
}
function s0(e, t) {
  const n = {}, r = i0(e, t);
  return e.drag && e.dragListener !== !1 && (n.draggable = !1, r.userSelect = r.WebkitUserSelect = r.WebkitTouchCallout = "none", r.touchAction = e.drag === !0 ? "none" : `pan-${e.drag === "x" ? "y" : "x"}`), e.tabIndex === void 0 && (e.onTap || e.onTapStart || e.whileTap) && (n.tabIndex = 0), n.style = r, n;
}
function o0(e, t, n, r) {
  const i = C.useMemo(() => {
    const s = mp();
    return Xa(s, t, qa(r), e.transformTemplate), {
      ...s.attrs,
      style: { ...s.style }
    };
  }, [t]);
  if (e.style) {
    const s = {};
    Sp(s, e.style, e), i.style = { ...s, ...i.style };
  }
  return i;
}
function l0(e = !1) {
  return (n, r, i, { latestValues: s }, o) => {
    const a = (Ka(n) ? o0 : s0)(r, s, o, n), u = kv(r, typeof n == "string", e), c = n !== C.Fragment ? { ...u, ...a, ref: i } : {}, { children: f } = r, d = C.useMemo(() => pe(f) ? f.get() : f, [f]);
    return C.createElement(n, {
      ...c,
      children: d
    });
  };
}
function a0(e, t) {
  return function(r, { forwardMotionProps: i } = { forwardMotionProps: !1 }) {
    const o = {
      ...Ka(r) ? t0 : n0,
      preloadedFeatures: e,
      useRender: l0(i),
      createVisualElement: t,
      Component: r
    };
    return Vv(o);
  };
}
function kp(e, t) {
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
function $s(e, t, n) {
  const r = e.getProps();
  return Ha(r, t, n !== void 0 ? n : r.custom, e);
}
const u0 = /* @__PURE__ */ za(() => window.ScrollTimeline !== void 0);
class c0 {
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
      if (u0() && i.attachTimeline)
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
class f0 extends c0 {
  then(t, n) {
    return Promise.all(this.animations).then(t).catch(n);
  }
}
function ba(e, t) {
  return e ? e[t] || e.default || e : void 0;
}
const El = 2e4;
function Tp(e) {
  let t = 0;
  const n = 50;
  let r = e.next(t);
  for (; !r.done && t < El; )
    t += n, r = e.next(t);
  return t >= El ? 1 / 0 : t;
}
function eu(e) {
  return typeof e == "function";
}
function Nc(e, t) {
  e.timeline = t, e.onfinish = null;
}
const tu = (e) => Array.isArray(e) && typeof e[0] == "number", d0 = {
  linearEasing: void 0
};
function h0(e, t) {
  const n = /* @__PURE__ */ za(e);
  return () => {
    var r;
    return (r = d0[t]) !== null && r !== void 0 ? r : n();
  };
}
const ys = /* @__PURE__ */ h0(() => {
  try {
    document.createElement("div").animate({ opacity: 0 }, { easing: "linear(0, 1)" });
  } catch {
    return !1;
  }
  return !0;
}, "linearEasing"), Pp = (e, t, n = 10) => {
  let r = "";
  const i = Math.max(Math.round(t / n), 2);
  for (let s = 0; s < i; s++)
    r += e(/* @__PURE__ */ Wn(0, i - 1, s)) + ", ";
  return `linear(${r.substring(0, r.length - 2)})`;
};
function Cp(e) {
  return !!(typeof e == "function" && ys() || !e || typeof e == "string" && (e in Al || ys()) || tu(e) || Array.isArray(e) && e.every(Cp));
}
const hr = ([e, t, n, r]) => `cubic-bezier(${e}, ${t}, ${n}, ${r})`, Al = {
  linear: "linear",
  ease: "ease",
  easeIn: "ease-in",
  easeOut: "ease-out",
  easeInOut: "ease-in-out",
  circIn: /* @__PURE__ */ hr([0, 0.65, 0.55, 1]),
  circOut: /* @__PURE__ */ hr([0.55, 0, 1, 0.45]),
  backIn: /* @__PURE__ */ hr([0.31, 0.01, 0.66, -0.59]),
  backOut: /* @__PURE__ */ hr([0.33, 1.53, 0.69, 0.99])
};
function Ep(e, t) {
  if (e)
    return typeof e == "function" && ys() ? Pp(e, t) : tu(e) ? hr(e) : Array.isArray(e) ? e.map((n) => Ep(n, t) || Al.easeOut) : Al[e];
}
const $e = {
  x: !1,
  y: !1
};
function Ap() {
  return $e.x || $e.y;
}
function p0(e, t, n) {
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
function Rp(e, t) {
  const n = p0(e), r = new AbortController(), i = {
    passive: !0,
    ...t,
    signal: r.signal
  };
  return [n, i, () => r.abort()];
}
function _c(e) {
  return (t) => {
    t.pointerType === "touch" || Ap() || e(t);
  };
}
function m0(e, t, n = {}) {
  const [r, i, s] = Rp(e, n), o = _c((l) => {
    const { target: a } = l, u = t(l);
    if (typeof u != "function" || !a)
      return;
    const c = _c((f) => {
      u(f), a.removeEventListener("pointerleave", c);
    });
    a.addEventListener("pointerleave", c, i);
  });
  return r.forEach((l) => {
    l.addEventListener("pointerenter", o, i);
  }), s;
}
const Dp = (e, t) => t ? e === t ? !0 : Dp(e, t.parentElement) : !1, nu = (e) => e.pointerType === "mouse" ? typeof e.button != "number" || e.button <= 0 : e.isPrimary !== !1, g0 = /* @__PURE__ */ new Set([
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "A"
]);
function y0(e) {
  return g0.has(e.tagName) || e.tabIndex !== -1;
}
const pr = /* @__PURE__ */ new WeakSet();
function jc(e) {
  return (t) => {
    t.key === "Enter" && e(t);
  };
}
function xo(e, t) {
  e.dispatchEvent(new PointerEvent("pointer" + t, { isPrimary: !0, bubbles: !0 }));
}
const v0 = (e, t) => {
  const n = e.currentTarget;
  if (!n)
    return;
  const r = jc(() => {
    if (pr.has(n))
      return;
    xo(n, "down");
    const i = jc(() => {
      xo(n, "up");
    }), s = () => xo(n, "cancel");
    n.addEventListener("keyup", i, t), n.addEventListener("blur", s, t);
  });
  n.addEventListener("keydown", r, t), n.addEventListener("blur", () => n.removeEventListener("keydown", r), t);
};
function Fc(e) {
  return nu(e) && !Ap();
}
function x0(e, t, n = {}) {
  const [r, i, s] = Rp(e, n), o = (l) => {
    const a = l.currentTarget;
    if (!Fc(l) || pr.has(a))
      return;
    pr.add(a);
    const u = t(l), c = (g, y) => {
      window.removeEventListener("pointerup", f), window.removeEventListener("pointercancel", d), !(!Fc(g) || !pr.has(a)) && (pr.delete(a), typeof u == "function" && u(g, { success: y }));
    }, f = (g) => {
      c(g, n.useGlobalTarget || Dp(a, g.target));
    }, d = (g) => {
      c(g, !1);
    };
    window.addEventListener("pointerup", f, i), window.addEventListener("pointercancel", d, i);
  };
  return r.forEach((l) => {
    !y0(l) && l.getAttribute("tabindex") === null && (l.tabIndex = 0), (n.useGlobalTarget ? window : l).addEventListener("pointerdown", o, i), l.addEventListener("focus", (u) => v0(u, i), i);
  }), s;
}
function w0(e) {
  return e === "x" || e === "y" ? $e[e] ? null : ($e[e] = !0, () => {
    $e[e] = !1;
  }) : $e.x || $e.y ? null : ($e.x = $e.y = !0, () => {
    $e.x = $e.y = !1;
  });
}
const Mp = /* @__PURE__ */ new Set([
  "width",
  "height",
  "top",
  "left",
  "right",
  "bottom",
  ...Xn
]);
let Wi;
function S0() {
  Wi = void 0;
}
const nt = {
  now: () => (Wi === void 0 && nt.set(le.isProcessing || gv.useManualTiming ? le.timestamp : performance.now()), Wi),
  set: (e) => {
    Wi = e, queueMicrotask(S0);
  }
};
function ru(e, t) {
  e.indexOf(t) === -1 && e.push(t);
}
function iu(e, t) {
  const n = e.indexOf(t);
  n > -1 && e.splice(n, 1);
}
class su {
  constructor() {
    this.subscriptions = [];
  }
  add(t) {
    return ru(this.subscriptions, t), () => iu(this.subscriptions, t);
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
function Vp(e, t) {
  return t ? e * (1e3 / t) : 0;
}
const Ic = 30, k0 = (e) => !isNaN(parseFloat(e));
class T0 {
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
    this.current = t, this.updatedAt = nt.now(), this.canTrackVelocity === null && t !== void 0 && (this.canTrackVelocity = k0(this.current));
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
    this.events[t] || (this.events[t] = new su());
    const r = this.events[t].add(n);
    return t === "change" ? () => {
      r(), U.read(() => {
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
    if (!this.canTrackVelocity || this.prevFrameValue === void 0 || t - this.updatedAt > Ic)
      return 0;
    const n = Math.min(this.updatedAt - this.prevUpdatedAt, Ic);
    return Vp(parseFloat(this.current) - parseFloat(this.prevFrameValue), n);
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
  return new T0(e, t);
}
function P0(e, t, n) {
  e.hasValue(t) ? e.getValue(t).set(n) : e.addValue(t, Yr(n));
}
function C0(e, t) {
  const n = $s(e, t);
  let { transitionEnd: r = {}, transition: i = {}, ...s } = n || {};
  s = { ...s, ...r };
  for (const o in s) {
    const l = Iv(s[o]);
    P0(e, o, l);
  }
}
function E0(e) {
  return !!(pe(e) && e.add);
}
function Rl(e, t) {
  const n = e.getValue("willChange");
  if (E0(n))
    return n.add(t);
}
function Lp(e) {
  return e.props[ap];
}
const Np = (e, t, n) => (((1 - 3 * n + 3 * t) * e + (3 * n - 6 * t)) * e + 3 * t) * e, A0 = 1e-7, R0 = 12;
function D0(e, t, n, r, i) {
  let s, o, l = 0;
  do
    o = t + (n - t) / 2, s = Np(o, r, i) - e, s > 0 ? n = o : t = o;
  while (Math.abs(s) > A0 && ++l < R0);
  return o;
}
function ri(e, t, n, r) {
  if (e === t && n === r)
    return Re;
  const i = (s) => D0(s, 0, 1, e, n);
  return (s) => s === 0 || s === 1 ? s : Np(i(s), t, r);
}
const _p = (e) => (t) => t <= 0.5 ? e(2 * t) / 2 : (2 - e(2 * (1 - t))) / 2, jp = (e) => (t) => 1 - e(1 - t), Fp = /* @__PURE__ */ ri(0.33, 1.53, 0.69, 0.99), ou = /* @__PURE__ */ jp(Fp), Ip = /* @__PURE__ */ _p(ou), Op = (e) => (e *= 2) < 1 ? 0.5 * ou(e) : 0.5 * (2 - Math.pow(2, -10 * (e - 1))), lu = (e) => 1 - Math.sin(Math.acos(e)), zp = jp(lu), Bp = _p(lu), Up = (e) => /^0[^.\s]+$/u.test(e);
function M0(e) {
  return typeof e == "number" ? e === 0 : e !== null ? e === "none" || e === "0" || Up(e) : !0;
}
const Cr = (e) => Math.round(e * 1e5) / 1e5, au = /-?(?:\d+(?:\.\d+)?|\.\d+)/gu;
function V0(e) {
  return e == null;
}
const L0 = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))$/iu, uu = (e, t) => (n) => !!(typeof n == "string" && L0.test(n) && n.startsWith(e) || t && !V0(n) && Object.prototype.hasOwnProperty.call(n, t)), $p = (e, t, n) => (r) => {
  if (typeof r != "string")
    return r;
  const [i, s, o, l] = r.match(au);
  return {
    [e]: parseFloat(i),
    [t]: parseFloat(s),
    [n]: parseFloat(o),
    alpha: l !== void 0 ? parseFloat(l) : 1
  };
}, N0 = (e) => mt(0, 255, e), wo = {
  ...Zn,
  transform: (e) => Math.round(N0(e))
}, bt = {
  test: /* @__PURE__ */ uu("rgb", "red"),
  parse: /* @__PURE__ */ $p("red", "green", "blue"),
  transform: ({ red: e, green: t, blue: n, alpha: r = 1 }) => "rgba(" + wo.transform(e) + ", " + wo.transform(t) + ", " + wo.transform(n) + ", " + Cr(Qr.transform(r)) + ")"
};
function _0(e) {
  let t = "", n = "", r = "", i = "";
  return e.length > 5 ? (t = e.substring(1, 3), n = e.substring(3, 5), r = e.substring(5, 7), i = e.substring(7, 9)) : (t = e.substring(1, 2), n = e.substring(2, 3), r = e.substring(3, 4), i = e.substring(4, 5), t += t, n += n, r += r, i += i), {
    red: parseInt(t, 16),
    green: parseInt(n, 16),
    blue: parseInt(r, 16),
    alpha: i ? parseInt(i, 16) / 255 : 1
  };
}
const Dl = {
  test: /* @__PURE__ */ uu("#"),
  parse: _0,
  transform: bt.transform
}, En = {
  test: /* @__PURE__ */ uu("hsl", "hue"),
  parse: /* @__PURE__ */ $p("hue", "saturation", "lightness"),
  transform: ({ hue: e, saturation: t, lightness: n, alpha: r = 1 }) => "hsla(" + Math.round(e) + ", " + tt.transform(Cr(t)) + ", " + tt.transform(Cr(n)) + ", " + Cr(Qr.transform(r)) + ")"
}, de = {
  test: (e) => bt.test(e) || Dl.test(e) || En.test(e),
  parse: (e) => bt.test(e) ? bt.parse(e) : En.test(e) ? En.parse(e) : Dl.parse(e),
  transform: (e) => typeof e == "string" ? e : e.hasOwnProperty("red") ? bt.transform(e) : En.transform(e)
}, j0 = /(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))/giu;
function F0(e) {
  var t, n;
  return isNaN(e) && typeof e == "string" && (((t = e.match(au)) === null || t === void 0 ? void 0 : t.length) || 0) + (((n = e.match(j0)) === null || n === void 0 ? void 0 : n.length) || 0) > 0;
}
const Wp = "number", Kp = "color", I0 = "var", O0 = "var(", Oc = "${}", z0 = /var\s*\(\s*--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)|#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\)|-?(?:\d+(?:\.\d+)?|\.\d+)/giu;
function Xr(e) {
  const t = e.toString(), n = [], r = {
    color: [],
    number: [],
    var: []
  }, i = [];
  let s = 0;
  const l = t.replace(z0, (a) => (de.test(a) ? (r.color.push(s), i.push(Kp), n.push(de.parse(a))) : a.startsWith(O0) ? (r.var.push(s), i.push(I0), n.push(a)) : (r.number.push(s), i.push(Wp), n.push(parseFloat(a))), ++s, Oc)).split(Oc);
  return { values: n, split: l, indexes: r, types: i };
}
function Hp(e) {
  return Xr(e).values;
}
function Gp(e) {
  const { split: t, types: n } = Xr(e), r = t.length;
  return (i) => {
    let s = "";
    for (let o = 0; o < r; o++)
      if (s += t[o], i[o] !== void 0) {
        const l = n[o];
        l === Wp ? s += Cr(i[o]) : l === Kp ? s += de.transform(i[o]) : s += i[o];
      }
    return s;
  };
}
const B0 = (e) => typeof e == "number" ? 0 : e;
function U0(e) {
  const t = Hp(e);
  return Gp(e)(t.map(B0));
}
const It = {
  test: F0,
  parse: Hp,
  createTransformer: Gp,
  getAnimatableNone: U0
}, $0 = /* @__PURE__ */ new Set(["brightness", "contrast", "saturate", "opacity"]);
function W0(e) {
  const [t, n] = e.slice(0, -1).split("(");
  if (t === "drop-shadow")
    return e;
  const [r] = n.match(au) || [];
  if (!r)
    return e;
  const i = n.replace(r, "");
  let s = $0.has(t) ? 1 : 0;
  return r !== n && (s *= 100), t + "(" + s + i + ")";
}
const K0 = /\b([a-z-]*)\(.*?\)/gu, Ml = {
  ...It,
  getAnimatableNone: (e) => {
    const t = e.match(K0);
    return t ? t.map(W0).join(" ") : e;
  }
}, H0 = {
  ...Qa,
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
  filter: Ml,
  WebkitFilter: Ml
}, cu = (e) => H0[e];
function Qp(e, t) {
  let n = cu(e);
  return n !== Ml && (n = It), n.getAnimatableNone ? n.getAnimatableNone(t) : void 0;
}
const G0 = /* @__PURE__ */ new Set(["auto", "none", "0"]);
function Q0(e, t, n) {
  let r = 0, i;
  for (; r < e.length && !i; ) {
    const s = e[r];
    typeof s == "string" && !G0.has(s) && Xr(s).values.length && (i = e[r]), r++;
  }
  if (i && n)
    for (const s of t)
      e[s] = Qp(n, i);
}
const zc = (e) => e === Zn || e === M, Bc = (e, t) => parseFloat(e.split(", ")[t]), Uc = (e, t) => (n, { transform: r }) => {
  if (r === "none" || !r)
    return 0;
  const i = r.match(/^matrix3d\((.+)\)$/u);
  if (i)
    return Bc(i[1], t);
  {
    const s = r.match(/^matrix\((.+)\)$/u);
    return s ? Bc(s[1], e) : 0;
  }
}, Y0 = /* @__PURE__ */ new Set(["x", "y", "z"]), X0 = Xn.filter((e) => !Y0.has(e));
function Z0(e) {
  const t = [];
  return X0.forEach((n) => {
    const r = e.getValue(n);
    r !== void 0 && (t.push([n, r.get()]), r.set(n.startsWith("scale") ? 1 : 0));
  }), t;
}
const Hn = {
  // Dimensions
  width: ({ x: e }, { paddingLeft: t = "0", paddingRight: n = "0" }) => e.max - e.min - parseFloat(t) - parseFloat(n),
  height: ({ y: e }, { paddingTop: t = "0", paddingBottom: n = "0" }) => e.max - e.min - parseFloat(t) - parseFloat(n),
  top: (e, { top: t }) => parseFloat(t),
  left: (e, { left: t }) => parseFloat(t),
  bottom: ({ y: e }, { top: t }) => parseFloat(t) + (e.max - e.min),
  right: ({ x: e }, { left: t }) => parseFloat(t) + (e.max - e.min),
  // Transform
  x: Uc(4, 13),
  y: Uc(5, 14)
};
Hn.translateX = Hn.x;
Hn.translateY = Hn.y;
const nn = /* @__PURE__ */ new Set();
let Vl = !1, Ll = !1;
function Yp() {
  if (Ll) {
    const e = Array.from(nn).filter((r) => r.needsMeasurement), t = new Set(e.map((r) => r.element)), n = /* @__PURE__ */ new Map();
    t.forEach((r) => {
      const i = Z0(r);
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
  Ll = !1, Vl = !1, nn.forEach((e) => e.complete()), nn.clear();
}
function Xp() {
  nn.forEach((e) => {
    e.readKeyframes(), e.needsMeasurement && (Ll = !0);
  });
}
function q0() {
  Xp(), Yp();
}
class fu {
  constructor(t, n, r, i, s, o = !1) {
    this.isComplete = !1, this.isAsync = !1, this.needsMeasurement = !1, this.isScheduled = !1, this.unresolvedKeyframes = [...t], this.onComplete = n, this.name = r, this.motionValue = i, this.element = s, this.isAsync = o;
  }
  scheduleResolve() {
    this.isScheduled = !0, this.isAsync ? (nn.add(this), Vl || (Vl = !0, U.read(Xp), U.resolveKeyframes(Yp))) : (this.readKeyframes(), this.complete());
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
    this.isComplete = !0, this.onComplete(this.unresolvedKeyframes, this.finalKeyframe), nn.delete(this);
  }
  cancel() {
    this.isComplete || (this.isScheduled = !1, nn.delete(this));
  }
  resume() {
    this.isComplete || this.scheduleResolve();
  }
}
const Zp = (e) => /^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(e), J0 = (
  // eslint-disable-next-line redos-detector/no-unsafe-regex -- false positive, as it can match a lot of words
  /^var\(--(?:([\w-]+)|([\w-]+), ?([a-zA-Z\d ()%#.,-]+))\)/u
);
function b0(e) {
  const t = J0.exec(e);
  if (!t)
    return [,];
  const [, n, r, i] = t;
  return [`--${n ?? r}`, i];
}
function qp(e, t, n = 1) {
  const [r, i] = b0(e);
  if (!r)
    return;
  const s = window.getComputedStyle(t).getPropertyValue(r);
  if (s) {
    const o = s.trim();
    return Zp(o) ? parseFloat(o) : o;
  }
  return Ga(i) ? qp(i, t, n + 1) : i;
}
const Jp = (e) => (t) => t.test(e), e1 = {
  test: (e) => e === "auto",
  parse: (e) => e
}, bp = [Zn, M, tt, xt, Wv, $v, e1], $c = (e) => bp.find(Jp(e));
class em extends fu {
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
      if (typeof u == "string" && (u = u.trim(), Ga(u))) {
        const c = qp(u, n.current);
        c !== void 0 && (t[a] = c), a === t.length - 1 && (this.finalKeyframe = u);
      }
    }
    if (this.resolveNoneKeyframes(), !Mp.has(r) || t.length !== 2)
      return;
    const [i, s] = t, o = $c(i), l = $c(s);
    if (o !== l)
      if (zc(o) && zc(l))
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
      M0(t[i]) && r.push(i);
    r.length && Q0(t, r, n);
  }
  measureInitialState() {
    const { element: t, unresolvedKeyframes: n, name: r } = this;
    if (!t || !t.current)
      return;
    r === "height" && (this.suspendedScrollY = window.pageYOffset), this.measuredOrigin = Hn[r](t.measureViewportBox(), window.getComputedStyle(t.current)), n[0] = this.measuredOrigin;
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
    i[o] = Hn[r](n.measureViewportBox(), window.getComputedStyle(n.current)), l !== null && this.finalKeyframe === void 0 && (this.finalKeyframe = l), !((t = this.removedTransforms) === null || t === void 0) && t.length && this.removedTransforms.forEach(([a, u]) => {
      n.getValue(a).set(u);
    }), this.resolveNoneKeyframes();
  }
}
const Wc = (e, t) => t === "zIndex" ? !1 : !!(typeof e == "number" || Array.isArray(e) || typeof e == "string" && // It's animatable if we have a string
(It.test(e) || e === "0") && // And it contains numbers and/or colors
!e.startsWith("url("));
function t1(e) {
  const t = e[0];
  if (e.length === 1)
    return !0;
  for (let n = 0; n < e.length; n++)
    if (e[n] !== t)
      return !0;
}
function n1(e, t, n, r) {
  const i = e[0];
  if (i === null)
    return !1;
  if (t === "display" || t === "visibility")
    return !0;
  const s = e[e.length - 1], o = Wc(i, t), l = Wc(s, t);
  return !o || !l ? !1 : t1(e) || (n === "spring" || eu(n)) && r;
}
const r1 = (e) => e !== null;
function Ws(e, { repeat: t, repeatType: n = "loop" }, r) {
  const i = e.filter(r1), s = t && n !== "loop" && t % 2 === 1 ? 0 : i.length - 1;
  return !s || r === void 0 ? i[s] : r;
}
const i1 = 40;
class tm {
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
    return this.resolvedAt ? this.resolvedAt - this.createdAt > i1 ? this.resolvedAt : this.createdAt : this.createdAt;
  }
  /**
   * A getter for resolved data. If keyframes are not yet resolved, accessing
   * this.resolved will synchronously flush all pending keyframe resolvers.
   * This is a deoptimisation, but at its worst still batches read/writes.
   */
  get resolved() {
    return !this._resolved && !this.hasAttemptedResolve && q0(), this._resolved;
  }
  /**
   * A method to be called when the keyframes resolver completes. This method
   * will check if its possible to run the animation and, if not, skip it.
   * Otherwise, it will call initPlayback on the implementing class.
   */
  onKeyframesResolved(t, n) {
    this.resolvedAt = nt.now(), this.hasAttemptedResolve = !0;
    const { name: r, type: i, velocity: s, delay: o, onComplete: l, onUpdate: a, isGenerator: u } = this.options;
    if (!u && !n1(t, r, i, s))
      if (o)
        this.options.duration = 0;
      else {
        a && a(Ws(t, this.options, n)), l && l(), this.resolveFinishedPromise();
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
function So(e, t, n) {
  return n < 0 && (n += 1), n > 1 && (n -= 1), n < 1 / 6 ? e + (t - e) * 6 * n : n < 1 / 2 ? t : n < 2 / 3 ? e + (t - e) * (2 / 3 - n) * 6 : e;
}
function s1({ hue: e, saturation: t, lightness: n, alpha: r }) {
  e /= 360, t /= 100, n /= 100;
  let i = 0, s = 0, o = 0;
  if (!t)
    i = s = o = n;
  else {
    const l = n < 0.5 ? n * (1 + t) : n + t - n * t, a = 2 * n - l;
    i = So(a, l, e + 1 / 3), s = So(a, l, e), o = So(a, l, e - 1 / 3);
  }
  return {
    red: Math.round(i * 255),
    green: Math.round(s * 255),
    blue: Math.round(o * 255),
    alpha: r
  };
}
function vs(e, t) {
  return (n) => n > 0 ? t : e;
}
const ko = (e, t, n) => {
  const r = e * e, i = n * (t * t - r) + r;
  return i < 0 ? 0 : Math.sqrt(i);
}, o1 = [Dl, bt, En], l1 = (e) => o1.find((t) => t.test(e));
function Kc(e) {
  const t = l1(e);
  if (!t)
    return !1;
  let n = t.parse(e);
  return t === En && (n = s1(n)), n;
}
const Hc = (e, t) => {
  const n = Kc(e), r = Kc(t);
  if (!n || !r)
    return vs(e, t);
  const i = { ...n };
  return (s) => (i.red = ko(n.red, r.red, s), i.green = ko(n.green, r.green, s), i.blue = ko(n.blue, r.blue, s), i.alpha = K(n.alpha, r.alpha, s), bt.transform(i));
}, a1 = (e, t) => (n) => t(e(n)), ii = (...e) => e.reduce(a1), Nl = /* @__PURE__ */ new Set(["none", "hidden"]);
function u1(e, t) {
  return Nl.has(e) ? (n) => n <= 0 ? e : t : (n) => n >= 1 ? t : e;
}
function c1(e, t) {
  return (n) => K(e, t, n);
}
function du(e) {
  return typeof e == "number" ? c1 : typeof e == "string" ? Ga(e) ? vs : de.test(e) ? Hc : h1 : Array.isArray(e) ? nm : typeof e == "object" ? de.test(e) ? Hc : f1 : vs;
}
function nm(e, t) {
  const n = [...e], r = n.length, i = e.map((s, o) => du(s)(s, t[o]));
  return (s) => {
    for (let o = 0; o < r; o++)
      n[o] = i[o](s);
    return n;
  };
}
function f1(e, t) {
  const n = { ...e, ...t }, r = {};
  for (const i in n)
    e[i] !== void 0 && t[i] !== void 0 && (r[i] = du(e[i])(e[i], t[i]));
  return (i) => {
    for (const s in r)
      n[s] = r[s](i);
    return n;
  };
}
function d1(e, t) {
  var n;
  const r = [], i = { color: 0, var: 0, number: 0 };
  for (let s = 0; s < t.values.length; s++) {
    const o = t.types[s], l = e.indexes[o][i[o]], a = (n = e.values[l]) !== null && n !== void 0 ? n : 0;
    r[s] = a, i[o]++;
  }
  return r;
}
const h1 = (e, t) => {
  const n = It.createTransformer(t), r = Xr(e), i = Xr(t);
  return r.indexes.var.length === i.indexes.var.length && r.indexes.color.length === i.indexes.color.length && r.indexes.number.length >= i.indexes.number.length ? Nl.has(e) && !i.values.length || Nl.has(t) && !r.values.length ? u1(e, t) : ii(nm(d1(r, i), i.values), n) : vs(e, t);
};
function rm(e, t, n) {
  return typeof e == "number" && typeof t == "number" && typeof n == "number" ? K(e, t, n) : du(e)(e, t);
}
const p1 = 5;
function im(e, t, n) {
  const r = Math.max(t - p1, 0);
  return Vp(n - e(r), t - r);
}
const Q = {
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
}, To = 1e-3;
function m1({ duration: e = Q.duration, bounce: t = Q.bounce, velocity: n = Q.velocity, mass: r = Q.mass }) {
  let i, s, o = 1 - t;
  o = mt(Q.minDamping, Q.maxDamping, o), e = mt(Q.minDuration, Q.maxDuration, /* @__PURE__ */ ct(e)), o < 1 ? (i = (u) => {
    const c = u * o, f = c * e, d = c - n, g = _l(u, o), y = Math.exp(-f);
    return To - d / g * y;
  }, s = (u) => {
    const f = u * o * e, d = f * n + n, g = Math.pow(o, 2) * Math.pow(u, 2) * e, y = Math.exp(-f), v = _l(Math.pow(u, 2), o);
    return (-i(u) + To > 0 ? -1 : 1) * ((d - g) * y) / v;
  }) : (i = (u) => {
    const c = Math.exp(-u * e), f = (u - n) * e + 1;
    return -To + c * f;
  }, s = (u) => {
    const c = Math.exp(-u * e), f = (n - u) * (e * e);
    return c * f;
  });
  const l = 5 / e, a = y1(i, s, l);
  if (e = /* @__PURE__ */ ut(e), isNaN(a))
    return {
      stiffness: Q.stiffness,
      damping: Q.damping,
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
const g1 = 12;
function y1(e, t, n) {
  let r = n;
  for (let i = 1; i < g1; i++)
    r = r - e(r) / t(r);
  return r;
}
function _l(e, t) {
  return e * Math.sqrt(1 - t * t);
}
const v1 = ["duration", "bounce"], x1 = ["stiffness", "damping", "mass"];
function Gc(e, t) {
  return t.some((n) => e[n] !== void 0);
}
function w1(e) {
  let t = {
    velocity: Q.velocity,
    stiffness: Q.stiffness,
    damping: Q.damping,
    mass: Q.mass,
    isResolvedFromDuration: !1,
    ...e
  };
  if (!Gc(e, x1) && Gc(e, v1))
    if (e.visualDuration) {
      const n = e.visualDuration, r = 2 * Math.PI / (n * 1.2), i = r * r, s = 2 * mt(0.05, 1, 1 - (e.bounce || 0)) * Math.sqrt(i);
      t = {
        ...t,
        mass: Q.mass,
        stiffness: i,
        damping: s
      };
    } else {
      const n = m1(e);
      t = {
        ...t,
        ...n,
        mass: Q.mass
      }, t.isResolvedFromDuration = !0;
    }
  return t;
}
function sm(e = Q.visualDuration, t = Q.bounce) {
  const n = typeof e != "object" ? {
    visualDuration: e,
    keyframes: [0, 1],
    bounce: t
  } : e;
  let { restSpeed: r, restDelta: i } = n;
  const s = n.keyframes[0], o = n.keyframes[n.keyframes.length - 1], l = { done: !1, value: s }, { stiffness: a, damping: u, mass: c, duration: f, velocity: d, isResolvedFromDuration: g } = w1({
    ...n,
    velocity: -/* @__PURE__ */ ct(n.velocity || 0)
  }), y = d || 0, v = u / (2 * Math.sqrt(a * c)), S = o - s, p = /* @__PURE__ */ ct(Math.sqrt(a / c)), h = Math.abs(S) < 5;
  r || (r = h ? Q.restSpeed.granular : Q.restSpeed.default), i || (i = h ? Q.restDelta.granular : Q.restDelta.default);
  let m;
  if (v < 1) {
    const w = _l(p, v);
    m = (P) => {
      const E = Math.exp(-v * p * P);
      return o - E * ((y + v * p * S) / w * Math.sin(w * P) + S * Math.cos(w * P));
    };
  } else if (v === 1)
    m = (w) => o - Math.exp(-p * w) * (S + (y + p * S) * w);
  else {
    const w = p * Math.sqrt(v * v - 1);
    m = (P) => {
      const E = Math.exp(-v * p * P), k = Math.min(w * P, 300);
      return o - E * ((y + v * p * S) * Math.sinh(k) + w * S * Math.cosh(k)) / w;
    };
  }
  const x = {
    calculatedDuration: g && f || null,
    next: (w) => {
      const P = m(w);
      if (g)
        l.done = w >= f;
      else {
        let E = 0;
        v < 1 && (E = w === 0 ? /* @__PURE__ */ ut(y) : im(m, w, P));
        const k = Math.abs(E) <= r, _ = Math.abs(o - P) <= i;
        l.done = k && _;
      }
      return l.value = l.done ? o : P, l;
    },
    toString: () => {
      const w = Math.min(Tp(x), El), P = Pp((E) => x.next(w * E).value, w, 30);
      return w + "ms " + P;
    }
  };
  return x;
}
function Qc({ keyframes: e, velocity: t = 0, power: n = 0.8, timeConstant: r = 325, bounceDamping: i = 10, bounceStiffness: s = 500, modifyTarget: o, min: l, max: a, restDelta: u = 0.5, restSpeed: c }) {
  const f = e[0], d = {
    done: !1,
    value: f
  }, g = (k) => l !== void 0 && k < l || a !== void 0 && k > a, y = (k) => l === void 0 ? a : a === void 0 || Math.abs(l - k) < Math.abs(a - k) ? l : a;
  let v = n * t;
  const S = f + v, p = o === void 0 ? S : o(S);
  p !== S && (v = p - f);
  const h = (k) => -v * Math.exp(-k / r), m = (k) => p + h(k), x = (k) => {
    const _ = h(k), V = m(k);
    d.done = Math.abs(_) <= u, d.value = d.done ? p : V;
  };
  let w, P;
  const E = (k) => {
    g(d.value) && (w = k, P = sm({
      keyframes: [d.value, y(d.value)],
      velocity: im(m, k, d.value),
      // TODO: This should be passing * 1000
      damping: i,
      stiffness: s,
      restDelta: u,
      restSpeed: c
    }));
  };
  return E(0), {
    calculatedDuration: null,
    next: (k) => {
      let _ = !1;
      return !P && w === void 0 && (_ = !0, x(k), E(k)), w !== void 0 && k >= w ? P.next(k - w) : (!_ && x(k), d);
    }
  };
}
const S1 = /* @__PURE__ */ ri(0.42, 0, 1, 1), k1 = /* @__PURE__ */ ri(0, 0, 0.58, 1), om = /* @__PURE__ */ ri(0.42, 0, 0.58, 1), T1 = (e) => Array.isArray(e) && typeof e[0] != "number", P1 = {
  linear: Re,
  easeIn: S1,
  easeInOut: om,
  easeOut: k1,
  circIn: lu,
  circInOut: Bp,
  circOut: zp,
  backIn: ou,
  backInOut: Ip,
  backOut: Fp,
  anticipate: Op
}, Yc = (e) => {
  if (tu(e)) {
    rp(e.length === 4);
    const [t, n, r, i] = e;
    return ri(t, n, r, i);
  } else if (typeof e == "string")
    return P1[e];
  return e;
};
function C1(e, t, n) {
  const r = [], i = n || rm, s = e.length - 1;
  for (let o = 0; o < s; o++) {
    let l = i(e[o], e[o + 1]);
    if (t) {
      const a = Array.isArray(t) ? t[o] || Re : t;
      l = ii(a, l);
    }
    r.push(l);
  }
  return r;
}
function E1(e, t, { clamp: n = !0, ease: r, mixer: i } = {}) {
  const s = e.length;
  if (rp(s === t.length), s === 1)
    return () => t[0];
  if (s === 2 && t[0] === t[1])
    return () => t[1];
  const o = e[0] === e[1];
  e[0] > e[s - 1] && (e = [...e].reverse(), t = [...t].reverse());
  const l = C1(t, r, i), a = l.length, u = (c) => {
    if (o && c < e[0])
      return t[0];
    let f = 0;
    if (a > 1)
      for (; f < e.length - 2 && !(c < e[f + 1]); f++)
        ;
    const d = /* @__PURE__ */ Wn(e[f], e[f + 1], c);
    return l[f](d);
  };
  return n ? (c) => u(mt(e[0], e[s - 1], c)) : u;
}
function A1(e, t) {
  const n = e[e.length - 1];
  for (let r = 1; r <= t; r++) {
    const i = /* @__PURE__ */ Wn(0, t, r);
    e.push(K(n, 1, i));
  }
}
function R1(e) {
  const t = [0];
  return A1(t, e.length - 1), t;
}
function D1(e, t) {
  return e.map((n) => n * t);
}
function M1(e, t) {
  return e.map(() => t || om).splice(0, e.length - 1);
}
function xs({ duration: e = 300, keyframes: t, times: n, ease: r = "easeInOut" }) {
  const i = T1(r) ? r.map(Yc) : Yc(r), s = {
    done: !1,
    value: t[0]
  }, o = D1(
    // Only use the provided offsets if they're the correct length
    // TODO Maybe we should warn here if there's a length mismatch
    n && n.length === t.length ? n : R1(t),
    e
  ), l = E1(o, t, {
    ease: Array.isArray(i) ? i : M1(t, i)
  });
  return {
    calculatedDuration: e,
    next: (a) => (s.value = l(a), s.done = a >= e, s)
  };
}
const V1 = (e) => {
  const t = ({ timestamp: n }) => e(n);
  return {
    start: () => U.update(t, !0),
    stop: () => Ft(t),
    /**
     * If we're processing this frame we can use the
     * framelocked timestamp to keep things in sync.
     */
    now: () => le.isProcessing ? le.timestamp : nt.now()
  };
}, L1 = {
  decay: Qc,
  inertia: Qc,
  tween: xs,
  keyframes: xs,
  spring: sm
}, N1 = (e) => e / 100;
class hu extends tm {
  constructor(t) {
    super(t), this.holdTime = null, this.cancelTime = null, this.currentTime = 0, this.playbackSpeed = 1, this.pendingPlayState = "running", this.startTime = null, this.state = "idle", this.stop = () => {
      if (this.resolver.cancel(), this.isStopped = !0, this.state === "idle")
        return;
      this.teardown();
      const { onStop: a } = this.options;
      a && a();
    };
    const { name: n, motionValue: r, element: i, keyframes: s } = this.options, o = i?.KeyframeResolver || fu, l = (a, u) => this.onKeyframesResolved(a, u);
    this.resolver = new o(s, l, n, r, i), this.resolver.scheduleResolve();
  }
  flatten() {
    super.flatten(), this._resolved && Object.assign(this._resolved, this.initPlayback(this._resolved.keyframes));
  }
  initPlayback(t) {
    const { type: n = "keyframes", repeat: r = 0, repeatDelay: i = 0, repeatType: s, velocity: o = 0 } = this.options, l = eu(n) ? n : L1[n] || xs;
    let a, u;
    l !== xs && typeof t[0] != "number" && (a = ii(N1, rm(t[0], t[1])), t = [0, 100]);
    const c = l({ ...this.options, keyframes: t });
    s === "mirror" && (u = l({
      ...this.options,
      keyframes: [...t].reverse(),
      velocity: -o
    })), c.calculatedDuration === null && (c.calculatedDuration = Tp(c));
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
    const { delay: d, repeat: g, repeatType: y, repeatDelay: v, onUpdate: S } = this.options;
    this.speed > 0 ? this.startTime = Math.min(this.startTime, t) : this.speed < 0 && (this.startTime = Math.min(t - c / this.speed, this.startTime)), n ? this.currentTime = t : this.holdTime !== null ? this.currentTime = this.holdTime : this.currentTime = Math.round(t - this.startTime) * this.speed;
    const p = this.currentTime - d * (this.speed >= 0 ? 1 : -1), h = this.speed >= 0 ? p < 0 : p > c;
    this.currentTime = Math.max(p, 0), this.state === "finished" && this.holdTime === null && (this.currentTime = c);
    let m = this.currentTime, x = s;
    if (g) {
      const k = Math.min(this.currentTime, c) / f;
      let _ = Math.floor(k), V = k % 1;
      !V && k >= 1 && (V = 1), V === 1 && _--, _ = Math.min(_, g + 1), !!(_ % 2) && (y === "reverse" ? (V = 1 - V, v && (V -= v / f)) : y === "mirror" && (x = o)), m = mt(0, 1, V) * f;
    }
    const w = h ? { done: !1, value: a[0] } : x.next(m);
    l && (w.value = l(w.value));
    let { done: P } = w;
    !h && u !== null && (P = this.speed >= 0 ? this.currentTime >= c : this.currentTime <= 0);
    const E = this.holdTime === null && (this.state === "finished" || this.state === "running" && P);
    return E && i !== void 0 && (w.value = Ws(a, this.options, i)), S && S(w.value), E && this.finish(), w;
  }
  get duration() {
    const { resolved: t } = this;
    return t ? /* @__PURE__ */ ct(t.calculatedDuration) : 0;
  }
  get time() {
    return /* @__PURE__ */ ct(this.currentTime);
  }
  set time(t) {
    t = /* @__PURE__ */ ut(t), this.currentTime = t, this.holdTime !== null || this.speed === 0 ? this.holdTime = t : this.driver && (this.startTime = this.driver.now() - t / this.speed);
  }
  get speed() {
    return this.playbackSpeed;
  }
  set speed(t) {
    const n = this.playbackSpeed !== t;
    this.playbackSpeed = t, n && (this.time = /* @__PURE__ */ ct(this.currentTime));
  }
  play() {
    if (this.resolver.isScheduled || this.resolver.resume(), !this._resolved) {
      this.pendingPlayState = "running";
      return;
    }
    if (this.isStopped)
      return;
    const { driver: t = V1, onPlay: n, startTime: r } = this.options;
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
const _1 = /* @__PURE__ */ new Set([
  "opacity",
  "clipPath",
  "filter",
  "transform"
  // TODO: Can be accelerated but currently disabled until https://issues.chromium.org/issues/41491098 is resolved
  // or until we implement support for linear() easing.
  // "background-color"
]);
function j1(e, t, n, { delay: r = 0, duration: i = 300, repeat: s = 0, repeatType: o = "loop", ease: l = "easeInOut", times: a } = {}) {
  const u = { [t]: n };
  a && (u.offset = a);
  const c = Ep(l, i);
  return Array.isArray(c) && (u.easing = c), e.animate(u, {
    delay: r,
    duration: i,
    easing: Array.isArray(c) ? "linear" : c,
    fill: "both",
    iterations: s + 1,
    direction: o === "reverse" ? "alternate" : "normal"
  });
}
const F1 = /* @__PURE__ */ za(() => Object.hasOwnProperty.call(Element.prototype, "animate")), ws = 10, I1 = 2e4;
function O1(e) {
  return eu(e.type) || e.type === "spring" || !Cp(e.ease);
}
function z1(e, t) {
  const n = new hu({
    ...t,
    keyframes: e,
    repeat: 0,
    delay: 0,
    isGenerator: !0
  });
  let r = { done: !1, value: e[0] };
  const i = [];
  let s = 0;
  for (; !r.done && s < I1; )
    r = n.sample(s), i.push(r.value), s += ws;
  return {
    times: void 0,
    keyframes: i,
    duration: s - ws,
    ease: "linear"
  };
}
const lm = {
  anticipate: Op,
  backInOut: Ip,
  circInOut: Bp
};
function B1(e) {
  return e in lm;
}
class Xc extends tm {
  constructor(t) {
    super(t);
    const { name: n, motionValue: r, element: i, keyframes: s } = this.options;
    this.resolver = new em(s, (o, l) => this.onKeyframesResolved(o, l), n, r, i), this.resolver.scheduleResolve();
  }
  initPlayback(t, n) {
    let { duration: r = 300, times: i, ease: s, type: o, motionValue: l, name: a, startTime: u } = this.options;
    if (!l.owner || !l.owner.current)
      return !1;
    if (typeof s == "string" && ys() && B1(s) && (s = lm[s]), O1(this.options)) {
      const { onComplete: f, onUpdate: d, motionValue: g, element: y, ...v } = this.options, S = z1(t, v);
      t = S.keyframes, t.length === 1 && (t[1] = t[0]), r = S.duration, i = S.times, s = S.ease, o = "keyframes";
    }
    const c = j1(l.owner.current, a, t, { ...this.options, duration: r, times: i, ease: s });
    return c.startTime = u ?? this.calcStartTime(), this.pendingTimeline ? (Nc(c, this.pendingTimeline), this.pendingTimeline = void 0) : c.onfinish = () => {
      const { onComplete: f } = this.options;
      l.set(Ws(t, this.options, n)), f && f(), this.cancel(), this.resolveFinishedPromise();
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
    return /* @__PURE__ */ ct(n);
  }
  get time() {
    const { resolved: t } = this;
    if (!t)
      return 0;
    const { animation: n } = t;
    return /* @__PURE__ */ ct(n.currentTime || 0);
  }
  set time(t) {
    const { resolved: n } = this;
    if (!n)
      return;
    const { animation: r } = n;
    r.currentTime = /* @__PURE__ */ ut(t);
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
        return Re;
      const { animation: r } = n;
      Nc(r, t);
    }
    return Re;
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
      const { motionValue: u, onUpdate: c, onComplete: f, element: d, ...g } = this.options, y = new hu({
        ...g,
        keyframes: r,
        duration: i,
        type: s,
        ease: o,
        times: l,
        isGenerator: !0
      }), v = /* @__PURE__ */ ut(this.time);
      u.setWithVelocity(y.sample(v - ws).value, y.sample(v).value, ws);
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
    return F1() && r && _1.has(r) && /**
     * If we're outputting values to onUpdate then we can't use WAAPI as there's
     * no way to read the value from WAAPI every frame.
     */
    !a && !u && !i && s !== "mirror" && o !== 0 && l !== "inertia";
  }
}
const U1 = {
  type: "spring",
  stiffness: 500,
  damping: 25,
  restSpeed: 10
}, $1 = (e) => ({
  type: "spring",
  stiffness: 550,
  damping: e === 0 ? 2 * Math.sqrt(550) : 30,
  restSpeed: 10
}), W1 = {
  type: "keyframes",
  duration: 0.8
}, K1 = {
  type: "keyframes",
  ease: [0.25, 0.1, 0.35, 1],
  duration: 0.3
}, H1 = (e, { keyframes: t }) => t.length > 2 ? W1 : fn.has(e) ? e.startsWith("scale") ? $1(t[1]) : U1 : K1;
function G1({ when: e, delay: t, delayChildren: n, staggerChildren: r, staggerDirection: i, repeat: s, repeatType: o, repeatDelay: l, from: a, elapsed: u, ...c }) {
  return !!Object.keys(c).length;
}
const pu = (e, t, n, r = {}, i, s) => (o) => {
  const l = ba(r, e) || {}, a = l.delay || r.delay || 0;
  let { elapsed: u = 0 } = r;
  u = u - /* @__PURE__ */ ut(a);
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
  G1(l) || (c = {
    ...c,
    ...H1(e, c)
  }), c.duration && (c.duration = /* @__PURE__ */ ut(c.duration)), c.repeatDelay && (c.repeatDelay = /* @__PURE__ */ ut(c.repeatDelay)), c.from !== void 0 && (c.keyframes[0] = c.from);
  let f = !1;
  if ((c.type === !1 || c.duration === 0 && !c.repeatDelay) && (c.duration = 0, c.delay === 0 && (f = !0)), f && !s && t.get() !== void 0) {
    const d = Ws(c.keyframes, l);
    if (d !== void 0)
      return U.update(() => {
        c.onUpdate(d), c.onComplete();
      }), new f0([]);
  }
  return !s && Xc.supports(c) ? new Xc(c) : new hu(c);
};
function Q1({ protectedKeys: e, needsAnimating: t }, n) {
  const r = e.hasOwnProperty(n) && t[n] !== !0;
  return t[n] = !1, r;
}
function am(e, t, { delay: n = 0, transitionOverride: r, type: i } = {}) {
  var s;
  let { transition: o = e.getDefaultTransition(), transitionEnd: l, ...a } = t;
  r && (o = r);
  const u = [], c = i && e.animationState && e.animationState.getState()[i];
  for (const f in a) {
    const d = e.getValue(f, (s = e.latestValues[f]) !== null && s !== void 0 ? s : null), g = a[f];
    if (g === void 0 || c && Q1(c, f))
      continue;
    const y = {
      delay: n,
      ...ba(o || {}, f)
    };
    let v = !1;
    if (window.MotionHandoffAnimation) {
      const p = Lp(e);
      if (p) {
        const h = window.MotionHandoffAnimation(p, f, U);
        h !== null && (y.startTime = h, v = !0);
      }
    }
    Rl(e, f), d.start(pu(f, d, g, e.shouldReduceMotion && Mp.has(f) ? { type: !1 } : y, e, v));
    const S = d.animation;
    S && u.push(S);
  }
  return l && Promise.all(u).then(() => {
    U.update(() => {
      l && C0(e, l);
    });
  }), u;
}
function jl(e, t, n = {}) {
  var r;
  const i = $s(e, t, n.type === "exit" ? (r = e.presenceContext) === null || r === void 0 ? void 0 : r.custom : void 0);
  let { transition: s = e.getDefaultTransition() || {} } = i || {};
  n.transitionOverride && (s = n.transitionOverride);
  const o = i ? () => Promise.all(am(e, i, n)) : () => Promise.resolve(), l = e.variantChildren && e.variantChildren.size ? (u = 0) => {
    const { delayChildren: c = 0, staggerChildren: f, staggerDirection: d } = s;
    return Y1(e, t, c + u, f, d, n);
  } : () => Promise.resolve(), { when: a } = s;
  if (a) {
    const [u, c] = a === "beforeChildren" ? [o, l] : [l, o];
    return u().then(() => c());
  } else
    return Promise.all([o(), l(n.delay)]);
}
function Y1(e, t, n = 0, r = 0, i = 1, s) {
  const o = [], l = (e.variantChildren.size - 1) * r, a = i === 1 ? (u = 0) => u * r : (u = 0) => l - u * r;
  return Array.from(e.variantChildren).sort(X1).forEach((u, c) => {
    u.notify("AnimationStart", t), o.push(jl(u, t, {
      ...s,
      delay: n + a(c)
    }).then(() => u.notify("AnimationComplete", t)));
  }), Promise.all(o);
}
function X1(e, t) {
  return e.sortNodePosition(t);
}
function Z1(e, t, n = {}) {
  e.notify("AnimationStart", t);
  let r;
  if (Array.isArray(t)) {
    const i = t.map((s) => jl(e, s, n));
    r = Promise.all(i);
  } else if (typeof t == "string")
    r = jl(e, t, n);
  else {
    const i = typeof t == "function" ? $s(e, t, n.custom) : t;
    r = Promise.all(am(e, i, n));
  }
  return r.then(() => {
    e.notify("AnimationComplete", t);
  });
}
const q1 = Ua.length;
function um(e) {
  if (!e)
    return;
  if (!e.isControllingVariants) {
    const n = e.parent ? um(e.parent) || {} : {};
    return e.props.initial !== void 0 && (n.initial = e.props.initial), n;
  }
  const t = {};
  for (let n = 0; n < q1; n++) {
    const r = Ua[n], i = e.props[r];
    (Gr(i) || i === !1) && (t[r] = i);
  }
  return t;
}
const J1 = [...Ba].reverse(), b1 = Ba.length;
function ex(e) {
  return (t) => Promise.all(t.map(({ animation: n, options: r }) => Z1(e, n, r)));
}
function tx(e) {
  let t = ex(e), n = Zc(), r = !0;
  const i = (a) => (u, c) => {
    var f;
    const d = $s(e, c, a === "exit" ? (f = e.presenceContext) === null || f === void 0 ? void 0 : f.custom : void 0);
    if (d) {
      const { transition: g, transitionEnd: y, ...v } = d;
      u = { ...u, ...v, ...y };
    }
    return u;
  };
  function s(a) {
    t = a(e);
  }
  function o(a) {
    const { props: u } = e, c = um(e.parent) || {}, f = [], d = /* @__PURE__ */ new Set();
    let g = {}, y = 1 / 0;
    for (let S = 0; S < b1; S++) {
      const p = J1[S], h = n[p], m = u[p] !== void 0 ? u[p] : c[p], x = Gr(m), w = p === a ? h.isActive : null;
      w === !1 && (y = S);
      let P = m === c[p] && m !== u[p] && x;
      if (P && r && e.manuallyAnimateOnMount && (P = !1), h.protectedKeys = { ...g }, // If it isn't active and hasn't *just* been set as inactive
      !h.isActive && w === null || // If we didn't and don't have any defined prop for this animation type
      !m && !h.prevProp || // Or if the prop doesn't define an animation
      Bs(m) || typeof m == "boolean")
        continue;
      const E = nx(h.prevProp, m);
      let k = E || // If we're making this variant active, we want to always make it active
      p === a && h.isActive && !P && x || // If we removed a higher-priority variant (i is in reverse order)
      S > y && x, _ = !1;
      const V = Array.isArray(m) ? m : [m];
      let ne = V.reduce(i(p), {});
      w === !1 && (ne = {});
      const { prevResolvedValues: yt = {} } = h, $t = {
        ...yt,
        ...ne
      }, Jn = (b) => {
        k = !0, d.has(b) && (_ = !0, d.delete(b)), h.needsAnimating[b] = !0;
        const A = e.getValue(b);
        A && (A.liveStyle = !1);
      };
      for (const b in $t) {
        const A = ne[b], L = yt[b];
        if (g.hasOwnProperty(b))
          continue;
        let N = !1;
        Cl(A) && Cl(L) ? N = !kp(A, L) : N = A !== L, N ? A != null ? Jn(b) : d.add(b) : A !== void 0 && d.has(b) ? Jn(b) : h.protectedKeys[b] = !0;
      }
      h.prevProp = m, h.prevResolvedValues = ne, h.isActive && (g = { ...g, ...ne }), r && e.blockInitialAnimation && (k = !1), k && (!(P && E) || _) && f.push(...V.map((b) => ({
        animation: b,
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
    let v = !!f.length;
    return r && (u.initial === !1 || u.initial === u.animate) && !e.manuallyAnimateOnMount && (v = !1), r = !1, v ? t(f) : Promise.resolve();
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
      n = Zc(), r = !0;
    }
  };
}
function nx(e, t) {
  return typeof t == "string" ? t !== e : Array.isArray(t) ? !kp(t, e) : !1;
}
function Ht(e = !1) {
  return {
    isActive: e,
    protectedKeys: {},
    needsAnimating: {},
    prevResolvedValues: {}
  };
}
function Zc() {
  return {
    animate: Ht(!0),
    whileInView: Ht(),
    whileHover: Ht(),
    whileTap: Ht(),
    whileDrag: Ht(),
    whileFocus: Ht(),
    exit: Ht()
  };
}
class Ut {
  constructor(t) {
    this.isMounted = !1, this.node = t;
  }
  update() {
  }
}
class rx extends Ut {
  /**
   * We dynamically generate the AnimationState manager as it contains a reference
   * to the underlying animation library. We only want to load that if we load this,
   * so people can optionally code split it out using the `m` component.
   */
  constructor(t) {
    super(t), t.animationState || (t.animationState = tx(t));
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
let ix = 0;
class sx extends Ut {
  constructor() {
    super(...arguments), this.id = ix++;
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
const ox = {
  animation: {
    Feature: rx
  },
  exit: {
    Feature: sx
  }
};
function Zr(e, t, n, r = { passive: !0 }) {
  return e.addEventListener(t, n, r), () => e.removeEventListener(t, n);
}
function si(e) {
  return {
    point: {
      x: e.pageX,
      y: e.pageY
    }
  };
}
const lx = (e) => (t) => nu(t) && e(t, si(t));
function Er(e, t, n, r) {
  return Zr(e, t, lx(n), r);
}
const qc = (e, t) => Math.abs(e - t);
function ax(e, t) {
  const n = qc(e.x, t.x), r = qc(e.y, t.y);
  return Math.sqrt(n ** 2 + r ** 2);
}
class cm {
  constructor(t, n, { transformPagePoint: r, contextWindow: i, dragSnapToOrigin: s = !1 } = {}) {
    if (this.startEvent = null, this.lastMoveEvent = null, this.lastMoveEventInfo = null, this.handlers = {}, this.contextWindow = window, this.updatePoint = () => {
      if (!(this.lastMoveEvent && this.lastMoveEventInfo))
        return;
      const f = Co(this.lastMoveEventInfo, this.history), d = this.startEvent !== null, g = ax(f.offset, { x: 0, y: 0 }) >= 3;
      if (!d && !g)
        return;
      const { point: y } = f, { timestamp: v } = le;
      this.history.push({ ...y, timestamp: v });
      const { onStart: S, onMove: p } = this.handlers;
      d || (S && S(this.lastMoveEvent, f), this.startEvent = this.lastMoveEvent), p && p(this.lastMoveEvent, f);
    }, this.handlePointerMove = (f, d) => {
      this.lastMoveEvent = f, this.lastMoveEventInfo = Po(d, this.transformPagePoint), U.update(this.updatePoint, !0);
    }, this.handlePointerUp = (f, d) => {
      this.end();
      const { onEnd: g, onSessionEnd: y, resumeAnimation: v } = this.handlers;
      if (this.dragSnapToOrigin && v && v(), !(this.lastMoveEvent && this.lastMoveEventInfo))
        return;
      const S = Co(f.type === "pointercancel" ? this.lastMoveEventInfo : Po(d, this.transformPagePoint), this.history);
      this.startEvent && g && g(f, S), y && y(f, S);
    }, !nu(t))
      return;
    this.dragSnapToOrigin = s, this.handlers = n, this.transformPagePoint = r, this.contextWindow = i || window;
    const o = si(t), l = Po(o, this.transformPagePoint), { point: a } = l, { timestamp: u } = le;
    this.history = [{ ...a, timestamp: u }];
    const { onSessionStart: c } = n;
    c && c(t, Co(l, this.history)), this.removeListeners = ii(Er(this.contextWindow, "pointermove", this.handlePointerMove), Er(this.contextWindow, "pointerup", this.handlePointerUp), Er(this.contextWindow, "pointercancel", this.handlePointerUp));
  }
  updateHandlers(t) {
    this.handlers = t;
  }
  end() {
    this.removeListeners && this.removeListeners(), Ft(this.updatePoint);
  }
}
function Po(e, t) {
  return t ? { point: t(e.point) } : e;
}
function Jc(e, t) {
  return { x: e.x - t.x, y: e.y - t.y };
}
function Co({ point: e }, t) {
  return {
    point: e,
    delta: Jc(e, fm(t)),
    offset: Jc(e, ux(t)),
    velocity: cx(t, 0.1)
  };
}
function ux(e) {
  return e[0];
}
function fm(e) {
  return e[e.length - 1];
}
function cx(e, t) {
  if (e.length < 2)
    return { x: 0, y: 0 };
  let n = e.length - 1, r = null;
  const i = fm(e);
  for (; n >= 0 && (r = e[n], !(i.timestamp - r.timestamp > /* @__PURE__ */ ut(t))); )
    n--;
  if (!r)
    return { x: 0, y: 0 };
  const s = /* @__PURE__ */ ct(i.timestamp - r.timestamp);
  if (s === 0)
    return { x: 0, y: 0 };
  const o = {
    x: (i.x - r.x) / s,
    y: (i.y - r.y) / s
  };
  return o.x === 1 / 0 && (o.x = 0), o.y === 1 / 0 && (o.y = 0), o;
}
const dm = 1e-4, fx = 1 - dm, dx = 1 + dm, hm = 0.01, hx = 0 - hm, px = 0 + hm;
function Me(e) {
  return e.max - e.min;
}
function mx(e, t, n) {
  return Math.abs(e - t) <= n;
}
function bc(e, t, n, r = 0.5) {
  e.origin = r, e.originPoint = K(t.min, t.max, e.origin), e.scale = Me(n) / Me(t), e.translate = K(n.min, n.max, e.origin) - e.originPoint, (e.scale >= fx && e.scale <= dx || isNaN(e.scale)) && (e.scale = 1), (e.translate >= hx && e.translate <= px || isNaN(e.translate)) && (e.translate = 0);
}
function Ar(e, t, n, r) {
  bc(e.x, t.x, n.x, r ? r.originX : void 0), bc(e.y, t.y, n.y, r ? r.originY : void 0);
}
function ef(e, t, n) {
  e.min = n.min + t.min, e.max = e.min + Me(t);
}
function gx(e, t, n) {
  ef(e.x, t.x, n.x), ef(e.y, t.y, n.y);
}
function tf(e, t, n) {
  e.min = t.min - n.min, e.max = e.min + Me(t);
}
function Rr(e, t, n) {
  tf(e.x, t.x, n.x), tf(e.y, t.y, n.y);
}
function yx(e, { min: t, max: n }, r) {
  return t !== void 0 && e < t ? e = r ? K(t, e, r.min) : Math.max(e, t) : n !== void 0 && e > n && (e = r ? K(n, e, r.max) : Math.min(e, n)), e;
}
function nf(e, t, n) {
  return {
    min: t !== void 0 ? e.min + t : void 0,
    max: n !== void 0 ? e.max + n - (e.max - e.min) : void 0
  };
}
function vx(e, { top: t, left: n, bottom: r, right: i }) {
  return {
    x: nf(e.x, n, i),
    y: nf(e.y, t, r)
  };
}
function rf(e, t) {
  let n = t.min - e.min, r = t.max - e.max;
  return t.max - t.min < e.max - e.min && ([n, r] = [r, n]), { min: n, max: r };
}
function xx(e, t) {
  return {
    x: rf(e.x, t.x),
    y: rf(e.y, t.y)
  };
}
function wx(e, t) {
  let n = 0.5;
  const r = Me(e), i = Me(t);
  return i > r ? n = /* @__PURE__ */ Wn(t.min, t.max - r, e.min) : r > i && (n = /* @__PURE__ */ Wn(e.min, e.max - i, t.min)), mt(0, 1, n);
}
function Sx(e, t) {
  const n = {};
  return t.min !== void 0 && (n.min = t.min - e.min), t.max !== void 0 && (n.max = t.max - e.min), n;
}
const Fl = 0.35;
function kx(e = Fl) {
  return e === !1 ? e = 0 : e === !0 && (e = Fl), {
    x: sf(e, "left", "right"),
    y: sf(e, "top", "bottom")
  };
}
function sf(e, t, n) {
  return {
    min: of(e, t),
    max: of(e, n)
  };
}
function of(e, t) {
  return typeof e == "number" ? e : e[t] || 0;
}
const lf = () => ({
  translate: 0,
  scale: 1,
  origin: 0,
  originPoint: 0
}), An = () => ({
  x: lf(),
  y: lf()
}), af = () => ({ min: 0, max: 0 }), Z = () => ({
  x: af(),
  y: af()
});
function _e(e) {
  return [e("x"), e("y")];
}
function pm({ top: e, left: t, right: n, bottom: r }) {
  return {
    x: { min: t, max: n },
    y: { min: e, max: r }
  };
}
function Tx({ x: e, y: t }) {
  return { top: t.min, right: e.max, bottom: t.max, left: e.min };
}
function Px(e, t) {
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
function Eo(e) {
  return e === void 0 || e === 1;
}
function Il({ scale: e, scaleX: t, scaleY: n }) {
  return !Eo(e) || !Eo(t) || !Eo(n);
}
function Yt(e) {
  return Il(e) || mm(e) || e.z || e.rotate || e.rotateX || e.rotateY || e.skewX || e.skewY;
}
function mm(e) {
  return uf(e.x) || uf(e.y);
}
function uf(e) {
  return e && e !== "0%";
}
function Ss(e, t, n) {
  const r = e - n, i = t * r;
  return n + i;
}
function cf(e, t, n, r, i) {
  return i !== void 0 && (e = Ss(e, i, r)), Ss(e, n, r) + t;
}
function Ol(e, t = 0, n = 1, r, i) {
  e.min = cf(e.min, t, n, r, i), e.max = cf(e.max, t, n, r, i);
}
function gm(e, { x: t, y: n }) {
  Ol(e.x, t.translate, t.scale, t.originPoint), Ol(e.y, n.translate, n.scale, n.originPoint);
}
const ff = 0.999999999999, df = 1.0000000000001;
function Cx(e, t, n, r = !1) {
  const i = n.length;
  if (!i)
    return;
  t.x = t.y = 1;
  let s, o;
  for (let l = 0; l < i; l++) {
    s = n[l], o = s.projectionDelta;
    const { visualElement: a } = s.options;
    a && a.props.style && a.props.style.display === "contents" || (r && s.options.layoutScroll && s.scroll && s !== s.root && Dn(e, {
      x: -s.scroll.offset.x,
      y: -s.scroll.offset.y
    }), o && (t.x *= o.x.scale, t.y *= o.y.scale, gm(e, o)), r && Yt(s.latestValues) && Dn(e, s.latestValues));
  }
  t.x < df && t.x > ff && (t.x = 1), t.y < df && t.y > ff && (t.y = 1);
}
function Rn(e, t) {
  e.min = e.min + t, e.max = e.max + t;
}
function hf(e, t, n, r, i = 0.5) {
  const s = K(e.min, e.max, i);
  Ol(e, t, n, s, r);
}
function Dn(e, t) {
  hf(e.x, t.x, t.scaleX, t.scale, t.originX), hf(e.y, t.y, t.scaleY, t.scale, t.originY);
}
function ym(e, t) {
  return pm(Px(e.getBoundingClientRect(), t));
}
function Ex(e, t, n) {
  const r = ym(e, n), { scroll: i } = t;
  return i && (Rn(r.x, i.offset.x), Rn(r.y, i.offset.y)), r;
}
const vm = ({ current: e }) => e ? e.ownerDocument.defaultView : null, Ax = /* @__PURE__ */ new WeakMap();
class Rx {
  constructor(t) {
    this.openDragLock = null, this.isDragging = !1, this.currentDirection = null, this.originPoint = { x: 0, y: 0 }, this.constraints = !1, this.hasMutatedConstraints = !1, this.elastic = Z(), this.visualElement = t;
  }
  start(t, { snapToCursor: n = !1 } = {}) {
    const { presenceContext: r } = this.visualElement;
    if (r && r.isPresent === !1)
      return;
    const i = (c) => {
      const { dragSnapToOrigin: f } = this.getProps();
      f ? this.pauseAnimation() : this.stopAnimation(), n && this.snapToCursor(si(c).point);
    }, s = (c, f) => {
      const { drag: d, dragPropagation: g, onDragStart: y } = this.getProps();
      if (d && !g && (this.openDragLock && this.openDragLock(), this.openDragLock = w0(d), !this.openDragLock))
        return;
      this.isDragging = !0, this.currentDirection = null, this.resolveConstraints(), this.visualElement.projection && (this.visualElement.projection.isAnimationBlocked = !0, this.visualElement.projection.target = void 0), _e((S) => {
        let p = this.getAxisMotionValue(S).get() || 0;
        if (tt.test(p)) {
          const { projection: h } = this.visualElement;
          if (h && h.layout) {
            const m = h.layout.layoutBox[S];
            m && (p = Me(m) * (parseFloat(p) / 100));
          }
        }
        this.originPoint[S] = p;
      }), y && U.postRender(() => y(c, f)), Rl(this.visualElement, "transform");
      const { animationState: v } = this.visualElement;
      v && v.setActive("whileDrag", !0);
    }, o = (c, f) => {
      const { dragPropagation: d, dragDirectionLock: g, onDirectionLock: y, onDrag: v } = this.getProps();
      if (!d && !this.openDragLock)
        return;
      const { offset: S } = f;
      if (g && this.currentDirection === null) {
        this.currentDirection = Dx(S), this.currentDirection !== null && y && y(this.currentDirection);
        return;
      }
      this.updateAxis("x", f.point, S), this.updateAxis("y", f.point, S), this.visualElement.render(), v && v(c, f);
    }, l = (c, f) => this.stop(c, f), a = () => _e((c) => {
      var f;
      return this.getAnimationState(c) === "paused" && ((f = this.getAxisMotionValue(c).animation) === null || f === void 0 ? void 0 : f.play());
    }), { dragSnapToOrigin: u } = this.getProps();
    this.panSession = new cm(t, {
      onSessionStart: i,
      onStart: s,
      onMove: o,
      onSessionEnd: l,
      resumeAnimation: a
    }, {
      transformPagePoint: this.visualElement.getTransformPagePoint(),
      dragSnapToOrigin: u,
      contextWindow: vm(this.visualElement)
    });
  }
  stop(t, n) {
    const r = this.isDragging;
    if (this.cancel(), !r)
      return;
    const { velocity: i } = n;
    this.startAnimation(i);
    const { onDragEnd: s } = this.getProps();
    s && U.postRender(() => s(t, n));
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
    if (!r || !Di(t, i, this.currentDirection))
      return;
    const s = this.getAxisMotionValue(t);
    let o = this.originPoint[t] + r[t];
    this.constraints && this.constraints[t] && (o = yx(o, this.constraints[t], this.elastic[t])), s.set(o);
  }
  resolveConstraints() {
    var t;
    const { dragConstraints: n, dragElastic: r } = this.getProps(), i = this.visualElement.projection && !this.visualElement.projection.layout ? this.visualElement.projection.measure(!1) : (t = this.visualElement.projection) === null || t === void 0 ? void 0 : t.layout, s = this.constraints;
    n && Cn(n) ? this.constraints || (this.constraints = this.resolveRefConstraints()) : n && i ? this.constraints = vx(i.layoutBox, n) : this.constraints = !1, this.elastic = kx(r), s !== this.constraints && i && this.constraints && !this.hasMutatedConstraints && _e((o) => {
      this.constraints !== !1 && this.getAxisMotionValue(o) && (this.constraints[o] = Sx(i.layoutBox[o], this.constraints[o]));
    });
  }
  resolveRefConstraints() {
    const { dragConstraints: t, onMeasureDragConstraints: n } = this.getProps();
    if (!t || !Cn(t))
      return !1;
    const r = t.current, { projection: i } = this.visualElement;
    if (!i || !i.layout)
      return !1;
    const s = Ex(r, i.root, this.visualElement.getTransformPagePoint());
    let o = xx(i.layout.layoutBox, s);
    if (n) {
      const l = n(Tx(o));
      this.hasMutatedConstraints = !!l, l && (o = pm(l));
    }
    return o;
  }
  startAnimation(t) {
    const { drag: n, dragMomentum: r, dragElastic: i, dragTransition: s, dragSnapToOrigin: o, onDragTransitionEnd: l } = this.getProps(), a = this.constraints || {}, u = _e((c) => {
      if (!Di(c, n, this.currentDirection))
        return;
      let f = a && a[c] || {};
      o && (f = { min: 0, max: 0 });
      const d = i ? 200 : 1e6, g = i ? 40 : 1e7, y = {
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
      return this.startAxisValueAnimation(c, y);
    });
    return Promise.all(u).then(l);
  }
  startAxisValueAnimation(t, n) {
    const r = this.getAxisMotionValue(t);
    return Rl(this.visualElement, t), r.start(pu(t, r, 0, n, this.visualElement, !1));
  }
  stopAnimation() {
    _e((t) => this.getAxisMotionValue(t).stop());
  }
  pauseAnimation() {
    _e((t) => {
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
    _e((n) => {
      const { drag: r } = this.getProps();
      if (!Di(n, r, this.currentDirection))
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
    if (!Cn(n) || !r || !this.constraints)
      return;
    this.stopAnimation();
    const i = { x: 0, y: 0 };
    _e((o) => {
      const l = this.getAxisMotionValue(o);
      if (l && this.constraints !== !1) {
        const a = l.get();
        i[o] = wx({ min: a, max: a }, this.constraints[o]);
      }
    });
    const { transformTemplate: s } = this.visualElement.getProps();
    this.visualElement.current.style.transform = s ? s({}, "") : "none", r.root && r.root.updateScroll(), r.updateLayout(), this.resolveConstraints(), _e((o) => {
      if (!Di(o, t, null))
        return;
      const l = this.getAxisMotionValue(o), { min: a, max: u } = this.constraints[o];
      l.set(K(a, u, i[o]));
    });
  }
  addListeners() {
    if (!this.visualElement.current)
      return;
    Ax.set(this.visualElement, this);
    const t = this.visualElement.current, n = Er(t, "pointerdown", (a) => {
      const { drag: u, dragListener: c = !0 } = this.getProps();
      u && c && this.start(a);
    }), r = () => {
      const { dragConstraints: a } = this.getProps();
      Cn(a) && a.current && (this.constraints = this.resolveRefConstraints());
    }, { projection: i } = this.visualElement, s = i.addEventListener("measure", r);
    i && !i.layout && (i.root && i.root.updateScroll(), i.updateLayout()), U.read(r);
    const o = Zr(window, "resize", () => this.scalePositionWithinConstraints()), l = i.addEventListener("didUpdate", ({ delta: a, hasLayoutChanged: u }) => {
      this.isDragging && u && (_e((c) => {
        const f = this.getAxisMotionValue(c);
        f && (this.originPoint[c] += a[c].translate, f.set(f.get() + a[c].translate));
      }), this.visualElement.render());
    });
    return () => {
      o(), n(), s(), l && l();
    };
  }
  getProps() {
    const t = this.visualElement.getProps(), { drag: n = !1, dragDirectionLock: r = !1, dragPropagation: i = !1, dragConstraints: s = !1, dragElastic: o = Fl, dragMomentum: l = !0 } = t;
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
function Di(e, t, n) {
  return (t === !0 || t === e) && (n === null || n === e);
}
function Dx(e, t = 10) {
  let n = null;
  return Math.abs(e.y) > t ? n = "y" : Math.abs(e.x) > t && (n = "x"), n;
}
class Mx extends Ut {
  constructor(t) {
    super(t), this.removeGroupControls = Re, this.removeListeners = Re, this.controls = new Rx(t);
  }
  mount() {
    const { dragControls: t } = this.node.getProps();
    t && (this.removeGroupControls = t.subscribe(this.controls)), this.removeListeners = this.controls.addListeners() || Re;
  }
  unmount() {
    this.removeGroupControls(), this.removeListeners();
  }
}
const pf = (e) => (t, n) => {
  e && U.postRender(() => e(t, n));
};
class Vx extends Ut {
  constructor() {
    super(...arguments), this.removePointerDownListener = Re;
  }
  onPointerDown(t) {
    this.session = new cm(t, this.createPanHandlers(), {
      transformPagePoint: this.node.getTransformPagePoint(),
      contextWindow: vm(this.node)
    });
  }
  createPanHandlers() {
    const { onPanSessionStart: t, onPanStart: n, onPan: r, onPanEnd: i } = this.node.getProps();
    return {
      onSessionStart: pf(t),
      onStart: pf(n),
      onMove: r,
      onEnd: (s, o) => {
        delete this.session, i && U.postRender(() => i(s, o));
      }
    };
  }
  mount() {
    this.removePointerDownListener = Er(this.node.current, "pointerdown", (t) => this.onPointerDown(t));
  }
  update() {
    this.session && this.session.updateHandlers(this.createPanHandlers());
  }
  unmount() {
    this.removePointerDownListener(), this.session && this.session.end();
  }
}
const Ki = {
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
function mf(e, t) {
  return t.max === t.min ? 0 : e / (t.max - t.min) * 100;
}
const lr = {
  correct: (e, t) => {
    if (!t.target)
      return e;
    if (typeof e == "string")
      if (M.test(e))
        e = parseFloat(e);
      else
        return e;
    const n = mf(e, t.target.x), r = mf(e, t.target.y);
    return `${n}% ${r}%`;
  }
}, Lx = {
  correct: (e, { treeScale: t, projectionDelta: n }) => {
    const r = e, i = It.parse(e);
    if (i.length > 5)
      return r;
    const s = It.createTransformer(e), o = typeof i[0] != "number" ? 1 : 0, l = n.x.scale * t.x, a = n.y.scale * t.y;
    i[0 + o] /= l, i[1 + o] /= a;
    const u = K(l, a, 0.5);
    return typeof i[2 + o] == "number" && (i[2 + o] /= u), typeof i[3 + o] == "number" && (i[3 + o] /= u), s(i);
  }
};
class Nx extends C.Component {
  /**
   * This only mounts projection nodes for components that
   * need measuring, we might want to do it for all components
   * in order to incorporate transforms
   */
  componentDidMount() {
    const { visualElement: t, layoutGroup: n, switchLayoutGroup: r, layoutId: i } = this.props, { projection: s } = t;
    bv(_x), s && (n.group && n.group.add(s), r && r.register && i && r.register(s), s.root.didUpdate(), s.addEventListener("animationComplete", () => {
      this.safeToRemove();
    }), s.setOptions({
      ...s.options,
      onExitComplete: () => this.safeToRemove()
    })), Ki.hasEverUpdated = !0;
  }
  getSnapshotBeforeUpdate(t) {
    const { layoutDependency: n, visualElement: r, drag: i, isPresent: s } = this.props, o = r.projection;
    return o && (o.isPresent = s, i || t.layoutDependency !== n || n === void 0 ? o.willUpdate() : this.safeToRemove(), t.isPresent !== s && (s ? o.promote() : o.relegate() || U.postRender(() => {
      const l = o.getStack();
      (!l || !l.members.length) && this.safeToRemove();
    }))), null;
  }
  componentDidUpdate() {
    const { projection: t } = this.props.visualElement;
    t && (t.root.didUpdate(), Wa.postRender(() => {
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
function xm(e) {
  const [t, n] = tp(), r = C.useContext(ja);
  return R.jsx(Nx, { ...e, layoutGroup: r, switchLayoutGroup: C.useContext(up), isPresent: t, safeToRemove: n });
}
const _x = {
  borderRadius: {
    ...lr,
    applyTo: [
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomLeftRadius",
      "borderBottomRightRadius"
    ]
  },
  borderTopLeftRadius: lr,
  borderTopRightRadius: lr,
  borderBottomLeftRadius: lr,
  borderBottomRightRadius: lr,
  boxShadow: Lx
};
function jx(e, t, n) {
  const r = pe(e) ? e : Yr(e);
  return r.start(pu("", r, t, n)), r.animation;
}
function Fx(e) {
  return e instanceof SVGElement && e.tagName !== "svg";
}
const Ix = (e, t) => e.depth - t.depth;
class Ox {
  constructor() {
    this.children = [], this.isDirty = !1;
  }
  add(t) {
    ru(this.children, t), this.isDirty = !0;
  }
  remove(t) {
    iu(this.children, t), this.isDirty = !0;
  }
  forEach(t) {
    this.isDirty && this.children.sort(Ix), this.isDirty = !1, this.children.forEach(t);
  }
}
function zx(e, t) {
  const n = nt.now(), r = ({ timestamp: i }) => {
    const s = i - n;
    s >= t && (Ft(r), e(s - t));
  };
  return U.read(r, !0), () => Ft(r);
}
const wm = ["TopLeft", "TopRight", "BottomLeft", "BottomRight"], Bx = wm.length, gf = (e) => typeof e == "string" ? parseFloat(e) : e, yf = (e) => typeof e == "number" || M.test(e);
function Ux(e, t, n, r, i, s) {
  i ? (e.opacity = K(
    0,
    // TODO Reinstate this if only child
    n.opacity !== void 0 ? n.opacity : 1,
    $x(r)
  ), e.opacityExit = K(t.opacity !== void 0 ? t.opacity : 1, 0, Wx(r))) : s && (e.opacity = K(t.opacity !== void 0 ? t.opacity : 1, n.opacity !== void 0 ? n.opacity : 1, r));
  for (let o = 0; o < Bx; o++) {
    const l = `border${wm[o]}Radius`;
    let a = vf(t, l), u = vf(n, l);
    if (a === void 0 && u === void 0)
      continue;
    a || (a = 0), u || (u = 0), a === 0 || u === 0 || yf(a) === yf(u) ? (e[l] = Math.max(K(gf(a), gf(u), r), 0), (tt.test(u) || tt.test(a)) && (e[l] += "%")) : e[l] = u;
  }
  (t.rotate || n.rotate) && (e.rotate = K(t.rotate || 0, n.rotate || 0, r));
}
function vf(e, t) {
  return e[t] !== void 0 ? e[t] : e.borderRadius;
}
const $x = /* @__PURE__ */ Sm(0, 0.5, zp), Wx = /* @__PURE__ */ Sm(0.5, 0.95, Re);
function Sm(e, t, n) {
  return (r) => r < e ? 0 : r > t ? 1 : n(/* @__PURE__ */ Wn(e, t, r));
}
function xf(e, t) {
  e.min = t.min, e.max = t.max;
}
function Ne(e, t) {
  xf(e.x, t.x), xf(e.y, t.y);
}
function wf(e, t) {
  e.translate = t.translate, e.scale = t.scale, e.originPoint = t.originPoint, e.origin = t.origin;
}
function Sf(e, t, n, r, i) {
  return e -= t, e = Ss(e, 1 / n, r), i !== void 0 && (e = Ss(e, 1 / i, r)), e;
}
function Kx(e, t = 0, n = 1, r = 0.5, i, s = e, o = e) {
  if (tt.test(t) && (t = parseFloat(t), t = K(o.min, o.max, t / 100) - o.min), typeof t != "number")
    return;
  let l = K(s.min, s.max, r);
  e === s && (l -= t), e.min = Sf(e.min, t, n, l, i), e.max = Sf(e.max, t, n, l, i);
}
function kf(e, t, [n, r, i], s, o) {
  Kx(e, t[n], t[r], t[i], t.scale, s, o);
}
const Hx = ["x", "scaleX", "originX"], Gx = ["y", "scaleY", "originY"];
function Tf(e, t, n, r) {
  kf(e.x, t, Hx, n ? n.x : void 0, r ? r.x : void 0), kf(e.y, t, Gx, n ? n.y : void 0, r ? r.y : void 0);
}
function Pf(e) {
  return e.translate === 0 && e.scale === 1;
}
function km(e) {
  return Pf(e.x) && Pf(e.y);
}
function Cf(e, t) {
  return e.min === t.min && e.max === t.max;
}
function Qx(e, t) {
  return Cf(e.x, t.x) && Cf(e.y, t.y);
}
function Ef(e, t) {
  return Math.round(e.min) === Math.round(t.min) && Math.round(e.max) === Math.round(t.max);
}
function Tm(e, t) {
  return Ef(e.x, t.x) && Ef(e.y, t.y);
}
function Af(e) {
  return Me(e.x) / Me(e.y);
}
function Rf(e, t) {
  return e.translate === t.translate && e.scale === t.scale && e.originPoint === t.originPoint;
}
class Yx {
  constructor() {
    this.members = [];
  }
  add(t) {
    ru(this.members, t), t.scheduleRender();
  }
  remove(t) {
    if (iu(this.members, t), t === this.prevLead && (this.prevLead = void 0), t === this.lead) {
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
function Xx(e, t, n) {
  let r = "";
  const i = e.x.translate / t.x, s = e.y.translate / t.y, o = n?.z || 0;
  if ((i || s || o) && (r = `translate3d(${i}px, ${s}px, ${o}px) `), (t.x !== 1 || t.y !== 1) && (r += `scale(${1 / t.x}, ${1 / t.y}) `), n) {
    const { transformPerspective: u, rotate: c, rotateX: f, rotateY: d, skewX: g, skewY: y } = n;
    u && (r = `perspective(${u}px) ${r}`), c && (r += `rotate(${c}deg) `), f && (r += `rotateX(${f}deg) `), d && (r += `rotateY(${d}deg) `), g && (r += `skewX(${g}deg) `), y && (r += `skewY(${y}deg) `);
  }
  const l = e.x.scale * t.x, a = e.y.scale * t.y;
  return (l !== 1 || a !== 1) && (r += `scale(${l}, ${a})`), r || "none";
}
const Xt = {
  type: "projectionFrame",
  totalNodes: 0,
  resolvedTargetDeltas: 0,
  recalculatedProjection: 0
}, mr = typeof window < "u" && window.MotionDebug !== void 0, Ao = ["", "X", "Y", "Z"], Zx = { visibility: "hidden" }, Df = 1e3;
let qx = 0;
function Ro(e, t, n, r) {
  const { latestValues: i } = t;
  i[e] && (n[e] = i[e], t.setStaticValue(e, 0), r && (r[e] = 0));
}
function Pm(e) {
  if (e.hasCheckedOptimisedAppear = !0, e.root === e)
    return;
  const { visualElement: t } = e.options;
  if (!t)
    return;
  const n = Lp(t);
  if (window.MotionHasOptimisedAnimation(n, "transform")) {
    const { layout: i, layoutId: s } = e.options;
    window.MotionCancelOptimisedAnimation(n, "transform", U, !(i || s));
  }
  const { parent: r } = e;
  r && !r.hasCheckedOptimisedAppear && Pm(r);
}
function Cm({ attachResizeListener: e, defaultParent: t, measureScroll: n, checkIsScrollRoot: r, resetTransform: i }) {
  return class {
    constructor(o = {}, l = t?.()) {
      this.id = qx++, this.animationId = 0, this.children = /* @__PURE__ */ new Set(), this.options = {}, this.isTreeAnimating = !1, this.isAnimationBlocked = !1, this.isLayoutDirty = !1, this.isProjectionDirty = !1, this.isSharedProjectionDirty = !1, this.isTransformDirty = !1, this.updateManuallyBlocked = !1, this.updateBlockedByResize = !1, this.isUpdating = !1, this.isSVG = !1, this.needsReset = !1, this.shouldResetTransform = !1, this.hasCheckedOptimisedAppear = !1, this.treeScale = { x: 1, y: 1 }, this.eventHandlers = /* @__PURE__ */ new Map(), this.hasTreeAnimated = !1, this.updateScheduled = !1, this.scheduleUpdate = () => this.update(), this.projectionUpdateScheduled = !1, this.checkUpdateFailed = () => {
        this.isUpdating && (this.isUpdating = !1, this.clearAllSnapshots());
      }, this.updateProjection = () => {
        this.projectionUpdateScheduled = !1, mr && (Xt.totalNodes = Xt.resolvedTargetDeltas = Xt.recalculatedProjection = 0), this.nodes.forEach(ew), this.nodes.forEach(sw), this.nodes.forEach(ow), this.nodes.forEach(tw), mr && window.MotionDebug.record(Xt);
      }, this.resolvedRelativeTargetAt = 0, this.hasProjected = !1, this.isVisible = !0, this.animationProgress = 0, this.sharedNodes = /* @__PURE__ */ new Map(), this.latestValues = o, this.root = l ? l.root || l : this, this.path = l ? [...l.path, l] : [], this.parent = l, this.depth = l ? l.depth + 1 : 0;
      for (let a = 0; a < this.path.length; a++)
        this.path[a].shouldResetTransform = !0;
      this.root === this && (this.nodes = new Ox());
    }
    addEventListener(o, l) {
      return this.eventHandlers.has(o) || this.eventHandlers.set(o, new su()), this.eventHandlers.get(o).add(l);
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
      this.isSVG = Fx(o), this.instance = o;
      const { layoutId: a, layout: u, visualElement: c } = this.options;
      if (c && !c.current && c.mount(o), this.root.nodes.add(this), this.parent && this.parent.children.add(this), l && (u || a) && (this.isLayoutDirty = !0), e) {
        let f;
        const d = () => this.root.updateBlockedByResize = !1;
        e(o, () => {
          this.root.updateBlockedByResize = !0, f && f(), f = zx(d, 250), Ki.hasAnimatedSinceResize && (Ki.hasAnimatedSinceResize = !1, this.nodes.forEach(Vf));
        });
      }
      a && this.root.registerSharedNode(a, this), this.options.animate !== !1 && c && (a || u) && this.addEventListener("didUpdate", ({ delta: f, hasLayoutChanged: d, hasRelativeTargetChanged: g, layout: y }) => {
        if (this.isTreeAnimationBlocked()) {
          this.target = void 0, this.relativeTarget = void 0;
          return;
        }
        const v = this.options.transition || c.getDefaultTransition() || fw, { onLayoutAnimationStart: S, onLayoutAnimationComplete: p } = c.getProps(), h = !this.targetLayout || !Tm(this.targetLayout, y) || g, m = !d && g;
        if (this.options.layoutRoot || this.resumeFrom && this.resumeFrom.instance || m || d && (h || !this.currentAnimation)) {
          this.resumeFrom && (this.resumingFrom = this.resumeFrom, this.resumingFrom.resumingFrom = void 0), this.setAnimationOrigin(f, m);
          const x = {
            ...ba(v, "layout"),
            onPlay: S,
            onComplete: p
          };
          (c.shouldReduceMotion || this.options.layoutRoot) && (x.delay = 0, x.type = !1), this.startAnimation(x);
        } else
          d || Vf(this), this.isLead() && this.options.onExitComplete && this.options.onExitComplete();
        this.targetLayout = y;
      });
    }
    unmount() {
      this.options.layoutId && this.willUpdate(), this.root.nodes.remove(this);
      const o = this.getStack();
      o && o.remove(this), this.parent && this.parent.children.delete(this), this.instance = void 0, Ft(this.updateProjection);
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
      this.isUpdateBlocked() || (this.isUpdating = !0, this.nodes && this.nodes.forEach(lw), this.animationId++);
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
      if (window.MotionCancelOptimisedAnimation && !this.hasCheckedOptimisedAppear && Pm(this), !this.root.isUpdating && this.root.startUpdate(), this.isLayoutDirty)
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
      this.isUpdating || this.nodes.forEach(rw), this.isUpdating = !1, this.nodes.forEach(iw), this.nodes.forEach(Jx), this.nodes.forEach(bx), this.clearAllSnapshots();
      const l = nt.now();
      le.delta = mt(0, 1e3 / 60, l - le.timestamp), le.timestamp = l, le.isProcessing = !0, vo.update.process(le), vo.preRender.process(le), vo.render.process(le), le.isProcessing = !1;
    }
    didUpdate() {
      this.updateScheduled || (this.updateScheduled = !0, Wa.read(this.scheduleUpdate));
    }
    clearAllSnapshots() {
      this.nodes.forEach(nw), this.sharedNodes.forEach(aw);
    }
    scheduleUpdateProjection() {
      this.projectionUpdateScheduled || (this.projectionUpdateScheduled = !0, U.preRender(this.updateProjection, !1, !0));
    }
    scheduleCheckAfterUnmount() {
      U.postRender(() => {
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
      this.layout = this.measure(!1), this.layoutCorrected = Z(), this.isLayoutDirty = !1, this.projectionDelta = void 0, this.notifyListeners("measure", this.layout.layoutBox);
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
      const o = this.isLayoutDirty || this.shouldResetTransform || this.options.alwaysMeasureLayout, l = this.projectionDelta && !km(this.projectionDelta), a = this.getTransformTemplate(), u = a ? a(this.latestValues, "") : void 0, c = u !== this.prevTransformTemplateValue;
      o && (l || Yt(this.latestValues) || c) && (i(this.instance, u), this.shouldResetTransform = !1, this.scheduleRender());
    }
    measure(o = !0) {
      const l = this.measurePageBox();
      let a = this.removeElementScroll(l);
      return o && (a = this.removeTransform(a)), dw(a), {
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
        return Z();
      const a = l.measureViewportBox();
      if (!(((o = this.scroll) === null || o === void 0 ? void 0 : o.wasRoot) || this.path.some(hw))) {
        const { scroll: c } = this.root;
        c && (Rn(a.x, c.offset.x), Rn(a.y, c.offset.y));
      }
      return a;
    }
    removeElementScroll(o) {
      var l;
      const a = Z();
      if (Ne(a, o), !((l = this.scroll) === null || l === void 0) && l.wasRoot)
        return a;
      for (let u = 0; u < this.path.length; u++) {
        const c = this.path[u], { scroll: f, options: d } = c;
        c !== this.root && f && d.layoutScroll && (f.wasRoot && Ne(a, o), Rn(a.x, f.offset.x), Rn(a.y, f.offset.y));
      }
      return a;
    }
    applyTransform(o, l = !1) {
      const a = Z();
      Ne(a, o);
      for (let u = 0; u < this.path.length; u++) {
        const c = this.path[u];
        !l && c.options.layoutScroll && c.scroll && c !== c.root && Dn(a, {
          x: -c.scroll.offset.x,
          y: -c.scroll.offset.y
        }), Yt(c.latestValues) && Dn(a, c.latestValues);
      }
      return Yt(this.latestValues) && Dn(a, this.latestValues), a;
    }
    removeTransform(o) {
      const l = Z();
      Ne(l, o);
      for (let a = 0; a < this.path.length; a++) {
        const u = this.path[a];
        if (!u.instance || !Yt(u.latestValues))
          continue;
        Il(u.latestValues) && u.updateSnapshot();
        const c = Z(), f = u.measurePageBox();
        Ne(c, f), Tf(l, u.latestValues, u.snapshot ? u.snapshot.layoutBox : void 0, c);
      }
      return Yt(this.latestValues) && Tf(l, this.latestValues), l;
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
          g && g.layout && this.animationProgress !== 1 ? (this.relativeParent = g, this.forceRelativeParentToResolveTarget(), this.relativeTarget = Z(), this.relativeTargetOrigin = Z(), Rr(this.relativeTargetOrigin, this.layout.layoutBox, g.layout.layoutBox), Ne(this.relativeTarget, this.relativeTargetOrigin)) : this.relativeParent = this.relativeTarget = void 0;
        }
        if (!(!this.relativeTarget && !this.targetDelta)) {
          if (this.target || (this.target = Z(), this.targetWithTransforms = Z()), this.relativeTarget && this.relativeTargetOrigin && this.relativeParent && this.relativeParent.target ? (this.forceRelativeParentToResolveTarget(), gx(this.target, this.relativeTarget, this.relativeParent.target)) : this.targetDelta ? (this.resumingFrom ? this.target = this.applyTransform(this.layout.layoutBox) : Ne(this.target, this.layout.layoutBox), gm(this.target, this.targetDelta)) : Ne(this.target, this.layout.layoutBox), this.attemptToResolveRelativeTarget) {
            this.attemptToResolveRelativeTarget = !1;
            const g = this.getClosestProjectingParent();
            g && !!g.resumingFrom == !!this.resumingFrom && !g.options.layoutScroll && g.target && this.animationProgress !== 1 ? (this.relativeParent = g, this.forceRelativeParentToResolveTarget(), this.relativeTarget = Z(), this.relativeTargetOrigin = Z(), Rr(this.relativeTargetOrigin, this.target, g.target), Ne(this.relativeTarget, this.relativeTargetOrigin)) : this.relativeParent = this.relativeTarget = void 0;
          }
          mr && Xt.resolvedTargetDeltas++;
        }
      }
    }
    getClosestProjectingParent() {
      if (!(!this.parent || Il(this.parent.latestValues) || mm(this.parent.latestValues)))
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
      Ne(this.layoutCorrected, this.layout.layoutBox);
      const d = this.treeScale.x, g = this.treeScale.y;
      Cx(this.layoutCorrected, this.treeScale, this.path, a), l.layout && !l.target && (this.treeScale.x !== 1 || this.treeScale.y !== 1) && (l.target = l.layout.layoutBox, l.targetWithTransforms = Z());
      const { target: y } = l;
      if (!y) {
        this.prevProjectionDelta && (this.createProjectionDeltas(), this.scheduleRender());
        return;
      }
      !this.projectionDelta || !this.prevProjectionDelta ? this.createProjectionDeltas() : (wf(this.prevProjectionDelta.x, this.projectionDelta.x), wf(this.prevProjectionDelta.y, this.projectionDelta.y)), Ar(this.projectionDelta, this.layoutCorrected, y, this.latestValues), (this.treeScale.x !== d || this.treeScale.y !== g || !Rf(this.projectionDelta.x, this.prevProjectionDelta.x) || !Rf(this.projectionDelta.y, this.prevProjectionDelta.y)) && (this.hasProjected = !0, this.scheduleRender(), this.notifyListeners("projectionUpdate", y)), mr && Xt.recalculatedProjection++;
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
      this.prevProjectionDelta = An(), this.projectionDelta = An(), this.projectionDeltaWithTransform = An();
    }
    setAnimationOrigin(o, l = !1) {
      const a = this.snapshot, u = a ? a.latestValues : {}, c = { ...this.latestValues }, f = An();
      (!this.relativeParent || !this.relativeParent.options.layoutRoot) && (this.relativeTarget = this.relativeTargetOrigin = void 0), this.attemptToResolveRelativeTarget = !l;
      const d = Z(), g = a ? a.source : void 0, y = this.layout ? this.layout.source : void 0, v = g !== y, S = this.getStack(), p = !S || S.members.length <= 1, h = !!(v && !p && this.options.crossfade === !0 && !this.path.some(cw));
      this.animationProgress = 0;
      let m;
      this.mixTargetDelta = (x) => {
        const w = x / 1e3;
        Lf(f.x, o.x, w), Lf(f.y, o.y, w), this.setTargetDelta(f), this.relativeTarget && this.relativeTargetOrigin && this.layout && this.relativeParent && this.relativeParent.layout && (Rr(d, this.layout.layoutBox, this.relativeParent.layout.layoutBox), uw(this.relativeTarget, this.relativeTargetOrigin, d, w), m && Qx(this.relativeTarget, m) && (this.isProjectionDirty = !1), m || (m = Z()), Ne(m, this.relativeTarget)), v && (this.animationValues = c, Ux(c, u, this.latestValues, w, h, p)), this.root.scheduleUpdateProjection(), this.scheduleRender(), this.animationProgress = w;
      }, this.mixTargetDelta(this.options.layoutRoot ? 1e3 : 0);
    }
    startAnimation(o) {
      this.notifyListeners("animationStart"), this.currentAnimation && this.currentAnimation.stop(), this.resumingFrom && this.resumingFrom.currentAnimation && this.resumingFrom.currentAnimation.stop(), this.pendingAnimation && (Ft(this.pendingAnimation), this.pendingAnimation = void 0), this.pendingAnimation = U.update(() => {
        Ki.hasAnimatedSinceResize = !0, this.currentAnimation = jx(0, Df, {
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
      this.currentAnimation && (this.mixTargetDelta && this.mixTargetDelta(Df), this.currentAnimation.stop()), this.completeAnimation();
    }
    applyTransformsToTarget() {
      const o = this.getLead();
      let { targetWithTransforms: l, target: a, layout: u, latestValues: c } = o;
      if (!(!l || !a || !u)) {
        if (this !== o && this.layout && u && Em(this.options.animationType, this.layout.layoutBox, u.layoutBox)) {
          a = this.target || Z();
          const f = Me(this.layout.layoutBox.x);
          a.x.min = o.target.x.min, a.x.max = a.x.min + f;
          const d = Me(this.layout.layoutBox.y);
          a.y.min = o.target.y.min, a.y.max = a.y.min + d;
        }
        Ne(l, a), Dn(l, c), Ar(this.projectionDeltaWithTransform, this.layoutCorrected, l, c);
      }
    }
    registerSharedNode(o, l) {
      this.sharedNodes.has(o) || this.sharedNodes.set(o, new Yx()), this.sharedNodes.get(o).add(l);
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
      a.z && Ro("z", o, u, this.animationValues);
      for (let c = 0; c < Ao.length; c++)
        Ro(`rotate${Ao[c]}`, o, u, this.animationValues), Ro(`skew${Ao[c]}`, o, u, this.animationValues);
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
        return Zx;
      const u = {
        visibility: ""
      }, c = this.getTransformTemplate();
      if (this.needsReset)
        return this.needsReset = !1, u.opacity = "", u.pointerEvents = $i(o?.pointerEvents) || "", u.transform = c ? c(this.latestValues, "") : "none", u;
      const f = this.getLead();
      if (!this.projectionDelta || !this.layout || !f.target) {
        const v = {};
        return this.options.layoutId && (v.opacity = this.latestValues.opacity !== void 0 ? this.latestValues.opacity : 1, v.pointerEvents = $i(o?.pointerEvents) || ""), this.hasProjected && !Yt(this.latestValues) && (v.transform = c ? c({}, "") : "none", this.hasProjected = !1), v;
      }
      const d = f.animationValues || f.latestValues;
      this.applyTransformsToTarget(), u.transform = Xx(this.projectionDeltaWithTransform, this.treeScale, d), c && (u.transform = c(d, u.transform));
      const { x: g, y } = this.projectionDelta;
      u.transformOrigin = `${g.origin * 100}% ${y.origin * 100}% 0`, f.animationValues ? u.opacity = f === this ? (a = (l = d.opacity) !== null && l !== void 0 ? l : this.latestValues.opacity) !== null && a !== void 0 ? a : 1 : this.preserveOpacity ? this.latestValues.opacity : d.opacityExit : u.opacity = f === this ? d.opacity !== void 0 ? d.opacity : "" : d.opacityExit !== void 0 ? d.opacityExit : 0;
      for (const v in gs) {
        if (d[v] === void 0)
          continue;
        const { correct: S, applyTo: p } = gs[v], h = u.transform === "none" ? d[v] : S(d[v], f);
        if (p) {
          const m = p.length;
          for (let x = 0; x < m; x++)
            u[p[x]] = h;
        } else
          u[v] = h;
      }
      return this.options.layoutId && (u.pointerEvents = f === this ? $i(o?.pointerEvents) || "" : "none"), u;
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
function Jx(e) {
  e.updateLayout();
}
function bx(e) {
  var t;
  const n = ((t = e.resumeFrom) === null || t === void 0 ? void 0 : t.snapshot) || e.snapshot;
  if (e.isLead() && e.layout && n && e.hasListeners("didUpdate")) {
    const { layoutBox: r, measuredBox: i } = e.layout, { animationType: s } = e.options, o = n.source !== e.layout.source;
    s === "size" ? _e((f) => {
      const d = o ? n.measuredBox[f] : n.layoutBox[f], g = Me(d);
      d.min = r[f].min, d.max = d.min + g;
    }) : Em(s, n.layoutBox, r) && _e((f) => {
      const d = o ? n.measuredBox[f] : n.layoutBox[f], g = Me(r[f]);
      d.max = d.min + g, e.relativeTarget && !e.currentAnimation && (e.isProjectionDirty = !0, e.relativeTarget[f].max = e.relativeTarget[f].min + g);
    });
    const l = An();
    Ar(l, r, n.layoutBox);
    const a = An();
    o ? Ar(a, e.applyTransform(i, !0), n.measuredBox) : Ar(a, r, n.layoutBox);
    const u = !km(l);
    let c = !1;
    if (!e.resumeFrom) {
      const f = e.getClosestProjectingParent();
      if (f && !f.resumeFrom) {
        const { snapshot: d, layout: g } = f;
        if (d && g) {
          const y = Z();
          Rr(y, n.layoutBox, d.layoutBox);
          const v = Z();
          Rr(v, r, g.layoutBox), Tm(y, v) || (c = !0), f.options.layoutRoot && (e.relativeTarget = v, e.relativeTargetOrigin = y, e.relativeParent = f);
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
function ew(e) {
  mr && Xt.totalNodes++, e.parent && (e.isProjecting() || (e.isProjectionDirty = e.parent.isProjectionDirty), e.isSharedProjectionDirty || (e.isSharedProjectionDirty = !!(e.isProjectionDirty || e.parent.isProjectionDirty || e.parent.isSharedProjectionDirty)), e.isTransformDirty || (e.isTransformDirty = e.parent.isTransformDirty));
}
function tw(e) {
  e.isProjectionDirty = e.isSharedProjectionDirty = e.isTransformDirty = !1;
}
function nw(e) {
  e.clearSnapshot();
}
function Mf(e) {
  e.clearMeasurements();
}
function rw(e) {
  e.isLayoutDirty = !1;
}
function iw(e) {
  const { visualElement: t } = e.options;
  t && t.getProps().onBeforeLayoutMeasure && t.notify("BeforeLayoutMeasure"), e.resetTransform();
}
function Vf(e) {
  e.finishAnimation(), e.targetDelta = e.relativeTarget = e.target = void 0, e.isProjectionDirty = !0;
}
function sw(e) {
  e.resolveTargetDelta();
}
function ow(e) {
  e.calcProjection();
}
function lw(e) {
  e.resetSkewAndRotation();
}
function aw(e) {
  e.removeLeadSnapshot();
}
function Lf(e, t, n) {
  e.translate = K(t.translate, 0, n), e.scale = K(t.scale, 1, n), e.origin = t.origin, e.originPoint = t.originPoint;
}
function Nf(e, t, n, r) {
  e.min = K(t.min, n.min, r), e.max = K(t.max, n.max, r);
}
function uw(e, t, n, r) {
  Nf(e.x, t.x, n.x, r), Nf(e.y, t.y, n.y, r);
}
function cw(e) {
  return e.animationValues && e.animationValues.opacityExit !== void 0;
}
const fw = {
  duration: 0.45,
  ease: [0.4, 0, 0.1, 1]
}, _f = (e) => typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().includes(e), jf = _f("applewebkit/") && !_f("chrome/") ? Math.round : Re;
function Ff(e) {
  e.min = jf(e.min), e.max = jf(e.max);
}
function dw(e) {
  Ff(e.x), Ff(e.y);
}
function Em(e, t, n) {
  return e === "position" || e === "preserve-aspect" && !mx(Af(t), Af(n), 0.2);
}
function hw(e) {
  var t;
  return e !== e.root && ((t = e.scroll) === null || t === void 0 ? void 0 : t.wasRoot);
}
const pw = Cm({
  attachResizeListener: (e, t) => Zr(e, "resize", t),
  measureScroll: () => ({
    x: document.documentElement.scrollLeft || document.body.scrollLeft,
    y: document.documentElement.scrollTop || document.body.scrollTop
  }),
  checkIsScrollRoot: () => !0
}), Do = {
  current: void 0
}, Am = Cm({
  measureScroll: (e) => ({
    x: e.scrollLeft,
    y: e.scrollTop
  }),
  defaultParent: () => {
    if (!Do.current) {
      const e = new pw({});
      e.mount(window), e.setOptions({ layoutScroll: !0 }), Do.current = e;
    }
    return Do.current;
  },
  resetTransform: (e, t) => {
    e.style.transform = t !== void 0 ? t : "none";
  },
  checkIsScrollRoot: (e) => window.getComputedStyle(e).position === "fixed"
}), mw = {
  pan: {
    Feature: Vx
  },
  drag: {
    Feature: Mx,
    ProjectionNode: Am,
    MeasureLayout: xm
  }
};
function If(e, t, n) {
  const { props: r } = e;
  e.animationState && r.whileHover && e.animationState.setActive("whileHover", n === "Start");
  const i = "onHover" + n, s = r[i];
  s && U.postRender(() => s(t, si(t)));
}
class gw extends Ut {
  mount() {
    const { current: t } = this.node;
    t && (this.unmount = m0(t, (n) => (If(this.node, n, "Start"), (r) => If(this.node, r, "End"))));
  }
  unmount() {
  }
}
class yw extends Ut {
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
    this.unmount = ii(Zr(this.node.current, "focus", () => this.onFocus()), Zr(this.node.current, "blur", () => this.onBlur()));
  }
  unmount() {
  }
}
function Of(e, t, n) {
  const { props: r } = e;
  e.animationState && r.whileTap && e.animationState.setActive("whileTap", n === "Start");
  const i = "onTap" + (n === "End" ? "" : n), s = r[i];
  s && U.postRender(() => s(t, si(t)));
}
class vw extends Ut {
  mount() {
    const { current: t } = this.node;
    t && (this.unmount = x0(t, (n) => (Of(this.node, n, "Start"), (r, { success: i }) => Of(this.node, r, i ? "End" : "Cancel")), { useGlobalTarget: this.node.props.globalTapTarget }));
  }
  unmount() {
  }
}
const zl = /* @__PURE__ */ new WeakMap(), Mo = /* @__PURE__ */ new WeakMap(), xw = (e) => {
  const t = zl.get(e.target);
  t && t(e);
}, ww = (e) => {
  e.forEach(xw);
};
function Sw({ root: e, ...t }) {
  const n = e || document;
  Mo.has(n) || Mo.set(n, {});
  const r = Mo.get(n), i = JSON.stringify(t);
  return r[i] || (r[i] = new IntersectionObserver(ww, { root: e, ...t })), r[i];
}
function kw(e, t, n) {
  const r = Sw(t);
  return zl.set(e, n), r.observe(e), () => {
    zl.delete(e), r.unobserve(e);
  };
}
const Tw = {
  some: 0,
  all: 1
};
class Pw extends Ut {
  constructor() {
    super(...arguments), this.hasEnteredView = !1, this.isInView = !1;
  }
  startObserver() {
    this.unmount();
    const { viewport: t = {} } = this.node.getProps(), { root: n, margin: r, amount: i = "some", once: s } = t, o = {
      root: n ? n.current : void 0,
      rootMargin: r,
      threshold: typeof i == "number" ? i : Tw[i]
    }, l = (a) => {
      const { isIntersecting: u } = a;
      if (this.isInView === u || (this.isInView = u, s && !u && this.hasEnteredView))
        return;
      u && (this.hasEnteredView = !0), this.node.animationState && this.node.animationState.setActive("whileInView", u);
      const { onViewportEnter: c, onViewportLeave: f } = this.node.getProps(), d = u ? c : f;
      d && d(a);
    };
    return kw(this.node.current, o, l);
  }
  mount() {
    this.startObserver();
  }
  update() {
    if (typeof IntersectionObserver > "u")
      return;
    const { props: t, prevProps: n } = this.node;
    ["amount", "margin", "root"].some(Cw(t, n)) && this.startObserver();
  }
  unmount() {
  }
}
function Cw({ viewport: e = {} }, { viewport: t = {} } = {}) {
  return (n) => e[n] !== t[n];
}
const Ew = {
  inView: {
    Feature: Pw
  },
  tap: {
    Feature: vw
  },
  focus: {
    Feature: yw
  },
  hover: {
    Feature: gw
  }
}, Aw = {
  layout: {
    ProjectionNode: Am,
    MeasureLayout: xm
  }
}, Bl = { current: null }, Rm = { current: !1 };
function Rw() {
  if (Rm.current = !0, !!Oa)
    if (window.matchMedia) {
      const e = window.matchMedia("(prefers-reduced-motion)"), t = () => Bl.current = e.matches;
      e.addListener(t), t();
    } else
      Bl.current = !1;
}
const Dw = [...bp, de, It], Mw = (e) => Dw.find(Jp(e)), zf = /* @__PURE__ */ new WeakMap();
function Vw(e, t, n) {
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
const Bf = [
  "AnimationStart",
  "AnimationComplete",
  "Update",
  "BeforeLayoutMeasure",
  "LayoutMeasure",
  "LayoutAnimationStart",
  "LayoutAnimationComplete"
];
class Lw {
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
    this.current = null, this.children = /* @__PURE__ */ new Set(), this.isVariantNode = !1, this.isControllingVariants = !1, this.shouldReduceMotion = null, this.values = /* @__PURE__ */ new Map(), this.KeyframeResolver = fu, this.features = {}, this.valueSubscriptions = /* @__PURE__ */ new Map(), this.prevMotionValues = {}, this.events = {}, this.propEventSubscriptions = {}, this.notifyUpdate = () => this.notify("Update", this.latestValues), this.render = () => {
      this.current && (this.triggerBuild(), this.renderInstance(this.current, this.renderState, this.props.style, this.projection));
    }, this.renderScheduledAt = 0, this.scheduleRender = () => {
      const g = nt.now();
      this.renderScheduledAt < g && (this.renderScheduledAt = g, U.render(this.render, !1, !0));
    };
    const { latestValues: a, renderState: u, onUpdate: c } = o;
    this.onUpdate = c, this.latestValues = a, this.baseTarget = { ...a }, this.initialValues = n.initial ? { ...a } : {}, this.renderState = u, this.parent = t, this.props = n, this.presenceContext = r, this.depth = t ? t.depth + 1 : 0, this.reducedMotionConfig = i, this.options = l, this.blockInitialAnimation = !!s, this.isControllingVariants = Us(n), this.isVariantNode = lp(n), this.isVariantNode && (this.variantChildren = /* @__PURE__ */ new Set()), this.manuallyAnimateOnMount = !!(t && t.current);
    const { willChange: f, ...d } = this.scrapeMotionValuesFromProps(n, {}, this);
    for (const g in d) {
      const y = d[g];
      a[g] !== void 0 && pe(y) && y.set(a[g], !1);
    }
  }
  mount(t) {
    this.current = t, zf.set(t, this), this.projection && !this.projection.instance && this.projection.mount(t), this.parent && this.isVariantNode && !this.isControllingVariants && (this.removeFromVariantTree = this.parent.addVariantChild(this)), this.values.forEach((n, r) => this.bindToMotionValue(r, n)), Rm.current || Rw(), this.shouldReduceMotion = this.reducedMotionConfig === "never" ? !1 : this.reducedMotionConfig === "always" ? !0 : Bl.current, this.parent && this.parent.children.add(this), this.update(this.props, this.presenceContext);
  }
  unmount() {
    zf.delete(this.current), this.projection && this.projection.unmount(), Ft(this.notifyUpdate), Ft(this.render), this.valueSubscriptions.forEach((t) => t()), this.valueSubscriptions.clear(), this.removeFromVariantTree && this.removeFromVariantTree(), this.parent && this.parent.children.delete(this);
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
    const r = fn.has(t), i = n.on("change", (l) => {
      this.latestValues[t] = l, this.props.onUpdate && U.preRender(this.notifyUpdate), r && this.projection && (this.projection.isTransformDirty = !0);
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
    for (t in Kn) {
      const n = Kn[t];
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
    return this.current ? this.measureInstanceViewportBox(this.current, this.props) : Z();
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
    for (let r = 0; r < Bf.length; r++) {
      const i = Bf[r];
      this.propEventSubscriptions[i] && (this.propEventSubscriptions[i](), delete this.propEventSubscriptions[i]);
      const s = "on" + i, o = t[s];
      o && (this.propEventSubscriptions[i] = this.on(i, o));
    }
    this.prevMotionValues = Vw(this, this.scrapeMotionValuesFromProps(t, this.prevProps, this), this.prevMotionValues), this.handleChildMotionValue && this.handleChildMotionValue(), this.onUpdate && this.onUpdate(this);
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
    return i != null && (typeof i == "string" && (Zp(i) || Up(i)) ? i = parseFloat(i) : !Mw(i) && It.test(n) && (i = Qp(t, n)), this.setBaseTarget(t, pe(i) ? i.get() : i)), pe(i) ? i.get() : i;
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
      const o = Ha(this.props, r, (n = this.presenceContext) === null || n === void 0 ? void 0 : n.custom);
      o && (i = o[t]);
    }
    if (r && i !== void 0)
      return i;
    const s = this.getBaseTargetFromProps(this.props, t);
    return s !== void 0 && !pe(s) ? s : this.initialValues[t] !== void 0 && i === void 0 ? void 0 : this.baseTarget[t];
  }
  on(t, n) {
    return this.events[t] || (this.events[t] = new su()), this.events[t].add(n);
  }
  notify(t, ...n) {
    this.events[t] && this.events[t].notify(...n);
  }
}
class Dm extends Lw {
  constructor() {
    super(...arguments), this.KeyframeResolver = em;
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
function Nw(e) {
  return window.getComputedStyle(e);
}
class _w extends Dm {
  constructor() {
    super(...arguments), this.type = "html", this.renderInstance = gp;
  }
  readValueFromInstance(t, n) {
    if (fn.has(n)) {
      const r = cu(n);
      return r && r.default || 0;
    } else {
      const r = Nw(t), i = (hp(n) ? r.getPropertyValue(n) : r[n]) || 0;
      return typeof i == "string" ? i.trim() : i;
    }
  }
  measureInstanceViewportBox(t, { transformPagePoint: n }) {
    return ym(t, n);
  }
  build(t, n, r) {
    Ya(t, n, r.transformTemplate);
  }
  scrapeMotionValuesFromProps(t, n, r) {
    return Ja(t, n, r);
  }
}
class jw extends Dm {
  constructor() {
    super(...arguments), this.type = "svg", this.isSVGTag = !1, this.measureInstanceViewportBox = Z;
  }
  getBaseTargetFromProps(t, n) {
    return t[n];
  }
  readValueFromInstance(t, n) {
    if (fn.has(n)) {
      const r = cu(n);
      return r && r.default || 0;
    }
    return n = yp.has(n) ? n : $a(n), t.getAttribute(n);
  }
  scrapeMotionValuesFromProps(t, n, r) {
    return wp(t, n, r);
  }
  build(t, n, r) {
    Xa(t, n, this.isSVGTag, r.transformTemplate);
  }
  renderInstance(t, n, r, i) {
    vp(t, n, r, i);
  }
  mount(t) {
    this.isSVGTag = qa(t.tagName), super.mount(t);
  }
}
const Fw = (e, t) => Ka(e) ? new jw(t) : new _w(t, {
  allowProjection: e !== C.Fragment
}), Iw = /* @__PURE__ */ a0({
  ...ox,
  ...Ew,
  ...mw,
  ...Aw
}, Fw), Ye = /* @__PURE__ */ Tv(Iw);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Ow = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), Mm = (...e) => e.filter((t, n, r) => !!t && t.trim() !== "" && r.indexOf(t) === n).join(" ").trim();
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
var zw = {
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
const Bw = C.forwardRef(
  ({
    color: e = "currentColor",
    size: t = 24,
    strokeWidth: n = 2,
    absoluteStrokeWidth: r,
    className: i = "",
    children: s,
    iconNode: o,
    ...l
  }, a) => C.createElement(
    "svg",
    {
      ref: a,
      ...zw,
      width: t,
      height: t,
      stroke: e,
      strokeWidth: r ? Number(n) * 24 / Number(t) : n,
      className: Mm("lucide", i),
      ...l
    },
    [
      ...o.map(([u, c]) => C.createElement(u, c)),
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
  const n = C.forwardRef(
    ({ className: r, ...i }, s) => C.createElement(Bw, {
      ref: s,
      iconNode: t,
      className: Mm(`lucide-${Ow(e)}`, r),
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
const Uw = qn("Bell", [
  ["path", { d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", key: "1qo2s2" }],
  ["path", { d: "M10.3 21a1.94 1.94 0 0 0 3.4 0", key: "qgo35s" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const $w = qn("Pause", [
  ["rect", { x: "14", y: "4", width: "4", height: "16", rx: "1", key: "zuxfzm" }],
  ["rect", { x: "6", y: "4", width: "4", height: "16", rx: "1", key: "1okwgv" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Ww = qn("Play", [
  ["polygon", { points: "6 3 20 12 6 21 6 3", key: "1oa8hb" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Kw = qn("Plus", [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Hw = qn("RotateCcw", [
  ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }]
]);
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Gw = qn("X", [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
]), Qw = [
  ["--tm-bg", "--theme-canvas"],
  ["--tm-surface", "--theme-surface"],
  ["--tm-fg", "--theme-ink"],
  ["--tm-dim", "--theme-ink-dim"],
  ["--tm-faint", "--theme-muted"],
  ["--tm-border", "--theme-border"],
  ["--tm-accent", "--theme-accent"],
  ["--tm-accent-fg", "--theme-accent-fg"]
], Yw = [
  ["--tm-font-digit", "--theme-font-code"]
];
function Xw(e, t) {
  const n = getComputedStyle(document.documentElement);
  for (const [r, i] of [...Qw, ...Yw]) {
    if (!t) {
      e.style.removeProperty(r);
      continue;
    }
    const s = n.getPropertyValue(i).trim();
    s && e.style.setProperty(r, s);
  }
}
function Zw(e) {
  const t = new MutationObserver(e);
  return t.observe(document.documentElement, {
    attributes: !0,
    attributeFilter: ["data-mode", "data-contrast", "style", "class"]
  }), () => t.disconnect();
}
function qw() {
  const [e, t] = C.useState(() => /* @__PURE__ */ new Date()), [n, r] = C.useState(!1);
  return C.useEffect(() => {
    const i = setInterval(() => t(/* @__PURE__ */ new Date()), 1e4);
    return () => clearInterval(i);
  }, []), /* @__PURE__ */ R.jsx(
    "button",
    {
      type: "button",
      className: "tm-clock",
      "data-dimmed": n,
      onClick: () => r((i) => !i),
      title: n ? "Show clock" : "Dim clock",
      children: e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
  );
}
const Jw = [15, 25, 30, 45, 60, 90, 120];
function bw(e) {
  if (e < 60) return `${e}m`;
  const t = e / 60;
  return Number.isInteger(t) ? `${t}h` : `${t}h`;
}
function eS({
  totalSeconds: e,
  onSelect: t,
  onStart: n
}) {
  const [r, i] = C.useState(""), s = Math.round(e / 60);
  return /* @__PURE__ */ R.jsxs(
    Ye.div,
    {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.05 },
      style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 18 },
      children: [
        /* @__PURE__ */ R.jsx("span", { className: "tm-label", children: "Focus duration" }),
        /* @__PURE__ */ R.jsx("div", { className: "tm-presets", children: Jw.map((o) => /* @__PURE__ */ R.jsx(
          "button",
          {
            type: "button",
            className: "tm-preset",
            "data-selected": !r && s === o,
            onClick: () => {
              i(""), t(o);
            },
            children: bw(o)
          },
          o
        )) }),
        /* @__PURE__ */ R.jsx("div", { className: "tm-row", children: /* @__PURE__ */ R.jsx(
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
          }
        ) }),
        /* @__PURE__ */ R.jsx("button", { type: "button", className: "tm-primary", onClick: n, children: "Start focus" })
      ]
    }
  );
}
function tS({
  reminder: e,
  onDismiss: t
}) {
  return /* @__PURE__ */ R.jsx(
    Ye.div,
    {
      className: "tm-alert",
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.25 },
      children: /* @__PURE__ */ R.jsxs(
        Ye.div,
        {
          className: "tm-alert-card",
          initial: { scale: 0.94, y: 10 },
          animate: { scale: 1, y: 0 },
          transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
          children: [
            /* @__PURE__ */ R.jsx(
              Ye.div,
              {
                className: "tm-alert-icon",
                animate: { scale: [1, 1.08, 1] },
                transition: { repeat: 1 / 0, duration: 1.6 },
                children: "⏰"
              }
            ),
            /* @__PURE__ */ R.jsxs("div", { children: [
              /* @__PURE__ */ R.jsx("div", { style: { fontSize: 17, fontWeight: 600, marginBottom: 3 }, children: e.label }),
              /* @__PURE__ */ R.jsx("div", { className: "tm-reminder-sub", children: "Timer paused until you dismiss this" })
            ] }),
            /* @__PURE__ */ R.jsx("button", { type: "button", className: "tm-primary", style: { width: "100%" }, onClick: t, children: "Done" })
          ]
        }
      )
    }
  );
}
function nS({
  reminders: e,
  onAdd: t,
  onRemove: n
}) {
  const [r, i] = C.useState(""), [s, o] = C.useState("30"), [l, a] = C.useState(!1), u = () => {
    const f = Number.parseInt(s, 10);
    !r.trim() || !Number.isFinite(f) || f <= 0 || (t(r, f), i(""), o("30"), a(!1));
  }, c = (f) => f.stopPropagation();
  return /* @__PURE__ */ R.jsxs(
    Ye.div,
    {
      className: "tm-reminders",
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.12 },
      children: [
        /* @__PURE__ */ R.jsxs("div", { className: "tm-reminders-head", children: [
          /* @__PURE__ */ R.jsxs("span", { className: "tm-label", style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [
            /* @__PURE__ */ R.jsx(Uw, { size: 12 }),
            "Reminders"
          ] }),
          l ? null : /* @__PURE__ */ R.jsxs(
            "button",
            {
              type: "button",
              className: "tm-ghost",
              style: { display: "inline-flex", alignItems: "center", gap: 4 },
              onClick: () => a(!0),
              children: [
                /* @__PURE__ */ R.jsx(Kw, { size: 12 }),
                "Add"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ R.jsxs(Pl, { mode: "popLayout", children: [
          l ? /* @__PURE__ */ R.jsxs(
            Ye.div,
            {
              className: "tm-add",
              initial: { opacity: 0, height: 0 },
              animate: { opacity: 1, height: "auto" },
              exit: { opacity: 0, height: 0 },
              transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
              children: [
                /* @__PURE__ */ R.jsx(
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
                  }
                ),
                /* @__PURE__ */ R.jsxs("div", { className: "tm-row", children: [
                  /* @__PURE__ */ R.jsx("span", { className: "tm-reminder-sub", children: "Every" }),
                  /* @__PURE__ */ R.jsx(
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
                    }
                  ),
                  /* @__PURE__ */ R.jsx("span", { className: "tm-reminder-sub", children: "min" })
                ] }),
                /* @__PURE__ */ R.jsxs("div", { className: "tm-row", style: { marginTop: 2 }, children: [
                  /* @__PURE__ */ R.jsx(
                    "button",
                    {
                      type: "button",
                      className: "tm-primary",
                      style: { flex: 1, padding: "8px 0", fontSize: 13 },
                      onClick: u,
                      children: "Add"
                    }
                  ),
                  /* @__PURE__ */ R.jsx(
                    "button",
                    {
                      type: "button",
                      className: "tm-circle",
                      style: { width: "auto", height: "auto", padding: "8px 16px", borderRadius: 999 },
                      onClick: () => a(!1),
                      children: /* @__PURE__ */ R.jsx("span", { style: { fontSize: 13 }, children: "Cancel" })
                    }
                  )
                ] })
              ]
            },
            "add"
          ) : null,
          e.map((f) => /* @__PURE__ */ R.jsxs(
            Ye.div,
            {
              className: "tm-reminder",
              initial: { opacity: 0, x: -6 },
              animate: { opacity: 1, x: 0 },
              exit: { opacity: 0, x: 6 },
              transition: { duration: 0.2 },
              children: [
                /* @__PURE__ */ R.jsxs("div", { style: { display: "flex", flexDirection: "column" }, children: [
                  /* @__PURE__ */ R.jsx("span", { className: "tm-reminder-label", children: f.label }),
                  /* @__PURE__ */ R.jsxs("span", { className: "tm-reminder-sub", children: [
                    "Every ",
                    f.intervalMinutes,
                    " min"
                  ] })
                ] }),
                /* @__PURE__ */ R.jsx(
                  "button",
                  {
                    type: "button",
                    className: "tm-ghost",
                    onClick: () => n(f.id),
                    title: "Remove reminder",
                    children: /* @__PURE__ */ R.jsx(Gw, { size: 13 })
                  }
                )
              ]
            },
            f.id
          ))
        ] }),
        e.length === 0 && !l ? /* @__PURE__ */ R.jsx("p", { className: "tm-reminder-sub", style: { textAlign: "center", padding: "8px 0" }, children: "No reminders set" }) : null
      ]
    }
  );
}
function ar(e) {
  return e.toString().padStart(2, "0");
}
function rS({
  remainingSeconds: e,
  phase: t
}) {
  const n = Math.floor(e / 3600), r = Math.floor(e % 3600 / 60), i = e % 60, s = n > 0 ? `${ar(n)}:${ar(r)}:${ar(i)}` : `${ar(r)}:${ar(i)}`;
  return /* @__PURE__ */ R.jsx(
    Ye.span,
    {
      className: "tm-digits",
      "data-state": t,
      initial: { opacity: 0, scale: 0.96 },
      animate: { opacity: 1, scale: 1 },
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
      children: s
    }
  );
}
function iS({ engine: e }) {
  const t = C.useCallback((l) => e.subscribe(l), [e]), n = C.useCallback(() => e.snapshot(), [e]), r = C.useSyncExternalStore(t, n), i = C.useRef(null);
  C.useEffect(() => {
    const l = i.current;
    if (!l) return;
    const a = () => Xw(l, r.inheritTheme);
    return a(), r.inheritTheme ? Zw(a) : void 0;
  }, [r.inheritTheme]);
  const s = r.activeReminderId != null ? r.reminders.find((l) => l.id === r.activeReminderId) ?? null : null, o = r.phase === "idle";
  return /* @__PURE__ */ R.jsxs("div", { className: "agent-code-timer", ref: i, children: [
    /* @__PURE__ */ R.jsx(qw, {}),
    /* @__PURE__ */ R.jsx(rS, { remainingSeconds: r.remainingSeconds, phase: r.phase }),
    /* @__PURE__ */ R.jsx(Pl, { mode: "wait", children: o ? /* @__PURE__ */ R.jsxs(
      Ye.div,
      {
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.2 },
        style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: "100%" },
        children: [
          /* @__PURE__ */ R.jsx(
            eS,
            {
              totalSeconds: r.totalSeconds,
              onSelect: (l) => e.setDuration(l),
              onStart: () => e.start()
            }
          ),
          /* @__PURE__ */ R.jsx(
            nS,
            {
              reminders: r.reminders,
              onAdd: (l, a) => e.addReminder(l, a),
              onRemove: (l) => e.removeReminder(l)
            }
          )
        ]
      },
      "setup"
    ) : /* @__PURE__ */ R.jsxs(
      Ye.div,
      {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.25 },
        style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
        children: [
          /* @__PURE__ */ R.jsxs("div", { className: "tm-row", children: [
            r.phase === "running" ? /* @__PURE__ */ R.jsx(
              "button",
              {
                type: "button",
                className: "tm-circle",
                onClick: () => e.pause(),
                title: "Pause",
                children: /* @__PURE__ */ R.jsx($w, { size: 17 })
              }
            ) : null,
            r.phase === "paused" ? /* @__PURE__ */ R.jsx(
              "button",
              {
                type: "button",
                className: "tm-circle",
                onClick: () => e.resume(),
                title: "Resume",
                children: /* @__PURE__ */ R.jsx(Ww, { size: 17, style: { marginLeft: 2 } })
              }
            ) : null,
            /* @__PURE__ */ R.jsx("button", { type: "button", className: "tm-circle", onClick: () => e.reset(), title: "Reset", children: /* @__PURE__ */ R.jsx(Hw, { size: 17 }) })
          ] }),
          r.phase === "finished" ? /* @__PURE__ */ R.jsx(
            Ye.span,
            {
              className: "tm-reminder-sub",
              initial: { opacity: 0 },
              animate: { opacity: 1 },
              children: "Session complete"
            }
          ) : null,
          r.reminders.length > 0 && r.phase !== "finished" ? /* @__PURE__ */ R.jsx("div", { className: "tm-presets", style: { marginTop: 2 }, children: r.reminders.map((l) => /* @__PURE__ */ R.jsxs("span", { className: "tm-chip", children: [
            l.label,
            " · ",
            l.intervalMinutes,
            "m"
          ] }, l.id)) }) : null
        ]
      },
      "running"
    ) }),
    /* @__PURE__ */ R.jsx("div", { className: "tm-footer", children: /* @__PURE__ */ R.jsxs(
      "button",
      {
        type: "button",
        className: "tm-toggle",
        "data-on": r.inheritTheme,
        onClick: () => e.setInheritTheme(!r.inheritTheme),
        title: r.inheritTheme ? "Using Agent Code theme — click for black & white" : "Using black & white — click to inherit Agent Code theme",
        children: [
          /* @__PURE__ */ R.jsx("span", { className: "tm-toggle-dot" }),
          r.inheritTheme ? "Inheriting theme" : "Black & white"
        ]
      }
    ) }),
    /* @__PURE__ */ R.jsx(Pl, { children: s ? /* @__PURE__ */ R.jsx(tS, { reminder: s, onDismiss: () => e.dismissReminder() }) : null })
  ] });
}
function sS(e) {
  return (t) => {
    Om();
    const n = ep(t);
    return n.render(/* @__PURE__ */ R.jsx(iS, { engine: e })), () => {
      queueMicrotask(() => n.unmount());
    };
  };
}
const Uf = "session";
let rt = null;
const { activate: lS, deactivate: aS } = {
  async activate(e) {
    const { api: t } = e;
    rt = new Fm({
      // Fire-and-forget with an explicit catch: a failed toast must never interrupt
      // the tick that produced it, and an unhandled rejection in a 250ms interval
      // would flood the console.
      notify: (n) => {
        t.ui.showToast(n).catch(() => {
        });
      },
      save: (n) => {
        t.storage.set(Uf, n).catch(() => {
        });
      }
    }), e.subscriptions.push(
      e.registerView("timer.main", sS(rt)),
      // `timer.open` has no handler — opening a declared view is the host's job.
      e.registerCommand("timer.start", () => rt?.start()),
      e.registerCommand("timer.pause", () => rt?.pause()),
      e.registerCommand("timer.reset", () => rt?.reset()),
      { dispose: () => rt?.dispose() }
    );
    try {
      const n = await t.storage.get(Uf);
      rt.restore(n);
    } catch {
    }
  },
  deactivate() {
    rt?.dispose(), rt = null, zm();
  }
};
export {
  lS as activate,
  aS as deactivate
};
