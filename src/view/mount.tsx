import { createRoot } from 'react-dom/client'

import type { TimerEngine } from '../engine/TimerEngine'
import { injectStyles } from '../theme/injectStyles'
import { TimerView } from './TimerView'

/**
 * The ViewMount the host calls.
 *
 * Signature is `(element) => cleanup`, which is the whole extension UI contract:
 * DOM in, disposer out. React is an implementation detail of this file — the
 * host neither knows nor cares.
 *
 * WHAT THIS DOES NOT DO is own any timer state. It creates a React root, renders
 * a subscriber to the engine, and on cleanup unmounts. The engine keeps running:
 * closing the window mid-session is the normal case, not an edge case.
 */
export function mountTimerView(engine: TimerEngine): (element: HTMLElement) => () => void {
  return (element: HTMLElement) => {
    // On mount rather than at module scope: activation happens at startup for
    // every session, and injecting a stylesheet for a view the user may never
    // open would put dead CSS in the document on every launch.
    injectStyles()

    const root = createRoot(element)
    root.render(<TimerView engine={engine} />)

    return () => {
      // Deferred because unmounting a React root synchronously from inside
      // another React tree's commit phase warns loudly and can drop effects.
      // The host calls this from its own useEffect cleanup, which is exactly
      // that situation.
      queueMicrotask(() => root.unmount())
    }
  }
}
