import { defineExtension } from 'agent-code-extension-api'
import type { ExtensionContext } from 'agent-code-extension-api'

import { TimerEngine } from './engine/TimerEngine'
import type { PersistedTimer } from './engine/types'
import { removeStyles } from './theme/injectStyles'
import { mountTimerView } from './view/mount'

const STORAGE_KEY = 'session'

let engine: TimerEngine | null = null

/**
 * Extension entry point (iframe model).
 *
 * Activated on `onStartupFinished` (see agent-code.extension.json) rather than on
 * first view open — the single most important decision here. A focus timer that
 * only exists while its window is open is not a focus timer: you start 45 minutes
 * and CLOSE the window to go work. Activating at startup means the engine outlives
 * every view, and a restored session keeps counting from its persisted wall-clock
 * deadline across an app restart.
 *
 * Nothing here touches the DOM. The engine is headless; the view is registered and
 * constructed only if and when the user opens it — now inside this extension's own
 * frame, mounted by the host into a modal or a pane. Wrapped in defineExtension for
 * full type-checking of the module against the SDK contract.
 */
export const { activate, deactivate } = defineExtension({
  async activate(context: ExtensionContext): Promise<void> {
    const { api } = context

    engine = new TimerEngine({
      // Fire-and-forget with an explicit catch: a failed toast must never interrupt
      // the tick that produced it, and an unhandled rejection in a 250ms interval
      // would flood the console.
      notify: message => {
        void api.ui.showToast(message).catch(() => {})
      },
      save: data => {
        void api.storage.set(STORAGE_KEY, data as unknown as never).catch(() => {})
      },
    })

    context.subscriptions.push(
      context.registerView('timer.main', mountTimerView(engine, api)),

      // `timer.open` has no handler — opening a declared view is the host's job.
      context.registerCommand('timer.start', () => engine?.start()),
      context.registerCommand('timer.pause', () => engine?.pause()),
      context.registerCommand('timer.reset', () => engine?.reset()),

      { dispose: () => engine?.dispose() },
    )

    // Restore AFTER registration so a session resuming mid-flight already has its
    // view registered and handlers bound before a reminder can fire.
    try {
      const saved = await api.storage.get<never>(STORAGE_KEY)
      engine.restore(saved as PersistedTimer | undefined)
    } catch {
      // A corrupt/unreadable session starts idle rather than refusing to activate.
    }
  },

  deactivate(): void {
    engine?.dispose()
    engine = null
    removeStyles()
  },
})
