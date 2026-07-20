import { TimerEngine } from './engine/TimerEngine'
import type { PersistedTimer } from './engine/types'
import { removeStyles } from './theme/injectStyles'
import { mountTimerView } from './view/mount'
import type { ExtensionContext } from './types/agent-code'

const STORAGE_KEY = 'session'

let engine: TimerEngine | null = null

/**
 * Extension entry point.
 *
 * Activated on `onStartupFinished` (see agent-code.extension.json) rather than
 * on first view open, and that is the single most important decision in this
 * extension: a focus timer that only exists while its window is open is not a
 * focus timer. You start a 45-minute session and then CLOSE the window to go and
 * work. Activating at startup means the engine outlives every view, and a
 * restored session keeps counting from its persisted wall-clock deadline even
 * across an app restart.
 *
 * Nothing here touches the DOM. The engine is headless; the view is registered
 * and constructed only if and when the user opens it.
 */
export async function activate(context: ExtensionContext): Promise<void> {
  const { api } = context

  engine = new TimerEngine({
    notify: message => {
      // Fire-and-forget with an explicit catch: a failed toast must never
      // interrupt the tick that produced it, and an unhandled rejection in a
      // 250ms interval would flood the console.
      void api.ui.showToast(message).catch(() => {})
    },
    save: data => {
      void api.storage.set(STORAGE_KEY, data as unknown as never).catch(() => {})
    },
  })

  context.subscriptions.push(
    context.registerView('timer.main', mountTimerView(engine)),

    // `timer.open` has no handler here — opening a declared view is the host's
    // job, and a command whose only body is "show my own view" would just be a
    // worse version of the host's own routing. It is declared in the manifest so
    // it appears in the palette; the host resolves it to the view.
    context.registerCommand('timer.start', () => engine?.start()),
    context.registerCommand('timer.pause', () => engine?.pause()),
    context.registerCommand('timer.reset', () => engine?.reset()),

    { dispose: () => engine?.dispose() },
  )

  // Restore AFTER registration so a session that resumes mid-flight already has
  // its view registered and its command handlers bound — otherwise a reminder
  // firing during restore would have nowhere to go.
  try {
    const saved = await api.storage.get<never>(STORAGE_KEY)
    engine.restore(saved as PersistedTimer | undefined)
  } catch {
    // A corrupt or unreadable session is not fatal — start idle. The alternative
    // is an extension that refuses to activate because of one bad JSON file the
    // user has no obvious way to clear.
  }
}

export function deactivate(): void {
  engine?.dispose()
  engine = null
  removeStyles()
}
