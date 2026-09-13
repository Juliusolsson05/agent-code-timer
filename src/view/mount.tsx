import type { ViewContext } from 'agent-code-extension-api'
import { createRoot } from 'react-dom/client'

import type { TimerState } from '../engine/types'
import { injectStyles } from '../theme/injectStyles'
import { TimerView } from './TimerView'

/**
 * The ViewMount the host calls.
 *
 * Signature is `(element, context) => cleanup`, which is the whole API v2 view
 * contract: DOM and a runtime bridge in, disposer out. React remains an
 * implementation detail of this file.
 *
 * WHAT THIS DOES NOT DO is own any timer state. It creates a React root, renders
 * a subscriber to runtime publications, and on cleanup unmounts. The engine lives
 * in the separate background entry, so closing this document cannot stop it.
 */
export function mountTimerView(
  element: HTMLElement,
  context: ViewContext<TimerState>,
): () => void {
  // On mount rather than at module scope: the view module can be imported before
  // React commits its root, and tying CSS to mount keeps that ordering explicit.
  injectStyles()

  const root = createRoot(element)
  root.render(<TimerView context={context} />)

  return () => {
    // Deferred because unmounting a React root synchronously from inside
    // another React tree's commit phase warns loudly and can drop effects.
    // The host calls this from its own useEffect cleanup, which is exactly
    // that situation.
    queueMicrotask(() => root.unmount())
  }
}
